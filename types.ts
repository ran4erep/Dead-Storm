
export const ACCESSORY_TYPES = ['ACCESSORY', 'FLASHLIGHT'];

export interface GameStrings {
  ui: {
    loading: {
      connection: string;
      init: string;
      items_db: string;
      gear: string;
      geometry: string;
      textures: string;
      sprites: string;
      sounds: string;
      level_load: string;
      error_book: string;
      tap_to_continue: string;
      music: string;
      fetching_data?: string;
      parsing_geometry?: string;
      creating_caches?: string;
      system_ready?: string;
    };
    header: {
      status: string;
      level: string; 
      objective: string;
      weapon: string;
      damage: string;
      loading_title: string;
      fists: string;
    };
    menu: {
      title: string;
      btn_start: string;
      btn_settings: string;
      btn_about?: string;
      audio_prompt: string;
      audio_yes: string;
      audio_no: string;
    };
    save_load?: {
      title_save: string;
      title_load: string;
      slot: string;
      empty: string;
      lvl: string;
      btn_save: string;
      btn_load: string;
      saved_success: string;
      loaded_success: string;
      save_error: string;
      load_error: string;
    };
    char_select: {
      title: string;
      btn_select: string;
      male_name: string;
      female_name: string;
      male_name_short?: string;
      female_name_short?: string;
    };
    credits?: {
      title: string;
      btn_back: string;
    };
    settings: {
      title: string;
      general: string;
      vibration: string;
      language: string;
      fullscreen: string;
      audio_title: string;
      volume_master: string;
      volume_music: string;
      volume_sound: string;
      volume_voice: string; // NEW
      debug: string;
      debug_textures: string;
      debug_textures_desc: string; // NEW
      debug_godmode: string;
      debug_godmode_desc: string; // NEW
      debug_timer: string;
      debug_timer_desc: string; // NEW
      debug_fps: string;
      debug_fps_desc: string; // NEW
      debug_voice: string; // ADDED
      debug_voice_desc: string; // ADDED
      debug_levelup: string; // NEW
      debug_ai: string; // NEW AI
      debug_ai_desc: string; // NEW AI
      debug_ai_viz: string; // NEW AI
      debug_ai_viz_desc: string; // NEW AI
      debug_pit_line_vis?: string;
      debug_pit_line_vis_desc?: string;
      debug_noclip?: string;
      debug_noclip_desc?: string;
      debug_forcesoft?: string;
      debug_forcesoft_desc?: string;
      debug_map_btn?: string; // NEW
      debug_lightning_5s?: string;
      debug_lightning_5s_desc?: string;
      debug_disable_shadows?: string;
      debug_disable_shadows_desc?: string;
      debug_disable_distance_shading?: string;
      debug_disable_distance_shading_desc?: string;
      resolution: string; // NEW
      resolution_low: string; // NEW
      resolution_medium: string; // NEW
      resolution_high: string; // NEW
      resolution_custom: string; // NEW
      render_distance?: string; // NEW
      crt_effect: string;
      viewport_smoothing?: string; // NEW
      texture_filtering?: string; // NEW
      invert_context_buttons?: string; // NEW
      invert_context_buttons_desc?: string; // NEW
      reset?: string; // NEW
      on: string;
      off: string;
      controls?: string;
      controls_desc?: string;
      ctrl_move_forward?: string;
      ctrl_move_backward?: string;
      ctrl_turn_left?: string;
      ctrl_turn_right?: string;
      ctrl_strafe_left?: string;
      ctrl_strafe_right?: string;
      ctrl_interact?: string;
      ctrl_shoot?: string;
      ctrl_reload?: string;
      ctrl_inventory?: string;
      ctrl_stats?: string;
      ctrl_equip?: string;
      ctrl_skip?: string;
      ctrl_look?: string;
      press_key?: string;
      ctrl_gp_left_context?: string;
      ctrl_gp_right_context?: string;
      ctrl_gp_toggle_aiming?: string;
      ctrl_gp_sector_details?: string;
      btn_close: string;
      btn_back?: string;
    };
    pause: {
      title: string;
      btn_resume: string;
      btn_settings: string;
      btn_return_editor?: string;
      btn_quit: string;
    };
    modal: {
      close: string;
      next?: string;
      back?: string;
      objective_title: string;
      no_data: string;
      intel_title: string; 
      actions_title: string;
      objective_label: string; 
      tap_to_close: string; 
    };
    controls: {
      btn_look_around?: string;
      btn_crafting?: string;
      btn_shoot_dummy: string; 
      btn_action: string; 
      btn_open?: string;
      btn_close_door?: string;
      btn_pickup?: string;
      btn_reload: string; 
      btn_strafe: string; 
      btn_attack: string; 
      btn_throw: string;
      btn_cancel: string; 
      btn_prev: string; 
      btn_next: string; 
      btn_hide_map?: string;
      btn_hide_radio?: string;
      btn_talk?: string;
      btn_inspect?: string;
      btn_skip?: string; // NEW
      btn_zoom_in?: string; // NEW
      btn_zoom_out?: string; // NEW
    };
    victory: {
      title: string;
      subtitle: string;
      button: string;
    };
    game_over: {
      title: string;
      title_script?: string;
      subtitle: string;
      button: string;
      btn_editor?: string;
      btn_load?: string;
    };
  };
  inventory: {
    title: string;
    loot_title: string;
    empty: string;
    container_empty?: string;
    equipped: string;
    damage_short: string;
    throw_damage_short: string;
    heal_short: string;
    accuracy: string; 
    protection_short: string;
    btn_equip: string;
    btn_unequip: string;
    btn_throw: string;
    btn_use: string;
    btn_read?: string;
    btn_close: string;
    btn_unload: string; // NEW
    btn_turn_on?: string; // NEW
    btn_turn_off?: string; // NEW
    full_health: string; 
    btn_info: string; 
    range: string; 
    details_title: string; 
    type_label: string; 
    capacity: string;
    quantity_label: string;
    weight_label?: string;
    charge_label?: string;
    blast_damage: string; // NEW
    durability: string; // NEW
    select_battery_title?: string;
    no_batteries_msg?: string;
    btn_cancel?: string;
  };
  equipment: {
    title: string;
    primary_weapon: string;
    helmet: string;
    vest: string;
    pants: string;
    boots: string;
    no_weapon: string;
    available_gear: string;
    btn_equip: string;
    btn_unequip: string;
    btn_throw: string;
    btn_close: string;
    btn_unload: string; // NEW
    status_equipped: string;
    damage_full: string;
    charge_label?: string; // NEW
    weight_label?: string; // NEW
    protection_full: string;
    total_armor: string;
    capacity: string;
    throw_damage_short: string;
    accuracy: string;
    range: string;
    details_title: string;
    accessory1: string; // NEW
    accessory2: string; // NEW
    accessory_filter?: string; // NEW
    no_items?: string; // NEW
    durability: string; // NEW
  };
  stats: {
    title: string;
    available_points: string;
    level_label: string; // ADDED
    str: string;
    str_desc: string;
    agi: string;
    agi_desc: string;
    spd: string;
    spd_desc: string;
    vit: string;
    vit_desc: string;
    btn_confirm: string;
  };
  combat: {
    target_lost: string;
    btn_fire: string;
    btn_reload: string;
    btn_escape: string;
    btn_run: string; 
    btn_cancel?: string;
    hit: string;
    armor_hit?: string;
    crit: string;
    miss: string;
    reload_success: string;
    reload_fail: string;
    escape_success: string;
    escape_fail_msg: string;
    enemy_turn: string;
    enemy_turn_plural: string; 
    nowhere_to_run: string;
    timeout: string;
    dist_unit_1: string;
    dist_unit_2_4: string;
    dist_unit_5_plus: string;
    out_of_range: string;
    status_stunned?: string;
  };
  logs: {
    system_load: string;
    level_up_ui?: string;
    item_broken?: string;
    item_almost_broken?: string;
    objective: string;
    wall_hit: string;
    ladder_needed?: string;
    blocking: string;
    door_hit: string;
    door_locked: string;
    door_closed_message?: string;
    door_locked_electronic?: string;
    door_unlocked_electronic?: string;
    door_open: string;
    door_close: string;
    door_blocked_player: string;
    door_blocked_enemy: string;
    door_blocked_items: string;
    door_blocked_item_single: string;
    door_blocked_corpse: string;
    door_unlocked: string;
    key_needed: string;
    item_found: string;
    item_in_front: string;
    multiple_items_in_front: string;
    item_under_feet: string;
    decor_found: string;
    evac_found: string;
    exit_blocked_combat: string;
    nothing_here: string;
    no_actions?: string;
    picked_up: string;
    picked_up_cash?: string;
    combat_start: string;
    combat_multiple: string;
    combat_join?: string; // NEW
    attack_hit: string;
    armor_broken?: string;
    attack_crit: string;
    attack_crit_fail: string;
    attack_miss: string;
    glass_broken: string;
    enemy_destroyed: string;
    enemy_hit: string;
    enemy_miss: string;
    enemy_hit_armor?: string;
    evaded: string; 
    npc_attacked: string;
    npc_evaded: string;
    npc_miss: string;
    equipped: string;
    used_heal: string;
    escape_success: string;
    escape_fail: string;
    escape_blocked: string; 
    data_error: string;
    system_fail: string;
    too_far: string; 
    no_targets: string; 
    xp_gain: string; 
    level_up: string; 
    enemy_approaches: string;
    inventory_full: string;
    unequip_fail_space: string;
    unequip_drop: string;
    reload: string; 
    reload_fail: string;
    reload_not_required: string;
    no_ammo_spare: string;
    item_thrown: string;
    throw_blocked?: string;
    throw_hit: string;
    explosion_hit_player: string; // NEW
    c4_wall_only?: string;
    c4_wall_indestructible?: string;
    c4_already_planted?: string;
    c4_planted?: string;
    skip_turn?: string; // NEW
    enemy_drop?: string; // ADDED
    unload_success?: string; // NEW
    unload_empty?: string; // NEW
    effect_applied?: string; // NEW
    effect_expired?: string; // NEW
    effect_damage?: string; // NEW
    effect_heal?: string; // NEW
    battery_inserted?: string;
    battery_extracted?: string;
    no_devices_for_battery?: string;
    no_battery_in_inventory?: string;
  };
  keypad?: {
    gamepad_instructions: string;
  };
  initial_items: {
    knife: { name: string; desc: string };
    pistol: { name: string; desc: string };
    medkit: { name: string; desc: string };
  };
}

