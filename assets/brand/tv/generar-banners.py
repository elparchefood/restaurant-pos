# -*- coding: utf-8 -*-
"""El cuadro de Fire TV es ANCHO. Un emblema centrado y pequeno se ve perdido."""
import io, os
from PIL import Image, ImageDraw, ImageFont

REPO = r'C:\Users\USUARIO\AppData\Local\Temp\restaurant-pos'
OUT  = r'C:\Users\USUARIO\AppData\Local\Temp\claude\C--Prueba-Claude-Code\ee17ab88-e9a2-4726-b5f2-2ce8a49c2962\scratchpad'

AZUL = (48, 54, 128)          # #303680 — el azul del ejecutable, el bueno

def blanco(im):
    """La silueta del logo, en blanco solido.
       En una TV se mira a tres metros: el degradado azul del logo original se
       pierde contra el fondo azul marino. Blanco pleno se ve desde el sofa."""
    a = im.split()[-1]
    s = Image.new('RGBA', im.size, (255, 255, 255, 0))
    s.putalpha(a)
    return s

def fuente(px):
    for f in [r'C:\Windows\Fonts\seguisb.ttf', r'C:\Windows\Fonts\arialbd.ttf',
              r'C:\Windows\Fonts\segoeuib.ttf']:
        if os.path.exists(f):
            try: return ImageFont.truetype(f, px)
            except Exception: pass
    return ImageFont.load_default()

def banner(W, H, etiqueta):
    b = Image.new('RGBA', (W, H), AZUL + (255,))
    lock = blanco(Image.open(os.path.join(REPO, 'assets', 'brand', 'cobra-lockup.png')))

    #  El logo ocupa el 78% del ancho. Es lo que hacen las demas apps de la
    #  fila: llenan el cuadro. Un emblema al 30% se lee como un error.
    ancho = int(W * 0.78)
    alto  = int(lock.height * (ancho / lock.width))
    lock  = lock.resize((ancho, alto), Image.LANCZOS)

    d = ImageDraw.Draw(b)
    f = fuente(max(11, int(H * 0.10)))
    hueco = int(H * 0.055)
    altoTx = int(H * 0.12) if etiqueta else 0

    #  Se centra el BLOQUE entero (logo + palabra), no el logo solo. Centrar
    #  solo el logo dejaba un hueco muerto abajo y el cartel se veia caido.
    bloque = alto + (hueco + altoTx if etiqueta else 0)
    y = int((H - bloque) / 2)
    b.alpha_composite(lock, (int((W - ancho) / 2), max(0, y)))

    if etiqueta:
        t = etiqueta.upper()
        #  Espaciado entre letras: en un cartel pequeno una palabra en
        #  mayusculas sin aire se lee como un borron.
        esp = max(2, int(H * 0.018))
        anchos = [d.textlength(c, font=f) for c in t]
        total  = sum(anchos) + esp * (len(t) - 1)
        x = (W - total) / 2
        yy = y + alto + hueco
        for c, w in zip(t, anchos):
            d.text((x, yy), c, font=f, fill=(255, 255, 255, 170))
            x += w + esp
    return b.convert('RGB')

for nombre, etq in [('cocina', 'Cocina'), ('pos', ''), ('domi', 'Domicilios')]:
    for W, H, suf in [(320, 180, 'xhdpi'), (640, 360, 'xxhdpi')]:
        im = banner(W, H, etq)
        p = os.path.join(OUT, 'tv_banner_%s_%s.png' % (nombre, suf))
        im.save(p, 'PNG', optimize=True)
        print(p, im.size)
