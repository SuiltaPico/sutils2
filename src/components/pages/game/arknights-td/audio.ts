import mission_accomplished from './assets/mission_accomplished.mp3?url';


/**
 * Arknights TD Audio System
 * Uses Web Audio API to synthesize sound effects with physically modeled characteristics
 */

class AudioSystem {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isInitialized = false;
  private victoryBuffer: AudioBuffer | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();

  constructor() {
    // We'll initialize on first user interaction
  }

  public init() {
    if (this.isInitialized) return;
    
    try {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.masterGain.gain.value = 0.3; // Default master volume
      this.isInitialized = true;
      
      if (this.context.state === 'suspended') {
        this.context.resume();
      }

      // Load assets
      this.loadAudio(mission_accomplished).then(buffer => {
        if (buffer) {
          this.victoryBuffer = buffer;
          this.bufferCache.set(mission_accomplished, buffer);
        }
      });

    } catch (e) {
      console.error('Failed to initialize AudioContext', e);
    }
  }

  private async loadAudio(url: string): Promise<AudioBuffer | null> {
    if (!this.context) return null;
    if (this.bufferCache.has(url)) return this.bufferCache.get(url)!;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(arrayBuffer);
      this.bufferCache.set(url, buffer);
      return buffer;
    } catch (e) {
      console.error('Failed to load audio:', url, e);
      return null;
    }
  }

  public async playUrlSound(url: string) {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    
    const buffer = await this.loadAudio(url);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    source.start();
  }

  private createNoiseBuffer(): AudioBuffer {
    if (!this.context) throw new Error("Audio context not initialized");
    const bufferSize = this.context.sampleRate * 2.0; // 2 seconds of noise
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // Helper for ADSR Envelope
  private applyADSR(param: AudioParam, time: number, attack: number, decay: number, sustainLevel: number, release: number, peakVal: number = 1.0) {
    param.cancelScheduledValues(time);
    param.setValueAtTime(0, time);
    param.linearRampToValueAtTime(peakVal, time + attack);
    param.exponentialRampToValueAtTime(Math.max(0.001, peakVal * sustainLevel), time + attack + decay);
    param.exponentialRampToValueAtTime(0.001, time + attack + decay + release);
  }

  public playShootSound(type: 'SNIPER' | 'GUARD' | 'DEFENDER' | 'MAGIC') {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    
    const now = this.context.currentTime;
    
    switch (type) {
      case 'SNIPER':
        this.playWhizzSound(now);
        break;
      case 'GUARD':
        this.playSwordSound(now);
        break;
      case 'DEFENDER':
        this.playShieldBashSound(now);
        break;
      case 'MAGIC':
        this.playMagicSound(now);
        break;
    }
  }

  /**
   * SNIPER: High-tension Bow Release & Projectile Whistle
   * Physics: String snap (High freq noise) + Sonic Boom/Air Burst (White Noise burst)
   * Removing tonal elements to simulate pure air displacement
   */
  private playWhizzSound(t: number) {
    if (!this.context || !this.masterGain) return;
    const ctx = this.context;

    // 1. Sonic Boom / Air Burst (The main body)
    // A burst of white noise with a fast low-pass filter sweep
    const burst = ctx.createBufferSource();
    burst.buffer = this.createNoiseBuffer();
    
    const burstFilter = ctx.createBiquadFilter();
    burstFilter.type = 'lowpass';
    // Start open (sharp snap) -> close quickly (muffled air)
    burstFilter.frequency.setValueAtTime(12000, t);
    burstFilter.frequency.exponentialRampToValueAtTime(400, t + 0.15);
    burstFilter.Q.value = 1;

    const burstGain = ctx.createGain();
    // Very fast attack, short decay - punchy
    this.applyADSR(burstGain.gain, t, 0.001, 0.08, 0, 0.02, 0.8);

    burst.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(this.masterGain);
    
    burst.start(t);
    burst.stop(t + 0.15);

    // 2. High-freq "Zip" (Air friction)
    // A secondary layer of high-pass noise to add "crispness"
    const zip = ctx.createBufferSource();
    zip.buffer = this.createNoiseBuffer();
    
    const zipFilter = ctx.createBiquadFilter();
    zipFilter.type = 'highpass';
    zipFilter.frequency.value = 5000;
    
    const zipGain = ctx.createGain();
    this.applyADSR(zipGain.gain, t, 0.005, 0.05, 0, 0.05, 0.3);

    zip.connect(zipFilter);
    zipFilter.connect(zipGain);
    zipGain.connect(this.masterGain);

    zip.start(t);
    zip.stop(t + 0.1);
  }

  /**
   * GUARD: Sword Slice / Air Cutter
   * Physics: Sharp Air Displacement (Whoosh) + Thin Blade Resonance (Ring)
   */
  private playSwordSound(t: number) {
    if (!this.context || !this.masterGain) return;
    const ctx = this.context;

    // 1. "Whoosh" - Sharp Air cutting (Primary sound)
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0; // Moderate resonance to sound like "wind"
    // Filter Sweep: Starts mid, sweeps high very quickly
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(6000, t + 0.12);
    
    const noiseGain = ctx.createGain();
    // Clear attack, very short body - precise cut
    this.applyADSR(noiseGain.gain, t, 0.01, 0.1, 0.1, 0.05, 0.7);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.2);

    // 2. "Blade Sing" - Metallic Resonance (Background texture)
    // Higher frequencies = thinner blade, Slower attack = no "impact" sound
    const partials = [2400, 4800, 7200]; // Harmonic series (approx) for a singing blade
    const metalGain = ctx.createGain();
    
    // Smooth attack to blend BEHIND the whoosh, long release
    this.applyADSR(metalGain.gain, t, 0.04, 0.1, 0.1, 0.3, 0.04); 
    metalGain.connect(this.masterGain);

    partials.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      osc.connect(metalGain);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /**
   * DEFENDER: Heavy Impact / Shield Bash
   * Physics: Large mass impact (Low freq thud) + Material crunch (Transient noise)
   */
  private playShieldBashSound(t: number) {
    if (!this.context || !this.masterGain) return;
    const ctx = this.context;

    // 1. The Body (Thud) - Low frequency Sine drop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);

    const oscGain = ctx.createGain();
    this.applyADSR(oscGain.gain, t, 0.001, 0.1, 0, 0.05, 0.8);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);

    // 2. The Impact (Crunch) - Lowpassed noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(100, t + 0.1); // Closing filter

    const noiseGain = ctx.createGain();
    this.applyADSR(noiseGain.gain, t, 0.001, 0.05, 0, 0, 0.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.1);
  }

  /**
   * MAGIC: Arcane Energy
   * Physics: Synthesized, unstable waveforms with modulation
   */
  private playMagicSound(t: number) {
    if (!this.context || !this.masterGain) return;
    const ctx = this.context;

    // 1. Core Energy - Detuned Sawtooth waves
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.value = 400;
    osc2.frequency.value = 404; // Detune

    // 2. Filter Modulation (Wah-wah effect)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 5; // High resonance
    
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 12; // 12Hz wobble
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500; // Filter cutoff range
    
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    filter.frequency.value = 800; // Base cutoff

    const mainGain = ctx.createGain();
    this.applyADSR(mainGain.gain, t, 0.05, 0.1, 0.5, 0.2, 0.3);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    lfo.start(t);
    
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);
    lfo.stop(t + 0.4);
  }

  /**
   * HIT: Physical Impact (Generic)
   */
  public playHitSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // Quick burst of mid-frequency noise for "Slap/Hit" sound
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    
    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.001, 0.05, 0, 0, 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start(t);
    noise.stop(t + 0.1);
  }

  /**
   * RETREAT/DIE: Operator leaving the field
   */
  public playRetreatSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // A descending tone to indicate withdrawal/defeat
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.3);

    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.05, 0.1, 0.2, 0.15, 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  public playVictorySound() {
    if (!this.isInitialized || !this.context || !this.masterGain || !this.victoryBuffer) return;
    
    const source = this.context.createBufferSource();
    source.buffer = this.victoryBuffer;
    source.connect(this.masterGain);
    source.start();
  }

  /**
   * START ACTION: Military Horn / Battle Ready
   * Inspirational, commanding tone - ready for combat
   */
  public playStartActionSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // 1. Horn Call - Strong fundamental with harmonics
    const fundamental = 220; // A3 - commanding tone
    const harmonics = [1, 2, 3, 4, 5]; // Rich harmonic series
    
    const hornGain = ctx.createGain();
    this.applyADSR(hornGain.gain, t, 0.1, 0.2, 0.7, 0.4, 0.6);
    hornGain.connect(this.masterGain);

    harmonics.forEach((ratio, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle'; // Warm, brass-like tone
      osc.frequency.value = fundamental * ratio;
      
      const partialGain = ctx.createGain();
      partialGain.gain.value = 1 / (ratio * 1.5); // Reduce higher harmonics
      
      osc.connect(partialGain);
      partialGain.connect(hornGain);
      osc.start(t);
      osc.stop(t + 1.0);
    });

    // 2. Breath/Air texture (White noise through bandpass)
    const breath = ctx.createBufferSource();
    breath.buffer = this.createNoiseBuffer();
    
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = 1200;
    breathFilter.Q.value = 2;
    
    const breathGain = ctx.createGain();
    this.applyADSR(breathGain.gain, t, 0.05, 0.15, 0.3, 0.3, 0.12);
    
    breath.connect(breathFilter);
    breathFilter.connect(breathGain);
    breathGain.connect(this.masterGain);
    breath.start(t);
    breath.stop(t + 1.0);
  }

  /**
   * LEVEL SELECT: UI Confirmation Click
   * Crisp, satisfying tactical interface sound
   */
  public playLevelSelectSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // 1. Mechanical Click (High-freq burst)
    const click = ctx.createBufferSource();
    click.buffer = this.createNoiseBuffer();
    
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 2000;
    
    const clickGain = ctx.createGain();
    this.applyADSR(clickGain.gain, t, 0.001, 0.02, 0, 0, 0.3);
    
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.masterGain);
    click.start(t);
    click.stop(t + 0.05);

    // 2. UI Tone (Short ping)
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(1200, t);
    tone.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
    
    const toneGain = ctx.createGain();
    this.applyADSR(toneGain.gain, t + 0.005, 0.005, 0.04, 0, 0, 0.15);
    
    tone.connect(toneGain);
    toneGain.connect(this.masterGain);
    tone.start(t + 0.005);
    tone.stop(t + 0.1);
  }

  /**
   * MISSION FAILED: Dramatic Defeat
   * Dark, descending tones with dissonance
   */
  public playMissionFailedSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // 1. Deep Impact / Thud
    const impact = ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(80, t);
    impact.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    
    const impactGain = ctx.createGain();
    this.applyADSR(impactGain.gain, t, 0.01, 0.3, 0.3, 0.5, 0.8);
    
    impact.connect(impactGain);
    impactGain.connect(this.masterGain);
    impact.start(t);
    impact.stop(t + 1.2);

    // 2. Dissonant Drone (Minor second interval - very tense)
    const drone1 = ctx.createOscillator();
    const drone2 = ctx.createOscillator();
    drone1.type = 'sawtooth';
    drone2.type = 'sawtooth';
    drone1.frequency.value = 110; // A2
    drone2.frequency.value = 116.5; // A#2 - creates tension
    
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.setValueAtTime(800, t);
    droneFilter.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    droneFilter.Q.value = 2;
    
    const droneGain = ctx.createGain();
    this.applyADSR(droneGain.gain, t + 0.1, 0.2, 0.4, 0.5, 0.8, 0.25);
    
    drone1.connect(droneFilter);
    drone2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(this.masterGain);
    
    drone1.start(t + 0.1);
    drone2.start(t + 0.1);
    drone1.stop(t + 2.0);
    drone2.stop(t + 2.0);

    // 3. Static/Glitch texture
    const glitch = ctx.createBufferSource();
    glitch.buffer = this.createNoiseBuffer();
    
    const glitchFilter = ctx.createBiquadFilter();
    glitchFilter.type = 'bandpass';
    glitchFilter.frequency.value = 3000;
    glitchFilter.Q.value = 5;
    
    const glitchGain = ctx.createGain();
    // Stuttering effect by ramping gain up/down
    glitchGain.gain.setValueAtTime(0, t);
    glitchGain.gain.linearRampToValueAtTime(0.1, t + 0.05);
    glitchGain.gain.linearRampToValueAtTime(0, t + 0.1);
    glitchGain.gain.linearRampToValueAtTime(0.08, t + 0.15);
    glitchGain.gain.linearRampToValueAtTime(0, t + 0.2);
    glitchGain.gain.linearRampToValueAtTime(0.05, t + 0.3);
    glitchGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    
    glitch.connect(glitchFilter);
    glitchFilter.connect(glitchGain);
    glitchGain.connect(this.masterGain);
    glitch.start(t);
    glitch.stop(t + 1.2);
  }

  /**
   * BURN: Ignition and Fire Crackling
   * Physics: Rapid combustion burst + continuous crackling
   */
  public playBurnSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // 1. Ignition Burst - Sharp whoosh
    const ignition = ctx.createBufferSource();
    ignition.buffer = this.createNoiseBuffer();
    
    const ignitionFilter = ctx.createBiquadFilter();
    ignitionFilter.type = 'bandpass';
    ignitionFilter.frequency.setValueAtTime(3000, t);
    ignitionFilter.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    ignitionFilter.Q.value = 2;
    
    const ignitionGain = ctx.createGain();
    this.applyADSR(ignitionGain.gain, t, 0.001, 0.08, 0.2, 0.1, 0.6);
    
    ignition.connect(ignitionFilter);
    ignitionFilter.connect(ignitionGain);
    ignitionGain.connect(this.masterGain);
    ignition.start(t);
    ignition.stop(t + 0.3);

    // 2. Fire Crackling - Filtered noise with modulation
    const crackle = ctx.createBufferSource();
    crackle.buffer = this.createNoiseBuffer();
    
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'highpass';
    crackleFilter.frequency.value = 1500;
    
    const crackleGain = ctx.createGain();
    // Stuttering effect for crackling
    crackleGain.gain.setValueAtTime(0, t);
    crackleGain.gain.linearRampToValueAtTime(0.15, t + 0.02);
    crackleGain.gain.linearRampToValueAtTime(0.05, t + 0.06);
    crackleGain.gain.linearRampToValueAtTime(0.12, t + 0.1);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    
    crackle.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(this.masterGain);
    crackle.start(t);
    crackle.stop(t + 0.3);

    // 3. Low rumble - Heat energy
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(80, t);
    rumble.frequency.exponentialRampToValueAtTime(120, t + 0.2);
    
    const rumbleGain = ctx.createGain();
    this.applyADSR(rumbleGain.gain, t + 0.05, 0.05, 0.1, 0.3, 0.15, 0.25);
    
    rumble.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);
    rumble.start(t + 0.05);
    rumble.stop(t + 0.4);
  }

  /**
   * HEAL: Soothing Restoration
   * Physics: Soft chimes with warm overtones
   */
  public playHealSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // 1. Chime - Pure tones in major chord
    const chimeFreqs = [523.25, 659.25, 783.99]; // C major chord (C5, E5, G5)
    const chimeGain = ctx.createGain();
    this.applyADSR(chimeGain.gain, t, 0.01, 0.15, 0.4, 0.3, 0.4);
    chimeGain.connect(this.masterGain);

    chimeFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const partialGain = ctx.createGain();
      partialGain.gain.value = 1 / (idx + 1); // Reduce higher notes
      
      osc.connect(partialGain);
      partialGain.connect(chimeGain);
      osc.start(t + idx * 0.03); // Slight delay for arpeggio effect
      osc.stop(t + 0.6);
    });

    // 2. Shimmer - High frequency sparkle
    const shimmer = ctx.createBufferSource();
    shimmer.buffer = this.createNoiseBuffer();
    
    const shimmerFilter = ctx.createBiquadFilter();
    shimmerFilter.type = 'highpass';
    shimmerFilter.frequency.value = 4000;
    
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0, t);
    shimmerGain.gain.linearRampToValueAtTime(0.08, t + 0.1);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    
    shimmer.connect(shimmerFilter);
    shimmerFilter.connect(shimmerGain);
    shimmerGain.connect(this.masterGain);
    shimmer.start(t);
    shimmer.stop(t + 0.5);

    // 3. Warm pad - Sustained warmth
    const pad = ctx.createOscillator();
    pad.type = 'triangle';
    pad.frequency.value = 261.63; // C4
    
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 800;
    padFilter.Q.value = 1;
    
    const padGain = ctx.createGain();
    this.applyADSR(padGain.gain, t, 0.1, 0.2, 0.3, 0.4, 0.15);
    
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.masterGain);
    pad.start(t);
    pad.stop(t + 0.8);
  }

  /**
   * FREEZE: Crystallization
   * Physics: Sharp icy cracks with crystalline resonance
   */
  public playFreezeSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;
    const master = this.masterGain;

    // 1. Crystallization - High frequency sweep
    const crystal = ctx.createOscillator();
    crystal.type = 'sine';
    crystal.frequency.setValueAtTime(3000, t);
    crystal.frequency.exponentialRampToValueAtTime(5000, t + 0.3);
    
    const crystalGain = ctx.createGain();
    this.applyADSR(crystalGain.gain, t, 0.001, 0.15, 0.2, 0.2, 0.35);
    
    crystal.connect(crystalGain);
    crystalGain.connect(master);
    crystal.start(t);
    crystal.stop(t + 0.5);

    // 2. Ice Crack - Sharp noise burst
    const crack = ctx.createBufferSource();
    crack.buffer = this.createNoiseBuffer();
    
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.value = 2000;
    
    const crackGain = ctx.createGain();
    this.applyADSR(crackGain.gain, t, 0.001, 0.05, 0, 0, 0.4);
    
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(master);
    crack.start(t);
    crack.stop(t + 0.1);

    // 3. Resonant Chimes - Crystal harmonics
    [2000, 3000, 4500].forEach((freq, idx) => {
      const chime = ctx.createOscillator();
      chime.type = 'sine';
      chime.frequency.value = freq;
      
      const chimeGain = ctx.createGain();
      this.applyADSR(chimeGain.gain, t + idx * 0.05, 0.01, 0.15, 0, 0.2, 0.15);
      
      chime.connect(chimeGain);
      chimeGain.connect(master);
      chime.start(t + idx * 0.05);
      chime.stop(t + 0.6);
    });
  }

  /**
   * DETONATE: Massive Explosion
   * Physics: Deep impact + expanding shockwave + debris
   */
  public playDetonateSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // 1. Impact - Deep bass drop
    const impact = ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(200, t);
    impact.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    
    const impactGain = ctx.createGain();
    this.applyADSR(impactGain.gain, t, 0.001, 0.2, 0.4, 0.3, 1.0);
    
    impact.connect(impactGain);
    impactGain.connect(this.masterGain);
    impact.start(t);
    impact.stop(t + 0.8);

    // 2. Shockwave - Expanding noise burst
    const shockwave = ctx.createBufferSource();
    shockwave.buffer = this.createNoiseBuffer();
    
    const shockFilter = ctx.createBiquadFilter();
    shockFilter.type = 'bandpass';
    shockFilter.frequency.setValueAtTime(4000, t);
    shockFilter.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    shockFilter.Q.value = 3;
    
    const shockGain = ctx.createGain();
    shockGain.gain.setValueAtTime(0, t);
    shockGain.gain.linearRampToValueAtTime(0.8, t + 0.02);
    shockGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    
    shockwave.connect(shockFilter);
    shockFilter.connect(shockGain);
    shockGain.connect(this.masterGain);
    shockwave.start(t);
    shockwave.stop(t + 0.7);

    // 3. Debris - Scattered impacts
    for (let i = 0; i < 5; i++) {
      const debris = ctx.createBufferSource();
      debris.buffer = this.createNoiseBuffer();
      
      const debrisFilter = ctx.createBiquadFilter();
      debrisFilter.type = 'lowpass';
      debrisFilter.frequency.value = 800 + Math.random() * 400;
      
      const debrisGain = ctx.createGain();
      const delay = 0.1 + Math.random() * 0.3;
      this.applyADSR(debrisGain.gain, t + delay, 0.001, 0.05, 0, 0, Math.random() * 0.3 + 0.2);
      
      debris.connect(debrisFilter);
      debrisFilter.connect(debrisGain);
      debrisGain.connect(this.masterGain);
      debris.start(t + delay);
      debris.stop(t + delay + 0.1);
    }
  }

  /**
   * ENCHANT: Buff Applied
   * Physics: Magical shimmer with ascending tones
   */
  public playEnchantSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;

    // Ascending arpeggio
    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    const mainGain = ctx.createGain();
    this.applyADSR(mainGain.gain, t, 0.01, 0.3, 0.2, 0.3, 0.4);
    mainGain.connect(this.masterGain);

    const master = this.masterGain!;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      osc.connect(mainGain);
      osc.start(t + idx * 0.08);
      osc.stop(t + 0.8);
    });

    // Sparkle
    const sparkle = ctx.createBufferSource();
    sparkle.buffer = this.createNoiseBuffer();
    
    const sparkleFilter = ctx.createBiquadFilter();
    sparkleFilter.type = 'highpass';
    sparkleFilter.frequency.value = 5000;
    
    const sparkleGain = ctx.createGain();
    sparkleGain.gain.setValueAtTime(0, t);
    sparkleGain.gain.linearRampToValueAtTime(0.1, t + 0.1);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    
    sparkle.connect(sparkleFilter);
    sparkleFilter.connect(sparkleGain);
    sparkleGain.connect(master);
    sparkle.start(t);
    sparkle.stop(t + 0.5);
  }

  /**
   * LEAK WARNING: Enemy reached the exit
   * URGENT multi-layer alarm - sirens, sharp beeps, distortion
   */
  public playLeakWarningSound() {
    if (!this.isInitialized || !this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const ctx = this.context;
    const master = this.masterGain;

    // 1. SIREN - Rising and falling pitch (Emergency vehicle sound)
    const siren = ctx.createOscillator();
    siren.type = 'sawtooth';
    siren.frequency.setValueAtTime(600, t);
    siren.frequency.linearRampToValueAtTime(1200, t + 0.15);
    siren.frequency.linearRampToValueAtTime(600, t + 0.3);
    
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.value = 1500;
    sirenFilter.Q.value = 3;
    
    const sirenGain = ctx.createGain();
    sirenGain.gain.setValueAtTime(0.5, t);
    sirenGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    
    siren.connect(sirenFilter);
    sirenFilter.connect(sirenGain);
    sirenGain.connect(master);
    siren.start(t);
    siren.stop(t + 0.35);

    // 2. TRIPLE SHARP BEEPS - Rapid fire alarm
    [0, 0.08, 0.16].forEach(delay => {
      const now = t + delay;
      
      // High-pitched square wave
      const beep = ctx.createOscillator();
      beep.type = 'square';
      beep.frequency.value = 1760; // A6 - very high, piercing
      
      const beepGain = ctx.createGain();
      this.applyADSR(beepGain.gain, now, 0.001, 0.04, 0, 0, 0.7);
      
      beep.connect(beepGain);
      beepGain.connect(master);
      beep.start(now);
      beep.stop(now + 0.06);
    });

    // 3. DISTORTION BURST - Harsh digital glitch
    const burst = ctx.createBufferSource();
    burst.buffer = this.createNoiseBuffer();
    
    const burstFilter = ctx.createBiquadFilter();
    burstFilter.type = 'bandpass';
    burstFilter.frequency.setValueAtTime(2000, t);
    burstFilter.frequency.linearRampToValueAtTime(4000, t + 0.1);
    burstFilter.Q.value = 8; // Very resonant
    
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(0.3, t);
    burstGain.gain.linearRampToValueAtTime(0.5, t + 0.05);
    burstGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    
    burst.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(master);
    burst.start(t);
    burst.stop(t + 0.2);

    // 4. LOW IMPACT - Adds weight and urgency
    const impact = ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(100, t);
    impact.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    
    const impactGain = ctx.createGain();
    this.applyADSR(impactGain.gain, t, 0.001, 0.08, 0, 0, 0.6);
    
    impact.connect(impactGain);
    impactGain.connect(master);
    impact.start(t);
    impact.stop(t + 0.15);

    // 5. DISSONANT CHORD - Creates tension
    [1320, 1397].forEach((freq, idx) => {
      const chord = ctx.createOscillator();
      chord.type = 'triangle';
      chord.frequency.value = freq; // Dissonant minor second
      
      const chordGain = ctx.createGain();
      this.applyADSR(chordGain.gain, t + 0.02, 0.01, 0.15, 0, 0, 0.25);
      
      chord.connect(chordGain);
      chordGain.connect(master);
      chord.start(t + 0.02);
      chord.stop(t + 0.25);
    });
  }

  // --- BGM System (House Music) ---
  private bgmTimer: any = null;
  private bgmBPM = 125;
  private bgmStep = 0;
  private isBgmPlaying = false;
  private bgmGain: GainNode | null = null;

  public startBGM() {
    if (!this.isInitialized || !this.context || !this.masterGain || this.isBgmPlaying) return;
    this.isBgmPlaying = true;
    this.bgmStep = 0;
    
    if (!this.bgmGain) {
      this.bgmGain = this.context.createGain();
      this.bgmGain.connect(this.masterGain);
      this.bgmGain.gain.value = 0.35;
    }

    const stepDuration = 60 / this.bgmBPM / 4; // 16th notes
    const lookAhead = 0.1; // 100ms lookahead
    let nextStepTime = this.context.currentTime + 0.1;
    const ctx = this.context;

    const scheduler = () => {
      if (!this.isBgmPlaying) return;
      while (nextStepTime < ctx.currentTime + lookAhead) {
        this.playBGMStep(this.bgmStep, nextStepTime);
        nextStepTime += stepDuration;
        this.bgmStep = (this.bgmStep + 1) % 256; // 16 bars loop (16 steps per bar)
      }
      this.bgmTimer = setTimeout(scheduler, 25);
    };

    scheduler();
  }

  public stopBGM() {
    this.isBgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playBGMStep(step: number, t: number) {
    const ctx = this.context!;
    const bar = Math.floor(step / 16); // Which bar (0-15)
    const beat = Math.floor((step % 16) / 4); // Which beat in bar (0-3)
    const sub = step % 4; // Which 16th note in beat (0-3)

    // === 1. DRUMS ===
    // Kick: Classic House four-on-the-floor
    if (step % 4 === 0) {
      this.playHouseKick(t, bar);
    }
    
    // Clap/Snare on 2 and 4 (beats 1 and 3 in 0-indexed)
    if (step % 16 === 4 || step % 16 === 12) {
      this.playHouseClap(t);
    }
    
    // Hi-hat pattern (16th notes with velocity variation)
    if (step % 2 === 0) {
      const isOffbeat = step % 4 === 2;
      this.playHouseHiHat(t, isOffbeat);
    }
    
    // Open hi-hat occasionally
    if (step % 32 === 14 || step % 32 === 30) {
      this.playOpenHat(t);
    }

    // === 2. BASS LINE (Dm - Am - F - C progression) ===
    const chordProg = [
      { root: 38, notes: [38, 41, 45] }, // Dm (D2, F2, A2)
      { root: 33, notes: [33, 36, 40] }, // Am (A1, C2, E2)
      { root: 29, notes: [29, 33, 36] }, // F  (F1, A1, C2)
      { root: 36, notes: [36, 40, 43] }, // C  (C2, E2, G2)
    ];
    const currentChord = chordProg[Math.floor(bar / 4) % 4];
    
    // Bass hits on specific rhythmic pattern
    const bassPattern = [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1];
    if (bassPattern[step % 16]) {
      this.playHouseBass(this.mtof(currentChord.root), t, (step % 16) === 0);
    }

    // === 3. SYNTH PAD (Warm atmospheric chords) ===
    // Play sustained pad chords at the start of each 2-bar phrase
    if (step % 32 === 0) {
      this.playHousePad(currentChord.notes.map(n => this.mtof(n + 24)), t);
    }

    // === 4. PLUCK ARPEGGIO ===
    // Starts from bar 4 for musical development
    if (bar >= 4) {
      const arpPattern = [1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0];
      if (arpPattern[step % 16]) {
        const noteIdx = Math.floor((step % 16) / 2) % 3;
        const octaveShift = ((step % 32) < 16) ? 36 : 48; // Vary octave every 2 bars
        this.playHousePluck(this.mtof(currentChord.notes[noteIdx] + octaveShift), t);
      }
    }

    // === 5. LEAD MELODY ===
    // Enters at bar 8 for progression
    if (bar >= 8) {
      const melody = this.getHouseMelody(bar % 8);
      const noteInBar = step % 16;
      const melodyNote = melody[noteInBar];
      
      if (melodyNote !== -1) {
        this.playHouseLead(this.mtof(melodyNote), t, noteInBar % 4 === 0);
      }
    }

    // === 6. FX & TRANSITIONS ===
    // Riser effect every 8 bars
    if (step % 128 === 120) {
      this.playRiser(t);
    }
    
    // Down sweep at start of major sections
    if (step % 128 === 0 && step > 0) {
      this.playDownSweep(t);
    }
  }

  // === HOUSE MUSIC MELODIC CONTENT ===
  private getHouseMelody(barInPhrase: number): number[] {
    // 8-bar melodic phrases (Dm - Am - F - C, repeated twice)
    const melodies = [
      // Bars 0-1 (Dm)
      [74, -1, 74, 72, -1, 69, -1, 67, 69, -1, -1, -1, -1, -1, -1, -1],
      [72, -1, 72, 74, -1, 76, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
      // Bars 2-3 (Am)
      [76, -1, 76, 74, -1, 72, -1, 69, 72, -1, -1, -1, -1, -1, -1, -1],
      [74, -1, 74, 76, -1, 77, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
      // Bars 4-5 (F)
      [77, -1, 77, 76, -1, 74, -1, 72, 74, -1, -1, -1, -1, -1, -1, -1],
      [76, -1, 76, 77, -1, 79, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
      // Bars 6-7 (C)
      [79, -1, 79, 77, -1, 76, -1, 74, 76, -1, 77, -1, 79, -1, -1, -1],
      [81, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    ];
    return melodies[barInPhrase];
  }

  private mtof(m: number): number {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // === IMPROVED DRUM SOUNDS ===
  private playHouseKick(t: number, bar: number) {
    const ctx = this.context!;
    
    // Punchy kick with pitch envelope
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    
    // Add harmonics for body
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(100, t);
    osc2.frequency.exponentialRampToValueAtTime(30, t + 0.1);
    
    const gain = ctx.createGain();
    const gain2 = ctx.createGain();
    
    this.applyADSR(gain.gain, t, 0.001, 0.12, 0, 0.05, 0.9);
    this.applyADSR(gain2.gain, t, 0.003, 0.08, 0, 0.03, 0.3);
    
    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(this.bgmGain!);
    gain2.connect(this.bgmGain!);
    
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.25);
    osc2.stop(t + 0.15);
  }

  private playHouseClap(t: number) {
    const ctx = this.context!;
    
    // Layered clap/snare
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 2;
    
    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.002, 0.08, 0.1, 0.1, 0.5);
    
    // Add tonal body
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = 200;
    const toneGain = ctx.createGain();
    this.applyADSR(toneGain.gain, t, 0.001, 0.05, 0, 0, 0.15);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);
    
    tone.connect(toneGain);
    toneGain.connect(this.bgmGain!);
    
    noise.start(t);
    tone.start(t);
    noise.stop(t + 0.2);
    tone.stop(t + 0.08);
  }

  private playHouseHiHat(t: number, isOffbeat: boolean) {
    const ctx = this.context!;
    
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    filter.Q.value = 1;
    
    const gain = ctx.createGain();
    const velocity = isOffbeat ? 0.25 : 0.15;
    this.applyADSR(gain.gain, t, 0.001, 0.03, 0, 0.02, velocity);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);
    
    noise.start(t);
    noise.stop(t + 0.05);
  }

  private playOpenHat(t: number) {
    const ctx = this.context!;
    
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 8000;
    filter.Q.value = 3;
    
    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.01, 0.15, 0.2, 0.15, 0.3);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);
    
    noise.start(t);
    noise.stop(t + 0.4);
  }

  // === IMPROVED BASS ===
  private playHouseBass(freq: number, t: number, isRoot: boolean) {
    const ctx = this.context!;
    
    // Sub bass layer (sine)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq;
    
    // Mid bass layer (sawtooth with filter)
    const mid = ctx.createOscillator();
    mid.type = 'sawtooth';
    mid.frequency.value = freq * 2;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    filter.Q.value = 3;
    
    const subGain = ctx.createGain();
    const midGain = ctx.createGain();
    
    const duration = isRoot ? 0.35 : 0.15;
    const sustain = isRoot ? 0.5 : 0.3;
    
    this.applyADSR(subGain.gain, t, 0.01, 0.08, sustain, 0.12, 0.7);
    this.applyADSR(midGain.gain, t, 0.015, 0.1, sustain, 0.15, 0.4);
    
    sub.connect(subGain);
    mid.connect(filter);
    filter.connect(midGain);
    subGain.connect(this.bgmGain!);
    midGain.connect(this.bgmGain!);
    
    sub.start(t);
    mid.start(t);
    sub.stop(t + duration);
    mid.stop(t + duration);
  }

  private playHousePad(freqs: number[], t: number) {
    const ctx = this.context!;
    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.5, 0.5, 0.6, 1.0, 0.15);
    gain.connect(this.bgmGain!);

    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 2.0);
    });
  }

  private playHousePluck(freq: number, t: number) {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.1);
    filter.Q.value = 5;

    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.005, 0.1, 0, 0.05, 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private playHouseLead(freq: number, t: number, accented: boolean) {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(accented ? 3000 : 1500, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.2);

    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.01, 0.15, 0.4, 0.1, accented ? 0.25 : 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private playRiser(t: number) {
    const ctx = this.context!;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(8000, t + 2.0);
    filter.Q.value = 1;

    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 1.5, 0.5, 0, 0, 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);
    noise.start(t);
    noise.stop(t + 2.0);
  }

  private playDownSweep(t: number) {
    const ctx = this.context!;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 1.5);

    const gain = ctx.createGain();
    this.applyADSR(gain.gain, t, 0.01, 1.5, 0, 0, 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain!);
    noise.start(t);
    noise.stop(t + 1.5);
  }
}

export const audioSystem = new AudioSystem();