export interface ToastItem {
  id: number;
  message: string;
  isExiting?: boolean;
}

export enum GameState {
  START_SCREEN = 'START_SCREEN',
  MENU = 'MENU',
  CHAR_SELECT = 'CHAR_SELECT',
  PLAYING = 'PLAYING',
  COMBAT = 'COMBAT',
  MAP_VIEW = 'MAP_VIEW',
  RADIO_VIEW = 'RADIO_VIEW',
  CONSOLE_VIEW = 'CONSOLE_VIEW',
  AIMING = 'AIMING',
  THROWING = 'THROWING',
  INSPECTING = 'INSPECTING',
  DIALOGUE = 'DIALOGUE',
  LOOKING_AROUND = 'LOOKING_AROUND',
  VICTORY = 'VICTORY',
  GAME_OVER = 'GAME_OVER',
  CREDITS = 'CREDITS',
  DYING = 'DYING',
  FALLING = 'FALLING',
  EDITOR = 'EDITOR'
}

export type EquipSlot = 'helmet' | 'vest' | 'weapon' | 'weaponAkimbo' | 'pants' | 'boots' | 'accessory1' | 'accessory2';

export interface AnimationFrame {
    id?: string;
    duration: number;
    x: number;
    y: number;
    scale?: number;
}

export interface AnimationDefinition {
    fps: number;
    repeat?: boolean;
    randomRepeat?: string;
    frames: string[];
    scale?: number;
    centered?: boolean;
}

