// 3D layer. Stack borrowed from igloo.inc: three.js (r165) + GLTF/STL/OBJ loaders, physically based materials with an
// environment map, hand-written GLSL (dust field), GSAP + ScrollTrigger + CustomEase for motion, Tweakpane for ?debug.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

gsap.registerPlugin(ScrollTrigger, CustomEase);
CustomEase.create('silk', '0.16, 1, 0.3, 1');

const DEFAULT_MODEL = '/models/default.obj';
const cache = new Map();
const modelUrl = w => w.model || DEFAULT_MODEL;

// ── model loading ─────────────────────────────────────────────────────────────
/** Every mesh in a loaded scene, baked into one position-only geometry. */
function collect(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(m => {
    if (!m.isMesh) return;
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a);
    parts.push(g.index ? g.toNonIndexed() : g);
  });
  if (!parts.length) throw new Error('model has no mesh');
  return parts.length === 1 ? parts[0] : mergeGeometries(parts);
}

/** Load an STL / OBJ / GLB and return a smooth-shaded geometry, lying along +X, tip at +X, length 1, centred. */
export function loadGeometry(url) {
  if (!cache.has(url)) cache.set(url, (async () => {
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    let g;
    if (ext === 'stl') g = await new STLLoader().loadAsync(url);
    else if (ext === 'obj') g = collect(await new OBJLoader().loadAsync(url));
    else if (ext === 'glb' || ext === 'gltf') g = collect((await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene);
    else throw new Error('unsupported model type: ' + ext);
    g = g.clone();
    ['normal', 'uv'].forEach(a => g.hasAttribute(a) && g.deleteAttribute(a));
    g = mergeVertices(g.index ? g.toNonIndexed() : g, 1e-4);
    g.computeVertexNormals();
    normalise(g);
    return g;
  })());
  return cache.get(url);
}

function normalise(g) {
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3()), s = g.boundingBox.getSize(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  if (s.y >= s.x && s.y >= s.z) g.rotateZ(-Math.PI / 2);        // align longest axis with X
  else if (s.z >= s.x && s.z >= s.y) g.rotateY(Math.PI / 2);
  // the thicker end is the handle: make sure it sits at -X
  const p = g.attributes.position; let pos = 0, neg = 0;
  for (let i = 0; i < p.count; i++) (p.getX(i) > 0 ? (pos += Math.hypot(p.getY(i), p.getZ(i))) : (neg += Math.hypot(p.getY(i), p.getZ(i))));
  if (pos > neg) g.rotateZ(Math.PI);
  g.computeBoundingBox();
  const len = g.boundingBox.getSize(new THREE.Vector3()).x;
  g.scale(1 / len, 1 / len, 1 / len);
  g.computeBoundingBox();
  g.translate(-g.boundingBox.getCenter(new THREE.Vector3()).x, 0, 0);
  g.computeVertexNormals();
}

// ── look: PBR wood with a clear-coat, lit by a studio environment map ─────────
const params = { spin: 1, dust: 1, dustSize: 1, env: .38, clearcoat: .5, roughness: .42 };   // live-tweakable with ?debug
const materials = new Set();
const material = color => {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: params.roughness, metalness: .05, clearcoat: params.clearcoat, clearcoatRoughness: .22, envMapIntensity: params.env });
  materials.add(m); return m;
};

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  return r;
}
/** A scene with a PMREM-filtered room environment (soft reflections) plus a key and a warm rim light. */
function makeScene(renderer) {
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa07860, .22));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.5); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a55, 1.3); rim.position.set(-4, -2, -3); scene.add(rim);
  return scene;
}

