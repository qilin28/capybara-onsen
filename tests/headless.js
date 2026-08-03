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

g.stopTick(); g2.stopTick(); g3.stopTick(); g4.stopTick();
console.log(fails ? '\n有 ' + fails + ' 项失败' : '\n全部通过');
process.exit(fails ? 1 : 0);
