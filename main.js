import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';

// ================= Config =================
const CHUNK_SIZE = 32;
const BLOCK_SIZE = 1;
const WORLD_HEIGHT = 32;

// Load wood texture
const textureLoader = new THREE.TextureLoader();
const woodTexture = textureLoader.load('https://art.pixilart.com/4f7e90163ba6436.png');
const dirtTexture = textureLoader.load('https://art.pixilart.com/8958a2c64b6def8.png');
const grassTexture = textureLoader.load('https://cdn.modrinth.com/data/wcxzqGUc/8a127e882e07a03d29e62d44671a2359ef7b336b.png');
const stoneTexture = textureLoader.load('https://art.pixilart.com/f1ec53c57ac5a99.png');
const leafTexture = textureLoader.load('https://cdn.modrinth.com/data/Ocyuzgoe/f51e8ebd6737cad5c7b1d3d81bf17f2eef4164f4.png');

const BLOCK_TYPES = {
  1: { name: 'Grass', texture: grassTexture },
  2: { name: 'Dirt', texture: dirtTexture },
  3: { name: 'Stone', texture: stoneTexture },
  4: { name: 'Wood', texture: woodTexture },
  5: { name: 'Leaves', texture: leafTexture }
};

// ================= Scene =================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0006);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 30, 0);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(100, 200, 100);
light.castShadow = true;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// ================= World =================
function makeBlock(type) {
  const blockData = BLOCK_TYPES[type];
  let mat;
  if (blockData.texture) {
    mat = new THREE.MeshStandardMaterial({ map: blockData.texture });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: blockData.color });
  }
  const geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.blockType = type;
  return mesh;
}

const blocks = {};
function setBlock(x, y, z, type) {
  const key = `${x},${y},${z}`;
  if (blocks[key]) scene.remove(blocks[key]);
  const mesh = makeBlock(type);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(mesh);
  blocks[key] = mesh;
}

function getBlockAt(x, y, z) {
  return blocks[`${x},${y},${z}`];
}

function removeBlock(x, y, z) {
  const key = `${x},${y},${z}`;
  if (blocks[key]) {
    scene.remove(blocks[key]);
    delete blocks[key];
  }
}

function generateTree(x, y, z) {
  const height = 4 + Math.floor(Math.random() * 2);
  for (let i = 0; i < height; i++) {
    setBlock(x, y + i, z, 4);
  }
  const topY = y + height;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 0; dy <= 2; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + dy < 5) {
          const bx = x + dx;
          const by = topY + dy;
          const bz = z + dz;
          if (!getBlockAt(bx, by, bz)) setBlock(bx, by, bz, 5);
        }
      }
    }
  }
}

function generateWorld() {
  for (let x = -CHUNK_SIZE; x < CHUNK_SIZE; x++) {
    for (let z = -CHUNK_SIZE; z < CHUNK_SIZE; z++) {
      const height = 5 + Math.floor(Math.sin(x * 0.1) * 2 + Math.cos(z * 0.1) * 2);
      for (let y = 0; y < height; y++) {
        if (y === height - 1) setBlock(x, y, z, 1);
        else if (y > height - 4) setBlock(x, y, z, 2);
        else setBlock(x, y, z, 3);
      }
      if (Math.random() < 0.015) generateTree(x, height, z);
    }
  }
}
generateWorld();

// ================= Player =================
const player = {
  pos: new THREE.Vector3(0, 30, 0),
  velY: 0,
  yaw: 0,
  pitch: 0,
  canJump: false,
  walkSpeed: 5,
  gravity: -20
};

// Pointer lock
let pointerLocked = false;
canvas.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});

const keys = {};
document.addEventListener('keydown', e => keys[e.code] = true);
document.addEventListener('keyup', e => keys[e.code] = false);
document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  player.yaw -= e.movementX * 0.002;
  player.pitch -= e.movementY * 0.002;
  player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
});

