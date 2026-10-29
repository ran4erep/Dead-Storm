import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { GameState, Item, Settings, Enemy, RoamingEnemyAnim, DEFAULT_SETTINGS } from '../types';

const getInitialSettings = (): Settings => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
        const saved = localStorage.getItem('deadstorm_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                ...DEFAULT_SETTINGS,
                ...parsed,
                volume: { ...DEFAULT_SETTINGS.volume, ...(parsed.volume || {}) },
                debug: { ...DEFAULT_SETTINGS.debug, ...(parsed.debug || {}) },
                controls: { ...DEFAULT_SETTINGS.controls, ...(parsed.controls || {}) },
                gamepadControls: { ...DEFAULT_SETTINGS.gamepadControls, ...(parsed.gamepadControls || {}) }
            };
        }
    } catch (e) {
        console.error("Failed to load settings", e);
    }
    return DEFAULT_SETTINGS;
};

export function useGlobalState() {
    const [gameState, setGameState] = useState<GameState>(GameState.START_SCREEN);
    const [gameOverType, setGameOverType] = useState<'death' | 'script'>('death');
    const [settings, setSettings] = useState<Settings>(getInitialSettings);
    
    useEffect(() => {
        try {
            localStorage.setItem('deadstorm_settings', JSON.stringify(settings));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    }, [settings]);
    
    const [activeModal, setActiveModal] = useState<'inventory' | 'equipment' | 'stats' | 'actions' | 'location' | 'loot' | 'debug_map' | 'trade' | 'crafting' | 'keypad' | 'save' | 'inspect' | 'inspect_anim' | 'achievements' | null>(null);
    const [inspectText, setInspectText] = useState<string>('');
    const [showPauseMenu, setShowPauseMenu] = useState(false); 
    const [showSettings, setShowSettings] = useState(false); 
    const [showDebug, setShowDebug] = useState(false); 
    const [showVolume, setShowVolume] = useState(false);
    const [lootData, setLootData] = useState<{ items: Item[], x: number, y: number, isContainer?: boolean, containerItem?: Item } | null>(null);
    const runtimeEnemiesRef = useRef<Map<string, Enemy>>(new Map());
    const [enemiesSnapshot, setEnemiesSnapshot] = useState<Map<string, Enemy>>(new Map());

    const syncEnemiesSnapshot = useCallback(() => {
        setEnemiesSnapshot(new Map(runtimeEnemiesRef.current));
    }, []);

    const setEnemies = useCallback((
        action: Map<string, Enemy> | ((prev: Map<string, Enemy>) => Map<string, Enemy>),
        updateSnapshot?: boolean
    ) => {
        const prev = runtimeEnemiesRef.current;
        let next: Map<string, Enemy>;
        if (typeof action === 'function') {
            next = action(prev);
        } else {
            next = action;
        }
        runtimeEnemiesRef.current = next;

        let hasPropChange = prev.size !== next.size;
        if (!hasPropChange) {
            for (const [id, enemy] of next) {
                const prevEnemy = prev.get(id);
                if (
                    !prevEnemy ||
                    prevEnemy !== enemy ||
                    prevEnemy.hp !== enemy.hp ||
                    prevEnemy.maxHp !== enemy.maxHp ||
                    prevEnemy.aiState !== enemy.aiState ||
                    prevEnemy.brokenArmor?.length !== enemy.brokenArmor?.length
                ) {
                    hasPropChange = true;
                    break;
                }
            }
        }

        const shouldUpdate = updateSnapshot || hasPropChange;

        if (shouldUpdate) {
            setEnemiesSnapshot(new Map(next));
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('raycaster-look'));
        }
    }, []);

    const enemyFlashesRef = useRef<{x: number, y: number, startTime: number, id: number, intensity?: number, duration?: number, isFlashbang?: boolean}[]>([]);
    const [playerDamageSource, setPlayerDamageSource] = useState<{x: number, y: number, id: string} | null>(null);
    const explosionsRef = useRef<{id: string, x: number, y: number, assetId: string, startTime: number}[]>([]);
    const [isTransitioningToMenu, setIsTransitioningToMenu] = useState(false);
    const [showIntroVideo, setShowIntroVideo] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [manualReloadTrigger, setManualReloadTrigger] = useState(0);
    const [playerReflectionSprite, setPlayerReflectionSprite] = useState<HTMLCanvasElement | null>(null);
    const [, forceUpdate] = useState(0);
    const mapSnapshotsRef = useRef<Map<string, ImageData>>(new Map());
    const inventorySysRef = useRef<any>(null);
    const raycasterRef = useRef<any>(null);
    const activeExplosionsRef = useRef<number>(0);
    const roamingAnimsRef = useRef<RoamingEnemyAnim[]>([]);
    const setRoamingAnims = useCallback((anims: RoamingEnemyAnim[] | ((prev: RoamingEnemyAnim[]) => RoamingEnemyAnim[])) => {
        roamingAnimsRef.current = typeof anims === 'function' ? anims(roamingAnimsRef.current) : anims;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('raycaster-look'));
    }, []);

    const boxMoveAnimsRef = useRef<{id: string, startX: number, startY: number, endX: number, endY: number, startTime: number}[]>([]);
    const setBoxMoveAnims = useCallback((anims: any[] | ((prev: any[]) => any[])) => {
        boxMoveAnimsRef.current = typeof anims === 'function' ? anims(boxMoveAnimsRef.current) : anims;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('raycaster-look'));
    }, []);

    const pickupAnimRef = useRef<{ item: Item, startTime: number, x: number, y: number, reverse?: boolean } | null>(null);
    const setPickupAnim = useCallback((anim: any | ((prev: any) => any)) => {
        pickupAnimRef.current = typeof anim === 'function' ? anim(pickupAnimRef.current) : anim;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('raycaster-look'));
    }, []);

    const throwAnimRef = useRef<{ item: Item, startTime: number, x: number, y: number } | null>(null);
    const setThrowAnim = useCallback((anim: any | ((prev: any) => any)) => {
        throwAnimRef.current = typeof anim === 'function' ? anim(throwAnimRef.current) : anim;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('raycaster-look'));
    }, []);

    const [cinematicMode, setCinematicMode] = useState<boolean>(false);
    const cinematicCameraRef = useRef<{ x: number, y: number, dir: number, pitch?: number, zoom?: number, floor?: number } | null>(null);
    const [cinematicCameraState, setCinematicCameraState] = useState<{ x: number, y: number, dir: number, pitch?: number, zoom?: number, floor?: number } | null>(null);

    const setCinematicCamera = useCallback((
        cam: { x: number, y: number, dir: number, pitch?: number, zoom?: number, floor?: number } | null | ((prev: any) => any),
        updateUIState?: boolean
    ) => {
        const next = typeof cam === 'function' ? cam(cinematicCameraRef.current) : cam;
        cinematicCameraRef.current = next;
        if (updateUIState || next === null || (cinematicCameraState === null && next !== null)) {
            setCinematicCameraState(next);
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('raycaster-look'));
        }
    }, [cinematicCameraState]);

    const { raycasterWidth, raycasterHeight, resolutionDivisor } = useMemo(() => {
        if (gameState === GameState.MAP_VIEW) {
            return { raycasterWidth: 320, raycasterHeight: 240, resolutionDivisor: 4 };
        }
        
        let w = 320;
        let h = 240;
        let divisor = 1;
        
        switch (settings.resolution) {
            case 'LOW':
                w = 320;
                h = 240;
                divisor = 2; // Effective 160x120
                break;
            case 'MEDIUM':
                w = 320;
                h = 240;
                divisor = 1; // Effective 320x240
                break;
            case 'HIGH':
                w = 640;
                h = 480;
                divisor = 1; // Effective 640x480
                break;
            case 'CUSTOM':
                const scale = settings.customResolutionScale || 1.0;
                w = Math.round(320 * scale);
                h = Math.round(240 * scale);
                if (w % 2 !== 0) w++;
                if (h % 2 !== 0) h++;
                divisor = 1;
                break;
            default:
                w = 640;
                h = 480;
                divisor = 1;
                break;
        }
        
        return { raycasterWidth: w, raycasterHeight: h, resolutionDivisor: divisor };
    }, [settings.resolution, settings.customResolutionScale, gameState]);

    // Stores the full weapon item that was equipped when the modal opened
    const weaponRef = useRef<Item | null>(null);
    const akimboWeaponRef = useRef<Item | null>(null);

    // Animation states (stored in persistent runtime refs to eliminate React re-renders)
    const lookAroundAngleRef = useRef(0);
    const lookAroundPitchRef = useRef(0);
    
    const setLookAroundAngle = useCallback((val: number | ((prev: number) => number)) => {
        const newVal = typeof val === 'function' ? val(lookAroundAngleRef.current) : val;
        if (newVal !== lookAroundAngleRef.current) {
            lookAroundAngleRef.current = newVal;
            window.dispatchEvent(new CustomEvent('raycaster-look'));
        }
    }, []);

    const setLookAroundPitch = useCallback((val: number | ((prev: number) => number)) => {
        const newVal = typeof val === 'function' ? val(lookAroundPitchRef.current) : val;
        if (newVal !== lookAroundPitchRef.current) {
            lookAroundPitchRef.current = newVal;
            window.dispatchEvent(new CustomEvent('raycaster-look'));
        }
    }, []);
    const inspectZoomRef = useRef(0);
    const setInspectZoom = useCallback((val: number | ((prev: number) => number)) => {
        const newVal = typeof val === 'function' ? val(inspectZoomRef.current) : val;
        if (newVal !== inspectZoomRef.current) {
            inspectZoomRef.current = newVal;
            window.dispatchEvent(new CustomEvent('update-inspect-zoom', { detail: { zoom: newVal } }));
        }
    }, []);

    useEffect(() => {
        const handleFsChange = () => {
            setSettings(prev => ({ ...prev, fullscreen: !!document.fullscreenElement }));
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const sectorStatesRef = useRef<Map<string, { 
        levelData: any, 
        enemies: Map<string, Enemy>, 
        customWallBuffers: Map<number, any>, 
        customFloorBuffers: Map<number, any>,
        roamingAnims: RoamingEnemyAnim[]
    }>>(new Map());

    const globalScriptFlagsRef = useRef<Record<string, any>>({});

    return {
        gameState, setGameState,
        settings, setSettings,
        activeModal, setActiveModal,
        inspectText, setInspectText,
        showPauseMenu, setShowPauseMenu,
        showSettings, setShowSettings,
        showDebug, setShowDebug,
        showVolume, setShowVolume,
        lootData, setLootData,
        enemiesRef: runtimeEnemiesRef,
        runtimeEnemiesRef,
        get runtimeEnemies() { return runtimeEnemiesRef.current; },
        enemies: enemiesSnapshot,
        enemiesSnapshot,
        syncEnemiesSnapshot,
        setEnemies,
        enemyFlashesRef,
        playerDamageSource, setPlayerDamageSource,
        explosionsRef,
        isTransitioningToMenu, setIsTransitioningToMenu,
        showIntroVideo, setShowIntroVideo,
        isVideoReady, setIsVideoReady,
        manualReloadTrigger, setManualReloadTrigger,
        playerReflectionSprite, setPlayerReflectionSprite,
        forceUpdate,
        mapSnapshotsRef,
        inventorySysRef,
        raycasterRef,
        activeExplosionsRef,
        sectorStatesRef,
        globalScriptFlagsRef,
        roamingAnimsRef,
        setRoamingAnims,
        get roamingAnims() { return roamingAnimsRef.current; },
        boxMoveAnimsRef,
        setBoxMoveAnims,
        get boxMoveAnims() { return boxMoveAnimsRef.current; },
        cinematicMode, setCinematicMode,
        cinematicCameraRef,
        get cinematicCamera() { return cinematicCameraRef.current || cinematicCameraState; },
        setCinematicCamera,
        raycasterWidth,
        raycasterHeight,
        resolutionDivisor,
        weaponRef,
        akimboWeaponRef,
        pickupAnimRef,
        setPickupAnim,
        get pickupAnim() { return pickupAnimRef.current; },
        throwAnimRef,
        setThrowAnim,
        get throwAnim() { return throwAnimRef.current; },
        get lookAroundAngle() { return lookAroundAngleRef.current; }, 
        setLookAroundAngle,
        get lookAroundPitch() { return lookAroundPitchRef.current; }, 
        setLookAroundPitch,
        lookAroundAngleRef,
        lookAroundPitchRef,
        get inspectZoom() { return inspectZoomRef.current; },
        setInspectZoom,
        gameOverType,
        setGameOverType
    };
}
