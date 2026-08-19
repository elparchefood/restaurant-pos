# -*- coding: utf-8 -*-
"""
CUADRAR LOS PRECIOS DE CADA RESUMEN CONTRA LA CARTA.

Lee el ultimo resumen de cada conversacion de prueba, saca las lineas y el
total, y vuelve a calcular el precio con la carta de verdad. Mirarlo a ojo
no sirve: un plato mal cobrado se ve igual de bien que uno bien cobrado.

Empaque: $1.000 por pedido, y NO lo pagan Hamburguesas, Perros, Sandwich,
Bebidas ni Adiciones (asi lo tiene configurado Sergio).
"""
import sys, io, json, re, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from q import sql

SIN_EMPAQUE = {'hamburguesas', 'perros calientes', 'sandwich', 'bebidas', 'adiciones'}
EMPAQUE = 1000

def norm(t):
    t = unicodedata.normalize('NFD', str(t or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]', ' ', t).strip()

prods = json.loads(sql("""
select c.name as cat, p.name, p.price, p.presentations::text as pres, p.variables::text as vars
  from pos_products p join pos_categories c on c.id=p.category_id
 where p.available = true and p.tenant_id='0c78c799-bebb-4fe7-9bf6-c10062eaea7e'"""))

def precio_de(cat, nombre, tamano, variante):
    """El precio que DEBERIA cobrarse, con la misma regla del catalogo:
       manda la variante si trae precios por presentacion; si no, la
       presentacion; si no, el precio base."""
    cands = [p for p in prods if norm(p['name']) == norm(nombre)]
    if cat: 
        porCat = [p for p in cands if norm(p['cat']) == norm(cat)]
        if porCat: cands = porCat
    if not cands: return None, None
    p = cands[0]
    pres = json.loads(p['pres'] or '[]')
    idx = next((i for i, x in enumerate(pres) if norm(x.get('name')) == norm(tamano)), -1)
    base = float(p['price'] or 0)
    if idx >= 0 and pres[idx].get('price'): base = float(pres[idx]['price'])
    if variante:
        for g in json.loads(p['vars'] or '[]'):
            for o in (g.get('options') or []):
                if norm(o.get('name')) != norm(variante): continue
                pr = o.get('prices')
                if isinstance(pr, list) and idx >= 0 and idx < len(pr) and pr[idx]:
                    return float(pr[idx]), p['cat']
                if o.get('price'): return float(o['price']), p['cat']
    return base, p['cat']

LINEA_RE = re.compile(r'^\s*[^\w\s]*\s*(\d+)x\s+(.+?)\s*$')
PEDIDO_RE = re.compile(r'Pedido:\s*\$([\d.,]+)')
DOMI_RE = re.compile(r'Domicilio:\s*\$([\d.,]+)')
TOTAL_RE = re.compile(r'Total:\s*\$([\d.,]+)')

def plata(s): return int(re.sub(r'[^0-9]', '', s or '0') or 0)

def revisar(tel):
    filas = json.loads(sql(
      "select m.body from chat_messages m join chat_conversations c on c.id=m.conversation_id "
      "where c.contact_handle='%s' and m.direction='out' order by m.sent_at" % tel))
    resumen = None
    for f in filas:
        b = f['body'] or ''
        if 'Pedido:' in b and 'Total:' in b: resumen = b
    if not resumen: return None
    lineas = []
    for ln in resumen.split(chr(10)):
        m = LINEA_RE.match(ln.strip())
        if m: lineas.append((int(m.group(1)), m.group(2).strip()))
    mp = PEDIDO_RE.search(resumen); mt = TOTAL_RE.search(resumen); md = DOMI_RE.search(resumen)
    if not mp or not mt: return None
    return { 'resumen': resumen, 'lineas': lineas,
             'pedido': plata(mp.group(1)), 'total': plata(mt.group(1)),
             'domi': plata(md.group(1)) if md else 0 }

if __name__ == '__main__':
    for tel in sys.argv[1:]:
        r = revisar(tel)
        print('\n===== %s' % tel)
        if not r: print('  (sin resumen)'); continue
        for c, n in r['lineas']: print('  %dx %s' % (c, n))
        print('  Pedido $%s + Domicilio $%s = Total $%s   %s'
              % (r['pedido'], r['domi'], r['total'],
                 'CUADRA' if r['pedido'] + r['domi'] == r['total'] else '*** NO SUMA ***'))
