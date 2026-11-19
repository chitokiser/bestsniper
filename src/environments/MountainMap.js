import * as THREE from 'three';
import { TriangleSoup, SURFACE } from '../physics/BVH.js';
import { SeededRandom } from '../core/SeededRandom.js';
import { GeometryBuilder } from '../world/GeometryBuilder.js';
import { LAYER } from '../world/MaterialLibrary.js';
import { generateBuilding, WALL_STYLES } from '../world/Buildings.js';
import * as Props from '../world/Props.js';
import { fbm2 } from '../world/Noise.js';
import { placeModel } from '../assets/AssetLoader.js';
import {
  MOUNTAIN, mountainHeightAt, mountainLayerAt, mountainTintAt, padWeight, slopeAt
} from './terrain.js';

/**
 * Mountain Watch — the first SNIPER WEB battlefield.
 *
 * Produces exactly the data shape `MapGenerator.generate()` does, so `World`,
 * the BVH, the nav bake, the director and the renderer take it unchanged, plus
 * a few optional fields only a wide map needs (`groundAt`, `viewDistance`,
 * `navBounds`, `playerSpawns`, `focus`, `title`).
 *
 * The playable ground is a 560 x 600 m collidable height field at 2.5 m
 * resolution; around it, a 4 km coarse ring with no collision carries the
 * distant peaks. Everything standing on it reuses the district's own building
 * and prop generators, with the asset loader's GLB models where they loaded.
 */
export class MountainMap {
  constructor(seed, { assets = {} } = {}) {
    this.rng = new SeededRandom(seed ^ 0x6d7457);
    this.assets = assets;
  }

  generate() {
    const rng = this.rng;
    const soup = new TriangleSoup(160000);

    const ground = new GeometryBuilder(soup, 'ground');
    const far = new GeometryBuilder(null, 'far-terrain');
    const structure = new GeometryBuilder(soup, 'structure');
    const detail = new GeometryBuilder(null, 'detail');
    const props = new GeometryBuilder(soup, 'props');
    const foliage = new GeometryBuilder(soup, 'foliage');
    const farFoliage = new GeometryBuilder(null, 'far-foliage');

    const coverPoints = [];
    const buildings = [];
    const interiors = [];

    this._terrain(ground, far);
    this._walls(structure);
    this._outpost(structure, detail, props, coverPoints, buildings, interiors, rng.fork(11));
    this._rocks(props, coverPoints, rng.fork(23));
    this._forest(foliage, farFoliage, rng.fork(37));

    // ---------------------------------------------------------------- spawns
    const at = (x, z) => new THREE.Vector3(x, mountainHeightAt(x, z) + 0.05, z);
    const playerSpawns = [-150, -90, -35, 30, 85, 140].map((x) => at(x, MOUNTAIN.ridgeZ + 8));
    const spawnsB = [];
    const srng = rng.fork(97);
    for (let i = 0; i < 10; i++) {
      const a = srng.range(0, Math.PI * 2), r = srng.range(8, 48);
      spawnsB.push(at(Math.cos(a) * r, Math.sin(a) * r));
    }

    const p = MOUNTAIN.play;
    const n = MOUNTAIN.nav;
    return {
      soup,
      batches: [ground, far, structure, detail, props, foliage, farFoliage].filter((b) => !b.isEmpty()),
      cloth: [], cables: [], coverPoints, buildings, interiors, ambientEmitters: [],
      spawns: { A: playerSpawns, B: spawnsB },
      // Nav and AI only ever see the outpost valley; the rest of the map is the
      // player's ground and the nav bake would spend seconds on it for nothing.
      bounds: new THREE.Box3(new THREE.Vector3(n.x0, -20, n.z0), new THREE.Vector3(n.x1, 80, n.z1)),
      playBounds: { x0: n.x0 + 4, x1: n.x1 - 4, z0: n.z0 + 4, z1: n.z1 - 4 },
      worldBounds: new THREE.Box3(new THREE.Vector3(p.x0, -50, p.z0), new THREE.Vector3(p.x1, 700, p.z1)),
      triangleCount: soup.count,
      // ---- wide-map extras
      id: 'mountain',
      title: ['Mountain Watch', 'Outpost Kestrel — 06:10'],
      groundAt: mountainHeightAt,
      navRelativeToGround: true,
      viewDistance: 2600,
      // Thinner haze than the dusty district: mountain air at dawn, and a
      // sniper needs to read a figure at 300 m.
      fogDensity: 0.00042,
      playerSpawns,
      focus: new THREE.Vector3(0, 2, 0)
    };
  }

