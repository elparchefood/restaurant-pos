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

**Cómo se hace — corregido.** Primero se dijo "es texto normal" y Sergio
corrigió bien: tiene otra tipografía y un gris más apagado, por eso se ve como
etiqueta y no como texto.

Es el **formato de código de WhatsApp**, con tildes invertidas:

```
🐙 `IA:` Hola 👋 Bienvenido a BRO'S
```

WhatsApp dibuja lo que va entre tildes en monoespaciado y en un tono más
apagado. El gris no lo pone nadie: lo pone WhatsApp al aplicar el formato.

Los cinco formatos que acepta: `*negrita*`, `_cursiva_`, `~tachado~`,
`` `código` `` y `> cita`. Cobra ya usa el primero (el "Sobre la *SÚPER QUESO*").

Alternativa descartada: caracteres Unicode monoespaciados (𝙸𝙰). Se ve parecido
pero algunos teléfonos no los dibujan y los lectores de pantalla los leen letra
por letra.

Se confirma en la captura que el mensaje de "Detalle:" con los precios NO lleva
la marca — sale por otro camino.

**En Cobra:** los 39 envíos conversacionales pasan por `sendWaAndSave`, así que
la marca es UNA línea ahí. Quedan aparte 11 envíos directos (imágenes de la
carta, QR, avisos de otras funciones como pedido en camino o comprobante
verificado) que hay que decidir uno por uno.

**Además, Meta pide informar al cliente cuando le contesta un sistema
automatizado.** Hoy Cobra no lo hace en ningún lado.

### DECIDIDO por Sergio (13-ago, noche)

**La etiqueta va en TODOS los mensajes que envía Paco, literalmente. En los que
el dueño escribe a mano, NUNCA.**

Sus tres razones, y la tercera no se había considerado:

1. **El cliente sabe con quién habla** y escribe más claro — que es lo mismo
   que busca el saludo del punto 1.
2. **Meta pide informar** cuando contesta un sistema automatizado. Hoy Cobra no
   lo hace en ningún lado.
3. **Para nosotros mismos, al revisar un error:** saber de un vistazo si ese
   mensaje lo escribió el bot o el dueño. Hoy hay que deducirlo, y en una
   conversación larga se pierde tiempo.

La tercera es la más práctica del día a día y es la que convierte esto en una
herramienta de trabajo, no solo en un aviso legal.

### La etiqueta es `🍟Paco:` — y la regla la afinó Sergio

**No es "lo automático lleva etiqueta". Es "lo que Paco razonó y contestó lleva
etiqueta".** Con sus palabras: *"las respuestas que dispara el sistema no llevan
etiqueta porque no las está enviando Paco, Paco no es el que está razonando en
ese momento"*.

Eso es mejor que la regla anterior: hace que la etiqueta signifique algo preciso
—quién pensó esa respuesta— en vez de ser un sello en todo lo que sale.

| | ¿Lleva `🍟Paco:`? | Por qué |
|---|---|---|
| Respuestas de la conversación | **sí** | Paco razonó |
| La carta y su frase | **sí** | Paco decidió mandarla |
| El QR y la frase del comprobante | **sí** | va dentro del flujo |
| Pedido en camino / listo / entregado | **no** | lo dispara el estado |
| Respuestas rápidas del dueño | **no** | es él |
| Mensajes escritos a mano | **no** | es él |

### Dos casos que la regla no resuelve sola — decidir con Sergio

1. **El comprobante verificado.** El sistema verifica contra el correo del banco
   y le confirma al cliente. ¿Es Paco contestando dentro de la conversación, o
   el sistema reportando? Verificar es del sistema; hablarle al cliente es de
   Paco.
2. **El recordatorio del comprobante.** Lo *escribe* Paco (con las palabras del
   dueño o las suyas) pero lo *dispara* un reloj. Por el criterio de Sergio
   —quien razona y habla— parecería que sí lleva etiqueta.

### Alcance técnico: los 11 envíos directos

"Todos los mensajes que envíe Paco" incluye los que NO pasan por
`sendWaAndSave`. Hay que revisarlos uno por uno:

- Las imágenes de la carta y el QR (el pie de la imagen puede llevarla)
- Los avisos de otras funciones: pedido en camino, comprobante verificado,
  recordatorio del comprobante

Todos esos son automáticos, así que por la regla de Sergio llevan etiqueta.

**Una reserva mía, dicha una vez y ya:** había recomendado dejar el RESUMEN del
pedido sin etiqueta, porque es el mensaje que el cliente relee para verificar su
plata. Sergio decidió que van todos. Se hace así; si al verlo en el teléfono
estorba, se ajusta ahí mismo.

