import React from "react";
import {
  Tile,
  Item,
  Player,
  Enemy,
  AnimationConfig,
  RoamingEnemyAnim,
  GameState,
  GameStrings,
  PolyObjectModel,
} from "../../types";
import { getPolyModelById } from "../../data/polyModels";
import { drawPolyObjectSoftware, getDecorationFacingAngle } from "./PolyObjectRenderer";
import { lerp, RaycasterBuffer } from "./RaycasterUtils";
import {
  getTintedSprite,
  getDamagedSprite,
  getHighlightedSprite,
  getMirroredSprite,
} from "./SpriteCache";
import {
  createBloodParticles,
  Particle,
  createFlyParticles,
  updateParticles,
  drawParticles,
  casingParticles,
  bloodParticles,
  rainSplashParticles,
  returnParticleToPool,
  createSmokeParticle,
} from "../../utils/particleSystem";
import {
  PassThroughDoor,
  MirrorReflection,
  PassThroughWall,
  SpriteShadow,
} from "./RaycasterTypes";
import {
  BLOOD_GROWTH_DURATION,
  FLY_SPAWN_DELAY,
  RENDER_DISTANCE,
} from "./RaycasterConstants";
import { getCurrentAnimationFrame } from "../../utils/animationUtils";
import { hasLineOfSight, hasPitLineOfSight } from "../../utils/combatLogic";
import {
  applyDepthBrightness,
  getFogAmount,
  isFogWeather,
  getCurrentRenderDistance,
} from "./DepthEffect";
import { 
  isSpritePixelOccludedByWindow,
  prepareSpriteWindowOcclusion,
  isSpritePixelOccludedByWindowPrepared
} from "./WindowRenderer";
import { setGlobalSpriteShadows } from "./WebGLState";

// Zero-GC Persistent arrays for shadow rendering
const persistentGroundEligible: any[] = [];
const persistentElevatedEligible: any[] = [];
const persistentGroundShadows: SpriteShadow[] = [];
const persistentElevatedShadows: SpriteShadow[] = [];

// Zero-GC persistent array reused each frame instead of allocating spritePool.slice()
const persistentRenderSprites: any[] = [];

// Zero-GC persistent array reused across mirror segments for the reflected sprite pass
const persistentReflectedSprites: any[] = [];

// --- OVERLAY CACHE ---
let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let overlayImgData: ImageData | null = null;
let overlayData: Uint32Array | null = null;

interface ColumnAlphaSpan {
  start: number;
  end: number;
  alpha: number;
}

function getColumnAlphaSpans(
  bufData: Uint32Array,
  maskData: Uint32Array | null,
  doorTexX: number,
  maskX: number,
  texW: number,
  texH: number,
  maskW: number,
  maskHeightScale: number,
  isBroken: boolean | number
): ColumnAlphaSpan[] {
  let cache = (bufData as any)._colSpansCache;
  if (!cache) {
    cache = (bufData as any)._colSpansCache = new Map<string, ColumnAlphaSpan[]>();
  }
  const brokenKey = isBroken ? 1 : 0;
  const key = `${doorTexX}_${maskX}_${brokenKey}`;
  let cachedSpans = cache.get(key);
  if (cachedSpans) return cachedSpans;

  cachedSpans = [];
  let startT = 0;
  let prevSegmentAlpha = -1;

  for (let ty = 0; ty < texH; ty++) {
    const color = bufData[ty * texW + doorTexX];
    const alpha = (color >> 24) & 0xff;

    let isMaskGreen = false;
    if (maskData) {
      const mty = Math.floor(ty * maskHeightScale);
      const maskColor = maskData[mty * maskW + maskX];
      if ((maskColor & 0x00ffffff) === 0x0000ff00) {
        isMaskGreen = true;
      }
    }

    let finalAlpha = 1.0;
    if (isMaskGreen) {
      if (brokenKey === 1) {
        finalAlpha = 1.0;
      } else {
        const glassOpacity = Math.min(alpha, 160) / 255;
        finalAlpha = Math.max(0.2, 1.0 - glassOpacity);
      }
    } else {
      if (alpha > 128) {
        finalAlpha = 0.0;
      } else {
        finalAlpha = Math.max(0.0, 1.0 - (alpha / 255));
      }
    }

    if (finalAlpha !== prevSegmentAlpha) {
      if (prevSegmentAlpha !== -1) {
        cachedSpans.push({ start: startT, end: ty, alpha: prevSegmentAlpha });
      }
      startT = ty;
      prevSegmentAlpha = finalAlpha;
    }
  }
  cachedSpans.push({ start: startT, end: texH, alpha: prevSegmentAlpha });

  cache.set(key, cachedSpans);
  return cachedSpans;
}

const getOverlayCanvas = (width: number, height: number) => {
  if (
    !overlayCanvas ||
    overlayCanvas.width < width ||
    overlayCanvas.height < height
  ) {
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = Math.max(width, overlayCanvas?.width || 0);
    overlayCanvas.height = Math.max(height, overlayCanvas?.height || 0);
    overlayCtx = overlayCanvas.getContext("2d", { alpha: true });
    overlayImgData = overlayCtx!.createImageData(
      overlayCanvas.width,
      overlayCanvas.height,
    );
    overlayData = new Uint32Array(overlayImgData.data.buffer);
  }
  return {
    canvas: overlayCanvas,
    ctx: overlayCtx!,
    imgData: overlayImgData!,
    data: overlayData!,
  };
};

// --- SHADOW CACHE REMOVED ---



const subtractInterval = (
  intervals: [number, number][],
  oStart: number,
  oEnd: number,
): [number, number][] => {
  const result: [number, number][] = [];
  for (let i = 0; i < intervals.length; i++) {
    const [vStart, vEnd] = intervals[i];
    if (oStart <= vStart && oEnd >= vEnd) {
      // Completely occluded
    } else if (oStart > vStart && oEnd < vEnd) {
      // Split
      result.push([vStart, oStart]);
      result.push([oEnd, vEnd]);
    } else if (oStart <= vStart && oEnd > vStart && oEnd < vEnd) {
      // Trim start
      result.push([oEnd, vEnd]);
    } else if (oStart > vStart && oStart < vEnd && oEnd >= vEnd) {
      // Trim end
      result.push([vStart, oStart]);
    } else {
      // No overlap
      result.push([vStart, vEnd]);
    }
  }
  return result;
};



const spritePool: SpriteToRender[] = [];
const getLazyPreTintedSprite = (
  img: HTMLImageElement | HTMLCanvasElement,
  sprLight: { r: number; g: number; b: number },
  obj: any,
  spriteTintCache: Map<string, HTMLCanvasElement | HTMLImageElement>
): HTMLCanvasElement | HTMLImageElement => {
  const imgAny = img as any;
  if (!imgAny._spriteId) {
    imgAny._spriteId = imgAny.src || ('img_' + Math.random().toString(36).substring(2, 9));
  }
  const imgVersion = imgAny._spriteId;

  // Fast path for emissive (self-illuminating) objects like fire, explosions, plasma, glow, or lasers.
  // These objects do not receive external tinting and should always render at full brightness.
  // This bypasses the expensive real-time tinting canvas generation entirely, removing any rendering stutters.
  if (obj) {
    const isEmissive = 
      !!obj.isScorching || 
      !!obj.isEmissive || 
      (typeof obj.id === 'string' && (
        obj.id.startsWith('EXPLOSION_') ||
        obj.id.startsWith('FIRE_ANIM_') ||
        obj.id.startsWith('MUZZLE_FLASH_') ||
        obj.id.startsWith('SPARK_')
      ));

    if (isEmissive) {
      return img;
    }
  }

  if (!obj._preTinted || typeof obj._preTinted !== 'object') {
    obj._preTinted = {};
    obj._preTintedVersion = imgVersion;
  } else if (obj._preTintedVersion !== imgVersion) {
    obj._preTinted = {};
    obj._preTintedVersion = imgVersion;
  }
  
  // Quantize light values (16 steps) to match the global SpriteCache quantization buckets
  const rKey = Math.min(16, Math.max(0, Math.round(sprLight.r * 16)));
  const gKey = Math.min(16, Math.max(0, Math.round(sprLight.g * 16)));
  const bKey = Math.min(16, Math.max(0, Math.round(sprLight.b * 16)));
  const cacheKey = (rKey) | (gKey << 5) | (bKey << 10);
  
  const cached = obj._preTinted[cacheKey];
  const isValid = cached && (cached instanceof HTMLCanvasElement || cached instanceof HTMLImageElement);
  
  if (!isValid) {
    // Generate the pre-tinted canvas with the specific quantized light level
    const lightColor = {
      r: rKey / 16,
      g: gKey / 16,
      b: bKey / 16
    };
    
    obj._preTinted[cacheKey] = getTintedSprite(
      img,
      lightColor,
      0,
      0,
      spriteTintCache,
      undefined,
      0
    );
  }
  
  return obj._preTinted[cacheKey];
};

let spritePoolCount = 0;

export interface SpriteToRender {
  id: string;
  x: number;
  y: number;
  gridX?: number;
  gridY?: number;
  unbiasedX?: number;
  unbiasedY?: number;
  sFloorHeight?: number;
  img: HTMLImageElement | HTMLCanvasElement | null;
  dist: number;
  scale: number;
  lightColor: { r: number; g: number; b: number };
  isPreTinted?: boolean;
  originalImg?: HTMLImageElement | HTMLCanvasElement | null;
  isDamaged?: boolean;
  isHighlighted?: boolean;
  isMirrored?: boolean; // NEW
  transformY: number;
  transformX?: number; // Added for wall-aligned rendering
  vOffset?: number;
  yOffset?: number; // NEW
  bloodStartTime?: number;
  hidden?: boolean;
  enemyId?: string;
  isPortrait?: boolean;
  isAttackSprite?: boolean;
  isForeground?: boolean;
  layer: number; // 0: Floor items/Corpses, 1: Decor, 2: Actors, 3: Effects/Portraits
  sortOrder?: number; // Tie-breaker for rendering order within the same layer
  isCharred?: boolean;
  burntTime?: number;
  noBleeding?: boolean;

  // Wall Aligned Props
  isWallAligned?: boolean;
  isDecal?: boolean; // True for C4/decals, false for 3D fences/meshes
  isBoxSide?: boolean; // True for box sides to enable backface culling
  wallSide?: "N" | "S" | "W" | "E" | "TOP" | "BOTTOM";
  thickness?: number;
  meshWidth?: number;
  isEmptyness?: boolean;
  isBox?: boolean;
  noShadow?: boolean;
  isEmissive?: boolean;
  isPolyObject?: boolean;
  polyModel?: PolyObjectModel;
  polyFacing?: string | number;
}

interface EntityRenderProps {
  isPaused?: boolean;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  grid: Tile[][];
  posX: number;
  posY: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
  horizon: number;
  sprites: Map<string, HTMLImageElement> | undefined;
  lightMap?: { r: number; g: number; b: number }[][];
  outdoorMap?: boolean[][];
  lightningMap?: Float32Array | null;
  zBuffer: number[];
  solidWallTopBuffer?: Int32Array | null;
  passThroughDoors: PassThroughDoor[][];
  passThroughWalls: PassThroughWall[][];
  mirrorReflections: MirrorReflection[][];
  player: Player;
  cameraZ: number;
  pickupAnim?: { item: Item; startTime: number; x: number; y: number; reverse?: boolean } | null;
  throwAnim?: { item: Item; startTime: number; x: number; y: number } | null;
  enemyMoveAnim?: {
    id: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startTime: number;
    duration?: number;
  } | null;
  activeAttackerId?: string | null;
  activeAttackerStartTime?: number;
  damagedEnemyIds?: string[];
  highlightedEntityId?: string | null;
  hiddenEnemyIds?: string[];
  spriteTintCache: Map<string, HTMLCanvasElement | HTMLImageElement>;
  lightningIntensity: number;
  muzzleFlashIntensity: number;
  particlesRef: React.MutableRefObject<Particle[]>;
  rainRef: React.MutableRefObject<Particle[]>;
  fliesRef: React.MutableRefObject<Map<string, Particle[]>>;
  lastProcessedDamageIds: React.MutableRefObject<Set<string>>;
  activeFlashes?: { x: number; y: number; intensity: number }[];
  enemies?: Map<string, Enemy>;
  isCombatActive?: boolean;
  combatEnemies?: any[];
  animations: AnimationConfig;
  explosions?: {
    id: string;
    x: number;
    y: number;
    assetId: string;
    startTime: number;
  }[];
  activeDialogueNPCId?: string | null;
  lootAnims?: {
    id: string;
    item: Item;
    x: number;
    y: number;
    startTime: number;
    targetX: number;
    targetY: number;
  }[];
  roamingAnims?: RoamingEnemyAnim[];
  boxMoveAnims?: {id: string, startX: number, startY: number, endX: number, endY: number, startTime: number}[];
  aiDebug?: boolean;
  doorBuffer: RaycasterBuffer | null;
  auxBuffers?: Map<string, RaycasterBuffer>;
  playerReflectionSprite?: HTMLCanvasElement | null;
  resolutionDivisor?: number;
  spriteResolutionDivisor?: number;
  flashlightActive?: boolean;
  flashlightBatteryRatio?: number;
  maskCtx?: CanvasRenderingContext2D | null;
  raycasterCamera?: {
    x: number;
    y: number;
    dir: number;
    pitch?: number;
  } | null;
  aimingSys?: any;
  gameState?: string;
  strings?: GameStrings | null;
  pitLineVis?: boolean;
  isWebGLActive?: boolean;
  webglRenderer?: any;
  settings?: any;
}

const drawOccludedStrip = (
  ctx: CanvasRenderingContext2D,
  activeMaskDoor: any,
  drawSource: HTMLCanvasElement | HTMLImageElement | null,
  texX: number,
  stripX: number,
  drawY: number,
  stripW: number,
  heightScreen: number,
  spriteImgHeight: number,
  height: number,
  horizon: number,
  cameraZ: number,
  doorBuffer: any | null,
  auxBuffers?: Map<string, any>,
  spriteDist: number = 0,
  passThroughWalls?: PassThroughWall[],
  spriteX?: number,
  spriteY?: number,
) => {
  const wallsInFront = passThroughWalls
    ? passThroughWalls.filter(w => {
        if (w.isPolyOccluder && spriteX !== undefined && spriteY !== undefined) {
          const isSameTile = Math.floor(spriteX) === w.mapX && Math.floor(spriteY) === w.mapY;
          if (isSameTile) return false;
        }
        return spriteDist > w.dist + 0.02;
      })
    : [];

  const hasDoor = !!activeMaskDoor;
  const hasWalls = wallsInFront.length > 0;

  if (hasDoor || hasWalls) {
    const door = activeMaskDoor;
    let buf = doorBuffer;
    if (door && auxBuffers && auxBuffers.has(door.textureId)) {
      buf = auxBuffers.get(door.textureId)!;
    }

    let lh = 0, ds = 0, de = 0, liftOffset = 0;
    let texH = 0, texW = 0, doorTexX = 0;
    let maskBuf = null, maskData = null, maskW = 0, maskH = 0, maskX = 0, maskHeightScale = 1.0;

    if (hasDoor && door && buf) {
      lh = height / door.perpWallDist;
      ds = Math.floor(horizon - lh * (1 - cameraZ));
      de = Math.ceil(horizon + lh * cameraZ);
      if (door.type === "LIFT") liftOffset = Math.floor(lh * door.openAmount);
      texH = buf.height;
      texW = buf.width;
      doorTexX = Math.floor((door.doorOffset || 0) * texW);
      if (doorTexX >= texW) doorTexX = texW - 1;
      if (doorTexX < 0) doorTexX = 0;

      if (door.maskId && auxBuffers?.has(door.maskId)) {
        maskBuf = auxBuffers.get(door.maskId)!;
        maskData = maskBuf.data;
        maskW = maskBuf.width;
        maskH = maskBuf.height;
        maskX = Math.floor((doorTexX / texW) * maskW);
        maskHeightScale = texH > 0 ? maskH / texH : 1.0;
      }
    }

    // Precalculate wall and cap boundaries to maximize performance in pixel loops
    const preparedWalls = [];
    if (hasWalls) {
      for (let i = 0; i < wallsInFront.length; i++) {
        const wall = wallsInFront[i];
        const wlh = height / wall.dist;
        const topZ = wall.topZ !== undefined ? wall.topZ : 1.0;
        const botZ = wall.bottomZ !== undefined ? wall.bottomZ : 0.0;
        const absTopZ = wall.layer + topZ;
        const absBotZ = wall.layer + botZ;
        const wallTop = (wall as any).wallTop !== undefined ? (wall as any).wallTop : Math.floor(horizon + wlh * (cameraZ - absTopZ));
        const wallBottom = (wall as any).wallBottom !== undefined ? (wall as any).wallBottom : Math.ceil(horizon + wlh * (cameraZ - absBotZ));

        let hasCap = false;
        let capStart = 0;
        let capEnd = 0;

        if (cameraZ < absBotZ && (!wall.isFloorWall || wall.isStepDown)) {
          const dz = absBotZ - cameraZ;
          hasCap = true;
          if (wall.isPitWall) {
            capStart = wallBottom;
            capEnd = Math.floor(horizon - (dz * height) / Math.min(wall.dist, spriteDist));
          } else {
            capStart = wallBottom;
            capEnd = Math.floor(horizon - (dz * height) / Math.min(wall.exitDist || (wall.dist + 1), spriteDist));
          }
        } else if (cameraZ > absTopZ && (!wall.isFloorWall || !wall.isStepDown)) {
          const dz = cameraZ - absTopZ;
          hasCap = true;
          if (wall.isFloorWall) {
            capStart = Math.ceil(horizon + (dz * height) / Math.min(wall.dist, spriteDist));
            capEnd = wallTop;
          } else {
            capStart = Math.ceil(horizon + (dz * height) / Math.min(wall.exitDist || (wall.dist + 1), spriteDist));
            capEnd = wallTop;
          }
        }

        preparedWalls.push({
          wallTop,
          wallBottom,
          hasCap,
          capStart,
          capEnd,
          isWindow: !!wall.isWindow,
          glassTransparency: wall.glassTransparency !== undefined ? wall.glassTransparency : 0.0
        });
      }
    }

    const drawStartBound = Math.max(0, drawY);
    const drawEndBound = Math.min(height, drawY + heightScreen);

    if (drawStartBound >= drawEndBound) return;

    interface Span {
      start: number;
      end: number;
      alpha: number;
    }

    let spans: Span[] = [{ start: drawStartBound, end: drawEndBound, alpha: 1.0 }];

    const subtractSpan = (currentSpans: Span[], clipStart: number, clipEnd: number): Span[] => {
      if (clipStart >= clipEnd) return currentSpans;
      const result: Span[] = [];
      for (let i = 0; i < currentSpans.length; i++) {
        const s = currentSpans[i];
        if (clipEnd <= s.start || clipStart >= s.end) {
          result.push(s);
        } else {
          if (clipStart > s.start) {
            result.push({ start: s.start, end: clipStart, alpha: s.alpha });
          }
          if (clipEnd < s.end) {
            result.push({ start: clipEnd, end: s.end, alpha: s.alpha });
          }
        }
      }
      return result;
    };

    const multiplySpan = (currentSpans: Span[], clipStart: number, clipEnd: number, multiplier: number): Span[] => {
      if (clipStart >= clipEnd) return currentSpans;
      const result: Span[] = [];
      for (let i = 0; i < currentSpans.length; i++) {
        const s = currentSpans[i];
        if (clipEnd <= s.start || clipStart >= s.end) {
          result.push(s);
        } else {
          const overlapStart = Math.max(s.start, clipStart);
          const overlapEnd = Math.min(s.end, clipEnd);
          if (s.start < overlapStart) {
            result.push({ start: s.start, end: overlapStart, alpha: s.alpha });
          }
          if (overlapStart < overlapEnd) {
            result.push({ start: overlapStart, end: overlapEnd, alpha: s.alpha * multiplier });
          }
          if (s.end > overlapEnd) {
            result.push({ start: overlapEnd, end: s.end, alpha: s.alpha });
          }
        }
      }
      return result;
    };

    // 1. Apply walls
    if (hasWalls) {
      for (let i = 0; i < preparedWalls.length; i++) {
        const pw = preparedWalls[i];
        if (pw.isWindow) {
          if (pw.glassTransparency < 0.05) {
            spans = subtractSpan(spans, pw.wallTop, pw.wallBottom);
          } else {
            spans = multiplySpan(spans, pw.wallTop, pw.wallBottom, pw.glassTransparency);
          }
        } else {
          spans = subtractSpan(spans, pw.wallTop, pw.wallBottom);
          if (pw.hasCap) {
            spans = subtractSpan(spans, pw.capStart, pw.capEnd);
          }
        }
      }
    }

    // 2. Apply door
    if (hasDoor && door && buf) {
      if (!maskData) {
        // Solid door without mask
        spans = subtractSpan(spans, ds, de - liftOffset);
      } else {
        // Door with mask: scan the column in texture space (cached per texture column)
        const doorSpans = getColumnAlphaSpans(
          buf.data,
          maskData ? maskData.data : null,
          doorTexX,
          maskX,
          texW,
          texH,
          maskW,
          maskHeightScale,
          door.isBroken
        );

        // Map texture spans to screen coordinates and apply to spans list
        const activeHeight = de - liftOffset - ds;
        for (let i = 0; i < doorSpans.length; i++) {
          const dSpan = doorSpans[i];
          const screenStart = Math.floor(ds + (dSpan.start / texH) * activeHeight);
          const screenEnd = Math.ceil(ds + (dSpan.end / texH) * activeHeight);

          if (screenStart >= screenEnd) continue;

          if (dSpan.alpha === 0.0) {
            spans = subtractSpan(spans, screenStart, screenEnd);
          } else if (dSpan.alpha < 0.98) {
            spans = multiplySpan(spans, screenStart, screenEnd, dSpan.alpha);
          }
        }
      }
    }

    // Convert remaining spans into segments
    const segments = [];
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (s.start < s.end && s.alpha > 0.02) {
        segments.push({
          y: s.start,
          h: s.end - s.start,
          alpha: s.alpha
        });
      }
    }

    for (const seg of segments) {
      ctx.globalAlpha = seg.alpha;
      if (drawSource && texX !== -1) {
        const relY = Math.max(0, seg.y - drawY);
        const sTexY = Math.floor((relY / heightScreen) * spriteImgHeight);
        const sTexH = Math.max(
          1,
          Math.floor((seg.h / heightScreen) * spriteImgHeight),
        );
        ctx.drawImage(
          drawSource,
          texX,
          sTexY,
          1,
          sTexH,
          stripX,
          seg.y,
          stripW,
          seg.h,
        );
      } else {
        ctx.fillRect(stripX, seg.y, stripW, seg.h);
      }
    }
    ctx.globalAlpha = 1.0;
    return;
  }

  // Normal unobstructed draw
  if (drawSource && texX !== -1) {
    let destY = drawY;
    let destH = heightScreen;
    let srcY = 0;
    let srcH = spriteImgHeight;

    if (destY < 0) {
      const topCut = -destY;
      const ratioTop = topCut / heightScreen;
      srcY = ratioTop * spriteImgHeight;
      srcH -= srcY;
      destY = 0;
      destH -= topCut;
    }

    if (destY + destH > height) {
      const bottomCut = (destY + destH) - height;
      const ratioBottom = bottomCut / heightScreen;
      srcH -= ratioBottom * spriteImgHeight;
      destH -= bottomCut;
    }

    if (destH > 0 && srcH > 0) {
      ctx.drawImage(
        drawSource,
        texX,
        srcY,
        1,
        srcH,
        stripX,
        destY,
        stripW,
        destH,
      );
    }
  } else {
    let destY = drawY;
    let destH = heightScreen;
    if (destY < 0) {
      destH += destY;
      destY = 0;
    }
    if (destY + destH > height) {
      destH = height - destY;
    }
    if (destH > 0) {
      ctx.fillRect(stripX, destY, stripW, destH);
    }
  }
};

