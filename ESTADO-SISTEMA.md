# ESTADO DEL SISTEMA — Cobra POS
> Última actualización: 2026-07-18

Este documento registra el estado confirmado de cada componente. Se actualiza ronda a ronda. Si algo aparece como ✅ aquí, está funcionando en producción y **no debe tocarse** sin instrucción explícita.

---

## Supabase — Estado actual confirmado

### Tabla `pos_tables` (branch `66e5f12d-fd16-455a-a6c0-9694aa6fb01b`)

| id | name | zone_id | zone_name | sort_order | status |
|----|------|---------|-----------|------------|--------|
| t01 | 01 | z_adentro | Adentro | 0 | libre |
| t02 | 02 | z_adentro | Adentro | 1 | libre |
| t03 | 03 | z_adentro | Adentro | 2 | libre |
| t04 | 04 | z_adentro | Adentro | 3 | libre |
| t07 | 05 | z_ante | Antejardín | 4 | libre |
| t08 | 06 | z_ante | Antejardín | 5 | libre |
| tmr9k9e7ru3e | 07 | z_ante | Antejardín | 6 | libre |
| tmrcknnrsc07 | 09 | z_ante | Antejardín | 8 | libre |

**Zonas activas:** Adentro (4 mesas), Antejardín (4 mesas).
**Terraza NO existe** — cualquier fila con `zone_id='z_terraza'` es basura y debe eliminarse.

### `pos_orders`
- Todas las órdenes anteriores a 2026-07-08 con status `paid` o `in_progress` fueron marcadas `completed` (limpieza Ronda 8).
- Órdenes activas válidas: solo status `in_progress` o `esperando` con `opened_at` reciente.

---

## Archivos del proyecto

### Núcleo (no tocar)
| Archivo | Función | Ronda de última modificación |
|---------|---------|------------------------------|
| `pos-core.js` | Boot, auth, Supabase client (`window._pos`) | anterior a Ronda 2 |
| `pos-events.js` | Bus de eventos (`_pos.on` / `_pos.emit`) | anterior a Ronda 2 |
| `pos-realtime.js` | Subscripciones Supabase Realtime | anterior a Ronda 2 |
| `pos-sync.js` | Cola offline idempotente | anterior a Ronda 2 (fix Ronda 13/14) |
| `pos-caja-guard.js` | Guard: bloquea pedidos si caja no está abierta | Ronda 14 |
| `pos-router.js` | Navegación entre páginas | anterior a Ronda 2 |
| `pos-core.css` | Variables CSS, tipografía, elevación | Ronda 4 |
| `CNAME` | Dominio `cobrapos.app` | fijo |

### Páginas principales
| Archivo | Función | Estado |
|---------|---------|--------|
| `index.html` | Splash / redirect | ✅ OK |
| `login.html/js/css` | Login con Supabase Auth | ✅ OK |
| `dashboard.html/js/css` | Resumen del día, accesos | ✅ OK |
| `ventas.html` | Shell de la vista de salón | ✅ OK (Ronda 8) |
| `modules/ventas-salon.js` | Lógica completa de mesas por salón | ✅ OK (Ronda 8) |
| `tomar-pedido.html/js/css` | Flujo de pedido + modal de producto | ✅ OK |
| `pagos.html/js/css` | Pantalla de cobro | ✅ OK |
| `venta-rapida.html/js/css` | Ventas sin mesa | ✅ OK |
| `domicilios.html/js/css` | Pedidos de domicilio | ✅ OK |
| `historial.html/js/css` | Historial de ventas | ✅ OK |

### Configuración
| Archivo | Función | Estado |
|---------|---------|--------|
| `configuracion.html` | Shell de configuración | ✅ OK (Ronda 8, encoding corregido) |
| `configuracion.js` | Lógica: mesas, zonas, operación, usuarios | ✅ OK |
| `configuracion.css` | Estilos de configuración | ✅ OK |
| `impresoras.html/js/css` | Config de impresoras del sistema | ✅ OK (Ronda 5) |

### Impresión
| Archivo | Función | Estado |
|---------|---------|--------|
| `pos-print.js` | Modal de opciones, impresión silenciosa, auto-print comanda | ✅ OK (Ronda 13) |
| `pos-sync.js` | Cola offline idempotente | ✅ OK (Ronda 13) |

### Catálogo
| Archivo | Función | Estado |
|---------|---------|--------|
| `catalogo-productos.html/js/css` | CRUD de productos y presentaciones | ✅ OK |

### Otros
| Archivo | Función | Estado |
|---------|---------|--------|
| `chat-ia.html/js/css` | Chat IA integrado | ✅ OK |
| `caja.html/js/css` | Módulo de caja | ✅ OK |
| `inventario.html/js/css` | Inventario | ✅ OK |
| `admin-reg.html/js/css` | Registro de administrador | ✅ OK |
| `informes.html/js/css` | Informes y reportes (KPIs, gráfico, top prods, meseros) | ✅ OK (Ronda 12) |
| `reservas.html/js/css` | Gestión de reservas (CRUD, estados, realtime) | ⚠️ Requiere tabla `pos_reservations` en Supabase (ver schema en reservas.js) |
| `modules/kitchen.js` | KDS pantalla cocina (display tiempo real, mark-ready, filtros) | ✅ OK (Ronda 12) |

---

## Ejecutable Electron

| Componente | Ruta | Estado |
|-----------|------|--------|
| `main.js` | `C:\Prueba Claude Code\cobra-pos-electron\main.js` | ✅ OK (Ronda 7) |
| URL cargada | `https://cobrapos.app/dashboard.html` | ✅ correcto |
| Cache | `clearCache()` + headers `no-cache` en cada inicio | ✅ activo |
| Links externos | `setWindowOpenHandler` → browser del sistema | ✅ activo |

---

## Historial de correcciones por ronda

