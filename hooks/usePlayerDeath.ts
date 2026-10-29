import { useEffect, useState, useRef } from 'react';
import { GameState, Player } from '../types';

export function usePlayerDeath({
    player,
    gameState,
    loading,
    combat,
    setGameState,
    setActiveModal,
    setCombat,
    resetDialogue,
    playSound,
    triggerScreenShake,
    setGameOverType
}: {
    player: Player;
    gameState: GameState;
    loading: boolean;
    combat: any;
    setGameState: (state: GameState) => void;
    setActiveModal: (modal: any) => void;
    setCombat: (updater: (prev: any) => any) => void;
    resetDialogue: () => void;
    playSound: (soundId: string) => void;
    triggerScreenShake: (isExplosion: boolean, pattern?: number[], intensity?: number, duration?: number) => void;
    setGameOverType?: (type: 'death' | 'script') => void;
}) {
    const [deathAnimProgress, setDeathAnimProgress] = useState(0);
    const deathAnimProgressRef = useRef(0);
    const hasStartedDeathRef = useRef(false);
    const animStateRef = useRef({
        startTime: null as number | null,
        bodyHitPlayed: false,
        frameId: null as number | null,
    });

    // Track player state using a ref to prevent unnecessary useEffect triggers due to reference changes
    const playerRef = useRef(player);
    useEffect(() => {
        playerRef.current = player;
    }, [player]);

    // Keep mutable values in refs to prevent animation restarts due to dependency changes
    const playSoundRef = useRef(playSound);
    const triggerScreenShakeRef = useRef(triggerScreenShake);
    const setCombatRef = useRef(setCombat);
    const resetDialogueRef = useRef(resetDialogue);
    const setGameStateRef = useRef(setGameState);
    const setActiveModalRef = useRef(setActiveModal);

    useEffect(() => {
        playSoundRef.current = playSound;
        triggerScreenShakeRef.current = triggerScreenShake;
        setCombatRef.current = setCombat;
        resetDialogueRef.current = resetDialogue;
        setGameStateRef.current = setGameState;
        setActiveModalRef.current = setActiveModal;
    }, [playSound, triggerScreenShake, setCombat, resetDialogue, setGameState, setActiveModal]);

    useEffect(() => {
        const isGameplayOrDying = 
            gameState !== GameState.MENU && 
            gameState !== GameState.CHAR_SELECT && 
            gameState !== GameState.START_SCREEN &&
            gameState !== GameState.GAME_OVER &&
            gameState !== GameState.CREDITS &&
            gameState !== GameState.VICTORY &&
            gameState !== GameState.EDITOR;

        if (player.hp > 0 || !isGameplayOrDying) {
            deathAnimProgressRef.current = 0;
            setDeathAnimProgress(0);
            hasStartedDeathRef.current = false;
            if (animStateRef.current.frameId) {
                cancelAnimationFrame(animStateRef.current.frameId);
                animStateRef.current.frameId = null;
            }
            animStateRef.current.startTime = null;
            animStateRef.current.bodyHitPlayed = false;
            return;
        }

        const isGameplayState = gameState !== GameState.DYING;
            
        if (!hasStartedDeathRef.current && isGameplayState && !loading) {
            hasStartedDeathRef.current = true;
            animStateRef.current = {
                startTime: null,
                bodyHitPlayed: false,
                frameId: null
            };

            if (setGameOverType) setGameOverType('death');
            window.dispatchEvent(new CustomEvent('achievement-update', { detail: { action: 'unlock', statKey: 'death_wish' } }));
            
            if (setGameStateRef.current) setGameStateRef.current(GameState.DYING);
            if (setActiveModalRef.current) setActiveModalRef.current(null);
            
            if (setCombatRef.current) {
                setCombatRef.current(prev => {
                    if (prev.isActive) {
                        return { ...prev, isActive: false, activeGroup: [], log: [], isProcessingTurn: false, activeAttackerId: null };
                    }
                    return prev;
                });
            }
            if (resetDialogueRef.current) resetDialogueRef.current();
            
            const p = playerRef.current;
            const deathSound = p.characterId === 'female' && p.sounds?.deathFemale ? p.sounds.deathFemale : p.sounds?.death;
            if (deathSound && playSoundRef.current) playSoundRef.current(deathSound);
        }

        if (hasStartedDeathRef.current && (gameState === GameState.DYING || isGameplayState)) {
            const duration = 4000; // 4 seconds for the full death sequence
            
            const animateDeath = (time: number) => {
                if (animStateRef.current.startTime === null) {
                    animStateRef.current.startTime = time;
                }
                const elapsed = time - animStateRef.current.startTime;
                const progress = Math.min(1, elapsed / duration);
                
                if (progress >= 0.2 && !animStateRef.current.bodyHitPlayed) {
                    animStateRef.current.bodyHitPlayed = true;
                    const p = playerRef.current;
                    if (p.sounds?.bodyHit && playSoundRef.current) {
                        playSoundRef.current(p.sounds.bodyHit);
                    }
                    if (triggerScreenShakeRef.current) {
                        triggerScreenShakeRef.current(false, [200, 100, 200], 0.5, 400);
                    }
                }
                
                deathAnimProgressRef.current = progress;
                setDeathAnimProgress(progress);
                if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('raycaster-look'));
                
                if (progress < 1) {
                    animStateRef.current.frameId = requestAnimationFrame(animateDeath);
                } else {
                    if (setGameStateRef.current) setGameStateRef.current(GameState.GAME_OVER);
                    deathAnimProgressRef.current = 0;
                    setDeathAnimProgress(0);
                }
            };
            
            animStateRef.current.frameId = requestAnimationFrame(animateDeath);
            return () => {
                if (animStateRef.current.frameId) {
                    cancelAnimationFrame(animStateRef.current.frameId);
                    animStateRef.current.frameId = null;
                }
            };
        }
    }, [player.hp, gameState, loading]);

    return {
        deathAnimProgress,
        deathAnimProgressRef
    };
}
