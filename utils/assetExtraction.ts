import animationsData from '../data/animations.json';
import dialoguesData from '../data/dialogues.json';

export const extractRequiredAssets = (
    data: any,
    player: any,
    itemsDb: any,
    enemiesDb: any,
    npcsDb: any,
    decorationsDb: any
): { sprites: Set<string>, textures: Set<string>, sounds: Set<string>, weaponSprites: Set<string> } => {
    const sprites = new Set<string>();
    const textures = new Set<string>();
    const sounds = new Set<string>();
    const weaponSprites = new Set<string>();

    const addSprite = (id: string | undefined) => { if (id && typeof id === 'string') sprites.add(id); };
    const addTex = (id: string | undefined) => { if (id && typeof id === 'string') textures.add(id); };
    const addSound = (id: string | undefined) => { if (id && typeof id === 'string') sounds.add(id); };

    // Common / UI base
    addSprite('TEX_FALLBACK');
    addSprite('HAND'); addSprite('EXIT'); addSprite('KEYPAD'); addSprite('KEYPAD_MASK'); addSprite('TRANSPARENT'); addSprite('TITLE');
    addSprite('MALE_DOLL'); addSprite('FEMALE_DOLL');
    addTex('WALL'); addTex('FLOOR'); addTex('DOOR'); addTex('CEILING'); addTex('SKY');
    if (data && data.skyboxTextureId) addTex(data.skyboxTextureId);
    if (data && data.ceilingTextureId) addTex(data.ceilingTextureId);
    
    // Core casings
    addSprite('CASING_9MM'); addSprite('CASING_12G'); addSprite('CASING_762');

    // Base animations
    for (let i=1; i<=16; i++) addSprite(`EXPLOSION${i}`);
    for (let i=1; i<=6; i++) addSprite(`FIRE${i}`);

    const addWeaponSprite = (id: string | undefined) => {
        if (id && typeof id === 'string') {
            weaponSprites.add(id);
            sprites.add(id);
        }
    };

    const addWeaponSprites = (item: any) => {
        if (!item) return;
        if (item.type === 'WEAPON' || item.equip === 'WEAPON') {
            const handAsset = item.handAsset || item.handAssetId;
            const handFemaleAsset = item.handFemaleAsset || item.handFemaleAssetId;
            
            if (player?.characterId === 'female') {
                if (handFemaleAsset) addWeaponSprite(handFemaleAsset);
                if (handAsset) addWeaponSprite(handAsset);
            } else {
                if (handAsset) addWeaponSprite(handAsset);
                if (handFemaleAsset) addWeaponSprite(handFemaleAsset);
            }

            const attackAsset = item.attackAsset || item.attackAssetId;
            if (attackAsset) {
                addWeaponSprite(attackAsset);
                const animData = (animationsData as any)[attackAsset];
                if (animData && animData.frames) {
                    animData.frames.forEach((f: string) => addWeaponSprite(f));
                }
            }
            const attackAssetFemale = item.attackAssetFemale || item.attackAssetFemaleId;
            if (attackAssetFemale) {
                addWeaponSprite(attackAssetFemale);
                const animData = (animationsData as any)[attackAssetFemale];
                if (animData && animData.frames) {
                    animData.frames.forEach((f: string) => addWeaponSprite(f));
                }
            }
        }
        if (item.throwId) {
            addWeaponSprite(item.throwId);
            const animData = (animationsData as any)[item.throwId];
            if (animData && animData.frames) {
                animData.frames.forEach((f: string) => addWeaponSprite(f));
            }
        }
        if (item.wallAssetId) {
            addWeaponSprite(item.wallAssetId);
            const animData = (animationsData as any)[item.wallAssetId];
            if (animData && animData.frames) {
                animData.frames.forEach((f: string) => addWeaponSprite(f));
            }
        }
    };

    const traverseAndExtract = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        
        if (Array.isArray(obj)) {
            obj.forEach(traverseAndExtract);
            return;
        }

        Object.values(obj).forEach(val => {
            if (typeof val === 'string') {
                if (val in ASSETS.SPRITES || val.startsWith('local://')) sprites.add(val);
                if (val in ASSETS.TEXTURES || val.startsWith('local://')) textures.add(val);
                if (val in ASSETS.SOUNDS || val.startsWith('local://')) sounds.add(val);
                
                // If the string is an animation ID from animationsData, extract all its frames
                const animData = (animationsData as any)[val];
                if (animData && animData.frames) {
                    animData.frames.forEach((f: string) => {
                        if (f in ASSETS.SPRITES) sprites.add(f);
                    });
                }
            } else if (typeof val === 'object') {
                traverseAndExtract(val);
            }
        });
    };

    const addPowerSourceAssets = (item: any) => {
        if (!item || !item.powerSource) return;
        const pSourceId = item.powerSource;
        const pSourceItem = itemsDb?.[pSourceId] || itemsDb?.[pSourceId.toLowerCase()];
        if (pSourceItem) {
            traverseAndExtract(pSourceItem);
        }
    };

    // Collect targeted weapon sprites for immediate GPU warming
    if (player) {
        if (player.equippedWeapon) {
            addWeaponSprites(player.equippedWeapon);
            addPowerSourceAssets(player.equippedWeapon);
        }
        if (player.equipment) {
            Object.values(player.equipment).forEach((eqItem: any) => {
                if (eqItem) {
                    addPowerSourceAssets(eqItem);
                    const dbItem = itemsDb?.[eqItem.definitionId || eqItem.id];
                    if (dbItem) {
                        addWeaponSprites(dbItem);
                        addPowerSourceAssets(dbItem);
                    }
                }
            });
        }
        if (player.inventory) {
            player.inventory.forEach((i: any) => {
                addPowerSourceAssets(i);
                const dbItem = itemsDb?.[i.definitionId || i.id];
                if (dbItem) {
                    addWeaponSprites(dbItem);
                    addPowerSourceAssets(dbItem);
                }
            });
        }
    }

    // MANDATORY EXCEPTION: Fists weapon assets must ALWAYS be loaded regardless of equipped weapon state
    const fistsDbItem = itemsDb?.['fists'] || itemsDb?.['FISTS'];
    if (fistsDbItem) {
        addWeaponSprites(fistsDbItem);
        addPowerSourceAssets(fistsDbItem);
        traverseAndExtract(fistsDbItem);
    } else {
        // Fallback explicit fist hand sprites if itemsDb object is not available
        if (player?.characterId === 'female') {
            addWeaponSprite('HAND_FISTS_FEMALE');
            addWeaponSprite('HAND_FISTS');
        } else {
            addWeaponSprite('HAND_FISTS');
            addWeaponSprite('HAND_FISTS_FEMALE');
        }
    }

    // Ground items on level
    if (data && data.items) {
        data.items.forEach((i: any) => {
            addPowerSourceAssets(i);
            const dbItem = itemsDb?.[i.id];
            if (dbItem) {
                addWeaponSprites(dbItem);
                addPowerSourceAssets(dbItem);
            }
        });
    }

    // NPC traders' weapons
    if (data && data.NPCs) {
        data.NPCs.forEach((n: any) => {
            const def = npcsDb?.[n.id];
            if (def && def.tradeItems) {
                def.tradeItems.forEach((ti: any) => {
                    addPowerSourceAssets(ti);
                    const dbItem = itemsDb?.[ti.id];
                    if (dbItem) {
                        addWeaponSprites(dbItem);
                        addPowerSourceAssets(dbItem);
                    }
                });
            }
        });
    }

    // Deep search the sector data
    traverseAndExtract(data);
    traverseAndExtract(player);

    const processDialogueDef = (dialogueId: string | undefined) => {
        if (!dialogueId || typeof dialogueId !== 'string') return;
        const dial = (dialoguesData as any)?.[dialogueId];
        if (dial) {
            traverseAndExtract(dial);
            if (dial.nodes) {
                Object.values(dial.nodes).forEach((node: any) => {
                    if (!node) return;
                    if (node.giveItem) processItemOverride(node.giveItem.id || node.giveItem.definitionId);
                    if (node.takeItem) processItemOverride(node.takeItem.id || node.takeItem.definitionId);
                    if (node.condition && node.condition.hasItem) processItemOverride(node.condition.hasItem);
                    if (node.options && Array.isArray(node.options)) {
                        node.options.forEach((opt: any) => {
                            if (!opt) return;
                            if (opt.giveItem) processItemOverride(opt.giveItem.id || opt.giveItem.definitionId);
                            if (opt.takeItem) processItemOverride(opt.takeItem.id || opt.takeItem.definitionId);
                            if (opt.condition && opt.condition.hasItem) processItemOverride(opt.condition.hasItem);
                        });
                    }
                });
            }
        }
    };

    const processItemOverride = (itemId: string | undefined) => {
        if (itemId && typeof itemId === 'string') {
            const dbItem = itemsDb?.[itemId] || (data?.itemsPalette && data.itemsPalette.find((i: any) => i.id === itemId || i.symbol === itemId));
            if (dbItem) {
                addWeaponSprites(dbItem);
                addPowerSourceAssets(dbItem);
                traverseAndExtract(dbItem);
            }
        }
    };

    const processEnemyDef = (id: string | undefined) => {
        if (!id || typeof id !== 'string') return;
        const def = enemiesDb?.[id] || (data?.enemiesPalette && data.enemiesPalette.find((e: any) => e.id === id || e.symbol === id));
        if (def) {
            traverseAndExtract(def);
            if (def.equippedWeapon) processItemOverride(def.equippedWeapon);
            if (def.inventory && Array.isArray(def.inventory)) {
                def.inventory.forEach((i: any) => processItemOverride(typeof i === 'string' ? i : (i.id || i.definitionId)));
            }
            if (def.loot && Array.isArray(def.loot)) {
                def.loot.forEach((i: any) => processItemOverride(typeof i === 'string' ? i : (i.id || i.definitionId)));
            }
        }
    };

    const processNpcDef = (id: string | undefined) => {
        if (!id || typeof id !== 'string') return;
        const def = npcsDb?.[id] || (data?.npcsPalette && data.npcsPalette.find((n: any) => n.id === id || n.symbol === id));
        if (def) {
            traverseAndExtract(def);
            if (def.tradeItems && Array.isArray(def.tradeItems)) {
                def.tradeItems.forEach((ti: any) => processItemOverride(typeof ti === 'string' ? ti : (ti.id || ti.definitionId)));
            }
            if (def.inventory && Array.isArray(def.inventory)) {
                def.inventory.forEach((i: any) => processItemOverride(typeof i === 'string' ? i : (i.id || i.definitionId)));
            }
            if (def.keepItems && Array.isArray(def.keepItems)) {
                def.keepItems.forEach((i: any) => processItemOverride(typeof i === 'string' ? i : (i.id || i.definitionId)));
            }
            if (def.dialogueId) {
                processDialogueDef(def.dialogueId);
            }
        }
    };

    const processDecorationDef = (id: string | undefined) => {
        if (!id || typeof id !== 'string') return;
        const def = decorationsDb?.[id] || (data?.decorationsPalette && data.decorationsPalette.find((d: any) => d.id === id || d.symbol === id));
        if (def) {
            traverseAndExtract(def);
        }
    };

    // Deep search used definitions from grid & player
    if (data) {
        if (data.items) {
            data.items.forEach((i: any) => processItemOverride(i.id || i.definitionId));
        }
        if (data.initialInventory) {
            data.initialInventory.forEach((i: any) => processItemOverride(typeof i === 'string' ? i : (i.id || i.definitionId)));
        }
        if (data.initialInventoryMale) {
            data.initialInventoryMale.forEach((i: any) => processItemOverride(typeof i === 'string' ? i : (i.id || i.definitionId)));
        }
        if (data.initialInventoryFemale) {
            data.initialInventoryFemale.forEach((i: any) => processItemOverride(typeof i === 'string' ? i : (i.id || i.definitionId)));
        }
        if (data.initialEquipment) {
            Object.values(data.initialEquipment).forEach((itemId: any) => processItemOverride(itemId as string));
        }
        if (data.initialEquipmentMale) {
            Object.values(data.initialEquipmentMale).forEach((itemId: any) => processItemOverride(itemId as string));
        }
        if (data.initialEquipmentFemale) {
            Object.values(data.initialEquipmentFemale).forEach((itemId: any) => processItemOverride(itemId as string));
        }
        if (data.enemies) {
            data.enemies.forEach((e: any) => processEnemyDef(e.id || e.definitionId));
        }
        if (data.decorations) {
            data.decorations.forEach((d: any) => processDecorationDef(d.id || d.definitionId));
        }
        if (data.NPCs) {
            data.NPCs.forEach((n: any) => processNpcDef(n.id || n.definitionId));
        }

        // Process Level Palettes
        if (data.enemiesPalette && Array.isArray(data.enemiesPalette)) {
            data.enemiesPalette.forEach((e: any) => processEnemyDef(e.id || e.symbol));
        }
        if (data.npcsPalette && Array.isArray(data.npcsPalette)) {
            data.npcsPalette.forEach((n: any) => processNpcDef(n.id || n.symbol));
        }
        if (data.itemsPalette && Array.isArray(data.itemsPalette)) {
            data.itemsPalette.forEach((i: any) => processItemOverride(i.id || i.symbol));
        }
        if (data.decorationsPalette && Array.isArray(data.decorationsPalette)) {
            data.decorationsPalette.forEach((d: any) => processDecorationDef(d.id || d.symbol));
        }
        if (data.construction) {
            traverseAndExtract(data.construction);
        }
        if (data.doorDefinitions) {
            traverseAndExtract(data.doorDefinitions);
        }

        // Process Script Triggers & Actions
        if (data.triggers && Array.isArray(data.triggers)) {
            data.triggers.forEach((trigger: any) => {
                if (!trigger) return;
                if (trigger.requiredItemType) processItemOverride(trigger.requiredItemType);
                if (trigger.dialogueId) {
                    processDialogueDef(trigger.dialogueId);
                }
                if (trigger.params) {
                    if (trigger.params.enemyId) processEnemyDef(trigger.params.enemyId);
                    if (trigger.params.itemId) processItemOverride(trigger.params.itemId);
                    if (trigger.params.itemDefinitionId) processItemOverride(trigger.params.itemDefinitionId);
                    if (trigger.params.npcId) processNpcDef(trigger.params.npcId);
                    if (trigger.params.decorationId) processDecorationDef(trigger.params.decorationId);
                }

                if (trigger.actions && Array.isArray(trigger.actions)) {
                    trigger.actions.forEach((action: any) => {
                        if (!action) return;
                        const { type, params } = action;
                        if (!params) return;

                        if (type === 'SPAWN_ENTITY' || type === 'SPAWN_EXPLOSION' || type === 'SPAWN_ENEMY' || type === 'SPAWN_ITEM' || type === 'SPAWN_NPC' || type === 'SPAWN_DECORATION') {
                            const entType = params.entityType || (type === 'SPAWN_ENEMY' ? 'ENEMY' : type === 'SPAWN_ITEM' ? 'ITEM' : type === 'SPAWN_NPC' ? 'NPC' : type === 'SPAWN_DECORATION' ? 'DECORATION' : type === 'SPAWN_EXPLOSION' ? 'EXPLOSION' : undefined);
                            const defId = params.definitionId || params.entityId || params.itemId || params.enemyId || params.npcId || params.decorationId;

                            if (entType === 'ENEMY') {
                                processEnemyDef(defId);
                            } else if (entType === 'ITEM') {
                                processItemOverride(defId);
                            } else if (entType === 'NPC') {
                                processNpcDef(defId);
                            } else if (entType === 'DECORATION') {
                                processDecorationDef(defId);
                            } else if (entType === 'EXPLOSION') {
                                const assetId = params.assetId || 'ANIM_EXPLOSION';
                                const soundId = params.soundId || 'EXPLOSION';
                                addSprite(assetId);
                                addSound(soundId);
                            }
                        }

                        if (type === 'GIVE_ITEM' || type === 'TAKE_ITEM') {
                            const itemId = params.itemDefinitionId || params.itemId || params.definitionId;
                            if (itemId) processItemOverride(itemId);
                        }

                        if (type === 'CHANGE_TILE') {
                            if (params.tileSourceType === 'construction' && params.tileSourceId) {
                                const block = (data.construction || []).find((c: any) => c.symbol === params.tileSourceId || c.id === params.tileSourceId);
                                if (block) traverseAndExtract(block);
                            } else if (params.tileSourceType === 'door' && params.tileSourceId) {
                                const def = data.doorDefinitions?.[params.tileSourceId];
                                if (def) traverseAndExtract(def);
                            }
                            if (params.newAssetId) addSprite(params.newAssetId);
                        }

                        if (type === 'PLAY_SOUND' && params.soundId) {
                            addSound(params.soundId);
                        }

                        if (type === 'MUSIC_PLAYER' && params.trackId) {
                            addSound(params.trackId);
                        }

                        if (type === 'SHOW_DIALOGUE' && params.dialogueId) {
                            processDialogueDef(params.dialogueId);
                        }

                        if (params.assetId) addSprite(params.assetId);
                        if (params.soundId) addSound(params.soundId);
                    });
                }
            });
        }

        // Process grid cells if present
        if (data.grids && Array.isArray(data.grids)) {
            data.grids.forEach((layer: any) => {
                if (Array.isArray(layer)) {
                    layer.forEach((row: any) => {
                        if (Array.isArray(row)) {
                            row.forEach((cell: any) => {
                                if (!cell) return;
                                if (cell.items && Array.isArray(cell.items)) {
                                    cell.items.forEach((ci: any) => processItemOverride(typeof ci === 'string' ? ci : (ci.id || ci.definitionId)));
                                }
                                if (cell.entity) {
                                    const ent = cell.entity;
                                    if (ent.type === 'ENEMY' || ent.enemyId) processEnemyDef(ent.id || ent.enemyId || ent.definitionId);
                                    if (ent.type === 'ITEM' || ent.itemId) processItemOverride(ent.id || ent.itemId || ent.definitionId);
                                    if (ent.type === 'NPC' || ent.npcId) processNpcDef(ent.id || ent.npcId || ent.definitionId);
                                    if (ent.type === 'DECORATION' || ent.decorationId) processDecorationDef(ent.id || ent.decorationId || ent.definitionId);
                                }
                            });
                        }
                    });
                }
            });
        }
    }

    if (player && player.inventory) {
        player.inventory.forEach((i: any) => processItemOverride(i.definitionId || i.id));
    }

    return { sprites, textures, sounds, weaponSprites };
}

