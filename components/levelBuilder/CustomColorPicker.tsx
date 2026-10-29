import React, { useState, useRef, useEffect } from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';

export interface CustomColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    label?: string;
    className?: string;
    supportAlpha?: boolean;
    popoverPosition?: 'top' | 'bottom';
}

const parseToHex = (str: string, supportAlpha: boolean): string => {
    if (!str) return supportAlpha ? "#ffffffff" : "#ffffff";
    const trimmed = str.trim();
    if (trimmed.startsWith("#")) {
        return trimmed;
    }
    if (trimmed.startsWith("rgba") || trimmed.startsWith("rgb")) {
        const matches = trimmed.match(/[\d.]+/g);
        if (matches && matches.length >= 3) {
            const r = Math.max(0, Math.min(255, parseInt(matches[0], 10) || 0));
            const g = Math.max(0, Math.min(255, parseInt(matches[1], 10) || 0));
            const b = Math.max(0, Math.min(255, parseInt(matches[2], 10) || 0));
            const a = matches[3] !== undefined ? Math.max(0, Math.min(1, parseFloat(matches[3]))) : 1;
            
            const toHex = (n: number) => n.toString(16).padStart(2, "0");
            if (supportAlpha) {
                const aHex = Math.round(a * 255).toString(16).padStart(2, "0");
                return `#${toHex(r)}${toHex(g)}${toHex(b)}${aHex}`;
            }
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
    }
    return supportAlpha ? "#ffffffff" : "#ffffff";
};

const hexToRgbaStr = (hex: string): string => {
    let clean = hex.replace('#', '');
    if (clean.length === 3 || clean.length === 4) {
        clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16) || 0;
    if (clean.length === 8) {
        const r = (num >> 24) & 255;
        const g = (num >> 16) & 255;
        const b = (num >> 8) & 255;
        const a = Math.round(((num & 255) / 255) * 100) / 100;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    } else {
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, 1)`;
    }
};

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({ 
    color, 
    onChange, 
    label, 
    className = '', 
    supportAlpha = false,
    popoverPosition = 'bottom'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    const displayColor = parseToHex(color, supportAlpha);
    const cleanHexFromProp = displayColor.replace('#', '');

    const [localHex, setLocalHex] = useState(cleanHexFromProp);
    const [isInputFocused, setIsInputFocused] = useState(false);

    useEffect(() => {
        if (!isInputFocused) {
            setLocalHex(displayColor.replace('#', ''));
        }
    }, [color, displayColor, isInputFocused]);

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

    const notifyParent = (hexVal: string) => {
        const fullHex = '#' + hexVal;
        if (supportAlpha && color && color.trim().startsWith('rgba')) {
            onChange(hexToRgbaStr(fullHex));
        } else {
            onChange(fullHex);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawVal = e.target.value.replace(/[^0-9a-fA-F]/g, '');
        const maxLen = supportAlpha ? 8 : 6;
        const truncated = rawVal.slice(0, maxLen);
        setLocalHex(truncated);

        if (truncated.length === maxLen) {
            notifyParent(truncated);
        } else if (truncated.length === 3 && !supportAlpha) {
            const expanded = truncated.split('').map(c => c + c).join('');
            notifyParent(expanded);
        } else if (truncated.length === 4 && supportAlpha) {
            const expanded = truncated.split('').map(c => c + c).join('');
            notifyParent(expanded);
        }
    };

    const handleInputBlur = () => {
        setIsInputFocused(false);
        const maxLen = supportAlpha ? 8 : 6;
        if (localHex.length === maxLen) {
            notifyParent(localHex);
        } else if (localHex.length === 3 && !supportAlpha) {
            const expanded = localHex.split('').map(c => c + c).join('');
            setLocalHex(expanded);
            notifyParent(expanded);
        } else if (localHex.length === 4 && supportAlpha) {
            const expanded = localHex.split('').map(c => c + c).join('');
            setLocalHex(expanded);
            notifyParent(expanded);
        } else if (localHex.length > 0 && localHex.length < maxLen) {
            const padded = localHex.padEnd(maxLen, '0');
            setLocalHex(padded);
            notifyParent(padded);
        } else {
            setLocalHex(displayColor.replace('#', ''));
        }
    };

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
                        value={localHex}
                        onFocus={() => setIsInputFocused(true)}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
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
                    className={`absolute z-[100] p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/80 ${
                        popoverPosition === 'top' ? 'bottom-full mb-2 left-0' : 'top-full mt-2 left-0'
                    }`}
                >
                    {supportAlpha ? (
                        <HexAlphaColorPicker color={displayColor} onChange={(c) => {
                            setLocalHex(c.replace('#', ''));
                            notifyParent(c.replace('#', ''));
                        }} />
                    ) : (
                        <HexColorPicker color={displayColor.substring(0, 7)} onChange={(c) => {
                            setLocalHex(c.replace('#', ''));
                            notifyParent(c.replace('#', ''));
                        }} />
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
