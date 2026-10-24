#!/usr/bin/env python3
"""Draws the extension icons: a teal rounded square with a white split mark.

public/icon/{16,32,48,128}.png fill the square; store/icon-128.png is the
Chrome Web Store icon, 96x96 of artwork with 16px of transparent padding.
Supersampled for smooth edges. Run from the repo root: python3 scripts/make-icons.py
"""
import math
import struct
import zlib

TEAL = (0, 124, 137)
WHITE = (255, 255, 255)
SS = 8  # samples per pixel, per axis


def shade(cx, cy, n):
    """Colour at (cx, cy) in artwork of size n, or None outside the shape."""
    r = n * 0.22
    dx = max(r - cx, cx - (n - r), 0)
    dy = max(r - cy, cy - (n - r), 0)
    if not (0 <= cx <= n and 0 <= cy <= n) or dx * dx + dy * dy > r * r:
        return None
    bar = abs(cx - cy) / math.sqrt(2) < n * 0.06 and n * 0.2 < cx < n * 0.8
    dots = any((cx - a) ** 2 + (cy - b) ** 2 < (n * 0.11) ** 2 for a, b in ((n * 0.3, n * 0.7), (n * 0.7, n * 0.3)))
    return WHITE if bar or dots else TEAL


def render(size, art):
    off = (size - art) / 2
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc, cover = [0, 0, 0], 0
            for sy in range(SS):
                for sx in range(SS):
                    c = shade(x + (sx + 0.5) / SS - off, y + (sy + 0.5) / SS - off, art)
                    if c:
                        cover += 1
                        for i in range(3):
                            acc[i] += c[i]
            row += bytes([round(a / cover) for a in acc] + [round(255 * cover / SS / SS)]) if cover else bytes(4)
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(b''.join(rows), 9)))
        f.write(chunk(b'IEND', b''))


for size in (16, 32, 48, 128):
    write_png(f'public/icon/{size}.png', render(size, size))
write_png('store/icon-128.png', render(128, 96))
