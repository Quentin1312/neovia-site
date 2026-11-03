// Quentin en 3D (GLB Meshy, rig Mixamo). makePerso(THREE, {url}) -> { group, setMode, mode, update, face, onReady }
// Modes : idle, walk, run, wave, sit (cheer = wave)
let _q0, _q1, _q2, _q3, _v0, _v1;
const BASE = './vendor/three/examples/jsm/';
export function makePerso(THREE, opts = {}) {
  const url = opts.url || 'assets/quentin.glb';
  const g = new THREE.Group(); g.name = 'quentin';
  _q0 = new THREE.Quaternion(); _q1 = new THREE.Quaternion(); _q2 = new THREE.Quaternion(); _q3 = new THREE.Quaternion(); _v0 = new THREE.Vector3(); _v1 = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _r = new THREE.Quaternion(), _ax = new THREE.Vector3(), _wp = new THREE.Vector3();
  let shoulders = [], drop = opts.shoulderDrop ?? .28;
  let mixer = null, acts = {}, cur = null, mode = 'idle', ready = false; const cbs = [];
  const CLIP = { walk: /walk/i, run: /run/i, wave: /wave/i, sit: /sit/i, idle: /idle|custom|^_[0-9a-f]{6}/i };
  let model = null, arm = null, fore = null, hand = null, head = null, side = -1, wW = 0, wT = 0;

  function play(m) {
    if (!ready) return;
    const key = m === 'cheer' ? 'wave' : m;
    const next = acts[key] || ((key === 'walk' || key === 'run') ? (acts.walk || acts.run) : null) || acts.idle; if (!next || (next === cur && key !== 'wave')) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(.32).play();
    if (cur) cur.fadeOut(.32);
    cur = next;
  }

  function lockRoot(clip, root) {
    // retire le déplacement horizontal des hanches (marche sur place)
    const tr = clip.tracks.find(t => /Hips\.position$/.test(t.name)); if (!tr || !root.parent) return;
    const pq = root.parent.getWorldQuaternion(new THREE.Quaternion());
    const lock = [0, 1, 2].map(i => { const a = new THREE.Vector3(); a.setComponent(i, 1); return Math.abs(a.applyQuaternion(pq).y) < .5; });
    const v = tr.values; for (let k = 0; k < v.length; k += 3) for (let i = 0; i < 3; i++) if (lock[i]) v[k + i] = v[i];
  }

  function calmIdle(clip) {
    // épaules quasi fixes : on garde la respiration du buste et le regard
    const DAMP = [[/Shoulder\.quaternion$/, .92], [/(Left|Right)Arm\.quaternion$/, .8], [/Spine2\.quaternion$/, .6], [/Spine1\.quaternion$/, .4]];
    const a = new THREE.Quaternion(), b = new THREE.Quaternion();
    clip.tracks.forEach(t => {
      const d = DAMP.find(([re]) => re.test(t.name)); if (!d) return;
      const v = t.values, n = v.length / 4; const m = new THREE.Quaternion(0, 0, 0, 0);
      for (let i = 0; i < n; i++) { a.fromArray(v, i * 4); if (i && a.dot(b.fromArray(v, 0)) < 0) a.set(-a.x, -a.y, -a.z, -a.w); m.x += a.x; m.y += a.y; m.z += a.z; m.w += a.w; }
      m.normalize();
      for (let i = 0; i < n; i++) { a.fromArray(v, i * 4); a.slerp(m, d[1]); a.toArray(v, i * 4); }
    });
  }
  function makeIdle(skel) {
    // respiration + bras baissés, construit à partir de la pose A
    const B = n => skel.getObjectByName('mixamorig' + n);
    const tmp = new THREE.Quaternion(), pw = new THREE.Quaternion(), dq = new THREE.Quaternion();
    const rotW = (bone, axis, ang) => {
      bone.parent.getWorldQuaternion(pw); dq.setFromAxisAngle(axis, ang);
      return pw.clone().invert().multiply(dq).multiply(pw).multiply(bone.quaternion);
    };
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const T = [0, 1.7, 3.4], tracks = [];
    const add = (bone, frames) => { if (!bone) return; const vals = []; frames.forEach(q => vals.push(q.x, q.y, q.z, q.w)); tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', T, vals)); };
    ['Left', 'Right'].forEach(side => {
      const arm = B(side + 'Arm'), fore = B(side + 'ForeArm'); if (!arm) return;
      const s = Math.sign(arm.getWorldPosition(new THREE.Vector3()).x) || (side === 'Left' ? 1 : -1);
      add(arm, [rotW(arm, Z, -s * .42), rotW(arm, Z, -s * .46), rotW(arm, Z, -s * .42)]);
      if (fore) add(fore, [rotW(fore, X, -.22), rotW(fore, X, -.27), rotW(fore, X, -.22)]);
    });
    const sp = B('Spine1'), hd = B('Head');
    if (sp) add(sp, [rotW(sp, X, 0), rotW(sp, X, .03), rotW(sp, X, 0)]);
    if (hd) add(hd, [rotW(hd, Y, -.05), rotW(hd, Y, .07).multiply(tmp.setFromAxisAngle(X, .02)), rotW(hd, Y, -.05)]);
    return new THREE.AnimationClip('Idle_proc', T[2], tracks);
  }

  Promise.all([import(BASE + 'loaders/GLTFLoader.js'), import(BASE + 'libs/meshopt_decoder.module.js')]).then(([{ GLTFLoader }, { MeshoptDecoder }]) => {
    const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
    L.load(url, gl => {
      const o = gl.scene; o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o), H = bb.max.y - bb.min.y;
      if (H > 0) { const k = 1.72 / H; o.scale.multiplyScalar(k); o.position.y -= bb.min.y * k; o.position.x -= (bb.min.x + bb.max.x) / 2 * k; o.position.z -= (bb.min.z + bb.max.z) / 2 * k; }
      model = o; const BN = n => o.getObjectByName('mixamorig' + n) || o.getObjectByName('mixamorig:' + n);
      arm = BN('RightArm'); fore = BN('RightForeArm'); hand = BN('RightHand'); head = BN('Head');
      if (arm) { o.updateMatrixWorld(true); side = Math.sign(o.worldToLocal(arm.getWorldPosition(new THREE.Vector3())).x) || -1; }
      o.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; n.frustumCulled = false; } });
      const hips = o.getObjectByName('mixamorigHips');
      model = o; o.updateMatrixWorld(true);
      ['Left', 'Right'].forEach(sd => { const b = o.getObjectByName('mixamorig' + sd + 'Shoulder'); if (!b) return; const lp = o.worldToLocal(b.getWorldPosition(new THREE.Vector3())); const tip = b.children[0] ? o.worldToLocal(b.children[0].getWorldPosition(new THREE.Vector3())) : lp; shoulders.push({ b, arm: o.getObjectByName('mixamorig' + sd + 'Arm'), s: Math.sign(tip.x - lp.x) || (sd === 'Left' ? 1 : -1) }); });
      mixer = new THREE.AnimationMixer(o);
      const bake = [];
      shoulders.forEach(({ b, arm, s: sg }) => {
        const ax = bn => { const q = bn.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); return new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(q).normalize(); };
        bake.push([b.name, new THREE.Quaternion().setFromAxisAngle(ax(b), sg * drop)]);
        if (arm) bake.push([arm.name, new THREE.Quaternion().setFromAxisAngle(ax(arm), -sg * drop)]);
      });
      const tq = new THREE.Quaternion();
      gl.animations.forEach(c => c.tracks.forEach(t => { const m = bake.find(([n]) => t.name === n + '.quaternion'); if (!m) return; const v = t.values; for (let i = 0; i < v.length; i += 4) { tq.fromArray(v, i).premultiply(m[1]); tq.toArray(v, i); } }));
      gl.animations.forEach(c => { for (const k in CLIP) if (!acts[k] && CLIP[k].test(c.name)) { if (k === 'walk' || k === 'run') hips && lockRoot(c, hips); acts[k] = mixer.clipAction(c); } });
      if (!acts.idle) acts.idle = mixer.clipAction(makeIdle(o));
      else calmIdle(acts.idle.getClip());
      if (acts.wave) { acts.wave.setLoop(THREE.LoopOnce, 1); acts.wave.clampWhenFinished = true; mixer.addEventListener('finished', e => { if (e.action === acts.wave && (mode === 'wave' || mode === 'cheer')) { mode = 'idle'; play('idle'); } }); }
      g.add(o); ready = true; api.ready = true;
      play(mode); mixer.update(0);
      cbs.splice(0).forEach(f => f());
    }, undefined, e => console.warn('perso glb', e));
  });

  const api = {
    group: g, ready: false,
    onReady(f) { ready ? f() : cbs.push(f); },
    setMode(m) { mode = m; play(m); },
    get mode() { return mode; },
    face(target, k = 1) { const dx = target.x - g.position.x, dz = target.z - g.position.z; const a = Math.atan2(dx, dz); let d = a - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * k; },
    update(dt) {
      if (!mixer) return; const s = Math.min(dt, 50) / 1000; mixer.update(s);
    }
  };
  return api;
}
