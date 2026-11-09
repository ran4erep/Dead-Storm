import { useState, useEffect, useCallback, useRef } from 'react';
import { ToastItem } from '../types';
import achievementsData from '../data/achievements.json';

export const ACHIEVEMENT_KEYS = [
  'first_blood',
  'tinkerer',
  'bullet_sponge',
  'explorer',
  'death_wish',
  'collector',
  'snake_master',
  'tetris_master'
] as const;

export type AchievementKey = typeof ACHIEVEMENT_KEYS[number];

const alreadyUnlockedSession = new Set<string>();

export function useAchievements(
    strings: any,
    playSound: (id: string) => void,
    addToast: (msg: string) => void
) {
    const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
    const [stats, setStats] = useState<Record<string, number>>({});

    const unlockedRef = useRef<Record<string, boolean>>({});


    useEffect(() => {
        try {
            const savedUnlocks = localStorage.getItem('deadstorm_achievements');
            const savedStats = localStorage.getItem('deadstorm_stats');
            
            if (savedUnlocks) {
                const parsed = JSON.parse(savedUnlocks);
                setUnlocked(parsed);
                unlockedRef.current = parsed;
            }
            if (savedStats) setStats(JSON.parse(savedStats));
        } catch (e) {
            console.error("Failed to load achievements", e);
        }
    }, []);

    const saveStats = (newStats: Record<string, number>) => {
        try {
            localStorage.setItem('deadstorm_stats', JSON.stringify(newStats));
        } catch (e) {}
    };

    const saveUnlocked = (newUnlocked: Record<string, boolean>) => {
        try {
            localStorage.setItem('deadstorm_achievements', JSON.stringify(newUnlocked));
        } catch (e) {}
    };

    const unlockAchievement = useCallback((key: AchievementKey) => {
        if (unlockedRef.current[key]) return; // Immediately prevent duplicate execution
        
        unlockedRef.current[key] = true;

        setUnlocked(prev => {
            const newlyUnlocked = { ...prev, [key]: true };
            saveUnlocked(newlyUnlocked);
            return newlyUnlocked;
        });

        const achConfig = achievementsData.find((a: any) => a.key === key);
        if (achConfig && !alreadyUnlockedSession.has(key)) {
            alreadyUnlockedSession.add(key);
            const isRu = strings?.achievements?.title === "Достижения";
            const achName = isRu ? achConfig.name.ru : achConfig.name.en;
            const achDesc = isRu ? achConfig.desc.ru : achConfig.desc.en;
            window.dispatchEvent(new CustomEvent('achievement-unlocked-ui', { 
                detail: { key, title: achName, desc: achDesc } 
            }));
            playSound('LEVELUP');
        }
    }, [strings, playSound]);

    const incrementStat = useCallback((statKey: string, amount: number = 1) => {
        setStats(prev => {
            const current = (prev[statKey] || 0) + amount;
            const newStats = { ...prev, [statKey]: current };
            saveStats(newStats);

            // Check stat-based achievements
            if (statKey === 'damage_taken' && current >= 100 && !unlockedRef.current['bullet_sponge']) {
                setTimeout(() => unlockAchievement('bullet_sponge'), 0);
            }
            if (statKey === 'items_collected' && current >= 20 && !unlockedRef.current['collector']) {
                setTimeout(() => unlockAchievement('collector'), 0);
            }
            
            return newStats;
        });
    }, [unlockAchievement]);
    
    useEffect(() => {
        const handleEvent = (e: any) => {
            const { action, statKey, amount } = e.detail;
            if (action === 'unlock') {
                unlockAchievement(statKey as AchievementKey);
            } else if (action === 'increment') {
                incrementStat(statKey, amount || 1);
            }
        };
        const handleReset = () => {
            setUnlocked({});
            setStats({});
            unlockedRef.current = {};
            alreadyUnlockedSession.clear();
            localStorage.removeItem('deadstorm_achievements');
            localStorage.removeItem('deadstorm_stats');
            if (addToast) addToast("Achievements & Stats Reset");
        };
        window.addEventListener('achievement-update', handleEvent);
        window.addEventListener('achievement-reset', handleReset);
        return () => {
            window.removeEventListener('achievement-update', handleEvent);
            window.removeEventListener('achievement-reset', handleReset);
        };
    }, [unlockAchievement, incrementStat, addToast]);

    return {

        unlocked,
        stats,
        unlockAchievement,
        incrementStat
    };
}
