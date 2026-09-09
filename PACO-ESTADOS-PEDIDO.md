# Paco consciente del estado del pedido

> 9-sep-2026. **Hecho y probado.** Pedido de Sergio: *"tiene que ser realmente
> consciente del estado del pedido"*.

---

## Por qué se equivocaba

Lo que había (22-ago) le pasaba al **modelo** una frase de contexto con solo
**dos** estados: *"YA VA EN CAMINO"* o *"está EN PREPARACIÓN"*. Un pedido en
**listo** se contaba como preparación. Y como el modelo redacta libre, podía
decir cualquier cosa — de ahí el *"está en camino"* cuando estaba en la plancha.

Adivinar sobre un dato que la base sabe exacto.

## La pieza que ya existía

**Los mensajes de cada estado ya los escribió Sergio** en la pantalla de
Estados (`ia_config.estados_config`), separados por canal:

| Canal | Estado | Lo que ya estaba escrito |
|---|---|---|
| domicilio | en_preparacion | *Tu pedido está en preparación 😋 Apenas esté en camino, te avisamos…* |
| domicilio | en_camino | *🛵 Tu pedido está en camino, esperamos que lo disfrutes 😋* |
| llevar | listo | *¡Tu pedido ya está listo! 🍟 Puedes pasar a recogerlo cuando gustes.* |

Son las **mismas** que salen solas cuando el estado cambia. Ahora, cuando el
cliente **pregunta**, se le contesta con esa misma frase. **Una sola fuente:**
si Sergio cambia ese texto en su pantalla, cambia en los dos sitios a la vez.

*(Solo hay frase de reserva donde la casilla está vacía — hoy, "listo" a
domicilio: «¡Tu pedido ya está listo! 🍟 En un momento arranca el domiciliario
para allá.» En cuanto Sergio la escriba, manda la suya.)*

## Las reglas, tal como las dio

Con un pedido **en proceso** (preparación, listo o en camino, y menos de 6 h):

| Lo que dice el cliente | Qué hace Paco |
|---|---|
| Pregunta cómo va (*"ya salió?"*, *"en qué va lo mío"*) | La frase de **su** estado |
| Quiere pedir más | Le dice el estado y **pasa a una persona** |
| Otra cosa de su pedido (cuánto demora, un cambio, un reclamo) | Le dice el estado y **pasa a una persona** |
| Cualquier otra cosa (*"hola"*) | Saluda, le dice el estado y pregunta si tiene alguna duda |

**Sin pedido en proceso** (entregado, cancelado o ninguno): Paco atiende con
total normalidad, como siempre.

## Dos decisiones que conviene saber

**La intención la lee el modelo, no una lista de palabras.** Regla de Sergio,
reclamada tres veces. Se añadió un campo `mi_pedido` al clasificador: ninguna
lista iba a cubrir *"ya salió?"*, *"en qué va lo mío"*, *"sera que se demora"*.

**Al dudar, se dice el estado más atrasado.** Si `estado` está vacío, no se
deduce "en camino" de nada. Decirle *"va en camino"* a quien todavía lo tiene
en la plancha es exactamente el error que Sergio reportó; quedarse corto se
arregla con el siguiente aviso.

## ⚠️ Una cosa que se perdió, y Sergio decide

Sergio pidió que *"¿cuánto se demora?"* pase a una persona. **Hecho.**

Pero desde el 22-ago Paco sabía contestar eso con el **promedio real** de la
cocina (medido sobre los últimos 30 pedidos en `pos_domi_tiempos`, y solo si
hay al menos 5). Hoy esa respuesta ya no sale: va a una persona.

Si Sergio prefiere que Paco conteste el promedio cuando lo tiene, y solo pase a
una persona cuando no, es un cambio de una línea.

## ⚠️ La raíz, encontrada al probarlo en vivo (9-sep)

Sergio, con un pedido de verdad en preparación: *"le escribí «¿sabes si ya
salió mi pedido?» y me mandó el botón de la carta como si fuera a pedir desde
cero"*.

La compuerta estaba bien. **Lo que fallaba es que la conversación había perdido
el enlace con su pedido** (`order_id` en null), así que no había ningún pedido
que encontrar.

### De dónde salía ese null

El 1-sep se arregló un fallo real: `order_id` no se limpiaba nunca y apuntaba
al último pedido **para siempre**. A Linda Isabela le costó el pedido entero —
Paco se lo tomó completo, ella dijo *"sí gracias"* y nunca se creó, porque el
chat "ya tenía pedido": uno de tres semanas antes. La solución fue soltarlo al
empezar una sesión nueva.

**Pero "sesión nueva" es cualquier mensaje que llegue sin un pedido a medio
armar** — y justo después de crear un pedido, el estado se limpia. O sea: el
pedido entraba a cocina y **el primer mensaje que escribiera el cliente rompía
el enlace**. Desde ahí Paco no sabía que esa persona tenía un pedido.

**No es de la carta ni de hoy.** Medido: **371 conversaciones** sin `order_id`
teniendo un pedido en curso en su misma sede.

### El arreglo

Un pedido **en preparación no es "el pedido viejo"**. Se suelta solo cuando de
verdad terminó —entregado o cancelado— o cuando pasaron 6 horas. El caso de
Linda sigue cubierto: el suyo era de tres semanas antes.

