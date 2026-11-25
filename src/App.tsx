import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BatteryCharging,
  Coins,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { GAME_HEIGHT, GAME_WIDTH, TrackScene } from './game/TrackScene';
import { soundFX } from './game/sound';
import { HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  status: 'TITLE_MENU',
  score: 0,
  distance: 0,
  coins: 0,
  stamina: 100,
  maxStamina: 100,
  speedKmh: 27,
  turboRemaining: 0,
  turboDuration: 5.0,
  bestScore: 0,
  bestDistance: 0,
  obstaclesCleared: 0,
  gameOverReason: null,
  isNewRecord: false,
};

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TrackScene | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState<boolean>(() => soundFX.isMuted());

  useEffect(() => {
    const preventScroll = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', preventScroll, { passive: false });
    return () => window.removeEventListener('keydown', preventScroll);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new TrackScene({
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
    });
    sceneRef.current = scene;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      parent: containerRef.current,
      backgroundColor: '#0F172A',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      fps: {
        target: 60,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [scene],
    });
    gameRef.current = game;

    return () => {
      sceneRef.current = null;
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const blurActive = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleStart = () => {
    blurActive();
    sceneRef.current?.startGame();
  };

  const handleTogglePause = () => {
    blurActive();
    sceneRef.current?.togglePause();
  };

  const handleToggleMute = () => {
    blurActive();
    const nextMuted = soundFX.toggleMute();
    setMuted(nextMuted);
  };

  const staminaPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));
  const staminaState =
    hud.turboRemaining > 0
      ? 'TURBO'
      : staminaPct > 50
      ? 'OPTIMAL'
      : staminaPct > 25
      ? 'FATIGUE'
      : 'CRITIQUE';

  const staminaBarColor =
    hud.turboRemaining > 0
      ? 'bg-sky-400'
      : staminaPct > 50
      ? 'bg-emerald-400'
      : staminaPct > 25
      ? 'bg-amber-400'
      : 'bg-red-500 animate-pulse';

  const turboPct =
    hud.turboDuration > 0
      ? Math.max(0, Math.min(100, (hud.turboRemaining / hud.turboDuration) * 100))
      : 0;

  return (
    <div className="min-h-screen w-full bg-[#0B1017] text-slate-100 flex flex-col">
      {/* Top Bar: Clean 3-Zone Header */}
      <header className="w-full border-b border-slate-800/80 bg-[#0F1621]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          <div className="font-pixel text-base sm:text-lg tracking-wider text-white whitespace-nowrap shrink-0 flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-6 h-6 bg-red-600 text-white font-pixel text-xs border border-red-400">
              Z
            </span>
            <span>Z-SPRINT</span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400 whitespace-nowrap">
            <span>Stade 3 pistes</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num text-slate-200">
              Record {hud.bestScore.toLocaleString('fr-FR')} pts
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num text-slate-300">{hud.bestDistance} m</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(hud.status === 'PLAYING' || hud.status === 'PAUSED') && (
              <button
                type="button"
                onClick={handleTogglePause}
                aria-label={hud.status === 'PAUSED' ? 'Reprendre la course' : 'Mettre en pause'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {hud.status === 'PAUSED' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{hud.status === 'PAUSED' ? 'Reprendre' : 'Pause'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Activer le son' : 'Couper le son'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-slate-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              <span className="hidden sm:inline">{muted ? 'Muet' : 'Son'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Game Viewport */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-5 flex flex-col items-center justify-center gap-3">
        {/* Compact Retro Telemetry Scoreboard Above Track */}
        <section
          aria-label="Tableau de bord de la course"
          className="w-full max-w-[560px] bg-[#131C29] border border-slate-800 rounded-lg px-3.5 py-2.5 flex flex-col gap-2"
        >
          <div className="grid grid-cols-4 gap-2 items-center">
            <div>
              <div className="text-[11px] text-slate-400">Score</div>
              <div className="font-mono-num text-sm sm:text-base font-bold text-white">
                {hud.score.toLocaleString('fr-FR')}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Distance</div>
              <div className="font-mono-num text-sm sm:text-base font-bold text-emerald-400">
                {hud.distance} m
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-400" />
                <span>Pièces</span>
              </div>
              <div className="font-mono-num text-sm sm:text-base font-bold text-amber-300">
                {hud.coins}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Allure</div>
              <div className="font-mono-num text-sm sm:text-base font-bold text-sky-300">
                {hud.speedKmh} km/h
              </div>
            </div>
          </div>

          {/* Dynamic Stamina & Turbo Bars */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/90">
            <div className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
                <BatteryCharging
                  className={`w-3.5 h-3.5 ${
                    hud.turboRemaining > 0
                      ? 'text-sky-400'
                      : staminaPct <= 25
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                />
                <span>Endurance</span>
              </span>
              <span className="font-mono-num text-slate-200">
                {hud.stamina}% · {staminaState}
              </span>
            </div>

            <div className="w-full h-3 bg-slate-950 border border-slate-700 rounded-sm overflow-hidden p-[2px]">
              <div
                className={`h-full transition-[width] duration-75 ${staminaBarColor}`}
                style={{ width: `${staminaPct}%` }}
              />
            </div>

            {hud.turboRemaining > 0 && (
              <div className="flex items-center gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-pixel text-sky-300 whitespace-nowrap">
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>TURBO ×2</span>
                </span>
                <div className="flex-1 h-2 bg-slate-950 border border-sky-700/80 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-amber-300 transition-[width] duration-75"
                    style={{ width: `${turboPct}%` }}
                  />
                </div>
                <span className="font-mono-num text-[11px] text-sky-200 w-9 text-right">
                  {hud.turboRemaining.toFixed(1)}s
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Phaser 3 Canvas Frame + Clean State Overlays */}
        <div className="relative w-full max-w-[560px] aspect-[480/540] max-h-[68vh] bg-[#0F172A] border-2 border-slate-700 rounded-lg overflow-hidden shadow-2xl">
          <div
            ref={containerRef}
            className="pixel-canvas-container w-full h-full flex items-center justify-center"
          />

          {/* TITLE MENU OVERLAY */}
          {hud.status === 'TITLE_MENU' && (
            <div className="absolute inset-0 bg-slate-950/78 backdrop-blur-[2px] flex flex-col items-center justify-center p-5 text-center">
              <div className="max-w-sm w-full bg-[#111927]/95 border border-slate-700 rounded-lg p-5 flex flex-col items-center gap-4">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 bg-red-600 border-2 border-red-400 flex items-center justify-center font-pixel text-xl text-white">
                    Z
                  </div>
                  <h1 className="font-pixel text-2xl sm:text-3xl text-white tracking-wide mt-1">
                    Z-SPRINT
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300">
                    Course d&apos;athlétisme sur 3 pistes en pixel art
                  </p>
                </div>

                <div className="w-full border-t border-b border-slate-800 py-3 grid grid-cols-2 gap-x-3 gap-y-2 text-left text-xs text-slate-300">
                  <div>
                    <span className="font-semibold text-white">← / →</span> : Changer de piste
                  </div>
                  <div>
                    <span className="font-semibold text-white">↑ / Espace</span> : Sauter
                  </div>
                  <div>
                    <span className="font-semibold text-white">↓</span> : Descente rapide
                  </div>
                  <div>
                    <span className="font-semibold text-amber-300">Pièces & Gourdes</span> : Endurance
                  </div>
                  <div className="col-span-2 text-slate-400">
                    Un choc sur un obstacle vous arrête (-20% d&apos;endurance) avant de repartir. Gardez votre endurance au-dessus de 0% !
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStart}
                  className="w-full py-3 px-6 bg-red-600 hover:bg-red-500 active:translate-y-[1px] text-white font-pixel text-sm rounded border border-red-400 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Démarrer la course
                </button>
              </div>
            </div>
          )}

          {/* PAUSE OVERLAY */}
          {hud.status === 'PAUSED' && (
            <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px] flex items-center justify-center p-5">
              <div className="max-w-xs w-full bg-[#111927] border border-slate-700 rounded-lg p-5 flex flex-col items-center gap-4 text-center">
                <h2 className="font-pixel text-xl text-white">Course en pause</h2>
                <div className="w-full flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded border border-emerald-400 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Reprendre
                  </button>
                  <button
                    type="button"
                    onClick={handleStart}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded border border-slate-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Recommencer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* GAME OVER OVERLAY */}
          {hud.status === 'GAME_OVER' && (
            <div className="absolute inset-0 bg-slate-950/82 backdrop-blur-[2px] flex items-center justify-center p-5">
              <div className="max-w-sm w-full bg-[#111927] border border-slate-700 rounded-lg p-5 flex flex-col items-center gap-4 text-center">
                <div className="flex flex-col items-center gap-1">
                  <h2 className="font-pixel text-xl text-red-400">
                    {hud.gameOverReason === 'STAMINA'
                      ? 'Épuisement !'
                      : 'Obstacle percuté !'}
                  </h2>
                  <p className="text-xs text-slate-300">
                    {hud.gameOverReason === 'STAMINA'
                      ? "Votre jauge d'endurance est tombée à zéro."
                      : 'Vous avez heurté un obstacle sur la piste.'}
                  </p>
                  {hud.isNewRecord && (
                    <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                      <Trophy className="w-3.5 h-3.5" />
                      <span>Nouveau record personnel !</span>
                    </div>
                  )}
                </div>

                <div className="w-full grid grid-cols-2 gap-2.5 bg-slate-900/90 border border-slate-800 rounded p-3 text-left">
                  <div>
                    <div className="text-[11px] text-slate-400">Score final</div>
                    <div className="font-mono-num text-base font-bold text-white">
                      {hud.score.toLocaleString('fr-FR')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Distance</div>
                    <div className="font-mono-num text-base font-bold text-emerald-400">
                      {hud.distance} m
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Pièces collectées</div>
                    <div className="font-mono-num text-base font-bold text-amber-300">
                      {hud.coins}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Obstacles franchis</div>
                    <div className="font-mono-num text-base font-bold text-sky-300">
                      {hud.obstaclesCleared}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStart}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 bg-red-600 hover:bg-red-500 active:translate-y-[1px] text-white font-pixel text-sm rounded border border-red-400 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Rejouer</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tactile Arcade Controls (mobile & click accessible) + Desktop Keyboard Legend */}
        <div className="w-full max-w-[560px] flex flex-col items-center gap-2">
          <div className="grid grid-cols-4 gap-2 w-full sm:hidden">
            <button
              type="button"
              onClick={() => sceneRef.current?.handleLaneInput(-1)}
              aria-label="Piste à gauche"
              className="min-h-[46px] flex items-center justify-center bg-slate-800 active:bg-slate-700 border border-slate-700 rounded text-white cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => sceneRef.current?.handleJumpInput()}
              aria-label="Sauter"
              className="min-h-[46px] flex items-center justify-center gap-1 bg-red-600 active:bg-red-500 border border-red-400 rounded text-white font-semibold text-xs cursor-pointer"
            >
              <ArrowUp className="w-4 h-4" />
              <span>Saut</span>
            </button>
            <button
              type="button"
              onClick={() => sceneRef.current?.handleFastDropInput()}
              aria-label="Descente rapide"
              className="min-h-[46px] flex items-center justify-center bg-slate-800 active:bg-slate-700 border border-slate-700 rounded text-white cursor-pointer"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => sceneRef.current?.handleLaneInput(1)}
              aria-label="Piste à droite"
              className="min-h-[46px] flex items-center justify-center bg-slate-800 active:bg-slate-700 border border-slate-700 rounded text-white cursor-pointer"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <p className="hidden sm:block text-xs text-slate-400 text-center">
            Flèches ← → : changer de piste · ↑ ou Espace : sauter · ↓ : descente rapide · P : pause
          </p>
        </div>
      </main>
    </div>
  );
}
