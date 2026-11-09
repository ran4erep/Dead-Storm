import { RaycasterBuffer } from './RaycasterUtils';
import { getFogColorR, getFogColorG, getFogColorB, isFogWeather, applyDepthBrightness, getMinBrightness, getFogStart, getInvFogRange, getInvRenderDistance, getDisableDistanceShading } from './DepthEffect';
import { MirrorReflection, SpriteShadow } from './RaycasterTypes';
import { globalSpriteTintCache } from './SpriteCache';
import { PolyObjectInstance, buildPolyObjectVertexBuffer, PolyBatch } from './PolyObjectRenderer';
import { getPolyTextureImage } from '../../utils/polyTextureUtils';

const getFogColorVec3 = (): [number, number, number] => {
  if (!isFogWeather()) {
    return [0.0, 0.0, 0.0];
  }
  return [getFogColorR() / 255, getFogColorG() / 255, getFogColorB() / 255];
};

interface WallLightNeighbor {
  x: number;
  y: number;
}

const wallNeighborsCache = new WeakMap<any[][], WallLightNeighbor[][]>();

const getWallNeighbors = (grid: any[][]): WallLightNeighbor[][] => {
  let cached = wallNeighborsCache.get(grid);
  if (cached) return cached;

  const mapHeight = grid.length;
  const mapWidth = grid[0].length;

  const cache: WallLightNeighbor[][] = new Array(mapHeight * mapWidth);

  const checkNeighbor = (x: number, y: number, nx: number, ny: number, list: WallLightNeighbor[]) => {
    if (ny >= 0 && ny < mapHeight && nx >= 0 && nx < mapWidth) {
      const ntile = grid[ny][nx];
      if (!ntile || (ntile.type !== 'WALL' && ntile.type !== 'DOOR')) {
        list.push({ x: nx, y: ny });
      }
    }
  };

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const idx = y * mapWidth + x;
      const tile = grid[y]?.[x];
      if (tile && (tile.type === 'WALL' || tile.type === 'DOOR')) {
        const neighbors: WallLightNeighbor[] = [];
        // Orthogonal
        checkNeighbor(x, y, x - 1, y, neighbors);
        checkNeighbor(x, y, x + 1, y, neighbors);
        checkNeighbor(x, y, x, y - 1, neighbors);
        checkNeighbor(x, y, x, y + 1, neighbors);

        if (neighbors.length > 0) {
          cache[idx] = neighbors;
        } else {
          // Fall back to diagonal only if no orthogonal empties
          const diagNeighbors: WallLightNeighbor[] = [];
          checkNeighbor(x, y, x - 1, y - 1, diagNeighbors);
          checkNeighbor(x, y, x + 1, y - 1, diagNeighbors);
          checkNeighbor(x, y, x - 1, y + 1, diagNeighbors);
          checkNeighbor(x, y, x + 1, y + 1, diagNeighbors);
          cache[idx] = diagNeighbors;
        }
      } else {
        cache[idx] = [];
      }
    }
  }

  wallNeighborsCache.set(grid, cache);
  return cache;
};

const areHighlightedSame = (a?: any[], b?: any[]) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y || a[i].color !== b[i].color) {
      return false;
    }
  }
  return true;
};

// Dedicated upper-floor underside (ceiling cap) shader.
// The CPU only builds static tile geometry; projection, texturing, lighting,
// fog and dynamic flashes are all evaluated on the GPU.
const CAP_VS = `
  attribute vec3 a_position;
  attribute vec2 a_texCoord;
  attribute vec3 a_light;

  varying vec2 v_texCoord;
  varying vec3 v_light;
  varying float v_depth;
  varying vec2 v_world;

  uniform vec2 u_playerPos;
  uniform float u_cameraZ;
  uniform vec2 u_dir;
  uniform vec2 u_plane;
  uniform float u_horizon;
  uniform vec2 u_resolution;
  uniform float u_depthFar;

  void main() {
    vec3 cameraPos = vec3(u_playerPos, u_cameraZ);
    vec3 delta = a_position - cameraPos;

    float det = u_dir.x * u_plane.y - u_dir.y * u_plane.x;
    float depth = (delta.x * u_plane.y - delta.y * u_plane.x) / det;
    if (depth <= 0.0001) {
      v_texCoord = a_texCoord;
      v_light = a_light;
      v_depth = -1.0;
      v_world = a_position.xy;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    float camX = (u_dir.x * delta.y - u_dir.y * delta.x) / det;
    float horizonShift = 1.0 - 2.0 * u_horizon / max(u_resolution.y, 1.0);

    // Equivalent to the raycaster perspective, expressed directly in NDC.
    float ndcX = camX / depth;
    float ndcY = horizonShift + 2.0 * delta.z / depth;
    float depth01 = clamp(depth / max(u_depthFar, 1.0), 0.0, 1.0);

    gl_Position = vec4(ndcX, ndcY, depth01 * 2.0 - 1.0, 1.0);
    v_texCoord = a_texCoord;
    v_light = a_light;
    v_depth = depth;
    v_world = a_position.xy;
  }
`;

const CAP_FS = `
  precision highp float;

  varying vec2 v_texCoord;
  varying vec3 v_light;
  varying float v_depth;
  varying vec2 v_world;

  uniform sampler2D u_texture;
  uniform vec3 u_fogColor;
  uniform float u_renderDistance;
  uniform float u_minBrightness;
  uniform bool u_isFog;
  uniform float u_fogStart;
  uniform float u_invFogRange;
  uniform float u_invRenderDistance;
  uniform float u_lightningIntensity;
  uniform float u_muzzleFlashIntensity;
  uniform int u_activeFlashCount;
  uniform vec3 u_activeFlashes[8];
  uniform vec2 u_playerPos;
  uniform float u_flashlightAttenuation;

  float getDepthFactor(float d) {
    if (u_isFog) {
      float t = clamp(d * u_invRenderDistance, 0.0, 1.0);
      return 1.0 - (t * t * (3.0 - 2.0 * t));
    }
    if (d <= u_fogStart) return 1.0;
    float t = clamp((d - u_fogStart) * u_invFogRange, 0.0, 1.0);
    return max(u_minBrightness, 1.0 - (t * t * (3.0 - 2.0 * t)));
  }

  void main() {
    if (v_depth <= 0.0) discard;
    vec4 texColor = texture2D(u_texture, fract(v_texCoord));
    if (texColor.a < 0.01) discard;

    // Bottom faces of upper walls are deliberately darker than floor tops.
    vec3 lit = texColor.rgb * v_light * 0.6;

    float depthFactor = getDepthFactor(v_depth);
    if (u_isFog) {
      lit = mix(lit, u_fogColor, 1.0 - depthFactor);
    } else {
      lit *= depthFactor;
    }

    // Keep the existing dynamic flash behaviour without any CPU pixel work.
    vec2 fromPlayer = v_world - u_playerPos;
    float muzzle = u_muzzleFlashIntensity / (dot(fromPlayer, fromPlayer) * 0.5 + 1.0);
    lit += vec3(muzzle, muzzle * 0.7843, muzzle * 0.3137) * u_flashlightAttenuation;

    for (int i = 0; i < 8; i++) {
      if (i >= u_activeFlashCount) break;
      vec3 flash = u_activeFlashes[i];
      vec2 d = v_world - flash.xy;
      float f = flash.z / (dot(d, d) * 0.5 + 1.0);
      lit += vec3(f, f * 0.7843, f * 0.3137) * u_flashlightAttenuation;
    }

    if (u_lightningIntensity > 0.0) {
      lit += vec3(0.5882, 0.6275, 0.7843) * u_lightningIntensity;
    }

    gl_FragColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
  }
`;

// Shader source code
const BACKGROUND_VS = `
  attribute vec2 position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = position * 0.5 + 0.5;
    // Flip Y to match canvas 2D coordinate system
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const BACKGROUND_FS = `
  precision highp float;
  varying vec2 v_texCoord;

  uniform vec2 u_resolution;
  uniform vec2 u_playerPos;
  uniform vec2 u_dir;
  uniform vec2 u_plane;
  uniform float u_cameraZ;
  uniform float u_playerFloorHeight;
  uniform float u_horizon;
  uniform int u_ceilingType; // 0 = INDOOR, 1 = OUTDOOR
  uniform float u_renderDistance;
  uniform float u_minBrightness;
  uniform float u_lightningIntensity;
  uniform float u_muzzleFlashIntensity;
  uniform int u_activeFlashCount;
  uniform vec3 u_activeFlashes[8];
  
  uniform vec3 u_fogColor;
  uniform vec3 u_ambientLight;

  uniform bool u_isFog;
  uniform vec2 u_skySize;
  uniform float u_skyVScale;
  uniform float u_globalAngularShift;
  uniform int u_skyIsFallback;

  // Precomputed fog parameters
  uniform float u_fogStart;
  uniform float u_invFogRange;
  uniform float u_invRenderDistance;

  // Textures
  uniform sampler2D u_floorTex;
  uniform sampler2D u_ceilTex;
  uniform sampler2D u_skyTex;
  uniform sampler2D u_lightTex;
  uniform sampler2D u_highlightTex;
  uniform sampler2D u_waterTex;
  uniform float u_time;
  uniform vec2 u_mapSize;

  uniform int u_shadowCount;
  uniform vec4 u_shadows[16];
  uniform bool u_magentaShadows;

  float getDepthFactor(float d) {
    if (u_isFog) {
      float t = clamp(d * u_invRenderDistance, 0.0, 1.0);
      return 1.0 - (t * t * (3.0 - 2.0 * t));
    }
    return max(u_minBrightness, 1.0 - smoothstep(u_fogStart, u_renderDistance, d));
  }

  vec4 getInterpolatedLight(vec2 pos, sampler2D lightTex, sampler2D infoTex, vec2 mapSize) {
    vec2 uv = pos - vec2(0.5);
    vec2 f00 = floor(uv);
    vec2 t = uv - f00;
    
    vec2 centerTile = floor(pos);
    vec2 centerUV = (centerTile + vec2(0.5)) / mapSize;
    vec4 centerLight = texture2D(lightTex, centerUV);

    vec2 p00 = f00;
    vec2 p10 = f00 + vec2(1.0, 0.0);
    vec2 p01 = f00 + vec2(0.0, 1.0);
    vec2 p11 = f00 + vec2(1.0, 1.0);

    vec2 uv00 = clamp((p00 + vec2(0.5)) / mapSize, 0.0, 1.0);
    vec2 uv10 = clamp((p10 + vec2(0.5)) / mapSize, 0.0, 1.0);
    vec2 uv01 = clamp((p01 + vec2(0.5)) / mapSize, 0.0, 1.0);
    vec2 uv11 = clamp((p11 + vec2(0.5)) / mapSize, 0.0, 1.0);

    // Parallel lookup fetches to optimize GPU pipelining and hardware pre-fetching
    float wall00 = texture2D(infoTex, uv00).b;
    float wall10 = texture2D(infoTex, uv10).b;
    float wall01 = texture2D(infoTex, uv01).b;
    float wall11 = texture2D(infoTex, uv11).b;

    vec4 tex00 = texture2D(lightTex, uv00);
    vec4 tex10 = texture2D(lightTex, uv10);
    vec4 tex01 = texture2D(lightTex, uv01);
    vec4 tex11 = texture2D(lightTex, uv11);

    vec4 c00 = (p00.x >= 0.0 && p00.x < mapSize.x && p00.y >= 0.0 && p00.y < mapSize.y && wall00 < 0.5) ? tex00 : centerLight;
    vec4 c10 = (p10.x >= 0.0 && p10.x < mapSize.x && p10.y >= 0.0 && p10.y < mapSize.y && wall10 < 0.5) ? tex10 : centerLight;
    vec4 c01 = (p01.x >= 0.0 && p01.x < mapSize.x && p01.y >= 0.0 && p01.y < mapSize.y && wall01 < 0.5) ? tex01 : centerLight;
    vec4 c11 = (p11.x >= 0.0 && p11.x < mapSize.x && p11.y >= 0.0 && p11.y < mapSize.y && wall11 < 0.5) ? tex11 : centerLight;

    return mix(mix(c00, c10, t.x), mix(c01, c11, t.x), t.y);
  }

  vec4 getSkyColor(float screenY) {
    if (u_isFog) {
      return vec4(u_fogColor, 1.0);
    }

    float cameraX = (2.0 * v_texCoord.x) - 1.0;
    float rayDirX = u_dir.x + u_plane.x * cameraX;
    float rayDirY = u_dir.y + u_plane.y * cameraX;

    float rayAngle = atan(rayDirY, rayDirX);
    
    // Parallax shift calculation: independent of camera rotation, only dependent on player position & ray angle
    float len = length(vec2(rayDirX, rayDirY));
    float sinRay = rayDirY / len;
    float cosRay = rayDirX / len;
    float parallaxDistance = 500.0;
    float parallaxShift = (u_playerPos.x * sinRay - u_playerPos.y * cosRay) / parallaxDistance;
    float rayAngleNorm = (rayAngle + parallaxShift + 3.141592653589793) / (2.0 * 3.141592653589793);
    
    float skyX = -rayAngleNorm;
    skyX = skyX - floor(skyX);

    float distFromHorizon = u_horizon - screenY;
    float skyTy = (u_skySize.y * 0.5) - (distFromHorizon * u_skyVScale);
    float skyY = skyTy / u_skySize.y;

    if (u_skyIsFallback == 1) {
      skyX = fract(skyX * 16.0);
      skyY = fract(skyY * 8.0);
    } else {
      skyY = clamp(skyY, 0.0, 1.0);
    }

    if (u_skyIsFallback == 1 || (skyY >= 0.0 && skyY <= 1.0)) {
      vec4 skyColor = texture2D(u_skyTex, vec2(skyX, skyY));
      skyColor.rgb += vec3(u_lightningIntensity * (200.0/255.0), u_lightningIntensity * (220.0/255.0), u_lightningIntensity * (255.0/255.0));
      return skyColor;
    } else {
      return vec4(26.0 / 255.0, 26.0 / 255.0, 26.0 / 255.0, 1.0);
    }
  }

  void main() {
    float x = v_texCoord.x * u_resolution.x;
    float y = (1.0 - v_texCoord.y) * u_resolution.y; // screen Y matches 2D context
    
    float dy = y - u_horizon;
    vec4 finalColor = vec4(0.0, 0.0, 0.0, 1.0);

    if (dy > 0.1) {
      // Floor plane rendering
      float floorRayHeight = u_cameraZ - u_playerFloorHeight;
      if (u_playerFloorHeight < 0.0 && u_playerFloorHeight >= -5.0) {
        floorRayHeight += u_playerFloorHeight;
      }
      if (floorRayHeight < 0.01) {
        floorRayHeight = u_cameraZ - u_playerFloorHeight;
      }
      float dist = (floorRayHeight * u_resolution.y) / dy;
      if (dist < u_renderDistance) {
        float u = u_playerPos.x + dist * (u_dir.x + u_plane.x * (2.0 * v_texCoord.x - 1.0));
        float v = u_playerPos.y + dist * (u_dir.y + u_plane.y * (2.0 * v_texCoord.x - 1.0));
        
        if (u < 0.0 || u >= u_mapSize.x || v < 0.0 || v >= u_mapSize.y) {
          if (u_ceilingType == 1) {
            finalColor = getSkyColor(y);
          } else {
            finalColor = vec4(u_fogColor, 1.0);
          }
        } else {
          vec2 tileUV = clamp((floor(vec2(u, v)) + 0.5) / u_mapSize, 0.0, 1.0);
          
          // Decode floor height from G channel: Math.round(height * 50.0 + 128.0)
          float fFloorVal = texture2D(u_waterTex, tileUV).g;
          float fLevel = (fFloorVal * 255.0 - 128.0) / 50.0;
          bool floorVisible = true;
          
          float currentDist = dist;
          float lastFLevel = u_playerFloorHeight;
          
          if (abs(fLevel - lastFLevel) > 0.001) {
            for (int iter = 0; iter < 2; iter++) {
              float testU = u_playerPos.x + currentDist * (u_dir.x + u_plane.x * (2.0 * v_texCoord.x - 1.0));
              float testV = u_playerPos.y + currentDist * (u_dir.y + u_plane.y * (2.0 * v_texCoord.x - 1.0));
              
              vec2 testTileUV = clamp((floor(vec2(testU, testV)) + 0.5) / u_mapSize, 0.0, 1.0);
              float decodedFVal = texture2D(u_waterTex, testTileUV).g;
              float tileFLevel = (decodedFVal * 255.0 - 128.0) / 50.0;
              
              if (abs(tileFLevel - lastFLevel) < 0.001) {
                fLevel = tileFLevel;
                u = testU;
                v = testV;
                tileUV = testTileUV;
                break;
              }
              
              float nextFloorRayHeight = u_cameraZ - tileFLevel;
              if (tileFLevel < 0.0 && tileFLevel >= -5.0) {
                nextFloorRayHeight += tileFLevel;
              }
              if (nextFloorRayHeight < 0.01) {
                nextFloorRayHeight = u_cameraZ - tileFLevel;
              }
              float nextDist = (nextFloorRayHeight * u_resolution.y) / dy;
              if (nextDist < 0.0) {
                break;
              }
              
              if (abs(nextDist - currentDist) < 0.001) {
                currentDist = nextDist;
                fLevel = tileFLevel;
                u = testU;
                v = testV;
                tileUV = testTileUV;
                break;
              }
              
              currentDist = nextDist;
              lastFLevel = tileFLevel;
              u = testU;
              v = testV;
              tileUV = testTileUV;
              fLevel = tileFLevel;
            }
          }
          
          dist = currentDist;
          
          float sampleDist = dist;
          float sampleU = u;
          float sampleV = v;
          if (abs(fLevel) > 0.001) {
            sampleDist = ((u_cameraZ - fLevel) * u_resolution.y) / dy;
            sampleU = u_playerPos.x + sampleDist * (u_dir.x + u_plane.x * (2.0 * v_texCoord.x - 1.0));
            sampleV = u_playerPos.y + sampleDist * (u_dir.y + u_plane.y * (2.0 * v_texCoord.x - 1.0));
          }
          
          float checkU = sampleU;
          float checkV = sampleV;
          if (abs(fLevel) > 0.001) {
            checkU = u;
            checkV = v;
          }
          
          if (!floorVisible || checkU < 0.0 || checkU >= u_mapSize.x || checkV < 0.0 || checkV >= u_mapSize.y) {
            if (u_ceilingType == 1) {
              finalColor = getSkyColor(y);
            } else {
              finalColor = vec4(u_fogColor, 1.0);
            }
          } else {
            float isWater = texture2D(u_waterTex, tileUV).r;
            
            float finalU = sampleU;
            float finalV = sampleV;
            if (abs(fLevel) > 0.001) {
              finalU = floor(u) + fract(sampleU);
              finalV = floor(v) + fract(sampleV);
            }
            if (isWater > 0.5) {
              float tu = floor(finalU);
              float tv = floor(finalV);
              float fracU = finalU - tu;
              float fracV = finalV - tv;
              
              float dU = sin(finalU * 10.0 + u_time * 2.0) * 0.05 + cos(finalV * 10.0 + u_time * 1.5) * 0.05;
              float dV = sin(finalV * 10.0 + u_time * 1.5) * 0.05 + cos(finalU * 10.0 + u_time * 2.0) * 0.05;
              
              fracU = fract(fracU + dU + 1.0);
              fracV = fract(fracV + dV + 1.0);
              
              finalU = tu + fracU;
              finalV = tv + fracV;
            }

            // Dynamic floor panning/coordinates mapping
            float cellX = floor(finalU);
            float cellY = floor(finalV);
            float tx_fraction = 1.0 - (finalU - cellX);
            float ty_fraction = finalV - cellY;
            vec2 mapUV = vec2((cellX + tx_fraction) / u_mapSize.x, (cellY + ty_fraction) / u_mapSize.y);
            vec4 texColor = texture2D(u_floorTex, mapUV);
            
            // Sample lightmap and highlights at the exact surface positions (finalU, finalV)
            vec2 lightPos = vec2(finalU, finalV);
            vec4 lightMapColor = getInterpolatedLight(lightPos, u_lightTex, u_waterTex, u_mapSize);
            
            // For floor highlights, sample u_highlightTex using exact tile surface coordinates
            vec2 highlightUV = vec2(lightPos.x / u_mapSize.x, lightPos.y / u_mapSize.y);
            vec4 highlightColor = texture2D(u_highlightTex, highlightUV);
            
            // Apply GPU-rendered sprite shadows
            if (u_shadowCount > 0) {
              float maxIntensity = 0.0;
              for (int i = 0; i < 16; i++) {
                if (i >= u_shadowCount) break;
                vec4 s = u_shadows[i];
                float dx = sampleU - s.x;
                float dy = sampleV - s.y;
                if (abs(dx) < s.z && abs(dy) < s.w) {
                  float d2 = (dx*dx) / (s.z*s.z) + (dy*dy) / (s.w*s.w);
                  if (d2 < 1.0) {
                    float intensity = smoothstep(1.0, 0.0, d2);
                    if (intensity > maxIntensity) {
                      maxIntensity = intensity;
                    }
                  }
                }
              }
              if (maxIntensity > 0.0) {
                if (u_magentaShadows) {
                  texColor.rgb = mix(texColor.rgb, vec3(1.0, 0.0, 1.0), maxIntensity * 0.9);
                } else {
                  texColor.rgb *= (1.0 - maxIntensity * 0.65);
                }
              }
            }

            // Distance depth shading identical to CPU
            float factor = getDepthFactor(sampleDist);
            vec3 foggedColor;
            if (u_isFog) {
              foggedColor = mix(texColor.rgb * lightMapColor.rgb, u_fogColor, 1.0 - factor);
            } else {
              foggedColor = texColor.rgb * lightMapColor.rgb * factor;
            }
            
            // Add lightning (additive)
            if (u_lightningIntensity > 0.0) {
              foggedColor += vec3(u_lightningIntensity * lightMapColor.a * (150.0/255.0), u_lightningIntensity * lightMapColor.a * (160.0/255.0), u_lightningIntensity * lightMapColor.a * (200.0/255.0));
            }

            // Add muzzle flash (additive, dynamic distance to player)
            if (u_muzzleFlashIntensity > 0.0) {
              vec2 playerToUV = vec2(sampleU, sampleV) - u_playerPos;
              float distToPlayerSq = dot(playerToUV, playerToUV);
              float flashI = u_muzzleFlashIntensity / (distToPlayerSq * 0.5 + 1.0);
              foggedColor += vec3(flashI * (255.0/255.0), flashI * (200.0/255.0), flashI * (80.0/255.0));
            }

            // Add active flashes
            for (int i = 0; i < 8; i++) {
              if (i >= u_activeFlashCount) break;
              vec3 flash = u_activeFlashes[i];
              vec2 flashToUV = vec2(sampleU, sampleV) - flash.xy;
              float distSq = dot(flashToUV, flashToUV);
              float flashI = flash.z / (distSq * 0.5 + 1.0);
              foggedColor += vec3(flashI * (255.0/255.0), flashI * (200.0/255.0), flashI * (80.0/255.0));
            }

            foggedColor = clamp(foggedColor, 0.0, 1.0);

            // Apply highlight tint (just like software mode)
            if (highlightColor.r > 0.1) {
              float highlightPulse = 0.25 + 0.75 * (sin(u_time * 2.2222222) * 0.5 + 0.5);
              foggedColor.r = min(1.0, foggedColor.r + (60.0 / 255.0) * highlightPulse);
              foggedColor.g *= (1.0 - 0.6 * highlightPulse);
              foggedColor.b *= (1.0 - 0.6 * highlightPulse);
            }
            
            finalColor = vec4(foggedColor, 1.0);
          }
        }
      } else {
        if (u_ceilingType == 1) {
          finalColor = getSkyColor(y);
        } else {
          finalColor = vec4(u_fogColor, 1.0);
        }
      }
    } else if (dy < -0.1) {
      // Ceiling plane / Outdoor Skybox rendering
      if (u_ceilingType == 1) {
        // Celestial dome (Skybox)
        finalColor = getSkyColor(y);
      } else {
        finalColor = vec4(u_fogColor, 1.0);
      }
    } else {
      if (u_ceilingType == 1) {
        finalColor = getSkyColor(y);
      } else {
        finalColor = vec4(u_fogColor, 1.0);
      }
    }
    
    gl_FragColor = finalColor;
  }
