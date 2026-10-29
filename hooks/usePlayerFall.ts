import { useEffect, useState, useRef } from 'react';
import { GameState, Player } from '../types';

export function usePlayerFall({
    player,
    gameState,
    setGameState,
    playSound,
    triggerScreenShake,
    levelData
}: {
    player: Player;
    gameState: GameState;
    setGameState: (state: GameState) => void;
    playSound: (soundId: string, pos?: {x: number, y: number}) => void;
    triggerScreenShake: (isExplosion: boolean, pattern?: number[], intensity?: number, duration?: number) => void;
    levelData?: any;
}) {
    const [fallAnimProgress, setFallAnimProgress] = useState(0);
    const fallAnimProgressRef = useRef(0);
    const previousStateRef = useRef<GameState | null>(null);

    const hasStartedFallRef = useRef(false);
    const animStateRef = useRef({
        startTime: null as number | null,
        bodyHitPlayed: false,
        frameId: null as number | null,
    });

    const playSoundRef = useRef(playSound);
    const triggerScreenShakeRef = useRef(triggerScreenShake);
    const playerSoundsRef = useRef(player.sounds);
    const setGameStateRef = useRef(setGameState);
    const levelDataRef = useRef(levelData);

    useEffect(() => {
        playSoundRef.current = playSound;
        triggerScreenShakeRef.current = triggerScreenShake;
        playerSoundsRef.current = player.sounds;
        setGameStateRef.current = setGameState;
        levelDataRef.current = levelData;
    }, [playSound, triggerScreenShake, player.sounds, setGameState, levelData]);

    useEffect(() => {
        if (gameState !== GameState.FALLING && gameState !== GameState.DYING) {
            previousStateRef.current = gameState;
        }

        // Handle initialization of the falling sequence
        if (gameState === GameState.FALLING && !hasStartedFallRef.current) {
            hasStartedFallRef.current = true;
            animStateRef.current = {
                startTime: null,
                bodyHitPlayed: false,
                frameId: null
            };
        }

        // Reset if we are no longer in the FALLING state
        if (gameState !== GameState.FALLING) {
            hasStartedFallRef.current = false;
            fallAnimProgressRef.current = 0;
            setFallAnimProgress(0);
            if (animStateRef.current.frameId) {
                cancelAnimationFrame(animStateRef.current.frameId);
                animStateRef.current.frameId = null;
            }
        }

        if (gameState === GameState.FALLING && hasStartedFallRef.current) {
            const duration = 1500; // 1.5 seconds for fall and rise

            const animateFall = (time: number) => {
                if (animStateRef.current.startTime === null) {
                    animStateRef.current.startTime = time;
                }
                const elapsed = time - animStateRef.current.startTime;
                const progress = Math.min(1, elapsed / duration); // 0 to 1

                let visualProgress = 0;
                if (progress <= 0.5) { // Down
                    visualProgress = progress * 2;
                    if (visualProgress >= 0.4 && !animStateRef.current.bodyHitPlayed) {
                        animStateRef.current.bodyHitPlayed = true;
                        
                        let soundToPlay = playerSoundsRef.current?.bodyHit;

                        if (soundToPlay) {
                            playSoundRef.current(soundToPlay);
                        }
                        triggerScreenShakeRef.current(false, [200, 100], 0.5, 300);
                    }
                } else { // Up
                    visualProgress = (1 - progress) * 2; // 1 down to 0
                }

                fallAnimProgressRef.current = visualProgress;
                setFallAnimProgress(visualProgress);
                if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('raycaster-look'));

                if (progress < 1) {
                    animStateRef.current.frameId = requestAnimationFrame(animateFall);
                } else {
                    hasStartedFallRef.current = false;
                    fallAnimProgressRef.current = 0;
                    setFallAnimProgress(0);
                    if (setGameStateRef.current) {
                        setGameStateRef.current(previousStateRef.current || GameState.PLAYING);
                    }
                }
            };

            animStateRef.current.frameId = requestAnimationFrame(animateFall);

            return () => {
                if (animStateRef.current.frameId) {
                    cancelAnimationFrame(animStateRef.current.frameId);
                    animStateRef.current.frameId = null;
                }
            };
        }
    }, [gameState]);

    return {
        fallAnimProgress,
        fallAnimProgressRef
    };
}
