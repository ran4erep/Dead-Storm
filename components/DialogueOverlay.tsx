
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DialogueNode, VoiceConfig, AnimationConfig } from '../types';
import { ChevronRight, SlidersHorizontal, Play, X } from 'lucide-react';
import { speakCharacter, DebugPhonemeParams, PHONEME_MAP, initVoice } from '../utils/voiceSynth';
import { getCurrentAnimationFrame } from '../utils/animationUtils';
import TradeModal from './TradeModal';
import KeepModal from './KeepModal';
import { useViewportScale } from '../hooks/useViewportScale';

// Helper: Split text into lines based on approximate character width
// Removed unused MAX_LINES constant

interface DialogueOverlayProps {
    npcId?: string | null;
    npcName: string;
    npcAssetId: string; // The asset ID for the NPC portrait
    playerPortraitId: string; // The asset ID for the Player portrait
    node: DialogueNode;
    selectedOptionIndex: number;
    spriteMap: Map<string, HTMLImageElement>;
    localize: (text: string) => string;
    getDisplayText: (text: string) => string;
    lastNpcText: string;
    playerName: string;
    voiceConfig?: VoiceConfig; 
    animations?: AnimationConfig;
    voiceDebugEnabled?: boolean; // NEW: Controls visibility of debug tuner
    inventoryStats?: { currentLoad: number; maxCapacity: number };
    player: any;
    setPlayer: React.Dispatch<React.SetStateAction<any>>;
    addLog: (text: string, type?: any) => void;
    playSound?: (sound: string) => void;
    isRadioDialogue?: boolean;
    handleDirectChoice?: (index: number) => void;
    levelData?: any | null;
    npcInstanceId?: string | null;
    checkTriggers?: ((type: string, params: any) => void) | null;
}

