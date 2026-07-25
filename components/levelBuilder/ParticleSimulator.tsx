import React, { useEffect, useRef } from 'react';
import { Particle, getParticleSoftTexture } from '../../utils/particleSystem';
import { ASSETS } from '../../assets';

interface ParticleSimulatorProps {
  particleDef: any;
  uiStrings: any;
  restartNonce?: number;
}

export const ParticleSimulator: React.FC<ParticleSimulatorProps> = ({ particleDef, uiStrings, restartNonce }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastTimeRef = useRef<number>(performance.now());
  const reqRef = useRef<number>(0);
  const spritesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Accumulators for spawning
  const spawnRef = useRef<number>(0);
  const physicsAccumulatorRef = useRef<number>(0);
  const burstTimeRef = useRef<number>(0);

  useEffect(() => {
    if (particleDef?.spriteId && ASSETS.SPRITES[particleDef.spriteId as keyof typeof ASSETS.SPRITES]) {
      const img = new Image();
      img.src = ASSETS.SPRITES[particleDef.spriteId as keyof typeof ASSETS.SPRITES] as string;
      img.onload = () => {
        spritesRef.current.set(particleDef.spriteId, img);
      };
    }
  }, [particleDef?.spriteId]);

  useEffect(() => {
    particlesRef.current = []; // Reset on change
    spawnRef.current = 0;
    physicsAccumulatorRef.current = 0;
    burstTimeRef.current = 0;
  }, [particleDef?.id, restartNonce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (time: number) => {
      reqRef.current = requestAnimationFrame(render);
      // We limit dt to prevent huge leaps, but simulate as frames
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1); 
      lastTimeRef.current = time;

      // Clear canvas
      ctx.fillStyle = '#111'; // Dark background
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!particleDef) return;

      // Draw grid to give a sense of scale?
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Logic to spawn particles
      const getNum = (val: any, def: number) => (val !== undefined && val !== null && val !== '') ? Number(val) : def;

      const isBurst = typeof particleDef.burst !== 'undefined';
      
      let toSpawn = 0;
      if (isBurst) {
          const maxLife = getNum(particleDef.maxLife, getNum(particleDef.life, 1) + 0.5);
          const cycleTime = maxLife * 1000 + 1000;
          if (time - burstTimeRef.current > cycleTime) {
              burstTimeRef.current = time;
              toSpawn = getNum(particleDef.burst, 10);
          }
      } else {
          const rate = getNum(particleDef.spawnRate, 10);
          spawnRef.current += rate * dt;
          toSpawn = Math.floor(spawnRef.current);
          if (toSpawn > 0) {
            spawnRef.current -= toSpawn;
          }
      }
      
      if (toSpawn > 0) {
        for (let i = 0; i < toSpawn; i++) {
          const colors = particleDef.colors && particleDef.colors.length > 0
            ? particleDef.colors : ['#ffffff'];
          const color = colors[Math.floor(Math.random() * colors.length)];
          const speedXMin = getNum(particleDef.speedXMin, -0.05);
          const speedXMax = getNum(particleDef.speedXMax, 0.05);
          const speedYMin = getNum(particleDef.speedYMin, -0.05);
          const speedYMax = getNum(particleDef.speedYMax, 0.05);
          const speedZMin = getNum(particleDef.speedZMin, 0.0);
          const speedZMax = getNum(particleDef.speedZMax, 0.02);

          const lifeParam = getNum(particleDef.life, 1);
          const maxLifeParam = getNum(particleDef.maxLife, lifeParam + 0.5);

          particlesRef.current.push({
            x: 0,
            y: 0,
            worldX: 0, 
            worldY: 0.5, // Spawn at bottom of visual box (front edge)
            worldZ: getNum(particleDef.zOffset, 0),
            wvx: speedXMin + Math.random() * (speedXMax - speedXMin),
            wvy: speedYMin + Math.random() * (speedYMax - speedYMin),
            wvz: speedZMin + Math.random() * (speedZMax - speedZMin),
            life: lifeParam,
            maxLife: maxLifeParam,
            size: getNum(particleDef.startSize, 1),
            color: color,
            type: 'generic',
            gravity: getNum(particleDef.gravity, 0),
            friction: getNum(particleDef.friction, 0.98),
            useGravity: true,
            dist: 1, // Need positive dist to be drawn 
            sizeGrowth: particleDef.sizeGrowth,
            floorZ: 0,
            spriteId: particleDef.spriteId
          } as any);
        }
      }

      // Simulate particle physics exactly as in game for multiple ticks based on dt (assuming 60fps = 1 in-game tick approx)
      physicsAccumulatorRef.current += dt * 60;
      const ticks = Math.floor(physicsAccumulatorRef.current);
      if (ticks > 0) {
          physicsAccumulatorRef.current -= ticks;
      }
      for (let t = 0; t < ticks; t++) {
        // Run update logic manually here so it mirrors exactly what happens in game without needing full physics grid
        let aliveCount = 0;
        for (let i = 0; i < particlesRef.current.length; i++) {
            const p = particlesRef.current[i] as any;
            let isAlive = true;
            
            // Generic update 
            const pGravity = p.gravity !== undefined ? p.gravity : 0;
            p.wvz -= pGravity;
            p.worldZ += p.wvz;
            
            if (p.worldZ <= p.floorZ) {
                p.worldZ = p.floorZ;
                p.wvx *= 0.7;
                p.wvy *= 0.7;
                p.wvz = -p.wvz * 0.3; // tiny bounce
            }
            
            p.worldX += p.wvx;
            p.worldY += p.wvy;
            p.life -= 1 / 60; // Approximate life decrease (1 unit per second)
            if (p.life <= 0) isAlive = false;
            p.size *= (p.sizeGrowth !== undefined ? p.sizeGrowth : 1.0);
            const pFriction = p.friction !== undefined ? p.friction : 0.98;
            p.wvx *= pFriction; 
            p.wvy *= pFriction;
            p.wvz *= pFriction;

            if (isAlive) {
                particlesRef.current[aliveCount++] = p;
            }
        }
        particlesRef.current.length = aliveCount;
      }

      // Draw
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const scale = 256; // 1 unit = 256 pixels

      // Draw a 1x1x1 Block Reference (Wireframe)
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.lineWidth = 1;
      
      // Bottom face (Z = 0)
      const bY = centerY + 0.5 * scale;
      ctx.strokeRect(centerX - scale/2, bY - scale/2, scale, scale);
      
      // Top face (Z = 1)
      const tY = centerY - 0.5 * scale;
      ctx.strokeRect(centerX - scale/2, tY - scale/2, scale, scale);
      
      // Vertical edges
      ctx.beginPath();
      ctx.moveTo(centerX - scale/2, bY - scale/2); ctx.lineTo(centerX - scale/2, tY - scale/2);
      ctx.moveTo(centerX + scale/2, bY - scale/2); ctx.lineTo(centerX + scale/2, tY - scale/2);
      ctx.moveTo(centerX - scale/2, bY + scale/2); ctx.lineTo(centerX - scale/2, tY + scale/2);
      ctx.moveTo(centerX + scale/2, bY + scale/2); ctx.lineTo(centerX + scale/2, tY + scale/2);
      ctx.stroke();

      // Info text for scale
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.font = '10px monospace';
      ctx.fillText("1x1x1 Block Reference", centerX + scale/2 + 5, tY);

      // Sort by Z to fake depth? 
      const sorted = [...particlesRef.current].sort((a: any,b: any) => a.worldZ - b.worldZ);

      // Draw an emitter base
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      // Draw at the new spawn location (worldY=0.5, worldZ=zOffset)
      const emitterZ = particleDef.zOffset !== undefined ? particleDef.zOffset : 0;
      const emitterY = centerY + 1.0 * scale - emitterZ * scale;
      ctx.arc(centerX, emitterY, 8, 0, Math.PI*2); 
      ctx.fill();

      for (const p of sorted as any[]) {
         const drawX = centerX + p.worldX * scale;
         const drawY = centerY + 0.5 * scale + p.worldY * scale - p.worldZ * scale;


         ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.5)));
         
         const baseParticleScaleMultiplier = 0.06; // Match in-game relative multiplier
         const drawSize = p.size * scale * baseParticleScaleMultiplier; 

         if (particleDef.spriteId && spritesRef.current.has(particleDef.spriteId)) {
             const img = spritesRef.current.get(particleDef.spriteId)!;
             let squash = 1.0;
             if (p.type === 'gib' && p.landed) squash = 0.5;
             ctx.save();
             ctx.translate(drawX, drawY);
             ctx.scale(1, squash);
             ctx.globalAlpha = ctx.globalAlpha;
             ctx.drawImage(img, -drawSize/2, -drawSize/2, drawSize, drawSize);
             ctx.restore();
         } else {
             const tex = getParticleSoftTexture(p.color || '#fff');
             ctx.drawImage(tex, drawX - drawSize/2, drawY - drawSize/2, drawSize, drawSize);
         }
         ctx.globalAlpha = 1.0;
      }

      
      // Info
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.fillText(`Particles: ${particlesRef.current.length}`, 10, 20);
      ctx.fillText(particleDef?.burst !== undefined ? `Burst: ${particleDef.burst}` : `Spawns/sec: ${particleDef?.spawnRate || 10}`, 10, 32);

    };

    reqRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(reqRef.current);
  }, [particleDef]);

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 border border-gray-700 rounded overflow-hidden">
        <div className="bg-gray-800 text-gray-300 font-bold p-2 text-xs border-b border-gray-700 flex justify-between">
           <span>{particleDef ? `${uiStrings.simulator || 'Simulator'}: ${particleDef.name || particleDef.id}` : 'Select a particle'}</span>
        </div>
        <div className="flex-1 min-h-0 relative">
            <canvas 
                ref={canvasRef} 
                width={800} 
                height={600} 
                className="absolute inset-0 w-full h-full object-contain"
            />
        </div>
    </div>
  );
};