### Lo que falta definir mañana

1. RESUELTO: la etiqueta es `🍟Paco:` — el emoji y el nombre del asistente.
   Debe ser configurable por restaurante: es multi-tenant y cada uno tiene su
   nombre y su emoji.
2. Falta ver en el teléfono si el nombre entre tildes invertidas se lee bien
   junto al emoji, o si el emoji debe quedar fuera del formato.
3. RESUELTO por Sergio: los avisos de estado NO llevan etiqueta.

Va de la mano con el punto 1: los dos son para que el cliente sepa con quién
habla y escriba más claro.

---

## 7. Barrio desconocido: Paco se calla, el dueño pone el precio, Paco retoma

**Diseño de Sergio**, con sus palabras: *"Cuando Paco no sepa un barrio
automáticamente se desactiva y la conversación pasa al humano. Luego me tiene
que salir algo donde yo pueda confirmar el costo de ese domicilio, toco un
botón y Paco vuelve a retomar la conversación ya con la información que le
faltaba."*

Es mejor que la alternativa que se propuso (que Paco siguiera preguntando
mientras el precio quedaba pendiente): **mientras no se sabe cuánto cuesta el
domicilio, nadie improvisa con el cliente.**

### Lo que YA está construido

| Pieza | Estado |
|---|---|
| Paco se calla al pasar a humano | ya funciona (`human_takeover`) |
| Bandera `domi_precio_pendiente` | la columna existe |
| Botón + ventana para escribir el precio | existen en chat-ia.js |
| `confirm-domi` apaga las dos banderas y avisa al cliente | existe |

### Lo que falta — y es poco

1. **EL DISPARADOR. Nadie levanta la bandera.** `domi_precio_pendiente` solo se
   pone en `false`, en tres sitios; el motor no la menciona ni una vez. Otro
   mecanismo construido y sin conectar.

   **Hoy, cuando el barrio no está en las zonas:** el resumen dice "Domicilio: a
   confirmar", el cliente confirma, y **el pedido se crea con domicilio en $0**,
   sin avisarle a nadie. Esa plata también se está yendo.

   Falta: al tener la dirección y no poder resolver el precio, poner
   `domi_precio_pendiente = true` + `human_takeover = true` y que Paco calle.

2. **QUE PACO RETOME, en vez de cerrar el pedido.** Hoy `confirm-domi` crea el
   pedido apenas se confirma el precio. Sirve si la conversación ya terminó,
   pero si la dirección llegó temprano faltarían el nombre y el pago.

   Ya existe la pieza: **la señal interna** que se construyó el 13-ago para el
   recordatorio del comprobante (`{convId, senal: "..."}` a delay-reply). Sirve
   igual aquí: confirmar el precio → señal → Paco despierta con el dato y sigue
   por donde iba.

3. **Guardar el barrio confirmado en las zonas.** Si no, la misma notificación
   por el mismo barrio para siempre. Con el tiempo el dueño dejaría de recibir
   avisos de sitios repetidos — el sistema aprende su ciudad.

### El diseño de la barra — aprobado por Sergio

Va en la **cabecera del chat**, como franja de ancho completo bajo el nombre del
contacto (no como botón: entre otros tres se pierde, y aquí no enterarse
significa un cliente esperando). Aparece solo mientras hace falta y desaparece
al confirmar.

Lleva:

- **El sitio que no reconoció** y la dirección tal como la escribió el cliente
- **El precio**, con Enter para confirmar (en hora pico nadie mueve el mouse)
- **Barrio / Conjunto**, con la consecuencia escrita debajo de cada uno
  ("pide dirección completa" / "solo torre y apto") — sin eso, en tres semanas
  nadie recuerda qué cambia, y marcar mal hace que Paco le pida a alguien de un
  conjunto una nomenclatura que no existe
- **A qué zona va a entrar**: "Zona de $7.000 · hoy tiene 8 sitios"
- **Los vecinos con sus precios** como referencia, para no desalinear la tarifa
  con el tiempo
- **"Paco en pausa"** arriba, que al confirmar cambia a **"Paco activo"**

### Al confirmar pasan TRES cosas

1. **El sitio se guarda** en la zona cuyo precio coincide. Las zonas de El Parche
   están agrupadas por precio: $5.000 (66 barrios), $6.000 (40), $7.000 (8),
   $8.000 (37), $9.000 (9), $10.000 (3), $12.000 (1). Escribir $7.000 lo mete en
   esa zona. No hay que inventar estructura nueva.
