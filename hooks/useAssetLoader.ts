
import { useState, useRef, useEffect } from 'react';
import { GameStrings, Settings, InitialStateResponse, AnimationConfig, SoundConfig, EnemyDefinition, NPCDefinition, DecorationDefinition } from '../types';
import { fetchItemsDb, getInitialPlayerState, fetchEnemiesDb, fetchNPCsDb, fetchDecorationsDb, fetchParticlesDb } from '../services/dataService';
import { preloadAllAssets, loadImage } from '../utils/levelLogic';
import { ASSETS } from '../assets';
import { preloadVoice } from '../utils/voiceSynth';
import { precalculateShards } from '../utils/particleSystem';
import { makeTextureAlpha } from '../utils/imageProcessing';
import animationsData from '../data/animations.json';
import soundsData from '../data/sounds.json';
import stringsEn from '../data/strings_en.json';
import stringsRu from '../data/strings_ru.json';
import playerData from '../data/player.json';

export const useAssetLoader = (settings: Settings) => {
    const [strings, setStrings] = useState<GameStrings | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [loadingMessage, setLoadingMessage] = useState<string>("...");
    const [loadingProgress, setLoadingProgress] = useState<number>(0);
    const [loadingLogs, setLoadingLogs] = useState<string[]>([]);
    const [isTransitionLoading, setIsTransitionLoading] = useState<boolean>(false);
    const [isWaitingToStart, setIsWaitingToStart] = useState<boolean>(false);
    const [isGameInitialized, setIsGameInitialized] = useState(false);
    const [animations, setAnimations] = useState<AnimationConfig>(animationsData as AnimationConfig);
    const [sounds, setSounds] = useState<SoundConfig>(soundsData as SoundConfig);
    const [enemiesDb, setEnemiesDb] = useState<{[id: string]: EnemyDefinition}>({}); 
    const [npcsDb, setNpcsDb] = useState<{[id: string]: NPCDefinition}>({}); 
    const [decorationsDb, setDecorationsDb] = useState<{[id: string]: DecorationDefinition}>({}); // NEW
    const [particlesDb, setParticlesDb] = useState<any>({});
    const [itemsDb, setItemsDb] = useState<any>({}); 
    
    const initialPlayerStateRef = useRef<InitialStateResponse | null>(null);
    const masterSpriteMapRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const [spriteMap, setSpriteMap] = useState<Map<string, HTMLImageElement>>(new Map());
    const loadingLogRef = useRef<HTMLDivElement>(null);
    
    // Initial load of Items DB, Animations, Sounds AND Title Image
    useEffect(() => {
        const initAssets = async () => {
            try {
                // Preload MENU_THEME specifically early
                const typedSoundsData = soundsData as SoundConfig;
                if (typedSoundsData.MENU_THEME) {
                    const themeUrl = (ASSETS.SOUNDS as any)[typedSoundsData.MENU_THEME.assetId] || (ASSETS.SPRITES as any)[typedSoundsData.MENU_THEME.assetId];
                    if (themeUrl) {
                        fetch(themeUrl); // Trigger browser cache early
                    }
                }

                // PRELOAD TITLE IMAGE IMMEDIATELY
                if (ASSETS.SPRITES.TITLE) {
                    loadImage(ASSETS.SPRITES.TITLE).then((img) => {
                        const newMap = new Map(masterSpriteMapRef.current);
                        newMap.set('TITLE', img);
                        masterSpriteMapRef.current = newMap;
                        setSpriteMap(new Map(newMap));
                    });
                }
                
            } catch (e) {
                console.error("Failed to load configs", e);
            }
        };
        initAssets();
    }, []);

    // Load Strings, Initial State, and UI Assets (Portraits)
    useEffect(() => {
        const loadStringsAndUI = async () => {
          try {
            // 1. Load Strings
            const strData = settings.language === 'ru' ? stringsRu : stringsEn;
            setStrings(strData as GameStrings);
            setLoadingMessage((strData as GameStrings).ui.loading.connection);

            // 2. Preload UI Assets (Portraits)
            if (strData) {
                const portraitKeys: string[] = [];
                if ((playerData as any).portraits) {
                    Object.values((playerData as any).portraits).forEach((genderConf: any) => {
                        if (genderConf.static) {
                            portraitKeys.push(genderConf.static);
                        }
                        if (genderConf.talk) {
                            const animDef = (animationsData as any)[genderConf.talk];
                            if (animDef && animDef.frames) {
                                portraitKeys.push(...animDef.frames);
                            } else {
                                portraitKeys.push(genderConf.talk);
                            }
                        }
                    });
                }
                
                const defaultPortraits = ['MALE_PORTRAIT1', 'MALE_PORTRAIT2', 'FEMALE_PORTRAIT1', 'FEMALE_PORTRAIT2'];
                defaultPortraits.forEach(k => {
                    if (!portraitKeys.includes(k)) {
                        portraitKeys.push(k);
                    }
                });
                
                const validKeys = portraitKeys.filter(key => (ASSETS.SPRITES as any)[key] !== undefined);
                
                const loadedImages = await Promise.all(
                    validKeys.map(key => loadImage((ASSETS.SPRITES as any)[key]))
                );

                const uiSprites = new Map<string, HTMLImageElement>();
                validKeys.forEach((key, idx) => {
                    uiSprites.set(key, loadedImages[idx]);
                });
                
                // Merge with existing (which might contain TITLE)
                masterSpriteMapRef.current = new Map([...masterSpriteMapRef.current, ...uiSprites]);
                setSpriteMap(prev => new Map([...prev, ...uiSprites]));
            }

            // 3. Initialize Game State
            if (!isGameInitialized && strData) {
                const S = strData as GameStrings;
                setLoadingMessage(S.ui.loading.items_db);
                const fetchedItems = await fetchItemsDb(); 
                setItemsDb(fetchedItems);
                
                // Load Enemy, NPC & Decoration DBs
                const [loadedEnemies, loadedNpcs, loadedDecor, loadedParticles] = await Promise.all([
                    fetchEnemiesDb(),
                    fetchNPCsDb(),
                    fetchDecorationsDb(),
                    fetchParticlesDb()
                ]);
                
                setEnemiesDb(loadedEnemies);
                setNpcsDb(loadedNpcs);
                setDecorationsDb(loadedDecor);
                setParticlesDb(loadedParticles || {});

                // PRELOAD ALL WEAPONS AND WEAPON ATTACK FRAMES ON STARTUP
                if (fetchedItems) {
                    const keysToLoad = new Set<string>();
                    Object.values(fetchedItems).forEach((item: any) => {
                        if (item && (item.type === 'WEAPON' || item.equip === 'WEAPON')) {
                            if (item.handAsset) keysToLoad.add(item.handAsset);
                            if (item.handFemaleAsset) keysToLoad.add(item.handFemaleAsset);
                            if (item.attackAsset) {
                                keysToLoad.add(item.attackAsset);
                                const animData = (animationsData as any)[item.attackAsset];
                                if (animData && animData.frames) {
                                    animData.frames.forEach((f: string) => keysToLoad.add(f));
                                }
                            }
                            if (item.attackAssetFemale) {
                                keysToLoad.add(item.attackAssetFemale);
                                const animData = (animationsData as any)[item.attackAssetFemale];
                                if (animData && animData.frames) {
                                    animData.frames.forEach((f: string) => keysToLoad.add(f));
                                }
                            }
                        }
                    });

                    const validKeys = Array.from(keysToLoad).filter(k => (ASSETS.SPRITES as any)[k] !== undefined);
                    const loadedWeaponImages = await Promise.all(
                        validKeys.map(k => loadImage((ASSETS.SPRITES as any)[k]))
                    );

                    const weaponAndAttackSprites = new Map<string, HTMLImageElement>();
                    validKeys.forEach((key, idx) => {
                        weaponAndAttackSprites.set(key, loadedWeaponImages[idx]);
                    });

                    masterSpriteMapRef.current = new Map([...masterSpriteMapRef.current, ...weaponAndAttackSprites]);
                    setSpriteMap(prev => new Map([...prev, ...weaponAndAttackSprites]));
                }

                // PRE-WARM IMAGES (Force GPU Upload)
                setLoadingMessage("Warming up GPU...");
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext('2d', { willReadFrequently: false });
                if (ctx) {
                    masterSpriteMapRef.current.forEach((img) => {
                        if (img.complete && img.naturalWidth > 0) {
                            ctx.drawImage(img, 0, 0, 1, 1);
                        }
                    });
                }

                setLoadingMessage(S.ui.loading.gear);
                // No longer passing bookText
                const initialState = await getInitialPlayerState(fetchedItems);
                initialPlayerStateRef.current = initialState;

                // PRELOAD VOICES
                setLoadingMessage("Preloading voices...");
                try {
                    const playerData = await getInitialPlayerState(fetchedItems);
                    if (playerData && playerData.config && playerData.config.voices) {
                        if (playerData.config.voices.male) await preloadVoice(playerData.config.voices.male);
                        if (playerData.config.voices.female) await preloadVoice(playerData.config.voices.female);
                    }
                    
                    for (const npcId in loadedNpcs) {
                        const npc = loadedNpcs[npcId];
                        if (npc.voice) {
                            await preloadVoice(npc.voice);
                        }
                    }
                } catch (e) {
                    console.error("Failed to preload voices", e);
                }

                setLoading(false);
                setIsGameInitialized(true);
            }
          } catch (e) { console.error("Error loading assets", e); }
        };
        loadStringsAndUI();
    }, [settings.language, isGameInitialized]);

    return {
        strings,
        loading,
        setLoading,
        loadingMessage,
        setLoadingMessage,
        loadingProgress,
        setLoadingProgress,
        loadingLogs,
        setLoadingLogs,
        isTransitionLoading,
        setIsTransitionLoading,
        isWaitingToStart,
        setIsWaitingToStart,
        isGameInitialized,
        initialPlayerStateRef,
        masterSpriteMapRef,
        spriteMap,
        setSpriteMap,
        loadingLogRef,
        animations,
        sounds,
        enemiesDb,
        npcsDb,
        decorationsDb,
        particlesDb,
        itemsDb
    };
};
