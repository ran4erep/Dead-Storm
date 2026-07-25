import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';

export interface LogEntry {
    id: string;
    text: string;
    type: 'INFO' | 'COMBAT_PLAYER' | 'COMBAT_ENEMY' | 'SUCCESS' | 'DANGER' | 'XP_GAIN';
    time: string;
}

interface LogState {
    gameLog: LogEntry[];
    logEndRef: React.RefObject<HTMLDivElement | null>;
}

interface LogActions {
    addLog: (text: string, type?: LogEntry['type']) => void;
    clearLog: () => void;
    setIsFemale: (isFemale: boolean) => void;
}

const LogStateContext = createContext<LogState | null>(null);
const LogActionsContext = createContext<LogActions | null>(null);

export const LogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [gameLog, setGameLog] = useState<LogEntry[]>([]);
    const logEndRef = useRef<HTMLDivElement>(null);
    const isFemaleRef = useRef<boolean>(false);

    const setIsFemale = useCallback((isFemale: boolean) => {
        isFemaleRef.current = isFemale;
    }, []);

    const addLog = useCallback((text: string, type: LogEntry['type'] = 'INFO') => {
        const isFemale = isFemaleRef.current;
        const parsedText = text.replace(/([a-zA-Zа-яА-ЯёЁ0-9_\-]+)\{([^}]+)\}/g, (match, maleWord, femaleWord) => {
            return isFemale ? femaleWord : maleWord;
        });
        queueMicrotask(() => {
            setGameLog(prev => [...prev, { id: Math.random().toString(36), text: parsedText, type, time: '' }].slice(-100));
        });
    }, []);

    const clearLog = useCallback(() => {
        queueMicrotask(() => {
            setGameLog([]);
        });
    }, []);

    // Auto-scroll effect
    useEffect(() => { 
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' }); 
        }
    }, [gameLog]);

    const actionsValue = React.useMemo(() => ({ addLog, clearLog, setIsFemale }), [addLog, clearLog, setIsFemale]);

    return (
        <LogActionsContext.Provider value={actionsValue}>
            <LogStateContext.Provider value={{ gameLog, logEndRef }}>
                {children}
            </LogStateContext.Provider>
        </LogActionsContext.Provider>
    );
};

export const useLogState = () => {
    const context = useContext(LogStateContext);
    if (!context) throw new Error('useLogState must be used within LogProvider');
    return context;
};

export const useLogActions = () => {
    const context = useContext(LogActionsContext);
    if (!context) throw new Error('useLogActions must be used within LogProvider');
    return context;
};
