import { FIRE_MODE } from '../weapons/Weapon.js';

/**
 * SNIPER WEB — the three sniper rifles, as data.
 *
 * Each entry is a full weapon profile in the same shape as the carbine's, so
 * `Weapon`, `Combat` and the HUD read it without knowing it is a rifle. The
 * fields the carbine does not have are all optional and default to carbine
 * behaviour:
 *
 *   action        'bolt' | 'semi' | 'auto' (default)
 *   fireModes     the selector positions this gun has, first one is the default
 *   modeLabel     what the HUD shows instead of the fire-mode name
 *   boltTime      seconds to work the bolt between shots (bolt guns)
 *   recoil        { vertical, horizontal } per-shot kick in radians, replacing
 *                 the carbine's learned spray pattern
 *   vmKick        viewmodel recoil multiplier
 *   maxRange      metres a round is traced for (the carbine stays at 320)
 *   scopeZoom     magnification the scope comes up at
 *   scopeZooms    powers the mouse wheel steps through while aiming
 *   shotWeight    0..1, how much heavier the report sounds than the carbine's
 *   tracer        { scale } — every round shows a trace that grows with range
 *   impactPlume   size of the dust plume a round throws where it lands
 *   model         which viewmodel to draw (see SniperGeometry.js)
 *
 * The names are invented for this game; they are not real products. Numbers
 * are game balance, loosely anchored to real cartridges (enemy health is 100).
 * Bullet drop and flight time arrive with the ballistics work in PHASE 4;
 * until then every round is traced instantly, like the carbine's.
 */
export const SNIPER_RIFLES = {
  /** Bolt-action .308: the all-rounder. One body shot is not quite a kill. */
  kestrel: {
    id: 'kestrel',
    name: 'KESTREL R7',
    caliber: '7.62x51',
    action: 'bolt',
    fireModes: [FIRE_MODE.SEMI],
    modeLabel: 'BOLT',
    rpm: 600,                 // trigger reset only; the bolt is the real limit
    boltTime: 0.95,
    magSize: 5,
    reserve: 30,
    damage: 92,
    headMultiplier: 3.0,
    limbMultiplier: 0.8,
    muzzleVelocity: 820,
    falloffStart: 320,
    falloffEnd: 900,
    falloffFloor: 0.82,
    penetration: 1.6,
    maxRange: 1200,
    reloadTactical: 2.6,
    reloadEmpty: 3.4,
    drawTime: 0.85,
    adsTime: 0.32,
    spreadBase: 0.020,
    spreadAds: 0.00012,
    spreadMove: 0.030,
    spreadAir: 0.060,
    spreadCrouch: 0.6,
    spreadPerShot: 0.004,
    spreadDecay: 3.2,
    spreadMax: 0.05,
    recoil: { vertical: 0.030, horizontal: 0.006 },
    vmKick: 2.2,
    scopeZoom: 4,
    scopeZooms: [4, 6, 8],
    shotWeight: 0.55,
    tracer: { scale: 1 },
    impactPlume: 3,
    model: 'kestrel'
  },

  /** Semi-automatic 7.62: faster follow-ups, less per round, more climb. */
  vanta: {
    id: 'vanta',
    name: 'VANTA SR-10',
    caliber: '7.62x51',
    action: 'semi',
    fireModes: [FIRE_MODE.SEMI],
    modeLabel: 'SEMI',
    rpm: 300,
    magSize: 10,
    reserve: 50,
    damage: 68,
    headMultiplier: 2.6,
    limbMultiplier: 0.8,
    muzzleVelocity: 790,
    falloffStart: 250,
    falloffEnd: 750,
    falloffFloor: 0.75,
    penetration: 1.3,
    maxRange: 1000,
    reloadTactical: 2.4,
    reloadEmpty: 3.1,
    drawTime: 0.75,
    adsTime: 0.28,
    spreadBase: 0.018,
    spreadAds: 0.00022,
    spreadMove: 0.028,
    spreadAir: 0.055,
    spreadCrouch: 0.65,
    spreadPerShot: 0.0016,
    spreadDecay: 4.0,
    spreadMax: 0.045,
    recoil: { vertical: 0.018, horizontal: 0.005 },
    vmKick: 1.6,
    scopeZoom: 4,
    scopeZooms: [4, 6, 8],
    shotWeight: 0.45,
    tracer: { scale: 1 },
    impactPlume: 2.5,
    model: 'vanta'
  },

  /** Heavy bolt-action .50: kills through anything it touches, slowly. */
  halberd: {
    id: 'halberd',
    name: 'HALBERD .50',
    caliber: '12.7x99',
    action: 'bolt',
    fireModes: [FIRE_MODE.SEMI],
    modeLabel: 'BOLT',
    rpm: 400,
    boltTime: 1.35,
    magSize: 5,
    reserve: 20,
    damage: 165,
    headMultiplier: 2.5,
    limbMultiplier: 0.9,
    muzzleVelocity: 880,
    falloffStart: 500,
    falloffEnd: 1400,
    falloffFloor: 0.85,
    penetration: 4.0,
    maxRange: 1600,
    reloadTactical: 3.6,
    reloadEmpty: 4.4,
    drawTime: 1.25,
    adsTime: 0.45,
    spreadBase: 0.030,
    spreadAds: 0.00015,
    spreadMove: 0.045,
    spreadAir: 0.080,
    spreadCrouch: 0.55,
    spreadPerShot: 0.006,
    spreadDecay: 2.6,
    spreadMax: 0.07,
    recoil: { vertical: 0.055, horizontal: 0.010 },
    vmKick: 3.0,
    scopeZoom: 4,
    scopeZooms: [4, 6, 8],
    shotWeight: 1.0,
    tracer: { scale: 1 },
    impactPlume: 5,
    model: 'halberd'
  }
};

/** Slot order: key 1, 2, 3. */
export const SNIPER_LOADOUT = ['kestrel', 'vanta', 'halberd'];

export const MODES = ['carbine', 'sniper'];

/**
 * Which weapon set this page load uses. `?mode=` wins; otherwise the sniper
 * maps default to the rifles and the original district keeps its carbine, so
 * the original game and its tests are untouched.
 */
export function resolveMode(search, mapId) {
  const q = new URLSearchParams(search || '').get('mode');
  if (q && MODES.includes(q)) return q;
  return mapId === 'mountain' ? 'sniper' : 'carbine';
}
