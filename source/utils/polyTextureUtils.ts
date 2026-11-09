import { ASSETS } from '../assets';
import { FaceTextureTransform, TextureLayer } from '../types';

export interface PolyTextureEntry {
  id: string;
  name: string;
  category: 'texture' | 'sprite';
  url: string;
}

// Built-in map of readable Russian labels for game textures
const TEXTURE_LABELS: Record<string, string> = {
  WOOD: 'Дерево (Wood)',
  CRATE: 'Деревянный ящик (Crate)',
  BRICKS: 'Кирпичная кладка (Bricks)',
  METALL: 'Металл (Metall)',
  CONCRETE_FLOOR: 'Бетонный пол (Concrete Floor)',
  CONCRETE_SLAB: 'Бетонная плита (Concrete Slab)',
  CONCRETE2: 'Бетон (Concrete)',
  INTERIOR_CONCRETE: 'Интерьерный бетон',
  WALL: 'Каменная стена (Wall)',
  WALL_PANELS: 'Стеновые панели (Panels)',
  WALL_TILES: 'Плитка стеновая (Tiles)',
  WALL_PLASTER: 'Штукатурка (Plaster)',
  WALL_ROCKS: 'Камень (Rocks)',
  WALL_WHITE_TILES: 'Белая плитка',
  CERAMIC_TILES: 'Керамогранит',
  CERAMIC_TILES_SINK: 'Раковина / Плитка',
  LINOLEUM: 'Линолеум (Linoleum)',
  LINOLEUM2: 'Линолеум узорчатый',
  RUBBER: 'Резина (Rubber)',
  ASPHALT: 'Асфальт (Asphalt)',
  ASPHALT_ROAD: 'Дорожный асфальт',
  ASPHALT_PEDESTRIAN: 'Пешеходный асфальт',
  PAVEMENT_TILES: 'Тротуарная плитка',
  DIRT: 'Грунт / Земля (Dirt)',
  GRASS: 'Трава (Grass)',
  LEAVES: 'Листва (Leaves)',
  CEILING: 'Потолок (Ceiling)',
  CEILING_TILES: 'Потолочная плитка',
  CEILING_TILES_LIGHT: 'Потолок со светильником',
  YELLOW1: 'Желтый фасад (Yellow 1)',
  YELLOW2: 'Желтый фасад 2 (Yellow 2)',
  WINDOW_GLASS: 'Стекло (Glass)',
  GLASS_DOOR: 'Стеклянная дверь',
  DOOR: 'Дверь (Door)',
  SHELF1: 'Полка 1 (Shelf 1)',
  SHELF2: 'Полка 2 (Shelf 2)',
  SHELF3: 'Полка 3 (Shelf 3)',
  BAR_SHELF1: 'Барная стойка 1',
  BAR_SHELF2: 'Барная стойка 2',
  WATER: 'Вода (Water)',
  SKY: 'Скайбокс (Skybox)',
};

/**
 * Get all available textures and sprites for PolyObjects from assets.ts
 */
export function getAvailablePolyTextures(): PolyTextureEntry[] {
  const list: PolyTextureEntry[] = [];

  if (ASSETS && ASSETS.TEXTURES) {
    Object.entries(ASSETS.TEXTURES).forEach(([key, url]) => {
      list.push({
        id: key,
        name: TEXTURE_LABELS[key] || key,
        category: 'texture',
        url: url as string,
      });
    });
  }

  if (ASSETS && ASSETS.SPRITES) {
    Object.entries(ASSETS.SPRITES).forEach(([key, url]) => {
      // Exclude base64 massive data or internal system strings if any
      if (typeof url === 'string' && !key.startsWith('MENU_PARALLAX') && !key.includes('FRAME')) {
        list.push({
          id: key,
          name: `Спрайт: ${key}`,
          category: 'sprite',
          url: url as string,
        });
      }
    });
  }

  return list;
}

// Global runtime image cache for loaded textures
const polyImageCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();
const compositeCanvasCache = new Map<string, HTMLCanvasElement>();

/**
 * Generate a deterministic key for a composite texture (base + decal layers)
 */
