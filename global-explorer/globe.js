// Global Explorer: the three.js globe. Country fills are vector meshes on the
// sphere (triangulated in lon/lat, long edges bisected so they hug the
// surface), borders are crisp 3D line segments, and tiny or shapeless
// territories get a screen-space ring marker. Recolouring a country is just a
// material colour change.
import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js?v=dev';
import { cameraDistanceForSpan, pickCountry } from './engine.js?v=dev';

// Light "atlas" palette: pale ocean, sand land, soft grey borders.
export const COLORS = {
  ocean: '#cfe3f2', land: '#e9e0c7', border: '#7c8794', guessed: '#cfc2a0',
  start: '#f4b63a', startDot: '#1f8f4e', warmer: '#f26a1b', cooler: '#3b82d6', same: '#8a94a0', correct: '#22a55b', target: '#d6409f', browse: '#0f766e',
};

const SURFACE = 1.0;        // sphere radius
const FILL_R = 1.0008;      // fills sit just above the ocean sphere
const BORDER_R = 1.0016;    // borders above fills
// Momentum. OrbitControls applies dampingFactor of the pending rotation each
// frame: a high factor keeps the globe glued to the finger, a low one glides.
const DRAG_DAMPING = 0.2;    // while a pointer is down
const GLIDE_DAMPING = 0.09;  // after release: ~0.8 s to run down
const GLIDE_BOOST = 3;       // stretch the leftover motion at release
const ZOOM_GLIDE_DECAY = 0.85;   // per 60 fps frame: ~0.5 s to run down
const ZOOM_GLIDE_CARRY = 0.4;    // share of the pinch rate carried past release
const ZOOM_GLIDE_MAX = 0.01;     // ln(altitude factor) per ms
const WHEEL_ZOOM_SPEED = 2.5; // altitude factor per 100 units of wheel delta is 0.95^2.5
const OUTLINE_R = 1.0026;   // selected-country outline: halo below, ink just above
const MARK_R = 1.004;       // sprites close to the surface so they do not drift when zoomed in
const SUBDIV_DEG = 3;       // bisect fill triangles with an edge longer than this

/** [lat, lon] in degrees -> unit-sphere Vector3 matching SphereGeometry's UV layout. */
export function latLonToVec3(lat, lon, r = 1) {
  const phi = THREE.MathUtils.degToRad(lon + 180);
  const theta = THREE.MathUtils.degToRad(90 - lat);
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

/** Inverse of latLonToVec3 for a point on (or above) the sphere. */
export function vec3ToLatLon(v) {
  const n = v.clone().normalize();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(n.z, -n.x)) - 180;
  if (lon < -180) lon += 360;
  return [lat, lon];
}

