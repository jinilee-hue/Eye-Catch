/* Eye Catch — sound: tutor voice clips (js/voice.js + base64 js/voice-data.js, so file:// plays), synthesized SFX,
 * background music (js/bgm-data.js, optional), and the voice level for the tutor's mouth.
 * Keys: 't:x' English line ('k:x' its Korean take, used when lang = 'ko'), 'w:word', 's:m' (letter sound).
 */
(function () {
  'use strict';
  const V = window.EC_VOICE || { clips: {} };
  const DATA = window.EC_VOICE_DATA || {};
  const A = { ctx: null, muted: false, lang: 'ko', talking: 0, level: 0, bgmOn: false };
  try { const l = localStorage.getItem('ecLang'); if (l === 'en' || l === 'ko') A.lang = l; } catch (e) { /* storage off */ }
  let master, voiceBus, sfxBus, musicBus, analyser, levelBuf;
  const buffers = new Map();
  let cur = null;               // the playing voice source
  let voiceTok = 0;

  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return A.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = A.ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    voiceBus = ctx.createGain(); voiceBus.gain.value = 1;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; levelBuf = new Float32Array(analyser.fftSize);
    voiceBus.connect(analyser); voiceBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    master.gain.value = A.muted ? 0 : 1;
    // warm the voice clips in the background
    setTimeout(() => Object.keys(V.clips).forEach(k => decode(k)), 50);
    return ctx;
  };

  function b64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function decode(key) {
    if (buffers.has(key)) return buffers.get(key);
    const c = V.clips[key];
    if (!c || !A.ctx) return Promise.resolve(null);
    const src = DATA[key] ? Promise.resolve(b64(DATA[key])) : fetch('assets/voice/' + c[0]).then(r => r.arrayBuffer());
    const p = src.then(ab => A.ctx.decodeAudioData(ab)).catch(() => null);
    buffers.set(key, p);
    return p;
  }
  /** the clip key to play for a logical key (Korean take of a tutor line when lang = ko) */
  A.resolve = function (key) {
    if (A.lang === 'ko' && key.startsWith('t:') && V.clips['k:' + key.slice(2)]) return 'k:' + key.slice(2);
    return key;
  };
  A.has = key => !!V.clips[A.resolve(key)];
  A.text = function (key) {
    const k = key.slice(2);
    return (A.lang === 'ko' ? V.lines_ko : V.lines)?.[k] || V.lines?.[k] || '';
  };
  /** play one clip; resolves when it ends (or is stopped) */
  A.say = async function (key, opts = {}) {
    const k = A.resolve(key);
    const c = V.clips[k];
    if (!c || !A.ctx) return;
    const tok = ++voiceTok;
    const buf = await decode(k);
    if (!buf || tok !== voiceTok) return;
    stopCur();
    const s = A.ctx.createBufferSource(); s.buffer = buf;
    const g = A.ctx.createGain(); g.gain.value = c[2] * (opts.gain || 1);
    s.connect(g); g.connect(voiceBus);
    const start = c[1], dur = Math.min(c[3], buf.duration - start);
    cur = s; talk(1);
    return new Promise(res => {
      let done = false;
      const end = () => { if (done) return; done = true; if (cur === s) cur = null; talk(-1); res(); };
      s.onended = end;
      s.start(0, start, dur);
      setTimeout(end, (dur + 0.4) * 1000);   // safety net (a stopped context never fires onended)
    });
  };
  /** clips back to back with a short gap; stops if another say()/stop happens */
  let seqTok = 0;
  A.seq = async function (keys, gap = 0.08) {
    const my = ++seqTok;
    for (const k of keys) {
      if (my !== seqTok) return;
      if (typeof k === 'number') { await wait(k * 1000); continue; }
      await A.say(k);
      if (gap && my === seqTok) await wait(gap * 1000);
    }
  };
  /** "/m/ /m/ moon" */
  A.chant = word => A.seq(['s:m', 0.12, 's:m', 0.18, 'w:' + word], 0.05);
  function stopCur() { if (cur) { try { cur.onended = null; cur.stop(); } catch (e) { /* done */ } cur = null; talk(-1); } }
  A.stopVoice = function () { voiceTok++; seqTok++; stopCur(); };
  function talk(d) { A.talking = Math.max(0, A.talking + d); duck(); }
  function duck() {
    if (!musicBus) return;
    const t = A.ctx.currentTime, v = A.bgmOn ? (A.talking ? 0.05 : 0.13) * A.bgmLevel : 0;
    musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(v, t, 0.12);
  }
  A.bgmLevel = 1;
  /** 0..1 loudness of the tutor's voice right now (for the mouth) */
  A.voiceLevel = function () {
    if (!analyser || !A.talking) return 0;
    analyser.getFloatTimeDomainData(levelBuf);
    let s = 0; for (let i = 0; i < levelBuf.length; i++) s += levelBuf[i] * levelBuf[i];
    return Math.min(1, Math.sqrt(s / levelBuf.length) * 5.5);
  };
  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, A.ctx.currentTime, 0.03);
  };
  A.setLang = function (l) { A.lang = l; try { localStorage.setItem('ecLang', l); } catch (e) { /* storage off */ } };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  A.wait = wait;

  // ── synthesized effects ─────────────────────────────────────────────────────────────────────────────────
  function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(type, f0, f1, t, dur, peak, a = 0.005) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, dur, peak); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + a + dur + 0.05);
  }
  function noise(t, dur, peak, freq, q, type = 'bandpass') {
    const n = A.ctx.createBuffer(1, Math.ceil(A.ctx.sampleRate * dur), A.ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = A.ctx.createBufferSource(); s.buffer = n;
    const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = A.ctx.createGain(); env(g, t, 0.004, dur, peak);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t);
  }
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  A.sfx = function (name) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + 0.01;
    switch (name) {
      case 'tap': tone('sine', 880, 660, t, 0.08, 0.25); break;
      case 'pop': tone('sine', 520, 1250, t, 0.12, 0.35); break;
      case 'flip': noise(t, 0.18, 0.3, 2400, 0.8); tone('triangle', 300, 900, t, 0.14, 0.12); break;
      case 'whoosh': noise(t, 0.4, 0.28, 900, 0.6); break;
      case 'buzz': [72, 79, 84].forEach((n, i) => tone('triangle', NOTE(n), NOTE(n), t + i * 0.05, 0.22, 0.32)); tone('sine', NOTE(96), NOTE(96), t + 0.15, 0.3, 0.12); break;
      case 'listen': tone('sine', NOTE(84), NOTE(84), t, 0.09, 0.22); tone('sine', NOTE(91), NOTE(91), t + 0.1, 0.12, 0.22); break;
      case 'right': [76, 79, 84, 88, 91].forEach((n, i) => tone('triangle', NOTE(n), NOTE(n), t + i * 0.07, 0.3, 0.28)); noise(t + 0.3, 0.5, 0.06, 7000, 0.7, 'highpass'); break;
      case 'wrong': tone('sawtooth', 220, 150, t, 0.28, 0.12); tone('square', 233, 160, t + 0.02, 0.28, 0.05); break;
      case 'card': tone('sine', 660, 990, t, 0.18, 0.2); noise(t, 0.25, 0.1, 3000, 0.9); break;
      case 'tick': tone('square', 1500, 1500, t, 0.03, 0.06); break;
      case 'win': [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => tone('triangle', NOTE(n), NOTE(n), t + i * 0.12, i === 6 ? 0.8 : 0.22, 0.3)); break;
      case 'firework': noise(t, 0.6, 0.2, 500, 0.5, 'lowpass'); tone('sine', 1800, 400, t, 0.35, 0.05); break;
      case 'sparkle': [96, 100, 103, 108].forEach((n, i) => tone('sine', NOTE(n), NOTE(n), t + i * 0.045, 0.16, 0.1)); break;
      default: break;
    }
  };

  // ── music (optional loop from js/bgm-data.js) ──────────────────────────────────────────────────────────
  let bgmSrc = null, bgmBuf = null;
  A.startBgm = async function () {
    A.bgmOn = true;
    if (!A.ctx || !window.EC_BGM_DATA) return;
    if (!bgmBuf) { try { bgmBuf = await A.ctx.decodeAudioData(b64(window.EC_BGM_DATA.data)); } catch (e) { return; } }
    if (!bgmSrc) {
      bgmSrc = A.ctx.createBufferSource(); bgmSrc.buffer = bgmBuf; bgmSrc.loop = true;
      if (window.EC_BGM_DATA.loop) { bgmSrc.loopStart = 0; bgmSrc.loopEnd = window.EC_BGM_DATA.loop; }
      bgmSrc.connect(musicBus); bgmSrc.start();
    }
    duck();
  };
  A.stopBgm = function () { A.bgmOn = false; duck(); };
  A.setBgmLevel = function (v) { A.bgmLevel = v; duck(); };

  window.Sound = A;
})();
