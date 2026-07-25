
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Player, EffectDefinition, GameStrings, GameState } from '../types';

export const useEffectSystem = (
    player: Player,
    setPlayer: React.Dispatch<React.SetStateAction<Player>>,
    strings: GameStrings | null,
    addLog: (text: string, type?: any) => void,
    playSound: (soundName: string) => void,
    setGameState: (state: GameState) => void,
    triggerDamageEffect: (heavy: boolean) => void,
    language: 'en' | 'ru',
    onBleed?: (x: number, y: number) => void // NEW CALLBACK
) => {
    const effectsDbRef = useRef<{[id: string]: EffectDefinition}>({});
    const sideEffectsQueueRef = useRef<Array<() => void>>([]);

    // Execute queued side effects after render
    useEffect(() => {
        if (sideEffectsQueueRef.current.length > 0) {
            const effectsToRun = [...sideEffectsQueueRef.current];
            sideEffectsQueueRef.current = [];
            effectsToRun.forEach(fn => fn());
        }
    });

    // Load Effects DB
    useEffect(() => {
        fetch('./data/de-buffs.json')
            .then(res => res.json())
            .then(data => {
                effectsDbRef.current = data;
            })
            .catch(e => console.error("Failed to load de-buffs.json", e));
    }, []);

    const localize = (text: string | undefined): string => {
        if (!text) return "";
        let localizedText = text;
        const idx = text.indexOf('/');
        if (idx !== -1) {
            localizedText = language === 'ru' ? text.substring(0, idx).trim() : text.substring(idx + 1).trim();
        }
        
        // Parse gender-specific text: word{femaleWord}
        const isFemale = player.characterId === 'female';
        localizedText = localizedText.replace(/([a-zA-Zа-яА-ЯёЁ0-9_\-]+)\{([^}]+)\}/g, (match, maleWord, femaleWord) => {
            return isFemale ? femaleWord : maleWord;
        });

        return localizedText;
    };

    const t = (template: string | undefined, params: { [key: string]: string | number }) => {
        if (!template) return "???";
        return template.replace(/{(\w+)}/g, (_, key) => params[key] !== undefined ? String(params[key]) : `{${key}}`);
    };

    const applyEffect = useCallback((effectId: string) => {
        const def = effectsDbRef.current[effectId];
        if (!def) {
            console.warn(`Effect ${effectId} not found in database.`);
            return;
        }

        const effectName = localize(def.name);
        const logMsg = strings?.logs.effect_applied 
            ? t(strings.logs.effect_applied, { effect: effectName }) 
            : (language === 'ru' ? `Наложен эффект: ${effectName}` : `Effect applied: ${effectName}`);
        
        addLog(logMsg, def.type === 'DEBUFF' ? 'DANGER' : 'SUCCESS');

        setPlayer(prev => {
            const currentEffects = prev.activeEffects || [];
            const existingIdx = currentEffects.findIndex(e => e.definitionId === effectId);
            let newEffects = [...currentEffects];

            if (existingIdx !== -1) {
                // Stack duration: Add new duration to existing remaining duration
                newEffects[existingIdx] = {
                    ...newEffects[existingIdx],
                    duration: newEffects[existingIdx].duration + def.duration
                };
            } else {
                // Add new
                newEffects.push({
                    id: Math.random().toString(36).substr(2, 9),
                    definitionId: effectId,
                    duration: def.duration
                });
            }

            return { ...prev, activeEffects: newEffects };
        });
    }, [strings, addLog, language]);

    const processEffects = useCallback(() => {
        if ((!player.activeEffects || player.activeEffects.length === 0) && !(player.concussionLevel && player.concussionLevel > 0) && !(player.flashDuration && player.flashDuration > 0)) return;

        setPlayer(prev => {
            let currentHp = prev.hp;
            const keptEffects: any[] = [];
            let hpChanged = false;
            const currentEffects = prev.activeEffects || [];

            currentEffects.forEach(effect => {
                const def = effectsDbRef.current[effect.definitionId];
                if (!def) return;

                // Apply Tick
                if (def.tickEffect) {
                    if (def.tickEffect.stat === 'hp') {
                        const val = def.tickEffect.value;
                        currentHp += val;
                        hpChanged = true;
                        
                        // Visual feedback for ticks (No logging per turn to avoid spam)
                        if (val < 0) {
                            sideEffectsQueueRef.current.push(() => triggerDamageEffect(false));
                            
                            // Bleeding Logic
                            if (def.id === 'bleeding' && onBleed) {
                                // Spawn 3 to 7 drops per turn
                                const drops = Math.floor(Math.random() * 5) + 3;
                                const posX = prev.pos.x;
                                const posY = prev.pos.y;
                                sideEffectsQueueRef.current.push(() => {
                                    for (let i = 0; i < drops; i++) {
                                        // Add random jitter so drops don't look like a perfect machine line
                                        // Increased jitter range slightly for better spread
                                        const jitterX = (Math.random() - 0.5) * 0.6;
                                        const jitterY = (Math.random() - 0.5) * 0.6;
                                        onBleed(posX + jitterX, posY + jitterY);
                                    }
                                });
                            }
                        } 
                    }
                }

                // Decrement duration
                const nextDuration = effect.duration - 1;
                if (nextDuration > 0) {
                    keptEffects.push({ ...effect, duration: nextDuration });
                } else {
                    const effectName = localize(def.name);
                    const msg = strings?.logs.effect_expired
                        ? t(strings.logs.effect_expired, { effect: effectName })
                        : (language === 'ru' ? `Эффект истек: ${effectName}` : `Effect expired: ${effectName}`);
                    sideEffectsQueueRef.current.push(() => addLog(msg, 'INFO'));
                }
            });

            // Clamp HP
            currentHp = Math.min(prev.maxHp, Math.max(0, currentHp));

            return {
                ...prev,
                hp: currentHp,
                activeEffects: keptEffects,
                concussionLevel: Math.max(0, (prev.concussionLevel || 0) - 1),
                flashDuration: Math.max(0, (prev.flashDuration || 0) - 1)
            };
        });
    }, [player.activeEffects, player.concussionLevel, player.flashDuration, strings, addLog, triggerDamageEffect, language, setGameState, onBleed]);

    const getActiveEffectDefinitions = () => {
        if (!player.activeEffects) return [];
        return player.activeEffects.map(e => ({
            active: e,
            def: effectsDbRef.current[e.definitionId]
        })).filter(item => item.def !== undefined);
    };

    return {
        applyEffect,
        processEffects,
        getActiveEffectDefinitions
    };
};
