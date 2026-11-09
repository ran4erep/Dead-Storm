
import React, { useEffect, useRef } from 'react';
import { Tile } from '../types';
import { processDoorAnimationStep } from '../utils/doorSystem';

export const useDoorSystem = (
  levelData: { grid: Tile[][] } | null,
  setLevelData: React.Dispatch<React.SetStateAction<any>>,
  onDoorStateChange?: (x: number, y: number, state: 'OPEN' | 'CLOSED') => void
) => {
  const requestRef = useRef<number>();
  const isAnimatingRef = useRef(false);
  const levelDataRef = useRef(levelData);

  useEffect(() => {
    levelDataRef.current = levelData;
    (window as any).isAnyDoorAnimating = false;
  }, [levelData]);

  useEffect(() => {
    if (!levelData || !levelData.grid) return;

    let hasAnimatingDoors = false;
    for (let y = 0; y < levelData.grid.length; y++) {
      const row = levelData.grid[y];
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        if (tile.type === 'DOOR' && tile.door) {
          if (tile.door.state === 'OPENING' || tile.door.state === 'CLOSING') {
            hasAnimatingDoors = true;
            break;
          }
        }
      }
      if (hasAnimatingDoors) break;
    }

    if (hasAnimatingDoors && !isAnimatingRef.current) {
        isAnimatingRef.current = true;
        (window as any).isAnyDoorAnimating = true;

        const update = () => {
            if (!levelDataRef.current) {
                isAnimatingRef.current = false;
                (window as any).isAnyDoorAnimating = false;
                return;
            }
            
            // Process door animation in-place to avoid React re-renders every frame
            const result = processDoorAnimationStep(levelDataRef.current.grid);
            if (!result || !result.changed) {
                isAnimatingRef.current = false;
                (window as any).isAnyDoorAnimating = false;
                return; 
            }

            // Wake up the raycaster rendering loop because a door is animating in-place
            window.dispatchEvent(new CustomEvent('raycaster-look'));

            // Only trigger a React re-render when a door finishes opening/closing (newlyTransitioned length > 0).
            // Raycaster picks up the in-place mutated properties (openAmount) without React renders.
            if (result.newlyTransitioned && result.newlyTransitioned.length > 0) {
                setLevelData((prev: any) => {
                    if (!prev) return null;
                    const newGrid = prev.grid.map((row: any) => [...row]);
                    let newGrids = prev.grids;
                    if (newGrids) {
                        newGrids = [...newGrids];
                        newGrids[0] = newGrid;
                    }
                    return { ...prev, grid: newGrid, grids: newGrids };
                });
                
                if (onDoorStateChange) {
                    result.newlyTransitioned.forEach(door => {
                        onDoorStateChange(door.x, door.y, door.state);
                    });
                }
            }

            requestRef.current = requestAnimationFrame(update);
        };

        requestRef.current = requestAnimationFrame(update);
    }

    return () => {
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = undefined;
        }
        isAnimatingRef.current = false;
    };
  }, [levelData, setLevelData]);

  useEffect(() => {
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        (window as any).isAnyDoorAnimating = false;
    };
  }, []);
};
