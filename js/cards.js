/* Eye Catch — cards. 12 pictures (FPR K Unit 1 Lesson 1), 6 on a card.
 * The deck is a chain: card i and card i+1 share exactly ONE picture (the round's answer): card i+1 = one picture
 * of card i + five of the six pictures card i doesn't have. Answers are spread evenly over the 12 words.
 * The cards themselves are 3D (js/card3d.js).
 */
(function () {
  'use strict';
  const W = window.EC_WORDS.words;
  const byW = Object.fromEntries(W.map(w => [w.w, w]));
  const PER = 6;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /** n cards; answers[i] = the picture shared by cards[i] and cards[i+1] */
  function makeDeck(n, first) {
    const all = W.map(w => w.w);
    const used = Object.fromEntries(all.map(w => [w, 0]));
    const cards = [shuffle(all.slice()).slice(0, PER)];
    if (first && !cards[0].includes(first)) cards[0][0] = first;    // QA: the first round's answer (?answer=)
    const answers = [];
    for (let i = 1; i < n; i++) {
      const prev = cards[i - 1];
      const last = answers[answers.length - 1];
      // the least-used picture of the previous card (never the same answer twice in a row)
      const pool = shuffle(prev.filter(w => w !== last)).sort((a, b) => used[a] - used[b]);
      const s = i === 1 && first ? first : pool[0];
      used[s]++;
      const rest = shuffle(all.filter(w => !prev.includes(w))).slice(0, PER - 1);
      cards.push(shuffle([s, ...rest]));
      answers.push(s);
    }
    return { cards, answers };
  }

  window.Cards = { makeDeck, byW, words: W.map(w => w.w), shuffle };
})();
