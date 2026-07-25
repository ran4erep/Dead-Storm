import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Tile,
  LevelDefinition,
  GameStrings,
  EnemyDefinition,
  NPCDefinition,
  DecorationDefinition,
  Enemy,
} from "../types";
import { getLevelDataByPath } from "../services/dataService";
import { createPlayer } from "../utils/playerLogic";
import playerData from "../data/player.json";
import { parseLevelData, calculateLightMap } from "../utils/levelLogic";
import {
  extractRequiredAssets,
  loadSmartAssets,
} from "../utils/assetExtraction";
import { useDoorSystem } from "./useDoorSystem";
import {
  blitSplat,
  getCachedSplat,
  initBloodSplats,
} from "../utils/decalLogic";
import { Particle } from "../utils/particleSystem";
import {
  createBufferFromImage,
  RaycasterBuffer,
  cloneBuffer,
} from "../components/raycaster/RaycasterUtils";
import { clearRaycastCache } from "../components/raycaster/RaycastCore";

const getLightingHashAndCheckAnimating = (grid: Tile[][]) => {
  if (!grid) return { hash: 0, hasAnimatingDoor: false };
  const height = grid.length;
  const width = grid[0]?.length || 0;
  let hash = 2166136261;
  let hasAnimatingDoor = false;

  for (let y = 0; y < height; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      const tile = row[x];
      if (!tile) continue;
      if (tile.type === "DOOR" && tile.door) {
        const state = tile.door.state;
        if (state === "OPENING" || state === "CLOSING") {
          hasAnimatingDoor = true;
        }
        let stateVal = 0;
        if (state === "OPENING") stateVal = 1;
        else if (state === "OPEN") stateVal = 2;
        else if (state === "CLOSING") stateVal = 3;
        const brokenVal = tile.door.broken ? 1 : 0;
        const val = (x << 16) ^ (y << 8) ^ (stateVal << 4) ^ brokenVal ^ 0x12345678;
        hash ^= val;
        hash = Math.imul(hash, 16777619);
      } else if (tile.isWindow) {
        const brokenVal = tile.isGlassBroken ? 1 : 0;
        const val = (x << 16) ^ (y << 8) ^ brokenVal ^ 0x87654321;
        hash ^= val;
        hash = Math.imul(hash, 16777619);
      } else if (tile.light) {
        const l = tile.light;
        const val = (x << 16) ^ (y << 8) ^ ((l.r * 255) | 0) ^ (((l.g * 255) | 0) << 8) ^ (((l.b * 255) | 0) << 16) ^ (((l.intensity || 1) * 100) | 0);
        hash ^= val;
        hash = Math.imul(hash, 16777619);
      } else if (tile.decoration?.light) {
        const dl = tile.decoration.light;
        const val = (x << 16) ^ (y << 8) ^ ((dl.r * 255) | 0) ^ (((dl.g * 255) | 0) << 8) ^ (((dl.b * 255) | 0) << 16);
        hash ^= val;
        hash = Math.imul(hash, 16777619);
      }
    }
  }
  return { hash, hasAnimatingDoor };
};

const getLightingHash = (grid: Tile[][]) => {
  return getLightingHashAndCheckAnimating(grid).hash;
};

const baseTextureBuffersCache = new Map<
  HTMLImageElement | HTMLCanvasElement,
  RaycasterBuffer
>();

function getBaseTextureBuffer(
  img: HTMLImageElement | HTMLCanvasElement,
): RaycasterBuffer | null {
  if (!img || img.width === 0 || img.height === 0) return null;
  let buf = baseTextureBuffersCache.get(img);
  if (!buf) {
    const cvs = document.createElement("canvas");
    cvs.width = img.width;
    cvs.height = img.height;
    const ctx = cvs.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cvs.width, cvs.height);
    buf = {
      data: new Uint32Array(data.data.buffer),
      width: cvs.width,
      height: cvs.height,
    };
    baseTextureBuffersCache.set(img, buf);
  }
  return buf;
}

const maskedTextureCache = new Map<string, RaycasterBuffer>();

if (typeof window !== "undefined") {
  (window as any).initializeLevelCaches = (grid: any[][]) => {
    const enemyCache = new Map<string, { x: number; y: number }>();
    const explosiveCache = new Set<string>();
    const timedCache = new Set<string>();

    if (grid) {
      const height = grid.length;
      for (let y = 0; y < height; y++) {
        const row = grid[y];
        if (!row) continue;
        const width = row.length;
        for (let x = 0; x < width; x++) {
          const cell = row[x];
          if (!cell) continue;
          if (cell.enemyId) {
            enemyCache.set(cell.enemyId, { x, y });
          }
          if (cell.npc?.id) {
            enemyCache.set(cell.npc.id, { x, y });
          }
          if (cell.explosive) {
            explosiveCache.add(`${x},${y}`);
            timedCache.add(`${x},${y}`);
          }
          if (
            (cell.items && cell.items.length > 0) ||
            (cell.decoration && cell.decoration.lifeTime !== undefined)
          ) {
            timedCache.add(`${x},${y}`);
          }
        }
      }
    }

    (window as any).enemyPositionsCache = enemyCache;
    (window as any).explosivePositionsCache = explosiveCache;
    (window as any).timedEffectsCache = timedCache;
  };

  (window as any).registerExplosive = (x: number, y: number) => {
    if (!(window as any).explosivePositionsCache) {
      (window as any).explosivePositionsCache = new Set<string>();
    }
    if (!(window as any).timedEffectsCache) {
      (window as any).timedEffectsCache = new Set<string>();
    }
    (window as any).explosivePositionsCache.add(`${x},${y}`);
    (window as any).timedEffectsCache.add(`${x},${y}`);
  };

  (window as any).registerTimedEffect = (x: number, y: number) => {
    if (!(window as any).timedEffectsCache) {
      (window as any).timedEffectsCache = new Set<string>();
    }
    (window as any).timedEffectsCache.add(`${x},${y}`);
  };
}

