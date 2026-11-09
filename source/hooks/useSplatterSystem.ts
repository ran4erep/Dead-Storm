import { useCallback, useRef } from 'react';

export function useSplatterSystem(
    addSplatter: (x: number, y: number, z: number, type: 'WALL' | 'FLOOR' | 'DOOR' | 'SCORCH' | 'SCORCH_WALL', intensity?: number, face?: number, gridOverride?: any[][]) => void,
    playSound: (soundId: string, pos?: { x: number, y: number }) => void
) {
    const lastSplatterSoundTime = useRef<number>(0);

    const addSplatterWithSound = useCallback((x: number, y: number, z: number, type: 'WALL' | 'FLOOR' | 'DOOR' | 'SCORCH' | 'SCORCH_WALL', intensity: number = 1.0, face?: number, gridOverride?: any[][]) => {
        addSplatter(x, y, z, type, intensity, face, gridOverride);
        const now = Date.now();
        if (now - lastSplatterSoundTime.current > 100) {
            playSound('SYS_SPLATTER', { x, y });
            lastSplatterSoundTime.current = now;
        }
    }, [addSplatter, playSound]);

    return { addSplatterWithSound };
}
