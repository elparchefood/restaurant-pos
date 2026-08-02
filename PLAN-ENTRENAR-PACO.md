# Cómo vende Sergio — material para entrenar a Paco

**Base:** las 39 conversaciones que terminaron en pedido, del 16 de julio al 1 de
agosto. **Todas las atendió Sergio a mano** — Paco no ha tomado ninguna. Este
documento no es una lista de errores: es **el método que funciona**, escrito
para que Paco lo aprenda.


---

## 0. REGLA DE ARQUITECTURA — nada de esto va quemado en el código

**Instrucción de Sergio (2026-08-01), y manda sobre todo lo demás de este
documento:**

> *"Nada de mi método va a ir hardcodeado. Todo va a ir directamente en el flujo
> de canvas del asistente, para que cada restaurante pueda colocar sus propios
> datos, su propio entrenamiento, su propio estilo... si hay cosas que sí hay
> que cambiar internamente en el código lo puedes hacer, pero que sea general,
> es decir que le pueda servir a todos los restaurantes... El orden de la
> atención, los datos necesarios para hacer el pedido, todo eso lo determina
> cada restaurante. Incluso Paco se llama el asistente de mi restaurante, pero
> otros le pondrán otro nombre, entonces el nombre Paco tampoco puede ir
> hardcodeado."*

### Cómo se traduce eso
- **El método de las secciones 1 a 3 NO se programa.** Se carga como el flujo
  por defecto en el canvas del asistente, y cada restaurante lo edita: el orden
  de los pasos, qué datos pide, qué ofrece y cómo habla.
- **En el código solo va el MOTOR**, que debe servirle a cualquier restaurante:
  saber leer el flujo del canvas, ejecutar los pasos en el orden que el dueño
  puso, ofrecer lo que el dueño marcó como upsell, y hablar con el tono que el
  dueño configuró.
- **El nombre del asistente es un dato**, no una constante. "Paco" es de El
  Parche; otro restaurante le pondrá otro.
- Lo que hoy es de El Parche (frases, productos, cuenta de pago, ubicación)
  pasa a ser **el ejemplo de arranque**, no la regla.

### Auditoría: lo que HOY está quemado y hay que sacar
Revisado el 2026-08-01. **Lo bueno:** no hay ningún `tenant_id` ni `branch_id`
de El Parche quemado en el front — eso ya estaba bien resuelto.

| Dónde | Qué está quemado | Riesgo |
|---|---|---|
| `chat-ia.html:195` | *"Asistente (Paco)"* | El nombre, visible en pantalla |
| `configuracion.html:1401` | *"Paco no les responde…"* | El nombre, visible |
| `chat-ia.js:1868` | **Coordenadas y dirección de El Parche** como semilla de la respuesta rápida de ubicación | Otro restaurante arrancaría mandando el mapa de El Parche |
| `chat-ia.js:1871` | **La cuenta de pago `0092726260`** en la respuesta rápida del QR | Otro restaurante pediría plata a la cuenta de Sergio |
| `chat-ia.js:2792` | *"…redimirlos en productos de El Parche"* | Texto de puntos |
| `configuracion.js:5411` | *"Ventas · El Parche Food"* | |
| `domicilios.js:1385 y 1647` | *"Reparte un domiciliario de El Parche"* | |
| `historial.js:357` | *"El Parche Food"* en el encabezado | |

**Los dos graves son la ubicación y la cuenta de pago**: si otro restaurante
instala Cobra hoy, arranca con el mapa y la cuenta bancaria de El Parche.

`PacoState` en el código del asistente es solo el nombre interno de una
estructura — no se ve en pantalla y no urge, pero conviene renombrarlo cuando
se toque ese archivo.

### Regla para todo lo que se haga de aquí en adelante
Antes de escribir una frase, un producto o un dato en el código, la pregunta es:
**¿esto es igual para todos los restaurantes?** Si la respuesta es no, va a la
configuración o al canvas, nunca al código.

---

## 1. El método, paso a paso

Medido sobre las 39 conversaciones exitosas. El porcentaje es en cuántas aparece
cada paso:

| Paso | Aparece en | Qué significa |
|---|---|---|
| Saludar | 97% | Casi siempre, y con la hora del día |
| Invitar a pedir | 87% | "¿Qué se te antoja?" |
| Preguntar tamaño | 28% | **Solo cuando el cliente no lo dijo** |
| Preguntar dirección | 53% | Solo si es domicilio y no la dio |
| Preguntar nombre | 66% | |
| **Confirmar el pedido** | **100%** | **Nunca falla. Es la columna vertebral** |
| **Dar el total desglosado** | **100%** | **Nunca falla** |
| Pedir el pago | 87% | QR + llaves, o efectivo |
| Quedar pendiente del comprobante | 76% | |
| Avisar "en preparación" | 30% | |
| Avisar "en camino" | 76% | |
| Avisar los puntos ganados | 89% | |

### Lo que NUNCA se salta: confirmar y totalizar

En **las 39 de 39** hay una confirmación del pedido antes de cobrar y un total
dicho con claridad. Ese es el corazón del método:

> *"Familiar maicitos especial mixta correcto?"*
> *"ya te confirmo el total, es personal premium mixta correcto?"*
> *"Para San Bernardino cierto?"*

Y el total **siempre separa el domicilio**:

> *"Con gusto, serían $35.000 de tu pedido y $5.000 del domicilio,
> total $40.000 😊 En un momento enviamos tu pedido 🍟"*

### Lo que solo se pregunta si hace falta

