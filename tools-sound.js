// Sounds for the shelf tools, made with Web Audio alone: no files. Each cue
// is built from oscillators and filtered noise when it plays, then let go.
// The engine stays silent until setEnabled(true), and that call should come
// from a click: browsers will not start audio before one. Whether sound is
// on is the host's to show, as a clear on/off control.
//
// createShelfSound() -> {enabled, state, setEnabled(on), cue(name, detail),
//   hold(name, level), counts, levels, dispose()}
// Pass it to the factories as options.sound. They call cue() at moments
// (a Figma piece seats, the gleam, a page wakes) and hold() for levels that
// swell and fade (the crystal's hum). For checks, counts records every cue
// and levels the last level held, sounding or not.

// The five Figma pieces ring a rising pentatonic as they land, G6 to E7,
// the blue eye highest.
const NOTES = [1568, 1760, 1976, 2349, 2637];

// Two seconds of white noise from a fixed seed, shared by every cue.
function noiseBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 90127;
  for (let i = 0; i < data.length; i++) {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  return buffer;
}

// A short burst of filtered noise: clicks, paper grains, breath.
function burst(ctx, out, noise, t, {type = 'bandpass', freq = 3000, q = 1, level = .05, attack = .002, length = .02, offset = 0}) {
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  source.buffer = noise; filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(.0001, t + attack + length);
  source.connect(filter).connect(gain).connect(out);
  source.start(t, offset); source.stop(t + attack + length + .02);
  return {filter, gain};
}

// Paper moving: one band of noise whose loudness crinkles at random (a
// walk of small steps), with a few sharper crackles in it. seed varies it.
function rustle(ctx, out, noise, t, {length = .45, level = .05, crackles = 5, seed = 1, offset = 0}) {
  let s = seed * 7919 + 17;
  const rnd = () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296);
  const source = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
  source.buffer = noise; band.type = 'bandpass'; band.frequency.value = 2600 + rnd() * 900; band.Q.value = .7;
  gain.gain.setValueAtTime(0, t);
  for (let at = 0; at < length; at += .006 + rnd() * .018) {
    const swell = Math.sin(Math.PI * at / length);
    gain.gain.linearRampToValueAtTime(level * swell * (.15 + .85 * rnd() ** 2), t + at);
  }
  gain.gain.linearRampToValueAtTime(0, t + length + .02);
  source.connect(band).connect(gain).connect(out);
  source.start(t, offset); source.stop(t + length + .05);
  for (let i = 0; i < crackles; i++)
    burst(ctx, out, noise, t + rnd() * length * .9, {freq: 4500 + rnd() * 3000, q: 1.2, level: level * (.5 + rnd() * .5),
      length: .004 + rnd() * .01, offset: rnd() * 1.5});
}

// A sine partial with a struck envelope.
function partial(ctx, out, t, freq, level, decay, attack = .002) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  osc.connect(gain).connect(out); osc.start(t); osc.stop(t + attack + decay + .02);
}

// One-shot cues, each scheduled at time t into out.
const CUES = {
  // A Figma piece seats: a small tink of fired glass, a bell-like partial
  // above it, and a dry click of brass on brass.
  'enamel-seat'(ctx, out, noise, t, {index = 0} = {}) {
    const f = NOTES[Math.abs(index) % NOTES.length];
    partial(ctx, out, t, f, .14, .24);
    partial(ctx, out, t, f * 2.76, .045, .09);
    partial(ctx, out, t, f * 5.4, .018, .05);
    burst(ctx, out, noise, t, {freq: 5200, q: 1.4, level: .05, length: .012, offset: Math.abs(index) * .07});
  },
  // The logo locks and the gleam crosses it: a soft rising chord, struck
  // one note after another, with a breath of high air under it.
  'enamel-gleam'(ctx, out, noise, t) {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => partial(ctx, out, t + i * .045, f, .045, 1.5, .03));
    burst(ctx, out, noise, t, {type: 'highpass', freq: 7000, q: .7, level: .006, attack: .25, length: .5, offset: .3});
  },
  // Let go, the pieces part: an airy turn, low and soft.
  'enamel-part'(ctx, out, noise, t) {
    const {filter} = burst(ctx, out, noise, t, {freq: 700, q: 1.2, level: .09, attack: .12, length: .45, offset: .5});
    filter.frequency.setValueAtTime(700, t); filter.frequency.exponentialRampToValueAtTime(2200, t + .5);
  },
  // The book wakes: a page stirs, over a breath.
  'page-wake'(ctx, out, noise, t, {seed = 1} = {}) {
    rustle(ctx, out, noise, t + .03, {length: .5, level: .09, crackles: 6, seed, offset: .2});
    burst(ctx, out, noise, t, {type: 'lowpass', freq: 650, q: .5, level: .035, attack: .25, length: .55, offset: .1});
  },
  // Let go, the page settles: a shorter, softer stir.
  'page-settle'(ctx, out, noise, t, {seed = 2} = {}) {
    rustle(ctx, out, noise, t, {length: .26, level: .05, crackles: 2, seed, offset: .9});
  },
};

