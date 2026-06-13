import type {
  KartState,
  KartInput,
  KartEntry,
  RaceConfig,
  GameState,
  TrackData,
  DifficultyLevel,
  RacerState,
} from './types';
import {
  createKartState,
  DEFAULT_KART_CONFIG,
  integrateKartFixedStep,
  type TrackSurfaceProvider,
} from './physics/kartPhysics';
import {
  initTracks,
  createTrackSurface,
  resolveTrackCollision,
  generateIdealLine,
} from './track/track';
import {
  buildAITrackData,
  createAIState,
  computeAIInput,
  type AIState,
  type AITrackData,
} from './ai/kartAI';
import {
  createRacerState,
  updateRacerState,
  getRaceSummary,
} from './race/raceManager';
import { GameRenderer } from './rendering/GameRenderer';
import { InputManager } from './input/InputManager';
import { HUD, type HUDData, type MiniMapData } from './ui/HUD';
import { vec2, vec3 } from './utils/math';

interface KartRuntime {
  id: number;
  state: KartState;
  prevState: KartState;
  input: KartInput;
  config: typeof DEFAULT_KART_CONFIG;
  isPlayer: boolean;
  aiState?: AIState;
  aiData?: AITrackData;
  difficulty?: DifficultyLevel;
  racerState: RacerState;
  surfaceProvider: TrackSurfaceProvider;
}

export class Game {
  private container: HTMLElement;
  private renderer: GameRenderer;
  private input: InputManager;
  private hud: HUD;
  private tracks: TrackData[];
  private currentTrack: TrackData;
  private raceConfig: RaceConfig;
  private gameState: GameState;
  private karts: KartRuntime[] = [];
  private raceTime: number = 0;
  private lapStartTime: number = 0;
  private countdown: number = 3;
  private totalLaps: number = 3;
  private lastTime: number = 0;
  private fixedStep: number = 1 / 120;
  private accumulator: number = 0;
  private paused: boolean = false;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new GameRenderer(container);
    this.input = new InputManager();
    this.hud = new HUD();
    this.tracks = initTracks();
    this.currentTrack = this.tracks[0];
    this.raceConfig = this.createDefaultRaceConfig();
    this.gameState = 'countdown';

    container.appendChild(this.hud.getElement());