export type AnimationConfig = Record<string, AnimationDefinition>;
export type AssetId = string;

export interface VoiceConfig {
  pitch?: number;
  rate?: number;
  volume?: number;
  resonance?: number;
  waveform?: 'sawtooth' | 'square' | 'sine' | 'triangle';
}

export interface Item {
  id: string;
  definitionId?: string;
  type: 'WEAPON' | 'ARMOR' | 'CONSUMABLE' | 'KEY' | 'AMMO' | 'MAP' | 'GRENADE' | 'MISC' | 'FLASHLIGHT' | 'C4' | 'CASH' | 'MOLOTOV' | 'FLASHBANG' | 'COMPASS' | 'RADIO' | 'BATTERY' | 'NOTE' | 'CONTAINER' | 'CONSOLE' | 'DIGITAL_MAP' | 'MATERIAL' | 'CARTRIDGE' | 'FLARE';
  name: string;
  description: string;
  gameName?: string;
  canBeInspected?: boolean;
  noShadow?: boolean;
  text?: string;
  textScale?: number;
  textOffsetX?: number;
  textOffsetY?: number;
  assetId: string;
  symbol?: string;
  blocking?: boolean;
  isActive?: boolean; // NEW: For toggleable items like flashlight
  powerSource?: string; // NEW: ID of the power source item (e.g. 'battery')
  equip?: 'NONE' | 'WEAPON' | 'HEAD' | 'BODY' | 'LEGS' | 'FEET' | 'ACCESSORY';
  
  loot?: any[];
  openedAssetId?: string;
  isOpened?: boolean;
  openSound?: string;
  
  maxDurability?: number;
  durability?: number;
  valuable?: string | number;
  price?: number;
  dischargeRate?: number;
  dischargeCounter?: number;
  charge?: number; // NEW
  hasBattery?: boolean; // NEW
  gameSound?: string; // NEW: sound for minigames

  healDice?: string;
  damageDice?: string;
  throwDamage?: string;
  protection?: number;
  accuracy?: number;
  range?: number;
  knockbackChance?: number; 
  
  count?: number;
  maxStack?: number; 
  inventorySlots?: number;
  weight?: number;
  slot?: EquipSlot;
  
  currentAmmo?: number;
  magazineMax?: number;
  ammoType?: string;
  loseAmmoOnReload?: boolean;
  ejectAllOnReload?: boolean;
  shootType?: 'default' | 'shotgun' | 'auto' | 'rifle';
  attackAssetId?: string;
  attackFemaleAssetId?: string;
  attackAnimation?: AnimationFrame[];
  muzzleFlash?: boolean;
  muzzleAsset?: string;
  muzzleFemaleAsset?: string;
  muzzleFrame?: number;
  vibrationPattern?: number | number[]; 
  
  timer?: number;
  explosionRange?: number;
  wallAssetId?: string;
  fireObjectId?: string;
  spreadsLeft?: number;
  spreadChance?: number;
  glassTextureId?: string;
  
  throwId?: string;
  placedAsThrown?: boolean;
  isLit?: boolean;
  mirroredThrow?: number;
  activeTimer?: number;

  flareColor?: { r: number; g: number; b: number } | string;
  flareDuration?: number;
  flareRadius?: number;
  flareBrightness?: number;
  smokeColor?: string | { r: number; g: number; b: number };
  burntAssetId?: string;

  handAssetId?: string;
  handFemaleAssetId?: string;
  consoleAssets?: {
    up: string;
    down: string;
    left: string;
    right: string;
    action?: string;
    upFemale?: string;
    downFemale?: string;
    leftFemale?: string;
    rightFemale?: string;
    actionFemale?: string;
  };
  maskAssetId?: string;
  maskFemaleAssetId?: string;
  dollAssetId?: string;
  handScale?: number;
  handOffset?: { x: number, y: number };
  drawScale?: number;
  zIndex?: number;
  maleOffsetX?: number;
  maleOffsetY?: number;
  femaleOffsetX?: number;
  femaleOffsetY?: number;
  scale?: number;
  yOffset?: number;

  boundLevelPath?: string;
  keyId?: string;

  rawName?: string;
  rawDescription?: string;

  sounds?: {
    use?: string;
    equip?: string;
    reload?: string;
    attack?: string;
    prime?: string;
    casing?: string;
  };

  casingAsset?: string;
  casingScale?: number;
  casingGroundScaleMultiplier?: number;
  casingSpawnPoint?: { x: number, y: number };
  casingDirection?: 'left' | 'right';

  akimbo?: boolean;

  onUseEffect?: {
      id: string;
      chance: number; // 0-100
  };
  cannotDrop?: boolean;
  combo?: string[];
  shakeIntensity?: number;
  shakeDuration?: number;
}

export interface PlayerEquipment {
  weapon: Item | null;
  weaponAkimbo: Item | null;
  helmet: Item | null;
  vest: Item | null;
  pants: Item | null;
  boots: Item | null;
  accessory1: Item | null;
  accessory2: Item | null;
}

export interface PlayerStats {
  str: number;
  agi: number;
  spd: number;
  vit: number;
}

export interface ActiveEffect {
    id: string;
    duration: number; // Turns remaining
    definitionId: string;
}

export interface Player {
  characterId: 'male' | 'female';
  hp: number;
  maxHp: number;
  xp: number;
  maxXp: number;
  level: number;
  availablePoints: number;
  stats: PlayerStats;
  inventory: Item[];
  equipment: PlayerEquipment;
  equippedWeapon: Item | null;
  pos: { x: number; y: number };
  dir: number;
  dir360: number;
  sounds: {
      damage?: string;
      death?: string;
      deathFemale?: string;
      bodyHit?: string;
      step?: string;
  };
  voice?: VoiceConfig;
  activeEffects: ActiveEffect[];
  concussionLevel?: number;
  flashDuration?: number;
  portraits?: any;
  merchantBoughtStock?: Record<string, Record<string, number>>;
  keptItems?: Item[];
  craftedRecipes?: string[];
}

