import type { TrackData, TrackWaypoint, TrackCheckpoint, Vec2, Vec3 } from '../types';
import {
  vec2,
  vec3,
  vec2Sub,
  vec2Add,
  vec2Scale,
  vec2Normalize,
  vec2Perp,
  vec2Distance,
  vec2Length,
  vec2Dot,
  vec3Lerp,
  lerp,
  clamp,
} from '../utils/math';

export interface NearestPointResult {
  point: Vec3;
  segmentIndex: number;
  t: number;
  distance: number;
  offset: Vec2;
  direction: Vec2;
}

export function getTrackSegmentCount(track: TrackData): number {
  return track.closed ? track.waypoints.length : track.waypoints.length - 1;
}

export function getTrackWaypoint(track: TrackData, index: number): TrackWaypoint {
  const n = track.waypoints.length;
  if (track.closed) {
    return track.waypoints[((index % n) + n) % n];
  }
  return track.waypoints[clamp(index, 0, n - 1)];
}

export function getTrackSegmentLength(track: TrackData, segmentIndex: number): number {
  const a = getTrackWaypoint(track, segmentIndex);
  const b = getTrackWaypoint(track, segmentIndex + 1);
  return Math.hypot(
    b.position.x - a.position.x,
    b.position.z - a.position.z
  );
}

export function getTrackTotalLength(track: TrackData): number {
  const n = getTrackSegmentCount(track);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += getTrackSegmentLength(track, i);
  }
  return total;
}

export function getPointOnSegment(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function getTrackWidthAt(track: TrackData, segmentIndex: number, t: number): number {
  const a = getTrackWaypoint(track, segmentIndex);
  const b = getTrackWaypoint(track, segmentIndex + 1);
  return lerp(a.width, b.width, t);
}

export function findNearestPointOnTrack(
  track: TrackData,
  point: Vec2
): NearestPointResult {
  const n = getTrackSegmentCount(track);
  let bestDist = Infinity;
  let bestResult: NearestPointResult | null = null;

  for (let i = 0; i < n; i++) {
    const a = getTrackWaypoint(track, i).position;
    const b = getTrackWaypoint(track, i + 1).position;

    const ax = a.x, az = a.z;
    const bx = b.x, bz = b.z;

    const dx = bx - ax;
    const dz = bz - az;
    const segLenSq = dx * dx + dz * dz;

    if (segLenSq < 1e-6) continue;

    let t = ((point.x - ax) * dx + (point.y - az) * dz) / segLenSq;
    t = clamp(t, 0, 1);

    const px = ax + dx * t;
    const pz = az + dz * t;
    const py = lerp(a.y, b.y, t);

    const dist = Math.hypot(point.x - px, point.y - pz);

    if (dist < bestDist) {
      bestDist = dist;
      const dir = vec2Normalize({ x: dx, y: dz });
      const perp = vec2Perp(dir);
      const offsetX = point.x - px;
      const offsetZ = point.y - pz;
      const offsetMag = Math.hypot(offsetX, offsetZ);
      const offsetDir = vec2Dot({ x: offsetX, y: offsetZ }, perp) >= 0 ? 1 : -1;

      bestResult = {
        point: { x: px, y: py, z: pz },
        segmentIndex: i,
        t,
        distance: dist,
        offset: { x: perp.x * offsetMag * offsetDir, y: perp.y * offsetMag * offsetDir },
        direction: dir,
      };
    }
  }

  return bestResult!;
}

export function getTrackHeightAt(
  track: TrackData,
  x: number,
  z: number
): number {
  const nearest = findNearestPointOnTrack(track, { x, y: z });
  return nearest.point.y;
}

export function getTrackSlopeAt(
  track: TrackData,
  x: number,
  z: number
): { slopeX: number; slopeZ: number } {
  const eps = 0.5;
  const h00 = getTrackHeightAt(track, x, z);
  const h10 = getTrackHeightAt(track, x + eps, z);
  const h01 = getTrackHeightAt(track, x, z + eps);
  return {
    slopeX: (h10 - h00) / eps,
    slopeZ: (h01 - h00) / eps,
  };
}

export interface TrackSurface {
  getHeight(x: number, z: number): number;
  getSlope(x: number, z: number): { slopeX: number; slopeZ: number };
}

export function createTrackSurface(track: TrackData): TrackSurface {
  return {
    getHeight: (x, z) => getTrackHeightAt(track, x, z),
    getSlope: (x, z) => getTrackSlopeAt(track, x, z),
  };
}

export function resolveTrackCollision(
  track: TrackData,
  position: Vec2,
  velocity: Vec2,
  kartHalfWidth: number
): { position: Vec2; velocity: Vec2; collided: boolean } {
  const nearest = findNearestPointOnTrack(track, position);
  const trackWidth = getTrackWidthAt(track, nearest.segmentIndex, nearest.t) / 2;
  const effectiveWidth = trackWidth - kartHalfWidth;

  if (nearest.distance <= effectiveWidth) {
    return { position: { ...position }, velocity: { ...velocity }, collided: false };
  }

  const perpDir = vec2Normalize(nearest.offset);
  const pushDist = nearest.distance - effectiveWidth;
  const newPos = {
    x: position.x - perpDir.x * pushDist,
    y: position.y - perpDir.y * pushDist,
  };

  const velDot = velocity.x * perpDir.x + velocity.y * perpDir.y;
  let newVel = { ...velocity };
  if (velDot > 0) {
    const restitution = 0.3;
    const damping = 0.6;
    newVel = {
      x: velocity.x - perpDir.x * velDot * (1 + restitution) * damping,
      y: velocity.y - perpDir.y * velDot * (1 + restitution) * damping,
    };
  }

  return { position: newPos, velocity: newVel, collided: true };
}

export function generateCheckpoints(track: TrackData, count: number): TrackCheckpoint[] {
  const totalLen = getTrackTotalLength(track);
  const spacing = totalLen / count;
  const checkpoints: TrackCheckpoint[] = [];

  let accumulated = 0;
  let segIdx = 0;
  const n = getTrackSegmentCount(track);

  for (let i = 0; i < count; i++) {
    const targetDist = i * spacing;

    while (segIdx < n - 1 && accumulated + getTrackSegmentLength(track, segIdx) < targetDist) {
      accumulated += getTrackSegmentLength(track, segIdx);
      segIdx++;
    }

    const segLen = getTrackSegmentLength(track, segIdx);
    const localT = segLen > 0 ? (targetDist - accumulated) / segLen : 0;

    const a = getTrackWaypoint(track, segIdx).position;
    const b = getTrackWaypoint(track, segIdx + 1).position;
    const pos = getPointOnSegment(a, b, localT);
    const dir = vec2Normalize({ x: b.x - a.x, y: b.z - a.z });
    const width = getTrackWidthAt(track, segIdx, localT);

    checkpoints.push({
      index: i,
      position: pos,
      normal: { x: -dir.y, y: dir.x },
      width,
    });
  }

  return checkpoints;
}

export function checkCheckpointCrossing(
  checkpoint: TrackCheckpoint,
  prevPos: Vec2,
  currPos: Vec2
): boolean {
  const cpPos = { x: checkpoint.position.x, y: checkpoint.position.z };
  const normal = checkpoint.normal;

  const prevOffset = (prevPos.x - cpPos.x) * normal.x + (prevPos.y - cpPos.y) * normal.y;
  const currOffset = (currPos.x - cpPos.x) * normal.x + (currPos.y - cpPos.y) * normal.y;

  if (prevOffset <= 0 && currOffset > 0) {
    const tangent = { x: normal.y, y: -normal.x };
    const t = -prevOffset / (currOffset - prevOffset);
    const crossPoint = {
      x: prevPos.x + (currPos.x - prevPos.x) * t,
      y: prevPos.y + (currPos.y - prevPos.y) * t,
    };
    const alongTangent = (crossPoint.x - cpPos.x) * tangent.x + (crossPoint.y - cpPos.y) * tangent.y;
    if (Math.abs(alongTangent) <= checkpoint.width / 2) {
      return true;
    }
  }

  return false;
}

function generateCircuitWaypoints(
  radius: number,
  segments: number,
  amplitude: number,
  frequency: number,
  heightVariation: number
): TrackWaypoint[] {
  const waypoints: TrackWaypoint[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const noise = Math.sin(angle * frequency) * amplitude;
    const r = radius + noise;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = Math.sin(angle * 3) * heightVariation + Math.sin(angle * 7) * heightVariation * 0.3;
    waypoints.push({
      position: { x, y, z },
      width: 16 + Math.sin(angle * 2) * 3,
    });
  }
  return waypoints;
}

function generateOvalWaypoints(): TrackWaypoint[] {
  const waypoints: TrackWaypoint[] = [];
  const segments = 16;
  const longAxis = 80;
  const shortAxis = 45;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * longAxis;
    const z = Math.sin(angle) * shortAxis;
    const y = Math.sin(angle * 2) * 4;
    waypoints.push({
      position: { x, y, z },
      width: 18,
    });
  }
  return waypoints;
}

