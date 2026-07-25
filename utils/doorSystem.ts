
import { Tile, GameStrings, Item, Enemy } from '../types';

// Helper for simple template replacement
const t = (template: string | undefined, params: { [key: string]: string | number }) => {
    if (!template) return "???";
    return template.replace(/{(\w+)}/g, (_, key) => params[key] !== undefined ? String(params[key]) : `{${key}}`);
};

let cachedDoorCoords: { x: number, y: number }[] = [];
let lastGridRefForDoors: Tile[][] | null = null;

export const processDoorAnimationStep = (grid: Tile[][]): { changed: boolean, newlyTransitioned: {x: number, y: number, state: 'OPEN' | 'CLOSED'}[] } | null => {
    let changed = false;
    const newlyTransitioned: {x: number, y: number, state: 'OPEN' | 'CLOSED'}[] = [];
    
    const height = grid.length;
    const width = grid[0]?.length || 0;
    const speed = 0.15;

    if (grid !== lastGridRefForDoors) {
        if (!lastGridRefForDoors || lastGridRefForDoors.length !== height || lastGridRefForDoors[0]?.length !== width) {
            cachedDoorCoords = [];
            for (let y = 0; y < height; y++) {
                const row = grid[y];
                if (!row) continue;
                for (let x = 0; x < width; x++) {
                    const tile = row[x];
                    if (tile && tile.type === 'DOOR' && tile.door) {
                        cachedDoorCoords.push({ x, y });
                    }
                }
            }
        } else {
            let isValid = cachedDoorCoords.length > 0;
            if (isValid) {
                for (const d of cachedDoorCoords) {
                    const tile = grid[d.y]?.[d.x];
                    if (!tile || tile.type !== 'DOOR') {
                        isValid = false;
                        break;
                    }
                }
            }
            if (!isValid) {
                cachedDoorCoords = [];
                for (let y = 0; y < height; y++) {
                    const row = grid[y];
                    if (!row) continue;
                    for (let x = 0; x < width; x++) {
                        const tile = row[x];
                        if (tile && tile.type === 'DOOR' && tile.door) {
                            cachedDoorCoords.push({ x, y });
                        }
                    }
                }
            }
        }
        lastGridRefForDoors = grid;
    }

    for (const coord of cachedDoorCoords) {
        const x = coord.x;
        const y = coord.y;
        const tile = grid[y][x];
        
        if (tile && tile.type === 'DOOR' && tile.door) {
            const door = tile.door;
            
            // Check if this door needs processing
            if (door.state !== 'OPENING' && door.state !== 'CLOSING') continue;

            let maxOpen = 1.0;
            if (door.type === 'SLIDE' || door.type === 'LIFT') {
                maxOpen = 0.85;
            }

            if (door.state === 'OPENING') {
                if (door.openAmount < maxOpen) {
                    door.openAmount = Math.min(maxOpen, door.openAmount + speed);
                    changed = true;
                    if (door.openAmount >= maxOpen) {
                        door.state = 'OPEN';
                        newlyTransitioned.push({x, y, state: 'OPEN'});
                    }
                }
            } else if (door.state === 'CLOSING') {
                if (door.openAmount > 0.0) {
                    door.openAmount = Math.max(0.0, door.openAmount - speed);
                    changed = true;
                    if (door.openAmount <= 0.0) {
                        door.state = 'CLOSED';
                        newlyTransitioned.push({x, y, state: 'CLOSED'});
                    }
                }
            }
        }
    }

    if (!changed) return null;
    return { changed, newlyTransitioned };
};

export interface DoorInteractionResult {
    action: 'NONE' | 'BLOCK' | 'LOCKED' | 'UNLOCK' | 'ACTIVATE';
    message?: string;
    sound?: string;
    secondarySound?: string;
    nextState?: 'OPENING' | 'CLOSING';
    keyToConsume?: Item;
    shouldUnlock?: boolean;
}

