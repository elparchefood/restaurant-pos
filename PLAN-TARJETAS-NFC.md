# Plan — Tarjeta física de El Parche (NTAG424 DNA)

> Decidido con Sergio el 22-ago-2026. **Tarjetas y lector YA COMPRADOS.**
> Todo lo de abajo está decidido, no es una propuesta.
>
> **Estado (5-sep-2026): LLEGARON, y los 4 primeros pasos PASARON.**
> Ver "Resultado de la primera prueba" al final. Falta el paso 5, que ya no es
> una comprobacion sino trabajo: hay que programar una tarjeta.

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

### ❌ Lo de "tarjetas sin asignar" NO va — corregido el 5-sep-2026

Aqui habia escrito, como "consecuencia comercial grande", que se podrian
entregar **tarjetas sin asignar** y que el cliente se la quedara al
registrarse. **Eso lo deduje yo, no lo pidio Sergio** — y el 5-sep se lo
presente como si fuera decision suya. Su respuesta:

> *"Yo jamas entrego tarjetas en blanco. Al entregar una tarjeta ya la hemos
> previamente vinculado al cliente. No tiene sentido dar tarjetas en blanco."*

**Como es de verdad: la tarjeta se vincula ANTES de entregarla.** Se le da al
cliente ya siendo suya. Acercarla al celular no sirve para reclamarla, sino
para que entre a su cuenta — o para instalar la app si no la tiene.

Que quede escrito porque cambia el diseNo: no hace falta ningun camino para
"reclamar" una tarjeta, y una tarjeta que llegue sin dueNo a la pagina es una
señal de que algo se salto un paso, no un caso normal.

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

---

# Resultado de la primera prueba — 5-sep-2026

Todo se comprobo **desde el computador de la caja**, hablandole al lector por
PC/SC. La app del celular no hizo falta: se le pregunta al chip su identidad y
contesta el.

### 1. ¿La tarjeta es de verdad una NTAG424? — **SI**

| | |
|---|---|
| Fabricante | NXP (`0x04`) |
| Familia | NTAG, tipo `0x04`, subtipo `0x02` — la firma de la NTAG 424 DNA |
| Version | 48.0 (`0x30`) |
| Memoria | `0x11` (416 bytes), la de la 424 |
| UID | `04218D7A421890` — **7 bytes**, como dice la hoja de datos |

No eran NTAG215. Las tarjetas son las correctas y no hay que devolver nada.

### 2. ¿El computador ve el lector? — **SI**

Aparece como `Cryptnox NFC 0` **sin instalar nada**, con el driver CCID que
trae Windows. Se reporta a si mismo como "NFC".

### 3. ¿El lector lee la tarjeta? — **SI**

Devuelve el UID de 7 bytes apoyando la tarjeta encima.

### 4. ¿El lector puede PROGRAMARLA? — **SI** ← el paso decisivo

Era el unico que ningun anuncio garantizaba y por el que se guardaban los 30
dias de devolucion de Amazon. Se hizo la autenticacion completa:

1. Se selecciona la aplicacion NDEF de la tarjeta → `9000`
2. `AuthenticateEV2First` con la clave de fabrica (AES-128, 16 ceros) → `91AF`
3. Se descifra su reto, se rota, se responde con el nuestro cifrado → `9100`
4. **La tarjeta demuestra conocer la clave** y queda abierto un canal seguro

Con ese canal es con el que se activa SUN/SDM. **El lector se queda.**

### 5. ¿Cada toque da un codigo distinto? — **SI** ✅

Se programo una tarjeta de prueba y se leyo tres veces seguidas:

```
Toque 1 : ...?u=04218D7A421890&c=000001&m=C771498FA27B41BF
Toque 2 : ...?u=04218D7A421890&c=000002&m=C0CAD93DB2A6A5C0
Toque 3 : ...?u=04218D7A421890&c=000003&m=4A75305B6600B39A
```

El numero de la tarjeta es el mismo — es lo que la identifica. El **contador
sube solo** y **la firma cambia entera** en cada toque. Copiar un codigo no
sirve para nada: el siguiente es otro, y el servidor rechazara un contador que
ya paso. Es exactamente lo que se compro.

**LOS 5 PASOS DEL PLAN ESTAN CUMPLIDOS.**

## Como se programa (para las otras 99)

1. Se escribe el fichero NDEF con la direccion y tres huecos de ceros: 14 para
   el numero, 6 para el contador, 16 para la firma. Se escribe **en claro**;
   ese fichero es de lectura libre.
2. Se activa SDM con `ChangeFileSettings` sobre el fichero 02, **cifrado**
   (los permisos del fichero traen "Change = clave 0", y esa clave exige canal
   seguro; en claro contesta `917E`).
3. La configuracion que funciona:
   - `FileOption` **40** — SDM encendido, comunicacion en claro
   - `AccessRights` **E0 EE** — los mismos que traia
   - `SDMOptions` **C1** — pone numero + contador, en texto legible
   - `SDMAccessRights` **FF E1** ← el orden importa y me costo dos intentos
   - y los cuatro offsets: numero, contador, inicio de lo firmado, firma

⚠️ **`SDMAccessRights` va FF E1, no E1 FF.** Al reves, la tarjeta entiende que
la firma no se usa, no espera los dos ultimos offsets y contesta `917E`
(longitud incorrecta) — que no dice nada de lo que pasa de verdad. Leidos de
izquierda a derecha: `F` reservado, `F` no devuelve el contador, `E` numero y
contador a la vista, `1` la firma se hace con la clave 1.

Los offsets se cuentan **desde el primer byte del fichero**, contando los dos
bytes de longitud que van delante del mensaje NDEF.

## ⚠️ LO QUE FALTA ANTES DE ENTREGAR NINGUNA TARJETA

**La tarjeta de prueba sigue con la clave de fabrica**, que es publica. Hoy
cualquiera con un lector puede recalcular esa firma. Falta:

1. **Generar la clave AES-128 de El Parche** y guardarla como secreto del
   servidor. ⚠️ NUNCA en el repo. Sin copia de esa clave, una tarjeta
   programada no se recupera: se tira.
2. **Cambiar la clave 1 de la tarjeta** (la que firma) por la nuestra.
3. **Verificar en el servidor**: firma valida **y contador nuevo**. Sin lo
   segundo, alguien podria repetir un codigo que vio antes.
4. La pantalla que lee la tarjeta y el tope por transaccion.

## ⚠️ Y lo que la prueba dejo a la vista

**Las tarjetas estan con la clave de fabrica** (16 ceros), que es publica y la
sabe cualquiera. Tal como estan hoy:

- cualquiera con un lector de 30 dolares puede reprogramarlas;
- el codigo NO rota todavia: solo tienen su UID, que se puede copiar.

**Mientras no se programen, una tarjeta no puede mover plata.** Programarlas no
es un paso de mejora: es lo que las convierte en lo que Sergio pidio.

## Lo siguiente, en orden

1. **Decidir la direccion** que lleva la tarjeta (algo como
   `cobrapos.app/t?...` con el UID, el contador y la firma).
2. **Generar la clave AES-128 de El Parche** y guardarla como secreto del
   servidor. ⚠️ **NUNCA en el repo, que es publico.** Y sin copia de esa clave
   una tarjeta programada no se puede recuperar: se tira.
3. **Programar UNA tarjeta** de prueba — no las 100.
4. **Comprobar el paso 5** con esa: tres toques, tres codigos distintos.
5. Verificar la firma en el servidor: CMAC valida **y contador nuevo**.

Solo despues de eso se manda a imprimir el resto.
