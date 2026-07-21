"""发布打包：一条命令把版本号翻新、重建离线缓存清单、打好可部署 zip。

为什么要这个脚本：PWA 有两个必须同步 +1 的版本号——
  index.html 的 ART_VER（贴图缓存）与 sw.js 的 CACHE（service worker 缓存）。
漏掉任何一个，已装到手机的用户刷新也拿不到新版本（缓存优先）。
手动改两处很容易忘，这里一次性搞定，并顺带把新增的贴图自动补进离线清单。

用法：python3 release.py
"""
import glob
import os
import re
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)


def bump_version():
    """把 index.html 的 ART_VER +1，返回新版本号。"""
    html = open('index.html', encoding='utf-8').read()
    m = re.search(r"var ART_VER = '(\d+)'", html)
    if not m:
        raise SystemExit('找不到 ART_VER，index.html 结构可能已变')
    new = int(m.group(1)) + 1
    html = html[:m.start()] + "var ART_VER = '%d'" % new + html[m.end():]
    open('index.html', 'w', encoding='utf-8').write(html)
    return new


def rebuild_sw(version):
    """重新生成 sw.js：CACHE 版本号与 ART_VER 对齐，离线清单自动枚举当前所有贴图。"""
    assets = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png']
    for d in ('art/items', 'art/chars', 'art/cards', 'art/scene'):
        assets += ['./' + f for f in sorted(glob.glob(d + '/*.png'))]
    lines = ',\n'.join("  '%s'" % a for a in assets)
    sw = """/* 离线缓存：装好后断网也能玩。此文件由 release.py 自动生成，勿手改。
   CACHE 版本号与 index.html 的 ART_VER 一起 +1，旧缓存在 activate 阶段清掉。 */
const CACHE = 'wonsen-v%d';
const ASSETS = [
%s
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
""" % (version, lines)
    open('sw.js', 'w', encoding='utf-8').write(sw)
    return len(assets)


def build_zip(version):
    """打包运行必需文件，排除开发用素材/脚本/文档。"""
    out = os.path.join(os.path.dirname(HERE), '水豚温泉町-可部署.zip')
    keep_ext = ('.png',)
    root_files = ['index.html', 'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png']
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in root_files:
            z.write(f, f)
        for d in ('art/items', 'art/chars', 'art/cards', 'art/scene'):
            for f in sorted(glob.glob(d + '/*')):
                if f.endswith(keep_ext):
                    z.write(f, f)
        n = len(z.namelist())
    return out, n, os.path.getsize(out)


if __name__ == '__main__':
    v = bump_version()
    cached = rebuild_sw(v)
    out, files, size = build_zip(v)
    print('版本号已升到 %d（ART_VER 与 sw CACHE 已对齐）' % v)
    print('离线缓存清单 %d 项' % cached)
    print('打包完成：%s（%d 文件，%.1f MB）' % (out, files, size / 1048576))
    print()
    print('接下来：把这个 zip 重新拖到 Netlify 部署（同一站点的 Deploys 页面，链接不变）')
