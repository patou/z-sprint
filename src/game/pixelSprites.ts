import Phaser from 'phaser';

type Palette = Record<string, string>;

function drawPixelMatrix(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  palette: Palette
): void {
  if (scene.textures.exists(key)) return;
  const height = rows.length;
  const width = rows[0]?.length ?? 1;
  const tex = scene.textures.createCanvas(key, width, height);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

const RUNNER_PALETTE: Palette = {
  O: '#160B0E', // dark outline
  R: '#DC2626', // primary hoodie red
  H: '#F87171', // hoodie highlight
  D: '#991B1B', // hoodie shadow
  K: '#450A0A', // deep hood shadow
  W: '#FFFFFF', // white Z & shoe body
  S: '#CBD5E1', // sneaker sole / light grey
  P: '#1E293B', // track pants dark
  L: '#334155', // track pants highlight
  N: '#0F172A', // pants shadow
  G: '#FDE047', // subtle aglet / detail
};

/**
 * Generates a 28x36 pixel-art back-view runner wearing a red hoodie (hood up,
 * gender-neutral silhouette) with a crisp white 'Z' on the back.
 */
function buildRunnerFrame(
  pose: 'run0' | 'run1' | 'run2' | 'run3' | 'run4' | 'run5' | 'jump' | 'fall' | 'hit'
): string[] {
  const bob = pose === 'run1' || pose === 'run4' ? 1 : pose === 'jump' ? -1 : 0;

  // Base 28-wide canvas initialized with transparent '.'
  const grid: string[][] = Array.from({ length: 36 }, () => Array(28).fill('.'));

  const plot = (x: number, y: number, ch: string) => {
    const yy = y + bob;
    if (yy >= 0 && yy < 36 && x >= 0 && x < 28) {
      grid[yy][x] = ch;
    }
  };

  const plotRaw = (x: number, y: number, ch: string) => {
    if (y >= 0 && y < 36 && x >= 0 && x < 28) {
      grid[y][x] = ch;
    }
  };

  const rect = (x0: number, y0: number, w: number, h: number, ch: string, raw = false) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (raw) plotRaw(x, y, ch);
        else plot(x, y, ch);
      }
    }
  };

  // 1. HOOD (rows 1..11, centered at x=13..14) - completely covers head (gender-neutral)
  // Outline & rounded hood dome
  rect(10, 1, 8, 1, 'O');
  rect(9, 2, 10, 1, 'O');
  rect(8, 3, 12, 8, 'O');
  rect(9, 11, 10, 1, 'O');

  // Red hood fill
  rect(10, 2, 8, 1, 'H');
  rect(9, 3, 10, 2, 'H');
  rect(9, 5, 10, 5, 'R');
  rect(10, 10, 8, 1, 'D');
  // Subtle hood fold seam & dark neck collar shadow
  rect(13, 3, 2, 6, 'D');
  rect(10, 10, 8, 1, 'K');
  rect(11, 11, 6, 1, 'D');

  // 2. TORSO / RED HOODIE (rows 12..24)
  rect(7, 12, 14, 1, 'O');
  rect(6, 13, 16, 10, 'O');
  rect(7, 23, 14, 1, 'O');

  // Inner red hoodie body
  rect(8, 12, 12, 1, 'H');
  rect(7, 13, 14, 2, 'H');
  rect(7, 15, 14, 6, 'R');
  rect(7, 21, 14, 2, 'D');
  // Ribbed hem
  rect(8, 23, 12, 1, 'D');

  // 3. CRISP WHITE "Z" ON THE BACK OF THE HOODIE (rows 14..21, x=10..17)
  // Top bar
  rect(10, 14, 8, 2, 'W');
  // Diagonal stroke
  rect(15, 16, 2, 1, 'W');
  rect(14, 17, 2, 1, 'W');
  rect(12, 18, 2, 1, 'W');
  rect(11, 19, 2, 1, 'W');
  // Bottom bar
  rect(10, 20, 8, 2, 'W');

  // 4. ARMS (swinging dynamically based on pose)
  const drawLeftArm = (dy: number, tucked = false) => {
    if (tucked) {
      rect(4, 12 + dy, 3, 5, 'O');
      rect(5, 13 + dy, 2, 3, 'R');
      plot(5, 12 + dy, 'H');
      return;
    }
    rect(4, 13 + dy, 3, 8, 'O');
    rect(5, 14 + dy, 2, 5, 'R');
    plot(5, 14 + dy, 'H');
    rect(5, 19 + dy, 2, 1, 'D');
  };

  const drawRightArm = (dy: number, tucked = false) => {
    if (tucked) {
      rect(21, 12 + dy, 3, 5, 'O');
      rect(21, 13 + dy, 2, 3, 'R');
      plot(22, 12 + dy, 'H');
      return;
    }
    rect(21, 13 + dy, 3, 8, 'O');
    rect(21, 14 + dy, 2, 5, 'R');
    plot(22, 14 + dy, 'H');
    rect(21, 19 + dy, 2, 1, 'D');
  };

  if (pose === 'run0') {
    drawLeftArm(-1);
    drawRightArm(2);
  } else if (pose === 'run1') {
    drawLeftArm(-2);
    drawRightArm(1);
  } else if (pose === 'run2') {
    drawLeftArm(0);
    drawRightArm(0);
  } else if (pose === 'run3') {
    drawLeftArm(2);
    drawRightArm(-1);
  } else if (pose === 'run4') {
    drawLeftArm(1);
    drawRightArm(-2);
  } else if (pose === 'run5') {
    drawLeftArm(0);
    drawRightArm(0);
  } else if (pose === 'jump') {
    // Both arms raised upward in athletic vault
    rect(4, 9, 3, 7, 'O');
    rect(5, 10, 2, 5, 'R');
    rect(21, 9, 3, 7, 'O');
    rect(21, 10, 2, 5, 'R');
  } else if (pose === 'fall') {
    drawLeftArm(-2, true);
    drawRightArm(-2, true);
  } else if (pose === 'hit') {
    rect(3, 12, 4, 5, 'O');
    rect(4, 13, 2, 3, 'R');
    rect(21, 12, 4, 5, 'O');
    rect(22, 13, 2, 3, 'R');
  }

  // 5. LEGS & SNEAKERS (rows 24..35, raw coordinates so feet stay grounded)
  // Pelvis / waist
  rect(8, 24, 12, 3, 'O', true);
  rect(9, 24, 10, 2, 'P', true);
  rect(10, 24, 8, 1, 'L', true);

  const drawLeg = (
    x: number,
    topY: number,
    len: number,
    shoeType: 'planted' | 'sole' | 'tucked'
  ) => {
    // Pants leg
    rect(x, topY, 4, len, 'O', true);
    rect(x + 1, topY, 2, len, 'P', true);
    plotRaw(x + 1, topY + 1, 'L');

    const sy = topY + len;
    if (shoeType === 'planted') {
      rect(x, sy, 4, 3, 'O', true);
      rect(x + 1, sy, 2, 1, 'R', true);
      rect(x + 1, sy + 1, 2, 1, 'W', true);
    } else if (shoeType === 'sole') {
      // Kicked back toward camera: bright sneaker sole visible!
      rect(x - 1, sy - 1, 5, 4, 'O', true);
      rect(x, sy, 3, 2, 'W', true);
      rect(x, sy + 1, 3, 1, 'R', true);
      rect(x + 1, sy, 1, 1, 'S', true);
    } else {
      // Tucked jump shoe
      rect(x, sy, 4, 2, 'O', true);
      rect(x + 1, sy, 2, 1, 'W', true);
    }
  };

  if (pose === 'run0') {
    drawLeg(9, 26, 6, 'planted');
    drawLeg(15, 26, 4, 'sole');
  } else if (pose === 'run1') {
    drawLeg(9, 26, 7, 'planted');
    drawLeg(15, 25, 3, 'sole');
  } else if (pose === 'run2') {
    drawLeg(9, 26, 5, 'planted');
    drawLeg(15, 26, 6, 'planted');
  } else if (pose === 'run3') {
    drawLeg(9, 26, 4, 'sole');
    drawLeg(15, 26, 6, 'planted');
  } else if (pose === 'run4') {
    drawLeg(9, 25, 3, 'sole');
    drawLeg(15, 26, 7, 'planted');
  } else if (pose === 'run5') {
    drawLeg(9, 26, 6, 'planted');
    drawLeg(15, 26, 5, 'planted');
  } else if (pose === 'jump') {
    drawLeg(8, 26, 3, 'tucked');
    drawLeg(16, 25, 3, 'sole');
  } else if (pose === 'fall') {
    drawLeg(9, 26, 5, 'tucked');
    drawLeg(15, 26, 5, 'tucked');
  } else {
    drawLeg(8, 26, 5, 'sole');
    drawLeg(16, 26, 5, 'sole');
  }

  return grid.map((row) => row.join(''));
}

