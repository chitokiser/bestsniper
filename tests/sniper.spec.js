import { test, expect } from '@playwright/test';
import { boot, snapshot } from './helpers.js';

/**
 * SNIPER WEB — PHASE 2: the three sniper rifles.
 *
 * Weapon mechanics are checked by pausing the game and stepping the weapon by
 * hand at the simulation's own 120 Hz, so every timing below is in simulated
 * seconds and the suite means the same thing on a software renderer as on a
 * GPU.
 */

/** Pause the match and return helpers that drive the active weapon directly. */
const STEPPER = `
  const g = window.__game;
  window.__harness.pause();
  const dt = 1 / 120;
  let t = g.time;
  const step = (w, seconds) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) { t += dt; w.update(dt, t); }
  };
  const pull = (w) => { w.setTrigger(true); step(w, dt); w.setTrigger(false); step(w, dt); };
`;

test.describe('sniper rifles', () => {
  test('the mountain deploys the player with three rifles', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    const snap = await snapshot(page);
    const state = await page.evaluate(() => {
      const g = window.__game;
      return {
        ids: g.loadout.weapons.map((w) => w.spec.id),
        hudName: document.querySelector('#ammo .weapon .name').textContent,
        hudMode: document.querySelector('#ammo .mode').textContent
      };
    });
    expect(snap.mode).toBe('sniper');
    expect(snap.weapon.id).toBe('kestrel');
    expect(snap.weapon.ammo).toBe(5);
    expect(state.ids).toEqual(['kestrel', 'vanta', 'halberd']);
    expect(state.hudName).toBe('KESTREL R7');
    expect(state.hudMode).toBe('BOLT');
    session.assertClean();
  });

  test('bolt, semi-auto and reload behave like the rifles they are', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    const r = await page.evaluate(new Function(`${STEPPER}
      const out = {};
      // ---- bolt action: one round, then the bolt has to be worked.
      let w = g.weapon;
      pull(w);
      out.afterShot = { ammo: w.ammo, cycling: w.cycling };
      w.setTrigger(true); step(w, 0.4); w.setTrigger(false);
      pull(w);
      out.duringCycle = { ammo: w.ammo, cycling: w.cycling };
      step(w, w.spec.boltTime);
      out.afterCycle = { cycling: w.cycling, cycles: w.boltCycles };
      pull(w);
      out.secondShot = w.ammo;

      // ---- empty the magazine, then an empty reload chambers a round.
      for (let i = 0; i < 6 && w.ammo > 0; i++) { step(w, w.spec.boltTime + 0.05); pull(w); }
      out.emptied = { ammo: w.ammo, cycling: w.cycling };
      const reserve = w.reserve;
      out.reloadStarted = w.startReload();
      step(w, w.spec.reloadEmpty + 0.05);
      out.reloaded = { ammo: w.ammo, reserve: w.reserve, before: reserve, reloading: w.reloading };

      // ---- semi-auto: once per pull, never faster than its cyclic rate.
      w = g.loadout.select(1);
      g.weapon = w;
      out.drawing = w.canFire();
      step(w, w.spec.drawTime + 0.02);
      w.setTrigger(true); step(w, 1.0); w.setTrigger(false); step(w, 0.05);
      out.heldOneSecond = 10 - w.ammo;
      for (let i = 0; i < 3; i++) { w.setTrigger(true); step(w, dt); w.setTrigger(false); step(w, 0.01); }
      out.rapidPulls = 10 - w.ammo;
      out.semi = { cycling: w.cycling, mode: w.hudState().mode };

      // ---- the bolt gun kept its magazine while it was put away.
      out.kestrelKept = g.loadout.weapons[0].ammo;
      return out;
    `));

    expect(r.afterShot).toEqual({ ammo: 4, cycling: true });
    expect(r.duringCycle.ammo).toBe(4);                // no second round mid-cycle
    expect(r.afterCycle).toEqual({ cycling: false, cycles: 1 });
    expect(r.secondShot).toBe(3);
    expect(r.emptied).toEqual({ ammo: 0, cycling: false });
    expect(r.reloadStarted).toBe(true);
    expect(r.reloaded.ammo).toBe(5);
    expect(r.reloaded.reserve).toBe(r.reloaded.before - 5);
    expect(r.reloaded.reloading).toBe(false);
    expect(r.drawing).toBe(false);                     // cannot fire mid-draw
    expect(r.heldOneSecond).toBe(1);                   // holding the trigger is one shot
    expect(r.rapidPulls).toBe(2);                      // 0.2 s between rounds at 300 rpm
    expect(r.semi).toEqual({ cycling: false, mode: 'SEMI' });
    expect(r.kestrelKept).toBe(5);
    session.assertClean();
  });

  test('number keys switch rifles and the HUD follows', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    await page.evaluate(async () => {
      const h = window.__harness;
      window.__game.player.spawnProtect = 1e9;
      await h.tap('Digit3');
      await h.wait(0.2);
    });
    let snap = await snapshot(page);
    expect(snap.weapon.id).toBe('halberd');
    expect(snap.weapon.slot).toBe(2);
    expect(snap.weapon.ammo).toBe(5);
    // The HUD is refreshed per rendered frame, not per simulation step.
    await page.waitForFunction(
      () => document.querySelector('#ammo .weapon .name').textContent === 'HALBERD .50',
      null, { timeout: 30_000 });

    await page.evaluate(async () => { await window.__harness.tap('Digit1'); await window.__harness.wait(0.2); });
    snap = await snapshot(page);
    expect(snap.weapon.id).toBe('kestrel');
    session.assertClean();
  });

  test('aiming a scoped rifle magnifies four times and slows the mouse', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    // Hold the rifle fully shouldered with the match paused: the raise itself
    // is the original ADS code, and the zoom is applied per rendered frame, so
    // this checks the scope without waiting on simulated time.
    await page.evaluate(() => {
      window.__harness.pause();
      window.__game.player.adsBlend = 1;
    });
    await page.waitForFunction(() => window.__game.scopeBlend > 0.99, null, { timeout: 30_000 });
    const scoped = await page.evaluate(() => {
      const g = window.__game;
      const tanRatio = Math.tan((g._baseFov * Math.PI) / 360) / Math.tan((g.camera.fov * Math.PI) / 360);
      return {
        tanRatio,
        lookScale: g.player.lookScale,
        viewmodel: g.viewModel.root.visible,
        overlay: document.querySelector('#scope').classList.contains('on')
      };
    });
    expect(scoped.tanRatio).toBeGreaterThan(3.9);
    expect(scoped.tanRatio).toBeLessThan(4.1);
    expect(scoped.lookScale).toBeLessThan(0.35);
    expect(scoped.viewmodel).toBe(false);
    expect(scoped.overlay).toBe(true);

    await page.evaluate(() => { window.__game.player.adsBlend = 0; });
    await page.waitForFunction(() => window.__game.scopeBlend === 0, null, { timeout: 30_000 });
    const back = await page.evaluate(() => ({
      viewmodel: window.__game.viewModel.root.visible,
      lookScale: window.__game.player.lookScale
    }));
    expect(back.viewmodel).toBe(true);
    expect(back.lookScale).toBeCloseTo(1, 3);
    session.assertClean();
  });

  test('the mouse wheel steps the scope from 4x up to 8x and back', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    await page.evaluate(() => { window.__harness.pause(); window.__game.player.adsBlend = 1; });
    await page.waitForFunction(() => window.__game.scopeBlend > 0.99, null, { timeout: 30_000 });
    const label = () => document.querySelector('#scope .power').textContent;
    const ratio = () => {
      const g = window.__game;
      return Math.tan((g._baseFov * Math.PI) / 360) / Math.tan((g.camera.fov * Math.PI) / 360);
    };
    expect(await page.evaluate(label)).toBe('4x');
    // Wheel up twice: 6x, then 8x, and no further.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { window.__game.input.wheel = -1; });
      await page.waitForFunction(() => window.__game.input.wheel === 0, null, { timeout: 30_000 });
    }
    expect(await page.evaluate(label)).toBe('8x');
    // The picture eases toward the new power over rendered frames (slowly on
    // this software renderer, whose long frames are clamped to 1/120 s).
    await page.waitForFunction(new Function('return (' + ratio.toString() + ')() > 4.6'), null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__game.scopeZoom)).toBeLessThanOrEqual(8);
    // Wheel down steps back out.
    await page.evaluate(() => { window.__game.input.wheel = 1; });
    await page.waitForFunction(() => document.querySelector('#scope .power').textContent === '6x', null, { timeout: 30_000 });
    session.assertClean();
  });

  test('rifle rounds carry past the carbine range and the boundary wall takes no marks', async ({ page }) => {
    await boot(page, '?map=mountain');
    const r = await page.evaluate(() => {
      const g = window.__game;
      window.__harness.pause();
      const V = g.player.eye.constructor;
      // A firing point on the ridge with a clear line to the valley floor
      // well past the outpost: more than 320 m away.
      const target = new V(0, g.world.groundAt(0, 120), 120);
      let origin = null;
      for (const s of g.world.playerSpawns) {
        const eye = new V(s.x, s.y + 1.6, s.z);
        if (!g.world.bvh.occluded(eye, new V(target.x, target.y + 0.3, target.z))) { origin = eye; break; }
      }
      if (!origin) return { skipped: true };
      const dir = target.clone().sub(origin).normalize();
      const fire = (spec) => g.combat.fireBullet({
        origin, direction: dir, owner: g.player, team: 'A', damage: 10, spec
      });
      const distance = origin.distanceTo(target);
      const carbine = fire({});
      const rifle = fire(g.loadout.active.spec);

      // Straight north, high over every hill, into the invisible wall.
      const decals = window.__harness.snapshot().fx.decals;
      const wall = g.combat.fireBullet({
        origin: new V(0, 260, 0), direction: new V(0, 0, 1), owner: g.player, team: 'A',
        damage: 10, spec: g.loadout.active.spec
      });
      return { distance, carbine, rifle, wall, decalsAdded: window.__harness.snapshot().fx.decals - decals };
    });
    if (r.skipped) test.skip(true, 'no clear lane from the ridge');
    expect(r.distance).toBeGreaterThan(320);
    expect(r.carbine).toBe(false);
    expect(r.rifle).toBe(true);
    expect(r.wall).toBe(false);
    expect(r.decalsAdded).toBe(0);
  });
});

