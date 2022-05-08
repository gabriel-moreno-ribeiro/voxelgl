// Greedy meshing: turns a chunk's block grid into the smallest set of quads
// that cover its visible faces. Faces between two opaque blocks are never
// emitted, and adjacent faces with the same block type are merged into one
// rectangle, which cuts vertex counts by an order of magnitude compared to
// one quad per block face.
import { BLOCK, BLOCK_COLORS, CHUNK_HEIGHT, CHUNK_SIZE, isOpaque } from './world.js';

const FACE_SHADE = { top: 1.0, bottom: 0.55, side: 0.8, sideDark: 0.7 };

/**
 * @param {(x:number,y:number,z:number)=>number} getBlock world-space block lookup
 * @param {number} ox chunk origin x  @param {number} oz chunk origin z
 * @returns {{positions: Float32Array, colors: Float32Array, normals: Float32Array, indices: Uint32Array, quadCount: number}}
 */
export function meshChunk(getBlock, ox, oz) {
  const dims = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];
  const positions = [];
  const colors = [];
  const normals = [];
  const indices = [];
  let quadCount = 0;

  const at = (x, y, z) => getBlock(ox + x, y, oz + z);

  // d is the axis the slice is perpendicular to; u, v are the other two axes
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);

    // x[d] is advanced inside the loop (after the mask is built) so that the
    // quads for slice x[d] are emitted at coordinate x[d] + 1
    for (x[d] = -1; x[d] < dims[d];) {
      // build the mask for this slice: which faces are visible and in which direction
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++) {
          const a = x[d] >= 0 ? at(x[0], x[1], x[2]) : lookupOutside(at, x[0], x[1], x[2], d);
          const bx = x[0] + q[0], by = x[1] + q[1], bz = x[2] + q[2];
          const b = x[d] < dims[d] - 1 ? at(bx, by, bz) : lookupOutside(at, bx, by, bz, d);
          const aOpaque = isOpaque(a);
          const bOpaque = isOpaque(b);
          if (aOpaque === bOpaque) {
            // both solid or both transparent: draw water surface only against air
            if (!aOpaque && a !== b && (a === BLOCK.WATER || b === BLOCK.WATER)) {
              mask[n] = a === BLOCK.WATER ? a : -b;
            } else {
              mask[n] = 0;
            }
          } else if (aOpaque) {
            mask[n] = a; // face points in +d
          } else {
            mask[n] = -b; // face points in -d
          }
          n++;
        }
      }

      x[d]++;
      // greedily merge rectangles of equal mask value
      n = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u];) {
          const c = mask[n];
          if (c === 0) {
            i++;
            n++;
            continue;
          }
          let w = 1;
          while (i + w < dims[u] && mask[n + w] === c) w++;
          let h = 1;
          outer: for (; j + h < dims[v]; h++) {
            for (let k = 0; k < w; k++) {
              if (mask[n + k + h * dims[u]] !== c) break outer;
            }
          }

          x[u] = i;
          x[v] = j;
          const du = [0, 0, 0];
          const dv = [0, 0, 0];
          du[u] = w;
          dv[v] = h;
          const back = c < 0;
          const id = Math.abs(c);
          emitQuad(positions, colors, normals, indices, x, du, dv, d, back, id, ox, oz);
          quadCount++;

          for (let l = 0; l < h; l++) {
            for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
          }
          i += w;
          n += w;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    quadCount,
  };
}

// Blocks outside the chunk on the x/z axes come from neighbouring chunks via
// getBlock; outside on the y axis is always air.
function lookupOutside(at, x, y, z, d) {
  if (d === 1) return BLOCK.AIR;
  return at(x, y, z);
}

function emitQuad(positions, colors, normals, indices, x, du, dv, d, back, id, ox, oz) {
  const base = positions.length / 3;
  const p0 = [x[0] + ox, x[1], x[2] + oz];
  const p1 = [p0[0] + du[0], p0[1] + du[1], p0[2] + du[2]];
  const p2 = [p0[0] + du[0] + dv[0], p0[1] + du[1] + dv[1], p0[2] + du[2] + dv[2]];
  const p3 = [p0[0] + dv[0], p0[1] + dv[1], p0[2] + dv[2]];

  const normal = [0, 0, 0];
  normal[d] = back ? -1 : 1;

  const palette = BLOCK_COLORS[id] ?? BLOCK_COLORS[BLOCK.STONE];
  let color;
  let shade;
  if (d === 1) {
    color = back ? palette.bottom : palette.top;
    shade = back ? FACE_SHADE.bottom : FACE_SHADE.top;
  } else {
    color = palette.side;
    shade = d === 0 ? FACE_SHADE.side : FACE_SHADE.sideDark;
  }

  const quad = back ? [p0, p3, p2, p1] : [p0, p1, p2, p3];
  for (const p of quad) {
    positions.push(p[0], p[1], p[2]);
    colors.push(color[0] * shade, color[1] * shade, color[2] * shade);
    normals.push(normal[0], normal[1], normal[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
