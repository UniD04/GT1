// Generates the sample jewellery meshes (OBJ + STL) in public/models and links them in data.json.
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

// ── the pieces ────────────────────────────────────────────────────────────────
const topBoost = (k, w = .55) => a => 1 + k * gauss(angDiff(a, PI / 2), w);   // band is thicker where the setting sits

function skullRing() {
  const R = .3, tr = .034, tz = .07, band_ = band(R, tr, tz, { n: 2.6, rf: topBoost(.45) });
  const cy = R + tr + .1;
  const cranium = ellipsoid(.14, .125, .14, (d) => {
    const ang = dir => Math.acos(Math.max(-1, Math.min(1, d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2])));
    const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
    return 1 - .42 * gauss(ang(unit([.42, -.08, .9])), .2) - .42 * gauss(ang(unit([-.42, -.08, .9])), .2)      // eye sockets
             - .3 * gauss(ang(unit([0, -.38, .93])), .1)                                                       // nose
             + .1 * gauss(ang(unit([.78, -.3, .55])), .26) + .1 * gauss(ang(unit([-.78, -.3, .55])), .26);    // cheekbones
  }, 64, 44);
  const jaw = ellipsoid(.085, .055, .095, d => 1 + .05 * Math.cos(d[0] * 40) * Math.max(0, d[2]), 40, 24);   // faint teeth ridges
  return merge(band_, move(cranium, 0, cy, 0), move(jaw, 0, cy - .125, .035),
    gem(.026, R * Math.cos(PI / 2 - .85), R * Math.sin(PI / 2 - .85), tz * .6), gem(.026, R * Math.cos(PI / 2 + .85), R * Math.sin(PI / 2 + .85), tz * .6));
}
function roseRing() {
  const R = .28, tr = .03, tz = .06, parts = [band(R, tr, tz, { n: 2.4, rf: topBoost(.35) })];
  const top = R + tr * 1.2;
  // rose head: rings of petals (flattened ellipsoids) tilted open, plus a tight bud and a calyx
  const petal = s => ellipsoid(.07 * s, .075 * s, .02 * s, d => 1 + .1 * d[1] * d[1] * 0, 24, 16);
  const ringOf = (n, rho, tilt, s, y, off) => { for (let i = 0; i < n; i++) parts.push(move(rotY(move(rotX(petal(s), tilt), 0, .05 * s, rho), (i / n) * TAU + off), 0, top + y, 0)); };
  ringOf(7, .088, .5, 1, .06, 0); ringOf(5, .058, .28, .86, .085, .3); ringOf(3, .03, .1, .66, .105, .7);
  parts.push(move(ellipsoid(.03, .055, .03, null, 24, 16), 0, top + .15, 0), move(ellipsoid(.075, .028, .075, null, 32, 16), 0, top + .035, 0));
  // thorns climbing the shoulders of the band
  for (const s of [-1, 1]) for (const d of [.55, .85, 1.15]) {
    const a = PI / 2 + s * d, r = R + tr * .8;
    parts.push(move(rotZ(thorn(.017, .075), a - PI / 2), r * Math.cos(a), r * Math.sin(a), 0));
  }
  return merge(...parts);
}
const RAVEN = [[-.47, .12], [-.38, .17], [-.33, .27], [-.22, .31], [-.12, .26], [-.04, .17], [.10, .15], [.28, .12], [.48, .0], [.54, -.06], [.44, -.06], [.54, -.14], [.42, -.12], [.50, -.22], [.32, -.15], [.22, -.18], [.12, -.27], [.08, -.29], [.09, -.40], [.0, -.40], [-.02, -.28], [-.10, -.24], [-.18, -.14], [-.26, -.04], [-.33, .01], [-.45, .07]];
function ravenPendant() {
  return merge(extrude(RAVEN, .09, .014), bail(0, .185, 0), gem(.017, -.255, .195, .045));
}
const BAT_HALF = [[.045, .27], [.07, .15], [.16, .17], [.30, .30], [.50, .34], [.45, .14], [.47, .02], [.38, .08], [.36, -.06], [.27, .02], [.24, -.12], [.14, -.04], [.08, -.24], [0, -.30]];
function batPendant() {
  const half = BAT_HALF, poly = [[0, .15], ...half.slice(0, -1), [.0, -.30], ...[...half.slice(0, -1)].reverse().map(([x, y]) => [-x, y])];
  return merge(extrude(poly, .06, .012), gem(.034, 0, -.05, .04), bail(0, .17, 0));
}
const CROSS = [[-.11, .50], [-.055, .36], [-.055, .25], [-.30, .31], [-.30, .09], [-.055, .15], [-.055, -.36], [-.13, -.50], [.13, -.50], [.055, -.36], [.055, .15], [.30, .09], [.30, .31], [.055, .25], [.055, .36], [.11, .50]];
function cathedralCross() {
  return merge(extrude(CROSS, .07, .013), gem(.042, 0, .2, .04), bail(0, .535, 0, .035, .01));
}
function reliquaryCross() {
  const e = (poly, t = .06, b = .014) => extrude(poly, t, b);
  return merge(e(rect(-.045, -.4, .045, .4)), e(rect(-.27, .105, .27, .195)),
    e(circle(0, .42, .085)), e(circle(0, -.4, .085)), e(circle(-.28, .15, .085)), e(circle(.28, .15, .085)),
    move(band(.125, .014, .022, { nu: 64, nv: 14 }), 0, .15, .03), move(ellipsoid(.07, .07, .05, null, 32, 20), 0, .15, .045),
    ...[[0, .42], [0, -.4], [-.28, .15], [.28, .15]].map(([x, y]) => gem(.028, x, y, .04)), bail(0, .545, 0, .035, .01));
}
function thornChoker() {
  const R = .4, parts = [band(R, .012, .05, { n: 4, nu: 120, nv: 16 })];
  for (let a = PI * 1.12; a <= PI * 1.88; a += .105) parts.push(move(rotZ(thorn(.014, .065), a - PI / 2), (R + .008) * Math.cos(a), (R + .008) * Math.sin(a), 0));
  const drop = lathe([[0, -.075], [.028, -.05], [.046, -.005], [.036, .04], [.013, .078], [0, .09]], 32);
  parts.push(move(drop, 0, -R - .11, 0), bail(0, -R - .028, 0, .026, .008));
  return merge(...parts);
}
function chainChoker() {
  const R = .4, N = 38, a = .047, b = .021, tube = .0085, parts = [];
  for (let i = 0; i < N; i++) {
    const al = i / N * TAU, T = [-Math.sin(al), Math.cos(al), 0], Nn = [Math.cos(al), Math.sin(al), 0], W = i % 2 ? [0, 0, 1] : Nn, B = i % 2 ? Nn : [0, 0, 1];
    const c = [R * Math.cos(al), R * Math.sin(al), 0];
    parts.push(surface(28, 10, (u, v) => {
      const t = u * TAU, p = v * TAU, hx = a * Math.cos(t), hy = b * Math.sin(t), nx = b * Math.cos(t), ny = a * Math.sin(t), l = Math.hypot(nx, ny);
      const n1 = [(nx * T[0] + ny * W[0]) / l, (nx * T[1] + ny * W[1]) / l, (nx * T[2] + ny * W[2]) / l];
      return [0, 1, 2].map(k => c[k] + hx * T[k] + hy * W[k] + tube * (Math.cos(p) * n1[k] + Math.sin(p) * B[k]));
    }, true, true));
  }
  const drop = lathe([[0, -.09], [.03, -.06], [.05, -.01], [.04, .04], [.015, .085], [0, .1]], 32);
  parts.push(move(drop, 0, -R - .1, 0), bail(0, -R - .015, 0, .022, .008));
  return merge(...parts);
}
const plainBand = () => merge(band(.3, .03, .05, { n: 2.6, rf: topBoost(.3) }), gem(.05, 0, .345, 0));

const pieces = {
  default: plainBand, 'skull-ring': skullRing, 'rose-ring': roseRing, 'raven-pendant': ravenPendant, 'bat-pendant': batPendant,
  'cathedral-cross': cathedralCross, 'reliquary-cross': reliquaryCross, 'thorn-choker': thornChoker, 'chain-choker': chainChoker,
};

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

const stl = new Set(['raven-pendant', 'reliquary-cross']);          // mix of both formats on purpose
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
