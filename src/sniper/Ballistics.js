import * as THREE from 'three';

/**
 * SNIPER WEB — rifle rounds that fly.
 *
 * The original game traces every shot instantly along a straight line, which
 * is right for a carbine at street range and wrong for a rifle at 300 m. Here
 * a rifle round is a point mass stepped at the simulation rate:
 *
 *   gravity    9.81 m/s² straight down — about 0.7 m of drop at 300 m;
 *   drag       quadratic in the airspeed (velocity relative to the wind),
 *              `spec.drag` per metre, so the round slows over distance;
 *   wind       a steady breeze per match, exaggerated a little through
 *              `WIND_PUSH` so that holding off for it is a real decision
 *              (≈ 0.5 m at 300 m in a 5 m/s crosswind);
 *   zero       the scope is zeroed at `spec.zero` metres (100 by default):
 *              the barrel is tipped up so the round crosses the line of
 *              sight there, as on a real rifle.
 *
 * Each step's flight segment is handed to `Combat.fireBullet` with the
 * distance and energy already spent, so hits, penetration, decals, crates,
 * blood and sounds all work exactly as before; the round simply arrives
 * later and lower. Moving targets move while it flies.
 */

export const GRAVITY = 9.81;
const WIND_PUSH = 1.4;           // extra acceleration per m/s of crosswind
const MAX_FLIGHT = 4;            // seconds; a round still flying is dropped

export class Ballistics {
  constructor(combat) {
    this.combat = combat;
    this.rounds = [];
    /** Steady wind for the match, m/s, in the horizontal plane. */
    this.wind = new THREE.Vector3();
    this.fired = 0;
    this.landed = 0;
  }

  /** Pick this match's wind: calm to a fresh breeze, any direction. */
  rollWind(rng, max = 6) {
    const a = rng.next() * Math.PI * 2;
    const s = rng.next() * max;
    this.wind.set(Math.sin(a) * s, 0, Math.cos(a) * s);
    return this.wind;
  }

  /** Launch angle that puts the round back on the line of sight at `zero` m. */
  static zeroAngle(spec) {
    const v = spec.muzzleVelocity ?? 800;
    const d = spec.zero ?? 100;
    const k = spec.drag ?? 0;
    // Flight time to d under quadratic drag: speed falls as v·e^(-k·x).
    const t = k > 0 ? (Math.exp(k * d) - 1) / (k * v) : d / v;
    // Drop under gravity alone over that time is close enough at 100 m.
    return Math.atan2(0.5 * GRAVITY * t * t, d);
  }

  /** Fire a round along `shot.direction` (the line of sight). */
  fire(shot) {
    const spec = shot.spec;
    const v0 = spec.muzzleVelocity ?? 800;
    const dir = shot.direction.clone().normalize();
    // Tip the bore up by the zero angle, about the horizontal axis across it.
    // Axis across the bore, oriented so a positive turn lifts the muzzle.
    const up = ZERO_AXIS.set(-dir.z, 0, dir.x);
    if (up.lengthSq() > 1e-8) dir.applyAxisAngle(up.normalize(), Ballistics.zeroAngle(spec));
    this.rounds.push({
      shot,
      pos: shot.origin.clone(),
      start: shot.origin.clone(),
      vel: dir.multiplyScalar(v0),
      travelled: 0,
      energy: 1,
      time: 0,
      first: true
    });
    this.fired++;
  }

  update(dt) {
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      if (this._step(this.rounds[i], dt)) this.rounds.splice(i, 1);
    }
  }

  /** Advance one round; true when it is done. */
  _step(r, dt) {
    const spec = r.shot.spec;
    const k = spec.drag ?? 0;
    // airspeed and the accelerations it causes
    _air.copy(r.vel).sub(this.wind);
    const speed = _air.length();
    _acc.copy(_air).multiplyScalar(-k * speed);
    _acc.y -= GRAVITY;
    _acc.x += this.wind.x * WIND_PUSH;
    _acc.z += this.wind.z * WIND_PUSH;

    _next.copy(r.pos).addScaledVector(r.vel, dt).addScaledVector(_acc, 0.5 * dt * dt);
    r.vel.addScaledVector(_acc, dt);
    r.time += dt;

    _seg.subVectors(_next, r.pos);
    const len = _seg.length();
    if (len < 1e-6) return true;
    _seg.multiplyScalar(1 / len);

    const combat = this.combat;
    const hit = combat.fireBullet({
      ...r.shot,
      origin: r.pos,
      direction: _seg,
      segment: len,
      travelled: r.travelled,
      energy: r.energy,
      shooter: r.start,
      // the first segment's tracer starts at the muzzle, later ones where
      // the round is now
      muzzle: r.first ? r.shot.muzzle : null
    });
    if (!r.first) combat.shotsFired--;    // one trigger pull counts once
    r.first = false;
    r.travelled += len;
    r.pos.copy(_next);

    const maxRange = spec.maxRange ?? 1200;
    if (hit) { this.landed++; return true; }
    if (r.travelled >= maxRange || r.time >= MAX_FLIGHT) return true;
    return false;
  }
}

const ZERO_AXIS = new THREE.Vector3();
const _air = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _next = new THREE.Vector3();
const _seg = new THREE.Vector3();