// ================= Raycasting =================
const raycaster = new THREE.Raycaster();
let curBlock = 1;
document.addEventListener('keydown', e => {
  if (e.code === 'Digit1') curBlock = 1;
  if (e.code === 'Digit2') curBlock = 2;
  if (e.code === 'Digit3') curBlock = 3;
  if (e.code === 'Digit4') curBlock = 4;
  if (e.code === 'Digit5') curBlock = 5;
});

let highlightBox;
{
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
  const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
  highlightBox = new THREE.LineSegments(edges, mat);
  scene.add(highlightBox);
  highlightBox.visible = false;
}

function updateRay() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(Object.values(blocks));
  if (intersects.length > 0) {
    const hit = intersects[0];
    const blockPos = hit.object.position.clone().floor().addScalar(0.5);
    highlightBox.position.copy(blockPos);
    highlightBox.visible = true;
    return hit;
  } else {
    highlightBox.visible = false;
    return null;
  }
}

window.addEventListener('mousedown', e => {
  if (!pointerLocked) return;
  const hit = updateRay();
  if (!hit) return;

  const normal = hit.face.normal.clone();
  const pos = hit.object.position.clone().subScalar(0.5);
  const bx = Math.floor(pos.x);
  const by = Math.floor(pos.y);
  const bz = Math.floor(pos.z);

  const distance = camera.position.distanceTo(hit.point);
  if (distance > 6) return;

  if (e.button === 0) {
    removeBlock(bx, by, bz);
  } else if (e.button === 2) {
    const placePos = hit.point.clone().addScaledVector(normal, 0.5);
    const px = Math.floor(placePos.x);
    const py = Math.floor(placePos.y);
    const pz = Math.floor(placePos.z);
    if (!getBlockAt(px, py, pz)) setBlock(px, py, pz, curBlock);
  }
});
window.addEventListener('contextmenu', e => e.preventDefault());

// ================= Physics =================
function isSolidBlock(x, y, z) {
  const b = getBlockAt(Math.floor(x), Math.floor(y), Math.floor(z));
  return b && b.userData.blockType !== 5; // Leaves are not solid
}

function getGroundHeight(x, z) {
  for (let y = WORLD_HEIGHT; y >= 0; y--) {
    const b = getBlockAt(Math.floor(x), Math.floor(y), Math.floor(z));
    if (b && b.userData.blockType !== 5) return y + 1;
  }
  return 0;
}

let lastTime = performance.now();
function animate() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  let moveX = 0, moveZ = 0;
  if (keys['KeyW']) moveZ -= 1;
  if (keys['KeyS']) moveZ += 1;
  if (keys['KeyA']) moveX -= 1;
  if (keys['KeyD']) moveX += 1;

  const move = new THREE.Vector3(moveX, 0, moveZ);
  if (move.lengthSq() > 0) move.normalize();

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const dx = move.z * sin + move.x * cos;
  const dz = move.z * cos - move.x * sin;

  const nextX = player.pos.x + dx * player.walkSpeed * dt;
  const nextZ = player.pos.z + dz * player.walkSpeed * dt;

  const currentGround = getGroundHeight(player.pos.x, player.pos.z);
  const nextGround = getGroundHeight(nextX, nextZ);
  const heightDiff = nextGround - currentGround;

  if (heightDiff <= 1) { // climb 1 block max
    player.pos.x = nextX;
    player.pos.z = nextZ;
  }

  player.velY += player.gravity * dt;
  player.pos.y += player.velY * dt;

  const groundY = getGroundHeight(player.pos.x, player.pos.z);
  if (player.pos.y <= groundY + 1.7) {
    player.pos.y = groundY + 1.7;
    player.velY = 0;
    player.canJump = true;
  }

  if (keys['Space'] && player.canJump) {
    player.velY = 8;
    player.canJump = false;
  }

  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  updateRay();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
