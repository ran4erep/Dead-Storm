
import React, { useState, useEffect } from 'react';
import { PlayerStats, GameStrings } from '../types';
import { X, TrendingUp, Shield, Zap, Activity, Plus, Minus, Check, Star } from 'lucide-react';
import { WeaponIcon } from './WeaponIcon';

interface StatsModalProps {
  level: number;
  xp: number;
  maxXp: number;
  stats: PlayerStats;
  availablePoints: number;
  strings: GameStrings['stats'];
  onClose: () => void;
  onUpgrade: (newStats: PlayerStats, newPoints: number) => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ 
  level, 
  xp, 
  maxXp, 
  stats, 
  availablePoints, 
  strings, 
  onClose,
  onUpgrade 
}) => {
  const [draftStats, setDraftStats] = useState<PlayerStats>({...stats});
  const [draftAvailablePoints, setDraftAvailablePoints] = useState<number>(availablePoints);

  useEffect(() => {
    setDraftStats({...stats});
    setDraftAvailablePoints(availablePoints);
  }, [stats, availablePoints]);

  const statConfig = [
    { key: 'str', label: strings.str, desc: strings.str_desc, icon: WeaponIcon, color: 'text-red-400', border: 'border-red-900/50' },
    { key: 'agi', label: strings.agi, desc: strings.agi_desc, icon: Zap, color: 'text-yellow-400', border: 'border-yellow-900/50' },
    { key: 'spd', label: strings.spd, desc: strings.spd_desc, icon: TrendingUp, color: 'text-cyan-400', border: 'border-cyan-900/50' },
    { key: 'vit', label: strings.vit, desc: strings.vit_desc, icon: Activity, color: 'text-green-400', border: 'border-green-900/50' },
  ];

  const handleIncrease = (key: keyof PlayerStats) => {
    if (draftAvailablePoints > 0) {
      setDraftStats(prev => ({ ...prev, [key]: prev[key] + 1 }));
      setDraftAvailablePoints(prev => prev - 1);
    }
  };

  const handleDecrease = (key: keyof PlayerStats) => {
    if (draftStats[key] > stats[key]) {
      setDraftStats(prev => ({ ...prev, [key]: prev[key] - 1 }));
      setDraftAvailablePoints(prev => prev + 1);
    }
  };

  const hasChanges = draftAvailablePoints !== availablePoints;

  return (
    <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300">
      <div className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
             <Star size={18} className="text-purple-400" />
             <h2 className="text-lg font-bold text-white tracking-widest uppercase">{strings.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 active:text-white transition-colors flex items-center gap-1 touch-manipulation gamepad-hide-buttons">
             <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-800/95 space-y-4">
            <div className="flex justify-between items-end mb-4 border-b border-gray-700 pb-4">
                <div>
                    <span className="text-xs text-gray-500 uppercase tracking-widest">{strings.level_label}</span>
                    <div className="text-3xl font-black text-white leading-none">{level}</div>
                </div>
                <div className="flex flex-col items-end flex-1 ml-6">
                    <span className="text-[10px] text-gray-400 font-['Jura'] mb-1">{xp} / {maxXp} XP</span>
                    <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-500 transition-all duration-500" style={{ width: `${Math.min(100, (xp / maxXp) * 100)}%` }} />
                    </div>
                </div>
            </div>
            <div className={`p-3 rounded border flex items-center justify-between ${draftAvailablePoints > 0 ? 'bg-purple-900/20 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-gray-900 border-gray-700'}`}>
                <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">{strings.available_points}</span>
                <span className={`text-xl font-black ${draftAvailablePoints > 0 ? 'text-purple-400 animate-pulse' : 'text-gray-600'}`}>{draftAvailablePoints}</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
                {statConfig.map((stat) => {
                    const currentVal = draftStats[stat.key as keyof PlayerStats];
                    const originalVal = stats[stat.key as keyof PlayerStats];
                    const isIncreased = currentVal > originalVal;
                    return (
                        <div key={stat.key} className={`bg-gray-900/60 p-3 rounded border ${stat.border} flex items-center gap-3`}>
                            <div className={`p-2 bg-black/40 rounded ${stat.color}`}><stat.icon size={20} /></div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center">
                                    <span className={`font-bold text-sm uppercase tracking-wider ${stat.color}`}>{stat.label}</span>
                                    <div className="flex items-center gap-1"><span className={`text-2xl font-['Jura'] font-black ${isIncreased ? 'text-green-400' : 'text-white'}`}>{currentVal}</span>{isIncreased && <span className="text-xs text-green-500 font-bold">(+{currentVal - originalVal})</span>}</div>
                                </div>
                                <p className="text-[10px] text-gray-500 leading-tight">{stat.desc}</p>
                            </div>
                            {(availablePoints > 0 || hasChanges) && (
                                <div className="flex flex-row items-center gap-2 ml-2">
                                     <button onClick={() => handleDecrease(stat.key as keyof PlayerStats)} disabled={!isIncreased} className={`p-1 rounded border active:scale-95 transition-all ${isIncreased ? 'bg-gray-700 text-red-400 border-gray-600 hover:bg-red-900/30' : 'bg-gray-900 text-gray-600 border-gray-700 cursor-not-allowed'}`}><Minus size={14} strokeWidth={3} /></button>
                                     <button onClick={() => handleIncrease(stat.key as keyof PlayerStats)} disabled={draftAvailablePoints === 0} className={`p-1 rounded border active:scale-95 transition-all ${draftAvailablePoints > 0 ? 'bg-gray-700 text-green-400 border-gray-600 hover:bg-red-900/30' : 'bg-gray-900 text-gray-600 border-gray-700 cursor-not-allowed'}`}><Plus size={14} strokeWidth={3} /></button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="pt-4 mt-auto">
                 <button onClick={() => onUpgrade(draftStats, draftAvailablePoints)} disabled={!hasChanges} className={`w-full py-3 font-bold rounded shadow-lg flex items-center justify-center gap-2 transition-all ${hasChanges ? 'bg-green-700 hover:bg-green-600 text-white active:scale-95 animate-pulse cursor-pointer' : 'bg-gray-700 text-gray-500 border border-gray-600 cursor-not-allowed'}`}><Check size={20} />{strings.btn_confirm}</button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default StatsModal;