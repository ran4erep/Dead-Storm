
import React, { useRef, useEffect } from 'react';
import { Player, Tile, Enemy, Settings as SettingsType } from '../types';
import { X, Target, Crosshair, Home, Eye, EyeOff } from 'lucide-react';
import { hasLineOfSight, hasPitLineOfSight } from '../utils/combatLogic';

interface DebugMapProps {
    player: Player;
    levelData: { width: number; height: number; grid: Tile[][] } | null;
    enemies: Map<string, Enemy>;
    onClose: () => void;
    settings?: SettingsType;
    onUpdateSettings?: (newSettings: SettingsType) => void;
    strings?: any;
}

const TILE_SIZE = 24;

const DebugMap: React.FC<DebugMapProps> = ({ player, levelData, enemies, onClose, settings, onUpdateSettings, strings }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Color generation helper
    const getEnemyColor = (id: string) => {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 70%, 50%)`;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !levelData) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (containerRef.current) {
            canvas.width = containerRef.current.clientWidth;
            canvas.height = containerRef.current.clientHeight;
        }

        const mapWidth = levelData.width * TILE_SIZE;
        const mapHeight = levelData.height * TILE_SIZE;

        // Scale to fit logic
        const padding = 40;
        const availW = canvas.width - padding;
        const availH = canvas.height - padding;
        
        const scaleX = availW / mapWidth;
        const scaleY = availH / mapHeight;
        // Cap scale to reasonable limits (don't zoom in too much on tiny maps, ensure fit on large)
        const scale = Math.min(Math.min(scaleX, scaleY), 1.5);

        // Center map in canvas
        const offsetX = (canvas.width - mapWidth * scale) / 2;
        const offsetY = (canvas.height - mapHeight * scale) / 2;

        ctx.fillStyle = '#0f172a'; // Slate 900
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // 1. Draw Grid
        for (let y = 0; y < levelData.height; y++) {
            for (let x = 0; x < levelData.width; x++) {
                const tile = levelData.grid[y][x];
                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;

                // Base Tile
                if (tile.type === 'WALL') {
                    ctx.fillStyle = '#334155'; // Slate 700
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    ctx.strokeStyle = '#475569';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
                } else if (tile.type === 'DOOR') {
                    ctx.fillStyle = '#1e293b'; // Slate 800
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    
                    ctx.fillStyle = tile.door?.state === 'OPEN' ? '#059669' : '#b91c1c';
                    const doorW = tile.door?.dir === 'LEFT' || tile.door?.dir === 'RIGHT' ? 4 : TILE_SIZE;
                    const doorH = tile.door?.dir === 'LEFT' || tile.door?.dir === 'RIGHT' ? TILE_SIZE : 4;
                    const doorX = px + (TILE_SIZE - doorW) / 2;
                    const doorY = py + (TILE_SIZE - doorH) / 2;
                    ctx.fillRect(doorX, doorY, doorW, doorH);
                } else {
                    ctx.fillStyle = '#1e293b'; // Slate 800
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    ctx.strokeStyle = '#334155'; // Faint grid
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // 2. Draw AI Info
        enemies.forEach((enemy) => {
            if (enemy.hp <= 0) return;

            const color = getEnemyColor(enemy.id);
            
            // Find current position (scan grid)
            let ex = -1, ey = -1;
            for(let y=0; y<levelData.height; y++) {
                for(let x=0; x<levelData.width; x++) {
                    if (levelData.grid[y][x].enemyId === enemy.id) {
                        ex = x; ey = y; break;
                    }
                }
                if (ex !== -1) break;
            }

            if (ex !== -1) {
                // Draw Patrol Zone
                if (enemy.homePos && enemy.patrolRange) {
                    const hx = enemy.homePos.x * TILE_SIZE;
                    const hy = enemy.homePos.y * TILE_SIZE;
                    const rangePx = enemy.patrolRange * TILE_SIZE;
                    const zoneX = hx - rangePx;
                    const zoneY = hy - rangePx;
                    const zoneSize = (enemy.patrolRange * 2 + 1) * TILE_SIZE;

                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.1;
                    ctx.fillRect(zoneX, zoneY, zoneSize, zoneSize);
                    ctx.globalAlpha = 0.3;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(zoneX, zoneY, zoneSize, zoneSize);
                    
                    // Home Icon
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath();
                    ctx.arc(hx + TILE_SIZE/2, hy + TILE_SIZE/2, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Draw Path
                if (enemy.currentPath && enemy.currentPath.length > 0) {
                    ctx.globalAlpha = 0.8;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2 / scale; // Keep line thickness constant on screen
                    ctx.beginPath();
                    ctx.moveTo(ex * TILE_SIZE + TILE_SIZE/2, ey * TILE_SIZE + TILE_SIZE/2);
                    
                    enemy.currentPath.forEach(p => {
                        ctx.lineTo(p.x * TILE_SIZE + TILE_SIZE/2, p.y * TILE_SIZE + TILE_SIZE/2);
                    });
                    ctx.stroke();

                    // Target marker
                    const last = enemy.currentPath[enemy.currentPath.length - 1];
                    ctx.fillStyle = color;
                    ctx.fillRect(last.x * TILE_SIZE + 6, last.y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
                } else if (enemy.targetPos) {
                    // Direct line to target if no path calculated yet
                    ctx.globalAlpha = 0.4;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1 / scale;
                    ctx.setLineDash([4 / scale, 4 / scale]);
                    ctx.beginPath();
                    ctx.moveTo(ex * TILE_SIZE + TILE_SIZE/2, ey * TILE_SIZE + TILE_SIZE/2);
                    ctx.lineTo(enemy.targetPos.x * TILE_SIZE + TILE_SIZE/2, enemy.targetPos.y * TILE_SIZE + TILE_SIZE/2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Draw Enemy Dot
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(ex * TILE_SIZE + TILE_SIZE/2, ey * TILE_SIZE + TILE_SIZE/2, TILE_SIZE/3, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw ID/State Text with Inverse Scaling
                ctx.save();
                ctx.translate(ex * TILE_SIZE + TILE_SIZE/2, ey * TILE_SIZE - 6);
                // Invert scale so text size is constant in screen pixels (e.g. 10px)
                const textScale = 1 / scale;
                ctx.scale(textScale, textScale);
                
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                // Add background for readability
                const isFlashed = (enemy.flashDuration || 0) > 0;
                const stateText = isFlashed ? 'FLASHED' : (enemy.aiState || (enemy.currentPath?.length ? 'MOVING' : 'IDLE'));
                const label = `${enemy.name.split('/')[0]} (${stateText})`;
                const textMetrics = ctx.measureText(label);
                
                // Color coding for state
                if (isFlashed) ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // White
                else if (enemy.aiState === 'CHASE') ctx.fillStyle = 'rgba(245, 158, 11, 0.9)'; // Amber
                else if (enemy.aiState === 'COMBAT') ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'; // Red
                else if (enemy.aiState === 'INVESTIGATE') ctx.fillStyle = 'rgba(168, 85, 247, 0.9)'; // Purple
                else if (enemy.aiState === 'PATROL') ctx.fillStyle = 'rgba(59, 130, 246, 0.7)'; // Blue
                else ctx.fillStyle = 'rgba(0,0,0,0.7)'; // Default Dark

                ctx.fillRect(-textMetrics.width/2 - 2, -10, textMetrics.width + 4, 12);
                
                ctx.fillStyle = isFlashed ? '#000' : '#fff';
                ctx.fillText(label, 0, 0);
                ctx.restore();
            }
        });

        // 2.5 Draw Pit Line of Sight
        const isPitLineVisEnabled = settings?.debug?.pitLineVis;
        if (isPitLineVisEnabled && levelData) {
            const px = player.pos.x;
            const py = player.pos.y;
            
            enemies.forEach((enemy) => {
                if (enemy.hp <= 0) return;
                
                let ex = -1, ey = -1;
                for(let y=0; y<levelData.height; y++) {
                    for(let x=0; x<levelData.width; x++) {
                        if (levelData.grid[y][x].enemyId === enemy.id) {
                            ex = x; ey = y; break;
                        }
                    }
                    if (ex !== -1) break;
                }
                
                if (ex !== -1) {
                    const epos = { x: ex, y: ey };
                    const ppos = { x: px, y: py };
                    
                    const hasLos = hasLineOfSight(ppos, epos, levelData.grid, levelData.width, levelData.height, "PLAYER", false, false);
                    
                    const playerTile = levelData.grid[Math.floor(py)]?.[Math.floor(px)];
                    const enemyTile = levelData.grid[ey]?.[ex];
                    
                    const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
                    const playerInPit = isPitTile(playerTile);
                    const enemyInPit = isPitTile(enemyTile);
                    
                    let isPitBlocked = false;
                    let pitChecked = false;
                    
                    if (playerInPit || enemyInPit) {
                        pitChecked = true;
                        const hasPitLos = hasPitLineOfSight(ppos, epos, levelData.grid, levelData.width, levelData.height);
                        if (!hasPitLos) {
                            isPitBlocked = true;
                        }
                    }
                    
                    const visible = hasLos && !isPitBlocked;
                    
                    const startX = px * TILE_SIZE + TILE_SIZE / 2;
                    const startY = py * TILE_SIZE + TILE_SIZE / 2;
                    const endX = ex * TILE_SIZE + TILE_SIZE / 2;
                    const endY = ey * TILE_SIZE + TILE_SIZE / 2;
                    
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, endY);
                    
                    if (visible) {
                        ctx.strokeStyle = '#22c55e'; // Green
                        ctx.lineWidth = 2 / scale;
                    } else {
                        ctx.strokeStyle = '#ef4444'; // Red
                        ctx.lineWidth = 1.5 / scale;
                        ctx.setLineDash([3 / scale, 3 / scale]);
                    }
                    ctx.stroke();
                    ctx.restore();
                    
                    const midX = (startX + endX) / 2;
                    const midY = (startY + endY) / 2;
                    
                    ctx.save();
                    ctx.translate(midX, midY);
                    const lblScale = 0.85 / scale;
                    ctx.scale(lblScale, lblScale);
                    
                    const isRu = settings?.language === 'ru';
                    let labelText = '';
                    if (visible) {
                        labelText = pitChecked ? (isRu ? 'ЯМА: ОК' : 'PIT: OK') : (isRu ? 'ВИДЕН' : 'VISIBLE');
                    } else {
                        if (!hasLos) {
                            labelText = isRu ? 'СТЕНА' : 'WALL';
                        } else if (isPitBlocked) {
                            labelText = isRu ? 'ЯМА: БЛОК' : 'PIT: BLOCKED';
                        } else {
                            labelText = isRu ? 'ЗАБЛОК.' : 'BLOCKED';
                        }
                    }
                    
                    ctx.font = 'bold 8px monospace';
                    ctx.textAlign = 'center';
                    const textMetrics = ctx.measureText(labelText);
                    
                    ctx.fillStyle = visible ? 'rgba(22, 101, 52, 0.95)' : 'rgba(127, 29, 29, 0.95)';
                    ctx.fillRect(-textMetrics.width/2 - 3, -5, textMetrics.width + 6, 10);
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(labelText, 0, 2);
                    ctx.restore();
                }
            });
        }

        // 3. Draw Player
        const hasCompass = player.inventory.some(i => i.id === 'compass' || i.type === 'COMPASS');
        if (hasCompass || isPitLineVisEnabled) {
            const ppx = player.pos.x * TILE_SIZE + TILE_SIZE/2;
            const ppy = player.pos.y * TILE_SIZE + TILE_SIZE/2;
            
            ctx.fillStyle = '#22c55e'; // Green 500
            ctx.beginPath();
            ctx.arc(ppx, ppy, TILE_SIZE/3, 0, Math.PI * 2);
            ctx.fill();
            
            // Direction Arrow
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2 / scale;
            ctx.beginPath();
            ctx.moveTo(ppx, ppy);
            const angle = (player.dir360 - 1) * (Math.PI / 2);
            ctx.lineTo(ppx + Math.cos(angle) * TILE_SIZE * 0.8, ppy + Math.sin(angle) * TILE_SIZE * 0.8);
            ctx.stroke();
        }

        ctx.restore();

    }, [levelData, enemies, player, settings]);

    return (
        <div className="absolute inset-0 z-[300] bg-gray-900 flex flex-col">
            <div className="p-2 border-b border-gray-700 flex justify-between items-center bg-gray-950 shrink-0">
                <h2 className="text-sm font-bold text-gray-200 tracking-widest uppercase flex items-center gap-2">
                    <Target size={16} className="text-red-500" />
                    AI TACTICAL VIEW
                </h2>
                <div className="flex gap-4 text-[10px] text-gray-400">
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>PLAYER</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>ENEMY</div>
                    <div className="flex items-center gap-1"><Home size={10}/> ZONE</div>
                    <div className="flex items-center gap-1"><Crosshair size={10}/> PATH</div>
                </div>
                {settings && onUpdateSettings && (
                    <button 
                        onClick={() => onUpdateSettings({
                            ...settings,
                            debug: { ...settings.debug, pitLineVis: !settings.debug.pitLineVis }
                        })}
                        className={`px-3 py-1 flex items-center justify-center gap-1.5 rounded text-[10px] font-bold tracking-wider transition-all uppercase border select-none ${
                            settings.debug.pitLineVis 
                                ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300' 
                                : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                        }`}
                        title={strings?.ui?.settings?.debug_pit_line_vis_desc || "Toggle Pit Line of Sight Vis"}
                        id="debug-pit-toggle"
                    >
                        {settings.debug.pitLineVis ? <Eye size={12} className="text-indigo-400" /> : <EyeOff size={12} />}
                        <span>{strings?.ui?.settings?.debug_pit_line_vis || (settings.language === 'ru' ? 'ЛИНИЯ ЯМЫ' : 'PIT LOS')}</span>
                    </button>
                )}
                <button onClick={onClose} className="p-1 bg-red-900/50 text-red-200 rounded hover:bg-red-800">
                    <X size={20} />
                </button>
            </div>
            <div ref={containerRef} className="flex-1 overflow-auto bg-slate-900 relative">
                <canvas ref={canvasRef} className="block" />
            </div>
        </div>
    );
};

export default DebugMap;
