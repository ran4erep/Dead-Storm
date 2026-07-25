import React, { useRef, useEffect, useState } from 'react';
import { GameStrings } from '../types';

interface KeypadModalProps {
    strings: GameStrings;
    spriteMap: Map<string, HTMLImageElement>;
    assetId?: string;
    maskAssetId?: string;
    password?: string;
    onClose: () => void;
    onUnlock: () => void;
    onKeyPress?: () => void;
    onSuccess?: () => void;
    onFail?: () => void;
}

const colorToButton: Record<string, string> = {
    '255,0,0': '0',
    '255,128,0': '1',
    '255,255,0': '2',
    '128,255,0': '3',
    '0,255,0': '4',
    '0,255,128': '5',
    '0,255,255': '6',
    '0,128,255': '7',
    '0,0,255': '8',
    '128,0,255': '9',
    '42,42,42': '*',
    '165,42,42': '#'
};

const KEYPAD_GRID = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#']
];

const KeypadModal: React.FC<KeypadModalProps> = ({ strings, spriteMap, assetId, maskAssetId, password, onClose, onUnlock, onKeyPress, onSuccess, onFail }) => {
    const defaultImgElem = spriteMap.get('KEYPAD');
    const specificImgElem = assetId ? spriteMap.get(assetId) : undefined;
    const imgElem = specificImgElem || defaultImgElem;

    const maskImageElement = maskAssetId ? spriteMap.get(maskAssetId) : undefined;
    
    const canvasRef = useRef<HTMLCanvasElement>(null); // hidden one for picking
    const mainCanvasRef = useRef<HTMLCanvasElement>(null); // visible one
    
    const [inputBuffer, setInputBuffer] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const [displayRect, setDisplayRect] = useState<{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number} | null>(null);
    const [buttonRects, setButtonRects] = useState<Record<string, { minX: number, minY: number, maxX: number, maxY: number }>>({});
    const [selectedButton, setSelectedButton] = useState<string>('5');
    const [gamepadActive, setGamepadActive] = useState<boolean>(false);

    const selectedButtonRef = useRef<string>('5');
    const updateSelectedButton = (val: string | ((prev: string) => string)) => {
        if (typeof val === 'function') {
            setSelectedButton(prev => {
                const next = val(prev);
                selectedButtonRef.current = next;
                return next;
            });
        } else {
            setSelectedButton(val);
            selectedButtonRef.current = val;
        }
    };

    // Initial analysis of mask to find spatial bounding box dimensions for keypad numbers and screen display
    useEffect(() => {
        if (!maskImageElement || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        canvasRef.current.width = maskImageElement.width;
        canvasRef.current.height = maskImageElement.height;
        ctx.drawImage(maskImageElement, 0, 0);

        const imageData = ctx.getImageData(0, 0, maskImageElement.width, maskImageElement.height);
        const data = imageData.data;
        let minX = maskImageElement.width, minY = maskImageElement.height, maxX = 0, maxY = 0;
        let found = false;

        const bounds: Record<string, { minX: number, minY: number, maxX: number, maxY: number }> = {};
        const colors = Object.keys(colorToButton).map(key => {
            const [r, g, b] = key.split(',').map(Number);
            return { r, g, b, btn: colorToButton[key] };
        });
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const a = data[i+3];
            if (a < 10) continue;

            const pixelIndex = i / 4;
            const x = pixelIndex % maskImageElement.width;
            const y = Math.floor(pixelIndex / maskImageElement.width);

            // FF00FF = 255, 0, 255 is display rect
            if (r === 255 && g === 0 && b === 255) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            } else {
                // Match closest button color
                let bestBtn: string | null = null;
                let minDiff = 1000;
                for (const cInfo of colors) {
                    const diff = Math.abs(r - cInfo.r) + Math.abs(g - cInfo.g) + Math.abs(b - cInfo.b);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestBtn = cInfo.btn;
                    }
                }

                if (bestBtn && minDiff < 150) {
                    if (!bounds[bestBtn]) {
                        bounds[bestBtn] = { minX: x, minY: y, maxX: x, maxY: y };
                    } else {
                        const bRect = bounds[bestBtn];
                        if (x < bRect.minX) bRect.minX = x;
                        if (x > bRect.maxX) bRect.maxX = x;
                        if (y < bRect.minY) bRect.minY = y;
                        if (y > bRect.maxY) bRect.maxY = y;
                    }
                }
            }
        }
        
        if (found) {
            setDisplayRect({ minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
        }
        setButtonRects(bounds);
    }, [maskImageElement]);

    // Redraw visible canvas whenever state changes
    useEffect(() => {
        if (!imgElem || !mainCanvasRef.current) return;
        const ctx = mainCanvasRef.current.getContext('2d');
        if (!ctx) return;

        mainCanvasRef.current.width = imgElem.naturalWidth || imgElem.width;
        mainCanvasRef.current.height = imgElem.naturalHeight || imgElem.height;

        // Base image
        ctx.clearRect(0, 0, mainCanvasRef.current.width, mainCanvasRef.current.height);
        ctx.drawImage(imgElem, 0, 0);

        // Display
        if (displayRect) {
            // Fill background
            ctx.fillStyle = isSuccess ? '#0d4013' : '#3d0a0a';
            ctx.fillRect(displayRect.minX, displayRect.minY, displayRect.width, displayRect.height);

            // Draw text
            const partWidth = displayRect.width / 4;
            
            ctx.fillStyle = isSuccess ? '#aaffaa' : '#ffaaaa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const fontSize = Math.floor(displayRect.height * 0.7);
            ctx.font = `bold ${fontSize}px monospace`;

            for (let i = 0; i < 4; i++) {
                const char = inputBuffer[i];
                if (char) {
                    const centerX = displayRect.minX + (i * partWidth) + (partWidth / 2);
                    const centerY = displayRect.minY + (displayRect.height / 2);
                    ctx.fillText(char, centerX, centerY);
                } else if (!isSuccess) {
                    const centerX = displayRect.minX + (i * partWidth) + (partWidth / 2);
                    const centerY = displayRect.minY + (displayRect.height / 2);
                    // Draw a subtle placeholder line
                    const lineY = displayRect.minY + (displayRect.height * 0.8);
                    const lineW = partWidth * 0.5;
                    ctx.fillStyle = 'rgba(255, 100, 100, 0.4)';
                    ctx.fillRect(centerX - lineW / 2, lineY, lineW, Math.max(1, displayRect.height * 0.05));
                    ctx.fillStyle = '#ffaaaa'; // reset for next text
                }
            }
        }

        // Draw glowing selection frames around focused gamepad button controls (matching the global blue theme outline)
        if (gamepadActive && selectedButton && buttonRects[selectedButton]) {
            const rect = buttonRects[selectedButton];
            ctx.save();
            ctx.strokeStyle = '#3b82f6'; // blue-500 matching game accents
            ctx.lineWidth = 2; // thin, crisp border matching the UI
            const pad = 1.5;
            const rx = rect.minX - pad;
            const ry = rect.minY - pad;
            const rw = (rect.maxX - rect.minX) + pad * 2;
            const rh = (rect.maxY - rect.minY) + pad * 2;

            ctx.shadowColor = 'rgba(59, 130, 246, 0.7)';
            ctx.shadowBlur = 10;
            ctx.strokeRect(rx, ry, rw, rh);

            ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.restore();
        }
    }, [imgElem, displayRect, inputBuffer, isSuccess, gamepadActive, selectedButton, buttonRects]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.stopPropagation();
        if (!mainCanvasRef.current || !canvasRef.current || !maskImageElement) return;

        const rect = mainCanvasRef.current.getBoundingClientRect();
        
        const imgRatio = maskImageElement.width / maskImageElement.height;
        const rectRatio = rect.width / rect.height;
        
        let renderedWidth = rect.width;
        let renderedHeight = rect.height;
        let offsetX = 0;
        let offsetY = 0;

        if (imgRatio > rectRatio) {
            renderedHeight = rect.width / imgRatio;
            offsetY = (rect.height - renderedHeight) / 2;
        } else {
            renderedWidth = rect.height * imgRatio;
            offsetX = (rect.width - renderedWidth) / 2;
        }

        const clickX = e.clientX - rect.left - offsetX;
        const clickY = e.clientY - rect.top - offsetY;

        if (clickX < 0 || clickY < 0 || clickX > renderedWidth || clickY > renderedHeight) return;

        const x = Math.floor((clickX / renderedWidth) * maskImageElement.width);
        const y = Math.floor((clickY / renderedHeight) * maskImageElement.height);

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const pixel = ctx.getImageData(x, y, 1, 1).data;
        if (pixel[3] > 10) { 
            let matchedButton: string | null = null;
            let minDiff = 1000;
            for (const [key, btn] of Object.entries(colorToButton)) {
                const [r, g, b] = key.split(',').map(Number);
                const diff = Math.abs(r - pixel[0]) + Math.abs(g - pixel[1]) + Math.abs(b - pixel[2]);
                if (diff < minDiff) {
                    minDiff = diff;
                    matchedButton = btn;
                }
            }

            if (matchedButton && minDiff < 150) {
                // If clicked, we also sync state
                setGamepadActive(false);
                setSelectedButton(matchedButton);
                selectedButtonRef.current = matchedButton;
                handleButtonPress(matchedButton);
            }
        }
    };

    const handleButtonPress = (btn: string) => {
        if (isSuccess) return;

        if (btn === '*' || btn === '#') {
            if (onKeyPress) onKeyPress();
            setInputBuffer('');
            return;
        }

        setInputBuffer(prev => {
            if (prev.length === 4) return prev; // wait for timeout to clear

            const newBuffer = prev + btn;
            if (newBuffer.length < 4) {
                if (onKeyPress) onKeyPress();
            }
            
            if (newBuffer.length === 4) {
                if (password && newBuffer === password) {
                    setIsSuccess(true);
                    if (onSuccess) onSuccess();
                    setTimeout(() => {
                        onUnlock();
                        onClose();
                    }, 500);
                } else {
                    if (onFail) onFail();
                    setTimeout(() => setInputBuffer(''), 500);
                }
            }
            return newBuffer;
        });
    };

    const handleButtonPressRef = useRef(handleButtonPress);
    useEffect(() => {
        handleButtonPressRef.current = handleButtonPress;
    }, [handleButtonPress]);

    // Track button A and B release state when the modal mounts, preventing instantly pressing buttons due to a carryover "A" button press
    const gamepadButtonANeedReleaseRef = useRef<boolean>(true);
    const gamepadButtonBNeedReleaseRef = useRef<boolean>(true);

    // Gamepad connection and polling setup
    useEffect(() => {
        let rafId: number;
        let lastActionTime = 0;
        const debounceInterval = 180; // comfortable menu stepping speed

        let prevButtonA = false;
        let prevButtonB = false;

        const checkGamepad = () => {
            const gamepads = navigator.getGamepads();
            let activeGamepad = null;
            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i]) {
                    activeGamepad = gamepads[i];
                    break;
                }
            }

            if (!activeGamepad) {
                rafId = requestAnimationFrame(checkGamepad);
                return;
            }

            const now = performance.now();

            const dpadUp = activeGamepad.buttons[12]?.pressed;
            const dpadDown = activeGamepad.buttons[13]?.pressed;
            const dpadLeft = activeGamepad.buttons[14]?.pressed;
            const dpadRight = activeGamepad.buttons[15]?.pressed;

            const stickX = activeGamepad.axes[0] || 0;
            const stickY = activeGamepad.axes[1] || 0;
            const AXIS_THRESHOLD = 0.5;

            const upPressed = dpadUp || (stickY < -AXIS_THRESHOLD);
            const downPressed = dpadDown || (stickY > AXIS_THRESHOLD);
            const leftPressed = dpadLeft || (stickX < -AXIS_THRESHOLD);
            const rightPressed = dpadRight || (stickX > AXIS_THRESHOLD);

            const buttonA = !!activeGamepad.buttons[0]?.pressed; // maps to A/X
            const buttonB = !!activeGamepad.buttons[1]?.pressed; // maps to B/Circle

            // Handle release tracking to prevent carryover click on open
            if (gamepadButtonANeedReleaseRef.current) {
                if (!buttonA) {
                    gamepadButtonANeedReleaseRef.current = false;
                }
            }
            if (gamepadButtonBNeedReleaseRef.current) {
                if (!buttonB) {
                    gamepadButtonBNeedReleaseRef.current = false;
                }
            }

            const isDirectionPressed = upPressed || downPressed || leftPressed || rightPressed;

            if (isDirectionPressed && (now - lastActionTime > debounceInterval)) {
                setGamepadActive(true);
                updateSelectedButton(current => {
                    let r = 1;
                    let c = 1;
                    for (let row = 0; row < KEYPAD_GRID.length; row++) {
                        const col = KEYPAD_GRID[row].indexOf(current);
                        if (col !== -1) {
                            r = row;
                            c = col;
                            break;
                        }
                    }

                    if (upPressed) {
                        r = (r - 1 + 4) % 4;
                    } else if (downPressed) {
                        r = (r + 1) % 4;
                    } else if (leftPressed) {
                        c = (c - 1 + 3) % 3;
                    } else if (rightPressed) {
                        c = (c + 1) % 3;
                    }

                    return KEYPAD_GRID[r][c];
                });
                lastActionTime = now;
            }

            if (buttonA && !prevButtonA && !gamepadButtonANeedReleaseRef.current) {
                setGamepadActive(true);
                if (handleButtonPressRef.current) {
                    handleButtonPressRef.current(selectedButtonRef.current);
                }
            }

            if (buttonB && !prevButtonB && !gamepadButtonBNeedReleaseRef.current) {
                onClose();
            }

            prevButtonA = buttonA;
            prevButtonB = buttonB;

            rafId = requestAnimationFrame(checkGamepad);
        };

        rafId = requestAnimationFrame(checkGamepad);
        return () => {
            cancelAnimationFrame(rafId);
        };
    }, [onClose]);

    return (
        <div 
            className="absolute inset-0 z-[300] bg-black/40 flex items-center justify-center backdrop-blur-sm pointer-events-auto cursor-pointer"
            onPointerDown={onClose}
        >
            <canvas ref={canvasRef} className="hidden" />
            
            {imgElem ? (
                <div className="relative h-full w-full flex flex-col justify-center items-center">
                    <canvas 
                        ref={mainCanvasRef}
                        className="h-full w-auto max-w-full object-contain drop-shadow-2xl cursor-default"
                        style={{ imageRendering: 'pixelated' }}
                        onPointerDown={handlePointerDown}
                    />
                </div>
            ) : (
                <div className="text-red-500 font-mono text-center p-8 bg-black/80 rounded-lg">
                    ASSET NOT FOUND
                </div>
            )}
        </div>
    );
};

export default React.memo(KeypadModal);
