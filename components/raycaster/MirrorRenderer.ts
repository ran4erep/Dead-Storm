import { RaycasterBuffer, adjustLightForClosedDoors } from "./RaycasterUtils";
import { Tile } from "../../types";
import {
  calculateHingeIntersection,
  calculateSlideIntersection,
} from "./DoorUtils";
import { getDepthFactor } from "./DepthEffect";
import { MirrorReflection } from "./RaycasterTypes";

import { getUpperGeometryLayersCache, getDistanceField, resolveTileCutoutAxis, PrecalculatedUpperLayer } from "./RaycastCore";

const outHit1_local = { hit: false, t: Infinity, side: 0, tFar: Infinity, tFarX: Infinity, tFarY: Infinity };
const outHit2_local = { hit: false, t: Infinity, side: 0, tFar: Infinity, tFarX: Infinity, tFarY: Infinity };
const outHitHole_local = { hit: false, t: Infinity, side: 0, tFar: Infinity, tFarX: Infinity, tFarY: Infinity };

function intersectAABB_inplace_local(
  posX: number,
  posY: number,
  rayDirX: number,
  rayDirY: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  out: typeof outHit1_local
) {
  let t1x = (minX - posX) / rayDirX;
  let t2x = (maxX - posX) / rayDirX;
  let t1y = (minY - posY) / rayDirY;
  let t2y = (maxY - posY) / rayDirY;
  
  let tNearX = rayDirX > 0 ? t1x : t2x;
  let tFarX = rayDirX > 0 ? t2x : t1x;
  let tNearY = rayDirY > 0 ? t1y : t2y;
  let tFarY = rayDirY > 0 ? t2y : t1y;
  
  if (rayDirX === 0) {
    const inside = posX >= minX && posX <= maxX;
    tNearX = inside ? -Infinity : Infinity;
    tFarX = inside ? Infinity : -Infinity;
  }
  if (rayDirY === 0) {
    const inside = posY >= minY && posY <= maxY;
    tNearY = inside ? -Infinity : Infinity;
    tFarY = inside ? Infinity : -Infinity;
  }

  const tNear = tNearX > tNearY ? tNearX : tNearY;
  const tFar = tFarX < tFarY ? tFarX : tFarY;
  
  if (tNear <= tFar && tFar >= 0) {
    out.hit = true;
    out.t = tNear >= 0 ? tNear : tFar;
    out.side = out.t === tNear ? (tNearX > tNearY ? 0 : 1) : (tFarX < tFarY ? 0 : 1);
    out.tFar = tFar;
    out.tFarX = tFarX;
    out.tFarY = tFarY;
  } else {
    out.hit = false;
    out.t = Infinity;
    out.side = 0;
  }
}

export interface LightColor {
  r: number;
  g: number;
  b: number;
}

const DEFAULT_LIGHT_COLOR: LightColor = { r: 1, g: 1, b: 1 };

export function getInterpolatedWallLight(
  lightX: number,
  lightY: number,
  wallX: number,
  side: number,
  rayDirX: number,
  rayDirY: number,
  lightMap: LightColor[][] | undefined,
  grid: any[][],
  activeGrids: any[][][],
  mapWidth: number,
  mapHeight: number,
  layer: number = 0
): LightColor {
  if (!lightMap) return DEFAULT_LIGHT_COLOR;
  if (lightY < 0 || lightY >= mapHeight || lightX < 0 || lightX >= mapWidth) {
    return DEFAULT_LIGHT_COLOR;
  }
  const row = lightMap[lightY];
  if (!row) return DEFAULT_LIGHT_COLOR;
  const cellC = row[lightX] || DEFAULT_LIGHT_COLOR;

  // Exact wall coordinates
  let wX = wallX - Math.floor(wallX);
  if (wX < 0) wX = 0;
  if (wX > 1) wX = 1;

  let flipped = false;
  if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
    flipped = true;
  }

  if (flipped) {
    wX = 1 - wX;
  }

  let lightX_L = lightX;
  let lightY_L = lightY;
  let lightX_R = lightX;
  let lightY_R = lightY;

  if (side === 0) {
    if (flipped) {
      lightY_L = lightY + 1;
      lightY_R = lightY - 1;
    } else {
      lightY_L = lightY - 1;
      lightY_R = lightY + 1;
    }
  } else {
    if (flipped) {
      lightX_L = lightX + 1;
      lightX_R = lightX - 1;
    } else {
      lightX_L = lightX - 1;
      lightX_R = lightX + 1;
    }
  }

  let opaqueL = false;
  if (lightY_L < 0 || lightY_L >= mapHeight || lightX_L < 0 || lightX_L >= mapWidth) {
    opaqueL = true;
  } else if (activeGrids && activeGrids.length > 0) {
    const activeLayer = layer >= 0 && layer < activeGrids.length ? activeGrids[layer] : activeGrids[0];
    if (activeLayer) {
      const tile = activeLayer[lightY_L]?.[lightX_L];
      if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
        opaqueL = true;
      }
    }
  } else {
    const tile = grid[lightY_L]?.[lightX_L];
    if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
      opaqueL = true;
    }
  }

  let opaqueR = false;
  if (lightY_R < 0 || lightY_R >= mapHeight || lightX_R < 0 || lightX_R >= mapWidth) {
    opaqueR = true;
  } else if (activeGrids && activeGrids.length > 0) {
    const activeLayer = layer >= 0 && layer < activeGrids.length ? activeGrids[layer] : activeGrids[0];
    if (activeLayer) {
      const tile = activeLayer[lightY_R]?.[lightX_R];
      if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
        opaqueR = true;
      }
    }
  } else {
    const tile = grid[lightY_R]?.[lightX_R];
    if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
      opaqueR = true;
    }
  }

  const cellL = (!opaqueL && lightMap[lightY_L]) ? (lightMap[lightY_L][lightX_L] || cellC) : cellC;
  const cellR = (!opaqueR && lightMap[lightY_R]) ? (lightMap[lightY_R][lightX_R] || cellC) : cellC;

  let r = 1, g = 1, b = 1;
  if (wX <= 0.5) {
    const t = wX + 0.5;
    r = cellL.r * (1 - t) + cellC.r * t;
    g = cellL.g * (1 - t) + cellC.g * t;
    b = cellL.b * (1 - t) + cellC.b * t;
  } else {
    const t = wX - 0.5;
    r = cellC.r * (1 - t) + cellR.r * t;
    g = cellC.g * (1 - t) + cellR.g * t;
    b = cellC.b * (1 - t) + cellR.b * t;
  }

  return { r, g, b };
}

export function getBilinearFloorLight(
  x: number,
  y: number,
  lightMap: LightColor[][] | undefined,
  mapWidth: number,
  mapHeight: number
): LightColor {
  if (!lightMap) return DEFAULT_LIGHT_COLOR;

  const u = x - 0.5;
  const v = y - 0.5;

  let x0 = Math.floor(u);
  let y0 = Math.floor(v);
  let x1 = x0 + 1;
  let y1 = y0 + 1;

  if (x0 < 0) x0 = 0; if (x0 >= mapWidth) x0 = mapWidth - 1;
  if (x1 < 0) x1 = 0; if (x1 >= mapWidth) x1 = mapWidth - 1;
  if (y0 < 0) y0 = 0; if (y0 >= mapHeight) y0 = mapHeight - 1;
  if (y1 < 0) y1 = 0; if (y1 >= mapHeight) y1 = mapHeight - 1;

  const row0 = lightMap[y0];
  const row1 = lightMap[y1];
  if (!row0 || !row1) return DEFAULT_LIGHT_COLOR;

  const c00 = row0[x0] || DEFAULT_LIGHT_COLOR;
  const c10 = row0[x1] || DEFAULT_LIGHT_COLOR;
  const c01 = row1[x0] || DEFAULT_LIGHT_COLOR;
  const c11 = row1[x1] || DEFAULT_LIGHT_COLOR;

  const tx = u - Math.floor(u);
  const ty = v - Math.floor(v);

  const r = (c00.r * (1 - tx) + c10.r * tx) * (1 - ty) + (c01.r * (1 - tx) + c11.r * tx) * ty;
  const g = (c00.g * (1 - tx) + c10.g * tx) * (1 - ty) + (c01.g * (1 - tx) + c11.g * tx) * ty;
  const b = (c00.b * (1 - tx) + c10.b * tx) * (1 - ty) + (c01.b * (1 - tx) + c11.b * tx) * ty;

  return { r, g, b };
}

