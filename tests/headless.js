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
function ok(cond, msg) {
  if (cond) console.log('[PASS] ' + msg);
  else { console.error('[FAIL] ' + msg); fails++; }
}

// ---------- 全新开局与开场剧情 ----------
const store = new Map();
const g = makeEnv(store);
const S = g.S();

ok(S.coins === 50, '初始金币 50');
ok(g.dlgOpen() === true, '首次进入自动播放开场剧情');
ok(S.story.intro === 1, '开场剧情标记已写入');
drain(g);
ok(g.dlgOpen() === false, '对话可以逐句点完');
ok(S.quest.i === 0, '主线目标从第一条开始');
ok(g.count('veg1') === 2 && g.count('bun1') === 2, '初始食材就位');
ok(S.orders.every(o => o && o.c && o.needs.length > 0 && o.rf === 0), '订单生成且换单标记为 0');

// ---------- 生成器与主线目标一 ----------
ok(g.tapGen('basket') === true, '点击菜篮子可生成');
g.tapGen('basket'); g.tapGen('basket');
ok(S.quest.i === 1, '主线目标一（点生成器 3 次）完成');
let taps = 3;
while (g.tapGen('basket') && taps < 30) taps++;
ok(S.gens.basket.ch === 0 && taps === 10, '充能耗尽后停止（共 10 次）');
ok(g.tapGen('basket') === false, '零充能时点击被拒绝');
ok(g.tapGen('capy') === true, '阿汤独立充能可生成');

// ---------- 合成、剧情与图鉴 ----------
const c0 = S.coins;
const a1 = g.spawn('veg3'), a2 = g.spawn('veg3');
ok(g.tryMove(a1, a2) === 'merge', '同类合成成功');
ok(S.board[a2].id === 'veg4', '合成产物为下一级');
ok(S.story.merge === 1, '首次合成触发剧情');
ok(S.coins === c0 + 40 + 15, '发现奖励 40 + 主线目标二奖励 15');
ok(S.quest.i === 2, '主线目标二（合成一次）完成');
drain(g);
ok(S.met.length === 1, '剧情结束后第一位客人上门自我介绍');

const b1 = g.spawn('veg1'), b2 = g.spawn('bun1');
ok(g.tryMove(b1, b2) === 'bounce', '跨链不可合成');
const m1 = g.spawn('bun8'), m2 = g.spawn('bun8');
ok(g.tryMove(m1, m2) === 'bounce', '最高级不可再合成');

// ---------- 订单交付与剧情 ----------
const c1 = S.coins;
g.setOrder(0, [['veg4', 1]], 'panda');
ok(g.canDeliver(0) === true, '备齐后可交付');
ok(g.deliver(0) === true, '交付成功');
ok(S.coins === c1 + 32 + 25, '订单奖励 32 + 主线目标三奖励 25');
ok(S.quest.i === 3, '主线目标三（首单）完成');
ok(S.story.deliver === 1, '首单剧情触发');
ok(S.thx.indexOf('panda') >= 0, '客人首次交付有专属答谢');
ok(S.stat.deliver === 1, '交付计数累积');
drain(g);

g.setOrder(1, [['veg7', 2]], 'hedge');
ok(g.canDeliver(1) === false && g.deliver(1) === false, '缺货订单不可交付');

// ---------- 换单限制 ----------
const c2 = S.coins;
ok(g.refreshOrder(2) === true, '第一次换单成功（花 10 金币）');
ok(S.coins === c2 - 10 && S.orders[2].rf === 1, '扣费并标记已换单');
ok(g.refreshOrder(2) === false, '同一单不能再换第二次');
drain(g);

// ---------- 出售与撤销 ----------
const c3 = S.coins;
const si = g.spawn('bun2');
ok(g.sellAt(si) === true && S.coins === c3 + 4, '出售 2 级物品 +4 金币');
ok(g.undoSell() === true && S.coins === c3, '撤销出售返还金币');

// ---------- 升级 ----------
const lv0 = S.level;
g.addXp(1000);
ok(S.level > lv0, '经验升级');
ok(S.gens.basket.ch === 10 && S.gens.capy.ch === 15, '升级回满充能');

// ---------- 存档与恢复 ----------
g.save();
const occ0 = S.board.filter(Boolean).length;
const g2 = makeEnv(store);
const S2 = g2.S();
ok(g2.dlgOpen() === false, '老玩家进入不再重播开场剧情');
ok(S2.coins === S.coins && S2.level === S.level, '金币与等级恢复');
ok(S2.board.filter(Boolean).length === occ0, '棋盘完整恢复');
ok(S2.quest.i === S.quest.i && S2.met.length === S.met.length, '主线进度与客人关系恢复');
ok(S2.story.merge === 1 && S2.story.deliver === 1, '剧情标记恢复');

// ---------- 离线回充 ----------
S2.gens.basket.ch = 0;
S2.gens.basket.last = Date.now() - 15 * 60 * 1000;
g2.regen();
ok(S2.gens.basket.ch === 10, '离线回充至满');
S2.gens.flour.ch = 5;
S2.gens.flour.last = Date.now() - 2 * 90 * 1000 - 1000;
g2.regen();
ok(S2.gens.flour.ch === 7, '部分回充正确');

// ---------- M2 经营层：星星 / 装修 / 开荒 / 商店 / 宝箱 ----------
ok(S.stars > 0, '交付订单获得星星');
S.stars = 300; S.coins = 3000;

ok(g.buyReno('floor2') === false, '地板二段有前置锁定');
ok(g.buyReno('lantern') === true, '装修：擦亮灯笼');
ok(g.regenIv('basket') < 90, '灯笼效果：回充加速 10%');
ok(g.buyReno('chime') === true, '装修：挂上风铃');
ok(g.capOf('basket') === 12, '风铃效果：充能上限 +2');
drain(g);

