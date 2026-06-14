import type { KartState, KartInput, KartPhysicsConfig } from '../types';
import {
  clamp,
  normalizeAngle,
  vec3,
  vec3Add,
  vec3Scale,
  vec3Length,
  vec3Normalize,
  vec3Dot,
} from '../utils/math';

export const DEFAULT_KART_CONFIG: KartPhysicsConfig = {
  maxSpeed: 50,
  acceleration: 25,
  brakeForce: 40,
  turnRate: 2.8,
  driftFactor: 0.65,
  grip: 8.0,
  drag: 0.008,
  rollingResistance: 0.8,
  mass: 100,
  gravity: 9.8,
  width: 2.0,
  length: 3.5,
};

export function createKartState(position = vec3(), heading = 0): KartState {
  return {
    position: { ...position },
    velocity: vec3(),
    heading,
    angularVelocity: 0,
    speed: 0,
    driftAngle: 0,
    isGrounded: true,
  };
}

export function getForwardVector(heading: number) {
  return {
    x: Math.sin(heading),
    z: -Math.cos(heading),
  };
}

export function getRightVector(heading: number) {
  return {
    x: Math.cos(heading),
    z: Math.sin(heading),
  };
}

interface SurfaceInfo {
  normal: { x: number; y: number; z: number };
  height: number;
}

function getSurfaceNormal(slopeX: number, slopeZ: number): { x: number; y: number; z: number } {
  const ny = 1;
  const nx = -slopeX;
  const nz = -slopeZ;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return { x: nx / len, y: ny / len, z: nz / len };
}

export interface TrackSurfaceProvider {
  getHeight(x: number, z: number): number;
  getSlope(x: number, z: number): { slopeX: number; slopeZ: number };
}

export function updateKartPhysics(
  state: KartState,
  input: KartInput,
  dt: number,
  config: KartPhysicsConfig,
  surface?: TrackSurfaceProvider
): KartState {
  const newState: KartState = {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
  };

  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const steer = clamp(input.steer, -1, 1);

  const forward = getForwardVector(newState.heading);
  const right = getRightVector(newState.heading);

  let surfaceHeight = 0;
  let surfaceNormal = { x: 0, y: 1, z: 0 };
  if (surface) {
    surfaceHeight = surface.getHeight(newState.position.x, newState.position.z);
    const slope = surface.getSlope(newState.position.x, newState.position.z);
    surfaceNormal = getSurfaceNormal(slope.slopeX, slope.slopeZ);
  }

  const forward3D = { x: forward.x, y: 0, z: forward.z };
  const speedAlongForward = newState.velocity.x * forward.x + newState.velocity.z * forward.z;
  const speedAlongRight = newState.velocity.x * right.x + newState.velocity.z * right.z;

  newState.speed = speedAlongForward;

  let accelerationForce = 0;
  if (throttle > 0) {
    const speedFactor = 1 - Math.abs(speedAlongForward) / config.maxSpeed;
    accelerationForce = throttle * config.acceleration * Math.max(0.15, speedFactor);
  }

  let brakeForce = 0;
  if (brake > 0) {
    if (speedAlongForward > 0) {
      brakeForce = -brake * config.brakeForce;
    } else if (speedAlongForward < 0) {
      brakeForce = brake * config.brakeForce;
    }
  }

  let gravityForce = 0;
  if (surface) {
    gravityForce = config.gravity * -surfaceNormal.y * forward.z;
    gravityForce += config.gravity * -surfaceNormal.x * forward.x;
  }

  let dragForce = -config.drag * speedAlongForward * Math.abs(speedAlongForward);
  let rollingResistanceForce = -config.rollingResistance * Math.sign(speedAlongForward) * Math.min(Math.abs(speedAlongForward), 2);

  let totalForce = accelerationForce + brakeForce + gravityForce + dragForce + rollingResistanceForce;
  let newForwardSpeed = speedAlongForward + totalForce * dt;

  const steerSpeedFactor = clamp(Math.abs(speedAlongForward) / (config.maxSpeed * 0.3), 0, 1);
  const steerAmount = steer * config.turnRate * steerSpeedFactor;
  newState.heading += steerAmount * dt;
  newState.heading = normalizeAngle(newState.heading);

  const lateralSpeed = speedAlongRight;
  const gripForce = -lateralSpeed * config.grip;
  let newLateralSpeed = lateralSpeed + gripForce * dt;

  const lateralSlip = Math.abs(newLateralSpeed) / Math.max(1, Math.abs(newForwardSpeed));
  const driftThreshold = 4.0;
  if (lateralSlip > driftThreshold * 0.3) {
    const driftAmount = clamp((lateralSlip - driftThreshold * 0.3) / (driftThreshold * 0.7), 0, 1);
    newLateralSpeed *= (1 - driftAmount * 0.3 * config.driftFactor);
    newState.driftAngle = Math.atan2(newLateralSpeed, newForwardSpeed);
  } else {
    newState.driftAngle = 0;
  }

  newState.velocity.x = newForwardSpeed * forward.x + newLateralSpeed * right.x;
  newState.velocity.z = newForwardSpeed * forward.z + newLateralSpeed * right.z;

  newState.position.x += newState.velocity.x * dt;
  newState.position.z += newState.velocity.z * dt;

  if (surface) {
    newState.position.y = surfaceHeight;
    newState.isGrounded = true;
    newState.velocity.y = 0;
  }

  newState.speed = newForwardSpeed;

  return newState;
}

export function integrateKartFixedStep(
  state: KartState,
  input: KartInput,
  totalDt: number,
  config: KartPhysicsConfig,
  fixedStep: number = 1 / 120,
  surface?: TrackSurfaceProvider
): KartState {
  let remaining = totalDt;
  let currentState = state;
  
  while (remaining > 0) {
    const step = Math.min(remaining, fixedStep);
    currentState = updateKartPhysics(currentState, input, step, config, surface);
    remaining -= step;
  }
  
  return currentState;
}