  // ------------------------------------------------------------- terrain
  _terrain(ground, far) {
    const inner = MOUNTAIN.inner;
    ground.addGroundGrid(inner.x0, inner.z0, inner.x1, inner.z1, 224, mountainHeightAt, {
      uvScale: 0.32, wear: 0.35, collide: true, surface: SURFACE.DIRT,
      layerFn: mountainLayerAt, tintFn: mountainTintAt
    });

    // The coarse ring stops exactly on the inner rectangle (both grids land on
    // multiples of 40 m there). Its border vertices are dropped a little so
    // that wherever the two meshes disagree the fine grid is the higher one,
    // and the skirt below fills the step instead of a crack opening onto sky.
    const onBorder = (x, z) => {
      const inX = x >= inner.x0 - 0.01 && x <= inner.x1 + 0.01;
      const inZ = z >= inner.z0 - 0.01 && z <= inner.z1 + 0.01;
      return (inZ && (Math.abs(x - inner.x0) < 0.01 || Math.abs(x - inner.x1) < 0.01))
        || (inX && (Math.abs(z - inner.z0) < 0.01 || Math.abs(z - inner.z1) < 0.01));
    };
    const farHeight = (x, z) => mountainHeightAt(x, z) - (onBorder(x, z) ? 2.0 : 0);
    far.addGroundGrid(-MOUNTAIN.far, -MOUNTAIN.far, MOUNTAIN.far, MOUNTAIN.far, 100, farHeight, {
      uvScale: 0.05, wear: 0.3, collide: false,
      layerFn: mountainLayerAt, tintFn: mountainTintAt,
      skipQuad: (x, z) => x > inner.x0 && x < inner.x1 && z > inner.z0 && z < inner.z1
    });

    // Skirt hanging from the fine grid's edge.
    const step = 2.5;
    const skirt = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / step);
      for (let i = 0; i < n; i++) {
        const ax = x0 + (x1 - x0) * (i / n), az = z0 + (z1 - z0) * (i / n);
        const bx = x0 + (x1 - x0) * ((i + 1) / n), bz = z0 + (z1 - z0) * ((i + 1) / n);
        const ay = mountainHeightAt(ax, az), by = mountainHeightAt(bx, bz);
        // Both windings: the skirt is seen from whichever side the step faces.
        for (const flip of [false, true]) {
          ground.addQuad(
            new THREE.Vector3(ax, ay - 8, az), new THREE.Vector3(bx, by - 8, bz),
            new THREE.Vector3(bx, by, bz), new THREE.Vector3(ax, ay, az),
            { layer: LAYER.ROCK, tint: [0.8, 0.8, 0.78], wear: 0.3, uvScale: 0.3, collide: false, flip }
          );
        }
      }
    };
    skirt(inner.x0, inner.z0, inner.x1, inner.z0);
    skirt(inner.x1, inner.z0, inner.x1, inner.z1);
    skirt(inner.x1, inner.z1, inner.x0, inner.z1);
    skirt(inner.x0, inner.z1, inner.x0, inner.z0);
  }

  /** Invisible walls on the play rectangle. Tall enough that no hill tops them. */
  _walls(structure) {
    const p = MOUNTAIN.play;
    const h = 900, cy = 300, t = 2;
    const w = p.x1 - p.x0, d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    structure.addCollisionBox(cx, cy, p.z0 - t / 2, w + 2 * t, h, t, SURFACE.BARRIER);
    structure.addCollisionBox(cx, cy, p.z1 + t / 2, w + 2 * t, h, t, SURFACE.BARRIER);
    structure.addCollisionBox(p.x0 - t / 2, cy, cz, t, h, d, SURFACE.BARRIER);
    structure.addCollisionBox(p.x1 + t / 2, cy, cz, t, h, d, SURFACE.BARRIER);
  }

  // ------------------------------------------------------------- outpost
  _outpost(structure, detail, props, cover, buildings, interiors, rng) {
    const lots = [
      { x0: -32, x1: -18, z0: -24, z1: -12, floors: 2, hollow: true },
      { x0: 14, x1: 30, z0: -28, z1: -16, floors: 1, hollow: false },
      { x0: -28, x1: -14, z0: 12, z1: 26, floors: 1, hollow: true },
      { x0: 16, x1: 30, z0: 8, z1: 20, floors: 2, hollow: false },
      { x0: -7, x1: 7, z0: 30, z1: 41, floors: 1, hollow: false }
    ];
    for (const lot of lots) {
      const b = generateBuilding({
        builder: structure, detail, rng, lot,
        openSides: [true, true, true, true],
        floors: lot.floors, hollow: lot.hollow,
        style: WALL_STYLES[rng.int(0, WALL_STYLES.length - 1)]
      });
      buildings.push(b);
      if (b.interior) interiors.push(b.interior);
      cover.push(
        { x: lot.x0 - 0.9, z: lot.z0 + 0.8, type: 'corner', height: 1.9 },
        { x: lot.x1 + 0.9, z: lot.z1 - 0.8, type: 'corner', height: 1.9 }
      );
    }

    // Perimeter: concrete barriers in a broken ring, a gate facing south.
    const ringR = 50;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const x = Math.sin(a) * ringR, z = Math.cos(a) * ringR;
      // gate: the arc facing the player's ridge stays open
      if (Math.abs(a - Math.PI) < 0.2) continue;
      if (rng.bool(0.12)) continue;
      const rot = -a + Math.PI / 2;
      const r = rng.bool(0.3)
        ? Props.sandbagWall(props, x, 0, z, rot, rng, 3.4, 4)
        : Props.jerseyBarrier(props, x, 0, z, rot, rng, 3.6);
      cover.push({ x: x * 0.97, z: z * 0.97, type: r.cover ?? 'low', height: r.height });
    }
    // Gate furniture.
    Props.barricade(props, -6, 0, -ringR + 1, 0, rng);
    Props.barricade(props, 6, 0, -ringR + 1, 0, rng);

    this._watchtower(structure, props, -38, -34, rng);
    this._watchtower(structure, props, 38, 34, rng);

    // Yard clutter.
    Props.utilityVehicle(props, -4, 0, -8, 0.3, rng);
    Props.utilityVehicle(props, 6, 0, 18, 2.6, rng);
    for (const [x, z] of [[10, -4], [-10, 4], [2, 26], [-34, 2], [34, -4]]) {
      Props.crateStack(props, x, 0, z, rng.range(0, 3), rng, rng.int(2, 4));
      cover.push({ x, z, type: 'low', height: 1.2 });
    }
    for (const [x, z] of [[12, -8], [-12, 8], [24, 0], [-24, -2]]) Props.metalDrum(props, x, 0, z, rng);
    Props.palletStack(props, 18, 0, -10, 0.4, rng);
    Props.tireStack(props, -18, 0, 4, rng);
    for (const [x, z] of [[-8, -20], [8, -20], [-2, 4]]) {
      Props.sandbagWall(props, x, 0, z, rng.range(0, 3), rng, 2.6, 3);
      cover.push({ x, z, type: 'low', height: 0.8 });
    }

    // Lights: the GLB lantern where it loaded, the procedural post otherwise.
    const lampSpots = [[-8, -46, 0], [8, -46, Math.PI], [0, 4, 0], [-22, -6, 1.2], [22, 2, 2.2]];
    const lantern = this.assets.lantern;
    for (const [x, z, rot] of lampSpots) {
      if (lantern) {
        const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
        placeModel(detail, lantern, m);
        props.addCollisionBox(x, 1.6, z, 0.4, 3.2, 0.4, SURFACE.METAL);
      } else {
        Props.lampPost(props, x, 0, z, rng, rot);
      }
    }
    this.lanternsPlaced = lantern ? lampSpots.length : 0;
  }

  _watchtower(structure, props, x, z, rng) {
    const legH = 5.2, half = 1.6;
    const o = { layer: LAYER.WOOD, tint: [0.78, 0.7, 0.6], wear: 0.6, uvScale: 0.8, collide: true, surface: SURFACE.WOOD };
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      structure.addBox(x + sx * half, legH / 2, z + sz * half, 0.22, legH, 0.22, o);
    }
    structure.addBox(x, legH, z, half * 2 + 0.6, 0.2, half * 2 + 0.6, o);
    for (const [sx, sz, rot] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
      Props.sandbagWall(props, x + sx * half, legH + 0.1, z + sz * half, rot, rng, 3.2, 3);
    }
    structure.addBox(x, legH + 2.5, z, half * 2 + 1.0, 0.08, half * 2 + 1.0, {
      layer: LAYER.CORRUGATED, tint: [0.8, 0.8, 0.8], wear: 0.7, uvScale: 0.6, collide: true, surface: SURFACE.METAL
    });
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      structure.addBox(x + sx * half, legH + 1.25, z + sz * half, 0.12, 2.5, 0.12, o);
    }
  }

  // --------------------------------------------------------------- rocks
  _rocks(props, cover, rng) {
    const inner = MOUNTAIN.play;
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 170; tries++) {
      const x = rng.range(inner.x0 + 6, inner.x1 - 6);
      const z = rng.range(inner.z0 + 6, inner.z1 - 6);
      if (padWeight(x, z) > 0.01) continue;
      const s = rng.range(0.6, 2.8) * (rng.bool(0.15) ? 2.0 : 1);
      const y = mountainHeightAt(x, z);
      props.addBlob(x, y + s * 0.25, z, s, s * rng.range(0.45, 0.8), s * rng.range(0.7, 1.2), 9, 6, {
        layer: LAYER.ROCK, tint: [0.92, 0.9, 0.88].map((v) => v * rng.range(0.85, 1.05)),
        wear: 0.4, uvScale: 0.6, noise: 0.28
      });
      props.addCollisionBox(x, y + s * 0.3, z, s * 1.4, s * 0.9, s * 1.4, SURFACE.CONCRETE);
      if (s > 1.2) cover.push({ x, z, type: 'rock', height: s * 0.8 });
      placed++;
    }
    this.rockCount = placed;
  }

  // -------------------------------------------------------------- forest
  _forest(foliage, farFoliage, rng) {
    const inner = MOUNTAIN.play;
    let placed = 0;
    for (let tries = 0; tries < 6000 && placed < 650; tries++) {
      const x = rng.range(inner.x0 + 3, inner.x1 - 3);
      const z = rng.range(inner.z0 + 3, inner.z1 - 3);
      if (padWeight(x, z) > 0) continue;
      if (Math.hypot(x, z) < 100) continue;
      // Stands, not a carpet: density follows a low-frequency mask.
      if (fbm2(x * 0.012 + 40, z * 0.012 - 13, 3, 0.55) < 0.52) continue;
      if (slopeAt(x, z) > 0.2) continue;
      // Keep the firing lanes off the ridge mostly clear.
      if (z < MOUNTAIN.ridgeZ + 40 && z > MOUNTAIN.ridgeZ - 20 && rng.bool(0.8)) continue;
      this._conifer(foliage, x, mountainHeightAt(x, z), z, rng.range(7, 15), rng, true);
      placed++;
    }
    // A sparse ring of silhouettes outside the walls, no collision.
    let farPlaced = 0;
    for (let tries = 0; tries < 6000 && farPlaced < 700; tries++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(300, 900);
      const x = Math.sin(a) * r, z = Math.cos(a) * r - 60;
      if (x > MOUNTAIN.inner.x0 && x < MOUNTAIN.inner.x1 && z > MOUNTAIN.inner.z0 && z < MOUNTAIN.inner.z1) continue;
      if (fbm2(x * 0.008 + 7, z * 0.008, 3, 0.55) < 0.5) continue;
      const y = mountainHeightAt(x, z);
      if (y > 320 || slopeAt(x, z) > 0.25) continue;
      this._conifer(farFoliage, x, y - 0.5, z, rng.range(10, 18), rng, false);
      farPlaced++;
    }
    this.treeCount = placed + farPlaced;
  }

  _conifer(b, x, y, z, height, rng, near) {
    const trunkR = height * 0.025;
    b.addCylinder(x, y + height * 0.2, z, trunkR * 1.2, trunkR * 0.7, height * 0.4, near ? 6 : 4, {
      layer: LAYER.WOOD, tint: [0.55, 0.45, 0.38], wear: 0.6, uvScale: 1.2,
      collide: near, surface: SURFACE.WOOD
    });
    const tiers = near ? 4 : 2;
    const green = rng.range(0.42, 0.62);
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers;
      const base = y + height * (0.18 + f * 0.62);
      const r = height * (0.24 - f * 0.15);
      const h = height * (0.42 - f * 0.12);
      b.addCylinder(x, base + h / 2, z, r, 0.02, h, near ? 7 : 5, {
        layer: LAYER.GRASS, tint: [green * 0.75, green, green * 0.7], wear: 0.1, uvScale: 1.5,
        rotY: rng.range(0, 6.28), caps: false
      });
    }
  }
}