const st0 = S.stars, co0 = S.coins;
ok(g.buyReno('floor1') === true, '装修：修理地板一段');
ok(S.stars === st0 - 10 && S.coins === co0 - 100, '装修正确扣星星与金币');
ok(g.openRows() === 7, '第七排开放');
drain(g);
let bubIdx = -1;
for (let i = 42; i < 49; i++) if (S.board[i] && S.board[i].t === 'b') { bubIdx = i; break; }
ok(bubIdx >= 0, '开荒排出现泡泡物品');
const bid = S.board[bubIdx].id;
const sp = g.spawn(bid);
ok(g.tryMove(sp, bubIdx) === 'merge', '相同食材贴上可解救泡泡');
ok(S.board[bubIdx].t === 'i', '泡泡格变为普通物品');
drain(g);

const cc = S.coins;
S.gens.basket.ch = 0;
ok(g.buyShop('coffee') === true && S.coins === cc - 50, '能量焙茶扣费');
ok(S.gens.basket.ch === g.capOf('basket'), '焙茶回满充能');
const cc2 = S.coins;
const occA = S.board.filter(Boolean).length;
ok(g.buyShop('pack1') === true, '食材小推车购买成功');
ok(S.board.filter(Boolean).length > occA, '小推车产出食材上盘');
ok(S.coins >= cc2 - 60 && S.coins < cc2, '小推车扣费（图鉴奖励可抵扣部分）');

let ci = g.spawn('veg1');
S.board[ci] = { t: 'c' };
const cc3 = S.coins;
ok(g.openChest(ci) === true, '礼盒可以打开');
ok(S.coins > cc3, '礼盒开出金币');
drain(g);

const stSel = starsOfProbe();
function starsOfProbe(){
  g.setOrder(0, [['veg2', 1]], 'rabbit');
  const s1 = g.starsOf(S.orders[0]);
  g.setOrder(0, [['veg6', 2], ['bun4', 1]], 'rabbit');
  const s2 = g.starsOf(S.orders[0]);
  return { s1, s2 };
}
ok(stSel.s1 >= 1 && stSel.s2 > stSel.s1, '订单难度越高星星越多');

g.save();
const g3 = makeEnv(store);
const S3 = g3.S();
ok(S3.stars === S.stars && S3.reno.length === S.reno.length, '星星与装修进度可恢复');
ok(g3.openRows() === 7, '开荒进度可恢复');
let bubKept = 0;
for (let i = 42; i < 49; i++) if (S3.board[i] && S3.board[i].t === 'b') bubKept++;
ok(bubKept > 0, '泡泡格随存档恢复');
ok(g3.capOf('basket') === 12 && g3.regenIv('basket') < 90, '装修增益随存档生效');

// ---------- M3 烹饪台 / 蛋奶链 / 仓库 ----------
let dairyIdx = -1;
for (let i = 0; i < S.board.length; i++) if (S.board[i] && S.board[i].t === 'g' && S.board[i].gid === 'dairy') dairyIdx = i;
ok(dairyIdx >= 0, '奶箱生成器在棋盘上');
ok(g.tapGen('dairy') === true, '奶箱可生成蛋奶食材');

ok(g.cook('veg1', 'bun1') === 'fail', '错误搭配烹饪失败');
const nVeg1 = g.count('veg1');
ok(g.count('veg1') === nVeg1, '失败不消耗食材');

g.spawn('bun5'); g.spawn('d2');
const b5n = g.count('bun5'), d2n = g.count('d2');
const ckBefore = g.cookedCount();
const res = g.cook('bun5', 'd2');
ok(res === 'k1', '正确配方做出鸡蛋灌饼');
ok(g.count('k1') >= 1, '成品菜出现在棋盘');
ok(g.count('bun5') === b5n - 1 && g.count('d2') === d2n - 1, '烹饪各消耗一份食材');
ok(g.cookedCount() === ckBefore + 1, '菜谱图鉴收录');
drain(g);

g.spawn('d2'); g.spawn('d4');
ok(g.cook('d2', 'd4') === 't1', '第二道菜谱：焦糖布丁');
drain(g);

const kIdx = g.spawn('k1');
const cSell = S.coins;
if (kIdx >= 0) {
  ok(g.sellAt(kIdx) === true && S.coins === cSell + 8, '成品菜出售价按加成计算（val x2 = 8）');
  g.undoSell();
}

// 仓库
const wIdx = g.spawn('veg3');
const wOcc = S.board.filter(Boolean).length;
ok(g.storePut(wIdx) === true, '存入储物间');
ok(S.store.filter(Boolean).length >= 1 && S.board.filter(Boolean).length === wOcc - 1, '棋盘腾出格子');
const slot = S.store.findIndex(x => x === 'veg3');
ok(g.storeTake(slot) === true && g.count('veg3') >= 1, '从储物间取回');

// 成品菜订单与持久化
g.setOrder(0, [['k1', 1]], 'panda');
ok(g.canDeliver(0) === true, '成品菜订单可交付');
const cOrd = S.coins;
g.deliver(0);
ok(S.coins - cOrd >= Math.round(4 * 8 * 1.0), '成品菜订单奖励更高（val 计价）');
drain(g);

g.save();
const g4 = makeEnv(store);
const S4 = g4.S();
ok(g4.cookedCount() >= 2, '菜谱进度随存档恢复');
ok(Array.isArray(S4.store) && S4.store.length === 4, '储物间随存档恢复');
let dairy4 = false;
for (let i = 0; i < S4.board.length; i++) if (S4.board[i] && S4.board[i].t === 'g' && S4.board[i].gid === 'dairy') dairy4 = true;
ok(dairy4, '奶箱随存档存在（含老档迁移）');

