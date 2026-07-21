from PIL import Image

src = 'public/favicon.jpg'
dst_png = 'public/favicon.png'
dst_ico = 'public/favicon.ico'

img = Image.open(src).convert('RGBA')
pixels = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        rv, gv, bv, av = pixels[x, y]
        if rv < 40 and gv < 40 and bv < 40:
            pixels[x, y] = (0, 0, 0, 0)

img.save(dst_png)
img.save(dst_ico, sizes=[(48,48),(32,32),(16,16)])
print('saved')
