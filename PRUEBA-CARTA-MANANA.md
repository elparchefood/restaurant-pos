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
