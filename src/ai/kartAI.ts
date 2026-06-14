import type { KartInput, KartState, DifficultyLevel, Vec3, TrackWaypoint } from '../types';
import {
  vec2,
  vec2Normalize,
  vec2Sub,
  vec2Length,
  vec2Distance,
  vec2Dot,
  vec2Perp,
  normalizeAngle,
  clamp,
  lerp,
} from '../utils/math';
import { getTrackWaypoint, getTrackSegmentCount, getPointOnSegment } from '../track/track';

export interface AITrackData {
  waypoints: TrackWaypoint[];
  closed: boolean;
  idealLine: TrackWaypoint[];
  segmentSpeeds: number[];
  segmentCurvature: number[];
}

export interface AIDifficultyConfig {
  speedMultiplier: number;
  corneringAggression: number;
  linePrecision: number;
  reactionTime: number;
  overtakingAggression: number;
}

export const DIFFICULTY_CONFIGS: Record<DifficultyLevel, AIDifficultyConfig> = {
  easy: {
    speedMultiplier: 0.7,
    corneringAggression: 0.6,
    linePrecision: 0.6,
    reactionTime: 0.3,
    overtakingAggression: 0.3,
  },
  medium: {
    speedMultiplier: 0.85,
    corneringAggression: 0.8,
    linePrecision: 0.85,
    reactionTime: 0.15,
    overtakingAggression: 0.6,
  },
  hard: {
    speedMultiplier: 0.97,
    corneringAggression: 0.95,
    linePrecision: 0.98,
    reactionTime: 0.05,
    overtakingAggression: 0.9,
  },
};

export interface OtherCarInfo {
  position: Vec3;
  speed: number;
  heading: number;
}

export function buildAITrackData(track: {
  waypoints: TrackWaypoint[];
  closed: boolean;
  idealLine?: TrackWaypoint[];
}): AITrackData {
  const waypoints = track.waypoints;
  const idealLine = track.idealLine || waypoints;
  const segmentCount = track.closed ? waypoints.length : waypoints.length - 1;

  const segmentCurvature: number[] = [];
  const segmentSpeeds: number[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const prev = getWaypoint(idealLine, i - 1, track.closed);
    const curr = getWaypoint(idealLine, i, track.closed);
    const next = getWaypoint(idealLine, i + 1, track.closed);
    const nextNext = getWaypoint(idealLine, i + 2, track.closed);

    const dir1 = vec2Normalize({
      x: curr.position.x - prev.position.x,
      y: curr.position.z - prev.position.z,
    });
    const dir2 = vec2Normalize({
      x: next.position.x - curr.position.x,
      y: next.position.z - curr.position.z,
    });
    const dir3 = vec2Normalize({
      x: nextNext.position.x - next.position.x,
      y: nextNext.position.z - next.position.z,
    });

    const turn1 = Math.acos(clamp(vec2Dot(dir1, dir2), -1, 1));
    const turn2 = Math.acos(clamp(vec2Dot(dir2, dir3), -1, 1));
    const avgTurn = (turn1 + turn2) / 2;

    const segLen = vec2Distance(
      { x: curr.position.x, y: curr.position.z },
      { x: next.position.x, y: next.position.z }
    );

    const curvature = segLen > 0 ? avgTurn / segLen : 0;
    segmentCurvature.push(curvature);

    const baseSpeed = 50;
    const turnFactor = Math.max(0.3, 1 - curvature * 40);
    segmentSpeeds.push(baseSpeed * turnFactor);
  }

  return {
    waypoints: [...waypoints],
    closed: track.closed,
    idealLine: [...idealLine],
    segmentSpeeds,
    segmentCurvature,
  };
}

function getWaypoint(waypoints: TrackWaypoint[], index: number, closed: boolean): TrackWaypoint {
  const n = waypoints.length;
  if (closed) {
    return waypoints[((index % n) + n) % n];
  }
  return waypoints[clamp(index, 0, n - 1)];
}

