
import React, { useState } from 'react';
import { Player, GameState, GameStrings, CombatEnemyState, Tile } from '../types';
import { AimingTarget, scanForTargets, isVisuallyBlocking } from '../utils/aimingLogic';
import { findEnemiesWithLineOfSight } from '../utils/combatLogic';
import { rollDice } from '../utils/dice';

interface AimingSystemProps {
  player: Player;
  activeWeapon: any;
  setPlayer: React.Dispatch<React.SetStateAction<Player>>;
  levelData: { width: number; height: number; grid: Tile[][] } | null;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  strings: GameStrings | null;
  addLog: (text: string, type?: any) => void;
  startCombat: (activeGroup: CombatEnemyState[], forcedDir?: number, startWithEnemyTurn?: boolean, ambushTargetId?: string | null) => void;
  handlePlayerAttack?: (targetId: string | null, damage: number, isCrit: boolean, critFailed: boolean, force: boolean) => { grid: any[][] | null, hasNextAkimbo: boolean } | null;
  preparePlayerAttack?: () => 'main' | 'akimbo';
  triggerMuzzleFlash?: () => void;
  onTakeTurn?: (playerPosOverride?: {x: number, y: number}, gridOverride?: any[][]) => void;
  isCombatActive?: boolean;
  showToast?: (msg: string) => void;
  playSound?: (soundId: string, pos?: {x: number, y: number}) => void;
  enemies?: Map<string, any>;
}

