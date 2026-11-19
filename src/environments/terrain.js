import { fbm2, smoothstep } from '../world/Noise.js';
import { LAYER } from '../world/MaterialLibrary.js';

/**
 * Mountain Watch terrain: one analytic height field shared by the mesh, the
 * spawn code, the nav bake and the AI's foot placement.
 *
 * Layout (metres, +z is north):
 *   - an enemy outpost on a levelled pad around the origin, at y = 0 so the
 *     procedural buildings, which assume a ground plane at zero, sit on it;
 *   - a long ridge to the south (z ≈ -290) roughly 50 m above the valley,
 *     which is where the player starts — about 300 m from the outpost;
 *   - rising hills east and west, a mountain wall to the north, and a ring of
 *     big peaks out to two kilometres that is only ever seen through haze.
 */

export const MOUNTAIN = {
  outpost: { x: 0, z: 0, flat: 62, blend: 34 },
  ridgeZ: -292,
  /** The finely meshed, collidable part of the world. */
  inner: { x0: -280, x1: 280, z0: -360, z1: 240 },
  /** Where the player may walk (invisible walls sit on this rectangle). */
  play: { x0: -255, x1: 255, z0: -335, z1: 215 },
  /** Where the AI lives and the nav grid is baked. */
  nav: { x0: -110, x1: 110, z0: -105, z1: 115 },
  far: 2000
};

function ridged(x, z) {
  return 1 - Math.abs(fbm2(x, z, 5, 0.5) * 2 - 1);
}

/** Terrain height before the outpost pad is levelled into it. */
function rawHeight(x, z) {
  let h = (fbm2(x * 0.004 + 3.1, z * 0.004 - 7.7, 4, 0.5) - 0.5) * 18;

  // The player's ridge: a long bank whose crest wanders a little along x.
  const crest = MOUNTAIN.ridgeZ + (fbm2(x * 0.006, 4.2, 3, 0.5) - 0.5) * 30;
  const dz = (z - crest) / 52;
  h += 52 * Math.exp(-dz * dz) * (0.82 + fbm2(x * 0.007 + 11, 1.3, 3, 0.5) * 0.36);
  // Behind the ridge the ground stays high instead of dropping into a trench.
  h += 38 * smoothstep(MOUNTAIN.ridgeZ + 10, MOUNTAIN.ridgeZ - 80, z);

  // Flanking hills and the mountain wall to the north.
  const ax = Math.abs(x);
  h += 62 * smoothstep(140, 330, ax) * (0.7 + fbm2(x * 0.01, z * 0.01 + 5, 3, 0.5) * 0.6);
  h += 85 * smoothstep(140, 420, z) * (0.75 + fbm2(x * 0.008 - 9, z * 0.008, 3, 0.5) * 0.5);

  // The far ring of peaks.
  const r = Math.hypot(x, z + 60);
  h += smoothstep(420, 1500, r) * (220 + 380 * ridged(x * 0.0016 + 2.7, z * 0.0016 - 1.9));

  // Ground-scale detail.
  h += (fbm2(x * 0.03 + 5, z * 0.03 - 3, 4, 0.5) - 0.5) * 3.2;
  h += (fbm2(x * 0.13 - 1, z * 0.13 + 8, 2, 0.5) - 0.5) * 0.5;
  return h;
}

/** Weight of the levelled outpost pad at a point: 1 on the pad, 0 outside. */
export function padWeight(x, z) {
  const o = MOUNTAIN.outpost;
  const d = Math.hypot(x - o.x, z - o.z);
  return 1 - smoothstep(o.flat, o.flat + o.blend, d);
}

export function mountainHeightAt(x, z) {
  const h = rawHeight(x, z);
  const pad = padWeight(x, z);
  if (pad <= 0) return h;
  // The pad keeps a whisper of relief so it does not read as a floor plate,
  // but never more than the buildings can hide at their footings.
  const padY = (fbm2(x * 0.08 + 2, z * 0.08 - 4, 2, 0.5) - 0.5) * 0.12;
  return h + (padY - h) * pad;
}

/** Steepness as 1 - normal.y, from central differences. */
export function slopeAt(x, z) {
  const e = 1.2;
  const hx = (mountainHeightAt(x + e, z) - mountainHeightAt(x - e, z)) / (2 * e);
  const hz = (mountainHeightAt(x, z + e) - mountainHeightAt(x, z - e)) / (2 * e);
  return 1 - 1 / Math.sqrt(1 + hx * hx + hz * hz);
}

export function mountainLayerAt(x, z) {
  const slope = slopeAt(x, z);
  const y = mountainHeightAt(x, z);
  if (padWeight(x, z) > 0.55) return LAYER.DIRT;
  if (slope > 0.22 || y > 260) return LAYER.ROCK;
  const n = fbm2(x * 0.05 + 9, z * 0.05 - 2, 3, 0.55);
  if (slope > 0.12 || n > 0.68) return LAYER.DIRT;
  return LAYER.GRASS;
}

export function mountainTintAt(x, z) {
  const y = mountainHeightAt(x, z);
  const broad = fbm2(x * 0.011 - 4, z * 0.011 + 6, 3, 0.55);
  let k = 0.82 + broad * 0.32;
  // Snow and pale scree on the high peaks; the haze does the rest.
  const snow = smoothstep(300, 420, y);
  const t = [k, k, k * 0.97];
  return [t[0] + (1.7 - t[0]) * snow, t[1] + (1.72 - t[1]) * snow, t[2] + (1.8 - t[2]) * snow];
}
