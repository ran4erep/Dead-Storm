import { useCallback } from 'react';
import { GameState, Player } from '../types';

export function useCombatActions({
    strings,
    levelData,
    player,
    setPlayer,
    combat,
    setCombat,
    setGameState,
    addLog,
    triggerEnemyTurn,
    escapeDirection,
    inventorySys
}: {
    strings: any;
    levelData: any;
    player: Player;
    setPlayer: (updater: (prev: Player) => Player) => void;
    combat: any;
    setCombat: (updater: any) => void;
    setGameState: (state: GameState) => void;
    addLog: (msg: string, type: any) => void;
    triggerEnemyTurn: (skipPlayer?: boolean, activeGroupOverride?: any[], isEscape?: boolean) => void;
    escapeDirection: number;
    inventorySys: any;
}) {
    const handleEscapeResult = useCallback((success: boolean) => {
        if (!strings || !levelData) return;
        if (success && escapeDirection !== 0) {
            const d = Math.round(player.dir); 
            const forwardDelta = [[0, -1], [1, 0], [0, 1], [-1, 0]][d];
            const newX = player.pos.x + forwardDelta[0] * escapeDirection;
            const newY = player.pos.y + forwardDelta[1] * escapeDirection;
            setCombat({isActive: false, activeGroup: [], log:[], lastPlayerHit: 0, isProcessingTurn: false, activeAttackerId: null, startTime: 0});
            setGameState(GameState.PLAYING);
            setPlayer(prev => ({...prev, pos: {x: newX, y: newY}, dir360: prev.dir })); 
            addLog(strings.logs.escape_success, 'SUCCESS');
        } else { 
            addLog(strings.logs.escape_fail, 'DANGER'); 
            triggerEnemyTurn(true); 
        }
    }, [strings, levelData, escapeDirection, player.dir, player.pos.x, player.pos.y, setCombat, setGameState, setPlayer, addLog, triggerEnemyTurn]);

    const handleCombatTimeout = useCallback((mode: 'ATTACK' | 'ESCAPE' | 'RELOAD') => { 
        if (!strings || combat.isProcessingTurn) return; 
        addLog(strings.combat.timeout, 'DANGER'); 
        triggerEnemyTurn(true, [], mode === 'ESCAPE'); 
    }, [strings, combat.isProcessingTurn, addLog, triggerEnemyTurn]);

    const handleReloadResult = useCallback((success: boolean) => { 
        if (!strings || !player.equippedWeapon) return; 
        if (success) { 
            inventorySys.handleReloadAction(true); 
        } else { 
            addLog(strings.logs.reload_fail, 'DANGER'); 
        } 
        triggerEnemyTurn(false); 
    }, [strings, player.equippedWeapon, inventorySys, addLog, triggerEnemyTurn]);

    return {
        handleEscapeResult,
        handleCombatTimeout,
        handleReloadResult
    };
}
