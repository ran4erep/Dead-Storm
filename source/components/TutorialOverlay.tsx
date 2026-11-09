import React, { useMemo, useState, useEffect } from 'react';
import { TutorialHighlightElement } from '../types';
import { renderGamepadIconOrLabel } from './SettingsModal';
import { ASSETS } from '../assets';
import animationsData from '../data/animations.json';

interface TutorialOverlayProps {
    tutorial: { 
        textId?: string; 
        text?: string; 
        highlightElement?: TutorialHighlightElement;
        pages?: Array<{ textId?: string; text?: string; highlightElement?: TutorialHighlightElement; assetId?: string; assetType?: string }>;
        assetId?: string;
        assetType?: string;
    };
    onClose: () => void;
    strings: any;
    localize: (text: string) => string;
}

const TutorialAssetComponent: React.FC<{ assetId: string }> = ({ assetId }) => {
    const isAnimation = assetId in animationsData;
    const [frameIndex, setFrameIndex] = useState(0);

    const animation = isAnimation ? (animationsData as any)[assetId] : null;

    useEffect(() => {
        if (!isAnimation || !animation || !animation.frames || animation.frames.length <= 1) {
            setFrameIndex(0);
            return;
        }
        
        const fps = animation.fps || 10;
        const interval = setInterval(() => {
            setFrameIndex(prev => (prev + 1) % animation.frames.length);
        }, 1000 / fps);

        return () => clearInterval(interval);
    }, [animation, isAnimation]);

    let src = '';
    if (isAnimation && animation?.frames) {
        const currentFrame = animation.frames[frameIndex];
        src = (ASSETS.SPRITES as any)[currentFrame] || (ASSETS.TEXTURES as any)[currentFrame] || '';
    } else {
        src = (ASSETS.SPRITES as any)[assetId] || (ASSETS.TEXTURES as any)[assetId] || '';
    }

    if (src && src.startsWith('local://')) {
        src = localStorage.getItem(src.substring(8)) || src;
    }

    if (!src) return null;

    return (
        <div className="float-left mr-4 mb-2 flex items-center justify-center w-24 h-24 overflow-hidden select-none">
            <img 
                src={src} 
                className="w-full h-full object-contain" 
                style={{ imageRendering: 'pixelated' }} 
                alt={assetId} 
            />
        </div>
    );
};

const KeyIcon: React.FC<{ children: React.ReactNode }> = React.memo(({ children }) => (
    <kbd className="mx-1 inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 py-0.5 text-sm font-bold text-gray-800 bg-gray-200 border-2 border-b-4 border-gray-400 rounded cursor-default select-none align-middle shadow-sm leading-none">
        {children}
    </kbd>
));

const GamepadIconWrapper: React.FC<{ children: React.ReactNode }> = React.memo(({ children }) => (
    <span className="mx-1 inline-flex items-center justify-center align-middle select-none scale-90 max-h-[22px]">
        {children}
    </span>
));

const normalizeGamepadKey = (rawKey: string): string => {
    const key = rawKey.toUpperCase().replace(/[-_ ]/g, '');
    
    const map: Record<string, string> = {
        'A': 'btn_0',
        'B': 'btn_1',
        'X': 'btn_2',
        'Y': 'btn_3',
        'LB': 'btn_4',
        'L1': 'btn_4',
        'RB': 'btn_5',
        'R1': 'btn_5',
        'LT': 'btn_6',
        'L2': 'btn_6',
        'RT': 'btn_7',
        'R2': 'btn_7',
        'SELECT': 'btn_8',
        'VIEW': 'btn_8',
        'SHARE': 'btn_8',
        'BACK': 'btn_8',
        'START': 'btn_9',
        'MENU': 'btn_9',
        'OPTIONS': 'btn_9',
        'LS': 'btn_10',
        'LSCLICK': 'btn_10',
        'L3': 'btn_10',
        'RS': 'btn_11',
        'RSCLICK': 'btn_11',
        'R3': 'btn_11',
        
        'DPADUP': 'btn_12',
        'DPAD_UP': 'btn_12',
        'DpadUp': 'btn_12',
        'DPADDOWN': 'btn_13',
        'DPAD_DOWN': 'btn_13',
        'DpadDown': 'btn_13',
        'DPADLEFT': 'btn_14',
        'DPAD_LEFT': 'btn_14',
        'DpadLeft': 'btn_14',
        'DPADRIGHT': 'btn_15',
        'DPAD_RIGHT': 'btn_15',
        'DpadRight': 'btn_15',
        
        'LSLEFT': 'axis_0_neg',
        'LSRIGHT': 'axis_0_pos',
        'LSUP': 'axis_1_neg',
        'LSDOWN': 'axis_1_pos',
        'RSLEFT': 'axis_2_neg',
        'RSRIGHT': 'axis_2_pos',
        'RSUP': 'axis_3_neg',
        'RSDOWN': 'axis_3_pos',
    };
    
    return map[key] || rawKey;
};