// Held sounds: built once, then swelled and faded by level.
const HOLDS = {
  // The crystal: a low hum of a root, its fifth and a slightly sharp octave
  // (they beat slowly against each other), breathing on a slow tremolo,
  // with a little moving air through it.
  'crystal-hum'(ctx, out, noise) {
    const level = ctx.createGain(), tremolo = ctx.createGain(), tone = ctx.createBiquadFilter();
    level.gain.value = 0; tremolo.gain.value = 1;
    tone.type = 'lowpass'; tone.frequency.value = 900; tone.Q.value = .6;
    tone.connect(tremolo).connect(level).connect(out);
    const sources = [];
    for (const [freq, type, gain] of [[110, 'sine', .5], [164.8, 'sine', .28], [220.6, 'triangle', .12]]) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type; osc.frequency.value = freq; g.gain.value = gain;
      osc.connect(g).connect(tone); osc.start(); sources.push(osc);
    }
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = .27; depth.gain.value = .18;
    lfo.connect(depth).connect(tremolo.gain); lfo.start(); sources.push(lfo);
    const air = ctx.createBufferSource(), band = ctx.createBiquadFilter(), airGain = ctx.createGain();
    air.buffer = noise; air.loop = true; band.type = 'bandpass'; band.frequency.value = 1200; band.Q.value = 2;
    airGain.gain.value = .05;
    air.connect(band).connect(airGain).connect(tremolo); air.start(); sources.push(air);
    const drift = ctx.createOscillator(), driftDepth = ctx.createGain();
    drift.frequency.value = .13; driftDepth.gain.value = 500;
    drift.connect(driftDepth).connect(band.frequency); drift.start(); sources.push(drift);
    let target = 0;
    return {
      set(value, t) {
        const next = Math.max(0, Math.min(1, value)) * .09;
        if (Math.abs(next - target) < .002) return;
        target = next; level.gain.setTargetAtTime(next, t, .25);
      },
      stop() { sources.forEach(s => { try { s.stop(); } catch {} }); },
    };
  },
};

export function createShelfSound({volume = .7} = {}) {
  let ctx = null, out = null, noise = null, on = false;
  const holds = new Map(), counts = {}, levels = {};
  function wake() {
    if (ctx) return;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return;
    ctx = new Context();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16; limiter.ratio.value = 4;
    out = ctx.createGain(); out.gain.value = volume;
    out.connect(limiter).connect(ctx.destination);
    noise = noiseBuffer(ctx);
  }
  const live = () => on && ctx && ctx.state === 'running';
  return {
    get enabled() { return on; },
    get state() { return ctx ? ctx.state : 'none'; },
    get counts() { return {...counts}; },
    get levels() { return {...levels}; },
    setEnabled(value) {
      on = !!value;
      if (on) { wake(); ctx?.resume(); } else ctx?.suspend();
    },
    cue(name, detail) {
      counts[name] = (counts[name] || 0) + 1;
      if (live() && CUES[name]) CUES[name](ctx, out, noise, ctx.currentTime + .005, detail);
    },
    hold(name, level) {
      levels[name] = level;
      if (!holds.has(name)) {
        if (!(level > 0) || !live() || !HOLDS[name]) return;
        holds.set(name, HOLDS[name](ctx, out, noise));
      }
      holds.get(name).set(level, ctx.currentTime);
    },
    dispose() {
      holds.forEach(h => h.stop()); holds.clear();
      ctx?.close(); ctx = null; on = false;
    },
  };
}

// Renders sounds offline, for checks and for listening to as a file:
// events are [{name, at, detail, keys}], a cue at time at, or a held sound
// following [time, level] keys. Resolves to an AudioBuffer (mono).
export function renderSounds(events, {seconds = 2, rate = 44100} = {}) {
  const ctx = new OfflineAudioContext(1, Math.round(rate * seconds), rate), noise = noiseBuffer(ctx);
  const limiter = ctx.createDynamicsCompressor(), out = ctx.createGain();
  limiter.threshold.value = -16; limiter.ratio.value = 4; out.gain.value = .7;
  out.connect(limiter).connect(ctx.destination);
  for (const {name, at = .02, detail, keys} of events) {
    if (CUES[name]) CUES[name](ctx, out, noise, at, detail);
    else if (HOLDS[name]) {
      const held = HOLDS[name](ctx, out, noise);
      for (const [t, level] of keys || [[0, 1]]) held.set(level, t);
    }
  }
  return ctx.startRendering();
}
