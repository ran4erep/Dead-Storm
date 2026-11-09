

import { Tile } from '../types';
import { applyDepthBrightness } from '../components/raycaster/DepthEffect';
import { getTintedSprite, globalSpriteTintCache } from '../components/raycaster/SpriteCache';

export interface Particle {
  // World space coordinates
  worldX: number;
  worldY: number;
  worldZ: number;
  // World space velocities
  wvx: number;
  wvy: number;
  wvz: number;
  
  // Screen space computed values (for drawing)
  x: number;
  y: number;
  dist: number; // transformY (distance from camera)
  
  life: number;
  maxLife: number;
  color: string;
  size: number;
  alpha?: number;
  baseSize?: number;
  landed?: boolean;
  floorZ: number; // Height of the floor in world Z units (0 usually)
  
  type?: 'blood' | 'fly' | 'rain' | 'splash' | 'shard' | 'brick' | 'gib' | 'casing' | 'smoke' | 'fire' | 'generic' | 'deco_gib';
  isForeground?: boolean; // NEW: Forces drawing in the final pass
  bounceCount?: number;
  maxBounces?: number;
  casingGroundScaleMultiplier?: number;
  useGravity?: boolean;
  gravity?: number;
  friction?: number;
  sizeGrowth?: number; // Adjusts how quickly particles grow or shrink
  isReload?: boolean;
  
  // Shard/Brick specific
  textureId?: string;
  spriteId?: string;
  soundId?: string;
  uvRect?: { u: number, v: number, w: number, h: number };
  points?: { x: number, y: number }[]; // For non-rectangular shards
  rotation?: number;
  rotationSpeed?: number;
  decalBuffer?: { data: Uint32Array, width: number, height: number, type: 'FLOOR' };
  preRenderedCanvas?: HTMLCanvasElement;
  
  // Fly specific (stay screen-relative to their target)
  originX?: number;
  originY?: number;
  offsetX?: number;
  offsetY?: number;
  angle?: number;
  radius?: number;
  baseRadius?: number;
  buzzSpeed?: number;
  sizeMult?: number;
}

const particlePool: Particle[] = [];

export const returnParticleToPool = (p: Particle) => {
    particlePool.push(p);
};

export const returnParticlesToPool = (particles: Particle[]) => {
    for (let i = 0; i < particles.length; i++) {
        particlePool.push(particles[i]);
    }
};

export const casingParticles: Particle[] = new Array(60).fill(null).map(() => ({
    worldX: 0, worldY: 0, worldZ: 0, wvx: 0, wvy: 0, wvz: 0, x: 0, y: 0, dist: 0, life: 0, maxLife: 0, color: '', size: 0, floorZ: 0, type: 'casing'
}));
export let casingIndex = 0;

export const clearCasingParticles = () => {
    for (let i = 0; i < casingParticles.length; i++) {
        casingParticles[i].life = 0;
    }
    casingIndex = 0;
    rotatedCasingCache.clear();
};

export const bloodParticles: Particle[] = new Array(200).fill(null).map(() => ({
    worldX: 0, worldY: 0, worldZ: 0, wvx: 0, wvy: 0, wvz: 0, x: 0, y: 0, dist: 0, life: 0, maxLife: 0, color: '', size: 0, floorZ: 0, type: 'blood'
}));
export let bloodIndex = 0;

export const clearBloodParticles = () => {
    for (let i = 0; i < bloodParticles.length; i++) {
        bloodParticles[i].life = 0;
    }
    bloodIndex = 0;
};

export const rainSplashParticles: Particle[] = new Array(100).fill(null).map(() => ({
    worldX: 0, worldY: 0, worldZ: 0, wvx: 0, wvy: 0, wvz: 0, x: 0, y: 0, dist: 0, life: 0, maxLife: 0, color: '', size: 0, floorZ: 0, type: 'splash'
}));
export let rainSplashIndex = 0;

export const clearRainSplashParticles = () => {
    for (let i = 0; i < rainSplashParticles.length; i++) {
        rainSplashParticles[i].life = 0;
    }
    rainSplashIndex = 0;
};

export const hasActiveAmbientParticles = (): boolean => {
    for (let i = 0; i < casingParticles.length; i++) {
        if (casingParticles[i].life > 0 && !casingParticles[i].landed) return true;
    }
    for (let i = 0; i < bloodParticles.length; i++) {
        if (bloodParticles[i].life > 0 && !bloodParticles[i].landed) return true;
    }
    for (let i = 0; i < rainSplashParticles.length; i++) {
        if (rainSplashParticles[i].life > 0) return true;
    }
    return false;
};

export const getParticle = (): Particle => {
    let p = particlePool.pop();
    if (!p) {
        p = {
            worldX: 0, worldY: 0, worldZ: 0, wvx: 0, wvy: 0, wvz: 0, x: 0, y: 0, dist: 0, life: 0, maxLife: 0, color: '', size: 0, floorZ: 0
        } as Particle;
    }
    
    // Reset all optional properties to avoid bleeding state
    p.baseSize = undefined;
    p.landed = undefined;
    p.type = undefined;
    p.isForeground = undefined;
    p.textureId = undefined;
    p.spriteId = undefined;
    p.soundId = undefined;
    p.uvRect = undefined;
    p.points = undefined;
    p.rotation = undefined;
    p.rotationSpeed = undefined;
    p.originX = undefined;
    p.originY = undefined;
    p.offsetX = undefined;
    p.offsetY = undefined;
    p.angle = undefined;
    p.radius = undefined;
    p.baseRadius = undefined;
    p.buzzSpeed = undefined;
    p.useGravity = undefined;
    p.sizeGrowth = undefined;
    p.gravity = undefined;
    p.friction = undefined;
    p.bounceCount = undefined;
    p.maxBounces = undefined;
    p.casingGroundScaleMultiplier = undefined;
    p.isReload = undefined;
    p.decalBuffer = undefined;
    p.preRenderedCanvas = undefined;
    p.sizeMult = undefined;
    
    return p;
};

export function parseColorToRGB(colorInput: any): { r: number; g: number; b: number } {
  if (!colorInput) return { r: 255, g: 70, b: 30 };
  if (typeof colorInput === 'object' && colorInput !== null) {
    const r = typeof colorInput.r === 'number' ? colorInput.r : 255;
    const g = typeof colorInput.g === 'number' ? colorInput.g : 70;
    const b = typeof colorInput.b === 'number' ? colorInput.b : 30;
    return {
      r: Math.min(255, Math.max(0, r)),
      g: Math.min(255, Math.max(0, g)),
      b: Math.min(255, Math.max(0, b))
    };
  }
  if (typeof colorInput === 'string') {
    if (colorInput.startsWith('#')) {
      const hex = colorInput.replace('#', '');
      const fullHex = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
      const num = parseInt(fullHex, 16);
      if (!isNaN(num)) {
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
      }
    }
    const match = colorInput.match(/\d+/g);
    if (match && match.length >= 3) {
      return {
        r: Math.min(255, Math.max(0, parseInt(match[0], 10))),
        g: Math.min(255, Math.max(0, parseInt(match[1], 10))),
        b: Math.min(255, Math.max(0, parseInt(match[2], 10)))
      };
    }
  }
  return { r: 255, g: 70, b: 30 };
}

export const createFlareSmokeParticle = (
  worldX: number,
  worldY: number,
  colorInput?: any,
  worldZ: number = 0.0,
  floorZ?: number
): Particle => {
  const p = getParticle();
  // Tight baseline spread for a focused column base (~0.04 grid units)
  p.worldX = worldX + (Math.random() - 0.5) * 0.04;
  p.worldY = worldY + (Math.random() - 0.5) * 0.04;
  p.worldZ = worldZ + Math.random() * 0.005;

  // Minimal horizontal drift to keep it in a straight column (not a wide fan)
  p.wvx = (Math.random() - 0.5) * 0.0006;
  p.wvy = (Math.random() - 0.5) * 0.0006;
  // Strong, steady upward rise for thermal smoke column
  p.wvz = 0.009 + Math.random() * 0.004;

  p.life = 2.8 + Math.random() * 0.8;
  p.maxLife = p.life;

  const { r, g, b } = parseColorToRGB(colorInput);

  p.color = `rgba(${r}, ${g}, ${b}, 0.9)`;
  // Rich starting size so particles overlap into a thick, dense pillar
  p.size = 0.18 + Math.random() * 0.08;
  p.baseSize = p.size;
  p.alpha = 0.9;
  p.floorZ = floorZ !== undefined ? floorZ : worldZ;
  p.type = 'smoke';
  p.useGravity = false;
  // Billowing expansion as it rises upward
  p.sizeGrowth = 1.012;
  // Low friction so upward draft stays strong throughout its lifespan
  p.friction = 0.992;
  p.isForeground = false;
  return p;
};

export const createFlareTrailParticles = (
  worldX: number,
  worldY: number,
  worldZ: number,
  colorInput?: any,
  floorZ?: number
): Particle[] => {
  const particles: Particle[] = [];
  const { r, g, b } = parseColorToRGB(colorInput);

  const count = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const p = getParticle();
    p.worldX = worldX + (Math.random() - 0.5) * 0.04;
    p.worldY = worldY + (Math.random() - 0.5) * 0.04;
    p.worldZ = worldZ + (Math.random() - 0.5) * 0.02;
    p.wvx = (Math.random() - 0.5) * 0.0008;
    p.wvy = (Math.random() - 0.5) * 0.0008;
    p.wvz = 0.008 + Math.random() * 0.003;
    p.x = 0; p.y = 0; p.dist = 0;
    p.life = 2.2 + Math.random() * 0.6;
    p.maxLife = p.life;
    p.color = `rgba(${r}, ${g}, ${b}, 0.9)`;
    p.size = 0.16 + Math.random() * 0.06;
    p.baseSize = p.size;
    p.alpha = 0.9;
    p.floorZ = floorZ !== undefined ? floorZ : (worldZ - 0.2);
    p.type = 'smoke';
    p.useGravity = false;
    p.sizeGrowth = 1.010;
    p.friction = 0.990;
    p.isForeground = false;
    particles.push(p);
  }
  return particles;
};

