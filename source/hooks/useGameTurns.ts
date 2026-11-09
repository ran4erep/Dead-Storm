import React, { useEffect, useRef, useCallback } from 'react';
import { GameState, Tile } from '../types';

export function useGameTurns({
    combat,
    triggerRoamingTurn,
    tickExplosives,
    handleExplosion,
    onTurnStart,
    activeExplosionsRef,
    processEffects
}: {
    combat: any;
    triggerRoamingTurn: (playerPosOverride?: {x: number, y: number}, gridOverride?: Tile[][]) => Tile[][];
    tickExplosives: (callback: (x: number, y: number, dmg: string, range: number, assetId: string, wallTex?: string, explosionGrid?: Tile[][], soundId?: string, itemType?: string, itemDuration?: number) => void, gridOverride?: Tile[][], onTickComplete?: (newGrid: Tile[][]) => void) => void;
    handleExplosion: (x: number, y: number, dmg: string, range: number, assetId: string, wallTex?: string, playerPosOverride?: {x: number, y: number}, explosionGrid?: Tile[][], ignoredTiles?: Set<string>, soundId?: string, itemType?: string, itemDuration?: number) => void;
    onTurnStart?: (playerPosOverride?: {x: number, y: number}, gridOverride?: Tile[][]) => void;
    activeExplosionsRef?: React.MutableRefObject<number>;
    processEffects?: () => void;
}) {
    const prevCombatProcessing = useRef(false);

    // Effect to trigger roaming logic AFTER combat turn finishes
    useEffect(() => {
        if (prevCombatProcessing.current && !combat.isProcessingTurn && combat.isActive) {
            // Combat turn just finished, but combat is still active.
            // Trigger roaming enemies now.
            triggerRoamingTurn();
        }
        prevCombatProcessing.current = combat.isProcessingTurn;
    }, [combat.isProcessingTurn, combat.isActive, triggerRoamingTurn]);

    const handleGameTurn = useCallback((playerPosOverride?: {x: number, y: number}, gridOverride?: Tile[][]) => {
        return triggerRoamingTurn(playerPosOverride, gridOverride);
    }, [triggerRoamingTurn]);

    const handleCombatTurnWrapper = useCallback(() => {
        // The combat system handles the enemy AI turn internally
        tickExplosives(
            (x, y, dmg, range, assetId, wallTex, explosionGrid, soundId, itemType, itemDuration) => handleExplosion(x, y, dmg, range, assetId, wallTex, undefined, explosionGrid, undefined, soundId, itemType, itemDuration),
            undefined,
            (newGrid) => {
                if (onTurnStart) onTurnStart(undefined, newGrid); // apply damage at the very end
            }
        );
    }, [tickExplosives, handleExplosion, onTurnStart]);

    const handleGameTurnWrapper = useCallback((playerPosOverride?: {x: number, y: number}, gridOverride?: Tile[][]) => {
        if (activeExplosionsRef && activeExplosionsRef.current > 0) {
            setTimeout(() => handleGameTurnWrapper(playerPosOverride, gridOverride), 100);
            return;
        }
        const newGrid = handleGameTurn(playerPosOverride, gridOverride);
        if (processEffects) {
            processEffects();
        }
        tickExplosives(
            (x, y, dmg, range, assetId, wallTex, explosionGrid, soundId, itemType, itemDuration) => handleExplosion(x, y, dmg, range, assetId, wallTex, playerPosOverride, explosionGrid, undefined, soundId, itemType, itemDuration), 
            newGrid,
            (finalGrid) => {
                if (onTurnStart) onTurnStart(playerPosOverride, finalGrid);
            }
        );
    }, [tickExplosives, handleExplosion, handleGameTurn, onTurnStart, processEffects]);

    return {
        handleGameTurn,
        handleCombatTurnWrapper,
        handleGameTurnWrapper
    };
}
