import { loadGltf } from './ImportedModels.js';
import { buildImportedRifle } from './ImportedRifle.js';
import { buildImportedSoldier } from './ImportedSoldier.js';
import { SNIPER_MODELS } from './SniperGeometry.js';

/**
 * SNIPER WEB — detailed imported models for the sniper mode.
 *
 * Only files listed here are ever requested, so an entry is added together
 * with its file (and its row in ASSET_LICENSES.md). Anything that fails to
 * load or fit falls back to the procedural model it would have replaced.
 *
 *   rifles.<id>  { url, butt, flip, roll }  replaces SNIPER_MODELS[id]
 *   soldier      { url, facing, tints }     replaces the procedural enemy
 */
export const REAL_ASSETS = {
  rifles: {
    kestrel: { url: './assets/rifles/m24.glb' },
    vanta: { url: './assets/rifles/vss.glb', flip: true },
    halberd: { url: './assets/rifles/l96a1.glb' }
  },
  soldier: { url: './assets/soldier/swat.glb', facing: '+z', weapon: './assets/soldier/ak47.glb' }
};

/** Team colour washes over the imported uniform, so sides stay readable. */
const TEAM_TINT = { A: [1.0, 1.0, 1.0], B: [0.86, 0.92, 1.04] };

export async function loadRealAssets(manifest = REAL_ASSETS) {
  const report = { loaded: [], failures: [] };
  const models = { ...SNIPER_MODELS };
  let soldierOverride = null;

  const jobs = Object.entries(manifest.rifles).map(async ([id, cfg]) => {
    try {
      const gltf = await loadGltf(cfg.url);
      models[id] = buildImportedRifle(gltf, SNIPER_MODELS[id], cfg);
      report.loaded.push(`rifle:${id}`);
    } catch (err) {
      report.failures.push(`rifle:${id}: ${err?.message ?? err}`);
    }
  });
  if (manifest.soldier) {
    jobs.push((async () => {
      try {
        const gltf = await loadGltf(manifest.soldier.url);
        let weapon = null;
        if (manifest.soldier.weapon) {
          try { weapon = await loadGltf(manifest.soldier.weapon); } catch (err) {
            report.failures.push(`soldier weapon: ${err?.message ?? err}`);
          }
        }
        const cache = new Map();
        soldierOverride = (team, variant, rng) => {
          // One build per team; variants share it.
          if (!cache.has(team)) {
            cache.set(team, buildImportedSoldier(gltf, {
              team, variant, rng, facing: manifest.soldier.facing, tint: TEAM_TINT[team] ?? null, weapon, weaponFlip: manifest.soldier.weaponFlip
            }));
          }
          const s = cache.get(team);
          return { geometry: s.geometry, texture: s.texture };
        };
        // Build once now so a bad model is reported and falls back here, not mid-spawn.
        const probe = buildImportedSoldier(gltf, { team: 'A', rng: { next: () => 0.5 }, facing: manifest.soldier.facing, weapon });
        report.soldier = probe.report;
        probe.geometry.dispose();
        probe.texture.dispose();
        report.loaded.push('soldier');
      } catch (err) {
        soldierOverride = null;
        report.failures.push(`soldier: ${err?.message ?? err}`);
      }
    })());
  }
  await Promise.all(jobs);
  return { models, soldierOverride, report };
}
