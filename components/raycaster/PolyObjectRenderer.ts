import { PolyObjectModel, PolyObjectCube, Tile } from '../../types';
import { getPolyModelById } from '../../data/polyModels';
import { PassThroughWall, MirrorReflection } from './RaycasterTypes';
import { getPolyTextureImage, drawTexturedPolygonCanvas, computeFaceUVs, applyTextureTransformToUVs, getCompositeTextureKey, getCompositePolyTextureCanvas } from '../../utils/polyTextureUtils';
import { getPolyDebrisInstances, updatePolyDebris } from '../../utils/polyDebrisSystem';

export interface PolyObjectInstance {
  baseX: number;
  baseY: number;
  sFloorHeight: number;
  yOffset?: number;
  scale: number;
  facing?: string | number;
  model: PolyObjectModel;
  lightColor?: { r: number; g: number; b: number };
  isHighlighted?: boolean;
  distSq: number;
  isReflected?: boolean;
  noShadow?: boolean;
}

export function getDecorationFacingAngle(d: any): number | string {
  if (!d) return 'N';
  let baseYaw = 0;
  if (typeof d.facing === 'number') {
    baseYaw = d.facing;
  } else if (typeof d.facing === 'string') {
    const f = d.facing.toUpperCase();
    if (f === 'E') baseYaw = 90;
    else if (f === 'S') baseYaw = 180;
    else if (f === 'W') baseYaw = 270;
    else if (f === 'NE') baseYaw = 45;
    else if (f === 'SE') baseYaw = 135;
    else if (f === 'SW') baseYaw = 225;
    else if (f === 'NW') baseYaw = 315;
  }
  if (d.yRotation !== undefined && d.yRotation !== null && d.yRotation !== '') {
    const rotNum = typeof d.yRotation === 'number' ? d.yRotation : parseFloat(d.yRotation);
    if (!isNaN(rotNum)) {
      return baseYaw + rotNum;
    }
  }
  return d.facing !== undefined ? d.facing : 'N';
}

export interface PolyBatch {
  textureId: string | null;
  startVertex: number;
  vertexCount: number;
}

/**
 * Scan grid tiles around player to collect active polyObjects.
 */
export function collectPolyObjectsFromGrid(
  grid: Tile[][],
  posX: number,
  posY: number,
  shadingDist: number,
  lightMap?: { r: number; g: number; b: number }[][],
  highlightedEntityId?: string | null,
  onParticleBounce?: (p: any) => void
): PolyObjectInstance[] {
  if (!grid) return [];
  const mapHeight = grid.length;
  const mapWidth = grid[0]?.length || 0;

  const maxSearchRadius = Math.min(shadingDist, 28);
  const minX = Math.max(0, Math.floor(posX - maxSearchRadius));
  const maxX = Math.min(mapWidth - 1, Math.ceil(posX + maxSearchRadius));
  const minY = Math.max(0, Math.floor(posY - maxSearchRadius));
  const maxY = Math.min(mapHeight - 1, Math.ceil(posY + maxSearchRadius));

  const polyObjects: PolyObjectInstance[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tile = grid[y][x];
      if (!tile) continue;

      const decors = tile.decorations
        ? tile.decorations
        : tile.decoration
        ? [tile.decoration]
        : [];

      let totalNonPitDecors = 0;
      for (let i = 0; i < decors.length; i++) {
        const isP = tile.type === 'FLOOR' && tile.height !== undefined && tile.height < 0;
        if (!isP) totalNonPitDecors++;
      }

      let decorIndex = 0;
      for (let i = 0; i < decors.length; i++) {
        const d = decors[i] as any;
        const isPit = tile.type === 'FLOOR' && tile.height !== undefined && tile.height < 0;
        const decorId = isPit
          ? `pit_decor_${x}_${y}`
          : totalNonPitDecors > 1
          ? `decor_${x}_${y}_${decorIndex}`
          : `decor_${x}_${y}`;

        if (!isPit) decorIndex++;

        if (d.renderMode === 'polyObject' || d.type === 'polyObject' || d.polyModelId || d.polyModel) {
          const modelId = d.polyModelId || 'chair';
          const model = d.polyModel || getPolyModelById(modelId) || getPolyModelById('chair');
          if (model) {
            const scale = d.scale !== undefined ? d.scale : 1.0;
            const defFH = (tile.type === 'FLOOR' && tile.height !== undefined ? tile.height : 0) + (tile.elevation || 0);
            const baseX = x + 0.5;
            const baseY = y + 0.5;
            const distSq = (posX - baseX) ** 2 + (posY - baseY) ** 2;
            const lightColor = lightMap?.[y]?.[x] || { r: 1.0, g: 1.0, b: 1.0 };

            const isHighlighted =
              highlightedEntityId === decorId ||
              highlightedEntityId === `decor_${x}_${y}` ||
              (highlightedEntityId && (highlightedEntityId.startsWith(`decor_${x}_${y}_`) || highlightedEntityId === `DECOR_POLY_${d.id}_${x}_${y}_${i}`));

            polyObjects.push({
              baseX,
              baseY,
              sFloorHeight: defFH,
              yOffset: d.yOffset || 0,
              scale,
              facing: getDecorationFacingAngle(d),
              model,
              lightColor,
              isHighlighted: !!isHighlighted,
              distSq,
              noShadow: !!d.noShadow,
            });
          }
        }
      }
    }
  }

  // Update 3D poly debris physics and collect active debris instances
  updatePolyDebris(0.016, grid, mapWidth, mapHeight, onParticleBounce);
  const debrisInstances = getPolyDebrisInstances(posX, posY, shadingDist);
  if (debrisInstances.length > 0) {
    polyObjects.push(...debrisInstances);
  }

  polyObjects.sort((a, b) => b.distSq - a.distSq);
  return polyObjects;
}

/**
 * Generate reflected PolyObject instances for active mirror reflections.
 */
