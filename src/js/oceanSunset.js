/**
 * oceanSunset.js - realistic sunset ocean with sun glitter (three.js r128, WebGL)
 *
 * Usage:
 *   import { initOceanSunset } from './oceanSunset.js';
 *   const ocean = initOceanSunset(document.getElementById('ocean'));
 *   ocean.resume();   // start rendering
 *
 * Scroll story: surface -> big wave -> dive -> headlines on the sea floor -> a white cloth printed with your
 * projects floats in the water and is fed through the view (the camera stays put). The ocean part ends where <section id="cloth-start"> begins; if the page has no
 * such element, the last 40% of the scroll (options.clothShare) is given to the cloth.
 * Options: { projects: ['NAME', ...any number], cloth: false, textColor: 0xFFFFFF, look: true }
 * Add projects later with  ocean.setProjects([...])  - the ribbon and the page's scroll length grow to fit.
 *   ocean.pause();    // stop rendering (keeps GPU resources)
 *   ocean.destroy();  // free everything
 *
 * Needs the global THREE (r128). For the glow, also load the r128 postprocessing
 * scripts (optional, the scene works without them).
 * The scene starts PAUSED and has drawn one frame, so shaders are already compiled.
 */
export function initOceanSunset(canvas, options) {
  options = options || {};
  if (!canvas || typeof THREE === 'undefined') {
    console.warn('OceanSunset initialization skipped: canvas or THREE missing');
    return null;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x2a1220, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 9000);
  camera.position.set(0, 4.0, 0);
  camera.rotation.order = 'YXZ';
  const BASE_PITCH = -0.15;
  let yaw = 0, pitch = BASE_PITCH;

  /* ---------------- scroll timeline ----------------
     P = scroll progress 0..1 over the whole page
       0.00-0.40  slow drift forward on the surface
       0.10-0.46  a big wave rolls in and hits the camera
       0.40-0.64  camera sinks slowly under the water
       0.64-1.00  glides over the sea floor, one headline at a time                 */
  const SEABED_Y = -26;
  const UNDER_Y = SEABED_Y + 12;       // high enough to look down onto the sand text
  const UNDER_PITCH = -0.30;
  function smooth01(a, b, x) {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  }
  function ease01(a, b, x) {            // smootherstep: no jerk at either end
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  function camZAt(P) {
    const u = Math.min(1, Math.max(0, (P - 0.64) / 0.36));
    return -26 * smooth01(0, 0.40, P) - 9 * ease01(0.40, 0.64, P) - 250 * (u * u * (3 - 2 * u));
  }
  function bigWaveH(x, z, t, zc, H) {
    const s = (z - zc) / 16;
    const k = s > 0 ? 3.2 : 0.55;
    return H * (0.88 + 0.12 * Math.sin(x * 0.045 + t * 0.4)) * Math.exp(-s * s * k);
  }
  let splashAmt = 0;

  /* ---------------- shared GLSL ---------------- */
  const COMMON = `
    uniform float uTime;
    uniform float uAmp;
    uniform float uSwell;
    uniform vec3  uSunDir;
    uniform vec4  uBig;        // big wave: z centre, height, width, -
    uniform float uUnderMix;   // 0 = camera above water, 1 = fully underwater
    uniform vec3  uFogColor;   // underwater fog (linear)
    uniform float uFogDensity;

    vec2 wavedx(vec2 pos, vec2 dir, float spd, float frq, float tshift) {
      float x = dot(dir, pos) * frq + tshift * spd;
      float wv = exp(sin(x) - 1.0);
      return vec2(wv, -wv * cos(x));
    }

    // returns (height, d/dx, d/dz) of a domain-warped sum of sharpened sine waves
    vec3 getwavesD(vec2 pos, int iterations) {
      float iter = 0.0;
      float frq = 0.30;
      float weight = 1.0;
      float w = 0.0;
      float ws = 0.0;
      vec2 g = vec2(0.0);
      for (int i = 0; i < 40; i++) {
        if (i >= iterations) break;
        vec2 d = vec2(sin(iter), cos(iter));
        float spd = sqrt(9.81 * frq);
        vec2 res = wavedx(pos, d, spd, frq, uTime);
        g += weight * (-d * frq * res.y);
        pos += d * res.y * weight * 0.38 / (frq * 3.0 + 0.3);
        w += res.x * weight;
        ws += weight;
        weight = mix(weight, 0.0, 0.16);
        frq *= 1.12;
        iter += 12.0;
      }
      return vec3(w / ws, g * 3.4 / ws);
    }

    // long rolling swell, with analytic slope
    vec3 swellD(vec2 p) {
      float t = uTime;
      vec2 d1 = vec2( 0.10, -0.99); float k1 = 0.115;
      vec2 d2 = vec2(-0.45, -0.89); float k2 = 0.190;
      vec2 d3 = vec2( 0.62, -0.78); float k3 = 0.310;
      float x1 = dot(p, d1) * k1 + t * 1.06;
      float x2 = dot(p, d2) * k2 + t * 1.36 + 1.7;
      float x3 = dot(p, d3) * k3 + t * 1.74 + 4.1;
      float a = exp(sin(x1) - 1.0);
      float b = exp(sin(x2) - 1.0);
      float c = exp(sin(x3) - 1.0);
      float h = 0.60 * a + 0.28 * b + 0.12 * c;
      vec2 g = 0.60 * a * cos(x1) * k1 * d1
             + 0.28 * b * cos(x2) * k2 * d2
             + 0.12 * c * cos(x3) * k3 * d3;
      return uSwell * vec3(h, g.x, g.y);
    }

    vec2 rippleGrad(vec2 p) {
      vec2 g = vec2(0.0);
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float a = fi * 2.399 + 0.7;
        vec2 d = vec2(cos(a), sin(a));
        float k = 1.6 * pow(1.38, fi);
        float x = dot(d, p) * k + uTime * sqrt(9.81 * k) + fi * 1.7;
        g += d * cos(x) * 0.085;
      }
      return g;
    }

    // one big travelling wall of water, steep on the side facing the camera: (height, d/dx, d/dz)
    vec3 bigWaveD(vec2 p) {
      float s = (p.y - uBig.x) / uBig.z;
      float k = s > 0.0 ? 3.2 : 0.55;
      float f = exp(-s * s * k);
      float mx = 0.88 + 0.12 * sin(p.x * 0.045 + uTime * 0.4);
      float h = uBig.y * mx * f;
      float dz = uBig.y * mx * f * (-2.0 * s * k) / uBig.z;
      return vec3(h, 0.0, dz);
    }

    float heightAt(vec2 p, int its) {
      return getwavesD(p, its).x * uAmp + swellD(p).x + bigWaveD(p).x;
    }

    vec3 skyBase(vec3 dir) {
      float hh = clamp(dir.y, 0.0, 1.0);
      vec3 horizon = vec3(0.80, 0.24, 0.14);
      vec3 zenith  = vec3(0.07, 0.04, 0.10);
      vec3 col = mix(horizon, zenith, pow(hh, 0.40));
      float cs = max(dot(dir, uSunDir), 0.0);
      col += vec3(1.00, 0.45, 0.20) * (pow(cs, 8.0) * 0.16 + pow(cs, 60.0) * 0.45);
      return col;
    }

    // full sky = soft sky + glow core + the sun disc itself
    vec3 skyColor(vec3 dir) {
      vec3 col = skyBase(dir);
      float cs = max(dot(dir, uSunDir), 0.0);
      col += vec3(1.00, 0.70, 0.38) * pow(cs, 400.0) * 1.6;
      float sunDisc = smoothstep(0.99745, 0.99800, cs);
      col = mix(col, vec3(1.0, 0.86, 0.52) * 28.0, sunDisc);
      return col;
    }

    vec3 toneMap(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
  `;

  const uniforms = {
    uTime:   { value: 0 },
    uAmp:    { value: 1.9 },
    uSwell:  { value: 3.2 },
    uSunDir: { value: new THREE.Vector3(0, 0.04, -1) },
    uExposure: { value: 1.0 },
    uBig:      { value: new THREE.Vector4(-300, 0, 14, 0) },
    uUnderMix: { value: 0 },
    uFogColor: { value: new THREE.Vector3(0.006, 0.035, 0.06) },
    uFogDensity: { value: 0.011 }
  };

  /* ---------------- water ---------------- */
  const waterMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vWorld;
      ${COMMON}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += heightAt(wp.xz, 8);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorld;
      uniform float uExposure;
      ${COMMON}
      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = max(length(toCam), 0.001);
        vec3 V = toCam / dist;

        int its = int(mix(30.0, 20.0, smoothstep(25.0, 500.0, dist)));
        vec3 wd = getwavesD(vWorld.xz, its);
        vec3 sd = swellD(vWorld.xz);
        vec3 bw = bigWaveD(vWorld.xz);
        float h = wd.x * uAmp + sd.x;
        vec2 grad = wd.yz * uAmp + sd.yz + bw.yz;
        grad += rippleGrad(vWorld.xz) * (1.0 - 0.45 * smoothstep(80.0, 700.0, dist));
        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
        N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(200.0, 1500.0, dist) * 0.4));

        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        R = normalize(R);
        vec3 refl = skyColor(R);

        float ndl = max(dot(N, uSunDir), 0.0);
        float crest = smoothstep(0.35, 1.0, (h + uSwell * 0.2) / (uSwell + uAmp + 0.001));
        vec3 body = vec3(0.050, 0.018, 0.036);
        body += vec3(0.75, 0.24, 0.14) * ndl * 0.30;
        body += vec3(0.55, 0.14, 0.12) * crest * 0.10 * (0.8 + 0.6 * max(dot(-V, uSunDir), 0.0));
        body += vec3(0.30, 0.10, 0.16) * 0.12 * (0.5 + 0.5 * N.y);

        vec3 col = body * (1.0 - F) + refl * F;

        vec3 flatDir = normalize(vec3(-V.x, 0.0, -V.z) + vec3(0.0, 0.003, 0.0));
        vec3 haze = skyBase(flatDir);
        col = mix(col, haze, 1.0 - exp(-dist * 0.00032));

        // white water on the big wave's crest
        float bwN = bw.x / max(uBig.y, 0.001);
        float foam = smoothstep(0.62, 0.95, bwN) * smoothstep(0.5, 2.0, uBig.y);
        float fn = 0.55 + 0.45 * sin(vWorld.x * 0.8 + uTime * 2.3) * sin(vWorld.z * 1.1 - uTime * 1.7);
        col = mix(col, vec3(0.9, 0.8, 0.85), clamp(foam * fn * 0.85, 0.0, 1.0));

        // seen from below: bright window of sky (refracted), dark mirror outside it
        if (uUnderMix > 0.001) {
          vec3 Iu = -V;
          vec3 Nd = normalize(mix(-N, vec3(0.0, -1.0, 0.0), 0.75));   // calmer underside = no sparkle noise
          vec3 Tr = refract(Iu, Nd, 1.33);
          float tir = step(dot(Tr, Tr), 0.001);
          Tr = mix(Tr, vec3(0.0, 1.0, 0.0), tir);
          vec3 skyU = skyColor(normalize(vec3(Tr.x, abs(Tr.y), Tr.z)));
          float cosU = clamp(dot(V, Nd), 0.0, 1.0);
          float Fu = 0.02 + 0.98 * pow(1.0 - cosU, 5.0);
          vec3 colU = mix(skyU * 0.5, uFogColor * 2.2, max(Fu, tir));
          colU = mix(colU, uFogColor, 1.0 - exp(-dist * uFogDensity * 1.7));
          col = mix(col, colU, uUnderMix);
        }

        col = toneMap(col * uExposure);
        col = pow(col, vec3(1.0 / 2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  // Polar grid: very dense around the camera, sparse near the horizon
  function makeOceanGeometry(rings, segs, r0, R) {
    const pos = new Float32Array((rings + 1) * (segs + 1) * 3);
    let k = 0;
    for (let i = 0; i <= rings; i++) {
      const r = r0 * Math.pow(R / r0, i / rings);
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        pos[k++] = Math.cos(a) * r; pos[k++] = 0; pos[k++] = Math.sin(a) * r;
      }
    }
    const idx = new Uint32Array(rings * segs * 6);
    let m = 0;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j, b = a + segs + 1;
        idx[m++] = a; idx[m++] = b; idx[m++] = a + 1;
        idx[m++] = a + 1; idx[m++] = b; idx[m++] = b + 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  const ocean = new THREE.Mesh(makeOceanGeometry(220, 320, 0.5, 3000), waterMat);
  ocean.frustumCulled = false;
  scene.add(ocean);

  /* ---------------- sky dome ---------------- */
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vDir;
      uniform float uExposure;
      ${COMMON}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(vec3(d.x, max(d.y, 0.0), d.z));
        col = mix(col, uFogColor, uUnderMix);
        col = toneMap(col * uExposure);
        col = pow(col, vec3(1.0 / 2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  /* ---------------- 3D Ocean Text Landmarks & Water Reflections ---------------- */
  const textData = [
    { id: 'page1', text: 'WE BUILD' },
    { id: 'page2', text: 'DIGITAL EXPERIENCES.' },
    { id: 'page3', text: 'WE TURN IDEAS' },
    { id: 'page4', text: 'INTO DIGITAL PRODUCTS.' }
  ];
  // headline 1 floats on the surface; 2-4 appear one by one on the sea floor
  const textUnder = [false, true, true, true];
  const UNDER_TEXT_P = [0.70, 0.80, 0.90];            // scroll position where each is centred
  const textDistances = [-52].concat(UNDER_TEXT_P.map((pp) => camZAt(pp) - 34));

  function createTextTexture(text, hiRes) {
    const canvas = document.createElement('canvas');
    canvas.width = 3072;
    canvas.height = 614;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';              // plain fill: no stroke, no outline, no shadow

    const fam = '"Space Grotesk", "Syne", "Inter", sans-serif';
    let fontSize = text.length > 20 ? 115 : 145;
    if (hiRes) {                            // sand headlines: as large as the canvas allows (stays sharp when stretched)
      ctx.font = `900 200px ${fam}`;
      fontSize = Math.min(300, Math.floor(200 * Math.min(1.6, 2960 / Math.max(1, ctx.measureText(text).width))));
    }
    ctx.font = `900 ${fontSize}px ${fam}`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const m = ctx.measureText(text);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    if (renderer.capabilities.isWebGL2) {   // mipmaps + anisotropy keep the letters crisp at a low viewing angle
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    } else {
      texture.minFilter = THREE.LinearFilter;
    }
    const asc = m.actualBoundingBoxAscent || fontSize * 0.36;
    const desc = m.actualBoundingBoxDescent || fontSize * 0.36;
    texture.userData = {
      glyphW: m.width / canvas.width * 105,                         // text width in plane units (plane is 105 wide)
      vBottom: 1 - (canvas.height / 2 + desc) / canvas.height,      // texture v of the letters' bottom edge
      vTop: 1 - (canvas.height / 2 - asc) / canvas.height           // ... and top edge
    };
    texture.needsUpdate = true;
    return texture;
  }

  // Headline colour (display-space RGB, not tone-mapped). Change live with setTextColor().
  const textColorU = { value: new THREE.Color(options.textColor != null ? options.textColor : 0xFFFFFF) };

  const textPlaneGeo = new THREE.PlaneGeometry(105, 21);
  const reflPlaneGeo = new THREE.PlaneGeometry(105, 21);

  const textMeshes = textData.map((data, idx) => {
    const texture = createTextTexture(data.text, textUnder[idx]);
    
    // 1. Main Elevated Text Material & Mesh
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uOpacity: { value: 1.0 },
        uExposure: uniforms.uExposure,
        uTime: uniforms.uTime,
        uSunDir: uniforms.uSunDir,
        uUnderMix: uniforms.uUnderMix,
        uFogColor: uniforms.uFogColor,
        uFogDensity: uniforms.uFogDensity,
        uTextColor: textColorU
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying vec3 vWorld;
        uniform sampler2D uMap;
        uniform vec3 uTextColor;
        uniform float uOpacity;
        uniform float uExposure;

        ${COMMON}
        void main() {
          vec4 texColor = texture2D(uMap, vUv);
          if (texColor.a < 0.01 || uOpacity < 0.001) discard;

          // flat colour; the glyph shape only drives alpha (no outline, no shadow, no gray edge)
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 col = uTextColor;
          // underwater, letters sink into the water haze with distance (physical fog, not a fade effect)
          float fogT = uUnderMix * (1.0 - exp(-dist * uFogDensity * 0.32));
          col = mix(col, pow(uFogColor, vec3(1.0 / 2.2)), fogT);
          gl_FragColor = vec4(col, texColor.a * uOpacity);
        }
      `
    });
    
    const mesh = new THREE.Mesh(textPlaneGeo, mat);
    mesh.position.set(0, 3.0, textDistances[idx]);
    scene.add(mesh);

    // Depth-only twin: writes the solid glyph pixels into the depth buffer (no colour),
    // so the depth-of-field pass can see the text. Sits 0.02 behind the visible plane.
    const depthMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uOpacity: mat.uniforms.uOpacity },
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform vec3 uTextColor;
        uniform float uOpacity;
        void main() {
          if (texture2D(uMap, vUv).a < 0.6 || uOpacity < 0.05) discard;
          gl_FragColor = vec4(0.0);
        }
      `
    });
    const depthMesh = new THREE.Mesh(textPlaneGeo, depthMat);
    depthMesh.position.set(0, 3.0, textDistances[idx] - 0.02);
    scene.add(depthMesh);
    if (textUnder[idx]) { mesh.rotation.x = -Math.PI / 2; depthMesh.rotation.x = -Math.PI / 2; }   // lie flat on the sand

    // 2. Shimmering Water Surface Reflection Material & Mesh
    const reflMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uOpacity: { value: 1.0 },
        uFloor: { value: textUnder[idx] ? 1 : 0 },
        uBaseZ: { value: textDistances[idx] },
        uGlyphV: { value: new THREE.Vector2(0.4, 0.6) },
        uTime: uniforms.uTime,
        uExposure: uniforms.uExposure,
        uSunDir: uniforms.uSunDir,
        uUnderMix: uniforms.uUnderMix,
        uFogColor: uniforms.uFogColor,
        uFogDensity: uniforms.uFogDensity,
        uTextColor: textColorU
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying vec3 vWorld;
        uniform sampler2D uMap;
        uniform vec3 uTextColor;
        uniform float uFloor;
        uniform float uBaseZ;
        uniform vec2 uGlyphV;
        uniform float uOpacity;
        uniform float uExposure;
        ${COMMON}
        void main() {
          vec2 distortedUv = vUv;
          distortedUv.y = 1.0 - vUv.y; // Mirror flip
          distortedUv.x += sin(vUv.y * 22.0 + uTime * 2.5) * 0.02 * (1.0 - vUv.y);
          distortedUv.y += cos(vUv.x * 28.0 + uTime * 2.0) * 0.012;
          if (uFloor > 0.5) {
            distortedUv.x += sin(vWorld.z * 2.2 + uTime * 1.8) * 0.010 + sin(vWorld.x * 1.3 - uTime * 1.2) * 0.006;
            distortedUv.y += sin(vWorld.x * 2.6 + uTime * 1.4) * 0.008;
          }
          
          vec4 texColor = texture2D(uMap, distortedUv);
          if (texColor.a < 0.02 || uOpacity < 0.001) discard;
          
          float tG = clamp((distortedUv.y - uGlyphV.x) / max(uGlyphV.y - uGlyphV.x, 0.01), 0.0, 1.0);
          float fade = uFloor > 0.5 ? mix(1.0, 0.35, tG) : smoothstep(1.0, 0.05, vUv.y);
          vec3 reflColor = uTextColor * 0.9;
          
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 flatDir = normalize(vec3(-toCam.x, 0.0, -toCam.z));
          vec3 haze = skyBase(flatDir);
          reflColor = mix(reflColor, haze, 1.0 - exp(-dist * 0.00035));
          reflColor = mix(reflColor, pow(uFogColor, vec3(1.0 / 2.2)), uUnderMix * (1.0 - exp(-dist * uFogDensity * 0.32)));
          
          gl_FragColor = vec4(reflColor, texColor.a * uOpacity * fade * (uFloor > 0.5 ? 0.5 : 0.55));
        }
      `
    });

    const reflMesh = new THREE.Mesh(reflPlaneGeo, reflMat);
    reflMesh.position.set(0, -0.4, textDistances[idx]);
    if (textUnder[idx]) reflMesh.rotation.x = -Math.PI / 2;   // lies on the sand
    scene.add(reflMesh);
    
    return {
      id: data.id,
      mesh,
      mat,
      reflMesh,
      reflMat,
      depthMesh,
      depthMat,
      targetZ: textDistances[idx]
    };
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      textMeshes.forEach((item, idx) => {
        const tex = createTextTexture(textData[idx].text, textUnder[idx]);
        if (item.mat.uniforms.uMap.value) item.mat.uniforms.uMap.value.dispose();
        item.mat.uniforms.uMap.value = tex;
        if (item.reflMat.uniforms.uMap.value) item.reflMat.uniforms.uMap.value = tex;
        item.depthMat.uniforms.uMap.value = tex;
      });
    });
  }

  let targetP = 0, currentP = 0, targetQ = 0, currentQ = 0;
  // ONE smoothed scroll position drives both the ocean (P) and the cloth (Q), so the cloth can only exist
  // while the ocean is at its very end - scrolling back never leaves a cloth hanging in an earlier scene.
  let scrollTarget = 0, scrollNow = 0, oceanLenPx = 1, maxPx = 1;
  const clothEnabled = options.cloth !== false;
  // Share of the page's scroll given to the cloth when the page has no #cloth-start marker element.
  const clothShare = options.clothShare != null ? options.clothShare : 0.4;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  function onScroll() {
    const y = window.scrollY || window.pageYOffset;
    const vh = window.innerHeight || 1;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    maxPx = max;
    scrollTarget = y;
    if (!clothEnabled) {
      oceanLenPx = max;
    } else {
      // the ocean ends when the bottom of the screen reaches <section id="cloth-start">
      const marker = document.getElementById('cloth-start');
      let len = marker ? marker.getBoundingClientRect().top + y - vh : max * (1 - clothShare);
      oceanLenPx = Math.min(max - 1, Math.max(1, len));
    }
    targetP = clamp01(y / oceanLenPx);
    targetQ = clothEnabled ? clamp01((y - oceanLenPx) / Math.max(1, max - oceanLenPx)) : 0;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  scrollNow = scrollTarget;
  currentP = targetP;
  currentQ = targetQ;

  /* ---------------- underwater world: sea floor, drifting particles, air bubbles ---------------- */
  const SEABED_STEP = 6;
  const underGroup = new THREE.Group();
  underGroup.visible = false;
  scene.add(underGroup);
  const pScale = { value: 800 };      // pixels per world unit at distance 1 (set in resize)
  const surfU  = { value: 0 };        // water surface height above the camera

  const seabedMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vWorld;
      float duneH(vec2 p) {
        float side = smoothstep(32.0, 85.0, abs(p.x));      // flat corridor down the middle
        float d = 1.6 * sin(p.x * 0.045 + p.y * 0.02)
                + 1.1 * sin(p.y * 0.06 - p.x * 0.03 + 1.3)
                + 0.4 * sin(p.x * 0.15 + p.y * 0.11);
        return side * d * 0.9;
      }
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += duneH(wp.xz);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorld;
      uniform float uTime, uExposure, uFogDensity;
      uniform vec3 uFogColor;

      vec3 toneMapS(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      float rip(vec2 q) {
        float a = sin(dot(q, vec2(0.92, 0.38)) * 1.7 + 0.8 * sin(q.y * 0.35));
        float b = sin(dot(q, vec2(-0.30, 0.95)) * 2.9 + 1.7);
        float c = sin(dot(q, vec2(0.62, -0.78)) * 5.3 + sin(q.x * 0.8));
        return 0.55 * a + 0.30 * b + 0.15 * c;
      }
      // tiling water caustics
      float caustic(vec2 p, float t) {
        vec2 i = p;
        float c = 1.0;
        float inten = 0.005;
        for (int n = 0; n < 4; n++) {
          float tt = t * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 4.0;
        c = 1.17 - pow(c, 1.4);
        return pow(abs(c), 8.0);
      }
      void main() {
        vec2 p = vWorld.xz;
        vec2 q = p - vec2(uTime * 0.45, uTime * 0.15);          // the sand creeps with the current
        float e = 0.12;
        float h0 = rip(q);
        vec2 g = vec2(rip(q + vec2(e, 0.0)) - h0, rip(q + vec2(0.0, e)) - h0) / e;
        vec3 N = normalize(vec3(-g.x * 0.28, 1.0, -g.y * 0.28));
        vec3 L = normalize(vec3(0.25, 1.0, -0.35));
        float diff = max(dot(N, L), 0.0);

        float speck = fract(sin(dot(floor(p * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 alb = mix(vec3(0.30, 0.22, 0.14), vec3(0.52, 0.41, 0.27), h0 * 0.35 + 0.5 + (speck - 0.5) * 0.12);

        vec2 cp = mod(p * 0.07 * 6.28318, 6.28318) - 250.0;
        vec2 p2 = mat2(0.82, -0.57, 0.57, 0.82) * p + vec2(7.3, 3.1);      // rotated + offset copy at another scale
        vec2 cp2 = mod(p2 * 0.043 * 6.28318, 6.28318) - 250.0;               // so the pattern never visibly repeats
        float c = 0.7 * (caustic(cp, uTime * 0.6 + 23.0) + caustic(cp2, uTime * 0.45 + 61.0));
        vec3 light = vec3(0.35, 0.75, 0.95) * (0.30 + diff * 0.9) + vec3(0.6, 1.0, 1.0) * c * 1.6;
        vec3 col = alb * light;

        float dist = length(cameraPosition - vWorld);
        col = mix(col, uFogColor, 1.0 - exp(-dist * uFogDensity));
        col = toneMapS(col * uExposure);
        col = pow(col, vec3(1.0 / 2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const seabedGeo = new THREE.PlaneGeometry(1400, 1400, 230, 230);
  seabedGeo.rotateX(-Math.PI / 2);
  const seabed = new THREE.Mesh(seabedGeo, seabedMat);
  seabed.frustumCulled = false;
  underGroup.add(seabed);

  // GPU-animated point clouds that wrap around the camera (no CPU per-frame work)
  const particleSets = [];
  function makeParticles(o) {
    const n = o.count;
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime, uUnder: o.gate || uniforms.uUnderMix, uScale: pScale, uSurf: surfU,
        uMaxPx: { value: o.maxPx || 8 }, uSkew: { value: o.skew || 1 }, uNear: { value: o.near || 0.4 },
        uCam: { value: camera.position },
        uBox: { value: new THREE.Vector3().fromArray(o.box) },
        uOff: { value: new THREE.Vector3().fromArray(o.off || [0.5, 0.5, 0.85]) },
        uVel: { value: new THREE.Vector3().fromArray(o.vel) },
        uSize: { value: new THREE.Vector2().fromArray(o.size) },
        uWob: { value: o.wobble || 0 },
        uAnchor: { value: o.anchor ? 1 : 0 },
        uSeabed: { value: SEABED_Y },
        uColor: { value: new THREE.Vector3().fromArray(o.color) },
        uStyle: { value: o.bubble ? 1 : 0 },
        uAlpha: { value: o.alpha != null ? o.alpha : 1 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 aSeed;
        uniform float uTime, uScale, uUnder, uAnchor, uSeabed, uWob, uSurf, uMaxPx, uSkew, uNear;
        uniform vec3 uCam, uBox, uOff, uVel;
        uniform vec2 uSize;
        varying float vA;
        void main() {
          float sp = 0.6 + aSeed.w * 0.8;
          vec3 p = aSeed.xyz * uBox + uVel * sp * uTime;
          p.x += sin(uTime * (0.7 + aSeed.w) + aSeed.y * 50.0) * uWob;
          p.z += cos(uTime * (0.6 + aSeed.x) + aSeed.z * 40.0) * uWob;
          vec3 rel = mod(p - uCam, uBox) - uBox * uOff;
          vec3 w = uCam + rel;
          if (uAnchor > 0.5) w.y = uSeabed + 0.15 + mod(p.y, uBox.y);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          float size = mix(uSize.x, uSize.y, pow(fract(aSeed.w * 13.7), uSkew));   // skewed: mostly tiny, a few bigger
          gl_PointSize = clamp(size * uScale / max(dist, 0.1), 1.0, uMaxPx);
          vA = (1.0 - smoothstep(uBox.z * 0.45, uBox.z * 0.85, dist))
             * smoothstep(uNear, uNear * 3.0, dist)
             * (1.0 - smoothstep(uSurf - 3.0, uSurf - 0.5, w.y))
             * uUnder;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vA;
        uniform vec3 uColor;
        uniform float uStyle, uAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c) * 2.0;
          if (r > 1.0 || vA < 0.002) discard;
          float a;
          if (uStyle > 0.5) {
            float rim = smoothstep(0.70, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
            float hl = smoothstep(0.22, 0.0, length(c - vec2(-0.20, -0.22)));
            a = rim * 0.55 + hl * 0.55 + (1.0 - r) * 0.03;
          } else {
            a = pow(1.0 - r, 1.7);
          }
          gl_FragColor = vec4(uColor, a * vA * uAlpha);
        }
      `
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    (o.group || underGroup).add(pts);
    particleSets.push(pts);
    return pts;
  }
  const bubbles = makeParticles({ count: 360, box: [70, 44, 110], vel: [0, 1.4, 0], size: [0.03, 0.22], skew: 3, maxPx: 20, near: 1.5, wobble: 0.5, color: [0.7, 0.92, 1.0], bubble: true, alpha: 0.9 });
  makeParticles({ count: 1300, box: [70, 40, 110], vel: [0.25, -0.18, 0.1], size: [0.03, 0.10], wobble: 0.5, color: [0.55, 0.75, 0.8], alpha: 0.7 });
  makeParticles({ count: 900, box: [80, 7, 110], vel: [4.0, 0.0, 0.8], size: [0.05, 0.16], wobble: 0.9, color: [0.8, 0.65, 0.42], anchor: true, alpha: 0.8 });
  const burst = makeParticles({ count: 260, box: [18, 12, 22], off: [0.5, 0.5, 0.5], vel: [0, 1.8, 0], size: [0.02, 0.10], skew: 2.5, maxPx: 10, near: 1.2, wobble: 0.35, color: [0.85, 1.0, 1.0], bubble: true, alpha: 0 });

  /* ---------------- cloth: the projects, printed on a long white ribbon floating in the water ----------------
     The camera does not move. The ribbon runs along a fixed S-shaped rail in front of it: flat and facing the
     camera in the middle (where the projects are read), swooping toward the camera and over the sand below,
     and curving away into the distance above. Scrolling feeds the ribbon along the rail.
     Any number of projects: the ribbon gets one block of print per project and grows longer with each one. */
  let PROJECTS = (options.projects && options.projects.length ? options.projects : ['AURORA', 'NEON ATLAS', 'PAPER MOON', 'LUMEN OS']).map(String);
  const CLOTH_DIST = 52;                                   // distance from the final camera position to the reading spot
  const CLOTH_STAGE_Y = UNDER_Y + 1.5;
  const CLOTH_STAGE_Z = camZAt(1) - CLOTH_DIST;
  const clothGroup = new THREE.Group();
  clothGroup.position.set(0, CLOTH_STAGE_Y, CLOTH_STAGE_Z);
  clothGroup.visible = false;
  scene.add(clothGroup);
  let clothActive = false, clothFocus = CLOTH_DIST, clothSpeed = 0;
  let clothGrid = { cols: 2, rows: 2, cell: 1024 };

  // The print texture is an atlas: one square cell per project, laid out in a grid (power-of-two sized so it can be
  // mipmapped). Each cell holds the name repeated in stacked rows that swell and shrink, every row stretched to the
  // full width. Cells get smaller automatically when there are many projects.
  function makeClothTexture() {
    const n = PROJECTS.length;
    const maxDim = Math.min(4096, renderer.capabilities.maxTextureSize || 4096);
    let cols = 1; while (cols * cols < n) cols *= 2;
    let rows = 1; while (cols * rows < n) rows *= 2;
    const cell = Math.max(64, Math.min(1024, Math.floor(maxDim / Math.max(cols, rows))));
    clothGrid = { cols, rows, cell };
    const c = document.createElement('canvas');
    c.width = cols * cell; c.height = rows * cell;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const tmp = document.createElement('canvas');
    const tg = tmp.getContext('2d');
    const fam = '"Space Grotesk", "Syne", "Inter", Arial, sans-serif';
    for (let b = 0; b < n; b++) {
      const name = PROJECTS[b].toUpperCase();
      const x0 = (b % cols) * cell, y0 = Math.floor(b / cols) * cell;
      const nr = 9, raw = [], bell = [];
      let total = 0;
      for (let i = 0; i < nr; i++) {
        const tt = (i - (nr - 1) / 2) / ((nr - 1) / 2);
        const bl = Math.exp(-tt * tt * 2.4);
        bell.push(bl); raw.push(60 + 220 * bl); total += raw[i] * 0.9;
      }
      const k = (cell * 0.84) / total;
      let y = y0 + cell * 0.08;
      for (let i = 0; i < nr; i++) {
        const fs = raw[i] * k, h = fs * 0.9;
        // draw the row at native size (2x for sharpness) on a scratch canvas, then stretch that picture to the exact
        // width: stretching a bitmap behaves the same in every browser, unlike scaling the text engine
        const S = 2, pad = 6;
        tg.font = `900 ${fs * S}px ${fam}`;
        const mw = Math.max(1, tg.measureText(name).width);
        tmp.width = Math.ceil(mw + pad * 2);
        tmp.height = Math.ceil(fs * S * 1.3);
        tg.font = `900 ${fs * S}px ${fam}`;                 // resizing a canvas resets its state
        tg.textAlign = 'left';
        tg.textBaseline = 'middle';
        tg.fillStyle = `rgba(10,30,170,${0.5 + 0.5 * bell[i]})`;
        tg.fillText(name, pad, tmp.height / 2);
        const sx = (cell * 0.82) / mw;                      // horizontal stretch from the 2x bitmap
        const destW = tmp.width * sx, destH = tmp.height / S;
        g.drawImage(tmp, x0 + cell / 2 - (mw / 2 + pad) * sx, y + h / 2 - destH / 2, destW, destH);
        y += h;
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    tex.needsUpdate = true;
    return tex;
  }
  let clothTex = makeClothTexture();

  const clothMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: clothTex },
      uTime: uniforms.uTime,
      uFogColor: uniforms.uFogColor,
      uFogDensity: uniforms.uFogDensity,
      uOffset: { value: -40 },      // where along the rail the ribbon's first end is
      uLen: { value: 200 },         // ribbon length
      uBL: { value: 36 },           // ribbon length per project
      uCols: { value: clothGrid.cols },
      uRows: { value: clothGrid.rows },
      uPrintEnd: { value: 180 },    // print stops here (blank cloth after the last project)
      uWidth: { value: 60 },
      uAmp: { value: 1 }
    },
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime, uOffset, uLen, uWidth, uAmp;
      varying vec2 vUv2;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vP;
      const float SEABED = ${SEABED_Y.toFixed(3)};
      const vec3 STAGE = vec3(0.0, ${CLOTH_STAGE_Y.toFixed(3)}, ${CLOTH_STAGE_Z.toFixed(3)});
      float tanhS(float x) { float e = exp(2.0 * x); return (e - 1.0) / (e + 1.0); }
      float smax(float a, float b, float k) {                    // smooth maximum: a, but never (much) below b
        float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
        return mix(b, a, h) + k * h * (1.0 - h);
      }
      float duneH(vec2 p) {                                     // same dunes as the sea floor
        float side = smoothstep(32.0, 85.0, abs(p.x));
        float d = 1.6 * sin(p.x * 0.045 + p.y * 0.02)
                + 1.1 * sin(p.y * 0.06 - p.x * 0.03 + 1.3)
                + 0.4 * sin(p.x * 0.15 + p.y * 0.11);
        return side * d * 0.9;
      }
      // the rail: vertical at s = 0, sweeping toward the camera and flattening over the sand below,
      // curving away from the camera above
      vec3 centre(float s) {
        float t = s / 30.0;
        float y = s > 0.0 ? s : -12.0 * tanhS(-s / 12.0);
        float z = t > 0.0 ? -26.0 * t * t * t : -60.0 * t * t * t;       // above: away; below: toward the camera
        return vec3(4.0 * sin(s * 0.045), y, z);
      }
      float twist(float s) { return (0.35 * sin(s * 0.05) + 0.12 * sin(s * 0.13)) * smoothstep(6.0, 26.0, abs(s)); }
      vec3 clothPos(float s, float u) {
        vec3 C = centre(s);
        vec3 T = normalize(centre(s + 0.5) - centre(s - 0.5));
        vec3 B0 = normalize(vec3(1.0, 0.0, 0.0) - T * T.x);   // width stays horizontal along the whole rail
        vec3 N0 = cross(B0, T);
        float th = twist(s);
        vec3 side = B0 * cos(th) + N0 * sin(th);
        vec3 nrm = -B0 * sin(th) + N0 * cos(th);
        float w = u - 0.5;
        float edge = w * w * 4.0;
        float calm = 0.22 + 0.78 * smoothstep(4.0, 24.0, abs(s));      // the reading spot stays nearly flat
        float ripple = (1.1 * sin(s * 0.30 - uTime * 1.2 + w * 5.0) + 0.6 * sin(s * 0.55 + uTime * 1.6 - w * 9.0))
                     * (0.4 + 1.2 * edge) * uAmp * calm;
        float fold = 1.8 * sin(w * 3.2 + s * 0.04 + uTime * 0.4) * calm;
        float taper = mix(1.0, 0.42, smoothstep(6.0, 24.0, -s));          // narrows as it is drawn in toward the camera
        vec3 P = C + side * (w * uWidth * taper) + nrm * (ripple + fold);
        // never go through the floor: rest on the real sea floor (dunes included) with a little clearance
        vec3 wp = P + STAGE;
        wp.y = smax(wp.y, SEABED + duneH(wp.xz) + 0.8, 1.6);
        return wp - STAGE;
      }
      void main() {
        float p = uv.y * uLen;                      // distance along the ribbon
        float s = uOffset - p;                      // where that point currently is on the rail
        vec3 p0 = clothPos(s, uv.x);
        vec3 ps = clothPos(s + 0.6, uv.x);
        vec3 pu = clothPos(s, uv.x + 0.02);
        vNormal = normalize(cross(pu - p0, ps - p0));
        vec4 wp = modelMatrix * vec4(p0, 1.0);
        vWorld = wp.xyz;
        vP = p;
        vUv2 = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uTex;
      uniform vec3 uFogColor;
      uniform float uFogDensity, uPrintEnd, uBL, uCols, uRows;
      varying vec2 vUv2;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vP;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        bool frontSide = dot(n, V) > 0.0;
        if (!frontSide) n = -n;                              // shade the side that faces us
        vec3 L1 = normalize(vec3(0.2, 0.9, 0.45));           // daylight from the surface
        vec3 L2 = normalize(vec3(-0.7, 0.2, -0.6));          // cool fill from the side
        float d1 = max(dot(n, L1), 0.0) + 0.2 * max(dot(-n, L1), 0.0);
        float d2 = max(dot(n, L2), 0.0) + 0.25 * max(dot(-n, L2), 0.0);
        float fres = pow(1.0 - abs(dot(n, V)), 3.0);
        vec3 base = vec3(0.96, 0.98, 1.0);
        vec3 lit = base * (vec3(0.15, 0.23, 0.28) + vec3(0.95, 1.0, 1.0) * d1 * 0.92 + vec3(0.25, 0.55, 0.9) * d2 * 0.5)
                 + vec3(0.2, 0.55, 0.85) * fres * 0.35;
        // which project's print are we on? (blocks run along the ribbon, first project first)
        float bi = floor(vP / uBL);
        float bv = clamp(fract(vP / uBL), 0.003, 0.997);
        float tx = frontSide ? vUv2.x : 1.0 - vUv2.x;           // printed on both sides, readable from both
        vec2 cell = vec2(mod(bi, uCols), floor(bi / uCols));
        vec2 tuv = vec2((cell.x + 0.01 + 0.98 * tx) / uCols, 1.0 - (cell.y + bv) / uRows);
        float edgeD = min(fract(vP / uBL), 1.0 - fract(vP / uBL));
        float ink = texture2D(uTex, tuv).a * step(vP, uPrintEnd) * smoothstep(0.02, 0.05, edgeD);   // no print right on a block seam
        float lum = dot(lit, vec3(0.333));
        vec3 inkCol = vec3(0.02, 0.07, 0.5) * (0.35 + 0.9 * lum);
        vec3 col = mix(lit, inkCol, ink * 0.95);
        col = col / (1.0 + col * 0.32);
        float dist = length(cameraPosition - vWorld);
        col = mix(col, pow(uFogColor, vec3(1.0 / 2.2)), 1.0 - exp(-dist * uFogDensity * 0.12));   // just a hint of water haze
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  function clothGeometry() {
    // enough rows for a smooth surface however long the ribbon gets
    const segs = Math.min(2400, Math.max(300, Math.ceil((PROJECTS.length + 0.5) * 36 / 0.6)));
    return new THREE.PlaneGeometry(1, 1, 40, segs);
  }
  const cloth = new THREE.Mesh(clothGeometry(), clothMat);
  cloth.frustumCulled = false;
  clothGroup.add(cloth);

  // The cloth needs about 0.65 screens of scrolling per project. If the page has <section id="cloth-start">, add
  // (or remove) invisible spacing after it so the page is always long enough for every project.
  function ensureClothScroll() {
    if (!clothEnabled || typeof document.getElementById !== 'function') return;
    const marker = document.getElementById('cloth-start');
    if (!marker || !marker.parentNode) return;
    let sp = document.getElementById('cloth-spacer');
    if (!sp) {
      sp = document.createElement('div');
      sp.id = 'cloth-spacer';
      sp.setAttribute('aria-hidden', 'true');
      sp.style.cssText = 'width:1px;pointer-events:none;';
      marker.parentNode.insertBefore(sp, marker.nextSibling);
    }
    const vh = window.innerHeight || 1;
    sp.style.height = '0px';
    const have = document.documentElement.scrollHeight - (marker.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0));
    const need = (0.6 + 0.65 * PROJECTS.length) * vh;
    sp.style.height = Math.max(0, Math.round(need - have)) + 'px';
  }

  // Replace the list of projects while the page is running; the ribbon (and the page) grow or shrink to fit.
  function setProjects(list) {
    if (!Array.isArray(list) || !list.length) return;
    PROJECTS = list.map(String);
    clothTex.dispose();
    clothTex = makeClothTexture();
    clothMat.uniforms.uTex.value = clothTex;
    cloth.geometry.dispose();
    cloth.geometry = clothGeometry();
    ensureClothScroll();
    onScroll();
  }
  window.addEventListener('resize', () => { ensureClothScroll(); onScroll(); });
  ensureClothScroll();
  onScroll();
  scrollNow = scrollTarget; currentP = targetP; currentQ = targetQ;

  function updateCloth(Q, dt) {
    clothSpeed += (Math.min(1, Math.abs(targetQ - currentQ) * 30) - clothSpeed) * Math.min(1, dt * 5);
    // size the ribbon to the screen: about 45% of the view width at the reading spot, one project per screen
    const viewW = 2 * CLOTH_DIST * Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    const W = Math.min(44, 0.46 * viewW);
    const BL = Math.max(14, 0.8 * W);                     // ribbon length per project
    const n = PROJECTS.length;
    // feed the ribbon along the rail: it slides in from behind the camera and over the sand, rises through the
    // reading spot one project at a time, and stops with the last project centred (the tail keeps floating)
    const k = ease01(0.0, 0.9, Q);
    const off0 = -40, off1 = (n - 0.5) * BL;
    const m = clothMat.uniforms;
    m.uOffset.value = off0 + (off1 - off0) * k;
    m.uWidth.value = W;
    m.uLen.value = (n + 0.5) * BL;
    m.uBL.value = BL;
    m.uCols.value = clothGrid.cols;
    m.uRows.value = clothGrid.rows;
    m.uPrintEnd.value = n * BL;
    m.uAmp.value = 0.7 + 1.5 * clothSpeed;                // scroll harder = the cloth snaps and ripples more
    clothFocus = CLOTH_DIST;
  }

  /* ---------------- depth of field + bloom (optional; page works without them) ---------------- */
  // Tunables (fractions of screen height). Change live with setDepthOfField().
  const dof = {
    amount: options.dof === false ? 0 : 1,   // 0 = off, 1 = full
    aperture: 0.014,    // blur strength of the far background
    maxBlur: 0.026,     // cap for very near / very far areas (~28px at 1080p)
    focusZone: 0.08,    // size of the sharp band around the focus distance
    bokeh: 3.0,         // extra weight for bright highlights -> visible bokeh discs
    focus: 45,          // current (smoothed) focus distance
    ready: false
  };

  function makeDepthOfFieldPass() {
    const hasDepthTex = renderer.capabilities.isWebGL2 || renderer.extensions.has('WEBGL_depth_texture');
    if (!hasDepthTex) return null;
    const SAMPLES = Math.min(window.innerWidth, window.innerHeight) < 600 ? 24 : 40;

    // The scene is rendered into this target, so we get its colour AND its depth.
    const rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
    });
    rt.depthBuffer = true;
    rt.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor:     { value: rt.texture },
        tDepth:     { value: rt.depthTexture },
        uAspect:    { value: 1 },
        uNear:      { value: camera.near },
        uFar:       { value: camera.far },
        uFocus:     { value: dof.focus },
        uAperture:  { value: dof.aperture },
        uMaxBlur:   { value: dof.maxBlur },
        uFocusZone: { value: dof.focusZone },
        uBokeh:     { value: dof.bokeh },
        uAmount:    { value: dof.amount }
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        #define SAMPLES ${SAMPLES}
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform float uAspect, uNear, uFar, uFocus, uAperture, uMaxBlur, uFocusZone, uBokeh, uAmount;

        float viewZ(vec2 uv) {
          float zn = texture2D(tDepth, uv).x * 2.0 - 1.0;
          return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear));
        }
        // circle of confusion, as a fraction of screen height
        float cocFromZ(float z) {
          float rel = abs(1.0 - uFocus / max(z, 0.01));
          rel = max(rel - uFocusZone, 0.0);
          return min(rel * uAperture, uMaxBlur) * uAmount;
        }
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

        void main() {
          vec3 c0 = texture2D(tColor, vUv).rgb;
          float z0 = viewZ(vUv);
          float coc0 = cocFromZ(z0);
          if (coc0 < 0.0004) { gl_FragColor = vec4(c0, 1.0); return; }

          float rot = ign(gl_FragCoord.xy) * 6.2831853;
          vec3 acc = c0;
          float wsum = 1.0;
          for (int i = 0; i < SAMPLES; i++) {
            float fi = float(i) + 0.5;
            float rad = sqrt(fi / float(SAMPLES)) * coc0;
            float a = fi * 2.39996323 + rot;
            vec2 uv = vUv + vec2(cos(a), sin(a)) * rad * vec2(1.0 / uAspect, 1.0);
            vec3 s = texture2D(tColor, uv).rgb;
            float zs = viewZ(uv);
            float cocS = cocFromZ(zs);
            // A sample counts if it is behind the centre (blur is see-through), or if its own
            // blur disc reaches the centre. Sharp objects therefore never smear onto the
            // background behind them (no halo around in-focus text).
            float behind = step(z0, zs);
            float cover = smoothstep(rad - 0.0012, rad + 0.0012, cocS);
            float w = max(behind, cover);
            float l = dot(s, vec3(0.299, 0.587, 0.114));
            w *= 1.0 + uBokeh * smoothstep(0.55, 1.0, l);
            acc += s * w;
            wsum += w;
          }
          gl_FragColor = vec4(acc / wsum, 1.0);
        }
      `
    });

    const quadScene = new THREE.Scene();
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    quadScene.add(quad);

    // Minimal EffectComposer pass: renders the scene, then the DOF blur into writeBuffer.
    return {
      enabled: true, needsSwap: true, clear: false, renderToScreen: false,
      uniforms: mat.uniforms,
      setSize(w, h) { rt.setSize(w, h); mat.uniforms.uAspect.value = w / h; },
      render(r, writeBuffer) {
        r.setRenderTarget(rt);
        r.render(scene, camera);
        r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        r.render(quadScene, quadCam);
      },
      dispose() { rt.dispose(); rt.depthTexture.dispose(); mat.dispose(); quad.geometry.dispose(); }
    };
  }

  /* ---------------- "smear" look: glitch bands + purple duotone + grain ---------------- */
  const look = {
    amount: options.look === true ? 1 : 0,    // off by default; initOceanSunset(canvas, { look: true }) turns it on
    smear: 0.10,       // horizontal smear length (fraction of screen width)
    bands: 18,         // number of horizontal glitch bands
    grain: 0.32,       // film grain strength
    scrollBoost: 1.0,  // how much scrolling adds to the smear
    dark:  [0.03, 0.00, 0.06],
    mid:   [0.42, 0.10, 0.92],
    light: [0.97, 0.94, 1.00],
    vel: 0
  };

  function makeLookPass() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTime:    { value: 0 },
        uAspect:  { value: 1 },
        uAmount:  { value: look.amount },
        uSmear:   { value: look.smear },
        uVel:     { value: 0 },
        uGrain:   { value: look.grain },
        uBands:   { value: look.bands },
        cDark:    { value: new THREE.Vector3().fromArray(look.dark) },
        cMid:     { value: new THREE.Vector3().fromArray(look.mid) },
        cLight:   { value: new THREE.Vector3().fromArray(look.light) },
        cText:    textColorU
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uTime, uAspect, uAmount, uSmear, uVel, uGrain, uBands;
        uniform vec3 cDark, cMid, cLight, cText;

        float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        float h21(vec2 p)  { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        void main() {
          vec3 src = texture2D(tDiffuse, vUv).rgb;
          if (uAmount < 0.001) { gl_FragColor = vec4(src, 1.0); return; }

          // glitch bands: some rows get dragged far, others barely move; they re-roll ~7x/sec
          float t = floor(uTime * 7.0);
          float band = floor(vUv.y * uBands + sin(vUv.y * 5.0 + uTime * 0.4) * 1.5);
          float on = smoothstep(0.35, 0.75, h11(band * 1.37 + t * 0.11));
          float len = 0.012 + (uSmear * (0.25 + 0.75 * on)) + uVel * 0.06 * on;
          float shift = (h11(band * 3.1 + t * 0.07) - 0.5) * uSmear * 0.6 * on;

          // horizontal smear (jittered taps so it reads as a blur, not ghost copies)
          float jit = h21(gl_FragCoord.xy) - 0.5;
          vec3 acc = vec3(0.0);
          float ws = 0.0;
          for (int i = 0; i < 16; i++) {
            float f = float(i) / 15.0 - 0.5 + jit / 16.0;
            float w = max(1.0 - abs(f) * 1.4, 0.05);
            float x = vUv.x + shift + f * len;
            x = abs(mod(x + 1.0, 2.0) - 1.0);       // mirror at the edges
            acc += texture2D(tDiffuse, vec2(x, vUv.y)).rgb * w;
            ws += w;
          }
          vec3 sm = acc / ws;

          // luminance, highlights pushed up so they glow
          float l = dot(sm, vec3(0.299, 0.587, 0.114));
          l = pow(clamp(l * 1.25, 0.0, 1.5), 0.85);

          // grain goes in BEFORE the gradient map, so it speckles between black / purple / white
          float g = h21(gl_FragCoord.xy + fract(uTime) * vec2(173.0, 91.0)) - 0.5;
          l = clamp(l + g * uGrain * (1.15 - 0.6 * clamp(l, 0.0, 1.0)), 0.0, 1.0);

          vec3 col = l < 0.5
            ? mix(cDark, cMid, smoothstep(0.0, 0.5, l))
            : mix(cMid, cLight, smoothstep(0.45, 0.95, l));

          // headline colour is exempt from the duotone: find it by hue (chroma direction), so the
          // sun and the orange sky never match; the smeared mask lets the text glow and drag too
          vec3 tc = sm - vec3((sm.r + sm.g + sm.b) / 3.0);
          vec3 pc = cText - vec3((cText.r + cText.g + cText.b) / 3.0);
          float tl = length(tc);
          float pl = max(length(pc), 0.0001);
          float sim = tl > 0.0001 ? dot(tc / tl, pc / pl) : 0.0;
          float tmask = smoothstep(0.93, 0.99, sim) * smoothstep(0.04, 0.16, tl);
          float keep = clamp(max(sm.r, max(sm.g, sm.b)) / max(max(cText.r, max(cText.g, cText.b)), 0.0001), 0.0, 1.0);
          vec3 textCol = cText * keep * (1.0 + g * uGrain * 0.5);
          col = mix(col, textCol, tmask);

          gl_FragColor = vec4(mix(src, col, uAmount), 1.0);
        }
      `
    });
    const quadScene = new THREE.Scene();
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    quadScene.add(quad);
    return {
      enabled: true, needsSwap: true, clear: false, renderToScreen: false,
      uniforms: mat.uniforms,
      setSize(w, h) { mat.uniforms.uAspect.value = w / h; },
      render(r, writeBuffer, readBuffer) {
        mat.uniforms.tDiffuse.value = readBuffer.texture;
        r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        r.render(quadScene, quadCam);
      },
      dispose() { mat.dispose(); quad.geometry.dispose(); }
    };
  }

  let lookPass = null;
  let composer = null;
  let dofPass = null;
  try {
    if (THREE.EffectComposer && THREE.ShaderPass && THREE.CopyShader) {
      dofPass = makeDepthOfFieldPass();
      const hasBloom = THREE.UnrealBloomPass && THREE.RenderPass && THREE.LuminosityHighPassShader;
      if (dofPass || THREE.RenderPass) {
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(dofPass || new THREE.RenderPass(scene, camera));
        if (hasBloom) composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.7, 0.9));
        if (options.look === true) {        // optional smear / duotone / grain pass (last pass)
          lookPass = makeLookPass();
          composer.addPass(lookPass);
        }
      }
    }
  } catch (e) {
    composer = null; dofPass = null; lookPass = null;
    console.warn('Post effects disabled:', e && e.message);
  }

  // Focus follows the next text landmark in front of the camera and racks to the
  // following one as the current one starts fading out.
  const _tmpV = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  function updateFocus(dt) {
    if (!dofPass) return;
    camera.getWorldDirection(_fwd);
    let best = Infinity;
    textMeshes.forEach((item, i) => {
      if (item.targetZ - camera.position.z < -12 && textUnder[i] === (uniforms.uUnderMix.value > 0.5)) {
        _tmpV.set(0, item.mesh.position.y, item.targetZ).sub(camera.position);
        const d = _tmpV.dot(_fwd);
        if (d > 4 && d < best) best = d;
      }
    });
    const target = clothActive ? clothFocus : (isFinite(best) ? best : 55);
    dof.focus = dof.ready ? dof.focus + (target - dof.focus) * Math.min(1, dt * 2.5) : target;
    dof.ready = true;
    const u = dofPass.uniforms;
    u.uFocus.value = dof.focus;
    u.uAperture.value = dof.aperture;
    u.uMaxBlur.value = dof.maxBlur;
    u.uFocusZone.value = dof.focusZone;
    u.uBokeh.value = dof.bokeh;
    u.uAmount.value = dof.amount;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
  }

  function setDepthOfField(o) {
    if (o) Object.assign(dof, o);
  }

  function updateLook(dt) {
    if (!lookPass) return;
    // scrolling = faster camera = longer smear
    const speed = Math.min(1, Math.abs(targetP - currentP) * 18);
    look.vel += (speed - look.vel) * Math.min(1, dt * 6);
    const u = lookPass.uniforms;
    u.uTime.value = t;
    u.uVel.value = look.vel * look.scrollBoost;
    u.uAmount.value = look.amount;
    u.uSmear.value = look.smear;
    u.uBands.value = look.bands;
    u.uGrain.value = look.grain;
    u.cDark.value.fromArray(look.dark);
    u.cMid.value.fromArray(look.mid);
    u.cLight.value.fromArray(look.light);
  }

  function setLook(o) {
    if (o) Object.assign(look, o);
  }

  /* ---------------- controls ---------------- */
  function setSunHeight(deg) {
    const el = deg * Math.PI / 180;
    uniforms.uSunDir.value.set(0.0, Math.sin(el), -Math.cos(el)).normalize();
  }
  setSunHeight(options.sunHeight != null ? options.sunHeight : 2.4);
  if (options.swell != null) uniforms.uSwell.value = options.swell;
  if (options.chop  != null) uniforms.uAmp.value = options.chop;
  if (options.exposure != null) uniforms.uExposure.value = options.exposure;

  // gentle pointer parallax
  let targetYaw = 0, targetPitch = BASE_PITCH, pointerPitch = 0;
  function onPointer(e) {
    const mx = (e.clientX / window.innerWidth - 0.5) * 2;
    const my = (e.clientY / window.innerHeight - 0.5) * 2;
    targetYaw = -mx * 0.22;
    pointerPitch = -my * 0.05;
  }
  window.addEventListener('pointermove', onPointer);

  function resize() {
    const w = Math.max(window.innerWidth, 1), h = Math.max(window.innerHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 62 : 45;
    camera.updateProjectionMatrix();
    pScale.value = (h * DPR) / (2 * Math.tan(camera.fov * Math.PI / 360));
    if (composer) { composer.setPixelRatio(DPR); composer.setSize(w, h); }
  }
  window.addEventListener('resize', resize);

  /* ---------------- camera rides the swell ---------------- */
  function surfaceHeight(x, z, t) {
    let iter = 0, frq = 0.30, weight = 1, w = 0, ws = 0, px = x, pz = z;
    for (let i = 0; i < 8; i++) {
      const dx = Math.sin(iter), dz = Math.cos(iter);
      const spd = Math.sqrt(9.81 * frq);
      const xx = (dx * px + dz * pz) * frq + t * spd;
      const wv = Math.exp(Math.sin(xx) - 1);
      const ry = -wv * Math.cos(xx);
      const k = ry * weight * 0.38 / (frq * 3 + 0.3);
      px += dx * k; pz += dz * k;
      w += wv * weight; ws += weight;
      weight *= 0.84; frq *= 1.12; iter += 12;
    }
    const sw = uniforms.uSwell.value;
    const a = Math.exp(Math.sin((0.10 * x - 0.99 * z) * 0.115 + t * 1.06) - 1);
    const b = Math.exp(Math.sin((-0.45 * x - 0.89 * z) * 0.190 + t * 1.36 + 1.7) - 1);
    const c = Math.exp(Math.sin((0.62 * x - 0.78 * z) * 0.310 + t * 1.74 + 4.1) - 1);
    return (w / ws) * uniforms.uAmp.value + sw * (0.60 * a + 0.28 * b + 0.12 * c);
  }
  let camY = null;

  /* ---------------- loop ---------------- */
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timeScale = reduceMotion ? 0.35 : 1.0;
  let t = 20.0, last = 0, isRunning = false, animId = null;

  function renderFrame(dt) {
    t += dt * timeScale;
    uniforms.uTime.value = t;

    // ----- scroll timeline -----
    scrollNow += (scrollTarget - scrollNow) * Math.min(1, dt * 3.5);
    currentP = clamp01(scrollNow / oceanLenPx);
    currentQ = clothEnabled ? clamp01((scrollNow - oceanLenPx) / Math.max(1, maxPx - oceanLenPx)) : 0;
    const P = currentP;
    const Q = currentQ;
    const diveE = ease01(0.40, 0.64, P);
    camera.position.z = camZAt(P);

    // the big wave: far ahead at first, reaches the camera as the dive starts, then fades away
    const waveT = smooth01(0.08, 0.58, P);
    const waveH = 12 * smooth01(0.05, 0.16, P) * (1 - smooth01(0.62, 0.78, P));
    const waveZ = camera.position.z - 220 * (1 - waveT) + 8 * waveT;
    uniforms.uBig.value.set(waveZ, waveH, 16, 0);
    const burstAmt = smooth01(0.40, 0.52, P) * (1 - smooth01(0.60, 0.80, P));

    yaw += (targetYaw - yaw) * Math.min(1, dt * 3);
    const basePitch = BASE_PITCH + 0.08 * smooth01(0.24, 0.40, P) * (1 - diveE) + (UNDER_PITCH - BASE_PITCH) * diveE
                      + (0.0 - UNDER_PITCH) * ease01(0.0, 0.2, Q) * diveE;
    targetPitch = basePitch + pointerPitch;
    pitch += (targetPitch - pitch) * Math.min(1, dt * 3);

    // surface: ride the swell (and the big wave); then sink to the sea floor
    // (the camera only rides a third of the wave's height, so it is never thrown up and slammed down)
    const swellH = surfaceHeight(camera.position.x, camera.position.z, t);
    const bigH = bigWaveH(camera.position.x, camera.position.z, t, waveZ, waveH);
    const surfAtCam = swellH + bigH;
    const targetY = (swellH + 0.35 * bigH + 2.3) * (1 - diveE) + (UNDER_Y + Math.sin(t * 0.6) * 0.35) * diveE;
    camY = camY === null ? targetY : camY + (targetY - camY) * Math.min(1, dt * 4 + 0.0001);
    camera.position.y = camY;
    camera.rotation.y = yaw;
    camera.rotation.x = pitch + Math.sin(t * 0.5) * 0.004;
    camera.rotation.z = Math.sin(t * 0.4) * 0.012; // Drone roll banking

    const underMix = smooth01(0.0, 6.0, surfAtCam - camY);
    uniforms.uUnderMix.value = underMix;
    surfU.value = surfAtCam;

    // Center ocean and sky around the camera
    ocean.position.set(camera.position.x, 0, camera.position.z);
    sky.position.copy(camera.position);

    // underwater world follows the camera (sea floor snapped to its grid so it never swims)
    underGroup.visible = underMix > 0.002;
    // ----- after the sea floor: the cloth floats in the same water; the camera stays where it is -----
    clothActive = Q > 0.001;
    clothGroup.visible = clothActive;
    if (clothActive) updateCloth(Q, dt);
    seabed.position.set(Math.floor(camera.position.x / SEABED_STEP) * SEABED_STEP, SEABED_Y,
                        Math.floor(camera.position.z / SEABED_STEP) * SEABED_STEP);
    burst.material.uniforms.uAlpha.value = burstAmt;

    // Headlines: no fades. #1 sits on the surface; #2-4 are lettered into the sand, each sized to fill the screen
    // width, with a mirror image lying in front of it
    const viewW = 2 * 34 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect;   // world width visible at the sand text
    const FLOOR_STRETCH = 1.2 * Math.hypot(UNDER_Y - SEABED_Y, 34) / (UNDER_Y - SEABED_Y);   // cancels the low viewing angle
    textMeshes.forEach((item, i) => {
      item.mat.uniforms.uOpacity.value = 1;
      item.reflMat.uniforms.uOpacity.value = 1;
      if (textUnder[i]) {
        const ud = item.mat.uniforms.uMap.value.userData || {};
        const gw = ud.glyphW > 1 ? ud.glyphW : 40;
        const sx = Math.min(2.5, 0.92 * viewW / gw);
        const sy = sx * FLOOR_STRETCH;
        const vb = ud.vBottom != null ? ud.vBottom : 0.415;
        const vt = ud.vTop != null ? ud.vTop : 0.585;
        item.mesh.position.set(0, SEABED_Y + 0.12, item.targetZ);
        item.depthMesh.position.set(0, SEABED_Y + 0.10, item.targetZ);
        item.mesh.scale.set(sx, sy, 1);
        item.depthMesh.scale.copy(item.mesh.scale);
        // mirror about the line along the letters' bottom edge, so it reads as a symmetric reflection
        item.reflMesh.position.set(0, SEABED_Y + 0.11, item.targetZ + 2 * sy * (0.5 - vb) * 21);
        item.reflMesh.scale.set(sx, sy, 1);
        item.reflMat.uniforms.uGlyphV.value.set(vb, vt);
      } else {
        const bob = Math.sin(t * 0.7 + item.targetZ * 0.1) * 0.15;
        item.mesh.position.y = 3.0 + bob;
        item.reflMesh.position.y = -0.4 + bob * 0.3;
        item.depthMesh.position.y = item.mesh.position.y;
      }
    });

    updateFocus(dt);
    updateLook(dt);

    try {
      if (composer) composer.render(); else renderer.render(scene, camera);
    } catch (e) {
      console.error('Ocean render failed:', e && e.message);
      composer = null;
    }
  }

  function loop(now) {
    if (!isRunning) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    renderFrame(dt);
    animId = requestAnimationFrame(loop);
  }

  function resume() {
    if (isRunning) return;
    isRunning = true;
    last = performance.now();
    animId = requestAnimationFrame(loop);
  }
  function pause() {
    isRunning = false;
    if (animId) cancelAnimationFrame(animId);
    animId = null;
  }

  resize();
  renderFrame(0); // draw once so shaders compile before the first fade-in

  return {
    resize, pause, resume,
    setSunHeight,
    setDepthOfField,
    dof,
    setLook,
    look,
    setTextColor(c) { textColorU.value.set(c); },
    textColor: textColorU.value,
    uniforms,
    get isRunning() { return isRunning; },
    get progress() { return currentP; },
    get clothProgress() { return currentQ; },
    setProjects,
    destroy() {
      pause();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      ocean.geometry.dispose(); waterMat.dispose();
      sky.geometry.dispose(); skyMat.dispose();
      textMeshes.forEach(item => {
        item.mesh.geometry.dispose();
        item.mat.dispose();
        item.reflMesh.geometry.dispose();
        item.reflMat.dispose();
        item.depthMat.dispose();
        if (item.mat.uniforms.uMap.value) item.mat.uniforms.uMap.value.dispose();
      });
      cloth.geometry.dispose(); clothMat.dispose(); clothTex.dispose();
      seabed.geometry.dispose(); seabedMat.dispose();
      particleSets.forEach(pt => { pt.geometry.dispose(); pt.material.dispose(); });
      if (dofPass) dofPass.dispose();
      if (lookPass) lookPass.dispose();
      renderer.dispose();
    }
  };
}
