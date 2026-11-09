import React from 'react';
import { PolyObjectModel, PolyObjectCube } from '../types';
import { REGISTERED_POLY_MODELS, getPolyModelById } from '../data/polyModels';

/**
 * Вспомогательная функция для осветления/затенения цвета.
 */
export function adjustColor(colorStr: string | [number, number, number] | undefined, factor: number): string {
  if (!colorStr) {
    colorStr = '#888888';
  }
  let r = 128, g = 128, b = 128;
  if (Array.isArray(colorStr)) {
    r = colorStr[0] <= 1 ? Math.round(colorStr[0] * 255) : colorStr[0];
    g = colorStr[1] <= 1 ? Math.round(colorStr[1] * 255) : colorStr[1];
    b = colorStr[2] <= 1 ? Math.round(colorStr[2] * 255) : colorStr[2];
  } else if (typeof colorStr === 'string' && colorStr.startsWith('#')) {
    const hex = colorStr.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (typeof colorStr === 'string' && colorStr.startsWith('rgb')) {
    const matches = colorStr.match(/\d+/g);
    if (matches && matches.length >= 3) {
      r = parseInt(matches[0], 10);
      g = parseInt(matches[1], 10);
      b = parseInt(matches[2], 10);
    }
  }

  r = Math.min(255, Math.max(0, Math.round(r * factor)));
  g = Math.min(255, Math.max(0, Math.round(g * factor)));
  b = Math.min(255, Math.max(0, Math.round(b * factor)));

  return `rgb(${r}, ${g}, ${b})`;
}

export interface Polygon3D {
  points: { x: number; y: number }[];
  color: string;
  depth: number;
}

/**
 * Генерирует массив изометрических полигонов для заданной PolyObjectModel.
 */
export function getPolyModelIsometricPolygons(
  polyModel: PolyObjectModel,
  options?: {
    tileW?: number;
    tileH?: number;
    wallH?: number;
    scale?: number;
    rotation?: number; // 0, 1, 2, 3 (поворот на 0, 90, 180, 270 градусов)
    yRotation?: number; // поворот по оси Y в градусах
  }
): Polygon3D[] {
  const tileW = options?.tileW ?? 32;
  const tileH = options?.tileH ?? 16;
  const wallH = options?.wallH ?? 24;
  const scale = options?.scale ?? 1.0;
  const rotAngle = options?.yRotation !== undefined ? options.yRotation : ((options?.rotation ?? 0) * 90);
  const rot = Math.round((((rotAngle % 360) + 360) % 360) / 90) % 4;

  if (!polyModel || !polyModel.cubes || polyModel.cubes.length === 0) {
    return [];
  }

  const polygons: Polygon3D[] = [];

  // Поворот точки вокруг оси Z
  const rotatePoint = (x: number, y: number): { rx: number; ry: number } => {
    if (rotAngle % 90 === 0) {
      switch (rot) {
        case 1: return { rx: -y, ry: x };
        case 2: return { rx: -x, ry: -y };
        case 3: return { rx: y, ry: -x };
        default: return { rx: x, ry: y };
      }
    }
    const rad = (rotAngle * Math.PI) / 180;
    return {
      rx: x * Math.cos(rad) - y * Math.sin(rad),
      ry: x * Math.sin(rad) + y * Math.cos(rad),
    };
  };

  // Поворот размера
  const rotateSize = (dx: number, dy: number, r: number): { rdx: number; rdy: number } => {
    return (r % 2 === 1) ? { rdx: dy, rdy: dx } : { rdx: dx, rdy: dy };
  };

  // Поворот названий граней
  const rotateFaceColors = (fc: PolyObjectCube['faceColors'], r: number) => {
    if (!fc) return fc;
    const dirs = ['front', 'right', 'back', 'left'];
    const dirIndex: Record<string, number> = { front: 0, right: 1, back: 2, left: 3 };
    const newFc: any = { top: fc.top, bottom: fc.bottom };
    
    for (const d of dirs) {
      if ((fc as any)[d]) {
        const newD = dirs[(dirIndex[d] + r) % 4];
        newFc[newD] = (fc as any)[d];
      }
    }
    return newFc;
  };

  const cubeBounds = polyModel.cubes.map((cube) => {
    const rawOffset = cube.offset || [0, 0, 0];
    const rawSize = cube.size || [0.2, 0.2, 0.2];
    const { rx: ox, ry: oy } = rotatePoint(rawOffset[0], rawOffset[1]);
    const oz = rawOffset[2];
    const { rdx: dx, rdy: dy } = rotateSize(rawSize[0] * scale, rawSize[1] * scale, rot);
    const dz = rawSize[2] * scale;
    return {
      minX: ox - dx / 2, maxX: ox + dx / 2,
      minY: oy - dy / 2, maxY: oy + dy / 2,
      minZ: oz - dz / 2, maxZ: oz + dz / 2,
    };
  });

  const isFaceOccluded = (cubeIdx: number, faceType: 'top' | 'front' | 'right'): boolean => {
    const target = cubeBounds[cubeIdx];
    if (!target) return false;
    const eps = 1e-4;

    for (let i = 0; i < cubeBounds.length; i++) {
      if (i === cubeIdx) continue;
      const b = cubeBounds[i];

      switch (faceType) {
        case 'top': {
          const faceZ = target.maxZ;
          if (b.minZ <= faceZ + eps && b.maxZ >= faceZ - eps) {
            if (b.minX <= target.minX + eps && b.maxX >= target.maxX - eps &&
                b.minY <= target.minY + eps && b.maxY >= target.maxY - eps) {
              return true;
            }
          }
          break;
        }
        case 'front': {
          const faceY = target.maxY;
          if (b.minY <= faceY + eps && b.maxY >= faceY - eps) {
            if (b.minX <= target.minX + eps && b.maxX >= target.maxX - eps &&
                b.minZ <= target.minZ + eps && b.maxZ >= target.maxZ - eps) {
              return true;
            }
          }
          break;
        }
        case 'right': {
          const faceX = target.maxX;
          if (b.minX <= faceX + eps && b.maxX >= faceX - eps) {
            if (b.minY <= target.minY + eps && b.maxY >= target.maxY - eps &&
                b.minZ <= target.minZ + eps && b.maxZ >= target.maxZ - eps) {
              return true;
            }
          }
          break;
        }
      }
    }
    return false;
  };

  polyModel.cubes.forEach((cube, cubeIdx) => {
    const b = cubeBounds[cubeIdx];
    const ox = (b.minX + b.maxX) / 2;
    const oy = (b.minY + b.maxY) / 2;
    const oz = (b.minZ + b.maxZ) / 2;

    const fc = rotateFaceColors(cube.faceColors, rot);
    const baseColor = cube.color || '#8B5A2B';

    const x0 = b.minX;
    const x1 = b.maxX;
    const y0 = b.minY;
    const y1 = b.maxY;
    const z0 = b.minZ;
    const z1 = b.maxZ;

    // Проекция 3D (x, y, z) -> изометрические (px, py)
    const project = (x: number, y: number, z: number) => {
      const px = (x - y) * (tileW / 2);
      const py = (x + y) * (tileH / 2) - z * wallH;
      return { x: px, y: py };
    };

    if (cube.customFaces && cube.customFaces.length > 0 && cube.vertices && cube.vertices.length > 0) {
      cube.customFaces.forEach((f) => {
        const faceVerts = f.vertices.map(idx => cube.vertices![idx]).filter(Boolean);
        if (faceVerts.length < 3) return;

        const projectedPoints = faceVerts.map(v => {
          const { rx: rvx, ry: rvy } = rotatePoint(v[0] * scale, v[1] * scale);
          const rvz = v[2] * scale;
          return project(rvx, rvy, rvz);
        });

        let sumX = 0, sumY = 0, sumZ = 0;
        faceVerts.forEach(v => {
          sumX += v[0];
          sumY += v[1];
          sumZ += v[2];
        });
        const avgX = sumX / faceVerts.length;
        const avgY = sumY / faceVerts.length;
        const avgZ = sumZ / faceVerts.length;
        const { rx: ravgX, ry: ravgY } = rotatePoint(avgX * scale, avgY * scale);
        const ravgZ = avgZ * scale;

        const depth = (ravgX + ravgY) + ravgZ * 0.01;

        let nx = 0, ny = 0, nz = 0;
        const numV = faceVerts.length;
        const rotatedFaceVerts = faceVerts.map(v => {
          const { rx, ry } = rotatePoint(v[0] * scale, v[1] * scale);
          return [rx, ry, v[2] * scale] as [number, number, number];
        });
        for (let i = 0; i < numV; i++) {
          const curr = rotatedFaceVerts[i];
          const next = rotatedFaceVerts[(i + 1) % numV];
          nx += (curr[1] - next[1]) * (curr[2] + next[2]);
          ny += (curr[2] - next[2]) * (curr[0] + next[0]);
          nz += (curr[0] - next[0]) * (curr[1] + next[1]);
        }
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-6) {
          nx /= len;
          ny /= len;
          nz /= len;
        } else {
          nx = 0; ny = 0; nz = 1;
        }

        const shadeFactor = Math.max(0.4, Math.min(1.3, 0.8 + (nx * 0.15 + ny * 0.25 + nz * 0.35)));
        const faceColor = f.color || baseColor;
        const color = adjustColor(faceColor, shadeFactor);

        polygons.push({
          points: projectedPoints,
          color,
          depth,
        });
      });
    } else {
      // 1. Верхняя грань (Top, Z = z1)
      if (!isFaceOccluded(cubeIdx, 'top')) {
        const pTop0 = project(x0, y0, z1);
        const pTop1 = project(x1, y0, z1);
        const pTop2 = project(x1, y1, z1);
        const pTop3 = project(x0, y1, z1);
        const topColor = fc?.top ? adjustColor(fc.top, 1.25) : adjustColor(baseColor, 1.25);
        const topDepth = (ox + oy) + z1 * 0.01 + 0.001;
        polygons.push({
          points: [pTop0, pTop1, pTop2, pTop3],
          color: topColor,
          depth: topDepth,
        });
      }

      // 2. Передняя грань (Front / Y = y0)
      if (!isFaceOccluded(cubeIdx, 'front')) {
        const pFront0 = project(x0, y0, z0);
        const pFront1 = project(x1, y0, z0);
        const pFront2 = project(x1, y0, z1);
        const pFront3 = project(x0, y0, z1);
        const frontColor = fc?.front ? adjustColor(fc.front, 1.0) : adjustColor(baseColor, 1.0);
        const frontDepth = ((x0 + x1) / 2 + y0) + ((z0 + z1) / 2) * 0.01;
        polygons.push({
          points: [pFront0, pFront1, pFront2, pFront3],
          color: frontColor,
          depth: frontDepth,
        });
      }

      // 3. Правая грань (Right / X = x1)
      if (!isFaceOccluded(cubeIdx, 'right')) {
        const pRight0 = project(x1, y0, z0);
        const pRight1 = project(x1, y1, z0);
        const pRight2 = project(x1, y1, z1);
        const pRight3 = project(x1, y0, z1);
        const rightColor = fc?.right ? adjustColor(fc.right, 0.75) : adjustColor(baseColor, 0.75);
        const rightDepth = (x1 + (y0 + y1) / 2) + ((z0 + z1) / 2) * 0.01;
        polygons.push({
          points: [pRight0, pRight1, pRight2, pRight3],
          color: rightColor,
          depth: rightDepth,
        });
      }
    }
  });

  // Сортировка по глубине (от дальних к ближним: меньшая глубина отрисовывается первой)
  polygons.sort((a, b) => a.depth - b.depth);

  return polygons;
}

