/**
 * ForestPath - Three.js Procedural 3D Forest Path Scene
 * Features koi fish stream, planar reflections, volumetric god rays,
 * foliage tunnel, falling leaves, birds, particles, and pointer ripple interactions.
 */

export function initForestPath() {
  const canvas = document.getElementById('c');
  if (!canvas || typeof THREE === 'undefined') {
    console.warn('ForestPath initialization skipped: Canvas or THREE library missing');
    return null;
  }

  const R = Math.random;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const FOG = 0xf0b898;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.042);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 66 : 56;
    camera.updateProjectionMatrix();
    onWaterResize();
  }
  window.addEventListener('resize', resize);

  /* ---------- procedural textures ---------- */
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function tex(c) { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }

  const glowTex = (function () {
    const c = cv(128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return tex(c);
  })();

  const exitTex = (function () {
    const c = cv(256, 320), g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 190, 0, 128, 190, 150);
    gr.addColorStop(0, 'rgba(255,246,232,1)');
    gr.addColorStop(0.3, 'rgba(255,220,196,.95)');
    gr.addColorStop(0.7, 'rgba(255,190,165,.4)');
    gr.addColorStop(1, 'rgba(255,170,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 320);
    return tex(c);
  })();

  const rayTex = (function () {
    const c = cv(64, 256), g = c.getContext('2d');
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(255,220,180,0)');
    h.addColorStop(0.5, 'rgba(255,225,190,1)');
    h.addColorStop(1, 'rgba(255,220,180,0)');
    g.fillStyle = h; g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.3, 'rgba(0,0,0,1)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v; g.fillRect(0, 0, 64, 256);
    return tex(c);
  })();

  // veined, speckled leaf clusters. kind: 'green' | 'orange' | 'mixed'
  function frondTex(kind) {
    const c = cv(256), g = c.getContext('2d');
    g.translate(128, 128);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.3;
      const len = 55 + R() * 65;
      const wid = 8 + R() * 7;
      const orange = kind === 'orange' || (kind === 'mixed' && R() < 0.3);
      const h = orange ? 18 + R() * 20 : 88 + R() * 35;
      const s = orange ? 78 + R() * 14 : 40 + R() * 25;
      const l = orange ? 40 + R() * 15 : 13 + R() * 20;
      g.save();
      g.rotate(a);
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, `hsl(${h - 6}, ${s}%, ${l - 7}%)`);
      gr.addColorStop(1, `hsl(${h + 6}, ${s}%, ${l + 9}%)`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.5, -wid, len, 0);
      g.quadraticCurveTo(len * 0.5, wid, 0, 0);
      g.fill();
      g.strokeStyle = `hsla(${h - 8}, ${s}%, ${l - 18}%, .65)`;
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.96, 0); g.stroke();
      g.lineWidth = 0.7;
      for (let k = 1; k < 6; k++) {
        const x = len * k / 6;
        const w = wid * 0.75 * Math.sin(Math.PI * k / 6);
        g.beginPath();
        g.moveTo(x, 0); g.lineTo(x + len * 0.09, -w);
        g.moveTo(x, 0); g.lineTo(x + len * 0.09, w);
        g.stroke();
      }
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `hsla(${h + (R() - 0.5) * 16}, ${s}%, ${l + (R() - 0.3) * 24}%, ${0.15 + R() * 0.25})`;
        g.beginPath();
        g.ellipse(len * (0.15 + R() * 0.7), (R() - 0.5) * wid * 0.9, 1 + R() * 2.4, 0.8 + R() * 1.6, R() * 3, 0, 7);
        g.fill();
      }
      g.restore();
    }
    return tex(c);
  }
  const frondA = frondTex('green'), frondB = frondTex('green'), frondC = frondTex('mixed');
  const frondOrange = [frondTex('orange'), frondTex('orange'), frondTex('mixed')];

  const flowerTex = (function () {
    const c = cv(128), g = c.getContext('2d');
    g.translate(64, 64);
    for (let i = 0; i < 22; i++) {
      const a = R() * Math.PI * 2, d = R() * 34;
      g.save();
      g.translate(Math.cos(a) * d, Math.sin(a) * d * 0.8);
      g.rotate(R() * Math.PI);
      g.globalAlpha = 0.7 + R() * 0.3;
      g.fillStyle = `hsl(${20 + R() * 16}, ${80 + R() * 15}%, ${42 + R() * 16}%)`;
      const L = 9 + R() * 12;
      g.beginPath();
      g.moveTo(-L, 0);
      g.quadraticCurveTo(0, -(3 + R() * 5), L, 0);
      g.quadraticCurveTo(0, 3 + R() * 5, -L, 0);
      g.fill();
      g.restore();
    }
    const soft = g.createRadialGradient(0, 0, 10, 0, 0, 64);
    soft.addColorStop(0, 'rgba(0,0,0,1)');
    soft.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = soft; g.fillRect(-64, -64, 128, 128);
    return tex(c);
  })();

  const whiteTex = (function () {
    const c = cv(128), g = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = 20 + R() * 88, y = 24 + R() * 80, s = 3 + R() * 3;
      g.save();
      g.translate(x, y);
      g.globalAlpha = 0.55 + R() * 0.35;
      g.fillStyle = '#f4f1e6';
      for (let k = 0; k < 5; k++) {
        g.rotate(Math.PI * 2 / 5);
        g.beginPath(); g.ellipse(0, -s, s * 0.55, s, 0, 0, 7); g.fill();
      }
      g.restore();
    }
    const soft = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    soft.addColorStop(0, 'rgba(0,0,0,1)');
    soft.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = soft; g.fillRect(0, 0, 128, 128);
    return tex(c);
  })();

  const leafTexes = [
    { h: 46, s: 88, l: 52 },  // golden yellow
    { h: 33, s: 82, l: 46 },  // amber
    { h: 78, s: 48, l: 38 }   // olive green
  ].map(function (col) {
    const c = cv(128, 64), g = c.getContext('2d');
    g.translate(64, 32);
    const leafPath = function () {
      g.beginPath();
      g.moveTo(-50, 0);
      g.bezierCurveTo(-20, -30, 22, -26, 52, 0);
      g.bezierCurveTo(22, 26, -20, 30, -50, 0);
      g.closePath();
    };
    leafPath();
    const gr = g.createLinearGradient(-50, 0, 52, 0);
    gr.addColorStop(0, `hsl(${col.h - 8}, ${col.s}%, ${col.l - 15}%)`);
    gr.addColorStop(0.5, `hsl(${col.h}, ${col.s}%, ${col.l}%)`);
    gr.addColorStop(1, `hsl(${col.h + 6}, ${col.s}%, ${col.l + 12}%)`);
    g.fillStyle = gr; g.fill();
    g.save();
    g.clip();
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `hsla(${col.h + (R() - 0.5) * 20}, ${col.s}%, ${col.l + (R() - 0.5) * 30}%, ${0.15 + R() * 0.25})`;
      g.beginPath(); g.ellipse((R() - 0.5) * 100, (R() - 0.5) * 44, 1 + R() * 3, 1 + R() * 2, R() * 3, 0, 7); g.fill();
    }
    g.strokeStyle = `hsla(${col.h - 8}, ${col.s}%, ${col.l - 26}%, .75)`;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-52, 0); g.lineTo(46, 0); g.stroke();
    g.lineWidth = 1;
    for (let k = -38; k < 34; k += 9) {
      const spread = 1 - Math.abs(k) / 60;
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 14, -17 * spread); g.stroke();
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 14, 17 * spread); g.stroke();
    }
    g.restore();
    leafPath();
    g.strokeStyle = `hsla(${col.h - 10}, ${col.s}%, ${col.l - 28}%, .9)`;
    g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = `hsl(${col.h - 10}, 40%, 22%)`;
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-50, 0); g.lineTo(-60, 2); g.stroke();
    return tex(c);
  });

  const birdTex = (function () {
    const c = cv(64, 32), g = c.getContext('2d');
    g.fillStyle = '#1c1309';
    g.beginPath();
    g.moveTo(32, 20);
    g.quadraticCurveTo(16, 2, 1, 10);
    g.quadraticCurveTo(16, 10, 32, 24);
    g.quadraticCurveTo(48, 10, 63, 10);
    g.quadraticCurveTo(48, 2, 32, 20);
    g.fill();
    return tex(c);
  })();

  const groundTexture = (function () {
    const c = cv(512, 1024), g = c.getContext('2d');
    g.fillStyle = '#232e10'; g.fillRect(0, 0, 512, 1024);
    for (let i = 0; i < 4000; i++) {
      const rx = R() * 512, ry = R() * 1024;
      g.fillStyle = `hsla(${65 + R() * 60}, ${30 + R() * 35}%, ${10 + R() * 24}%, ${0.3 + R() * 0.5})`;
      g.beginPath(); g.arc(rx, ry, 1 + R() * 6, 0, 7); g.fill();
    }
    // Asymmetric river bed gradient path
    const p = g.createLinearGradient(140, 0, 360, 1024);
    p.addColorStop(0, 'rgba(120,92,52,0)');
    p.addColorStop(0.25, 'rgba(130,96,54,.85)');
    p.addColorStop(0.5, 'rgba(105,78,44,.9)');
    p.addColorStop(0.75, 'rgba(135,102,60,.8)');
    p.addColorStop(1, 'rgba(115,86,48,0)');
    g.fillStyle = p; g.fillRect(120, 0, 260, 1024);

    // Asymmetric river bed stones and pebbles with non-uniform scatter
    for (let i = 0; i < 2800; i++) {
      const x = 160 + Math.sin(i * 0.08) * 40 + R() * 150;
      const y = R() * 1024;
      g.fillStyle = R() < 0.45 ? `rgba(35,22,10,${0.35 + R() * 0.45})` : `rgba(200,165,115,${0.15 + R() * 0.35})`;
      g.beginPath();
      g.ellipse(x, y, 1.5 + R() * 4, 1 + R() * 3, R() * 3.14, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 350; i++) {
      g.fillStyle = `rgba(${180 + R() * 60}, ${100 + R() * 40}, ${30 + R() * 20}, ${0.25 + R() * 0.45})`;
      g.beginPath(); g.ellipse(R() * 512, R() * 1024, 2 + R() * 4, 1 + R() * 2, R() * 3.14, 0, 7); g.fill();
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 2.5);
    t.anisotropy = 4;
    return t;
  })();

  /* ---------- ground + trunks ---------- */
  function chanC(z) { return Math.sin(z * 0.22) * 0.8; }
  function chanHW(z) { return 1.2 + 0.35 * Math.sin(z * 0.37 + 1.0); }
  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  const groundGeo = new THREE.PlaneGeometry(18, 60, 90, 240);
  (function () {
    const pos = groundGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i), gy = pos.getY(i);
      const wz = -20 - gy;
      const dist = Math.abs(gx - chanC(wz));
      const hw = chanHW(wz);
      const s = smooth(hw + 0.45, hw - 0.2, dist);
      const wet = smooth(hw + 1.0, hw + 0.25, dist);
      pos.setZ(i, -0.5 * s);
      const k = (1 - 0.45 * wet) * (1 - 0.3 * s);
      cols[i * 3] = k; cols[i * 3 + 1] = k; cols[i * 3 + 2] = k;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  })();

  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshBasicMaterial({ map: groundTexture, vertexColors: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -20);
  scene.add(ground);

  const trunkMat = new THREE.MeshBasicMaterial({ color: 0x1a120a });
  [[2.9, -19, 0.45], [3.6, -13, 0.6], [-3.4, -16, 0.4], [-4.2, -9, 0.55]].forEach(([x, z, r]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, 12, 8), trunkMat);
    m.position.set(x, 6, z);
    scene.add(m);
  });

  /* ---------- exit glow ---------- */
  const exitGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: exitTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending
  }));
  exitGlow.scale.set(11, 14, 1);
  exitGlow.position.set(0.4, 2.2, -32);
  scene.add(exitGlow);

  const exitCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff0e0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending
  }));
  exitCore.scale.set(7, 9, 1);
  exitCore.position.set(0.4, 1.8, -31.5);
  scene.add(exitCore);

  /* ---------- water: meandering stream with planar reflection ---------- */
  var rt = null, waterU = null;
  const WATER_Y = -0.06;
  const reflCam = new THREE.PerspectiveCamera();
  const dbSize = new THREE.Vector2();

  function onWaterResize() {
    if (!waterU) return;
    renderer.getDrawingBufferSize(dbSize);
    waterU.uRes.value.copy(dbSize);
    rt.setSize(Math.max(2, Math.floor(dbSize.x * 0.6)), Math.max(2, Math.floor(dbSize.y * 0.6)));
  }

  rt = new THREE.WebGLRenderTarget(512, 512, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
  });
  waterU = {
    tReflect: { value: rt.texture },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFogColor: { value: new THREE.Color(FOG) },
    uFogDensity: { value: 0.042 },
    uRipples: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -100, 0)) }
  };

  // cursor -> water interaction
  const raycaster = new THREE.Raycaster();
  const wPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y);
  const hitPt = new THREE.Vector3();
  const ndc = new THREE.Vector2(0, 0);
  let ndcActive = false, pendingBig = false, lastSpawn = 0, lastX = 1e9, lastZ = 1e9, rIdx = 0;
  function spawnRipple(x, z, t, s) {
    waterU.uRipples.value[rIdx].set(x, z, t, s);
    rIdx = (rIdx + 1) % 16;
    lastX = x; lastZ = z; lastSpawn = t;
  }
  function setNdc(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ndcActive = true;
  }
  window.addEventListener('pointermove', setNdc);
  window.addEventListener('pointerdown', (e) => { setNdc(e); pendingBig = true; });

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 50),
    new THREE.ShaderMaterial({
      uniforms: waterU,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorld; varying float vDepth;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D tReflect; uniform float uTime; uniform vec2 uRes;
        uniform vec3 uFogColor; uniform float uFogDensity;
        uniform vec4 uRipples[16];
        varying vec3 vWorld; varying float vDepth;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec2 p = vWorld.xz;
          float c = sin(p.y * 0.22) * 0.8;
          float hw = 1.2 + 0.35 * sin(p.y * 0.37 + 1.0);
          float bankNoise = (noise(p * 2.5) - 0.5) * 0.35;
          float e = abs(p.x - c) + bankNoise;
          float alpha = 1.0 - smoothstep(hw + 0.1, hw + 0.4, e);
          alpha *= smoothstep(-33.0, -28.0, p.y);
          if (alpha < 0.01) discard;

          // Domain warping for asymmetric organic current flow
          vec2 warp = vec2(
            noise(p * vec2(2.1, 1.3) + vec2(uTime * 0.12, -uTime * 0.25)),
            noise(p * vec2(1.7, 2.9) + vec2(-uTime * 0.18, uTime * 0.31))
          );
          vec2 rotP = vec2(p.x * 0.866 - p.y * 0.5, p.x * 0.5 + p.y * 0.866);

          float n1 = noise((p + warp * 0.8) * vec2(2.8, 1.4) + vec2(uTime * 0.15, uTime * 0.45));
          float n2 = noise((rotP - warp * 0.5) * vec2(5.3, 2.7) - vec2(uTime * 0.22, uTime * 0.65));
          float n3 = noise(vec2(p.x * 4.1 + p.y * 2.3, p.y * 5.7 - p.x * 1.8) + vec2(-uTime * 0.3, uTime * 0.5));

          vec2 d = vec2(n1 - 0.5 + (n3 - 0.5) * 0.4, n2 - 0.5 - (n1 - 0.5) * 0.3) * 0.035 * clamp(8.0 / vDepth, 0.25, 1.5);

          float ringLight = 0.0;
          for (int i = 0; i < 16; i++) {
            vec4 rp = uRipples[i];
            float age = uTime - rp.z;
            if (age > 0.0 && age < 4.0) {
              vec2 dv = p - rp.xy;
              float r = length(dv);
              float front = age * 1.4;
              float env = exp(-abs(r - front) * 3.5) * exp(-age * 0.85) * rp.w;
              float w = sin((r - front) * 13.0) * env;
              d += normalize(dv + vec2(0.0001)) * w * 0.04;
              ringLight += pow(max(w, 0.0), 2.0) * 1.6;
            }
          }

          vec2 uv = gl_FragCoord.xy / uRes;
          vec2 ruv = clamp(vec2(uv.x + d.x, 1.0 - uv.y + d.y * 0.6), 0.001, 0.999);
          vec3 refl = texture2D(tReflect, ruv).rgb;

          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
          vec3 tint = vec3(0.09, 0.15, 0.08);
          vec3 col = mix(tint, refl, 0.55 + 0.4 * fres);
          col *= 0.9 + 0.2 * n1;

          // Asymmetric swirling light caustics (non-grid alignment)
          float g1 = noise(rotP * 8.5 + warp * 3.0 + vec2(uTime * 0.35, -uTime * 0.85));
          float g2 = noise(p * 11.2 - warp * 2.0 + vec2(-uTime * 0.45, uTime * 0.65));
          float g = smoothstep(0.72, 0.96, g1 * g2 * 1.4);
          col += vec3(1.0, 0.84, 0.62) * g * 0.45 * (1.0 - smoothstep(0.0, 38.0, vDepth));
          col += vec3(1.0, 0.9, 0.75) * ringLight * 0.55;

          float rim = smoothstep(hw - 0.05, hw + 0.2, e) * (1.0 - smoothstep(hw + 0.2, hw + 0.4, e));
          col = mix(col, vec3(0.35, 0.28, 0.16), rim * 0.5);

          // Atmospheric depth & shader-level subtle vignette darkening
          vec2 st = gl_FragCoord.xy / uRes;
          float vigShader = smoothstep(0.9, 0.2, length(st - vec2(0.5)));
          col *= mix(0.75, 1.0, vigShader);

          float ff = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
          col = mix(col, uFogColor, ff);
          gl_FragColor = vec4(col, alpha * mix(0.58, 0.95, fres));
        }`
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_Y, -9);
  water.renderOrder = -1;
  scene.add(water);
  onWaterResize();

  /* ---------- fish: koi that pump water through mouth + gills and gulp air ---------- */
  const fishRoot = new THREE.Group();
  scene.add(fishRoot);

  const fishVert = `
    uniform float uTime; uniform float uSpeed; uniform float uPhase;
    varying vec3 vLocal; varying vec3 vN; varying float vDepth;
    void main() {
      vec3 p = position;
      float w = 1.0 - smoothstep(-1.7, 0.7, p.x);
      p.z += sin(uTime * uSpeed - p.x * 2.6 + uPhase) * 0.2 * w * w;
      vLocal = position;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const fishFrag = `
    uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uSeed;
    uniform vec3 uFogColor; uniform float uFogDensity;
    varying vec3 vLocal; varying vec3 vN; varying float vDepth;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      float n = noise(vec2(vLocal.x * 2.3, vLocal.z * 4.0 + vLocal.y * 3.0) + uSeed);
      vec3 base = mix(uC2, uC1, smoothstep(0.42, 0.58, n));
      float dk = smoothstep(0.72, 0.8, noise(vec2(vLocal.x * 3.5, vLocal.z * 6.0 + vLocal.y * 4.0) + uSeed * 2.0));
      base = mix(base, uC3, dk * 0.85);
      base = mix(base, uC2, smoothstep(-0.05, -0.2, vLocal.y) * 0.6);
      bool fin = vLocal.x < -1.05 || abs(vLocal.z) > 0.25 || vLocal.y > 0.3;
      if (fin) base = mix(uC1, uC2, 0.35) * 0.95;
      float eye = 1.0 - smoothstep(0.03, 0.055, length(vLocal - vec3(0.72, 0.09, sign(vLocal.z) * 0.135)));
      base = mix(base, vec3(0.02), eye);
      float l = 0.5 + 0.5 * max(dot(normalize(vN), normalize(vec3(0.3, 1.0, 0.25))), 0.0);
      base *= l;
      float ff = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
      base = mix(base, uFogColor, ff);
      gl_FragColor = vec4(base, 1.0);
    }`;

  const fishGeos = (function () {
    const body = new THREE.SphereGeometry(1, 28, 16);
    const bp = body.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const taper = x < 0 ? 1 - 0.72 * Math.pow(-x, 1.3) : 1;
      bp.setXYZ(i, x, y * 0.28 * taper, z * 0.22 * taper);
    }
    body.computeVertexNormals();
    function shape(verts, idx) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const nn = [];
      for (let i = 0; i < verts.length / 3; i++) nn.push(0, 0, 1);
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      g.setIndex(idx);
      return g;
    }
    return [
      body,
      shape([-0.9, 0, 0, -1.75, 0.42, 0, -1.45, 0, 0, -1.75, -0.42, 0], [0, 1, 2, 0, 2, 3]),
      shape([0.4, 0.23, 0, -0.55, 0.2, 0, -0.2, 0.5, 0], [0, 1, 2]),
      shape([0.45, -0.06, 0.14, 0.15, -0.1, 0.18, 0.02, -0.22, 0.52], [0, 1, 2]),
      shape([0.45, -0.06, -0.14, 0.15, -0.1, -0.18, 0.02, -0.22, -0.52], [0, 1, 2])
    ];
  })();

  const palettes = [
    [[0.95, 0.42, 0.08], [0.97, 0.92, 0.8], [0.08, 0.05, 0.05]],
    [[0.96, 0.68, 0.14], [0.97, 0.93, 0.82], [0.2, 0.12, 0.06]],
    [[0.93, 0.5, 0.12], [0.95, 0.9, 0.85], [0.1, 0.1, 0.12]],
    [[0.55, 0.58, 0.5], [0.86, 0.87, 0.78], [0.12, 0.12, 0.1]]
  ];

  const fishes = [];
  for (let i = 0; i < 6; i++) {
    const pal = palettes[i % palettes.length];
    const fmat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: fishVert,
      fragmentShader: fishFrag,
      uniforms: {
        uTime: { value: 0 }, uSpeed: { value: 5 + R() * 2 }, uPhase: { value: R() * 6.28 }, uSeed: { value: R() * 20 },
        uC1: { value: new THREE.Vector3(pal[0][0], pal[0][1], pal[0][2]) },
        uC2: { value: new THREE.Vector3(pal[1][0], pal[1][1], pal[1][2]) },
        uC3: { value: new THREE.Vector3(pal[2][0], pal[2][1], pal[2][2]) },
        uFogColor: { value: new THREE.Color(FOG) }, uFogDensity: { value: 0.042 }
      }
    });
    const group = new THREE.Group();
    fishGeos.forEach(function (g) { group.add(new THREE.Mesh(g, fmat)); });
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2b0c06 }));
    mouth.position.set(0.94, -0.03, 0);
    group.add(mouth);
    const gills = [1, -1].map(function (sd) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6b2a12 }));
      m.position.set(0.42, -0.02, sd * 0.19);
      group.add(m);
      return m;
    });
    const scl = 0.24 + R() * 0.09;
    group.scale.setScalar(scl);
    fishRoot.add(group);
    const zc = -2.5 - R() * 1.5, zr = 3.5 + R() * 1.5;
    const f = {
      group, mat: fmat, mouth, gills, scl, ph: R() * 6.28,
      zc, zr, wz: 0.08 + R() * 0.07, wx: 0.2 + R() * 0.15,
      sp: 0.35 + R() * 0.25, a: R() * 6.28, x: 0, z: zc,
      g: false, g0: 0, next: 2.5 + i * 1.7 + R() * 2, r1: false, nb: 0, nextB: 0
    };
    f.x = chanC(f.z);
    fishes.push(f);
  }

  // bubbles released after a gulp
  const bubbleTex = (function () {
    const c = cv(32), g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
    g.beginPath(); g.arc(16, 16, 11, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.arc(16, 16, 11, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.arc(12, 12, 2.5, 0, 7); g.fill();
    return tex(c);
  })();
  const bubbles = [];
  for (let i = 0; i < 28; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    s.visible = false;
    fishRoot.add(s);
    bubbles.push({ s, on: false, vy: 0, ph: 0 });
  }
  function emitBubble(x, y, z) {
    for (const b of bubbles) {
      if (!b.on) {
        b.on = true; b.s.visible = true;
        b.s.position.set(x + (R() - 0.5) * 0.05, y, z + (R() - 0.5) * 0.05);
        const sz = 0.035 + R() * 0.035;
        b.s.scale.set(sz, sz, 1);
        b.vy = 0.14 + R() * 0.1; b.ph = R() * 6;
        return;
      }
    }
  }
  function pushRipple(x, z, t, s) {
    waterU.uRipples.value[rIdx].set(x, z, t, s);
    rIdx = (rIdx + 1) % 16;
  }

  function updateFish(t, dt) {
    for (const f of fishes) {
      f.mat.uniforms.uTime.value = t;

      const tz = f.zc + f.zr * Math.sin(t * f.wz + f.ph);
      const tx = chanC(tz) + chanHW(tz) * 0.5 * Math.sin(t * f.wx + f.ph * 2.0);
      let da = Math.atan2(-(tz - f.z), tx - f.x) - f.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      f.a += Math.max(-1.4 * dt, Math.min(1.4 * dt, da));

      let e = 0, hold = 0;
      if (!f.g && t > f.next) { f.g = true; f.g0 = t; f.r1 = false; f.nb = 0; f.nextB = 0; }
      if (f.g) {
        const g = (t - f.g0) / 2.6;
        if (g >= 1) { f.g = false; f.next = t + 7 + R() * 8; }
        else {
          e = g < 0.35 ? smooth(0, 0.35, g) : (g < 0.62 ? 1 : 1 - smooth(0.62, 1, g));
          hold = smooth(0.28, 0.4, g) * (1 - smooth(0.55, 0.66, g));
          const pitch = 0.5 * e;
          const nx = f.x + Math.cos(f.a) * Math.cos(pitch) * f.scl;
          const nz = f.z - Math.sin(f.a) * Math.cos(pitch) * f.scl;
          if (!f.r1 && g > 0.42) { f.r1 = true; pushRipple(nx, nz, t, 0.95); }
          if (g > 0.64 && f.nb < 5 && t > f.nextB) {
            f.nb++; f.nextB = t + 0.14;
            emitBubble(nx, f.group.position.y, nz);
          }
        }
      }

      const spd = f.sp * (1 - 0.85 * e);
      f.x += Math.cos(f.a) * spd * dt;
      f.z -= Math.sin(f.a) * spd * dt;
      const c = chanC(f.z), hh = chanHW(f.z) * 0.7;
      f.x = Math.max(c - hh, Math.min(c + hh, f.x));
      f.z = Math.max(-10, Math.min(1.8, f.z));

      const yb = -0.3 + Math.sin(t * 0.9 + f.ph) * 0.025;
      const y = yb + ((WATER_Y - 0.085) - yb) * e;
      f.group.position.set(f.x, y, f.z);
      f.group.rotation.set(0, f.a, 0.5 * e);

      const br = 0.5 + 0.5 * Math.sin(t * 6 + f.ph);
      const m = 0.18 + 0.32 * br + 0.9 * hold;
      f.mouth.scale.set(0.6, m, m * 1.2);
      const gp = 0.4 + 0.5 * (1 - br);
      f.gills[0].scale.set(0.5, 1.6, gp);
      f.gills[1].scale.set(0.5, 1.6, gp);
    }
  }

  function updateBubbles(t, dt) {
    for (const b of bubbles) {
      if (!b.on) continue;
      b.s.position.y += b.vy * dt;
      b.s.position.x += Math.sin(t * 5 + b.ph) * 0.0007;
      if (b.s.position.y >= WATER_Y - 0.005) {
        b.on = false; b.s.visible = false;
        pushRipple(b.s.position.x, b.s.position.z, t, 0.35);
      }
    }
  }

  /* ---------- foliage tunnel ---------- */
  const foliage = [];
  const frondTexes = [frondA, frondB, frondC];

  for (let i = 0; i < 580; i++) {
    const z = 8 - Math.pow(R(), 1.15) * 33;
    const narrow = smooth(2, -24, z);
    const radius = (4.4 - narrow * 2.6) + R() * 1.6;
    const th = (-0.12 + R() * 3.4);
    let x = Math.cos(th) * radius;
    let y = Math.sin(th) * radius * 0.95 + 0.3;
    if (y < 0.4) y = 0.4 + R() * 0.8;
    const isOrange = y > 2.2 && R() < 0.3;
    const mat = new THREE.SpriteMaterial({
      map: isOrange ? frondOrange[(R() * 3) | 0] : frondTexes[(R() * 3) | 0], transparent: true, depthWrite: false,
      color: isOrange ? new THREE.Color().setHSL(0.09, 0.3, 0.8 + R() * 0.2) : new THREE.Color().setHSL(0.24 + R() * 0.06, 0.4, 0.55 + R() * 0.35)
    });
    const s = new THREE.Sprite(mat);
    const size = 2.4 + R() * 3.2;
    s.scale.set(size, size, 1);
    s.position.set(x, y, z);
    mat.rotation = R() * 6.28;
    foliage.push({ mat, base: mat.rotation, sp: 0.3 + R() * 0.6, ph: R() * 6.28, s, bx: x, by: y });
    scene.add(s);
  }

  // canopy top
  for (let i = 0; i < 90; i++) {
    const isOrange = R() < 0.4;
    const mat = new THREE.SpriteMaterial({
      map: isOrange ? frondOrange[(R() * 3) | 0] : frondTexes[(R() * 3) | 0], transparent: true, depthWrite: false,
      color: isOrange ? new THREE.Color().setHSL(0.09, 0.3, 0.82 + R() * 0.18) : new THREE.Color().setHSL(0.2 + R() * 0.08, 0.45, 0.5 + R() * 0.3)
    });
    const s = new THREE.Sprite(mat);
    const size = 3 + R() * 3;
    s.scale.set(size, size, 1);
    s.position.set((R() - 0.5) * 8, 3.8 + R() * 2.4, 7 - R() * 25);
    mat.rotation = R() * 6.28;
    foliage.push({ mat, base: mat.rotation, sp: 0.3 + R() * 0.5, ph: R() * 6.28, s, bx: s.position.x, by: s.position.y });
    scene.add(s);
  }

  // ground shrubs + orange flowers
  const flowers = [];
  for (let i = 0; i < 230; i++) {
    const side = R() < 0.5 ? -1 : 1;
    const z = 9 - Math.pow(R(), 1.2) * 29;
    const x = side * (1.5 + R() * 5);
    if (Math.abs(x - chanC(z)) < chanHW(z) + 0.7) continue;
    const isShrub = R() < 0.4;
    const mat = new THREE.SpriteMaterial({
      map: isShrub ? frondTexes[(R() * 2) | 0] : flowerTex, transparent: true, depthWrite: false,
      color: isShrub ? new THREE.Color().setHSL(0.24, 0.4, 0.5 + R() * 0.3) : new THREE.Color().setHSL(0.09, 0.25, 0.85 + R() * 0.15)
    });
    const s = new THREE.Sprite(mat);
    const size = isShrub ? 1.4 + R() * 1.6 : 0.5 + R() * 0.7;
    s.scale.set(size, size, 1);
    s.position.set(x, isShrub ? size * 0.3 : 0.12 + R() * 0.5, z);
    flowers.push({ mat, ph: R() * 6.28 });
    scene.add(s);
  }

  // small white blossoms tucked low into the left-side undergrowth
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.SpriteMaterial({ map: whiteTex, transparent: true, depthWrite: false, opacity: 0.85 });
    const s = new THREE.Sprite(mat);
    const size = 0.6 + R() * 0.7;
    s.scale.set(size, size, 1);
    s.position.set(-(3.3 + R() * 2.0), 0.25 + R() * 0.55, 0 - R() * 12);
    scene.add(s);
  }

  /* ---------- god rays ---------- */
  const rays = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: rayTex, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, opacity: 0.16, side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + R() * 1.6, 14), mat);
    m.position.set(-2.2 + i * 0.9 + R() * 0.6, 3, -8 - R() * 10);
    m.rotation.z = 0.5 + R() * 0.2;
    rays.push({ m, bx: m.position.x, ph: R() * 6.28, sp: 0.2 + R() * 0.3 });
    scene.add(m);
  }

  /* ---------- volumetric-looking light shafts ---------- */
  const shaftVert = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const shaftFrag = `
    uniform float uTime; uniform float uSeed; uniform float uOpacity; uniform vec3 uColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      float x = abs(vUv.x - 0.5) * 2.0;
      float side = pow(max(1.0 - x, 0.0), 1.7);
      float top = 1.0 - smoothstep(0.72, 1.0, vUv.y);
      float bottom = 0.6 + 0.4 * smoothstep(0.0, 0.15, vUv.y);
      float n1 = noise(vec2(vUv.x * 4.0 + uSeed, vUv.y * 1.6 - uTime * 0.10));
      float n2 = noise(vec2(vUv.x * 13.0 + uSeed * 2.0, vUv.y * 3.5 + uTime * 0.18));
      float streak = (0.5 + 0.5 * n1) * (0.75 + 0.5 * n2);
      float a = side * top * bottom * streak * uOpacity;
      gl_FragColor = vec4(uColor, a);
    }`;

  const shafts = [];
  function makeShaft(o) {
    const group = new THREE.Group();
    const mats = [];
    [0, 1.1].forEach(function (ry, k) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 }, uSeed: { value: o.seed + k * 3.7 }, uOpacity: { value: o.op },
          uColor: { value: new THREE.Color(0xffe3b0) }
        },
        vertexShader: shaftVert, fragmentShader: shaftFrag
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.len), mat);
      m.rotation.y = ry;
      group.add(m);
      mats.push(mat);
    });
    group.rotation.z = o.tilt;
    group.position.set(o.x, o.y, o.z);
    scene.add(group);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(o.w * 1.9, o.w * 1.2),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: 0xffe2b0, transparent: true, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending, opacity: o.pool
      })
    );
    pool.rotation.x = -Math.PI / 2;
    scene.add(pool);
    shafts.push({ group, mats, pool, o });
  }
  makeShaft({ x: 0.1, y: 3.5, z: -7, tilt: 0.35, w: 1.5, len: 8.8, op: 0.2, pool: 0.32, seed: 1.3 });
  makeShaft({ x: -2.3, y: 3.6, z: -11, tilt: 0.33, w: 1.1, len: 8.8, op: 0.15, pool: 0.22, seed: 5.1 });
  makeShaft({ x: 2.7, y: 3.8, z: -15, tilt: 0.37, w: 0.9, len: 9, op: 0.13, pool: 0.18, seed: 9.4 });

  function updateShafts(t) {
    const sway = Math.sin(t * 0.12) * 0.025;
    for (const sh of shafts) {
      const o = sh.o;
      const px = o.x + Math.sin(t * 0.09 + o.seed) * 0.35;
      const tilt = o.tilt + sway + Math.sin(t * 0.21 + o.seed) * 0.01;
      sh.group.position.x = px;
      sh.group.rotation.z = tilt;
      sh.group.scale.set(1 + 0.12 * Math.sin(t * 0.33 + o.seed * 2.0), 1, 1);
      const flick = 0.75 + 0.25 * Math.sin(t * 0.4 + o.seed) * Math.sin(t * 0.23 + o.seed * 1.7);
      sh.mats.forEach(function (m, k) {
        m.uniforms.uTime.value = t;
        m.uniforms.uOpacity.value = o.op * flick * (k ? 0.75 : 1);
      });
      sh.pool.position.set(px + Math.tan(tilt) * o.y, 0.03, o.z);
      sh.pool.material.opacity = o.pool * (0.7 + 0.3 * flick);
    }
  }

  /* ---------- pollen / dust ---------- */
  const N = 130;
  const pPos = new Float32Array(N * 3), pSeed = [];
  for (let i = 0; i < N; i++) {
    pPos[i * 3] = (R() - 0.5) * 12;
    pPos[i * 3 + 1] = R() * 5;
    pPos[i * 3 + 2] = 6 - R() * 30;
    pSeed.push(R() * 100);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({
    map: glowTex, size: 0.1, sizeAttenuation: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffd7a8, opacity: 0.6
  }));
  scene.add(pts);

  /* ---------- falling leaves ---------- */
  const leaves = [];
  for (let i = 0; i < 30; i++) {
    const mat = new THREE.SpriteMaterial({ map: leafTexes[(R() * 3) | 0], transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat);
    const size = 0.17 + R() * 0.16;
    s.scale.set(size * 2, size, 1);
    s.position.set((R() - 0.5) * 8, R() * 5, 3 - R() * 20);
    leaves.push({ s, mat, h: size, v: 0.15 + R() * 0.25, ph: R() * 6.28, sp: 0.6 + R() * 1.2 });
    scene.add(s);
  }

  /* ---------- birds ---------- */
  const birds = [];
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.SpriteMaterial({ map: birdTex, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat);
    const size = 0.34 + R() * 0.3;
    s.scale.set(size * 2, size, 1);
    scene.add(s);
    birds.push({
      s, size,
      cx: (R() - 0.5) * 3, cy: 1.8 + R() * 1.6, cz: -8 - R() * 12,
      rx: 1 + R() * 2, ry: 0.4 + R() * 0.7, rz: 1.5 + R() * 3,
      a: 0.15 + R() * 0.25, b: 0.3 + R() * 0.4, c: 0.12 + R() * 0.2,
      ph: R() * 6.28, f: 5 + R() * 5
    });
  }

  /* ---------- camera + loop ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  let isRunning = true;
  let animId = null;

  function frame() {
    if (!isRunning) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime * (reduce ? 0.2 : 1);

    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;

    camera.position.set(
      Math.sin(t * 0.21) * 0.28 + mouse.x * 0.45,
      1.35 + Math.sin(t * 0.33) * 0.07 - mouse.y * 0.18,
      7.8 - (Math.sin(t * 0.06) * 0.5 + 0.5) * 2.2
    );
    look.set(0.3 + mouse.x * 0.6, 1.9 - mouse.y * 0.3, -22);
    camera.lookAt(look);

    for (const f of foliage) {
      f.mat.rotation = f.base + Math.sin(t * f.sp + f.ph) * 0.07;
      f.s.position.x = f.bx + Math.sin(t * f.sp * 0.8 + f.ph) * 0.05;
    }
    for (const f of flowers) f.mat.rotation = Math.sin(t * 0.8 + f.ph) * 0.12;

    for (const r of rays) {
      r.m.material.opacity = 0.08 + (Math.sin(t * r.sp + r.ph) * 0.5 + 0.5) * 0.1;
      r.m.position.x = r.bx + Math.sin(t * r.sp * 0.6 + r.ph) * 0.35;
    }
    exitCore.material.opacity = 0.85 + Math.sin(t * 0.7) * 0.15;
    updateShafts(t);

    const pa = pGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const s = pSeed[i];
      pa[i * 3] += Math.sin(t * 0.4 + s) * 0.0025 + 0.0012;
      pa[i * 3 + 1] += Math.cos(t * 0.3 + s * 1.3) * 0.0022 + 0.0008;
      pa[i * 3 + 2] += Math.sin(t * 0.2 + s * 0.7) * 0.0015;
      if (pa[i * 3] > 6) pa[i * 3] = -6;
      if (pa[i * 3 + 1] > 5.2) pa[i * 3 + 1] = 0.1;
    }
    pGeo.attributes.position.needsUpdate = true;

    for (const l of leaves) {
      l.s.position.y -= l.v * dt;
      l.s.position.x += Math.sin(t * l.sp + l.ph) * 0.006;
      l.mat.rotation += dt * l.sp * 0.5;
      l.s.scale.y = l.h * (0.3 + 0.7 * Math.abs(Math.cos(t * l.sp * 1.5 + l.ph)));
      if (l.s.position.y < 0.05) { l.s.position.y = 4.5 + R(); l.s.position.x = (R() - 0.5) * 8; }
    }

    for (const b of birds) {
      b.s.position.set(
        b.cx + Math.sin(t * b.a + b.ph) * b.rx,
        b.cy + Math.sin(t * b.b + b.ph * 2) * b.ry,
        b.cz + Math.sin(t * b.c + b.ph * 3) * b.rz
      );
      b.s.scale.y = b.size * (0.25 + 0.75 * Math.abs(Math.sin(t * b.f + b.ph)));
    }

    // fish
    const ts = reduce ? 0.2 : 1;
    updateFish(t, dt * ts);
    updateBubbles(t, dt * ts);

    // cursor ripples
    if (ndcActive) {
      camera.updateMatrixWorld();
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(wPlane, hitPt)) {
        const hz = hitPt.z, hx = hitPt.x;
        const cc = Math.sin(hz * 0.22) * 0.8, hw = 1.2 + 0.35 * Math.sin(hz * 0.37 + 1.0);
        if (hz < 7 && hz > -30 && Math.abs(hx - cc) < hw + 0.2) {
          const moved = Math.hypot(hx - lastX, hz - lastZ);
          if (pendingBig) spawnRipple(hx, hz, t, 1.7);
          else if (moved > 0.2 && t - lastSpawn > 0.09) spawnRipple(hx, hz, t, Math.min(1, 0.4 + moved * 1.2));
        }
      }
      pendingBig = false;
    }

    // Planar reflection pass
    waterU.uTime.value = t;
    reflCam.copy(camera);
    reflCam.position.set(camera.position.x, 2 * WATER_Y - camera.position.y, camera.position.z);
    reflCam.up.set(0, 1, 0);
    reflCam.lookAt(look.x, 2 * WATER_Y - look.y, look.z);
    reflCam.updateMatrixWorld();
    water.visible = false;
    ground.visible = false;
    fishRoot.visible = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, reflCam);
    renderer.setRenderTarget(null);
    water.visible = true;
    ground.visible = true;
    fishRoot.visible = true;

    // Render 3D Forest Path scene
    renderer.render(scene, camera);
    animId = requestAnimationFrame(frame);
  }

  resize();
  frame();

  // IntersectionObserver to pause rendering when hero is scrolled offscreen
  const heroElement = document.getElementById('landing-hero');
  if (heroElement && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!isRunning) {
            isRunning = true;
            clock.start();
            frame();
          }
        } else {
          isRunning = false;
          if (animId) cancelAnimationFrame(animId);
        }
      });
    }, { threshold: 0.05 });
    observer.observe(heroElement);
  }

  return {
    resize,
    destroy() {
      isRunning = false;
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    }
  };
}
