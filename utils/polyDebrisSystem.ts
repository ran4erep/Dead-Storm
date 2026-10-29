import { PolyObjectModel, PolyObjectCube, Tile } from '../types';
import { getPolyModelById } from '../data/polyModels';
import { PolyObjectInstance, getDecorationFacingAngle } from '../components/raycaster/PolyObjectRenderer';

export interface PolyDebrisParticle {
  id: string;
  baseX: number;
  baseY: number;
  baseZ: number;
  floorZ: number;

  vx: number;
  vy: number;
  vz: number;

  yaw: number;
  vYaw: number;

  scale: number;
  model: PolyObjectModel;

  life: number;
  maxLife: number;
  landed: boolean;

  lightColor?: { r: number; g: number; b: number };
  soundId?: string;
  lastSoundTime?: number;
}

const activePolyDebris: PolyDebrisParticle[] = [];
let lastPolyDebrisUpdateFrameTime = 0;

/**
 * Check if a decoration object is a 3D polyObject.
 */
export function isPolyObjectDecoration(decor: any): boolean {
  if (!decor) return false;
  return (
    decor.renderMode === 'polyObject' ||
    decor.type === 'polyObject' ||
    !!decor.polyModelId ||
    !!decor.polyModel
  );
}

/**
 * Orient a polyObject cube so that its smallest dimension becomes the Z height,
 * allowing debris to lay flat on the ground on its thinnest side with correct texture mapping.
 */
export function orientCubeFlat(cube: PolyObjectCube): PolyObjectCube {
  const [sx, sy, sz] = cube.size;

  let minDim = sz;
  let minAxis: 'X' | 'Y' | 'Z' = 'Z';

  if (sx < minDim) {
    minDim = sx;
    minAxis = 'X';
  }
  if (sy < minDim) {
    minDim = sy;
    minAxis = 'Y';
  }

  const color = cube.color || '#8B5A2B';
  const textureId = cube.textureId;
  const faceColors = cube.faceColors || {};
  const faceTextures = cube.faceTextures || {};

  // If Z is already the thinnest dimension, just set Z offset to rest on floor
  if (minAxis === 'Z') {
    return {
      ...cube,
      offset: [0, 0, sz / 2],
    };
  }

  if (minAxis === 'X') {
    // Rotate 90 deg around Y: X becomes Z, Z becomes X, Y stays Y
    const newSize: [number, number, number] = [sz, sy, sx];

    const newFaceColors: Record<string, string | [number, number, number]> = {
      top: faceColors.right || faceColors.top || color,
      bottom: faceColors.left || faceColors.bottom || color,
      right: faceColors.top || faceColors.right || color,
      left: faceColors.bottom || faceColors.left || color,
      front: faceColors.front || color,
      back: faceColors.back || color,
    };

    const newFaceTextures: Record<string, string> = {};
    if (faceTextures.right || faceTextures.top || textureId) {
      newFaceTextures.top = faceTextures.right || faceTextures.top || textureId!;
    }
    if (faceTextures.left || faceTextures.bottom || textureId) {
      newFaceTextures.bottom = faceTextures.left || faceTextures.bottom || textureId!;
    }
    if (faceTextures.top || faceTextures.right || textureId) {
      newFaceTextures.right = faceTextures.top || faceTextures.right || textureId!;
    }
    if (faceTextures.bottom || faceTextures.left || textureId) {
      newFaceTextures.left = faceTextures.bottom || faceTextures.left || textureId!;
    }
    if (faceTextures.front || textureId) {
      newFaceTextures.front = faceTextures.front || textureId!;
    }
    if (faceTextures.back || textureId) {
      newFaceTextures.back = faceTextures.back || textureId!;
    }

    return {
      ...cube,
      size: newSize,
      offset: [0, 0, sx / 2],
      faceColors: newFaceColors,
      faceTextures: Object.keys(newFaceTextures).length > 0 ? newFaceTextures : undefined,
    };
  } else {
    // minAxis === 'Y'
    // Rotate 90 deg around X: Y becomes Z, Z becomes Y, X stays X
    const newSize: [number, number, number] = [sx, sz, sy];

    const newFaceColors: Record<string, string | [number, number, number]> = {
      top: faceColors.front || faceColors.top || color,
      bottom: faceColors.back || faceColors.bottom || color,
      front: faceColors.bottom || faceColors.front || color,
      back: faceColors.top || faceColors.back || color,
      left: faceColors.left || color,
      right: faceColors.right || color,
    };

    const newFaceTextures: Record<string, string> = {};
    if (faceTextures.front || faceTextures.top || textureId) {
      newFaceTextures.top = faceTextures.front || faceTextures.top || textureId!;
    }
    if (faceTextures.back || faceTextures.bottom || textureId) {
      newFaceTextures.bottom = faceTextures.back || faceTextures.bottom || textureId!;
    }
    if (faceTextures.bottom || faceTextures.front || textureId) {
      newFaceTextures.front = faceTextures.bottom || faceTextures.front || textureId!;
    }
    if (faceTextures.top || faceTextures.back || textureId) {
      newFaceTextures.back = faceTextures.top || faceTextures.back || textureId!;
    }
    if (faceTextures.left || textureId) {
      newFaceTextures.left = faceTextures.left || textureId!;
    }
    if (faceTextures.right || textureId) {
      newFaceTextures.right = faceTextures.right || textureId!;
    }

    return {
      ...cube,
      size: newSize,
      offset: [0, 0, sy / 2],
      faceColors: newFaceColors,
      faceTextures: Object.keys(newFaceTextures).length > 0 ? newFaceTextures : undefined,
    };
  }
}

