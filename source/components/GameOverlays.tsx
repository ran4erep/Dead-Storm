import React from 'react';
import AimingControls from './AimingControls';
import ThrowingControls from './ThrowingControls';
import InspectingControls from './InspectingControls';
import CombatOverlay from './CombatOverlay';
import ThrowOverlay from './ThrowOverlay';
import { GameState } from '../types';

interface GameOverlaysProps {
    gameState: GameState;
    strings: any;
    handleAimInputWithAnim: (action: string) => void;
    handleThrowInputWithAnim: (action: string) => void;
    handleInspectInputWithAnim: (action: string) => void;
    throwAnim: any;
    throwAnimRef?: any;
    combat: any;
    activeCombatEnemies: any;
    enemies: any;
    player: any;
    setPlayer: React.Dispatch<React.SetStateAction<any>>;
    addLog: (text: string, type?: any) => void;
    activeWeapon: any;
    settings: any;
    escapeDirection: number;
    combatTimerBonus: number;
    handlePlayerAttack: (tid: string | null, dmg: number, crit: boolean, fail: boolean, force?: boolean, armorHitIndex?: number) => boolean;
    handleVisualHit: (id: string, dmg: number, crit: boolean) => void;
    handleEscapeResult: (success: boolean) => void;
    handleReloadResult: (success: boolean) => void;
    handleCombatTimeout: () => void;
    activeModal: string | null;
    showPauseMenu: boolean;
    showSettings: boolean;
    showDebug: boolean;
    showVolume: boolean;
    preparePlayerAttack: (targetId: string) => void;
    triggerMuzzleFlash: () => void;
    totalAmmoInInventory: number;
    inventorySys: any;
    inventoryStats: { currentLoad: number; maxCapacity: number };
    visualHitIds: string[];
    isWeaponBroken: boolean;
    isAkimboWeaponBroken: boolean;
    RAYCASTER_WIDTH: number;
    RAYCASTER_HEIGHT: number;
    spriteMap: any;
    levelData: any;
    currentNode: any;
    dialogueNPCName: string;
    dialogueNPCAsset: string;
    dialogueNPCInstanceId: string | null;
    dialogueNPCDefinitionId: string | null;
    playerPortrait: string;
    selectedOptionIndex: number;
    localize: (text: string) => string;
    getDisplayText: (text: string) => string;
    lastNpcText: string;
    playerRawName: string;
    dialogueNPCVoice: any;
    animations: any;
    playSound?: (sound: string) => void;
    onSpawnParticles?: (particles: any[]) => void;
    isRadioDialogue: boolean;
    handleDirectChoice?: (index: number) => void;
    lookAroundPitch?: number;
}