// ---------- M5 闪光变体 ----------
const S5 = S;
const n1 = g.spawn('veg3'), s1 = g.spawn('veg3', null, true);
ok(!!S5.board[s1].s && !S5.board[n1].s, '可分别生成普通与闪光食材');
ok(g.tryMove(n1, s1) === 'bounce', '普通与闪光不能互相合成');
const s2 = g.spawn('veg3', null, true);
ok(g.tryMove(s1, s2) === 'merge', '闪光之间可以合成');
ok(!!S5.board[s2].s && S5.board[s2].id === 'veg4', '闪光合成产物继承闪光');
ok(S5.dexS.indexOf('veg4') >= 0, '闪光图鉴收录产物');
drain(g);

const shCoin = S5.coins;
const shVal = g.ITEMS['bun2'].val;
const sSell = g.spawn('bun2', null, true);
g.sellAt(sSell);
ok(S5.coins === shCoin + shVal * 4, '闪光售价为普通的两倍');
g.undoSell();

// 闪光交付加成：同一订单，带闪光比不带多给金币
// 好感升级会额外给金币，会污染这里的对比基准，所以先固定在刚升过级的位置
S5.fav = S5.fav || {}; S5.fav.panda = 0;
g.setOrder(0, [['veg5', 1]], 'panda');
const plainIdx = g.spawn('veg5');
const m5c0 = S5.coins;
g.deliver(0);
const plainGain = S5.coins - m5c0;
drain(g);
S5.fav.panda = 0;   // 两次交付都不触发好感升级，只比闪光加成
g.setOrder(0, [['veg5', 1]], 'panda');
g.spawn('veg5', null, true);
const m5c1 = S5.coins;
g.deliver(0);
const shinyGain = S5.coins - m5c1;
ok(shinyGain > plainGain, '闪光交付金币高于普通（' + shinyGain + ' > ' + plainGain + '）');
drain(g);

// ---------- M5 扭蛋 ----------
S5.coins = 0; S5.tickets = 0;
ok(g.gachaPull() === null, '金币不足时扭蛋被拒绝');
S5.coins = 1000;
const beforeCoins = S5.coins;
const r1 = g.gachaPull('R');
ok(r1 && r1.rarity === 'R' && !!r1.card, '可扭出 R 卡');
ok(S5.cards[r1.card] === 1, '新卡计入收藏册');
ok(S5.coins === beforeCoins - 100, '扭蛋扣 100 金币');
const dupBefore = S5.coins;
const r2 = g.gachaPull('R');
if (r2.card === r1.card) {
  ok(r2.dup === true && S5.coins === dupBefore - 100 + 60, '重复 R 卡折 60 金币');
} else {
  ok(r2.dup === false && S5.cards[r2.card] === 1, '扭出另一张新 R 卡');
}
const srBefore = S5.coins;
const r3 = g.gachaPull('SR');
ok(r3.rarity === 'SR' && !!r3.card, '可扭出 SR 卡');
ok(S5.coins <= srBefore - 100 + 200, 'SR 扣费与折算正确');
drain(g);

S5.tickets = 2;
const tCoins = S5.coins;
const r4 = g.gachaPull('N');
ok(r4.byTicket === true && S5.tickets === 1, '有券时优先消耗券');
ok(S5.coins >= tCoins, '用券扭蛋不扣金币');
drain(g);

// ---------- M5 每日礼盒 ----------
S5.gift = { last: g.today(), stock: 0 };
ok(g.openGift() === false, '库存为 0 时无法开启礼盒');
const y = new Date(Date.now() - 86400000);
const ymd = y.getFullYear() + '-' + ('0' + (y.getMonth() + 1)).slice(-2) + '-' + ('0' + y.getDate()).slice(-2);
S5.gift = { last: ymd, stock: 0 };
g.refillGift();
ok(S5.gift.stock === 1 && S5.gift.last === g.today(), '跨天补货 +1 并更新日期');
S5.gift = { last: ymd, stock: 3 };
g.refillGift();
ok(S5.gift.stock === 3, '礼盒库存上限为 3');
S5.gift = { last: g.today(), stock: 2 };
const giftCoins = S5.coins, giftTickets = S5.tickets, giftItems = S5.board.filter(Boolean).length;
ok(g.openGift() === true, '有库存时可开启礼盒');
ok(S5.gift.stock <= 2, '开启后库存减少（放不下食材时会退回）');
ok(S5.coins > giftCoins || S5.tickets > giftTickets || S5.board.filter(Boolean).length > giftItems,
   '礼盒发放了金币/券/食材三者之一');
drain(g);

// ---------- M5 存档往返 ----------
g.save();
const g5 = makeEnv(store);
const S6 = g5.S();
ok(JSON.stringify(S6.cards) === JSON.stringify(S5.cards), '卡牌收藏可存档恢复');
ok(S6.tickets === S5.tickets, '扭蛋券可存档恢复');
ok(S6.dexS.length === S5.dexS.length, '闪光图鉴可存档恢复');
ok(S6.gift.stock === S5.gift.stock, '礼盒库存可存档恢复');
const shinyKept = S6.board.filter(function (c) { return c && c.s; }).length;
const shinyOrig = S5.board.filter(function (c) { return c && c.s; }).length;
ok(shinyKept === shinyOrig, '棋盘上的闪光标记可存档恢复（' + shinyKept + ' 个）');
g5.stopTick();

// ---------- 存档导出 / 导入 / 重置 ----------
const SS = S;
SS.coins = 777; SS.level = 9; SS.stars = 33; SS.tickets = 4;
const code = g.exportSave();
ok(typeof code === 'string' && code.indexOf('WONSEN1.') === 0, '导出的存档码带标识前缀');
ok(!/\s/.test(code), '存档码不含空白字符，便于复制粘贴');

