/* 梦境关卡可解性验证：对每一关做广度优先搜索，确认在限定步数内确实存在解法。
   关卡是手工排的，没有这层验证就可能出现"玩家怎么都过不去"的死关。 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 只取需要的数据表，不跑整个游戏
const sandbox = { window: {}, document: null, localStorage: null };
const grab = (name) => {
  const m = script.match(new RegExp('var ' + name + ' = ([\\s\\S]*?);\\n(?=var |function )'));
  return m ? m[1] : null;
};
const CHAINS = eval('(' + grab('CHAINS') + ')');
const ITEMS = {};
Object.keys(CHAINS).forEach((ck) => {
  CHAINS[ck].items.forEach((id, i) => { ITEMS[id] = { chain: ck, tier: i + 1 }; });
});
// DREAMS 是分三段 concat 出来的，直接把这段代码跑一遍
let dreamsSrc = script.slice(script.indexOf('var DREAMS = ['));
dreamsSrc = dreamsSrc.slice(0, dreamsSrc.indexOf('/* ---------- 梦境运行时'));
// 包一层函数，避免 var DREAMS 与外层同名标识符冲突
const DREAMS = new Function(dreamsSrc + '\nreturn DREAMS;')();

let pass = 0, fail = 0;

/* 最优步数解析解：从目标层往下反推缺口，缺一个就合一次。
   合成链每步必然"消耗两个同级、产出一个高级"，所以这就是精确下界。 */
/* 链名与物品 id 前缀并不一致（蛋奶链叫 dairy，物品却是 d1..d7），
   所以必须查 ITEMS 映射表，不能按前缀猜 */
function chainOf(id) {
  const it = ITEMS[id];
  return it ? { ck: it.chain, tier: it.tier } : null;
}
function optSteps(init, goalId, goalN) {
  const g = chainOf(goalId);
  const have = {};
  init.forEach(([, iid]) => {
    const c = chainOf(iid);
    if (c && c.ck === g.ck) have[c.tier] = (have[c.tier] || 0) + 1;
  });
  const need = { [g.tier]: goalN };
  let steps = 0;
  for (let t = g.tier; t > 1; t--) {
    const deficit = Math.max(0, (need[t] || 0) - (have[t] || 0));
    steps += deficit;
    need[t - 1] = (need[t - 1] || 0) + 2 * deficit;
  }
  return (need[1] || 0) <= (have[1] || 0) ? steps : -1;
}

DREAMS.forEach((lv) => {
  let opt = optSteps(lv.init, lv.goal.id, lv.goal.n);
  if (lv.goal.and) {
    const o2 = optSteps(lv.init, lv.goal.and.id, lv.goal.and.n);
    opt = (opt < 0 || o2 < 0) ? -1 : opt + o2;
  }
  if (lv.mirror && opt > 0) opt = Math.ceil(opt / 2);

  const usable = lv.w * lv.h - (lv.cloud ? lv.cloud.length : 0);
  const problems = [];
  if (opt < 0) problems.push('材料不足，无解');
  if (lv.init.length > usable) problems.push(`初始 ${lv.init.length} 件放不进 ${usable} 个可用格`);
  if (opt >= 0 && lv.mv < opt) problems.push(`步数上限 ${lv.mv} 少于最优解 ${opt}`);
  if (opt >= 0 && lv.opt !== opt) problems.push(`记录的 opt=${lv.opt} 与实算 ${opt} 不符（三星线会错）`);
  if (opt >= 0 && lv.mv - opt > 6) problems.push(`步数上限比最优多 ${lv.mv - opt} 步，过于宽松`);

  if (problems.length === 0) {
    console.log(`[PASS] 第 ${String(lv.id).padStart(2)} 关 ${lv.n}：最优 ${opt} 步 / 上限 ${lv.mv} 步，${lv.init.length} 件材料`);
    pass++;
  } else {
    console.log(`[FAIL] 第 ${String(lv.id).padStart(2)} 关 ${lv.n}：${problems.join('；')}`);
    fail++;
  }
});

console.log('');
console.log(fail === 0 ? `全部 ${pass} 关可解、步数与三星线自洽` : `有 ${fail} 关有问题`);
process.exit(fail === 0 ? 0 : 1);
