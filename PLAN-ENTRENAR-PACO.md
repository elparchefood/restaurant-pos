# Plan para entrenar a Paco

**Hecho el 2026-08-01 sobre datos reales:** 88 conversaciones, 1.540 mensajes,
del 16 de julio al 1 de agosto. Nada de lo que sigue es supuesto — todo sale de
lo que de verdad escribieron los clientes.

---

## 1. La foto de hoy

| | |
|---|---|
| Conversaciones | 88 |
| Terminaron en pedido | 39 (**44%**) |
| Mensajes para cerrar UN pedido | **33,5 de promedio** |
| Respuesta típica | 18 segundos (mediana) |
| Casos que tardaron más de 10 min | 48 |
| Mensajes que nunca se respondieron | 22 |

**Cuándo escriben** (el 69% entre 6 y 9 de la noche):

```
18:00  ██████████████████████████ 102
19:00  ████████████████████████████████████████ 193
20:00  █████████████████████████████ 116
21:00  ████████████████████████████ 114
22:00  ██████████ 39
```

**De qué hablan**, en orden: saludo (163) · pedir (123) · **pago/Nequi (94)** ·
carta y precios (61) · domicilio (21) · horarios (10) · demoras (9).

---

## 2. Los cinco hallazgos

### 🔴 1. Los anuncios traen gente que NO compra — y es el hueco más grande

| De dónde viene | Conversaciones | Pedidos | Conversión |
|---|---|---|---|
| Escribió directo | 56 | 38 | **68%** |
| **Vino de un anuncio** | **32** | **1** | **3%** |

**32 personas tocaron el anuncio y solo 1 compró.** Todas abren igual:
*"¡Hola! Quiero más información."* — y casi siempre reciben **una sola
respuesta** y se pierden.

No es que sean malos clientes: es que llegan sin saber qué vendemos y se les
contesta con un *"¿en qué te podemos ayudar?"* que les devuelve la pelota. El
que escribe directo ya sabe qué quiere y por eso cierra al 68%.

**Esto es lo primero que hay que entrenar.** Si esos 32 convirtieran aunque
fuera al 20%, serían ~6 pedidos más por semana sin gastar un peso extra en
publicidad.

### 🔴 2. Se ignoran preguntas que el cliente ya hizo

Caso real (01/08, pedido de Ulby):

```
23:37  cliente:  ...una salchipapa premio mixta con poquita salsa
23:37  cliente:  Me regalas el número de Nequi      <-- preguntó aquí
23:38  Paco:     ¿Cómo la deseas? Familiar / Personal
23:39  Paco:     ¿para dónde va tu pedido?
23:40  Paco:     ¿A nombre de quién?
23:43  cliente:  Ah qué número puedo pagar          <-- tuvo que repetirla
23:46  Paco:     [por fin le da el dato]
```

El cliente preguntó por el Nequi y siguió contestando el interrogatorio durante
**9 minutos** hasta que le tocó repetir. Paco atiende **un tema a la vez** y
descarta lo demás.

### 🟠 3. Las notas del pedido se pierden

En esa misma conversación el cliente dijo **"con poquita salsa"** desde el
primer mensaje. Nadie la registró, y a las 23:52 —con el pedido ya en
preparación— tuvo que repetirla.

### 🟠 4. Son 33 mensajes para vender una salchipapa

El flujo pregunta de a un dato: tamaño → dirección → nombre → pago →
comprobante. Cuando el cliente **ya lo dijo todo en su primer mensaje**, se le
vuelve a preguntar igual.

### 🟡 5. Hay 22 mensajes sin responder — pero la mitad no son clientes

Revisados uno por uno: 8 son **mensajes automáticos de otros negocios**
(INTERDOMICILIOS, Grijalba Motors, ENVIENTREGA) y del otro número de El Parche.
Los que sí duelen son pocos pero graves:

- *"Buenas noches / Para pedir un domicilio"* (28/07) — **nunca se respondió**
- *"Mira el domi ya salió?"* (28/07) — sin respuesta
- *"Me avisas cuando salga el pedido por favor"* — sin respuesta

---

## 3. El plan, en cuatro fases

### Fase 1 — Que no se pierda nada de lo que el cliente dijo
*Ataca los hallazgos 2, 3 y 4.*

1. **Leer TODO el mensaje, no solo el dato que se está pidiendo.** Si el cliente
   escribe *"una salchipapa premium mixta personal con poquita salsa, para
   Bello Horizonte, pago con Nequi"*, Paco debe extraer producto, tamaño,
   variante, nota, dirección y forma de pago **de una sola vez**, y preguntar
   solo lo que falte de verdad.
2. **Cola de preguntas pendientes.** Si el cliente pregunta algo mientras se le
   toma el pedido (el Nequi, el precio, cuánto se demora), se responde **en el
   mismo mensaje** en que se le pide el siguiente dato. Nunca se descarta.
3. **Las notas van al pedido.** "Con poquita salsa", "sin cebolla", "bien
   caliente" tienen que quedar en la comanda desde que se dicen.

**Cómo se mide:** mensajes para cerrar un pedido, de 33,5 a menos de 15.

### Fase 2 — Rescatar a los que vienen del anuncio
*Ataca el hallazgo 1, el de más plata.*

Cuando el primer mensaje sea *"Quiero más información"* (o llegue por anuncio),
la respuesta **no puede ser una pregunta abierta**. Debe:
1. Saludar y **mostrar la carta de una vez** (ya sabemos que ese es el 100% de
   lo que quieren, aunque no lo pidan).
2. Decir en una línea qué vendemos y desde cuánto.
3. Cerrar con una pregunta fácil de contestar: *"¿Te antojas de algo?"*

**Cómo se mide:** conversión de leads de anuncio, de 3% a 20% o más.

### Fase 3 — Que nadie se quede sin respuesta
*Ataca el hallazgo 5.*

1. **Aviso de mensaje sin responder**: si un mensaje entrante lleva más de X
   minutos sin respuesta en horario de atención, que salte la alerta en Cobra.
2. **Reconocer los mensajes de otros negocios** (los automáticos de
   domiciliarios y proveedores) para que no ensucien la bandeja ni el conteo.
3. Responder los **"¿ya salió mi pedido?"** con el estado real, que el sistema
   ya lo tiene.

### Fase 4 — Aprender de lo que ya pasó
1. Con `origen` en cada mensaje (bot / humano / sistema) ya se puede medir
   **qué contesta Paco y qué toca contestar a mano**. Eso señala exactamente
   qué falta entrenar.
2. Guardar las conversaciones que **Sergio resolvió a mano** como ejemplos: son
   la mejor guía de cómo debe contestar.
3. Revisar cada semana los casos donde el cliente tuvo que repetir algo.

---

## 4. Lo que ya está a favor

- **Responde en 18 segundos** (mediana). La velocidad no es el problema.
- **68% de conversión** en quien escribe directo. El flujo funciona cuando el
  cliente llega decidido.
- Ya entiende **intenciones** y no texto exacto (carta, ubicación, pago,
  entrega), así que la base para las fases 1 y 2 está puesta.
- Los pedidos vienen creciendo: **19 pedidos y $682.500 el 26/07**, el mejor día.

---

## 5. Por dónde empezar

**La fase 2 primero.** Es la que más plata deja (32 personas desperdiciadas), es
la más fácil de hacer —una regla para un caso muy concreto— y se puede medir en
una semana.

Después la fase 1, que es la que hace la conversación corta y natural.
