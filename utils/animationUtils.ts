
import { AnimationConfig, AssetId } from '../types';

const hashCache = new Map<string, number>();
const sharedPauses = new Float64Array(10);

/**
 * Returns the correct AssetId (frame) for a given assetId string.
 * If the string matches a key in the animation config, it calculates the current frame based on time.
 */
export const getCurrentAnimationFrame = (
  assetId: string,
  animations: AnimationConfig,
  time: number = performance.now(),
  startTime: number = 0,
  seed: number = 0
): AssetId => {
  const anim = animations[assetId];
  if (!anim || !anim.frames || anim.frames.length === 0) {
    return assetId;
  }

  const frameDuration = 1000 / anim.fps;
  const totalDuration = frameDuration * anim.frames.length;
  
  let elapsed = time - startTime;

  if (anim.randomRepeat) {
      const parts = anim.randomRepeat.split('-');
      const minPause = parseInt(parts[0], 10) || 0;
      const maxPause = parts.length > 1 ? parseInt(parts[1], 10) || minPause : minPause;

      let hash = hashCache.get(assetId);
      if (hash === undefined) {
          hash = 0;
          for (let i = 0; i < assetId.length; i++) {
              hash = Math.imul(31, hash) + assetId.charCodeAt(i) | 0;
          }
          hashCache.set(assetId, hash);
      }
      
      // Use startTime, seed and hash as the base seed
      let currentSeed = (Math.floor(startTime) ^ hash ^ seed) >>> 0;
      const random = () => {
          currentSeed = (currentSeed * 9301 + 49297) % 233280;
          return currentSeed / 233280;
      };

      const PATTERN_LENGTH = 10;
      let totalPatternDuration = 0;
      for (let i = 0; i < PATTERN_LENGTH; i++) {
          sharedPauses[i] = minPause + random() * (maxPause - minPause);
          totalPatternDuration += totalDuration + sharedPauses[i];
      }

      elapsed = elapsed % totalPatternDuration;

      let currentCycleStart = 0;
      for (let i = 0; i < PATTERN_LENGTH; i++) {
          const playEnd = currentCycleStart + totalDuration;
          
          if (elapsed < playEnd) {
              elapsed = elapsed - currentCycleStart;
              break;
          }
          
          const cycleEnd = playEnd + sharedPauses[i];
          if (elapsed < cycleEnd) {
              return anim.frames[0];
          }
          currentCycleStart = cycleEnd;
      }
  } else if (anim.repeat === false) {
      if (elapsed >= totalDuration) {
          // If not repeating, return null to indicate animation is done
          return null as any; // Cast to any to satisfy AssetId return type if needed, or update return type
      }
      if (elapsed < 0) elapsed = 0;
  } else {
      // Loop
      elapsed = elapsed % totalDuration;
      if (elapsed < 0) elapsed += totalDuration;
  }

  const frameIndex = Math.floor(elapsed / frameDuration);
  const safeIndex = Math.min(anim.frames.length - 1, Math.max(0, frameIndex));

  return anim.frames[safeIndex];
};
