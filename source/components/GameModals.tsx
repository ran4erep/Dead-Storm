import React from 'react';
import ActionsModal from './ActionsModal';
import LootModal from './LootModal';
import StatsModal from './StatsModal';
import InventoryModal from './InventoryModal';
import EquipmentModal from './EquipmentModal';
import LocationModal from './LocationModal';
import CraftingModal from './CraftingModal';
import PauseMenu from './PauseMenu';
import SettingsModal from './SettingsModal';
import SaveModal from './SaveModal';
import LoadModal from './LoadModal';
import ChessModal from './ChessModal';
import { GameState } from '../types';

interface GameModalsProps {
    engine?: any;
    activeModal: string | null;
    showPauseMenu: boolean;
    showSettings: boolean;
    showDebug: boolean;
    showVolume: boolean;
    strings: any;
    combat: any;
    gameState: GameState;
    canAim: boolean;
    currentMovementSys: any;
    inventorySys: any;
    handleShootWrapper: () => void;
    handleSkipTurn: () => void;
    toggleModal: (modal: any) => void;
    setShowPauseMenu: (show: boolean) => void;
    lootData: any;
    spriteMap: any;
    player: any;
    setPlayer: any;
    inventoryStats: any;
    throwingSys: any;
    settings: any;
    levelData: any;
    returnToMenu: () => void;
    setShowSettings: (show: boolean) => void;
    setSettings: (settings: any) => void;
    setShowDebug: (show: boolean) => void;
    setShowVolume: (show: boolean) => void;
    gainLevel: () => void;
    playSound: (sound: string) => void;
    addLog: (msg: string, type: string) => void;
    setActiveModal: (modal: any) => void;
    setGameState: (state: GameState) => void;
    setLookAroundAngle: (angle: number) => void;
    setLookAroundPitch: (pitch: number) => void;
}

