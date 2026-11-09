import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize, Lightbulb, RotateCw } from 'lucide-react';
import { LevelDefinition } from '../../types';
import { ASSETS } from '../../assets';
import { getPreviewSrc } from './levelBuilderUtils';
import animationsData from '../../data/animations.json';
import { getPolyModelById } from '../../data/polyModels';
import { drawPolyObjectIsometricCanvas } from '../../utils/polyObjectIsoRenderer';

interface IsometricViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  level: LevelDefinition;
  currentFloor: number;
  uiStrings: any;
  engine: any;
  lightMap?: {r:number,g:number,b:number}[][] | null;
}

export const IsometricViewModal: React.FC<IsometricViewModalProps> = ({
  isOpen,
  onClose,
  level,
  currentFloor,
  uiStrings,
  engine,
  lightMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const spriteTintCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [renderTick, forceRender] = useState({});
  const [showLighting, setShowLighting] = useState(true);
  const [isoFloor, setIsoFloor] = useState(0);
  const [rotation, setRotation] = useState(0);

  const mapCoords = (rx: number, ry: number, cols: number, rows: number, rot: number) => {
      switch (rot) {
          case 0: return { x: rx, y: ry };
          case 1: return { x: ry, y: rows - 1 - rx };
          case 2: return { x: cols - 1 - rx, y: rows - 1 - ry };
          case 3: return { x: cols - 1 - ry, y: rx };
          default: return { x: rx, y: ry };
      }
  };

  const rotateOffset = (ox: number, oy: number, rot: number) => {
      switch (rot) {
          case 0: return { rox: ox, roy: oy };
          case 1: return { rox: -oy, roy: ox };
          case 2: return { rox: -ox, roy: -oy };
          case 3: return { rox: oy, roy: -ox };
          default: return { rox: ox, roy: oy };
      }
  };

  useEffect(() => {
    if (isOpen) setIsoFloor(0);
  }, [isOpen]);

  const TILE_W = 64;
  const TILE_H = 32;
  const WALL_H = 48;

  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Allow high DPI and resizing
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    if (!level.grids || level.grids.length === 0) return;
    
    // We will get rows/cols from current floor, assuming they are similar, or calculate per floor
    const currentGrid = level.grids[currentFloor] || level.grids[0];
    const baseRows = currentGrid.length;
    const baseCols = currentGrid[0]?.length || 0;
    const rotatedBaseCols = rotation % 2 === 0 ? baseCols : baseRows;
    const rotatedBaseRows = rotation % 2 === 0 ? baseRows : baseCols;

    // Center calculation
    const mapWidth = (rotatedBaseCols + rotatedBaseRows) * (TILE_W / 2);
    const mapHeight = (rotatedBaseCols + rotatedBaseRows) * (TILE_H / 2);
    
    const centerX = width / 2 + offset.x;
    const centerY = height / 2 - mapHeight / 2 + offset.y + 100;

    const constructionMap = new Map();
    level.construction?.forEach(c => constructionMap.set(c.symbol, c));

    const itemMap = new Map();
    level.items?.forEach(i => { itemMap.set(i.symbol, i); itemMap.set(i.id, i); });

    const enemyMap = new Map();
    level.enemies?.forEach(e => { enemyMap.set(e.symbol, e); enemyMap.set(e.id, e); });

    const npcMap = new Map();
    level.NPCs?.forEach((n: any) => { npcMap.set(n.symbol, n); npcMap.set(n.id, n); });

    const decMap = new Map();
    level.decorations?.forEach(d => { decMap.set(d.symbol, d); decMap.set(d.id, d); });

    const portMap = new Map();
    level.portals?.forEach(p => portMap.set(p.symbol, p));

    const doorDefMap = level.doorDefinitions || {};

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);

    const getImgFromUrl = (url: string | undefined): any => {
        if (!url) return undefined;
        if (imageCacheRef.current.has(url)) {
            return imageCacheRef.current.get(url);
        }
        
        const img = new Image();
        if (url.startsWith('local://')) {
            const dataUrl = localStorage.getItem(url.substring(8));
            if (dataUrl) img.src = dataUrl;
        } else {
            img.src = url;
            img.crossOrigin = "Anonymous";
        }
        
        imageCacheRef.current.set(url, img);
        img.onload = () => {
            forceRender({});
        };
        
        return undefined;
    };

    const getImg = (assetId: string | undefined, isSprite = false): any => {
        if (!assetId) return undefined;
        
        // Use engine cache directly if available for reliable textures/sprites
        if (engine && engine.spriteMap && engine.spriteMap[assetId]) {
            const cached = engine.spriteMap[assetId];
            if (cached instanceof HTMLImageElement || cached instanceof HTMLCanvasElement) {
                return cached;
            }
        }

        let url = getPreviewSrc(assetId);

        if (!url) {
             // In some cases, assetId is already a URL or 'local://...'
             if (assetId.startsWith('data:') || assetId.startsWith('local://') || assetId.startsWith('http')) {
                  url = assetId;
             } else {
                  return undefined;
             }
        }
        return getImgFromUrl(url);
    };

    const getScaleInfo = (ent: string) => {
         let scale = 1.0;
         let assetId = undefined;
         let fallBackColor = '#f56565';
         let renderMode = undefined;
         let wallSide = undefined;
         let offsetX = 0;
         let offsetY = 0;
         let meshWidth = undefined;
         let isBox = false;
         let boxSize = 1.0;
         let polyModelId: string | undefined = undefined;
         
         const itemDef = itemMap.get(ent);
         const enemyDef = enemyMap.get(ent);
         const npcDef = npcMap.get(ent);
         const decDef = decMap.get(ent);
         
         if (itemDef) {
              const gbDef = engine?.itemsDb?.[itemDef.id];
              if (gbDef?.scale) scale = gbDef.scale;
              else if (itemDef.scale) scale = itemDef.scale;
              assetId = itemDef.assetId || gbDef?.assetId || itemDef.id.toUpperCase();
              fallBackColor = '#4299e1'; // blue for items
              if (gbDef?.renderMode) renderMode = gbDef.renderMode;
              else if (itemDef.renderMode) renderMode = itemDef.renderMode;
              if (gbDef?.wallSide) wallSide = gbDef.wallSide;
              else if (itemDef.wallSide) wallSide = itemDef.wallSide;
              offsetX = itemDef.worldOffsetX || gbDef?.worldOffsetX || 0;
              offsetY = itemDef.worldOffsetY || gbDef?.worldOffsetY || 0;
         } else if (enemyDef) {
              const gbDef = engine?.enemiesDb?.[enemyDef.id];
              if (gbDef?.scale) scale = gbDef.scale;
              else if (enemyDef.scale) scale = enemyDef.scale;
              assetId = gbDef?.assets?.map?.assetId || gbDef?.assets?.portrait?.assetId || gbDef?.assets?.portrait || gbDef?.texture || enemyDef.texture || enemyDef.assetId;
              if (typeof assetId === 'object' && assetId !== null) assetId = assetId.assetId;
              fallBackColor = '#f56565'; // red for enemies
              offsetX = enemyDef.worldOffsetX || gbDef?.worldOffsetX || 0;
              offsetY = enemyDef.worldOffsetY || gbDef?.worldOffsetY || 0;
         } else if (npcDef) {
              const gbDef = engine?.npcsDb?.[npcDef.id];
              if (gbDef?.scale) scale = gbDef.scale;
              else if (npcDef.scale) scale = npcDef.scale;
              assetId = gbDef?.assets?.map?.assetId || gbDef?.assets?.portrait?.assetId || gbDef?.assets?.portrait || gbDef?.texture || npcDef.texture || npcDef.assetId;
              if (typeof assetId === 'object' && assetId !== null) assetId = assetId.assetId;
              fallBackColor = '#48bb78'; // green for npcs
              offsetX = npcDef.worldOffsetX || gbDef?.worldOffsetX || 0;
              offsetY = npcDef.worldOffsetY || gbDef?.worldOffsetY || 0;
         } else if (decDef) {
              const gbDef = engine?.decorationsDb?.[decDef.id || decDef.type || ''];
              if (gbDef?.scale) scale = gbDef.scale;
              else if (decDef.scale) scale = decDef.scale;
              assetId = decDef.assetId || gbDef?.assetId || gbDef?.texture || decDef.texture;
              fallBackColor = '#a0aec0'; // gray for decs
              if (gbDef?.renderMode) renderMode = gbDef.renderMode;
              else if (decDef.renderMode) renderMode = decDef.renderMode;
              if (gbDef?.wallSide) wallSide = gbDef.wallSide;
              else if (decDef.wallSide) wallSide = decDef.wallSide;
              offsetX = decDef.worldOffsetX || gbDef?.worldOffsetX || 0;
              offsetY = decDef.worldOffsetY || gbDef?.worldOffsetY || 0;
              meshWidth = decDef.meshWidth || gbDef?.meshWidth;
               
               const meshAxis = decDef.meshAxis || gbDef?.meshAxis || 'AUTO';
               const meshOffset = decDef.meshOffset !== undefined ? decDef.meshOffset : gbDef?.meshOffset;
               const preserveAspect = decDef.preserveAspect || gbDef?.preserveAspect;

               if (renderMode === 'mesh') {
                   let finalAxis = meshAxis;
                   if (finalAxis === 'AUTO') {
                       const ws = wallSide;
                       if (ws === 'N' || ws === 'S') {
                           finalAxis = 'NS';
                       } else if (ws === 'E' || ws === 'W') {
                           finalAxis = 'WE';
                       } else {
                           finalAxis = 'NS';
                       }
                   }

                   const offsetVal = meshOffset !== undefined ? meshOffset : 0.5;

                   if (finalAxis === 'Y') {
                    offsetX = 0;
                    offsetY = 0;
                    wallSide = 'BOTTOM';
                } else if (finalAxis === 'NS') {
                    offsetX = 0;
                    offsetY = -0.5 + offsetVal;
                    wallSide = 'S';
                } else {
                    offsetX = -0.5 + offsetVal;
                    offsetY = 0;
                    wallSide = 'E';
                }

                const img = getImg(assetId, true);
                if (preserveAspect && img && img.width && img.height) {
                    meshWidth = scale * (img.width / img.height);
                } else {
                    meshWidth = decDef.meshWidth || gbDef?.meshWidth || (finalAxis === 'Y' ? scale : 1.0);
                }
               }
              isBox = decDef.isBox || gbDef?.isBox || false;
              boxSize = decDef.boxSize || gbDef?.boxSize || 1.0;
              polyModelId = (decDef as any)?.polyModelId || (gbDef as any)?.polyModelId;
         }

         if (assetId && typeof assetId === 'string' && (animationsData as any)[assetId]) {
              const anim = (animationsData as any)[assetId];
              if (anim.scale) {
                   scale *= anim.scale;
              }
              if (anim.frames && anim.frames.length > 0) {
                   assetId = anim.frames[0];
              }
         }

         return { assetId, scale, fallBackColor, renderMode, wallSide, offsetX, offsetY, meshWidth, isBox, boxSize, polyModelId };
    };

    const floorImg = getImg('FLOOR');
    const wallImg = getImg('WALL');
    const ceilingImg = getImg('CEILING');
    const doorImg = getImg('DOOR');

    const applyLight = (lightX: number, lightY: number, alpha: number, enableLighting: boolean = true) => {
        if (enableLighting && showLighting && lightMap) {
            let rL = 0.4, gL = 0.4, bL = 0.4; // Brighter floor for editor
            const lx = Math.floor(lightX);
            const ly = Math.floor(lightY);
            if (lightMap[ly] && lightMap[ly][lx]) {
                rL = Math.max(rL, lightMap[ly][lx].r);
                gL = Math.max(gL, lightMap[ly][lx].g);
                bL = Math.max(bL, lightMap[ly][lx].b);
            }
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgb(${Math.floor(rL * 255)}, ${Math.floor(gL * 255)}, ${Math.floor(bL * 255)})`;
            ctx.fillRect(0, 0, 1, 1);
            ctx.globalCompositeOperation = 'source-over';
        }
        if (alpha > 0) {
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            ctx.fillRect(0, 0, 1, 1);
        }
    };

    const getLitColor = (hex: string, lightX: number, lightY: number, alpha: number, enableLighting: boolean = true) => {
        if (hex === 'transparent') return 'transparent';
        let rColor = parseInt(hex.slice(1, 3), 16);
        let gColor = parseInt(hex.slice(3, 5), 16);
        let bColor = parseInt(hex.slice(5, 7), 16);
        
        if (enableLighting && showLighting && lightMap) {
            let rL = 0.4, gL = 0.4, bL = 0.4; // Brighter floor for editor
            const lx = Math.floor(lightX);
            const ly = Math.floor(lightY);
            if (lightMap[ly] && lightMap[ly][lx]) {
                rL = Math.max(rL, lightMap[ly][lx].r);
                gL = Math.max(gL, lightMap[ly][lx].g);
                bL = Math.max(bL, lightMap[ly][lx].b);
            }
            rColor *= rL;
            gColor *= gL;
            bColor *= bL;
        }

        if (alpha > 0) {
            const factor = 1 - alpha;
            rColor *= factor;
            gColor *= factor;
            bColor *= factor;
        }

        return `rgb(${Math.floor(rColor)}, ${Math.floor(gColor)}, ${Math.floor(bColor)})`;
    };

    const drawFloor = (rx: number, ry: number, x: number, y: number, img: any, color: string, isBase: boolean, floorIdx: number) => {
        if (color === 'transparent') return;

        const screenX = (rx - ry) * (TILE_W / 2);
        const screenY = (rx + ry) * (TILE_H / 2);

        ctx.save();
        ctx.transform(TILE_W/2, TILE_H/2, -TILE_W/2, TILE_H/2, screenX, screenY);
        
        ctx.translate(0.5, 0.5);
        ctx.rotate((Math.PI / 2) * rotation);
        ctx.translate(-0.5, -0.5);
        
        const enableLighting = floorIdx === 0;

        if (img && img.width && img.height) {
            ctx.drawImage(img as CanvasImageSource, 0, 0, 1, 1);
            applyLight(x, y, 0, enableLighting);
        } else {
            ctx.fillStyle = getLitColor(color, x, y, 0, enableLighting);
            ctx.fillRect(0, 0, 1, 1);
            if (isBase) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 1/TILE_W;
                ctx.strokeRect(0, 0, 1, 1);
            }
        }
        ctx.restore();
    };

    const drawWallTextured = (rx: number, ry: number, x: number, y: number, cols: number, rows: number, rotation: number, img: any, topImg: any, leftColor: string, rightColor: string, topColor: string, isWindow = false, boxSize = 1.0, rox = 0, roy = 0) => {
        const cx = rx + rox;
        const cy = ry + roy;
        const screenX = (cx - cy) * (TILE_W / 2);
        const screenY = (cx + cy) * (TILE_H / 2);

        if (isWindow) ctx.globalAlpha = 0.5;
        
        ctx.save();
        if (boxSize !== 1.0 || rox !== 0 || roy !== 0) {
           ctx.translate(screenX, screenY + TILE_H / 2);
           ctx.scale(boxSize, boxSize);
           ctx.translate(-screenX, -(screenY + TILE_H / 2));
        }

        const leftLightCoords = mapCoords(rx, ry + 1, cols, rows, rotation);
        const rightLightCoords = mapCoords(rx + 1, ry, cols, rows, rotation);

        // Left face
        ctx.save();
        ctx.transform(TILE_W/2, TILE_H/2, 0, WALL_H, screenX - TILE_W/2, screenY + TILE_H/2 - WALL_H);
        if (img && img.width && img.height) {
            ctx.drawImage(img as CanvasImageSource, 0, 0, 1, 1);
            applyLight(leftLightCoords.x, leftLightCoords.y, 0.3, true);
        } else {
            ctx.fillStyle = getLitColor(leftColor, leftLightCoords.x, leftLightCoords.y, 0.3, true);
            ctx.fillRect(0, 0, 1, 1);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1/TILE_W;
            ctx.strokeRect(0, 0, 1, 1);
        }
        ctx.restore();

        // Right face
        ctx.save();
        ctx.transform(TILE_W/2, -TILE_H/2, 0, WALL_H, screenX, screenY + TILE_H - WALL_H);
        if (img && img.width && img.height) {
            ctx.drawImage(img as CanvasImageSource, 0, 0, 1, 1);
            applyLight(rightLightCoords.x, rightLightCoords.y, 0.1, true);
        } else {
            ctx.fillStyle = getLitColor(rightColor, rightLightCoords.x, rightLightCoords.y, 0.1, true);
            ctx.fillRect(0, 0, 1, 1);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1/TILE_W;
            ctx.strokeRect(0, 0, 1, 1);
        }
        ctx.restore();

        // Top face
        ctx.save();
        ctx.transform(TILE_W/2, TILE_H/2, -TILE_W/2, TILE_H/2, screenX, screenY - WALL_H);
        
        ctx.translate(0.5, 0.5);
        ctx.rotate((Math.PI / 2) * rotation);
        ctx.translate(-0.5, -0.5);

        if (topImg && topImg.width && topImg.height) {
            ctx.drawImage(topImg as CanvasImageSource, 0, 0, 1, 1);
            applyLight(x, y, 0, false);
        } else {
            ctx.fillStyle = getLitColor(topColor, x, y, 0, false);
            ctx.fillRect(0, 0, 1, 1);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1/TILE_W;
            ctx.strokeRect(0, 0, 1, 1);
        }
        ctx.restore();

        ctx.restore();
        if (isWindow) ctx.globalAlpha = 1.0;
    };

    const drawSpriteObj = (rx: number, ry: number, x: number, y: number, assetId: string | undefined, fallbackColor: string, scale: number = 1.0, isSilhouette: boolean = false, renderMode?: string, wallSide?: string, meshWidth?: number) => {
        const screenX = (rx - ry) * (TILE_W / 2);
        const screenY = (rx + ry) * (TILE_H / 2);
        
        const img = getImg(assetId, true);
        
        if (img && img.width && img.height) {
            ctx.save();
            // apply scaling to match EntityRenderer in-game: height is scale * wall_height
            const h = Math.max(1, WALL_H * scale);
            let w = Math.max(1, (img.width / img.height) * h); 

            if (renderMode === 'mesh' && wallSide) {
                const worldWidth = meshWidth || (scale * (img.width / img.height));
                w = worldWidth * (TILE_W / 2); // World space 1.0 = TILE_W / 2 horizontal width in iso projection
                const cx = screenX;
                const cy = screenY + TILE_H / 2;
                if (wallSide === 'BOTTOM') {
                    ctx.transform(1, 0.5, -1, 0.5, cx, cy);
                } else if (wallSide === 'S' || wallSide === 'N') {
                    // For isometric readability, both N and S are E-W axes.
                    // We map them so they look correct from the fixed editor camera (which looks from South).
                    ctx.transform(1, 0.5, 0, 1, cx, cy);
                } else if (wallSide === 'E' || wallSide === 'W') {
                    // E and W are N-S axes. E goes South->North (Right faced from West), W goes North->South (Right faced from East)
                    // For the editor camera, we always draw it aligned this way.
                    ctx.transform(1, -0.5, 0, 1, cx, cy);
                } else {
                    ctx.translate(cx, cy);
                }
                ctx.translate(-cx, -cy);
            }
            
            if (isSilhouette) {
                ctx.globalAlpha = 0.4;
                ctx.filter = 'brightness(0) invert(0.8)';
                ctx.drawImage(img as CanvasImageSource, screenX - w/2, screenY + TILE_H/2 - h, w, h);
                ctx.filter = 'none';
                ctx.globalAlpha = 1.0;
            } else {
                const lx = Math.floor(x);
                const ly = Math.floor(y);
                if (showLighting && lightMap && lightMap[ly] && lightMap[ly][lx]) {
                    const { r, g, b } = lightMap[ly][lx];
                    
                    // Color quantization to limit cache size
                const qr = Math.floor(r * 10);
                const qg = Math.floor(g * 10);
                const qb = Math.floor(b * 10);
                
                if (qr === 10 && qg === 10 && qb === 10) {
                     // Full brightness, just draw normal image
                     ctx.drawImage(img as CanvasImageSource, screenX - w/2, screenY + TILE_H/2 - h, w, h);
                } else {
                     const tintKey = `${assetId}_${qr}_${qg}_${qb}`;
                     let tintedCanvas = spriteTintCacheRef.current.get(tintKey);
                     
                     if (!tintedCanvas) {
                          tintedCanvas = document.createElement('canvas');
                          tintedCanvas.width = img.width;
                          tintedCanvas.height = img.height;
                          const tCtx = tintedCanvas.getContext('2d');
                          if (tCtx) {
                              tCtx.drawImage(img as CanvasImageSource, 0, 0);
                              tCtx.globalCompositeOperation = 'multiply';
                              tCtx.fillStyle = `rgb(${qr * 25.5}, ${qg * 25.5}, ${qb * 25.5})`;
                              tCtx.fillRect(0, 0, tintedCanvas.width, tintedCanvas.height);
                              tCtx.globalCompositeOperation = 'destination-in';
                              tCtx.drawImage(img as CanvasImageSource, 0, 0);
                          }
                          spriteTintCacheRef.current.set(tintKey, tintedCanvas);
                          
                          // basic LRU logic to avoid memory explosion
                          if (spriteTintCacheRef.current.size > 2000) {
                              let i = 0;
                              for (const key of spriteTintCacheRef.current.keys()) {
                                   spriteTintCacheRef.current.delete(key);
                                   if (i++ > 200) break;
                              }
                          }
                     }
                     
                     ctx.drawImage(tintedCanvas, screenX - w/2, screenY + TILE_H/2 - h, w, h);
                }
                } else {
                    ctx.drawImage(img as CanvasImageSource, screenX - w/2, screenY + TILE_H/2 - h, w, h);
                }
            }
            ctx.restore();
        }
    };

    const leftLocal = -centerX / zoom;
    const rightLocal = (width - centerX) / zoom;
    const topLocal = -centerY / zoom;
    const bottomLocal = (height - centerY) / zoom;
    const margin = 100 / zoom + Math.max(WALL_H * 4, TILE_W * 4);

    const isVisible = (x: number, y: number, pZ: number) => {
        const scX = (x - y) * (TILE_W / 2);
        const scY = (x + y) * (TILE_H / 2) - pZ;
        return !(scX < leftLocal - margin || scX > rightLocal + margin || 
                 scY < topLocal - margin || scY > bottomLocal + margin);
    };

    const startFloor = 0;
    const endFloor = isoFloor;
    const xRayEntities: { rx: number, ry: number, floorIdx: number, ent: string }[] = [];

    for (let floorIdx = startFloor; floorIdx <= endFloor; floorIdx++) {
        const grid = level.grids[floorIdx];
        if (!grid) continue;
        const entities = level.entities ? level.entities[floorIdx] : null;
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        
        const rotatedCols = rotation % 2 === 0 ? cols : rows;
        const rotatedRows = rotation % 2 === 0 ? rows : cols;
        
        const pZ = (floorIdx - isoFloor) * WALL_H;
        const isBase = floorIdx === isoFloor;

        ctx.save();
        ctx.translate(0, -pZ);
        
        // Draw floor first
        for (let ry = 0; ry < rotatedRows; ry++) {
            for (let rx = 0; rx < rotatedCols; rx++) {
                if (!isVisible(rx, ry, pZ)) continue;

                const { x, y } = mapCoords(rx, ry, cols, rows, rotation);
                const char = grid[y]?.[x];
                if (char === undefined) continue;

                let floorAssetId = undefined;
                const cDef = constructionMap.get(char);
                if (cDef?.type === 'floor' && cDef?.assetId) floorAssetId = cDef.assetId;
                else if (cDef?.floorAssetId) floorAssetId = cDef.floorAssetId;

                const finalFloorImg = floorAssetId ? getImg(floorAssetId) : floorImg;

                if (char === ' ') {
                     if (isBase) {
                         drawFloor(rx, ry, x, y, null, floorIdx === 0 ? '#2d3748' : 'transparent', isBase, floorIdx); 
                     }
                } else {
                     const isDefined = char === '#' || constructionMap.has(char);
                     if (isDefined) {
                         const cDef = constructionMap.get(char);
                         const isWallOrWindow = char === '#' || cDef?.type === 'wall' || cDef?.type === 'window' || doorDefMap[char];
                         
                         if (floorIdx > 0 && isWallOrWindow && !floorAssetId) {
                             drawFloor(rx, ry, x, y, null, 'transparent', isBase, floorIdx);
                         } else {
                             drawFloor(rx, ry, x, y, finalFloorImg, '#4a5568', isBase, floorIdx); 
                         }
                     } else if (isBase) {
                         drawFloor(rx, ry, x, y, null, floorIdx === 0 ? '#2d3748' : 'transparent', isBase, floorIdx);
                     }
                }
            }
        }

        // Draw walls and entities back-to-front
        for (let c = 0; c < rotatedRows + rotatedCols; c++) {
            for (let ry = rotatedRows - 1; ry >= 0; ry--) {
                const rx = c - ry;
                if (rx >= 0 && rx < rotatedCols) {
                    if (!isVisible(rx, ry, pZ)) continue;

                    const { x, y } = mapCoords(rx, ry, cols, rows, rotation);
                    const char = grid[y]?.[x];
                    if (char === undefined) continue;

                    const constructionDef = constructionMap.get(char);
                    
                    if (char === '#') {
                        drawWallTextured(rx, ry, x, y, cols, rows, rotation, wallImg, ceilingImg, '#718096', '#a0aec0', '#e2e8f0', false);
                    } else if (constructionDef && constructionDef.type === 'wall') {
                        const cImg = getImg(constructionDef.assetId);
                        drawWallTextured(rx, ry, x, y, cols, rows, rotation, cImg || wallImg, ceilingImg, '#5a67d8', '#7f9cf5', '#c3dafe', false);
                    } else if (constructionDef && constructionDef.type === 'window') {
                        const wImg = getImg(constructionDef.assetId) || getImg(constructionDef.glassAssetId);
                        drawWallTextured(rx, ry, x, y, cols, rows, rotation, wImg, ceilingImg, 'rgba(100, 150, 250, 0.5)', 'rgba(120, 170, 255, 0.5)', 'rgba(150, 200, 255, 0.5)', true);
                    }

                    // Entity
                    const ent = entities ? entities[y]?.[x] : '.';
                    if (ent && ent !== '.') {
                        const doorDef = doorDefMap[ent];
                        if (doorDef) {
                            const dImg = getImg(doorDef.textureId || doorDef.assetId) || doorImg;
                            drawWallTextured(rx, ry, x, y, cols, rows, rotation, dImg, ceilingImg, '#9c4221', '#dd6b20', '#fbd38d', false);
                        } else if (portMap.has(ent)) {
                             drawSpriteObj(rx, ry, x, y, undefined, '#9f7aea', 1.0, false); 
                        } else {
                             const { assetId, scale, fallBackColor, renderMode, wallSide, offsetX, offsetY, meshWidth, isBox, boxSize, polyModelId } = getScaleInfo(ent);
                             
                             const dirIndex: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };
                             const dirs = ['N', 'E', 'S', 'W'];
                             const newWallSide = wallSide ? dirs[(dirIndex[wallSide] + rotation) % 4] : undefined;
                             const { rox, roy } = rotateOffset(offsetX || 0, offsetY || 0, rotation);

                             if (renderMode === 'polyObject' || polyModelId) {
                                  const polyModel = getPolyModelById(polyModelId || 'chair');
                                  if (polyModel) {
                                       const sx = (rx + rox - (ry + roy)) * (TILE_W / 2);
                                       const sy = (rx + rox + (ry + roy)) * (TILE_H / 2) + TILE_H / 2;
                                       drawPolyObjectIsometricCanvas(ctx, sx, sy, polyModel, {
                                            tileW: TILE_W,
                                            tileH: TILE_H,
                                            wallH: WALL_H,
                                            scale,
                                            rotation,
                                       });
                                  }
                             } else if (isBox) {
                                  const cImg = getImg(assetId);
                                  drawWallTextured(rx, ry, x, y, cols, rows, rotation, cImg, cImg, '#a0aec0', '#cbd5e0', '#e2e8f0', false, boxSize, rox, roy);
                             } else {
                                  drawSpriteObj(rx + rox, ry + roy, x, y, assetId, fallBackColor, scale, false, renderMode, newWallSide, meshWidth);
                                  xRayEntities.push({ rx: rx + rox, ry: ry + roy, floorIdx, ent });
                             }
                        }
                    }
                }
            }
        }
        ctx.restore(); // restore translate for floor
    }

    // X-Ray Pass for Entities across all floors
    for (const { rx, ry, floorIdx, ent } of xRayEntities) {
        const obscuringPolys: { wrx: number, wry: number, pZ: number, isWall: boolean }[] = [];

        for (let f = floorIdx; f <= endFloor; f++) {
            const fGrid = level.grids[f];
            if (!fGrid) continue;
            
            const pZ = (f - isoFloor) * WALL_H;
            const fRows = fGrid.length;
            const fCols = fGrid[0]?.length || 0;
            const rotatedFCols = rotation % 2 === 0 ? fCols : fRows;
            const rotatedFRows = rotation % 2 === 0 ? fRows : fCols;

            for (let wry = Math.max(0, Math.floor(ry) - 3); wry <= Math.min(Math.floor(ry) + 3, rotatedFRows - 1); wry++) {
                for (let wrx = Math.max(0, Math.floor(rx) - 3); wrx <= Math.min(Math.floor(rx) + 3, rotatedFCols - 1); wrx++) {
                    if (f === floorIdx) {
                        if (wry < Math.floor(ry) || wrx < Math.floor(rx)) continue; 
                        if (wrx === Math.floor(rx) && wry === Math.floor(ry)) continue; 
                    }
                    
                    const { x, y } = mapCoords(wrx, wry, fCols, fRows, rotation);
                    const char = fGrid[y]?.[x];
                    if (char === undefined) continue;

                    const cDef = constructionMap.get(char);
                    const isWall = char === '#' || cDef?.type === 'wall' || doorDefMap[char];
                    
                    if (isWall) {
                        obscuringPolys.push({ wrx, wry, pZ, isWall: true });
                    } else if (char !== ' ' || cDef) {
                        if (f > floorIdx) {
                            obscuringPolys.push({ wrx, wry, pZ, isWall: false });
                        }
                    }
                }
            }
        }

        if (obscuringPolys.length > 0) {
            ctx.save();
            const entPZ = (floorIdx - isoFloor) * WALL_H;
            ctx.translate(0, -entPZ);
            
            ctx.beginPath();
            for (const { wrx, wry, pZ, isWall } of obscuringPolys) {
                const zShift = pZ - entPZ; 
                const wsx = (wrx - wry) * (TILE_W / 2);
                const wsy = (wrx + wry) * (TILE_H / 2) - zShift;

                if (isWall) {
                    ctx.moveTo(wsx, wsy + TILE_H);
                    ctx.lineTo(wsx - TILE_W/2, wsy + TILE_H/2);
                    ctx.lineTo(wsx - TILE_W/2, wsy + TILE_H/2 - WALL_H);
                    ctx.lineTo(wsx, wsy - WALL_H);
                    ctx.lineTo(wsx + TILE_W/2, wsy + TILE_H/2 - WALL_H);
                    ctx.lineTo(wsx + TILE_W/2, wsy + TILE_H/2);
                    ctx.closePath();
                } else {
                    ctx.moveTo(wsx, wsy);
                    ctx.lineTo(wsx + TILE_W/2, wsy + TILE_H/2);
                    ctx.lineTo(wsx, wsy + TILE_H);
                    ctx.lineTo(wsx - TILE_W/2, wsy + TILE_H/2);
                    ctx.closePath();
                }
            }
            ctx.clip();

            const { assetId, scale, fallBackColor, renderMode, wallSide, meshWidth } = getScaleInfo(ent);
            const dirIndex: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };
            const dirs = ['N', 'E', 'S', 'W'];
            const newWallSide = wallSide ? dirs[(dirIndex[wallSide] + rotation) % 4] : undefined;
            if (assetId) {
                drawSpriteObj(rx, ry, 0, 0, assetId, fallBackColor, scale, true, renderMode, newWallSide, meshWidth);
            }
            
            ctx.restore();
        }
    }

    ctx.restore();
    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
       if (!canvasRef.current || !containerRef.current) return;
       const width = containerRef.current.clientWidth;
       const height = containerRef.current.clientHeight;
       if (canvasRef.current.style.width !== `${width}px` || canvasRef.current.style.height !== `${height}px`) {
           setOffset(prev => ({...prev}));
       }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
       resizeObserver.disconnect();
    };
  }, [isOpen, level, currentFloor, zoom, offset, renderTick, showLighting, lightMap, isoFloor, rotation]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.1, Math.min(3, z + zoomDelta)));
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-6xl h-[80dvh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-950 gap-2 shrink-0">
          <h2 className="text-white font-semibold truncate flex-1 min-w-0 text-sm sm:text-base" title={uiStrings.isometric_view || "Isometric View"}>
            {uiStrings.isometric_view || "Isometric View"}
          </h2>
          
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white shrink-0" title={uiStrings.zoom_in || "Zoom In"}>
              <ZoomIn size={18} />
            </button>
            <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white shrink-0" title={uiStrings.zoom_out || "Zoom Out"}>
              <ZoomOut size={18} />
            </button>
            <button onClick={resetView} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white shrink-0 hidden sm:block" title={uiStrings.reset_view || "Reset View"}>
              <Maximize size={18} />
            </button>
            <div className="w-px h-6 bg-gray-800 mx-1 sm:mx-2 shrink-0 hidden sm:block" />
            
            <div className="flex items-center gap-1 bg-gray-900 px-1 py-1 rounded text-xs text-nowrap">
                 <span className="text-gray-400 hidden sm:inline" title={uiStrings.floor || "Floor"}>{uiStrings.floor || "Floor"}:</span>
                 <button onClick={() => setIsoFloor(f => Math.max(0, f - 1))} className="text-gray-400 hover:text-white px-2 leading-none shadow-sm rounded border border-gray-700 bg-gray-800 hover:bg-gray-700">-</button>
                 <span className="text-white w-3 text-center inline-block">{isoFloor}</span>
                 <button onClick={() => setIsoFloor(f => Math.min(level.grids.length - 1, f + 1))} className="text-gray-400 hover:text-white px-2 leading-none shadow-sm rounded border border-gray-700 bg-gray-800 hover:bg-gray-700">+</button>
            </div>

            <div className="w-px h-6 bg-gray-800 mx-1 sm:mx-2 shrink-0 hidden sm:block" />
            <button
              onClick={() => setRotation(r => (r + 1) % 4)}
              className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white shrink-0"
              title={uiStrings.rotate_view || "Rotate View"}
            >
              <RotateCw size={18} />
            </button>
            <div className="w-px h-6 bg-gray-800 mx-1 sm:mx-2 shrink-0 hidden sm:block" />
            <button
              onClick={() => setShowLighting(prev => !prev)}
              className={`p-1.5 hover:bg-gray-800 rounded transition-colors shrink-0 ${showLighting ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}
              title={uiStrings.toggle_lighting || "Toggle Lighting"}
            >
              <Lightbulb size={18} />
            </button>
            <div className="w-px h-6 bg-gray-800 mx-1 sm:mx-2 shrink-0" />
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400 transition-colors shrink-0"
              title={uiStrings.close || "Close"}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Canvas Container */}
        <div 
          ref={containerRef}
          className="flex-1 relative cursor-grab active:cursor-grabbing bg-[#1a202c] overflow-hidden touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              isDraggingRef.current = true;
              lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
          }}
          onTouchMove={(e) => {
            if (!isDraggingRef.current) return;
            if (e.touches.length === 1) {
              const dx = e.touches[0].clientX - lastMousePosRef.current.x;
              const dy = e.touches[0].clientY - lastMousePosRef.current.y;
              setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
              lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
          }}
          onTouchEnd={() => { isDraggingRef.current = false; }}
          onTouchCancel={() => { isDraggingRef.current = false; }}
        >
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full"
          />
        </div>
      </div>
    </div>
  );
};
