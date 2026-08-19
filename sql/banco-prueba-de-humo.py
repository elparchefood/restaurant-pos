# -*- coding: utf-8 -*-
"""
PRUEBA DE HUMO DE VERDAD.

Que la funcion "arranque" no dice nada: una llamada con un id que no existe
sale por la puerta de atras antes de tocar el codigo. El 19-ago una variable
usada antes de existir dejo a Paco MUDO y las tres pruebas pasaron el arranque
igual. Esto manda un mensaje de verdad y exige respuesta.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from runner import corre, sql, q
TEL = "573001009999"
c = corre(TEL, "HUMO", ["Hola, una hamburguesa sencilla para recoger"])
filas = sql("select count(*) n from chat_messages where conversation_id=%s and direction=%s" % (q(c), q("out")))
n = int(filas[0]["n"])
sql("delete from chat_messages where conversation_id=%s" % q(c))
sql("delete from chat_ai_queue where conversation_id=%s" % q(c))
sql("delete from chat_conversations where id=%s" % q(c))
if n == 0:
    sys.exit("*** PACO SE QUEDO MUDO — no se sube ***")
print("humo ok: contesto")
