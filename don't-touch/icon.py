#!/usr/bin/env python3
"""Generate simple extension icons as PNG files."""
import struct
import zlib

def create_png(width, height, rgba_data):
    """Create a minimal PNG from RGBA data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter byte
        raw += rgba_data[y * width * 4:(y + 1) * width * 4]
    
    compressed = zlib.compress(raw)
    
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')

def draw_icon(size):
    """Draw a download arrow icon with purple theme."""
    data = bytearray(size * size * 4)
    
    cx, cy = size // 2, size // 2
    radius = size // 2 - 1
    
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5
            
            if dist <= radius:
                # Background: purple gradient
                t = dist / radius
                r = int(103 * (1 - t * 0.3))
                g = int(95 * (1 - t * 0.3))
                b = int(165 * (1 - t * 0.2))
                a = 255
                
                # Draw down arrow
                arrow_w = size // 5
                arrow_h = size // 3
                stem_w = max(size // 8, 2)
                
                ax, ay = x - cx, y - cy + size // 8
                
                # Stem
                if abs(ax) <= stem_w // 2 and -arrow_h <= ay <= 0:
                    r, g, b = 206, 205, 255
                # Arrow head
                elif 0 <= ay <= arrow_w and abs(ax) <= (arrow_w - ay):
                    r, g, b = 206, 205, 255
                # Bottom bar
                elif abs(ax) <= arrow_w + stem_w and abs(ay - arrow_w - stem_w) <= max(stem_w // 2, 1):
                    r, g, b = 206, 205, 255
                
                data[idx:idx+4] = bytes([r, g, b, a])
            else:
                data[idx:idx+4] = bytes([0, 0, 0, 0])
    
    return bytes(data)

for sz in [16, 48, 128]:
    pixels = draw_icon(sz)
    png = create_png(sz, sz, pixels)
    with open(f'icons/icon{sz}.png', 'wb') as f:
        f.write(png)
    print(f'Created icon{sz}.png ({len(png)} bytes)')

