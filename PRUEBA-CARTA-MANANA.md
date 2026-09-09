# La prueba de la carta — guion para hacerla solo

> Para Sergio, 9-sep. Todo está construido y **apagado**. Esto es lo que hay que
> tocar y lo que debe pasar en cada paso.

---

## Antes de empezar

**1. Abre el horario de hoy.** Configuración → Horarios → pon hoy como activo,
con una franja que incluya la hora en que vas a probar. *(Con el horario cerrado
la carta se puede mirar pero no deja pedir — y eso es lo que queremos que pase
con los clientes, así que para probar hay que abrir.)*

**2. Enciende la carta por botón.** Es una sola casilla:
`ia_config.carta_web.activo` → `true`.

Si no tienes dónde tocarlo todavía, dímelo y lo enciendo yo en el momento.

---

## ⚠️ Corregido el 9-sep, con tu prueba

Escribiste **"Hola para un pedido"** y llegaron las imágenes. La causa, medida:

**Paco manda la carta desde DOS sitios distintos**, y el botón solo estaba en uno.

| Cómo escribe el cliente | Qué bloque atiende | Tenía botón |
|---|---|---|
| *"me mandas la carta"* | el que pide la carta | ✅ sí |
| *"buenas, para un pedido"* | el de "quiere pedir pero no dijo qué" | ❌ **no** |

Entraste por el segundo — que además es por donde entra casi todo el mundo,
porque nadie escribe "mándame la carta". Ahora el envío del botón vive en **un
solo sitio** y lo usan los dos caminos. Tener el mismo código copiado dos veces
es justo como nace este error.

De paso quedó tapado otro hueco: el botón `cta_url` **solo existe en
WhatsApp**. Por Instagram y Facebook, Meta lo rechaza — ahí van las imágenes de
siempre, que antes no era así y esos clientes se habrían quedado sin carta.

### Y lo del saludo

No es un fallo nuevo, es una regla que ya estaba:

- **"Hola" a secas** → Paco se presenta. *(Te pasó el 8-sep a las 00:41.)*
- **"Hola para un pedido"** → la presentación solo sale si Paco **nunca** ha
  hablado en esa conversación. En la tuya lleva **411 mensajes** desde el
  16-ago, así que no se presentó.

**Con un cliente nuevo esa misma frase sí lo saluda.** Si prefieres que salude
también cuando ya hablaron pero hace días, dímelo y lo cambio — es un número,
no una reescritura.

---

## ⚠️ Segundo arreglo del 9-sep: volviste del chat y Paco no dijo nada

El pedido **sí llegó bien** (2 productos, $90.000, efectivo). Lo que fallaba era
lo de después.

**Paco se estaba cayendo.** Una línea de rastreo leía un dato que en ese punto
del programa todavía no existe. Eso no devuelve un valor vacío: **revienta la
función entera**. Paco no contestaba nada y el pedido se quedaba ahí.

