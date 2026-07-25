# ESTADO DEL SISTEMA — Cobra POS
> Última actualización: 2026-07-21

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
| 15 | 2026-07-21 | **Unificación wizard Venta rápida (commit `401e10f`):** `venta-rapida.js` reescrito para igualar EXACTAMENTE el asistente de mesas/domicilios (clases `pm-*`). Pasos por índice (`VR_WIP.stepIdx`) con `vrSteps(p)` = un paso por CADA variable + Presentación + Personalizar (antes solo tenía step 1/2/3 fijo). Paso Personalizar ahora muestra **adiciones/modificadores** con stepper de cantidad (`data-mod-inc/dec`, `vrSyncModUI`, límite por grupo `max_total`/`multi`), buscador de adiciones, y respeta `mod_group_pres` (grupos por presentación) vía `vrModGroupApplies`. Imágenes de presentación con fallback a la del producto (`pr.image_url||p.photo_url`). Select añade `mod_group_ids,mod_group_pres`. Carrito muestra adiciones (`modSummary`) y nota bajo el nombre. CSS: añadidas clases `.pm-mod-qty-ctrl/.pm-mod-dec/.pm-mod-inc/.pm-mod-qty-num`. Cache-bust js/css `?v=1784736000`. **Antes en esta sesión:** imágenes por categoría y por presentación (bucket `chat-media`, fallback aspect-ratio 16/10), caché catálogo `pos.catalog.v1→v2`, métodos de pago unificados en `ia_config.pagos` (Config=editor, Asistente=solo lectura, checkout+caja leen configurados), historial de ventas por turno con filtros/orden/CSV/búsqueda por fecha con solape cruce-medianoche. |
| 16 | 2026-07-21 | **Fix imágenes de categoría en venta-rápida/domicilios (commit `add7af7`):** Mesas sí mostraba las imágenes (usa `<div class="tp-thumb" background:url()>`), pero venta-rápida y domicilios no. Cambiado el thumb de categoría a un elemento `<img style="object-fit:cover">` (misma técnica que las imágenes de presentación, que sí funcionan) en `renderCatGrid` (VR) y el render de categorías (domicilios). **Nota de datos:** las 6 categorías del tenant `0c78c799…` tienen `image_url` OK; hay 20 categorías basura con `tenant_id=NULL` (residuo de importar la carta varias veces), ocultas por RLS. **Fix venta-rápida no imprime (commit `3b62449`):** cobrar por "Opciones de pago" (`irAPagos`) no imprimía la comanda — la impresión solo estaba en "Enviar a cocina" (`enviarACocina`). Añadido `posAutoprint(orderId)` en `irAPagos` antes de ir a `pagos.html` (candado anti-duplicado ya existente). Además el insert de `pos_order_items` de VR ahora guarda `name/notes/selections/tenant_id/status` (antes se perdían adiciones y notas en la comanda). |
| 17 | 2026-07-21 | **Unificar venta-rápida/domicilios con mesa — toma de pedido (commit `15ddfc9`):** (1) VR tenía un atajo en `vrOpenProductModal` que agregaba directo los productos "simples" (sin presentación múltiple ni variables) sin abrir el modal → no se podían poner adiciones/notas. Eliminado: ahora abre SIEMPRE el modal, igual que `tpOpenProductModal` de mesa. (2) Nombre del ítem: mesa usa `[presLabel, p.name, varLabels]` (la presentación primero, ej. "Hamburguesa · HAWAIANA"); VR y domicilios usaban `[p.name, presLabel, ...]` → en la comanda salía solo "HAWAIANA" sin la palabra "Hamburguesa"/"Perro"/"Sandwich" (que es la **presentación** del producto, no la categoría). Corregido el orden en `vrMPAddToCart` y en el `tpMPAddToCart` de domicilios. (3) Badges de cantidad en tarjetas/menú/favoritos/búsqueda de VR ahora cuentan por `productId` (helper `prodQtyInCart`), porque los ítems del modal usan `lineId` y ya no coincidían por `id`. Regla general: **mesa es la referencia**; VR y domicilios deben replicar pasos, diseño, nombre e impresión. |
| 18 | 2026-07-21 | **Nombre de presentación opcional (commit `d2e078f`):** El precio SIGUE viviendo en la presentación (no se toca). Ahora el **nombre** de la presentación es opcional. (1) Editor `catalogo-productos.js`: `canSave`/`updateSaveProdBtn` ya no exigen `presentations.some(x.name.trim())` — solo exigen precio (`some(x=>x.price>0)` o variable con precio). Placeholder → "Nombre (opcional · ej. Familiar)". El precio base sigue derivándose de `min(presentations.price)` (independiente del nombre). (2) Comanda: en `tpMPAddToCart`/`vrMPAddToCart` de mesa/VR/domicilios, si la presentación no tiene nombre, `presLabel` cae al **nombre de la categoría** (`S.cats.find(...).name` en mesa/domi, `p.catName` en VR). Así, producto sin nombre de presentación imprime "CATEGORÍA · Producto" en vez de solo "Producto". El bot no se afecta: `meta_webhook` y `confirm_domi` ya hacían fallback a `item.price`/`matched.price` cuando no hay presentación con nombre. |
| 19 | 2026-07-21 | **Alias de comanda por categoría (commit `bbeb490`):** Nueva columna `pos_categories.comanda_alias` (text, nullable). Editor de categorías (`catalogo-productos.js`) tiene campo "Nombre en comanda" (singular, opcional) → `setCatAlias`, guardado en `saveCategoryToSupabase`. Prioridad del prefijo en comanda: (1) nombre de presentación, (2) `comanda_alias` de la categoría, (3) nombre de la categoría. Aplicado en `tpMPAddToCart` de mesa/domicilios (`cat.comanda_alias||cat.name`) y `vrMPAddToCart` (via `p.catAlias||p.catName`, mapeado en el fetch de productos). Selects de categoría de VR/domicilios ahora incluyen `comanda_alias` (mesa usa `select('*')`). Ej: categoría "PERROS CALIENTES" con alias "Perro" → comanda "Perro · HAWAIANO". **Bump caché catálogo v3→v4** (mesa/VR/domicilios) para recoger la columna nueva; **`_invalidateCatalogCache` corregido** para borrar v2/v3/v4 (antes solo borraba v2 y quedó obsoleto tras el bump a v3). |
| 20 | 2026-07-21 | **Recetas IA — editar ingredientes en "Confirma las medidas" (commit `090c7b5`):** En `inventario.js` paso 2 (`iaRenderPaso2`) del asistente de recetas: (1) el nombre del ingrediente ahora es un `<input>` editable (`iaSetIngrName` — al editar limpia `existingName` para re-emparejar al guardar), (2) botón de borrar por fila (`iaDeleteIngr` → splice + re-render), (3) botón "Agregar ingrediente" (`iaAddIngr` → push fila en blanco `{name:'',qty:1,unit:'g',isBase:false}` + focus). `iaNext` descarta filas en blanco (trim + filter) antes de continuar. `iaGuardarReceta` ya re-empareja por nombre (`insumos.find nombre.toLowerCase`) o crea insumo nuevo, así que agregar/borrar es seguro. CSS: grid `.ia-ingr-row` +columna, `.ia-ingr-name-input`, `.ia-ingr-del`, `.ia-add-ingr`. `inventario.css` no tenía cache-buster → agregado `?v=`. |
| 21 | 2026-07-21 | **Fix costeo mostraba datos viejos tras editar insumo (commit `851789b`):** Síntoma: detalle de "Recetas y costeo" mostraba salchicha en $15M y "90313% materia prima" aunque la BD tenía el dato correcto ($630 = 75g × $8.4/g) y la LISTA de la izquierda ya mostraba 13.7% correcto. Causa: `guardarInsumo` (y reponer/compra) actualizaba `insumos` en memoria y hacía `renderInsumos()` pero NO refrescaba el detalle de costeo ya renderizado (snapshot viejo). Fix: nueva `refrescarCosteo()` (re-render lista + detalle de la receta abierta, trackeada en `_recetaAbierta`), llamada desde `guardarInsumo`, `guardarReposicion`(reponer), `aplicarCompra`, y al entrar a la pestaña `recetas` (`showScreen`). `costoPorUr = precio/conversion` (línea 57) siempre fue correcto. No hubo corrupción de datos. |
| 22 | 2026-07-21 | **Editor de bases + editor manual de recetas en Inventario (commit `c7660a2`):** (1) **Bases:** nueva pantalla "Bases de recetas" (sidebar Configuración, `screen-bases`) — CRUD completo de `pos_bases` (name, ingredients[], product_ids[]): lista, editar/crear/eliminar, chips de ingredientes (agregar/quitar), checklist de productos con buscador. `loadBasesDB()` en boot, `bases[]` global, RLS de pos_bases OK (5 políticas). Verificado: 36 productos de comida→1 base, 6 sin base = todas bebidas (vínculo correcto). (2) **Recetas:** `abrirEditorInsumoReceta` (antes stub "Próximamente") ahora abre editor manual real (`panel-receta-edit`): edita cantidades, borra insumos, agrega insumos existentes (select), guarda reescribiendo `iv_recetas`, + botón "Volver a generar con IA" (`recEditRegenerarIA`→`generarRecetaIA`). Botón "Editar receta" en el detalle de costeo (`abrirRecetaDetalle`). Añadido helper `escHtml` a inventario.js (no existía). Unidad de línea = `useUnit` del insumo (iv_recetas no guarda unidad). |
| 23 | 2026-07-21 | **Impresión intermitente → confiable (commit `426b71d`):** Síntoma: pedidos desde tablet a veces imprimían, a veces no. Causas: (1) lag escritura→lectura: `posAutoprint` leía el pedido recién creado y los ítems aún no eran visibles → 0 ítems → no imprimía y no reintentaba; (2) carrera con navegación: los 3 llamadores hacían `race(posAutoprint, 4000ms)` y navegaban; en tablet con WiFi lento las 2 lecturas superaban 4s → cortaba la impresión; (3) fallos transitorios de red sin reintento. Fix en `pos-print.js`: `posAutoprint` ahora reintenta — impresora 3×, **fetch de pedido+ítems hasta 9 intentos/~4s hasta que aparezcan los ítems**, e impresión 2×. Timeout de navegación **4s→9s** en `tomar-pedido.js`/`domicilios.js`/`venta-rapida.js` (el race igual retorna rápido en el caso normal ~400ms; solo espera más si hay lag). Cache-bust pos-print.js v11→v12. |
| 24 | 2026-07-21 | **Abono persistente — red de seguridad (commit pendiente) + mejora pendiente de impresión.** ABONO: `guardarAbono` guarda en `pos_payments` + `pos_orders.paid_amount`; `loadOrder` ya cargaba los pagos previos por `order_id` (verificado: dato persiste en BD, RLS ok `current_tenant_id()=tenant_id`, mesa mantiene `current_order_id`, tomar-pedido carga el pedido in_progress correcto). Se añadió **red de seguridad** en `loadOrder`: si `order.paid_amount > suma(pagos leídos)`, se agrega un abono sintético por la diferencia → la cuenta NUNCA olvida lo abonado aunque falle la lectura del detalle. Cache-bust pagos.js. **MEJORA PENDIENTE DE IMPRESIÓN (si vuelve a fallar):** hoy `posAutoprint` re-lee el pedido de la BD (con reintentos, entry 23). El siguiente nivel de robustez es **pasar los ítems del carrito directamente a la impresión** desde el llamador (mesas/VR/domicilios ya los tienen en memoria) para eliminar por completo el round-trip y el lag de lectura. No implementado aún; hacerlo si persiste alguna comanda perdida. |
| 25 | 2026-07-21 | **Receptor GLOBAL de impresión (commit `58a14e6`) — causa raíz de la intermitencia tablet:** la impresora (CAJA.2, USB) está en el PC; la tablet (APK) no imprime, el PC imprime por ella vía realtime… pero ese listener SOLO existía en `ventas.html`/`index.html` (pos-realtime.js). Si la caja estaba en dashboard/caja/etc., la comanda no salía; y "Reimprimir" desde la tablet intentaba imprimir localmente (imposible). **Arquitectura nueva:** (1) `pos-print-listener.js` cargado en las 13 pantallas con pos-core — en Electron escucha INSERT/UPDATE de pos_orders y llama `posAutoprint` esté donde esté la caja; (2) columnas `pos_orders.printed_at` (marca de impreso; backfill 232 filas) y `reprint_at` (señal de reimpresión); (3) "Reimprimir comanda" sin electronPOS ahora manda `reprint_at=now()` → el PC la recibe por realtime y fuerza reimpresión (`posAutoprint(id,{force:true})`, dedupe por valor de reprint_at); (4) barrido de seguridad cada 45 s (`printed_at IS NULL`, ventana 10 min, excluye cancelled/abandoned) por si el websocket pierde un evento; (5) dedupe persistente en localStorage `pos.printed.v1` (sobrevive navegación) + sanado de `printed_at` en BD si quedó pendiente; (6) auto-print removido de pos-realtime.js (v2) para una sola ruta. pos-print v13. |
| 26 | 2026-07-21 | **Fix empaque no aplicaba desde la tablet (commit `2f4e748`):** la config de Operación (`pos.config.operacion.v1`, incluye empaque) vivía SOLO en localStorage del dispositivo donde se guardó → la tablet calculaba empaque $0. Nueva columna `branches.operacion_config` (jsonb) como fuente de verdad: `pos-core.js` (v21, en todas las páginas) al arrancar BAJA la config de BD → localStorage; si la BD está vacía y el equipo tiene config local (el PC), la SUBE una vez (siembra automática). `opSave` en configuracion.js ahora también sube `operacion_config` al guardar. Los `calcEmpaque` de venta-rapida/domicilios/pagos/tomar-pedido siguen leyendo localStorage (ahora caché sincronizada) — sin cambios en ellos. **PENDIENTE (propuesta hecha a Sergio):** empaque por producto/categoría en cascada — producto (`packaging_fee` propio) → categoría → valor general de Operación; nota: el alcance todos/algunos/excepto que ya existe en la UI de Operación NO está conectado a los cálculos. |
| 27 | 2026-07-21 | **Empaques específicos por categoría/producto (commit `89c142b`, aprobado con mockup):** Motor central `window.posEmpaqueCalc(items,{domicilio})` en pos-core.js (v22) — items `{productId,catId,qty,unitPrice}`. Modo `unificado` = lógica clásica (fijo/%, unidad/pedido, canal); modo `especifico` = tarifa fija por unidad en cascada: `empaqueProdCfg[prodId]` ('none'/'general'/packId) → `empaqueCatCfg[catId]` ({on,packId}) → `empaqueMonto` general. Config en `pos.config.operacion.v1` (+ sync BD entry 26): `empaqueModo`, `empaquePacks[{id,nombre,monto}]`, `empaqueCatCfg`, `empaqueProdCfg`. UI en Configuración→Operación: segmented Unificado/Específico (en específico se ocultan tipo/base/canal), lista de categorías con toggle + select de tarifa, expandible a productos con select (Hereda/General/packs/Sin empaque), chips de empaques personalizados (crear vía prompt, eliminar con limpieza de referencias). `_opDraft` ahora clon PROFUNDO (JSON) — el shallow rompía dirty/descartar con objetos anidados. 4 pantallas delegan con fallback: venta-rapida `calcEmpaque`, domicilios `computeEmpaque`, tomar-pedido (ítems para llevar), pagos `computeEmpaquePagos` (SP.items ahora lleva productId/catId). Alcance viejo todos/algunos/excepto ELIMINADO de la UI (estaba desconectado; campos legacy quedan en defaults). |
| 28 | 2026-07-21 | **Empaque por PRESENTACIÓN (commit `9326674`):** nivel más específico en la cascada, ahora `presentación → producto → categoría → general`. Config: `empaquePresCfg` = `{'prodId::presId': 'none'|'general'|packId}` (ausente = hereda producto). Motor `posEmpaqueCalc` (pos-core v23) resuelve items con `presId`. UI Operación: producto con ≥2 presentaciones con nombre gana chevron (`_empOpenProd`, `data-emp-open-prod`) que despliega sus presentaciones, cada una con select propio (`data-emp-pres`); "Hereda" muestra la tarifa efectiva del producto. Packs: conteo de usos y limpieza al eliminar incluyen presCfg. Callers pasan `presId`: VR guarda `presId` en el ítem del carrito (`vrMPAddToCart`, null si `_base`), domicilios usa `i.pres.id`, mesa `TP_WIP.pres.id`. **Limitación conocida:** pagos.js (fallback solo para pedidos del bot sin packaging_fee) no tiene presId (selections.pres guarda el NOMBRE) → aplica nivel producto. Caso de Sergio: Maicitos → desplegar → Personal = "Empaque pequeño $500", Familiar hereda $1.000. |
| 29 | 2026-07-21 | **Fix empaques no guardaba + "Crear empaque" muerto (commit `1fa5565`):** (1) `window.prompt()` NO existe en Electron (lo bloquea sin UI) → "Crear empaque" no hacía nada. Reemplazado por formulario inline (`_empPackForm`, inputs nombre/monto + Agregar/Cancelar) en la fila de packs. REGLA: nunca usar prompt/alert-dependientes de diálogo nativo para flujos críticos en el .exe (inventario.js aún tiene un `prompt` para nueva categoría de insumo — pendiente). (2) Los cambios se perdían al volver: si el sync a BD fallaba/no corría, el boot de pos-core bajaba la config VIEJA de BD y pisaba localStorage. Fix: `opSave` estampa `data._ts` y reintenta el update a branches 3×; pos-core (v24) compara `_ts` y **gana la más nueva** — si la local es más reciente, la SUBE (auto-sanado). (3) `opRenderEmpEsp` envuelto en try/catch dentro de opRender — un error del panel jamás vuelve a dejar muerto el botón Guardar (opCheckDirty va al final de opRender). (4) Commit `f0c57b5`: el botón "Agregar" del formulario inline tampoco respondía — faltaban `#op-emp-pack-ok`/`#op-emp-pack-cancel` en el selector del `closest()` de la delegación de clics. (5) Commit `9ae91cb` — el revert persistía: la BD NUNCA recibió un guardado de Sergio (sin `_ts`, sin empaqueModo) y su copia VIEJA (sembrada del localStorage pre-empaques) era la que pisaba todo al navegar (posible pos-core viejo en caché de otras páginas). Fix: `operacion_config` de la BD puesto en NULL vía SQL (elimina la fuente del revert — con BD vacía, hasta un pos-core viejo solo SUBE, nunca pisa); `opSave` verifica el write-back de localStorage y los fallos del sync a nube ahora muestran TOAST (nunca silenciosos) — si vuelve a fallar, el toast dirá exactamente dónde. |
| 30 | 2026-07-21 | **Fix "Nueva categoría" de insumo rota en Electron (inventario.js):** `guardarInsumo()` usaba `prompt('Nombre de la nueva categoría:')` al elegir "＋ Nueva categoría…" en el select — en Electron prompt() no muestra nada y devuelve null, así que crear categoría era imposible en el .exe (era el pendiente anotado en Ronda 29). Fix con el mismo patrón inline de `_empPackForm`: nuevo input `#ins-cat-new` en inventario.html (oculto, debajo del select de categoría), `onCatSelChange()` lo muestra y enfoca al elegir `__new__`, y `guardarInsumo` lee el nombre de ese input (alert si está vacío). El input se limpia/oculta al abrir el panel de insumo. Cache-buster de inventario.js subido en inventario.html. **Pendiente:** inventario.js aún tiene 3 prompt() más (abrirNuevaCat del chip de filtros ~763, editarUnidad ~1164, nueva unidad ~1196) — mismos candidatos a romperse en Electron. **RESUELTO en Ronda 31.** |
| 31 | 2026-07-21 | **Inventario libre de prompt() (commit `473aad7`):** eliminados los 3 prompt() restantes de inventario.js, mismo patrón inline de `_empPackForm`/Ronda 30. (1) Chip "+ Categoría" de los filtros: flag `_nuevaCatForm` — `buildFiltersChips` reemplaza el chip por input `#iv-newcat-inp` + Crear/Cancelar (`confirmarNuevaCat`/`cancelarNuevaCat`); al confirmar muestra el mismo toast de siempre. (2) Editar unidad: flag `_unitEditing` — `renderUnidades` pinta la fila en edición con input `#iv-unit-edit-inp` + Guardar/Cancelar (`guardarEditUnidad`/`cancelarEditUnidad`, valida duplicados). (3) Nueva unidad: flag `_unitNewForm` — el botón agrega una fila-formulario `#iv-unit-new-inp` al final de la tarjeta de unidades (`crearNuevaUnidad`/`cancelarNuevaUnidad`, funciona también con la lista vacía). Los 3 formularios soportan Enter=confirmar y Escape=cancelar. `node --check` OK, cache-buster de inventario.js → v=1784952001, despliegue verificado con curl. inventario.js queda SIN ningún prompt(). |
| 30 | 2026-07-21 | **Tickets térmicos de caja: PALOTEO + CIERRE Z (commit `1fcdae7`):** nuevo `pos-cierre-print.js` con `posBuildPaloteo(denoms, info)` y `posBuildCierre(c)` (HTML 80mm, mismo estilo que las comandas); `pos-print.js` expone `window.posPrintTicket(html, docType)` (usa `_hasPrinter` + `_printHtml`, docType 'recibo' → impresora de caja). **Bug encontrado:** el botón "Imprimir paloteo" existía pero ejecutaba `window.print()` → intentaba imprimir la PANTALLA completa, nunca la planilla; ahora llama `imprimirPaloteo()`. Nueva columna `pos_sessions.arqueo_denoms` (jsonb) — antes solo se persistía `arqueo_contado` y la separación billetes/sencillo/monedas se perdía. `getArqueoDenoms()` captura el conteo por denominación y clasifica **grandes = billetes ≥$50.000** vs **sencillo = resto de billetes** (criterio de El Parche: los grandes se consignan, el sencillo queda de base). `buildCierreData()` consolida base/ventas/métodos/ingresos/egresos/esperado (cachea nombre del negocio desde branches→brands). Auto-imprime al cerrar caja (antes de `refreshAll`, que limpia S.session) y botón "Reimprimir cierre" por turno en el historial (`reimprimirCierre` recalcula con la ventana opened_at→closed_at de esa sesión). Formato = tabla de Sergio depurada, SIN filas DOMIS/VENTAS OFICIALES (eran cicatriz de la plataforma anterior que revolvía domicilios). **Commit `16425b5`:** ambos tickets salían cortados a la derecha (montos) — se habían hecho a `80mm` como las comandas, pero el área imprimible real es menor; corregidos a **72mm** (mismo ancho del recibo de domicilio ya validado, pos-print.js línea ~177). Además: labels con `text-overflow:ellipsis` + `min-width:0` (truncan en vez de empujar), montos `white-space:nowrap;flex-shrink:0`, `overflow-x:hidden` en body y tabla del paloteo con `table-layout:fixed` + `<colgroup>` 40/22/38. **REGLA: todo ticket térmico nuevo se hace a 72mm, no 80mm.** **Commit `dd6823c` — versión COMPACTA aprobada (33 → 21 líneas):** tipografía −1.5pt (body 10.5px, totales 12px, CUADRE 13px, mut 9.5px); encabezado de 5 a 2 líneas (código de caja en el título, `apertura → cierre` en una línea con `fechaCorta()` 24h sin año, `cajero · turno` en otra); `VENTAS` (sin "SISTEMA") con `Pedidos del turno (n)` INLINE a su derecha en `.mut` (letra delgada = más tenue en térmica) aprovechando el espacio antes del monto; eliminados la descripción del efectivo esperado y los títulos "FORMAS DE PAGO"/"ARQUEO (CONTADO)" (los separadores ya delimitan); `(No efectivo)` solo se imprime con **2+ métodos digitales** (con uno repetía el mismo número); firma compacta. Mismo tamaño aplicado al paloteo. |
| 31 | 2026-07-22 | **Fix métodos de pago hardcodeados en Caja (commit `07a08f4`):** el modal "Cerrar caja" listaba Efectivo/Tarjeta/Transferencia/Nequi/Daviplata escritos a mano (`kvs` con `pagos['nequi']` etc.), mostrando métodos inexistentes en $0. La Fase 2/3 de unificación había hecho dinámico `renderDesglosePago` pero NO el modal de cierre ni la UI del historial. Ahora el modal arma sus filas desde `S.payMethods` (= `loadPayMethodsConfig()` → `ia_config.pagos`, misma fuente que el bot y el checkout) + fila **"Otros"** para cobros históricos con métodos ya no configurados. Eliminada la `const METODOS` muerta (quedaba como trampa para repetir el bug). Nueva `renderMetodosDinamicos()` (llamada tras cargar `S.payMethods` en `refreshAll`) que rellena también el `<select id="hf-pago">` del filtro de historial y los botones `.mov-medio-btn` de ingresos/egresos, que estaban fijos en caja.html. **REGLA: ninguna pantalla debe declarar métodos de pago; siempre desde `ia_config.pagos`.** |
| 32 | 2026-07-22 | **Pedidos atados al turno + bloqueo de cierre con pedidos vivos (commit `4bb8a2f`):** se podía cerrar la caja con un pedido abierto → quedaba huérfano, fuera de todo cuadre. (1) Nueva columna `pos_orders.session_id` (uuid + índice) — antes NO existía vínculo pedido↔turno; backfill por rango `opened_at..closed_at` del branch (165 con turno, 36 sin turno = anteriores a las sesiones). (2) `window.posSessionId()` en pos-core (v25, caché 30 s) devuelve el id de la sesión `open` del branch; mesa (`orderData`), venta rápida y domicilios lo guardan al INSERT. (3) `caja.js`: `getPedidosAbiertos()` + aviso rojo `#orders-warn` que lista los pedidos sin terminar y **deshabilita "Cerrar caja"** (junto con el bloqueo ya existente por turnos de mesero abiertos). **Criterio verificado contra la BD:** `completed` y `paid` son TERMINADOS (los 'completed' ya están cobrados) — bloquear por ellos habría impedido cerrar siempre. Bloquean solo `open/in_progress/pendiente_pago/esperando/comiendo`, o entregados con `paid_amount < total_final` (usa total_final para no bloquear por descuentos). |
| 33 | 2026-07-22 | **Etiquetas de venta rápida (commit `c350272`):** marcas configurables por restaurante (Espera / Avisar / Programado / …) que se imprimen en la comanda para decirle al equipo qué hacer con el pedido para llevar. (1) **Crear**: Configuración › Operación, nueva "Sección 4b" (`etiquetasVRActivo`, `etiquetasVR:[{id,nombre}]` dentro de `operacion_config` → se sincroniza sola a la tablet). Mismo patrón inline que los empaques (`_etqForm`, `opRenderEtiquetas`, delegación de clics con `#op-etq-new/ok/cancel` y `[data-etq-del]`) — **nunca `prompt()`, Electron lo bloquea**. (2) **Elegir**: chips bajo la fila de cliente en venta rápida (`#vr-etq-row`), una sola por pedido, tocar de nuevo la quita; `S.etiqueta` persiste en localStorage por si se recarga, y **se limpia en `finalizarVenta`** para no marcar mal el siguiente pedido. (3) **Imprimir**: viaja en `notes` como `[etq:X]` (mismo patrón que `[barrio:X]`, sin columna nueva); `pos-print.js` la extrae en `_etq`, la muestra bajo el título y la **quita del texto del recibo** (`dirCli`). Título del canal rápido: `PARA LLEVAR` 20px → **`VENTA RAPIDA` 16px** con la etiqueta debajo en 14px (Sergio pidió la etiqueta pequeña). Si no hay etiqueta, esa línea no se imprime. **Commit `7216b40`:** la comanda de venta rápida imprimía el **barrio** en 24px (venía del cliente seleccionado) — solo aplica a domicilios, donde lo necesita el repartidor. El encabezado se separó en tres ramas explícitas (`isRapido` / `isDomicilio` / mesa) en vez del `_barrio ? … : …` compartido; venta rápida ya no lee `_barrio` y el nombre del cliente bajó al bloque de datos como `CLIENTE - X` alineado a la izquierda junto a `AREA`/`FECHA`. Domicilio y mesa quedaron idénticos (verificado generando las 3 comandas). |
| 34 | 2026-07-22 | **Unificar diseño con mesa: imágenes de categoría + icono de enviar (commit `5b7740d`):** (1) Las tarjetas de categoría se veían distintas en cada pantalla. La CSS era la misma (`.lm-cat .tp-thumb{margin:7px 7px 0;border-radius:9px}`) — la diferencia estaba en los **estilos en línea**: mesa los pisa con `height:90px;width:100%;margin:0;border-radius:0` (imagen a sangre), mientras VR usaba `height:80px;margin:7px 7px 0` y domicilios `height:108px`. Se copiaron los overrides de mesa a `renderCatGrid` de venta-rápida y domicilios; VR además muestra `tp-thumb-label` con el nombre si no hay imagen (como mesa). **Mesa es la referencia visual de las 3 pantallas.** (2) Icono de "Enviar a cocina": mesa tenía un **avión de papel** y venta rápida un **teléfono**; ambos reemplazados por la **llama** de domicilios (mismo path SVG, 14px, stroke-linecap/linejoin round). Verificado: 1 solo botón por pantalla y 0 iconos viejos restantes. |
| 35 | 2026-07-22 | **Tablet: espacio en el resumen del pedido + acciones por ítem (commit `1707158`):** en tablet solo cabía 1 ítem. (1) **Topbar oculto** (`display:none`) conservando dentro los nodos que el JS actualiza (`tp-waiter-name`, `tp-user-*`, `tp-crumb-mesa`, `tp-open-pill-text`) para no romper referencias; volver al salón sigue en la barra lateral. (2) **Encabezado compacto**: se eliminó la fila `tp-meta-row`; el estado y la hora (`tp-hora-apertura`) van dentro del pill, y el stepper de personas pasó al lado derecho del encabezado con etiqueta "pax". (3) **Interruptor de Servicio eliminado** de la comanda — la propina la decide el cajero (pagos.html ya tiene "Propina sugerida 10%"). **Importante:** `serviceEnabled` pasó de `true` a `false` por defecto; si no, al quitar el interruptor el mesero vería un total inflado 10% sin poder apagarlo. Sigue viajando a pagos por `&servicio=1`. (4) **Subtotal y Servicio solo se muestran si aportan** (`row-subtotal`/`row-servicio` con `hidden`): sin propina repetían el Total. (5) **Iconos por ítem**: borrar (`data-cart-del`) y **editar** (`data-cart-edit` → `tpEditCartLine`) que reabre el modal de personalización en el paso "Personalizar" con presentación/variables/adiciones/nota/cantidad restauradas. Para lograrlo cada línea guarda `wip:{presId,vars,mods}` y `TP_WIP.editIdx` hace que `tpMPAddToCart` **reemplace** la línea (conservando `lineId` e `id`) en vez de agregar otra; `tpOpenProductModal` fija `editIdx:null` para productos nuevos. CSS `.tp-line-acts`/`.tp-line-act`. Resultado: de 1 a ~5 ítems visibles. |
| 36 | 2026-07-22 | **Encabezado de mesa alineado + pago por rol (commit `165d632`):** el estado y la hora se amontonaban en 2 líneas y no alineaban con el stepper. Fix: el **número de mesa va DENTRO del cuadro** (`.tp-mesa-glyph` 46px/radius 13, se quitó el icono de mesa; `.tp-mesa-num` 19px), el pill de estado+hora en una sola línea (`white-space:nowrap`, `.tp-open-time`) y `.tp-pax` alineado a la derecha. `paintTableInfo` reduce el tamaño de la fuente si el nombre de mesa es largo ("Terraza 3"), para que no se desborde del cuadro. Botón editar del encabezado **eliminado**: `data-action="edit"` NO tiene case en el switch (líneas 1287-1297) → nunca hizo nada. **OJO: "Editar mesa" del sidebar tiene el mismo `data-action="edit"` y también está muerto** (igual que `split`/`merge`/`move`/`discount`, varios además con `disabled`). **"Opciones de pago" ELIMINADO** de la barra de mesa (commit `02c50fa`), junto con su `case 'pago'` huérfano. **CORRECCIÓN DE UN ANÁLISIS ERRÓNEO:** primero se ocultó por rol creyendo que era la única vía de cobro — ese diagnóstico salió de un `grep "pagos.html" *.js` que **NO cubrió la subcarpeta `modules/`**. El cobro real vive en `modules/ventas-salon.js` (8 referencias a pagos.html): botón **"Cobrar y enviar a cocina"** (case `cobrar`, con cobro adelantado) y **"Cobrar"** (case `collect`), ambos desde el panel de mesa de ventas.html, más el de domicilios. El botón dentro de la mesa era un atajo duplicado. **REGLA: al rastrear dependencias usar `grep -r` incluyendo `modules/`, no `*.js` de la raíz.** **PENDIENTE (pedido por Sergio):** modo sin conexión — que la tablet siga operando sin internet y los pedidos queden en cola y se sincronicen al PC al volver la señal (hoy `ERR_NAME_NOT_RESOLVED` deja la app inservible; existe `pos-sync.js` con `writeOrderBatch` como base). |
| 37 | 2026-07-22 | **Barra lateral deslizable en tablet (commit `dbc1096`):** la flecha circular (`.tp-side-toggle`) se reemplazó por un **asa** (`.tp-side-grip`, id sigue siendo `tp-side-toggle` porque el JS lo usa): barra vertical de 5×46px centrada en el borde derecho + pista `» desliza` que invierte a `« desliza` al abrir. **Gestos** (`setupSideGesture`, pointer events → sirve para dedo y ratón): abrir = arrastrar el asa a la derecha o **tocarla**; cerrar = arrastrar a la izquierda (sobre el asa o sobre la barra abierta), tocar el asa, o **tocar fuera** (backdrop). Umbral 40px; si no hubo movimiento (`movio=false`) se interpreta como toque. El asa acompaña al dedo hasta 34px vía `transform` inline (no se anima el ancho: la barra pasa de `relative` 58px a `fixed` 224px al abrir y animarlo causaría saltos de layout). `touch-action:none` en el asa para que el gesto no lo robe el scroll. **OJO:** la regla `.tp-side-toggle{display:none}` de escritorio ya no aplica al cambiar de clase — se añadió `.tp-side-grip{display:none}` fuera del `@media(max-width:1100px)` para que el asa NO salga en el PC. |
| 38 | 2026-07-22 | **Limpieza de barras laterales (commit `d771eb9`):** quitados `data-nav="monitor"` y `data-action="nuevo"` de `domicilios.html` (Monitor era una pantalla obsoleta y su unico acceso; el handler de `nuevo` queda huerfano sin boton) y el bloque `data-action="anular"` de `modules/ventas-salon.js` (~978), que era **boton muerto**: no existia ningun `case 'anular'` en el switch de acciones. Verificado antes de borrar que la ruta viva de cancelacion es `cancelar-pedido-mesa` (menu de 3 puntos de la mesa), intacta. |
| 39 | 2026-07-22 | **Identidad de marca oficial (commit `fd602d6`):** nuevo `pos-brand.js` cargado en las 20 paginas con `pos-core`; normaliza el bloque de marca sea cual sea su prefijo de clases (`brand-`, `cj-`, `cf-`, `iv-`, `d-`, `tp-`, `cp-`, `ci-`, `vs-`): linea 1 siempre "Cobra POS", linea 2 siempre el restaurante del tenant (de `branches`/`brands`, cacheado en `pos.brand.restaurante`), y el recuadro con `assets/brand/cobra-logo.png` (app icon indigo del paquete de marca oficial). **Dos trampas resueltas:** (a) `closest('[class*="brand"]')` se incluye a si mismo y la clase del recuadro ya contiene "brand" (`cj-brand-logo`) → hay que subir a `parentElement` primero; (b) en dashboard `brand-mark` es el CONTENEDOR, no el recuadro → se descarta si tiene `brand-name`/`brand-logo` dentro. MutationObserver para el sidebar que `modules/ventas-salon.js` dibuja por JS. Eliminados los setters que competian en dashboard.js / inventario.js / historial.js / impresoras.js. Favicons oficiales (`favicon.ico` multi-tamano + 32/192 + apple-touch) en 25 paginas; antes no habia ninguno. Topbar del dashboard: fuera el buscador falso y el icono de ayuda; la campanita queda con `id="btn-notif"` para el drawer de notificaciones futuro. **Bug de fondo corregido:** `loadUser` mostraba el PRIMER gerente/cajera de la sucursal, no al usuario autenticado, y el rol estaba forzado a Gerente/Cajera; ahora resuelve por `auth_user_id` → `email` → `user_metadata` y capitaliza cualquier rol. |
| 40 | 2026-07-22 | **Filtro por categoria en Inventario (commits `e063dd1`, `e7b298b`):** chips de categoria en Productos (`#prod-filters`) y en Recetas y costeo (`#rec-filters`, que ademas gana buscador); en Recetas solo se ofrecen categorias que TIENEN receta. Color del chip traido de `pos_categories.color`. **Bug de fondo corregido:** el buscador ocultaba tarjetas via `style.display` en el DOM, asi que cualquier re-render (p.ej. `refrescarCosteo`) perdia el filtro — por eso se veia "salchi" escrito con todos los productos a la vista. Ahora el filtro es estado (`prodFiltroCat`/`prodFiltroQ`) aplicado al construir la lista. **REGLA:** nunca meter datos en un `onclick="f(...)"` con `JSON.stringify` — las comillas dobles cierran el atributo y el boton queda muerto (fue exactamente el fallo de `e7b298b`); usar `data-*` + delegacion. Y al verificar, hacer `.click()` real sobre el control renderizado: llamar la funcion desde consola salta justo la parte rota. |
| 41 | 2026-07-22 | **Recetas por presentacion y por variable + porciones (commits `82628e0`, `824ed94`):** rediseno del modelo de recetas. **Problema:** `iv_recetas` se llaveaba solo por `product_id`, asi que (a) una Premium sumaba carne+pollo+mixta en un solo plato inflando la materia prima ~2x, y (b) no distinguia que una Personal lleva 500 g de papa y una Familiar 1200 g. **Modelo nuevo:** tabla `iv_porciones` (insumo_id, nombre, cantidad — medidas con nombre reutilizables, la unidad se hereda del insumo) + `iv_recetas.variant_option_id` (null = Base, aplica a todas) y `iv_recetas.cantidades` jsonb `{presId: {q, p}}` donde `p` es la porcion referenciada (pseudo-id `'_'` para productos sin presentaciones). **UI:** editor con pestanas de variable (salen solas de `pos_products.variables[].isPricing`) y una columna por presentacion; cada celda es un desplegable con las porciones DE ESE insumo + "Escribir cantidad…" + "Crear porcion nueva…"; costeo de las N combinaciones dentro del panel. Porciones se crean/editan en la ficha del insumo. Tarjeta de Productos muestra rango de materia prima con semaforo del PEOR caso. `isPausado(prod, varOptId)` ahora es por variable: si se acaba la salchicha ya no se cae la Premium entera, solo la de Carne. Descartada una propuesta previa de "factor por presentacion" (x2) porque 500→1200 no escala lineal. **Migracion sin perdida:** las 45 lineas existentes copiaron su `cantidad` a todos los tamanos. |
| 42 | 2026-07-22 | **Fix dos trampas de la migracion de recetas (commit `824ed94` + SQL):** (1) `iv_porciones` creada por API en vez del panel de Supabase **no recibe los GRANT por defecto** → el rol `authenticated` no tenia INSERT/SELECT y Postgres rechazaba antes de evaluar la RLS ("Error al crear la porcion"). Fix: `grant select,insert,update,delete on iv_porciones to anon, authenticated, service_role`. **REGLA: al crear una tabla via API, siempre otorgar los grants ademas de la politica RLS.** (2) La restriccion vieja `UNIQUE (product_id, insumo_id, branch_id)` impedia que un insumo estuviera en dos variables del mismo producto (carne en Mixta y en Carne). Reemplazada por indice unico sobre `(product_id, insumo_id, branch_id, coalesce(variant_option_id,''))` — el `coalesce` es obligatorio porque en Postgres los NULL no chocan y la pestana Base guarda `variant_option_id = null`. Verificado: mismo insumo en dos variables PERMITIDO, dos veces en la misma variable BLOQUEADO. (3) Los toast de porciones y de guardar receta ahora muestran `error.message` real en vez de un texto generico — el mensaje generico no permitio diagnosticar (1) sin ir a la base a reproducirlo. |
| 43 | 2026-07-22 | **Pendiente de recetas:** el asistente de IA sigue generando UNA cantidad por insumo y la replica en todos los tamanos (`_iaCantidades`); deja la receta armada pero hay que ajustar a mano la columna de la presentacion grande. Si se quiere, el paso 2 del asistente deberia pedir cantidad por tamano. |
| 44 | 2026-07-22 | **Cobro adelantado vinculado + PIN para no-admin (commit `21e0e33`):** el interruptor existe en Ventas (`modules/ventas-salon.js`) y en Configuracion → Operacion (`configuracion.js`); quedaban en desacuerdo. **Fuente de verdad unica: columna `branches.cobro_adelantado`.** (1) Ventas relee esa columna al volver al foco (`window.focus` + `visibilitychange`, `hookCobroRefresh`) y repinta el boton (`pintarToggleCobro`) — si en OTRO equipo se cambio en Config, Ventas se sincroniza sin recargar. (2) Configuracion, al abrir Operacion, impone la columna sobre su copia del blob `operacion_config.cobroAdelantado` (que Ventas no toca): `opSyncCobroDesdeBranch()` corre tras `opInit` (render inmediato desde local + correccion async del toggle, sin flash). (3) **PIN:** antes Ventas NEGABA el cambio a la cajera con un `alert` ("flujo de PIN deferred" que quedo a medias); ahora `toggleCobro` → admin/gerente cambia directo (`aplicarCobro`), cualquier otro rol pasa por `_posVSPromptPin` (modal reutilizable nuevo, valida contra `pos_users.pin` con `is_authorized_admin`). Verificado en navegador con stub: PIN correcto ejecuta onOk y cierra; incorrecto/vacio no ejecuta y muestra error; sin PIN configurado avisa ir a Configuracion. |
| 45 | 2026-07-22 | **Instancia unica del ejecutable (Electron `main.js`, NO en este repo):** doble clic al .exe con el programa ya abierto abria una SEGUNDA ventana → se podia poner una en Config y otra en Ventas y quedaban en desacuerdo. Fix: `app.requestSingleInstanceLock()` — el segundo proceso hace `app.quit()`, y el `second-instance` handler restaura/enfoca la ventana existente (`mainWindow.restore/show/focus`). Guard `if(!gotTheLock) return` al inicio de `whenReady`. Archivo fuente: `C:\Prueba Claude Code\cobra-pos-electron\main.js` (222 lineas). **Parcheado EN SITIO** en la app instalada `C:\Users\USUARIO\AppData\Local\Cobra POS\resources\app\main.js` (es archivo suelto, no asar; la app solo carga la URL remota, asi que copiar main.js basta — sin reinstalar). Respaldo `main.js.bak-YYYYMMDD` al lado. **Toma efecto al cerrar TODAS las instancias y reabrir.** La unica forma de tener dos ventanas en desacuerdo ahora es desde equipos distintos, que es justo lo que el vinculo en vivo (ronda 44) resuelve. |
| 46 | 2026-07-23 | **Permisos que de verdad bloquean — Etapa 0 parte 1 (commit `f3940a1`):** prerequisito del multi-caja. Antes 12 de 13 permisos eran decorativos. (1) Nuevo `pos-perms.js` (cargado tras pos-core en dashboard/ventas/configuracion/catalogo/inventario/informes/chat-ia/caja): resuelve el rol una vez y expone `posHasPerm(id)`, `posHasAny([...])`, `posRequire(id, redirect)` (candado de entrada), `posGate(el, id)` (ocultar elemento), `posPermsReady()`, `posRole()`. admin/administrador/gerente/dueño y `pos_roles.system_role`=todos los permisos; otros=su lista real; **rol no reconocido=fail-open a `*`** (no encerrar al dueño durante rollout — el candado REAL es el RLS pendiente). (2) Candados de ENTRADA vía `<script>posRequire(...)</script>` tras cargar pos-perms: configuracion=`config.*`, informes=`ventas.ver`, catalogo=`catalogo.ver`, inventario=`catalogo.editar`, chat-ia=`chat.usar`, caja=`ventas.ver|pedidos.cobrar`; sin permiso → `location.replace('ventas.html')`. (3) Fix del hueco en `ventas-salon.js` `fetchUserPerms`: daba `canCobrar=true` AUTOMÁTICO a cajero sin mirar permisos; ahora usa `posHasPerm('pedidos.cobrar')` (admin/gerente siguen con todo). Verificado en navegador con 5 roles simulados. **PENDIENTE (Etapa 0 parte 2):** permisos a nivel de ACCIÓN dentro de las páginas (`pedidos.descuento`, `pedidos.anular`, `catalogo.editar` en botones), ocultar links del sidebar de Ventas a áreas sin permiso, y agregar permiso `caja.abrir/cerrar` para el multi-caja. Blindaje RLS = pendiente separado (ver secciones PENDIENTE). |
| 47 | 2026-07-23 | **Permisos por PIN (override de gerente) en vez de ocultar (commit `b7d4423`) — SUPERSEDE el modelo de la ronda 46:** decisión de Sergio — NADA se oculta; al tocar una acción sin permiso aparece el PIN de administrador; PIN correcto = la acción procede. Así el gerente resuelve algo rápido desde la cuenta de cualquier rol con solo el PIN. `pos-perms.js` gana: `posPinPrompt(motivo,onOk,onCancel)` (modal reutilizable, valida `pos_users.pin` con `is_authorized_admin`), `posGuard(perm,onOk)` (candado de ACCIÓN: con permiso corre directo, sin permiso pide PIN), `posRequirePin(perm,backTo)` (candado de ENTRADA: PIN encima de la página en vez de redirigir — correcto=se queda, cancelar=sale a Ventas). Los 6 candados de entrada (config/informes/catalogo/inventario/chat/caja) pasaron de `posRequire`(redirige) a `posRequirePin`(PIN encima). En `ventas-salon.js`: el botón Cobrar SIEMPRE se muestra (`state.canCobrar=true` fijo; se quitó el hide); `handleAction` intercepta cobrar/collect vía `VS_PERM_ACCION`→ si no tiene `pedidos.cobrar` pide PIN y re-ejecuta con `__pinOk`; domicilios igual. Verificado en navegador: sin permiso abre PIN, PIN malo no ejecuta+error, PIN bueno ejecuta+cierra, con permiso pasa directo. **PENDIENTE (parte 2):** llevar `posGuard` a las demás acciones privilegiadas — `pedidos.descuento` y `pedidos.anular` (botones en el flujo de cobro/comanda), `catalogo.editar` (guardar en catálogo/inventario), guardar en Configuración. Y agregar permiso `caja.abrir/cerrar` para el multi-caja. Blindaje RLS sigue pendiente aparte. |
| 48 | 2026-07-23 | **Catálogo de permisos ampliado (23) + todo cableado por PIN (commit `e8f8c00`):** `UR_PERMS` pasó de 13 a 23 permisos en 7 grupos (nuevos: caja.abrir/cerrar/movimientos/ver_todas, pagos.anular, pedidos.reabrir, inventario.compras, reservas.gestionar, domicilios.gestionar, config.propina). `UR_TOTAL_PERMS` ahora se calcula dinámico de UR_PERMS (antes fijo en 13). **dashboard.ver como permiso de login:** el guard fijo de roles en dashboard.js se reemplazó por `posRequire('dashboard.ver','ventas.html')` — quien no lo tenga es enviado a Ventas (redirect, no PIN, decisión de Sergio). **Acciones cableadas con `posGuard`/PIN (override de gerente):** enviar a cocina (tomar-pedido `case 'enviar-cocina'` + venta-rapida `vr-btn-enviar`), abrir mesa/cancelar-pedido-mesa/quick-cancelar (ventas-salon `VS_PERM_ACCION`, el re-dispatch ahora copia TODO el dataset con `Object.assign` para preservar quickId), descuento (pagos `case 'discount'`), aperturar caja (dashboard `handleSessionAction`), cerrar caja + movimientos (caja.js opens de panel-cerrar/panel-movimiento), anular venta (`window.anularVenta` envuelto → pagos.anular) y reimprimir cierre (`window.reimprimirCierre` → pedidos.reabrir), guardar producto (catalogo-productos `saveProduct` con flag `__pinOk`), registrar compra (inventario `btn-registrar-compra`), propina obligatoria (config toggle). Entrada por PIN a reservas/domicilios (`posRequirePin`). **PENDIENTE (menor):** combos/categorías/modificadores del catálogo y guardados internos de config no tienen gate individual (la ENTRADA a esas páginas ya pide su permiso); apertura via caja.html directo (btn-confirmar-abrir) sin gate propio (caja.html ya requiere ventas.ver|pedidos.cobrar para entrar); `caja.ver_todas` está en el catálogo pero no tiene efecto hasta que exista el multi-caja. Blindaje RLS sigue pendiente aparte. |
| 49 | 2026-07-23 | **Sistema de propina configurable (commit `0187507`):** rediseño completo. **Config:** la sección "Impuestos y propina" (antes placeholder "Pronto") cobra vida — `screen-impuesto` + `propInit/propRender/propBind` en configuracion.js. Interruptor "El restaurante recibe propina" (`propinaActiva`), MOVIDO desde Operación (se quitaron ahí las filas de propina obligatoria/sugerida; ya NO es obligatoria/voluntaria). Porcentajes sugeridos MÚLTIPLES (`propinaPorcentajes` array, chips agregar/quitar, mínimo 1, se ordenan). Modo por defecto `propinaModoDefault` pct|fijo. Comparte `_opDraft`/`_opSaved` y el blob `operacion_config` con Operación (footer propio `prop-btn-save`, `opCheckDirty` toggle ambos pares). Migración en `opLoad`: `propinaPct` viejo → `propinaPorcentajes=[pct]`, activa=true. **Cobro (pagos.js/html):** reemplaza el checkbox de 10% fijo por un bloque: interruptor (encendido por defecto), botones de % configurables, "Otro" con campo libre, switch %/\$ fijo (para dejar un billete), siempre editable (quitar/cambiar/fijo). Si el restaurante no recibe propina, el bloque no aparece. `tipLoadConfig()` lee la config, `tipCalc(subtotal)` computa según tipOn/tipMode/tipPct/tipFixed. Se eliminó el modelo viejo `SP.tip`/`SP.tipLocked` y el parámetro URL `servicio=1`. **Verificado:** tipCalc 5/5 casos (10%/15%/fijo/off/no-recibe); config UI (agregar+ordena, quitar, mínimo 1, modo, apagar oculta detalle, guardar). **Pendiente menor:** impuestos de la pestaña siguen "Pronto"; el modo fijo por defecto precarga en \$0 (el mesero escribe), no hay monto fijo sugerido configurable (opción futura si Sergio la pide). |
| 50 | 2026-07-23 | **Agregar más pedidos a una mesa ocupada (commit `67ebcae`):** el botón "+ Agregar ítem" del rail estaba MUERTO — emitía `table:addItem` que nadie escuchaba. Fix: (1) `ventas.html` gana un listener `on('table:addItem')` que navega a `tomar-pedido.html?table=X` (con cajaGuard); tomar-pedido YA carga la orden open/in_progress existente y le suma lo nuevo (saveOrder update total + replace items, no toca paid_amount). (2) `ventas-salon.js`: se quitó el bloqueo del `case 'add-item'` que impedía agregar a mesas `pendiente_pago` (toast "primero cobra") y el label `vs-rail-locked`; el botón "+ Agregar ítem" ahora aparece en TODOS los estados ocupados. (3) `add-item` requiere `pedidos.crear` (VS_PERM_ACCION), igual que abrir mesa. **La máquina existente hace el resto sin cambios:** el sistema de abonos/`paid_amount` ya cobra SOLO lo nuevo cuando la mesa ya pagó (falta = total nuevo − paid_amount; la propina sale proporcional y cuadra). Cubre los 3 escenarios de Sergio: prepago+pendiente (suma al total), prepago+pagada (cobra solo lo nuevo, mesa vuelve a pendiente_pago al enviar), sin prepago (paga al final). |
| 51 | 2026-07-23 | **Comanda parcial: al agregar ítems a una mesa ya enviada, imprime SOLO lo nuevo (commit `e37f3f8`):** columna `pos_order_items.kitchen_printed_at` (marca por ítem de "ya fue a cocina"). `posAutoprint` reescrito: `yaEnviados = raw.some(kitchen_printed_at)`; si ya hay enviados → imprime solo los NUEVOS (sin marca), si no → completo; `force` (reimprimir) = SIEMPRE completo. Marca los ítems (`kitchen_printed_at=now`) SOLO si `!force && order.visible_cocina` — en prepago sin pagar (no visible) NO marca, así la comanda pendiente reimprime completa hasta cobrar. Candado `_printing[orderId]` = concurrencia (reemplaza el guard `_autoPrinted`/`_lsWasPrinted` que bloqueaba "para siempre"). `pos-print-listener` `shouldPrint = visible_cocina` (quitado `!printed_at`; posAutoprint es el gatekeeper real por ítem). `tomar-pedido.saveOrder` orden existente: DIFF (borrar quitados + update existentes + insert nuevos) en vez de borrar-todo+reinsertar, para preservar `kitchen_printed_at` (los nuevos entran con id null → sin marca). La comanda NO cambia de diseño. **Verificado:** criterio 8/8 escenarios en node. **OJO validar en hardware real:** en prepago, agregar tras pagar puede imprimir la ampliación 2 veces (ticket pendiente al enviar + comanda de cocina al cobrar), ambas "solo lo nuevo" — si molesta, suprimir el pendiente. |
| 52 | 2026-07-23 | **URGENTE — bucle infinito de impresión (commits `185ef9a`, `86b1a5a`) — corrige la ronda 51:** al probar desde tablet, la comanda se imprimió ~15 veces sin parar. **Causa:** la ronda 51 quitó el candado `!printed_at` de `shouldPrint` en pos-print-listener → cada `update printed_at` de posAutoprint re-disparaba la impresión (eco realtime infinito). **Fix en 2 capas:** (1) restaurado `shouldPrint = visible_cocina && !o.printed_at` (corta el bucle definitivamente: el eco de printed_at ya no dispara). (2) Para NO perder la función "solo lo nuevo" al agregar, se disparan por un listener NUEVO de `INSERT` en `pos_order_items` (no por updates del pedido), con anti-rebote 2.5s, que **solo** dispara si el pedido ya tiene `printed_at` (adición real; nunca en pedido nuevo ni en borrador guardado sin enviar). Esto NO puede entrar en bucle: el marcado de ítems es un UPDATE (no INSERT) y printed_at es de pos_orders (gated). (3) Candado extra `_lastPrintSig` en posAutoprint: misma firma de ítems en <6s → no repite (deduplica el envío directo de electron + el eco del listener). RLS de pos_order_items = `allow_all` (no era el problema). Verificado: firma dedup 5/5, criterio 8/8. **Sergio debe reprobar en hardware.** |
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

