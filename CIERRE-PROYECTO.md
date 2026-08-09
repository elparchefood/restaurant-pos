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
- [ ] **Un restaurante nuevo nace sin datos sembrados** — no arranca solo.
- [ ] **`payment_method` se guarda de 4 formas distintas**.
- [x] **Las notas frecuentes no aparecían en venta rápida** — `S.cats` vs
      `S.categories`: el bloque se copió de domicilios y buscaba las categorías
      por el nombre equivocado. `2026-08-09`
- [x] **La tarjeta de mesa decía "0 ítems · $0"** — era otro síntoma del error
      de las mesas libres (la carga fallaba y pintaba ceros). El rastro en
      `pos_diag` confirma: el error paró en el minuto exacto del arreglo del
      8-ago y no ha vuelto. `2026-08-09`
- [ ] **Auditoría de los `Promise.all`** — congelan pantallas sin dar error.
- [ ] **`mypass_vault` en "Allow all"** — verificado: es la bóveda de
      contraseñas personal de Sergio (otro proyecto, misma base). Cualquiera
      con la llave pública de Cobra puede leerla o borrarla. **Copia de
      seguridad hecha el 9-ago** en `Documents/mypass-boveda-copia-2026-08-09.json`.
      Plan acordado: mudar MyPass a su propio proyecto Supabase — falta saber
      dónde vive el código/la página de MyPass. NO cerrar la regla antes de
      eso: rompería la app.
- [ ] **El envío de campañas vive en la pantalla** — si se cierra, se para.
      Debe correr en el servidor.

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