export interface LootEntry {
    id: string;
    chanceToDrop: number; // 0-100%
    min?: number;
    max?: number;
}

export interface Enemy {
  id: string;
  definitionId?: string;
  name: string;
  rawName?: string;
  hp: number;
  maxHp: number;
  damageDice: string;
  accuracy: number;
  attackRange: number;
  description: string;
  canBeInspected?: boolean;
  canBeKilled?: boolean;
  noShadow?: boolean;
  x?: number;
  y?: number;
  talkRange?: number;
  rawDescription?: string;
  assets: {
      map: { assetId: string, scale: number };
      dead?: { assetId: string, scale: number };
      portrait?: { assetId: string, scale: number };
      dialogue_portrait?: { assetId: string, scale: number };
      attack?: { assetId: string, scale: number };
      distanceAttack?: { assetId: string, scale: number };
      hands_up?: { assetId: string, scale: number };
      gibMask?: string;
  };
  baseXP: number;
  muzzleFlash?: boolean;
  casing?: {
      assetId: string;
      direction: 'left' | 'right';
      scale?: number;
      groundScaleMultiplier?: number;
  };
  gibCounts?: { head?: number, body?: number, arms?: number, legs?: number };
  sounds?: {
      attack?: string;
      damage?: string;
      death?: string;
      casing?: string;
      armorHit?: string;
      roam?: string;
      roamPeriodicity?: string;
      step?: string;
  };
  loot?: LootEntry[];
  onHitEffect?: {
      id: string;
      chance: number; // 0-100
  };
  // AI Params
  movementType?: 'patroling' | 'roaming';
  patrolRange?: number;
  armor?: number;
  brokenArmor?: number[];
  // AI Runtime State
  homePos?: { x: number, y: number };
  targetPos?: { x: number, y: number };
  currentPath?: { x: number, y: number }[];
  aiState?: 'IDLE' | 'PATROL' | 'CHASE' | 'COMBAT' | 'INVESTIGATE' | 'FLASHED' | 'SCRIPT_MOVE' | 'NPC_FOLLOW'; // Added for debug, flashbang, and script follow
  followMode?: 'NPC_FOLLOWS_PLAYER' | 'PLAYER_FOLLOWS_NPC' | 'STOP';
  followMaxDistance?: number;
  originalAiState?: 'IDLE' | 'PATROL' | 'CHASE' | 'COMBAT' | 'INVESTIGATE' | 'FLASHED';
  originalMovementType?: 'patroling' | 'roaming';
  originalHomePos?: { x: number, y: number };
  blockedTurns?: number;
  investigateTurns?: number;
  speed?: number;
  dialogueId?: string;
  voice?: VoiceConfig;
  isNPC?: boolean;
  tradeItems?: { id: string; price: number; count?: number; }[];
  keepPrice?: number;
  flashDuration?: number;
  canOpenDoors?: boolean;
}



export interface FaceTextureTransform {
    scaleU?: number;      // Scale / tile width multiplier (default 1.0)
    scaleV?: number;      // Scale / tile height multiplier (default 1.0)
    offsetU?: number;     // Offset U / horizontal shift (-2.0..2.0, default 0)
    offsetV?: number;     // Offset V / vertical shift (-2.0..2.0, default 0)
    rotation?: number;    // Texture rotation angle in degrees (0..360, default 0)
    flipU?: boolean;      // Flip horizontally
    flipV?: boolean;      // Flip vertically
}

export interface TextureLayer {
    id: string;
    textureId: string;
    name?: string;
    transform?: FaceTextureTransform;
    opacity?: number;          // 0.0 to 1.0 (default 1.0)
    blendMode?: GlobalCompositeOperation; // 'source-over', 'multiply', 'screen', 'overlay', etc.
    enabled?: boolean;         // Default true
}

export interface PolyCustomFace {
    vertices: number[];
    color?: string | [number, number, number];
    textureId?: string;
    textureTransform?: FaceTextureTransform;
    textureLayers?: TextureLayer[];
    isInner?: boolean;
    name?: string;
}

export interface PolyObjectCube {
    shape?: 'cube' | 'cylinder' | 'flat_square' | 'flat_circle' | 'sphere' | string;
    offset: [number, number, number];
    size: [number, number, number];
    color?: string | [number, number, number];
    faceColors?: {
        top?: string | [number, number, number];
        bottom?: string | [number, number, number];
        front?: string | [number, number, number];
        back?: string | [number, number, number];
        left?: string | [number, number, number];
        right?: string | [number, number, number];
    };
    textureId?: string;
    faceTextures?: {
        top?: string;
        bottom?: string;
        front?: string;
        back?: string;
        left?: string;
        right?: string;
    };
    textureTransform?: FaceTextureTransform;
    faceTransforms?: {
        top?: FaceTextureTransform;
        bottom?: FaceTextureTransform;
        front?: FaceTextureTransform;
        back?: FaceTextureTransform;
        left?: FaceTextureTransform;
        right?: FaceTextureTransform;
    };
    textureLayers?: TextureLayer[];
    faceTextureLayers?: {
        top?: TextureLayer[];
        bottom?: TextureLayer[];
        front?: TextureLayer[];
        back?: TextureLayer[];
        left?: TextureLayer[];
        right?: TextureLayer[];
    };
    vertices?: [number, number, number][];
    customFaces?: PolyCustomFace[];
}

export interface PolyObjectModel {
    id: string;
    name?: string;
    cubes: PolyObjectCube[];
}

