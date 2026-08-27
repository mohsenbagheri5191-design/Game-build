/**
 * Audio: entirely synthesised, so nothing is downloaded.
 *
 * The context is not created until the first gesture (iOS refuses otherwise
 * and, more to the point, autoplaying at people is rude). The iOS silent
 * switch is respected for free by using the default 'playback'-less context.
 */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.ambient = null;
    this.started = false;
    this.night = 0;
  }

  /** Called from the first real user gesture. */
  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.settings.volumeSfx;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);

    this.started = true;
    this.applySettings();
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    this.sfxGain.gain.value = s.sound ? s.volumeSfx : 0;
    const target = s.music ? s.volumeMusic * 0.5 : 0;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    if (s.music && !this.ambient) this.startAmbient();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // --- primitives --------------------------------------------------------
  blip(freq, dur = 0.09, type = 'triangle', gain = 0.22, slideTo = null) {
    if (!this.ctx || !this.settings.sound) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur = 0.12, gain = 0.12, filterHz = 1400) {
    if (!this.ctx || !this.settings.sound) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterHz;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }

  chord(notes, dur = 0.4, gain = 0.13) {
    notes.forEach((n, i) => setTimeout(() => this.blip(NOTE(n), dur, 'sine', gain), i * 55));
  }

  // --- named cues --------------------------------------------------------
  place()      { this.blip(NOTE(72), 0.075, 'triangle', 0.20); this.noise(0.06, 0.07, 2200); }
  snap()       { this.blip(NOTE(84), 0.035, 'sine', 0.10); }
  erase()      { this.blip(NOTE(58), 0.10, 'sawtooth', 0.12, NOTE(46)); this.noise(0.09, 0.09, 900); }
  paint()      { this.blip(NOTE(76), 0.07, 'sine', 0.15, NOTE(83)); }
  undo()       { this.blip(NOTE(69), 0.09, 'sine', 0.14, NOTE(62)); }
  error()      { this.blip(NOTE(53), 0.16, 'square', 0.11, NOTE(47)); }
  claim()      { this.chord([60, 64, 67, 72], 0.45, 0.13); }
  levelUp()    { this.chord([60, 64, 67, 72, 76], 0.55, 0.15); }
  coin()       { this.blip(NOTE(88), 0.06, 'square', 0.10); setTimeout(() => this.blip(NOTE(95), 0.09, 'square', 0.09), 55); }
  sheetOpen()  { this.blip(NOTE(70), 0.07, 'sine', 0.10, NOTE(77)); }
  sheetClose() { this.blip(NOTE(77), 0.07, 'sine', 0.08, NOTE(70)); }
  tapCue()     { this.blip(NOTE(80), 0.028, 'sine', 0.07); }

  // --- ambient bed -------------------------------------------------------
  /**
   * A slow drifting pad, two detuned oscillators plus filtered noise. Shifts
   * darker and quieter at night rather than switching to a different track.
   */
  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const t = this.ctx.currentTime;
    const nodes = { osc: [], gain: this.ctx.createGain(), filter: this.ctx.createBiquadFilter() };
    nodes.gain.gain.value = 0.22;
    nodes.filter.type = 'lowpass';
    nodes.filter.frequency.value = 700;
    nodes.filter.Q.value = 0.6;

    for (const [n, detune] of [[41, -6], [48, 4], [55, -3], [60, 7]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = NOTE(n);
      o.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.value = 0.18;
      // very slow amplitude drift so the bed never sits still
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 0.03 + Math.random() * 0.05;
      lg.gain.value = 0.12;
      lfo.connect(lg); lg.connect(g.gain);
      lfo.start(t);
      o.connect(g); g.connect(nodes.filter);
      o.start(t);
      nodes.osc.push(o, lfo);
    }

    // a whisper of city noise
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.4;
    const ng = this.ctx.createGain(); ng.gain.value = 0.035;
    src.connect(nf); nf.connect(ng); ng.connect(nodes.filter);
    src.start(t);
    nodes.noise = src; nodes.noiseGain = ng;

    nodes.filter.connect(nodes.gain);
    nodes.gain.connect(this.musicGain);
    this.ambient = nodes;
  }

  /** Day/night shifts the bed's colour, not its content. */
  setNight(n) {
    this.night = n;
    if (!this.ambient || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambient.filter.frequency.setTargetAtTime(700 - n * 340, t, 1.2);
    this.ambient.gain.gain.setTargetAtTime(0.22 - n * 0.07, t, 1.2);
    this.ambient.noiseGain.gain.setTargetAtTime(0.035 * (1 - n * 0.7), t, 1.2);
  }
}