export function generateReflectedPolyObjects(
  realInstances: PolyObjectInstance[],
  mirrorReflections: MirrorReflection[][],
  width: number,
  posX: number,
  posY: number,
  shadingDist: number
): PolyObjectInstance[] {
  if (!realInstances || realInstances.length === 0 || !mirrorReflections) return [];

  // Find unique mirror planes from active mirror reflections
  const mirrorPlanes: { hitX: number; hitY: number; side: number }[] = [];
  
  for (let x = 0; x < width; x++) {
    const refs = mirrorReflections[x];
    if (refs && refs.length > 0) {
      for (let r = 0; r < refs.length; r++) {
        const m = refs[r];
        if (m && m.maskTop <= m.maskBottom) {
          let found = false;
          for (let p = 0; p < mirrorPlanes.length; p++) {
            const mp = mirrorPlanes[p];
            if (mp.side === m.side && Math.abs(mp.hitX - m.mirrorHitX) < 0.1 && Math.abs(mp.hitY - m.mirrorHitY) < 0.1) {
              found = true;
              break;
            }
          }
          if (!found) {
            mirrorPlanes.push({
              hitX: m.mirrorHitX,
              hitY: m.mirrorHitY,
              side: m.side
            });
          }
        }
      }
    }
  }

  if (mirrorPlanes.length === 0) return [];

  const reflectedInstances: PolyObjectInstance[] = [];

  for (let p = 0; p < mirrorPlanes.length; p++) {
    const mp = mirrorPlanes[p];
    for (let i = 0; i < realInstances.length; i++) {
      const inst = realInstances[i];
      if (inst.isReflected) continue;

      let refBaseX = inst.baseX;
      let refBaseY = inst.baseY;

      let yaw = 0;
      if (typeof inst.facing === 'number') {
        yaw = (inst.facing * Math.PI) / 180;
      } else if (typeof inst.facing === 'string') {
        const f = inst.facing.toUpperCase();
        if (f === 'E') yaw = Math.PI / 2;
        else if (f === 'S') yaw = Math.PI;
        else if (f === 'W') yaw = (3 * Math.PI) / 2;
        else if (f === 'NE') yaw = Math.PI / 4;
        else if (f === 'SE') yaw = (3 * Math.PI) / 4;
        else if (f === 'SW') yaw = (5 * Math.PI) / 4;
        else if (f === 'NW') yaw = (7 * Math.PI) / 4;
      }

      let refYaw = yaw;
      if (mp.side === 0) {
        // NS Mirror (reflection across X = mp.hitX)
        if ((posX - mp.hitX) * (inst.baseX - mp.hitX) <= 0) continue;
        refBaseX = 2 * mp.hitX - inst.baseX;
        refYaw = Math.PI - yaw;
      } else {
        // EW Mirror (reflection across Y = mp.hitY)
        if ((posY - mp.hitY) * (inst.baseY - mp.hitY) <= 0) continue;
        refBaseY = 2 * mp.hitY - inst.baseY;
        refYaw = -yaw;
      }

      const distSq = (posX - refBaseX) ** 2 + (posY - refBaseY) ** 2;
      if (distSq > shadingDist * shadingDist * 2) continue;

      const lightColor = inst.lightColor 
        ? { r: inst.lightColor.r * 0.85, g: inst.lightColor.g * 0.85, b: inst.lightColor.b * 0.85 }
        : { r: 0.85, g: 0.85, b: 0.85 };

      reflectedInstances.push({
        baseX: refBaseX,
        baseY: refBaseY,
        sFloorHeight: inst.sFloorHeight,
        yOffset: inst.yOffset,
        scale: inst.scale,
        facing: refYaw,
        model: inst.model,
        lightColor,
        isHighlighted: inst.isHighlighted,
        distSq,
        isReflected: true,
        noShadow: inst.noShadow,
      });
    }
  }

  return reflectedInstances;
}

/**
 * Parse hex string or RGB array to normalized [r, g, b, a] floats (0..1)
 */
export function parseColorToRGBA(color: string | [number, number, number]): [number, number, number, number] {
  if (Array.isArray(color)) {
    const r = color[0] > 1 ? color[0] / 255 : color[0];
    const g = color[1] > 1 ? color[1] / 255 : color[1];
    const b = color[2] > 1 ? color[2] / 255 : color[2];
    return [r, g, b, 1.0];
  }
  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        return [r, g, b, 1.0];
      } else if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16) / 255;
        const g = parseInt(hex[1] + hex[1], 16) / 255;
        const b = parseInt(hex[2] + hex[2], 16) / 255;
        return [r, g, b, 1.0];
      }
    }
  }
  return [0.5, 0.35, 0.2, 1.0];
}

interface TempFace {
  depth: number;
  faceCol: [number, number, number, number];
  baseX: number;
  baseY: number;
  side: number;
  textureId: string | null;
  numVerts: number;
  wVerts: [number, number, number][];
  uvs: [number, number][];
}

const facePool: TempFace[] = [];
let facePoolCount = 0;

function getTempFace(): TempFace {
  if (facePoolCount < facePool.length) {
    return facePool[facePoolCount++];
  }
  const f: TempFace = {
    depth: 0,
    faceCol: [0, 0, 0, 1],
    baseX: 0,
    baseY: 0,
    side: 1,
    textureId: null,
    numVerts: 0,
    wVerts: Array.from({ length: 16 }, () => [0, 0, 0]),
    uvs: Array.from({ length: 16 }, () => [0, 0]),
  };
  facePool.push(f);
  facePoolCount++;
  return f;
}

interface CachedFace {
  norm: [number, number, number];
  key: string;
  side: number;
  localVerts: [number, number, number][];
  localAvg: [number, number, number];
  rawUVs: [number, number][];
  color?: string | [number, number, number];
  textureId?: string;
  textureTransform?: any;
  textureLayers?: any[];
}

interface CachedOccluderFace {
  norm: [number, number, number];
  localVerts: [number, number, number][];
  localAvg: [number, number, number];
}

