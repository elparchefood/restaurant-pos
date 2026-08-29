# -*- coding: utf-8 -*-
"""En cada HTML: quita las etiquetas de los modulos del nucleo y pone UNA de
   pos-nucleo.js en el lugar del primero que habia. Lo demas no se toca."""
import io, os, re, glob

MODULOS = ['pos-sync','pos-cache','pos-datos','pos-core','pos-solo-app','pos-carta',
 'pos-plan','pos-perms','pos-brand','pos-events','pos-impuestos','pos-print',
 'pos-print-listener','pos-caja-guard','pos-metodos','pos-saldo','pos-mapa','pos-traspaso']
PAT = re.compile(r'[ \t]*<script src="(%s)\.js[^"]*"></script>\n?' % '|'.join(m.replace('-', r'\-') for m in MODULOS))
V = 'pos-nucleo.js?v=1798580000'

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for h in sorted(glob.glob(os.path.join(R, '*.html'))):
    s = io.open(h, encoding='utf-8').read()
    ms = list(PAT.finditer(s))
    if not ms: continue
    primero = ms[0].start()
    s2 = PAT.sub('', s)
    # el punto de insercion se recalcula sobre el texto ya limpio
    antes = PAT.sub('', s[:primero])
    punto = len(antes)
    s2 = s2[:punto] + '<script src="%s"></script>\n' % V + s2[punto:]
    io.open(h, 'w', encoding='utf-8', newline='\n').write(s2)
    print(os.path.basename(h), '->', len(ms), 'etiquetas -> 1')