| Ronda | Fecha | Qué se corrigió |
|-------|-------|----------------|
| 2 | 2026-07-06 | Diseños visuales: tarjetas de producto, modificadores, impresión, elevación |
| 3 | 2026-07-06 | Sintaxis JS rota en ventas-salon.js y tomar-pedido.js |
| 4 | 2026-07-06 | Sistema de elevación/sombras aplicado a toda la app |
| 5 | 2026-07-06 | Ícono moto domicilio, detección de impresoras del sistema |
| 6 | 2026-07-06 | Logo exe restaurado, APK con Capacitor, cuelgue "Cargando sistema…" |
| 7 | 2026-07-06 | Acceso directo escritorio, URL Electron → cobrapos.app, headers no-cache |
| 8 | 2026-07-08 | Orden mesas (bug sort_order=0 falsy), status desde Supabase, limpieza órdenes viejas, encoding UTF-8 en HTML |
| 9 | 2026-07-08 | C10: automatización Comiendo → Libre con T1/T2/T3 (igual al sistema Esperando→Comiendo de C9). Config en Sección 7 de Operación. |
| 10 | 2026-07-08 | Análisis exhaustivo de 33 requerimientos vs código real. 13-PENDIENTES.md reescrito con estado actual: 15 impl., 6 parciales, 7 faltantes + 2 críticos de seguridad (RLS abierta, roles sin enforcement). Ver `cobra-pos-contexto/13-PENDIENTES.md`. |
| 11 | 2026-07-08 | Fix logout en Electron: catálogo/chat-ia/inventario no tenían `storageKey: 'cobra-pos-session'` en su createClient. Buscaban sesión en clave por defecto; Electron solo tiene `cobra-pos-session` (de pos-core.js). Fix en los 3 archivos JS + sus HTML (cache bust). También: getUser() → session.user en catalogo boot para evitar falla de llamada HTTP. |
| 12 | 2026-07-08 | Implementación de features pendientes: KDS cocina (modules/kitchen.js completo — display en tiempo real, mark-ready, filtros, beep sonoro), Informes (informes.html/js/css — KPIs, gráfico barras, top productos, ranking meseros, desglose canales y métodos pago, selector de período), Reservas (reservas.html/js/css — CRUD completo, estados, realtime, navegación por fecha). NOTA: Reservas requiere tabla `pos_reservations` en Supabase — el módulo detecta automáticamente si no existe y muestra mensaje al usuario. Dashboard: corregidos links Domicilio→domicilios.html, Reservas→reservas.html, Informes→informes.html. Botón "Publicidad" (deshabilitado) reemplazado por acceso rápido a Reservas. |
| 14 | 2026-07-11 | **Fix regresión impresión (causa raíz):** `_execOrderBatch` lanzaba error al hacer `pos_tables.update({status:'ocupada'})` → CHECK constraint solo permite libre/pendiente_pago/esperando/comiendo → batch caía offline → `S.order._offline=true` → print saltado. Fix 1: cambiar a `{status:'esperando'}` en tomar-pedido.js. Fix 2: hacer table update non-fatal (try/catch). Fix 3: flag `orderAlreadyExisted` para evitar reinsertar ítems en retry. **Auto-print domicilio:** domicilios.html no cargaba pos-print.js → añadido + `posAutoprint(_oid)` con timeout 4s. **Correcciones comanda domicilio:** PAX ocultado (solo aplica en mesa), CAJERO en vez de MESERO, nombre real del cajero desde `user_metadata.nombre`, barrio capturado ANTES del reset de estado, mods con wrapper `{mods:{}}`. **Cancelar pedido domicilio:** botón en panel de detalle de ventas-salon.js (3-dot menu) → `status='cancelled'` en Supabase + filtrado del state. **Guard de caja (nuevo):** `pos-caja-guard.js` — bloquea mesa/venta-rápida/domicilios si no hay `pos_sessions` con `status='open'`; modal con botón "Abrir caja" → `caja.html`. Aplicado en ventas.html (`table:open`), ventas-salon.js (nav-rapida, nav-domicilio, quick-nueva), venta-rapida.js (`core:ready`), domicilios.js (boot). Cache 60s + invalidación en visibilitychange. |
| 13 | 2026-07-10 | **Fix auto-print comanda (causa raíz encontrada):** `_fetchOrder` usaba join `pos_tables(name,number)` que requiere FK en Postgres. `pos_orders.table_id → pos_tables.id` NO tiene FK → toda la query retornaba `data: null` silenciosamente. Fix: dos queries separadas (pos_orders con pos_order_items usando FK real, luego pos_tables por ID). **Fix pos-sync duplicados:** `_execOrderBatch` generaba un nuevo UUID en cada reintento; fix: usar `_tempId` como el `id` real del INSERT (`id: tempId`), ignorar error 23505 en reintentos. **Fix auto-print timing:** `posAutoprint` se llamaba sin `await` en `sendToKitchen` → página navegaba antes de terminar la impresión. Fix: `await Promise.race([posAutoprint(...), timeout(4000)])`. **Cache-bust:** `pos-print.js` no tenía `?v=` → Electron cacheaba código viejo. Fix: `?v=2` → ahora `?v=3`. **Fix botón Reimprimir en panel de mesa:** `case 'print'` en ventas-salon.js emitía evento sin oyente; cambiado a llamar `posOpenPrintModal(orderId)` directamente. **Fix comanda domicilio:** canal `domicilio` ya se detecta correctamente tras `.toUpperCase()`; añadido `customer_name` en encabezado de comanda para domicilio/rapido. **Fix modificadores en comanda:** los mods estaban en `pos_order_items.selections.mods` (JSONB), no en columna `mods` que no existe; fix en `posAutoprint` y `posPrintAction` para extraer `Object.values(it.selections.mods||{})`. Mods ahora se muestran como `+ ITEM` en línea separada debajo del producto (igual que notas pero con `+`). **Fix orden nombre en comanda:** `[p.name, presLabel, varLabels]` → `[presLabel, p.name, varLabels]` en `tpMPAddToCart` de tomar-pedido.js (ej: "Familiar · Pizza · Mixta"). |

---

## Ideas pendientes para fases futuras

### Sistema de puntos de lealtad + tarjeta NFC (pendiente — Sergio lo quiere implementar)

**Concepto:** Cada cliente acumula puntos por sus compras y los puede canjear como método de pago. Lleva una **tarjeta NFC física**; al acercarla al lector, el POS identifica al cliente y carga su saldo.

**Fundación ya hecha (julio 2026):**
- Lista de clientes unificada en `localStorage` key `pos.clientes`, compartida entre `domicilios.js` y `venta-rapida.js`
- Migración automática desde claves antiguas al cargar cada módulo

**Lo que falta implementar:**
1. **Tabla Supabase `pos_customers`**: `id, tenant_id, name, phone, address, email, points_balance, nfc_tag_id, created_at` — pedir confirmación a Sergio antes de crearla
2. **Migrar modal de clientes**: en lugar de `localStorage`, leer/escribir desde `pos_customers` en Supabase
3. **Lector NFC en Electron**: usar Web NFC API o lector USB HID que escriba el `tag_id` como input de teclado
4. **Acumulación automática**: al cerrar una orden pagada, sumar puntos al cliente (ej. 1 punto por cada $1.000 COP)
5. **Método de pago "Puntos NFC"** en `pagos.html`: escanear tarjeta → identificar cliente → descontar puntos del saldo

**Por qué un solo sistema:** el cliente gana puntos sin importar si pide en mesa, domicilio o venta rápida.

---

### Caché local en Electron (pendiente — implementar cuando no haya más cambios activos)
Cachear en disco del exe:
- **Catálogo de productos** (nombres, precios, categorías, presentaciones) → IndexedDB o archivo JSON en `app.getPath('userData')`
- **Fotos de productos** → archivos PNG/JPG locales en userData; descargar una sola vez al subirse
- Usar hash de versión para saber si Supabase tiene algo nuevo; si hash coincide, usar caché; si no, descargar
- Estado de mesas y órdenes activas NO se cachean — siempre en vivo

---

## Arquitectura de impresión (pos-print.js)

- **`_fetchOrder(orderId)`** — Dos queries separadas: `pos_orders + pos_order_items(*)` (FK real existe), luego `pos_tables` por ID separado (no hay FK desde `pos_orders.table_id` → `pos_tables.id`, join inline falla en PostgREST).
- **`posAutoprint(orderId)`** — Ruta de Electron: verifica impresora en BD → fetch pedido → extrae mods desde `selections.mods` → `await _buildComanda()` → `await _printHtml()`. El `await` es crítico: sin él, la navegación de página cancela la impresión.
- **`_buildComanda(order, items)`** — Encabezado: domicilio/rapido muestran "DOMICILIO"/"PARA LLEVAR" + barrio (extraído de `notes` como `[barrio:X]`) + nombre cliente. Salón muestra "MESA N". Mods: línea separada `+ MODIFICADOR` debajo del ítem (no inline).
- **`pos-sync.js`** — `_execOrderBatch` es idempotente: usa `_tempId` como `id` real del INSERT, ignora error 23505 en reintentos. Nunca genera duplicados al reintentar.
- **Cache-busting:** `pos-print.js?v=3`, `tomar-pedido.js?v=27` en sus HTML. Sin `?v=` Electron no actualiza.

