import type { RacerState, TrackCheckpoint, Vec3, LapRecord } from '../types';
import { checkCheckpointCrossing, findNearestPointOnTrack } from '../track/track';
import { vec2 } from '../utils/math';

export function createRacerState(
  kartId: number,
  totalCheckpoints: number,
  startPosition: Vec3
): RacerState {
  return {
    kartId,
    position: 1,
    currentLap: 0,
    lapStartTime: 0,
    totalTime: 0,
    bestLapTime: null,
    lastCheckpointIndex: -1,
    checkpointsHit: new Array(totalCheckpoints).fill(false),
    finished: false,
    finishTime: null,
    laps: [],
  };
}

export interface RaceUpdateParams {
  racer: RacerState;
  checkpoints: TrackCheckpoint[];
  prevPosition: Vec3;
  currPosition: Vec3;
  totalLaps: number;
  raceTime: number;
}

export function updateRacerState(params: RaceUpdateParams): RacerState {
  const { racer, checkpoints, prevPosition, currPosition, totalLaps, raceTime } = params;

  if (racer.finished) {
    return { ...racer };
  }

  const newState: RacerState = {
    ...racer,
    checkpointsHit: [...racer.checkpointsHit],
    laps: [...racer.laps],
  };

  const prev2D = vec2(prevPosition.x, prevPosition.z);
  const curr2D = vec2(currPosition.x, currPosition.z);

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    
    if (checkCheckpointCrossing(cp, prev2D, curr2D)) {
      const expectedIndex = (newState.lastCheckpointIndex + 1) % checkpoints.length;

      if (i === 0 && newState.lastCheckpointIndex === checkpoints.length - 1) {
        const allHit = newState.checkpointsHit.every(h => h);
        
        if (allHit && newState.currentLap > 0) {
          const lapTime = raceTime - newState.lapStartTime;
          const lapRecord: LapRecord = {
            lapNumber: newState.currentLap,
            time: lapTime,
            isValid: true,
          };
          newState.laps.push(lapRecord);

          if (newState.bestLapTime === null || lapTime < newState.bestLapTime) {
            newState.bestLapTime = lapTime;
          }

          newState.totalTime = raceTime;
        }

        newState.currentLap++;
        newState.lapStartTime = raceTime;
        newState.checkpointsHit = new Array(checkpoints.length).fill(false);
        newState.checkpointsHit[0] = true;
        newState.lastCheckpointIndex = 0;

        if (newState.currentLap > totalLaps) {
          newState.finished = true;
          newState.finishTime = raceTime;
          newState.currentLap = totalLaps;
        }
      } else if (i === expectedIndex) {
        newState.checkpointsHit[i] = true;
        newState.lastCheckpointIndex = i;
      } else if (i > newState.lastCheckpointIndex) {
        // 跳过检查点，标记但不计入有效圈
        newState.checkpointsHit[i] = true;
      }
    }
  }

  return newState;
}

export function invalidateInvalidLaps(racer: RacerState): RacerState {
  return {
    ...racer,
    laps: racer.laps.map(lap => ({ ...lap })),
  };
}

export interface RacerProgress {
  kartId: number;
  lap: number;
  checkpointIndex: number;
  progressWithinSegment: number;
}

export function getRacerProgress(
  racer: RacerState,
  checkpoints: TrackCheckpoint[]
): number {
  if (racer.finished && racer.finishTime !== null) {
    return checkpoints.length * 100000 + racer.finishTime;
  }
  
  const cpCount = checkpoints.length;
  const baseProgress = (racer.currentLap - 1) * cpCount;
  
  if (racer.lastCheckpointIndex < 0) {
    return baseProgress;
  }
  
  return baseProgress + racer.lastCheckpointIndex + 0.5;
}

export function calculateRankings(
  racers: RacerState[],
  checkpoints: TrackCheckpoint[]
): RacerState[] {
  const withProgress = racers.map(racer => ({
    racer,
    progress: getRacerProgress(racer, checkpoints),
  }));

  withProgress.sort((a, b) => {
    if (a.racer.finished && b.racer.finished) {
      return (a.racer.finishTime ?? 0) - (b.racer.finishTime ?? 0);
    }
    if (a.racer.finished) return -1;
    if (b.racer.finished) return 1;
    return b.progress - a.progress;
  });

  return withProgress.map((item, index) => ({
    ...item.racer,
    position: index + 1,
  }));
}

export interface RaceSummary {
  totalRacers: number;
  finishedCount: number;
  bestLapTime: number | null;
  bestLapKartId: number | null;
  rankings: RacerState[];
}

export function getRaceSummary(
  racers: RacerState[],
  checkpoints: TrackCheckpoint[]
): RaceSummary {
  const rankings = calculateRankings(racers, checkpoints);
  
  let bestLapTime: number | null = null;
  let bestLapKartId: number | null = null;

  for (const racer of racers) {
    if (racer.bestLapTime !== null) {
      if (bestLapTime === null || racer.bestLapTime < bestLapTime) {
        bestLapTime = racer.bestLapTime;
        bestLapKartId = racer.kartId;
      }
    }
  }

  return {
    totalRacers: racers.length,
    finishedCount: racers.filter(r => r.finished).length,
    bestLapTime,
    bestLapKartId,
    rankings,
  };
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function formatLapTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(3)}s`;
  }
  return formatTime(seconds);
}