interface CachedCubeData {
  unscaledVerts: [number, number, number][];
  unscaledFaces: CachedFace[];
  occluderFaces: CachedOccluderFace[];
}

const cubeCache = new WeakMap<any, CachedCubeData>();

function getOrCreateCachedCube(cube: any): CachedCubeData {
  let cached = cubeCache.get(cube);
  if (cached) return cached;

  const off = Array.isArray(cube.offset)
    ? [Number(cube.offset[0]) || 0, Number(cube.offset[1]) || 0, Number(cube.offset[2]) || 0]
    : cube.offset && typeof cube.offset === 'object'
    ? [Number(cube.offset.x ?? cube.offset.X) || 0, Number(cube.offset.y ?? cube.offset.Y) || 0, Number(cube.offset.z ?? cube.offset.Z) || 0]
    : [0, 0, 0];
  const sz = Array.isArray(cube.size)
    ? [Number(cube.size[0]) || 0.2, Number(cube.size[1]) || 0.2, Number(cube.size[2]) || 0.2]
    : cube.size && typeof cube.size === 'object'
    ? [Number(cube.size.x ?? cube.size.X) || 0.2, Number(cube.size.y ?? cube.size.Y) || 0.2, Number(cube.size.z ?? cube.size.Z) || 0.2]
    : [0.2, 0.2, 0.2];
  const cX = off[0];
  const cY = off[1];
  const cZ = off[2];

  let verts3D: [number, number, number][];
  if (cube.vertices && cube.vertices.length > 0) {
    verts3D = cube.vertices.map((v: any) => [v[0], v[1], v[2]]);
  } else {
    const halfW = sz[0] / 2;
    const halfD = sz[1] / 2;
    const halfH = sz[2] / 2;
    const lxMin = cX - halfW, lxMax = cX + halfW;
    const lyMin = cY - halfD, lyMax = cY + halfD;
    const lzMin = cZ - halfH, lzMax = cZ + halfH;
    verts3D = [
      [lxMin, lyMin, lzMin], // 0
      [lxMax, lyMin, lzMin], // 1
      [lxMax, lyMax, lzMin], // 2
      [lxMin, lyMax, lzMin], // 3
      [lxMin, lyMin, lzMax], // 4
      [lxMax, lyMin, lzMax], // 5
      [lxMax, lyMax, lzMax], // 6
      [lxMin, lyMax, lzMax], // 7
    ];
  }

  let faces: CachedFace[] = [];

  if (cube.customFaces && cube.customFaces.length > 0) {
    faces = cube.customFaces.map((f: any) => {
      const vList = f.vertices.map((idx: number) => verts3D[idx]).filter(Boolean) as [number, number, number][];
      let norm: [number, number, number] = [0, 0, 1];
      if (vList.length >= 3) {
        let nx = 0, ny = 0, nz = 0;
        const numV = vList.length;
        for (let i = 0; i < numV; i++) {
          const curr = vList[i];
          const next = vList[(i + 1) % numV];
          nx += (curr[1] - next[1]) * (curr[2] + next[2]);
          ny += (curr[2] - next[2]) * (curr[0] + next[0]);
          nz += (curr[0] - next[0]) * (curr[1] + next[1]);
        }
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-6) norm = [nx / len, ny / len, nz / len];
      }
      const side = Math.max(0.35, Math.min(1.25, 0.75 + (norm[0] * 0.15 + norm[1] * 0.25 + norm[2] * 0.35)));

      let avgX = 0, avgY = 0, avgZ = 0;
      const numFaceVerts = vList.length;
      for (let v = 0; v < numFaceVerts; v++) {
        avgX += vList[v][0];
        avgY += vList[v][1];
        avgZ += vList[v][2];
      }
      if (numFaceVerts > 0) {
        avgX /= numFaceVerts;
        avgY /= numFaceVerts;
        avgZ /= numFaceVerts;
      }

      const rawUVs = computeFaceUVs(vList);

      return {
        norm,
        key: f.name || 'custom',
        side,
        localVerts: vList,
        localAvg: [avgX, avgY, avgZ],
        rawUVs,
        color: f.color,
        textureId: f.textureId,
        textureTransform: f.textureTransform,
        textureLayers: f.textureLayers
      };
    });
  } else {
    faces = [
      { norm: [0, 0, 1], key: 'top', side: 1.0, localVerts: [verts3D[4], verts3D[5], verts3D[6], verts3D[7]], localAvg: [cX, cY, cZ + sz[2]/2], rawUVs: computeFaceUVs([verts3D[4], verts3D[5], verts3D[6], verts3D[7]]) },
      { norm: [0, 0, -1], key: 'bottom', side: 0.45, localVerts: [verts3D[3], verts3D[2], verts3D[1], verts3D[0]], localAvg: [cX, cY, cZ - sz[2]/2], rawUVs: computeFaceUVs([verts3D[3], verts3D[2], verts3D[1], verts3D[0]]) },
      { norm: [0, 1, 0], key: 'front', side: 0.85, localVerts: [verts3D[3], verts3D[2], verts3D[6], verts3D[7]], localAvg: [cX, cY + sz[1]/2, cZ], rawUVs: computeFaceUVs([verts3D[3], verts3D[2], verts3D[6], verts3D[7]]) },
      { norm: [0, -1, 0], key: 'back', side: 0.75, localVerts: [verts3D[1], verts3D[0], verts3D[4], verts3D[5]], localAvg: [cX, cY - sz[1]/2, cZ], rawUVs: computeFaceUVs([verts3D[1], verts3D[0], verts3D[4], verts3D[5]]) },
      { norm: [1, 0, 0], key: 'right', side: 0.65, localVerts: [verts3D[1], verts3D[2], verts3D[6], verts3D[5]], localAvg: [cX + sz[0]/2, cY, cZ], rawUVs: computeFaceUVs([verts3D[1], verts3D[2], verts3D[6], verts3D[5]]) },
      { norm: [-1, 0, 0], key: 'left', side: 0.55, localVerts: [verts3D[3], verts3D[0], verts3D[4], verts3D[7]], localAvg: [cX - sz[0]/2, cY, cZ], rawUVs: computeFaceUVs([verts3D[3], verts3D[0], verts3D[4], verts3D[7]]) },
    ];
  }

  // Precompute occluder faces
  const halfW = sz[0] / 2;
  const halfD = sz[1] / 2;
  const halfH = sz[2] / 2;
  const lxMin = cX - halfW, lxMax = cX + halfW;
  const lyMin = cY - halfD, lyMax = cY + halfD;
  const lzMin = cZ - halfH, lzMax = cZ + halfH;

  const occluderFaces: CachedOccluderFace[] = [
    { norm: [0, 0, 1], localVerts: [[lxMin, lyMin, lzMax], [lxMax, lyMin, lzMax], [lxMax, lyMax, lzMax], [lxMin, lyMax, lzMax]], localAvg: [cX, cY, lzMax] },
    { norm: [0, 0, -1], localVerts: [[lxMin, lyMax, lzMin], [lxMax, lyMax, lzMin], [lxMax, lyMin, lzMin], [lxMin, lyMin, lzMin]], localAvg: [cX, cY, lzMin] },
    { norm: [0, 1, 0], localVerts: [[lxMin, lyMax, lzMin], [lxMax, lyMax, lzMin], [lxMax, lyMax, lzMax], [lxMin, lyMax, lzMax]], localAvg: [cX, lyMax, cZ] },
    { norm: [0, -1, 0], localVerts: [[lxMax, lyMin, lzMin], [lxMin, lyMin, lzMin], [lxMin, lyMin, lzMax], [lxMax, lyMin, lzMax]], localAvg: [cX, lyMin, cZ] },
    { norm: [1, 0, 0], localVerts: [[lxMax, lyMin, lzMin], [lxMax, lyMax, lzMin], [lxMax, lyMax, lzMax], [lxMax, lyMin, lzMax]], localAvg: [lxMax, cY, cZ] },
    { norm: [-1, 0, 0], localVerts: [[lxMin, lyMax, lzMin], [lxMin, lyMin, lzMin], [lxMin, lyMin, lzMax], [lxMin, lyMax, lzMax]], localAvg: [lxMin, cY, cZ] },
  ];

  cached = {
    unscaledVerts: verts3D,
    unscaledFaces: faces,
    occluderFaces: occluderFaces,
  };
  cubeCache.set(cube, cached);
  return cached;
}

