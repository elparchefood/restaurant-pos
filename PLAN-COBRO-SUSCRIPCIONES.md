# Cómo cobra Cobra — plan de la pasarela de pagos

> **Decidido el 7-sep-2026 con Sergio. Sin escribir una línea de código
> todavía: se implementa el día que él lo diga.**
> Este archivo es la fuente de verdad de esa decisión. Si algo aquí no cuadra
> con lo que se vaya a programar, gana lo que está escrito aquí — o se cambia
> aquí primero.

---

## 1. La decisión

**Todo por Wompi. La transferencia NO es una opción del cliente.**

| Periodo | Cómo paga |
|---|---|
| Mensual | Débito automático (Nequi, cuenta Bancolombia o tarjeta) |
| Trimestral | Débito automático |
| Anual | Pago único (no necesita recurrencia) |

### Por qué, que importa más que el qué

La primera propuesta fue ofrecer las dos cosas —débito automático o
transferencia— y dejar que el cliente escogiera. Sergio la tumbó dos veces, y
las dos tenía razón:

1. *"Si les das a escoger, la mayoría va a escoger transferencia normal, luego
   se olvidan y se salen."* — El que escoge transferencia es exactamente el
   que se va a olvidar. Dar a escoger no es neutral: es empujar al cliente
   hacia la puerta de salida.
2. *"Sea mensual o trimestral debería ser con débito automático, y el anual,
   una persona que tenga el dinero para pagar el año lo más seguro es que
   pague con tarjeta."* — El anual no necesita recurrencia: es un pago y ya.

### La transferencia sigue existiendo — como extintor

El sistema de comprobantes que YA está hecho (`verificar-pago-plataforma`, que
lee el comprobante con visión y además cruza el correo del banco en el Gmail de
Cobra) **no se toca**. Cambia dónde vive:

- En la pantalla de registro: **no aparece**. Nadie la ve, nadie la escoge.
- En el panel de Sergio: un botón *"cobrar por transferencia esta vez"*, que
  manda los datos y enciende el lector de comprobantes de siempre.

Sergio: *"El sistema que ya tenemos puede ser para emergencias."*
Es la diferencia entre una puerta de la tienda y un extintor.

---

## 2. Los avisos y los reintentos

**Se avisa ANTES, no solo después.** Es la corrección que hizo Sergio a la
primera propuesta, que solo miraba el cobro ya fallido: avisar a tiempo evita
el fallo, y evitarlo sale mucho más barato que perseguirlo.

### Antes del cobro — 1 semana, 3 días y 1 día antes

> *El 18 de agosto se cobrará tu plan. Recuerda tener el dinero en tu tarjeta
> \*\*\*0565 / en tu cuenta Nequi \*\*\*3265 / en tu cuenta Bancolombia
> \*\*\*6525.*

### Si el cobro no pasa — reintentos a 1 día, 3 días y 1 semana

Máximo una semana de reintentos. **Siempre con avisos amables.**
Sergio: *"Para que el cliente no se quede sin sistema."*

Pasada esa semana entra el modal de bloqueo que ya existe (la cuenta NO
desaparece: se bloquea y lleva al pago). Y Sergio puede cobrar por
transferencia desde su panel en cualquier momento.

### Lo que esto le exige a la integración

Tres cosas que hay que resolver AL INSCRIBIR, no después:

1. **Guardar con qué medio quedó inscrito y sus últimos 4 dígitos** — tarjeta,
   Nequi o cuenta. El aviso los dice, y un *"se te cobra el 18"* sin decir de
   dónde no le sirve a nadie. Wompi los devuelve al tokenizar; si no se
   guardan en ese momento, después no hay de dónde sacarlos.
2. **Saber la fecha exacta del próximo cobro desde el primer día**, porque los
   tres avisos se cuentan hacia atrás desde ella.
3. **El plan anual no tiene cobro automático.** Sus avisos no pueden decir
   "ten el dinero listo" sino *"se te vence, renueva aquí"*, con su botón. Es
   el mismo calendario (7, 3 y 1 día antes) pero otro texto y otra acción. Si
   no se separan, el cliente anual recibe un aviso que no le corresponde.

---