export interface Decoration {
    id: string;
    name: string;
    rawName?: string;
    description: string;
    rawDescription?: string;
    assetId: string;
    blocking: boolean;
    scale?: number;
    yOffset?: number;
    destructable?: boolean;
    hp?: number;
    maxHp?: number;
    destroyedAssetId?: string;
    explode?: boolean;
    explodeSound?: string;
    walkableWhenDestroyed?: boolean;
    deadScale?: number;
    destructionSoundId?: string;
    explosion_damage?: string;
    isWorkbench?: boolean;
    damaging?: boolean;
    damageDice?: string;
    noBleeding?: boolean;
    lifeTime?: number;
    foreground?: boolean;
    soundId?: string;
    light?: { r: number; g: number; b: number; intensity?: number; range?: number; mode?: 'STATIC' | 'FLICKERING' | 'FIRE'; flickerPeriod?: string | number; flickerAlwaysOn?: boolean; };
    isEmptyness?: boolean;
    isBox?: boolean;
    boxSize?: number;
    polyModelId?: string;
    polyModel?: PolyObjectModel;
    moveSound?: string;
    fallSound?: string;
    stepSound?: string;
    canBeInspected?: boolean;
    noShadow?: boolean;
    type?: 'LADDER' | 'KEYPAD' | string;
    ladderSound?: string;
    targetId?: string;
    password?: string;
    sounds?: string[];
    panelAsset?: string;
    panelMaskAsset?: string;
    panelPlacedAt?: 'N' | 'E' | 'S' | 'W' | string;
    keypadAssetId?: string;
    keypadMaskAssetId?: string;
    keypadSound?: string;
    keypadSuccessSound?: string;
    keypadFailSound?: string;
    spriteFacing?: 'right' | 'left';
    yRotation?: number;
    facing?: 'N' | 'E' | 'S' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | number;
    autoMirror?: boolean;
    isMirrored?: boolean;
    renderMode?: 'billboard' | 'mesh' | 'polyObject';
    wallSide?: 'N' | 'S' | 'E' | 'W' | 'TOP' | 'BOTTOM';
    meshAxis?: 'NS' | 'WE' | 'AUTO' | 'Y';
    meshOffset?: number;
    meshWidth?: number;
    preserveAspect?: boolean;
}

export interface Tile {
  x: number;
  y: number;
  type: 'FLOOR' | 'WALL' | 'DOOR' | 'PORTAL';
  isWindow?: boolean;
  textureId?: string;
  blocking?: boolean;
  description: string;
  height?: number;
  elevation?: number;
  isExplored: boolean;
  items?: Item[];
  enemyId?: string;
  pitDecoration?: Decoration;
  decorations?: Decoration[];
  decoration?: Decoration;
  door?: {
      id?: string;
      type: 'HINGE' | 'SLIDE' | 'LIFT';
      dir?: 'LEFT' | 'RIGHT';
      edge?: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'AUTO';
      state: 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING';
      openAmount: number;
      keyId?: string;
      textureId?: string; 
      maskId?: string; // NEW
      broken?: boolean; // NEW
      isLocked?: boolean;
      closed?: boolean;
      openSound?: string;
      closeSound?: string;
      isOpenedAtStart?: boolean;
      nonInteractable?: boolean;
      progress?: number;
      lastUpdate?: number;
  };
  portal?: {
      destination?: string;
      assetId?: string;
      portalId: string;
      targetPortalId?: string;
      targetDirection?: 'N' | 'E' | 'S' | 'W';
  };
  corpses?: {
      assetId: string;
      scale: number;
      bloodStartTime: number;
      offset?: { x: number, y: number };
      isCharred?: boolean;
      burntTime?: number;
      name?: string;
  }[];
  floorAssetId?: string;
  isWater?: boolean;
  ladder?: boolean;
  assetId?: string;
  footstepSound?: string;
  fallSound?: string;
  bottomTextureId?: string; 
  topTextureId?: string; 
  topTextureRotation?: number; 
  mirror?: boolean;
  maskId?: string;
  maskTargetAsset?: string;
  mirrorOpacity?: number;
  faces?: Partial<Record<'N' | 'E' | 'S' | 'W', string>>;
  explosive?: {
      id: string;
      timer: number;
      damageDice: string;
      range: number;
      assetId: string;
      side?: 'N' | 'E' | 'S' | 'W';
      explosionId?: string;
      plantedByPos?: { x: number, y: number };
  };
  canBeDestroyed?: boolean;
  keylock?: boolean;
  keypadDirection?: 'N' | 'E' | 'S' | 'W';
  keypadAssetId?: string;
  keypadMaskAssetId?: string;
  keypadSound?: string;
  keypadSuccessSound?: string;
  keypadFailSound?: string;
  targetId?: string;
  password?: string;
  glassAssetId?: string;
  glassTransparency?: number;
  glassOffset?: number;
  isGlassBroken?: boolean;
  isMirrorBroken?: boolean;
  glassBreakSound?: string;
  thickness?: number;
  offset?: number;
  cutoutAxis?: 'NS' | 'WE' | 'AUTO';
  cutout?: { topLeft: {x:number, y:number}, bottomRight: {x:number, y:number} };
  light?: { r: number; g: number; b: number; intensity?: number; range?: number; mode?: 'STATIC' | 'FLICKERING' | 'FIRE'; flickerPeriod?: string | number; flickerAlwaysOn?: boolean; };
}

export interface KeyboardControlsSettings {
  moveForward: string;
  moveBackward: string;
  turnLeft: string;
  turnRight: string;
  strafeLeft: string;
  strafeRight: string;
  interact: string;
  shoot: string;
  reload: string;
  inventory: string;
  statsMenu: string;
  equipMenu: string;
  skipTurn: string;
  toggleLook: string;
}

