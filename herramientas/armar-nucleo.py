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

# ══ AVISO DE CHOQUES DE NOMBRE ═══════════════════════════════════════════════
#
# El 30-ago-2026 el HISTORIAL y el INVENTARIO llevaban dias muertos y nadie lo
# sabia. La causa era la misma en los dos: declaraban en el ambito global un
# nombre que el nucleo ya declara (`COPF` uno, `SUPABASE_URL` el otro).
#
# Eso NO es un aviso del navegador: es un SyntaxError, y el navegador descarta
# el ARCHIVO COMPLETO. Las dos pantallas se quedaban en "Cargando..." para
# siempre, sin un solo error a la vista, y por fuera parecia una consulta lenta.
#
# Por eso se avisa aqui: al rearmar el nucleo se revisa cada pantalla que lo
# cargue y se dice si alguna vuelve a chocar. No falla el armado -- solo avisa,
# porque el que arma puede estar a mitad de otra cosa.

def avisar_choques(R):
    import re, glob
    nuc = io.open(os.path.join(R, 'pos-nucleo.js'), encoding='utf-8').read()

    def decls(txt):
        d = {}
        for m in re.finditer(r'^(?:const|let)\s+([A-Za-z_$][\w$]*)', txt, re.M):
            d[m.group(1)] = 'lexico'
        for m in re.finditer(r'^(?:var)\s+([A-Za-z_$][\w$]*)', txt, re.M):
            d.setdefault(m.group(1), 'var')
        for m in re.finditer(r'^function\s+([A-Za-z_$][\w$]*)', txt, re.M):
            d.setdefault(m.group(1), 'func')
        return d

    dn = decls(nuc)
    malos = []
    for f in sorted(glob.glob(os.path.join(R, '*.js'))):
        base = os.path.basename(f)
        if base.startswith('pos-'):
            continue
        html = os.path.join(R, base.replace('.js', '.html'))
        if not os.path.exists(html):
            continue
        if 'pos-nucleo.js' not in io.open(html, encoding='utf-8').read():
            continue        # si no carga el nucleo, no puede chocar con el
        dh = decls(io.open(f, encoding='utf-8').read())
        ch = [k for k in dh if k in dn and ('lexico' in (dn[k], dh[k]))]
        if ch:
            malos.append((base, ch))

    if malos:
        print('')
        print('  !! CHOQUES DE NOMBRE CON EL NUCLEO -- esas pantallas NO van a cargar:')
        for base, ch in malos:
            print('     %-22s %s' % (base, ', '.join(sorted(ch))))
        print('     (declarar dos veces el mismo nombre tira el archivo entero)')
    else:
        print('  sin choques de nombre con el nucleo')

avisar_choques(R)
