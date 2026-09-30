/**
 * Displacement Field WebGL Effect
 * Features fluid ink pointer push, ambient curl noise flow, and chromatic split.
 */
export function initDisplacement(container, opts = {}) {
  if (!container) return;

  const o = Object.assign({
    ink: 0.6,      // pointer push strength
    flow: 0.0,     // ambient flow strength (0 = off, only cursor moves displace)
    scale: 2.5,    // ambient flow scale
    split: 0.25    // colour fringe
  }, opts);

  const sourceEl = container.querySelector('img') || container.querySelector('canvas');
  if (!sourceEl) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'displacement-canvas absolute inset-0 w-full h-full block z-0 pointer-events-none';
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return; // fallback: the original source stays visible

  container.insertBefore(canvas, sourceEl.nextSibling);

  const VS = `attribute vec2 p; varying vec2 vUv;
    void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

  const FS = `precision highp float;
    varying vec2 vUv;
    uniform sampler2D uImg, uField;
    uniform float uTime, uInk, uFlow, uScale, uSplit, uAspect;
    uniform vec2 uCover;

    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
    }
    float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+11.7; a*=0.5; } return s; }
    vec2 curl(vec2 p, float t){
      if (uFlow <= 0.001) return vec2(0.0);
      float e = 0.02;
      float n1 = fbm(p+vec2(0.0,e)+t), n2 = fbm(p-vec2(0.0,e)+t);
      float n3 = fbm(p+vec2(e,0.0)+t), n4 = fbm(p-vec2(e,0.0)+t);
      return vec2(n1-n2, -(n3-n4)) / (2.0*e);
    }
    vec3 src(vec2 uv){ return texture2D(uImg, (uv-0.5)*uCover+0.5).rgb; }

    void main(){
      vec2 uv = vUv;
      vec2 flowD = curl(vec2(uv.x*uAspect, uv.y)*uScale, uTime*0.08) * uFlow;
      flowD.x /= uAspect;
      vec2 fieldVal = texture2D(uField, uv).rg - 0.5;
      vec2 inkD = fieldVal * 2.0 * 0.22 * uInk;
      vec2 d = flowD + inkD;
      vec3 c;
      float mag = length(inkD);
      float splitAmt = uSplit * smoothstep(0.001, 0.04, mag);
      c.r = src(uv + d*(1.0+splitAmt)).r;
      c.g = src(uv + d).g;
      c.b = src(uv + d*(1.0-splitAmt)).b;
      gl_FragColor = vec4(c, 1.0);
    }`;

  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uImg','uField','uTime','uInk','uFlow','uScale','uSplit','uAspect','uCover']
    .forEach(n => U[n] = gl.getUniformLocation(prog, n));

  const texParams = () => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  const imgTex = gl.createTexture();
  let imgAspect = 1;
  const isCanvas = sourceEl.tagName.toLowerCase() === 'canvas';

  function uploadImage() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);
      texParams();
      const w = sourceEl.naturalWidth || sourceEl.width || 1;
      const h = sourceEl.naturalHeight || sourceEl.height || 1;
      imgAspect = w / h;
      if (!isCanvas) {
        sourceEl.style.visibility = 'hidden';
      } else {
        sourceEl.style.opacity = '0.001';
      }
      running = true;
    } catch (err) {
      console.warn('Displacement texture upload error:', err);
    }
  }

  // displacement field texture (painted on the CPU)
  const N = 128;
  const vx = new Float32Array(N*N), vy = new Float32Array(N*N);
  const bytes = new Uint8Array(N*N*4);
  const fieldTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fieldTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  texParams();

  function splat(x, y, dx, dy) {
    const cx = x*N, cy = y*N, R = 7, s = R/2.2;
    for (let j = Math.max(0, Math.floor(cy-R)); j <= Math.min(N-1, Math.ceil(cy+R)); j++)
      for (let i = Math.max(0, Math.floor(cx-R)); i <= Math.min(N-1, Math.ceil(cx+R)); i++) {
        const w = Math.exp(-((i-cx)**2 + (j-cy)**2) / (2*s*s));
        vx[j*N+i] += dx*w*10; vy[j*N+i] += dy*w*10;
      }
  }

  function stepField() {
    const tx = new Float32Array(vx), ty = new Float32Array(vy);
    for (let j = 1; j < N-1; j++) for (let i = 1; i < N-1; i++) {
      const k = j*N+i;
      vx[k] = (tx[k]*0.6 + (tx[k-1]+tx[k+1]+tx[k-N]+tx[k+N])*0.1) * 0.90;
      vy[k] = (ty[k]*0.6 + (ty[k-1]+ty[k+1]+ty[k-N]+ty[k+N])*0.1) * 0.90;
    }
    for (let k = 0; k < N*N; k++) {
      bytes[k*4]   = 128 + Math.max(-1, Math.min(1, vx[k])) * 127;
      bytes[k*4+1] = 128 + Math.max(-1, Math.min(1, vy[k])) * 127;
      bytes[k*4+2] = 128; bytes[k*4+3] = 255;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  let last = null;
  container.addEventListener('pointermove', e => {
    const r = container.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (last) splat(x, y, -(x - last.x), -(y - last.y));
    last = { x, y };
  });
  container.addEventListener('pointerleave', () => last = null);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = false, visible = true;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(container.clientWidth * dpr);
    canvas.height = Math.round(container.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  new ResizeObserver(resize).observe(container);
  new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(container);
  resize();

  const t0 = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    if (!running || !visible) return;

    if (isCanvas) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imgTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);
        texParams();
        imgAspect = (sourceEl.width || 1) / (sourceEl.height || 1);
      } catch (e) {}
    }

    stepField();
    const ca = canvas.width / canvas.height;
    const cover = ca > imgAspect ? [1, imgAspect/ca] : [ca/imgAspect, 1];
    gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uField, 1);
    gl.uniform1f(U.uTime, reduce ? 0 : (now - t0) / 1000);
    gl.uniform1f(U.uInk, o.ink);
    gl.uniform1f(U.uFlow, reduce ? 0 : o.flow);
    gl.uniform1f(U.uScale, o.scale);
    gl.uniform1f(U.uSplit, o.split);
    gl.uniform1f(U.uAspect, ca);
    gl.uniform2f(U.uCover, cover[0], cover[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  })(0);

  if (isCanvas) {
    uploadImage();
  } else {
    if (sourceEl.complete && sourceEl.naturalWidth) uploadImage();
    else sourceEl.addEventListener('load', uploadImage, { once: true });
  }
}
