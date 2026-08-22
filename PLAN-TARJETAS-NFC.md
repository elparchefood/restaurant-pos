# Plan — Tarjeta física de El Parche (NTAG424 DNA)

> Decidido con Sergio el 22-ago-2026. **Tarjetas y lector YA COMPRADOS.**
> Todo lo de abajo está decidido, no es una propuesta.
>
> **Estado:** esperando que lleguen (~7 de septiembre). Al llegar, ver
> "Primera prueba" al final — en ese orden y sin saltarse pasos.

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

## El lector — COMPRADO (22-ago)

**Cryptnox USB NFC Reader USB-C** (Amazon, vendido por Cryptnox) —
**COP 128.090**, negro, entrega ~7 de septiembre. ASIN `B0DVM5WHY6`.

Lo eligió Sergio; es mejor opción que las tres que yo había propuesto: más
barato que el ACR1252U ($198.252), negro (todos los ACR122U de Amazon salen
blancos) y es el único que **nombra NTAG** explícitamente.

**Lo que lo hace servir:**
- **USB 2.0 CCID (PC/SC)** ← lo decisivo: es el canal por el que se le mandan
  a la tarjeta los comandos APDU para programar SUN/SDM.
- ISO 14443 A/B · **DESFire** (misma familia criptográfica Type 4) · NTAG
- 106/212/424/**848 kbps** (la velocidad máxima de las NTAG424)
- Sin instalar software, alimentado por USB, adaptador USB-C→USB-A incluido

### ⚠️ Dos advertencias del propio fabricante

1. **NO es apto para ambiente de fritanga.** El anuncio presume "IP54 a prueba
   de polvo", pero sus propias instrucciones dicen *"solo para uso en
   interiores, en ambientes limpios y secos, evite el polvo o la humedad"*.
   Se contradicen. **Va en sitio protegido de salpicaduras**, no junto a la
   freidora. (Yo había vendido el IP54 como aguante para el mostrador: era
   falso, corregido.)
2. **Distancia de lectura: 1 a 3 cm.** El cliente **apoya** la tarjeta sobre el
   lector, no la agita a distancia. Hay que explicárselo o parecerá que falla.

Revisar que el computador de la caja tenga puerto libre; el adaptador a USB-A
figura como "opcional incluido" (redacción ambigua del anuncio).

### ⚠️ Lo único que NINGÚN anuncio garantiza

**Programar las NTAG424** (activar SUN/SDM). Ni este ni los ACR lo mencionan.
Se confirma con el lector en la mano. Amazon da **30 días de devolución** si no
pudiera.

### Requisitos que se usaron para elegirlo (por si hay que reemplazarlo)

1. **Leer el CONTENIDO (NDEF), no solo el UID.** Casi todos los lectores
   baratos de "emulación de teclado" solo escriben el UID — esos NO sirven.
2. **Poder ESCRIBIR**, para programar cada tarjeta.

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

## Primera prueba cuando lleguen (EN ESTE ORDEN)

Cada paso confirma el anterior. No saltarse ninguno: si algo falla, se sabe
exactamente qué devolver y no se pierde el pedido grande.

1. **¿La tarjeta es de verdad una NTAG424?** — App *NFC Tools* en Android,
   pestaña Leer, acercar. Debe decir **NTAG 424 DNA**. Si dice NTAG215, se
   devuelven las tarjetas (no el lector).
2. **¿El computador ve el lector?** — Conectarlo. Debe aparecer sin instalar
   nada (es CCID estándar). Si no aparece, es problema del lector.
3. **¿El lector lee la tarjeta?** — Acercarla a 1–3 cm. Debe detectar el chip
   y devolver su UID de 7 bytes.
4. **¿El lector puede PROGRAMARLA?** — El paso decisivo y el único que ningún
   anuncio garantiza: activar SUN/SDM con nuestra clave. Si esto no funciona,
   el lector se devuelve dentro de los 30 días de Amazon.
5. **¿Cada toque da un código distinto?** — La prueba final. Leer la misma
   tarjeta tres veces: el código debe cambiar siempre. **Si se repite, no hay
   seguridad y hay que parar antes de entregar ninguna tarjeta a un cliente.**

Solo después de que los 5 pasen: mandar a imprimir las 100 con el diseño de
El Parche.
