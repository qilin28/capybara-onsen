/* 离线缓存：装好后断网也能玩。此文件由 release.py 自动生成，勿手改。
   CACHE 版本号与 index.html 的 ART_VER 一起 +1，旧缓存在 activate 阶段清掉。 */
const CACHE = 'wonsen-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
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
  './art/items/k1.png',
  './art/items/k2.png',
  './art/items/k3.png',
  './art/items/k4.png',
  './art/items/k5.png',
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
  './art/chars/basket.png',
  './art/chars/capy.png',
  './art/chars/dairy.png',
  './art/chars/flour.png',
  './art/chars/hedge.png',
  './art/chars/panda.png',
  './art/chars/rabbit.png',
  './art/chars/shiba.png',
  './art/cards/cat.png',
  './art/cards/crane.png',
  './art/cards/duck.png',
  './art/cards/fan.png',
  './art/cards/geta.png',
  './art/cards/lantern.png',
  './art/cards/moon.png',
  './art/cards/pin.png',
  './art/cards/turtle.png',
  './art/scene/town.png'
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
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
