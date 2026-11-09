import { useMemo } from 'react';
import { LevelDefinition, VoiceConfig, Enemy } from '../types';

export function useDialogueNPC(
    gameState: string,
    activeDialogue: any,
    levelData: any | null,
    npcsDb: any,
    enemies: Map<string, Enemy>,
    localize: (val: string | undefined) => string,
    activeDialogueEntityId?: string | null
) {
    return useMemo(() => {
        let dialogueNPCName = "???";
        let dialogueNPCAsset = "LANA"; 
        let dialogueNPCInstanceId: string | null = null;
        let dialogueNPCDefinitionId: string | null = null;
        let dialogueNPCVoice: VoiceConfig | undefined; 

        if (gameState === 'DIALOGUE' && activeDialogue) {
            let found = false;
            
            if (activeDialogueEntityId) {
                const enemy = enemies.get(activeDialogueEntityId);
                if (enemy) {
                    dialogueNPCName = localize(enemy.name) || "???";
                    dialogueNPCAsset = enemy.assets?.dialogue_portrait?.assetId || enemy.assets?.portrait?.assetId || enemy.assets?.map?.assetId || "LANA";
                    dialogueNPCInstanceId = enemy.id;
                    dialogueNPCDefinitionId = enemy.definitionId || enemy.id; 
                    dialogueNPCVoice = enemy.voice; 
                    found = true;
                }
            }
            // Check triggers (legacy and modern SHOW_DIALOGUE actions)
            if (levelData && levelData.triggers) {
                // Check legacy flat trigger
                const legacyTrigger = levelData.triggers.find((t: any) => t.dialogueId === activeDialogue.id);
                if (legacyTrigger) {
                    dialogueNPCName = legacyTrigger.name ? localize(legacyTrigger.name) : "???";
                    dialogueNPCAsset = legacyTrigger.dialogue_portrait?.assetId || legacyTrigger.portrait?.assetId || legacyTrigger.dialogue_portrait || legacyTrigger.portrait || "LANA_PORTRAIT";
                    dialogueNPCVoice = legacyTrigger.voice; // Optional
                    found = true;
                } else {
                    // Check modern script actions
                    for (const t of levelData.triggers) {
                        if (t.actions) {
                            const showDialogueAction = t.actions.find((a: any) => a.type === 'SHOW_DIALOGUE' && a.params?.dialogueId === activeDialogue.id);
                            if (showDialogueAction) {
                                dialogueNPCName = t.name ? localize(t.name) : (showDialogueAction.params?.name ? localize(showDialogueAction.params.name) : "???");
                                
                                const tDP = t.dialogue_portrait?.assetId || t.dialogue_portrait;
                                const showDP = showDialogueAction.params?.dialogue_portrait?.assetId || showDialogueAction.params?.dialogue_portrait;
                                const tPort = t.portrait?.assetId || t.portrait;
                                const showPort = showDialogueAction.params?.portrait?.assetId || showDialogueAction.params?.portrait;

                                dialogueNPCAsset = tDP || showDP || tPort || showPort || "LANA_PORTRAIT";
                                dialogueNPCVoice = t.voice || showDialogueAction.params?.voice;
                                found = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (!found && enemies) {
                for (const [id, enemy] of enemies.entries()) {
                    if (enemy.isNPC && enemy.dialogueId === activeDialogue.id) {
                        dialogueNPCName = localize(enemy.name) || "???";
                        dialogueNPCAsset = enemy.assets?.dialogue_portrait?.assetId || enemy.assets?.portrait?.assetId || enemy.assets?.map?.assetId || "LANA";
                        dialogueNPCInstanceId = enemy.id;
                        dialogueNPCDefinitionId = enemy.definitionId || enemy.id; 
                        dialogueNPCVoice = enemy.voice; 
                        found = true;
                        break;
                    }
                }
            }

            if (!found && npcsDb) {
                const entry = Object.entries(npcsDb).find(([key, npc]: [string, any]) => npc.dialogueId === activeDialogue.id);
                if (entry) {
                    const [npcId, npcDef] = entry as [string, any];
                    dialogueNPCName = localize(npcDef.name);
                    dialogueNPCAsset = npcDef.assets?.dialogue_portrait?.assetId || npcDef.assets?.portrait?.assetId || npcDef.assets?.map?.assetId || "LANA";
                    dialogueNPCVoice = npcDef.voice;
                    dialogueNPCDefinitionId = npcId;
                    dialogueNPCInstanceId = npcId;
                }
            }
        }

        return { dialogueNPCName, dialogueNPCAsset, dialogueNPCInstanceId, dialogueNPCDefinitionId, dialogueNPCVoice };
    }, [gameState, activeDialogue, levelData, npcsDb, enemies, localize, activeDialogueEntityId]);
}

