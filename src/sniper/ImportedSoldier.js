import * as THREE from 'three';
import { BONE, buildSoldier } from '../game/CharacterGeometry.js';
import { CharacterRig } from '../game/CharacterRig.js';
import { RD } from '../physics/Ragdoll.js';
import { collectMeshes, buildAtlas, flatten, appendEngineGeometry, toGeometry } from './ImportedModels.js';

/**
 * SNIPER WEB — an imported, rigged soldier on the game's own skeleton.
 *
 * The engine animates soldiers procedurally (IK gait, aim, ragdoll) with 15
 * rigid bones, and its hitboxes, AI and death physics all hang off that rig.
 * So the imported mesh is not animated with its own skeleton: it is re-bound
 * to the engine's bones. Each vertex goes to the engine bone that its glTF
 * skin weights mostly follow (matched by bone name), the model's own joints
 * give the rest pose, and every vertex is stored in its bone's local frame —
 * exactly the layout the character shader already consumes. The carried rifle
 * is kept from the procedural soldier.
 */

/** Engine standing pelvis height (CharacterRig STANCE_HEIGHT.stand). */
const PELVIS_HEIGHT = 0.94;

function cleanName(name) {
  return (name || '')
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function sideOf(n) {
  if (/left/.test(n) || /(^|[_.\s-])l([_.\s-]|$)/.test(n)) return 'L';
  if (/right/.test(n) || /(^|[_.\s-])r([_.\s-]|$)/.test(n)) return 'R';
  return null;
}

const L = { UPPER: [BONE.UPPERARM_L, BONE.UPPERARM_R], FORE: [BONE.FOREARM_L, BONE.FOREARM_R],
  HAND: [BONE.HAND_L, BONE.HAND_R], THIGH: [BONE.THIGH_L, BONE.THIGH_R],
  SHIN: [BONE.SHIN_L, BONE.SHIN_R], FOOT: [BONE.FOOT_L, BONE.FOOT_R] };

function depthOf(bone) {
  let d = 0;
  for (let o = bone.parent; o; o = o.parent) d++;
  return d;
}

/**
 * Which engine body part each glTF bone drives. Explicit names win
 * ("LeftForeArm", "calf_l", "UpperArm.R"); limbs named only as a numbered
 * chain ("arm_joint_L_1..3", "leg_joint_L_1..5") are split by depth, root
 * first: upper arm, forearm, hand / thigh, shin, foot.
 * Returns `Map(bone -> { part, torso })`.
 */
export function assignRoles(bones) {
  const roles = new Map();
  const generic = { arm: { L: [], R: [] }, leg: { L: [], R: [] } };
  for (const bone of bones) {
    const n = cleanName(bone.name);
    const side = sideOf(n);
    const si = side === 'R' ? 1 : 0;
    let role = null;
    if (/head|neck|jaw|eye/.test(n)) role = { part: BONE.HEAD };
    else if (!side && /spine|chest|hips|pelvis|root|torso|body|armature/.test(n)) role = { part: null, torso: true };
    else if (/shoulder|clavicle|collar/.test(n)) role = { part: BONE.CHEST, torso: true };
    else if (!side) role = null;
    else if (/hand|finger|thumb|index|middle|ring|pinky|palm|wrist/.test(n)) role = { part: L.HAND[si] };
    else if (/fore_?arm|lower_?arm|elbow/.test(n)) role = { part: L.FORE[si] };
    else if (/upper_?arm/.test(n)) role = { part: L.UPPER[si] };
    else if (/arm/.test(n)) generic.arm[side].push(bone);
    else if (/toe|foot|ball|ankle/.test(n)) role = { part: L.FOOT[si] };
    else if (/thigh|up_?leg|upper_?leg/.test(n)) role = { part: L.THIGH[si] };
    else if (/calf|shin|knee|lower_?leg/.test(n)) role = { part: L.SHIN[si] };
    else if (/leg/.test(n)) generic.leg[side].push(bone);
    if (role) roles.set(bone, role);
  }
  for (const side of ['L', 'R']) {
    const si = side === 'R' ? 1 : 0;
    const take = (list, explicitTaken, order) => {
      list.sort((x, y) => depthOf(x) - depthOf(y));
      // Fill the chain slots the explicit names left open, in order.
      const open = order.filter((part) => !explicitTaken(part));
      list.forEach((bone, i) => roles.set(bone, { part: open[Math.min(i, open.length - 1)] ?? order[order.length - 1] }));
    };
    const has = (part) => [...roles.values()].some((r) => r.part === part);
    take(generic.arm[side], has, [L.UPPER[si], L.FORE[si], L.HAND[si]]);
    take(generic.leg[side], has, [L.THIGH[si], L.SHIN[si], L.FOOT[si]]);
  }
  return roles;
}

function jointsFromSkeleton(bones, roles, toEngine) {
  const at = (b) => (b ? b.getWorldPosition(new THREE.Vector3()).applyMatrix4(toEngine) : null);
  // The root-most bone that plays `part`: that bone's origin is the joint.
  const first = (part, test = null) => {
    let best = null, bd = Infinity;
    for (const [bone, r] of roles) {
      if (r.part !== part) continue;
      if (test && !test.test(cleanName(bone.name))) continue;
      const d = depthOf(bone);
      if (d < bd) { bd = d; best = bone; }
    }
    return best;
  };
  const byName = (re) => bones.find((b) => re.test(cleanName(b.name))) ?? null;
  const J = {};
  J.pelvis = at(byName(/hips|pelvis/) ?? [...roles].filter(([, r]) => r.torso)
    .sort(([x], [y]) => depthOf(x) - depthOf(y))[0]?.[0] ?? null);
  J.neck = at(byName(/neck/) ?? first(BONE.HEAD));
  J.head = at(byName(/head(?!.*(top|end))/));
  J.headTop = at(byName(/head.*(top|end)/));
  const sides = [['L', 0], ['R', 1]];
  for (const [s, i] of sides) {
    J['shoulder' + s] = at(first(L.UPPER[i]));
    J['elbow' + s] = at(first(L.FORE[i]));
    J['hand' + s] = at(first(L.HAND[i]));
    J['hip' + s] = at(first(L.THIGH[i]));
    J['knee' + s] = at(first(L.SHIN[i]));
    J['foot' + s] = at(first(L.FOOT[i]));
  }
  return J;
}

/**
 * Build the soldier geometry from a loaded glTF. Returns
 * `{ geometry, texture, report }` or throws if the model is not a usable
 * humanoid (no skeleton with legs and arms).
 */
export function buildImportedSoldier(gltf, { team = 'A', variant = 0, rng, facing = '+z', tint = null, weapon = null, weaponFlip = false } = {}) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const meshes = collectMeshes(root);
  const skinned = meshes.filter((m) => m.isSkinnedMesh);
  if (!skinned.length) throw new Error('soldier model has no skinned mesh');
  // Every joint of every skin: a head and a body are often skinned apart,
  // each to only the joints it uses.
  const bones = [...new Set(skinned.flatMap((m) => m.skeleton.bones))];

  // Turn the model to face the engine's forward (-z at yaw 0) and stand it
  // with its hips at the engine's pelvis height.
  const turn = new THREE.Matrix4().makeRotationY(facing === '-z' ? 0 : Math.PI);
  const roles = assignRoles(bones);
  let J = jointsFromSkeleton(bones, roles, turn);
  if (!J.pelvis || !J.footL || !J.footR || !J.handL || !J.handR) {
    throw new Error('soldier skeleton is missing hips, feet or hands');
  }
  const footY = Math.min(J.footL.y, J.footR.y);
  const scale = PELVIS_HEIGHT / Math.max(0.2, J.pelvis.y - footY + 0.08);
  const toEngine = new THREE.Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-J.pelvis.x, -footY + 0.08, -J.pelvis.z))
    .multiply(turn);
  J = jointsFromSkeleton(bones, roles, toEngine);

  // Rest pose of the engine rig, from the model's own joints.
  const rig = new CharacterRig();
  rig.yaw = 0;
  rig.root.set(0, 0, 0);
  const neck = J.neck ?? J.head;
  const head = J.headTop ?? (J.head ? J.head.clone().add(new THREE.Vector3(0, 0.12, 0)) : neck.clone().add(new THREE.Vector3(0, 0.2, 0)));
  const chest = J.pelvis.clone().lerp(neck, 0.36 / 0.56);
  const set = (i, v) => rig.joints[i].copy(v);
  set(RD.PELVIS, J.pelvis); set(RD.CHEST, chest); set(RD.NECK, neck); set(RD.HEAD, head);
  for (const [s, sh, el, ha, hi, kn, fo] of [
    ['L', RD.SHOULDER_L, RD.ELBOW_L, RD.HAND_L, RD.HIP_L, RD.KNEE_L, RD.FOOT_L],
    ['R', RD.SHOULDER_R, RD.ELBOW_R, RD.HAND_R, RD.HIP_R, RD.KNEE_R, RD.FOOT_R]
  ]) {
    const hand = J['hand' + s];
    const shoulder = J['shoulder' + s] ?? chest.clone().lerp(hand, 0.15);
    set(sh, shoulder);
    set(el, J['elbow' + s] ?? shoulder.clone().lerp(hand, 0.5));
    set(ha, hand);
    const foot = J['foot' + s];
    const hip = J['hip' + s] ?? J.pelvis.clone().setX(J.pelvis.x + (s === 'L' ? -0.1 : 0.1));
    set(hi, hip);
    set(kn, J['knee' + s] ?? hip.clone().lerp(foot, 0.5));
    set(fo, foot);
  }
  rig._buildMatrices();
  const inv = rig.matrices.map((m) => m.clone().invert());

  // Which engine bone each glTF joint drives.
  const classOf = roles;
  const chestY = chest.y;

  // Nearest engine segment, for vertices whose bone name says nothing.
  const SEG = [
    [BONE.PELVIS, RD.PELVIS, RD.CHEST], [BONE.CHEST, RD.CHEST, RD.NECK], [BONE.HEAD, RD.NECK, RD.HEAD],
    [BONE.UPPERARM_L, RD.SHOULDER_L, RD.ELBOW_L], [BONE.FOREARM_L, RD.ELBOW_L, RD.HAND_L],
    [BONE.UPPERARM_R, RD.SHOULDER_R, RD.ELBOW_R], [BONE.FOREARM_R, RD.ELBOW_R, RD.HAND_R],
    [BONE.THIGH_L, RD.HIP_L, RD.KNEE_L], [BONE.SHIN_L, RD.KNEE_L, RD.FOOT_L],
    [BONE.THIGH_R, RD.HIP_R, RD.KNEE_R], [BONE.SHIN_R, RD.KNEE_R, RD.FOOT_R]
  ];
  const seg = new THREE.Line3(), cp = new THREE.Vector3();
  const nearest = (p) => {
    let best = BONE.CHEST, bd = Infinity;
    for (const [b, a, c] of SEG) {
      seg.set(rig.joints[a], rig.joints[c]);
      seg.closestPointToPoint(p, true, cp);
      const d = cp.distanceToSquared(p);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };

  let unknown = 0;
  const pickBone = (p, mesh, i) => {
    let part = null, torso = false;
    if (mesh.isSkinnedMesh) {
      const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
      let bw = -1, bj = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > bw) { bw = w; bj = si.getComponent(i, k); }
      }
      const cls = classOf.get(mesh.skeleton.bones[bj]);
      if (cls) { part = cls.part; torso = !!cls.torso; }
    } else {
      // A rigid accessory parented under a bone (helmet, pouch) follows it.
      for (let o = mesh.parent; o; o = o.parent) {
        const cls = classOf.get(o);
        if (cls) { part = cls.part; torso = !!cls.torso; break; }
      }
    }
    if (part === null && torso) return p.y > chestY ? BONE.CHEST : BONE.PELVIS;
    if (part === null) { unknown++; return nearest(p); }
    return part;
  };

  const weaponMeshes = weapon ? collectMeshes(weapon.scene ?? weapon) : [];
  const atlas = buildAtlas(meshes.concat(weaponMeshes));
  const flat = flatten(meshes, atlas, { each: (p, mesh, i) => pickBone(p, mesh, i), transform: toEngine });

  // Into bone-local frames.
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < flat.count; i++) {
    const b = flat.extra[i];
    v.fromArray(flat.pos, i * 3).applyMatrix4(inv[b]);
    v.toArray(flat.pos, i * 3);
    n.fromArray(flat.nrm, i * 3).transformDirection(inv[b]);
    n.toArray(flat.nrm, i * 3);
  }
  if (tint) {
    for (let i = 0; i < flat.tint.length; i += 3) {
      flat.tint[i] *= tint[0]; flat.tint[i + 1] *= tint[1]; flat.tint[i + 2] *= tint[2];
    }
  }
  flat.bone = flat.extra.slice();

  if (weaponMeshes.length) {
    // An imported rifle, laid into the carried-weapon bone's frame the way
    // the procedural carbine is: barrel along -z, butt at the shoulder.
    const w = flatten(weaponMeshes, atlas, { transform: weaponFrame(weaponMeshes, atlas, weaponFlip) });
    const base = flat.count;
    for (const k of ['pos', 'nrm', 'uv', 'layer', 'tint', 'wear']) for (const x of w[k]) flat[k].push(x);
    for (const i of w.index) flat.index.push(base + i);
    for (let i = 0; i < w.count; i++) flat.bone.push(BONE.WEAPON);
    flat.count += w.count;
  } else {
    // Keep the procedural soldier's carried rifle.
    const procedural = buildSoldier(team, variant, rng);
    appendEngineGeometry(flat, procedural, BONE.WEAPON);
    procedural.dispose();
  }

  const geometry = toGeometry(flat, flat.bone);
  return {
    geometry,
    texture: atlas.texture,
    report: { vertices: flat.count, triangles: flat.index.length / 3, unknownVertices: unknown, scale }
  };
}