export interface AIState {
  targetWaypointIndex: number;
  lookAheadDistance: number;
  brakeTimer: number;
  overtakeSide: number;
  overtakeTimer: number;
  lastSteer: number;
  lastThrottle: number;
}

export function createAIState(): AIState {
  return {
    targetWaypointIndex: 0,
    lookAheadDistance: 25,
    brakeTimer: 0,
    overtakeSide: 0,
    overtakeTimer: 0,
    lastSteer: 0,
    lastThrottle: 0,
  };
}

export function findNearestWaypointIndex(
  aiData: AITrackData,
  position: Vec3
): number {
  const waypoints = aiData.idealLine;
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const dist = Math.hypot(position.x - wp.position.x, position.z - wp.position.z);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export function getTargetPoint(
  aiData: AITrackData,
  startIndex: number,
  lookAhead: number
): { point: Vec3; segmentIndex: number; t: number } {
  const waypoints = aiData.idealLine;
  const n = waypoints.length;
  let remaining = lookAhead;
  let segIdx = startIndex;

  const startWp = waypoints[aiData.closed ? segIdx % n : clamp(segIdx, 0, n - 1)];
  let currentPos = { ...startWp.position };

  for (let i = 0; i < n * 2; i++) {
    const idx = aiData.closed ? (segIdx + i) % n : Math.min(segIdx + i, n - 2);
    const nextIdx = aiData.closed ? (segIdx + i + 1) % n : Math.min(segIdx + i + 1, n - 1);

    if (!aiData.closed && nextIdx >= n - 1) {
      return {
        point: { ...waypoints[waypoints.length - 1].position },
        segmentIndex: waypoints.length - 2,
        t: 1,
      };
    }

    const a = waypoints[idx].position;
    const b = waypoints[nextIdx].position;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);

    if (remaining <= segLen) {
      const t = segLen > 0 ? remaining / segLen : 0;
      return {
        point: getPointOnSegment(a, b, t),
        segmentIndex: idx,
        t,
      };
    }

    remaining -= segLen;
    currentPos = { ...b };
  }

  return {
    point: currentPos,
    segmentIndex: startIndex,
    t: 0,
  };
}

export function getAheadSegments(
  aiData: AITrackData,
  startIndex: number,
  count: number
): number[] {
  const result: number[] = [];
  const n = aiData.idealLine.length;
  for (let i = 0; i < count; i++) {
    if (aiData.closed) {
      result.push((startIndex + i) % n);
    } else {
      const idx = startIndex + i;
      if (idx < n - 1) result.push(idx);
    }
  }
  return result;
}

export function calculateDesiredSpeed(
  aiData: AITrackData,
  currentSegment: number,
  difficulty: AIDifficultyConfig
): number {
  const lookCount = 8;
  const segIdxs = getAheadSegments(aiData, currentSegment, lookCount);
  
  let minSpeed = Infinity;
  let weightedSpeed = 0;
  let weightSum = 0;

  for (let i = 0; i < segIdxs.length; i++) {
    const segIdx = segIdxs[i];
    const segSpeed = aiData.segmentSpeeds[segIdx % aiData.segmentSpeeds.length];
    const weight = 1 - i / segIdxs.length;
    weightedSpeed += segSpeed * weight;
    weightSum += weight;
    if (segSpeed < minSpeed) minSpeed = segSpeed;
  }

  const avgSpeed = weightSum > 0 ? weightedSpeed / weightSum : minSpeed;
  const aggressionFactor = lerp(avgSpeed, minSpeed, 1 - difficulty.corneringAggression);

  return aggressionFactor * difficulty.speedMultiplier;
}