    this.initRace();
    this.start();
  }

  private createDefaultRaceConfig(): RaceConfig {
    return {
      trackIndex: 0,
      totalLaps: 3,
      opponents: [
        { id: 0, name: '玩家', color: 0x00ff00, isPlayer: true },
        { id: 1, name: '红车', color: 0xff4444, isPlayer: false, difficulty: 'medium' },
        { id: 2, name: '蓝车', color: 0x4444ff, isPlayer: false, difficulty: 'medium' },
        { id: 3, name: '黄车', color: 0xffff44, isPlayer: false, difficulty: 'hard' },
      ],
    };
  }

  private initRace(): void {
    this.karts = [];
    this.raceTime = 0;
    this.countdown = 3;
    this.gameState = 'countdown';
    this.totalLaps = this.raceConfig.totalLaps;
    this.currentTrack = this.tracks[this.raceConfig.trackIndex];

    this.renderer.loadTrack(this.currentTrack);
    this.renderer.removeAllKarts();

    const startWp = this.currentTrack.waypoints[0];
    const nextWp = this.currentTrack.waypoints[1];
    const startDir = {
      x: nextWp.position.x - startWp.position.x,
      z: nextWp.position.z - startWp.position.z,
    };
    const startHeading = Math.atan2(startDir.x, startDir.z);

    const perp = { x: -startDir.z, z: startDir.x };
    const perpLen = Math.hypot(perp.x, perp.z);
    perp.x /= perpLen;
    perp.z /= perpLen;

    const idealLine = generateIdealLine(this.currentTrack, 5);
    const aiTrackData = buildAITrackData({
      waypoints: this.currentTrack.waypoints,
      closed: this.currentTrack.closed,
      idealLine,
    });

    const surfaceProvider = createTrackSurface(this.currentTrack);

    const entries = this.raceConfig.opponents;
    const rows = Math.ceil(entries.length / 2);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? -1 : 1;

      const offsetX = perp.x * col * 3;
      const offsetZ = perp.z * col * 3;
      const backOffset = -row * 6;

      const startPos = vec3(
        startWp.position.x + offsetX + -startDir.x / perpLen * backOffset,
        startWp.position.y,
        startWp.position.z + offsetZ + -startDir.z / perpLen * backOffset
      );

      const kartConfig = { ...DEFAULT_KART_CONFIG };
      if (!entry.isPlayer && entry.difficulty) {
        const speedMult = this.getAISpeedMultiplier(entry.difficulty);
        kartConfig.maxSpeed *= speedMult;
        kartConfig.acceleration *= speedMult;
      }

      const state = createKartState(startPos, startHeading);
      const racerState = createRacerState(
        entry.id,
        this.currentTrack.checkpoints.length,
        startPos
      );

      const kart: KartRuntime = {
        id: entry.id,
        state,
        prevState: { ...state, position: { ...state.position } },
        input: { throttle: 0, brake: 0, steer: 0 },
        config: kartConfig,
        isPlayer: entry.isPlayer,
        racerState,
        surfaceProvider,
      };

      if (!entry.isPlayer && entry.difficulty) {
        kart.aiState = createAIState();
        kart.aiData = aiTrackData;
        kart.difficulty = entry.difficulty;
      }

      this.karts.push(kart);
      this.renderer.addKart(entry.id, entry.color, entry.isPlayer, state);
    }

    this.hud.hideResults();
  }

  private getAISpeedMultiplier(difficulty: DifficultyLevel): number {
    switch (difficulty) {
      case 'easy': return 0.75;
      case 'medium': return 0.88;
      case 'hard': return 0.98;
    }
  }

  private start(): void {
    this.lastTime = performance.now();
    this.gameLoop();
  }

  private gameLoop = (): void => {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    dt = Math.min(dt, 1 / 30);

    if (!this.paused) {
      if (this.gameState === 'countdown') {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.gameState = 'racing';
          this.raceTime = 0;
          this.lapStartTime = 0;
          for (const kart of this.karts) {
            kart.racerState.currentLap = 1;
            kart.racerState.lapStartTime = 0;
          }
        }
      }

      if (this.gameState === 'racing' || this.gameState === 'countdown') {
        this.accumulator += dt;

        while (this.accumulator >= this.fixedStep) {
          this.fixedUpdate(this.fixedStep);
          this.accumulator -= this.fixedStep;
        }
      }

      if (this.gameState === 'racing') {
        this.raceTime += dt;
      }
    }

    const playerKart = this.karts.find(k => k.isPlayer);
    const playerId = playerKart?.id ?? 0;
    this.renderer.render(dt, playerId, this.gameState);
    this.updateHUD();

    this.handleInput();

    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private fixedUpdate(dt: number): void {
    if (this.gameState !== 'racing') return;

    for (const kart of this.karts) {
      kart.prevState = {
        ...kart.state,
        position: { ...kart.state.position },
        velocity: { ...kart.state.velocity },
      };
    }

    const playerKart = this.karts.find(k => k.isPlayer);
    if (playerKart) {
      playerKart.input = this.input.update(dt);
    }

    for (const kart of this.karts) {
      if (!kart.isPlayer && kart.aiState && kart.aiData && kart.difficulty) {
        const otherCars = this.karts
          .filter(k => k.id !== kart.id)
          .map(k => ({
            position: k.state.position,
            speed: k.state.speed,
            heading: k.state.heading,
          }));

        const result = computeAIInput(
          kart.state,
          kart.aiState,
          kart.aiData,
          kart.difficulty,
          otherCars
        );
        kart.input = result.input;
        kart.aiState = result.aiState;
      }
    }

    for (const kart of this.karts) {
      if (this.gameState !== 'racing') {
        kart.input = { throttle: 0, brake: 0, steer: 0 };
      }

      const newState = integrateKartFixedStep(
        kart.state,
        kart.input,
        dt,
        kart.config,
        this.fixedStep,
        kart.surfaceProvider
      );

      kart.state = newState;

      const pos2D = vec2(kart.state.position.x, kart.state.position.z);
      const vel2D = vec2(kart.state.velocity.x, kart.state.velocity.z);
      const halfWidth = kart.config.width / 2;

      const collision = resolveTrackCollision(
        this.currentTrack,
        pos2D,
        vel2D,
        halfWidth
      );

      kart.state.position.x = collision.position.x;
      kart.state.position.z = collision.position.y;
      kart.state.velocity.x = collision.velocity.x;
      kart.state.velocity.z = collision.velocity.y;

      kart.state.position.y = kart.surfaceProvider.getHeight(
        kart.state.position.x,
        kart.state.position.z
      );
    }

    this.handleKartCollisions();

    for (const kart of this.karts) {
      kart.racerState = updateRacerState({
        racer: kart.racerState,
        checkpoints: this.currentTrack.checkpoints,
        prevPosition: kart.prevState.position,
        currPosition: kart.state.position,
        totalLaps: this.totalLaps,
        raceTime: this.raceTime,
      });
    }

    const allRacers = this.karts.map(k => k.racerState);
    const summary = getRaceSummary(allRacers, this.currentTrack.checkpoints);
    for (const kart of this.karts) {
      const ranking = summary.rankings.find(r => r.kartId === kart.id);
      if (ranking) {
        kart.racerState.position = ranking.position;
      }
    }

    const finishedCount = this.karts.filter(k => k.racerState.finished).length;
    if (finishedCount >= this.karts.length - 1 || finishedCount > 0) {
      const playerKart = this.karts.find(k => k.isPlayer);
      if (playerKart?.racerState.finished) {
        this.endRace();
      }
    }

    for (const kart of this.karts) {
      this.renderer.updateKartState(kart.id, kart.state);
    }
  }

  private handleKartCollisions(): void {
    const collisionRadius = 2.0;

    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i];
        const b = this.karts[j];

        const dx = b.state.position.x - a.state.position.x;
        const dz = b.state.position.z - a.state.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < collisionRadius * 2 && dist > 0) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = collisionRadius * 2 - dist;

          a.state.position.x -= nx * overlap * 0.5;
          a.state.position.z -= nz * overlap * 0.5;
          b.state.position.x += nx * overlap * 0.5;
          b.state.position.z += nz * overlap * 0.5;

          const relVelX = b.state.velocity.x - a.state.velocity.x;
          const relVelZ = b.state.velocity.z - a.state.velocity.z;
          const relDot = relVelX * nx + relVelZ * nz;

          if (relDot > 0) {
            const restitution = 0.4;
            const impulse = -(1 + restitution) * relDot / 2;

            a.state.velocity.x -= nx * impulse;
            a.state.velocity.z -= nz * impulse;
            b.state.velocity.x += nx * impulse;
            b.state.velocity.z += nz * impulse;
          }
        }
      }
    }
  }

  private handleInput(): void {
    if (this.input.isKeyPressed('KeyP') || this.input.isKeyPressed('Escape')) {
      if (this.gameState === 'racing') {
        this.paused = true;
        this.gameState = 'paused';
      } else if (this.gameState === 'paused') {
        this.paused = false;
        this.gameState = 'racing';
        this.lastTime = performance.now();
      }
      this.input.clearKey('KeyP');
      this.input.clearKey('Escape');
    }

    if (this.input.isKeyPressed('KeyR')) {
      this.restartRace();
    }

    if (this.input.isKeyPressed('Digit1')) {
      this.raceConfig.trackIndex = 0;
      this.restartRace();
    }
    if (this.input.isKeyPressed('Digit2')) {
      this.raceConfig.trackIndex = 1;
      this.restartRace();
    }
    if (this.input.isKeyPressed('Digit3')) {
      this.raceConfig.trackIndex = 2;
      this.restartRace();
    }
  }

  private updateHUD(): void {
    const playerKart = this.karts.find(k => k.isPlayer);
    if (!playerKart) return;

    const racer = playerKart.racerState;
    const lapTime = this.gameState === 'racing' ? this.raceTime - racer.lapStartTime : 0;
    const totalTime = this.raceTime;

    const racers = this.karts.map(k => k.racerState);
    const entries = this.raceConfig.opponents;

    const miniMapData = this.getMiniMapData();

    const hudData: HUDData = {
      speed: playerKart.state.speed,
      currentLap: Math.min(racer.currentLap, this.totalLaps),
      totalLaps: this.totalLaps,
      lapTime: Math.max(0, lapTime),
      totalTime: Math.max(0, totalTime),
      bestLap: racer.bestLapTime,
      position: racer.position,
      totalRacers: this.karts.length,
      gameState: this.gameState,
      countdown: this.countdown,
      racers,
      kartEntries: entries,
      miniMapData,
    };

    this.hud.update(hudData);
  }

  private getMiniMapData(): MiniMapData {
    const trackPoints = this.currentTrack.waypoints.map(wp => ({
      x: wp.position.x,
      y: wp.position.z,
    }));

    const kartPositions = this.karts.map(kart => {
      const entry = this.raceConfig.opponents.find(o => o.id === kart.id);
      return {
        x: kart.state.position.x,
        y: kart.state.position.z,
        color: entry?.color || 0xffffff,
        isPlayer: kart.isPlayer,
      };
    });

    return {
      trackPoints,
      kartPositions,
      width: 200,
      height: 200,
    };
  }

  private endRace(): void {
    this.gameState = 'finished';
    const allRacers = this.karts.map(k => k.racerState);
    const summary = getRaceSummary(allRacers, this.currentTrack.checkpoints);
    this.hud.showResults(summary.rankings, this.raceConfig.opponents, summary.bestLapTime);
  }

  public restartRace(): void {
    this.initRace();
    this.input.reset();
    this.lastTime = performance.now();
  }

  public setTrack(index: number): void {
    if (index >= 0 && index < this.tracks.length) {
      this.raceConfig.trackIndex = index;
      this.restartRace();
    }
  }

  public getGameState(): GameState {
    return this.gameState;
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer.dispose();
    this.input.dispose();
  }
}