/**
 * Функция отрисовки PolyObjectModel на Canvas (например, для IsometricViewModal).
 */
export function drawPolyObjectIsometricCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  polyModel: PolyObjectModel,
  options?: {
    tileW?: number;
    tileH?: number;
    wallH?: number;
    scale?: number;
    rotation?: number;
  }
) {
  const polygons = getPolyModelIsometricPolygons(polyModel, options);
  if (polygons.length === 0) return;

  ctx.save();
  ctx.translate(cx, cy);

  polygons.forEach((poly) => {
    if (poly.points.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(poly.points[i].x, poly.points[i].y);
    }
    ctx.closePath();

    ctx.fillStyle = poly.color;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * React SVG компонент для иконки 3D модели.
 */
export interface PolyObjectIsometricIconProps {
  modelId?: string;
  model?: PolyObjectModel;
  className?: string;
  size?: number | string;
  style?: React.CSSProperties;
  yRotation?: number;
}

export const PolyObjectIsometricIcon: React.FC<PolyObjectIsometricIconProps> = ({
  modelId,
  model,
  className = "w-full h-full",
  size,
  style,
  yRotation,
}) => {
  const polyModel = model || (modelId ? getPolyModelById(modelId) : undefined) || REGISTERED_POLY_MODELS['chair'];

  if (!polyModel) return null;

  const polygons = getPolyModelIsometricPolygons(polyModel, {
    tileW: 32,
    tileH: 16,
    wallH: 22,
    scale: 1.0,
    rotation: 0,
    yRotation: yRotation,
  });

  let minX = -16, maxX = 16, minY = -24, maxY = 8;
  if (polygons.length > 0) {
    let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
    polygons.forEach((poly) => {
      poly.points.forEach((p) => {
        if (p.x < pMinX) pMinX = p.x;
        if (p.x > pMaxX) pMaxX = p.x;
        if (p.y < pMinY) pMinY = p.y;
        if (p.y > pMaxY) pMaxY = p.y;
      });
    });
    if (isFinite(pMinX) && isFinite(pMaxX) && isFinite(pMinY) && isFinite(pMaxY)) {
      const pad = 2.5;
      minX = pMinX - pad;
      maxX = pMaxX + pad;
      minY = pMinY - pad;
      maxY = pMaxY + pad;
    }
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const viewBox = `${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;

  return (
    <svg
      viewBox={viewBox}
      className={className}
      style={{ width: size, height: size, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(0, 0)">
        {polygons.map((poly, idx) => (
          <polygon
            key={idx}
            points={poly.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
            fill={poly.color}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="0.4"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  );
};