export const useAimingSystem = ({
  player,
  activeWeapon,
  setPlayer,
  levelData,
  gameState,
  setGameState,
  strings,
  addLog,
  startCombat,
  handlePlayerAttack,
  preparePlayerAttack,
  triggerMuzzleFlash,
  onTakeTurn,
  isCombatActive = false,
  showToast,
  playSound,
  enemies
}: AimingSystemProps) => {
  const [aimingTargets, setAimingTargets] = useState<AimingTarget[]>([]);
  const [aimTargetIndex, setAimTargetIndex] = useState(0);

  const checkAndPlayGasp = (targetIdx: number, currentTargets: AimingTarget[]) => {
      if (!playSound || !enemies) return;
      const target = currentTargets[targetIdx];
      if (target && target.id.startsWith('npc_')) {
          const npc = enemies.get(target.id);
          if (npc && npc.sounds?.gasp) {
              playSound(npc.sounds.gasp, { x: target.x, y: target.y });
          }
      }
  };

  const handleShoot = () => {
    if (!levelData || !strings) return;
    
    // Check if aiming is blocked by wall/door immediately in front
    const dx = [0, 1, 0, -1][player.dir];
    const dy = [-1, 0, 1, 0][player.dir];
    const frontX = player.pos.x + dx;
    const frontY = player.pos.y + dy;
    
    const frontTile = levelData.grid[frontY]?.[frontX];
    
    let hasFrontTarget = false;
    if (frontTile) {
        if (frontTile.mirror && frontTile.canBeDestroyed !== false && !frontTile.isMirrorBroken && frontTile.maskId) hasFrontTarget = true;
        if (frontTile.enemyId) hasFrontTarget = true;
        if (frontTile.decoration?.destructable) hasFrontTarget = true;
    }

    if (isVisuallyBlocking(frontTile) && !hasFrontTarget) {
        addLog(strings.logs.wall_hit, 'INFO'); 
        return;
    }

    const targets = scanForTargets(player, levelData.grid, levelData.width, levelData.height, 12, enemies);
    const range = activeWeapon?.range || 1; 
    
    // Filter by longitudinal distance (t.dist) instead of Euclidean
    const inRangeTargets = targets.filter(t => t.dist <= range);

    // Initial check: We MUST have at least one target IN FRONT (player.dir) to enter Aiming Mode
    const frontTargets = inRangeTargets.filter(t => t.dir === player.dir);

    if (frontTargets.length > 0) {
        const sortedTargets = inRangeTargets.sort((a, b) => {
            const keyA = (a.dir * 3) + a.offset;
            const keyB = (b.dir * 3) + b.offset;
            return keyA - keyB;
        });
        
        // Find the BEST initial target (Center Front)
        let initialIdx = sortedTargets.findIndex(t => t.dir === player.dir && t.offset === 0);
        
        if (initialIdx === -1) {
            const candidates = sortedTargets.map((t, i) => ({t, i})).filter(x => x.t.dir === player.dir);
            if (candidates.length > 0) {
                 candidates.sort((a,b) => Math.abs(a.t.offset) - Math.abs(b.t.offset));
                 initialIdx = candidates[0].i;
            } else {
                 initialIdx = 0;
            }
        }

        setAimingTargets(sortedTargets);
        setAimTargetIndex(initialIdx);
        setGameState(GameState.AIMING);
        checkAndPlayGasp(initialIdx, sortedTargets);
    } else {
        if (range > 1) {
            addLog(strings.logs.no_targets, 'INFO');
        } else {
            addLog(strings.logs.too_far, 'INFO');
        }
    }
  };

  const handleAimInput = (action: 'PREV' | 'NEXT' | 'ATTACK' | 'CANCEL') => {
      if (gameState !== GameState.AIMING) return;
      
      if (action === 'CANCEL') {
          setGameState(GameState.PLAYING);
          setAimingTargets([]);
          return;
      }

      if (action === 'ATTACK') {
          const target = aimingTargets[aimTargetIndex];
          if (target && levelData) {
              
              let currentTargetId = target.id;
              
              if (target.id.startsWith('window_') || target.id.startsWith('decor_') || target.id.startsWith('door_') || target.id.startsWith('mirror_')) {
                  const targetBehind = aimingTargets.find(t => 
                      t.dir === target.dir && 
                      t.offset === target.offset && 
                      t.dist > target.dist && 
                      !t.id.startsWith('window_') && 
                      !t.id.startsWith('decor_') &&
                      !t.id.startsWith('door_') &&
                      !t.id.startsWith('mirror_')
                  );
                  if (targetBehind) {
                      currentTargetId = targetBehind.id;
                  }
              }

               if (currentTargetId.startsWith('decor_') || currentTargetId.startsWith('window_') || currentTargetId.startsWith('door_') || currentTargetId.startsWith('mirror_')) {
                   const weapon = activeWeapon;
                   const akimboWeapon = player.equipment.weaponAkimbo || (weapon?.id === 'fists_weapon' ? weapon : null);
                   const mainHasAmmo = !weapon || weapon.currentAmmo === undefined || weapon.currentAmmo > 0;
                   const akimboHasAmmo = !!akimboWeapon && (akimboWeapon.currentAmmo === undefined || akimboWeapon.currentAmmo > 0);
                   const mainHasDurability = !weapon || weapon.durability === undefined || weapon.durability > 0;
                   const akimboHasDurability = !!akimboWeapon && (akimboWeapon.durability === undefined || akimboWeapon.durability > 0);
                   
                   const mainCanFire = mainHasAmmo && mainHasDurability;
                   const akimboCanFire = akimboHasAmmo && akimboHasDurability;
                   const canShoot = mainCanFire || akimboCanFire;
                   const hasDurability = mainHasDurability || akimboHasDurability;
                   
                   if (canShoot) {
                       if (handlePlayerAttack) {
                           let firingHand = 'main';
                           if (preparePlayerAttack) {
                               firingHand = preparePlayerAttack() || 'main';
                           }
                           
                           const currentActiveWeapon = firingHand === 'akimbo' ? akimboWeapon : weapon;
                           const damage = rollDice(currentActiveWeapon?.damageDice || "1d1");
                           
                           const isDelayed = currentActiveWeapon?.muzzleFrame && currentActiveWeapon.muzzleFrame > 1;
                           if (triggerMuzzleFlash && currentActiveWeapon?.muzzleFlash && !isDelayed) {
                               triggerMuzzleFlash();
                           }
                           
                           const attackResult = handlePlayerAttack(currentTargetId, damage, false, false, true); 
                           const newGrid = attackResult?.grid;
                           
                           // If not in combat, manually trigger a turn (roaming enemies, etc.)
                           if (!isCombatActive && onTakeTurn) {
                               onTakeTurn(undefined, newGrid || undefined);
                           }

                           setGameState(prev => prev === GameState.AIMING ? GameState.PLAYING : prev);
                           setAimingTargets([]);
                       }
                   } else {
                       if (playSound) playSound('SYS_GUN_CLICK');
                       if (strings) {
                           if (!hasDurability) {
                               const brokenMsg = strings.logs?.item_broken ? strings.logs.item_broken.replace('{name}', weapon.name) : "Weapon broken";
                               addLog(brokenMsg, 'WARNING');
                               if (showToast) showToast(brokenMsg);
                           } else {
                               addLog(strings.logs?.no_ammo_spare || "Нет патронов", 'INFO');
                               if (showToast) showToast(strings.logs?.no_ammo_spare || "Нет патронов");
                           }
                       }
                   }
                   return;
              }

              // Check ammo before triggering ambush shot
              const weapon = activeWeapon;
              const akimboWeapon = player.equipment.weaponAkimbo || (weapon?.id === 'fists_weapon' ? weapon : null);
              // Allow attack if: No weapon (fists), Weapon has undefined ammo (melee), or Weapon has ammo > 0
              const mainHasAmmo = !weapon || weapon.currentAmmo === undefined || weapon.currentAmmo > 0;
              const akimboHasAmmo = !!akimboWeapon && (akimboWeapon.currentAmmo === undefined || akimboWeapon.currentAmmo > 0);
              const mainHasDurability = !weapon || weapon.durability === undefined || weapon.durability > 0;
              const akimboHasDurability = !!akimboWeapon && (akimboWeapon.durability === undefined || akimboWeapon.durability > 0);
              
              const mainCanFire = mainHasAmmo && mainHasDurability;
              const akimboCanFire = akimboHasAmmo && akimboHasDurability;
              const canShoot = mainCanFire || akimboCanFire;
              const hasDurability = mainHasDurability || akimboHasDurability; // For error message; // For error message

              if (!canShoot) {
                  if (playSound) playSound('SYS_GUN_CLICK');
                  if (strings) {
                      if (!hasDurability) {
                          const brokenMsg = strings.logs?.item_broken ? strings.logs.item_broken.replace('{name}', weapon?.name || 'Weapon') : "Weapon broken";
                          addLog(brokenMsg, 'WARNING');
                          if (showToast) showToast(brokenMsg);
                      } else {
                          addLog(strings.logs?.no_ammo_spare || "Нет патронов", 'INFO');
                          if (showToast) showToast(strings.logs?.no_ammo_spare || "Нет патронов");
                      }
                  }
                  return; // Abort attack on NPC/Enemy
              }

              const aggroIds = findEnemiesWithLineOfSight(player.pos, levelData.grid, levelData.width, levelData.height);
              
              if (!aggroIds.includes(currentTargetId)) aggroIds.push(currentTargetId);

              const combatGroup: CombatEnemyState[] = aggroIds.map(id => ({
                  id,
                  alignment: 'CENTER' 
              }));

              // Pass target.id as 4th argument (ambushTargetId)
              startCombat(combatGroup, undefined, false, currentTargetId); 
          }
          return;
      }

      if (action === 'NEXT') {
          const nextIdx = (aimTargetIndex + 1) % aimingTargets.length;
          setAimTargetIndex(nextIdx);
          
          const nextTarget = aimingTargets[nextIdx];
          if (nextTarget.dir !== player.dir) {
              setPlayer(prev => ({...prev, dir: nextTarget.dir, dir360: nextTarget.dir}));
          }
          checkAndPlayGasp(nextIdx, aimingTargets);
      }

      if (action === 'PREV') {
          let prevIdx = aimTargetIndex - 1;
          if (prevIdx < 0) prevIdx = aimingTargets.length - 1;
          setAimTargetIndex(prevIdx);

          const prevTarget = aimingTargets[prevIdx];
          if (prevTarget.dir !== player.dir) {
              setPlayer(prev => ({...prev, dir: prevTarget.dir, dir360: prevTarget.dir}));
          }
          checkAndPlayGasp(prevIdx, aimingTargets);
      }
  };

  return {
    aimingTargets,
    setAimingTargets,
    aimTargetIndex,
    setAimTargetIndex,
    handleShoot,
    handleAimInput
  };
};