test.describe('mountain props', () => {
  test('crates take bullet holes, then break, and stop blocking shots', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    const r = await page.evaluate(() => {
      const g = window.__game;
      window.__harness.pause();
      const d = g.destructibles;
      const V = g.player.eye.constructor;
      // A bottom crate with one on top and a clear 9 m line to it.
      let crate = null, origin = null, dir = null;
      for (const c of d.items) {
        if (c.level !== 0 || !d.items.some((o) => o.stack === c.stack && o.level === 1)) continue;
        for (let k = 0; k < 8 && !crate; k++) {
          const a = (k / 8) * Math.PI * 2;
          const o = c.center.clone().add(new V(Math.cos(a) * 9, 0.4, Math.sin(a) * 9));
          const dd = c.center.clone().sub(o).normalize();
          const h = g.world.bvh.raycast(o, dd, 12);
          if (h.hit && d._byTri.get(h.triIndex) === c) { crate = c; origin = o; dir = dd; }
        }
        if (crate) break;
      }
      const spec = g.loadout.weapons[0].spec;           // KESTREL: 92 per round
      const shoot = () => g.combat.fireBullet({ origin, direction: dir, owner: g.player, team: 'A', damage: spec.damage, spec });
      const tracersBefore = g.combat.tracers.length;
      const ray = () => g.world.bvh.raycast(origin, dir, 30);
      const before = ray().t;
      shoot();
      const afterOne = { broken: crate.broken, decals: window.__harness.snapshot().fx.decals, tracer: g.combat.tracers.length > tracersBefore };
      shoot();
      const above = d.items.filter((o) => o.stack === crate.stack && o.level > 0).every((o) => o.broken);
      const after = ray();
      return { before, afterOne, broken: crate.broken, above, afterT: after.hit ? after.t : Infinity, count: d.brokenCount };
    });
    expect(r.afterOne.broken).toBe(false);          // one rifle round leaves it standing, holed
    expect(r.afterOne.decals).toBeGreaterThan(0);
    expect(r.afterOne.tracer).toBe(true);           // rifle rounds always show a trace
    expect(r.broken).toBe(true);                    // the second one breaks it
    expect(r.above).toBe(true);                     // and the crates on top come down with it
    expect(r.count).toBeGreaterThanOrEqual(2);
    expect(r.afterT).toBeGreaterThan(r.before + 0.2); // the ray now goes past where it stood
    session.assertClean();
  });
});

