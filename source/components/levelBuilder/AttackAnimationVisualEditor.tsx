import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Square, Plus, Trash2, Crosshair, ChevronLeft, ChevronRight, Copy } from 'lucide-react';

interface AnimationFrame {
    id?: string;
    duration: number;
    x: number;
    y: number;
    scale?: number;
}

interface AttackAnimationVisualEditorProps {
    initialAnimation: AnimationFrame[];
    weaponSpriteUrl?: string;
    handScale?: number;
    initialOffset?: { x: number, y: number };
    onSave: (animation: AnimationFrame[]) => void;
    onClose: () => void;
    uiStrings?: any;
}

export const AttackAnimationVisualEditor: React.FC<AttackAnimationVisualEditorProps> = ({ 
    initialAnimation, 
    weaponSpriteUrl, 
    handScale = 1.0, 
    initialOffset = { x: 0, y: 0 },
    onSave, 
    onClose, 
    uiStrings 
}) => {
    const [frames, setFrames] = useState<AnimationFrame[]>(
        initialAnimation && initialAnimation.length > 0 ? initialAnimation : [
            { duration: 100, x: 100, y: -50, scale: 1.2 },
            { duration: 200, x: 0, y: 0, scale: 1 }
        ]
    );

    const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [viewportScale, setViewportScale] = useState(1);
    const [liveAspectRatio, setLiveAspectRatio] = useState(4/3);
    
    // Playback state
    const [playbackTime, setPlaybackTime] = useState<number>(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef<number>();
    const startTimeRef = useRef<number>(0);
    
    const totalDuration = frames.reduce((acc, f) => acc + (f.duration || 0), 0) || 1;

    useEffect(() => {
        const updateScale = () => {
            if (!containerRef.current) return;
            const gameHeight = containerRef.current.clientHeight;
            const newScale = Math.max(0.5, gameHeight / 270);
            setViewportScale(newScale);

            // Fetch live aspect ratio
            const w = window.innerWidth;
            const h = window.innerHeight;
            const isLandscape = w > h;
            let currentAspectRatio = 4/3;
            if (isLandscape) {
                const availHeight = h - 60;
                const maxW = h * (4 / 3);
                const availW = w * 0.8;
                const width = Math.min(availW, maxW);
                currentAspectRatio = width / Math.max(1, availHeight);
            } else {
                const width = w;
                const maxH = h * 0.45;
                const idealH = w * 0.75;
                const height = idealH > maxH ? maxH : idealH;
                currentAspectRatio = width / Math.max(1, height);
            }
            setLiveAspectRatio(currentAspectRatio);
        };
        const observer = new ResizeObserver(() => updateScale());
        if (containerRef.current) observer.observe(containerRef.current);
        updateScale();

        window.addEventListener('resize', updateScale);
        return () => {
            window.removeEventListener('resize', updateScale);
            observer.disconnect();
        };
    }, []);

    const animate = (time: number) => {
        if (!startTimeRef.current) startTimeRef.current = time;
        const elapsed = time - startTimeRef.current;
        
        if (elapsed > totalDuration) {
            startTimeRef.current = time; // Loop
            setPlaybackTime(0);
        } else {
            setPlaybackTime(elapsed);
        }
        
        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        if (isPlaying) {
            startTimeRef.current = performance.now() - playbackTime;
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying, frames]);

    const handleSave = () => {
        onSave(frames);
        onClose();
    };

    let resolvedSpriteUrl = weaponSpriteUrl;
    if (resolvedSpriteUrl && resolvedSpriteUrl.startsWith('local://')) {
        resolvedSpriteUrl = localStorage.getItem(resolvedSpriteUrl.substring(8)) || resolvedSpriteUrl;
    }

    // Calculate current transform
    let currentX = 0;
    let currentY = 0;
    let currentScale = 1;

    if (isPlaying) {
        let cumulativeTime = 0;
        let foundFrame = false;
        let prevFrame: AnimationFrame = { duration: 0, x: 0, y: 0, scale: 1 };

        for (const frame of frames) {
            const frameDuration = frame.duration || 0;
            if (playbackTime < cumulativeTime + frameDuration) {
                const frameElapsed = playbackTime - cumulativeTime;
                const t = frameDuration > 0 ? frameElapsed / frameDuration : 1;
                const easeT = t * (2 - t);

                currentX = prevFrame.x + (frame.x - prevFrame.x) * easeT;
                currentY = prevFrame.y + (frame.y - prevFrame.y) * easeT;
                currentScale = (prevFrame.scale ?? 1) + ((frame.scale ?? 1) - (prevFrame.scale ?? 1)) * easeT;
                
                foundFrame = true;
                break;
            }
            cumulativeTime += frameDuration;
            prevFrame = frame;
        }

        if (!foundFrame && frames.length > 0) {
            const lastFrame = frames[frames.length - 1];
            currentX = lastFrame.x;
            currentY = lastFrame.y;
            currentScale = lastFrame.scale ?? 1;
        }
    } else if (frames.length > 0) {
        const frame = frames[selectedFrameIndex] || { x: 0, y: 0, scale: 1 };
        currentX = Number(frame.x) || 0;
        currentY = Number(frame.y) || 0;
        currentScale = Number(frame.scale ?? 1);
    }

    const selectedFrame = frames[selectedFrameIndex] || null;

    const updateSelectedFrame = (updates: Partial<AnimationFrame>) => {
        const newFrames = [...frames];
        newFrames[selectedFrameIndex] = { ...newFrames[selectedFrameIndex], ...updates };
        setFrames(newFrames);
    };

    const addFrame = () => {
        const newFrames = [...frames];
        const newFrame = selectedFrame ? { ...selectedFrame } : { duration: 100, x: 0, y: 0, scale: 1 };
        newFrames.splice(selectedFrameIndex + 1, 0, newFrame);
        setFrames(newFrames);
        setSelectedFrameIndex(selectedFrameIndex + 1);
    };

    const deleteFrame = () => {
        if (frames.length <= 1) return;
        const newFrames = frames.filter((_, i) => i !== selectedFrameIndex);
        setFrames(newFrames);
        if (selectedFrameIndex >= newFrames.length) {
            setSelectedFrameIndex(newFrames.length - 1);
        }
    };

    return (
        <div className="absolute inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center md:p-4">
            <div className="bg-gray-900 md:border border-gray-700 md:rounded-lg shadow-xl flex flex-col w-full max-w-5xl h-full md:h-[85dvh] md:max-h-[90dvh]">
                <div className="flex justify-between items-center p-3 border-b border-gray-800 shrink-0">
                    <h3 className="text-white font-bold flex items-center gap-2">
                        <Crosshair size={18} className="text-yellow-400" />
                        {uiStrings?.attack_anim_editor || "Attack Animation Editor"}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 bg-gray-800 rounded"><X size={20} /></button>
                </div>
                
                <div className="flex-1 relative bg-black flex flex-col md:flex-row overflow-hidden min-h-0">
                    {/* Viewport */}
                    <div className="h-[35dvh] sm:h-[45dvh] md:h-auto md:flex-1 border-b md:border-b-0 md:border-r border-gray-800 p-2 sm:p-4 flex items-center justify-center bg-gray-950 relative overflow-hidden shrink-0">
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
                            <div className="absolute inset-0 flex flex-col pointer-events-none p-4 z-[10]">
                                <div className="border border-green-500/20 flex-1 relative flex items-center justify-center m-4 sm:m-8 border-dashed">
                                   <div className="absolute w-[2px] h-[16px] bg-white opacity-40"></div>
                                   <div className="absolute h-[2px] w-[16px] bg-white opacity-40"></div>
                                </div>
                            </div>

                            <div className="absolute inset-0 z-[15] pointer-events-none">
                                <div 
                                    className="absolute bottom-0 right-0 h-[60%] w-auto flex flex-col justify-end items-end"
                                    style={{ 
                                        transformOrigin: 'bottom right',
                                        transform: `translate(${((initialOffset?.x || 0) + currentX) * viewportScale}px, ${((initialOffset?.y || 0) + currentY) * viewportScale}px) scale(${(handScale || 1.0) * currentScale}) rotate(0deg)` 
                                    }}
                                >
                                    <div className="relative h-full w-auto origin-bottom-right">
                                        {resolvedSpriteUrl ? (
                                            <>
                                                <img src={resolvedSpriteUrl} className="absolute h-full w-auto object-contain object-right-bottom opacity-40" alt="" style={{ imageRendering: 'pixelated', filter: 'brightness(0) blur(4px)', transform: 'translate(4%, 4%)' }} crossOrigin="anonymous" />
                                                <img src={resolvedSpriteUrl} className="relative h-full w-auto object-contain object-right-bottom" alt="Weapon" style={{ imageRendering: 'pixelated' }} crossOrigin="anonymous" />
                                            </>
                                        ) : (
                                            <div className="h-full aspect-square bg-red-500/50 border-2 border-red-500 flex flex-col items-center justify-center text-[10px] text-white p-2 text-center">
                                                <span>No Sprite</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Controls Sidebar */}
                    <div className="flex-1 w-full md:w-[360px] bg-gray-800 flex flex-col shrink-0 min-h-0 overflow-hidden">
                        {/* Frame selector */}
                        <div className="p-3 bg-gray-900 border-b border-gray-700 flex flex-col gap-2 shrink-0">
                            <div className="flex justify-between items-center text-sm font-bold text-gray-300">
                                <span>Frames ({frames.length})</span>
                                <button
                                    onClick={addFrame}
                                    className="bg-green-600/80 hover:bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                >
                                    <Plus size={14} /> Add
                                </button>
                            </div>
                            
                            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 pt-1">
                                {frames.map((f, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setIsPlaying(false);
                                            setSelectedFrameIndex(idx);
                                        }}
                                        className={`shrink-0 w-12 h-12 flex flex-col items-center justify-center rounded border ${
                                            idx === selectedFrameIndex 
                                                ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                                                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'
                                        }`}
                                    >
                                        <span className="text-xs font-bold">{idx}</span>
                                        <span className="text-[10px] opacity-70">{f.duration}ms</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Playback controls */}
                        <div className="bg-gray-900/80 p-3 border-b border-gray-700 flex items-center gap-3 shrink-0">
                            <button 
                                onClick={() => {
                                    if (!isPlaying) setPlaybackTime(0);
                                    setIsPlaying(!isPlaying);
                                }}
                                className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-lg"
                            >
                                {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            </button>
                            <div className="flex-1">
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                                    <div 
                                        className="h-full bg-blue-500 transition-all duration-75"
                                        style={{ width: `${(playbackTime / totalDuration) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="text-[10px] text-gray-400 font-mono mt-1 flex justify-between">
                                    <span>{Math.round(playbackTime)}ms</span>
                                    <span>{totalDuration}ms</span>
                                </div>
                            </div>
                        </div>

                        {/* Current Frame properties */}
                        <div className="p-4 flex-1 overflow-y-auto w-full min-h-0">
                            {selectedFrame && (
                                <div className="flex flex-col gap-6 w-full">
                                    <div className="flex justify-between items-center bg-gray-900/50 p-2 rounded">
                                        <span className="font-bold text-yellow-400">Frame {selectedFrameIndex}</span>
                                        <div className="flex gap-2">
                                            <button onClick={addFrame} title="Duplicate Frame" className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-blue-400">
                                                <Copy size={16} />
                                            </button>
                                            <button 
                                                onClick={deleteFrame} 
                                                disabled={frames.length <= 1}
                                                className={`p-1.5 rounded ${frames.length <= 1 ? 'bg-gray-800 text-gray-600' : 'bg-gray-700 hover:bg-red-500/20 text-red-500'}`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-1 w-full">
                                        <label className="text-gray-400 text-xs sm:text-sm font-mono flex justify-between">
                                            <span>Duration (ms)</span>
                                            <span className="text-white font-bold">{selectedFrame.duration}ms</span>
                                        </label>
                                        <NumberInput 
                                            value={selectedFrame.duration} 
                                            onChange={(val) => updateSelectedFrame({ duration: val })}
                                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1 w-full">
                                        <label className="text-gray-400 text-xs sm:text-sm font-mono flex justify-between">
                                            <span>X Offset</span>
                                            <span className="text-white font-bold">{selectedFrame.x}px</span>
                                        </label>
                                        <InfiniteSlider 
                                            value={selectedFrame.x}
                                            onChangeDelta={(delta) => updateSelectedFrame({ x: selectedFrame.x + delta })} 
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1 w-full">
                                        <label className="text-gray-400 text-xs sm:text-sm font-mono flex justify-between">
                                            <span>Y Offset</span>
                                            <span className="text-white font-bold">{selectedFrame.y}px</span>
                                        </label>
                                        <InfiniteSlider 
                                            value={selectedFrame.y}
                                            onChangeDelta={(delta) => updateSelectedFrame({ y: selectedFrame.y + delta })} 
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1 w-full">
                                        <label className="text-gray-400 text-xs sm:text-sm font-mono flex justify-between">
                                            <span>Scale Multiplier</span>
                                            <span className="text-white font-bold">{Number(selectedFrame.scale ?? 1).toFixed(2)}x</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="0.5" 
                                            max="2.0" 
                                            step="0.01"
                                            value={selectedFrame.scale ?? 1} 
                                            onChange={(e) => updateSelectedFrame({ scale: e.target.value === '' ? undefined : Number(e.target.value) })}
                                            className="w-full accent-yellow-400"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Save */}
                        <div className="p-4 bg-gray-900 border-t border-gray-700 shrink-0">
                            <button onClick={handleSave} className="w-full bg-blue-600 text-white px-4 py-3 rounded font-bold hover:bg-blue-500 shadow-lg text-lg border border-blue-400 uppercase tracking-widest">{uiStrings?.save_changes || "SAVE CHANGES"}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const NumberInput = ({ value, onChange, className }: { value: number, onChange: (v: number) => void, className?: string }) => {
    const [local, setLocal] = useState(value.toString());
    
    useEffect(() => {
        if (Number(local) !== value && local !== '' && local !== '-') {
            setLocal(value.toString());
        }
    }, [value]);

    return (
        <input 
            type="number"
            value={local}
            onChange={(e) => {
                setLocal(e.target.value);
                const n = e.target.value === '' ? undefined : Number(e.target.value);
                if (n !== undefined && !isNaN(n) && e.target.value !== '') {
                    onChange(n);
                }
            }}
            onBlur={() => {
                if (local === '' || local === '-') {
                    onChange(0);
                    setLocal('0');
                }
            }}
            className={className}
        />
    );
};

const InfiniteSlider = ({ value, onChangeDelta }: { value: number, onChangeDelta: (delta: number) => void }) => {
    const [sliderVal, setSliderVal] = useState(0);
    const draggingRef = useRef(false);

    const handlePointerDown = () => {
        draggingRef.current = true;
    };

    const handlePointerUp = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setSliderVal(0);
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
            <NumberInput 
                value={value}
                onChange={(newVal) => onChangeDelta(newVal - value)}
                className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center text-white font-mono"
            />
        </div>
    );
};
