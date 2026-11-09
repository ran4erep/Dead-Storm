
import { useEffect, useRef } from 'react';
import { GameState, Player } from '../types';

interface KeyboardControlsProps {
  loading: boolean;
  viewportFade: number;
  gameState: GameState;
  player: Player;
  movePlayer: (dx: number, dy: number) => void;
  turnPlayer: (clockwise: boolean) => void;
  handleInteract: () => void;
  handleShoot: () => void;
  handleAimInput: (action: 'PREV' | 'NEXT' | 'ATTACK' | 'CANCEL') => void;
  handleThrowInput: (action: 'PREV' | 'NEXT' | 'ATTACK' | 'CANCEL' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void;
  handleInspectInput?: (action: 'PREV' | 'NEXT' | 'SELECT' | 'CANCEL') => void;
  handleCancelLookAround?: () => void;
  handleToggleLook?: () => void;
  handleSkipTurn?: () => void;
  handleReload: () => void;
  toggleModal: (modal: string | null) => void;
  activeModal?: string | null;
  disableMovement?: boolean;
  disableWalking?: boolean;
  settings: any;
  setShowPauseMenu?: (show: boolean) => void;
}

export const useKeyboardControls = ({
  loading,
  viewportFade,
  gameState,
  player,
  movePlayer,
  turnPlayer,
  handleInteract,
  handleShoot,
  handleAimInput,
  handleThrowInput,
  handleInspectInput,
  handleCancelLookAround,
  handleToggleLook,
  handleSkipTurn,
  handleReload,
  toggleModal,
  activeModal,
  disableMovement,
  disableWalking,
  settings,
  setShowPauseMenu
}: KeyboardControlsProps) => {

  const keysPressedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
        keysPressedRef.current.delete(e.code);
    };

    const handleBlur = () => {
        keysPressedRef.current.clear();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        keysPressedRef.current.add(e.code);
        if (e.repeat) return;
        if (loading || viewportFade > 0 || activeModal === 'keypad' || gameState === GameState.CONSOLE_VIEW || gameState === GameState.EDITOR) return;

        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) {
            e.preventDefault();
        }

        const controls = settings?.controls || {
            moveForward: 'KeyW',
            moveBackward: 'KeyS',
            turnLeft: 'KeyA',
            turnRight: 'KeyD',
            strafeLeft: 'KeyQ',
            strafeRight: 'KeyE',
            interact: 'Space',
            shoot: 'KeyF',
            reload: 'KeyR',
            inventory: 'Tab',
            statsMenu: 'Digit1',
            equipMenu: 'Digit2',
            skipTurn: 'ShiftLeft',
            toggleLook: 'KeyC'
        };

        const movementKeys = [
            controls.moveForward, 'ArrowUp',
            controls.moveBackward, 'ArrowDown',
            controls.turnLeft, 'ArrowLeft',
            controls.turnRight, 'ArrowRight',
            controls.strafeLeft,
            controls.strafeRight
        ];

        const isMovementKey = movementKeys.includes(e.code);
        if (isMovementKey) {
            const hasOtherMovementKey = Array.from(keysPressedRef.current).some(key => key !== e.code && movementKeys.includes(key));
            if (hasOtherMovementKey) {
                // Ignore keydown if another movement key is already held down
                return;
            }
        }

        const isBlockingModal = activeModal === 'inventory' || activeModal === 'stats' || activeModal === 'equipment';
        if (isBlockingModal) {
            if (e.code === 'Escape') {
                toggleModal(null);
                return;
            }
            if (e.code === controls.inventory && activeModal === 'inventory') {
                toggleModal(null);
                return;
            }
            if (e.code === controls.statsMenu && activeModal === 'stats') {
                toggleModal(null);
                return;
            }
            if (e.code === controls.equipMenu && activeModal === 'equipment') {
                toggleModal(null);
                return;
            }
        }
        
        if (activeModal === 'actions') {
            if (e.code === 'Space' || e.code === controls.interact) {
                toggleModal(null);
                return;
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', controls.moveForward, controls.moveBackward, controls.turnLeft, controls.turnRight, controls.strafeLeft, controls.strafeRight].includes(e.code)) {
                return;
            }
        }