import { ASSETS } from '../assets';
import { loadImage } from './levelLogic';
import { createBufferFromImage } from '../components/raycaster/RaycasterUtils';
import { getTintedSprite, globalSpriteTintCache } from '../components/raycaster/SpriteCache';

export const globalLoadedAudio = new Set<string>();

let sharedBakingCanvas: HTMLCanvasElement | null = null;

export const applyShadowToSprite = (img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement | HTMLImageElement => {
    return img;
};

export const loadSmartAssets = async (
    required: { sprites: Set<string>, textures: Set<string>, sounds: Set<string>, weaponSprites?: Set<string> },
    masterSpriteMap: Map<string, HTMLImageElement>,
    onProgress: (pct: number, detail: string, type: 'TEXTURE' | 'SPRITE' | 'AUDIO' | 'OPTIMIZE') => void,
    onLoadSound: (url: string) => Promise<any>,
    onStartLoading?: () => void
) => {
    let current = 0;
    
    // We only load things that are NOT in masterSpriteMap already (or have 0 width)
    const missingSprites: {id: string, url: string}[] = [];
    const missingTextures: {id: string, url: string}[] = [];
    
    required.sprites.forEach(s => {
        let url = (ASSETS.SPRITES as any)[s] || (ASSETS.TEXTURES as any)[s];
        if (!url && typeof s === 'string' && (s.startsWith('local://') || s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/'))) url = s;
        if (url) {
            const img = masterSpriteMap.get(s);
            if (!img || img.width === 0) {
                missingSprites.push({id: s, url});
            }
        }
    });

    required.textures.forEach(t => {
        let url = (ASSETS.TEXTURES as any)[t] || (ASSETS.SPRITES as any)[t];
        if (!url && typeof t === 'string' && (t.startsWith('local://') || t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://') || t.startsWith('/'))) url = t;
        if (url) {
            const img = masterSpriteMap.get(`TEX_${t}`);
            if (!img || img.width === 0) {
                missingTextures.push({id: t, url});
            }
        }
    });
    
    const audioToLoad: string[] = [];
    required.sounds.forEach(sndId => {
        let url = (ASSETS.SOUNDS as any)[sndId] || (ASSETS.SPRITES as any)[sndId];
        if (!url && typeof sndId === 'string' && sndId.startsWith('local://')) url = sndId;
        if (url && !globalLoadedAudio.has(url)) audioToLoad.push(url);
    });

    const total = missingSprites.length + missingTextures.length + audioToLoad.length;
    if (total > 0 && onStartLoading) onStartLoading();
    
    const tick = (id: string, type: 'TEXTURE' | 'SPRITE' | 'AUDIO') => {
        current++;
        if (total > 0) onProgress(Math.floor((current / total) * 80), id, type);
    };

    const texPromises = missingTextures.map(async (item) => {
        try {
            const img = await loadImage(item.url);
            masterSpriteMap.set(`TEX_${item.id}`, img);
        } catch (e) {}
        tick(item.id, 'TEXTURE');
    });

    const spritePromises = missingSprites.map(async (item) => {
        try {
            const img = await loadImage(item.url);
            const bakedImg = applyShadowToSprite(img);
            masterSpriteMap.set(item.id, bakedImg as any);
        } catch (e) {}
        tick(item.id, 'SPRITE');
    });

    const audioPromises = audioToLoad.map(async (url) => {
        try {
            await onLoadSound(url);
            globalLoadedAudio.add(url);
        } catch (e) {}
        tick("Audio", 'AUDIO');
    });

    await Promise.all([...texPromises, ...spritePromises, ...audioPromises]);

    // Pre-calculate buffers and warm up GPU for the NEW assets
    let currentBuffer = 0;
    const allNew = [...missingSprites, ...missingTextures];
    
    for (let i = 0; i < allNew.length; i++) {
        const item = allNew[i];
        const isTex = missingTextures.includes(item);
        const key = isTex ? `TEX_${item.id}` : item.id;
        const img = masterSpriteMap.get(key);
        
        if (img && img.width > 0) {
            createBufferFromImage(img, key);
        }
        currentBuffer++;
        if (i % 5 === 0 && allNew.length > 0) {
            onProgress(80 + Math.floor((currentBuffer / allNew.length) * 10), key, 'OPTIMIZE');
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Warm up GPU
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (ctx) {
        for (let i = 0; i < allNew.length; i++) {
            const item = allNew[i];
            const isTex = missingTextures.includes(item);
            const key = isTex ? `TEX_${item.id}` : item.id;
            const img = masterSpriteMap.get(key);
            
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, 0, 0, 1, 1);
                // Pre-tint effects
                if (key.startsWith('EXPLOSION') || key.startsWith('FIRE') || key.startsWith('MOLOTOV')) {
                    getTintedSprite(img, {r: 1.5, g: 1.5, b: 1.5}, 0, 0, globalSpriteTintCache, undefined, 0);
                    getTintedSprite(img, {r: 2, g: 2, b: 2}, 0, 0, globalSpriteTintCache, undefined, 0);
                    getTintedSprite(img, {r: 2.5, g: 2.5, b: 2.5}, 0, 0, globalSpriteTintCache, undefined, 0);
                } else if (key.startsWith('PLAYER_ATTACK') || key.startsWith('MUZZLE') || key.startsWith('BLOOD_SPLAT')) {
                    getTintedSprite(img, {r: 1, g: 1, b: 1}, 0, 0, globalSpriteTintCache, undefined, 0);
                }
            }
            if (i % 50 === 0 && allNew.length > 0) {
                onProgress(90, `Warming GPU...`, 'OPTIMIZE');
                await new Promise(r => setTimeout(r, 0)); 
            }
        }

        // Pre-warm and pre-decode all targeted weapon hands and attack frames to prepare browser/GPU completely!
        if (required.weaponSprites) {
            const weaponSpritesArr = Array.from(required.weaponSprites);
            for (let i = 0; i < weaponSpritesArr.length; i++) {
                const key = weaponSpritesArr[i];
                const img = masterSpriteMap.get(key);
                if (img) {
                    if (img.width > 0) {
                        createBufferFromImage(img, key);
                    }
                    if (img.complete && img.naturalWidth > 0) {
                        ctx.drawImage(img, 0, 0, 1, 1);
                        getTintedSprite(img, {r: 1, g: 1, b: 1}, 0, 0, globalSpriteTintCache, undefined, 0);
                        getTintedSprite(img, {r: 1.2, g: 1.2, b: 1.2}, 0, 0, globalSpriteTintCache, undefined, 0);
                        getTintedSprite(img, {r: 1.5, g: 1.5, b: 1.5}, 0, 0, globalSpriteTintCache, undefined, 0);
                        getTintedSprite(img, {r: 2, g: 2, b: 2}, 0, 0, globalSpriteTintCache, undefined, 0);
                    }
                }
            }
        }

        // Pre-warm all standard level sprites (enemies, npcs, decorations) at typical lighting levels to avoid mid-game frame drops
        if (required.sprites) {
            const levelSprites = Array.from(required.sprites);
            for (let i = 0; i < levelSprites.length; i++) {
                const key = levelSprites[i];
                const img = masterSpriteMap.get(key);
                if (img && img.complete && img.naturalWidth > 0) {
                    ctx.drawImage(img, 0, 0, 1, 1);
                    getTintedSprite(img, {r: 1.0, g: 1.0, b: 1.0}, 0, 0, globalSpriteTintCache, undefined, 0);
                    getTintedSprite(img, {r: 0.8, g: 0.8, b: 0.8}, 0, 0, globalSpriteTintCache, undefined, 0);
                    getTintedSprite(img, {r: 0.6, g: 0.6, b: 0.6}, 0, 0, globalSpriteTintCache, undefined, 0);
                    getTintedSprite(img, {r: 0.4, g: 0.4, b: 0.4}, 0, 0, globalSpriteTintCache, undefined, 0);
                }
            }
        }
    }

    if (total > 0) {
        onProgress(100, `Done`, 'OPTIMIZE');
    }

    return masterSpriteMap;
}

export const ensureEntityAssetsLoaded = async (
    defOrObj: any,
    itemsDb: any,
    enemiesDb: any,
    npcsDb: any,
    decorationsDb: any,
    masterSpriteMap: Map<string, HTMLImageElement>
) => {
    if (!defOrObj || !masterSpriteMap) return;

    try {
        const required = extractRequiredAssets(
            { tempObject: [defOrObj] },
            null,
            itemsDb,
            enemiesDb,
            npcsDb,
            decorationsDb
        );

        const missingSprites: { id: string; url: string }[] = [];
        required.sprites.forEach((s) => {
            let url = (ASSETS.SPRITES as any)[s];
            if (!url && typeof s === 'string' && s.startsWith('local://')) url = s;
            if (url) {
                const img = masterSpriteMap.get(s);
                if (!img || img.width === 0) {
                    missingSprites.push({ id: s, url });
                }
            }
        });

        if (missingSprites.length === 0) return;

        await Promise.all(
            missingSprites.map(async (item) => {
                try {
                    const img = await loadImage(item.url);
                    masterSpriteMap.set(item.id, img);
                    createBufferFromImage(img, item.id);
                } catch (e) {
                    console.error(`Failed to dynamic load asset ${item.id}:`, e);
                }
            })
        );
    } catch (e) {
        console.error('Error in ensureEntityAssetsLoaded:', e);
    }
};

