/* Eye Catch — game flow.
 * Two cards on the table share exactly one picture. Spot it, hit YOUR button and say the word: the tutor's
 * recogniser (on-device whisper, js/stt.js) checks it. Right -> you take the left card, the right card slides over
 * and a new one comes from the deck. Wrong -> the other player gets the chance. 10 cards; most cards wins.
 * Saying another picture's word costs one won card: it goes back onto the deck (one more round), "−1" at the count.
 * Without a microphone / recogniser (file://, mic refused) the player who pressed taps the picture instead.
 * The say turn follows the phonics games' common rules (phonics-kit README "공통 규칙"): a JUMP button skips the word
 * (nobody gets the card), two unclear tries end it ("Good try!"), ~20 s of silence ends it, a word that can't be
 * judged skips it with no card. A finished game is saved to the shared record (js/phonics-progress.js, 'eye-catch').
 * Every card won adds one to the wallet, spent on player faces in CHARACTERS (the title's face button; localStorage
 * 'ecWallet', 'ecChars', 'ecPick'); the result shows 0–3 stars each.
 * Levels (LEVELS, phonics-kit README "공통 규칙: 레벨"): never picked, one for the device — START plays the saved level
 * (localStorage 'ecLevel' { level, poor }); 7+ of the 10 cards won together -> the next game is one up ("LEVEL UP!" on the
 * result), 4 or fewer twice in a row -> one down, else the same. The game screen shows "LEVEL n" under the logo.
 * Test hooks: window.__ec; URL ?fast=1 (no rule demo), ?tap=1 (as if there were no microphone), ?fake=1 (scripted verdicts:
 * __ec.fake.push('ok'|'wrong'|'unclear'|'silence'|'nojudge'|'hold') — 'hold' = no verdict for 30 s, to press JUMP).
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const Q = new URLSearchParams(location.search);
  const S = Sound, M3 = window.EC3D;
  const stage = $('#stage');
  const ROUNDS = 10;
  const SPARE = 10;                                // cards a lost card can add to the deck (one more round each), at most
  // the levels, easy to hard by steps (user 2026-11-22): per = pictures on a card, turn = the most a picture is turned
  // (degrees; else upright rows), mix = pictures in different sizes, idle = seconds before nobody's answer shows (42)
  const LEVELS = [
    { per: 4 },                                    // 1: 4 pictures, rows 2-2
    { per: 5 },                                    // 2: 5, rows 3-2 / 2-3
    { per: 6 },                                    // 3: 6, rows 2-3-1 / 1-3-2 (the game before levels)
    { per: 6, turn: 90 },                          // 4: 6, turned up to a quarter either way
    { per: 7, turn: 180 },                         // 5: 7, turned any way
    { per: 8, turn: 180, mix: true, idle: 30 },    // 6: 8, turned any way, different sizes, the answer shows after 30 s
  ];
  const GOOD = 7, POOR = 4;                        // cards the two players won together: >= GOOD up, <= POOR poor
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
  const PLACE = { title: [1190, 1330, 560],   // lower: the logo clears its horns (user: "인트로에서는 캐릭터 조금 더 내려줘")
    // game: back at the bottom centre between the pads, bigger (user: "캐릭터는 원래대로 밑으로 내려서 키워줘")
    game: [1200, 1905, 560] };
  let placeAnim = null;
  function placeMonster(where, ms = 0, from) {
    const to = PLACE[where];
    if (!ms) { mon.place(...to); placeAnim = null; return; }
    const a = from || PLACE[where === 'game' ? 'gameLow' : where] || to;
    placeAnim = { a, b: to, t0: performance.now(), ms };
  }
  PLACE.gameLow = [1200, 2700, 560];             // it rises from below
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
    clearTimers(); dropJump();
    $('#result').classList.remove('show'); if (window.Crown3D) Crown3D.hide();
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
  function resetBuzzers() { buzzEl.forEach(b => b.classList.remove('ready', 'down', 'listen', 'thinking', 'locked', 'chance', 'cue')); plateEl.forEach(p => p.classList.remove('turn')); }
  // the tapping hand on a button: until that player has pressed once this game, and again for both when a round
  // goes quiet (user: "어디를 눌러야 할지 모르니까 손가락이나 화살표나 뭐가 표시가 되면")
  function cue(p, on) { buzzEl[p].classList.toggle('cue', on && !G.locked[p]); }
  function renderScores() { scoreEl.forEach((e, i) => { e.textContent = G.scores[i]; }); }
  function setDeckN(n) { Card3D.setDeck(n, ...DECK, 320); }   // bigger (user: "가운데 덮힌 카드도 좀 더 키우면")
  // the two cards a little apart, the deck of the cards still to come between them (user: "남은 카드도 가운데 넣어줘,
  // 두개 카드 사이에 넣어줘")
  // cards 860 px, 360 px apart: the deck (310 px, user: "이 카드는 너무 작은거 아냐?") fits between them
  // bigger cards (user: "양 카드가 좀더 컸으면"), the deck between them again
  // room round the deck (user: "가운데 카드와 양옆에 카드 사이에 여백이 없는데 너무 붙었어"): cards a little further out,
  // the deck a little smaller -> ~70 px clear on each side
  const CARD = 960, SLOT = { L: [540, 900], R: [1860, 900] }, DECK = [1200, 900];
  const YAW = { L: 0.48, R: -0.48 };                // ~27° in toward the middle (user: "영상처럼 카드 각도를 가운데로")
  /** a 3D game card in slot L / R; anim 'flip' = spins in from the deck like a coin */
  function putCard(slot, words, side, anim) {
    const L = LEVELS[G.lv - 1] || {};
    const c = Card3D.make(words, { style: side === 'left' ? 'sky' : 'pink', turn: L.turn, mix: L.mix });
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
  function disposeGameCards() { [G.left, G.right, ...(G.extra || []), ...(G.piles || [[], []]).flat()].forEach(c => c && c.alive && c.dispose()); G.left = G.right = null; G.extra = []; G.piles = [[], []]; document.querySelectorAll('.match-tag').forEach(t => t.remove()); }

  async function startGame() {
    firstTouch();
    const tok = ++G.tok;
    G.screen = 'game'; G.phase = 'intro'; G.scores = [0, 0]; G.r = 0; G.locked = [false, false]; G.pressed = [false, false];
    G.said = 0; G.jumps = 0; G.jumpTold = false; G.t0 = 0;   // for the record (finish) and the JUMP guide (once a game)
    G.lost = [0, 0]; G.rounds = ROUNDS;              // cards each player gave back for a wrong word; rounds (+1 per card back)
    G.lv = LV.level; $('#lvTag b').textContent = G.lv; $('#lvTag').setAttribute('aria-label', 'Level ' + G.lv);   // the saved level
    clearTimers(); S.stopVoice();
    stage.dataset.screen = 'game';
    $('#result').classList.remove('show'); if (window.Crown3D) Crown3D.hide();
    clearTitleCards(); disposeGameCards(); Tin3D.show(false); Card3D.ambient(true, ...DECK);
    resetBuzzers(); renderScores(); hideWord(); dropJump();
    G.deck = Cards.makeDeck(ROUNDS + 1 + SPARE, Q.get('answer'), LEVELS[G.lv - 1].per);   // the chain goes on for the cards that come back
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
    G.t0 = performance.now();
    round(tok);
  }

  /** the rules, shown with two demo cards (first game of the visit) */
  // SKIP during the explanation (user: "설명 skip 버튼도 추가해줘. 처음에만 듣고 나중에는 안듣고 skip할거니까"):
  // a white see-through pill like Phonics Match's; it stops the voice, clears the demo cards and goes on to the deal
  async function teach(tok) {
    const on = () => alive(tok) && !G.skipTeach;
    G.skipTeach = false;
    const skip = $('#btnSkip'); skip.classList.add('show');
    try { await teachSteps(on); } finally {
      skip.classList.remove('show');
      [...(G.extra || [])].forEach(c => c && c.alive && c.dispose()); G.extra = []; unhit();
      [0, 1].forEach(p => setBuzz(p, 'chance', false));
      if (alive(tok)) { mon.pose('up'); mon.lookAt(null); }
    }
  }
  async function teachSteps(on) {                    // on() = still explaining (not skipped, same game)
    if (!G.helloed) { G.helloed = true; mon.wave(1); await S.say('t:hello'); if (!on()) return; }
    const demo = Cards.makeDeck(2, null, LEVELS[G.lv - 1].per);
    const L = putCard('L', demo.cards[0], 'left', 'flip'); G.extra = [L];
    await wait(240); if (!on()) return;
    const R = putCard('R', demo.cards[1], 'right', 'flip'); G.extra.push(R);
    await wait(600); if (!on()) return;
    mon.lookAt(...SLOT.L);
    const said = S.say('t:rule1');
    await wait(1300); if (!on()) return; mon.lookAt(...SLOT.R);
    await said; if (!on()) return;
    hitCards([L, R], demo.answers[0]);
    mon.lookAt(null); mon.hop(1);
    await S.chant(demo.answers[0]); if (!on()) return;
    await wait(300); if (!on()) return;
    // the buttons
    mon.pose('point', -1); mon.lookAt(200 - G.ex, 1580 + G.ey); setBuzz(0, 'chance', true);
    const r2 = S.say('t:rule2');
    await wait(1500); if (!on()) return;
    setBuzz(0, 'chance', false); mon.pose('point', 1); mon.lookAt(2200 + G.ex, 1580 + G.ey); setBuzz(1, 'chance', true);
    await r2; await wait(400); setBuzz(1, 'chance', false);
    if (!on()) return;
    mon.pose('up'); mon.lookAt(null);
    await S.say('t:rule3');
    if (!on()) return;
    unhit();
    S.sfx('whoosh');
    await Promise.all([L.gone(), R.gone()]);
  }

  // ── a round ───────────────────────────────────────────────────────────────────────────────────────────
  const answer = () => G.deck.answers[G.r];
  function rivals() { const a = answer(); return [...new Set([...G.left.words, ...G.right.words])].filter(w => w !== a); }
  // the spoken word: the company phonics-api first (a teacher's key on this device; js/phonics-api.js compares the
  // phonemes it heard with every picture on the table), the on-device recogniser when it can't answer
  const PH = Object.fromEntries(window.EC_WORDS.words.map(w => [w.w, w.ph]));
  // Both judges listen at once (user: "음성 인식률이 많이 떨어지네"; tools/qa/api_vs_device.py, 12 words × 8 voices incl. a
  // child and Korean-accented voices): the server alone passed 83 % of right words, now 90 % — the server's 'ok'; when it
  // is unsure, the picture its phonemes are nearest to (clearly, among the pictures on the table) or the on-device
  // recogniser's 'ok'; the server's 'wrong' (another picture heard almost exactly) still stands. Other words passed
  // 2.6 % -> 5.2 % (mostly mitt / meat, a sound apart).
  async function judgeSpeech(pcm16k) {
    const target = answer(), rv = rivals();
    const dev = () => STT.judge(pcm16k, target, rv);   // (only when the server can't judge)
    if (window.PhonicsAPI && PhonicsAPI.usable()) {
      const r = await PhonicsAPI.analyze(PhonicsAPI.encodeWav(pcm16k, 16000), target);
      if (r.ok) {
        const j = PhonicsAPI.judge(r.data, target, rv, PH);
        STT.last = { by: 'phonics-api', target, ms: r.ms, verdict: j.verdict, heard: j.heard, d: j.d };
        // phonics-api first, always (user 2026-11-22: "phonics-api 가 무조건 우선이지"): when the server answered, its
        // verdict stands — the on-device recogniser no longer overrules a 'wrong' or an 'unclear'. It judges only when the
        // server can't (no key, offline, busy, timeout) — below.
        return j.verdict === 'ok' ? 'ok' : j.verdict === 'wrong' ? 'wrong' : 'unclear';
      }
      if (Q.has('log')) console.log('phonics-api failed -> on-device', r.reason, r.status || '');
    }
    return dev();
  }
  function round(tok) {
    G.phase = 'race'; G.locked = [false, false];
    resetBuzzers();
    buzzEl.forEach(b => b.classList.add('ready'));
    // the tap-the-button guide is always for BOTH players at once — in a race a guide on one side only tells that player
    // to go (user 2026-11-22: "플레이어1만 자꾸 버튼 누르라고 가이드 주면 안될거 같은데"; it used to cue whoever hadn't pressed
    // yet this game, so Player 1 was cued every round while only Player 2 pressed). Both at the first round of a game
    // until someone presses, and both after 6 s with no press (armTimers). The 'chance' cue after a miss stays one-sided:
    // that is the other player's turn by the rules.
    const firstRound = !G.pressed[0] && !G.pressed[1];
    [0, 1].forEach(p => cue(p, firstRound));
    mon.lookAt(null); mon.pose('up');
    armTimers(tok);
  }
  function armTimers(tok) {
    clearTimers();
    const idle = ((LEVELS[G.lv - 1] || {}).idle || 42) * 1000;   // hints at a third and two thirds of it (14 s, 28 s, 42 s)
    G.timers.push(setTimeout(() => { if (alive(tok) && G.phase === 'race') [0, 1].forEach(p => cue(p, true)); }, 6000));
    G.timers.push(setTimeout(() => { if (alive(tok) && G.phase === 'race') hint(); }, idle / 3));
    G.timers.push(setTimeout(() => { if (alive(tok) && G.phase === 'race') hint(); }, idle * 2 / 3));
    G.timers.push(setTimeout(() => { if (alive(tok) && G.phase === 'race') nobody(tok); }, idle));
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
    // with the microphone on, the press is a short click: the long chord got into the recording and could end the
    // listen before the child had said the word
    S.stopVoice(); S.sfx(Mic.state === 'on' && !Q.has('tap') ? 'press' : 'buzz');
    G.pressed[p] = true;
    buzzEl.forEach((b, i) => { b.classList.remove('ready', 'chance', 'cue'); if (i !== p) b.classList.add('locked'); });
    setBuzz(p, 'down', true); plateEl[p].classList.add('turn');
    mon.lookAt(p ? 2150 + G.ex : 250 - G.ex, 1560 + G.ey); mon.hop(1, 0.2);
    const res = await answerTurn(p, tok);
    if (!alive(tok)) return;
    setBuzz(p, 'down', false); setBuzz(p, 'listen', false); setBuzz(p, 'thinking', false); plateEl[p].classList.remove('turn');
    if (res === 'ok') await win(p, tok);
    else if (res === 'jump' || res === 'nojudge') { if (res === 'jump') G.jumps++; await nobody(tok); }   // nobody gets the card
    else await miss(p, tok, res);
  }

  /** 'ok' | 'wrong' (another picture) | 'goodtry' (two unclear tries) | 'silent' | 'jump' | 'nojudge' (couldn't be judged) */
  async function answerTurn(p, tok) {
    // the card is won only by SAYING the word (user 2026-11-22: "이 게임은 카드를 보고 이미지를 발견하면 말을 해야 카드를
    // 획득할수 있는거잖아"). A device that can't hear words (no microphone / refused, file:// without a key, ?tap=1)
    // no longer falls back to tapping the picture: the answer is shown and nobody takes the card (kit rule 5)
    const useMic = !Q.has('tap') && (Q.has('fake') || (Mic.state === 'on' && (STT.state !== 'error' || PhonicsAPI.usable())));
    if (!useMic) return 'nojudge';
    try { return await micTurn(p, tok); } finally { S.setListening(false); }   // the music comes back however it ends
  }
  // The say turn, on the phonics games' common rules (phonics-kit README "공통 규칙: 설명 SKIP · 말하기 차례"; Phonics
  // Match sayItTurn): JUMP shows the whole turn and skips the word — nobody gets the card; two unclear tries -> "Good try!"
  // and the turn is over; silence -> "Say it!" once and a longer wait (~20 s in all), quiet again -> the turn is over;
  // the first quiet turn of a game shows JUMP (the glove taps it, "Want to skip? Tap the jump button!"). A clearly
  // different picture still loses the turn at once (the race's own rule). A spoken word that neither the phonics-api
  // nor the on-device recogniser could judge is skipped with no card — a sound is never passed unheard.
  let jumpNow = null, jumpTurn = 0;                  // set while a say turn can be jumped; the turn it belongs to
  const jumpEl = $('#btnJump'), jumpHand = $('#jumpHand');
  function showJump(p, on) {
    jumpEl.classList.remove('show', 'poke', 'p1', 'p2'); jumpHand.classList.remove('guide', 'p1', 'p2');
    if (!on) return;
    jumpEl.classList.add(p ? 'p2' : 'p1'); jumpHand.classList.add(p ? 'p2' : 'p1');
    void jumpEl.offsetWidth; jumpEl.classList.add('show');
  }
  function dropJump() { jumpTurn++; jumpNow = null; showJump(0, false); }   // leaving a game: no say turn any more
  /** once a game, on the first quiet say turn: the speaking player's glove taps JUMP twice (it hops) while the tutor says it */
  async function jumpGuide(p) {
    const h = buzzEl[p].querySelector('.hand');      // the 3D glove js/hand3d.js drew for this player
    if (h && h.src) { jumpHand.src = h.src; ['--tx', '--ty'].forEach(v => jumpHand.style.setProperty(v, h.style.getPropertyValue(v))); }
    jumpHand.classList.remove('guide'); void jumpHand.offsetWidth; jumpHand.classList.add('guide');
    const hop = () => { if (!jumpEl.classList.contains('show')) return; jumpEl.classList.remove('poke'); void jumpEl.offsetWidth; jumpEl.classList.add('poke'); S.sfx('tap'); };
    const t1 = setTimeout(hop, 2400 * 0.34), t2 = setTimeout(hop, 2400 * 0.56);
    mon.hop(1);
    try { await Promise.all([S.say('t:jump'), wait(2400)]); } finally { clearTimeout(t1); clearTimeout(t2); jumpHand.classList.remove('guide'); }
  }
  async function micTurn(p, tok) {
    let jumped = false, onJump;
    const jumpP = new Promise(r => { onJump = r; });
    const race = pr => Promise.race([pr, jumpP]);    // every wait in the turn ends at once on JUMP
    const my = ++jumpTurn;
    jumpNow = () => { if (jumped) return; jumped = true; jumpNow = null; S.sfx('tap'); S.stopVoice(); onJump('jump'); };
    showJump(p, true);
    let misses = 0, quiet = 0;
    try {
      for (let t = 0; t < 4; t++) {                  // at most 3 listens (2 quiet, 2 unclear, or one of each + one): never a loop
        setBuzz(p, 'listen', true); S.setListening(true);
        let verdict;
        if (Q.has('fake')) {
          const f = await race(wait(700).then(() => fake.length ? fake.shift() : 'ok'));
          verdict = f === 'hold' ? await race(wait(30000).then(() => 'silence')) : f === 'nojudge' ? null : f;
        } else {
          // more time to talk (user 2026-11-22: "발화시간을 너무 적게 줘서 그냥 기회가 빨리 넘어가는거 아냐?" → "ㅇㅇ"): 8 s to start
          // (was 6), a 1.2 s pause ends the word (was 0.8 — a child's "mush… room" was cut), a word may run 5 s (was 3.5)
          const r = await Mic.listen({ waitMs: quiet ? 11000 : 8000, maxMs: 5000, endMs: 1200, onLevel: v => buzzEl[p].style.setProperty('--lv', v.toFixed(2)), aborted: () => !alive(tok) || jumped });
          if (!alive(tok)) return 'wrong';
          if (jumped) return 'jump';
          if (r.kind === 'nomic') return 'nojudge';   // the microphone went away: no card without the word
          if (r.kind === 'silence') verdict = 'silence';
          else if (r.kind === 'speech') {
            setBuzz(p, 'listen', false); setBuzz(p, 'thinking', true);
            const pcm = await Mic.prepare(r.pcm, r.sr);
            verdict = await race(judgeSpeech(pcm));
            setBuzz(p, 'thinking', false);
            if (Q.has('log')) console.log('heard', STT.last);
          } else return 'wrong';
        }
        setBuzz(p, 'listen', false); setBuzz(p, 'thinking', false); S.setListening(false);
        if (!alive(tok)) return 'wrong';
        if (jumped || verdict === 'jump') return 'jump';
        if (verdict === null) return 'nojudge';      // no judge could hear it: skip, no card (never pass on a sound)
        if (verdict === 'ok') { G.said++; return 'ok'; }
        if (verdict === 'silence') {
          if (++quiet >= 2) return 'silent';
          if (!G.jumpTold) { G.jumpTold = true; await race(jumpGuide(p)); if (!alive(tok)) return 'wrong'; if (jumped) return 'jump'; }
          mon.hop(1);
          await race(S.say('t:sayit'));
        } else {                                     // a miss: unclear, or another picture heard — both get one more try
          // (user 2026-11-22: one mishearing used to end the turn at once; now the common 2-tries rule for both)
          if (++misses >= 2) return verdict === 'wrong' ? 'wrong' : 'goodtry';
          await race(S.say('t:again'));
        }
        if (!alive(tok)) return 'wrong';
        if (jumped) return 'jump';
      }
      return 'goodtry';
    } finally { if (my === jumpTurn) { jumpNow = null; showJump(p, false); } }   // a late end of a left game leaves a new turn alone
  }

  function hitCards(cards, w) {
    cards.forEach(c => {
      if (!c) return;
      c.hit(w, true);
      // no "match!" tag over the cards any more (user: "match 그냥 빼자 위치가 안맞아") — the glow + sparkles show it
      const sp = c.symScreen(w);
      if (sp) FX.sparkles(sp.x, sp.y, 16, 240);
    });
    S.sfx('right');
  }
  function unhit() {
    [G.left, G.right, ...(G.extra || [])].forEach(c => c && c.alive && c.clearHits());
    document.querySelectorAll('.match-tag').forEach(t => t.remove());
  }
  // the word as a picture card in the middle (user: "이미지와 단어 같이 나오는 카드 … 같이 가운데 나오면"); p = who won it
  const SPK = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  function showWord(w, p) {
    const el = $('#wordPop'), info = Cards.byW[w];
    const edge = p === 0 ? ['var(--p1)', 'var(--p1-deep)'] : p === 1 ? ['var(--p2)', 'var(--p2-deep)'] : ['var(--rim-sky)', 'var(--rim-sky-deep)'];
    el.innerHTML = `<div class="word-card" style="--edge:${edge[0]};--edge-deep:${edge[1]}"><div class="pic"><img src="${info.img}" alt="" draggable="false"></div>`
      + `<div class="word"><b>${w[0]}</b>${w.slice(1)}</div><div class="snd" role="button" aria-label="Listen: ${w}">${SPK}</div></div>`;
    el.querySelector('.snd').addEventListener('pointerdown', (e) => { e.stopPropagation(); S.stopVoice(); S.chant(w); });
    // a long word ("mushroom") shrinks to fit the card's inner width
    const wd = el.querySelector('.word'), room = wd.clientWidth;
    for (let f = .19; f > .08 && wd.scrollWidth > room; f -= .01) wd.style.setProperty('--wf', f.toFixed(2));
    el.classList.remove('hide'); void el.offsetWidth; el.classList.add('show');
    Card3D.deckPeek(false);
  }
  function hideWord() { const el = $('#wordPop'); Card3D.deckPeek(true); if (el.classList.contains('show')) { el.classList.remove('show'); el.classList.add('hide'); } }

  async function win(p, tok) {
    G.phase = 'reveal';
    const w = answer();
    earnCard();                                    // said right: +1 in the wallet (kept even if the card goes back later)
    hitCards([G.left, G.right], w);
    mon.cheer(); mon.lookAt(null); Card3D.burst();
    FX.ribbon(...SLOT.L, 520); setTimeout(() => FX.ribbon(...SLOT.R, 520), 160);
    FX.rays(1200, 900, 900);                       // behind the word, over the deck
    showWord(w, p);
    await S.chant(w); if (!alive(tok)) return;
    await S.say(['t:great1', 't:great2', 't:great3'][Math.floor(Math.random() * 3)]); if (!alive(tok)) return;
    // the left card goes to the winner
    await flyToPlate(G.left, p);
    if (!alive(tok)) return;
    G.scores[p]++; renderScores();
    const se = scoreEl[p]; se.classList.remove('bump', 'drop'); void se.offsetWidth; se.classList.add('bump');
    const pc = FX.center(plateEl[p]); FX.sparkles(pc.x, pc.y + 20, 12, 220);
    S.sfx('card');
    hideWord();
    await next(tok);
  }
  /** why: 'wrong' (another picture: "Oops!") | 'goodtry' (two unclear tries: "Good try!") | 'silent' (quiet ~20 s: no line) */
  async function miss(p, tok, why = 'wrong') {
    G.locked[p] = true;
    buzzEl[p].classList.add('locked');
    if (why === 'wrong') { S.sfx('wrong'); mon.oops(); await Promise.all([S.say('t:oops'), loseCard(p, tok)]); }
    else if (why === 'goodtry') { mon.hop(1); await S.say('t:goodtry'); }
    if (!alive(tok)) return;
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
  /** a wrong word (another picture) costs one won card (user 2026-11-22: "게임을 하기위해서 점수나 횟수 차감은 있어야하는데"):
   *  the top card of the player's pile goes back onto the deck — one more round to play — the count drops with a "−1".
   *  An empty pile loses nothing; the turn goes on as before */
  async function loseCard(p, tok) {
    const card = G.piles[p].pop();
    if (!card) return;
    G.scores[p]--; G.lost[p]++; renderScores();
    const se = scoreEl[p]; se.classList.remove('bump', 'drop'); void se.offsetWidth; se.classList.add('drop');
    const c = FX.center(se); FX.minus(c.x, c.y - 40, p ? 'var(--p2-deep)' : 'var(--p1-deep)');
    S.sfx('whoosh');
    await card.toDeck(DECK[0], DECK[1], 320, -2.95, 900, p ? -1 : 1);
    card.dispose();
    if (!alive(tok)) return;
    if (G.rounds < ROUNDS + SPARE) G.rounds++;
    setDeckN(G.rounds - 1 - G.r);
    S.sfx('card');
  }
  /** nobody got it: show it, read it, the left card leaves the table */
  async function nobody(tok) {
    G.phase = 'reveal'; clearTimers();
    resetBuzzers(); buzzEl.forEach(b => b.classList.add('locked'));
    const w = answer();
    await S.say('t:answer'); if (!alive(tok)) return;
    hitCards([G.left, G.right], w); showWord(w, -1); Card3D.burst();
    await S.chant(w); if (!alive(tok)) return;
    await wait(500);
    unhit(); S.sfx('whoosh');
    await G.left.gone(); G.left.dispose();
    hideWord();
    await next(tok);
  }

  // the won cards lie along the round mint table, on its left and right sides (user: "민트 탁자 양옆에 라운드 따라서
  // 쌓이면"): on a ring just inside the painted table's rim — an ellipse fitted to its back and front edges on bg.webp
  // (px: centre 1200,1145, radii 1340 x 490). Player 1's pile runs from just above the pad up the table's left side,
  // player 2's is its mirror. The backdrop covers the window, so the ring goes through the same cover fit; the piles lie
  // behind the play cards, which float above the table
  const TABLE = { cx: 1200, cy: 1145, a: 1340, b: 490 }, PILE = { ring: 0.79, gap: 58, px: 260, z: -2.6 };
  function coverFit() {
    const W = innerWidth, H = innerHeight, c = Math.max(W / 2400, H / 1792), k = Math.min(W / 2400, H / 1792);
    return { c, k, ox: (W - 2400 * c) / 2, oy: (H - 1792 * c) / 2 };
  }
  const bgToStage = (bx, by, f) => ({ x: (f.ox + bx * f.c) / f.k - G.ex, y: (f.oy + by * f.c) / f.k - G.ey });
  function pileSpot(p, i) {
    const fit = coverFit();
    // f = 0 at the table's side, > 0 toward the front (the pads), < 0 toward the back
    const ring = f => bgToStage(TABLE.cx - TABLE.a * PILE.ring * Math.cos(f), TABLE.cy + TABLE.b * PILE.ring * Math.sin(f), fit);
    const top = 1490 + G.ey - 40;                                        // the first card tucks just behind the pad
    let f = 1.2;
    while (f > 0 && ring(f).y > top) f -= 0.004;
    let q = ring(f);
    for (let walked = 0; walked < i * PILE.gap && f > -1.4;) { const n = ring(f -= 0.004); walked += Math.hypot(n.x - q.x, n.y - q.y); q = n; }
    const x = Math.max(q.x, -G.ex + PILE.px * 0.55);                     // never past the window's edge
    return { x: p ? 2400 - x : x, y: q.y, px: PILE.px,                   // player 2 = the mirror image
      rz: (p ? -1 : 1) * [0.12, -0.1, 0.2, -0.04, 0.08][i % 5], z: PILE.z };
  }
  async function flyToPlate(card, p) {
    unhit();
    G.piles[p].push(card);
    const n = G.piles[p].length - 1, q = pileSpot(p, n);
    S.sfx('whoosh');
    // each card keeps a card colour, sky and pink by turns, so the pile mixes both (user: "원래 카드 색으로 섞여서
    // 쌓이는게 나을거 같아" — the winner's colour made one player's pile all pink)
    card.restyle((n + p) % 2 ? 'pink' : 'sky', 900);
    await card.toPile(q.x, q.y, q.px, q.rz, q.z, 900, p ? 1 : -1, n);
    S.sfx('card');
    FX.sparkles(q.x, q.y, 10, 160);
  }

  async function next(tok) {
    G.r++;
    if (G.r >= G.rounds) return finish(tok);
    // the right card slides left, a new card comes from the deck
    G.left = G.right; G.right = null;
    G.left.slideTo(...SLOT.L); G.left.yawTo(YAW.L, 750); G.left.restyle('sky'); S.sfx('whoosh');
    await wait(450);
    G.right = putCard('R', G.deck.cards[G.r + 1], 'right', 'flip');
    setDeckN(G.rounds - 1 - G.r);
    await wait(750);
    if (!alive(tok)) return;
    if (G.r === G.rounds - 1) { await S.say('t:last'); if (!alive(tok)) return; }
    round(tok);
  }

  async function finish(tok) {
    G.phase = 'result'; clearTimers(); resetBuzzers();
    [G.left, G.right].forEach(c => c && c.alive && c.dispose()); G.left = G.right = null; unhit(); Card3D.hideDeck();   // the won piles stay on the table
    const [a, b] = G.scores, win = a === b ? -1 : a > b ? 0 : 1;
    $('#res1').textContent = a; $('#res2').textContent = b;
    // stars 0–3 per player by the cards won: 0 -> 0, 1–2 -> 1, 3–4 -> 2, 5+ -> 3
    const stars = [a, b].map(n => n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0);
    document.querySelectorAll('.res-p').forEach((e, i) => e.querySelectorAll('.res-stars i').forEach((s, j) => s.classList.toggle('on', j < stars[i])));
    document.querySelectorAll('.res-p').forEach((e, i) => e.classList.toggle('win', i === win));
    // screen words stay English in both languages; EN | 한 switches the voice only (user 2026-11-22: "화면 글자는 모두 영어로")
    const T = ['Player 1 wins!', 'Player 2 wins!', "It's a tie!"];
    $('#resTitle').textContent = win < 0 ? T[2] : T[win];
    $('#btnAgain span').textContent = 'Play again';
    $('#btnHome2 span').textContent = 'Home';
    // the level for the next game (phonics-kit "공통 규칙: 레벨"): the two players together won 7+ cards -> one up; 4 or fewer
    // -> a poor game, the second poor game in a row -> one down; else the same again. "LEVEL UP!" with the new number
    const was = G.lv;
    if (a + b >= GOOD) { LV.poor = 0; LV.level = Math.min(LEVELS.length, was + 1); }
    else if (a + b <= POOR) { if (++LV.poor >= 2) { LV.poor = 0; LV.level = Math.max(1, was - 1); } }
    else LV.poor = 0;
    save('ecLevel', LV);
    const up = LV.level > was;
    $('#resLevel b').textContent = LV.level;
    $('#result').classList.toggle('up', up);
    if (up) setTimeout(() => { if (alive(tok)) S.sfx('sparkle'); }, 1500);   // as the LEVEL UP! badge pops in
    $('#result').classList.add('show');
    // the winner's crown in 3D (user: "결과화면에 왕관도 3d 형태로"); the flat CSS crown only when WebGL can't
    document.querySelectorAll('.res-p').forEach((e, i) => e.classList.toggle('c3d', i === win && !!window.Crown3D && Crown3D.show(e)));
    if (win < 0 && window.Crown3D) Crown3D.hide();
    S.sfx('win'); FX.confetti(110); FX.fireworks(7, 3600);
    mon.cheer(); mon.lookAt(win < 0 ? null : win ? 2150 : 250, 300);
    // the shared record of the phonics games (phonics-kit F1; no level select): the level played, cards per player,
    // winner (1 / 2, 0 = a tie), words said right, words jumped, cards given back for a wrong word, play time from the first deal
    try {
      if (window.PhonicsProgress) PhonicsProgress.played('eye-catch', { level: was, p1: a, p2: b, stars1: stars[0], stars2: stars[1], cards: a + b, winner: win + 1, rounds: G.rounds,
        words: G.said, jumps: G.jumps, lost: G.lost[0] + G.lost[1], time: G.t0 ? Math.round((performance.now() - G.t0) / 100) / 10 : null });
      if (window.PhonicsProgress && LV.level !== was) PhonicsProgress.setLevel('eye-catch', LV.level);   // the next START plays it
    } catch (e) { console.warn('progress', e); }
    await wait(600); if (!alive(tok)) return;
    await S.say(win < 0 ? 't:draw' : win ? 't:win2' : 't:win1'); if (!alive(tok)) return;
    await wait(500);
    S.say('t:playagain');
  }

  // ── CHARACTERS (title): the cards won are spent on player faces (user 2026-11-22: "획득한 카드를 쓸곳이 없는데 보상이라
  // 할수 없어"; like Phonics Match's coins -> outfits). Wallet = every card won — its word said right (win) — minus the
  // cards spent; a card given back for a wrong word (loseCard) leaves it as it is. avatar1 / avatar2 are free (Player 1 /
  // Player 2 at first); avatar3–6 cost 5 / 10 / 15 / 20. A locked face: the first tap lights its price, the second buys
  // it when the wallet has enough (and gives it to the player on the tab), else the price and the wallet shake. One face
  // per player: the other player's face is refused with a shake.
  // localStorage: ecWallet { earned, spent } (seeded once from MY CARDS' 'ecAlbum', { word: times won }, the album this
  // replaced), ecChars [bought faces], ecPick { p1, p2 } (avatar numbers)
  const PRICE = { 3: 5, 4: 10, 5: 15, 6: 20 };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage off: this visit only */ } };
  let wallet = load('ecWallet', null);
  if (!wallet || typeof wallet.earned !== 'number') {
    wallet = { earned: Object.values(load('ecAlbum', {}) || {}).reduce((a, n) => a + (+n || 0), 0), spent: 0 };
    save('ecWallet', wallet);
  }
  const left = () => wallet.earned - wallet.spent;
  // the level, one for the device (both players share it): 'ecLevel' { level 1–6, poor: poor games in a row }; a device
  // without it continues from the shared record's level (PhonicsProgress), else level 1
  const LV = { level: 1, poor: 0 };
  {
    const v = load('ecLevel', null);
    let n = v && +v.level;
    if (!n) try { n = window.PhonicsProgress && PhonicsProgress.get('eye-catch').level; } catch (e) { n = 0; }
    LV.level = Math.min(LEVELS.length, Math.max(1, Math.round(+n || 1)));
    LV.poor = v && +v.poor > 0 ? Math.min(1, +v.poor) : 0;
  }
  function earnCard() { wallet.earned++; save('ecWallet', wallet); }
  const charsEl = $('#chars'), walletEl = $('#wallet'), charEls = [...document.querySelectorAll('#charGrid .ch')];
  const SRC = Object.fromEntries(charEls.map(b => [b.dataset.n, b.querySelector('img').getAttribute('src')]));
  const owned = new Set([1, 2, ...[].concat(load('ecChars', [])).filter(n => PRICE[n])]);
  let pick = load('ecPick', {}) || {};
  if (!owned.has(pick.p1) || !owned.has(pick.p2) || pick.p1 === pick.p2) pick = { p1: 1, p2: 2 };
  /** the chosen faces on the buttons, the result and the panel's tabs; avatar3–6 are 512² with room round the head (neck,
   *  pigtails, ears) where avatar1 / 2 are cut to the head: 'loose' draws them bigger so the heads match */
  function showPicks() {
    [pick.p1, pick.p2].forEach((n, p) => {
      [buzzEl[p].querySelector('.dome img'), $(`.res-p.p${p + 1} > img`), $(`#charTabs [data-p="${p}"] img`)].forEach(im => { im.src = SRC[n]; im.classList.toggle('loose', n > 2); });
    });
  }
  const LOCK = '<svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.4"/><path d="M8.5 10.5V8.2a3.5 3.5 0 0 1 7 0v2.3"/></svg>';
  charEls.forEach(b => b.insertAdjacentHTML('beforeend', '<b class="who"></b>'
    + (PRICE[b.dataset.n] ? `<i class="lock">${LOCK}</i><span class="price"><i class="mini-card"></i><b>${PRICE[b.dataset.n]}</b></span>` : '')));
  // the title in the logo's candy colours, letter by letter
  const TITLE_C = [['--p1', '--p1-deep'], ['--p2', '--p2-deep'], ['--orange', '--orange-deep'], ['--mic-on', '--mic-on-deep']];
  $('#charsTitle').innerHTML = [...'CHARACTERS'].map((ch, i) => `<span style="--c:var(${TITLE_C[i % 4][0]});--cd:var(${TITLE_C[i % 4][1]})">${ch}</span>`).join('');
  $('#resLevel .lu').innerHTML = [...'LEVEL UP!'].map((ch, i) => `<span style="--c:var(${TITLE_C[i % 4][0]});--cd:var(${TITLE_C[i % 4][1]})">${ch}</span>`).join('');
  let tab = 0, asking = 0;                         // the player choosing (0 / 1); the locked face whose price is lit
  function renderChars() {
    walletEl.querySelector('b').textContent = left();
    document.querySelectorAll('#charTabs .ptab').forEach(t => t.classList.toggle('on', +t.dataset.p === tab));
    charEls.forEach(b => {
      const n = +b.dataset.n, who = n === pick.p1 ? 1 : n === pick.p2 ? 2 : 0;
      b.classList.toggle('locked', !owned.has(n)); b.classList.toggle('ask', n === asking);
      b.classList.toggle('mine', who === tab + 1);
      b.dataset.who = who || ''; b.querySelector('.who').textContent = who || '';
    });
  }
  function jiggle(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 700); }
  function tapChar(b) {
    const n = +b.dataset.n, me = tab ? 'p2' : 'p1', other = tab ? 'p1' : 'p2';
    if (!owned.has(n)) {
      if (asking !== n) { asking = n; S.sfx('tap'); renderChars(); return; }
      if (left() < PRICE[n]) { S.sfx('wrong'); jiggle(b.querySelector('.price'), 'shake'); jiggle(walletEl, 'shake'); return; }
      wallet.spent += PRICE[n]; save('ecWallet', wallet);
      owned.add(n); save('ecChars', [...owned].filter(k => PRICE[k]));
      asking = 0; pick[me] = n; save('ecPick', pick);
      renderChars(); showPicks(); jiggle(b, 'pop'); jiggle(walletEl.querySelector('b'), 'pop');
      const c = FX.center(b); FX.sparkles(c.x, c.y, 22, 300); S.sfx('right');
      return;
    }
    asking = 0;
    if (pick[other] === n) { S.sfx('wrong'); renderChars(); jiggle(b, 'shake'); return; }   // the other player's face
    if (pick[me] !== n) { pick[me] = n; save('ecPick', pick); showPicks(); }
    S.sfx('pop'); renderChars(); jiggle(b, 'pop');
  }
  charEls.forEach(b => b.addEventListener('click', () => tapChar(b)));
  document.querySelectorAll('#charTabs .ptab').forEach(t => t.addEventListener('click', () => { tab = +t.dataset.p; asking = 0; S.sfx('tap'); renderChars(); }));
  function openChars() { S.sfx('tap'); tab = 0; asking = 0; renderChars(); charsEl.classList.add('show'); }
  function closeChars() { S.sfx('tap'); charsEl.classList.remove('show'); }
  $('#btnChars').addEventListener('click', openChars);
  $('#btnCharsClose').addEventListener('click', closeChars);
  showPicks();

  // ── inputs ────────────────────────────────────────────────────────────────────────────────────────────
  buzzEl.forEach((b, i) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); buzz(i); }));
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (charsEl.classList.contains('show')) { if (e.code === 'Escape') closeChars(); return; }
    if (G.screen === 'title' && (e.code === 'Space' || e.code === 'Enter')) { startGame(); return; }
    if (['KeyA', 'KeyQ', 'ArrowLeft', 'ShiftLeft'].includes(e.code)) buzz(0);
    if (['KeyL', 'KeyP', 'ArrowRight', 'ShiftRight'].includes(e.code)) buzz(1);
  });
  $('#btnStart').addEventListener('click', () => { S.sfx('pop'); startGame(); });
  $('#btnSkip').addEventListener('click', (e) => { e.stopPropagation(); if (G.skipTeach) return; G.skipTeach = true; S.sfx('tap'); S.stopVoice(); });
  jumpEl.addEventListener('click', (e) => { e.stopPropagation(); if (jumpNow) jumpNow(); });
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
  const showLang = () => { lang.dataset.l = S.lang; lang.querySelectorAll('.flag').forEach(f => f.classList.toggle('on', f.dataset.l === S.lang)); };
  lang.addEventListener('click', () => { S.setLang(S.lang === 'ko' ? 'en' : 'ko'); showLang(); S.sfx('tap'); if (G.screen === 'title') { S.stopVoice(); S.say('t:pressstart'); } });
  showLang();
  // phonics-api key (title only): a teacher enters it once per device; the dot shows who judges the words
  const keyBtn = $('#btnKey');
  const showApi = () => { keyBtn.dataset.api = PhonicsAPI.status(); };
  addEventListener('phonicsapi:status', showApi);
  keyBtn.addEventListener('click', async () => { S.sfx('tap'); await PhonicsAPI.keyDialog(); showApi(); });

  // ── boot ──────────────────────────────────────────────────────────────────────────────────────────────
  M3.init($('#gl'));
  mon = M3.monster;
  fit();
  showTitle();
  requestAnimationFrame(tick);
  if (Q.has('tap')) Mic.state = 'none';
  PhonicsAPI.init().then(showApi);
  window.__ec = { G, buzz, startGame, showTitle, fake, mon, M3, wait, held, judgeSpeech, jump: () => jumpNow && jumpNow(),
    chars: () => ({ wallet: left(), earned: wallet.earned, spent: wallet.spent, owned: [...owned], pick: { ...pick } }), openChars, closeChars,
    level: () => ({ ...LV }), LEVELS };
  window.__ready = true;
})();
