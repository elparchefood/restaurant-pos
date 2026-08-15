# CIERRE DE PROYECTO

Plan que definió Sergio para rematar Cobra POS antes de venderlo. Tres fases en
orden, y después la fase de marketing.

⚠️ **Todo lo que toque a Paco va al FINAL**, junto con su entrenamiento
(`PLAN-ENTRENAR-PACO.md`). No se mete en estas fases: enseñarle algo nuevo no
es agregar una respuesta, es un bloque de trabajo propio que se hace y se
prueba de una sola vez. Y antes de proponer algo "para que el bot avise",
revisar si Sergio ya lo resuelve **a mano** con una respuesta rápida.

Este archivo existe porque el plan solo vivía en la conversación. Cuando algo
se termina, se marca aquí y se documenta a fondo en `ESTADO-SISTEMA.md`.

---

## ⭐ TRABAJO DEL 15-AGO — Paco conversacional (aprobado por Sergio el 14-ago)

Sergio aprobó ejecutar **todo** el plan de `AUDITORIA-PACO.md`: *"Perfecto,
mañana haremos todo eso"*. Esta sección es el mapa para no perder nada; el
detalle técnico de cada punto está en la auditoría y en los BUGS 1-7 de la
FASE 2c de abajo.

**El diagnóstico de Sergio, que es el norte del trabajo:** *"Lo curioso es que
después de tanto entrenarlo ya logramos que tome correctamente presentaciones,
variantes, productos, adiciones — casi todo. Y en lo que más falla actualmente
es lo más simple: intenciones comunes y corrientes que se salen del flujo del
pedido."* Tiene toda la razón, y la auditoría lo confirma con código: la
**extracción** está madura (lector, verificador, catálogo — no se tocan) y el
**entendimiento** no existe (no hay casilla para despedida, queja, charla).
Lo difícil ya está hecho; falta lo simple. Ese es exactamente el hueco que
cierra la FASE A.

### Orden de ejecución (probar en el banco entre fase y fase)

**0. Antes de tocar nada**
- [ ] Comprobar el **pendiente #2** (guardar el canvas pisa la configuración):
      decidir si el saludo se cayó a conversacional por un guardado del canvas
      o si nunca se guardó en fija. Si no se resuelve esto primero, el arreglo
      del saludo se revierte solo.
- [ ] La **llave Nequi de la FAQ está VIEJA**. Ya casi resuelto: la memoria del
      proyecto registra que `0089912015` es la cuenta vieja y `0092726260` la
      corregida (la imagen del QR también sigue apuntando a la vieja — eso
      solo lo puede regenerar Sergio). **Corregir la FAQ a 0092726260**,
      confirmándolo con Sergio de pasada. ES PLATA — va primero que todo.

**FASE A — Entender** (BUGS 5 y 6; hallazgos A-D de la auditoría)
- [ ] A1. Ampliar el clasificador (`index.ts:894`) con: `despedida`,
      `agradecimiento_final`, `queja`, `fuera_de_tema`, `no_entendio`,
      `quiere_humano`. Temperatura 0 y JSON, como está.
- [ ] A2. Pasarle al clasificador los últimos 4-6 mensajes (hoy ve solo el
      actual, 900 chars).
- [ ] A3. Enrutador ANTES del bypass v270 (`index.ts:2775`): despedida →
      frase de despedida y fin; queja → reconocer + ofrecer humano; pregunta
      → responderla y luego el paso; resto → flujo normal.
- [ ] A4. Jubilar la regex `PREGUNTA_DEL_CLIENTE`: esa decisión pasa al
      clasificador. UN solo detector de intención en el motor.
- [ ] A5. La rama "producto no existe" (`index.ts:2538`) solo dispara si la
      intención fue `pedir` Y hay palabra candidata a comida. "cuánto vale" →
      responder el precio desde el catálogo.
- [ ] A6. Quitar la regla "ignora completamente lo fuera de tema"
      (`index.ts:5265`) → reconocer en una frase y redirigir.

**FASE B — Nunca en bucle** (BUG 7)
- [ ] B1. Contador de intentos por paso en el estado (generalizar el que ya
      existe en `producto_ambiguo`, `index.ts:2012`).
- [ ] B2. Frases de 2.º y 3.er intento, fijas y configurables en Mensajes
      (proponer borradores a Sergio).
- [ ] B3. Al 4.º intento: `human_takeover` + motivo visible. Nunca repetir la
      misma frase dos veces seguidas.

**FASE C — Misión y saludo** (BUG 1; hallazgo A)
- [ ] C1. Saludo a modo **fija** con el texto acordado: presentarse como Paco,
      asistente virtual, y pedir el pedido lo más claro posible — con "qué
      **deseas**" (pedido expreso de Sergio del 13-ago).
- [ ] C2. Escribir la MISIÓN arriba del prompt conversacional: quién es, para
      qué está, qué hacer ante lo imprevisto. Podar las prohibiciones que la
      nueva arquitectura vuelve innecesarias.

**FASE D — Limpiar la configuración** (hallazgo H)
- [ ] D1. UNA llave Nequi, y que frase y FAQ la lean de la misma fuente.
- [ ] D2. Precios comidos de la FAQ (".000") — mejor aún: precio de producto
      se responde desde el catálogo, no desde texto a mano.
- [ ] D3. Contradicción del tiempo de entrega (FAQ promete 30 min;
      instrucciones lo prohíben). Decide Sergio.
- [ ] D4. Bebidas no disponibles fuera de la prosa de `instrucciones` — la
      disponibilidad vive en el catálogo.

