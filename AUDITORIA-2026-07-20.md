# AUDITORÍA COMPLETA COBRA POS — 2026-07-20

> Diagnóstico de solo lectura, 4 auditores en paralelo sobre todo el código.
> Clasificación: ✅ FUNCIONA · 🟡 PARCIAL · 🎭 ADORNO (existe pero no hace nada) · 🔴 ROTO.
> Ningún cambio aplicado — pendiente de priorización con Sergio.

## 🚨 CRÍTICO DE SEGURIDAD

1. **Clave `service_role` de Supabase expuesta en el navegador**: `onboarding.js:10` y `admin-reg.js:5` arman la clave secreta con `.join()` (ofuscación trivial). Esa clave salta TODAS las políticas RLS → cualquiera que abra el código del navegador puede leer/escribir los datos de TODOS los restaurantes. Es el hallazgo más grave de toda la auditoría.
2. **Endpoint `?debug=1` del meta-webhook sin autenticación**: revela config, muestra productos y valida el token de WhatsApp (meta_webhook_deployed.ts:25-63).

## 💰 DINERO — bugs e incoherencias (Caja/Informes/Dashboard)

- **`pos_payments` (desglose real de pagos) IGNORADO por Caja, Informes y Dashboard**: todos suman por `pos_orders.payment_method`. Un pago mixto queda como 'multiple' → las barras por método no suman el total y **el arqueo de efectivo subvalúa** (no ve la porción en efectivo de un pago mixto). caja.js:173,215,602-606,1029 · informes.js:258-260 · dashboard.js:555,787.
- **Cierres de caja SIEMPRE "Cuadrado"**: `arqueo_diff` se lee en 5 sitios pero JAMÁS se escribe (caja.js:371 vs handleCloseSession:773-779). La diferencia del arqueo nunca se persiste.
- **"Guardar arqueo" solo guarda en memoria** (caja.js:691-695); `closing_cash` guarda el efectivo ESPERADO, no el contado (caja.js:653).
- **`total` vs `total_final`**: Caja/Historial/Dashboard usan `o.total`; Informes usa `total_final` y exige status='paid' con `closed_at` — las mismas ventas dan cifras DISTINTAS en cada pantalla.
- **`discount` vs `discount_amount`**: venta-rapida escribe `discount` (venta-rapida.js:882); pagos y pos-print usan `discount_amount` → los descuentos de venta rápida no salen en el recibo.
- **Dashboard**: sparklines de ventas HARDCODEADOS (dashboard.js:559-564); tarjeta "Transferencia·Nequi·Daviplata" siempre $0 (normPM nunca devuelve 'transfer', :516-527); "1.5 personas por pedido" inventado (:643); "Cierre anterior" lee `closing_amount` pero caja escribe `closing_cash` → siempre "—" (:105); botones de reimpresión son un toast falso con setTimeout (:1581-1589); "Última impresión" muestra la hora actual (:247-252).

## 🔴 ROTO (lógica con error que impide funcionar)

- **chat-ia.js — 4 botones muertos por el mismo bug** (`S.activeConv` no existe; el estado se llama `S.activeConvId`): **Confirmar pago** (:1207), **Sin nomenclatura** (:1139), **Confirmar domi** (:1154, :1180 — además usa `window._supabaseUrl` indefinido), y **badge "Pagos por confirmar"** (`window._branchId` indefinido, :1109). ⚠️ El botón "Confirmar pago" que probamos por API funciona en el backend; es el CLICK del panel el que está roto.
- **confirm_domi.ts roto de punta a punta**: consulta `chat_channels` con columnas/filtros equivocados (`type=` en vez de `channel=`, credenciales top-level en vez de `meta` JSON) → nunca obtiene credenciales (confirm_domi.ts:281-286). Además el motor NUNCA activa `domi_precio_pendiente`, así que el botón jamás aparece.
- **Domicilios (ambas pantallas): "En camino"/"Entregado" NO persisten** — solo cambian memoria; al recargar todo vuelve a "recibido" (ventas-salon.js:2017-2023 · domicilios.js:1591-1600). El fee de domicilio tampoco se guarda (total sin fee, domicilios.js:1448); courier/asignado tampoco.
- **venta-rapida crea órdenes DUPLICADAS**: el carrito no se limpia tras enviar (venta-rapida.js:829-861) y el nº de turno no incrementa al vender (solo al cancelar, :644).
- **pagos.js "Volver a mesas" → 404**: navega a `ventas-salon.html` que no existe (pagos.js:517).
- **Impresión automática de comanda sin PAGADO/COBRAR**: posAutoprint no pasa total/paid (pos-print.js:258) → la comanda auto-impresa de domicilios nunca muestra el recuadro de pago (la manual sí).
- **"Imprimir" en mesas**: depende de `current_order_id` que fetchTables nunca rellena (ventas-salon.js:2186 vs 454-477).

## 🎭 ADORNO (existe visualmente, no hace nada)

