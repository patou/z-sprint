import Phaser from 'phaser';
import { generateAllPixelTextures } from './pixelSprites';
import { soundFX } from './sound';
import { GameBridge, GameOverReason, GameStatus, HudSnapshot } from './types';

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 540;

const HORIZON_Y = 166;
const PLAYER_Z = 0.085;
const PERSPECTIVE_K = 4.0;
const P_MIN = 1 / (1 + PERSPECTIVE_K); // z = 1 -> 0.2

const BEST_SCORE_KEY = 'z_sprint_best_score';
const BEST_DIST_KEY = 'z_sprint_best_dist';

type ObstacleKind = 'hurdle' | 'cones' | 'barrier';
type CollectibleKind = 'coin' | 'stamina' | 'turbo';

interface TrackEntity {
  id: number;
  category: 'obstacle' | 'collectible';
  kind: ObstacleKind | CollectibleKind;
  lane: number; // -1, 0, 1
  z: number; // 1.0 (horizon) -> 0.0 (camera)
  elevation: number; // 0 on ground, > 0 for jump coin arcs
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  passed: boolean;
  collected: boolean;
}

interface SceneryProp {
  side: -1 | 1;
  z: number;
  kind: 'floodlight' | 'marker';
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
}

interface Afterimage {
  sprite: Phaser.GameObjects.Image;
  life: number;
}

interface FloatingLabel {
  text: Phaser.GameObjects.Text;
  vy: number;
  life: number;
}

interface CrowdDot {
  x: number;
  y: number;
  color: number;
  phase: number;
}

export class TrackScene extends Phaser.Scene {
  private bridge?: GameBridge;

  private status: GameStatus = 'TITLE_MENU';
  private gameOverReason: GameOverReason = null;

  // Graphics layers
  private skyGfx!: Phaser.GameObjects.Graphics;
  private trackGfx!: Phaser.GameObjects.Graphics;
  private speedLinesGfx!: Phaser.GameObjects.Graphics;
  private crowdDots: CrowdDot[] = [];

  // Player state
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private targetLane: number = 0; // -1, 0, 1
  private laneFloat: number = 0;
  private jumpHeight: number = 0;
  private jumpVel: number = 0;
  private isGrounded: boolean = true;
  private fastDropping: boolean = false;
  private bufferedLaneDelta: number = 0;
  private bufferedJumpTimer: number = 0;
  private turboTrailTimer: number = 0;
  private afterimages: Afterimage[] = [];
  private floatingLabels: FloatingLabel[] = [];

  // Run telemetry
  private score: number = 0;
  private distance: number = 0;
  private coins: number = 0;
  private stamina: number = 100;
  private readonly maxStamina: number = 100;
  private obstaclesCleared: number = 0;
  private baseSpeed: number = 0.44; // z-units per second
  private currentSpeed: number = 0.44;
  private speedRamp: number = 1;
  private stopTimer: number = 0;
  private invulnTimer: number = 0;
  private turboRemaining: number = 0;
  private readonly turboDuration: number = 5.0;
  private bestScore: number = 0;
  private bestDistance: number = 0;
  private isNewRecord: boolean = false;

  // Spawning & scrolling
  private scrollPhase: number = 0;
  private spawnTimer: number = 0;
  private patternCount: number = 0;
  private nextEntityId: number = 1;
  private entities: TrackEntity[] = [];
  private sceneryProps: SceneryProp[] = [];
  private clouds: Array<{ img: Phaser.GameObjects.Image; speed: number }> = [];

  // Input state
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private pointerDown: boolean = false;
  private hudEmitTimer: number = 0;
  private boundKeyDown?: (e: KeyboardEvent) => void;

  constructor(bridge?: GameBridge) {
    super({ key: 'TrackScene' });
    this.bridge = bridge;
  }

  public setBridge(bridge: GameBridge): void {
    this.bridge = bridge;
    this.emitHud(true);
  }

  public create(): void {
    this.loadRecords();
    generateAllPixelTextures(this);

    // Background sky & clouds (depths 0..3)
    this.skyGfx = this.add.graphics().setDepth(0);
    this.drawSkyBackdrop();
    this.createClouds();
    this.initCrowdDots();

    // Dynamic perspective track & stands (depth 5)
    this.trackGfx = this.add.graphics().setDepth(5);

    // Trackside floodlights & markers
    this.createSceneryProps();

    // Player shadow & sprite
    this.playerShadow = this.add
      .ellipse(GAME_WIDTH / 2, 490, 44, 14, 0x090d16, 0.55)
      .setDepth(58);

    this.playerSprite = this.add
      .sprite(GAME_WIDTH / 2, 480, 'runner_run0')
      .setOrigin(0.5, 1)
      .setDepth(60);
    this.playerSprite.play('runner_sprint');

    // Speed lines overlay for Turbo
    this.speedLinesGfx = this.add.graphics().setDepth(90);

    // Bind keyboard & touch swipe
    this.setupInputs();

    // Initial render for title backdrop
    this.renderPerspectiveTrack(0);
    this.updatePlayerVisuals(0);
    this.emitHud(true);
  }

