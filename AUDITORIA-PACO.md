# Auditoría de Paco — estado real y plan para que converse sin perder los datos

**Fecha:** 14-ago-2026 (noche) · **Auditado contra el sistema vivo**, no de
memoria: configuración leída de `ia_config` en la base, motor leído de
`delay-reply/index.ts` (v272), uso real contado en `chat_messages`.

**La pregunta de Sergio que esta auditoría responde:** *"¿qué hay que mejorar,
reforzar o cambiar para que Paco pueda conversar realmente, pero sin perder el
rumbo de los datos que debe recoger?"*

---

## 1. Inventario: qué hay hoy

### 1.1 Las 6 llamadas al modelo (todas `gpt-4o-mini`)

| # | Dónde | Qué hace | Tipo |
|---|---|---|---|
| 1 | `index.ts:894` | **Clasificador de intenciones** — carta, precio, ubicación, horario, pedir, pago, entrega, confirma, rechaza_mas, agregados | Entender (parcial) |
| 2 | `index.ts:3581` | Extraer el producto del mensaje | Recoger datos |
| 3 | `index.ts:3711` | El "lector": JSON completo del pedido (producto, cantidad, adiciones, dirección, nombre, pago, quitar) | Recoger datos |
| 4 | `index.ts:5363` | **La respuesta conversacional** — con historial (15 mensajes) y un prompt de ~25 reglas | Redactar |
| 5 | `index.ts:5630` | Redactar el resumen (solo si el resumen está en modo conversacional; hoy está en fija) | Redactar |
| 6 | `index.ts:600` | Recordatorio de comprobante pendiente | Redactar |

Más la transcripción de audios (Whisper, `:744`).

### 1.2 La configuración guardada (sucursal El Parche)

| Campo | Estado | Nota |
|---|---|---|
| `instrucciones` (1.544 chars) | ✅ Bueno | Personalidad, vocabulario del barrio ("salchi", "veci", "tran"), reglas de conocimiento. **Es lo más cercano a una misión que Paco tiene** |
| `flujo_saludo` | 🔴 | Conversacional + "puedes indicar que te llamas Paco" — BUG 1 del 14-ago |
| `flujo_pasos` (7 pasos) | ✅ | tamaño, tipo, adiciones, upsell, dirección, nombre, pago. Casi todos en modo fija |
| `frases` (30 frases) | 🟡 | Varias vacías (`producto_no_existe`, `confirmar_direccion`, `verificando_pago`) → caen al texto quemado en el código |
| `faq` (14 preguntas) | 🔴 | **Datos rotos y contradicciones** — ver hallazgo H |
| `modo_asistente` | `on` | Dato, no recomendación: el modo lo decide Sergio |
| Historial que ve el modelo | 15 mensajes | Suficiente para el hilo de un pedido |

### 1.3 Uso real a hoy

222 conversaciones; 1.497 mensajes de clientes, 564 respondidos por humanos,
260 por el bot, 113 del sistema.

---

## 2. Hallazgos, del más grave al menor

### A. El bot de los BUGS 5 y 6 no desobedeció: obedeció una instrucción equivocada

`index.ts:5213`, dentro del prompt que arma la respuesta:

> *"Si SOLO está saludando, **agradeciendo** o haciendo charla (hola, buenas,
> **gracias**, ¿cómo estás?): responde breve y amable en 1 oración y termina
> con esta frase EXACTA: '¿Qué se te antoja?'"*

D.F.G dijo "está un poquito caro, gracias" y Paco contestó "Con mucho gusto.
¿Qué se te antoja?" — **exactamente lo ordenado**. La cortesía la puso
`instrucciones` (que manda responder agradecimientos con "con mucho gusto");
la pregunta de venta la mandó esta regla. **No existe el concepto de
despedida en ninguna parte del sistema**: "gracias" está cableado a terminar
con la pregunta de venta, siempre.

Esto reencuadra el problema: no es que el modelo no entienda — es que las
instrucciones que recibe no contemplan que una conversación pueda estar
terminando.

### B. El clasificador de intenciones existe y es bueno, pero le faltan justo las intenciones humanas

El clasificador (`:894`) distingue con cuidado carta/precio/ubicación/
horario/pedir/pago/entrega/confirma/rechaza_mas/agregados — está bien escrito
y con ejemplos colombianos reales. Pero **no tiene**: despedida,
agradecimiento final, queja, charla fuera de tema, "no entendí", "quiero
hablar con una persona". Todo lo humano que no sea transaccional no tiene
casilla, y lo que no tiene casilla cae al guion.

