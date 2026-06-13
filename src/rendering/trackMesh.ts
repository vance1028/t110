import * as THREE from 'three';
import type { TrackData } from '../types';
import { getTrackWaypoint, getTrackSegmentCount, getTrackWidthAt } from '../track/track';

export function createTrackMesh(track: TrackData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'track';

  const roadGeometry = createRoadGeometry(track);
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: false,
  });
  const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const leftBarrier = createBarrierMesh(track, 1);
  const rightBarrier = createBarrierMesh(track, -1);
  group.add(leftBarrier);
  group.add(rightBarrier);

  const startLine = createStartLine(track);
  group.add(startLine);

  const checkpointMarkers = createCheckpointMarkers(track);
  group.add(checkpointMarkers);

  return group;
}

function createRoadGeometry(track: TrackData): THREE.BufferGeometry {
  const segmentCount = getTrackSegmentCount(track);
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segmentCount; i++) {
    const wp = getTrackWaypoint(track, i).position;
    const prevWp = getTrackWaypoint(track, i - 1).position;
    const nextWp = getTrackWaypoint(track, i + 1).position;

    let dirX: number, dirZ: number;
    if (i === 0 && !track.closed) {
      dirX = nextWp.x - wp.x;
      dirZ = nextWp.z - wp.z;
    } else if (i === segmentCount && !track.closed) {
      dirX = wp.x - prevWp.x;
      dirZ = wp.z - prevWp.z;
    } else {
      const prevDirX = wp.x - prevWp.x;
      const prevDirZ = wp.z - prevWp.z;
      const nextDirX = nextWp.x - wp.x;
      const nextDirZ = nextWp.z - wp.z;
      const prevLen = Math.hypot(prevDirX, prevDirZ);
      const nextLen = Math.hypot(nextDirX, nextDirZ);
      dirX = (prevDirX / prevLen + nextDirX / nextLen) * 0.5;
      dirZ = (prevDirZ / prevLen + nextDirZ / nextLen) * 0.5;
    }

    const len = Math.hypot(dirX, dirZ);
    if (len > 0) {
      dirX /= len;
      dirZ /= len;
    }

    const perpX = -dirZ;
    const perpZ = dirX;

    const width = getTrackWidthAt(track, i, 0);
    const halfWidth = width / 2;

    const leftX = wp.x + perpX * halfWidth;
    const leftZ = wp.z + perpZ * halfWidth;
    const rightX = wp.x - perpX * halfWidth;
    const rightZ = wp.z - perpZ * halfWidth;

    vertices.push(leftX, wp.y + 0.05, leftZ);
    vertices.push(rightX, wp.y + 0.05, rightZ);

    normals.push(0, 1, 0);
    normals.push(0, 1, 0);

    uvs.push(0, i / segmentCount);
    uvs.push(1, i / segmentCount);
  }

  for (let i = 0; i < segmentCount; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = i * 2 + 2;
    const d = i * 2 + 3;

    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function createBarrierMesh(track: TrackData, side: number): THREE.Group {
  const group = new THREE.Group();
  group.name = side > 0 ? 'leftBarrier' : 'rightBarrier';

  const segmentCount = getTrackSegmentCount(track);
  const barrierHeight = 1.5;
  const barrierWidth = 0.5;

  const material = new THREE.MeshStandardMaterial({
    color: side > 0 ? 0xff4444 : 0x4444ff,
    roughness: 0.8,
    metalness: 0.2,
  });

  for (let i = 0; i < segmentCount; i++) {
    const a = getTrackWaypoint(track, i).position;
    const b = getTrackWaypoint(track, i + 1).position;

    const dirX = b.x - a.x;
    const dirZ = b.z - a.z;
    const segLen = Math.hypot(dirX, dirZ);
    if (segLen < 0.1) continue;

    const nx = -dirZ / segLen;
    const nz = dirX / segLen;

    const widthA = getTrackWidthAt(track, i, 0) / 2;
    const widthB = getTrackWidthAt(track, i + 1, 0) / 2;

    const ax = a.x + nx * side * (widthA + barrierWidth / 2);
    const az = a.z + nz * side * (widthA + barrierWidth / 2);
    const bx = b.x + nx * side * (widthB + barrierWidth / 2);
    const bz = b.z + nz * side * (widthB + barrierWidth / 2);

    const midX = (ax + bx) / 2;
    const midY = (a.y + b.y) / 2 + barrierHeight / 2;
    const midZ = (az + bz) / 2;

    const angle = Math.atan2(dirX, dirZ);

    const geom = new THREE.BoxGeometry(barrierWidth, barrierHeight, segLen);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(midX, midY, midZ);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    group.add(mesh);
  }

  return group;
}

function createStartLine(track: TrackData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'startLine';

  const startWp = track.waypoints[0];
  const nextWp = track.waypoints[1];

  const dirX = nextWp.position.x - startWp.position.x;
  const dirZ = nextWp.position.z - startWp.position.z;
  const len = Math.hypot(dirX, dirZ);
  const nx = -dirZ / len;
  const nz = dirX / len;

  const halfWidth = startWp.width / 2;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  
  const stripeCount = 8;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect((i / stripeCount) * 256, 0, 256 / stripeCount, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
  });

  const geom = new THREE.PlaneGeometry(startWp.width, 3);
  const mesh = new THREE.Mesh(geom, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(startWp.position.x, startWp.position.y + 0.1, startWp.position.z);
  mesh.rotation.z = Math.atan2(nx, nz);

  group.add(mesh);
  return group;
}

function createCheckpointMarkers(track: TrackData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'checkpoints';

  for (let i = 0; i < track.checkpoints.length; i++) {
    const cp = track.checkpoints[i];
    
    const markerGeom = new THREE.ConeGeometry(0.5, 2, 8);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0x444400,
      transparent: true,
      opacity: 0.6,
    });
    
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.position.set(cp.position.x, cp.position.y + 3, cp.position.z);
    group.add(marker);
  }

  return group;
}

export function createGround(): THREE.Mesh {
  const size = 500;
  const geometry = new THREE.PlaneGeometry(size, size, 50, 50);
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a6b35,
    roughness: 1.0,
  });

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getY(i);
    const noise = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 2;
    positions.setZ(i, noise);
  }
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -5;
  mesh.receiveShadow = true;

  return mesh;
}