// ── GLSL dust: drifting, twinkling motes in the theme's accent colour ────────
const accent = () => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--gilt').trim() || '#c9a24a');
const dustUniforms = new Set();
new MutationObserver(() => dustUniforms.forEach(u => u.uColor.value.copy(accent())))
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const DUST_VERT = /* glsl */`
  uniform float uTime, uSize, uPx, uScroll; uniform vec2 uSpan; attribute float aSeed; varying float vTw;
  void main() {
    vec3 p = position; float t = uTime * (.15 + aSeed * .25);
    p.x += sin(t * 2.1 + aSeed * 20.) * .35 + sin(t * .7 + p.y * .6) * .25;          // layered sines ≈ cheap curl drift
    p.y += cos(t * 1.7 + aSeed * 17.) * .30 + uTime * .05 * (.3 + aSeed);
    p.y = mod(p.y + uSpan.y * .5 + uScroll * 2. * (.3 + aSeed), uSpan.y) - uSpan.y * .5;   // wrap + scroll parallax
    vTw = .5 + .5 * sin(uTime * (1. + aSeed * 2.) + aSeed * 40.);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_PointSize = uSize * uPx * (.5 + aSeed) * (14. / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const DUST_FRAG = /* glsl */`
  precision mediump float; uniform vec3 uColor; uniform float uAlpha; varying float vTw;
  void main() { float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(uColor, a * a * vTw * uAlpha); }`;

function makeDust(count, w, h, depth, size = 1) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - .5) * w, (Math.random() - .5) * h, (Math.random() - .5) * depth - depth * .25], i * 3); seed[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uSize: { value: size }, uPx: { value: Math.min(devicePixelRatio, 2) }, uScroll: { value: 0 }, uAlpha: { value: 1 }, uSpan: { value: new THREE.Vector2(w, h) }, uColor: { value: accent() } };
  dustUniforms.add(uniforms);
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false }));
  pts.frustumCulled = false; pts.userData.u = uniforms; return pts;
}

// ── Tweakpane debug panel (?debug) ────────────────────────────────────────────
let debugStarted = false;
function debugPanel() {
  if (debugStarted || !new URLSearchParams(location.search).has('debug')) return;
  debugStarted = true;
  // Tweakpane 4 ships as an ES module only; it is loaded on demand, solely when ?debug is present
  import('https://cdn.jsdelivr.net/npm/tweakpane@4.0.4/dist/tweakpane.min.js').then(({ Pane }) => {
    const pane = new Pane({ title: 'wand lab' });
    Object.assign(pane.element.parentElement.style, { top: 'auto', bottom: '8px' });   // keep it off the header buttons
    pane.addBinding(params, 'spin', { min: 0, max: 4 });
    pane.addBinding(params, 'dust', { min: 0, max: 1 });
    pane.addBinding(params, 'dustSize', { min: .2, max: 3 });
    const mat = k => ev => materials.forEach(m => { m[k === 'env' ? 'envMapIntensity' : k] = ev.value; });
    pane.addBinding(params, 'env', { min: 0, max: 3 }).on('change', mat('env'));
    pane.addBinding(params, 'clearcoat', { min: 0, max: 1 }).on('change', mat('clearcoat'));
    pane.addBinding(params, 'roughness', { min: 0, max: 1 }).on('change', mat('roughness'));
  }).catch(e => console.warn('Tweakpane failed to load', e));
}

// ── viewers ───────────────────────────────────────────────────────────────────
/** One wand in its own canvas (cards, detail page). */
export function mountViewer(box, wand, { controls = false, tilt = .5 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:' + (controls ? 'pan-y' : 'auto');
  const renderer = makeRenderer(canvas), scene = makeScene(renderer), camera = new THREE.PerspectiveCamera(30, 1, .1, 50);
  const state = { boost: 0, scale: 0, pop: -1.2 }, holder = new THREE.Group(), spin = new THREE.Group();
  holder.rotation.z = tilt; holder.add(spin); scene.add(holder);
  let ctl, visible = true, raf;
  const size = () => {
    const w = box.clientWidth || 300, h = box.clientHeight || 240;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const d = Math.max(1.3 / (2 * Math.tan(Math.PI / 12) * camera.aspect), 1.4);   // keep the whole wand in frame
    camera.position.set(0, 0, d * 1.05); camera.updateProjectionMatrix();
  };
  loadGeometry(modelUrl(wand)).then(g => {
    spin.add(new THREE.Mesh(g, material(wand.color || '#8a5a3b')));
    if (controls) { ctl = new OrbitControls(camera, canvas); ctl.enableZoom = false; ctl.enablePan = false; ctl.enableDamping = true; }
    gsap.fromTo(state, { scale: 0, pop: -1.2 }, { scale: 1, pop: 0, duration: 1.5, ease: 'elastic.out(1, 0.7)' });
  }).catch(e => { console.warn('Model failed, using drawing', e); box.innerHTML = art(wand); cancelAnimationFrame(raf); });
  box.appendChild(canvas); size();
  new ResizeObserver(size).observe(box);
  new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(box);
  const clock = new THREE.Clock();
  (function tick() {
    raf = requestAnimationFrame(tick);
    if (!box.isConnected) { cancelAnimationFrame(raf); renderer.dispose(); return; }   // card was removed (filter change)
    const dt = Math.min(clock.getDelta(), .05);
    if (!visible || document.hidden) return;
    spin.rotation.x += dt * (.5 + state.boost) * params.spin;
    if (controls) holder.position.y = Math.sin(clock.elapsedTime * 1.2) * .035;   // float
    holder.scale.setScalar(Math.max(state.scale, .0001)); holder.rotation.y = state.pop;
    ctl && ctl.update();
    renderer.render(scene, camera);
  })();
  return { state };
}

/** The full-stage hero: every wand is a mesh in one scene; ScrollTrigger scrubs the scroll, GSAP animates the rest. */
export function mountHero({ stage, track, wands, slots, onOpen }) {
  debugPanel();
  const canvas = document.createElement('canvas'); canvas.className = 'hero-canvas'; stage.appendChild(canvas);
  const renderer = makeRenderer(canvas), scene = makeScene(renderer), camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.z = 10;
  const dust = makeDust(260, 28, 8, 7, 1.4); scene.add(dust);
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(9, 9);
  // little name tag that pops up beside the wand being showcased (or hovered)
  const pop = document.createElement('div'); pop.className = 'wand-pop'; pop.innerHTML = '<div class="wand-pop-in"></div>'; stage.appendChild(pop);
  const popIn = pop.firstChild; let popFor = null;
  const setPop = it => {
    if (it === popFor) return; popFor = it;
    if (!it) return void gsap.to(popIn, { opacity: 0, scale: .7, duration: .25, ease: 'power2.in', overwrite: true });
    popIn.innerHTML = `<b>${esc(it.w.name)}</b><small>${esc([it.w.wood, it.w.length, it.w.price].filter(Boolean).join(' · '))}</small>`;
    gsap.fromTo(popIn, { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .7, ease: 'back.out(1.8)', overwrite: true });
  };
  const items = wands.map((w, i) => {
    const group = new THREE.Group(), spin = new THREE.Group(); group.add(spin); group.visible = false; scene.add(group);
    const it = { w, group, spin, intro: 0, hover: 0, focus: 0, ang: i, mat: null, mesh: null };
    loadGeometry(modelUrl(w)).then(g => {
      it.mat = material(w.color || '#8a5a3b');
      it.mesh = new THREE.Mesh(g, it.mat); spin.add(it.mesh); ready();
    }).catch(e => console.warn('Hero model failed', w.name, e));
    return it;
  });
  let loaded = 0, W = 1, H = 1, visW = 1, visH = 1;
  const ready = () => {
    if (++loaded < items.length) return;
    gsap.fromTo(items, { intro: 0 }, { intro: 1, duration: 1.8, ease: 'elastic.out(1, 0.75)', stagger: .14 });
  };
  const size = () => {
    W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    visH = 2 * 10 * Math.tan(Math.PI / 12); visW = visH * camera.aspect;
  };
  size(); new ResizeObserver(size).observe(stage);
  // scroll progress, smoothed by ScrollTrigger's scrub (the hero glides rather than snapping to the wheel)
  const prog = { v: 0 };
  gsap.to(prog, { v: 1, ease: 'none', scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub: 1 } });
  canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); });
  canvas.addEventListener('pointerleave', () => pointer.set(9, 9));
  let hovered = null;
  canvas.addEventListener('click', () => hovered && onOpen(hovered.w));
  const clock = new THREE.Clock();
  (function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    if (document.hidden || scrollY > track.offsetHeight) return;
    const f = prog.v * (items.length - 1);                       // which wand is centred (fractional while scrolling)
    const L = 1.05 * Math.min(W, H) * visH / H;                      // wand length ≈ 105vmin, as before
    dust.userData.u.uTime.value = t; dust.userData.u.uScroll.value = prog.v; dust.userData.u.uSize.value = params.dustSize * 1.4; dust.userData.u.uAlpha.value = params.dust;
    ray.setFromCamera(pointer, camera);
    const live = items.filter(i => i.mesh && i.group.visible);
    const hit = ray.intersectObjects(live.map(i => i.mesh))[0];
    const now = hit ? live.find(i => i.mesh === hit.object) : null;
    if (now !== hovered) {
      hovered = now; canvas.style.cursor = now ? 'pointer' : 'default';
      items.forEach(i => gsap.to(i, { hover: i === now ? 1 : 0, duration: .5, ease: 'power2.out', overwrite: 'auto' }));
    }
    // One wand at a time, travelling along a circular arc: wands arrive from the lower right, sweep through the centre
    // (where each is showcased) and leave to the lower left, turning like a wheel as they go. No alpha fading, so no ghosting.
    const R = Math.max(visH * 1.15, visW * .6), STEP = .6, y0 = -.02 * visH, FADE = .72;   // FADE: how much the neighbours dim (0–1)
    items.forEach((it, idx) => {
      const u = idx - f, a = Math.abs(u);
      it.group.visible = !!it.mesh && a < 1.7;
      if (!it.mesh) return;
      const th = u * STEP, fc = Math.min(1, Math.max(0, 1 - a * 1.8));
      it.focus = fc * fc * (3 - 2 * fc);
      const s = L * Math.max(it.intro, .0001) * (1 + it.hover * .06) * (1 - Math.min(a, 1.2) * .16) * (1 + .05 * it.focus);
      it.group.scale.setScalar(s);
      // fade with distance from the showcased wand: ~28% opacity one step away, gone by 1.7 steps (the wands no longer overlap each other, so no ghosting)
      const near = Math.min(a, 1), sm = near * near * (3 - 2 * near), far = Math.min(1, Math.max(0, (a - 1) / .7));
      const op = (1 - sm * FADE) * (1 - far);
      it.mat.opacity = op; it.mat.transparent = op < .999;
      it.group.position.set(R * Math.sin(th), y0 - R * (1 - Math.cos(th)) + Math.sin(t * 1.1 + idx) * .08, -Math.min(a, 1.5) * .6);
      it.group.rotation.z = 1.01 - th * .85 + Math.sin(t * .9 + idx * 2) * .04;           // 58° at the centre, rolling along the path
      it.group.rotation.y = (1 - it.intro) * 2.2;
      it.ang += dt * (.35 + it.hover * .8) * params.spin;                        // integrate the angle: changing the speed can never make it jump
      it.spin.rotation.x = it.ang;
    });
    // name tag: hovered wand, else the centred showcase wand once it has settled
    const star = items[Math.round(f)];
    setPop(hovered || (star && star.focus > .85 && star.intro > .9 ? star : null));
    if (popFor) {
      const v = new THREE.Vector3(.1, 0, 0); popFor.group.localToWorld(v); v.project(camera);   // a point just past the wand's middle, clear of the title
      pop.style.left = ((v.x * .5 + .5) * W) + 'px'; pop.style.top = ((-v.y * .5 + .5) * H) + 'px';
    }
    renderer.render(scene, camera);
  })();
}

/** Fill every .card in `root` with its 3D wand, hover-spin and a ScrollTrigger reveal. */
export function initWandCards(root, wands) {
  [...root.querySelectorAll('.card')].forEach((c, i) => {
    const v = mountViewer(c.querySelector('.pic'), wands[i], { tilt: .45 });
    c.onmouseenter = () => gsap.to(v.state, { boost: 3.2, duration: .5, ease: 'power2.out', overwrite: true });
    c.onmouseleave = () => gsap.to(v.state, { boost: 0, duration: .9, ease: 'power2.out', overwrite: true });
    gsap.fromTo(c, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: c, start: 'top 92%', once: true } });
  });
}

/**
 * A flat side-on picture of the wand for the 'full length' section (no live 3D): the wand's own image if the admin set one,
 * otherwise a one-off orthographic render of its model. The wand spans the image's full width, so a ruler can sit right under it.
 */
export async function wandSnapshot(wand) {
  if (safeUrl(wand.image)) return wand.image;
  const geo = await loadGeometry(modelUrl(wand));
  const canvas = document.createElement('canvas'), W = 2000, H = 320;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  const scene = makeScene(renderer), mat = material(wand.color || '#8a5a3b');
  const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = .35; scene.add(mesh);                      // slight roll so carvings catch the light
  const cam = new THREE.OrthographicCamera(-.5, .5, .5 * H / W, -.5 * H / W, .01, 10); cam.position.z = 3;   // x spans exactly the wand's length
  renderer.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  materials.delete(mat); mat.dispose(); renderer.dispose(); renderer.forceContextLoss();
  return url;
}
