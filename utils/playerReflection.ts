
import { Player, Item } from '../types';

const trimCanvas = (c: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const pixels = ctx.getImageData(0, 0, c.width, c.height);
  const l = pixels.data.length;
  let top = null, left = null, right = null, bottom = null;
  
  for (let i = 0; i < l; i += 4) {
    if (pixels.data[i + 3] !== 0) {
      const x = (i / 4) % c.width;
      const y = Math.floor((i / 4) / c.width);
      if (top === null) top = y;
      if (left === null || x < left) left = x;
      if (right === null || x > right) right = x;
      if (bottom === null || y > bottom) bottom = y;
    }
  }
  
  if (top === null || bottom === null || left === null || right === null) return c;
  
  const trimHeight = bottom - top + 1;
  const trimWidth = right - left + 1;
  const trimmed = document.createElement('canvas');
  trimmed.width = trimWidth;
  trimmed.height = trimHeight;
  const tCtx = trimmed.getContext('2d');
  if (tCtx) {
     tCtx.drawImage(c, left, top, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);
  }
  return trimmed;
};

/**
 * Generates a dynamic player sprite by layering equipment over a base doll.
 * Returns a canvas containing the rendered player.
 */
export const generatePlayerReflectionSprite = (
  player: Player,
  spriteMap: Map<string, HTMLImageElement>
): HTMLCanvasElement | null => {
  if (!player || !player.equipment) return null;
  
  const characterId = player.characterId;
  const baseDollId = characterId === 'female' ? 'FEMALE_DOLL' : 'MALE_DOLL';
  const baseImg = spriteMap.get(baseDollId);

  if (!baseImg) return null;

  // Create a canvas with the base doll's dimensions
  let canvas = document.createElement('canvas');
  canvas.width = baseImg.width;
  canvas.height = baseImg.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Draw base doll
  ctx.drawImage(baseImg, 0, 0);

  // Get all equipped items and sort them by zIndex
  // We use a stable sort or ensure zIndex is always present
  const equippedLayers = Object.values(player.equipment)
    .filter((item): item is Item => item !== null)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  equippedLayers.forEach(item => {
    if (!item.dollAssetId) return;
    
    const img = spriteMap.get(item.dollAssetId);
    if (!img) return;

    let xOffset = 0;
    let yOffset = 0;
    if (characterId === 'male') {
      xOffset = item.maleOffsetX || 0;
      yOffset = item.maleOffsetY || 0;
    } else {
      xOffset = item.femaleOffsetX || 0;
      yOffset = item.femaleOffsetY || 0;
    }
    ctx.drawImage(img, xOffset, yOffset);
  });

  // Trim to tightly fit the character sprite and place the origin precisely
  canvas = trimCanvas(canvas);

  // Add a version property to help with cache busting in SpriteCache
  const equipmentKey = JSON.stringify(player.equipment);
  (canvas as any).version = `player_ref_${player.characterId}_${equipmentKey}`;

  return canvas;
};
