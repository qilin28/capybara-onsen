// 水豚温泉町 M1.5 无头逻辑测试：核心玩法 + 剧情系统 + 主线目标 + 换单限制
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const src = m[1];

function makeEnv(store) {
  const els = {};
  function el(id) {
    if (els[id]) return els[id];
    const e = {
      innerHTML: '', textContent: '', style: {},
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c, force) {
          const on = force === undefined ? !this._s.has(c) : !!force;
          if (on) this._s.add(c); else this._s.delete(c);
          return on;
        },
      },
      setAttribute() {}, getAttribute() { return null; },
      addEventListener() {}, onclick: null,
      querySelector() { return null; }, querySelectorAll() { return []; },
    };
    return (els[id] = e);
  }
  const documentStub = { getElementById: el, addEventListener() {}, hidden: false };
  const windowStub = { addEventListener() {} };
  const localStorageStub = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  // 模拟本地 http 环境：借此验证 sw 只在 https 注册的守卫
  const locationStub = { protocol: 'http:', href: 'http://localhost:8080/' };
  const navigatorStub = { serviceWorker: { register() { throw new Error('本地不应注册 sw'); } } };
  const fn = new Function('document', 'window', 'localStorage', 'location', 'navigator', src);
  fn(documentStub, windowStub, localStorageStub, locationStub, navigatorStub);
  return windowStub.__game;
}
function drain(g) { // 快进对话：先补全打字，再翻页
  let n = 0;
  while (g.dlgOpen() && n++ < 80) g.dlgTap();
  return n;
}


let fails = 0;
function ok(c, m){ if(c) console.log('[PASS] '+m); else { console.error('[FAIL] '+m); fails++; } }

// M5 之前的存档：没有 cards/tickets/dexS/gift，棋盘用 3 位格式
const legacy = {
  v:1, coins:321, xp:12, level:4, mute:false, tut:true,
  dex:['veg1','veg2','veg3','bun1'],
  cells:[[16,'g','basket'],[18,'g','flour'],[23,'i','veg2'],[24,'i','veg2'],[30,'i','bun1'],[42,'b','veg1'],[45,'c',0]],
  gens:{basket:{ch:7,last:Date.now()}, flour:{ch:3,last:Date.now()}},
  orders:[{c:'rabbit',needs:[['veg2',2]],rf:0},{c:'panda',needs:[['bun1',1]],rf:1},{c:'shiba',needs:[['veg1',1]],rf:0}],
  t:Date.now(), story:{intro:1,merge:1,deliver:1}, met:['rabbit'], thx:['rabbit'],
  quest:{i:3,p:0}, stat:{deliver:6}, stars:9, reno:['lantern'], store:[null,null,null,null]
};
const store = new Map([['wonsen1', JSON.stringify(legacy)]]);
const g = makeEnv(store);
const S = g.S();

ok(S.coins === 321 && S.level === 4, '老存档的金币与等级正确读入');
ok(S.stars === 9 && S.reno.length === 1, '老存档的星星与装修正确读入');
ok(S.quest.i === 3 && S.stat.deliver === 6, '老存档的主线进度正确读入');
ok(S.board[16] && S.board[16].gid === 'basket', '老存档的生成器就位');
ok(S.board[23] && S.board[23].id === 'veg2' && !S.board[23].s, '老存档 3 位格式物品读入且非闪光');
ok(S.board[42] && S.board[42].t === 'b', '老存档的泡泡格保留');
ok(S.board[45] && S.board[45].t === 'c', '老存档的礼盒格保留');
ok(S.orders[1] && S.orders[1].rf === 1, '老存档的换单标记保留');

// M5 新字段应有安全默认值
ok(S.cards && Object.keys(S.cards).length === 0, '新字段 cards 默认空');
ok(S.tickets === 0, '新字段 tickets 默认 0');
ok(Array.isArray(S.dexS) && S.dexS.length === 0, '新字段 dexS 默认空');
ok(S.gift && S.gift.last && typeof S.gift.stock === 'number', '新字段 gift 有默认值');

// 老档存档后应能被再次读回，且新系统可用
g.gachaPull('R'); 
let n=0; while(g.dlgOpen() && n++<40) g.dlgTap();
g.save();
const g2 = makeEnv(store);
ok(Object.keys(g2.S().cards).length === 1, '老档升级后新系统可正常存取');
ok(g2.S().coins === S.coins, '升级后的存档金币一致');

g.stopTick(); g2.stopTick();
console.log(fails ? ('\n有 '+fails+' 项失败') : '\n全部通过');
process.exit(fails ? 1 : 0);