export const createCasingParticle = (
  worldX: number,
  worldY: number,
  worldZ: number,
  textureId: string,
  scale: number,
  direction: 'left' | 'right',
  playerAngle: number,
  soundId?: string,
  casingGroundScaleMultiplier: number = 0.10,
  isPlayerCasing: boolean = true,
  isReload: boolean = false
): Particle[] => {
  // Calculate ejection velocity based on player angle and direction
  // To prevent casings from flying behind the player, we use an angle 
  // that points to the side and slightly forward (45 to 80 degrees relative to player's view).
  const randomForwardAngle = Math.PI / 4 + Math.random() * (Math.PI / 5); // 45 to 81 degrees
  const finalAngle = playerAngle + (direction === 'right' ? randomForwardAngle : -randomForwardAngle);
  
  // Set initial velocity
  const speed = (isReload ? (0.01 + Math.random() * 0.01) : (0.02 + Math.random() * 0.02)); 
  
  const p = casingParticles[casingIndex];
  
  // Fully clear velocity to be absolutely bullet-proof against accumulation
  p.wvx = 0;
  p.wvy = 0;
  p.wvz = 0;

  p.worldX = worldX;
  p.worldY = worldY;
  p.worldZ = worldZ;
  p.wvx = Math.cos(finalAngle) * speed;
  p.wvy = Math.sin(finalAngle) * speed;
  p.wvz = (isReload ? (0.012 + Math.random() * 0.015) : (0.015 + Math.random() * 0.015));
  p.x = 0; p.y = 0; p.dist = 0;
  p.life = 3.0; // Keep same life
  p.maxLife = 3.0;
  p.color = '#ffffff';
  p.size = scale * 0.05; // Adjust base size
  p.floorZ = 0;
  p.type = 'casing';
  p.textureId = textureId;
  p.soundId = soundId;
  p.uvRect = { u: 0, v: 0, w: 1, h: 1 };
  p.rotation = Math.random() * Math.PI * 2;
  p.rotationSpeed = (direction === 'right' ? (0.3 + Math.random() * 0.3) : -(0.3 + Math.random() * 0.3));
  if (isReload) p.rotationSpeed *= 0.7;
  p.isForeground = isPlayerCasing;
  p.bounceCount = 0;
  p.maxBounces = isReload ? (3 + Math.floor(Math.random() * 2)) : (3 + Math.floor(Math.random() * 3));
  p.casingGroundScaleMultiplier = casingGroundScaleMultiplier;
  p.landed = false;
  p.isReload = isReload;

  casingIndex = (casingIndex + 1) % casingParticles.length;
  
  return []; // Return empty array so it doesn't get added to the general particle pool
};

export const createMolotovTrailParticles = (
  worldX: number,
  worldY: number,
  worldZ: number
): Particle[] => {
  const particles: Particle[] = [];
  
  // 1-2 fire particles
  const fireCount = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < fireCount; i++) {
      const colors = ['rgba(255, 150, 0, 0.9)', 'rgba(255, 200, 50, 0.9)', 'rgba(255, 50, 0, 0.8)'];
      const p = getParticle();
      p.worldX = worldX + (Math.random() - 0.5) * 0.1;
      p.worldY = worldY + (Math.random() - 0.5) * 0.1;
      p.worldZ = worldZ + (Math.random() - 0.5) * 0.1;
      p.wvx = (Math.random() - 0.5) * 0.03;
      p.wvy = (Math.random() - 0.5) * 0.03;
      p.wvz = (Math.random() - 0.5) * 0.03;
      p.x = 0; p.y = 0; p.dist = 0;
      p.life = 0.15 + Math.random() * 0.15;
      p.maxLife = 0.3;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.size = 0.5 + Math.random() * 0.75;
      p.baseSize = p.size;
      p.floorZ = 0;
      p.type = 'fire';
      p.isForeground = false;
      particles.push(p);
  }

  // 3-5 thick, dark smoke particles for a dense trail
  const smokeCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < smokeCount; i++) {
      const p = getParticle();
      p.worldX = worldX + (Math.random() - 0.5) * 0.1;
      p.worldY = worldY + (Math.random() - 0.5) * 0.1;
      p.worldZ = worldZ + (Math.random() - 0.5) * 0.1;
      p.wvx = (Math.random() - 0.5) * 0.015;
      p.wvy = (Math.random() - 0.5) * 0.015;
      p.wvz = 0.01 + Math.random() * 0.03;
      p.x = 0; p.y = 0; p.dist = 0;
      p.life = 0.8 + Math.random() * 0.5;
      p.maxLife = 1.3;
      p.color = 'rgba(10, 10, 10, 0.95)';
      p.size = 0.3 + Math.random() * 0.3;
      p.baseSize = p.size;
      p.floorZ = 0;
      p.type = 'smoke';
      p.isForeground = false;
      particles.push(p);
  }
  
  return particles;
};

export const createMolotovExplosionParticles = (
  worldX: number,
  worldY: number,
  worldZ: number
): Particle[] => {
  const particles: Particle[] = [];
  
  // They explode near the floor
  const startZ = 0.05;
  
  // Fire particles bursting outwards
  const fireCount = 25 + Math.floor(Math.random() * 15);
  for (let i = 0; i < fireCount; i++) {
      const colors = ['rgba(255, 150, 0, 0.9)', 'rgba(255, 200, 50, 0.9)', 'rgba(255, 50, 0, 0.8)', 'rgba(255, 255, 200, 0.9)'];
      // Reduced horizontal speed to keep them close
      const speed = 0.02 + Math.random() * 0.04; 
      const angle = Math.random() * Math.PI * 2;
      const p = getParticle();
      p.worldX = worldX; 
      p.worldY = worldY; 
      p.worldZ = startZ;
      p.wvx = Math.cos(angle) * speed;
      p.wvy = Math.sin(angle) * speed;
      p.wvz = 0.06 + Math.random() * 0.06; 
      p.x = 0; p.y = 0; p.dist = 0;
      p.life = 0.6 + Math.random() * 0.4;
      p.maxLife = 1.0;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.size = 0.2 + Math.random() * 0.3;
      p.floorZ = 0;
      p.type = 'fire';
      p.isForeground = false;
      p.useGravity = true;
      p.sizeGrowth = 1.00;
      particles.push(p);
  }

  // Smoke particles bursting outwards
  const smokeCount = 15 + Math.floor(Math.random() * 10);
  for (let i = 0; i < smokeCount; i++) {
      // Reduced horizontal speed to keep them close
      const speed = 0.015 + Math.random() * 0.03; 
      const angle = Math.random() * Math.PI * 2;
      const p = getParticle();
      p.worldX = worldX; 
      p.worldY = worldY; 
      p.worldZ = startZ;
      p.wvx = Math.cos(angle) * speed;
      p.wvy = Math.sin(angle) * speed;
      p.wvz = 0.05 + Math.random() * 0.05;
      p.x = 0; p.y = 0; p.dist = 0;
      p.life = 1.0 + Math.random() * 0.6;
      p.maxLife = 2.0;
      p.color = 'rgba(15, 15, 15, 0.95)';
      p.size = 0.3 + Math.random() * 0.4;
      p.floorZ = 0;
      p.type = 'smoke';
      p.isForeground = false;
      p.useGravity = true;
      p.sizeGrowth = 1.01;
      particles.push(p);
  }
  
  return particles;
};

export const createSmokeParticle = (
  worldX: number,
  worldY: number,
  worldZ: number
): Particle[] => {
  const p = getParticle();
  p.worldX = worldX;
  p.worldY = worldY;
  p.worldZ = worldZ;
  p.wvx = (Math.random() - 0.5) * 0.02;
  p.wvy = (Math.random() - 0.5) * 0.02;
  p.wvz = 0.01 + Math.random() * 0.02;
  p.x = 0; p.y = 0; p.dist = 0;
  p.life = 0.8 + Math.random() * 0.4;
  p.maxLife = 1.2;
  p.color = 'rgba(20, 20, 20, 0.8)';
  p.size = 0.5 + Math.random() * 0.5;
  p.floorZ = 0;
  p.type = 'smoke';
  p.isForeground = false;
  return [p];
};

export const createBrickParticles = (
  worldX: number,
  worldY: number,
  textureId: string,
  amount: number = 12
): Particle[] => {
  const particles: Particle[] = [];
  
  // Create a grid of bricks from the texture
  // We assume texture is roughly square for UV mapping
  const rows = 3;
  const cols = 3;
  
  for (let i = 0; i < amount; i++) {
    // Randomize UV slightly to pick different parts of the wall
    const u = Math.random() * 0.7;
    const v = Math.random() * 0.7;
    const w = 0.2 + Math.random() * 0.1;
    const h = 0.1 + Math.random() * 0.1;
    
    const size = 0.04 + Math.random() * 0.04; // Smaller brick size
    const speed = 0.05 + Math.random() * 0.08;
    const angle = Math.random() * Math.PI * 2;
    const upForce = 0.05 + Math.random() * 0.1;

    const p = getParticle();
    p.worldX = worldX + (Math.random() - 0.5) * 0.2;
    p.worldY = worldY + (Math.random() - 0.5) * 0.2;
    p.worldZ = 0.5 + (Math.random() - 0.5) * 0.4;
    p.wvx = Math.cos(angle) * speed;
    p.wvy = Math.sin(angle) * speed;
    p.wvz = upForce;
    p.x = 0; p.y = 0; p.dist = 0;
    p.life = 1.0;
    p.maxLife = 1.0;
    p.color = '#ffffff';
    p.size = size;
    p.floorZ = 0;
    p.type = 'brick';
    p.textureId = textureId;
    p.soundId = 'SYS_BRICK_HIT';
    p.uvRect = { u, v, w, h };
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 0.4;
    particles.push(p);
  }
  return particles;
};

