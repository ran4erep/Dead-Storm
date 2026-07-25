
import React, { useMemo, useRef, useCallback } from 'react';
import { GameState, Player, GameStrings } from '../types';
import { useKeyboardControls } from './useKeyboardControls';
import { scanForTargets } from '../utils/aimingLogic';

interface InputControllerProps {
    gameState: GameState;
    loading: boolean;
    viewportFade: number;
    player: Player;
    activeWeapon: any;
    levelData: any;
    strings: GameStrings | null;
    combat: any;
    inventorySys: any;
    currentMovementSys: any;
    aimingSys: any;
    throwingSys: any;
    inspectingSys: any;
    dialogueSys: any;
    addLog: (text: string, type?: any) => void;
    toggleModal: (modal: any) => void;
    lookAroundAngle: number;
    setLookAroundAngle: React.Dispatch<React.SetStateAction<number>>;
    lookAroundPitch: number;
    setLookAroundPitch: React.Dispatch<React.SetStateAction<number>>;
    setGameState: React.Dispatch<React.SetStateAction<GameState>>;
    activeModal: string | null;
    disableMovement?: boolean;
    disableWalking?: boolean;
    settings: any;
    setShowPauseMenu?: (show: boolean) => void;
    handleSkipTurn?: () => void;
    enemies?: Map<string, any>;
}

