import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player, Item } from '../types';
import { SnakeGame } from './console/SnakeGame';
import { TetrisGame } from './console/TetrisGame';
import { ArkanoidGame } from './console/ArkanoidGame';
import { PongGame } from './console/PongGame';
import { FlappyBirdGame } from './console/FlappyBirdGame';
import { ConsoleGame } from './console/types';

interface ConsoleOverlayProps {
    player: Player;
    sprites: Map<string, HTMLImageElement>;
    onClose: () => void;
    item: Item | null; 
    visible: boolean; 
    handStyleFinal?: React.CSSProperties;
    mapContainerRef: React.RefObject<HTMLDivElement | null>;
    localize: (text: string | undefined) => string;
    playSound?: (soundId: string, pos?: {x:number, y:number}) => void;
    strings?: any;
    onGameStatusChange?: (isActive: boolean) => void;
    onOpenActions?: () => void;
    settings?: any;
    isPaused?: boolean;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

const maskAnalysisCache = new Map<string, Rect>();

const ConsoleOverlay: React.FC<ConsoleOverlayProps> = ({ 
    player, sprites, onClose, item, visible, handStyleFinal, mapContainerRef, localize, playSound, strings,
    onGameStatusChange, onOpenActions, settings, isPaused
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const screenCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [sourceMaskRect, setSourceMaskRect] = useState<Rect | null>(null);
    
    // Console Game Mode State
    const activeGameRef = useRef<string>('menu');
    const menuIndexRef = useRef<number>(0);
    const menuStartIndexRef = useRef<number>(0);

    const [gameOver, setGameOver] = useState(true);
    const gameOverRef = useRef(gameOver);
    useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

    const [hasStarted, setHasStarted] = useState(false);
    const hasStartedRef = useRef(hasStarted);
    useEffect(() => { hasStartedRef.current = hasStarted; }, [hasStarted]);

    const sourceMaskRectRef = useRef<Rect | null>(null);
    useEffect(() => { sourceMaskRectRef.current = sourceMaskRect; }, [sourceMaskRect]);

    const spritesRef = useRef(sprites);
    useEffect(() => { spritesRef.current = sprites; }, [sprites]);

    const stringsRef = useRef(strings);
    useEffect(() => { stringsRef.current = strings; }, [strings]);

    const playerRef = useRef(player);
    useEffect(() => { playerRef.current = player; }, [player]);

    const itemRef = useRef(item);
    useEffect(() => { itemRef.current = item; }, [item]);

    const isPausedRef = useRef(!!isPaused);
    useEffect(() => { isPausedRef.current = !!isPaused; }, [isPaused]);

    const lastHandAssetToUseRef = useRef<string | null>(null);
    const lastDimensionsRef = useRef<{w: number, h: number, dpr: number}>({ w: 0, h: 0, dpr: 0 });
    const lastHandImgCompleteRef = useRef<boolean>(false);
    const lastHandImgSrcRef = useRef<string>('');

    const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
    const dimensionsRef = useRef(dimensions);
    useEffect(() => {
        dimensionsRef.current = dimensions;
    }, [dimensions]);

    // Instantiate game classes once
    const gamesRef = useRef<{ [key: string]: ConsoleGame }>({});
    if (Object.keys(gamesRef.current).length === 0) {
        gamesRef.current = {
            snake: new SnakeGame(),
            tetris: new TetrisGame((speed) => {
                startGameInterval(tickActiveGame, speed);
            }),
            arkanoid: new ArkanoidGame(),
            pong: new PongGame(),
            flappy: new FlappyBirdGame((speed) => {
                startGameInterval(tickActiveGame, speed);
            })
        };
    }

    // Dynamic Game Loop Manager
    const gameIntervalRef = useRef<number | null>(null);

    const stopGameInterval = () => {
        if (gameIntervalRef.current !== null) {
            clearInterval(gameIntervalRef.current);
            gameIntervalRef.current = null;
        }
    };

    const startGameInterval = (fn: () => void, speed: number) => {
        stopGameInterval();
        gameIntervalRef.current = window.setInterval(fn, speed);
    };

    const tickActiveGame = useCallback(() => {
        if (isPausedRef.current) return;
        const activeId = activeGameRef.current;
        const activeGame = gamesRef.current[activeId];
        if (activeGame && !activeGame.isGameOver()) {
            activeGame.tick();
            
            // Sync React-level states
            const isOver = activeGame.isGameOver();
            const started = activeGame.hasStarted();
            setGameOver(isOver);
            setHasStarted(started);
            scoreRef.current = activeGame.getScore();

            if (isOver) {
                stopGameInterval();
            }
        }
    }, []);

    // Retrieve active cartridges from inventory dynamically based on CARTRIDGE item type
    const getAvailableGames = useCallback(() => {
        const list: { id: string; label: string }[] = [];
        const inv = playerRef.current?.inventory || [];
        
        inv.forEach(item => {
            if (item.type === 'CARTRIDGE') {
                const gameName = item.gameName;
                if (gameName) {
                    const localizedName = localize(gameName);
                    const cleanedLabel = localizedName.trim().toUpperCase();
                    const normalized = gameName.toLowerCase();
                    let gameId: string | null = null;
                    if (normalized.includes('snake') || normalized.includes('змейка')) {
                        gameId = 'snake';
                    } else if (normalized.includes('tetris') || normalized.includes('тетрис')) {
                        gameId = 'tetris';
                    } else if (normalized.includes('arkanoid') || normalized.includes('арканоид')) {
                        gameId = 'arkanoid';
                    } else if (normalized.includes('pong') || normalized.includes('понг')) {
                        gameId = 'pong';
                    } else if (normalized.includes('flappy') || normalized.includes('bird') || normalized.includes('флэппи') || normalized.includes('fly')) {
                        gameId = 'flappy';
                    } else {
                        gameId = normalized;
                    }
                    if (gameId && !list.some(g => g.label === cleanedLabel)) {
                        list.push({ id: gameId, label: cleanedLabel });
                    }
                } else {
                    const actualId = item.definitionId || item.id;
                    const gameId = actualId.replace('cartridge_', '');
                    const rawName = item.name || '';
                    const localizedName = localize(rawName);
                    const cleanedLabel = localizedName
                        .replace(/^Картридж:\s*/i, '')
                        .replace(/^Cartridge:\s*/i, '')
                        .trim()
                        .toUpperCase();

                    if (!list.some(g => g.label === cleanedLabel)) {
                        list.push({ id: gameId, label: cleanedLabel });
                    }
                }
            }
        });

        // Fallback to prevent crash if no cartridges are in inventory
        if (list.length === 0) {
            list.push({ id: 'snake', label: localize('ЗМЕЙКА / SNAKE').replace(/^Картридж:\s*/i, '').replace(/^Cartridge:\s*/i, '').trim().toUpperCase() });
        }
        return list;
    }, [localize]);
    
    const scoreRef = useRef<number>(0);

    useEffect(() => {
        if (!visible) return;
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ w: width, h: height });
            }
        });

        resizeObserver.observe(container);
        return () => {
            resizeObserver.disconnect();
        };
    }, [visible]);

    // Reset game state to lobby when hidden
    useEffect(() => {
        if (!visible) {
            stopGameInterval();
            (Object.values(gamesRef.current) as ConsoleGame[]).forEach(g => g.stop());
            activeGameRef.current = 'menu';
            setGameOver(true);
            setHasStarted(false);
            scoreRef.current = 0;
            menuIndexRef.current = 0;
            menuStartIndexRef.current = 0;
        }
        return () => {
            stopGameInterval();
        };
    }, [visible]);

    // Communicate game running status to parent
    useEffect(() => {
        if (onGameStatusChange) {
            onGameStatusChange(visible && !gameOver && hasStarted);
        }
        return () => {
            onGameStatusChange?.(false);
        };
    }, [visible, gameOver, hasStarted, onGameStatusChange]);

    const resetGame = useCallback(() => {
        const activeId = activeGameRef.current;
        const activeGame = gamesRef.current[activeId];
        if (activeGame) {
            activeGame.reset();
            setGameOver(activeGame.isGameOver());
            setHasStarted(activeGame.hasStarted());
            scoreRef.current = activeGame.getScore();
            
            const speed = activeGame.getTickSpeed();
            startGameInterval(tickActiveGame, speed);
        }
    }, [playSound, tickActiveGame]);

    const handleBackAction = () => {
        if (playSound) playSound('CONSOLE_BUTTON');
        if (activeGameRef.current !== 'menu') {
            const activeId = activeGameRef.current;
            const activeGame = gamesRef.current[activeId];
            if (activeGame) {
                activeGame.stop();
            }
            stopGameInterval();
            activeGameRef.current = 'menu';
            setGameOver(true);
            setHasStarted(false);
            scoreRef.current = 0;
        } else {
            onClose();
        }
    };

    const actionVisualTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const triggerActionVisual = () => {
        if (actionVisualTimeoutRef.current) {
            clearTimeout(actionVisualTimeoutRef.current);
        }
        setPressedDir('ACTION');
        actionVisualTimeoutRef.current = setTimeout(() => {
            setPressedDir(null);
            actionVisualTimeoutRef.current = null;
        }, 150);
    };

    const handleActionButton = (skipSound?: boolean) => {
        if (playSound && !skipSound) {
            playSound('CONSOLE_BUTTON');
        }
        triggerActionVisual();

        const activeId = activeGameRef.current;
        const activeGame = gamesRef.current[activeId];
        if (activeGame && !activeGame.isGameOver()) {
            activeGame.handleKeyDown({
                isUp: false,
                isDown: false,
                isLeft: false,
                isRight: false,
                isAction: true,
                isStart: false,
                key: ' ',
                repeat: false
            });
            // Sync states
            setGameOver(activeGame.isGameOver());
            setHasStarted(activeGame.hasStarted());
            scoreRef.current = activeGame.getScore();
        }
    };

    const handleTapOrClick = (e?: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
        if (activeGameRef.current === 'menu') {
            if (e) {
                let clientY = 0;
                if ('touches' in e && e.touches.length > 0) {
                    clientY = e.touches[0].clientY;
                } else if ('changedTouches' in e && e.changedTouches.length > 0) {
                    clientY = e.changedTouches[0].clientY;
                } else if ('clientY' in e) {
                    clientY = e.clientY;
                }
                if (clientY > window.innerHeight - 135) {
                    return;
                }

                if ('detail' in e && e.detail === 0) {
                    return;
                }
                if ('nativeEvent' in e && e.nativeEvent && 'detail' in e.nativeEvent && e.nativeEvent.detail === 0) {
                    return;
                }
                const mouseEvent = e as any;
                if (mouseEvent.clientX === 0 && mouseEvent.clientY === 0) {
                    return;
                }
            }

            const gamesList = getAvailableGames();
            const selected = gamesList[menuIndexRef.current];
            if (selected) {
                triggerActionVisual();
                activeGameRef.current = selected.id;
                const activeGame = gamesRef.current[selected.id];
                if (activeGame) {
                    activeGame.init((id) => playSound?.(id));
                    activeGame.reset();
                    setGameOver(activeGame.isGameOver());
                    setHasStarted(activeGame.hasStarted());
                    scoreRef.current = activeGame.getScore();
                    
                    const speed = activeGame.getTickSpeed();
                    startGameInterval(tickActiveGame, speed);
                }
            }
        } else if (gameOverRef.current) {
            if (onOpenActions) {
                onOpenActions();
            }
        } else {
            handleActionButton();
        }
    };

    useEffect(() => {
        const handleStartEvent = () => resetGame();
        window.addEventListener('START_CONSOLE_GAME', handleStartEvent);
        return () => window.removeEventListener('START_CONSOLE_GAME', handleStartEvent);
    }, [resetGame]);

    useEffect(() => {
        const handleActionTap = () => {
            handleTapOrClick();
        };
        window.addEventListener('TRIGGER_CONSOLE_ACTION', handleActionTap);
        return () => window.removeEventListener('TRIGGER_CONSOLE_ACTION', handleActionTap);
    }, [handleTapOrClick]);

    // 1. Analyze Mask
    useEffect(() => {
        if (!visible) return;
        let retryTimer: number;

        const analyzeMask = () => {
            if (!item) return;
            const maskId = (player.characterId === 'female' && ((item as any).maskFemaleAsset || item.maskFemaleAssetId))
                ? ((item as any).maskFemaleAsset || item.maskFemaleAssetId)
                : ((item as any).maskAsset || item.maskAssetId);
            if (!maskId) return;

            if (maskAnalysisCache.has(maskId)) {
                setSourceMaskRect(maskAnalysisCache.get(maskId)!);
                return;
            }
            
            const maskImg = sprites.get(maskId);
            if (!maskImg || maskImg.width === 0 || !maskImg.complete) {
                retryTimer = window.setTimeout(analyzeMask, 100);
                return;
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = maskImg.width;
            tempCanvas.height = maskImg.height;
            const ctx = tempCanvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(maskImg, 0, 0);
            const id = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const d = id.data;
            
            let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;
            let found = false;

            for (let y = 0; y < tempCanvas.height; y++) {
                for (let x = 0; x < tempCanvas.width; x++) {
                    const i = (y * tempCanvas.width + x) * 4;
                    if (d[i+3] > 0 && d[i] < 50 && d[i+1] > 200 && d[i+2] < 50) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        found = true;
                    }
                }
            }

            if (found) {
                const rect = { x: minX, y: minY, w: (maxX - minX) + 1, h: (maxY - minY) + 1 };
                maskAnalysisCache.set(maskId, rect);
                setSourceMaskRect(rect);
            } else {
                retryTimer = window.setTimeout(analyzeMask, 200);
            }
        };
        analyzeMask();

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
        }
    }, [item, sprites, player.characterId]);

    // Input Handling
    useEffect(() => {
        if (!visible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
            const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
            const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
            const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
            const isStart = e.key === 'Enter';
            const isAction = e.key === ' ' || e.key === 'Spacebar';

            if (isUp || isDown || isLeft || isRight || isStart || isAction || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
            }

            e.stopPropagation();

            if (e.key === 'Escape' || e.key === 'Tab') {
                handleBackAction();
                return;
            }

            if (isUp || isDown || isLeft || isRight || isStart || isAction) {
                if (playSound && !e.repeat) {
                    const s = (item as any)?.sounds?.button || 'CONSOLE_BUTTON';
                    playSound(s);
                }
            }

            // 1. Selection Menu Mode
            if (activeGameRef.current === 'menu') {
                const gamesList = getAvailableGames();
                if (isUp) {
                    setPressedDir('UP');
                    menuIndexRef.current = Math.max(0, menuIndexRef.current - 1);
                } else if (isDown) {
                    setPressedDir('DOWN');
                    menuIndexRef.current = Math.min(gamesList.length - 1, menuIndexRef.current + 1);
                } else if (isLeft) {
                    setPressedDir('LEFT');
                } else if (isRight || isAction || isStart) {
                    if (isRight) setPressedDir('RIGHT');
                    if (isAction) triggerActionVisual();
                    const selected = gamesList[menuIndexRef.current];
                    if (selected) {
                        activeGameRef.current = selected.id;
                        const activeGame = gamesRef.current[selected.id];
                        if (activeGame) {
                            activeGame.init((id) => playSound?.(id));
                            activeGame.reset();
                            setGameOver(activeGame.isGameOver());
                            setHasStarted(activeGame.hasStarted());
                            scoreRef.current = activeGame.getScore();
                            
                            const speed = activeGame.getTickSpeed();
                            startGameInterval(tickActiveGame, speed);
                        }
                    }
                }
                return;
            }

            // 2. Game Over Mode
            if (gameOverRef.current) {
                if (isStart) {
                    handleBackAction();
                } else if (isAction) {
                    triggerActionVisual();
                    if (onOpenActions) {
                        onOpenActions();
                    }
                } else if (isUp) {
                    setPressedDir('UP');
                } else if (isDown) {
                    setPressedDir('DOWN');
                } else if (isLeft) {
                    setPressedDir('LEFT');
                } else if (isRight) {
                    setPressedDir('RIGHT');
                }
                return;
            }

            // 3. Active Game Mode
            const activeId = activeGameRef.current;
            const activeGame = gamesRef.current[activeId];
            if (activeGame) {
                if (isUp) setPressedDir('UP');
                else if (isDown) setPressedDir('DOWN');
                else if (isLeft) setPressedDir('LEFT');
                else if (isRight) setPressedDir('RIGHT');
                else if (isAction) triggerActionVisual();

                activeGame.handleKeyDown({
                    isUp,
                    isDown,
                    isLeft,
                    isRight,
                    isAction,
                    isStart,
                    key: e.key,
                    repeat: e.repeat
                });
                
                // Sync states
                setGameOver(activeGame.isGameOver());
                setHasStarted(activeGame.hasStarted());
                scoreRef.current = activeGame.getScore();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
            const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
            const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
            const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
            const isAction = e.key === ' ' || e.key === 'Spacebar';

            if (isUp) {
                setPressedDir(prev => prev === 'UP' ? null : prev);
            }
            if (isDown) {
                setPressedDir(prev => prev === 'DOWN' ? null : prev);
            }
            if (isLeft) {
                setPressedDir(prev => prev === 'LEFT' ? null : prev);
            }
            if (isRight) {
                setPressedDir(prev => prev === 'RIGHT' ? null : prev);
            }

            const activeId = activeGameRef.current;
            const activeGame = gamesRef.current[activeId];
            if (activeGame) {
                activeGame.handleKeyUp({
                    isUp,
                    isDown,
                    isLeft,
                    isRight,
                    isAction
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        window.addEventListener('keyup', handleKeyUp, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
            window.removeEventListener('keyup', handleKeyUp, { capture: true });
        };
    }, [visible, onClose, playSound, item, getAvailableGames, tickActiveGame]);

    // Gamepad Input Polling Loop
    useEffect(() => {
        if (!visible) return;

        let active = true;
        let rafId: number;
        const lastBtnState = {
            up: false,
            down: false,
            left: false,
            right: false,
            start: false,
            back: false,
            a: false
        };

        const pollGamepad = () => {
            if (!active) return;
            const gamepads = navigator.getGamepads();
            let gp: Gamepad | null = null;
            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i]) {
                    gp = gamepads[i];
                    break;
                }
            }

            if (gp) {
                const dpadUp = !!gp.buttons[12]?.pressed;
                const dpadDown = !!gp.buttons[13]?.pressed;
                const dpadLeft = !!gp.buttons[14]?.pressed;
                const dpadRight = !!gp.buttons[15]?.pressed;

                const stickX = gp.axes[0] || 0;
                const stickY = gp.axes[1] || 0;

                const isUp = dpadUp || stickY < -0.5;
                const isDown = dpadDown || stickY > 0.5;
                const isLeft = dpadLeft || stickX < -0.5;
                const isRight = dpadRight || stickX > 0.5;

                const isA = !!gp.buttons[0]?.pressed;
                const isStart = isA || !!gp.buttons[9]?.pressed;
                const isBack = !!gp.buttons[1]?.pressed || !!gp.buttons[8]?.pressed;

                const upJustPressed = isUp && !lastBtnState.up;
                const downJustPressed = isDown && !lastBtnState.down;
                const leftJustPressed = isLeft && !lastBtnState.left;
                const rightJustPressed = isRight && !lastBtnState.right;
                const startJustPressed = isStart && !lastBtnState.start;
                const backJustPressed = isBack && !lastBtnState.back;
                const aJustPressed = isA && !lastBtnState.a;

                lastBtnState.up = isUp;
                lastBtnState.down = isDown;
                lastBtnState.left = isLeft;
                lastBtnState.right = isRight;
                lastBtnState.start = isStart;
                lastBtnState.back = isBack;
                lastBtnState.a = isA;

                if (backJustPressed) {
                    handleBackAction();
                    return;
                }

                if (upJustPressed || downJustPressed || leftJustPressed || rightJustPressed || startJustPressed || aJustPressed) {
                    if (playSound) {
                        const s = (itemRef.current as any)?.sounds?.button || 'CONSOLE_BUTTON';
                        playSound(s);
                    }
                }

                // 1. Selection Menu Mode
                if (activeGameRef.current === 'menu') {
                    const gamesList = getAvailableGames();
                    if (upJustPressed) {
                        menuIndexRef.current = Math.max(0, menuIndexRef.current - 1);
                    } else if (downJustPressed) {
                        menuIndexRef.current = Math.min(gamesList.length - 1, menuIndexRef.current + 1);
                    } else if (rightJustPressed || aJustPressed || startJustPressed) {
                        const selected = gamesList[menuIndexRef.current];
                        if (selected) {
                            activeGameRef.current = selected.id;
                            const activeGame = gamesRef.current[selected.id];
                            if (activeGame) {
                                activeGame.init((id) => playSound?.(id));
                                activeGame.reset();
                                setGameOver(activeGame.isGameOver());
                                setHasStarted(activeGame.hasStarted());
                                scoreRef.current = activeGame.getScore();
                                
                                const speed = activeGame.getTickSpeed();
                                startGameInterval(tickActiveGame, speed);
                            }
                        }
                    }
                    return;
                }

                // 2. Game Over Mode
                if (gameOverRef.current) {
                    if (startJustPressed || aJustPressed) {
                        handleBackAction();
                    }
                    return;
                }

                // 3. Active Game Mode
                const activeId = activeGameRef.current;
                const activeGame = gamesRef.current[activeId];
                if (activeGame) {
                    if (upJustPressed) {
                        activeGame.handleKeyDown({
                            isUp: true, isDown: false, isLeft: false, isRight: false, isAction: false, isStart: false, key: 'ArrowUp', repeat: false
                        });
                    } else if (downJustPressed) {
                        activeGame.handleKeyDown({
                            isUp: false, isDown: true, isLeft: false, isRight: false, isAction: false, isStart: false, key: 'ArrowDown', repeat: false
                        });
                    } else if (leftJustPressed) {
                        activeGame.handleKeyDown({
                            isUp: false, isDown: false, isLeft: true, isRight: false, isAction: false, isStart: false, key: 'ArrowLeft', repeat: false
                        });
                    } else if (rightJustPressed) {
                        activeGame.handleKeyDown({
                            isUp: false, isDown: false, isLeft: false, isRight: true, isAction: false, isStart: false, key: 'ArrowRight', repeat: false
                        });
                    } else if (aJustPressed) {
                        activeGame.handleKeyDown({
                            isUp: false, isDown: false, isLeft: false, isRight: false, isAction: true, isStart: false, key: ' ', repeat: false
                        });
                    }
                    
                    if (activeGame.handleContinuousInput) {
                        let continuous: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null = null;
                        if (isLeft) continuous = 'LEFT';
                        else if (isRight) continuous = 'RIGHT';
                        else if (isUp) continuous = 'UP';
                        else if (isDown) continuous = 'DOWN';
                        activeGame.handleContinuousInput(continuous);
                    }

                    // Sync states
                    setGameOver(activeGame.isGameOver());
                    setHasStarted(activeGame.hasStarted());
                    scoreRef.current = activeGame.getScore();
                }

                if (pressedDirRef.current !== 'ACTION') {
                    if (isUp) setPressedDir('UP');
                    else if (isDown) setPressedDir('DOWN');
                    else if (isLeft) setPressedDir('LEFT');
                    else if (isRight) setPressedDir('RIGHT');
                    else setPressedDir(null);
                }
            }

            rafId = requestAnimationFrame(pollGamepad);
        };

        rafId = requestAnimationFrame(pollGamepad);
        return () => {
            active = false;
            cancelAnimationFrame(rafId);
        };
    }, [visible, playSound, getAvailableGames, tickActiveGame]);

    const [pressedDir, setPressedDirInternal] = useState<string | null>(null);
    const pressedDirRef = useRef(pressedDir);
    useEffect(() => { pressedDirRef.current = pressedDir; }, [pressedDir]);

    const setPressedDir = useCallback((dir: string | null | ((prev: string | null) => string | null)) => {
        if (typeof dir === 'function') {
            setPressedDirInternal(prev => {
                const next = dir(prev);
                pressedDirRef.current = next;
                return next;
            });
        } else {
            pressedDirRef.current = dir;
            setPressedDirInternal(dir);
        }
    }, []);

    const getTiltStyle = (): React.CSSProperties => {
        let transform = 'none';
        if (pressedDir === 'UP') {
            transform = 'perspective(1000px) rotateX(3deg) translateY(-2.5px)';
        } else if (pressedDir === 'DOWN') {
            transform = 'perspective(1000px) rotateX(-3deg) translateY(2.5px)';
        } else if (pressedDir === 'LEFT') {
            transform = 'perspective(1000px) rotateY(-3.5deg) translateX(-2px) rotate(-0.5deg)';
        } else if (pressedDir === 'RIGHT') {
            transform = 'perspective(1000px) rotateY(3.5deg) translateX(2px) rotate(0.5deg)';
        } else if (pressedDir === 'ACTION') {
            transform = 'perspective(1000px) translateZ(-5px)';
        }
        return {
            transform,
            transition: pressedDir 
                ? 'transform 0.06s cubic-bezier(0.25, 0.46, 0.45, 0.94)' 
                : 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            transformOrigin: 'bottom center'
        };
    };

    // 2. High Performance Render Loop
    useEffect(() => {
        if (!visible) return;

        const canvas = canvasRef.current;
        const screenCanvas = screenCanvasRef.current;
        if (!canvas || !screenCanvas) return;
        
        const ctx = canvas.getContext('2d');
        const screenCtx = screenCanvas.getContext('2d');
        if (!ctx || !screenCtx) return;

        let frameId: number;
        let lastScreenDrawTime = 0;
        const screenFps = 30;
        const screenFpsInterval = 1000 / screenFps;

        let active = true;

        const drawLoop = (timestamp: number) => {
            if (!active) return;
            frameId = requestAnimationFrame(drawLoop);

            const now = timestamp || performance.now();

            const currentItem = itemRef.current;
            const currentPlayer = playerRef.current;
            const currentSprites = spritesRef.current;
            const currentSourceMaskRect = sourceMaskRectRef.current;
            const currentPressedDir = pressedDirRef.current;
            const currentStrings = stringsRef.current;

            let logicalW = dimensionsRef.current.w;
            let logicalH = dimensionsRef.current.h;

            if (logicalW === 0) {
                logicalW = window.innerWidth > 448 ? 448 : window.innerWidth;
                logicalH = logicalW * 0.75;
            }

            const dpr = window.devicePixelRatio || 1;
            
            const dimensionsWidthChanged = (canvas.width !== Math.floor(logicalW * dpr) || canvas.height !== Math.floor(logicalH * dpr));
            const dimensionsChanged = dimensionsWidthChanged || (logicalW !== lastDimensionsRef.current.w || logicalH !== lastDimensionsRef.current.h || dpr !== lastDimensionsRef.current.dpr);

            if (dimensionsWidthChanged) {
                canvas.width = Math.floor(logicalW * dpr);
                canvas.height = Math.floor(logicalH * dpr);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.scale(dpr, dpr);
                ctx.imageSmoothingEnabled = false;

                screenCanvas.width = Math.floor(logicalW * dpr);
                screenCanvas.height = Math.floor(logicalH * dpr);
                screenCtx.setTransform(1, 0, 0, 1, 0, 0);
                screenCtx.scale(dpr, dpr);
                screenCtx.imageSmoothingEnabled = false;
            }

            if (!currentItem) {
                ctx.clearRect(0, 0, logicalW, logicalH);
                screenCtx.clearRect(0, 0, logicalW, logicalH);
                lastHandAssetToUseRef.current = null;
                lastDimensionsRef.current = { w: 0, h: 0, dpr: 0 };
                lastHandImgCompleteRef.current = false;
                lastHandImgSrcRef.current = '';
                return;
            }

            let handAssetToUse = (currentPlayer.characterId === 'female' && (currentItem.handFemaleAssetId || currentItem.handFemaleAsset)) 
                ? (currentItem.handFemaleAssetId || currentItem.handFemaleAsset) 
                : (currentItem.handAssetId || currentItem.handAsset);
            
            const isFemale = currentPlayer.characterId === 'female';
            
            if (currentItem.type === 'CONSOLE' && currentPressedDir && currentItem.consoleAssets) {
                switch (currentPressedDir) {
                    case 'UP': handAssetToUse = (isFemale && currentItem.consoleAssets.upFemale) ? currentItem.consoleAssets.upFemale : currentItem.consoleAssets.up; break;
                    case 'DOWN': handAssetToUse = (isFemale && currentItem.consoleAssets.downFemale) ? currentItem.consoleAssets.downFemale : currentItem.consoleAssets.down; break;
                    case 'LEFT': handAssetToUse = (isFemale && currentItem.consoleAssets.leftFemale) ? currentItem.consoleAssets.leftFemale : currentItem.consoleAssets.left; break;
                    case 'RIGHT': handAssetToUse = (isFemale && currentItem.consoleAssets.rightFemale) ? currentItem.consoleAssets.rightFemale : currentItem.consoleAssets.right; break;
                    case 'ACTION': handAssetToUse = (isFemale && currentItem.consoleAssets.actionFemale) ? currentItem.consoleAssets.actionFemale : currentItem.consoleAssets.action; break;
                }
            }

            let handImg = handAssetToUse ? currentSprites.get(handAssetToUse) : null;
            if (handAssetToUse && (!handImg || handImg.width === 0)) {
                handImg = currentSprites.get('TEX_FALLBACK');
            }

            const drawH = Math.floor(logicalH * 0.6);
            const aspectRatio = handImg && handImg.width ? (handImg.width / handImg.height) : 1.333;
            const drawW = Math.floor(drawH * aspectRatio);
            const drawX = Math.floor(logicalW - drawW);
            const drawY = Math.floor(logicalH - drawH);

            const isHandImgReady = !!(handImg && handImg.width > 0 && handImg.complete);
            const handImgReadyChanged = (isHandImgReady !== lastHandImgCompleteRef.current);
            const handImgSrcChanged = handImg ? (handImg.src !== lastHandImgSrcRef.current) : false;
            const handChanged = (handAssetToUse !== lastHandAssetToUseRef.current) || handImgReadyChanged || handImgSrcChanged;

            if (handChanged || dimensionsChanged) {
                ctx.clearRect(0, 0, logicalW, logicalH);
                if (isHandImgReady && handImg) {
                    ctx.drawImage(handImg, drawX, drawY, drawW, drawH);
                }

                lastHandAssetToUseRef.current = handAssetToUse;
                lastDimensionsRef.current = { w: logicalW, h: logicalH, dpr: dpr };
                lastHandImgCompleteRef.current = isHandImgReady;
                if (handImg) {
                    lastHandImgSrcRef.current = handImg.src;
                }
            }

            const elapsed = now - lastScreenDrawTime;
            if (elapsed >= screenFpsInterval || dimensionsChanged) {
                lastScreenDrawTime = now - (elapsed % screenFpsInterval);

                screenCtx.clearRect(0, 0, logicalW, logicalH);

                if (currentSourceMaskRect && isHandImgReady && handImg) {
                    screenCtx.save();
                    
                    const scaleX = drawW / handImg.width;
                    const scaleY = drawH / handImg.height;
                    
                    screenCtx.translate(drawX, drawY);
                    screenCtx.scale(scaleX, scaleY);
                    
                    const screenMaskX = currentSourceMaskRect.x;
                    const screenMaskY = currentSourceMaskRect.y;
                    const screenMaskW = currentSourceMaskRect.w;
                    const screenMaskH = currentSourceMaskRect.h;

                    screenCtx.beginPath();
                    screenCtx.rect(screenMaskX, screenMaskY, screenMaskW, screenMaskH);
                    screenCtx.clip();

                    screenCtx.fillStyle = '#8bac0f';
                    screenCtx.fillRect(screenMaskX, screenMaskY, screenMaskW, screenMaskH);

                    const localAnimFrame = Math.floor(now / 16.6667);

                    // 1. GAME SELECTION MENU
                    if (activeGameRef.current === 'menu') {
                        screenCtx.textAlign = 'center';
                        screenCtx.textBaseline = 'top';
                        screenCtx.fillStyle = '#0f380f';
                        screenCtx.font = `bold ${Math.floor(screenMaskH * 0.16)}px monospace`;
                        screenCtx.fillText("GAMES", screenMaskX + screenMaskW / 2, screenMaskY + screenMaskH * 0.08);

                        const gamesList = getAvailableGames();
                        const maxVisible = 3;
                        
                        if (menuIndexRef.current < menuStartIndexRef.current) {
                            menuStartIndexRef.current = menuIndexRef.current;
                        } else if (menuIndexRef.current >= menuStartIndexRef.current + maxVisible) {
                            menuStartIndexRef.current = menuIndexRef.current - maxVisible + 1;
                        }
                        
                        menuStartIndexRef.current = Math.max(0, Math.min(gamesList.length - maxVisible, menuStartIndexRef.current));

                        const startIndex = menuStartIndexRef.current;
                        const visibleGames = gamesList.slice(startIndex, startIndex + maxVisible);
                        const itemHeight = screenMaskH * 0.21;
                        const startY = screenMaskY + screenMaskH * 0.32;
                        screenCtx.font = `bold ${Math.floor(screenMaskH * 0.17)}px monospace`;

                        visibleGames.forEach((g, relativeIdx) => {
                            const actualIdx = startIndex + relativeIdx;
                            const isSelected = menuIndexRef.current === actualIdx;
                            
                            if (isSelected && Math.floor(localAnimFrame / 10) % 2 === 0) {
                                screenCtx.fillStyle = '#306230';
                            } else {
                                screenCtx.fillStyle = '#0f380f';
                            }
                            
                            const textY = startY + relativeIdx * itemHeight;
                            const centerX = screenMaskX + screenMaskW / 2;
                            
                            screenCtx.fillText(g.label, centerX, textY);
                            
                            if (isSelected) {
                                const textWidth = screenCtx.measureText(g.label).width;
                                const pointerOffset = textWidth / 2 + screenMaskW * 0.08;
                                screenCtx.fillText(">", centerX - pointerOffset, textY);
                            }
                        });

                        screenCtx.fillStyle = '#0f380f';
                        screenCtx.font = `bold ${Math.floor(screenMaskH * 0.12)}px monospace`;
                        const arrowX = screenMaskX + screenMaskW * 0.92;
                        if (startIndex > 0) {
                            if (Math.floor(localAnimFrame / 15) % 2 === 0) {
                                screenCtx.fillText("▲", arrowX, screenMaskY + screenMaskH * 0.23);
                            } else {
                                screenCtx.fillText("▲", arrowX, screenMaskY + screenMaskH * 0.25);
                            }
                        }
                        if (startIndex + maxVisible < gamesList.length) {
                            if (Math.floor(localAnimFrame / 15) % 2 === 0) {
                                screenCtx.fillText("▼", arrowX, screenMaskY + screenMaskH * 0.88);
                            } else {
                                screenCtx.fillText("▼", arrowX, screenMaskY + screenMaskH * 0.86);
                            }
                        }
                    } else {
                        // DELEGATE TO ACTIVE GAME CLASS DRAW
                        const activeId = activeGameRef.current;
                        const activeGame = gamesRef.current[activeId];
                        if (activeGame) {
                            activeGame.draw(
                                screenCtx,
                                { screenMaskX, screenMaskY, screenMaskW, screenMaskH },
                                localAnimFrame,
                                settings,
                                currentStrings
                            );
                        } else {
                            screenCtx.textAlign = 'center';
                            screenCtx.textBaseline = 'middle';
                            screenCtx.fillStyle = '#0f380f';
                            screenCtx.font = `bold ${Math.floor(screenMaskH * 0.14)}px monospace`;
                            screenCtx.fillText("UNKNOWN GAME", screenMaskX + screenMaskW / 2, screenMaskY + screenMaskH * 0.3, screenMaskW - 4);
                        }
                    }

                    screenCtx.restore();
                }
            }
        };

        frameId = requestAnimationFrame(drawLoop);
        return () => {
            active = false;
            cancelAnimationFrame(frameId);
        };
    }, [visible]);

    // Touch controls for mobile
    useEffect(() => {
        if (!visible) return;

        let startX = 0;
        let startY = 0;
        let lastInputX = 0;
        let lastInputY = 0;
        let currentSwipeDir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null = null;
        let hasMoved = false;
        let touchStartOnTouchLayer = false;
        let swipeUpTriggeredThisTouch = false;

        let activeSwipeDir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null = null;
        let dasTimeout: any = null;
        let arrInterval: any = null;

        const clearRepeat = () => {
            if (dasTimeout) {
                clearTimeout(dasTimeout);
                dasTimeout = null;
            }
            if (arrInterval) {
                clearInterval(arrInterval);
                arrInterval = null;
            }
        };

        const triggerSwipeAction = (dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN') => {
            const activeId = activeGameRef.current;
            const activeGame = gamesRef.current[activeId];
            if (activeGame && !activeGame.isGameOver()) {
                activeGame.handleSwipe(dir, true);
                
                // Sync states
                setGameOver(activeGame.isGameOver());
                setHasStarted(activeGame.hasStarted());
                scoreRef.current = activeGame.getScore();
            }
        };

        const startRepeat = (dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN') => {
            clearRepeat();
            if (dir === 'UP') return;

            activeSwipeDir = dir;
            
            dasTimeout = setTimeout(() => {
                if (activeSwipeDir === dir) {
                    arrInterval = setInterval(() => {
                        if (activeSwipeDir === dir) {
                            triggerSwipeAction(dir);
                        } else {
                            clearRepeat();
                        }
                    }, 45);
                }
            }, 120);
        };

        const handleTouchStart = (e: TouchEvent) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            lastInputX = startX;
            lastInputY = startY;
            currentSwipeDir = null;
            hasMoved = false;
            swipeUpTriggeredThisTouch = false;
            const target = e.target as HTMLElement;
            touchStartOnTouchLayer = !!(target && target.closest('#controls-touch-layer'));
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!startX && !startY) return;
            
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const totalDx = x - startX;
            const totalDy = y - startY;

            if (Math.abs(totalDx) > 10 || Math.abs(totalDy) > 10) {
                hasMoved = true;
            }

            const dxFromLast = x - lastInputX;
            const dyFromLast = y - lastInputY;
            const threshold = 30;

            if (Math.abs(dxFromLast) > threshold || Math.abs(dyFromLast) > threshold) {
                e.preventDefault();
                let swipeLabel: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null = null;

                if (Math.abs(dxFromLast) > Math.abs(dyFromLast)) {
                    swipeLabel = dxFromLast > 0 ? 'RIGHT' : 'LEFT';
                } else {
                    swipeLabel = dyFromLast > 0 ? 'DOWN' : 'UP';
                }

                if (swipeLabel) {
                    if (swipeLabel === 'UP') {
                        if (swipeUpTriggeredThisTouch) {
                            lastInputX = x;
                            lastInputY = y;
                            return;
                        }
                        swipeUpTriggeredThisTouch = true;
                    }

                    currentSwipeDir = swipeLabel;
                    setPressedDir(swipeLabel);

                    if (activeSwipeDir !== swipeLabel) {
                        startRepeat(swipeLabel);
                        if (playSound) {
                            const s = (item as any)?.sounds?.button || 'CONSOLE_BUTTON';
                            playSound(s);
                        }
                    }

                    // Selection menu swipes (UP/DOWN to select, RIGHT to start)
                    if (activeGameRef.current === 'menu') {
                        const list = getAvailableGames();
                        if (swipeLabel === 'UP') {
                            menuIndexRef.current = Math.max(0, menuIndexRef.current - 1);
                        } else if (swipeLabel === 'DOWN') {
                            menuIndexRef.current = Math.min(list.length - 1, menuIndexRef.current + 1);
                        } else if (swipeLabel === 'RIGHT') {
                            const selected = list[menuIndexRef.current];
                            if (selected) {
                                activeGameRef.current = selected.id;
                                const activeGame = gamesRef.current[selected.id];
                                if (activeGame) {
                                    activeGame.init((id) => playSound?.(id));
                                    activeGame.reset();
                                    setGameOver(activeGame.isGameOver());
                                    setHasStarted(activeGame.hasStarted());
                                    scoreRef.current = activeGame.getScore();
                                    
                                    const speed = activeGame.getTickSpeed();
                                    startGameInterval(tickActiveGame, speed);
                                }
                            }
                        }
                    } else {
                        // DELEGATE TO ACTIVE GAME HANDLERS
                        const activeId = activeGameRef.current;
                        const activeGame = gamesRef.current[activeId];
                        if (activeGame && !activeGame.isGameOver()) {
                            activeGame.handleSwipe(swipeLabel);
                            
                            // Sync states
                            setGameOver(activeGame.isGameOver());
                            setHasStarted(activeGame.hasStarted());
                            scoreRef.current = activeGame.getScore();
                        }
                    }

                    lastInputX = x;
                    lastInputY = y;
                }
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            clearRepeat();
            activeSwipeDir = null;

            const target = e.target as HTMLElement;
            const isTouchLayer = touchStartOnTouchLayer || !!(target && target.closest('#controls-touch-layer'));

            if (!hasMoved && startX > 0 && startY > 0) {
                if (isTouchLayer) {
                    startX = 0;
                    startY = 0;
                    lastInputX = 0;
                    lastInputY = 0;
                    currentSwipeDir = null;
                    touchStartOnTouchLayer = false;
                    return;
                }

                setPressedDir('ACTION');
                setTimeout(() => {
                    setPressedDir(null);
                }, 100);

                if (playSound) {
                    const s = (item as any)?.sounds?.button || 'CONSOLE_BUTTON';
                    playSound(s);
                }

                const activeId = activeGameRef.current;
                const activeGame = gamesRef.current[activeId];
                if (activeGame && !activeGame.isGameOver()) {
                    if (activeGame.handleTap) {
                        activeGame.handleTap();
                    } else {
                        activeGame.handleKeyDown({
                            isUp: false, isDown: false, isLeft: false, isRight: false, isAction: true, isStart: false, key: ' ', repeat: false
                        });
                    }
                    
                    // Sync states
                    setGameOver(activeGame.isGameOver());
                    setHasStarted(activeGame.hasStarted());
                    scoreRef.current = activeGame.getScore();
                } else {
                    handleActionButton(true);
                }
            } else {
                if (pressedDirRef.current !== 'ACTION') {
                    setPressedDir(null);
                }
            }

            startX = 0;
            startY = 0;
            lastInputX = 0;
            lastInputY = 0;
            currentSwipeDir = null;
            touchStartOnTouchLayer = false;
            swipeUpTriggeredThisTouch = false;
        };

        window.addEventListener('touchstart', handleTouchStart, { passive: false });
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd, { passive: false });
        window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        
        return () => {
            clearRepeat();
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            window.removeEventListener('touchcancel', handleTouchEnd);
        }
    }, [visible, playSound, getAvailableGames, tickActiveGame]);

    // Screen Transform Sync
    const screenContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!visible || !mapContainerRef?.current || !screenContainerRef.current) return;
        
        screenContainerRef.current.style.transform = mapContainerRef.current.style.transform;

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "attributes" && mutation.attributeName === "style" && mapContainerRef.current && screenContainerRef.current) {
                    screenContainerRef.current.style.transform = mapContainerRef.current.style.transform;
                }
            }
        });

        observer.observe(mapContainerRef.current, { attributes: true, attributeFilter: ["style"] });

        return () => observer.disconnect();
    }, [mapContainerRef, visible]);

    return (
        <div 
            ref={containerRef}
            className={`absolute inset-0 z-[200] pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`} 
            style={{ visibility: visible ? 'visible' : 'hidden' }}
        >
            <div 
                ref={mapContainerRef}
                className="w-full h-full absolute inset-0 pointer-events-none"
                style={{
                    transformOrigin: 'bottom right',
                    ...(handStyleFinal || {})
                }}
            >
                <canvas 
                    ref={canvasRef} 
                    className="w-full h-full object-contain" 
                    style={{ 
                        imageRendering: 'pixelated',
                        ...getTiltStyle()
                    }} 
                />
            </div>
            
            <div 
                ref={screenContainerRef}
                className="w-full h-full absolute inset-0 pointer-events-none"
                style={{
                    transformOrigin: 'bottom right',
                    ...((handStyleFinal && handStyleFinal.transform) ? { transform: handStyleFinal.transform } : {})
                }}
            >
                <canvas 
                    ref={screenCanvasRef} 
                    className="w-full h-full object-contain mix-blend-screen" 
                    style={{ 
                        imageRendering: 'pixelated', 
                        filter: 'drop-shadow(0 0 10px rgba(139,172,15,0.8))',
                        ...getTiltStyle()
                    }} 
                />
            </div>
        </div>
    );
};

export default React.memo(ConsoleOverlay);