**Además, del mismo día (no son de Paco pero quedaron pendientes):**
- [ ] El chat del Front debe verse IGUAL que WhatsApp (FASE 2c, causa en
      `chat-ia.js:1230` — formato + `pre-wrap`, en los 4 sitios).
- [ ] BUG 2: la carta se mandó dos veces (1,1 s de diferencia).
- [ ] BUG 3: la etiqueta de Paco falta en los mensajes con imagen.
- [ ] BUG 4: el envío de carta de la rama 14f no guarda en `chat_messages`
      (dos caminos → unificar en el que guarda, `index.ts:1069`).
- [ ] Aviso a `.nojekyll`: comprobación en el flujo de deploy para que no se
      vuelva a borrar sin que nadie se entere.

### Verificación (sin tocar producción)
- [ ] Repetir en el banco las conversaciones reales del 14-ago: Jorge Piamba
      (573233776746, 8:11 p. m.) y D.F.G (573234799933, 8:37 p. m.).
- [ ] Regresión de los arreglos del 12-13-ago (nombre, dirección, resumen
      único, frases fijas) para confirmar que no vuelven.
- [ ] Borrar las conversaciones PRUEBA al terminar.

### Decisiones de Sergio pendientes de respuesta
1. Llave Nequi buena: ¿0092726260 o 0089912015?
2. Textos: saludo definitivo, despedida, 2.º intento, 3.er intento (se le
   proponen borradores; él edita).
3. ¿Se promete "unos 30 minutos" o no se promete tiempo?

---

## FASE 1 — Lo que falta de lo que ya se pidió

Cosas que Sergio pidió en su momento y nunca se construyeron, o quedaron a medias.

### Hecho

- [x] **Asistente IA reorganizado** — 6 pestañas (Asistente · Información · Flujo
      · Pedido · Mensajes · Difusión), 25 filas plegadas, 5 rieles de vista
      previa. `2026-08-09`
- [x] **Vista previa funcional de Paco** — se chatea de verdad con él desde
      Configuración, con sus habilidades reales y el canvas en vivo. `2026-08-09`
- [x] **Respuestas rápidas con variables** — un solo editor, con fichas, en
      Configuración → Mensajes. `2026-08-09`
- [x] **Pantalla de pago** — los 7 puntos de la lista del 2026-08-08. `2026-08-09`
- [x] **Multi-marca completa** — A (cartas y precios por sede), B (inventario
      por marca, con el interruptor global/por sucursal) y C (caja e informes
      que no mezclan marcas). Detalle y trampas en `PLAN-MULTIMARCA.md`.
      `2026-08-12`
- [x] **Filtros de informes** — eran de la maqueta: mostraban valores
      inventados y no filtraban. Ahora son reales; los que no tenían dato
      detrás se quitaron. `2026-08-12`
- [x] **Reservas · "Crear con IA"** — se pega el mensaje de WhatsApp y sale la
      reserva armada. Motor: `extraer-reserva` (v4). `2026-08-09`
- [x] **Modal de recarga exitosa** — `avisoRecarga()` en `app-cliente.js`: el
      saldo nuevo en grande, cuánto recargó, el regalo aparte y el empujón a
      recargar más. *Ya estaba; la lista estaba mal.*
- [x] **Barrio desconocido** — el bot pide el barrio; lo que el operador cobra a
      mano queda en `pos_domi_aprendidos`, y Configuración → Domicilios lo
      muestra con "Agregar a la tabla" / "Descartar". Detecta también los
      **cambios de precio**. *Ya estaba; la lista estaba mal.*
- [x] **Extender `pos-cache`** — el **plan** (17 pantallas, 2 consultas
      seguidas) y los **métodos de pago** (7 pantallas) ya no se esperan: salen
      de lo guardado en el equipo y se confirman por detrás. `2026-08-09`
      `pos-perms` (15 pantallas) cerrado el mismo día: lo guardado puede
      CONCEDER al instante pero para NEGAR espera la confirmación de la base.

### Pendiente

- [ ] **Registrar los conjuntos cerrados** — *lo hace Sergio*. La casilla ya
      existe: Configuración → Domicilios, en cada zona, "Conjuntos cerrados de
      esta zona". Mientras estén vacíos, un pedido de un conjunto se traba
      pidiendo calle y número. `2026-08-12`
- [ ] **Lugar desconocido que NO suena a conjunto** — debería preguntar "¿es
      una casa o un conjunto?", etiquetar la respuesta, proponerlo y pasar a un
      humano. No se logró: el nombre suelto no llega a guardarse como dirección
      (el candado que impide que una pregunta se cuele como dirección lo
      bloquea). Ver `delay-reply` → `puedeSerDireccion`. `2026-08-12`
- [ ] **Subida del banner en "Mi página web"** — *aplazado por Sergio el
      2026-08-09*: las imágenes del carrusel se suben desde Cobra.
- [ ] **Historias de Instagram** — falta el endpoint.
- [ ] **Atajo "se acabó"** — *Sergio todavía no decidió dónde va*. No empezar
      hasta que lo diga.

---

## FASE 2 — Errores que afectarían a un cliente nuevo

No son cosas que falten: son cosas que están mal y que hoy nadie ve porque
solo hay un restaurante usándolo.