export const TutorialOverlay: React.FC<TutorialOverlayProps> = React.memo(({ tutorial, onClose, strings, localize }) => {
    const [currentPageIndex, setCurrentPageIndex] = useState(0);

    // Compute the pages of the tutorial
    const pages = useMemo(() => {
        if (tutorial.pages && tutorial.pages.length > 0) {
            return tutorial.pages;
        }

        // Support delimiter splitting fallback (e.g. ---)
        const rawText = tutorial.textId 
            ? (strings.tutorials?.[tutorial.textId] || tutorial.textId) 
            : (tutorial.text || '');

        const rawPagesText = rawText.split(/\s*---\s*/);
        if (rawPagesText.length > 1) {
            return rawPagesText.map((pText) => ({
                text: pText,
                highlightElement: tutorial.highlightElement,
                assetId: tutorial.assetId,
                assetType: tutorial.assetType
            }));
        }

        return [{
            textId: tutorial.textId,
            text: tutorial.text,
            highlightElement: tutorial.highlightElement,
            assetId: tutorial.assetId,
            assetType: tutorial.assetType
        }];
    }, [tutorial, strings]);

    const currentPage = pages[currentPageIndex] || pages[0] || { text: '' };
    
    // Parse '{W}' into key icons, and '[A]' into gamepad button icons
    const renderText = (rawText: string) => {
        const parts = rawText.split(/({[^}]+}|\[[^\]]+\])/g);
        return parts.map((part, index) => {
            if (part.startsWith('{') && part.endsWith('}')) {
                const key = part.slice(1, -1);
                return <KeyIcon key={index}>{key}</KeyIcon>;
            }
            if (part.startsWith('[') && part.endsWith(']')) {
                const rawKey = part.slice(1, -1);
                const normalized = normalizeGamepadKey(rawKey);
                return (
                    <GamepadIconWrapper key={index}>
                        {renderGamepadIconOrLabel(normalized)}
                    </GamepadIconWrapper>
                );
            }
            return <React.Fragment key={index}>{part}</React.Fragment>;
        });
    };

    const text = currentPage.textId 
        ? localize(strings.tutorials?.[currentPage.textId] || currentPage.textId) 
        : localize(currentPage.text || '');

    const handleNext = () => {
        if (currentPageIndex < pages.length - 1) {
            setCurrentPageIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentPageIndex > 0) {
            setCurrentPageIndex(prev => prev - 1);
        }
    };

    const currentHighlightElement = currentPage.highlightElement || "NONE";

    return (
        <div className="absolute inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm touch-none">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-2xl relative w-full max-w-md animate-in fade-in zoom-in-95 duration-200" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                <div className="mb-4 mt-2">
                    <div className="text-gray-100 text-lg md:text-xl font-['Jura'] leading-relaxed whitespace-pre-wrap tracking-wide overflow-visible break-words">
                        {currentPage.assetId && <TutorialAssetComponent assetId={currentPage.assetId} />}
                        {renderText(text)}
                        <div className="clear-both" />
                    </div>
                </div>
                
                <div className="flex justify-between items-center mt-8 gap-4">
                    {currentPageIndex > 0 ? (
                        <button 
                            onClick={handlePrev}
                            className="px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-md border border-gray-700 transition-colors uppercase tracking-widest text-xs"
                        >
                            {localize(strings.ui?.modal?.back || "Назад")}
                        </button>
                    ) : (
                        <div className="w-[80px]" />
                    )}

                    {pages.length > 1 && (
                        <div className="flex gap-1.5 justify-center items-center">
                            {pages.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`w-2 h-2 rounded-full transition-all duration-200 ${i === currentPageIndex ? 'bg-cyan-500 scale-125' : 'bg-gray-700'}`}
                                />
                            ))}
                        </div>
                    )}

                    {currentPageIndex < pages.length - 1 ? (
                        <button 
                            onClick={handleNext}
                            className="px-6 py-2 bg-cyan-800 hover:bg-cyan-700 text-white font-bold rounded shadow-md border border-cyan-600 transition-colors uppercase tracking-widest text-sm"
                        >
                            {localize(strings.ui?.modal?.next || "Далее")}
                        </button>
                    ) : (
                        <button 
                            onClick={onClose}
                            className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded shadow-md border border-gray-600 transition-colors uppercase tracking-widest text-sm"
                        >
                            {localize(strings.ui?.modal?.close || "Закрыть")}
                        </button>
                    )}
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                .tutorial-highlight[data-tutorial-target="${currentHighlightElement}"] {
                    z-index: 310 !important;
                    position: relative !important;
                    pointer-events: none !important;
                }
                .tutorial-highlight[data-tutorial-target="${currentHighlightElement}"]::after {
                    content: '';
                    position: absolute !important;
                    inset: -4px !important;
                    border: 2px solid #3b82f6 !important;
                    border-radius: inherit;
                    pointer-events: none !important;
                    animation: flash 1s ease-in-out infinite !important;
                    z-index: 311 !important;
                }
                .tutorial-highlight[data-tutorial-target="TOUCH_CONTROLS"]::after {
                    inset: 2px !important;
                }
            `}} />
        </div>
    );
});
