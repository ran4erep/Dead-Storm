import React from 'react';
import { Skull, Shirt, Columns, Footprints, Navigation, Gem } from 'lucide-react';
import { WeaponIcon } from './WeaponIcon';
import { BulletIcon } from './CombatOverlay';
import { Item } from '../types';
import { hasLineOfSight } from '../utils/combatLogic';
import { useViewportScale } from '../hooks/useViewportScale';

interface TopRightBadgesProps {
    almostBrokenSlots: { slot: string, isBroken: boolean, item?: any }[];
    activeWeapon: any;
    weaponAkimbo: any;
    hasCompass: boolean;
    dir360: number;
    totalAmmoInInventory: number;
    hasDigitalMap?: boolean;
    playerX?: number;
    playerY?: number;
    playerDir?: number;
    grid?: any[][];
    strings?: any;
    spriteMap?: Map<string, HTMLImageElement>;
}

const TopRightBadges: React.FC<TopRightBadgesProps> = ({ 
    almostBrokenSlots, 
    activeWeapon, 
    weaponAkimbo, 
    hasCompass, 
    dir360, 
    totalAmmoInInventory,
    hasDigitalMap = false,
    playerX,
    playerY,
    playerDir,
    grid,
    strings,
    spriteMap
}) => {
    const rawScale = useViewportScale();
    const viewScale = typeof rawScale === 'number' && rawScale > 0 ? rawScale : 1;
    const activeAkimboWeapon = weaponAkimbo || (activeWeapon?.id === 'fists_weapon' ? activeWeapon : null);

    // N at top, E at right, S at bottom, W at left
    const playerAngleDeg = (dir360 - 1) * 90;
    const compassRotation = 270 - playerAngleDeg;

    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const losCacheRef = React.useRef<Map<string, boolean>>(new Map());
    const lastGridRef = React.useRef<any>(null);

    React.useEffect(() => {
        if (!hasDigitalMap) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Tactical dark military background
        ctx.fillStyle = '#010502';
        ctx.fillRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        // Draw tactical radar range rings
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.08)';
        ctx.lineWidth = 0.5;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 34, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 46, 0, Math.PI * 2);
        ctx.stroke();

        // Draw crosshairs
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.05)';
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
        ctx.moveTo(0, cy); ctx.lineTo(width, cy);
        ctx.stroke();

        if (grid && playerX !== undefined && playerY !== undefined) {
            const tileSize = 8;
            const gridHeight = grid.length;
            const gridWidth = grid[0]?.length || 0;

            const isWall = (x: number, y: number) => {
                if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return true;
                return grid[y]?.[x]?.type === 'WALL';
            };

            const playerPos = { x: playerX, y: playerY };

            const rangeX = 10;
            const rangeY = 8;

            // Clear Line of Sight Cache if grid changes reference (e.g. doors toggle)
            if (lastGridRef.current !== grid) {
                losCacheRef.current.clear();
                lastGridRef.current = grid;
            }

            const shouldDrawWallBorder = (tileA: any, bx: number, by: number): boolean => {
                if (!tileA) return false;
                const isExploredA = tileA.isExplored || false;
                if (!isExploredA) {
                    const tileB = (bx >= 0 && bx < gridWidth && by >= 0 && by < gridHeight) ? grid[by][bx] : null;
                    if (!tileB || !tileB.isExplored) return false;
                    return tileB.type === 'WALL';
                }
                const isWallA = tileA.type === 'WALL';
                const tileB = (bx >= 0 && bx < gridWidth && by >= 0 && by < gridHeight) ? grid[by][bx] : null;
                const isExploredB = tileB?.isExplored || false;
                if (!isExploredB) {
                    return isWallA;
                }
                const isWallB = tileB.type === 'WALL';
                return isWallA !== isWallB;
            };

            // HIGHLY OPTIMIZED PATH2D AND RENDERING CACHING CHANNELS (NEAR-ZERO MEMORY ALLOCATIONS)
            const wallPath = new Path2D();
            const doorPath = new Path2D();
            
            const obstacleBorderPath = new Path2D();
            const obstacleCrossPath = new Path2D();
            
            const itemsPath = new Path2D();
            const npcPath = new Path2D();
            const hostilePath = new Path2D();

            const portalsToDraw: { x: number, y: number, dir?: 'N' | 'E' | 'S' | 'W' }[] = [];
            let currentFillStyle = '';

            const roundPX = Math.round(playerX);
            const roundPY = Math.round(playerY);

            for (let dy = -rangeY; dy <= rangeY; dy++) {
                for (let dx = -rangeX; dx <= rangeX; dx++) {
                    const tx = Math.floor(playerX) + dx;
                    const ty = Math.floor(playerY) + dy;

                    if (ty < 0 || ty >= gridHeight || tx < 0 || tx >= gridWidth) continue;

                    const tile = grid[ty][tx];
                    if (!tile) continue;

                    const tileCenterX = Math.round(cx + (tx - playerX) * tileSize);
                    const tileCenterY = Math.round(cy + (ty - playerY) * tileSize);
                    const drawX = Math.round(tileCenterX - tileSize / 2);
                    const drawY = Math.round(tileCenterY - tileSize / 2);

                    if (tile.isExplored) {
                        // Level architecture base (floor or wall)
                        const bgStyle = tile.type === 'WALL' ? '#164821' : '#072b0f';
                        if (currentFillStyle !== bgStyle) {
                            ctx.fillStyle = bgStyle;
                            currentFillStyle = bgStyle;
                        }
                        ctx.fillRect(drawX, drawY, tileSize, tileSize);

                        // Impassable decorations warning (blocking crosses)
                        if (tile.decoration && tile.decoration.blocking && !tile.decoration.isEmptyness) {
                            const radarBgStyle = 'rgba(16, 185, 129, 0.12)';
                            if (currentFillStyle !== radarBgStyle) {
                                ctx.fillStyle = radarBgStyle;
                                currentFillStyle = radarBgStyle;
                            }
                            ctx.fillRect(drawX, drawY, tileSize, tileSize);
                            
                            obstacleBorderPath.rect(drawX + 0.5, drawY + 0.5, tileSize - 1, tileSize - 1);
                            obstacleCrossPath.moveTo(drawX + 2.5, drawY + 2.5);
                            obstacleCrossPath.lineTo(drawX + tileSize - 2.5, drawY + tileSize - 2.5);
                            obstacleCrossPath.moveTo(drawX + tileSize - 2.5, drawY + 2.5);
                            obstacleCrossPath.lineTo(drawX + 2.5, drawY + tileSize - 2.5);
                        }

                        // Portal structures
                        if (tile.type === 'PORTAL') {
                            portalsToDraw.push({ x: tileCenterX, y: tileCenterY, dir: tile.portal?.targetDirection });
                        }

                        // Wall outlines compilation
                        if (shouldDrawWallBorder(tile, tx, ty - 1)) {
                            wallPath.moveTo(drawX, drawY);
                            wallPath.lineTo(drawX + tileSize, drawY);
                        }
                        if (shouldDrawWallBorder(tile, tx, ty + 1)) {
                            wallPath.moveTo(drawX, drawY + tileSize);
                            wallPath.lineTo(drawX + tileSize, drawY + tileSize);
                        }
                        if (shouldDrawWallBorder(tile, tx - 1, ty)) {
                            wallPath.moveTo(drawX, drawY);
                            wallPath.lineTo(drawX, drawY + tileSize);
                        }
                        if (shouldDrawWallBorder(tile, tx + 1, ty)) {
                            wallPath.moveTo(drawX + tileSize, drawY);
                            wallPath.lineTo(drawX + tileSize, drawY + tileSize);
                        }

                        // Door boundaries
                        if (tile.type === 'DOOR') {
                            const wallsVertical = isWall(tx, ty - 1) || isWall(tx, ty + 1);
                            const wallsHorizontal = isWall(tx - 1, ty) || isWall(tx + 1, ty);

                            if (wallsVertical && !wallsHorizontal) {
                                doorPath.moveTo(tileCenterX, drawY);
                                doorPath.lineTo(tileCenterX, drawY + tileSize);
                            } else {
                                doorPath.moveTo(drawX, tileCenterY);
                                doorPath.lineTo(drawX + tileSize, tileCenterY);
                            }
                        }
                    }

                    // Dynamically active actors and objects with cached line-of-sight checks
                    const hasItems = tile.items && tile.items.length > 0;
                    const hasEnemy = !!tile.enemyId;
                    if (hasItems || hasEnemy) {
                        const targetPos = { x: tx, y: ty };
                        const cacheKey = `${roundPX},${roundPY},${tx},${ty}`;
                        
                        let hasLos = losCacheRef.current.get(cacheKey);
                        if (hasLos === undefined) {
                            hasLos = hasLineOfSight(playerPos, targetPos, grid, gridWidth, gridHeight, "PLAYER", false, false);
                            losCacheRef.current.set(cacheKey, hasLos);
                        }

                        if (hasLos) {
                            if (hasItems) {
                                itemsPath.moveTo(tileCenterX + 1.5, tileCenterY);
                                itemsPath.arc(tileCenterX, tileCenterY, 1.5, 0, Math.PI * 2);
                            }
                            if (tile.enemyId) {
                                const isNpc = tile.enemyId.startsWith('npc_');
                                if (isNpc) {
                                    npcPath.moveTo(tileCenterX + 3, tileCenterY);
                                    npcPath.arc(tileCenterX, tileCenterY, 3, 0, Math.PI * 2);
                                } else {
                                    hostilePath.moveTo(tileCenterX + 3, tileCenterY);
                                    hostilePath.arc(tileCenterX, tileCenterY, 3, 0, Math.PI * 2);
                                }
                            }
                        }
                    }
                }
            }

            // BATCH RENDER STAGES FOR MAXIMUM GPU/CANVAS PIPELINE SATURATION
            
            // Stage 1: Wall boundaries
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
            ctx.lineWidth = 1.25;
            ctx.stroke(wallPath);

            // Stage 2: Impassable decoration warning borders and cross (X) glyphs
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            ctx.lineWidth = 0.75;
            ctx.stroke(obstacleBorderPath);
            ctx.stroke(obstacleCrossPath);

            // Stage 3: High-contrast doors
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 1.5;
            ctx.stroke(doorPath);

            // Stage 4: Interactive drop items
            ctx.fillStyle = '#9ca3af';
            ctx.fill(itemsPath);

            // Stage 5: Living entities (NPCs / Hostiles)
            ctx.fillStyle = '#22c55e';
            ctx.fill(npcPath);
            
            ctx.fillStyle = '#ef4444';
            ctx.fill(hostilePath);

            // Stage 6: High-visibility cyber-portals direction indicators
            const portalsLen = portalsToDraw.length;
            if (portalsLen > 0) {
                for (let i = 0; i < portalsLen; i++) {
                    const portal = portalsToDraw[i];
                    ctx.save();
                    ctx.translate(portal.x, portal.y);

                    const dir = portal.dir || 'N';
                    let angle = 0;
                    if (dir === 'E') angle = Math.PI / 2;
                    else if (dir === 'S') angle = Math.PI;
                    else if (dir === 'W') angle = -Math.PI / 2;
                    ctx.rotate(angle);

                    ctx.fillStyle = '#a855f7'; // Neon amethyst purple
                    ctx.strokeStyle = '#f472b6'; // Hot cyber pink border
                    ctx.lineWidth = 0.75;

                    ctx.beginPath();
                    // Sharp arrow shape matching navigation layout, offset for perfect local alignment
                    ctx.moveTo(0, -3.5);
                    ctx.lineTo(3, 0.5);
                    ctx.lineTo(1, 0.5);
                    ctx.lineTo(1, 3.5);
                    ctx.lineTo(-1, 3.5);
                    ctx.lineTo(-1, 0.5);
                    ctx.lineTo(-3, 0.5);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();

                    ctx.restore();
                }
            }
        }

        // Draw player indicator at the center
        ctx.save();
        ctx.translate(cx, cy);

        const angleRad = (playerDir ?? 0) * (Math.PI / 2) - Math.PI / 2;
        ctx.rotate(angleRad);

        ctx.fillStyle = '#34d399';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        
        ctx.beginPath();
        ctx.moveTo(4, 0);       // nose
        ctx.lineTo(-3, -3);     // left wing
        ctx.lineTo(-1.5, 0);    // back dent
        ctx.lineTo(-3, 3);      // right wing
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

    }, [hasDigitalMap, playerX, playerY, playerDir, grid]);

    return (
        <div 
            className="absolute top-2 right-2 flex flex-col items-end gap-2 pointer-events-none z-[100]"
            style={{
                transform: `scale(${viewScale})`,
                transformOrigin: 'right top'
            }}
        >
            {/* Top row: Badges */}
            <div className="flex items-center gap-2">
                {/* Almost Broken Items Badge */}
                {almostBrokenSlots.length > 0 && (
                    <div className="relative z-[100] px-2 py-0.5 md:px-3 md:py-1 lg:px-4 lg:py-1.5 bg-black/80 border border-red-900/50 rounded-[2px] flex items-center gap-1.5 md:gap-2 lg:gap-3 shadow-sm">
                        {almostBrokenSlots.map((slotInfo, index) => {
                            const assetImg = slotInfo.item && spriteMap ? spriteMap.get(slotInfo.item.assetId) : null;

                            if (assetImg?.src) {
                                return (
                                    <div key={index} className="relative inline-flex items-center justify-center">
                                        <img 
                                            src={assetImg.src} 
                                            referrerPolicy="no-referrer"
                                            crossOrigin="anonymous"
                                            alt={slotInfo.item?.name || strings?.ui?.header?.weapon || "Item"}
                                            className={`w-auto h-3.5 md:h-4.5 lg:h-[22px] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${slotInfo.isBroken ? 'grayscale' : 'animate-[pulse_1.5s_infinite]'}`}
                                            style={{ imageRendering: 'pixelated' }}
                                            decoding="sync"
                                        />
                                    </div>
                                );
                            }

                            const isWeapon = slotInfo.slot === 'weapon' || slotInfo.slot === 'weaponAkimbo' || slotInfo.item?.type === 'WEAPON';
                            let Icon = WeaponIcon;
                            if (!isWeapon) {
                                if (slotInfo.slot === 'helmet') Icon = Skull;
                                else if (slotInfo.slot === 'vest') Icon = Shirt;
                                else if (slotInfo.slot === 'pants') Icon = Columns;
                                else if (slotInfo.slot === 'boots') Icon = Footprints;
                                else if (slotInfo.slot?.startsWith('accessory')) Icon = Gem;
                            }

                            return (
                                <div key={index} className="relative inline-flex items-center justify-center">
                                    <Icon className={`w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 ${slotInfo.isBroken ? 'text-red-700 grayscale' : 'text-red-500 animate-pulse'}`} />
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Ammo Badge */}
                {activeWeapon?.currentAmmo !== undefined && (
                    <div 
                        data-tutorial-target="AMMO_BADGE" 
                        className="relative z-[100] tutorial-highlight px-2 py-0.5 md:px-3 md:py-1 lg:px-4 lg:py-1.5 bg-black/80 border border-gray-700/50 rounded-[2px] flex items-center gap-1.5 md:gap-2 lg:gap-3 shadow-sm"
                    >
                        <BulletIcon className="text-gray-400 w-2.5 h-2.5 md:w-3.5 md:h-3.5 lg:w-5 lg:h-5" />
                        <span className="text-[10px] md:text-sm lg:text-base font-['Jura'] font-bold tracking-tight flex items-center">
                            {activeAkimboWeapon?.currentAmmo !== undefined ? (
                                <>
                                    <span className={`${activeAkimboWeapon.currentAmmo === 0 ? 'text-red-500 animate-pulse' : 'text-gray-300'}`}>
                                        {activeAkimboWeapon.currentAmmo}
                                    </span>
                                    <span className="text-gray-500 mx-1">|</span>
                                    <span className={`${activeWeapon.currentAmmo === 0 ? 'text-red-500 animate-pulse' : 'text-gray-300'}`}>
                                        {activeWeapon.currentAmmo}
                                    </span>
                                </>
                            ) : (
                                <span className={`${activeWeapon.currentAmmo === 0 ? 'text-red-500 animate-pulse' : 'text-gray-300'}`}>
                                    {activeWeapon.currentAmmo}
                                </span>
                            )}
                            <span className="text-gray-500 ml-1">/ {totalAmmoInInventory}</span>
                        </span>
                    </div>
                )}
            </div>

            {/* Digital Map (screen only, no body casing or labels) */}
            {hasDigitalMap && (
                <div className="relative z-[100] w-24 h-18 md:w-32 md:h-24 lg:w-40 lg:h-30 bg-[#020a05] border border-emerald-500/15 overflow-hidden select-none shadow-[0_4px_16px_rgba(0,0,0,0.8),0_0_12px_rgba(16,185,129,0.15)] flex flex-col">
                    <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes digital-map-scanline {
                            0% { top: -20px; }
                            70% { top: 110%; }
                            100% { top: 110%; }
                        }
                        @keyframes digital-map-flicker {
                            0%, 100% { opacity: 0.98; }
                            50% { opacity: 1.0; }
                        }
                    ` }} />
                    <div className="relative flex-1 bg-[#020a05] overflow-hidden animate-[digital-map-flicker_0.15s_infinite]">
                        {/* Scanlines overlay using repeating linear gradient */}
                        <div 
                            className="absolute inset-0 pointer-events-none z-10 opacity-15" 
                            style={{
                                backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
                                backgroundSize: '100% 4px'
                            }}
                        />
                        {/* Moving Scanline Bar */}
                        <div 
                            className="absolute inset-x-0 h-[2px] bg-emerald-400/80 shadow-[0_0_4px_rgba(52,211,153,0.8)] pointer-events-none z-20"
                            style={{
                                animation: 'digital-map-scanline 6s linear infinite'
                            }}
                        />
                        {/* Soft backlight sweep behind the line */}
                        <div 
                            className="absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent pointer-events-none z-20"
                            style={{
                                animation: 'digital-map-scanline 6s linear infinite'
                            }}
                        />
                        {/* Glowing Vignette */}
                        <div className="absolute inset-0 shadow-[inset_0_0_8px_rgba(52,211,153,0.45)] pointer-events-none z-10" />
                        <div className="absolute inset-0 bg-gradient-radial from-transparent to-black/35 pointer-events-none z-10" />

                        {grid ? (
                            <canvas 
                                ref={canvasRef}
                                width={128}
                                height={96}
                                className="w-full h-full scale-[1.01]"
                                style={{ imageRendering: 'pixelated' }}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[6px] md:text-[8px] text-emerald-600 font-bold animate-pulse text-center uppercase">
                                —
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Compass (if exists in inventory) */}
            {hasCompass && (
                <div className="relative z-[100] w-10 h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 bg-black/80 border border-gray-700/50 rounded-full flex items-center justify-center shadow-sm overflow-hidden">
                    <div className="absolute inset-0 border-2 border-gray-800 rounded-full"></div>
                    <div 
                        className="relative w-full h-full transition-transform duration-300 ease-out flex items-center justify-center"
                        style={{ transform: `rotate(${compassRotation}deg)` }}
                    >
                        <span className="absolute top-[2px] left-1/2 -translate-x-1/2 text-[8px] md:text-[10px] font-bold text-red-500 leading-none">N</span>
                        <span className="absolute right-[2px] top-1/2 -translate-y-1/2 text-[8px] md:text-[10px] font-bold text-gray-400 leading-none">E</span>
                        <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 text-[8px] md:text-[10px] font-bold text-gray-400 leading-none">S</span>
                        <span className="absolute left-[2px] top-1/2 -translate-y-1/2 text-[8px] md:text-[10px] font-bold text-gray-400 leading-none">W</span>
                        
                    </div>
                    {/* Fixed pointer in the center */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center drop-shadow-md">
                        <div className="w-[3px] h-[3px] bg-gray-400 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10" />
                        <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[10px] md:border-b-[14px] border-l-transparent border-r-transparent border-b-red-500 relative z-20"></div>
                        <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[10px] md:border-t-[14px] border-l-transparent border-r-transparent border-t-gray-300 relative z-20"></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(TopRightBadges);