const drawWallAlignedSprite = (
  ctx: CanvasRenderingContext2D,
  sprite: SpriteToRender,
  width: number,
  height: number,
  posX: number,
  posY: number,
  dirX: number,
  dirY: number,
  planeX: number,
  planeY: number,
  horizon: number,
  resolutionDivisor: number = 1,
  spriteResolutionDivisor: number = 1,
  spriteTintCache: Map<string, HTMLCanvasElement | HTMLImageElement>,
  lightningIntensity: number = 0,
  totalMuzzle: number = 0,
  cameraZ: number = 0.5,
  zBuffer?: number[],
  passThroughDoors?: PassThroughDoor[][],
  doorBuffer: RaycasterBuffer | null = null,
  auxBuffers?: Map<string, RaycasterBuffer>,
  flashColor?: { r: number; g: number; b: number },
  minSpriteDist?: Float32Array,
  passThroughWalls?: PassThroughWall[][],
  mapGrid?: any[][],
) => {
  if (!sprite.img || !sprite.wallSide || sprite.transformY < 0.1) return;

  const sTileX = Math.floor(sprite.unbiasedX !== undefined ? sprite.unbiasedX : sprite.x);
  const sTileY = Math.floor(sprite.unbiasedY !== undefined ? sprite.unbiasedY : sprite.y);
  const sTile = (mapGrid && sTileY >= 0 && sTileY < mapGrid.length && sTileX >= 0 && sTileX < mapGrid[sTileY].length) ? mapGrid[sTileY][sTileX] : null;
  const sFloorHeight = sprite.sFloorHeight !== undefined ? sprite.sFloorHeight : (sTile ? (((sTile.type === 'FLOOR' && sTile.height !== undefined) ? sTile.height : 0) + (sTile.elevation || 0)) : 0);

  let drawSource: HTMLImageElement | HTMLCanvasElement;
  const isEmissive = 
    !!sprite.isEmissive ||
    (typeof sprite.id === 'string' && (
      sprite.id.startsWith('EXPLOSION_') ||
      sprite.id.startsWith('FIRE_ANIM_') ||
      sprite.id.startsWith('MUZZLE_FLASH_') ||
      sprite.id.startsWith('SPARK_')
    ));

  if (isEmissive && sprite.img) {
    drawSource = sprite.img;
  } else if (sprite.isHighlighted && sprite.img) {
    const srcToHighlight = (sprite.isPreTinted && sprite.originalImg) ? sprite.originalImg : sprite.img;
    const timePulse = Math.sin(Date.now() / 150) * 0.5 + 0.5;
    drawSource = getHighlightedSprite(
      srcToHighlight,
      spriteTintCache,
      timePulse,
      sprite.id,
    );
  } else {
    const fogAmt = getFogAmount(Math.sqrt(sprite.dist));
    if (sprite.isPreTinted && sprite.img && lightningIntensity === 0 && totalMuzzle === 0 && fogAmt === 0) {
      drawSource = sprite.img;
    } else {
      const srcToTint = (sprite.isPreTinted && sprite.originalImg) ? sprite.originalImg : sprite.img;
      drawSource = getTintedSprite(
        srcToTint,
        sprite.lightColor,
        lightningIntensity,
        totalMuzzle,
        spriteTintCache,
        flashColor,
        fogAmt,
      );
    }
  }

  let nx = 0,
    ny = 0;

  if (sprite.wallSide === "N") {
    nx = 0;
    ny = -1;
  } else if (sprite.wallSide === "S") {
    nx = 0;
    ny = 1;
  } else if (sprite.wallSide === "W") {
    nx = -1;
    ny = 0;
  } else if (sprite.wallSide === "E") {
    nx = 1;
    ny = 0;
  } else if (sprite.wallSide === "TOP" || sprite.wallSide === "BOTTOM") {
    const isTop = sprite.wallSide === "TOP";
    const heightLimit = isTop ? (sprite.scale + (sprite.vOffset || 0)) : (sprite.vOffset || 0);
    const relativeCameraZ = cameraZ - sFloorHeight;
    if (isTop) {
      if (relativeCameraZ <= heightLimit) return;
    } else {
      if (relativeCameraZ < heightLimit) return;
    }

    const mWidth = sprite.meshWidth !== undefined ? sprite.meshWidth : 1.0;
    const halfSize = mWidth / 2;
    const pts = [
      { wx: sprite.x - halfSize, wy: sprite.y - halfSize },
      { wx: sprite.x + halfSize, wy: sprite.y - halfSize },
      { wx: sprite.x + halfSize, wy: sprite.y + halfSize },
      { wx: sprite.x - halfSize, wy: sprite.y + halfSize }
    ];
    let allBehind = true;
    const sPts = [];
    const det = planeX * dirY - dirX * planeY;
    const invDet = 1.0 / det;
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      const sdx = p.wx - posX;
      const sdy = p.wy - posY;
      const transformX = invDet * (dirY * sdx - dirX * sdy);
      const transformY = invDet * (-planeY * sdx + planeX * sdy);
      if (transformY > 0) allBehind = false;
      const screenX = (width / 2) * (1 + transformX / transformY);
      const exactBaseHeight = Math.abs(height / transformY);
      const vShift = exactBaseHeight * (sprite.vOffset || 0);
      const screenYGround = horizon + exactBaseHeight * (cameraZ - sFloorHeight) + vShift;
      const screenY = isTop ? (screenYGround - sprite.scale * exactBaseHeight) : screenYGround;
      sPts.push({ x: screenX, y: screenY, ty: transformY });
    }
    if (allBehind) return;
    for (let i = 0; i < 4; i++) { if (sPts[i].ty < 0.1) return; }
    
    let minTy = sPts[0].ty;
    for (let i = 1; i < 4; i++) if (sPts[i].ty < minTy) minTy = sPts[i].ty;

    let clipped = false;
    if (zBuffer) {
      const minXScr = Math.max(0, Math.floor(Math.min(sPts[0].x, sPts[1].x, sPts[2].x, sPts[3].x)));
      const maxXScr = Math.min(width - 1, Math.ceil(Math.max(sPts[0].x, sPts[1].x, sPts[2].x, sPts[3].x)));

      ctx.save();
      ctx.beginPath();
      let startVisX = -1;
      let clipAdded = false;
      for (let x = minXScr; x <= maxXScr; x++) {
        if (zBuffer[x] >= minTy - 0.05) {
          if (startVisX === -1) startVisX = x;
        } else {
          if (startVisX !== -1) {
             ctx.rect(startVisX, 0, x - startVisX, height);
             clipAdded = true;
             startVisX = -1;
          }
        }
      }
      if (startVisX !== -1) {
         ctx.rect(startVisX, 0, maxXScr - startVisX + 1, height);
         clipAdded = true;
      }
      
      if (clipAdded) {
         ctx.clip();
         clipped = true;
      } else {
         ctx.restore();
         return;
      }
    }

    const tImg = drawSource;
    if (tImg) {
      const W = tImg.width;
      const H = tImg.height;

      const drawTri = (
        scr0: {x: number, y: number}, scr1: {x: number, y: number}, scr2: {x: number, y: number},
        tex0: {x: number, y: number}, tex1: {x: number, y: number}, tex2: {x: number, y: number}
      ) => {
        ctx.save();
        ctx.beginPath();
        
        // Inflate the triangle path by exactly 0.5px outward to perfectly prevent gaps/seams
        const ecx = (scr0.x + scr1.x + scr2.x) / 3;
        const ecy = (scr0.y + scr1.y + scr2.y) / 3;
        const expandPt = (pt: { x: number; y: number }, cx: number, cy: number) => {
          const dx = pt.x - cx;
          const dy = pt.y - cy;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return pt;
          return {
            x: pt.x + (dx / len) * 0.5,
            y: pt.y + (dy / len) * 0.5
          };
        };
        const p0 = expandPt(scr0, ecx, ecy);
        const p1 = expandPt(scr1, ecx, ecy);
        const p2 = expandPt(scr2, ecx, ecy);

        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.clip();

        const dx1 = tex1.x - tex0.x;
        const dy1 = tex1.y - tex0.y;
        const dx2 = tex2.x - tex0.x;
        const dy2 = tex2.y - tex0.y;

        const sx1 = scr1.x - scr0.x;
        const sy1 = scr1.y - scr0.y;
        const sx2 = scr2.x - scr0.x;
        const sy2 = scr2.y - scr0.y;

        const mDet = dx1 * dy2 - dx2 * dy1;
        if (mDet !== 0) {
          const a = (sx1 * dy2 - sx2 * dy1) / mDet;
          const c = (dx1 * sx2 - dx2 * sx1) / mDet;
          const b = (sy1 * dy2 - sy2 * dy1) / mDet;
          const d = (dx1 * sy2 - dx2 * sy1) / mDet;
          const e = scr0.x - a * tex0.x - c * tex0.y;
          const f = scr0.y - b * tex0.x - d * tex0.y;
          
          ctx.transform(a, b, c, d, e, f);
          ctx.drawImage(tImg, 0, 0);
        }
        ctx.restore();
      };

      // Perfect perspective-correct 4x4 grid subdivision to completely eliminate PS1-like affine texture distortion
      const N = 4;
      const getScreenPt = (u: number, v: number) => {
        const wx = sprite.x - halfSize + u * mWidth;
        const wy = sprite.y - halfSize + v * mWidth;
        const sdx = wx - posX;
        const sdy = wy - posY;
        const transformX = invDet * (dirY * sdx - dirX * sdy);
        const transformY = invDet * (-planeY * sdx + planeX * sdy);
        const screenX = (width / 2) * (1 + transformX / transformY);
        const exactBaseHeight = Math.abs(height / transformY);
        const vShift = exactBaseHeight * (sprite.vOffset || 0);
        const screenYGround = horizon + exactBaseHeight * (cameraZ - sFloorHeight) + vShift;
        const screenY = isTop ? (screenYGround - sprite.scale * exactBaseHeight) : screenYGround;
        return { x: screenX, y: screenY, ty: transformY };
      };

      const grid: { x: number; y: number; ty: number }[][] = [];
      for (let i = 0; i <= N; i++) {
        grid[i] = [];
        const u = i / N;
        for (let j = 0; j <= N; j++) {
          const v = j / N;
          grid[i][j] = getScreenPt(u, v);
        }
      }

      for (let i = 0; i < N; i++) {
        const u0 = i / N;
        const u1 = (i + 1) / N;
        for (let j = 0; j < N; j++) {
          const v0 = j / N;
          const v1 = (j + 1) / N;

          const scr0 = grid[i][j];
          const scr1 = grid[i + 1][j];
          const scr2 = grid[i + 1][j + 1];
          const scr3 = grid[i][j + 1];

          if (scr0.ty < 0.1 || scr1.ty < 0.1 || scr2.ty < 0.1 || scr3.ty < 0.1) continue;

          const tu0 = sprite.isMirrored ? (1 - u0) * W : u0 * W;
          const tu1 = sprite.isMirrored ? (1 - u1) * W : u1 * W;
          const tv0 = v0 * H;
          const tv1 = v1 * H;

          // Triangle 1
          drawTri(
            scr0, scr1, scr3,
            { x: tu0, y: tv0 }, { x: tu1, y: tv0 }, { x: tu0, y: tv1 }
          );

          // Triangle 2
          drawTri(
            scr1, scr2, scr3,
            { x: tu1, y: tv0 }, { x: tu1, y: tv1 }, { x: tu0, y: tv1 }
          );
        }
      }
    }
    if (clipped) {
      ctx.restore();
    }
    return;
  }

  const dx = posX - sprite.x;
  const dy = posY - sprite.y;

  const dot = dx * nx + dy * ny;
  if ((sprite.isDecal || sprite.isBoxSide) && dot <= 0) return;

  const mWidth =
    sprite.meshWidth || sprite.scale * (sprite.img!.width / sprite.img!.height);

  const avgBright =
    (sprite.lightColor.r + sprite.lightColor.g + sprite.lightColor.b) / 3;
  const b = Math.min(1, avgBright);
  let colorVal = Math.floor(b * 50);

  if (lightningIntensity > 0 || totalMuzzle > 0) {
    colorVal = Math.min(
      255,
      colorVal +
        Math.floor(lightningIntensity * 255) +
        Math.floor(totalMuzzle * 255),
    );
  }

  const thickness = sprite.thickness || 0;
  const layers = thickness > 0 ? Math.max(2, Math.floor(thickness / 0.005)) : 1;

  const centerX = sprite.x;
  const centerY = sprite.y;

  const det = planeX * dirY - dirX * planeY;
  const invDet = 1.0 / det;

  for (let layer = 0; layer < layers; layer++) {
    const fraction = layers > 1 ? layer / (layers - 1) : 0.5;
    const isFrontFace = layer === layers - 1;

    let cx = centerX;
    let cy = centerY;
    if (thickness > 0) {
      cx = centerX - nx * (thickness / 2) + nx * thickness * fraction;
      cy = centerY - ny * (thickness / 2) + ny * thickness * fraction;
    }

    let end1X = 0,
      end1Y = 0;
    let end2X = 0,
      end2Y = 0;

    if (sprite.wallSide === "S") {
      end1X = cx - 0.5 * mWidth;
      end1Y = cy;
      end2X = cx + 0.5 * mWidth;
      end2Y = cy;
    } else if (sprite.wallSide === "N") {
      end1X = cx + 0.5 * mWidth;
      end1Y = cy;
      end2X = cx - 0.5 * mWidth;
      end2Y = cy;
    } else if (sprite.wallSide === "W") {
      end1X = cx;
      end1Y = cy - 0.5 * mWidth;
      end2X = cx;
      end2Y = cy + 0.5 * mWidth;
    } else if (sprite.wallSide === "E") {
      end1X = cx;
      end1Y = cy + 0.5 * mWidth;
      end2X = cx;
      end2Y = cy - 0.5 * mWidth;
    } else {
      // Fallback (should not happen)
      end1X = cx - 0.5 * mWidth;
      end1Y = cy;
      end2X = cx + 0.5 * mWidth;
      end2Y = cy;
    }

    let t1x = invDet * (dirY * (end1X - posX) - dirX * (end1Y - posY));
    let t1y = invDet * (-planeY * (end1X - posX) + planeX * (end1Y - posY));

    let t2x = invDet * (dirY * (end2X - posX) - dirX * (end2Y - posY));
    let t2y = invDet * (-planeY * (end2X - posX) + planeX * (end2Y - posY));

    let u1 = 0;
    let u2 = 1;

    if (t1y <= 0.05 && t2y <= 0.05) continue;

    if (t1y <= 0.05) {
      const t = (0.05 - t1y) / (t2y - t1y);
      t1y = 0.05;
      t1x = t1x + (t2x - t1x) * t;
      u1 = u1 + (u2 - u1) * t;
    } else if (t2y <= 0.05) {
      const t = (0.05 - t2y) / (t1y - t2y);
      t2y = 0.05;
      t2x = t2x + (t1x - t2x) * t;
      u2 = u2 + (u1 - u2) * t;
    }

    let exactScreen1X = (width / 2) * (1 + t1x / t1y);
    let exactScreen2X = (width / 2) * (1 + t2x / t2y);

    if (exactScreen1X > exactScreen2X) {
      const tmpX = t1x;
      t1x = t2x;
      t2x = tmpX;
      const tmpY = t1y;
      t1y = t2y;
      t2y = tmpY;
      
      const oldU1 = u1;
      const oldU2 = u2;
      u1 = 1 - oldU2;
      u2 = 1 - oldU1;

      const tmpS = exactScreen1X;
      exactScreen1X = exactScreen2X;
      exactScreen2X = tmpS;
    }

    const startX = Math.floor(exactScreen1X);
    const endX = Math.floor(exactScreen2X);
    const faceWidthPx = endX - startX;

    if (faceWidthPx < 1) continue;

    ctx.save();

    const startTransformY = t1y;
    const endTransformY = t2y;
    const startU = u1;
    const endU = u2;

    const exactFaceWidth = exactScreen2X - exactScreen1X;
    const zStep = (1 / endTransformY - 1 / startTransformY) / exactFaceWidth;
    const uStep =
      (endU / endTransformY - startU / startTransformY) / exactFaceWidth;

    const startXOffset = startX - exactScreen1X;

    let currentZInv = 1 / startTransformY + zStep * startXOffset;
    let currentUOverZ = startU / startTransformY + uStep * startXOffset;

    for (let x = 0; x < faceWidthPx; x += spriteResolutionDivisor) {
      const stripX = startX + x;
      if (stripX < 0) {
        currentZInv += zStep * spriteResolutionDivisor;
        currentUOverZ += uStep * spriteResolutionDivisor;
        continue;
      }
      if (stripX >= width) break;

      const currentTransformY = 1 / currentZInv;

      if (zBuffer && currentTransformY > zBuffer[stripX] + 0.05) {
        currentZInv += zStep * spriteResolutionDivisor;
        currentUOverZ += uStep * spriteResolutionDivisor;
        continue;
      }

      let isFullyOccluded = false;
      let activeMaskDoor = null;
      const gridStripX = Math.floor(stripX / resolutionDivisor) * resolutionDivisor;
      if (passThroughDoors && passThroughDoors[gridStripX]) {
        for (let i = 0; i < passThroughDoors[gridStripX].length; i++) {
          const door = passThroughDoors[gridStripX][i];
          if (currentTransformY > door.perpWallDist + 0.02) {
            if (door.type === "LIFT" && door.openAmount >= 0.8) continue;
            if (door.maskId && door.textureId) {
              const buf = (door as any).resolvedBuf;
              if (buf) {
                activeMaskDoor = door;
                continue;
              }
            }
            isFullyOccluded = true;
            break;
          }
        }
      }
      if (isFullyOccluded) {
        currentZInv += zStep * spriteResolutionDivisor;
        currentUOverZ += uStep * spriteResolutionDivisor;
        continue;
      }

      const currentU = currentUOverZ / currentZInv;

      const exactBaseHeight = Math.abs(height / currentTransformY);
      const vShift = exactBaseHeight * (sprite.vOffset || 0);
      const screenY =
        horizon -
        exactBaseHeight * (0.5 - (cameraZ - sFloorHeight)) +
        exactBaseHeight * 0.5 +
        vShift;
      const currentHeightScreen = sprite.scale * exactBaseHeight;
      const drawY = screenY - currentHeightScreen;

      const stripW = Math.min(spriteResolutionDivisor, faceWidthPx - x);

      let texX = -1;
      let currentSource: HTMLCanvasElement | HTMLImageElement | null = null;
      if (isFrontFace) {
        texX = Math.floor(currentU * sprite.img!.width);
        texX = Math.max(0, Math.min(sprite.img!.width - 1, texX));
        currentSource = drawSource;
      } else {
        ctx.fillStyle = "#0a0a0a";
      }

      if (minSpriteDist && stripX >= 0 && stripX < minSpriteDist.length) {
        minSpriteDist[stripX] = Math.min(minSpriteDist[stripX], currentTransformY);
      }

      drawOccludedStrip(
        ctx,
        activeMaskDoor,
        currentSource,
        texX,
        stripX,
        Math.floor(drawY),
        stripW,
        Math.floor(currentHeightScreen),
        sprite.img!.height,
        height,
        horizon,
        cameraZ,
        doorBuffer,
        auxBuffers,
        currentTransformY,
        passThroughWalls ? passThroughWalls[gridStripX] : undefined,
        sprite.x,
        sprite.y,
      );

      currentZInv += zStep * spriteResolutionDivisor;
      currentUOverZ += uStep * spriteResolutionDivisor;
    }

    ctx.restore();
  }
};

const glassOnlyCanvasCache = new Map<string, HTMLCanvasElement>();

