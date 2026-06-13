export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface KartInput {
  throttle: number;
  brake: number;
  steer: number;
}

export interface KartState {
  position: Vec3;
  velocity: Vec3;
  heading: number;
  angularVelocity: number;
  speed: number;
  driftAngle: number;
  isGrounded: boolean;
}

export interface KartPhysicsConfig {
  maxSpeed: number;
  acceleration: number;
  brakeForce: number;
  turnRate: number;
  driftFactor: number;
  grip: number;
  drag: number;
  rollingResistance: number;
  mass: number;
  gravity: number;
  width: number;
  length: number;
}

export interface TrackWaypoint {
  position: Vec3;
  width: number;
}

export interface TrackCheckpoint {
  index: number;
  position: Vec3;
  normal: Vec2;
  width: number;
}

export interface TrackData {
  name: string;
  waypoints: TrackWaypoint[];
  checkpoints: TrackCheckpoint[];
  width: number;
  closed: boolean;
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface KartEntry {
  id: number;
  name: string;
  color: number;
  isPlayer: boolean;
  difficulty?: DifficultyLevel;
}

export interface LapRecord {
  lapNumber: number;
  time: number;
  isValid: boolean;
}

export interface RacerState {
  kartId: number;
  position: number;
  currentLap: number;
  lapStartTime: number;
  totalTime: number;
  bestLapTime: number | null;
  lastCheckpointIndex: number;
  checkpointsHit: boolean[];
  finished: boolean;
  finishTime: number | null;
  laps: LapRecord[];
}

export type GameState = 'countdown' | 'racing' | 'paused' | 'finished';

export interface RaceConfig {
  trackIndex: number;
  totalLaps: number;
  opponents: KartEntry[];
}
