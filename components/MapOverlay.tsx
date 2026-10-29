
import React, { useRef, useEffect, useState } from 'react';
import { Player, Tile, Item } from '../types';

interface MapOverlayProps {
    player: Player;
    levelData: { width: number; height: number; grid: Tile[][] } | null;
    sprites: Map<string, HTMLImageElement>;
    onClose: () => void;
    mapContainerRef: React.RefObject<HTMLDivElement | null>; 
    currentLevelPath: string | null; 
    currentSnapshot?: ImageData; 
    onSnapshotUpdate: (data: ImageData) => void; 
    item: Item | null; 
    visible: boolean; 
    zoomLevel?: number; 
    handStyleFinal?: React.CSSProperties;
    localize: (text: string | undefined) => string;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

const BASE_TILE_SIZE = 24; 

const maskAnalysisCache = new Map<string, Rect>();

const MapOverlay: React.FC<MapOverlayProps> = ({ 
    player, levelData, sprites, onClose, mapContainerRef, 
    currentLevelPath, currentSnapshot, onSnapshotUpdate,
    item, visible, zoomLevel, handStyleFinal, localize
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastSnapshotTimeRef = useRef<number>(0);
    const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const activeCoordsRef = useRef<{ screenMaskX: number, screenMaskY: number, screenMaskW: number, screenMaskH: number, dpr: number } | null>(null);
    const [sourceMaskRect, setSourceMaskRect] = useState<Rect | null>(null);
    
    const isMapValid = item?.boundLevelPath === currentLevelPath || (!item?.boundLevelPath && !!currentLevelPath);
    
    const drawScale = zoomLevel !== undefined ? zoomLevel : (item?.drawScale || 1.0);
    const tileSize = BASE_TILE_SIZE;

    const [fontsReady, setFontsReady] = useState(0);

    useEffect(() => {
        if (visible && item?.type === 'NOTE') {
            document.fonts.ready.then(() => {
                setFontsReady(prev => prev + 1);
            });
            document.fonts.load('600 12px "Caveat"').then(() => {
                setFontsReady(prev => prev + 1);
            }).catch(() => {});
            
            // Fallback redraw after a slight delay to ensure canvas paints with the font
            const timer = setTimeout(() => setFontsReady(prev => prev + 1), 100);
            return () => clearTimeout(timer);
        }
    }, [visible, item]);

    // 1. Analyze Mask
    useEffect(() => {
        const analyzeMask = () => {
            if (!item || !item.maskAssetId) return;
            
            if (maskAnalysisCache.has(item.maskAssetId)) {
                setSourceMaskRect(maskAnalysisCache.get(item.maskAssetId)!);
                return;
            }
            
            const maskImg = sprites.get(item.maskAssetId);
            if (!maskImg) return;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = maskImg.width;
            tempCanvas.height = maskImg.height;
            const ctx = tempCanvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(maskImg, 0, 0);
            const id = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const d = id.data;
            
            let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;
            let found = false;

            for (let y = 0; y < tempCanvas.height; y++) {
                for (let x = 0; x < tempCanvas.width; x++) {
                    const i = (y * tempCanvas.width + x) * 4;
                    if (d[i+3] > 0 && d[i] < 50 && d[i+1] > 200 && d[i+2] < 50) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        found = true;
                    }
                }
            }

            if (found) {
                const rect: Rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
                maskAnalysisCache.set(item.maskAssetId, rect);
                setSourceMaskRect(rect);
            }
        };
        analyzeMask();
    }, [item, sprites]);

    // 1.5. Snapshot Capture Effect (Decoupled from high-frequency render loop)
    useEffect(() => {
        return () => {
            const canvas = activeCanvasRef.current;
            const coords = activeCoordsRef.current;
            if (canvas && coords && isMapValid && Math.abs(drawScale - 1.0) < 0.1) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    try {
                        const finalData = ctx.getImageData(
                            coords.screenMaskX * coords.dpr, 
                            coords.screenMaskY * coords.dpr, 
                            coords.screenMaskW * coords.dpr, 
                            coords.screenMaskH * coords.dpr
                        );
                        onSnapshotUpdate(finalData);
                    } catch (e) {
                        // ignore
                    }
                }
            }
        };
    }, [visible, isMapValid, drawScale, onSnapshotUpdate, item]);

    // 2. Render Loop
    useEffect(() => {
        if (!visible) return;

        const canvas = canvasRef.current;
        if (!canvas || !levelData) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // --- HIGH DPI SETUP ---
        let logicalW = 0;
        let logicalH = 0;
        let dpr = 1;

        if (containerRef.current) {
            logicalW = containerRef.current.clientWidth;
            logicalH = containerRef.current.clientHeight;
            
            if (logicalW === 0) {
                 logicalW = window.innerWidth > 448 ? 448 : window.innerWidth;
                 logicalH = logicalW * 0.75;
            }

            dpr = window.devicePixelRatio || 1;
            canvas.width = logicalW * dpr;
            canvas.height = logicalH * dpr;
            
            // Scale context to work with CSS pixels mostly, but render at High DPI
            ctx.scale(dpr, dpr);
        }
        
        // Critical for sharp pixel art scaling
        ctx.imageSmoothingEnabled = false;

        const cleanup = () => {
            if (ctx && visible) ctx.clearRect(0, 0, logicalW, logicalH);
        };

        if (!item) {
            cleanup();
            return;
        }

        const handAssetToUse = (player.characterId === 'female' && item.handFemaleAssetId) ? item.handFemaleAssetId : item.handAssetId;
        let handImg = handAssetToUse ? sprites.get(handAssetToUse) : null;
        if (handAssetToUse && (!handImg || handImg.width === 0)) {
            handImg = sprites.get('TEX_FALLBACK');
        }
        if (!handImg || handImg.width === 0) {
            cleanup();
            return;
        }

        // Clear in logical coordinates (which covers the full high-dpi buffer due to scale)
        ctx.clearRect(0, 0, logicalW, logicalH);

        const drawH = Math.floor(logicalH * 0.6);
        const aspectRatio = handImg.width / handImg.height;
        const drawW = Math.floor(drawH * aspectRatio);
        const drawX = Math.floor(logicalW - drawW);
        const drawY = Math.floor(logicalH - drawH);
        
        ctx.drawImage(handImg, drawX, drawY, drawW, drawH);

        if (sourceMaskRect) {
            ctx.save();
            
            const scaleX = drawW / handImg.width;
            const scaleY = drawH / handImg.height;
            const screenMaskX = Math.floor(drawX + (sourceMaskRect.x * scaleX));
            const screenMaskY = Math.floor(drawY + (sourceMaskRect.y * scaleY));
            const screenMaskW = Math.floor(sourceMaskRect.w * scaleX);
            const screenMaskH = Math.floor(sourceMaskRect.h * scaleY);

            // Save references for the decoupled snapshot effect
            activeCanvasRef.current = canvas;
            activeCoordsRef.current = { screenMaskX, screenMaskY, screenMaskW, screenMaskH, dpr };

            ctx.beginPath();
            ctx.rect(screenMaskX, screenMaskY, screenMaskW, screenMaskH);
            ctx.clip();

            if (item.type === 'NOTE') {
                const noteText = localize(item.text || '');
                ctx.fillStyle = '#1e293b'; 
                
                const baseFontSize = item.textScale !== undefined && item.textScale !== 0 && item.textScale !== '' ? Number(item.textScale) : 8;
                const viewportScale = logicalH / 400;
                const fontSize = Math.max(1, baseFontSize * viewportScale);
                
                ctx.font = `600 ${fontSize}px "Caveat", cursive`;
                
                const offsetX = item.textOffsetX !== undefined ? Number(item.textOffsetX) : 0;
                const offsetY = item.textOffsetY !== undefined ? Number(item.textOffsetY) : 0;
                
                let align: CanvasTextAlign = 'left';
                if (offsetX > 0.3 && offsetX < 0.7) align = 'center';
                else if (offsetX >= 0.7) align = 'right';
                
                ctx.textAlign = align;
                ctx.textBaseline = 'top';

                const startX = screenMaskX + (screenMaskW * offsetX);
                let yPos = screenMaskY + (screenMaskH * offsetY);
                const maxWidth = screenMaskW;
                
                const textLines = noteText.split(/[\n|]/);
                for (const block of textLines) {
                    const words = block.split(' ');
                    let currentLine = '';
                    for (const word of words) {
                        const testLine = currentLine + word + ' ';
                        const metrics = ctx.measureText(testLine);
                        if (metrics.width > maxWidth && currentLine !== '') {
                            ctx.fillText(currentLine, startX, yPos);
                            currentLine = word + ' ';
                            yPos += fontSize * 1.5;
                        } else {
                            currentLine = testLine;
                        }
                    }
                    if (currentLine.length > 0) {
                        ctx.fillText(currentLine, startX, yPos);
                        yPos += fontSize * 1.5;
                    }
                }
            } else if (isMapValid) {
                const WALL_COLOR = '#525252'; 
                const PLAYER_COLOR = '#374151'; // Dark Gray
                const FOG_COLOR = '#111827'; // Dark Gray (gray-900)

                const centerX = screenMaskX + screenMaskW / 2;
                const centerY = screenMaskY + screenMaskH / 2;
                
                ctx.translate(centerX, centerY);
                ctx.scale(drawScale, drawScale);
                
                const centerOffsetX = player.pos.x * tileSize + tileSize / 2;
                const centerOffsetY = player.pos.y * tileSize + tileSize / 2;
                ctx.translate(-centerOffsetX, -centerOffsetY);

                ctx.lineCap = 'square'; 
                ctx.lineJoin = 'miter';
                
                const logicalViewW = screenMaskW / drawScale;
                const logicalViewH = screenMaskH / drawScale;
                
                const renderRadiusX = Math.ceil((logicalViewW / tileSize) / 2) + 1;
                const renderRadiusY = Math.ceil((logicalViewH / tileSize) / 2) + 1;
                
                const startCol = Math.floor(player.pos.x - renderRadiusX);
                const endCol = Math.floor(player.pos.x + renderRadiusX);
                const startRow = Math.floor(player.pos.y - renderRadiusY);
                const endRow = Math.floor(player.pos.y + renderRadiusY);

                const dynamicLineWidth = 1 / drawScale;
                ctx.lineWidth = dynamicLineWidth;
                
                // --- DYNAMIC OVERLAP CALCULATION ---
                const pixelOverlap = (1.5 / drawScale);
                const tileOffset = -pixelOverlap / 2;
                const tileSizeWithOverlap = tileSize + pixelOverlap;
                
                const lineOffset = 0; 

                const wallPath = new Path2D();
                const blockPath = new Path2D();
                const fogPath = new Path2D();

                const grid = levelData.grid;
                const gridW = levelData.width;
                const gridH = levelData.height;

                for (let y = startRow; y <= endRow; y++) {
                    const rowPrev = y > 0 ? grid[y - 1] : null;
                    const rowCurr = grid[y];
                    const rowNext = y < gridH - 1 ? grid[y + 1] : null;

                    for (let x = startCol; x <= endCol; x++) {
                        const px = Math.round(x * tileSize);
                        const py = Math.round(y * tileSize);

                        const isOutOfBounds = x < 0 || x >= gridW || y < 0 || y >= gridH;
                        const tile = !isOutOfBounds ? rowCurr?.[x] : null;
                        const isExplored = tile?.isExplored;

                        // Fog fill with dynamic overlap
                        if (isOutOfBounds || !tile || !isExplored) {
                            fogPath.rect(px + tileOffset, py + tileOffset, tileSizeWithOverlap, tileSizeWithOverlap);
                            continue;
                        }

                        if (tile.type === 'WALL') {
                            // Top
                            if (y === 0 || rowPrev?.[x]?.type !== 'WALL') { 
                                wallPath.moveTo(px + lineOffset, py + lineOffset); 
                                wallPath.lineTo(px + tileSize + lineOffset, py + lineOffset); 
                            }
                            // Bottom
                            if (y === gridH - 1 || rowNext?.[x]?.type !== 'WALL') { 
                                wallPath.moveTo(px + lineOffset, py + tileSize + lineOffset); 
                                wallPath.lineTo(px + tileSize + lineOffset, py + tileSize + lineOffset); 
                            }
                            // Left
                            if (x === 0 || rowCurr?.[x - 1]?.type !== 'WALL') { 
                                wallPath.moveTo(px + lineOffset, py + lineOffset); 
                                wallPath.lineTo(px + lineOffset, py + tileSize + lineOffset); 
                            }
                            // Right
                            if (x === gridW - 1 || rowCurr?.[x + 1]?.type !== 'WALL') { 
                                wallPath.moveTo(px + tileSize + lineOffset, py + lineOffset); 
                                wallPath.lineTo(px + tileSize + lineOffset, py + tileSize + lineOffset); 
                            }
                        } 

                        if (tile.type === 'DOOR') {
                            const wallsVertical = rowPrev?.[x]?.type === 'WALL' || rowNext?.[x]?.type === 'WALL';
                            const wallsHorizontal = rowCurr?.[x - 1]?.type === 'WALL' || rowCurr?.[x + 1]?.type === 'WALL';
                            
                            const cx = px + tileSize/2;
                            const cy = py + tileSize/2;
                            
                            if (wallsVertical && !wallsHorizontal) { 
                                wallPath.moveTo(cx + lineOffset, py + lineOffset); 
                                wallPath.lineTo(cx + lineOffset, py + tileSize + lineOffset); 
                            } else { 
                                wallPath.moveTo(px + lineOffset, cy + lineOffset); 
                                wallPath.lineTo(px + tileSize + lineOffset, cy + lineOffset); 
                            }
                        }

                        const isDecoBlocking = tile.decorations && tile.decorations.length > 0
                            ? tile.decorations.some((d: any) => d.blocking && !d.isEmptyness)
                            : !!(tile.decoration && tile.decoration.blocking && !tile.decoration.isEmptyness);
                        if (isDecoBlocking) {
                            const margin = tileSize * 0.3;
                            blockPath.moveTo(px + margin + lineOffset, py + margin + lineOffset); 
                            blockPath.lineTo(px + tileSize - margin + lineOffset, py + tileSize - margin + lineOffset);
                            
                            blockPath.moveTo(px + tileSize - margin + lineOffset, py + margin + lineOffset); 
                            blockPath.lineTo(px + margin + lineOffset, py + tileSize - margin + lineOffset);
                        }
                    }
                }

                ctx.fillStyle = FOG_COLOR;
                ctx.fill(fogPath);

                ctx.strokeStyle = WALL_COLOR;
                ctx.stroke(wallPath);

                ctx.strokeStyle = '#dc2626';
                ctx.stroke(blockPath);

                // Draw PORTAL texts separately (using pre-fetched rows)
                for (let y = startRow; y <= endRow; y++) {
                    const row = grid[y];
                    for (let x = startCol; x <= endCol; x++) {
                        const isOutOfBounds = x < 0 || x >= gridW || y < 0 || y >= gridH;
                        const tile = !isOutOfBounds ? row?.[x] : null;
                        const isExplored = tile && tile.isExplored;
                        if (!isOutOfBounds && tile && isExplored && tile.type === 'PORTAL') {
                            const px = Math.round(x * tileSize);
                            const py = Math.round(y * tileSize);
                            ctx.fillStyle = '#10b981';
                            const fontSize = Math.floor(tileSize * 0.6);
                            ctx.font = `bold ${fontSize}px monospace`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText('P', px + tileSize/2, py + tileSize/2);
                        }
                    }
                }

                // Draw Player Arrow
                const hasCompass = player.inventory.some(i => i.id === 'compass' || i.type === 'COMPASS');
                
                if (hasCompass) {
                    const ppx = player.pos.x * tileSize + tileSize / 2;
                    const ppy = player.pos.y * tileSize + tileSize / 2;
                    ctx.translate(ppx, ppy);
                    const angle = (player.dir360 - 1) * (Math.PI / 2);
                    ctx.rotate(angle);
                    ctx.fillStyle = PLAYER_COLOR; 
                    ctx.beginPath();
                    
                    const arrowSize = tileSize * 0.4;
                    const arrowBase = tileSize * 0.25;
                    
                    ctx.moveTo(arrowSize, 0);
                    ctx.lineTo(-arrowBase, -arrowBase);
                    ctx.lineTo(-arrowBase, arrowBase);
                    ctx.fill();
                }
            } else {
                if (currentSnapshot) {
                    ctx.putImageData(currentSnapshot, screenMaskX * dpr, screenMaskY * dpr);
                } else {
                    ctx.fillStyle = '#f3f4f6'; 
                    ctx.fillRect(screenMaskX, screenMaskY, screenMaskW, screenMaskH);
                    ctx.fillStyle = '#9ca3af';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('...', screenMaskX + screenMaskW/2, screenMaskY + screenMaskH/2);
                }
            }

            ctx.restore();
        }

        return cleanup; 

    }, [player, levelData, sprites, sourceMaskRect, isMapValid, drawScale, tileSize, currentSnapshot, onSnapshotUpdate, item, visible, fontsReady]);

    return (
        <div 
            ref={containerRef}
            className={`absolute inset-0 z-[200] pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`} 
            style={{ visibility: visible ? 'visible' : 'hidden' }}
        >
            <div 
                ref={mapContainerRef}
                className="w-full h-full"
                style={{
                    transformOrigin: 'bottom right',
                    ...(handStyleFinal || {})
                }}
            >
                <canvas ref={canvasRef} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
            </div>
        </div>
    );
};

export default React.memo(MapOverlay);