Solo saltaba con una combinación rara: que el texto del cliente diga *"carta"*
y el lector diga que **no** está pidiendo la carta. Por eso llevaba días ahí
sin que nadie lo viera — hasta que llegó el aviso de la propia página (*"Hizo
su pedido desde la carta"*), que la cumple **siempre**.

**Miré si le pasó a algún cliente real en 30 días: no.** Los únicos casos sin
respuesta son mensajes de publicidad en chats que ya estaban en manos de una
persona.

### Y una segunda cosa que apareció al arreglar la primera

Ya recogía el pedido, pero antes **te mandaba la carta otra vez** — el aviso
dice "…desde la carta", y el detector de texto hacía su trabajo.

Ese mensaje no lo escribe el cliente: lo escribe nuestra propia página, y ya
trae el pedido con los identificadores exactos. **No hay nada que interpretar**,
así que ahora se recoge *antes* de todos los detectores. De paso se ahorra una
consulta a la IA en cada pedido de la carta.

### Comprobado

Repetí tu mismo pedido desde cero: sale **un solo mensaje** —*"¡Perfecto, ya
tengo tu pedido! 🙌"* y la pregunta de la dirección— y **ninguna carta
repetida**. El pedido quedó con sus 2 productos y el pago en efectivo.

**Tu conversación quedó en ese punto**: contéstale la dirección y el nombre y
sigues la prueba desde el paso 9.

---

## ⚠️ Tercera tanda del 9-sep: te preguntó la variante

*"Me preguntó la variable, pero ya está todo, incluso en el borrador ya está
todo."* — y era exacto. El borrador tenía la Mixta guardada. **Tres errores,
todos en el mismo traspaso de la página a Paco.**

### a) La variante se perdía en el camino

Paco no mira el texto *"Mixta"* para saber si ya preguntó. Mira una lista
interna de **grupo → opción escogida** (Tipo → Mixta). Yo le pasaba solo el
texto, así que esa lista llegaba **vacía** y el flujo veía el grupo "Tipo" sin
contestar.

Comprobé que el identificador del grupo es el mismo de los dos lados
(`vg_2wsvmc` en la página y en tu catálogo), así que ahora encaja.

### b) El primer producto se contaba dos veces

El resumen se arma como *(productos ya resueltos) + (el que está en curso)*. Yo
metía **todos** en la primera lista y además ponía el primero como "en curso":
en el resumen la Premium habría salido **dos veces**. Todavía no lo habías
visto porque la prueba se frenaba antes.

### c) El barrio de tu ficha se quedó pegado a la dirección nueva

Esto es lo que produjo el *"déjame confirmarte el valor del domicilio"*:

| | |
|---|---|
| Tu ficha guardada | dirección *Conjunto Residencial Balmoral*, barrio *Casa 21* |
| Como el pedido de la carta no trae dirección | Paco sembró las dos |
| Escribiste | *Carrera 9 b # 63 n 58 bellavista* |
| Se cambió la dirección… | …**y el barrio se quedó en "Casa 21"** |
| Lo que buscó en tus zonas | *"Casa 21 Carrera 9 b # 63 n 58"* — sin la palabra bellavista |

**Bella Vista sí está configurada, a $5.000.** No la encontró porque la palabra
ya no estaba en el texto.

Esto **no es solo de la carta**: le pasa a cualquier cliente que ya pidió antes
y esta vez da otra dirección. Se le habría cobrado la zona equivocada. Ahora,
si se cambia la dirección sembrada, **su barrio se va con ella** y se vuelve a
leer del mensaje.

---

## Corregir sin borrar (9-sep, pedido de Sergio)

> *"Me da la opción de quitar la salchipapa entera pero solo quiero quitar la
> adición... un cliente así se enredaría demasiado."*

Tenía razón, y va contra el propósito de la página: existe para **quitar**
trabajo, no para que el cliente repita cuatro decisiones para cambiar una salsa.

**Cada línea del pedido ahora tiene "Editar".** Dentro está todo lo de ese
producto **a la vez**:

| Sección | Qué se puede hacer |
|---|---|
| Tamaño | cambiar Familiar ↔ Personal |
| Tipo (y cada grupo que tenga) | Mixta / Carne / Pollo |
| Adiciones | quitar la que tiene, o cambiarla por otra |
| Cantidad | subir o bajar |
| Nota | reescribirla |

Se toca solo lo que se quiere cambiar; el botón de abajo dice **Guardar** con el
precio nuevo ya calculado. *Quitar del pedido* sigue estando, pero abajo.

**Al editar se ve todo junto, no por pasos.** Es a propósito y no es una
incoherencia con el paso a paso de cuando se agrega: quien agrega va decidiendo
y se le guía de a una; quien corrige **ya sabe a qué vino**.

Y si se cambia el tamaño, las adiciones que ese tamaño no tiene **se sueltan
solas** en vez de cobrarse igual.

### Y el panel se abre solo

> *"Toca tocar ahí para poder verlo; es mejor que aparezca abierto desde el
> principio... de una vez ve su pedido y se va directo a hacer los cambios."*

Entrando por **Corregir algo**, el pedido aparece abierto. Se puede cerrar como
siempre. Solo al corregir: quien entra a pedir por primera vez ve la carta.

### Probado en el navegador, con tu pedido real

| Acción | Precio |
|---|---|
| Como estaba | $82.000 |
| Quitando Jalapeños | $70.000 |
| Cambiando a Ranchera | $98.000 |
| Y pasándola a Personal | $49.000 *(y Ranchera se mantuvo)* |

Guardado quedó *"Personal · Mixta · con Ranchera · «Con ajo y rosada»"*. **Nada
de eso se envió**: probé en la página sin guardar, tu pedido en la base sigue
igual (Familiar, Mixta, Jalapeños, "Solo ajo", $90.000).

---

## Sin espera, y sin volver a preguntar la dirección (9-sep)

### Los 15 segundos, fuera

> *"No quiero que se espere los 15 segundos... si no, la persona va a creer que
> lo que hizo en la página no sirvió. Tiene que ser de inmediato."*

Esa espera existe para **agrupar** a quien escribe de a poquitos: Paco aguanta
unos segundos por si mandas tres mensajes seguidos y contesta una sola vez.

Pero al terminar en la página **no hay nadie escribiendo** — el aviso lo pone la
propia página y ya viene completo. Ahí esperar no agrupa nada, solo deja al
cliente mirando la pantalla. **Medido después del cambio: 3 segundos**, y eso
incluye el arranque del servidor.

⚠️ Solo en el camino de la carta. Quien escriba por el chat sigue con tus 15
segundos de siempre, que ahí sí sirven.

### Corregir ya no borra la conversación

> *"Paco ya me había tomado totalmente el pedido, toqué corregir algo, entré,
> volví a terminar y Paco me volvió a preguntar la dirección."*

El traspaso de la página a Paco arrancaba con la hoja **en blanco**. Para un
pedido nuevo está bien; al corregir era tirar a la basura todo lo hablado.

La regla ahora es la que siempre debió ser:

| Manda la **página** | Manda el **chat** |
|---|---|
| productos, tamaños, variantes | dirección y barrio |
| adiciones, notas, cantidades | nombre |
| método de pago | datos de factura |

Corregir cambia lo de la izquierda y **no toca lo de la derecha**.

Y si la dirección ya se sabe, Paco no se detiene a preguntarla: dice *"¡Listo,
ya quedó tu pedido con los cambios! 🙌"* y sigue derecho al **resumen con los
dos botones**. Si faltara otra cosa (el nombre, por ejemplo), la pide como
siempre — eso lo decide el flujo, no el traspaso.

**Probado con tu conversación:** salieron los dos mensajes, con la dirección,
Bella Vista y tu nombre intactos, y ninguna pregunta repetida.

---

## La tarjeta que se quedó en borrador (9-sep)

> *"El pedido se creó y todo quedó perfecto pero la tarjeta se quedó en
> borrador... si le toco ahí se enviaría doble."*

La tarjeta pregunta **primero** *"¿hay borrador?"* y solo después *"¿hay
pedido?"*. El camino manual **borra** el borrador al enviar a cocina, así que
ese orden nunca falló en dos años. El de la carta **lo deja** —marcado, para que
se pueda corregir— y por eso la tarjeta se quedaba con su botón de enviar.

Dos arreglos, porque son dos fallos distintos:

1. **Quien crea el pedido limpia el borrador.** Ya limpiaba lo demás; le
   faltaba este. Un borrador que ya es pedido no es un borrador.
2. **Y la tarjeta no se fía de eso.** Compara fechas: un borrador **más
   antiguo** que el pedido de esa conversación es el que lo produjo, no uno
   nuevo. No basta con *"si hay pedido gana el pedido"* — un cliente puede
   empezar **otro** pedido teniendo uno ya enviado, y ese sí tiene que verse.

Tu conversación ya la limpié a mano (comprobando antes que ese borrador fuera el
del pedido). **Recarga la caja** para que tome el código nuevo.

## Tocar un botón tampoco espera

> *"Las respuestas después de que el cliente toque un botón tampoco deberían
> tener la espera... la espera sirve para cuando un cliente realmente escriba."*

Exacto, y esa es la razón por la que existe: agrupar a quien manda *"hola"*,
*"para un pedido"*, *"una premium"* en tres mensajes seguidos y contestarle una
sola vez.

**Un botón no se toca de a pedazos.** Se toca una vez y ya está todo dicho:
esperar ahí no agrupa nada, solo hace pensar que no funcionó.

| Cómo llega | Espera |
|---|---|
| El cliente escribe | tus 15 segundos, igual que siempre |
| El cliente toca un botón | **ninguna** |
| Termina el pedido en la página | **ninguna** |

---

## El recorrido, y qué debe pasar

| # | Qué haces | Qué debe pasar |
|---|---|---|
| 1 | Le escribes a Paco **"me mandas la carta"** | Llega un mensaje con **botón "Ver el menú"**. *(Paco tarda ~15 s: es tu delay configurado.)* |
| 2 | Tocas el botón | Abre la carta con **tus 6 categorías** y las fotos. Arriba: tu logo y *"Abierto · cierra a las…"* |
| 3 | Entras a Salchipapas Especiales y tocas **Premium** | Pregunta **1/4 el tamaño**. En la lista NO dice precio, dice "Familiar o Personal" |
| 4 | Escoges Personal → Mixta → *No, así está bien* → Agregar | El botón dice **Agregar $35.000** (34.000 + 1.000 de empaque) |
| 5 | Al agregar | Aparece **"¿Le agregas algo más?"** con Ranchera, Súper Queso y Bebidas |
| 6 | Tocas **No, gracias** | **"¿Es esto lo que quieres?"** con tu pedido y el total |
| 7 | **Sí, terminar mi pedido** → escoges **Efectivo** → **Hacer mi pedido** | Pantalla de listo y botón **"Volver al chat"** |
| 8 | Vuelves al chat | Paco dice: *"¡Perfecto, ya tengo tu pedido! 🙌"* y debajo tu pregunta de la dirección con el barrio |
| 9 | Le das la dirección y el nombre | Llega el **resumen con dos botones**: *Sí, confirmo* / *Corregir algo* |
| 10 | Tocas **Corregir algo** | Llega un botón nuevo, y la carta abre **con tu pedido ya cargado** |
| 11 | Cambias algo y terminas | Vuelve el resumen actualizado, otra vez con los dos botones |
| 12 | Tocas **Sí, confirmo** | El pedido entra como siempre (a cocina si es efectivo) |

---

## Lo que hay que mirar con lupa

- **El paso 8 es el más nuevo de todos.** Si Paco no dice nada al volver del
  chat, ahí está el fallo: la página no lo despertó.
- **Que el precio del resumen sea el mismo que viste en la página.** Si no
  coincide, el empaque se está sumando dos veces o ninguna.
- **Que no te ofrezca adiciones otra vez** en el chat: la página ya lo hizo.

---

## Si algo sale mal

**Apaga `carta_web.activo`.** Con eso Paco vuelve a mandar las imágenes de la
carta y todo lo demás sigue exactamente como antes. No hay que desplegar nada ni
esperar a nadie.

El camino de siempre no se tocó: quien **escriba** su pedido se atiende igual
que hoy, con el botón encendido o apagado.

---

## Al terminar

**Vuelve a cerrar el horario de hoy.** Si se queda abierto, Paco le va a decir a
los clientes que están abiertos.
