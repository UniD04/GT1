// Generates the generic placeholder jewellery meshes (OBJ + STL) in public/models and links them in data.json.
// Run: node gen-models.js   — replace any of them from the admin panel with your own STL/OBJ/GLB.
//
// Conventions (the 3D viewer relies on them only loosely, it re-centres and re-scales every model):
//   the piece "faces" +Z, "up" is +Y, 1 unit ≈ the piece's longest side. Rings stand upright, band in the XY plane.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'public', 'models');
fs.mkdirSync(OUT, { recursive: true });

const TAU = Math.PI * 2, PI = Math.PI;

// ── tiny mesh toolkit: a mesh is { V: [[x,y,z]...], F: [[a,b,c]...] } with counter-clockwise (outward) faces ──
const empty = () => ({ V: [], F: [] });
const merge = (...ms) => { const o = empty(); for (const m of ms) { const k = o.V.length; m.V.forEach(v => o.V.push(v)); m.F.forEach(f => o.F.push([f[0] + k, f[1] + k, f[2] + k])); } return o; };
const map = (m, fn) => ({ V: m.V.map(fn), F: m.F });
const move = (m, x = 0, y = 0, z = 0) => map(m, v => [v[0] + x, v[1] + y, v[2] + z]);
const scale = (m, x, y = x, z = x) => map(m, v => [v[0] * x, v[1] * y, v[2] * z]);
const rotX = (m, a) => map(m, ([x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]);
const rotY = (m, a) => map(m, ([x, y, z]) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]);
const rotZ = (m, a) => map(m, ([x, y, z]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]);
/** make sure a closed mesh has outward-facing triangles (flip them if its signed volume is negative) */
function solid(m) {
  let vol = 0;
  for (const [a, b, c] of m.F) {
    const p = m.V[a], q = m.V[b], r = m.V[c];
    vol += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
  }
  return vol < 0 ? { V: m.V, F: m.F.map(([a, b, c]) => [a, c, b]) } : m;
}

/** parametric surface fn(u, v) -> [x, y, z], u,v in [0,1]; wrapU / wrapV close the seam */
function surface(nu, nv, fn, wrapU = true, wrapV = false) {
  const cu = wrapU ? nu : nu + 1, cv = wrapV ? nv : nv + 1, V = [], F = [];
  for (let i = 0; i < cu; i++) for (let j = 0; j < cv; j++) V.push(fn(i / nu, j / nv));
  const id = (i, j) => (i % cu) * cv + (j % cv);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) F.push([id(i, j), id(i + 1, j), id(i, j + 1)], [id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
  return solid({ V, F });
}
/** ellipsoid around the origin; `disp(dir, theta, phi)` scales the radius per direction (dents and bumps) */
const ellipsoid = (rx, ry, rz, disp, nu = 48, nv = 32) => surface(nu, nv, (u, v) => {
  const ph = u * TAU, th = v * PI, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)], k = disp ? disp(d, th, ph) : 1;
  return [rx * d[0] * k, ry * d[1] * k, rz * d[2] * k];
});
/** solid of revolution around Y from a profile [[radius, y], ...] that starts and ends on the axis */
function lathe(prof, seg = 28) {
  const V = [], F = [];
  prof.forEach(([r, y]) => { for (let j = 0; j < seg; j++) { const a = j / seg * TAU; V.push([r * Math.cos(a), y, r * Math.sin(a)]); } });
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
    F.push([a, b, c], [b, d, c]);
  }
  return solid({ V, F });
}
/** a thorn / spike: a cone along +Y, base radius r, height h */
const thorn = (r, h, seg = 12) => lathe([[0, 0], [r, 0], [r * .55, h * .35], [r * .2, h * .75], [0, h]], seg);
/** a ring (band) around the Z axis: centre-line radius R, cross-section half-sizes tr (radial) and tz (width), squareness n (2 = oval), per-angle thickness rf(a) */
const band = (R, tr, tz, { n = 2, rf = () => 1, nu = 96, nv = 20 } = {}) => surface(nu, nv, (u, v) => {
  const a = u * TAU, p = v * TAU, k = rf(a), c = Math.cos(p), s = Math.sin(p), e = 2 / n;
  const rad = R + tr * k * Math.sign(c) * Math.abs(c) ** e;
  return [rad * Math.cos(a), rad * Math.sin(a), tz * k * Math.sign(s) * Math.abs(s) ** e];
}, true, true);
const gauss = (x, w) => Math.exp(-(x * x) / (2 * w * w));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** a little bail loop (the ring a chain passes through): lies in the YZ plane */
const bail = (x, y, z = 0, R = .036, t = .01) => move(rotY(band(R, t, t, { nu: 40, nv: 12 }), PI / 2), x, y, z);
const gem = (r, x, y, z) => move(ellipsoid(r, r, r, null, 24, 16), x, y, z);

