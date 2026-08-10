/* 每周谜题可解性校验：跑遍未来两年的周种子，确认每一道都解得开。
   周谜题是程序生成的，一旦某周出了个死局，玩家整周都卡着——所以必须全量验证。 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 造一个最小环境把游戏脚本跑起来（只为拿到 genWeekly 与数据表）
const store = new Map();
const stub = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
const noop = () => {};
const elStub = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: {}, setAttribute: noop, getAttribute: () => null, appendChild: noop,
  removeChild: noop, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, innerHTML: '', textContent: '', value: '', children: [],
  closest: () => null, focus: noop, select: noop, parentNode: null, onclick: null,
});
const doc = {
  getElementById: elStub, querySelector: () => null, querySelectorAll: () => [],
  createElement: elStub, addEventListener: noop, body: elStub(), head: elStub(),
  documentElement: elStub(), hidden: false, execCommand: () => true,
};
const win = {
  addEventListener: noop, setTimeout: (f) => 0, clearTimeout: noop,
  setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0,
  localStorage: stub, navigator: { serviceWorker: null }, location: { protocol: 'http:' },
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  AudioContext: null, webkitAudioContext: null, Audio: function () { return { play: () => ({ catch: noop }), pause: noop }; },
};
const ctx = {
  window: win, document: doc, localStorage: stub, navigator: win.navigator,
  location: win.location, setTimeout: win.setTimeout, clearTimeout: noop,
  setInterval: win.setInterval, clearInterval: noop,
  requestAnimationFrame: win.requestAnimationFrame, Audio: win.Audio,
  console: { log: noop, warn: noop, error: noop },
  Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Set, isNaN, parseInt, parseFloat,
};
const vm = require('vm');
vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (e) { /* DOM 相关报错不影响取数据 */ }

const G = ctx.window.__game;
if (!G || !G.genWeekly) {
  console.log('取不到 genWeekly，检查调试接口是否导出');
  process.exit(1);
}
const { genWeekly, ITEMS, CHAINS } = G;

let pass = 0, fail = 0;
const goalHist = {};
const chainHist = {};

function check(week) {
  const lv = genWeekly(week);
  const problems = [];

  // 1) 材料放得下
  const usable = lv.w * lv.h;
  if (lv.init.length > usable) problems.push(`材料 ${lv.init.length} 超过 ${usable} 格`);

  // 2) 位置不重复
  const pos = lv.init.map(p => p[0]);
  if (new Set(pos).size !== pos.length) problems.push('有格子被放了两次');
  if (pos.some(p => p < 0 || p >= usable)) problems.push('有材料落在棋盘外');

  // 3) 贪心求解：低级往高级合，看能否凑出目标
  const goalTier = ITEMS[lv.goal.id].tier;
  const cur = {};
  lv.init.forEach(([, id]) => {
    const t = ITEMS[id].tier;
    cur[t] = (cur[t] || 0) + 1;
  });
  for (let t = 1; t < goalTier; t++) {
    const pairs = Math.floor((cur[t] || 0) / 2);
    cur[t + 1] = (cur[t + 1] || 0) + pairs;
    cur[t] = (cur[t] || 0) - pairs * 2;
  }
  if ((cur[goalTier] || 0) < lv.goal.n) problems.push('材料不够，解不开');

  // 4) 步数合理
  if (lv.opt < 1) problems.push('最优步数小于 1');
  if (lv.mv < lv.opt) problems.push(`步数上限 ${lv.mv} 低于最优 ${lv.opt}`);
  if (lv.mv > lv.opt + 10) problems.push('步数给得过于宽松');

  // 5) 所有材料同链
  const chains = new Set(lv.init.map(([, id]) => ITEMS[id].chain));
  if (chains.size > 1) problems.push('混进了别的链');

  goalHist[lv.goal.id] = (goalHist[lv.goal.id] || 0) + 1;
  chainHist[[...chains][0]] = (chainHist[[...chains][0]] || 0) + 1;

  if (problems.length) {
    fail++;
    if (fail <= 5) console.log(`[FAIL] 第 ${week} 周：${problems.join('；')}`);
  } else {
    pass++;
  }
}

// 未来两年的每一周
for (let y = 2026; y <= 2027; y++) {
  for (let w = 1; w <= 53; w++) check(y * 100 + w);
}

// 同一周必须永远生成同一道题（否则玩家中途刷新会换题）
const a = genWeekly(202632), b = genWeekly(202632);
const same = JSON.stringify(a) === JSON.stringify(b);
if (!same) { console.log('[FAIL] 同一周两次生成的题目不一致'); fail++; } else pass++;

// 不同周应该不一样，否则每周都是同一题
const c = genWeekly(202633);
if (JSON.stringify(a) === JSON.stringify(c)) { console.log('[FAIL] 相邻两周题目相同'); fail++; } else pass++;

console.log(`\n检查 ${pass + fail} 项：通过 ${pass}，失败 ${fail}`);
console.log('链分布：', JSON.stringify(chainHist));
console.log('目标分布：', JSON.stringify(goalHist));
if (fail) process.exit(1);
console.log('\n全部周谜题可解、题目稳定且逐周不同');
