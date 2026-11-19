import * as THREE from 'three';
import { PKIND } from '../fx/Particles.js';

/**
 * SNIPER WEB — props that bullets can break (wooden crates for now).
 *
 * The world is static merged geometry with a static collision BVH, which is
 * what makes it fast. Breaking a crate therefore does not remove anything:
 * the crate's vertices in its render batch and its triangles in the collision
 * soup are collapsed to a point far under the map. A zero-area triangle can't
 * be hit by a ray or a capsule, and nothing has to be rebuilt.
 *
 * The map records, per crate, its vertex range in the `crates` batch, its
 * triangle range in the soup, its bounds and which stack it belongs to. When a
 * crate breaks, everything stacked on top of it goes too.
 */
const HEALTH = 100;
const BURIED = -10000;

export class Destructibles {
  constructor({ world, combat, audio, entries, mesh }) {
    this.world = world;
    this.combat = combat;
    this.audio = audio;
    this.mesh = mesh;
    this.items = entries.map((e, i) => ({ ...e, id: i, health: HEALTH, broken: false }));
    // Triangle index -> item, for the hit test the combat code asks on every
    // world impact.
    this._byTri = new Map();
    for (const item of this.items) {
      for (let t = item.t0; t < item.t1; t++) this._byTri.set(t, item);
    }
    this.brokenCount = 0;
  }

  /** Called by `Combat` for every world impact. Returns true if it broke something. */
  hit(triIndex, point, damage) {
    const item = this._byTri.get(triIndex);
    if (!item || item.broken) return false;
    item.health -= damage;
    if (item.health > 0) return false;
    this._break(item, point);
    // Whatever stood on it falls with it.
    for (const other of this.items) {
      if (!other.broken && other.stack === item.stack && other.level > item.level) this._break(other, null);
    }
    return true;
  }

  _break(item, point) {
    item.broken = true;
    this.brokenCount++;

    // Collapse the collision triangles.
    const p = this.world.soup.positions;
    for (let t = item.t0; t < item.t1; t++) {
      for (let k = 0; k < 9; k += 3) {
        p[t * 9 + k] = item.center.x;
        p[t * 9 + k + 1] = BURIED;
        p[t * 9 + k + 2] = item.center.z;
      }
    }
    // Collapse the render vertices.
    const pos = this.mesh.geometry.attributes.position;
    for (let v = item.v0; v < item.v1; v++) pos.setXYZ(v, item.center.x, BURIED, item.center.z);
    pos.needsUpdate = true;

    // Holes that were in it go with it.
    this.combat.decals.removeInBox?.(item.box);

    this._burst(item, point ?? item.center);
    this.audio?.playImpact?.(item.center, 'wood', 1.4);
  }

  /** Splinters, planks and a puff of dust. */
  _burst(item, point) {
    const rng = this.combat.rng;
    const size = item.box.getSize(_size);
    const s = Math.max(size.x, size.y, size.z);
    for (let i = 0; i < 26; i++) {
      _v.set((rng.next() - 0.5) * 5, 1.5 + rng.next() * 4, (rng.next() - 0.5) * 5);
      _p.set(
        item.center.x + (rng.next() - 0.5) * size.x,
        item.center.y + (rng.next() - 0.5) * size.y,
        item.center.z + (rng.next() - 0.5) * size.z
      );
      this.combat.particles.spawn({
        position: _p, velocity: _v, kind: PKIND.DEBRIS,
        size: 0.03 + rng.next() * 0.09 * s,
        color: [0.55, 0.42, 0.28],
        alpha: 1, life: 1.4 + rng.next() * 1.2,
        drag: 0.6, gravity: 9.8, spin: (rng.next() - 0.5) * 14, fade: 0
      });
    }
    for (let i = 0; i < 6; i++) {
      _v.set((rng.next() - 0.5) * 1.6, 0.6 + rng.next() * 1.2, (rng.next() - 0.5) * 1.6);
      this.combat.particles.spawn({
        position: point, velocity: _v, kind: PKIND.SMOKE,
        size: 0.35 + rng.next() * 0.4, color: [0.62, 0.55, 0.44],
        alpha: 0.45, life: 1.6 + rng.next(), drag: 1.8, gravity: 0.2,
        growth: 2.6, spin: (rng.next() - 0.5) * 1.0, fade: 1
      });
    }
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _size = new THREE.Vector3();
