"""Pixel-art shape templates. Each draws one item on a 32x32 grid."""
from pixel import INK, WHITE, GLINT, hsl

CX, CY = 16, 17


def _glint(g, x, y, n=2):
    for i in range(n):
        g.put(x + i, y - i // 2, GLINT)


# ---------------------------------------------------------------- edibles ---
def berry(g, p, r):
    g.ellipse(CX, CY + 2, 9, 8, p.base)
    g.ellipse(CX - 3, CY - 1, 4, 3, p.light)
    g.ellipse(CX + 4, CY + 5, 4, 3, p.deep)
    leaf = hsl(0.30, 0.55, 0.34)
    g.poly([(CX, CY - 6), (CX + 7, CY - 10), (CX + 2, CY - 4)], leaf)
    g.line(CX, CY - 6, CX - 1, CY - 10, hsl(0.28, 0.5, 0.22), 1)
    _glint(g, CX - 4, CY - 2, 3)


def mushroom(g, p, r):
    stem = hsl(0.10, 0.22, 0.78)
    g.rect(CX - 3, CY, CX + 2, CY + 10, stem)
    g.rect(CX + 1, CY, CX + 2, CY + 10, hsl(0.10, 0.20, 0.60))
    g.ellipse(CX, CY + 10, 4, 1.6, hsl(0.10, 0.20, 0.60))
    # A dome, not a disc: the cap is what makes it read as a mushroom.
    g.ellipse(CX, CY - 1, 11, 9, p.base)
    g.rect(CX - 12, CY, CX + 12, CY + 12, None)
    g.rect(CX - 3, CY, CX + 2, CY + 10, stem)
    g.rect(CX + 1, CY, CX + 2, CY + 10, hsl(0.10, 0.20, 0.60))
    g.ellipse(CX, CY + 10, 4, 1.6, hsl(0.10, 0.20, 0.60))
    g.ellipse(CX, CY - 1, 11, 2.4, p.deep)
    g.rect(CX - 11, CY - 1, CX + 11, CY, p.deep)
    g.rect(CX - 3, CY - 1, CX + 2, CY, stem)
    g.ellipse(CX - 4, CY - 5, 3, 2.2, p.pale)
    g.ellipse(CX + 5, CY - 3, 2.2, 1.8, p.pale)
    g.ellipse(CX + 1, CY - 8, 2, 1.4, p.pale)
    _glint(g, CX - 8, CY - 3)


def loaf(g, p, r):
    g.poly([(6, CY + 7), (26, CY + 7), (25, CY - 3), (18, CY - 7), (8, CY - 4)], p.base)
    g.poly([(8, CY - 4), (18, CY - 7), (25, CY - 3), (20, CY - 1), (10, CY - 1)], p.light)
    for i in range(3):
        g.line(11 + i * 5, CY - 5 + i, 13 + i * 5, CY + 1, p.deep)
    g.rect(6, CY + 6, 26, CY + 7, p.deep)


def donut(g, p, r):
    g.ellipse(CX, CY + 1, 11, 10, hsl(0.09, 0.45, 0.42))
    g.ellipse(CX, CY, 11, 9, p.base)
    g.ellipse(CX, CY + 1, 4, 3, None)
    g.ring(CX, CY, 11, 9, p.light, 2)
    for i in range(7):
        a = r.random() * 6.283
        g.put(CX + 7 * (a % 1 - 0.5) * 2, CY - 4 + r.random() * 8,
              hsl(r.random(), 0.7, 0.6))


def cookie(g, p, r):
    g.ellipse(CX, CY, 10, 9, p.base)
    g.ellipse(CX - 3, CY - 3, 5, 4, p.light)
    for _ in range(6):
        g.ellipse(CX - 7 + r.random() * 14, CY - 6 + r.random() * 12, 1.4, 1.2, p.deep)


def candy(g, p, r):
    g.ellipse(CX, CY, 6, 6, p.base)
    g.ellipse(CX - 2, CY - 2, 2, 2, p.pale)
    for s in (-1, 1):
        g.poly([(CX + s * 6, CY - 1), (CX + s * 12, CY - 5),
                (CX + s * 11, CY + 5), (CX + s * 6, CY + 1)], p.light)


def jelly(g, p, r):
    g.poly([(8, CY + 8), (24, CY + 8), (22, CY - 4), (16, CY - 8), (10, CY - 4)],
           (p.base[0], p.base[1], p.base[2], 225))
    g.poly([(10, CY - 4), (16, CY - 8), (22, CY - 4), (16, CY - 1)], p.pale)
    g.ellipse(CX - 4, CY + 2, 2, 3, GLINT)


def melon(g, p, r):
    g.ellipse(CX, CY + 1, 11, 10, p.base)
    for i in range(-2, 3):
        g.line(CX + i * 4, CY - 9, CX + i * 5, CY + 10, p.deep)
    g.ellipse(CX - 4, CY - 4, 3, 2, p.pale)
    g.rect(CX - 1, CY - 12, CX, CY - 9, hsl(0.3, 0.5, 0.3))


def nut(g, p, r):
    g.poly([(CX, CY - 8), (CX + 8, CY + 2), (CX, CY + 10), (CX - 8, CY + 2)], p.base)
    g.poly([(CX, CY - 8), (CX + 8, CY + 2), (CX, CY + 1)], p.light)
    g.ellipse(CX, CY - 6, 7, 3, hsl(0.08, 0.5, 0.28))
    g.rect(CX - 1, CY - 11, CX, CY - 8, hsl(0.08, 0.5, 0.2))


def chili(g, p, r):
    g.poly([(CX - 5, CY - 6), (CX + 3, CY - 3), (CX + 5, CY + 5),
            (CX - 1, CY + 10), (CX - 5, CY + 4)], p.base)
    g.line(CX - 3, CY - 4, CX - 1, CY + 7, p.light, 2)
    g.line(CX - 5, CY - 6, CX - 7, CY - 11, hsl(0.3, 0.5, 0.3), 2)
    g.ellipse(CX - 5, CY - 7, 3, 2, hsl(0.3, 0.5, 0.35))


def root(g, p, r):
    g.poly([(CX - 5, CY - 5), (CX + 5, CY - 5), (CX + 1, CY + 11), (CX - 1, CY + 11)], p.base)
    g.line(CX + 3, CY - 3, CX, CY + 9, p.light, 1)
    for i in range(3):
        g.line(CX - 4 + i * 4, CY - 6, CX - 7 + i * 7, CY - 12, hsl(0.30, 0.55, 0.32), 2)


def egg(g, p, r):
    g.poly([(CX, CY - 10), (CX + 8, CY + 1), (CX + 5, CY + 9),
            (CX - 5, CY + 9), (CX - 8, CY + 1)], p.pale)
    for _ in range(5):
        g.ellipse(CX - 5 + r.random() * 10, CY - 5 + r.random() * 12, 1.3, 1.3, p.base)
    _glint(g, CX - 4, CY - 4, 3)


def jerky(g, p, r):
    bone = hsl(0.11, 0.20, 0.85)
    g.poly([(CX - 2, CY - 8), (CX + 7, CY - 4), (CX + 6, CY + 5),
            (CX - 3, CY + 6), (CX - 6, CY - 2)], p.base)
    g.poly([(CX - 2, CY - 8), (CX + 7, CY - 4), (CX + 1, CY - 2)], p.light)
    g.line(CX - 5, CY + 4, CX - 10, CY + 10, bone, 3)
    g.ellipse(CX - 10, CY + 10, 3, 3, bone)


def pretzel(g, p, r):
    g.ring(CX, CY + 3, 9, 7, p.base, 3)
    g.line(CX - 6, CY - 2, CX + 3, CY - 9, p.base, 3)
    g.line(CX + 6, CY - 2, CX - 3, CY - 9, p.base, 3)
    for _ in range(8):
        g.put(CX - 9 + r.random() * 18, CY - 8 + r.random() * 16, WHITE)


def croissant(g, p, r):
    g.ring(CX, CY + 4, 11, 9, p.base, 4)
    g.rect(0, CY + 4, 31, 31, None)
    g.ellipse(CX - 11, CY + 4, 3, 3, p.base)
    g.ellipse(CX + 11, CY + 4, 3, 3, p.base)
    g.ring(CX, CY + 3, 11, 9, p.light, 1)


def pastry(g, p, r):
    g.poly([(6, CY + 7), (26, CY + 7), (24, CY - 2), (8, CY - 2)], p.base)
    g.poly([(8, CY - 2), (24, CY - 2), (22, CY - 7), (10, CY - 7)], p.pale)
    for i in range(4):
        g.ellipse(11 + i * 4, CY - 7, 2, 2, p.pale)
    g.ellipse(CX, CY - 8, 2, 2, p.shift(0.5, 0.7, 0.55))


def cup(g, p, r):
    mug = hsl(0.58, 0.10, 0.88)
    g.poly([(10, CY - 5), (22, CY - 5), (20, CY + 9), (12, CY + 9)], mug)
    g.poly([(11, CY - 4), (21, CY - 4), (20.5, CY - 1), (11.5, CY - 1)], p.base)
    g.ring(23, CY, 4, 4, mug, 2)
    g.rect(9, CY + 9, 23, CY + 10, hsl(0.58, 0.10, 0.66))
    for i in range(2):
        g.line(13 + i * 6, CY - 8, 12 + i * 6, CY - 12, (230, 230, 240, 160), 1)


def bottle(g, p, r):
    glass = (214, 232, 238, 235)
    g.rect(CX - 2, CY - 12, CX + 1, CY - 8, hsl(0.08, 0.45, 0.35))
    g.rect(CX - 1, CY - 8, CX, CY - 5, glass)
    g.poly([(CX - 6, CY - 4), (CX + 5, CY - 4), (CX + 7, CY + 4),
            (CX + 5, CY + 9), (CX - 6, CY + 9), (CX - 8, CY + 4)], glass)
    g.poly([(CX - 7, CY + 1), (CX + 6, CY + 1), (CX + 5, CY + 9), (CX - 6, CY + 9)], p.base)
    g.ellipse(CX - 4, CY + 4, 1.5, 2, p.pale)
    _glint(g, CX - 5, CY - 2, 3)


def vial(g, p, r):
    glass = (212, 236, 240, 230)
    g.rect(CX - 4, CY - 11, CX + 3, CY - 9, hsl(0.05, 0.4, 0.4))
    g.rect(CX - 3, CY - 9, CX + 2, CY + 8, glass)
    g.ellipse(CX - 0.5, CY + 8, 3, 3, glass)
    g.rect(CX - 3, CY + 1, CX + 2, CY + 8, p.base)
    g.ellipse(CX - 0.5, CY + 8, 3, 3, p.base)
    g.line(CX - 3, CY - 7, CX - 3, CY + 4, GLINT)


def pod(g, p, r):
    g.poly([(CX, CY - 10), (CX + 6, CY), (CX, CY + 10), (CX - 6, CY)], p.base)
    g.line(CX, CY - 9, CX, CY + 9, p.deep)
    for i in (-1, 1):
        g.ellipse(CX + i * 3, CY - 2, 1.5, 2, p.pale)
        g.ellipse(CX + i * 3, CY + 4, 1.5, 2, p.pale)


def leaf(g, p, r):
    g.poly([(CX - 9, CY + 8), (CX - 2, CY - 9), (CX + 8, CY - 2), (CX + 2, CY + 8)], p.base)
    g.line(CX - 8, CY + 8, CX + 4, CY - 5, p.deep, 1)
    for i in range(3):
        g.line(CX - 5 + i * 3, CY + 3 - i * 3, CX - 1 + i * 3, CY - 1 - i * 3, p.light)


def kelp(g, p, r):
    for s in (-1, 1):
        for i in range(5):
            g.ellipse(CX + s * (2 + i), CY + 8 - i * 4, 3 - i * 0.3, 2.4, p.base)
    g.line(CX, CY + 10, CX, CY - 9, p.deep, 2)
    g.ellipse(CX - 3, CY - 2, 2, 1.5, p.light)


# ------------------------------------------------------------------ gear ---
def chip(g, p, r):
    g.rect(9, CY - 7, 23, CY + 7, hsl(0.33, 0.35, 0.24))
    g.rect(11, CY - 5, 21, CY + 5, p.base)
    for i in range(4):
        g.rect(7, CY - 5 + i * 3, 8, CY - 4 + i * 3, hsl(0.13, 0.6, 0.55))
        g.rect(24, CY - 5 + i * 3, 25, CY - 4 + i * 3, hsl(0.13, 0.6, 0.55))
    g.rect(13, CY - 3, 19, CY + 3, p.light)
    g.put(12, CY - 4, GLINT)


def battery(g, p, r):
    g.rect(CX - 4, CY - 11, CX + 3, CY - 9, hsl(0.0, 0.0, 0.65))
    g.rect(CX - 7, CY - 9, CX + 6, CY + 10, hsl(0.0, 0.0, 0.22))
    g.rect(CX - 5, CY - 7, CX + 4, CY + 8, p.base)
    g.rect(CX - 5, CY - 7, CX + 4, CY - 1, p.light)
    g.poly([(CX + 1, CY - 5), (CX - 3, CY + 2), (CX, CY + 2), (CX - 2, CY + 7),
            (CX + 3, CY, ), (CX, CY)], hsl(0.14, 0.9, 0.6))


def cable(g, p, r):
    g.rect(6, CY - 5, 12, CY + 3, hsl(0.0, 0.0, 0.20))
    g.rect(7, CY - 3, 9, CY + 1, hsl(0.13, 0.7, 0.6))
    for i in range(0, 12):
        t = i / 11
        g.put(12 + t * 14, CY - 1 + 6 * (0.5 - abs(0.5 - (t * 2 % 1))) * (1 if int(t * 2) % 2 else -1), p.base)
        g.put(12 + t * 14, CY + 6 * (0.5 - abs(0.5 - (t * 2 % 1))) * (1 if int(t * 2) % 2 else -1), p.base)
    g.rect(24, CY - 5, 27, CY + 3, hsl(0.0, 0.0, 0.30))


def key(g, p, r):
    g.ring(CX - 5, CY - 4, 6, 6, p.base, 2)
    g.rect(CX - 1, CY - 2, CX + 1, CY + 10, p.base)
    g.rect(CX + 1, CY + 4, CX + 5, CY + 5, p.base)
    g.rect(CX + 1, CY + 8, CX + 4, CY + 9, p.base)
    g.put(CX - 8, CY - 7, GLINT)


def goggles(g, p, r):
    g.rect(4, CY - 4, 27, CY + 3, p.base)
    g.ellipse(11, CY, 5, 4, hsl(0.55, 0.5, 0.30))
    g.ellipse(21, CY, 5, 4, hsl(0.55, 0.5, 0.30))
    g.ellipse(9, CY - 1, 2, 1.4, GLINT)
    g.ellipse(19, CY - 1, 2, 1.4, GLINT)
    g.rect(15, CY - 2, 17, CY + 1, p.deep)


def monocle(g, p, r):
    g.ring(CX - 2, CY - 2, 9, 9, p.base, 2)
    g.ellipse(CX - 2, CY - 2, 7, 7, (200, 230, 245, 120))
    g.line(CX - 2, CY - 8, CX + 4, CY - 3, GLINT, 1)
    g.line(CX + 6, CY + 3, CX + 10, CY + 10, hsl(0.0, 0.0, 0.25), 1)


def orb(g, p, r):
    g.ellipse(CX, CY, 10, 10, p.deep)
    g.ellipse(CX, CY, 9, 9, p.base)
    g.ellipse(CX - 2, CY - 2, 6, 6, p.light)
    g.ellipse(CX - 3, CY - 3, 3, 3, p.pale)
    _glint(g, CX - 5, CY - 5, 3)


def crystal(g, p, r):
    g.poly([(CX, CY - 11), (CX + 6, CY - 1), (CX + 3, CY + 10), (CX - 4, CY + 10), (CX - 6, CY - 1)], p.base)
    g.poly([(CX, CY - 11), (CX + 6, CY - 1), (CX + 1, CY + 2)], p.pale)
    g.poly([(CX, CY - 11), (CX - 6, CY - 1), (CX - 1, CY + 2)], p.light)
    g.poly([(CX + 1, CY + 2), (CX + 6, CY - 1), (CX + 3, CY + 10)], p.deep)
    _glint(g, CX - 3, CY - 5)


def gem(g, p, r):
    g.poly([(CX - 8, CY - 3), (CX - 4, CY - 8), (CX + 4, CY - 8), (CX + 8, CY - 3),
            (CX, CY + 9)], p.base)
    g.poly([(CX - 8, CY - 3), (CX - 4, CY - 8), (CX, CY - 3)], p.pale)
    g.poly([(CX, CY - 3), (CX + 4, CY - 8), (CX + 8, CY - 3)], p.light)
    g.poly([(CX - 8, CY - 3), (CX, CY - 3), (CX, CY + 9)], p.deep)
    _glint(g, CX - 5, CY - 5)


def plate(g, p, r):
    g.poly([(CX, CY - 10), (CX + 9, CY - 5), (CX + 9, CY + 4), (CX, CY + 10),
            (CX - 9, CY + 4), (CX - 9, CY - 5)], p.base)
    g.poly([(CX, CY - 10), (CX + 9, CY - 5), (CX, CY - 1), (CX - 9, CY - 5)], p.light)
    g.ring(CX, CY, 5, 5, p.deep, 1)
    g.ellipse(CX, CY, 2, 2, p.pale)


def ring_item(g, p, r):
    g.ring(CX, CY + 3, 8, 8, p.base, 3)
    g.ring(CX, CY + 3, 8, 8, p.light, 1)
    g.poly([(CX - 4, CY - 5), (CX, CY - 11), (CX + 4, CY - 5), (CX, CY - 2)],
           p.shift(0.45, 0.7, 0.6))
    _glint(g, CX - 1, CY - 7)


def boots(g, p, r):
    g.poly([(CX - 5, CY - 9), (CX + 2, CY - 9), (CX + 3, CY + 3), (CX + 9, CY + 4),
            (CX + 9, CY + 9), (CX - 5, CY + 9)], p.base)
    g.rect(CX - 5, CY + 7, CX + 9, CY + 9, p.deep)
    g.rect(CX - 5, CY - 6, CX + 2, CY - 4, p.light)
    for i in range(3):
        g.line(CX - 4, CY - 2 + i * 3, CX + 1, CY - 2 + i * 3, p.deep)


def belt(g, p, r):
    g.rect(3, CY - 3, 28, CY + 3, p.base)
    g.rect(3, CY + 2, 28, CY + 3, p.deep)
    g.rect(CX - 5, CY - 6, CX + 4, CY + 6, hsl(0.12, 0.6, 0.52))
    g.rect(CX - 3, CY - 4, CX + 2, CY + 4, None)
    g.rect(CX - 1, CY - 4, CX, CY + 4, hsl(0.12, 0.6, 0.42))
    for i in range(3):
        g.put(6 + i * 3, CY, p.pale)


def gauntlet(g, p, r):
    g.poly([(CX - 7, CY - 6), (CX + 5, CY - 8), (CX + 7, CY + 3),
            (CX + 2, CY + 9), (CX - 7, CY + 7)], p.base)
    g.poly([(CX - 7, CY - 6), (CX + 5, CY - 8), (CX + 3, CY - 3), (CX - 7, CY - 1)], p.light)
    for i in range(3):
        g.line(CX + 6 - i, CY - 7 + i * 5, CX + 12 - i, CY - 10 + i * 5,
               hsl(0.0, 0.0, 0.86), 2)


def pendant(g, p, r):
    g.ring(CX, CY - 6, 9, 6, hsl(0.12, 0.55, 0.55), 1)
    g.poly([(CX - 5, CY + 1), (CX + 5, CY + 1), (CX, CY + 11)], p.base)
    g.poly([(CX - 5, CY + 1), (CX, CY + 1), (CX, CY + 11)], p.deep)
    g.ellipse(CX, CY + 3, 2, 2, p.pale)


def bell(g, p, r):
    g.poly([(CX - 8, CY + 6), (CX - 6, CY - 3), (CX, CY - 8), (CX + 6, CY - 3),
            (CX + 8, CY + 6)], p.base)
    g.rect(CX - 9, CY + 6, CX + 8, CY + 8, p.light)
    g.ellipse(CX, CY + 10, 2, 2, p.deep)
    g.rect(CX - 1, CY - 11, CX, CY - 8, p.deep)
    g.line(CX - 5, CY - 2, CX - 4, CY + 5, p.pale)


def hourglass(g, p, r):
    frame = hsl(0.08, 0.5, 0.35)
    g.rect(CX - 8, CY - 11, CX + 7, CY - 9, frame)
    g.rect(CX - 8, CY + 8, CX + 7, CY + 10, frame)
    g.poly([(CX - 6, CY - 9), (CX + 5, CY - 9), (CX, CY - 1)], p.base)
    g.poly([(CX - 6, CY + 8), (CX + 5, CY + 8), (CX, CY - 1)], p.light)
    g.line(CX, CY - 1, CX, CY + 5, p.pale)
    g.line(CX - 7, CY - 9, CX - 7, CY + 8, frame)
    g.line(CX + 6, CY - 9, CX + 6, CY + 8, frame)


def canister(g, p, r):
    g.rect(CX - 5, CY - 6, CX + 4, CY + 10, p.base)
    g.rect(CX + 2, CY - 6, CX + 4, CY + 10, p.deep)
    g.rect(CX - 5, CY - 6, CX - 3, CY + 10, p.light)
    g.rect(CX - 3, CY - 9, CX + 2, CY - 6, hsl(0.0, 0.0, 0.35))
    g.rect(CX - 4, CY - 11, CX + 3, CY - 9, hsl(0.03, 0.7, 0.5))
    g.rect(CX - 5, CY + 1, CX + 4, CY + 3, p.pale)


def syringe(g, p, r):
    g.rect(CX - 3, CY - 6, CX + 2, CY + 6, (220, 238, 244, 235))
    g.rect(CX - 3, CY, CX + 2, CY + 6, p.base)
    g.rect(CX - 5, CY - 8, CX + 4, CY - 6, hsl(0.0, 0.0, 0.75))
    g.rect(CX - 1, CY - 12, CX, CY - 8, hsl(0.0, 0.0, 0.55))
    g.line(CX, CY + 6, CX, CY + 11, hsl(0.0, 0.0, 0.82), 1)
    for i in range(3):
        g.line(CX - 3, CY - 4 + i * 3, CX - 2, CY - 4 + i * 3, hsl(0.0, 0.0, 0.5))


def coil(g, p, r):
    """A slinky: each wrap is a full ellipse, the near half drawn brighter."""
    core = hsl(0.0, 0.0, 0.26)
    g.rect(CX - 1, CY - 11, CX, CY + 11, core)
    for i in range(5):
        y = CY - 8 + i * 4.2
        g.arc(CX, y, 9, 3.2, 180, 360, p.deep, 2)     # behind the core
        g.arc(CX, y, 9, 3.2, 0, 180, p.base, 2)       # in front of it
        g.arc(CX, y + 1, 9, 3.2, 20, 90, p.light, 1)  # a lit edge
    g.line(CX + 9, CY - 8, CX + 12, CY - 11, p.pale, 2)
    g.line(CX - 9, CY + 9, CX - 12, CY + 12, p.pale, 2)


def fork(g, p, r):
    g.rect(CX - 6, CY - 10, CX - 4, CY + 2, p.base)
    g.rect(CX + 3, CY - 10, CX + 5, CY + 2, p.base)
    g.rect(CX - 6, CY + 2, CX + 5, CY + 4, p.base)
    g.rect(CX - 1, CY + 4, CX, CY + 11, p.base)
    g.ellipse(CX - 0.5, CY + 11, 2.5, 2, p.deep)
    g.line(CX - 6, CY - 10, CX - 6, CY, p.light)
    for i in range(3):
        g.put(CX + 8 + i, CY - 8 + i * 2, p.pale)


def panel(g, p, r):
    g.rect(5, CY - 8, 26, CY + 6, hsl(0.0, 0.0, 0.30))
    for row in range(3):
        for col in range(4):
            g.rect(7 + col * 5, CY - 6 + row * 4, 10 + col * 5, CY - 4 + row * 4, p.base)
    g.rect(7, CY - 6, 10, CY - 4, p.light)
    g.rect(CX - 1, CY + 6, CX, CY + 10, hsl(0.0, 0.0, 0.35))
    g.rect(CX - 5, CY + 10, CX + 4, CY + 11, hsl(0.0, 0.0, 0.28))


def doll(g, p, r):
    g.ellipse(CX, CY - 5, 5, 5, p.pale)
    g.rect(CX - 4, CY, CX + 3, CY + 8, p.base)
    g.rect(CX - 7, CY + 1, CX - 5, CY + 6, p.base)
    g.rect(CX + 4, CY + 1, CX + 6, CY + 6, p.base)
    g.put(CX - 2, CY - 6, INK)
    g.put(CX + 1, CY - 6, INK)
    g.line(CX + 2, CY + 1, CX + 8, CY - 4, hsl(0.0, 0.0, 0.7), 1)
    g.line(CX - 2, CY - 8, CX + 3, CY - 8, p.deep)


def ribbon(g, p, r):
    g.poly([(CX, CY - 2), (CX - 10, CY - 8), (CX - 8, CY + 1), (CX - 10, CY + 6)], p.base)
    g.poly([(CX, CY - 2), (CX + 10, CY - 8), (CX + 8, CY + 1), (CX + 10, CY + 6)], p.light)
    g.ellipse(CX, CY - 1, 3, 3, p.deep)
    g.poly([(CX - 2, CY + 1), (CX - 5, CY + 11), (CX, CY + 6)], p.base)
    g.poly([(CX + 2, CY + 1), (CX + 5, CY + 11), (CX, CY + 6)], p.light)


def mirror(g, p, r):
    g.ellipse(CX, CY - 2, 9, 9, hsl(0.12, 0.5, 0.5))
    g.ellipse(CX, CY - 2, 7, 7, (222, 238, 246, 245))
    g.poly([(CX - 6, CY + 1), (CX + 1, CY - 8), (CX + 4, CY - 8), (CX - 4, CY + 3)], GLINT)
    g.rect(CX - 2, CY + 7, CX + 1, CY + 11, hsl(0.12, 0.5, 0.42))


def anchor(g, p, r):
    g.ring(CX, CY - 8, 3, 3, p.base, 1)
    g.rect(CX - 1, CY - 6, CX, CY + 9, p.base)
    g.rect(CX - 6, CY - 4, CX + 5, CY - 3, p.base)
    g.poly([(CX - 9, CY + 1), (CX - 7, CY + 1), (CX - 1, CY + 9), (CX - 1, CY + 11), (CX - 9, CY + 5)], p.base)
    g.poly([(CX + 8, CY + 1), (CX + 6, CY + 1), (CX, CY + 9), (CX, CY + 11), (CX + 8, CY + 5)], p.light)


def candle(g, p, r):
    g.rect(CX - 4, CY - 2, CX + 3, CY + 10, p.pale)
    g.rect(CX + 1, CY - 2, CX + 3, CY + 10, p.base)
    g.ellipse(CX - 0.5, CY - 2, 4, 2, WHITE)
    g.rect(CX - 1, CY - 5, CX, CY - 3, hsl(0.0, 0.0, 0.25))
    g.poly([(CX - 0.5, CY - 12), (CX + 3, CY - 6), (CX - 0.5, CY - 4), (CX - 4, CY - 6)],
           hsl(0.09, 0.95, 0.58))
    g.poly([(CX - 0.5, CY - 10), (CX + 1.5, CY - 6), (CX - 0.5, CY - 5), (CX - 2.5, CY - 6)],
           hsl(0.14, 1.0, 0.72))


def incense(g, p, r):
    g.poly([(CX - 7, CY + 10), (CX + 6, CY + 10), (CX + 4, CY + 2), (CX - 5, CY + 2)], p.base)
    g.poly([(CX - 5, CY + 2), (CX + 4, CY + 2), (CX + 2, CY - 1), (CX - 3, CY - 1)], p.light)
    for i in range(6):
        g.put(CX - 1 + 3 * (0.5 - abs(0.5 - (i / 5))) * (1 if i % 2 else -1) * 2, CY - 3 - i * 1.7,
              (210, 210, 220, 150))


def fossil(g, p, r):
    g.ellipse(CX, CY, 10, 9, p.base)
    g.ellipse(CX - 2, CY - 2, 6, 5, p.light)
    for i in range(14):
        a = i / 14 * 9.4
        rad = 1 + i * 0.5
        g.put(CX + rad * __import__('math').cos(a) * 0.8, CY + rad * __import__('math').sin(a) * 0.7, p.deep)
    _glint(g, CX - 6, CY - 5)


def spike(g, p, r):
    g.poly([(CX, CY - 12), (CX + 5, CY + 4), (CX, CY + 10), (CX - 5, CY + 4)], p.base)
    g.poly([(CX, CY - 12), (CX + 5, CY + 4), (CX, CY + 2)], p.light)
    g.poly([(CX, CY + 2), (CX - 5, CY + 4), (CX, CY + 10)], p.deep)
    g.rect(CX - 6, CY + 6, CX + 5, CY + 8, p.shift(0.0, 0.15, 0.35))


def dial(g, p, r):
    g.ellipse(CX, CY, 11, 11, hsl(0.11, 0.5, 0.42))
    g.ellipse(CX, CY, 9, 9, p.pale)
    for i in range(8):
        a = i / 8 * 6.283
        g.put(CX + 7.6 * __import__('math').cos(a), CY + 7.6 * __import__('math').sin(a), p.deep)
    g.line(CX, CY, CX + 5, CY - 4, hsl(0.02, 0.7, 0.45), 1)
    g.line(CX, CY, CX - 3, CY + 4, p.deep, 1)
    g.ellipse(CX, CY, 1.4, 1.4, p.deep)


def pouch(g, p, r):
    g.poly([(CX - 8, CY + 3), (CX - 6, CY + 10), (CX + 5, CY + 10), (CX + 7, CY + 3),
            (CX + 3, CY - 3), (CX - 4, CY - 3)], p.base)
    g.poly([(CX - 4, CY - 3), (CX + 3, CY - 3), (CX + 4, CY), (CX - 5, CY)], p.light)
    g.rect(CX - 5, CY - 5, CX + 4, CY - 3, hsl(0.11, 0.55, 0.40))
    g.line(CX - 2, CY - 8, CX + 1, CY - 5, hsl(0.11, 0.55, 0.40), 1)
    for _ in range(4):
        g.put(CX - 4 + r.random() * 8, CY - 10 + r.random() * 4, p.pale)


def feather(g, p, r):
    g.poly([(CX + 6, CY - 11), (CX + 2, CY + 2), (CX - 6, CY + 9), (CX - 2, CY - 3)], p.base)
    g.line(CX + 5, CY - 10, CX - 6, CY + 10, p.pale, 1)
    for i in range(5):
        g.line(CX + 4 - i * 2, CY - 8 + i * 3, CX - 1 - i * 2, CY - 5 + i * 3, p.light)


def scope(g, p, r):
    g.rect(6, CY - 4, 26, CY + 3, hsl(0.0, 0.0, 0.24))
    g.rect(6, CY - 4, 26, CY - 2, hsl(0.0, 0.0, 0.40))
    g.ellipse(26, CY, 3, 5, p.base)
    g.ellipse(6, CY, 2.4, 4.4, p.light)
    g.rect(CX - 3, CY - 7, CX + 2, CY - 4, hsl(0.0, 0.0, 0.32))
    g.put(26, CY, GLINT)


def shield(g, p, r):
    rim = p.deep
    body = [(CX, CY - 11), (CX + 9, CY - 8), (CX + 8, CY + 2),
            (CX, CY + 11), (CX - 8, CY + 2), (CX - 9, CY - 8)]
    g.poly(body, rim)
    inner = [(CX, CY - 9), (CX + 7, CY - 6.5), (CX + 6, CY + 1.5),
             (CX, CY + 8.5), (CX - 6, CY + 1.5), (CX - 7, CY - 6.5)]
    g.poly(inner, p.base)
    # Lit from the top left, so the two halves read as a curved face.
    g.poly([(CX, CY - 9), (CX - 7, CY - 6.5), (CX - 6, CY + 1.5), (CX, CY + 8.5)], p.light)
    g.line(CX, CY - 9, CX, CY + 8, rim, 1)
    g.line(CX - 6.5, CY - 3, CX + 6, CY - 3, rim, 1)
    _glint(g, CX - 5, CY - 6)


def band(g, p, r):
    g.ring(CX, CY, 10, 8, p.base, 3)
    g.ring(CX, CY, 10, 8, p.light, 1)
    g.poly([(CX - 4, CY - 12), (CX + 3, CY - 12), (CX, CY - 6)], p.shift(0.5, 0.75, 0.55))
    for i in range(3):
        g.put(CX - 8 + i * 2, CY + 5 + i, p.pale)


def sash(g, p, r):
    g.poly([(6, CY - 10), (12, CY - 10), (26, CY + 8), (20, CY + 8)], p.base)
    g.poly([(6, CY - 10), (9, CY - 10), (23, CY + 8), (20, CY + 8)], p.light)
    g.poly([(20, CY + 8), (26, CY + 8), (24, CY + 12), (21, CY + 12)], p.deep)


def weight(g, p, r):
    g.poly([(CX - 9, CY + 10), (CX + 8, CY + 10), (CX + 6, CY - 3), (CX - 7, CY - 3)], p.base)
    g.poly([(CX - 7, CY - 3), (CX + 6, CY - 3), (CX + 4, CY - 6), (CX - 5, CY - 6)], p.light)
    g.ring(CX, CY - 8, 4, 4, hsl(0.0, 0.0, 0.45), 1)
    g.line(CX - 5, CY + 1, CX + 4, CY + 1, p.deep)


def megastone(g, p, r):
    import math
    g.ellipse(CX, CY, 11, 11, p.deep)
    g.ellipse(CX, CY, 10, 10, p.base)
    for arm in range(2):
        for i in range(26):
            t = i / 25
            a = t * 3.6 + arm * math.pi
            rad = 1.2 + t * 8.4
            g.put(CX + rad * math.cos(a), CY + rad * math.sin(a),
                  p.pale if i % 3 else GLINT)
    g.ellipse(CX, CY, 2, 2, WHITE)
    g.ring(CX, CY, 10, 10, p.light, 1)
    _glint(g, CX - 6, CY - 6, 3)