export const resolveDoorInteraction = (
    tile: Tile,
    playerPos: { x: number, y: number },
    targetPos: { x: number, y: number },
    inventory: Item[],
    strings: GameStrings,
    enemies?: Map<string, Enemy>,
    keyMap?: { [keyId: string]: string },
    grid?: Tile[][]
): DoorInteractionResult => {
    
    if (tile.type !== 'DOOR' || !tile.door) {
        return { action: 'NONE' };
    }

    const door = tile.door;

    // Reject interaction from the side of a HINGE door
    if (door.type === 'HINGE' && grid) {
        let doorAxis = 'H';
        const edge = door.edge;
        const leftW = grid[targetPos.y]?.[targetPos.x - 1]?.type === 'WALL';
        const rightW = grid[targetPos.y]?.[targetPos.x + 1]?.type === 'WALL';
        
        if (edge === 'TOP' || edge === 'BOTTOM') doorAxis = 'H';
        else if (edge === 'LEFT' || edge === 'RIGHT') doorAxis = 'V';
        else doorAxis = (!leftW && !rightW) ? 'V' : 'H';

        const dx = playerPos.x - targetPos.x;
        const dy = playerPos.y - targetPos.y;

        // Approaching from side
        if (doorAxis === 'H' && Math.abs(dx) === 1 && dy === 0) {
            return { action: 'NONE' };
        }
        if (doorAxis === 'V' && dx === 0 && Math.abs(dy) === 1) {
            return { action: 'NONE' };
        }
    }

    // Check if player is standing in the doorway, preventing closing
    if (playerPos.x === targetPos.x && playerPos.y === targetPos.y) {
        return { 
            action: 'BLOCK', 
            message: strings.logs.door_blocked_player 
        };
    }

    // Check if something else is blocking the door (only when closing)
    const isAttemptingToClose = door.state === 'OPEN' || door.state === 'OPENING';
    if (isAttemptingToClose) {
        // Check for enemies
        if (tile.enemyId && enemies) {
            const enemy = enemies.get(tile.enemyId);
            return {
                action: 'BLOCK',
                message: t(strings.logs.door_blocked_enemy, { name: enemy?.name || "Enemy" })
            };
        }

        // Check for items
        if (tile.items && tile.items.length > 0) {
            if (tile.items.length === 1) {
                return {
                    action: 'BLOCK',
                    message: t(strings.logs.door_blocked_item_single, { name: tile.items[0].name })
                };
            }
            return {
                action: 'BLOCK',
                message: strings.logs.door_blocked_items
            };
        }

        // Check for corpses
        if (tile.corpses && tile.corpses.length > 0) {
            return {
                action: 'BLOCK',
                message: strings.logs.door_blocked_corpse
            };
        }
    }

    // Check Permanent Closed/Locked Status
    if (door.closed && (door.state === 'CLOSED' || door.state === 'CLOSING')) {
        return {
            action: 'LOCKED',
            message: strings.logs.door_closed_message || "Дверь закрыта",
            sound: 'LOCKED'
        };
    }

    // Check Locked Status
    if (door.isLocked && (door.state === 'CLOSED' || door.state === 'CLOSING')) {
        return {
            action: 'LOCKED',
            message: strings.logs.door_locked_electronic || "The door is electronically locked.",
            sound: 'LOCKED'
        };
    }

    if (door.keyId && (door.state === 'CLOSED' || door.state === 'CLOSING')) {
        const keyItem = inventory.find(i => i.type === 'KEY' && i.keyId === door.keyId);
        
        if (keyItem) {
            const isHinge = door.type === 'HINGE';
            const openSound = door.openSound;

            return {
                action: 'UNLOCK',
                message: t(strings.logs.door_unlocked, { key: keyItem.name }),
                sound: 'UNLOCK',
                secondarySound: openSound,
                keyToConsume: keyItem,
                shouldUnlock: true,
                nextState: 'OPENING' // Unlock usually opens the door
            };
        } else {
            const requiredKeyName = (keyMap && keyMap[door.keyId]) ? keyMap[door.keyId] : door.keyId;
            return {
                action: 'LOCKED',
                message: t(strings.logs.key_needed, { key: requiredKeyName }),
                sound: 'LOCKED'
            };
        }
    }

    // Normal Interaction (Open/Close)
    let nextState: 'OPENING' | 'CLOSING';
    const isHinge = door.type === 'HINGE';
    let logMsg = '';
    let soundToPlay: string | undefined = undefined;

    if (door.state === 'CLOSED' || door.state === 'CLOSING') {
        nextState = 'OPENING';
        logMsg = strings.logs.door_open;
        soundToPlay = door.openSound;
    } else {
        nextState = 'CLOSING';
        logMsg = strings.logs.door_close || "You closed the door.";
        soundToPlay = door.closeSound;
    }

    return {
        action: 'ACTIVATE',
        message: logMsg,
        sound: soundToPlay,
        nextState: nextState
    };
};