**Ventas/salón**: Entregados, Anular venta (sidebar), Reservar mesa, Dividir cuenta, +Agregar ítem, Reasignar mesero, Imprimir (rail domicilios). Código muerto: buscador de mesas, "Vista lista", monitor RAM (renderPageHead/renderSalonTabs nunca invocados).
**Tomar pedido**: Editar mesa (×2), Dividir cuentas, Unir mesas, Mover pedidos, Descuento, fila "Selecciona un cliente".
**Pagos (cobro)**: Vale de pago, Dejar a crédito, fila Cliente ("Módulos futuros", pagos.js:557-561). "Dividir cuentas" es solo informativo (no genera pagos por comensal).
**Venta rápida**: botón "Imprimir vale" sin handler (venta-rapida.html:354); panel de adiciones siempre dice "Sin adiciones para este producto" aunque los modificadores existen (:1103).
**Chat IA**: "Crear pedido" (toast "próximamente"), "Nueva conversación", "Buscar en el chat", "Datos del cliente" — sin handler.
**Flow editor**: nodo **Temporizador** — configurable pero el motor lo ignora por completo.
**Configuración**: sidebar "Métodos de pago" e "Impuestos y propina" → placeholder "disponible pronto". Badges "Pronto" ENGAÑOSOS en General, Impresoras y Usuarios/roles (¡esas tres SÍ funcionan!).
**Dashboard**: "Ver todos", "Ver inventario", "Exportar reporte" sin onclick; "Empresas: 0" y "Atención en mesa: Sin datos" hardcodeados; "Marcar revisado" de inventario no persiste.
**Impresoras**: detección/impresión física solo funciona en el ejecutable (Electron); en navegador los botones no hacen nada. Modelos de comanda 2-3 bloqueados "Pronto".
**Historial**: badge "Turno abierto" estático; búsqueda promete "por producto" pero no busca en ítems.

## 🧩 CONFIG ↔ MOTOR desincronizados (Asistente IA)

- **7 frases que se GUARDAN pero NADIE lee** (adorno funcional): `preguntar_tamano`, `datos_nequi`, `aviso_despacho`, `pedido_listo_recoger`, `sin_cambios`, `disculpa`, `saturacion` (configuracion.html:1700-1748).
- **~6 frases que el motor LEE pero la pantalla Mensajes NO permite editar** (quedan con default): `lugar_rechazado`, `preguntar_complemento_dir`, `preguntar_calle_numero`, `preguntar_barrio`, `preguntar_presentacion`, `preguntar_variable`.
- Paso `confirmar_dir` (confirmar dirección a cliente recurrente) solo existe en el flujo por-defecto; el canvas nunca lo genera → con canvas activo ese paso desapareció.
- Extractores: solo capturan el 1er grupo de variantes de un producto (productos con 2+ grupos pierden el resto); extractDireccion/extractNombre llaman extractPago con config null (solo legacy nequi/daviplata, no los métodos configurados).

## ⚠️ OTRAS INCOHERENCIAS

- **Nombres de mesero FALSOS**: `MESERO_NAMES {SA:'Sergio Andrés', JM:'Juan Manuel'...}` mapea por iniciales → cualquier mesero con esas iniciales muestra un nombre inventado (ventas-salon.js:185).
- Canales inconsistentes: `salon/domicilio/rapido` en unas pantallas, `delivery/counter/mostrador` en dashboard (metas por canal mal repartidas, dashboard.js:215-217).
- 10% mostrado como "Servicio" en salón y "Propina" en cobro, sobre la misma base; ambos hardcodeados.
- Estado de mesa `'ocupada'` (rama offline de tomar-pedido) no existe en ventas-salon → se ve "libre". "Guardar" marca la mesa `esperando` sin activar visible_cocina (salón dice "en cocina", cocina no lo ve).
- Dashboard saluda al PRIMER gerente de la tabla, no al usuario logueado (dashboard.js:46-62). Paneles de dashboard filtran por `window._branchId` nunca asignado → mezclan sucursales.
- mesero-login: todos los roles (mesero/cajera/admin/cocina) van a la misma pantalla.
- historial: mapa de métodos de pago en inglés (cash/card) vs BD en español; "El Parche Food" hardcodeado en su recibo (historial.js:356). "El Parche" también en domicilios.html:18 y fallback de ventas-salon.js:841.
- pos-sync: tras 5 reintentos DESCARTA la operación en silencio (posible venta perdida sin aviso).
- pos-events documenta eventos que no existen; core:ready emite {user} pero se documenta {role}.
- verify-transfer: si el canal WA no tiene credenciales, crea el pedido pero el cliente no recibe el aviso (no-op silencioso).

## 🗂️ HIGIENE DEL REPO

- **5 copias del webhook** en la raíz (deployed/current/patched/v31/v32) + EFs sueltos + 8 archivos deploy_*.json versionados a mano — sin carpeta supabase/functions, fuente de verdad confusa.
- **Motor de bot paralelo MUERTO dentro del webhook**: `tryAiReply`+`buildSystemPrompt` (meta_webhook:293-385,488-557) — un bot completo que nunca se llama, con UTC-5 hardcodeado, duplicando funciones del motor real.
- Código muerto en delay_reply: rama inalcanzable de getFlowPasos (1794-1795).

## ✅ LO QUE SÍ FUNCIONA (núcleo sólido)

Login/roles/multi-tenant real (NO hardcodeado a El Parche) · Catálogo completo (CRUD + IA de menú) · Inventario real (insumos/recetas/costeo + IA) · Reservas (CRUD + realtime) · Mesas y zonas · Usuarios y roles · Horarios + zona horaria + moneda · TODA la config del Asistente IA (canvas, variables, mensajes, pagos, domicilios) · Tomar pedido en mesa (con offline) · Venta rápida (núcleo) · Cobro con abonos y pagos múltiples · Caja (apertura/cierre/movimientos) · Historial con reimpresión · Motor del bot completo (flujo canvas, audios Whisper, pago mixto, verificación de comprobantes con Gmail/Vision/anti-replay, escudo de pagos) · Webhook WhatsApp · Impresión (en Electron) · Sincronización offline · Realtime.
