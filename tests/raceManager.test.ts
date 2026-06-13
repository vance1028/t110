import { describe, it, expect } from 'vitest';
import {
  createRacerState,
  updateRacerState,
  calculateRankings,
} from '../src/race/raceManager';
import { vec3 } from '../src/utils/math';
import type { TrackCheckpoint } from '../src/types';

function createRectCheckpoints(): TrackCheckpoint[] {
  return [
    { index: 0, position: vec3(0, 0, -30), normal: { x: 1, y: 0 }, width: 20 },
    { index: 1, position: vec3(40, 0, 0), normal: { x: 0, y: 1 }, width: 20 },
    { index: 2, position: vec3(0, 0, 30), normal: { x: -1, y: 0 }, width: 20 },
    { index: 3, position: vec3(-40, 0, 0), normal: { x: 0, y: -1 }, width: 20 },
  ];
}

describe('Race Manager', () => {
  it('should create racer state with initial values', () => {
    const checkpoints = createRectCheckpoints();
    const state = createRacerState(0, checkpoints.length, vec3(-10, 0, -30));

    expect(state.kartId).toBe(0);
    expect(state.currentLap).toBe(0);
    expect(state.lastCheckpointIndex).toBe(-1);
    expect(state.checkpointsHit.every(h => h === false)).toBe(true);
    expect(state.finished).toBe(false);
    expect(state.bestLapTime).toBeNull();
  });

  it('should register checkpoint crossing in order', () => {
    const checkpoints = createRectCheckpoints();
    let state = createRacerState(0, checkpoints.length, vec3(-10, 0, -30));

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-1, 0, -30),
      currPosition: vec3(1, 0, -30),
      totalLaps: 3,
      raceTime: 10,
    });

    expect(state.lastCheckpointIndex).toBe(0);
    expect(state.checkpointsHit[0]).toBe(true);
  });

  it('should complete a lap when passing all checkpoints in order and returning to start', () => {
    const checkpoints = createRectCheckpoints();
    let state = createRacerState(0, checkpoints.length, vec3(-10, 0, -30));
    state.currentLap = 1;
    state.lapStartTime = 0;

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-1, 0, -30),
      currPosition: vec3(1, 0, -30),
      totalLaps: 3,
      raceTime: 0,
    });
    expect(state.lastCheckpointIndex).toBe(0);
    expect(state.checkpointsHit[0]).toBe(true);

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(40, 0, -1),
      currPosition: vec3(40, 0, 1),
      totalLaps: 3,
      raceTime: 10,
    });
    expect(state.lastCheckpointIndex).toBe(1);
    expect(state.checkpointsHit[1]).toBe(true);

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(1, 0, 30),
      currPosition: vec3(-1, 0, 30),
      totalLaps: 3,
      raceTime: 20,
    });
    expect(state.lastCheckpointIndex).toBe(2);
    expect(state.checkpointsHit[2]).toBe(true);

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-40, 0, 1),
      currPosition: vec3(-40, 0, -1),
      totalLaps: 3,
      raceTime: 30,
    });
    expect(state.lastCheckpointIndex).toBe(3);
    expect(state.checkpointsHit[3]).toBe(true);

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-1, 0, -30),
      currPosition: vec3(1, 0, -30),
      totalLaps: 3,
      raceTime: 45,
    });

    expect(state.currentLap).toBe(2);
    expect(state.laps.length).toBe(1);
    expect(state.laps[0].isValid).toBe(true);
    expect(state.bestLapTime).toBe(state.laps[0].time);
  });

  it('should not count a lap if a checkpoint is skipped', () => {
    const checkpoints = createRectCheckpoints();
    let state = createRacerState(0, checkpoints.length, vec3(-10, 0, -30));
    state.currentLap = 1;
    state.lapStartTime = 0;
    state.lastCheckpointIndex = 0;
    state.checkpointsHit[0] = true;

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(1, 0, 30),
      currPosition: vec3(-1, 0, 30),
      totalLaps: 3,
      raceTime: 20,
    });

    expect(state.lastCheckpointIndex).toBe(0);
    expect(state.checkpointsHit[2]).toBe(true);

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-1, 0, -30),
      currPosition: vec3(1, 0, -30),
      totalLaps: 3,
      raceTime: 30,
    });

    expect(state.currentLap).toBe(1);
  });

  it('should finish race after completing all laps', () => {
    const checkpoints = createRectCheckpoints();
    let state = createRacerState(0, checkpoints.length, vec3(-10, 0, -30));

    state.currentLap = 3;
    state.lastCheckpointIndex = 3;
    state.checkpointsHit = [true, true, true, true];
    state.lapStartTime = 100;

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-1, 0, -30),
      currPosition: vec3(1, 0, -30),
      totalLaps: 3,
      raceTime: 150,
    });

    expect(state.finished).toBe(true);
    expect(state.finishTime).toBe(150);
  });

  it('should track best lap time correctly', () => {
    const checkpoints = createRectCheckpoints();
    let state = createRacerState(0, checkpoints.length, vec3(-10, 0, -30));
    state.currentLap = 1;
    state.lastCheckpointIndex = 3;
    state.checkpointsHit = [true, true, true, true];
    state.lapStartTime = 0;

    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-1, 0, -30),
      currPosition: vec3(1, 0, -30),
      totalLaps: 3,
      raceTime: 30,
    });
    expect(state.bestLapTime).toBe(30);

    state.lastCheckpointIndex = 3;
    state.checkpointsHit = [true, true, true, true];
    state = updateRacerState({
      racer: state,
      checkpoints,
      prevPosition: vec3(-1, 0, -30),
      currPosition: vec3(1, 0, -30),
      totalLaps: 3,
      raceTime: 55,
    });

    expect(state.bestLapTime).toBe(25);
    expect(state.laps.length).toBe(2);
  });

  it('should rank finished racers by finish time', () => {
    const checkpoints = createRectCheckpoints();

    const racer1 = createRacerState(1, checkpoints.length, vec3(0, 0, 0));
    racer1.finished = true;
    racer1.finishTime = 100;
    racer1.currentLap = 3;

    const racer2 = createRacerState(2, checkpoints.length, vec3(0, 0, 0));
    racer2.finished = true;
    racer2.finishTime = 90;
    racer2.currentLap = 3;

    const ranked = calculateRankings([racer1, racer2], checkpoints);
    expect(ranked[0].kartId).toBe(2);
    expect(ranked[1].kartId).toBe(1);
  });

  it('should rank racers by progress when not finished', () => {
    const checkpoints = createRectCheckpoints();

    const racer1 = createRacerState(1, checkpoints.length, vec3(0, 0, 0));
    racer1.currentLap = 2;
    racer1.lastCheckpointIndex = 2;

    const racer2 = createRacerState(2, checkpoints.length, vec3(0, 0, 0));
    racer2.currentLap = 2;
    racer2.lastCheckpointIndex = 0;

    const racer3 = createRacerState(3, checkpoints.length, vec3(0, 0, 0));
    racer3.currentLap = 1;
    racer3.lastCheckpointIndex = 3;

    const ranked = calculateRankings([racer1, racer2, racer3], checkpoints);
    expect(ranked[0].kartId).toBe(1);
    expect(ranked[1].kartId).toBe(2);
    expect(ranked[2].kartId).toBe(3);
  });

  it('should put finished racers ahead of racing ones', () => {
    const checkpoints = createRectCheckpoints();

    const finished = createRacerState(1, checkpoints.length, vec3(0, 0, 0));
    finished.finished = true;
    finished.finishTime = 100;
    finished.currentLap = 3;

    const racing = createRacerState(2, checkpoints.length, vec3(0, 0, 0));
    racing.currentLap = 2;
    racing.lastCheckpointIndex = 3;

    const ranked = calculateRankings([racing, finished], checkpoints);
    expect(ranked[0].kartId).toBe(1);
    expect(ranked[1].kartId).toBe(2);
  });
});
