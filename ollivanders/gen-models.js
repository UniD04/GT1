// Generates the sample wand meshes (OBJ + STL) in public/models and links them in data.json.
// Run: node gen-models.js   — replace any of them from the admin panel with your own STL/OBJ.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'public', 'models');
fs.mkdirSync(OUT, { recursive: true });

const RINGS = 180, SEG = 40, TAU = Math.PI * 2;
const bump = (t, c, w) => Math.exp(-((t - c) ** 2) / (2 * w * w));
const taper = t => 0.034 - 0.027 * Math.pow(t, 0.8);          // shaft thins towards the tip

// radius(t, theta): t = 0 at the pommel, 1 at the tip
const styles = {
  elder:  (t) => taper(t) * (1 + 0.55 * bump(t, .06, .02) + 0.5 * bump(t, .2, .015) + 0.4 * bump(t, .38, .02) + 0.45 * bump(t, .55, .015) + 0.35 * bump(t, .74, .02)),
  holly:  (t) => taper(t) * (1 + 0.7 * bump(t, .08, .035) + 0.35 * bump(t, .27, .008) + 0.35 * bump(t, .3, .008) + 0.2 * bump(t, .33, .008)),
  vine:   (t, a) => taper(t) * (1 + 0.16 * Math.sin(3 * a + 38 * t)) * (1 + 0.25 * bump(t, .05, .03)),
  yew:    (t) => taper(t) * (1 + 0.9 * bump(t, .02, .03) + 0.35 * [.12, .16, .2, .24].reduce((s, c) => s + bump(t, c, .006), 0) + 0.25 * bump(t, .32, .03)),
  willow: (t) => taper(t) * 0.8 * (1 + 0.45 * bump(t, .1, .05) + 0.12 * bump(t, .5, .1)),
  cherry: (t, a) => taper(t) * (1 + (t < .36 ? 0.12 * Math.cos(7 * a) * Math.min(1, (.36 - t) * 20) : 0) + 0.5 * bump(t, .03, .025) + 0.3 * bump(t, .36, .01)),
  default:(t) => taper(t) * (1 + 0.4 * bump(t, .1, .04)),
};

function build(fn) {
  const V = [], F = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    // rounded pommel and a sharp tip
    const cap = Math.min(1, Math.sin(Math.min(1, t / 0.02) * Math.PI / 2)) * Math.min(1, Math.sqrt(Math.max(0, (1 - t) / 0.03)));
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * TAU, r = fn(t, a) * cap;
      V.push([t, r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
    const a = i * SEG + j, b = i * SEG + (j + 1) % SEG, c = (i + 1) * SEG + j, d = (i + 1) * SEG + (j + 1) % SEG;
    F.push([a, b, c], [b, d, c]);
  }
  return { V, F };
}

const toOBJ = ({ V, F }, name) => `# ${name}\no ${name}\n` + V.map(v => `v ${v.map(n => n.toFixed(5)).join(' ')}`).join('\n') + '\n' + F.map(f => `f ${f.map(i => i + 1).join(' ')}`).join('\n') + '\n';
function toSTL({ V, F }, name) {
  let s = `solid ${name}\n`;
  for (const f of F) {
    const [p, q, r] = f.map(i => V[i]), u = q.map((n, k) => n - p[k]), w = r.map((n, k) => n - p[k]);
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    s += ` facet normal ${n.join(' ')}\n  outer loop\n${[p, q, r].map(v => `   vertex ${v.join(' ')}`).join('\n')}\n  endloop\n endfacet\n`;
  }
  return s + `endsolid ${name}\n`;
}

const stl = new Set(['elder', 'cherry']);          // mix of both formats on purpose
const links = {};
for (const [id, fn] of Object.entries(styles)) {
  const mesh = build(fn), ext = stl.has(id) ? 'stl' : 'obj';
  fs.writeFileSync(path.join(OUT, `${id}.${ext}`), ext === 'stl' ? toSTL(mesh, id) : toOBJ(mesh, id));
  links[id] = `/models/${id}.${ext}`;
}
const map = { elder: 'elder', 'holly-phoenix': 'holly', 'vine-dragon': 'vine', 'yew-phoenix': 'yew', 'willow-unicorn': 'willow', 'cherry-dragon': 'cherry' };
const dp = path.join(__dirname, 'data.json'), data = JSON.parse(fs.readFileSync(dp));
data.wands.forEach(w => { if (map[w.id]) w.model = links[map[w.id]]; });
fs.writeFileSync(dp, JSON.stringify(data, null, 2));
console.log('Models written:', links);
