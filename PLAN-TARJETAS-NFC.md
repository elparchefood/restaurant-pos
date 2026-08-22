# Plan — Tarjeta física de El Parche (NTAG424 DNA)

> Decidido con Sergio el 22-ago-2026. **Tarjetas YA COMPRADAS** (3 de prueba).
> Falta el lector. Todo lo de abajo está decidido, no es una propuesta.

## Para qué es la tarjeta (palabras de Sergio)

> *"Alejarnos de lo digital tradicional que está agobiando a las personas: para
> pagar no saca ni su dinero ni su celular ni nada, simplemente la tarjeta."*

Y busca **exclusividad, pertenencia, inmersión, innovación, practicidad y
publicidad** — cada persona que vea la tarjeta va a preguntar qué es.

**Reemplaza el código de verificación.** Hoy, para pagar con saldo dando el
teléfono, al cliente le llega un código al celular. Con la tarjeta: la pone y
ya. Eso convierte la tarjeta en una LLAVE QUE MUEVE PLATA, no en un carnet.

## Por qué NTAG424 DNA y no una tarjeta barata

Sergio propuso proteger un sector con clave (lo estándar en control de acceso).
Es el instinto correcto, pero **en Mifare Classic esa protección está rota
desde 2008** — hay herramientas que sacan las claves en minutos, y en 2024 se
encontró además una puerta trasera de fábrica. Habría sido mucho trabajo
(drivers, código nativo) para la misma inseguridad.

**NTAG424 DNA resuelve el problema de raíz**: la tarjeta calcula un código
distinto en cada toque (SUN/SDM), firmado con AES-128 con una clave que nunca
sale del chip. Si alguien copia el UID, no puede fabricar el código siguiente.
Y el contador de usos hace que un código repetido se rechace.

Decisión de Sergio: **"no existe un camino después, desde el principio lo
vamos a hacer bien"**.

## Lo comprado

**Electronilab (Bogotá)** — SKU `RFI0038`, "Tarjeta NFC RFID 13.56 MHz
NTAG424 DNA 85.5x54mm", **$3.500 c/u** ($3.255 desde 100).
Descripción verificada contra la hoja de datos de NXP: chip NXP NTAG 424 DNA,
UID 7 bytes, NFC Forum Type 4, 200.000 ciclos, SUN + AES-128, CR80 imprimible.

⚠️ El anuncio tiene la etiqueta "NTAG21x" y menciona Amiibo: es texto copiado
de su producto NTAG215, no del producto real. Se verificó por la descripción
técnica, que sí es específica y correcta.

**Verificación al recibirlas**: app *NFC Tools* en Android → leer → debe decir
**NTAG 424 DNA**. Si dice NTAG215, devolver.

## Lo que falta comprar: el lector

Dos requisitos que lo acotan:
1. **Leer el CONTENIDO (NDEF), no solo el UID.** Casi todos los lectores
   baratos de "emulación de teclado" solo escriben el UID — esos NO sirven.
2. **Poder ESCRIBIR**, para programar cada tarjeta (ver abajo).

## ⚠️ La seguridad viene APAGADA de fábrica

Las NTAG424 traen el chip capaz de generar el código rotativo, pero **SUN/SDM
hay que activarlo y programarlo con nuestra clave, una vez por tarjeta**.
Es un paso de preparación antes de entregarla al cliente. Con 100 tarjetas son
unos minutos, una sola vez.

## Los DOS usos de la misma tarjeta (idea de Sergio, 22-ago)

La dirección que lleva la tarjeta incluye **el mismo código rotativo** que se
usa para pagar. Entonces una sola tarjeta y un solo código sirven para:

1. **Acercarla al celular del cliente** → se abre la página de Cobra y se
   registra. Sin app, sin código de verificación por SMS.
2. **Acercarla al lector del local** → paga con su saldo.

**Consecuencia comercial grande**: se pueden entregar **tarjetas sin asignar**.
El cliente la acerca a su celular, se registra, y en ese momento la tarjeta
pasa a ser suya. El cajero no hace nada.

### Requisitos del "acercar al celular"

- **Android**: funciona sin app.
- **iPhone XS/XR y posteriores (2018+)**: funciona sin app, con el celular
  desbloqueado. Se acerca al **borde superior, cerca de la cámara**.
- **iPhone X, 8, 7**: necesitan una app. **iPhone 6 y anteriores: no leen.**
  Esos clientes se registran como hasta hoy.
- ⚠️ **Apple solo abre direcciones verificadas como propias del sitio**
  (*universal links*): hay que publicar el archivo de verificación en
  `cobrapos.app` (`/.well-known/apple-app-site-association`). **Sin eso el
  iPhone no abre nada.**

## Seguridad — decisiones tomadas

- **La tarjeta es responsabilidad del cliente** (decisión de Sergio). Se
  imprime la advertencia: *única e intransferible, maneja dinero real*.
- **Se puede bloquear**: `pos_tarjetas.activa` ya existe.
- **Tope por transacción** (propuesto, pendiente de que Sergio fije el monto):
  hasta X paga sola; por encima, el cajero pide el código. Acota el daño de una
  tarjeta perdida sin estorbar el 95% de los pedidos.

## Lo ya construido en Cobra (verificado el 22-ago)

- Tabla **`pos_tarjetas`**: `uid, telefono, activa, detalle, quien, created_at`.
  Vacía todavía.
- **`pos-nfc.js`**: caza la ráfaga de teclas del lector (>= 6 caracteres, menos
  de 80 ms entre teclas, terminada en Enter) y saca el texto del campo donde
  cayó el foco.
- Enganchado en **`clientes.js`** (registrar tarjeta) y **`pagos.js`** (cobrar).

## Lo que falta construir

1. Programar las tarjetas: activar SDM con nuestra clave (una vez por tarjeta).
2. Guardar las claves AES como **secreto del servidor** — ⚠️ NUNCA en el repo,
   que es público.
3. Verificar en el servidor: firma CMAC válida **y contador nuevo** (rechazar
   repetidos: ese es el candado antirrepetición).
4. El universal link de Apple para el registro por acercamiento.
5. La pantalla de vincular tarjeta ↔ cliente y el tope por transacción.
