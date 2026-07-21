import sys
from collections import deque
from PIL import Image

def cutout(src, dst, tol=34, size=512):
    """从四边泛洪去掉均匀背景色，输出透明 PNG。"""
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()
    # 以四角平均色作为背景基准
    corners = [px[1,1], px[w-2,1], px[1,h-2], px[w-2,h-2]]
    bg = tuple(sum(c[i] for c in corners)//4 for i in range(3))
    def near(p):
        return abs(p[0]-bg[0])<=tol and abs(p[1]-bg[1])<=tol and abs(p[2]-bg[2])<=tol
    seen = bytearray(w*h)
    dq = deque()
    for x in range(w):
        for y in (0, h-1):
            dq.append((x,y))
    for y in range(h):
        for x in (0, w-1):
            dq.append((x,y))
    while dq:
        x, y = dq.popleft()
        if x<0 or y<0 or x>=w or y>=h: continue
        i = y*w+x
        if seen[i]: continue
        seen[i] = 1
        if not near(px[x,y]): continue
        px[x,y] = (0,0,0,0)
        dq.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
    im = im.crop(im.getbbox() or (0,0,w,h))
    im.thumbnail((size,size), Image.LANCZOS)
    im.save(dst,'PNG')
    return im.size

if __name__ == '__main__':
    print(cutout(sys.argv[1], sys.argv[2]))
