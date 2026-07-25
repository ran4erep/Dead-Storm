import React, { useState, useRef, useEffect } from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';

interface CustomColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    label?: string;
    className?: string;
    supportAlpha?: boolean;
}

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({ color, onChange, label, className = '', supportAlpha = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleOutsideClick);
        }

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [isOpen]);

    let displayColor = color || '#000000';
    if (!displayColor.startsWith('#')) {
        // Fallback for unexpected colors
        displayColor = '#ffffff';
    }

    return (
        <div className={`relative ${className}`}>
            {label && <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{label}</label>}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-10 h-10 rounded border border-gray-600 cursor-pointer shadow-sm relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    style={{ backgroundColor: displayColor }}
                    aria-label="Choose color"
                >
                    <div className="absolute inset-0 bg-black/10 opacity-0 hover:opacity-100 transition-opacity"></div>
                </button>
                <div className="flex-1 bg-gray-900 border border-gray-700 rounded flex items-center h-10 px-3">
                    <span className="text-gray-500 mr-1 text-sm font-mono leading-none">#</span>
                    <input
                        type="text"
                        value={displayColor.replace('#', '')}
                        onChange={(e) => {
                            let newColor = e.target.value;
                            if (newColor.length <= (supportAlpha ? 8 : 6)) {
                                onChange('#' + newColor);
                            }
                        }}
                        onBlur={(e) => {
                           let val = e.target.value;
                           if (val.length === 3 && !supportAlpha) {
                               val = val.split('').map(c => c + c).join('');
                               onChange('#' + val);
                           } else if (val.length === 4 && supportAlpha) {
                               val = val.split('').map(c => c + c).join('');
                               onChange('#' + val);
                           }
                        }}
                        className="w-full bg-transparent border-0 outline-none text-white font-mono text-sm uppercase tracking-wider"
                        placeholder={supportAlpha ? "FFFFFFFF" : "FFFFFF"}
                        maxLength={supportAlpha ? 8 : 6}
                    />
                </div>
            </div>

            {isOpen && (
                <div 
                    ref={popoverRef} 
                    className="absolute z-50 mt-2 p-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl shadow-black/50"
                    style={{ left: 0 }}
                >
                    {supportAlpha ? (
                        <HexAlphaColorPicker color={displayColor} onChange={onChange} />
                    ) : (
                        <HexColorPicker color={displayColor.substring(0, 7)} onChange={onChange} />
                    )}
                    <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
                        <span>Current Selection</span>
                        <div className="w-4 h-4 rounded-full border border-gray-600" style={{ backgroundColor: displayColor }}></div>
                    </div>
                </div>
            )}
        </div>
    );
};