export const useInputController = ({
    gameState,
    loading,
    viewportFade,
    player,
    activeWeapon,
    levelData,
    strings,
    combat,
    inventorySys,
    currentMovementSys,
    aimingSys,
    throwingSys,
    inspectingSys,
    dialogueSys,
    addLog,
    toggleModal,
    lookAroundAngle,
    setLookAroundAngle,
    lookAroundPitch,
    setLookAroundPitch,
    setGameState,
    activeModal,
    disableMovement,
    disableWalking,
    settings,
    setShowPauseMenu,
    handleSkipTurn,
    enemies
}: InputControllerProps) => {

    React.useEffect(() => {
        const preventContext = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener('contextmenu', preventContext, { capture: true });
        return () => window.removeEventListener('contextmenu', preventContext, { capture: true });
    }, []);

    const handleAimInputWithAnim = (action: 'PREV' | 'NEXT' | 'ATTACK' | 'CANCEL') => aimingSys.handleAimInput(action);
    const handleThrowInputWithAnim = (action: 'PREV' | 'NEXT' | 'ATTACK' | 'CANCEL' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => throwingSys.handleThrowInput(action);
    const handleInspectInputWithAnim = (action: 'PREV' | 'NEXT' | 'SELECT' | 'CANCEL') => inspectingSys.handleInspectInput(action);
    const handleShootWrapper = () => aimingSys.handleShoot();

    const handleCancelLookAround = useCallback(() => {
        setLookAroundAngle(0);
        setLookAroundPitch(0);
        if (preLookAroundGameState.current) {
            setGameState(preLookAroundGameState.current);
            preLookAroundGameState.current = null;
        } else {
            setGameState(GameState.PLAYING);
        }
        mouseStart.current = null;
        lastMouse.current = null;
    }, [setLookAroundAngle, setLookAroundPitch, setGameState]);

    const handleToggleLook = useCallback(() => {
        if (gameState !== GameState.LOOKING_AROUND) {
            preLookAroundGameState.current = gameState;
            setGameState(GameState.LOOKING_AROUND);
            setLookAroundAngle(0);
            setLookAroundPitch(0);
        } else {
            handleCancelLookAround();
        }
    }, [gameState, setGameState, setLookAroundAngle, setLookAroundPitch, handleCancelLookAround]);

    useKeyboardControls({ 
        loading: loading, 
        viewportFade, 
        gameState, 
        player, 
        activeModal,
        movePlayer: currentMovementSys.movePlayer, 
        turnPlayer: currentMovementSys.turnPlayer, 
        handleInteract: currentMovementSys.handleInteract, 
        handleShoot: handleShootWrapper, 
        handleAimInput: handleAimInputWithAnim, 
        handleReload: () => inventorySys.handleReloadAction(),
        handleThrowInput: handleThrowInputWithAnim,
        handleInspectInput: handleInspectInputWithAnim,
        handleCancelLookAround,
        handleToggleLook,
        handleSkipTurn,
        toggleModal,
        disableMovement,
        disableWalking,
        settings,
        setShowPauseMenu
    });

    const dialogueSysRef = useRef(dialogueSys);
    React.useEffect(() => {
        dialogueSysRef.current = dialogueSys;
    }, [dialogueSys]);

    // Handle Dialogue Inputs via Keyboard
    React.useEffect(() => {
        const handleDialogueKeys = (e: KeyboardEvent) => {
            if (e.repeat) return;
            if (gameState === GameState.DIALOGUE) {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') dialogueSysRef.current.handleInput('UP');
                if (e.code === 'ArrowDown' || e.code === 'KeyS') dialogueSysRef.current.handleInput('DOWN');
                if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF') dialogueSysRef.current.handleInput('CONFIRM');
            }
        };
        window.addEventListener('keydown', handleDialogueKeys);
        return () => window.removeEventListener('keydown', handleDialogueKeys);
    }, [gameState]);

    const touchStart = useRef<{x: number, y: number} | null>(null);
    const lastTouch = useRef<{x: number, y: number} | null>(null);
    
    // Mouse tracking for right-click looking around
    const mouseStart = useRef<{x: number, y: number} | null>(null);
    const lastMouse = useRef<{x: number, y: number} | null>(null);
    const preLookAroundGameState = useRef<GameState | null>(null);
    
    const handleTouchStart = (e: React.TouchEvent) => {
        if (activeModal === 'keypad') return;
        // Don't return early for disableMovement here so we can capture touchStart for Dialogue handling
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; 
        lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; 
    };
    
    const handleTouchMove = (e: React.TouchEvent) => { 
        if (activeModal === 'keypad') return;
        if (disableMovement) return;
        if (!touchStart.current || !lastTouch.current) return; 
        const currentX = e.touches[0].clientX, currentY = e.touches[0].clientY, diffX = Math.abs(currentX - touchStart.current.x), diffY = Math.abs(currentY - touchStart.current.y); 
        if (diffX > 10 || diffY > 10) {
            if (e.currentTarget.id === 'controls-touch-layer' || e.currentTarget.id === 'viewport-touch-layer') e.preventDefault(); 
        }
        if (gameState === GameState.LOOKING_AROUND) {
            const dx = currentX - lastTouch.current.x;
            const dy = currentY - lastTouch.current.y;
            setLookAroundAngle(prev => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev + dx * 0.005)));
            setLookAroundPitch(prev => Math.max(-1, Math.min(0.5, prev - dy * 0.005)));
            lastTouch.current = { x: currentX, y: currentY };
        }
    };
    
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (activeModal === 'keypad') return;

        // Ensure we check for DIALOGUE touch controls BEFORE returning early due to disableMovement
        if (touchStart.current && gameState === GameState.DIALOGUE) {
            const isInteractionLayer = e.currentTarget.id === 'controls-touch-layer' || e.currentTarget.id === 'viewport-touch-layer';
            if (isInteractionLayer) {
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;
                const dx = endX - touchStart.current.x;
                const dy = endY - touchStart.current.y;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                if (absDy > 30) {
                    if (dy < 0) dialogueSys.handleInput('UP');
                    else dialogueSys.handleInput('DOWN');
                } else if (absDx < 10 && absDy < 10) {
                    if (e.currentTarget.id === 'controls-touch-layer' && 
                        endX > window.innerWidth * 0.25 && endX < window.innerWidth * 0.75) {
                        if (e.cancelable) e.preventDefault();
                        dialogueSys.handleInput('CONFIRM');
                    }
                }
                touchStart.current = null;
                return;
            }
        }

        if (disableMovement) {
            touchStart.current = null;
            lastTouch.current = null;
            return;
        }
        
        if (!touchStart.current) return;
        const endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY, dx = endX - touchStart.current.x, dy = endY - touchStart.current.y, absDx = Math.abs(dx), absDy = Math.abs(dy);
        const isInteractionLayer = e.currentTarget.id === 'controls-touch-layer' || e.currentTarget.id === 'viewport-touch-layer';

        if (isInteractionLayer && (absDx > 30 || absDy > 30)) {
            if (absDx > absDy) { if (gameState === GameState.AIMING) { if (dx > 0 && !disableWalking) handleAimInputWithAnim('NEXT'); else if (!disableWalking) handleAimInputWithAnim('PREV'); } else if (gameState === GameState.INSPECTING) { if (dx > 0 && !disableWalking) handleInspectInputWithAnim('NEXT'); else if (!disableWalking) handleInspectInputWithAnim('PREV'); } else if (gameState === GameState.THROWING) { if (dx > 0 && !disableWalking) handleThrowInputWithAnim('RIGHT'); else if (!disableWalking) handleThrowInputWithAnim('LEFT'); } else if (gameState !== GameState.LOOKING_AROUND) currentMovementSys.turnPlayer(dx > 0); }
            else { if (gameState === GameState.AIMING) { if (dy > 30 && !disableWalking) handleAimInputWithAnim('CANCEL'); } else if (gameState === GameState.INSPECTING) { if (dy > 30 && !disableWalking) handleInspectInputWithAnim('CANCEL'); } else if (gameState === GameState.THROWING) { if (dy < -30 && !disableWalking) handleThrowInputWithAnim('UP'); else if (dy > 30 && !disableWalking) handleThrowInputWithAnim('DOWN'); } else if (gameState !== GameState.LOOKING_AROUND) { const d = Math.round(player.dir); if (dy < 0) { if (!disableWalking) currentMovementSys.movePlayer([0,1,0,-1][d], [-1,0,1,0][d]); } else { if (!disableWalking) currentMovementSys.movePlayer([0,-1,0,1][d], [1,0,-1,0][d]); } } }
        } else if (isInteractionLayer && absDx < 10 && absDy < 10) {
            if (gameState === GameState.LOOKING_AROUND && touchStart.current) {
                // If the game was put into LOOKING_AROUND state by touch, and we tap, reset it.
                // Wait, if it was put by mouse, tapping shouldn't reset it, but touchStart will be tracked.
                setLookAroundAngle(0);
                setLookAroundPitch(0);
                setGameState(GameState.PLAYING);
            }
            // Tap on control layer center
            if (e.currentTarget.id === 'controls-touch-layer' && !isInteractionLayer) {
                // Already handled in TouchControls component click
            }
        }
        touchStart.current = null;
        lastTouch.current = null;
    };

    const triggerBtnVisual = (btnId: string, isDown: boolean) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            if (isDown) {
                btn.style.transform = 'scale(0.95)';
                btn.style.filter = 'brightness(0.8)';
            } else {
                btn.style.transform = '';
                btn.style.filter = '';
            }
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const isInverted = !!settings?.invertContextButtons;

        if (e.button === 0) {
            triggerBtnVisual('combat-left-btn', true);
            if (isInverted) {
                if (gameState === GameState.AIMING) handleAimInputWithAnim('CANCEL');
                else if (gameState === GameState.THROWING) handleThrowInputWithAnim('CANCEL');
                else if (gameState === GameState.INSPECTING) handleInspectInputWithAnim('CANCEL');
            } else {
                if (gameState === GameState.AIMING) handleAimInputWithAnim('ATTACK');
                else if (gameState === GameState.THROWING) handleThrowInputWithAnim('ATTACK');
                else if (gameState === GameState.INSPECTING) handleInspectInputWithAnim('SELECT');
            }
            
            window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'left', state: 'down' } }));
        }

        if (activeModal === 'keypad') return;
        if (disableMovement) return;

        if (e.button === 0) return;

        if (e.button === 2) {
            e.preventDefault();
            const isCombatAction = gameState === GameState.AIMING || gameState === GameState.THROWING || gameState === GameState.INSPECTING || combat.isActive;

            if (isCombatAction) {
                triggerBtnVisual('combat-right-btn', true);
                if (isInverted) {
                    if (gameState === GameState.AIMING) handleAimInputWithAnim('ATTACK');
                    else if (gameState === GameState.THROWING) handleThrowInputWithAnim('ATTACK');
                    else if (gameState === GameState.INSPECTING) handleInspectInputWithAnim('SELECT');
                } else {
                    if (gameState === GameState.AIMING) handleAimInputWithAnim('CANCEL');
                    else if (gameState === GameState.THROWING) handleThrowInputWithAnim('CANCEL');
                    else if (gameState === GameState.INSPECTING) handleInspectInputWithAnim('CANCEL');
                }
                
                window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'right', state: 'down' } }));
            } else if (gameState !== GameState.LOOKING_AROUND) {
                mouseStart.current = { x: e.clientX, y: e.clientY };
                lastMouse.current = { x: e.clientX, y: e.clientY };
                
                preLookAroundGameState.current = gameState;
                setGameState(GameState.LOOKING_AROUND);
                setLookAroundAngle(0);
                setLookAroundPitch(0);
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const isLooking = gameState === GameState.LOOKING_AROUND;
        if (!isLooking) return;
        
        // Allow free look without mouse button down during LOOKING_AROUND
        if (isLooking && !mouseStart.current) {
            if (!lastMouse.current) {
                lastMouse.current = { x: e.clientX, y: e.clientY };
                return;
            }
        } else {
            if (!lastMouse.current || !mouseStart.current) return;
        }
        
        const currentX = e.clientX;
        const currentY = e.clientY;
        
        const dx = currentX - lastMouse.current.x;
        const dy = currentY - lastMouse.current.y;

        // Prevent huge jumps if lastMouse was stale
        if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
            lastMouse.current = { x: currentX, y: currentY };
            return;
        }
        
        setLookAroundAngle(prev => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev + dx * 0.005)));
        setLookAroundPitch(prev => Math.max(-1, Math.min(0.5, prev - dy * 0.005)));
        
        lastMouse.current = { x: currentX, y: currentY };
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') return;
        if (e.button === 0) {
            triggerBtnVisual('combat-left-btn', false);
            window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'left', state: 'up' } }));
            return;
        }

        if (e.button !== 2) return;
        
        triggerBtnVisual('combat-right-btn', false);
        window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'right', state: 'up' } }));
        
        // Let CombatOverlay know to stop (though it might already triggered on mousedown, but click works too)
        
        if (mouseStart.current && gameState === GameState.LOOKING_AROUND) {
            setLookAroundAngle(0);
            setLookAroundPitch(0);
            if (preLookAroundGameState.current) {
                setGameState(preLookAroundGameState.current);
                preLookAroundGameState.current = null;
            } else {
                setGameState(GameState.PLAYING);
            }
        }
        
        mouseStart.current = null;
        lastMouse.current = null;
    };

    const handleContextMenu = (e: React.PointerEvent) => {
        e.preventDefault(); 
    };

    const canAim = useMemo(() => {
        if (!levelData || !strings) return false;
        const targets = scanForTargets(player, levelData.grid, levelData.width, levelData.height, 12, enemies);
        const range = activeWeapon?.range || 1; 
        const frontInRange = targets.filter(t => t.dist <= range && t.dir === player.dir);
        return frontInRange.length > 0;
    }, [player, activeWeapon, levelData, strings, enemies]);

    const availableActionsCount = useMemo(() => {
        let count = 0;
        
        // Skip Turn is always available now (in combat and exploration)
        count++; 

        if (gameState === GameState.MAP_VIEW || gameState === GameState.RADIO_VIEW || gameState === GameState.CONSOLE_VIEW) count++;
        
        if (combat.isActive) { 
            if (inventorySys.canReload) count++;
            return count; 
        }
        
        if (currentMovementSys.canInteractInfo.length > 0) count += currentMovementSys.canInteractInfo.length;
        if (canAim) count++; 
        if (inventorySys.canReload) count++;
        
        return count;
    }, [combat.isActive, currentMovementSys.canInteractInfo, canAim, inventorySys.canReload, gameState]);

    return {
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handleContextMenu,
        canAim,
        availableActionsCount,
        handleAimInputWithAnim,
        handleThrowInputWithAnim,
        handleInspectInputWithAnim,
        handleShootWrapper,
        handleToggleLook
    };
};
