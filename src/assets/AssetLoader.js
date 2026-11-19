import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * GLB loading for SNIPER WEB.
 *
 * The renderer draws every static surface with one custom world shader that
 * reads its textures from baked `sampler2DArray` layers, so a model's own PBR
 * material cannot be used as-is. Instead each model is flattened into plain
 * geometry plus a per-vertex colour sampled from its base-colour texture; the
 * map then merges it into the static batches with `GeometryBuilder.addMesh`,
 * which gives it shadows, TAA velocity, fog and collision for free.
 *
 * Every asset is optional. A failed fetch (offline, `file://`, a missing file)
 * resolves to null and the map falls back to its procedural stand-in.
 */

/** Approximate linear albedo of the neutral layer the tints multiply. */
const NEUTRAL_ALBEDO = 0.70;
const SAMPLE_SIZE = 256;

/** Every model the game may request. Paths are relative to the page. */
export const ASSET_MANIFEST = {
  lantern: { url: './assets/props/lantern.glb', height: 2.6 },
  // Kenney Nature Kit (CC0). Normalised to 1 m tall; the map scales each one.
  pineTallA: { url: './assets/nature/tree_pineTallA_detailed.glb', height: 1 },
  pineTallB: { url: './assets/nature/tree_pineTallB_detailed.glb', height: 1 },
  pineDefaultA: { url: './assets/nature/tree_pineDefaultA.glb', height: 1 },
  pineDefaultB: { url: './assets/nature/tree_pineDefaultB.glb', height: 1 },
  pineRoundC: { url: './assets/nature/tree_pineRoundC.glb', height: 1 },
  pineRoundE: { url: './assets/nature/tree_pineRoundE.glb', height: 1 },
  rockLargeA: { url: './assets/nature/rock_largeA.glb', height: 1 },
  rockLargeB: { url: './assets/nature/rock_largeB.glb', height: 1 },
  rockLargeC: { url: './assets/nature/rock_largeC.glb', height: 1 },
  rockLargeD: { url: './assets/nature/rock_largeD.glb', height: 1 },
  rockTallA: { url: './assets/nature/rock_tallA.glb', height: 1 },
  rockTallC: { url: './assets/nature/rock_tallC.glb', height: 1 },
  bushLarge: { url: './assets/nature/plant_bushLarge.glb', height: 1 },
  bushDetailed: { url: './assets/nature/plant_bushDetailed.glb', height: 1 },
  stumpOld: { url: './assets/nature/stump_old.glb', height: 1 },
  log: { url: './assets/nature/log.glb', height: 1 }
};

/** Asset groups the maps draw variants from. */
export const ASSET_GROUPS = {
  pines: ['pineTallA', 'pineTallB', 'pineDefaultA', 'pineDefaultB', 'pineRoundC', 'pineRoundE'],
  rocks: ['rockLargeA', 'rockLargeB', 'rockLargeC', 'rockLargeD', 'rockTallA', 'rockTallC'],
  shrubs: ['bushLarge', 'bushDetailed', 'stumpOld', 'log']
};

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Read an image back as pixels so colours can be sampled at vertex UVs. */
function readPixels(image) {
  if (!image || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null;
  }
}

function bakeTints(geometry, material, pixelCache) {
  const count = geometry.attributes.position.count;
  const tints = new Float32Array(count * 3);
  const factor = material?.color ?? new THREE.Color(1, 1, 1);   // already linear
  const map = material?.map;
  let pixels = null;
  if (map?.image) {
    pixels = pixelCache.get(map.image);
    if (pixels === undefined) {
      pixels = readPixels(map.image);
      pixelCache.set(map.image, pixels);
    }
  }
  const uv = geometry.attributes.uv;
  for (let i = 0; i < count; i++) {
    let r = 1, g = 1, b = 1;
    if (pixels && uv) {
      // glTF UVs have v pointing down the image, which is the canvas order.
      let u = uv.getX(i) % 1, v = uv.getY(i) % 1;
      if (u < 0) u += 1;
      if (v < 0) v += 1;
      const px = Math.min(SAMPLE_SIZE - 1, (u * SAMPLE_SIZE) | 0);
      const py = Math.min(SAMPLE_SIZE - 1, (v * SAMPLE_SIZE) | 0);
      const o = (py * SAMPLE_SIZE + px) * 4;
      r = srgbToLinear(pixels[o] / 255);
      g = srgbToLinear(pixels[o + 1] / 255);
      b = srgbToLinear(pixels[o + 2] / 255);
    }
    tints[i * 3] = Math.min(1.6, (r * factor.r) / NEUTRAL_ALBEDO);
    tints[i * 3 + 1] = Math.min(1.6, (g * factor.g) / NEUTRAL_ALBEDO);
    tints[i * 3 + 2] = Math.min(1.6, (b * factor.b) / NEUTRAL_ALBEDO);
  }
  return tints;
}

/**
 * Load one GLB and flatten it into `{ parts: [{ geometry, matrix, tints }], size }`.
 * The model is rescaled so its height matches `height` metres and rebased so
 * its footprint centre sits on the origin at y = 0.
 */
export async function loadModel(url, { height = null } = {}) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = height && size.y > 0 ? height / size.y : 1;
  const rebase = new THREE.Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(
      -(box.min.x + box.max.x) * 0.5, -box.min.y, -(box.min.z + box.max.z) * 0.5));

  const parts = [];
  const pixelCache = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    parts.push({
      material: material?.name ?? '',
      geometry: obj.geometry,
      matrix: new THREE.Matrix4().multiplyMatrices(rebase, obj.matrixWorld),
      tints: bakeTints(obj.geometry, material, pixelCache)
    });
  });
  return { parts, size: size.multiplyScalar(scale), url };
}

/**
 * Load a set of manifest entries. Never rejects: each failure is recorded and
 * that entry comes back null.
 */
export async function loadAssets(names) {
  const assets = {};
  const failures = [];
  await Promise.all(names.map(async (name) => {
    const entry = ASSET_MANIFEST[name];
    if (!entry) { assets[name] = null; failures.push(`${name}: not in manifest`); return; }
    try {
      assets[name] = await loadModel(entry.url, entry);
    } catch (err) {
      assets[name] = null;
      failures.push(`${name}: ${err?.message ?? err}`);
    }
  }));
  return { assets, failures };
}

/**
 * Merge a loaded model into a GeometryBuilder at a transform.
 *
 * `opts.palette` maps a glTF material name to `{ layer, tint, collide,
 * surface }`, which replaces that part's baked colours with one of the world's
 * own materials: stylised source colours (a teal pine, an orange rock) become
 * bark, needles and stone that sit in the same light as everything else.
 */
export function placeModel(builder, model, matrix, opts = {}) {
  const { palette = null, ...rest } = opts;
  for (const part of model.parts) {
    const m = new THREE.Matrix4().multiplyMatrices(matrix, part.matrix);
    const look = palette ? (palette[part.material] ?? palette['*']) : null;
    if (look) builder.addMesh(part.geometry, m, { layer: 1, wear: 0.1, ...rest, ...look });
    else builder.addMesh(part.geometry, m, { layer: 1, wear: 0.1, ...rest, tints: part.tints });
  }
}
