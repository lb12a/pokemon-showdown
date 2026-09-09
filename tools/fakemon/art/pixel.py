"""A tiny pixel-art canvas: draw on a small grid, then outline and upscale."""
import colorsys, hashlib


class Grid:
    def __init__(self, size=32):
        self.n = size
        self.px = [[None] * size for _ in range(size)]

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if c is None or not (0 <= x < self.n and 0 <= y < self.n):
            return
        self.px[y][x] = c

    def get(self, x, y):
        if not (0 <= x < self.n and 0 <= y < self.n):
            return None
        return self.px[y][x]

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.put(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if rx <= 0 or ry <= 0:
                    continue
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.put(x, y, c)

    def ring(self, cx, cy, rx, ry, c, thickness=1.0):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if rx <= 0 or ry <= 0:
                    continue
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                inner = ((rx - thickness) / rx) ** 2 if rx > thickness else 0
                if inner <= d <= 1.0:
                    self.put(x, y, c)

    def arc(self, cx, cy, rx, ry, a0, a1, c, width=1):
        """Part of an ellipse, in degrees, clockwise from 3 o'clock."""
        import math
        steps = int(max(rx, ry) * 8) + 8
        for i in range(steps + 1):
            a = math.radians(a0 + (a1 - a0) * i / steps)
            x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
            if width <= 1:
                self.put(x, y, c)
            else:
                for dy in range(width):
                    for dx in range(width):
                        self.put(x + dx - width // 2, y + dy - width // 2, c)

    def line(self, x0, y0, x1, y1, c, width=1):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(steps + 1):
            t = i / steps
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            if width <= 1:
                self.put(x, y, c)
            else:
                r = (width - 1) / 2
                for dy in range(-int(r), int(r) + 1):
                    for dx in range(-int(r), int(r) + 1):
                        self.put(x + dx, y + dy, c)

    def poly(self, points, c):
        """Scanline fill of a closed polygon."""
        ys = [p[1] for p in points]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            for i in range(len(points)):
                (x0, y0), (x1, y1) = points[i], points[(i + 1) % len(points)]
                if y0 == y1:
                    continue
                if min(y0, y1) <= y < max(y0, y1):
                    xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(round(xs[i])), int(round(xs[i + 1])) + 1):
                    self.put(x, y, c)

    def shade(self, colors, keep, replace):
        """Recolour every pixel currently `keep` to `replace` where a test passes."""
        for y in range(self.n):
            for x in range(self.n):
                if self.px[y][x] == keep and colors(x, y):
                    self.px[y][x] = replace

    def outline(self, c):
        """Wrap the drawing in a one-pixel dark border."""
        add = []
        for y in range(self.n):
            for x in range(self.n):
                if self.px[y][x] is not None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + dx, y + dy) not in (None, c):
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def to_image(self, scale, Image):
        im = Image.new('RGBA', (self.n, self.n), (0, 0, 0, 0))
        px = im.load()
        for y in range(self.n):
            for x in range(self.n):
                c = self.px[y][x]
                if c is not None:
                    px[x, y] = c if len(c) == 4 else (c[0], c[1], c[2], 255)
        return im.resize((self.n * scale, self.n * scale), Image.NEAREST)


# ---------------------------------------------------------------------------
# Colour
# ---------------------------------------------------------------------------
def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h % 1.0, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return (int(r * 255), int(g * 255), int(b * 255), 255)


def seed_of(text):
    return int(hashlib.md5(text.encode('utf-8')).hexdigest()[:8], 16)


class Palette:
    """Five tones built from one hue, so every icon is internally consistent."""

    def __init__(self, hue, sat=0.62, jitter=0):
        self.hue = (hue + jitter) % 1.0
        self.sat = sat
        self.dark = hsl(self.hue, sat, 0.26)
        self.base = hsl(self.hue, sat, 0.45)
        self.light = hsl(self.hue, sat * 0.85, 0.62)
        self.pale = hsl(self.hue, sat * 0.6, 0.80)
        self.deep = hsl(self.hue, sat, 0.16)

    def shift(self, delta, sat=None, lum=None):
        return hsl(self.hue + delta, sat if sat is not None else self.sat,
                   lum if lum is not None else 0.45)


INK = (28, 24, 38, 255)
WHITE = (250, 250, 252, 255)
GLINT = (255, 255, 255, 235)