export const createBloodParticles = (
  worldX: number, 
  worldY: number, 
  worldZ: number,
  amount: number,
  options?: { scale?: number, speedScale?: number }
): Particle[] => {
  const colors = ['#ef4444', '#b91c1c', '#991b1b', '#7f1d1d', '#500707'];
  
  const scale = options?.scale ?? 1.0;
  const speedScale = (options?.speedScale ?? 1.0) * 0.12; 

  for (let i = 0; i < amount; i++) {
    const horizontalSpread = speedScale * 0.4; 
    const wvx = (Math.random() - 0.5) * horizontalSpread;
    const wvy = (Math.random() - 0.5) * horizontalSpread;
    const wvz = (Math.random() * 0.5 + 0.2) * speedScale; 

    const p = bloodParticles[bloodIndex];
    p.worldX = worldX;
    p.worldY = worldY;
    p.worldZ = worldZ;
    p.wvx = wvx;
    p.wvy = wvy;
    p.wvz = wvz;
    p.x = 0; p.y = 0; p.dist = 0;
    p.life = 1.0;
    p.maxLife = 1.0;
    p.color = colors[Math.floor(Math.random() * colors.length)];
    p.size = (Math.random() * 1.5 + 0.5) * scale;
    p.floorZ = 0;
    p.type = 'blood';
    p.isForeground = false;
    p.landed = false;

    bloodIndex = (bloodIndex + 1) % bloodParticles.length;
  }
  return [];
};

export const createDirectionalBlood = (
  startX: number,
  startY: number,
  startZ: number,
  targetX: number,
  targetY: number,
  amount: number
): Particle[] => {
  const colors = ['#ef4444', '#b91c1c', '#991b1b', '#dc2626'];

  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ndx = dist > 0 ? dx / dist : 0;
  const ndy = dist > 0 ? dy / dist : 0;

  for (let i = 0; i < amount; i++) {
    const angleSpread = (Math.random() - 0.5) * 1.0; 
    const ca = Math.cos(angleSpread);
    const sa = Math.sin(angleSpread);
    const vx = ndx * ca - ndy * sa;
    const vy = ndx * sa + ndy * ca;

    const speed = 0.02 + Math.random() * 0.04; 
    
    const p = bloodParticles[bloodIndex];
    p.worldX = startX + (Math.random() - 0.5) * 0.1;
    p.worldY = startY + (Math.random() - 0.5) * 0.1;
    p.worldZ = startZ + (Math.random() * 0.2);
    p.wvx = vx * speed;
    p.wvy = vy * speed;
    p.wvz = 0.02 + Math.random() * 0.05;
    p.x = 0; p.y = 0; p.dist = 0;
    p.life = 1.0;
    p.maxLife = 1.0;
    p.color = colors[Math.floor(Math.random() * colors.length)];
    p.size = 0.3 + Math.random() * 0.5;
    p.floorZ = 0;
    p.type = 'blood';
    p.isForeground = true;
    p.landed = false;

    bloodIndex = (bloodIndex + 1) % bloodParticles.length;
  }
  return [];
};

export const createRainSplash = (worldX: number, worldY: number): Particle[] => {
    const count = 2 + Math.floor(Math.random() * 4); 
    for (let i = 0; i < count; i++) {
        const p = rainSplashParticles[rainSplashIndex];
        p.worldX = worldX;
        p.worldY = worldY;
        p.worldZ = 0.02;
        p.wvx = (Math.random() - 0.5) * 0.02;
        p.wvy = (Math.random() - 0.5) * 0.02;
        p.wvz = 0.04 + Math.random() * 0.06;
        p.x = 0; p.y = 0; p.dist = 0;
        p.life = 0.4 + Math.random() * 0.4;
        p.maxLife = 1.0;
        p.color = 'rgba(230, 245, 255, 0.95)';
        p.size = 0.4 + Math.random() * 0.6;
        p.floorZ = 0;
        p.type = 'splash';
        
        rainSplashIndex = (rainSplashIndex + 1) % rainSplashParticles.length;
    }
    return [];
};

export const createRainParticles = (
  playerX: number,
  playerY: number,
  amount: number,
  playerDirX?: number,
  playerDirY?: number,
  fov?: number,
  outdoorMap?: boolean[][],
  grids?: any[][][]
): Particle[] => {
  const particles: Particle[] = [];
  
  const playerAngle = (playerDirX !== undefined && playerDirY !== undefined) 
      ? Math.atan2(playerDirY, playerDirX) 
      : 0;

  for (let i = 0; i < amount; i++) {
    let newX = playerX + (Math.random() - 0.5) * 10;
    let newY = playerY + (Math.random() - 0.5) * 10;
    
    let validSpawn = false;
    let attempts = 0;
    
    while (!validSpawn && attempts < 5) {
        // Spawn in a full circle around the player
        const spawnDist = Math.random() * 10;
        const spawnAngle = Math.random() * Math.PI * 2;
        
        newX = playerX + Math.cos(spawnAngle) * spawnDist;
        newY = playerY + Math.sin(spawnAngle) * spawnDist;
        
        const stx = Math.floor(newX);
        const sty = Math.floor(newY);
        
        if (outdoorMap && sty >= 0 && sty < outdoorMap.length && stx >= 0 && stx < outdoorMap[0].length) {
            if (outdoorMap[sty][stx]) {
                validSpawn = true;
                if (grids && grids.length > 1) {
                    const upperTile = grids[1][sty]?.[stx];
                    if (upperTile && (upperTile.type === 'WALL' || upperTile.bottomTextureId)) {
                        validSpawn = false;
                    }
                }
            }
        } else {
            validSpawn = true; // Fallback if no map
        }
        attempts++;
    }
    
    const rz = Math.random() * 15; 
    
    const p = getParticle();
    p.worldX = newX;
    p.worldY = newY;
    p.worldZ = rz;
    p.wvx = (Math.random() - 0.5) * 0.015;
    p.wvy = (Math.random() - 0.5) * 0.015;
    p.wvz = -0.25 - Math.random() * 0.15;
    p.x = 0; p.y = 0; p.dist = 0;
    p.life = 0.7 + Math.random() * 0.3;
    p.maxLife = 1.0;
    p.color = 'rgba(215, 235, 255, 0.8)';
    p.size = 0.6 + Math.random() * 0.8;
    p.floorZ = 0;
    p.type = 'rain';
    particles.push(p);
  }
  return particles;
};

export const createFlyParticles = (
  screenX: number,
  screenY: number,
  dist: number,
  amount: number
): Particle[] => {
  const particles: Particle[] = [];
  for (let i = 0; i < amount; i++) {
    const p = getParticle();
    p.worldX = 0; p.worldY = 0; p.worldZ = 0;
    p.wvx = 0; p.wvy = 0; p.wvz = 0;
    p.x = screenX;
    p.y = screenY;
    p.dist = dist - 0.05;
    p.life = 1.0;
    p.maxLife = 1.0;
    p.color = '#080808';
    p.size = 2;
    p.baseSize = 0.015 + Math.random() * 0.01;
    p.floorZ = 0;
    p.type = 'fly';
    p.originX = screenX;
    p.originY = screenY;
    p.offsetX = (Math.random() - 0.5) * 0.8;
    p.offsetY = (Math.random() - 0.5) * 0.7;
    p.angle = Math.random() * Math.PI * 2;
    p.radius = 5;
    p.baseRadius = 4 + Math.random() * 6;
    p.buzzSpeed = 0.12 + Math.random() * 0.1;
    particles.push(p);
  }
  return particles;
};

const maskBufferCache = new Map<string, { data: Uint32Array, width: number, height: number }>();

export const getMaskBuffer = (maskId: string, spriteMap: Map<string, HTMLImageElement | HTMLCanvasElement>): { data: Uint32Array, width: number, height: number } | null => {
  if (maskBufferCache.has(maskId)) {
    return maskBufferCache.get(maskId)!;
  }

  const maskImg = spriteMap.get(maskId) || spriteMap.get(`TEX_${maskId}`);
  if (!maskImg || maskImg.width === 0 || maskImg.height === 0) return null;

  const cvs = document.createElement('canvas');
  cvs.width = maskImg.width;
  cvs.height = maskImg.height;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(maskImg, 0, 0);
  const data = ctx.getImageData(0, 0, cvs.width, cvs.height);
  const buffer = {
    data: new Uint32Array(data.data.buffer),
    width: cvs.width,
    height: cvs.height
  };

  maskBufferCache.set(maskId, buffer);
  return buffer;
};

export interface ShardTemplate {
  uvRect: { u: number, v: number, w: number, h: number };
  points: { x: number, y: number }[];
  decalBuffer: { data: Uint32Array, width: number, height: number, type: 'FLOOR' };
  preRenderedCanvas?: HTMLCanvasElement;
}

const shardTemplateCache = new Map<string, ShardTemplate[]>();

