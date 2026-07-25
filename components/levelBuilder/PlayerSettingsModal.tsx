import React, { useState, useEffect, useRef } from 'react';
import { X, Save, RotateCcw, Activity, Volume2, User, Package as Box, Mic, UserRound, Play } from 'lucide-react';
import playerData from '../../data/player.json';
import { PlayerConfig, VoiceConfig, LevelDefinition } from '../../types';
import itemsJs from '../../data/items.json';
import soundsJs from '../../data/sounds.json';
import { ASSETS } from '../../assets';
import { speakCharacter, cancelVoice } from '../../utils/voiceSynth';
import { CustomSelect } from './CustomSelect';

const itemsData = itemsJs as Record<string, any>;
const soundsData = soundsJs as Record<string, any>;

const InputRow = ({ label, value, onChange, type = 'number', step = '1' }: any) => (
  <div className="flex items-center justify-between bg-gray-800/50 p-2 rounded border border-gray-700/50 mb-2 gap-2">
    <span className="text-gray-300 font-mono text-xs sm:text-sm truncate">{label}</span>
    <input
      type={type}
      step={step}
      value={value ?? ''}
      onChange={(e) => onChange(type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)}
      className="bg-gray-900 border border-gray-600 text-white px-2 py-1 rounded w-24 sm:w-32 focus:outline-none focus:border-indigo-500 text-right font-mono flex-shrink-0"
    />
  </div>
);

const SelectRow = ({ label, value, onChange, options, uiStrings, onPlay }: any) => (
  <div className="flex items-center justify-between bg-gray-800/50 p-2 rounded border border-gray-700/50 mb-2 gap-2">
    <span className="text-gray-300 font-mono text-xs sm:text-sm truncate">{label}</span>
    <div className="flex gap-2 w-1/2 sm:w-auto">
      <CustomSelect
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-900 border border-gray-600 text-white px-2 py-1 rounded w-full sm:w-48 focus:outline-none focus:border-indigo-500 text-right font-mono"
      >
        <option value="">{uiStrings?.none || 'None'}</option>
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </CustomSelect>
      {onPlay && value && (
        <button onClick={() => onPlay(value)} className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded shrink-0">
          <Play size={16} className="text-indigo-400"/>
        </button>
      )}
    </div>
  </div>
);

interface PlayerSettingsModalProps {
  onClose: () => void;
  uiStrings: any;
  level?: LevelDefinition;
}