        if (activeModal === 'loot') {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', controls.moveForward, controls.moveBackward, controls.turnLeft, controls.turnRight, controls.strafeLeft, controls.strafeRight].includes(e.code)) {
                return;
            }
        }

        // Let Escape close other models generically if toggleModal handles it
        if (activeModal && e.code === 'Escape') {
            toggleModal(null);
            return;
        }

        // Open pause menu on Escape
        if (e.code === 'Escape' && !activeModal && gameState !== GameState.DIALOGUE && setShowPauseMenu) {
             setShowPauseMenu(true);
             return;
        }

        if (disableMovement) return;

        if (gameState === GameState.LOOKING_AROUND && handleCancelLookAround) {
            handleCancelLookAround();
            return;
        }

        if (gameState === GameState.AIMING) {
            if (e.code === 'ArrowLeft' || e.code === controls.turnLeft || e.code === controls.strafeLeft) {
                handleAimInput('PREV');
            } else if (e.code === 'ArrowRight' || e.code === controls.turnRight || e.code === controls.strafeRight) {
                handleAimInput('NEXT');
            } else if (e.code === 'Enter' || e.code === controls.interact) {
                handleAimInput('ATTACK');
            } else if (e.code === 'Escape' || e.code === 'Backspace' || e.code === controls.shoot) {
                handleAimInput('CANCEL');
            }
            return;
        }

        if (gameState === GameState.THROWING) {
            if (e.code === 'ArrowUp' || e.code === controls.moveForward) {
                handleThrowInput('UP');
            } else if (e.code === 'ArrowDown' || e.code === controls.moveBackward) {
                handleThrowInput('DOWN');
            } else if (e.code === 'ArrowLeft' || e.code === controls.turnLeft || e.code === controls.strafeLeft) {
                handleThrowInput('LEFT');
            } else if (e.code === 'ArrowRight' || e.code === controls.turnRight || e.code === controls.strafeRight) {
                handleThrowInput('RIGHT');
            } else if (e.code === 'Enter' || e.code === controls.shoot || e.code === controls.interact) {
                handleThrowInput('ATTACK');
            } else if (e.code === 'Escape' || e.code === 'Backspace') {
                handleThrowInput('CANCEL');
            }
            return;
        }

        if (gameState === GameState.INSPECTING && handleInspectInput) {
            if (e.code === 'ArrowLeft' || e.code === controls.turnLeft || e.code === controls.strafeLeft) {
                handleInspectInput('PREV');
            } else if (e.code === 'ArrowRight' || e.code === controls.turnRight || e.code === controls.strafeRight) {
                handleInspectInput('NEXT');
            } else if (e.code === 'Enter' || e.code === controls.shoot || e.code === controls.interact) {
                handleInspectInput('SELECT');
            } else if (e.code === 'Escape' || e.code === 'Backspace') {
                handleInspectInput('CANCEL');
            }
            return;
        }

        // Allow movement in standard play OR map view OR combat
        if (gameState === GameState.PLAYING || gameState === GameState.MAP_VIEW || gameState === GameState.RADIO_VIEW || gameState === GameState.COMBAT) {
            const d = Math.round(player.dir);
            
            if ((e.code === controls.moveForward || e.code === 'ArrowUp') && !disableWalking) {
                movePlayer([0,1,0,-1][d], [-1,0,1,0][d]);
            } else if ((e.code === controls.moveBackward || e.code === 'ArrowDown') && !disableWalking) {
                movePlayer([0,-1,0,1][d], [1,0,-1,0][d]);
            } else if (e.code === controls.turnLeft || e.code === 'ArrowLeft') {
                turnPlayer(false);
            } else if (e.code === controls.turnRight || e.code === 'ArrowRight') {
                turnPlayer(true);
            } else if (e.code === controls.strafeLeft && !disableWalking) {
                movePlayer([-1, 0, 1, 0][d], [0, -1, 0, 1][d]);
            } else if (e.code === controls.strafeRight && !disableWalking) {
                movePlayer([1, 0, -1, 0][d], [0, 1, 0, -1][d]);
            } else if ((e.code === controls.interact || e.code === 'Enter') && !disableWalking) {
                handleInteract();
            } else if (e.code === controls.shoot) {
                if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW && gameState !== GameState.COMBAT && !disableWalking) handleShoot();
            } else if (e.code === controls.reload) {
                if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW && !disableWalking) handleReload();
            } else if (e.code === controls.inventory) {
                e.preventDefault();
                if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
                   toggleModal(activeModal === 'inventory' ? null : 'inventory');
                }
            } else if (e.code === controls.statsMenu) {
                e.preventDefault();
                if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
                   toggleModal(activeModal === 'stats' ? null : 'stats');
                }
            } else if (e.code === controls.equipMenu) {
                e.preventDefault();
                if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
                   toggleModal(activeModal === 'equipment' ? null : 'equipment');
                }
            } else if (e.code === controls.skipTurn && !disableWalking) {
                e.preventDefault();
                if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW && handleSkipTurn) {
                    handleSkipTurn();
                }
            } else if (e.code === controls.toggleLook && !disableWalking) {
                e.preventDefault();
                if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW && gameState !== GameState.COMBAT && handleToggleLook) {
                    handleToggleLook();
                }
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleBlur);
    };
  }, [loading, viewportFade, gameState, player.dir, movePlayer, turnPlayer, handleInteract, handleShoot, handleAimInput, handleThrowInput, handleCancelLookAround, handleToggleLook, handleSkipTurn, handleReload, toggleModal, activeModal, disableMovement, disableWalking, settings, setShowPauseMenu]);
};
