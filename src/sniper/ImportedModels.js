import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * SNIPER WEB — shared plumbing for detailed imported models (rifles, soldier).
 *
 * The engine draws everything with its own material arrays and one draw call
 * per object, so an imported model is flattened the same way: every mesh is
 * baked into one geometry in the engine's vertex layout, and the base-colour
 * textures of all its materials are packed into one atlas that the shaders
 * read through `uModelMap`. Vertices that read the atlas are marked with a
 * negative layer (-1 dielectric, -2 metal) and carry roughness in `aWear`.
 */

const ATLAS_MAX = 4096;
const CELL_MAX = 1024;

export async function loadGltf(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}

/** Every renderable mesh under `root`, in traversal order. */
export function collectMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (o.isMesh && o.visible !== false && o.geometry?.attributes?.position) out.push(o);
  });
  return out;
}

function firstMaterial(mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

/**
 * Pack the base-colour maps of `meshes` into one canvas texture.
 * Returns `{ texture, rectOf(material) }` where a rect is in 0..1 atlas units.
 */
export function buildAtlas(meshes) {
  const mats = [];
  for (const m of meshes) {
    const mat = firstMaterial(m);
    if (mat && !mats.includes(mat)) mats.push(mat);
  }
  const textured = mats.filter((m) => m.map?.image);
  // One extra cell stays white for materials that are colour-only.
  const cells = textured.length + 1;
  const cols = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / cols);
  const cell = Math.min(CELL_MAX, Math.floor(ATLAS_MAX / cols));
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rects = new Map();
  const pad = 2;
  const rectAt = (i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    return {
      x: (x + pad) / canvas.width, y: (y + pad) / canvas.height,
      w: (cell - pad * 2) / canvas.width, h: (cell - pad * 2) / canvas.height,
      px: x, py: y
    };
  };
  textured.forEach((mat, i) => {
    const r = rectAt(i);
    try {
      ctx.drawImage(mat.map.image, r.px + pad, r.py + pad, cell - pad * 2, cell - pad * 2);
    } catch (err) {
      console.warn('[models] texture not drawable', mat.name, err);
    }
    rects.set(mat, r);
  });
  const white = rectAt(textured.length);
  // Colour-only materials sample the middle of the white cell.
  const flat = { x: white.x + white.w * 0.5, y: white.y + white.h * 0.5, w: 0, h: 0 };

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;                     // glTF uv origin is the top-left
  texture.colorSpace = THREE.SRGBColorSpace; // decoded to linear by the GPU
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return { texture, canvas, rectOf: (mat) => rects.get(mat) ?? flat };
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/**
 * Flatten meshes into arrays in world space (posed by their skeleton, if
 * any). `each(vertexWorld, mesh, vertexIndex)` may return extra per-vertex
 * data (e.g. a bone id). UVs are remapped into the atlas.
 */
export function flatten(meshes, atlas, { each = null, transform = null } = {}) {
  const pos = [], nrm = [], uv = [], layer = [], tint = [], wear = [], extra = [], index = [];
  let base = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const P = g.attributes.position;
    let N = g.attributes.normal;
    if (!N) { g.computeVertexNormals(); N = g.attributes.normal; }
    const UV = g.attributes.uv;
    const mat = firstMaterial(mesh);
    const r = atlas.rectOf(mat);
    const c = mat?.color ?? new THREE.Color(1, 1, 1);
    const metal = (mat?.metalness ?? 0) > 0.5 && !mat?.metalnessMap ? -2 : -1;
    const rough = mat?.roughnessMap ? 0.6 : (mat?.roughness ?? 0.6);
    const world = mesh.matrixWorld;
    _nm.getNormalMatrix(world);
    const skinned = mesh.isSkinnedMesh;

    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i);
      if (skinned) mesh.applyBoneTransform(i, _v);
      _v.applyMatrix4(world);
      if (transform) _v.applyMatrix4(transform);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm);
      if (transform) _n.transformDirection(transform);
      _n.normalize();
      pos.push(_v.x, _v.y, _v.z);
      nrm.push(_n.x, _n.y, _n.z);
      let u = UV ? UV.getX(i) : 0.5, w = UV ? UV.getY(i) : 0.5;
      if (u < 0 || u > 1) u -= Math.floor(u);
      if (w < 0 || w > 1) w -= Math.floor(w);
      uv.push(r.x + u * r.w, r.y + w * r.h);
      layer.push(metal);
      tint.push(c.r, c.g, c.b);
      wear.push(rough);
      if (each) extra.push(each(_v, mesh, i));
    }
    if (g.index) {
      const I = g.index;
      for (let i = 0; i < I.count; i++) index.push(base + I.getX(i));
    } else {
      for (let i = 0; i < P.count; i++) index.push(base + i);
    }
    base += P.count;
  }
  return { pos, nrm, uv, layer, tint, wear, extra, index, count: base };
}

/** Build a BufferGeometry in the engine's vertex layout. */
export function toGeometry({ pos, nrm, uv, layer, tint, wear, index, count }, bone = null) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(layer), 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(tint), 3));
  geo.setAttribute('aWear', new THREE.BufferAttribute(new Float32Array(wear), 1));
  if (bone) geo.setAttribute('aBone', new THREE.BufferAttribute(new Float32Array(bone), 1));
  geo.setIndex(new THREE.BufferAttribute(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Append the triangles of `extraGeo` (an engine-layout geometry) whose
 * `aBone` equals `onlyBone` to `flat`, which must carry a `bone` array.
 */
export function appendEngineGeometry(flat, extraGeo, onlyBone = null) {
  const A = extraGeo.attributes;
  const I = extraGeo.index;
  const remap = new Map();
  const triCount = I ? I.count / 3 : A.position.count / 3;
  for (let t = 0; t < triCount; t++) {
    const ids = [0, 1, 2].map((k) => (I ? I.getX(t * 3 + k) : t * 3 + k));
    if (onlyBone !== null && ids.some((v) => Math.round(A.aBone.getX(v)) !== onlyBone)) continue;
    for (const v of ids) {
      let nv = remap.get(v);
      if (nv === undefined) {
        nv = flat.count++;
        remap.set(v, nv);
        flat.pos.push(A.position.getX(v), A.position.getY(v), A.position.getZ(v));
        flat.nrm.push(A.normal.getX(v), A.normal.getY(v), A.normal.getZ(v));
        flat.uv.push(A.uv.getX(v), A.uv.getY(v));
        flat.layer.push(A.aLayer.getX(v));
        flat.tint.push(A.aTint.getX(v), A.aTint.getY(v), A.aTint.getZ(v));
        flat.wear.push(A.aWear.getX(v));
        flat.bone.push(A.aBone ? A.aBone.getX(v) : 0);
      }
      flat.index.push(nv);
    }
  }
  return flat;
}

/** World-space bounds of flattened positions. */
export function boundsOf(pos) {
  const box = new THREE.Box3();
  for (let i = 0; i < pos.length; i += 3) box.expandByPoint(_v.set(pos[i], pos[i + 1], pos[i + 2]));
  return box;
}