const DialogueOverlay: React.FC<DialogueOverlayProps> = ({
    npcId,
    npcName,
    npcAssetId,
    playerPortraitId,
    node,
    selectedOptionIndex,
    spriteMap,
    localize,
    getDisplayText,
    lastNpcText,
    playerName,
    voiceConfig,
    animations,
    voiceDebugEnabled = false,
    inventoryStats,
    player,
    setPlayer,
    addLog,
    playSound,
    isRadioDialogue,
    handleDirectChoice,
    levelData,
    npcInstanceId,
    checkTriggers
}) => {
    const lastNonTutorialNodeRef = useRef<DialogueNode | null>(null);
    if (node && node.speaker !== 'TUTORIAL') {
        lastNonTutorialNodeRef.current = node;
    }
    const effectiveNode = (node?.speaker === 'TUTORIAL' && lastNonTutorialNodeRef.current) 
        ? lastNonTutorialNodeRef.current 
        : node;

    if (!effectiveNode || effectiveNode.speaker === 'TUTORIAL') return null;

    const isNpcHidden = effectiveNode.speaker === 'NPC' && !!effectiveNode.hiddenSpeaker;
    const isPlayerHidden = effectiveNode.speaker === 'PLAYER' && !!effectiveNode.hiddenSpeaker;

    const activeNpcName = isNpcHidden ? "???" : (effectiveNode.speaker === 'NPC' ? (effectiveNode.overrideName ? localize(effectiveNode.overrideName) : npcName) : npcName);
    const activeNpcAssetId = effectiveNode.speaker === 'NPC' ? (effectiveNode.overridePortrait || npcAssetId) : npcAssetId;
    const activePlayerName = isPlayerHidden ? "???" : (effectiveNode.speaker === 'PLAYER' ? (effectiveNode.overrideName ? localize(effectiveNode.overrideName) : playerName) : playerName);
    const activePlayerPortraitId = effectiveNode.speaker === 'PLAYER' ? (effectiveNode.overridePortrait || playerPortraitId) : playerPortraitId;

    const [showDebug, setShowDebug] = useState(false);
    
    // Animation Refs (Replaces State)
    const npcImgRef = useRef<HTMLImageElement>(null);
    const playerImgRef = useRef<HTMLImageElement>(null);
    const animationRequestRef = useRef<number | undefined>(undefined);
    const isSpeakingRef = useRef(false);

    const isAtDistance = useMemo(() => {
        if (!levelData || !player || !npcInstanceId) return false;
        for (let y = 0; y < levelData.grid.length; y++) {
            const row = levelData.grid[y];
            if (!row) continue;
            for (let x = 0; x < row.length; x++) {
                const tile = row[x];
                if (tile && tile.enemyId === npcInstanceId) {
                    const dx = Math.abs(x - player.pos.x);
                    const dy = Math.abs(y - player.pos.y);
                    // Standard Manhattan distance. If distance > 1, then we are at a distance.
                    return (dx + dy) > 1.1;
                }
            }
        }
        return false;
    }, [levelData, player, npcInstanceId]);

    // Options Scroll State
    const [viewStart, setViewStart] = useState(0);
    const MAX_VISIBLE_OPTIONS = 3;

    // Text Scroll Refs
    const npcTextContainerRef = useRef<HTMLDivElement>(null);
    const npcBoxRef = useRef<HTMLDivElement>(null);
    const playerTextContainerRef = useRef<HTMLDivElement>(null);
    const npcTextRef = useRef<HTMLParagraphElement>(null);
    const playerTextRef = useRef<HTMLParagraphElement>(null);

    // Test Phrase (Debug)
    const [testPhrase, setTestPhrase] = useState("");
    const [voiceParams, setVoiceParams] = useState<VoiceConfig>({ pitch: 1.0, rate: 1.0, volume: 1.0, resonance: 1.0, waveform: 'sawtooth' });
    const [typingDelay, setTypingDelay] = useState(35);
    const [editingChar, setEditingChar] = useState("с");
    const [debugParams, setDebugParams] = useState<DebugPhonemeParams>({ type: 'sibilant', filterType: 'highpass', frequency: 5000, f1: 0, f2: 0, q: 0.5, attack: 0.1, duration: 0.15, volMod: 0.08 });
    const timeoutsRef = useRef<number[]>([]);

    const [isLastPage, setIsLastPage] = useState(true);
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [showKeepModal, setShowKeepModal] = useState(false);
    const [npcBoxHeight, setNpcBoxHeight] = useState(92); // Default approximate height
    const hasOptions = effectiveNode.options && effectiveNode.options.length > 0 && isLastPage;
    const scale = useViewportScale();

    const isTradeOrKeep = showTradeModal || showKeepModal;
    const isNpcActive = isTradeOrKeep || isRadioDialogue || effectiveNode.speaker === 'NPC';
    const isPlayerActive = !isTradeOrKeep && effectiveNode.speaker === 'PLAYER';

    useEffect(() => {
        if (effectiveNode.action === 'trade') {
            setShowTradeModal(true);
            setShowKeepModal(false);
        } else if (effectiveNode.action === 'keep') {
            setShowKeepModal(true);
            setShowTradeModal(false);
        } else {
            setShowTradeModal(false);
            setShowKeepModal(false);
        }
    }, [effectiveNode]);

    // SYNC SCROLL LOGIC (Derived State Pattern)
    // We calculate the correct viewStart immediately based on props to ensure
    // the render frame is always consistent with the selection, preventing 1-frame lag/flicker.
    let displayViewStart = viewStart;

    if (!hasOptions) {
        displayViewStart = 0;
    } else {
        // If selection is above window
        if (selectedOptionIndex < displayViewStart) {
            displayViewStart = selectedOptionIndex;
        } 
        // If selection is below window
        else if (selectedOptionIndex >= displayViewStart + MAX_VISIBLE_OPTIONS) {
            displayViewStart = selectedOptionIndex - MAX_VISIBLE_OPTIONS + 1;
        }
    }

    // If our derived calculation differs from stored state, update state to persist it.
    // Calling setState during render allows React to restart the render immediately with the new value,
    // ensuring the UI is consistent before paint.
    if (displayViewStart !== viewStart) {
        setViewStart(displayViewStart);
    }

    const visibleOptions = hasOptions 
        ? effectiveNode.options!.slice(displayViewStart, displayViewStart + MAX_VISIBLE_OPTIONS) 
        : [];

    const totalOptions = effectiveNode.options?.length || 0;
    const showScrollbar = totalOptions > MAX_VISIBLE_OPTIONS;
    
    // Calculate scrollbar thumb metrics based on calculated displayViewStart
    const thumbHeightPct = Math.max(15, (MAX_VISIBLE_OPTIONS / totalOptions) * 100);
    const trackSpace = 100 - thumbHeightPct;
    const scrollPct = totalOptions > MAX_VISIBLE_OPTIONS 
        ? displayViewStart / (totalOptions - MAX_VISIBLE_OPTIONS) 
        : 0;
    const thumbTopPct = scrollPct * trackSpace;

    // Use custom hook for text scrolling
    const activeText = effectiveNode.speaker === 'NPC' ? "" : getDisplayText(localize(lastNpcText));

    useLayoutEffect(() => {
        if (npcBoxRef.current) {
            const rect = npcBoxRef.current.getBoundingClientRect();
            setNpcBoxHeight(rect.bottom);
        }
        if (npcTextContainerRef.current) {
            npcTextContainerRef.current.scrollTop = npcTextContainerRef.current.scrollHeight;
        }
        if (playerTextContainerRef.current) {
            playerTextContainerRef.current.scrollTop = playerTextContainerRef.current.scrollHeight;
        }
    }, [effectiveNode, activeText, showTradeModal, showKeepModal]);

    // Listen to CustomEvent for text updates
    useEffect(() => {
        const handleUpdate = (e: Event) => {
            const customEvent = e as CustomEvent<{ text: string, isSpeaking: boolean, isLastPage?: boolean }>;
            const { text, isSpeaking, isLastPage: isLast } = customEvent.detail;
            isSpeakingRef.current = isSpeaking;
            if (isLast !== undefined) setIsLastPage(isLast);

            if (effectiveNode.speaker === 'NPC' && npcTextRef.current) {
                npcTextRef.current.innerText = text;
                if (npcTextContainerRef.current) {
                    npcTextContainerRef.current.scrollTop = npcTextContainerRef.current.scrollHeight;
                }
            } else if (effectiveNode.speaker === 'PLAYER' && playerTextRef.current) {
                playerTextRef.current.innerText = text;
                if (playerTextContainerRef.current) {
                    playerTextContainerRef.current.scrollTop = playerTextContainerRef.current.scrollHeight;
                }
            }
        };
        window.addEventListener('dialogue-update', handleUpdate);
        return () => window.removeEventListener('dialogue-update', handleUpdate);
    }, [effectiveNode.speaker]);

    // Determine Player Animation ID based on portrait ID
    const getPlayerAnimId = (portraitId: string) => {
        if (effectiveNode.speaker === 'PLAYER' && effectiveNode.overridePortrait) {
            return effectiveNode.overridePortrait;
        }
        if (player?.portraits?.[player.characterId]?.talk) {
            return player.portraits[player.characterId].talk;
        }
        // Check FEMALE first because "FEMALE" contains the substring "MALE"
        if (portraitId.includes('FEMALE')) return 'ANIM_LILITH_TALKING';
        if (portraitId.includes('MALE')) return 'ANIM_JOHN_TALKING';
        return portraitId; // Fallback
    };

    const playerAnimId = getPlayerAnimId(activePlayerPortraitId);

    // Cleanup
    useEffect(() => {
        return () => {
            timeoutsRef.current.forEach(window.clearTimeout);
            if (animationRequestRef.current) cancelAnimationFrame(animationRequestRef.current);
        };
    }, []);

    // ANIMATION LOOP (Handles both NPC and Player)
    useEffect(() => {
        const animate = () => {
            const now = performance.now();

            // --- NPC ANIMATION ---
            if (animations && animations[activeNpcAssetId]) {
                const animDef = animations[activeNpcAssetId];
                if (isSpeakingRef.current && effectiveNode.speaker === 'NPC') {
                    const frameId = getCurrentAnimationFrame(activeNpcAssetId, animations, now, 0, 12345);
                    const img = spriteMap.get(frameId);
                    if (img && npcImgRef.current && npcImgRef.current.src !== img.src) {
                        npcImgRef.current.src = img.src;
                    }
                } else {
                    // Static
                    const firstFrameId = animDef.frames?.[0] || activeNpcAssetId;
                    const img = spriteMap.get(firstFrameId);
                    if (img && npcImgRef.current && npcImgRef.current.src !== img.src) {
                        npcImgRef.current.src = img.src;
                    }
                }
            } else {
                const img = spriteMap.get(activeNpcAssetId) || spriteMap.get(`${activeNpcAssetId}_PORTRAIT`);
                if (img && npcImgRef.current && npcImgRef.current.src !== img.src) {
                    npcImgRef.current.src = img.src;
                }
            }

            // --- PLAYER ANIMATION ---
            if (animations && animations[playerAnimId]) {
                const animDef = animations[playerAnimId];
                if (isSpeakingRef.current && effectiveNode.speaker === 'PLAYER') {
                    const frameId = getCurrentAnimationFrame(playerAnimId, animations, now, 0, 54321);
                    const img = spriteMap.get(frameId);
                    if (img && playerImgRef.current && playerImgRef.current.src !== img.src) {
                        playerImgRef.current.src = img.src;
                    }
                } else {
                    // Static
                    const staticFrameId = (effectiveNode.speaker === 'PLAYER' && effectiveNode.overridePortrait)
                        ? (animDef.frames?.[0] || activePlayerPortraitId)
                        : (player?.portraits?.[player.characterId]?.static || animDef.frames?.[0] || activePlayerPortraitId);
                    const img = spriteMap.get(staticFrameId);
                    if (img && playerImgRef.current && playerImgRef.current.src !== img.src) {
                        playerImgRef.current.src = img.src;
                    }
                }
            } else {
                const staticFrameId = (effectiveNode.speaker === 'PLAYER' && effectiveNode.overridePortrait)
                    ? activePlayerPortraitId
                    : (player?.portraits?.[player.characterId]?.static || activePlayerPortraitId);
                const img = spriteMap.get(staticFrameId);
                if (img && playerImgRef.current && playerImgRef.current.src !== img.src) {
                    playerImgRef.current.src = img.src;
                }
            }

            animationRequestRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRequestRef.current) cancelAnimationFrame(animationRequestRef.current);
        };
    }, [activeNpcAssetId, playerAnimId, animations, spriteMap, effectiveNode.speaker, activePlayerPortraitId]);

    // Debug Init
    useEffect(() => {
        const defaults = { pitch: 1.0, rate: 1.0, volume: 1.0, resonance: 1.0, waveform: 'sawtooth' as const };
        const config = voiceConfig || defaults;
        setVoiceParams({
            pitch: config.pitch ?? defaults.pitch,
            rate: config.rate ?? defaults.rate,
            volume: config.volume ?? defaults.volume,
            resonance: config.resonance ?? defaults.resonance,
            waveform: config.waveform ?? defaults.waveform
        });
        const rate = config.rate ?? 1.0;
        setTypingDelay(Math.round(35 / rate));
    }, [voiceConfig, activeNpcName]);

    useEffect(() => {
        if (!editingChar) return;
        const charKey = editingChar.toLowerCase();
        let config = PHONEME_MAP[charKey];
        if (!config && PHONEME_MAP['default']) config = JSON.parse(JSON.stringify(PHONEME_MAP['default']));
        if (config) {
            setDebugParams({
                type: config.type,
                filterType: config.filterType || 'bandpass',
                frequency: config.noiseFreq || 3000,
                f1: config.f1 || 0,
                f2: config.f2 || 0,
                q: (config.type === 'sibilant' && config.filterType === 'highpass') ? 0.5 : 2.5,
                attack: config.attack || (config.type === 'vowel' ? 0.02 : 0.03),
                duration: config.duration || (config.type === 'vowel' ? 0.09 : 0.08),
                volMod: config.type === 'vowel' ? 0.7 : 0.08 
            });
        }
    }, [editingChar]);

    const handlePhonemeParamChange = useCallback((key: keyof DebugPhonemeParams, value: number | string) => {
        setDebugParams(prev => ({ ...prev, [key]: value }));
        if (!editingChar) return;
        const charKey = editingChar.toLowerCase();
        if (!PHONEME_MAP[charKey] && PHONEME_MAP['default']) PHONEME_MAP[charKey] = JSON.parse(JSON.stringify(PHONEME_MAP['default']));
        const config = PHONEME_MAP[charKey];
        if (config) {
            if (key === 'type') config.type = value as any;
            if (key === 'filterType') config.filterType = value as any;
            if (key === 'frequency') config.noiseFreq = Number(value);
            if (key === 'f1') config.f1 = Number(value);
            if (key === 'f2') config.f2 = Number(value);
            if (key === 'attack') config.attack = Number(value);
            if (key === 'duration') config.duration = Number(value);
        }
    }, [editingChar]);

    const handleVoiceParamChange = (key: keyof VoiceConfig, value: number | string) => {
        setVoiceParams(prev => ({ ...prev, [key]: value }));
        if (key === 'rate') { const r = Number(value); if (r > 0) setTypingDelay(Math.round(35 / r)); }
    };

    const handleDelayChange = (val: number) => {
        setTypingDelay(val);
        if (val > 0) { const newRate = parseFloat((35 / val).toFixed(2)); setVoiceParams(prev => ({ ...prev, rate: newRate })); }
    };

    const handlePlay = async (e: React.MouseEvent) => {
        e.stopPropagation();
        timeoutsRef.current.forEach(window.clearTimeout); timeoutsRef.current = [];
        await initVoice();
        const textToPlay = testPhrase.length > 0 ? testPhrase : editingChar;
        if (!textToPlay) return;
        const chars = textToPlay.split('');
        const testVoice = { ...voiceParams };
        let charIndex = 0;

        // Locate the NPC's coordinates
        const npcPos = (() => {
            if (!levelData || !npcInstanceId) return null;
            for (let y = 0; y < levelData.grid.length; y++) {
                const row = levelData.grid[y];
                if (!row) continue;
                for (let x = 0; x < row.length; x++) {
                    const tile = row[x];
                    if (tile && tile.enemyId === npcInstanceId) {
                        return { x, y };
                    }
                }
            }
            return null;
        })();
        const reverbPos = npcPos || (player ? player.pos : null);

        const playNext = () => {
            if (charIndex >= chars.length) return;
            const char = chars[charIndex];
            let intonation: 'FLAT' | 'RISE' | 'FALL' = 'FLAT';
            if (chars[charIndex+1] === '?') intonation = 'RISE'; if (chars[charIndex+1] === '!') intonation = 'FALL';
            
            if (reverbPos) {
                window.dispatchEvent(new CustomEvent('update-voice-reverb-pos', {
                    detail: { x: reverbPos.x, y: reverbPos.y }
                }));
            }

            speakCharacter(char, testVoice, intonation);
            let stepDelay = typingDelay;
            if (char === ' ') stepDelay += 100; if (char === ',') stepDelay += 300; if (char === '.' || char === '?' || char === '!') stepDelay += 500;
            charIndex++;
            if (charIndex < chars.length) { const id = window.setTimeout(playNext, stepDelay); timeoutsRef.current.push(id); }
        };
        playNext();
    };

    return (
        <div className="absolute inset-0 z-[300] flex flex-col justify-between pointer-events-none font-['Jura'] px-[3px] py-[1px]">
            {/* 3D Viewport Darkening Layer when trading or keeping items */}
            {isTradeOrKeep && (
                <div className="absolute inset-0 bg-black/60 pointer-events-none z-0 transition-opacity duration-300" />
            )}
            
            {/* NPC SECTION (TOP OR BOTTOM DEPENDING ON TRADE/KEEP) */}
            <div 
                ref={npcBoxRef} 
                className={`flex gap-[3px] transition-opacity duration-300 relative z-[100] ${
                    (isTradeOrKeep || isRadioDialogue) 
                        ? 'items-start' 
                        : 'items-end mt-auto'
                } ${isNpcActive ? 'opacity-100' : 'hidden'}`}
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: (isTradeOrKeep || isRadioDialogue) ? 'top center' : 'bottom center',
                    width: `${100 / scale}%`,
                    marginLeft: 'auto',
                    marginRight: 'auto'
                }}
            >
                <div className="flex flex-col gap-0 items-start shrink-0 pointer-events-auto">
                    <div className="w-20 h-20 bg-black/90 border border-gray-600 overflow-hidden shadow-[0_4px_10px_rgba(0,0,0,0.5)] relative z-10 flex items-center justify-center">
                        {isNpcHidden ? (
                            <span className="text-gray-200 font-extrabold text-5xl font-['Jura'] select-none">?</span>
                        ) : (
                            <>
                                <img 
                                    ref={npcImgRef} 
                                    crossOrigin="anonymous" 
                                    className={`w-full h-full object-contain object-center ${isRadioDialogue ? 'grayscale contrast-125 sepia hue-rotate-[70deg]' : ''}`} 
                                    alt={activeNpcName} 
                                    style={{ imageRendering: 'pixelated' }} 
                                />
                                {isRadioDialogue && (
                                    <>
                                        <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,100,0.15)_2px,rgba(0,255,100,0.15)_4px)]" />
                                        <div className="absolute inset-0 pointer-events-none bg-green-500/10 mix-blend-color" />
                                        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_15px_rgba(0,255,50,0.3)] animate-pulse" />
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    {/* Debug Toggle - Only visible if enabled in global settings */}
                    {voiceDebugEnabled && (
                        <button onClick={(e) => { e.stopPropagation(); setShowDebug(!showDebug); }} className="mt-1 w-full bg-gray-900 border border-gray-700 p-1 flex items-center justify-center hover:bg-gray-800 active:bg-gray-700/50">
                            <SlidersHorizontal size={12} className={showDebug ? "text-cyan-400" : "text-gray-500"} />
                        </button>
                    )}
                </div>
                <div className="flex-1 p-2 h-auto flex flex-col justify-start bg-gray-900/95 border border-gray-700/80 shadow-md relative overflow-hidden">
                    {/* Name moved here: First line */}
                    <p className="text-red-400 font-bold uppercase tracking-widest text-[10px] leading-tight mb-1 shrink-0">{activeNpcName}</p>
                    
                    <div 
                        id="dialogue-text-container"
                        ref={npcTextContainerRef}
                        className="overflow-hidden flex-1"
                        style={{ fontSize: '0.875rem', lineHeight: '1.25em', maxHeight: '3.75em' }}
                    >
                        <p ref={npcTextRef} className="text-gray-200 whitespace-pre-wrap break-words" style={{ fontSize: 'inherit', lineHeight: 'inherit', margin: 0, padding: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{activeText}</p>
                    </div>

                    {showDebug && voiceDebugEnabled && createPortal(
                        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-[95%] max-w-md h-auto max-h-[80vh] overflow-y-auto bg-gray-800 border border-gray-600 p-3 z-[9999] shadow-2xl rounded-lg flex flex-col gap-2 font-['Jura'] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-1 sticky top-0 bg-gray-800 z-10">
                                <h3 className="text-white font-bold uppercase text-xs tracking-widest flex items-center gap-2"><SlidersHorizontal size={14} className="text-cyan-400"/> VOICE TUNER: {activeNpcName}</h3>
                                <button onClick={() => setShowDebug(false)} className="text-gray-400 hover:text-white p-1"><X size={16}/></button>
                            </div>
                            <div className="flex flex-col gap-2 border-b border-gray-700/50 pb-3 mb-1">
                                <label className="text-[10px] text-gray-400 uppercase font-bold">Тестовая фраза</label>
                                <div className="flex gap-2 items-center w-full">
                                    <input type="text" placeholder="Введите текст..." className="bg-gray-900/50 text-xs text-white border border-gray-600 rounded px-2 py-1.5 w-full focus:border-cyan-500 outline-none" value={testPhrase} onChange={(e) => setTestPhrase(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                                    <button onClick={handlePlay} className="bg-cyan-900/40 px-4 py-1.5 rounded border border-cyan-500/50 active:bg-cyan-800 flex items-center gap-1 shrink-0 hover:bg-cyan-900/60 transition-colors"><Play size={14} className="text-cyan-400"/> </button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 border-b border-gray-700/50 pb-3 mb-1">
                                <div className="text-[10px] text-yellow-500 font-bold uppercase mb-1 bg-yellow-900/20 px-2 py-0.5 rounded w-fit border border-yellow-900/30">Глобальные настройки (NPC)</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[10px] text-gray-400">
                                    <div className="flex flex-col"><div className="flex justify-between mb-1"><label>Тон (Pitch)</label><span className="text-white">{voiceParams.pitch}</span></div><input type="range" min="0.1" max="20.0" step="0.1" className="accent-cyan-500" value={voiceParams.pitch} onChange={(e) => handleVoiceParamChange('pitch', Number(e.target.value))} /></div>
                                    <div className="flex flex-col"><div className="flex justify-between mb-1"><label>Резонанс</label><span className="text-white">{voiceParams.resonance}</span></div><input type="range" min="0.1" max="20.0" step="0.1" className="accent-cyan-500" value={voiceParams.resonance} onChange={(e) => handleVoiceParamChange('resonance', Number(e.target.value))} /></div>
                                    <div className="flex flex-col"><div className="flex justify-between mb-1"><label>Громкость</label><span className="text-white">{voiceParams.volume}</span></div><input type="range" min="0.1" max="20.0" step="0.1" className="accent-cyan-500" value={voiceParams.volume} onChange={(e) => handleVoiceParamChange('volume', Number(e.target.value))} /></div>
                                    <div className="flex flex-col"><div className="flex justify-between mb-1"><label>Скорость</label><span className="text-white">{voiceParams.rate}</span></div><input type="range" min="0.1" max="20.0" step="0.1" className="accent-cyan-500" value={voiceParams.rate} onChange={(e) => handleVoiceParamChange('rate', Number(e.target.value))} /></div>
                                    <div className="flex flex-col col-span-2"><label className="mb-1 text-gray-500">Тип волны</label><select value={voiceParams.waveform} onChange={(e) => handleVoiceParamChange('waveform', e.target.value)} className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-500"><option value="sawtooth">Sawtooth (Грубый)</option><option value="square">Square (8-bit)</option><option value="sine">Sine (Мягкий)</option><option value="triangle">Triangle (Глухой)</option></select></div>
                                    <div className="flex flex-col col-span-2 mt-1 bg-black/20 p-2 rounded border border-gray-700/50"><div className="flex justify-between mb-1"><label>Задержка текста (ms)</label><span className="text-gray-300 font-bold font-mono">{typingDelay}ms</span></div><input type="range" min="10" max="2000" step="10" className="accent-cyan-500" value={typingDelay} onChange={(e) => handleDelayChange(Number(e.target.value))} /></div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-b border-gray-700/50 pb-3 mb-1"><div className="flex items-center gap-3"><span className="text-[10px] text-gray-300 font-bold shrink-0 uppercase bg-gray-900 px-2 py-1 rounded border border-gray-700">Редактор фонем</span><div className="flex items-center gap-2"><span className="text-[10px] text-gray-500">БУКВА:</span><input type="text" maxLength={1} className="bg-gray-900 text-sm text-cyan-400 border border-cyan-800 rounded px-2 py-1 w-10 text-center font-bold uppercase focus:ring-1 focus:ring-cyan-500 outline-none" value={editingChar} onChange={(e) => setEditingChar(e.target.value.toLowerCase())} onFocus={(e) => e.target.select()} onKeyDown={(e) => e.stopPropagation()} /></div></div></div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[10px] text-gray-400 pb-2">
                                <div className="flex flex-col col-span-2"><label className="text-gray-500 mb-1">Тип звука</label><select value={debugParams.type} onChange={(e) => handlePhonemeParamChange('type', e.target.value)} className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-500"><option value="sibilant">ШУМ (С, Ш, Ф, Х, Ц)</option><option value="vowel">ГОЛОС (А, О, У, Е)</option><option value="consonant">ЗВОНКИЕ (Б, Д, Г, Р)</option><option value="nasal">НОСОВЫЕ (М, Н)</option></select></div>
                                {debugParams.type === 'sibilant' ? (<><div className="flex flex-col"><label className="mb-1">Фильтр</label><select value={debugParams.filterType} onChange={(e) => handlePhonemeParamChange('filterType', e.target.value)} className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-500"><option value="highpass">Highpass (Резкий)</option><option value="bandpass">Bandpass (Узкий)</option><option value="lowpass">Lowpass (Глухой)</option></select></div><div className="flex flex-col"><div className="flex justify-between mb-1"><label>Частота</label><span className="text-white">{debugParams.frequency}Hz</span></div><input type="range" min="100" max="20000" step="100" className="accent-cyan-500" value={debugParams.frequency} onChange={(e) => handlePhonemeParamChange('frequency', Number(e.target.value))} /></div></>) : (<><div className="flex flex-col"><div className="flex justify-between mb-1"><label>Форманта F1</label><span className="text-white">{debugParams.f1}</span></div><input type="range" min="100" max="20000" step="10" className="accent-cyan-500" value={debugParams.f1} onChange={(e) => handlePhonemeParamChange('f1', Number(e.target.value))} /></div><div className="flex flex-col"><div className="flex justify-between mb-1"><label>Форманта F2</label><span className="text-white">{debugParams.f2}</span></div><input type="range" min="500" max="20000" step="10" className="accent-cyan-500" value={debugParams.f2} onChange={(e) => handlePhonemeParamChange('f2', Number(e.target.value))} /></div></>)}
                                <div className="flex flex-col"><div className="flex justify-between mb-1"><label>Атака (s)</label><span className="text-white">{debugParams.attack}</span></div><input type="range" min="0.01" max="3.0" step="0.01" className="accent-cyan-500" value={debugParams.attack} onChange={(e) => handlePhonemeParamChange('attack', Number(e.target.value))} /></div><div className="flex flex-col"><div className="flex justify-between mb-1"><label>Длина (s)</label><span className="text-white">{debugParams.duration}</span></div><input type="range" min="0.01" max="3.0" step="0.01" className="accent-cyan-500" value={debugParams.duration} onChange={(e) => handlePhonemeParamChange('duration', Number(e.target.value))} /></div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </div>

            {/* PLAYER SECTION (BOTTOM) */}
            <div 
                className={`flex items-end gap-[3px] mt-auto transition-opacity duration-300 relative z-[10] ${isPlayerActive ? 'opacity-100' : 'hidden'}`}
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'bottom center',
                    width: `${100 / scale}%`,
                    marginLeft: 'auto',
                    marginRight: 'auto'
                }}
            >
                
                {/* Player Text Box */}
                <div className="flex-1 p-2 h-auto flex flex-col justify-start bg-gray-900/95 border border-gray-700/80 shadow-md">
                    {/* Name moved here: First line */}
                    <p className="text-cyan-400 font-bold uppercase tracking-widest text-[10px] leading-tight mb-1 text-right shrink-0">{activePlayerName}</p>

                    {effectiveNode.speaker === 'PLAYER' ? (
                        <>
                            {/* Only show text if there are no options */}
                            {!hasOptions && (
                                <div 
                                    ref={playerTextContainerRef}
                                    className="overflow-hidden flex-1"
                                    style={{ fontSize: '0.875rem', lineHeight: '1.25em', maxHeight: '3.75em' }}
                                >
                                    <p ref={playerTextRef} className="text-cyan-300 text-right whitespace-pre-wrap break-words" style={{ fontSize: 'inherit', lineHeight: 'inherit', margin: 0, padding: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}></p>
                                </div>
                            )}
                            
                            {hasOptions && (
                                <div className="flex gap-2 w-full flex-1 relative overflow-hidden">
                                    <div className="flex-1 flex flex-col gap-0 pointer-events-auto justify-end">
                                        {visibleOptions.map((opt, i) => {
                                            const realIndex = displayViewStart + i;
                                            const isSelected = realIndex === selectedOptionIndex;
                                            return (
                                                <div 
                                                    key={realIndex} 
                                                    onClick={() => {
                                                        if (handleDirectChoice) handleDirectChoice(realIndex);
                                                    }}
                                                    className={`
                                                        flex items-center gap-1.5 py-0.5 px-1.5 rounded justify-end cursor-pointer transition-colors
                                                        ${isSelected ? 'bg-cyan-900/40 border border-cyan-600/50' : 'border border-transparent hover:bg-gray-800'}
                                                    `}
                                                >
                                                    <span className={`text-[11px] font-bold uppercase leading-none text-right transition-colors ${isSelected ? 'text-cyan-100' : 'text-gray-500 hover:text-gray-300'}`}>
                                                        {getDisplayText(localize(opt.text))}
                                                    </span>
                                                    <ChevronRight size={12} className={isSelected ? 'text-cyan-400 visible' : 'invisible'} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    {/* SCROLLBAR */}
                                    {showScrollbar && (
                                        <div className="w-1 bg-gray-800 rounded-full overflow-hidden shrink-0 self-stretch my-1">
                                            <div 
                                                className="bg-cyan-500/50 w-full rounded-full transition-all duration-200"
                                                style={{ 
                                                    height: `${thumbHeightPct}%`,
                                                    transform: `translateY(${thumbTopPct}%)`,
                                                }} 
                                            />
                                        </div>
                                    )}
                                    {/* Improved Scrollbar Positioning */}
                                    {showScrollbar && (
                                        <div className="absolute right-0 top-1 bottom-1 w-1 bg-gray-800 rounded-full overflow-hidden">
                                            <div 
                                                className="absolute w-full bg-cyan-600 rounded-full transition-all duration-300"
                                                style={{ 
                                                    height: `${thumbHeightPct}%`,
                                                    top: `${thumbTopPct}%`
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-gray-500 text-xs italic text-right">...</p>
                    )}
                </div>

                {/* Player Portrait Column */}
                <div className="flex flex-col gap-0 items-end shrink-0">
                    <div className="w-20 h-20 bg-black/90 border border-gray-600 overflow-hidden shadow-[0_4px_10px_rgba(0,0,0,0.5)] relative z-10 flex items-center justify-center">
                        {isPlayerHidden ? (
                            <span className="text-gray-200 font-extrabold text-5xl font-['Jura'] select-none">?</span>
                        ) : (
                            <img 
                                ref={playerImgRef}
                                crossOrigin="anonymous"
                                className="w-full h-full object-contain object-center" 
                                alt="Player" 
                                style={{ imageRendering: 'pixelated' }}
                            />
                        )}
                    </div>
                    {/* Name removed from here, moved to text box */}
                </div>

            </div>
            
            {showTradeModal && (
                <TradeModal 
                    onClose={() => setShowTradeModal(false)} 
                    spriteMap={spriteMap} 
                    localize={localize} 
                    npcId={npcId} 
                    inventoryStats={inventoryStats} 
                    player={player}
                    setPlayer={setPlayer}
                    addLog={addLog}
                    playSound={playSound}
                    topOffset={npcBoxHeight}
                    checkTriggers={checkTriggers}
                />
            )}

            {showKeepModal && (
                <KeepModal 
                    onClose={() => setShowKeepModal(false)} 
                    spriteMap={spriteMap} 
                    localize={localize} 
                    npcId={npcId} 
                    inventoryStats={inventoryStats} 
                    player={player}
                    setPlayer={setPlayer}
                    addLog={addLog}
                    playSound={playSound}
                    topOffset={npcBoxHeight}
                />
            )}
        </div>
    );
};

export default React.memo(DialogueOverlay);