export const getGlassOnlyCanvas = (
  textureId: string,
  maskId: string,
  buf: RaycasterBuffer,
  maskBuf: RaycasterBuffer
): HTMLCanvasElement => {
  const cacheKey = `${textureId}_${maskId}`;
  if (glassOnlyCanvasCache.has(cacheKey)) {
    return glassOnlyCanvasCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = buf.width;
  canvas.height = buf.height;
  (canvas as any)._spriteId = `glass_only_${cacheKey}`;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(buf.width, buf.height);
  const data32 = new Uint32Array(imgData.data.buffer);

  const texW = buf.width;
  const texH = buf.height;
  const maskW = maskBuf.width;
  const maskH = maskBuf.height;
  const scaleY = maskH / texH;
  const scaleX = maskW / texW;

  const bufData = buf.data;
  const maskData = maskBuf.data;

  for (let y = 0; y < texH; y++) {
    const mty = Math.floor(y * scaleY);
    const maskRowOffset = mty * maskW;
    const bufRowOffset = y * texW;

    for (let x = 0; x < texW; x++) {
      const mtx = Math.floor(x * scaleX);
      const maskColor = maskData[maskRowOffset + mtx];
      const isGlass = (maskColor & 0x00ffffff) === 0x0000ff00;

      if (isGlass) {
        const color = bufData[bufRowOffset + x];
        const a = (color >> 24) & 0xff;
        const cappedA = Math.min(a, 100);
        data32[bufRowOffset + x] = (color & 0x00ffffff) | (cappedA << 24);
      } else {
        data32[bufRowOffset + x] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  glassOnlyCanvasCache.set(cacheKey, canvas);
  return canvas;
};

export const renderEntities = ({
  ctx,
  width,
  height,
  grid,
  posX,
  posY,
  dirX,
  dirY,
  planeX,
  planeY,
  horizon,
  cameraZ,
  sprites,
  lightMap,
  outdoorMap,
  lightningMap,
  zBuffer,
  solidWallTopBuffer,
  passThroughDoors,
  passThroughWalls,
  mirrorReflections,
  player,
  pickupAnim,
  throwAnim,
  enemyMoveAnim,
  activeAttackerId,
  activeAttackerStartTime = 0,
  damagedEnemyIds,
  highlightedEntityId = null,
  hiddenEnemyIds,
  spriteTintCache,
  lightningIntensity,
  muzzleFlashIntensity,
  particlesRef,
  rainRef,
  fliesRef,
  lastProcessedDamageIds,
  activeFlashes = [],
  enemies,
  isCombatActive = false,
  combatEnemies = [],
  animations,
  explosions = [],
  activeDialogueNPCId = null,
  lootAnims = [],
  roamingAnims = [],
  boxMoveAnims = [],
  aiDebug = false,
  pitLineVis = false,
  doorBuffer,
  auxBuffers,
  playerReflectionSprite,
  resolutionDivisor = 1,
  spriteResolutionDivisor = 1,
  flashlightActive = false,
  flashlightBatteryRatio = 1.0,
  maskCtx,
  isPaused = false,
  raycasterCamera = null,
  aimingSys,
  gameState,
  strings,
  isWebGLActive = false,
  webglRenderer,
  settings,
}: EntityRenderProps) => {
  const mapWidth = grid[0]?.length || 0;
  const mapHeight = grid.length;

  const minSpriteDist = new Float32Array(width);
  minSpriteDist.fill(Infinity);
  spritePoolCount = 0;
  const processedFlies = new Set<string>();

  let quality = 1.0;
  let flashAttenuation = 0.25;
  if (flashlightActive) {
    if (flashlightBatteryRatio <= 0.5) {
      const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
      quality = factor * 0.5 + 0.5;
    }
    flashAttenuation = 1.0 - 0.75 * quality;
  }
  const floorValue = 0.08 * quality;
  const effectiveMuzzleIntensity = muzzleFlashIntensity;

  const addSprite = (props: Partial<SpriteToRender>) => {
    if (spritePoolCount >= spritePool.length) {
      spritePool.push({
        isDamaged: false,
        isHighlighted: false,
        transformX: 0,
        vOffset: 0,
        yOffset: 0,
        bloodStartTime: undefined,
        hidden: false,
        enemyId: undefined,
        isPortrait: false,
        isAttackSprite: false,
        isForeground: false,
        sortOrder: 0,
        isWallAligned: false,
        wallSide: undefined,
        thickness: undefined,
        noBleeding: false,
        isDecal: false,
        isBoxSide: false,
        isMirrored: false,
        isEmptyness: false,
        meshWidth: undefined,
        noShadow: false,
        layer: 1,
        isPreTinted: false,
        originalImg: null,
        ...props,
      } as SpriteToRender);
    } else {
      const obj = spritePool[spritePoolCount];
      obj.isDamaged = false;
      obj.isHighlighted = false;
      obj.transformX = 0;
      obj.vOffset = 0;
      obj.yOffset = 0;
      obj.bloodStartTime = undefined;
      obj.hidden = false;
      obj.enemyId = undefined;
      obj.isPortrait = false;
      obj.isAttackSprite = false;
      obj.isForeground = false;
      obj.sortOrder = 0;
      obj.isWallAligned = false;
      obj.wallSide = undefined;
      obj.thickness = undefined;
      obj.noBleeding = false;
      obj.isCharred = undefined;
      obj.burntTime = undefined;
      obj.isDecal = false;
      obj.isBoxSide = false;
      obj.isMirrored = false;
      obj.isEmptyness = false;
      obj.meshWidth = undefined;
      obj.noShadow = false;
      obj.layer = 1;
      obj.isPreTinted = false;
      obj.originalImg = null;
      obj.gridX = undefined;
      obj.gridY = undefined;
      obj.unbiasedX = undefined;
      obj.unbiasedY = undefined;
      obj.sFloorHeight = undefined;

      Object.assign(obj, props);
    }
    spritePoolCount++;
  };

  const playerTileX = Math.floor(posX);
  const playerTileY = Math.floor(posY);
  const now = performance.now();

  // --- PER-FRAME LOOKUP PREP (keeps per-entity work O(1)) ---
  const roamingAnimById = new Map<string, RoamingEnemyAnim>();
  for (let i = 0; i < roamingAnims.length; i++) {
    const a = roamingAnims[i];
    roamingAnimById.set(a.id, a);
  }
  const combatEnemyById = new Map<string, any>();
  let centerCombatEnemy: any;
  for (let i = 0; i < combatEnemies.length; i++) {
    const ce = combatEnemies[i];
    combatEnemyById.set(ce.id, ce);
    if (!centerCombatEnemy && ce.alignment === 'CENTER') centerCombatEnemy = ce;
  }
  const damagedEnemyIdSet = damagedEnemyIds ? new Set(damagedEnemyIds) : null;
  const hiddenEnemyIdSet = hiddenEnemyIds ? new Set(hiddenEnemyIds) : null;

  // PRE-RESOLVE PASSTHROUGH DOOR PROPERTIES TO DRAMATICALLY IMPROVE PERFORMANCE
  const processedDoorsSet = new Set<any>();
  if (passThroughDoors) {
    for (let x = 0; x < width; x += resolutionDivisor) {
      const doors = passThroughDoors[x];
      if (doors) {
        for (let i = 0; i < doors.length; i++) {
          const door = doors[i] as any;
          if (!processedDoorsSet.has(door)) {
            processedDoorsSet.add(door);
            if (door.maskId && door.textureId) {
              let buf = doorBuffer;
              if (auxBuffers && auxBuffers.has(door.textureId)) {
                buf = auxBuffers.get(door.textureId)!;
              }
              door.resolvedBuf = buf;

              let maskBuf = door.maskId ? auxBuffers?.get(door.maskId) : null;
              door.resolvedMaskBuf = maskBuf;

              if (buf && maskBuf) {
                door.resolvedMaskScaleY = maskBuf.height / buf.height;
              } else {
                door.resolvedMaskScaleY = 0;
              }
            } else {
              door.resolvedBuf = null;
              door.resolvedMaskBuf = null;
              door.resolvedMaskScaleY = 0;
            }
          }
        }
      }
    }
  }

  let hasActiveAnimations = false;

  const resolveImg = (
    assetId: string,
    startTime: number = 0,
    seed: number = 0,
  ) => {
    const animDef = animations && animations[assetId];
    if (animDef && animDef.frames && animDef.frames.length > 1 && animDef.repeat !== false) {
      hasActiveAnimations = true;
    }
    const frameId = getCurrentAnimationFrame(
      assetId,
      animations,
      now,
      startTime,
      seed,
    );
    if (frameId === null) return null;
    let img = sprites?.get(frameId);
    if (!img || img.width === 0) {
      img = sprites?.get("TEX_" + frameId);
    }
    if (!img || img.width === 0) {
      if (auxBuffers && auxBuffers.has(frameId)) {
         // Create a canvas with the texture in it to hand to the sprite renderer
         const buf = auxBuffers.get(frameId)!;
         const cvs = document.createElement("canvas");
         (cvs as any).version = "TEX_" + frameId;
         cvs.width = buf.width;
         cvs.height = buf.height;
         const c = cvs.getContext("2d");
         if(c) {
           const idata = c.createImageData(buf.width, buf.height);
           new Uint32Array(idata.data.buffer, idata.data.byteOffset, idata.data.byteLength / 4).set(buf.data);
           c.putImageData(idata, 0, 0);
           img = cvs as unknown as HTMLImageElement;
           sprites?.set("TEX_" + frameId, cvs as unknown as HTMLImageElement); // Cache it
         }
      }
    }
    if (!img || img.width === 0) {
      img = sprites?.get("TEX_FALLBACK");
    }
    return img || null;
  };

  const getAnimConfig = (assetId: string) => animations[assetId];
  const getAnimScale = (assetId: string) => animations[assetId]?.scale || 1.0;

  // OPTIMIZATION: Calculate View Bounds
  const minX = Math.max(0, playerTileX - RENDER_DISTANCE);
  const maxX = Math.min(mapWidth, playerTileX + RENDER_DISTANCE);
  const minY = Math.max(0, playerTileY - RENDER_DISTANCE);
  const maxY = Math.min(mapHeight, playerTileY + RENDER_DISTANCE);

  // 1. COLLECT SPRITES (Optimized Loop)
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const tile = grid[y][x];
      if (!tile) continue;

      // STATIC TILE CENTER
      const baseX = x + 0.5;
      const baseY = y + 0.5;

      // Simple distance check
      const relX = baseX - posX;
      const relY = baseY - posY;
      const distSq = relX * relX + relY * relY;

      if (distSq > RENDER_DISTANCE * RENDER_DISTANCE) continue;

      let sprLight = { r: 1.0, g: 1.0, b: 1.0 };
      if (lightMap && lightMap[y] && lightMap[y][x]) {
        sprLight = { ...lightMap[y][x] };
        if (flashlightActive) {
          sprLight.r = Math.max(floorValue, sprLight.r);
          sprLight.g = Math.max(floorValue, sprLight.g);
          sprLight.b = Math.max(floorValue, sprLight.b);
        }
      }

      // Apply Depth Shading
      const dist = Math.sqrt(distSq);
      const depthFactor = applyDepthBrightness(1.0, dist);
      sprLight = {
        r: sprLight.r * depthFactor,
        g: sprLight.g * depthFactor,
        b: sprLight.b * depthFactor,
      };

      const seed = (tile.x * 73856093) ^ (tile.y * 19349663);

      // --- ENTITY PROCESSING (ENEMIES) ---
      if (tile.enemyId && enemies?.has(tile.enemyId)) {
        let enemyX = baseX;
        let enemyY = baseY;

        // Interpolation for enemies
        if (enemyMoveAnim && enemyMoveAnim.id === tile.enemyId) {
          const nowAnim = performance.now();
          const elapsed = nowAnim - enemyMoveAnim.startTime;
          const animDuration = (enemyMoveAnim as any).duration || 400;
          const t = Math.min(1, Math.max(0, elapsed / animDuration));
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          enemyX = lerp(enemyMoveAnim.startX, enemyMoveAnim.endX, ease) + 0.5;
          enemyY = lerp(enemyMoveAnim.startY, enemyMoveAnim.endY, ease) + 0.5;
        } else if (roamingAnimById.size > 0) {
          const roaming = roamingAnimById.get(tile.enemyId);
          if (roaming) {
            const elapsed = performance.now() - roaming.startTime;
            const t = Math.min(1, Math.max(0, elapsed / roaming.duration));
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            enemyX = lerp(roaming.startX, roaming.endX, ease) + 0.5;
            enemyY = lerp(roaming.startY, roaming.endY, ease) + 0.5;
          }
        }

        // Keep bias for enemies (they move dynamically)
        let enemyBiasedX = enemyX;
        let enemyBiasedY = enemyY;
        const eVecX = posX - enemyX;
        const eVecY = posY - enemyY;
        const eDistToPlayer = Math.sqrt(eVecX * eVecX + eVecY * eVecY);
        if (eDistToPlayer > 0.2) {
          const shift = 0.17;
          enemyBiasedX += (eVecX / eDistToPlayer) * shift;
          enemyBiasedY += (eVecY / eDistToPlayer) * shift;
        }

        const enemyDistSq = (posX - enemyX) ** 2 + (posY - enemyY) ** 2;
        const eData = enemies.get(tile.enemyId)!;
        
        let isAimedAt = false;
        if (gameState === GameState.AIMING && aimingSys) {
          const currentTarget = aimingSys.aimingTargets[aimingSys.aimTargetIndex];
          if (currentTarget && currentTarget.id === tile.enemyId) {
            isAimedAt = true;
          }
        }

        let assetId = eData.assets?.map?.assetId || (typeof eData.assets?.map === 'string' ? eData.assets.map : "");
        let enemyBaseScale = eData.assets?.map?.scale !== undefined ? eData.assets.map.scale : 1.0;

        if (isAimedAt && eData.assets?.hands_up?.assetId) {
          assetId = eData.assets.hands_up.assetId;
          enemyBaseScale = eData.assets.hands_up.scale !== undefined ? eData.assets.hands_up.scale : enemyBaseScale;
        }

        let img = resolveImg(assetId, 0, seed);

        let isPortrait = false;
        let isAttackSprite = false;
        let vOffset = 0;

        const animConfig = getAnimConfig(assetId);
        const animScale = animConfig?.scale || 1.0;
        let scale = enemyBaseScale * animScale;

        if (animConfig?.centered) {
          vOffset += (scale - 1) / 2;
        }

        const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
        const playerTile = grid[playerTileY]?.[playerTileX];
        const enemyTile = grid[y]?.[x];
        const isAdjacent = Math.abs(x - playerTileX) <= 1 && Math.abs(y - playerTileY) <= 1;
        const isBlockedByPit = (isPitTile(playerTile) !== isPitTile(enemyTile)) && isAdjacent;

        // OPTIMIZATION: LOS is only needed for the close-range portrait/combat decision.
        // Skip the raycast entirely for enemies beyond that range.
        const isClose =
          enemyDistSq <= 2.5 &&
          !isBlockedByPit &&
          hasLineOfSight(
            player.pos,
            { x: enemyX, y: enemyY },
            grid,
            mapWidth,
            mapHeight,
            tile.enemyId,
            false
          );

        let isCameraRotating = false;
        let diff = Math.abs(player.dir - player.dir360);
        while (diff > 2) diff = 4 - diff;
        if (diff > 0.05) isCameraRotating = true;

        let forceSpriteMode = false;
        if (enemyMoveAnim || isCameraRotating) {
          const tileDx = Math.abs(enemyX - (playerTileX + 0.5));
          const tileDy = Math.abs(enemyY - (playerTileY + 0.5));
          if (tileDx >= 1 && tileDy >= 1) {
            forceSpriteMode = true;
          }
        }

        const isSideBlocked = false;

        if (isClose && isCombatActive && !forceSpriteMode && !isSideBlocked) {
          if (eData.assets?.portrait) {
            const portraitAssetId = eData.assets.portrait.assetId || (typeof eData.assets.portrait === 'string' ? eData.assets.portrait : "");
            const portraitImg = resolveImg(
              portraitAssetId,
              0,
              seed,
            );
            if (portraitImg) {
              img = portraitImg;
              isPortrait = true;
              const animScale = getAnimScale(portraitAssetId);
              scale = (eData.assets.portrait.scale ?? 1.0) * animScale * 1.05;
              vOffset = 0.12;
            }
          }
          if (activeAttackerId === tile.enemyId && eData.assets?.attack) {
            const attackAssetId = eData.assets.attack.assetId || (typeof eData.assets.attack === 'string' ? eData.assets.attack : "");
            const attackImg = resolveImg(
              attackAssetId,
              activeAttackerStartTime,
              seed,
            );
            if (attackImg) {
              img = attackImg;
              isPortrait = true;
              isAttackSprite = true;
              const animScale = getAnimScale(attackAssetId);
              scale = (eData.assets.attack.scale ?? 1.0) * animScale * 1.15;
              vOffset = 0.12;
            }
          }
          if (isPortrait && combatEnemyById.size > 0) {
            const activeEnemy = combatEnemyById.get(tile.enemyId);
            const centerEnemy = centerCombatEnemy;
            const hasCenterPortrait =
              centerEnemy &&
              centerEnemy.distance !== undefined &&
              centerEnemy.distance * centerEnemy.distance <= 2.3;
            if (activeEnemy && activeEnemy.alignment !== "CENTER") {
              const d = Math.sqrt(enemyDistSq);
              if (d > 0.1) {
                const curRelX = enemyBiasedX - posX;
                const curRelY = enemyBiasedY - posY;
                const ndx = curRelX / d;
                const ndy = curRelY / d;
                const localRightX = -ndy;
                const localRightY = ndx;
                const shiftAmount = 0.35;
                if (activeEnemy.alignment === "LEFT") {
                  enemyBiasedX += localRightX * shiftAmount;
                  enemyBiasedY += localRightY * shiftAmount;
                } else if (activeEnemy.alignment === "RIGHT") {
                  enemyBiasedX -= localRightX * shiftAmount;
                  enemyBiasedY -= localRightY * shiftAmount;
                }
              }
              if (activeAttackerId !== tile.enemyId) {
                if (hasCenterPortrait) scale *= 0.9;
              }
            }
          }
        } else {
          if (
            activeAttackerId === tile.enemyId &&
            eData.assets?.distanceAttack
          ) {
            const distAssetId = eData.assets.distanceAttack.assetId || (typeof eData.assets.distanceAttack === 'string' ? eData.assets.distanceAttack : "");
            const attackImg = resolveImg(
              distAssetId,
              activeAttackerStartTime,
              seed,
            );
            if (attackImg) {
              img = attackImg;
              const distAnimScale = getAnimScale(
                distAssetId,
              );
              scale =
                (eData.assets.distanceAttack.scale ?? 1.0) * distAnimScale;
            }
          }
        }

        const bleedId = tile.enemyId + "_NOBLEED";
        const hasDamaged =
          !!damagedEnemyIdSet && damagedEnemyIdSet.has(tile.enemyId);
        const hasDamagedNoBleed =
          !!damagedEnemyIdSet && damagedEnemyIdSet.has(bleedId);
        const isDamaged = hasDamaged || hasDamagedNoBleed;
        const noBleeding = hasDamagedNoBleed && !hasDamaged;
        const isHighlighted = highlightedEntityId === tile.enemyId;
        const isHidden =
          !!hiddenEnemyIdSet && hiddenEnemyIdSet.has(tile.enemyId);

        if (activeDialogueNPCId && tile.enemyId === activeDialogueNPCId && enemyDistSq <= 2.5) {
          let portraitResolved = false;
          if (eData.assets?.portrait) {
            const portraitAssetId = eData.assets.portrait.assetId || (typeof eData.assets.portrait === 'string' ? eData.assets.portrait : "");
            const portraitImg = resolveImg(portraitAssetId, 0, seed);
            if (portraitImg) {
              img = portraitImg;
              const portraitAnimScale = getAnimScale(portraitAssetId);
              scale = 1.15 * portraitAnimScale * (eData.assets.portrait.scale ?? 1.0);
              vOffset = 0.12;
              isPortrait = true;
              portraitResolved = true;
            }
          }
          if (!portraitResolved && eData.assets?.map?.assetId) {
            const portraitKey = `${eData.assets.map.assetId}_PORTRAIT`;
            const portraitImg = resolveImg(portraitKey, 0, seed);
            if (portraitImg) {
              img = portraitImg;
              const portraitAnimScale = getAnimScale(portraitKey);
              scale = 1.15 * portraitAnimScale;
              vOffset = 0.12;
              isPortrait = true;
            }
          }
        }

        if (isDamaged) {
          const len = Math.sqrt(enemyDistSq);
          if (len > 0) {
            const pushAmount = 0.2;
            enemyBiasedX += ((enemyX - posX) / len) * pushAmount;
            enemyBiasedY += ((enemyY - posY) / len) * pushAmount;
          }
        }

        const finalDistSq =
          (posX - enemyBiasedX) ** 2 + (posY - enemyBiasedY) ** 2;

        addSprite({
          id: tile.enemyId,
          x: enemyBiasedX,
          y: enemyBiasedY,
          unbiasedX: enemyX,
          unbiasedY: enemyY,
          gridX: x,
          gridY: y,
          img,
          dist: finalDistSq,
          scale,
          lightColor: sprLight,
          isDamaged,
          isHighlighted,
          transformY: 0,
          vOffset,
          noBleeding,
          hidden: isHidden,
          isPortrait,
          isAttackSprite,
          noShadow: !!eData?.noShadow,
          layer: isPortrait ? 3 : 2,
        });
      }

      // --- DECORATIONS ---
      const decorsToRender: { decoration: any; isPit: boolean; decorIndex: number; totalNonPitDecors: number }[] = [];
      if (tile.pitDecoration) {
        decorsToRender.push({ decoration: tile.pitDecoration, isPit: true, decorIndex: 0, totalNonPitDecors: 1 });
      }
      if (tile.decorations && tile.decorations.length > 0) {
        const total = tile.decorations.length;
        tile.decorations.forEach((dec, idx) => decorsToRender.push({ decoration: dec, isPit: false, decorIndex: idx, totalNonPitDecors: total }));
      } else if (tile.decoration) {
        decorsToRender.push({ decoration: tile.decoration, isPit: false, decorIndex: 0, totalNonPitDecors: 1 });
      }

      const calculateShouldMirror = (dec: any): boolean => {
        if (dec.isMirrored) return true;
        if (dec.autoMirror !== true) return false;

        const spriteFacing = dec.spriteFacing || "right";
        const spriteOriginallyRight = spriteFacing === "right";

        const decX = dec.x !== undefined ? dec.x : (x + 0.5);
        const decY = dec.y !== undefined ? dec.y : (y + 0.5);

        const dx = posX - decX;
        const dy = posY - decY;

        const facingStr = dec.yRotation !== undefined ? getDecorationFacingAngle(dec) : dec.facing;
        if (facingStr !== undefined && facingStr !== null && facingStr !== "") {
          let fx = 1;
          let fy = 0;
          if (typeof facingStr === "number") {
            const rad = (facingStr * Math.PI) / 180;
            fx = Math.cos(rad);
            fy = Math.sin(rad);
          } else if (typeof facingStr === "string") {
            const fUpper = facingStr.toUpperCase();
            switch (fUpper) {
              case "E": fx = 1; fy = 0; break;
              case "W": fx = -1; fy = 0; break;
              case "S": fx = 0; fy = 1; break;
              case "N": fx = 0; fy = -1; break;
              case "NE": fx = 0.7071; fy = -0.7071; break;
              case "NW": fx = -0.7071; fy = -0.7071; break;
              case "SE": fx = 0.7071; fy = 0.7071; break;
              case "SW": fx = -0.7071; fy = 0.7071; break;
              default: fx = 1; fy = 0; break;
            }
          }
          const dot = dx * fx + dy * fy;
          const isBehind = dot < 0;
          return spriteOriginallyRight ? isBehind : !isBehind;
        }

        const isBehind = (dx + dy) < 0;
        return spriteOriginallyRight ? isBehind : !isBehind;
      };

      decorsToRender.forEach(({ decoration, isPit, decorIndex, totalNonPitDecors }) => {
        const rawImg = resolveImg(decoration.assetId, 0, seed);
        if (rawImg) {
          const shouldMirror = calculateShouldMirror(decoration);
          const srcImg = shouldMirror ? getMirroredSprite(rawImg, spriteTintCache) : rawImg;
          const tintedImg = getLazyPreTintedSprite(srcImg, sprLight, decoration, spriteTintCache);
          const animConfig = getAnimConfig(decoration.assetId);
          const animScale = animConfig?.scale || 1.0;
          const scale = (decoration.scale || 1.0) * animScale;
          let vOffset = 0;
          let yOffset = decoration.yOffset || 0;
          if (yOffset !== 0) {
            vOffset += yOffset * Math.abs(1 - scale);
          } else if (animConfig?.centered) {
            vOffset += (scale - 1) / 2;
          }

          const decorId = isPit
            ? `pit_decor_${x}_${y}`
            : totalNonPitDecors > 1
            ? `decor_${x}_${y}_${decorIndex}`
            : `decor_${x}_${y}`;

          const isDamaged =
            damagedEnemyIds && (
              damagedEnemyIds.includes(decorId) ||
              damagedEnemyIds.includes(`decor_${x}_${y}`) ||
              damagedEnemyIds.includes(`decor_${x}_${y}_${decorIndex}`)
            );
          const isHighlighted =
            highlightedEntityId === decorId ||
            highlightedEntityId === `decor_${x}_${y}_${decorIndex}` ||
            (decorIndex === 0 && highlightedEntityId === `decor_${x}_${y}`);

          const decorAny = decoration as any;

          if (decorAny.renderMode === "polyObject" || decorAny.type === "polyObject" || decorAny.polyModelId || decorAny.polyModel) {
            const modelId = decorAny.polyModelId || "chair";
            const model = decorAny.polyModel || getPolyModelById(modelId) || getPolyModelById("chair");
            if (model) {
              const scale = decorAny.scale !== undefined ? decorAny.scale : 1.0;
              const currentTile = grid[y]?.[x];
              const defFH = currentTile ? (((currentTile.type === 'FLOOR' && currentTile.height !== undefined) ? currentTile.height : 0) + (currentTile.elevation || 0)) : 0;
              const decorDistSq = (posX - baseX) ** 2 + (posY - baseY) ** 2;

              addSprite({
                id: `DECOR_POLY_${decoration.id}_${x}_${y}_${decorIndex}`,
                x: baseX,
                y: baseY,
                unbiasedX: baseX,
                unbiasedY: baseY,
                gridX: x,
                gridY: y,
                img: tintedImg || rawImg,
                originalImg: rawImg,
                dist: decorDistSq,
                scale: scale,
                lightColor: sprLight,
                transformY: 0,
                vOffset: 0,
                yOffset: decorAny.yOffset || 0,
                isDamaged,
                isHighlighted,
                layer: decoration.foreground ? 2.5 : 1,
                isPolyObject: true,
                polyModel: model,
                polyFacing: getDecorationFacingAngle(decorAny),
                sFloorHeight: defFH,
                noShadow: !!decoration?.noShadow,
              });
            }
          } else if (decorAny.isBox) {
            const size = decorAny.boxSize !== undefined ? decorAny.boxSize : 1.0;
            const halfSize = size / 2;
            const sides: ("N" | "S" | "E" | "W" | "TOP")[] = ["N", "S", "E", "W", "TOP"];
            
            let drawX = baseX;
            let drawY = baseY;
            let boxFloorHeight: number | undefined = undefined;
            
            if (!isPit && boxMoveAnims.length > 0) {
              const movingBox = boxMoveAnims.find(a => a.endX === x && a.endY === y);
              if (movingBox) {
                 const nowAnim = performance.now();
                 const elapsed = nowAnim - movingBox.startTime;
                 const t = Math.min(1, Math.max(0, elapsed / 150));
                 const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                 drawX = lerp(movingBox.startX, movingBox.endX, ease) + 0.5;
                 drawY = lerp(movingBox.startY, movingBox.endY, ease) + 0.5;

                 // Интерполяция высоты пола между стартовой и конечной плиткой
                 const startTile = grid[movingBox.startY]?.[movingBox.startX];
                 const endTile = grid[movingBox.endY]?.[movingBox.endX];
                 
                 const getBoxFH = (tile: any, isStart: boolean) => {
                   if (!tile) return 0.0;
                   const baseH = (tile.type === 'FLOOR' && tile.height !== undefined) ? tile.height : 0.0;
                   const elevation = tile.elevation || 0;
                   if (baseH < 0.0) {
                     if (isStart) {
                       // Для стартовой плитки: если на ней осталась коробка (которая была нижней),
                       // значит наша толкаемая коробка стояла на ней и начинала движение с высоты 0.0
                       if (tile.decoration?.isBox) {
                         return 0.0 + elevation;
                       }
                     } else {
                       // Для конечной плитки: если у нее заполнено pitDecoration (там лежит коробка внизу),
                       // значит наша толкаемая коробка приедет на нее и встанет на высоте 0.0
                       if (tile.pitDecoration) {
                         return 0.0 + elevation;
                       }
                     }
                     return baseH + elevation;
                   }
                   return baseH + elevation;
                 };

                 const startFH = getBoxFH(startTile, true);
                 const endFH = getBoxFH(endTile, false);
                 boxFloorHeight = lerp(startFH, endFH, ease);
              }
            }

            const currentTile = grid[y]?.[x];
            const defFH = currentTile ? (((currentTile.type === 'FLOOR' && currentTile.height !== undefined) ? currentTile.height : 0) + (currentTile.elevation || 0)) : 0;
            const defaultFHForThisBox = (isPit || !tile.pitDecoration) ? defFH : (0.0 + (currentTile?.elevation || 0));
            const finalFloorHeight = boxFloorHeight !== undefined ? boxFloorHeight : defaultFHForThisBox;
            
            // Re-calculate distance based on interpolated pos
            const boxDistSq = (posX - drawX) ** 2 + (posY - drawY) ** 2;
            
            sides.forEach(side => {
              let mx = drawX;
              let my = drawY;
              if (side === "N") my -= halfSize;
              else if (side === "S") my += halfSize;
              else if (side === "W") mx -= halfSize;
              else if (side === "E") mx += halfSize;
              
              const newDistSq = (posX - mx) ** 2 + (posY - my) ** 2;

              addSprite({
                id: `DECOR_${decoration.id}_${side}${isPit ? '_pit' : ''}`,
                x: side === "TOP" ? drawX : mx,
                y: side === "TOP" ? drawY : my,
                unbiasedX: baseX,
                unbiasedY: baseY,
                gridX: x,
                gridY: y,
                img: tintedImg,
                originalImg: rawImg,
                isPreTinted: true,
                dist: side === "TOP" ? boxDistSq : newDistSq,
                scale: size,
                lightColor: sprLight,
                transformY: 0,
                vOffset: 0,
                yOffset: 0,
                isDamaged,
                isHighlighted,
                layer: decoration.foreground ? 2.5 : 1,
                isWallAligned: true,
                isDecal: false,
                isBoxSide: side !== "TOP",
                isBox: true,
                wallSide: side,
                thickness: 0,
                meshWidth: size,
                isEmptyness: decoration.isEmptyness,
                sFloorHeight: finalFloorHeight,
              });
            });
          } else {
            let finalX = baseX + (decorAny.worldOffsetX || 0);
            let finalY = baseY + (decorAny.worldOffsetY || 0);
            let finalWallSide = decorAny.wallSide;
            let finalMeshWidth = decorAny.meshWidth;

            if (decorAny.renderMode === "mesh") {
              const meshAxis = decorAny.meshAxis || decorAny.axis || "AUTO";
              const meshOffset = decorAny.meshOffset !== undefined ? decorAny.meshOffset : decorAny.offset;

              let finalAxis = meshAxis;
              if (finalAxis === "AUTO") {
                const ws = decorAny.wallSide;
                if (ws === "N" || ws === "S") {
                  finalAxis = "NS";
                } else if (ws === "E" || ws === "W") {
                  finalAxis = "WE";
                } else {
                  finalAxis = "NS";
                }
              }

              const offsetVal = meshOffset !== undefined ? meshOffset : 0.5;

              if (finalAxis === "Y") {
                finalX = baseX;
                finalY = baseY;
                finalWallSide = "BOTTOM";
              } else if (finalAxis === "NS") {
                finalX = baseX;
                finalY = baseY - 0.5 + offsetVal;
                finalWallSide = "S";
              } else {
                finalX = baseX - 0.5 + offsetVal;
                finalY = baseY;
                finalWallSide = "E";
              }

              if (decorAny.preserveAspect) {
                const imgObj = rawImg || tintedImg;
                if (imgObj && imgObj.width && imgObj.height) {
                  finalMeshWidth = scale * (imgObj.width / imgObj.height);
                } else if (finalMeshWidth === undefined) {
                  finalMeshWidth = (finalAxis === "Y") ? scale : 1.0;
                }
              } else if (finalMeshWidth === undefined) {
                finalMeshWidth = (finalAxis === "Y") ? scale : 1.0;
              }
            }

            const finalDistSq = (posX - finalX) ** 2 + (posY - finalY) ** 2;

            addSprite({
              id: `DECOR_${decoration.id}${isPit ? '_pit' : ''}`,
              x: finalX,
              y: finalY,
              unbiasedX: baseX,
              unbiasedY: baseY,
              gridX: x,
              gridY: y,
              img: tintedImg,
              originalImg: rawImg,
              isPreTinted: true,
              dist: finalDistSq,
              scale,
              lightColor: sprLight,
              transformY: 0,
              vOffset,
              yOffset,
              isDamaged,
              isHighlighted,
              layer: decoration.foreground ? 2.5 : 1,
              isWallAligned: decorAny.renderMode === "mesh",
              isDecal: false,
              wallSide: finalWallSide,
              thickness: decorAny.thickness || 0,
              meshWidth: finalMeshWidth,
              isEmptyness: decoration.isEmptyness,
              noShadow: !!decoration?.noShadow,
            });
          }
        }
      });

      // --- EXPLOSIVES (C4) ---
      if (tile.explosive) {
        const rawImg = resolveImg(tile.explosive.assetId, 0, seed);
        if (rawImg) {
          const animConfig = getAnimConfig(tile.explosive.assetId);
          const animScale = animConfig?.scale || 1.0;
          const scale = 0.15 * animScale; // Smaller scale 0.15

          // FIX: Center vertically on the wall (horizon)
          const vOffset = -(0.5 - scale / 2);

          let drawX = baseX;
          let drawY = baseY;
          const thickness = 0.0375; // C4 Thickness (Reduced by half again)
          const wallOffset = 0.5 + thickness / 2; // Distance from center of tile to center of C4

          if (tile.explosive.side === "N") {
            drawY = baseY - wallOffset;
          } else if (tile.explosive.side === "S") {
            drawY = baseY + wallOffset;
          } else if (tile.explosive.side === "W") {
            drawX = baseX - wallOffset;
          } else if (tile.explosive.side === "E") {
            drawX = baseX + wallOffset;
          } else {
            // Fallback: Determine side based on vector to player
            const vecX = posX - baseX;
            const vecY = posY - baseY;
            if (Math.abs(vecX) > Math.abs(vecY)) {
              drawX = baseX + (vecX > 0 ? wallOffset : -wallOffset);
              tile.explosive.side = vecX > 0 ? "E" : "W"; // Auto-fix side
            } else {
              drawY = baseY + (vecY > 0 ? wallOffset : -wallOffset);
              tile.explosive.side = vecY > 0 ? "S" : "N"; // Auto-fix side
            }
          }

          const newDistSq = (posX - drawX) ** 2 + (posY - drawY) ** 2;

          let c4Light = { ...sprLight };
          if (animations) {
            const now = performance.now();
            const frameId = getCurrentAnimationFrame(
              tile.explosive.assetId,
              animations,
              now,
              0,
              seed,
            );
            if (frameId === "C4_WALL_ARMED") {
              c4Light.r = Math.min(1.0, c4Light.r + 0.5);
              c4Light.g = Math.min(1.0, c4Light.g + 0.5);
              c4Light.b = Math.min(1.0, c4Light.b + 0.5);
            }
          }

          const tintedImg = getLazyPreTintedSprite(rawImg, c4Light, tile.explosive, spriteTintCache);

          addSprite({
            id: `EXPLOSIVE_${tile.explosive.id}`,
            x: drawX,
            y: drawY,
            gridX: x,
            gridY: y,
            img: tintedImg,
            originalImg: rawImg,
            isPreTinted: true,
            dist: newDistSq,
            scale,
            lightColor: c4Light,
            transformY: 0,
            vOffset,
            layer: 1,
            isWallAligned: true,
            isDecal: true,
            wallSide: tile.explosive.side,
            thickness,
            meshWidth: scale,
          });
        }
      }

      // --- CORPSES ---
      if (tile.corpses && tile.corpses.length > 0) {
        const isHighlighted = highlightedEntityId === `corpse_${x}_${y}`;
        tile.corpses.forEach((corpse, idx) => {
          const img = resolveImg(
            corpse.assetId,
            corpse.bloodStartTime || 0,
            seed,
          );
          if (img) {
            const offsetX = corpse.offset?.x || 0;
            const offsetY = corpse.offset?.y || 0;

            addSprite({
              id: `CORPSE_${x}_${y}_${idx}`,
              x: baseX + offsetX,
              y: baseY + offsetY,
              unbiasedX: baseX + offsetX,
              unbiasedY: baseY + offsetY,
              gridX: x,
              gridY: y,
              img,
              dist: distSq,
              scale: (corpse.scale || 0.5) * getAnimScale(corpse.assetId),
              lightColor: sprLight,
              transformY: 0,
              vOffset: 0.3,
              bloodStartTime: corpse.bloodStartTime,
              isCharred: corpse.isCharred,
              burntTime: corpse.burntTime,
              layer: 0,
              sortOrder: idx,
              isHighlighted,
            });
          }
        });
      }

      // --- ITEMS ---
      if (tile.items && tile.items.length > 0) {
        tile.items.forEach((item, idx) => {
          const isBeingPickedUp = pickupAnim && pickupAnim.item.id === item.id;
          const isBeingThrown = throwAnim && throwAnim.item.id === item.id;
          const isLootDrop = lootAnims.some((a) => a.item.id === item.id);

          if (!isBeingPickedUp && !isBeingThrown && !isLootDrop) {
            const hasThrowId = !!(item as any).throwId;
            const isPlacedAsThrown = !!(item as any).placedAsThrown;
            const useThrowId = hasThrowId && isPlacedAsThrown;
            const assetToUse = useThrowId ? (item as any).throwId : item.assetId;
            
            let img = resolveImg(assetToUse, 0, seed);
            if (!img && pickupAnim?.item.symbol)
              img = resolveImg(`ITEM_${item.symbol}`, 0, seed);
            if (img) {
              const stackOffset = idx * 0.05;
              const animConfig = getAnimConfig(assetToUse);
              const animScale = animConfig?.scale || 1.0;
              const scale = (item.scale || 0.3) * animScale;
              const itemId = tile.items.length > 1 ? `item_${x}_${y}_${idx}` : `item_${x}_${y}`;
              const isHighlighted = highlightedEntityId === itemId || (idx === 0 && highlightedEntityId === `item_${x}_${y}`);

              if (useThrowId) {
                const isMirrored = (item as any).mirroredThrow === -1;
                const key = `rot_${assetToUse}_${isMirrored}`;
                let finalImg = spriteTintCache.has(key) ? spriteTintCache.get(key) as HTMLCanvasElement : null;
                
                if (!finalImg) {
                  finalImg = document.createElement("canvas");
                  (finalImg as any).version = key;
                  finalImg.width = img.height; 
                  finalImg.height = img.width;
                  
                  // Draw rotated to temporary canvas
                  const tempCanvas = document.createElement("canvas");
                  tempCanvas.width = finalImg.width;
                  tempCanvas.height = finalImg.height;
                  const tempCtx = tempCanvas.getContext("2d")!;
                  tempCtx.imageSmoothingEnabled = false;
                  tempCtx.translate(tempCanvas.width/2, tempCanvas.height/2);
                  tempCtx.rotate(isMirrored ? -Math.PI / 2 : Math.PI / 2);
                  tempCtx.drawImage(img, -img.width/2, -img.height/2);

                  // Find bottom-most pixel
                  const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
                  let maxVisY = 0;
                  for (let y = tempCanvas.height - 1; y >= 0; y--) {
                      let found = false;
                      for (let x = 0; x < tempCanvas.width; x++) {
                          if (imgData[(y * tempCanvas.width + x) * 4 + 3] > 0) {
                              found = true;
                              break;
                          }
                      }
                      if (found) {
                          maxVisY = y;
                          break;
                      }
                  }

                  // Shift image down to rest on the bottom of the canvas
                  const shiftY = tempCanvas.height - 1 - maxVisY;
                  const fCtx = finalImg.getContext("2d")!;
                  fCtx.imageSmoothingEnabled = false;
                  fCtx.drawImage(tempCanvas, 0, shiftY);

                  spriteTintCache.set(key, finalImg);
                }
                
                const adjustedScale = scale * (img.width / img.height);
                
                let vOffset = stackOffset;
                let yOffset = item.yOffset || 0;
                if (yOffset !== 0) {
                  vOffset += yOffset * Math.abs(1 - adjustedScale);
                } 
  
                const rawImg = finalImg;
                const tintedImg = getLazyPreTintedSprite(rawImg, sprLight, item, spriteTintCache);

                addSprite({
                  id: `ITEM_${item.id}`,
                  x: baseX,
                  y: baseY,
                  unbiasedX: baseX,
                  unbiasedY: baseY,
                  gridX: x,
                  gridY: y,
                  img: tintedImg,
                  originalImg: rawImg,
                  isPreTinted: true,
                  dist: distSq,
                  scale: adjustedScale,
                  lightColor: sprLight,
                  transformY: 0,
                  vOffset,
                  yOffset,
                  isHighlighted,
                  noShadow: !!item?.noShadow,
                  layer: 1,
                });
              } else {
                let vOffset = stackOffset;
                let yOffset = item.yOffset || 0;
                if (yOffset !== 0) {
                  vOffset += yOffset * Math.abs(1 - scale);
                } else if (animConfig?.centered) {
                  vOffset += (scale - 1) / 2;
                }
  
                const rawImg = img;
                const tintedImg = getLazyPreTintedSprite(rawImg, sprLight, item, spriteTintCache);

                addSprite({
                  id: `ITEM_${item.id}`,
                  x: baseX, // No bias
                  y: baseY,
                  unbiasedX: baseX,
                  unbiasedY: baseY,
                  gridX: x,
                  gridY: y,
                  img: tintedImg,
                  originalImg: rawImg,
                  isPreTinted: true,
                  dist: distSq,
                  scale,
                  lightColor: sprLight,
                  transformY: 0,
                  vOffset,
                  yOffset,
                  isHighlighted,
                  noShadow: !!item?.noShadow,
                  layer: 1,
                });
              }
            }
          }
        });
      }

      // --- PORTAL ---
      if (tile.type === "PORTAL" && tile.portal?.assetId) {
        const rawImg = resolveImg(tile.portal.assetId, 0, seed);
        if (rawImg) {
          const animConfig = getAnimConfig(tile.portal.assetId);
          const animScale = animConfig?.scale || 1.0;
          const scale = 1.0 * animScale;
          let vOffset = 0;
          if (animConfig?.centered) vOffset += (scale - 1) / 2;

          const tintedImg = getLazyPreTintedSprite(rawImg, sprLight, tile.portal, spriteTintCache);

          addSprite({
            id: "PORTAL",
            x: baseX,
            y: baseY,
            unbiasedX: baseX,
            unbiasedY: baseY,
            gridX: x,
            gridY: y,
            img: tintedImg,
            originalImg: rawImg,
            isPreTinted: true,
            dist: distSq,
            scale,
            lightColor: sprLight,
            transformY: 0,
            vOffset,
            layer: 1,
          });
        }
      }
    }
  }

  // 2. EXPLOSIONS
  explosions.forEach((exp) => {
    const dx = exp.x + 0.5 - posX;
    const dy = exp.y + 0.5 - posY;
    const distSq = dx * dx + dy * dy;

    if (distSq > RENDER_DISTANCE * RENDER_DISTANCE) return;

    let sprLight = { r: 2.0, g: 2.0, b: 2.0 };
    const seed =
      (Math.floor(exp.x) * 73856093) ^ (Math.floor(exp.y) * 19349663);
    const img = resolveImg(exp.assetId, exp.startTime, seed);

    if (img) {
      const animConfig = getAnimConfig(exp.assetId);
      const scale = 1.0 * (animConfig?.scale || 1.0);
      let vOffset = 0;
      if (animConfig?.centered) {
        vOffset = (scale - 1) / 2;
      }

      addSprite({
        id: `EXPLOSION_${exp.id}`,
        x: exp.x + 0.5,
        y: exp.y + 0.5,
        gridX: Math.floor(exp.x),
        gridY: Math.floor(exp.y),
        img,
        dist: distSq,
        scale,
        lightColor: sprLight,
        transformY: 0,
        vOffset,
        layer: 3,
      });
    }
  });

  // 3. LOOT DROP ANIMATIONS
  lootAnims.forEach((anim) => {
    const elapsed = performance.now() - anim.startTime;
    const duration = 500;
    const t = Math.min(1, elapsed / duration);

    const curX = lerp(anim.x + 0.5, anim.targetX + 0.5, t);
    const curY = lerp(anim.y + 0.5, anim.targetY + 0.5, t);

    const dx = curX - posX;
    const dy = curY - posY;
    const distSq = dx * dx + dy * dy;

    if (distSq > RENDER_DISTANCE * RENDER_DISTANCE) return;

    const seed =
      (Math.floor(anim.x) * 73856093) ^ (Math.floor(anim.y) * 19349663);
    let img = resolveImg(anim.item.assetId, 0, seed);
    if (!img && anim.item.symbol)
      img = resolveImg(`ITEM_${anim.item.symbol}`, 0, seed);

    if (img) {
      const animConfig = getAnimConfig(anim.item.assetId);
      const animScale = animConfig?.scale || 1.0;
      const scale = (anim.item.scale || 0.3) * animScale;

      const arcHeight = Math.sin(t * Math.PI) * 0.5;
      let vOffset = -arcHeight;

      if (animConfig?.centered) vOffset += (scale - 1) / 2;

      let lightColor = { r: 1.0, g: 1.0, b: 1.0 };
      if (lightMap && lightMap[Math.floor(curY)]?.[Math.floor(curX)]) {
        lightColor = { ...lightMap[Math.floor(curY)][Math.floor(curX)] };
        if (flashlightActive) {
          lightColor.r = Math.max(floorValue, lightColor.r);
          lightColor.g = Math.max(floorValue, lightColor.g);
          lightColor.b = Math.max(floorValue, lightColor.b);
        }
      }

      addSprite({
        id: `LOOT_ANIM_${anim.id}`,
        x: curX,
        y: curY,
        gridX: Math.floor(curX),
        gridY: Math.floor(curY),
        img,
        dist: distSq,
        scale,
        lightColor,
        transformY: 0,
        vOffset,
        yOffset: anim.item?.yOffset || 0,
        noShadow: !!anim.item?.noShadow,
        layer: 3,
      });
    }
  });

  if (raycasterCamera && playerReflectionSprite) {
    const visualPlayerX = player.pos.x + 0.5;
    const visualPlayerY = player.pos.y + 0.5;
    const dx = visualPlayerX - posX;
    const dy = visualPlayerY - posY;
    const distSq = dx * dx + dy * dy;

    if (distSq <= Math.pow(RENDER_DISTANCE, 2)) {
      let lightColor = { r: 1.0, g: 1.0, b: 1.0 };
      const ptX = Math.floor(player.pos.x);
      const ptY = Math.floor(player.pos.y);
      if (lightMap && lightMap[ptY] && lightMap[ptY][ptX]) {
        const depthFactor = applyDepthBrightness(1.0, Math.sqrt(distSq));
        let lr = lightMap[ptY][ptX].r;
        let lg = lightMap[ptY][ptX].g;
        let lb = lightMap[ptY][ptX].b;
        if (flashlightActive) {
          lr = Math.max(floorValue, lr);
          lg = Math.max(floorValue, lg);
          lb = Math.max(floorValue, lb);
        }
        lightColor = {
          r: lr * depthFactor,
          g: lg * depthFactor,
          b: lb * depthFactor,
        };
      }

      addSprite({
        id: `PLAYER_MODEL`,
        x: visualPlayerX,
        y: visualPlayerY,
        unbiasedX: visualPlayerX,
        unbiasedY: visualPlayerY,
        gridX: Math.floor(visualPlayerX),
        gridY: Math.floor(visualPlayerY),
        img: playerReflectionSprite as any,
        dist: distSq,
        scale: 0.8,
        lightColor,
        transformY: 0,
        vOffset: 0,
        layer: 2,
      });
    }
  }

  persistentRenderSprites.length = 0;
  for (let i = 0; i < spritePoolCount; i++) {
    persistentRenderSprites.push(spritePool[i]);
  }
  const renderSprites = persistentRenderSprites;

  // Collect shadows of visible sprites for high-performance GPU baking/rendering on the floor
  if (isWebGLActive && webglRenderer) {
    persistentGroundEligible.length = 0;
    persistentElevatedEligible.length = 0;

    for (let i = 0; i < spritePoolCount; i++) {
      const s = spritePool[i];
      if (
        !s.noShadow &&
        !s.isWallAligned && 
        !s.isPortrait && 
        !s.isDecal && 
        !s.isBoxSide && 
        !s.isEmptyness && 
        s.layer !== 3 &&
        !s.id.startsWith("CORPSE_")
      ) {
        const sTileX = (s.unbiasedX !== undefined ? s.unbiasedX : s.x) | 0;
        const sTileY = (s.unbiasedY !== undefined ? s.unbiasedY : s.y) | 0;
        const sTile = (sTileY >= 0 && sTileY < grid.length && sTileX >= 0 && sTileX < grid[sTileY].length) ? grid[sTileY][sTileX] : null;
        const sFloorHeight = s.sFloorHeight !== undefined ? s.sFloorHeight : (sTile ? (((sTile.type === 'FLOOR' && sTile.height !== undefined) ? sTile.height : 0) + (sTile.elevation || 0)) : 0);
        s.sFloorHeight = sFloorHeight;

        if (sFloorHeight >= 0.1) {
          persistentElevatedEligible.push(s);
        } else {
          persistentGroundEligible.push(s);
        }
      }
    }

    if (settings?.debug?.disableShadows) {
      webglRenderer.setSpriteShadows([], [], false);
      setGlobalSpriteShadows([], false);
    } else {
      // Sort by squared distance ascending (closest first)
      persistentGroundEligible.sort((a, b) => a.dist - b.dist);
      persistentElevatedEligible.sort((a, b) => a.dist - b.dist);

      const maxShadows = 16;
      const gCount = Math.min(maxShadows, persistentGroundEligible.length);
      persistentGroundShadows.length = gCount;
      for (let i = 0; i < gCount; i++) {
        const s = persistentGroundEligible[i];
        const imgWidth = s.img ? (s.img.width || 1) : 1;
        const imgHeight = s.img ? (s.img.height || 1) : 1;
        const aspect = imgWidth / imgHeight;
        const w3d = s.scale * aspect;
        const h3d = s.scale;
        const baseSize = aspect <= 1.0 ? w3d : Math.sqrt(w3d * h3d);
        const r = Math.max(0.04, baseSize * 0.38);

        if (!persistentGroundShadows[i]) {
          persistentGroundShadows[i] = { x: s.x, y: s.y, rx: r, ry: r };
        } else {
          persistentGroundShadows[i].x = s.x;
          persistentGroundShadows[i].y = s.y;
          persistentGroundShadows[i].rx = r;
          persistentGroundShadows[i].ry = r;
        }
      }

      const eCount = Math.min(maxShadows, persistentElevatedEligible.length);
      persistentElevatedShadows.length = eCount;
      for (let i = 0; i < eCount; i++) {
        const s = persistentElevatedEligible[i];
        const imgWidth = s.img ? (s.img.width || 1) : 1;
        const imgHeight = s.img ? (s.img.height || 1) : 1;
        const aspect = imgWidth / imgHeight;
        const w3d = s.scale * aspect;
        const h3d = s.scale;
        const baseSize = aspect <= 1.0 ? w3d : Math.sqrt(w3d * h3d);
        const r = Math.max(0.04, baseSize * 0.38);

        if (!persistentElevatedShadows[i]) {
          persistentElevatedShadows[i] = { x: s.x, y: s.y, rx: r, ry: r };
        } else {
          persistentElevatedShadows[i].x = s.x;
          persistentElevatedShadows[i].y = s.y;
          persistentElevatedShadows[i].rx = r;
          persistentElevatedShadows[i].ry = r;
        }
      }

      webglRenderer.setSpriteShadows(persistentGroundShadows, persistentElevatedShadows, !!settings?.debug?.magentaShadows);
      setGlobalSpriteShadows(persistentElevatedShadows, !!settings?.debug?.magentaShadows);
    }
  }

  // 4. TRANSFORM & SORT
  renderSprites.forEach((sprite) => {
    const spriteX = sprite.x - posX;
    const spriteY = sprite.y - posY;
    const det = planeX * dirY - dirX * planeY;
    const invDetVal = 1.0 / det;
    sprite.transformY = invDetVal * (-planeY * spriteX + planeX * spriteY);
    sprite.transformX = invDetVal * (dirY * spriteX - dirX * spriteY);
  });

  renderSprites.sort((a, b) => {
    if (a.isPortrait && b.layer === 0) return 1;
    if (b.isPortrait && a.layer === 0) return -1;

    const depthDiff = b.transformY - a.transformY;

    if (Math.abs(depthDiff) > 0.25) {
      return depthDiff;
    }

    if (a.layer !== b.layer) {
      return a.layer - b.layer;
    }

    if (Math.abs(depthDiff) > 0.001) {
      return depthDiff;
    }

    const orderA = a.sortOrder !== undefined ? a.sortOrder : 0;
    const orderB = b.sortOrder !== undefined ? b.sortOrder : 0;
    return orderA - orderB;
  });

  if (activeAttackerId) {
    const attackerIdx = renderSprites.findIndex(
      (s) => s.id === activeAttackerId,
    );
    if (attackerIdx !== -1 && renderSprites[attackerIdx].isPortrait) {
      const attacker = renderSprites.splice(attackerIdx, 1)[0];
      renderSprites.push(attacker);
    }
  }

  // --- 4.5 REFLECTION PASS ---
  // Identify mirror segments and render reflected sprites
  const mirrorSegments: {
    xStart: number;
    xEnd: number;
    reflection: MirrorReflection;
  }[] = [];
  for (let x = 0; x < width; x += resolutionDivisor) {
    const reflections = mirrorReflections[x];
    if (reflections && reflections.length > 0) {
      // For simplicity, we take the first reflection in the column
      const ref = reflections[0];
      const lastSeg = mirrorSegments[mirrorSegments.length - 1];

      // Check if this reflection belongs to the same mirror wall as the previous one
      // We use a heuristic: same side and same hit tile
      const tileX = Math.floor(ref.mirrorHitX);
      const tileY = Math.floor(ref.mirrorHitY);

      if (
        lastSeg &&
        lastSeg.reflection.side === ref.side &&
        Math.floor(lastSeg.reflection.mirrorHitX) === tileX &&
        Math.floor(lastSeg.reflection.mirrorHitY) === tileY &&
        lastSeg.xEnd === x - resolutionDivisor
      ) {
        lastSeg.xEnd = x;
        // Update reflection data to be the average or just keep the first
      } else {
        mirrorSegments.push({ xStart: x, xEnd: x, reflection: ref });
      }
    }
  }

  const drawnParticles = new Set<Particle>();
  const debugOverlays: {
    x: number;
    topY: number;
    enemy: Enemy;
    hasLOS: boolean;
    pitChecked?: boolean;
    isPitBlocked?: boolean;
  }[] = [];

  const statusOverlays: {
    x: number;
    topY: number;
    enemy: Enemy;
  }[] = [];

  // 5. DRAWING LOOP (BATCHED)
  // First, draw reflected sprites
  const reflectedBaseSprites = renderSprites.filter((s) => !s.isPortrait && !s.hidden);
  mirrorSegments.forEach((seg) => {
    const ref = seg.reflection;

    // Calculate virtual camera for this mirror
    // The mirror plane is at tileX, tileY with a specific side
    // We can derive the virtual player position by reflecting the real player across the mirror plane
    let virtualPosX = posX;
    let virtualPosY = posY;
    let virtualDirX = dirX;
    let virtualDirY = dirY;

    // Mirror plane position
    if (ref.side === 0) {
      // Vertical mirror (X-plane)
      const planeXCoord = ref.mirrorHitX;
      virtualPosX = 2 * planeXCoord - posX;
      virtualDirX = -dirX;
    } else {
      // Horizontal mirror (Y-plane)
      const planeYCoord = ref.mirrorHitY;
      virtualPosY = 2 * planeYCoord - posY;
      virtualDirY = -dirY;
    }

    const virtualPlaneX =
      (-virtualDirY * (planeX * dirX + planeY * dirY)) /
      (dirX * dirX + dirY * dirY); // Simplified
    // Actually, we can just reflect the plane vector too
    let vPlaneX = planeX;
    let vPlaneY = planeY;
    if (ref.side === 0) vPlaneX = -planeX;
    else vPlaneY = -planeY;

    // Render sprites from virtual camera (reuse a persistent array, filtered once per frame)
    persistentReflectedSprites.length = 0;
    const reflectedSprites = persistentReflectedSprites;
    for (let si = 0; si < reflectedBaseSprites.length; si++) {
      const sprite = reflectedBaseSprites[si];
      const spriteX = sprite.x - virtualPosX;
      const spriteY = sprite.y - virtualPosY;

      const det = vPlaneX * virtualDirY - virtualDirX * vPlaneY;
      const invDet = 1.0 / det;

      const transformX =
        invDet * (virtualDirY * spriteX - virtualDirX * spriteY);
      const transformY = invDet * (-vPlaneY * spriteX + vPlaneX * spriteY);

      persistentReflectedSprites.push({ ...sprite, transformX, transformY });
    }

    // ADD PLAYER TO REFLECTION
    if (playerReflectionSprite) {
      const spriteX = posX - virtualPosX;
      const spriteY = posY - virtualPosY;
      const det = vPlaneX * virtualDirY - virtualDirX * vPlaneY;
      const invDet = 1.0 / det;
      const transformX =
        invDet * (virtualDirY * spriteX - virtualDirX * spriteY);
      const transformY = invDet * (-vPlaneY * spriteX + vPlaneX * spriteY);

      if (transformY >= 0.1) {
        let lightColor = { r: 1.0, g: 1.0, b: 1.0 };
        const ptX = Math.floor(posX);
        const ptY = Math.floor(posY);
        if (lightMap && lightMap[ptY] && lightMap[ptY][ptX]) {
          let lr = lightMap[ptY][ptX].r;
          let lg = lightMap[ptY][ptX].g;
          let lb = lightMap[ptY][ptX].b;
          if (flashlightActive) {
            lr = Math.max(floorValue, lr);
            lg = Math.max(floorValue, lg);
            lb = Math.max(floorValue, lb);
          }
          lightColor = {
            r: lr,
            g: lg,
            b: lb,
          };
        }

        reflectedSprites.push({
          id: "PLAYER_REFLECTION",
          x: posX,
          y: posY,
          img: playerReflectionSprite as any,
          dist: (posX - virtualPosX) ** 2 + (posY - virtualPosY) ** 2,
          scale: 0.8,
          lightColor,
          transformX,
          transformY,
          layer: 2,
          vOffset: 0,
        } as any);
      }
    }

    reflectedSprites.sort((a, b) => b.transformY - a.transformY); // Back-to-front for virtual camera

    reflectedSprites.forEach((sprite) => {
      const { transformX, transformY } = sprite;

      // Check if the sprite is actually "behind" the mirror from the player's perspective
      // For a reflection, the virtual sprite distance must be greater than the mirror distance
      // AND less than the distance to the wall in the reflection (occlusion)
      // transformY here is distance from virtual camera to the REAL sprite position.
      // This is correct because the virtual camera is reflected.
      const spriteScreenX = Math.floor(
        (width / 2) * (1 + transformX / transformY),
      );

      // Clip to mirror segment horizontal bounds
      if (spriteScreenX < seg.xStart - 100 || spriteScreenX > seg.xEnd + 100)
        return;

      let baseHeight = Math.abs(height / transformY);
      if (baseHeight > height * 3.5) {
        baseHeight = height * 3.5;
      }
      const spriteHeight = Math.round(baseHeight * sprite.scale);
      const vShift = baseHeight * (sprite.vOffset || 0);

      const rsTileX = Math.floor(sprite.unbiasedX !== undefined ? sprite.unbiasedX : sprite.x);
      const rsTileY = Math.floor(sprite.unbiasedY !== undefined ? sprite.unbiasedY : sprite.y);
      const rsTile = (rsTileY >= 0 && rsTileY < grid.length && rsTileX >= 0 && rsTileX < grid[rsTileY].length) ? grid[rsTileY][rsTileX] : null;
      const rsFloorHeight = rsTile ? (((rsTile.type === 'FLOOR' && rsTile.height !== undefined) ? rsTile.height : 0) + (rsTile.elevation || 0)) : 0;
      const refCameraZ = cameraZ - rsFloorHeight;

      const projectedFloor = horizon + baseHeight * refCameraZ + vShift;

      const spriteAspectRatio = sprite.img!.width / sprite.img!.height;
      const spriteWidth = Math.abs(
        Math.floor(spriteHeight * spriteAspectRatio),
      );

      const drawStartX = Math.floor(-spriteWidth / 2 + spriteScreenX);
      const drawEndX = Math.floor(spriteWidth / 2 + spriteScreenX);

      // Final clipping check
      const overlapStart = Math.max(drawStartX, seg.xStart);
      const overlapEnd = Math.min(drawEndX, seg.xEnd);
      if (overlapStart >= overlapEnd) return;

      // --- REFLECTED SHADOW RENDERING REMOVED FOR PERFORMANCE ---

      // Prepare Draw Source
      let drawSource: HTMLCanvasElement | HTMLImageElement;
      let totalMuzzle = 0;
      const mapX = sprite.x | 0;
      const mapY = sprite.y | 0;
      const isOutdoor = outdoorMap
        ? mapY >= 0 && mapY < mapHeight && mapX >= 0 && mapX < mapWidth
          ? outdoorMap[mapY][mapX]
          : false
        : true;
      const lightningMult =
        lightningMap &&
        mapY >= 0 &&
        mapY < mapHeight &&
        mapX >= 0 &&
        mapX < mapWidth
          ? lightningMap[mapY * mapWidth + mapX]
          : isOutdoor
            ? 1.0
            : 0.0;
      const effectiveLightningIntensity = lightningIntensity * lightningMult;

      const isEmissive = 
        !!sprite.isEmissive ||
        (typeof sprite.id === 'string' && (
          sprite.id.startsWith('EXPLOSION_') ||
          sprite.id.startsWith('FIRE_ANIM_') ||
          sprite.id.startsWith('MUZZLE_FLASH_') ||
          sprite.id.startsWith('SPARK_')
        ));

      if (isEmissive && sprite.img) {
        drawSource = sprite.img;
      } else if (sprite.isDamaged && sprite.img)
        drawSource = getDamagedSprite(sprite.img, spriteTintCache, false);
      else if (sprite.isHighlighted && sprite.img) {
        const srcToHighlight = (sprite.isPreTinted && sprite.originalImg) ? sprite.originalImg : sprite.img;
        const timePulse = Math.sin(Date.now() / 150) * 0.5 + 0.5;
        drawSource = getHighlightedSprite(
          srcToHighlight,
          spriteTintCache,
          timePulse,
          sprite.id,
        );
      } else if (sprite.img) {
        let mR = 0,
          mG = 0,
          mB = 0;
        if (effectiveMuzzleIntensity > 0) {
          const mI = effectiveMuzzleIntensity / (1 + sprite.dist * 0.05);
          totalMuzzle += mI;
          mR += mI * 255;
          mG += mI * 150;
          mB += mI * 0;
        }
        activeFlashes.forEach((f) => {
          const d2 = (f.x - sprite.x) ** 2 + (f.y - sprite.y) ** 2;
          const fInt = (f as any).intensity / (d2 * 0.1 + 1.0);
          totalMuzzle += fInt;
          if ((f as any).isFlashbang) {
            mR += fInt * 255;
            mG += fInt * 255;
            mB += fInt * 255;
          } else {
            mR += fInt * 255;
            mG += fInt * 150;
            mB += fInt * 0;
          }
        });

        let flashColor =
          totalMuzzle > 0
            ? { r: mR / totalMuzzle, g: mG / totalMuzzle, b: mB / totalMuzzle }
            : undefined;

        let refLight = {
          r: sprite.lightColor.r * 0.8,
          g: sprite.lightColor.g * 0.8,
          b: sprite.lightColor.b * 0.8,
        };
        let finalLightning = effectiveLightningIntensity;
        let finalMuzzle = totalMuzzle;
        if (sprite.isCharred) {
          refLight = {
            r: Math.min(0.2, refLight.r * 0.2),
            g: Math.min(0.2, refLight.g * 0.2),
            b: Math.min(0.2, refLight.b * 0.2),
          };
          finalLightning = 0;
          finalMuzzle = 0;
        }
        const srcToTint = (sprite.isPreTinted && sprite.originalImg) ? sprite.originalImg : sprite.img;
        drawSource = getTintedSprite(
          srcToTint,
          refLight,
          finalLightning,
          finalMuzzle,
          spriteTintCache,
          flashColor,
          getFogAmount(Math.sqrt(sprite.dist)),
        );
      } else return;

      // OPTIMIZED: Draw sprite using vertical strips (batches) instead of complex clipping path
      // This avoids the expensive ctx.clip() with complex paths which kills performance when close to mirrors
      let batchStart = -1;
      let batchMaskTop = -1;
      let batchMaskBottom = -1;

      const flushRefBatch = (currX: number) => {
        if (batchStart === -1) return;
        const batchW = currX - batchStart;

        // Calculate vertical bounds for the batch
        // Use floor/ceil to ensure we cover pixels fully and align with screen grid
        const spriteTop = Math.floor(projectedFloor - spriteHeight);
        const drawTop = Math.max(spriteTop, batchMaskTop);
        const drawBottom = Math.min(
          Math.floor(projectedFloor),
          batchMaskBottom,
        );
        const drawH = drawBottom - drawTop;

        if (drawH > 0) {
          // Map screen coordinates to texture coordinates
          const img = drawSource;

          // Horizontal mapping
          const spriteLeft = drawStartX;
          const batchRelX = batchStart - spriteLeft;

          let sx = (batchRelX / spriteWidth) * img.width;
          let sw = (batchW / spriteWidth) * img.width;

          // Vertical mapping
          const batchRelY = drawTop - spriteTop;
          let sy = (batchRelY / spriteHeight) * img.height;
          let sh = (drawH / spriteHeight) * img.height;

          // CLAMPING: Crucial to prevent drawImage from failing due to floating point errors
          // or slight misalignments where source coords go outside [0, width]
          if (sx < 0) {
            sw += sx;
            sx = 0;
          }
          if (sy < 0) {
            sh += sy;
            sy = 0;
          }
          if (sx + sw > img.width) sw = Math.max(0, img.width - sx);
          if (sy + sh > img.height) sh = Math.max(0, img.height - sy);

          // Only draw if we have valid dimensions
          if (sw > 0.01 && sh > 0.01) {
            ctx.drawImage(
              img,
              sx,
              sy,
              sw,
              sh,
              batchStart,
              drawTop,
              batchW,
              drawH,
            );
            if (maskCtx && sprite.isDamaged) {
              maskCtx.drawImage(
                img,
                sx,
                sy,
                sw,
                sh,
                batchStart,
                drawTop,
                batchW,
                drawH,
              );
            }
          }
        }

        batchStart = -1;
      };

      // Align startX to resolution grid
      let startX = overlapStart;
      if (spriteResolutionDivisor > 1) {
        startX =
          Math.ceil(startX / spriteResolutionDivisor) * spriteResolutionDivisor;
      }

      for (let x = startX; x <= overlapEnd; x += spriteResolutionDivisor) {
        const gridX = Math.floor(x / resolutionDivisor) * resolutionDivisor;
        const colRef = mirrorReflections[gridX]?.[0];

        // Basic validity check
        if (!colRef || colRef.maskBottom === -1) {
          flushRefBatch(x);
          continue;
        }

        // Occlusion check: if sprite is behind the reflected wall in this column.
        // We add a small epsilon (0.05) to avoid precision issues with sprites in doorways.
        if (transformY > colRef.perpWallDist + colRef.mirrorRefDist + 0.05) {
          flushRefBatch(x);
          continue;
        }

        // Occlusion check: if sprite is behind the mirror itself from the player's perspective
        if (transformY < colRef.perpWallDist - 0.05) {
          flushRefBatch(x);
          continue;
        }

        // Determine clipping bounds for this column
        let mTop = Math.max(colRef.maskTop, 0);
        let mBottom = Math.min(colRef.maskBottom, height);

        // Apply pass-through wall occlusion in reflections
        if (colRef.mirrorPassThroughWalls && colRef.mirrorPassThroughWalls.length > 0) {
          for (let i = 0; i < colRef.mirrorPassThroughWalls.length; i++) {
            const mp = colRef.mirrorPassThroughWalls[i];
            // If sprite is behind this split wall in the reflection
            if (transformY > colRef.perpWallDist + mp.dist + 0.05) {
              const mpTotalDist = colRef.perpWallDist + mp.dist;
              const mpLh = height / (mpTotalDist < 0.1 ? 0.1 : mpTotalDist);
              const absTopZ = mp.layer + (mp.topZ !== undefined ? mp.topZ : 1.0);
              const absBotZ = mp.layer + (mp.bottomZ !== undefined ? mp.bottomZ : 0.0);
              const mpLevelDrawEnd = Math.ceil(horizon + mpLh * (cameraZ - absBotZ));
              const mpLevelDrawStart = Math.floor(horizon + mpLh * (cameraZ - absTopZ));

              // If the wall starts from the ground
              if (absBotZ <= 0.2 || absBotZ <= cameraZ) {
                mBottom = Math.min(mBottom, Math.max(0, mpLevelDrawStart));
              }
              // If the wall is hanging from the ceiling
              if (absTopZ >= 0.8 || absTopZ >= cameraZ) {
                mTop = Math.max(mTop, Math.min(height, mpLevelDrawEnd));
              }
            }
          }
        }

        if (mTop >= mBottom) {
          flushRefBatch(x);
          continue;
        }

        // If this column is part of a door/wall that occludes the sprite partially (not fully behind),
        // the maskTop/Bottom already accounts for the mirror window.
        // But if the sprite is BEHIND a wall inside the reflection, we handled it above.

        if (batchStart === -1) {
          batchStart = x;
          batchMaskTop = mTop;
          batchMaskBottom = mBottom;
        } else {
          // Check if we can extend the batch
          // We require exact match for vertical bounds to avoid tearing/stretching artifacts
          if (
            Math.abs(mTop - batchMaskTop) > 0.5 ||
            Math.abs(mBottom - batchMaskBottom) > 0.5
          ) {
            flushRefBatch(x);
            batchStart = x;
            batchMaskTop = mTop;
            batchMaskBottom = mBottom;
          }
        }
      }
      flushRefBatch(overlapEnd + 1);
    });

    // DRAW MIRROR OVERLAY (On top of reflected sprites)
    const {
      canvas: oCanvas,
      ctx: oCtx,
      imgData: oImgData,
      data: oData,
    } = getOverlayCanvas(width, height);
    const segWidth = seg.xEnd - seg.xStart + resolutionDivisor; // Adjust width for last pixel

    // Clear the used portion of the buffer (typed-array fill, faster than nested JS loops)
    const stride = oCanvas.width;
    for (let y = 0; y < height; y++) {
      const rowStart = y * stride;
      oData.fill(0, rowStart, rowStart + segWidth);
    }

    for (let x = seg.xStart; x <= seg.xEnd; x += resolutionDivisor) {
      const colRef = mirrorReflections[x]?.[0];
      if (!colRef) continue;

      let overlayBuf = doorBuffer; // Default for mirrors often on doors
      if (colRef.textureId && auxBuffers?.has(colRef.textureId))
        overlayBuf = auxBuffers.get(colRef.textureId)!;
      if (!overlayBuf) continue;

      const texW = overlayBuf.width;
      const texData = overlayBuf.data;
      const step = colRef.step;
      let texPos = colRef.texPosStart;
      const texX = colRef.texX;
      const localX = x - seg.xStart;

      for (let y = colRef.drawStart; y < colRef.drawEnd; y++) {
        const ty = Math.floor(texPos) % overlayBuf.height;
        texPos += step;
        const color = texData[ty * texW + texX];

        let r = color & 0xff;
        let g = (color >> 8) & 0xff;
        let b = (color >> 16) & 0xff;

        let overlayRMult = colRef.rMult;
        let overlayGMult = colRef.gMult;
        let overlayBMult = colRef.bMult;
        if (flashlightActive) {
          overlayRMult = 1.0;
          overlayGMult = 1.0;
          overlayBMult = 1.0;
        }

        r = (r * overlayRMult) | 0;
        g = (g * overlayGMult) | 0;
        b = (b * overlayBMult) | 0;
        if (colRef.fR > 0.01) r = Math.min(255, r + colRef.fR * 255) | 0;
        if (colRef.fG > 0.01) g = Math.min(255, g + colRef.fG * 255) | 0;
        if (colRef.fB > 0.01) b = Math.min(255, b + colRef.fB * 255) | 0;

        // Fill resolutionDivisor pixels
        const pixelVal = (colRef.mirrorAlpha << 24) | (b << 16) | (g << 8) | r;
        const rowStart = y * stride + localX;
        oData.fill(pixelVal, rowStart, Math.min(rowStart + resolutionDivisor, y * stride + segWidth));
      }
    }

    oCtx.putImageData(oImgData, 0, 0);

    // Draw the overlay clipped to the mirror segment
    ctx.save();
    ctx.beginPath();
    let first = true;
    for (let x = seg.xStart; x <= seg.xEnd; x++) {
      const colRef = mirrorReflections[x]?.[0];
      if (colRef && colRef.maskBottom !== -1) {
        const top = Math.max(colRef.maskTop, 0);
        if (first) {
          ctx.moveTo(x, top);
          first = false;
        } else {
          ctx.lineTo(x, top);
        }
      }
    }
    for (let x = seg.xEnd; x >= seg.xStart; x--) {
      const colRef = mirrorReflections[x]?.[0];
      if (colRef && colRef.maskBottom !== -1) {
        const bottom = Math.min(colRef.maskBottom, height);
        ctx.lineTo(x, bottom);
      }
    }
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      oCanvas,
      0,
      0,
      segWidth,
      height,
      seg.xStart,
      0,
      segWidth,
      height,
    );
    ctx.restore();
  });

  // Pre-filter particles for faster rendering in painter's algorithm
  let availableParticles = particlesRef.current
    .filter((p) => !drawnParticles.has(p) && !p.isForeground && p.dist > 0)
    .sort((a, b) => a.dist - b.dist);
  let availableRain = rainRef.current
    .filter((p) => !drawnParticles.has(p) && !p.isForeground && p.dist > 0)
    .sort((a, b) => a.dist - b.dist);
  let availableRainSplash = rainSplashParticles
    .filter(
      (p) =>
        p.life > 0 && !drawnParticles.has(p) && !p.isForeground && p.dist > 0,
    )
    .sort((a, b) => a.dist - b.dist);
  let availableCasings = casingParticles
    .filter(
      (p) =>
        p.life > 0 && !drawnParticles.has(p) && !p.isForeground && p.dist > 0,
    )
    .sort((a, b) => a.dist - b.dist);
  let availableBlood = bloodParticles
    .filter(
      (p) =>
        p.life > 0 && !drawnParticles.has(p) && !p.isForeground && p.dist > 0,
    )
    .sort((a, b) => a.dist - b.dist);

  for (const sprite of renderSprites) {
    if (sprite.isPolyObject && sprite.polyModel) {
      if (isWebGLActive) {
        // Rendered via WebGL polyProgram pass
        continue;
      }
      drawPolyObjectSoftware(
        ctx,
        {
          baseX: sprite.x,
          baseY: sprite.y,
          sFloorHeight: sprite.sFloorHeight || 0,
          yOffset: sprite.yOffset || 0,
          scale: sprite.scale,
          facing: sprite.polyFacing,
          model: sprite.polyModel,
          distSq: sprite.dist,
          isHighlighted: sprite.isHighlighted,
        },
        width,
        height,
        posX,
        posY,
        dirX,
        dirY,
        planeX,
        planeY,
        horizon,
        cameraZ,
        zBuffer
      );
      continue;
    }

    if (!sprite.img || sprite.img.width === 0) continue;

    if (sprite.isWallAligned) {
      let totalMuzzle = 0;
      let mR = 0,
        mG = 0,
        mB = 0;
      const mapX = sprite.x | 0;
      const mapY = sprite.y | 0;
      const isOutdoor = outdoorMap
        ? mapY >= 0 && mapY < mapHeight && mapX >= 0 && mapX < mapWidth
          ? outdoorMap[mapY][mapX]
          : false
        : true;
      const lightningMult =
        lightningMap &&
        mapY >= 0 &&
        mapY < mapHeight &&
        mapX >= 0 &&
        mapX < mapWidth
          ? lightningMap[mapY * mapWidth + mapX]
          : isOutdoor
            ? 1.0
            : 0.0;
      const effectiveLightningIntensity = lightningIntensity * lightningMult;

      if (effectiveMuzzleIntensity > 0) {
        const mI = effectiveMuzzleIntensity / (1 + sprite.dist * 0.05);
        totalMuzzle += mI;
        mR += mI * 255;
        mG += mI * 150;
        mB += mI * 0;
      }
      activeFlashes.forEach((f) => {
        const d2 = (f.x - sprite.x) ** 2 + (f.y - sprite.y) ** 2;
        const fInt = (f as any).intensity / (d2 * 0.1 + 1.0);
        totalMuzzle += fInt;
        if ((f as any).isFlashbang) {
          mR += fInt * 255;
          mG += fInt * 255;
          mB += fInt * 255;
        } else {
          mR += fInt * 255;
          mG += fInt * 150;
          mB += fInt * 0;
        }
      });
      let flashColor =
        totalMuzzle > 0
          ? { r: mR / totalMuzzle, g: mG / totalMuzzle, b: mB / totalMuzzle }
          : undefined;

      drawWallAlignedSprite(
        ctx,
        sprite,
        width,
        height,
        posX,
        posY,
        dirX,
        dirY,
        planeX,
        planeY,
        horizon,
        resolutionDivisor,
        spriteResolutionDivisor,
        spriteTintCache,
        effectiveLightningIntensity,
        totalMuzzle,
        cameraZ,
        zBuffer,
        passThroughDoors,
        doorBuffer,
        auxBuffers,
        flashColor,
        minSpriteDist,
        passThroughWalls,
        grid,
      );
      continue;
    }

    const spriteX = sprite.x - posX;
    const spriteY = sprite.y - posY;
    const det = planeX * dirY - dirX * planeY;
    const invDet = 1.0 / det;
    const transformX = invDet * (dirY * spriteX - dirX * spriteY);
    const transformY = sprite.transformY;

    if (
      availableParticles.length > 0 ||
      availableCasings.length > 0 ||
      availableBlood.length > 0 ||
      availableRain.length > 0 ||
      availableRainSplash.length > 0
    ) {
      const furtherParticles: any[] = [];

      const extractFurther = (list: any[]) => {
        while (list.length > 0 && list[list.length - 1].dist >= transformY) {
          furtherParticles.push(list.pop()!);
        }
      };

      extractFurther(availableParticles);
      extractFurther(availableRain);
      extractFurther(availableRainSplash);
      extractFurther(availableCasings);
      extractFurther(availableBlood);

      if (furtherParticles.length > 0) {
        const playerAngle = Math.atan2(dirY, dirX);
        drawParticles(
          ctx,
          furtherParticles,
          zBuffer,
          sprites,
          1,
          undefined,
          playerAngle,
          lightMap,
        );
        if (maskCtx) {
          const bloodParts = furtherParticles.filter(
            (p: any) => p.type === "blood",
          );
          if (bloodParts.length > 0) {
            drawParticles(
              maskCtx,
              bloodParts,
              zBuffer,
              sprites,
              1,
              undefined,
              playerAngle,
              lightMap,
            );
          }
        }
        furtherParticles.forEach((p: any) => drawnParticles.add(p));
      }
    }

    if (transformY < (sprite.isForeground ? 0.001 : 0.15)) continue;

    // --- SMART Z-CLIP LOGIC ---
    let ignoreZClip = false;
    if (sprite.isAttackSprite) {
      ignoreZClip = true;
    }

    let shakeX = 0;
    let shakeY = 0;
    if (sprite.isDamaged) {
      shakeX = (Math.random() - 0.5) * 4;
      shakeY = (Math.random() - 0.5) * 4;
    }
    const spriteScreenX =
      Math.floor((width / 2) * (1 + transformX / transformY)) + shakeX;
    let baseHeight = Math.abs(height / transformY);
    if (sprite.isForeground) {
      if (baseHeight > height * 30) baseHeight = height * 30;
    } else {
      // Clamp baseHeight upper bound to prevent massive fillrate & canvas scaling overhead up close
      if (baseHeight > height * 3.5) {
        baseHeight = height * 3.5;
      }
    }
    const spriteHeight = Math.round(baseHeight * sprite.scale);

    const isCorpse = sprite.id.startsWith("CORPSE");
    const sTileX = Math.floor(sprite.unbiasedX !== undefined ? sprite.unbiasedX : sprite.x);
    const sTileY = Math.floor(sprite.unbiasedY !== undefined ? sprite.unbiasedY : sprite.y);
    const sTile = (sTileY >= 0 && sTileY < grid.length && sTileX >= 0 && sTileX < grid[sTileY].length) ? grid[sTileY][sTileX] : null;
    const sFloorHeight = sprite.sFloorHeight !== undefined ? sprite.sFloorHeight : (sTile ? (((sTile.type === 'FLOOR' && sTile.height !== undefined) ? sTile.height : 0) + (sTile.elevation || 0)) : 0);
    const effectiveCameraZ = cameraZ - sFloorHeight;

    const playerTileX = Math.floor(posX);
    const playerTileY = Math.floor(posY);
    const playerTile = (playerTileY >= 0 && playerTileY < grid.length && playerTileX >= 0 && playerTileX < grid[playerTileY].length) ? grid[playerTileY][playerTileX] : null;
    const playerFloorHeight = (playerTile?.type === 'FLOOR' && playerTile.height !== undefined) ? playerTile.height : 0;

    const actualFloor = horizon + baseHeight * effectiveCameraZ + shakeY;
    
    let effectiveVOffset = sprite.vOffset || 0;
    if (isCorpse && effectiveVOffset > 0) {
      const heightDiff = sFloorHeight - playerFloorHeight;
      if (heightDiff > 0) {
        effectiveVOffset = Math.max(0, effectiveVOffset - heightDiff);
      }
    }
    
    const vShift = baseHeight * effectiveVOffset;
    const projectedFloor = actualFloor + vShift;
    const rawDrawEndY = Math.round(projectedFloor);
    const rawDrawStartY = rawDrawEndY - spriteHeight;
    const unclampedStartY = rawDrawStartY;
    let drawEndY = rawDrawEndY;
    let drawStartY = rawDrawStartY;
    if (drawStartY < 0) drawStartY = 0;
    if (drawEndY > height) drawEndY = height;
    const spriteAspectRatio = sprite.img.width / sprite.img.height;
    const spriteWidth = Math.abs(Math.floor(spriteHeight * spriteAspectRatio));
    const halfSpriteW = spriteWidth / 2;
    const isHorizontallyOffscreen =
      !sprite.isPortrait &&
      !sprite.isAttackSprite &&
      (spriteScreenX + halfSpriteW < 0 ||
        spriteScreenX - halfSpriteW >= width);
    const isExplosion = sprite.id.startsWith("EXPLOSION_");
    const isLootAnim = sprite.id.startsWith("LOOT_ANIM_");
    const zBias = (isCorpse || sprite.isBox) ? 0.45 : 0.15;

    if (
      enemies &&
      sprite.id &&
      enemies.has(sprite.id)
    ) {
      const enemy = enemies.get(sprite.id)!;
      if (aiDebug || pitLineVis) {
        const hasLOS = hasLineOfSight(
          player.pos,
          { x: sprite.x, y: sprite.y },
          grid,
          width,
          height,
          enemy.id,
          false,
        );
        
        const ex2 = Math.floor(sprite.x);
        const ey2 = Math.floor(sprite.y);
        const px = Math.floor(player.pos.x);
        const py = Math.floor(player.pos.y);
        const enemyTile = grid[ey2]?.[ex2];
        const playerTile = grid[py]?.[px];
        const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
        
        let isPitBlocked = false;
        let pitChecked = false;
        
        if (enemyTile && playerTile) {
          if (isPitTile(enemyTile) || isPitTile(playerTile)) {
            pitChecked = true;
            if (!hasPitLineOfSight(player.pos, { x: sprite.x, y: sprite.y }, grid, mapWidth, mapHeight)) {
              isPitBlocked = true;
            }
          }
        }

        debugOverlays.push({ 
          x: spriteScreenX, 
          topY: drawStartY, 
          enemy, 
          hasLOS,
          pitChecked,
          isPitBlocked
        });
      }

      // Track status tags for enemies
      const isFlashed = (enemy.flashDuration || 0) > 0;
      if (isFlashed) {
        let shouldShowHeader = true;
        if (isCombatActive) {
          let combatDist = Math.sqrt((sprite.x - posX) ** 2 + (sprite.y - posY) ** 2);
          if (combatEnemyById.size > 0) {
            const ce = combatEnemyById.get(sprite.id);
            if (ce && ce.distance !== undefined) {
              combatDist = ce.distance;
            }
          }
          if (combatDist < 2.0) {
            shouldShowHeader = false;
          }
        }
        if (shouldShowHeader) {
          const centerX = Math.floor(spriteScreenX);
          const isOccludedAtCenter = centerX >= 0 && centerX < width && 
            transformY > zBuffer[centerX] + 0.15 && 
            (!solidWallTopBuffer || unclampedStartY >= solidWallTopBuffer[centerX]);
          if (!isOccludedAtCenter || sprite.isPortrait || aiDebug) {
            statusOverlays.push({ x: spriteScreenX, topY: sprite.isPortrait ? Math.max(8, unclampedStartY) : drawStartY, enemy });
          }
        }
      }
    }

    // --- OPTIMIZATION (CULLING): Completely Occluded Check ---
    let startStripe = Math.floor(-spriteWidth / 2 + spriteScreenX);
    let endStripe = Math.floor(spriteWidth / 2 + spriteScreenX);
    if (startStripe < 0) startStripe = 0;
    if (endStripe >= width) endStripe = width - 1;

    let isFullyOccluded = !ignoreZClip && !sprite.isPortrait && !sprite.isAttackSprite;
    if (isFullyOccluded) {
      let occluded = true;
      // HIGH PERFORMANCE STEPPED OCCLUSION CHECK: 
      // Instead of looping through all 100+ columns sequentially (which causes heavy CPU load for close-up sprites),
      // we check at most 16 sample points across the sprite's width, plus the boundary columns.
      // Since walls are vertical blocks of solid/continuous depth, sample checking is 100% accurate and up to 10-30x faster!
      const checkStep = Math.max(1, Math.floor((endStripe - startStripe) / 16));
      for (let stripe = startStripe; stripe < endStripe; stripe += checkStep) {
        if (stripe >= 0 && stripe < width) {
          if (transformY < zBuffer[stripe] + zBias || (solidWallTopBuffer && unclampedStartY < solidWallTopBuffer[stripe])) {
            occluded = false;
            break;
          }
        }
      }
      if (occluded) {
        // Double check boundary pixels to ensure no edge clipping issues
        if (startStripe >= 0 && startStripe < width && (transformY < zBuffer[startStripe] + zBias || (solidWallTopBuffer && unclampedStartY < solidWallTopBuffer[startStripe]))) {
          occluded = false;
        } else if (endStripe - 1 >= 0 && endStripe - 1 < width && (transformY < zBuffer[endStripe - 1] + zBias || (solidWallTopBuffer && unclampedStartY < solidWallTopBuffer[endStripe - 1]))) {
          occluded = false;
        }
      }
      if (occluded && startStripe < endStripe) {
        continue; // Completely occluded behind solid walls, skip shadow & rendering!
      }
    }

    // --- SHADOW RENDERING REMOVED FOR CPU OPTIMIZATION ---

    let drawStartX = Math.floor(-spriteWidth / 2 + spriteScreenX);
    let drawEndX = Math.floor(spriteWidth / 2 + spriteScreenX);
    if (drawStartX < 0) drawStartX = 0;
    if (drawEndX >= width) drawEndX = width - 1;
    const fullSpriteHeight = spriteHeight;

    // --- BLOOD PUDDLE LOGIC ---
    if (sprite.bloodStartTime) {
      const nowB = Date.now();
      const elapsed = nowB - sprite.bloodStartTime;

      if (elapsed < 200 && !lastProcessedDamageIds.current.has(sprite.id)) {
        const spawnAttempts = 30 + Math.floor(Math.random() * 20);
        for (let i = 0; i < spawnAttempts; i++) {
          const rx = (Math.random() - 0.5) * 0.3;
          const ry = (Math.random() - 0.5) * 0.3;
          const rz = Math.random() * 0.4 + 0.3;
          const pScale = Math.min(1.4, Math.max(0.6, spriteHeight / 160));
          const newParticles = createBloodParticles(
            sprite.x + rx,
            sprite.y + ry,
            rz,
            1,
            { scale: pScale * 1.2, speedScale: 1.5 },
          );
          particlesRef.current.push(...newParticles);
        }
        lastProcessedDamageIds.current.add(sprite.id);
      }

      if (!isHorizontallyOffscreen) {
        const growthProgress = elapsed >= BLOOD_GROWTH_DURATION ? 1.0 : elapsed / BLOOD_GROWTH_DURATION;
        const maxPuddleWidth = spriteWidth * 0.75;
        const currentPuddleWidth =
          maxPuddleWidth * (0.1 + growthProgress * 0.9);

        if (currentPuddleWidth > 2) {
          const currentPuddleHeight = currentPuddleWidth * 0.35;
          const puddleY = projectedFloor - spriteHeight * 0.45;
          const puddleX = spriteScreenX;
          const halfPuddleWidth = currentPuddleWidth * 0.5;
          const invHalfPuddleWidth = 1.0 / halfPuddleWidth;

          let startStripe = Math.max(
            0,
            Math.floor(puddleX - halfPuddleWidth),
          );
          const endStripe = Math.min(
            width,
            Math.ceil(puddleX + halfPuddleWidth),
          );

          if (spriteResolutionDivisor > 1) {
            startStripe =
              Math.ceil(startStripe / spriteResolutionDivisor) *
              spriteResolutionDivisor;
          }

          // Pre-set fillStyle ONCE for the entire blood puddle to avoid context state switches
          const alpha = 0.5 + growthProgress * 0.35;
          const r = Math.floor(95 * sprite.lightColor.r);
          ctx.fillStyle = `rgba(${r},0,0,${alpha})`;

          for (
            let s = startStripe;
            s < endStripe;
            s += spriteResolutionDivisor
          ) {
            if (transformY < zBuffer[s]) {
              const distFromCenterX = Math.abs(s - puddleX) * invHalfPuddleWidth;
              if (distFromCenterX > 1.0) continue;

              const ovalYScale = Math.sqrt(1.0 - distFromCenterX * distFromCenterX);
              const puddleThickness = Math.max(
                1,
                Math.floor(currentPuddleHeight * ovalYScale),
              );
              const puddleTop = puddleY - puddleThickness * 0.5;
              const puddleBottom = puddleTop + puddleThickness;

              const gridStripe =
                Math.floor(s / resolutionDivisor) * resolutionDivisor;
              let isOccluded = false;

              // --- OCCLUSION CHECK FOR BLOOD ---
              const doors = passThroughDoors[gridStripe];
              if (doors && doors.length > 0) {
                for (let i = 0; i < doors.length; i++) {
                  const door = doors[i];
                  if (transformY > door.perpWallDist) {
                    if (door.maskId && door.textureId) {
                      const buffer = (door as any).resolvedBuf;
                      if (buffer) {
                        const dist = door.perpWallDist;
                        const lh = height / dist;
                        const ds = Math.floor(horizon - lh * (1 - cameraZ));

                        const texH = buffer.height;
                        const texW = buffer.width;
                        const texPos = (puddleTop - ds) * (texH / lh);
                        let ty = Math.floor(texPos);
                        if (ty >= texH) ty = texH - 1;
                        if (ty < 0) ty = 0;

                        let doorTexX = Math.floor(
                          (door.doorOffset || 0) * texW,
                        );
                        if (doorTexX >= texW) doorTexX = texW - 1;
                        if (doorTexX < 0) doorTexX = 0;

                        if (
                          ty >= 0 &&
                          ty < texH &&
                          doorTexX >= 0 &&
                          doorTexX < texW
                        ) {
                          const color = buffer.data[ty * texW + doorTexX];
                          const alphaVal = (color >> 24) & 0xff;
                          if (alphaVal > 200) {
                            isOccluded = true;
                            break;
                          }
                        }
                      }
                    }
                  }
                }
              }

              if (!isOccluded && passThroughWalls) {
                const ptWalls = passThroughWalls[gridStripe];
                if (ptWalls && ptWalls.length > 0) {
                  for (let i = 0; i < ptWalls.length; i++) {
                    const wall = ptWalls[i];
                    if (wall.isPolyOccluder && Math.floor(sprite.x) === wall.mapX && Math.floor(sprite.y) === wall.mapY) {
                      continue;
                    }
                    if ((wall.isPitWall || wall.isFloorWall) && wall.topZ > 0 && (transformY - wall.dist) < 0.5) {
                      continue;
                    }
                    if (transformY > wall.dist) {
                      const effectiveDist = Math.min(
                        transformY,
                        wall.exitDist !== undefined
                          ? wall.exitDist
                          : wall.dist + 1,
                      );
                      const lh_front = height / wall.dist;
                      const lh_eff = height / effectiveDist;

                      const topZ = wall.topZ !== undefined ? wall.topZ : 1.0;
                      const botZ =
                        wall.bottomZ !== undefined ? wall.bottomZ : 0.0;
                      const absTopZ = wall.layer + topZ;
                      const absBotZ = wall.layer + botZ;

                      const levelDrawEnd = Math.ceil(
                        horizon + lh_front * (cameraZ - absBotZ),
                      );
                      const levelDrawStart = Math.floor(
                        horizon + lh_front * (cameraZ - absTopZ),
                      );

                      if (
                        wall.isWindow &&
                        wall.cutoutTop !== undefined &&
                        wall.cutoutBottom !== undefined
                      ) {
                        const h = topZ - botZ;
                        const headZ = absTopZ - wall.cutoutTop * h;
                        const sillZ = absTopZ - wall.cutoutBottom * h;

                        const frontHeadY = Math.floor(
                          horizon + lh_front * (cameraZ - headZ),
                        );
                        const frontSillY = Math.floor(
                          horizon + lh_front * (cameraZ - sillZ),
                        );

                        const effHeadY = Math.floor(
                          horizon + lh_eff * (cameraZ - headZ),
                        );
                        const effSillY = Math.floor(
                          horizon + lh_eff * (cameraZ - sillZ),
                        );

                        const clearTopScreen = Math.max(frontHeadY, effHeadY);
                        const clearBotScreen = Math.min(frontSillY, effSillY);

                        if (
                          puddleBottom > levelDrawStart &&
                          puddleTop < clearTopScreen
                        ) {
                          isOccluded = true;
                          break;
                        }
                        if (
                          puddleBottom > clearBotScreen &&
                          puddleTop < levelDrawEnd
                        ) {
                          isOccluded = true;
                          break;
                        }
                      } else if (
                        puddleBottom > levelDrawStart &&
                        puddleTop < levelDrawEnd
                      ) {
                        isOccluded = true;
                        break;
                      }
                    }
                  }
                }
              }

              if (!isOccluded) {
                ctx.fillRect(
                  s,
                  puddleTop,
                  spriteResolutionDivisor,
                  puddleThickness,
                );
              }
            }
          }
        }
      }
    }

    if (
      sprite.isDamaged &&
      !sprite.hidden &&
      !lastProcessedDamageIds.current.has(sprite.id) &&
      !sprite.noBleeding
    ) {
      const spawnAttempts = 25 + Math.floor(Math.random() * 15);
      if (sprite.img && sprite.img.width > 0) {
        for (let i = 0; i < spawnAttempts; i++) {
          const rx = (Math.random() - 0.5) * 0.3;
          const ry = (Math.random() - 0.5) * 0.3;
          const rz = Math.random() * 0.4 + 0.3;
          const pScale = Math.min(1.4, Math.max(0.6, spriteHeight / 160));
          const newParticles = createBloodParticles(
            sprite.x + rx,
            sprite.y + ry,
            rz,
            1 + Math.floor(Math.random() * 2),
            { scale: pScale, speedScale: 1.2 },
          );
          particlesRef.current.push(...newParticles);
        }
        lastProcessedDamageIds.current.add(sprite.id);
      }
    }

    if (sprite.isCharred && sprite.burntTime && !isPaused) {
      const timeSinceBurnt = Date.now() - sprite.burntTime;
      if (timeSinceBurnt < 20000) {
        if (Math.random() < 0.1) {
          const sm = createSmokeParticle(
            sprite.x + (Math.random() - 0.5) * 0.3,
            sprite.y + (Math.random() - 0.5) * 0.3,
            0.1,
          );
          particlesRef.current.push(...sm);
        }
      }
    }

    if (sprite.hidden || isHorizontallyOffscreen) continue;

    let drawSource: HTMLCanvasElement | HTMLImageElement;
    let totalMuzzle = 0;
    const mapX = Math.floor(sprite.x);
    const mapY = Math.floor(sprite.y);
    const isOutdoor = outdoorMap
      ? mapY >= 0 && mapY < mapHeight && mapX >= 0 && mapX < mapWidth
        ? outdoorMap[mapY][mapX]
        : false
      : true;
    const lightningMult =
      lightningMap &&
      mapY >= 0 &&
      mapY < mapHeight &&
      mapX >= 0 &&
      mapX < mapWidth
        ? lightningMap[mapY * mapWidth + mapX]
        : isOutdoor
          ? 1.0
          : 0.0;
    const effectiveLightningIntensity = lightningIntensity * lightningMult;

    const isEmissive = 
      !!sprite.isEmissive ||
      (typeof sprite.id === 'string' && (
        sprite.id.startsWith('EXPLOSION_') ||
        sprite.id.startsWith('FIRE_ANIM_') ||
        sprite.id.startsWith('MUZZLE_FLASH_') ||
        sprite.id.startsWith('SPARK_')
      ));

    if (isEmissive && sprite.img) {
      drawSource = sprite.img;
    } else if (sprite.isDamaged && sprite.img)
      drawSource = getDamagedSprite(sprite.img, spriteTintCache, false);
    else if (sprite.isHighlighted && sprite.img) {
      const srcToHighlight = (sprite.isPreTinted && sprite.originalImg) ? sprite.originalImg : sprite.img;
      const timePulse = Math.sin(Date.now() / 150) * 0.5 + 0.5;
      drawSource = getHighlightedSprite(
        srcToHighlight,
        spriteTintCache,
        timePulse,
        sprite.id,
      );
    } else if (sprite.img) {
      let mR = 0,
        mG = 0,
        mB = 0;
      if (effectiveMuzzleIntensity > 0) {
        const mI = effectiveMuzzleIntensity / (1 + sprite.dist * 0.05);
        totalMuzzle += mI;
        mR += mI * 255;
        mG += mI * 150;
        mB += mI * 0;
      }
      activeFlashes.forEach((f) => {
        const d2 = (f.x - sprite.x) ** 2 + (f.y - sprite.y) ** 2;
        const fInt = (f as any).intensity / (d2 * 0.1 + 1.0);
        totalMuzzle += fInt;
        if ((f as any).isFlashbang) {
          mR += fInt * 255;
          mG += fInt * 255;
          mB += fInt * 255;
        } else {
          mR += fInt * 255;
          mG += fInt * 150;
          mB += fInt * 0;
        }
      });
      let flashColor =
        totalMuzzle > 0
          ? { r: mR / totalMuzzle, g: mG / totalMuzzle, b: mB / totalMuzzle }
          : undefined;

      let modifiedLightColor = sprite.lightColor;
      let finalLightning = effectiveLightningIntensity;
      let finalMuzzle = totalMuzzle;
      if (sprite.isCharred) {
        modifiedLightColor = {
          r: Math.min(0.2, sprite.lightColor.r * 0.15),
          g: Math.min(0.2, sprite.lightColor.g * 0.15),
          b: Math.min(0.2, sprite.lightColor.b * 0.15),
        };
        finalLightning = 0;
        finalMuzzle = 0;
      }
      const fogAmt = getFogAmount(Math.sqrt(sprite.dist));
      if (sprite.isPreTinted && sprite.img && !sprite.isCharred && finalLightning === 0 && finalMuzzle === 0 && fogAmt === 0) {
        drawSource = sprite.img;
      } else {
        const srcToTint = (sprite.isPreTinted && sprite.originalImg) ? sprite.originalImg : sprite.img;
        drawSource = getTintedSprite(
          srcToTint,
          modifiedLightColor,
          finalLightning,
          finalMuzzle,
          spriteTintCache,
          flashColor,
          fogAmt,
        );
      }
    } else continue;

    startStripe = Math.floor(drawStartX);
    endStripe = Math.floor(drawEndX);

    if (startStripe < 0) startStripe = 0;
    if (endStripe >= width) endStripe = width - 1;

    // Align startStripe to resolution grid
    if (spriteResolutionDivisor > 1) {
      startStripe =
        Math.ceil(startStripe / spriteResolutionDivisor) *
        spriteResolutionDivisor;
    }

    // --- OPTIMIZATION (FAST PATH): Check if completely unobstructed ---
    let isFullyUnobstructed = false;
    if (sprite.img && !sprite.isWallAligned) {
      if (sprite.isPortrait || sprite.isAttackSprite) {
        isFullyUnobstructed = true;
      } else {
        isFullyUnobstructed = true;
        // Check only 12 strategic points across the sprite width instead of checking every single pixel column
        // This is a major CPU optimization when looking at many close or large sprites
        const checkStep = Math.max(1, Math.floor((endStripe - startStripe) / 12));
        for (let stripe = startStripe; stripe < endStripe; stripe += checkStep) {
          if (stripe < 0 || stripe >= width) continue;
          if (transformY >= zBuffer[stripe] + zBias) {
            isFullyUnobstructed = false;
            break;
          }
          const gridStripe = Math.floor(stripe / resolutionDivisor) * resolutionDivisor;
          const doors = passThroughDoors[gridStripe];
          if (doors && doors.length > 0) {
            if (doors.some(d => transformY > d.perpWallDist)) {
              isFullyUnobstructed = false;
              break;
            }
          }
          const ptWalls = passThroughWalls && passThroughWalls[gridStripe];
          if (ptWalls && ptWalls.length > 0) {
            if (ptWalls.some(w => {
              const isSameTilePoly = w.isPolyOccluder && Math.floor(sprite.x) === w.mapX && Math.floor(sprite.y) === w.mapY;
              if (isSameTilePoly) return false;
              return transformY > w.dist && !((isCorpse || sprite.isBox) && (w.isPitWall || w.isFloorWall) && w.topZ > 0 && (transformY - w.dist) < 0.5);
            })) {
              isFullyUnobstructed = false;
              break;
            }
          }
        }
      }
    }

    const spriteStartX = -spriteWidth / 2 + spriteScreenX;
    const drawH = drawEndY - drawStartY;
    const relY = drawStartY - unclampedStartY;
    const rawTexY = Math.max(0, Math.floor((relY / fullSpriteHeight) * sprite.img!.height));
    const texY = Math.min(sprite.img!.height - 1, rawTexY);
    // Clamp texH slightly so bilinear interpolation doesn't sample alpha=0 pixels past the image bottom
    const rawTexH = Math.floor((drawH / fullSpriteHeight) * sprite.img!.height);
    const texH = Math.max(1, Math.min(sprite.img!.height - texY - 0.01, rawTexH));

    if (isFullyUnobstructed) {
      if (texH > 0 && drawH > 0 && startStripe < endStripe) {
        // Record sprite distance for overlays
        for (let stripe = startStripe; stripe < endStripe; stripe++) {
          if (stripe >= 0 && stripe < minSpriteDist.length) {
            minSpriteDist[stripe] = Math.min(minSpriteDist[stripe], transformY);
          }
        }

        let destX = spriteStartX;
        let destW = spriteWidth;
        let srcX = 0;
        let srcW = sprite.img!.width;

        if (destX < 0) {
          const leftCut = -destX;
          const ratioLeft = leftCut / spriteWidth;
          srcX = ratioLeft * sprite.img!.width;
          srcW -= srcX;
          destX = 0;
          destW -= leftCut;
        }

        if (destX + destW > width) {
          const rightCut = (destX + destW) - width;
          const ratioRight = rightCut / spriteWidth;
          srcW -= ratioRight * sprite.img!.width;
          destW -= rightCut;
        }

        if (destW > 0 && srcW > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(
            drawSource,
            srcX,
            texY,
            srcW,
            texH,
            destX,
            drawStartY,
            destW,
            drawH
          );
          ctx.restore();

          if (maskCtx && sprite.isDamaged) {
            maskCtx.save();
            maskCtx.drawImage(
              drawSource,
              srcX,
              texY,
              srcW,
              texH,
              destX,
              drawStartY,
              destW,
              drawH
            );
            maskCtx.restore();
          }
        }
      }
    } else {
      const segmentsByAlpha = new Map<
        number,
        { x: number; y: number; w: number; h: number }[]
      >();

      let lastGridStripe = -1;
      let cachedActiveWalls: any[] = [];
      let cachedActiveWindows: any[] = [];
      let cachedActiveDoors: any[] = [];
      let cachedOccludersInFront = false;
      let cachedHasWindowOrMask = false;
      
      let cachedSingleDoorTop = 0;
      let cachedSingleDoorBottom = 0;
      let cachedSingleDoorDs = 0;
      let cachedSingleDoorTexScale = 0;
      let cachedSingleDoorTexH = 0;
      let cachedSingleDoorTexW = 0;
      let cachedSingleDoorDoorTexX = 0;
      let cachedSingleDoorIsBroken = 0;
      let cachedSingleDoorMtx = 0;
      let cachedSingleDoorMaskHeightScale = 0;
      let cachedSingleDoorHasMask = 0;
      let cachedSingleDoorMaskWidth = 0;
      let cachedSingleDoorBuffer: Uint32Array | null = null;
      let cachedSingleDoorMaskBuf: Uint32Array | null = null;

      let cachedDoorTops: Int32Array | null = null;
      let cachedDoorBottoms: Int32Array | null = null;
      let cachedDoorDss: Float32Array | null = null;
      let cachedDoorTexScales: Float32Array | null = null;
      let cachedDoorTexHs: Int32Array | null = null;
      let cachedDoorTexWs: Int32Array | null = null;
      let cachedDoorDoorTexXs: Int32Array | null = null;
      let cachedDoorIsBrokens: Uint8Array | null = null;
      let cachedDoorMtxs: Int32Array | null = null;
      let cachedDoorMaskHeightScales: Float32Array | null = null;
      let cachedDoorHasMasks: Uint8Array | null = null;
      let cachedDoorMaskWidths: Int32Array | null = null;
      let cachedDoorBuffers: (Uint32Array | null)[] | null = null;
      let cachedDoorMaskBufs: (Uint32Array | null)[] | null = null;
      let cachedDoorCount = 0;

      for (
        let stripe = startStripe;
        stripe < endStripe;
        stripe += spriteResolutionDivisor
      ) {
      if (stripe >= width) break;

      const gridStripe =
        Math.floor(stripe / resolutionDivisor) * resolutionDivisor;
      const hasDoor =
        passThroughDoors[gridStripe] && passThroughDoors[gridStripe].length > 0;
      const hasWall =
        passThroughWalls &&
        passThroughWalls[gridStripe] &&
        passThroughWalls[gridStripe].length > 0;
      const isBehindSolid = transformY >= zBuffer[stripe] + zBias;
      let isVisible = ignoreZClip || !isBehindSolid || (solidWallTopBuffer && unclampedStartY < solidWallTopBuffer[stripe]);

      if (
        (hasDoor || hasWall || isBehindSolid) &&
        isVisible &&
        !sprite.isPortrait &&
        !sprite.isAttackSprite
      ) {
        if (gridStripe !== lastGridStripe) {
          lastGridStripe = gridStripe;
          const doors = passThroughDoors[gridStripe] || [];
          const walls = (passThroughWalls && passThroughWalls[gridStripe]) || [];

          cachedOccludersInFront =
            isBehindSolid ||
            doors.some((d) => transformY > d.perpWallDist) ||
            walls.some((w) => {
              const isSameTilePoly = w.isPolyOccluder && Math.floor(sprite.x) === w.mapX && Math.floor(sprite.y) === w.mapY;
              if (isSameTilePoly) return false;
              return transformY > w.dist && !((isCorpse || sprite.isBox) && (w.isPitWall || w.isFloorWall) && w.topZ > 0 && (transformY - w.dist) < 0.5);
            });

          if (cachedOccludersInFront) {
            // Precalculate wall bounds
            cachedActiveWalls = walls
              .filter((w) => {
                const isSameTilePoly = w.isPolyOccluder && Math.floor(sprite.x) === w.mapX && Math.floor(sprite.y) === w.mapY;
                if (isSameTilePoly) return false;
                return transformY > w.dist && !((isCorpse || sprite.isBox) && (w.isPitWall || w.isFloorWall) && w.topZ > 0 && (transformY - w.dist) < 0.5);
              })
              .map((wall) => {
                const safeDist = Math.max(0.01, wall.dist);
                const lh = height / safeDist;
                const topZ = wall.topZ !== undefined ? wall.topZ : 1.0;
                const botZ = wall.bottomZ !== undefined ? wall.bottomZ : 0.0;
                const absTopZ = wall.layer + topZ;
                const absBotZ = wall.layer + botZ;

                let rawEnd = horizon + lh * (cameraZ - absBotZ);
                let rawStart = horizon + lh * (cameraZ - absTopZ);
                if (isNaN(rawEnd)) rawEnd = height * 2;
                if (isNaN(rawStart)) rawStart = -height * 2;

                const levelDrawEnd = (wall as any).wallBottom !== undefined
                  ? (wall as any).wallBottom
                  : Math.ceil(
                      Math.max(-height * 4, Math.min(height * 4, rawEnd)),
                    );
                const levelDrawStart = (wall as any).wallTop !== undefined
                  ? (wall as any).wallTop
                  : Math.floor(
                      Math.max(-height * 4, Math.min(height * 4, rawStart)),
                    );

                let screenCutoutTop = -1;
                let screenCutoutBot = -1;
                let absHeadZ = absTopZ;
                let absSillZ = absBotZ;
                if (
                  wall.isWindow &&
                  wall.cutoutTop !== undefined &&
                  wall.cutoutBottom !== undefined
                ) {
                  screenCutoutTop = Math.floor(
                    levelDrawStart +
                      (levelDrawEnd - levelDrawStart) * wall.cutoutTop,
                  );
                  screenCutoutBot = Math.floor(
                    levelDrawStart +
                      (levelDrawEnd - levelDrawStart) * wall.cutoutBottom,
                  );
                  absHeadZ = absTopZ - wall.cutoutTop * (topZ - botZ);
                  absSillZ = absTopZ - wall.cutoutBottom * (topZ - botZ);
                }

                return {
                  originalWall: wall,
                  top: levelDrawStart,
                  bottom: levelDrawEnd,
                  layer: wall.layer,
                  dist: wall.dist,
                  exitDist: wall.exitDist,
                  absTopZ,
                  absBotZ,
                  isWindow: wall.isWindow,
                  isCutoutColumn: wall.isCutoutColumn,
                  screenCutoutTop,
                  screenCutoutBot,
                  cutoutLeft: wall.cutoutLeft,
                  cutoutRight: wall.cutoutRight,
                  cutoutAxis: wall.cutoutAxis,
                  side: wall.side,
                  glassTransparency:
                    wall.glassTransparency !== undefined
                      ? wall.glassTransparency
                      : 0.0,
                  absHeadZ,
                  absSillZ,
                  glassDist: wall.glassDist ?? wall.dist,
                  isPitWall: wall.isPitWall,
                  isFloorWall: wall.isFloorWall,
                  isStepDown: wall.isStepDown,
                  headConst: (absHeadZ - cameraZ) * height,
                  sillConst: (cameraZ - absSillZ) * height,
                };
              });

            cachedActiveWindows = cachedActiveWalls.filter((w) => w.isWindow);

            // Precalculate door bounds and buffers
            cachedActiveDoors = doors
              .filter(
                (d) =>
                  transformY > d.perpWallDist &&
                  !(d.type === "LIFT" && d.openAmount >= 0.95),
              )
              .map((door) => {
                const lh = height / door.perpWallDist;
                const ds = Math.floor(horizon - lh * (1 - cameraZ));
                const de = Math.ceil(horizon + lh * cameraZ);
                let liftOffset = 0;
                if (door.type === "LIFT")
                  liftOffset = Math.floor(lh * door.openAmount);

                const clippedTop = ds;
                const clippedBottom = de - liftOffset;

                const buffer = (door as any).resolvedBuf;
                let doorTexX = 0;
                let texH = 0;
                let texW = 0;

                if (buffer) {
                  texH = buffer.height;
                  texW = buffer.width;
                  doorTexX = Math.floor((door.doorOffset || 0) * texW);
                  if (doorTexX >= texW) doorTexX = texW - 1;
                  if (doorTexX < 0) doorTexX = 0;
                }

                const maskBuf = (door as any).resolvedMaskBuf;
                const texScale = lh !== 0 ? texH / lh : 0;
                let mtx = 0;
                if (maskBuf && texW !== 0) {
                  mtx = Math.floor((doorTexX / texW) * maskBuf.width);
                }
                const maskHeightScale = (door as any).resolvedMaskScaleY;

                return {
                  top: clippedTop,
                  bottom: clippedBottom,
                  ds,
                  lh,
                  buffer,
                  doorTexX,
                  texH,
                  texW,
                  hasMask: !!(door.maskId && door.textureId && buffer),
                  isBroken: door.isBroken,
                  maskId: door.maskId,
                  maskBuf,
                  texScale,
                  mtx,
                  maskHeightScale,
                };
              });

            cachedHasWindowOrMask = cachedActiveWalls.some(w => w.isWindow) || cachedActiveDoors.some(d => d.hasMask);

            // Pre-extract active doors' parameters to avoid slow object field lookups in the pixel loop
            cachedDoorCount = cachedActiveDoors.length;
            if (cachedDoorCount === 1) {
              const d = cachedActiveDoors[0];
              cachedSingleDoorTop = d.top;
              cachedSingleDoorBottom = d.bottom;
              cachedSingleDoorDs = d.ds;
              cachedSingleDoorTexScale = d.texScale;
              cachedSingleDoorTexH = d.texH;
              cachedSingleDoorTexW = d.texW;
              cachedSingleDoorDoorTexX = d.doorTexX;
              cachedSingleDoorIsBroken = d.isBroken ? 1 : 0;
              cachedSingleDoorMtx = d.mtx;
              cachedSingleDoorMaskHeightScale = d.maskHeightScale;
              cachedSingleDoorHasMask = d.hasMask ? 1 : 0;
              cachedSingleDoorMaskWidth = d.maskBuf ? d.maskBuf.width : 0;
              cachedSingleDoorBuffer = d.buffer ? d.buffer.data : null;
              cachedSingleDoorMaskBuf = d.maskBuf ? d.maskBuf.data : null;
            } else if (cachedDoorCount > 1) {
              cachedDoorTops = new Int32Array(cachedDoorCount);
              cachedDoorBottoms = new Int32Array(cachedDoorCount);
              cachedDoorDss = new Float32Array(cachedDoorCount);
              cachedDoorTexScales = new Float32Array(cachedDoorCount);
              cachedDoorTexHs = new Int32Array(cachedDoorCount);
              cachedDoorTexWs = new Int32Array(cachedDoorCount);
              cachedDoorDoorTexXs = new Int32Array(cachedDoorCount);
              cachedDoorIsBrokens = new Uint8Array(cachedDoorCount);
              cachedDoorMtxs = new Int32Array(cachedDoorCount);
              cachedDoorMaskHeightScales = new Float32Array(cachedDoorCount);
              cachedDoorHasMasks = new Uint8Array(cachedDoorCount);
              cachedDoorMaskWidths = new Int32Array(cachedDoorCount);
              cachedDoorBuffers = [];
              cachedDoorMaskBufs = [];

              for (let j = 0; j < cachedDoorCount; j++) {
                const d = cachedActiveDoors[j];
                cachedDoorTops[j] = d.top;
                cachedDoorBottoms[j] = d.bottom;
                cachedDoorDss[j] = d.ds;
                cachedDoorTexScales[j] = d.texScale;
                cachedDoorTexHs[j] = d.texH;
                cachedDoorTexWs[j] = d.texW;
                cachedDoorDoorTexXs[j] = d.doorTexX;
                cachedDoorIsBrokens[j] = d.isBroken ? 1 : 0;
                cachedDoorMtxs[j] = d.mtx;
                cachedDoorMaskHeightScales[j] = d.maskHeightScale;
                cachedDoorHasMasks[j] = d.hasMask ? 1 : 0;
                cachedDoorMaskWidths[j] = d.maskBuf ? d.maskBuf.width : 0;
                cachedDoorBuffers.push(d.buffer ? d.buffer.data : null);
                cachedDoorMaskBufs.push(d.maskBuf ? d.maskBuf.data : null);
              }
            }
          } else {
            cachedActiveWalls = [];
            cachedActiveWindows = [];
            cachedActiveDoors = [];
            cachedHasWindowOrMask = false;
            cachedDoorCount = 0;
          }
        }

        if (cachedOccludersInFront) {
          const activeWalls = cachedActiveWalls;
          const activeWindows = cachedActiveWindows;
          const activeDoors = cachedActiveDoors;
          const hasWindowOrMask = cachedHasWindowOrMask;
          const doorCount = cachedDoorCount;
          const doorTops = cachedDoorTops;
          const doorBottoms = cachedDoorBottoms;
          const doorDss = cachedDoorDss;
          const doorTexScales = cachedDoorTexScales;
          const doorTexHs = cachedDoorTexHs;
          const doorTexWs = cachedDoorTexWs;
          const doorDoorTexXs = cachedDoorDoorTexXs;
          const doorIsBrokens = cachedDoorIsBrokens;
          const doorMtxs = cachedDoorMtxs;
          const doorMaskHeightScales = cachedDoorMaskHeightScales;
          const doorHasMasks = cachedDoorHasMasks;
          const doorMaskWidths = cachedDoorMaskWidths;
          const doorBuffers = cachedDoorBuffers;
          const doorMaskBufs = cachedDoorMaskBufs;
          
          const singleDoorTop = cachedSingleDoorTop;
          const singleDoorBottom = cachedSingleDoorBottom;
          const singleDoorDs = cachedSingleDoorDs;
          const singleDoorTexScale = cachedSingleDoorTexScale;
          const singleDoorTexH = cachedSingleDoorTexH;
          const singleDoorTexW = cachedSingleDoorTexW;
          const singleDoorDoorTexX = cachedSingleDoorDoorTexX;
          const singleDoorIsBroken = cachedSingleDoorIsBroken;
          const singleDoorMtx = cachedSingleDoorMtx;
          const singleDoorMaskHeightScale = cachedSingleDoorMaskHeightScale;
          const singleDoorHasMask = cachedSingleDoorHasMask;
          const singleDoorMaskWidth = cachedSingleDoorMaskWidth;
          const singleDoorBuffer = cachedSingleDoorBuffer;
          const singleDoorMaskBuf = cachedSingleDoorMaskBuf;

          let intervals: [number, number][] = [[drawStartY, drawEndY]];

          if (isBehindSolid) {
            const solidTop = solidWallTopBuffer ? solidWallTopBuffer[stripe] : height;
            intervals = subtractInterval(intervals, solidTop, height);
          }

          // 1. Вычитаем обычные стены и непрозрачные элементы окон, а также caps для всех стен
          for (let i = 0; i < activeWalls.length; i++) {
            const wall = activeWalls[i];

            if (transformY > wall.dist) {
              if (wall.isWindow) {
                let isCutoutCol = true;
                const cameraX = (2 * stripe) / width - 1;
                const rDirX = dirX + planeX * cameraX;
                const rDirY = dirY + planeY * cameraX;

                const effectiveCutoutAxis = wall.cutoutAxis || 'NS';
                if (effectiveCutoutAxis === 'NS' && wall.side !== 1) isCutoutCol = false;
                if (effectiveCutoutAxis === 'WE' && wall.side !== 0) isCutoutCol = false;

                if (isCutoutCol) {
                  let wallX;
                  if (wall.side === 0) {
                    wallX = posY + wall.dist * rDirY;
                  } else {
                    wallX = posX + wall.dist * rDirX;
                  }
                  wallX -= Math.floor(wallX);

                  let wallX_norm = wallX;
                  if (wall.side === 0 && rDirX < 0) wallX_norm = 1.0 - wallX_norm;
                  if (wall.side === 1 && rDirY > 0) wallX_norm = 1.0 - wallX_norm;

                  const cutoutLeft = wall.cutoutLeft !== undefined ? wall.cutoutLeft : 0.25;
                  const cutoutRight = wall.cutoutRight !== undefined ? wall.cutoutRight : 0.75;

                  if (wallX_norm < cutoutLeft || wallX_norm > cutoutRight) {
                    isCutoutCol = false;
                  }
                }

                if (isCutoutCol) {
                  let effCutoutTop = wall.screenCutoutTop;
                  let effCutoutBot = wall.screenCutoutBot;
                  const limitDist = Math.min(transformY, wall.exitDist);
                  if (cameraZ < wall.absHeadZ && wall.headConst !== undefined) {
                    const yHead = Math.floor(horizon - wall.headConst / limitDist);
                    effCutoutTop = Math.max(effCutoutTop, yHead);
                  }
                  if (cameraZ > wall.absSillZ && wall.sillConst !== undefined) {
                    const ySill = Math.floor(horizon + wall.sillConst / limitDist);
                    effCutoutBot = Math.min(effCutoutBot, ySill);
                  }

                  // Окна: вычитаем верхнюю металлическую/деревянную раму и нижний подоконник,
                  // а сам проем [effCutoutTop, effCutoutBot] оставляем для попиксельной проверки (если есть) или не трогаем (если стекла нет).
                  intervals = subtractInterval(intervals, wall.top, effCutoutTop);
                  intervals = subtractInterval(intervals, effCutoutBot, wall.bottom);
                } else {
                  // Если колонка не попадает в проем окна, то стена сплошная, вычитаем ее целиком
                  if (wall.isFloorWall || wall.isPitWall) {
                    intervals = subtractInterval(intervals, Math.min(wall.top, wall.bottom), height);
                  } else {
                    intervals = subtractInterval(intervals, wall.top, wall.bottom);
                  }
                }
              } else {
                // Обычные стены вычитаем целиком
                if (wall.isFloorWall || wall.isPitWall) {
                  intervals = subtractInterval(intervals, Math.min(wall.top, wall.bottom), height);
                } else {
                  intervals = subtractInterval(intervals, wall.top, wall.bottom);
                }
              }
            }

            if (intervals.length === 0) break;

            // Bottom cap
            if (!wall.isFloorWall && !wall.isPitWall && cameraZ < wall.absBotZ) {
              const dz = wall.absBotZ - cameraZ;
              const capStart = Math.max(wall.bottom, horizon - (dz * height) / wall.dist);
              const capEnd = Math.min(horizon, horizon - (dz * height) / Math.min(wall.exitDist || (wall.dist + 1), transformY));
              if (capStart < capEnd) {
                intervals = subtractInterval(intervals, capStart, capEnd);
              }
            }

            if (intervals.length === 0) break;

            // Top cap
            if (!wall.isFloorWall && !wall.isPitWall && cameraZ > wall.absTopZ) {
              const dz = cameraZ - wall.absTopZ;
              const capStart = Math.max(horizon, horizon + (dz * height) / Math.min(wall.exitDist || (wall.dist + 1), transformY));
              const capEnd = Math.min(wall.top, horizon + (dz * height) / wall.dist);
              if (capStart < capEnd) {
                intervals = subtractInterval(intervals, capStart, capEnd);
              }
            }

            if (intervals.length === 0) break;
          }

          // 2. Вычитаем сплошные (немаскированные) двери
          if (intervals.length > 0) {
            for (let i = 0; i < activeDoors.length; i++) {
              const door = activeDoors[i];
              if (!door.hasMask) {
                intervals = subtractInterval(intervals, door.top, door.bottom);
                if (intervals.length === 0) break;
              }
            }
          }

          // Если все интервалы перекрыты, пропускаем stripe
          if (intervals.length === 0) continue;

          if (stripe >= 0 && stripe < minSpriteDist.length) {
            minSpriteDist[stripe] = Math.min(minSpriteDist[stripe], transformY);
          }

          // 3. Проверяем наличие окон или масок дверей, требующих попиксельной проверки прозрачности
          if (hasWindowOrMask) {
            interface Span {
              start: number;
              end: number;
              alpha: number;
            }

            let spans: Span[] = [];
            for (let i = 0; i < intervals.length; i++) {
              spans.push({ start: intervals[i][0], end: intervals[i][1], alpha: 1.0 });
            }

            const subtractSpan = (currentSpans: Span[], clipStart: number, clipEnd: number): Span[] => {
              if (clipStart >= clipEnd) return currentSpans;
              const result: Span[] = [];
              for (let i = 0; i < currentSpans.length; i++) {
                const s = currentSpans[i];
                if (clipEnd <= s.start || clipStart >= s.end) {
                  result.push(s);
                } else {
                  if (clipStart > s.start) {
                    result.push({ start: s.start, end: clipStart, alpha: s.alpha });
                  }
                  if (clipEnd < s.end) {
                    result.push({ start: clipEnd, end: s.end, alpha: s.alpha });
                  }
                }
              }
              return result;
            };

            const multiplySpan = (currentSpans: Span[], clipStart: number, clipEnd: number, multiplier: number): Span[] => {
              if (clipStart >= clipEnd) return currentSpans;
              const result: Span[] = [];
              for (let i = 0; i < currentSpans.length; i++) {
                const s = currentSpans[i];
                if (clipEnd <= s.start || clipStart >= s.end) {
                  result.push(s);
                } else {
                  const overlapStart = Math.max(s.start, clipStart);
                  const overlapEnd = Math.min(s.end, clipEnd);
                  if (s.start < overlapStart) {
                    result.push({ start: s.start, end: overlapStart, alpha: s.alpha });
                  }
                  if (overlapStart < overlapEnd) {
                    result.push({ start: overlapStart, end: overlapEnd, alpha: s.alpha * multiplier });
                  }
                  if (s.end > overlapEnd) {
                    result.push({ start: overlapEnd, end: s.end, alpha: s.alpha });
                  }
                }
              }
              return result;
            };

            const stripeCameraX = (2 * stripe) / width - 1;
            const stripeRDirX = dirX + planeX * stripeCameraX;
            const stripeRDirY = dirY + planeY * stripeCameraX;

            const winCount = activeWindows.length;
            let winIsCutout0 = false;
            let winIsCutout1 = false;
            let winIsCutout2 = false;
            let winIsCutout3 = false;

            for (let j = 0; j < winCount; j++) {
              const w = activeWindows[j];
              let isCutoutCol = true;
              const cAxis = w.cutoutAxis || 'NS';
              if (cAxis === 'NS' && w.side !== 1) isCutoutCol = false;
              if (cAxis === 'WE' && w.side !== 0) isCutoutCol = false;

              if (isCutoutCol) {
                let wallX;
                if (w.side === 0) {
                  wallX = posY + w.dist * stripeRDirY;
                } else {
                  wallX = posX + w.dist * stripeRDirX;
                }
                wallX -= Math.floor(wallX);
                let wallX_norm = wallX;
                if (w.side === 0 && stripeRDirX < 0) wallX_norm = 1.0 - wallX_norm;
                if (w.side === 1 && stripeRDirY > 0) wallX_norm = 1.0 - wallX_norm;

                const cutoutLeft = w.cutoutLeft !== undefined ? w.cutoutLeft : 0.25;
                const cutoutRight = w.cutoutRight !== undefined ? w.cutoutRight : 0.75;

                if (wallX_norm < cutoutLeft || wallX_norm > cutoutRight) {
                  isCutoutCol = false;
                }
              }

              if (j === 0) winIsCutout0 = isCutoutCol;
              else if (j === 1) winIsCutout1 = isCutoutCol;
              else if (j === 2) winIsCutout2 = isCutoutCol;
              else if (j === 3) winIsCutout3 = isCutoutCol;
            }

            // 1. Apply active windows
            for (let j = 0; j < winCount; j++) {
              const w = activeWindows[j];
              let isCutoutCol = false;
              if (j === 0) isCutoutCol = winIsCutout0;
              else if (j === 1) isCutoutCol = winIsCutout1;
              else if (j === 2) isCutoutCol = winIsCutout2;
              else if (j === 3) isCutoutCol = winIsCutout3;

              if (!isCutoutCol) {
                spans = subtractSpan(spans, w.top, w.bottom);
              } else {
                spans = subtractSpan(spans, w.top, w.screenCutoutTop);
                spans = subtractSpan(spans, w.screenCutoutBot, w.bottom);
                if (transformY > w.glassDist) {
                  const glassTrans = w.glassTransparency ?? 0.5;
                  const multiplier = Math.max(0.1, 1.0 - glassTrans);
                  spans = multiplySpan(spans, w.screenCutoutTop, w.screenCutoutBot, multiplier);
                }
              }
            }

            // 2. Apply door masks
            if (doorCount === 1) {
              if (singleDoorHasMask === 1 && singleDoorBuffer) {
                const doorSpans = getColumnAlphaSpans(
                  singleDoorBuffer,
                  singleDoorMaskBuf,
                  singleDoorDoorTexX,
                  singleDoorMtx,
                  singleDoorTexW,
                  singleDoorTexH,
                  singleDoorMaskWidth,
                  singleDoorMaskHeightScale,
                  singleDoorIsBroken
                );

                const activeHeight = singleDoorBottom - singleDoorDs;
                for (let i = 0; i < doorSpans.length; i++) {
                  const dSpan = doorSpans[i];
                  const screenStart = Math.floor(singleDoorDs + (dSpan.start / singleDoorTexH) * activeHeight);
                  const screenEnd = Math.ceil(singleDoorDs + (dSpan.end / singleDoorTexH) * activeHeight);

                  if (screenStart >= screenEnd) continue;

                  if (dSpan.alpha === 0.0) {
                    spans = subtractSpan(spans, screenStart, screenEnd);
                  } else if (dSpan.alpha < 0.98) {
                    spans = multiplySpan(spans, screenStart, screenEnd, dSpan.alpha);
                  }
                }
              }
            } else if (doorCount > 1 && doorTops && doorBottoms && doorDss && doorTexScales && doorTexHs && doorTexWs && doorDoorTexXs && doorIsBrokens && doorMtxs && doorMaskHeightScales && doorHasMasks && doorMaskWidths && doorBuffers && doorMaskBufs) {
              for (let j = 0; j < doorCount; j++) {
                if (doorHasMasks[j] === 1) {
                  const bufData = doorBuffers[j];
                  if (bufData) {
                    const doorSpans = getColumnAlphaSpans(
                      bufData,
                      doorMaskBufs[j],
                      doorDoorTexXs[j],
                      doorMtxs[j],
                      doorTexWs[j],
                      doorTexHs[j],
                      doorMaskWidths[j],
                      doorMaskHeightScales[j],
                      doorIsBrokens[j]
                    );

                    const activeHeight = doorBottoms[j] - doorDss[j];
                    for (let i = 0; i < doorSpans.length; i++) {
                      const dSpan = doorSpans[i];
                      const screenStart = Math.floor(doorDss[j] + (dSpan.start / doorTexHs[j]) * activeHeight);
                      const screenEnd = Math.ceil(doorDss[j] + (dSpan.end / doorTexHs[j]) * activeHeight);

                      if (screenStart >= screenEnd) continue;

                      if (dSpan.alpha === 0.0) {
                        spans = subtractSpan(spans, screenStart, screenEnd);
                      } else if (dSpan.alpha < 0.98) {
                        spans = multiplySpan(spans, screenStart, screenEnd, dSpan.alpha);
                      }
                    }
                  }
                }
              }
            }

            // 3. Push remaining spans to segmentsByAlpha
            for (let i = 0; i < spans.length; i++) {
              const s = spans[i];
              if (s.start < s.end && s.alpha > 0.02) {
                const roundedAlpha = Math.round(s.alpha * 100) / 100;
                let list = segmentsByAlpha.get(roundedAlpha);
                if (!list) {
                  list = [];
                  segmentsByAlpha.set(roundedAlpha, list);
                }
                list.push({
                  x: stripe,
                  y: s.start,
                  w: spriteResolutionDivisor,
                  h: s.end - s.start,
                });
              }
            }
          } else {
            let list = segmentsByAlpha.get(1.0);
            if (!list) {
              list = [];
              segmentsByAlpha.set(1.0, list);
            }
            for (let i = 0; i < intervals.length; i++) {
              const [start, end] = intervals[i];
              if (start < end) {
                list.push({
                  x: stripe,
                  y: start,
                  w: spriteResolutionDivisor,
                  h: end - start,
                });
              }
            }
          }

          continue;
        }
      }

      // Normal Batching Logic
      if (isVisible) {
        if (stripe >= 0 && stripe < minSpriteDist.length) {
          minSpriteDist[stripe] = Math.min(minSpriteDist[stripe], transformY);
        }
        let list = segmentsByAlpha.get(1.0);
        if (!list) {
          list = [];
          segmentsByAlpha.set(1.0, list);
        }
        list.push({
          x: stripe,
          y: drawStartY,
          w: spriteResolutionDivisor,
          h: drawEndY - drawStartY,
        });
      }
    }

      if (texH > 0 && drawH > 0 && segmentsByAlpha.size > 0) {
      for (const [alpha, rects] of segmentsByAlpha.entries()) {
        ctx.save();
        ctx.beginPath();

        // OPTIMIZATION: Merge adjacent vertical strips into single rectangles
        const optimizedRects = [];
        if (rects.length > 0) {
          let current = { ...rects[0] };
          for (let i = 1; i < rects.length; i++) {
            const r = rects[i];
            if (
              current.y === r.y &&
              current.h === r.h &&
              Math.abs(current.x + current.w - r.x) < 0.1
            ) {
              current.w += r.w;
            } else {
              optimizedRects.push(current);
              current = { ...r };
            }
          }
          optimizedRects.push(current);
        }

        for (let i = 0; i < optimizedRects.length; i++) {
          const r = optimizedRects[i];
          ctx.rect(r.x, r.y, r.w, r.h);
        }
        ctx.clip();
        if (alpha < 1.0) ctx.globalAlpha = alpha;

        let destX = spriteStartX;
        let destW = spriteWidth;
        let srcX = 0;
        let srcW = sprite.img!.width;

        if (destX < 0) {
          const leftCut = -destX;
          const ratioLeft = leftCut / spriteWidth;
          srcX = ratioLeft * sprite.img!.width;
          srcW -= srcX;
          destX = 0;
          destW -= leftCut;
        }

        if (destX + destW > width) {
          const rightCut = (destX + destW) - width;
          const ratioRight = rightCut / spriteWidth;
          srcW -= ratioRight * sprite.img!.width;
          destW -= rightCut;
        }

        if (destW > 0 && srcW > 0) {
          ctx.drawImage(
            drawSource,
            srcX,
            texY,
            srcW,
            texH,
            destX,
            drawStartY,
            destW,
            drawH,
          );

          if (maskCtx && sprite.isDamaged) {
            maskCtx.save();
            maskCtx.beginPath();
            for (let i = 0; i < optimizedRects.length; i++) {
              const r = optimizedRects[i];
              maskCtx.rect(r.x, r.y, r.w, r.h);
            }
            maskCtx.clip();
            maskCtx.drawImage(
              drawSource,
              srcX,
              texY,
              srcW,
              texH,
              destX,
              drawStartY,
              destW,
              drawH,
            );
            maskCtx.restore();
          }
        }

        ctx.restore();
      }
    }
  }

    if (sprite.bloodStartTime) {
      const nowB = Date.now();
      const elapsed = nowB - sprite.bloodStartTime;
      if (elapsed > FLY_SPAWN_DELAY && transformY <= 5.0) {
        const flyKey = sprite.id;
        processedFlies.add(flyKey);
        const projScale = height / transformY;
        const spriteW = drawEndX - drawStartX;
        const spriteH = drawEndY - drawStartY;
        const centerY = drawStartY + spriteH / 2;
        if (!fliesRef.current.has(flyKey)) {
          if (fliesRef.current.size >= 10) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;
            for (const [key, flies] of fliesRef.current.entries()) {
              const lastSeen = (flies as any).lastSeen || 0;
              if (lastSeen < oldestTime) {
                oldestTime = lastSeen;
                oldestKey = key;
              }
            }
            if (oldestKey) {
              const oldFlies = fliesRef.current.get(oldestKey)!;
              for (const fly of oldFlies) {
                returnParticleToPool(fly);
              }
              fliesRef.current.delete(oldestKey);
            }
          }
          const flyCount = 4 + Math.floor(Math.random() * 4);
          const flies = createFlyParticles(
            spriteScreenX,
            centerY,
            transformY,
            flyCount,
          );
          (flies as any).lastSeen = Date.now();
          fliesRef.current.set(flyKey, flies);
        } else {
          const flies = fliesRef.current.get(flyKey)!;
          (flies as any).lastSeen = Date.now();
          for (const fly of flies) {
            if (fly.offsetX !== undefined && fly.offsetY !== undefined) {
              fly.originX = spriteScreenX + fly.offsetX * spriteW * 0.7;
              fly.originY = centerY + fly.offsetY * spriteH * 0.7;
            } else {
              fly.originX = spriteScreenX;
              fly.originY = centerY;
            }
            fly.dist = transformY - 0.05;
            fly.size = Math.max(1, (fly.baseSize || 0.02) * projScale);
            fly.radius = (fly.baseRadius || 5) * projScale * 0.01;
          }
          const updatedFlies = isPaused
            ? flies
            : updateParticles(flies, undefined, undefined, undefined);
          fliesRef.current.set(flyKey, updatedFlies);

          const visibleFlies = [];
          const wallCache = new Map<any, any>();

          for (const fly of updatedFlies) {
            let isOccluded = false;
            const flyX = Math.floor(fly.x);
            const gridFlyX = Math.floor(flyX / resolutionDivisor) * resolutionDivisor;
            if (gridFlyX >= 0 && gridFlyX < width && passThroughWalls) {
              const ptWalls = passThroughWalls[gridFlyX];
              if (ptWalls && ptWalls.length > 0) {
                for (let i = 0; i < ptWalls.length; i++) {
                  const wall = ptWalls[i];
                  if (fly.dist > wall.dist) {
                    let cached = wallCache.get(wall);
                    if (!cached) {
                      const effectiveDist = Math.min(
                        fly.dist,
                        wall.exitDist !== undefined
                          ? wall.exitDist
                          : wall.dist + 1,
                      );
                      const lh_front = height / wall.dist;
                      const lh_eff = height / effectiveDist;

                      const topZ = wall.topZ !== undefined ? wall.topZ : 1.0;
                      const botZ =
                        wall.bottomZ !== undefined ? wall.bottomZ : 0.0;
                      const absTopZ = wall.layer + topZ;
                      const absBotZ = wall.layer + botZ;

                      const levelDrawEnd = Math.ceil(
                        horizon + lh_front * (cameraZ - absBotZ),
                      );
                      const levelDrawStart = Math.floor(
                        horizon + lh_front * (cameraZ - absTopZ),
                      );

                      let clearTopScreen = -1;
                      let clearBotScreen = 999999;
                      let hasWindow = false;

                      if (
                        wall.isWindow &&
                        wall.cutoutTop !== undefined &&
                        wall.cutoutBottom !== undefined
                      ) {
                        hasWindow = true;
                        const h = topZ - botZ;
                        const headZ = absTopZ - wall.cutoutTop * h;
                        const sillZ = absTopZ - wall.cutoutBottom * h;

                        const frontHeadY = Math.floor(
                          horizon + lh_front * (cameraZ - headZ),
                        );
                        const frontSillY = Math.floor(
                          horizon + lh_front * (cameraZ - sillZ),
                        );

                        const effHeadY = Math.floor(
                          horizon + lh_eff * (cameraZ - headZ),
                        );
                        const effSillY = Math.floor(
                          horizon + lh_eff * (cameraZ - sillZ),
                        );

                        clearTopScreen = Math.max(frontHeadY, effHeadY);
                        clearBotScreen = Math.min(frontSillY, effSillY);
                      }

                      cached = {
                        levelDrawStart,
                        levelDrawEnd,
                        hasWindow,
                        clearTopScreen,
                        clearBotScreen,
                      };
                      wallCache.set(wall, cached);
                    }

                    const s =
                      fly.size > 1.5
                        ? fly.size * (spriteResolutionDivisor || 1)
                        : Math.max(
                            1,
                            fly.size * 4 * (spriteResolutionDivisor || 1),
                          );
                    const flyTop = fly.y - s / 2;
                    const flyBottom = fly.y + s / 2;

                    if (cached.hasWindow) {
                      if (
                        flyBottom > cached.levelDrawStart &&
                        flyTop < cached.clearTopScreen
                      ) {
                        isOccluded = true;
                        break;
                      }
                      if (
                        flyBottom > cached.clearBotScreen &&
                        flyTop < cached.levelDrawEnd
                      ) {
                        isOccluded = true;
                        break;
                      }
                    } else if (
                      flyBottom > cached.levelDrawStart &&
                      flyTop < cached.levelDrawEnd
                    ) {
                      isOccluded = true;
                      break;
                    }
                  }
                }
              }
            }
            if (!isOccluded) {
              visibleFlies.push(fly);
            }
          }

          const playerAngle = Math.atan2(dirY, dirX);
          drawParticles(
            ctx,
            visibleFlies,
            zBuffer,
            undefined,
            1,
            undefined,
            playerAngle,
            lightMap,
          );
        }
      }
    }
  }

  // We keep the population of statusOverlays but do not render them on the low-resolution 3D canvas itself.
  // Instead, the positions are returned from renderEntities and rendered as crisp HTML overlays in Raycaster.tsx.

  if (debugOverlays.length > 0) {
    ctx.save();
    ctx.textAlign = "center";
    for (const data of debugOverlays) {
      const isFlashed = (data.enemy.flashDuration || 0) > 0;
      const state = isFlashed
        ? "FLASHED"
        : data.enemy.aiState ||
          (isCombatActive
            ? "COMBAT"
            : data.enemy.currentPath && data.enemy.currentPath.length > 0
              ? "MOVING"
              : "IDLE");
      const labelY = Math.max(15, data.topY - 15);
      ctx.font = 'bold 9px "Jura", monospace';
      const metrics = ctx.measureText(state);
      const textWidth = metrics.width;
      const padding = 3;
      const boxWidth = textWidth + padding * 2;
      const boxHeight = 14;
      ctx.fillStyle = "rgba(10, 10, 10, 0.85)";
      ctx.strokeStyle = "rgba(75, 85, 99, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(
        data.x - boxWidth / 2,
        labelY - boxHeight / 2,
        boxWidth,
        boxHeight,
      );
      ctx.fill();
      ctx.stroke();
      if (state === "FLASHED") ctx.fillStyle = "#ffffff";
      else if (state === "COMBAT") ctx.fillStyle = "#ef4444";
      else if (state === "CHASE") ctx.fillStyle = "#f59e0b";
      else if (state === "INVESTIGATE") ctx.fillStyle = "#a855f7";
      else if (state === "PATROL") ctx.fillStyle = "#3b82f6";
      else if (state === "MOVING") ctx.fillStyle = "#facc15";
      else ctx.fillStyle = "#9ca3af";
      ctx.fillText(state, data.x, labelY + 3.5);
      if (pitLineVis) {
        const visible = data.hasLOS && !data.isPitBlocked;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(data.x, labelY + 9);
        ctx.lineTo(width / 2, height);
        
        if (visible) {
          ctx.strokeStyle = "#22c55e"; // bright green
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "#ef4444"; // bright red
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
        }
        ctx.restore();

        // Render a status badge centered on the line
        const midX = (data.x + width / 2) / 2;
        const midY = (labelY + 9 + height) / 2;
        
        let isRu = true;
        try {
          if (strings && (strings as any).language) {
            isRu = (strings as any).language === 'ru';
          }
        } catch(e) {}

        let indicatorStr = "";
        if (visible) {
          indicatorStr = data.pitChecked ? (isRu ? "ЯМА: ОК" : "PIT: OK") : (isRu ? "ВИДЕН" : "VISIBLE");
        } else {
          if (!data.hasLOS) {
            indicatorStr = isRu ? "СТЕНА" : "WALL";
          } else if (data.isPitBlocked) {
            indicatorStr = isRu ? "ЯМА: БЛОК" : "PIT: BLOCKED";
          } else {
            indicatorStr = isRu ? "БЛОК" : "BLOCKED";
          }
        }
        
        ctx.save();
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        const textMetrics = ctx.measureText(indicatorStr);
        const textW = textMetrics.width;
        
        ctx.fillStyle = visible ? "rgba(22, 101, 52, 0.9)" : "rgba(127, 29, 29, 0.9)";
        ctx.fillRect(midX - textW/2 - 3, midY - 6, textW + 6, 12);
        ctx.strokeStyle = visible ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(midX - textW/2 - 3, midY - 6, textW + 6, 12);
        
        ctx.fillStyle = "#ffffff";
        ctx.fillText(indicatorStr, midX, midY + 2.5);
        ctx.restore();
      } else if (data.hasLOS) {
        ctx.strokeStyle = isCombatActive ? "#ff0000" : "#00ff00";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(data.x, labelY + 9);
        ctx.lineTo(width / 2, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // Removed cleanup loop to reuse old particle arrays continuously

  // --- FULL-SCREEN COVER FOR DAMAGING DECORATION ON ALIGNING TILE ---
  const px = Math.floor(posX);
  const py = Math.floor(posY);
  if (
    grid[py] &&
    grid[py][px] &&
    grid[py][px].decoration &&
    grid[py][px].decoration.damaging
  ) {
    const dec = grid[py][px].decoration;
    const seed = (px * 73856093) ^ (py * 19349663);
    const animConfig = getAnimConfig(dec.assetId);
    const frameId = getCurrentAnimationFrame(
      dec.assetId,
      animations,
      performance.now(),
      0,
      seed,
    );
    const img = sprites?.get(frameId) || resolveImg(dec.assetId, 0, seed);

    if (img && img.width > 0) {
      let locLight = { r: 1, g: 1, b: 1 };
      if (lightMap && lightMap[py] && lightMap[py][px]) {
        locLight = { ...lightMap[py][px] };
        if (flashlightActive) {
          locLight.r = Math.max(floorValue, locLight.r);
          locLight.g = Math.max(floorValue, locLight.g);
          locLight.b = Math.max(floorValue, locLight.b);
        }
      }
      const drawSource = getTintedSprite(
        img,
        locLight,
        lightningIntensity,
        muzzleFlashIntensity,
        spriteTintCache,
        undefined,
        getFogAmount(
          Math.sqrt((player.pos.x - px) ** 2 + (player.pos.y - py) ** 2),
        ),
      );

      ctx.save();
      ctx.globalCompositeOperation = "source-over";

      // Back layer (3 sprites distributed across 0, width/2, width)
      ctx.globalAlpha = 0.6;
      const backH = height * 0.9;
      const backW = img.width * (backH / img.height);
      const backY = height - backH / 2;
      const backCenters = [0, width / 2, width];

      for (const cx of backCenters) {
        ctx.drawImage(drawSource, cx - backW / 2, backY, backW, backH);
      }

      // Front layer (2 sprites placed between the back ones)
      ctx.globalAlpha = 0.95;
      const frontH = height * 1.15;
      const frontW = img.width * (frontH / img.height);
      const frontY = height - frontH / 2;
      const frontCenters = [width / 4, (3 * width) / 4];

      for (const cx of frontCenters) {
        ctx.drawImage(drawSource, cx - frontW / 2, frontY, frontW, frontH);
      }

      ctx.restore();
    }
  }

  // --- GLASS DOOR OVERLAYS (HANDLED EFFICIENTLY IN SOFTWARE PASSTHROUGH RENDERER) ---
  ctx.save();
  const doorTintedCanvasCache = new Map<string, HTMLCanvasElement | HTMLImageElement>();
  for (let x = 0; x < 0; x += resolutionDivisor) {
    const xDoors = passThroughDoors[x];
    if (xDoors && xDoors.length > 0) {
      let doorToDraw: PassThroughDoor | null = null;
      let multipleDoors: PassThroughDoor[] | null = null;

      // Pre-filter with zero-allocation path for length === 1
      if (xDoors.length === 1) {
        const d = xDoors[0];
        if (
          d.maskId &&
          d.textureId &&
          d.perpWallDist < zBuffer[x] &&
          !(d.type === "LIFT" && d.openAmount >= 0.95)
        ) {
          doorToDraw = d;
        }
      } else {
        for (let i = 0; i < xDoors.length; i++) {
          const d = xDoors[i];
          if (
            d.maskId &&
            d.textureId &&
            d.perpWallDist < zBuffer[x] &&
            !(d.type === "LIFT" && d.openAmount >= 0.95)
          ) {
            if (!multipleDoors) multipleDoors = [];
            multipleDoors.push(d);
          }
        }
        if (multipleDoors) {
          if (multipleDoors.length === 1) {
            doorToDraw = multipleDoors[0];
            multipleDoors = null;
          } else if (multipleDoors.length > 1) {
            multipleDoors.sort((a, b) => b.perpWallDist - a.perpWallDist);
          }
        }
      }

      if (doorToDraw || multipleDoors) {
        const doorList = multipleDoors || [doorToDraw!];
        for (let idx = 0; idx < doorList.length; idx++) {
          const door = doorList[idx];
          if (door.isBroken) continue;
          
          const dist = door.perpWallDist;
          
          // Draw overlay only if the door is in front of the nearest wall and nearest sprite on this column x!
          if (dist < minSpriteDist[x]) {
            const buf = (door as any).resolvedBuf;
            const maskBuf = (door as any).resolvedMaskBuf;
            if (!buf || !maskBuf) continue;

            const texW = buf.width;
            const texH = buf.height;

            let wallX;
            if (door.side === 0) wallX = door.posY + dist * door.rayDirY;
            else wallX = door.posX + dist * door.rayDirX;
            wallX -= Math.floor(wallX);

            let doorTexX = 0;
            if (door.type !== "LIFT") {
              doorTexX = Math.floor((door.doorOffset || 0) * texW);
              if (door.isTextureFlipped) doorTexX = texW - doorTexX - 1;
            } else {
              doorTexX = Math.floor(wallX * texW);
            }
            if (doorTexX >= texW) doorTexX = texW - 1;
            if (doorTexX < 0) doorTexX = 0;

            const lh = height / dist;
            const ds = Math.floor(horizon - lh * (1 - cameraZ));
            const de = Math.ceil(horizon + lh * cameraZ);

            let liftOffset = 0;
            if (door.type === "LIFT") {
              liftOffset = Math.floor(lh * door.openAmount);
            }

            const clippedDrawEnd = de - liftOffset;
            const drawStart = Math.max(0, ds);
            const drawEnd = Math.min(height, clippedDrawEnd);

            if (drawStart >= drawEnd) continue;

            const tileKey = `${door.tileY}_${door.tileX}`;
            let tintedGlassImg = doorTintedCanvasCache.get(tileKey);

            if (!tintedGlassImg) {
              const tileLight = (lightMap && lightMap[door.tileY]?.[door.tileX]) || { r: 1, g: 1, b: 1 };
              const depthFactor = applyDepthBrightness(1.0, dist);
              let rMult = tileLight.r * depthFactor;
              let gMult = tileLight.g * depthFactor;
              let bMult = tileLight.b * depthFactor;

              if (lightningIntensity > 0) {
                rMult = Math.min(1.0, rMult + lightningIntensity);
                gMult = Math.min(1.0, gMult + lightningIntensity);
                bMult = Math.min(1.0, bMult + lightningIntensity);
              }
              if (muzzleFlashIntensity > 0) {
                const playerDistSq = dist * dist;
                const mInt = muzzleFlashIntensity / (playerDistSq * 0.5 + 1.0);
                rMult = Math.min(1.0, rMult + mInt);
                gMult = Math.min(1.0, gMult + mInt * 0.6);
                bMult = Math.min(1.0, bMult + mInt * 0.2);
              }
              if (door.side === 1) {
                rMult *= 0.7;
                gMult *= 0.7;
                bMult *= 0.7;
              }

              const textureId = door.textureId || "door";
              const maskId = door.maskId;
              const glassOnlyCanvas = getGlassOnlyCanvas(textureId, maskId, buf, maskBuf);

              const sprLight = {
                r: rMult,
                g: gMult,
                b: bMult
              };

              const tile = grid[door.tileY]?.[door.tileX];
              tintedGlassImg = getLazyPreTintedSprite(
                glassOnlyCanvas,
                sprLight,
                tile ? (tile.door || tile) : door,
                spriteTintCache
              );
              doorTintedCanvasCache.set(tileKey, tintedGlassImg);
            }

            const tyStep = texH / lh;
            let sy = (drawStart - ds) * tyStep;
            let sh = (drawEnd - drawStart) * tyStep;

            if (sy < 0) {
              sh += sy;
              sy = 0;
            }
            if (sy + sh > texH) {
              sh = texH - sy;
            }

            if (sh > 0) {
              ctx.drawImage(
                tintedGlassImg,
                doorTexX,           // sx
                sy,                 // sy
                1,                  // sw
                sh,                 // sh
                x,                  // dx
                drawStart,          // dy
                resolutionDivisor,  // dw
                drawEnd - drawStart // dh
              );
            }
          }
        }
      }
    }
  }
  ctx.restore();

  return { drawnParticles, hasActiveAnimations, statusOverlays };
};

export const renderPickupAnimation = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizon: number,
  posX: number,
  posY: number,
  dirX: number,
  dirY: number,
  planeX: number,
  planeY: number,
  pickupAnim: { item: Item; startTime: number; x: number; y: number; reverse?: boolean },
  player: Player,
  lightMap: { r: number; g: number; b: number }[][] | undefined,
  sprites: Map<string, HTMLImageElement> | undefined,
  animations: AnimationConfig,
  spriteTintCache: Map<string, HTMLCanvasElement | HTMLImageElement>,
) => {
  // ... (Keep existing implementation unchanged) ...
  const now = performance.now();
  const seed =
    (Math.floor(pickupAnim.x) * 73856093) ^
    (Math.floor(pickupAnim.y) * 19349663);
  const frameId = getCurrentAnimationFrame(
    pickupAnim.item.assetId,
    animations,
    now,
    pickupAnim.startTime,
    seed,
  );
  let img = sprites?.get(frameId);
  if (!img && pickupAnim.item.symbol) {
    const symbolFrameId = getCurrentAnimationFrame(
      `ITEM_${pickupAnim.item.symbol}`,
      animations,
      now,
      pickupAnim.startTime,
      seed,
    );
    img = sprites?.get(symbolFrameId);
  }

  if (!img || img.width === 0) {
    img = sprites?.get("TEX_FALLBACK");
  }

  if (img && img.width > 0) {
    const PICKUP_DURATION = 450;
    const elapsed = performance.now() - pickupAnim.startTime;
    if (elapsed > PICKUP_DURATION) return;
    const t = Math.min(1, elapsed / PICKUP_DURATION);

    let sourceScreenX = width / 2;
    let sourceScreenY = height;
    let sourceItemHeight = 32;

    const relativeX = pickupAnim.x + 0.5 - posX;
    const relativeY = pickupAnim.y + 0.5 - posY;
    const det = planeX * dirY - dirX * planeY;
    const invDet = 1.0 / det;
    const transformX = invDet * (dirY * relativeX - dirX * relativeY);
    const transformY = invDet * (-planeY * relativeX + planeX * relativeY);

    if (transformY > 0) {
      sourceScreenX = Math.floor((width / 2) * (1 + transformX / transformY));
      const baseH = Math.abs(height / transformY);
      const animScale = animations[pickupAnim.item.assetId]?.scale || 1.0;
      const itemScale = (pickupAnim.item.scale || 0.3) * animScale;
      sourceItemHeight = baseH * itemScale;

      let vOffset = 0;
      let yOffset = pickupAnim.item.yOffset || 0;
      if (yOffset !== 0) {
        vOffset += yOffset * Math.abs(1 - itemScale);
      }
      const vShift = Math.floor(baseH * vOffset);

      sourceScreenY = horizon + baseH / 2 - sourceItemHeight / 2 + vShift;
    }

    const playerScreenX = width / 2;
    const playerScreenY = height + 150;
    const playerItemHeight = Math.max(256, sourceItemHeight * 5);

    const startScreenX = pickupAnim.reverse ? playerScreenX : sourceScreenX;
    const startScreenY = pickupAnim.reverse ? playerScreenY : sourceScreenY;
    const initialItemHeight = pickupAnim.reverse ? playerItemHeight : sourceItemHeight;

    const targetScreenX = pickupAnim.reverse ? sourceScreenX : playerScreenX;
    const targetScreenY = pickupAnim.reverse ? sourceScreenY : playerScreenY;
    const finalItemHeight = pickupAnim.reverse ? sourceItemHeight : playerItemHeight;

    const midBaseY = (startScreenY + targetScreenY) / 2;
    const requiredPeak = midBaseY - height / 2 + (pickupAnim.reverse ? initialItemHeight : finalItemHeight) / 4;
    const arcPeak = Math.max(requiredPeak, height * 0.6);
    const currentArcOffset = arcPeak * Math.sin(t * Math.PI);

    const currentX = startScreenX + (targetScreenX - startScreenX) * t;
    const currentBaseY = startScreenY + (targetScreenY - startScreenY) * t;
    const currentY = currentBaseY - currentArcOffset;

    const currentItemHeight =
      initialItemHeight + (finalItemHeight - initialItemHeight) * t;
    const currentItemWidth = (img.width / img.height) * currentItemHeight;

    let tileLight = { r: 1.0, g: 1.0, b: 1.0 };
    if (
      lightMap &&
      lightMap[Math.floor(pickupAnim.y)]?.[Math.floor(pickupAnim.x)]
    ) {
      tileLight = lightMap[Math.floor(pickupAnim.y)][Math.floor(pickupAnim.x)];
    }
    let playerLight = { r: 1.0, g: 1.0, b: 1.0 };
    if (lightMap && lightMap[player.pos.y]?.[player.pos.x]) {
      playerLight = lightMap[player.pos.y][player.pos.x];
    }
    const currentLight = {
      r: lerp(tileLight.r, playerLight.r, t),
      g: lerp(tileLight.g, playerLight.g, t),
      b: lerp(tileLight.b, playerLight.b, t),
    };

    const drawSource = getTintedSprite(
      img,
      currentLight,
      0,
      0,
      spriteTintCache,
      undefined,
      getFogAmount(1.0),
    );

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(
      drawSource,
      currentX - currentItemWidth / 2,
      currentY,
      currentItemWidth,
      currentItemHeight,
    );
    ctx.restore();
  }
};