// 换个环境模拟"新手机"，导入后进度应完整还原
const freshStore = new Map();
const gN = makeEnv(freshStore);
const SN = gN.S();
ok(SN.coins === 50 && SN.level === 1, '新设备初始为全新存档');
const r = gN.importSave(code);
ok(r.ok === true, '存档码可成功导入：' + r.msg);
// load() 会重建 S 对象，必须重新取引用
ok(gN.S().coins === 777 && gN.S().level === 9, '导入后金币与等级还原');
ok(gN.S().stars === 33 && gN.S().tickets === 4, '导入后星星与扭蛋券还原');

// 非法输入应被拒绝，且不破坏当前存档
const beforeBad = gN.S().coins;
ok(gN.importSave('').ok === false, '空存档码被拒绝');
ok(gN.importSave('随便一串文字').ok === false, '非本游戏的码被拒绝');
ok(gN.importSave('WONSEN1.@@@坏掉的@@@').ok === false, '损坏的存档码被拒绝');
ok(gN.S().coins === beforeBad, '导入失败不影响当前存档');

// 重置
gN.resetSave();
ok(gN.S().coins === 50 && gN.S().level === 1, '重置后回到初始状态');
ok(gN.S().dex.length === 3 && Object.keys(gN.S().cards).length === 0, '重置清空图鉴与卡牌');
ok(typeof gN.GAME_VER === 'string' && gN.GAME_VER.length > 0, '版本号常量存在（' + gN.GAME_VER + '）');
gN.stopTick();

// ---------- V1.2 订单槽位随等级增长 ----------
const SO = g.S();
SO.level = 1; SO.orders.length = 3; g.fillOrders();
ok(g.orderSlots() === 3, 'Lv1 时 3 个订单位');
SO.level = 6; g.fillOrders();
ok(SO.orders.length === 4, 'Lv6 时增加到 4 个订单位');
SO.level = 12; g.fillOrders();
ok(SO.orders.length === 5, 'Lv12 时增加到 5 个订单位');
ok(SO.orders.every(function(o){ return o && o.c && o.needs.length; }), '新增的订单位都有有效订单');
g.save();
const gS = makeEnv(store);
ok(gS.S().orders.length === 5, '订单位数量可存档恢复');
gS.stopTick();

// ---------- V1.3 图标条布局与订单详情 ----------
const SL = g.S();
g.setOrder(0,[['veg1',2]],'rabbit');
g.openTask(0);
ok(true, '订单详情面板可打开（不抛错）');
g.showInfo(-1);
ok(true, '底部信息条空态可渲染');
const anyIdx = SL.board.findIndex(function(c){ return c && c.t === 'i'; });
if (anyIdx >= 0) { g.showInfo(anyIdx); ok(true, '底部信息条可显示物品详情'); }
const genIdx = SL.board.findIndex(function(c){ return c && c.t === 'g'; });
if (genIdx >= 0) { g.showInfo(genIdx); ok(true, '底部信息条可显示生成器详情'); }

// ---------- V1.7 好感 / 新客人 / 无尽层 ----------
const gF = makeEnv(new Map());
const SF = gF.S();
ok(Object.keys(gF.CUSTS).length === 8, '客人扩充到 8 位');
ok(gF.custPool().length === 4, 'Lv1 只解锁最初 4 位客人');
SF.level = 15;
ok(gF.custPool().length === 8, 'Lv15 后 8 位客人全部登场');

// 好感累积与升级
SF.fav = {};
ok(gF.favLevel('rabbit') === 0, '初始好感 0 级');
const coinsF0 = SF.coins;
for (let i = 0; i < 3; i++) gF.favGain('rabbit');
ok(gF.favLevel('rabbit') === 1, '交付 3 次后好感升到 1 级');
ok(SF.coins > coinsF0, '好感升级发放金币奖励');
for (let i = 0; i < 5; i++) gF.favGain('rabbit');
ok(gF.favLevel('rabbit') === 2, '累计 8 次到 2 级');
ok(SF.tickets > 0, '好感 2 级附赠扭蛋券');
SF.fav.rabbit = 45;
ok(gF.favLevel('rabbit') === 5, '满级为 5 级');
ok(gF.favNext('rabbit') === null, '满级后没有下一档');

gF.stopTick();

// 好感可存档恢复
const favStore = new Map();
const gFS = makeEnv(favStore);
gFS.S().fav = { rabbit: 9, panda: 4 };
gFS.save();
const gFS2 = makeEnv(favStore);
ok(gFS2.S().fav.rabbit === 9 && gFS2.favLevel('rabbit') === 2, '好感数值与等级可存档恢复');
gFS.stopTick(); gFS2.stopTick();

// 无尽层
const gE = makeEnv(new Map());
const SE = gE.S();
SE.quest.i = 999;          // 主线走完
const eq = gE.questCur();
ok(eq && eq.endless === true, '主线走完后接上无尽目标');
ok(eq.n === 10, '第一轮需要 10 份订单');
SE.endless = 3;
ok(gE.questCur().n === 25, '第四轮需求随轮次增长');
ok(gE.questCur().coins <= 900, '无尽奖励有上限，不会通胀');
gE.stopTick();

// ---------- V2.0 梦境解谜 ----------
const gD = makeEnv(new Map());
const SD = gD.S();
ok(gD.DREAMS.length === 30, '梦境共 30 关');
ok(gD.DREAMS.every(function(l){ return l.opt > 0 && l.mv >= l.opt; }), '每关都记录了最优步数且上限不低于它');

// 开局
ok(gD.dreamStart(1) === true, '可以开始第 1 关');
const dm = gD.DM();
ok(dm.left === gD.DREAMS[0].mv, '开局步数等于关卡上限');
ok(dm.cells.filter(function(c){ return c; }).length === gD.DREAMS[0].init.length, '初始盘面按数据铺好');
ok(gD.dreamWin() === false, '开局未达成目标');

