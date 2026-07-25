
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, DialogueNode, DialogueTree, VoiceConfig, Player, Item, Enemy } from '../types';
import { speakCharacter, cancelVoice, preloadVoice, startRadioNoise, stopRadioNoise } from '../utils/voiceSynth';
import dialoguesData from '../data/dialogues.json';
import stringsEn from '../data/strings_en.json';
import stringsRu from '../data/strings_ru.json';

export const useDialogueSystem = (
    setGameState: (state: GameState) => void,
    language: 'en' | 'ru',
    currentGameState: GameState,
    player: Player,
    setPlayer: React.Dispatch<React.SetStateAction<Player>>,
    itemsDb: any,
    addLog: (text: string, type?: any) => void,
    showToast: (msg: string) => void,
    inventoryStats: { currentLoad: number, maxCapacity: number },
    onDropItem: (item: Item) => void,
    setPickupAnim: (anim: { item: Item, startTime: number, x: number, y: number, reverse?: boolean } | null) => void,
    activeDialogueEntityPos: {x: number, y: number} | null,
    triggerPickupEffect: () => void,
    playSound: (soundId: string, pos?: { x: number, y: number }) => void,
    showTutorial?: (params: any) => Promise<void>,
    checkTriggers?: (type: string, params: any) => void
) => {
    const [activeDialogue, setActiveDialogue] = useState<DialogueTree | null>(null);
    const [currentNode, setCurrentNode] = useState<DialogueNode | null>(null);
    const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
    const [lastNpcText, setLastNpcText] = useState(""); 
    const [isDialoguePausedForTutorial, setIsDialoguePausedForTutorial] = useState(false);
    
    // Visited Nodes Tracking (Persistent per session, tied to TreeID + NodeID)
    const [visitedNodes, setVisitedNodes] = useState<Set<string>>(new Set());

    // Store full raw text to handle localization and typing
    const [fullRawText, setFullRawText] = useState("");
    const [tradeTrigger, setTradeTrigger] = useState(0);
    const [isRadioDialogue, setIsRadioDialogue] = useState<boolean>(false);
    
    const isTypingRef = useRef(false);
    const currentTextRef = useRef("");
    
    const currentVoiceRef = useRef<VoiceConfig | undefined>(undefined);
    const playerVoiceRef = useRef<VoiceConfig | undefined>(undefined); 
    const dialogueDbRef = useRef<{[id: string]: DialogueTree} | null>(dialoguesData as unknown as {[id: string]: DialogueTree});
    
    const typingTimeoutRef = useRef<any>(null);

    const localize = useCallback((text: string | undefined): string => {
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

        // Parse player name tags: {PLAYER_NAME}, {player_name}, {PLAYER}, {player}, {PLAYER_FULL_NAME}, {player_full_name}
        const strings = language === 'ru' ? stringsRu : stringsEn;
        const charSelect = (strings as any).ui?.char_select;
        const firstName = isFemale 
            ? (charSelect?.female_name_short || (language === 'ru' ? 'Лилит' : 'Lilith'))
            : (charSelect?.male_name_short || (language === 'ru' ? 'Джон' : 'John'));
        const fullName = isFemale
            ? (charSelect?.female_name || (language === 'ru' ? 'ЛИЛИТ ВЕЙН' : 'LILITH VANE'))
            : (charSelect?.male_name || (language === 'ru' ? 'ДЖОН МЕЙСОН' : 'JOHN MASON'));

        localizedText = localizedText
            .replace(/{PLAYER_NAME}/g, firstName)
            .replace(/{player_name}/g, firstName)
            .replace(/{PLAYER_FIRST_NAME}/g, firstName)
            .replace(/{player_first_name}/g, firstName)
            .replace(/{PLAYER_FULL_NAME}/g, fullName)
            .replace(/{player_full_name}/g, fullName)
            .replace(/{PLAYER}/g, firstName)
            .replace(/{player}/g, firstName);

        return localizedText;
    }, [language, player.characterId]);

    const getDisplayText = (text: string) => {
        let result = "";
        let inBrackets = false;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '[') {
                inBrackets = true;
            } else if (text[i] === ']') {
                inBrackets = false;
            } else if (!inBrackets) {
                result += text[i];
            }
        }
        return result;
    };

    // Helper: Check if player satisfies a condition
    const checkCondition = (condition?: { hasItem?: string }) => {
        if (!condition) return true;
        if (condition.hasItem) {
            const searchStr = condition.hasItem.toLowerCase();
            return player.inventory.some(item => 
                item.definitionId?.toLowerCase() === searchStr || 
                item.id?.toLowerCase() === searchStr
            );
        }
        return true;
    };

    // Helper: Process node actions (Give/Take items)
    const processNodeActions = (node: DialogueNode) => {
        let npcPos = { x: player.pos.x, y: player.pos.y };
        if (activeDialogueEntityPos) {
            npcPos = activeDialogueEntityPos;
        }

        if (checkTriggers && activeDialogue && node.scriptTriggerId) {
            checkTriggers('ON_DIALOGUE_NODE', {
                scriptTriggerId: node.scriptTriggerId
            });
        }

        if (node.takeItem) {
            const targetId = node.takeItem.id;
            const searchStr = targetId.toLowerCase();
            const itemToRemove = player.inventory.find(i => 
                i.definitionId?.toLowerCase() === searchStr || 
                i.id?.toLowerCase() === searchStr
            );
            
            if (itemToRemove) {
                setPlayer(prev => ({
                    ...prev,
                    inventory: prev.inventory.filter(i => i.id !== itemToRemove.id)
                }));
                const msg = language === 'ru' ? `Отдано: ${localize(itemToRemove.name)}` : `Lost: ${localize(itemToRemove.name)}`;
                addLog(msg, 'INFO');
                showToast(msg); 

                // Reverse animation (player -> NPC)
                playSound('SYS_PICKUP');
                setPickupAnim({
                    item: itemToRemove,
                    startTime: performance.now(),
                    x: npcPos.x,
                    y: npcPos.y,
                    reverse: true
                });
                setTimeout(() => setPickupAnim(null), 500);
            }
        }

        if (node.giveItem) {
            const targetId = node.giveItem.id;
            const dbItem = itemsDb[targetId];
            if (dbItem) {
                const name = localize(dbItem.name);
                const description = localize(dbItem.description);
                const newItem: Item = {
                    ...dbItem,
                    id: Math.random().toString(36).substr(2, 9),
                    definitionId: targetId,
                    name,
                    description,
                    rawName: dbItem.name,
                    rawDescription: dbItem.description,
                    count: node.giveItem.count || dbItem.count,
                    currentAmmo: dbItem.type === 'AMMO' ? (node.giveItem.count || dbItem.count) : dbItem.currentAmmo,
                    handAssetId: dbItem.handAsset,
                    handFemaleAssetId: dbItem.handFemaleAsset,
                    attackAssetId: dbItem.attackAsset,
                    attackFemaleAssetId: dbItem.attackAssetFemale,
                    maskAssetId: dbItem.maskAsset,
                    durability: dbItem.maxDurability,
                };

                let willMerge = false;
                if (newItem.type === 'AMMO' || newItem.type === 'MATERIAL') {
                    const existingStack = player.inventory.find(i => 
                        i.id !== newItem.id && 
                        i.rawName === newItem.rawName && 
                        (i.count || 1) < (i.maxStack || 999)
                    );
                    if (existingStack) {
                        willMerge = true;
                    }
                }
                const itemWeight = newItem.weight !== undefined ? newItem.weight : 1;
                const addedLoad = willMerge ? 0 : itemWeight;
                const itemSlots = newItem.inventorySlots || 0;
                const futureCapacity = inventoryStats.maxCapacity - itemSlots;
                const willOverflow = newItem.type !== 'CASH' && (inventoryStats.currentLoad + addedLoad > futureCapacity);

                if (willOverflow) {
                    onDropItem(newItem);
                    const msg = language === 'ru' ? `Инвентарь полон. ${name} падает на землю.` : `Inventory full. ${name} dropped on ground.`;
                    addLog(msg, 'WARNING');
                    showToast(msg);
                } else {
                    setPlayer(prev => {
                        if (newItem.type === 'CASH') {
                            const existingIndex = prev.inventory.findIndex(i => i.type === 'CASH');
                            if (existingIndex !== -1) {
                                const newInventory = [...prev.inventory];
                                newInventory[existingIndex] = {
                                    ...newInventory[existingIndex],
                                    count: (newInventory[existingIndex].count || 0) + (newItem.count || 1)
                                };
                                return { ...prev, inventory: newInventory };
                            }
                        } else if (newItem.type === 'AMMO' || newItem.type === 'MATERIAL') {
                            if (newItem.count === undefined) newItem.count = 1;
                            const existingStackIndex = prev.inventory.findIndex(i => 
                                i.id !== newItem.id && 
                                i.rawName === newItem.rawName && 
                                (i.count || 1) < (i.maxStack || 999)
                            );

                            if (existingStackIndex !== -1) {
                                const newInventory = [...prev.inventory];
                                const existingItem = newInventory[existingStackIndex];
                                const space = (existingItem.maxStack || 999) - (existingItem.count || 1);
                                const amountToAdd = Math.min(space, newItem.count || 1);
                                
                                newInventory[existingStackIndex] = {
                                    ...existingItem,
                                    count: (existingItem.count || 1) + amountToAdd
                                };
                                return { ...prev, inventory: newInventory };
                            }
                        }
                        return {
                            ...prev,
                            inventory: [...prev.inventory, newItem]
                        };
                    });
                    
                    const msg = language === 'ru' ? `Получено: ${name}` : `Received: ${name}`;
                    addLog(msg, 'SUCCESS');
                    showToast(msg); 

                    // Forward animation (NPC -> player)
                    playSound('SYS_PICKUP');
                    triggerPickupEffect();
                    setPickupAnim({
                        item: newItem,
                        startTime: performance.now(),
                        x: npcPos.x,
                        y: npcPos.y,
                        reverse: false
                    });
                    setTimeout(() => setPickupAnim(null), 500);

                    if (checkTriggers) {
                        checkTriggers('ON_ITEM_PICKUP', {
                            itemId: newItem.id,
                            itemType: newItem.type,
                            keyId: (newItem as any).keyId,
                            itemDefinitionId: newItem.definitionId,
                            x: npcPos.x,
                            y: npcPos.y
                        });
                    }
                }
            }
        }
    };

    // Recursive helper to skip visited 'once' nodes
    const resolveValidNode = (tree: DialogueTree, nodeId: string): DialogueNode | null => {
        let currId: string | null = nodeId;
        let attempts = 0;
        
        while (currId && attempts < 20) { // Safety break
            const node = tree.nodes[currId];
            if (!node) return null;

            const uniqueId = `${tree.id}:${node.id}`;
            const isVisited = visitedNodes.has(uniqueId);

            // If node is "once" AND visited, try skipping to next
            if (node.once && isVisited) {
                if (node.next) {
                    currId = node.next;
                    attempts++;
                    continue;
                } else {
                    // "Once" node with no next = end of dialogue if already visited
                    return null;
                }
            }
            
            // Found a valid node
            return node;
        }
        return null;
    };

    const markAsVisited = (treeId: string, nodeId: string) => {
        setVisitedNodes(prev => new Set(prev).add(`${treeId}:${nodeId}`));
    };

    // Update Last NPC Text whenever an NPC speaks
    useEffect(() => {
        if (currentNode && currentNode.speaker === 'NPC') {
            setLastNpcText(currentNode.text);
        }
    }, [currentNode]);

    // Play selected node sound on node activation
    useEffect(() => {
        if (currentGameState === GameState.DIALOGUE && currentNode && currentNode.soundId) {
            playSound(currentNode.soundId, activeDialogueEntityPos || undefined);
        }
    }, [currentNode, currentGameState, playSound, activeDialogueEntityPos]);

    // Handle custom trade responses
    useEffect(() => {
        const handleTradeResponse = (e: Event) => {
            const customEvent = e as CustomEvent<{ text: string }>;
            const { text } = customEvent.detail;
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            cancelVoice();
            isTypingRef.current = false;
            setFullRawText(text);
            setLastNpcText(text);
            currentTextRef.current = "";
            setSelectedOptionIndex(0);
            setTradeTrigger(prev => prev + 1);
        };
        window.addEventListener('play-trade-response', handleTradeResponse);
        return () => window.removeEventListener('play-trade-response', handleTradeResponse);
    }, []);

    const reset = useCallback(() => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        cancelVoice(); // Stop sound immediately
        stopRadioNoise();
        setActiveDialogue(null);
        setCurrentNode(null);
        setIsRadioDialogue(false);
        currentVoiceRef.current = undefined;
        playerVoiceRef.current = undefined;
        isTypingRef.current = false;
        currentTextRef.current = "";
        setIsDialoguePausedForTutorial(false);
    }, []);

    const endDialogue = useCallback(() => {
        setGameState(GameState.PLAYING);
        reset();
    }, [setGameState, reset]);

    useEffect(() => {
        const handleGamepadCancel = () => {
            endDialogue();
        };
        window.addEventListener('gamepad-dialogue-cancel', handleGamepadCancel);
        return () => window.removeEventListener('gamepad-dialogue-cancel', handleGamepadCancel);
    }, [endDialogue]);

    // Safety: If game state leaves DIALOGUE, cleanup
    useEffect(() => {
        if (currentGameState !== GameState.DIALOGUE && activeDialogue) {
            reset();
        }
    }, [currentGameState]);

    const resetVisitedNodes = useCallback(() => {
        setVisitedNodes(new Set());
    }, []);

    const injectByeOption = (node: DialogueNode): DialogueNode => {
        if (node.speaker === 'PLAYER') {
            // Only inject "Bye" if it's meant to be a choice menu (has existing options)
            // If options is empty/undefined, it's a linear line, so don't inject "Bye" automatically
            if (node.options && node.options.length > 0) {
                
                // FILTER OPTIONS BY CONDITION FIRST
                const visibleOptions = node.options.filter(o => checkCondition(o.condition));

                const newOptions = [...visibleOptions];
                const hasBye = newOptions.some(o => o.text.includes("Bye") || o.text.includes("Прощай"));
                if (!hasBye) {
                    newOptions.push({
                        text: "Прощай/Bye",
                        nextNodeId: null
                    });
                }
                return { ...node, options: newOptions };
            }
        }
        return node;
    };

    // Helper to immediately jump to next node (used for click-through)
    const jumpToNext = () => {
        if (currentNode && currentNode.next && activeDialogue) {
            const nextNode = resolveValidNode(activeDialogue, currentNode.next);
            if (nextNode) {
                markAsVisited(activeDialogue.id, nextNode.id);
                const processedNext = injectByeOption(nextNode);
                setCurrentNode(processedNext);
                setFullRawText(processedNext.text);
                setSelectedOptionIndex(0);
                currentTextRef.current = ""; 
                processNodeActions(processedNext);
                return true;
            } else {
                endDialogue();
                return true;
            }
        } else if (currentNode && !currentNode.options) {
            // No next, no options -> End
            endDialogue();
            return true;
        }
        return false;
    };

    // Preload voices when they change or radio state changes
    useEffect(() => {
        const npcVoice = currentNode?.speaker === 'PLAYER' ? playerVoiceRef.current : currentVoiceRef.current;
        if (npcVoice) {
            preloadVoice(npcVoice, isRadioDialogue);
        }
        if (player.voice) {
            preloadVoice(player.voice, isRadioDialogue);
        }
    }, [currentNode?.speaker, isRadioDialogue, player.voice]);

    // Typing effect logic
    useEffect(() => {
        if (isDialoguePausedForTutorial) return;
        if (currentNode?.speaker === 'TUTORIAL') return;
        if (fullRawText && currentGameState === GameState.DIALOGUE) {
            const localized = localize(fullRawText);
            
            const isMenu = currentNode?.options && currentNode.options.length > 0;
            
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

            const emitUpdate = (text: string, isSpeaking: boolean, isLastPage: boolean = true) => {
                window.dispatchEvent(new CustomEvent('dialogue-update', {
                    detail: { text, isSpeaking, isLastPage }
                }));
            };

            // --- TYPE FULL TEXT ---
            const startTyping = () => {
                isTypingRef.current = true;
                currentTextRef.current = "";
                
                if (isRadioDialogue && currentNode?.speaker !== 'PLAYER') {
                    startRadioNoise();
                }

                emitUpdate("", true, false);
                
                interface DialogueToken {
                    displayChar: string;
                    speakChar: string;
                    delayChar: string;
                }
                const tokens: DialogueToken[] = [];
                let i = 0;
                while (i < localized.length) {
                    if (localized[i] === '[') {
                        i++;
                        while (i < localized.length && localized[i] !== ']') {
                            tokens.push({ displayChar: "", speakChar: localized[i], delayChar: localized[i] });
                            i++;
                        }
                        if (i < localized.length && localized[i] === ']') i++;
                    } else {
                        const char = localized[i];
                        let speakChar = char;
                        if (/[0-9]/.test(char)) speakChar = "";
                        tokens.push({ displayChar: char, speakChar: speakChar, delayChar: char });
                        i++;
                    }
                }

                let tokenIndex = 0;
                let currentDisplayedText = "";
                
                const typeNextChar = () => {
                    if (currentGameState !== GameState.DIALOGUE) {
                        isTypingRef.current = false;
                        stopRadioNoise();
                        return;
                    }

                    const token = tokens[tokenIndex];
                    
                    let intonation: 'FLAT' | 'RISE' | 'FALL' = 'FLAT';
                    let lookahead = "";
                    for (let j = tokenIndex; j < Math.min(tokenIndex + 5, tokens.length); j++) {
                        lookahead += tokens[j].speakChar || tokens[j].displayChar;
                    }
                    if (lookahead.includes('?')) intonation = 'RISE';
                    else if (lookahead.includes('!')) intonation = 'FALL';

                    const isPauseChar = [' ', '.', ',', '!', '?', ';', ':', '-', '—', '\n'].includes(token.delayChar);
                    
                    const speaking = !isPauseChar && token.speakChar !== "";

                    const activeVoice = currentNode?.speaker === 'PLAYER' ? playerVoiceRef.current : currentVoiceRef.current;
                    
                    if (activeVoice && token.speakChar && token.speakChar !== '\n' && !currentNode?.noVoice) {
                        // Dynamically update voice reverb position depending on who is currently speaking
                        const speakPos = currentNode?.speaker === 'PLAYER' ? player.pos : (activeDialogueEntityPos || player.pos);
                        window.dispatchEvent(new CustomEvent('update-voice-reverb-pos', {
                            detail: { x: speakPos.x, y: speakPos.y }
                        }));
                        speakCharacter(token.speakChar, activeVoice, intonation, isRadioDialogue);
                    }

                    tokenIndex++;
                    
                    if (token.displayChar !== "") {
                        currentDisplayedText += token.displayChar;
                    }
                    currentTextRef.current = currentDisplayedText;
                    emitUpdate(currentDisplayedText, speaking, false);

                    if (tokenIndex >= tokens.length) {
                        isTypingRef.current = false;
                        stopRadioNoise();
                        emitUpdate(currentDisplayedText, false, true);
                        
                        // Normal auto-advance
                        if (currentNode) {
                            const hasOptions = currentNode.options && currentNode.options.length > 0;
                            if (!hasOptions && currentNode.action !== 'trade') {
                                const isLastNode = !currentNode.next;
                                const readingDelay = isLastNode ? 800 : 400; 

                                typingTimeoutRef.current = setTimeout(() => {
                                    jumpToNext();
                                }, readingDelay);
                            }
                        }
                    } else {
                        const baseSpeed = 35; 
                        const rate = activeVoice?.rate || 1.0;
                        let nextDelay = baseSpeed / rate;

                        const dChar = token.delayChar;
                        if (dChar === ' ') nextDelay += 100;
                        if (dChar === ',') nextDelay += 300; 
                        if (dChar === '.' || dChar === '?' || dChar === '!') nextDelay += 500; 
                        if (/[0-9]/.test(dChar)) nextDelay = (baseSpeed / rate) * 0.5;

                        typingTimeoutRef.current = setTimeout(typeNextChar, nextDelay);
                    }
                };
                
                if (tokens.length > 0) {
                    typeNextChar();
                } else {
                    isTypingRef.current = false;
                    stopRadioNoise();
                    emitUpdate("", false, true);
                }
            };

            startTyping();
        } else {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            isTypingRef.current = false;
            window.dispatchEvent(new CustomEvent('dialogue-update', {
                detail: { text: "", isSpeaking: false, isLastPage: true }
            }));
        }
        return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
    }, [fullRawText, language, currentNode, currentGameState, tradeTrigger, isRadioDialogue, isDialoguePausedForTutorial]); 

    // Handle tutorial triggering from dialogue nodes
    useEffect(() => {
        if (currentNode && currentGameState === GameState.DIALOGUE) {
            let tutorialParams: any = null;
            if (currentNode.speaker === 'TUTORIAL') {
                tutorialParams = {
                    text: currentNode.text,
                    highlightElement: currentNode.tutorial?.highlightElement,
                    pages: currentNode.tutorial?.pages
                };
            } else if (currentNode.tutorial) {
                if (typeof currentNode.tutorial === 'string') {
                    tutorialParams = { text: currentNode.tutorial };
                } else {
                    tutorialParams = { ...currentNode.tutorial };
                }
            } else if (currentNode.tutorialId) {
                tutorialParams = { textId: currentNode.tutorialId };
            }

            if (tutorialParams && showTutorial) {
                const runTutorial = async () => {
                    setIsDialoguePausedForTutorial(true);
                    try {
                        await showTutorial(tutorialParams);
                        if (currentNode.speaker === 'TUTORIAL') {
                            jumpToNext();
                        }
                    } catch (err) {
                        console.error("Failed to show tutorial from dialogue node", err);
                    } finally {
                        setIsDialoguePausedForTutorial(false);
                    }
                };
                runTutorial();
            }
        }
    }, [currentNode, currentGameState, showTutorial]);

    const startDialogue = (dialogueId: string, voice?: VoiceConfig, playerVoice?: VoiceConfig, isRadio?: boolean) => {
        if (!dialogueDbRef.current) return;
        
        setIsRadioDialogue(isRadio || false);
        currentVoiceRef.current = voice; 
        playerVoiceRef.current = playerVoice;

        const tree = dialogueDbRef.current[dialogueId];
        if (tree && tree.rootNodeId) {
            setActiveDialogue(tree);
            setLastNpcText(""); // Clear history to prevent sticking old text
            
            // Resolve actual starting node (skipping 'once' nodes if needed)
            const validRoot = resolveValidNode(tree, tree.rootNodeId);
            
            if (validRoot) {
                markAsVisited(tree.id, validRoot.id);
                setGameState(GameState.DIALOGUE);
                const processedRoot = injectByeOption(validRoot);
                setCurrentNode(processedRoot);
                setFullRawText(processedRoot.text);
                setSelectedOptionIndex(0);
                currentTextRef.current = ""; // Clear initially
                processNodeActions(processedRoot); // Give/Take on start if needed
            } else {
                console.warn("No valid root node found (all skipped?)");
            }
        }
    };

    const handleInput = (action: 'UP' | 'DOWN' | 'CONFIRM') => {
        if (isDialoguePausedForTutorial) return;
        if (!currentNode) return;

        const isInteractiveMenu = currentNode.options && currentNode.options.length > 0;

        // SKIP TYPING LOGIC
        if (isTypingRef.current) {
            if (isInteractiveMenu && (action === 'UP' || action === 'DOWN')) {
                // Pass through to allow menu nav even while typing (unlikely but safe)
            } else {
                // Instantly finish typing FULL TEXT
                isTypingRef.current = false;
                stopRadioNoise();
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                
                const fullText = getDisplayText(localize(fullRawText));
                currentTextRef.current = fullText;
                window.dispatchEvent(new CustomEvent('dialogue-update', {
                    detail: { text: fullText, isSpeaking: false, isLastPage: true }
                }));
                
                return;
            }
        }

        if (!isInteractiveMenu) {
            if (action === 'CONFIRM') {
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                jumpToNext();
            }
        } else {
            // Player Menu Navigation
            const options = currentNode.options || [];
            if (options.length > 0) {
                if (action === 'UP') {
                    setSelectedOptionIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
                } else if (action === 'DOWN') {
                    setSelectedOptionIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
                } else if (action === 'CONFIRM') {
                    const selected = options[selectedOptionIndex];
                    const nextNodeId = selected.nextNodeId;
                    
                    // Resolve valid target
                    if (nextNodeId) {
                        const nextNode = resolveValidNode(activeDialogue!, nextNodeId);
                        if (nextNode) {
                            markAsVisited(activeDialogue!.id, nextNode.id);
                            const processedNext = injectByeOption(nextNode);
                            setCurrentNode(processedNext);
                            setFullRawText(processedNext.text); 
                            setSelectedOptionIndex(0);
                            currentTextRef.current = ""; 
                            processNodeActions(processedNext);
                        } else {
                            endDialogue();
                        }
                    } else {
                        // End of dialogue (e.g. "Bye")
                        endDialogue();
                    }
                }
            } else {
                if (action === 'CONFIRM') {
                    endDialogue();
                }
            }
        }
    };

    const handleDirectChoice = (index: number) => {
        if (isDialoguePausedForTutorial) return;
        if (!currentNode) return;
        const options = currentNode.options || [];
        if (index >= 0 && index < options.length) {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            setSelectedOptionIndex(index);
            
            const selected = options[index];
            const nextNodeId = selected.nextNodeId;
            
            if (nextNodeId) {
                const nextNode = resolveValidNode(activeDialogue!, nextNodeId);
                if (nextNode) {
                    markAsVisited(activeDialogue!.id, nextNode.id);
                    const processedNext = injectByeOption(nextNode);
                    setCurrentNode(processedNext);
                    setFullRawText(processedNext.text); 
                    setSelectedOptionIndex(0);
                    currentTextRef.current = ""; 
                    processNodeActions(processedNext);
                } else {
                    endDialogue();
                }
            } else {
                endDialogue();
            }
        }
    };

    return {
        activeDialogue,
        currentNode,
        selectedOptionIndex,
        startDialogue,
        handleInput,
        handleDirectChoice,
        localize,
        getDisplayText, 
        lastNpcText,
        reset,
        resetVisitedNodes,
        isRadioDialogue,
    };
};
