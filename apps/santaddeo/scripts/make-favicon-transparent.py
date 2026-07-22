from PIL import Image
import numpy as np

img = Image.open("public/favicon.jpg").convert("RGBA")
data = np.array(img)

r = data[:,:,0]
g = data[:,:,1]
b = data[:,:,2]

is_black = (r < 40) & (g < 40) & (b < 40)

data[:,:,3] = np.where(is_black, 0, 255)

result = Image.fromarray(data)
result.save("public/favicon.png", "PNG")

icon32 = result.resize((32, 32), Image.LANCZOS)
icon32.save("public/icon-32.png", "PNG")

apple = result.resize((180, 180), Image.LANCZOS)
apple.save("public/apple-icon.png", "PNG")

total = data.shape[0] * data.shape[1]
transparent = int(np.sum(is_black))
print("Done!")
print("Transparent pixels: " + str(transparent) + "/" + str(total))