`;

const MIRROR_BG_VS = `
  attribute vec2 position;
  attribute vec2 a_playerPos;
  attribute vec2 a_dir;
  attribute vec2 a_maskTopBottom;
  attribute float a_perpWallDist;
  attribute vec3 a_mirrorLight;
  varying vec2 v_texCoord;
  varying vec2 v_playerPos;
  varying vec2 v_dir;
  varying vec2 v_maskTopBottom;
  varying float v_perpWallDist;
  varying vec3 v_mirrorLight;
  void main() {
    v_texCoord = position * 0.5 + 0.5;
    v_playerPos = a_playerPos;
    v_dir = a_dir;
    v_maskTopBottom = a_maskTopBottom;
    v_perpWallDist = a_perpWallDist;
    v_mirrorLight = a_mirrorLight;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const MIRROR_BG_FS = `
  precision highp float;
  varying vec2 v_texCoord;
  varying vec2 v_playerPos;
  varying vec2 v_dir;
  varying vec2 v_maskTopBottom;
  varying float v_perpWallDist;
  varying vec3 v_mirrorLight;

  uniform int u_shadowCount;
  uniform vec4 u_shadows[16];
  uniform bool u_magentaShadows;

  uniform vec2 u_resolution;
  uniform float u_cameraZ;
  uniform float u_playerFloorHeight;
  uniform float u_horizon;
  uniform int u_ceilingType; // 0 = INDOOR, 1 = OUTDOOR
  uniform float u_renderDistance;
  uniform float u_minBrightness;
  uniform float u_lightningIntensity;
  uniform float u_muzzleFlashIntensity;
  uniform int u_activeFlashCount;
  uniform vec3 u_activeFlashes[8];
  
  uniform vec3 u_fogColor;
  uniform bool u_isFog;
  uniform vec2 u_skySize;
  uniform float u_skyVScale;
  uniform int u_skyIsFallback;

  // Precomputed fog parameters
  uniform float u_fogStart;
  uniform float u_invFogRange;
  uniform float u_invRenderDistance;

  // Textures
  uniform sampler2D u_floorTex;
  uniform sampler2D u_ceilTex;
  uniform sampler2D u_skyTex;
  uniform sampler2D u_lightTex;
  uniform sampler2D u_highlightTex;
  uniform sampler2D u_waterTex;
  uniform float u_time;
  uniform vec2 u_mapSize;

  float getDepthFactor(float d) {
    if (u_isFog) {
      float t = clamp(d * u_invRenderDistance, 0.0, 1.0);
      return 1.0 - (t * t * (3.0 - 2.0 * t));
    }
    return max(u_minBrightness, 1.0 - smoothstep(u_fogStart, u_renderDistance, d));
  }

  vec4 getInterpolatedLight(vec2 pos, sampler2D lightTex, sampler2D infoTex, vec2 mapSize) {
    vec2 uv = pos - vec2(0.5);
    vec2 f00 = floor(uv);
    vec2 t = uv - f00;
    
    vec2 centerTile = floor(pos);
    vec2 centerUV = (centerTile + vec2(0.5)) / mapSize;
    vec4 centerLight = texture2D(lightTex, centerUV);

    vec2 p00 = f00;
    vec2 p10 = f00 + vec2(1.0, 0.0);
    vec2 p01 = f00 + vec2(0.0, 1.0);
    vec2 p11 = f00 + vec2(1.0, 1.0);

    vec2 uv00 = clamp((p00 + vec2(0.5)) / mapSize, 0.0, 1.0);
    vec2 uv10 = clamp((p10 + vec2(0.5)) / mapSize, 0.0, 1.0);
    vec2 uv01 = clamp((p01 + vec2(0.5)) / mapSize, 0.0, 1.0);
    vec2 uv11 = clamp((p11 + vec2(0.5)) / mapSize, 0.0, 1.0);

    // Parallel lookup fetches to optimize GPU pipelining and hardware pre-fetching
    float wall00 = texture2D(infoTex, uv00).b;
    float wall10 = texture2D(infoTex, uv10).b;
    float wall01 = texture2D(infoTex, uv01).b;
    float wall11 = texture2D(infoTex, uv11).b;

    vec4 tex00 = texture2D(lightTex, uv00);
    vec4 tex10 = texture2D(lightTex, uv10);
    vec4 tex01 = texture2D(lightTex, uv01);
    vec4 tex11 = texture2D(lightTex, uv11);

    vec4 c00 = (p00.x >= 0.0 && p00.x < mapSize.x && p00.y >= 0.0 && p00.y < mapSize.y && wall00 < 0.5) ? tex00 : centerLight;
    vec4 c10 = (p10.x >= 0.0 && p10.x < mapSize.x && p10.y >= 0.0 && p10.y < mapSize.y && wall10 < 0.5) ? tex10 : centerLight;
    vec4 c01 = (p01.x >= 0.0 && p01.x < mapSize.x && p01.y >= 0.0 && p01.y < mapSize.y && wall01 < 0.5) ? tex01 : centerLight;
    vec4 c11 = (p11.x >= 0.0 && p11.x < mapSize.x && p11.y >= 0.0 && p11.y < mapSize.y && wall11 < 0.5) ? tex11 : centerLight;

    return mix(mix(c00, c10, t.x), mix(c01, c11, t.x), t.y);
  }

  vec4 getMirrorSkyColor(float scrY, vec2 rDir) {
    float angle = atan(rDir.y, rDir.x);
    if (angle < 0.0) angle += 6.283185307179586;

    float tx = angle / 6.283185307179586;
    float ty = (scrY / u_resolution.y) * u_skyVScale;
    
    if (u_skyIsFallback != 1) {
      ty = clamp(ty, 0.0, 1.0);
    }

    vec4 skyColor = texture2D(u_skyTex, vec2(tx, ty));
    
    // Lightning effect
    vec3 finalColor = skyColor.rgb;
    if (u_lightningIntensity > 0.0) {
      vec3 flashColor = vec3(1.0, 1.0, 1.0);
      finalColor = mix(finalColor, flashColor, u_lightningIntensity * 0.6);
    }
    
    return vec4(finalColor, 1.0);
  }

  void main() {
    float screenX = v_texCoord.x * u_resolution.x;
    float screenY = (1.0 - v_texCoord.y) * u_resolution.y;

    if (screenY < v_maskTopBottom.x || screenY > v_maskTopBottom.y) {
      discard;
    }

    float pY = screenY - u_horizon;
    float rowDistance = 0.0;
    bool isFloor = pY >= 0.0;

    if (!isFloor && u_ceilingType == 1) {
      // Ceil type OUTDOOR: Render Sky
      gl_FragColor = vec4(getMirrorSkyColor(screenY, v_dir).rgb * v_mirrorLight, 1.0);
      return;
    }

    if (isFloor) {
      float floorRayHeight = u_cameraZ - u_playerFloorHeight;
      if (u_playerFloorHeight < 0.0 && u_playerFloorHeight >= -5.0) {
        floorRayHeight += u_playerFloorHeight;
      }
      if (floorRayHeight < 0.01) {
        floorRayHeight = u_cameraZ - u_playerFloorHeight;
      }
      float denom = pY;
      if (abs(denom) < 0.1) denom = 0.1;
      rowDistance = (floorRayHeight * u_resolution.y) / denom;
    } else {
      float denom = -pY;
      if (abs(denom) < 0.1) denom = 0.1;
      rowDistance = ((1.0 - u_cameraZ) * u_resolution.y) / denom;
    }

    if (rowDistance > u_renderDistance * 3.0) {
      if (u_ceilingType == 1) {
        gl_FragColor = vec4(getMirrorSkyColor(screenY, v_dir).rgb * v_mirrorLight, 1.0);
      } else {
        gl_FragColor = vec4(u_fogColor * v_mirrorLight, 1.0);
      }
      return;
    }

    // Floor space coordinates
    float weight = max(0.0, rowDistance - v_perpWallDist);
    float floorX = v_playerPos.x + v_dir.x * weight;
    float floorY = v_playerPos.y + v_dir.y * weight;

    floorX = mod(floorX, u_mapSize.x);
    if (floorX < 0.0) floorX += u_mapSize.x;
    floorY = mod(floorY, u_mapSize.y);
    if (floorY < 0.0) floorY += u_mapSize.y;

    float fLevel = 0.0;
    if (isFloor) {
      vec2 tileUV = clamp((floor(vec2(floorX, floorY)) + 0.5) / u_mapSize, 0.0, 1.0);
      float fFloorVal = texture2D(u_waterTex, tileUV).g;
      fLevel = (fFloorVal * 255.0 - 128.0) / 50.0;
    }

    float sampleRowDistance = rowDistance;
    float sampleFloorX = floorX;
    float sampleFloorY = floorY;

    if (isFloor && abs(fLevel) > 0.001) {
      float denom = pY;
      if (abs(denom) < 0.1) denom = 0.1;
      sampleRowDistance = ((u_cameraZ - fLevel) * u_resolution.y) / denom;
      float sampleWeight = max(0.0, sampleRowDistance - v_perpWallDist);
      sampleFloorX = v_playerPos.x + v_dir.x * sampleWeight;
      sampleFloorY = v_playerPos.y + v_dir.y * sampleWeight;

      sampleFloorX = mod(sampleFloorX, u_mapSize.x);
      if (sampleFloorX < 0.0) sampleFloorX += u_mapSize.x;
      sampleFloorY = mod(sampleFloorY, u_mapSize.y);
      if (sampleFloorY < 0.0) sampleFloorY += u_mapSize.y;
    }

    // Dynamic lightmap
    float gridX = floor(sampleFloorX);
    float gridY = floor(sampleFloorY);
    if (isFloor && abs(fLevel) > 0.001) {
      gridX = floor(floorX);
      gridY = floor(floorY);
    }
    vec2 lightUV = (vec2(gridX, gridY) + vec2(0.5)) / u_mapSize;
    vec4 lightVal = texture2D(u_lightTex, lightUV);

    // Texture coords
    float tx = fract(sampleFloorX);
    float ty = fract(sampleFloorY);
    if (isFloor && abs(fLevel) > 0.001) {
      tx = fract(floorX);
      ty = fract(floorY);
    }

    // Map tile coords
    // Sampling water state map (each world unit matches 1 tile in mapSize space)
    vec2 tileUV = clamp((floor(vec2(sampleFloorX, sampleFloorY)) + 0.5) / u_mapSize, 0.0, 1.0);
    if (isFloor && abs(fLevel) > 0.001) {
      tileUV = clamp((floor(vec2(floorX, floorY)) + 0.5) / u_mapSize, 0.0, 1.0);
    }
    float isWater = texture2D(u_waterTex, tileUV).r;
    
    float finalU = sampleFloorX;
    float finalV = sampleFloorY;
    if (isFloor && abs(fLevel) > 0.001) {
      finalU = floor(floorX) + fract(sampleFloorX);
      finalV = floor(floorY) + fract(sampleFloorY);
    }
    if (isWater > 0.5) {
      float tu = floor(finalU);
      float tv = floor(finalV);
      float fracU = finalU - tu;
      float fracV = finalV - tv;
      
      float dU = sin(finalU * 10.0 + u_time * 2.0) * 0.05 + cos(finalV * 10.0 + u_time * 1.5) * 0.05;
      float dV = sin(finalV * 10.0 + u_time * 1.5) * 0.05 + cos(finalU * 10.0 + u_time * 2.0) * 0.05;
      
      fracU = fract(fracU + dU + 1.0);
      fracV = fract(fracV + dV + 1.0);
      
      finalU = tu + fracU;
      finalV = tv + fracV;
    }

    // Dynamic floor panning/coordinates mapping
    vec2 mapUV;
    if (isFloor) {
      float cellX = floor(finalU);
      float cellY = floor(finalV);
      float tx_fraction = 1.0 - (finalU - cellX);
      float ty_fraction = finalV - cellY;
      mapUV = vec2((cellX + tx_fraction) / u_mapSize.x, (cellY + ty_fraction) / u_mapSize.y);
    } else {
      float cellX = floor(finalU);
      float cellY = floor(finalV);
      float tx_fraction = 1.0 - (finalU - cellX);
      float ty_fraction = 1.0 - (finalV - cellY);
      mapUV = vec2((cellX + tx_fraction) / u_mapSize.x, (cellY + ty_fraction) / u_mapSize.y);
    }
    vec4 texColor;
    if (isFloor) {
      texColor = texture2D(u_floorTex, mapUV);
    } else {
      texColor = texture2D(u_ceilTex, mapUV);
    }

    // Base brightness/lighting using exact surface coordinates (finalU, finalV)
    vec2 lightPos = vec2(finalU, finalV);
    vec4 lightMapColor = getInterpolatedLight(lightPos, u_lightTex, u_waterTex, u_mapSize);
    
    // For floor highlights in reflection, sample u_highlightTex using exact tile surface coordinates
    vec2 highlightUV = vec2(lightPos.x / u_mapSize.x, lightPos.y / u_mapSize.y);
    vec4 highlightColor = texture2D(u_highlightTex, highlightUV);

    // Apply GPU-rendered sprite shadows in reflections
    if (u_shadowCount > 0 && isFloor) {
      float maxIntensity = 0.0;
      for (int i = 0; i < 16; i++) {
        if (i >= u_shadowCount) break;
        vec4 s = u_shadows[i];
        float dx = sampleFloorX - s.x;
        float dy = sampleFloorY - s.y;
        if (abs(dx) < s.z && abs(dy) < s.w) {
          float d2 = (dx*dx) / (s.z*s.z) + (dy*dy) / (s.w*s.w);
          if (d2 < 1.0) {
            float intensity = smoothstep(1.0, 0.0, d2);
            if (intensity > maxIntensity) {
              maxIntensity = intensity;
            }
          }
        }
      }
      if (maxIntensity > 0.0) {
        if (u_magentaShadows) {
          texColor.rgb = mix(texColor.rgb, vec3(1.0, 0.0, 1.0), maxIntensity * 0.9);
        } else {
          texColor.rgb *= (1.0 - maxIntensity * 0.65);
        }
      }
    }

    // Distance depth shading identical to CPU
    float depthFactor = getDepthFactor(sampleRowDistance);
    vec3 foggedColor;
    if (u_isFog) {
      foggedColor = mix(texColor.rgb * lightMapColor.rgb, u_fogColor, 1.0 - depthFactor);
    } else {
      foggedColor = texColor.rgb * lightMapColor.rgb * depthFactor;
    }

    // Add lightning (additive)
    if (u_lightningIntensity > 0.0) {
      foggedColor += vec3(u_lightningIntensity * lightMapColor.a * (150.0/255.0), u_lightningIntensity * lightMapColor.a * (160.0/255.0), u_lightningIntensity * lightMapColor.a * (200.0/255.0));
    }

    // Add muzzle flash (additive, dynamic distance to player)
    if (u_muzzleFlashIntensity > 0.0) {
      vec2 playerToUV = vec2(floorX, floorY) - v_playerPos;
      float distToPlayerSq = dot(playerToUV, playerToUV);
      float flashI = u_muzzleFlashIntensity / (distToPlayerSq * 0.5 + 1.0);
      foggedColor += vec3(flashI * (255.0/255.0), flashI * (200.0/255.0), flashI * (80.0/255.0));
    }

    // Add active flashes
    for (int i = 0; i < 8; i++) {
      if (i >= u_activeFlashCount) break;
      vec3 flash = u_activeFlashes[i];
      vec2 flashToUV = vec2(floorX, floorY) - flash.xy;
      float distSq = dot(flashToUV, flashToUV);
      float flashI = flash.z / (distSq * 0.5 + 1.0);
      foggedColor += vec3(flashI * (255.0/255.0), flashI * (200.0/255.0), flashI * (80.0/255.0));
    }

    foggedColor = clamp(foggedColor, 0.0, 1.0);

    // Apply highlight tint (just like software mode)
    if (highlightColor.r > 0.1 && isFloor) {
      float highlightPulse = 0.25 + 0.75 * (sin(u_time * 2.2222222) * 0.5 + 0.5);
      foggedColor.r = min(1.0, foggedColor.r + (60.0 / 255.0) * highlightPulse);
      foggedColor.g *= (1.0 - 0.6 * highlightPulse);
      foggedColor.b *= (1.0 - 0.6 * highlightPulse);
    }

    gl_FragColor = vec4(foggedColor * v_mirrorLight, 1.0);
  }
`;


const WALL_VS = `
  attribute vec2 position;
  attribute vec2 texCoord;
  attribute vec4 color;
  attribute vec2 a_maskTopBottom;
  varying vec2 v_texCoord;
  varying vec4 v_color;
  varying vec2 v_maskTopBottom;
  void main() {
    v_texCoord = texCoord;
    v_color = color;
    v_maskTopBottom = a_maskTopBottom;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const WALL_FS = `
  precision highp float;
  varying vec2 v_texCoord;
  varying vec4 v_color;
  varying vec2 v_maskTopBottom;
  uniform sampler2D u_wallTex;
  uniform vec3 u_fogColor;
  uniform float u_height;
  void main() {
    float screenY = u_height - gl_FragCoord.y;
    if (screenY < v_maskTopBottom.x || screenY > v_maskTopBottom.y) {
      discard;
    }
    
    vec4 texColor = texture2D(u_wallTex, v_texCoord);
    if (texColor.a < 0.1) {
      discard; // Handle alpha masking/cutouts for doors and gates
    }
    
    // Discard green screen (mirror mask) to leave transparent hole
    if (texColor.g > 0.9 && texColor.r < 0.15 && texColor.b < 0.15) {
      discard;
    }
    
    // Apply dynamic shading and fog calculated per vertex
    vec3 litColor = texColor.rgb * v_color.rgb;
    vec3 foggedColor = mix(litColor, u_fogColor, v_color.a);
    gl_FragColor = vec4(foggedColor, texColor.a);
  }
`;

const FLASHLIGHT_VS = `
  attribute vec2 position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FLASHLIGHT_FS = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform sampler2D u_sceneTex;
  uniform sampler2D u_lightProfileTex;
  uniform sampler2D u_maskTex;
  uniform bool u_useMask;

  void main() {
    vec2 flippedTexCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);

    vec3 baseColor = texture2D(u_sceneTex, flippedTexCoord).rgb;
    vec4 lightColor = texture2D(u_lightProfileTex, flippedTexCoord);

    float drawAlpha = lightColor.a;
    if (u_useMask) {
      float maskAlpha = texture2D(u_maskTex, flippedTexCoord).a;
      drawAlpha *= (1.0 - maskAlpha * 0.5);
    }

    // Pass 1: Color Dodge (safeguarded against division by zero and float overflow/NaN on various GPUs)
    vec3 dodgeTarget = baseColor / clamp(1.0 - lightColor.rgb * drawAlpha, 0.02, 1.0);

    // Pass 2: Screen (Atmospheric dust/beam)
    vec3 screenColor = lightColor.rgb * 0.15 * drawAlpha;
    vec3 finalColor = dodgeTarget + screenColor - dodgeTarget * screenColor;

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
  }
`;

const SPRITE_VS = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  attribute vec4 a_color;
  attribute float a_dist;
  
  varying vec2 v_texCoord;
  varying vec4 v_color;
  varying float v_dist;
  
  uniform vec2 u_resolution;
  
  void main() {
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
    v_texCoord = a_texCoord;
    v_color = a_color;
    v_dist = a_dist;
  }
`;

const SPRITE_FS = `
  precision highp float;
  
  varying vec2 v_texCoord;
  varying vec4 v_color;
  varying float v_dist;
  
  uniform sampler2D u_spriteTex;
  uniform sampler2D u_zBufferTex;
  uniform vec2 u_resolution;
  uniform float u_zBias;
  
  void main() {
    if (v_dist > -0.5) {
      vec2 screenUV = gl_FragCoord.xy / u_resolution;
      vec4 pack = texture2D(u_zBufferTex, vec2(screenUV.x, 0.5));
      float wallDist = (pack.r * 65536.0 + pack.g * 256.0 + pack.b) * (255.0 / 16777215.0) * 100.0;
      if (wallDist > 0.001 && v_dist > wallDist + u_zBias) {
        discard;
      }
    }
    
    vec4 texColor = texture2D(u_spriteTex, v_texCoord);
    if (texColor.a < 0.01) {
      discard;
    }
    
    gl_FragColor = texColor * v_color;
  }
`;

interface MeshBatch {
  textureId: string;
  vertices: number[];
  vertexBuffer: WebGLBuffer | null;
  vertexCount: number;
}

interface CapBatch {
  textureId: string;
  vertexBuffer: WebGLBuffer | null;
  vertexCount: number;
}

interface QuadData {
  x0: number; x1: number;
  y0: number; y1: number;
  u0: number; u1: number;
  v0: number; v1: number;
  r: number; g: number; b: number;
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

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  
  // Uniform locations cache to avoid garbage collection and CPU overhead from string searches in WebGL
  private uniformLocationsCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  private getUniformLoc(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let programCache = this.uniformLocationsCache.get(program);
    if (!programCache) {
      programCache = new Map();
      this.uniformLocationsCache.set(program, programCache);
    }
    let loc = programCache.get(name);
    if (loc === undefined) {
      loc = this.gl!.getUniformLocation(program, name);
      programCache.set(name, loc);
    }
    return loc;
  }

  // Cached attribute locations: getAttribLocation is a synchronous driver call that
  // is expensive when issued per frame. Locations are stable per program, so cache them.
  private attribLocationsCache = new Map<WebGLProgram, Map<string, number>>();

  private getAttribLoc(program: WebGLProgram, name: string): number {
    let programCache = this.attribLocationsCache.get(program);
    if (!programCache) {
      programCache = new Map();
      this.attribLocationsCache.set(program, programCache);
    }
    let loc = programCache.get(name);
    if (loc === undefined) {
      loc = this.gl!.getAttribLocation(program, name);
      programCache.set(name, loc);
    }
    return loc;
  }

  // 3D Mesh properties
  private meshProgram: WebGLProgram | null = null;
  private capProgram: WebGLProgram | null = null;
  private meshBatches = new Map<string, MeshBatch>();
  private capBatches = new Map<string, CapBatch>();
  private polyBatches: PolyBatch[] = [];
  private wallTextureGroups = new Map<string, QuadData[]>();
  private lastActiveGrids: any[][] | null = null;
  private lastCustomWallBuffers: any = null;
  private lastCustomFloorBuffers: any = null;
  private lastFloorLightMaps: any = null;
  private lastDebugTextures = true;
  
  // Shaders compilation cache
  private bgProgram: WebGLProgram | null = null;
  private wallProgram: WebGLProgram | null = null;
  private mirrorBgProgram: WebGLProgram | null = null;
  private polyProgram: WebGLProgram | null = null;

  // Vertex buffers
  private bgQuadBuffer: WebGLBuffer | null = null;
  private wallVertexBuffer: WebGLBuffer | null = null;
  private mirrorBgVertexBuffer: WebGLBuffer | null = null;
  private polyVertexBuffer: WebGLBuffer | null = null;
  private polyFloatArray: Float32Array = new Float32Array(65536);

  // GPU Texture cache
  private gpuTextures = new Map<string, WebGLTexture>();
  private gpuTextureSources = new Map<string, any>();
  private blankTexture: WebGLTexture | null = null;
  private lightTexture: WebGLTexture | null = null;
  private highlightTexture: WebGLTexture | null = null;
  private waterTexture: WebGLTexture | null = null;

  // Dynamic Map textures for Floor & Ceiling
  private floorMapTexture: WebGLTexture | null = null;
  private ceilMapTexture: WebGLTexture | null = null;
  private floorMapData: Uint32Array | null = null;
  private ceilMapData: Uint32Array | null = null;
  private lightDataBuffer: Uint8Array | null = null;
  private highlightDataBuffer: Uint8Array | null = null;
  private waterDataBuffer: Uint8Array | null = null;
  private lastMapWidth: number = 0;
  private lastMapHeight: number = 0;
  private floorMapInitialized = false;
  private lastFloorBuf: RaycasterBuffer | null = null;
  private lastCeilBuf: RaycasterBuffer | null = null;
  private lastAuxBuffers: Map<string, any> | null = null;
  private lastAuxBuffersSize: number = 0;
  private lastGrid: any[][] | null = null;
  private lastGridForTextures: any[][] | null = null;
  private lastTileFloorAssets: any[] | null = null;
  private lastTileCeilAssets: any[] | null = null;
  private textureFiltering: boolean = false;
  private tileUploadBuffer = new Uint32Array(64 * 64);

  // Caching variables for map-wide textures to prevent redundant loops and GPU uploads
  private lastLightMap: any = null;
  private lastGridForLight: any = null;
  private lastLightningMap: any = null;
  private lastGridGeometryHash: number = 0;
  private lastBuild3DGeometryHash: number = 0;
  
  private lastWaterGrid: any = null;
  private lastGridForWater: any = null;
  private waterTiles: { x: number; y: number }[] = [];

  private lastHighlightGrid: any = null;
  private lastHighlightedTiles: any[] | undefined = undefined;

  // Particle Shader and buffers
  private particleProgram: WebGLProgram | null = null;
  private particleVertexBuffer: WebGLBuffer | null = null;

  // Flashlight shader and textures
  private flashlightProgram: WebGLProgram | null = null;
  private sceneTexture: WebGLTexture | null = null;
  private maskTexture: WebGLTexture | null = null;
  private lightProfileTexture: WebGLTexture | null = null;

  // Sprite Shader and buffers
  private spriteProgram: WebGLProgram | null = null;
  private spriteVertexBuffer: WebGLBuffer | null = null;
  private zBufferTexture: WebGLTexture | null = null;
  private mirrorMaskTexture: WebGLTexture | null = null;
  private cachedMirrorMaskBytes: Uint8Array | null = null;

