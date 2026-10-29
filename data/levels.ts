
export interface WorldMapLevel {
  name: string;
  sectors: string[];
}

export const WORLD_MAP_PATHS: any[] = [
  {
    name: "Level 1",
    sectors: [
      './data/levels/level1/sector1.json',
      './data/levels/level1/sector2.json',
      './data/levels/level1/sector3.json',
      './data/levels/level1/sector_scripts.json'
    ]
  },
  {
    name: "Tutorial",
    sectors: [
      './data/levels/level1/tutorial.json'
    ]
  },
  {
    name: "Tutorial NoWindows",
    sectors: [
      './data/levels/level1/tutorial_nowindows.json'
    ]
  }
];

export let START_SECTOR_PATH = './data/levels/level1/sector1.json';
export let TUTORIAL_SECTOR_PATH = './data/levels/level1/tutorial.json';

export function setStartSectorPath(newPath: string) {
  START_SECTOR_PATH = newPath;
}

export function setTutorialSectorPath(newPath: string) {
  TUTORIAL_SECTOR_PATH = newPath;
}

export interface SectorGroup {
  name: string;
  paths: string[];
}

export function getAllSectorPathsFromGlob(globSectors?: Record<string, any>): string[] {
  const pathsSet = new Set<string>();

  WORLD_MAP_PATHS.forEach((item: any) => {
    if (!item) return;
    const paths: string[] = Array.isArray(item) ? item : (item.sectors || item.paths || []);
    paths.forEach(path => {
      if (path) pathsSet.add(path);
    });
  });

  if (START_SECTOR_PATH) pathsSet.add(START_SECTOR_PATH);
  if (TUTORIAL_SECTOR_PATH) pathsSet.add(TUTORIAL_SECTOR_PATH);

  if (globSectors) {
    Object.keys(globSectors).forEach(key => {
      const stdPath = key.replace(/^(\.\.\/)+data\/levels\//, './data/levels/');
      pathsSet.add(stdPath);
    });
  }

  return Array.from(pathsSet);
}

export function getGroupedSectorsFromGlob(globSectors?: Record<string, any>): SectorGroup[] {
  const groups: SectorGroup[] = [];
  const claimedPaths = new Set<string>();

  WORLD_MAP_PATHS.forEach((item: any, idx: number) => {
    if (!item) return;
    const rawPaths: string[] = Array.isArray(item) ? item : (item.sectors || item.paths || []);
    const groupName = (!Array.isArray(item) && item.name) ? item.name : `Level ${idx + 1}`;

    const groupPaths: string[] = [];
    rawPaths.forEach(path => {
      if (path) {
        groupPaths.push(path);
        claimedPaths.add(path);
      }
    });

    groups.push({
      name: groupName,
      paths: groupPaths,
    });
  });

  if (globSectors) {
    const otherPaths: string[] = [];
    Object.keys(globSectors).forEach(key => {
      const stdPath = key.replace(/^(\.\.\/)+data\/levels\//, './data/levels/');
      if (!claimedPaths.has(stdPath)) {
        otherPaths.push(stdPath);
        claimedPaths.add(stdPath);
      }
    });
    if (otherPaths.length > 0) {
      groups.push({
        name: 'Other Sectors',
        paths: otherPaths,
      });
    }
  }

  return groups;
}

