#!/usr/bin/env python3
"""
Generate placeholder TripClip icons (blue square with white plane emoji).
Requires Pillow: pip install Pillow
Run from the icons/ directory: python3 generate_icons.py
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Pillow not found. Run: pip3 install Pillow")

import os

SIZES = [16, 32, 48, 128]
BG_COLOR = (37, 99, 235)      # #2563eb
TEXT_COLOR = (255, 255, 255)

out_dir = os.path.dirname(os.path.abspath(__file__))

for size in SIZES:
    img = Image.new("RGBA", (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Draw a simple "✈" character scaled to the icon
    symbol = "✈"
    font_size = max(8, int(size * 0.6))
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", font_size)
    except Exception:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), symbol, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    draw.text((x, y), symbol, fill=TEXT_COLOR, font=font)

    path = os.path.join(out_dir, f"icon{size}.png")
    img.save(path)
    print(f"  Wrote {path}")

print("Done.")