/**
 * Creates 3D PolyObject explosion debris from a polyObject decoration.
 */
export function spawnPolyObjectDebris(
  decor: any,
  x: number,
  y: number,
  floorZ: number = 0,
  lightColor?: { r: number; g: number; b: number },
  soundId?: string
): PolyDebrisParticle[] {
  if (!decor) return [];

  const debrisSound = soundId || decor?.explodeSound || decor?.destructionSoundId || 'SYS_DEBRIS_FALL';

  const modelId = decor.polyModelId || decor.id || 'chair';
  const sourceModel: PolyObjectModel | undefined =
    decor.polyModel || getPolyModelById(modelId) || getPolyModelById('chair');

  if (!sourceModel || !sourceModel.cubes || sourceModel.cubes.length === 0) {
    return [];
  }

  const scale = decor.scale !== undefined ? decor.scale : 1.0;
  const yOffset = decor.yOffset || 0.0;
  const baseX = x + 0.5;
  const baseY = y + 0.5;
  const baseZ = floorZ + yOffset;

  let initialYaw = 0;
  const facingAngle = getDecorationFacingAngle(decor);
  if (typeof facingAngle === 'number') {
    initialYaw = (facingAngle * Math.PI) / 180;
  } else if (typeof facingAngle === 'string') {
    const f = facingAngle.toUpperCase();
    if (f === 'E') initialYaw = Math.PI / 2;
    else if (f === 'S') initialYaw = Math.PI;
    else if (f === 'W') initialYaw = (3 * Math.PI) / 2;
    else if (f === 'NE') initialYaw = Math.PI / 4;
    else if (f === 'SE') initialYaw = (3 * Math.PI) / 4;
    else if (f === 'SW') initialYaw = (5 * Math.PI) / 4;
    else if (f === 'NW') initialYaw = (7 * Math.PI) / 4;
  }

  const cosY = Math.cos(initialYaw);
  const sinY = Math.sin(initialYaw);

  const newDebris: PolyDebrisParticle[] = [];

  const cubesToProcess: { cube: PolyObjectCube; subOffset: [number, number, number] }[] = [];

  if (sourceModel.cubes.length === 1) {
    const mainCube = sourceModel.cubes[0];
    const [ox, oy, oz] = mainCube.offset;
    const [sx, sy, sz] = mainCube.size;
    const halfSx = sx / 2;
    const halfSy = sy / 2;
    const halfSz = sz / 2;

    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          const subOffX = ox - sx / 4 + ix * halfSx;
          const subOffY = oy - sy / 4 + iy * halfSy;
          const subOffZ = oz - sz / 4 + iz * halfSz;

          const rawCube: PolyObjectCube = {
            ...mainCube,
            offset: [0, 0, 0],
            size: [halfSx, halfSy, halfSz],
          };

          cubesToProcess.push({
            cube: orientCubeFlat(rawCube),
            subOffset: [subOffX, subOffY, subOffZ],
          });
        }
      }
    }
  } else {
    for (const cube of sourceModel.cubes) {
      const rawCube: PolyObjectCube = {
        ...cube,
        offset: [0, 0, 0],
      };
      cubesToProcess.push({
        cube: orientCubeFlat(rawCube),
        subOffset: cube.offset,
      });
    }
  }

  for (let i = 0; i < cubesToProcess.length; i++) {
    const item = cubesToProcess[i];
    const [ox, oy, oz] = item.subOffset;

    const worldOffX = (ox * cosY - oy * sinY) * scale;
    const worldOffY = (ox * sinY + oy * cosY) * scale;
    const worldOffZ = oz * scale;

    const partX = baseX + worldOffX;
    const partY = baseY + worldOffY;
    const partZ = baseZ + worldOffZ;

    let dx = partX - baseX;
    let dy = partY - baseY;
    let len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) {
      const rndAngle = Math.random() * Math.PI * 2;
      dx = Math.cos(rndAngle);
      dy = Math.sin(rndAngle);
      len = 1.0;
    }

    const blastSpeed = 0.035 + Math.random() * 0.075;
    const vx = (dx / len) * blastSpeed + (Math.random() - 0.5) * 0.025;
    const vy = (dy / len) * blastSpeed + (Math.random() - 0.5) * 0.025;
    const vz = 0.045 + Math.random() * 0.085;

    const debrisModel: PolyObjectModel = {
      id: `poly_gib_${modelId}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      name: `Gib ${i}`,
      cubes: [item.cube],
    };

    // Only assign soundId to 1-2 representative debris particles so we don't clutter audio with 30 concurrent sounds
    const particleSound = (i === 0 || i === Math.floor(cubesToProcess.length / 2)) ? debrisSound : undefined;

    const particle: PolyDebrisParticle = {
      id: debrisModel.id,
      baseX: partX,
      baseY: partY,
      baseZ: partZ,
      floorZ,
      vx,
      vy,
      vz,
      yaw: initialYaw + (Math.random() - 0.5) * 0.5,
      vYaw: (Math.random() - 0.5) * 0.3,
      scale,
      model: debrisModel,
      life: 14.0 + Math.random() * 6.0,
      maxLife: 20.0,
      landed: false,
      lightColor,
      soundId: particleSound,
      lastSoundTime: 0,
    };

    newDebris.push(particle);
    activePolyDebris.push(particle);
  }

  return newDebris;
}

/**
 * Updates physics for all active 3D poly debris particles.
 */
export function updatePolyDebris(
  dtSeconds: number = 0.016,
  grid?: Tile[][],
  mapWidth?: number,
  mapHeight?: number,
  onParticleBounce?: (p: any) => void
): void {
  if (activePolyDebris.length === 0) return;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPolyDebrisUpdateFrameTime < 8) {
    return;
  }
  lastPolyDebrisUpdateFrameTime = now;

  const gravity = 0.005;
  const drag = 0.96;
  let soundsPlayedThisFrame = 0;
  const MAX_SOUNDS_PER_FRAME = 2;

  let writeIndex = 0;
  for (let i = 0; i < activePolyDebris.length; i++) {
    const p = activePolyDebris[i];
    p.life -= dtSeconds;

    if (p.life <= 0) {
      continue;
    }

    if (!p.landed) {
      let collidedWithWall = false;

      if (grid && mapWidth && mapHeight) {
        const margin = 0.08;

        // X collision
        const nextX = p.baseX + p.vx;
        const checkX = p.vx > 0 ? nextX + margin : nextX - margin;
        const tx = Math.floor(checkX);
        const ty = Math.floor(p.baseY);

        if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
          const tile = grid[ty]?.[tx];
          if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN'))) {
            p.vx *= -0.5;
            collidedWithWall = true;
          } else {
            p.baseX = nextX;
          }
        } else {
          p.baseX = nextX;
        }

        // Y collision
        const nextY = p.baseY + p.vy;
        const checkY = p.vy > 0 ? nextY + margin : nextY - margin;
        const curTx = Math.floor(p.baseX);
        const tyY = Math.floor(checkY);

        if (curTx >= 0 && curTx < mapWidth && tyY >= 0 && tyY < mapHeight) {
          const tile = grid[tyY]?.[curTx];
          if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN'))) {
            p.vy *= -0.5;
            collidedWithWall = true;
          } else {
            p.baseY = nextY;
          }
        } else {
          p.baseY = nextY;
        }
      } else {
        p.baseX += p.vx;
        p.baseY += p.vy;
      }

      p.baseZ += p.vz;
      p.yaw += p.vYaw;
      p.vYaw *= 0.98;

      p.vx *= drag;
      p.vy *= drag;
      p.vz -= gravity;

      const tryPlayBounceSound = () => {
        if (!p.soundId || p.landed || !onParticleBounce || soundsPlayedThisFrame >= MAX_SOUNDS_PER_FRAME) return;
        const lastTime = p.lastSoundTime || 0;
        if (now - lastTime >= 120) {
          p.lastSoundTime = now;
          soundsPlayedThisFrame++;
          onParticleBounce({
            worldX: p.baseX,
            worldY: p.baseY,
            soundId: p.soundId,
            type: 'poly_debris'
          });
        }
      };

      if (collidedWithWall && Math.hypot(p.vx, p.vy) > 0.03) {
        tryPlayBounceSound();
      }

      if (p.baseZ <= p.floorZ) {
        p.baseZ = p.floorZ;
        if (Math.abs(p.vz) > 0.04) {
          p.vz = -p.vz * 0.35;
          p.vx *= 0.6;
          p.vy *= 0.6;
          p.vYaw *= 0.5;
          tryPlayBounceSound();
        } else {
          p.vz = 0;
          p.vx = 0;
          p.vy = 0;
          p.vYaw = 0;
          if (!p.landed) {
            p.landed = true;
            tryPlayBounceSound();
            p.soundId = undefined; // Ensure sound is never triggered again once landed
          }
        }
      }
    }

    activePolyDebris[writeIndex++] = p;
  }

  activePolyDebris.length = writeIndex;
}

/**
 * Returns active 3D poly debris as PolyObjectInstances to be rendered alongside map PolyObjects.
 */
export function getPolyDebrisInstances(
  posX: number,
  posY: number,
  shadingDist: number
): PolyObjectInstance[] {
  const instances: PolyObjectInstance[] = [];

  for (let i = 0; i < activePolyDebris.length; i++) {
    const p = activePolyDebris[i];
    if (p.life <= 0) continue;

    const distSq = (posX - p.baseX) ** 2 + (posY - p.baseY) ** 2;
    if (distSq > shadingDist * shadingDist * 2) continue;

    instances.push({
      baseX: p.baseX,
      baseY: p.baseY,
      sFloorHeight: p.baseZ,
      yOffset: 0,
      scale: p.scale,
      facing: p.yaw,
      model: p.model,
      lightColor: p.lightColor || { r: 1.0, g: 1.0, b: 1.0 },
      distSq,
    });
  }

  return instances;
}

/**
 * Clears all active 3D poly debris (e.g. on level load).
 */
export function clearPolyDebris(): void {
  activePolyDebris.length = 0;
}