function generateFigure8Waypoints(): TrackWaypoint[] {
  const waypoints: TrackWaypoint[] = [];
  const segments = 24;
  const scale = 60;

  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = Math.sin(t) * scale;
    const z = Math.sin(t * 2) * scale * 0.5;
    const y = Math.sin(t * 3) * 5;
    waypoints.push({
      position: { x, y, z },
      width: 14 + Math.sin(t * 2) * 2,
    });
  }
  return waypoints;
}

export const TRACKS: TrackData[] = [
  {
    name: '经典环形',
    waypoints: generateCircuitWaypoints(60, 20, 15, 3, 6),
    checkpoints: [],
    width: 16,
    closed: true,
  },
  {
    name: '椭圆高速',
    waypoints: generateOvalWaypoints(),
    checkpoints: [],
    width: 18,
    closed: true,
  },
  {
    name: '8字回旋',
    waypoints: generateFigure8Waypoints(),
    checkpoints: [],
    width: 14,
    closed: true,
  },
];

export function initTracks(): TrackData[] {
  return TRACKS.map(track => ({
    ...track,
    checkpoints: generateCheckpoints(track, 8),
  }));
}

export function generateIdealLine(track: TrackData, smoothness: number = 3): TrackWaypoint[] {
  const waypoints = track.waypoints;
  const n = waypoints.length;
  if (!track.closed || n < 3) return [...waypoints];

  let result = waypoints.map(wp => ({
    position: { ...wp.position },
    width: wp.width,
  }));

  for (let iter = 0; iter < smoothness * 2; iter++) {
    const smoothed = result.map((wp, i) => {
      const prev = result[(i - 1 + n) % n];
      const next = result[(i + 1) % n];
      return {
        position: {
          x: (prev.position.x + wp.position.x * 2 + next.position.x) / 4,
          y: (prev.position.y + wp.position.y * 2 + next.position.y) / 4,
          z: (prev.position.z + wp.position.z * 2 + next.position.z) / 4,
        },
        width: wp.width,
      };
    });
    result = smoothed;
  }

  return result;
}