2. **Queda marcado como barrio o conjunto** (`zonas[].barrios` o
   `zonas[].conjuntos`).
3. **Paco se reactiva con todo el contexto** y sigue por donde iba — vía la
   señal interna, sin que el cliente tenga que escribir.

### HALLAZGO: la lista de conjuntos está VACÍA, y por eso esa función nunca ha servido

`esConjunto()` recorre `zonas[].conjuntos`. **Las siete zonas tienen cero
conjuntos.** O sea que toda la lógica de conjuntos —no pedir dirección completa,
pedir solo torre y apartamento— **nunca se ha ejecutado**. No por un error: por
falta de datos.

Registrar los conjuntos lleva semanas pendiente porque es sentarse a escribir
cincuenta a mano. **La idea de Sergio lo resuelve solo:** la lista se llena con
los pedidos reales, uno por uno, sin que nadie se siente a escribirlos. Es la
mejor parte de esta propuesta.

### El botón "Confirmar domi" hoy es invisible

Está en `chat-ia.html` (línea 176) con `display:none`, y como nadie levanta la
bandera nunca se muestra. Sergio tiene razón en que no existe en la práctica.
Al implementarlo hay que decidir si se reusa ese botón o se reemplaza por la
franja (la franja es lo aprobado).

### Por decidir

- **La notificación.** Hoy solo aparece un botón dentro de esa conversación: si
  no la tienes abierta, no te enteras. Hay que mirar qué avisos ya tiene Cobra
  antes de inventar un segundo sistema.
- RESUELTO: se guarda solo al confirmar el precio. Riesgo aceptado: si el
  cliente escribió mal el nombre, entra mal. Vale la pena poder editarlo después
  desde la pantalla de Domicilios.
- **¿Paco le avisa al cliente que está consultando?** Hoy quedaría en silencio
  mientras el dueño decide, y puede escribir tres veces preguntando. Un "déjame
  confirmarte el domicilio, un momento" lo evita. Recomendado.

---

## 8. Avisar por WhatsApp los puntos ganados — en TODOS los canales

**Lo que pidió Sergio:** que el aviso de "acabas de ganar X puntos" salga solo,
no solo a quien pidió por WhatsApp. *"las personas al pedir en la mesa me están
dando su número, entonces independientemente si piden en la mesa, si piden
domicilio, si es venta rápida, podemos conectar los puntos a la plantilla."*

El mensaje ya existe como respuesta rápida `/puntos` (`chat-ia.js:2082`), con la
variable `{puntos_ganados}` ya funcionando. Hoy Sergio lo manda a mano.

### La buena noticia: el disparador ya existe y ya cubre los tres canales

El trigger `award_loyalty_points` corre sobre `pos_orders` **cuando el pedido
queda pagado, venga de donde venga**, y por cada acreditación escribe una fila
en `pos_puntos_movimientos` con teléfono, puntos y saldo nuevo.

O sea: **no hay que detectar nada.** Esa fila ES el aviso a enviar. Y ya lleva
todo lo que necesita la plantilla.

Últimos 30 días — 98 acreditaciones, y así se reparten:

| Canal | Acreditaciones |
|---|---|
| Domicilio | 50 |
| Salón (mesa) | 25 |
| Venta rápida | 23 |

**48 de esas 98 son exactamente el caso que Sergio quiere cubrir** (mesa y venta
rápida). Hoy ninguna recibe el aviso salvo que él lo mande a mano.

### El obstáculo real: la ventana de 24 horas de WhatsApp

WhatsApp **no deja escribirle a alguien cuando quiera.** Solo se puede responder
libre durante 24 horas después de que el cliente escribió. Pasadas esas horas —o
si nunca escribió— WhatsApp exige una **plantilla aprobada por Meta**.

Y el que pide en la mesa **nunca escribió al WhatsApp**. Da el número en la caja.

Se midió contra las 98 acreditaciones reales, mirando si en ese momento había
ventana abierta:

| Canal | Se puede enviar hoy | Necesita plantilla de Meta |
|---|---|---|
| Domicilio | 33 de 50 | 17 |
| Venta rápida | 10 de 23 | 13 |
| **Salón (mesa)** | **3 de 25** | **22** |
| **Total** | **46** | **52** |

**Justo el canal que Sergio quiere cubrir es el que casi nunca tiene ventana
abierta: 3 de 25.** Sin plantilla aprobada, la mesa se queda por fuera — que es
lo contrario de lo que pidió.