## Módulo WhatsApp Chat IA — Estado completo al 2026-07-18

### Edge Functions en producción
| Función | Versión | Estado | Qué hace |
|---------|---------|--------|----------|
| `meta-webhook` | v44 | ACTIVE | Recibe mensajes WA, guarda en DB, llama `delay-reply` |
| `delay-reply` | **v155** | ACTIVE | Cerebro del bot: slot-filling determinista, fidelidad al canvas, variables |
| `meta-send` | v9 | ACTIVE | Envía mensajes WA desde el panel Cobra |
| `verify-transfer` | **v13** | ACTIVE | Verificación automática de comprobantes (Vision+Gmail) + confirmación humana manual |
| `meta-oauth-callback` | v23 | ACTIVE | Conecta número WA por OAuth |

---

## 🟢 PUNTO DE RETORNO SEGURO — Sesión 10 (2026-07-18/19)

> Estado bueno conocido más reciente. `delay-reply` = **v162** · `verify-transfer` = **v16** · `meta-webhook` = **v46**.

- **v162 + verify-transfer v16 — "Yo la recojo" (prueba real de Sergio, 6/6)**: LLEVAR_REGEX solo cubría masculino ("lo recojo") → "Yo la recojo" caía en bucle de dirección. Ampliado a masculino/femenino/plural + variantes ("la/los recojo", "paso por ella/ellos", "voy por él", "paso a buscarla", "la busco", "recojo en el local") en AMBAS funciones (motor + verify-transfer para channel='rapido'). Además el RESUMEN ya no repite la frase del cliente como dirección: muestra `frases.llevar_etiqueta` (default "Para recoger en el local 🏃", editable en Mensajes). Verificado: sin bucle, pago auto-digital, resumen con etiqueta, orden en Rápidas pagada.

- **meta-webhook v46 — los AUDIOS despiertan al bot (prueba 2/2)**: el webhook solo encolaba la respuesta de IA para `msgType==='text'` — por eso los primeros audios reales de Sergio quedaron guardados pero SIN respuesta. Ahora texto Y audio encolan (la transcripción ocurre en delay-reply). Fuente canónica: `meta_webhook_deployed.ts` en el repo. ⚠️ LECCIÓN DE DEPLOY: el endpoint Management API `/functions/{slug}/body` devuelve el código con los PRIMEROS 4 BYTES CORTADOS ("cons" de "const") — desplegarlo tal cual causa BOOT_ERROR (pasó con v45, reparado en v46 en ~3 min). Siempre revisar que el archivo descargado empiece completo.
- **v161 — AUDIOS (notas de voz) — prueba 3/3**: el webhook ya guardaba los audios en el bucket chat-media (ogg); ahora `delay-reply` los TRANSCRIBE con Whisper (whisper-1, language=es, multipart desde la URL pública) ANTES del flujo — el texto entra como mensaje normal (extractores, canvas, todo). La transcripción se guarda en el chat como `🎙️ <texto>` (el operador ve qué entendió; el audio sigue reproducible). Límite 20MB; si Whisper falla, el mensaje queda como `[audio]` → respuesta de solo-texto (fallback intacto para stickers/videos). Probado end-to-end con TTS de Windows: "quiero una salchipapa ranchera familiar" por audio → producto y tamaño capturados + siguiente paso.

- **v160 — 3 fixes de la prueba real de Sergio (2026-07-19, pruebas 6/6)**:
  1. **"Mixta porfa" capturado como adición**: `CAT_ADICION_RE` matcheaba "adicion" DENTRO de "Salchipapas Tra-dicion-ales" → Mixta/Carne/Pollo se volvían palabras de adición. Fix: límites de palabra (`\b`). Además, guard nuevo: un mensaje corto (≤25 chars) que acaba de responder tamaño/variante JAMÁS se toma como adición.
  2. **"Por pagar" pese a transferencia verificada**: la pantalla **Ventas · Por salón** (`modules/ventas-salon.js` — pestañas Adentro/Antejardín/Domicilios/Rápidas) es DISTINTA al monitor domicilios.html y tenía payStatus derivado solo del status. Ahora lee `paid_amount`: chips Pagado / "Abonado $X · faltan $Y" / Por pagar en tarjeta y rail; en Rápidas muestra "✔ Pagado"/"Abonado" en totales y un pedido ya pagado ofrece "Ya entregué" en vez de "Cobrar". Cache-buster v=1783547529. (El pago real de Sergio SÍ estaba perfecto en DB: paid_amount + pos_payments.)
  3. **Upsell jamás preguntado**: el nodo 7 "Upsell / adiciones" del canvas era IA conversacional SIN variable → el motor no lo ejecutaba como paso (pendiente desde sesión 9 que nunca se materializó). Fix por DB con respaldo `backups-flujo-canvas-2026-07-20.json`: nodo 7 con `campo='adiciones'` + paso insertado. Flujo actual: tamano→tipo→**adiciones**→direccion→nombre→pago. Verificado: pregunta tras la variante, "no gracias"→dirección, "si, una coca cola"→capturada.

- **v158-v159 + verify-transfer v15 — ABONOS + PAGO MIXTO + estado de pago visible (pruebas 12/12)**:
  - **Columna `pos_orders.paid_amount`**: cuánto lleva pagado cada pedido (backfill de 27 pedidos históricos pagados). Estados: Pagado (paid≥total) / Parcial / Por pagar.
  - **El bot registra sus pagos verificados**: al verificar una transferencia (o confirmar con el botón humano), `crearPedido` guarda `paid_amount` + una fila en `pos_payments` (mismo circuito que caja). Pago completo → "Pagado"; mixto → "Parcial".
  - **PAGO MIXTO (bloque 14e-séptimo)**: "te paso 30 mil por nequi y el resto en efectivo" → `detectarPagoMixto` (nombres de métodos configurados + sinónimos coloquiales nequi/daviplata/transfer...; montos por cercanía en el texto; "30"→$30.000 vs total; "mitad"; monto en el lado efectivo se resta del total). Sin monto → pregunta (`frases.pago_mixto_monto`). Confirma división (`frases.pago_mixto`), `state.pago`=método digital (rama QR/comprobante de siempre), `state.pago_mixto={metodo,monto_digital,monto_efectivo}`. El comprobante se verifica contra la PARTE digital (12% tolerancia). Resumen muestra "transferencia $30.000 + efectivo $31.000". Verificado → pedido `payment_method='multiple'`, paid=parte digital, y el mensaje avisa el saldo (`frases.saldo_efectivo`). 3 frases nuevas editables en Mensajes.
  - **Pantalla de cobro (pagos.js) — ABONOS persistentes**: al abrir, carga los pagos ya registrados de la orden (no removibles, "Abono registrado") y solo cobra lo que falta. Botón nuevo **"Guardar abono"**: inserta los pagos nuevos en pos_payments y actualiza paid_amount SIN cerrar la orden. "Finalizar pago" solo inserta los pagos NUEVOS (no duplica los abonos ni las transferencias del bot) y deja paid_amount=total.
  - **Domicilios (monitor)**: chip de pago real — verde "Pagado", naranja "Parcial · faltan $X", amarillo "Por pagar" (antes TODO pedido WhatsApp salía "Por pagar" aunque la transferencia estuviera verificada — payStatus estaba fijo en código). El contador "por pagar" incluye parciales.
  - **Impresión (pos-print.js)**: recibos y comanda de domicilio/rápido llevan recuadro `*** PAGADO ***` / `ABONADO $X + COBRAR: $Y` / `COBRAR: $X` — el domiciliario sabe si cobra sin preguntar. Historial: paso "Abono recibido · $X (faltan $Y)".
  - **FIX de permisos encontrado en pruebas**: `pos_payments` NO tenía GRANT para `service_role` NI para `authenticated` (solo TRUNCATE/REFERENCES/TRIGGER) — el desglose de pagos de caja llevaba tiempo fallando en silencio. GRANT SELECT/INSERT/UPDATE/DELETE a ambos roles (RLS `tenant_payments` sigue activa para authenticated).
  - Cache-busters: domicilios.js?v=28, pagos.js?v=…172, pos-print.js?v=6, historial.js?v=2.

