# Pendientes para el 14-ago-2026

Escrito la noche del 13-ago con Sergio en servicio. **Nada de esto se tocó**:
el motor quedó en v250 y el editor en el commit `fee4a1f`.

---

## 1. El saludo: decir que es un asistente virtual y pedir el pedido claro

**Lo que pidió Sergio**, con sus palabras: que el saludo *"indique y explique a
la gente que está contestando una asistente virtual, y que las personas nos
ayuden haciendo su pedido lo más claro posible. Así evitamos errores en el
flujo."*

El razonamiento es bueno y va más allá del estilo: **la mitad de los errores de
hoy nacieron de mensajes sueltos y a medias** — "me / das / porfavor / una
salchi premium" en cuatro mensajes, "porfa" solo, "Bellavista" sin dirección.
Un cliente que sabe que le contesta un asistente escribe distinto.

La frase que Paco alcanzó a decir dos veces hoy y que a Sergio le gustó
(rescatada de los mensajes enviados, 13/08 12:20 y 13:18):

> ¡Buenas tardes! 😊 Soy *Paco*, el asistente de El Parche.
> Para atenderte rápido, escríbeme tu pedido lo más completo posible:
> *qué quieres, el tamaño y para dónde va*. 🍟

**Falta decidir con Sergio:** frase fija (sale igual siempre) o dentro de la
guía conversacional (varía el saludo pero la indicación nunca falta). Se
inclinó por que la indicación esté siempre; el saludo puede variar.

**Ojo con el cliente conocido:** desde hoy el bot reconoce a los clientes
guardados y los saluda por su nombre. La indicación de "escríbeme el pedido
completo" debería salir igual, pero el saludo de un conocido no tiene por qué
presentarse otra vez como asistente. Son dos casos.

### De dónde salía esa frase — investigado el 13-ago

Un saludo solo puede salir de cinco sitios. Se revisaron los cinco:

| | Origen | Estado hoy |
|---|---|---|
| 1 | `flujo_saludo` frase fija | vacío (el nodo está en modo IA) |
| 2 | `flujo_saludo` guía IA **← el que se usa** | "Saluda con la hora del día… di que te llamas Paco…" |
| 3 | Banco `frases.bienvenidas` | no existe, nunca se configuró |
| 4 | `frases.apertura` / `apertura_conocido` | otro texto |
| 5 | Frase quemada en el código | otro texto |

Se revisaron además las 31 frases configuradas: el texto no está en ninguna.
Tampoco en el código (buscado en todo el historial de git: cero).

**Conclusión: hoy sale del punto 2 — el modelo, escribiéndolo desde la guía.**
Por eso no es idéntico siempre.

**Lo que NO se pudo descartar:** que en una sesión anterior se haya escrito
directo en la base saltándose el canvas. De `ia_config` no se guarda historial.
Si fue así, cualquier guardado del canvas la habría borrado sin avisar (ver
punto 2). Sergio recuerda que salía siempre igual durante días; el registro de
mensajes no lo puede confirmar **porque las conversaciones de prueba las fuimos
borrando nosotros mismos**.

---

## 2. Guardar el canvas no puede reescribir lo que no conoce

**Es la raíz de tres daños confirmados hoy**, todos causados al guardar:

| | Qué se perdió |
|---|---|
| a | Las 14 palabras de adición de Sergio → quedaron en cero |
| b | El paso de adiciones pasó de `obligatoria: false` a `true` |
| c | (posible) La frase fija del saludo, si existía |

El patrón es siempre el mismo: **el nodo del canvas no guarda ese dato, y el
exportador escribe el valor por defecto encima.**

Ya se hizo la mitad del arreglo (`volcarPasosGuardados` carga sobre los nodos
los 16 ajustes de paso al abrir el canvas). **Falta lo que no tiene `campo`:**

- `flujo_saludo` — se reescribe entero desde el nodo Saludo en cada guardado
- `flujo_extras` — cierre, comprobante, carta
- `flujo_envio`

Mientras esto siga abierto, **cualquier cosa que configuremos se puede perder
al guardar**. Por eso va primero.

Y una falla propia a corregir: **no se guarda historial de `ia_config`**. Sin
eso no hay forma de responder "¿qué había aquí antes?", que fue justo lo que no
se pudo contestar hoy. Vale la pena una tabla de auditoría o al menos un
respaldo automático antes de cada guardado del canvas.

---

## 3. Contestar el upsell con un producto no marca el paso como contestado

**Grave: el bot dice "voy a pasarte tu pedido a cocina" y no crea el pedido.**

Rastro real (13-ago 17:06–17:08, conversación de Sergio):

```
PACO    ¿Quieres agregarle algo más? Tenemos papas, gaseosa, jugos...
SERGIO  una coca cola                     ← contesta con un PRODUCTO
...
PACO    ¿Vas a pagar en efectivo o por transferencia?   ← improvisado
SERGIO  efectivo
PACO    Voy a pasarte tu pedido a cocina y te avisamos cuando salga. 🍟
```

