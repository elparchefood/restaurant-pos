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
