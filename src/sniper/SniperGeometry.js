import * as THREE from 'three';
import { LAYER } from '../world/MaterialLibrary.js';
import { buildHands, buildBoltCarrier, buildChargingHandle } from '../weapons/WeaponGeometry.js';

/**
 * SNIPER WEB — procedural viewmodels for the three sniper rifles.
 *
 * Same conventions as the carbine in `WeaponGeometry.js`: weapon-local metres,
 * bore along -Z at y = 0, +X is the ejection side, origin at the front of the
 * magazine well. All three are chassis rifles with a vertical pistol grip,
 * which is what lets them share the carbine's gloved hands unchanged: the
 * grip and the support hand land where the hands already are.
 *
 * Each model exports the anchors the viewmodel and the weapon need (muzzle,
 * ejection port, sight axis, the moving bolt) plus builders for the static
 * body and the moving parts. For the bolt guns the "charging handle" slot
 * carries the bolt handle, which the viewmodel lifts and draws back.
 */

const GUNMETAL = [0.40, 0.42, 0.47];
const BLACK = [0.21, 0.21, 0.23];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/** Chassis colours per rifle, so the three read apart at a glance. */
const FINISH = {
  kestrel: [0.62, 0.66, 0.50],    // olive drab
  vanta:   [0.30, 0.30, 0.32],    // black
  halberd: [1.10, 0.92, 0.66]     // flat dark earth
};

const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function m(x, y, z, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    rx || ry || rz ? _q.setFromEuler(new THREE.Euler(rx, ry, rz)) : _qi,
    _one
  );
}

function cyl(b, z0, z1, r0, r1, seg, opts, x = 0, y = 0) {
  b.addCylinderBetween(_a.set(x, y, z0), _b.set(x, y, z1), r0, r1, seg, opts);
}

function bevelBox(b, cx, cy, cz, sx, sy, sz, opts, k = 0.16) {
  const bev = Math.min(sx, sy, sz) * k;
  b.addBox(cx, cy, cz, sx, sy - bev * 2, sz - bev * 2, opts);
  b.addBox(cx, cy, cz, sx - bev * 2, sy, sz - bev * 2, opts);
  b.addBox(cx, cy, cz, sx - bev * 2, sy - bev * 2, sz, opts);
}

function rail(b, y, z0, z1, width, opts) {
  const len = z1 - z0;
  b.addBox(0, y - 0.003, (z0 + z1) * 0.5, width, 0.006, len, opts);
  const pitch = 0.0102;
  const n = Math.floor(len / pitch);
  for (let i = 0; i < n; i++) {
    b.addBox(0, y + 0.0015, z0 + (i + 0.5) * pitch, width, 0.003, 0.0052, opts);
  }
}

/**
 * Riflescope, objective forward. Built solid: the scoped view itself is drawn
 * as a screen overlay once the rifle is shouldered (PHASE 3 makes it real).
 */