  private loadRecords(): void {
    try {
      this.bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) || '0') || 0;
      this.bestDistance = Number(localStorage.getItem(BEST_DIST_KEY) || '0') || 0;
    } catch {
      this.bestScore = 0;
      this.bestDistance = 0;
    }
  }

  private saveRecords(): void {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(Math.floor(this.bestScore)));
      localStorage.setItem(BEST_DIST_KEY, String(Math.floor(this.bestDistance)));
    } catch {
      // Ignore storage failures
    }
  }

  private drawSkyBackdrop(): void {
    const g = this.skyGfx;
    g.clear();

    // Retro stepped stadium sunset/dusk sky
    const bands = [
      { y: 0, h: 36, color: 0x0f172a },
      { y: 36, h: 32, color: 0x1e293b },
      { y: 68, h: 32, color: 0x1d4ed8 },
      { y: 100, h: 34, color: 0x2563eb },
      { y: 134, h: 34, color: 0x38bdf8 },
    ];
    for (const b of bands) {
      g.fillStyle(b.color, 1);
      g.fillRect(0, b.y, GAME_WIDTH, b.h);
    }

    // Pixel stadium bowl silhouette in the distance
    g.fillStyle(0x1e293b, 1);
    g.fillRect(0, 118, GAME_WIDTH, 48);

    // Stadium roof awning & floodlight pylons on horizon
    g.fillStyle(0x334155, 1);
    g.fillRect(28, 108, GAME_WIDTH - 56, 12);
    g.fillStyle(0x0f172a, 1);
    g.fillRect(28, 120, GAME_WIDTH - 56, 6);

    // Distant bleachers tiers
    g.fillStyle(0x475569, 1);
    g.fillRect(40, 126, GAME_WIDTH - 80, 26);

    // Horizon stadium banner arch over the 3 lanes
    g.fillStyle(0x0f172a, 1);
    g.fillRect(172, 122, 136, 26);
    g.fillStyle(0xdc2626, 1);
    g.fillRect(176, 125, 128, 20);
    g.fillStyle(0x991b1b, 1);
    g.fillRect(176, 141, 128, 4);

    // Support pillars for the horizon arch
    g.fillStyle(0x64748b, 1);
    g.fillRect(176, 145, 6, 21);
    g.fillRect(298, 145, 6, 21);

    // Pixel scoreboard text on arch
    this.add
      .text(GAME_WIDTH / 2, 135, 'STADE Z-SPRINT', {
        fontFamily: 'Silkscreen, monospace',
        fontSize: '10px',
        color: '#FFFFFF',
      })
      .setOrigin(0.5)
      .setDepth(2);
  }

  private createClouds(): void {
    const positions = [
      { x: 64, y: 34, speed: 6, scale: 1.5 },
      { x: 240, y: 58, speed: 9, scale: 1.2 },
      { x: 390, y: 28, speed: 5, scale: 1.6 },
    ];
    for (const p of positions) {
      const img = this.add.image(p.x, p.y, 'prop_cloud').setScale(p.scale).setDepth(1);
      this.clouds.push({ img, speed: p.speed });
    }
  }

  private initCrowdDots(): void {
    const colors = [0xef4444, 0xfacc15, 0x38bdf8, 0xf8fafc, 0x4ade80, 0xf97316];
    this.crowdDots = [];
    for (let x = 48; x <= GAME_WIDTH - 48; x += 9) {
      if (x >= 170 && x <= 310) continue; // Keep clear behind banner arch
      for (let row = 0; row < 3; row++) {
        if ((x + row) % 2 === 0) {
          this.crowdDots.push({
            x,
            y: 129 + row * 7,
            color: colors[(x + row * 3) % colors.length],
            phase: (x * 0.37 + row * 1.4) % (Math.PI * 2),
          });
        }
      }
    }
  }

  private createSceneryProps(): void {
    const zSlots = [0.85, 0.55, 0.25];
    for (const z of zSlots) {
      for (const side of [-1, 1] as const) {
        const img = this.add.image(0, 0, 'prop_floodlight').setOrigin(0.5, 1).setDepth(12);
        this.sceneryProps.push({
          side,
          z,
          kind: 'floodlight',
          sprite: img,
        });
      }
    }
  }

  private setupInputs(): void {
    this.boundKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const lower = key.toLowerCase();
      const code = e.code;

      if (
        key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === ' ' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (e.repeat) return;

      if (key === 'ArrowLeft' || code === 'ArrowLeft' || lower === 'a' || lower === 'q') {
        this.handleLaneInput(-1);
        return;
      }

      if (key === 'ArrowRight' || code === 'ArrowRight' || lower === 'd') {
        this.handleLaneInput(1);
        return;
      }

      if (key === 'ArrowUp' || code === 'ArrowUp' || lower === 'w' || lower === 'z') {
        this.handleJumpInput();
        return;
      }

      if (key === 'ArrowDown' || code === 'ArrowDown' || lower === 's') {
        this.handleFastDropInput();
        return;
      }

      if (key === ' ' || code === 'Space') {
        if (this.status === 'TITLE_MENU' || this.status === 'GAME_OVER') {
          this.startGame();
        } else {
          this.handleJumpInput();
        }
        return;
      }

      if (key === 'Enter' || code === 'Enter') {
        if (this.status === 'TITLE_MENU' || this.status === 'GAME_OVER') {
          this.startGame();
        } else if (this.status === 'PAUSED') {
          this.togglePause();
        }
        return;
      }

      if (lower === 'p' || key === 'Escape' || code === 'Escape') {
        this.togglePause();
      }
    };

    window.addEventListener('keydown', this.boundKeyDown, { passive: false });

    const cleanupKeyboard = () => {
      if (this.boundKeyDown) {
        window.removeEventListener('keydown', this.boundKeyDown);
        this.boundKeyDown = undefined;
      }
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupKeyboard);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanupKeyboard);

    // Touch / pointer swipe gestures directly on canvas
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerStartX = pointer.x;
      this.pointerStartY = pointer.y;
      this.pointerDown = true;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.pointerDown || this.status !== 'PLAYING') return;
      const dx = pointer.x - this.pointerStartX;
      const dy = pointer.y - this.pointerStartY;
      const threshold = 24;

      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.handleLaneInput(dx > 0 ? 1 : -1);
        } else if (dy < 0) {
          this.handleJumpInput();
        } else {
          this.handleFastDropInput();
        }
        this.pointerDown = false;
      }
    });

    this.input.on('pointerup', () => {
      this.pointerDown = false;
    });
  }

  // Public methods callable from React UI buttons
  public startGame(): void {
    this.clearEntities();
    this.clearEffects();

    this.status = 'PLAYING';
    this.gameOverReason = null;
    this.score = 0;
    this.distance = 0;
    this.coins = 0;
    this.stamina = this.maxStamina;
    this.obstaclesCleared = 0;
    this.baseSpeed = 0.44;
    this.currentSpeed = this.baseSpeed;
    this.speedRamp = 1;
    this.stopTimer = 0;
    this.invulnTimer = 0;
    this.turboRemaining = 0;
    this.isNewRecord = false;

    this.targetLane = 0;
    this.laneFloat = 0;
    this.jumpHeight = 0;
    this.jumpVel = 0;
    this.isGrounded = true;
    this.fastDropping = false;
    this.bufferedLaneDelta = 0;
    this.bufferedJumpTimer = 0;

    this.scrollPhase = 0;
    this.spawnTimer = 0.7;
    this.patternCount = 0;

    this.playerSprite.clearTint();
    this.playerSprite.setAlpha(1);
    this.playerSprite.setAngle(0);
    this.playerSprite.play('runner_sprint', true);
    this.playerSprite.anims.timeScale = 1;

    soundFX.playStart();
    this.emitHud(true);
  }

  public togglePause(): void {
    if (this.status === 'PLAYING') {
      this.status = 'PAUSED';
      this.playerSprite.anims.pause();
      for (const ent of this.entities) {
        ent.sprite.anims.pause();
      }
      this.emitHud(true);
    } else if (this.status === 'PAUSED') {
      this.status = 'PLAYING';
      this.playerSprite.anims.resume();
      for (const ent of this.entities) {
        ent.sprite.anims.resume();
      }
      this.emitHud(true);
    }
  }

  private resumeFromStop(): void {
    if (this.stopTimer > 0 && this.stopTimer <= 0.62) {
      this.stopTimer = 0;
      this.speedRamp = Math.max(this.speedRamp, 0.25);
      if (this.isGrounded) {
        this.playerSprite.play('runner_sprint', true);
      }
      this.spawnFloatingLabel(this.playerSprite.x, this.playerSprite.y - 72, 'REPRISE !', '#4ADE80');
    }
  }

  public handleLaneInput(delta: number): void {
    if (this.status !== 'PLAYING') return;
    this.resumeFromStop();
    const next = Phaser.Math.Clamp(this.targetLane + delta, -1, 1);
    if (next !== this.targetLane) {
      this.targetLane = next;
      soundFX.playLaneSwitch();
      if (this.isGrounded) {
        this.spawnDustBurst(this.playerSprite.x, this.playerSprite.y - 4, 4);
      }
    } else {
      // Short buffer in case user tapped quickly
      this.bufferedLaneDelta = delta;
    }
  }

  public handleJumpInput(): void {
    if (this.status !== 'PLAYING') return;
    this.resumeFromStop();
    if (this.isGrounded) {
      this.executeJump();
    } else {
      this.bufferedJumpTimer = 0.14;
    }
  }

  public handleFastDropInput(): void {
    if (this.status !== 'PLAYING') return;
    if (!this.isGrounded && !this.fastDropping) {
      this.fastDropping = true;
      this.jumpVel = Math.min(this.jumpVel, -240);
      soundFX.playFastDrop();
    }
  }

  private executeJump(): void {
    this.isGrounded = false;
    this.fastDropping = false;
    this.jumpVel = 315;
    this.bufferedJumpTimer = 0;
    this.playerSprite.stop();
    this.playerSprite.setTexture('runner_jump');
    soundFX.playJump();

    // Small stamina cost for jumping (free during Turbo!)
    if (this.turboRemaining <= 0) {
      this.stamina = Math.max(0, this.stamina - 3.2);
    }
    this.spawnDustBurst(this.playerSprite.x, this.playerSprite.y - 2, 6);
  }

  // Perspective math: z=1 (horizon) -> t=0, z=0 (camera) -> t=1
  private project(z: number, lanePos: number, elevation = 0): {
    x: number;
    y: number;
    scale: number;
    halfTrack: number;
  } {
    const clampedZ = Phaser.Math.Clamp(z, -0.05, 1.05);
    const pRaw = 1 / (1 + clampedZ * PERSPECTIVE_K);
    const t = (pRaw - P_MIN) / (1 - P_MIN);

    const y = HORIZON_Y + t * (GAME_HEIGHT - HORIZON_Y);
    const halfTrack = 38 + t * (216 - 38);
    const laneWidth = (halfTrack * 2) / 3;
    const x = GAME_WIDTH / 2 + lanePos * laneWidth;
    const scale = 0.22 + t * 0.98;

    return {
      x,
      y: y - elevation * scale,
      scale,
      halfTrack,
    };
  }

  public update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);

    // Drift clouds gently even in title/pause
    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      if (c.img.x > GAME_WIDTH + 40) {
        c.img.x = -40;
      }
    }

    if (this.status === 'TITLE_MENU') {
      // Gentle idle attract-mode track scroll
      this.scrollPhase = (this.scrollPhase + dt * 0.35) % 1;
      this.renderPerspectiveTrack(time);
      this.updateSceneryProps(dt * 0.35);
      this.updatePlayerVisuals(dt);
      return;
    }

    if (this.status !== 'PLAYING') {
      this.updateEffects(dt);
      return;
    }

    // 1. Invulnerability, Stop recovery & Speed progression
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }

    this.baseSpeed = Math.min(0.86, 0.44 + this.distance * 0.00024);

    if (this.stopTimer > 0) {
      this.stopTimer = Math.max(0, this.stopTimer - dt);
      this.currentSpeed = 0;
      if (this.stopTimer === 0) {
        this.speedRamp = 0.2;
        if (this.isGrounded) {
          this.playerSprite.play('runner_sprint', true);
        }
        this.spawnFloatingLabel(this.playerSprite.x, this.playerSprite.y - 72, 'REPRISE !', '#4ADE80');
      }
    } else {
      if (this.speedRamp < 1) {
        this.speedRamp = Math.min(1, this.speedRamp + dt * 1.15);
      }

      if (this.turboRemaining > 0) {
        this.turboRemaining = Math.max(0, this.turboRemaining - dt);
        this.currentSpeed = this.baseSpeed * 1.56 * this.speedRamp;
        this.playerSprite.anims.timeScale = 1.55 * this.speedRamp;
      } else {
        this.currentSpeed = this.baseSpeed * this.speedRamp;
        this.playerSprite.anims.timeScale =
          (1 + (this.baseSpeed - 0.44) * 1.1) * Math.max(0.35, this.speedRamp);
      }

      // 2. Distance, Score & Stamina
      const metersDelta = this.currentSpeed * 38 * dt;
      this.distance += metersDelta;
      const multiplier = this.turboRemaining > 0 ? 2 : 1;
      this.score += metersDelta * 1.5 * multiplier;

      if (this.turboRemaining <= 0) {
        const drainRate = 3.1 + (this.baseSpeed - 0.44) * 3.8;
        this.stamina = Math.max(0, this.stamina - drainRate * dt);
        if (this.stamina <= 0) {
          this.triggerGameOver('STAMINA');
          return;
        }
      }

      // 3. Track scroll & scenery
      this.scrollPhase = (this.scrollPhase + this.currentSpeed * dt * 2.4) % 1;
      this.updateSceneryProps(this.currentSpeed * dt);
    }

    this.renderPerspectiveTrack(time);

    // 4. Player lane & jump physics
    this.laneFloat = Phaser.Math.Linear(this.laneFloat, this.targetLane, 1 - Math.exp(-22 * dt));

    if (!this.isGrounded) {
      const gravity = this.fastDropping ? 1950 : 980;
      this.jumpHeight += this.jumpVel * dt;
      this.jumpVel -= gravity * dt;

      if (!this.fastDropping && this.jumpVel < -40 && this.playerSprite.texture.key !== 'runner_fall') {
        this.playerSprite.setTexture('runner_fall');
      }

      if (this.jumpHeight <= 0) {
        this.jumpHeight = 0;
        this.jumpVel = 0;
        this.isGrounded = true;
        this.fastDropping = false;
        if (this.stopTimer <= 0) {
          this.playerSprite.play('runner_sprint', true);
        } else {
          this.playerSprite.setTexture('runner_hit');
        }
        this.spawnDustBurst(this.playerSprite.x, this.playerSprite.y - 3, 5);

        if (this.bufferedJumpTimer > 0) {
          this.executeJump();
        }
      }
    }

    if (this.bufferedJumpTimer > 0) {
      this.bufferedJumpTimer = Math.max(0, this.bufferedJumpTimer - dt);
    }

    if (this.bufferedLaneDelta !== 0 && Math.abs(this.laneFloat - this.targetLane) < 0.1) {
      const d = this.bufferedLaneDelta;
      this.bufferedLaneDelta = 0;
      this.handleLaneInput(d);
    }

    this.updatePlayerVisuals(dt);

    // Turbo afterimages & speed lines
    this.updateTurboVisuals(dt);

    // 5. Spawn patterns & move entities
    this.spawnTimer -= dt * (this.currentSpeed / 0.44);
    if (this.spawnTimer <= 0) {
      this.spawnNextPattern();
      const pacing = Phaser.Math.Clamp(0.95 - (this.baseSpeed - 0.44) * 0.72, 0.52, 0.95);
      this.spawnTimer = pacing;
    }

    this.updateEntities(dt);
    this.updateEffects(dt);

    // 6. Throttled HUD sync (~16 Hz)
    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.06) {
      this.hudEmitTimer = 0;
      this.emitHud(false);
    }
  }

  private updatePlayerVisuals(_dt: number): void {
    const proj = this.project(PLAYER_Z, this.laneFloat, this.jumpHeight);
    const groundProj = this.project(PLAYER_Z, this.laneFloat, 0);

    // Runner pixel texture is 28x36; scale up crisply at player depth
    const spriteScale = proj.scale * 2.15;
    this.playerSprite.setPosition(Math.round(proj.x), Math.round(proj.y));
    this.playerSprite.setScale(spriteScale);

    // Subtle lateral lean during lane changes
    const laneVel = this.targetLane - this.laneFloat;
    this.playerSprite.setAngle(Phaser.Math.Clamp(laneVel * 14, -9, 9));

    // Ground shadow shrinks smoothly with jump height
    const shadowScale = Phaser.Math.Clamp(1 - this.jumpHeight / 95, 0.45, 1);
    this.playerShadow.setPosition(Math.round(groundProj.x), Math.round(groundProj.y - 2));
    this.playerShadow.setScale(shadowScale, shadowScale);

    // Subtle red/gold pulse when stamina is critically low, stopped, or turbo active
    if (this.stopTimer > 0) {
      this.playerSprite.setTint(0xf87171);
      this.playerSprite.setAlpha(1);
    } else {
      if (this.invulnTimer > 0) {
        this.playerSprite.setAlpha(Math.floor(this.time.now / 75) % 2 === 0 ? 0.45 : 1);
      } else {
        this.playerSprite.setAlpha(1);
      }

      if (this.turboRemaining > 0) {
        this.playerSprite.setTint(0xffffff);
      } else if (this.stamina < 25 && Math.floor(this.time.now / 150) % 2 === 0) {
        this.playerSprite.setTint(0xfca5a5);
      } else {
        this.playerSprite.clearTint();
      }
    }
  }

  private updateTurboVisuals(dt: number): void {
    const g = this.speedLinesGfx;
    g.clear();

    if (this.turboRemaining <= 0) return;

    // Retro edge speed lines
    g.lineStyle(2, 0x38bdf8, 0.55);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? 0 : GAME_WIDTH;
      const dir = i % 2 === 0 ? 1 : -1;
      const y = 175 + ((i * 47 + Math.floor(this.time.now * 0.45)) % 340);
      const len = 16 + (i % 3) * 12;
      g.beginPath();
      g.moveTo(side, y);
      g.lineTo(side + dir * len, y + 6);
      g.strokePath();
    }

    // Cyan/gold pixel afterimage trail behind runner
    this.turboTrailTimer -= dt;
    if (this.turboTrailTimer <= 0) {
      this.turboTrailTimer = 0.045;
      const ghost = this.add
        .image(this.playerSprite.x, this.playerSprite.y, this.playerSprite.texture.key)
        .setOrigin(0.5, 1)
        .setScale(this.playerSprite.scaleX, this.playerSprite.scaleY)
        .setTint(this.turboRemaining % 0.3 < 0.15 ? 0x38bdf8 : 0xfacc15)
        .setAlpha(0.55)
        .setDepth(57);
      this.afterimages.push({ sprite: ghost, life: 0.18 });
    }
  }

  private updateSceneryProps(zDelta: number): void {
    for (const prop of this.sceneryProps) {
      prop.z -= zDelta;
      if (prop.z < 0.01) {
        prop.z += 0.95;
      }
      const proj = this.project(prop.z, prop.side * 1.92, 0);
      const s = proj.scale * 1.55;
      if (prop.sprite instanceof Phaser.GameObjects.Image) {
        prop.sprite.setPosition(Math.round(proj.x), Math.round(proj.y));
        prop.sprite.setScale(s);
        prop.sprite.setDepth(Math.floor((1 - prop.z) * 45) + 8);
      }
    }
  }

  private fillQuad(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number
  ): void {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineTo(x3, y3);
    g.lineTo(x4, y4);
    g.closePath();
    g.fillPath();
  }

  private renderPerspectiveTrack(time: number): void {
    const g = this.trackGfx;
    g.clear();

    // Draw perspective strips from horizon (z=1) to camera (z=0)
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const zFar = 1 - i / steps;
      const zNear = 1 - (i + 1) / steps;

      const far = this.project(zFar, 0);
      const near = this.project(zNear, 0);

      // Alternating track turf & tartan stripe parity using scrollPhase
      const bandIndex = Math.floor((zFar * 7 + this.scrollPhase) * 1.5);
      const isAlt = bandIndex % 2 === 0;

      // 1. Green Stadium Infield/Outfield Grass
      g.fillStyle(isAlt ? 0x15803d : 0x166534, 1);
      g.fillRect(0, Math.floor(far.y), GAME_WIDTH, Math.ceil(near.y - far.y) + 1);

      // 2. White outer concrete track curbs
      const curbExtraFar = far.scale * 12;
      const curbExtraNear = near.scale * 12;
      g.fillStyle(isAlt ? 0xe2e8f0 : 0xcbd5e1, 1);
      this.fillQuad(
        g,
        GAME_WIDTH / 2 - far.halfTrack - curbExtraFar,
        far.y,
        GAME_WIDTH / 2 + far.halfTrack + curbExtraFar,
        far.y,
        GAME_WIDTH / 2 + near.halfTrack + curbExtraNear,
        near.y + 1,
        GAME_WIDTH / 2 - near.halfTrack - curbExtraNear,
        near.y + 1
      );

      // 3. Red Terracotta Tartan 3-Lane Surface
      g.fillStyle(isAlt ? 0xb93829 : 0x9e2e21, 1);
      this.fillQuad(
        g,
        GAME_WIDTH / 2 - far.halfTrack,
        far.y,
        GAME_WIDTH / 2 + far.halfTrack,
        far.y,
        GAME_WIDTH / 2 + near.halfTrack,
        near.y + 1,
        GAME_WIDTH / 2 - near.halfTrack,
        near.y + 1
      );
    }

    // Crisp White Lane Lines (outer borders + 2 interior dividers for 3 lanes)
    const top = this.project(1, 0);
    const bot = this.project(0, 0);
    const laneFractions = [-1, -1 / 3, 1 / 3, 1];

    for (let idx = 0; idx < laneFractions.length; idx++) {
      const f = laneFractions[idx];
      const isOuter = idx === 0 || idx === 3;
      const topX = GAME_WIDTH / 2 + top.halfTrack * f;
      const botX = GAME_WIDTH / 2 + bot.halfTrack * f;

      g.lineStyle(isOuter ? 4 : 3, 0xf8fafc, isOuter ? 0.95 : 0.85);
      g.beginPath();
      g.moveTo(topX, top.y);
      g.lineTo(botX, bot.y);
      g.strokePath();
    }

    // Subtle trackside lane highlight under player's target lane
    const laneL = this.targetLane * (2 / 3) - 1 / 3;
    const laneR = this.targetLane * (2 / 3) + 1 / 3;
    const pTopL = GAME_WIDTH / 2 + top.halfTrack * laneL;
    const pTopR = GAME_WIDTH / 2 + top.halfTrack * laneR;
    const pBotL = GAME_WIDTH / 2 + bot.halfTrack * laneL;
    const pBotR = GAME_WIDTH / 2 + bot.halfTrack * laneR;
    g.fillStyle(this.turboRemaining > 0 ? 0x38bdf8 : 0xffffff, this.turboRemaining > 0 ? 0.14 : 0.06);
    this.fillQuad(g, pTopL, top.y, pTopR, top.y, pBotR, bot.y, pBotL, bot.y);

    // Animated cheering pixel spectators in the distant bleachers
    const cheerBoost = this.turboRemaining > 0 ? 2.5 : 1;
    for (const dot of this.crowdDots) {
      const hop = Math.sin(time * 0.008 * cheerBoost + dot.phase) > 0.35 ? -2 : 0;
      g.fillStyle(dot.color, 1);
      g.fillRect(dot.x, dot.y + hop, 4, 4);
    }
  }

  private spawnNextPattern(): void {
    this.patternCount++;
    const lanes = [-1, 0, 1];
    Phaser.Utils.Array.Shuffle(lanes);

    const needStamina = this.stamina < 48;
    const spawnTurbo =
      this.turboRemaining <= 0 &&
      this.patternCount % 11 === 0;
    const spawnStamina =
      !spawnTurbo &&
      (needStamina ? this.patternCount % 3 === 0 : this.patternCount % 6 === 0);

    // Pattern archetypes — ALWAYS guarantees at least one safe lane or jumpable path
    const roll = Math.random();

    if (roll < 0.34) {
      // Pattern A: 1 obstacle + coin trail in another lane
      const obsLane = lanes[0];
      const obsKind: ObstacleKind = Math.random() < 0.45 ? 'hurdle' : Math.random() < 0.5 ? 'cones' : 'barrier';
      this.spawnEntity('obstacle', obsKind, obsLane, 1.0, 0);

      const coinLane = lanes[1];
      this.spawnCoinLine(coinLane, 1.0, 3, false);

      if (spawnStamina) {
        this.spawnEntity('collectible', 'stamina', lanes[2], 1.02, 0);
      } else if (spawnTurbo) {
        this.spawnEntity('collectible', 'turbo', lanes[2], 1.02, 0);
      }
    } else if (roll < 0.68) {
      // Pattern B: Two-lane blockade (at least 1 safe open lane!)
      const safeLane = lanes[0];
      const obs1: ObstacleKind = Math.random() < 0.45 ? 'barrier' : 'hurdle';
      const obs2: ObstacleKind = obs1 === 'barrier' && Math.random() < 0.4 ? 'cones' : 'hurdle';

      this.spawnEntity('obstacle', obs1, lanes[1], 1.0, 0);
      this.spawnEntity('obstacle', obs2, lanes[2], 1.0, 0);

      if (spawnTurbo) {
        this.spawnEntity('collectible', 'turbo', safeLane, 1.0, 0);
      } else if (spawnStamina) {
        this.spawnEntity('collectible', 'stamina', safeLane, 1.0, 0);
      } else {
        this.spawnCoinLine(safeLane, 1.0, 3, false);
      }
    } else if (roll < 0.88) {
      // Pattern C: Hurdle row with coin arc overhead encouraging a stylish jump!
      const hurdleLane = lanes[0];
      this.spawnEntity('obstacle', 'hurdle', hurdleLane, 1.0, 0);
      // Elevated coin right over the hurdle
      this.spawnEntity('collectible', 'coin', hurdleLane, 1.0, 38);

      // Optional side barrier in another lane
      if (this.distance > 60) {
        this.spawnEntity('obstacle', 'barrier', lanes[1], 1.0, 0);
      }
      if (spawnStamina) {
        this.spawnEntity('collectible', 'stamina', lanes[2], 1.0, 0);
      } else if (spawnTurbo) {
        this.spawnEntity('collectible', 'turbo', lanes[2], 1.0, 0);
      }
    } else {
      // Pattern D: Staggered slalom (2 obstacles offset in depth)
      this.spawnEntity('obstacle', 'barrier', lanes[0], 1.0, 0);
      this.spawnEntity('obstacle', 'hurdle', lanes[1], 1.18, 0);
      this.spawnCoinLine(lanes[2], 1.0, 3, false);

      if (spawnStamina) {
        this.spawnEntity('collectible', 'stamina', lanes[1], 1.0, 0);
      } else if (spawnTurbo) {
        this.spawnEntity('collectible', 'turbo', lanes[0], 1.18, 0);
      }
    }
  }

  private spawnCoinLine(lane: number, startZ: number, count: number, elevated: boolean): void {
    for (let i = 0; i < count; i++) {
      this.spawnEntity('collectible', 'coin', lane, startZ + i * 0.085, elevated ? 34 : 0);
    }
  }

  private spawnEntity(
    category: 'obstacle' | 'collectible',
    kind: ObstacleKind | CollectibleKind,
    lane: number,
    z: number,
    elevation: number
  ): void {
    const textureKey =
      kind === 'hurdle'
        ? 'obstacle_hurdle'
        : kind === 'cones'
        ? 'obstacle_cones'
        : kind === 'barrier'
        ? 'obstacle_barrier'
        : kind === 'coin'
        ? 'coin_0'
        : kind === 'stamina'
        ? 'pickup_stamina'
        : 'pickup_turbo_0';

    const shadow = this.add.ellipse(0, 0, 32, 10, 0x090d16, 0.45).setDepth(20);
    const sprite = this.add.sprite(0, 0, textureKey).setOrigin(0.5, 1).setDepth(25);

    if (kind === 'coin') {
      sprite.play('coin_spin');
    } else if (kind === 'turbo') {
      sprite.play('turbo_pulse');
    }

    const ent: TrackEntity = {
      id: this.nextEntityId++,
      category,
      kind,
      lane,
      z,
      elevation,
      sprite,
      shadow,
      passed: false,
      collected: false,
    };

    this.positionEntity(ent);
    this.entities.push(ent);
  }

  private positionEntity(ent: TrackEntity): void {
    const bob =
      ent.category === 'collectible'
        ? Math.sin(this.time.now * 0.008 + ent.id) * 4
        : 0;
    const proj = this.project(ent.z, ent.lane, ent.elevation + bob);
    const groundProj = this.project(ent.z, ent.lane, 0);

    const baseMult = ent.category === 'obstacle' ? 2.0 : 1.75;
    const scale = proj.scale * baseMult;

    ent.sprite.setPosition(Math.round(proj.x), Math.round(proj.y));
    ent.sprite.setScale(scale);

    // Depth sort: closer objects (smaller z) render above farther objects
    const depth = Math.floor((1 - ent.z) * 55) + 10;
    ent.sprite.setDepth(depth);
    ent.shadow.setDepth(depth - 1);

    const shadowSize = ent.kind === 'barrier' ? 48 : ent.category === 'obstacle' ? 42 : 20;
    ent.shadow.setPosition(Math.round(groundProj.x), Math.round(groundProj.y - 1));
    ent.shadow.setScale(proj.scale * (shadowSize / 32));
  }

  private updateEntities(dt: number): void {
    const zMove = this.currentSpeed * dt;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      ent.z -= zMove;

      if (ent.z <= -0.04 || ent.collected) {
        ent.sprite.destroy();
        ent.shadow.destroy();
        this.entities.splice(i, 1);
        continue;
      }

      this.positionEntity(ent);

      // Collision check around player Z plane
      const zDiff = Math.abs(ent.z - PLAYER_Z);
      const laneDiff = Math.abs(ent.lane - this.laneFloat);

      if (ent.category === 'collectible') {
        if (zDiff < 0.052 && laneDiff < 0.5 && Math.abs(this.jumpHeight - ent.elevation) < 38) {
          this.collectItem(ent);
        }
      } else {
        // Obstacle
        if (!ent.passed && ent.z < PLAYER_Z - 0.045) {
          ent.passed = true;
          this.obstaclesCleared++;
          this.score += 15 * (this.turboRemaining > 0 ? 2 : 1);
        }

        if (zDiff < 0.036 && laneDiff < 0.42) {
          const requiredHeight =
            ent.kind === 'hurdle' ? 21 : ent.kind === 'cones' ? 16 : 999;

          if (this.jumpHeight >= requiredHeight) {
            // Cleanly vaulted over!
            if (!ent.passed) {
              ent.passed = true;
              this.obstaclesCleared++;
              this.score += 25 * (this.turboRemaining > 0 ? 2 : 1);
              this.spawnFloatingLabel(this.playerSprite.x, this.playerSprite.y - 78, '+25 SAUT', '#FDE047');
            }
          } else if (this.turboRemaining > 0 && ent.kind !== 'barrier') {
            // Turbo smashes through hurdles & cones!
            ent.collected = true;
            this.obstaclesCleared++;
            this.score += 50;
            soundFX.playSmash();
            this.cameras.main.shake(90, 0.008);
            this.spawnParticleExplosion(ent.sprite.x, ent.sprite.y - 18, 'part_red', 10);
            this.spawnFloatingLabel(ent.sprite.x, ent.sprite.y - 45, '+50 SMASH!', '#38BDF8');
          } else if (this.invulnTimer <= 0) {
            // Stop on obstacle hit, lose 20% stamina, and allow restarting!
            ent.collected = true;
            this.turboRemaining = 0;
            this.speedLinesGfx.clear();
            soundFX.playHit();
            this.cameras.main.shake(170, 0.014);
            this.spawnParticleExplosion(ent.sprite.x, ent.sprite.y - 20, 'part_red', 12);

            this.stamina = Math.max(0, this.stamina - 20);
            if (this.stamina <= 0) {
              this.triggerGameOver('STAMINA');
              return;
            }

            this.stopTimer = 0.78;
            this.speedRamp = 0;
            this.currentSpeed = 0;
            this.invulnTimer = 1.65;
            this.playerSprite.stop();
            this.playerSprite.setTexture('runner_hit');
            this.spawnFloatingLabel(this.playerSprite.x, this.playerSprite.y - 68, 'STOP ! -20 END', '#F87171');
            this.emitHud(true);
            return;
          }
        }
      }
    }
  }

  private collectItem(ent: TrackEntity): void {
    ent.collected = true;
    const mult = this.turboRemaining > 0 ? 2 : 1;

    if (ent.kind === 'coin') {
      this.coins++;
      this.score += 15 * mult;
      this.stamina = Math.min(this.maxStamina, this.stamina + 3.5);
      soundFX.playCoin();
      this.spawnParticleExplosion(ent.sprite.x, ent.sprite.y - 12, 'part_gold', 6);
    } else if (ent.kind === 'stamina') {
      this.stamina = Math.min(this.maxStamina, this.stamina + 35);
      this.score += 35 * mult;
      soundFX.playStamina();
      this.spawnParticleExplosion(ent.sprite.x, ent.sprite.y - 16, 'part_green', 10);
      this.spawnFloatingLabel(ent.sprite.x, ent.sprite.y - 34, '+35 ENDURANCE', '#4ADE80');
    } else if (ent.kind === 'turbo') {
      this.turboRemaining = this.turboDuration;
      this.score += 60;
      soundFX.playTurbo();
      this.cameras.main.flash(140, 56, 189, 248, false);
      this.spawnParticleExplosion(ent.sprite.x, ent.sprite.y - 16, 'part_cyan', 14);
      this.spawnFloatingLabel(ent.sprite.x, ent.sprite.y - 42, 'TURBO x2 !', '#38BDF8');
    }
    this.emitHud(true);
  }

  private triggerGameOver(reason: GameOverReason): void {
    this.status = 'GAME_OVER';
    this.gameOverReason = reason;
    this.turboRemaining = 0;
    this.speedLinesGfx.clear();

    this.playerSprite.stop();
    this.playerSprite.setTexture('runner_hit');
    this.playerSprite.setTint(reason === 'OBSTACLE' ? 0xf87171 : 0x94a3b8);

    for (const ent of this.entities) {
      ent.sprite.anims.pause();
    }

    if (reason === 'OBSTACLE') {
      soundFX.playHit();
      this.cameras.main.shake(220, 0.018);
      this.spawnParticleExplosion(this.playerSprite.x, this.playerSprite.y - 30, 'part_red', 14);
    } else {
      soundFX.playGameOver();
    }

    const finalScore = Math.floor(this.score);
    const finalDist = Math.floor(this.distance);
    if (finalScore > this.bestScore) {
      this.bestScore = finalScore;
      this.isNewRecord = true;
    }
    if (finalDist > this.bestDistance) {
      this.bestDistance = finalDist;
    }
    this.saveRecords();
    this.emitHud(true);
  }

  private spawnDustBurst(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.add.image(x + Phaser.Math.Between(-8, 8), y, 'part_dust').setDepth(59);
      this.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-18, 18),
        y: p.y + Phaser.Math.Between(-12, 4),
        alpha: 0,
        scale: 0.4,
        duration: 240,
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnParticleExplosion(x: number, y: number, textureKey: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.add.image(x, y, textureKey).setScale(1.4).setDepth(80);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = Phaser.Math.Between(18, 46);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 10,
        alpha: 0,
        scale: 0.3,
        duration: 320,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnFloatingLabel(x: number, y: number, msg: string, color: string): void {
    const text = this.add
      .text(x, y, msg, {
        fontFamily: 'Silkscreen, monospace',
        fontSize: '12px',
        color,
        stroke: '#090D16',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(95);

    this.floatingLabels.push({ text, vy: -36, life: 0.75 });
  }

  private updateEffects(dt: number): void {
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.life -= dt;
      if (a.life <= 0) {
        a.sprite.destroy();
        this.afterimages.splice(i, 1);
      } else {
        a.sprite.setAlpha((a.life / 0.18) * 0.5);
      }
    }

    for (let i = this.floatingLabels.length - 1; i >= 0; i--) {
      const f = this.floatingLabels[i];
      f.life -= dt;
      f.text.y += f.vy * dt;
      if (f.life <= 0) {
        f.text.destroy();
        this.floatingLabels.splice(i, 1);
      } else if (f.life < 0.25) {
        f.text.setAlpha(f.life / 0.25);
      }
    }
  }

  private clearEntities(): void {
    for (const ent of this.entities) {
      ent.sprite.destroy();
      ent.shadow.destroy();
    }
    this.entities = [];
  }

  private clearEffects(): void {
    for (const a of this.afterimages) {
      a.sprite.destroy();
    }
    this.afterimages = [];
    for (const f of this.floatingLabels) {
      f.text.destroy();
    }
    this.floatingLabels = [];
    this.speedLinesGfx.clear();
  }

  private emitHud(_force: boolean): void {
    if (!this.bridge) return;
    this.bridge.onHudUpdate({
      status: this.status,
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      coins: this.coins,
      stamina: Math.round(this.stamina),
      maxStamina: this.maxStamina,
      speedKmh: Math.round(this.currentSpeed * 62),
      turboRemaining: Number(this.turboRemaining.toFixed(1)),
      turboDuration: this.turboDuration,
      bestScore: Math.floor(this.bestScore),
      bestDistance: Math.floor(this.bestDistance),
      obstaclesCleared: this.obstaclesCleared,
      gameOverReason: this.gameOverReason,
      isNewRecord: this.isNewRecord,
    });
  }
}
