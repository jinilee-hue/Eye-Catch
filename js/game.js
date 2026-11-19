/* Eye Catch — game flow.
 * Two cards on the table share exactly one picture. Spot it, hit YOUR button and say the word: the tutor's
 * recogniser (on-device whisper, js/stt.js) checks it. Right -> you take the left card, the right card slides over
 * and a new one comes from the deck. Wrong -> the other player gets the chance. 10 cards; most cards wins.
 * Without a microphone / recogniser (file://, mic refused) the player who pressed taps the picture instead.
 * Test hooks: window.__ec; URL ?fast=1 (no rule demo), ?tap=1 (tap mode), ?fake=1 (scripted verdicts: __ec.fake.push('ok'|'wrong'|'unclear'|'silence')).
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const Q = new URLSearchParams(location.search);
  const S = Sound, M3 = window.EC3D;
  const stage = $('#stage');
  const ROUNDS = 10;
  const G = { tok: 0, screen: 'title', phase: 'idle', scores: [0, 0], locked: [false, false], r: 0, deck: null, left: null, right: null, taught: false, helloed: false, timers: [] };
  const fake = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const alive = tok => tok === G.tok;

  // ── fit the stage to the window ───────────────────────────────────────────────────────────────────────
  function fit() {
    const k = Math.min(innerWidth / 2400, innerHeight / 1792);
    stage.style.setProperty('--k', k);
    // the window beyond the 4:3 play area, per side, in stage px (edge things move out by this)
    G.ex = Math.max(0, (innerWidth / k - 2400) / 2); G.ey = Math.max(0, (innerHeight / k - 1792) / 2);
    stage.style.setProperty('--ex', G.ex.toFixed(1) + 'px');
    stage.style.setProperty('--ey', G.ey.toFixed(1) + 'px');
    if (M3.ready) M3.resize(k, G.ex, G.ey);
  }
  addEventListener('resize', fit);

  // ── the tutor ─────────────────────────────────────────────────────────────────────────────────────────
  let mon = null;
  // game: the whole tutor stands on the screen's bottom edge between the two pads (user: "캐릭터는 위로 올라가야겠다")
  // game: the tutor stands at the back of the table, top centre, between the logo and the deck (user: "캐릭터가 가운데
  // 카드와 로고 사이로 들어가야해") — the dealer behind the cards
  const PLACE = { title: [1190, 1218, 560], game: [1200, 805, 390] };
  let placeAnim = null;
  function placeMonster(where, ms = 0, from) {
    const to = PLACE[where];
    if (!ms) { mon.place(...to); placeAnim = null; return; }
    const a = from || PLACE[where === 'game' ? 'gameLow' : where] || to;
    placeAnim = { a, b: to, t0: performance.now(), ms };
  }
  PLACE.gameLow = [1200, 520, 330];              // it drops in from above
  function tick() {
    requestAnimationFrame(tick);
    if (!mon) return;
    if (placeAnim) {
      const u = Math.min(1, (performance.now() - placeAnim.t0) / placeAnim.ms), e = 1 - Math.pow(1 - u, 3) * (1 - 1.7 * u * (1 - u));
      mon.place(...placeAnim.a.map((v, i) => v + (placeAnim.b[i] - v) * e));
      if (u >= 1) placeAnim = null;
    }
    mon.talk(S.voiceLevel());
    if (G.screen === 'title') followHands();
  }

  // ── title ─────────────────────────────────────────────────────────────────────────────────────────────
  // 3D cards: two held in the tutor's mittens (they follow its arms), a few lying on the table like the mockup
  const held = []; let tableCards = [];
  function clearTitleCards() { held.forEach(c => c.dispose()); held.length = 0; tableCards.forEach(c => c.dispose()); tableCards = []; }
  function buildTitle() {
    clearTitleCards();
    const deal = Cards.makeDeck(2);
    deal.cards.forEach((ws, i) => {
      const c = Card3D.make(ws, { style: 'plain', float: false });
      c.root.scale.setScalar(HOLD_R);
      held.push(c);
      // spin into the mitten like the reference video's cards
      c.mover.scale.setScalar(0.001);
      setTimeout(() => c.alive && c.tween(900, u => { c.mover.rotation.y = 4 * Math.PI * (1 - u); c.mover.scale.setScalar(Math.max(0.001, u)); }), 350 + i * 180);
    });
    held.answer = deal.answers[0];
    // bigger, so their pictures read (user: "인트로에 들어간 바닥에 카드들이 너무 작아"); clear of START and the tin
    const spots = [[300, 1075, 540, 0.24], [445, 1335, 560, -0.14], [2095, 1255, 560, -0.2], [2110, 1228, 560, -0.07], [2125, 1201, 560, 0.07]];
    const td = Cards.makeDeck(spots.length);
    spots.forEach(([x, y, d, rz], i) => {
      const c = Card3D.make(td.cards[i], { style: 'plain', float: false });
      c.place(x, y, 0, d);
      c.root.rotation.set(-0.95, 0, rz);                    // lying on the table
      c.mover.position.y = 6; c.mover.scale.setScalar(0.6);
      setTimeout(() => c.alive && c.tween(700, u => { c.mover.position.y = 6 * (1 - u); c.mover.scale.setScalar(0.6 + 0.4 * u); c.mover.rotation.z = -2 * (1 - u); },
        t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2)), 150 + i * 90);
      tableCards.push(c);
    });
  }
  // the card's lower-inner edge sits IN the fist: its centre is up and out from the grip point by ~0.86 of its radius
  const HOLD_R = 1.45, HOLD_A = 48 * Math.PI / 180;
  function followHands() {
    if (held.length < 2 || !M3.ready) return;
    [-1, 1].forEach((s, i) => {
      const h = mon.gripWorld(s), c = held[i], d = HOLD_R * 0.93;   // the fist shows below the edge it holds
      // the card's plane goes exactly through the grip point (no turn about y: that swung its edge behind the hand)
      c.root.position.set(h.x + s * d * Math.cos(HOLD_A), h.y + d * Math.sin(HOLD_A), h.z);
      c.root.rotation.set(0, 0, s * 0.1);
    });
  }
  let titleShow = 0;
  function showTitle() {
    G.tok++; G.screen = 'title'; G.phase = 'idle';
    stage.dataset.screen = 'title';
    clearTimers();
    $('#result').classList.remove('show');
    S.stopVoice();
    disposeGameCards(); Card3D.hideDeck(); Card3D.ambient(false);
    buildTitle();
    placeMonster('title');
    mon.setShadow(true); mon.lookAt(null); mon.rest = 'hold'; mon.pose('hold'); mon.setGrip(true);
    const logo = $('#logo'), st = $('#btnStart');
    logo.classList.remove('drop', 'float'); st.classList.remove('in');
    Tin3D.show(true);                              // the 3D card tin (js/tin3d.js)
    void logo.offsetWidth;
    logo.classList.add('drop');
    setTimeout(() => {
      if (G.screen !== 'title') return;
      logo.classList.remove('drop'); logo.classList.add('float');
      FX.sparkles(1200, 330, 24, 560); FX.firework(420, 260); setTimeout(() => FX.firework(1980, 230), 260);
    }, 1100);
    setTimeout(() => st.classList.add('in'), 650);
    const my = ++titleShow;
    // now and then the two held cards show their match
    const glint = async () => {
      while (my === titleShow && G.screen === 'title') {
        await wait(3600);
        if (my !== titleShow || G.screen !== 'title') return;
        held.forEach(c => c.hit(held.answer, true));
        S.sfx('sparkle');
        await wait(1500);
        held.forEach(c => c.alive && c.hit(held.answer, false));
      }
    };
    glint();
  }

  // ── audio unlock + hello on the first touch ───────────────────────────────────────────────────────────
  let started = false;
  function firstTouch() {
    S.unlock();
    if (!started) { started = true; S.startBgm(); STT.preload(); }
  }
  addEventListener('pointerdown', (e) => {
    const was = started;
    firstTouch();
    if (!was && G.screen === 'title' && !e.target.closest('#btnStart, .sys')) {
      G.helloed = true; mon.wave(1); S.say('t:hello').then(() => S.say('t:pressstart'));
    }
  }, true);

  // ── game screen ───────────────────────────────────────────────────────────────────────────────────────
  const buzzEl = [$('#buzz1'), $('#buzz2')], plateEl = [$('#plate1'), $('#plate2')], scoreEl = [$('#score1'), $('#score2')];
  function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; }
  function setBuzz(p, cls, on) { buzzEl[p].classList.toggle(cls, on); }
  function resetBuzzers() { buzzEl.forEach(b => b.classList.remove('ready', 'down', 'listen', 'thinking', 'locked', 'chance')); plateEl.forEach(p => p.classList.remove('turn')); }
  function renderScores() { scoreEl.forEach((e, i) => { e.textContent = G.scores[i]; }); }
  function setDeckN(n) { Card3D.setDeck(n, ...DECK, 310); }
  // the two cards a little apart, the deck of the cards still to come between them (user: "남은 카드도 가운데 넣어줘,
  // 두개 카드 사이에 넣어줘")
  // cards 860 px, 360 px apart: the deck (310 px, user: "이 카드는 너무 작은거 아냐?") fits between them
  const CARD = 860, SLOT = { L: [590, 960], R: [1810, 960] }, DECK = [1200, 1060];
  const YAW = { L: 0.48, R: -0.48 };                // ~27° in toward the middle (user: "영상처럼 카드 각도를 가운데로")
  /** a 3D game card in slot L / R; anim 'flip' = spins in from the deck like a coin */
  function putCard(slot, words, side, anim) {
    const c = Card3D.make(words, { style: side === 'left' ? 'sky' : 'pink' });
    c.place(...SLOT[slot], -1.5, CARD);
    c.yawTo(YAW[slot]);                              // both turned in toward the middle, like the reference video
    if (anim === 'flip') {
      c.spinIn({ x: DECK[0], y: DECK[1] });
      S.sfx('flip');
      // light ribbons round it as it lands (the reference video)
      setTimeout(() => FX.ribbon(SLOT[slot][0], SLOT[slot][1], 520), 560);
    }
    return c;
  }
  function disposeGameCards() { [G.left, G.right, ...(G.extra || [])].forEach(c => c && c.alive && c.dispose()); G.left = G.right = null; G.extra = []; document.querySelectorAll('.match-tag').forEach(t => t.remove()); }

  async function startGame() {
    firstTouch();
    const tok = ++G.tok;
    G.screen = 'game'; G.phase = 'intro'; G.scores = [0, 0]; G.r = 0; G.locked = [false, false];
    clearTimers(); S.stopVoice();
    stage.dataset.screen = 'game';
    $('#result').classList.remove('show');
    clearTitleCards(); disposeGameCards(); Tin3D.show(false); Card3D.ambient(true, ...DECK);
    resetBuzzers(); renderScores(); hideWord();
    G.deck = Cards.makeDeck(ROUNDS + 1, Q.get('answer'));
    setDeckN(ROUNDS + 1);
    mon.setShadow(false); mon.lookAt(null); mon.rest = 'up'; mon.pose('up'); mon.setGrip(false);
    placeMonster('game', 700);
    // the microphone: asked here, once (the tutor asks for it if the browser prompt stays up)
    if (!Q.has('tap') && !Q.has('fake') && Mic.state !== 'on' && Mic.state !== 'denied') {
      const ask = setTimeout(() => { if (alive(tok)) S.say('t:micask'); }, 1400);
      // an unanswered permission prompt must not hold the game: go on after 15 s (tap mode until the mic is on)
      await Promise.race([Mic.open(S.ctx), wait(15000)]);
      clearTimeout(ask);
      if (!alive(tok)) return;
    }
    await wait(500);
    if (!G.taught && !Q.has('fast')) { await teach(tok); G.taught = true; }
    if (!alive(tok)) return;
    G.left = putCard('L', G.deck.cards[0], 'left', 'flip'); setDeckN(ROUNDS);
    await wait(260);
    G.right = putCard('R', G.deck.cards[1], 'right', 'flip'); setDeckN(ROUNDS - 1);
    await wait(700);
    if (!alive(tok)) return;
    mon.hop(1);
    await S.say('t:ready');
    if (!alive(tok)) return;
    round(tok);
  }

  /** the rules, shown with two demo cards (first game of the visit) */
  async function teach(tok) {
    if (!G.helloed) { G.helloed = true; mon.wave(1); await S.say('t:hello'); if (!alive(tok)) return; }
    const demo = Cards.makeDeck(2);
    const L = putCard('L', demo.cards[0], 'left', 'flip');
    await wait(240);
    const R = putCard('R', demo.cards[1], 'right', 'flip');
    await wait(600);
    mon.lookAt(...SLOT.L);
    const said = S.say('t:rule1');
    await wait(1300); mon.lookAt(...SLOT.R);
    await said; if (!alive(tok)) return;
    G.extra = [L, R];
    hitCards([L, R], demo.answers[0]);
    mon.lookAt(null); mon.hop(1);
    await S.chant(demo.answers[0]); if (!alive(tok)) return;
    await wait(300);
    // the buttons
    mon.pose('point', -1); mon.lookAt(200 - G.ex, 1580 + G.ey); setBuzz(0, 'chance', true);
    const r2 = S.say('t:rule2');
    await wait(1500); setBuzz(0, 'chance', false); mon.pose('point', 1); mon.lookAt(2200 + G.ex, 1580 + G.ey); setBuzz(1, 'chance', true);
    await r2; await wait(400); setBuzz(1, 'chance', false);
    if (!alive(tok)) return;
    mon.pose('up'); mon.lookAt(null);
    await S.say('t:rule3');
    if (!alive(tok)) return;
    unhit();
    S.sfx('whoosh');
    await Promise.all([L.gone(), R.gone()]);
    L.dispose(); R.dispose(); G.extra = [];
  }

  // ── a round ───────────────────────────────────────────────────────────────────────────────────────────
  const answer = () => G.deck.answers[G.r];
  function rivals() { const a = answer(); return [...new Set([...G.left.words, ...G.right.words])].filter(w => w !== a); }
  function round(tok) {
    G.phase = 'race'; G.locked = [false, false];
    resetBuzzers();
    buzzEl.forEach(b => b.classList.add('ready'));
    mon.lookAt(null); mon.pose('up');
    armTimers(tok);
  }
  function armTimers(tok) {
    clearTimers();
    G.timers.push(setTimeout(() => { if (alive(tok) && G.phase === 'race') hint(); }, 14000));
    G.timers.push(setTimeout(() => { if (alive(tok) && G.phase === 'race') hint(); }, 28000));
    G.timers.push(setTimeout(() => { if (alive(tok) && G.phase === 'race') nobody(tok); }, 42000));
  }
  function hint() {
    S.say('t:hint'); mon.hop(1);
    [G.left, G.right].forEach(c => c && c.hint(answer()));
  }

  async function buzz(p) {
    if (G.screen !== 'game') return;
    firstTouch();
    if (G.phase !== 'race' || G.locked[p]) { if (G.phase === 'race') S.sfx('wrong'); return; }
    const tok = G.tok;
    G.phase = 'answer'; clearTimers();
    S.stopVoice(); S.sfx('buzz');
    buzzEl.forEach((b, i) => { b.classList.remove('ready', 'chance'); if (i !== p) b.classList.add('locked'); });
    setBuzz(p, 'down', true); plateEl[p].classList.add('turn');
    mon.lookAt(p ? 2150 + G.ex : 250 - G.ex, 1560 + G.ey); mon.hop(1, 0.2);
    const res = await answerTurn(p, tok);
    if (!alive(tok)) return;
    setBuzz(p, 'down', false); setBuzz(p, 'listen', false); setBuzz(p, 'thinking', false); plateEl[p].classList.remove('turn');
    if (res === 'ok') await win(p, tok); else await miss(p, tok);
  }

  /** 'ok' | 'wrong' */
  async function answerTurn(p, tok) {
    const useMic = !Q.has('tap') && (Q.has('fake') || (Mic.state === 'on' && STT.state !== 'error'));
    if (!useMic) return tapTurn(p, tok);
    for (let t = 0; t < 2; t++) {
      setBuzz(p, 'listen', true);
      let verdict;
      if (Q.has('fake')) {
        await wait(700); verdict = fake.length ? fake.shift() : 'ok';
      } else {
        const r = await Mic.listen({ waitMs: t ? 5000 : 4200, onLevel: v => buzzEl[p].style.setProperty('--lv', v.toFixed(2)), aborted: () => !alive(tok) });
        if (!alive(tok)) return 'wrong';
        if (r.kind === 'nomic') return tapTurn(p, tok);
        if (r.kind === 'silence') verdict = 'silence';
        else if (r.kind === 'speech') {
          setBuzz(p, 'listen', false); setBuzz(p, 'thinking', true);
          const pcm = await Mic.prepare(r.pcm, r.sr);
          verdict = await STT.judge(pcm, answer(), rivals());
          setBuzz(p, 'thinking', false);
          if (verdict === null) return tapTurn(p, tok);
          if (Q.has('log')) console.log('heard', STT.last);
        } else return 'wrong';
      }
      setBuzz(p, 'listen', false);
      if (!alive(tok)) return 'wrong';
      if (verdict === 'ok') return 'ok';
      if (verdict === 'wrong') return 'wrong';
      if (t === 0) { await S.say(verdict === 'silence' ? 't:sayit' : 't:again'); if (!alive(tok)) return 'wrong'; }
    }
    return 'wrong';
  }

  /** no microphone: tap the picture (picked on the 3D cards) */
  function tapTurn(p, tok) {
    return new Promise(res => {
      setBuzz(p, 'listen', false);
      S.say('t:tap');
      let done = false;
      const end = (v) => { if (done) return; done = true; removeEventListener('pointerdown', on, true); clearTimeout(to); res(v); };
      const on = (e) => {
        if (!alive(tok)) return end('wrong');
        const hit = Card3D.pick(e.clientX, e.clientY);
        if (!hit || !hit.word || (hit.card !== G.left && hit.card !== G.right)) return;
        S.sfx('tap');
        if (hit.word === answer()) end('ok');
        else { hit.card.wrong(hit.word); end('wrong'); }
      };
      addEventListener('pointerdown', on, true);
      const to = setTimeout(() => end('wrong'), 9000);
    });
  }

  function hitCards(cards, w) {
    cards.forEach(c => {
      if (!c) return;
      c.hit(w, true);
      // the "match!" tag sits on the card's top rim, upright (like the mockup), so it never covers a picture
      const top = c.topScreen(), sp = c.symScreen(w);
      const tag = document.createElement('img'); tag.className = 'match-tag'; tag.src = 'assets/img/match.webp'; tag.alt = '';
      tag.style.left = top.x + 'px'; tag.style.top = (top.y + 40) + 'px';
      $('#fx').appendChild(tag);
      if (sp) FX.sparkles(sp.x, sp.y, 16, 240);
    });
    S.sfx('right');
  }
  function unhit() {
    [G.left, G.right, ...(G.extra || [])].forEach(c => c && c.alive && c.clearHits());
    document.querySelectorAll('.match-tag').forEach(t => t.remove());
  }
  function showWord(w) {
    const el = $('#wordPop');
    el.innerHTML = `<b>${w[0]}</b>${w.slice(1)}`;
    el.classList.remove('hide'); void el.offsetWidth; el.classList.add('show');
  }
  function hideWord() { const el = $('#wordPop'); if (el.classList.contains('show')) { el.classList.remove('show'); el.classList.add('hide'); } }

  async function win(p, tok) {
    G.phase = 'reveal';
    const w = answer();
    hitCards([G.left, G.right], w);
    mon.cheer(); mon.lookAt(null); Card3D.burst();
    FX.ribbon(...SLOT.L, 520); setTimeout(() => FX.ribbon(...SLOT.R, 520), 160);
    FX.rays(1200, 1635 + G.ey, 900);               // behind the word, bottom centre
    showWord(w);
    await S.chant(w); if (!alive(tok)) return;
    await S.say(['t:great1', 't:great2', 't:great3'][Math.floor(Math.random() * 3)]); if (!alive(tok)) return;
    // the left card goes to the winner
    await flyToPlate(G.left, p);
    if (!alive(tok)) return;
    G.scores[p]++; renderScores();
    const se = scoreEl[p]; se.classList.remove('bump'); void se.offsetWidth; se.classList.add('bump');
    const pc = FX.center(plateEl[p]); FX.sparkles(pc.x, pc.y + 20, 12, 220);
    S.sfx('card');
    hideWord();
    await next(tok);
  }
  async function miss(p, tok) {
    G.locked[p] = true;
    S.sfx('wrong'); mon.oops();
    buzzEl[p].classList.add('locked');
    await S.say('t:oops'); if (!alive(tok)) return;
    const o = 1 - p;
    if (!G.locked[o]) {
      G.phase = 'race';
      buzzEl[o].classList.remove('locked'); buzzEl[o].classList.add('chance');
      mon.lookAt(o ? 2150 + G.ex : 250 - G.ex, 1560 + G.ey); mon.pose('point', o ? 1 : -1);
      await S.say(o ? 't:chance2' : 't:chance1');
      if (!alive(tok)) return;
      if (G.phase === 'race') { mon.pose('up'); armTimers(tok); }
    } else await nobody(tok);
  }
  /** nobody got it: show it, read it, the left card leaves the table */
  async function nobody(tok) {
    G.phase = 'reveal'; clearTimers();
    resetBuzzers(); buzzEl.forEach(b => b.classList.add('locked'));
    const w = answer();
    await S.say('t:answer'); if (!alive(tok)) return;
    hitCards([G.left, G.right], w); showWord(w); Card3D.burst();
    await S.chant(w); if (!alive(tok)) return;
    await wait(500);
    unhit(); S.sfx('whoosh');
    await G.left.gone(); G.left.dispose();
    hideWord();
    await next(tok);
  }

  async function flyToPlate(card, p) {
    unhit();
    const to = FX.center(plateEl[p]);
    S.sfx('whoosh');
    await card.flyTo(to.x, to.y, 850, p ? 1 : -1);      // spins like a coin into the winner's plate
    card.dispose();
  }

  async function next(tok) {
    G.r++;
    if (G.r >= ROUNDS) return finish(tok);
    // the right card slides left, a new card comes from the deck
    G.left = G.right; G.right = null;
    G.left.slideTo(...SLOT.L); G.left.yawTo(YAW.L, 750); G.left.restyle('sky'); S.sfx('whoosh');
    await wait(450);
    G.right = putCard('R', G.deck.cards[G.r + 1], 'right', 'flip');
    setDeckN(ROUNDS - 1 - G.r);
    await wait(750);
    if (!alive(tok)) return;
    if (G.r === ROUNDS - 1) { await S.say('t:last'); if (!alive(tok)) return; }
    round(tok);
  }

  async function finish(tok) {
    G.phase = 'result'; clearTimers(); resetBuzzers();
    disposeGameCards(); Card3D.hideDeck();
    const [a, b] = G.scores, win = a === b ? -1 : a > b ? 0 : 1;
    $('#res1').textContent = a; $('#res2').textContent = b;
    document.querySelectorAll('.res-p').forEach((e, i) => e.classList.toggle('win', i === win));
    const T = S.lang === 'ko' ? ['1번 친구 승리!', '2번 친구 승리!', '비겼어요!'] : ['Player 1 wins!', 'Player 2 wins!', "It's a tie!"];
    $('#resTitle').textContent = win < 0 ? T[2] : T[win];
    $('#btnAgain span').textContent = S.lang === 'ko' ? '다시 하기' : 'Play again';
    $('#btnHome2 span').textContent = S.lang === 'ko' ? '처음으로' : 'Home';
    $('#result').classList.add('show');
    S.sfx('win'); FX.confetti(110); FX.fireworks(7, 3600);
    mon.cheer(); mon.lookAt(win < 0 ? null : win ? 2150 : 250, 300);
    await wait(600); if (!alive(tok)) return;
    await S.say(win < 0 ? 't:draw' : win ? 't:win2' : 't:win1'); if (!alive(tok)) return;
    await wait(500);
    S.say('t:playagain');
  }

  // ── inputs ────────────────────────────────────────────────────────────────────────────────────────────
  buzzEl.forEach((b, i) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); buzz(i); }));
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (G.screen === 'title' && (e.code === 'Space' || e.code === 'Enter')) { startGame(); return; }
    if (['KeyA', 'KeyQ', 'ArrowLeft', 'ShiftLeft'].includes(e.code)) buzz(0);
    if (['KeyL', 'KeyP', 'ArrowRight', 'ShiftRight'].includes(e.code)) buzz(1);
  });
  $('#btnStart').addEventListener('click', () => { S.sfx('pop'); startGame(); });
  $('#btnAgain').addEventListener('click', () => { S.sfx('pop'); startGame(); });
  // Exit (user: "인트로에도 나가기 버튼은 있어야해"): game / result -> the title; on the title it leaves the game like
  // Croco Phonics / Magic Block: back to the page it came from, else close the tab, else reload
  $('#btnHome').addEventListener('click', () => {
    S.sfx('tap');
    if (G.screen !== 'title') { showTitle(); return; }
    S.stopVoice();
    if (history.length > 1) { history.back(); setTimeout(() => location.reload(), 700); }
    else { window.close(); setTimeout(() => location.reload(), 300); }
  });
  $('#btnHome2').addEventListener('click', () => { S.sfx('tap'); showTitle(); });
  const snd = $('#btnSound');
  snd.addEventListener('click', () => { S.setMuted(!S.muted); snd.setAttribute('aria-pressed', String(!S.muted)); });
  const lang = $('#btnLang');
  const showLang = () => lang.querySelectorAll('span').forEach(s => s.classList.toggle('on', s.dataset.l === S.lang));
  lang.addEventListener('click', () => { S.setLang(S.lang === 'ko' ? 'en' : 'ko'); showLang(); S.sfx('tap'); if (G.screen === 'title') { S.stopVoice(); S.say('t:pressstart'); } });
  showLang();

  // ── boot ──────────────────────────────────────────────────────────────────────────────────────────────
  M3.init($('#gl'));
  mon = M3.monster;
  fit();
  showTitle();
  requestAnimationFrame(tick);
  if (Q.has('tap')) Mic.state = 'none';
  window.__ec = { G, buzz, startGame, showTitle, fake, mon, M3, wait, held };
  window.__ready = true;
})();
