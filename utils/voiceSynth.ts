
import { VoiceConfig } from '../types';

// Singleton AudioContext
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let radioNoiseSource: AudioBufferSourceNode | null = null;
let radioNoiseGain: GainNode | null = null;
let lastSpeakTime = 0;
let globalVolumeMultiplier = 1.0;

interface PhonemeConfig {
    f1: number;
    f2: number;
    type: 'vowel' | 'consonant' | 'sibilant' | 'nasal' | 'liquid';
    // Optional individual settings
    filterType?: 'highpass' | 'lowpass' | 'bandpass';
    noiseFreq?: number; // Center or Cutoff freq
    attack?: number; // Attack time in seconds
    duration?: number; // Override default duration
}

// COMPLETE FORMANT FREQUENCIES (F1, F2) for RU/EN Alphabets
export const PHONEME_MAP: { [key: string]: PhonemeConfig } = {
    // --- VOWELS (EN) ---
    'a': { f1: 750, f2: 1150, type: 'vowel' }, 
    'e': { f1: 550, f2: 1850, type: 'vowel' }, 
    'i': { f1: 280, f2: 2250, type: 'vowel' }, 
    'o': { f1: 500, f2: 850, type: 'vowel' },  
    'u': { f1: 320, f2: 850, type: 'vowel' },  
    'y': { f1: 280, f2: 2250, type: 'vowel' }, 

    // --- VOWELS (RU) ---
    'а': { f1: 750, f2: 1150, type: 'vowel' },
    'у': { f1: 320, f2: 850, type: 'vowel' },
    'о': { f1: 500, f2: 850, type: 'vowel' },
    'ы': { f1: 350, f2: 1400, type: 'vowel' }, 
    'и': { f1: 280, f2: 2250, type: 'vowel' },
    'э': { f1: 550, f2: 1850, type: 'vowel' },
    'я': { f1: 750, f2: 1150, type: 'vowel' },
    'ю': { f1: 320, f2: 850, type: 'vowel' },
    'ё': { f1: 500, f2: 850, type: 'vowel' },
    'е': { f1: 550, f2: 1850, type: 'vowel' },

    // --- SIBILANTS / NOISE (Individually tuned) ---
    // 'S' sounds - Custom tuned: Lowpass 2500Hz, Fast Attack 0.01s, Duration 0.03s
    's': { f1: 0, f2: 0, type: 'sibilant', filterType: 'lowpass', noiseFreq: 2500, attack: 0.01, duration: 0.03 },
    'c': { f1: 0, f2: 0, type: 'sibilant', filterType: 'lowpass', noiseFreq: 2500, attack: 0.01, duration: 0.03 }, 
    'с': { f1: 0, f2: 0, type: 'sibilant', filterType: 'lowpass', noiseFreq: 2500, attack: 0.01, duration: 0.03 }, // RU 'es'
    'ц': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 4000, attack: 0.03, duration: 0.04 }, // Custom tuned Ts

    // 'SH' / 'CH' sounds - Deeper, fuller noise
    'sh': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 2500, attack: 0.04 },
    'ш': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 2500, attack: 0.04 },
    'щ': { f1: 0, f2: 0, type: 'sibilant', filterType: 'lowpass', noiseFreq: 3200, attack: 0.05, duration: 0.05 }, // RU 'shcha' - Lowpass 3200Hz
    'ч': { f1: 0, f2: 0, type: 'sibilant', filterType: 'lowpass', noiseFreq: 3000, attack: 0.02, duration: 0.05 },
    
    // 'F' / 'H' - Custom tuned: Bandpass 4500Hz, Attack 0.03s, Duration 0.04s
    'f': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 4500, attack: 0.03, duration: 0.04 },
    'ф': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 4500, attack: 0.03, duration: 0.04 },
    'h': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 1500, attack: 0.05 },
    'x': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 1800, attack: 0.05, duration: 0.06 },
    'х': { f1: 0, f2: 0, type: 'sibilant', filterType: 'bandpass', noiseFreq: 1800, attack: 0.05, duration: 0.06 },

    // --- VOICED FRICATIVES ---
    'j': { f1: 250, f2: 2000, type: 'consonant' }, 
    'z': { f1: 250, f2: 1500, type: 'consonant' },
    'v': { f1: 200, f2: 700, type: 'consonant' },
    
    'ж': { f1: 250, f2: 2000, type: 'consonant' }, // Zh
    'з': { f1: 250, f2: 1500, type: 'consonant' }, // Z

    // --- NASALS (Resonant) ---
    'm': { f1: 250, f2: 1100, type: 'nasal' },
    'n': { f1: 250, f2: 1500, type: 'nasal' },
    'м': { f1: 250, f2: 1100, type: 'nasal' },
    'н': { f1: 250, f2: 1500, type: 'nasal' },

    // --- LIQUIDS ---
    'l': { f1: 300, f2: 1100, type: 'liquid' },
    'r': { f1: 300, f2: 1300, type: 'liquid' },
    'л': { f1: 300, f2: 1100, type: 'liquid' },
    'р': { f1: 300, f2: 1300, type: 'liquid' },

    // --- PLOSIVES / STOPS ---
    'b': { f1: 200, f2: 700, type: 'consonant' },
    'd': { f1: 200, f2: 1200, type: 'consonant' },
    'g': { f1: 200, f2: 1600, type: 'consonant' },
    'p': { f1: 200, f2: 700, type: 'consonant' },
    't': { f1: 200, f2: 1200, type: 'consonant' },
    'k': { f1: 200, f2: 1600, type: 'consonant' },
    'q': { f1: 200, f2: 1600, type: 'consonant' },
    'w': { f1: 200, f2: 600, type: 'consonant' },

    'б': { f1: 200, f2: 700, type: 'consonant' },
    'п': { f1: 200, f2: 700, type: 'consonant' },
    'в': { f1: 200, f2: 700, type: 'consonant' }, 
    'г': { f1: 200, f2: 1600, type: 'consonant' },
    'к': { f1: 200, f2: 1600, type: 'consonant' },
    'д': { f1: 200, f2: 1200, type: 'consonant' },
    'т': { f1: 200, f2: 1200, type: 'consonant' },
    'й': { f1: 250, f2: 2000, type: 'consonant' },
    'ь': { f1: 300, f2: 1800, type: 'consonant' }, 
    'ъ': { f1: 200, f2: 1000, type: 'consonant' }, 

    // DEFAULT
    'default': { f1: 500, f2: 1500, type: 'consonant' }
};