Y se añadió lo que faltaba copiar del bloque de 22-ago: si la conversación no
tiene enlace, se busca el último pedido **por el teléfono** de quien escribe.
Así Paco reconoce también el pedido hecho por la página, por la caja o por la
app, que nunca tocan el chat.

### Y una trampa que casi se cuela

La condición nueva lee `convRow.order_id`, pero esa consulta **no pedía esa
columna**. Un `select` sin la columna no da error: devuelve la fila sin el
dato. La condición habría sido siempre falsa, el pedido viejo no se soltaría
nunca y volvería el fallo de Linda Isabela. Se añadió a la lista de campos.

---

## ⚠️ Se me fue la mano: apagué la conversación entera (9-sep)

Sergio: *"le respondí «muchas gracias» y volvió a decirme «Hola Sergio, tu
pedido está en camino, ¿tienes alguna duda?». Tenía que responderme de manera
natural, como ya lo venía haciendo."*

**Tenía razón, y es un fallo de diseño mío.** Su regla era *"no contestar desde
cero"* y yo la implementé como *"contestar siempre lo mismo"*. No es lo mismo:
eso no es dejar de empezar de cero, es **dejar de escuchar**. Y de paso apagó
algo que ya funcionaba desde el 22-ago — el modelo respondiendo natural con el
pedido en contexto.

### La línea correcta

Se fija **solo lo que se estaba equivocando**, no la conversación:

| Lo que dice el cliente | Qué hace Paco |
|---|---|
| Algo salió mal (*"llegó frío"*) | **A una persona**, sin frase de catálogo |
| Pregunta cómo va (*"ya salió?"*) | La frase exacta de su estado |
| Quiere pedir más (o pide la carta) | Le dice el estado y **a una persona** |
| Otra cosa de su pedido | Le dice el estado y **a una persona** |
| Un saludo **a secas** | Saluda, dice el estado y pregunta si tiene dudas |
| **Todo lo demás** | El camino de siempre: natural, con el pedido en contexto |

**El reclamo va primero a propósito.** Aunque el lector se equivoque al
clasificar, a quien está molesto nunca le llega una frase enlatada.

### Dos cosas que aprendió el lector

- **Contar no es preguntar.** *"Ya me llegó"*, *"quedó delicioso"* no son
  preguntas por el estado: el cliente está contando.
- **Si algo salió mal es un problema**, no una pregunta de estado.

### Y el contexto del modelo llevaba el fallo original

Solo sabía decir *"en camino"* o *"en preparación"* — un pedido en **listo** se
contaba como preparación. De ahí salía el *"dijo que estaba en camino cuando
estaba en preparación"*. Ahora lleva el estado exacto **y la frase que el
restaurante escribió**.

### Los siete caminos, probados

| El cliente dice | Paco responde |
|---|---|
| llegó frío | *Ya le aviso a una persona* → **a una persona** |
| me faltó la gaseosa | *Ya le aviso a una persona* → **a una persona** |
| muchas gracias | *Con muchísimo gusto, estamos para servirte* 🤟🏼 |
| perfecto, ya me llegó | *¡Dale! Me alegra que ya te haya llegado…* |
| hola | *¡Hola Sergio! 😊 Tu pedido está en camino… ¿Tienes alguna duda?* |
| ya salió mi pedido? | *🛵 Tu pedido está en camino, esperamos que lo disfrutes* |
| me sumas unas papas | el estado + *te comunico con una persona* → **a una persona** |

---

## El saludo: "Hola El" (9-sep)

Sergio, probando con el pedido en *listo*: *"Paco me saludó con el nombre de
«El», ¿por qué?"*.

Porque yo usaba el **nombre del perfil de WhatsApp** y le cortaba la primera
palabra. Su perfil se llama *"El Parche Comidas Rapidas"*.

El fallo no era el corte: era **la fuente**. Ese nombre lo escribe cada quien
para sí mismo — un negocio, un apodo, emojis (*"Maicol🥷🏻"*), *"RAPISER.COM.."* —
y nunca fue un nombre para dirigirse a alguien.

### Las tres fuentes, en orden

1. **La ficha del cliente.** Es el nombre que escribió el restaurante. Y cuando
   alguien **renombra un contacto desde el panel**, se guarda ahí *y* en el
   chat a la vez — o sea que *"el nombre guardado en Cobra"* es exactamente
   éste.
2. **Sin ficha, el perfil de WhatsApp — pero solo si de verdad es de una
   persona.** Lo decide el lector, no una lista de palabras: ninguna lista
   cubre apodos, emojis y nombres de negocio. Se añadió un campo al
   clasificador que **ya corre en cada mensaje**, así que no cuesta un viaje
   más.
3. **Si no, sin nombre.** Saludar sin nombre no le molesta a nadie; con el
   nombre equivocado, sí.

### Probado

| Perfil de WhatsApp | Ficha | Paco saluda |
|---|---|---|
| El Parche Comidas Rapidas | Sergio Abadía | **¡Hola Sergio!** |
| El Parche Comidas Rapidas | — | ¡Hola! *(sin nombre)* |
| Daniela Martinez | — | **¡Hola Daniela!** |
| Maicol🥷🏻 | — | ¡Hola! *(sin nombre)* |

---

## Probado

Ocho situaciones, en una conversación de prueba con un número que no existe —
nunca sobre un cliente. Los tres estados, los dos canales, el pedir más, el
"cuánto demora", el saludo suelto y el pedido ya entregado. Todo borrado al
terminar.