/**
 * High-performance GPU Float32Array vertex generator for PolyObjects.
 * Packs 3D triangles with vertex attributes into targetBuffer:
 * [worldX, worldY, worldZ, r, g, b, a, lightX, lightY, sideMultiplier, u, v]
 * (12 floats = 48 bytes per vertex)
 */
export function buildPolyObjectVertexBuffer(
  instances: PolyObjectInstance[],
  posX: number,
  posY: number,
  cameraZ: number,
  targetBuffer: Float32Array,
  dirX?: number,
  dirY?: number,
  planeX?: number,
  planeY?: number,
  outBatches?: PolyBatch[]
 ): number {
   facePoolCount = 0;
   if (outBatches) outBatches.length = 0;
 
   const hasCam =
     dirX !== undefined &&
     dirY !== undefined &&
     planeX !== undefined &&
     planeY !== undefined;
   const invDet = hasCam ? 1.0 / (planeX! * dirY! - dirX! * planeY!) : 0;
 
   for (let i = 0; i < instances.length; i++) {
     const inst = instances[i];
     const model = inst.model;
     if (!model || !model.cubes || model.cubes.length === 0) continue;
 
     const scale = inst.scale !== undefined ? inst.scale : 1.0;
     const yOff = inst.yOffset || 0.0;
     const baseX = inst.baseX;
     const baseY = inst.baseY;
     const floorH = inst.sFloorHeight + yOff;
 
     let yaw = 0;
     if (typeof inst.facing === 'number') {
       yaw = (inst.facing * Math.PI) / 180;
     } else if (typeof inst.facing === 'string') {
       const f = inst.facing.toUpperCase();
       if (f === 'E') yaw = Math.PI / 2;
       else if (f === 'S') yaw = Math.PI;
       else if (f === 'W') yaw = (3 * Math.PI) / 2;
       else if (f === 'NE') yaw = Math.PI / 4;
       else if (f === 'SE') yaw = (3 * Math.PI) / 4;
       else if (f === 'SW') yaw = (5 * Math.PI) / 4;
       else if (f === 'NW') yaw = (7 * Math.PI) / 4;
     }
 
     const cosYaw = Math.cos(yaw);
     const sinYaw = Math.sin(yaw);
 
     for (let c = 0; c < model.cubes.length; c++) {
       const cube = model.cubes[c];
       const baseCol = parseColorToRGBA(cube.color || '#8B5A2B');

       const cachedCube = getOrCreateCachedCube(cube);
       const faces = cachedCube.unscaledFaces;
 
       for (let f = 0; f < faces.length; f++) {
         const face = faces[f];
 
         const lny = -face.norm[1];
         const nxW = face.norm[0] * cosYaw - lny * sinYaw;
         const nyW = face.norm[0] * sinYaw + lny * cosYaw;
         const nzW = face.norm[2];
 
         const fcX = face.localAvg[0] * scale * cosYaw - (-face.localAvg[1] * scale) * sinYaw + baseX;
         const fcY = face.localAvg[0] * scale * sinYaw + (-face.localAvg[1] * scale) * cosYaw + baseY;
         const fcZ = face.localAvg[2] * scale + floorH;
 
         const toCamX = posX - fcX;
         const toCamY = posY - fcY;
         const toCamZ = cameraZ - fcZ;
         const dot = nxW * toCamX + nyW * toCamY + nzW * toCamZ;
 
         const isCulled = inst.isReflected ? (dot >= 0) : (dot <= 0);
         if (isCulled) continue;
 
         const dx = fcX - posX;
         const dy = fcY - posY;
         const dz = fcZ - cameraZ;
         let depth = 0;
 
         if (hasCam) {
           const transformX = invDet * (dirY! * dx - dirX! * dy);
           const transformY = invDet * (-planeY! * dx + planeX! * dy);
           depth = transformY + 0.0001 * (transformX * transformX + dz * dz);
         } else {
           depth = dx * dx + dy * dy + dz * dz;
         }
 
         const faceTex =
           cube.faceTextures?.[face.key as keyof typeof cube.faceTextures] ||
           cube.textureId ||
           null;
         const faceLayers =
           cube.faceTextureLayers?.[face.key as keyof typeof cube.faceTextureLayers] ||
           cube.textureLayers ||
           null;
 
         let effectiveTexId = faceTex;
         if (faceLayers && faceLayers.some(l => l && l.enabled !== false && l.textureId)) {
           effectiveTexId = getCompositeTextureKey(faceTex, faceLayers);
           getCompositePolyTextureCanvas(faceTex, faceLayers);
         }
 
         let faceCol = effectiveTexId ? [1.0, 1.0, 1.0, 1.0] : baseCol;
         if (
           !effectiveTexId &&
           cube.faceColors &&
           cube.faceColors[face.key as keyof typeof cube.faceColors]
         ) {
           faceCol = parseColorToRGBA(
             cube.faceColors[face.key as keyof typeof cube.faceColors]!
           );
         }
 
         if (inst.isHighlighted) {
           const timePulse = Math.sin(Date.now() / 150) * 0.5 + 0.5;
           const boost = 0.25 + 0.45 * timePulse;
           faceCol = [
             Math.min(1.5, faceCol[0] + boost),
             Math.min(1.5, faceCol[1] + boost),
             Math.min(1.5, faceCol[2] + boost),
             faceCol[3]
           ];
         }
 
         const tf = getTempFace();
         tf.depth = depth;
         tf.baseX = baseX;
         tf.baseY = baseY;
         tf.side = inst.isReflected ? -face.side : face.side;
         tf.textureId = effectiveTexId;
         tf.faceCol[0] = faceCol[0];
         tf.faceCol[1] = faceCol[1];
         tf.faceCol[2] = faceCol[2];
         tf.faceCol[3] = faceCol[3];
 
         const numV = face.localVerts.length;
         tf.numVerts = numV;
 
         const faceTransform =
           cube.faceTransforms?.[face.key as keyof typeof cube.faceTransforms] ||
           cube.textureTransform;
         const faceUVs = applyTextureTransformToUVs(face.rawUVs, faceTransform);
 
         for (let vIdx = 0; vIdx < numV; vIdx++) {
           const lv = face.localVerts[vIdx];
           if (vIdx >= tf.wVerts.length) {
             tf.wVerts.push([0, 0, 0]);
             tf.uvs.push([0, 0]);
           }
           const ly = -lv[1] * scale;
           const vx = lv[0] * scale;
           tf.wVerts[vIdx][0] = vx * cosYaw - ly * sinYaw + baseX;
           tf.wVerts[vIdx][1] = vx * sinYaw + ly * cosYaw + baseY;
           tf.wVerts[vIdx][2] = lv[2] * scale + floorH;
 
           tf.uvs[vIdx][0] = faceUVs[vIdx] ? faceUVs[vIdx][0] : 0;
           tf.uvs[vIdx][1] = faceUVs[vIdx] ? faceUVs[vIdx][1] : 0;
         }
       }
     }
   }
 
   const activeFaces = facePool.slice(0, facePoolCount);
   activeFaces.sort((a, b) => b.depth - a.depth);

  let vertexOffset = 0;
  let vertexIndex = 0;

  let currentBatchTex: string | null = null;
  let currentBatchStart = 0;
  let currentBatchCount = 0;

  for (let f = 0; f < activeFaces.length; f++) {
    const tf = activeFaces[f];

    if (outBatches) {
      if (f === 0) {
        currentBatchTex = tf.textureId;
        currentBatchStart = 0;
        currentBatchCount = 0;
      } else if (tf.textureId !== currentBatchTex) {
        if (currentBatchCount > 0) {
          outBatches.push({
            textureId: currentBatchTex,
            startVertex: currentBatchStart,
            vertexCount: currentBatchCount,
          });
        }
        currentBatchTex = tf.textureId;
        currentBatchStart = vertexIndex;
        currentBatchCount = 0;
      }
    }

    const N = tf.numVerts;
    for (let i = 1; i < N - 1; i++) {
      const triIndices = [0, i, i + 1];
      for (let k = 0; k < 3; k++) {
        const qIdx = triIndices[k];
        const v = tf.wVerts[qIdx];
        const uv = tf.uvs[qIdx];

        if (vertexOffset + 12 > targetBuffer.length) {
          break;
        }

        targetBuffer[vertexOffset++] = v[0]; // worldX
        targetBuffer[vertexOffset++] = v[1]; // worldY
        targetBuffer[vertexOffset++] = v[2]; // worldZ
        targetBuffer[vertexOffset++] = tf.faceCol[0]; // R
        targetBuffer[vertexOffset++] = tf.faceCol[1]; // G
        targetBuffer[vertexOffset++] = tf.faceCol[2]; // B
        targetBuffer[vertexOffset++] = tf.faceCol[3]; // A
        targetBuffer[vertexOffset++] = v[0]; // lightX
        targetBuffer[vertexOffset++] = v[1]; // lightY
        targetBuffer[vertexOffset++] = tf.side; // side
        targetBuffer[vertexOffset++] = uv[0]; // u
        targetBuffer[vertexOffset++] = uv[1]; // v

        vertexIndex++;
        currentBatchCount++;
      }
    }
  }

  if (outBatches && currentBatchCount > 0) {
    outBatches.push({
      textureId: currentBatchTex,
      startVertex: currentBatchStart,
      vertexCount: currentBatchCount,
    });
  }

  return vertexIndex;
}

