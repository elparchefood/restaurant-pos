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

- [ ] **Subida del banner en "Mi página web"** — *aplazado por Sergio el
      2026-08-09*: las imágenes del carrusel se suben desde Cobra.
- [ ] **Multi-marca, fases 2 a 4** — la fase 1 (la base) está hecha; ver
      entradas 103 y 104 de `ESTADO-SISTEMA.md`.
- [ ] **Historias de Instagram** — falta el endpoint.
- [ ] **Atajo "se acabó"** — *Sergio todavía no decidió dónde va*. No empezar
      hasta que lo diga.

---

## FASE 2 — Errores que afectarían a un cliente nuevo

No son cosas que falten: son cosas que están mal y que hoy nadie ve porque
solo hay un restaurante usándolo.

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

- [ ] **Se puede crear un pedido con un producto SIN variante.** Si el cliente
      escribe "un jugo Hit personal" y no dice el sabor, el botón *Crear
      pedido* del chat arma el pedido con el Hit **sin sabor**.
      ⚠️ El daño real es de inventario: **no se sabe qué unidad descontar**.
      Regla que debe quedar: *no se puede crear un pedido sin las variantes y
      presentaciones completas*. Si en el mensaje no hay rastro del sabor,
      poner uno cualquiera (o preguntarlo), pero nunca dejarlo vacío.
      Sospechoso: el extractor devuelve el producto sin `variables` y nadie
      valida antes de insertar.

- [ ] **"En camino" abre también el modal de "Entregado".** En domicilios, al
      tocar *En camino* se disparan los dos a la vez, como si se hubiera
      pulsado *Entregado* al mismo tiempo. Toca cerrar el segundo modal a mano
      siempre. Huele a un handler que quedó pegado a los dos botones (o a que
      el modal de entrega no se cierra antes de repintar).

- [ ] **La comanda muestra el id crudo: `pm_q8ybbdpqb`.** Se ve en la tarjeta
      del domicilio, arriba a la derecha de COMANDA. Eso es un identificador
      interno de pago, no algo que el cliente o el mesero deban ver.

### Faltantes de la bandeja

- [ ] **Editar el nombre del contacto desde el chat.** Hoy solo se puede desde
      otras pantallas. Debe poder hacerse desde *Información del contacto*, y
      **el cambio debe verse reflejado solo** en la lista de clientes — igual
      en los dos sentidos: si se edita desde Domicilios, que el chat lo muestre.

- [ ] **Etiquetar varios chats a la vez.** Poner y quitar etiquetas en lote,
      con selección múltiple. Hoy es uno por uno.

- [ ] **Ver la etiqueta de cada chat en la lista.** A simple vista, sin abrir
      la conversación. (Las etiquetas ya existen: En preparación, Llevar, En
      camino, Pago, Entregado.)

- [ ] **La pestaña "Archivados" está de adorno** — hay que hacerla funcionar.

- [ ] **Revisar si "Míos" sirve para algo** o es redundante. Si no aporta, se
      quita: una pestaña que no hace nada confunde al cliente nuevo.

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