- **v156-v157 + verify-transfer v14 — INTERNACIONALIZACIÓN + fin de hardcodes de El Parche (pruebas 9/9)**:
  - **Zona horaria por restaurante**: `ia_config.zona_horaria` (horas vs UTC, default -5 Colombia). Selector de país en Configuración → Horarios. La usa TODO lo que depende de la hora: horarios de apertura, próximo día activo, ventana del comprobante, coherencia temporal del correo bancario (verify-transfer arma el offset "-05:00" desde config).
  - **Moneda por restaurante**: `ia_config.moneda` JSONB `{simbolo, miles, decimales, sufijo}` (default $ colombiano `$40.000`). UI en Horarios: símbolo + formato (CO/MX/EU) + símbolo-después (euros). `fmtMoney()` en el motor (fmtCOP/fmtPrice delegan) y `fmtMonto()` en verify-transfer. Probado: `US$56,000.00` / `US$61,000.00` con config mexicana.
  - **Remitentes bancarios editables**: `pagos.bancos_correo` (lista, textarea en la card de Gmail de Pagos). Vacío = bancos de Colombia (default). Un restaurante mexicano escribe "bbva mexico, mercadopago" y su verificación de Gmail funciona.
  - **Adiciones SIN hardcode**: la lista vieja de productos de El Parche en `ADICION_KEYWORDS` se reemplazó por: (1) palabras GENÉRICAS en código (adición/extra/bebida/gaseosa...), (2) productos de categorías del CATÁLOGO cuyo nombre suene a adición/bebida/salsa/topping (dinámico por restaurante — las Bebidas de El Parche se detectan solas), y (3) campo nuevo `ia_config.adiciones_palabras` (card "Palabras de adiciones" en Asistente). Las palabras viejas de El Parche se MIGRARON a su config (mismo comportamiento, ahora editable).
  - **Intención de pedido dinámica**: "salchipa" salió del regex; ahora `DYN_PROD_NAMES` (nombres de productos + categorías del catálogo, normalizados, con singular/plural) alimenta la detección: "una salchipapa porfa" (sin verbo) muestra la carta en cualquier restaurante con sus propios productos. "otra <producto>" también descarta un pago pendiente viejo.
  - **Defaults neutralizados**: upsell default "¿Deseas agregar algo más a tu pedido? 🤩", pago default "¿Cómo nos vas a pagar? ({{metodos_pago}}) ☺️" (lista real en vivo), "¿Qué deseas ordenar? 😋", ejemplos GPT sin sabor a Parche.
  - Columnas nuevas: `ia_config.zona_horaria` TEXT, `ia_config.moneda` JSONB, `ia_config.adiciones_palabras` JSONB. readModel/applyModel y pantalla Horarios actualizados (cache-buster configuracion.js?v=1784520002). `window._storedVentanaHoras` preserva `pagos.ventana_comprobante_horas` al guardar Pagos.
  - Pruebas internas: regresión flujo canvas completo OK, formato $ CO por defecto OK, moneda/zona personalizadas OK (y restauradas), adición por config OK, adición por catálogo OK, intención sin verbo OK, "otra ranchera" OK.

- **v155 — Canvas reordenado + "¿cuánto es?" (commit `8f46e7e`, prueba 8/8)**: el canvas quedó tamano→tipo→dirección→nombre→**pago** (pago al final, antes del resumen). El grafo tenía un ciclo 8→5 que rompía el recorrido (el orden caía al fallback por posición → pago salía antes de dirección); rewire con respaldo en `backups-flujo-canvas-2026-07-19.json`. Caso especial: en el paso pago, si el cliente pregunta "¿cuánto es?" en vez de dar el método → responde SOLO el desglose (`frases.solo_precio`, editable en Mensajes: 💵 Pedido / 🏍️ Domicilio / 💰 Total) y re-pregunta el pago con la frase del canvas; el resumen completo solo tras recibir el método. Nueva `calcularPreciosPedido()` (mismo pricing que la creación de pedidos, reutilizable).
- **v152-v154 — PARA LLEVAR completo (commits `601e6a1`, `98cc481`)**: nunca se pregunta "¿domicilio o llevar?" (domicilio es default; solo el cliente lo cambia: "yo paso", "lo recojo", "para llevar"). Llevar exige prepago digital (toggle `domicilios.llevar_prepago`, default on): si el bot ya sabe que es llevar, SALTA la pregunta del pago y auto-asigna el método digital → resumen → QR/comprobante. La explicación (`frases.llevar_efectivo`, editable) SOLO si el cliente menciona efectivo por su cuenta — probado en los 3 órdenes posibles. Pedidos llevar → `channel='rapido'` (sección Rápidas); domicilio → 'domicilio'. En ambos creadores (bot y verify-transfer).
- **v148-v149 — Fuera de servicio determinístico (commit `a756a15`)**: 3 estados — antes de abrir (`frases.antes_horario` con {{hora_apertura}}) / después de cerrar (`frases.fuera_horario`) / día cerrado (`frases.dia_cerrado` con {{proximo_dia}} = próximo día ACTIVO real, saltando días cerrados seguidos). Se anuncia desde el saludo; mientras cerrado responde solo información (carta/precios/FAQ) y frena pedidos con la frase oficial. Frases editables por restaurante en Mensajes.
- **v147 — Config del asistente reconectada (commit `dfdc5ec`)**: instrucciones = personalidad; negocio/FAQ/vocabulario/situaciones/prohibiciones inyectados SUBORDINADOS al canvas ("úsalo SOLO para responder preguntas — el flujo lo dicta PRÓXIMO PASO"). Instrucciones de El Parche reescritas sin flujo (respaldo `backups-instrucciones-2026-07-18.txt`).
- **v146 + verify-transfer v13 — Fix "1×null" (commit `dd5a867`)**: `pos_order_items` tiene DOS columnas de nombre; la UI pinta `name`, el bot solo llenaba `product_name`. Ambos creadores llenan las dos; 55 items históricos reparados. REGLA: al crear items siempre llenar `name` Y `product_name`.
- **Escudo de pagos (commits `78d7be7`, `b7f4e65`, `9e2b33d` — probado EN VIVO con transferencia real de $40.000)**: (1) GPT jamás da un pago por recibido de palabra — solo el verificador crea pedidos digitales; (2) monto del comprobante vs cotización; (3) ANTI-REPLAY: referencia quemada en notas del pedido (`Ref:XXXX`), comprobante repetido → rechazo; (4) ventana del turno: solo correos bancarios de las últimas N horas (`pagos.ventana_comprobante_horas`, default 5); (5) reintentos Gmail 3×35s + aviso "dame un momento ⏳" (el correo del banco tarda 1-2 min); (6) el pago pendiente sobrevive a textos del cliente (solo lo descarta un pedido nuevo o >24h). Rechazos → pestaña "Pagos por confirmar" → botón **Confirmar pago** = confirmación humana (`manual:true`): crea el pedido sin chequeos automáticos.
- **v142-v144**: "quiero una salchipapa" (intención sin producto) → envía la carta en IMÁGENES + frase del nodo Producto del canvas (ya no vuelca el menú en texto).
- **v139-v141 — captura multi-línea (commit `f31307b`)**: nombre/dirección de mensajes todo-en-uno por líneas; reclamos ("ya te lo dije") jamás se guardan como nombre.
- **Auditoría de hardcodes (2026-07-19, análisis)**: cero datos de El Parche en código. Pendiente de generalizar (funcional): `ADICION_KEYWORDS` (productos para detectar adiciones — derivar del catálogo) y "salchipa" en los regex de intención. Colombia-general asumido: UTC-5, formato $ es-CO, lista de bancos en verify_transfer, nomenclatura de direcciones.

