import * as THREE from 'three';
import type { KartState, TrackData, GameState } from '../types';
import { createTrackMesh, createGround } from './trackMesh';
import { createKartMesh, updateKartMesh } from './kartMesh';
import { FollowCamera } from './followCamera';

export interface RendererKart {
  id: number;
  state: KartState;
  mesh: THREE.Group;
  isPlayer: boolean;
}

export class GameRenderer {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private followCamera: FollowCamera;
  private trackGroup: THREE.Group | null = null;
  private ground: THREE.Mesh | null = null;
  private karts: RendererKart[] = [];
  private ambientLight: THREE.AmbientLight;
  private directionalLight: THREE.DirectionalLight;
  private sky: THREE.Mesh;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 100, 400);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 10, -20);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.followCamera = new FollowCamera(this.camera);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(50, 80, 30);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 300;
    this.directionalLight.shadow.camera.left = -150;
    this.directionalLight.shadow.camera.right = 150;
    this.directionalLight.shadow.camera.top = 150;
    this.directionalLight.shadow.camera.bottom = -150;
    this.scene.add(this.directionalLight);

    const skyGeom = new THREE.SphereGeometry(400, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      side: THREE.BackSide,
    });
    this.sky = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.sky);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public loadTrack(track: TrackData): void {
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    if (this.ground) {
      this.scene.remove(this.ground);
    }

    this.trackGroup = createTrackMesh(track);
    this.scene.add(this.trackGroup);

    this.ground = createGround();
    this.scene.add(this.ground);
  }

  public addKart(id: number, color: number, isPlayer: boolean, initialState: KartState): void {
    const mesh = createKartMesh(color);
    updateKartMesh(mesh, initialState);
    this.scene.add(mesh);
    this.karts.push({ id, state: initialState, mesh, isPlayer });
  }

  public removeAllKarts(): void {
    for (const kart of this.karts) {
      this.scene.remove(kart.mesh);
    }
    this.karts = [];
  }

  public updateKartState(id: number, state: KartState): void {
    const kart = this.karts.find(k => k.id === id);
    if (kart) {
      kart.state = state;
      updateKartMesh(kart.mesh, state);
    }
  }

  public render(dt: number, playerKartId: number, gameState: GameState): void {
    const playerKart = this.karts.find(k => k.id === playerKartId);
    if (playerKart) {
      this.followCamera.update(playerKart.state, dt);
      this.sky.position.set(
        playerKart.state.position.x,
        playerKart.state.position.y,
        playerKart.state.position.z
      );
    }

    this.renderer.render(this.scene, this.camera);
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
