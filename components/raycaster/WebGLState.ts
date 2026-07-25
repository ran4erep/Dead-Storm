export interface WebGLQuad {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  r: number;
  g: number;
  b: number;
  fog: number;
  textureId: string;
  maskTop?: number;
  maskBottom?: number;
  isBottomCap?: boolean;
  r0?: number;
  g0?: number;
  b0?: number;
  fog0?: number;
  r1?: number;
  g1?: number;
  b1?: number;
  fog1?: number;
  dist: number;
}

// Global active flag. Starts as false, gets enabled dynamically if WebGL is supported and chosen.
export let isWebGLActive = false;
export const wallQuadsCollector: WebGLQuad[] = [];

export interface SpriteShadow {
  x: number;
  y: number;
  rx: number;
  ry: number;
  invRx2?: number;
  invRy2?: number;
}

export let globalSpriteShadows: SpriteShadow[] = [];
export let globalMagentaShadowsEnabled = false;

export function setGlobalSpriteShadows(shadows: SpriteShadow[], magenta: boolean) {
  globalSpriteShadows = shadows;
  globalMagentaShadowsEnabled = magenta;
}

const quadPool: WebGLQuad[] = [];
let quadPoolIndex = 0;

export function getQuadFromPool(): WebGLQuad {
  if (quadPoolIndex >= quadPool.length) {
    quadPool.push({
      x0: 0, x1: 0, y0: 0, y1: 0,
      u0: 0, u1: 0, v0: 0, v1: 0,
      r: 0, g: 0, b: 0, fog: 0,
      textureId: '',
      dist: 1000
    });
  }
  const q = quadPool[quadPoolIndex++];
  q.maskTop = undefined;
  q.maskBottom = undefined;
  q.isBottomCap = undefined;
  q.r0 = undefined;
  q.g0 = undefined;
  q.b0 = undefined;
  q.fog0 = undefined;
  q.r1 = undefined;
  q.g1 = undefined;
  q.b1 = undefined;
  q.fog1 = undefined;
  q.dist = 1000;
  return q;
}

export function setWebGLActive(active: boolean) {
  isWebGLActive = active;
}

export function clearQuads() {
  wallQuadsCollector.length = 0;
  quadPoolIndex = 0;
}

export function pushQuad(quad: WebGLQuad) {
  wallQuadsCollector.push(quad);
}