const GameModals: React.FC<GameModalsProps> = ({
    engine,
    activeModal, showPauseMenu, showSettings, showDebug, showVolume,
    strings, combat, gameState, canAim, currentMovementSys, inventorySys,
    handleShootWrapper, handleSkipTurn, toggleModal, setShowPauseMenu,
    lootData, spriteMap, player, setPlayer, inventoryStats, throwingSys,
    settings, levelData, returnToMenu, setShowSettings, setSettings,
    setShowDebug, setShowVolume, gainLevel, playSound, addLog, setActiveModal,
    setGameState, setLookAroundAngle, setLookAroundPitch
}) => {
    const getFrontTile = (px: number, py: number, dir: number) => {
        const d = Math.round(dir);
        let fx = px, fy = py;
        if (d === 0) fy -= 1;
        else if (d === 1) fx += 1;
        else if (d === 2) fy += 1;
        else if (d === 3) fx -= 1;
        return { x: fx, y: fy };
    };

    const frontTilePos = player ? getFrontTile(player.pos.x, player.pos.y, player.dir) : null;
    const frontTile = frontTilePos && levelData?.grid ? levelData.grid[frontTilePos.y]?.[frontTilePos.x] : null;

    const handledModals = ['actions', 'loot', 'stats', 'inventory', 'equipment', 'location', 'crafting', 'save', 'load', 'inspect', 'chess'];
    const hasAnyModal = (activeModal && handledModals.includes(activeModal)) || showPauseMenu || showSettings || showDebug || showVolume;

    if (!hasAnyModal) return null;

    return (
        <div 
            id="game-modals-overlay"
            className="absolute inset-0 z-[250] pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => {
                const target = e.target as HTMLElement;
                const btn = target.closest('button');
                if (btn && !btn.hasAttribute('data-no-click-sound')) {
                    playSound?.('SYS_CLICK');
                }
                e.stopPropagation();
            }}
            onContextMenu={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onWheel={(e) => e.stopPropagation()}
        >
            {activeModal === 'actions' && ( 
                <ActionsModal 
                    strings={strings} 
                    settings={settings}
                    isCombat={combat.isActive} 
                    isProcessingTurn={combat.isProcessingTurn} 
                    isAiming={gameState === GameState.AIMING} 
                    canAim={canAim} 
                    availableInteractions={currentMovementSys.canInteractInfo} 
                    canReload={inventorySys.canReload} 
                    isMapOpen={gameState === GameState.MAP_VIEW} 
                    isNoteOpen={player.equippedWeapon?.type === 'NOTE'}
                    mapItemName={engine?.localize ? engine.localize(player.equippedWeapon?.name) : player.equippedWeapon?.name}
                    isRadioOpen={gameState === GameState.RADIO_VIEW || (gameState === GameState.DIALOGUE && player.equippedWeapon?.type === 'RADIO')}
                    isConsoleOpen={gameState === GameState.CONSOLE_VIEW}
                    onAction={(id) => { 
                        setActiveModal(null); 
                        currentMovementSys.handleInteract(id); 
                    }} 
                    onShoot={handleShootWrapper} 
                    onReload={inventorySys.handleReloadAction} 
                    onHideMap={() => inventorySys.toggleMapMode(null)} 
                    onHideRadio={() => inventorySys.toggleRadioMode(null)}
                    onHideConsole={() => inventorySys.toggleConsoleMode(null)}
                    onStartConsole={() => { window.dispatchEvent(new CustomEvent('START_CONSOLE_GAME')); }}
                    onZoomIn={player.equippedWeapon?.type === 'NOTE' ? undefined : inventorySys.handleMapZoomIn} 
                    onZoomOut={player.equippedWeapon?.type === 'NOTE' ? undefined : inventorySys.handleMapZoomOut} 
                    onPause={() => { setShowPauseMenu(true); setActiveModal(null); }} 
                    onClose={() => toggleModal(null)} 
                    onSkipTurn={handleSkipTurn} 
                    onLookAround={() => { engine.setGameState(GameState.LOOKING_AROUND); engine.setLookAroundAngle(0); engine.setLookAroundPitch(0); }}
                /> 
            )}
            {activeModal === 'loot' && lootData && ( 
                <LootModal 
                    strings={strings} 
                    items={lootData.items} 
                    spriteMap={spriteMap}
                    isContainer={lootData.isContainer}
                    containerName={lootData.containerItem?.name}
                    onPickUp={(item) => currentMovementSys.handlePickUpSingle(item, {x: lootData.x, y: lootData.y}, lootData.containerItem?.id)} 
                    onClose={() => toggleModal(null)} 
                /> 
            )}
            {activeModal === 'stats' && !showPauseMenu && !showSettings && !showDebug && !showVolume && (
                <StatsModal 
                    level={player.level} 
                    xp={player.xp} 
                    maxXp={player.maxXp} 
                    stats={player.stats} 
                    availablePoints={player.availablePoints} 
                    strings={strings.stats} 
                    onClose={() => toggleModal(null)} 
                    onUpgrade={(s, p) => setPlayer((prev: any) => { 
                        const d = s.vit - prev.stats.vit; 
                        const boost = d * 5; 
                        return { ...prev, stats: s, availablePoints: p, maxHp: prev.maxHp + boost, hp: prev.hp + boost }; 
                    })} 
                />
            )}
            {activeModal === 'inventory' && !showPauseMenu && !showSettings && !showDebug && !showVolume && (
                <InventoryModal 
                    items={player.inventory} 
                    equippedWeaponId={player.equippedWeapon?.id} 
                    strings={strings.inventory} 
                    uiStrings={strings.ui} 
                    gameState={gameState} 
                    spriteMap={spriteMap} 
                    currentLoad={inventoryStats.currentLoad} 
                    maxCapacity={inventoryStats.maxCapacity} 
                    language={settings.language}
                    onClose={() => toggleModal(null)} 
                    onEquip={(item, feedback) => inventorySys.handleEquipItem(item, feedback)} 
                    onUse={(item, feedback) => inventorySys.handleInventoryAction(item, 'USE', throwingSys.initiateThrow, feedback)} 
                    onThrow={(item, count, isSafe) => inventorySys.handleInventoryAction(item, 'THROW', throwingSys.initiateThrow, undefined, count, isSafe)} 
                    onUnload={(item, feedback) => inventorySys.handleUnloadAction(item, feedback)} 
                    onExtractBattery={(item, feedback, selectedBatteryId) => inventorySys.handleExtractBattery(item, feedback, selectedBatteryId)}
                    onPreCheckC4={() => inventorySys.canPlantC4()}
                />
            )}
            {activeModal === 'equipment' && !showPauseMenu && !showSettings && !showDebug && !showVolume && (
                <EquipmentModal 
                    items={player.inventory} 
                    equipment={player.equipment} 
                    strings={strings.equipment} 
                    spriteMap={spriteMap} 
                    currentLoad={inventoryStats.currentLoad} 
                    maxCapacity={inventoryStats.maxCapacity} 
                    language={settings.language} 
                    characterId={player.characterId} 
                    onClose={() => toggleModal(null)} 
                    onEquip={(item, feedback) => inventorySys.handleEquipItem(item, feedback)} 
                    onUnequip={(item, feedback) => inventorySys.handleUnequipItem(item, feedback)} 
                    onThrow={(item, count, isSafe) => inventorySys.handleInventoryAction(item, 'THROW', throwingSys.initiateThrow, undefined, count, isSafe)} 
                    onUnload={(item, feedback) => inventorySys.handleUnloadAction(item, feedback)} 
                    onExtractBattery={(item, feedback, selectedBatteryId) => inventorySys.handleExtractBattery(item, feedback, selectedBatteryId)}
                />
            )}
            {activeModal === 'location' && !showPauseMenu && !showSettings && !showDebug && !showVolume && (
                <LocationModal 
                    levelData={levelData} 
                    strings={strings} 
                    onClose={() => toggleModal(null)} 
                />
            )}
            {showPauseMenu && activeModal !== 'achievements' && !showSettings && !showDebug && !showVolume && (
                <PauseMenu 
                    strings={strings.ui.pause} 
                    onResume={() => setShowPauseMenu(false)} 
                    onSettings={() => { setShowSettings(true); setShowPauseMenu(false); }} 
                    onLoad={() => { setActiveModal('load'); }}
                    onQuit={returnToMenu} 
                    isTestingCustomLevel={engine?.currentLevelPath === 'CUSTOM_EDITOR_LEVEL' || levelData?.isEditorTest || !!sessionStorage.getItem('active_test_path')}
                    onReturnToEditor={engine?.returnToEditor}
                />
            )}
            {showSettings && !showDebug && !showVolume && ( 
                <SettingsModal 
                    settings={settings} 
                    strings={strings.ui.settings} 
                    isGameStarted={![GameState.MENU, GameState.CHAR_SELECT].includes(gameState as any)} 
                    onClose={() => { setShowSettings(false); if (gameState === GameState.PLAYING || gameState === GameState.COMBAT) setShowPauseMenu(true); }} 
                    onUpdate={setSettings} 
                    onOpenEditor={() => { localStorage.removeItem('editor_test_player'); engine.setGameState('EDITOR'); setShowSettings(false); setShowPauseMenu(false); toggleModal(null); }}
                    engine={engine}
                    saveLoadStrings={strings.ui?.save_load}
                    onLevelUp={() => { gainLevel(); playSound('SYS_LEVELUP'); addLog("LEVEL UP (DEBUG)", 'SUCCESS'); }}
                    onOpenMap={() => { setShowSettings(false); setActiveModal('debug_map'); }}
                /> 
            )}
            {activeModal === 'crafting' && (
                <CraftingModal
                    player={player}
                    setPlayer={setPlayer}
                    spriteMap={spriteMap}
                    onClose={() => toggleModal(null)}
                    strings={strings}
                    addLog={addLog}
                    playSound={playSound}
                    settings={settings}
                />
            )}
            {activeModal === 'save' && engine && (
                <SaveModal
                    engine={engine}
                    strings={strings}
                    onClose={() => toggleModal(null)}
                />
            )}
            {activeModal === 'load' && engine && (
                <LoadModal
                    engine={engine}
                    strings={strings}
                    onClose={() => setActiveModal(null)}
                />
            )}
            {activeModal === 'inspect' && engine && (
                <div 
                    className="absolute inset-0 z-[300] flex items-center justify-center p-4 pointer-events-auto shadow-2xl transition-opacity animate-in fade-in duration-300"
                    onClick={() => { 
                        setActiveModal(null); 
                        const startPitch = engine.lookAroundPitch;
                        const startAngle = engine.lookAroundAngle;
                        const duration = 400;
                        const startTime = performance.now();
                        const animatePitch = (now: number) => {
                            const elapsed = now - startTime;
                            const progress = Math.min(elapsed / duration, 1);
                            const MathPow = Math.pow(1 - progress, 3);
                            const easeProgress = 1 - MathPow;
                            engine.setLookAroundPitch(startPitch * (1 - easeProgress));
                            engine.setLookAroundAngle(startAngle * (1 - easeProgress));
                            if (progress < 1) requestAnimationFrame(animatePitch);
                        };
                        requestAnimationFrame(animatePitch);
                    }}
                >
                    <div 
                        className="bg-gray-900/95 border border-gray-700 p-6 max-w-sm w-full rounded flex flex-col gap-6 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-gray-300 font-['Jura'] text-sm leading-relaxed text-center tracking-wide">{engine.inspectText}</div>
                        <button 
                            className="w-full px-6 py-3 bg-gray-800/80 border border-gray-600 rounded font-bold tracking-[0.2em] text-[10px] font-['Jura'] text-gray-400 uppercase active:bg-gray-700 active:text-white transition-colors hover:border-gray-400"
                            onClick={() => { 
                                setActiveModal(null); 
                                const startPitch = engine.lookAroundPitch;
                                const startAngle = engine.lookAroundAngle;
                                const duration = 400;
                                const startTime = performance.now();
                                const animatePitch = (now: number) => {
                                    const elapsed = now - startTime;
                                    const progress = Math.min(elapsed / duration, 1);
                                    const MathPow = Math.pow(1 - progress, 3);
                                    const easeProgress = 1 - MathPow;
                                    engine.setLookAroundPitch(startPitch * (1 - easeProgress));
                                    engine.setLookAroundAngle(startAngle * (1 - easeProgress));
                                    if (progress < 1) requestAnimationFrame(animatePitch);
                                };
                                requestAnimationFrame(animatePitch);
                            }}
                        >
                            {strings.ui?.dialogue?.btn_next || "OK"}
                        </button>
                    </div>
                </div>
            )}
            {activeModal === 'chess' && (
                <ChessModal 
                    onClose={() => setActiveModal(null)} 
                    playSound={playSound} 
                    strings={strings} 
                />
            )}
        </div>
    );
};