  // Buffer capacity tracking to avoid gl.bufferData reallocation overhead
  private wallVertexBufferCapacity = 0;
  private mirrorBgVertexBufferCapacity = 0;
  private particleVertexBufferCapacity = 0;
  private spriteVertexBufferCapacity = 0;
  private polyVertexBufferCapacity = 0;

  // Reusable quad-split arrays (avoid per-frame allocation in the wall pass)
  private realQuadsPool: QuadData[] = [];
  private refQuadsPool: QuadData[] = [];

  // Persistent arrays to avoid garbage collection
  private cachedWallVertexArray = new Float32Array(65536);
  private cachedSpriteVertexArray = new Float32Array(65536);
  private cachedParticleVertexArray = new Float32Array(65536);
  private cachedMirrorBgVertexArray = new Float32Array(65536);
  private cachedFlashArray = new Float32Array(24);
  private cachedShadowArray = new Float32Array(16 * 4);
  private cachedZBufferBytes: Uint8Array | null = null;
  private textureGroupsMap = new Map<any, any[]>();
  private textureGroupArraysPool: any[][] = [];
  private spriteSourceUidCounter = 0;

  private getWallVertexArray(minSize: number): Float32Array {
    if (this.cachedWallVertexArray.length < minSize) {
      this.cachedWallVertexArray = new Float32Array(Math.max(this.cachedWallVertexArray.length * 2, minSize));
    }
    return this.cachedWallVertexArray;
  }

  private getMirrorBgVertexArray(minSize: number): Float32Array {
    if (this.cachedMirrorBgVertexArray.length < minSize) {
      this.cachedMirrorBgVertexArray = new Float32Array(Math.max(this.cachedMirrorBgVertexArray.length * 2, minSize));
    }
    return this.cachedMirrorBgVertexArray;
  }

  private getSpriteVertexArray(minSize: number): Float32Array {
    if (this.cachedSpriteVertexArray.length < minSize) {
      this.cachedSpriteVertexArray = new Float32Array(Math.max(this.cachedSpriteVertexArray.length * 2, minSize));
    }
    return this.cachedSpriteVertexArray;
  }


  private getParticleVertexArray(minSize: number): Float32Array {
    if (this.cachedParticleVertexArray.length < minSize) {
      this.cachedParticleVertexArray = new Float32Array(Math.max(this.cachedParticleVertexArray.length * 2, minSize));
    }
    return this.cachedParticleVertexArray;
  }

  constructor(targetCanvas: HTMLCanvasElement) {
    this.canvas = targetCanvas;
    this.initGL();
  }

  public setTextureFiltering(enabled: boolean) {
    if (this.textureFiltering !== enabled) {
      this.textureFiltering = enabled;
      const gl = this.gl;
      if (gl) {
         // Clear GPU textures
         this.gpuTextures.forEach((tex) => {
           gl.deleteTexture(tex);
         });
         this.gpuTextures.clear();
         this.gpuTextureSources.clear();
         
         // Invalidate maps
         this.floorMapInitialized = false;
         if (this.floorMapTexture) {
           gl.deleteTexture(this.floorMapTexture);
           this.floorMapTexture = null;
         }
         if (this.ceilMapTexture) {
           gl.deleteTexture(this.ceilMapTexture);
           this.ceilMapTexture = null;
         }
         this.clearLevelCache();
      }
    }
  }