export function getCompositeTextureKey(
  baseTextureId: string | null | undefined,
  layers: TextureLayer[] | null | undefined
): string {
  const enabledLayers = layers ? layers.filter(l => l && l.enabled !== false && l.textureId) : [];
  if (enabledLayers.length === 0) {
    return baseTextureId || '';
  }
  return `composite:${baseTextureId || 'none'}:${JSON.stringify(enabledLayers)}`;
}

export function clearCompositeCanvasCache() {
  compositeCanvasCache.clear();
}

/**
 * Generates an offscreen composite Canvas containing the base texture and all decal layers.
 */
export function getCompositePolyTextureCanvas(
  baseTextureId: string | null | undefined,
  layers: TextureLayer[] | null | undefined,
  spriteMap?: Map<string, HTMLImageElement | HTMLCanvasElement>
): HTMLCanvasElement | HTMLImageElement | null {
  const enabledLayers = layers ? layers.filter(l => l && l.enabled !== false && l.textureId) : [];
  if (enabledLayers.length === 0) {
    return baseTextureId ? getPolyTextureImage(baseTextureId, spriteMap) : null;
  }

  const compositeKey = getCompositeTextureKey(baseTextureId, enabledLayers);

  if (compositeCanvasCache.has(compositeKey)) {
    return compositeCanvasCache.get(compositeKey)!;
  }

  let allImagesLoaded = true;

  // 1. Base Texture
  let baseImg: HTMLImageElement | HTMLCanvasElement | null = null;
  if (baseTextureId) {
    baseImg = getPolyTextureImage(baseTextureId, spriteMap);
    if (!baseImg || ((baseImg as HTMLImageElement).complete === false && !(baseImg as HTMLCanvasElement).width)) {
      allImagesLoaded = false;
    }
  }

  // 2. Layer Textures
  const layerImgs: (HTMLImageElement | HTMLCanvasElement | null)[] = [];
  for (let i = 0; i < enabledLayers.length; i++) {
    const lImg = getPolyTextureImage(enabledLayers[i].textureId, spriteMap);
    layerImgs.push(lImg);
    if (!lImg || ((lImg as HTMLImageElement).complete === false && !(lImg as HTMLCanvasElement).width)) {
      allImagesLoaded = false;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Render Base Texture if available
  if (baseImg) {
    ctx.drawImage(baseImg, 0, 0, 256, 256);
  }

  // Render Sticker / Decal Layers in order
  for (let i = 0; i < enabledLayers.length; i++) {
    const layer = enabledLayers[i];
    const layerImg = layerImgs[i];
    if (!layerImg) continue;

    ctx.save();
    const alpha = layer.opacity !== undefined ? Math.max(0, Math.min(1, layer.opacity)) : 1.0;
    if (alpha < 0.999) {
      ctx.globalAlpha = alpha;
    }
    if (layer.blendMode) {
      ctx.globalCompositeOperation = layer.blendMode;
    }

    const t = layer.transform || {};
    const scaleU = t.scaleU ?? 1.0;
    const scaleV = t.scaleV ?? 1.0;
    const offsetU = t.offsetU ?? 0.0;
    const offsetV = t.offsetV ?? 0.0;
    const rotation = t.rotation ?? 0;
    // Invert flip logic for decals/stickers in the editor & renderer
    const flipU = !(t.flipU ?? false);
    const flipV = !(t.flipV ?? false);

    ctx.translate(128 + offsetU * 256, 128 + offsetV * 256);
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }
    ctx.scale((flipU ? -1 : 1) * scaleU, (flipV ? -1 : 1) * scaleV);
    ctx.drawImage(layerImg, -128, -128, 256, 256);
    ctx.restore();
  }

  if (allImagesLoaded) {
    compositeCanvasCache.set(compositeKey, canvas);
  }

  return canvas;
}

type TextureLoadListener = (textureId: string) => void;
const textureLoadListeners = new Set<TextureLoadListener>();

/**
 * Subscribe to texture loading completion events.
 */
export function subscribeTextureLoaded(listener: TextureLoadListener): () => void {
  textureLoadListeners.add(listener);
  return () => {
    textureLoadListeners.delete(listener);
  };
}

function notifyTextureLoaded(textureId: string) {
  compositeCanvasCache.clear();
  textureLoadListeners.forEach((listener) => {
    try {
      listener(textureId);
    } catch (e) {
      console.error('Error in texture load listener:', e);
    }
  });
}

/**
 * Resolve the image URL for a given textureId synchronously.
 */
export function getPolyTextureUrl(textureId: string | undefined | null): string | null {
  if (!textureId || typeof textureId !== 'string') return null;

  let url =
    (ASSETS.TEXTURES as any)?.[textureId] ||
    (ASSETS.TEXTURES as any)?.[textureId.toUpperCase()] ||
    (ASSETS.TEXTURES as any)?.[textureId.replace(/^TEX_/, '')] ||
    (ASSETS.SPRITES as any)?.[textureId] ||
    (ASSETS.SPRITES as any)?.[textureId.toUpperCase()];

  if (!url) {
    if (textureId.startsWith('local://')) {
      url = localStorage.getItem(textureId.substring(8)) || null;
    } else if (
      textureId.startsWith('data:') ||
      textureId.startsWith('http://') ||
      textureId.startsWith('https://') ||
      textureId.startsWith('/')
    ) {
      url = textureId;
    }
  }

  return url || null;
}

/**
 * Synchronously or asynchronously retrieve loaded texture HTMLImageElement.
 */
export function getPolyTextureImage(
  textureId: string,
  spriteMap?: Map<string, HTMLImageElement | HTMLCanvasElement>
): HTMLImageElement | HTMLCanvasElement | null {
  if (!textureId) return null;

  // 0. Check composite texture keys
  if (textureId.startsWith('composite:')) {
    if (compositeCanvasCache.has(textureId)) {
      return compositeCanvasCache.get(textureId)!;
    }
    const firstColon = textureId.indexOf(':', 10);
    if (firstColon !== -1) {
      const baseTex = textureId.substring(10, firstColon);
      const layersJson = textureId.substring(firstColon + 1);
      try {
        const layers = JSON.parse(layersJson);
        return getCompositePolyTextureCanvas(baseTex === 'none' ? null : baseTex, layers, spriteMap);
      } catch (e) {
        console.error('Failed to parse composite texture layers:', e);
      }
    }
  }

  // 1. Check spriteMap
  if (spriteMap) {
    let img = spriteMap.get(textureId) || spriteMap.get(`TEX_${textureId}`);
    if (img && ((img as any).complete || (img as any).naturalWidth > 0 || img.width > 0)) return img;
  }

  // 2. Check local image cache
  if (polyImageCache.has(textureId)) {
    const img = polyImageCache.get(textureId)!;
    if (img.complete && img.naturalWidth > 0) return img;
  }

  // 3. Initiate loading if URL exists
  const url = getPolyTextureUrl(textureId);

  if (url && !loadingPromises.has(textureId)) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    polyImageCache.set(textureId, img);

    const p = new Promise<HTMLImageElement>((resolve) => {
      img.onload = () => {
        notifyTextureLoaded(textureId);
        resolve(img);
      };
      img.onerror = () => {
        notifyTextureLoaded(textureId);
        resolve(img);
      };
    });

    loadingPromises.set(textureId, p);
    img.src = url;
  }

  const cached = polyImageCache.get(textureId);
  return cached && cached.complete && cached.naturalWidth > 0 ? cached : null;
}