const createNoiseBuffer = () => {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds buffer
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        // Standard White Noise
        data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    noiseBuffer = buffer;
};

export const setGlobalVoiceVolume = (vol: number) => {
    // vol is 0 to 100
    globalVolumeMultiplier = vol / 100;
    if (masterGain && audioCtx) {
        // Base gain was 4.0.
        masterGain.gain.setTargetAtTime(4.0 * globalVolumeMultiplier, audioCtx.currentTime, 0.1);
    }
};

export const initVoice = async (ctx?: AudioContext, destination?: GainNode) => {
    if (!audioCtx) {
        if (ctx) {
            audioCtx = ctx;
        } else {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            audioCtx = new Ctx();
        }
        
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 4.0 * globalVolumeMultiplier; 

        // 1. HighShelf Filter (Boost Highs for clarity)
        const highShelf = audioCtx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 2500;
        highShelf.gain.value = 6; 

        // 2. Global LowPass (Cut absolute harshest frequencies)
        const globalFilter = audioCtx.createBiquadFilter();
        globalFilter.type = 'lowpass';
        globalFilter.frequency.value = 7500; 

        // 3. Compressor (Prevent clipping due to high gain)
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -10;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        masterGain.connect(highShelf);
        highShelf.connect(globalFilter);
        globalFilter.connect(compressor);
        if (destination) {
            compressor.connect(destination);
        } else {
            compressor.connect(audioCtx.destination);
        }

        createNoiseBuffer();
    }
    
    if (audioCtx.state === 'suspended') {
        try {
            await audioCtx.resume();
        } catch (e) {
            console.error("Failed to resume Voice Audio Context", e);
        }
    }
    return audioCtx;
};

export const cancelVoice = () => {
    if (audioCtx && masterGain) {
        // Quickly fade out to zero to stop current speech without clicking
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
        
        // Restore volume shortly after
        setTimeout(() => {
            if (masterGain && audioCtx) {
                masterGain.gain.setValueAtTime(4.0 * globalVolumeMultiplier, audioCtx.currentTime);
            }
        }, 100);
    }
};

