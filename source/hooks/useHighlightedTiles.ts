import { useMemo } from 'react';
import { GameState } from '../types';

export function useHighlightedTiles({
    gameState,
    aimingSys,
    throwingSys
}: {
    gameState: GameState;
    aimingSys: any;
    throwingSys: any;
}) {
    const currentHighlightedTiles = useMemo(() => { 
        if (gameState === GameState.AIMING && aimingSys.aimingTargets.length > 0) {
            const target = aimingSys.aimingTargets[aimingSys.aimTargetIndex]; if (!target) return []; 
            return target.pathToTarget.map((p: any) => ({ x: p.x, y: p.y, color: 'red' })); 
        }
        if (gameState === GameState.THROWING && throwingSys.targetCoords) {
            return [{ x: throwingSys.targetCoords.x, y: throwingSys.targetCoords.y, color: throwingSys.isBlocked ? 'gray' : 'red' }];
        }
        return [];
    }, [gameState, aimingSys.aimingTargets, aimingSys.aimTargetIndex, throwingSys.targetCoords, throwingSys.isBlocked]);

    return { currentHighlightedTiles };
}
