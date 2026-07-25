import React, { useEffect, useRef, useState } from 'react';
import { ASSETS } from '../assets';

const globalOffsets: Record<string, number> = {
  layer0: 0,
  layer1: 0,
  layer2: 0,
  layer3: 0,
};

const layersData = [
  { src: [ASSETS.SPRITES.MENU_PARALLAX4], speed: 0.2, key: 'layer0' },
  { src: [ASSETS.SPRITES.MENU_PARALLAX3], speed: 0.5, key: 'layer1' },
  { src: [ASSETS.SPRITES.MENU_PARALLAX2], speed: 1.0, key: 'layer2' },
  { 
    src: [
      ASSETS.SPRITES.MENU_PARALLAX1, 
      ASSETS.SPRITES.MENU_PARALLAX1, 
      ASSETS.SPRITES.MENU_PARALLAX1, 
      ASSETS.SPRITES.MENU_PARALLAX1_1
    ], 
    speed: 2.0, 
    key: 'layer3' 
  }
];

const imageCache: Record<string, HTMLImageElement> = {};
let globalParallaxLoaded = false;

interface ParallaxBackgroundProps {
  opacity?: number;
  grayscale?: boolean;
  onLoad?: () => void;
}

const NUM_REPEAT_BLOCKS = 8; // Securely covers ultra-wide, 4K, and 8K screens

const ParallaxBackground: React.FC<ParallaxBackgroundProps> = ({ opacity = 0.5, grayscale = false, onLoad }) => {
  const [isLoaded, setIsLoaded] = useState(globalParallaxLoaded);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const uniqueImages = Array.from(new Set(layersData.flatMap(layer => layer.src)));
    
    if (globalParallaxLoaded) {
      if (onLoad) onLoad();
      return;
    }

    let loadedCount = 0;
    const handleLoad = () => {
      loadedCount++;
      if (loadedCount === uniqueImages.length) {
        globalParallaxLoaded = true;
        setIsLoaded(true);
        if (onLoad) onLoad();
      }
    };

    uniqueImages.forEach(src => {
      if (imageCache[src] && imageCache[src].complete) {
        handleLoad();
        return;
      }
      const img = new Image();
      img.onload = () => {
        handleLoad();
      };
      img.onerror = () => {
        handleLoad();
      };
      img.src = src;
      imageCache[src] = img;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const container = containerRef.current;
      if (!container) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const containerHeight = container.clientHeight;
      if (containerHeight === 0) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      layersData.forEach((layer) => {
        const firstImg = imageCache[layer.src[0]];
        if (!firstImg || firstImg.naturalHeight === 0) return;

        const heightScale = containerHeight / firstImg.naturalHeight;
        let blockWidth = 0;
        for (const src of layer.src) {
          const img = imageCache[src];
          if (img) {
            blockWidth += img.naturalWidth * heightScale;
          }
        }

        if (blockWidth === 0) return;

        globalOffsets[layer.key] -= layer.speed * dt * 60;

        while (globalOffsets[layer.key] <= -blockWidth) {
          globalOffsets[layer.key] += blockWidth;
        }

        const el = layersRefs.current[layer.key];
        if (el) {
          el.style.transform = `translate3d(${globalOffsets[layer.key]}px, 0px, 0px)`;
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isLoaded]);

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-opacity duration-1000 ${grayscale ? 'grayscale' : ''}`} 
      style={{ opacity: isLoaded ? opacity : 0 }}
    >
      {isLoaded && layersData.map((layer) => (
        <div 
          key={layer.key} 
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
        >
          <div
            ref={(el) => {
              layersRefs.current[layer.key] = el;
            }}
            className="flex flex-row h-full w-max select-none pointer-events-none"
            style={{
              willChange: 'transform',
              transform: `translate3d(${globalOffsets[layer.key]}px, 0px, 0px)`,
            }}
          >
            {Array.from({ length: NUM_REPEAT_BLOCKS }).map((_, blockIdx) => (
              <div 
                key={blockIdx} 
                className="flex flex-row h-full shrink-0"
              >
                {layer.src.map((src, imgIdx) => (
                  <img
                    key={imgIdx}
                    src={src}
                    alt=""
                    className="h-full shrink-0 select-none pointer-events-none"
                    style={{
                      imageRendering: 'pixelated',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ParallaxBackground;