test.describe('aim', () => {
  test('a scoped rifle round lands where the reticle is, not where recoil throws the view', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    const r = await page.evaluate(new Function(STEPPER + `
      const p = g.player, d = g.destructibles;
      const eye = p.eye.clone();
      // A crate the ridge can see, a few hundred metres out.
      const crate = d.items.find((c) => {
        const dir = c.center.clone().sub(eye); const dist = dir.length(); dir.normalize();
        const h = g.world.bvh.raycast(eye, dir, dist + 5);
        return h.hit && d._byTri.get(h.triIndex) === c;
      });
      const dir = crate.center.clone().sub(eye).normalize();
      const yaw = Math.atan2(-dir.x, -dir.z), pitch = Math.asin(dir.y);
      p.adsBlend = 1;
      // The body's aim is a hair off; the camera (breathing sway) is dead on.
      p.yaw = yaw; p.pitch = pitch + 0.003;
      p.viewYaw = yaw; p.viewPitch = pitch;
      const w = g.loadout.active;
      // Straight-line round for this check; drop and wind have their own test.
      w.spec.drag = undefined;
      step(w, 2);
      const pitchBefore = p.pitch;
      pull(w);
      return {
        distance: eye.distanceTo(crate.center),
        health: crate.health, broken: crate.broken,
        kicked: p.pitch - pitchBefore
      };
    `));
    expect(r.distance).toBeGreaterThan(150);
    expect(r.kicked).toBeGreaterThan(0.005);          // the shot still kicks the view up
    expect(r.broken || r.health < 100).toBe(true);    // but the round went where the reticle was
    session.assertClean();
  });
});