export class Globe {
  constructor(container, features, countries) {
    this.container = container;
    this.features = features;
    this.countries = new Map(countries.map((c) => [c.code, c]));
    this.highlights = new Map();
    this.flight = null;
    this.markers = new Map();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
    // Open somewhere different each time: a random country, framed with its region around it.
    const shaped = countries.filter((c) => c.hasShape && Math.abs(c.latlng[0]) < 70);
    const pick = shaped[Math.floor(Math.random() * shaped.length)] || { latlng: [20, 0] };
    this.camera.position.copy(latLonToVec3(pick.latlng[0], pick.latlng[1], 2.4));
    this.openedAt = pick.code || null;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = DRAG_DAMPING;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.04; // close enough to click the smallest islands
    this.controls.maxDistance = 4.5;
    this.controls.rotateSpeed = 0.3; // overridden every frame by updateRotateSpeed()
    // Pinch factor applies to the height above the surface (see wireAltitudeZoom),
    // so a 2x finger spread shows the ground 2x bigger at every zoom level.
    this.controls.zoomSpeed = 1;
    this.wireAltitudeZoom();
    // Not OrbitControls' zoomToCursor: that moves the orbit centre off the globe's
    // centre, so minDistance stops protecting the surface and the camera can dive
    // through the land. Instead the orbit centre stays put and steerTowards()
    // rotates the view toward the pointer as you zoom in.
    this.controls.zoomToCursor = false;
    this.wireZoomSteering();
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.addEventListener('start', () => {
      this.flight = null;
      this.controls.autoRotate = false;
      this.controls.dampingFactor = DRAG_DAMPING;
    });
    // Momentum: while a finger is down the globe tracks it closely, and on
    // release the motion left in the pipe is stretched and let run down slowly.
    this.controls.addEventListener('end', () => {
      const d = this.controls._sphericalDelta;
      d.theta *= GLIDE_BOOST;
      d.phi *= GLIDE_BOOST;
      this.controls.dampingFactor = GLIDE_DAMPING;
    });
    // OrbitControls spins about the pole, so a sideways drag moves mid-latitude
    // ground by only cos(latitude). Scale the azimuth so the ground under the
    // pointer keeps up with it wherever the view is centred (capped near the poles).
    const rotateLeft = this.controls._rotateLeft.bind(this.controls);
    this.controls._rotateLeft = (angle) => {
      const lat = Math.PI / 2 - this.controls.getPolarAngle();
      rotateLeft(angle / Math.max(0.25, Math.cos(lat)));
    };

    // Ocean sphere (also the raycast target for clicks) and vector country fills.
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(SURFACE, 128, 96), new THREE.MeshBasicMaterial({ color: COLORS.ocean }));
    this.scene.add(this.sphere);
    this.fillGroup = new THREE.Group();
    this.hatchGroup = new THREE.Group();
    this.fillsByCode = new Map();
    this.buildFills();
    this.scene.add(this.fillGroup);
    this.scene.add(this.hatchGroup);

