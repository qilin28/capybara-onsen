"""精灵表切图：自动探测格线，避免固定比例切割把图标边缘裁掉。

旧版按 图宽/列数 均分，假设九宫格铺满整张图；但生图常带外框与留白，
导致每格偏移、图标被切边（牛奶瓶顶被削掉即此因）。
现改为按"内容投影"找出每个格子的实际范围。
"""
import os
import sys
from collections import Counter

from PIL import Image


def _bg_color(im):
    """取出现最多的颜色作为背景基准。

    不能用四角：生图常在圆角外框外留一圈纯白，四角取到的是白边而非真正底色，
    会导致所有像素都被判成"内容"，投影饱和、找不到格间空隙。
    """
    small = im.resize((128, 128))
    q = Counter((r // 8 * 8, g // 8 * 8, b // 8 * 8) for r, g, b in small.getdata())
    return q.most_common(1)[0][0]


def _profile(px, w, h, bg, tol, axis):
    """沿 axis 统计每列/行的非背景像素占比。axis=0 按列，axis=1 按行。"""
    n, m = (w, h) if axis == 0 else (h, w)
    step = max(1, m // 200)  # 抽样，够用且快
    out = []
    for i in range(n):
        hit = cnt = 0
        for j in range(0, m, step):
            p = px[i, j] if axis == 0 else px[j, i]
            cnt += 1
            if (abs(p[0] - bg[0]) > tol or abs(p[1] - bg[1]) > tol
                    or abs(p[2] - bg[2]) > tol):
                hit += 1
        out.append(hit / cnt)
    return out


def _bands(prof, want, _min_w=0):
    """定位 want 个格子：全局拟合一个等距网格。

    枚举（起始位置, 格距），让所有格线都尽量落在内容最少处，取总分最低的一组。
    比找局部最小值稳——图标溢出格子（如蒸汽飘进缝隙）时，局部最小值会被带偏，
    而等距约束能把整张网格拉回正确位置。
    """
    n = len(prof)
    k = max(1, n // 150)
    sm = [sum(prof[max(0, i - k):i + k + 1]) / len(prof[max(0, i - k):i + k + 1])
          for i in range(n)]
    if want < 2:
        return [(0, n)]

    def at(x):
        # 钳制到有效范围：越界若记 0 会变成"免费背景"，诱导整张网格滑出画面
        return sm[min(max(x, 0), n - 1)]

    nominal = n / want
    best, best_score = None, 1e9
    for pitch in range(int(nominal * 0.72), int(nominal * 1.30) + 1):
        max_left = max(1, n - pitch * want + 1)
        for left in range(0, max_left):
            score = sum(at(left + i * pitch) for i in range(want + 1)) / (want + 1)
            # 轻微偏好居中的解，避免整体贴边
            score += abs((left + pitch * want / 2) - n / 2) / n * 0.02
            if score < best_score:
                best_score, best = score, (left, pitch)

    left, pitch = best
    return [(max(0, left + i * pitch), min(n, left + (i + 1) * pitch)) for i in range(want)]


def detect_grid(im, cols, rows, tol=26, grid=None):
    """返回 rows x cols 的格子坐标 (x0, y0, x1, y1)。

    grid 可显式给定 (left, top, pitch_x, pitch_y) 跳过自动探测——
    图标大量溢出格外时自动探测会失准，这时直接给准确数值更省事。
    """
    if grid:
        left, top, px_, py_ = grid
        return [[(left + c * px_, top + r * py_, left + (c + 1) * px_, top + (r + 1) * py_)
                 for c in range(cols)] for r in range(rows)]
    w, h = im.size
    px = im.load()
    bg = _bg_color(im)
    xs = _bands(_profile(px, w, h, bg, tol, 0), cols, w / (cols * 2.5))
    ys = _bands(_profile(px, w, h, bg, tol, 1), rows, h / (rows * 2.5))
    return [[(xs[c][0], ys[r][0], xs[c][1], ys[r][1])
             for c in range(cols)] for r in range(rows)]


def slice_sheet(src, names, cols=3, rows=3, out_dir=None, pad=0.012, size=256, grid=None):
    """切图。pad 为向外扩张比例——宁可多带一点背景，也不切到图标。"""
    im = Image.open(src).convert('RGB')
    W, H = im.size
    grid = detect_grid(im, cols, rows, grid=grid)
    out_dir = out_dir or os.path.dirname(src)
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for i, name in enumerate(names):
        if not name:
            continue
        r, c = divmod(i, cols)
        x0, y0, x1, y1 = grid[r][c]
        dx, dy = (x1 - x0) * pad, (y1 - y0) * pad
        box = (max(0, int(x0 - dx)), max(0, int(y0 - dy)),
               min(W, int(x1 + dx)), min(H, int(y1 + dy)))
        tile = im.crop(box)
        # 补成正方形（居中留白），避免非方形图标被 object-fit 压变形
        s = max(tile.size)
        canvas = Image.new('RGB', (s, s), tile.getpixel((1, 1)))
        canvas.paste(tile, ((s - tile.size[0]) // 2, (s - tile.size[1]) // 2))
        p = os.path.join(out_dir, name + '.png')
        canvas.resize((size, size), Image.LANCZOS).save(p, 'PNG')
        made.append(p)
    return made


def card_box(im, cell, tol=14):
    """在格子内定位卡底的实际边界。

    切图若只按格线切，卡底会切歪：有的把边框切在图外（看着像"没有边框"），
    有的多带一圈格间余白（拖动时卡底外露出多余底色）。
    这里从格子四边向内扫，遇到与余白色明显不同处即卡底边缘，保证每张图正好是一张卡。
    """
    x0, y0, x1, y1 = [int(v) for v in cell]
    sub = im.crop((x0, y0, x1, y1))
    px = sub.load()
    w, h = sub.size
    cs = [px[1, 1], px[w - 2, 1], px[1, h - 2], px[w - 2, h - 2]]
    bg = tuple(sum(c[i] for c in cs) // 4 for i in range(3))

    def diff(c):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2])

    def scan(rng, get):
        for v in rng:
            hits = sum(1 for t in range(int(h * 0.25), int(h * 0.75), 3) if diff(get(v, t)) > tol)
            if hits > 3:
                return v
        return 0

    L = scan(range(0, w // 3), lambda v, t: px[v, t])
    R = scan(range(w - 1, w * 2 // 3, -1), lambda v, t: px[v, t])
    T = scan(range(0, h // 3), lambda v, t: px[t, v])
    B = scan(range(h - 1, h * 2 // 3, -1), lambda v, t: px[t, v])
    return (x0 + L, y0 + T, x0 + R + 1, y0 + B + 1)


def slice_cards(src, names, cols=3, rows=3, out_dir=None, grid=None, size=256, pad=3):
    """按卡底边界切图：每张输出正好是一张完整卡片，边框不缺、外围无余白。"""
    im = Image.open(src).convert('RGB')
    W, H = im.size
    cells = detect_grid(im, cols, rows, grid=grid)
    out_dir = out_dir or os.path.dirname(src)
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for i, name in enumerate(names):
        if not name:
            continue
        r, c = divmod(i, cols)
        x0, y0, x1, y1 = card_box(im, cells[r][c])
        box = (max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))
        tile = im.crop(box)
        s = max(tile.size)
        canvas = Image.new('RGB', (s, s), tile.getpixel((tile.size[0] // 2, 2)))
        canvas.paste(tile, ((s - tile.size[0]) // 2, (s - tile.size[1]) // 2))
        pth = os.path.join(out_dir, name + '.png')
        canvas.resize((size, size), Image.LANCZOS).save(pth, 'PNG')
        made.append(pth)
    return made


if __name__ == '__main__':
    src = sys.argv[1]
    names = sys.argv[2].split(',')
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    rows = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    out = sys.argv[5] if len(sys.argv) > 5 else None
    if os.environ.get('SHOW_GRID'):
        for row in detect_grid(Image.open(src).convert('RGB'), cols, rows):
            print(['%d,%d-%d,%d' % b for b in row])
    for p in slice_sheet(src, names, cols, rows, out):
        print(os.path.basename(p))