test.describe('ballistics', () => {
  test('rifle rounds drop, take time to arrive, drift in the wind and are zeroed at 100 m', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1&wind=0');
    const r = await page.evaluate(() => {
      const g = window.__game;
      window.__harness.pause();
      const b = g.combat.ballistics;
      const V = g.player.eye.constructor;
      const spec = g.loadout.weapons[0].spec;          // KESTREL, 820 m/s
      // High over the valley, flying north along +z: nothing to hit.
      const fly = (windX) => {
        b.wind.set(windX, 0, 0);
        const origin = new V(0, 450, -200);
        b.fire({ origin, direction: new V(0, 0, 1), owner: g.player, team: 'A', damage: 1, spec });
        const round = b.rounds[b.rounds.length - 1];
        const at = {};
        let t = 0;
        while (b.rounds.includes(round) && t < 3) {
          b.update(1 / 120); t += 1 / 120;
          const d = round.pos.z - origin.z;
          for (const mark of [100, 300]) {
            if (at[mark] === undefined && d >= mark) {
              // interpolate back to exactly `mark` metres along the path
              const k = (d - mark) / Math.max(1e-6, round.vel.z / 120);
              at[mark] = { y: round.pos.y - origin.y - (round.vel.y / 120) * k, x: round.pos.x - origin.x, t };
            }
          }
        }
        b.rounds.length = 0;
        return at;
      };
      const calm = fly(0);
      const breezy = fly(5);
      b.wind.set(0, 0, 0);
      return { calm, breezy };
    });
    // Zeroed at 100 m: back on the line of sight there (within 4 cm).
    expect(Math.abs(r.calm[100].y)).toBeLessThan(0.04);
    // At 300 m it has dropped a believable amount and taken a believable time.
    expect(r.calm[300].y).toBeLessThan(-0.25);
    expect(r.calm[300].y).toBeGreaterThan(-1.2);
    expect(r.calm[300].t).toBeGreaterThan(0.34);
    expect(r.calm[300].t).toBeLessThan(0.5);
    // A 5 m/s crosswind from the left pushes it right, by a holdable amount.
    expect(r.breezy[300].x).toBeGreaterThan(0.2);
    expect(r.breezy[300].x).toBeLessThan(1.5);
    expect(Math.abs(r.calm[300].x)).toBeLessThan(0.01);
    session.assertClean();
  });

  test('the scope drifts, holding breath steadies it, and the breath runs out', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1&wind=0');
    const r = await page.evaluate(() => {
      const g = window.__game;
      window.__harness.pause();
      const sw = g.sway, p = g.player;
      sw.reset();
      const run = (seconds, hold) => {
        let peak = 0;
        for (let t = 0; t < seconds; t += 1 / 60) {
          sw.update(1 / 60, 1, hold, p);
          peak = Math.max(peak, Math.hypot(sw.offsetPitch, sw.offsetYaw));
        }
        return peak;
      };
      const free = run(6, false);
      run(0.6, true);                       // settle into the hold
      const held = run(2, true);
      run(3, true);                         // keep holding past the limit
      const breathAfter = sw.breath;
      const winded = run(3, false);
      return { free, held, breathAfter, winded };
    });
    expect(r.free).toBeGreaterThan(0.0008);          // ~0.3 m at 300 m
    expect(r.held).toBeLessThan(r.free * 0.35);
    expect(r.breathAfter).toBeLessThan(0.1);
    expect(r.winded).toBeGreaterThan(r.free);        // out of breath: worse than resting
    session.assertClean();
  });

  test('a fired rifle round lands a moment later, not on the trigger pull', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1&wind=0');
    const r = await page.evaluate(() => {
      const g = window.__game;
      window.__harness.pause();
      const b = g.combat.ballistics, d = g.destructibles;
      const V = g.player.eye.constructor;
      // A crate with a clear line from 150 m, aimed with the right holdover.
      let crate = null, origin = null;
      for (const c of d.items) {
        const o = c.center.clone().add(new V(0, 25, -150));
        const dd = c.center.clone().sub(o).normalize();
        const h = g.world.bvh.raycast(o, dd, 200);
        if (h.hit && d._byTri.get(h.triIndex) === c) { crate = c; origin = o; break; }
      }
      if (!crate) return { skipped: true };
      const spec = g.loadout.weapons[2].spec;          // HALBERD: one round breaks a crate
      const dist = origin.distanceTo(crate.center);
      // Hold over by the drop the round will have at this distance.
      const t = dist / spec.muzzleVelocity;
      const aim = crate.center.clone().add(new V(0, 0.5 * 9.81 * t * t * 0.85, 0));
      b.fire({ origin, direction: aim.sub(origin).normalize(), owner: g.player, team: 'A', damage: spec.damage, spec });
      const brokenAtOnce = crate.broken;
      let steps = 0;
      while (b.rounds.length && steps < 600) { b.update(1 / 120); steps++; }
      return { brokenAtOnce, broken: crate.broken, flight: steps / 120, dist };
    });
    if (r.skipped) test.skip(true, 'no crate with a clear line');
    expect(r.brokenAtOnce).toBe(false);
    expect(r.broken).toBe(true);
    expect(r.flight).toBeGreaterThan(0.12);
    session.assertClean();
  });
});

test.describe('the carbine is still the default where it was', () => {
  test('the original district keeps the carbine', async ({ page }) => {
    await boot(page, '?auto=1');
    const snap = await snapshot(page);
    const modes = await page.evaluate(() => window.__game.weapon.fireModes.length);
    expect(snap.mode).toBe('carbine');
    expect(snap.weapon.name).toBe('MK18 CARBINE');
    expect(snap.weapon.ammo).toBe(30);
    expect(modes).toBe(3);
  });

  test('?mode=carbine overrides the mountain default', async ({ page }) => {
    await boot(page, '?map=mountain&mode=carbine&auto=1');
    const snap = await snapshot(page);
    expect(snap.mode).toBe('carbine');
    expect(snap.weapon.id).toBe('carbine');
  });
});
