// World Borders: the three.js globe. Country fills are vector meshes on the
// sphere (triangulated in lon/lat, long edges bisected so they hug the
// surface), borders are crisp 3D line segments, and tiny or shapeless
// territories get a screen-space ring marker. Recolouring a country is just a
// material colour change.
import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js?v=dev';
import { cameraDistanceForSpan, pickCountry } from './engine.js?v=dev';

export const COLORS = {
  ocean: '#0c1a2b', land: '#34485d', border: '#0a1017', guessed: '#4b6482',
  start: '#ffd166', warmer: '#ff7a1a', cooler: '#4a90e2', same: '#9aa7b4', correct: '#2ecc71', target: '#e05aa0',
};

const SURFACE = 1.0;        // sphere radius
const FILL_R = 1.0008;      // fills sit just above the ocean sphere
const BORDER_R = 1.0016;    // borders above fills
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
    this.camera.position.copy(latLonToVec3(20, 0, 3.0));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.04; // close enough to click the smallest islands
    this.controls.maxDistance = 4.5;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.zoomToCursor = true; // zoom towards the pointer, so small islands can be homed in on
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.addEventListener('start', () => { this.flight = null; this.controls.autoRotate = false; });

    // Ocean sphere (also the raycast target for clicks) and vector country fills.
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(SURFACE, 128, 96), new THREE.MeshBasicMaterial({ color: COLORS.ocean }));
    this.scene.add(this.sphere);
    this.fillGroup = new THREE.Group();
    this.fillsByCode = new Map();
    this.buildFills();
    this.scene.add(this.fillGroup);

    // Soft atmosphere rim.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x4cc2ff, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }),
    );
    this.scene.add(glow);

    this.scene.add(this.buildBorders());
    this.scene.add(this.buildStars());

    this.markerTexture = Globe.ringTexture();
    this.markerGroup = new THREE.Group();
    this.scene.add(this.markerGroup);
    this.pathGroup = new THREE.Group();
    this.scene.add(this.pathGroup);
    this.labelGroup = new THREE.Group();
    this.scene.add(this.labelGroup);
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

  static ringTexture() {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.lineWidth = 12; g.strokeStyle = '#fff';
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 18, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /** Triangulate every polygon into a mesh per feature; fills hug the sphere. */
  buildFills() {
    const edge = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180)), a[1] - b[1]);
    for (const f of this.features) {
      const pos = [];
      const push = (p) => { const v = latLonToVec3(p[1], p[0], FILL_R); pos.push(v.x, v.y, v.z); };
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
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLORS.land, side: THREE.DoubleSide }));
      mesh.userData.code = f.code;
      this.fillGroup.add(mesh);
      if (f.code) { if (!this.fillsByCode.has(f.code)) this.fillsByCode.set(f.code, []); this.fillsByCode.get(f.code).push(mesh); }
    }
  }

  buildBorders() {
    const pos = [];
    for (const f of this.features) for (const poly of f.polygons) for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i], [lon2, lat2] = ring[i + 1];
        // Skip Natural Earth's seams along the antimeridian and the south pole.
        if (Math.abs(lon1) > 179.99 && Math.abs(lon2) > 179.99) continue;
        if (lat1 < -89.99 && lat2 < -89.99) continue;
        const a = latLonToVec3(lat1, lon1, BORDER_R), b = latLonToVec3(lat2, lon2, BORDER_R);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COLORS.border, transparent: true, opacity: 0.9 }));
  }

  buildStars() {
    const n = 1500, pos = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(60 + rnd() * 20);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9aa7b4, size: 0.25, sizeAttenuation: true, transparent: true, opacity: 0.7 }));
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
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTexture, sizeAttenuation: false, transparent: true, depthWrite: false }));
        s.scale.setScalar(0.03);
        s.position.copy(latLonToVec3(c.latlng[0], c.latlng[1], MARK_R));
        this.markerGroup.add(s); this.markers.set(code, s);
      }
      s.material.color.set(color);
    }
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
    g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(8, 12, 18, 0.95)';
    g.strokeText(text, W / 2, H / 2 + 2);
    g.fillStyle = '#f2f6fa'; g.fillText(text, W / 2, H / 2 + 2);
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
  static labelTexture(text, color, textColor = '#0f1419') {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = color; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#0f1419'; g.stroke();
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
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Globe.labelTexture(l.text, l.color), sizeAttenuation: false, transparent: true, depthWrite: false }));
      sp.scale.setScalar(0.042);
      sp.position.copy(latLonToVec3(l.latlng[0], l.latlng[1], MARK_R + radius * 2.5)); // above the tube ends
      this.labelGroup.add(sp);
    }
  }

  /** Animate the camera to look straight down on a country. */
  flyTo(code, { duration = 1400 } = {}) {
    const c = this.countries.get(code);
    if (!c) return;
    this.controls.autoRotate = false;
    const from = this.camera.position.clone();
    const span = c.hasShape && c.span > 0 ? c.span : 0.5;
    const to = latLonToVec3(c.latlng[0], c.latlng[1], cameraDistanceForSpan(span));
    this.flight = { from, to, start: performance.now(), duration, fromDir: from.clone().normalize(), toDir: to.clone().normalize() };
  }

  frame() {
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
    this.controls.update();
    // Rebuild the path when the zoom has changed enough for its thickness to look wrong.
    if (this.pathSegments && this.pathSegments.length) {
      const d = this.camera.position.length();
      if (Math.abs(Math.log((d - 1) / (this.pathBuiltAt - 1))) > 0.2) this.setPath(this.pathSegments, this.pathLabels);
    }
    this.updateNames();
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
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.nameGroup) this.applyLabelScale();
  }
}