const mirrorPool: MirrorReflection[] = [];
let mirrorPoolIndex = 0;

export const resetMirrorPool = () => {
  mirrorPoolIndex = 0;
};

const getMirrorFromPool = (): MirrorReflection => {
  if (mirrorPoolIndex >= mirrorPool.length) {
    mirrorPool.push({
      drawStart: 0,
      drawEnd: 0,
      perpWallDist: 0,
      refRayDirX: 0,
      refRayDirY: 0,
      mirrorHitX: 0,
      mirrorHitY: 0,
      side: 0,
      maskTop: 0,
      maskBottom: 0,
      mirrorRefDist: 0,
      rMult: 0,
      gMult: 0,
      bMult: 0,
      fR: 0,
      fG: 0,
      fB: 0,
      texX: 0,
      step: 0,
      texPosStart: 0,
      mirrorAlpha: 0,
    });
  }
  return mirrorPool[mirrorPoolIndex++];
};

export const performMirrorRaycast = (
  x: number,
  posX: number,
  posY: number,
  perpWallDist: number,
  rayDirX: number,
  rayDirY: number,
  side: number,
  mapWidth: number,
  mapHeight: number,
  grid: Tile[][],
  activeGrids: Tile[][][],
  hasUpperLayers: boolean,
  auxBuffers: Map<string, RaycasterBuffer> | undefined,
  wallBuffer: RaycasterBuffer | null,
  doorBuffer: RaycasterBuffer | null,
  customWallBuffers: Map<number, RaycasterBuffer> | undefined,
  mirrorReflections: MirrorReflection[][],
  drawStart: number,
  drawEnd: number,
  levelDrawStart: number,
  lineHeight: number,
  buf: RaycasterBuffer,
  isDoor: boolean,
  isDoorFrame: boolean,
  isDoorEdge: boolean,
  doorOffset: number,
  isTextureFlipped: boolean,
  currentTile: Tile,
  lightMap: { r: number; g: number; b: number }[][] | undefined,
  outdoorMap: boolean[][] | undefined,
  lightningMap: Float32Array | null | undefined,
  lightningIntensity: number,
  muzzleFlashIntensity: number,
  activeFlashes: { x: number; y: number; intensity: number }[] | undefined,
  muzzleR: number,
  muzzleG: number,
  muzzleB: number,
  lightningR: number,
  lightningG: number,
  lightningB: number,
  mapX: number,
  mapY: number,
  debugTextures: boolean,
  renderDistance: number,
  precalcDistanceField?: Uint8Array[],
  precalcUpperGeometry?: PrecalculatedUpperLayer[][][],
) => {
  // Limit render distance to avoid deep loops, but keep it high enough for quality
  renderDistance = renderDistance > 0 ? Math.max(3, renderDistance) : 15;
  let mirrorRefDist = 1000; // Default to far
  let mirrorRefBuf: RaycasterBuffer | null = null;
  let mirrorRefSide = 0;
  let mirrorRefWallX = 0;
  let mirrorRefRMult = 1.0,
    mirrorRefGMult = 1.0,
    mirrorRefBMult = 1.0;
  let mirrorHitX = 0,
    mirrorHitY = 0;
  let refRayDirX = 0,
    refRayDirY = 0;
  let hasMirrorHit = false;

  // Store upper walls found in reflection
  const mirrorPassThroughWalls: {
    dist: number;
    exitDist: number;
    layer: number;
    mapX: number;
    mapY: number;
    side: number;
    assetId?: string;
    bottomTextureId?: string;
    topTextureId?: string;
  }[] = [];

  if (
    !currentTile.isMirrorBroken &&
    currentTile.mirror &&
    currentTile.maskId &&
    (auxBuffers?.has('TEX_' + currentTile.maskId) || auxBuffers?.has(currentTile.maskId))
  ) {
    mirrorHitX = posX + perpWallDist * rayDirX;
    mirrorHitY = posY + perpWallDist * rayDirY;

    if (!isDoor) {
      if (side === 0) {
        mirrorHitX = rayDirX > 0 ? mapX : mapX + 1.0;
      } else {
        mirrorHitY = rayDirY > 0 ? mapY : mapY + 1.0;
      }
    }

    // 1. Calculate Reflection Ray
    refRayDirX = rayDirX;
    refRayDirY = rayDirY;
    if (side === 0) refRayDirX = -rayDirX;
    else refRayDirY = -rayDirY;

    let mirrorAlpha =
      currentTile.mirrorOpacity !== undefined
        ? Math.floor(currentTile.mirrorOpacity * 255)
        : 80;

    let faceDirectionStr: "N" | "E" | "S" | "W" | null = null;
    if (!isDoor) {
      if (side === 0) {
        faceDirectionStr = rayDirX > 0 ? "W" : "E";
      } else {
        faceDirectionStr = rayDirY > 0 ? "N" : "S";
      }
    }

    // Find the specific texture ID for this face (if it exists) instead of using the base asset ID
    let actualTextureId = isDoor
      ? currentTile.door?.textureId
      : currentTile.assetId;
    if (!isDoor && faceDirectionStr && currentTile.faces?.[faceDirectionStr]) {
      actualTextureId = currentTile.faces[faceDirectionStr];
    }

    const step = buf.height / lineHeight;
    const texPosStart = (drawStart - levelDrawStart) * step;
    let texX = 0;
    if (isDoor) {
      if (isDoorFrame) {
        const frameTexW = Math.floor(buf.width * 0.15);
        texX = Math.floor(doorOffset * frameTexW);
        if (texX >= frameTexW) texX = frameTexW - 1;
        if (texX < 0) texX = 0;
      } else if (isDoorEdge) {
        const frameWidth = Math.floor(buf.width * 0.2);
        texX = Math.floor(doorOffset * frameWidth);
        if (texX >= frameWidth) texX = frameWidth - 1;
        if (texX < 0) texX = 0;
      } else {
        texX = Math.floor(doorOffset * buf.width);
        if (texX >= buf.width) texX = buf.width - 1;
        if (texX < 0) texX = 0;
        if (isTextureFlipped) texX = buf.width - texX - 1;
      }
    } else {
      let wallX;
      if (side === 0) wallX = posY + perpWallDist * rayDirY;
      else wallX = posX + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);
      texX = Math.floor(wallX * buf.width);
      if (texX >= buf.width) texX = buf.width - 1;
      if (texX < 0) texX = 0;
      if (side === 0 && rayDirX < 0) texX = buf.width - texX - 1;
      if (side === 1 && rayDirY > 0) texX = buf.width - texX - 1;
    }

    // Calculate Flash Lighting for Mirror Surface
    let fR = 0,
      fG = 0,
      fB = 0;

    // Fix lightning flash rendering in closed spaces for mirrors
    const mirrorMapX = Math.floor(mirrorHitX);
    const mirrorMapY = Math.floor(mirrorHitY);
    const isOutdoor = outdoorMap
      ? mirrorMapY >= 0 &&
        mirrorMapY < mapHeight &&
        mirrorMapX >= 0 &&
        mirrorMapX < mapWidth
        ? outdoorMap[mirrorMapY][mirrorMapX]
        : false
      : true;
    const lightningMult =
      lightningMap &&
      mirrorMapY >= 0 &&
      mirrorMapY < mapHeight &&
      mirrorMapX >= 0 &&
      mirrorMapX < mapWidth
        ? lightningMap[mirrorMapY * mapWidth + mirrorMapX]
        : isOutdoor
          ? 1.0
          : 0.0;
    const effectiveLightningIntensity = lightningIntensity * lightningMult;

    if (
      effectiveLightningIntensity > 0 ||
      muzzleFlashIntensity > 0 ||
      (activeFlashes && activeFlashes.length > 0)
    ) {
      const playerDistSq = (mirrorHitX - posX) ** 2 + (mirrorHitY - posY) ** 2;
      const mInt = muzzleFlashIntensity / (playerDistSq * 0.5 + 1.0);
      let enemyFlashR = 0,
        enemyFlashG = 0,
        enemyFlashB = 0;
      if (activeFlashes) {
        for (let i = 0; i < activeFlashes.length; i++) {
          const f = activeFlashes[i] as any;
          const d2 = (f.x - mirrorHitX) ** 2 + (f.y - mirrorHitY) ** 2;
          const fInt = f.intensity / (d2 * 0.5 + 1.0);
          if (f.isFlashbang) {
            enemyFlashR += fInt * 2.0;
            enemyFlashG += fInt * 2.0;
            enemyFlashB += fInt * 2.0;
          } else {
            enemyFlashR += fInt * muzzleR;
            enemyFlashG += fInt * muzzleG;
            enemyFlashB += fInt * muzzleB;
          }
        }
      }
      fR =
        effectiveLightningIntensity * lightningR + mInt * muzzleR + enemyFlashR;
      fG =
        effectiveLightningIntensity * lightningG + mInt * muzzleG + enemyFlashG;
      fB =
        effectiveLightningIntensity * lightningB + mInt * muzzleB + enemyFlashB;
    }

    // Calculate Wall Light for Mirror Surface
    let rMult = 1.0;
    let gMult = 1.0;
    let bMult = 1.0;
    if (lightMap) {
      let wallX = 0;
      if (side === 0) wallX = mirrorHitY;
      else wallX = mirrorHitX;
      wallX -= Math.floor(wallX);

      let lightX = mapX;
      let lightY = mapY;
      if (side === 0) {
        lightX = rayDirX > 0 ? mapX - 1 : mapX + 1;
      } else {
        lightY = rayDirY > 0 ? mapY - 1 : mapY + 1;
      }
      if (lightX < 0) lightX = 0;
      else if (lightX >= mapWidth) lightX = mapWidth - 1;
      if (lightY < 0) lightY = 0;
      else if (lightY >= mapHeight) lightY = mapHeight - 1;

      const wallLight = getInterpolatedWallLight(
        lightX,
        lightY,
        wallX,
        side,
        rayDirX,
        rayDirY,
        lightMap,
        grid,
        activeGrids,
        mapWidth,
        mapHeight,
        0
      );
      rMult = wallLight.r;
      gMult = wallLight.g;
      bMult = wallLight.b;
    }

    const mirror = getMirrorFromPool();
    mirror.drawStart = drawStart;
    mirror.drawEnd = drawEnd;
    mirror.perpWallDist = perpWallDist;
    mirror.refRayDirX = refRayDirX;
    mirror.refRayDirY = refRayDirY;
    mirror.mirrorHitX = mirrorHitX;
    mirror.mirrorHitY = mirrorHitY;
    mirror.side = side;
    mirror.maskTop = 9999;
    mirror.maskBottom = -1;
    mirror.mirrorRefDist = 1000;
    mirror.rMult = rMult;
    mirror.gMult = gMult;
    mirror.bMult = bMult;
    mirror.fR = fR;
    mirror.fG = fG;
    mirror.fB = fB;
    mirror.texX = texX;
    mirror.step = step;
    mirror.texPosStart = texPosStart;
    mirror.mirrorAlpha = mirrorAlpha;
    mirror.textureId = actualTextureId;
    mirrorReflections[x].push(mirror);

    hasMirrorHit = true;

    // 2. Secondary Raycast (Simplified DDA)
    let refMapX = mapX;
    let refMapY = mapY;
    if (side === 0) {
      refMapX += rayDirX > 0 ? -1 : 1;
    } else {
      refMapY += rayDirY > 0 ? -1 : 1;
    }

    const secResult = performSecondaryRaycast(
      mirrorHitX,
      mirrorHitY,
      refRayDirX,
      refRayDirY,
      refMapX,
      refMapY,
      mapWidth,
      mapHeight,
      grid,
      activeGrids,
      hasUpperLayers,
      mirrorPassThroughWalls,
      auxBuffers,
      wallBuffer,
      doorBuffer,
      customWallBuffers,
      lightMap,
      perpWallDist,
      mirrorReflections,
      x,
      debugTextures,
      renderDistance,
      side,
      precalcDistanceField,
      precalcUpperGeometry,
    );

    mirrorRefDist = secResult.mirrorRefDist;
    mirrorRefBuf = secResult.mirrorRefBuf;
    mirrorRefSide = secResult.mirrorRefSide;
    mirrorRefWallX = secResult.mirrorRefWallX;
    mirrorRefRMult = secResult.mirrorRefRMult;
    mirrorRefGMult = secResult.mirrorRefGMult;
    mirrorRefBMult = secResult.mirrorRefBMult;
    const refAbsTopZ = (secResult as any).refAbsTopZ !== undefined ? (secResult as any).refAbsTopZ : 1.0;
    const refAbsBotZ = (secResult as any).refAbsBotZ !== undefined ? (secResult as any).refAbsBotZ : 0.0;

    return {
      hasMirrorHit,
      mirrorRefDist,
      mirrorRefBuf,
      mirrorRefSide,
      mirrorRefWallX,
      mirrorRefRMult,
      mirrorRefGMult,
      mirrorRefBMult,
      mirrorHitX,
      mirrorHitY,
      refRayDirX,
      refRayDirY,
      mirrorPassThroughWalls,
      refAbsTopZ,
      refAbsBotZ,
    };
  }

  return {
    hasMirrorHit,
    mirrorRefDist,
    mirrorRefBuf,
    mirrorRefSide,
    mirrorRefWallX,
    mirrorRefRMult,
    mirrorRefGMult,
    mirrorRefBMult,
    mirrorHitX,
    mirrorHitY,
    refRayDirX,
    refRayDirY,
    mirrorPassThroughWalls,
    refAbsTopZ: 1.0,
    refAbsBotZ: 0.0,
  };
};

