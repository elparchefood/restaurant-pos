# -*- coding: utf-8 -*-
"""BORRAR LOS PEDIDOS DE UNA PRUEBA, DEJANDO TODO COMO ESTABA.

Pedido de Sergio (9-sep-2026): *"todo eso lo podemos borrar cuando yo acabe la
prueba, para que los insumos vuelvan a su normalidad, para que el dinero vuelva
a su normalidad y para que el cierre de caja se borre como si no hubiera
existido"*.

⚠️ POR DEFECTO NO BORRA NADA. Sin `--de-verdad` solo enseNa lo que haria.
Borrar en produccion se hace cuando Sergio lo dice, no cuando el programa
quiera.

═══ EL ORDEN IMPORTA, Y NO ES CAPRICHO ═══════════════════════════════════════

  1. ANULAR primero (status -> 'cancelled').
     Los puntos del cliente vuelven SOLO al anular (`trg_puntos_al_anular`).
     Si se borra de una, los puntos regalados en la prueba se quedan puestos.

  2. BORRAR despues.
     `trg_iv_orden_borrada` devuelve cada insumo a su sede. Y devolver dos
     veces NO infla el stock: `fn_iv_devolver_item` solo toca movimientos
     `NOT reversed` y los marca. Por eso anular y luego borrar es seguro.

  3. LIMPIAR lo que no tiene llave foranea.
     `pos_puntos_movimientos`, `pos_domi_tiempos` e `iv_movimientos` NO estan
     enganchados al pedido: sus filas se quedarian apuntando a un pedido que
     ya no existe. Los tiempos ademas contaminan el promedio real de cocina
     que Paco le dice a los clientes.

  4. LA CAJA aparte.
     `pos_cash_moves` no guarda a que pedido pertenece, asi que no hay forma
     de borrar "los movimientos de estos pedidos": se borra la SESION entera
     y sus movimientos se van con ella (CASCADE). Por eso la sesion se pide
     por separado y a proposito.

═══ LO QUE ESTA HERRAMIENTA **NO** DESHACE ══════════════════════════════════

  · LA BILLETERA DEL CLIENTE. `pos_saldo_mov.order_id` se pone en null al
    borrar el pedido: el movimiento sobrevive y el saldo queda descontado. Si
    en la prueba se pago con billetera, hay que devolver ese saldo a mano — y
    el programa avisa cuando encuentra uno.
  · UNA FACTURA DIAN. Es un documento legal: no se borra. Avisa y se detiene.

Uso:
    python borrar-pruebas.py                      # solo enseNa
    python borrar-pruebas.py --de-verdad          # borra
    python borrar-pruebas.py --sesion <uuid>      # ademas, esa caja
"""
import json
import subprocess
import sys
import io
import os

sys.stdout = io.TextIOWrapper(open(1, 'wb', closefd=False), encoding='utf-8', errors='replace')

#  La llave NO vive aqui: este repositorio es publico. Se pasa por el entorno,
#  y si no esta el programa no arranca — mejor no correr que correr a ciegas.
TOK = os.environ.get('SUPABASE_PAT', '')
if not TOK:
    raise SystemExit('Falta la llave. Antes de correrlo:  set SUPABASE_PAT=<la llave>')
U = 'https://api.supabase.com/v1/projects/tblujfduscslxjmrjbdr/database/query'
SEDE = '66e5f12d-fd16-455a-a6c0-9694aa6fb01b'      # El Parche

DE_VERDAD = '--de-verdad' in sys.argv
SESION = None
if '--sesion' in sys.argv:
    SESION = sys.argv[sys.argv.index('--sesion') + 1]


def q(sql):
    b = json.dumps({"query": sql})
    x = subprocess.run(['curl', '-s', '-X', 'POST', '-H', 'Authorization: Bearer ' + TOK,
                        '-H', 'Content-Type: application/json', '-d', b, U],
                       capture_output=True).stdout.decode('utf-8', 'replace')
    d = json.loads(x)
    if isinstance(d, dict) and d.get('message'):
        raise SystemExit('SQL: ' + d['message'][:300])
    return d


def cop(n):
    return '$' + format(int(n or 0), ',d').replace(',', '.')


# ── 1. QUE PEDIDOS SON ────────────────────────────────────────────────────
peds = q("""
 select o.id, o.estado, o.status, o.channel, o.total_final, o.cliente_id,
        to_char(o.created_at at time zone 'America/Bogota','MM-DD HH24:MI') creado
   from pos_orders o
  where o.branch_id = '%s'
    and o.created_at >= (now() at time zone 'America/Bogota')::date
  order by o.created_at""" % SEDE)

if not peds:
    raise SystemExit('No hay pedidos de hoy en esta sede. Nada que hacer.')

ids = ','.join("'%s'" % p['id'] for p in peds)
print('══ PEDIDOS DE HOY EN EL PARCHE (%d) ══' % len(peds))
for p in peds:
    print('  %s  %-14s %-10s %-9s %s' % (p['creado'], p['estado'] or '-',
                                          p['status'], p['channel'], cop(p['total_final'])))

# ── 2. QUE SE LLEVA CONSIGO ───────────────────────────────────────────────
print('\n══ LO QUE CUELGA DE ESOS PEDIDOS ══')
for tabla, col in (('pos_order_items', 'order_id'), ('pos_payments', 'order_id'),
                   ('pos_puntos_movimientos', 'order_id'), ('iv_movimientos', 'order_id'),
                   ('pos_domi_tiempos', 'order_id'), ('pos_saldo_mov', 'order_id'),
                   ('pos_facturas', 'order_id')):
    n = q("select count(*) c from %s where %s in (%s)" % (tabla, col, ids))[0]['c']
    print('  %-26s %s' % (tabla, n))