- [ ] **El inventario no sabe de qué sede es** — `iv_existencias.branch_id`
      está **vacío en las 44 filas**. Hoy no molesta porque El Parche tiene una
      sola sede, pero el día que abra la segunda —o el primer cliente con dos—
      **las dos sedes van a compartir el mismo stock**: lo que se venda en una
      descuenta el inventario de la otra, y ningún reporte lo va a delatar.

      Encontrado el 14-ago-2026 al devolver el inventario de un pedido de
      prueba: el cruce por `insumo_id + branch_id` no encontraba ninguna fila,
      y hubo que cruzar solo por insumo. Ese fallo silencioso es la señal.

      Al arreglarlo: llenar el `branch_id` de las filas existentes con la sede
      actual, y revisar quién escribe en esa tabla para que lo ponga siempre.

- [x] **Un comprobante puede pagar dos pedidos** — YA estaba cerrado desde el
      7-ago (entrada 123): la referencia del banco queda reclamada por el
      pedido al verificar. Verificado en la función desplegada (v7).
- [x] **El Parche hardcodeado** — limpio. `pos-brand` rellena
      `data-negocio`/`data-negocio-suf` con el restaurante real; la semilla del
      chat ya no siembra dirección, coordenadas ni cuenta bancaria. `2026-08-09`
- [x] **Un restaurante nuevo nacía sin roles ni `ia_config`** — lo segundo hacía
      que Métodos de pago, respuestas rápidas y etiquetas dijeran "Guardado ✓"
      sin guardar nada (UPDATE sobre una fila que no existe = 0 filas, sin
      error). Resuelto con dos automatismos en la base. `2026-08-09`
