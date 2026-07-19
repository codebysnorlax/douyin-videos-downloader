import os
from PIL import Image

src_img = '/home/snorlax/.gemini/antigravity-ide/brain/4fdfcf14-9da2-4b6e-a189-ee7e45e79f07/douyin_icon_1784493348671.png'
dest_dir = '/home/snorlax/Downloads/lab/douyin-downloader-ext/icons'
sizes = [16, 48, 128]

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

try:
    with Image.open(src_img) as img:
        for size in sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            dest_path = os.path.join(dest_dir, f'icon{size}.png')
            resized.save(dest_path, 'PNG')
            print(f'Saved {dest_path}')
except Exception as e:
    print(f'Error: {e}')