export const precalculateShards = (textureId: string, maskId: string, spriteMap: Map<string, HTMLImageElement | HTMLCanvasElement>, sizeMult: number = 1.0) => {
  const cacheKey = `${textureId}_${maskId}_${sizeMult}`;
  if (shardTemplateCache.has(cacheKey)) return;

  const maskBuffer = getMaskBuffer(maskId, spriteMap);
  if (!maskBuffer) return;

  let img = spriteMap.get(textureId) || spriteMap.get(`TEX_${textureId}`);
  if (!img || img.width === 0 || img.height === 0) {
      img = spriteMap.get('TEX_FALLBACK');
  }
  if (!img || img.width === 0 || img.height === 0) return;

  const templates: ShardTemplate[] = [];
  const { data, width, height } = maskBuffer;

  const cvs = document.createElement('canvas');
  cvs.width = 64;
  cvs.height = 64;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  for (let i = 0; i < 20; i++) {
    let found = false;
    let u = 0, v = 0;

    for (let attempt = 0; attempt < 10; attempt++) {
      u = Math.random();
      v = Math.random();
      const tx = Math.floor(u * width);
      const ty = Math.floor(v * height);
      const color = data[ty * width + tx];
      const r = (color >> 0) & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = (color >> 16) & 0xFF;

      if (textureId !== maskId) {
        if (g > 200 && r < 100 && b < 100) {
          found = true;
          break;
        }
      } else {
        const a = (color >> 24) & 0xFF;
        if (a > 50) {
          found = true;
          break;
        }
      }
    }

    if (!found) continue;

    const pointsCount = 3 + Math.floor(Math.random() * 2);
    const points: {x: number, y: number}[] = [];
    for (let p = 0; p < pointsCount; p++) {
        const angle = (p / pointsCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 0.3 + Math.random() * 0.7;
        points.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
    }

    const uvRect = {
      u: Math.max(0, u - 0.05),
      v: Math.max(0, v - 0.05),
      w: 0.1,
      h: 0.1
    };

    // Pre-render the decal buffer
    ctx.clearRect(0, 0, 64, 64);
    ctx.save();
    ctx.translate(32, 32);
    
    // Random rotation for the decal
    const rotation = Math.random() * Math.PI * 2;
    ctx.rotate(rotation);

    const shardSize = 12 * sizeMult;
    const drawW = shardSize * 2;
    const drawH = shardSize * 2;

    ctx.beginPath();
    points.forEach((pt: any, idx: number) => {
        if (idx === 0) ctx.moveTo(pt.x * shardSize, pt.y * shardSize);
        else ctx.lineTo(pt.x * shardSize, pt.y * shardSize);
    });
    ctx.closePath();
    ctx.clip();

    ctx.globalAlpha = 0.3;
    ctx.drawImage(
        img,
        uvRect.u * img.width,
        uvRect.v * img.height,
        uvRect.w * img.width,
        uvRect.h * img.height,
        -drawW / 2, -drawH / 2, drawW, drawH
    );
    ctx.restore();

    // Glass outline
    ctx.save();
    ctx.translate(32, 32);
    ctx.rotate(rotation);
    
    ctx.beginPath();
    points.forEach((pt: any, idx: number) => {
        if (idx === 0) ctx.moveTo(pt.x * shardSize, pt.y * shardSize);
        else ctx.lineTo(pt.x * shardSize, pt.y * shardSize);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(220, 230, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    
    const preRenderedCanvas = document.createElement('canvas') as any;
    preRenderedCanvas.version = 'shard_template_' + Math.random().toString(36).substring(7);
    preRenderedCanvas.width = 64;
    preRenderedCanvas.height = 64;
    preRenderedCanvas.getContext('2d')?.drawImage(cvs, 0, 0);

    const decalBuffer = {
        data: new Uint32Array(ctx.getImageData(0, 0, 64, 64).data.buffer),
        width: 64,
        height: 64,
        type: 'FLOOR' as const
    };

    templates.push({ uvRect, points, decalBuffer, preRenderedCanvas });
  }

  shardTemplateCache.set(cacheKey, templates);
};

export const createExplodingDecorationParticles = (
  worldX: number,
  worldY: number,
  worldZ: number,
  textureId: string,
  amount: number = 20,
  explodeSound?: string,
  scale: number = 1.0
): Particle[] => {
  const particles: Particle[] = [];
  
  for (let i = 0; i < amount; i++) {
      const u = Math.random();
      const v = Math.random();
      
      const speed = 0.05 + Math.random() * 0.15;
      const angle = Math.random() * Math.PI * 2;
      const upForce = 0.05 + Math.random() * 0.15;
      
      const pointsCount = 3 + Math.floor(Math.random() * 3);
      const points = [];
      for (let ptIdx = 0; ptIdx < pointsCount; ptIdx++) {
          const ptAngle = (ptIdx / pointsCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
          const dist = 0.4 + Math.random() * 0.4;
          points.push({ x: Math.cos(ptAngle) * dist, y: Math.sin(ptAngle) * dist });
      }
      
      const p = getParticle();
      p.worldX = worldX + (Math.random() - 0.5) * 0.4;
      p.worldY = worldY + (Math.random() - 0.5) * 0.4;
      p.worldZ = worldZ + (Math.random() - 0.5) * 0.4;
      p.wvx = Math.cos(angle) * speed;
      p.wvy = Math.sin(angle) * speed;
      p.wvz = upForce;
      p.x = 0; p.y = 0; p.dist = 0;
      p.life = 5.0 + Math.random() * 5.0;
      p.maxLife = 10.0;
      p.color = '#ffffff';
      p.size = scale * (0.8 + Math.random() * 0.5); 
      p.floorZ = 0;
      p.type = 'deco_gib';
      p.isForeground = true;
      p.textureId = textureId;
      p.soundId = explodeSound; 
      p.uvRect = { 
        u: Math.max(0, Math.min(1.0, u - 0.1)), 
        v: Math.max(0, Math.min(1.0, v - 0.1)), 
        w: 0.15 + Math.random() * 0.15, 
        h: 0.15 + Math.random() * 0.15 
      };
      p.points = points;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = (Math.random() - 0.5) * 0.3;
      particles.push(p);
  }
  return particles;
};

export const createShardParticles = (
  worldX: number,
  worldY: number,
  worldZ: number,
  textureId: string,
  maskId: string,
  maskBuffer: { data: Uint32Array, width: number, height: number },
  amount: number,
  sizeMult: number = 1.0,
  spriteMap?: Map<string, HTMLImageElement | HTMLCanvasElement>
): Particle[] => {
  const particles: Particle[] = [];
  
  const cacheKey = `${textureId}_${maskId}_${sizeMult}`;
  let templates = shardTemplateCache.get(cacheKey);
  
  if (!templates && spriteMap) {
      precalculateShards(textureId, maskId, spriteMap, sizeMult);
      templates = shardTemplateCache.get(cacheKey);
  }
  
  for (let i = 0; i < amount; i++) {
    let uvRect, points, decalBuffer, preRenderedCanvas;
    
    if (templates && templates.length > 0) {
        const template = templates[Math.floor(Math.random() * templates.length)];
        uvRect = template.uvRect;
        points = template.points;
        decalBuffer = template.decalBuffer;
        preRenderedCanvas = template.preRenderedCanvas;
    } else {
        // Fallback if not precalculated
        const { data, width, height } = maskBuffer;
        let found = false;
        let u = 0, v = 0;
        
        for (let attempt = 0; attempt < 10; attempt++) {
          u = Math.random();
          v = Math.random();
          const tx = Math.floor(u * width);
          const ty = Math.floor(v * height);
          const color = data[ty * width + tx];
          const r = (color >> 0) & 0xFF;
          const g = (color >> 8) & 0xFF;
          const b = (color >> 16) & 0xFF;
          
          if (textureId !== maskId) {
            if (g > 200 && r < 100 && b < 100) {
              found = true;
              break;
            }
          } else {
            const a = (color >> 24) & 0xFF;
            if (a > 50) {
              found = true;
              break;
            }
          }
        }
        
        if (!found) continue;
        
        const pointsCount = 3 + Math.floor(Math.random() * 2);
        points = [];
        for (let p = 0; p < pointsCount; p++) {
            const angle = (p / pointsCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = 0.3 + Math.random() * 0.7;
            points.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
        }
        
        uvRect = {
          u: Math.max(0, u - 0.05),
          v: Math.max(0, v - 0.05),
          w: 0.1,
          h: 0.1
        };
    }
    
    const size = (0.04 + Math.random() * 0.06) * sizeMult; 
    const speed = (0.02 + Math.random() * 0.04) * (0.5 + sizeMult * 0.5); // Slower shards if smaller
    const angle = Math.random() * Math.PI * 2;

    const p = getParticle();
    p.worldX = worldX + (Math.random() - 0.5) * 0.4;
    p.worldY = worldY + (Math.random() - 0.5) * 0.4;
    p.worldZ = worldZ + (Math.random() - 0.5) * 0.4;
    p.wvx = Math.cos(angle) * speed;
    p.wvy = Math.sin(angle) * speed;
    p.wvz = (Math.random() * 0.06);
    p.x = 0; p.y = 0; p.dist = 0;
    p.life = 5.0 + Math.random() * 5.0;
    p.maxLife = 10.0;
    p.color = '#ffffff';
    p.size = size;
    p.floorZ = 0;
    p.type = 'shard';
    p.isForeground = true;
    p.textureId = textureId;
    p.uvRect = uvRect;
    p.points = points;
    p.decalBuffer = decalBuffer;
    p.preRenderedCanvas = preRenderedCanvas;
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 0.2;
    p.sizeMult = sizeMult;
    particles.push(p);
  }
  
  return particles;
};

const gibIslandsCache = new Map<string, { [key: string]: { minX: number, minY: number, maxX: number, maxY: number, decalBuffer?: any }[] }>();

const smokeTextureCache = new Map<string, HTMLCanvasElement>();
export const getParticleSoftTexture = (color: string): HTMLCanvasElement => {
    let canvas = smokeTextureCache.get(color);
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const radGrad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (rgbMatch) {
               const r = rgbMatch[1];
               const g = rgbMatch[2];
               const b = rgbMatch[3];
               // Base alpha multiplier to keep it soft
               const startA = parseFloat(rgbMatch[4] || '1');
               radGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${startA})`);
               radGrad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${startA * 0.7})`);
               radGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            } else {
               radGrad.addColorStop(0, color);
               radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            }
            ctx.fillStyle = radGrad;
            ctx.fillRect(0, 0, 64, 64);
        }
        smokeTextureCache.set(color, canvas);
    }
    return canvas;
};

const batches = new Map<string, Particle[]>();
const texturedParticles: Particle[] = [];

const rotatedCasingCache = new Map<string, HTMLCanvasElement>();

const MAX_CASING_CACHE = 32;

const getRotatedCasing = (textureId: string, img: HTMLImageElement | HTMLCanvasElement, angle: number, r: number = 1.0, g: number = 1.0, b: number = 1.0): HTMLCanvasElement => {
    // Quantize color and angle to avoid too many cached images
    // 16 distinct angles is perfectly smooth for tiny bullet casings
    const angleLevel = Math.round((angle / (Math.PI * 2)) * 16) * (Math.PI * 2 / 16);
    const rLevel = Math.round(r * 5) / 5;
    const gLevel = Math.round(g * 5) / 5;
    const bLevel = Math.round(b * 5) / 5;
    const cacheKey = `${textureId}_${angleLevel.toFixed(3)}_${rLevel}_${gLevel}_${bLevel}`;
    let cached = rotatedCasingCache.get(cacheKey);
    if (cached) return cached;
    
    if (rotatedCasingCache.size >= MAX_CASING_CACHE) {
        const evictCount = 8;
        let count = 0;
        for (const k of rotatedCasingCache.keys()) {
            rotatedCasingCache.delete(k);
            count++;
            if (count >= evictCount) break;
        }
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angleLevel);
        
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        if (rLevel < 1.0 || gLevel < 1.0 || bLevel < 1.0) {
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = `rgb(${Math.round(rLevel * 255)}, ${Math.round(gLevel * 255)}, ${Math.round(bLevel * 255)})`;
            ctx.fillRect(-img.width / 2, -img.height / 2, img.width, img.height);
            
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    rotatedCasingCache.set(cacheKey, canvas);
    return canvas;
};

export const precalculateGibs = (textureId: string, maskBuffer: { data: Uint32Array, width: number, height: number }, spriteMap: Map<string, HTMLImageElement | HTMLCanvasElement>) => {
  if (gibIslandsCache.has(textureId)) return;

  const { data, width, height } = maskBuffer;
  const islands: { [key: string]: { minX: number, minY: number, maxX: number, maxY: number, decalBuffer?: { data: Uint32Array, width: number, height: number, type: 'FLOOR' } }[] } = {
    head: [],
    body: [],
    arms: [],
    legs: []
  };

  const visited = new Uint8Array(width * height);
  const qxQueue = new Int32Array(width * height);
  const qyQueue = new Int32Array(width * height);

  const getPartType = (r: number, g: number, b: number, a: number) => {
      if (a < 128) return null;
      if (r > 200 && g < 50 && b < 50) return 'head';
      if (r < 50 && g > 200 && b < 50) return 'body';
      if (r < 50 && g < 50 && b > 200) return 'legs';
      if (r > 200 && g > 200 && b < 50) return 'arms';
      return null;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const color = data[idx];
      const r = (color >> 0) & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = (color >> 16) & 0xFF;
      const a = (color >> 24) & 0xFF;

      const partType = getPartType(r, g, b, a);
      if (!partType) {
        visited[idx] = 1;
        continue;
      }

      let minX = x, minY = y, maxX = x, maxY = y;
      let head = 0, tail = 0;
      qxQueue[tail] = x;
      qyQueue[tail] = y;
      tail++;
      visited[idx] = 1;

      while (head < tail) {
        const cx = qxQueue[head];
        const cy = qyQueue[head];
        head++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx]) {
              const nColor = data[nIdx];
              const nr = (nColor >> 0) & 0xFF;
              const ng = (nColor >> 8) & 0xFF;
              const nb = (nColor >> 16) & 0xFF;
              const na = (nColor >> 24) & 0xFF;
              
              if (getPartType(nr, ng, nb, na) === partType) {
                visited[nIdx] = 1;
                qxQueue[tail] = nx;
                qyQueue[tail] = ny;
                tail++;
              }
            }
          }
        }
      }

      islands[partType].push({ minX, minY, maxX, maxY });
    }
  }

  // Precalculate decal buffers for each island
  const img = spriteMap.get(textureId) || spriteMap.get(`TEX_${textureId}`);
  if (img && img.width > 0 && img.height > 0) {
    const cvs = document.createElement('canvas');
    cvs.width = 64;
    cvs.height = 64;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      for (const partType in islands) {
        for (const island of islands[partType]) {
          const u = island.minX / width;
          const v = island.minY / height;
          const w = (island.maxX - island.minX + 1) / width;
          const h = (island.maxY - island.minY + 1) / height;

          ctx.clearRect(0, 0, 64, 64);
          ctx.save();
          ctx.translate(32, 32);
          
          const rotation = Math.random() * Math.PI * 2;
          ctx.rotate(rotation);

          const aspect = w / h;
          // We don't know the exact scale here, assume 1.0 for decal precalculation.
          // If scale is different, it will just be slightly wrong size on the floor, which is fine for gibs.
          const baseSize = 1.0 * 120; 
          const drawW = baseSize * (aspect > 1 ? 1 : aspect);
          const drawH = baseSize * (aspect < 1 ? 1 : 1 / aspect);

          ctx.drawImage(
              img,
              u * img.width,
              v * img.height,
              w * img.width,
              h * img.height,
              -drawW / 2, -drawH / 2, drawW, drawH
          );
          ctx.restore();

          island.decalBuffer = {
              data: new Uint32Array(ctx.getImageData(0, 0, 64, 64).data.buffer),
              width: 64,
              height: 64,
              type: 'FLOOR' as const
          };
        }
      }
    }
  }

  gibIslandsCache.set(textureId, islands as any);
};