- [x] **`payment_method` guardado de varias formas** — son SEIS en los datos
      reales; cuatro ya se traducían bien. Se arreglaron `multiple` ("Varios
      métodos", no "Otros") y el texto libre del bot, y se quitó la copia de la
      regla que tenía `historial.js`. `2026-08-09`
- [x] **Las notas frecuentes no aparecían en venta rápida** — `S.cats` vs
      `S.categories`: el bloque se copió de domicilios y buscaba las categorías
      por el nombre equivocado. `2026-08-09`
- [x] **La tarjeta de mesa decía "0 ítems · $0"** — era otro síntoma del error
      de las mesas libres (la carga fallaba y pintaba ceros). El rastro en
      `pos_diag` confirma: el error paró en el minuto exacto del arreglo del
      8-ago y no ha vuelto. `2026-08-09`
- [x] **Auditoría de los `Promise.all`** — revisados los 20 del sistema. Solo
      dos eran peligrosos (historial y dashboard); los demás ya estaban
      protegidos. `2026-08-09`
- [x] **`mypass_vault` estaba abierta a cualquiera** — CERRADO el 9-ago.
      Era la bóveda de contraseñas personal de Sergio (app `mypass`, repo
      público, misma base). La llave pública de la página la leía entera; y el
      `totp_secret` se guardaba EN CLARO junto al `recovery_blob`, del cual se
      deriva la llave de la bóveda: la contraseña maestra no protegía nada.
      Arreglado: MyPass entra con cuenta (Supabase Auth), `grant` a
      `authenticated`, `revoke` a `anon`, y política `mypass_solo_el_dueno`.
      Comprobado: leer y borrar con la llave pública → *permission denied*.
      **Pendiente aparte:** rotar contraseñas y separar MyPass de la base de
      Cobra antes de vender (no es urgente, ya está cerrada).
- [x] **El envío de campañas vivía en la pantalla** — el botón ahora ARMA y un
      reloj en la base termina la tanda de hoy aunque se cierre todo. Se
      desarma solo al acabarse el cupo o la lista. `2026-08-09`
      ⏳ *Falta ver la primera tanda real: el día de la prueba el cupo de 24 h
      ya estaba lleno (250/250), así que no salió ningún mensaje.*
      Debe correr en el servidor.

---

## FASE 2b — Reportados por Sergio el 10-ago-2026 (usando el sistema de verdad)

Salieron de un turno real, mirando el chat y los domicilios. Ninguno está
empezado.

### Bugs

- [x] **Se puede crear un pedido con un producto SIN variante.** ✅ 11-ago Si el cliente
      escribe "un jugo Hit personal" y no dice el sabor, el botón *Crear
      pedido* del chat arma el pedido con el Hit **sin sabor**.
      ⚠️ El daño real es de inventario: **no se sabe qué unidad descontar**.
      Regla que debe quedar: *no se puede crear un pedido sin las variantes y
      presentaciones completas*. Si en el mensaje no hay rastro del sabor,
      poner uno cualquiera (o preguntarlo), pero nunca dejarlo vacío.
      Sospechoso: el extractor devuelve el producto sin `variables` y nadie
      valida antes de insertar.

- [x] **"En camino" abre también el modal de "Entregado".** ✅ 11-ago En domicilios, al
      tocar *En camino* se disparan los dos a la vez, como si se hubiera
      pulsado *Entregado* al mismo tiempo. Toca cerrar el segundo modal a mano
      siempre. Huele a un handler que quedó pegado a los dos botones (o a que
      el modal de entrega no se cierra antes de repintar).

- [x] **La comanda muestra el id crudo: `pm_q8ybbdpqb`.** ✅ 11-ago Se ve en la tarjeta
      del domicilio, arriba a la derecha de COMANDA. Eso es un identificador
      interno de pago, no algo que el cliente o el mesero deban ver.


### Como quedaron los 4 arreglados (11-ago-2026)

**Pedido sin variante.** El catalogo NO tiene marca de "opcional" en los grupos
de variantes: un grupo existe porque hay que elegir algo. Asi que ahora
`cpVarsFaltan()` (chat-ia.js) compara los grupos del producto contra lo elegido
y (1) avisa en el modal, (2) pone un selector para elegir el sabor ahi mismo
—antes tocaba borrar el producto y volver a agregarlo— y (3) **bloquea el
envio** con el mismo patron que ya usaba la etiqueta obligatoria. Se resolvio
en el navegador, sin tocar `extraer-pedido`, asi que cubre los productos
vengan por donde vengan.

**"En camino" disparaba "Entregado".** `attachDomiRailEvents()` se llama desde
dos sitios y enganchaba el clic con una funcion ANONIMA, que addEventListener
no puede deduplicar: el boton quedaba con dos escuchas y el handler corria dos
veces sobre el MISMO objeto `d`, viendo en la segunda vuelta el estado ya
mutado. Sus hermanas `attachRailEvents` / `attachQuickRailEvents` usan
funciones nombradas justo por esto (hay un comentario del arreglo anterior).
Cerrado con una marca `data-domi-bound`.

**El id `pm_...` en la comanda.** `pos-metodos.nombre()` ya tenia la regla
—con el comentario "un id interno NUNCA se le muestra a nadie"— pero este sitio
pintaba `d.metodo` en crudo. Otra vez: la regla existia, la llamada faltaba.

**Etiquetas en la lista.** Pastillas del color de la etiqueta en cada fila,
hasta 2 y "+N" si hay mas. La linea solo aparece si hay etiquetas.

⚠️ **Ojo al desplegar:** `chat-ia.html` y `ventas.html` cargan el JS con
`?v=NUMERO`. Si no se sube ese numero, el navegador y el .exe siguen sirviendo
el archivo viejo y el arreglo "no funciona".

### Faltantes de la bandeja

- [x] **Editar el nombre del contacto desde el chat.** ✅ 11-ago Hoy solo se puede desde
      otras pantallas. Debe poder hacerse desde *Información del contacto*, y
      **el cambio debe verse reflejado solo** en la lista de clientes — igual
      en los dos sentidos: si se edita desde Domicilios, que el chat lo muestre.

- [x] **Etiquetar varios chats a la vez.** ✅ 11-ago Poner y quitar etiquetas en lote,
      con selección múltiple. Hoy es uno por uno.

- [x] **Ver la etiqueta de cada chat en la lista.** ✅ 11-ago A simple vista, sin abrir
      la conversación. (Las etiquetas ya existen: En preparación, Llevar, En
      camino, Pago, Entregado.)

- [x] **La pestaña "Archivados" está de adorno**  ✅ 11-ago — hay que hacerla funcionar.

- [x] **Revisar si "Míos" sirve para algo** ✅ 11-ago — SE QUITÓ o es redundante. Si no aporta, se
      quita: una pestaña que no hace nada confunde al cliente nuevo.

### Cómo quedaron los 4 de la bandeja (11-ago-2026)

**Archivados ya funciona.** El diagnóstico: la consulta `status='archived'` YA
existía, pero **ninguna parte del sistema ponía ese estado** — la pestaña estaba
condenada a salir vacía para siempre. Se agregó "Archivar chat" al menú ⋮, que
dentro de Archivados cambia solo a "Devolver a la bandeja". No borra nada: el
historial queda intacto.

**"Míos" se quitó.** No existe columna de asignación en `chat_conversations` y
el código la filtraba con la MISMA condición que "Bandeja": era un duplicado
literal, imposible de arreglar sin inventarse una función nueva. El valor
'mine' se dejó reconocido en el filtro por si un .exe viejo lo tiene guardado.

**Etiquetado en lote.** Botón de selección múltiple junto a "Nueva
conversación": marca varios chats (o "Todos"), y desde ahí se pone o se quita
una etiqueta a todos. Se hace chat por chat a propósito: cada uno tiene sus
otras etiquetas y un guardado en bloque las pisaría.

**Editar el nombre desde el chat.** Lápiz junto al nombre en Información del
contacto. Escribe en los DOS sitios: `pos_clientes.nombre` (lo que ven Clientes
y Domicilios) y `chat_conversations.contact_name` (el respaldo cuando todavía
no hay ficha porque no ha pedido nunca). La lista de la izquierda se repinta
sola.

En los tres que guardan se comprueba que el UPDATE devolvió filas: 0 filas sin
error es el fallo silencioso que ya nos mordió antes ("Guardado ✓" sin guardar).


### Extra encontrado al verificar (11-ago-2026)

- [x] **El Escritorio no se actualizaba solo.** Salio revisando la consola tras
      cerrar la Fase 2b. `loadPrintTimes()` escribia en `qb-print-sub`, un
      elemento que **no existe** en `dashboard.html` (solo existe
      `qb-receipt-sub`), asi que reventaba en su PRIMERA linea. Y se llamaba en
      el arranque justo ANTES de `setupRealtime()`, de modo que la excepcion se
      llevaba por delante el tiempo real y el `setInterval` de 5 minutos.
      **Sintoma:** los numeros salian correctos al cargar y se congelaban ahi
      hasta un F5. El peor tipo de fallo, porque parece que funciona.
      **Comprobado antes y despues:** antes solo existia el canal
      `pos-notify-msgs` (de otro modulo); ahora tambien `realtime:dash :: joined`.
      Se reordeno el arranque (primero lo que mantiene vivo el dashboard,
      despues lo cosmetico) y se envolvieron las llamadas.
      ⚠️ No se puso "Ultima <hora>" porque seria mentira: esa es la hora actual,
      no la de la ultima impresion, y no hay tabla que la guarde.

---

## FASE 2c — Reportado por Sergio el 14-ago-2026

- [ ] **El chat del Front no muestra los mensajes como los ve el cliente.**
      Sergio abrio una conversacion real y vio la diferencia: donde WhatsApp
      pinta `Paco:` en gris y monoespaciado, el Front escupe los acentos graves
      tal cual, con comillas invertidas a la vista. Y en los resumenes de
      pedido los saltos de linea y los espacios se aplastan, asi que el resumen
      se lee apretado y distinto a como le llego a la persona.

      **Lo que quiere:** que el Front se vea *igual* que WhatsApp. No parecido,
      igual — si no, revisar una conversacion desde el panel no sirve para
      juzgar lo que el cliente realmente recibio.

      **Causa, ya localizada** — `chat-ia.js:1230`:
      ```js
      const textHtml = (...) ? `<div>${escHtml(m.body)}</div>` : '';
      ```
      Ese `escHtml` escapa el texto y lo mete en un `<div>` pelado. Dos
      consecuencias:

      1. **No interpreta el formato de WhatsApp.** Los cuatro marcadores salen
         crudos: `` ` ``codigo`` ` ``, `*negrita*`, `_cursiva_`, `~tachado~`.
         La etiqueta de Paco usa justo el primero, por eso salta a la vista.
      2. **No conserva los espacios.** Sin `white-space: pre-wrap` en la
         burbuja, HTML colapsa los saltos de linea y los espacios repetidos.
         Por eso los resumenes se ven apretados. Se busco `white-space` en
         `chat-ia.html` y `chat-ia.js`: **no existe** para la burbuja.

      **Como se arregla:** una funcion que reciba el texto ya escapado (primero
      escapar, despues formatear — nunca al reves, o se abre la puerta a
      inyeccion) y convierta los cuatro marcadores a `<code>`, `<b>`, `<i>` y
      `<s>`, mas `white-space: pre-wrap` en el contenedor del texto.

      ⚠️ **Aplicarlo en los cuatro sitios, no solo en la burbuja.** El mismo
      texto crudo se pinta tambien en las citas de respuesta
      (`ci-reply-quote-text`, dos veces en `chat-ia.js:1236` y `:1243`) y en la
      vista previa de la lista de conversaciones (`prettyPreview`,
      `chat-ia.js:4222`). Si solo se toca la burbuja, la etiqueta de Paco
      seguira saliendo con comillas invertidas en la lista de la izquierda.

      **Como se comprueba:** con la conversacion del 14-ago a las 8:11 p. m.
      (573233776746). Si `Paco:` se ve gris y monoespaciado igual que en el
      telefono, quedo.

### Primeros errores de Paco en vivo — 14-ago-2026, 8:11 p. m.

**Conversacion:** Jorge Piamba (Milan club house) · **573233776746** ·
14-ago-2026 · primer mensaje del cliente a las **8:11 p. m.** hora Colombia
(`01:11 UTC` del 15-ago en la base). Es la primera conversacion real desde que
Paco contesta en vivo.

- [ ] **BUG 1 — Paco no dijo el saludo acordado. Este es el importante.**

      **Lo que se acordo:** que se presentara como asistente virtual llamado
      Paco y le pidiera al cliente que hiciera su pedido lo mas claro posible.

      **Lo que dijo de verdad, a las 8:11 p. m.:**
      > 🍟 `Paco:` ¡Hola! Buenas noches 🍟😊 Claro que si, estamos para servirte.
      > ¿Que se te antoja? 🍟☺️

      Ni se presento, ni pidio claridad.

      **Causa, ya leida de la base** — `ia_config.flujo_saludo` de la sucursal
      `66e5f12d-fd16-455a-a6c0-9694aa6fb01b` tiene guardado hoy esto:
      ```json
      { "modo": "conversacional",
        "guia": "Saluda al cliente con la hora del dia (buenos dias / buenas
                 tardes / buenas noches). Si ya hizo pedidos antes menciona que
                 lo recuerdas. Pregunta si quiere hacer un pedido o si prefiere
                 ver el menu.\n\nTambien puedes indicar que te llamas Paco y que
                 eres el asistente virtual de El Parche Food" }
      ```
      Dos cosas mal, y las dos explican el fallo por si solas:

      1. **`modo: "conversacional"`**, no `"fija"`. En conversacional el modelo
         parafrasea la guia, y ya sabemos como termina eso: es cara o sello.
         Es exactamente la misma causa de los tres bugs de ayer.
      2. La guia dice **"Tambien puedes indicar que te llamas Paco"**.
         *Puedes* es opcional. El modelo no desobedecio: se le dio permiso para
         saltarselo. Y de pedir el pedido claro no dice nada.

      **Arreglo:** poner `modo: "fija"` con el texto exacto acordado (con
      **"que deseas"**, no "que quieres" — lo pidio Sergio el 13-ago). Es el
      mismo remedio de ayer: frase fija en vez de guia.

      ⚠️ **Antes de darlo por bueno hay que mirar el pendiente #2** (guardar el
      canvas pisa la configuracion). Si el saludo se guardo bien en su momento y
      un guardado del canvas lo devolvio a conversacional, arreglar el texto no
      sirve de nada: vuelve a caerse al siguiente guardado. Primero comprobar
      cual de las dos cosas paso.