export function computeAIInput(
  kartState: KartState,
  aiState: AIState,
  aiData: AITrackData,
  difficulty: DifficultyLevel,
  otherCars: OtherCarInfo[] = []
): { input: KartInput; aiState: AIState } {
  const diffConfig = DIFFICULTY_CONFIGS[difficulty];
  const newAIState = { ...aiState };

  const nearestIdx = findNearestWaypointIndex(aiData, kartState.position);
  const lookAhead = Math.max(10, Math.min(40, kartState.speed * 0.8 + 10));
  const target = getTargetPoint(aiData, nearestIdx, lookAhead);

  let targetPoint = { ...target.point };
  const lineOffset = (1 - diffConfig.linePrecision) * 3;
  const driftOffset = Math.sin(nearestIdx * 0.7 + kartState.position.x * 0.01) * lineOffset;

  const toTarget = {
    x: target.point.x - kartState.position.x,
    y: target.point.z - kartState.position.z,
  };
  const targetDir = vec2Normalize(toTarget);
  const perpDir = vec2Perp(targetDir);

  targetPoint = {
    x: target.point.x + perpDir.x * driftOffset,
    y: target.point.y,
    z: target.point.z + perpDir.y * driftOffset,
  };

  let overtaking = false;
  for (const other of otherCars) {
    const toOther = {
      x: other.position.x - kartState.position.x,
      y: other.position.z - kartState.position.z,
    };
    const dist = vec2Length(toOther);

    if (dist < 15 && dist > 0) {
      const forward = { x: Math.sin(kartState.heading), z: -Math.cos(kartState.heading) };
      const forward2 = { x: forward.x, y: forward.z };
      const dot = vec2Dot(vec2Normalize(toOther), forward2);

      if (dot > 0.3) {
        overtaking = true;
        const side = Math.sign(vec2Dot(vec2Perp(forward2), toOther));
        const overtakeDist = 3 + diffConfig.overtakingAggression * 2;

        if (newAIState.overtakeTimer <= 0) {
          newAIState.overtakeSide = side * (kartState.speed > other.speed ? -1 : 1);
          newAIState.overtakeTimer = 2 + Math.random() * 2;
        }

        targetPoint = {
          x: targetPoint.x + perpDir.x * newAIState.overtakeSide * overtakeDist,
          y: targetPoint.y,
          z: targetPoint.z + perpDir.y * newAIState.overtakeSide * overtakeDist,
        };
        break;
      }
    }
  }

  if (!overtaking) {
    newAIState.overtakeTimer = Math.max(0, newAIState.overtakeTimer - 0.016);
  }

  const toTargetFinal = {
    x: targetPoint.x - kartState.position.x,
    y: targetPoint.z - kartState.position.z,
  };

  const targetAngle = Math.atan2(toTargetFinal.x, -toTargetFinal.y);
  let angleDiff = normalizeAngle(targetAngle - kartState.heading);

  const maxSteer = 1;
  let steerInput = clamp(angleDiff * 2, -maxSteer, maxSteer);

  const steerSmooth = 8;
  steerInput = lerp(newAIState.lastSteer, steerInput, clamp(steerSmooth * 0.016, 0, 1));
  newAIState.lastSteer = steerInput;

  const segIdx = target.segmentIndex % aiData.segmentSpeeds.length;
  const desiredSpeed = calculateDesiredSpeed(aiData, segIdx, diffConfig);

  let throttle = 0;
  let brake = 0;

  const speedDiff = desiredSpeed - kartState.speed;
  if (speedDiff > 1) {
    throttle = clamp(speedDiff / 10, 0, 1);
    brake = 0;
  } else if (speedDiff < -3) {
    throttle = 0;
    brake = clamp(Math.abs(speedDiff) / 15, 0, 1);
  } else {
    throttle = clamp(speedDiff / 10, 0, 1) * 0.3;
    brake = 0;
  }

  if (Math.abs(angleDiff) > 0.5 && kartState.speed > 20) {
    throttle *= 0.7;
  }

  throttle = lerp(newAIState.lastThrottle, throttle, 0.2);
  newAIState.lastThrottle = throttle;

  newAIState.targetWaypointIndex = nearestIdx;

  return {
    input: {
      throttle: clamp(throttle, 0, 1),
      brake: clamp(brake, 0, 1),
      steer: steerInput,
    },
    aiState: newAIState,
  };
}