---

## 🟢 PUNTO DE RETORNO SEGURO — Sesión 9 (2026-07-18)

> Si algo se rompe, este es el estado bueno conocido al que regresar.

### Versiones / commits de referencia
- **`delay-reply` = v141** · **`verify-transfer` = v7** (ACTIVE).
- **v139-v141 — captura multi-línea (commit `f31307b`)**: nombre y dirección se capturan de mensajes todo-en-uno por LÍNEAS (marcadores explícitos + heurística de línea con forma de nombre); reclamos ("ya te lo dije") jamás se guardan como nombre. Prueba 6/6.
- **verify-transfer v7 (commit `2827692`)**: corregido bug crítico (leía formato viejo del estado → total esperado $0 y pedidos vacíos). `resolverPedido()` con estado actual + precios matriz + domicilio por zona; pedido completo al verificar; Vision extrae HORA y se cruza con la hora real del correo (±6h). Validado contra catálogo real. Pendiente: prueba end-to-end con transferencia real.
- **v136 — billete (commit `17edeb4`)**: regla hardcoded eliminada; `pagos.nota` limpiada por decisión del restaurante (la config decide si se pregunta el billete).
- **v137 — Variables del catálogo (commit `90b3e3b`, prueba 5/5)**: cada producto genera `{{presentaciones_<slug>}}` y `{{variantes_<slug>}}` (derivadas del catálogo en vivo, `slugVariable`+`listaNatural`); selectores `{{presentaciones_producto}}`/`{{variantes_producto}}` resuelven las del producto del pedido en curso (matching flexible en `resolverDato`). Un solo nodo de tamaño/tipo sirve para todo el catálogo (Premium→"familiar o personal"/"mixta, carne o pollo"; Coca Cola→"personal o 1.5 litros"). Chips nuevos en el editor de flujo.
- **v138 — Métodos de pago editables (commit `5b7ba63`, prueba 4/4)**: pantalla Pagos con lista editable (`pagos.metodos=[{nombre,digital}]`, migra sola desde los booleanos viejos); `getMetodosPago`/`esMetodoDigital` en el motor; `extractPago` dinámico contra los nombres configurados + sinónimos (transfe→digital, cash→normal); la rama del resumen (cierre vs QR+comprobante) la decide el flag `digital` del método; `{{metodos_pago}}` sale de la lista en vivo. Verificado con método nuevo "Bancolombia" (el bot lo ofrece, lo reconoce y va por comprobante) y Efectivo (cierre directo). REGLA de testing: los tests que tocan config real hacen SNAPSHOT/RESTORE (nunca poner NULL — el canvas de producción ya es real).
- **v135 — Fix pago saltado (commit `49d16a1`)**: el safety net 14e-ter escaneaba el historial (15 msgs) buscando pago y rescataba el "efectivo" del pedido ANTERIOR → el paso PAGO del canvas se saltaba en pedidos repetidos. Eliminado: cada pedido pregunta su pago; el extractor del mensaje actual cubre "todo en un mensaje". Prueba interna 4/4 (2 pedidos seguidos en la misma conversación). REGLA: ningún safety net puede leer historial de pedidos anteriores para llenar slots del pedido actual.
- **v134 — CANVAS COMPLETO (commit `b1d2fd0`)**: todo el flujo de Sergio (9 pasos) es representable y obligatorio en el canvas. Prueba interna 12/12 (snapshot/restore de config real):
  - **Nodo Producto** (campo="producto" en flujo_pasos): frase del "¿qué deseas?" + toggle `mostrar_menu`. El caso sin-producto del motor lo lee de `cfg.flujo_pasos`.
  - **Evento "Pide la carta"** (nodo paleta type='carta', sin conexiones): frase que acompaña las imágenes del menú → `flujo_extras.carta`.
  - **Nodo Dirección** con sub-preguntas `preg_incompleta`/`preg_barrio` (4 rutas del motor las prefieren sobre frases config).
  - **Resumen con 2 salidas**: output_1=efectivo→nodo cierre (`flujo_extras.cierre`), output_2=transferencia→nodo comprobante (`flujo_extras.comprobante`), ambos con variables `{{...}}`. `migrarCanvas()` agrega las salidas a canvas guardados viejos.
  - Columna nueva: `ia_config.flujo_extras` (JSONB). Cache-buster iframe `?v=20260718d`.
  - **Acción del restaurante**: abrir el editor actualizado, asignar variable "producto" a su nodo "¿qué deseas?" (o crear uno), reemplazar "Ver menú" por el nodo "Evento: Pide la carta", conectar las 2 salidas del Resumen a sus nodos de cierre/comprobante, y Guardar.