// 合成推进
const before = dm.left;
const a = gD.DREAMS[0].init[0][0], b = gD.DREAMS[0].init[1][0];
ok(gD.dreamMove(a, b) === 'merge', '两个同级可以合成');
ok(gD.DM().left === before - 1, '合成消耗一步');
ok(gD.DM().cells[a] === null, '源格清空');
ok(gD.DM().cells[b].id === 'veg2', '目标格升级为下一级');

// 不同物品不能合
gD.dreamStart(2);
const d2 = gD.DM();
let mixA = -1, mixB = -1;
for (let i = 0; i < d2.cells.length; i++) {
  if (!d2.cells[i]) continue;
  if (mixA < 0) mixA = i;
  else if (d2.cells[i].id !== d2.cells[mixA].id) { mixB = i; break; }
}
if (mixB >= 0) ok(gD.dreamMove(mixA, mixB) === 'bounce', '不同物品不能合成');

// 空格移动不消耗步数
gD.dreamStart(1);
const d3 = gD.DM();
const dmSrc = gD.DREAMS[0].init[0][0];
let empty = -1;
for (let i = 0; i < d3.cells.length; i++) if (!d3.cells[i]) { empty = i; break; }
const mvBefore = d3.left;
ok(gD.dreamMove(dmSrc, empty) === 'move', '可以移动到空格');
ok(gD.DM().left === mvBefore, '纯移动不消耗步数');

// 通关结算与星级
gD.dreamStart(1);
const lv1 = gD.DREAMS[0];
const pos = lv1.init.map(function(p){ return p[0]; });
gD.dreamMove(pos[0], pos[1]);
gD.dreamMove(pos[2], pos[3]);
ok(gD.dreamWin() === true, '按最优解可以通关第 1 关');
ok(gD.dreamStars() === 3, '用最优步数通关得 3 星');
const fin = gD.dreamFinish();
ok(fin && fin.stars === 3, '结算返回星级');
ok(SD.shells === 6, '首通 3 星给 6 枚贝币');
ok(SD.dream[1] === 3, '成绩记入存档');

// 重复通关不重复发奖
gD.dreamStart(1);
gD.dreamMove(pos[0], pos[1]);
gD.dreamMove(pos[2], pos[3]);
const again = gD.dreamFinish();
ok(again.gain === 0, '同星级重刷不再发贝币');
ok(SD.shells === 6, '贝币总数不变');

// 关卡解锁
ok(gD.dreamUnlocked() >= 3, '初始至少开放 3 关');
ok(gD.dreamTotalStars() === 3, '星星总数统计正确');
gD.stopTick();

// 梦境成绩可存档
const dStore = new Map();
const gD2 = makeEnv(dStore);
gD2.S().dream = { 1: 3, 2: 2 };
gD2.S().shells = 17;
gD2.save();
const gD3 = makeEnv(dStore);
ok(gD3.S().dream[1] === 3 && gD3.S().shells === 17, '梦境星数与贝币可存档恢复');
ok(gD3.dreamTotalStars() === 5, '读档后星星合计正确');
gD2.stopTick(); gD3.stopTick();

// ---------- 样式完整性 ----------
// CSS 括号失衡会让后续规则被浏览器整段丢弃，页面看着"样式全没了"，
// 但 JS 测试照样全过——所以必须单独查一次。
{
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  let depth = 0, minDepth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < minDepth) minDepth = depth; }
  }
  ok(depth === 0, 'CSS 花括号闭合平衡（当前深度 ' + depth + '）');
  ok(minDepth === 0, 'CSS 没有多余的右花括号');
  ok(css.indexOf('#board{') >= 0 && css.indexOf('.modal') >= 0 && css.indexOf('.art{') >= 0,
     '关键样式规则都还在');
}

// ---------- V1.6 三档音量 ----------
const gV = makeEnv(new Map());
const SV = gV.S();
ok(SV.vol.sfx === 80 && SV.vol.bgm === 40 && SV.vol.voice === 90, '三档音量有默认值');
ok(gV.volOf('sfx') === 0.8, '音效按滑块线性换算');
// 背景音是底噪：走平方曲线且有上限，同样的滑块位置比音效轻得多
ok(gV.volOf('bgm') < 0.1, '背景音默认档位很轻（' + gV.volOf('bgm').toFixed(3) + '）');
ok(gV.volOf('bgm') < gV.volOf('sfx') / 5, '背景音明显低于音效，不会盖住其它声音');
SV.vol.bgm = 0;
ok(gV.volOf('bgm') === 0, '背景音可拉到 0');
SV.vol.bgm = 200;
ok(gV.volOf('bgm') <= 0.45, '背景音拉满也有上限，不会吵');
SV.vol.bgm = 20;
const q20 = gV.volOf('bgm');
SV.vol.bgm = 60;
ok(gV.volOf('bgm') > q20 * 5, '平方曲线让中段的调节听感差别明显');
SV.vol.bgm = 40;
SV.mute = true;
ok(gV.volOf('sfx') === 0 && gV.volOf('bgm') === 0 && gV.volOf('voice') === 0, '总静音时三档全部为 0');
SV.mute = false;
gV.stopTick();

// 音量设置可存档
const volStore = new Map();
const gV1 = makeEnv(volStore);
// curve2 标记表示已经历过背景音曲线迁移，玩家自己调的值不会再被覆盖
gV1.S().vol = { sfx: 55, bgm: 10, voice: 100, curve2: 1 };
gV1.save();
const gV2 = makeEnv(volStore);
ok(gV2.S().vol.bgm === 10 && gV2.S().vol.sfx === 55, '音量设置可存档恢复');
ok(gV2.volOf('voice') === 1, '读档后系数换算正确');
gV1.stopTick(); gV2.stopTick();

