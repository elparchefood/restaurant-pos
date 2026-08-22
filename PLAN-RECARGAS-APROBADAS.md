# Plan — Las recargas ya confirmadas no deben pedir aprobación

> ✅ **HECHO el 21-ago-2026 por la noche**, revisando las 8 con Sergio. El
> detalle de lo que se encontró y cómo quedó está en `ESTADO-SISTEMA.md`
> ("Un comprobante ya no se puede cobrar dos veces"). Los puntos 1 a 5 de
> abajo están todos resueltos.
>
> Lo que apareció al revisarlas y este plan no sabía: **el cobro doble ya
> había ocurrido** — la solicitud 14 volvió a abonar el mismo comprobante de
> la 13 ($230.000 con el bono), porque el candado dependía de la referencia
> bancaria y esa vez no se leyó. El candado ahora es la FOTO, no la
> referencia.
>
> ⚠️ **Lo único pendiente:** decidir con Sergio qué hacer con esos $230.000 de
> más en el saldo de su propia cuenta de pruebas.

## El problema, en sus palabras

> "Si la recarga se confirmó automáticamente, la solicitud debe aparecer pero
> ya aprobada, no con un botón para aprobarla, porque se aprobaría dos veces.
> Debería quedar pendiente solo lo que no se pudo confirmar solo."

## Lo que se verificó en la base (21-ago, 17:15)

En El Parche hay **8 solicitudes, TODAS en estado `leida`** — ninguna marcada
como aplicada. Y hay **3 abonos de saldo reales** (`pos_saldo_mov`, motivo
`recarga`):

| Abono | Monto | Referencia |
|---|---|---|
| 08-21 01:06 | $210.000 | — |
| 08-19 16:07 | $210.000 | M15084814 |
| 08-19 13:26 | $55.000 | M10646978 |

O sea: **hay solicitudes cuyo dinero YA se abonó y que siguen mostrando el botón
"Aprobar".** Darle ahí abona el saldo **otra vez**. El riesgo es real y está
vivo ahora mismo en la pantalla.

## La causa de fondo

⚠️ **El abono no guarda de qué solicitud vino.** `pos_saldo_mov` no tiene
`solicitud_id`, y `pos_recargas_solicitudes` no tiene `mov_id`. Son dos tablas
que hablan del mismo hecho y no se conocen.

Por eso nada puede darse cuenta de que ya se abonó: ni la pantalla para ocultar
el botón, ni la función para negarse. Todo lo demás son síntomas de esto.

## Qué hay que hacer

### 1. Unir las dos tablas
`pos_recargas_solicitudes` + `mov_id uuid` (o `pos_saldo_mov` + `solicitud_id`).
Al abonar, se escribe el vínculo. Es lo primero, y sin esto lo demás no se puede.

### 2. Que la verificación automática cierre la solicitud
Cuando el sistema confirma la transferencia solo (`verificar-transferencia` /
`verify-transfer`), la solicitud debe quedar en **`aplicada`**, no en `leida`.
Hoy se abona el saldo y la solicitud se queda como si nadie la hubiera atendido.

### 3. Un candado en la función, no solo en la pantalla
`fn_recarga_aplicar` debe **negarse** si esa solicitud ya tiene abono. Esconder
el botón no basta: una pantalla vieja abierta en otro equipo, un doble clic o
un reintento por mala señal vuelven a llamarla igual.

Este es el que de verdad protege la plata.

### 4. La pantalla, al final
- Ya aplicada → **insignia verde "Aprobada automáticamente"**, con la hora y el
  monto abonado. Sin botones.
- Sin confirmar → los botones **Aprobar / Descartar** como hoy.
- Y separar visualmente las dos cosas, para que se vea de un vistazo qué falta
  por revisar de verdad.

### 5. Limpiar lo de hoy
Las 8 solicitudes actuales hay que revisarlas **una por una con Sergio**: cuáles
corresponden a los 3 abonos que sí ocurrieron y cuáles fueron pruebas suyas del
1:06–1:09. **No se decide solo**: es plata, y varias son del mismo monto
($210.000 tres veces), así que emparejarlas por monto y hora es adivinar.

## Cuidado al hacerlo

- Nada de "aplicar todas las que tengan un abono cerca en el tiempo". Hay tres
  solicitudes de $210.000 el mismo día: emparejar por monto y hora es inventar.
- Probar en el restaurante de prueba, con una solicitud creada ahí.
- Verificar el saldo del cliente ANTES y DESPUÉS: es la única prueba de que no
  se abonó dos veces.