const GameOverlays: React.FC<GameOverlaysProps> = ({
    gameState, strings, handleAimInputWithAnim, handleThrowInputWithAnim, handleInspectInputWithAnim, throwAnim, throwAnimRef,
    combat, activeCombatEnemies, enemies, player, activeWeapon, settings, escapeDirection,
    combatTimerBonus, handlePlayerAttack, handleVisualHit, handleEscapeResult,
    handleReloadResult, handleCombatTimeout, activeModal, showPauseMenu, showSettings,
    showDebug, showVolume, preparePlayerAttack, triggerMuzzleFlash, totalAmmoInInventory,
    inventorySys, inventoryStats, visualHitIds, isWeaponBroken, isAkimboWeaponBroken, RAYCASTER_WIDTH,
    RAYCASTER_HEIGHT, spriteMap, levelData, currentNode, dialogueNPCName, dialogueNPCAsset, dialogueNPCInstanceId, dialogueNPCDefinitionId,
    playerPortrait, selectedOptionIndex, localize, getDisplayText, lastNpcText, playerRawName,
    dialogueNPCVoice, animations, setPlayer, addLog, playSound, onSpawnParticles, isRadioDialogue, handleDirectChoice, lookAroundPitch
}) => {
    const activeAkimboWeapon = player.equipment.weaponAkimbo || (activeWeapon?.id === 'fists_weapon' ? activeWeapon : null);

    return (
        <>
            {gameState === GameState.AIMING && (
                <AimingControls 
                    strings={strings.ui.controls} 
                    onAttack={() => handleAimInputWithAnim('ATTACK')} 
                    onCancel={() => handleAimInputWithAnim('CANCEL')} 
                    invertContextButtons={settings?.invertContextButtons}
                />
            )}
            {gameState === GameState.THROWING && !throwAnim && (
                <ThrowingControls 
                    strings={strings.ui.controls} 
                    onThrow={() => handleThrowInputWithAnim('ATTACK')} 
                    onCancel={() => handleThrowInputWithAnim('CANCEL')} 
                    invertContextButtons={settings?.invertContextButtons}
                />
            )}
            {gameState === GameState.INSPECTING && (
                <InspectingControls 
                    strings={strings.ui.controls}
                    onInspect={() => handleInspectInputWithAnim('SELECT')}
                    onCancel={() => handleInspectInputWithAnim('CANCEL')}
                    invertContextButtons={settings?.invertContextButtons}
                />
            )}
            {(combat.isActive || settings.debug.combatOverlayDebug) && (
                <CombatOverlay 
                    enemies={activeCombatEnemies} 
                    playerHp={player.hp} 
                    playerMaxHp={player.maxHp} 
                    playerStats={player.stats} 
                    playerDir={player.dir} 
                    playerDir360={player.dir360} 
                    weaponAccuracy={activeWeapon?.accuracy ?? 0.5} 
                    weaponDamage={activeWeapon?.damageDice || "1"} 
                    akimboWeaponDamage={activeAkimboWeapon?.damageDice} 
                    weaponShootType={activeWeapon?.shootType}
                    weaponRange={activeWeapon?.range ?? 1} 
                    lastPlayerHit={combat.lastPlayerHit} 
                    isProcessingTurn={combat.isProcessingTurn || (combat.isActive && !!throwAnim)} 
                    strings={strings.combat} 
                    language={settings.language} 
                    activeAttackerId={combat.activeAttackerId} 
                    totalCombatants={combat.activeGroup.filter((g: any) => {
                        if (g.id.startsWith('decor_')) return false;
                        if (g.id.startsWith('npc_')) return false;
                        const e = enemies?.get(g.id);
                        if (e && e.isNPC) return false;
                        return true;
                    }).length} 
                    escapeBlocked={escapeDirection === 0} 
                    turnDuration={1500 + combatTimerBonus} 
                    onPlayerAttack={(tid, dmg, crit, fail, force, armorHitIndex) => { 
                        return handlePlayerAttack(tid, dmg, crit, fail, force, armorHitIndex); 
                    }} 
                    onVisualHit={handleVisualHit} 
                    onEscape={handleEscapeResult} 
                    onReload={handleReloadResult} 
                    onTimeout={handleCombatTimeout} 
                    isPaused={(activeModal !== null && activeModal !== 'actions' && activeModal !== 'loot') || showPauseMenu || showSettings || showDebug || showVolume || gameState === GameState.THROWING} 
                    onAttackStart={preparePlayerAttack} 
                    onFlashImmediate={() => { 
                        const isDelayed = activeWeapon?.muzzleFrame && activeWeapon.muzzleFrame > 1;
                        if(activeWeapon?.muzzleFlash && !isDelayed) triggerMuzzleFlash(); 
                    }} 
                    currentAmmo={activeWeapon?.currentAmmo} 
                    magazineMax={activeWeapon?.magazineMax} 
                    akimboAmmo={activeAkimboWeapon?.currentAmmo} 
                    akimboMagazineMax={activeAkimboWeapon?.magazineMax} 
                    totalAmmo={totalAmmoInInventory} 
                    manualReloadTrigger={inventorySys.manualReloadTrigger} 
                    isTimerEnabled={settings.debug.combatTimer && !settings.debug.combatOverlayDebug} 
                    visualHitIds={visualHitIds} 
                    hideSprites={true} 
                    crtEffect={settings.crtEffect} 
                    isWeaponBroken={isWeaponBroken} 
                    isAkimboWeaponBroken={isAkimboWeaponBroken} 
                    hasAkimboWeapon={!!activeAkimboWeapon} 
                    playSound={playSound}
                    isDebugMode={settings.debug.combatOverlayDebug}
                    invertContextButtons={settings?.invertContextButtons}
                />
            )}
            {(throwAnimRef?.current || throwAnim) && (
                <ThrowOverlay 
                    player={player} 
                    throwAnim={throwAnim} 
                    throwAnimRef={throwAnimRef}
                    width={RAYCASTER_WIDTH} 
                    height={RAYCASTER_HEIGHT} 
                    sprites={spriteMap} 
                    lightMap={levelData?.lightMap} 
                    animations={animations}
                    onSpawnParticles={onSpawnParticles}
                    levelData={levelData}
                    lookAroundPitch={lookAroundPitch}
                />
            )}
        </>
    );
};

export default React.memo(GameOverlays, (prev, next) => {
    if (prev.gameState !== next.gameState) return false;
    if (prev.throwAnim !== next.throwAnim) return false;
    if (prev.combat.isActive !== next.combat.isActive) return false;
    if (prev.activeModal !== next.activeModal) return false;
    if (prev.showPauseMenu !== next.showPauseMenu) return false;
    if (prev.showSettings !== next.showSettings) return false;
    if (prev.showDebug !== next.showDebug) return false;
    if (prev.showVolume !== next.showVolume) return false;
    if (prev.isWeaponBroken !== next.isWeaponBroken) return false;
    if (prev.isAkimboWeaponBroken !== next.isAkimboWeaponBroken) return false;
    if (prev.totalAmmoInInventory !== next.totalAmmoInInventory) return false;
    if (prev.settings !== next.settings) return false;
    if (prev.inventorySys.manualReloadTrigger !== next.inventorySys.manualReloadTrigger) return false;
    if (prev.lookAroundPitch !== next.lookAroundPitch) return false;
    
    if (prev.combat.isActive || prev.settings?.debug?.combatOverlayDebug || next.settings?.debug?.combatOverlayDebug) {
        if (prev.combat !== next.combat) return false;
        if (prev.activeCombatEnemies !== next.activeCombatEnemies) return false;
        if (prev.player.hp !== next.player.hp) return false;
        if (prev.player.maxHp !== next.player.maxHp) return false;
        if (prev.player.stats !== next.player.stats) return false;
        if (prev.player.dir !== next.player.dir) return false;
        if (prev.player.dir360 !== next.player.dir360) return false;
        if (prev.player.equipment?.weaponAkimbo !== next.player.equipment?.weaponAkimbo) return false;
        if (prev.activeWeapon !== next.activeWeapon) return false;
        if (prev.enemies !== next.enemies) return false;
        if (prev.escapeDirection !== next.escapeDirection) return false;
        if (prev.combatTimerBonus !== next.combatTimerBonus) return false;
        if (prev.visualHitIds !== next.visualHitIds) return false;
    }
    
    if (prev.throwAnim) {
        if (prev.player.pos.x !== next.player.pos.x || prev.player.pos.y !== next.player.pos.y) return false;
    }

    return true;
});