- [ ] **BUG 2 — La carta se mando dos veces.** A las `01:12:33.909` y a las
      `01:12:35.065` UTC, con 1,1 segundos de diferencia. Dos mensajes `Carta`
      identicos seguidos. El cliente recibio la misma imagen duplicada.

- [ ] **BUG 3 — La etiqueta de Paco falta en algunos mensajes.** En esa misma
      conversacion, tres mensajes salieron **sin** `` `Paco:` ``: los dos de la
      carta y el "¿Que se te antoja? 🍟☺️" de las `01:12:36`. Los que si la
      llevan son el saludo y el de las adiciones. La regla acordada es que
      **todo** mensaje que manda Paco la lleva. Hay que revisar por donde salen
      los envios con imagen y los de texto que acompanan un medio, porque
      parece que esos no pasan por `conEtiqueta()`.

- [ ] **BUG 4 — Paco dijo "esta es nuestra carta" y NO la mando.**

      **Conversacion:** D.F.G · **573234799933** · 14-ago-2026 · **8:37 p. m.**
      (`01:37 UTC` del 15-ago).

      El cliente abre con *"¡Hola! Quiero mas informacion.cuanto vale"* y Paco
      responde a las 8:37 p. m.:
      > 🍟 `Paco:` No manejamos un producto con ese nombre 🙈 Esta es nuestra
      > carta ☺️ ¿Cual se te antoja?

      Sergio lo reporto al reves de como resulto ser: penso que la carta si se
      habia mandado y que el Front no la mostraba (falsa alarma del panel),
      porque el cliente contesto *"Esta un poquito caro"*, como si hubiera
      visto precios.

      **Sergio tenia razon: la carta SI se mando. Lo que falla es el guardado.**

      Hay **dos caminos distintos** que mandan la carta, y solo uno la guarda:

      | Linea | Que hace | ¿Queda en el Front? |
      |---|---|---|
      | `delay-reply/index.ts:1069-1091` | Manda la imagen **y** la guarda en `chat_messages` con `body:"Carta"`, `media_url`, `media_type:"image"` | ✅ Si |
      | `delay-reply/index.ts:2551-2556` | `fetch` pelado a `graph.facebook.com` con `type:"image"`. **No guarda nada.** | ❌ No |

      El de Jorge Piamba salio por el primero — por eso se ven las dos filas
      `Carta`. El de D.F.G salio por el segundo, el de la rama "producto no
      existe" (`14f`): la imagen viaja a WhatsApp y **nunca se escribe en la
      base**, asi que el Front no tiene nada que pintar. El cliente si la vio, y
      por eso pudo decir *"esta un poquito caro"*.

      Los logs no mostraron nada de carta porque ese camino tampoco escribe log.
      La ausencia de rastro no era prueba de que no se mando; era prueba de que
      ese camino no deja rastro.

      **Arreglo:** que el envio de la carta pase siempre por el mismo sitio que
      guarda (el de la linea 1069), en vez de tener un `fetch` suelto. Mientras
      existan dos caminos para lo mismo, van a seguir divergiendo — es el
      patron que ya mordio con el total de la transferencia y con la direccion
      del resumen.

      **Y de paso queda claro por que dijo "esta un poquito caro":** vio los
      precios en la carta que si le llego. No hace falta buscar explicaciones
      raras del catalogo de Meta.

      ⚠️ **Leccion para no repetirla:** al revisar esto se concluyo primero que
      la carta no se habia mandado, mirando solo la base y los logs. Estaba
      mal. Cuando el Front y el cliente se contradicen, **el cliente es el que
      tiene razon**: el vio lo que le llego al telefono.

