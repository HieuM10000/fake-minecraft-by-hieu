import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';

// ================= Config =================
const CHUNK_SIZE = 64;
const BLOCK_SIZE = 1;
const WORLD_HEIGHT = 64;
const REACH_DISTANCE = 6;
const RENDER_DISTANCE = 10;
const STEP_HEIGHT = 0.6;

// ================= Renderer & Scene =================
const canvas = document.getElementById('c');
if (!canvas) throw new Error("Canvas element with id='c' not found.");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0008);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 10);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(100, 200, 100);
light.castShadow = true;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

// ================= Textures =================
const textureLoader = new THREE.TextureLoader();
const textureURLs = {
  wood: 'https://art.pixilart.com/4f7e90163ba6436.png',
  dirt: 'https://art.pixilart.com/8958a2c64b6def8.png',
  grass: 'https://cdn.modrinth.com/data/wcxzqGUc/8a127e882e07a03d29e62d44671a2359ef7b336b.png',
  stone: 'https://art.pixilart.com/2543f900082f34f.png',
  leaf: 'https://cdn.modrinth.com/data/Ocyuzgoe/f51e8ebd6737cad5c7b1d3d81bf17f2eef4164f4.png',
  bedrock: 'https://p.novaskin.me/1646483168.png'
};

const BLOCK_TYPES = {
  0: { name: 'Bedrock', textureKey: 'bedrock' },
  1: { name: 'Grass', textureKey: 'grass' },
  2: { name: 'Dirt', textureKey: 'dirt' },
  3: { name: 'Stone', textureKey: 'stone' },
  4: { name: 'Wood', textureKey: 'wood' },
  5: { name: 'Leaves', textureKey: 'leaf' }
};

function loadAllTextures() {
  const promises = Object.entries(textureURLs).map(([key, url]) =>
    new Promise(resolve => textureLoader.load(url, tex => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      resolve([key, tex]);
    }))
  );
  return Promise.all(promises).then(entries => Object.fromEntries(entries));
}

// ================= World =================
const worldData = {};
const blocks = {};

function worldKey(x, y, z) { return `${x},${y},${z}`; }
function setWorldBlock(x, y, z, type) { worldData[worldKey(x, y, z)] = type; }
function getWorldBlock(x, y, z) { return worldData[worldKey(x, y, z)] || 0; }

function makeBlock(type, texMap) {
  const t = texMap[BLOCK_TYPES[type].textureKey];
  const mat = new THREE.MeshStandardMaterial({ map: t });
  const geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.blockType = type;
  return mesh;
}

function addBlockMesh(x, y, z, type, texMap) {
  const key = worldKey(x, y, z);
  if (blocks[key]) return;
  const mesh = makeBlock(type, texMap);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(mesh);
  blocks[key] = mesh;
}

function removeBlockMesh(x, y, z) {
  const key = worldKey(x, y, z);
  if (blocks[key]) {
    scene.remove(blocks[key]);
    delete blocks[key];
  }
}

function generateTree(x, y, z) {
  const height = 4 + Math.floor(Math.random() * 2);
  for (let i = 0; i < height; i++) setWorldBlock(x, y + i, z, 4);
  const topY = y + height;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 0; dy <= 2; dy++)
        if (Math.abs(dx) + Math.abs(dz) + dy < 5)
          setWorldBlock(x + dx, topY + dy, z + dz, 5);
}

// ✅ FIXED BEDROCK GENERATION (visible, unbreakable, solid)
function generateWorld() {
  for (let x = -CHUNK_SIZE; x < CHUNK_SIZE; x++) {
    for (let z = -CHUNK_SIZE; z < CHUNK_SIZE; z++) {
      const height = 20 + Math.floor(Math.sin(x * 0.1) * 3 + Math.cos(z * 0.1) * 3);

      // Bedrock bottom (y = 0–2)
      for (let y = 0; y <= 2; y++) setWorldBlock(x, y, z, 0);

      // Stone and dirt layers
      for (let y = 3; y < height - 2; y++) setWorldBlock(x, y, z, 3);
      for (let y = height - 2; y < height - 1; y++) setWorldBlock(x, y, z, 2);

      // Grass top layer
      setWorldBlock(x, height - 1, z, 1);

      // Trees
      if (Math.random() < 0.02) generateTree(x, height, z);
    }
  }
}

function updateVisibleBlocks(texMap) {
  const px = Math.floor(player.pos.x);
  const pz = Math.floor(player.pos.z);
  const visible = new Set();

  for (let x = px - RENDER_DISTANCE; x <= px + RENDER_DISTANCE; x++)
    for (let z = pz - RENDER_DISTANCE; z <= pz + RENDER_DISTANCE; z++)
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const type = getWorldBlock(x, y, z);
        if (type !== undefined) {
          const key = worldKey(x, y, z);
          visible.add(key);
          if (type && !blocks[key]) addBlockMesh(x, y, z, type, texMap);
        }
      }

  for (const key of Object.keys(blocks))
    if (!visible.has(key)) {
      const [x, y, z] = key.split(',').map(Number);
      removeBlockMesh(x, y, z);
    }
}

// ================= Hotbar =================
const hotbar = document.createElement('div');
hotbar.style.position = 'absolute';
hotbar.style.bottom = '24px';
hotbar.style.left = '50%';
hotbar.style.transform = 'translateX(-50%)';
hotbar.style.display = 'flex';
hotbar.style.gap = '8px';
hotbar.style.zIndex = '1000';
document.body.appendChild(hotbar);

let curBlock = 1;

