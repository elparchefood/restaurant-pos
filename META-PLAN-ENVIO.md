# Plan de envío a Meta — quién hace qué, paso a paso

Escrito el 9-ago-2026, antes de empezar, para que no haya improvisación.

**App:** Cobra Mensajería · ID `1732760657903466`
**Dónde:** `developers.facebook.com/apps/1732760657903466/app-review/permissions/`

---

## ⚠️ Lo primero: el riesgo que hay que decidir ANTES

Meta avisa que al reenviar **puede volver a revisar lo ya aprobado**. Y lo ya
aprobado incluye `whatsapp_business_messaging` — el permiso del que depende
Paco, los pedidos por WhatsApp y todo el servicio diario de El Parche.

No es probable, pero es posible. Si en la re-revisión encontraran algo, el
WhatsApp del restaurante podría quedar limitado.

**Esto lo decide Sergio, no yo.** Dos formas de bajarlo:

- **Enviar un día tranquilo**, no un viernes ni un sábado en la noche.
- **Enviar en la mañana**, para que si algo pasa haya horas de margen antes del
  servicio.

---

## Lo que NO voy a hacer, en ningún caso

1. **No escribo contraseñas.** Ni la de Facebook, ni la de Meta, ni ninguna. Si
   aparece una pantalla de inicio de sesión o de verificación en dos pasos, me
   detengo y te la paso a ti.
2. **No acepto términos ni condiciones** en tu nombre sin preguntarte.
3. **No toco nada fuera de la solicitud** — ni configuración de la app, ni
   permisos ya aprobados, ni el número de WhatsApp.
4. **No le doy a "Submit"** sin que me lo confirmes en ese momento. Aunque hoy
   me digas que sí, te lo vuelvo a preguntar cuando el formulario esté lleno y
   puedas verlo.

---

## Lo que necesito de ti antes de empezar

1. **Chrome abierto y con tu sesión de Meta ya iniciada.** Entra tú a
   `developers.facebook.com` y déjalo en la página de la app. Yo trabajo desde
   ahí en adelante.
2. **Que me digas "arranca".** No empiezo solo.
3. **Un rato sin usar el computador**, porque voy a estar moviendo el navegador.

---

## El proceso, paso a paso

### Paso 0 — Mirar antes de tocar

Abro la página de App Review y **te reporto lo que veo** antes de escribir
nada: en qué estado está la solicitud anterior, si el botón es "Request again"
o hay que empezar de cero, y si Meta pide algo que no teníamos previsto.

Si lo que veo no coincide con lo planeado, **paro y te pregunto**.

### Paso 1 — Seleccionar los seis permisos

Marco exactamente estos, **y ninguno más**:

- `instagram_basic`
- `instagram_manage_messages`
- `pages_show_list`
- `pages_manage_metadata`
- `pages_messaging`
- `pages_read_engagement`

Si veo marcado alguno de más de la vez pasada, lo desmarco y te aviso cuál era.

### Paso 2 — Pegar los seis textos

Uno por permiso, los de `TEXTOS-PARA-EL-FORMULARIO.md`, sin cambiarlos.

### Paso 3 — Subir los videos, cada uno con SU permiso

| Permiso | Video |
|---|---|
| `instagram_basic` | `01-conectar-instagram-facebook.mp4` |
| `pages_show_list` | `01` |
| `pages_manage_metadata` | `01` |
| `pages_read_engagement` | `01` |
| `pages_messaging` | `02-mensajes-instagram-facebook.mp4` |
| `instagram_manage_messages` | `02` |

**Este es el paso donde se perdió la vez pasada:** un solo video para los 15
permisos. Aquí cada permiso lleva el video que lo demuestra a él.

### Paso 4 — Revisar TODO antes de enviar

Antes de tocar "Submit":

1. Tomo una captura de cada sección llena.
2. **Te las muestro.**
3. Te digo qué falta, si falta algo.
4. **Espero tu "sí, envía".**

### Paso 5 — Enviar y dejar constancia

Le doy a enviar, guardo la confirmación y anoto la fecha en el LEEME.

---

## Dónde me voy a detener a preguntarte

- Si aparece **cualquier pantalla de contraseña o de código de verificación**.
- Si Meta pide **una cuenta de prueba de Cobra** para que el revisor entre
  (ver abajo).
- Si el formulario pide algo que **no está en este plan**.
- Si veo permisos marcados que **no acordamos**.
- **Antes de enviar**, siempre.

---

## Lo que puede aparecer y no tenemos resuelto

**Meta suele pedir credenciales de prueba** para que el revisor entre a la app y
compruebe lo que muestra el video. Si lo pide, hay que crearle un usuario de
Cobra con datos de ejemplo — no la cuenta real de El Parche, porque el revisor
vería los pedidos y los teléfonos de tus clientes.

No lo dejo preparado ahora porque no sé si lo van a pedir. Si aparece, paro,
te lo digo, y lo armamos antes de seguir.

---

## Si Meta rechaza otra vez

El motivo llega escrito en la consola. Lo leo, te lo traduzco, y arreglamos lo
que señalen. Reenviar no cuesta nada más que el tiempo de revisión.