export const createGibParticles = (
  worldX: number,
  worldY: number,
  worldZ: number,
  textureId: string,
  maskBuffer: { data: Uint32Array, width: number, height: number },
  gibCounts: { head?: number, body?: number, arms?: number, legs?: number },
  scale: number = 1.0,
  spriteMap?: Map<string, HTMLImageElement | HTMLCanvasElement>
): Particle[] => {
  const particles: Particle[] = [];
  
  if (!gibIslandsCache.has(textureId) && spriteMap) {
    precalculateGibs(textureId, maskBuffer, spriteMap);
  }
  
  const islands = gibIslandsCache.get(textureId);
  if (!islands) return particles;
  
  const { width, height } = maskBuffer;
  
  const createGibsForPart = (partType: string, count: number) => {
    const partIslands = islands[partType];
    if (partIslands.length === 0 || count <= 0) return;
    
    for (let i = 0; i < count; i++) {
      const island = partIslands[Math.floor(Math.random() * partIslands.length)];
      
      const u = island.minX / width;
      const v = island.minY / height;
      const w = (island.maxX - island.minX + 1) / width;
      const h = (island.maxY - island.minY + 1) / height;
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.05 + Math.random() * 0.1;
      const size = scale; 
      
      const p = getParticle();
      p.worldX = worldX + (Math.random() - 0.5) * 0.2;
      p.worldY = worldY + (Math.random() - 0.5) * 0.2;
      p.worldZ = worldZ + (Math.random() * 0.2);
      p.wvx = Math.cos(angle) * speed;
      p.wvy = Math.sin(angle) * speed;
      p.wvz = 0.05 + Math.random() * 0.1;
      p.x = 0; p.y = 0; p.dist = 0;
      p.life = 5.0 + Math.random() * 5.0;
      p.maxLife = 10.0;
      p.color = '#ff0000';
      p.size = size;
      p.floorZ = 0;
      p.type = 'gib';
      p.textureId = textureId;
      p.uvRect = { u, v, w, h };
      p.decalBuffer = island.decalBuffer;
      p.points = [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 }
      ];
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = (Math.random() - 0.5) * 0.4;
      particles.push(p);
    }
  };
  
  if (gibCounts.head) createGibsForPart('head', gibCounts.head);
  if (gibCounts.body) createGibsForPart('body', gibCounts.body);
  if (gibCounts.arms) createGibsForPart('arms', gibCounts.arms);
  if (gibCounts.legs) createGibsForPart('legs', gibCounts.legs);
  
  return particles;
};

export const updateRainSplashParticles = () => {
    for (let i = 0; i < rainSplashParticles.length; i++) {
        const p = rainSplashParticles[i];
        if (p.life <= 0) continue;
        
        p.worldX += p.wvx;
        p.worldY += p.wvy;
        p.worldZ += p.wvz;
        p.wvz -= 0.015; 
        p.life -= 0.06; 
    }
};

export const updateBloodParticles = (
    grid?: Tile[][], 
    mapWidth?: number,
    mapHeight?: number,
    onParticleHit?: (x: number, y: number, z: number, type: 'WALL' | 'FLOOR' | 'DOOR', face?: number) => void
) => {
    const gravity = 0.005;
    for (let i = 0; i < bloodParticles.length; i++) {
        const p = bloodParticles[i];
        if (p.life <= 0) continue;
        
        let dynamicFloorZ = 0;
        if (grid) {
            const tileX = Math.floor(p.worldX);
            const tileY = Math.floor(p.worldY);
            if (tileY >= 0 && tileY < grid.length && tileX >= 0 && tileX < grid[tileY].length) {
                const tile = grid[tileY][tileX];
                if (tile && tile.height !== undefined) {
                    dynamicFloorZ = tile.height;
                }
            }
        }
        p.floorZ = dynamicFloorZ;
        
        if (!p.landed) {
            const nextX = p.worldX + p.wvx;
            const nextY = p.worldY + p.wvy;
            const nextZ = p.worldZ + p.wvz - gravity;

            let collided = false;
            if (grid && mapWidth && mapHeight) {
                const tileX = Math.floor(nextX);
                const tileY = Math.floor(nextY);
                
                if (tileX >= 0 && tileX < mapWidth && tileY >= 0 && tileY < mapHeight) {
                    const tile = grid[tileY][tileX];
                    const isWall = tile.type === 'WALL';
                    const isClosedDoor = tile.type === 'DOOR' && tile.door && tile.door.state !== 'OPEN';
                    
                    if ((isWall || isClosedDoor) && nextZ > 0.1) {
                        const prevTileX = Math.floor(p.worldX);
                        let u = 0;
                        let face = 0;
                        
                        if (prevTileX !== tileX) {
                            u = nextY - Math.floor(nextY);
                            face = p.wvx > 0 ? 3 : 1;
                            if (face === 3) u = 1.0 - u;
                        } else {
                            u = nextX - Math.floor(nextX);
                            face = p.wvy > 0 ? 0 : 2;
                            if (face === 2) u = 1.0 - u;
                        }
                        
                        const safeU = Math.max(0, Math.min(0.999, u));
                        const safeV = Math.max(0, Math.min(0.999, 1.0 - nextZ));
                        const virtualX = tileX + safeU;
                        const virtualY = tileY + safeV;

                        if (onParticleHit) {
                            const type = isClosedDoor ? 'DOOR' : 'WALL';
                            onParticleHit(virtualX, virtualY, nextZ, type, face);
                        }
                        p.life = 0; // Splat
                        collided = true;
                    }
                }
            }

            if (!collided) {
                p.worldX = nextX;
                p.worldY = nextY;
                p.worldZ = nextZ; 
                p.wvz -= gravity;  
                p.wvx *= 0.97; 
                p.wvy *= 0.97;
                
                if (p.worldZ <= p.floorZ) {
                    p.worldZ = p.floorZ;
                    p.landed = true;
                    p.isForeground = false;
                    p.wvx = 0;
                    p.wvy = 0;
                    p.wvz = 0;
                    p.life = 1.0;
                    
                    if (onParticleHit) {
                        onParticleHit(p.worldX, p.worldY, p.worldZ, 'FLOOR');
                    }
                }
            }
        } else {
            p.life -= 0.02; 
        }
    }
};