## 🟢 CORRECCIONES DE LA AUDITORÍA — 2026-07-20 (ver AUDITORIA-2026-07-20.md)

- **CRÍTICO (commit `3f988b6`)**: service_role key ELIMINADA del cliente — onboarding.js y admin-reg.js ahora llaman la EF **`provision`** (v1: valida el token del usuario; onboarding solo para cuentas sin tenant; approve solo para `pos_users.is_authorized_admin`). La llave expuesta `sb_secret_cEW8-…` fue **REVOCADA** en Supabase (aunque esté en el historial de git ya no sirve). Endpoint `?debug=1` del meta-webhook eliminado (v48).
- **PLATA (commit `114b82b`)**: Caja/Informes/Dashboard ahora desglosan pagos desde **pos_payments** (mixtos bien repartidos; fallback a payment_method para pedidos pagados sin desglose). Arqueo: columnas nuevas `pos_sessions.arqueo_contado/arqueo_diff`; "Guardar arqueo" PERSISTE (sobrevive recargas); el cierre guarda el CONTADO real y su diferencia (los cierres ya no dicen siempre "Cuadrado"). Totales alineados a `total_final ?? total`. Venta rápida escribe `discount_amount` (además de discount). Dashboard: normPM separa nequi/daviplata→'transfer' (ya no $0), "cierre anterior" lee closing_cash.
- **ROTOS (commit `c332f6e`)**: chat-ia.js — helper `getActiveConv()` arregla los 4 botones muertos (Confirmar pago, Sin nomenclatura, Confirmar domi, badge Pagos); confirm-domi v3 con el esquema real de chat_channels (channel= + meta JSON). Domicilios: columnas nuevas `pos_orders.delivery_status/delivery_fee` — los avances Recibido→…→Entregado se PERSISTEN en ambas pantallas (ventas-salon y domicilios) y el fee entra al total. Venta rápida: `finalizarVenta()` limpia el carrito y avanza el turno tras enviar (fin de duplicados). pagos.js "Volver" → ventas.html. Comanda auto-impresa incluye PAGADO/ABONADO/COBRAR.
- PENDIENTE (decisión con Sergio): qué ADORNOS se implementan de verdad y cuáles se retiran de la UI (lista en AUDITORIA-2026-07-20.md).

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