export const startRadioNoise = async () => {
    if (!audioCtx || !masterGain || !noiseBuffer) {
        await initVoice();
    }
    if (!audioCtx || !masterGain || !noiseBuffer) return;
    if (audioCtx.state === 'suspended') {
        try {
            await audioCtx.resume();
        } catch (e) {
            console.error("Failed to resume", e);
            return;
        }
    }

    if (radioNoiseSource) {
        stopRadioNoise();
    }

    radioNoiseSource = audioCtx.createBufferSource();
    radioNoiseSource.buffer = noiseBuffer;
    radioNoiseSource.loop = true;

    // Filter to make it sound like static radio
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 800;

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3500;

    radioNoiseGain = audioCtx.createGain();
    radioNoiseGain.gain.value = 0; // Start at 0
    radioNoiseGain.gain.linearRampToValueAtTime(0.08 * globalVolumeMultiplier, audioCtx.currentTime + 0.1);

    radioNoiseSource.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(radioNoiseGain);
    radioNoiseGain.connect(masterGain);

    radioNoiseSource.start();
};

export const stopRadioNoise = () => {
    if (radioNoiseGain && audioCtx) {
        radioNoiseGain.gain.cancelScheduledValues(audioCtx.currentTime);
        radioNoiseGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        
        const sourceToStop = radioNoiseSource;
        setTimeout(() => {
            if (sourceToStop) {
                try {
                    sourceToStop.stop();
                    sourceToStop.disconnect();
                } catch(e) {}
            }
        }, 150);
    } else if (radioNoiseSource) {
        try {
            radioNoiseSource.stop();
            radioNoiseSource.disconnect();
        } catch(e) {}
    }
    radioNoiseSource = null;
    radioNoiseGain = null;
};

// --- DEBUG INTERFACE ---
export interface DebugPhonemeParams {
    type: 'vowel' | 'consonant' | 'sibilant' | 'nasal' | 'liquid';
    filterType: 'highpass' | 'lowpass' | 'bandpass';
    frequency: number; // Noise freq
    f1: number; // Formant 1
    f2: number; // Formant 2
    q: number; // Resonance
    attack: number;
    duration: number;
    volMod: number;
}

export const debugPlayPhoneme = async (params: DebugPhonemeParams) => {
    if (!audioCtx || !masterGain) await initVoice();
    if (!audioCtx || !masterGain) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const now = audioCtx.currentTime;
    
    // SIBILANT (NOISE)
    if (params.type === 'sibilant') {
        if (!noiseBuffer) return;
        const source = audioCtx.createBufferSource();
        source.buffer = noiseBuffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = params.filterType;
        filter.frequency.value = params.frequency;
        filter.Q.value = params.q;

        const gain = audioCtx.createGain();
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        
        const peakVol = params.volMod; 
        
        // Attack
        gain.gain.linearRampToValueAtTime(peakVol, now + params.attack);
        
        // Hold/Release
        gain.gain.setValueAtTime(peakVol, now + params.attack);
        gain.gain.exponentialRampToValueAtTime(0.001, now + params.attack + params.duration);
        gain.gain.linearRampToValueAtTime(0, now + params.attack + params.duration + 0.02);
        
        const stopTime = now + params.attack + params.duration + 0.1;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        
        source.start(now);
        source.stop(stopTime);
    } 
    // VOICED (OSCILLATOR)
    else {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth'; // Standard voice wave

        // Use a generic pitch for debug
        const baseFreq = 150; 
        osc.frequency.setValueAtTime(baseFreq, now);
        // Add slight downward inflection
        osc.frequency.linearRampToValueAtTime(baseFreq * 0.9, now + params.duration);

        const f1 = audioCtx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.value = params.f1;
        f1.Q.value = 2.5; 

        const f2 = audioCtx.createBiquadFilter();
        f2.type = 'bandpass';
        f2.frequency.value = params.f2;
        f2.Q.value = 2.5;

        const gain = audioCtx.createGain();
        const peakVol = params.volMod;

        // Envelope
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        
        // Attack
        gain.gain.linearRampToValueAtTime(peakVol, now + params.attack);
        
        // Release
        gain.gain.exponentialRampToValueAtTime(0.001, now + params.attack + params.duration);
        gain.gain.linearRampToValueAtTime(0, now + params.attack + params.duration + 0.02);

        const stopTime = now + params.attack + params.duration + 0.1;

        osc.connect(f1);
        osc.connect(f2);
        
        f1.connect(gain);
        f2.connect(gain);
        
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(stopTime);
    }
};

const PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', '-', '—', '"', "'", ' ']);

// Cache for pre-rendered phonemes
const phonemeCache = new Map<string, AudioBuffer>();

