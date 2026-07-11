# ESTADO DEL SISTEMA — Cobra POS
> Última actualización: 2026-07-10

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
| `pos-sync.js` | Cola offline | anterior a Ronda 2 |
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

## Bugs conocidos / cosas a vigilar

1. **`configuracion.js` — auto-sync al abrir**: La función `syncToSupabase()` se llama en `DOMContentLoaded`. Si el localStorage tiene datos viejos cuando se abre Configuraciones, puede escribir basura a Supabase. No abrir Configuraciones con localStorage desactualizado.

2. **sort_order=0**: La mesa con `sort_order=0` (actualmente t01) requiere la comparación `!= null` en el sort, no `|| 9999`. Si se añaden mesas nuevas con sort_order=0, pueden quedar al final visualmente.

3. **Órdenes sin cerrar**: Si el flujo de pago no marca una orden como `completed`, reaparecerá como activa la próxima vez que se limpie el filtro. Vigilar que el cierre de orden siempre escriba `status='completed'`.
