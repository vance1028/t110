import * as THREE from 'three';
import type { KartState } from '../types';

export function createKartMesh(color: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'kart';

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.3,
  });

  const chassisGeom = new THREE.BoxGeometry(1.8, 0.5, 3.2);
  const chassis = new THREE.Mesh(chassisGeom, bodyMat);
  chassis.position.y = 0.4;
  chassis.castShadow = true;
  group.add(chassis);

  const cabinGeom = new THREE.BoxGeometry(1.4, 0.6, 1.5);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.5,
    metalness: 0.9,
    roughness: 0.1,
  });
  const cabin = new THREE.Mesh(cabinGeom, cabinMat);
  cabin.position.set(0, 0.95, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  const noseGeom = new THREE.BoxGeometry(1.4, 0.3, 0.6);
  const nose = new THREE.Mesh(noseGeom, bodyMat);
  nose.position.set(0, 0.3, -1.6);
  nose.castShadow = true;
  group.add(nose);

  const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.9,
  });

  const wheelPositions = [
    [-0.9, 0.35, 1.1],
    [0.9, 0.35, 1.1],
    [-0.9, 0.35, -1.1],
    [0.9, 0.35, -1.1],
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  }

  const rearWingGeom = new THREE.BoxGeometry(2.0, 0.1, 0.4);
  const rearWing = new THREE.Mesh(rearWingGeom, bodyMat);
  rearWing.position.set(0, 1.3, 1.5);
  rearWing.castShadow = true;
  group.add(rearWing);

  const wingSupportGeom = new THREE.BoxGeometry(0.1, 0.5, 0.1);
  const leftSupport = new THREE.Mesh(wingSupportGeom, bodyMat);
  leftSupport.position.set(-0.8, 1.05, 1.5);
  group.add(leftSupport);

  const rightSupport = new THREE.Mesh(wingSupportGeom, bodyMat);
  rightSupport.position.set(0.8, 1.05, 1.5);
  group.add(rightSupport);

  const exhaustGeom = new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8);
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    metalness: 0.8,
    roughness: 0.4,
  });
  const exhaust = new THREE.Mesh(exhaustGeom, exhaustMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0, 0.3, 1.8);
  group.add(exhaust);

  return group;
}

export function updateKartMesh(mesh: THREE.Group, state: KartState): void {
  mesh.position.set(state.position.x, state.position.y, state.position.z);
  mesh.rotation.y = -state.heading;

  const tiltAmount = state.driftAngle * 0.3;
  mesh.rotation.z = -tiltAmount;

  const speedFactor = Math.min(Math.abs(state.speed) / 30, 1);
  mesh.position.y += Math.abs(Math.sin(state.speed * 0.5)) * 0.05 * speedFactor;
}
