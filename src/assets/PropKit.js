import * as THREE from 'three';
import { loadGltf, collectMeshes, buildAtlas, flatten, toGeometry } from '../sniper/ImportedModels.js';

/**
 * SNIPER WEB — photo-scanned props from Poly Haven (CC0).
 *
 * The Kenney models in AssetLoader are flat-coloured, so baking one colour per
 * vertex loses nothing. These props are photo textures: per-vertex colour
 * would smear them into mush. Instead every prop's base-colour map goes into
 * one atlas that the world shader reads through `uModelMap` (a vertex with a
 * negative `aLayer` samples it; see world.glsl.js), and each prop is
 * flattened once into engine-layout geometry with its UVs already moved into
 * the atlas. The map then copies that geometry into its static batches, so a
 * prop costs no extra draw calls.
 *
 * Sizes are real-world metres as Poly Haven authors them; `scale` enlarges
 * the few that are used as something bigger (pebble scans as boulders).
 * Every file is optional: a failed load leaves that prop out.
 */
export const PROP_KIT = {
  barrel: { url: './assets/polyhaven/Barrel_01.glb' },
  barrelRusty: { url: './assets/polyhaven/barrel_03.glb' },
  crate: { url: './assets/polyhaven/wooden_crate_01.glb' },
  crateLong: { url: './assets/polyhaven/wooden_crate_02.glb' },
  ammoCrate: { url: './assets/polyhaven/old_military_crate.glb' },
  militaryCrate: { url: './assets/polyhaven/wooden_military_crate.glb' },
  jerrycan: { url: './assets/polyhaven/metal_jerrycan_green.glb' },
  barrier: { url: './assets/polyhaven/concrete_road_barrier_02.glb' },
  coveredCar: { url: './assets/polyhaven/covered_car.glb' },
  tyre: { url: './assets/polyhaven/old_tyre.glb' },
  propane: { url: './assets/polyhaven/propane_tank.glb' },
  stump: { url: './assets/polyhaven/tree_stump_01.glb' },
  boulderA: { url: './assets/polyhaven/rock_07.glb', scale: 9 },
  boulderB: { url: './assets/polyhaven/rock_09.glb', scale: 16 },
  plasticCrate: { url: './assets/polyhaven/plastic_crate_03.glb' },
  cardboard: { url: './assets/polyhaven/cardboard_box_01.glb' }
};

export const PROP_KIT_NAMES = Object.keys(PROP_KIT);

/**
 * Load the kit. Resolves to `{ texture, props, failures }`, where
 * `props[name] = { geometry, size }` with the footprint centred on the origin
 * at y = 0, or `null` when nothing loaded at all.
 */
export async function loadPropKit(names = PROP_KIT_NAMES) {
  const failures = [];
  const loaded = [];
  await Promise.all(names.map(async (name) => {
    const entry = PROP_KIT[name];
    if (!entry) { failures.push(`${name}: not in kit`); return; }
    try {
      const gltf = await loadGltf(entry.url);
      loaded.push({ name, entry, meshes: collectMeshes(gltf.scene) });
    } catch (err) {
      failures.push(`${name}: ${err?.message ?? err}`);
    }
  }));
  if (!loaded.length) return { texture: null, props: {}, failures };

  // One atlas for the whole kit, in a stable order so it is the same every load.
  loaded.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
  const atlas = buildAtlas(loaded.flatMap((l) => l.meshes), { cellMax: 512 });

  const props = {};
  for (const { name, entry, meshes } of loaded) {
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    const s = entry.scale ?? 1;
    const rebase = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(
      -(box.min.x + box.max.x) * 0.5, -box.min.y, -(box.min.z + box.max.z) * 0.5));
    const flat = flatten(meshes, atlas, { transform: rebase });
    const geometry = toGeometry(flat);
    geometry.computeBoundingBox();
    props[name] = { geometry, size: geometry.boundingBox.getSize(new THREE.Vector3()) };
  }
  return { texture: atlas.texture, props, failures };
}