#### El fondo de los BUGS 5, 6 y 7 — leer antes de tocar nada

Sergio, 14-ago: *"la mayoria de problemas se solucionan haciendo que Paco sea
realmente conversacional. Asi como tu: tu nunca me respondes con un bucle, tu
entiendes lo que estoy diciendo y de que estamos hablando"*.

El diagnostico es correcto. Vale la pena escribir **por que** pasa, porque de
ahi sale el arreglo — y tambien el error que seria facil cometer.

**En que se diferencia Paco de un asistente conversacional de verdad**

| | Asistente conversacional | Paco hoy |
|---|---|---|
| Que recibe | **Toda** la conversacion, cada vez | El mensaje suelto, mas un estado con campos |
| Quien decide que responder | El modelo, mirando el conjunto | Una maquina de pasos: `producto` → `direccion` → `pago` → … |
| Para que se usa el modelo | Para **entender y decidir** | Solo para **extraer datos** del mensaje |
| Que pasa con lo inesperado | Se contesta lo que la persona dijo | Cae en la rama "no lo entendi" del paso activo |

Ahi estan los tres bugs de una vez. Como el paso activo es `producto`, todo lo
que no sea un producto se contesta con la pregunta de `producto`. Da igual que
el cliente pregunte un precio (BUG 5), se despida (BUG 6) o lleve cuatro veces
sin ser entendido (BUG 7): el guion solo sabe una cosa.

**El error que seria facil cometer manana**

Concluir "entonces quitemos el guion y que el modelo decida todo". Eso ya se
probo y es de donde vienen los arreglos del 12 y 13 de agosto: la confirmacion
del nombre, la pregunta de la direccion y el pedido repitiendose en cada
mensaje **eran** el modelo decidiendo. Todo lo que depende de que el modelo
obedezca es cara o sello.

Ademas hay dos cosas que **no** pueden depender del modelo, nunca:

- **Los precios y el pedido.** El total, las adiciones y las presentaciones
  salen del catalogo, no de lo que el modelo crea recordar. Es la regla del
  verificador que puso Sergio: el bot no puede armar nada que el flujo manual
  no pudiera armar.
- **Poder repetir una prueba.** El banco de pruebas sirve porque la misma
  conversacion da el mismo resultado. Si el modelo decide libremente, deja de
  poder comprobarse.