export const PlayerSettingsModal: React.FC<PlayerSettingsModalProps> = ({
  onClose,
  uiStrings,
  level,
}) => {
  const soundOptions = Object.keys(soundsData);
  const itemOptions = Object.keys(itemsData).map(k => ({ id: k, ...itemsData[k] }));

  const [config, setConfig] = useState<PlayerConfig>(playerData as PlayerConfig);
  const [activeTab, setActiveTab] = useState<'STATS' | 'SOUNDS' | 'VOICES' | 'LOADOUTS'>('STATS');
  const [loadoutGender, setLoadoutGender] = useState<'male' | 'female'>('male');
  const [inventoryItems, setInventoryItems] = useState<{ male: any[], female: any[] }>({ male: [], female: [] });
  const [testPhrases, setTestPhrases] = useState<{male: string, female: string}>({male: '', female: ''});
  const timeoutsRef = useRef<number[]>([]);

  const isOverrideActive = 
    level?.initialInventory !== undefined || 
    Object.keys(level?.initialEquipment || {}).length > 0 ||
    level?.initialInventoryMale !== undefined || 
    Object.keys(level?.initialEquipmentMale || {}).length > 0 ||
    level?.initialInventoryFemale !== undefined || 
    Object.keys(level?.initialEquipmentFemale || {}).length > 0;

  const isRu = uiStrings?.btn_male === "Мужской" || uiStrings?.done === "ГОТОВО" || uiStrings?.sector_settings === "Настройка сектора";
  const localizeVal = (val: string | undefined) => {
    if (!val) return "";
    const idxVal = val.indexOf('/');
    if (idxVal !== -1) return isRu ? val.substring(0, idxVal).trim() : val.substring(idxVal + 1).trim();
    return val;
  };
  const warningMessage = uiStrings?.override_warning_loadouts || (isRu 
    ? "Внимание: Включен оверрайд вещей сектора. Настройки снаряжения и инвентаря заблокированы в соответствии с настройками сектора."
    : "Warning: Sector starting items override is active. Equipment and inventory settings are locked by the sector.");

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const playVoiceTest = (gender: 'male' | 'female') => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    cancelVoice();
    const textToPlay = testPhrases[gender] || (uiStrings.voice_test_default || 'Тестовая фраза');
    const chars = textToPlay.split('');
    const testVoice = config.voices?.[gender] || { pitch: 1, volume: 1, rate: 1, resonance: 1, waveform: 'sawtooth' };
    const typingDelay = 35 / (testVoice.rate || 1);
    let charIndex = 0;
    const playNext = () => {
      if (charIndex >= chars.length) return;
      const char = chars[charIndex];
      let intonation: 'FLAT' | 'RISE' | 'FALL' = 'FLAT';
      if (chars[charIndex+1] === '?') intonation = 'RISE';
      if (chars[charIndex+1] === '!') intonation = 'FALL';
      speakCharacter(char, testVoice as any, intonation, false, true);
      let stepDelay = typingDelay;
      if (char === ' ') stepDelay += 100; 
      if (char === ',') stepDelay += 300; 
      if (char === '.' || char === '?' || char === '!') stepDelay += 500;
      charIndex++;
      if (charIndex < chars.length) { 
        const id = window.setTimeout(playNext, stepDelay); 
        timeoutsRef.current.push(id); 
      }
    };
    playNext();
  };

  const extractInventory = (loadout: any) => {
    if (!loadout?.items) return [];
    const equipIds = Object.values(loadout.equipment || {}).filter(Boolean);
    const inv: any[] = [];
    const usedEquip = [...equipIds];
    for (const item of loadout.items) {
      const idx = usedEquip.indexOf(item.id);
      if (idx !== -1) {
        usedEquip.splice(idx, 1);
      } else {
        inv.push(item);
      }
    }
    return inv;
  };

  useEffect(() => {
    const saved = localStorage.getItem('editor_test_player');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as PlayerConfig;
        setConfig(parsed);
        setInventoryItems({
          male: extractInventory((parsed.loadouts as any).male),
          female: extractInventory((parsed.loadouts as any).female)
        });
      } catch (e) {
        setConfig(playerData as PlayerConfig);
        setInventoryItems({
          male: extractInventory((playerData as PlayerConfig).loadouts.male),
          female: extractInventory((playerData as PlayerConfig).loadouts.female)
        });
      }
    } else {
      setConfig(playerData as PlayerConfig);
      setInventoryItems({
        male: extractInventory((playerData as PlayerConfig).loadouts.male),
        female: extractInventory((playerData as PlayerConfig).loadouts.female)
      });
    }
  }, []);

  const getInventoryMaxSlotsFor = (gender: 'male' | 'female', data: any) => {
    let slots = 4;
    const equip = data?.loadouts?.[gender]?.equipment;
    if (equip) {
      Object.values(equip).forEach((itemId: any) => {
        if (itemId && itemsData[itemId] && itemsData[itemId].inventorySlots) {
          slots += itemsData[itemId].inventorySlots;
        }
      });
    }
    return slots;
  };

  const compileSlots = (inventory: { id: string; count?: number }[], maxSlots: number) => {
    const slots: {
      item?: { id: string; count?: number };
      isDuplicate: boolean;
      parentSlotIndex?: number;
      inventoryIndex?: number;
    }[] = [];

    let currentInvIdx = 0;
    for (let sIdx = 0; sIdx < maxSlots; sIdx++) {
      if (slots[sIdx]) continue;
      
      const item = currentInvIdx < inventory.length ? inventory[currentInvIdx] : undefined;
      if (item) {
        const itemData = itemsData[item.id] || (itemsData as any)[item.id];
        const weight = itemData?.weight || 1;
        
        slots[sIdx] = { item, isDuplicate: false, inventoryIndex: currentInvIdx };
        
        for (let w = 1; w < weight; w++) {
          if (sIdx + w < maxSlots) {
            slots[sIdx + w] = { item, isDuplicate: true, parentSlotIndex: sIdx };
          }
        }
        currentInvIdx++;
      } else {
        slots[sIdx] = { isDuplicate: false };
      }
    }
    return slots;
  };

  const handleSave = () => {
    const finalConfig = { ...config } as any;
    for (const g of ['male', 'female'] as const) {
      if (!finalConfig.loadouts[g]) finalConfig.loadouts[g] = { items: [], equipment: {} };
      const equipObj = finalConfig.loadouts[g].equipment || {};
      const equipArr = Object.values(equipObj).filter(Boolean).map(id => ({ id }));
      
      const maxSlots = getInventoryMaxSlotsFor(g, finalConfig);
      const currentInv = (inventoryItems as any)[g] || [];
      const slots = compileSlots(currentInv, maxSlots);
      const itemsToSave = slots.filter(s => s.item && !s.isDuplicate).map(s => s.item!);
      
      finalConfig.loadouts[g].items = [...equipArr, ...itemsToSave];
    }
    localStorage.setItem('editor_test_player', JSON.stringify(finalConfig, null, 2));
    onClose();
  };

  const handleReset = () => {
    if (window.confirm(uiStrings.confirm_reset_player || "Сбросить изменения к стандартным настройкам?")) {
      localStorage.removeItem('editor_test_player');
      setConfig(playerData as PlayerConfig);
      setInventoryItems({
        male: extractInventory((playerData as PlayerConfig).loadouts.male),
        female: extractInventory((playerData as PlayerConfig).loadouts.female)
      });
    }
  };

  const playSoundPreview = (soundId: string) => {
    if (!soundId) return;
    const soundDef = (soundsData as any)[soundId];
    if (soundDef) {
      const idToPlay = soundDef.assetId || soundDef.alias;
      const url = idToPlay && ((ASSETS.SOUNDS as any)[idToPlay] || (ASSETS.SPRITES as any)[idToPlay]);
      if (url) {
        const audio = new Audio(url);
        audio.volume = soundDef.volume ?? 1.0;
        audio.play().catch((e) => console.log("Audio preview error:", e));
      }
    }
  };

  const updateBaseStat = (key: keyof PlayerConfig['baseStats'], val: number) => {
    setConfig(prev => ({
      ...prev,
      baseStats: { ...prev.baseStats, [key]: val }
    }));
  };

  const updateStat = (key: keyof PlayerConfig['baseStats']['stats'], val: number) => {
    setConfig(prev => ({
      ...prev,
      baseStats: { 
        ...prev.baseStats, 
        stats: { ...prev.baseStats.stats, [key]: val } 
      }
    }));
  };

  const updateSound = (key: keyof NonNullable<PlayerConfig['sounds']>, val: string) => {
    setConfig(prev => ({
      ...prev,
      sounds: { ...(prev.sounds || {}), [key]: val }
    }));
  };

  const updateVoice = (gender: 'male' | 'female', key: keyof VoiceConfig, val: any) => {
    setConfig(prev => ({
      ...prev,
      voices: {
        ...prev.voices,
        [gender]: { ...prev.voices[gender], [key]: val }
      }
    }));
  };

  const updateEquipment = (slotKey: string, itemId: string | null) => {
    setConfig(prev => {
      const newLoadouts = { ...(prev.loadouts as any) };
      if (!newLoadouts[loadoutGender]) newLoadouts[loadoutGender] = { items: [], equipment: {} };
      newLoadouts[loadoutGender] = {
        ...newLoadouts[loadoutGender],
        equipment: {
          ...newLoadouts[loadoutGender].equipment,
          [slotKey]: itemId || undefined
        }
      };
      return { ...prev, loadouts: newLoadouts };
    });
  };

  const updateInventoryItem = (index: number, itemId: string | null, count?: number) => {
    setInventoryItems(prev => {
      const gList = [...prev[loadoutGender]];
      if (index >= gList.length) {
        if (itemId !== null) gList.push({ id: itemId, count: count });
      } else {
        if (itemId === null) {
          gList.splice(index, 1);
        } else {
          gList[index] = { id: itemId, count: count };
          if (count == null) delete gList[index].count;
        }
      }
      return { ...prev, [loadoutGender]: gList };
    });
  };

  const getInventoryMaxSlots = () => {
    let slots = 4;
    const equip = (config.loadouts as any)?.[loadoutGender]?.equipment;
    if (equip) {
      Object.values(equip).forEach((itemId: any) => {
        if (itemId && itemsData[itemId] && itemsData[itemId].inventorySlots) {
          slots += itemsData[itemId].inventorySlots;
        }
      });
    }
    return slots;
  };

  return (
    <div className="absolute inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-[500] pointer-events-auto">
      <div className="bg-gray-800 border border-gray-700 p-3 sm:p-6 rounded-lg w-full max-w-[700px] shadow-2xl flex flex-col max-h-[90dvh] mx-2 sm:mx-4 relative">
        <div className="flex justify-between items-center mb-4 sm:mb-6 shrink-0 border-b border-gray-700 pb-2 sm:pb-4">
          <h3 className="font-bold text-lg sm:text-xl flex items-center gap-2 tracking-widest text-[#d5d2c6] uppercase">
            <UserRound size={20} className="text-indigo-400" />
            {uiStrings.player_settings || "Настройки Игрока"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors absolute top-2 right-2 sm:top-4 sm:right-4 z-10 p-2">
            <X size={24} />
          </button>
        </div>

        {/* Custom Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-800 pb-2 shrink-0 overflow-x-auto custom-scrollbar">
          {[
            { id: 'STATS', icon: Activity, label: uiStrings.tab_stats || "Stats" },
            { id: 'SOUNDS', icon: Volume2, label: uiStrings.tab_sounds || "Sounds" },
            { id: 'VOICES', icon: Mic, label: uiStrings.tab_voices || "Voices" },
            { id: 'LOADOUTS', icon: Box, label: uiStrings.tab_loadouts || "Loadouts" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t font-bold uppercase tracking-wider text-sm transition-colors ${
                activeTab === tab.id 
                  ? 'bg-indigo-600/20 text-indigo-400 border-b-2 border-indigo-500' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar flex flex-col gap-6">
          {activeTab === 'STATS' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <h4 className="text-indigo-400 font-bold mb-3 uppercase tracking-wider text-sm flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-500 rounded"></div>
                  {uiStrings.base_stats || "Base Stats"}
                </h4>
                <InputRow label={uiStrings.hp || "HP"} value={config.baseStats?.hp} onChange={(v: number) => updateBaseStat('hp', v)} />
                <InputRow label={uiStrings.max_hp || "Max HP"} value={config.baseStats?.maxHp} onChange={(v: number) => updateBaseStat('maxHp', v)} />
                <InputRow label={uiStrings.xp || "XP"} value={config.baseStats?.xp} onChange={(v: number) => updateBaseStat('xp', v)} />
                <InputRow label={uiStrings.max_xp || "Max XP"} value={config.baseStats?.maxXp} onChange={(v: number) => updateBaseStat('maxXp', v)} />
                <InputRow label={uiStrings.level || "Level"} value={config.baseStats?.level} onChange={(v: number) => updateBaseStat('level', v)} />
                <InputRow label={uiStrings.skill_points || "Skill Points"} value={config.baseStats?.availablePoints} onChange={(v: number) => updateBaseStat('availablePoints', v)} />
              </div>
              <div>
                <h4 className="text-indigo-400 font-bold mb-3 uppercase tracking-wider text-sm flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-500 rounded"></div>
                  {uiStrings.attributes || "Attributes"}
                </h4>
                <InputRow label={uiStrings.str || "Strength"} value={config.baseStats?.stats?.str} onChange={(v: number) => updateStat('str', v)} />
                <InputRow label={uiStrings.agi || "Agility"} value={config.baseStats?.stats?.agi} onChange={(v: number) => updateStat('agi', v)} />
                <InputRow label={uiStrings.spd || "Speed"} value={config.baseStats?.stats?.spd} onChange={(v: number) => updateStat('spd', v)} />
                <InputRow label={uiStrings.vit || "Vitality"} value={config.baseStats?.stats?.vit} onChange={(v: number) => updateStat('vit', v)} />
              </div>
            </div>
          )}

          {activeTab === 'SOUNDS' && (
            <div>
              <h4 className="text-indigo-400 font-bold mb-3 uppercase tracking-wider text-sm flex items-center gap-2">
                <div className="w-1 h-4 bg-indigo-500 rounded"></div>
                {uiStrings.sound_mapping || "Sound Mapping"}
              </h4>
              <SelectRow label={uiStrings.damage_male || "Damage (Male)"} value={config.sounds?.damage} onChange={(v: string) => updateSound('damage', v)} options={soundOptions} uiStrings={uiStrings} onPlay={playSoundPreview} />
              <SelectRow label={uiStrings.damage_female || "Damage (Female)"} value={config.sounds?.damage_female} onChange={(v: string) => updateSound('damage_female', v)} options={soundOptions} uiStrings={uiStrings} onPlay={playSoundPreview} />
              <SelectRow label={uiStrings.death_male || "Death (Male)"} value={config.sounds?.death} onChange={(v: string) => updateSound('death', v)} options={soundOptions} uiStrings={uiStrings} onPlay={playSoundPreview} />
              <SelectRow label={uiStrings.death_female || "Death (Female)"} value={config.sounds?.deathFemale} onChange={(v: string) => updateSound('deathFemale', v)} options={soundOptions} uiStrings={uiStrings} onPlay={playSoundPreview} />
              <SelectRow label={uiStrings.body_hit || "Body Hit"} value={config.sounds?.bodyHit} onChange={(v: string) => updateSound('bodyHit', v)} options={soundOptions} uiStrings={uiStrings} onPlay={playSoundPreview} />
            </div>
          )}

          {activeTab === 'VOICES' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {(['male', 'female'] as const).map(gender => (
                <div key={gender}>
                  <h4 className="text-indigo-400 font-bold mb-3 uppercase tracking-wider text-sm flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-500 rounded"></div>
                    {gender === 'male' ? (uiStrings.male_voice || "Male Voice") : (uiStrings.female_voice || "Female Voice")}
                  </h4>
                  <InputRow label={uiStrings.pitch || "Pitch"} step="0.1" value={config.voices?.[gender]?.pitch ?? 1.0} onChange={(v: number) => updateVoice(gender, 'pitch', v)} />
                  <InputRow label={uiStrings.rate || "Rate"} step="0.1" value={config.voices?.[gender]?.rate ?? 1.0} onChange={(v: number) => updateVoice(gender, 'rate', v)} />
                  <InputRow label={uiStrings.volume || "Volume"} step="0.1" value={config.voices?.[gender]?.volume ?? 1.0} onChange={(v: number) => updateVoice(gender, 'volume', v)} />
                  <InputRow label={uiStrings.resonance || "Resonance"} step="0.1" value={config.voices?.[gender]?.resonance ?? 1.0} onChange={(v: number) => updateVoice(gender, 'resonance', v)} />
                  
                  <div className="flex items-center justify-between bg-gray-800/50 p-2 rounded border border-gray-700/50 mb-2">
                    <span className="text-gray-300 font-mono text-sm">{uiStrings.waveform || "Waveform"}</span>
                    <CustomSelect
                      value={config.voices?.[gender]?.waveform || 'sawtooth'}
                      onChange={(e) => updateVoice(gender, 'waveform', e.target.value)}
                      className="bg-gray-900 border border-gray-600 text-white px-2 py-1 rounded w-32 focus:outline-none focus:border-indigo-500 text-right font-mono"
                    >
                      <option value="sawtooth">sawtooth</option>
                      <option value="square">square</option>
                      <option value="sine">sine</option>
                      <option value="triangle">triangle</option>
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col mt-4 gap-2">
                    <input
                      type="text"
                      className="bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded focus:outline-none focus:border-indigo-500 font-mono text-sm w-full"
                      placeholder={uiStrings.voice_test_placeholder || "Type phrase to test..."}
                      value={testPhrases[gender]}
                      onChange={(e) => setTestPhrases(prev => ({ ...prev, [gender]: e.target.value }))}
                    />
                    <button
                      onClick={() => playVoiceTest(gender)}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-indigo-400 rounded transition-colors font-bold uppercase tracking-wider text-sm"
                    >
                      <Play size={16} />
                      TEST
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'LOADOUTS' && (
            <div className="flex-1 flex flex-col h-full space-y-4">
              <div className="flex gap-2 bg-gray-800/50 p-1 rounded w-fit">
                {(['male', 'female'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setLoadoutGender(g)}
                    className={`px-4 py-1 rounded text-sm font-bold uppercase tracking-wider transition-colors ${
                      loadoutGender === g 
                        ? 'bg-indigo-600 text-white' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {g === 'male' ? (uiStrings.btn_male || "Мужской") : (uiStrings.btn_female || "Женский")}
                  </button>
                ))}
              </div>

              {isOverrideActive && (
                <div className="bg-amber-950/40 border border-amber-800 text-amber-200 px-4 py-3 rounded-lg text-xs sm:text-sm font-semibold uppercase tracking-wider flex items-center gap-3 animate-fadeIn select-none">
                  <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse shrink-0"></div>
                  <span>
                    {warningMessage}
                  </span>
                </div>
              )}

              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 flex-1 overflow-y-auto pt-2 transition-opacity duration-300 ${isOverrideActive ? 'opacity-40 pointer-events-none' : ''}`}>
                <div>
                  <h4 className="text-indigo-400 font-bold mb-3 uppercase tracking-wider text-sm flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-500 rounded"></div>
                    {uiStrings.equipment || "Equipment"}
                  </h4>
                  {['helmet', 'vest', 'pants', 'boots', 'weapon', 'accessory1', 'accessory2'].map(slot => (
                    <div key={slot} className="flex items-center justify-between bg-gray-800/50 p-2 rounded border border-gray-700/50 mb-2">
                      <span className="text-gray-300 font-mono text-sm capitalize">{uiStrings[slot] || slot}</span>
                      <CustomSelect
                        value={(config.loadouts as any)?.[loadoutGender]?.equipment?.[slot] || ''}
                        onChange={(e) => updateEquipment(slot, e.target.value === '' ? null : e.target.value)}
                        disabled={isOverrideActive}
                        className="bg-gray-900 border border-gray-600 text-white px-2 py-1 rounded flex-1 ml-2 max-w-[150px] sm:max-w-none sm:w-32 focus:outline-none focus:border-indigo-500 text-right font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">{uiStrings.none || "None"}</option>
                        {itemOptions.filter(i => {
                          if (slot === 'weapon') return i.equip === 'WEAPON';
                          if (slot === 'accessory1' || slot === 'accessory2') return i.equip === 'ACCESSORY';
                          if (slot === 'helmet') return i.equip === 'HEAD';
                          if (slot === 'vest') return i.equip === 'BODY';
                          if (slot === 'pants') return i.equip === 'LEGS';
                          if (slot === 'boots') return i.equip === 'FEET';
                          return i.slot === slot;
                        }).map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {localizeVal(opt.name)} ({opt.id})
                          </option>
                        ))}
                      </CustomSelect>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col">
                  <h4 className="text-indigo-400 font-bold mb-3 uppercase tracking-wider text-sm flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-500 rounded"></div>
                    {uiStrings.inventory || "Inventory"} ({compileSlots(inventoryItems[loadoutGender] || [], getInventoryMaxSlots()).filter(s => s.item).length} / {getInventoryMaxSlots()})
                  </h4>
                  
                  <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                    {(() => {
                      const currentInv = inventoryItems[loadoutGender] || [];
                      const maxSlots = getInventoryMaxSlots();
                      const slots = compileSlots(currentInv, maxSlots);
                      const isRu = uiStrings?.done === "ГОТОВО" || uiStrings?.sector_settings === "Настройка сектора";
                      const localizeVal = (val: string | undefined) => {
                        if (!val) return "";
                        const idxVal = val.indexOf('/');
                        if (idxVal !== -1) return isRu ? val.substring(0, idxVal).trim() : val.substring(idxVal + 1).trim();
                        return val;
                      };

                      const updateInventoryItemSlot = (sIdx: number, itemId: string | null, count?: number) => {
                        setInventoryItems(prev => {
                          const gList = [...prev[loadoutGender]];
                          const targetSlot = slots[sIdx];
                          if (targetSlot && targetSlot.inventoryIndex !== undefined) {
                            const invIdx = targetSlot.inventoryIndex;
                            if (itemId === null) {
                              gList.splice(invIdx, 1);
                            } else {
                              gList[invIdx] = { id: itemId, count };
                              if (count == null) delete gList[invIdx].count;
                            }
                          } else {
                            // Empty slot, find insertion index
                            if (itemId !== null) {
                              let insertAt = 0;
                              for (let i = sIdx - 1; i >= 0; i--) {
                                if (slots[i] && slots[i].inventoryIndex !== undefined) {
                                  insertAt = slots[i].inventoryIndex! + 1;
                                  break;
                                }
                              }
                              gList.splice(insertAt, 0, { id: itemId, count });
                            }
                          }
                          return { ...prev, [loadoutGender]: gList };
                        });
                      };

                      return slots.map((slot, sIdx) => {
                        const item = slot.item;
                        const isDuplicate = slot.isDuplicate;

                        return (
                          <div key={sIdx} className={`flex items-center gap-2 p-2 rounded border mb-2 ${isDuplicate ? 'bg-gray-900/30 border-gray-800 opacity-60 text-gray-500' : 'bg-gray-800/50 border-gray-700/50'}`}>
                            <span className={`text-gray-500 font-mono text-xs w-4`}>{sIdx + 1}.</span>
                            <CustomSelect
                              value={item?.id || ''}
                              onChange={(e) => updateInventoryItemSlot(sIdx, e.target.value === '' ? null : e.target.value, item?.count)}
                              disabled={isOverrideActive || isDuplicate}
                              className="bg-gray-900 border border-gray-600 text-white px-1 sm:px-2 py-1 rounded flex-1 min-w-0 focus:outline-none focus:border-indigo-500 font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <option value="">{uiStrings.empty || "--- Empty ---"}</option>
                              {itemOptions.map((opt: any) => {
                                const optWeight = opt.weight || 1;
                                const isDisabled = optWeight > (maxSlots - sIdx);
                                return (
                                  <option key={opt.id} value={opt.id} disabled={isDisabled}>
                                    {localizeVal(opt.name)} ({opt.id})
                                  </option>
                                );
                              })}
                            </CustomSelect>
                            {item && (
                              <input
                                type="number"
                                min="1"
                                value={item.count || ''}
                                placeholder={uiStrings.qty || "Qty"}
                                disabled={isOverrideActive || isDuplicate}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value);
                                  updateInventoryItemSlot(sIdx, item.id, isNaN(v) ? undefined : v);
                                }}
                                className="bg-gray-900 border border-gray-600 text-white px-1 py-1 rounded w-12 focus:outline-none focus:border-indigo-500 text-right font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between mt-4 sm:mt-6 pt-4 border-t border-gray-800 shrink-0">
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-200 rounded font-bold uppercase tracking-wider flex justify-center items-center gap-2 transition-colors border border-red-700/50 w-full sm:w-auto"
          >
            <RotateCcw size={18} />
            {uiStrings.btn_reset || "Сброс"}
          </button>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold uppercase tracking-wider transition-colors w-full sm:w-auto"
            >
              {uiStrings.btn_cancel || "Отмена"}
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold uppercase tracking-wider flex justify-center items-center gap-2 transition-colors border border-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] w-full sm:w-auto"
            >
              <Save size={18} />
              {uiStrings.btn_save || "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
