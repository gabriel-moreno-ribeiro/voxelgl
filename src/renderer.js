// WebGL renderer: one vertex/index buffer set per chunk, rebuilt when the
// chunk is dirty. Flat-shaded colours with a simple directional light and
// distance fog.
import { CHUNK_SIZE, World } from './world.js';
import { meshChunk } from './mesher.js';
import { perspective, multiply, viewMatrix } from './math.js';

const VERT = `
attribute vec3 aPosition;
attribute vec3 aColor;
attribute vec3 aNormal;
uniform mat4 uViewProj;
varying vec3 vColor;
varying float vDist;
void main() {
  vec3 light = normalize(vec3(0.4, 1.0, 0.3));
  float diffuse = 0.75 + 0.25 * max(dot(aNormal, light), 0.0);
  vColor = aColor * diffuse;
  vec4 pos = uViewProj * vec4(aPosition, 1.0);
  vDist = pos.w;
  gl_Position = pos;
}`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vDist;
uniform vec3 uFog;
uniform float uFogStart;
uniform float uFogEnd;
void main() {
  float f = clamp((vDist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
  gl_FragColor = vec4(mix(vColor, uFog, f), 1.0);
}`;

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

export class Renderer {
  constructor(canvas, world, { renderDistance = 4 } = {}) {
    this.canvas = canvas;
    this.world = world;
    this.renderDistance = renderDistance;
    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    if (!gl.getExtension('OES_element_index_uint')) throw new Error('OES_element_index_uint is required');

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    this.program = program;
    this.attribs = {
      position: gl.getAttribLocation(program, 'aPosition'),
      color: gl.getAttribLocation(program, 'aColor'),
      normal: gl.getAttribLocation(program, 'aNormal'),
    };
    this.uniforms = {
      viewProj: gl.getUniformLocation(program, 'uViewProj'),
      fog: gl.getUniformLocation(program, 'uFog'),
      fogStart: gl.getUniformLocation(program, 'uFogStart'),
      fogEnd: gl.getUniformLocation(program, 'uFogEnd'),
    };
    this.meshes = new Map(); // chunk key -> { vbo, cbo, nbo, ibo, count }
    this.fog = [0.62, 0.78, 0.95];
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.stats = { chunks: 0, quads: 0 };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  uploadChunk(chunk) {
    const gl = this.gl;
    const key = World.key(chunk.cx, chunk.cz);
    const getBlock = (x, y, z) => this.world.getBlock(x, y, z);
    const mesh = meshChunk(getBlock, chunk.cx * CHUNK_SIZE, chunk.cz * CHUNK_SIZE);
    let entry = this.meshes.get(key);
    if (!entry) {
      entry = { vbo: gl.createBuffer(), cbo: gl.createBuffer(), nbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0, quads: 0 };
      this.meshes.set(key, entry);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.cbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.nbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    entry.count = mesh.indices.length;
    entry.quads = mesh.quadCount;
    chunk.dirty = false;
  }

  /** Make sure chunks around the camera exist and are meshed (a few per frame to avoid stalls). */
  updateChunks(camera, budget = 2) {
    const ccx = Math.floor(camera[0] / CHUNK_SIZE);
    const ccz = Math.floor(camera[2] / CHUNK_SIZE);
    const r = this.renderDistance;
    let built = 0;
    // nearest first
    const order = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) order.push([dx, dz]);
    order.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    for (const [dx, dz] of order) {
      const chunk = this.world.chunkAt(ccx + dx, ccz + dz, true);
      if (chunk.dirty && built < budget) {
        this.uploadChunk(chunk);
        built++;
      }
    }
    // drop GPU buffers of far away chunks
    for (const [key, entry] of this.meshes) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) > r + 1 || Math.abs(cz - ccz) > r + 1) {
        const gl = this.gl;
        gl.deleteBuffer(entry.vbo); gl.deleteBuffer(entry.cbo); gl.deleteBuffer(entry.nbo); gl.deleteBuffer(entry.ibo);
        this.meshes.delete(key);
      }
    }
  }

  render(eye, yaw, pitch) {
    const gl = this.gl;
    this.resize();
    gl.clearColor(this.fog[0], this.fog[1], this.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = perspective(Math.PI / 3, aspect, 0.1, 400);
    const view = viewMatrix(eye, yaw, pitch);
    gl.uniformMatrix4fv(this.uniforms.viewProj, false, multiply(proj, view));
    gl.uniform3fv(this.uniforms.fog, this.fog);
    const far = (this.renderDistance + 0.5) * CHUNK_SIZE;
    gl.uniform1f(this.uniforms.fogStart, far * 0.6);
    gl.uniform1f(this.uniforms.fogEnd, far);

    let quads = 0;
    let chunks = 0;
    const ccx = Math.floor(eye[0] / CHUNK_SIZE);
    const ccz = Math.floor(eye[2] / CHUNK_SIZE);
    for (const [key, entry] of this.meshes) {
      if (entry.count === 0) continue;
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) > this.renderDistance || Math.abs(cz - ccz) > this.renderDistance) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.vbo);
      gl.enableVertexAttribArray(this.attribs.position);
      gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.cbo);
      gl.enableVertexAttribArray(this.attribs.color);
      gl.vertexAttribPointer(this.attribs.color, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.nbo);
      gl.enableVertexAttribArray(this.attribs.normal);
      gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.ibo);
      gl.drawElements(gl.TRIANGLES, entry.count, gl.UNSIGNED_INT, 0);
      quads += entry.quads;
      chunks++;
    }
    this.stats.chunks = chunks;
    this.stats.quads = quads;
  }
}