export const updateCasingParticles = (
    grid?: Tile[][], 
    mapWidth?: number,
    mapHeight?: number,
    onParticleBounce?: (p: Particle) => void
) => {
    const gravity = 0.005;
    for (let i = 0; i < casingParticles.length; i++) {
        const p = casingParticles[i];
        if (p.life <= 0) continue; // Skip dead particles

        let dynamicFloorZ = 0;
        if (grid) {
            const tileX = Math.floor(p.worldX);
            const tileY = Math.floor(p.worldY);
            if (tileY >= 0 && tileY < grid.length && tileX >= 0 && tileX < grid[tileY].length) {
                const tile = grid[tileY][tileX];
                if (tile && tile.height !== undefined) {
                    dynamicFloorZ = tile.height;
                }
            }
        }
        p.floorZ = dynamicFloorZ;
        
        // Casing update logic (simplified from updateParticles)
        const margin = 0.1;
        
        if (!p.landed) {
            let nextX = p.worldX + p.wvx;
            let colX = false;
            const movingRight = p.wvx > 0;
            const checkX = movingRight ? nextX + margin : nextX - margin;
            const tX = Math.floor(checkX);
            const tY_curr = Math.floor(p.worldY);
            
            if (grid && mapWidth && mapHeight && tX >= 0 && tX < mapWidth && tY_curr >= 0 && tY_curr < mapHeight) {
                const tile = grid[tY_curr][tX];
                const isSolid = tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN');
                if (isSolid && p.worldZ > 0.1) {
                    const speed = Math.sqrt(p.wvx * p.wvx + p.wvy * p.wvy) * (p.isReload ? 0.2 : 0.6);
                    const normalX = movingRight ? -1 : 1;
                    const normalAngle = Math.atan2(0, normalX);
                    const randomOffset = (Math.random() - 0.5) * Math.PI * 0.5;
                    const finalAngle = normalAngle + randomOffset;
                    p.wvx = Math.cos(finalAngle) * speed;
                    p.wvy = Math.sin(finalAngle) * speed;
                    if (onParticleBounce) onParticleBounce(p);
                    colX = true;
                    p.worldX = movingRight ? tX - margin : tX + 1 + margin;
                }
            }
            if (!colX) p.worldX = nextX;
            
            let nextY = p.worldY + p.wvy;
            let colY = false;
            const movingDown = p.wvy > 0;
            const checkY = movingDown ? nextY + margin : nextY - margin;
            const tX_curr = Math.floor(p.worldX);
            const tY = Math.floor(checkY);
            
            if (grid && mapWidth && mapHeight && tX_curr >= 0 && tX_curr < mapWidth && tY >= 0 && tY < mapHeight) {
                const tile = grid[tY][tX_curr];
                const isSolid = tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN');
                if (isSolid && p.worldZ > 0.1) {
                    if (!colX) {
                        const speed = Math.sqrt(p.wvx * p.wvx + p.wvy * p.wvy) * (p.isReload ? 0.2 : 0.6);
                        const normalY = movingDown ? -1 : 1;
                        const normalAngle = Math.atan2(normalY, 0);
                        const randomOffset = (Math.random() - 0.5) * Math.PI * 0.5;
                        const finalAngle = normalAngle + randomOffset;
                        p.wvx = Math.cos(finalAngle) * speed;
                        p.wvy = Math.sin(finalAngle) * speed;
                        if (onParticleBounce) onParticleBounce(p);
                    }
                    colY = true;
                    p.worldY = movingDown ? tY - margin : tY + 1 + margin;
                }
            }
            if (!colY) p.worldY = nextY;
            
            p.worldZ += p.wvz;
            if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
                p.rotation += p.rotationSpeed;
            }
            
            if (p.worldZ <= p.floorZ) {
                p.bounceCount = (p.bounceCount || 0) + 1;
                const maxBounces = p.maxBounces || 3;
                
                if (p.bounceCount <= maxBounces) {
                    p.worldZ = p.floorZ;
                    p.wvz = Math.max(0.018, Math.abs(p.wvz) * (p.isReload ? 0.45 : 0.5));
                    const speed = Math.sqrt(p.wvx * p.wvx + p.wvy * p.wvy) * (p.isReload ? 0.6 : 0.7);
                    const currentAngle = Math.atan2(p.wvy, p.wvx);
                    const angle = currentAngle + (Math.random() - 0.5) * 1.0; // Отскок по инерции с небольшим отклонением
                    p.wvx = Math.cos(angle) * speed;
                    p.wvy = Math.sin(angle) * speed;
                    p.rotationSpeed = (p.rotationSpeed || 0) * 0.5 + (Math.random() - 0.5) * 0.2;
                    if (onParticleBounce) onParticleBounce(p);
                } else {
                    p.worldZ = p.floorZ;
                    p.landed = true;
                    p.wvx = 0;
                    p.wvy = 0;
                    p.wvz = 0;
                    p.rotationSpeed = 0;
                    p.isForeground = false;
                    p.rotation = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
                }
            }
            
            p.wvz -= gravity;
            p.wvx *= 0.99; // Меньше сопротивление воздуха
            p.wvy *= 0.99;
        }
    }
};