/** Where the procedural carbine's butt and muzzle sit in the weapon bone. */
const CARRY_BUTT = 0.04, CARRY_MUZZLE = -0.80;

/**
 * Transform that lays a rifle model along the weapon bone: longest axis as
 * the barrel, muzzle (the slimmer end) toward -z, scaled to the carbine's
 * length, with the receiver's centre on the bone's axis.
 */
function weaponFrame(meshes, atlas, flip = false) {
  const raw = flatten(meshes, atlas);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < raw.pos.length; i += 3) box.expandByPoint(v.fromArray(raw.pos, i));
  const size = box.getSize(new THREE.Vector3());
  const long = size.x >= size.z ? 'x' : 'z';
  const lo = box.min[long], hi = box.max[long], len = hi - lo;
  const across = (a, b) => {
    const s = new THREE.Box3();
    for (let i = 0; i < raw.pos.length; i += 3) {
      v.fromArray(raw.pos, i);
      if (v[long] >= a && v[long] <= b) s.expandByPoint(v);
    }
    const d = s.getSize(new THREE.Vector3());
    return { box: s, area: Math.max(d.y, 1e-6) * Math.max(long === 'x' ? d.z : d.x, 1e-6) };
  };
  const endLo = across(lo, lo + len * 0.08), endHi = across(hi - len * 0.08, hi);
  const muzzleAtHi = (endHi.area < endLo.area) !== flip;
  const dir = new THREE.Vector3(); dir[long] = muzzleAtHi ? 1 : -1;
  const rot = new THREE.Matrix4().makeRotationY(Math.atan2(dir.x, -dir.z));
  const scale = (CARRY_BUTT - CARRY_MUZZLE) / len;
  // receiver: the middle of the model along the barrel
  const mid = across(lo + len * 0.4, lo + len * 0.6).box;
  const c = mid.getCenter(new THREE.Vector3());
  const muzzle = muzzleAtHi ? hi : lo;
  const centre = new THREE.Vector3(c.x, c.y, c.z); centre[long] = muzzle;
  return new THREE.Matrix4()
    .makeTranslation(0, 0, CARRY_MUZZLE)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(rot)
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
}