**El arreglo: pedirle al modelo que ademas ENTIENDA. No es quitarle mando al
guion, es darle un trabajo que hoy no tiene.**

Precision de Sergio (14-ago), y corrige el planteamiento anterior: *"no es
cuestion de mando, es cuestion de entendimiento. Deberia hacer las dos cosas:
recoger datos y entender. Sacar los productos de la carta no tiene nada que ver
con entender; entender es que una persona le diga algo fuera del guion y el sepa
como manejarlo, sepa su mision"*.

Son **tres trabajos distintos**, y hoy solo se hacen dos:

| Trabajo | Quien lo hace | Estado |
|---|---|---|
| **Recoger datos** — sacar producto, cantidad, direccion, nombre del mensaje | El modelo | ✅ Ya se hace |
| **Buscar** — que productos existen, cuanto valen, que adiciones tiene cada uno | El catalogo, en la base | ✅ Ya se hace, y asi debe seguir |
| **Entender** — que esta pasando en esta conversacion y que corresponde hacer | Nadie | 🔴 **Falta** |

Los dos primeros no se tocan. El tercero no le quita nada a ninguno: buscar un
precio en la carta seguira siendo una consulta a la base, entienda el modelo lo
que entienda. Son cosas separadas.

**Y "entender" incluye saber cual es su mision.** Hoy Paco no tiene mision: tiene
un paso activo. Un mesero sabe que su trabajo es que el cliente coma bien y se
vaya contento, y por eso sabe que hacer cuando le preguntan algo que no estaba
en el guion — no se queda mudo ni contesta cualquier cosa. Paco necesita eso
escrito: quien es, para que esta, y que hacer cuando pasa algo que no previo.

Con esa pieza:

- El cliente pregunta un precio → se le responde la pregunta (adios BUG 5).
- El cliente se despide → se despide de vuelta (adios BUG 6).
- Va el segundo o tercer intento del mismo paso → lo dice de otra forma, y a la
  cuarta llama a un humano (adios BUG 7).

**El limite, que no es de mando sino de veracidad:** lo que Paco *dice* sale de
entender; lo que Paco *afirma como cierto* — precios, productos, totales,
disponibilidad — sale de la base. Puede entender que le estan preguntando cuanto
vale una salchipapa; el precio lo lee, no lo recuerda.

---

- [ ] **BUG 5 — Cualquier cosa fuera del guion se contesta "no manejamos un
      producto con ese nombre". ESTE ES DE FONDO, no un caso suelto.**

      Sergio lo insistio el 14-ago: *"los clientes a veces dicen cualquier otra
      cosa que se salga del guion y Paco les dice que ese producto no lo
      manejamos. Es totalmente ilogico, debe ser conversacional"*.

      **Casos ya vistos:**
      - "¡Hola! Quiero mas informacion.cuanto vale" → "no manejamos un producto
        con ese nombre" (573234799933, 14-ago 8:37 p. m.)
      - "Eres muy amable Paco" → lo mismo (ya estaba anotado)

      **Causa exacta** — `delay-reply/index.ts:2538-2545`:
      ```ts
      for (const w of (nombroAlgoDeLaCarta ? [] : normalizarTexto(clienteTexto).split(/\s+/))) {
        const stem = w.replace(/s$/, "");
        if (w.length < 4 || STOP_14F.has(w) || STOP_14F.has(stem)) continue;
        if (DYN_PROD_NAMES.includes(w) || DYN_PROD_NAMES.includes(stem)) continue;
        if (getAdicionKeywords().some(k => k === w || k === stem)) continue;
        productoInexistente = w; break;   // <-- cualquier palabra desconocida
      }
      ```
      Recorre **cada palabra** del cliente y, a la primera que tenga 4 letras o
      mas y no este ni en la carta ni en `STOP_14F`, la declara "producto que no
      existe". En "cuanto vale" la palabra que lo dispara es **"informacion"**.

      **Por que esta mal de raiz:** la lista `STOP_14F` es una lista negra de
      palabras a ignorar — hoy tiene unas 40. Para que esto funcionara habria
      que meter ahi *todas las palabras del espanol que no son comida*. Es una
      pelea imposible, y ya se perdio una vez: el comentario del propio codigo
      cuenta que "porfavor" escrito junto disparaba el mismo error, y se parcheo
      añadiendo palabras. **Añadir mas palabras no lo arregla.**

      **Lo que hay que hacer:** darle la vuelta. Solo decir "no manejamos ese
      producto" cuando el cliente **claramente estaba pidiendo algo** — que haya
      intencion de pedido *y* una palabra que parezca comida. Si el cliente
      pregunta, agradece, saluda, se queja o dice cualquier otra cosa, la
      respuesta es conversacional: se le contesta lo que pregunto.

      Va **junto con el BUG 6**: los dos son lo mismo visto desde dos lados —
      Paco no distingue "el cliente esta pidiendo" de "el cliente esta hablando".

