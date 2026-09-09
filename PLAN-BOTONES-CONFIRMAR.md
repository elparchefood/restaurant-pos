# Los dos botones del resumen — plan antes de tocar nada

> **Estado: PLAN, sin implementar.** Escrito el 8-sep-2026 después de leer el
> motor. Toca el camino donde se crean los pedidos, así que primero se enseña.
>
> Sergio: *"en ese mismo resumen, en lugar de dar una pregunta al aire, vamos a
> colocar dos botones: uno que diga sí confirmo y otro que diga quiero corregir
> algo, y eso sí lo va a llevar nuevamente a la página"*.

---

## 1. Por qué vale la pena

Hoy el resumen termina en `{{confirmacion}}`, que es **una pregunta al aire**:

> *"¿Lo confirmamos o hay algo que cambiar?"*

Quien conteste *"ahí está bien"*, *"sí señor"* o *"listo pero sin cebolla"*
obliga a Paco a interpretarlo. Y ahí ya se perdió un pedido: en
`ERRORES-PACO-CLIENTES-REALES.md`, el caso de Kevin del 17-ago empieza
exactamente así — *"AHÍ está bien" no cerraba el upsell*, y se cayó todo el
pedido.

Con dos botones eso desaparece. Es la misma idea de la carta —**quitar el texto
de en medio**— aplicada al último paso.

---

## 2. ⚠️ Lo que encontré leyendo, y que cambia el plan

Estas dos cosas no se ven hasta abrir el motor. Sin ellas, los botones
**parecerían funcionar y no funcionarían**.

### 2.1 Hoy, tocar un botón NO despierta a Paco

En `meta-webhook`, la respuesta de la IA solo se encola para dos tipos de
mensaje:

```js
if (((msgType === "text" && bodyText) || msgType === "audio") && phoneId && accessToken)
```

Un `interactive` (que es lo que llega cuando alguien toca un botón) **se guarda
en el chat pero no despierta a Paco**. O sea: el cliente tocaría "Sí, confirmo",
vería su mensaje en el chat… y Paco no contestaría nunca.

Este es **el punto más importante de todo el plan**. Es el tipo de fallo que se
descubre con un cliente de verdad esperando.

### 2.2 El id del botón se pierde por el camino

El webhook ya lo captura (`accionId`, de `button_reply.id`), y hasta lo manda a
las funciones del inventario del gerente. Pero en la conversación del cliente
**solo se guarda el TÍTULO del botón** en `body`; el id no se guarda en ningún
lado.

Eso importa porque la regla de la casa es no comparar texto. Si Paco tuviera que
reconocer el botón por su título, bastaría con que alguien escribiera "Sí,
confirmo" a mano —o que mañana cambiemos el texto— para que dejara de funcionar.

---

## 3. Un límite de WhatsApp que decide el diseño

**Un botón con enlace tiene que ir solo.** Meta no deja mezclar un `cta_url`
(el que abre una página) con botones de respuesta en el mismo mensaje.

Así que **no** se puede mandar el resumen con "Sí, confirmo" + un botón que abra
la carta. Queda así:

1. El resumen va con **dos botones de respuesta**: `Sí, confirmo` y
   `Corregir algo`.
2. Si toca **Corregir algo**, Paco le manda **entonces** el botón con el enlace.

Un paso más, pero tiene una ventaja: el enlace de corrección se crea **solo para
quien lo pide**, fresco y con su caducidad, en vez de repartir enlaces a todo el
mundo por si acaso.

**Los títulos no pueden pasar de 20 caracteres.** *"Quiero corregir algo"* mide
justo 20, al filo; **"Corregir algo"** (13) se lee más rápido y deja margen.

---

## 4. Qué se cambia, en orden

Cada paso se puede probar solo, y cada uno deja el sistema funcionando.

### Paso 1 — Que tocar un botón despierte a Paco
`meta-webhook`: añadir `interactive` y `button` a los tipos que encolan
respuesta. **Sin esto nada de lo demás sirve.**