  private initGL() {
    try {
      this.gl = this.canvas.getContext('webgl', { 
        alpha: true, 
        depth: true, 
        stencil: false, 
        antialias: false, 
        preserveDrawingBuffer: true 
      });
      if (!this.gl) return;

      const gl = this.gl;
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Create blank 1x1 base texture
      this.blankTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.blankTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

      // Compile background shader
      this.bgProgram = this.createProgram(BACKGROUND_VS, BACKGROUND_FS);
      // Compile mesh shader
      this.meshProgram = this.createProgram(MESH_VS, MESH_FS);
      // Compile dedicated upper-floor ceiling-cap shader
      this.capProgram = this.createProgram(CAP_VS, CAP_FS);
      // Compile polyObject 3D shader
      this.polyProgram = this.createProgram(POLY_VS, POLY_FS);
      this.polyVertexBuffer = gl.createBuffer();
      // Compile wall shader
      this.wallProgram = this.createProgram(WALL_VS, WALL_FS);
      // Compile mirror background shader
      this.mirrorBgProgram = this.createProgram(MIRROR_BG_VS, MIRROR_BG_FS);
      this.mirrorBgVertexBuffer = gl.createBuffer();

      // Compile particle shader
      const PARTICLE_VS = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        attribute vec4 a_color;
        varying vec2 v_texCoord;
        varying vec4 v_color;
        uniform vec2 u_resolution;
        void main() {
          vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
          gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
          v_texCoord = a_texCoord;
          v_color = a_color;
        }
      `;

      const PARTICLE_FS = `
        precision highp float;
        varying vec2 v_texCoord;
        varying vec4 v_color;
        uniform sampler2D u_texture;
        uniform int u_renderType; // 0 = flat, 1 = textured, 2 = smoke (radial)
        void main() {
          if (u_renderType == 1) {
            vec4 texColor = texture2D(u_texture, v_texCoord);
            if (texColor.a < 0.05) discard;
            gl_FragColor = texColor * v_color;
          } else if (u_renderType == 2) {
            float dist = length(v_texCoord - vec2(0.5));
            float alpha = smoothstep(0.5, 0.0, dist);
            gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
          } else {
            gl_FragColor = v_color;
          }
        }
      `;

      this.particleProgram = this.createProgram(PARTICLE_VS, PARTICLE_FS);
      this.particleVertexBuffer = gl.createBuffer();

      // Compile flashlight shader
      this.flashlightProgram = this.createProgram(FLASHLIGHT_VS, FLASHLIGHT_FS);

      // Compile sprite shader
      this.spriteProgram = this.createProgram(SPRITE_VS, SPRITE_FS);
      this.spriteVertexBuffer = gl.createBuffer();
      this.zBufferTexture = gl.createTexture();
      this.mirrorMaskTexture = gl.createTexture();

      // Set up fullscreen screen quad
      this.bgQuadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ]), gl.STATIC_DRAW);

      // Set up dynamic wall quads buffer
      this.wallVertexBuffer = gl.createBuffer();

      // Pre-warm all WebGL shader programs to eliminate first-use GPU pipeline compilation and uniform query lag
      this.prewarmWebGL();
    } catch (e) {
      console.error('WebGL Initialization Failed, falling back to soft CPU rendering', e);
      this.gl = null;
    }
  }

  private prewarmWebGL() {
    if (!this.gl) return;
    const gl = this.gl;

    const programs = [
      { prog: this.bgProgram, uniforms: ["u_resolution", "u_cameraZ", "u_playerFloorHeight", "u_horizon", "u_ceilingType", "u_renderDistance", "u_minBrightness", "u_fogColor", "u_fogStart", "u_invFogRange", "u_invRenderDistance", "u_lightningIntensity", "u_muzzleFlashIntensity", "u_activeFlashCount", "u_activeFlashes", "u_skySize", "u_skyVScale", "u_globalAngularShift", "u_skyIsFallback", "u_time", "u_ambientLight", "u_floorTex", "u_ceilTex", "u_skyTex", "u_lightTex", "u_highlightTex", "u_waterTex", "u_isFog", "u_mapSize", "u_shadowCount", "u_shadows", "u_magentaShadows"] },
      { prog: this.mirrorBgProgram, uniforms: ["u_resolution", "u_cameraZ", "u_playerFloorHeight", "u_horizon", "u_ceilingType", "u_renderDistance", "u_minBrightness", "u_fogStart", "u_invFogRange", "u_invRenderDistance", "u_lightningIntensity", "u_muzzleFlashIntensity", "u_fogColor", "u_mapSize", "u_isFog", "u_activeFlashCount", "u_activeFlashes", "u_skySize", "u_skyVScale", "u_skyIsFallback", "u_time", "u_floorTex", "u_ceilTex", "u_skyTex", "u_lightTex", "u_highlightTex", "u_waterTex", "u_shadowCount", "u_shadows", "u_magentaShadows"] },
      { prog: this.meshProgram, uniforms: ["u_playerPos", "u_cameraZ", "u_dir", "u_plane", "u_horizon", "u_resolution", "u_mapSize", "u_renderDistance", "u_minBrightness", "u_fogColor", "u_isFog", "u_lightningIntensity", "u_muzzleFlashIntensity", "u_time", "u_activeFlashCount", "u_activeFlashes", "u_lightTex", "u_highlightTex", "u_waterTex", "u_texture", "u_shadowCount", "u_shadows", "u_magentaShadows"] },
      { prog: this.wallProgram, uniforms: ["u_fogColor", "u_height", "u_wallTex"] },
      { prog: this.particleProgram, uniforms: ["u_resolution", "u_renderType", "u_texture"] },
      { prog: this.flashlightProgram, uniforms: ["u_useMask", "u_sceneTex", "u_lightProfileTex", "u_maskTex"] },
      { prog: this.spriteProgram, uniforms: ["u_resolution", "u_zBias", "u_zBufferTex", "u_spriteTex"] },
      { prog: this.polyProgram, uniforms: ["u_playerPos", "u_cameraZ", "u_dir", "u_plane", "u_horizon", "u_resolution", "u_mapSize", "u_renderDistance", "u_minBrightness", "u_fogColor", "u_isFog", "u_lightningIntensity", "u_muzzleFlashIntensity", "u_time", "u_activeFlashCount", "u_activeFlashes", "u_lightTex", "u_highlightTex", "u_zBufferTex", "u_mirrorMaskTex", "u_polyTex", "u_useTexture"] }
    ];

    for (let i = 0; i < programs.length; i++) {
      const p = programs[i];
      if (p.prog) {
        // Cache all uniforms synchronously on initialization to avoid gameplay thread stalls
        for (let j = 0; j < p.uniforms.length; j++) {
          this.getUniformLoc(p.prog, p.uniforms[j]);
        }

        // Force driver pipeline validation and pre-compilation via dummy no-op draw call
        gl.useProgram(p.prog);
        gl.drawArrays(gl.TRIANGLES, 0, 0);
      }
    }
  }

  public isSupported(): boolean {
    return this.gl !== null;
  }

  private createShader(source: string, type: number): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    const gl = this.gl!;
    const vs = this.createShader(vsSource, gl.VERTEX_SHADER);
    const fs = this.createShader(fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private getTexture(key: string, source: RaycasterBuffer | HTMLImageElement | HTMLCanvasElement | null): WebGLTexture {
    if (!this.gl) return this.blankTexture!;
    if (this.gpuTextures.has(key)) {
      const lastSource = this.gpuTextureSources.get(key);
      const tex = this.gpuTextures.get(key)!;
      if (lastSource !== source) {
        this.gpuTextureSources.set(key, source);
        if (source && tex !== this.blankTexture) {
          const gl = this.gl;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          if ('data' in source && source.data) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(source.data.buffer));
            (source as any).dirty = false;
          } else if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
            if (source instanceof HTMLImageElement && (!source.complete || source.naturalWidth === 0)) {
              return this.blankTexture!;
            }
            try {
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            } catch (err) {
              return this.blankTexture!;
            }
          }
        }
      } else {
        if (source && 'data' in source && source.data && (source as any).dirty) {
          const gl = this.gl;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(
            gl.TEXTURE_2D, 
            0, 
            gl.RGBA, 
            source.width, 
            source.height, 
            0, 
            gl.RGBA, 
            gl.UNSIGNED_BYTE, 
            new Uint8Array(source.data.buffer)
          );
          (source as any).dirty = false;
        }
      }
      return tex;
    }

    if (!source) return this.blankTexture!;

    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) return this.blankTexture!;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    const filter = this.textureFiltering ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

    const w = (source as any).width || (source as any).naturalWidth || 0;
    const h = (source as any).height || (source as any).naturalHeight || 0;
    const isPowerOfTwo = w > 0 && h > 0 && ((w & (w - 1)) === 0) && ((h & (h - 1)) === 0);

    if (isPowerOfTwo) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    if ('data' in source && source.data) {
      // Re-map RaycasterBuffer raw data (Uint32Array)
      gl.texImage2D(
        gl.TEXTURE_2D, 
        0, 
        gl.RGBA, 
        source.width, 
        source.height, 
        0, 
        gl.RGBA, 
        gl.UNSIGNED_BYTE, 
        new Uint8Array(source.data.buffer)
      );
      (source as any).dirty = false;
    } else {
      // Re-map direct image
      if (source instanceof HTMLImageElement && (!source.complete || source.naturalWidth === 0)) {
        return this.blankTexture!;
      }
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as HTMLImageElement);
      } catch (err) {
        return this.blankTexture!;
      }
    }

    this.gpuTextures.set(key, tex);
    this.gpuTextureSources.set(key, source);
    return tex;
  }

  private copyCellToMap(
    mapData: Uint32Array,
    mapWidthInTiles: number,
    cellX: number,
    cellY: number,
    cellBuf: RaycasterBuffer
  ) {
    const stride = mapWidthInTiles * 64;
    const destOffset = cellY * 64 * stride + cellX * 64;
    const srcData = cellBuf.data;
    const srcW = cellBuf.width;
    const srcH = cellBuf.height;

    for (let h = 0; h < 64; h++) {
      const srcRowY = ((h * srcH) / 64) | 0;
      const srcRowOffset = srcRowY * srcW;
      const destRowOffset = destOffset + h * stride;

      for (let w = 0; w < 64; w++) {
        const srcColX = ((w * srcW) / 64) | 0;
        mapData[destRowOffset + w] = srcData[srcRowOffset + srcColX];
      }
    }
  }

  private uploadTileSubImage(
    gl: WebGLRenderingContext,
    texture: WebGLTexture,
    cellX: number,
    cellY: number,
    cellBuf: RaycasterBuffer
  ) {
    const srcData = cellBuf.data;
    const srcW = cellBuf.width;
    const srcH = cellBuf.height;
    const dest = this.tileUploadBuffer;

    for (let h = 0; h < 64; h++) {
      const srcRowY = ((h * srcH) / 64) | 0;
      const srcRowOffset = srcRowY * srcW;
      const destRowOffset = h * 64;

      for (let w = 0; w < 64; w++) {
        const srcColX = ((w * srcW) / 64) | 0;
        dest[destRowOffset + w] = srcData[srcRowOffset + srcColX];
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      cellX * 64,
      cellY * 64,
      64,
      64,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(dest.buffer)
    );
  }

  private updateMapTextures(
    grid: any[][],
    floorBuf: RaycasterBuffer | null,
    ceilBuf: RaycasterBuffer | null,
    customFloorBuffers: Map<number, RaycasterBuffer> | undefined,
    auxBuffers: Map<string, any> | undefined
  ) {
    if (!this.gl) return;
    const gl = this.gl;

    const gridChanged = grid !== this.lastGridForTextures;
    const buffersChanged = floorBuf !== this.lastFloorBuf || ceilBuf !== this.lastCeilBuf || auxBuffers !== this.lastAuxBuffers || (auxBuffers?.size !== this.lastAuxBuffersSize);
    
    if (gridChanged || buffersChanged) {
      this.lastGridForTextures = grid;
      this.lastFloorBuf = floorBuf;
      this.lastCeilBuf = ceilBuf;
      this.lastAuxBuffers = auxBuffers || null;
      this.lastAuxBuffersSize = auxBuffers?.size || 0;
    }

    const needsScan = gridChanged || buffersChanged;

    const mapWidthInTiles = grid && grid[0] ? grid[0].length : 1;
    const mapHeightInTiles = grid ? grid.length : 1;

    // Check if we need to initialize or resize the map texture arrays
    const sizeChanged = mapWidthInTiles !== this.lastMapWidth || mapHeightInTiles !== this.lastMapHeight;
    
    if (sizeChanged || !this.floorMapData || !this.ceilMapData || !this.floorMapTexture || !this.ceilMapTexture) {
      this.lastMapWidth = mapWidthInTiles;
      this.lastMapHeight = mapHeightInTiles;
      
      const totalPixels = mapWidthInTiles * 64 * mapHeightInTiles * 64;
      this.floorMapData = new Uint32Array(totalPixels);
      this.ceilMapData = new Uint32Array(totalPixels);
      
      if (this.floorMapTexture) gl.deleteTexture(this.floorMapTexture);
      if (this.ceilMapTexture) gl.deleteTexture(this.ceilMapTexture);
      
      const filter = this.textureFiltering ? gl.LINEAR : gl.NEAREST;

      this.floorMapTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.floorMapTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      this.ceilMapTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.ceilMapTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.floorMapInitialized = false;
      this.lastTileFloorAssets = null;
      this.lastTileCeilAssets = null;
    }

    let needsGpuUploadFloor = false;
    let needsGpuUploadCeil = false;

    // Ensure our asset tracker arrays are allocated
    if (!this.lastTileFloorAssets || !this.lastTileCeilAssets) {
      this.lastTileFloorAssets = new Array(mapWidthInTiles * mapHeightInTiles).fill(null);
      this.lastTileCeilAssets = new Array(mapWidthInTiles * mapHeightInTiles).fill(null);
    }

    // Perform initial full map copy if not initialized
    if (!this.floorMapInitialized) {
      for (let y = 0; y < mapHeightInTiles; y++) {
        for (let x = 0; x < mapWidthInTiles; x++) {
          const tile = grid[y]?.[x];
          const idx = y * mapWidthInTiles + x;
          
          // --- FLOOR ---
          let fBuf: RaycasterBuffer | null = null;
          const floorDecalKey = (y * 10000 + x) * 10 + 4;
          if (customFloorBuffers && customFloorBuffers.has(floorDecalKey)) {
            fBuf = customFloorBuffers.get(floorDecalKey)!;
          } else if (tile) {
            const floorAssetId = tile.floorAssetId || (tile.type !== 'WALL' ? tile.assetId : null);
            if (floorAssetId) {
              fBuf = auxBuffers?.get(floorAssetId) || auxBuffers?.get('TEX_' + floorAssetId) || null;
            }
          }
          if (!fBuf) fBuf = (tile && tile.type !== 'WALL') ? (auxBuffers?.get('TEX_FALLBACK') || floorBuf) : floorBuf;
          if (fBuf) {
            this.copyCellToMap(this.floorMapData!, mapWidthInTiles, x, y, fBuf);
            if (customFloorBuffers && customFloorBuffers.has(floorDecalKey)) {
              customFloorBuffers.get(floorDecalKey)!.dirty = false;
            }
          }
          this.lastTileFloorAssets[idx] = fBuf;

          // --- CEILING ---
          let cBuf: RaycasterBuffer | null = null;
          const ceilDecalKey = (y * 10000 + x) * 10 + 5;
          if (customFloorBuffers && customFloorBuffers.has(ceilDecalKey)) {
            cBuf = customFloorBuffers.get(ceilDecalKey)!;
          } else if (tile) {
            const ceilingAssetId = tile.ceilingAssetId;
            if (ceilingAssetId) {
              cBuf = auxBuffers?.get(ceilingAssetId) || auxBuffers?.get('TEX_' + ceilingAssetId) || null;
            }
          }
          if (!cBuf) cBuf = ceilBuf;
          if (cBuf) {
            this.copyCellToMap(this.ceilMapData!, mapWidthInTiles, x, y, cBuf);
            if (customFloorBuffers && customFloorBuffers.has(ceilDecalKey)) {
              customFloorBuffers.get(ceilDecalKey)!.dirty = false;
            }
          }
          this.lastTileCeilAssets[idx] = cBuf;
        }
      }
      this.floorMapInitialized = true;
      needsGpuUploadFloor = true;
      needsGpuUploadCeil = true;
    } else if (needsScan) {
      // Incremental updates: Scan all tiles to see if floor or ceiling texture reference changed.
      // Since references are cached, this loop is extremely fast (takes < 0.05ms) and avoids copying pixels on every frame.
      for (let y = 0; y < mapHeightInTiles; y++) {
        for (let x = 0; x < mapWidthInTiles; x++) {
          const tile = grid[y]?.[x];
          const idx = y * mapWidthInTiles + x;

          // --- FLOOR ---
          let fBuf: RaycasterBuffer | null = null;
          const floorDecalKey = (y * 10000 + x) * 10 + 4;
          if (customFloorBuffers && customFloorBuffers.has(floorDecalKey)) {
            fBuf = customFloorBuffers.get(floorDecalKey)!;
          } else if (tile) {
            const floorAssetId = tile.floorAssetId || (tile.type !== 'WALL' ? tile.assetId : null);
            if (floorAssetId) {
              fBuf = auxBuffers?.get(floorAssetId) || auxBuffers?.get('TEX_' + floorAssetId) || null;
            }
          }
          if (!fBuf) fBuf = (tile && tile.type !== 'WALL') ? (auxBuffers?.get('TEX_FALLBACK') || floorBuf) : floorBuf;
          
          if (this.lastTileFloorAssets[idx] !== fBuf || (fBuf && (fBuf as any).dirty)) {
            if (fBuf) {
              this.copyCellToMap(this.floorMapData!, mapWidthInTiles, x, y, fBuf);
              this.uploadTileSubImage(gl, this.floorMapTexture!, x, y, fBuf);
              (fBuf as any).dirty = false;
            }
            this.lastTileFloorAssets[idx] = fBuf;
          }

          // --- CEILING ---
          let cBuf: RaycasterBuffer | null = null;
          const ceilDecalKey = (y * 10000 + x) * 10 + 5;
          if (customFloorBuffers && customFloorBuffers.has(ceilDecalKey)) {
            cBuf = customFloorBuffers.get(ceilDecalKey)!;
          } else if (tile) {
            const ceilingAssetId = tile.ceilingAssetId;
            if (ceilingAssetId) {
              cBuf = auxBuffers?.get(ceilingAssetId) || auxBuffers?.get('TEX_' + ceilingAssetId) || null;
            }
          }
          if (!cBuf) cBuf = ceilBuf;
          
          if (this.lastTileCeilAssets[idx] !== cBuf || (cBuf && (cBuf as any).dirty)) {
            if (cBuf) {
              this.copyCellToMap(this.ceilMapData!, mapWidthInTiles, x, y, cBuf);
              this.uploadTileSubImage(gl, this.ceilMapTexture!, x, y, cBuf);
              (cBuf as any).dirty = false;
            }
            this.lastTileCeilAssets[idx] = cBuf;
          }
        }
      }
    }

    // Also handle any other dirty decals in customFloorBuffers as a fallback on every frame
    if (customFloorBuffers) {
      customFloorBuffers.forEach((buffer, key) => {
        if (buffer.dirty) {
          const face = key % 10;
          const cellKey = (key / 10) | 0;
          const x = cellKey % 10000;
          const y = (cellKey / 10000) | 0;

          if (x >= 0 && x < mapWidthInTiles && y >= 0 && y < mapHeightInTiles) {
            const idx = y * mapWidthInTiles + x;
            if (face === 4) {
              this.copyCellToMap(this.floorMapData!, mapWidthInTiles, x, y, buffer);
              this.lastTileFloorAssets![idx] = buffer;
              this.uploadTileSubImage(gl, this.floorMapTexture!, x, y, buffer);
            } else if (face === 5) {
              this.copyCellToMap(this.ceilMapData!, mapWidthInTiles, x, y, buffer);
              this.lastTileCeilAssets![idx] = buffer;
              this.uploadTileSubImage(gl, this.ceilMapTexture!, x, y, buffer);
            }
          }
          buffer.dirty = false;
        }
      });
    }

    const mapW = mapWidthInTiles * 64;
    const mapH = mapHeightInTiles * 64;

    if (needsGpuUploadFloor) {
      gl.bindTexture(gl.TEXTURE_2D, this.floorMapTexture);
      gl.texImage2D(
        gl.TEXTURE_2D, 
        0, 
        gl.RGBA, 
        mapW, 
        mapH, 
        0, 
        gl.RGBA, 
        gl.UNSIGNED_BYTE, 
        new Uint8Array(this.floorMapData!.buffer)
      );
    }

    if (needsGpuUploadCeil) {
      gl.bindTexture(gl.TEXTURE_2D, this.ceilMapTexture);
      gl.texImage2D(
        gl.TEXTURE_2D, 
        0, 
        gl.RGBA, 
        mapW, 
        mapH, 
        0, 
        gl.RGBA, 
        gl.UNSIGNED_BYTE, 
        new Uint8Array(this.ceilMapData!.buffer)
      );
    }
  }

  public render(
    width: number, 
    height: number,
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    cameraZ: number,
    horizon: number,
    ceilingType: 'INDOOR' | 'OUTDOOR',
    renderDistance: number,
    lightningIntensity: number,
    muzzleFlashIntensity: number,
    floorBuf: RaycasterBuffer | null,
    ceilBuf: RaycasterBuffer | null,
    skyBuf: RaycasterBuffer | null,
    wallQuads: QuadData[],
    auxBuffers: Map<string, RaycasterBuffer> | undefined,
    grid: any[][],
    lightMap?: { r: number; g: number; b: number }[][],
    highlightedTiles?: { x: number; y: number; color?: string }[],
    wallBuf?: RaycasterBuffer | null,
    doorBuf?: RaycasterBuffer | null,
    fov?: number,
    customFloorBuffers?: Map<number, RaycasterBuffer>,
    customWallBuffers?: Map<number, RaycasterBuffer>,
    onWaterVisible?: () => void,
    mirrorReflections?: MirrorReflection[][],
    lightningMap?: Float32Array | null,
    outdoorMap?: boolean[][],
    forceLightUpdate?: boolean,
    activeFlashes?: { x: number; y: number; intensity: number; isFlashbang?: boolean }[],
    flashlightActive?: boolean,
    flashlightBatteryRatio?: number,
    grids?: any[][][],
    polyObjects?: PolyObjectInstance[],
    zBuffer?: Float32Array | number[],
    floorLightMaps?: { r: number; g: number; b: number }[][][],
    debugTextures?: boolean
  ) {
    if (!this.gl) return;
    const gl = this.gl;

    const mapHeight = grid ? grid.length : 1;
    const mapWidth = grid && grid[0] ? grid[0].length : 1;

    // Check grid/active level changes for 3D geometry rebuild
    const activeGrids = grids || [grid];
    const gridRefChanged = (
      grid !== this.lastGrid ||
      activeGrids !== this.lastActiveGrids ||
      customWallBuffers !== this.lastCustomWallBuffers ||
      customFloorBuffers !== this.lastCustomFloorBuffers ||
      (auxBuffers && auxBuffers.size !== this.lastAuxBuffersSize)
    );
    const capLightingChanged = floorLightMaps !== this.lastFloorLightMaps;
    const capTextureModeChanged = debugTextures !== this.lastDebugTextures;

    let currentGeomHash = 0;
    if (gridRefChanged && activeGrids.length > 0) {
      for (let l = 0; l < activeGrids.length; l++) {
        const layer = activeGrids[l];
        if (!layer) continue;
        const h = layer.length;
        for (let y = 0; y < h; y++) {
          const row = layer[y];
          if (!row) continue;
          const w = row.length;
          for (let x = 0; x < w; x++) {
            const tile = row[x];
            if (!tile) continue;
            let tVal = tile.type === 'WALL' ? 1 : (tile.type === 'DOOR' ? (tile.door?.state === 'OPEN' ? 2 : (tile.door?.state === 'CLOSED' ? 3 : 4)) : (tile.type === 'FLOOR' ? 5 : 0));
            if (tile.height) tVal = (tVal + Math.round(tile.height * 100)) | 0;
            if (tile.elevation) tVal = (tVal + Math.round(tile.elevation * 100) * 100) | 0;
            if (tile.assetId) {
              const str = tile.assetId;
              for (let i = 0; i < str.length; i++) {
                tVal = (tVal * 31 + str.charCodeAt(i)) | 0;
              }
            }
            if (tile.texture) {
              const str = tile.texture;
              for (let i = 0; i < str.length; i++) {
                tVal = (tVal * 31 + str.charCodeAt(i)) | 0;
              }
            }
            if (tile.bottomTextureId) {
              const str = tile.bottomTextureId;
              for (let i = 0; i < str.length; i++) {
                tVal = (tVal * 31 + str.charCodeAt(i)) | 0;
              }
            }
            if (tile.textureId) {
              const str = tile.textureId;
              for (let i = 0; i < str.length; i++) {
                tVal = (tVal * 31 + str.charCodeAt(i)) | 0;
              }
            }
            if (tile.isWindow) tVal = (tVal + 1000) | 0;
            if (tile.door?.broken) tVal = (tVal + 2000) | 0;
            if (tile.door?.maskId) {
              const str = tile.door.maskId;
              for (let i = 0; i < str.length; i++) {
                tVal = (tVal * 31 + str.charCodeAt(i)) | 0;
              }
            }
            currentGeomHash = (currentGeomHash * 31 + tVal) | 0;
          }
        }
      }
    }

    const mustRebuildGeometry = (gridRefChanged && (
      this.lastGrid === null ||
      currentGeomHash !== this.lastBuild3DGeometryHash ||
      customWallBuffers !== this.lastCustomWallBuffers ||
      customFloorBuffers !== this.lastCustomFloorBuffers ||
      (auxBuffers && auxBuffers.size !== this.lastAuxBuffersSize)
    )) || capLightingChanged || capTextureModeChanged;

    if (gridRefChanged) {
      this.lastGrid = grid;
      this.lastActiveGrids = activeGrids;
      this.lastCustomWallBuffers = customWallBuffers;
      this.lastCustomFloorBuffers = customFloorBuffers;
      this.lastAuxBuffersSize = auxBuffers ? auxBuffers.size : 0;
    }
    if (capLightingChanged) this.lastFloorLightMaps = floorLightMaps;
    if (capTextureModeChanged) this.lastDebugTextures = debugTextures;

    if (mustRebuildGeometry) {
      this.lastBuild3DGeometryHash = currentGeomHash;
      this.build3DGeometry(grid, activeGrids, customWallBuffers, customFloorBuffers, auxBuffers, floorLightMaps, lightMap, debugTextures);

      // Pre-warm WebGL textures for all static assets in auxBuffers to eliminate first-render GPU upload lag
      if (auxBuffers) {
        auxBuffers.forEach((source, key) => {
          if (source) {
            if (!this.gpuTextures.has(key)) {
              this.getTexture(key, source);
            }
            if (key.startsWith('TEX_')) {
              const baseKey = key.substring(4);
              if (!this.gpuTextures.has(baseKey)) {
                this.getTexture(baseKey, source);
              }
            } else {
              const texKey = 'TEX_' + key;
              if (!this.gpuTextures.has(texKey)) {
                this.getTexture(texKey, source);
              }
            }
          }
        });
      }

      // Pre-warm WebGL textures for all preloaded/pre-tinted sprites to eliminate in-game stutter/lag on visibility
      globalSpriteTintCache.forEach((source, key) => {
        if (source && !this.gpuTextures.has(key)) {
          this.getTexture(key, source);
        }
      });
    }

    const playerTileX = Math.floor(playerX);
    const playerTileY = Math.floor(playerY);
    const playerTile = (grid && playerTileY >= 0 && playerTileY < mapHeight && playerTileX >= 0 && playerTileX < mapWidth) ? grid[playerTileY][playerTileX] : null;
    const playerFloorHeight = playerTile ? ((playerTile.type === 'FLOOR' && playerTile.height !== undefined) ? playerTile.height : 0.0) : 0.0;

    // Update water tiles cache if grid has changed
    if (grid !== this.lastGridForWater) {
      this.lastGridForWater = grid;
      this.waterTiles = [];
      if (grid) {
        for (let y = 0; y < mapHeight; y++) {
          const row = grid[y];
          if (row) {
            for (let x = 0; x < mapWidth; x++) {
              const tile = row[x];
              if (tile && tile.isWater) {
                this.waterTiles.push({ x, y });
              }
            }
          }
        }
      }
    }

    // Check if water is within render distance using cached water tiles list
    if (onWaterVisible && this.waterTiles.length > 0) {
      let waterVisible = false;
      const distLimitSq = 30.0 * 30.0;
      for (let i = 0; i < this.waterTiles.length; i++) {
        const wt = this.waterTiles[i];
        const dx = wt.x + 0.5 - playerX;
        const dy = wt.y + 0.5 - playerY;
        if (dx * dx + dy * dy <= distLimitSq) {
          waterVisible = true;
          break;
        }
      }
      if (waterVisible) {
        onWaterVisible();
      }
    }

    // Update map wide floor/ceiling textures
    this.updateMapTextures(grid, floorBuf, ceilBuf, customFloorBuffers, auxBuffers);

    // Viewport resizing if required
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const fogColorVec = getFogColorVec3();

    // Calculate skybox parameters identical to CPU
    const currentFov = fov !== undefined ? fov : 0.66;
    let skyW = skyBuf ? skyBuf.width : 512;
    let skyH = skyBuf ? skyBuf.height : 256;
    if (!skyBuf && auxBuffers && auxBuffers.has('TEX_FALLBACK')) {
      const fb = auxBuffers.get('TEX_FALLBACK')!;
      skyW = fb.width;
      skyH = fb.height;
    }

    const focalLength = (width / 2) / currentFov;
    const pixelsPerRad = skyW / (2 * Math.PI);
    const skyVScale = pixelsPerRad / focalLength;

    const camAngle = Math.atan2(dirY, dirX);
    const parallaxDistance = 15.0;
    const lateralDisplacement = -playerX * Math.sin(camAngle) + playerY * Math.cos(camAngle);
    const globalAngularShift = lateralDisplacement / parallaxDistance;

    const previousHash = this.lastGridGeometryHash;
    if (grid && grid !== this.lastGridForLight) {
      let hash = 0;
      for (let y = 0; y < mapHeight; y++) {
        const row = grid[y];
        if (!row) continue;
        for (let x = 0; x < mapWidth; x++) {
          const tile = row[x];
          if (!tile) continue;
          let tHash = 0;
          if (tile.type === 'WALL') {
            tHash = 1;
          } else if (tile.type === 'DOOR') {
            const doorState = tile.door?.state === 'OPEN' ? 2 : (tile.door?.state === 'CLOSED' ? 3 : 4);
            tHash = doorState;
          }
          if (tile.isWater) {
            tHash = (tHash | 8) | 0;
          }
          const h = tile.height !== undefined ? Math.round(tile.height * 100) : 0;
          tHash = (tHash ^ h) | 0;
          
          hash = (hash * 31 + tHash) | 0;
        }
      }
      this.lastGridGeometryHash = hash;
      this.lastGridForLight = grid;
    }

    // 1. Update/Upload u_lightTex
    if (!this.lightTexture) {
      this.lightTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.lightTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const geometryChanged = (grid !== this.lastGridForLight && (this.lastGridForLight === null || previousHash !== this.lastGridGeometryHash));

    const needsLightUpdate = (
      lightMap !== this.lastLightMap ||
      geometryChanged ||
      lightningMap !== this.lastLightningMap ||
      !!forceLightUpdate
    );

    if (needsLightUpdate) {
      this.lastLightMap = lightMap;
      this.lastGridForLight = grid;
      this.lastLightningMap = lightningMap;

      const totalBytes = mapWidth * mapHeight * 4;
      if (!this.lightDataBuffer || this.lightDataBuffer.length < totalBytes) {
        this.lightDataBuffer = new Uint8Array(totalBytes);
      }
      const lightData = this.lightDataBuffer;
      const neighborCache = getWallNeighbors(grid);

      const defaultOutdoorMult = ceilingType === 'OUTDOOR' ? 1.0 : 0.0;
      const hasOutdoorMap = !!outdoorMap;

      for (let y = 0; y < mapHeight; y++) {
        const gridRow = grid ? grid[y] : null;
        const lightMapRow = lightMap ? lightMap[y] : null;
        const outdoorRow = hasOutdoorMap && outdoorMap ? outdoorMap[y] : null;

        for (let x = 0; x < mapWidth; x++) {
          let valR = 1.0;
          let valG = 1.0;
          let valB = 1.0;
          if (lightMap) {
            const tile = gridRow ? gridRow[x] : null;
            // Если ячейка является стеной или закрытой дверью, определяем освещённость по среднему значению её пустых соседей
            if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
              const neighbors = neighborCache[y * mapWidth + x];
              if (neighbors && neighbors.length > 0) {
                let sumR = 0, sumG = 0, sumB = 0, count = 0;
                for (let i = 0; i < neighbors.length; i++) {
                  const n = neighbors[i];
                  const nRow = lightMap[n.y];
                  const nVal = nRow ? nRow[n.x] : null;
                  if (nVal) {
                    sumR += nVal.r;
                    sumG += nVal.g;
                    sumB += nVal.b;
                    count++;
                  }
                }
                if (count > 0) {
                  valR = sumR / count;
                  valG = sumG / count;
                  valB = sumB / count;
                }
              }
            } else {
              const cell = lightMapRow ? lightMapRow[x] : null;
              if (cell) {
                valR = cell.r;
                valG = cell.g;
                valB = cell.b;
              }
            }
          }

          // Вычисляем коэффициент молнии для данной ячейки
          let lightningMult = 0.0;
          if (lightningMap) {
            lightningMult = lightningMap[y * mapWidth + x] || 0.0;
          } else if (outdoorRow) {
            lightningMult = outdoorRow[x] ? 1.0 : 0.0;
          } else {
            lightningMult = defaultOutdoorMult;
          }

          const idx = (y * mapWidth + x) * 4;
          let rByte = (valR * 255) | 0;
          let gByte = (valG * 255) | 0;
          let bByte = (valB * 255) | 0;
          let aByte = (lightningMult * 255) | 0;
          if (rByte > 255) rByte = 255; else if (rByte < 0) rByte = 0;
          if (gByte > 255) gByte = 255; else if (gByte < 0) gByte = 0;
          if (bByte > 255) bByte = 255; else if (bByte < 0) bByte = 0;
          if (aByte > 255) aByte = 255; else if (aByte < 0) aByte = 0;

          lightData[idx] = rByte;
          lightData[idx + 1] = gByte;
          lightData[idx + 2] = bByte;
          lightData[idx + 3] = aByte;
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mapWidth, mapHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, lightData);
    }

    // 2. Update/Upload u_highlightTex
    if (!this.highlightTexture) {
      this.highlightTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.highlightTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const needsHighlightUpdate = (
      (this.lastMapWidth !== mapWidth || this.lastMapHeight !== mapHeight) ||
      !areHighlightedSame(highlightedTiles, this.lastHighlightedTiles)
    );

    if (needsHighlightUpdate) {
      this.lastMapWidth = mapWidth;
      this.lastMapHeight = mapHeight;
      this.lastHighlightedTiles = highlightedTiles ? highlightedTiles.map(t => ({ ...t })) : undefined;

      const totalBytes = mapWidth * mapHeight * 4;
      if (!this.highlightDataBuffer || this.highlightDataBuffer.length < totalBytes) {
        this.highlightDataBuffer = new Uint8Array(totalBytes);
      }
      const highlightData = this.highlightDataBuffer;
      highlightData.fill(0);
      if (highlightedTiles) {
        for (const t of highlightedTiles) {
          if (t.x >= 0 && t.x < mapWidth && t.y >= 0 && t.y < mapHeight) {
            const idx = (t.y * mapWidth + t.x) * 4;
            highlightData[idx] = 255; // Highlight flag
            highlightData[idx + 1] = 0;
            highlightData[idx + 2] = 0;
            highlightData[idx + 3] = 255;
          }
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mapWidth, mapHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, highlightData);
    }

    // 3. Update/Upload u_waterTex
    if (!this.waterTexture) {
      this.waterTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.waterTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const needsWaterUpdate = (grid !== this.lastWaterGrid && (this.lastWaterGrid === null || previousHash !== this.lastGridGeometryHash));
    if (needsWaterUpdate) {
      this.lastWaterGrid = grid;

      const totalBytes = mapWidth * mapHeight * 4;
      if (!this.waterDataBuffer || this.waterDataBuffer.length < totalBytes) {
        this.waterDataBuffer = new Uint8Array(totalBytes);
      }
      const waterData = this.waterDataBuffer;
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const tile = grid && grid[y]?.[x];
          const idx = (y * mapWidth + x) * 4;
          const isWaterVal = (tile && tile.isWater) ? 255 : 0;
          
          // Encode tile.height directly in the G channel, 0.0 mappings to 128
          const heightVal = tile ? Math.min(255, Math.max(0, Math.round(((tile.height !== undefined ? tile.height : 0) * 50.0) + 128.0))) : 128;

          const isWallOrClosedDoor = (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) ? 255 : 0;

          waterData[idx] = isWaterVal;     // R
          waterData[idx + 1] = heightVal;  // G
          waterData[idx + 2] = isWallOrClosedDoor; // B
          waterData[idx + 3] = 255;        // A
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mapWidth, mapHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, waterData);
    }

    // ------------------ PASS 1: BACKGROUND ------------------
    if (this.bgProgram) {
      gl.useProgram(this.bgProgram);

      // Bind uniforms
      gl.uniform2f(this.getUniformLoc(this.bgProgram, "u_resolution"), width, height);
      gl.uniform2f(this.getUniformLoc(this.bgProgram, "u_playerPos"), playerX, playerY);
      gl.uniform2f(this.getUniformLoc(this.bgProgram, "u_dir"), dirX, dirY);
      gl.uniform2f(this.getUniformLoc(this.bgProgram, "u_plane"), planeX, planeY);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_cameraZ"), cameraZ);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_playerFloorHeight"), playerFloorHeight);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_horizon"), horizon);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_ceilingType"), ceilingType === 'INDOOR' ? 0 : 1);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_renderDistance"), getDisableDistanceShading() ? 999999.0 : renderDistance);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_minBrightness"), getMinBrightness());
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_fogStart"), getFogStart());
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_invFogRange"), getInvFogRange());
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_invRenderDistance"), getInvRenderDistance());
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_lightningIntensity"), lightningIntensity);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_muzzleFlashIntensity"), muzzleFlashIntensity);
      gl.uniform3f(this.getUniformLoc(this.bgProgram, "u_fogColor"), fogColorVec[0], fogColorVec[1], fogColorVec[2]);
      gl.uniform2f(this.getUniformLoc(this.bgProgram, "u_mapSize"), mapWidth, mapHeight);

      // Active flashes
      const flashCount = activeFlashes ? Math.min(8, activeFlashes.length) : 0;
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_activeFlashCount"), flashCount);
      if (flashCount > 0) {
        const flashArray = this.cachedFlashArray;
        let flashAttenuation = 0.25;
        if (flashlightActive) {
          let quality = 1.0;
          if (flashlightBatteryRatio !== undefined && flashlightBatteryRatio <= 0.5) {
            const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
            quality = factor * 0.5 + 0.5;
          }
          flashAttenuation = 1.0 - (0.75 * quality);
        }
        for (let i = 0; i < flashCount; i++) {
          const f = activeFlashes![i];
          flashArray[i * 3] = f.x;
          flashArray[i * 3 + 1] = f.y;
          flashArray[i * 3 + 2] = flashlightActive ? f.intensity * flashAttenuation : f.intensity;
        }
        gl.uniform3fv(this.getUniformLoc(this.bgProgram, "u_activeFlashes"), flashArray);
      }

      // New inputs identical to CPU formulas
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_isFog"), isFogWeather() ? 1 : 0);
      gl.uniform2f(this.getUniformLoc(this.bgProgram, "u_skySize"), skyW, skyH);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_skyVScale"), skyVScale);
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_globalAngularShift"), globalAngularShift);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_skyIsFallback"), skyBuf ? 0 : 1);

      // Pass current game elapsed time wrapped via modulus to avoid float precision loss in GPU
      gl.uniform1f(this.getUniformLoc(this.bgProgram, "u_time"), (Date.now() % 3600000) / 1000);

      // Upload sprite shadows
      const shadowCount = Math.min(16, this.groundSpriteShadows.length);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_shadowCount"), shadowCount);
      if (shadowCount > 0) {
        const shadowArray = this.cachedShadowArray;
        for (let i = 0; i < shadowCount; i++) {
          const s = this.groundSpriteShadows[i];
          shadowArray[i * 4] = s.x;
          shadowArray[i * 4 + 1] = s.y;
          shadowArray[i * 4 + 2] = s.rx;
          shadowArray[i * 4 + 3] = s.ry;
        }
        gl.uniform4fv(this.getUniformLoc(this.bgProgram, "u_shadows"), shadowArray);
      }
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_magentaShadows"), this.magentaShadowsEnabled ? 1 : 0);

      // Ambient light levels based on weather profiles
      gl.uniform3f(this.getUniformLoc(this.bgProgram, "u_ambientLight"), 0.3, 0.32, 0.35);

      // Bind texture samplers
      const floorTex = this.floorMapTexture || this.getTexture('__floor', floorBuf);
      const ceilTex = this.ceilMapTexture || this.getTexture('__ceil', ceilBuf);
      const skyTex = this.getTexture('__sky', skyBuf || (auxBuffers ? auxBuffers.get('TEX_FALLBACK') : null));

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, floorTex);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_floorTex"), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, ceilTex);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_ceilTex"), 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, skyTex);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_skyTex"), 2);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTexture);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_lightTex"), 3);

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.highlightTexture);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_highlightTex"), 4);

      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.waterTexture!);
      gl.uniform1i(this.getUniformLoc(this.bgProgram, "u_waterTex"), 5);

      // Draw screen aligned quad
      const posAttr = this.getAttribLoc(this.bgProgram, "position");
      gl.enableVertexAttribArray(posAttr);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuadBuffer);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ------------------ PASS 1b: MIRROR BACKGROUNDS ------------------
    if (mirrorReflections && this.mirrorBgProgram) {
      this.renderMirrorBackgroundsWebGL(
        width,
        height,
        mirrorReflections,
        ceilingType,
        skyBuf,
        fov || 1.0,
        auxBuffers,
        grid,
        lightMap || [],
        cameraZ,
        horizon,
        renderDistance,
        lightningIntensity,
        muzzleFlashIntensity,
        fogColorVec,
        playerFloorHeight,
        activeFlashes,
        flashlightActive,
        flashlightBatteryRatio
      );
    }

    // ------------------ PASS 1c: UPPER-FLOOR CEILING CAPS ------------------
    // Static cap geometry is uploaded only when the level/lighting definition changes.
    // Every frame below is GPU-only: no per-pixel ceiling work remains on the CPU.
    if (this.capProgram && this.capBatches.size > 0) {
      gl.useProgram(this.capProgram);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      gl.uniform2f(this.getUniformLoc(this.capProgram, "u_playerPos"), playerX, playerY);
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_cameraZ"), cameraZ);
      gl.uniform2f(this.getUniformLoc(this.capProgram, "u_dir"), dirX, dirY);
      gl.uniform2f(this.getUniformLoc(this.capProgram, "u_plane"), planeX, planeY);
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_horizon"), horizon);
      gl.uniform2f(this.getUniformLoc(this.capProgram, "u_resolution"), width, height);
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_depthFar"), Math.max(renderDistance, 256.0));
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_renderDistance"), getDisableDistanceShading() ? 999999.0 : renderDistance);
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_minBrightness"), getMinBrightness());
      gl.uniform1i(this.getUniformLoc(this.capProgram, "u_isFog"), isFogWeather() ? 1 : 0);
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_fogStart"), getFogStart());
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_invFogRange"), getInvFogRange());
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_invRenderDistance"), getInvRenderDistance());
      gl.uniform3f(this.getUniformLoc(this.capProgram, "u_fogColor"), fogColorVec[0], fogColorVec[1], fogColorVec[2]);
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_lightningIntensity"), lightningIntensity);
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_muzzleFlashIntensity"), muzzleFlashIntensity);

      const capFlashCount = activeFlashes ? Math.min(8, activeFlashes.length) : 0;
      gl.uniform1i(this.getUniformLoc(this.capProgram, "u_activeFlashCount"), capFlashCount);
      if (capFlashCount > 0) {
        const flashArray = this.cachedFlashArray;
        for (let i = 0; i < capFlashCount; i++) {
          const f = activeFlashes![i];
          flashArray[i * 3] = f.x;
          flashArray[i * 3 + 1] = f.y;
          flashArray[i * 3 + 2] = f.intensity;
        }
        gl.uniform3fv(this.getUniformLoc(this.capProgram, "u_activeFlashes"), flashArray);
      }
      let capFlashAttenuation = 1.0;
      if (flashlightActive) {
        let quality = 1.0;
        if (flashlightBatteryRatio !== undefined && flashlightBatteryRatio <= 0.5) {
          const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
          quality = factor * 0.5 + 0.5;
        }
        capFlashAttenuation = 1.0 - (0.75 * quality);
      }
      gl.uniform1f(this.getUniformLoc(this.capProgram, "u_flashlightAttenuation"), capFlashAttenuation);

      const posAttr = this.getAttribLoc(this.capProgram, "a_position");
      const texAttr = this.getAttribLoc(this.capProgram, "a_texCoord");
      const lightAttr = this.getAttribLoc(this.capProgram, "a_light");
      gl.enableVertexAttribArray(posAttr);
      gl.enableVertexAttribArray(texAttr);
      gl.enableVertexAttribArray(lightAttr);

      for (const [texId, batch] of this.capBatches) {
        if (!batch.vertexBuffer || batch.vertexCount === 0) continue;
        let tex: WebGLTexture | null = null;
        const normId = texId.toLowerCase();
        if (auxBuffers && auxBuffers.has(texId)) {
          tex = this.getTexture(texId, auxBuffers.get(texId)!);
        } else if (auxBuffers && auxBuffers.has('TEX_' + texId)) {
          tex = this.getTexture(texId, auxBuffers.get('TEX_' + texId)!);
        } else if (auxBuffers && auxBuffers.has(normId)) {
          tex = this.getTexture(normId, auxBuffers.get(normId)!);
        } else if (auxBuffers && auxBuffers.has('TEX_' + normId)) {
          tex = this.getTexture(normId, auxBuffers.get(normId)!);
        } else if (customFloorBuffers && texId.startsWith('custom_floor_')) {
          const numericKey = parseInt(texId.substring(13), 10);
          const customBuf = customFloorBuffers.get(numericKey);
          tex = customBuf ? this.getTexture(texId, customBuf) : this.blankTexture;
        } else if (auxBuffers && auxBuffers.has('TEX_FALLBACK')) {
          tex = this.getTexture('TEX_FALLBACK', auxBuffers.get('TEX_FALLBACK')!);
        } else {
          tex = this.blankTexture;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(this.getUniformLoc(this.capProgram, "u_texture"), 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertexBuffer);
        gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 32, 0);
        gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 32, 12);
        gl.vertexAttribPointer(lightAttr, 3, gl.FLOAT, false, 32, 20);
        gl.drawArrays(gl.TRIANGLES, 0, batch.vertexCount);
      }

      gl.disableVertexAttribArray(posAttr);
      gl.disableVertexAttribArray(texAttr);
      gl.disableVertexAttribArray(lightAttr);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
    }

    // ------------------ PASS 1d: 3D MESHES (Walls, Floors, Ceilings, Windows) ------------------
    if (this.meshProgram && this.meshBatches.size > 0) {
      gl.useProgram(this.meshProgram);

      gl.uniform2f(this.getUniformLoc(this.meshProgram, "u_playerPos"), playerX, playerY);
      gl.uniform1f(this.getUniformLoc(this.meshProgram, "u_cameraZ"), cameraZ);
      gl.uniform2f(this.getUniformLoc(this.meshProgram, "u_dir"), dirX, dirY);
      gl.uniform2f(this.getUniformLoc(this.meshProgram, "u_plane"), planeX, planeY);
      gl.uniform1f(this.getUniformLoc(this.meshProgram, "u_horizon"), horizon);
      gl.uniform2f(this.getUniformLoc(this.meshProgram, "u_resolution"), width, height);
      gl.uniform2f(this.getUniformLoc(this.meshProgram, "u_mapSize"), mapWidth, mapHeight);
      gl.uniform1f(this.getUniformLoc(this.meshProgram, "u_renderDistance"), getDisableDistanceShading() ? 999999.0 : renderDistance);
      gl.uniform1f(this.getUniformLoc(this.meshProgram, "u_minBrightness"), getMinBrightness());
      gl.uniform3f(this.getUniformLoc(this.meshProgram, "u_fogColor"), fogColorVec[0], fogColorVec[1], fogColorVec[2]);
      gl.uniform1i(this.getUniformLoc(this.meshProgram, "u_isFog"), isFogWeather() ? 1 : 0);
      gl.uniform1f(this.getUniformLoc(this.meshProgram, "u_lightningIntensity"), lightningIntensity);
      gl.uniform1f(this.getUniformLoc(this.meshProgram, "u_muzzleFlashIntensity"), muzzleFlashIntensity);
      gl.uniform1f(this.getUniformLoc(this.meshProgram, "u_time"), (Date.now() % 3600000) / 1000);

      // Active flashes
      const flashCount = activeFlashes ? Math.min(8, activeFlashes.length) : 0;
      gl.uniform1i(this.getUniformLoc(this.meshProgram, "u_activeFlashCount"), flashCount);
      if (flashCount > 0) {
        const flashArray = this.cachedFlashArray;
        let flashAttenuation = 0.25;
        if (flashlightActive) {
          let quality = 1.0;
          if (flashlightBatteryRatio !== undefined && flashlightBatteryRatio <= 0.5) {
            const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
            quality = factor * 0.5 + 0.5;
          }
          flashAttenuation = 1.0 - (0.75 * quality);
        }
        for (let i = 0; i < flashCount; i++) {
          const f = activeFlashes![i];
          flashArray[i * 3] = f.x;
          flashArray[i * 3 + 1] = f.y;
          flashArray[i * 3 + 2] = flashlightActive ? f.intensity * flashAttenuation : f.intensity;
        }
        gl.uniform3fv(this.getUniformLoc(this.meshProgram, "u_activeFlashes"), flashArray);
      }

      // Bind lighting, highlight and water textures
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTexture);
      gl.uniform1i(this.getUniformLoc(this.meshProgram, "u_lightTex"), 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.highlightTexture);
      gl.uniform1i(this.getUniformLoc(this.meshProgram, "u_highlightTex"), 2);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.waterTexture!);
      gl.uniform1i(this.getUniformLoc(this.meshProgram, "u_waterTex"), 3);

      // Upload sprite shadows for mesh rendering
      const shadowCount = Math.min(16, this.elevatedSpriteShadows.length);
      gl.uniform1i(this.getUniformLoc(this.meshProgram, "u_shadowCount"), shadowCount);
      if (shadowCount > 0) {
        const shadowArray = this.cachedShadowArray;
        for (let i = 0; i < shadowCount; i++) {
          const s = this.elevatedSpriteShadows[i];
          shadowArray[i * 4] = s.x;
          shadowArray[i * 4 + 1] = s.y;
          shadowArray[i * 4 + 2] = s.rx;
          shadowArray[i * 4 + 3] = s.ry;
        }
        gl.uniform4fv(this.getUniformLoc(this.meshProgram, "u_shadows"), shadowArray);
      }
      gl.uniform1i(this.getUniformLoc(this.meshProgram, "u_magentaShadows"), this.magentaShadowsEnabled ? 1 : 0);

      this.meshBatches.forEach((batch) => {
        if (batch.vertexCount === 0 || !batch.vertexBuffer) return;

        let tex: WebGLTexture | null = null;
        const texId = batch.textureId;
        const normId = texId.toLowerCase();

        if (texId === '__floor') {
          tex = this.floorMapTexture || this.getTexture('__floor', floorBuf);
        } else if (texId === '__ceil') {
          tex = this.ceilMapTexture || this.getTexture('__ceil', ceilBuf);
        } else if (auxBuffers && auxBuffers.has(texId)) {
          tex = this.getTexture(texId, auxBuffers.get(texId)!);
        } else if (auxBuffers && auxBuffers.has('TEX_' + texId)) {
          tex = this.getTexture(texId, auxBuffers.get('TEX_' + texId)!);
        } else if (auxBuffers && auxBuffers.has(normId)) {
          tex = this.getTexture(normId, auxBuffers.get(normId)!);
        } else if (auxBuffers && auxBuffers.has('TEX_' + normId)) {
          tex = this.getTexture(normId, auxBuffers.get('TEX_' + normId)!);
        } else if (customFloorBuffers && texId.startsWith('custom_floor_')) {
          const numericKey = parseInt(texId.substring(13), 10);
          const customBuf = customFloorBuffers.get(numericKey);
          tex = customBuf ? this.getTexture(texId, customBuf) : this.blankTexture;
        } else if (customWallBuffers && texId.startsWith('custom_wall_')) {
          const numericKey = parseInt(texId.substring(12), 10);
          const customBuf = customWallBuffers.get(numericKey);
          tex = customBuf ? this.getTexture(texId, customBuf) : this.blankTexture;
        } else if (auxBuffers && auxBuffers.has('TEX_FALLBACK')) {
          tex = this.getTexture('TEX_FALLBACK', auxBuffers.get('TEX_FALLBACK')!);
        } else if (wallBuf) {
          tex = this.getTexture('__wall', wallBuf);
        } else {
          tex = this.blankTexture;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(this.getUniformLoc(this.meshProgram!, "u_texture"), 0);

        const posAttr = this.getAttribLoc(this.meshProgram!, "a_position");
        const texAttr = this.getAttribLoc(this.meshProgram!, "a_texCoord");
        const lightAttr = this.getAttribLoc(this.meshProgram!, "a_lightCoord");
        const sideAttr = this.getAttribLoc(this.meshProgram!, "a_side");

        gl.enableVertexAttribArray(posAttr);
        gl.enableVertexAttribArray(texAttr);
        gl.enableVertexAttribArray(lightAttr);
        gl.enableVertexAttribArray(sideAttr);

        gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertexBuffer);

        // Stride: 8 floats * 4 bytes = 32 bytes
        gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 32, 0);
        gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 32, 12);
        gl.vertexAttribPointer(lightAttr, 2, gl.FLOAT, false, 32, 20);
        gl.vertexAttribPointer(sideAttr, 1, gl.FLOAT, false, 32, 28);

        gl.drawArrays(gl.TRIANGLES, 0, batch.vertexCount);
      });
    }

      // ------------------ PASS 2: WALLS & COLUMNS ------------------
    if (this.wallProgram && wallQuads.length > 0) {
      gl.useProgram(this.wallProgram);

      gl.uniform3f(this.getUniformLoc(this.wallProgram, "u_fogColor"), fogColorVec[0], fogColorVec[1], fogColorVec[2]);
      gl.uniform1f(this.getUniformLoc(this.wallProgram, "u_height"), height);

      const posAttr = this.getAttribLoc(this.wallProgram, "position");
      const texAttr = this.getAttribLoc(this.wallProgram, "texCoord");
      const colAttr = this.getAttribLoc(this.wallProgram, "color");
      const maskAttr = this.getAttribLoc(this.wallProgram, "a_maskTopBottom");

      gl.enableVertexAttribArray(posAttr);
      gl.enableVertexAttribArray(texAttr);
      gl.enableVertexAttribArray(colAttr);
      if (maskAttr !== -1) {
        gl.enableVertexAttribArray(maskAttr);
      }

      // 1. Split wallQuads into real-world and mirror reflection virtual quads
      const realQuads = this.realQuadsPool;
      const refQuads = this.refQuadsPool;
      realQuads.length = 0;
      refQuads.length = 0;

      for (let i = 0; i < wallQuads.length; i++) {
        const q = wallQuads[i];
        if (q.maskTop !== undefined) {
          refQuads.push(q);
        } else {
          realQuads.push(q);
        }
      }

      // Reusable render function to batch draw a list of quads grouped by texture (un-ordered, best for real walls)
      const renderQuadList = (quadsList: QuadData[]) => {
        if (quadsList.length === 0) return;

        // Group quads by texture to minimize texture bindings on GPU (Batch Rendering)
        this.wallTextureGroups.forEach((arr) => { arr.length = 0; });
        let activeQuadsCount = 0;

        for (let i = 0; i < quadsList.length; i++) {
          const quad = quadsList[i];
          
          // 1. Skip zero-width or degenerate quads
          if (quad.x0 >= quad.x1) continue;
          
          // 2. Frustum culling: Skip completely off-screen quads (horizontally)
          if (quad.x1 < 0 || quad.x0 > width) continue;
          
          // 3. Fog culling: if fully fogged, skip drawing
          if (quad.fog >= 0.999) continue;
          
          let group = this.wallTextureGroups.get(quad.textureId);
          if (!group) {
            group = [];
            this.wallTextureGroups.set(quad.textureId, group);
          }
          group.push(quad);
          activeQuadsCount++;
        }

        if (activeQuadsCount === 0) return;

        // Allocate vertex array size
        const neededSize = activeQuadsCount * 6 * 10;
        const vertexDataArray = this.getWallVertexArray(neededSize);

        this.wallTextureGroups.forEach((quads, texId) => {
          if (quads.length === 0) return;
          let index = 0;
          for (let qIdx = 0; qIdx < quads.length; qIdx++) {
            const q = quads[qIdx];
            
            // Добавляем микро-оверлап в 0.8 пикселей для полного закрытия субпиксельных зазоров на стыках
            const y0_padded = q.y0 - 0.8;
            const y1_padded = q.y1 + 0.8;

            const nx0 = (q.x0 / width) * 2.0 - 1.0;
            const nx1 = (q.x1 / width) * 2.0 - 1.0;
            const ny0 = (1.0 - (y0_padded / height)) * 2.0 - 1.0;
            const ny1 = (1.0 - (y1_padded / height)) * 2.0 - 1.0;

            const mTop = q.maskTop !== undefined ? q.maskTop : -1.0;
            const mBottom = q.maskBottom !== undefined ? q.maskBottom : 9999.0;

            let tu00 = q.u0;
            let tv00 = q.v0;
            let tu10 = q.u1;
            let tv10 = q.v0;
            let tu01 = q.u0;
            let tv01 = q.v1;
            let tu11 = q.u1;
            let tv11 = q.v1;

            if (q.isBottomCap) {
              tu00 = q.u0;
              tv00 = q.v0;
              tu10 = q.u0;
              tv10 = q.v0;
              tu01 = q.u1;
              tv01 = q.v1;
              tu11 = q.u1;
              tv11 = q.v1;
            }

            // Triangle 1
            vertexDataArray[index++] = nx0;
            vertexDataArray[index++] = ny0;
            vertexDataArray[index++] = tu00;
            vertexDataArray[index++] = tv00;
            vertexDataArray[index++] = q.r;
            vertexDataArray[index++] = q.g;
            vertexDataArray[index++] = q.b;
            vertexDataArray[index++] = q.fog;
            vertexDataArray[index++] = mTop;
            vertexDataArray[index++] = mBottom;

            vertexDataArray[index++] = nx1;
            vertexDataArray[index++] = ny0;
            vertexDataArray[index++] = tu10;
            vertexDataArray[index++] = tv10;
            vertexDataArray[index++] = q.r;
            vertexDataArray[index++] = q.g;
            vertexDataArray[index++] = q.b;
            vertexDataArray[index++] = q.fog;
            vertexDataArray[index++] = mTop;
            vertexDataArray[index++] = mBottom;

            vertexDataArray[index++] = nx0;
            vertexDataArray[index++] = ny1;
            vertexDataArray[index++] = tu01;
            vertexDataArray[index++] = tv01;
            vertexDataArray[index++] = q.r;
            vertexDataArray[index++] = q.g;
            vertexDataArray[index++] = q.b;
            vertexDataArray[index++] = q.fog;
            vertexDataArray[index++] = mTop;
            vertexDataArray[index++] = mBottom;

            // Triangle 2
            vertexDataArray[index++] = nx0;
            vertexDataArray[index++] = ny1;
            vertexDataArray[index++] = tu01;
            vertexDataArray[index++] = tv01;
            vertexDataArray[index++] = q.r;
            vertexDataArray[index++] = q.g;
            vertexDataArray[index++] = q.b;
            vertexDataArray[index++] = q.fog;
            vertexDataArray[index++] = mTop;
            vertexDataArray[index++] = mBottom;

            vertexDataArray[index++] = nx1;
            vertexDataArray[index++] = ny0;
            vertexDataArray[index++] = tu10;
            vertexDataArray[index++] = tv10;
            vertexDataArray[index++] = q.r;
            vertexDataArray[index++] = q.g;
            vertexDataArray[index++] = q.b;
            vertexDataArray[index++] = q.fog;
            vertexDataArray[index++] = mTop;
            vertexDataArray[index++] = mBottom;

            vertexDataArray[index++] = nx1;
            vertexDataArray[index++] = ny1;
            vertexDataArray[index++] = tu11;
            vertexDataArray[index++] = tv11;
            vertexDataArray[index++] = q.r;
            vertexDataArray[index++] = q.g;
            vertexDataArray[index++] = q.b;
            vertexDataArray[index++] = q.fog;
            vertexDataArray[index++] = mTop;
            vertexDataArray[index++] = mBottom;
          }

          // Bind corresponding wall texture
          let tex: WebGLTexture | null = null;
          const normId = texId.toLowerCase();
          if (auxBuffers && auxBuffers.has(texId)) {
            tex = this.getTexture(texId, auxBuffers.get(texId)!);
          } else if (auxBuffers && auxBuffers.has('TEX_' + texId)) {
            tex = this.getTexture(texId, auxBuffers.get('TEX_' + texId)!);
          } else if (auxBuffers && auxBuffers.has(normId)) {
            tex = this.getTexture(normId, auxBuffers.get(normId)!);
          } else if (auxBuffers && auxBuffers.has('TEX_' + normId)) {
            tex = this.getTexture(normId, auxBuffers.get('TEX_' + normId)!);
          } else if (customWallBuffers && texId.startsWith('custom_wall_')) {
            const numericKey = parseInt(texId.substring(12), 10);
            const customBuf = customWallBuffers.get(numericKey);
            if (customBuf) {
              tex = this.getTexture(texId, customBuf);
            } else {
              tex = this.blankTexture;
            }
          } else if (auxBuffers && auxBuffers.has('TEX_FALLBACK')) {
            tex = this.getTexture('TEX_FALLBACK', auxBuffers.get('TEX_FALLBACK')!);
          } else if (auxBuffers && auxBuffers.has('fallback')) {
            tex = this.getTexture('fallback', auxBuffers.get('fallback')!);
          } else if (wallBuf && (normId === 'wall' || texId === (wallBuf as any).id)) {
            tex = this.getTexture('__wall', wallBuf);
          } else if (doorBuf && (normId === 'door' || texId === (doorBuf as any).id)) {
            tex = this.getTexture('__door', doorBuf);
          } else {
            tex = this.blankTexture;
          }

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(this.getUniformLoc(this.wallProgram!, "u_wallTex"), 0);

          // Upload and draw the quads of this texture
          gl.bindBuffer(gl.ARRAY_BUFFER, this.wallVertexBuffer);
          const wallSubArray = vertexDataArray.subarray(0, index);
          if (this.wallVertexBufferCapacity < wallSubArray.byteLength) {
            gl.bufferData(gl.ARRAY_BUFFER, Math.max(this.wallVertexBufferCapacity * 2, wallSubArray.byteLength), gl.DYNAMIC_DRAW);
            this.wallVertexBufferCapacity = Math.max(this.wallVertexBufferCapacity * 2, wallSubArray.byteLength);
          }
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, wallSubArray);

          gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 40, 0);
          gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 40, 8);
          gl.vertexAttribPointer(colAttr, 4, gl.FLOAT, false, 40, 16);
          if (maskAttr !== -1) {
            gl.vertexAttribPointer(maskAttr, 2, gl.FLOAT, false, 40, 32);
          }

          gl.drawArrays(gl.TRIANGLES, 0, quads.length * 6);
        });
      };

      // Sequential state-tracking batch renderer for sorted mirror reflections (strict Painter's Algorithm order)
      const renderSortedQuadList = (quadsList: QuadData[]) => {
        if (quadsList.length === 0) return;

        // 1. Sort virtual mirror reflection quads from back to front (Painter's Algorithm)
        quadsList.sort((a, b) => b.dist - a.dist);

        // 2. Filter out degenerate, offscreen, and fully fogged quads
        const activeQuads: QuadData[] = [];
        for (let i = 0; i < quadsList.length; i++) {
          const q = quadsList[i];
          if (q.x0 >= q.x1) continue;
          if (q.x1 < 0 || q.x0 > width) continue;
          if (q.fog >= 0.999) continue;
          activeQuads.push(q);
        }

        if (activeQuads.length === 0) return;

        // 3. Fill the vertex array for all active quads in their exact sorted order
        const neededSize = activeQuads.length * 6 * 10;
        const vertexDataArray = this.getWallVertexArray(neededSize);
        let index = 0;

        for (let i = 0; i < activeQuads.length; i++) {
          const q = activeQuads[i];
          const y0_padded = q.y0 - 0.8;
          const y1_padded = q.y1 + 0.8;

          const nx0 = (q.x0 / width) * 2.0 - 1.0;
          const nx1 = (q.x1 / width) * 2.0 - 1.0;
          const ny0 = (1.0 - (y0_padded / height)) * 2.0 - 1.0;
          const ny1 = (1.0 - (y1_padded / height)) * 2.0 - 1.0;

          const mTop = q.maskTop !== undefined ? q.maskTop : -1.0;
          const mBottom = q.maskBottom !== undefined ? q.maskBottom : 9999.0;

          let tu00 = q.u0;
          let tv00 = q.v0;
          let tu10 = q.u1;
          let tv10 = q.v0;
          let tu01 = q.u0;
          let tv01 = q.v1;
          let tu11 = q.u1;
          let tv11 = q.v1;

          if (q.isBottomCap) {
            tu00 = q.u0;
            tv00 = q.v0;
            tu10 = q.u0;
            tv10 = q.v0;
            tu01 = q.u1;
            tv01 = q.v1;
            tu11 = q.u1;
            tv11 = q.v1;
          }

          const r0 = q.r0 !== undefined ? q.r0 : q.r;
          const g0 = q.g0 !== undefined ? q.g0 : q.g;
          const b0 = q.b0 !== undefined ? q.b0 : q.b;
          const fog0 = q.fog0 !== undefined ? q.fog0 : q.fog;

          const r1 = q.r1 !== undefined ? q.r1 : q.r;
          const g1 = q.g1 !== undefined ? q.g1 : q.g;
          const b1 = q.b1 !== undefined ? q.b1 : q.b;
          const fog1 = q.fog1 !== undefined ? q.fog1 : q.fog;

          // Triangle 1
          vertexDataArray[index++] = nx0;
          vertexDataArray[index++] = ny0;
          vertexDataArray[index++] = tu00;
          vertexDataArray[index++] = tv00;
          vertexDataArray[index++] = r0;
          vertexDataArray[index++] = g0;
          vertexDataArray[index++] = b0;
          vertexDataArray[index++] = fog0;
          vertexDataArray[index++] = mTop;
          vertexDataArray[index++] = mBottom;

          vertexDataArray[index++] = nx1;
          vertexDataArray[index++] = ny0;
          vertexDataArray[index++] = tu10;
          vertexDataArray[index++] = tv10;
          vertexDataArray[index++] = r0;
          vertexDataArray[index++] = g0;
          vertexDataArray[index++] = b0;
          vertexDataArray[index++] = fog0;
          vertexDataArray[index++] = mTop;
          vertexDataArray[index++] = mBottom;

          vertexDataArray[index++] = nx0;
          vertexDataArray[index++] = ny1;
          vertexDataArray[index++] = tu01;
          vertexDataArray[index++] = tv01;
          vertexDataArray[index++] = r1;
          vertexDataArray[index++] = g1;
          vertexDataArray[index++] = b1;
          vertexDataArray[index++] = fog1;
          vertexDataArray[index++] = mTop;
          vertexDataArray[index++] = mBottom;

          // Triangle 2
          vertexDataArray[index++] = nx0;
          vertexDataArray[index++] = ny1;
          vertexDataArray[index++] = tu01;
          vertexDataArray[index++] = tv01;
          vertexDataArray[index++] = r1;
          vertexDataArray[index++] = g1;
          vertexDataArray[index++] = b1;
          vertexDataArray[index++] = fog1;
          vertexDataArray[index++] = mTop;
          vertexDataArray[index++] = mBottom;

          vertexDataArray[index++] = nx1;
          vertexDataArray[index++] = ny0;
          vertexDataArray[index++] = tu10;
          vertexDataArray[index++] = tv10;
          vertexDataArray[index++] = r0;
          vertexDataArray[index++] = g0;
          vertexDataArray[index++] = b0;
          vertexDataArray[index++] = fog0;
          vertexDataArray[index++] = mTop;
          vertexDataArray[index++] = mBottom;

          vertexDataArray[index++] = nx1;
          vertexDataArray[index++] = ny1;
          vertexDataArray[index++] = tu11;
          vertexDataArray[index++] = tv11;
          vertexDataArray[index++] = r1;
          vertexDataArray[index++] = g1;
          vertexDataArray[index++] = b1;
          vertexDataArray[index++] = fog1;
          vertexDataArray[index++] = mTop;
          vertexDataArray[index++] = mBottom;
        }

        // 4. Upload ALL vertices to GPU at once
        gl.bindBuffer(gl.ARRAY_BUFFER, this.wallVertexBuffer);
        const wallSubArray = vertexDataArray.subarray(0, index);
        if (this.wallVertexBufferCapacity < wallSubArray.byteLength) {
          gl.bufferData(gl.ARRAY_BUFFER, Math.max(this.wallVertexBufferCapacity * 2, wallSubArray.byteLength), gl.DYNAMIC_DRAW);
          this.wallVertexBufferCapacity = Math.max(this.wallVertexBufferCapacity * 2, wallSubArray.byteLength);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, wallSubArray);

        // 5. Draw ranges by scanning the active quads and drawing sequentially (State-Tracking Sequential Batching)
        let batchStartIdx = 0;
        let currentTexId = activeQuads[0].textureId;

        const drawBatchRange = (start: number, end: number, texId: string) => {
          const count = end - start;
          if (count === 0) return;

          // Bind corresponding wall texture
          let tex: WebGLTexture | null = null;
          const normId = texId.toLowerCase();
          if (auxBuffers && auxBuffers.has(texId)) {
            tex = this.getTexture(texId, auxBuffers.get(texId)!);
          } else if (auxBuffers && auxBuffers.has('TEX_' + texId)) {
            tex = this.getTexture(texId, auxBuffers.get('TEX_' + texId)!);
          } else if (auxBuffers && auxBuffers.has(normId)) {
            tex = this.getTexture(normId, auxBuffers.get(normId)!);
          } else if (auxBuffers && auxBuffers.has('TEX_' + normId)) {
            tex = this.getTexture(normId, auxBuffers.get('TEX_' + normId)!);
          } else if (customWallBuffers && texId.startsWith('custom_wall_')) {
            const numericKey = parseInt(texId.substring(12), 10);
            const customBuf = customWallBuffers.get(numericKey);
            if (customBuf) {
              tex = this.getTexture(texId, customBuf);
            } else {
              tex = this.blankTexture;
            }
          } else if (auxBuffers && auxBuffers.has('TEX_FALLBACK')) {
            tex = this.getTexture('TEX_FALLBACK', auxBuffers.get('TEX_FALLBACK')!);
          } else if (auxBuffers && auxBuffers.has('fallback')) {
            tex = this.getTexture('fallback', auxBuffers.get('fallback')!);
          } else if (wallBuf && (normId === 'wall' || texId === (wallBuf as any).id)) {
            tex = this.getTexture('__wall', wallBuf);
          } else if (doorBuf && (normId === 'door' || texId === (doorBuf as any).id)) {
            tex = this.getTexture('__door', doorBuf);
          } else {
            tex = this.blankTexture;
          }

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(this.getUniformLoc(this.wallProgram!, "u_wallTex"), 0);

          // Configure attributes with the correct byte offset
          const byteOffset = start * 6 * 10 * 4;
          gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 40, byteOffset);
          gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 40, byteOffset + 8);
          gl.vertexAttribPointer(colAttr, 4, gl.FLOAT, false, 40, byteOffset + 16);
          if (maskAttr !== -1) {
            gl.vertexAttribPointer(maskAttr, 2, gl.FLOAT, false, 40, byteOffset + 32);
          }

          gl.drawArrays(gl.TRIANGLES, 0, count * 6);
        };

        for (let i = 0; i < activeQuads.length; i++) {
          if (activeQuads[i].textureId !== currentTexId) {
            drawBatchRange(batchStartIdx, i, currentTexId);
            batchStartIdx = i;
            currentTexId = activeQuads[i].textureId;
          }
        }
        drawBatchRange(batchStartIdx, activeQuads.length, currentTexId);
      };

      // Draw reflected virtual world walls FIRST in strict depth sorted order to prevent see-through geometry
      renderSortedQuadList(refQuads);

      // Draw real-world walls and physical frames SECOND (grouped by texture, maximum speed)
      renderQuadList(realQuads);
    }

    // ------------------ PASS 2b: 3D POLYOBJECTS ------------------
    if (this.polyProgram && polyObjects && polyObjects.length > 0) {
      if (zBuffer) {
        this.updateZBufferTexture(zBuffer, width);
      }
      this.updateMirrorMaskTexture(mirrorReflections, width, height);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.depthFunc(gl.LEQUAL);

      gl.useProgram(this.polyProgram);

      gl.uniform2f(this.getUniformLoc(this.polyProgram, "u_playerPos"), playerX, playerY);
      gl.uniform1f(this.getUniformLoc(this.polyProgram, "u_cameraZ"), cameraZ);
      gl.uniform2f(this.getUniformLoc(this.polyProgram, "u_dir"), dirX, dirY);
      gl.uniform2f(this.getUniformLoc(this.polyProgram, "u_plane"), planeX, planeY);
      gl.uniform1f(this.getUniformLoc(this.polyProgram, "u_horizon"), horizon);
      gl.uniform2f(this.getUniformLoc(this.polyProgram, "u_resolution"), width, height);
      gl.uniform2f(this.getUniformLoc(this.polyProgram, "u_mapSize"), mapWidth, mapHeight);
      gl.uniform1f(this.getUniformLoc(this.polyProgram, "u_renderDistance"), getDisableDistanceShading() ? 999999.0 : renderDistance);
      gl.uniform1f(this.getUniformLoc(this.polyProgram, "u_minBrightness"), getMinBrightness());
      gl.uniform3f(this.getUniformLoc(this.polyProgram, "u_fogColor"), fogColorVec[0], fogColorVec[1], fogColorVec[2]);
      gl.uniform1i(this.getUniformLoc(this.polyProgram, "u_isFog"), isFogWeather() ? 1 : 0);
      gl.uniform1f(this.getUniformLoc(this.polyProgram, "u_lightningIntensity"), lightningIntensity);
      gl.uniform1f(this.getUniformLoc(this.polyProgram, "u_muzzleFlashIntensity"), muzzleFlashIntensity);
      gl.uniform1f(this.getUniformLoc(this.polyProgram, "u_time"), (Date.now() % 3600000) / 1000);

      const flashCount = activeFlashes ? Math.min(8, activeFlashes.length) : 0;
      gl.uniform1i(this.getUniformLoc(this.polyProgram, "u_activeFlashCount"), flashCount);
      if (flashCount > 0) {
        const flashArray = this.cachedFlashArray;
        let flashAttenuation = 0.25;
        if (flashlightActive) {
          let quality = 1.0;
          if (flashlightBatteryRatio !== undefined && flashlightBatteryRatio <= 0.5) {
            const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
            quality = factor * 0.5 + 0.5;
          }
          flashAttenuation = 1.0 - (0.75 * quality);
        }
        for (let i = 0; i < flashCount; i++) {
          const f = activeFlashes![i];
          flashArray[i * 3] = f.x;
          flashArray[i * 3 + 1] = f.y;
          flashArray[i * 3 + 2] = flashlightActive ? f.intensity * flashAttenuation : f.intensity;
        }
        gl.uniform3fv(this.getUniformLoc(this.polyProgram, "u_activeFlashes"), flashArray);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTexture);
      gl.uniform1i(this.getUniformLoc(this.polyProgram, "u_lightTex"), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.highlightTexture);
      gl.uniform1i(this.getUniformLoc(this.polyProgram, "u_highlightTex"), 1);

      if (this.zBufferTexture) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.zBufferTexture);
        gl.uniform1i(this.getUniformLoc(this.polyProgram, "u_zBufferTex"), 2);
      }

      if (this.mirrorMaskTexture) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.mirrorMaskTexture);
        gl.uniform1i(this.getUniformLoc(this.polyProgram, "u_mirrorMaskTex"), 3);
      }

      const estimatedFloats = polyObjects.length * 720;
      if (this.polyFloatArray.length < estimatedFloats) {
        this.polyFloatArray = new Float32Array(estimatedFloats * 2);
      }

      const vertCount = buildPolyObjectVertexBuffer(
        polyObjects,
        playerX,
        playerY,
        cameraZ,
        this.polyFloatArray,
        dirX,
        dirY,
        planeX,
        planeY,
        this.polyBatches
      );

      if (vertCount > 0) {
        const posAttr = this.getAttribLoc(this.polyProgram, "a_position");
        const colAttr = this.getAttribLoc(this.polyProgram, "a_color");
        const lightAttr = this.getAttribLoc(this.polyProgram, "a_lightCoord");
        const sideAttr = this.getAttribLoc(this.polyProgram, "a_side");
        const texAttr = this.getAttribLoc(this.polyProgram, "a_texCoord");

        gl.enableVertexAttribArray(posAttr);
        gl.enableVertexAttribArray(colAttr);
        gl.enableVertexAttribArray(lightAttr);
        gl.enableVertexAttribArray(sideAttr);
        if (texAttr >= 0) gl.enableVertexAttribArray(texAttr);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.polyVertexBuffer);
        const polyByteSize = vertCount * 12 * 4;
        if (this.polyVertexBufferCapacity < polyByteSize) {
          gl.bufferData(gl.ARRAY_BUFFER, polyByteSize, gl.DYNAMIC_DRAW);
          this.polyVertexBufferCapacity = polyByteSize;
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.polyFloatArray.subarray(0, vertCount * 12));

        // Stride = 48 bytes (12 floats per vertex)
        gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 48, 0);
        gl.vertexAttribPointer(colAttr, 4, gl.FLOAT, false, 48, 12);
        gl.vertexAttribPointer(lightAttr, 2, gl.FLOAT, false, 48, 28);
        gl.vertexAttribPointer(sideAttr, 1, gl.FLOAT, false, 48, 36);
        if (texAttr >= 0) gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 48, 40);

        const uPolyTex = this.getUniformLoc(this.polyProgram, "u_polyTex");
        const uUseTexture = this.getUniformLoc(this.polyProgram, "u_useTexture");

        if (this.polyBatches.length > 0) {
          for (let b = 0; b < this.polyBatches.length; b++) {
            const batch = this.polyBatches[b];
            let hasTex = false;
            if (batch.textureId) {
              const img = getPolyTextureImage(batch.textureId);
              if (img) {
                const tex = this.getTexture('poly_' + batch.textureId, img);
                gl.activeTexture(gl.TEXTURE4);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.uniform1i(uPolyTex, 4);
                gl.uniform1i(uUseTexture, 1);
                hasTex = true;
              }
            }
            if (!hasTex) {
              gl.uniform1i(uUseTexture, 0);
            }
            gl.drawArrays(gl.TRIANGLES, batch.startVertex, batch.vertexCount);
          }
        } else {
          gl.uniform1i(uUseTexture, 0);
          gl.drawArrays(gl.TRIANGLES, 0, vertCount);
        }
        gl.disable(gl.DEPTH_TEST);
      }
    }
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  // Sprite shadows for floor projection
  private groundSpriteShadows: SpriteShadow[] = [];
  private elevatedSpriteShadows: SpriteShadow[] = [];
  private magentaShadowsEnabled = false;

  public setSpriteShadows(groundShadows: SpriteShadow[], elevatedShadows: SpriteShadow[], magenta: boolean) {
    this.groundSpriteShadows = groundShadows;
    this.elevatedSpriteShadows = elevatedShadows;
    this.magentaShadowsEnabled = magenta;
  }

  private renderMirrorBackgroundsWebGL(
    width: number,
    height: number,
    mirrorReflections: MirrorReflection[][],
    ceilingType: 'INDOOR' | 'OUTDOOR',
    skyBuf: RaycasterBuffer | null,
    fov: number,
    auxBuffers: Map<string, RaycasterBuffer> | undefined,
    grid: any[][],
    lightMap: { r: number; g: number; b: number }[][],
    cameraZ: number,
    horizon: number,
    renderDistance: number,
    lightningIntensity: number,
    muzzleFlashIntensity: number,
    fogColorVec: [number, number, number],
    playerFloorHeight: number,
    activeFlashes?: { x: number; y: number; intensity: number; isFlashbang?: boolean }[],
    flashlightActive?: boolean,
    flashlightBatteryRatio?: number
  ) {
    if (!this.gl || !this.mirrorBgProgram || !mirrorReflections) return;
    const gl = this.gl;

    const mapHeight = grid ? grid.length : 1;
    const mapWidth = grid && grid[0] ? grid[0].length : 1;

    // Count columns with reflections and dynamically detect resolution divisor (minimum column step)
    let refColCount = 0;
    let detectedStep = 1;
    let lastRefX = -1;
    let minDiff = 9999;
    for (let x = 0; x < width; x++) {
      if (mirrorReflections[x] && mirrorReflections[x].length > 0) {
        refColCount++;
        if (lastRefX !== -1) {
          const diff = x - lastRefX;
          if (diff < minDiff && diff > 0) {
            minDiff = diff;
          }
        }
        lastRefX = x;
      }
    }
    if (minDiff !== 9999 && minDiff > 0) {
      detectedStep = minDiff;
    }
    if (refColCount === 0) return;

    gl.useProgram(this.mirrorBgProgram);

    // Bind uniforms matching background shader
    gl.uniform2f(this.getUniformLoc(this.mirrorBgProgram, "u_resolution"), width, height);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_cameraZ"), cameraZ);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_playerFloorHeight"), playerFloorHeight);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_horizon"), horizon);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_ceilingType"), ceilingType === 'INDOOR' ? 0 : 1);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_renderDistance"), getDisableDistanceShading() ? 999999.0 : renderDistance);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_minBrightness"), getMinBrightness());
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_fogStart"), getFogStart());
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_invFogRange"), getInvFogRange());
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_invRenderDistance"), getInvRenderDistance());
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_lightningIntensity"), lightningIntensity);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_muzzleFlashIntensity"), muzzleFlashIntensity);
    gl.uniform3f(this.getUniformLoc(this.mirrorBgProgram, "u_fogColor"), fogColorVec[0], fogColorVec[1], fogColorVec[2]);
    gl.uniform2f(this.getUniformLoc(this.mirrorBgProgram, "u_mapSize"), mapWidth, mapHeight);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_isFog"), isFogWeather() ? 1 : 0);

    // Active flashes
    const flashCount = activeFlashes ? Math.min(8, activeFlashes.length) : 0;
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_activeFlashCount"), flashCount);
    if (flashCount > 0) {
      const flashArray = this.cachedFlashArray;
      let flashAttenuation = 0.25;
      if (flashlightActive) {
        let quality = 1.0;
        if (flashlightBatteryRatio !== undefined && flashlightBatteryRatio <= 0.5) {
          const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
          quality = factor * 0.5 + 0.5;
        }
        flashAttenuation = 1.0 - (0.75 * quality);
      }
      for (let i = 0; i < flashCount; i++) {
        const f = activeFlashes![i];
        flashArray[i * 3] = f.x;
        flashArray[i * 3 + 1] = f.y;
        flashArray[i * 3 + 2] = flashlightActive ? f.intensity * flashAttenuation : f.intensity;
      }
      gl.uniform3fv(this.getUniformLoc(this.mirrorBgProgram, "u_activeFlashes"), flashArray);
    }

    let skyW = skyBuf ? skyBuf.width : 512;
    let skyH = skyBuf ? skyBuf.height : 256;
    if (!skyBuf && auxBuffers && auxBuffers.has('TEX_FALLBACK')) {
      const fb = auxBuffers.get('TEX_FALLBACK')!;
      skyW = fb.width;
      skyH = fb.height;
    }
    const focalLength = (width / 2) / fov;
    const pixelsPerRad = skyW / (2 * Math.PI);
    const skyVScale = pixelsPerRad / focalLength;

    gl.uniform2f(this.getUniformLoc(this.mirrorBgProgram, "u_skySize"), skyW, skyH);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_skyVScale"), skyVScale);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_skyIsFallback"), skyBuf ? 0 : 1);
    gl.uniform1f(this.getUniformLoc(this.mirrorBgProgram, "u_time"), (Date.now() % 3600000) / 1000);

    // Upload sprite shadows
    const mirrorShadowCount = Math.min(16, this.groundSpriteShadows.length);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_shadowCount"), mirrorShadowCount);
    if (mirrorShadowCount > 0) {
      const shadowArray = this.cachedShadowArray;
      for (let i = 0; i < mirrorShadowCount; i++) {
        const s = this.groundSpriteShadows[i];
        shadowArray[i * 4] = s.x;
        shadowArray[i * 4 + 1] = s.y;
        shadowArray[i * 4 + 2] = s.rx;
        shadowArray[i * 4 + 3] = s.ry;
      }
      gl.uniform4fv(this.getUniformLoc(this.mirrorBgProgram, "u_shadows"), shadowArray);
    }
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_magentaShadows"), this.magentaShadowsEnabled ? 1 : 0);

    // Bind texture samplers
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.floorMapTexture || this.blankTexture!);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_floorTex"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.ceilMapTexture || this.blankTexture!);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_ceilTex"), 1);

    const skyTex = this.getTexture('__sky', skyBuf || (auxBuffers ? auxBuffers.get('TEX_FALLBACK') : null));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_skyTex"), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTexture!);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_lightTex"), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.highlightTexture || this.blankTexture!);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_highlightTex"), 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.waterTexture || this.blankTexture!);
    gl.uniform1i(this.getUniformLoc(this.mirrorBgProgram, "u_waterTex"), 5);

    // Pack vertices using persistent pre-allocated vertex array to eliminate GC pressure and allocation lag
    const neededSize = refColCount * 6 * 12;
    const vertexData = this.getMirrorBgVertexArray(neededSize);
    let idx = 0;

    for (let x = 0; x < width; x++) {
      const colRef = mirrorReflections[x]?.[0];
      if (!colRef) continue;

      // Draw bounds of this mirror strip with a tiny horizontal overlap to prevent vertical lines
      const x0 = (x / width) * 2.0 - 1.0;
      const x1 = ((x + detectedStep + 0.1) / width) * 2.0 - 1.0;
      const y0 = (1.0 - (colRef.drawEnd / height)) * 2.0 - 1.0;
      const y1 = (1.0 - (colRef.drawStart / height)) * 2.0 - 1.0;

      const px = colRef.mirrorHitX;
      const py = colRef.mirrorHitY;
      const dx = colRef.refRayDirX;
      const dy = colRef.refRayDirY;
      const mt = colRef.maskTop;
      const mb = colRef.maskBottom;
      const pwd = colRef.perpWallDist;
      
      const rM = colRef.rMult !== undefined ? colRef.rMult : 1.0;
      const gM = colRef.gMult !== undefined ? colRef.gMult : 1.0;
      const bM = colRef.bMult !== undefined ? colRef.bMult : 1.0;

      // Triangle 1 - Vertex 1
      vertexData[idx++] = x0;
      vertexData[idx++] = y0;
      vertexData[idx++] = px;
      vertexData[idx++] = py;
      vertexData[idx++] = dx;
      vertexData[idx++] = dy;
      vertexData[idx++] = mt;
      vertexData[idx++] = mb;
      vertexData[idx++] = pwd;
      vertexData[idx++] = rM;
      vertexData[idx++] = gM;
      vertexData[idx++] = bM;

      // Triangle 1 - Vertex 2
      vertexData[idx++] = x1;
      vertexData[idx++] = y0;
      vertexData[idx++] = px;
      vertexData[idx++] = py;
      vertexData[idx++] = dx;
      vertexData[idx++] = dy;
      vertexData[idx++] = mt;
      vertexData[idx++] = mb;
      vertexData[idx++] = pwd;
      vertexData[idx++] = rM;
      vertexData[idx++] = gM;
      vertexData[idx++] = bM;

      // Triangle 1 - Vertex 3
      vertexData[idx++] = x0;
      vertexData[idx++] = y1;
      vertexData[idx++] = px;
      vertexData[idx++] = py;
      vertexData[idx++] = dx;
      vertexData[idx++] = dy;
      vertexData[idx++] = mt;
      vertexData[idx++] = mb;
      vertexData[idx++] = pwd;
      vertexData[idx++] = rM;
      vertexData[idx++] = gM;
      vertexData[idx++] = bM;

      // Triangle 2 - Vertex 1
      vertexData[idx++] = x0;
      vertexData[idx++] = y1;
      vertexData[idx++] = px;
      vertexData[idx++] = py;
      vertexData[idx++] = dx;
      vertexData[idx++] = dy;
      vertexData[idx++] = mt;
      vertexData[idx++] = mb;
      vertexData[idx++] = pwd;
      vertexData[idx++] = rM;
      vertexData[idx++] = gM;
      vertexData[idx++] = bM;

      // Triangle 2 - Vertex 2
      vertexData[idx++] = x1;
      vertexData[idx++] = y0;
      vertexData[idx++] = px;
      vertexData[idx++] = py;
      vertexData[idx++] = dx;
      vertexData[idx++] = dy;
      vertexData[idx++] = mt;
      vertexData[idx++] = mb;
      vertexData[idx++] = pwd;
      vertexData[idx++] = rM;
      vertexData[idx++] = gM;
      vertexData[idx++] = bM;

      // Triangle 2 - Vertex 3
      vertexData[idx++] = x1;
      vertexData[idx++] = y1;
      vertexData[idx++] = px;
      vertexData[idx++] = py;
      vertexData[idx++] = dx;
      vertexData[idx++] = dy;
      vertexData[idx++] = mt;
      vertexData[idx++] = mb;
      vertexData[idx++] = pwd;
      vertexData[idx++] = rM;
      vertexData[idx++] = gM;
      vertexData[idx++] = bM;
    }

    if (!this.mirrorBgVertexBuffer) {
      this.mirrorBgVertexBuffer = gl.createBuffer();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mirrorBgVertexBuffer);
    const mirrorBgSubArray = vertexData.subarray(0, idx);
    if (this.mirrorBgVertexBufferCapacity < mirrorBgSubArray.byteLength) {
      gl.bufferData(gl.ARRAY_BUFFER, Math.max(this.mirrorBgVertexBufferCapacity * 2, mirrorBgSubArray.byteLength), gl.DYNAMIC_DRAW);
      this.mirrorBgVertexBufferCapacity = Math.max(this.mirrorBgVertexBufferCapacity * 2, mirrorBgSubArray.byteLength);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mirrorBgSubArray);

    const posAttr = this.getAttribLoc(this.mirrorBgProgram, "position");
    const pPosAttr = this.getAttribLoc(this.mirrorBgProgram, "a_playerPos");
    const dirAttr = this.getAttribLoc(this.mirrorBgProgram, "a_dir");
    const maskAttr = this.getAttribLoc(this.mirrorBgProgram, "a_maskTopBottom");
    const pwdAttr = this.getAttribLoc(this.mirrorBgProgram, "a_perpWallDist");
    const mlAttr = this.getAttribLoc(this.mirrorBgProgram, "a_mirrorLight");

    gl.enableVertexAttribArray(posAttr);
    gl.enableVertexAttribArray(pPosAttr);
    gl.enableVertexAttribArray(dirAttr);
    gl.enableVertexAttribArray(maskAttr);
    if (pwdAttr !== -1) {
      gl.enableVertexAttribArray(pwdAttr);
    }
    if (mlAttr !== -1) {
      gl.enableVertexAttribArray(mlAttr);
    }

    const stride = 48; // 12 floats * 4 bytes
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(pPosAttr, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribPointer(dirAttr, 2, gl.FLOAT, false, stride, 16);
    gl.vertexAttribPointer(maskAttr, 2, gl.FLOAT, false, stride, 24);
    if (pwdAttr !== -1) {
      gl.vertexAttribPointer(pwdAttr, 1, gl.FLOAT, false, stride, 32);
    }
    if (mlAttr !== -1) {
      gl.vertexAttribPointer(mlAttr, 3, gl.FLOAT, false, stride, 36);
    }

    gl.drawArrays(gl.TRIANGLES, 0, refColCount * 6);
  }

  public renderParticlesWebGL(
    width: number,
    height: number,
    particlesToDraw: any[],
    sprites: Map<string, HTMLImageElement> | undefined,
    auxBuffers: Map<string, any> | undefined,
    lightMap?: { r: number, g: number, b: number }[][],
    lightningIntensity?: number,
    playerAngle?: number,
    lightningMap?: Float32Array | null,
    outdoorMap?: boolean[][],
    ceilingType?: string
  ) {
    if (!this.gl || !this.particleProgram) return;
    const gl = this.gl;

    gl.viewport(0, 0, width, height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.particleProgram);
    gl.uniform2f(this.getUniformLoc(this.particleProgram, "u_resolution"), width, height);

    const posAttr = this.getAttribLoc(this.particleProgram, "a_position");
    const texAttr = this.getAttribLoc(this.particleProgram, "a_texCoord");
    const colAttr = this.getAttribLoc(this.particleProgram, "a_color");

    gl.enableVertexAttribArray(posAttr);
    gl.enableVertexAttribArray(texAttr);
    gl.enableVertexAttribArray(colAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);

    const flatParticles: any[] = [];
    const smokeParticles: any[] = [];
    const texturedGroups = new Map<string, any[]>();

    for (let i = 0; i < particlesToDraw.length; i++) {
      const p = particlesToDraw[i];
      if (p.type === 'shard' || p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib' || p.type === 'casing') {
        let key = p.textureId || 'TEX_FALLBACK';
        if (p.preRenderedCanvas && p.preRenderedCanvas.version) {
          key = p.preRenderedCanvas.version;
        }
        if (!texturedGroups.has(key)) {
          texturedGroups.set(key, []);
        }
        texturedGroups.get(key)!.push(p);
      } else if (p.type === 'smoke' || p.type === 'fire' || p.type === 'generic') {
        if (p.spriteId && sprites && (sprites.has(p.spriteId) || sprites.has(`TEX_${p.spriteId}`))) {
          const key = p.spriteId;
          if (!texturedGroups.has(key)) {
            texturedGroups.set(key, []);
          }
          texturedGroups.get(key)!.push(p);
        } else {
          smokeParticles.push(p);
        }
      } else {
        flatParticles.push(p);
      }
    }

    const drawBatch = (batch: any[], renderType: number, textureToBind?: WebGLTexture) => {
      if (batch.length === 0) return;

      // Pre-calculate total vertices needed to avoid any reallocation
      let totalVertices = 0;
      for (let i = 0; i < batch.length; i++) {
        const p = batch[i];
        const hasPoints = p.points && p.points.length >= 3 && !p.preRenderedCanvas;
        const trisPerLayer = hasPoints ? p.points.length - 2 : 2;
        let layers = 1;
        if ((p.type === 'gib' || p.type === 'deco_gib') && p.landed) {
          const thickness = Math.max(1, Math.min(4, Math.floor(6 / p.dist)));
          layers = thickness + 1;
        }
        totalVertices += layers * trisPerLayer * 3;
      }

      const neededSize = totalVertices * 8;
      const vertexData = this.getParticleVertexArray(neededSize);
      let offset = 0;

      for (let i = 0; i < batch.length; i++) {
        const p = batch[i];
        
        const drawX = Math.floor(p.x);
        const drawY = Math.floor(p.y);

        let tileR = 1.0;
        let tileG = 1.0;
        let tileB = 1.0;
        let sprBrightness = 1.0;

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

        if (lightningIntensity && lightningIntensity > 0) {
          const tx = Math.floor(p.worldX);
          const ty = Math.floor(p.worldY);
          const mapHeight = lightMap ? lightMap.length : 1;
          const mapWidth = lightMap && lightMap[0] ? lightMap[0].length : 1;
          
          let lightningMult = 0.0;
          if (lightningMap) {
            if (ty >= 0 && ty < mapHeight && tx >= 0 && tx < mapWidth) {
              lightningMult = lightningMap[ty * mapWidth + tx];
            }
          } else {
            const isOutdoor = outdoorMap && ty >= 0 && ty < mapHeight && tx >= 0 && tx < mapWidth ? outdoorMap[ty][tx] : (ceilingType === 'OUTDOOR');
            lightningMult = isOutdoor ? 1.0 : 0.0;
          }
          
          const effectiveLight = lightningIntensity * lightningMult;
          if (effectiveLight > 0) {
            tileR = Math.min(1.0, tileR + effectiveLight * 0.5);
            tileG = Math.min(1.0, tileG + effectiveLight * 0.55);
            tileB = Math.min(1.0, tileB + effectiveLight * 0.7);
          }
        }

        let r = tileR;
        let g = tileG;
        let b = tileB;
        let a = p.life;

        if (p.color) {
          const parsed = parseColor(p.color);
          r = parsed.r * tileR;
          g = parsed.g * tileG;
          b = parsed.b * tileB;
        }

        if (p.type === 'casing') {
          a = 1.0;
        } else if (p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib') {
          a = Math.min(1.0, p.life);
        } else if (p.type === 'shard') {
          a = Math.min(0.3, p.life);
        } else {
          a = Math.max(0.0, p.life);
        }

        const baseHeight = height / Math.max(0.05, p.dist);
        let sizeW = 2.0;
        let sizeH = 2.0;

        if (p.type === 'fly') {
          sizeW = p.size;
          sizeH = p.size;
        } else if (p.type === 'rain') {
          sizeH = Math.max(1.5, p.size * (baseHeight * 0.05));
          sizeW = Math.max(0.5, (p.size / 4) * (baseHeight * 0.005));
        } else if (p.type === 'splash') {
          sizeW = Math.max(0.5, p.size * (baseHeight * 0.005));
          sizeH = sizeW;
        } else if (p.type === 'smoke' || p.type === 'fire') {
          sizeW = Math.max(1.0, p.size * baseHeight * 0.2);
          sizeH = sizeW;
        } else if (p.type === 'gib' || p.type === 'deco_gib') {
          let imgWidth = 64;
          let imgHeight = 64;
          const key = p.textureId;
          if (sprites && key) {
            const sImg = sprites.get(key) || sprites.get(`TEX_${key}`);
            if (sImg) {
              imgWidth = sImg.width;
              imgHeight = sImg.height;
            }
          }
          const spriteHeight = baseHeight * p.size;
          const spriteAspectRatio = imgHeight > 0 ? (imgWidth / imgHeight) : 1.0;
          const spriteWidth = spriteHeight * spriteAspectRatio;
          
          sizeW = spriteWidth * (p.uvRect ? p.uvRect.w : 1.0);
          sizeH = spriteHeight * (p.uvRect ? p.uvRect.h : 1.0);
        } else if (p.type === 'shard') {
          const baseSize = p.size * baseHeight * 2;
          sizeW = baseSize;
          sizeH = baseSize;
        } else if (p.type === 'brick') {
          const baseSize = p.size * baseHeight;
          sizeW = baseSize * 2;
          sizeH = baseSize;
        } else if (p.type === 'casing') {
          let imgWidth = 64;
          let imgHeight = 64;
          const key = p.textureId;
          if (sprites && key) {
            const sImg = sprites.get(key) || sprites.get(`TEX_${key}`);
            if (sImg) {
              imgWidth = sImg.width;
              imgHeight = sImg.height;
            }
          }
          const groundScale = p.landed ? (p.casingGroundScaleMultiplier ?? 0.10) : 1.0;
          const effectiveSize = p.landed ? ((p.size / 0.05) * groundScale) : p.size;
          const spriteHeight = baseHeight * effectiveSize;
          const spriteAspectRatio = imgHeight > 0 ? (imgWidth / imgHeight) : 1.0;
          const spriteWidth = spriteHeight * spriteAspectRatio;
          
          sizeW = spriteWidth;
          sizeH = spriteHeight;
        } else {
          const relativeMultiplier = p.type === 'blood' ? 0.015 : 0.06;
          sizeW = Math.max(1.0, p.size * baseHeight * relativeMultiplier);
          sizeH = sizeW;
        }

        if (p.preRenderedCanvas) {
          sizeW = sizeW * (32 / 12);
          sizeH = sizeH * (32 / 12);
        }

        let u0 = 0.0, v0 = 0.0, u1 = 1.0, v1 = 1.0;
        if (renderType === 1 && p.uvRect && !p.preRenderedCanvas) {
          u0 = p.uvRect.u;
          v0 = p.uvRect.v;
          u1 = p.uvRect.u + p.uvRect.w;
          v1 = p.uvRect.v + p.uvRect.h;
        }

        let squash = 1;
        if ((p.type === 'gib' || p.type === 'deco_gib') && p.landed) {
          const cameraHeight = 0.5;
          const viewingAngleSin = cameraHeight / Math.sqrt(p.dist * p.dist + cameraHeight * cameraHeight);
          squash = Math.max(0.1, viewingAngleSin);
        }

        let rot = p.rotation || 0;
        if ((p.type === 'gib' || p.type === 'deco_gib') && p.landed && playerAngle !== undefined) {
          rot = rot - playerAngle - Math.PI / 2;
        }

        const hasPoints = p.points && p.points.length >= 3 && !p.preRenderedCanvas;

        const cosR = rot !== 0 ? Math.cos(rot) : 1;
        const sinR = rot !== 0 ? Math.sin(rot) : 0;

        const isLandedFlat = p.landed && (p.type === 'gib' || p.type === 'deco_gib' || p.type === 'brick' || p.type === 'shard');

        const getTransformedX = (rx: number, ry: number) => {
          if (rot !== 0) {
            return drawX + (rx * cosR - ry * sinR);
          }
          return drawX + rx;
        };

        const getTransformedY = (rx: number, ry: number) => {
          if (rot !== 0) {
            const ryRot = rx * sinR + ry * cosR;
            return drawY + (isLandedFlat ? ryRot * squash : ryRot);
          }
          return drawY + (isLandedFlat ? ry * squash : ry);
        };

        let dx = 0;
        let dy = 0;
        let thickness = 0;
        if ((p.type === 'gib' || p.type === 'deco_gib') && p.landed) {
          thickness = Math.max(1, Math.min(4, Math.floor(6 / p.dist)));
          dx = Math.sin(rot) / squash;
          dy = Math.cos(rot) / squash;
        }

        const layersCount = thickness > 0 ? thickness + 1 : 1;

        for (let layerIdx = 0; layerIdx < layersCount; layerIdx++) {
          const layerI = thickness > 0 ? (thickness - layerIdx) : 0;
          const offX = layerI * dx;
          const offY = layerI * dy;

          if (hasPoints) {
            const pts: { x: number, y: number }[] = p.points!;
            const numPts = pts.length;

            const getVertexX = (pt: { x: number, y: number }) => {
              const lrx = pt.x * sizeW + offX;
              const lry = pt.y * sizeH + offY;
              if (rot !== 0) {
                return drawX + (lrx * cosR - lry * sinR);
              }
              return drawX + lrx;
            };

            const getVertexY = (pt: { x: number, y: number }) => {
              const lrx = pt.x * sizeW + offX;
              const lry = pt.y * sizeH + offY;
              if (rot !== 0) {
                const ryRot = lrx * sinR + lry * cosR;
                return drawY + (isLandedFlat ? ryRot * squash : ryRot);
              }
              return drawY + (isLandedFlat ? lry * squash : lry);
            };

            const getVertexU = (pt: { x: number, y: number }) => u0 + (u1 - u0) * (pt.x + 0.5);
            const getVertexV = (pt: { x: number, y: number }) => v0 + (v1 - v0) * (pt.y + 0.5);

            for (let t = 0; t < numPts - 2; t++) {
              const ptHub = pts[0];
              const ptA = pts[t + 1];
              const ptB = pts[t + 2];

              // Hub vertex
              vertexData[offset++] = getVertexX(ptHub);
              vertexData[offset++] = getVertexY(ptHub);
              vertexData[offset++] = getVertexU(ptHub);
              vertexData[offset++] = getVertexV(ptHub);
              vertexData[offset++] = r;
              vertexData[offset++] = g;
              vertexData[offset++] = b;
              vertexData[offset++] = a;

              // Vertex A
              vertexData[offset++] = getVertexX(ptA);
              vertexData[offset++] = getVertexY(ptA);
              vertexData[offset++] = getVertexU(ptA);
              vertexData[offset++] = getVertexV(ptA);
              vertexData[offset++] = r;
              vertexData[offset++] = g;
              vertexData[offset++] = b;
              vertexData[offset++] = a;

              // Vertex B
              vertexData[offset++] = getVertexX(ptB);
              vertexData[offset++] = getVertexY(ptB);
              vertexData[offset++] = getVertexU(ptB);
              vertexData[offset++] = getVertexV(ptB);
              vertexData[offset++] = r;
              vertexData[offset++] = g;
              vertexData[offset++] = b;
              vertexData[offset++] = a;
            }
          } else {
            let x0 = -sizeW / 2;
            let y0 = -sizeH / 2;
            let x1 = sizeW / 2;
            let y1 = sizeH / 2;

            if (p.type === 'rain' || p.type === 'splash') {
              x0 = 0;
              y0 = 0;
              x1 = sizeW;
              y1 = sizeH;
            }

            const rx0 = x0 + offX; const ry0 = y0 + offY;
            const rx1 = x1 + offX; const ry1 = y1 + offY;

            const px0 = getTransformedX(rx0, ry0); const py0 = getTransformedY(rx0, ry0);
            const px1 = getTransformedX(rx1, ry0); const py1 = getTransformedY(rx1, ry0);
            const px2 = getTransformedX(rx0, ry1); const py2 = getTransformedY(rx0, ry1);
            const px3 = getTransformedX(rx1, ry1); const py3 = getTransformedY(rx1, ry1);

            // Triangle 1
            vertexData[offset++] = px0; vertexData[offset++] = py0; vertexData[offset++] = u0; vertexData[offset++] = v0;
            vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a;

            vertexData[offset++] = px1; vertexData[offset++] = py1; vertexData[offset++] = u1; vertexData[offset++] = v0;
            vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a;

            vertexData[offset++] = px2; vertexData[offset++] = py2; vertexData[offset++] = u0; vertexData[offset++] = v1;
            vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a;

            // Triangle 2
            vertexData[offset++] = px2; vertexData[offset++] = py2; vertexData[offset++] = u0; vertexData[offset++] = v1;
            vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a;

            vertexData[offset++] = px1; vertexData[offset++] = py1; vertexData[offset++] = u1; vertexData[offset++] = v0;
            vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a;

            vertexData[offset++] = px3; vertexData[offset++] = py3; vertexData[offset++] = u1; vertexData[offset++] = v1;
            vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a;
          }
        }
      }

      const partSubArray = vertexData.subarray(0, offset);
      if (this.particleVertexBufferCapacity < partSubArray.byteLength) {
        gl.bufferData(gl.ARRAY_BUFFER, Math.max(this.particleVertexBufferCapacity * 2, partSubArray.byteLength), gl.DYNAMIC_DRAW);
        this.particleVertexBufferCapacity = Math.max(this.particleVertexBufferCapacity * 2, partSubArray.byteLength);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, partSubArray);

      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 32, 8);
      gl.vertexAttribPointer(colAttr, 4, gl.FLOAT, false, 32, 16);

      gl.uniform1i(this.getUniformLoc(this.particleProgram!, "u_renderType"), renderType);

      if (renderType === 1 && textureToBind) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textureToBind);
        gl.uniform1i(this.getUniformLoc(this.particleProgram!, "u_texture"), 0);
      }

      gl.drawArrays(gl.TRIANGLES, 0, totalVertices);
    };

    drawBatch(flatParticles, 0);
    drawBatch(smokeParticles, 2);

    texturedGroups.forEach((batch, key) => {
      let texToBind: WebGLTexture | null = null;
      const firstP = batch[0];
      if (firstP && firstP.preRenderedCanvas) {
        texToBind = this.getTexture(key, firstP.preRenderedCanvas);
      } else if (sprites && sprites.has(key)) {
        texToBind = this.getTexture(key, sprites.get(key)!);
      } else if (sprites && sprites.has(`TEX_${key}`)) {
        texToBind = this.getTexture(key, sprites.get(`TEX_${key}`)!);
      } else if (auxBuffers && auxBuffers.has(key)) {
        texToBind = this.getTexture(key, auxBuffers.get(key)!);
      } else {
        texToBind = this.blankTexture;
      }
      drawBatch(batch, 1, texToBind || undefined);
    });
  }

  private updateZBufferTexture(zBuffer: Float32Array | number[], width: number) {
    if (!this.gl) return;
    const gl = this.gl;

    if (!this.zBufferTexture) {
      this.zBufferTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.zBufferTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const neededBytes = width * 4;
    if (!this.cachedZBufferBytes || this.cachedZBufferBytes.length < neededBytes) {
      this.cachedZBufferBytes = new Uint8Array(neededBytes);
    }
    const zBufferData = this.cachedZBufferBytes;
    for (let i = 0; i < width; i++) {
      const val = zBuffer && zBuffer[i] !== undefined ? zBuffer[i] : 999.0;
      const normalized = Math.min(0.999999, Math.max(0.000001, val / 100.0));
      const v = Math.floor(normalized * 16777215);
      const r = (v >> 16) & 0xff;
      const g = (v >> 8) & 0xff;
      const b = v & 0xff;
      const idx = i * 4;
      zBufferData[idx] = r;
      zBufferData[idx + 1] = g;
      zBufferData[idx + 2] = b;
      zBufferData[idx + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, zBufferData);
  }

  private updateMirrorMaskTexture(
    mirrorReflections: MirrorReflection[][] | undefined,
    width: number,
    height: number
  ) {
    if (!this.gl) return;
    const gl = this.gl;

    if (!this.mirrorMaskTexture) {
      this.mirrorMaskTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.mirrorMaskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const neededBytes = width * 4;
    if (!this.cachedMirrorMaskBytes || this.cachedMirrorMaskBytes.length < neededBytes) {
      this.cachedMirrorMaskBytes = new Uint8Array(neededBytes);
    }
    const maskData = this.cachedMirrorMaskBytes;

    for (let i = 0; i < width; i++) {
      const colRefs = mirrorReflections ? mirrorReflections[i] : null;
      const colRef = colRefs && colRefs.length > 0 ? colRefs[0] : null;

      const hasValidMask = Boolean(
        colRef &&
        colRef.maskBottom !== undefined &&
        colRef.maskBottom !== -1 &&
        colRef.maskTop !== undefined &&
        colRef.maskTop !== 9999 &&
        colRef.maskTop <= colRef.maskBottom
      );

      if (hasValidMask && colRef) {
        const normTop = Math.floor(Math.min(1.0, Math.max(0.0, colRef.maskTop / height)) * 255);
        const normBot = Math.ceil(Math.min(1.0, Math.max(0.0, (colRef.maskBottom + 1) / height)) * 255);
        const maxDist = colRef.perpWallDist + colRef.mirrorRefDist;
        const normMaxDist = Math.floor(Math.min(1.0, Math.max(0.0, maxDist / 100.0)) * 255);

        maskData[i * 4] = 255;
        maskData[i * 4 + 1] = normTop;
        maskData[i * 4 + 2] = normBot;
        maskData[i * 4 + 3] = normMaxDist;
      } else {
        maskData[i * 4] = 0;
        maskData[i * 4 + 1] = 255;
        maskData[i * 4 + 2] = 0;
        maskData[i * 4 + 3] = 0;
      }
    }

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      maskData
    );
  }

  public renderSpritesWebGL(
    width: number,
    height: number,
    spritesToDraw: any[],
    zBuffer: Float32Array,
    auxBuffers: Map<string, RaycasterBuffer> | undefined
  ) {
    if (!this.gl || !this.spriteProgram) return;
    const gl = this.gl;

    this.updateZBufferTexture(zBuffer, width);

    gl.useProgram(this.spriteProgram);
    gl.uniform2f(this.getUniformLoc(this.spriteProgram, "u_resolution"), width, height);
    gl.uniform1f(this.getUniformLoc(this.spriteProgram, "u_zBias"), 0.15);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.zBufferTexture);
    gl.uniform1i(this.getUniformLoc(this.spriteProgram, "u_zBufferTex"), 1);

    const textureGroups = this.textureGroupsMap;
    textureGroups.forEach((arr) => {
      arr.length = 0;
      this.textureGroupArraysPool.push(arr);
    });
    textureGroups.clear();

    for (let i = 0; i < spritesToDraw.length; i++) {
      const s = spritesToDraw[i];
      if (!s.drawSource) continue;
      const source = s.drawSource;
      let group = textureGroups.get(source);
      if (!group) {
        group = this.textureGroupArraysPool.pop() || [];
        textureGroups.set(source, group);
      }
      group.push(s);
    }

    const posAttr = this.getAttribLoc(this.spriteProgram, "a_position");
    const texAttr = this.getAttribLoc(this.spriteProgram, "a_texCoord");
    const colAttr = this.getAttribLoc(this.spriteProgram, "a_color");
    const distAttr = this.getAttribLoc(this.spriteProgram, "a_dist");

    gl.enableVertexAttribArray(posAttr);
    gl.enableVertexAttribArray(texAttr);
    gl.enableVertexAttribArray(colAttr);
    if (distAttr !== -1) {
      gl.enableVertexAttribArray(distAttr);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVertexBuffer);

    textureGroups.forEach((batch, source) => {
      const neededSize = batch.length * 6 * 9;
      const vertexData = this.getSpriteVertexArray(neededSize);
      let offset = 0;

      for (let i = 0; i < batch.length; i++) {
        const s = batch[i];

        const x0 = s.webglX0 !== undefined ? s.webglX0 : 0.0;
        const x1 = s.webglX1 !== undefined ? s.webglX1 : 0.0;
        const y0 = s.webglY0 !== undefined ? s.webglY0 : 0.0;
        const y1 = s.webglY1 !== undefined ? s.webglY1 : 0.0;

        const u0 = s.webglU0 !== undefined ? s.webglU0 : 0.0;
        const u1 = s.webglU1 !== undefined ? s.webglU1 : 1.0;
        const v0 = s.webglV0 !== undefined ? s.webglV0 : 0.0;
        const v1 = s.webglV1 !== undefined ? s.webglV1 : 1.0;

        const distVal = s.webglDist !== undefined ? s.webglDist : -1.0;

        const r = 1.0, g = 1.0, b = 1.0;
        const a = s.webglAlpha !== undefined ? s.webglAlpha : 1.0;

        vertexData[offset++] = x0; vertexData[offset++] = y0; vertexData[offset++] = u0; vertexData[offset++] = v0; vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a; vertexData[offset++] = distVal;
        vertexData[offset++] = x1; vertexData[offset++] = y0; vertexData[offset++] = u1; vertexData[offset++] = v0; vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a; vertexData[offset++] = distVal;
        vertexData[offset++] = x0; vertexData[offset++] = y1; vertexData[offset++] = u0; vertexData[offset++] = v1; vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a; vertexData[offset++] = distVal;

        vertexData[offset++] = x0; vertexData[offset++] = y1; vertexData[offset++] = u0; vertexData[offset++] = v1; vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a; vertexData[offset++] = distVal;
        vertexData[offset++] = x1; vertexData[offset++] = y0; vertexData[offset++] = u1; vertexData[offset++] = v0; vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a; vertexData[offset++] = distVal;
        vertexData[offset++] = x1; vertexData[offset++] = y1; vertexData[offset++] = u1; vertexData[offset++] = v1; vertexData[offset++] = r; vertexData[offset++] = g; vertexData[offset++] = b; vertexData[offset++] = a; vertexData[offset++] = distVal;
      }

      if (!source._webglTexId) {
        source._webglTexId = "src_uid_" + (++this.spriteSourceUidCounter);
      }
      const texKey = source._webglTexId;

      const texToBind = this.getTexture(texKey, source);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texToBind);
      gl.uniform1i(this.getUniformLoc(this.spriteProgram!, "u_spriteTex"), 0);

      const spriteSubArray = vertexData.subarray(0, offset);
      if (this.spriteVertexBufferCapacity < spriteSubArray.byteLength) {
        gl.bufferData(gl.ARRAY_BUFFER, Math.max(this.spriteVertexBufferCapacity * 2, spriteSubArray.byteLength), gl.DYNAMIC_DRAW);
        this.spriteVertexBufferCapacity = Math.max(this.spriteVertexBufferCapacity * 2, spriteSubArray.byteLength);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, spriteSubArray);

      const stride = 36;
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, stride, 8);
      gl.vertexAttribPointer(colAttr, 4, gl.FLOAT, false, stride, 16);
      if (distAttr !== -1) {
        gl.vertexAttribPointer(distAttr, 1, gl.FLOAT, false, stride, 32);
      }

      gl.drawArrays(gl.TRIANGLES, 0, batch.length * 6);
    });
  }

  public clearCache() {
    if (!this.gl) return;
    const gl = this.gl;
    this.gpuTextures.forEach((tex) => gl.deleteTexture(tex));
    this.gpuTextures.clear();
    this.gpuTextureSources.clear();
    if (this.blankTexture) gl.deleteTexture(this.blankTexture);
    this.blankTexture = null;
    if (this.lightTexture) gl.deleteTexture(this.lightTexture);
    this.lightTexture = null;
    if (this.highlightTexture) gl.deleteTexture(this.highlightTexture);
    this.highlightTexture = null;
    if (this.waterTexture) gl.deleteTexture(this.waterTexture);
    this.waterTexture = null;
    if (this.bgProgram) gl.deleteProgram(this.bgProgram);
    if (this.wallProgram) gl.deleteProgram(this.wallProgram);
    if (this.particleProgram) gl.deleteProgram(this.particleProgram);
    this.particleProgram = null;

    if (this.spriteProgram) gl.deleteProgram(this.spriteProgram);
    this.spriteProgram = null;
    if (this.spriteVertexBuffer) gl.deleteBuffer(this.spriteVertexBuffer);
    this.spriteVertexBuffer = null;
    if (this.zBufferTexture) gl.deleteTexture(this.zBufferTexture);
    this.zBufferTexture = null;
    if (this.mirrorMaskTexture) gl.deleteTexture(this.mirrorMaskTexture);
    this.mirrorMaskTexture = null;

    if (this.bgQuadBuffer) gl.deleteBuffer(this.bgQuadBuffer);
    if (this.wallVertexBuffer) gl.deleteBuffer(this.wallVertexBuffer);
    if (this.particleVertexBuffer) gl.deleteBuffer(this.particleVertexBuffer);
    this.particleVertexBuffer = null;

    if (this.flashlightProgram) gl.deleteProgram(this.flashlightProgram);
    this.flashlightProgram = null;
    if (this.sceneTexture) gl.deleteTexture(this.sceneTexture);
    this.sceneTexture = null;
    if (this.maskTexture) gl.deleteTexture(this.maskTexture);
    this.maskTexture = null;
    if (this.lightProfileTexture) gl.deleteTexture(this.lightProfileTexture);
    this.lightProfileTexture = null;

    if (this.floorMapTexture) gl.deleteTexture(this.floorMapTexture);
    this.floorMapTexture = null;
    if (this.ceilMapTexture) gl.deleteTexture(this.ceilMapTexture);
    this.ceilMapTexture = null;
    this.floorMapData = null;
    this.ceilMapData = null;
    this.floorMapInitialized = false;

    // Reset buffer capacities
    this.wallVertexBufferCapacity = 0;
    this.mirrorBgVertexBufferCapacity = 0;
    this.particleVertexBufferCapacity = 0;
    this.spriteVertexBufferCapacity = 0;
  }

  public build3DGeometry(
    grid: any[][],
    activeGrids: any[][][],
    customWallBuffers: Map<number, RaycasterBuffer> | undefined,
    customFloorBuffers: Map<number, RaycasterBuffer> | undefined,
    auxBuffers: Map<string, RaycasterBuffer> | undefined,
    floorLightMaps: any[] | undefined,
    fallbackLightMap: any[][] | undefined,
    debugTextures: boolean
  ) {
    if (!this.gl) return;
    const gl = this.gl;

    // Clear old mesh and ceiling-cap batches.
    this.meshBatches.forEach((batch) => {
      if (batch.vertexBuffer) gl.deleteBuffer(batch.vertexBuffer);
    });
    this.meshBatches.clear();
    this.capBatches.forEach((batch) => {
      if (batch.vertexBuffer) gl.deleteBuffer(batch.vertexBuffer);
    });
    this.capBatches.clear();

    if (!activeGrids || activeGrids.length <= 1 || !grid?.length) return;

    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;
    const grouped = new Map<string, number[]>();

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const sampleLight = (levelMap: any[][] | undefined, px: number, py: number) => {
      if (!levelMap || !levelMap.length || !levelMap[0]?.length) return [1, 1, 1];
      const h = levelMap.length;
      const w = levelMap[0].length;
      const sx = clamp(px - 0.5, 0, Math.max(0, w - 1));
      const sy = clamp(py - 0.5, 0, Math.max(0, h - 1));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const c00 = levelMap[y0]?.[x0] || { r: 1, g: 1, b: 1 };
      const c10 = levelMap[y0]?.[x1] || c00;
      const c01 = levelMap[y1]?.[x0] || c00;
      const c11 = levelMap[y1]?.[x1] || c00;
      return [
        c00.r + (c10.r - c00.r) * tx + (c01.r - c00.r) * ty + (c11.r - c10.r - c01.r + c00.r) * tx * ty,
        c00.g + (c10.g - c00.g) * tx + (c01.g - c00.g) * ty + (c11.g - c10.g - c01.g + c00.g) * tx * ty,
        c00.b + (c10.b - c00.b) * tx + (c01.b - c00.b) * ty + (c11.b - c10.b - c01.b + c00.b) * tx * ty
      ];
    };

    const wallTop = (layer: number, x: number, y: number): number | null => {
      const tile = activeGrids[layer]?.[y]?.[x];
      if (!tile || tile.type !== 'WALL') return null;
      let elev = tile.elevation !== undefined ? tile.elevation : 0;
      let h = tile.height !== undefined ? Math.abs(tile.height) : 1;
      if (tile.height !== undefined && tile.height < 0) elev = 1 - h;
      return layer + elev + h;
    };

    const addVertex = (arr: number[], x: number, y: number, z: number, light: number[]) => {
      arr.push(x, y, z, -x, y, light[0], light[1], light[2]);
    };

    for (let level = 1; level < activeGrids.length; level++) {
      const levelGrid = activeGrids[level];
      if (!levelGrid) continue;
      const levelLight = floorLightMaps?.[level] || fallbackLightMap;

      for (let y = 0; y < mapHeight; y++) {
        const row = levelGrid[y];
        if (!row) continue;
        for (let x = 0; x < mapWidth; x++) {
          const tile = row[x];
          if (!tile || tile.type !== 'WALL') continue;

          const bottomZ = level + (tile.height !== undefined && tile.height < 0
            ? 1.0 - Math.abs(tile.height)
            : (tile.elevation !== undefined ? tile.elevation : 0));

          // Match the old CPU renderer: omit the underside when a solid lower wall
          // reaches or passes the same Z plane. The upper wall then has no exposed cap.
          let coveredByBelow = false;
          if (level > 0) {
            const belowTop = wallTop(level - 1, x, y);
            coveredByBelow = belowTop !== null && belowTop >= bottomZ - 0.001;
          }
          if (coveredByBelow) continue;

          let textureId = 'TEX_FALLBACK';
          const cellKey = y * 10000 + x;
          const customKey = cellKey * 10 + 5;
          if (debugTextures && customFloorBuffers?.has(customKey)) {
            textureId = `custom_floor_${customKey}`;
          } else if (debugTextures) {
            const candidate = tile.bottomTextureId || tile.assetId || tile.textureId;
            if (candidate) textureId = candidate;
          }

          let out = grouped.get(textureId);
          if (!out) {
            out = [];
            grouped.set(textureId, out);
          }

          const l00 = sampleLight(levelLight, x, y);
          const l10 = sampleLight(levelLight, x + 1, y);
          const l01 = sampleLight(levelLight, x, y + 1);
          const l11 = sampleLight(levelLight, x + 1, y + 1);

          // Two triangles. Texture coordinates intentionally mirror the legacy CPU
          // sampler: U uses -worldX, V uses worldY, with repeat wrapping on the GPU.
          addVertex(out, x, y, bottomZ, l00);
          addVertex(out, x + 1, y, bottomZ, l10);
          addVertex(out, x, y + 1, bottomZ, l01);
          addVertex(out, x, y + 1, bottomZ, l01);
          addVertex(out, x + 1, y, bottomZ, l10);
          addVertex(out, x + 1, y + 1, bottomZ, l11);
        }
      }
    }

    for (const [textureId, vertices] of grouped) {
      if (vertices.length === 0) continue;
      const buffer = gl.createBuffer();
      if (!buffer) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const data = new Float32Array(vertices);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.capBatches.set(textureId, { textureId, vertexBuffer: buffer, vertexCount: data.length / 8 });
    }
  }

  public clearLevelCache() {
    if (!this.gl) return;
    const gl = this.gl;
    
    // Delete all cached level-dependent textures
    this.gpuTextures.forEach((tex) => gl.deleteTexture(tex));
    this.gpuTextures.clear();
    this.gpuTextureSources.clear();

    // Reset floor/ceil map textures
    if (this.floorMapTexture) {
      gl.deleteTexture(this.floorMapTexture);
      this.floorMapTexture = null;
    }
    if (this.ceilMapTexture) {
      gl.deleteTexture(this.ceilMapTexture);
      this.ceilMapTexture = null;
    }
    
    this.floorMapData = null;
    this.ceilMapData = null;
    this.floorMapInitialized = false;
    this.lastTileFloorAssets = null;
    this.lastTileCeilAssets = null;
    
    // Reset tracker variables
    this.lastGrid = null;
    this.lastActiveGrids = null;
    this.lastFloorBuf = null;
    this.lastCeilBuf = null;
    this.lastAuxBuffers = null;
    this.lastAuxBuffersSize = 0;
    this.lastFloorLightMaps = null;
    this.lastDebugTextures = true;
    this.lastGridGeometryHash = 0;
    this.lastLightMap = null;
    this.lastGridForLight = null;
    this.lastLightningMap = null;
    this.lastWaterGrid = null;
    this.lastHighlightGrid = null;
    this.lastHighlightedTiles = undefined;

    // Clear 3D mesh batches
    this.meshBatches.forEach((batch) => {
      if (batch.vertexBuffer) gl.deleteBuffer(batch.vertexBuffer);
    });
    this.meshBatches.clear();

    // Clear static upper-floor ceiling cap batches
    this.capBatches.forEach((batch) => {
      if (batch.vertexBuffer) gl.deleteBuffer(batch.vertexBuffer);
    });
    this.capBatches.clear();
  }

  public renderFlashlightWebGL(
    width: number,
    height: number,
    sceneCanvas: HTMLCanvasElement,
    lightProfileCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement | null
  ) {
    if (!this.gl || !this.flashlightProgram) return;
    const gl = this.gl;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);

    if (!this.sceneTexture) {
      this.sceneTexture = gl.createTexture();
    }
    if (!this.lightProfileTexture) {
      this.lightProfileTexture = gl.createTexture();
    }
    if (!this.maskTexture) {
      this.maskTexture = gl.createTexture();
    }

    // Bind and upload scene texture (active texture 0)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);

    // Bind and upload light profile texture (active texture 1)
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightProfileTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lightProfileCanvas);

    // Bind and upload mask texture (active texture 2) if active
    let useMask = false;
    if (maskCanvas) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
      useMask = true;
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.flashlightProgram);

    gl.uniform1i(this.getUniformLoc(this.flashlightProgram, "u_useMask"), useMask ? 1 : 0);
    gl.uniform1i(this.getUniformLoc(this.flashlightProgram, "u_sceneTex"), 0);
    gl.uniform1i(this.getUniformLoc(this.flashlightProgram, "u_lightProfileTex"), 1);
    if (useMask) {
      gl.uniform1i(this.getUniformLoc(this.flashlightProgram, "u_maskTex"), 2);
    }

    const posAttr = this.getAttribLoc(this.flashlightProgram, "position");
    gl.enableVertexAttribArray(posAttr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuadBuffer);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

const colorCache = new Map<string, { r: number, g: number, b: number }>();

function parseColor(color: string): { r: number, g: number, b: number } {
  if (!color) return { r: 1.0, g: 1.0, b: 1.0 };
  const cached = colorCache.get(color);
  if (cached) return cached;
  try {
    const lower = color.trim().toLowerCase();
    if (lower.startsWith('#')) {
      const hex = lower.substring(1);
      if (hex.length === 3) {
        const res = {
          r: parseInt(hex[0] + hex[0], 16) / 255,
          g: parseInt(hex[1] + hex[1], 16) / 255,
          b: parseInt(hex[2] + hex[2], 16) / 255
        };
        colorCache.set(color, res);
        return res;
      } else if (hex.length >= 6) {
        const res = {
          r: parseInt(hex.substring(0, 2), 16) / 255,
          g: parseInt(hex.substring(2, 4), 16) / 255,
          b: parseInt(hex.substring(4, 6), 16) / 255
        };
        colorCache.set(color, res);
        return res;
      }
    }
    if (lower.startsWith('rgb')) {
      const match = lower.match(/\d+/g);
      if (match && match.length >= 3) {
        const res = {
          r: Math.min(1.0, parseInt(match[0], 10) / 255),
          g: Math.min(1.0, parseInt(match[1], 10) / 255),
          b: Math.min(1.0, parseInt(match[2], 10) / 255)
        };
        colorCache.set(color, res);
        return res;
      }
    }
    switch (lower) {
      case 'red': return { r: 1.0, g: 0.0, b: 0.0 };
      case 'green': return { r: 0.0, g: 1.0, b: 0.0 };
      case 'blue': return { r: 0.0, g: 0.0, b: 1.0 };
      case 'yellow': return { r: 1.0, g: 1.0, b: 0.0 };
      case 'orange': return { r: 1.0, g: 0.65, b: 0.0 };
      case 'purple': return { r: 0.5, g: 0.0, b: 0.5 };
      case 'grey':
      case 'gray': return { r: 0.5, g: 0.5, b: 0.5 };
      case 'white': return { r: 1.0, g: 1.0, b: 1.0 };
      case 'black': return { r: 0.0, g: 0.0, b: 0.0 };
      case 'darkred': return { r: 0.55, g: 0.0, b: 0.0 };
      case 'crimson': return { r: 0.86, g: 0.08, b: 0.24 };
    }
  } catch (e) {
    // Ignore, returning default white
  }
  return { r: 1.0, g: 1.0, b: 1.0 };
}

export const BACKGROUND_FS_LIGHT = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform vec2 u_resolution;
  uniform vec3 u_fogColor;
  uniform int u_ceilingType;

  vec4 getSkyColor(float y) {
    float t = clamp(y / (u_resolution.y * 0.5), 0.0, 1.0);
    vec3 skyTop = vec3(10.0 / 255.0, 10.0 / 255.0, 14.0 / 255.0);
    vec3 skyBottom = vec3(22.0 / 255.0, 22.0 / 255.0, 32.0 / 255.0);
    return vec4(mix(skyBottom, skyTop, t), 1.0);
  }

  void main() {
    float y = (1.0 - v_texCoord.y) * u_resolution.y;
    vec4 finalColor = vec4(0.0, 0.0, 0.0, 1.0);

    if (u_ceilingType == 1) {
      finalColor = getSkyColor(y);
    } else {
      finalColor = vec4(u_fogColor, 1.0);
    }
    
    gl_FragColor = finalColor;
  }
`;

export const MESH_VS = `
  attribute vec3 a_position;
  attribute vec2 a_texCoord;
  attribute vec2 a_lightCoord;
  attribute float a_side;

  varying vec2 v_texCoord;
  varying vec2 v_lightCoord;
  varying float v_side;
  varying float v_depth;

  uniform vec2 u_playerPos;
  uniform float u_cameraZ;
  uniform vec2 u_dir;
  uniform vec2 u_plane;
  uniform float u_horizon;
  uniform vec2 u_resolution;

  void main() {
    vec3 camera_pos = vec3(u_playerPos.x, u_playerPos.y, u_cameraZ);
    vec3 delta = a_position - camera_pos;

    float det = u_dir.x * u_plane.y - u_dir.y * u_plane.x;
    float depth = (delta.x * u_plane.y - delta.y * u_plane.x) / det;
    float camX = (u_dir.x * delta.y - u_dir.y * delta.x) / det;
    float camY = delta.z;

    float horizon_shift = 1.0 - 2.0 * u_horizon / u_resolution.y;

    gl_Position = vec4(camX, horizon_shift * depth + 2.0 * camY, depth * 0.01, depth);

    v_texCoord = a_texCoord;
    v_lightCoord = a_lightCoord;
    v_side = a_side;
    v_depth = depth;
  }
`;

export const MESH_FS = `
  precision highp float;

  varying vec2 v_texCoord;
  varying vec2 v_lightCoord;
  varying float v_side;
  varying float v_depth;

  uniform sampler2D u_texture;
  uniform sampler2D u_lightTex;
  uniform sampler2D u_highlightTex;
  uniform sampler2D u_waterTex;
  uniform vec2 u_mapSize;
  uniform float u_renderDistance;
  uniform float u_minBrightness;
  uniform vec3 u_fogColor;
  uniform bool u_isFog;
  uniform float u_lightningIntensity;
  uniform float u_muzzleFlashIntensity;
  uniform int u_activeFlashCount;
  uniform vec3 u_activeFlashes[8];
  uniform vec2 u_playerPos;
  uniform float u_time;

  uniform int u_shadowCount;
  uniform vec4 u_shadows[16];
  uniform bool u_magentaShadows;

  float getDepthFactor(float d) {
    if (u_isFog) {
      if (d <= 0.0) return 1.0;
      if (d >= u_renderDistance) return 0.0;
      float t = d / u_renderDistance;
      return 1.0 - (t * t * (3.0 - 2.0 * t));
    }

    float fogStart = max(5.0, u_renderDistance * 0.25);
    if (d <= fogStart) {
      return 1.0;
    }
    float fogRange = u_renderDistance - fogStart;
    if (fogRange <= 0.0) return u_minBrightness;

    float t = clamp((d - fogStart) / fogRange, 0.0, 1.0);
    float factor = 1.0 - (t * t * (3.0 - 2.0 * t));
    return max(u_minBrightness, factor);
  }

  void main() {
    if (v_depth <= 0.01) {
      discard;
    }

    vec4 texColor = texture2D(u_texture, v_texCoord);
    if (texColor.a < 0.1) {
      discard;
    }

    if (texColor.g > 0.9 && texColor.r < 0.15 && texColor.b < 0.15) {
      discard;
    }

    // Apply GPU-rendered sprite shadows on elevated floors (v_side == 2.0)
    if (u_shadowCount > 0 && v_side == 2.0) {
      float maxIntensity = 0.0;
      vec2 sampleUV = v_lightCoord + vec2(0.5);
      for (int i = 0; i < 16; i++) {
        if (i >= u_shadowCount) break;
        vec4 s = u_shadows[i];
        float dx = sampleUV.x - s.x;
        float dy = sampleUV.y - s.y;
        if (abs(dx) < s.z && abs(dy) < s.w) {
          float d2 = (dx*dx) / (s.z*s.z) + (dy*dy) / (s.w*s.w);
          if (d2 < 1.0) {
            float intensity = smoothstep(1.0, 0.0, d2);
            if (intensity > maxIntensity) {
              maxIntensity = intensity;
            }
          }
        }
      }
      if (maxIntensity > 0.0) {
        if (u_magentaShadows) {
          texColor.rgb = mix(texColor.rgb, vec3(1.0, 0.0, 1.0), maxIntensity * 0.9);
        } else {
          texColor.rgb *= (1.0 - maxIntensity * 0.65);
        }
      }
    }

    vec2 lightUV = (v_lightCoord + vec2(0.5)) / u_mapSize;
    vec4 lightMapColor = texture2D(u_lightTex, lightUV);

    vec3 sideMult = vec3(1.0);
    if (v_side == 0.0) {
      sideMult = vec3(0.6);
    } else if (v_side == 1.0) {
      sideMult = vec3(0.8);
    } else if (v_side == 2.0) {
      sideMult = vec3(1.0);
    } else if (v_side == 3.0) {
      sideMult = vec3(0.5);
    }

    vec3 litColor = texColor.rgb * lightMapColor.rgb * sideMult;

    float factor = getDepthFactor(v_depth);
    vec3 foggedColor;
    if (u_isFog) {
      foggedColor = mix(litColor, u_fogColor, 1.0 - factor);
    } else {
      foggedColor = litColor * factor;
    }

    if (u_lightningIntensity > 0.0) {
      foggedColor += vec3(u_lightningIntensity * lightMapColor.a * (150.0/255.0), u_lightningIntensity * lightMapColor.a * (160.0/255.0), u_lightningIntensity * lightMapColor.a * (200.0/255.0));
    }

    if (u_muzzleFlashIntensity > 0.0) {
      vec2 fragWorldPos = v_lightCoord + vec2(0.5);
      vec2 playerToFrag = fragWorldPos - u_playerPos;
      float distSq = dot(playerToFrag, playerToFrag);
      float flashI = u_muzzleFlashIntensity / (distSq * 0.5 + 1.0);
      foggedColor += vec3(flashI * (255.0/255.0), flashI * (200.0/255.0), flashI * (80.0/255.0));
    }

    // Add active flashes
    for (int i = 0; i < 8; i++) {
      if (i >= u_activeFlashCount) break;
      vec3 flash = u_activeFlashes[i];
      vec2 fragWorldPos = v_lightCoord + vec2(0.5);
      vec2 flashToFrag = fragWorldPos - flash.xy;
      float distSq = dot(flashToFrag, flashToFrag);
      float flashI = flash.z / (distSq * 0.5 + 1.0);
      foggedColor += vec3(flashI * (255.0/255.0), flashI * (200.0/255.0), flashI * (80.0/255.0));
    }

    vec4 highlightColor = texture2D(u_highlightTex, lightUV);
    if (highlightColor.r > 0.1 && v_side == 2.0) {
      float highlightPulse = 0.25 + 0.75 * (sin(u_time * 2.2222222) * 0.5 + 0.5);
      foggedColor.r = min(1.0, foggedColor.r + (60.0 / 255.0) * highlightPulse);
      foggedColor.g *= (1.0 - 0.6 * highlightPulse);
      foggedColor.b *= (1.0 - 0.6 * highlightPulse);
    }

    gl_FragColor = vec4(clamp(foggedColor, 0.0, 1.0), texColor.a);
  }
`;

export const POLY_VS = `
  attribute vec3 a_position;
  attribute vec4 a_color;
  attribute vec2 a_lightCoord;
  attribute float a_side;
  attribute vec2 a_texCoord;

  varying vec4 v_color;
  varying vec2 v_lightCoord;
  varying float v_side;
  varying float v_depth;
  varying vec2 v_texCoord;

  uniform vec2 u_playerPos;
  uniform float u_cameraZ;
  uniform vec2 u_dir;
  uniform vec2 u_plane;
  uniform float u_horizon;
  uniform vec2 u_resolution;

  void main() {
    vec3 camera_pos = vec3(u_playerPos.x, u_playerPos.y, u_cameraZ);
    vec3 delta = a_position - camera_pos;

    float det = u_dir.x * u_plane.y - u_dir.y * u_plane.x;
    float depth = (delta.x * u_plane.y - delta.y * u_plane.x) / det;
    float camX = (u_dir.x * delta.y - u_dir.y * delta.x) / det;
    float camY = delta.z;

    float horizon_shift = 1.0 - 2.0 * u_horizon / u_resolution.y;

    float near = 0.01;
    float far = 100.0;
    float z_val = ((far + near) / (far - near)) * depth - (2.0 * far * near) / (far - near);
    gl_Position = vec4(camX, horizon_shift * depth + 2.0 * camY, z_val, depth);

    v_color = a_color;
    v_lightCoord = a_lightCoord;
    v_side = a_side;
    v_depth = depth;
    v_texCoord = a_texCoord;
  }
`;

export const POLY_FS = `
  precision highp float;

  varying vec4 v_color;
  varying vec2 v_lightCoord;
  varying float v_side;
  varying float v_depth;
  varying vec2 v_texCoord;

  uniform sampler2D u_lightTex;
  uniform sampler2D u_highlightTex;
  uniform sampler2D u_zBufferTex;
  uniform sampler2D u_mirrorMaskTex;
  uniform sampler2D u_polyTex;
  uniform bool u_useTexture;

  uniform vec2 u_resolution;
  uniform vec2 u_mapSize;
  uniform float u_renderDistance;
  uniform float u_minBrightness;
  uniform vec3 u_fogColor;
  uniform bool u_isFog;
  uniform float u_lightningIntensity;
  uniform float u_muzzleFlashIntensity;
  uniform int u_activeFlashCount;
  uniform vec3 u_activeFlashes[8];
  uniform vec2 u_playerPos;
  uniform float u_time;

  float getDepthFactor(float d) {
    if (u_isFog) {
      if (d <= 0.0) return 1.0;
      if (d >= u_renderDistance) return 0.0;
      float t = d / u_renderDistance;
      return 1.0 - (t * t * (3.0 - 2.0 * t));
    }

    float fogStart = max(5.0, u_renderDistance * 0.25);
    if (d <= fogStart) return 1.0;
    float fogRange = u_renderDistance - fogStart;
    if (fogRange <= 0.0) return u_minBrightness;

    float t = clamp((d - fogStart) / fogRange, 0.0, 1.0);
    return max(u_minBrightness, 1.0 - (t * t * (3.0 - 2.0 * t)));
  }

  void main() {
    if (v_depth <= 0.01) {
      discard;
    }

    bool isReflected = (v_side < 0.0);
    float sideMultiplier = abs(v_side);

    vec2 screenUV = gl_FragCoord.xy / u_resolution;

    if (isReflected) {
      vec4 mPack = texture2D(u_mirrorMaskTex, vec2(screenUV.x, 0.5));
      if (mPack.r < 0.5) {
        discard;
      }
      float maskTop = mPack.g;
      float maskBottom = mPack.b;
      float fragYFromTop = 1.0 - screenUV.y;
      if (fragYFromTop < maskTop - 0.005 || fragYFromTop > maskBottom + 0.005) {
        discard;
      }
      float maxRefDist = mPack.a * 100.0;
      if (maxRefDist > 0.001 && v_depth > maxRefDist + 0.15) {
        discard;
      }
    } else {
      vec4 pack = texture2D(u_zBufferTex, vec2(screenUV.x, 0.5));
      float wallDist = (pack.r * 65536.0 + pack.g * 256.0 + pack.b) * (255.0 / 16777215.0) * 100.0;
      if (wallDist > 0.001 && v_depth > wallDist + 0.15) {
        discard;
      }
    }

    vec4 baseColor = v_color;
    if (u_useTexture) {
      vec4 texCol = texture2D(u_polyTex, v_texCoord);
      if (texCol.a < 0.05) {
        discard;
      }
      baseColor = baseColor * texCol;
    }

    if (baseColor.a < 0.01) {
      discard;
    }

    vec2 lightUV = clamp((floor(v_lightCoord) + vec2(0.5)) / u_mapSize, vec2(0.5) / u_mapSize, (u_mapSize - vec2(0.5)) / u_mapSize);
    vec4 lightMapColor = texture2D(u_lightTex, lightUV);

    vec3 litColor = baseColor.rgb * lightMapColor.rgb * sideMultiplier;
    if (isReflected) {
      litColor *= 0.85;
    }

    float factor = getDepthFactor(v_depth);
    vec3 foggedColor;
    if (u_isFog) {
      foggedColor = mix(litColor, u_fogColor, 1.0 - factor);
    } else {
      foggedColor = litColor * factor;
    }

    if (u_lightningIntensity > 0.0) {
      foggedColor += vec3(
        u_lightningIntensity * lightMapColor.a * (150.0 / 255.0),
        u_lightningIntensity * lightMapColor.a * (160.0 / 255.0),
        u_lightningIntensity * lightMapColor.a * (200.0 / 255.0)
      );
    }

    if (u_muzzleFlashIntensity > 0.0) {
      vec2 fragWorldPos = v_lightCoord + vec2(0.5);
      vec2 playerToFrag = fragWorldPos - u_playerPos;
      float distSq = dot(playerToFrag, playerToFrag);
      float flashI = u_muzzleFlashIntensity / (distSq * 0.5 + 1.0);
      foggedColor += vec3(flashI, flashI * 0.78, flashI * 0.31);
    }

    for (int i = 0; i < 8; i++) {
      if (i >= u_activeFlashCount) break;
      vec3 flash = u_activeFlashes[i];
      vec2 fragWorldPos = v_lightCoord + vec2(0.5);
      vec2 flashToFrag = fragWorldPos - flash.xy;
      float distSq = dot(flashToFrag, flashToFrag);
      float flashI = flash.z / (distSq * 0.5 + 1.0);
      foggedColor += vec3(flashI, flashI * 0.78, flashI * 0.31);
    }

    vec4 highlightColor = texture2D(u_highlightTex, lightUV);
    if (highlightColor.r > 0.1) {
      float highlightPulse = 0.25 + 0.75 * (sin(u_time * 2.2222222) * 0.5 + 0.5);
      foggedColor.r = min(1.0, foggedColor.r + (60.0 / 255.0) * highlightPulse);
      foggedColor.g *= (1.0 - 0.6 * highlightPulse);
      foggedColor.b *= (1.0 - 0.6 * highlightPulse);
    }

    gl_FragColor = vec4(clamp(foggedColor, 0.0, 1.0), baseColor.a);
  }
`;
