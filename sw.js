/* 离线缓存：装好后断网也能玩。此文件由 release.py 自动生成，勿手改。
   CACHE 版本号与 index.html 的 ART_VER 一起 +1，旧缓存在 activate 阶段清掉。 */
const CACHE = 'wonsen-v32';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './art/items/a1.png',
  './art/items/a2.png',
  './art/items/a3.png',
  './art/items/a4.png',
  './art/items/bun1.png',
  './art/items/bun2.png',
  './art/items/bun3.png',
  './art/items/bun4.png',
  './art/items/bun5.png',
  './art/items/bun6.png',
  './art/items/bun7.png',
  './art/items/bun8.png',
  './art/items/chest.png',
  './art/items/d1.png',
  './art/items/d2.png',
  './art/items/d3.png',
  './art/items/d4.png',
  './art/items/d5.png',
  './art/items/d6.png',
  './art/items/d7.png',
  './art/items/f1.png',
  './art/items/f2.png',
  './art/items/f3.png',
  './art/items/f4.png',
  './art/items/f5.png',
  './art/items/f6.png',
  './art/items/f7.png',
  './art/items/k1.png',
  './art/items/k2.png',
  './art/items/k3.png',
  './art/items/k4.png',
  './art/items/k5.png',
  './art/items/r1.png',
  './art/items/r2.png',
  './art/items/r3.png',
  './art/items/r4.png',
  './art/items/r5.png',
  './art/items/t1.png',
  './art/items/t2.png',
  './art/items/t3.png',
  './art/items/t4.png',
  './art/items/t5.png',
  './art/items/veg1.png',
  './art/items/veg2.png',
  './art/items/veg3.png',
  './art/items/veg4.png',
  './art/items/veg5.png',
  './art/items/veg6.png',
  './art/items/veg7.png',
  './art/items/w1.png',
  './art/items/w2.png',
  './art/items/w3.png',
  './art/items/y1.png',
  './art/items/y2.png',
  './art/items/y3.png',
  './art/items/y4.png',
  './art/items/y5.png',
  './art/items/y6.png',
  './art/items/y7.png',
  './art/chars/basket.png',
  './art/chars/capy.png',
  './art/chars/dairy.png',
  './art/chars/egret.png',
  './art/chars/flour.png',
  './art/chars/hamster.png',
  './art/chars/hedge.png',
  './art/chars/otter.png',
  './art/chars/panda.png',
  './art/chars/rabbit.png',
  './art/chars/shiba.png',
  './art/chars/tanuki.png',
  './art/cards/balloon.png',
  './art/cards/bells.png',
  './art/cards/bucket.png',
  './art/cards/cat.png',
  './art/cards/crane.png',
  './art/cards/crescent.png',
  './art/cards/duck.png',
  './art/cards/fan.png',
  './art/cards/geta.png',
  './art/cards/lantern.png',
  './art/cards/leaf.png',
  './art/cards/moon.png',
  './art/cards/pin.png',
  './art/cards/ring.png',
  './art/cards/sleepcat.png',
  './art/cards/towel.png',
  './art/cards/turtle.png',
  './art/cards/wood.png',
  './art/scene/town.png',
  './art/scene/townmap.png',
  './art/deco/bell.png',
  './art/deco/bench.png',
  './art/deco/board.png',
  './art/deco/cat.png',
  './art/deco/chime.png',
  './art/deco/crane.png',
  './art/deco/crate.png',
  './art/deco/daruma.png',
  './art/deco/fence.png',
  './art/deco/flower.png',
  './art/deco/gold.png',
  './art/deco/lantern.png',
  './art/deco/sakura.png',
  './art/deco/stone.png',
  './art/deco/umbrella.png',
  './audio/bgm.mp3',
  './audio/voice/deliver_0.mp3',
  './audio/voice/deliver_1.mp3',
  './audio/voice/intro_0.mp3',
  './audio/voice/intro_1.mp3',
  './audio/voice/intro_2.mp3',
  './audio/voice/intro_3.mp3',
  './audio/voice/intro_4.mp3',
  './audio/voice/merge_0.mp3',
  './audio/voice/merge_1.mp3',
  './audio/voice/thx_egret.mp3',
  './audio/voice/thx_hamster.mp3',
  './audio/voice/thx_hedge.mp3',
  './audio/voice/thx_otter.mp3',
  './audio/voice/thx_panda.mp3',
  './audio/voice/thx_rabbit.mp3',
  './audio/voice/thx_shiba.mp3',
  './audio/voice/thx_tanuki.mp3'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var isPage = e.request.mode === 'navigate' ||
               (e.request.destination === 'document') ||
               /\.html($|\?)/.test(e.request.url);

  // 页面走"网络优先"：有网就总是拿最新版，断网才回落缓存。
  // 否则玩家装过一次后会一直吃旧缓存，我们发了新版他也刷不出来。
  if (isPage) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request, { ignoreSearch: true })
          .then(function (hit) { return hit || caches.match('./index.html'); });
      })
    );
    return;
  }

  // 图片等静态资源走"缓存优先"：它们带版本号，换图必然换 URL，不会读到旧的
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