- [ ] **BUG 6 — Paco no se entera de que la conversacion se acabo.** Misma
      conversacion (573234799933), 8:38–8:39 p. m.

      El cliente **se despidio**: dijo que estaba caro y dio las gracias. Eso en
      Colombia es un "no, gracias" educado — no es una duda ni una pausa.
      Paco contesto:
      > 8:39 — 🍟 `Paco:` Con mucho gusto. ¿Que se te antoja? 🍟☺️
      >
      > 8:39 — 🍟 `Paco:` Con muchisimo gusto. ¿Que se te antoja? 🍟☺️

      Le insistio **dos veces** con la pregunta de venta a alguien que acababa
      de decir que no. Sergio: *"no tiene logica, debe ser conversacional y ser
      consciente de lo que estan conversando"*.

      **Hipotesis de la causa** (por comprobar, no dar por cierta): el mensaje
      sale partido en dos pedazos y solo el primero mira lo que dijo el cliente.
      "Con mucho gusto" / "Con muchisimo gusto" cambia entre un mensaje y otro,
      asi que **eso lo escribe el modelo**; "¿Que se te antoja?" es identico las
      dos veces, asi que **es la frase fija del paso `producto`, pegada
      siempre**. Nadie pregunta si el cliente sigue en la conversacion: mientras
      el paso activo sea `producto`, se repite su pregunta pase lo que pase.

      **Lo que hay que hacer:** detectar el cierre — despedida, agradecimiento
      final, rechazo por precio — y llevarlo a una rama de despedida, en vez de
      volver a preguntar por el paso activo. Despedirse y ya; el cliente sabe
      volver.

      ⚠️ **Cuidado con el arreglo facil.** Esto es la otra cara de lo que se
      arreglo el 13-ago (v270: las frases fijas se mandan tal cual, sin pasar
      por el modelo). Aquel cambio quito las preguntas deformadas y el pedido
      repetido en cada mensaje intermedio. **Si manana se revierte para ganar
      naturalidad, vuelven los tres bugs de ayer.** El camino no es soltarle el
      timon al modelo otra vez, sino que exista una rama de cierre que la frase
      fija no atropelle.

- [ ] **BUG 7 — Nunca repetir la misma pregunta en bucle. REGLA GENERAL, no un
      bug suelto.**

      Sergio, 14-ago: *"un ser humano nunca te preguntaria 3 o 5 veces la misma
      cosa sin sentido. Un humano te lo diria de otra manera: 'recuerda darme la
      direccion', 'no te olvides de la direccion', 'falta solo la direccion'"*.

      **Esto ya mordio antes, y esta escrito en el propio codigo.** Dos
      comentarios lo cuentan (`index.ts:428` y `:2239`): un cliente escribio
      *"Nosotros pasamos por ella"*, el bot no lo entendio y **le pidio la
      direccion cuatro veces seguidas hasta que el pedido se cayo**. Se arreglo
      esa causa concreta (la regex de "recoger" ahora entiende el plural), pero
      **no se arreglo el bucle**: si manana otra frase no se entiende, vuelve a
      preguntar cuatro veces igual.

      **Ya existe la pieza que hace falta, usada en un solo sitio.** En
      `index.ts:1998-2013`, para el producto ambiguo:
      ```ts
      amb.intentos = (amb.intentos || 0) + 1;
      if (amb.intentos >= 2) delete stAmb.producto_ambiguo;   // no insistir en bucle
      ```
      Un contador de intentos por paso. Esta hecho, esta probado, y solo cubre
      la desambiguacion de productos.

      **Lo que hay que hacer:** llevar ese contador a **todos** los pasos, y que
      cada intento cambie de tono en vez de repetir la frase palabra por
      palabra. Algo asi:

      | Intento | Que dice |
      |---|---|
      | 1 | La frase fija del paso, tal cual |
      | 2 | Un recordatorio corto y distinto: *"Me falta la direccion para poder enviarte el pedido 😊"* |
      | 3 | Decir que no se entendio y dar salida: *"Perdon, no logro entenderte. ¿Me la escribes de nuevo o prefieres que te contacte alguien del local?"* |
      | 4 | **No hay cuarta.** Pasa a un humano. |

      ⚠️ **Esto choca de frente con el arreglo del 13-ago** (v270: las frases
      fijas se mandan tal cual, sin pasar por el modelo). La frase fija es
      correcta **la primera vez**; a partir de la segunda, insistir con la misma
      frase es justo lo que un humano no haria. La salida no es volver a soltar
      el timon al modelo: es que **el segundo y el tercer intento tengan su
      propia frase configurable**, tan fija como la primera pero distinta.

      Va junto con **BUG 5** y **BUG 6**. Los tres son la misma queja de fondo:
      Paco sigue un guion en vez de seguir una conversacion.

---

## FASE 3 — Verificar antes de vender

- [ ] Migración de región del servidor
- [ ] Ensayo completo de alta de un restaurante nuevo
- [ ] OpenAI Tier 2
- [ ] Supabase más grande + copias de seguridad
- [ ] Escribir los planes comerciales
- [ ] Aviso de "sin conexión" + página de estado
- [ ] Limpiar los residuos de las pruebas
- [ ] Piloto con 1 o 2 restaurantes

---

## Al final: entrenar a Paco

Todo junto y de una vez, contra conversaciones reales del banco de pruebas.
Plan completo en `PLAN-ENTRENAR-PACO.md`.

- [ ] **Puntos por chat** — que Paco sepa cuántos puntos tiene un cliente, qué
      puede canjear y cuánto le falta. Hoy su motor **no menciona los puntos ni
      una vez**. El aviso de "ganaste X puntos" ya existe como la respuesta
      rápida `/puntos` (con la variable `{puntos_ganados}`) y **Sergio la manda
      a mano** — eso ya funciona; lo que falta es que Paco lo haga solo y sepa
      responder si le preguntan.

---

## Después: marketing

---

## Nota sobre esta lista

Dos entradas de la Fase 1 (el modal de recarga y el barrio desconocido) estaban
marcadas como pendientes **y ya existían**. La lista se escribió de memoria sin
contrastarla con el código.

**Antes de empezar cualquier pendiente de aquí, verificarlo en el código.**