export function generateAllPixelTextures(scene: Phaser.Scene): void {
  // Runner frames
  const poses: Array<'run0' | 'run1' | 'run2' | 'run3' | 'run4' | 'run5' | 'jump' | 'fall' | 'hit'> = [
    'run0',
    'run1',
    'run2',
    'run3',
    'run4',
    'run5',
    'jump',
    'fall',
    'hit',
  ];

  for (const pose of poses) {
    drawPixelMatrix(scene, `runner_${pose}`, buildRunnerFrame(pose), RUNNER_PALETTE);
  }

  // Register running animation once
  if (!scene.anims.exists('runner_sprint')) {
    scene.anims.create({
      key: 'runner_sprint',
      frames: [
        { key: 'runner_run0' },
        { key: 'runner_run1' },
        { key: 'runner_run2' },
        { key: 'runner_run3' },
        { key: 'runner_run4' },
        { key: 'runner_run5' },
      ],
      frameRate: 14,
      repeat: -1,
    });
  }

  // Jumpable Hurdle (34x24)
  drawPixelMatrix(
    scene,
    'obstacle_hurdle',
    [
      'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
      'OWWWWRRRRWWWWWRRRRWWWWWRRRRWWWWWR'.slice(0, 33) + 'O',
      'OWWWWRRRRWWWWWRRRRWWWWWRRRRWWWWWR'.slice(0, 33) + 'O',
      'OWWWWRRRRWWWWWRRRRWWWWWRRRRWWWWWR'.slice(0, 33) + 'O',
      'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '..OMMO......................OMMO..',
      '.OOMMOO....................OOMMOO.',
      'ODDDDDDO..................ODDDDDDO',
      'OOOOOOOO..................OOOOOOOO',
    ],
    {
      O: '#0F172A',
      W: '#F8FAFC',
      R: '#EF4444',
      M: '#94A3B8',
      D: '#475569',
    }
  );

  // Jumpable Track Cones + Low Bar (34x18)
  drawPixelMatrix(
    scene,
    'obstacle_cones',
    [
      '....OO......................OO....',
      '...OPPO....................OPPO...',
      '...OPPO....................OPPO...',
      '..OPWWPO..................OPWWPO..',
      '..OPWWPO..................OPWWPO..',
      '..OPPPPO..................OPPPPO..',
      '.OOOOOOOOOOOOOOO..OOOOOOOOOOOOOOO.',
      '.OYYYYDDDDYYYYDDDDYYYYDDDDYYYYDDO.',
      '.OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.',
      '.OPWWWPO..................OPWWWPO.',
      '.OPPPPPPO................OPPPPPPO.',
      'OPPPPPPPPO..............OPPPPPPPPO',
      'OPPPPPPPPO..............OPPPPPPPPO',
      'ODDDDDDDDO..............ODDDDDDDDO',
      'OOOOOOOOOO..............OOOOOOOOOO',
    ],
    {
      O: '#0F172A',
      P: '#F97316',
      W: '#FFFFFF',
      Y: '#FACC15',
      D: '#1E293B',
    }
  );

  // Non-Jumpable Tall Stadium Barrier (36x46)
  const barrierRows: string[] = [];
  for (let y = 0; y < 46; y++) {
    if (y === 0 || y === 45) {
      barrierRows.push('O'.repeat(36));
    } else if (y >= 1 && y <= 5) {
      barrierRows.push('O' + 'B'.repeat(34) + 'O');
    } else if (y === 6 || y === 17 || y === 28 || y === 35) {
      barrierRows.push('O'.repeat(36));
    } else if (y >= 7 && y <= 16) {
      // Hazard yellow/black chevron band
      let row = 'O';
      for (let x = 1; x < 35; x++) {
        row += ((x + y) % 8 < 4) ? 'Y' : 'K';
      }
      row += 'O';
      barrierRows.push(row);
    } else if (y >= 18 && y <= 27) {
      // Blue panel with white/red X warning sign in center
      let row = 'O';
      for (let x = 1; x < 35; x++) {
        const dx = Math.abs(x - 17.5);
        const dy = Math.abs(y - 22.5);
        if (dx <= 5 && dy <= 4) {
          if (Math.abs(dx - dy) < 1.3) row += 'R';
          else row += 'W';
        } else {
          row += 'B';
        }
      }
      row += 'O';
      barrierRows.push(row);
    } else if (y >= 29 && y <= 34) {
      let row = 'O';
      for (let x = 1; x < 35; x++) {
        row += ((x - y + 40) % 8 < 4) ? 'Y' : 'K';
      }
      row += 'O';
      barrierRows.push(row);
    } else {
      // Legs
      let row = '';
      for (let x = 0; x < 36; x++) {
        if ((x >= 3 && x <= 7) || (x >= 28 && x <= 32)) {
          row += x === 3 || x === 7 || x === 28 || x === 32 ? 'O' : 'M';
        } else {
          row += '.';
        }
      }
      barrierRows.push(row);
    }
  }
  drawPixelMatrix(scene, 'obstacle_barrier', barrierRows, {
    O: '#090D16',
    B: '#1D4ED8',
    Y: '#FACC15',
    K: '#111827',
    W: '#FFFFFF',
    R: '#EF4444',
    M: '#64748B',
  });

  // Spinning Gold Coin (4 frames of 16x16)
  const coinPalette: Palette = {
    O: '#713F12',
    Y: '#FACC15',
    L: '#FEF08A',
    D: '#CA8A04',
  };

  drawPixelMatrix(
    scene,
    'coin_0',
    [
      '.....OOOOOO.....',
      '...OOLLLLLLOO...',
      '..OLLYYYYYYDDO..',
      '.OLYYYYLLYYYYDO.',
      '.OLYYYLLLLYYYDO.',
      'OLYYYYLYYLYYYYDO',
      'OLYYYYLYYLYYYYDO',
      'OLYYYYLYYLYYYYDO',
      'OLYYYYLYYLYYYYDO',
      'OLYYYYLYYLYYYYDO',
      'OLYYYYLLLLYYYDO.',
      '.OLYYYYYYYYYYDO.',
      '.OLYYDDDDDDYYDO.',
      '..ODDDDDDDDDDO..',
      '...OODDDDDDOO...',
      '.....OOOOOO.....',
    ],
    coinPalette
  );

  drawPixelMatrix(
    scene,
    'coin_1',
    [
      '......OOOO......',
      '....OOLLLLOO....',
      '...OLLYLLYDDO...',
      '...OLYYLLYYDO...',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLLLLYYDO..',
      '...OLYYYYYYDO...',
      '...ODDDDDDDDO...',
      '....OODDDDOO....',
      '......OOOO......',
      '................',
    ],
    coinPalette
  );

  drawPixelMatrix(
    scene,
    'coin_2',
    [
      '.......OO.......',
      '......OLLO......',
      '......OLLO......',
      '......OYYO......',
      '......OYYO......',
      '......OYYO......',
      '......OYYO......',
      '......OYYO......',
      '......OYYO......',
      '......OYYO......',
      '......OYYO......',
      '......ODDO......',
      '......ODDO......',
      '......ODDO......',
      '.......OO.......',
      '................',
    ],
    coinPalette
  );

  drawPixelMatrix(
    scene,
    'coin_3',
    [
      '......OOOO......',
      '....OOLLLLOO....',
      '...OLLYLLYDDO...',
      '...OLYYLLYYDO...',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLYYLYYDO..',
      '..OLYYLLLLYYDO..',
      '...OLYYYYYYDO...',
      '...ODDDDDDDDO...',
      '....OODDDDOO....',
      '......OOOO......',
      '................',
    ],
    coinPalette
  );

  if (!scene.anims.exists('coin_spin')) {
    scene.anims.create({
      key: 'coin_spin',
      frames: [
        { key: 'coin_0' },
        { key: 'coin_1' },
        { key: 'coin_2' },
        { key: 'coin_3' },
      ],
      frameRate: 10,
      repeat: -1,
    });
  }

  // Stamina Energy Bottle (16x22)
  drawPixelMatrix(
    scene,
    'pickup_stamina',
    [
      '.....OOOOOO.....',
      '.....OWWWWO.....',
      '.....OSSSSO.....',
      '....OOOOOOOO....',
      '...OCCCCCCCCO...',
      '..OLLLLCCCCCCCO.',
      '..OLLLLCCCCCCCO.',
      '.OOCGGGGGGGGCCOO',
      '.OOCGGGWWGGGCCOO',
      '.OOCGGWWWWGGCCOO',
      '.OOCGGGWWGGGCCOO',
      '.OOCGGGGGGGGCCOO',
      '.OOCCCCCCCCCCCOO',
      '.OOCLCCCCCCCCDOO',
      '.OOCLCCCCCCCCDOO',
      '.OOCLCCCCCCCCDOO',
      '.OOCDDDDDDDDDDOO',
      '..OCCCCCCCCCCOO.',
      '..ODDDDDDDDDDO..',
      '...OOOOOOOOOO...',
      '................',
      '................',
    ],
    {
      O: '#082F49',
      W: '#FFFFFF',
      S: '#94A3B8',
      C: '#06B6D4',
      L: '#67E8F9',
      G: '#22C55E',
      D: '#0E7490',
    }
  );

  // Turbo Speed Boost Bolt (2 frames of 18x22)
  const turbo0 = [
    '.......OOOOOO.....',
    '......OYYYYYYO....',
    '.....OYYLLLLYO....',
    '....OYYLLLLYOO....',
    '...OYYLLLLYOO.....',
    '..OYYLLLLYYYYOOO..',
    '.OYYLLLLLLYYYYYYO.',
    '.OYYYYYYYYYYYYYYO.',
    '..OOOOOOOYYYYYYO..',
    '........OYYYYYO...',
    '.......OYYLLYO....',
    '......OYYLLYO.....',
    '.....OYYLLYO......',
    '....OYYLLYO.......',
    '...OYYLLYO........',
    '..OYYLLYO.........',
    '..OYYLYO..........',
    '...OYYO...........',
    '....OO............',
    '..................',
    '..................',
    '..................',
  ];
  const turbo1 = turbo0.map((row, idx) =>
    idx % 3 === 0 ? row.replace(/Y/g, 'L') : row
  );

  drawPixelMatrix(scene, 'pickup_turbo_0', turbo0, {
    O: '#1E1B4B',
    Y: '#FACC15',
    L: '#FEF9C3',
  });
  drawPixelMatrix(scene, 'pickup_turbo_1', turbo1, {
    O: '#0284C7',
    Y: '#38BDF8',
    L: '#FFFFFF',
  });

  if (!scene.anims.exists('turbo_pulse')) {
    scene.anims.create({
      key: 'turbo_pulse',
      frames: [{ key: 'pickup_turbo_0' }, { key: 'pickup_turbo_1' }],
      frameRate: 8,
      repeat: -1,
    });
  }

  // Stadium Floodlight Tower (18x52)
  const lightRows: string[] = [];
  for (let y = 0; y < 52; y++) {
    if (y === 0 || y === 10) {
      lightRows.push('O'.repeat(18));
    } else if (y >= 1 && y <= 9) {
      if (y === 2 || y === 4 || y === 6 || y === 8) {
        lightRows.push('OMWWWMOMWWWMOMWWWO');
      } else {
        lightRows.push('O' + 'M'.repeat(16) + 'O');
      }
    } else {
      lightRows.push('.......OOMO.......');
    }
  }
  drawPixelMatrix(scene, 'prop_floodlight', lightRows, {
    O: '#0F172A',
    M: '#64748B',
    W: '#FEF9C3',
  });

  // Pixel Cloud (36x14)
  drawPixelMatrix(
    scene,
    'prop_cloud',
    [
      '..........OOOOOO....................',
      '........OOWWWWWWO...................',
      '......OOWWWWWWWWWOO....OOOOO........',
      '....OOWWWWWWWWWWWWWOOOWWWWWWO.......',
      '..OOWWWWWWWWWWWWWWWWWWWWWWWWWOO.....',
      '.OWWWWWWWWWWWWWWWWWWWWWWWWWWWWWOO...',
      'OWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWO..',
      'OWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWO..',
      'OSSWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSO..',
      '.OSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSO...',
      '..OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO....',
    ],
    {
      O: '#334155',
      W: '#E2E8F0',
      S: '#94A3B8',
    }
  );

  // Simple 4x4 pixel particles
  const makeParticle = (key: string, color: string) => {
    drawPixelMatrix(scene, key, ['XXXX', 'XXXX', 'XXXX', 'XXXX'], { X: color });
  };
  makeParticle('part_dust', '#F1F5F9');
  makeParticle('part_gold', '#FACC15');
  makeParticle('part_cyan', '#38BDF8');
  makeParticle('part_red', '#EF4444');
  makeParticle('part_green', '#4ADE80');
}
