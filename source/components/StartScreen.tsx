
import React, { useRef, useEffect, useState } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { GameStrings } from '../types';
import { ASSETS } from '../assets';
import ParallaxBackground from './ParallaxBackground';

interface StartScreenProps {
  strings: GameStrings;
  showIntroVideo: boolean;
  isVideoReady: boolean;
  isTransitioningToMenu: boolean;
  startAudioAndGame: (enable: boolean) => void;
  initAudio: () => void;
  handleVideoEnd: () => void;
  setIsVideoReady: (ready: boolean) => void;
  preloadAssets: () => Promise<any>;
}

const StartScreen: React.FC<StartScreenProps> = ({
  strings,
  showIntroVideo,
  isVideoReady,
  isTransitioningToMenu,
  startAudioAndGame,
  initAudio,
  handleVideoEnd,
  setIsVideoReady,
  preloadAssets
}) => {
  const [isPortrait, setIsPortrait] = useState(() => typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false);
  const [videoStage, setVideoStage] = useState<'DEVELOPER' | 'ENGINE'>('DEVELOPER');
  const [bgColor, setBgColor] = useState<string>('#0f0f12');
  const [isBuffering, setIsBuffering] = useState(false);
  const [parallaxLoaded, setParallaxLoaded] = useState(false);
  
  const devVideoRef = useRef<HTMLVideoElement>(null);
  const engineVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  
  // Track user choice locally for HTML5 Video elements which are separate from Web Audio API
  const soundEnabledRef = useRef(true);

  const lastGamepadSkipTimeRef = useRef<number>(0);
  const gamepadButtonWasPressedRef = useRef<boolean>(false);

  let devSrc = isPortrait ? ASSETS.VIDEOS.DEVELOPER_VERTICAL : ASSETS.VIDEOS.DEVELOPER;
  let engineSrc = isPortrait ? ASSETS.VIDEOS.ENGINE_VERTICAL : ASSETS.VIDEOS.ENGINE;

  if (devSrc.startsWith('local://')) devSrc = localStorage.getItem(devSrc.substring(8)) || devSrc;
  if (engineSrc.startsWith('local://')) engineSrc = localStorage.getItem(engineSrc.substring(8)) || engineSrc;

  const updateBackgroundColor = () => {
      const activeVideo = videoStage === 'DEVELOPER' ? devVideoRef.current : engineVideoRef.current;
      const canvas = canvasRef.current;
      
      if (activeVideo && canvas && !activeVideo.paused && !activeVideo.ended) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
              try {
                  // Draw small version of video frame
                  ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
                  
                  // Get center pixel or average of center area
                  const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                  let r = 0, g = 0, b = 0;
                  let count = 0;
                  
                  // Sample every 4th pixel for performance
                  for (let i = 0; i < frameData.length; i += 16) {
                      // Skip very dark pixels to keep some color
                      if (frameData[i] + frameData[i+1] + frameData[i+2] > 30) {
                          r += frameData[i];
                          g += frameData[i+1];
                          b += frameData[i+2];
                          count++;
                      }
                  }
                  
                  if (count > 0) {
                      r = Math.floor(r / count);
                      g = Math.floor(g / count);
                      b = Math.floor(b / count);
                      // Darken the color slightly for background
                      const newColor = `rgb(${Math.floor(r*0.3)},${Math.floor(g*0.3)},${Math.floor(b*0.3)})`;
                      setBgColor(newColor);
                  }
              } catch (e) {
                  // Cross-origin issues might prevent reading canvas data
                  console.warn("Color extraction failed:", e);
              }
          }
      }
      
      if (showIntroVideo) {
          rafRef.current = requestAnimationFrame(updateBackgroundColor);
      }
  };

  useEffect(() => {
      const updateOrientation = () => {
          if (!showIntroVideo && typeof window !== 'undefined') {
              setIsPortrait(window.innerHeight > window.innerWidth);
          }
      };
      
      updateOrientation();
      window.addEventListener('resize', updateOrientation);
      window.addEventListener('orientationchange', updateOrientation);
      
      return () => {
          window.removeEventListener('resize', updateOrientation);
          window.removeEventListener('orientationchange', updateOrientation);
      };
  }, [showIntroVideo]);

  useEffect(() => {
      if (showIntroVideo) {
          rafRef.current = requestAnimationFrame(updateBackgroundColor);
      }
      return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
  }, [showIntroVideo, videoStage]);

  const playVideoSafe = (videoEl: HTMLVideoElement) => {
      // Always start muted to guarantee playback on mobile
      videoEl.muted = true;

      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
          playPromise
            .then(() => {
                // If playback started and user wants sound, try to unmute
                if (soundEnabledRef.current) {
                    videoEl.muted = false;
                }
            })
            .catch((error) => {
              console.warn("Autoplay blocked, trying muted:", error);
              videoEl.muted = true;
              videoEl.play().catch(e => {
                  if (e.name !== 'AbortError' && !e.message?.includes('removed from the document')) {
                      console.error("Playback failed completely", e);
                  }
              });
          });
      }
  };

  const handleDevComplete = () => {
      setVideoStage('ENGINE');
      if (engineVideoRef.current) {
          // Engine video is already buffered due to preload="auto" and hidden render
          playVideoSafe(engineVideoRef.current);
      }
  };

  const handleEngineComplete = () => {
      handleVideoEnd();
  };

  const handleScreenClick = () => {
      if (!showIntroVideo) return;
      
      // Allow skipping the current stage
      if (videoStage === 'DEVELOPER') {
          if (devVideoRef.current) devVideoRef.current.pause();
          handleDevComplete();
      } else {
          if (engineVideoRef.current) engineVideoRef.current.pause();
          handleEngineComplete();
      }
  };

  // Determine styles for crossfading/switching
  // Video is always "visible" to the browser (opacity 1), just covered by UI when not playing
  // This prevents mobile browsers from pausing "hidden" videos
  const videoBaseClass = isPortrait 
      ? "absolute inset-0 w-full h-full object-cover transition-opacity duration-0" 
      : "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full object-contain transition-opacity duration-0";

  const handleStart = async (enableAudio: boolean) => {
      soundEnabledRef.current = enableAudio;
      setIsBuffering(true);
      
      // Synchronously initialize audio contexts
      initAudio();

      // Unlock video audio immediately
      if (devVideoRef.current) {
          devVideoRef.current.muted = !enableAudio;
          const p = devVideoRef.current.play();
          if (p !== undefined) {
              p.then(() => devVideoRef.current?.pause()).catch(() => {});
          }
      }
      if (engineVideoRef.current) {
          engineVideoRef.current.muted = !enableAudio;
          const p = engineVideoRef.current.play();
          if (p !== undefined) {
              p.then(() => engineVideoRef.current?.pause()).catch(() => {});
          }
      }

      // Wait for videos to buffer
      const waitForVideo = (video: HTMLVideoElement) => {
          return new Promise<void>((resolve) => {
              if (video.readyState >= 3) {
                  resolve();
              } else {
                  const onCanPlay = () => {
                      video.removeEventListener('canplay', onCanPlay);
                      video.removeEventListener('canplaythrough', onCanPlay);
                      video.removeEventListener('error', onError);
                      resolve();
                  };
                  const onError = () => {
                      video.removeEventListener('canplay', onCanPlay);
                      video.removeEventListener('canplaythrough', onCanPlay);
                      video.removeEventListener('error', onError);
                      console.warn("Video failed to load, continuing anyway");
                      resolve();
                  };
                  video.addEventListener('canplay', onCanPlay);
                  video.addEventListener('canplaythrough', onCanPlay);
                  video.addEventListener('error', onError);
              }
          });
      };

      const promises = [];
      if (devVideoRef.current) promises.push(waitForVideo(devVideoRef.current));
      if (engineVideoRef.current) promises.push(waitForVideo(engineVideoRef.current));
      promises.push(preloadAssets());

      try {
          await Promise.all(promises);
      } catch (e) {
          console.warn("Buffering failed, continuing anyway", e);
      }

      setIsBuffering(false);
      
      if (devVideoRef.current) {
          try {
              // 1. Prepare video state synchronously
              devVideoRef.current.currentTime = 0;
              devVideoRef.current.muted = !enableAudio;
              
              // 2. Attempt playback immediately
              await devVideoRef.current.play();
              
              // 3. Only update UI state after successful start
              // This prevents React render cycles from interrupting the play promise
              startAudioAndGame(enableAudio);
          } catch (error) {
              console.warn("Manual play failed, trying muted fallback:", error);
              try {
                  if (devVideoRef.current) {
                      devVideoRef.current.muted = true;
                      await devVideoRef.current.play();
                      startAudioAndGame(enableAudio);
                  }
              } catch (e: any) {
                  if (e.name !== 'AbortError' && !e.message?.includes('removed from the document')) {
                      console.error("Playback failed completely", e);
                  }
                  // Even if video fails, proceed to game
                  handleVideoEnd();
              }
          }
      } else {
          // Fallback if ref is missing
          startAudioAndGame(enableAudio);
      }
  };

  useEffect(() => {
    // We no longer trigger play from useEffect for the first video
    // This avoids the "play() failed because the user didn't interact" error
    // when the effect runs after a render
    
    if (showIntroVideo) {
        // Force load on the second video to ensure buffering starts immediately
        if (engineVideoRef.current) {
            engineVideoRef.current.load();
        }
    }
  }, [showIntroVideo]);

  // Gamepad skipping detection during Intro videos
  useEffect(() => {
    if (!showIntroVideo) return;
    
    let rafId: number | null = null;
    
    const checkGamepadForSkip = () => {
        const gamepads = navigator.getGamepads();
        let activeGamepad = null;
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                activeGamepad = gamepads[i];
                break;
            }
        }
        
        if (activeGamepad) {
            const now = performance.now();
            const buttonA = activeGamepad.buttons[0]?.pressed; // Button A
            const buttonB = activeGamepad.buttons[1]?.pressed; // Button B
            const buttonX = activeGamepad.buttons[2]?.pressed; // Button X
            const buttonY = activeGamepad.buttons[3]?.pressed; // Button Y
            const startButton = activeGamepad.buttons[9]?.pressed; // Start Button
            
            const isButtonPressed = !!(buttonA || buttonB || buttonX || buttonY || startButton);
            
            if (isButtonPressed) {
                if (!gamepadButtonWasPressedRef.current && (now - lastGamepadSkipTimeRef.current > 400)) {
                    lastGamepadSkipTimeRef.current = now;
                    gamepadButtonWasPressedRef.current = true;
                    handleScreenClick();
                }
            } else {
                gamepadButtonWasPressedRef.current = false;
            }
        } else {
            gamepadButtonWasPressedRef.current = false;
        }
        
        rafId = requestAnimationFrame(checkGamepadForSkip);
    };
    
    rafId = requestAnimationFrame(checkGamepadForSkip);
    return () => {
        if (rafId) cancelAnimationFrame(rafId);
    };
  }, [showIntroVideo, videoStage]);

  return (
    <div className="flex flex-col h-full w-full bg-black relative overflow-y-auto overflow-x-hidden">
        {/* Hidden Canvas for Color Sampling */}
        <canvas ref={canvasRef} width="32" height="32" className="hidden" />

        <ParallaxBackground opacity={0.6} onLoad={() => setParallaxLoaded(true)} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] z-10 pointer-events-none" />
        
        {/* Video Container - Always rendered, z-index controlled */}
        <div 
            className={`fixed inset-0 flex items-center justify-center overflow-hidden transition-colors duration-300 ${showIntroVideo ? 'z-[999] opacity-100' : 'z-0 opacity-0'}`}
            style={{ backgroundColor: bgColor }}
            onClick={handleScreenClick}
        >
            {/* Developer Video (Played First) */}
            <video 
                ref={devVideoRef}
                src={devSrc}
                className={`${videoBaseClass} ${videoStage === 'DEVELOPER' ? 'opacity-100 z-20' : 'opacity-0 z-10'}`}
                playsInline
                webkit-playsinline="true"
                crossOrigin="anonymous"
                // Removed muted={true} default to allow dynamic control
                onEnded={handleDevComplete}
                onCanPlay={() => setIsVideoReady(true)}
                preload="auto"
            />

            {/* Engine Video (Buffered in background) */}
            <video 
                ref={engineVideoRef}
                src={engineSrc}
                className={`${videoBaseClass} ${videoStage === 'ENGINE' ? 'opacity-100 z-20' : 'opacity-0 z-10'}`}
                playsInline
                webkit-playsinline="true"
                crossOrigin="anonymous"
                muted={!soundEnabledRef.current} // Bind to ref for consistency
                onEnded={handleEngineComplete}
                preload="auto" 
            />
        </div>

        {/* UI Container - Fades out when video starts */}
        <div className={`z-20 flex-1 flex flex-col items-center justify-center p-8 text-center transition-opacity duration-500 ${showIntroVideo || !parallaxLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="bg-black/60 border border-gray-700 p-8 max-w-sm w-full rounded-sm shadow-2xl">
                <h2 className="text-xl md:text-2xl font-black tracking-[0.3em] uppercase mb-10 text-gray-100 border-b border-red-800 pb-4">{strings.ui.menu.audio_prompt}</h2>
                <div className="flex flex-col gap-6 w-full">
                    <div className={`grid grid-cols-2 gap-4 transition-opacity duration-500 ${(isTransitioningToMenu || isBuffering) ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        <button 
                            disabled={isTransitioningToMenu || isBuffering} 
                            onClick={() => handleStart(true)} 
                            className="px-6 py-3 bg-green-900/20 border border-green-700/50 hover:border-green-400 text-white font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 disabled:cursor-not-allowed"
                        >
                            <Volume2 size={18} />{strings.ui.menu.audio_yes}
                        </button>
                        <button 
                            disabled={isTransitioningToMenu || isBuffering} 
                            onClick={() => handleStart(false)} 
                            data-no-click-sound="true"
                            className="px-6 py-3 bg-red-900/20 border border-red-700/50 hover:border-red-400 text-white font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 disabled:cursor-not-allowed"
                        >
                            <VolumeX size={18} />{strings.ui.menu.audio_no}
                        </button>
                    </div>
                    {(isTransitioningToMenu || isBuffering) && (
                        <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-row items-center justify-center gap-3 mt-6">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                            <div className="text-[10px] tracking-widest uppercase animate-pulse text-gray-400 font-bold">{strings.ui.loading.init}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        <style>{`@keyframes loading-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } } .animate-loading-slide { animation: loading-slide 1.2s infinite ease-in-out; }`}</style>
    </div>
  );
};

export default StartScreen;