export const useLevelSystem = (
  strings: GameStrings | null,
  masterSpriteMapRef: React.MutableRefObject<Map<string, HTMLImageElement>>,
  setSpriteMap: React.Dispatch<
    React.SetStateAction<Map<string, HTMLImageElement>>
  >,
  setEnemies: (enemies: Map<string, any>) => void,
  setPlayer: React.Dispatch<React.SetStateAction<any>>,
  addLog: (text: string, type?: any) => void,
  setLoading: (l: boolean) => void,
  setLoadingProgress: (p: number) => void,
  setLoadingLogs: (cb: (prev: string[]) => string[]) => void,
  setLoadingMessage: (msg: string) => void,
  setIsWaitingToStart: (w: boolean) => void,
  setIsTransitionLoading: (t: boolean) => void,
  language: "en" | "ru",
  forceCloseMap: () => void,
  loadSoundFn?: (url: string) => Promise<any>,
  revealFogOfWarBatch?: (tiles: { x: number; y: number }[]) => void,
  enemiesDb: { [id: string]: EnemyDefinition } = {},
  npcsDb: { [id: string]: NPCDefinition } = {},
  decorationsDb: { [id: string]: DecorationDefinition } = {},
  itemsDb: any = {},
  sectorStatesRef?: React.MutableRefObject<Map<string, any>>,
  getEnemiesSnapshot?: () => Map<string, any>,
  getRoamingAnimsSnapshot?: () => any[],
  setRoamingAnimsCallback?: (anims: any[]) => void,
  onDoorStateChange?: (x: number, y: number, state: "OPEN" | "CLOSED") => void,
  globalScriptFlagsRef?: React.MutableRefObject<Record<string, any>>,
) => {
  const [levelData, setLevelData] = useState<{
    name: string;
    rawName: string;
    description: string;
    objective: string;
    soundtrack?: string;
    ceilingType: "INDOOR" | "OUTDOOR";
    weather: "none" | "rain" | "fog";
    fogColor?: string;
    fogDistance?: number;
    grid: Tile[][];
    grids?: Tile[][][]; // New grids support
    width: number;
    height: number;
    baseLightInfo?: {
      gridLight?: string[];
      globalLight: number;
      lightDefinitions?: any;
    };
    lightMap: { r: number; g: number; b: number }[][];
    floorLightMaps?: { r: number; g: number; b: number }[][][];
    outdoorMap: boolean[][];
    triggers: any[];
    tasks?: any[];
    keyMap?: { [keyId: string]: string };
    doorDefinitions?: any;
    construction?: any[];
    enemiesPalette?: any[];
    npcsPalette?: any[];
    itemsPalette?: any[];
    decorationsPalette?: any[];
    portalsPalette?: any[];
  } | null>(null);

  const [currentLevelPath, setCurrentLevelPath] = useState<string | null>(null);
  const [wallTexture, setWallTexture] = useState<HTMLImageElement | null>(null);
  const [floorTexture, setFloorTexture] = useState<HTMLImageElement | null>(
    null,
  );
  const [doorTexture, setDoorTexture] = useState<HTMLImageElement | null>(null);
  const [skyTexture, setSkyTexture] = useState<HTMLImageElement | null>(null);
  const [ceilingTexture, setCeilingTexture] = useState<HTMLImageElement | null>(
    null,
  );
  const [viewportFade, setViewportFade] = useState(1);

  const levelDataRef = useRef(levelData);
  useEffect(() => {
    levelDataRef.current = levelData;
  }, [levelData]);

  // Output Buffers for the Renderer
  const customWallBuffersRef = useRef<Map<number, RaycasterBuffer>>(new Map());
  const customFloorBuffersRef = useRef<Map<number, RaycasterBuffer>>(new Map());

  // Pre-computed base buffers to avoid slow getImageData
  const baseWallBufferRef = useRef<RaycasterBuffer | null>(null);
  const baseFloorBufferRef = useRef<RaycasterBuffer | null>(null);
  const baseDoorBufferRef = useRef<RaycasterBuffer | null>(null);

  // Saturation map to prevent infinite drawing on same tile
  const splatterDensityMapRef = useRef<Map<number, number>>(new Map());
  const decalEventsRef = useRef<any[]>([]);
  const pendingDecalsRef = useRef<any[] | null>(null);
  const isReplayingRef = useRef(false);

  // Persistence for explored tiles: Map<LevelPath, Set<"x,y">>
  const visitedTilesRef = useRef<Map<string, Set<string>>>(new Map());

  useDoorSystem(levelData, setLevelData, onDoorStateChange);

  const lastLightingHashRef = useRef<number>(0);

  // Recalculate dynamic lighting when grid changes (e.g. doors open/break, decorations appear/disappear)
  useEffect(() => {
    if (!levelData || !levelData.grid) return;
    const { hash: currentHash, hasAnimatingDoor } = getLightingHashAndCheckAnimating(levelData.grid);
    if (currentHash === lastLightingHashRef.current) return;
    lastLightingHashRef.current = currentHash;

    if (hasAnimatingDoor) return;

    setLevelData((prev) => {
      if (!prev || !prev.baseLightInfo) return prev;
      const newLightMapRes = calculateLightMap(
        prev.grid,
        prev.baseLightInfo.gridLight,
        prev.baseLightInfo.globalLight,
        prev.baseLightInfo.lightDefinitions || {},
        prev.outdoorMap,
        prev.grids
      );
      return {
        ...prev,
        lightMap: newLightMapRes.baseLightMap,
        floorLightMaps: newLightMapRes.floorLightMaps,
        dynamicLights: newLightMapRes.dynamicLights,
      };
    });
  }, [levelData?.grid]);

  // Sync scriptFlags globally
  useEffect(() => {
    if (levelData && globalScriptFlagsRef) {
      if (!levelData.scriptFlags) {
        levelData.scriptFlags = {};
      }
      // Update globalScriptFlagsRef.current with any newly loaded flags
      globalScriptFlagsRef.current = {
        ...globalScriptFlagsRef.current,
        ...levelData.scriptFlags,
      };
      // Point the active levelData.scriptFlags to our global ref
      levelData.scriptFlags = globalScriptFlagsRef.current;
    }
  }, [levelData, globalScriptFlagsRef]);

  // Initialize blood splats once
  useEffect(() => {
    initBloodSplats();
  }, []);

  const t = (
    template: string | undefined,
    params: { [key: string]: string | number },
  ) => {
    if (!template) return "???";
    return template.replace(/{(\w+)}/g, (_, key) =>
      params[key] !== undefined ? String(params[key]) : `{${key}}`,
    );
  };

  const markTileAsExplored = useCallback(
    (path: string, x: number, y: number) => {
      if (!visitedTilesRef.current.has(path)) {
        visitedTilesRef.current.set(path, new Set());
      }
      visitedTilesRef.current.get(path)?.add(`${x},${y}`);

      // FIX: Trigger state update so UI (Map) reflects changes immediately
      setLevelData((prev) => {
        if (!prev) return null;
        if (x < 0 || x >= prev.width || y < 0 || y >= prev.height) return prev;

        // Optimization: If already explored, do not clone state
        if (prev.grid[y][x].isExplored) return prev;

        const newGrid = [...prev.grid];
        const newRow = [...newGrid[y]];
        newRow[x] = { ...newRow[x], isExplored: true };
        newGrid[y] = newRow;

        // Update upper layers too if they exist to keep sync
        let newGrids = prev.grids;
        if (newGrids) {
          newGrids = [...newGrids];
          if (newGrids[0]) {
            const l0 = [...newGrids[0]];
            const l0Row = [...l0[y]];
            l0Row[x] = { ...l0Row[x], isExplored: true };
            l0[y] = l0Row;
            newGrids[0] = l0;
          }
        }

        return { ...prev, grid: newGrid, grids: newGrids };
      });
    },
    [],
  );

  const markTilesAsExploredBatch = useCallback(
    (path: string, tiles: { x: number; y: number }[]) => {
      if (!visitedTilesRef.current.has(path)) {
        visitedTilesRef.current.set(path, new Set());
      }
      const visitedSet = visitedTilesRef.current.get(path)!;

      setLevelData((prev) => {
        if (!prev) return null;

        let changed = false;
        let newGrid = prev.grid;
        let newGrids = prev.grids;

        for (const { x, y } of tiles) {
          if (x < 0 || x >= prev.width || y < 0 || y >= prev.height) continue;

          visitedSet.add(`${x},${y}`);

          if (newGrid[y][x].isExplored) continue;

          if (!changed) {
            newGrid = [...prev.grid];
            if (prev.grids) {
              newGrids = [...prev.grids];
              if (newGrids[0]) {
                newGrids[0] = [...newGrids[0]];
              }
            }
            changed = true;
          }

          if (newGrid[y] === prev.grid[y]) {
            newGrid[y] = [...prev.grid[y]];
          }
          newGrid[y][x] = { ...newGrid[y][x], isExplored: true };

          if (newGrids && newGrids[0]) {
            if (newGrids[0][y] === prev.grids![0][y]) {
              newGrids[0][y] = [...prev.grids![0][y]];
            }
            newGrids[0][y][x] = { ...newGrids[0][y][x], isExplored: true };
          }
        }

        if (!changed) return prev;
        return { ...prev, grid: newGrid, grids: newGrids };
      });
    },
    [],
  );

  // Internal helper to apply green-screen transparency to a canvas context
  // REMOVED UNUSED applyMaskToContext

  const addSplatter = useCallback(
    (
      x: number,
      y: number,
      z: number,
      type: "WALL" | "FLOOR" | "DOOR" | "SCORCH" | "SCORCH_WALL",
      intensity: number = 1.0,
      face?: number,
      gridOverride?: Tile[][],
    ) => {
      if (!isReplayingRef.current) {
        decalEventsRef.current.push({
          type: "splatter",
          args: [x, y, z, type, intensity, face],
        });
      }
      const currentLevel = levelData;
      if (!currentLevel || !wallTexture || !floorTexture) return;

      const tileX = Math.floor(x);
      const tileY = Math.floor(y);

      if (
        tileX < 0 ||
        tileX >= currentLevel.width ||
        tileY < 0 ||
        tileY >= currentLevel.height
      )
        return;

      const gridToUse = gridOverride || currentLevel.grid;
      const tile = gridToUse[tileY][tileX];
      const isScorch = type === "SCORCH" || type === "SCORCH_WALL";
      const actualType =
        type === "FLOOR" || type === "SCORCH"
          ? "FLOOR"
          : tile.type === "DOOR"
            ? "DOOR"
            : "WALL";

      // KEY GENERATION: (y * 10000 + x) * 10 + face
      // Faces: 0=N, 1=E, 2=S, 3=W, 4=Floor/Generic
      const baseKey = tileY * 10000 + tileX;
      const effectiveFace = actualType === "FLOOR" ? 4 : (face ?? 0); // Default to N if undefined for walls (fallback)
      const key = baseKey * 10 + effectiveFace;

      const currentDensity = splatterDensityMapRef.current.get(key) || 0;
      const MAX_DENSITY = 40;
      if (currentDensity > MAX_DENSITY) return;
      splatterDensityMapRef.current.set(key, currentDensity + 1);

      let relX = x - tileX;
      let relY = y - tileY;

      if (actualType === "WALL" || actualType === "DOOR") {
        // For walls, horizontal position depends on face
        if (face === 0 || face === 2) {
          relX = x - tileX;
        } else if (face === 1 || face === 3) {
          relX = y - tileY;
        } else {
          // Fallback if face is undefined
          if (Math.abs(x - Math.round(x)) < Math.abs(y - Math.round(y))) {
            relX = y - tileY;
          } else {
            relX = x - tileX;
          }
        }
        // Vertical position is based on z (0 is floor, 1 is ceiling)
        // Texture Y=0 is top, Y=height is bottom.
        // So relY = 1.0 - z
        relY = 1.0 - z;
      } else {
        // FLOOR
        relX = x - tileX;
        relY = y - tileY;
      }

      let baseImg: HTMLImageElement | null = null;
      let isMaskedDoor = false;
      let maskImg: HTMLImageElement | undefined = undefined;

      // --- DETERMINE BASE TEXTURE ---

      if (actualType === "WALL") {
        baseImg = wallTexture;

        let faceStr: "N" | "E" | "S" | "W" = "N";
        if (effectiveFace === 0) faceStr = "N";
        else if (effectiveFace === 1) faceStr = "E";
        else if (effectiveFace === 2) faceStr = "S";
        else if (effectiveFace === 3) faceStr = "W";

        let usedFaceAsset = false;
        if (tile.faces?.[faceStr]) {
          const faceAssetId = tile.faces[faceStr]!;
          let img = masterSpriteMapRef.current.get(faceAssetId);
          if (!img) img = masterSpriteMapRef.current.get(`TEX_${faceAssetId}`);
          if (img) {
            baseImg = img;
            usedFaceAsset = true;
          }
        }

        if (!usedFaceAsset && tile.assetId) {
          let img = masterSpriteMapRef.current.get(tile.assetId);
          if (!img) img = masterSpriteMapRef.current.get(`TEX_${tile.assetId}`);
          if (img) baseImg = img;
        }
      } else if (actualType === "DOOR") {
        baseImg = doorTexture;
        if (tile.door?.textureId) {
          let img = masterSpriteMapRef.current.get(tile.door.textureId);
          if (!img)
            img = masterSpriteMapRef.current.get(`TEX_${tile.door.textureId}`);
          if (img) baseImg = img;
        }
        if (tile.door?.maskId) {
          isMaskedDoor = true;
          maskImg = masterSpriteMapRef.current.get(tile.door.maskId);
          if (!maskImg)
            maskImg = masterSpriteMapRef.current.get(`TEX_${tile.door.maskId}`);
        }
      } else {
        baseImg = floorTexture;
        const floorAssetId = tile.assetId || tile.floorAssetId;
        if (floorAssetId) {
          let img = masterSpriteMapRef.current.get(floorAssetId);
          if (!img) img = masterSpriteMapRef.current.get(`TEX_${floorAssetId}`);
          if (img) baseImg = img;
        }
      }

      if (!baseImg) return;

      // --- OPTIMIZED BLENDING ---

      let buffer: RaycasterBuffer | undefined;
      let isNewBuffer = false;

      if (actualType === "WALL" || actualType === "DOOR") {
        buffer = customWallBuffersRef.current.get(key);
        if (!buffer) {
          // First time splat on this tile: Create buffer from base texture
          if (actualType === "DOOR" && isMaskedDoor && maskImg) {
            // Use the helper to create masked buffer
            const masked = processMaskedTexture(baseImg, maskImg);
            if (masked) buffer = masked;
          } else {
            // Standard texture
            // OPTIMIZATION: Use pre-computed buffer if possible
            if (
              actualType === "WALL" &&
              baseWallBufferRef.current &&
              baseImg === wallTexture
            ) {
              buffer = cloneBuffer(baseWallBufferRef.current);
            } else if (
              actualType === "DOOR" &&
              baseDoorBufferRef.current &&
              baseImg === doorTexture
            ) {
              buffer = cloneBuffer(baseDoorBufferRef.current);
            } else {
              const baseBuf = getBaseTextureBuffer(baseImg);
              if (baseBuf) {
                buffer = cloneBuffer(baseBuf);
              }
            }
          }

          if (buffer) {
            buffer.id = `custom_wall_${key}`;
            customWallBuffersRef.current.set(key, buffer);
            isNewBuffer = true;
          }
        }
      } else {
        // FLOOR
        buffer = customFloorBuffersRef.current.get(key);
        if (!buffer) {
          if (baseFloorBufferRef.current && baseImg === floorTexture) {
            buffer = cloneBuffer(baseFloorBufferRef.current);
          } else {
            const baseBuf = getBaseTextureBuffer(baseImg);
            if (baseBuf) {
              buffer = cloneBuffer(baseBuf);
            }
          }
          if (buffer) {
            buffer.id = `custom_floor_${key}`;
            customFloorBuffersRef.current.set(key, buffer);
            isNewBuffer = true;
          }
        }
      }

      if (buffer) {
        // Get a cached splat sprite
        const splat = getCachedSplat(isScorch ? "SCORCH" : actualType);
        if (splat) {
          // Determine position on texture
          const texX = relX * buffer.width;
          const texY = relY * buffer.height;

          // Blit directly to buffer
          blitSplat(
            buffer.data,
            buffer.width,
            buffer.height,
            splat,
            texX,
            texY,
            actualType === "WALL" || actualType === "DOOR" || isScorch
              ? "MULTIPLY"
              : "SOURCE-OVER",
          );
          buffer.dirty = true;
        }
      }
    },
    [levelData, wallTexture, floorTexture, doorTexture, masterSpriteMapRef],
  );

  const addShardDecal = useCallback(
    (p: Particle) => {
      if (!isReplayingRef.current) {
        decalEventsRef.current.push({
          type: "shard",
          args: [
            {
              worldX: p.worldX,
              worldY: p.worldY,
              textureId: p.textureId,
              uvRect: p.uvRect,
              angle: p.angle,
            },
          ],
        });
      }
      const currentLevel = levelData;
      if (!currentLevel || !p.textureId || !floorTexture) return;

      const tileX = Math.floor(p.worldX);
      const tileY = Math.floor(p.worldY);

      if (
        tileX < 0 ||
        tileX >= currentLevel.width ||
        tileY < 0 ||
        tileY >= currentLevel.height
      )
        return;

      const key = (tileY * 10000 + tileX) * 10 + 4; // Floor face
      let buffer = customFloorBuffersRef.current.get(key);

      const tile = currentLevel.grid[tileY][tileX];
      let baseImg: HTMLImageElement = floorTexture;
      const floorAssetId = tile.assetId || tile.floorAssetId;
      if (floorAssetId) {
        let img = masterSpriteMapRef.current.get(floorAssetId);
        if (!img) img = masterSpriteMapRef.current.get(`TEX_${floorAssetId}`);
        if (img) baseImg = img;
      }

      if (!buffer) {
        if (baseFloorBufferRef.current && baseImg === floorTexture) {
          buffer = cloneBuffer(baseFloorBufferRef.current);
          buffer.id = `custom_floor_${key}`;
          customFloorBuffersRef.current.set(key, buffer);
        } else {
          const baseBuf = getBaseTextureBuffer(baseImg);
          if (baseBuf) {
            buffer = cloneBuffer(baseBuf);
            buffer.id = `custom_floor_${key}`;
            customFloorBuffersRef.current.set(key, buffer);
          }
        }
      }

      if (!buffer) return;

      let shardBuf;

      if (p.decalBuffer) {
        shardBuf = p.decalBuffer;
      } else {
        const img =
          masterSpriteMapRef.current.get(p.textureId) ||
          masterSpriteMapRef.current.get(`TEX_${p.textureId}`);
        if (!img || !p.uvRect) return;

        const cvs = document.createElement("canvas");
        cvs.width = 64;
        cvs.height = 64;
        const ctx = cvs.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.translate(32, 32);
        if (p.rotation) ctx.rotate(p.rotation);

        let drawW = 24;
        let drawH = 24;

        if (p.type === "gib") {
          const aspect = p.uvRect.w / p.uvRect.h;
          // Base size 60, scaled by particle size (which is ~0.1-0.5)
          const baseSize = p.size * 120;
          drawW = baseSize * (aspect > 1 ? 1 : aspect);
          drawH = baseSize * (aspect < 1 ? 1 : 1 / aspect);
        } else {
          let shardSize = 12;
          if (p.type === "shard" && p.sizeMult) {
            shardSize = 12 * p.sizeMult;
          }
          drawW = shardSize * 2;
          drawH = shardSize * 2;
          if (p.points) {
            ctx.beginPath();
            p.points.forEach((pt: any, idx: number) => {
              if (idx === 0) ctx.moveTo(pt.x * shardSize, pt.y * shardSize);
              else ctx.lineTo(pt.x * shardSize, pt.y * shardSize);
            });
            ctx.closePath();
            ctx.clip();
          }
        }

        if (p.type === "shard") {
          ctx.globalAlpha = 0.3;
        }
        ctx.drawImage(
          img,
          p.uvRect.u * img.width,
          p.uvRect.v * img.height,
          p.uvRect.w * img.width,
          p.uvRect.h * img.height,
          -drawW / 2,
          -drawH / 2,
          drawW,
          drawH,
        );
        ctx.restore();

        // Glass outline
        ctx.save();
        ctx.translate(32, 32);
        if (p.rotation) ctx.rotate(p.rotation);

        if (p.points) {
          let shardSize = 12;
          if (p.type === "shard" && p.sizeMult) {
            shardSize = 12 * p.sizeMult;
          }
          ctx.beginPath();
          p.points.forEach((pt: any, idx: number) => {
            if (idx === 0) ctx.moveTo(pt.x * shardSize, pt.y * shardSize);
            else ctx.lineTo(pt.x * shardSize, pt.y * shardSize);
          });
          ctx.closePath();
          ctx.strokeStyle = "rgba(220, 230, 255, 0.9)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();

        shardBuf = {
          data: new Uint32Array(ctx.getImageData(0, 0, 64, 64).data.buffer),
          width: 64,
          height: 64,
          type: "FLOOR" as const,
        };
      }

      const relX = p.worldX - tileX;
      const relY = p.worldY - tileY;

      blitSplat(
        buffer.data,
        buffer.width,
        buffer.height,
        shardBuf as any,
        relX * buffer.width,
        relY * buffer.height,
        "SOURCE-OVER",
      );
      buffer.dirty = true;
    },
    [levelData, floorTexture, masterSpriteMapRef],
  );

  const processMaskedTexture = (
    baseImg: HTMLImageElement,
    maskImg: HTMLImageElement,
  ): RaycasterBuffer | null => {
    if (!baseImg || !maskImg) return null;
    const cacheKey =
      (baseImg.src || (baseImg as any).version || "") +
      "___" +
      (maskImg.src || (maskImg as any).version || "");
    const cached = maskedTextureCache.get(cacheKey);
    if (cached) {
      return cloneBuffer(cached);
    }

    const canvas = document.createElement("canvas");
    canvas.width = baseImg.width;
    canvas.height = baseImg.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(baseImg, 0, 0);
    const baseData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = maskImg.width;
    maskCanvas.height = maskImg.height;
    const mCtx = maskCanvas.getContext("2d");
    if (!mCtx) return null;
    mCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
    const maskData = mCtx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = baseData.data;
    const maskPixels = maskData.data;
    const len = pixels.length;
    for (let i = 0; i < len; i += 4) {
      const mr = maskPixels[i];
      const mg = maskPixels[i + 1];
      const mb = maskPixels[i + 2];
      if (mg > 200 && mr < 50 && mb < 50) {
        pixels[i + 3] = 100;
      }
    }
    const result = {
      data: new Uint32Array(baseData.data.buffer),
      width: canvas.width,
      height: canvas.height,
    };
    maskedTextureCache.set(cacheKey, result);
    return cloneBuffer(result);
  };

  const plantExplosive = useCallback(
    (x: number, y: number, item: any, player: any) => {
      if (!levelData) return null;

      const tile = levelData.grid[y][x];

      // Ensure there is not already an explosive on this tile
      if (tile.explosive) {
        addLog(
          strings?.logs.c4_already_planted ||
            "На этой стене уже есть взрывчатка.",
          "WARNING",
        );
        return null;
      }

      // 1. Check if wall can be destroyed
      if (!tile.canBeDestroyed) {
        addLog(
          strings?.logs.c4_wall_indestructible ||
            "Нельзя установить взрывчатку на эту стену.",
          "WARNING",
        );
        return null;
      }

      // 2. Check if it's an outer wall (boundary check)
      if (
        x <= 0 ||
        x >= levelData.width - 1 ||
        y <= 0 ||
        y >= levelData.height - 1
      ) {
        addLog(
          strings?.logs.c4_wall_indestructible ||
            "Нельзя установить взрывчатку на эту стену.",
          "WARNING",
        );
        return null;
      }

      // 3. Check for adjacent door (Must NOT have adjacent door)
      const neighbors = [
        { dx: 0, dy: -1 }, // N
        { dx: 1, dy: 0 }, // E
        { dx: 0, dy: 1 }, // S
        { dx: -1, dy: 0 }, // W
      ];

      let hasAdjacentDoor = false;
      for (const n of neighbors) {
        const nx = x + n.dx;
        const ny = y + n.dy;
        if (
          nx >= 0 &&
          nx < levelData.width &&
          ny >= 0 &&
          ny < levelData.height
        ) {
          if (levelData.grid[ny][nx].type === "DOOR") {
            hasAdjacentDoor = true;
            break;
          }
        }
      }

      if (hasAdjacentDoor || tile.type === "DOOR" || tile.isWindow) {
        addLog(
          strings?.logs.c4_wall_indestructible ||
            "Нельзя установить взрывчатку на эту стену.",
          "WARNING",
        );
        return null;
      }

      const px = player.pos.x;
      const py = player.pos.y;

      // Use Cardinal Direction to determine side
      const dir = Math.round(player.dir + 4) % 4;
      let side: "N" | "E" | "S" | "W" = "N";

      if (dir === 0)
        side = "S"; // Facing North -> Place on South Face
      else if (dir === 1)
        side = "W"; // Facing East -> Place on West Face
      else if (dir === 2)
        side = "N"; // Facing South -> Place on North Face
      else if (dir === 3) side = "E"; // Facing West -> Place on East Face

      const newGrid = levelData.grid.map((row: any) => [...row]);
      const newRow = [...newGrid[y]];

      const explosiveData = {
        id: item.id,
        timer: item.timer || 3,
        damageDice: item.damageDice || "4d4",
        range: item.explosionRange || 1,
        assetId: item.wallAssetId || "C4_WALL_ANIM",
        side,
        explosionId: item.explosionId,
        plantedByPos: { x: px, y: py },
        justPlaced: true,
      };

      newRow[x] = {
        ...newRow[x],
        explosive: explosiveData,
      };
      newGrid[y] = newRow;

      if (typeof window !== "undefined" && (window as any).registerExplosive) {
        (window as any).registerExplosive(x, y);
      }

      setLevelData((prev) => {
        if (!prev) return null;
        return { ...prev, grid: newGrid };
      });

      // Return the grid for immediate processing if needed
      return newGrid;
    },
    [levelData],
  );

  const lastTickRunRef = useRef(0);

  const tickExplosives = useCallback(
    (
      onExplode: (
        x: number,
        y: number,
        damage: string,
        range: number,
        assetId?: string,
        wallTextureId?: string,
        gridState?: Tile[][],
        soundId?: string,
        itemType?: string,
        itemDuration?: number,
      ) => void,
      gridOverride?: Tile[][],
      onTickComplete?: (newGrid: Tile[][]) => void,
    ) => {
      const runId = performance.now() + Math.random();

      setLevelData((prev) => {
        if (!prev) return prev;

        const explosions: {
          x: number;
          y: number;
          damage: string;
          range: number;
          assetId?: string;
          wallTextureId?: string;
          soundId?: string;
          itemType?: string;
          itemDuration?: number;
        }[] = [];
        const spreads: { x: number; y: number; decoration: any }[] = [];
        const scorches: { x: number; y: number }[] = [];
        let hasChanges = false;

        const sourceGrid = gridOverride || prev.grid;

        let workingGrid: typeof sourceGrid | null = null;
        const getWorkingGrid = () => {
          if (!workingGrid) {
            workingGrid = [...sourceGrid];
          }
          return workingGrid;
        };

        const updateTileInGrid = (
          y: number,
          x: number,
          updater: (t: any) => any,
        ) => {
          const grid = getWorkingGrid();
          if (grid[y] === sourceGrid[y]) {
            grid[y] = [...sourceGrid[y]];
          }
          const oldTile = grid[y][x];
          const newTile = updater(oldTile);
          if (oldTile !== newTile) {
            grid[y][x] = newTile;
            hasChanges = true;
          }
        };

        // Scan the entire grid for timed effects. This is highly optimized and 100% robust.
        const activeCoordsSet = new Set<string>();
        for (let y = 0; y < sourceGrid.length; y++) {
          const row = sourceGrid[y];
          for (let x = 0; x < row.length; x++) {
            const tile = row[x];
            if (
              tile &&
              (tile.explosive ||
                (tile.items && tile.items.length > 0) ||
                (tile.decoration && tile.decoration.lifeTime !== undefined))
            ) {
              activeCoordsSet.add(`${x},${y}`);
            }
          }
        }
        
        // Synchronize with window.timedEffectsCache to make sure we are compatible and up to date
        if ((window as any).timedEffectsCache) {
          (window as any).timedEffectsCache.forEach((coord: string) => {
            activeCoordsSet.add(coord);
          });
        }
        // Update the window cache with all current active tiles
        (window as any).timedEffectsCache = activeCoordsSet;

        const activeCoords = Array.from(activeCoordsSet);
        for (const coordStr of activeCoords) {
          const [xStr, yStr] = (coordStr as string).split(",");
          const x = parseInt(xStr, 10);
          const y = parseInt(yStr, 10);
          const tile = sourceGrid[y]?.[x];
          if (!tile) continue;

          let needsUpdate = false;
          if (
            tile.explosive ||
            (tile.items && tile.items.length > 0) ||
            (tile.decoration && tile.decoration.lifeTime !== undefined)
          ) {
            needsUpdate = true;
          }

          if (needsUpdate) {
            updateTileInGrid(y, x, (currentTile: any) => {
              let updatedTile = currentTile;

              if (updatedTile.explosive) {
                // Check for justPlaced flag (cast to any to avoid type error)
                if ((updatedTile.explosive as any).justPlaced) {
                  const { justPlaced, ...rest } = updatedTile.explosive as any;
                  updatedTile = { ...updatedTile, explosive: rest };
                } else {
                  const newTimer = updatedTile.explosive.timer - 1;
                  if (newTimer <= 0) {
                    // Capture wall texture BEFORE it becomes floor
                    const wallTextureId =
                      updatedTile.type === "WALL"
                        ? updatedTile.assetId || updatedTile.textureId
                        : undefined;

                    explosions.push({
                      x,
                      y,
                      damage: updatedTile.explosive.damageDice,
                      range: updatedTile.explosive.range,
                      assetId: updatedTile.explosive.explosionId,
                      wallTextureId,
                    });

                    if (
                      updatedTile.type === "DOOR" &&
                      updatedTile.door?.maskId
                    ) {
                      updatedTile = {
                        ...updatedTile,
                        explosive: undefined,
                      };
                    } else {
                      // Find adjacent floor tile to copy properties
                      let footstepSound: string | undefined = undefined;
                      let fallSound: string | undefined = undefined;
                      let assetId: string | undefined = undefined;
                      let bottomTextureId: string | undefined = undefined;
                      let topTextureId: string | undefined = undefined;
                      let topTextureRotation: number | undefined = undefined;

                      const neighbors = [
                        { dx: 0, dy: -1 },
                        { dx: 1, dy: 0 },
                        { dx: 0, dy: 1 },
                        { dx: -1, dy: 0 },
                      ];

                      for (const n of neighbors) {
                        const nx = x + n.dx;
                        const ny = y + n.dy;
                        if (
                          ny >= 0 &&
                          ny < sourceGrid.length &&
                          nx >= 0 &&
                          nx < sourceGrid[0].length
                        ) {
                          const neighborTile = sourceGrid[ny][nx];
                          if (neighborTile.type === "FLOOR") {
                            footstepSound = neighborTile.footstepSound;
                            fallSound = neighborTile.fallSound;
                            assetId =
                              neighborTile.assetId || neighborTile.floorAssetId;
                            bottomTextureId = neighborTile.bottomTextureId;
                            topTextureId = neighborTile.topTextureId;
                            topTextureRotation = neighborTile.topTextureRotation;
                            break;
                          }
                        }
                      }

                      // Clear custom buffers for this tile to remove old decals (e.g. blood on the wall)
                      for (let face = 0; face <= 4; face++) {
                        const key = (y * 10000 + x) * 10 + face;
                        customWallBuffersRef.current.delete(key);
                        customFloorBuffersRef.current.delete(key);
                        splatterDensityMapRef.current.delete(key);
                      }
                      clearRaycastCache();

                      updatedTile = {
                        ...updatedTile,
                        type: "FLOOR" as const,
                        explosive: undefined,
                        assetId: assetId,
                        door: undefined,
                        blocking: false,
                        description: "Разрушенная стена",
                        faces: undefined,
                        textureId: undefined,
                        canBeDestroyed: undefined,
                        isWindow: undefined,
                        glassAssetId: undefined,
                        glassTransparency: undefined,
                        isGlassBroken: undefined,
                        thickness: undefined,
                        offset: undefined,
                        keylock: undefined,
                        keypadDirection: undefined,
                        keypadAssetId: undefined,
                        keypadMaskAssetId: undefined,
                        keypadSound: undefined,
                        keypadSuccessSound: undefined,
                        keypadFailSound: undefined,
                        password: undefined,
                        footstepSound: footstepSound,
                        fallSound: fallSound,
                        bottomTextureId: bottomTextureId,
                        topTextureId: topTextureId,
                        topTextureRotation: topTextureRotation,
                      };
                    }
                  } else {
                    updatedTile = {
                      ...updatedTile,
                      explosive: { ...updatedTile.explosive, timer: newTimer },
                    };
                  }
                }
              }

              if (updatedTile.items && updatedTile.items.length > 0) {
                let itemsChanged = false;
                const newItems = updatedTile.items
                  .map((item: any) => {
                    if (
                      (item.type === "GRENADE" || item.type === "FLASHBANG") &&
                      item.activeTimer !== undefined &&
                      item.activeTimer > 0
                    ) {
                      if (item.justPlaced) {
                        itemsChanged = true;
                        const { justPlaced, ...rest } = item;
                        return rest;
                      }
                      itemsChanged = true;
                      const newTimer = item.activeTimer - 1;
                      if (newTimer <= 0) {
                        explosions.push({
                          x,
                          y,
                          damage: item.damageDice || "3d6",
                          range: item.explosionRange || 1,
                          assetId:
                            item.explosionId !== undefined
                              ? item.explosionId
                              : item.type === "FLASHBANG"
                                ? ""
                                : "ANIM_EXPLOSION",
                          soundId: item.explosionSoundId || "EXPLOSION",
                          itemType: item.type,
                          itemDuration: item.duration,
                        });
                        return null;
                      }
                      return { ...item, activeTimer: newTimer };
                    }
                    return item;
                  })
                  .filter(Boolean) as any[];

                if (itemsChanged) {
                  updatedTile = { ...updatedTile, items: newItems };
                }
              }

              if (
                updatedTile.decoration &&
                updatedTile.decoration.lifeTime !== undefined
              ) {
                const newLifeTime = updatedTile.decoration.lifeTime - 1;

                if (updatedTile.decoration.isScorching) {
                  scorches.push({ x, y });
                }

                if (
                  updatedTile.decoration.spreadsLeft &&
                  updatedTile.decoration.spreadsLeft > 0
                ) {
                  spreads.push({ x, y, decoration: updatedTile.decoration });
                }

                if (newLifeTime <= 0) {
                  updatedTile = { ...updatedTile, decoration: undefined };
                } else {
                  updatedTile = {
                    ...updatedTile,
                    decoration: {
                      ...updatedTile.decoration,
                      lifeTime: newLifeTime,
                      spreadsLeft: 0, // Parent stops spreading further
                    },
                  };
                }
              }

              const stillHasEffects =
                updatedTile.explosive ||
                (updatedTile.items && updatedTile.items.length > 0) ||
                (updatedTile.decoration &&
                  updatedTile.decoration.lifeTime !== undefined);
              if (!stillHasEffects) {
                (window as any).timedEffectsCache?.delete(`${x},${y}`);
                (window as any).explosivePositionsCache?.delete(`${x},${y}`);
              } else if (!updatedTile.explosive) {
                (window as any).explosivePositionsCache?.delete(`${x},${y}`);
              }

              return updatedTile;
            });
          }
        }

        if (spreads.length > 0) {
          const DIRS = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 },
          ];
          spreads.forEach((s) => {
            const validDirs = DIRS.filter((dir) => {
              const nx = s.x + dir.dx;
              const ny = s.y + dir.dy;
              const grid = workingGrid || sourceGrid;

              if (
                ny >= 0 &&
                ny < grid.length &&
                nx >= 0 &&
                nx < grid[ny].length
              ) {
                const nTile = grid[ny][nx];
                if (
                  nTile.type !== "WALL" &&
                  (!nTile.door || nTile.door.state === "OPEN")
                ) {
                  if (!nTile.decoration) {
                    return true;
                  }
                  if (
                    nTile.decoration.destructable &&
                    nTile.decoration.explosion_damage
                  ) {
                    return true;
                  }
                }
              }
              return false;
            });

            if (validDirs.length > 0) {
              const randomDir = validDirs[Math.floor(Math.random() * validDirs.length)];
              const nx = s.x + randomDir.dx;
              const ny = s.y + randomDir.dy;
              const grid = workingGrid || sourceGrid;
              const nTile = grid[ny][nx];

              let canSpread = false;
              if (!nTile.decoration) {
                canSpread = true;
              } else if (
                nTile.decoration.destructable &&
                nTile.decoration.explosion_damage
              ) {
                canSpread = true;
                explosions.push({
                  x: nx,
                  y: ny,
                  damage: nTile.decoration.explosion_damage,
                  range: 1.5,
                  assetId: "ANIM_EXPLOSION",
                  soundId: "EXPLOSION",
                });
              }

              if (canSpread) {
                const decDef =
                  decorationsDb[s.decoration.spreadType] ||
                  decorationsDb[s.decoration.type];
                if (decDef) {
                  updateTileInGrid(ny, nx, (oldTile) => {
                    return {
                      ...oldTile,
                      decoration: {
                        ...decDef,
                        type: s.decoration.spreadType || s.decoration.type,
                        id: `${s.decoration.spreadType || s.decoration.type}_${Math.random()}`,
                        createdByPlayer: s.decoration.createdByPlayer,
                        isScorching: s.decoration.isScorching,
                        spreadsLeft: s.decoration.spreadsLeft - 1,
                        spreadChance: s.decoration.spreadChance,
                        spreadType: s.decoration.spreadType,
                        lifeTime: decDef.lifeTime !== undefined ? decDef.lifeTime : 6,
                      },
                    };
                  });
                  (window as any).registerTimedEffect?.(nx, ny);
                }
              }
            }
          });
        }

        const newGrid = workingGrid || sourceGrid;

        if (hasChanges) {
          // Execute side effects outside updater
          setTimeout(() => {
            if (lastTickRunRef.current === runId) return;
            lastTickRunRef.current = runId;

            explosions.forEach((e) =>
              onExplode(
                e.x,
                e.y,
                e.damage,
                e.range,
                e.assetId,
                e.wallTextureId,
                newGrid,
                e.soundId,
                e.itemType,
                e.itemDuration,
              ),
            );
            scorches.forEach((s) => {
              addSplatter(
                s.x + 0.5 + (Math.random() - 0.5) * 0.3,
                s.y + 0.5 + (Math.random() - 0.5) * 0.3,
                0,
                "SCORCH",
                0.8,
                undefined,
                newGrid,
              );
            });
            if (onTickComplete) onTickComplete(newGrid);
          }, 0);

          return { ...prev, grid: newGrid };
        }

        if (onTickComplete) {
          setTimeout(() => {
            if (lastTickRunRef.current === runId) return;
            lastTickRunRef.current = runId;
            onTickComplete(prev.grid);
          }, 0);
        }
        return prev;
      });
    },
    [decorationsDb, addSplatter],
  );

  const loadLevel = async (
    levelPath: string | undefined,
    strOverride?: GameStrings,
    isTransition: boolean = false,
    targetPortalId?: string,
    currentPlayerState?: any,
    isRestore: boolean = false,
  ) => {
    const S = strOverride || strings;
    if (!S) return;

    const pathToLoad = levelPath || currentLevelPath;
    if (!pathToLoad) return;

    // 1. Snapshot current level state before unmounting
    if (
      !isRestore &&
      currentLevelPath &&
      sectorStatesRef &&
      levelDataRef.current
    ) {
      sectorStatesRef.current.set(currentLevelPath, {
        levelData: JSON.parse(JSON.stringify(levelDataRef.current)), // Deep copy to prevent ref sharing
        enemies: getEnemiesSnapshot ? new Map(getEnemiesSnapshot()) : new Map(),
        roamingAnims: getRoamingAnimsSnapshot
          ? [...getRoamingAnimsSnapshot()]
          : [],
        customWallBuffers: new Map(customWallBuffersRef.current),
        customFloorBuffers: new Map(customFloorBuffersRef.current),
        splatterDensityMap: new Map(splatterDensityMapRef.current),
        decalEvents: [...decalEventsRef.current],
      });
    }

    forceCloseMap();
    if (!isTransition) {
      setLoading(true);
      setLoadingProgress(35);
      setLoadingLogs((prev) => [...prev, S.ui.loading.fetching_data]);
      setLoadingMessage(S.ui.loading.geometry);
      setIsWaitingToStart(false);
    } else {
      setViewportFade(1);
      // Wait for the fade out to black to complete before blocking the main thread
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      const data = await getLevelDataByPath(pathToLoad);
      if (data) {
        if (!isTransition) {
          setLoadingProgress(40);
          setLoadingLogs((prev) => [...prev, S.ui.loading.parsing_geometry]);
        }

        // SMART ASSET LOADING
        if (isTransition && !isRestore) {
          setLoadingLogs(() => []);
          setLoadingProgress(0);
          setLoadingMessage(S.ui.loading.geometry || "Loading Level...");
        }
        const required = extractRequiredAssets(
          data,
          currentPlayerState,
          itemsDb,
          enemiesDb,
          npcsDb,
          decorationsDb,
        );
        const onProgress = (pct: number, id: string, type: string) => {
          if (!isTransition) {
            setLoadingProgress(40 + Math.round(pct * 0.5));
          } else if (!isRestore) {
            setLoadingProgress(pct);
          } else {
            setLoadingProgress(40 + Math.round(pct * 0.5));
          }
          setLoadingLogs((prev) => [...prev, `Loaded ${type}: ${id}`]);
        };
        const soundFallback = async (url: string) => {
          if (loadSoundFn) return await loadSoundFn(url);
          return null;
        };
        const updatedMap = await loadSmartAssets(
          required,
          masterSpriteMapRef.current,
          onProgress,
          soundFallback,
          () => {
            if (isTransition) setIsTransitionLoading(true);
          },
        );
        masterSpriteMapRef.current = updatedMap;
        setSpriteMap(new Map(updatedMap)); // Trigger react update

        // 2. Check Cache for the target level
        let cachedState =
          !isRestore &&
          sectorStatesRef &&
          sectorStatesRef.current.get(pathToLoad);
        let loadedData: any;

        if (cachedState) {
          loadedData = {
            levelData: cachedState.levelData,
            enemies: cachedState.enemies,
            roamingAnims: cachedState.roamingAnims,
            // Parse again just to get the static textures and correct startPos if needed
            // Actually, if we deep copy, we need to extract startPos from original parseLevelData
            // But to save time, parseLevelData returns it. Let's just parse anyway for static assets.
          };
          const parsed = await parseLevelData(
            data,
            S,
            language,
            masterSpriteMapRef.current,
            enemiesDb,
            npcsDb,
            decorationsDb,
            itemsDb,
            targetPortalId,
          );
          loadedData.startPos = parsed.startPos;
          loadedData.startDir = parsed.startDir;
          loadedData.wallTexture = parsed.wallTexture;
          loadedData.floorTexture = parsed.floorTexture;
          loadedData.doorTexture = parsed.doorTexture;
          loadedData.skyTexture = parsed.skyTexture;
          loadedData.ceilingTexture = parsed.ceilingTexture;

          const hasCachedBuffers =
            (cachedState.customWallBuffers &&
              cachedState.customWallBuffers.size > 0) ||
            (cachedState.customFloorBuffers &&
              cachedState.customFloorBuffers.size > 0);

          customWallBuffersRef.current.clear();
          if (
            cachedState.customWallBuffers &&
            cachedState.customWallBuffers.size > 0
          ) {
            cachedState.customWallBuffers.forEach((value: any, key: any) => {
              customWallBuffersRef.current.set(key, value);
            });
          }

          customFloorBuffersRef.current.clear();
          if (
            cachedState.customFloorBuffers &&
            cachedState.customFloorBuffers.size > 0
          ) {
            cachedState.customFloorBuffers.forEach((value: any, key: any) => {
              customFloorBuffersRef.current.set(key, value);
            });
          }

          splatterDensityMapRef.current.clear();
          if (
            cachedState.splatterDensityMap &&
            cachedState.splatterDensityMap.size > 0
          ) {
            cachedState.splatterDensityMap.forEach((value: any, key: any) => {
              splatterDensityMapRef.current.set(key, value);
            });
          }

          decalEventsRef.current = cachedState.decalEvents
            ? [...cachedState.decalEvents]
            : [];

          if (!hasCachedBuffers && decalEventsRef.current.length > 0) {
            pendingDecalsRef.current = [...decalEventsRef.current];
          }

          if (setRoamingAnimsCallback) {
            setRoamingAnimsCallback(cachedState.roamingAnims || []);
          }

          // Simulate random patrol movement while the player was away
          const grid = loadedData.levelData.grid;
          const enemyPositions = new Map<string, { x: number; y: number }>();

          grid.forEach((row: any[], y: number) => {
            row.forEach((tile: any, x: number) => {
              if (tile.enemyId) {
                enemyPositions.set(tile.enemyId, { x, y });
              }
            });
          });

          loadedData.enemies.forEach((enemy: Enemy, id: string) => {
            if (
              enemy.hp > 0 &&
              enemy.patrolRange &&
              enemy.patrolRange > 0 &&
              enemyPositions.has(id)
            ) {
              const start = enemy.homePos || enemyPositions.get(id)!;
              const queue: { x: number; y: number; dist: number }[] = [
                { ...start, dist: 0 },
              ];
              const visited = new Set<string>();
              visited.add(`${start.x},${start.y}`);
              const validTiles: { x: number; y: number }[] = [];

              while (queue.length > 0) {
                const curr = queue.shift()!;

                // Check if this tile is valid to stand on
                const isOriginalPos =
                  curr.x === enemyPositions.get(id)!.x &&
                  curr.y === enemyPositions.get(id)!.y;
                const isPlayerStart =
                  curr.x === parsed.startPos.x && curr.y === parsed.startPos.y;
                const t = grid[curr.y]?.[curr.x];

                if (
                  t &&
                  !isPlayerStart &&
                  (isOriginalPos ||
                    (!t.enemyId &&
                      !t.npc &&
                      (!t.decoration || !t.decoration.blocking)))
                ) {
                  validTiles.push({ x: curr.x, y: curr.y });
                }

                if (curr.dist < enemy.patrolRange) {
                  const neighbors = [
                    { x: curr.x, y: curr.y - 1 },
                    { x: curr.x + 1, y: curr.y },
                    { x: curr.x, y: curr.y + 1 },
                    { x: curr.x - 1, y: curr.y },
                  ];
                  for (const n of neighbors) {
                    if (
                      n.y >= 0 &&
                      n.y < grid.length &&
                      n.x >= 0 &&
                      n.x < grid[n.y].length
                    ) {
                      if (!visited.has(`${n.x},${n.y}`)) {
                        visited.add(`${n.x},${n.y}`);
                        const nt = grid[n.y][n.x];
                        const isPassable =
                          nt.type === "FLOOR" ||
                          (nt.type === "DOOR" &&
                            nt.door &&
                            (nt.door.state === "OPEN" || nt.door.broken));
                        if (isPassable) {
                          queue.push({ x: n.x, y: n.y, dist: curr.dist + 1 });
                        }
                      }
                    }
                  }
                }
              }

              if (validTiles.length > 0) {
                const randomTile =
                  validTiles[Math.floor(Math.random() * validTiles.length)];
                const currentPos = enemyPositions.get(id)!;
                if (
                  randomTile.x !== currentPos.x ||
                  randomTile.y !== currentPos.y
                ) {
                  grid[currentPos.y][currentPos.x].enemyId = undefined;
                  grid[randomTile.y][randomTile.x].enemyId = id;
                  enemyPositions.set(id, randomTile);
                }
              }
            }
          });
        } else {
          loadedData = await parseLevelData(
            data,
            S,
            language,
            masterSpriteMapRef.current,
            enemiesDb,
            npcsDb,
            decorationsDb,
            itemsDb,
            targetPortalId,
          );
          customWallBuffersRef.current.clear();
          customFloorBuffersRef.current.clear();
          splatterDensityMapRef.current.clear();
          decalEventsRef.current = [];
          pendingDecalsRef.current = null;
          clearRaycastCache();
        }

        // if (isTransition) await new Promise(r => setTimeout(r, 1000));

        setWallTexture(loadedData.wallTexture);
        setFloorTexture(loadedData.floorTexture);
        setDoorTexture(loadedData.doorTexture);
        setSkyTexture(loadedData.skyTexture);
        setCeilingTexture(loadedData.ceilingTexture);

        if (!isTransition) {
          setLoadingProgress(95);
          setLoadingLogs((prev) => [...prev, S.ui.loading.creating_caches]);
        }

        // PRE-COMPUTE BASE BUFFERS
        if (loadedData.wallTexture)
          baseWallBufferRef.current = createBufferFromImage(
            loadedData.wallTexture,
            "wall",
          );
        if (loadedData.floorTexture)
          baseFloorBufferRef.current = createBufferFromImage(
            loadedData.floorTexture,
            "floor",
          );
        if (loadedData.doorTexture)
          baseDoorBufferRef.current = createBufferFromImage(
            loadedData.doorTexture,
            "door",
          );

        // Always update sprite map as parseLevelData adds new keys for enemies/items
        setSpriteMap(new Map(masterSpriteMapRef.current));

        setEnemies(loadedData.enemies);
        const savedTiles = visitedTilesRef.current.get(pathToLoad);
        if (savedTiles) {
          loadedData.levelData.grid.forEach((row) => {
            row.forEach((tile) => {
              if (savedTiles.has(`${tile.x},${tile.y}`)) tile.isExplored = true;
            });
          });
          if (loadedData.levelData.grids) {
            loadedData.levelData.grids.forEach((g) => {
              g.forEach((row) => {
                row.forEach((tile) => {
                  if (savedTiles.has(`${tile.x},${tile.y}`))
                    tile.isExplored = true;
                });
              });
            });
          }
        } else {
          markTileAsExplored(
            pathToLoad,
            loadedData.startPos.x,
            loadedData.startPos.y,
          );
        }

        setLevelData({ ...loadedData.levelData, soundtrack: data.soundtrack });
        if (
          typeof window !== "undefined" &&
          (window as any).initializeLevelCaches
        ) {
          (window as any).initializeLevelCaches(loadedData.levelData.grid);
        }
        setPlayer((prev) => {
          if (!prev) return prev;
          
          const hasMaleOverride = data.initialInventoryMale !== undefined || Object.keys(data.initialEquipmentMale || {}).length > 0;
          const hasFemaleOverride = data.initialInventoryFemale !== undefined || Object.keys(data.initialEquipmentFemale || {}).length > 0;
          const hasOverride = data.initialInventory !== undefined || Object.keys(data.initialEquipment || {}).length > 0 || hasMaleOverride || hasFemaleOverride;

          if (
            hasOverride &&
            !cachedState
          ) {
            const playerConfig = playerData as any;
            const testConfigStr =
              typeof localStorage !== "undefined"
                ? localStorage.getItem("editor_test_player")
                : null;
            let finalConfig = playerConfig;
            if (testConfigStr) {
              try {
                finalConfig = JSON.parse(testConfigStr);
              } catch (e) {}
            }
            const localizeVal = (val: string | undefined) => {
              if (!val) return "";
              const idx = val.indexOf("/");
              if (idx !== -1)
                return language === "ru"
                  ? val.substring(0, idx).trim()
                  : val.substring(idx + 1).trim();
              return val;
            };
            const activeGender = prev.characterId || "male";
            const invOverride = activeGender === "male" 
              ? (data.initialInventoryMale ?? data.initialInventory) 
              : (data.initialInventoryFemale ?? data.initialInventory);
            const equipOverride = activeGender === "male" 
              ? (data.initialEquipmentMale ?? data.initialEquipment) 
              : (data.initialEquipmentFemale ?? data.initialEquipment);

            const overriddenPlayer = createPlayer(
              activeGender,
              finalConfig,
              itemsDb,
              localizeVal,
              invOverride,
              equipOverride,
            );
            return {
              ...prev,
              inventory: overriddenPlayer.inventory,
              equipment: overriddenPlayer.equipment,
              equippedWeapon: overriddenPlayer.equippedWeapon,
              hp: overriddenPlayer.hp,
              maxHp: overriddenPlayer.maxHp,
              pos: loadedData.startPos,
              dir: loadedData.startDir,
              dir360: loadedData.startDir,
            };
          }
          return {
            ...prev,
            pos: loadedData.startPos,
            dir: loadedData.startDir,
            dir360: loadedData.startDir,
          };
        });
        setCurrentLevelPath(pathToLoad);

        if (revealFogOfWarBatch)
          revealFogOfWarBatch([
            { x: loadedData.startPos.x, y: loadedData.startPos.y },
          ]);

        if (!isTransition) {
          addLog(
            t(S.logs.system_load, { location: loadedData.levelData.name }),
            "INFO",
          );
          setLoadingProgress(100);
          setLoadingLogs((prev) => [...prev, S.ui.loading.system_ready]);
          setIsWaitingToStart(true);
        } else {
          addLog(
            t(S.logs.system_load, { location: loadedData.levelData.name }),
            "INFO",
          );
          setIsTransitionLoading(false);
          setIsWaitingToStart(true);
        }
      } else {
        addLog(S.logs.data_error, "DANGER");
        if (!isTransition) setLoading(false);
      }
    } catch (error) {
      console.error(error);
      addLog(S.logs.system_fail, "DANGER");
      if (!isTransition) setLoading(false);
    }
  };

  useEffect(() => {
    if (
      levelData &&
      pendingDecalsRef.current &&
      pendingDecalsRef.current.length > 0
    ) {
      const decalsToReplay = pendingDecalsRef.current;
      pendingDecalsRef.current = null;

      isReplayingRef.current = true;
      // Short delay to ensure custom buffers constraints and context are ready for fast blitting
      setTimeout(() => {
        decalsToReplay.forEach((event: any) => {
          if (event.type === "splatter") {
            addSplatter(
              event.args[0],
              event.args[1],
              event.args[2],
              event.args[3],
              event.args[4],
              event.args[5],
            );
          } else if (event.type === "shard") {
            addShardDecal(event.args[0]);
          }
        });
        isReplayingRef.current = false;
      }, 50);
    }
  }, [levelData, addSplatter, addShardDecal]);

  const clearExploredTiles = useCallback(() => {
    visitedTilesRef.current.clear();
  }, []);

  return {
    levelData,
    setLevelData,
    currentLevelPath,
    setCurrentLevelPath,
    wallTexture,
    floorTexture,
    doorTexture,
    skyTexture,
    setSkyTexture,
    ceilingTexture,
    viewportFade,
    setViewportFade,
    loadLevel,
    markTileAsExplored,
    markTilesAsExploredBatch,
    clearExploredTiles,
    addSplatter,
    addShardDecal,
    getCurrentDecalEvents: useCallback(() => [...decalEventsRef.current], []),
    restoreDecals: useCallback((events: any[]) => {
      customWallBuffersRef.current.clear();
      customFloorBuffersRef.current.clear();
      splatterDensityMapRef.current.clear();
      decalEventsRef.current = [...events];
      pendingDecalsRef.current = [...events];
    }, []),
    customWallBuffers: customWallBuffersRef.current,
    customFloorBuffers: customFloorBuffersRef.current,
    plantExplosive,
    tickExplosives,
  };
};
