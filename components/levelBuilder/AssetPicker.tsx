import React, { useState, useEffect } from 'react';
import { ASSETS } from '../../assets';
import animationsData from '../../data/animations.json';

interface AssetPickerProps {
    targetName: string;
    onSelect: (assetId: string) => void;
    onCancel: () => void;
    uiStrings: any;
}

const AnimatedPreview: React.FC<{ animationId: string }> = ({ animationId }) => {
    const animation = (animationsData as any)[animationId];
    const [frameIndex, setFrameIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        if (!isHovered || !animation || !animation.frames || animation.frames.length <= 1) {
            setFrameIndex(0);
            return;
        }
        
        const fps = animation.fps || 10;
        const interval = setInterval(() => {
            setFrameIndex(prev => (prev + 1) % animation.frames.length);
        }, 1000 / fps);

        return () => clearInterval(interval);
    }, [animation, isHovered]);

    const currentFrame = animation?.frames?.[frameIndex];
    let previewSrc = (ASSETS.SPRITES as any)[currentFrame] || (ASSETS.TEXTURES as any)[currentFrame] || '';
    if (previewSrc && previewSrc.startsWith('local://')) {
        previewSrc = localStorage.getItem(previewSrc.substring(8)) || previewSrc;
    }

    if (!previewSrc) {
        return <div className="w-full h-full flex items-center justify-center text-[10px] break-words text-center text-gray-500 p-1">{animationId}</div>;
    }

    return (
        <div 
            className="w-full h-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <img src={previewSrc} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} alt={animationId} />
        </div>
    );
};

export const AssetPicker: React.FC<AssetPickerProps> = ({ targetName, onSelect, onCancel, uiStrings }) => {
    const [tab, setTab] = useState<'textures' | 'sprites' | 'animations'>('textures');

    const renderGrid = (items: string[], sourceMap?: any, isAnimation?: boolean) => (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 overflow-y-auto p-1" style={{ maxHeight: '60vh' }}>
            <button
                onClick={() => onSelect('')}
                className="aspect-square bg-gray-900 border border-gray-700 hover:border-red-500 flex items-center justify-center text-xs text-gray-500 rounded"
            >
                {uiStrings.none || 'NONE'}
            </button>
            {items.map(t => {
                let previewSrc = '';
                if (!isAnimation && sourceMap && sourceMap[t]) {
                    previewSrc = sourceMap[t];
                    if (previewSrc && previewSrc.startsWith('local://')) {
                        previewSrc = localStorage.getItem(previewSrc.substring(8)) || previewSrc;
                    }
                }

                return (
                    <button
                        key={t}
                        onClick={() => onSelect(t)}
                        className="aspect-square bg-gray-900 hover:ring-2 ring-indigo-500 rounded overflow-hidden relative group"
                        title={t}
                    >
                        {isAnimation ? (
                            <AnimatedPreview animationId={t} />
                        ) : previewSrc ? (
                            <img src={previewSrc} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} alt={t} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] break-words text-center text-gray-500 p-1">{t}</div>
                        )}
                        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white p-1 transition-opacity text-center pointer-events-none break-all z-10">
                            {t}
                        </div>
                    </button>
                );
            })}
        </div>
    );

    return (
        <div className="flex flex-col h-full w-full">
            <h3 className="text-lg mb-4 flex items-center justify-between sticky top-0 bg-gray-800 z-10 py-2 pb-4">
                <div className="flex flex-col">
                    <span>{uiStrings.select_asset || 'Select asset for'} <span className="text-indigo-400 font-bold">{targetName}</span></span>
                </div>
                <button onClick={onCancel} className="text-sm bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 transition-colors uppercase font-bold tracking-wider">{uiStrings.back || 'Back'}</button>
            </h3>

            <div className="flex gap-2 mb-4">
                <button 
                    onClick={() => setTab('textures')} 
                    className={`flex-1 py-2 rounded text-sm tracking-wider uppercase font-bold transition-colors ${tab === 'textures' ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}
                >
                    {uiStrings.textures || 'Textures'}
                </button>
                <button 
                    onClick={() => setTab('sprites')} 
                    className={`flex-1 py-2 rounded text-sm tracking-wider uppercase font-bold transition-colors ${tab === 'sprites' ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}
                >
                    {uiStrings.other_graphics || 'Other Graphics'}
                </button>
                <button 
                    onClick={() => setTab('animations')} 
                    className={`flex-1 py-2 rounded text-sm tracking-wider uppercase font-bold transition-colors ${tab === 'animations' ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}
                >
                    {uiStrings.animations || 'Animations'}
                </button>
            </div>

            <div className="flex-1 min-h-0 bg-gray-900/30 p-2 rounded border border-gray-800">
                {tab === 'textures' && renderGrid(Object.keys(ASSETS.TEXTURES).filter(k => String((ASSETS.TEXTURES as any)[k]).toLowerCase().endsWith('.png') || String((ASSETS.TEXTURES as any)[k]).startsWith('data:image') || String((ASSETS.TEXTURES as any)[k]).startsWith('local://')), ASSETS.TEXTURES)}
                {tab === 'sprites' && renderGrid(Object.keys(ASSETS.SPRITES).filter(k => String((ASSETS.SPRITES as any)[k]).toLowerCase().endsWith('.png') || String((ASSETS.SPRITES as any)[k]).startsWith('data:image') || String((ASSETS.SPRITES as any)[k]).startsWith('local://')), ASSETS.SPRITES)}
                {tab === 'animations' && renderGrid(Object.keys(animationsData), null, true)}
            </div>
        </div>
    );
};
