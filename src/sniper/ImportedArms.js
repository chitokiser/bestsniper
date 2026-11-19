import * as THREE from 'three';
import { collectMeshes, flatten } from './ImportedModels.js';

/**
 * SNIPER WEB — the player's own gloved hands, cut from the soldier model.
 *
 * The procedural viewmodel hands are boxes. The imported SWAT soldier already
 * has photo-textured tactical gloves and sleeves, so the first-person arms are
 * taken from it: its fingers are curled in the skeleton, then the hands and
 * forearms are lifted out and laid onto the rifle, the right hand round the
 * pistol grip and the left under the fore-end.
 *
 * Each hand is moved as one rigid piece (wrist frame onto the grip frame) and
 * each forearm as another (elbow-to-wrist axis onto the direction it leaves
 * the frame), meeting at the wrist, where the glove cuff hides the join.
 */

/** Targets in viewmodel space (metres): where each wrist sits, which way the
 *  hand points (wrist to knuckles), which way the palm faces, and where the
 *  forearm runs from the wrist. Matched to the procedural rifles' grip and
 *  fore-end, which the imported rifles are fitted to. */
const POSE = {
  R: {
    wrist: new THREE.Vector3(0.038, -0.098, 0.158),
    forward: new THREE.Vector3(0.0, -0.38, -1),
    palm: new THREE.Vector3(-1, 0.05, 0.0),
    forearm: new THREE.Vector3(0.32, -0.72, 0.62),
    curl: [1.15, 1.35, 0.9],
    thumb: 0.35
  },
  L: {
    wrist: new THREE.Vector3(-0.045, -0.088, -0.165),
    forward: new THREE.Vector3(0.42, 0.12, -1),
    palm: new THREE.Vector3(0.55, 1, 0.05),
    forearm: new THREE.Vector3(-0.42, -0.62, 0.66),
    curl: [0.95, 1.2, 0.8],
    thumb: 0.5
  }
};

const HAND_LENGTH = 0.19;     // wrist to fingertip of a gloved adult hand

const SIDE = { L: 'Left', R: 'Right' };
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

function findBone(bones, re) {
  return bones.find((b) => re.test(b.name.replace(/^mixamorig[:_]?/i, '')));
}

function worldPos(o) { return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); }

/** Turn `bone` about the world axis `axis` by `angle`, keeping its parent. */
function rotateWorld(bone, axis, angle) {
  const parentQ = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentQ);
  const boneQ = new THREE.Quaternion();
  bone.getWorldQuaternion(boneQ);
  const r = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  bone.quaternion.copy(parentQ.invert().multiply(r).multiply(boneQ));
  bone.updateMatrixWorld(true);
}

/** Rotation taking the orthonormal frame (f, n) onto (f2, n2). */
function frameRotation(f, n, f2, n2) {
  const a = new THREE.Matrix4().makeBasis(f, n, new THREE.Vector3().crossVectors(f, n));
  const b = new THREE.Matrix4().makeBasis(f2, n2, new THREE.Vector3().crossVectors(f2, n2));
  return b.multiply(a.transpose());
}

function ortho(f, n) {
  const ff = f.clone().normalize();
  const nn = n.clone().sub(ff.clone().multiplyScalar(n.dot(ff))).normalize();
  return [ff, nn];
}

/**
 * Prepare arms from a loaded soldier glTF. Returns `{ meshes, build(atlas) }`:
 * `meshes` go into the rifle's texture atlas, and `build` returns flattened
 * engine-layout arrays in viewmodel space. Throws if the skeleton has no hands.
 */
