# CIERRE DE PROYECTO

Plan que definió Sergio para rematar Cobra POS antes de venderlo. Tres fases en
orden, y después la fase de marketing.

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

### Pendiente

- [ ] **Plantilla de redención de puntos** — el mensaje que se le manda al
      cliente cuando canjea.
- [ ] **Subida del banner en "Mi página web"** — *aplazado por Sergio el
      2026-08-09*: las imágenes del carrusel se suben desde Cobra.
- [ ] **Multi-marca, fases 2 a 4** — la fase 1 (la base) está hecha; ver
      entradas 103 y 104 de `ESTADO-SISTEMA.md`.
- [ ] **Historias de Instagram** — falta el endpoint.
- [ ] **Atajo "se acabó"** — *Sergio todavía no decidió dónde va*. No empezar
      hasta que lo diga.
- [ ] **Extender `pos-cache`** — hoy solo lo usan catálogo, dashboard, salón y
      pagos.

---

## FASE 2 — Errores que afectarían a un cliente nuevo

No son cosas que falten: son cosas que están mal y que hoy nadie ve porque
solo hay un restaurante usándolo.

- [ ] **Un comprobante puede pagar dos pedidos** cuando la mesa nunca se creó.
- [ ] **El Parche está hardcodeado** en 6 títulos, en la ubicación del chat, en
      el texto de domicilios y en la impresión del historial.
- [ ] **Un restaurante nuevo nace sin datos sembrados** — no arranca solo.
- [ ] **`payment_method` se guarda de 4 formas distintas**.
- [ ] **Las notas frecuentes no aparecen en venta rápida** — el HTML y el
      montaje SÍ están (`vr-nf-wrap`, `posNotas.montar`, mismo orden de scripts
      que domicilios, donde sí funciona). La causa está en otro lado.
- [ ] **La tarjeta de mesa dice "0 ítems · $0"**.
- [ ] **Auditoría de los `Promise.all`** — congelan pantallas sin dar error.
- [ ] **`mypass_vault` en "Allow all"**.
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

## Después: marketing

---

## Nota sobre esta lista

Dos entradas de la Fase 1 (el modal de recarga y el barrio desconocido) estaban
marcadas como pendientes **y ya existían**. La lista se escribió de memoria sin
contrastarla con el código.

**Antes de empezar cualquier pendiente de aquí, verificarlo en el código.**
