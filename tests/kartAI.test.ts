import { describe, it, expect } from 'vitest';
import {
  buildAITrackData,
  createAIState,
  computeAIInput,
  findNearestWaypointIndex,
  getTargetPoint,
  calculateDesiredSpeed,
  DIFFICULTY_CONFIGS,
} from '../src/ai/kartAI';
import { initTracks, generateIdealLine } from '../src/track/track';
import { createKartState, DEFAULT_KART_CONFIG } from '../src/physics/kartPhysics';
import { vec3 } from '../src/utils/math';

describe('Kart AI', () => {
  function createTestTrackData() {
    const tracks = initTracks();
    const track = tracks[0];
    const idealLine = generateIdealLine(track, 3);
    return buildAITrackData({
      waypoints: track.waypoints,
      closed: track.closed,
      idealLine,
    });
  }

  it('should build AI track data with segment info', () => {
    const aiData = createTestTrackData();
    expect(aiData.segmentSpeeds.length).toBeGreaterThan(0);
    expect(aiData.segmentCurvature.length).toBeGreaterThan(0);
    expect(aiData.segmentSpeeds.length).toBe(aiData.segmentCurvature.length);
    expect(aiData.idealLine.length).toBeGreaterThan(0);
  });

  it('should find nearest waypoint', () => {
    const aiData = createTestTrackData();
    const firstWp = aiData.idealLine[0];

    const idx = findNearestWaypointIndex(aiData, firstWp.position);
    expect(idx).toBe(0);
  });

  it('should get target point ahead of current position', () => {
    const aiData = createTestTrackData();

    const target = getTargetPoint(aiData, 0, 30);

    const startPos = aiData.idealLine[0].position;
    const dist = Math.hypot(
      target.point.x - startPos.x,
      target.point.z - startPos.z
    );

    expect(dist).toBeGreaterThan(20);
    expect(dist).toBeLessThan(50);
  });

  it('should calculate lower speed for tighter turns', () => {
    const aiData = createTestTrackData();
    const difficulty = DIFFICULTY_CONFIGS.medium;

    let minSpeed = Infinity;
    let maxSpeed = -Infinity;
    let minSpeedIdx = 0;
    let maxSpeedIdx = 0;

    for (let i = 0; i < aiData.segmentSpeeds.length; i++) {
      const speed = calculateDesiredSpeed(aiData, i, difficulty);
      if (speed < minSpeed) {
        minSpeed = speed;
        minSpeedIdx = i;
      }
      if (speed > maxSpeed) {
        maxSpeed = speed;
        maxSpeedIdx = i;
      }
    }

    expect(minSpeed).toBeLessThan(maxSpeed);
  });

  it('should produce throttle when moving slower than target speed', () => {
    const aiData = createTestTrackData();
    const aiState = createAIState();

    const startWp = aiData.idealLine[0];
    const nextWp = aiData.idealLine[1];
    const heading = Math.atan2(nextWp.position.x - startWp.position.x, -(nextWp.position.z - startWp.position.z));

    const kartState = createKartState(startWp.position, heading);
    kartState.speed = 5;
    kartState.velocity.z = -5 * Math.cos(heading);
    kartState.velocity.x = 5 * Math.sin(heading);

    const { input } = computeAIInput(kartState, aiState, aiData, 'medium');

    expect(input.throttle).toBeGreaterThan(0);
    expect(Math.abs(input.steer)).toBeLessThanOrEqual(1);
  });

  it('should throttle down when approaching a sharp turn', () => {
    const tracks = initTracks();
    const track = tracks[0];
    const idealLine = generateIdealLine(track, 3);
    const aiData = buildAITrackData({
      waypoints: track.waypoints,
      closed: track.closed,
      idealLine,
    });

    let maxCurveIdx = 0;
    let maxCurve = 0;
    for (let i = 0; i < aiData.segmentCurvature.length; i++) {
      if (aiData.segmentCurvature[i] > maxCurve) {
        maxCurve = aiData.segmentCurvature[i];
        maxCurveIdx = i;
      }
    }

    const aiState = createAIState();
    aiState.targetWaypointIndex = Math.max(0, maxCurveIdx - 3);

    const wp = aiData.idealLine[aiState.targetWaypointIndex];
    const nextWp = aiData.idealLine[aiState.targetWaypointIndex + 1];
    const heading = Math.atan2(nextWp.position.x - wp.position.x, -(nextWp.position.z - wp.position.z));

    const kartState = createKartState(wp.position, heading);
    kartState.speed = 40;
    kartState.velocity.x = 40 * Math.sin(heading);
    kartState.velocity.z = -40 * Math.cos(heading);

    const { input } = computeAIInput(kartState, aiState, aiData, 'hard');

    expect(input.throttle).toBeLessThan(0.9);
  });

  it('should have different target speeds for different difficulties', () => {
    const tracks = initTracks();
    const track = tracks[0];
    const idealLine = generateIdealLine(track, 3);
    const aiData = buildAITrackData({
      waypoints: track.waypoints,
      closed: track.closed,
      idealLine,
    });

    const easySpeed = calculateDesiredSpeed(aiData, 5, DIFFICULTY_CONFIGS.easy);
    const mediumSpeed = calculateDesiredSpeed(aiData, 5, DIFFICULTY_CONFIGS.medium);
    const hardSpeed = calculateDesiredSpeed(aiData, 5, DIFFICULTY_CONFIGS.hard);

    expect(hardSpeed).toBeGreaterThan(mediumSpeed);
    expect(mediumSpeed).toBeGreaterThan(easySpeed);
  });

  it('should steer toward the track when off center', () => {
    const aiData = createTestTrackData();
    const aiState = createAIState();

    const wp = aiData.idealLine[5];
    const nextWp = aiData.idealLine[6];
    const dirX = nextWp.position.x - wp.position.x;
    const dirZ = nextWp.position.z - wp.position.z;
    const len = Math.hypot(dirX, dirZ);
    const perpX = -dirZ / len;
    const perpZ = dirX / len;
    const heading = Math.atan2(dirX, -dirZ);

    const offCenterPos = vec3(
      wp.position.x + perpX * 5,
      wp.position.y,
      wp.position.z + perpZ * 5
    );

    const kartState = createKartState(offCenterPos, heading);
    kartState.speed = 20;
    kartState.velocity.x = dirX / len * 20;
    kartState.velocity.z = dirZ / len * 20;

    const { input } = computeAIInput(kartState, aiState, aiData, 'medium');

    expect(input.steer).not.toBe(0);
  });

  it('should brake when going much faster than target speed', () => {
    const aiData = createTestTrackData();
    const aiState = createAIState();

    const wp = aiData.idealLine[10];
    const nextWp = aiData.idealLine[11];
    const heading = Math.atan2(nextWp.position.x - wp.position.x, -(nextWp.position.z - wp.position.z));

    const kartState = createKartState(wp.position, heading);
    kartState.speed = 80;
    kartState.velocity.x = 80 * Math.sin(heading);
    kartState.velocity.z = -80 * Math.cos(heading);

    const { input } = computeAIInput(kartState, aiState, aiData, 'medium');

    expect(input.brake).toBeGreaterThan(0);
  });
});