function buildHotbar(texMap) {
  hotbar.innerHTML = '';
  Object.entries(BLOCK_TYPES).forEach(([id, info]) => {
    if (id == 0) return;
    const tex = texMap[info.textureKey];
    const slot = document.createElement('div');
    slot.dataset.id = id;
    slot.style.width = '64px';
    slot.style.height = '64px';
    slot.style.border = id == curBlock ? '4px solid yellow' : '2px solid white';
    slot.style.backgroundImage = `url(${tex.image.src})`;
    slot.style.backgroundSize = 'cover';
    slot.style.borderRadius = '8px';
    hotbar.appendChild(slot);
  });
}

function updateHotbarSelection() {
  [...hotbar.children].forEach(slot =>
    slot.style.border = slot.dataset.id == curBlock ? '4px solid yellow' : '2px solid white'
  );
}

// ================= Player =================
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;

const player = {
  pos: new THREE.Vector3(0, 40, 0),
  velY: 0,
  yaw: 0,
  pitch: 0,
  walkSpeed: 5,
  gravity: -25,
  terminalVel: -40,
  jumpVel: Math.sqrt(2 * 25 * 1.25),
  canJump: false
};

// Lock controls
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

window.addEventListener('wheel', e => {
  curBlock += e.deltaY > 0 ? 1 : -1;
  const ids = Object.keys(BLOCK_TYPES).filter(id => id != 0);
  const max = Math.max(...ids.map(Number));
  const min = Math.min(...ids.map(Number));
  if (curBlock > max) curBlock = min;
  if (curBlock < min) curBlock = max;
  updateHotbarSelection();
});

// ================= Raycast =================
const raycaster = new THREE.Raycaster();
let texMapGlobal = null;

let highlightBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
  new THREE.LineBasicMaterial({ color: 0xffff00 })
);
highlightBox.visible = false;
scene.add(highlightBox);

function updateHighlight() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const intersects = raycaster.intersectObjects(Object.values(blocks));
  if (!intersects.length) {
    highlightBox.visible = false;
    return null;
  }
  const hit = intersects[0];
  const distance = camera.position.distanceTo(hit.point);
  if (distance > REACH_DISTANCE) {
    highlightBox.visible = false;
    return null;
  }
  highlightBox.visible = true;
  highlightBox.position.copy(hit.object.position);
  return hit;
}

window.addEventListener('mousedown', e => {
  if (!pointerLocked) return;
  const hit = updateHighlight();
  if (!hit) return;
  const block = hit.object;
  const [x, y, z] = block.position.toArray().map(v => Math.floor(v));
  const type = getWorldBlock(x, y, z);

  // ✅ Prevent bedrock breaking
  if (e.button === 0) {
    if (type === 0) return;
    delete worldData[worldKey(x, y, z)];
    removeBlockMesh(x, y, z);
  } else if (e.button === 2) {
    const normal = hit.face.normal;
    const newPos = block.position.clone().add(normal);
    const [nx, ny, nz] = newPos.toArray().map(v => Math.floor(v));
    if (getWorldBlock(nx, ny, nz)) return;
    setWorldBlock(nx, ny, nz, curBlock);
    addBlockMesh(nx, ny, nz, curBlock, texMapGlobal);
  }
});

// ================= Movement =================
function getBlockAt(x, y, z) { return getWorldBlock(Math.floor(x), Math.floor(y), Math.floor(z)); }

function isColliding(x, y, z) {
  const half = PLAYER_RADIUS - 0.05;
  const feetY = y - PLAYER_HEIGHT / 2;
  for (let ix = -half; ix <= half; ix += half)
    for (let iz = -half; iz <= half; iz += half)
      for (let iy = 0; iy <= PLAYER_HEIGHT; iy += 0.5)
        if (getBlockAt(x + ix, feetY + iy, z + iz)) return true;
  return false;
}

function movePlayer(dt, moveDir) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const move = new THREE.Vector3();
  move.addScaledVector(forward, moveDir.z);
  move.addScaledVector(right, moveDir.x);
  if (move.lengthSq() > 0) move.normalize();

  const speed = player.walkSpeed * dt;
  const dx = move.x * speed;
  const dz = move.z * speed;

  player.velY += player.gravity * dt;
  if (player.velY < player.terminalVel) player.velY = player.terminalVel;
  let dy = player.velY * dt;

  if (!isColliding(player.pos.x + dx, player.pos.y, player.pos.z)) player.pos.x += dx;
  if (!isColliding(player.pos.x, player.pos.y, player.pos.z + dz)) player.pos.z += dz;

  if (!isColliding(player.pos.x, player.pos.y + dy, player.pos.z)) {
    player.pos.y += dy;
    player.canJump = false;
  } else if (dy < 0) {
    player.velY = 0;
    player.canJump = true;
  }

  // ✅ Prevent falling through bedrock / void
  if (player.pos.y < 2.5) {
    player.pos.y = 2.5 + PLAYER_HEIGHT / 2;
    player.velY = 0;
    player.canJump = true;
  }
}

// ================= Animate =================
let lastTime = performance.now();
function animate() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const move = new THREE.Vector3();
  if (keys['KeyW']) move.z -= 1;
  if (keys['KeyS']) move.z += 1;
  if (keys['KeyA']) move.x -= 1;
  if (keys['KeyD']) move.x += 1;
  if (keys['Space'] && player.canJump) {
    player.velY = player.jumpVel;
    player.canJump = false;
  }

  movePlayer(dt, move);

  camera.position.set(player.pos.x, player.pos.y + (EYE_HEIGHT - PLAYER_HEIGHT / 2), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  updateVisibleBlocks(texMapGlobal);
  updateHighlight();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ================= Start =================
loadAllTextures().then(texMap => {
  texMapGlobal = texMap;
  generateWorld();
  buildHotbar(texMap);
  updateHotbarSelection();
  animate();
});

// ================= Resize =================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
