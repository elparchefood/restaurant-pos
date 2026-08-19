# -*- coding: utf-8 -*-
"""
RENOMBRAR LOS PEDIDOS VIEJOS QUE QUEDARON CON EL NOMBRE INCOMPLETO (19-ago).

El nombre correcto es el del POS manual (tomar-pedido.js):
    [tamaNo o nombre-en-comanda-de-la-categoria] · producto · variantes

Lo que quedo guardado en estas filas es al reves y a veces sin la categoria:
    producto · tamaNo · variantes        ->  "MAICITOS · Personal"
    producto                             ->  "SENCILLA"

Se reordena SIN inventar: se parte el nombre viejo por " · ", se saca el
producto (que siempre va primero) y, si el pedazo siguiente es de verdad una
presentacion de ese producto, ese es el prefijo. Si no hay presentacion, el
prefijo es el nombre en comanda de la categoria. Nada mas se toca: ni precios,
ni cantidades, ni el pedido.
"""
import json, sys, io
from q import sql
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

filas = json.loads(sql("""
select i.id, i.name, p.name as prod,
       coalesce(p.presentations, '[]'::jsonb)::text as presentaciones,
       coalesce(nullif(c.comanda_alias,''), c.name) as cat
  from pos_order_items i
  left join pos_products p on p.id = i.product_id
  left join pos_categories c on c.id = p.category_id
 where i.product_id is not null
   and p.name is not null
   and (i.name = p.name or i.name like p.name || ' · %')
 order by i.id
"""))

def escapar(t): return t.replace("'", "''")

cambios = []
for f in filas:
    viejo = f['name']; prod = f['prod']
    presNombres = [str(x.get('name') or '').strip()
                   for x in json.loads(f['presentaciones'])]
    presNombres = [x for x in presNombres if x]

    partes = [x.strip() for x in viejo.split(' · ')]
    if partes[0] != prod:
        print('SE SALTA (no empieza por el producto):', viejo); continue
    resto = partes[1:]

    if resto and resto[0] in presNombres:
        prefijo = resto[0]; resto = resto[1:]
    else:
        prefijo = f['cat'] or ''

    nuevo = ' · '.join([p for p in ([prefijo, prod] + resto) if p])
    if nuevo != viejo:
        cambios.append((f['id'], viejo, nuevo))

print('%d filas a renombrar\n' % len(cambios))
for _, v, n in cambios:
    print('  %-32s ->  %s' % (v, n))

if len(sys.argv) > 1 and sys.argv[1] == 'aplicar':
    casos = '\n'.join("      when '%s' then '%s'" % (i, escapar(n)) for i, _, n in cambios)
    ids = ','.join("'%s'" % i for i, _, _ in cambios)
    q = ("update pos_order_items set name = case id::text\n%s end,\n"
         "    product_name = case id::text\n%s end\n"
         "  where id::text in (%s)" % (casos, casos, ids))
    print('\n', sql(q))