## PENDIENTE — Múltiples cajas simultáneas (diseño cerrado 2026-07-23, sin implementar)

**Objetivo:** restaurantes con varias registradoras/cajeras trabajando a la vez, cada una en su computador con sus propias credenciales. Feature OPT-IN (interruptor en Config; apagado = todo funciona como hoy, una caja por sucursal).

**Estado infra al auditar (buena noticia, ~70% ya existe):** login ya es por usuario (`signInWithPassword`); `pos_orders` ya tiene `session_id` (208/244 pedidos lo traen); mesas (`pos_tables`) ya son por-sucursal → ya se comparten; el cierre ya imprime el código de caja (`pos-cierre-print.js:67`, últimos 6 del id de sesión). **Faltan:** `pos_payments.session_id` (NO existe — clave para atribuir el dinero), soltar 2 amarras, y arreglar permisos (ver abajo).

**MODELO DEL DINERO (decisión firme de Sergio, es lo que simplifica todo):**
> Un pedido NO pertenece a ninguna caja. El DINERO de un pedido cuenta en la caja que RECIBIÓ EL PAGO.
- Salón/contra-entrega sin pagar: cualquiera lo cobra; el dinero cuenta en la caja que cobró. Se estampa `session_id` en el PAGO (no en el pedido) → hay que agregar esa columna a `pos_payments`. El cierre de cada caja = suma de sus pagos.
- Prepagado del bot (transferencia ya verificada): el dinero cuenta en la caja abierta a la que se enrutó; otra caja solo puede marcar "entregado", NO re-cobrar (ya está pagado → order.status pagado ya lo impide hoy).
- Todas las cajeras tienen LIBERTAD TOTAL: cobrar cualquier pedido, mover cualquier mesa, tocar todo. Lo único que cambia al cobrar es a qué caja se atribuye el dinero.

