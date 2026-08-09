# Permisos de Meta — qué pedir y qué falta para poder pedirlo

App: **Cobra Mensajería** · ID `1732760657903466`
(La otra, *Cobra Pos* `2848069578867744`, **no** es la que se usa.)

Reenviar se hace con **"Request again"** en
`/apps/1732760657903466/app-review/submissions/`.
Reenviar **no revoca** lo ya aprobado, aunque Meta avisa que puede re-revisarlo.

---

## Por qué rechazaron (revisión del 6-ago-2026)

Envío del 11-jul-2026.

- **Aprobados:** `whatsapp_business_messaging`, `whatsapp_business_management`,
  `public_profile` y los de perfil de página.
- **Rechazados:** todos los de Instagram y Páginas.
- **Motivo, idéntico para todos:** *"Screencast Not Aligned with Use Case
  Details"* — Developer Policy 1.6.

⚠️ **El caso de uso está permitido. Lo que falló fue el video.** Se mandó **un
solo video de la pantalla de Chat IA para los 15 permisos**, y ese video
demuestra WhatsApp y nada más. Por eso aprobaron WhatsApp y negaron el resto.

---

## Los 6 permisos a pedir (y NADA más)

| Permiso | Para qué |
|---|---|
| `instagram_basic` | Conectar y ver la cuenta |
| `instagram_manage_messages` | Menciones en historias + contestar mensajes directos |
| `pages_show_list` | Elegir la página al conectar |
| `pages_manage_metadata` | Suscribir la página a los avisos |
| `pages_messaging` | Recibir y contestar Messenger |
| `pages_read_engagement` | Lo exige Meta junto a los anteriores |

**Las dos fases de seguridad de los puntos funcionan con estos seis:** la 1 usa
`instagram_manage_messages` (el enlace de la mención) y la 2 usa
`instagram_basic` (leer las historias propias); el repost lo hace Sergio a mano.

**`instagram_content_publish` NO se pide ahora** — solo hace falta para que
Cobra PUBLIQUE, y en las dos fases Cobra solo mira. Igual que publicar
contenido, campañas e insights: van en una **ampliación futura y en la MISMA
app**. Una app nueva empieza sin historial y levanta sospecha.

---

## Los 3 videos (uno por flujo, no uno para todo)

Cada video muestra las **dos puntas, sin cortes**. Cada permiso se envía con el
video que lo demuestra **a él**.

1. **Conectar** — `instagram_basic`, `pages_show_list`, `pages_manage_metadata`
   Cobra → Conexiones → entrar con Facebook → **verse la lista de páginas** →
   elegir la suya → Instagram conectado.
2. **Mensajes** — `pages_messaging`, `instagram_manage_messages`
   Llega un mensaje a Messenger → **aparece en Cobra** → se contesta desde Cobra
   → **se ve llegar en Facebook**. Igual con un directo de Instagram.
3. **Historias** — `instagram_manage_messages`
   Alguien lo etiqueta → llega a Cobra → se abonan los 5 puntos → se ve subir el
   saldo.

En **modo desarrollo** la app ya recibe menciones de cuentas con rol en ella:
Sergio se etiqueta desde su cuenta personal para grabar.

---

## ⚠️ Qué falta para poder grabar (verificado en el código el 9-ago-2026)

**El orden es obligatorio: construir → grabar → reenviar.**

### Video 1 — Conectar ✅ LISTO PARA GRABAR (9-ago-2026)

- Instagram y Facebook salieron de `SOON_CHANNELS` (`chat-ia.js`). TikTok sigue
  ahí: no está construido.
- **Selector de páginas hecho.** `meta-oauth-callback` (v26) tiene dos pasos,
  porque el `code` de Facebook solo se canjea una vez:
  `paso:'listar'` canjea y devuelve las páginas **con su cuenta de Instagram**;
  `paso:'guardar'` recibe la elegida. El token queda en `meta_oauth_pendiente`
  (nunca baja al navegador) y se borra al usarse; un cron limpia lo colgado a
  los 30 min.
