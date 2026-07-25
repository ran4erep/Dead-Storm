
import { LevelDefinition, InitialStateResponse, PlayerConfig } from '../types';
import { WORLD_MAP_PATHS } from '../data/levels';

import itemsData from '../data/items.json';
import enemiesData from '../data/enemies.json';
import npcsData from '../data/npcs.json';
import decorationsData from '../data/decorations.json';
import playerData from '../data/player.json';
import particlesData from '../data/particles.json';

export const fetchItemsDb = async () => {
    return itemsData;
};

export const fetchEnemiesDb = async () => {
    return enemiesData;
};

export const fetchNPCsDb = async () => {
    return npcsData;
};

export const fetchDecorationsDb = async () => {
    return decorationsData;
};

export const fetchParticlesDb = async () => {
    return particlesData;
};

const fetchPlayerConfig = async (): Promise<PlayerConfig | null> => {
    const customPlayer = localStorage.getItem("editor_test_player");
    if (customPlayer) {
        try {
            return JSON.parse(customPlayer) as PlayerConfig;
        } catch (e) {
            console.error(e);
        }
    }
    return playerData as PlayerConfig;
};

export const getInitialPlayerState = async (itemsDb: any): Promise<InitialStateResponse | null> => {
  const playerConfig = await fetchPlayerConfig();

  if (!playerConfig) return null;

  return {
    config: playerConfig
  };
};

export const getLevelData = async (levelIdx: number, sectorIdx: number): Promise<LevelDefinition | null> => {
  const levelGroup = WORLD_MAP_PATHS[levelIdx];
  if (!levelGroup) return null;

  const levelPaths = Array.isArray(levelGroup) ? levelGroup : (levelGroup.sectors || levelGroup.paths);
  if (!levelPaths) return null;

  const sectorPath = levelPaths[sectorIdx];
  if (!sectorPath) return null;

  return getLevelDataByPath(sectorPath);
};

export const getLevelDataByPath = async (path: string): Promise<LevelDefinition | null> => {
  const activeTestPath = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('active_test_path') : null;

  if (path === "CUSTOM_EDITOR_LEVEL" || (activeTestPath && path === activeTestPath)) {
      const data = localStorage.getItem("editor_test_level");
      if (data) {
          try {
              const editorLevel = JSON.parse(data);
              // Only override if requested CUSTOM_EDITOR_LEVEL directly OR if originalPath matches exactly
              if (path === "CUSTOM_EDITOR_LEVEL" || editorLevel.originalPath === path) {
                  return editorLevel;
              }
          } catch (e) {
              console.error(e);
          }
      }
      if (path === "CUSTOM_EDITOR_LEVEL") return null;
  }
  
  // If we are testing from the editor, dynamically swap in any currently opened tabs
  if (activeTestPath && typeof sessionStorage !== 'undefined') {
      const tabsJson = sessionStorage.getItem("editor_test_tabs");
      if (tabsJson) {
          try {
              const tabs = JSON.parse(tabsJson);
              const matchingTab = tabs.find((t: any) => (t.level && t.level.originalPath === path) || t.id === path);
              if (matchingTab) {
                  return { ...matchingTab.level, isEditorTest: Date.now() };
              }
          } catch (e) {
              console.error("Failed to parse editor tabs", e);
          }
      }
  }

  try {
    const response = await fetch(path);
    if (!response.ok) {
      console.error(`Failed to fetch level data from ${path}: ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    return data as LevelDefinition;
  } catch (error) {
    console.error("Error loading level JSON:", error);
    return null;
  }
};
