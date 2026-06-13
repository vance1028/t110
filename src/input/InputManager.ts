import type { KartInput } from '../types';

export class InputManager {
  private keys: Set<string> = new Set();
  private input: KartInput = {
    throttle: 0,
    brake: 0,
    steer: 0,
  };
  private acceleration: number = 8;
  private steerAcceleration: number = 10;
  private steerReturn: number = 8;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  public update(dt: number): KartInput {
    const accel = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const brake = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');

    const targetThrottle = accel ? 1 : 0;
    const targetBrake = brake ? 1 : 0;

    this.input.throttle += (targetThrottle - this.input.throttle) * Math.min(this.acceleration * dt, 1);
    this.input.brake += (targetBrake - this.input.brake) * Math.min(this.acceleration * dt, 1);

    let targetSteer = 0;
    if (left) targetSteer -= 1;
    if (right) targetSteer += 1;

    if (targetSteer !== 0) {
      this.input.steer += targetSteer * this.steerAcceleration * dt;
      this.input.steer = Math.max(-1, Math.min(1, this.input.steer));
    } else {
      if (this.input.steer > 0) {
        this.input.steer = Math.max(0, this.input.steer - this.steerReturn * dt);
      } else if (this.input.steer < 0) {
        this.input.steer = Math.min(0, this.input.steer + this.steerReturn * dt);
      }
    }

    return { ...this.input };
  }

  public isKeyPressed(code: string): boolean {
    return this.keys.has(code);
  }

  public clearKey(code: string): void {
    this.keys.delete(code);
  }

  public reset(): void {
    this.input = { throttle: 0, brake: 0, steer: 0 };
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
