/* =====================================================
   audio.js — Web Audio engine: scales, voices, playNote
   ===================================================== */

const Audio = {
  ctx: null,
  master: null,
  dryBus: null,
  delaySend: null,

  SCALES: {
    'penta-min': { name: 'Pentatonic minor', intervals: [0, 3, 5, 7, 10] },
    'penta-maj': { name: 'Pentatonic major', intervals: [0, 2, 4, 7, 9] },
    'dorian':    { name: 'Dorian',           intervals: [0, 2, 3, 5, 7, 9, 10] },
    'lydian':    { name: 'Lydian',           intervals: [0, 2, 4, 6, 7, 9, 11] },
    'whole':     { name: 'Whole tone',       intervals: [0, 2, 4, 6, 8, 10] },
    'chromatic': { name: 'Chromatic',        intervals: [0,1,2,3,4,5,6,7,8,9,10,11] }
  },

  VOICES: {
    'pluck': 'Pluck',
    'glass': 'Glass',
    'sub':   'Sub'
  },

  NOTE_NAMES: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  BASE_MIDI: 45,   // A2
  OCTAVES: 3,      // pitch range mapped to screen height

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.56;
    this.master.connect(this.ctx.destination);

    this.dryBus = this.ctx.createGain();
    this.dryBus.connect(this.master);

    // gentle feedback delay for space
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.34;
    const fb = this.ctx.createGain();   fb.gain.value = 0.32;
    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 2200;
    const wet = this.ctx.createGain();  wet.gain.value = 0.22;

    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    delay.connect(wet);  wet.connect(this.master);
    this.delaySend = delay;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMasterVolume(v01) {
    if (this.master) this.master.gain.value = v01 * 0.8;
  },

  midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  midiName(m)   { return this.NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); },

  // Map a normalized height (0 = top, 1 = bottom) onto a scale.
  pitchFromHeight(y01, scaleKey, octaveShift) {
    const intervals = this.SCALES[scaleKey].intervals;
    const steps = intervals.length * this.OCTAVES;
    const idx = Math.min(steps - 1, Math.max(0, Math.floor((1 - y01) * steps)));
    const oct = Math.floor(idx / intervals.length);
    return this.BASE_MIDI + (oct + (octaveShift || 0)) * 12 + intervals[idx % intervals.length];
  },

  /**
   * @param midi    note number
   * @param vel     0..1 velocity from motion intensity
   * @param pan     -1..1 stereo position
   * @param voice   'pluck' | 'glass' | 'sub'
   * @param rel     release time in seconds (per cable)
   * @param gain01  cable volume 0..1
   */
  playNote(midi, vel, pan, voice, rel, gain01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = this.midiToFreq(midi);

    const g = this.ctx.createGain();
    let out = g;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(this.dryBus);
    out.connect(this.delaySend);

    const peak = (0.18 + vel * 0.5) * gain01;
    if (peak <= 0.0002) return;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rel);

    const oscs = [];

    if (voice === 'pluck') {
      const o1 = this.ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
      const o2 = this.ctx.createOscillator(); o2.type = 'sine';     o2.frequency.value = freq * 2.001;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.35, t);
      g2.gain.exponentialRampToValueAtTime(0.02, t + 0.4);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(freq * 8, t);
      f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + rel * 0.7);
      o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g);
      oscs.push(o1, o2);

    } else if (voice === 'glass') {
      const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = freq;
      const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.83; // inharmonic partial
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.18, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + rel * 0.5);
      o1.connect(g); o2.connect(g2); g2.connect(g);
      oscs.push(o1, o2);

    } else { // sub
      const o1 = this.ctx.createOscillator(); o1.type = 'sine';     o1.frequency.value = freq / 2;
      const o2 = this.ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq;
      const g2 = this.ctx.createGain(); g2.gain.value = 0.25;
      o1.connect(g); o2.connect(g2); g2.connect(g);
      oscs.push(o1, o2);
    }

    oscs.forEach(o => { o.start(t); o.stop(t + rel + 0.1); });
  }
};