export interface GamepadControlsSettings {
  moveForward: string | number;
  moveBackward: string | number;
  turnLeft: string | number;
  turnRight: string | number;
  strafeLeft: string | number;
  strafeRight: string | number;
  leftContext: string | number;
  rightContext: string | number;
  statsMenu?: string | number;
  equipMenu?: string | number;
  inventory?: string | number;
  pauseMenu?: string | number;
  interact?: string | number;
  skipTurn?: string | number;
  reload?: string | number;
  toggleAiming?: string | number;
  sectorDetails?: string | number;
  toggleLook?: string | number;
}

export interface Settings {
  language: 'en' | 'ru';
  vibration: boolean;
  fullscreen: boolean;
  resolution: 'LOW' | 'MEDIUM' | 'HIGH' | 'CUSTOM';
  customResolutionScale?: number;
  renderDistance: number; // NEW
  crtEffect: boolean;
  lcdGhosting?: boolean; // NEW
  viewportSmoothing?: boolean; // NEW
  textureFiltering?: boolean; // NEW
  controlType?: 'keyboard' | 'gamepad'; // NEW
  invertContextButtons?: boolean; // NEW
  volume: {
    master: number;
    music: number;
    sound: number;
    voice: number;
  };
  debug: {
    textures: boolean;
    godMode: boolean;
    combatTimer: boolean;
    showFps: boolean;
    voiceDebug?: boolean; // ADDED
    aiEnabled: boolean; // NEW
    aiDebug: boolean; // NEW
    pitLineVis?: boolean;
    noclip?: boolean;
    forceSoftRenderer?: boolean;
    combatOverlayDebug?: boolean;
    lightning5s?: boolean;
    magentaShadows?: boolean;
    disableShadows?: boolean;
    disableDistanceShading?: boolean;
  };
  controls: KeyboardControlsSettings;
  gamepadControls?: GamepadControlsSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  language: (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('ru')) ? 'ru' : 'en',
  vibration: true,
  fullscreen: false,
  resolution: 'HIGH',
  controlType: 'keyboard',
  customResolutionScale: 1.0,
  renderDistance: 15,
  crtEffect: true,
  lcdGhosting: true,
  viewportSmoothing: false,
  textureFiltering: false,
  invertContextButtons: false,
  volume: { master: 100, music: 90, sound: 100, voice: 100 },
  debug: {
    textures: true,
    godMode: false,
    combatTimer: true,
    showFps: false,
    voiceDebug: false,
    aiEnabled: true,
    aiDebug: false,
    pitLineVis: false,
    noclip: false,
    forceSoftRenderer: false,
    combatOverlayDebug: false,
    lightning5s: false,
    magentaShadows: false,
    disableShadows: false,
    disableDistanceShading: false,
  },
  controls: {
    moveForward: 'KeyW',
    moveBackward: 'KeyS',
    turnLeft: 'KeyA',
    turnRight: 'KeyD',
    strafeLeft: 'KeyQ',
    strafeRight: 'KeyE',
    interact: 'Space',
    shoot: 'KeyF',
    reload: 'KeyR',
    inventory: 'Tab',
    statsMenu: 'Digit1',
    equipMenu: 'Digit2',
    skipTurn: 'ShiftLeft',
    toggleLook: 'KeyC',
  },
  gamepadControls: {
    moveForward: 'axis_1_neg',
    moveBackward: 'axis_1_pos',
    turnLeft: 'axis_0_neg',
    turnRight: 'axis_0_pos',
    strafeLeft: 4,
    strafeRight: 5,
    leftContext: 6,
    rightContext: 7,
    statsMenu: 14,
    equipMenu: 12,
    inventory: 15,
    pauseMenu: 9,
    interact: 0,
    skipTurn: 2,
    reload: 3,
    toggleAiming: 1,
    sectorDetails: 13,
    toggleLook: 11,
  }
};

export interface LevelTask {
  id: string;
  descriptionKey: string;
  status: 'HIDDEN' | 'ACTIVE' | 'COMPLETED';
}

export interface AmbientSoundDef {
    symbol?: string; // e.g. "a", "b", "c"
    id: string;
    x?: number; // fallback/legacy
    y?: number; // fallback/legacy
    minInterval: number; // In milliseconds
    maxInterval: number; // In milliseconds
    volume?: number;
    radius?: number; // Max distance sound can be heard
    loop?: boolean;
    nonPositional?: boolean;
}

export interface ParticleDefinition {
    id: string;
    name: string;
    colors?: string[];
    startSize: number;
    sizeGrowth?: number;
    life: number;
    maxLife: number;
    speedXMin: number;
    speedXMax: number;
    speedYMin: number;
    speedYMax: number;
    speedZMin?: number;
    speedZMax?: number;
    gravity: number;
    friction?: number;
    textureId?: string;
    spriteId?: string;
    spawnRate?: number; // particles per second
    burst?: number;
    zOffset?: number;
}

export interface SectorParticle {
    id: string; // Unique instance id
    definitionId: string;
    x: number;
    y: number;
    z?: number;
}