**Las 2 amarras a soltar:** (1) `posSessionId()` en pos-core resuelve "la caja abierta DE LA SUCURSAL" (`.eq('branch_id').eq('status','open').limit(1)`) → cambiar a la caja de ESA cajera. (2) `caja.js:1319` cierra las demás cajas abiertas al abrir una (`.eq('status','open').neq('id',...)`) → quitar para que coexistan.

**Numeración:** consecutiva (Caja 1, 2, 3), NO por nombre. Cada cajera se vincula a un número de caja (guardado en su usuario/rol), reasignable. Al abrir, abre su número.

**Enrutamiento del bot (Config → Asistente, ajuste nuevo):** desplegable "¿A qué caja van los pedidos del bot?" con 2 modos: (a) Caja fija — elige número; (b) Repartir (round-robin) — 1er pedido→Caja 1, 2º→Caja 2… entre las cajas ABIERTAS. Reglas: NUNCA a una caja cerrada (si la fija está cerrada → a la abierta más cercana, sin retraso); con una sola caja abierta, todo cae ahí.

**Vista del gerente:** ve todo — consolidado de la sucursal o filtrado por caja. El número/código de caja es la llave del filtro (y lo que empareja el cierre en papel con el turno).

**Plan por etapas:** 0) arreglar permisos (prerequisito, ver abajo). 1) caja por cajera (resolvedor + quitar amarra + número legible). 2) vistas filtradas (dashboard/historial/informes por caja + consolidado gerente). 3) bordes (enrutamiento bot, cierre por cajera scopeado a SUS pagos, marcar-entregado sin re-cobrar).

## PENDIENTE — Arreglar permisos de rol (auditoría hecha 2026-07-23, prerequisito del multi-caja)

**Hallazgo de la auditoría:** los permisos están BIEN diseñados (`pos_roles.perms` array, catálogo de 13 permisos editable en configuracion.js) pero son CASI DECORATIVOS:
- Solo 1 de 13 se respeta: `pedidos.cobrar` (via `state.canCobrar` en `modules/ventas-salon.js`, controla si aparece el botón Cobrar). Los otros 12 (`pedidos.anular`, `pedidos.descuento`, `catalogo.editar`, `config.usuarios`, `ventas.ver`, etc.) NO se revisan en ningún lado.
- Hueco en el que funciona: `fetchUserPerms` (ventas-salon.js ~580) da `canCobrar=true` AUTOMÁTICO a admin/administrador/gerente/cajero/cajera SIN mirar sus perms; solo consulta `pos_roles.perms` para "mesero" y roles custom. Un cajero siempre puede cobrar aunque le quiten el permiso.
- Enforcement es SOLO cliente (esconde botones). Sin RLS de negocio: quien sepa saltarse la UI, puede.

**Plan aprobado (pendiente de construir):** (1) helper único `posHasPerm('id')` que carga el rol una vez y todas las páginas consultan; (2) cablear los 13 permisos para que bloqueen la ACCIÓN (no solo escondan el botón); (3) admin/gerente = todo siempre (correcto), pero cajero sigue sus perms reales (quitar el sí gratis); (4) endurecimiento server-side (RLS de negocio) = pendiente SEPARADO más grande, no mezclar. Falta agregar permiso `caja.abrir`/`caja.cerrar` al catálogo (para el multi-caja).

## 🔴 PARA MAÑANA — 2026-07-24 (lista corta, lo primero al retomar)

> Lista separada de los pendientes grandes de abajo (multi-caja, Modo Gerente, RLS). Esto es lo inmediato.
> **Ordenada por esfuerzo:** arriba lo que se arregla en minutos, abajo los proyectos completos. Se avanza de arriba hacia abajo.
> Los dos **[CRÍTICO]** de pérdida de datos son el **#13** (mesas y zonas borradas) y el **#21** (clientes solo en localStorage).
> Si vuelve a perderse información en producción, esos dos suben al principio sin importar el esfuerzo.

### ⚡ Arreglos rápidos — minutos cada uno

1. ✅ **[HECHO 2026-07-24] [COSMÉTICO] El título de la ventana del Historial dice "Lumen POS"** (marca vieja) en vez de "Cobra POS" — visible en la barra de título del .exe. Buscar otros `<title>` con la marca vieja en el resto de páginas.

2. ✅ **[HECHO 2026-07-24 — Sergio confirmó: sus zonas son SOLO Adentro y Antejardín; no existe Barra/Terraza. BD verificada limpia.] Preguntar a Sergio si quiere de vuelta la mesa "Barra" y la zona "Terraza"** (existían antes del borrado, no se restauraron por no estar seguros). Y ajustar capacidades de 05/06/07/08 (quedaron en 4 por defecto).

3. ✅ **[HECHO 2026-07-24 — commit f7a4cea] [BUG · Dashboard] "Imprimir comprobantes" abre el modal VACÍO ("Sin resultados") aunque haya pedidos del día.** Reportado 2026-07-23 22:09. **CAUSA CONFIRMADA — la consulta pide dos columnas que NO EXISTEN en `pos_orders`.** En `dashboard.js:1533` (`qmLoadComprobantes()`) el `.select()` incluye `delivery_address` y `delivery_person`; verificado contra el esquema real, esas columnas no están en la tabla. PostgREST devuelve **error 400** y como el código hace `var { data: orders } = await q;` **sin capturar `error`**, `data` llega `null` → `QM.ordersCache = []` → "Sin resultados", en silencio. **Fix:** (a) quitar `delivery_address`/`delivery_person` del select y sacar el dato del domicilio de donde sí viva (revisar `pos_deliveries`/`notes`, o simplemente usar `customer_name`); `qmSelectOrder()` también los referencia. (b) **Capturar siempre el `error` y mostrarlo** — este bug fue invisible justo por no hacerlo (es la misma regla que ya está en CLAUDE.md sobre los toasts). (c) De paso: `window._branchId` (usado en las líneas 1376, 1461 y 1531) **nunca se asigna en ninguna parte del proyecto** → los tres modales rápidos (Meseros, Inventario, Comprobantes) consultan SIN filtro de sucursal. Pasar el `branchId` real como en el resto del dashboard. (d) Revisar si el alcance debe ser el turno y no el día natural, igual que en el punto 4.

4. ✅ **[HECHO 2026-07-24 — commit 299aa75] [BUG · Dashboard] "Mostrador" siempre en $0 — filtra por un canal que no existe; además debe llamarse "Venta rápida".** Sergio: en Meta diaria, Salón y Domicilio salen bien, pero Mostrador siempre $0 aunque sí hubo ventas rápidas; y el nombre debe ser **"Venta rápida"**, mostrando lo vendido en ese canal **en el turno**. **CAUSA CONFIRMADA (`dashboard.js:257`):** `orders.filter(o => o.channel==='counter' || o.channel==='mostrador')` — pero el canal real de las ventas rápidas en la BD es **`'rapido'`** (verificado en `pos_orders`). Esos valores nunca coinciden → siempre da 0. **Se ve en la captura:** total $495.000 pero Salón $406.000 + Domicilio $0 + Mostrador $0 = $406.000; **los ~$89.000 de ventas rápidas no se cuentan en ninguna parte** (por eso Salón marca "100%" cuando no lo es). **Fix:** (a) filtrar por `channel === 'rapido'` (y aceptar los alias viejos por compatibilidad); (b) renombrar la etiqueta a **"Venta rápida"** en `dashboard.html:242` (`g-counter`) y en las etiquetas de canal (`dashboard.js` ~1568 y ~1600, que dicen "Mostrador"); (c) confirmar que el alcance sea **del turno** y no del día natural, para que cuadre con Caja. **Nota:** en `dashboard.js:595` ya existe un normalizador que SÍ mapea `rapid|mostrador|counter → 'quick'` — el desglose de la meta no lo está usando. Unificar todo por ese normalizador para que no vuelva a desincronizarse.

5. ✅ **[HECHO 2026-07-24 — commit pendiente] [BUG · cobro en efectivo] El vuelto se pierde al agregar el pago.** Síntoma de Sergio: al pagar en efectivo y digitar un valor SUPERIOR al total, no calcula el regreso — actúa como si se hubiera puesto el monto exacto. **Causa encontrada (pagos.js):** en `applyPayment()` el pago se guarda con `amount = Math.min(SP.entry, falta)` (topado a lo que se debe) y `received = SP.entry` (el real), y luego `SP.entry = 0`. Pero `calc()` calcula `vuelto = paid + SP.entry - total`, que tras aplicar da `total + 0 - total = 0` → **el vuelto se ve MIENTRAS se digita y desaparece al pulsar "Agregar pago"**. El dato NO se pierde: cada pago ya guarda `received` (la lista de pagos incluso muestra "Recibido X · vuelto Y" en la línea, ~pagos.js:387). **Fix propuesto:** que `vuelto` sume el exceso ya guardado, algo como `vuelto = Σ max(0, p.received - p.amount) de los pagos en efectivo + max(0, SP.entry - falta)`, cuidando no contar doble. Verificar también el pie (`foot-vuelto`) y la tarjeta `vuelto-card`.

6. ✅ **[HECHO 2026-07-24] [BUG · Venta rápida] Al marcar "ya entregué", la tarjeta DESAPARECE.** Sergio: debe quedarse visible en estado **Entregado** y solo desaparecer **al cerrar la caja** (cada caja lleva sus propios pedidos). **Causa encontrada (`modules/ventas-salon.js` ~2348-2357, `case 'quick-entregar'`):** tras marcar `delivered_at` hace `state.quickOrders = state.quickOrders.filter(x => x.id !== qeId)` — **la saca de la lista** en vez de cambiarle el estado. Por eso el contador de arriba dice "2 ENTREGADO" (usa `state.quickDeliveredCount`, ~1706) pero no se ve ninguna tarjeta. **Fix:** en vez de filtrarla, actualizar su `estado` a `'entregado'` (ya existe `QUICK_STATE_META.entregado`, ~34) y re-render; que la tarjeta se pinte en gris/entregado. Verificar que la consulta de rápidas ya trae los entregados del turno (usa `.gte('created_at', cajaStart)`, así que el alcance por caja ya está bien) y que el contador de la pestaña "Rápidas" (~1002 `state.quickOrders.length`) siga cuadrando. Revisar también el caso equivalente en domicilios si aplica.

