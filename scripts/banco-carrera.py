# -*- coding: utf-8 -*-
"""La prueba de la carrera: dos copias del motor, a la vez, sobre la misma
conversación — que es exactamente lo que le pasó a Verónica y a Sara el 23-ago.

Antes del candado: las dos contestan (2 mensajes, contradictorios).
Con el candado:    contesta UNA (1 mensaje) y la otra se retira en silencio.

Y comprueba lo contrario, que es lo que da miedo: que no se queden calladas
las dos. Una copia sola tiene que seguir contestando.
"""
import json, subprocess, time, io, threading, os

REF   = 'tblujfduscslxjmrjbdr'
# EL TOKEN NO VA ESCRITO AQUI: este repositorio es PUBLICO. Se pasa al correr,
# por el entorno:   SUPABASE_PAT=... python scripts/banco-carrera.py
#
# Se intento subir con el token dentro el 23-ago-2026 y GitHub freno el push.
# Bien frenado: en un repositorio publico eso es la llave de la base de TODOS
# los restaurantes.
TOKEN = os.environ.get('SUPABASE_PAT', '')
if not TOKEN:
    raise SystemExit('Falta SUPABASE_PAT en el entorno.')
FN    = 'https://%s.supabase.co/functions/v1/delay-reply-banco' % REF
SQLU  = 'https://api.supabase.com/v1/projects/%s/database/query' % REF
D     = ('C:/Users/USUARIO/AppData/Local/Temp/claude/C--Prueba-Claude-Code/'
         'ee17ab88-e9a2-4726-b5f2-2ce8a49c2962/scratchpad/')
BRANCH = '66e5f12d-fd16-455a-a6c0-9694aa6fb01b'
ETIQ   = '*** PRUEBA - NO ES REAL *** '


def sql(q, tag='c'):
    io.open(D + '_q_' + tag + '.json', 'w', encoding='utf-8').write(json.dumps({'query': q}))
    r = subprocess.run(['curl', '-s', '-X', 'POST', '-H', 'Authorization: Bearer ' + TOKEN,
                        '-H', 'Content-Type: application/json',
                        '--data-binary', '@' + D + '_q_' + tag + '.json', SQLU],
                       capture_output=True, text=True, encoding='utf-8')
    d = json.loads(r.stdout)
    if isinstance(d, dict):
        raise SystemExit('SQL: ' + json.dumps(d)[:300])
    return d


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


TENANT = sql("select tenant_id from branches where id=%s" % q(BRANCH))[0]['tenant_id']


def montar(tel, texto):
    """Deja una conversación con un mensaje y UNA fila en la cola.

       EL DISPARO VA A 5 SEGUNDOS, no a "ya mismo", y ahí está toda la
       prueba. La carrera solo existe DURANTE la espera: con el disparo
       ya vencido, la primera copia marca el trabajo al instante y la
       segunda encuentra la cola vacía y se va sola — el código viejo ya
       se salvaba solo en ese caso. Con la espera, las dos duermen, las
       dos despiertan y las dos siguen: ahí es donde se rompe.

       Se comprobó: con el disparo a "ya mismo" esta prueba daba BIEN
       incluso SIN el candado, o sea que no probaba nada."""
    conv = sql("""insert into chat_conversations (tenant_id, branch_id, channel, contact_name,
                    contact_handle, status) values (%s,%s,'whatsapp',%s,%s,'open') returning id"""
               % (q(TENANT), q(BRANCH), q(ETIQ + 'carrera'), q(tel)))[0]['id']
    sql("""insert into chat_messages (conversation_id, tenant_id, direction, origen, body, sent_at)
           values (%s,%s,'in','cliente',%s, now())""" % (q(conv), q(TENANT), q(texto)))
    sql("""insert into chat_ai_queue (conversation_id, branch_id, tenant_id, from_phone,
             phone_id, access_token, batch_start, fire_at, processed)
           values (%s,%s,%s,%s,'BANCO_DE_PRUEBAS','BANCO_DE_PRUEBAS', now(),
                   now() + interval '5 seconds', false)"""
        % (q(conv), q(BRANCH), q(TENANT), q(tel)))
    return conv


def disparar(conv, veces):
    """Lanza `veces` copias del motor a la vez, como hace meta-webhook cuando
       dos mensajes llegan pegados."""
    hilos = []
    for _ in range(veces):
        t = threading.Thread(target=lambda: subprocess.run(
            ['curl', '-s', '-X', 'POST', '-H', 'Content-Type: application/json',
             '-d', json.dumps({'convId': conv}), FN],
            capture_output=True, text=True, timeout=180))
        hilos.append(t)
    for t in hilos:
        t.start()          # todos a la vez, sin esperas entre medias
    for t in hilos:
        t.join()


def respuestas(conv):
    return sql("""select body from chat_messages where conversation_id=%s
                  and direction='out' order by sent_at""" % q(conv), 'r')


def limpiar():
    sql("""delete from chat_messages where conversation_id in
             (select id from chat_conversations where contact_name like '*** PRUEBA%');
           delete from chat_ai_queue where conversation_id in
             (select id from chat_conversations where contact_name like '*** PRUEBA%');
           delete from chat_conversations where contact_name like '*** PRUEBA%';
           select 1 as ok""", 'l')


if __name__ == '__main__':
    limpiar()

    print('== DOS copias a la vez (lo que le paso a Veronica) ==')
    c1 = montar('573009990001', 'Buenas noches, me regalas una salchipapa premium mixta personal')
    disparar(c1, 2)
    time.sleep(12)
    r1 = respuestas(c1)
    print('   respuestas:', len(r1), '(se espera 1)')
    for x in r1:
        print('     <', (x['body'] or '').replace('\n', ' / ')[:110].encode('ascii', 'replace').decode())

    print()
    print('== UNA sola copia (que no se quede muda) ==')
    c2 = montar('573009990002', 'Buenas noches, me regalas una salchipapa premium mixta personal')
    disparar(c2, 1)
    time.sleep(12)
    r2 = respuestas(c2)
    print('   respuestas:', len(r2), '(se espera 1)')
    for x in r2:
        print('     <', (x['body'] or '').replace('\n', ' / ')[:110].encode('ascii', 'replace').decode())

    print()
    print('VEREDICTO:', 'BIEN' if len(r1) == 1 and len(r2) == 1 else 'REVISAR')
    limpiar()
    print('conversaciones de prueba borradas')
