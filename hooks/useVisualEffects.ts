import { useState, useEffect, useRef, useCallback } from 'react';

import { GameState } from '../types';
import { triggerUnifiedVibration, stopUnifiedVibration } from '../utils/vibration';

export interface ShakeEvent {
  intensity: number;
  startTime: number;
  duration: number;
}

let lowHealthOverlayCache: string | null = null;
export const getLowHealthOverlayImage = () => {
    if (typeof document === 'undefined') return '';
    if (lowHealthOverlayCache) return lowHealthOverlayCache;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    const centerX = 256;
    const centerY = 256;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY); // ~362
    
    // Create a gradient that reaches all the way to the corners
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
    
    // Transparent hole in the middle (up to 45% of the distance to the corner)
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.45, 'transparent'); 
    
    // Softer red at the edges (edges are at ~70% of maxRadius)
    gradient.addColorStop(0.75, 'rgba(185,28,28,0.25)');
    
    // Darker red strictly in the corners, but less aggressive
    gradient.addColorStop(1, 'rgba(153,27,27,0.65)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    lowHealthOverlayCache = canvas.toDataURL('image/png');
    return lowHealthOverlayCache;
};

export const useVisualEffects = (currentHp: number, maxHp: number, vibrationEnabled: boolean, gameState: GameState, loading: boolean, playSound?: (id: string) => void, stopSound?: (id: string) => void) => {
  const [delayedHp, setDelayedHp] = useState(currentHp);
  const [showLevelUpText, setShowLevelUpText] = useState(false);
  const muzzleFlashIntensityRef = useRef(0);
  const shakeEventRef = useRef<ShakeEvent | null>(null);
  
  const heartbeatIntervalRef = useRef<any>(null);
  const heartbeatTimeoutRef = useRef<any>(null);

  // Define low health state at the top level so it can be used for step logic logic too
  const inGameStates = [
    GameState.PLAYING,
    GameState.COMBAT,
    GameState.DYING,
    GameState.MAP_VIEW,
    GameState.RADIO_VIEW,
    GameState.AIMING,
    GameState.THROWING,
    GameState.DIALOGUE,
    GameState.LOOKING_AROUND,
    GameState.FALLING
  ];
  const isLowHealth = ((currentHp > 0 && (currentHp / maxHp) <= 0.3) || gameState === GameState.DYING) && inGameStates.includes(gameState) && !loading;

  // Delayed Health Animation Logic (Bidirectional)
  useEffect(() => {
      const timer = setTimeout(() => {
        setDelayedHp(currentHp);
      }, 500); 
      return () => clearTimeout(timer);
  }, [currentHp]);

  // Heartbeat Vibration Logic
  useEffect(() => {
      if (isLowHealth) {
          if (!heartbeatIntervalRef.current) {
              // Initial beat
              triggerUnifiedVibration([30, 100, 30], vibrationEnabled);
              if (playSound) {
                  playSound('SYS_HEARTBEAT');
                  heartbeatTimeoutRef.current = setTimeout(() => playSound('SYS_HEARTBEAT'), 130);
              }
              
              // Loop
              heartbeatIntervalRef.current = setInterval(() => {
                  // Pattern: short pulse, gap, short pulse (lub-dub)
                  if (document.visibilityState === 'visible') {
                      triggerUnifiedVibration([30, 100, 30], vibrationEnabled);
                      if (playSound) {
                          playSound('SYS_HEARTBEAT');
                          heartbeatTimeoutRef.current = setTimeout(() => playSound('SYS_HEARTBEAT'), 130);
                      }
                  }
              }, 1200); // 1.2 seconds BPM roughly 50 (slow, heavy heart)
          }
      } else {
          if (heartbeatIntervalRef.current) {
              clearInterval(heartbeatIntervalRef.current);
              heartbeatIntervalRef.current = null;
              if (heartbeatTimeoutRef.current) {
                  clearTimeout(heartbeatTimeoutRef.current);
                  heartbeatTimeoutRef.current = null;
              }
              if (stopSound) {
                  stopSound('SYS_HEARTBEAT');
              }
              stopUnifiedVibration();
          }
      }

      return () => {
          if (heartbeatIntervalRef.current) {
              clearInterval(heartbeatIntervalRef.current);
              heartbeatIntervalRef.current = null;
              if (heartbeatTimeoutRef.current) {
                  clearTimeout(heartbeatTimeoutRef.current);
                  heartbeatTimeoutRef.current = null;
              }
              if (stopSound) {
                  stopSound('SYS_HEARTBEAT');
              }
              stopUnifiedVibration();
          }
      };
  }, [isLowHealth, vibrationEnabled, playSound, stopSound]);

  // Player attack camera shake listener
  useEffect(() => {
    const handlePlayerAttackShake = (e: CustomEvent<{ intensity: number, duration: number }>) => {
      const { intensity, duration } = e.detail || { intensity: 0.35, duration: 200 };
      shakeEventRef.current = {
        intensity,
        startTime: performance.now(),
        duration
      };
      // Dispatch look event to force raycaster redraw instantly
      window.dispatchEvent(new CustomEvent('raycaster-look'));
    };
    window.addEventListener('player-attack-shake' as any, handlePlayerAttackShake);
    return () => window.removeEventListener('player-attack-shake' as any, handlePlayerAttackShake);
  }, []);

  const triggerDamageEffect = useCallback((heavy: boolean = false) => {
    triggerUnifiedVibration(200, vibrationEnabled);
    shakeEventRef.current = {
      intensity: heavy ? 1.0 : 0.5,
      startTime: performance.now(),
      duration: heavy ? 800 : 400
    };
    
    const el = document.getElementById('damage-flash-overlay');
    if (el) {
        el.style.opacity = heavy ? '0.6' : '0.3';
        setTimeout(() => {
            if (el) el.style.opacity = '0';
        }, 300);
    }
  }, [vibrationEnabled]);

  const triggerScreenShake = useCallback((isHeavy: boolean = false, customPattern?: number | number[], customIntensity?: number, customDuration?: number) => {
    if (customPattern) {
        triggerUnifiedVibration(customPattern, vibrationEnabled);
    } else if (isHeavy) {
        // Explosion pattern: Long rumble, then decaying shocks
        triggerUnifiedVibration([400, 30, 300, 30, 100], vibrationEnabled);
    } else {
        triggerUnifiedVibration(100, vibrationEnabled);
    }
    
    shakeEventRef.current = {
      intensity: customIntensity !== undefined ? customIntensity : (isHeavy ? 3.0 : 1.0),
      startTime: performance.now(),
      duration: customDuration !== undefined ? customDuration : (isHeavy ? 2000 : 800)
    };
  }, [vibrationEnabled]);

  const triggerAttackVibration = useCallback((pattern?: number | number[]) => {
      // Default: Sharp, short pulse for shooting/hitting
      const vib = pattern || 40;
      triggerUnifiedVibration(vib, vibrationEnabled);
  }, [vibrationEnabled]);

  const triggerPickupEffect = useCallback(() => {
    const el = document.getElementById('pickup-flash-overlay');
    if (el) {
        el.style.opacity = '0.4';
        setTimeout(() => {
            if (el) el.style.opacity = '0';
        }, 300);
    }
  }, []);

  const triggerLevelUpEffect = useCallback(() => {
    const el = document.getElementById('levelup-flash-overlay');
    if (el) {
        el.style.opacity = '0.6';
        setTimeout(() => {
            if (el) el.style.opacity = '0';
        }, 300);
    }
    setShowLevelUpText(true);
    setTimeout(() => setShowLevelUpText(false), 6000);
  }, []);

  const triggerMuzzleFlash = useCallback((intensity: number = 1.0) => {
    // Start at max intensity
    muzzleFlashIntensityRef.current = intensity;
    window.dispatchEvent(new CustomEvent('raycaster-look'));
    window.dispatchEvent(new CustomEvent('weapon-flash', { detail: intensity }));
    
    // Decay logic scales with intensity. Explosions (intensity > 1) last longer.
    const durationMultiplier = intensity > 1.5 ? 2.0 : 1.0;

    // Slightly slower decay to ensure visibility on frame updates
    setTimeout(() => { 
        if (muzzleFlashIntensityRef.current > 0) {
            muzzleFlashIntensityRef.current = intensity * 0.6;
            window.dispatchEvent(new CustomEvent('raycaster-look'));
            window.dispatchEvent(new CustomEvent('weapon-flash', { detail: intensity * 0.6 }));
        }
    }, 60 * durationMultiplier);
    setTimeout(() => { 
        muzzleFlashIntensityRef.current = 0;
        window.dispatchEvent(new CustomEvent('raycaster-look'));
        window.dispatchEvent(new CustomEvent('weapon-flash', { detail: 0 }));
    }, 120 * durationMultiplier);
  }, []);

  return {
    delayedHp,
    setDelayedHp,
    showLevelUpText,
    shakeEvent: null, // REMOVED
    muzzleFlashIntensityRef,
    shakeEventRef,
    triggerDamageEffect,
    triggerScreenShake,
    triggerPickupEffect,
    triggerLevelUpEffect,
    triggerMuzzleFlash,
    triggerAttackVibration,
    isLowHealth
  };
};