Tamaño 28%, dirección 53%, nombre 66%. **No se pregunta lo que el cliente ya
dijo** — verificado: en 88 conversaciones eso pasó 1 sola vez. Paco tiene que
respetar esa regla, que ya cumple.

---

## 2. La voz de Sergio

Frases reales, con su frecuencia. Esta es la personalidad que Paco debe imitar:

**Abrir**
- *"Buenas noches, cuéntame ¿En qué te podemos ayudar? ☺️🍟"* (17)
- *"¿Qué se te antoja? 🍟☺️"* (20)
- *"Claro que si 🍟¿Qué deseas? ☺️"* (18)

**Pedir datos**
- *"Con mucho gusto, ¿para dónde va tu pedido? 😊"* (19)
- *"A nombre de quien se recibe el pedido?🍟"* (26)

**Cobrar**
- *"Te comparto el código QR para que puedas realizar tu pago ☺️ O si deseas, mediante llaves…"* (31)
- *"Con gusto, me confirmas si el pago es transferencia o efectivo? para pasar tu pedido a cocina🍟☺️"* (11)
- *"Quedo pendiente del comprobante para poderte preparar ☺️"* (16)

**Acompañar y cerrar**
- *"Tu pedido está en preparación 😋 Apenas esté en camino, te avisamos"* (11)
- *"🛵 Tu pedido está en camino, esperamos que lo disfrutes 😋"* (27)
- *"Con muchísimo gusto, estamos para servirte 🫶🏼☺️"* (12)

**Patrones de la voz:**
- Empieza casi siempre con **"Con gusto" / "Con mucho gusto" / "Claro que sí"**
- Emojis suaves y constantes: 🍟 ☺️ 😊 😋 — nunca recargado
- Trato de **tú**, cálido pero no meloso
- Frases cortas, una idea por mensaje

---

## 3. Lo único que sí se le escapa: ofrecer más

**Es el hallazgo con plata directa.**

| | Pedidos | Ticket promedio |
|---|---|---|
| Con bebida | 8 | **$41.938** |
| Sin bebida | 59 | $35.441 |

**Una bebida sube el ticket $6.500.** Y solo **1 de las 39** conversaciones
ofreció algo extra:

> *"Listo 👍. Perfecto, ¿deseas adicionar alguna bebida, salchicha ranchera,
> súper queso o alguna de nuestras adiciones?"*

Solo el **12% de los pedidos** llevan bebida. Si Paco ofreciera siempre —justo
después de confirmar el pedido y antes de dar el total— y llegara al 40%,
serían **unos 19 pedidos más con bebida**, es decir **~$123.000 adicionales** en
el mismo periodo, sin un cliente nuevo.

**Es lo más fácil de entrenar y lo que más rinde.**

**Y es trabajo del asistente, no del dueño.** Sergio: *"con Paco podemos
ofrecer siempre upsell, yo no lo hago porque debo contestar y atender el local
al tiempo"*. Ahí está el punto: **el que atiende el local no puede acordarse de
ofrecer; el asistente no se ocupa nunca.** Por eso este paso rinde tanto en el
asistente y casi nada exigiéndoselo a una persona.

**Ojo (ver sección 0):** qué se ofrece, cuándo y con qué palabras lo define cada
restaurante en su flujo. El código solo debe saber **ejecutar** el paso de
ofrecer, no qué ofrecer.

---

## 4. Cómo entrenar a Paco, en orden

### Fase 1 — Que copie el esqueleto
Grabar el método como el flujo obligatorio de Paco:

1. Saludar según la hora
2. Invitar a pedir
3. **Preguntar SOLO lo que falte** (tamaño, variante, dirección, nombre)
4. **Ofrecer algo más** ← el paso nuevo
5. **Confirmar el pedido en voz alta** ("Familiar premium mixta, correcto?")
6. **Dar el total desglosado**, separando el domicilio
7. Pedir el pago (QR / llaves / efectivo)
8. Quedar pendiente del comprobante
9. Avisar "en preparación" → "en camino"
10. Avisar los puntos ganados

Los pasos 5 y 6 son **obligatorios**: en 39 de 39 estuvieron.

### Fase 2 — Que hable como Sergio
Cargar las frases de la sección 2 como el banco de respuestas de Paco, con
variantes para que no suene a robot. La regla de tono: **"Con gusto" al abrir,
un emoji, una idea por mensaje.**

### Fase 3 — Que ofrezca siempre
Después de confirmar el pedido y antes del total, ofrecer bebida o adición.
Una sola vez, sin insistir.
**Se mide:** % de pedidos con bebida, de 12% a 40%.

### Fase 4 — Comparar a Paco contra Sergio
Ya se guarda `origen` en cada mensaje (bot / humano / sistema). Con eso, cada
semana se puede mirar:
- Qué conversaciones cerró Paco solo y cuáles tocó rescatar a mano
- En qué paso se cae cuando falla
- Si sus pedidos tienen el mismo ticket promedio que los de Sergio

**La meta no es que Paco conteste rápido —eso ya lo hace—, sino que cierre con
el mismo ticket y la misma calidez.**

---

## 5. Notas de criterio (dichas por Sergio)

- **Que un cliente repita algo no es una falla.** Si dice "con poquita salsa"
  tres veces, es porque quiere recalcarlo. Paco debe **tomar la nota y
  confirmarla**, no tratarlo como un problema.
- **No preguntar lo que ya se dijo.** Es ilógico y molesta.
- **Todos los pedidos de estos días se recibieron con éxito.** El estándar está
  puesto; Paco tiene que igualarlo, no reinventarlo.