function makeDistortionCurve(amount: number = 20) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

const renderPhonemeToBuffer = async (char: string, config: VoiceConfig, intonation: 'RISE' | 'FALL' | 'FLAT' = 'FLAT', isRadio: boolean = false): Promise<AudioBuffer | null> => {
    const lowerChar = char.toLowerCase();
    const phoneme = PHONEME_MAP[lowerChar] || PHONEME_MAP['default'];
    
    // Max duration for any phoneme is around 0.2 seconds
    const sampleRate = 44100;
    const duration = 0.2; 
    const offlineCtx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
    
    const startTime = 0;

    if (phoneme.type === 'sibilant') {
        // Create noise buffer for offline context
        const bufferSize = offlineCtx.sampleRate * duration;
        const noiseBuf = offlineCtx.createBuffer(1, bufferSize, offlineCtx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const source = offlineCtx.createBufferSource();
        source.buffer = noiseBuf;
        
        const filterType = phoneme.filterType || 'bandpass';
        const noiseFreq = phoneme.noiseFreq || 3000;
        const attackTime = phoneme.attack || 0.03; 
        const phonemeDuration = phoneme.duration || 0.08;

        const filter = offlineCtx.createBiquadFilter();
        filter.type = filterType; 
        filter.frequency.value = noiseFreq; 
        
        if (filterType === 'bandpass') {
            filter.Q.value = 1.0; 
        } else {
            filter.Q.value = 0.5; 
        }
        
        const gain = offlineCtx.createGain();
        
        gain.gain.setValueAtTime(0, startTime);
        
        let volMod = 0.08; 
        const peakVol = volMod * (config.volume || 1);
        
        gain.gain.linearRampToValueAtTime(peakVol, startTime + attackTime);
        gain.gain.setValueAtTime(peakVol, startTime + attackTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + phonemeDuration);
        gain.gain.linearRampToValueAtTime(0, startTime + phonemeDuration + 0.02);
        
        const stopTime = startTime + phonemeDuration + 0.1;

        source.connect(filter);
        filter.connect(gain);
        let finalNode: AudioNode = gain;
        
        if (isRadio) {
            const radioFilter = offlineCtx.createBiquadFilter();
            radioFilter.type = 'bandpass';
            radioFilter.frequency.value = 1500;
            radioFilter.Q.value = 1.5;

            const distortion = offlineCtx.createWaveShaper();
            distortion.curve = makeDistortionCurve(40);
            distortion.oversample = '4x';
            
            finalNode.connect(radioFilter);
            radioFilter.connect(distortion);
            finalNode = distortion;
        }
        
        finalNode.connect(offlineCtx.destination);
        
        source.start(startTime);
        source.stop(stopTime);

    } else {
        const osc = offlineCtx.createOscillator();
        osc.type = config.waveform || 'sawtooth';

        const baseFreq = 120 * config.pitch; 
        osc.frequency.setValueAtTime(baseFreq, startTime);
        
        if (intonation === 'RISE') {
            osc.frequency.linearRampToValueAtTime(baseFreq * 1.35, startTime + 0.12);
        } else if (intonation === 'FALL') {
            osc.frequency.setValueAtTime(baseFreq * 1.1, startTime);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, startTime + 0.08);
        } else {
            osc.frequency.linearRampToValueAtTime(baseFreq * 0.9, startTime + 0.1);
        }

        const shift = config.resonance || 1.0; 

        const f1 = offlineCtx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.value = phoneme.f1 * shift;
        f1.Q.value = 2.5; 

        const f2 = offlineCtx.createBiquadFilter();
        f2.type = 'bandpass';
        f2.frequency.value = phoneme.f2 * shift;
        f2.Q.value = 2.5;

        const gain = offlineCtx.createGain();
        
        let phonemeDuration = 0.05;
        let volMultiplier = 0.45;
        
        if (phoneme.type === 'vowel') {
            phonemeDuration = 0.09;
            volMultiplier = 0.7;
        } else if (phoneme.type === 'nasal') {
            phonemeDuration = 0.07;
            volMultiplier = 0.6;
        }

        const vol = (config.volume || 1.0) * volMultiplier;
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + phonemeDuration);
        gain.gain.linearRampToValueAtTime(0, startTime + phonemeDuration + 0.02);

        const stopTime = startTime + phonemeDuration + 0.1;

        osc.connect(f1);
        osc.connect(f2);
        
        f1.connect(gain);
        f2.connect(gain);
        
        let finalNode: AudioNode = gain;
        
        if (isRadio) {
            const radioFilter = offlineCtx.createBiquadFilter();
            radioFilter.type = 'bandpass';
            radioFilter.frequency.value = 1500;
            radioFilter.Q.value = 1.5;

            const distortion = offlineCtx.createWaveShaper();
            distortion.curve = makeDistortionCurve(40);
            distortion.oversample = '4x';
            
            finalNode.connect(radioFilter);
            radioFilter.connect(distortion);
            finalNode = distortion;
        }

        finalNode.connect(offlineCtx.destination);

        osc.start(startTime);
        osc.stop(stopTime);
    }

    return await offlineCtx.startRendering();
};