export const updateParticles = (
    particles: Particle[], 
    grid?: Tile[][], 
    mapWidth?: number,
    mapHeight?: number,
    onParticleHit?: (x: number, y: number, z: number, type: 'WALL' | 'FLOOR' | 'DOOR', face?: number) => void,
    onShardLanded?: (p: Particle) => void,
    onParticleBounce?: (p: Particle) => void
): Particle[] => {
  let aliveCount = 0;
  const gravity = 0.005; 

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    let isAlive = true;
    const pGravity = p.gravity !== undefined ? p.gravity : gravity;

    let dynamicFloorZ = 0;
    if (grid) {
        const tileX = Math.floor(p.worldX);
        const tileY = Math.floor(p.worldY);
        if (tileY >= 0 && tileY < grid.length && tileX >= 0 && tileX < grid[tileY].length) {
            const tile = grid[tileY][tileX];
            if (tile && tile.height !== undefined) {
                dynamicFloorZ = tile.height;
            }
        }
    }
    p.floorZ = dynamicFloorZ;

    if (p.type === 'casing' || p.type === 'blood') {
        isAlive = false;
        continue;
    }

    if (p.type === 'fly') {
        if (p.originX !== undefined && p.originY !== undefined && p.angle !== undefined && p.radius !== undefined && p.buzzSpeed !== undefined) {
            p.angle += p.buzzSpeed;
            const jitter = (Math.random() - 0.5) * (p.size * 0.8);
            p.x = p.originX + Math.cos(p.angle) * p.radius + jitter;
            p.y = p.originY + Math.sin(p.angle * 0.5) * (p.radius * 0.5) + jitter;
            p.life = 1.0;
        }
    } else if (p.type === 'smoke' || p.type === 'fire') {
        if (p.useGravity) p.wvz += pGravity;
        p.worldZ += p.wvz;
        if (p.type === 'smoke' && p.worldZ > (p.floorZ + 0.95)) {
            p.life -= 0.03;
        }
        if (p.useGravity && p.worldZ <= p.floorZ) {
            p.worldZ = p.floorZ + 0.05 + Math.random() * 0.05;
            p.wvz = Math.random() * 0.02; // Small randomized bounce to keep them slightly floaty
            p.wvx *= 0.7; // Don't lose all horizontal speed immediately
            p.wvy *= 0.7;
        }
        p.worldX += p.wvx;
        p.worldY += p.wvy;
        p.life -= 0.015;
        if (p.life <= 0) isAlive = false;
        p.size *= (p.sizeGrowth !== undefined ? p.sizeGrowth : 1.02);
        const pFriction = p.friction !== undefined ? p.friction : 0.96;
        p.wvx *= pFriction; 
        p.wvy *= pFriction;
        // Limit terminal upward velocity and apply friction so it drifts naturally
        p.wvz *= pFriction;
    } else if (p.type === 'rain') {
        p.worldZ += p.wvz;
        p.worldX += p.wvx;
        p.worldY += p.wvy;
    } else if (p.type === 'shard' || p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib') {
        if (!p.landed) {
            // Apply gravity
            p.wvz -= gravity;

            // Collision Logic for Bricks and Gibs
            if ((p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib') && grid && mapWidth && mapHeight) {
                const margin = 0.05; // Small margin to prevent getting stuck
                
                // X Axis Movement & Collision
                let nextX = p.worldX + p.wvx;
                let colX = false;
                
                // Check collision with margin
                const movingRight = p.wvx > 0;
                const checkX = movingRight ? nextX + margin : nextX - margin;
                const tX = Math.floor(checkX);
                const tY_curr = Math.floor(p.worldY);
                
                if (tX >= 0 && tX < mapWidth && tY_curr >= 0 && tY_curr < mapHeight) {
                    const tile = grid[tY_curr][tX];
                    const isSolid = tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN');
                    if (isSolid && p.worldZ > 0.1) {
                        p.wvx *= -0.6; // Reflect and dampen
                        if (onParticleBounce) onParticleBounce(p);
                        colX = true;
                        // Push away from wall
                        p.worldX = movingRight ? tX - margin : tX + 1 + margin;
                    }
                }
                if (!colX) p.worldX = nextX;

                // Y Axis Movement & Collision
                let nextY = p.worldY + p.wvy;
                let colY = false;
                
                // Check collision with margin
                const movingDown = p.wvy > 0;
                const checkY = movingDown ? nextY + margin : nextY - margin;
                const tX_curr = Math.floor(p.worldX);
                const tY = Math.floor(checkY);

                if (tX_curr >= 0 && tX_curr < mapWidth && tY >= 0 && tY < mapHeight) {
                    const tile = grid[tY][tX_curr];
                    const isSolid = tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN');
                    if (isSolid && p.worldZ > 0.1) {
                        p.wvy *= -0.6; // Reflect and dampen
                        if (onParticleBounce) onParticleBounce(p);
                        colY = true;
                        // Push away from wall
                        p.worldY = movingDown ? tY - margin : tY + 1 + margin;
                    }
                }
                if (!colY) p.worldY = nextY;

            } else {
                // Standard movement for shards or if no grid provided
                p.worldX += p.wvx;
                p.worldY += p.wvy;
            }

            p.worldZ += p.wvz;
            
            if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
                p.rotation += p.rotationSpeed;
            }

            // Bounce logic for bricks and gibs
            if (p.worldZ <= p.floorZ) {
                if ((p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib') && Math.abs(p.wvz) > 0.02) {
                    p.worldZ = p.floorZ;
                    p.wvz = -p.wvz * 0.4; // Bounce with dampening
                    p.wvx *= 0.6; // Friction
                    p.wvy *= 0.6;
                    
                    p.rotationSpeed = (p.rotationSpeed || 0) * 0.5;
                    
                    if (onParticleBounce) onParticleBounce(p);
                    
                    if (p.type === 'gib' && !p.soundId) {
                        // Small blood splash on bounce for organic gibs
                        particles.push(...createBloodParticles(p.worldX, p.worldY, p.worldZ, 2, { scale: 0.5, speedScale: 0.5 }));
                    }
                } else {
                    p.worldZ = p.floorZ;
                    p.landed = true;
                    p.wvx = 0;
                    p.wvy = 0;
                    p.wvz = 0;
                    p.rotationSpeed = 0;
                    p.isForeground = false; // Sort correctly with sprites when landed
                    if (p.type === 'brick') p.rotation = 0; // Reset rotation to lie flat
                    if (onShardLanded && p.type === 'shard') {
                        onShardLanded(p);
                        isAlive = false; 
                    }
                    if (p.type === 'gib') {
                        // Blood splash on final landing
                        particles.push(...createBloodParticles(p.worldX, p.worldY, p.worldZ, 5, { scale: 0.8, speedScale: 0.8 }));
                    } else if (p.type === 'deco_gib' && p.soundId && onParticleBounce) {
                        onParticleBounce(p);
                    }
                    // Bricks and gibs stay alive but static
                }
            } else if (p.type === 'gib' && !p.soundId) {
                // Blood trail while flying
                if (Math.random() < 0.4) {
                    particles.push(...createBloodParticles(p.worldX, p.worldY, p.worldZ, 1, { scale: 0.3, speedScale: 0.1 }));
                }
            }
        } else {
            // Landed logic
            if (p.type === 'shard') {
                p.life -= 0.005;
                if (p.life <= 0) isAlive = false;
            } else if (p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib') {
                if (p.type === 'brick') {
                    p.life -= 0.0005; // Decay very slowly
                } else if (p.type === 'gib' || p.type === 'deco_gib') {
                    p.life -= 0.004; // Decay slowly to prevent infinite accumulation and lag
                }
                if (p.life <= 0) isAlive = false;
            }
        }
    } else {
        const nextX = p.worldX + p.wvx;
        const nextY = p.worldY + p.wvy;
        const nextZ = p.worldZ + p.wvz - pGravity;

        // Generic particle update (matches simulator)
        p.worldX = nextX;
        p.worldY = nextY;
        p.worldZ = nextZ;
        p.wvz -= pGravity;
        
        if (p.worldZ <= p.floorZ) {
            p.worldZ = p.floorZ;
            p.wvx *= 0.7;
            p.wvy *= 0.7;
            p.wvz = -p.wvz * 0.3; // tiny bounce
        }

        p.life -= 1 / 60; // Approximate life decrease (1 unit per second)
        if (p.life <= 0) isAlive = false;
        
        p.size *= (p.sizeGrowth !== undefined ? p.sizeGrowth : 1.0);
        const pFriction = p.friction !== undefined ? p.friction : 0.98;
        p.wvx *= pFriction;
        p.wvy *= pFriction;
        p.wvz *= pFriction;
    }
    
    if (isAlive) {
        if (i !== aliveCount) {
            particles[aliveCount] = p;
        }
        aliveCount++;
    } else {
        returnParticleToPool(p);
    }
  }

  particles.length = aliveCount;
  return particles;
};