Además el clasificador **no ve el historial**: recibe solo el mensaje del
momento (900 chars). "Las gracias" a secas no se puede clasificar sin saber
qué venía antes.

### C. Hay DOS detectores de intención, y el tonto decide antes que el listo

El bypass v270 (`:2775`) decide si el cliente "preguntó algo" con una **regex
de palabras clave** (`cuanto|precio|vale|tienen|...`). Esa regex vive al lado
del clasificador inteligente y decide ANTES que él. Es el patrón que ya mordió
tres veces (total de transferencia, campos del pedido, dirección del resumen):
dos piezas de código computando lo mismo terminan divergiendo.

### D. La rama "producto no existe" ignora al clasificador

Ya anotado como BUG 5 en CIERRE-PROYECTO: el bucle de palabras (`:2538`)
declara "producto inexistente" a cualquier palabra desconocida de 4+ letras
("información" → "no manejamos un producto con ese nombre"), aunque el
clasificador haya dicho `carta:true` o `precio:true` en la misma pasada.

### E. El prompt de respuesta es una pila de ~20 prohibiciones que nacieron como parches

"NUNCA generes un resumen", "JAMÁS digas pago confirmado", "NUNCA repitas los
datos"… Los propios comentarios del código admiten el problema: *"en el prompt
ya había DOS reglas prohibiéndolo y aun así lo hacía"*. La arquitectura ha
oscilado entre dos extremos — modelo con 25 reglas (incumplibles a veces) o
sin modelo (v270, frase fija tal cual) — porque falta la pieza del medio:
decidir QUÉ está pasando antes de decidir QUÉ decir.

### F. Hay una regla explícitamente anti-conversacional

`:5265`: *"Si el cliente pregunta algo que NO sea sobre el menú, pedido,
domicilio, horarios o pagos: **ignora completamente esa pregunta**. Actúa como
si ese contenido no existiera."* Un humano jamás hace eso: reconoce en una
frase y redirige. Ignorar en seco es parte de la sensación de robot.

### G. Sin contador de intentos (BUG 7, ya anotado)

Solo la desambiguación de producto tiene `intentos >= 2 → soltar`. Ningún otro
paso lo tiene: la dirección se puede preguntar 4 veces idénticas (pasó, está
documentado en el propio código).

### H. Datos rotos y contradicciones dentro de la configuración

1. **Dos llaves Nequi distintas.** `frases.datos_nequi` dice **0092726260**;
   la FAQ ("¿Me regalas el Nequi?") dice **0089912015**. Una de las dos está
   mal, y es plata: un cliente puede transferir a la cuenta equivocada.
   **Solo Sergio sabe cuál es la buena.**
2. **Precios comidos en la FAQ.** "¿Cuánto cuesta la Coca-Cola personal?" →
   "**.000** ☺️" y "la salsa de cheddar tiene un costo adicional de **.000**".
   Los dígitos se perdieron en algún guardado. Hoy el modelo recibe esas
   respuestas rotas como verdad.
3. **La FAQ contradice a las instrucciones.** Instrucciones: *"Nunca des un
   tiempo exacto de entrega"*. FAQ: *"¿Cuánto se demoran?" → "Unos 30 minutos
   aproximadamente"*. El modelo recibe ambas en el mismo prompt.
4. **Datos en prosa que se van a pudrir.** Las bebidas no disponibles (Pepsi,
   limonada cerezada…) están escritas dentro de `instrucciones`; el día que
   vuelvan a estar disponibles, nadie va a acordarse de ese texto.

### I. Lo que está BIEN y no hay que tocar

- **El verificador** de adiciones contra los grupos de modificadores.
- **Los precios y totales** salen del catálogo, nunca del modelo.
- **El lector** (extracción de datos) con temperatura 0.
- **El historial marcado**: lo que respondió un humano va etiquetado para que
  el bot no lo contradiga.
- **La seguridad de pagos** (nunca dar por verificado un pago de palabra).
- **El banco de pruebas** y su repetibilidad.
- Las `instrucciones` como texto de personalidad: son buenas; el problema es
  que casi nunca llegan (solo entran en la llamada conversacional, y el bypass
  v270 hace que muchos mensajes ni pasen por ahí).

---

## 3. El plan — cuatro fases, en este orden

La idea rectora, que ya quedó escrita en CIERRE-PROYECTO: **el guion sigue
mandando en lo que se construye (pedido, precios, totales); el modelo pasa a
mandar en lo que se entiende.** Y "entender" incluye saber su misión.

### FASE A — Darle la casilla de "entender" (ataca BUGS 5 y 6, hallazgos A-D)

