
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Item, AnimationFrame, AnimationDefinition, GameState } from '../types';
import { getWeaponSprite, getWeaponSpriteWithMuzzle } from '../utils/getWeaponSprite';

interface WeaponAnimationState {
  x: number;
  y: number;
  scale: number;
  rotate: number; // Added rotation for sway effect
  attackElapsed?: number; // Added for attack animation tracking
  spriteElapsed?: number; // Added for sprite animation tracking
}

const TRANSITION_DURATION = 250; // ms
const TRANSITION_OFFSET = 400; // px down

export const useWeaponAnimation = (
  equippedWeapon: Item | null, 
  equippedAkimboWeapon: Item | null = null,
  animations: Record<string, AnimationDefinition> = {},
  characterId: string = 'male',
  spriteMap: Map<string, HTMLImageElement> = new Map(),
  gameState: GameState, // Injecting GameState
  cinematicMode: boolean = false, // Injecting cinematicMode to update hands after scripted scenes
  activeModal: string | null = null,
  onMuzzleFlash?: () => void
) => {
  const isSyncBlocked = activeModal === 'equipment' || activeModal === 'inventory';

  const onMuzzleFlashRef = useRef(onMuzzleFlash);
  useEffect(() => {
    onMuzzleFlashRef.current = onMuzzleFlash;
  }, [onMuzzleFlash]);

  // Controls which weapon is actually visible (allows showing old weapon during holster anim)
  const [displayedWeapon, setDisplayedWeapon] = useState<Item | null>(equippedWeapon);
  const [displayedAkimboWeapon, setDisplayedAkimboWeapon] = useState<Item | null>(equippedAkimboWeapon);
  
  const mainHandContainerRef = useRef<HTMLDivElement>(null);
  const akimboHandContainerRef = useRef<HTMLDivElement>(null);
  const mainHandImgRef = useRef<HTMLImageElement>(null);
  const mainHandImgShadowRef = useRef<HTMLImageElement>(null);
  const mainMuzzleImgRef = useRef<HTMLImageElement>(null);
  const akimboHandImgRef = useRef<HTMLImageElement>(null);
  const akimboHandImgShadowRef = useRef<HTMLImageElement>(null);
  const akimboMuzzleImgRef = useRef<HTMLImageElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const consoleContainerRef = useRef<HTMLDivElement>(null);

  const viewportScaleRef = useRef(1);
  const displayedWeaponRef = useRef<Item | null>(equippedWeapon);
  const displayedAkimboWeaponRef = useRef<Item | null>(equippedAkimboWeapon);

  useEffect(() => {
      displayedWeaponRef.current = displayedWeapon;
  }, [displayedWeapon]);

  useEffect(() => {
      displayedAkimboWeaponRef.current = displayedAkimboWeapon;
  }, [displayedAkimboWeapon]);
  
  const spriteMapRef = useRef(spriteMap);
  useEffect(() => {
      spriteMapRef.current = spriteMap;
  }, [spriteMap]);

  const animationsRef = useRef(animations);
  useEffect(() => {
      animationsRef.current = animations;
  }, [animations]);

  const characterIdRef = useRef(characterId);
  useEffect(() => {
      characterIdRef.current = characterId;
  }, [characterId]);

  // Transition State
  const transitionStateRef = useRef<'IDLE' | 'HOLSTERING' | 'EQUIPPING'>('IDLE');
  const transitionStartTimeRef = useRef<number>(0);
  const transitionYRef = useRef<number>(0); // Separate ref for smooth transition logic
  const isSwappingRef = useRef<boolean>(false); // Lock to prevent auto-updates during swap sequence

  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  
  // Attack State
  const activeSequenceMainRef = useRef<AnimationFrame[] | null>(null);
  const attackStartTimeMainRef = useRef<number | undefined>(undefined);
  const spriteStartTimeMainRef = useRef<number | undefined>(undefined);
  const spriteDurationMainRef = useRef<number>(1000);
  const muzzleFiredMainRef = useRef<boolean>(false);
  
  const activeSequenceAkimboRef = useRef<AnimationFrame[] | null>(null);
  const attackStartTimeAkimboRef = useRef<number | undefined>(undefined);
  const spriteStartTimeAkimboRef = useRef<number | undefined>(undefined);
  const spriteDurationAkimboRef = useRef<number>(1000);
  const muzzleFiredAkimboRef = useRef<boolean>(false);

  // Sway State
  const swayActiveRef = useRef<boolean>(false);
  const swayStartTimeRef = useRef<number | undefined>(undefined);
  const SWAY_DURATION = 500; // ms - Slower for smoother feel

  // Cached DOM transform & sprite state to avoid layout thrashing and GC overhead
  const lastMainTransformRef = useRef<string>('');
  const lastAkimboTransformRef = useRef<string>('');
  const lastMainSpriteRef = useRef<HTMLImageElement | null>(null);
  const lastAkimboSpriteRef = useRef<HTMLImageElement | null>(null);
  const lastMainMuzzleSpriteRef = useRef<HTMLImageElement | null>(null);
  const lastAkimboMuzzleSpriteRef = useRef<HTMLImageElement | null>(null);

  // Sync state instantly during render if we are not in a swap sequence to prevent 1-frame visual lag on scale, offsets and sprites
  if (!isSwappingRef.current && !isSyncBlocked) {
      if (displayedWeapon !== equippedWeapon) {
          const idChanged = displayedWeapon?.id !== equippedWeapon?.id;
          setDisplayedWeapon(equippedWeapon);
          displayedWeaponRef.current = equippedWeapon;
          if (idChanged) {
              activeSequenceMainRef.current = null;
              attackStartTimeMainRef.current = undefined;
              spriteStartTimeMainRef.current = undefined;
          }
      }
      if (displayedAkimboWeapon !== equippedAkimboWeapon) {
          const idChanged = displayedAkimboWeapon?.id !== equippedAkimboWeapon?.id;
          setDisplayedAkimboWeapon(equippedAkimboWeapon);
          displayedAkimboWeaponRef.current = equippedAkimboWeapon;
          if (idChanged) {
              activeSequenceAkimboRef.current = null;
              attackStartTimeAkimboRef.current = undefined;
              spriteStartTimeAkimboRef.current = undefined;
          }
      }
  }

  const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;
  const easeInQuad = (t: number) => t * t;
  const easeOutBack = (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  const predecodeWeaponSprites = useCallback((weapon: Item | null) => {
      if (!weapon) return;
      const attackAssetId = weapon.attackAssetId || (weapon as any).attackAsset;
      const attackFemaleAssetId = weapon.attackFemaleAssetId || (weapon as any).attackAssetFemale;
      
      const assetsToDecode = new Set<string>();
      
      // Добавляем обычные спрайты рук для predecode
      const handAssetId = weapon.handAssetId || (weapon as any).handAsset;
      const handFemaleAssetId = weapon.handFemaleAssetId || (weapon as any).handFemaleAsset;
      if (handAssetId) assetsToDecode.add(handAssetId);
      if (handFemaleAssetId) assetsToDecode.add(handFemaleAssetId);
      
      // Добавляем спрайты выстрела/атаки
      [attackAssetId, attackFemaleAssetId].forEach(assetId => {
          if (assetId) {
              const animDef = animationsRef.current[assetId];
              if (animDef && animDef.frames) {
                  animDef.frames.forEach((f: string) => assetsToDecode.add(f));
              } else {
                  assetsToDecode.add(assetId);
              }
          }
      });

      // Добавляем спрайты вспышки
      const muzzleAssetId = weapon.muzzleAsset || (weapon as any).muzzleAssetId;
      const muzzleFemaleAssetId = weapon.muzzleFemaleAsset || (weapon as any).muzzleFemaleAssetId;
      if (muzzleAssetId) assetsToDecode.add(muzzleAssetId);
      if (muzzleFemaleAssetId) assetsToDecode.add(muzzleFemaleAssetId);
      
      assetsToDecode.forEach(key => {
          const spriteImg = spriteMapRef.current.get(key);
          if (spriteImg && spriteImg.src) {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.src = spriteImg.src;
              if (typeof img.decode === 'function') {
                  img.decode().catch(() => {});
              }
          }
      });
  }, []);

  const animate = useCallback((time: number) => {
    if (lastTimeRef.current === undefined) lastTimeRef.current = time;
    
    // --- 0. Transition Logic (Global Vertical Offset) ---
    let transY = 0;
    let isTransitioning = false;

    if (transitionStateRef.current !== 'IDLE') {
        isTransitioning = true;
        if (transitionStartTimeRef.current === -1) {
            transitionStartTimeRef.current = time;
        }
        const elapsed = time - transitionStartTimeRef.current;
        const t = Math.min(1, Math.max(0, elapsed / TRANSITION_DURATION));

        if (transitionStateRef.current === 'HOLSTERING') {
            const ease = easeInQuad(t);
            transY = lerp(0, TRANSITION_OFFSET, ease);
            if (t >= 1) {
                transY = TRANSITION_OFFSET;
                if (!isSwappingRef.current) {
                    isTransitioning = false; 
                }
            }
        } else if (transitionStateRef.current === 'EQUIPPING') {
            const ease = easeOutBack(t);
            transY = lerp(TRANSITION_OFFSET, 0, ease);
            if (t >= 1) {
                transitionStateRef.current = 'IDLE';
                transY = 0;
                isTransitioning = false;
                isSwappingRef.current = false;
            }
        }
    } else {
        transY = 0;
    }
    transitionYRef.current = transY;

    // --- 1. Calculate Attack State (Main) ---
    let attackXMain = 0;
    let attackYMain = 0;
    let attackScaleMain = 1;
    let attackActiveMain = false;
    let spriteActiveMain = false;

    if (spriteStartTimeMainRef.current !== undefined) {
        if (spriteStartTimeMainRef.current === -1) {
            spriteStartTimeMainRef.current = time;
        }
        const elapsed = time - spriteStartTimeMainRef.current;
        if (elapsed < spriteDurationMainRef.current) {
            spriteActiveMain = true;
        } else {
            spriteStartTimeMainRef.current = undefined;
        }
    }

    if (activeSequenceMainRef.current && transY < 100) {
        if (attackStartTimeMainRef.current === undefined) {
            attackStartTimeMainRef.current = time;
        }
        const elapsed = time - attackStartTimeMainRef.current;
        let cumulativeTime = 0;
        let foundFrame = false;
        let prevFrame: AnimationFrame = { duration: 0, x: 0, y: 0, scale: 1 };

        for (const frame of activeSequenceMainRef.current) {
            const frameDuration = frame.duration || (frame as any).time || 0;
            if (elapsed < cumulativeTime + frameDuration) {
                const frameElapsed = elapsed - cumulativeTime;
                const t = frameDuration > 0 ? frameElapsed / frameDuration : 1;
                const easeT = t * (2 - t);

                attackXMain = lerp(prevFrame.x, frame.x, easeT);
                attackYMain = lerp(prevFrame.y, frame.y, easeT);
                attackScaleMain = lerp(prevFrame.scale ?? 1, frame.scale ?? 1, easeT);
                
                foundFrame = true;
                break;
            }
            cumulativeTime += frameDuration;
            prevFrame = frame;
        }

        if (foundFrame) {
            attackActiveMain = true;
        } else {
            activeSequenceMainRef.current = null;
            attackStartTimeMainRef.current = undefined;
        }
    }

    // --- 1.5 Calculate Attack State (Akimbo) ---
    let attackXAkimbo = 0;
    let attackYAkimbo = 0;
    let attackScaleAkimbo = 1;
    let attackActiveAkimbo = false;
    let spriteActiveAkimbo = false;

    if (spriteStartTimeAkimboRef.current !== undefined) {
        if (spriteStartTimeAkimboRef.current === -1) {
            spriteStartTimeAkimboRef.current = time;
        }
        const elapsed = time - spriteStartTimeAkimboRef.current;
        if (elapsed < spriteDurationAkimboRef.current) {
            spriteActiveAkimbo = true;
        } else {
            spriteStartTimeAkimboRef.current = undefined;
        }
    }

    if (activeSequenceAkimboRef.current && transY < 100) {
        if (attackStartTimeAkimboRef.current === undefined) attackStartTimeAkimboRef.current = time;
        const elapsed = time - attackStartTimeAkimboRef.current;
        let cumulativeTime = 0;
        let foundFrame = false;
        let prevFrame: AnimationFrame = { duration: 0, x: 0, y: 0, scale: 1 };

        for (const frame of activeSequenceAkimboRef.current) {
            const frameDuration = frame.duration || (frame as any).time || 0;
            if (elapsed < cumulativeTime + frameDuration) {
                const frameElapsed = elapsed - cumulativeTime;
                const t = frameDuration > 0 ? frameElapsed / frameDuration : 1;
                const easeT = t * (2 - t);

                attackXAkimbo = lerp(prevFrame.x, frame.x, easeT);
                attackYAkimbo = lerp(prevFrame.y, frame.y, easeT);
                attackScaleAkimbo = lerp(prevFrame.scale ?? 1, frame.scale ?? 1, easeT);
                
                foundFrame = true;
                break;
            }
            cumulativeTime += frameDuration;
            prevFrame = frame;
        }

        if (foundFrame) {
            attackActiveAkimbo = true;
        } else {
            activeSequenceAkimboRef.current = null;
            attackStartTimeAkimboRef.current = undefined;
        }
    }

    // --- 2. Calculate Sway State ---
    let swayX = 0;
    let swayY = 0;
    let swayRotate = 0;

    if (swayActiveRef.current && transY < 100) {
        if (swayStartTimeRef.current === undefined) swayStartTimeRef.current = time;
        const elapsed = time - swayStartTimeRef.current;
        
        if (elapsed < SWAY_DURATION) {
            const t = elapsed / SWAY_DURATION;
            const bobAmt = Math.sin(t * Math.PI);
            swayY = bobAmt * 8;
            const wiggleAmt = Math.sin(t * Math.PI * 2);
            swayX = wiggleAmt * -3;
            swayRotate = wiggleAmt * -1.5;
        } else {
             swayActiveRef.current = false;
             swayStartTimeRef.current = undefined;
        }
    }

    // --- 3. Combine States ---
    const attackElapsedMain = attackStartTimeMainRef.current !== undefined && attackStartTimeMainRef.current !== -1 ? time - attackStartTimeMainRef.current : undefined;
    const spriteElapsedMain = spriteStartTimeMainRef.current !== undefined && spriteStartTimeMainRef.current !== -1 ? time - spriteStartTimeMainRef.current : undefined;
    const attackElapsedAkimbo = attackStartTimeAkimboRef.current !== undefined && attackStartTimeAkimboRef.current !== -1 ? time - attackStartTimeAkimboRef.current : undefined;
    const spriteElapsedAkimbo = spriteStartTimeAkimboRef.current !== undefined && spriteStartTimeAkimboRef.current !== -1 ? time - spriteStartTimeAkimboRef.current : undefined;

    const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
    const finalScale = baseScale * attackScaleMain;
    
    const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
    const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;

    const mainTransform = `translate(${offsetX + (attackXMain + swayX) * viewportScaleRef.current}px, ${offsetY + (attackYMain + swayY + transY) * viewportScaleRef.current}px) scale(${finalScale}) rotate(${swayRotate}deg)`;
    if (mainTransform !== lastMainTransformRef.current) {
        lastMainTransformRef.current = mainTransform;
        if (mainHandContainerRef.current) mainHandContainerRef.current.style.transform = mainTransform;
        if (mapContainerRef.current) mapContainerRef.current.style.transform = mainTransform;
        if (consoleContainerRef.current) consoleContainerRef.current.style.transform = mainTransform;
    }

    const akimboBaseScale = displayedAkimboWeaponRef.current?.handScale ?? 1.0;
    const akimboFinalScale = akimboBaseScale * attackScaleAkimbo;
    
    const akimboOffsetX = (displayedAkimboWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
    const akimboOffsetY = (displayedAkimboWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;

    const akimboTransform = `translate(${-akimboOffsetX - (attackXAkimbo + swayX) * viewportScaleRef.current}px, ${akimboOffsetY + (attackYAkimbo + swayY + transY) * viewportScaleRef.current}px) scale(${akimboFinalScale}) rotate(${-swayRotate}deg)`;
    if (akimboTransform !== lastAkimboTransformRef.current) {
        lastAkimboTransformRef.current = akimboTransform;
        if (akimboHandContainerRef.current) akimboHandContainerRef.current.style.transform = akimboTransform;
    }

    // Update sprites (handle sentinel value safely)
    const safeSpriteElapsedMain = (spriteStartTimeMainRef.current !== undefined && spriteStartTimeMainRef.current !== -1) ? time - spriteStartTimeMainRef.current : undefined;
    const safeSpriteElapsedAkimbo = (spriteStartTimeAkimboRef.current !== undefined && spriteStartTimeAkimboRef.current !== -1) ? time - spriteStartTimeAkimboRef.current : undefined;

    const { sprite: mainSprite, muzzleSprite: mainMuzzleSprite, isMuzzleFrame: isMainMuzzleFrame } = getWeaponSpriteWithMuzzle(displayedWeaponRef.current, safeSpriteElapsedMain, characterIdRef.current, animationsRef.current, spriteMapRef.current);
    if (mainSprite !== lastMainSpriteRef.current) {
        lastMainSpriteRef.current = mainSprite;
        if (mainSprite) {
            if (mainHandImgRef.current) mainHandImgRef.current.src = mainSprite.src;
            if (mainHandImgShadowRef.current) mainHandImgShadowRef.current.src = mainSprite.src;
        }
    }
    if (mainMuzzleSprite !== lastMainMuzzleSpriteRef.current) {
        lastMainMuzzleSpriteRef.current = mainMuzzleSprite;
        if (mainMuzzleImgRef.current) {
            if (mainMuzzleSprite) {
                mainMuzzleImgRef.current.src = mainMuzzleSprite.src;
                mainMuzzleImgRef.current.style.display = 'block';
            } else {
                mainMuzzleImgRef.current.style.display = 'none';
            }
        }
    }

    if (isMainMuzzleFrame && !muzzleFiredMainRef.current) {
        muzzleFiredMainRef.current = true;
        if (onMuzzleFlashRef.current) {
            onMuzzleFlashRef.current();
        }
    }

    const { sprite: akimboSprite, muzzleSprite: akimboMuzzleSprite, isMuzzleFrame: isAkimboMuzzleFrame } = getWeaponSpriteWithMuzzle(displayedAkimboWeaponRef.current, safeSpriteElapsedAkimbo, characterIdRef.current, animationsRef.current, spriteMapRef.current);
    if (akimboSprite !== lastAkimboSpriteRef.current) {
        lastAkimboSpriteRef.current = akimboSprite;
        if (akimboSprite) {
            if (akimboHandImgRef.current) akimboHandImgRef.current.src = akimboSprite.src;
            if (akimboHandImgShadowRef.current) akimboHandImgShadowRef.current.src = akimboSprite.src;
        }
    }
    if (akimboMuzzleSprite !== lastAkimboMuzzleSpriteRef.current) {
        lastAkimboMuzzleSpriteRef.current = akimboMuzzleSprite;
        if (akimboMuzzleImgRef.current) {
            if (akimboMuzzleSprite) {
                akimboMuzzleImgRef.current.src = akimboMuzzleSprite.src;
                akimboMuzzleImgRef.current.style.display = 'block';
            } else {
                akimboMuzzleImgRef.current.style.display = 'none';
            }
        }
    }

    if (isAkimboMuzzleFrame && !muzzleFiredAkimboRef.current) {
        muzzleFiredAkimboRef.current = true;
        if (onMuzzleFlashRef.current) {
            onMuzzleFlashRef.current();
        }
    }

    if (attackActiveMain || attackActiveAkimbo || spriteActiveMain || spriteActiveAkimbo || swayActiveRef.current || isTransitioning || transitionStateRef.current !== 'IDLE') {
        requestRef.current = requestAnimationFrame(animate);
    } else {
        requestRef.current = undefined;
        lastTimeRef.current = undefined;
    }

  }, []);

  const triggerWeaponAnimation = useCallback((hand: 'main' | 'akimbo' | 'both' = 'both') => {
      let started = false;
      const curWeapon = displayedWeaponRef.current;
      const curAkimbo = displayedAkimboWeaponRef.current;
      
      if (hand === 'main' || hand === 'both') {
          const attackAssetId = curWeapon?.attackAssetId || (curWeapon as any)?.attackAsset;
          const attackFemaleAssetId = curWeapon?.attackFemaleAssetId || (curWeapon as any)?.attackAssetFemale;
          
          if (curWeapon?.attackAnimation?.length) {
              activeSequenceMainRef.current = curWeapon.attackAnimation;
          } else if (attackAssetId) {
              activeSequenceMainRef.current = [{ duration: 500, x: 0, y: 0, scale: 1 }];
          } else {
              activeSequenceMainRef.current = [
                  { duration: 0, x: 0, y: 0, scale: 1 },
                  { duration: 100, x: 100, y: -50, scale: 1.2 },
                  { duration: 200, x: 0, y: 0, scale: 1 }
              ];
          }
          attackStartTimeMainRef.current = undefined;
          
          let spriteDuration = 1000;
          const attackAssetToUse = (characterIdRef.current === 'female' && attackFemaleAssetId) ? attackFemaleAssetId : attackAssetId;
          if (attackAssetToUse && animationsRef.current[attackAssetToUse]) {
              const animDef = animationsRef.current[attackAssetToUse];
              spriteDuration = (animDef.frames.length * 1000) / animDef.fps;
          }
          spriteDurationMainRef.current = spriteDuration;
          spriteStartTimeMainRef.current = -1;
          const mainMuzzleFrame = curWeapon?.muzzleFrame || 1;
          muzzleFiredMainRef.current = mainMuzzleFrame <= 1;
          started = true;
      }
      
      if (hand === 'akimbo' || hand === 'both') {
          const attackAssetId = curAkimbo?.attackAssetId || (curAkimbo as any)?.attackAsset;
          const attackFemaleAssetId = curAkimbo?.attackFemaleAssetId || (curAkimbo as any)?.attackAssetFemale;
          
          if (curAkimbo?.attackAnimation?.length) {
              activeSequenceAkimboRef.current = curAkimbo.attackAnimation;
          } else if (attackAssetId) {
              activeSequenceAkimboRef.current = [{ duration: 500, x: 0, y: 0, scale: 1 }];
          } else {
              activeSequenceAkimboRef.current = [
                  { duration: 0, x: 0, y: 0, scale: 1 },
                  { duration: 100, x: 100, y: -50, scale: 1.2 },
                  { duration: 200, x: 0, y: 0, scale: 1 }
              ];
          }
          attackStartTimeAkimboRef.current = undefined;
          
          let spriteDuration = 1000;
          const attackAssetToUse = (characterIdRef.current === 'female' && attackFemaleAssetId) ? attackFemaleAssetId : attackAssetId;
          if (attackAssetToUse && animationsRef.current[attackAssetToUse]) {
              const animDef = animationsRef.current[attackAssetToUse];
              spriteDuration = (animDef.frames.length * 1000) / animDef.fps;
          }
          spriteDurationAkimboRef.current = spriteDuration;
          spriteStartTimeAkimboRef.current = -1;
          const akimboMuzzleFrame = curAkimbo?.muzzleFrame || 1;
          muzzleFiredAkimboRef.current = akimboMuzzleFrame <= 1;
          started = true;
      }
      
      if (started && !requestRef.current) {
          requestRef.current = requestAnimationFrame(animate);
      }
  }, [animate]);

  const triggerSway = useCallback(() => {
      swayActiveRef.current = true;
      swayStartTimeRef.current = undefined; 
      
      if (!requestRef.current) {
          requestRef.current = requestAnimationFrame(animate);
      }
  }, [animate]);

  const triggerHolster = useCallback(() => {
      transitionStateRef.current = 'HOLSTERING';
      transitionStartTimeRef.current = -1;
      if (!requestRef.current) requestRef.current = requestAnimationFrame(animate);
      return TRANSITION_DURATION;
  }, [animate]);

  const triggerEquip = useCallback(() => {
      transitionStateRef.current = 'EQUIPPING';
      transitionStartTimeRef.current = -1;
      
      transitionYRef.current = TRANSITION_OFFSET; 
      
      if (mainHandContainerRef.current) {
          const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
          const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
          const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
          mainHandContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY + TRANSITION_OFFSET * viewportScaleRef.current}px) scale(${baseScale}) rotate(0deg)`;
      }
      if (mapContainerRef.current) {
          const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
          const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
          const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
          mapContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY + TRANSITION_OFFSET * viewportScaleRef.current}px) scale(${baseScale}) rotate(0deg)`;
      }
      if (consoleContainerRef.current) {
          const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
          const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
          const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
          consoleContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY + TRANSITION_OFFSET * viewportScaleRef.current}px) scale(${baseScale}) rotate(0deg)`;
      }
      if (akimboHandContainerRef.current) {
          const akimboBaseScale = displayedAkimboWeaponRef.current?.handScale ?? 1.0;
          const akimboOffsetX = (displayedAkimboWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
          const akimboOffsetY = (displayedAkimboWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
          akimboHandContainerRef.current.style.transform = `translate(${-akimboOffsetX}px, ${akimboOffsetY + TRANSITION_OFFSET * viewportScaleRef.current}px) scale(${akimboBaseScale}) rotate(0deg)`;
      }

      if (!requestRef.current) requestRef.current = requestAnimationFrame(animate);
      return TRANSITION_DURATION;
  }, [animate]);

  const triggerSwap = useCallback((oldWeapon: Item | null, newWeapon: Item | null, oldAkimbo: Item | null = null, newAkimbo: Item | null = null) => {
      isSwappingRef.current = true;
      
      // Предварительно загружаем новые спрайты, чтобы избежать задержек при их переключении
      if (newWeapon) {
          predecodeWeaponSprites(newWeapon);
      }
      if (newAkimbo) {
          predecodeWeaponSprites(newAkimbo);
      }
      
      if (!oldWeapon && !oldAkimbo) {
          const mainSprite = getWeaponSprite(newWeapon, undefined, characterIdRef.current, animationsRef.current, spriteMapRef.current);
          if (mainSprite) {
              if (mainHandImgRef.current) mainHandImgRef.current.src = mainSprite.src;
              if (mainHandImgShadowRef.current) mainHandImgShadowRef.current.src = mainSprite.src;
          }
          const akimboSprite = getWeaponSprite(newAkimbo, undefined, characterIdRef.current, animationsRef.current, spriteMapRef.current);
          if (akimboSprite) {
              if (akimboHandImgRef.current) akimboHandImgRef.current.src = akimboSprite.src;
              if (akimboHandImgShadowRef.current) akimboHandImgShadowRef.current.src = akimboSprite.src;
          }

          displayedWeaponRef.current = newWeapon;
          displayedAkimboWeaponRef.current = newAkimbo;
          setDisplayedWeapon(newWeapon);
          setDisplayedAkimboWeapon(newAkimbo);
          triggerEquip();
      } else {
          displayedWeaponRef.current = oldWeapon;
          displayedAkimboWeaponRef.current = oldAkimbo;
          setDisplayedWeapon(oldWeapon);
          setDisplayedAkimboWeapon(oldAkimbo);
          
          triggerHolster();

          setTimeout(() => {
              // Мгновенно обновляем src в DOM-элементах на нижней точке опускания оружия,
              // чтобы подъем оружия начинался уже с новым подготовленным спрайтом без задержки в 1 кадр
              const mainSprite = getWeaponSprite(newWeapon, undefined, characterIdRef.current, animationsRef.current, spriteMapRef.current);
              if (mainSprite) {
                  if (mainHandImgRef.current) mainHandImgRef.current.src = mainSprite.src;
                  if (mainHandImgShadowRef.current) mainHandImgShadowRef.current.src = mainSprite.src;
              }
              const akimboSprite = getWeaponSprite(newAkimbo, undefined, characterIdRef.current, animationsRef.current, spriteMapRef.current);
              if (akimboSprite) {
                  if (akimboHandImgRef.current) akimboHandImgRef.current.src = akimboSprite.src;
                  if (akimboHandImgShadowRef.current) akimboHandImgShadowRef.current.src = akimboSprite.src;
              }

              displayedWeaponRef.current = newWeapon;
              displayedAkimboWeaponRef.current = newAkimbo;
              setDisplayedWeapon(newWeapon);
              setDisplayedAkimboWeapon(newAkimbo);
              triggerEquip();
          }, TRANSITION_DURATION);
      }

  }, [triggerHolster, triggerEquip]);

  const resetAnimation = useCallback(() => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = undefined;
    activeSequenceMainRef.current = null;
    activeSequenceAkimboRef.current = null;
    swayActiveRef.current = false;
    attackStartTimeMainRef.current = undefined;
    attackStartTimeAkimboRef.current = undefined;
    spriteStartTimeMainRef.current = undefined;
    spriteStartTimeAkimboRef.current = undefined;
    swayStartTimeRef.current = undefined;
    transitionStateRef.current = 'IDLE';
    transitionYRef.current = 0;
    isSwappingRef.current = false;
    
    if (mainHandContainerRef.current) {
        const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
        const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
        const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
        mainHandContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${baseScale}) rotate(0deg)`;
    }
    if (mapContainerRef.current) {
        const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
        const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
        const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
        mapContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${baseScale}) rotate(0deg)`;
    }
    if (consoleContainerRef.current) {
        const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
        const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
        const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
        consoleContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${baseScale}) rotate(0deg)`;
    }
    if (akimboHandContainerRef.current) {
        const akimboBaseScale = displayedAkimboWeaponRef.current?.handScale ?? 1.0;
        const akimboOffsetX = (displayedAkimboWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
        const akimboOffsetY = (displayedAkimboWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
        akimboHandContainerRef.current.style.transform = `translate(${-akimboOffsetX}px, ${akimboOffsetY}px) scale(${akimboBaseScale}) rotate(0deg)`;
    }
  }, []);

  useEffect(() => {
      if (isSyncBlocked) return;
      if (!isSwappingRef.current) {
          displayedWeaponRef.current = equippedWeapon;
          displayedAkimboWeaponRef.current = equippedAkimboWeapon;
          setDisplayedWeapon(equippedWeapon);
          setDisplayedAkimboWeapon(equippedAkimboWeapon);
          activeSequenceMainRef.current = null;
          activeSequenceAkimboRef.current = null;
          attackStartTimeMainRef.current = undefined;
          attackStartTimeAkimboRef.current = undefined;
          spriteStartTimeMainRef.current = undefined;
          spriteStartTimeAkimboRef.current = undefined;
      }
      if (equippedWeapon) {
          predecodeWeaponSprites(equippedWeapon);
      }
      if (equippedAkimboWeapon) {
          predecodeWeaponSprites(equippedAkimboWeapon);
      }
  }, [equippedWeapon?.id, equippedAkimboWeapon?.id, predecodeWeaponSprites, isSyncBlocked]);

  // Запуск декодирования при обновлении карты спрайтов (после загрузки ассетов)
  useEffect(() => {
      if (equippedWeapon) {
          predecodeWeaponSprites(equippedWeapon);
      }
      if (equippedAkimboWeapon) {
          predecodeWeaponSprites(equippedAkimboWeapon);
      }
  }, [spriteMap, equippedWeapon, equippedAkimboWeapon, predecodeWeaponSprites]);

  useEffect(() => {
      return () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
  }, []);

  const [viewportScale, setViewportScale] = useState(1);
  const lastWidthRef = useRef<number>(0);
  const lastHeightRef = useRef<number>(0);

  useEffect(() => {
      const updateScale = () => {
          const h = window.innerHeight;
          const w = window.innerWidth;
          
          if (w === lastWidthRef.current && h === lastHeightRef.current) {
              return;
          }
          lastWidthRef.current = w;
          lastHeightRef.current = h;

          let gameHeight = h;
          if (w > h) {
              const availableWidth = w * 0.8;
              const idealGameHeight = availableWidth * 0.75;
              const calculatedHeaderHeight = Math.max(60, h - idealGameHeight);
              gameHeight = h - calculatedHeaderHeight;
          } else {
              gameHeight = Math.min(w * 0.75, h * 0.45);
          }
          const newScale = Math.max(0.5, gameHeight / 270);
          setViewportScale(newScale);
          viewportScaleRef.current = newScale;
      };
      updateScale();
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
  }, []);

  const mainElapsed = (spriteStartTimeMainRef.current !== undefined && spriteStartTimeMainRef.current !== -1) ? (performance.now() - spriteStartTimeMainRef.current) : undefined;
  const currentHandSprite = getWeaponSprite(displayedWeapon, mainElapsed, characterId, animations, spriteMap);

  const akimboElapsed = (spriteStartTimeAkimboRef.current !== undefined && spriteStartTimeAkimboRef.current !== -1) ? (performance.now() - spriteStartTimeAkimboRef.current) : undefined;
  const akimboHandSprite = getWeaponSprite(displayedAkimboWeapon, akimboElapsed, characterId, animations, spriteMap);

  useEffect(() => {
      if (transitionStateRef.current === 'IDLE' && !swayActiveRef.current && !activeSequenceMainRef.current && !activeSequenceAkimboRef.current) {
          if (mainHandContainerRef.current) {
              const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
              const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
              const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
              mainHandContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${baseScale}) rotate(0deg)`;
          }
          if (mapContainerRef.current) {
              const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
              const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
              const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
              mapContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${baseScale}) rotate(0deg)`;
          }
          if (consoleContainerRef.current) {
              const baseScale = displayedWeaponRef.current?.handScale ?? 1.0;
              const offsetX = (displayedWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
              const offsetY = (displayedWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
              consoleContainerRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${baseScale}) rotate(0deg)`;
          }
          if (akimboHandContainerRef.current) {
              const akimboBaseScale = displayedAkimboWeaponRef.current?.handScale ?? 1.0;
              const akimboOffsetX = (displayedAkimboWeaponRef.current?.handOffset?.x ?? 0) * viewportScaleRef.current;
              const akimboOffsetY = (displayedAkimboWeaponRef.current?.handOffset?.y ?? 0) * viewportScaleRef.current;
              akimboHandContainerRef.current.style.transform = `translate(${-akimboOffsetX}px, ${akimboOffsetY}px) scale(${akimboBaseScale}) rotate(0deg)`;
          }
      }
  }, [displayedWeapon, displayedAkimboWeapon, viewportScale, gameState, currentHandSprite?.src, akimboHandSprite?.src, cinematicMode]);

  const weaponStyle: CSSProperties = {
      transformOrigin: 'bottom right',
      transition: 'none',
      willChange: 'transform'
  };

  const akimboWeaponStyle: CSSProperties = {
      transformOrigin: 'bottom left',
      transition: 'none',
      willChange: 'transform'
  };

  return { 
      weaponStyle,
      akimboWeaponStyle,
      displayedWeapon,
      displayedAkimboWeapon,
      mainHandContainerRef,
      akimboHandContainerRef,
      mapContainerRef,
      consoleContainerRef,
      mainHandImgRef,
      mainHandImgShadowRef,
      mainMuzzleImgRef,
      akimboHandImgRef,
      akimboHandImgShadowRef,
      akimboMuzzleImgRef,
      currentHandSprite,
      akimboHandSprite,
      triggerWeaponAnimation, 
      triggerSway, 
      triggerHolster, 
      triggerEquip, 
      triggerSwap,
      resetAnimation 
  };
};
