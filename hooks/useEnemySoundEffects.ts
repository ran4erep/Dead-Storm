import { useMemo, useCallback } from 'react';
import { Player, Enemy } from '../types';

export function useEnemySoundEffects({
    levelData,
    player,
    playSound,
    combat,
    enemies
}: {
    levelData: any;
    player: Player;
    playSound: (soundId: string, pos?: { x: number, y: number }, volume?: number, delayMs?: number) => void;
    combat: any;
    enemies?: Map<string, Enemy>;
}) {
    // Compute active combat IDs for Roaming System filtering
    const activeCombatIds = useMemo(() => {
        const ids = new Set<string>();
        if (combat.activeGroup) {
            combat.activeGroup.forEach((g: any) => ids.add(g.id));
        }
        return ids;
    }, [combat.activeGroup]);

    const handleEnemyStep = useCallback((enemyId: string, x: number, y: number, stepIndex: number = 0, totalSteps: number = 1) => {
        if (!levelData || !playSound) return;
        
        const distSq = (x - player.pos.x)**2 + (y - player.pos.y)**2;
        // Optimize: Only play sound if reasonably close (within 15 tiles)
        if (distSq > 225) return;

        const animDuration = 300;
        // Trigger precisely at the beginning of each step's sub-animation
        const delay = (animDuration / totalSteps) * stepIndex;

        const enemyInst = enemies?.get(enemyId);
        if (enemyInst && enemyInst.sounds?.step) {
            playSound(enemyInst.sounds.step, {x, y}, undefined, delay);
        } else {
            const tile = levelData.grid[y]?.[x];
            if (tile && tile.footstepSound) {
                playSound(tile.footstepSound, {x, y}, undefined, delay);
            }
        }
    }, [levelData, player.pos, playSound, enemies]);

    return {
        activeCombatIds,
        handleEnemyStep
    };
}
