import React, { useEffect, useState } from 'react';
import { useLogState } from '../contexts/LogContext';

interface GameLogProps {
    isCombatActive?: boolean;
}

const GameLog: React.FC<GameLogProps> = ({ isCombatActive = false }) => {
    const { gameLog, logEndRef } = useLogState();
    const [disableSelection, setDisableSelection] = useState(false);

    useEffect(() => {
        if (isCombatActive) {
            setDisableSelection(true);
        } else {
            const timer = setTimeout(() => {
                setDisableSelection(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isCombatActive]);

    return (
        <div 
            className={`flex-1 overflow-y-auto min-h-0 ${disableSelection ? 'select-none pointer-events-none' : 'select-text'}`}
            style={{ WebkitTouchCallout: disableSelection ? 'none' : 'default' as any }}
        >
            {gameLog.map((entry) => (
                <div 
                    key={entry.id} 
                    className={`mb-1 flex gap-2 opacity-90 ${
                        entry.type === 'COMBAT_PLAYER' ? 'text-amber-300' : 
                        entry.type === 'XP_GAIN' ? 'text-yellow-500' : 
                        entry.type === 'COMBAT_ENEMY' ? 'text-red-400' : 
                        entry.type === 'SUCCESS' ? 'text-emerald-400' : 
                        entry.type === 'DANGER' ? 'text-red-500 font-bold' : 
                        'text-gray-400'
                    }`}
                >
                    <span>{entry.text}</span>
                </div>
            ))}
            <div ref={logEndRef} />
        </div>
    );
};

export default React.memo(GameLog);