export const preloadVoice = async (config: VoiceConfig, isRadio: boolean = false) => {
    // Pre-render common characters to avoid stuttering during dialogue
    const charsToPreload = 'abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмнопрстуфхцчшщъыьэюя'.split('');
    const promises = charsToPreload.map(async (char) => {
        const cacheKey = `${char}_${config.pitch}_${config.resonance}_${config.volume}_${config.waveform}_FLAT_${isRadio ? 'radio' : 'normal'}`;
        if (!phonemeCache.has(cacheKey)) {
            const buffer = await renderPhonemeToBuffer(char, config, 'FLAT', isRadio);
            if (buffer) {
                phonemeCache.set(cacheKey, buffer);
            }
        }
    });
    await Promise.all(promises);
};

export const speakCharacter = (char: string, config: VoiceConfig, intonation: 'RISE' | 'FALL' | 'FLAT' = 'FLAT', isRadio: boolean = false, forceDry: boolean = false) => {
    if (!audioCtx || !masterGain) {
        initVoice();
        return; 
    }

    if (audioCtx.state === 'suspended') return;
    if (char.trim() === '') return;
    if (PUNCTUATION.has(char)) return;

    const now = audioCtx.currentTime;
    const startTime = now + 0.05; 

    // Throttle
    // Reduced from 0.030 to 0.025 to safeguard against dropped chars at high speeds (35ms delay + jitter)
    const MIN_INTERVAL = 0.025; 
    if (startTime - lastSpeakTime < MIN_INTERVAL) {
        return;
    }
    lastSpeakTime = startTime;

    const lowerChar = char.toLowerCase();
    
    // Check if we need to set up a dry node
    let targetNode: AudioNode = masterGain as AudioNode;
    if (forceDry && audioCtx) {
        const dryGain = audioCtx.createGain();
        dryGain.gain.value = 4.0 * globalVolumeMultiplier;
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -10;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;
        dryGain.connect(compressor);
        compressor.connect(audioCtx.destination);
        targetNode = dryGain;
    }

    const cacheKey = `${lowerChar}_${config.pitch}_${config.resonance}_${config.volume}_${config.waveform}_${intonation}_${isRadio ? 'radio' : 'normal'}`;
    let buffer = phonemeCache.get(cacheKey);

    if (buffer) {
        // Play pre-rendered buffer
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(targetNode);
        source.start(startTime);
    } else {
        // Fallback to real-time generation if not pre-rendered
        // (This shouldn't happen often if preloadVoice is called)
        renderPhonemeToBuffer(lowerChar, config, intonation, isRadio).then(renderedBuffer => {
            if (renderedBuffer) {
                phonemeCache.set(cacheKey, renderedBuffer);
                // We don't play it here because it would be out of sync, 
                // but it's cached for next time.
            }
        });
        
        // --- SOUND GENERATION (Real-time fallback) ---
        const phoneme = PHONEME_MAP[lowerChar] || PHONEME_MAP['default'];

        if (phoneme.type === 'sibilant' && noiseBuffer) {
            // SIBILANT (S, SH, F, X, etc.)
            const source = audioCtx.createBufferSource();
            source.buffer = noiseBuffer;
            
            // --- INDIVIDUAL SETTINGS ---
            const filterType = phoneme.filterType || 'bandpass';
            const noiseFreq = phoneme.noiseFreq || 3000;
            const attackTime = phoneme.attack || 0.03; 
            const duration = phoneme.duration || 0.08;

            const filter = audioCtx.createBiquadFilter();
            filter.type = filterType; 
            filter.frequency.value = noiseFreq; 
            
            // Use 0.5 Q for Highpass to get broadband noise without a resonance peak (whistle)
            if (filterType === 'bandpass') {
                filter.Q.value = 1.0; 
            } else {
                filter.Q.value = 0.5; 
            }
            
            const gain = audioCtx.createGain();
            
            // --- ENVELOPE ANTI-CLICK PROTECTION ---
            gain.gain.cancelScheduledValues(startTime);
            gain.gain.setValueAtTime(0, startTime);
            
            let volMod = 0.08; 
            const peakVol = volMod * (config.volume || 1);
            
            // Attack
            // Slow attack (0.1s for 's') builds the sound gently
            gain.gain.linearRampToValueAtTime(peakVol, startTime + attackTime);
            
            // Release
            // Instead of linear ramp to 0, use exponential ramp for a smoother "tail"
            // This prevents the sudden cutoff that sounds like "SH"
            gain.gain.setValueAtTime(peakVol, startTime + attackTime);
            // Fade out to 1% volume
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            // Then fully silence (to avoid DC offset)
            gain.gain.linearRampToValueAtTime(0, startTime + duration + 0.02);
            
            const stopTime = startTime + duration + 0.1;

            source.connect(filter);
            filter.connect(gain);
            let finalNode: AudioNode = gain;
            
            if (isRadio) {
                const radioFilter = audioCtx.createBiquadFilter();
                radioFilter.type = 'bandpass';
                radioFilter.frequency.value = 1500;
                radioFilter.Q.value = 1.5;

                const distortion = audioCtx.createWaveShaper();
                distortion.curve = makeDistortionCurve(40);
                distortion.oversample = '4x';
                
                finalNode.connect(radioFilter);
                radioFilter.connect(distortion);
                finalNode = distortion;
            }

            finalNode.connect(targetNode);
            
            source.start(startTime);
            source.stop(stopTime);

        } else {
            // VOICED (Vowels, Nasals, Voiced Consonants)
            const osc = audioCtx.createOscillator();
            osc.type = config.waveform || 'sawtooth';

            const baseFreq = 120 * config.pitch; 
            osc.frequency.setValueAtTime(baseFreq, startTime);
            
            if (intonation === 'RISE') {
                osc.frequency.linearRampToValueAtTime(baseFreq * 1.35, startTime + 0.12);
            } else if (intonation === 'FALL') {
                osc.frequency.setValueAtTime(baseFreq * 1.1, startTime);
                osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, startTime + 0.08);
            } else {
                osc.frequency.linearRampToValueAtTime(baseFreq * 0.9, startTime + 0.1);
            }

            const shift = config.resonance || 1.0; 

            const f1 = audioCtx.createBiquadFilter();
            f1.type = 'bandpass';
            f1.frequency.value = phoneme.f1 * shift;
            f1.Q.value = 2.5; 

            const f2 = audioCtx.createBiquadFilter();
            f2.type = 'bandpass';
            f2.frequency.value = phoneme.f2 * shift;
            f2.Q.value = 2.5;

            const gain = audioCtx.createGain();
            
            let duration = 0.05;
            let volMultiplier = 0.45;
            
            if (phoneme.type === 'vowel') {
                duration = 0.09;
                volMultiplier = 0.7;
            } else if (phoneme.type === 'nasal') {
                duration = 0.07;
                volMultiplier = 0.6;
            }

            const vol = (config.volume || 1.0) * volMultiplier;
            
            // --- ENVELOPE PROTECTION ---
            gain.gain.cancelScheduledValues(startTime);
            gain.gain.setValueAtTime(0, startTime);
            
            // Soft Attack
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
            
            // Release to ZERO
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            gain.gain.linearRampToValueAtTime(0, startTime + duration + 0.02);

            // Stop later
            const stopTime = startTime + duration + 0.1;

            osc.connect(f1);
            osc.connect(f2);
            
            f1.connect(gain);
            f2.connect(gain);
            
            let finalNode: AudioNode = gain;
            
            if (isRadio) {
                const radioFilter = audioCtx.createBiquadFilter();
                radioFilter.type = 'bandpass';
                radioFilter.frequency.value = 1500;
                radioFilter.Q.value = 1.5;

                const distortion = audioCtx.createWaveShaper();
                distortion.curve = makeDistortionCurve(40);
                distortion.oversample = '4x';
                
                finalNode.connect(radioFilter);
                radioFilter.connect(distortion);
                finalNode = distortion;
            }

            finalNode.connect(targetNode);

            osc.start(startTime);
            osc.stop(stopTime);
        }
    }
};
