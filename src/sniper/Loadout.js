import { Weapon } from '../weapons/Weapon.js';
import { SNIPER_RIFLES, SNIPER_LOADOUT } from './SniperWeapons.js';
import { SNIPER_MODELS } from './SniperGeometry.js';

/**
 * SNIPER WEB — the rifles the player carries, one in the hands at a time.
 *
 * Each rifle is its own `Weapon` with its own magazine and reserve, so
 * switching away mid-magazine and back finds the gun as it was left. The
 * game only ever talks to `active`; this class swaps which one that is and
 * tells the viewmodel to draw the matching rifle.
 */
export class Loadout {
  constructor({ audio, viewModel, player, combat, ids = SNIPER_LOADOUT }) {
    this.vm = viewModel;
    this.weapons = ids.map((id, i) => new Weapon({
      audio, viewModel, player, combat, spec: SNIPER_RIFLES[id], seed: 0x5a10 + i * 97
    }));
    this.index = 0;
    this.switches = 0;
    this.vm.setModel(SNIPER_MODELS[this.active.spec.model]);
  }

  get active() { return this.weapons[this.index]; }

  /** Set the same fire callback on every rifle. */
  set onFire(fn) { for (const w of this.weapons) w.onFire = fn; }

  /**
   * Bring up slot `i`. Returns the new weapon, or null when nothing changed
   * (already in the hands, no such slot).
   */
  select(i) {
    if (i === this.index || i < 0 || i >= this.weapons.length) return null;
    this.active.holster();
    this.index = i;
    const next = this.active;
    this.vm.setModel(SNIPER_MODELS[next.spec.model]);
    next.draw();
    this.switches++;
    return next;
  }

  /** Respawn: every rifle full, the first one in the hands. */
  resetAll() {
    for (const w of this.weapons) w.refill();
    if (this.index !== 0) {
      this.active.holster();
      this.index = 0;
      this.vm.setModel(SNIPER_MODELS[this.active.spec.model]);
    }
    return this.active;
  }
}
