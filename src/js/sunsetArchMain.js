import { initCreatures } from './oceanCreatures.js';

export const WALL_COLOR_PRESETS = {
    terracotta: {
        id: 'terracotta',
        name: 'Terracotta Sunset',
        desc: 'Warm Mediterranean terracotta sandstone with rich sunset hues',
        wallHex: 0xb5706a,
        floorHex: 0xc07c74,
        poolHex: 0x7a3a40,
        glslVec: [0.58, 0.32, 0.31],
        swatch: '#B5706A'
    },
    aegean: {
        id: 'aegean',
        name: 'Aegean Teal',
        desc: 'Deep coastal teal evocative of ocean twilight architecture',
        wallHex: 0x2e5b6b,
        floorHex: 0x386d80,
        poolHex: 0x1f3f4a,
        glslVec: [0.18, 0.36, 0.42],
        swatch: '#2E5B6B'
    },
    sandstone: {
        id: 'sandstone',
        name: 'Desert Gold',
        desc: 'Golden desert sandstone reflecting hot atmospheric light',
        wallHex: 0xc8965a,
        floorHex: 0xd4a56a,
        poolHex: 0x8c6235,
        glslVec: [0.68, 0.48, 0.28],
        swatch: '#C8965A'
    },
    cypress: {
        id: 'cypress',
        name: 'Sage Cypress',
        desc: 'Serene botanical sage green bringing a lush sanctuary mood',
        wallHex: 0x385a48,
        floorHex: 0x446c57,
        poolHex: 0x233c2f,
        glslVec: [0.22, 0.35, 0.28],
        swatch: '#385A48'
    },
    twilight: {
        id: 'twilight',
        name: 'Tuscan Twilight',
        desc: 'Mystic royal purple sunset with rich twilight ambience',
        wallHex: 0x6b4d70,
        floorHex: 0x7b5980,
        poolHex: 0x48324d,
        glslVec: [0.42, 0.30, 0.44],
        swatch: '#6B4D70'
    },
    obsidian: {
        id: 'obsidian',
        name: 'Obsidian Slate',
        desc: 'Modernist noir charcoal slate with crisp contrast',
        wallHex: 0x33363f,
        floorHex: 0x3d414c,
        poolHex: 0x202228,
        glslVec: [0.20, 0.21, 0.25],
        swatch: '#33363F'
    }
};

