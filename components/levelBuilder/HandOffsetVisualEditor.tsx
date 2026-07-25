import React, { useState, useEffect, useRef } from 'react';
import { X, Crosshair } from 'lucide-react';

interface HandOffsetVisualEditorProps {
    initialOffset: { x: number, y: number };
    weaponSpriteUrl?: string;
    handScale?: number;
    onSave: (offset: { x: number, y: number }) => void;
    onClose: () => void;
    uiStrings?: any;
}

export const HandOffsetVisualEditor: React.FC<HandOffsetVisualEditorProps> = ({ initialOffset, weaponSpriteUrl, handScale = 1.0, onSave, onClose, uiStrings }) => {
    const [offset, setOffset] = useState({
        x: initialOffset?.x || 0,
        y: initialOffset?.y || 0
    });
    const [viewportScale, setViewportScale] = useState(1);
    const [liveAspectRatio, setLiveAspectRatio] = useState(4/3);
    const [isLowered, setIsLowered] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const getGameViewportDimensions = (w: number, h: number) => {
        const isLandscape = w > h;
        if (isLandscape) {
            const availHeight = h - 60;
            const flexW = w * 0.8;
            const maxW = h * (4 / 3);
            const width = Math.min(flexW, maxW);
            const height = availHeight;
            return { width, height, aspectRatio: width / Math.max(1, height) };
        } else {
            const parentW = Math.min(w, 448);
            const width = parentW;
            const idealH = width * 0.75;
            const maxH = h * 0.45;
            const height = Math.min(idealH, maxH);
            return { width, height, aspectRatio: width / Math.max(1, height) };
        }
    };

    useEffect(() => {
        const updateScale = () => {
            if (!containerRef.current) return;
            const gameHeight = containerRef.current.clientHeight;
            const newScale = Math.max(0.5, gameHeight / 270);
            setViewportScale(newScale);

            // Fetch live aspect ratio
            const w = window.innerWidth;
            const h = window.innerHeight;
            const dims = getGameViewportDimensions(w, h);
            setLiveAspectRatio(dims.aspectRatio);
        };

        const observer = new ResizeObserver(() => updateScale());
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }
        updateScale(); // initial

        window.addEventListener('resize', updateScale);
        return () => {
            window.removeEventListener('resize', updateScale);
            observer.disconnect();
        };
    }, []);

    const handleSave = () => {
        onSave(offset);
        onClose();
    };

    let resolvedSpriteUrl = weaponSpriteUrl;
    if (resolvedSpriteUrl && resolvedSpriteUrl.startsWith('local://')) {
        resolvedSpriteUrl = localStorage.getItem(resolvedSpriteUrl.substring(8)) || resolvedSpriteUrl;
    }

    return (
        <div className="absolute inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center md:p-4">
            <div className="bg-gray-900 md:border border-gray-700 md:rounded-lg shadow-xl flex flex-col w-full max-w-5xl h-full md:h-[85dvh] md:max-h-[90dvh]">
                <div className="flex justify-between items-center p-3 border-b border-gray-800 shrink-0">
                    <h3 className="text-white font-bold flex items-center gap-2">
                        <Crosshair size={18} className="text-yellow-400" />
                        {uiStrings?.hand_offset_editor || "Hand Offset Editor"}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 bg-gray-800 rounded"><X size={20} /></button>
                </div>
                
                <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden border-b border-gray-800 p-2 sm:p-4">
                    {/* Simulated Viewport (matching game) */}
                    <div 
                        ref={containerRef}
                        className="relative bg-gray-900 border border-gray-700 overflow-hidden shadow-2xl shrink-0" 
                        style={{ 
                            aspectRatio: `${liveAspectRatio}`,
                            maxHeight: '100%',
                            maxWidth: '100%',
                            height: '100%',
                            backgroundImage: 'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)', 
                            backgroundSize: '16px 16px', 
                            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px' 
                        }}
                    >
                        {/* Hand Component Simulation exactly matching WeaponHands.tsx hierarchy */}
                        <div className="absolute inset-0 z-[15] pointer-events-none">
                            <div 
                                className="absolute bottom-0 right-0 h-[60%] w-auto flex flex-col justify-end items-end"
                                style={{ 
                                    transformOrigin: 'bottom right',
                                    transform: `translate(${offset.x * viewportScale}px, ${offset.y * viewportScale}px) scale(${handScale}) rotate(0deg)` 
                                }}
                            >
                                <div 
                                    className="relative h-full w-auto origin-bottom-right transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                                    style={{ transform: isLowered ? 'translateY(30%)' : 'translateY(0%)' }}
                                >
                                    {resolvedSpriteUrl ? (
                                        <>
                                            <img src={resolvedSpriteUrl} className="absolute h-full w-auto object-contain object-right-bottom opacity-40" alt="" style={{ imageRendering: 'pixelated', filter: 'brightness(0) blur(4px)', transform: 'translate(4%, 4%)' }} crossOrigin="anonymous" />
                                            <img src={resolvedSpriteUrl} className="relative h-full w-auto object-contain object-right-bottom" alt="Weapon" style={{ imageRendering: 'pixelated' }} crossOrigin="anonymous" />
                                        </>
                                    ) : (
                                        <div className="h-full aspect-square bg-red-500/50 border-2 border-red-500 flex items-center justify-center text-xs text-white">{uiStrings?.no_sprite || "No Sprite"}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-3 sm:p-4 bg-gray-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0 overflow-y-auto">
                    <div className="flex-1 w-full flex flex-col gap-1">
                        <label className="text-gray-400 text-xs sm:text-sm font-mono flex justify-between">
                            <span>{uiStrings?.x_offset || "X Offset"}</span>
                            <span className="text-white font-bold">{offset.x}px</span>
                        </label>
                        <InfiniteSlider onChangeDelta={(delta) => setOffset(prev => ({ ...prev, x: prev.x + delta }))} />
                    </div>
                    <div className="flex-1 w-full flex flex-col gap-1">
                        <label className="text-gray-400 text-xs sm:text-sm font-mono flex justify-between">
                            <span>{uiStrings?.y_offset || "Y Offset"}</span>
                            <span className="text-white font-bold">{offset.y}px</span>
                        </label>
                        <InfiniteSlider onChangeDelta={(delta) => setOffset(prev => ({ ...prev, y: prev.y + delta }))} />
                    </div>
                    
                    {/* Weapon Lowered Switcher */}
                    <div className="flex flex-col gap-1 min-w-[200px]">
                        <span className="text-gray-400 text-xs sm:text-sm font-mono">{uiStrings?.weapon_state || "Weapon Position"}</span>
                        <div className="flex bg-gray-900 p-0.5 rounded border border-gray-700">
                            <button 
                                type="button"
                                onClick={() => setIsLowered(false)}
                                className={`flex-1 py-1.5 px-2 text-xs font-mono font-bold rounded transition-all cursor-pointer text-center ${!isLowered ? 'bg-yellow-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
                            >
                                {uiStrings?.weapon_state_raised || "Raised (combat)"}
                            </button>
                            <button 
                                type="button"
                                onClick={() => setIsLowered(true)}
                                className={`flex-1 py-1.5 px-2 text-xs font-mono font-bold rounded transition-all cursor-pointer text-center ${isLowered ? 'bg-yellow-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
                            >
                                {uiStrings?.weapon_state_lowered || "Lowered (explore)"}
                            </button>
                        </div>
                    </div>

                    <div className="w-full sm:w-auto pt-2 sm:pt-4">
                        <button onClick={handleSave} className="w-full sm:w-auto bg-blue-600 text-white px-8 py-3 sm:py-2 rounded font-bold hover:bg-blue-500 shadow-lg text-lg sm:text-base border border-blue-400 cursor-pointer">{uiStrings?.save_changes || "SAVE CHANGES"}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InfiniteSlider = ({ onChangeDelta }: { onChangeDelta: (delta: number) => void }) => {
    const [sliderVal, setSliderVal] = useState(0);
    const draggingRef = useRef(false);

    const handlePointerDown = () => {
        draggingRef.current = true;
    };

    const handlePointerUp = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setSliderVal(0); // Reset visual thumb to center smoothly
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const currentSliderVal = Number(e.target.value || 0);
        const delta = currentSliderVal - sliderVal;
        
        onChangeDelta(delta);
        setSliderVal(currentSliderVal);
    };

    useEffect(() => {
        window.addEventListener('pointerup', handlePointerUp);
        return () => window.removeEventListener('pointerup', handlePointerUp);
    }, []);

    // Also handle regular manual number input
    return (
        <div className="flex gap-2 items-center">
            <button onClick={() => onChangeDelta(-1)} className="bg-gray-700 text-white p-1 rounded hover:bg-gray-600 shadow">-</button>
            <input 
                type="range" 
                min="-100" 
                max="100" 
                value={sliderVal} 
                onPointerDown={handlePointerDown}
                onChange={handleChange}
                className="flex-1 accent-yellow-400 cursor-grab active:cursor-grabbing"
            />
            <button onClick={() => onChangeDelta(1)} className="bg-gray-700 text-white p-1 rounded hover:bg-gray-600 shadow">+</button>
        </div>
    );
};