/**
 * Fast Affine Textured Triangle Renderer for Canvas 2D.
 * Draws triangle (x0,y0), (x1,y1), (x2,y2) mapped from texture (u0,v0), (u1,v1), (u2,v2).
 */
function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  x0: number, y0: number, u0: number, v0: number,
  x1: number, y1: number, u1: number, v1: number,
  x2: number, y2: number, u2: number, v2: number
) {
  if (!img) return;
  const w = (img as any).naturalWidth || img.width || 0;
  const h = (img as any).naturalHeight || img.height || 0;
  if (w <= 0 || h <= 0) return;

  const su0 = u0 * w; const sv0 = v0 * h;
  const su1 = u1 * w; const sv1 = v1 * h;
  const su2 = u2 * w; const sv2 = v2 * h;

  const denom = su0 * (sv1 - sv2) + su1 * (sv2 - sv0) + su2 * (sv0 - sv1);
  if (Math.abs(denom) < 1e-5) return;

  const m11 = (x0 * (sv1 - sv2) + x1 * (sv2 - sv0) + x2 * (sv0 - sv1)) / denom;
  const m12 = (y0 * (sv1 - sv2) + y1 * (sv2 - sv0) + y2 * (sv0 - sv1)) / denom;
  const m21 = (x0 * (su2 - su1) + x1 * (su0 - su2) + x2 * (su1 - su0)) / denom;
  const m22 = (y0 * (su2 - su1) + y1 * (su0 - su2) + y2 * (su1 - su0)) / denom;
  const dx  = (x0 * (su1 * sv2 - su2 * sv1) + x1 * (su2 * sv0 - su0 * sv2) + x2 * (su0 * sv1 - su1 * sv0)) / denom;
  const dy  = (y0 * (su1 * sv2 - su2 * sv1) + y1 * (su2 * sv0 - su0 * sv2) + y2 * (su0 * sv1 - su1 * sv0)) / denom;

  if (
    !isFinite(m11) ||
    !isFinite(m12) ||
    !isFinite(m21) ||
    !isFinite(m22) ||
    !isFinite(dx) ||
    !isFinite(dy)
  ) {
    return;
  }

  try {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  } catch (e) {
    // Ignore drawing errors if image is in transition
  }
}