export function initSunsetArch(canvas) {
    const targetCanvas = canvas || document.getElementById('c');
    if (!targetCanvas || typeof THREE === 'undefined') {
        console.warn('SunsetArch initialization skipped: Canvas or THREE missing');
        return null;
    }

    const SUN = new THREE.Vector3(0.02, 0.075, -1).normalize();
    const AW = 2.6, AS = 5.0, WZ = -12;
    const F = n => n.toFixed(2);
    const NUM_RIPPLES = 8;
    const wallColUniform = new THREE.Vector3(0.58, 0.32, 0.31);

    const GLSL = `
    #define NUM_RIPPLES 8
    uniform vec3 uSun; uniform float uT; uniform float uC; uniform vec3 uWallCol;
    uniform vec4 uRipples[NUM_RIPPLES];
    vec3 sky(vec3 d){
      float h=clamp(d.y,0.,1.);
      vec3 c=mix(vec3(.90,.60,.50),vec3(.70,.46,.52),smoothstep(0.,.14,h));
      c=mix(c,vec3(.40,.40,.60),smoothstep(.1,.75,h));
      float s=max(dot(d,uSun),0.);
      c+=vec3(.92,.62,.42)*pow(s,24.)*.42+vec3(.95,.72,.52)*pow(s,300.)*.85;
      c+=vec3(.96,.88,.80)*smoothstep(.99935,.9997,s)*2.6;
      return c;
    }
    vec3 wallCol(vec3 p){return uWallCol*(.72+.28*smoothstep(0.,6.,p.y));}
    vec3 env(vec3 wp,vec3 r,float room){
      if(room>.5){
        float t=(${F(WZ)}-wp.z)/min(r.z,-.001);
        vec3 p=wp+r*t;
        float inA=step(abs(p.x),${F(AW)})*max(step(p.y,${F(AS)}),step(length(vec2(p.x,p.y-${F(AS)})),${F(AW)}));
        inA*=step(r.z,0.);
        return mix(wallCol(p),sky(r),inA);
      }
      return sky(r);
    }
    vec3 nrm(vec2 p,float k){
      float t=uT; vec2 p2=vec2(p.x*1.15,p.y*.55);
      vec2 g=vec2(0.);
      g+=vec2(cos(p2.x*1.3+t*.7),cos(p2.y*1.1-t*.55))*.05;
      g+=vec2(cos(p2.x*2.9+p2.y*1.6+t*1.2),cos(p2.y*2.6-p2.x*1.2-t*1.0))*.045;
      g+=vec2(cos(p2.x*6.8+p2.y*3.9+t*1.9),cos(p2.y*6.1-p2.x*3.4-t*1.6))*.028;
      g+=vec2(cos(p2.x*13.+p2.y*8.+t*2.8),cos(p2.y*12.-p2.x*7.-t*2.4))*.014;
      g+=vec2(cos(p2.x*27.-p2.y*11.+t*3.6),cos(p2.y*24.+p2.x*13.-t*3.1))*.006;

      // Realistic Multi-Drop Liquid Ripple Wavelets
      vec2 ripGrad = vec2(0.0);
      for(int i = 0; i < NUM_RIPPLES; i++) {
        vec4 rip = uRipples[i];
        if(rip.w > 0.005) {
          vec2 dPos = p - rip.xy;
          float d = length(dPos);
          float radius = rip.z * 3.6;
          float ringDist = abs(d - radius);
          float wave = sin((d - radius) * 26.0) * exp(-ringDist * 3.5) * exp(-rip.z * 1.6);
          vec2 dir = (d > 0.0001) ? dPos / d : vec2(0.0);
          ripGrad += dir * wave * rip.w * 0.045;
        }
      }
      g += ripGrad;

      return normalize(vec3(-g.x*k,1.,-g.y*k*1.6));
    }`;

    // Ripple array setup
    const ripples = Array.from({ length: NUM_RIPPLES }, () => ({ x: 0, z: 0, age: 99, strength: 0 }));
    let rippleIndex = 0;
    const rippleUniforms = Array.from({ length: NUM_RIPPLES }, () => new THREE.Vector4(0, 0, 99, 0));

    function spawnRipple(x, z, strength = 1.0) {
        ripples[rippleIndex] = { x, z, age: 0, strength };
        rippleIndex = (rippleIndex + 1) % NUM_RIPPLES;
    }

    const waterMat = (room, deep, k) => new THREE.ShaderMaterial({
        uniforms: {
            uSun: { value: SUN },
            uT: { value: 0 },
            uC: { value: 0 },
            uWallCol: { value: wallColUniform },
            uRipples: { value: rippleUniforms }
        },
        vertexShader: `varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
        side: THREE.DoubleSide,
        fragmentShader: `varying vec3 wp;${GLSL}
      void main(){
        vec3 v=normalize(cameraPosition-wp);
        float dist=length(cameraPosition-wp);
        vec3 n=nrm(wp.xz,${k.toFixed(2)}/(1.+dist*.02));
        vec3 r=reflect(-v,n); r.y=abs(r.y);
        float f=.03+.97*pow(1.-max(dot(n,v),0.),4.);
        vec3 refl=env(wp,r,${room.toFixed(1)});
        refl*=1.-.55*uC;
        vec3 base=${deep};
        vec3 col=mix(base,refl,clamp(f*1.35+.08,0.,1.));
        float sd=max(dot(r,uSun),0.);
        col+=vec3(.95,.72,.45)*(pow(sd,900.)*2.8+pow(sd,120.)*.4+pow(sd,22.)*.10);
        col+=vec3(.25,.08,.08)*pow(max(dot(n,v),0.),3.)*.30*(1.-f);

        // Realistic glistening caustics under expanding ripples
        float ripCaustic = 0.0;
        for(int i = 0; i < NUM_RIPPLES; i++) {
          vec4 rip = uRipples[i];
          if(rip.w > 0.005) {
            float d = length(wp.xz - rip.xy);
            float radius = rip.z * 3.6;
            float ringDist = abs(d - radius);
            float h = pow(max(sin((d - radius) * 26.0), 0.0), 3.0) * exp(-ringDist * 4.0) * exp(-rip.z * 1.8);
            ripCaustic += h * rip.w;
          }
        }
        col += vec3(0.95, 0.82, 0.70) * clamp(ripCaustic * 0.40, 0.0, 0.5);

        col=mix(col,vec3(.90,.66,.54),smoothstep(120.,600.,dist));
        gl_FragColor=vec4(pow(col,vec3(2.2)),1.);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      }`
    });

    const renderer = new THREE.WebGLRenderer({ canvas: targetCanvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);

    // Sky dome
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { uSun: { value: SUN }, uT: { value: 0 }, uC: { value: 0 }, uWallCol: { value: wallColUniform }, uRipples: { value: rippleUniforms } },
        vertexShader: `varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec3 d;${GLSL}void main(){gl_FragColor=vec4(pow(sky(d),vec3(2.2)),1.);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      }`
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat); scene.add(dome);

    // Sea
    const WY = -0.3;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), waterMat(0, 'vec3(.25,.14,.22)', 1.2));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, WY, -600); scene.add(sea);

    // Textures
    function noiseTex() {
        const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
        const d = g.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (Math.random() - .5) * 90; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
        g.putImageData(d, 0, 0); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
        for (let i = 0; i < 14; i++) { g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (Math.random() - .5) * 50; y += (Math.random() - .5) * 50; g.lineTo(x, y); } g.stroke(); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    }
    const nt = noiseTex(); nt.anisotropy = 8; nt.repeat.set(6, 6);
    const wallM = new THREE.MeshStandardMaterial({ color: 0xb5706a, roughness: .88, bumpMap: nt, bumpScale: .06 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0xc07c74, roughness: .5, metalness: .02, bumpMap: nt, bumpScale: .12 });
    const poolSideMat = new THREE.MeshStandardMaterial({ color: 0x7a3a40, roughness: .8, side: THREE.DoubleSide });
    const add = (m, s = true) => { m.castShadow = s; m.receiveShadow = true; scene.add(m); return m; };

    // Back wall with arch
    {
        const s = new THREE.Shape(); s.moveTo(-30, 0); s.lineTo(30, 0); s.lineTo(30, 26); s.lineTo(-30, 26); s.closePath();
        const h = new THREE.Path(); h.moveTo(-AW, 0); h.lineTo(-AW, AS); h.absarc(0, AS, AW, Math.PI, 0, true); h.lineTo(AW, 0); h.closePath(); s.holes.push(h);
        const g = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false, curveSegments: 48 });
        const m = add(new THREE.Mesh(g, wallM)); m.position.z = WZ - 1.2;
    }

    // Pool path
    const cl = new THREE.CatmullRomCurve3([[-9, 6], [-5, 3.6], [-1.6, -.6], [.6, -5], [.4, -9], [0, -14.5]].map(p => new THREE.Vector3(p[0], 0, p[1])));
    const L = [], R = []; const N = 60;
    for (let i = 0; i <= N; i++) {
        const u = i / N, p = cl.getPoint(u), t = cl.getTangent(u);
        const w = THREE.MathUtils.lerp(2.2, 1.6, Math.min(u * 1.4, 1));
        const nx = -t.z, nz = t.x; L.push([p.x + nx * w, p.z + nz * w]); R.push([p.x - nx * w, p.z - nz * w]);
    }
    const poly = L.concat(R.slice().reverse());

    // Floor with pool hole (Clockwise hole order prevents Earcut triangulation artifact)
    {
        const s = new THREE.Shape(); s.moveTo(-30, -14); s.lineTo(30, -14); s.lineTo(30, 30); s.lineTo(-30, 30); s.closePath();
        const h = new THREE.Path();
        const polyHole = poly.slice().reverse();
        polyHole.forEach((p, i) => i ? h.lineTo(p[0], -p[1]) : h.moveTo(p[0], -p[1])); h.closePath(); s.holes.push(h);
        const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, floorM); m.receiveShadow = true; scene.add(m);
        g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(Array.from({ length: g.attributes.position.count * 2 }, (_, i) => g.attributes.position.array[(i >> 1) * 3 + ((i & 1) ? 2 : 0)] * .15)), 2));
    }
    // Pool side walls
    {
        const pos = [], idx = []; poly.forEach(p => { pos.push(p[0], 0, p[1], p[0], -.8, p[1]); });
        for (let i = 0; i < poly.length; i++) { const a = i * 2, b = ((i + 1) % poly.length) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, poolSideMat); m.receiveShadow = true; scene.add(m);
    }
    // Pool water
    const pw = waterMat(1, 'vec3(.16,.06,.10)', 1.3);
    {
        const sh = new THREE.Shape(poly.map(p => new THREE.Vector2(p[0], -p[1])));
        const g = new THREE.ShapeGeometry(sh, 8); g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, pw); m.position.y = WY; scene.add(m);
    }

    // Columns & Walls
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 26, 64), wallM)).position.set(-5.3, 13, -3);
    { const l = add(new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, .55, 64), floorM)); l.position.set(-5.3, .27, -3); }
    add(new THREE.Mesh(new THREE.BoxGeometry(1, 26, 40), wallM)).position.set(-14, 13, -5);
    add(new THREE.Mesh(new THREE.BoxGeometry(1, 26, 40), wallM)).position.set(11, 13, -5);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, AS + 1.6, 32), wallM)).position.set(4.1, (AS + 1.6) / 2, -10.6);
    add(new THREE.Mesh(new THREE.BoxGeometry(5, 26, 10), wallM)).position.set(7.6, 13, -8);

    let cov = 0;

    // Lights (Slightly dimmed for richer warm atmospheric sunset contrast)
    const hemi = new THREE.HemisphereLight(0xe5a298, 0x6a303a, .58); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffa875, 2.4);
    sun.position.set(0, 6, -45); sun.target.position.set(0, 0, 5); scene.add(sun, sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
    sun.shadow.bias = -.0004; sun.shadow.radius = 3;
    const glow = new THREE.PointLight(0xff9865, 1.4, 22, 1.6); glow.position.set(0, 3.5, -9); scene.add(glow);

    // Raycaster for cursor on water surface Y = WY (-0.3)
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2(-999, -999);
    const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WY);
    const targetMouseWater = new THREE.Vector2(0, 0);
    const currentMouseWater = new THREE.Vector2(0, 0);
    const lastSpawnPos = new THREE.Vector2(-999, -999);
    let mouseActiveTarget = 0;

    let mx = 0, my = 0, tx = 0, ty = 0;
    const onMove = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        tx = clientX / window.innerWidth - .5;
        ty = clientY / window.innerHeight - .5;

        mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
        mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;
        mouseActiveTarget = 1.0;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });

    function resize() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = w / h < 1 ? 78 : 44;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    const featherTex = (() => {
        const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.lineCap = 'round';
        const rg = g.createRadialGradient(64, 150, 2, 64, 150, 70); rg.addColorStop(0, 'rgba(255,252,250,.55)'); rg.addColorStop(1, 'rgba(255,252,250,0)');
        g.fillStyle = rg; g.beginPath(); g.ellipse(64, 150, 40, 100, 0, 0, 6.283); g.fill();
        for (let n = 0; n < 420; n++) {
            const t = Math.pow(Math.random(), .8), y = 232 - t * 200, side = Math.random() < .5 ? -1 : 1;
            const span = 46 * Math.pow(Math.sin(Math.PI * Math.min(t * .92 + .04, 1)), .55) * (.45 + .55 * Math.random());
            const lift = 18 + Math.random() * 34, bend = (Math.random() - .5) * 14;
            g.strokeStyle = 'rgba(255,' + (246 + Math.random() * 9 | 0) + ',' + (242 + Math.random() * 13 | 0) + ',' + (.22 + Math.random() * .5) + ')';
            g.lineWidth = .5 + Math.random() * 1.1;
            g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + side * span * .6, y - lift * .2 + bend, 64 + side * span, y - lift); g.stroke();
        }
        const sg = g.createLinearGradient(0, H, 0, 20); sg.addColorStop(0, 'rgba(255,255,255,.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = sg; g.lineWidth = 1.4; g.beginPath(); g.moveTo(64, H); g.lineTo(64, 20); g.stroke();
        const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
    })();

    const fGeo = new THREE.PlaneGeometry(.1, .2, 4, 8);
    { const p = fGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 5 * x * x + .9 * y * y); } fGeo.computeVertexNormals(); }
    const fMat = new THREE.MeshStandardMaterial({ map: featherTex, color: 0xfff0ea, emissive: 0xffe2d6, emissiveMap: featherTex, emissiveIntensity: .3, roughness: 1, transparent: true, opacity: .92, alphaTest: .01, side: THREE.DoubleSide, depthWrite: false });
    const feathers = [];
    for (let i = 0; i < 34; i++) {
        const m = new THREE.Mesh(fGeo, fMat); const sc = .6 + Math.random() * .7; m.scale.setScalar(sc); scene.add(m);
        feathers.push({ m, x: -2.8 + Math.random() * 7.2, z: -9 + Math.random() * 15, sp: .22 + Math.random() * .3, ph: Math.random() * 6.28, f: .5 + Math.random() * .7, sn: .3 + Math.random() * .6, amp: .3 + Math.random() * .6 });
        m.position.y = .4 + Math.random() * 9.5;
    }

    function updFeathers(t, dt) {
        for (const o of feathers) {
            const m = o.m;
            m.position.y -= o.sp * dt; o.x += .07 * dt;
            if (m.position.y < -.1 || o.x > 4.6) { m.position.y = 9.5 + Math.random() * 3; o.x = -2.8 + Math.random() * 5; o.z = -9 + Math.random() * 15; }
            m.position.x = o.x + Math.sin(t * o.f + o.ph) * o.amp;
            m.position.z = o.z + Math.cos(t * o.f * .8 + o.ph) * o.amp * .6;
            m.rotation.order = 'YXZ';
            m.rotation.set(.4 + Math.sin(t * o.f * 1.4 + o.ph) * .7, t * o.sn + o.ph, Math.sin(t * o.f + o.ph) * .9);
        }
    }

    // Initialize 3D Glass Dolphin & Bioluminescent Jellyfish roaming creatures
    let creatures = null;
    try {
        creatures = initCreatures(scene, camera);
    } catch (err) {
        console.warn('Creatures init skipped/failed:', err);
    }

    let running = true;
    const clock = new THREE.Clock(); let lastT = 0;
    function frame() {
        if (!running) return;
        const t = clock.getElapsedTime();
        const dt = Math.min(t - lastT, .05); lastT = t;

        mx += (tx - mx) * .04; my += (ty - my) * .04;
        camera.position.set(.4 + mx * 2.2, 2.1 - my * .5, 9.5);
        camera.lookAt(-.6 + mx * .6, 3.2 - my * .4, -12);

        // Raycast cursor to water plane
        raycaster.setFromCamera(mouseVec, camera);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(waterPlane, hit)) {
            targetMouseWater.set(hit.x, hit.z);
        }
        currentMouseWater.lerp(targetMouseWater, 0.22);

        // Spawn multiple expanding ripples as mouse moves
        const distFromLast = currentMouseWater.distanceTo(lastSpawnPos);
        if (distFromLast > 0.35 && mouseActiveTarget > 0.2) {
            spawnRipple(currentMouseWater.x, currentMouseWater.y, Math.min(0.6 + distFromLast * 0.8, 1.3));
            lastSpawnPos.copy(currentMouseWater);
        } else if (mouseActiveTarget > 0.2 && Math.random() < 0.08) {
            spawnRipple(currentMouseWater.x + (Math.random() - 0.5) * 0.4, currentMouseWater.y + (Math.random() - 0.5) * 0.4, 0.35);
        }
        mouseActiveTarget *= 0.96;

        // Update ripple physics & uniforms
        for (let i = 0; i < NUM_RIPPLES; i++) {
            const r = ripples[i];
            if (r.strength > 0.005) {
                r.age += dt;
                r.strength *= Math.pow(0.91, dt * 60.0);
                if (r.age > 2.5) r.strength = 0;
            }
            rippleUniforms[i].set(r.x, r.z, r.age, r.strength);
        }

        // Update shaders
        [sea.material, pw, skyMat].forEach(m => m.uniforms.uT.value = t);
        sun.intensity = 3.4 * (1 - .5 * cov); glow.intensity = 2.2 * (1 - .65 * cov); hemi.intensity = .85 * (1 - .28 * cov); pw.uniforms.uC.value = cov;
        updFeathers(t, dt);
        if (creatures && creatures.update) {
            try { creatures.update(t, dt); } catch (e) { }
        }
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    }
    frame();

    function setWallColor(presetKeyOrObj) {
        let preset = WALL_COLOR_PRESETS[presetKeyOrObj];
        if (!preset && typeof presetKeyOrObj === 'object') {
            preset = presetKeyOrObj;
        }
        if (!preset && typeof presetKeyOrObj === 'string' && presetKeyOrObj.startsWith('#')) {
            const c = new THREE.Color(presetKeyOrObj);
            wallM.color.copy(c);
            floorM.color.copy(c).multiplyScalar(1.05);
            poolSideMat.color.copy(c).multiplyScalar(0.7);
            wallColUniform.set(c.r * 0.8, c.g * 0.8, c.b * 0.8);
            return { id: 'custom', name: 'Custom (' + presetKeyOrObj + ')', swatch: presetKeyOrObj };
        }
        if (!preset) {
            preset = WALL_COLOR_PRESETS.terracotta;
        }

        wallM.color.setHex(preset.wallHex);
        floorM.color.setHex(preset.floorHex);
        poolSideMat.color.setHex(preset.poolHex);
        wallColUniform.set(preset.glslVec[0], preset.glslVec[1], preset.glslVec[2]);

        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('sunset_wall_preset', preset.id || presetKeyOrObj);
            }
        } catch (e) { }
        return preset;
    }

    // Default to terracotta as featured on mobile
    let savedPresetKey = (typeof localStorage !== 'undefined' && localStorage.getItem('sunset_wall_preset'));
    if (!savedPresetKey || savedPresetKey === 'aegean') {
        savedPresetKey = 'terracotta';
    }
    setWallColor(savedPresetKey);

    window.setSunsetWallColor = setWallColor;
    window.WALL_COLOR_PRESETS = WALL_COLOR_PRESETS;

    return {
        setWallColor,
        getPresets: () => WALL_COLOR_PRESETS,
        destroy() {
            running = false;
            if (creatures && creatures.destroy) {
                try { creatures.destroy(); } catch (e) { }
            }
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('resize', resize);
        }
    };
}