Ojo con la palabra: Sergio dice "plantilla" pensando en una plantilla de las
nuestras (texto con variables, como `/puntos`). Meta usa la misma palabra para
otra cosa: un texto que **ellos revisan y aprueban** antes de dejarlo salir. Se
necesitan las dos, y son distintas.

### Lo que hay que hacer, en orden

1. **Registrar la plantilla en Meta** (categoría *utility*; el aviso de puntos
   ganados califica, que es lo barato). Aprobación en minutos u horas. Va junto
   con lo de `META-PERMISOS.md`. **Esto va primero porque es lo único que no
   depende de nosotros.**
2. **Marcar la fila como avisada.** `pos_puntos_movimientos` no tiene columna
   para eso; sin ella se corre el riesgo de mandar el mismo aviso dos veces, o de
   inundar a alguien al reprocesar. Una columna `avisado_at` y listo.
3. **Enviar.** Si hay ventana abierta → mensaje normal con nuestra plantilla
   `/puntos`. Si no → plantilla de Meta. Mismo texto, dos caminos.
4. **Interruptor por sucursal** para prenderlo y apagarlo, y decidir un mínimo
   (¿avisar por 3 puntos? probablemente no).

### LA PLANTILLA — YA RADICADA EN META (13-ago, noche)

**Estado: `PENDING`.** Enviada por la API a la WABA de El Parche Food.
ID de la plantilla: `1025427573820326`.

Ya había una aprobada en esa cuenta (`nuevo_numero_whatsapp`, MARKETING), o sea
que el camino de aprobación funciona.

**Corrección a `ESTADO-SISTEMA.md`:** ese documento dice que el WABA ID es
`1597436841735444`. El real, leído de `chat_channels.meta`, es
`1568013168188537`. El de la base es el que sirve. Hay que corregir el
documento.

| Campo del formulario | Valor |
|---|---|
| Nombre | `puntos_ganados` |
| Categoría | **Utility** (no Marketing) |
| Idioma | Español — `es` |
| Encabezado | ninguno |
| Pie de página | ninguno |
| Botones | ninguno |

**Cuerpo:**

```
🎉 ¡Ganaste {{1}} puntos con tu compra en {{2}}!
Ya tienes {{3}} puntos acumulados.
Cuando vuelvas a pedir, recuerda dar tu número de celular para seguir sumando y redimirlos en productos 🍟
```

**Valores de ejemplo** (Meta los pide solo para entender de qué se trata; los
reales se mandan en cada envío):

| | Ejemplo | De dónde sale al enviar |
|---|---|---|
| `{{1}}` | `52` | `pos_puntos_movimientos.puntos` |
| `{{2}}` | `El Parche` | nombre del negocio de la sucursal |
| `{{3}}` | `340` | `pos_puntos_movimientos.saldo_despues` |

**El texto fijo se escribió a propósito sin nombrar a El Parche**: el negocio va
en `{{2}}`, así que **la misma plantilla sirve para cualquier restaurante que
compre Cobra.** No hay que radicar una por cliente.

Por qué califica como *utility* y no como marketing: avisa de algo que **ya
pasó** (una compra que el cliente acaba de hacer) y no ofrece nada nuevo. Esa
es la categoría barata.

**Trampas al enviar:**

- Ninguna variable puede ir vacía o el envío falla. `{{3}}` siempre trae número
  porque el trigger lo calcula antes de escribir la fila; `{{2}}` hay que
  asegurarlo si un negocio no tiene nombre configurado.
- Las variables no admiten saltos de línea, tabulaciones ni varios espacios
  seguidos.
- Cambiar una palabra del texto fijo obliga a pedir aprobación de nuevo. Los
  valores de las variables no.

### Decidido

- **Sí sale el saldo total** además de lo ganado (`{{3}}`). La fila ya lo trae,
  no cuesta nada más y es lo que hace que el cliente vuelva.
- **Sin la etiqueta `🍟Paco:`** del punto 6: esto lo dispara el sistema, no lo
  razona Paco.

### Por decidir con Sergio
- **¿Y si el cliente contesta?** Cae en el chat como conversación nueva y Paco va
  a intentar tomarle un pedido. Hay que ver cómo se comporta.

---

## Estado al cerrar el 13-ago

- Motor **v250**, arrancando (verificado con llamada real)
- Editor y configuración publicados, commit `fee4a1f`
- Ventas del día: 1 pedido real (Nicolth Melisa, $59.000, con empaque cobrado)
- 111 clientes intactos, 14 palabras de adición restauradas
- Cero conversaciones de prueba