function scope(b, cfg, metal) {
  const { y, z0, z1, tube = 0.0155, objective = 0.026, ocular = 0.020 } = cfg;
  const dark = { ...metal, tint: shade(BLACK, 1.1) };
  // tube, objective bell, ocular bell
  cyl(b, z0 + 0.05, z1 - 0.05, tube, tube, 18, dark, 0, y);
  cyl(b, z0, z0 + 0.012, objective, objective, 20, dark, 0, y);
  cyl(b, z0 + 0.012, z0 + 0.065, objective, tube, 20, dark, 0, y);
  cyl(b, z1 - 0.06, z1 - 0.045, tube, ocular, 18, dark, 0, y);
  cyl(b, z1 - 0.045, z1, ocular, ocular * 0.96, 18, dark, 0, y);
  // lenses: a dark glassy cap at each end
  const glass = { layer: LAYER.GUNMETAL, tint: [0.05, 0.08, 0.12], wear: 0.0, uvScale: 30 };
  cyl(b, z0 - 0.001, z0 + 0.004, objective * 0.86, objective * 0.86, 20, glass, 0, y);
  cyl(b, z1 - 0.004, z1 + 0.001, ocular * 0.84, ocular * 0.84, 18, glass, 0, y);
  // sunshade ring and magnification ring
  cyl(b, z1 - 0.10, z1 - 0.075, tube * 1.18, tube * 1.18, 18, { ...metal, tint: shade(GUNMETAL, 0.9) }, 0, y);
  // turret saddle with elevation (top) and windage (right) turrets
  const tz = (z0 + z1) * 0.5 - 0.01;
  b.addBox(0, y, tz, tube * 2.3, tube * 2.3, 0.05, dark);
  b.addCylinder(0, y + tube * 1.15 + 0.010, tz, 0.0145, 0.0145, 0.020, 16, { ...metal, tint: shade(GUNMETAL, 0.75) });
  b.addCylinderBetween(_a.set(tube * 1.15, y, tz), _b.set(tube * 1.15 + 0.018, y, tz), 0.012, 0.012, 14, { ...metal, tint: shade(GUNMETAL, 0.75) });
  b.addCylinderBetween(_a.set(-tube * 1.15, y, tz + 0.005), _b.set(-tube * 1.15 - 0.012, y, tz + 0.005), 0.0105, 0.0105, 14, dark);
  // rings onto the rail
  for (const rz of cfg.rings) {
    b.addBox(0, (y + cfg.railY) * 0.5, rz, 0.022, y - cfg.railY, 0.018, { ...metal, tint: shade(GUNMETAL, 0.8) });
    cyl(b, rz - 0.010, rz + 0.010, tube + 0.004, tube + 0.004, 18, { ...metal, tint: shade(GUNMETAL, 0.8) }, 0, y);
  }
}

/** Vertical pistol grip and trigger group, where the carbine's grip is. */
function gripAndTrigger(b, finish, metal) {
  const grip = { layer: LAYER.POLYMER, tint: shade(finish, 0.8), wear: 0.55, uvScale: 11 };
  b.addBox(0, -0.0455, 0.055, 0.0085, 0.005, 0.056, { ...metal, tint: shade(GUNMETAL, 1.2) });
  b.addBox(0, -0.032, 0.083, 0.0085, 0.030, 0.005, { ...metal, tint: shade(GUNMETAL, 1.2) });
  b.pushTransform(m(0, -0.030, 0.0575, 0.30, 0, 0));
  b.addBox(0, 0, 0, 0.0062, 0.021, 0.005, metal);
  b.popTransform();
  b.pushTransform(m(0, -0.072, 0.098, 0.38, 0, 0));
  b.addBox(0, 0, 0, 0.030, 0.088, 0.040, grip);
  b.addBox(0, -0.049, 0.003, 0.033, 0.012, 0.043, grip);
  for (let i = 0; i < 6; i++) {
    b.addBox(0, 0.028 - i * 0.013, -0.0205, 0.026, 0.006, 0.004, { ...grip, tint: shade(finish, 0.6) });
  }
  b.popTransform();
}

/** Fixed chassis stock with a raised cheek piece and an adjustable butt. */
function stock(b, finish, metal, { z0 = 0.100, z1 = 0.275, comb = 0.026, drop = 0.072 } = {}) {
  const body = { layer: LAYER.POLYMER, tint: finish, wear: 0.5, uvScale: 11 };
  const len = z1 - z0;
  // spine from the receiver back
  bevelBox(b, 0, 0.004, z0 + len * 0.5, 0.034, 0.030, len, body);
  // cheek piece on posts
  // Kept low and short: anything taller fills the corner of the screen at
  // viewmodel distance, the same trap the carbine's stock documents.
  bevelBox(b, 0, comb, z0 + len * 0.66, 0.030, 0.014, len * 0.5, body);
  b.addBox(0, (comb + 0.004) * 0.5, z0 + len * 0.45, 0.010, comb - 0.01, 0.008, { ...metal, tint: shade(GUNMETAL, 0.8) });
  // lower leg and monopod rail
  b.pushTransform(m(0, -drop * 0.55, z1 - 0.07, -0.25, 0, 0));
  bevelBox(b, 0, 0, 0, 0.030, drop, 0.030, body);
  b.popTransform();
  b.addBox(0, -drop + 0.004, z1 - 0.045, 0.026, 0.010, 0.07, body);
  // butt pad
  b.addBox(0, -drop * 0.45 + 0.004, z1 + 0.006, 0.036, drop + 0.026, 0.014, { layer: LAYER.POLYMER, tint: shade(BLACK, 1.1), wear: 0.4, uvScale: 14 });
}