    // Soft atmosphere rim.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.03, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x3b82d6, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false }),
    );
    this.scene.add(glow);

    this.scene.add(this.buildBorders());

    this.markerTexture = Globe.ringTexture();
    this.markerGroup = new THREE.Group();
    this.scene.add(this.markerGroup);
    // Territories with no polygon at this map scale (Gibraltar, Bouvet Island,
    // US Minor Outlying Islands) get a small fixed-size dot so they can be seen and tapped.
    this.speckGroup = new THREE.Group();
    const dotTex = Globe.dotTexture();
    for (const c of countries) {
      if (c.hasShape) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
      sp.scale.setScalar(0.016);
      sp.position.copy(latLonToVec3(c.latlng[0], c.latlng[1], MARK_R));
      sp.userData.code = c.code;
      this.speckGroup.add(sp);
    }
    this.scene.add(this.speckGroup);
    this.pathGroup = new THREE.Group();
    this.scene.add(this.pathGroup);
    this.labelGroup = new THREE.Group();
    this.scene.add(this.labelGroup);
    this.outlineGroup = new THREE.Group();
    this.scene.add(this.outlineGroup);
    this.outline = null;
    this.nameGroup = new THREE.Group();
    this.nameGroup.visible = false;
    this.scene.add(this.nameGroup);
    this.countryList = countries;

    // Click (not drag) to pick a country; app sets onPick and pickEnabled.
    this.onPick = null;
    this.pickEnabled = false;
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    dom.addEventListener('pointerup', (e) => {
      if (!down || !this.pickEnabled || !this.onPick) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
      down = null;
      if (moved > 6 || dt > 500) return;
      this.onPick(this.pick(e.clientX, e.clientY));
    });

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** A small filled dot with a dark rim, in the land colour. */
  static dotTexture(fill = COLORS.land, stroke = COLORS.border) {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 6;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2); g.fill(); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  static ringTexture() {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.lineWidth = 14; g.strokeStyle = '#fff';
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 18, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /** Diagonal stripes for areas under disputed administration. */
  static hatchTexture() {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(31, 41, 51, 0.55)'; g.lineWidth = 7; g.lineCap = 'square';
    for (const o of [-s, 0, s]) { g.beginPath(); g.moveTo(o, s); g.lineTo(o + s, 0); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /** Triangulate every polygon into a mesh per feature; fills hug the sphere. */
  buildFills() {
    const edge = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180)), a[1] - b[1]);
    const hatchTex = Globe.hatchTexture();
    const HATCH_DEG = 0.12; // one stripe repeat per 0.12 degrees (~13 km), fine enough for Northern Cyprus
    for (const f of this.features) {
      const pos = [], uv = [];
      const push = (p) => { const v = latLonToVec3(p[1], p[0], f.hatch ? FILL_R + 0.0003 : FILL_R); pos.push(v.x, v.y, v.z); if (f.hatch) uv.push(p[0] / HATCH_DEG, p[1] / HATCH_DEG); };
      const emit = (a, b, c, depth) => {
        const e = [edge(a, b), edge(b, c), edge(c, a)];
        const i = e.indexOf(Math.max(e[0], e[1], e[2]));
        if (e[i] > SUBDIV_DEG && depth < 40) {
          const [p, q, r] = i === 0 ? [a, b, c] : i === 1 ? [b, c, a] : [c, a, b];
          const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          emit(p, m, r, depth + 1); emit(m, q, r, depth + 1);
        } else { push(a); push(b); push(c); }
      };
      for (const poly of f.polygons) {
        const contour = poly[0].slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y));
        const holes = poly.slice(1).map((r) => r.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
        const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
        const all = [...contour, ...holes.flat()];
        for (const [a, b, c] of tris) emit([all[a].x, all[a].y], [all[b].x, all[b].y], [all[c].x, all[c].y], 0);
      }
      if (!pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (f.hatch) {
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: hatchTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        mesh.userData.hatch = f.name;
        this.hatchGroup.add(mesh);
        continue;
      }
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLORS.land, side: THREE.DoubleSide }));
      mesh.userData.code = f.code;
      this.fillGroup.add(mesh);
      if (f.code) { if (!this.fillsByCode.has(f.code)) this.fillsByCode.set(f.code, []); this.fillsByCode.get(f.code).push(mesh); }
    }
  }

  buildBorders() {
    const pos = [], dashed = [];
    for (const f of this.features) for (const poly of f.polygons) for (const ring of poly) {
      const out = f.hatch ? dashed : pos;
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i], [lon2, lat2] = ring[i + 1];
        // Skip Natural Earth's seams along the antimeridian and the south pole.
        if (Math.abs(lon1) > 179.99 && Math.abs(lon2) > 179.99) continue;
        if (lat1 < -89.99 && lat2 < -89.99) continue;
        const a = latLonToVec3(lat1, lon1, BORDER_R), b = latLonToVec3(lat2, lon2, BORDER_R);
        out.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const group = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COLORS.border, transparent: true, opacity: 0.75 })));
    if (dashed.length) {
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.Float32BufferAttribute(dashed, 3));
      const dl = new THREE.LineSegments(dg, new THREE.LineDashedMaterial({ color: COLORS.border, transparent: true, opacity: 0.8, dashSize: 0.004, gapSize: 0.003 }));
      dl.computeLineDistances();
      group.add(dl);
    }
    return group;
  }

  /** Apply the current highlight colours to the fill meshes. */
  paint() {
    for (const mesh of this.fillGroup.children) {
      mesh.material.color.set((mesh.userData.code && this.highlights.get(mesh.userData.code)) || COLORS.land);
    }
  }

  /** Replace the highlight set: Map<code, cssColor>. */
  setHighlights(map) {
    this.highlights = new Map(map);
    this.paint();
    // Ring markers for places too small to see.
    for (const [code, sprite] of this.markers) if (!this.highlights.has(code)) { this.markerGroup.remove(sprite); this.markers.delete(code); }
    for (const [code, color] of this.highlights) {
      const c = this.countries.get(code);
      if (!c || (c.hasShape && c.span > 2.5)) { const s = this.markers.get(code); if (s) { this.markerGroup.remove(s); this.markers.delete(code); } continue; }
      let s = this.markers.get(code);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTexture, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false }));
        s.scale.setScalar(0.03);
        s.position.copy(latLonToVec3(c.latlng[0], c.latlng[1], MARK_R));
        this.markerGroup.add(s); this.markers.set(code, s);
      }
      s.material.color.set(color);
    }
  }

  /** Direction (unit vector) of the globe surface under a client-space pixel, or null. */
  surfaceDirAt(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.sphere, false)[0];
    return hit ? hit.point.clone().normalize() : null;
  }

  /**
   * Rotate the view toward `dir` by the fraction of the zoom step, so the
   * place under the pointer stays under the pointer as the globe grows.
   * `scale` is the dolly factor (< 1 zooming in, > 1 zooming out).
   */
  steerTowards(dir, scale) {
    if (!dir || scale >= 1) return;
    const pos = this.camera.position;
    const d = pos.length();
    const newDir = Globe.slerp(pos.clone().normalize(), dir, 1 - scale);
    pos.copy(newDir.multiplyScalar(d));
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * OrbitControls dollies by scaling the camera's distance from the globe's
   * centre, but what fills the screen scales with the height above the
   * surface. Close in that makes a small pinch an enormous jump: at radius
   * 1.1 a 10% spread takes the altitude from 0.1 to 0, a tenfold zoom, which
   * is how a pinch overshoots into a screenful of sea. Re-map every dolly so
   * the factor applies to the altitude instead; the frame() floor and
   * minDistance still cap how close the camera can get.
   */
  wireAltitudeZoom() {
    const c = this.controls;
    const applyToAltitude = (factor) => {
      const r = this.camera.position.length() * c._scale; // radius after pending dollies
      const h = Math.max(r - 1, 1e-4);
      c._scale *= (1 + h * factor) / r;
    };
    c._dollyIn = (ds) => applyToAltitude(ds);
    c._dollyOut = (ds) => applyToAltitude(1 / ds);
    // Altitude spans a wider range than radius, so give the mouse wheel and
    // trackpad a brisker step than the pinch (which stays true to the fingers).
    c._getZoomScale = (delta) => Math.pow(0.95, WHEEL_ZOOM_SPEED * Math.abs(delta * 0.01));
  }

  wireZoomSteering() {
    const dom = this.renderer.domElement;
    // Mouse wheel: mirror OrbitControls' own zoom scale for this event.
    dom.addEventListener('wheel', (e) => {
      if (!this.controls.enableZoom) return;
      const scale = this.controls._getZoomScale(e.deltaY);
      if (e.deltaY < 0) this.steerTowards(this.surfaceDirAt(e.clientX, e.clientY), scale);
    }, { passive: true });
    // Touch pinch: steer toward the midpoint as the fingers spread, and keep
    // a smoothed zoom rate so the zoom can glide on after the fingers lift.
    const pointers = new Map();
    let lastDist = 0, lastT = 0, rate = 0, lastMid = null;
    dom.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      lastDist = 0; rate = 0; lastT = performance.now();
      this.zoomGlide = null; // a new touch stops the glide (OrbitControls' own
      // 'start' also fires when one of two fingers lifts, so do not hook that)
    });
    const end = (e) => {
      if (pointers.size === 2 && rate && performance.now() - lastT < 120) {
        this.zoomGlide = { rate: rate * ZOOM_GLIDE_CARRY, dir: lastMid, t: performance.now() };
      }
      pointers.delete(e.pointerId);
      lastDist = 0; rate = 0;
    };
    dom.addEventListener('pointerup', end); dom.addEventListener('pointercancel', end);
    dom.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size !== 2) return;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const now = performance.now();
      if (lastDist) {
        const scale = Math.pow(lastDist / dist, this.controls.zoomSpeed); // OrbitControls dollies by this ratio
        const inst = THREE.MathUtils.clamp(Math.log(scale) / Math.max(1, now - lastT), -ZOOM_GLIDE_MAX, ZOOM_GLIDE_MAX);
        rate = rate ? 0.6 * rate + 0.4 * inst : inst;
        lastMid = this.surfaceDirAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (dist > lastDist) this.steerTowards(lastMid, Math.max(0.5, scale));
      }
      lastDist = dist; lastT = now;
    });
  }

  /** Carry a pinch on after release: apply the decaying zoom rate once per frame. */
  stepZoomGlide() {
    const g = this.zoomGlide;
    if (!g) return;
    const now = performance.now();
    const dt = Math.min(50, now - g.t);
    g.t = now;
    const factor = Math.exp(g.rate * dt);
    this.controls._dollyIn(factor); // altitude-mapped by wireAltitudeZoom
    if (factor < 1) this.steerTowards(g.dir, factor);
    g.rate *= Math.pow(ZOOM_GLIDE_DECAY, dt / 16.7);
    const r = this.camera.position.length();
    if (Math.abs(g.rate) < 1e-5 || r <= this.controls.minDistance + 1e-4 || r >= this.controls.maxDistance - 1e-4) this.zoomGlide = null;
  }

  /** Country code under a client-space pixel, or null. */
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.sphere, false)[0];
    if (!hit) return null;
    const [lat, lon] = vec3ToLatLon(hit.point);
    // Snap tolerance of ~12 screen pixels, converted to degrees at this zoom.
    const degPerPx = ((2 * (this.camera.position.length() - 1) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / r.height) * (180 / Math.PI);
    const tol = Math.min(2, 18 * degPerPx);
    return pickCountry(this.features, this.countryList, lat, lon, tol);
  }

  /** Text sprite for a country name. Returns { texture, wfrac: text width as a fraction of the canvas }. */
  static nameTexture(text) {
    const W = 512, H = 96, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    let size = text.length > 22 ? 36 : text.length > 14 ? 46 : 58;
    const font = (px) => `700 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    g.font = font(size);
    while (size > 22 && g.measureText(text).width > W - 20) { size -= 2; g.font = font(size); } // long names shrink to fit
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    g.strokeText(text, W / 2, H / 2 + 2);
    g.fillStyle = '#1f2933'; g.fillText(text, W / 2, H / 2 + 2);
    const wfrac = Math.min(1, (g.measureText(text).width + 12) / W);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, wfrac };
  }

  /** Build name labels once; shown when `setNamesVisible(true)`. */
  buildNames() {
    if (this.nameGroup.children.length) return;
    for (const c of this.countryList) {
      const { texture, wfrac } = Globe.nameTexture(c.name);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false }));
      const pos = c.label || c.latlng;
      sp.position.copy(latLonToVec3(pos[0], pos[1], MARK_R));
      sp.userData = { code: c.code, span: c.hasShape ? Math.min(c.span > 180 ? 60 : c.span, 60) : 0.3, dir: sp.position.clone().normalize(), wfrac };
      this.nameGroup.add(sp);
    }
    // Biggest countries first, so they win when labels collide.
    this.nameGroup.children.sort((a, b) => b.userData.span - a.userData.span);
    this.applyLabelScale();
  }

  /** Base label size is ~5% of the viewport height; short viewports (phones) get a boost. */
  applyLabelScale() {
    const h = this.container.clientHeight || 600;
    this.labelScale = THREE.MathUtils.clamp(560 / h, 1, 1.7);
    for (const sp of this.nameGroup.children) sp.scale.set(0.224 * this.labelScale, 0.042 * this.labelScale);
  }

  setNamesVisible(on) {
    if (on) this.buildNames();
    this.nameGroup.visible = !!on;
  }

  /** Codes whose name label should be hidden (they carry a path marker instead). */
  setNameExclusions(codes) {
    this.nameExclude = new Set(codes);
  }

  /**
   * Show a label only when its country is big enough at this zoom, faces the
   * camera, and its on-screen box does not overlap a bigger country's label.
   */
  /**
   * Ring markers, speck dots and path numbers are flat sprites just above the
   * surface, so with depth testing the globe would clip their lower half near
   * the horizon. They render without it instead, and are hidden here once
   * their anchor point rolls over the horizon (dot with the camera direction
   * below 1/d) so they never show through the globe from the far side.
   */
  cullHorizonSprites() {
    const camDir = this.camera.position.clone().normalize();
    const limit = 1 / this.camera.position.length();
    const v = new THREE.Vector3();
    for (const g of [this.markerGroup, this.speckGroup, this.labelGroup]) {
      for (const sp of g.children) sp.visible = v.copy(sp.position).normalize().dot(camDir) > limit;
    }
  }

  updateNames() {
    if (!this.nameGroup.visible) return;
    const d = this.camera.position.length() - 1;
    const camDir = this.camera.position.clone().normalize();
    const w = this.container.clientWidth, h = this.container.clientHeight;
    // Sprite size with sizeAttenuation=false is scale × projection; both axes end up proportional to viewport height.
    const px = this.camera.projectionMatrix.elements[5] / 2 * h; // pixels per unit of sprite scale
    const kept = [];
    const v = new THREE.Vector3();
    for (const sp of this.nameGroup.children) {
      const { span, dir, wfrac, code } = sp.userData;
      sp.visible = false;
      if ((span < d * 7 && d > 0.12) || dir.dot(camDir) <= 0.25) continue; // zoomed right in, show everything
      if (this.nameExclude && this.nameExclude.has(code)) continue;
      v.copy(sp.position).project(this.camera);
      const cx = (v.x + 1) / 2 * w, cy = (1 - v.y) / 2 * h;
      const hw = sp.scale.x * px * wfrac / 2, hh = sp.scale.y * px * 0.42;
      const box = [cx - hw, cy - hh, cx + hw, cy + hh];
      if (kept.some((k) => box[0] < k[2] && box[2] > k[0] && box[1] < k[3] && box[3] > k[1])) continue;
      kept.push(box);
      sp.visible = true;
    }
  }

  /** A round label sprite: `text` on a disc of `color`. */
  static labelTexture(text, color, textColor = '#1f2933') {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = color; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#1f2933'; g.stroke();
    g.fillStyle = textColor; g.font = `bold ${text.length > 2 ? 48 : 64}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, s / 2, s / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /**
   * Draw the guess path. `segments` is [{ from: [lat, lon], to: [lat, lon], color }]
   * (great-circle arcs, lifted so long hops stay visible over the horizon);
   * `labels` is [{ latlng, text, color }] for numbered points.
   */
  setPath(segments, labels) {
    this.pathSegments = segments; this.pathLabels = labels;
    this.pathBuiltAt = this.camera.position.length();
    // Tube radius follows the zoom so the path never buries small islands.
    const radius = THREE.MathUtils.clamp(0.0045 * ((this.pathBuiltAt - 1) / 1.5), 0.00025, 0.0045);
    for (const g of [this.pathGroup, this.labelGroup]) {
      for (const child of [...g.children]) { child.geometry?.dispose(); child.material?.map?.dispose?.(); child.material?.dispose(); g.remove(child); }
    }
    for (const seg of segments) {
      const a = latLonToVec3(seg.from[0], seg.from[1]), b = latLonToVec3(seg.to[0], seg.to[1]);
      const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
      const lift = Math.min(0.22, (angle / Math.PI) * 0.35);
      const n = Math.max(12, Math.ceil(angle * 40));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(Globe.slerp(a, b, t).multiplyScalar(MARK_R + lift * Math.sin(Math.PI * t)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 2, radius, 8, false), new THREE.MeshBasicMaterial({ color: seg.color }));
      this.pathGroup.add(tube);
    }
    for (const l of labels) {
      // A label is a numbered disc, or with `dot` a small plain dot in its colour.
      const map = l.dot ? Globe.dotTexture(l.color, '#ffffff') : Globe.labelTexture(l.text, l.color);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.setScalar(l.dot ? 0.022 : 0.042);
      sp.position.copy(latLonToVec3(l.latlng[0], l.latlng[1], MARK_R + radius * 2.5)); // above the tube ends
      this.labelGroup.add(sp);
    }
  }

  /**
   * Outline one country in `color` (null clears), drawn as a ribbon on the
   * surface with a pale halo beneath so it reads on dark fills too. The
   * width follows the zoom, so frame() rebuilds it as the camera moves.
   */
  setOutline(code, color) {
    this.outline = code ? { code, color } : null;
    this.buildOutline();
  }

  buildOutline() {
    for (const child of [...this.outlineGroup.children]) { child.geometry.dispose(); child.material.dispose(); this.outlineGroup.remove(child); }
    if (!this.outline) return;
    const d = this.camera.position.length();
    this.outlineBuiltAt = d;
    const w = THREE.MathUtils.clamp(0.0011 * (d - 1), 0.00008, 0.0025); // half-width, ~3 px on a phone
    const rings = [];
    for (const f of this.features) if (f.code === this.outline.code && !f.hatch) for (const poly of f.polygons) rings.push(...poly);
    const layer = (halfWidth, radius, color, opacity) => {
      const pos = [];
      for (const ring of rings) Globe.ribbon(ring, halfWidth, radius, pos);
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.outlineGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide })));
    };
    layer(w * 2.2, OUTLINE_R, '#ffffff', 0.9);
    layer(w, OUTLINE_R + 0.0004, this.outline.color, 1);
  }

  /** Append a mitred ribbon of half-width `w` along a closed [lon, lat] ring to `out`. */
  static ribbon(ring, w, radius, out) {
    const pts = [];
    for (let i = 0; i < ring.length - 1; i++) { // the ring repeats its first point last
      const p = latLonToVec3(ring[i][1], ring[i][0], radius);
      if (!pts.length || pts[pts.length - 1].distanceToSquared(p) > 1e-14) pts.push(p);
    }
    const n = pts.length;
    if (n < 3) return;
    const perp = pts.map((p, i) => { // tangent-plane normal to each segment i -> i+1
      const q = pts[(i + 1) % n];
      return p.clone().normalize().cross(q.clone().sub(p)).normalize();
    });
    const off = pts.map((p, i) => { // per-vertex mitre from the two adjacent segments
      const a = perp[(i + n - 1) % n], b = perp[i];
      const m = a.clone().add(b);
      if (m.lengthSq() < 1e-12) return b.clone().multiplyScalar(w);
      m.normalize();
      return m.multiplyScalar(w / Math.max(0.4, m.dot(b)));
    });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [lon1, lat1] = ring[i], [lon2, lat2] = ring[j];
      if (Math.abs(lon1) > 179.99 && Math.abs(lon2) > 179.99) continue; // antimeridian seam
      if (lat1 < -89.99 && lat2 < -89.99) continue; // south pole seam
      const a1 = pts[i].clone().add(off[i]), a2 = pts[i].clone().sub(off[i]);
      const b1 = pts[j].clone().add(off[j]), b2 = pts[j].clone().sub(off[j]);
      out.push(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, b1.x, b1.y, b1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    }
  }

  /**
   * Animate the camera to look straight down on a country. `lift` is a
   * fraction of the viewport height to place the country above centre, for
   * when a card covers the bottom of the view.
   */
  flyTo(code, { duration = 1400, lift = 0 } = {}) {
    const c = this.countries.get(code);
    if (!c) return;
    this.controls.autoRotate = false;
    const from = this.camera.position.clone();
    const span = c.hasShape && c.span > 0 ? c.span : 0.5;
    // The fit is tuned for a tall (portrait) view. In a wide one, such as the
    // strip above the game sheet, the width is the roomy axis, so come closer
    // by the aspect ratio to show the country at the same size.
    const dist = Math.max(this.controls.minDistance, 1 + (cameraDistanceForSpan(span) - 1) / Math.max(1, this.camera.aspect));
    // Ground spans about 2(d−1)·tan(fov/2) radians per viewport height, so aim
    // that far south of the country to show it higher on screen.
    const latShift = THREE.MathUtils.radToDeg(lift * 2 * (dist - 1) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const lat = THREE.MathUtils.clamp(c.latlng[0] - latShift, -89, 89);
    const to = latLonToVec3(lat, c.latlng[1], dist);
    this.flight = { from, to, start: performance.now(), duration, fromDir: from.clone().normalize(), toDir: to.clone().normalize() };
  }

  /**
   * Make a drag feel like a finger on the ground: the surface point under the
   * pointer should move with it. OrbitControls rotates 2π·rotateSpeed per
   * viewport height of drag; the ground under the pointer spans about
   * 2(d−1)·tan(fov/2) radians per viewport height, so match the two.
   */
  updateRotateSpeed() {
    const d = this.camera.position.length() - 1;
    const want = (d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / Math.PI;
    this.controls.rotateSpeed = THREE.MathUtils.clamp(want, 0.003, 0.45);
  }

  frame() {
    this.updateRotateSpeed();
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; // ease in-out
      const dir = Globe.slerp(f.fromDir, f.toDir, e);
      const dist = THREE.MathUtils.lerp(f.from.length(), f.to.length(), e);
      this.camera.position.copy(dir.multiplyScalar(dist));
      this.camera.lookAt(0, 0, 0);
      if (t >= 1) this.flight = null;
    }
    this.stepZoomGlide();
    this.controls.update();
    // Hard floor: never let the camera dip into the globe, whatever the controls did.
    const floor = this.controls.minDistance;
    if (this.camera.position.length() < floor) { this.camera.position.setLength(floor); this.camera.lookAt(0, 0, 0); }
    // Rebuild the path when the zoom has changed enough for its thickness to look wrong.
    if (this.pathSegments && this.pathSegments.length) {
      const d = this.camera.position.length();
      if (Math.abs(Math.log((d - 1) / (this.pathBuiltAt - 1))) > 0.2) this.setPath(this.pathSegments, this.pathLabels);
    }
    if (this.outline) {
      const d = this.camera.position.length();
      if (Math.abs(Math.log((d - 1) / (this.outlineBuiltAt - 1))) > 0.2) this.buildOutline();
    }
    this.updateNames();
    this.cullHorizonSprites();
    this.renderer.render(this.scene, this.camera);
  }

  static slerp(a, b, t) {
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
    const omega = Math.acos(dot);
    if (omega < 1e-6) return a.clone();
    if (Math.PI - omega < 1e-4) {
      // Antipodal: pivot via the pole so the path is well defined.
      const mid = new THREE.Vector3(0, 1, 0);
      return t < 0.5 ? Globe.slerp(a, mid, t * 2) : Globe.slerp(mid, b, (t - 0.5) * 2);
    }
    const s = Math.sin(omega);
    return a.clone().multiplyScalar(Math.sin((1 - t) * omega) / s).add(b.clone().multiplyScalar(Math.sin(t * omega) / s));
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    // A card over the top of the canvas hides that much of the view, so shift
    // the view centre down by half the inset to centre the globe in what is left.
    const inset = this.topInset || 0;
    if (inset) this.camera.setViewOffset(w, h, 0, -inset / 2, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.nameGroup) this.applyLabelScale();
  }
}