- **Fix upsell saltado (commit `8406bfe`)**: el motor solo ejecuta nodos con variable (`campo`). El nodo Upsell del canvas era "IA conversacional" sin variable → no entraba al flujo. Ahora los nodos de mensaje (Frase fija / IA conversacional) tienen selector "Variable a capturar (opcional)" — el Upsell se configura con `adiciones` y entra en su lugar exacto. Nodos solo-mensaje sin variable ("Ver menú", "¿Otro producto?", "Esperar comprobante") no son pasos: su mecánica vive en el motor (detección de menú, multi-producto, comprobante).
- **v133 — Bot 100% canvas/config (commit `bf1b58c`)**: PRINCIPIO ARQUITECTURAL — el código pone la mecánica; TODO el contenido sale del canvas y de la config del asistente (producto multi-restaurante, nada de frases de un restaurante en código).
  - Eliminado `PACO_BIENVENIDAS` (hardcode "El Parche"). Bienvenida: (1) `ia_config.flujo_saludo` (nodo Saludo del canvas — fija con variables o conversacional vía GPT con la guía), (2) `frases.bienvenidas`, (3) `frases.apertura`/`apertura_conocido`, (4) plantilla neutra armada con config (nombre bot + restaurante).
  - `flow-editor.html`: `exportarSaludo()` guarda el primer nodo de mensaje sin slot en `flujo_saludo`; `exportarFlujoPasos()` recupera ramas paralelas del grafo (no se pierden pasos); `saveFlow()` incluye `tenant_id` + muestra "Error al guardar" en rojo si Supabase falla (nunca Guardado falso).
  - `configuracion.html`: cache-buster `?v=` en el iframe del editor (el ejecutable cacheaba versiones viejas — causa de que el canvas "guardado" nunca llegara a la DB).
  - Columna nueva: `ia_config.flujo_saludo` (JSONB).
  - Prueba interna 7/7 (saludo fijo exacto + variables, conversacional sigue guía, fallback apertura config, pasos canvas).
  - ⚠️ **El restaurante debe RE-GUARDAR su flujo desde el canvas** (con el editor nuevo) para poblar `flujo_pasos`/`flujo_saludo` — hasta entonces el bot usa defaults de config.
- **Fixes v131/v132 (commit `ff8c8d6`)**: (1) `SALUDO_REGEX` detecta saludos compuestos ("hola buenas", "buenas tardes") → ya no vuelcan la carta; (2) el caso sin-producto distingue saludo/charla (respuesta breve) de intención de pedir (muestra menú); (3) `procesarFlujoCanvas`: el paso "nombre" respeta la frase fija del canvas si se configuró (el canvas manda), la confirmación del nombre WA queda como default; (4) `flow-editor.html`: ResizeObserver refresca zoom+conexiones cuando el canvas pasa de oculto (0px en la pestaña Flujo) a visible → líneas visibles al abrir la pestaña. **Prueba interna 8/8**: saludos no vuelcan carta + el bot sigue cada paso del canvas (tamaño/dirección/nombre/pago) en orden y con sus frases.
- **Constructor de variables** (commit `96db29e`): pestaña "Variables" en Configuración del Asistente. El usuario crea variables `{{nombre}}` de tipo **dato** (apunta a una fuente del catálogo de `resolverDato`: pedido, tiempo, restaurante, pagos, catálogo, cliente) o **frase** (texto libre, resuelto en cascada). Se guardan en `ia_config.variables` (JSONB) vía el botón global (readModel/applyModel). El motor (`rellenarVariables` + `resolverDato`) las resuelve; `cfg._varData` se arma en el handler (carga branch + tiempo + pagos + menú). Seguro: `variables=NULL` → el bot las ignora. Pendiente: fuentes `precio`/`precio_total` de producto (requieren catálogo de precios).
- **Repo GitHub `elparchefood/restaurant-pos`, rama `main`:**
  - `3fcdf35` — editor de flujo: arreglo de líneas invisibles y zoom con rueda (API nativa de Drawflow).
  - `6503d4e` — editor de flujo: primer intento líneas/zoom.
  - `e685a2f` — canvas de flujo configurable + fidelidad del bot (motor v129 + flow-editor.html).
- **Fuente del EF**: `delay_reply.ts` en el repo refleja lo desplegado como v129.

### Qué quedó FUNCIONANDO y VERIFICADO (no tocar sin instrucción)

**Flujo del pedido — 9 pasos, fieles a lo definido por Sergio:**
1. Saludo → responde + "¿en qué te ayudo?" con emojis.
2. Intención de pedido → usa la frase del canvas (`menu_frase`, ej. "¿Qué se te antoja?") — NO enumera productos.
3. Pide la carta → envía imágenes del menú + frase.
4. Producto sin tamaño/tipo → pregunta lo que falta (opciones reales del catálogo).
5. Upsell (bebida/queso/salsas) — va justo después del producto.
6. Dirección → valida vía+interceptora+número (3 números); pide barrio si falta.
7. **Nombre → CONFIRMA** "¿va a nombre de X?" (3 casos: WA válido, nombre raro, recurrente). Aísla el nombre de frases ("no, va a nombre de Andrea" → "Andrea").
8. **Pago → es el ÚLTIMO paso** antes del resumen.
9. Resumen con plantilla + placeholders + confirmación → efectivo crea orden en `pos_orders`; transferencia envía QR + `pago_pendiente`.

**Fidelidad (fixes clave de la sesión):**
- **Modo fija ESTRICTO**: GPT lanza la frase exacta del canvas, PROHIBIDO agregar preguntas propias (ej. ya no pregunta por el billete).
- **Variables `{{...}}`** en frases de pasos (`rellenarVariables`): `{{producto}}{{tamano}}{{tipo}}{{cantidad}}{{adiciones}}{{direccion}}{{pago}}{{nombre}}{{precio_domi}}`. Condicionadas: si `{{precio_domi}}` necesita barrio y no lo hay → el bot pide el barrio en vez de dar precio falso. (`{{precio}}`/`{{precio_total}}` de producto = "a confirmar", pendiente cargar catálogo.)

**Canvas configurable — CONECTADO al motor:**
- `ia_config` tiene 2 columnas nuevas: `flujo_pasos` (JSONB, array de pasos para el motor) y `flujo_canvas` (JSONB, diseño visual completo del editor).
- `flow-editor.html` al **Guardar** exporta el flujo completo (orden + cada paso con modo/frase/variables) a esas columnas. Al abrir, carga desde Supabase (fuente de verdad) > localStorage > demo.
- El motor (`buildAllPasos` + `procesarFlujoCanvas` en delay_reply.ts) respeta ese flujo: orden, modo (fija/conversacional), frases; inyecta opciones dinámicas de producto en tamaño/tipo; omite pasos que no apliquen.
- **Editor visual arreglado**: las líneas se ven al cargar y el zoom responde a la rueda del mouse (se usa la API nativa `editor.zoom_in/zoom_out/zoom_refresh`; el `editor.precanvas` es el elemento que se transforma, NO `.parent-drawflow` que no existe en el Drawflow actual).

### 🛟 CÓMO REVERTIR si un flujo del canvas queda mal
- **Seguro de vida**: poner `ia_config.flujo_pasos = NULL` para ese branch → el motor vuelve al flujo por defecto (idéntico al de esta doc) al instante.
  ```sql
  UPDATE ia_config SET flujo_pasos = NULL WHERE branch_id = '66e5f12d-fd16-455a-a6c0-9694aa6fb01b';
  ```
- **Revertir código**: `git checkout 3fcdf35 -- flow-editor.html` (canvas) y/o redeployar `delay_reply.ts` de ese commit como v129.

### Pendiente (siguiente sesión)
- Prueba end-to-end del canvas CON login real de Sergio (guardar desde el editor → ver el bot obedecer por WhatsApp).
- Variables de precio de producto (`{{precio}}`, `{{precio_total}}`) — requieren reusar `getPrecioItem` fuera del resumen.
- Chips `{opciones}` en el panel de tamaño/tipo del editor.
- Afinar verificación de transferencia con Gmail (`verify-transfer`).

---

### Módulo WhatsApp Chat IA — delay-reply v119 (HISTÓRICO — superado por v129, ver PUNTO DE RETORNO arriba)

