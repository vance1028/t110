import * as THREE from 'three';
import type { KartState } from '../types';

export interface FollowCameraConfig {
  distance: number;
  height: number;
  lookAhead: number;
  smoothness: number;
  tiltAmount: number;
}

export const DEFAULT_FOLLOW_CAMERA_CONFIG: FollowCameraConfig = {
  distance: 12,
  height: 5,
  lookAhead: 6,
  smoothness: 5,
  tiltAmount: 0.15,
};

export class FollowCamera {
  private camera: THREE.PerspectiveCamera;
  private config: FollowCameraConfig;
  private targetPosition: THREE.Vector3;
  private targetLookAt: THREE.Vector3;
  private currentPosition: THREE.Vector3;
  private currentLookAt: THREE.Vector3;

  constructor(camera: THREE.PerspectiveCamera, config?: Partial<FollowCameraConfig>) {
    this.camera = camera;
    this.config = { ...DEFAULT_FOLLOW_CAMERA_CONFIG, ...config };
    this.targetPosition = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
  }

  public update(kartState: KartState, dt: number): void {
    const heading = kartState.heading;
    const speedFactor = Math.min(Math.abs(kartState.speed) / 50, 1);

    const dynamicDistance = this.config.distance + speedFactor * 4;
    const dynamicHeight = this.config.height + speedFactor * 1.5;

    const backX = Math.sin(heading) * dynamicDistance;
    const backZ = Math.cos(heading) * dynamicDistance;

    this.targetPosition.set(
      kartState.position.x + backX,
      kartState.position.y + dynamicHeight,
      kartState.position.z + backZ
    );

    const aheadX = Math.sin(heading) * -this.config.lookAhead;
    const aheadZ = Math.cos(heading) * -this.config.lookAhead;

    this.targetLookAt.set(
      kartState.position.x + aheadX,
      kartState.position.y + 1,
      kartState.position.z + aheadZ
    );

    const smoothFactor = Math.min(this.config.smoothness * dt, 1);
    this.currentPosition.lerp(this.targetPosition, smoothFactor);
    this.currentLookAt.lerp(this.targetLookAt, smoothFactor);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    const dynamicFov = 60 + speedFactor * 15;
    this.camera.fov = dynamicFov;
    this.camera.updateProjectionMatrix();
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public setConfig(config: Partial<FollowCameraConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
