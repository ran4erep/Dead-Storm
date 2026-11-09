import { useEffect, useRef } from 'react';
import { GameState, LevelDefinition } from '../types';

export function useC4BeepSystem(levelData: any | null, playSound: (id: string, pos?: {x: number, y: number}, soundId?: string, delay?: number, listenerPos?: {x: number, y: number}) => void, gameState: GameState) {
    const lastBeepTime = useRef(0);
    const explosivesRef = useRef<{x: number, y: number, side?: string, plantedByPos?: {x: number, y: number}}[]>([]);

    const lastGridRef = useRef<any>(null);

    useEffect(() => {
        if (!levelData || !levelData.grid) {
            explosivesRef.current = [];
            lastGridRef.current = null;
            return;
        }
        if (levelData.grid === lastGridRef.current) return;

        const explosives: {x: number, y: number, side?: string, plantedByPos?: {x: number, y: number}}[] = [];
        const cache = typeof window !== 'undefined' ? (window as any).explosivePositionsCache : null;
        if (cache && cache.size > 0) {
            for (const key of cache) {
                const [xStr, yStr] = key.split(',');
                const x = parseInt(xStr, 10);
                const y = parseInt(yStr, 10);
                const t = levelData.grid[y]?.[x];
                if (t && t.explosive) {
                    explosives.push({x, y, side: t.explosive.side, plantedByPos: t.explosive.plantedByPos});
                }
            }
        } else if (!cache) {
            // Fallback scan
            const height = levelData.grid.length;
            for (let y = 0; y < height; y++) {
                const row = levelData.grid[y];
                if (!row) continue;
                const width = row.length;
                for (let x = 0; x < width; x++) {
                    const t = row[x];
                    if (t && t.explosive) {
                        explosives.push({x, y, side: t.explosive.side, plantedByPos: t.explosive.plantedByPos});
                    }
                }
            }
        }
        explosivesRef.current = explosives;
        lastGridRef.current = levelData.grid;
    }, [levelData]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (explosivesRef.current.length === 0) return;
            if (gameState === GameState.GAME_OVER || 
                gameState === GameState.CREDITS || 
                gameState === GameState.MENU || 
                gameState === GameState.START_SCREEN || 
                gameState === GameState.CHAR_SELECT || 
                gameState === GameState.VICTORY) {
                return;
            }
            
            const now = performance.now();
            const cycle = 1000; // 1000ms cycle for 2fps animation
            const offset = now % cycle;
            // Play beep in the second half of the cycle (frame 1), once per cycle
            if (offset > 500 && (now - lastBeepTime.current > 800)) {
                explosivesRef.current.forEach(exp => {
                    let px = exp.x + 0.5;
                    let py = exp.y + 0.5;
                    const wallOffset = 0.5375; // Distance from center of tile to face of C4
                    if (exp.side === 'N') py -= wallOffset;
                    else if (exp.side === 'S') py += wallOffset;
                    else if (exp.side === 'E') px += wallOffset;
                    else if (exp.side === 'W') px -= wallOffset;
                    
                    playSound('SYS_BEEP', { x: px, y: py }, `BEEP_${exp.x}_${exp.y}`, 0, exp.plantedByPos);
                });
                lastBeepTime.current = now;
            }
        }, 100);

        return () => clearInterval(interval);
    }, [playSound, gameState]);
}