> ⚠️ Lo de abajo describe la arquitectura base de la sesión 8 (v119). Sigue siendo válido como fundamento, PERO dos cosas cambiaron en sesión 9 (v129): (1) el orden por defecto ahora es `upsell → direccion → nombre → PAGO` (pago es lo último, no antes del nombre); (2) el nombre YA NO se auto-completa — se CONFIRMA en su paso. Para el estado vigente, ver la sección "PUNTO DE RETORNO SEGURO — Sesión 9".

### ARQUITECTURA BASE: v119 (fundamento del slot-filling)

La arquitectura cambió fundamentalmente en sesión 8. Ya NO usa el sistema GPT con function calling de v52. Ahora usa **slot-filling determinista** con pasos independientes.

#### Flujo v119 verificado — 2026-07-17 (simulación interna)
```
Cliente: "Dame una salchipapa personal premium mixta, pago en efectivo"
Bot:     [detecta producto/tamano/tipo/pago en un solo mensaje]
         "¿Deseas adicionar alguna bebida, salchicha ranchera, super queso...?"

Cliente: "No gracias"
Bot:     "¿Para dónde va tu pedido?"

Cliente: "Carrera 9 b # 63-58 Bellavista"
Bot:     "Listo! Tu pedido queda asi:
         🍟 1x Premium Mixta Personal
         📍 Carrera 9 b # 63-58 Bellavista
         💳 efectivo
         👤 Sergio Abadia
         💵 Pedido: $35.000
         🏍️ Domicilio: $5.000
         💰 *Total: $40.000*
         ¿Lo confirmamos o hay algo que cambiar?"

Cliente: "si"
Bot:     "En un momento enviamos tu pedido 🍟 ¡Con muchísimo gusto!"
DB:      pos_orders creado (status=open, total=35000, customer_name=Sergio Abadia)
```

#### Principios arquitecturales v119
- **Pasos independientes**: cada paso llena un slot. No depende de otros pasos.
- **`flujo_pasos`** en `ia_config`: configurable desde canvas. Si no existe, usa pasos por defecto: upsell → confirmar_dir → direccion → pago → nombre.
- **Auto-nombre**: si el contacto WA tiene nombre, se auto-completa antes de `findNextStep`.
- **`direccion_heredada`**: se limpia automáticamente cuando hay producto activo → nunca bloquea el flujo.
- **Extractores siempre corren**: no hay early return en `runExtractors` → un mensaje puede llenar múltiples slots.
- **Respuestas via GPT**: modo `fija` = texto exacto del campo `texto`; modo `conversacional` = guía para GPT.

#### Bugs corregidos (v119 sobre v70)
1. **Resumen sin desglose** → template `buildSummaryFromState` ahora siempre corre cuando todos los slots están llenos.
2. **Sin pregunta de confirmación** → mismo fix: GPT ya no puede generar resumen falso.
3. **`confirmar_dir` bloqueaba el flujo** → se limpia con `direccion_heredada = false` cuando producto activo.
4. **`nombre` desencadenaba GPT** → auto-completado desde contacto WA antes de evaluación.

#### Deploy de delay-reply — RUTA CORRECTA
```python
# SIEMPRE usar ruta Windows explícita (no /tmp/ — Python lee C:\tmp\ que es diferente)
code = open(r'C:\Users\USUARIO\AppData\Local\Temp\restaurant-pos\delay_reply.ts', encoding='utf-8').read()
payload = json.dumps({"body": code, "verify_jwt": False})
# Guardar en archivo y deployar con PowerShell WebRequest (no curl ni Invoke-WebRequest)
```

### Estado de Edge Functions (2026-07-17)
| Función | Versión | Estado |
|---------|---------|--------|
| `meta-webhook` | v44 | ACTIVE |
| `delay-reply` | **v120** (código v119) | ACTIVE — slot-filling determinista verificado |
| `meta-send` | v9 | ACTIVE |
| `meta-oauth-callback` | v23 | ACTIVE |
| `verify-transfer` | v6 | ACTIVE |

### Flujo de pedido verificado end-to-end (2026-07-14)
El bot fue probado en WhatsApp real desde el número del restaurante y **completó el flujo entero sin errores**:
1. Saludo → pregunta tipo de producto ✅
2. Especificación producto → oferta upsell ✅
3. "No gracias" → pregunta dirección ✅
4. Dirección → pregunta método de pago ✅
5. "efectivo" → pregunta nombre ✅
6. Nombre → resumen con plantilla (`resumen_plantilla` de `ia_config`) ✅
7. "sí" → "En un momento enviamos tu pedido 🍟 ¡Con muchísimo gusto!" ✅
8. `pos_orders` creado en DB con todos los datos ✅

### Bug crítico corregido en esta sesión (v52)
**Causa raíz:** El bloque `isResumen` (detecta cuando GPT incluye 🍟+📍+💳) tenía una segunda llamada `await fetch(openai)` sin try-catch. Si lanzaba excepción, el catch externo (líneas 19-25) solo ejecutaba `sbPatch({ai_typing: false})` sin enviar respuesta ni marcar `last_sender="agent"`. Resultado: bot silencioso, `last_sender` quedaba en `"contact"`, conversación bloqueada.

**Fix:** El bloque `isResumen` completo envuelto en try-catch propio. El catch manda el texto raw de GPT como fallback y siempre completa correctamente.

### Flujo EFECTIVO — verificado ✅ end-to-end (2026-07-14)

```
Cliente: "Hola quiero una salchipapa familiar"
Bot:     Pregunta tipo (tradicional/premium/ranchera)
Cliente: "premium mixta"
Bot:     Oferta upsell (bebida/salchicha/queso/salsas)
Cliente: "No gracias"
Bot:     "¿Para dónde va tu pedido?"
Cliente: [dirección]
Bot:     "¿Transferencia o efectivo?"
Cliente: "efectivo"
Bot:     "¿A nombre de quién se recibe el pedido?"
Cliente: [nombre]
Bot:     [Resumen con plantilla resumen_plantilla — incluye 🍟+📍+💳]
         "¿Lo confirmamos o hay algo que cambiar?"
Cliente: "sí"
Bot:     "En un momento enviamos tu pedido 🍟 ¡Con muchísimo gusto!"
DB:      pos_orders creado (status=open, payment_method=efectivo, notes=dirección)
         pos_order_items creado (product_name="Premium · Familiar")
```

### Flujo TRANSFERENCIA — parcialmente funciona (2026-07-14)

```
[Pasos 1-6 idénticos al flujo efectivo]
Cliente: "transferencia" o "nequi"
Bot:     [Resumen con plantilla — incluye 🍟+📍+💳]
         "¿Lo confirmamos o hay algo que cambiar?"
Cliente: "sí" (o "correcto", "es correcto", etc.)
Bot:     Mensaje de confirmación GPT  ← ✅ funciona
         [delay-reply setea pago_pendiente=true + guarda pending_order_data]
Bot:     [Imagen QR de Nequi] con texto de qr_texto de ia_config  ← ✅ funciona
         (QR URL: storage/v1/object/public/chat-media/qr-pago/.../qr.jpeg)
         (Número de llave: 0089912015, Titular: El Parche)

Cliente: [Envía foto del comprobante de pago]
Cobra:   Operador ve la conversación en chat-ia.html con estado "Pago pendiente"
Cobra:   Operador hace clic en botón "Verificar pago" → llama verify-transfer EF

verify-transfer EF:
  1. Descarga imagen más reciente de chat_messages (media_url)
  2. GPT-4o Vision extrae: monto, fecha, banco, parece_valido del comprobante
  3. Si tiene gmail_refresh_token:
     → busca en Gmail últimos 3 días con ese monto
     → si email de banco encontrado: confirmed=true → crea pedido + envía "✅ Pago verificado"
     → si no encontrado: confirmed=false → envía "⚠️ Recibimos tu comprobante..."
  4. Si NO tiene gmail_refresh_token:
     → confía en GPT Vision (parece_valido) → crea pedido si parece válido

ESTADO ACTUAL — verify-transfer v5 (2026-07-14):
✅ BUG 1 CORREGIDO: phoneId leído correctamente desde meta (JSON.parse + phone_id)
✅ BUG 2 CORREGIDO: prompt GPT Vision actualizado — NO rechaza por "pendiente" en Nequi
✅ Gmail busca monto en 3 formatos: "33000", "33.000", "33.000,00"
✅ Llave Nequi comparada contra ia_config.pagos.llave ("0089912015")
✅ Monto comparado con total calculado desde catálogo (tolerancia 12%)
```

