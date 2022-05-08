// Minimal column-major 4x4 matrix helpers for the renderer.

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function translation(x, y, z) {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function rotationX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const m = identity();
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function rotationY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const m = identity();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

/** View matrix for a first-person camera at eye with yaw (around y) and pitch (around x). */
export function viewMatrix(eye, yaw, pitch) {
  // inverse of T(eye) * R_y(yaw) * R_x(pitch)
  return multiply(multiply(rotationX(-pitch), rotationY(-yaw)), translation(-eye[0], -eye[1], -eye[2]));
}

/** Unit vector the camera looks along for the given yaw and pitch. */
export function lookDirection(yaw, pitch) {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}
