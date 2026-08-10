# Cómo grabar exactamente cada video

Escrito el 9-ago-2026 después de leer los requisitos completos de Meta.
Antes te di una versión incompleta y por eso grabaste dos veces. Esto es lo
verificado, con la fuente al lado.

---

## Lo que Meta exige (literal, de su guía)

| Requisito | Texto de Meta |
|---|---|
| Uno por permiso | *"Repite el paso 3 para cada permiso y función"* |
| Inicio de sesión completo | *"Captura el proceso de inicio de sesión completo, desde que la sesión esté cerrada hasta que la sesión esté abierta"* |
| Otorgar el permiso | *"Cómo el usuario le concede a la app el permiso que estás demostrando"* |
| Resolución | *"Graba en alta resolución, idealmente 1.080 o más"* |
| Idioma | *"Selecciona inglés como el idioma de la UI"*; si no se puede, *"proporciona subtítulos"* |
| Solo lo necesario | *"Graba solo lo que necesitamos ver"* |
| Descripciones | *"Cada permiso debe tener su propia descripción. No copies y pegues"* |

### ⚠️ Qué significa "sesión cerrada"

Significa **desconectado EN COBRA**, no cerrar sesión de Facebook.

Meta lo dice respecto a TU app: el canal aparece sin conectar, pasas por el
flujo de Facebook, y queda conectado. Ese es el recorrido de un usuario real —
casi todos los dueños ya están con Facebook abierto en su navegador.

**NO hay que escribir usuario y contraseña en cámara.** Meta pide expresamente
que no se incluyan credenciales personales, así que grabarlas iría en contra.
Si la ventana de Facebook dice *"Continuar como Sergio"*, eso cuenta como el
inicio de sesión.

**Lo que de verdad tiene que verse es el punto siguiente:** la pantalla donde
se OTORGAN los permisos. Meta lo dice literal: *"cómo el usuario le concede a
la app el permiso que estás demostrando"*. Quédate ahí 2-3 segundos.

⚠️ Lo que nos costó julio: **cada video tiene que ser autosuficiente**. El
revisor abre UNO solo y ahí dentro tiene que ver el inicio de sesión, el
otorgamiento del permiso y la función andando. No puede tener que mirar otro
video para entender.

---

## Son DOS videos

### VIDEO A — Conectar ✅ YA LO TIENES, sirve tal cual

`01-conectar-instagram-facebook.mp4` (1:50)

**Para estos 4 permisos:** `instagram_basic`, `pages_show_list`,
`pages_manage_metadata`, `pages_read_engagement`

Cumple los tres puntos porque **empieza con la sesión cerrada**: entras con
Facebook, otorgas los permisos en la ventana de Meta, eliges la página y quedan
conectados Instagram y Facebook.

**No hay que regrabarlo.** Solo le faltan los subtítulos (ver abajo).

---

### VIDEO B — Mensajes ⚠️ ESTE ES EL QUE FALTA

**Para estos 2 permisos:** `pages_messaging`, `instagram_manage_messages`

El que grabaste (`02-mensajes...`) muestra los mensajes perfectamente, pero
**arranca con Cobra ya conectado**. Le faltan el punto 1 y el 2.

#### Cómo grabarlo, exacto

**Antes de darle a grabar:**

1. En Cobra, entra a Chat IA → Conexiones y **desconecta Instagram y Facebook**.
   Tienen que verse con el botón "Conectar", como al principio.
2. Abre **una ventana de Chrome aparte** con `instagram.com` iniciado con la
   cuenta **@sergiosaac.co** (la que le escribe al restaurante), en el chat con
   @sergiosaac_. Déjala lista.
3. Abre **otra pestaña** con `facebook.com` como Andrés, con el chat a Sergio
   Saac abierto.
4. Desde esas dos cuentas, **manda un mensaje cualquiera** ("hola") para abrir
   la ventana de 24 horas. Sin esto, Meta no deja responder.
5. Acomoda Cobra y el navegador **lado a lado**, para no tener que alternar
   ventanas a ciegas.

**Ya grabando, sin cortar en ningún momento:**

| # | Qué hacer | Por qué |
|---|---|---|
| 1 | Cobra → Chat IA → Conexiones, con Instagram y Facebook **sin conectar** | Punto 1: sesión cerrada |
| 2 | Instagram → *Conectar con Meta* → entrar con Facebook | Punto 1: inicio de sesión completo |
| 3 | **En la ventana de Meta, detente 2-3 segundos** en la pantalla donde se otorgan los permisos, antes de darle a continuar | Punto 2: el usuario concediendo el acceso. **Este es el que faltó.** |
| 4 | Elegir la página → "Instagram conectado" | |
| 5 | Repetir con Facebook | |
| 6 | Ir a Instagram (la otra cuenta) y **escribir un mensaje nuevo** al restaurante | Punto 3, de ida |
| 7 | Volver a Cobra y **esperar** a que aparezca solo, sin recargar | Punto 3, lo importante |
| 8 | Abrirlo y **contestar desde Cobra** | |
| 9 | Volver a Instagram y **mostrar la respuesta llegada** | Punto 3, de vuelta |
| 10 | Repetir 6-9 con Facebook/Messenger | |

Duración estimada: 3 a 4 minutos.

**Errores que lo tumban:**
- Empezar con los canales ya conectados
- Pasar rápido por la ventana de permisos de Meta
- Cortar la grabación entre paso y paso
- Recargar Cobra para que aparezca el mensaje (tiene que llegar solo)

---

## Los subtítulos — los pongo yo

Cobra está en español y Meta pide inglés o subtítulos. **No hay que traducir
Cobra**: alcanza con subtítulos en inglés explicando qué pasa en pantalla.

Tú me pasas los dos videos y yo les incrusto los subtítulos. No tienes que
tocar Premiere.

---

## Qué video va con qué permiso

| Permiso | Video |
|---|---|
| `instagram_basic` | A |
| `pages_show_list` | A |
| `pages_manage_metadata` | A |
| `pages_read_engagement` | A |
| `pages_messaging` | **B** |
| `instagram_manage_messages` | **B** |

---

## ⚠️ Una cosa más, que Meta pide y no teníamos prevista

*"Probaremos tu app con nuestras propias cuentas de prueba"* y hay que
*"describir cómo podemos acceder a tu app para probarla"*.

O sea: el revisor va a querer **entrar a Cobra**. Hay que darle un usuario de
prueba con datos de ejemplo — **no tu cuenta real**, porque vería los pedidos y
los teléfonos de tus clientes.

Eso lo preparo yo antes de enviar.

---

## Si prefieres no regrabar nada

Ya uní los dos videos en `00-completo-sin-subtitulos.mp4` (3:25). Ese archivo
sí contiene los tres puntos —inicio de sesión, otorgamiento y las dos
funciones— y sirve para los seis permisos.

**La pega:** el revisor de los permisos de mensajería tiene que esperar 1:50
para llegar a lo suyo, y Meta pide *"graba solo lo que necesitamos ver"*.
Es válido, pero es peor que el video B bien hecho.