/** Forend: a squared tube around a free-floated barrel. */
function forend(b, finish, metal, { z0, z1, w = 0.052, h = 0.050, y = -0.006 }) {
  const body = { layer: LAYER.POLYMER, tint: finish, wear: 0.55, uvScale: 11 };
  bevelBox(b, 0, y, (z0 + z1) * 0.5, w, h, z1 - z0, body, 0.22);
  // lightening slots down each side
  const n = Math.floor((z1 - z0 - 0.04) / 0.032);
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.03 + i * 0.032;
    for (const s of [-1, 1]) {
      b.addBox(s * (w * 0.5 + 0.0005), y, z, 0.002, h * 0.42, 0.018, { ...body, tint: shade(finish, 0.35) });
    }
  }
  // sling stud under the tip
  b.addCylinder(0, y - h * 0.5 - 0.005, z0 + 0.03, 0.006, 0.006, 0.01, 8, metal);
}

/** Detachable box magazine standing in the well. */
function magazine(b, { height, width = 0.030, length = 0.072 }, metal) {
  const mag = { ...metal, tint: shade(BLACK, 1.3) };
  b.addBox(0, -0.040 - height * 0.5, -0.004, width, height, length, mag);
  b.addBox(0, -0.040 - height - 0.005, -0.004, width + 0.004, 0.010, length + 0.006, { ...mag, tint: shade(BLACK, 1.6) });
}

// ----------------------------------------------------------------- KESTREL

function buildKestrel(b) {
  const finish = FINISH.kestrel;
  const metal = { layer: LAYER.GUNMETAL, tint: GUNMETAL, wear: 0.45, uvScale: 9 };
  // heavy contour barrel and a small thread protector
  cyl(b, -0.10, -0.66, 0.0118, 0.0098, 14, { ...metal, caps: false });
  cyl(b, -0.66, -0.685, 0.0118, 0.0118, 14, { ...metal, tint: shade(GUNMETAL, 0.7) });
  // round action
  cyl(b, -0.105, 0.085, 0.0195, 0.0195, 18, metal);
  b.addBox(0.0185, 0.008, 0.012, 0.004, 0.018, 0.060, { ...metal, tint: shade(GUNMETAL, 0.5) }); // port
  b.addBox(0, -0.014, -0.010, 0.040, 0.024, 0.200, { layer: LAYER.POLYMER, tint: finish, wear: 0.5, uvScale: 11 });
  rail(b, 0.0245, -0.12, 0.085, 0.021, metal);
  forend(b, finish, metal, { z0: -0.43, z1: -0.10 });
  magazine(b, { height: 0.052 }, metal);
  gripAndTrigger(b, finish, metal);
  stock(b, finish, metal);
  scope(b, { y: 0.064, z0: -0.27, z1: 0.075, railY: 0.0245, rings: [-0.085, 0.030] }, metal);
}

function buildBoltHandle(b, { knob = 0.0095, reach = 0.046, boltR = 0.0098 } = {}) {
  const metal = { layer: LAYER.GUNMETAL, tint: shade(GUNMETAL, 1.25), wear: 0.35, uvScale: 12 };
  // bolt body: hidden in the action until it is drawn back
  cyl(b, -0.10, 0.025, boltR, boltR, 12, metal);
  // shroud at the rear of the action
  cyl(b, 0.025, 0.052, 0.0150, 0.0130, 14, { ...metal, tint: shade(GUNMETAL, 0.9) });
  // handle: angled down and out to the right, with a tactical knob
  b.pushTransform(m(0, 0, 0.014, 0, 0, -0.55));
  b.addBox(reach * 0.5, 0, 0, reach, 0.007, 0.008, metal);
  b.addBlob(reach + knob * 0.6, 0, 0.004, knob, knob, knob * 1.15, 10, 8, { ...metal, tint: shade(BLACK, 1.4) });
  b.popTransform();
}

