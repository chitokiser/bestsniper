import { test, expect } from '@playwright/test';
import { boot, snapshot } from './helpers.js';

/**
 * SNIPER WEB — PHASE 1: the Mountain Watch battlefield.
 *
 * Everything here reads state straight out of the booted game rather than
 * waiting on simulated time, so the suite holds on slow software renderers
 * as well as on a real GPU.
 */

test.describe('mountain map', () => {
  test('boots clean on its own terrain, with the player on the ridge', async ({ page }) => {
    const session = await boot(page, '?map=mountain&auto=1');
    const snap = await snapshot(page);
    const built = await page.evaluate(() => {
      const g = window.__game;
      return {
        map: g.world.mapId,
        far: g.camera.far,
        colliderTris: g.world.bvh.soup.count,
        nav: g.nav.stats(),
        spawnsA: g.world.spawns.A.length,
        spawnsB: g.world.spawns.B.length,
        buildings: g.world.buildings.length,
        groundUnderPlayer: g.world.groundAt(g.player.controller.position.x, g.player.controller.position.z)
      };
    });

    expect(snap.state).toBe('playing');
    expect(snap.map).toBe('mountain');
    expect(built.map).toBe('mountain');
    expect(built.far).toBeGreaterThanOrEqual(2000);
    expect(built.colliderTris).toBeGreaterThan(50000);
    expect(built.nav.walkable).toBeGreaterThan(20000);
    expect(built.spawnsA).toBeGreaterThan(2);
    expect(built.spawnsB).toBeGreaterThan(2);
    expect(built.buildings).toBeGreaterThanOrEqual(4);
    expect(snap.ai.aliveB).toBe(6);

    // Deployed on the southern ridge, standing on the ground rather than in it.
    const [, y, z] = snap.player.position;
    expect(z).toBeLessThan(-250);
    expect(y).toBeGreaterThan(30);
    expect(Math.abs(y - built.groundUnderPlayer)).toBeLessThan(1.5);
    session.assertClean();
  });

  test('the ridge sees the outpost at sniping range', async ({ page }) => {
    await boot(page, '?map=mountain');
    const sight = await page.evaluate(() => {
      const g = window.__game;
      const THREE_V = g.player.eye.constructor;
      const target = new THREE_V(0, 3, -48);        // the outpost gate
      return g.world.playerSpawns.map((s) => {
        const eye = new THREE_V(s.x, s.y + 1.6, s.z);
        return { distance: eye.distanceTo(target), clear: !g.world.bvh.occluded(eye, target) };
      });
    });
    expect(sight.length).toBeGreaterThan(2);
    for (const s of sight) expect(s.distance).toBeGreaterThan(220);
    // Trees may screen a firing position or two, but most must have a lane.
    expect(sight.filter((s) => s.clear).length).toBeGreaterThanOrEqual(Math.ceil(sight.length / 2));
  });

  test('terrain collides everywhere the player can walk, and walls fence it in', async ({ page }) => {
    await boot(page, '?map=mountain');
    const probe = await page.evaluate(() => {
      const g = window.__game;
      const V = g.player.eye.constructor;
      const down = new V(0, -1, 0);
      const misses = [];
      let onGround = 0, total = 0;
      for (let x = -240; x <= 240; x += 40) {
        for (let z = -320; z <= 200; z += 40) {
          const ground = g.world.groundAt(x, z);
          const hit = g.world.bvh.raycast(new V(x, ground + 30, z), down, 80);
          if (!hit.hit) { misses.push([x, z]); continue; }
          total++;
          // A trunk or a boulder may stand on the sample point; the rest must
          // be the terrain mesh within a hand's width of the analytic height.
          if (Math.abs(hit.point.y - ground) < 0.5) onGround++;
        }
      }
      // Walk a ray out of the play area in each direction: it must stop.
      const fence = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => {
        const o = new V(0, g.world.groundAt(0, -60) + 2, -60);
        return g.world.bvh.raycast(o, new V(dx, 0, dz), 2000).hit;
      });
      return { misses, onGround: onGround / Math.max(total, 1), fence };
    });
    expect(probe.misses).toEqual([]);
    expect(probe.onGround).toBeGreaterThan(0.85);
    expect(probe.fence).toEqual([true, true, true, true]);
  });

  test('loads its GLB models and requests nothing but its own files', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const session = await boot(page, '?map=mountain');
    const report = await page.evaluate(() => ({
      assets: window.__game.assetReport,
      lanterns: window.__game.world.generator.lanternsPlaced
    }));
    expect(report.assets.requested).toContain('lantern');
    expect(report.assets.failures).toEqual([]);
    expect(report.lanterns).toBeGreaterThan(0);

    const origin = new URL(page.url()).origin;
    const external = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(external).toEqual([]);
    const local = requests.filter((u) => u.startsWith(origin)).map((u) => new URL(u).pathname);
    for (const p of local) expect(p).toMatch(/^\/(|index\.html|game\.js|game\.css|favicon\.ico|assets\/[\w/-]+\.glb)$/);
    session.assertClean();
  });

  test('a model that fails to load falls back instead of breaking the map', async ({ page }) => {
    await page.route('**/assets/**', (route) => route.abort());
    const session = await boot(page, '?map=mountain&auto=1');
    const report = await page.evaluate(() => ({
      failures: window.__game.assetReport.failures.length,
      lanterns: window.__game.world.generator.lanternsPlaced,
      state: window.__game.state
    }));
    expect(report.failures).toBeGreaterThan(0);
    expect(report.lanterns).toBe(0);
    expect(report.state).toBe('playing');
    // The aborted fetch itself is logged by the browser; nothing else may be.
    const real = session.errors.filter((e) => !/Failed to load resource|user gesture|Pointer Lock|AudioContext/.test(e));
    expect(real).toEqual([]);
  });

  test('renders a lit, non-blank frame across the valley', async ({ page }) => {
    await boot(page, '?map=mountain&auto=1');
    const stats = await page.evaluate(async () => {
      window.__harness.freezeAI();
      window.__harness.aimAt(0, 2, 0);
      const { data: d } = await window.__harness.capture(160, 90);
      let sum = 0, min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += l; min = Math.min(min, l); max = Math.max(max, l);
      }
      return { mean: sum / (d.length / 4), range: max - min };
    });
    expect(stats.mean).toBeGreaterThan(40);
    expect(stats.mean).toBeLessThan(230);
    expect(stats.range).toBeGreaterThan(60);
  });
});

test.describe('default map is unchanged', () => {
  test('no map parameter still builds the original district', async ({ page }) => {
    await boot(page, '?auto=1');
    const snap = await snapshot(page);
    const far = await page.evaluate(() => window.__game.camera.far);
    expect(snap.map).toBe('market');
    expect(far).toBe(600);
  });
});
