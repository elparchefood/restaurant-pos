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

## Probado

Ocho situaciones, en una conversación de prueba con un número que no existe —
nunca sobre un cliente. Los tres estados, los dos canales, el pedir más, el
"cuánto demora", el saludo suelto y el pedido ya entregado. Todo borrado al
terminar.