// ── flat silhouettes: ear-clipped polygons extruded with a bevelled edge (cast-pendant look) ──
const area = P => P.reduce((s, p, i) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0) / 2;
const ccw = P => area(P) < 0 ? [...P].reverse() : P;
const mirror = half => [...half, ...[...half].reverse().map(([x, y]) => [-x, y])];
const circle = (cx, cy, r, n = 32) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(i / n * TAU), cy + r * Math.sin(i / n * TAU)]);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function inset(P, d) {                                    // P is counter-clockwise: move every corner d inwards (mitred)
  const n = P.length, unit = (a, b) => { const x = b[0] - a[0], y = b[1] - a[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  return P.map((p, i) => {
    const e1 = unit(P[(i + n - 1) % n], p), e2 = unit(p, P[(i + 1) % n]), n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]];
    let b = [n1[0] + n2[0], n1[1] + n2[1]]; const l = Math.hypot(...b) || 1; b = [b[0] / l, b[1] / l];
    const m = Math.min(2.5, 1 / Math.max(.4, b[0] * n1[0] + b[1] * n1[1]));
    return [p[0] + b[0] * d * m, p[1] + b[1] * d * m];
  });
}
function triangulate(P) {                                 // ear clipping, P counter-clockwise and simple
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const idx = P.map((_, i) => i), T = [];
  while (idx.length > 3) {
    let cut = false;
    for (let k = 0; k < idx.length && !cut; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length], a = P[i0], b = P[i1], c = P[i2];
      if (cross(a, b, c) <= 1e-12) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inTri(P[j], a, b, c))) continue;
      T.push([i0, i1, i2]); idx.splice(k, 1); cut = true;
    }
    if (!cut) throw new Error('triangulation failed: the outline crosses itself');
  }
  T.push(idx); return T;
}
function extrude(poly, T, b) {
  const P = ccw(poly), Q = inset(P, b), n = P.length;
  const rings = [[Q, T / 2], [P, T / 2 - b], [P, -T / 2 + b], [Q, -T / 2]], V = [], F = [];
  rings.forEach(([pts, z]) => pts.forEach(p => V.push([p[0], p[1], z])));
  for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) {
    const a = r * n + i, bb = r * n + (i + 1) % n, c = (r + 1) * n + i, d = (r + 1) * n + (i + 1) % n;
    F.push([a, c, bb], [bb, c, d]);
  }
  for (const t of triangulate(Q)) { F.push(t.map(i => i)); F.push([3 * n + t[0], 3 * n + t[2], 3 * n + t[1]]); }
  return solid({ V, F });
}

// ── generic placeholder pieces (swap them for your own models from the admin panel, or edit the shapes here) ──
const topBoost = (k, w = .55) => a => 1 + k * gauss(angDiff(a, PI / 2), w);   // band is thicker where the setting sits

const sampleRing = () => merge(band(.3, .03, .05, { n: 2.6, rf: topBoost(.3) }), gem(.055, 0, .36, 0));
const signetRing = () => merge(band(.3, .03, .06, { n: 2.6, rf: topBoost(.5) }), move(extrude(rect(-.13, -.1, .13, .1), .06, .014), 0, .385, 0.0));
const samplePendant = () => merge(extrude(circle(0, 0, .3, 48), .06, .02), move(band(.2, .012, .02, { nu: 64, nv: 12 }), 0, 0, .03), gem(.07, 0, 0, .05), bail(0, .33, 0, .04, .011));
const dropPendant = () => {
  const drop = lathe([[0, -.2], [.06, -.15], [.12, -.04], [.1, .06], [.04, .15], [0, .19]], 36);
  return merge(drop, move(band(.17, .012, .025, { nu: 64, nv: 12 }), 0, -.02, 0), bail(0, .2, 0, .035, .01));
};
const samplePoly = [[-.07, .5], [-.07, .16], [-.28, .16], [-.28, .06], [-.07, .06], [-.07, -.5], [.07, -.5], [.07, .06], [.28, .06], [.28, .16], [.07, .16], [.07, .5]];
const sampleCross = () => merge(extrude(samplePoly, .06, .014), gem(.04, 0, .11, .04), bail(0, .535, 0, .035, .01));
const sampleChoker = () => {
  const R = .4, parts = [band(R, .012, .05, { n: 4, nu: 120, nv: 16 })];
  const drop = lathe([[0, -.075], [.028, -.05], [.046, -.005], [.036, .04], [.013, .078], [0, .09]], 32);
  parts.push(move(drop, 0, -R - .11, 0), bail(0, -R - .028, 0, .026, .008));
  return merge(...parts);
};

const pieces = { default: sampleRing, 'sample-ring': sampleRing, 'sample-signet': signetRing, 'sample-pendant': samplePendant, 'sample-drop': dropPendant, 'sample-cross': sampleCross, 'sample-choker': sampleChoker };

// ── writers ──
const toOBJ = ({ V, F }, name) => `# ${name}\no ${name}\n` + V.map(v => `v ${v.map(n => n.toFixed(5)).join(' ')}`).join('\n') + '\n' + F.map(f => `f ${f.map(i => i + 1).join(' ')}`).join('\n') + '\n';
function toSTL({ V, F }, name) {
  let s = `solid ${name}\n`;
  for (const f of F) {
    const [p, q, r] = f.map(i => V[i]), u = q.map((n, k) => n - p[k]), w = r.map((n, k) => n - p[k]);
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    s += ` facet normal ${n.join(' ')}\n  outer loop\n${[p, q, r].map(v => `   vertex ${v.map(n2 => n2.toFixed(5)).join(' ')}`).join('\n')}\n  endloop\n endfacet\n`;
  }
  return s + `endsolid ${name}\n`;
}

const stl = new Set(['sample-pendant', 'sample-cross']);          // mix of both formats on purpose
const links = {};
for (const [id, make] of Object.entries(pieces)) {
  const mesh = make(), ext = stl.has(id) ? 'stl' : 'obj';
  fs.writeFileSync(path.join(OUT, `${id}.${ext}`), ext === 'stl' ? toSTL(mesh, id) : toOBJ(mesh, id));
  links[id] = `/models/${id}.${ext}`;
  console.log(id.padEnd(16), mesh.F.length, 'triangles');
}
const dp = path.join(__dirname, 'data.json'), data = JSON.parse(fs.readFileSync(dp));
data.pieces.forEach(p => { if (links[p.id]) p.model = links[p.id]; });
fs.writeFileSync(dp, JSON.stringify(data, null, 2) + '\n');
console.log('Models written:', links);
