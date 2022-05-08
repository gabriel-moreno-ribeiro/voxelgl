# voxelgl

A Minecraft-style voxel engine written from scratch in JavaScript and raw
WebGL. No libraries, no build step: chunked infinite terrain, greedy meshing,
first-person controls with collision and gravity, block breaking and placing.

## Run it

```sh
npx serve .        # or any static file server
```

Open the page, click to capture the mouse, then:

| Key | Action |
| --- | --- |
| `W A S D` | move |
| `Space` | jump (or ascend while flying) |
| `Shift` | descend while flying |
| `F` | toggle flying |
| left click | break block |
| right click | place block |
| `1`-`7` | choose block type |

Add `?seed=42` to the URL for a different world.

## How it works

- **World** (`src/world.js`): the world is a map of 16x64x16 chunks, each a
  flat `Uint8Array` of block ids. Terrain comes from seeded fractal value noise
  (`src/noise.js`): a heightmap gives stone, dirt and grass, low areas fill
  with water and sand, and a hash decides where trees grow. Chunks are
  generated lazily as the player approaches.
- **Greedy meshing** (`src/mesher.js`): for every axis and slice, a mask
  records which block faces are visible (a face between two opaque blocks is
  skipped). Runs of identical faces are then merged into the largest possible
  rectangles, so a flat 16x16 field becomes a handful of quads instead of
  hundreds. Chunk borders look into neighbouring chunks, so no seams are drawn.
- **Renderer** (`src/renderer.js`): one set of GPU buffers per chunk, rebuilt
  only when the chunk is marked dirty. The shaders do flat per-face colour with
  a directional light and distance fog. Far chunks are unloaded from the GPU.
- **Raycasting** (`src/raycast.js`): Amanatides and Woo grid traversal finds
  the block the player is looking at and the face it was hit on, which is where
  a new block is placed.
- **Physics** (`src/physics.js`): the player is an axis-aligned box. Movement
  is resolved per axis against solid blocks, with gravity, jumping and a
  fly mode.
- **Math** (`src/math.js`): the few 4x4 matrix helpers the camera needs.

## Tests

The engine logic (noise, world generation, meshing, raycasting, physics,
matrices) is covered by tests that run in Node without a browser:

```sh
npm test
```

## License

MIT