export interface LevelDefinition {
    fileName?: string;
    locationName: string;
    locationDescription: string;
    objective: string;
    tasks?: LevelTask[];
    ceilingType?: 'INDOOR' | 'OUTDOOR';
    ceilingTextureId?: string;
    skyboxTextureId?: string;
    weather?: 'none' | 'rain' | 'fog';
    fogColor?: string;
    fogDistance?: number;
    soundtrack?: string;
    ambientSounds?: AmbientSoundDef[];
    grid?: string[]; 
    grids?: string[][]; 
    entities?: string[][]; // NEW
    itemsGrid?: string[][]; // NEW: Items placed separately from entities
    gridSounds?: string[][]; // NEW: For placing ambient sounds
    particles?: SectorParticle[]; // NEW: Placed particle emitters
    triggers?: ScriptTrigger[];
    legend: { char: string; description: string }[];
    gridLight?: string[];
    globalLight?: number;
    lightDefinitions?: {
        [char: string]: { r: number; g: number; b: number; intensity?: number; range?: number; mode?: 'STATIC' | 'FLICKERING' | 'FIRE'; flickerPeriod?: string | number; flickerAlwaysOn?: boolean; maxHeight?: number; };
    };
    entityOverrides?: {
        [coordKey: string]: any;
    };
    items?: any[];
    enemies?: any[];
    NPCs?: any[];
    decorations?: any[];
    doorDefinitions?: {
        [char: string]: { type: 'HINGE' | 'SLIDE' | 'LIFT'; dir?: 'LEFT' | 'RIGHT'; edge?: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'AUTO'; keyId?: string; textureId?: string; maskId?: string; id?: string; isLocked?: boolean; openSound?: string; closeSound?: string; isOpenedAtStart?: boolean; nonInteractable?: boolean; };
    };
    construction?: { symbol: string; type?: 'floor' | 'wall' | 'window'; assetId: string; floorAssetId?: string; isWater?: boolean; footstepSound?: string; fallSound?: string; bottomTextureId?: string; topTextureId?: string; topTextureRotation?: number; mirror?: boolean; maskId?: string; maskTargetAsset?: string; mirrorOpacity?: number; canBeDestroyed?: boolean; faces?: Partial<Record<'N' | 'E' | 'S' | 'W', string>>; keylock?: boolean; keypadDirection?: 'N' | 'E' | 'S' | 'W'; keypadAssetId?: string; keypadMaskAssetId?: string; keypadSound?: string; keypadSuccessSound?: string; keypadFailSound?: string; password?: string; targetId?: string; height?: number; glassAssetId?: string; glassTransparency?: number; glassOffset?: number; glassBreakSound?: string; cutoutAxis?: 'NS'|'WE'|'AUTO'; cutout?: { topLeft: {x:number, y:number}, bottomRight: {x:number, y:number} }; }[];
    portals?: { symbol: string; destination?: string; assetId?: string; portalId: string; targetPortalId?: string; targetDirection?: 'N' | 'E' | 'S' | 'W' }[];
    playerStart?: { symbol?: string; dir: 'N' | 'E' | 'S' | 'W' };
    isEditorTest?: boolean | number;
    initialInventory?: { id: string; count?: number }[];
    initialEquipment?: Record<string, string>;
    initialInventoryMale?: { id: string; count?: number }[];
    initialEquipmentMale?: Record<string, string>;
    initialInventoryFemale?: { id: string; count?: number }[];
    initialEquipmentFemale?: Record<string, string>;
}

export interface SoundDef {
    assetId?: string;
    alias?: string;
    volume?: number;
    looped?: boolean;
    allowOverlap?: boolean;
    randomizePitch?: boolean;
    streaming?: boolean;
    reverberationIgnored?: boolean;
    triggerRange?: number;
}

export type SoundConfig = Record<string, SoundDef>;

export interface EnemyDefinition {
    id: string;
    name: string;
    description?: string;
    canBeInspected?: boolean;
    hp: number;
    damageDice: string;
    accuracy: number;
    attackRange: number;
    baseXP: number;
    muzzleFlash?: boolean;
    casing?: {
        assetId: string;
        direction: 'left' | 'right';
        scale?: number;
        groundScaleMultiplier?: number;
    };
    assets: {
        map: { assetId: string, scale: number };
        dead?: { assetId: string, scale: number };
        portrait?: { assetId: string, scale: number };
        attack?: { assetId: string, scale: number };
        distanceAttack?: { assetId: string, scale: number };
        hands_up?: { assetId: string, scale: number };
        gibMask?: string;
    };
    sounds?: {
        attack?: string;
        damage?: string;
        death?: string;
        casing?: string;
        armorHit?: string;
        roam?: string;
        roamPeriodicity?: string;
        step?: string;
    };
    gibCounts?: { head?: number, body?: number, arms?: number, legs?: number };
    loot?: LootEntry[];
    onHitEffect?: {
        id: string;
        chance: number;
    };
    movementType?: 'patroling' | 'roaming';
    patrolRange?: number;
    speed?: number;
    canOpenDoors?: boolean;
    noShadow?: boolean;
}

export type ScriptTriggerType = 'ON_ENTER_TILE' | 'ON_INTERACT' | 'ON_ENEMY_DEFEAT' | 'ON_MAP_LOAD' | 'ON_ITEM_PICKUP' | 'ON_DOOR_STATE_CHANGE' | 'ON_TIMER' | 'ON_FLAG_CHANGE' | 'ON_COUNTER_VALUE' | 'ON_COUNTER_CHANGE' | 'ON_DIALOGUE_NODE';

export type ScriptActionType = 'SPAWN_ENTITY' | 'SPAWN_EXPLOSION' | 'SPAWN_ENEMY' | 'SPAWN_NPC' | 'SPAWN_ITEM' | 'SPAWN_DECORATION' | 'REMOVE_ENTITY' | 'MODIFY_ENTITY' | 'GIVE_ITEM' | 'TAKE_ITEM' | 'SHOW_DIALOGUE' | 'SHOW_TUTORIAL' | 'PLAY_SOUND' | 'CHANGE_TILE' | 'ADD_LOG' | 'SET_FLAG' | 'CREATE_COUNTER' | 'SET_COUNTER' | 'INCREMENT_COUNTER' | 'SET_SECTOR' | 'REVEAL_TASK' | 'COMPLETE_TASK' | 'CINEMATIC_CAMERA' | 'CINEMATIC_STATIC_CAMERA' | 'DELAY' | 'PLAYER_FALL' | 'PLAYER_DEATH' | 'DOOR_STATE_CHANGE' | 'SHOW_SCREAMER' | 'MOVE_TO' | 'NPC_FOLLOW' | 'RESET_SPAWN' | 'MUSIC_PLAYER' | 'GAME_OVER' | 'UNLOCK_ACHIEVEMENT' | 'END' | 'LAUNCH_MINIGAME' | 'REPEAT' | 'STOP_REPEAT';