/**
 * Computes 3D object-space UV coordinates for an N-point planar polygon face in 3D.
 * Invariant to camera movement and rotation.
 */
export function computeFaceUVs(verts3D: [number, number, number][]): [number, number][] {
  if (!verts3D || verts3D.length < 3) return [];
  const N = verts3D.length;

  // 1. Calculate 3D normal via Newell's method
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < N; i++) {
    const curr = verts3D[i];
    const next = verts3D[(i + 1) % N];
    nx += (curr[1] - next[1]) * (curr[2] + next[2]);
    ny += (curr[2] - next[2]) * (curr[0] + next[0]);
    nz += (curr[0] - next[0]) * (curr[1] + next[1]);
  }
  const nLen = Math.hypot(nx, ny, nz);
  const norm: [number, number, number] = nLen > 1e-6 ? [nx / nLen, ny / nLen, nz / nLen] : [0, 0, 1];

  // 2. Determine local U axis along first edge (or first non-zero edge)
  let uAxis: [number, number, number] = [1, 0, 0];
  let eX = verts3D[1][0] - verts3D[0][0];
  let eY = verts3D[1][1] - verts3D[0][1];
  let eZ = verts3D[1][2] - verts3D[0][2];
  let eLen = Math.hypot(eX, eY, eZ);
  if (eLen < 1e-6) {
    for (let i = 1; i < N; i++) {
      const nextIdx = (i + 1) % N;
      eX = verts3D[nextIdx][0] - verts3D[i][0];
      eY = verts3D[nextIdx][1] - verts3D[i][1];
      eZ = verts3D[nextIdx][2] - verts3D[i][2];
      eLen = Math.hypot(eX, eY, eZ);
      if (eLen > 1e-6) break;
    }
  }
  if (eLen > 1e-6) {
    uAxis = [eX / eLen, eY / eLen, eZ / eLen];
  } else if (Math.abs(norm[2]) < 0.9) {
    const ux = norm[1], uy = -norm[0];
    const uL = Math.hypot(ux, uy);
    if (uL > 1e-6) uAxis = [ux / uL, uy / uL, 0];
  } else {
    const uy = norm[2], uz = -norm[1];
    const uL = Math.hypot(uy, uz);
    if (uL > 1e-6) uAxis = [0, uy / uL, uz / uL];
  }

  // 3. V axis = norm x uAxis
  const vAxis: [number, number, number] = [
    norm[1] * uAxis[2] - norm[2] * uAxis[1],
    norm[2] * uAxis[0] - norm[0] * uAxis[2],
    norm[0] * uAxis[1] - norm[1] * uAxis[0],
  ];

  // 4. Project vertices onto uAxis and vAxis relative to origin (verts3D[0])
  const uRaws: number[] = new Array(N);
  const vRaws: number[] = new Array(N);
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;

  const v0 = verts3D[0];
  for (let i = 0; i < N; i++) {
    const dx = verts3D[i][0] - v0[0];
    const dy = verts3D[i][1] - v0[1];
    const dz = verts3D[i][2] - v0[2];

    const uVal = dx * uAxis[0] + dy * uAxis[1] + dz * uAxis[2];
    const vVal = dx * vAxis[0] + dy * vAxis[1] + dz * vAxis[2];

    uRaws[i] = uVal;
    vRaws[i] = vVal;

    if (uVal < minU) minU = uVal;
    if (uVal > maxU) maxU = uVal;
    if (vVal < minV) minV = vVal;
    if (vVal > maxV) maxV = vVal;
  }

  const rangeU = Math.max(1e-5, maxU - minU);
  const rangeV = Math.max(1e-5, maxV - minV);

  const uvs: [number, number][] = new Array(N);
  for (let i = 0; i < N; i++) {
    uvs[i] = [
      (uRaws[i] - minU) / rangeU,
      (vRaws[i] - minV) / rangeV,
    ];
  }

  return uvs;
}

