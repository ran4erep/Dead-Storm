import React from 'react';
import { Item } from '../types';

interface WeaponHandsProps {
    showWeaponHand: boolean;
    mainHandContainerRef: React.RefObject<HTMLDivElement | null>;
    akimboHandContainerRef: React.RefObject<HTMLDivElement | null>;
    mapContainerRef?: React.RefObject<HTMLDivElement | null>;
    consoleContainerRef?: React.RefObject<HTMLDivElement | null>;
    mainHandImgRef: React.RefObject<HTMLImageElement | null>;
    mainHandImgShadowRef: React.RefObject<HTMLImageElement | null>;
    mainMuzzleImgRef?: React.RefObject<HTMLImageElement | null>;
    akimboHandImgRef: React.RefObject<HTMLImageElement | null>;
    akimboHandImgShadowRef: React.RefObject<HTMLImageElement | null>;
    akimboMuzzleImgRef?: React.RefObject<HTMLImageElement | null>;
    akimboHandSprite: any;
    currentHandSprite: any;
    akimboHandStyleFinal: any;
    handStyleFinal: any;
    akimboBrokenTransform: string;
    brokenTransform: string;
    brokenTransition: string;
    isWeaponBroken: boolean;
    isAkimboWeaponBroken: boolean;
    getTintMatrix: (broken: boolean, intensity: number) => string;
    mainTintId: string;
    akimboTintId: string;
    displayedWeapon?: Item | null;
    displayedAkimboWeapon?: Item | null;
    animations?: Record<string, any>;
    spriteMap?: Map<string, HTMLImageElement>;
    characterId?: string;
}