export default React.memo(GameModals, (prev, next) => {
    if (prev.activeModal !== next.activeModal) return false;
    if (prev.showPauseMenu !== next.showPauseMenu) return false;
    if (prev.showSettings !== next.showSettings) return false;
    if (prev.showDebug !== next.showDebug) return false;
    if (prev.showVolume !== next.showVolume) return false;
    if (prev.gameState !== next.gameState) return false;
    if (prev.canAim !== next.canAim) return false;
    if (prev.settings !== next.settings) return false;
    
    if (prev.activeModal === 'actions') {
        if (prev.player?.equippedWeapon?.type !== next.player?.equippedWeapon?.type) return false;
        if (prev.player?.equippedWeapon?.name !== next.player?.equippedWeapon?.name) return false;
        if (prev.combat.isActive !== next.combat.isActive) return false;
        if (prev.combat.isProcessingTurn !== next.combat.isProcessingTurn) return false;
        if (prev.currentMovementSys.canInteractInfo !== next.currentMovementSys.canInteractInfo) return false;
        if (prev.inventorySys.canReload !== next.inventorySys.canReload) return false;
    }
    if (prev.activeModal === 'loot' && prev.lootData !== next.lootData) return false;
    if (prev.activeModal === 'stats') {
        if (prev.player.level !== next.player.level) return false;
        if (prev.player.xp !== next.player.xp) return false;
        if (prev.player.stats !== next.player.stats) return false;
        if (prev.player.availablePoints !== next.player.availablePoints) return false;
    }
    if (prev.activeModal === 'inventory' || prev.activeModal === 'equipment') {
        if (prev.player.inventory !== next.player.inventory) return false;
        if (prev.player.equipment !== next.player.equipment) return false;
        if (prev.player.equippedWeapon?.id !== next.player.equippedWeapon?.id) return false;
        if (prev.inventoryStats !== next.inventoryStats) return false;
    }
    if (prev.activeModal === 'crafting') {
        if (prev.player !== next.player) return false;
    }
    if (prev.activeModal === 'inspect') {
        if (prev.engine?.inspectText !== next.engine?.inspectText) return false;
    }
    
    return true;
});