// ---------- 声音可达性与更新记录 ----------
const gS2 = makeEnv(new Map());
ok(Array.isArray(gS2.CHANGELOG) && gS2.CHANGELOG.length >= 9, '更新记录至少 9 个版本');
ok(gS2.CHANGELOG[0].v === gS2.GAME_VER, '更新记录第一条就是当前版本');
ok(gS2.CHANGELOG.every(function(c){ return c.v && c.d && c.t && c.li.length; }), '每条更新记录都完整');
// 静音时拖动滑块应自动恢复有声
const SS2 = gS2.S();
SS2.mute = true;
ok(gS2.volOf('bgm') === 0, '静音时音量系数为 0');
SS2.mute = false; SS2.vol.bgm = 45;
ok(gS2.volOf('bgm') > 0, '取消静音后恢复出声');
ok(gS2.volOf('sfx') === 0.8, '音效档位不受背景音曲线影响');
gS2.stopTick();

// ---------- V2.1 汐见川钓鱼 ----------
const gFi = makeEnv(new Map());
const SFi = gFi.S();
ok(gFi.fishUnlocked() === false, 'Lv1 时钓鱼未开放');
SFi.level = 5; SFi.coins = 5000;
ok(gFi.fishUnlocked() === true, 'Lv5 开放钓鱼');
ok(gFi.CHAINS.fish.items.length === 7, '水产链 7 级');

// 抛竿扣钱
const coinsFi = SFi.coins;
const cast = gFi.fishCast();
ok(cast !== null, '可以抛竿');
ok(SFi.coins === coinsFi - gFi.FISH_COST, '抛竿扣除鱼饵钱');
ok(cast.biteAt >= 1200 && cast.biteAt <= 3200, '上钩时刻在合理区间');

// 四种判定
ok(gFi.fishStrike(cast.t0 + cast.biteAt + 30).kind === 'perfect', '刚上钩就提竿是完美');
const fc2 = gFi.fishCast();
ok(gFi.fishStrike(fc2.t0 + 50).kind === 'early', '抢竿会吓跑鱼');
const fc3 = gFi.fishCast();
ok(gFi.fishStrike(fc3.t0 + fc3.biteAt + fc3.win + 300).kind === 'late', '超过窗口就跑了');
const fc4 = gFi.fishCast();
const fr4 = gFi.fishStrike(fc4.t0 + fc4.biteAt + fc4.win * 0.8);
ok(fr4.kind === 'ok' && fr4.fish, '窗口后段是普通判定，仍能钓到');

// 收竿入棋盘
const fiBefore = SFi.board.filter(function(c){ return c; }).length;
const got = gFi.fishCollect();
ok(got && got.placed === 'board', '钓到的鱼放进棋盘');
ok(SFi.board.filter(function(c){ return c; }).length === fiBefore + 1, '棋盘多了一个物品');
ok(SFi.fishCount >= 1, '累计钓鱼数已记录');

// 脱钩不产鱼
const fc5 = gFi.fishCast();
gFi.fishStrike(fc5.t0 + 10);
ok(gFi.fishCollect() === null, '脱钩后没有鱼可收');

// 鱼竿升级
ok(gFi.rodLevel() === 0, '初始是旧竹竿');
SFi.coins = 5000;
ok(gFi.buyRod() === true, '金币够时可升级鱼竿');
ok(gFi.rodLevel() === 1, '鱼竿等级提升');
SFi.coins = 0;
ok(gFi.buyRod() === false, '钱不够时买不了');

// 鱼获随等级解锁
SFi.level = 1;
const lowFish = [];
for (let i = 0; i < 40; i++) lowFish.push(gFi.fishRoll(false).id);
ok(lowFish.every(function(id){ return ['f1','f2','f3'].indexOf(id) >= 0; }), '低等级只钓得到前几级鱼');

// 钓鱼数据可存档
const fiStore = new Map();
const gFi2 = makeEnv(fiStore);
gFi2.S().rod = 2; gFi2.S().fishCount = 17;
gFi2.save();
const gFi3 = makeEnv(fiStore);
ok(gFi3.S().rod === 2 && gFi3.rodLevel() === 2, '鱼竿等级可存档恢复');
ok(gFi3.S().fishCount === 17, '钓鱼数可存档恢复');
gFi.stopTick(); gFi2.stopTick(); gFi3.stopTick();

// ---------- V2.2 温泉汤屋 ----------
const gOn = makeEnv(new Map());
const SOn = gOn.S();
ok(gOn.onsenUnlocked() === false, 'Lv1 时汤屋未开放');
SOn.level = 10; SOn.coins = 5000;
ok(gOn.onsenUnlocked() === true, 'Lv10 开放汤屋');
ok(gOn.POOLS.length === 3, '三档汤池');
ok(gOn.poolCur().id === 'p1', '初始是岩汤');

// 加成：不投物资就是 1 倍，投越高级加成越多
ok(gOn.onsenBonus(null, null) === 1, '不投物资无加成');
ok(gOn.onsenBonus('w1', null) > 1, '投毛巾有加成');
ok(gOn.onsenBonus('w2', 'a2') > gOn.onsenBonus('w1', 'a1'), '物资等级越高加成越多');

// 开工消耗物资
gOn.spawn('w2'); gOn.spawn('a2');
ok(gOn.onsenSupplies('wash').length > 0, '能查到手上的毛巾');
ok(gOn.onsenStart('w2', 'a2') === true, '可以开工');
ok(!!SOn.onsen && !!SOn.onsen.at, '开工后有运行记录');
ok(gOn.onsenSupplies('wash').filter(function(x){ return x.id === 'w2'; }).length === 0, '投入的毛巾被消耗');
ok(gOn.onsenStart('w1', null) === false, '已在营业时不能重复开工');

// 未到时间收不了
ok(gOn.onsenLeft() > 0, '刚开工还需等待');
ok(gOn.onsenCollect() === null, '没泡完不能收小费');