/**
 * CPU Software Fallback renderer for PolyObjects.
 * Projects 3D quad faces onto Canvas 2D context.
 */
export function drawPolyObjectSoftware(
  ctx: CanvasRenderingContext2D,
  inst: PolyObjectInstance,
  width: number,
  height: number,
  posX: number,
  posY: number,
  dirX: number,
  dirY: number,
  planeX: number,
  planeY: number,
  horizon: number,
  cameraZ: number,
  wallDepths?: Float32Array | number[],
  spriteMap?: Map<string, HTMLImageElement>,
  mirrorReflections?: MirrorReflection[][]
): void {
  const model = inst.model;
  if (!model || !model.cubes || model.cubes.length === 0) return;

  if (inst.isReflected && mirrorReflections) {
    ctx.save();
    ctx.beginPath();
    let hasClip = false;
    for (let x = 0; x < width; x++) {
      const colRef = mirrorReflections[x]?.[0];
      if (
        colRef &&
        colRef.maskBottom !== undefined &&
        colRef.maskBottom !== -1 &&
        colRef.maskTop !== undefined &&
        colRef.maskTop !== 9999 &&
        colRef.maskTop <= colRef.maskBottom
      ) {
        const top = colRef.maskTop;
        const bottom = colRef.maskBottom;
        if (bottom >= top) {
          ctx.rect(x, top, 1, bottom - top + 1);
          hasClip = true;
        }
      }
    }
    if (!hasClip) {
      ctx.rect(0, 0, 0, 0);
    }
    ctx.clip();
  }

  const scale = inst.scale !== undefined ? inst.scale : 1.0;
  const yOff = inst.yOffset || 0.0;
  const baseX = inst.baseX;
  const baseY = inst.baseY;
  const floorH = inst.sFloorHeight + yOff;

  const invDet = 1.0 / (planeX * dirY - dirX * planeY);

  let yaw = 0;
  if (typeof inst.facing === 'number') {
    yaw = (inst.facing * Math.PI) / 180;
  } else if (typeof inst.facing === 'string') {
    const f = inst.facing.toUpperCase();
    if (f === 'E') yaw = Math.PI / 2;
    else if (f === 'S') yaw = Math.PI;
    else if (f === 'W') yaw = (3 * Math.PI) / 2;
    else if (f === 'NE') yaw = Math.PI / 4;
    else if (f === 'SE') yaw = (3 * Math.PI) / 4;
    else if (f === 'SW') yaw = (5 * Math.PI) / 4;
    else if (f === 'NW') yaw = (7 * Math.PI) / 4;
  }

  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  interface QuadToDraw {
    depth: number;
    pts: [number, number][];
    uvs?: [number, number][];
    rawUVs?: [number, number][];
    color: string;
    sideMult: number;
    textureId?: string | null;
    textureLayers?: any[] | null;
  }

  const quadsToDraw: QuadToDraw[] = [];

  for (let c = 0; c < model.cubes.length; c++) {
    const cube = model.cubes[c];
    const baseCol = parseColorToRGBA(cube.color || '#8B5A2B');

    const cachedCube = getOrCreateCachedCube(cube);
    const faces = cachedCube.unscaledFaces;

    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];

      const lny = -face.norm[1];
      const nxW = face.norm[0] * cosYaw - lny * sinYaw;
      const nyW = face.norm[0] * sinYaw + lny * cosYaw;
      const nzW = face.norm[2];

      const fcX = face.localAvg[0] * scale * cosYaw - (-face.localAvg[1] * scale) * sinYaw + baseX;
      const fcY = face.localAvg[0] * scale * sinYaw + (-face.localAvg[1] * scale) * cosYaw + baseY;
      const fcZ = face.localAvg[2] * scale + floorH;

      const toCamX = posX - fcX;
      const toCamY = posY - fcY;
      const toCamZ = cameraZ - fcZ;
      const dot = nxW * toCamX + nyW * toCamY + nzW * toCamZ;

      const isCulled = inst.isReflected ? (dot >= 0) : (dot <= 0);
      if (isCulled) continue;

      const faceKey = face.key as keyof typeof cube.faceTextures;
      const faceTex = cube.faceTextures?.[faceKey] || cube.textureId || null;
      const faceLayers = cube.faceTextureLayers?.[faceKey] || cube.textureLayers || null;
      const faceTransform = cube.faceTransforms?.[faceKey] || cube.textureTransform;

      let effectiveTexId = faceTex;
      if (faceLayers && faceLayers.some(l => l && l.enabled !== false && l.textureId)) {
        effectiveTexId = getCompositeTextureKey(faceTex, faceLayers);
      }

      let faceCol = effectiveTexId ? [1.0, 1.0, 1.0, 1.0] : baseCol;
      if (!effectiveTexId && cube.faceColors && cube.faceColors[face.key as keyof typeof cube.faceColors]) {
        faceCol = parseColorToRGBA(cube.faceColors[face.key as keyof typeof cube.faceColors]!);
      }

      const numVerts = face.localVerts.length;
      const projectedPts: [number, number][] = [];
      let behindCount = 0;
      let occludedCount = 0;

      for (let p = 0; p < numVerts; p++) {
        const lv = face.localVerts[p];
        const ly = -lv[1] * scale;
        const vx = lv[0] * scale;
        const wx = vx * cosYaw - ly * sinYaw + baseX;
        const wy = vx * sinYaw + ly * cosYaw + baseY;
        const wz = lv[2] * scale + floorH;

        const dx = wx - posX;
        const dy = wy - posY;

        const transformX = invDet * (dirY * dx - dirX * dy);
        const transformY = invDet * (-planeY * dx + planeX * dy);

        if (transformY <= 0.05) {
          behindCount++;
        } else {
          const screenX = (width / 2) * (1 + transformX / transformY);
          const screenXInt = Math.floor(screenX);
          const relZ = wz - cameraZ;
          const screenY = horizon - (relZ * height) / transformY;

          if (inst.isReflected) {
            if (!mirrorReflections || screenXInt < 0 || screenXInt >= width || !mirrorReflections[screenXInt] || mirrorReflections[screenXInt].length === 0) {
              occludedCount++;
            } else {
              const colRef = mirrorReflections[screenXInt][mirrorReflections[screenXInt].length - 1];
              if (screenY < colRef.maskTop || screenY > colRef.maskBottom) {
                occludedCount++;
              }
            }
          } else if (wallDepths && screenXInt >= 0 && screenXInt < width) {
            if (transformY > wallDepths[screenXInt] + 0.25) {
              occludedCount++;
            }
          }
          projectedPts.push([screenX, screenY]);
        }
      }

      if (occludedCount === numVerts) continue;

      if (behindCount === 0 && projectedPts.length === numVerts) {
        const light = inst.lightColor || { r: 1.0, g: 1.0, b: 1.0 };
        const r = Math.round(faceCol[0] * 255 * face.side * light.r);
        const g = Math.round(faceCol[1] * 255 * face.side * light.g);
        const b = Math.round(faceCol[2] * 255 * face.side * light.b);
        const fillStr = `rgb(${r},${g},${b})`;

        const dxFc = fcX - posX;
        const dyFc = fcY - posY;
        const dzFc = fcZ - cameraZ;
        const transformXFc = invDet * (dirY * dxFc - dirX * dyFc);
        const transformYFc = invDet * (-planeY * dxFc + planeX * dyFc);
        const depth = transformYFc + 0.0001 * (transformXFc * transformXFc + dzFc * dzFc);

        const faceUVs = applyTextureTransformToUVs(face.rawUVs, faceTransform);

        quadsToDraw.push({
          depth,
          pts: projectedPts,
          uvs: faceUVs,
          rawUVs: face.rawUVs,
          color: fillStr,
          sideMult: face.side,
          textureId: effectiveTexId,
          textureLayers: faceLayers,
        });
      }
    }
  }

  quadsToDraw.sort((a, b) => b.depth - a.depth);

  for (let q = 0; q < quadsToDraw.length; q++) {
    const quad = quadsToDraw[q];
    let drewTexture = false;

    if (quad.textureId || (quad.textureLayers && quad.textureLayers.length > 0)) {
      const img = quad.textureId ? getPolyTextureImage(quad.textureId, spriteMap) : null;
      drawTexturedPolygonCanvas(
        ctx,
        quad.pts,
        (quad as any).uvs,
        img,
        quad.sideMult,
        inst.lightColor,
        quad.textureLayers,
        spriteMap,
        (quad as any).rawUVs
      );
      if (img || (quad.textureLayers && quad.textureLayers.some(l => l.enabled !== false && l.textureId))) {
        drewTexture = true;
      }
    }

    if (!drewTexture) {
      ctx.beginPath();
      ctx.moveTo(quad.pts[0][0], quad.pts[0][1]);
      for (let pIdx = 1; pIdx < quad.pts.length; pIdx++) {
        ctx.lineTo(quad.pts[pIdx][0], quad.pts[pIdx][1]);
      }
      ctx.closePath();
      ctx.fillStyle = quad.color;
      ctx.fill();
      ctx.strokeStyle = quad.color;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    if (inst.isHighlighted) {
      const timePulse = Math.sin(Date.now() / 150) * 0.5 + 0.5;
      const alpha = 0.10 + 0.30 * timePulse;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(quad.pts[0][0], quad.pts[0][1]);
      for (let pIdx = 1; pIdx < quad.pts.length; pIdx++) {
        ctx.lineTo(quad.pts[pIdx][0], quad.pts[pIdx][1]);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 230, 130, ${(alpha * 1.5).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  if (inst.isReflected && mirrorReflections) {
    ctx.restore();
  }
}

// Cached scratch arrays to avoid per-frame garbage collection
let tempCubeMinY: Float32Array | null = null;
let tempCubeMaxY: Float32Array | null = null;
let tempCubeMinDist: Float32Array | null = null;

/**
 * Generate lightweight column-based occlusion spans (PassThroughWall) for polyObjects
 * so that 2D sprites behind 3D polyObject models are correctly occluded in screen space,
 * respecting interior gaps, holes, and spaces between sub-cubes (like chair backrests).
 */
export function generatePolyObjectOccluders(
  instances: PolyObjectInstance[],
  posX: number,
  posY: number,
  cameraZ: number,
  dirX: number,
  dirY: number,
  planeX: number,
  planeY: number,
  horizon: number,
  width: number,
  height: number,
  passThroughWalls: PassThroughWall[][],
  zBuffer?: Float32Array | number[]
): void {
  if (!instances || instances.length === 0 || !passThroughWalls || width <= 0) return;

  const det = planeX * dirY - dirX * planeY;
  if (Math.abs(det) < 1e-6) return;
  const invDet = 1.0 / det;

  if (!tempCubeMinY || tempCubeMinY.length < width) {
    tempCubeMinY = new Float32Array(width);
    tempCubeMaxY = new Float32Array(width);
    tempCubeMinDist = new Float32Array(width);
  }

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    if (inst.isReflected) continue;
    const model = inst.model;
    if (!model || !model.cubes || model.cubes.length === 0) continue;

    const scale = inst.scale !== undefined ? inst.scale : 1.0;
    const yOff = inst.yOffset || 0.0;
    const baseX = inst.baseX;
    const baseY = inst.baseY;
    const floorH = inst.sFloorHeight + yOff;

    let yaw = 0;
    if (typeof inst.facing === 'number') {
      yaw = (inst.facing * Math.PI) / 180;
    } else if (typeof inst.facing === 'string') {
      const f = inst.facing.toUpperCase();
      if (f === 'E') yaw = Math.PI / 2;
      else if (f === 'S') yaw = Math.PI;
      else if (f === 'W') yaw = (3 * Math.PI) / 2;
      else if (f === 'NE') yaw = Math.PI / 4;
      else if (f === 'SE') yaw = (3 * Math.PI) / 4;
      else if (f === 'SW') yaw = (5 * Math.PI) / 4;
      else if (f === 'NW') yaw = (7 * Math.PI) / 4;
    }

    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    // Process each cube individually so gaps/holes between cubes are preserved
    for (let c = 0; c < model.cubes.length; c++) {
      const cube = model.cubes[c];

      const cachedCube = getOrCreateCachedCube(cube);
      const faces = cachedCube.occluderFaces;

      tempCubeMinY.fill(Infinity);
      tempCubeMaxY.fill(-Infinity);
      tempCubeMinDist.fill(Infinity);

      let cubeHasSpan = false;

      for (let f = 0; f < faces.length; f++) {
        const face = faces[f];

        const nxW = face.norm[0] * cosYaw - face.norm[1] * sinYaw;
        const nyW = face.norm[0] * sinYaw + face.norm[1] * cosYaw;
        const nzW = face.norm[2];

        const fcX = face.localAvg[0] * scale * cosYaw - face.localAvg[1] * scale * sinYaw + baseX;
        const fcY = face.localAvg[0] * scale * sinYaw + face.localAvg[1] * scale * cosYaw + baseY;
        const fcZ = face.localAvg[2] * scale + floorH;

        const toCamX = posX - fcX;
        const toCamY = posY - fcY;
        const toCamZ = cameraZ - fcZ;
        if (nxW * toCamX + nyW * toCamY + nzW * toCamZ <= 0) continue;

        const numFaceVerts = face.localVerts.length;
        const projVerts: { x: number; y: number; transY: number }[] = [];
        let allBehind = true;

        for (let vIdx = 0; vIdx < numFaceVerts; vIdx++) {
          const lv = face.localVerts[vIdx];
          const vx = lv[0] * scale;
          const vy = lv[1] * scale;
          const vz = lv[2] * scale;

          const wx = vx * cosYaw - vy * sinYaw + baseX;
          const wy = vx * sinYaw + vy * cosYaw + baseY;
          const wz = vz + floorH;

          const dx = wx - posX;
          const dy = wy - posY;
          const relZ = wz - cameraZ;

          const transX = invDet * (dirY * dx - dirX * dy);
          const transY = invDet * (-planeY * dx + planeX * dy);

          if (transY > 0.05) allBehind = false;

          const screenX = (width / 2) * (1 + transX / Math.max(0.01, transY));
          const screenY = horizon - (relZ * height) / Math.max(0.01, transY);

          projVerts.push({ x: screenX, y: screenY, transY });
        }

        if (allBehind) continue;

        let minXScr = Math.floor(Math.min(projVerts[0].x, projVerts[1].x, projVerts[2].x, projVerts[3].x));
        let maxXScr = Math.ceil(Math.max(projVerts[0].x, projVerts[1].x, projVerts[2].x, projVerts[3].x));

        // Оптимизация: сужаем горизонтальную проекцию окклюдера, чтобы предотвратить появление дыр (gaps)
        // по краям трехмерной модели (особенно у кастомных и текстурированных polyObjects).
        // Это убирает дыры в оконных рамах, повышая производительность за счет уменьшения числа колонок.
        // Ограничиваем срез максимум 3 пикселями, чтобы при приближении в упор не возникало больших боковых дыр.
        const widthScr = maxXScr - minXScr;
        if (widthScr > 4) {
          const shrink = Math.min(Math.floor(widthScr * 0.125), 3);
          minXScr += shrink;
          maxXScr -= shrink;
        }

        minXScr = Math.max(0, minXScr);
        maxXScr = Math.min(width - 1, maxXScr);

        if (minXScr > maxXScr) continue;

        for (let x = minXScr; x <= maxXScr; x++) {
          for (let e = 0; e < numFaceVerts; e++) {
            const p0 = projVerts[e];
            const p1 = projVerts[(e + 1) % numFaceVerts];

            if ((p0.x <= x && p1.x >= x) || (p1.x <= x && p0.x >= x)) {
              const dx = p1.x - p0.x;
              const t = Math.abs(dx) > 1e-4 ? (x - p0.x) / dx : 0.5;
              const yInterp = p0.y + t * (p1.y - p0.y);
              const tyInterp = p0.transY + t * (p1.transY - p0.transY);

              if (yInterp < tempCubeMinY[x]) tempCubeMinY[x] = yInterp;
              if (yInterp > tempCubeMaxY[x]) tempCubeMaxY[x] = yInterp;
              if (tyInterp < tempCubeMinDist[x]) tempCubeMinDist[x] = tyInterp;
              cubeHasSpan = true;
            }
          }
        }
      }

      if (!cubeHasSpan) continue;

      // Push occlusion span for this specific cube
      for (let x = 0; x < width; x++) {
        const minY = tempCubeMinY[x];
        const maxY = tempCubeMaxY[x];
        const minTransY = tempCubeMinDist[x];

        if (minY >= maxY || minTransY <= 0.05) continue;

        if (zBuffer && zBuffer[x] !== undefined && zBuffer[x] > 0 && zBuffer[x] < minTransY - 0.05) {
          continue;
        }

        const topY = Math.floor(minY);
        const botY = Math.ceil(maxY);

        if (topY >= botY) continue;

        if (zBuffer && zBuffer[x] !== undefined && (zBuffer[x] === 0 || minTransY < zBuffer[x])) {
          // Do not write minTransY here, as it forces the 3D models to act as infinitely tall walls in the Z-Buffer,
          // hiding any 2D sprites on the same tile or behind them. 
          // Accurate occlusion is handled segment-by-segment via passThroughWalls!
        }

        if (!passThroughWalls[x]) passThroughWalls[x] = [];

        passThroughWalls[x].push({
          dist: minTransY,
          exitDist: minTransY + 0.5,
          mapX: Math.floor(baseX),
          mapY: Math.floor(baseY),
          side: 0,
          layer: 0,
          wallTop: topY,
          wallBottom: botY,
          isOccluderOnly: true,
          isPolyOccluder: true,
        } as PassThroughWall);
      }
    }
  }
}
