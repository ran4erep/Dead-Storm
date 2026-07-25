import React from 'react';
import { Plus, Droplets } from 'lucide-react';
import { useViewportScale } from '../hooks/useViewportScale';

interface EffectsOverlayProps {
    activeEffects: any[];
    settings: any;
}

const EffectsOverlay: React.FC<EffectsOverlayProps> = ({ activeEffects, settings }) => {
    const rawScale = useViewportScale();
    const scale = typeof rawScale === 'number' && rawScale > 0 ? rawScale : 1;

    if (activeEffects.length === 0) return null;

    const getTurnString = (count: number, lang: 'en' | 'ru') => {
        if (lang === 'en') return count === 1 ? "turn" : "turns";
        const lastDigit = count % 10;
        const lastTwoDigits = count % 100;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "ходов";
        if (lastDigit === 1) return "ход";
        if (lastDigit >= 2 && lastDigit <= 4) return "хода";
        return "ходов";
    };

    return (
        <div 
            className="absolute top-2 left-2 flex flex-col gap-1 md:gap-2 pointer-events-none z-[100]"
            style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left'
            }}
        >
            {activeEffects.map(({ active, def }, index) => {
                const localizeVal = (text: string) => {
                    if (!text) return "";
                    const idx = text.indexOf('/');
                    return idx !== -1 ? (settings.language === 'ru' ? text.substring(0, idx).trim() : text.substring(idx + 1).trim()) : text;
                };
                
                let IconComponent: React.ReactNode = <Plus className={`w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 ${def.color}`} />;
                
                if (def.iconType === 'SVG_PATH') {
                    IconComponent = (
                        <svg viewBox="0 0 24 24" className={`w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 ${def.color}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={def.icon} />
                        </svg>
                    );
                } else {
                    if (def.icon === 'DROPLET') IconComponent = <Droplets className={`w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 ${def.color}`} />;
                    else if (def.icon === 'PLUS') IconComponent = <Plus className={`w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 ${def.color}`} />;
                }

                return (
                    <div key={`${active.id}-${index}`} data-tutorial-target="EFFECTS" className={`relative z-[60] tutorial-highlight bg-black/80 border-l-2 px-2 py-1 md:px-3 md:py-1.5 lg:px-4 lg:py-2 rounded-r shadow-md flex items-center gap-2 md:gap-3 ${def.type === 'DEBUFF' ? 'border-red-500' : 'border-green-500'}`}>
                        {IconComponent}
                        <div className="flex flex-col leading-none">
                            <span className={`text-[10px] md:text-xs lg:text-sm font-bold uppercase ${def.color}`}>{localizeVal(def.name)}</span>
                            {active.duration !== -1 && (
                                <span className="text-[9px] md:text-[11px] lg:text-xs text-gray-300 font-mono">
                                    {active.duration} {getTurnString(active.duration, settings.language)}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default React.memo(EffectsOverlay);