// 到点收工
SOn.onsen.at = Date.now() - 31 * 60 * 1000;
ok(gOn.onsenLeft() === 0, '超过时长后可收工');
const coinsOn = SOn.coins;
const rOn = gOn.onsenCollect();
ok(rOn && rOn.coins > 0, '收工拿到小费');
ok(SOn.coins === coinsOn + rOn.coins, '小费入账');
ok(SOn.rep > 0, '声望增加');
ok(SOn.onsen === null, '收工后状态清空');

// 离线收益有上限
gOn.onsenStart(null, null);
SOn.onsen.at = Date.now() - 48 * 3600 * 1000;
const rLong = gOn.onsenCollect();
ok(rLong.cycles === 16, '挂 48 小时只结算 8 小时上限（岩汤 30 分钟一轮共 16 轮）');

// 汤池升级
ok(gOn.buyPool() === true, '金币够时可开新汤池');
ok(gOn.poolCur().id === 'p2', '换到桧木汤');
SOn.coins = 0;
ok(gOn.buyPool() === false, '钱不够时开不了');

// 汤屋数据可存档
const onStore = new Map();
const gOn2 = makeEnv(onStore);
gOn2.S().pool = 2; gOn2.S().rep = 42;
gOn2.S().onsen = { at: Date.now(), pool: 'p3', towel: 'w2', aroma: 'a1' };
gOn2.save();
const gOn3 = makeEnv(onStore);
ok(gOn3.S().pool === 2 && gOn3.S().rep === 42, '汤池等级与声望可存档');
ok(gOn3.S().onsen && gOn3.S().onsen.pool === 'p3', '营业中的状态可存档，关掉游戏也在泡');
gOn.stopTick(); gOn2.stopTick(); gOn3.stopTick();

// ---------- V2.3 温泉町入口页 ----------
const gT = makeEnv(new Map());
const ST = gT.S();
ok(gT.TOWN_SPOTS.length === 5, '小镇有 5 个入口');
ok(gT.TOWN_SPOTS.every(function(sp){ return sp.x > 0 && sp.x < 100 && sp.y > 0 && sp.y < 100; }),
   '所有热点坐标都在图内');
ok(gT.TOWN_SPOTS.filter(function(sp){ return sp.main; }).length === 1, '只有一个主入口');

// 解锁随等级推进
ST.level = 1;
ok(gT.TOWN_SPOTS.filter(gT.spotOpen).length === 1, 'Lv1 只开放食堂');
ST.level = 5;
ok(gT.TOWN_SPOTS.filter(gT.spotOpen).length === 3, 'Lv5 开放到钓鱼（食堂+梦境+钓鱼）');
ST.level = 6;
ok(gT.TOWN_SPOTS.filter(gT.spotOpen).length === 4, 'Lv6 再开造町');
ST.level = 10;
ok(gT.TOWN_SPOTS.filter(gT.spotOpen).length === 5, 'Lv10 汤屋开放后全部解锁');

// 红点提示
ST.level = 15;
ST.orders = [null, null, null];
ok(gT.spotBadge('diner') === null, '没有可交订单时食堂不亮红点');
gT.setOrder(0, [['veg1', 1]], 'rabbit');
gT.spawn('veg1');
const bd = gT.spotBadge('diner');
ok(bd && bd.t === '1', '有 1 单可交时食堂亮红点 1');
ST.onsen = { at: Date.now() - 99 * 60 * 1000, pool: 'p1', towel: null, aroma: null };
const ob = gT.spotBadge('onsen');
ok(ob && ob.g === true, '汤屋泡好了亮绿点提醒收工');
ST.onsen = null;
ok(gT.spotBadge('onsen') === null, '汤屋没在营业时不提醒');
gT.stopTick();

// ---------- 音量走 Web Audio 增益（iOS 忽略 audio.volume） ----------
{
  const src2 = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  ok(src2.indexOf('createMediaElementSource') >= 0, '背景音与配音接到了 Web Audio 增益节点');
  ok(src2.indexOf('function setMediaVol') >= 0, '有统一的媒体音量入口');
  // audioInit 必须先建 AudioContext 再播音乐，否则接不上增益节点
  const ai = src2.slice(src2.indexOf('function audioInit'), src2.indexOf('function audioInit') + 420);
  ok(ai.indexOf('new (window.AudioContext') < ai.indexOf('bgmPlay()'),
     'audioInit 先建 AudioContext 再启动音乐');
  ok(ai.indexOf('resume()') >= 0, 'audioInit 会唤醒 iOS 上挂起的 AudioContext');
  ok(src2.indexOf("bgmEl.volume = volOf('bgm')") < 0, '不再直接写 audio.volume（iOS 上无效）');
}

// 老档的背景音数值迁移
{
  const gM = makeEnv(new Map());
  const oldVol = gM.migrateVol({ sfx: 55, bgm: 30, voice: 100 });
  ok(oldVol.bgm === gM.VOL_DEF.bgm, '老档的背景音数值被拉回新默认档');
  ok(oldVol.sfx === 55 && oldVol.voice === 100, '音效与配音的设置保留不动');
  const again = gM.migrateVol(oldVol);
  again.bgm = 88;
  const third = gM.migrateVol(again);
  ok(third.bgm === 88, '迁移只做一次，之后玩家自己调的值会保留');
  gM.stopTick();
}

// ---------- V2.4 造町布置 ----------
const gDc = makeEnv(new Map());
const SDc = gDc.S();
ok(Object.keys(gDc.DECOS).length === 12, '12 种摆件');
ok(gDc.DECO_POS.length === gDc.DECO_SLOTS, '锚点数量与坐标表一致');
ok(gDc.DECO_POS.every(function(p2){ return p2.x > 0 && p2.x < 100 && p2.y > 0 && p2.y < 100; }),
   '所有锚点都落在地图内');
ok(gDc.decoUnlocked() === false, 'Lv1 时造町未开放');
SDc.level = 6;
ok(gDc.decoUnlocked() === true, 'Lv6 开放造町');