Estado final: `upsell: "efectivo"`, `nombre: null`, `resumen_enviado: false`,
`order_id: null`. **No se creó ningún pedido.**

La cadena: contestar el upsell con un producto no llena `state.upsell` → el
paso sigue pendiente → vuelve a tocarle el turno → el modelo improvisa (pregunta
el pago) → "efectivo" llena la casilla del upsell → el nombre nunca se pregunta
→ nunca se completa el flujo → sin resumen, y el modelo improvisa el cierre.

**La causa:** al separar Upsell y Adiciones esta tarde, la regla que marca "ya
contestó" quedó apuntando a la casilla vieja:

```ts
if (state.adiciones === null && productoNuevo && pasoAntesId === "upsell") {
  result.adiciones = "";
}
```

Debe marcar también `state.upsell` cuando el paso pendiente era `sugerencia`.
Es una línea. Probar en el banco: pedir algo, contestar el upsell con "una coca
cola", y verificar que llega al resumen y crea el pedido.

**Solo le pasó a Sergio**, ningún cliente real cayó (se verificó).

---

## 4. El picker del upsell abre vacío

Verificado abriendo el editor publicado en un navegador real: el botón existe,
la ventana existe, **abre bien (1071×668)** — y la lista sale vacía.

En esa prueba era esperable (sin sesión no puede leer la carta). Falta
comprobar qué pasa con la sesión de Sergio. Los permisos de las tres tablas que
lee (`pos_categories`, `pos_products`, `pos_modifier_groups`) están bien para
el rol `authenticated`.

**Error seguro, independiente de eso:** cuando la lista sale vacía dice *"Nada
coincide con esa búsqueda"*, como si fuera culpa de la búsqueda. Debe decir que
**no pudo leer la carta**. Mismo error que ya se cometió hoy con la sección de
métodos de pago: algo que no funciona sin decir por qué.

**Pregunta pendiente para Sergio:** al tocar "Agregar de la carta", ¿se abre una
ventana oscura con buscador aunque esté vacía, o no pasa absolutamente nada? La
respuesta parte el problema en dos.

---

## 5. Rediseño del panel de configuración

Aprobado por Sergio, diseño escrito en `DISENO-PANEL-CANVAS.md`.

Ganó urgencia hoy: **el picker del upsell existe desde hace horas y Sergio no lo
veía porque queda enterrado bajo trece secciones.** Lo mismo pasó con la sección
de métodos de pago. El panel largo no es una molestia estética — hace que lo
nuevo parezca inexistente.

---

## 6. La marca de "está contestando un asistente" en cada mensaje

Sergio vio en otro restaurante (BRO'S 1952) que cada mensaje del bot llega con
un prefijo: `🐙 IA: Hola, bienvenido a BRO'S...`. Y notó por qué sirve: **la
gente escribe con más cuidado cuando sabe que le contesta un sistema.**

**Cómo se hace:** WhatsApp NO tiene ninguna etiqueta de ese tipo. Es texto,
pegado al principio del mensaje por el propio bot. Se confirma en la captura:
el mensaje de "Detalle:" con los precios NO lleva la marca — sale por otro
camino.

**En Cobra:** los 39 envíos conversacionales pasan por `sendWaAndSave`, así que
la marca es UNA línea ahí. Quedan aparte 11 envíos directos (imágenes de la
carta, QR, avisos de otras funciones como pedido en camino o comprobante
verificado) que hay que decidir uno por uno.

**Además, Meta pide informar al cliente cuando le contesta un sistema
automatizado.** Hoy Cobra no lo hace en ningún lado.

### Decisiones pendientes con Sergio

1. **¿En todos los mensajes o solo en el saludo?** BRO'S lo pone en todos. En
   cada mensaje refuerza el cuidado al escribir pero ensucia la conversación.
2. **Qué marca**, y que sea configurable por restaurante: `🍟 Paco:`, `🤖 IA:`.
   Es multi-tenant, cada asistente tiene su nombre.
3. **Cuando contesta una PERSONA, la marca no va.** Ahí está el valor real: el
   cliente distingue al bot del dueño. Si va en todo, no informa nada.

**Recomendación:** en todos los mensajes del bot, en ninguno de los humanos,
configurable — y **NO en el resumen del pedido**, que es el mensaje que el
cliente relee para verificar su plata.

Va de la mano con el punto 1: los dos son para que el cliente sepa con quién
habla y escriba más claro.

---

## Estado al cerrar el 13-ago

- Motor **v250**, arrancando (verificado con llamada real)
- Editor y configuración publicados, commit `fee4a1f`
- Ventas del día: 1 pedido real (Nicolth Melisa, $59.000, con empaque cobrado)
- 111 clientes intactos, 14 palabras de adición restauradas
- Cero conversaciones de prueba
