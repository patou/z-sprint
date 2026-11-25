export type GameStatus = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type GameOverReason = 'OBSTACLE' | 'STAMINA' | null;

export interface HudSnapshot {
  status: GameStatus;
  score: number;
  distance: number;
  coins: number;
  stamina: number;
  maxStamina: number;
  speedKmh: number;
  turboRemaining: number;
  turboDuration: number;
  bestScore: number;
  bestDistance: number;
  obstaclesCleared: number;
  gameOverReason: GameOverReason;
  isNewRecord: boolean;
}

export interface GameBridge {
  onHudUpdate: (snapshot: HudSnapshot) => void;
}