// ------------------------------------------------------------------- VANTA

function buildVanta(b) {
  const finish = FINISH.vanta;
  const metal = { layer: LAYER.GUNMETAL, tint: GUNMETAL, wear: 0.5, uvScale: 9 };
  cyl(b, -0.10, -0.60, 0.0112, 0.0094, 14, { ...metal, caps: false });
  // flash hider with tines
  cyl(b, -0.60, -0.655, 0.0125, 0.0120, 14, { ...metal, tint: shade(GUNMETAL, 0.75), caps: false });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI * 0.5 + Math.PI * 0.25;
    b.addBox(Math.cos(a) * 0.0122, Math.sin(a) * 0.0122, -0.645, 0.004, 0.004, 0.02, { ...metal, tint: shade(GUNMETAL, 0.5) });
  }
  // AR-10 style upper and lower
  bevelBox(b, 0, 0.015, -0.002, 0.042, 0.058, 0.205, { ...metal, bevel: 0.12 });
  b.addBox(0, 0.032, 0.108, 0.034, 0.030, 0.028, metal);
  b.addBox(0.0215, 0.020, 0.010, 0.004, 0.032, 0.066, { ...metal, tint: shade(GUNMETAL, 1.2), wear: 0.75 });
  bevelBox(b, 0, -0.021, 0.036, 0.038, 0.052, 0.132, metal);
  rail(b, 0.0475, -0.40, 0.110, 0.021, metal);
  // free-float handguard, round
  const hg = { layer: LAYER.POLYMER, tint: finish, wear: 0.55, uvScale: 11 };
  cyl(b, -0.10, -0.40, 0.0275, 0.0275, 10, hg);
  for (let i = 0; i < 7; i++) {
    b.addBox(0.0278, 0, -0.13 - i * 0.038, 0.002, 0.012, 0.022, { ...hg, tint: shade(finish, 0.4) });
    b.addBox(-0.0278, 0, -0.13 - i * 0.038, 0.002, 0.012, 0.022, { ...hg, tint: shade(finish, 0.4) });
  }
  magazine(b, { height: 0.088, width: 0.032 }, metal);
  gripAndTrigger(b, finish, metal);
  // buffer tube into a precision stock
  cyl(b, 0.098, 0.20, 0.0165, 0.0165, 12, metal, 0, 0.014);
  stock(b, finish, metal, { z0: 0.14, z1: 0.285, comb: 0.030 });
  scope(b, { y: 0.080, z0: -0.25, z1: 0.090, railY: 0.0475, rings: [-0.08, 0.04] }, metal);
}

// ----------------------------------------------------------------- HALBERD

