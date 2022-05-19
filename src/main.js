// Game loop and input: pointer-lock mouse look, WASD movement, jump, fly
// toggle, left click to break blocks, right click to place them.
import { World, BLOCK, CHUNK_HEIGHT } from './world.js';
import { Renderer } from './renderer.js';
import { createPlayer, stepPlayer, PLAYER, collides } from './physics.js';
import { raycast } from './raycast.js';
import { lookDirection } from './math.js';
import { GemHunt } from './game.js';

const canvas = document.getElementById('view');
const hud = document.getElementById('hud');
const gameHud = document.getElementById('game');
const overlay = document.getElementById('overlay');

const seed = Number(new URLSearchParams(location.search).get('seed')) || 1337;
const world = new World(seed);
const renderer = new Renderer(canvas, world, { renderDistance: 5 });
const game = new GemHunt(world, { count: 10, radius: 40, duration: 120, seed });

// spawn on top of the terrain at the origin
const spawnY = world.heightAt(8, 8) + 2;
const player = createPlayer(8.5, spawnY, 8.5);
player.yaw = Math.PI;

const keys = new Set();
let selected = BLOCK.BRICK;
const palette = [BLOCK.BRICK, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.SAND, BLOCK.GRASS, BLOCK.DIRT];
const names = { [BLOCK.BRICK]: 'brick', [BLOCK.STONE]: 'stone', [BLOCK.WOOD]: 'wood', [BLOCK.LEAVES]: 'leaves', [BLOCK.SAND]: 'sand', [BLOCK.GRASS]: 'grass', [BLOCK.DIRT]: 'dirt' };

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyF') player.flying = !player.flying;
  if (e.code === 'KeyG') {
    game.seed = seed + Math.floor(Math.random() * 1e6);
    game.start(Math.floor(player.pos[0]), Math.floor(player.pos[2]));
  }
  if (/^Digit[1-7]$/.test(e.code)) selected = palette[Number(e.code.slice(5)) - 1];
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  overlay.style.display = document.pointerLockElement === canvas ? 'none' : 'flex';
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0025;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch - e.movementY * 0.0025));
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) return;
  const hit = raycast((x, y, z) => world.getBlock(x, y, z), eye(), lookDirection(player.yaw, player.pitch), 7);
  if (!hit) return;
  if (e.button === 0) {
    const id = world.getBlock(hit.x, hit.y, hit.z);
    world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
    game.onBlockBroken(hit.x, hit.y, hit.z, id);
  } else if (e.button === 2) {
    const [x, y, z] = [hit.x + hit.normal[0], hit.y + hit.normal[1], hit.z + hit.normal[2]];
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    // do not place a block inside the player
    const wouldOverlap = collides((bx, by, bz) => (bx === x && by === y && bz === z ? BLOCK.STONE : BLOCK.AIR), player.pos);
    if (!wouldOverlap) world.setBlock(x, y, z, selected);
  }
});

function eye() {
  return [player.pos[0], player.pos[1] + PLAYER.eye, player.pos[2]];
}

let last = performance.now();
let frames = 0;
let fps = 0;
let fpsTime = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const input = {
    forward: (keys.has('KeyW') ? -1 : 0) + (keys.has('KeyS') ? 1 : 0),
    right: (keys.has('KeyD') ? 1 : 0) + (keys.has('KeyA') ? -1 : 0),
    up: (keys.has('Space') ? 1 : 0) + (keys.has('ShiftLeft') ? -1 : 0),
  };
  stepPlayer((x, y, z) => world.getBlock(x, y, z), player, input, dt);
  if (player.pos[1] < -10) {
    player.pos[1] = world.heightAt(Math.floor(player.pos[0]), Math.floor(player.pos[2])) + 2;
    player.vel[1] = 0;
  }

  renderer.updateChunks(player.pos, 3);
  renderer.render(eye(), player.yaw, player.pitch);
  game.tick(dt);
  gameHud.textContent = game.state === 'playing' ? `${game.status()} · nearest ${game.compass(player.pos, player.yaw)}` : game.status();
  gameHud.className = game.state;

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
  const p = player.pos;
  hud.textContent = `${fps} fps | ${renderer.stats.chunks} chunks, ${renderer.stats.quads} quads | ` +
    `xyz ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${p[2].toFixed(1)} | block: ${names[selected]} (1-7) | ${player.flying ? 'flying' : 'walking'} (F)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
