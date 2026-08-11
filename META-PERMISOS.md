# Permisos de Meta

> ✅ **SOLICITUD ENVIADA el lunes 10-ago-2026 en la manana.** Status: Review in
> progress (Meta: ~20 dias). 6 permisos nuevos + renovacion de los 7 aprobados.
> No se puede editar ni cancelar mientras este en revision. La cuenta demo
> (elparche.foodpopayan+metademo@gmail.com) debe seguir activa hasta el
> resultado. El resultado llega a App Review -> Submissions y al Alert Inbox.

App: **Cobra Mensajería** · ID `1732760657903466`
(La otra, *Cobra Pos* `2848069578867744`, **no** es la que se usa.)

Reenviar se hace con **"Request again"** en
`/apps/1732760657903466/app-review/submissions/`.
Reenviar **no revoca** lo ya aprobado, aunque Meta avisa que puede re-revisarlo.

---

## ⚠️ Lo que el acceso ESTÁNDAR sí y no permite (comprobado el 10-ago-2026)

Con acceso estándar (lo de hoy, mientras Meta revisa) Instagram y Messenger
**solo entregan mensajes de cuentas que tienen un rol en la app** —
administrador, desarrollador o tester. Los mensajes de un cliente cualquiera
**no llegan al webhook**.

Consecuencia práctica: **conectar las cuentas reales de El Parche ahora no
sirve de nada.** No se puede pedirle a cada cliente que acepte una invitación
de tester. Hasta que Meta apruebe, Instagram y Messenger se siguen
contestando desde sus apps.

**WhatsApp NO está afectado** — `whatsapp_business_messaging` ya está aprobado
y funciona con todos los clientes. La operación diaria del restaurante
(pedidos, Paco) no depende de esto.

El 10-ago se perdió medio día persiguiendo permisos de Business Suite
("acciones sensibles", control total de la página, socios) creyendo que ese
era el bloqueo. Sí era un bloqueo real para conectar, pero **aunque se
resuelva, los mensajes de clientes siguen sin llegar sin la aprobación.**

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

### 📋 Checklist para la AMPLIACIÓN FUTURA (publicar, comentarios, insights)

Decidido el 10-ago-2026: la plataforma SÍ va a publicar contenido, gestionar
comentarios y leer estadísticas más adelante — se dejó fuera del MVP a
propósito. Para el envío del 10-ago se limpió TODO rastro de esas funciones,
así que cuando se pidan hay que volver a ponerlo, consistente en cada lugar:

1. **Construir la función primero** y grabar su propio video (orden obligatorio:
   construir → grabar → pedir). Un video por flujo.
2. **Permisos a agregar en App Review:** `instagram_content_publish`,
   `instagram_manage_comments`, `instagram_manage_insights` / `read_insights`,
   `pages_manage_posts`, `pages_manage_engagement`, `pages_read_user_content`
   (según qué se construya). Los cuatro últimos se ELIMINARON de los casos de
   uso el 10-ago — hay que re-agregarlos con "Add to App Review".
3. **Testing instructions** (App settings → Basic): el texto de agosto-2026
   dice literalmente *"We do not publish content, and we do not read posts,
   comments or insights"* — **quitar esa frase** y describir el flujo nuevo
   paso a paso con la cuenta demo.
4. **Términos de servicio** (`terms.html` → cobrapos.app/terms): la sección 5
   "Canales conectados" solo habla de mensajes — ampliarla con publicación de
   contenido y estadísticas, y subir la versión.
5. **Textos del formulario:** escribir justificaciones nuevas (no reciclar las
   de mensajería) y adjuntar el video que demuestra CADA permiso.
6. **Cuenta demo:** darle a la cuenta `+metademo` acceso a la función nueva
   para que el revisor la pruebe.
7. La justificación de los permisos ya aprobados no se toca.

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

### Video 2 — Mensajes ✅ GRABADO 9-ago-2026

`meta-webhook` (v62) aprendió `object === "page"` y `object === "instagram"`
—los dos llegan como `entry[].messaging[]`, así que van por una sola rama— y
`meta-send` (v14) responde por la API de mensajes de página.

⚠️ **Instagram se responde por el id de la PÁGINA, no por el de la cuenta.** Al
id de la cuenta, Meta contesta *"(#3) Application does not have the capability
to make this API call"* — que suena a permiso faltante y no lo es: el token SÍ
tiene `instagram_manage_messages` (verificado en `/me/permissions`).

⚠️ Los **ecos** se ignoran: lo que Cobra manda vuelve por el webhook y sin ese
filtro cada respuesta salía dos veces.

⚠️ **Un contacto, una conversación:** Meta entrega el mismo aviso dos veces y
dos llegaron con 84 ms de diferencia, creando la conversación por duplicado.
Cerrado con el índice único `ux_chat_conv_contacto`.

**REGRABADO el 9-ago.** La primera toma mostraba los mensajes bien pero
**arrancaba con Cobra ya conectado**, y a Meta le faltaban dos de sus tres
requisitos: el inicio de sesión completo y el usuario **concediendo** el
permiso. Cada video tiene que ser autosuficiente — el revisor abre UNO solo.

La segunda toma (2:40) tiene todo, sin cortes: canales en "Conectar" → pantalla
de Meta *"Revisa lo que compartirás"* → Instagram conectado → Facebook conectado
→ mensaje desde Instagram → aparece solo en Cobra → se contesta → se ve llegar
en Instagram → lo mismo por Messenger.

### Subtítulos ✅ 9-ago-2026

Meta pide interfaz en inglés o subtítulos. Cobra no se tradujo: se incrustaron
subtítulos en inglés que traducen los textos clave y **nombran el permiso** que
se demuestra en cada momento. Los archivos a subir son
`01-ENVIAR-conectar.mp4` y `02-ENVIAR-mensajes.mp4`.

### Video 3 — Historias 🔴 no existe, y NO se envía

Es el endpoint de menciones, todavía pendiente. Aquí van también las dos fases
de seguridad.

**No se envía en esta solicitud.** El permiso que lo cubriría
(`instagram_manage_messages`) ya queda demostrado con el video 2. Pedir algo que
no se puede mostrar es exactamente lo que costó el rechazo de julio. Va en la
ampliación futura, con su propio video.

---

## Lo único que falta antes de enviar

Meta dice *"probaremos tu app con nuestras propias cuentas de prueba"* y pide
*"describir cómo podemos acceder a tu app"*. Hay que darle al revisor un
**usuario de Cobra con datos de ejemplo** — no la cuenta real de El Parche,
porque vería los pedidos y los teléfonos de los clientes.

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