*Riesgo:* que empiece a contestar a botones de otros flujos que hoy no
contestaba (los del inventario del gerente, por ejemplo). **Mitigación:** esos
van por otro camino —`gerente-inventario` contesta antes— pero hay que
comprobarlo con una prueba, no suponerlo.

### Paso 2 — Guardar el id del botón
`meta-webhook`: escribir `accionId` en `chat_messages.payload` del mensaje
entrante. La columna ya existe.

*Riesgo:* ninguno. Es un dato de más que hoy se tira.

### Paso 3 — Que Paco lea el id, no el texto
`delay-reply`: al arrancar, si el último mensaje trae un id conocido
(`cobra_ok` / `cobra_fix`), se actúa por el id y no se pasa por el lector de
texto. Si no trae id —porque escribió a mano— sigue el camino de siempre.

### Paso 4 — Mandar el resumen con botones
El resumen se arma en un solo sitio (`buildSummaryFromState`) pero **se manda
desde seis**. Para no tocar seis sitios: se hace **un solo ayudante**
`enviarResumen(...)` que decide si va con botones o como texto plano, y los seis
llaman a ese.

*Riesgo:* el más alto de todo el plan — son los seis sitios donde nace un
pedido. **Mitigación:** el ayudante cae a texto plano si Meta rechaza el
interactivo (igual que hace `sendWaBotonApp` hoy), y va detrás del mismo
interruptor `carta_web.activo`.

### Paso 5 — El botón de corregir
Al recibir `cobra_fix`: crear un enlace con `motivo='correccion'` y mandarlo.
La página ya sabe abrir con el pedido cargado — está hecho y probado.

### Paso 6 — Que Paco lea el borrador que llega de la carta
Cuando el pedido viene de la página (`desde_carta: true`), Paco **no tiene que
leer nada**: ya tiene los productos con sus identificadores. Solo sigue con
dirección y nombre, y manda el resumen.

---

## 5. Lo que puede salir mal, dicho antes

| Qué | Qué pasaría | Cómo se evita |
|---|---|---|
| Alguien contesta **escribiendo** en vez de tocar | Se queda sin respuesta | El camino de texto de hoy **no se toca**: sigue igual para quien escriba |
| Meta rechaza el interactivo | El cliente no ve el resumen | Cae a texto plano, como ya hace el botón de la app |
| Un botón viejo tocado dos días después | Confirmaría un pedido que ya no existe | El id se comprueba contra el estado de la conversación, no se obedece a ciegas |
| Instagram y Facebook | No tienen `cta_url` | Ahí va el enlace como texto — ya lo hace `sendWaBotonApp` |
| El cliente toca "Corregir" con el pedido ya en cocina | Un pedido que se cambia después de hecho | Si ya pasó a preparación, se le dice que llame; no se le manda enlace |

---

## 6. Cómo lo probamos

Sergio, 8-sep: *"hoy y mañana no abrimos el restaurante, entonces podemos hacer
esto con tranquilidad"*.

Con el restaurante cerrado se puede probar **de verdad y en vivo**, que es la
única prueba que vale:

1. Encender `carta_web.activo` y escribirle a Paco desde el celular de Sergio.
2. Pedir la carta → tocar el botón → hacer un pedido en la página.
3. Ver que el borrador llega y que Paco pregunta la dirección.
4. Confirmar con el botón → que el pedido pase a preparación.
5. Repetir tocando **Corregir algo** → que llegue el enlace nuevo y la página
   abra con el pedido puesto.

Y en cada paso, mirar el chat **como lo ve el cliente**, no la base de datos.

---

## 7. Lo que NO se toca

- El lector del pedido por texto. Quien escriba, sigue igual.
- La creación del pedido, la impresión y el paso a cocina.
- El QR de la transferencia y la verificación del comprobante.
- Los pasos de dirección y nombre.

Esto cambia **cómo llega la respuesta del cliente**, no lo que pasa después.