7. **[BUG · Dashboard] El modal "Meseros en turno" muestra 0 mesas aunque el mesero atendió toda la noche.** Sergio: todos los pedidos se tomaron desde la cuenta de Mónica Villareal y el modal dice "0 MESAS". **Causa CONFIRMADA (`dashboard.js` ~1382-1396):** el conteo sale de `pos_orders` filtrando **`.eq('status','open')`** con `table_id` no nulo. Dos problemas: (a) **excluye `in_progress`**, que es el estado de las mesas ya enviadas a cocina → aun EN PLENO servicio el conteo se queda corto o en 0; (b) mide **mesas vivas AHORA** ("en servicio"), no el trabajo del turno, así que al final de la noche siempre da 0. **Datos reales de esa noche que lo confirman:** Mónica Villareal = 6 pedidos `paid` sobre 5 mesas (+3 cancelados); Sergio Abadia = 3 `paid` sobre 2 mesas. Ninguno queda en `open`, por eso el modal muestra 0. **Fix propuesto:** contar por TURNO (sesión de caja abierta) y no por `status='open'`; mostrar "atendidas en el turno" (acumulado) y, si se quiere, además "en servicio ahora". Incluir todos los estados no cancelados. Agregar también el filtro por `branch_id` a esa consulta (hoy solo lo tiene la de meseros). Nota: hay 4 pedidos `paid` con `waiter_name` NULL — revisar por qué quedan sin mesero.

8. **[UI · Impuestos y propina] El layout NO quedó como la maqueta aprobada.** Sergio: le gustó la maqueta (una tarjeta ANCHA con todo apilado en horizontal: interruptor arriba a la derecha, luego porcentajes sugeridos, luego el selector Porcentaje/Cantidad fija). Lo construido salió como **dos tarjetas angostas lado a lado** (Propina | Impuestos) con el interruptor apretado. **Causa:** la sección usa `<section class="cf-body">` y esa clase es un **grid de 2 columnas** (`.cf-body { display:grid; grid-template-columns: 1fr 320px }`, configuracion.css:109) diseñado para la pantalla de Mesas y zonas (área principal + panel lateral). Las dos `.op-card` cayeron una en cada columna. **Fix:** usar el mismo contenedor que la pantalla de Operación, que sí apila bien: `<div class="op-scroll"><div class="op-inner"> … </div></div>` en vez de `cf-body`; y bajar la tarjeta de "Impuestos (Pronto)" DEBAJO de la de propina, no al lado. Revisar también que el detalle (porcentajes + modo) se vea completo al encender el interruptor.

9. **Validar en hardware la impresión de comandas.** Quedó sin probar tras arreglar el bucle infinito (rondas 51-52). Probar los 3 casos: sin prepago (1ª completa, adds solo lo nuevo), prepago sin pagar (completa cada vez), prepago pagado (solo lo nuevo). Confirmar que NO se repite. Ya se purgaron 213 trabajos atascados de la cola de Windows (impresora CAJA.2).

### 🔧 Bugs que estorban en el turno — media mañana

10. **[BUG · Historial] La pantalla se queda en "Cargando pedidos…" y nunca muestra nada.** (Ventas → Historial). **Diagnóstico parcial:** la consulta en sí se ve bien (`historial.js:56-62 loadOrders()` → `pos_orders` por rango de fecha + `branch_id`). El flujo del arranque es: `DOMContentLoaded` → bloque auth (try/catch) → `Promise.all([loadUsers(), loadTables()])` → `bindFilters()` → `loadAndRender()` (que hace `loadOrders()` + `renderList()`, ~425-426). Como queda en "Cargando", **algo lanza excepción ANTES de `renderList()`** y aborta la cadena. Pistas de la captura: el usuario del topbar y los datos del sidebar muestran "—", así que el bloque auth ya venía fallando (lo atrapa su `catch` y sigue, dejando `HS.branchId` en null). Sospechosos: `loadUsers()`/`loadTables()` (van en `Promise.all` SIN try/catch → si una falla, mata el init) o `bindFilters()` topándose con un elemento que no existe. **OJO:** este arreglo se hace JUNTO con el punto 11 (reenfocar el Historial al turno actual), porque cambia el alcance de la consulta. **Acción mañana:** abrir la consola en esa pantalla para ver el error exacto, y de paso envolver `Promise.all` y `bindFilters()` en try/catch para que un fallo parcial no deje la pantalla colgada en "Cargando" (mostrar estado vacío o error, nunca spinner infinito). **Ojo:** revisar si mi edición de la ronda 39 (pos-brand, quité el setter de `sb-branch-name`) dejó algo inconsistente — la sintaxis está OK y quedó una variable `branch` sin usar, pero conviene confirmarlo.

11. **[DECISIÓN + FEATURE · Ventas] Borrar la pestaña "Entregados" y reenfocar el "Historial" de Ventas al TURNO ACTUAL.** Decidido con Sergio (2026-07-23):
    - **Borrar "Entregados":** es **botón muerto** — tiene `data-action="nav-entregados"` (`modules/ventas-salon.js` ~956) pero **no existe ningún `case` que lo maneje**, y su badge (`vs-badge-entregados`, ~961) muestra "—" fijo, nunca se llena. Nunca funcionó. Quitar botón + badge.
    - **Los DOS historiales quedan así (sin redundancia):**
      · **Caja → Cierres de caja** = historial TOTAL e histórico. Ya existe y Sergio lo considera excelente y muy detallado. **No se toca.**
      · **Ventas → Historial** = SOLO lo vendido durante la **caja abierta actual**. Al cerrar la caja ese historial se vacía; al abrir otra caja, arranca limpio para esa caja.
    - **Implementación:** acotar la consulta de `historial.js` a la sesión de caja abierta (por `session_id` de la sesión `open`, o `created_at >= opened_at` del turno) en vez de los rangos de calendario Hoy/Ayer/7 días. Ojo: el turno **cruza la medianoche**, por eso el filtro por día no sirve.
    - **Filtro de estado dentro de ese historial:** poder ver **entregados** / todos / por estado — que es lo que la pestaña "Entregados" pretendía dar. Mantener también el filtro por canal y el buscador que ya tiene.
    - Ese historial ya permite **ver detalle + reimprimir comanda y recibo** (`historial.js` ~225-229), así que absorbe por completo la función que se pretendía con "Entregados".

12. **Revisar por qué quedaron pedidos rápidos huérfanos** bloqueando el cierre de caja (3 pedidos `rapido` sin pagar, sin mesa, invisibles en la pestaña Rápidas, de sesiones viejas y la actual). Se cancelaron a mano. Falta: que no se creen huérfanos, o que la pantalla de Rápidas los muestre para poder cerrarlos desde la UI.

13. ✅ **[HECHO 2026-07-24 — commits f946da3/adab7c9] [CRÍTICO] Investigar por qué se BORRARON las mesas y zonas solas.** Durante el servicio desaparecieron de `pos_tables` las mesas 05, Barra, 06, 07, 08 y las zonas Antejardín/Terraza — solo quedaron 01-04 en Adentro. Se restauraron a mano (Adentro 01-05, Antejardín 06-08, capacidad 4 por defecto). **Sospecha principal:** la pantalla Configuración → Mesas y zonas sincronizando contra `pos_tables` con estado local vacío/obsoleto (borra las que no están en su copia). Revisar ese guardado y blindarlo para que NUNCA borre en masa. Es pérdida de datos en producción.

### 🎨 Funciones nuevas y unificación visual — un rato cada una

14. **[BUG · automatización] La mesa en "comiendo" NUNCA se libera sola — el temporizador se reinicia solo.** Sergio: la notificación de "¿ya entregaste?" (esperando→comiendo) funciona bien, pero la de "¿ya terminaron / se fueron?" nunca aparece y una mesa en `comiendo` se queda así **días**. **VERIFICADO — el sistema SÍ existe y SÍ arranca:** el bloque "C10 comiendo→libre" está completo (`modules/ventas-salon.js` ~2864-2982: `_showLibreNotif` con botones "Sí / Siguen comiendo", `_advanceMesaToLibre`, `syncComiendoTimers`) y se llama desde `startAutoAvance()` (~2859-2860, con `setInterval` cada 60 s). La config **también existe** (`liberarT1: 45`, `liberarT2: 15`, `liberarT3: 10` en OP_DEFAULTS ~1828-1830, con sus steppers en configuracion.html ~897-908). **CAUSA RAÍZ ENCONTRADA (`syncComiendoTimers`, ~2956-2970):** el temporizador es un `setTimeout` **en memoria del navegador** y arranca con `var comiendoSince = new Date().toISOString()` — o sea, **cuenta desde que la página VE la mesa en comiendo, no desde que realmente empezó a comer**. Como vive en memoria: al navegar entre pantallas, recargar o cerrar la app, `_comiendoTimers` se borra y al volver **empieza de cero un nuevo conteo de 45 min**. En la operación real la caja cambia de pantalla constantemente, así que **la cuenta casi nunca llega a completarse** → la notificación no sale nunca → la mesa se queda en comiendo para siempre. (El sistema esperando→comiendo no sufre tanto porque sus tiempos son mucho más cortos: 10/5/3 min.) **Fix:** persistir el inicio real del estado — usar un `comiendo_at` en `pos_tables` (**es el mismo timestamp que pide el punto 20**) y calcular el vencimiento contra ESA marca, no contra `new Date()` del momento de carga. Así, aunque se recargue o se cambie de pantalla, el sistema sabe que ya pasaron los 45 min y dispara la notificación (o el auto-liberado si ya se pasó el plazo estando la app cerrada). Revisar de paso si el sistema esperando→comiendo tiene el mismo patrón frágil (usa `esperando_at`, que sí existe — confirmar que lo usa de verdad y no `new Date()`).

15. **[FEATURE · Ventas] "Tiempo promedio" → promedio HISTÓRICO real de preparación (esperando → comiendo).** Pedido de Sergio (2026-07-23). **Va de la mano del punto 20** (timestamps por estado): sin esas marcas no se puede calcular.
    - **Hoy:** `avgTime()` (`modules/ventas-salon.js`) hace `state.tables.filter(t => t.status !== 'libre' && t.minutes)` y promedia — o sea, **solo las mesas ocupadas EN ESE MOMENTO**, y sobre el tiempo total de ocupación. Con el salón vacío da 0 y no dice nada útil.
    - **Quiere:** un promedio **histórico acumulado de todos los días y todas las mesas**, para saber cuánto se demora el restaurante **preparando**.
    - ⚠️ **Definición exacta del tiempo a medir (regla de Sergio):** SOLO desde que el cliente **está esperando el pedido** hasta que **está comiendo** (`esperando` → `comiendo`). NO es el tiempo total de la mesa ni incluye el tiempo de pago ni el de consumo. Es específicamente el **tiempo de preparación en cocina**.
    - **Implementación:** depende de guardar los timestamps de transición del punto 20 (`esperando_at` ya existe; falta `comiendo_at`). Con eso, promediar `comiendo_at - esperando_at` sobre el histórico (por sucursal). Guardar el histórico agregado para no recalcular sobre toda la tabla cada vez (p. ej. acumulado por turno/día).
    - **Valor de producto:** es una métrica útil de verdad para cualquier restaurante del SaaS ("¿cuánto nos demoramos en sacar un plato?"), no solo para El Parche. Conviene exponerla también en Informes junto a los otros promedios del punto 20 (pagar / preparar / comer).

16. **[FEATURE · Ventas] "Ventas en curso" → pasar a VENTAS TOTALES DEL TURNO, con opción de ocultar por rol.** Pedido de Sergio (2026-07-23):
   - **Hoy:** el indicador de arriba a la derecha (junto a "Tiempo promedio") muestra `enCurso` = suma de las mesas ABIERTAS en ese momento + "N ítems activos" (`modules/ventas-salon.js` ~1091-1094). Sergio no le ve utilidad así.
   - **Quiere:** que muestre el **acumulado de ventas del TURNO** (caja abierta), para ir viendo toda la noche cómo suma y tener noción de lo vendido. Fuente natural: los pagos/pedidos de la sesión de caja actual (mismo dato que usa el cierre — `pos_payments`/`pos_orders` por `session_id`), para que cuadre con Caja.
   - **Privacidad por rol:** desde **Configuración** se puede desactivar que la cajera (u otros roles) lo vea. Cuando está oculto, el recuadro **sigue ahí pero en asteriscos** (como una contraseña).
   - **Revelar:** al tocarlo pide **PIN** (usar el `posPinPrompt`/`posGuard` que ya existe) y lo muestra.
   - **Gerente:** lo ve normal sin PIN, y **al tocarlo también lo puede ocultar** (alternar).
   - **Sugerencia de implementación:** permiso nuevo (p. ej. `ventas.ver_total_turno`) en el catálogo de roles + interruptor en Configuración; el valor se calcula del turno abierto; el enmascarado es solo de presentación (no ocultar el dato al calcular).

17. **[FEATURE · Marca] Foto/logo del negocio en el avatar del topbar — la sube SOLO el gerente, la ven todos los roles.** Sergio (2026-07-23): el topbar del dashboard tiene el recuadro redondo del avatar; quiere que ahí se pueda poner una **foto real** (el logo del negocio). **Regla:** solo el **gerente** puede subirla/cambiarla; los demás roles la ven pero no la tocan. Cada usuario sigue viendo **su propio nombre y su rol** al lado — lo único compartido es la foto. **Estado actual:** el avatar son **iniciales en texto plano** — `dashboard.js:86` (`tb-avatar`) y `dashboard.js:91` (`dd-avatar`, el del desplegable) hacen `.textContent = ini`; si no hay usuario caen a `'A'` (líneas 96 y 100). No existe ningún campo de imagen. **Plan propuesto:** (a) guardar la imagen en **Supabase Storage** — ya hay buckets públicos (`comprobantes`, `chat-media`); lo limpio es crear uno nuevo `branding` (público, límite ~2 MB, solo `image/png` + `image/jpeg` + `image/webp`), archivo por sucursal tipo `{branch_id}/logo.png`. (b) Guardar la URL en **`branches.operacion_config`** (el jsonb que ya se sincroniza solo entre dispositivos vía `pos-core.js`) → así la foto aparece en la tablet y en el `.exe` sin trabajo extra. (c) El control para subirla va en **Configuración → (pestaña de marca/negocio)**, protegido con `posGuard`; como el modelo acordado es NO esconder botones, un rol sin permiso que lo toque recibe el **PIN de gerente**. Falta decidir el id del permiso (¿`config.marca`?) y agregarlo a la tabla de permisos. (d) Al pintar: si hay URL → `<img>` recortada en círculo (`object-fit:cover`); si no hay o falla la carga → **volver a las iniciales** (nunca dejar el hueco roto). (e) Aplicarlo a los DOS puntos (`tb-avatar` y `dd-avatar`), y de paso revisar si conviene centralizarlo en **`pos-brand.js`**, que ya normaliza la marca en todas las pantallas — así el logo también podría salir en el sidebar y no solo en el dashboard. **Preguntar a Sergio:** ¿la foto es por **sucursal** o por **negocio completo** (todas las sucursales)? Cambia dónde se guarda.

---

18. **[UI · Venta rápida] El panel lateral de un pedido rápido debe ser IGUAL al de mesa.** Sergio: que muestre los ítems, la hora y absolutamente todo igual que el panel de mesa; la única diferencia es que en vez de "Mesa" diga "Venta rápida". **Estado actual (`modules/ventas-salon.js`):** son dos renderizadores distintos y desparejos — `renderRailDetail()` (mesa, ~1495, ≈183 líneas: comanda con ítems, badge de hora/timer, estado, pax, mesero, acciones, footer) vs `renderQuickRailDetail()` (~1798+, ≈83 líneas, mucho más pobre). El rail se elige en ~889 según `state.floor` (`__rapidas__` → `renderQuickRailContent()`). **Fix:** unificar — reutilizar la estructura del rail de mesa parametrizando el encabezado (título "Venta rápida" + nombre del cliente en vez de "Mesa N" + pax) y las acciones propias de rápidas (cobrar / entregar). Ojo de no romper el flujo de rápidas al reusar (`selectedQuickId` vs `getSelectedTable`). Revisar de paso si el de **domicilios** (`renderDomiRailDetail`, ~1342) merece la misma unificación, para que las tres pantallas se sientan iguales.

19. **[UI · Tablet] Unificar la distribución de Venta rápida y Domicilios con la de Mesas.** Sergio (2026-07-23, probando en la tablet): la pantalla de **Mesas se ve perfecta** en tablet, pero **Venta rápida y Domicilios se ven raros** — algunos iconos de producto se ven pequeños porque otros elementos les quitan espacio. Quiere **el mismo diseño de Mesas** en las tres. **Relación:** es el hermano visual del punto 18 (que unifica el *rail* de detalle); esto es la **distribución de la pantalla completa** (grid, anchos de columna, tamaño de las tarjetas/iconos). **Acción mañana:** medir en el ancho real de la tablet las tres vistas de `modules/ventas-salon.js` + `pos-core.css`, encontrar qué regla hace que en `__rapidas__` y domicilios la zona central pierda ancho (probablemente un rail o panel lateral con ancho fijo distinto), y hacer que las tres compartan el mismo layout. **Conviene hacerlo junto con el 18 en una sola pasada.**

