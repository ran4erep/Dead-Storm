
import { useState, useCallback } from 'react';
import { Item } from '../types';

export const useLootSystem = () => {
    const [lootAnims, setLootAnims] = useState<{ id: string, item: Item, x: number, y: number, startTime: number, targetX: number, targetY: number }[]>([]);

    const triggerLootDrop = useCallback((item: Item, startX: number, startY: number) => {
        const id = Math.random().toString(36);
        
        // Items pop vertically in place (target = start). 
        // The arc animation in EntityRenderer handles the Z-axis (up and down).
        const targetX = startX;
        const targetY = startY;
        
        setLootAnims(prev => [...prev, {
            id,
            item,
            x: startX,
            y: startY,
            startTime: performance.now(),
            targetX,
            targetY
        }]);

        // Remove anim after completion (500ms matches renderer duration)
        setTimeout(() => {
            setLootAnims(prev => prev.filter(a => a.id !== id));
        }, 500); 
    }, []);

    return {
        lootAnims,
        triggerLootDrop
    };
};
