import os
import urllib.request
from PIL import Image

# URL for a flat, square TikTok style icon PNG
url = 'https://cdn-icons-png.flaticon.com/512/3046/3046121.png'

dest_dir = '/home/snorlax/Downloads/lab/douyin-downloader-ext/icons'
sizes = [16, 48, 128]

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

tmp_file = '/tmp/tiktok_icon.png'

try:
    print('Downloading exact logo...')
    # Use a custom user agent to avoid 403 Forbidden
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open(tmp_file, 'wb') as out_file:
        data = response.read()
        out_file.write(data)
    
    with Image.open(tmp_file) as img:
        # If the image is not square, let's crop it to a square
        width, height = img.size
        if width != height:
            size = min(width, height)
            left = (width - size) / 2
            top = (height - size) / 2
            right = (width + size) / 2
            bottom = (height + size) / 2
            img = img.crop((left, top, right, bottom))
            
        # Convert to RGBA if not already
        img = img.convert("RGBA")
        
        for size in sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            dest_path = os.path.join(dest_dir, f'icon{size}.png')
            resized.save(dest_path, 'PNG')
            print(f'Saved {dest_path}')
except Exception as e:
    print(f'Error: {e}')
