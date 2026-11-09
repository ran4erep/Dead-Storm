
import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { rollDice } from '../utils/dice';
import { Crosshair, EyeOff, ChevronsRight, Footprints, RotateCcw, Ban } from 'lucide-react';
import { GameStrings, PlayerStats, Settings } from '../types';
import { useViewportScale } from '../hooks/useViewportScale';

export const BulletIcon = memo(({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 512 512" 
    fill="currentColor" 
    className={className}
  >
    <g>
      <path d="M509.915,2.067C498.446-9.417,371.29,29.161,331.086,60.974L451.04,180.927 C482.853,140.708,521.415,13.567,509.915,2.067z"></path>
      <path d="M268.743,122.677l-41.344,10.328L42.211,318.208l12.047,12.063l-16.359,16.344l-12.063-12.047L0.008,360.396 l151.594,151.608l25.844-25.844l-12.063-12.047L0.008,360.396 l151.594,151.608l25.844-25.844l-12.063-12.047L0.008,360.396 l151.594,151.608l25.844-25.844l-12.063-12.047L0.008,360.396 l151.594,151.608l25.844-25.844l-12.063-12.047l16.359-16.359l12.063,12.047l185.188-185.171l10.344-41.359 c0,0,18.703-18.719,48.25-48.234L316.993,74.442C287.461,103.942,268.743,122.677,268.743,122.677z"></path>
    </g>
  </svg>
));

interface DamageFloater {
  id: string;
  enemyId: string;
  damage: number;
}

interface EnemyData {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  image: HTMLImageElement | undefined;
  portrait?: HTMLImageElement | undefined;
  attackPortrait?: HTMLImageElement | undefined;
  alignment: 'LEFT' | 'CENTER' | 'RIGHT';
  distance?: number;
  brightness?: number; 
  armor?: number;
  brokenArmor?: number[];
  flashDuration?: number;
  isBlockedByPit?: boolean;
}

// Extracted and Memoized Enemy UI Component
const EnemyFloater = memo(({ 
    enemy, 
    visualShift, 
    isAttacking, 
    damageFloaters,
    statusStunnedText,
    distanceUnit,
    scale = 1
}: { 
    enemy: EnemyData, 
    visualShift: number, 
    isAttacking: boolean, 
    damageFloaters: DamageFloater[],
    statusStunnedText?: string,
    distanceUnit?: string,
    scale?: number
}) => {
    let basePos = 50;
    if (enemy.alignment === 'LEFT') basePos = 17;
    if (enemy.alignment === 'RIGHT') basePos = 83;

    const hpPercent = (enemy.hp / enemy.maxHp) * 100;
    const damageSpawnLeft = (hpPercent + 100) / 2;
    const dist = enemy.distance || 1.5;
    const zIndex = 100 - Math.min(20, Math.floor(dist));
    const isStunned = (enemy.flashDuration || 0) > 0;

    return (
        <div 
            className={`absolute flex flex-col items-center justify-end pointer-events-none transition-all duration-300 gap-px ${isAttacking ? 'opacity-0' : 'opacity-100'}`} 
            style={{ 
                left: `${basePos}%`, 
                bottom: `${1.65 * scale}rem`,
                transform: `translateX(calc(-50% + ${visualShift}%)) translateZ(0) scale(${scale})`, 
                transformOrigin: 'bottom center',
                zIndex: zIndex,
                willChange: 'transform, opacity' 
            }} 
        >

            {dist > 1.5 && (
                <div className="bg-[#1a1b1e]/95 border border-[#3f4148] px-0.5 py-0 rounded-[1px] shadow-sm flex items-center justify-center relative z-[110] h-auto">
                    <span className="text-[9px] text-[#9ca3af] font-['Jura'] font-bold leading-none tracking-tight uppercase whitespace-nowrap">
                        {Math.round(dist)}{distanceUnit || 'м'}
                    </span>
                </div>
            )}
            
            <div className="relative w-[72px] h-[9px] shrink-0 z-[105]">
                <div className="absolute inset-0 rounded-[1px] overflow-hidden border border-gray-800 bg-gray-950">
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                        <span className="text-[7px] font-['Jura'] font-bold text-white/90 drop-shadow-md tracking-widest leading-none">
                            {enemy.hp}/{enemy.maxHp}
                        </span>
                    </div>
                    <div className="absolute top-0 left-0 h-full bg-red-950 transition-all duration-700 ease-out delay-150" style={{ width: `${hpPercent}%` }} />
                    <div className="absolute top-0 left-0 h-full bg-[#991b1b] transition-all duration-200 ease-out" style={{ width: `${hpPercent}%` }} />
                </div>
                {damageFloaters.map(d => (
                    <div key={d.id} className="absolute text-[10px] font-['Jura'] font-bold text-red-600 damage-anim pointer-events-none z-[120] whitespace-nowrap" style={{ left: `${damageSpawnLeft}%`, top: '50%', textShadow: '1px 0 0 #fff, -1px 0 0 #fff, 0 1px 0 #fff, 0 -1px 0 #fff' }}>
                        -{d.damage}
                    </div>
                ))}
            </div>
            <div className="bg-[#1a1b1e]/95 border border-[#3f4148] px-0.5 py-0 rounded-[1px] shadow-sm min-w-fit flex items-center justify-center relative z-[110] h-auto">
                <span className="text-[9px] text-[#9ca3af] font-['Jura'] font-bold leading-none tracking-tight uppercase whitespace-nowrap">
                    {enemy.name}
                </span>
            </div>
        </div>
    );
});

interface CombatOverlayProps {
  enemies: EnemyData[];
  playerHp: number;
  playerMaxHp: number;
  playerStats: PlayerStats; 
  playerDir: number;
  playerDir360: number;
  weaponAccuracy: number;
  weaponDamage: string;
  akimboWeaponDamage?: string;
  weaponShootType?: string;
  weaponRange: number; 
  lastPlayerHit: number; 
  isProcessingTurn: boolean;
  strings: GameStrings['combat'];
  language: Settings['language']; 
  activeAttackerId: string | null;
  totalCombatants: number;
  escapeBlocked: boolean;
  turnDuration: number;
  onPlayerAttack: (targetId: string | null, damage: number, isCrit: boolean, critFailed: boolean, force?: boolean, armorHitIndex?: number) => boolean;
  onVisualHit?: (targetId: string) => void; 
  onEscape: (success: boolean) => void;
  onReload: (success: boolean) => void;
  onTimeout: (mode: 'ATTACK' | 'ESCAPE' | 'RELOAD') => void;
  isPaused: boolean; 
  onAttackStart: () => 'main' | 'akimbo';
  onFlashImmediate: () => void;
  currentAmmo?: number;
  magazineMax?: number;
  akimboAmmo?: number;
  akimboMagazineMax?: number;
  totalAmmo?: number;
  manualReloadTrigger?: number; 
  isTimerEnabled?: boolean;
  visualHitIds?: string[];
  hideSprites?: boolean;
  crtEffect?: boolean;
  isWeaponBroken?: boolean;
  isAkimboWeaponBroken?: boolean;
  hasAkimboWeapon?: boolean;
  playSound?: (sound: string) => void;
  isDebugMode?: boolean;
  invertContextButtons?: boolean;
}

const CombatOverlay: React.FC<CombatOverlayProps> = ({
  enemies,
  playerHp,
  playerMaxHp,
  playerStats,
  playerDir,
  playerDir360,
  weaponAccuracy,
  weaponDamage,
  akimboWeaponDamage,
  weaponShootType,
  weaponRange,
  isProcessingTurn,
  strings,
  language,
  activeAttackerId,
  totalCombatants,
  escapeBlocked,
  turnDuration,
  onPlayerAttack,
  onVisualHit,
  onEscape,
  onReload,
  onTimeout,
  isPaused,
  onAttackStart,
  onFlashImmediate,
  currentAmmo,
  magazineMax,
  akimboAmmo,
  akimboMagazineMax,
  totalAmmo,
  manualReloadTrigger = 0,
  isTimerEnabled = true,
  visualHitIds = [],
  hideSprites = false,
  crtEffect = true,
  isWeaponBroken = false,
  isAkimboWeaponBroken = false,
  hasAkimboWeapon = false,
  playSound,
  isDebugMode = false,
  invertContextButtons = false
}) => {
  const [resultMessage, setResultMessage] = useState<string>("");
  const [flyingArmor, setFlyingArmor] = useState<{ id: string, zoneStart: number, zoneWidth: number, armorCount: number, hitIndex: number, dx: number, dy: number, dr: number }[]>([]);
  const [mode, setMode] = useState<'ATTACK' | 'ESCAPE' | 'RELOAD'>('ATTACK');
  const viewportScale = useViewportScale();
  
  // Use state for Escape/Reload zones to keep them stable during the minigame
  const [escapeZone, setEscapeZone] = useState<{start: number, width: number} | null>(null);
  const [reloadZone, setReloadZone] = useState<{start: number, width: number} | null>(null);

  const sliderRef = useRef<HTMLDivElement>(null);
  const reloadZoneDivRef = useRef<HTMLDivElement>(null);
  
  const barPosRef = useRef<number>(50);
  const reloadWidthRef = useRef<number>(0);
  const reloadTargetWidthRef = useRef<number>(0);
  const reloadCenterRef = useRef<number>(0);
  const movingRightRef = useRef<boolean>(true);
  const speedRef = useRef<number>(0.1); 
  const timeLeftRef = useRef<number>(turnDuration);
  
  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const lastFireTime = useRef<number>(0);
  const lastProcessedReloadTrigger = useRef<number>(manualReloadTrigger);
  const reloadQueuedRef = useRef<boolean>(false);
  const hasTimeoutTriggered = useRef<boolean>(false);
  const prevIsProcessingTurnRef = useRef<boolean>(isProcessingTurn);
  const prevTurnDurationRef = useRef<number>(turnDuration);
  const isFirstMountRef = useRef<boolean>(true);

  // Damage Floater Logic
  const [damageFloaters, setDamageFloaters] = useState<DamageFloater[]>([]);
  const prevEnemyHps = useRef<Map<string, number>>(new Map());

  // Inject CSS for floaters
  useEffect(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        @keyframes float-damage {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          40% { transform: translate(-50%, -150%) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, -300%) scale(1); opacity: 0; }
        }
        .damage-anim {
          animation: float-damage 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        @keyframes armor-fly {
          0% { 
             transform: translateY(0) translateX(0) rotate(0) scale(1); 
             opacity: 1; 
             filter: brightness(2); 
          }
          10% { transform: translateY(calc(var(--dy) * 0.64px)) translateX(calc(var(--dx) * 0.1px)) rotate(calc(var(--dr) * 0.1deg)) scale(1); }
          20% { transform: translateY(calc(var(--dy) * 0.96px)) translateX(calc(var(--dx) * 0.2px)) rotate(calc(var(--dr) * 0.2deg)) scale(1); }
          25% { transform: translateY(calc(var(--dy) * 1px)) translateX(calc(var(--dx) * 0.25px)) rotate(calc(var(--dr) * 0.25deg)) scale(1); opacity: 1; filter: brightness(1.7); }
          30% { transform: translateY(calc(var(--dy) * 0.96px)) translateX(calc(var(--dx) * 0.3px)) rotate(calc(var(--dr) * 0.3deg)) scale(1); }
          40% { transform: translateY(calc(var(--dy) * 0.64px)) translateX(calc(var(--dx) * 0.4px)) rotate(calc(var(--dr) * 0.4deg)) scale(1); filter: brightness(1.4); }
          50% { transform: translateY(0px) translateX(calc(var(--dx) * 0.5px)) rotate(calc(var(--dr) * 0.5deg)) scale(1); opacity: 1; }
          60% { transform: translateY(calc(var(--dy) * -0.96px)) translateX(calc(var(--dx) * 0.6px)) rotate(calc(var(--dr) * 0.6deg)) scale(1); }
          70% { transform: translateY(calc(var(--dy) * -2.24px)) translateX(calc(var(--dx) * 0.7px)) rotate(calc(var(--dr) * 0.7deg)) scale(1); }
          80% { transform: translateY(calc(var(--dy) * -3.84px)) translateX(calc(var(--dx) * 0.8px)) rotate(calc(var(--dr) * 0.8deg)) scale(1); opacity: 0.8; filter: brightness(1); }
          90% { transform: translateY(calc(var(--dy) * -5.76px)) translateX(calc(var(--dx) * 0.9px)) rotate(calc(var(--dr) * 0.9deg)) scale(1); }
          100% { 
             transform: translateY(calc(var(--dy) * -8px)) translateX(calc(var(--dx) * 1px)) rotate(calc(var(--dr) * 1deg)) scale(1); 
             opacity: 0; 
             filter: brightness(0.8);
          }
        }
        .armor-break-anim {
          animation: armor-fly 0.8s linear forwards;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
      return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
      mountedRef.current = true;
      return () => { mountedRef.current = false; };
  }, []);

  // Monitor Enemy HP changes
  useEffect(() => {
      enemies.forEach(e => {
          const prev = prevEnemyHps.current.get(e.id);
          if (prev !== undefined && e.hp < prev) {
              const dmg = prev - e.hp;
              const id = Math.random().toString(36);
              setDamageFloaters(prevArr => [...prevArr, { id, enemyId: e.id, damage: dmg }]);
              setTimeout(() => {
                  if (mountedRef.current) {
                      setDamageFloaters(prevArr => prevArr.filter(item => item.id !== id));
                  }
              }, 800);
          }
          prevEnemyHps.current.set(e.id, e.hp);
      });
  }, [enemies]);

  // CRITICAL FIX: Calculate Hit Zones synchronously via useMemo
  // This guarantees zones are available in the SAME RENDER FRAME that 'enemies' prop updates.
  // Previous useEffect/useState approach caused a 1-frame delay or desync.
  const enemyHitZones = useMemo(() => {
      if (mode !== 'ATTACK') return {};

      const newZones: {[key:string]: {start: number, width: number}} = {};
      
      const closestEnemies: {[key: string]: EnemyData} = {};
      
      enemies.forEach(enemy => {
          if (closestEnemies[enemy.alignment]) {
              const existing = closestEnemies[enemy.alignment];
              if ((enemy.distance || 0) < (existing.distance || 999)) {
                  closestEnemies[enemy.alignment] = enemy;
              }
          } else {
              closestEnemies[enemy.alignment] = enemy;
          }
      });

      Object.values(closestEnemies).forEach(enemy => {
          const rawDist = enemy.distance ?? 1;
          const isMeleeWeapon = weaponRange <= 1.5;
          if (enemy.isBlockedByPit && isMeleeWeapon) {
              return; // Melee weapons cannot attack if either is in a pit
          }
          if (!isDebugMode && rawDist > weaponRange + 0.5) return; 
          
          // Округляем дистанцию, чтобы враги по бокам (дистанция ~1.41) считались как дистанция 1
          const dist = Math.round(rawDist);
          
          const MAX_ZONE_WIDTH = 30; // Максимум поделенного места между тремя врагами
          
          const acc = weaponAccuracy || 1;
          const r = weaponRange || 1;
          
          let finalWidth;
          if (r <= 1) {
              // Если range равен 1, то accuracy просто регулирует ширину полосы попадания в упор
              // If range is 1, accuracy simply adjusts/regulates the width of the hit zone at close range
              finalWidth = Math.max(0.5, MAX_ZONE_WIDTH * acc);
          } else {
              // Рассчитываем ширину зоны равномерно (линейно), избегая жестко захардкоженных чисел.
              // Использование отношения (accuracy / range) в чистом виде даёт слишком малые значения на концах.
              // Квадратный корень из отношения естественно расширяет малые значения, 
              // делая разницу (например, между 0.1 / 4 и 1.0 / 5) визуально ощутимой,
              // сохраняя при этом универсальную формулу для любых значений точности.
              
              // Получаем изначальное соотношение и ограничиваем корень до 1.0 (максимальная ширина)
              const ratio = Math.max(0, acc / r);
              const scaleAtMaxRange = Math.min(1.0, Math.sqrt(ratio));
              
              // Линейный прогресс от 0 до 1 по мере удаления до максимальной дистанции
              const progress = Math.min(1.0, Math.max(0.0, (dist - 1) / (r - 1)));
              
              let widthMultiplier: number;
              if (weaponShootType === 'rifle') {
                  // Для винтовки: чем дальше враг, тем БОЛЬШЕ зона попадания (на близких дистанциях оружие неэффективно).
                  // На дистанции dist = 1 (progress = 0) мультипликатор минимален (scaleAtMaxRange).
                  // На максимальной дистанции dist = r (progress = 1) мультипликатор максимален (1.0).
                  widthMultiplier = scaleAtMaxRange + progress * (1.0 - scaleAtMaxRange);
              } else {
                  // Для обычного оружия: чем дальше враг, тем МЕНЬШЕ зона попадания.
                  // Равномерное (линейное) уменьшение ширины от 1.0 до scaleAtMaxRange
                  widthMultiplier = 1.0 - progress * (1.0 - scaleAtMaxRange);
              }
              
              finalWidth = Math.max(0.5, MAX_ZONE_WIDTH * widthMultiplier);
          }
          
          let center = 50;
          if (enemy.alignment === 'LEFT') center = 17;   
          if (enemy.alignment === 'RIGHT') center = 83;  
          
          newZones[enemy.id] = { start: center - (finalWidth / 2), width: finalWidth };
      });

      return newZones;
  }, [enemies, weaponAccuracy, weaponRange, weaponShootType, mode, isDebugMode]);

  // Optimization: Pre-calculate closest enemies per alignment slot.
  // This avoids O(N^2) filtering inside the render loop and keeps Hooks rules clean!
  const closestEnemiesByAlignment = useMemo(() => {
      const closest: {[key: string]: EnemyData} = {};
      enemies.forEach(enemy => {
          if (!closest[enemy.alignment] || (enemy.distance || 0) < (closest[enemy.alignment].distance || 999)) {
              closest[enemy.alignment] = enemy;
          }
      });
      return closest;
  }, [enemies]);

  useEffect(() => { 
      if (!isProcessingTurn) {
          if (reloadQueuedRef.current) {
              setMode('RELOAD');
              reloadQueuedRef.current = false;
          } else {
              setMode('ATTACK');
          }
      } 
  }, [isProcessingTurn]);

  useEffect(() => {
      if (manualReloadTrigger > lastProcessedReloadTrigger.current) {
          if (isProcessingTurn) {
              reloadQueuedRef.current = true;
          } else {
              setMode('RELOAD');
          }
          lastProcessedReloadTrigger.current = manualReloadTrigger;
      }
  }, [manualReloadTrigger, isProcessingTurn]);

  useEffect(() => {
      const healthRatio = Math.max(0.05, playerHp / playerMaxHp);
      const baseSpeed = 0.10; 
      const healthPenalty = 1 + (1 - healthRatio) * 1.0; 
      const threatPenalty = 1 + (Math.max(0, totalCombatants - 1) * 0.20);
      const speedStatBonus = Math.max(0.6, 1 - (playerStats.spd * 0.04));
      speedRef.current = baseSpeed * healthPenalty * threatPenalty * speedStatBonus;
  }, [playerHp, playerMaxHp, playerStats.spd, totalCombatants]);

  useEffect(() => {
    // Reset slider when:
    // 1. First time combat overlay is mounted AND it's player's turn
    // 2. Transitioning from Enemy Turn (true) to Player Turn (false)
    const turnStarted = prevIsProcessingTurnRef.current && !isProcessingTurn;
    const initialPlayerTurn = isFirstMountRef.current && !isProcessingTurn;

    if (turnStarted || initialPlayerTurn) {
        const timeBonus = playerStats.spd * 300;
        timeLeftRef.current = turnDuration + timeBonus;
        const startPos = Math.floor(Math.random() * 90) + 5;
        barPosRef.current = startPos;
        
        // Guarantee direction towards zones
        let shouldMoveRight = Math.random() > 0.5;
        const zones = Object.values(enemyHitZones) as {start: number, width: number}[];
        if (zones.length > 0) {
            const minStart = Math.min(...zones.map(z => z.start));
            const maxEnd = Math.max(...zones.map(z => z.start + z.width));
            
            if (startPos < minStart) shouldMoveRight = true;
            else if (startPos > maxEnd) shouldMoveRight = false;
        }
        
        movingRightRef.current = shouldMoveRight;
        hasTimeoutTriggered.current = false;
        pausedRef.current = false;
        if (sliderRef.current) sliderRef.current.style.transform = `translate3d(${startPos}%, 0, 0)`;
    } else if (turnDuration > prevTurnDurationRef.current) {
        timeLeftRef.current += (turnDuration - prevTurnDurationRef.current);
    }
    
    isFirstMountRef.current = false;
    prevIsProcessingTurnRef.current = isProcessingTurn;
    prevTurnDurationRef.current = turnDuration;
  }, [isProcessingTurn, turnDuration, playerStats.spd, enemyHitZones]);

  // Handle Escape/Reload zones via effect because they need to persist (randomized once per mode entry)
  useEffect(() => {
      const hasAmmoProp = currentAmmo !== undefined || akimboAmmo !== undefined;
      const totalCurrentAmmo = (currentAmmo || 0) + (akimboAmmo || 0);
      const totalMagazineMax = (magazineMax || 10) + (akimboMagazineMax || 0);

      if (mode === 'ESCAPE') {
          setEscapeZone(prev => {
              if (prev) return prev; // Don't re-roll if already exists
              const baseEscapeWidth = 30;
              const escapeWidth = Math.max((baseEscapeWidth - (Math.max(1, totalCombatants) * 5)) * (playerHp / playerMaxHp), 5);
              return { start: Math.floor(Math.random() * (90 - escapeWidth) + 5), width: escapeWidth };
          });
          setReloadZone(null);
      } else if (mode === 'RELOAD') {
          setReloadZone(prev => {
              if (prev) return prev;
              const reloadWidth = 40 - (totalCurrentAmmo / totalMagazineMax * 30); 
              const start = Math.floor(Math.random() * (90 - reloadWidth) + 5);
              
              reloadWidthRef.current = reloadWidth;
              reloadTargetWidthRef.current = Math.max(5, Math.min(60, reloadWidth + (Math.random() * 20 - 10)));
              reloadCenterRef.current = start + (reloadWidth / 2);
              
              return { start, width: reloadWidth };
          });
          setEscapeZone(null);
      } else {
          setEscapeZone(null);
          setReloadZone(null);
      }
  }, [mode, totalCombatants, playerHp, playerMaxHp, currentAmmo, magazineMax, akimboAmmo, akimboMagazineMax]);

  const isTimerEnabledRef = useRef(isTimerEnabled);
  isTimerEnabledRef.current = isTimerEnabled;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const enemyHitZonesRef = useRef(enemyHitZones);
  enemyHitZonesRef.current = enemyHitZones;
  const escapeZoneRef = useRef(escapeZone);
  escapeZoneRef.current = escapeZone;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const currentAmmoRef = useRef(currentAmmo);
  currentAmmoRef.current = currentAmmo;
  const akimboAmmoRef = useRef(akimboAmmo);
  akimboAmmoRef.current = akimboAmmo;
  const magazineMaxRef = useRef(magazineMax);
  magazineMaxRef.current = magazineMax;
  const akimboMagazineMaxRef = useRef(akimboMagazineMax);
  akimboMagazineMaxRef.current = akimboMagazineMax;

  // Main Loop
  const animate = useCallback((time: number) => {
    if (!lastTimeRef.current) { lastTimeRef.current = time; requestRef.current = requestAnimationFrame(animate); return; }
    
    const rawDelta = time - lastTimeRef.current;
    const delta = Math.min(rawDelta, 50); 
    lastTimeRef.current = time;
    
    const shouldPause = isProcessingTurnRef.current || pausedRef.current || isPausedRef.current || hasTimeoutTriggered.current;
    const currentMode = modeRef.current;
    
    if (isTimerEnabledRef.current && !shouldPause) {
        timeLeftRef.current -= delta;
        if (timeLeftRef.current <= 0) { 
            let inZone = false;
            const currentPos = barPosRef.current;
            
            if (currentMode === 'ATTACK') {
                const zones = Object.values(enemyHitZonesRef.current) as {start: number, width: number}[];
                for (const zone of zones) {
                    if (currentPos >= zone.start && currentPos <= zone.start + zone.width) {
                        inZone = true;
                        break;
                    }
                }
            } else if (currentMode === 'ESCAPE') {
                const currentEscapeZone = escapeZoneRef.current;
                if (currentEscapeZone && currentPos >= currentEscapeZone.start && currentPos <= currentEscapeZone.start + currentEscapeZone.width) {
                    inZone = true;
                }
            } else if (currentMode === 'RELOAD') {
                const currentWidth = reloadWidthRef.current;
                const currentStart = reloadCenterRef.current - (currentWidth / 2);
                if (currentPos >= currentStart && currentPos <= currentStart + currentWidth) {
                    inZone = true;
                }
            }

            if (!inZone) {
                timeLeftRef.current = 0; 
                hasTimeoutTriggered.current = true; 
                pausedRef.current = true; 
                onTimeoutRef.current(currentMode);
                setMode('ATTACK'); 
            }
        }
    }
    
    if (!shouldPause) {
        // Dynamic Reload Zone Logic
        if (currentMode === 'RELOAD' && reloadZoneDivRef.current) {
            const step = 0.015 * delta; // Slower change (was 0.05)
            if (Math.abs(reloadWidthRef.current - reloadTargetWidthRef.current) < step) {
                // Pick new target
                const totalCurrentAmmo = (currentAmmoRef.current || 0) + (akimboAmmoRef.current || 0);
                const totalMagazineMax = (magazineMaxRef.current || 10) + (akimboMagazineMaxRef.current || 0);
                const baseWidth = 40 - (totalCurrentAmmo / totalMagazineMax * 30);
                // Less chaotic range
                reloadTargetWidthRef.current = Math.max(8, Math.min(55, baseWidth + (Math.random() * 20 - 10)));
            } else {
                if (reloadWidthRef.current < reloadTargetWidthRef.current) reloadWidthRef.current += step;
                else reloadWidthRef.current -= step;
                
                const currentWidth = reloadWidthRef.current;
                const currentLeft = reloadCenterRef.current - (currentWidth / 2);
                
                reloadZoneDivRef.current.style.width = `${currentWidth}%`;
                reloadZoneDivRef.current.style.left = `${currentLeft}%`;
            }
        }

      let next = barPosRef.current + (movingRightRef.current ? speedRef.current : -speedRef.current) * delta;
      
      if (next >= 100) { next = 100; movingRightRef.current = false; } 
      else if (next <= 0) { next = 0; movingRightRef.current = true; }
      
      barPosRef.current = next; 
      
      if (sliderRef.current) {
          sliderRef.current.style.transform = `translate3d(${next}%, 0, 0)`;
      }
    }
    
    requestRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => { 
    if (isDebugMode) return;
    requestRef.current = requestAnimationFrame(animate); 
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); }; 
  }, [animate, isDebugMode]);

  const isAkimboFollowupRef = useRef(false);

  const isHoldingFireRef = useRef(false);
  const autoFireIntervalRef = useRef<any>(null);

  const stopAutoFire = () => {
      isHoldingFireRef.current = false;
      if (autoFireIntervalRef.current) {
          clearTimeout(autoFireIntervalRef.current);
          autoFireIntervalRef.current = null;
      }
  };

  useEffect(() => {
      const handleGlobalUp = () => stopAutoFire();
      window.addEventListener('pointerup', handleGlobalUp);
      return () => {
          window.removeEventListener('pointerup', handleGlobalUp);
          stopAutoFire();
      };
  }, []);

  const handleAction = (actionType: 'ATTACK' | 'ESCAPE' | 'RELOAD') => {
    if (pausedRef.current || isProcessingTurn || isPaused) return; 
    const now = Date.now(); 
    let cooldown = isAkimboFollowupRef.current ? 50 : 500;
    if (weaponShootType === 'auto' && actionType === 'ATTACK' && !isAkimboFollowupRef.current) {
        cooldown = 100;
    }
    if (now - lastFireTime.current < cooldown) return;
    
    lastFireTime.current = now; 
    pausedRef.current = true; 
    const currentPos = barPosRef.current;
    
    if (actionType === 'ATTACK') {
        const firingHand = onAttackStart();
        onFlashImmediate(); 
        let hitEnemyId: string | null = null, hitAlignment: string | null = null, hitDistance = 0, isCritical = false, critFailed = false;
        let armorHitIndex: number | undefined = undefined;
        
        for (const enemy of enemies) {
            const zone = enemyHitZones[enemy.id];
            if (zone && currentPos >= zone.start && currentPos <= (zone.start + zone.width)) {
                hitEnemyId = enemy.id; hitAlignment = enemy.alignment; hitDistance = enemy.distance || 0;
                
                if (enemy.armor && enemy.armor > 0) {
                    const relativeHitPos = currentPos - zone.start;
                    const segmentWidth = zone.width / enemy.armor;
                    const hitIndex = Math.floor(relativeHitPos / segmentWidth);
                    const safeIndex = Math.max(0, Math.min(enemy.armor - 1, hitIndex));
                    if (!enemy.brokenArmor?.includes(safeIndex)) {
                        armorHitIndex = safeIndex;
                        const animId = `armor_fly_${enemy.id}_${Date.now()}`;
                        const randDx = (Math.random() < 0.5 ? -1 : 1) * (150 + Math.random() * 150); // clearly left or right
                        const randDy = -80 - Math.random() * 60; // fly up
                        const randDr = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360); // spin a lot
                        setFlyingArmor(prev => [...prev, { id: animId, zoneStart: zone.start, zoneWidth: zone.width, armorCount: enemy.armor!, hitIndex: safeIndex, dx: randDx, dy: randDy, dr: randDr }]);
                        setTimeout(() => {
                            if (mountedRef.current) {
                                setFlyingArmor(prev => prev.filter(a => a.id !== animId));
                            }
                        }, 1000);
                    }
                }
                
                if (Math.abs(currentPos - (zone.start + zone.width/2)) <= (zone.width * 0.1)) { if (Math.random() > 0.3) isCritical = true; else critFailed = true; }
                break; 
            }
        }
        let dmg = 0;
        if (hitEnemyId && hitAlignment) {
            if (armorHitIndex !== undefined) {
                setResultMessage(strings.armor_hit || "ARMOR!");
            } else {
                const activeDamage = firingHand === 'akimbo' && akimboWeaponDamage ? akimboWeaponDamage : weaponDamage;
                dmg = rollDice(activeDamage); if (isCritical) { dmg *= 2; setResultMessage(strings.crit); } else setResultMessage(strings.hit);
            }
        } else {
            if (Object.keys(enemyHitZones).length === 0 && enemies.length > 0) {
                setResultMessage(strings.out_of_range || "OUT OF RANGE");
            } else {
                setResultMessage(strings.miss);
            }
        }
        
        const hasNextAkimbo = onPlayerAttack(hitEnemyId, dmg, isCritical, critFailed, false, armorHitIndex); 
        isAkimboFollowupRef.current = hasNextAkimbo;
        
        pausedRef.current = false;
        
        setTimeout(() => {
            if (mountedRef.current && Date.now() - lastFireTime.current >= 250) {
                setResultMessage("");
            }
        }, 300);
        
    } else if (actionType === 'RELOAD') {
        isAkimboFollowupRef.current = false;
        // Use current dynamic values for hit detection
        const currentWidth = reloadWidthRef.current;
        const currentStart = reloadCenterRef.current - (currentWidth / 2);
        const isSuccess = currentPos >= currentStart && currentPos <= (currentStart + currentWidth);
        
        setResultMessage(isSuccess ? strings.reload_success : strings.reload_fail);
        setTimeout(() => { onReload(!!isSuccess); setTimeout(() => { if (mountedRef.current) { setResultMessage(""); setMode('ATTACK'); pausedRef.current = false; } }, 300); }, 500);
    } else {
        isAkimboFollowupRef.current = false;
        const isSuccess = escapeZone && currentPos >= escapeZone.start && currentPos <= (escapeZone.start + escapeZone.width);
        setResultMessage(isSuccess ? strings.escape_success : strings.escape_fail_msg);
        setTimeout(() => { onEscape(!!isSuccess); setTimeout(() => { if (mountedRef.current) { setResultMessage(""); if (!isSuccess) setMode('ATTACK'); pausedRef.current = false; } }, 500); }, 500);
    }
  };

  const renderUIElements = () => {
      let diff = playerDir - playerDir360;
      while (diff > 2) diff -= 4; 
      while (diff < -2) diff += 4;
      const visualShift = diff * 80;

      return (Object.values(closestEnemiesByAlignment) as EnemyData[]).map(enemy => {
          const isAttacking = activeAttackerId === enemy.id;
          const enemyFloaters = damageFloaters.filter(d => d.enemyId === enemy.id);
          const distanceUnit = strings?.dist_unit_1 === "meter" ? "m" : "м";

          return (
              <EnemyFloater 
                  key={enemy.id} 
                  enemy={enemy} 
                  visualShift={visualShift} 
                  isAttacking={isAttacking} 
                  damageFloaters={enemyFloaters} 
                  statusStunnedText={strings?.status_stunned || "ОГЛУШЕНИЕ"}
                  distanceUnit={distanceUnit}
                  scale={viewportScale}
              />
          );
      });
  };

  const hasAmmoProp = currentAmmo !== undefined || akimboAmmo !== undefined;
  const totalCurrentAmmo = (currentAmmo || 0) + (akimboAmmo || 0);
  const isOutOfAmmo = hasAmmoProp && totalCurrentAmmo === 0 && (totalAmmo || 0) === 0;
  
  const mainCanFire = (!isWeaponBroken) && (currentAmmo === undefined || currentAmmo > 0);
  const akimboCanFire = (!isAkimboWeaponBroken) && (akimboAmmo === undefined || akimboAmmo > 0);
  const neitherCanFire = !mainCanFire && !(hasAkimboWeapon ? akimboCanFire : false);
  
  const needsReload = (currentAmmo === 0 && !isWeaponBroken) || (hasAkimboWeapon && akimboAmmo === 0 && !isAkimboWeaponBroken);
  const showReloadButton = hasAmmoProp && needsReload && (totalAmmo || 0) > 0 && neitherCanFire;
  
  const isAttackDisabled = isProcessingTurn || isOutOfAmmo || (mode === 'ATTACK' && neitherCanFire && !showReloadButton);
  const portalTarget = document.getElementById('combat-actions-slot');

  const latestHandleAction = useRef(handleAction);
  latestHandleAction.current = handleAction;
  
  const isAttackDisabledRef = useRef(isAttackDisabled);
  isAttackDisabledRef.current = isAttackDisabled;
  const isOutOfAmmoRef = useRef(isOutOfAmmo);
  isOutOfAmmoRef.current = isOutOfAmmo;
  const showReloadButtonRef = useRef(showReloadButton);
  showReloadButtonRef.current = showReloadButton;
  const isProcessingTurnRef = useRef(isProcessingTurn);
  isProcessingTurnRef.current = isProcessingTurn;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    const handleViewportBtn = (e: CustomEvent | Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      
      if (isPausedRef.current || isProcessingTurnRef.current) return;
      
      const mappedBtn = invertContextButtons 
        ? (detail.btn === 'left' ? 'right' : 'left')
        : detail.btn;

      if (mappedBtn === 'left') {
        if (detail.state === 'down') {
           if (mode === 'ESCAPE') {
              setMode('ATTACK');
           } else if (!isAttackDisabledRef.current) {
              const totalCurrentAmmoRef = (currentAmmoRef.current || 0) + (akimboAmmoRef.current || 0);
              if ((totalCurrentAmmoRef === 0 || showReloadButtonRef.current) && mode !== 'RELOAD' && (totalAmmo || 0) > 0) {
                 setMode('RELOAD');
              } else {
                 const action = mode === 'RELOAD' ? 'RELOAD' : 'ATTACK';
                 if (weaponShootType === 'auto' && action === 'ATTACK') {
                    isHoldingFireRef.current = true;
                    const fireLoop = () => {
                       if (!isHoldingFireRef.current || isProcessingTurnRef.current || isPausedRef.current || isAttackDisabledRef.current || (isOutOfAmmoRef.current && !showReloadButtonRef.current)) return;
                       latestHandleAction.current('ATTACK');
                       autoFireIntervalRef.current = setTimeout(fireLoop, 50);
                    };
                    fireLoop();
                 } else {
                    latestHandleAction.current(action);
                 }
              }
           } else if (mode === 'ATTACK' && (isOutOfAmmoRef.current || neitherCanFire || isWeaponBroken)) {
              if (playSound) playSound('SYS_GUN_CLICK');
           }
        } else if (detail.state === 'up') {
           stopAutoFire();
        }
      } else if (mappedBtn === 'right' && detail.state === 'down') {
        if (mode === 'RELOAD') {
           setMode('ATTACK');
        } else if (!escapeBlocked) {
           if (mode !== 'ESCAPE') setMode('ESCAPE');
           else latestHandleAction.current('ESCAPE');
        }
      }
    };
    window.addEventListener('viewport-btn', handleViewportBtn);
    return () => window.removeEventListener('viewport-btn', handleViewportBtn);
  }, [mode, totalAmmo, neitherCanFire, isWeaponBroken, escapeBlocked, weaponShootType, playSound, invertContextButtons]);

  const bottomUI = (() => {
    const attackButton = (
                <button 
                    id={invertContextButtons ? "combat-right-btn" : "combat-left-btn"}
                    data-no-click-sound="true"
                    onPointerDown={(e) => { 
                        e.preventDefault(); 
                        e.currentTarget.style.transform = 'scale(0.95)';
                        e.currentTarget.style.filter = 'brightness(0.8)';
                        setTimeout(() => {
                            if (mode === 'ESCAPE') {
                                setMode('ATTACK');
                                return;
                            }
                            if (!isAttackDisabled) { 
                                if ((totalCurrentAmmo === 0 || showReloadButton) && mode !== 'RELOAD' && (totalAmmo || 0) > 0) {
                                    setMode('RELOAD'); 
                                } else {
                                    const action = mode === 'RELOAD' ? 'RELOAD' : 'ATTACK';
                                    if (weaponShootType === 'auto' && action === 'ATTACK') {
                                        isHoldingFireRef.current = true;
                                        const fireLoop = () => {
                                            if (!isHoldingFireRef.current || isProcessingTurnRef.current || isPausedRef.current || isAttackDisabledRef.current || (isOutOfAmmoRef.current && !showReloadButtonRef.current)) return;
                                            latestHandleAction.current('ATTACK');
                                            autoFireIntervalRef.current = setTimeout(fireLoop, 50);
                                        };
                                        fireLoop();
                                    } else {
                                        handleAction(action); 
                                    }
                                }
                            } else if (!isProcessingTurn && mode === 'ATTACK' && (isOutOfAmmo || neitherCanFire || isWeaponBroken)) {
                                if (playSound) playSound('SYS_GUN_CLICK');
                            }
                        }, 0);
                    }} 
                    onPointerUp={(e) => {
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.filter = '';
                        stopAutoFire();
                    }}
                    onPointerLeave={(e) => {
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.filter = '';
                        stopAutoFire();
                    }}
                    disabled={pausedRef.current || isProcessingTurn || (mode !== 'ESCAPE' && !showReloadButton && isAttackDisabled && !(isOutOfAmmo || neitherCanFire))} 
                    className={`${mode === 'ESCAPE' ? 'bg-gray-800 border-gray-600 text-gray-300' : showReloadButton || mode === 'RELOAD' ? 'bg-cyan-900 border-cyan-500 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-[#450a0a] border-red-900 text-red-200 shadow-lg'} bg-gradient-to-b from-opacity-50 border font-bold py-3 rounded flex flex-row items-center justify-center gap-2 transition-all ${(pausedRef.current || isProcessingTurn || (mode !== 'ESCAPE' && isAttackDisabled)) ? 'opacity-30 grayscale cursor-not-allowed' : ''} w-full touch-manipulation cursor-pointer`} 
                >
                    {mode === 'ESCAPE' ? <Ban size={16} /> : showReloadButton || mode === 'RELOAD' ? <RotateCcw size={16} /> : <Crosshair size={16} />}
                    <span className={mode === 'ESCAPE' ? 'text-xs' : 'tracking-widest text-xs uppercase'}>{mode === 'ESCAPE' ? strings.btn_cancel : (showReloadButton || mode === 'RELOAD') ? strings.btn_reload : strings.btn_fire}</span>
                </button>
    );

    const escapeButton = (
                <button 
                    id={invertContextButtons ? "combat-left-btn" : "combat-right-btn"}
                    data-no-click-sound="true"
                    onPointerDown={(e) => { 
                        e.preventDefault(); 
                        e.currentTarget.style.transform = 'scale(0.95)';
                        e.currentTarget.style.filter = 'brightness(0.8)';
                        setTimeout(() => {
                            if (mode === 'RELOAD') {
                                setMode('ATTACK');
                                return;
                            }
                            if (!isProcessingTurn && !escapeBlocked) { 
                                if (mode !== 'ESCAPE') setMode('ESCAPE'); 
                                else handleAction('ESCAPE'); 
                            } 
                        }, 0);
                    }} 
                    onPointerUp={(e) => {
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.filter = '';
                    }}
                    onPointerLeave={(e) => {
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.filter = '';
                    }}
                    disabled={pausedRef.current || isProcessingTurn || (mode !== 'RELOAD' && escapeBlocked)} 
                    className={`bg-gray-800 border border-gray-600 text-gray-300 font-bold py-3 rounded flex flex-row items-center justify-center gap-2 transition-transform w-full touch-manipulation cursor-pointer ${pausedRef.current || isProcessingTurn || (mode !== 'RELOAD' && escapeBlocked) ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
                >
                    {mode === 'RELOAD' ? (
                        <><Ban size={16} className="shrink-0" /><span className="text-xs uppercase">{strings.btn_cancel}</span></>
                    ) : mode !== 'ESCAPE' ? (
                        <><Footprints size={16} className="shrink-0" /><span className="text-xs uppercase">{strings.btn_escape}</span></>
                    ) : (
                        <><ChevronsRight size={16} className="animate-pulse shrink-0" /><span className="text-xs text-green-400 font-black tracking-widest">{strings.btn_run}</span></>
                    )}
                </button>
    );

    return (
      <div 
        className={`bg-black/95 border-t border-red-950/40 p-1 pointer-events-auto flex flex-col gap-1 pb-1 transition-opacity duration-300 ${!isPaused ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => e.stopPropagation()}
        onPointerMove={e => e.stopPropagation()}
        onPointerLeave={e => e.stopPropagation()}
      >
            <div className="grid grid-cols-2 gap-2">
                {invertContextButtons ? escapeButton : attackButton}
                {invertContextButtons ? attackButton : escapeButton}
            </div>
      </div>
    );
  })();

  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 z-10 w-full h-full">
           {crtEffect && <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[20] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-100 will-change-transform [transform:translate3d(0,0,0)] [backface-visibility:hidden]"></div>}
      </div>
      <div className={`absolute top-0 left-0 right-0 z-[50] w-full p-4 pointer-events-none transition-opacity duration-300 ${isPaused ? 'opacity-50' : 'opacity-100'}`}><div className="flex justify-center w-full min-h-[4rem] items-center">{resultMessage && <div className={`text-4xl font-black italic uppercase tracking-tighter animate-bounce drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] ${resultMessage === strings.miss || resultMessage === "EMPTY!" || resultMessage === strings.reload_fail || resultMessage === strings.escape_fail_msg || resultMessage === strings.out_of_range || resultMessage === "OUT OF RANGE" ? 'text-gray-400' : 'text-gray-100'}`}>{resultMessage}</div>}</div></div>
      
      <div className="absolute inset-0 z-[55] pointer-events-none">{renderUIElements()}</div>
      
      <div className={`absolute bottom-0 left-0 right-0 w-full z-[60] transition-opacity duration-300 ${!isPaused ? 'opacity-100' : 'opacity-0'}`}>
        <div className="relative w-full">
          {isProcessingTurn ? <div className="relative bg-[#1a0505] border-t border-[#450a0a] w-full flex items-center justify-center overflow-hidden shadow-[0_-4px_15px_rgba(0,0,0,0.8)]" style={{ height: `${1.5 * viewportScale}rem` }}><div className="absolute inset-0 bg-red-950/20 animate-pulse"></div><span className="text-red-800 font-mono text-[10px] animate-pulse tracking-[0.3em] uppercase font-bold relative z-10" style={{ fontSize: `${10 * viewportScale}px` }}>{totalCombatants > 1 ? strings.enemy_turn_plural : strings.enemy_turn}</span></div> : <div className={`relative bg-gray-900 border-t border-gray-700 w-full overflow-hidden shadow-[0_-4px_15px_rgba(0,0,0,0.8)] touch-none ${isDebugMode ? 'cursor-default' : 'cursor-pointer'}`} style={{ height: `${1.5 * viewportScale}rem` }} onPointerDown={isDebugMode ? undefined : () => handleAction(mode)}><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:12px_12px]"></div>{mode === 'ATTACK' && (isDebugMode || !hasAmmoProp || totalCurrentAmmo > 0) && enemies.map((enemy, idx) => { const zone = enemyHitZones[enemy.id]; if (!zone) return null; const armorCount = enemy.armor || 0; const brokenArmor = enemy.brokenArmor || []; return <div key={`${enemy.id}_${idx}`} className="absolute top-0 bottom-0" style={{ left: `${zone.start}%`, width: `${zone.width}%` }}><div className="absolute inset-0 bg-[rgba(150,0,0,0.6)] border-x border-[rgba(200,0,0,0.7)] shadow-[0_0_10px_rgba(100,0,0,0.2)] animate-pulse"><div className="absolute top-0 bottom-0 left-1/2 w-[20%] bg-white/60 border-x border-white/40 shadow-[0_0_15px_white/30] -translate-x-1/2 z-10"></div></div>{armorCount > 0 && Array.from({ length: armorCount }).map((_, i) => { if (brokenArmor.includes(i)) return null; return <div key={`armor_${i}`} id={`armor-${enemy.id}-${i}`} className="absolute top-0 bottom-0 z-20 pointer-events-auto bg-gray-900" style={{ left: `${i * (100 / armorCount)}%`, width: `calc(${100 / armorCount}% + 1px)` }}><div className="absolute inset-0 bg-slate-700 animate-pulse"></div></div>; })}</div>; })}{mode === 'ESCAPE' && escapeZone && <div className="absolute top-0 bottom-0 bg-green-800/60 border-x border-green-700 animate-pulse" style={{ left: `${escapeZone.start}%`, width: `${escapeZone.width}%` }}><div className="absolute inset-x-0 top-1/2 h-[1px] bg-green-700/40 -translate-y-1/2"></div></div>}{mode === 'RELOAD' && reloadZone && <div ref={reloadZoneDivRef} className="absolute top-0 bottom-0 bg-cyan-800/60 border-x-2 border-cyan-300" style={{ left: `${reloadZone.start}%`, width: `${reloadZone.width}%` }}></div>}{!isDebugMode && <div ref={sliderRef} className="absolute inset-x-0 top-0 bottom-0 pointer-events-none will-change-transform z-[60]" style={{ transform: `translate3d(${barPosRef.current}%, 0, 0)` }}><div className="absolute top-0 bottom-0 left-0 w-[4px] bg-cyan-300 shadow-[0_0_20px_cyan] z-50 transform -translate-x-1/2"><div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-cyan-100 rounded-tl"></div><div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-cyan-100 rounded-br"></div></div></div>}</div>}
          {flyingArmor.map(a => (
              <div key={a.id} className="absolute top-0 bottom-0 z-[70] armor-break-anim" style={{ left: `${a.zoneStart + a.hitIndex * (a.zoneWidth / a.armorCount)}%`, width: `${a.zoneWidth / a.armorCount}%`, height: `${1.5 * viewportScale}rem`, '--dx': a.dx, '--dy': a.dy, '--dr': a.dr } as React.CSSProperties}>
                  <div className="absolute inset-0 bg-slate-700"></div>
              </div>
          ))}
        </div>
      </div>
      {!isDebugMode && enemies.length === 0 && !isProcessingTurn && mode !== 'ESCAPE' && mode !== 'RELOAD' && <div className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-none"><div className="bg-black/95 py-2 px-8 border-y-2 border-red-900 text-red-800 font-bold text-lg tracking-widest animate-pulse flex flex-row items-center gap-4 shadow-[0_0_40px_rgba(153,27,27,0.3)]"><EyeOff size={24} />{strings.target_lost}</div></div>}
      {mode === 'ESCAPE' && escapeBlocked && !isProcessingTurn && <div className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-none"><div className="bg-black/95 py-2 px-8 border-y-2 border-red-900 text-red-800 font-bold text-lg tracking-widest animate-pulse flex flex-row items-center gap-4 shadow-[0_0_40px_rgba(153,27,27,0.3)]"><Footprints size={24} />{strings.nowhere_to_run}</div></div>}
      {!isDebugMode && portalTarget && createPortal(bottomUI, portalTarget)}
    </div>
  );
};

export default React.memo(CombatOverlay);
