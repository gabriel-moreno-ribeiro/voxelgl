// Player movement with axis-aligned bounding box collision against blocks.
// Movement is resolved one axis at a time, which is simple and stable for
// voxel worlds: move on x, push out of any solid block, then y, then z.
import { isSolid } from './world.js';

export const PLAYER = { width: 0.6, height: 1.8, eye: 1.62 };
export const GRAVITY = -24;
export const JUMP_SPEED = 8.5;
export const WALK_SPEED = 5;
export const FLY_SPEED = 12;

export function createPlayer(x, y, z) {
  return { pos: [x, y, z], vel: [0, 0, 0], onGround: false, flying: false, yaw: 0, pitch: 0 };
}

/** Is the player's box (bottom-centred at pos) intersecting any solid block? */
export function collides(getBlock, pos) {
  const half = PLAYER.width / 2;
  const minX = Math.floor(pos[0] - half);
  const maxX = Math.floor(pos[0] + half - 1e-6);
  const minY = Math.floor(pos[1]);
  const maxY = Math.floor(pos[1] + PLAYER.height - 1e-6);
  const minZ = Math.floor(pos[2] - half);
  const maxZ = Math.floor(pos[2] + half - 1e-6);
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (isSolid(getBlock(x, y, z))) return true;
      }
    }
  }
  return false;
}

/**
 * Advances the player by dt seconds given an input vector in local space
 * (forward/right/up in [-1, 1]). Returns the player for chaining.
 */
export function stepPlayer(getBlock, player, input, dt) {
  const { pos, vel } = player;
  const speed = player.flying ? FLY_SPEED : WALK_SPEED;
  const sinYaw = Math.sin(player.yaw);
  const cosYaw = Math.cos(player.yaw);
  // camera looks down -z when yaw = 0
  const wishX = (input.right * cosYaw - input.forward * sinYaw) * speed;
  const wishZ = (input.right * sinYaw + input.forward * cosYaw) * speed;
  vel[0] = wishX;
  vel[2] = wishZ;

  if (player.flying) {
    vel[1] = input.up * speed;
  } else {
    vel[1] += GRAVITY * dt;
    if (input.up > 0 && player.onGround) {
      vel[1] = JUMP_SPEED;
      player.onGround = false;
    }
  }

  // x axis
  pos[0] += vel[0] * dt;
  if (collides(getBlock, pos)) {
    pos[0] -= vel[0] * dt;
    vel[0] = 0;
  }
  // y axis
  const oldY = pos[1];
  pos[1] += vel[1] * dt;
  if (collides(getBlock, pos)) {
    const movingDown = vel[1] < 0;
    // snap to the block surface we ran into; fall back to the old position
    pos[1] = movingDown ? Math.ceil(pos[1]) : Math.floor(pos[1] + PLAYER.height) - PLAYER.height - 1e-4;
    if (collides(getBlock, pos)) pos[1] = oldY;
    if (movingDown) player.onGround = true;
    vel[1] = 0;
  } else if (!player.flying) {
    player.onGround = false;
  }
  // z axis
  pos[2] += vel[2] * dt;
  if (collides(getBlock, pos)) {
    pos[2] -= vel[2] * dt;
    vel[2] = 0;
  }
  return player;
}