export const performSecondaryRaycast = (
  mirrorHitX: number,
  mirrorHitY: number,
  refRayDirX: number,
  refRayDirY: number,
  mapX: number,
  mapY: number,
  mapWidth: number,
  mapHeight: number,
  grid: Tile[][],
  activeGrids: Tile[][][],
  hasUpperLayers: boolean,
  mirrorPassThroughWalls: any[],
  auxBuffers: Map<string, RaycasterBuffer> | undefined,
  wallBuffer: RaycasterBuffer | null,
  doorBuffer: RaycasterBuffer | null,
  customWallBuffers: Map<number, RaycasterBuffer> | undefined,
  lightMap: { r: number; g: number; b: number }[][] | undefined,
  perpWallDist: number,
  mirrorReflections: MirrorReflection[][],
  x: number,
  debugTextures: boolean,
  renderDistance: number,
  initialSide: number,
  precalcDistanceField?: Uint8Array[],
  precalcUpperGeometry?: PrecalculatedUpperLayer[][][],
) => {
  // Limit render distance to avoid deep loops, but keep it high enough for quality
  renderDistance = renderDistance > 0 ? Math.max(3, renderDistance) : 15;
  let mirrorRefDist = 1000;
  let mirrorRefBuf: RaycasterBuffer | null = null;
  let mirrorRefSide = 0;
  let mirrorRefWallX = 0;
  let mirrorRefRMult = 1.0,
    mirrorRefGMult = 1.0,
    mirrorRefBMult = 1.0;
  let refAbsTopZ = 1.0;
  let refAbsBotZ = 0.0;

  let refMapX = mapX;
  let refMapY = mapY;
  let refSideDistX, refSideDistY;
  const refDeltaDistX = Math.abs(1 / refRayDirX);
  const refDeltaDistY = Math.abs(1 / refRayDirY);
  let refStepX, refStepY;
  let refHit = 0;

  if (refRayDirX < 0) {
    refStepX = -1;
    refSideDistX = (mirrorHitX - refMapX) * refDeltaDistX;
  } else {
    refStepX = 1;
    refSideDistX = (refMapX + 1.0 - mirrorHitX) * refDeltaDistX;
  }
  if (refRayDirY < 0) {
    refStepY = -1;
    refSideDistY = (mirrorHitY - refMapY) * refDeltaDistY;
  } else {
    refStepY = 1;
    refSideDistY = (refMapY + 1.0 - mirrorHitY) * refDeltaDistY;
  }

  if (refRayDirX === 0) refSideDistX = Infinity;
  if (refRayDirY === 0) refSideDistY = Infinity;

  let refLimit = renderDistance;
  const upperGeometryCache = precalcUpperGeometry || getUpperGeometryLayersCache(grid, activeGrids);
  const distanceField = precalcDistanceField || getDistanceField(grid, activeGrids);

  // Track which layers have their view completely blocked at this column
  const blockedLayers = new Uint8Array(activeGrids ? activeGrids.length : 1);

  // Initial side is the side of the mirror we hit
  let currentSide = initialSide;

  while (refHit === 0 && refLimit > 0) {
    if (
      refMapX < 0 ||
      refMapX >= mapWidth ||
      refMapY < 0 ||
      refMapY >= mapHeight
    ) {
      refHit = 1;
      mirrorRefDist = 1000;
      break;
    }

    // Check Upper Layers in Reflection
    if (hasUpperLayers) {
      const uLayers = upperGeometryCache[refMapY]?.[refMapX];
      if (uLayers && uLayers.length > 0) {
        for (let idx = 0; idx < uLayers.length; idx++) {
          const uLayer = uLayers[idx];
          const i = uLayer.layerIndex;
          if (uLayer.h > 0) {
            // If the layer is already blocked at a closer distance, skip
            if (blockedLayers[i] === 1) {
              continue;
            }

            let uDist;
            if (currentSide === 0) uDist = refSideDistX - refDeltaDistX;
            else uDist = refSideDistY - refDeltaDistY;
            // If it's the starting cell, distance is 0
            if (uDist < 0) uDist = 0;

            const uExitDist = Math.min(refSideDistX, refSideDistY);

            if (uLayer.isWindow) {
              intersectAABB_inplace_local(mirrorHitX, mirrorHitY, refRayDirX, refRayDirY, uLayer.b1MinX!, uLayer.b1MinY!, uLayer.b1MaxX!, uLayer.b1MaxY!, outHit1_local);
              intersectAABB_inplace_local(mirrorHitX, mirrorHitY, refRayDirX, refRayDirY, uLayer.b2MinX!, uLayer.b2MinY!, uLayer.b2MaxX!, uLayer.b2MaxY!, outHit2_local);
              intersectAABB_inplace_local(mirrorHitX, mirrorHitY, refRayDirX, refRayDirY, uLayer.holeMinX!, uLayer.holeMinY!, uLayer.holeMaxX!, uLayer.holeMaxY!, outHitHole_local);
              
              let hitSolid = false;
              let solidHitT = Infinity;
              let solidHitSide = currentSide;
              if (outHit1_local.hit && outHit1_local.t < solidHitT) { hitSolid = true; solidHitT = outHit1_local.t; solidHitSide = outHit1_local.side; }
              if (outHit2_local.hit && outHit2_local.t < solidHitT) { hitSolid = true; solidHitT = outHit2_local.t; solidHitSide = outHit2_local.side; }

              let holeHitTime = Infinity;
              if (outHitHole_local.hit) {
                holeHitTime = outHitHole_local.t;
              }

              if (hitSolid && solidHitT <= holeHitTime + 0.0001) {
                const upperTile = activeGrids[i]?.[refMapY]?.[refMapX];
                mirrorPassThroughWalls.push({
                  dist: solidHitT,
                  exitDist: uExitDist,
                  layer: i,
                  mapX: refMapX,
                  mapY: refMapY,
                  side: solidHitSide,
                  assetId: upperTile?.assetId,
                  bottomTextureId: upperTile?.bottomTextureId,
                  topTextureId: upperTile?.topTextureId,
                  topZ: uLayer.topZ,
                  bottomZ: uLayer.bottomZ,
                });
              } else if (outHitHole_local.hit) {
                const tHit = outHitHole_local.t;
                const exitDist = outHitHole_local.tFar;
                const hitSide = outHitHole_local.side;

                let hitsCheek = false;
                if (uLayer.cutoutAxis === 'NS' && outHitHole_local.tFar === outHitHole_local.tFarX) {
                  hitsCheek = true;
                } else if (uLayer.cutoutAxis === 'WE' && outHitHole_local.tFar === outHitHole_local.tFarY) {
                  hitsCheek = true;
                }

                const upperTile = activeGrids[i]?.[refMapY]?.[refMapX];
                
                let exactGlassDist = 0;
                let tOffsetVal = uLayer.offsetVal !== undefined ? uLayer.offsetVal : 0.0;
                let tThickness = uLayer.thickness !== undefined ? uLayer.thickness : 1.0;
                let gOffset = uLayer.glassOffset !== undefined ? uLayer.glassOffset : 0.5;
                if (uLayer.cutoutAxis === 'NS') {
                  let glassY = refMapY + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                  exactGlassDist = (glassY - mirrorHitY) / refRayDirY;
                } else {
                  let glassX = refMapX + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                  exactGlassDist = (glassX - mirrorHitX) / refRayDirX;
                }

                mirrorPassThroughWalls.push({
                  dist: tHit,
                  exitDist: exitDist,
                  layer: i,
                  mapX: refMapX,
                  mapY: refMapY,
                  side: hitSide,
                  assetId: upperTile?.assetId,
                  bottomTextureId: upperTile?.bottomTextureId,
                  topTextureId: upperTile?.topTextureId,
                  topZ: uLayer.topZ,
                  bottomZ: uLayer.bottomZ,
                  isWindow: true,
                  cutoutAxis: uLayer.cutoutAxis,
                  cutoutTop: uLayer.cutoutTop,
                  cutoutBottom: uLayer.cutoutBottom,
                  cutoutLeft: uLayer.cutoutLeft,
                  cutoutRight: uLayer.cutoutRight,
                  glassTransparency: uLayer.glassTransparency,
                  glassDist: exactGlassDist,
                  glassAssetId: uLayer.glassAssetId,
                  isGlassBroken: uLayer.isGlassBroken,
                });

                if (hitsCheek) {
                  mirrorPassThroughWalls.push({
                    dist: exitDist,
                    exitDist: exitDist + 0.05,
                    layer: i,
                    mapX: refMapX,
                    mapY: refMapY,
                    side: uLayer.cutoutAxis === 'NS' ? 0 : 1,
                    assetId: upperTile?.assetId,
                    bottomTextureId: upperTile?.bottomTextureId,
                    topTextureId: upperTile?.topTextureId,
                    topZ: uLayer.topZ,
                    bottomZ: uLayer.bottomZ,
                    isWindow: true,
                    cutoutAxis: uLayer.cutoutAxis,
                    cutoutTop: uLayer.cutoutTop,
                    cutoutBottom: uLayer.cutoutBottom,
                    cutoutLeft: uLayer.cutoutLeft,
                    cutoutRight: uLayer.cutoutRight,
                    glassTransparency: 0.0,
                    glassDist: exitDist,
                  });
                }
              }
            } else {
              const upperTile = activeGrids[i]?.[refMapY]?.[refMapX];
              mirrorPassThroughWalls.push({
                dist: uDist,
                exitDist: uExitDist,
                layer: i,
                mapX: refMapX,
                mapY: refMapY,
                side: currentSide,
                assetId: upperTile?.assetId,
                bottomTextureId: upperTile?.bottomTextureId,
                topTextureId: upperTile?.topTextureId,
                topZ: uLayer.topZ,
                bottomZ: uLayer.bottomZ,
              });
              if (uLayer.type === 'WALL' && (uLayer.bottomZ - i) <= 0.001 && (uLayer.topZ - i) >= 0.999) {
                blockedLayers[i] = 1;
              }
            }
          }
        }
      }
    }

    const refTile = grid[refMapY]?.[refMapX];
    if (refTile) {
      let result = null;
      let isWallHit = false;
      const isTransparent = refTile.type === "DOOR" && !!refTile.door?.maskId;

      if (refTile.type === "WALL") {
        if (blockedLayers[0] === 0) {
          let elev = refTile.elevation !== undefined ? refTile.elevation : 0;
          let h = refTile.height !== undefined ? Math.abs(refTile.height) : 1.0;
          if (refTile.height !== undefined && refTile.height < 0) {
            elev = 1.0 - h;
          }
          const topZ = elev + h;
          const bottomZ = elev;

          if (refTile.isWindow) {
            let thickness = refTile.thickness !== undefined ? refTile.thickness : 1.0;
            let offsetVal = refTile.offset !== undefined ? refTile.offset : 0.0;
            let cutoutAxis = resolveTileCutoutAxis(refTile, refMapX, refMapY, grid, mapWidth, mapHeight);
            
            let cLeft = refTile.cutout ? refTile.cutout.topLeft.x : 0.25;
            let cRight = refTile.cutout ? refTile.cutout.bottomRight.x : 0.75;
            
            let wMinX = refMapX, wMaxX = refMapX + 1.0;
            let wMinY = refMapY, wMaxY = refMapY + 1.0;
            
            if (cutoutAxis === 'NS') {
              wMinY = refMapY + offsetVal * (1.0 - thickness);
              wMaxY = wMinY + thickness;
            } else {
              wMinX = refMapX + offsetVal * (1.0 - thickness);
              wMaxX = wMinX + thickness;
            }
            
            let b1MinX = wMinX, b1MaxX = wMaxX, b1MinY = wMinY, b1MaxY = wMaxY;
            let b2MinX = wMinX, b2MaxX = wMaxX, b2MinY = wMinY, b2MaxY = wMaxY;
            let holeMinX = wMinX, holeMaxX = wMaxX, holeMinY = wMinY, holeMaxY = wMaxY;

            if (cutoutAxis === 'NS') {
              b1MaxX = refMapX + cLeft;
              b2MinX = refMapX + cRight;
              holeMinX = refMapX + cLeft;
              holeMaxX = refMapX + cRight;
            } else {
              b1MaxY = refMapY + cLeft;
              b2MinY = refMapY + cRight;
              holeMinY = refMapY + cLeft;
              holeMaxY = refMapY + cRight;
            }

            intersectAABB_inplace_local(mirrorHitX, mirrorHitY, refRayDirX, refRayDirY, b1MinX, b1MinY, b1MaxX, b1MaxY, outHit1_local);
            intersectAABB_inplace_local(mirrorHitX, mirrorHitY, refRayDirX, refRayDirY, b2MinX, b2MinY, b2MaxX, b2MaxY, outHit2_local);
            intersectAABB_inplace_local(mirrorHitX, mirrorHitY, refRayDirX, refRayDirY, holeMinX, holeMinY, holeMaxX, holeMaxY, outHitHole_local);
            
            let hitSolid = false;
            let solidHitT = Infinity;
            let solidHitSide = currentSide;
            if (outHit1_local.hit && outHit1_local.t < solidHitT) { hitSolid = true; solidHitT = outHit1_local.t; solidHitSide = outHit1_local.side; }
            if (outHit2_local.hit && outHit2_local.t < solidHitT) { hitSolid = true; solidHitT = outHit2_local.t; solidHitSide = outHit2_local.side; }

            let holeHitTime = Infinity;
            if (outHitHole_local.hit) {
              holeHitTime = outHitHole_local.t;
            }

            if (hitSolid && solidHitT <= holeHitTime + 0.0001) {
              isWallHit = true;
              refAbsTopZ = topZ;
              refAbsBotZ = bottomZ;
              mirrorRefDist = solidHitT;
              result = {
                hit: true,
                perpWallDist: mirrorRefDist,
                side: solidHitSide,
                doorOffset: 0,
                isTextureFlipped: false,
              };
              let wallX;
              if (solidHitSide === 0) wallX = mirrorHitY + mirrorRefDist * refRayDirY;
              else wallX = mirrorHitX + mirrorRefDist * refRayDirX;
              wallX -= Math.floor(wallX);
              if (solidHitSide === 0 && refRayDirX < 0) wallX = 1.0 - wallX;
              if (solidHitSide === 1 && refRayDirY > 0) wallX = 1.0 - wallX;
              result.doorOffset = wallX;
            } else if (outHitHole_local.hit) {
              const tHit = outHitHole_local.t;
              const exitDist = outHitHole_local.tFar;
              const hitSide = outHitHole_local.side;

              let hitsCheek = false;
              if (cutoutAxis === 'NS' && outHitHole_local.tFar === outHitHole_local.tFarX) {
                hitsCheek = true;
              } else if (cutoutAxis === 'WE' && outHitHole_local.tFar === outHitHole_local.tFarY) {
                hitsCheek = true;
              }

              const hasGlass = (refTile.glassAssetId && !refTile.isGlassBroken);
              const glassTrans = hasGlass ? (refTile.glassTransparency !== undefined ? refTile.glassTransparency : 0.5) : 0.0;
              
              let gOffset = refTile.glassOffset !== undefined ? refTile.glassOffset : 0.5;
              let exactGlassDist = 0;
              let tOffsetVal = refTile.offset !== undefined ? refTile.offset : 0.0;
              let tThickness = refTile.thickness !== undefined ? refTile.thickness : 1.0;
              if (cutoutAxis === 'NS') {
                let glassY = refMapY + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                exactGlassDist = (glassY - mirrorHitY) / refRayDirY;
              } else {
                let glassX = refMapX + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                exactGlassDist = (glassX - mirrorHitX) / refRayDirX;
              }

              mirrorPassThroughWalls.push({
                dist: tHit,
                exitDist: exitDist,
                layer: 0,
                mapX: refMapX,
                mapY: refMapY,
                side: hitSide,
                assetId: refTile.assetId,
                bottomTextureId: refTile.bottomTextureId,
                topTextureId: refTile.topTextureId,
                topZ: topZ,
                bottomZ: bottomZ,
                isWindow: true,
                cutoutAxis: cutoutAxis,
                cutoutTop: refTile.cutout ? refTile.cutout.topLeft.y : 0.25,
                cutoutBottom: refTile.cutout ? refTile.cutout.bottomRight.y : 0.75,
                cutoutLeft: refTile.cutout ? refTile.cutout.topLeft.x : 0.25,
                cutoutRight: refTile.cutout ? refTile.cutout.bottomRight.x : 0.75,
                glassTransparency: glassTrans,
                glassDist: exactGlassDist,
                glassAssetId: refTile.glassAssetId,
                isGlassBroken: refTile.isGlassBroken,
              });

              if (hitsCheek) {
                mirrorPassThroughWalls.push({
                  dist: exitDist,
                  exitDist: exitDist + 0.05,
                  layer: 0,
                  mapX: refMapX,
                  mapY: refMapY,
                  side: cutoutAxis === 'NS' ? 0 : 1,
                  assetId: refTile.assetId,
                  bottomTextureId: refTile.bottomTextureId,
                  topTextureId: refTile.topTextureId,
                  topZ: topZ,
                  bottomZ: bottomZ,
                  isWindow: true,
                  cutoutAxis: cutoutAxis,
                  cutoutTop: refTile.cutout ? refTile.cutout.topLeft.y : 0.25,
                  cutoutBottom: refTile.cutout ? refTile.cutout.bottomRight.y : 0.75,
                  cutoutLeft: refTile.cutout ? refTile.cutout.topLeft.x : 0.25,
                  cutoutRight: refTile.cutout ? refTile.cutout.bottomRight.x : 0.75,
                  glassTransparency: 0.0,
                  glassDist: exitDist,
                });
              }
            }
          } else {
            const isFullHeight = hasUpperLayers
              ? (bottomZ <= 0.001 && topZ >= activeGrids.length - 0.001)
              : (bottomZ <= 0.001 && topZ >= 0.999);

            if (isFullHeight) {
              isWallHit = true;
              refAbsTopZ = topZ;
              refAbsBotZ = bottomZ;
              let dist =
                currentSide === 0
                  ? refSideDistX - refDeltaDistX
                  : refSideDistY - refDeltaDistY;
              if (dist < 0) dist = 0;
              mirrorRefDist = dist;
              result = {
                hit: true,
                perpWallDist: mirrorRefDist,
                side: currentSide,
                doorOffset: 0,
                isTextureFlipped: false,
              };
              let wallX;
              if (currentSide === 0) wallX = mirrorHitY + mirrorRefDist * refRayDirY;
              else wallX = mirrorHitX + mirrorRefDist * refRayDirX;
              wallX -= Math.floor(wallX);
              if (currentSide === 0 && refRayDirX < 0) wallX = 1.0 - wallX;
              if (currentSide === 1 && refRayDirY > 0) wallX = 1.0 - wallX;
              result.doorOffset = wallX;
            } else {
              let uDist =
                currentSide === 0
                  ? refSideDistX - refDeltaDistX
                  : refSideDistY - refDeltaDistY;
              if (uDist < 0) uDist = 0;
              const uExitDist = Math.min(refSideDistX, refSideDistY);

              mirrorPassThroughWalls.push({
                dist: uDist,
                exitDist: uExitDist,
                layer: 0,
                mapX: refMapX,
                mapY: refMapY,
                side: currentSide,
                assetId: refTile.assetId,
                bottomTextureId: refTile.bottomTextureId,
                topTextureId: refTile.topTextureId,
                topZ: topZ,
                bottomZ: bottomZ,
              });
              if (bottomZ <= 0.001 && topZ >= 0.999) {
                blockedLayers[0] = 1;
              }
            }
          }
        }
      } else if (refTile.type === "DOOR" && refTile.door) {
        if (blockedLayers[0] === 0) {
          const openAmt = refTile.door.openAmount;
          if (refTile.door.type === "HINGE") {
            result = calculateHingeIntersection(
              refMapX,
              refMapY,
              mirrorHitX,
              mirrorHitY,
              refRayDirX,
              refRayDirY,
              openAmt,
              refTile.door.dir,
              refTile.door.edge,
              grid,
            );
          } else if (refTile.door.type === "SLIDE") {
            result = calculateSlideIntersection(
              refMapX,
              refMapY,
              mirrorHitX,
              mirrorHitY,
              refRayDirX,
              refRayDirY,
              refSideDistX,
              refSideDistY,
              refDeltaDistX,
              refDeltaDistY,
              currentSide,
              openAmt,
              grid,
            );
          } else if (refTile.door.type === "LIFT") {
            let pwd =
              currentSide === 0
                ? refSideDistX - refDeltaDistX
                : refSideDistY - refDeltaDistY;
            if (pwd < 0) pwd = 0;
            let delta = currentSide === 0 ? refDeltaDistX : refDeltaDistY;
            const centerDist = pwd + delta * 0.5;
            if (openAmt < 0.1) {
              result = {
                hit: true,
                perpWallDist: centerDist,
                side: currentSide,
                doorOffset: 0,
                isTextureFlipped: false,
              };
              let wallX;
              if (currentSide === 0) wallX = mirrorHitY + centerDist * refRayDirY;
              else wallX = mirrorHitX + centerDist * refRayDirX;
              result.doorOffset = wallX - Math.floor(wallX);
            }
          }
        }
      }

      if (result && isTransparent) {
        // This is a masked door! Push it as a pass-through wall with transparent mask settings
        mirrorPassThroughWalls.push({
          dist: result.perpWallDist,
          exitDist: result.perpWallDist + 0.05,
          layer: 0,
          mapX: refMapX,
          mapY: refMapY,
          side: result.side,
          assetId: refTile.door?.textureId || refTile.assetId,
          bottomTextureId: refTile.door?.textureId,
          topZ: 1.0,
          bottomZ: 0.0,
          isMaskedDoor: true,
          maskId: refTile.door?.maskId,
          isBroken: refTile.door?.broken,
          doorOffset: result.doorOffset,
          isTextureFlipped: result.isTextureFlipped
        });
      }

      if (result && !isTransparent) {
        if (hasUpperLayers && !isWallHit) {
          // If there are upper layers, a door on the ground floor only occupies Z from 0.0 to 1.0.
          // It should behave as a pass-through wall in secondary reflections rather than blocking the whole height.
          const uDist = result.perpWallDist;
          const uExitDist = Math.min(refSideDistX, refSideDistY);
          mirrorPassThroughWalls.push({
            dist: uDist,
            exitDist: uExitDist,
            layer: 0,
            mapX: refMapX,
            mapY: refMapY,
            side: result.side,
            assetId: refTile.door?.textureId || refTile.assetId,
            bottomTextureId: refTile.door?.textureId,
            topZ: 1.0,
            bottomZ: 0.0,
          });
          blockedLayers[0] = 1;
        } else {
          refHit = 1;
          mirrorRefDist = result.perpWallDist;
          mirrorRefSide = result.side;
          mirrorRefWallX = result.isTextureFlipped
            ? 1.0 - result.doorOffset
            : result.doorOffset;

          const colRef = mirrorReflections[x][mirrorReflections[x].length - 1];
          if (colRef) colRef.mirrorRefDist = mirrorRefDist;

          if (isWallHit) {
            if (
              debugTextures &&
              refTile.assetId &&
              (auxBuffers?.has('TEX_' + refTile.assetId) || auxBuffers?.has(refTile.assetId))
            )
              mirrorRefBuf = auxBuffers?.has('TEX_' + refTile.assetId) ? auxBuffers.get('TEX_' + refTile.assetId)! : auxBuffers.get(refTile.assetId)!;
            else {
              mirrorRefBuf = debugTextures
                ? wallBuffer
                : auxBuffers?.get("TEX_FALLBACK") || null;
              if (!mirrorRefBuf && debugTextures) mirrorRefBuf = wallBuffer;
            }

            // Check for decals on reflected wall
            if (debugTextures && customWallBuffers) {
              let refFace = 0;
              if (currentSide === 0) {
                refFace = refRayDirX > 0 ? 3 : 1;
              } else {
                refFace = refRayDirY > 0 ? 0 : 2;
              }
              const refKey = (refMapY * 10000 + refMapX) * 10 + refFace;
              if (customWallBuffers.has(refKey)) {
                mirrorRefBuf = customWallBuffers.get(refKey)!;
              }
            }
          } else {
            if (
              debugTextures &&
              refTile.door?.textureId &&
              (auxBuffers?.has('TEX_' + refTile.door.textureId) || auxBuffers?.has(refTile.door.textureId))
            )
              mirrorRefBuf = auxBuffers?.has('TEX_' + refTile.door.textureId) ? auxBuffers.get('TEX_' + refTile.door.textureId)! : auxBuffers.get(refTile.door.textureId)!;
            else {
              mirrorRefBuf = debugTextures
                ? doorBuffer
                : auxBuffers?.get("TEX_FALLBACK") || null;
              if (!mirrorRefBuf && debugTextures) mirrorRefBuf = doorBuffer;
            }
          }

          // Lighting for reflection
          let refLightX = refMapX,
            refLightY = refMapY;
          if (isWallHit) {
            if (currentSide === 0) refLightX -= refStepX;
            else refLightY -= refStepY;
          }

          const adj = adjustLightForClosedDoors(
            refLightX,
            refLightY,
            refRayDirX,
            refRayDirY,
            grid,
            activeGrids,
          );
          refLightX = adj.x;
          refLightY = adj.y;

          const interpolatedL = getInterpolatedWallLight(
            refLightX,
            refLightY,
            mirrorRefWallX,
            mirrorRefSide,
            refRayDirX,
            refRayDirY,
            lightMap,
            grid,
            activeGrids,
            mapWidth,
            mapHeight,
            0
          );
          let mirrorRefRMultInt = (interpolatedL.r * 256) | 0;
          let mirrorRefGMultInt = (interpolatedL.g * 256) | 0;
          let mirrorRefBMultInt = (interpolatedL.b * 256) | 0;
          if (mirrorRefSide === 1) {
            mirrorRefRMultInt = (mirrorRefRMultInt * 179) >> 8;
            mirrorRefGMultInt = (mirrorRefGMultInt * 179) >> 8;
            mirrorRefBMultInt = (mirrorRefBMultInt * 179) >> 8;
          }
          const refFogInt =
            (getDepthFactor(perpWallDist + mirrorRefDist) * 256) | 0;
          mirrorRefRMultInt = (mirrorRefRMultInt * refFogInt) >> 8;
          mirrorRefGMultInt = (mirrorRefGMultInt * refFogInt) >> 8;
          mirrorRefBMultInt = (mirrorRefBMultInt * refFogInt) >> 8;

          mirrorRefRMult = mirrorRefRMultInt / 256.0;
          mirrorRefGMult = mirrorRefGMultInt / 256.0;
          mirrorRefBMult = mirrorRefBMultInt / 256.0;

          break;
        }
      }
    }

    if (refHit === 0) {
      let allBlocked = true;
      for (let i = 0; i < activeGrids.length; i++) {
        if (blockedLayers[i] === 0) {
          allBlocked = false;
          break;
        }
      }
      if (allBlocked) {
        refHit = 1;
      }
    }

    const D = distanceField[refMapY]?.[refMapX];
    if (D !== undefined && D > 1) {
      // --- SPATIAL JUMP USING DISTANCE FIELD (Chebyshev distance transform) ---
      const jumpSize = D - 1;
      const nextTargetX = refStepX > 0 ? refMapX + jumpSize : refMapX - jumpSize;
      const nextTargetY = refStepY > 0 ? refMapY + jumpSize : refMapY - jumpSize;

      const distToTargetX = refSideDistX + refDeltaDistX * (jumpSize - 1);
      const distToTargetY = refSideDistY + refDeltaDistY * (jumpSize - 1);

      if (distToTargetX < distToTargetY) {
        refMapX = nextTargetX;
        const hitY = mirrorHitY + distToTargetX * refRayDirY;
        refMapY = Math.floor(hitY);
        currentSide = 0;
      } else {
        refMapY = nextTargetY;
        const hitX = mirrorHitX + distToTargetY * refRayDirX;
        refMapX = Math.floor(hitX);
        currentSide = 1;
      }

      // Re-sync refSideDistX and refSideDistY
      if (refRayDirX < 0) refSideDistX = (mirrorHitX - refMapX) * refDeltaDistX;
      else refSideDistX = (refMapX + 1.0 - mirrorHitX) * refDeltaDistX;

      if (refRayDirY < 0) refSideDistY = (mirrorHitY - refMapY) * refDeltaDistY;
      else refSideDistY = (refMapY + 1.0 - mirrorHitY) * refDeltaDistY;
    } else {
      // --- MICRO STEP (Standard DDA) ---
      if (refSideDistX < refSideDistY) {
        refSideDistX += refDeltaDistX;
        refMapX += refStepX;
        currentSide = 0;
      } else {
        refSideDistY += refDeltaDistY;
        refMapY += refStepY;
        currentSide = 1;
      }
    }

    refLimit--;
  }

  const colRefEnd = mirrorReflections[x]?.[mirrorReflections[x].length - 1];
  if (colRefEnd) {
    colRefEnd.mirrorPassThroughWalls = mirrorPassThroughWalls;
  }

  return {
    mirrorRefDist,
    mirrorRefBuf,
    mirrorRefSide,
    mirrorRefWallX,
    mirrorRefRMult,
    mirrorRefGMult,
    mirrorRefBMult,
    refAbsTopZ,
    refAbsBotZ,
  };
};

