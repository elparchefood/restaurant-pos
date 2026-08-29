# -*- coding: utf-8 -*-
"""Arma pos-nucleo.js: los modulos compartidos en UN archivo.

   Por que existe: cada pantalla bajaba ~21 archivitos y eso costaba ~1,4 s
   ANTES de poder pedir un solo dato (medido el 29-ago). En el .exe es peor:
   revalida cada archivo en cada cambio de pantalla.

   ⚠️ Si tocas cualquiera de los modulos de la lista, vuelve a correr esto:
        python herramientas/armar-nucleo.py
   y sube pos-nucleo.js junto con tu cambio (y sube el ?v= en los HTML).

   pos-notify.js queda FUERA a proposito: abre una suscripcion de tiempo real
   y suena; meterlo al nucleo lo activaria en pantallas que no lo tenian.
"""
import io, os, hashlib

ORDEN = [
    'pos-sync.js', 'pos-cache.js', 'pos-datos.js', 'pos-core.js',
    'pos-solo-app.js', 'pos-carta.js', 'pos-plan.js', 'pos-perms.js',
    'pos-brand.js', 'pos-events.js', 'pos-impuestos.js', 'pos-print.js',
    'pos-print-listener.js', 'pos-caja-guard.js', 'pos-metodos.js',
    'pos-saldo.js', 'pos-mapa.js', 'pos-traspaso.js', 'pos-mesas.js',
]

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
partes = []
for n in ORDEN:
    p = os.path.join(R, n)
    src = io.open(p, encoding='utf-8').read()
    partes.append(u'\n/* ═══════ %s ═══════ */\n;%s\n;' % (n, src))

cuerpo = (u'/* pos-nucleo.js — GENERADO por herramientas/armar-nucleo.py. NO editar a mano:\n'
          u'   edita el modulo original y vuelve a correr el armador. */\n' + u''.join(partes))
out = os.path.join(R, 'pos-nucleo.js')
io.open(out, 'w', encoding='utf-8', newline='\n').write(cuerpo)
print('pos-nucleo.js: %d modulos, %d KB, md5 %s' % (
    len(ORDEN), len(cuerpo.encode("utf-8")) // 1024,
    hashlib.md5(cuerpo.encode("utf-8")).hexdigest()[:10]))