/**
 * Applies scale, offset, rotation, and flip transformations to face UV coordinates.
 */
export function applyTextureTransformToUVs(
  uvs: [number, number][] | undefined,
  transform?: FaceTextureTransform
): [number, number][] {
  if (!uvs || uvs.length === 0) return [];
  if (!transform) return uvs;

  const scaleU = transform.scaleU !== undefined ? transform.scaleU : 1.0;
  const scaleV = transform.scaleV !== undefined ? transform.scaleV : 1.0;
  const offsetU = transform.offsetU || 0.0;
  const offsetV = transform.offsetV || 0.0;
  const rotation = transform.rotation || 0.0;
  const flipU = !!transform.flipU;
  const flipV = !!transform.flipV;

  if (
    scaleU === 1.0 &&
    scaleV === 1.0 &&
    offsetU === 0.0 &&
    offsetV === 0.0 &&
    rotation === 0.0 &&
    !flipU &&
    !flipV
  ) {
    return uvs;
  }

  const rad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  return uvs.map(([u, v]) => {
    // Center UV coordinates around 0.5 for scaling/rotating from face center
    let cu = u - 0.5;
    let cv = v - 0.5;

    // Apply horizontal & vertical flips
    if (flipU) cu = -cu;
    if (flipV) cv = -cv;

    // Apply texture scaling (inversive so scale 0.5 shrinks the decal and scale 2.0 expands it)
    const sU = scaleU !== 0 ? scaleU : 1.0;
    const sV = scaleV !== 0 ? scaleV : 1.0;
    cu /= sU;
    cv /= sV;

    // Apply rotation around center
    const ru = cu * cosR - cv * sinR;
    const rv = cu * sinR + cv * cosR;

    // Shift offset and return to [0..1] range
    return [ru + 0.5 - offsetU, rv + 0.5 - offsetV];
  });
}

/**
 * Draws a 3+ point polygon on Canvas 2D with affine texture mapping, multi-layer decals, and side/light shading.
 */