1. **Ampliar el clasificador** con las intenciones humanas:
   `despedida`, `agradecimiento_final`, `queja`, `fuera_de_tema`,
   `no_entendio`, `quiere_humano`. Sigue siendo temperatura 0 y JSON —
   repetible en el banco de pruebas.
2. **Darle memoria corta al clasificador**: los últimos 4-6 mensajes, no solo
   el actual. "Las gracias" después de "está caro" es despedida; después de
   "te mando el domicilio gratis" es otra cosa.
3. **Enrutar ANTES del bypass v270**: si la intención es despedida → frase de
   despedida (nueva, configurable en Mensajes) y se acabó; si es queja →
   reconocer y ofrecer humano; si es pregunta → responderla y LUEGO el paso.
   El bypass de frase fija queda para lo que es: el cliente está en el flujo y
   toca preguntar el siguiente dato.
4. **Jubilar la regex `PREGUNTA_DEL_CLIENTE`**: esa decisión pasa al
   clasificador. Un solo detector de intención en todo el motor.
5. **Encadenar la rama "producto no existe" al clasificador**: solo se dice
   "no manejamos eso" si la intención fue `pedir` Y hay una palabra candidata
   a comida. Pregunta de precio → se responde el precio (dato de la base).
6. **Quitar la regla de ignorar lo fuera de tema** (`:5265`) y reemplazarla:
   reconocer en una frase, sin entrar al tema, y redirigir con calidez.

### FASE B — Nunca en bucle (ataca BUG 7, hallazgo G)

7. **Contador de intentos por paso** en el estado (la pieza ya existe para
   producto ambiguo; generalizarla).
8. **Frases de segundo y tercer intento**, fijas y configurables en Mensajes,
   distintas de la primera ("Me falta solo la dirección 😊" / "Perdón, no
   logro entenderte. ¿Me la escribes de nuevo o te contacto con alguien del
   local?").
9. **Al cuarto: humano.** `human_takeover` + motivo visible, como ya se hace
   con el pago fallido. Silencio insistente jamás.

### FASE C — Misión y saludo (ataca BUG 1, hallazgo A de fondo)

10. **El saludo a modo fija** con el texto acordado (presentarse como Paco,
    asistente virtual, y pedir el pedido "lo más claro posible", con "qué
    deseas"). **Antes**: comprobar el pendiente #2 (el guardado del canvas
    que pisa configuración) para que no lo revierta.
11. **Escribirle la misión** al prompt conversacional, una vez, arriba de
    todo: quién es, para qué está (que el cliente pida fácil y quede
    contento), y qué hacer ante lo imprevisto (responder breve, redirigir,
    y si no puede, pasar a un humano). Las ~20 prohibiciones se podan: las
    que la arquitectura nueva vuelve innecesarias, se van.

### FASE D — Limpiar los datos de la configuración (hallazgo H)

12. **La llave Nequi**: preguntar a Sergio cuál es la buena y dejar UNA, y
    que la FAQ la lea de la misma fuente que la frase (no dos copias).
13. **Arreglar los precios comidos** de la FAQ — y mejor: que precio de
    producto se responda desde el catálogo, no desde texto escrito a mano.
14. **Resolver la contradicción del tiempo de entrega** (decide Sergio: o la
    FAQ deja de prometer 30 minutos, o las instrucciones dejan de prohibirlo).
15. **Sacar las bebidas no disponibles de la prosa**: la disponibilidad vive
    en el catálogo, que ya la sabe.

### Qué NO se toca (para no repetir la historia)

- El lector, el verificador, los precios de catálogo, el resumen fijo, la
  seguridad de pagos: **intactos**.
- El bypass v270 **no se revierte**: se le pone el enrutador delante. La
  frase fija sigue saliendo tal cual la primera vez que toca preguntar.
- Nada se prueba en producción: todo pasa primero por el banco
  (`delay-reply-banco`), repitiendo las conversaciones reales del 14-ago
  (Jorge Piamba y D.F.G) como casos de regresión, más los casos del 12-13-ago
  para confirmar que no vuelven.

### Decisiones que son de Sergio (el plan las deja marcadas)

1. **¿Cuál llave Nequi es la buena?** 0092726260 o 0089912015.
2. **El texto exacto del saludo** y de las frases de despedida, segundo
   intento y tercer intento (se le proponen borradores; él aprueba o edita
   en Mensajes).
3. **El tiempo de entrega**: ¿se promete "unos 30 minutos" o no se promete
   nada?

---

*Nada de lo anterior se implementó: esta es la auditoría y el plan. La
implementación empieza cuando Sergio dé el orden de arranque, fase por fase,
probando en el banco entre cada una.*