export const precalculateMirrorWalls = (
  mirrorPassThroughWalls: any[],
  perpWallDist: number,
  height: number,
  horizon: number,
  drawStart: number,
  drawEnd: number,
  wallBuffer: RaycasterBuffer | null,
  auxBuffers: Map<string, RaycasterBuffer> | undefined,
  mirrorHitX: number,
  mirrorHitY: number,
  refRayDirX: number,
  refRayDirY: number,
  lightMap: { r: number; g: number; b: number }[][] | undefined,
  mapWidth: number,
  mapHeight: number,
  cameraZ: number,
  debugTextures: boolean,
  grid: any[][] | undefined,
  activeGrids: any[][][],
  mirrorRefDist?: number,
  posX: number = 0,
  posY: number = 0,
  lightningIntensity: number = 0,
  muzzleFlashIntensity: number = 0,
  activeFlashes?: { x: number; y: number; intensity: number }[] | undefined,
  muzzleR: number = 0,
  muzzleG: number = 0,
  muzzleB: number = 0,
  lightningR: number = 0,
  lightningG: number = 0,
  lightningB: number = 0,
) => {
  const precalcMirrorWalls = [];
  for (let i = 0; i < mirrorPassThroughWalls.length; i++) {
    const mp = mirrorPassThroughWalls[i];
    const mpTotalDist = perpWallDist + mp.dist;
    // Avoid division by zero
    const safeDist = mpTotalDist < 0.1 ? 0.1 : mpTotalDist;
    const mpLh = height / safeDist;
    const absTopZ = mp.layer + (mp.topZ !== undefined ? mp.topZ : 1.0);
    const absBotZ = mp.layer + (mp.bottomZ !== undefined ? mp.bottomZ : 0.0);
    const mpLevelDrawEnd = Math.ceil(horizon + mpLh * (cameraZ - absBotZ));
    const mpLevelDrawStart = Math.floor(horizon + mpLh * (cameraZ - absTopZ));

    // Fix: Ensure we include walls whose caps might be visible even if the wall face is above/below viewport
    let faceVisible = !(mpLevelDrawEnd <= 0 || mpLevelDrawStart >= height);
    let bottomCapVisible = mp.layer >= 1 && cameraZ < absBotZ;
    let topCapVisible = cameraZ > absTopZ;

    if (!faceVisible && !bottomCapVisible && !topCapVisible) continue;

    let mpBuf = debugTextures ? wallBuffer : auxBuffers?.get("TEX_FALLBACK");
    if (!mpBuf && debugTextures) mpBuf = wallBuffer;
    if (debugTextures && mp.assetId && (auxBuffers?.has('TEX_' + mp.assetId) || auxBuffers?.has(mp.assetId))) {
      mpBuf = auxBuffers?.has('TEX_' + mp.assetId) ? auxBuffers.get('TEX_' + mp.assetId)! : auxBuffers.get(mp.assetId)!;
    }

    if (!mpBuf) continue;

    let maskBuf = null;
    if (mp.isMaskedDoor && mp.maskId && (auxBuffers?.has('TEX_' + mp.maskId) || auxBuffers?.has(mp.maskId))) {
      maskBuf = auxBuffers?.has('TEX_' + mp.maskId) ? auxBuffers.get('TEX_' + mp.maskId)! : auxBuffers.get(mp.maskId)!;
    }

    let mpWallX;
    if (mp.isMaskedDoor && mp.doorOffset !== undefined) {
      mpWallX = mp.doorOffset;
    } else {
      if (mp.side === 0) mpWallX = mirrorHitY + mp.dist * refRayDirY;
      else mpWallX = mirrorHitX + mp.dist * refRayDirX;

      mpWallX -= Math.floor(mpWallX);
      if (mp.side === 0 && refRayDirX < 0) mpWallX = 1.0 - mpWallX;
      if (mp.side === 1 && refRayDirY > 0) mpWallX = 1.0 - mpWallX;
    }

    let mpTexX = Math.floor(mpWallX * mpBuf.width);
    if (mpTexX >= mpBuf.width) mpTexX = mpBuf.width - 1;
    if (mpTexX < 0) mpTexX = 0;
    const mpStepFixed = ((mpBuf.height << 16) / mpLh) | 0;

    // Lighting Pre-calc
    let mpRMultInt = 256,
      mpGMultInt = 256,
      mpBMultInt = 256;
    let mpLightX = mp.mapX,
      mpLightY = mp.mapY;
    if (mp.side === 0) mpLightX -= refRayDirX < 0 ? -1 : 1;
    else mpLightY -= refRayDirY < 0 ? -1 : 1;

    const adj = adjustLightForClosedDoors(
      mpLightX,
      mpLightY,
      refRayDirX,
      refRayDirY,
      grid,
      activeGrids,
    );
    mpLightX = adj.x;
    mpLightY = adj.y;

    const interpolatedL = getInterpolatedWallLight(
      mpLightX,
      mpLightY,
      mpWallX,
      mp.side,
      refRayDirX,
      refRayDirY,
      lightMap,
      grid,
      activeGrids,
      mapWidth,
      mapHeight,
      mp.layer
    );
    mpRMultInt = (interpolatedL.r * 256) | 0;
    mpGMultInt = (interpolatedL.g * 256) | 0;
    mpBMultInt = (interpolatedL.b * 256) | 0;
    if (mp.side === 1) {
      mpRMultInt = (mpRMultInt * 179) >> 8;
      mpGMultInt = (mpGMultInt * 179) >> 8;
      mpBMultInt = (mpBMultInt * 179) >> 8;
    }
    const mpFogInt = (getDepthFactor(mpTotalDist) * 256) | 0;
    mpRMultInt = (mpRMultInt * mpFogInt) >> 8;
    mpGMultInt = (mpGMultInt * mpFogInt) >> 8;
    mpBMultInt = (mpBMultInt * mpFogInt) >> 8;

    // Precalculate Cap parameters to completely avoid nested arrays or Map lookups inside hot pixel loop
    const mpLayer = mp.layer;
    const isStackedOnHit = (mirrorRefDist !== undefined && mirrorRefDist < 999 && Math.abs(mp.dist - mirrorRefDist) < 0.01);
    let hasWallBelow = false;
    if (activeGrids && mpLayer > 0) {
      const underTile = activeGrids[mpLayer - 1]?.[mp.mapY]?.[mp.mapX];
      if (underTile && underTile.type === 'WALL') {
        const absBotZVal = mpLayer + (mp.bottomZ !== undefined ? mp.bottomZ : 0.0);
        let elev = underTile.elevation !== undefined ? underTile.elevation : 0;
        let h = underTile.height !== undefined ? Math.abs(underTile.height) : 1.0;
        if (underTile.height !== undefined && underTile.height < 0) {
          elev = 1.0 - h;
        }
        const underTopZ = (mpLayer - 1) + elev + h;
        if (underTopZ >= absBotZVal - 0.001) {
          hasWallBelow = true;
        }
      }
    }

    let bottomCapRMultIntBase = 256;
    let bottomCapGMultIntBase = 256;
    let bottomCapBMultIntBase = 256;
    if (mpLayer >= 1) {
      const gridForLevel = activeGrids && mp.layer !== undefined && mp.layer >= 0 && mp.layer < activeGrids.length ? activeGrids[mp.layer] : undefined;
      const adjCap = adjustLightForClosedDoors(mp.mapX, mp.mapY, refRayDirX, refRayDirY, gridForLevel, activeGrids);
      const lcx = adjCap.x;
      const lcy = adjCap.y;

      let capRMultVal = 256, capGMultVal = 256, capBMultVal = 256;
      if (lightMap && lcy >= 0 && lcy < mapHeight && lcx >= 0 && lcx < mapWidth && lightMap[lcy]) {
        const l = lightMap[lcy][lcx];
        capRMultVal = (l.r * 256) | 0;
        capGMultVal = (l.g * 256) | 0;
        capBMultVal = (l.b * 256) | 0;
      }
      bottomCapRMultIntBase = (capRMultVal * 153) >> 8;
      bottomCapGMultIntBase = (capGMultVal * 153) >> 8;
      bottomCapBMultIntBase = (capBMultVal * 153) >> 8;
    }

    let bottomBuf = debugTextures ? null : auxBuffers?.get('TEX_FALLBACK');
    if (debugTextures && mp.bottomTextureId && auxBuffers?.has(mp.bottomTextureId)) {
      bottomBuf = auxBuffers.get(mp.bottomTextureId);
    }

    // Glass precalculations
    let glassBuf = null;
    let glassTexX = 0;
    let gScreenTop = 0;
    let gScreenBot = 0;
    let glassAlphaMult = 0;

    const isGlass = mp.isWindow && mp.glassTransparency > 0.0 && !mp.isGlassBroken;
    if (isGlass) {
      if (mp.glassAssetId && auxBuffers?.has(mp.glassAssetId)) {
        glassBuf = auxBuffers.get(mp.glassAssetId)!;
      }

      const gDist = mp.glassDist !== undefined ? mp.glassDist : 0;
      if (glassBuf) {
        let glassHitX = mirrorHitX + gDist * refRayDirX;
        let glassHitY = mirrorHitY + gDist * refRayDirY;
        let localHoleX = mp.cutoutAxis === 'NS' ? glassHitX - mp.mapX : glassHitY - mp.mapY;
        
        let holeLeft = mp.cutoutLeft ?? 0.25;
        let holeRight = mp.cutoutRight ?? 0.75;
        let localX = 0.5;
        if (holeRight > holeLeft) {
          localX = (localHoleX - holeLeft) / (holeRight - holeLeft);
        }
        if (localX < 0) localX = 0;
        if (localX > 1) localX = 1;
        
        glassTexX = Math.floor(localX * glassBuf.width);
        if (glassTexX >= glassBuf.width) glassTexX = glassBuf.width - 1;
      }

      let glassLh = height / (gDist < 0.1 ? 0.1 : gDist);
      let glassLevelDS = Math.floor(horizon + glassLh * (cameraZ - (mp.layer + (mp.topZ ?? 1.0))));
      let glassLevelDE = Math.ceil(horizon + glassLh * (cameraZ - (mp.layer + (mp.bottomZ ?? 0.0))));
      
      const cTop = mp.cutoutTop !== undefined ? mp.cutoutTop : 0.25;
      const cBot = mp.cutoutBottom !== undefined ? mp.cutoutBottom : 0.75;
      gScreenTop = Math.floor(glassLevelDS + (glassLevelDE - glassLevelDS) * cTop);
      gScreenBot = Math.floor(glassLevelDS + (glassLevelDE - glassLevelDS) * cBot);
      
      glassAlphaMult = mp.glassTransparency;
    }

    // Flash precalculations
    let pFlashR = 0, pFlashG = 0, pFlashB = 0;
    const isCapVisible = bottomCapVisible && !isStackedOnHit && !hasWallBelow && mpLayer >= 1;
    if (isCapVisible) {
      const capMidX = mirrorHitX + 0.5 * mp.exitDist * refRayDirX;
      const capMidY = mirrorHitY + 0.5 * mp.exitDist * refRayDirY;

      if (lightningIntensity > 0 || muzzleFlashIntensity > 0 || (activeFlashes && activeFlashes.length > 0)) {
        let mInt = 0;
        if (muzzleFlashIntensity > 0) {
          const dx = posX - capMidX;
          const dy = posY - capMidY;
          const distSq = dx * dx + dy * dy;
          if (distSq < 100) {
            mInt = muzzleFlashIntensity / (distSq * 0.5 + 1.0);
          }
        }
        
        let enemyFlashR = 0, enemyFlashG = 0, enemyFlashB = 0;
        if (activeFlashes) {
          for (let k = 0; k < activeFlashes.length; k++) {
            const f = activeFlashes[k] as any;
            const dx = f.x - capMidX;
            const dy = f.y - capMidY;
            const distSq = dx * dx + dy * dy;
            if (distSq < 100) {
              const fInt = f.intensity / (distSq * 0.5 + 1.0);
              if (f.isFlashbang) {
                enemyFlashR += fInt * 2.0;
                enemyFlashG += fInt * 2.0;
                enemyFlashB += fInt * 2.0;
              } else {
                enemyFlashR += fInt * muzzleR;
                enemyFlashG += fInt * muzzleG;
                enemyFlashB += fInt * muzzleB;
              }
            }
          }
        }
        
        const fR = (lightningIntensity * lightningR) + (mInt * muzzleR) + enemyFlashR;
        const fG = (lightningIntensity * lightningG) + (mInt * muzzleG) + enemyFlashG;
        const fB = (lightningIntensity * lightningB) + (mInt * muzzleB) + enemyFlashB;
        
        pFlashR = (fR * 255) | 0;
        pFlashG = (fG * 255) | 0;
        pFlashB = (fB * 255) | 0;
      }
    }

    precalcMirrorWalls.push({
      drawStart: mpLevelDrawStart,
      drawEnd: mpLevelDrawEnd,
      buf: mpBuf,
      texX: mpTexX,
      stepFixed: mpStepFixed,
      rMultInt: mpRMultInt,
      gMultInt: mpGMultInt,
      bMultInt: mpBMultInt,
      // Cached logic variables for loop
      isStackedOnHit,
      hasWallBelow,
      bottomCapRMultIntBase,
      bottomCapGMultIntBase,
      bottomCapBMultIntBase,
      bottomBuf: bottomBuf || null,
      maskBuf: maskBuf || null,
      // Data for Bottom Cap
      mp: mp, // Keep original ref for bottom cap logic
      mpTotalDist: mpTotalDist,
      mpExitDist: mp.exitDist,
      mpLayer: mp.layer,

      // Precalculated glass variables
      isGlass,
      glassBuf,
      glassTexX,
      gScreenTop,
      gScreenBot,
      glassAlphaMult,

      // Precalculated cutout and glass ranges to avoid nested calculations and divisions in hot pixel loop
      screenCutoutTop: Math.floor(mpLevelDrawStart + (mpLevelDrawEnd - mpLevelDrawStart) * (mp.cutoutTop !== undefined ? mp.cutoutTop : 0.25)),
      screenCutoutBot: Math.floor(mpLevelDrawStart + (mpLevelDrawEnd - mpLevelDrawStart) * (mp.cutoutBottom !== undefined ? mp.cutoutBottom : 0.75)),
      invGlassRange: gScreenBot > gScreenTop ? 1.0 / (gScreenBot - gScreenTop) : 0,

      // Precalculated cap bounds and flashes
      capDrawStart: isCapVisible ? mpLevelDrawEnd : 0,
      capDrawEnd: isCapVisible ? Math.min(horizon, Math.floor(horizon - ((absBotZ - cameraZ) * height) / (perpWallDist + mp.exitDist)) + 1) : 0,
      pFlashR,
      pFlashG,
      pFlashB,
    });
  }
  return precalcMirrorWalls;
};