20. **[FEATURE · tiempos por estado de mesa] Reloj que se reinicia en cada estado + modal de desglose.** Pedido de Sergio (2026-07-23):
   - **Hoy:** un solo reloj corre desde que el pedido se abre hasta que se libera la mesa. **Causa/base actual:** el badge usa `opened_at` (o `created_at`) del pedido como único punto de partida (`modules/ventas-salon.js` ~1304 `data-timer="${t.openedAt…}"` y ~1546-1547). Ya existe `pos_tables.esperando_at` (marca de entrada a "esperando"), pero el badge no la usa.
   - **Quiere:** que el reloj se **reinicie en cada cambio de estado** — pendiente_pago → esperando → comiendo (cada uno arranca de cero).
   - **Modal:** al tocar el reloj en el panel de la mesa, abrir un modal pequeño con el **desglose por estado de ESA mesa**: cuánto tardó en pagar, cuánto en prepararse, cuánto comiendo. Solo visible **mientras la mesa esté abierta**; al liberarla y volver a abrirla para otro pedido, todo se reinicia.
   - **Persistencia para estadísticas:** los tiempos NO se pierden — guardarlos internamente para sacar promedios (¿cuánto tarda la gente en pagar? ¿cuánto en preparar? ¿cuánto comiendo?) y mostrarlos en Informes.
   - **Regla:** si el **cobro adelantado está DESACTIVADO**, no existe el tiempo de "pendiente de pago" — solo se ven preparación y comiendo.
   - **Habilita el punto 15** (promedio histórico de preparación) y **el 14** (auto-liberar la mesa): sin estos timestamps no se pueden calcular ni disparar.
   - **Implementación sugerida:** timestamps por transición (`pendiente_pago_at`, `esperando_at` ya existe, `comiendo_at`) en `pos_tables`, o mejor un jsonb/tabla de historial de estados por pedido para poder promediar después sin perder el detalle al liberar la mesa.

### 🏗️ Proyectos grandes — un día o más cada uno

21. **[CRÍTICO · pérdida de datos] Los CLIENTES no se guardan en la base — viven solo en localStorage del equipo.** Sergio (2026-07-23): "tenía ~5 clientes guardados y se borraron, solo quedó el de hoy". **Causa CONFIRMADA:** `domicilios.js` guarda la lista de clientes con `localStorage.setItem('pos.clientes', …)` (~línea 1406) y la lee de ahí (~71-76). **NUNCA escribe en la tabla `pos_clientes`** — por eso esa tabla está **VACÍA (0 filas)** mientras la pantalla sí muestra clientes. Consecuencias: (a) los clientes son **por dispositivo** — los que guarda la tablet no existen en el PC y viceversa (probable explicación de los "5 que desaparecieron": pueden estar en el otro equipo); (b) cualquier limpieza de datos del navegador/app los borra sin vuelta atrás; (c) no hay respaldo. **Fix:** persistir en `pos_clientes` (Supabase) — la tabla ya existe con `nombre, telefono, direccion, tenant_id, branch_id` — y dejar localStorage solo como caché de lectura. Migrar lo que haya local al subir. Sergio dijo que **no hace falta recuperar los borrados**, él los vuelve a crear; lo que pide es que **queden en un lugar seguro y no se borren**. ⚠️ **Es prerrequisito del punto 22 (sistema de puntos):** no se puede montar lealtad sobre datos que viven en el localStorage de un equipo. **Es la SEGUNDA pérdida de datos del día** (la otra: mesas y zonas, punto 13) — revisar juntas si hay un patrón de "el estado local pisa/borra la base".

22. **[FEATURE GRANDE · Lealtad] Sistema de puntos con el CELULAR como identificador del cliente.** Pedido de Sergio (2026-07-23). Se conecta con el pendiente ya existente de [[cobra-pos-loyalty-nfc]] (tarjeta NFC).
    - **Identificador único del cliente = número de celular** (decisión de Sergio: todos los clientes tienen celular). El teléfono es la llave, no un id interno.
    - **Cuántos puntos se ganan por pedido: Sergio lo definirá después**, al momento de implementar. No asumir nada.
    - **Flujo en el cobro:** en la pantalla de pago, agregar/buscar cliente **escribiendo el número de teléfono**; aparece el cliente, se selecciona, y al cobrar **se le suman los puntos**.
    - **Estado real encontrado (importante):**
      · El botón de cliente en el cobro **NO hace nada todavía** — `pagos.js:789` tiene `case 'cliente': // Módulos futuros; break;`. La ficha se ve (muestra "Consumidor final") pero es un placeholder: hay que construir el buscador completo.
      · `pos_clientes` existe con `id, tenant_id, branch_id, nombre, telefono, direccion, created_at` → **tiene teléfono pero NO tiene campo de puntos**. Falta columna/tabla de puntos y su historial de acumulación/canje.
      · `pos_orders` ya tiene `cliente_id` y `customer_name` → el vínculo pedido↔cliente ya está previsto en el esquema.
      · ⚠️ **`pos_clientes` está VACÍA (0 filas)** — CAUSA YA ENCONTRADA: los clientes se guardan solo en localStorage, nunca en la base. Ver punto **14 (crítico)**, que es **prerrequisito** de este sistema de puntos.
    - **A definir con Sergio al implementar:** puntos por pedido (¿fijos? ¿% del total?), si se canjean y cómo, si el teléfono se normaliza (indicativo, espacios), unicidad del teléfono por tenant, y qué pasa con los clientes que ya vienen del bot.

23. **[FEATURE · Bot IA + Lealtad] Mensaje de bienvenida al programa de puntos al cerrar el pedido.** Pedido de Sergio (2026-07-23). Depende de los puntos **13** y **14**.
    - **Qué:** cuando el bot termina un pedido y ya está CONFIRMADO, enviar un último mensaje avisando que el cliente quedó registrado en la base de puntos **con su número de celular**, que puede seguir acumulando y **redimirlos en productos**, y que dé su celular cada vez que pida. Texto de ejemplo de Sergio (no literal): *"Quedaste registrado en nuestra base de puntos con tu número de celular. Sigue acumulando y redímelos en productos de El Parche. Da tu número cada vez que hagas un pedido."*
    - **Encaje natural:** el bot YA conoce el celular del cliente (es el número de WhatsApp con el que escribe), que es exactamente el identificador definido en el punto 22. No hay que pedirle nada extra al cliente.
    - ⚠️ **REGLA ARQUITECTURAL (principio firme de Sergio, sesión 9):** el código pone SOLO la mecánica; TODO el contenido sale de la config. Así que el texto **NO va hardcodeado** — debe ser una frase editable en **Configuración → Asistente → Mensajes** (p. ej. `frases.puntos_registro`), como las demás. Cobra POS es multi-restaurante: cada uno escribirá su propio mensaje y su propia marca.
    - **Debe ser opcional:** solo se envía si el restaurante tiene el **sistema de puntos activo** (interruptor en config). Un restaurante sin lealtad no debe mandar ese mensaje.
    - **Dónde:** en `delay_reply.ts`, después de crear el pedido confirmado (`createWhatsappOrder`) y, para el flujo de transferencia, también tras la verificación en `verify-transfer` — para que salga en ambos caminos, no solo en efectivo.
    - **A definir:** si el mensaje se manda en TODOS los pedidos o solo la primera vez que el cliente entra a la base (para no repetirlo a los recurrentes en cada compra).

24. **[FEATURE GRANDE · Pantalla de Cocina (KDS)] Pantalla de solo-vista para que el cocinero vea las comandas.** Pedido de Sergio (2026-07-23). **Sergio diseña el frontend con Claude Design — aquí solo va la MECÁNICA y el funcionamiento, no el diseño visual.**
    - **Para qué:** restaurantes que NO usan impresora y quieren ver las comandas en una pantalla en cocina. Es un diferenciador de producto para el SaaS.
    - **Regla dura:** la pantalla es **SOLO VISTA, sin interacción**. El cocinero no toca nada. Nada de botones "listo", ni scroll manual, ni filtros — todo debe verse solo.
    - ⚠️ **YA EXISTE CÓDIGO REUTILIZABLE:** `modules/kitchen.js` (26 KB, del 2026-07-11) es un KDS completo: tarjetas por pedido, urgencia por tiempo (`WARN_MIN 15` / `CRIT_MIN 30`), sonido al entrar pedido nuevo, suscripción realtime (`kds-orders-rt`), filtros y botón "marcar listo". **PERO está DESCONECTADO:** `pos-router.js` hoy solo hace `location.replace('dashboard.html')` — el shell viejo `index.html` ya no se usa, así que el enlace "Cocina" del dashboard (`index.html?rol=kitchen`) **rebota al dashboard y el KDS nunca se ve**. Hay que revisar ese módulo, quitarle la interacción (botón "listo", filtros) y volver a conectarlo, en vez de partir de cero.
    - **Qué mostrar:** pedidos con `visible_cocina = true` que aún no están entregados. Encabezado grande con el origen (**Mesa N / Domicilio / Venta rápida**), ítems con cantidad, modificadores y notas, y el tiempo transcurrido. Usar el `cocinaMax` que ya está en Operación (default 20 min) para marcar los demorados.
    - ⚠️ **Punto crítico a resolver (consecuencia de "solo vista"):** si el cocinero no puede marcar nada como listo, **¿qué saca el pedido de la pantalla?** Debe salir por una acción de afuera: el mesero/caja marcando entregado, o la automatización esperando→comiendo (puntos 20 y 14). **Si no, la pantalla se llena y deja de servir.** Definir esto ANTES de construir.
    - **APK PARA TV BOX (idea de Sergio — APROBADA, se recomienda hacerla):** en vez de abrir el navegador en el TV box, empaquetar una **APK dedicada a la pantalla de cocina**. **Sale barato porque el proyecto YA existe:** `C:\Prueba Claude Code\cobra-pos-capacitor\` es un Capacitor que solo apunta a una URL (`capacitor.config.json` → `server.url = https://cobrapos.app/dashboard.html`). Basta un segundo build apuntando a la pantalla de cocina. **La razón de peso NO es evitar el navegador, son 3 cosas que solo da la APK:** (1) **arranque automático al encender** (receiver `BOOT_COMPLETED`) — si se va la luz en la cocina, el TV vuelve solo a las comandas sin que nadie vaya a abrirlo; (2) **pantalla siempre encendida** (`FLAG_KEEP_SCREEN_ON`), sin que el sistema la apague; (3) **nadie se sale por accidente** (sin barra de direcciones ni botón atrás). Para Android TV hay que agregar `android.software.leanback` + banner para que aparezca en el launcher del TV. Distribución: sideload del APK (Fire Stick vía Downloader); Play Store más adelante si se quiere.
    - **MENÚ DE OPCIONES PARA OFRECER A LOS CLIENTES (definido con Sergio):**
      | # | Situación del local | Solución |
      |---|---|---|
      | 1 | WiFi llega bien a la cocina | TV box + APK ← lo normal |
      | 2 | WiFi no llega pero se puede pasar cable | **Cable de red (Ethernet)** + TV box + APK |
      | 3 | No se puede pasar cable | **Adaptador PowerLine** (red por el cableado eléctrico, sin obra) + TV box + APK |
      | 4 | ~~Nada de lo anterior~~ | ~~HDMI largo~~ — **DESCARTADO por Sergio (2026-07-23)**: si el acceso es difícil, va cable de red, no HDMI |
      | 5 | No quiere pantalla | Impresora térmica (lo actual) |
    - **OPINIÓN TÉCNICA SOBRE EL HDMI LARGO (idea de Sergio — funciona pero es la peor opción de cable):** el HDMI **no muestra "las comandas", muestra una pantalla del PC de la caja**. Eso amarra ese PC: debe estar encendido siempre con la ventana correcta en el monitor correcto; si la cajera mueve/minimiza algo o el PC se reinicia, **la cocina queda ciega y nadie allá puede arreglarlo**. Además el HDMI pasivo degrada pasados ~10-15 m (requiere cable activo o extensor sobre Ethernet). **Si igual hay que pasar un cable, pasar ETHERNET, no HDMI:** mismo trabajo de obra, aguanta 100 m, cable más barato, y deja red real en la cocina con el TV box funcionando independiente de la caja. **Advertencia comercial:** casi siempre el problema no es que "no se pueda llevar internet" sino que **el WiFi es malo**; un repetidor o punto mesh resuelve la mayoría de casos a bajo costo. Diagnosticar el WiFi ANTES de proponer obra.
    - **GUÍA DE COMPRA — ¿el TV necesita puerto de red? (duda de Sergio):** en el montaje con TV box **el televisor es solo un monitor**; quien se conecta a la red es la CAJITA, no el TV. Entonces lo que importa es que **el TV box tenga puerto Ethernet**: los TV box Android genéricos casi todos lo traen; Raspberry Pi y mini PC también; **el Fire Stick NO lo trae** (es el más vendido y justo el que no sirve por cable sin adaptador oficial); Chromecast/Google TV depende del modelo. **Regla al recomendar:** si el local va por cable, exigir TV box CON puerto de red (cuestan casi igual). **Excepción donde el TV sí manda:** si el televisor es **Android TV / Google TV**, puede instalar la APK **directamente sin cajita** — y la mayoría de esos modelos traen Ethernet. **OJO:** los **Samsung (Tizen) y LG (webOS)** son "smart" pero **NO pueden instalar una APK de Android** → con esos siempre hace falta la cajita, aunque el TV tenga puerto de red. **Primera pregunta al asesorar a un cliente: ¿tu TV es Android TV / Google TV?** Si sí, se ahorra la cajita.
    - **RECOMENDACIÓN DE MONTAJE (respuesta a "¿cómo lo hacen los restaurantes?" y "¿cómo llega si la cocina está lejos?"):**
      · **La distancia NO importa.** A diferencia de los POS viejos (que llevaban un cable serial/USB hasta la impresora de cocina), Cobra POS es web + Supabase en la nube con realtime. La pantalla de cocina **no se conecta a la caja**: se conecta a internet y recibe los pedidos igual que cualquier otro dispositivo. Lo único que importa es que **haya WiFi en la cocina**.
      · **Montaje típico y más barato:** un **TV** en la cocina + un **aparato chico** que abra el navegador (Android TV box, Fire Stick, Raspberry Pi o mini PC). Alternativa: **tablet montada en la pared** (más barata, pantalla más chica). Se descarta hardware KDS comercial (caro e innecesario aquí).
      · **Lo que hay que dejar resuelto en el software:** (1) **modo kiosco** — que arranque solo en la pantalla de cocina, sin teclado ni navegación; (2) **sesión que no expire** o auto-login, porque en cocina nadie va a volver a iniciar sesión; (3) **pantalla siempre encendida** (bloquear el ahorro de energía); (4) **auto-reconexión** si se cae el WiFi (realtime + un refresco de respaldo) — nadie en cocina va a arreglar una pantalla congelada; (5) **rol "Cocina" de solo lectura** usando el sistema de permisos que ya existe, para que ese equipo no pueda alterar nada.
      · **El cuello de botella real es el WiFi**, no el software: las cocinas tienen paredes, acero y calor. Puede hacer falta un repetidor o punto mesh. Vale la pena advertírselo a cada restaurante al vender la función.
      · **Ubicación física:** lejos del fogón y de la grasa; si es tablet, con protección.

## HECHO 2026-07-24 — Ícono del ejecutable + PENDIENTE instalador para vender

