/**
 * liquidText.js
 * Applies interactive chrome-liquid text shader deformation & mouse trail effect
 * to bold text headings and 3D scenes.
 */

export function initLiquidText(selector = '.liquid-text-active, [data-liquid-text]') {
  if (typeof THREE === 'undefined') return;

  const elements = document.querySelectorAll(selector);
  elements.forEach((el) => {
    if (el.dataset.liquidInited) return;
    el.dataset.liquidInited = 'true';

    const textContent = el.innerText.trim();
    if (!textContent) return;

    // Create wrapper & container canvas
    const wrapper = document.createElement('div');
    wrapper.className = 'liquid-text-wrapper';
    wrapper.style.cssText = 'position:relative; display:inline-block; max-width:100%; pointer-events:auto;';
    
    // Hide original text visually while retaining layout space
    const textSpan = document.createElement('span');
    textSpan.style.cssText = 'opacity:0; pointer-events:none; white-space:pre-wrap;';
    textSpan.innerText = textContent;
    wrapper.appendChild(textSpan);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:block; cursor:crosshair; pointer-events:auto;';
    wrapper.appendChild(canvas);

    if (el.parentNode) {
      el.parentNode.insertBefore(wrapper, el);
      el.remove();
    }

    // Initialize Three.js Liquid Shader for this canvas
    setupElementLiquidCanvas(canvas, textContent, el.className, window.getComputedStyle(el));
  });
}