export const drawParticles = (
    ctx: CanvasRenderingContext2D, 
    particles: Particle[], 
    zBuffer?: number[],
    sprites?: Map<string, HTMLImageElement>,
    resolutionDivisor: number = 1,
    drawnParticles?: Set<Particle>,
    playerAngle?: number,
    lightMap?: { r: number, g: number, b: number }[][]
) => {
  // Optimization: Group by color to minimize state changes
  texturedParticles.length = 0;
  for (const batch of batches.values()) {
      batch.length = 0;
  }

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.dist <= 0) continue;
    if (p.x < 0 || (ctx.canvas && p.x >= ctx.canvas.width)) continue;
    if (drawnParticles && drawnParticles.has(p)) continue;

    if (zBuffer) { 
        const bx = Math.floor(p.x); 
        if (bx >= 0 && bx < zBuffer.length) {
            const tolerance = p.isForeground ? 0.6 : (p.type === 'brick' ? 0.2 : 0.05);
            if (zBuffer[bx] < p.dist - tolerance) continue;
        } else if (p.type !== 'rain') {
            continue; 
        }
    }

    if (p.type === 'shard' || p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib' || p.type === 'casing') {
        texturedParticles.push(p);
        continue;
    }

    let batch = batches.get(p.color);
    if (!batch) {
        batch = [];
        batches.set(p.color, batch);
    }
    batch.push(p);
  }

  // Draw textured particles (shards, bricks)
  if (texturedParticles.length > 0 && sprites) {
      // Sort by distance (painter's algorithm) for correct transparency/overlap
      texturedParticles.sort((a, b) => b.dist - a.dist);

      for (let i = 0; i < texturedParticles.length; i++) {
          const p = texturedParticles[i];
          if (!p.textureId || !p.uvRect) continue;
          
          let img = sprites.get(p.textureId);
          if (!img) img = sprites.get(`TEX_${p.textureId}`);
          if (!img || img.width === 0) img = sprites.get('TEX_FALLBACK');
          if (!img) continue;

          const depthScale = 1.0 / Math.max(0.05, p.dist);
          const size = Math.max(1.0, p.size * depthScale * 300) * resolutionDivisor; 

          const drawX = Math.floor(p.x / resolutionDivisor) * resolutionDivisor;
          const drawY = Math.floor(p.y / resolutionDivisor) * resolutionDivisor;

          let sprBrightness = 1.0;
          let tileR = 1.0;
          let tileG = 1.0;
          let tileB = 1.0;
          if (lightMap) {
              const tx = Math.floor(p.worldX);
              const ty = Math.floor(p.worldY);
              if (ty >= 0 && ty < lightMap.length && tx >= 0 && tx < lightMap[ty].length) {
                  const l = lightMap[ty][tx];
                  tileR = l.r;
                  tileG = l.g;
                  tileB = l.b;
                  sprBrightness = (l.r + l.g + l.b) / 3;
              }
              const origBrightness = sprBrightness;
              sprBrightness = applyDepthBrightness(sprBrightness, p.dist);
              const depthFactor = origBrightness > 0.001 ? sprBrightness / origBrightness : 0;
              tileR = Math.min(1.0, tileR * depthFactor);
              tileG = Math.min(1.0, tileG * depthFactor);
              tileB = Math.min(1.0, tileB * depthFactor);
          }

          if (p.type === 'casing' && p.landed) {
              const rotatedImg = getRotatedCasing(p.textureId, img, p.rotation || (Math.PI / 2), tileR, tileG, tileB);
              const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
              const groundScale = p.casingGroundScaleMultiplier ?? 0.10;
              const effectiveSize = (p.size / 0.05) * groundScale;
              const spriteHeight = baseHeight * effectiveSize;
              const spriteAspectRatio = img.width / img.height;
              const spriteWidth = spriteHeight * spriteAspectRatio;
              
              ctx.globalAlpha = 1.0;
              ctx.drawImage(
                  rotatedImg,
                  drawX - spriteHeight / 2,
                  drawY - spriteWidth / 2,
                  spriteHeight,
                  spriteWidth
              );
              continue;
          }

          ctx.save();
          ctx.translate(drawX, drawY);
          
          let squash = 1;
          let actualRotation = p.rotation || 0;
          
          if ((p.type === 'gib' || p.type === 'deco_gib') && p.landed) {
              // Calculate perspective squash based on viewing angle to the floor
              // Assuming camera height is roughly 0.5 units above the floor
              const cameraHeight = 0.5;
              const viewingAngleSin = cameraHeight / Math.sqrt(p.dist * p.dist + cameraHeight * cameraHeight);
              // We use a minimum squash to prevent it from disappearing completely at long distances
              const minSquash = 0.1;
              squash = Math.max(minSquash, viewingAngleSin);
              
              if (playerAngle !== undefined) {
                  // Subtract player angle so it stays fixed in world space
                  actualRotation = actualRotation - playerAngle - Math.PI / 2;
              }
          } else if (p.type === 'casing' && p.landed) {
              // Гильзы лежат как обычные спрайты без перспективы
              squash = 1.0;
              // Угол не меняется от поворота игрока, чтобы они всегда были горизонтальными на экране
          }
          
          // Casings don't fade out unless explicitly set. Bricks and gibs fade out at the end of their lifecycle
          let alpha = p.life;
          if (p.type === 'casing') {
              alpha = 1.0;
          } else if (p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib') {
              alpha = Math.min(1.0, p.life);
          } else if (p.type === 'shard') {
              alpha = Math.min(0.3, p.life);
          } else {
              alpha = Math.max(0, p.life);
          }
          ctx.globalAlpha = alpha;
          
          let useFilter = true;
          if ((p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib' || p.type === 'shard') && p.landed) useFilter = false;
          
          let drawImg: HTMLImageElement | HTMLCanvasElement = img;
          let drawPreRendered = p.preRenderedCanvas;
          
          if (lightMap) {
              if (p.landed && (tileR < 1.0 || tileG < 1.0 || tileB < 1.0) && (p.type === 'gib' || p.type === 'deco_gib' || p.type === 'brick' || p.type === 'shard')) {
                  drawImg = getTintedSprite(img as any, {r: tileR, g: tileG, b: tileB}, 0, 0, globalSpriteTintCache) as any;
                  if (drawPreRendered) {
                      drawPreRendered = getTintedSprite(drawPreRendered as any, {r: tileR, g: tileG, b: tileB}, 0, 0, globalSpriteTintCache) as any;
                  }
              } else if (useFilter && sprBrightness < 0.99) {
                  // Вместо медленного ctx.filter тонируем спрайт цветом яркости (высокая производительность)
                  drawImg = getTintedSprite(img as any, {r: sprBrightness, g: sprBrightness, b: sprBrightness}, 0, 0, globalSpriteTintCache) as any;
                  if (drawPreRendered) {
                      drawPreRendered = getTintedSprite(drawPreRendered as any, {r: sprBrightness, g: sprBrightness, b: sprBrightness}, 0, 0, globalSpriteTintCache) as any;
                  }
              }
          }
          
          if (p.type === 'casing') {
              const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
              const effectiveSize = p.size;
              const spriteHeight = baseHeight * effectiveSize;
              const spriteAspectRatio = img.width / img.height;
              const spriteWidth = spriteHeight * spriteAspectRatio;

              ctx.rotate(actualRotation);
              
              ctx.drawImage(
                  img,
                  -spriteWidth / 2,
                  -spriteHeight / 2,
                  spriteWidth,
                  spriteHeight
              );
          } else if (p.type === 'brick') {
              if (actualRotation) ctx.rotate(actualRotation);
              // Draw "3D" brick (Front face + Side face)
              const w = size * 2;
              const h = size; // Bricks are usually wider than tall
              
              // Draw Side/Top (fake 3D extrusion)
              ctx.fillStyle = `rgb(${Math.round(26 * tileR)}, ${Math.round(26 * tileG)}, ${Math.round(26 * tileB)})`; // Dark color for side, tinted
              ctx.fillRect(-w/2 + 2, -h/2 + 2, w, h);

              // Draw Front Face (Textured)
              ctx.drawImage(
                  drawImg,
                  p.uvRect.u * img.width,
                  p.uvRect.v * img.height,
                  p.uvRect.w * img.width,
                  p.uvRect.h * img.height,
                  -w/2,
                  -h/2,
                  w,
                  h
              );
              
              // Add a border for definition
              ctx.strokeStyle = `rgba(${Math.round(0 * tileR)},${Math.round(0 * tileG)},${Math.round(0 * tileB)},0.5)`;
              ctx.lineWidth = 1;
              ctx.strokeRect(-w/2, -h/2, w, h);
          } else if (p.type === 'gib' || p.type === 'deco_gib') {
              const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
              const spriteHeight = baseHeight * p.size;
              const spriteAspectRatio = img.width / img.height;
              const spriteWidth = spriteHeight * spriteAspectRatio;
              
              const drawW = spriteWidth * p.uvRect.w;
              const drawH = spriteHeight * p.uvRect.h;
              
              if (p.points && p.points.length > 0) {
                  ctx.beginPath();
                  for (let j = 0; j < p.points.length; j++) {
                      const pt = p.points[j];
                      if (j === 0) ctx.moveTo(pt.x * drawW, pt.y * drawH);
                      else ctx.lineTo(pt.x * drawW, pt.y * drawH);
                  }
                  ctx.closePath();
                  ctx.clip();
              }
              
              if (p.landed) {
                  // Draw thickness layers for 3D volume
                  // Step is always 1 to prevent gaps. Max thickness capped for performance.
                  const thickness = Math.max(1, Math.min(4, Math.floor(6 / p.dist)));
                  
                  ctx.scale(1, squash);
                  if (actualRotation) ctx.rotate(actualRotation);
                  
                  const dx = Math.sin(actualRotation || 0) / squash;
                  const dy = Math.cos(actualRotation || 0) / squash;
                  
                  for (let i = thickness; i > 0; i -= 1) {
                      ctx.drawImage(
                          drawImg,
                          p.uvRect.u * img.width,
                          p.uvRect.v * img.height,
                          p.uvRect.w * img.width,
                          p.uvRect.h * img.height,
                          (-drawW / 2) + i * dx,
                          (-drawH / 2) + i * dy,
                          drawW,
                          drawH
                      );
                  }
              } else {
                  ctx.scale(1, squash);
                  if (actualRotation) ctx.rotate(actualRotation);
              }
              
              // Draw top layer
              ctx.drawImage(
                  drawImg,
                  p.uvRect.u * img.width,
                  p.uvRect.v * img.height,
                  p.uvRect.w * img.width,
                  p.uvRect.h * img.height,
                  -drawW / 2,
                  -drawH / 2,
                  drawW,
                  drawH
              );
          } else if (p.points && p.points.length > 0) {
              if (actualRotation) ctx.rotate(actualRotation);
              
              if (drawPreRendered) {
                  // Fast path: draw pre-rendered shard directly
                  const s = size * (32 / 12);
                  ctx.drawImage(
                      drawPreRendered,
                      -s, -s, s * 2, s * 2
                  );
              } else {
                  // Slow path: draw jagged shard manually
                  ctx.beginPath();
                  for (let j = 0; j < p.points.length; j++) {
                      const pt = p.points[j];
                      if (j === 0) ctx.moveTo(pt.x * size, pt.y * size);
                      else ctx.lineTo(pt.x * size, pt.y * size);
                  }
                  ctx.closePath();
                  
                  ctx.save();
                  ctx.clip();
                  
                  ctx.drawImage(
                      drawImg,
                      p.uvRect.u * img.width,
                      p.uvRect.v * img.height,
                      p.uvRect.w * img.width,
                      p.uvRect.h * img.height,
                      -size,
                      -size,
                      size * 2,
                      size * 2
                  );
                  ctx.restore();

                  // Glass outline
                  ctx.strokeStyle = `rgba(${Math.round(220 * tileR)}, ${Math.round(230 * tileG)}, ${Math.round(255 * tileB)}, 0.9)`;
                  ctx.lineWidth = 1;
                  ctx.stroke();
              }
          }
          
          ctx.restore();
      }
  }

  for (const [color, batch] of batches) {
    ctx.fillStyle = color;
    for (let i = 0; i < batch.length; i++) {
        const p = batch[i];
        ctx.globalAlpha = Math.max(0, p.life);

        const drawX = Math.floor(p.x / resolutionDivisor) * resolutionDivisor;
        const drawY = Math.floor(p.y / resolutionDivisor) * resolutionDivisor;

        if (p.type === 'fly') {
            const s = p.size * resolutionDivisor;
            ctx.fillRect(Math.floor(drawX - s/2), Math.floor(drawY - s/2), s, s);
        } else if (p.type === 'rain') {
            const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
            const rainHeight = Math.max(1.5, p.size * (baseHeight * 0.05)) * resolutionDivisor;
            const rainWidth = Math.max(0.5, (p.size / 4) * (baseHeight * 0.005)) * resolutionDivisor;
            ctx.fillRect(Math.floor(drawX), Math.floor(drawY), rainWidth, rainHeight);
        } else if (p.type === 'splash') {
            const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
            const size = Math.max(0.5, p.size * (baseHeight * 0.005)) * resolutionDivisor;
            ctx.fillRect(Math.floor(drawX), Math.floor(drawY), size, size);
        } else if (p.type === 'smoke' || p.type === 'fire') {
            const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
            const size = Math.max(1, p.size * baseHeight * 0.2) * resolutionDivisor; 
            
            // Smooth fade out
            const lifeRatio = p.life / (p.maxLife || 1);
            ctx.globalAlpha = Math.min(1.0, Math.max(0, lifeRatio * lifeRatio * 1.5));
            
            const tex = getParticleSoftTexture(p.color);
            ctx.drawImage(tex, Math.floor(drawX - size/2), Math.floor(drawY - size/2), size, size);
        } else if ((p.type === 'generic' || p.type === undefined) && p.spriteId && sprites && sprites.has(p.spriteId)) {
            const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
            const relativeMultiplier = 0.06;
            const size = Math.max(1, p.size * baseHeight * relativeMultiplier) * resolutionDivisor;
            // Smooth fade out like simulator
            const lifeRatio = p.life / (p.maxLife || 1);
            ctx.globalAlpha = Math.min(1.0, Math.max(0, lifeRatio / 0.5));
            const img = sprites.get(p.spriteId)!;
            ctx.drawImage(img, Math.floor(drawX - size/2), Math.floor(drawY - size/2), size, size);
        } else if (p.type === 'generic' || p.type === undefined) {
            const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
            const relativeMultiplier = 0.06; // Match sprite multiplier
            const size = Math.max(1, p.size * baseHeight * relativeMultiplier) * resolutionDivisor;
            // Smooth fade out
            const lifeRatio = p.life / (p.maxLife || 1);
            ctx.globalAlpha = Math.min(1.0, Math.max(0, lifeRatio / 0.5));
            const tex = getParticleSoftTexture(p.color);
            ctx.drawImage(tex, Math.floor(drawX - size/2), Math.floor(drawY - size/2), size, size);
        } else {
            const baseHeight = ctx.canvas.height / Math.max(0.05, p.dist);
            // Multiplier relative to screen height (1.0 = full block size)
            // Blood normally 4 absolute px, we do small relative multiplier
            const relativeMultiplier = p.type === 'blood' ? 0.015 : 0.06;
            const size = Math.max(1, p.size * baseHeight * relativeMultiplier) * resolutionDivisor; 
            ctx.fillRect(Math.floor(drawX - size/2), Math.floor(drawY - size/2), size, size);
        }
    }
  }
  ctx.globalAlpha = 1.0;
};
