/* 叠叠温泉平衡模拟：三种水平的玩家各跑一千局，看通关率。
   目的是回答「会不会玩不起来」——连像样的策略都过不了，就是数值不对。 */

const SLOT_N = 7;
const ART = ['veg1','veg2','veg3','veg4','bun1','bun2','bun3','d1','d2','f1','f2','w1'];

const LEVELS = [
  { n: '试手 3 层', layers: 3, kinds: 4, per: 6,  cols: 4 },
  { n: '入梦 4 层', layers: 4, kinds: 5, per: 9,  cols: 5 },
  { n: '沉梦 5 层', layers: 5, kinds: 7, per: 12, cols: 5 },
  { n: '深梦 6 层', layers: 6, kinds: 9, per: 14, cols: 6 },
];

function seedRand(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(cfg, rnd) {
  const deck = [];
  for (let k = 0; k < cfg.kinds; k++) {
    for (let i = 0; i < cfg.per; i++) deck.push(ART[k % ART.length]);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cards = [];
  let di = 0;
  const perLayer = Math.ceil(deck.length / cfg.layers);
  for (let L = 0; L < cfg.layers && di < deck.length; L++) {
    const rows = Math.ceil(perLayer / cfg.cols);
    const ox = (L % 2) * 0.5, oy = L * 0.42;
    for (let r = 0; r < rows && di < deck.length; r++) {
      for (let c = 0; c < cfg.cols && di < deck.length; c++) {
        cards.push({ id: deck[di++], layer: L, gx: c + ox, gy: r + oy, out: false });
      }
    }
  }
  return cards;
}

function covered(cards, card) {
  for (const o of cards) {
    if (o === card || o.out || o.layer <= card.layer) continue;
    if (Math.abs(o.gx - card.gx) < 0.85 && Math.abs(o.gy - card.gy) < 0.85) return true;
  }
  return false;
}

function freeCards(cards) {
  return cards.filter(c => !c.out && !covered(cards, c));
}

function clearTriples(slots) {
  const count = {};
  slots.forEach(id => { count[id] = (count[id] || 0) + 1; });
  let out = slots;
  Object.keys(count).forEach(id => {
    while (count[id] >= 3) {
      let n = 0;
      out = out.filter(x => {
        if (x === id && n < 3) { n++; return false; }
        return true;
      });
      count[id] -= 3;
    }
  });
  return out;
}

/* 三种玩家：
   random  乱点，最差情况
   greedy  优先点能凑成三连的，其次点卡槽里已有的
   careful greedy + 卡槽紧张时先用道具而不是硬塞 */
function play(cfg, rnd, style, toolN) {
  const cards = build(cfg, rnd);
  let slots = [];
  const t = { pop: toolN };
  let guard = 0;

  const usePop = () => {
    if (t.pop <= 0 || !slots.length) return false;
    t.pop--;
    const back = slots.splice(0, 3);
    const topLayer = Math.max(...cards.map(c => c.layer)) + 1;
    back.forEach((id, i) => cards.push({ id, layer: topLayer, gx: i * 1.1, gy: 0, out: false }));
    return true;
  };

  while (guard++ < 8000) {
    const alive = cards.filter(c => !c.out);
    if (alive.length === 0 && slots.length === 0) return true;

    const free = freeCards(cards);
    if (!free.length) return false;

    const count = {};
    slots.forEach(id => { count[id] = (count[id] || 0) + 1; });

    if (slots.length >= SLOT_N) {
      if (usePop()) continue;
      return false;
    }

    let pick = null;
    if (style === 'random') {
      pick = free[Math.floor(rnd() * free.length)];
    } else {
      pick = free.find(c => (count[c.id] || 0) === 2)
          || free.find(c => (count[c.id] || 0) === 1);
      if (!pick) {
        if (style === 'careful' && slots.length >= SLOT_N - 2) {
          if (usePop()) continue;
          return false;
        }
        pick = free[Math.floor(rnd() * free.length)];
      }
    }

    pick.out = true;
    slots.push(pick.id);
    slots.sort();
    slots = clearTriples(slots);
  }
  return false;
}

const N = 1000;
const lines = [];
lines.push(`每档 ${N} 局，道具 1 次\n`);
lines.push('难度         乱点     一般     谨慎    牌数');
lines.push('-'.repeat(46));

LEVELS.forEach((cfg, li) => {
  const row = {};
  ['random', 'greedy', 'careful'].forEach(style => {
    let win = 0;
    for (let i = 0; i < N; i++) {
      if (play(cfg, seedRand(li * 100003 + i * 7 + style.length), style, 1)) win++;
    }
    row[style] = (win / N * 100).toFixed(1) + '%';
  });
  lines.push(
    cfg.n.padEnd(11) +
    row.random.padStart(7) + '  ' +
    row.greedy.padStart(7) + '  ' +
    row.careful.padStart(7) + '  ' +
    String(cfg.kinds * cfg.per).padStart(4)
  );
});

lines.push('\n道具给 2 次时「一般」水平的通关率');
lines.push('-'.repeat(46));
LEVELS.forEach((cfg, li) => {
  let win = 0;
  for (let i = 0; i < N; i++) {
    if (play(cfg, seedRand(li * 100003 + i * 13), 'greedy', 2)) win++;
  }
  lines.push(cfg.n.padEnd(11) + (win / N * 100).toFixed(1) + '%');
});

lines.push('\n判读标准：');
lines.push('  「一般」低于 50% = 太难，玩家会挫败');
lines.push('  「谨慎」低于 80% = 数值要放宽');
lines.push('  「乱点」高于 80% = 太简单，没有挑战');

console.log(lines.join('\n'));