export function drawTexturedPolygonCanvas(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  uvs: [number, number][] | undefined,
  img: HTMLImageElement | HTMLCanvasElement | null,
  sideShade: number = 1.0,
  lightColor?: { r: number; g: number; b: number },
  layers?: TextureLayer[] | null,
  spriteMap?: Map<string, HTMLImageElement | HTMLCanvasElement>,
  rawUVs?: [number, number][],
  isEditorPreview: boolean = false
) {
  if (!pts || pts.length < 3) return;

  const N = pts.length;
  const baseUVs = (uvs && uvs.length === N) ? uvs : (
    (rawUVs && rawUVs.length === N) ? rawUVs : (
      N === 4
        ? [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]
        : Array.from({ length: N }, (_, i) => [i / N, (i % 2)]) as [number, number][]
    )
  );

  const unscaledUVs = (rawUVs && rawUVs.length === N) ? rawUVs : baseUVs;

  // 1. Draw base texture if present
  if (img) {
    for (let i = 1; i < N - 1; i++) {
      drawAffineTriangle(
        ctx, img,
        pts[0][0], pts[0][1], baseUVs[0][0], baseUVs[0][1],
        pts[i][0], pts[i][1], baseUVs[i][0], baseUVs[i][1],
        pts[i + 1][0], pts[i + 1][1], baseUVs[i + 1][0], baseUVs[i + 1][1]
      );
    }
  }

  // 2. Draw texture overlay layers (stickers / decals) in Z-order
  if (layers && layers.length > 0) {
    for (let l = 0; l < layers.length; l++) {
      const layer = layers[l];
      if (!layer || layer.enabled === false || !layer.textureId) continue;

      const layerImg = getPolyTextureImage(layer.textureId, spriteMap);
      if (!layerImg) continue;

      const rawFlipU = layer.transform?.flipU ?? false;
      const rawFlipV = layer.transform?.flipV ?? false;
      const effectiveFlipU = isEditorPreview ? rawFlipU : !rawFlipU;
      const effectiveFlipV = !rawFlipV;
      const rawOffsetU = layer.transform?.offsetU ?? 0.0;
      const rawOffsetV = layer.transform?.offsetV ?? 0.0;
      const effectiveOffsetU = isEditorPreview
        ? (rawFlipU ? rawOffsetU : -rawOffsetU)
        : rawOffsetU;
      const effectiveOffsetV = isEditorPreview
        ? (rawFlipV ? rawOffsetV : -rawOffsetV)
        : rawOffsetV;
      const rawRotation = layer.transform?.rotation ?? 0;
      const effectiveRotation = isEditorPreview
        ? (effectiveFlipU === effectiveFlipV ? rawRotation : -rawRotation)
        : rawRotation;

      const layerTransform = layer.transform ? {
        ...layer.transform,
        flipU: effectiveFlipU,
        flipV: effectiveFlipV,
        offsetU: effectiveOffsetU,
        offsetV: effectiveOffsetV,
        rotation: effectiveRotation,
      } : {
        flipU: isEditorPreview ? false : true,
        flipV: true,
        offsetU: effectiveOffsetU,
        offsetV: effectiveOffsetV,
        rotation: effectiveRotation,
      };
      const layerUVs = applyTextureTransformToUVs(unscaledUVs, layerTransform);
      const alpha = layer.opacity !== undefined ? Math.max(0, Math.min(1, layer.opacity)) : 1.0;

      ctx.save();
      if (alpha < 0.999) {
        ctx.globalAlpha = alpha;
      }
      if (layer.blendMode) {
        ctx.globalCompositeOperation = layer.blendMode;
      }

      for (let i = 1; i < N - 1; i++) {
        drawAffineTriangle(
          ctx, layerImg,
          pts[0][0], pts[0][1], layerUVs[0][0], layerUVs[0][1],
          pts[i][0], pts[i][1], layerUVs[i][0], layerUVs[i][1],
          pts[i + 1][0], pts[i + 1][1], layerUVs[i + 1][0], layerUVs[i + 1][1]
        );
      }
      ctx.restore();
    }
  }

  // 3. Apply light & side shading overlay if not full brightness
  const lr = lightColor ? lightColor.r : 1.0;
  const lg = lightColor ? lightColor.g : 1.0;
  const lb = lightColor ? lightColor.b : 1.0;
  const totalShade = sideShade * Math.min(1.0, (lr + lg + lb) / 3);

  if (totalShade < 0.98) {
    try {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      const darkAlpha = Math.max(0, 1.0 - totalShade);
      ctx.fillStyle = `rgba(0,0,0,${darkAlpha.toFixed(2)})`;
      ctx.fill();
      ctx.restore();
    } catch (e) {
      // Ignore shading overlay error
    }
  }
}

export function drawTexturedQuadCanvas(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  img: HTMLImageElement | HTMLCanvasElement,
  sideShade: number = 1.0,
  lightColor?: { r: number; g: number; b: number },
  uvs?: [number, number][]
) {
  drawTexturedPolygonCanvas(ctx, pts, uvs, img, sideShade, lightColor);
}