export function prepareArms(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const meshes = collectMeshes(root).filter((m) => m.isSkinnedMesh);
  const bones = [...new Set(meshes.flatMap((m) => m.skeleton.bones))];

  // Real-world scale from the hand itself.
  const sides = {};
  for (const s of ['L', 'R']) {
    const hand = findBone(bones, new RegExp(`^${SIDE[s]}Hand$`));
    const fore = findBone(bones, new RegExp(`^${SIDE[s]}ForeArm$`));
    const middle1 = findBone(bones, new RegExp(`^${SIDE[s]}HandMiddle1$`));
    if (!hand || !fore || !middle1) throw new Error(`soldier has no ${SIDE[s]} hand`);
    sides[s] = { hand, fore, middle1 };
  }

  // Curl the fingers in the bind pose (a T-pose with the palms down).
  for (const s of ['L', 'R']) {
    const p = POSE[s];
    const { hand, middle1 } = sides[s];
    const f = worldPos(middle1).sub(worldPos(hand)).normalize();
    const n = new THREE.Vector3(0, -1, 0);             // palm normal, palms down
    const axis = new THREE.Vector3().crossVectors(f, n).normalize();
    for (const name of FINGERS) {
      for (let j = 1; j <= 3; j++) {
        const b = findBone(bones, new RegExp(`^${SIDE[s]}Hand${name}${j}$`));
        if (b) rotateWorld(b, axis, p.curl[j - 1]);
      }
    }
    // The thumb folds in toward the palm, less.
    for (let j = 1; j <= 3; j++) {
      const b = findBone(bones, new RegExp(`^${SIDE[s]}HandThumb${j}$`));
      if (b) rotateWorld(b, f, (s === 'R' ? -1 : 1) * p.thumb * (j === 1 ? 0.6 : 1));
    }
  }
  root.updateMatrixWorld(true);

  // Bone -> 'hR' | 'aR' | 'hL' | 'aL' | null
  const classOf = new Map();
  for (const b of bones) {
    const n = b.name.replace(/^mixamorig[:_]?/i, '');
    for (const s of ['L', 'R']) {
      if (n.startsWith(`${SIDE[s]}Hand`)) classOf.set(b, 'h' + s);
      else if (n === `${SIDE[s]}ForeArm`) classOf.set(b, 'a' + s);
    }
  }

  // Per class: source frame (model space) -> viewmodel frame.
  const xf = {};
  for (const s of ['L', 'R']) {
    const p = POSE[s];
    const { hand, fore, middle1 } = sides[s];
    const wrist = worldPos(hand), elbow = worldPos(fore);
    const handLen = worldPos(middle1).distanceTo(wrist) * 2.1;
    const scale = HAND_LENGTH / handLen;
    const [fSrc, nSrc] = ortho(worldPos(middle1).sub(wrist), new THREE.Vector3(0, -1, 0));
    const [fDst, nDst] = ortho(p.forward, p.palm);
    const handRot = frameRotation(fSrc, nSrc, fDst, nDst);
    // Forearm: its elbow-to-wrist axis onto the reverse of the exit direction.
    const [aSrc, anSrc] = ortho(wrist.clone().sub(elbow), new THREE.Vector3(0, -1, 0));
    const [aDst, anDst] = ortho(p.forearm.clone().negate(), p.palm);
    const armRot = frameRotation(aSrc, anSrc, aDst, anDst);
    const mk = (rot) => new THREE.Matrix4()
      .makeTranslation(p.wrist.x, p.wrist.y, p.wrist.z)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(rot)
      .multiply(new THREE.Matrix4().makeTranslation(-wrist.x, -wrist.y, -wrist.z));
    xf['h' + s] = mk(handRot);
    xf['a' + s] = mk(armRot);
  }

  const dominant = (mesh, i) => {
    const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    let bw = -1, bj = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > bw) { bw = w; bj = si.getComponent(i, k); }
    }
    return classOf.get(mesh.skeleton.bones[bj]) ?? null;
  };

  return {
    meshes,
    build(atlas) {
      const flat = flatten(meshes, atlas, { each: (p, mesh, i) => dominant(mesh, i) });
      // Move each vertex with its part; drop everything that is not an arm.
      const v = new THREE.Vector3(), n = new THREE.Vector3();
      const keep = new Uint8Array(flat.count);
      for (let i = 0; i < flat.count; i++) {
        const c = flat.extra[i];
        if (!c) continue;
        keep[i] = 1;
        v.fromArray(flat.pos, i * 3).applyMatrix4(xf[c]).toArray(flat.pos, i * 3);
        n.fromArray(flat.nrm, i * 3).transformDirection(xf[c]).toArray(flat.nrm, i * 3);
      }
      const index = [];
      for (let t = 0; t < flat.index.length; t += 3) {
        const a = flat.index[t], b = flat.index[t + 1], c = flat.index[t + 2];
        if (keep[a] && keep[b] && keep[c]) index.push(a, b, c);
      }
      flat.index = index;
      return flat;
    }
  };
}