## 3. Las cuentas

Medido el 7-sep-2026 en `wompi.com/es/co/planes-tarifas`:
**2,65% + $700 + IVA por transacción exitosa.**

| Plan | Precio | Comisión aprox. |
|---|---|---|
| Starter | $149.000 | ~$5.500 |
| Pro | $249.000 | ~$8.700 |

Alrededor del **3,5% de lo facturado**. Se paga solo: un cliente Pro que dura
un año son ~$3.000.000, y la comisión de ese año ~$104.000. Evitar UNA baja
por olvido lo paga treinta veces.

---

## 4. Antes de programar nada — le toca a Sergio

1. **Abrir la cuenta de comercio** en wompi.com y pasar la validación de
   Bancolombia. Preguntar ahí: *¿hay costo de afiliación o mensualidad? ¿qué
   papeles piden?* — no se pudo confirmar, su página de tarifas no lo dice.
2. **Pedir expresamente cobro recurrente con Nequi y cuenta Bancolombia**, no
   solo con tarjeta. Ese es el punto que hace que sirva para los clientes de
   Cobra, que son restaurantes pequeños y muchos no tienen tarjeta de crédito.
3. **Pasar las cuatro llaves, las de PRUEBA primero** (`pub_test_`,
   `prv_test_`): llave pública, llave privada, secreto de eventos y secreto de
   integridad.

Con las llaves de prueba se monta y se prueba el flujo entero sin mover un peso.

> ⚠️ **Las llaves NO van en este repositorio, que es público.** Van en los
> secretos de Supabase y solo las lee la Edge Function, igual que las de
> Factus y las de Meta.

---

## 5. ✅ CONFIRMADO el 7-sep-2026 — el diseño se sostiene

**Sergio abrió la cuenta de comercio y llegó hasta el final del registro.** De
las tres cosas que estaban en el aire, dos quedaron resueltas:

**1. No hay costo de afiliación ni mensualidad.** Comprobado haciéndolo: pasó
el registro completo sin pagar nada. Solo la comisión por transacción.

**2. El cobro recurrente SÍ funciona con Nequi y con Bancolombia.** Verificado
en su documentación (`docs.wompi.co/docs/colombia/fuentes-de-pago`), no de
oídas. Es la pieza de la que dependía todo el plan: un restaurante pequeño
puede autorizar el débito sin tener tarjeta de crédito.

Las **fuentes de pago** (*payment sources*) son el mecanismo: se guarda el medio
de pago una vez y después se cobra desde el servidor sin que el cliente esté
presente. Admiten **tarjeta, Nequi, DaviPlata y Bancolombia**.

### Los endpoints, para no buscarlos después

| Para qué | Método | Camino |
|---|---|---|
| Tokenizar tarjeta | POST | `/v1/tokens` |
| Tokenizar Nequi | POST | `/v1/tokens/nequi` |
| Tokenizar DaviPlata | POST | `/v1/tokens/daviplata` |
| Crear la fuente de pago | POST | `/v1/payment_sources` |
| Cobrar | POST | `/v1/transactions` |
| Cancelar la suscripción | PUT | `/v1/payment_sources/{id}/void` |

Para crear la fuente de pago hacen falta: el token del medio de pago, el
`acceptance_token` (política de privacidad), `accept_personal_auth`
(autorización de datos personales), el correo del pagador y **la llave privada
— desde el servidor, nunca desde el navegador**.

### Lo que ya se puede hacer HOY, sin integrar nada

La cuenta trae un **enlace de cobro** que acepta tarjeta, Nequi y PSE. O sea que
al primer cliente se le puede cobrar por WhatsApp con ese enlace mientras se
construye lo demás. Es mejor camino que el sistema de comprobantes.

⚠️ El dinero recibido **queda retenido hasta que Wompi apruebe el comercio**
(dicen máximo 3 días hábiles).

## 6. Lo único que queda por ver

- Cómo se ve, para el cliente, la autorización del cobro recurrente con Nequi.
  La documentación del detalle está cerrada desde fuera; se verá al montarlo
  con las llaves de prueba. **No bloquea nada**: si la experiencia resulta mala,
  se cambia el texto de la pantalla, no el diseño.
