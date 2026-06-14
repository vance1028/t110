import { describe, it, expect } from 'vitest';
import {
  createKartState,
  DEFAULT_KART_CONFIG,
  updateKartPhysics,
  integrateKartFixedStep,
} from '../src/physics/kartPhysics';
import { vec3 } from '../src/utils/math';

describe('Kart Physics', () => {
  it('should create a kart with default zero state', () => {
    const state = createKartState();
    expect(state.position.x).toBe(0);
    expect(state.position.y).toBe(0);
    expect(state.position.z).toBe(0);
    expect(state.velocity.x).toBe(0);
    expect(state.velocity.y).toBe(0);
    expect(state.velocity.z).toBe(0);
    expect(state.heading).toBe(0);
    expect(state.speed).toBe(0);
  });

  it('should create kart with custom position and heading', () => {
    const state = createKartState(vec3(10, 0, 20), Math.PI / 2);
    expect(state.position.x).toBe(10);
    expect(state.position.z).toBe(20);
    expect(state.heading).toBe(Math.PI / 2);
  });

  it('should accelerate forward when throttle is applied', () => {
    let state = createKartState();
    const input = { throttle: 1, brake: 0, steer: 0 };
    const dt = 0.1;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.speed).toBeGreaterThan(0);
    expect(state.velocity.z).toBeLessThan(0);
  });

  it('should not move when no input', () => {
    let state = createKartState();
    const input = { throttle: 0, brake: 0, steer: 0 };
    const dt = 0.1;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.speed).toBe(0);
    expect(state.position.x).toBe(0);
    expect(state.position.z).toBe(0);
  });

  it('should slow down due to drag when coasting', () => {
    let state = createKartState();
    state.speed = 20;
    state.velocity.z = -20;
    const input = { throttle: 0, brake: 0, steer: 0 };
    const dt = 0.1;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.speed).toBeLessThan(20);
  });

  it('should brake and reduce speed', () => {
    let state = createKartState();
    state.speed = 20;
    state.velocity.z = -20;
    const input = { throttle: 0, brake: 1, steer: 0 };
    const dt = 0.1;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.speed).toBeLessThan(20);
  });

  it('should turn when steering', () => {
    let state = createKartState();
    state.speed = 10;
    state.velocity.z = -10;
    const input = { throttle: 0, brake: 0, steer: 1 };
    const dt = 0.1;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.heading).toBeGreaterThan(0);
  });

  it('should not turn when stationary', () => {
    let state = createKartState();
    const input = { throttle: 0, brake: 0, steer: 1 };
    const dt = 0.1;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.heading).toBe(0);
  });

  it('should have max speed limit', () => {
    let state = createKartState();
    const input = { throttle: 1, brake: 0, steer: 0 };
    const dt = 1;

    for (let i = 0; i < 100; i++) {
      state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);
    }

    expect(state.speed).toBeLessThanOrEqual(DEFAULT_KART_CONFIG.maxSpeed * 1.05);
  });

  it('should produce deterministic results with fixed step', () => {
    const input = { throttle: 0.8, brake: 0, steer: 0.3 };
    const totalDt = 1;
    const fixedStep = 1 / 120;

    const state1 = createKartState();
    const result1 = integrateKartFixedStep(state1, input, totalDt, DEFAULT_KART_CONFIG, fixedStep);

    const state2 = createKartState();
    const result2 = integrateKartFixedStep(state2, input, totalDt, DEFAULT_KART_CONFIG, fixedStep);

    expect(result1.position.x).toBe(result2.position.x);
    expect(result1.position.z).toBe(result2.position.z);
    expect(result1.heading).toBe(result2.heading);
    expect(result1.speed).toBe(result2.speed);
  });

  it('should move forward when heading is zero', () => {
    let state = createKartState();
    const input = { throttle: 1, brake: 0, steer: 0 };
    const dt = 0.5;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.position.z).toBeLessThan(0);
    expect(state.position.x).toBeCloseTo(0, 5);
  });

  it('should move in heading direction', () => {
    let state = createKartState(vec3(0, 0, 0), Math.PI / 2);
    const input = { throttle: 1, brake: 0, steer: 0 };
    const dt = 0.5;

    state = updateKartPhysics(state, input, dt, DEFAULT_KART_CONFIG);

    expect(state.position.x).toBeGreaterThan(0);
    expect(state.position.z).toBeCloseTo(0, 3);
  });

  it('should accumulate multiple fixed steps correctly', () => {
    const input = { throttle: 1, brake: 0, steer: 0 };
    const state1 = createKartState();
    const state2 = createKartState();

    const bigStep = integrateKartFixedStep(state1, input, 1, DEFAULT_KART_CONFIG, 1 / 120);
    let smallStepResult = state2;
    for (let i = 0; i < 10; i++) {
      smallStepResult = integrateKartFixedStep(smallStepResult, input, 0.1, DEFAULT_KART_CONFIG, 1 / 120);
    }

    expect(bigStep.position.z).toBeCloseTo(smallStepResult.position.z, 5);
    expect(bigStep.speed).toBeCloseTo(smallStepResult.speed, 5);
  });
});
