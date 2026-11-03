const THREE = window.THREE;

export function initCreatures(scene, camera) {
  if (!THREE || !scene || !camera) return null;

  // =========================================================================
  // GLASS MATERIAL SHADER (Polished Metal / Glass Studio Reflection)
  // =========================================================================
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vN; varying vec3 vW;

      vec3 env(vec3 R){
        vec3 c = mix(vec3(0.020,0.022,0.028), vec3(0.50,0.54,0.60), smoothstep(-0.5, 0.95, R.y));
        c += vec3(1.00)           * pow(max(dot(R, normalize(vec3(-0.45, 0.85, 0.55))), 0.0),  8.0) * 1.9;
        c += vec3(0.92,0.95,1.00) * pow(max(dot(R, normalize(vec3(-0.95,-0.10, 0.30))), 0.0),  6.0) * 1.2;
        c += vec3(0.90,0.94,1.00) * pow(max(dot(R, normalize(vec3( 0.85, 0.30,-0.55))), 0.0),  6.0) * 1.4;
        c += vec3(0.78,0.80,0.86) * pow(max(dot(R, normalize(vec3( 0.20,-0.92, 0.30))), 0.0),  4.0) * 0.9;
        c += vec3(1.00,0.99,0.97) * pow(max(dot(R, normalize(vec3( 0.70,-0.35, 0.60))), 0.0), 10.0) * 0.8;
        float band = pow(smoothstep(0.55, 1.0, sin(R.y*5.0 + R.x*3.0) * 0.5 + 0.5), 5.0);
        c += vec3(0.95) * band * 0.55 * (0.5 + 0.5*R.z);
        c += vec3(0.70,0.74,0.80) * pow(1.0 - abs(R.y), 14.0) * 0.6;
        return c;
      }

      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) N = -N;
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        vec3 R = reflect(-V, N);

        vec3 silver = vec3(0.90, 0.92, 0.95);
        float F = 0.62 + 0.38 * pow(1.0 - ndv, 4.0);
        vec3 col = silver * env(R) * F;

        vec3 key = normalize(vec3(-0.45, 0.85, 0.55));
        col += silver * (0.05 + 0.10 * (dot(N, key) * 0.5 + 0.5));

        col += vec3(1.0) * pow(max(dot(R, key), 0.0), 140.0) * 1.6;
        col += vec3(1.0) * pow(max(dot(R, normalize(vec3(0.85,0.30,-0.55))), 0.0), 90.0) * 0.9;

        col = 1.0 - exp(-col * 1.25);
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: false, depthWrite: true, side: THREE.DoubleSide
  });

  // =========================================================================
  // DOLPHIN GEOMETRY FACTORY
  // =========================================================================
  function buildDolphinGeometry() {
    function interp(keys, u){
      const n = keys.length;
      if (u <= keys[0][0]) return keys[0][1];
      if (u >= keys[n-1][0]) return keys[n-1][1];
      let i = 0; while (u > keys[i+1][0]) i++;
      const [u0,v0] = keys[i], [u1,v1] = keys[i+1];
      const pm = keys[Math.max(i-1,0)], pn = keys[Math.min(i+2,n-1)];
      const m0 = (v1 - pm[1]) / ((u1 - pm[0]) || 1);
      const m1 = (pn[1] - v0) / ((pn[0] - u0) || 1);
      const h = u1 - u0, t = (u - u0)/h, t2 = t*t, t3 = t2*t;
      return (2*t3-3*t2+1)*v0 + (t3-2*t2+t)*h*m0 + (-2*t3+3*t2)*v1 + (t3-t2)*h*m1;
    }
    const sstep = (a,b,x) => { const t = Math.min(1, Math.max(0, (x-a)/(b-a))); return t*t*(3-2*t); };

    function loft(N, M, fn, weightFn){
      const pos = new Float32Array((N+1)*M*3);
      const wt  = weightFn ? new Float32Array((N+1)*M) : null;
      const v = new THREE.Vector3();
      for (let i=0;i<=N;i++){
        const t = i/N;
        for (let j=0;j<M;j++){
          fn(t, j/M*Math.PI*2, v);
          const k = (i*M+j);
          pos[k*3]=v.x; pos[k*3+1]=v.y; pos[k*3+2]=v.z;
          if (wt) wt[k] = weightFn(t);
        }
      }
      const idx = [];
      for (let i=0;i<N;i++) for (let j=0;j<M;j++){
        const a=i*M+j, b=i*M+(j+1)%M, c=(i+1)*M+j, d=(i+1)*M+(j+1)%M;
        idx.push(a,c,b, b,c,d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return { geo, base: pos, wt };
    }

    const LEN = 6.0, X0 = -3.0;
    const HU = [[0,0.030],[0.05,0.055],[0.15,0.14],[0.30,0.31],[0.45,0.47],[0.58,0.54],[0.68,0.52],[0.76,0.45],[0.83,0.33],[0.87,0.23],[0.91,0.12],[0.96,0.075],[1,0.012]];
    const HD = [[0,0.030],[0.05,0.050],[0.15,0.12],[0.30,0.26],[0.45,0.38],[0.58,0.42],[0.68,0.38],[0.76,0.30],[0.83,0.20],[0.88,0.12],[0.92,0.07],[0.96,0.05],[1,0.010]];
    const hUp = u => Math.max(0.006, interp(HU, u));
    const hDn = u => Math.max(0.006, interp(HD, u));
    const halfW = u => 0.80 * 0.5 * (hUp(u) + hDn(u));

    const parts = [];
    const group = new THREE.Group();

    function addPart(p){
      const mesh = new THREE.Mesh(p.geo, glassMat);
      mesh.frustumCulled = false;
      group.add(mesh);
      parts.push(p);
    }

    // body
    addPart(loft(170, 44, (t, th, o) => {
      const s = Math.sin(th);
      const h = s > 0 ? hUp(t) : hDn(t);
      o.set(X0 + LEN*t, h*s, halfW(t)*Math.cos(th));
    }));

    // dorsal fin
    addPart(loft(40, 24, (t, th, o) => {
      const a = 0.26*Math.pow(1-t, 0.75) + 0.012;
      const k = 0.034*Math.pow(1-t, 0.4) + 0.004;
      o.set(0.25 - 0.55*Math.pow(t,1.35) + a*Math.cos(th), 0.36 + 0.72*t, k*Math.sin(th));
    }));

    // pectoral flippers
    [1, -1].forEach(sg => {
      const root = new THREE.Vector3(1.05, -0.22, sg*0.30);
      const rel  = new THREE.Vector3(-0.62, -0.60, sg*0.55);
      const xd   = new THREE.Vector3(1,0,0);
      const n    = new THREE.Vector3().crossVectors(xd, rel.clone().normalize()).normalize();
      addPart(loft(36, 22, (t, th, o) => {
        const a = 0.24*Math.pow(1-t, 0.6) + 0.014;
        const k = 0.030*Math.pow(1-t, 0.4) + 0.004;
        o.copy(root).addScaledVector(rel, t);
        o.x += -0.18*t*t;
        o.addScaledVector(xd, a*Math.cos(th)).addScaledVector(n, k*Math.sin(th));
      }, t => t));
    });

    // tail flukes
    addPart(loft(70, 24, (t, th, o) => {
      const b = t*2 - 1, ab = Math.abs(b);
      const notch = 0.5 + 0.5*sstep(0.0, 0.30, ab);
      const a = (0.34*Math.pow(Math.max(0, 1 - Math.pow(ab,1.7)), 0.7) + 0.012) * notch;
      const k = 0.026*Math.pow(1-ab, 0.5) + 0.004;
      const cx = -3.12 - 0.50*Math.pow(ab, 1.25);
      o.set(cx + a*Math.cos(th), 0.06*ab*ab + k*Math.sin(th), b*0.85);
    }));

    // eyes & mouth lines
    const eyes = [], mouths = [];
    [1,-1].forEach(sg => {
      const u = 0.805, y = 0.11;
      const h = y > 0 ? hUp(u) : hDn(u), w = halfW(u);
      const z = w * Math.sqrt(Math.max(0, 1 - (y/h)*(y/h))) * 1.006 * sg;
      const nrm = new THREE.Vector3(0, y/(h*h), z/(w*w)).normalize();
      const mat = new THREE.MeshBasicMaterial({ color:0x000000 });
      const pupilMat = new THREE.MeshBasicMaterial({ color:0x050505 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 10, 28), mat));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), pupilMat);
      dot.position.z = 0.004; g.add(dot);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), nrm);
      group.add(g);
      eyes.push({ g, mat, nrm, x: X0 + LEN*u, y, z });
    });
    [1,-1].forEach(sg => {
      const pts = [];
      for (let i=0;i<=40;i++){
        const u = 0.985 - i/40*0.16;
        const y = -0.018 - 0.010*(1 - i/40) + 0.075*sstep(0.12, 1.0, i/40);
        const h = y > 0 ? hUp(u) : hDn(u);
        const z = halfW(u) * Math.sqrt(Math.max(0, 1 - (y/h)*(y/h))) * 1.004 * sg;
        pts.push(X0 + LEN*u, y, z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      const mat = new THREE.LineBasicMaterial({ color:0x3b3f48 });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      group.add(line);
      mouths.push({ geo, mat, nrm: new THREE.Vector3(0,0,sg), base: new Float32Array(pts) });
    });

    const OMEGA = 4.2;
    function waveDy(x, t){
      const s = Math.max((-x + 3.0)/LEN, 0);
      const env = 0.03 + 0.55*s*s;
      return env * Math.sin(6.2832*0.8*s - OMEGA*t);
    }

    function deform(t){
      const flap = 0.16 * Math.sin(t*1.7);
      for (const p of parts){
        const pos = p.geo.attributes.position.array, b = p.base, w = p.wt;
        const n = b.length/3;
        for (let i=0;i<n;i++){
          const x=b[i*3], y=b[i*3+1], z=b[i*3+2];
          let dy = waveDy(x, t);
          if (w) dy += w[i]*w[i]*flap;
          pos[i*3]=x; pos[i*3+1]=y+dy; pos[i*3+2]=z;
        }
        p.geo.attributes.position.needsUpdate = true;
        p.geo.computeVertexNormals();
      }
      eyes.forEach(e => e.g.position.set(e.x, e.y + waveDy(e.x, t), e.z));
      mouths.forEach(m => {
        const pos = m.geo.attributes.position.array, b = m.base;
        for (let i=0;i<b.length/3;i++){
          pos[i*3]=b[i*3]; pos[i*3+1]=b[i*3+1] + waveDy(b[i*3], t); pos[i*3+2]=b[i*3+2];
        }
        m.geo.attributes.position.needsUpdate = true;
      });
    }

    return { group, deform, OMEGA };
  }

  // =========================================================================
  // CREATE 2 PROMINENT 3D GLASS DOLPHINS
  // =========================================================================
  const dolphin1Roam = new THREE.Group();
  scene.add(dolphin1Roam);
  const d1 = buildDolphinGeometry();
  d1.group.scale.setScalar(0.55); // Prominent large size!
  dolphin1Roam.add(d1.group);

  const dolphin2Roam = new THREE.Group();
  scene.add(dolphin2Roam);
  const d2 = buildDolphinGeometry();
  d2.group.scale.setScalar(0.48); // Prominent large size!
  dolphin2Roam.add(d2.group);

  // --- SMOOTH CONTINUOUS FLIGHT & DIVE TRAJECTORIES ---
  // Smooth C-infinity harmonic 3D curves with constant velocity (no position jumps or speed spikes)
  function dolphin1Path(a, out){
    const x = Math.sin(a * 0.45) * 7.8;                             // Smooth horizontal sweep (-7.8 to +7.8)
    const y = 3.6 + Math.sin(a * 0.9) * 2.2 + Math.cos(a * 0.45) * 0.6; // Smooth height sweep (Y = 0.8 pool dive to Y = 6.4 high sky)
    const z = -2.2 + Math.cos(a * 0.9) * 4.2;                       // Smooth depth sweep (Z = -6.4 background to Z = +2.0 foreground)

    out.set(x, y, z);
    return out;
  }

  function dolphin2Path(a, out){
    const x = Math.sin(a * 0.38 + 2.1) * 8.0;                       // Offset smooth horizontal sweep (+8.0 to -8.0)
    const y = 3.8 + Math.cos(a * 0.76 + 1.2) * 2.0 + Math.sin(a * 0.38) * 0.6; // Smooth height sweep (Y = 1.2 to Y = 6.4)
    const z = -2.0 + Math.sin(a * 0.76 + 0.5) * 4.0;                // Smooth depth sweep (Z = -6.0 to Z = +2.0)

    out.set(x, y, z);
    return out;
  }

  // Vector scratchpads for rotation & orientation updates
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  const tan = new THREE.Vector3(), prevTan1 = new THREE.Vector3(1,0,0), prevTan2 = new THREE.Vector3(1,0,0);
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const UP = new THREE.Vector3(0,1,0);
  const m4 = new THREE.Matrix4(), qT = new THREE.Quaternion(), qRoll = new THREE.Quaternion();
  let ang1 = 0, bank1 = 0;
  let ang2 = 2.1, bank2 = 0;

  function updateDolphinRoam(roamGroup, deformFn, omega, pathFn, dt, t, angVar, bankVar, prevTanVar) {
    const nextAng = angVar + dt * (0.28 + 0.04*Math.sin(omega*t));
    pathFn(nextAng, p0);
    pathFn(nextAng + 0.03, p1);
    tan.subVectors(p1, p0).normalize();

    roamGroup.position.lerp(p0, 1 - Math.exp(-dt*4.0));

    X.copy(tan);
    Z.crossVectors(X, UP);
    if (Z.lengthSq() < 1e-6) Z.set(0,0,1);
    Z.normalize();
    Y.crossVectors(Z, X).normalize();
    m4.makeBasis(X, Y, Z);
    qT.setFromRotationMatrix(m4);

    const yawRate = dt > 0 ? prevTanVar.clone().cross(tan).y / dt : 0;
    prevTanVar.copy(tan);
    const targetBank = -Math.max(-0.45, Math.min(0.45, yawRate*0.8));
    const newBank = bankVar + (targetBank - bankVar) * (1 - Math.exp(-dt*2.5));
    qRoll.setFromAxisAngle(new THREE.Vector3(1,0,0), newBank);
    qT.multiply(qRoll);

    roamGroup.quaternion.slerp(qT, 1 - Math.exp(-dt*3.0));
    deformFn(t);

    return { nextAng, newBank };
  }

  // =========================================================================
  // ANIMATION FRAME UPDATE LOOP
  // =========================================================================
  return {
    update(t, dt) {
      glassMat.uniforms.uTime.value = t;

      // Update Dolphin 1 (Full screen wide sweep & soaring flight)
      const res1 = updateDolphinRoam(dolphin1Roam, d1.deform, d1.OMEGA, dolphin1Path, dt, t, ang1, bank1, prevTan1);
      ang1 = res1.nextAng; bank1 = res1.newBank;

      // Update Dolphin 2 (Full screen offset sweep & soaring flight)
      const res2 = updateDolphinRoam(dolphin2Roam, d2.deform, d2.OMEGA, dolphin2Path, dt, t, ang2, bank2, prevTan2);
      ang2 = res2.nextAng; bank2 = res2.newBank;
    },
    destroy() {
      scene.remove(dolphin1Roam);
      scene.remove(dolphin2Roam);
    }
  };
}