function setupElementLiquidCanvas(canvas, text, className, computedStyle) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // 1. Draw text onto 2D texture canvas with chrome gradient
  const TW = 1024, TH = 512;
  const tc = document.createElement('canvas');
  tc.width = TW; tc.height = TH;
  const ctx = tc.getContext('2d');

  const fontFam = computedStyle.fontFamily || '"Space Grotesk", "Inter", sans-serif';
  const fontWeight = computedStyle.fontWeight || '900';

  function drawText() {
    ctx.clearRect(0, 0, TW, TH);
    ctx.font = `${fontWeight} 130px ${fontFam}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const words = text.split('\n');
    const lineH = 140;
    const topY = TH / 2 - (lineH * (words.length - 1)) / 2;

    words.forEach((line, i) => {
      const cy = topY + i * lineH;
      const g = ctx.createLinearGradient(0, cy - 65, 0, cy + 65);
      g.addColorStop(0.00, '#ffffff');
      g.addColorStop(0.42, '#c7ccd5');
      g.addColorStop(0.50, '#69707b');   // chrome horizon line
      g.addColorStop(0.58, '#eef0f5');
      g.addColorStop(1.00, '#9ea5b0');

      ctx.fillStyle = g;
      ctx.fillText(line, TW / 2, cy);
    });

    tex.needsUpdate = true;
  }

  const tex = new THREE.CanvasTexture(tc);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  drawText();

  // 2. Liquify Shader
  const N = 48;
  const trailU = Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 0));
  const uniforms = {
    uTex: { value: tex },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uTrail: { value: trailU },
    uP: { value: new THREE.Vector2(0.5, 0.5) },
    uPress: { value: 0 },
    uAmb: { value: reduce ? 0.0 : 1.0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uTex;
      uniform float uTime, uAspect, uPress, uAmb;
      uniform vec4  uTrail[${N}];
      uniform vec2  uP;
      varying vec2 vUv;

      vec2 toTex(vec2 uv){
        vec2 sc = uAspect >= 2.0 ? vec2(uAspect/2.0, 1.0) : vec2(1.0, 2.0/uAspect);
        return (uv - 0.5) * sc + 0.5;
      }

      void main(){
        vec2 uv  = vUv;
        vec2 asp = vec2(uAspect, 1.0);
        vec2 disp = vec2(0.0);

        for (int i = 0; i < ${N}; i++){
          vec4 t = uTrail[i];
          vec2 d = (uv - t.xy) * asp;
          float w = exp(-dot(d, d) / 0.014);
          disp += t.zw * w * 0.9;
          disp += vec2(-t.w, t.z) * w * 0.25;
        }

        vec2 dp = (uv - uP) * asp;
        float wp = exp(-dot(dp, dp) / 0.035);
        disp += (uv - uP) * uPress * wp * 0.55;

        vec2 amb = uAmb * 0.0065 * vec2(
          sin(uv.y*8.0 + uTime*1.2 + sin(uv.x*5.0 + uTime*0.7)),
          cos(uv.x*7.0 - uTime*1.0 + sin(uv.y*6.0 - uTime*0.5)));

        vec2 texUv = toTex(uv);
        float r = texture2D(uTex, toTex(uv - disp        - amb)).r;
        float g = texture2D(uTex, toTex(uv - disp * 1.07 - amb)).g;
        float b = texture2D(uTex, toTex(uv - disp * 1.15 - amb)).b;
        vec3 col = vec3(r, g, b);

        float a = max(r, max(g, b));
        if (a < 0.01) discard;

        float m = length(disp);
        col += col * smoothstep(0.015, 0.14, m) * 0.55;
        col += vec3(0.75, 0.82, 1.0) * pow(clamp(m * 7.0, 0.0, 1.0), 2.0) * 0.06 * (r + g + b);

        gl_FragColor = vec4(col, a);
      }
    `
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  // Pointer & Trail handling
  const trail = Array.from({ length: N }, () => ({ x: 0, y: 0, vx: 0, vy: 0, s: 0 }));
  let head = 0;
  let lastX = null, lastY = null;
  let lastUser = -1e9, ghostOn = false, pressTarget = 0;

  function addEntry(x, y, vx, vy) {
    const e = trail[head]; head = (head + 1) % N;
    e.x = x; e.y = y; e.vx = vx; e.vy = vy; e.s = 1;
  }

  function move(x, y) {
    if (lastX !== null) {
      const dx = x - lastX, dy = y - lastY;
      const asp = uniforms.uAspect.value;
      const dist = Math.hypot(dx * asp, dy);
      const steps = Math.min(12, Math.max(1, Math.ceil(dist / 0.012)));
      let vx = dx * 0.9, vy = dy * 0.9;
      const mag = Math.hypot(vx, vy), cap = 0.05;
      if (mag > cap) { vx *= cap / mag; vy *= cap / mag; }
      if (mag > 1e-5) for (let i = 1; i <= steps; i++) addEntry(lastX + dx * i / steps, lastY + dy * i / steps, vx, vy);
    }
    lastX = x; lastY = y;
    uniforms.uP.value.set(x, y);
  }

  function getUv(e) {
    const rect = canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height];
  }

  canvas.addEventListener('pointermove', (e) => {
    if (ghostOn) { ghostOn = false; lastX = null; }
    lastUser = performance.now();
    const [x, y] = getUv(e);
    move(x, y);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (ghostOn) { ghostOn = false; lastX = null; }
    lastUser = performance.now(); pressTarget = 1;
    const [x, y] = getUv(e); uniforms.uP.value.set(x, y); lastX = x; lastY = y;
  });

  window.addEventListener('pointerup', () => { pressTarget = 0; });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 300, h = rect.height || 100;
    renderer.setSize(w, h, false);
    uniforms.uAspect.value = w / h;
  }
  resize();
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  let time = 0;
  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    uniforms.uTime.value = time;

    if (!reduce && performance.now() - lastUser > 2500) {
      if (!ghostOn) { ghostOn = true; lastX = null; }
      move(0.5 + 0.33 * Math.sin(time * 0.9) + 0.06 * Math.sin(time * 2.3),
           0.5 + 0.17 * Math.sin(time * 1.7 + 1.0));
    }

    const decay = Math.exp(-dt * 1.5);
    for (let i = 0; i < N; i++) {
      const e = trail[i]; e.s *= decay;
      if (e.s < 0.002) e.s = 0;
      trailU[i].set(e.x, e.y, e.vx * e.s, e.vy * e.s);
    }
    uniforms.uPress.value += (pressTarget - uniforms.uPress.value) * (1 - Math.exp(-dt * 7));

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

// Auto init on DOMContentLoaded if script is loaded
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initLiquidText());
  } else {
    initLiquidText();
  }
}
