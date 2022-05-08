// Voxel ray traversal (Amanatides & Woo). Walks the grid one cell at a time
// along a ray and reports the first solid block, plus the face it was hit on,
// so the caller knows where a new block would be placed.
import { isSolid } from './world.js';

/**
 * @param {(x:number,y:number,z:number)=>number} getBlock
 * @param {number[]} origin  @param {number[]} dir unit direction
 * @param {number} maxDistance
 * @returns {{x:number,y:number,z:number,normal:number[],distance:number,block:number}|null}
 */
export function raycast(getBlock, origin, dir, maxDistance = 8) {
  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  const stepX = Math.sign(dir[0]);
  const stepY = Math.sign(dir[1]);
  const stepZ = Math.sign(dir[2]);

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir[0]) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir[1]) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir[2]) : Infinity;

  const bound = (p, d, step) => (step > 0 ? Math.floor(p) + 1 - p : p - Math.floor(p)) / Math.abs(d);
  let tMaxX = stepX !== 0 ? bound(origin[0], dir[0], stepX) : Infinity;
  let tMaxY = stepY !== 0 ? bound(origin[1], dir[1], stepY) : Infinity;
  let tMaxZ = stepZ !== 0 ? bound(origin[2], dir[2], stepZ) : Infinity;

  let normal = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < 512; i++) {
    const block = getBlock(x, y, z);
    if (isSolid(block)) {
      return { x, y, z, normal, distance: t, block };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
      normal = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      normal = [0, -stepY, 0];
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      normal = [0, 0, -stepZ];
    }
    if (t > maxDistance) return null;
  }
  return null;
}