function buildHalberd(b) {
  const finish = FINISH.halberd;
  const metal = { layer: LAYER.GUNMETAL, tint: GUNMETAL, wear: 0.5, uvScale: 9 };
  // long fluted barrel
  cyl(b, -0.10, -0.80, 0.0150, 0.0128, 16, { ...metal, caps: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.addBox(Math.cos(a) * 0.0138, Math.sin(a) * 0.0138, -0.50, 0.003, 0.003, 0.36, { ...metal, tint: shade(GUNMETAL, 0.55) });
  }
  // big two-chamber muzzle brake
  b.addBox(0, 0, -0.85, 0.050, 0.034, 0.092, { ...metal, tint: shade(GUNMETAL, 0.85) });
  for (const z of [-0.825, -0.872]) {
    b.addBox(0.0255, 0, z, 0.002, 0.024, 0.020, { ...metal, tint: shade(BLACK, 0.4) });
    b.addBox(-0.0255, 0, z, 0.002, 0.024, 0.020, { ...metal, tint: shade(BLACK, 0.4) });
  }
  // massive square action
  bevelBox(b, 0, 0.004, -0.004, 0.054, 0.052, 0.215, { ...metal, bevel: 0.10 });
  b.addBox(0.0275, 0.010, 0.012, 0.004, 0.024, 0.078, { ...metal, tint: shade(GUNMETAL, 0.5) });
  rail(b, 0.033, -0.13, 0.095, 0.024, metal);
  forend(b, finish, metal, { z0: -0.50, z1: -0.11, w: 0.064, h: 0.060, y: -0.008 });
  // folded bipod under the forend
  const legs = { ...metal, tint: shade(BLACK, 1.5) };
  b.addBox(0, -0.044, -0.47, 0.034, 0.014, 0.03, legs);
  for (const s of [-1, 1]) cyl(b, -0.46, -0.24, 0.0055, 0.0050, 8, legs, s * 0.012, -0.050);
  magazine(b, { height: 0.075, width: 0.036, length: 0.11 }, metal);
  gripAndTrigger(b, finish, metal);
  stock(b, finish, metal, { z0: 0.105, z1: 0.290, comb: 0.030, drop: 0.080 });
  scope(b, { y: 0.077, z0: -0.31, z1: 0.085, objective: 0.030, railY: 0.033, rings: [-0.10, 0.035] }, metal);
}

// -------------------------------------------------------------------- export

/**
 * Everything the viewmodel needs for one rifle. Anchors are weapon-local.
 * `boltAction` models draw the bolt handle in the charging-handle slot and
 * have no visible bolt carrier.
 */
export const SNIPER_MODELS = {
  kestrel: {
    id: 'kestrel',
    optic: 'scope',
    boltAction: true,
    buildBody: (b) => { buildKestrel(b); buildHands(b); },
    buildCharging: (b) => buildBoltHandle(b),
    buildBolt: (b) => b.addBox(0, 0, 0, 0.004, 0.004, 0.004, { layer: LAYER.GUNMETAL, tint: GUNMETAL }),
    anchors: {
      muzzle: new THREE.Vector3(0, 0, -0.69),
      ejectionPort: new THREE.Vector3(0.022, 0.010, 0.012),
      sightWindow: new THREE.Vector3(0, 0.064, 0.02),
      sightAxisOffsetY: 0.064,
      chargingHandle: new THREE.Vector3(0, 0, 0.058),
      boltCarrier: new THREE.Vector3(0, 0, 0.02),
      chargeTravel: 0.085,
      liftAngle: 1.05,
      adsZ: -0.36
    }
  },
  vanta: {
    id: 'vanta',
    optic: 'scope',
    boltAction: false,
    buildBody: (b) => { buildVanta(b); buildHands(b); },
    buildCharging: (b) => buildChargingHandle(b),
    buildBolt: (b) => buildBoltCarrier(b),
    anchors: {
      muzzle: new THREE.Vector3(0, 0, -0.66),
      ejectionPort: new THREE.Vector3(0.028, 0.020, 0.012),
      sightWindow: new THREE.Vector3(0, 0.080, 0.03),
      sightAxisOffsetY: 0.080,
      chargingHandle: new THREE.Vector3(0, 0.034, 0.128),
      boltCarrier: new THREE.Vector3(0, 0.022, 0.02),
      chargeTravel: 0.070,
      liftAngle: 0,
      adsZ: -0.37
    }
  },
  halberd: {
    id: 'halberd',
    optic: 'scope',
    boltAction: true,
    buildBody: (b) => { buildHalberd(b); buildHands(b); },
    buildCharging: (b) => buildBoltHandle(b, { knob: 0.012, reach: 0.056, boltR: 0.013 }),
    buildBolt: (b) => b.addBox(0, 0, 0, 0.004, 0.004, 0.004, { layer: LAYER.GUNMETAL, tint: GUNMETAL }),
    anchors: {
      muzzle: new THREE.Vector3(0, 0, -0.90),
      ejectionPort: new THREE.Vector3(0.030, 0.010, 0.012),
      sightWindow: new THREE.Vector3(0, 0.077, 0.02),
      sightAxisOffsetY: 0.077,
      chargingHandle: new THREE.Vector3(0, 0.004, 0.062),
      boltCarrier: new THREE.Vector3(0, 0, 0.02),
      chargeTravel: 0.120,
      liftAngle: 1.0,
      adsZ: -0.34
    }
  }
};