- Sin `paso`, la función se comporta como antes — el ejecutable puede tener la
  pantalla anterior.
- Las páginas sin Instagram vinculado salen **apagadas y con el motivo**, no
  escondidas, y el aviso aparece **antes** de elegir.

**Video 1 GRABADO el 9-ago-2026** — 1:50, guardado en
`C:\Users\USUARIO\Videos\Cobra - Permisos Meta\01-conectar-instagram-facebook.mp4`

Revisado fotograma a fotograma: se ve la lista de páginas y la elección
**las dos veces** (Instagram y Facebook). Cuentas usadas: Instagram
**@sergiosaac_** (página *Cobra Pos*) y Facebook *Sergio Saac*.

⚠️ Al revisarlo salió un fallo que habría reventado el video 2: el `meta` de
la conexión se guardaba como CADENA JSON en una columna `jsonb`, así que
`meta->>'access_token'` devolvía null y nada habría podido enviar. Corregido
en la función (v28) y reparadas las filas ya guardadas, sin reconectar.

Los videos viven en `C:\Users\USUARIO\Videos\Cobra - Permisos Meta\`, con su propio LEEME.

**DECIDIDO (9-ago): se graba con las cuentas personales de Sergio.** Conectar
las del restaurante exigía autorizaciones internas que tomaban días, y Meta no
exige que la cuenta sea la del negocio real — revisa que el permiso se vea
funcionando. Además los TRES videos deben usar **la misma cuenta conectada**:
si el 1 conecta una y el 2 muestra mensajes de otra, el reviewer se pierde. Y
con las cuentas personales es más fácil escribirse y etiquetarse para grabar
los videos 2 y 3.

⚠️ Por eso la justificación escrita describe el PRODUCTO en general —"el dueño
conecta la cuenta de su negocio para responder a sus clientes"— sin afirmar que
esa cuenta concreta sea la de El Parche.

### Video 2 — Mensajes 🔴 no se puede

`meta-webhook` solo procesa `object === "whatsapp_business_account"`. Un
Messenger o un directo de Instagram llega a Meta y **no entra a Cobra**. Y
`meta-send` está escrito solo para WhatsApp (`phone_number_id`,
`messaging_product`). En la base hay **141 conversaciones, todas de WhatsApp**.

### Video 3 — Historias 🔴 no existe

Es el endpoint de menciones, todavía pendiente. Aquí van también las dos fases
de seguridad.

---

## Datos verificados en la documentación de Meta

- El aviso de mención **no trae id de la historia**, trae **un enlace temporal**.
- *"Una vez que el usuario borra la historia o esta expira, la URL deja de
  mostrar contenido"* → así se comprueba si sigue viva: **volviendo a pedir ese
  enlace**, sin permiso adicional.
- **Solo llegan menciones de cuentas PÚBLICAS.** Si el cliente tiene Instagram
  privado no hay aviso ni puntos. **Hay que decirlo en el cartel de la promo.**
- Publicar historias por API sí se puede (`media_type: STORIES`, con
  `instagram_content_publish`) — para las propias, en la ampliación futura.
- **Repostear la mención de otro NO tiene API.** Es manual, desde el mensaje
  directo. Y cada usuario puede desactivar que le reposteen.

---

## Las dos fases de seguridad de los puntos

1. **Auto-verificador:** Cobra guarda el enlace y lo vuelve a pedir a las 6–8 h.
   Si no responde, la historia se borró → se revierten los puntos
   (`pos_puntos_movimientos` ya tiene columna `revertido`).
2. **Por el repost:** cuando Sergio repostea la mención a su historia, si el
   original se borra **su repost también desaparece**. Consultar las historias
   propias sí se puede por API. Sergio lo tiene comprobado por experiencia
   propia.