### Puntos clave de la arquitectura delay-reply v52
- **`puedeTomarPedidos`** = `isOpen || pedidosProg` — controla si GPT-4o usa function calling
- **`isResumen`** detecta emojis 🍟+📍+💳 en el draft de GPT → segunda llamada OAI para extracción estructurada → rellena `resumen_plantilla`
- **Confirmación** detecta "sí"/"correcto"/"dale"/etc. post-resumen → `tool_choice: required` → `crear_pedido` tool → `createWhatsappOrder()`
- **`createWhatsappOrder()`** crea `pos_orders` (channel=whatsapp, notes=dirección), `pos_order_items` (product_name="PresentationName · ProductName"), actualiza `pos_clientes`
- **Precio en resumen**: GPT estima el precio. Pedido real en DB usa precio del catálogo. Discrepancia conocida y aceptada.
- **`pending_order_data`** (JSONB en `chat_conversations`) — columna para debug. La columna `notes` NO existe en esa tabla.
- **`pago_pendiente`** (BOOLEAN en `chat_conversations`) — se activa cuando pago es por transferencia/nequi y el cliente dijo "sí" al resumen

### chat_channels — estructura CRÍTICA
La columna `meta` en `chat_channels` para WhatsApp es un **JSON serializado como STRING** (no JSONB):
```json
{
  "access_token": "EAAYn78d...",
  "connected_at": "2026-07-12T17:14:52.710Z",
  "waba_id": "1597436841735444",
  "phone_id": "1267893973063645"
}
```
**OJO**: La clave se llama `phone_id`, NO `phone_number_id`. Y `meta` debe parsearse con `JSON.parse()` porque es string, no objeto. `delay-reply` NO lee de aquí — lee de `chat_ai_queue` directamente. `verify-transfer` v5 ya lo maneja correctamente.

### ia_config — valores relevantes para transferencia
| Campo | Valor actual |
|-------|-------------|
| `gmail_verificar` | `false` — verificación Gmail desactivada |
| `gmail_refresh_token` | existe (no null) |
| `gmail_email` | `elparche.foodpopayan@gmail.com` |
| `pagos.nequi` | `true` |
| `pagos.llave` | `0089912015` |
| `pagos.titular` | `El Parche` |
| `pagos.esperar_comprobante` | `true` |
| `pagos.qr_imagen_url` | URL de imagen QR en Supabase Storage |
| `pagos.qr_texto` | Texto que acompaña el QR |

### Bugs corregidos en verify-transfer (resueltos en v3-v5, 2026-07-14)

#### BUG 1 — CORREGIDO en v3 — Mensaje no llegaba al cliente por WhatsApp
**Causa raíz**: Código buscaba `channel?.phone_number_id` pero la columna no existe. El campo dentro de `meta` (que es string JSON) se llama `phone_id`.
**Fix aplicado**: `JSON.parse(meta)` + usar `metaParsed.phone_id` y `metaParsed.access_token`.

#### BUG 2 — CORREGIDO en v3 — Gmail no encontraba el monto en formato colombiano
**Causa raíz**: Gmail recibe "$33.000" pero el código buscaba "33000" (dígitos crudos).
**Fix aplicado**: Busca en 3 formatos: `["33000", "33.000", "33.000,00"]`.

#### BUG 3 — CORREGIDO en v3 — Llave Nequi no se comparaba
**Fix aplicado**: Extrae llave del comprobante via GPT Vision, compara con `ia_config.pagos.llave` ("0089912015").

#### BUG 4 — CORREGIDO en v5 — Rechazaba comprobantes Nequi con texto "pendiente"
**Causa raíz**: El prompt de GPT Vision y la condición de rechazo eran demasiado estrictos. Nequi muestra "pendiente" incluso en pagos ya procesados.
**Fix aplicado**: 
- Condición de rechazo cambiada de `(!parece_valido || !monto)` a `(!parece_valido && !monto)` — solo rechaza si ambos fallan
- Prompt GPT Vision actualizado: "NO marques parece_valido=false solo por ver la palabra 'pendiente'"

### Proceso de deploy de delay-reply
```
1. Editar /tmp/restaurant-pos/delay_reply.ts
2. Python: body = json.dumps({"body": open("delay_reply.ts").read(), "verify_jwt": False})
           open("deploy_body.json", "w").write(body)
3. PowerShell WebClient (NO curl/ConvertTo-Json — corrompen emojis y tildes):
   $wc = New-Object System.Net.WebClient
   $wc.Headers["Authorization"] = "Bearer sbp_..."
   $wc.Headers["Content-Type"] = "application/json"
   $wc.UploadString("https://api.supabase.com/v1/projects/tblujfduscslxjmrjbdr/functions/delay-reply", "PATCH", $body)
4. Verificar versión: curl -s -H "Authorization: Bearer sbp_..." .../functions/delay-reply | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'])"
```

### Número y credenciales WhatsApp
- **Número**: +57 301 9421653
- **Phone Number ID**: `1267893973063645`
- **WABA ID**: `1597436841735444`
- **Webhook URL**: `https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/meta-webhook`

---

## Bugs conocidos / cosas a vigilar

1. **`configuracion.js` — auto-sync al abrir**: La función `syncToSupabase()` se llama en `DOMContentLoaded`. Si el localStorage tiene datos viejos cuando se abre Configuraciones, puede escribir basura a Supabase. No abrir Configuraciones con localStorage desactualizado.

2. **sort_order=0**: La mesa con `sort_order=0` (actualmente t01) requiere la comparación `!= null` en el sort, no `|| 9999`. Si se añaden mesas nuevas con sort_order=0, pueden quedar al final visualmente.

3. **Órdenes sin cerrar**: Si el flujo de pago no marca una orden como `completed`, reaparecerá como activa la próxima vez que se limpie el filtro. Vigilar que el cierre de orden siempre escriba `status='completed'`.

4. **delay-reply — `last_sender` bloqueado**: Si el EF termina antes del bloque de actualización final (línea ~724), `last_sender` queda en `"contact"` y el bot no vuelve a responder hasta que se resetee manualmente en DB (`UPDATE chat_conversations SET last_sender='agent' WHERE id='...'`). El try-catch de v52 previene este escenario en el bloque isResumen, pero si hay un nuevo error no capturado en otra parte del código, puede volver a ocurrir.