**Ícono cambiado a azul oscuro** (antes rojo). Se eligió `appicon_oscuro` (cuadrado redondeado, azul marino oscuro, cobra blanca) del Manual de Marca (`COBRA_Brand_Package/04_App_Favicon/`). Generado `.ico` multi-tamaño (16→256) con PIL.
- **Aplicado (ícono de la VENTANA / barra de tareas)** en las 3 ubicaciones: proyecto fuente `C:\Prueba Claude Code\cobra-pos-electron`, instalación del acceso directo del escritorio (`...\dist\Cobra POS-win32-x64\`), e instalación del menú inicio (`C:\Users\USUARIO\AppData\Local\Cobra POS\`). En cada `resources/app/resources/icon.ico` (respaldo `.bak-20260724`) + se agregó `icon: path.join(__dirname, "resources", "icon.ico")` a la ventana principal en `main.js`.
- **OJO:** hay que CERRAR y volver a abrir la app por completo para ver el ícono nuevo (Windows cachea el ícono de la barra de tareas).
- **RESUELTO (sin rcedit):** el ícono de la VENTANA (via icon.ico en main.js) también lo tomó la barra de tareas; y el del ESCRITORIO se arregló apuntando el IconLocation del acceso directo (.lnk) al icon.ico nuevo. Los tres (ventana, escritorio, barra de tareas) se ven azul oscuro. No hizo falta tocar el binario. El ícono incrustado en el .exe quedará 100%% correcto igual cuando se arme el instalador.

**PENDIENTE — Instalador profesional para vender.** Hoy el `.exe` se instaló copiándolo directo (portable). El proyecto fuente YA está casi listo con electron-builder:
- `package.json` → `build.win.icon: "resources/icon.ico"` (ya apunta al ícono nuevo), bloque `nsis` configurado (oneClick:false, elegir carpeta, accesos escritorio+menú inicio), y **`electron-updater` ya está como dependencia** (auto-actualización lista).
- **Falta:** cambiar `build.win.target` de `"portable"` a `"nsis"` y correr `npm run build`. Genera un instalador que pone el ícono bien en TODOS lados (exe, instalador, accesos), permite desinstalar limpio y habilita auto-update. Momento de fijar la firma de código si se quiere evitar el aviso de SmartScreen.

**PENDIENTE — Ícono de la APK (tablet).** Sergio quiere el mismo ícono azul oscuro en la APK de Capacitor. Regenerar los íconos de Android (mipmap) desde `appicon_oscuro` y reconstruir la APK.

---

## HECHO 2026-07-24 — Notas frecuentes — IMPLEMENTADO (commit 57b6d6e)

Chips de notas repetidas (sin cebolla, solo BBQ) al personalizar el plato, creadas en Configuracion → Operacion.
- **Config:** seccion "Notas frecuentes" (Seccion 4c) con interruptor **Globales / Por categoria**. Global = una lista; Por categoria = un editor de notas por cada categoria de productos. Se guarda en `operacion_config.notasFrecuentes = {modo, global:[], cats:{catName:[...]}}` (sincroniza a tablet/exe via pos-core).
- **Tomar pedido (`tomar-pedido.js` renderPM):** encima de "Nota para cocina" un selector: solo se ven las notas ELEGIDAS + boton "+ Nota frecuente". El boton abre un popover con **buscador** y **Mas usadas** (uso guardado en `localStorage pos.notas.uso`). Escala a muchas notas sin saturar la pantalla.
- **Modelo:** la nota final es una lista separada por comas en `TP_WIP.note` (los chips togglean tokens); reusa la nota que ya existia → **se imprime igual en la comanda, sin cambios de impresion**. En modo "cat" muestra solo las notas de la categoria del plato.
- **Sin notas configuradas → el selector no aparece** (wrap vacio), cero impacto en el flujo actual.
- Pendiente de validar en hardware/tablet con datos reales.

---

## PENDIENTE — [Inventario] Productos de REVENTA (no requieren preparación) — diseño acordado con Sergio 2026-07-24

Para productos que se venden tal cual (gaseosa, agua, cerveza, papas de paquete), NO armar una receta con ingredientes. Manejarlos por el MISMO motor de inventario/recetas pero como una relación **1:1** (1 unidad de producto = 1 unidad de su ítem de inventario), con un atajo para no llenar recetas.

**Por qué unificado (no un sistema aparte):** un solo lugar para costo y stock; los reportes (costo de ventas, alertas de stock bajo, márgenes) funcionan igual para comida preparada y para bebidas; nada duplicado.

**UX propuesta:**
- En el editor del producto, un interruptor **"Producto de reventa (no requiere preparación)"**.
- Al activarlo, el sistema crea/enlaza automáticamente un ítem de inventario del mismo nombre y arma la receta 1:1 por debajo (el gerente NO ve un formulario de receta).

**Al crear el INSUMO de reventa (confirmado con Sergio):** se registra por **paquete de compra**, no por unidad —
- **Precio del paquete completo** (ej. paca de 30 gaseosas = $30.000).
- **Unidades por paquete** (ej. 30).
- El sistema calcula solo el **costo por unidad** = precio_paquete / unidades (ej. $1.000). Ese es el costo que entra a las ganancias.
- **El stock se cuenta en UNIDADES** (no en pacas): vender 1 → stock -1.
- **Al surtir:** "recibí N pacas" → stock += N × unidades_por_paquete. Si cambió el precio de la paca, se actualiza ahí y el costo por unidad se recalcula solo.

**Revisar en implementación:** `pos_ingredients` ya tiene `purchase_unit`, `stock`, `min_stock`. Falta ver si guarda "precio de paquete" + "unidades por paquete" (para derivar costo unitario) o si hay que agregar esos campos. Encaja con el sistema de recetas ya construido (`iv_recetas`, `iv_porciones`).

---

## PENDIENTE — [Inventario] Productos de REVENTA (no requieren preparación) — diseño acordado con Sergio 2026-07-24

Para productos que se venden tal cual (gaseosa, agua, cerveza, papas de paquete), NO armar una receta con ingredientes. Manejarlos por el MISMO motor de inventario/recetas pero como una relación **1:1** (1 unidad de producto = 1 unidad de su ítem de inventario), con un atajo para no llenar recetas.

**Por qué unificado (no un sistema aparte):** un solo lugar para costo y stock; los reportes (costo de ventas, alertas de stock bajo, márgenes) funcionan igual para comida preparada y para bebidas; nada duplicado.

**UX propuesta:**
- En el editor del producto, un interruptor **"Producto de reventa (no requiere preparación)"**.
- Al activarlo, el sistema crea/enlaza automáticamente un ítem de inventario del mismo nombre y arma la receta 1:1 por debajo (el gerente NO ve un formulario de receta).

**Al crear el INSUMO de reventa (confirmado con Sergio):** se registra por **paquete de compra**, no por unidad —
- **Precio del paquete completo** (ej. paca de 30 gaseosas = $30.000).
- **Unidades por paquete** (ej. 30).
- El sistema calcula solo el **costo por unidad** = precio_paquete / unidades (ej. $1.000). Ese es el costo que entra a las ganancias.
- **El stock se cuenta en UNIDADES** (no en pacas): vender 1 → stock -1.
- **Al surtir:** "recibí N pacas" → stock += N × unidades_por_paquete. Si cambió el precio de la paca, se actualiza ahí y el costo por unidad se recalcula solo.

**Revisar en implementación:** `pos_ingredients` ya tiene `purchase_unit`, `stock`, `min_stock`. Falta ver si guarda "precio de paquete" + "unidades por paquete" (para derivar costo unitario) o si hay que agregar esos campos. Encaja con el sistema de recetas ya construido (`iv_recetas`, `iv_porciones`).

---

## PENDIENTE — [Contabilidad] El domicilio infla las ventas (pass-through al domiciliario) — Sergio 2026-07-24

**Problema:** hoy `pos_orders.total = comida + empaque + domicilio` (domicilios.js:1539), y el dashboard suma `o.total` en TODAS las métricas de ventas (dashboard.js:181,242,258-260,687,701,897). Por eso el **domicilio se cuenta como venta**. En el caso de Sergio el domicilio NO es ingreso suyo: el cliente le paga todo (ej. por transferencia) y él le pasa el valor del domicilio al domiciliario. Resultado: ventas infladas por la suma de los domicilios.

**Lo que Sergio SÍ quiere conservar:** en el desglose por método de pago, la transferencia debe seguir mostrando el monto COMPLETO (ese dinero sí entró). No reducir la transferencia.

**Propuesta (aprobada en concepto, faltan 2 detalles):**
1. **Ventas reales = total − delivery_fee** (sacar el domicilio de las métricas de venta del dashboard). Métodos de pago quedan completos.
2. **Registrar el domicilio como EGRESO** usando el sistema que la caja YA tiene (movimientos ingreso/egreso; cierre = base + ventasEf + ingresos − egresos, ver caja.js:432,434,1055). Así la caja cuadra (el efectivo que sale para pagar al domiciliario queda registrado) y se ve "pagado a domiciliarios" del turno.
3. Opcional: tarjeta resumen "Domicilios cobrados vs pagados a domiciliarios".

**Preguntas por confirmar con Sergio:** (a) ¿el domicilio SIEMPRE es del domiciliario o a veces es ingreso propio (repartidor a sueldo)? → si a veces es propio, hace falta un interruptor. (b) ¿el egreso del pago al domiciliario se registra AUTOMÁTICO (por cada domicilio) o MANUAL (cuando de verdad paga)? Sergio se inclina por: siempre del domiciliario + automático (por confirmar).

---

## HECHO/PENDIENTE 2026-07-24 — GRANTs faltantes (patrón repetido)

**HECHO:** `pos_cash_moves` (ingresos/egresos de caja) NO tenía GRANT de SELECT/INSERT/UPDATE/DELETE para el rol `authenticated` → la función de egresos daba "Error al registrar movimiento" y no cargaba movimientos. Se aplicó `GRANT SELECT,INSERT,UPDATE,DELETE ON pos_cash_moves TO authenticated`. Diagnóstico: RLS estaba OK (allow_all/public/true) y el esquema OK; el bloqueo era a nivel de GRANT de tabla (Postgres rechaza antes de RLS). El superusuario del API ignora GRANTs, por eso el insert de prueba funcionaba pero el cliente no.

**Es el SEGUNDO caso** del mismo bug (antes: `iv_porciones`). **PENDIENTE: barrido de GRANTs** — revisar TODAS las tablas `pos_*` e `iv_*` y confirmar que `authenticated` tiene los permisos que la app necesita (normalmente SELECT/INSERT/UPDATE/DELETE). Query base: `select table_name, string_agg(privilege_type, ',') from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' group by table_name`. Corregir las que les falte, para que no salte otro error en pleno servicio.

**Nota:** la RLS de varias tablas es `allow_all`/`true` (sin aislamiento por tenant). Eso es parte del pendiente de "Blindaje interior (RLS de negocio)" de abajo — al granting no empeoramos nada respecto al patrón actual, pero conviene endurecerlo cuando se haga multi-marca.

---

## 🔴 URGENTE MAÑANA — [Venta sin inventario] Detectar agotamiento por VARIANTE/TAMAÑO, no por producto — Sergio 2026-07-24

**Problema:** la función de "venta sin inventario" (pos-stock.js) detecta el agotamiento a nivel de PRODUCTO: marca el producto agotado si CUALQUIER insumo de su receta está en 0. Pero ignora `iv_recetas.variant_option_id` y las presentaciones. Caso real de Sergio: "Jugo Hit" tiene 2 tamaños (litro / personal) y 5 sabores (variables). Solo están agotados algunos sabores en algunos tamaños, pero el sistema marca TODO el Hit como agotado.

**Lo que quiere Sergio:** que el bloqueo/aviso salga al tocar la **variable/tamaño específico** (dentro del modal de personalización), NO al tocar el producto completo. Ej.: el Hit se puede seleccionar; al elegir "Personal · Mango" (agotado) → ahí bloquea/avisa; "Litro · Mora" (con stock) → pasa normal.

**Dirección técnica:**
- `pos-stock.js`: hoy mapea `product_id → {insumo_ids}` (junta todas las variantes). Cambiar a mapear por **(product_id, variant_option_id)** — y considerar presentaciones si la receta define cantidades por presentación (`cantidades` jsonb). Exponer algo como `posStock.agotadoVariante(prodId, variantOptId, presId)` y `faltantesVariante(...)`.
- El chequeo debe moverse del clic en la TARJETA (openProductModal/vrOpenProductModal en las 3 pantallas) a la **selección de la variante/presentación DENTRO del modal** (tomar-pedido.js, venta-rapida.js, domicilios.js — el paso donde se eligen presentación y opciones de variable).
- La TARJETA del producto: solo mostrar "Agotado" si TODAS las combinaciones (todas las variantes×tamaños) están agotadas; si solo algunas, no marcar el producto o poner un indicador suave ("algunas opciones agotadas"). Confirmar con Sergio el comportamiento visual de la tarjeta cuando es parcial.
- Reusar la lógica de receta por variante/presentación que ya existe en inventario (presDe/opcionesDe/qtyLinea/lineaAplica en inventario.js).

**Contexto:** el detector actual (pos-stock.js) + su conexión en las 3 pantallas quedó de la sesión 2026-07-24 (commits 5acec44, 1a7916e). Esto es afinar ese mismo sistema para que sea por variante.

---

## PENDIENTE GRANDE — [Inventario] Sub-inventario / inventario en DOS NIVELES (Bodega vs En servicio) — Sergio 2026-07-24

**Problema real:** "tener el insumo" no es lo mismo que "tenerlo listo para vender". Ej.: hay carne pero está CRUDA (no se cocina toda el mismo día); hay bebidas en bodega pero las que se venden son las de la NEVERA (frías). El sistema hoy solo ve el total → puede decir "hay carne" cuando está cruda, o "hay gaseosa" cuando las frías ya se acabaron.

**Modelo propuesto (por confirmar detalles con Sergio):**
- Dos cantidades por insumo: **Bodega** (total comprado/crudo/almacenado) y **En servicio** (listo para vender: cocido, en nevera).
- Acción **"Surtir"**: mover cantidad de Bodega → En servicio.
- Las ventas descuentan de **En servicio**.
- Cuando En servicio = 0 pero hay en Bodega → según un **interruptor "permitir vender de bodega"**:
  - OFF → se trata como agotado (bloquea, reusa el sistema de venta-sin-inventario ya hecho).
  - ON → deja vender pero muestra un **AVISO personalizable** (ej. "Bebida al clima, se acabó en la nevera" / "Requiere preparación, queda solo en bodega").
- **Personalizable por restaurante:** cada insumo/producto decide si usa los dos niveles (no todos lo necesitan) y define su propio texto de aviso.

**Se conecta con:** la función "venta sin inventario" (pos-stock.js, sesión 2026-07-24) — es el siguiente nivel de la misma idea. Y con el modelo de stock por compra/unidad ya hecho.

**Preguntas por confirmar con Sergio (planteadas 2026-07-24):** (1) ¿nivel "en servicio" por INSUMO o por PRODUCTO? (recomendado: por insumo). (2) ¿ver los dos números en inventario + botón "Surtir"? (3) ¿el interruptor "vender de bodega" es GLOBAL o por producto/insumo? Nota: ya existe `iv_insumos.prep_requerido` (boolean) que quizá se pueda reaprovechar como marca de "requiere preparación".

---

## PENDIENTE — [Inventario] Habilitar el % de merma POR INSUMO (falta el campo) — hallazgo 2026-07-24

**Estado:** el modelo YA soporta merma por insumo: `iv_recetas.merma` (por línea) y la fórmula de costeo la usa (`costo = qty × costoPorUr × (1 + l.merma/100)`, inventario.js:114 y :1883). PERO no hay UI para editar ese %: las líneas nuevas se crean con `merma:0` (inventario.js:957,2408,2423) y el único control es el **interruptor global "Incluir merma"** (Sí/No) en Parámetros. Resultado: hoy todo está en 0% → el interruptor global no hace nada.

**Falta:** agregar un **campo de % de merma por insumo** en el editor de receta (al lado de la cantidad de cada línea), para poder poner queso 2%, pollo 25%, etc. Guardar en `iv_recetas.merma`. El interruptor global se queda como on/off maestro.

**Distinción importante (Sergio 2026-07-24):** esta merma es de **DESPERDICIO** (recortes/cáscaras que botas → suben el costo). NO confundir con la **merma de COCCIÓN/rendimiento** (el pollo pierde ~20-25% de peso al cocinarse) — esa se maneja con el sub-inventario en dos niveles (crudo en bodega → cocido en servicio), no con este %.

---

## PENDIENTE — [Inventario] Control MANUAL de disponibilidad por insumo ("86" / el cocinero avisa) — Sergio 2026-07-24

**Contexto real:** la cocinera (mamá de Sergio) NO puede pesar antes de cocinar (a veces cocina en pleno turno). Para pollo y carne, contar por gramos no es viable. Solución de Sergio (= patrón estándar de restaurantes, "86 the item"): que ciertos insumos se controlen MANUALMENTE — el sistema los da por disponibles hasta que la cocina avise que se acabaron.

**Modelo propuesto:**
- **Flag por insumo: "Control manual (el cocinero avisa)"** (nuevo campo en `iv_insumos`, ej. `control_manual` boolean). Insumos con este flag: el sistema NUNCA los marca agotados por cantidad; se asume que hay.
- **Estado manual de disponibilidad** por insumo (ej. `disponible` boolean, o `agotado_manual`). Un botón/toggle rápido "Se acabó / Ya hay".
- **La detección de agotados (pos-stock.js) combina 2 fuentes:** insumos automáticos → agotado si stock<=0 (como hoy); insumos manuales → agotado SOLO si lo marcaron. Un producto es agotado si CUALQUIER insumo suyo lo está (por cantidad o por marca manual).
- **Reusa el interruptor "permitir vender sin inventario"** ya hecho: al marcar agotado, bloquea o avisa según esa política.

**Dónde se marca (crítico, debe ser 1 toque en pleno servicio):** ideal en la **pantalla de cocina (KDS)** cuando se construya; y/o una lista/botón rápido de disponibilidad accesible para mesera/cajera (el cocinero tiene las manos ocupadas). Que lo pueda marcar cualquiera apenas escuche "se acabó el pollo".

**CONFIRMADO (Sergio 2026-07-24):**
- **Quién marca "se acabó": la CAJERA** (o rol autorizado — NO cualquier mesero, para no marcarlo por error). Protegido con permiso (posGuard). El cocinero avisa de viva voz, la cajera hace el cambio.
- **Comportamiento: BLOQUEA de verdad** para todos hasta reactivar (no solo avisar). Se reactiva cuando vuelve a haber.
- **REQUISITO CLAVE — sincronización en TIEMPO REAL:** la cajera marca en su pantalla y las tablets de TODOS los meseros se bloquean solas en 1-2s, sin recargar. Reusar el realtime que ya existe (pos-realtime.js, el mismo de los pedidos a cocina). El estado de disponibilidad (`disponible`/`agotado_manual` en `iv_insumos`) se propaga por realtime a las pantallas de venta (pos-stock.js debe re-evaluar y re-render al recibir el cambio).

**REFINAMIENTO (Sergio 2026-07-24) — DOS agotados distintos para estos insumos:**
- **BODEGA (crudo): control AUTOMÁTICO.** El insumo crudo sí se agrega con su costo/kg. El sistema calcula el costo en cada producto (gramos de la receta) y **descuenta de la bodega con cada VENTA** (no requiere pesar: la receta define los gramos, las ventas hacen la cuenta). Sirve para el **aviso de "comprar más"** cuando la bodega baja. Es un estimado, suficiente para reponer.
- **COCINA (cocido/listo): control MANUAL** (el cocinero avisa). Esto es lo que **bloquea/avisa la VENTA** en el momento. El sistema no lo adivina.
- **Edge por confirmar:** si la BODEGA llega a 0 (no hay ni crudo) → recomendación de Claude: que ahí SÍ bloquee automático (tope real). Sergio por confirmar.
- Implicación: para un insumo con "control manual", el agotado de VENTA = marca manual del cocinero (y opcionalmente bodega<=0). El agotado de COMPRA (alerta de reponer) = bodega baja, automático por ventas.

**Relación:** es la alternativa PRÁCTICA al sub-inventario (bodega vs servicio) para insumos que no se pueden pesar/contar. Complementa "venta sin inventario" (pos-stock.js, ya hecho) y su afinamiento por variante (urgente).

---

## PENDIENTE — Gestión de MARCAS (multi-marca) — pedido por Sergio 2026-07-24, para DESPUÉS de los fáciles

**Contexto:** el sistema se vende a dueños con UNA marca o VARIAS (ej. una heladería + un restaurante bajo el mismo dueño, pero independientes por dentro). Cada marca crea sus sucursales (eso ya funciona). Falta la **creación/gestión de marcas** y dividir bien qué configuración es por-marca vs por-sucursal.

**Lo que YA existe en la base (verificado 2026-07-24):** la jerarquía completa `tenants → brands → branches` ya está.
- `tenants`: id, name, email, **plan**, status, stripe_customer_id. → El PLAN vive aquí.
- `brands`: id, **tenant_id**, name, **logo_url**. → La tabla de marcas YA EXISTE.
- `branches`: id, **brand_id**, tenant_id, name, operacion_config (jsonb)... → Las sucursales ya cuelgan de una marca.
- `pos_roles`: id, **tenant_id**, name, perms[]. → Hoy los roles son por TENANT (compartidos por todas las marcas).
- `pos_users`: id, **branch_id**, tenant_id, role, role_id, **sucursales[]** (multi-sucursal).

**Conclusión:** crear marcas NO requiere rehacer el esquema — es sobre todo **construir la UI** en Configuración (del gerente/dueño) para crear/listar marcas, validando el plan. El único cambio de esquema recomendado es agregar `brand_id` a `pos_roles`.

**Plan de implementación (para cuando se retome):**

1. **Pantalla "Marcas" en Configuración** (solo dueño/gerente, con `posGuard`): listar las marcas del tenant (`select from brands where tenant_id = ...`), crear nueva (`insert into brands`), editar nombre/logo, y un selector de "marca activa" para el resto de la app.

2. **Validar el plan al crear marca:** contar `brands` del tenant y comparar con el límite de `tenants.plan` (definir la tabla de límites por plan: p.ej. `basico`=1 marca, `multi`=N). Si excede → mensaje "Tu plan permite N marcas; mejora el plan". No dejar crear de más.

3. **Roles → pasar a por-marca:** agregar columna `brand_id uuid null` a `pos_roles`. **Nullable a propósito:** `null` = plantilla compartida del tenant (defaults: admin, gerente, cajera, mesero); con `brand_id` = rol propio de esa marca. Razón: marcas distintas tienen cargos distintos (heladería: "despachador"; restaurante: "mesero"). `pos-perms.js` ya resuelve perms por rol; habría que filtrar los roles disponibles por la marca activa.

4. **Usuarios → mantener por sucursal:** la sucursal ya implica la marca (`branches.brand_id`), así que no hace falta duplicar. En la UI de crear usuario: elegir **marca → sucursal → rol** (rol y sucursal ya filtrados por la marca elegida). El array `sucursales[]` sigue permitiendo multi-sucursal dentro de una marca.

5. **Dividir configuración por-marca vs por-sucursal:**
   - **Por MARCA:** menú/catálogo (`pos_products`/`pos_categories` — hoy cuelgan de branch/tenant, revisar), roles, logo/branding (`brands.logo_url`), defaults de impuestos/propina.
   - **Por SUCURSAL:** mesas y zonas, meta diaria (`daily_goal`), impresoras, cobro adelantado, horarios. (Todo lo que hoy vive en `branches.operacion_config`.)
   - Revisar dónde cuelga hoy el catálogo de productos: si es por branch, para multi-marca conviene moverlo/duplicarlo por marca.

6. **Conexión con el #24 (logo del negocio):** el logo NO debe ir en `operacion_config` sino en **`brands.logo_url`** (columna que ya existe). Al implementar el #24, guardarlo ahí → queda automáticamente por-marca y reutilizable. Actualizar el plan del #24 con esto.

**Riesgo/ojo:** al tocar el alcance de roles y catálogo se puede romper el aislamiento entre tenants/marcas. Hacerlo junto con el "Blindaje interior de permisos (RLS)" de la sección de abajo, para que una marca no vea datos de otra.

**7. [DISEÑO clave — pedido por Sergio 2026-07-24] Switch de marca + "contexto activo" (que TODA la config sea independiente por marca).**
Idea de Sergio: un botón junto al desplegable del gerente con las marcas creadas; al hacer switch, absolutamente todo (roles, impresoras, catálogo, mesas, etc.) cambia a los datos de esa marca. Es el enfoque correcto y es lo que habilita "todo por marca".

- **Hallazgo (verificado 2026-07-24):** hoy la sucursal NO es un contexto conmutable — está pegada al login de cada usuario. Medición: 7 archivos usan el central `window._pos.state.branchId`, pero **12 leen `user_metadata.branch_id` por su cuenta** (`catalogo-productos.js, configuracion.js, dashboard.js, domicilios.js, informes.js, inventario.js, onboarding.js, pos-perms.js, reservas.js, tomar-pedido.js, venta-rapida.js`, + pos-core.js). Ese es el verdadero obstáculo del switch.
- **El esquema NO se rehace:** los datos ya están separados por `branch_id`/`tenant_id`, y las sucursales ya cuelgan de `brands`. Es re-enrutar, no reconstruir.
- **Plan:**
  1. **Un solo "contexto activo" (brandId + branchId)** como fuente de verdad, en `pos-core.js` (`_pos.state.brandId` + `_pos.state.branchId`), persistido en localStorage, con default = la sucursal del usuario. Este es el corazón.
  2. **Botón de switch** junto al desplegable del gerente: lista `brands` del tenant; al elegir una, fija el contexto y recarga. Todo lo existente reaparece con los datos de esa marca.
  3. **Re-enrutar las 12 pantallas** que hoy leen `user_metadata.branch_id` para que lean el contexto central. Es el 90% del trabajo — mecánico, bajo riesgo, pantalla por pantalla.
  4. Agregar `brand_id` a roles (paso 3 de arriba) y revisar alcance del catálogo (paso 5 de arriba).
  5. **Permisos:** el switch solo lo ve el dueño/gerente con acceso multi-marca; un cajero atado a una sucursal NO cambia de contexto.
- **Nivel de esfuerzo:** MEDIO. El botón de switch es el 10% fácil; el 90% es que cada pantalla obedezca el contexto en vez del login. No es rewrite, pero tampoco es rápido. Hacerlo de una sola vez, no a medias (un contexto de sucursal incompleto puede mezclar datos).
- **Aclaración de niveles:** una marca tiene VARIAS sucursales → el switch es de 2 niveles (marca, y dentro sucursal). Diseñar: cambiar de marca cae en su única/primera sucursal, con sub-selector si hay más. Confirmar con Sergio si sus dueños suelen tener 1 o varias sucursales por marca.

**8. [REGLAS confirmadas por Sergio 2026-07-24 — quién hace switch y cómo se crean usuarios/roles]**
- **Solo el gerente hace switch.** Los demás roles quedan atados a UNA marca y no perciben el switch — cada usuario ve únicamente su marca (su restaurante o su heladería).
- **Roles por marca:** el gerente hace switch a una marca y crea los roles DENTRO de esa marca (`pos_roles.brand_id` = marca activa). Los roles de una marca y otra son independientes, jamás se mezclan. (Refuerza el paso 3.)
- **Usuarios atados a la marca activa:** al crear un usuario estando en una marca, queda vinculado a esa marca/sucursal. Cuando esa cajera/mesero inicie sesión, solo ve lo de su marca.
- **Formato del correo de login (auto):** el gerente escribe el **nombre** (ej. "Luis López") y el **nombre de usuario** (ej. "luislopez"); **lo de después de la `@` se genera solo a partir del nombre de la marca**. Ej.: marca "El Parche Food" → `luislopez@elparchefood.com`; marca heladería → `claudiagonzalez@delihelados.com`.
  - **Regla del dominio:** slug del nombre de la marca (minúsculas, sin espacios ni tildes) + `.com`. Guardar el dominio resultante en la marca (columna nueva `brands.email_domain`, o derivarlo del `name` al vuelo) para que sea estable aunque se renombre la marca. Ideal: campo editable por si el slug automático no gusta.
  - **Ventaja:** como el dominio cambia por marca, el mismo nombre de usuario puede repetirse en marcas distintas sin colisión (`luislopez@elparchefood.com` ≠ `luislopez@delihelados.com`).
  - **Solo identificador de login:** ese correo es usuario+clave, NO un buzón real. Requiere tener DESACTIVADA la confirmación por email en Supabase Auth. Validar unicidad dentro de la marca (si el correo ya existe → avisar "ese usuario ya existe").
  - **Implementación:** el alta de usuario ya crea un `auth.users` + fila en `pos_users` (ver flujo actual de creación de usuarios); solo hay que componer el email = usuario + '@' + dominio_de_marca_activa, y setear `brand_id`/`branch_id` del contexto activo.

**9. [DECISIÓN 2026-07-24 — DESCARTADO el multimarca-empleado. Se eligió OPCIÓN B: un usuario por marca.]** Se evaluó rol/usuario multimarca (un login + switch para empleados) vs. credenciales separadas por marca. **Elegido: B (separadas).** Razones: mucho menos código y riesgo, aislamiento perfecto (cada sesión = una sola marca, imposible mezclar datos), correo simple (1 usuario = 1 marca = 1 dominio). **El switch queda SOLO para el gerente/dueño.** Un empleado que trabaje en 2 marcas tendrá 2 logins (uno por marca) — se acepta ese costo. El multimarca-empleado queda como posible mejora v2 si algún día molesta. Lo de abajo (tabla puente, switch para no-gerentes, correo de marca de origen) queda SÓLO como referencia histórica, NO se implementa.

**[Referencia histórica — NO implementar, ver decisión arriba] usuario/rol MULTIMARCA**
Excepción a "solo el gerente hace switch": un usuario/rol puede trabajar en VARIAS marcas (ej. un cajero que atiende el restaurante Y la heladería).
- **Botón "Asignar multimarca"** (lo usa el gerente al crear/editar el rol o el usuario): le da acceso a 2+ marcas.
- **El usuario multimarca SÍ puede hacer switch** (desplegable arriba a la derecha, igual que el gerente), pero SOLO entre las marcas que le asignaron. Al iniciar sesión cae por defecto en una de ellas.
- **En cada marca ve únicamente sus permisos** (lo que el gerente le habilitó vía la tabla de permisos de esa marca). El sistema de permisos ya existente se aplica por marca activa.
- **Regla real del switch (reformulada):** NO es "gerente sí / los demás no". Es **"quien tenga más de una marca asignada puede hacer switch"**. El gerente/dueño las tiene todas; un cajero multimarca tiene las que le dieron; un rol normal tiene una sola → sin switch.
- **Correo de un usuario multimarca (respuesta a la duda de Sergio):** el dominio se toma de la **marca de origen** (la marca activa cuando se creó el usuario). Ej.: cajero creado en el restaurante → `luislopez@elparchefood.com`, aunque también atienda la heladería. Razón: el correo es solo identificador de login (no limita el acceso), así que no necesita reflejar todas sus marcas; con ser único y estable basta. Alternativa descartada: dominio neutro a nivel de cuenta (mete un concepto nuevo sin necesidad).
- **Modelo de datos:** un usuario ya no está atado a UNA sola marca → necesita una LISTA de marcas asignadas. Opciones: array `brands[]` en `pos_users`, o tabla puente `pos_user_brands (user_id, brand_id, role_id)` (más flexible: permite un rol/permiso distinto por marca). Recomendado la tabla puente, porque encaja con "en cada marca ve solo los permisos que le dieron ahí" (rol distinto por marca). El switch del usuario lista solo las marcas de esa lista. La `marca de origen` (para el dominio del correo) se guarda aparte (ej. `pos_users.home_brand_id`).

---

## PENDIENTE — Blindaje interior de permisos (RLS de negocio) — aprobado para DESPUÉS

Sergio (2026-07-23) aprobó hacer AHORA el arreglo de permisos del lado de la app (bloquear acciones en la interfaz) y dejar para después el blindaje contra alguien que sepa de código y quiera saltarse la interfaz por fuera (ej. llamar la API directo para hacer un fraude — anular un pago, aplicar un descuento sin permiso, ver ventas de otra caja).

**Qué implica (proyecto separado, más grande y delicado):** políticas RLS de NEGOCIO en Supabase que validen el permiso del rol del usuario ANTES de permitir cada operación sensible (`pos_payments` insert/delete, `pos_orders` update de status/descuento, `pos_roles`, `pos_users`, lectura de ventas de otras sesiones). Hoy las RLS existentes solo aíslan por tenant/branch, no por permiso de rol. Requiere una función SQL que lea el rol del `auth.uid()` y sus `perms`, y aplicarla en cascada. Es lo que convierte los permisos de "candado visual" en "candado real". No mezclar con el arreglo de UI para no arriesgar la operación diaria.

## PENDIENTE — Modo Gerente en el bot IA (propuesto y aprobado, sin implementar)

**Qué es:** un número de teléfono (o lista) configurado como "administrativo". Cuando el bot recibe un WhatsApp DE ese número, no lo atiende como cliente: entra en una rama aparte donde el gerente puede (a) **consultar** inventario ("¿cómo está el pollo?", "¿qué falta comprar?", "¿qué se va a acabar?", precios, ventas del turno) y (b) **registrar compras** por chat ("compré 5 kilos de pollo a 21 mil") que suben stock y actualizan precio, igual que el botón "Registrar compra" del inventario.

**Estado:** propuesta aprobada por Sergio 2026-07-22; NO implementado. Sergio revisa el resto de la plataforma primero y avisará cuándo arrancar. Se hará por etapas: (1) solo consultas — riesgo cero, no escribe nada; (2) registrar compras con confirmación; (3) opcional, ajuste de stock por conteo físico.

**Dónde va (ya mapeado):** en `delay_reply.ts`, un bloque nuevo ENTRE el paso 5 (cargar `ia_config`) y el paso 6 (detectar carta), con la misma mecánica de los pasos existentes: `if (numeroEsGerente) { …responder…; return; }`. El `return` corta antes de llegar al flujo de pedidos.

**Garantía de no-regresión:** el flujo del cliente NO se modifica. Para un cliente normal la condición es falsa y el código lo salta. El único riesgo real es un error de sintaxis que impida arrancar el EF (ya pasó una vez → 503 por código muerto); se maneja con prueba interna + verificación de que un cliente normal sigue respondiendo igual + el bloque envuelto en try/catch que, ante cualquier error, deja pasar el mensaje al flujo normal.

**Config:** `ia_config.gerente` — lista `[{nombre, telefono, puede_consultar, puede_registrar}]`. Tarjeta nueva en Configuración → Asistente. Los dos permisos separados porque consultar es inofensivo pero registrar re-costea todo el menú.

**Decisiones de diseño tomadas:**
- **GPT no produce ni un número.** Solo entiende la intención y extrae insumo/cantidad/precio de la frase; todas las cifras salen de consulta a la base y la respuesta se arma en código (misma regla del motor de pedidos).
- **Registrar compra SIEMPRE confirma antes de aplicar**, mostrando el impacto en stock y costo, porque `aplicarCompra` REEMPLAZA el precio (no promedia) — "210 mil" en vez de "21 mil" distorsionaría todas las recetas con ese insumo en silencio. Dejar un `deshacer` por unos minutos.
- **Palabra de escape** `modo cliente` / `modo gerente`: Sergio prueba el bot desde su propio WhatsApp; sin escape perdería la posibilidad de simular un pedido.
- **PIN opcional** de 4 dígitos solo para operaciones de escritura, si Sergio lo quiere (el número ya es difícil de falsificar ante Meta, pero un teléfono perdido movería inventario).

**Fuentes de datos que ya existen:** `iv_insumos.stock`/`min_stock`/`precio`/`conversion`, el cálculo de "17 insumos en alerta" del inventario, el turno de caja abierto para ventas. Registrar compra = misma lógica que `aplicarCompra()` en inventario.js.

---

## Bugs conocidos / cosas a vigilar

1. **`configuracion.js` — auto-sync al abrir**: La función `syncToSupabase()` se llama en `DOMContentLoaded`. Si el localStorage tiene datos viejos cuando se abre Configuraciones, puede escribir basura a Supabase. No abrir Configuraciones con localStorage desactualizado.

2. **sort_order=0**: La mesa con `sort_order=0` (actualmente t01) requiere la comparación `!= null` en el sort, no `|| 9999`. Si se añaden mesas nuevas con sort_order=0, pueden quedar al final visualmente.

3. **Órdenes sin cerrar**: Si el flujo de pago no marca una orden como `completed`, reaparecerá como activa la próxima vez que se limpie el filtro. Vigilar que el cierre de orden siempre escriba `status='completed'`.

4. **delay-reply — `last_sender` bloqueado**: Si el EF termina antes del bloque de actualización final (línea ~724), `last_sender` queda en `"contact"` y el bot no vuelve a responder hasta que se resetee manualmente en DB (`UPDATE chat_conversations SET last_sender='agent' WHERE id='...'`). El try-catch de v52 previene este escenario en el bloque isResumen, pero si hay un nuevo error no capturado en otra parte del código, puede volver a ocurrir.
