import * as THREE from 'three';
import { GeometryBuilder } from '../world/GeometryBuilder.js';
import { buildHands } from '../weapons/WeaponGeometry.js';
import { collectMeshes, buildAtlas, flatten, appendEngineGeometry, toGeometry } from './ImportedModels.js';

/**
 * SNIPER WEB — an imported rifle as a first-person viewmodel.
 *
 * Downloaded rifle models come in any orientation, scale and origin. This
 * fits one onto the slot of the procedural rifle it replaces:
 *
 *   - the longest axis is the barrel; the end with the smaller cross-section
 *     is the muzzle, which goes to -Z;
 *   - it is scaled so muzzle and butt land where the procedural rifle's do,
 *     which keeps the gloved hands, the ADS pose and the scope placement
 *     working unchanged;
 *   - the bore height is taken from the centre of the muzzle, and the scope
 *     axis from the top of the middle of the gun.
 *
 * The bolt of an imported model is part of its static mesh, so the bolt
 * handle animation is replaced by an invisible stand-in.
 */

const AXES = ['x', 'y', 'z'];

function slice(pos, axis, from, to) {
  const out = { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity), n: 0 };
  const a = AXES.indexOf(axis);
  for (let i = 0; i < pos.length; i += 3) {
    const v = pos[i + a];
    if (v < from || v > to) continue;
    out.n++;
    for (let k = 0; k < 3; k++) {
      out.min.setComponent(k, Math.min(out.min.getComponent(k), pos[i + k]));
      out.max.setComponent(k, Math.max(out.max.getComponent(k), pos[i + k]));
    }
  }
  return out;
}

/**
 * @param gltf     loaded glTF
 * @param base     the procedural model this replaces (SNIPER_MODELS entry)
 * @param opts.butt  z of the buttplate in the procedural model
 * @param opts.flip  force the muzzle to the other end if the guess is wrong
 * @param opts.up    'y' | '-y' … override which way is up (default +y)
 */
export function buildImportedRifle(gltf, base, { butt = 0.275, flip = false, roll = 0 } = {}) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const meshes = collectMeshes(root);
  if (!meshes.length) throw new Error('rifle model has no meshes');
  const atlas = buildAtlas(meshes);

  // First pass in model space, to find the barrel axis and the muzzle end.
  const raw = flatten(meshes, atlas);
  const box = new THREE.Box3();
  for (let i = 0; i < raw.pos.length; i += 3) box.expandByPoint(new THREE.Vector3(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
  const size = box.getSize(new THREE.Vector3());
  const long = size.x >= size.y && size.x >= size.z ? 'x' : size.z >= size.y ? 'z' : 'y';
  const lo = box.min[long], hi = box.max[long], len = hi - lo;
  const area = (s) => {
    const d = s.max.clone().sub(s.min);
    return AXES.filter((k) => k !== long).reduce((p, k) => p * Math.max(d[k], 1e-6), 1);
  };
  const endLo = slice(raw.pos, long, lo, lo + len * 0.06);
  const endHi = slice(raw.pos, long, hi - len * 0.06, hi);
  let muzzleAtHi = area(endHi) < area(endLo);
  if (flip) muzzleAtHi = !muzzleAtHi;

  // Rotate so the barrel runs along -Z with the muzzle in front.
  const rot = new THREE.Matrix4();
  const dir = new THREE.Vector3();
  dir[long] = muzzleAtHi ? 1 : -1;               // muzzle direction in model space
  if (long === 'y') {
    rot.makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, 0, -1)));
  } else {
    // A horizontal barrel turns about the vertical only, so up stays up
    // (a shortest-arc turn of +z onto -z can roll the rifle upside down).
    rot.makeRotationY(Math.atan2(dir.x, -dir.z));
  }
  if (roll) rot.premultiply(new THREE.Matrix4().makeRotationZ(roll));

  // Scale: muzzle at the procedural muzzle, butt at the procedural butt.
  const front = base.anchors.muzzle.z;
  const scale = (butt - front) / len;
  const muzzleEnd = muzzleAtHi ? endHi : endLo;
  const muzzleCentre = muzzleEnd.min.clone().add(muzzleEnd.max).multiplyScalar(0.5);
  muzzleCentre[long] = muzzleAtHi ? hi : lo;
  const xf = new THREE.Matrix4()
    .makeTranslation(0, 0, front)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(rot)
    .multiply(new THREE.Matrix4().makeTranslation(-muzzleCentre.x, -muzzleCentre.y, -muzzleCentre.z));

  const flat = flatten(meshes, atlas, { transform: xf });

  // The scope axis: the top of the middle third, less the tube's radius.
  const mid = slice(flat.pos, 'z', front + (butt - front) * 0.35, front + (butt - front) * 0.75);
  const top = Number.isFinite(mid.max.y) ? mid.max.y : base.anchors.sightAxisOffsetY + 0.02;
  const sightY = Math.max(0.03, top - 0.022);

  // Gloved hands from the procedural rifle, in the same body mesh.
  const hands = new GeometryBuilder(null, 'vm-hands');
  buildHands(hands);
  flat.bone = [];
  appendEngineGeometry(flat, hands.build());

  const geometry = toGeometry(flat);
  const empty = (b) => b.addBox(0, -10, 0, 0.0005, 0.0005, 0.0005, { layer: 0, tint: [0, 0, 0] });
  return {
    ...base,
    id: base.id + '-imported',
    boltAction: base.boltAction,
    bodyGeometry: geometry,
    texture: atlas.texture,
    buildBody: () => {},
    buildCharging: empty,
    buildBolt: empty,
    anchors: {
      ...base.anchors,
      sightWindow: new THREE.Vector3(0, sightY, base.anchors.sightWindow.z),
      sightAxisOffsetY: sightY,
      liftAngle: 0,
      chargeTravel: 0
    },
    report: { triangles: flat.index.length / 3, scale, longAxis: long, muzzleAtHi }
  };
}