const WeaponHands: React.FC<WeaponHandsProps> = ({
    showWeaponHand,
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
    akimboHandSprite,
    currentHandSprite,
    akimboHandStyleFinal,
    handStyleFinal,
    akimboBrokenTransform,
    brokenTransform,
    brokenTransition,
    isWeaponBroken,
    isAkimboWeaponBroken,
    getTintMatrix,
    mainTintId,
    akimboTintId,
    displayedWeapon,
    displayedAkimboWeapon,
    animations,
    spriteMap,
    characterId
}) => {
    const mainColorMatrixRef = React.useRef<SVGFEColorMatrixElement | null>(null);
    const akimboColorMatrixRef = React.useRef<SVGFEColorMatrixElement | null>(null);
    const flashIntensityRef = React.useRef<number>(0);
    const mainHandTintWrapperRef = React.useRef<HTMLDivElement | null>(null);
    const akimboHandTintWrapperRef = React.useRef<HTMLDivElement | null>(null);

    // Warm-up and pre-render cache for attack animation frames in GPU memory
    const preloadedFrameUrls = React.useMemo(() => {
        if (!animations || !spriteMap) return [];
        const urls = new Set<string>();

        const processWeapon = (weapon: Item | null | undefined) => {
            if (!weapon) return;
            const attackAssetId = weapon.attackAssetId || (weapon as any).attackAsset;
            const attackFemaleAssetId = weapon.attackFemaleAssetId || (weapon as any).attackAssetFemale;
            const attackAssetToUse = (characterId === 'female' && attackFemaleAssetId) ? attackFemaleAssetId : attackAssetId;

            if (attackAssetToUse) {
                const animDef = animations[attackAssetToUse];
                if (animDef && animDef.frames) {
                    animDef.frames.forEach((frameId: string) => {
                        const img = spriteMap.get(frameId);
                        if (img && img.src) {
                            urls.add(img.src);
                        }
                    });
                } else {
                    const img = spriteMap.get(attackAssetToUse);
                    if (img && img.src) {
                        urls.add(img.src);
                    }
                }
            }

            const muzzleAssetId = weapon.muzzleAsset || (weapon as any).muzzleAssetId;
            const muzzleFemaleAssetId = weapon.muzzleFemaleAsset || (weapon as any).muzzleFemaleAssetId;
            const muzzleAssetToUse = (characterId === 'female' && muzzleFemaleAssetId) ? muzzleFemaleAssetId : muzzleAssetId;
            if (muzzleAssetToUse) {
                const img = spriteMap.get(muzzleAssetToUse);
                if (img && img.src) {
                    urls.add(img.src);
                }
            }
        };

        processWeapon(displayedWeapon);
        processWeapon(displayedAkimboWeapon);
        return Array.from(urls);
    }, [displayedWeapon, displayedAkimboWeapon, animations, spriteMap, characterId]);

    React.useEffect(() => {
        const updateFilters = (intensity: number) => {
            const isFlashing = intensity > 0.05;
            
            if (mainColorMatrixRef.current) {
                mainColorMatrixRef.current.setAttribute("values", getTintMatrix(isWeaponBroken, intensity));
            }
            if (akimboColorMatrixRef.current) {
                akimboColorMatrixRef.current.setAttribute("values", getTintMatrix(isAkimboWeaponBroken, intensity));
            }
            
            const currentBrightness = 1.0; 
            const totalBrightness = currentBrightness + (intensity * 1.5);
            const flashFilter = `brightness(${totalBrightness}) sepia(0.5) hue-rotate(-30deg) saturate(${1 + intensity * 2})`;
            
            const filterBase = 'brightness(1) sepia(0) hue-rotate(0deg) saturate(1)';
            const cssFilter = isFlashing ? flashFilter : filterBase;
            
            if (mainHandTintWrapperRef.current) {
                mainHandTintWrapperRef.current.style.filter = `${cssFilter} url(#${mainTintId})`;
                mainHandTintWrapperRef.current.style.transition = isFlashing ? 'none' : 'filter 0.3s ease-out';
            } else if (mainHandContainerRef.current) {
                mainHandContainerRef.current.style.filter = `${cssFilter} url(#${mainTintId})`;
                mainHandContainerRef.current.style.transition = isFlashing ? 'none' : 'filter 0.3s ease-out';
            }

            if (mapContainerRef?.current) {
                mapContainerRef.current.style.filter = `${cssFilter} url(#${mainTintId})`;
                mapContainerRef.current.style.transition = isFlashing ? 'none' : 'filter 0.3s ease-out';
            }
            if (consoleContainerRef?.current) {
                consoleContainerRef.current.style.filter = `${cssFilter} url(#${mainTintId})`;
                consoleContainerRef.current.style.transition = isFlashing ? 'none' : 'filter 0.3s ease-out';
            }

            if (akimboHandTintWrapperRef.current) {
                akimboHandTintWrapperRef.current.style.filter = `${cssFilter} url(#${akimboTintId})`;
                akimboHandTintWrapperRef.current.style.transition = isFlashing ? 'none' : 'filter 0.3s ease-out';
            } else if (akimboHandContainerRef.current) {
                akimboHandContainerRef.current.style.filter = `${cssFilter} url(#${akimboTintId})`;
                akimboHandContainerRef.current.style.transition = isFlashing ? 'none' : 'filter 0.3s ease-out';
            }
        };

        // Apply immediately to ensure the tint uses the most current IDs and props
        updateFilters(flashIntensityRef.current);

        const handleFlash = (e: any) => {
            flashIntensityRef.current = e.detail;
            updateFilters(e.detail);
        };
        window.addEventListener('weapon-flash', handleFlash);
        return () => window.removeEventListener('weapon-flash', handleFlash);
    }, [getTintMatrix, isWeaponBroken, isAkimboWeaponBroken, mainTintId, akimboTintId, mainHandContainerRef, akimboHandContainerRef, showWeaponHand, currentHandSprite, akimboHandSprite]);

    return (
        <>
            <svg width="0" height="0" className="absolute pointer-events-none">
                <defs>
                    <filter id={mainTintId} colorInterpolationFilters="sRGB">
                        <feColorMatrix id="weapon-tint-main-matrix" data-broken={isWeaponBroken} ref={mainColorMatrixRef} type="matrix" values={getTintMatrix(isWeaponBroken, 0)} />
                    </filter>
                    <filter id={akimboTintId} colorInterpolationFilters="sRGB">
                        <feColorMatrix id="weapon-tint-akimbo-matrix" data-broken={isAkimboWeaponBroken} ref={akimboColorMatrixRef} type="matrix" values={getTintMatrix(isAkimboWeaponBroken, 0)} />
                    </filter>
                </defs>
            </svg>
            {/* Hidden warm-up cache container for ensuring browser and GPU preload all active frames */}
            <div className="absolute opacity-0 overflow-hidden pointer-events-none" style={{ width: 0, height: 0 }} aria-hidden="true">
                {preloadedFrameUrls.map((src, idx) => (
                    <img key={`${src}-${idx}`} src={src} crossOrigin="anonymous" alt="" style={{ width: '1px', height: '1px' }} />
                ))}
            </div>
            {showWeaponHand && akimboHandSprite && (
                <div ref={akimboHandContainerRef} className="absolute bottom-0 left-0 z-[15] pointer-events-none h-[60%] w-auto flex flex-col justify-end items-start" style={akimboHandStyleFinal}>
                    <div className="relative h-full w-auto origin-bottom-left" style={{ transform: akimboBrokenTransform, transition: brokenTransition }}>
                        <div ref={akimboHandTintWrapperRef} className="relative h-full w-auto pointer-events-none">
                            <img ref={akimboHandImgShadowRef} src={akimboHandSprite.src} draggable={false} crossOrigin="anonymous" className="absolute h-full w-auto object-contain object-left-bottom opacity-40" alt="" style={{ imageRendering: 'pixelated', filter: 'brightness(0) blur(4px)', transform: 'scaleX(-1) translate(-4%, 4%)' }} />
                            <img ref={akimboHandImgRef} src={akimboHandSprite.src} draggable={false} crossOrigin="anonymous" className="relative h-full w-auto object-contain object-left-bottom" alt="Akimbo Weapon Hand" style={{ imageRendering: 'pixelated', transform: 'scaleX(-1)' }} />
                        </div>
                        <img ref={akimboMuzzleImgRef} draggable={false} crossOrigin="anonymous" className="absolute inset-0 h-full w-auto object-contain object-left-bottom pointer-events-none z-[16]" alt="Akimbo Muzzle Flash" style={{ imageRendering: 'pixelated', transform: 'scaleX(-1)', display: 'none' }} />
                    </div>
                </div>
            )}
            {showWeaponHand && currentHandSprite && (
                <div ref={mainHandContainerRef} className="absolute bottom-0 right-0 z-[15] pointer-events-none h-[60%] w-auto flex flex-col justify-end items-end" style={handStyleFinal}>
                    <div className="relative h-full w-auto origin-bottom-right" style={{ transform: brokenTransform, transition: brokenTransition }}>
                        <div ref={mainHandTintWrapperRef} className="relative h-full w-auto pointer-events-none">
                            <img ref={mainHandImgShadowRef} src={currentHandSprite.src} draggable={false} crossOrigin="anonymous" className="absolute h-full w-auto object-contain object-right-bottom opacity-40" alt="" style={{ imageRendering: 'pixelated', filter: 'brightness(0) blur(4px)', transform: 'translate(4%, 4%)' }} />
                            <img ref={mainHandImgRef} src={currentHandSprite.src} draggable={false} crossOrigin="anonymous" className="relative h-full w-auto object-contain object-right-bottom" alt="Weapon Hand" style={{ imageRendering: 'pixelated' }} />
                        </div>
                        <img ref={mainMuzzleImgRef} draggable={false} crossOrigin="anonymous" className="absolute inset-0 h-full w-auto object-contain object-right-bottom pointer-events-none z-[16]" alt="Muzzle Flash" style={{ imageRendering: 'pixelated', display: 'none' }} />
                    </div>
                </div>
            )}
        </>
    );
};

export default React.memo(WeaponHands);
