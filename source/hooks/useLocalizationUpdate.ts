import { useEffect, useRef } from 'react';
import { Player, PlayerEquipment } from '../types';

export function useLocalizationUpdate({
    isGameInitialized,
    strings,
    levelData,
    currentLevelPath,
    settings,
    loadLevel,
    setPlayer
}: {
    isGameInitialized: boolean;
    strings: any;
    levelData: any;
    currentLevelPath: string | null;
    settings: any;
    loadLevel: (path: string, strings: any, force?: boolean, portalId?: string, player?: any) => void;
    setPlayer: (updater: (prev: Player) => Player) => void;
    player: Player;
}) {
    const initialLoadRef = useRef(true);

    useEffect(() => {
        if (initialLoadRef.current) {
            initialLoadRef.current = false;
            return;
        }
        
        if (isGameInitialized && strings && levelData && currentLevelPath) {
            loadLevel(currentLevelPath, strings, true, undefined);
            setPlayer(prev => {
                const localizeVal = (val: string | undefined) => {
                    if (!val) return "";
                    const idx = val.indexOf('/');
                    if (idx !== -1) return settings.language === 'ru' ? val.substring(0, idx).trim() : val.substring(idx + 1).trim();
                    return val;
                };
                const newInventory = prev.inventory.map(item => ({
                    ...item, name: localizeVal(item.rawName), description: localizeVal(item.rawDescription)
                }));
                const newEquip = { ...prev.equipment };
                (Object.keys(newEquip) as Array<keyof PlayerEquipment>).forEach(slot => {
                    const item = newEquip[slot as keyof PlayerEquipment];
                    if (item) {
                        newEquip[slot as keyof PlayerEquipment] = { ...item, name: localizeVal(item.rawName), description: localizeVal(item.rawDescription) };
                    }
                });
                return { ...prev, inventory: newInventory, equipment: newEquip, equippedWeapon: newEquip.weapon || null };
            });
        }
    }, [settings.language]); // Remove isGameInitialized so it doesn't trigger on menu->game transition
}