export type TutorialHighlightElement = 
    | 'TOUCH_CONTROLS'
    | 'HEADER_BUTTON_GEAR'
    | 'HEADER_BUTTON_MAP'
    | 'HEADER_BUTTON_MENU'
    | 'HEADER_BUTTONS'
    | 'PLAYER_STATS'
    | 'AMMO_BADGE'
    | 'BUFFS'
    | 'DEBUFFS'
    | 'NONE';

export interface ScriptTrigger {
  id: string;
  type: ScriptTriggerType;
  params: any; 
  runOnce?: boolean;
  requiresFlag?: string;
  requiresFlags?: string[];
  requiredItemType?: string;
  actions: ScriptAction[];
  sequentialActions?: boolean;
  triggerAtStart?: boolean;
  triggerOnAnyInteract?: boolean;
}

export interface ScriptAction {
  type: ScriptActionType;
  params: any;
}


export interface NPCDefinition {
    id: string;
    name: string;
    description?: string;
    canBeKilled?: boolean;
    talkRange?: number;
    canBeInspected?: boolean;
    hp?: number;
    corpseScale?: number;
    deadScale?: number;
    assets: {
        map: { assetId: string; scale?: number };
        dead?: { assetId: string; scale?: number };
        portrait?: { assetId: string; scale?: number };
        attack?: { assetId: string; scale?: number };
        dialogue_portrait?: { assetId: string; scale?: number };
        hands_up?: { assetId: string; scale?: number };
    };
    scale?: number;
    dialogueId?: string;
    voice?: VoiceConfig;
    roamRadius?: number;
    sounds?: {
        death?: string;
        roam?: string;
        roamPeriodicity?: string;
        gasp?: string;
    };
    tradeItems?: { id: string; price: number; count?: number; }[];
    tradeResponses?: Record<string, string>;
    keepPrice?: number;
    noShadow?: boolean;
}

export interface DecorationDefinition {
    id: string;
    name: string;
    description: string;
    canBeInspected?: boolean;
    assetId: string;
    blocking: boolean;
    scale?: number;
    yOffset?: number;
    destructable?: boolean;
    hp?: number;
    destroyedAssetId?: string;
    explode?: boolean;
    explodeSound?: string;
    walkableWhenDestroyed?: boolean;
    deadScale?: number;
    destructionSoundId?: string;
    explosion_damage?: string;
    damaging?: boolean;
    damageDice?: string;
    noBleeding?: boolean;
    lifeTime?: number;
    isScorching?: boolean;
    spreadChance?: number;
    spreadType?: string;
    foreground?: boolean;
    soundId?: string;
    light?: { r: number; g: number; b: number; intensity?: number; range?: number; mode?: 'STATIC' | 'FLICKERING' | 'FIRE'; flickerPeriod?: string | number; flickerAlwaysOn?: boolean; };
    renderMode?: 'billboard' | 'mesh';
    wallSide?: 'N' | 'S' | 'E' | 'W';
    meshAxis?: 'NS' | 'WE' | 'AUTO' | 'Y';
    meshOffset?: number;
    worldOffsetX?: number;
    worldOffsetY?: number;
    meshWidth?: number;
    preserveAspect?: boolean;
    glassAssetId?: string;
    textureId?: string;
    shatterConfig?: { maskId: string; };
    isBox?: boolean;
    boxSize?: number;
    moveSound?: string;
    fallSound?: string;
    type?: 'LADDER' | string;
    ladderSound?: string;
    noShadow?: boolean;
    yRotation?: number;
}

export interface EffectDefinition {
    id: string;
    name: string; 
    description: string;
    type: 'BUFF' | 'DEBUFF';
    icon: string; 
    iconType?: 'LUCIDE' | 'SVG_PATH' | 'ASSET'; 
    color: string; 
    duration: number; 
    tickEffect?: {
        stat: 'hp'; 
        value: number; 
    };
}

export interface PlayerConfig {
    baseStats: {
        hp: number;
        maxHp: number;
        xp: number;
        maxXp: number;
        level: number;
        availablePoints: number;
        stats: PlayerStats;
    };
    loadouts: {
        male: { items: { id: string; count?: number }[]; equipment: any; };
        female: { items: { id: string; count?: number }[]; equipment: any; };
    };
    voices: {
        male: VoiceConfig;
        female: VoiceConfig;
    };
    sounds?: {
        damage_female?: string;
        damage?: string;
        death?: string;
        deathFemale?: string;
        bodyHit?: string;
    };
}

export interface InitialStateResponse {
    config: PlayerConfig;
}

export interface CombatEnemyState {
    id: string;
    alignment: 'LEFT' | 'CENTER' | 'RIGHT';
    distance?: number;
}

export interface CombatState {
    isActive: boolean;
    activeGroup: CombatEnemyState[];
    log: any[];
    lastPlayerHit: number;
    isProcessingTurn: boolean;
    activeAttackerId: string | null;
    startTime: number;
}

export interface DialogueOption {
    text: string;
    nextNodeId: string | null;
    condition?: { hasItem?: string };
}

export interface DialogueNode {
    id: string;
    speaker: 'NPC' | 'PLAYER' | 'TUTORIAL';
    text: string;
    next?: string;
    options?: DialogueOption[];
    once?: boolean;
    action?: string;
    giveItem?: { id: string; count?: number };
    takeItem?: { id: string; count?: number };
    soundId?: string;
    noVoice?: boolean;
    hiddenSpeaker?: boolean;
    overridePortrait?: string;
    overrideName?: string;
    scriptTriggerId?: string;
    tutorial?: {
        textId?: string;
        text?: string;
        highlightElement?: any;
        pages?: Array<{ textId?: string; text?: string; highlightElement?: any }>;
    };
    tutorialId?: string;
}

export interface DialogueTree {
    id: string;
    rootNodeId: string;
    nodes: { [id: string]: DialogueNode };
}

export interface RoamingEnemyAnim {
    id: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startTime: number;
    duration: number;
}