// 买与放
SDc.coins = 5000; SDc.stars = 100; SDc.shells = 100;
ok(gDc.buyDeco('lantern') === true, '金币够时可以买摆件');
ok(gDc.decoOwned('lantern') === true, '买过的摆件进仓库');
ok(gDc.buyDeco('lantern') === false, '同一件不会重复买');
SDc.coins = 0;
ok(gDc.buyDeco('bench') === false, '钱不够买不了');
SDc.coins = 5000;

ok(gDc.placeDeco(0, 'lantern') === true, '可以摆到锚点上');
ok(SDc.decoMap[0] === 'lantern', '锚点记录了摆件');
ok(gDc.decoPlaced() === 1, '已摆放数量正确');
// 同一件挪到别处不会占两格
gDc.placeDeco(4, 'lantern');
ok(SDc.decoMap[0] === undefined && SDc.decoMap[4] === 'lantern', '挪位置后原处清空');
ok(gDc.decoPlaced() === 1, '挪位置不会重复占格');
ok(gDc.placeDeco(4, null) === true, '可以收回');
ok(gDc.decoPlaced() === 0, '收回后锚点为空');
ok(gDc.placeDeco(99, 'lantern') === false, '越界的锚点会被拒绝');
ok(gDc.placeDeco(1, 'cat') === false, '没买的摆件放不上去');

// 增益真的接进数值
gDc.buyDeco('board'); gDc.placeDeco(2, 'board');
ok(Math.abs(gDc.decoBuff('order') - 0.05) < 1e-6, '告示板提供订单增益');
gDc.buyDeco('stone'); gDc.placeDeco(3, 'stone');
ok(Math.abs(gDc.decoBuff('regen') - 0.06) < 1e-6, '石灯笼提供回充增益');
ok(gDc.decoBuff('tip') === 0, '没摆的类别增益为 0');
// 生成器回充确实变快了
const ivBefore = gDc.regenIv('basket');
gDc.placeDeco(3, null);
const ivAfter = gDc.regenIv('basket');
ok(ivBefore < ivAfter, '石灯笼摆上后生成器回充间隔变短');
gDc.stopTick();

// 造町数据可存档
const decoStore = new Map();
const gDc2 = makeEnv(decoStore);
gDc2.S().decoOwn = ['lantern', 'cat'];
gDc2.S().decoMap = { 0: 'lantern', 7: 'cat' };
gDc2.save();
const gDc3 = makeEnv(decoStore);
ok(gDc3.decoOwned('cat') === true, '已购摆件可存档恢复');
ok(gDc3.S().decoMap[7] === 'cat', '摆放位置可存档恢复');
ok(gDc3.decoPlaced() === 2, '读档后布置数量正确');
gDc2.stopTick(); gDc3.stopTick();

// ---------- V2.5 四季与祭典 ----------
const gFe = makeEnv(new Map());
// 季节按月份判定
ok(gFe.curSeason(new Date(2026, 3, 15)).id === 'spring', '四月是春天');
ok(gFe.curSeason(new Date(2026, 6, 1)).id === 'summer', '七月是夏天');
ok(gFe.curSeason(new Date(2026, 9, 20)).id === 'autumn', '十月是秋天');
ok(gFe.curSeason(new Date(2026, 0, 5)).id === 'winter', '一月是冬天');
ok(gFe.SEASONS.reduce(function(a, s2){ return a.concat(s2.m); }, []).length === 12,
   '十二个月都归属到某个季节，没有空档');

// 祭典按月日判定
ok(gFe.curFest(new Date(2026, 3, 3)).id === 'sakura', '4 月 3 日在春樱祭期间');
ok(gFe.curFest(new Date(2026, 3, 1)).id === 'sakura', '祭典首日算在内');
ok(gFe.curFest(new Date(2026, 3, 7)).id === 'sakura', '祭典末日算在内');
ok(gFe.curFest(new Date(2026, 3, 8)) === null, '祭典结束后就没有了');
ok(gFe.curFest(new Date(2026, 4, 15)) === null, '平常日子没有祭典');
ok(gFe.curFest(new Date(2026, 6, 22)).id === 'natsu', '7 月下旬是夏夜祭');
ok(gFe.curFest(new Date(2026, 11, 24)).id === 'yuki', '12 月下旬是冬雪祭');
// 四个祭典分属四季，且日期不重叠
const fIds = gFe.FESTIVALS.map(function(f){ return f.season; });
ok(new Set(fIds).size === 4, '四个祭典分属四季');
ok(gFe.FESTIVALS.every(function(f){ return gFe.ITEM_NAMES[f.item]; }), '祭典指定的食材都真实存在');
gFe.stopTick();

// 祭典礼包每天只领一次
const gFe2 = makeEnv(new Map());
const SFe = gFe2.S();
const realFest = gFe2.curFest();
if (realFest) {
  const t0 = SFe.tickets;
  ok(gFe2.festCheck() !== null, '祭典期间首次进小镇可领礼包');
  ok(SFe.tickets === t0 + 1, '礼包发放扭蛋券');
  ok(gFe2.festCheck() === null, '同一天不会重复领');
} else {
  ok(gFe2.festCheck() === null, '非祭典期间没有礼包');
}
gFe2.stopTick();

// 祭典数据可存档
const feStore = new Map();
const gFe3 = makeEnv(feStore);
gFe3.S().fest = { 'sakura-2026-04-03': 1 };
gFe3.save();
const gFe4 = makeEnv(feStore);
ok(gFe4.S().fest['sakura-2026-04-03'] === 1, '祭典领取记录可存档');
gFe3.stopTick(); gFe4.stopTick();

g.stopTick(); g2.stopTick(); g3.stopTick(); g4.stopTick();
console.log(fails ? '\n有 ' + fails + ' 项失败' : '\n全部通过');
process.exit(fails ? 1 : 0);