# ── 3. LO QUE NO SE PUEDE DESHACER ────────────────────────────────────────
fac = q("select count(*) c from pos_facturas where order_id in (%s)" % ids)[0]['c']
if fac:
    raise SystemExit('\n⛔ Hay %d FACTURA(S) DIAN sobre estos pedidos. Eso es un '
                     'documento legal y no se borra. Parado.' % fac)

sal = q("""select m.id, m.monto, m.motivo, c.nombre
             from pos_saldo_mov m left join pos_clientes c on c.id = m.cliente_id
            where m.order_id in (%s)""" % ids)
if sal:
    print('\n⚠️ BILLETERA: %d movimiento(s) que esta herramienta NO deshace.' % len(sal))
    for s in sal:
        print('     %s  %s  %s' % (cop(s['monto']), s['motivo'], s['nombre'] or ''))
    print('     Hay que devolver ese saldo a mano.')

# ── 4. LOS INSUMOS, ANTES ─────────────────────────────────────────────────
antes = q("""
 select e.insumo_id, i.nombre, e.stock, e.stock_servicio
   from iv_existencias e join iv_insumos i on i.id = e.insumo_id
  where e.insumo_id in (select distinct insumo_id from iv_movimientos
                         where order_id in (%s))
  order by i.nombre""" % ids)
print('\n══ INSUMOS QUE TOCARON ESTOS PEDIDOS (%d) ══' % len(antes))
for a in antes[:10]:
    print('  %-34s stock %s   servicio %s' % (a['nombre'][:34], a['stock'], a['stock_servicio']))
if len(antes) > 10:
    print('  … y %d más' % (len(antes) - 10))

# ── 5. LA CAJA ────────────────────────────────────────────────────────────
if SESION:
    ses = q("""select id, cashier_name, status, total_sales,
                      to_char(opened_at at time zone 'America/Bogota','MM-DD HH24:MI') abrio,
                      to_char(closed_at at time zone 'America/Bogota','MM-DD HH24:MI') cerro
                 from pos_sessions where id='%s'""" % SESION)
    mov = q("select count(*) c from pos_cash_moves where session_id='%s'" % SESION)[0]['c']
    print('\n══ CAJA A BORRAR ══')
    print('  %s  ·  %s  ·  ventas %s  ·  %d movimiento(s) que se van con ella'
          % (ses[0]['abrio'], ses[0]['status'], cop(ses[0]['total_sales']), mov))
else:
    abiertas = q("""select id, cashier_name, status,
                      to_char(opened_at at time zone 'America/Bogota','MM-DD HH24:MI') abrio
                    from pos_sessions where branch_id='%s'
                      and opened_at >= (now() at time zone 'America/Bogota')::date""" % SEDE)
    if abiertas:
        print('\n══ CAJAS DE HOY (ninguna se toca sin --sesion) ══')
        for s in abiertas:
            print('  %s  %s  %s  ->  --sesion %s' % (s['abrio'], s['status'],
                                                     s['cashier_name'] or '', s['id']))

# ── 6. EJECUTAR ───────────────────────────────────────────────────────────
if not DE_VERDAD:
    print('\n────────────────────────────────────────────────────────────')
    print('ESTO FUE SOLO LA VISTA PREVIA. No se borró nada.')
    print('Para hacerlo de verdad:  python borrar-pruebas.py --de-verdad')
    raise SystemExit(0)

print('\n══ BORRANDO ══')
#  1) anular: asi vuelven los puntos
q("update pos_orders set status='cancelled' where id in (%s) and status <> 'cancelled'" % ids)
print('  anulados (los puntos vuelven)')
#  2) las filas sin llave foranea, ANTES de borrar el pedido
q("delete from pos_puntos_movimientos where order_id in (%s)" % ids)
q("delete from pos_domi_tiempos where order_id in (%s)" % ids)
print('  puntos y tiempos de cocina, limpios')
#  3) borrar el pedido: el disparador devuelve los insumos
q("delete from pos_orders where id in (%s)" % ids)
print('  pedidos borrados (los insumos vuelven solos)')
#  4) el rastro del inventario, ya cumplido su trabajo
q("delete from iv_movimientos where order_id in (%s)" % ids)
print('  rastro de inventario, limpio')
#  5) la caja
if SESION:
    q("delete from pos_sessions where id='%s'" % SESION)
    print('  caja borrada (sus movimientos, en cascada)')

# ── 7. COMPROBAR, NO SUPONER ──────────────────────────────────────────────
print('\n══ COMO QUEDARON LOS INSUMOS ══')
for a in antes[:10]:
    d = q("select stock, stock_servicio from iv_existencias where insumo_id='%s'" % a['insumo_id'])
    if d:
        print('  %-34s %s -> %s   (servicio %s -> %s)' % (
            a['nombre'][:34], a['stock'], d[0]['stock'], a['stock_servicio'], d[0]['stock_servicio']))
q_rest = q("select count(*) c from pos_orders where id in (%s)" % ids)[0]['c']
print('\npedidos que quedan de esa lista: %s  (debe ser 0)' % q_rest)
