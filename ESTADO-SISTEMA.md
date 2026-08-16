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
| Cache | **Corregido 2026-08-04** — antes `clearCache()` + `no-store` en cada petición: el programa volvía a bajar las 13-15 piezas de CADA pantalla en CADA navegación (176–379 KB, 1,8–12,5 s medidos). Ahora: los `.html` se revalidan (109 ms) y los `.js`/`.css` salen del disco, porque ya llevan `?v=` que se cambia en cada publicación. **Requiere reconstruir el .exe para que surta efecto.** |
| Links externos | `setWindowOpenHandler` → browser del sistema | ✅ activo |
| **Nivel 2 (app local dentro del .exe)** | `PLAN-NIVEL-2-APP-LOCAL.md` | ⏸️ APLAZADO a propósito hasta consolidar la plataforma. Decisión de Sergio 2026-08-04. **Leer ese documento completo antes de retomarlo.** |

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
| 53 | 2026-07-30 | **Adiciones (modificadores) vinculadas a inventario — costeo + agotado (commits `f82c476`, `b206c15`):** los modificadores (adiciones: tocineta, carne, etc.) ahora pueden llevar receta de insumos, para costearlos y detectar cuándo se agotan. **DB:** `iv_recetas` gana `mod_option_id TEXT` y `product_id` pasa a NULLABLE — una receta apunta a un producto **o** a una opción de modificador. **Fase 1 (inventario.js `?v=1786752000`):** botón "+ Nueva adición" en Recetas → selector en 2 pasos **grupo de modificadores → opción** (lee `pos_modifier_groups.options`, cada opción es `{id:op_xxx,name,price}`) → abre el editor de receta normal. Las adiciones son **pseudo-productos** (`{id:optId, esAdicion:true, modOptionId, precio:precio de la opción, pres:[], grupos:[], receta}`) que reutilizan TODO el motor de costeo (`calcReceta`, `combosDe`, detalle). No crean producto en el catálogo. `loadModGroupsDB()` + `modOptInfo()`; `loadRecetasDB` reconstruye `adiciones[]` desde filas con `mod_option_id`; `findRecetable(id)` = productos ∪ adiciones (reemplaza `productos.find` en editor/detalle/guardar); `guardarRecetaEdit` escribe `mod_option_id` (y `product_id:null`) para adiciones; `renderRecetasList` las incluye (categoría "Adición · [grupo]"). **Fase 2 (pos-stock.js + pantallas de venta `?v=1786752000`):** `pos-stock` carga las líneas con `mod_option_id` en `S._modLines` y expone `modAgotado/modFaltantes/modAvisos(optId)`. En `tomar-pedido`, `venta-rapida` y `domicilios`, cada opción del selector de adiciones se marca **"Agotado"** (clase `.pm-mod-out` + tag rojo) si algún insumo de su receta está agotado; si NO se permite vender sin inventario, el botón "+" se bloquea. Respeta control manual y sub-inventario (nevera/bodega) igual que productos/variantes. **Adición sin receta = nunca se bloquea** (la función es opcional por restaurante). **Nota:** el descuento de stock sigue siendo manual (el sistema no auto-descuenta al vender); la receta de la adición da el dato de consumo y el costeo. **(Superado por la ronda 54: ya descuenta automático.)** |
| 54 | 2026-07-30 | **DESCUENTO AUTOMÁTICO DE INVENTARIO AL VENDER (solo BD, ninguna pantalla tocada):** hasta ahora NINGUNA venta restaba stock — era 100% manual (Sergio lo descubrió al preguntar). Ahora el stock baja solo, **al enviar a cocina** (decisión de Sergio; no al cobrar), y **se devuelve si la venta no es efectiva**. **Tabla nueva `iv_movimientos`** = ledger de auditoría: `{insumo_id, delta (en buy_unit, negativo=consumo), campo('stock'|'servicio'), motivo('venta','anulacion','eliminado','ajuste'), order_id, item_id, reversed}`. La devolución NO recalcula la receta: revierte el `delta` exacto que se registró, así cambiar una receta después no daña las devoluciones de ventas viejas. **Funciones:** `fn_iv_consumir_item(item_id)` — resuelve `selections->>'pres'` (guarda el NOMBRE) al `pres_id` vía `pos_products.presentations`, saca los ids de variante de `selections->'vars'`, y suma: líneas BASE (`variant_option_id IS NULL`) + líneas de la variante elegida + líneas de las adiciones (`mod_option_id` = clave de `selections->'mods'`, por su `qty`); cantidad de receta × `quantity` del ítem; convierte de use_unit a buy_unit (`/conversion`); descuenta de `stock_servicio` si el insumo tiene `sub_inventario`, si no de `stock`. **Idempotente** (si ya hay movimiento `venta` no revertido, no repite → inmune a reintentos/multi-caja/offline). `fn_iv_devolver_item(item_id, motivo)` revierte y marca `reversed`. **Triggers:** `trg_iv_item_cocina` (INSERT/UPDATE de `pos_order_items`: al aparecer `kitchen_printed_at` consume; si cambia `quantity`/`selections` de un ítem ya enviado, devuelve y re-consume = reajuste), `trg_iv_item_borrado` (BEFORE DELETE → devuelve), `trg_iv_orden_anulada` (`pos_orders.status='cancelled'` → devuelve todo; si se reactiva, vuelve a consumir), `trg_iv_orden_borrada`. **Por qué en BD y no en JS:** funciona igual desde mesas, venta rápida, domicilios, el bot de WhatsApp y cualquier pantalla futura, sin duplicar lógica ni depender de que el navegador termine la operación. **Verificado con datos reales (7/7):** Quatro (sub-inventario, conversión 12 → 1 unidad = 0.08333 paq) consumo/idempotencia/devolución; Premium Mixta descuenta Pollo Y Carne, Premium Pollo descuenta SOLO pollo (discriminación por variante); Familiar 150g vs Personal 75g (discriminación por presentación); cambio de cantidad 1→3 reajusta a 0.18; borrar ítem devuelve. Stock quedó idéntico al inicial y se limpiaron los movimientos de prueba. **Corregido en la misma ronda (parte 3, ver abajo): el reparto nevera/bodega.** |
| 54b | 2026-07-30 | **Fix sub-inventario: "vender de bodega" ahora SÍ descuenta de bodega (`sql/…-3-bodega.sql`) — corrige la parte 1 de la ronda 54.** Detectado por Sergio: la versión inicial descontaba TODO de `stock_servicio` cuando el insumo tenía `sub_inventario`, así que al acabarse lo de servicio la nevera se iba a negativo y la **bodega nunca bajaba**, aunque el usuario hubiera aceptado el aviso de "vender de bodega". `fn_iv_consumir_item` reescrita: `de_servicio = LEAST(need_buy, GREATEST(servicio,0))` y `de_bodega = need_buy - de_servicio`; si `vender_bodega=false` todo se carga a servicio (queda negativo = sobreventa visible, la bodega NO se toca — es el comportamiento correcto porque esa venta se bloquea/avisa en la UI). Una venta puede generar **dos movimientos** para el mismo insumo (uno `campo='servicio'` y otro `campo='stock'`), y `fn_iv_devolver_item` los revierte por separado, devolviendo a cada lado lo suyo. Tolerancia `1e-9` para no registrar movimientos basura por residuo de coma flotante (2/12 no es exacto). **Verificado 3/3 con Quatro (conversión 12):** (A) venta que cabe en nevera → solo movimiento `servicio`; (B) **venta partida** 5 unidades con 2 en nevera → `servicio -0.16667` + `stock -0.25`, y al anular devuelve a cada lado; (C) `vender_bodega=false` → bodega intacta en 1.0, servicio en -0.25. Insumo restaurado a sus valores originales. |
| 55 | 2026-07-31 | **Niveles de cliente (Estándar / Premium / VIP) — barra de experiencia con caducidad (commits `d0c17fd`, `02136e4`, `a843ca0`, `627e6cb`, final):** el cálculo vive 100% en la BD — `fn_nivel_cliente(tenant, tel)` — para que el drawer del chat y la futura pantalla de registro del cliente lean exactamente el mismo número. Config en `pos_niveles_config` (por sucursal): `criterio` (`gastado`|`pedidos`|`puntos`), `caduca_meses` (**6**) y `niveles` jsonb `[{nombre, desde, min_gastado, min_pedidos, color}]`. **Topes vigentes (decisión de Sergio):** Estándar $0 · Premium **$1.000.000** = 46.000 XP · VIP **$3.000.000** = 105.000 XP. **REGLA DE ORO — dinero, experiencia y barra son TRES COSAS CONECTADAS** (Sergio: *"sería ilógico que la barra avance pero la experiencia no, o viceversa"*). La XP es una función del dinero y de NADA más: `XP = interpolación lineal del gastado dentro del tramo de su nivel`. El nivel se gana con **dinero real** (`min_gastado`) y, como la XP se interpola sobre esos mismos topes, XP / barra / nivel llegan al 100% en el mismo instante. Verificado contra la función desplegada: $999.999 → 45.999 XP, 99%, Estándar · $1.000.000 → 46.000 XP, 0%, Premium. **Por qué la proporción no se nota:** la conversión NO es lineal — el primer millón da 46.000 XP (0,046 XP/peso) y los siguientes dos millones solo 59.000 (0,0295 XP/peso). Al cambiar el ritmo por tramo no hay un divisor único que revele el dinero. La barra **nunca muestra pesos**; el gasto real solo lo ve el negocio en las estadísticas de arriba del drawer. El `progreso` usa **floor**, no round: con el 99,99% del monto muestra 99%, porque un 100% sin subir de nivel se leería como un error. **Intentos descartados (no repetir):** (1) factor 0.01 con topes 10.000/30.000 — regla de tres obvia; (2) bono fijo `xp_por_pedido` para ofuscar — rompía el acople: la XP saltaba sin que la barra avanzara. La columna `xp_por_peso`/`xp_por_pedido` quedó en la tabla pero ya **no se usa** con criterio `gastado`. **Caducidad:** a los `caduca_meses` sin un solo pedido el cliente vuelve a Estándar desde cero. La XP **no** suma sobre todo el historial sino sobre la **racha activa** — si alguna vez hubo un hueco > 6 meses entre pedidos, todo lo anterior ya caducó y no vuelve a contar (si no, quien reaparece tras un año recuperaría VIP con un solo pedido). El drawer avisa "Conserva su nivel N meses más" y en ámbar "Pierde su nivel en N días" cuando faltan ≤45 — momento ideal para mandarle una promo. `min_pedidos` por nivel está implementado y en 0: puerta lista por si algún día se bajan los topes y hay que exigir además un mínimo de visitas. Archivos: `chat-ia.js` v=1787120000 (`pintarFichaCliente`), `chat-ia.css` v=54 (`.ci-dw-nivcad`). |
| 56 | 2026-07-31 | **UN SOLO CLIENTE PARA TODA LA APP — se acabó el localStorage como fuente de verdad (commit `50e6692`):** hasta hoy había DOS bases de clientes: el chat leía la tabla `pos_clientes` de Supabase, y **Domicilios y Venta rápida** guardaban la suya en `localStorage['pos.clientes']`. Consecuencias reales: editar un cliente en Domicilios no se veía en el chat ni al revés; **cada equipo tenía su propia lista** (el .exe y el navegador no compartían nada, y un computador nuevo arrancaba vacío); y los clientes creados solo en Domicilios **no tenían ficha, ni nivel, ni historial** (los niveles se calculan desde `pos_clientes` + `pos_orders`, ver entrada 55). **Ahora la TABLA es la única fuente de verdad y el localStorage queda solo como caché** de arranque / respaldo sin internet. Nuevo módulo **`pos-clientes.js`** (`window.posClientes`), cargado en `domicilios.html` y `venta-rapida.html`: `setCtx(tenant,branch)`, `cargar()` (paginado con `.range()` — PostgREST corta en 1000 filas), `guardar()`, `borrar()`, `iniciar()`. Traduce entre las dos formas: pantallas `{id,nombre,tel,barrio,dir,dirId,direcciones:[{id,barrio,dir}]}` ↔ tabla `{id,nombre,telefono,barrio,direccion,direcciones:[{id,dir,barrio}]}`. **El teléfono es la llave:** `guardar()` busca por los últimos 10 dígitos antes de insertar, así que dos pantallas nunca crean dos fichas del mismo número; se añadió índice único `pos_clientes_tel_uniq (tenant_id, right(tel,10))`. **`iniciar()` sube una sola vez los clientes que solo existían en ese equipo** (marca `pos.clientes.subidos.<tenant>`), para no perder los que Sergio ya tenía en el navegador. Guardar es optimista: pinta primero y sincroniza después; si falla, avisa y el dato queda en la caché. Migración SQL: columnas `tipdoc`/`numdoc`/`email` en `pos_clientes` (solo existían en la ficha de Domicilios) e **id estable en cada dirección** (`direcciones[].id`) porque Domicilios marca con cuál está despachando; `chat-ia.js` conserva ese id al editar (`data-did`). **Bug encontrado de paso:** `chat-ia.html` seguía pidiendo `chat-ia.js?v=1787030000` — los cache-bust de las sesiones anteriores se aplicaron al archivo .js (donde no hay auto-referencia) y **nunca al HTML**, así que los navegadores servían el JS viejo de caché. Corregido a v=1787240000; **siempre verificar el `?v=` en el HTML, no en el .js**. |
| 57 | 2026-07-31 | **"Marcar pagado" desde el chat no llegaba a Ventas (commits `5bbd6b1`, `0deb9e0`):** Sergio verificó un comprobante, tocó el botón, y en Ventas el pedido seguía sin pagar; tuvo que cobrarlo a mano desde `pagos.js`. **Diagnóstico con datos:** los 6 pedidos recientes tenían `closed_at` (campo que SOLO escribe `pagos.js`) y **una sola** fila en `pos_payments` → el chat no escribió nada en ninguno. **Prueba de punta a punta ejecutada con `SET LOCAL role authenticated` + los claims de JWT de Sergio** (NO con la service key, que se salta el RLS y no probaría nada): insert y update devolvieron fila, y Ventas lee el pedido como PAGADO. **Los permisos NO eran el problema.** **Tres defectos reales corregidos:** (1) el chat solo escribía `status` + `paid_amount`; le faltaban `closed_at`, `total_final` (= total − domi, "las ventas son las ventas") y `delivery_status='entregado'` — un pedido pagado desde el chat NO quedaba igual que uno cobrado en pagos. (2) **Fallaba en silencio:** un UPDATE filtrado por RLS en PostgREST **no devuelve error**, solo 0 filas; el código daba éxito igual. Ahora insert y update llevan `.select()` y se verifica que devolvieron fila, si no lanza error visible. (3) **Pagos parciales invisibles:** si el comprobante cubría solo la comida (típico: transferencia por el pedido, domicilio en efectivo), quedaba `status='open'` sin avisar → Ventas "sin pagar". Reproducido en la prueba: $30.000 de $35.000 → SIN PAGAR. Ahora avisa ANTES de guardar (`.mp-falta`) y el botón cambia a "Guardar abono". **Causa más probable del caso real:** cero rastro + cero error = el registro nunca se ejecutó. El botón del resultado de verificación decía "💳 Marcar como pagado" pero **solo abre una segunda ventana de confirmación**. Renombrado a "💳 Registrar el pago…" y la ventana ahora avisa "Falta este paso: el pedido todavía NO está marcado como pagado". |
| 58 | 2026-07-31 | **INFORMES: se adopta el diseño entregado por Sergio (commits `eaec09e`, `72c7afd`):** reemplaza la pantalla anterior, que estaba listada en `14-DISEÑOS-CLAUDE.md` como diseño hecho por Claude. **Handoff guardado en** `C:\Prueba Claude Code\cobra-pos-contexto\handoff-disenos\informes\` (html/css/js + `informes-notas.txt`, que es la documentación del diseño — leerla antes de tocar nada). **Arquitectura data-driven:** `informes-data.js` = QUÉ se muestra (catálogo de **39 informes** en 6 categorías + su forma de datos), `informes-app.js` = CÓMO se pinta (un renderer por tipo de bloque: table, hbars, vbars, donut, gbars, line, grid2/3, kpi). Añadir un informe nuevo NO toca el renderer. **Integración con Cobra:** del handoff se tomó SOLO el módulo (`.r-*`, `.cc-*`, `.lm-*`); su shell de maqueta (`.d-side`/`.d-topbar`) se descartó porque Cobra ya tiene sidebar y topbar reales con permisos y marca. El reset global del CSS se acotó a `.r-module` para no pisar `pos-core.css` (única variable en común: `--danger`, ambas rojo). **Quitado lo que las propias notas marcan como solo-demo (§8):** selector "Con datos / Filtros / Vacío" y toggle "Todos los módulos / Restaurante básico". **REGLA DURA:** los `kpis`/`blocks` que trae `informes-data.js` son datos de EJEMPLO del diseño y **la app no los pinta jamás**. Un informe sin fuente real muestra el aviso "Aún sin conectar" (`.r-pendiente`) — nunca cifras inventadas. En el navegador, **punto verde** = ya tiene datos reales. **12 de 39 conectados** en `informes-datos.js` (nuevo): `sal-todas`, `sal-producto`, `sal-hora`, `sal-dia`, `sal-pago`, `sal-modif`, `caj-empleado`, `can-domicilios`, `cli-ventas`, `ger-resumen`, `inv-foodcost` y **`inv-margen`** (la rentabilidad de la sesión anterior, ahora como un informe más dentro de este diseño). Todos respetan *"las ventas son las ventas"*: `total_final` se normaliza a total − domicilio. El costo de receta usa solo la combinación de variantes POR DEFECTO (si no, un producto con 5 sabores sumaría el costo de los 5) y avisa qué % de las ventas tiene receta cargada, porque el resto cuenta como costo $0 y **infla el margen**. **Exportar ahora descarga de verdad** (`informes-init.js`): CSV con `;` como separador (Excel en español usa la coma para decimales) y BOM para los acentos; saca las tablas del informe en pantalla, así que exporta exactamente lo que se ve. Antes solo mostraba un toast de mentira. `informes.js` (el viejo) se eliminó; su lógica quedó portada a `informes-datos.js`. **Pendiente:** conectar los 27 restantes y reemplazar `moduleMode` fijo por la configuración real de módulos del restaurante. |
| 59 | 2026-07-31 | **Informes: de 12 a 27 con datos reales (commits `a828387`, `db57aff`) + 2 informes nuevos en el catálogo (41 en total).** **Nuevos:** `caj-propinas` y `can-chatia` (conversión del chat) — los dos que faltaban de la lista investigada en `03-REQUERIMIENTOS.md`. El único que sigue fuera a propósito es *Rendimiento de anuncios (Meta)*: ese módulo no existe. **Grupo A completo:** `sal-auditoria`, `caj-cierres`, `caj-egresos`, `inv-stock`, `inv-kardex`, `inv-compras`, `cli-detalle`, `ger-comparativo`, `ger-ventascompras`, `can-despacho`. **Y 3 más que estaban mal clasificados como "necesitan función":** `can-afluencia` (usa `pos_orders.guests`, ya se registra), `inv-paloteo` (teórico = recetas × ventas vs real = `iv_movimientos`) e `inv-planificador` (stock + mínimo + consumo). Para el paloteo se añadió `motor.detalle()`, que devuelve la cantidad de CADA insumo del plato con la misma resolución que el costo (presentación + variante por defecto + adiciones). **Diagnóstico de por qué faltan los otros 14:** 12 sí necesitan función nueva (fiados, notas crédito, merma, cuadre, vencimientos, impuestos, reservas, QR, multimarca, asistencia, multisucursal, DIAN) y **2 no**: `caj-retenciones` (la función existe pero no hay datáfono: todos los pagos son efectivo/transferencia) y `sal-combo` (`pos_combos` existe pero está VACÍA). **Hallazgos en los datos de El Parche (2026-07-31):** (1) **0 de 91 ventas pagadas tienen propina** — `tip_amount` siempre en 0, el informe saldrá vacío hasta que se empiecen a cobrar. (2) **202 pedidos anulados en el mes por ~$7,9M**, todos CON productos; concentrados el 09-jul con valores casi idénticos repetidos ($106.000 ×3) → parece día de pruebas o duplicados, pendiente que Sergio confirme. (3) `pos_payments.method` tiene **'Efectivo'/'efectivo' y 'Transferencia'/'transferencia'** duplicados por mayúscula; el informe los unifica al pintar, pero conviene normalizar en el origen. (4) Solo 24 de 25 productos vendidos tienen receta: falta **Salsa Ajo**. |
| 60 | 2026-07-31 | **`PENDIENTES-FUNCIONES.md` (nuevo) — todo lo que falta construir, con qué informe desbloquea cada cosa.** Documento pedido por Sergio. Cubre las 12 funciones que faltan (créditos, impuestos, DIAN, notas, merma, cuadre, vencimientos, reservas, QR, asistencia, multimarca, multi-sucursal) y 8 pendientes que no son informes. **Corrección importante de un diagnóstico mío:** dije que 13 pedidos "pagados a medias" eran cuentas por cobrar. **Falso.** Sergio lo refutó (*"es imposible, los pedidos tienen que estar totalmente pagados para cerrar caja"*) y los datos le dan la razón con precisión: los 13 son domicilios y en **los 13** lo que falta es EXACTAMENTE el `delivery_fee`. El cliente pagó la comida; el domicilio se pagó aparte. **Es una deuda fantasma del modelo:** `total` incluye el domicilio pero el pago registrado no. Un domicilio debería contarse pagado con `paid_amount >= total − delivery_fee`. Anotado en §13.1. **Definición de créditos (Sergio):** NO son "fiados" ni pedidos a medio pagar — el crédito es un **método de pago**, la caja siempre cuadra, y la deuda vive en el cliente o empleado. Cada dueño asigna cupos. Eso reemplaza el concepto de fiado en `caj-fiados`. |
| 61 | 2026-07-31 | **MERMA REAL implementada + "fiado" eliminado del vocabulario + 3 bugs de UNIDADES corregidos.** **(a) Vocabulario:** Sergio pidió no usar la palabra *fiado* en ninguna parte. `caj-fiados` → **`caj-creditos`** ("Créditos de clientes y empleados"); limpiado también en `INFORMES-REFERENCIA.md` y `PENDIENTES-FUNCIONES.md`. **(b) BUGS DE UNIDADES (afectaban plata, ya desplegados):** `iv_insumos.precio` es por unidad de COMPRA, `stock` y `iv_movimientos.delta` están en unidad de COMPRA, y `iv_recetas.cantidad(es)` en unidad de USO. Se estaban mezclando: `inv-stock` e `inv-compras` valorizaban stock(compra) × costo-por-uso → **subvaluaban el inventario tantas veces como la conversión**; `ger-ventascompras` igual; `inv-paloteo` comparaba teórico(uso) contra real(compra) → comparación sin sentido. Corregido con helpers `costoCompra()`, `costoUso()`, `aUso()` y un comentario grande de unidades en `informes-datos.js`. **Regla: revisar la unidad antes de tocar cualquier cálculo de inventario.** **(c) MERMA:** distinta del % de `iv_recetas.merma` (estimado de recortes) — esta es el evento real: se dañó, se venció, se cayó. **Decisión de Sergio: la merma es OPCIONAL POR INSUMO** (*"las bebidas son algo exacto porque son empaquetadas, nunca va a haber merma en las bebidas, pero en el queso o la carne sí"*). Nueva columna `iv_insumos.merma_activa` (default false) + interruptor "Puede tener merma" en la ficha del insumo. Arranque: activada en todo lo que NO es Bebidas (23 insumos sí, 18 bebidas no). Tabla `iv_merma` (RLS por tenant) + `fn_iv_registrar_merma(insumo, cantidad, campo, motivo, nota, quien)`: valida `merma_activa`, nunca deja el stock negativo, congela el costo con el precio de COMPRA, descuenta y escribe en `iv_movimientos` con motivo `merma`. UI: botón rojo **Merma** en la fila del insumo (solo si está activada) con motivos de catálogo (dañó/venció/preparación/derrame/faltante/otro), elección Bodega vs En servicio y vista previa del costo. Informe **`inv-merma`** con causa, insumo, % sobre la venta y detalle. **Verificado de punta a punta con `role authenticated`:** 0,5 kg de Pollo → $10.500, kardex OK, stock OK, y un insumo sin merma activada (Paquete Agua Cristal) **rechazado**. Datos de prueba borrados. **Informes: 28 de 41 con datos reales.** |
| 62 | 2026-07-31 | **IMPUESTOS (INC / IVA) — commit `3683f45`.** Contexto que definió el diseño: **El Parche es "no responsable"** (*"un restaurante pequeño, lo único que pagamos es declaración de renta a nombre mío como persona natural, en el POS anterior nunca tocaba nada de impuestos"*). Eso es lo normal en un restaurante pequeño en Colombia, así que **el impuesto viene APAGADO y no se ve**: quien no lo necesita nunca se entera de que existe. **Motor único `pos-impuestos.js`** (`window.posImpuestos`) para que cobro, recibo e informes nunca den números distintos. Tres reglas duras: (1) con precio incluido —lo normal en Colombia— subir la tarifa NO cambia lo que paga el cliente, cambia cuánto de ese precio es impuesto; (2) se calcula POR LÍNEA y se suma (sobre el total, con tarifas mezcladas, queda mal y el redondeo se desvía); (3) la tarifa se **CONGELA al vender** — los informes leen lo guardado, nunca recalculan, porque las ventas ya declaradas no pueden cambiar. **Cascada de tarifa:** producto → categoría → restaurante (`pos_products.impuesto_pct` y `pos_categories.impuesto_pct`, NULL = hereda). **Config:** Configuración → Impuestos y propina (la sección ya existía con solo propina). Interruptor maestro + tipo (INC 8% / IVA 19% / otro) + precio incluido o no + NIT/razón social/resolución. Lo más importante de esa pantalla es el **ejemplo en vivo**: el dueño ve qué le pasa a un precio real antes de guardar. Se guarda en `branches.operacion_config.impuestos`, así que sincroniza a todos los equipos como el resto de Operación. **Congelado en la venta:** `pos_orders.tax_total/tax_base/tax_detail` (jsonb `[{pct,base,monto}]`) escritos en `pagos.js` al finalizar; columnas `tax_pct/tax_base/tax_amount` listas en `pos_order_items` para cuando se haga DIAN. El domicilio NO entra al cálculo (no es venta y su tratamiento lo define el contador de cada quien). **Recibo:** desglose base + impuesto, solo si está activo. **Informe `sal-impuesto`:** resumen por tarifa, que es lo que va a la declaración. **Verificado con 5 pruebas:** apagado→$0; $20.000 al 8% incluido→base $18.519 + $1.481 y el precio no cambia; al subir a 9% el precio sigue en $20.000; sin incluir→$21.600; pedido con dos tarifas (8% y 19%) suma exacto $50.000. **Informes: 29 de 41.** |
| 63 | 2026-07-31 | **`PLAN-FACTURACION-ELECTRONICA.md` (nuevo) — plan completo, investigado y listo para ejecutar.** **Cuándo:** es lo ÚLTIMO antes de lanzar Cobra (decisión de Sergio: primero se corrige todo lo demás, y esto es lo que permite empaquetarlo y venderlo). El prerrequisito —impuestos— ya está hecho (entrada 62). **Investigación de proveedores (2026-07-31):** **Alanube** vs **Factus**. Recomendado **Alanube** por cinco razones: está diseñado para ISV (software que factura a nombre de MUCHAS empresas, que es exactamente Cobra); **sandbox gratis** (se construye y prueba completo sin cliente real ni costo); **precio público ~$150 COP/documento** a volumen, con lo que se pueden armar los planes con números reales; **multi-país con la misma API** (Colombia, Rep. Dominicana, Costa Rica, Panamá) y los requerimientos ya contemplaban salir de Colombia; y **webhooks con firma HMAC e idempotencia**, clave para la cola de reintento. Factus queda de plan B: solo Colombia, muy ajustado al Anexo Técnico, precio no público, y su documentación bloquea la lectura automática (HTTP 403) — hay que leerla a mano. **5 preguntas por confirmar antes de escribir código** (§4 del plan), la más importante: si una sola cuenta puede emitir a nombre de N restaurantes con su propio NIT y certificado, o si cada uno necesita cuenta propia — eso define todo el onboarding. **Reglas duras del plan:** consecutivo con bloqueo en BD (dos cajas no pueden tomar el mismo número: es problema legal); reintentar nunca puede duplicar; sin internet se sigue vendiendo con recibo provisional + cola; los impuestos se leen CONGELADOS de la venta; el certificado digital no pasa por Cobra; apagado por defecto; un rechazo de la DIAN siempre se ve. **Las notas de crédito van dentro del mismo alcance**, no aparte: una factura emitida no se borra, se anula con nota de crédito, y hoy anular solo marca `cancelled`. Facturar sin eso deja un problema legal en la primera anulación. **6 fases**, y las fases 1 a 5 se hacen completas en sandbox sin cliente y sin costo; solo la 6 necesita un restaurante real. |
| 64 | 2026-07-31 | **Domicilio fantasma corregido + motor de CRÉDITOS (commits `a8306ef`, este).** **(a) DOMICILIO FANTASMA:** 13 pedidos aparecían "pagados a medias" y en los 13 lo que faltaba era EXACTAMENTE el `delivery_fee`. Regla nueva en `pos-core.js`: **`posCobrable(o) = total − delivery_fee`** y `posEstaPagado(o)` compara contra eso (margen de $1 por redondeo). El cliente paga el domicilio pero muchas veces va directo al domiciliario y nunca entra a la caja; y aunque entre, no es venta. Aplicado en `ventas-salon.js`, `domicilios.js` e `historial.js` (`caja.js` ya usaba `total_final`, por eso la caja sí cerraba). Verificado: los 13 quedan PAGADO. Queda **1 deuda real**: 14-jun, salón, faltan $2.700 de $29.700, método 'multiple' con **0 pagos registrados** → anterior a que el registro de pagos funcionara; no es plata que deban hoy. **(b) CRÉDITOS — motor listo y probado** (`sql/2026-07-31-creditos.sql`). Decisiones de Sergio: la deuda es **de la persona** (cliente o empleado), no del pedido; **sin cupo se BLOQUEA** con modal "crédito insuficiente" y solo el administrador amplía el cupo desde Configuración (sin override por PIN en el cobro); **abono libre** en cualquier momento; **clientes y empleados separados**. Tablas `pos_creditos` (tipo, cliente_id, nombre, cupo, saldo) y `pos_credito_movimientos` (consumo/abono/ajuste con `saldo_despues`, `order_id`, `session_id`), vista `v_creditos` con `disponible`. `fn_credito_consumir` usa **`SELECT … FOR UPDATE`**: dos cajas cobrándole al mismo cliente a la vez no pueden pasarse del cupo. Lanza `CREDITO_INSUFICIENTE|disponible|cupo|saldo` para que el modal muestre cifras. `fn_credito_abonar` nunca deja el saldo negativo: aplica solo lo que debe y devuelve el `sobrante` como vuelto. **Probado con `role authenticated`:** cupo $100.000 → consume 40.000 y 50.000 OK → intenta 30.000 más y **queda bloqueado** (disponible $10.000) → abona 25.000 → abona $999.999 y solo aplica $65.000, sobrante $934.999. Ledger correcto en los 4 movimientos. **UBICACIÓN ACORDADA:** *Configuración → Créditos* (asignar cupos, 2 pestañas cliente/empleado, permiso de admin) y *Caja → Créditos* (ver saldos y registrar abonos, porque el abono entra al turno abierto y si no el arqueo no cuadra). **PENDIENTE:** las tres pantallas (Configuración, Caja, y "Crédito" como método en el cobro) e informe `caj-creditos`. |
| 65 | 2026-07-31 | **CRÉDITOS — completo (commit `36d90d0`).** Las tres pantallas + informe, sobre el motor de la entrada 64. **Nuevo `pos-creditos.js`** (`window.posCreditos`): listar / guardar / desactivar / movimientos / consumir / abonar, y traduce el error crudo `CREDITO_INSUFICIENTE|disponible|cupo|saldo` a un modal con cifras. **(1) Configuración → Créditos** (grupo Equipo): asignar cupos, pestañas Clientes / Empleados, buscador, resumen (cuántos, cuánto deben, cuánto cupo) y semáforo por lo que le queda. Un crédito **se desactiva, no se borra**: sus movimientos son historia contable. **(2) Caja → Créditos** (botón en la barra del turno): quién debe, ordenado por deuda, y registro de abonos. **Va en Caja y no en Configuración porque el abono es plata que entra al turno abierto** (`session_id`) — en otro lado el arqueo no cuadraría. Si abona de más avisa cuánto devolverle. **(3) Crédito como método de pago** en `pagos.js`: al aplicar pide a nombre de quién (se ven todos, el que no alcanza sale deshabilitado con el motivo a la vista). **El cargo real se hace al FINALIZAR, no al aplicar**: si se cancela el cobro a medias, nadie queda debiendo algo que nunca se cobró. Si el cupo no alcanza, se muestra el modal y **no se cobra nada** — el pedido nunca queda pagado con un crédito inexistente. **(4) Informe `caj-creditos`:** cuentas por cobrar con antigüedad (semáforo a +15 y +30 días) y el flujo consumido/abonado del período. **Probado de punta a punta con `role authenticated`:** cupo $80.000 → consume 22.000 y 35.000 → intenta 30.000 y **queda bloqueado** (disponible $23.000) → abona 40.000 → ahora sí pasa el de 30.000 → debe $47.000. Ledger correcto en los 4 movimientos. Datos de prueba borrados. **Informes: 30 de 41.** |
| 66 | 2026-07-31 | **Cuadre de stock (motor) + vencimientos DESCARTADO (commit `7415fe8`).** **Contexto:** Sergio preguntó qué había que corregir del inventario si ya funciona. Respuesta honesta: **nada está roto** — el cuadre no arregla un bug, tapa un hueco. **El hueco verificado:** editar el stock a mano en la ficha del insumo NO dejaba ningún rastro; alguien corregía el número y la diferencia desaparecía. Con **$1.725.222 parados en inventario** (Papa sola $300.120), eso importa. **Garantía dada a Sergio y cumplida:** no se modificó NADA del comportamiento del inventario. Descuento al vender, recetas, surtir, bodega/servicio, merma y control manual quedan idénticos. Lo único que se tocó fue `guardarInsumo`, y solo para **añadir** un paso al final (best-effort: si falla, el insumo ya quedó guardado). Todo lo demás es código nuevo. **Construido:** `iv_conteos` + `iv_conteo_lineas` + `fn_iv_abrir_conteo` / `fn_iv_cerrar_conteo` (`sql/2026-07-31-cuadre-stock.sql`). El conteo **congela** lo esperado al abrir (si se recalculara al cerrar, una venta hecha mientras se cuenta ensuciaría la diferencia) y **deliberadamente no le muestra al que cuenta lo que el sistema cree** — mismo principio del cierre ciego. El ajuste va siempre contra bodega (repartirlo entre bodega y servicio sería inventar de dónde salió) y queda en el kardex con motivo `conteo fisico`. Los ajustes manuales quedan con motivo `ajuste manual`. Informe **`inv-cuadre`** con conteos + ajustes a mano (varios ajustes seguidos del mismo insumo = señal de que algo no cuadra). **Probado con `role authenticated`:** conteo sobre 41 insumos, uno con faltante ($500), uno con sobrante ($6.240), uno cuadrado; stock ajustado y kardex correcto; datos de prueba borrados y stock restaurado. **PENDIENTE de esta función:** la pantalla para contar desde el celular. **VENCIMIENTOS Y LOTES: DESCARTADO** por decisión de Sergio. Sus insumos son de rotación rápida (papa, carne, salchicha); los lotes son para quesos madurados o licores. Se reconsidera solo si un cliente con producto de larga vida lo pide. `inv-vencer` queda como "Aún sin conectar", que es correcto. **Informes: 31 de 41.** |
| 67 | 2026-07-31 | **TRES REGRESIONES propias durante el servicio de Sergio — corregidas en caliente.** Todas de cambios hechos hoy sin poder probarlos en pantalla (no hay sesión de Sergio disponible para verificar UI). **(1) Los domicilios desaparecieron de Ventas (commit `91d7d5b`).** Al arreglar el domicilio fantasma se borró `var totalNum` pero la línea `total: totalNum` quedó viva → `fetchDeliveries()` lanzaba ReferenceError, el `try/catch` la tragaba y devolvía `[]`. Resultado: *"Sin domicilios activos"* con un pedido real de $33.000 en curso, en pleno servicio. **El catch silencioso fue lo que lo hizo invisible.** **(2) Las listas de envío no cargaban (commit `10c6647`).** El `wlCargar()` se enganchó con un replace ciego al primer `wtpCargar()`, que resultó estar en la función de CREAR plantilla, no en la de abrir la pestaña. Sergio entró a Configuración y no vio nada. **(3) Pagar marcaba el domicilio como ENTREGADO (commit `d2f2218`).** En la entrada 57 se añadió `upd.delivery_status='entregado'` al marcar pagado. Error de criterio: **pagar no es entregar** — un domicilio se paga por transferencia mientras sigue en preparación. Sergio lo detectó: dos pedidos (David, Valentina) aparecían entregados sin haber salido. Verificado antes de corregir: tenían `estado='en_preparacion'` (campo intacto) y `delivered_at` NULL → nunca se entregaron. Se devolvieron a `delivery_status='preparacion'`. **LECCIONES:** (a) al borrar una variable, buscar TODOS sus usos — `node --check` no detecta un ReferenceError en tiempo de ejecución; (b) los `try/catch` que devuelven `[]` esconden bugs: deberían al menos avisar en pantalla; (c) no usar replace ciego para enganchar código — verificar EN QUÉ función cae; (d) **pendiente: auditoría con pruebas reales de UI**, no solo revisión de código. |
| 68 | 2026-08-04 | **VELOCIDAD — diagnóstico medido y tres correcciones (commits `82f544c` + este).** Sergio reportó que el sistema se volvió lento "después de los cambios de la foto". Cierto en parte, y había algo mucho más grande debajo. **Medido, no supuesto:** cada cambio de pantalla baja de internet 13–15 archivos, entre **176 y 379 KB, de 1,8 a 12,5 segundos** (Dashboard 326 KB/12,5 s; Ventas 369 KB/5,3 s; Caja 379 KB/4,3 s). **(1) LA CAUSA GRANDE, y no era la foto:** `main.js` del .exe forzaba `Cache-Control: no-store` en TODA petición a cobrapos.app y llamaba `clearCache()` en cada arranque. El programa tenía **prohibido** guardar nada; volvía a bajarlo todo, siempre. Se puso en su día para no ver archivos viejos durante el desarrollo, pero es innecesario: cada `.js`/`.css` ya se pide con `?v=` que se cambia en cada publicación. Ahora solo se revalidan los `.html` (**109 ms** contra **1.985 ms** que cuesta bajar `ventas-salon.js` entero). **Requiere reconstruir el .exe.** **(2) La foto del restaurante, error propio:** se guardaba tal cual la escoge el dueño — **566 KB, 757×767** — para verse en un círculo de 36 px, y el servidor solo autorizaba guardarla una hora. Ahora se reduce a 256×256 al subirla (`genLogoReducir`, canvas), se pide un año de caché (seguro: cada foto estrena dirección), y **la imagen queda guardada en el equipo** (`localStorage`, `pos.brand.foto`) para que la red no esté en el camino. La que ya estaba subida se reemplazó: **566 → 97 KB**. **(3) Los dos vigilantes del DOM de `pos-brand.js`, error propio:** revisaban el documento entero en CADA cambio —y Ventas y Catálogo cambian sin parar— y no se apagaban nunca. Ahora agrupan por cuadro de pantalla (`requestAnimationFrame`) y se desconectan a los 20 s. **(4) NUEVO `pos-cache.js` — "primero el equipo, después la base":** la pantalla se pinta con lo guardado localmente (instantáneo) y la base solo confirma después. Llave con el `tenant_id` dentro: **un equipo donde entren dos negocios NUNCA mezcla datos** (probado). Se borra todo al cerrar sesión. Si no hay espacio, bota lo más viejo y reintenta; si aun así falla, trabaja como antes. Estrenado en Catálogo. **Falta extenderlo a** Ventas, Inventario, Caja y Configuración. **(5) `PLAN-NIVEL-2-APP-LOCAL.md` (nuevo):** meter la aplicación DENTRO del .exe con actualizador propio. **Aplazado a propósito** por decisión de Sergio hasta que la plataforma esté consolidada — mientras haya cambios diarios, un actualizador nuevo es más riesgo que beneficio. Documento escrito para que no se pierda entre sesiones. |
| 69 | 2026-08-04 | **VELOCIDAD (segunda parte) — el .exe tenía PROHIBIDO guardar archivos, y siete arreglos más.** **(1) LA CAUSA GRANDE:** `main.js` forzaba `Cache-Control: no-store` en toda petición a cobrapos.app **y** llamaba `clearCache()` en cada arranque. El programa volvía a bajar las 13-15 piezas de cada pantalla en CADA navegación. Ahora solo se revalidan los `.html` (**109 ms** contra **1.985 ms** que cuesta bajar `ventas-salon.js` entero). Requisito previo cumplido: se le puso `?v=` a los **28** archivos que no lo tenían (commit `b42fa90`) — sin eso, permitir la caché habría dejado archivos viejos hasta 10 minutos. **El .exe se reconstruyó y se instaló EN SU SITIO** (`dist\Cobra POS-win32-x64\`); se verificó extrayendo el código de dentro del `app.asar`. Se enderezó el acceso del menú Inicio, que apuntaba a **otra** instalación vieja en `AppData\Local\Cobra POS` — de ahí la queja de Sergio de llenarse de copias. Se borraron 1,65 GB de restos con su permiso. **(2) `auth.getUser()` sale a internet; `getSession()` no.** Las cuatro piezas que cargan casi todas las pantallas (`pos-core`, `pos-perms`, `pos-brand`, `pos-plan`) preguntaban al servidor "quién eres" — `pos-core` incluso leía la sesión y ACTO SEGUIDO preguntaba lo mismo. Migradas, más las 12 de `configuracion.js` (nueva función `cfgUsuario()`) y la de `inventario.js`. **Contrapartida asumida a propósito:** un cambio de rol se ve al renovarse la sesión (dentro de la hora) o al volver a entrar. **(3) La librería de Supabase** se pedía a `cdn.jsdelivr.net` en las 24 pantallas (864 ms). Ahora vive en `vendor/supabase-2.js` con versión, y de paso queda congelada: antes se pedía `@2`, "la última que haya". **(4) VENTAS — el velo tapaba una pantalla ya dibujada.** `ventas.html` quitaba el "Cargando ventas…" cuando `init()` TERMINABA, y no termina hasta que vuelven las cinco consultas. Además `init()` esperaba dos respuestas antes de pintar un pixel. Corregido. **(5) VENTAS — el plano del salón lo guardamos NOSOTROS.** Primer intento fallido y reportado por Sergio (*"quedó peor, ahora son dos cargas"*): di por hecho que el plano estaba en la llave que escribe Configuración, y esa llave solo existe si el dueño guardó en ESE equipo — en el suyo no estaba. Ahora, la primera vez que las mesas llegan se guarda su plano en `posCache` (292 bytes) y a partir de ahí el salón se dibuja al instante. **El estado de cada mesa NUNCA se guarda** (ocupada, reloj, cuenta): eso siempre viene fresco. **(6) Consultas en FILA INDIA.** Inventario hacía 9 seguidas: se auditó cuál necesita de verdad a otra — **solo las recetas, que recorren los productos**. Ahora 8 en paralelo → de 9 esperas a 2. Caja hacía 7 → 3 tandas. Dashboard esperaba la sucursal antes de lanzar sus otras 9 consultas; ahora usa la copia guardada. **(7) BUG DE DISEÑO, ajeno a la velocidad:** `setSection` de Configuración ocultaba las pantallas con una **lista escrita a mano** y a `screen-impuesto` se le olvidó ponerla: se le añadía la marca de visible pero nunca se le quitaba, así que una vez abierta se quedaba colgando bajo Operación y Métodos de pago, que se veían cortadas. Se cambió la lista por ocultar todas las `.cf-screen` — **cualquier pantalla nueva se oculta sola**. Lección: una lista escrita a mano de elementos a ocultar es una trampa con fecha de caducidad. **(8) `pos-cache.js` (de la entrada 68) estrenado también en Ventas y Dashboard.** **Nivel 2 sigue APLAZADO** — ver `PLAN-NIVEL-2-APP-LOCAL.md`, ahora también con el **instalador** documentado como pendiente obligatorio (§5.bis), pedido expreso de Sergio. |
| 70 | 2026-08-04 | **RECONOCIMIENTO DE PEDIDOS DEL CHAT — de 45 a 49 de 51 (88% → 96%). `extraer-pedido` v46.** Sergio reportó que un pedido real de "una salchipapa con pollo con adición de salchicha ranchera" salía como **Premium · Pollo $28.000** en vez de **Pollo $17.000**. **BANCO DE PRUEBAS (lo primero que se construyó):** 54 conversaciones reales de 45 días, copiadas a conversaciones de prueba y **cortadas en el momento del pedido** (al reanalizar las originales el sistema ve lo que se habló después y analiza otra cosa). La respuesta correcta es el pedido que Sergio ya había corregido a mano. Se descartaron 3 por decisión suya (una Coca Cola pedida en persona, su propia conversación de pruebas de 200 mensajes, y un perro que él dedujo por conocer a la clienta) → **51 válidos**. Todo borrado al terminar. **MEDICIÓN CLAVE:** corriendo producción DOS VECES sin cambiar nada dio **46 y 44** — el reconocimiento **no es determinista**, así que una sola corrida no distingue una mejora de la suerte. Desde ahí, todo se midió dos veces. **LO QUE FALLABA, por causa:** (a) inventaba "Premium"/"Maicitos Especial" cuando el cliente solo dijo el ingrediente; (b) confundía la preferencia de salsas con adiciones; (c) perdía el sabor de la bebida; (d) no usaba el precio como pista. **EL DISEÑO DE SERGIO (7 agentes, uno por tarea):** se construyó completo y **midió PEOR (31 y 26 de 51)**, pero no por la idea: al partirlo yo le quitaba EVIDENCIA a cada agente en vez de estrecharle la PREGUNTA, y sobre todo dejaba fuera las defensas de código que producción acumuló en meses. **LA VERSIÓN QUE GANÓ es producción intacta + tres piezas de su diseño:** (1) **un agente solo para las variables**, que entra únicamente si el producto tiene variantes y quedaron vacías — es lo único que arregló el sabor del jugo, y cuando las completa **el precio se rehace por matchProducto, nunca a mano**; (2) **preferencias antes que adiciones** con la regla de las 4 salsas de base (Sergio: los platos ya vienen con roja, ajo, rosada y BBQ, así que "solo ajo y bbq" es preferencia y va en notas; solo es adición si dice "adición/extra/aparte"); (3) **un agente supervisor** que compara el pedido armado contra lo que escribió el cliente y **marca `precio_confirmar`** — convierte el fallo callado en fallo avisado. **CUATRO ARREGLOS DE CÓDIGO, todos nacidos de explicaciones de Sergio sobre cómo habla su gente:** · **"lo que dijo el cliente manda sobre lo que dijo el modelo"** — ya existía una protección para el nombre inventado pero **buscaba un producto llamado como el nombre que dio el modelo**: el modelo decía "Premium", existe un Premium, y la comprobación lo daba por bueno (le preguntaba al sospechoso si era culpable). Ahora busca por las palabras del cliente, y va **DESPUÉS** de la protección vieja: puesta antes, esa la deshacía. · **el plato le gana al ingrediente** — si el cliente nombró dos productos y el nombre de uno es una OPCIÓN del otro (Mixta es opción de Premium), el plato es el de arriba (Sergio: *"una adición se le agrega a algo, y ahí todavía no hay ningún plato al que agregársela"*). · **un sabor que solo existe en un sitio manda** — Sergio: *"nadie va a decir postobón; ¿cuántas cosas en la carta se llaman colombiana?"*. Con dos candados: el sabor debe tener un solo dueño (Mixta está en Premium y en Maicitos Especial: no sirve) y **no puede ser también el nombre de una adición** (si no, "una premium con tocineta" se volvía SÚPER QUESO). · **DOS VARAS DISTINTAS para "¿el cliente dijo esta palabra?"**: **tolerante** al juzgar si al producto elegido le sobran palabras (nadie pierde su Premium por escribir "premio"), pero **exacta** al proponer otro producto — sin esa asimetría, "PREMIO 1.5 LITROS" se daba por dicho porque el cliente había escrito "premium" hablando de la salchipapa, y la Postobón Colombiana se convertía en un Premio. **LOS 2 QUE QUEDAN** son los dos donde el cliente identifica el plato por el PRECIO ("Premium de 69", "maicitos especial de 29"): salen sin el tipo y **marcados**, no cobran mal. Decisión de Sergio: los resolverá Paco preguntando. **PENDIENTE:** el supervisor marca de más (33 de 48 correctos en la medición previa) — hay que hacerlo exigente o el aviso se vuelve ruido y se deja de mirar. **Respaldo de la versión anterior (v45) y todo el banco: en el scratchpad de la sesión.** **LECCIÓN, y es de Sergio:** cada vez que se le pidió algo al modelo por escrito falló tarde o temprano; cada vez que se resolvió por código, dejó de fallar. |

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
| `crear-pedido-chat` | v10 | ACTIVE | Crea pedido desde el chat (borrador → cocina); `estado:en_preparacion` + `delivery_status` |
| `cambiar-estado` | **v3** | ACTIVE | Cambio central de estado (chat↔Ventas): escribe `estado`+`delivery_status`+`delivered_at`, aplica etiqueta de estado EXCLUSIVA y envía mensaje configurado |
| `verificar-pago-manual` | v2 | ACTIVE (dormida) | Verificación SOLO-lectura de transferencia para la vista del operador (Vision+Gmail, no responde al cliente). Motor listo; falta el botón en el chat — se retoma al pulir a Paco |

---

## 🟢 Sesión 2026-07-27 — Estados, etiquetas exclusivas y cuenta de pago

- **Cuenta de transferencia actualizada a `0092726260`** (antes `0092726260`). La VERIFICACIÓN ya usaba la nueva (`ia_config.pagos.llave`), pero el bot todavía le daba la VIEJA al cliente en `pagos.qr_texto` y `frases.datos_nequi` — corregido en DB. ⚠️ PENDIENTE (solo Sergio): regenerar la **imagen del QR** (`chat-media/qr-pago/.../qr.jpeg`) porque probablemente aún apunta a la cuenta vieja.
- **`cambiar-estado` v3 — etiquetas de estado EXCLUSIVAS**: al cambiar de estado (ej. En preparación → En camino) se quitan SIEMPRE las etiquetas de los OTROS estados y queda solo la del estado actual. Antes la limpieza estaba dentro de `if(e.etiqueta)` y solo corría si el estado nuevo tenía etiqueta; ahora corre en toda transición. Las etiquetas MANUALES del operador NO se tocan (solo se filtran las de estado). El chat refleja el cambio por realtime de `chat_conversations`.
- **`verificar-pago-manual` v2 (motor listo, dormido)**: función nueva reescrita limpia (Vision lee comprobante → compara cuenta/monto/correo Gmail dentro de la ventana del turno) que devuelve `{verified, razon, mensaje, datos.checks}` para mostrarle el veredicto al operador SIN responderle al cliente. Etiqueta de éxito configurable en `estados_config.etiqueta_pago` (default `ems2h5zc7` = "Pago"). Falta solo el botón `$` en el header del chat + el modal; se retoma cuando se pula a Paco.

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
         (Número de llave: 0092726260, Titular: El Parche)

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
✅ Llave Nequi comparada contra ia_config.pagos.llave ("0092726260")
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
| `pagos.llave` | `0092726260` |
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
**Fix aplicado**: Extrae llave del comprobante via GPT Vision, compara con `ia_config.pagos.llave` ("0092726260").

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

## ✅ REVISIÓN — Lo ya corregido/hecho (Sergio revisa uno por uno)

> Lista de control (QA). Sergio pidió (2026-07-24) tener todo lo corregido junto para probarlo uno por uno. Se MANTIENE ACTUALIZADA: cada vez que se termina algo nuevo, se agrega aquí. Marca [x] lo que ya verificaste OK; si algo quedó mal, se vuelve a la lista de pendientes.

**Corregido/nuevo el 2026-07-24:**

- [ ] **#1 Marca vieja "Lumen" eliminada** → revisar que Historial e Impresoras (y registro/onboarding) digan **Cobra POS**.
- [ ] **#2 Zonas/mesas** → confirmar que estén Adentro (01-04) y Antejardín (05-08), sin fantasmas "Barra/Terraza". (Falta que Sergio ajuste capacidades él mismo.)
- [ ] **#3 Imprimir comprobantes (dashboard)** → el modal ya muestra los pedidos del día (antes salía "Sin resultados" vacío).
- [ ] **#4 Meta diaria — "Venta rápida"** → ya NO sale en $0; muestra lo vendido en rápidas y se llama "Venta rápida" (antes "Mostrador").
- [ ] **#5 Vuelto en efectivo** → al pagar con más del total, el vuelto se mantiene visible tras "Agregar pago" (antes desaparecía).
- [ ] **#6 Tarjeta de venta rápida al entregar** → al marcar "ya entregué" la tarjeta queda en estado **Entregado** (no desaparece); solo se va al cerrar caja.
- [ ] **#13 [CRÍTICO] Mesas/zonas no se borran solas** → Configuración ahora carga desde la base y nunca borra en masa. Probar editar mesas desde varios equipos sin que se pierdan.
- [ ] **Ícono del ejecutable azul oscuro** → ventana, escritorio y barra de tareas (ya confirmado por Sergio). Falta: ícono del ARCHIVO .exe (al armar instalador) y ícono de la APK.
- [ ] **Notas frecuentes** → crear notas en Config→Operación (Global/Por categoría) y usarlas al personalizar el plato (selector con buscador). Se imprimen en la comanda.
- [ ] **Inventario — stock Por compra / Por unidad** → interruptor SEPARADO en Stock actual y Stock mínimo; la etiqueta cambia con la unidad elegida; convierte con la conversión.
- [ ] **Inventario — unidades personalizadas** → crear una unidad y confirmar que aparece en los desplegables de Unidad de compra y de receta, y que YA se guarda (no se pierde al recargar).
- [ ] **Recetas de bebidas / reventa** → armar la receta 1:1 (Coca Cola por presentación) y ver el costo por unidad (paquete÷unidades). (Sergio ya lo probó OK.)
- [ ] **Venta rápida — diseño unificado con mesa** (tablet) → barra lateral finita de iconos (asa "desliza"), fotos de producto grandes, sin topbar, sin "Cliente" duplicado. **Falta confirmación de Sergio en tablet.**
- [ ] **Domicilios — refinamientos** (tablet) → sin topbar, sin el conteo "Pedido · N ítems", fotos más grandes. **Falta confirmación de Sergio en tablet** (y ver si el grid necesita más ajuste como venta rápida).
- [ ] **Venta sin inventario** → interruptor en Inventario→Parámetros; productos con insumo agotado se bloquean (OFF) o avisan con modal (ON), en mesa/rápida/domicilios. **OJO: falta el afinamiento por VARIANTE (urgente).**
- [ ] **Permisos tablet (RLS insumos/recetas)** → confirmar que en la tablet de Mónica también se ven los agotados (se arregló el permiso de lectura).
- [ ] **Egresos de caja arreglados** → registrar un ingreso/egreso ya funciona (faltaban permisos de tabla). Confirmar que registra y suma en el cierre.

---

## PENDIENTE RÁPIDO — [Caja] "Ventas por canal" dice "Mostrador" y sale en $0 (mismo bug del #4) — Sergio 2026-07-24

En la pantalla de **Caja**, el desglose "Ventas por canal" muestra **Mostrador $0** en vez de **Venta rápida** con su monto. Es el mismo bug que se arregló en el dashboard (#4): usa el canal `mostrador`/`counter` que NO existe; el real es `rapido`.

**Qué tocar (mismo fix del #4, pero en caja):**
- `caja.js:54-57` — `CANALES`: cambiar `{ key:'mostrador', label:'Mostrador' }` por `{ key:'rapido', label:'Venta rápida', color:'#F59E0B', bg:'#FEF3C7' }`.
- `caja.js:545-549` — `renderCanalVentas()`: filtra por `channel === c.key`; que reconozca `rapido` (y alias viejos counter/mostrador/quick, idealmente con un normalizador como el `normChannel` de dashboard.js).
- `caja.html:117` — la fila del canal: cambiar `id="canal-mostrador"` → `id="canal-rapido"` y el texto "Mostrador" → "Venta rápida" (el JS lee `canal-${c.key}`, deben coincidir).
- Revisar también `caja.js:1453, 1586, 1630` (mapas `byChannel`/gráficas/informes de caja) que usan `mostrador` — mismo cambio.
- Alcance del turno: confirmar que sume las ventas rápidas de la sesión de caja abierta.

---

## ✅ HECHO 2026-07-31 — [Dashboard] "Inventario rápido" / "Alertas de stock" ahora leen `iv_insumos` (commit `3e0a9f8`)

**Bug confirmado:** el dashboard consulta `pos_ingredients` (tabla VIEJA/VACÍA: 0 filas) en vez de `iv_insumos` (el inventario real: 43 filas, lo que usa la pantalla de Inventario). Por eso el modal "Inventario rápido" y la tarjeta "Alertas de stock" SIEMPRE dicen "Todo en orden / Inventario al día" aunque haya insumos en 0. Está mirando una tabla vacía.

**Qué tocar (dashboard.js):**
- `loadStock()` ~línea 265-269: `sb.from('pos_ingredients').select('name,stock,purchase_unit,min_stock')` → usar `iv_insumos` con columnas reales: `nombre, stock, min_stock, use_unit` (+ filtrar `activo` y por `branch_id`/`tenant_id`).
- `qmLoadInventario()` ~línea 1462-1472: `sb.from('pos_ingredients').select('*')` → igual, `iv_insumos`. Ojo el mapeo `name` → `nombre` en el render (líneas ~1490-1500 usan `it.name`, `it.unit`, `it.min_stock`).
- Revisar todos los usos de `pos_ingredients` en dashboard.js y otros archivos (buscar `pos_ingredients`) — probablemente más de uno.

**Nota adicional (afinar):** el alerta es `stock < min_stock`. Hoy muchos insumos tienen `min_stock = 0`, así que aunque estén en 0 no alertan (0 < 0 = falso). Al arreglar la tabla, considerar también marcar los **agotados** (`stock <= 0`) como alerta, o recordarle a Sergio poner el mínimo a los insumos clave. (Verificado 2026-07-24: 0 insumos con stock<min porque casi todos tienen min=0.)

---

## ✅ HECHO 2026-07-31 — [Dashboard] Modal "Imprimir comprobantes": los botones ya imprimen de verdad (commit `3e0a9f8`)

(El modal ya muestra los pedidos — eso se arregló en #3 — pero quedaron dos cosas.)

**1. Los botones de reimprimir (Comanda / Precuenta / Recibo) NO imprimen nada.** `dashboard.js:1657-1665`: el handler solo muestra un TOAST ("✓ Enviando ... a la impresora...") y ahí termina — nunca llama al sistema real de impresión. Es un placeholder sin cablear.
  - **Fix:** conectar cada botón al sistema de impresión real (`pos-print.js`: `posPrintTicket`/`posPrintAction`/`_buildComanda`). Antes hay que **cargar el pedido completo con sus ítems** (`pos_order_items`) porque el modal solo cargó la cabecera (`qmLoadComprobantes` select sin items). Mapear doc: Comanda→ticket cocina, Precuenta→cuenta previa, Recibo→comprobante de venta. Verificar que `pos-print.js` esté incluido en dashboard.html (o incluirlo).

**2. Nombres de mesa crudos.** `dashboard.js:1583-1584` y `1615-1616`: muestran `'Mesa ' + o.table_id` = el ID crudo (ej. "Mesa tmry2e6v7wjt", "Mesa t08") en vez del nombre/número real ("Mesa 08").
  - **Fix:** cargar `pos_tables` (id → name/number) una vez y mapear el `table_id` al nombre bonito. (Mismo patrón que otras pantallas que ya resuelven el nombre de mesa.)

**3. Cada venta muestra el UUID crudo como "número de pedido"** (ej. "#3d223951-98c1-4565-bb51-e570038e4164") — ilegible. `qmRenderOrderList`/`qmSelectOrder` hacen `String(o.id).padStart(4,0)` sobre el UUID. **Fix:** mostrar algo comprensible en vez del UUID — un código corto (ej. últimos 4-6 del id) o mejor, dar prioridad a info humana (mesa/cliente + hora + total) y quitar/achicar el código. Ideal a futuro: un consecutivo legible por pedido (hoy `pos_orders` solo tiene UUID + `turno`; evaluar agregar un número corto de pedido).

**Nota:** ligado al #3 (el modal de comprobantes). En la lista de REVISIÓN, marcar #3 como "muestra pedidos OK, pero imprimir + nombres de mesa + código legible pendientes".

---

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

21. **[FEATURE · LLAMADAS DE WHATSAPP] Llamar y recibir llamadas dentro de Cobra.** Decidido con Sergio (2026-07-31). Es para el PRODUCTO, no solo para El Parche: "en mi negocio no solemos contestar llamadas, pero tal vez otros negocios sí, entonces igual hay que hacerlo para llamar y recibir". **Sergio rechazó entregarlo por partes** ("de nada sirve solo el botón") → se construye completo o no se construye.
   - **Caso de uso que lo motivó:** el domiciliario llega y el cliente no contesta el chat; hay que llamarlo.
   - **VERIFICADO en su número (2026-07-31)** vía Graph API `GET /{phone_number_id}/settings`: la función EXISTE y está disponible, hoy apagada → `{"calling":{"status":"NOT_SET","call_icon_visibility":"NOT_SET","callback_permission_status":"NOT_SET"}}`. Número +57 301 9421650 "El Parche Food", quality GREEN, platform CLOUD_API, phone_number_id `1258797700641460`.
   - **El bloqueo real (no es "solo usar la API"):** un mensaje es texto y la API lo entrega; una llamada es AUDIO EN VIVO. La API solo hace la señalización (timbrado, quién llama a quién) — la voz necesita un cliente que capture el micrófono y reproduzca el audio. Como el número está en **Cloud API**, la app de WhatsApp Business ya NO puede contestar. Hay que construir un **softphone dentro de Cobra**.
   - **Opciones de medios (doc oficial):** (a) por defecto Graph API + Webhooks con **WebRTC** (ICE + DTLS + SRTP); (b) **SIP con WebRTC**; (c) **SIP con SDES** — (b) y (c) hay que pedirlas explícitamente a Meta.
   - **Para llamar NOSOTROS al cliente:** Meta exige **permiso previo del usuario** (call permission). Hay que pedirlo por chat y guardar el estado. No se puede llamar a cualquiera.
   - **Callback requests:** si no se contesta (o fuera del horario configurado), WhatsApp le ofrece al cliente "solicitar que te llamen" o seguir por chat, y le muestra el próximo horario disponible. Se controla con `callback_permission_status` + horarios de atención.
   - **Alcance a construir (todo junto):** (1) activar `calling` en el número + `call_icon_visibility` + horarios, por sede (multi-tenant, configurable en Config → Chat IA); (2) rama de **llamadas en meta-webhook** (entrante, colgada, permisos, callback solicitado); (3) **softphone WebRTC** en el navegador/Electron: negociación SDP con Meta, micrófono/altavoz, timbre, mute, colgar; (4) **UI**: llamada entrante (aceptar/rechazar), llamada en curso, botón Llamar en el chat, historial de llamadas junto a la conversación; (5) **permisos de llamada** (pedirlos por chat, guardar estado); (6) callback + horarios.
   - **Docs:** developers.facebook.com/docs/whatsapp/cloud-api/calling/ · .../calling/call-settings · .../calling/sip
   - ⚠️ **Nota de negocio (dicha a Sergio):** las llamadas no dejan el pedido escrito — no alimentan inventario ni al asistente. Su mayor valor es resolver problemas (domicilio que no llega, dirección confusa), no tomar pedidos.

22. **[PENDIENTE · INSTAGRAM Y FACEBOOK] Responder esos canales desde Cobra sin la aprobación propia de Meta.** (2026-07-31)
   - **Situación:** Meta aprobó los permisos de WhatsApp pero NO los de Instagram/Facebook. El chat de Cobra YA soporta los tres canales; falta el permiso.
   - **VERIFICADO (2026-07-31):** las cuentas conectadas en `chat_channels` están MAL — la página de Facebook es "Cobra Pos" (software, id 1178311018696826) y el Instagram es @sergiosaac_ (personal de Sergio, ig_id 17841457184405667), ambas del 17-jun. Sergio confirma que las conectó "para probar". El Parche NO pertenece a Cobra: para Meta son cuentas de TERCEROS.
   - ❌ **DESCARTADO — el modo desarrollo NO sirve.** Verificado en la doc de Meta: mientras la app no esté aprobada, la página solo intercambia mensajes con cuentas que tengan rol de Admin/Developer/Tester en la app. Eso obligaría a que CADA CLIENTE fuera tester → inservible en producción. (Yo se lo había planteado mal antes; corregido.)
   - Meter a El Parche en el Business Manager de Cobra (Solicitar acceso a la página + asignar la app) SÍ hace falta para gestionar sus cuentas, pero NO reemplaza la aprobación.
   - **Camino A — rehacer App Review:** se necesita *Advanced Access* de `pages_messaging` + `instagram_manage_messages` y **verificación del negocio**. 🔜 **Sergio va a pasar el motivo exacto del rechazo** que le mandó Meta; sin eso no se sabe qué corregir. Causas típicas: video que no muestra el flujo completo, política de privacidad inaccesible, verificación de negocio incompleta.
   - **Camino B — proveedor con permisos propios (ELEGIDO por Sergio para avanzar mientras tanto).** ⚠️ OJO al elegir: la mayoría del mercado (Callbell, Leadsales, Trengo, Chattigo) son BANDEJAS DE ENTRADA que competirían con el chat de Cobra y partirían los pedidos en dos sistemas. Se necesita una TUBERÍA (API + webhook), no una bandeja. Candidatos con API real: Twilio, Infobip, Gupshup, Bird, Respond.io.
   - **Criterios a verificar antes de contratar (pendiente de investigar a fondo):** (1) que soporte Instagram **y** Messenger, no solo WhatsApp; (2) que permita conectar cuentas de TERCEROS (los restaurantes clientes); (3) **que NO obligue a migrar el WhatsApp actual** — el de El Parche ya funciona y moverlo sería romper lo que sirve por dos canales que casi no se usan; (4) costo real por conversación en Colombia.
   - 🔜 **TIKTOK TAMBIÉN (pedido de Sergio 2026-07-31):** TikTok SÍ tiene *Business Messaging API* con un programa oficial de **Messaging Partners** (mismo esquema que los BSP de Meta: se accede por socio autorizado, no con app propia). Cobra ya tiene la fila `tiktok` en chat_channels (meta vacío) y las funciones tiktok-webhook / tiktok-oauth-callback / tiktok-check-webhook. **El proveedor ideal sería uno que sea socio de Meta (IG+Messenger) Y Messaging Partner de TikTok**, para resolver los tres canales de una vez. Añadir ese requisito a la comparación. Doc: business-api.tiktok.com/portal/docs/direct-messages/v1.3
   - **Recomendación dada:** no frenar el producto por IG/FB/TikTok (WhatsApp es la enorme mayoría de los pedidos); corregir App Review en paralelo y usar el proveedor solo si urge tener los demás canales.

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

## ✅ HECHO — [Contabilidad] El domicilio ya NO infla las ventas — confirmado por Sergio 2026-07-31

**Problema:** hoy `pos_orders.total = comida + empaque + domicilio` (domicilios.js:1539), y el dashboard suma `o.total` en TODAS las métricas de ventas (dashboard.js:181,242,258-260,687,701,897). Por eso el **domicilio se cuenta como venta**. En el caso de Sergio el domicilio NO es ingreso suyo: el cliente le paga todo (ej. por transferencia) y él le pasa el valor del domicilio al domiciliario. Resultado: ventas infladas por la suma de los domicilios.

**Lo que Sergio SÍ quiere conservar:** en el desglose por método de pago, la transferencia debe seguir mostrando el monto COMPLETO (ese dinero sí entró). No reducir la transferencia.

**Propuesta (aprobada en concepto, faltan 2 detalles):**
1. **Ventas reales = total − delivery_fee** (sacar el domicilio de las métricas de venta del dashboard). Métodos de pago quedan completos.
2. **Registrar el domicilio como EGRESO** usando el sistema que la caja YA tiene (movimientos ingreso/egreso; cierre = base + ventasEf + ingresos − egresos, ver caja.js:432,434,1055). Así la caja cuadra (el efectivo que sale para pagar al domiciliario queda registrado) y se ve "pagado a domiciliarios" del turno.
3. Opcional: tarjeta resumen "Domicilios cobrados vs pagados a domiciliarios".

**DECISIÓN FIRME (Sergio 2026-07-24):** el valor del **domicilio NUNCA se suma en las VENTAS** — ni con domiciliario interno ni externo. "Las ventas son las ventas" (= la comida). El domicilio va SIEMPRE a una **estadística aparte**.
- **Ventas (todas las métricas): solo comida = `total − delivery_fee`** (o `subtotal + empaque`). Aplica a: dashboard → Meta diaria y el desglose por canal (Salón/Domicilio/Venta rápida, el "DOMICILIO" debe mostrar solo la COMIDA vendida por domicilio, sin el envío); "Ventas Hoy"; y el desglose por canal de la Caja.
- **Nueva estadística separada "Domicilios":** detalle de todos los envíos cobrados en el periodo/turno, con distinción **interno vs externo**:
  - **Externo:** pass-through (entra y sale al domiciliario). Se maneja con el egreso ya diseñado.
  - **Interno (repartidor propio/a sueldo):** el envío SÍ es ingreso del restaurante (de ahí le paga al repartidor), pero **igual NO es "venta de comida"** → va en esta estadística de domicilios como ingreso por servicio, no en ventas.
- La distinción interno/externo NO decide si entra a ventas (nunca entra); solo cambia cómo se lee la estadística de domicilios. Necesita saber por pedido si fue interno o externo (hoy hay `delivery_person`; quizás falte un flag interno/externo o inferirlo de si el domiciliario es de la lista interna).
- **Implementación:** cambiar los reduce de ventas de `o.total` → `(o.total − (o.delivery_fee||0))` en dashboard.js (líneas 181,242,258-260,687,701,897) y en caja.js donde aplique; y agregar la tarjeta/stat de Domicilios (cobrado por envíos, split interno/externo). Ojo: usar `paid_amount` real cuando corresponda (hay domicilios donde solo se cobró la comida, sin envío).

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


> **Nota (2026-07-31):** Sergio confirmó de memoria que estos quedaron hechos.
> **Cuando se termine toda la lista de pendientes se hará una auditoría** para
> verificar que cada uno quedó bien de verdad.

## ✅ HECHO — [Inventario] Sub-inventario / inventario en DOS NIVELES (Bodega vs En servicio) — confirmado por Sergio 2026-07-31

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

## ✅ HECHO — [Inventario] Control MANUAL de disponibilidad por insumo ("86") — confirmado por Sergio 2026-07-31

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

**EXTENSIÓN vía WhatsApp (Sergio 2026-07-24) — para cuando se hagan las configs del bot / Modo Gerente:** desde las cuentas de WhatsApp AUTORIZADAS (gerente), poder mandar una **nota de voz o texto** tipo "se acabó el pollo" / "se acabó la carne" / "ya hay pollo" → el bot lo interpreta y **marca/desmarca el insumo como agotado automáticamente** (mismo efecto que la cajera tocando el interruptor → se bloquea/desbloquea en todas las tablets por realtime). Es el mismo mecanismo con el que se piensa **registrar compras** por WhatsApp: hablarle al bot para mover inventario. Requiere: transcripción de voz (Whisper) + parseo de intención ("agotar/reponer insumo X") + validación de que el número esté autorizado. Ver sección "Modo Gerente en el bot IA" más abajo.

---

## PENDIENTE — [Caja] Modo "CIERRE CIEGO" (caja ciega) — Sergio 2026-07-24

**Qué es:** un control contáble donde el cajero cuenta el efectivo SIN ver cuánto debería haber, para que no pueda "acomodar" el conteo. Es un interruptor en las **configuraciones del administrador** que cambia la vista de caja.

**Comportamiento cuando "Caja ciega" está ACTIVADA (para el rol cajero/no-admin):**
- El empleado **NO ve:** ventas, transferencias, desglose por canal, base esperada, ni estadísticas sensibles del restaurante.
- El empleado **SÍ puede:** abrir caja, cerrar caja y hacer el **arqueo** (contar el efectivo físico, billetes/monedas).
- **Clave (lo "ciego"):** al hacer el arqueo NO se muestra el "efectivo esperado" — solo el campo para contar. Cuenta a ciegas.
- Después de contar, el sistema le dice si quedó **cuadrado o descuadrado y por cuánto** (la diferencia). Nada más.
- El admin/gerente sigue viendo TODO (la vista completa actual).

**Dirección técnica:**
- Interruptor en Configuración (guardar en `operacion_config.cajaCiega` — sincroniza a la tablet, como el resto).
- En caja.js/caja.html: si `cajaCiega` ON y el rol no es admin/gerente → ocultar las secciones sensibles (hero de ventas, "Ventas por canal", "Cómo se compone / total esperado", ingresos/egresos si aplica) y dejar solo apertura/cierre/arqueo.
- En el ARQUEO: no pre-mostrar el "esperado"; el usuario cuenta, guarda, y ahí recién se revela cuadrado/descuadrado + diferencia (ya existe el cálculo: `esperado = base + ventasEf + ingresos − egresos`, arqueo_diff = contado − esperado, caja.js:1087-1092).
- **DECISIÓN (Sergio 2026-07-24): es POR ROL** (no por config global). El gerente/admin SIEMPRE ve la vista completa; los roles que se definan (ej. cajera) ven la vista ciega. Implementar con el sistema de permisos existente (`pos_roles.perms`): un permiso tipo **`caja.ver_completa`** (o `caja.estadisticas`) — rol CON el permiso → vista completa; rol SIN el permiso → vista ciega (solo abrir/cerrar/arqueo, sin esperado ni ventas/transferencias). Agregar ese permiso a la tabla de permisos y al editor de roles.

**Nota:** el módulo de caja actual quedó "perfecto" (palabras de Sergio) — esto es una VISTA alterna, no cambiar la actual.

---

## 🏁 LO ÚLTIMO DE TODO — INSTALADOR para vender — Sergio 2026-07-31

> **Orden acordado con Sergio:** primero todo lo demás → después **facturación
> electrónica** → y **de últimas el instalador**. Es el paso final para empaquetar
> Cobra y venderlo.

**Objetivo:** que el cliente descargue un archivo, siga un paso a paso y quede
todo instalado, sin hacer nada más.

### Estado real (verificado 2026-07-31) — está al 90%
`C:\Prueba Claude Code\cobra-pos-electron\package.json`:
- `electron-builder` ^24.13.3 y **`electron-updater` ^6.3.4 ya instalados**
- Bloque `nsis` YA configurado: `oneClick:false`, elegir carpeta, acceso en
  escritorio y menú inicio
- `build.win.icon` apuntando al ícono azul oscuro correcto
- **Falta:** `build.win.target` está en `"portable"` → pasarlo a `"nsis"` y
  `npm run build`
- **Falta:** `build.publish` está SIN CONFIGURAR → sin esto no hay auto-update

**⚠️ Aviso:** el último rebuild del .exe se hizo con `@electron/packager`, NO con
`electron-builder`, por un problema que hubo con este último. Al retomar,
verificar que `electron-builder` compile bien antes de dar por hecho el camino.

### Cómo funcionan las actualizaciones (respuesta a la pregunta de Sergio)

**Lo clave: la app CARGA EL SITIO EN VIVO** (`main.js` hace `loadURL` a
`cobrapos.app`). Eso significa que hay **dos tipos de actualización**:

**1. Cambios de la aplicación (el 95%)** — pantallas, informes, cálculos, arreglos.
   **Llegan solos, al instante, sin instalar nada.** El cliente recarga y ya
   tiene la versión nueva. No hay que avisarle ni pedirle que actualice.
   *(Ojo: por eso importa tanto el cache-bust `?v=` en los HTML.)*

**2. Cambios del programa de escritorio (raros)** — impresión, lector NFC,
   comportamiento de la ventana. Solo eso necesita un .exe nuevo.
   Con `electron-updater` + `build.publish` configurado (GitHub Releases o un
   servidor propio):
   - La app consulta al abrir si hay versión nueva
   - La descarga **en segundo plano**, sin molestar
   - Muestra un aviso: *"Hay una actualización lista — reiniciar"*
   - Al reiniciar, queda actualizada

   El cliente **nunca vuelve a descargar nada a mano**. Solo instala una vez.

### Pendiente aparte: FIRMA DE CÓDIGO
Sin certificado, Windows muestra *"Windows protegió tu PC — Publicador
desconocido"* al instalar. Se puede seguir de largo, pero para vender da mala
impresión. Un certificado OV cuesta alrededor de USD 200-400/año.
**Es decisión de negocio de Sergio**, no técnica. Se puede lanzar sin él y
agregarlo cuando haya volumen.

### Checklist para ese día
- [ ] Verificar que `electron-builder` compile (ver aviso de arriba)
- [ ] `build.win.target` → `nsis`
- [ ] Configurar `build.publish` (GitHub Releases es lo más simple)
- [ ] Probar el ciclo completo: instalar → publicar una versión → ver que avise
- [ ] Decidir si se compra certificado de firma
- [ ] Instalador de la APK/tablet si aplica

---

## PENDIENTE — [Inventario] EMPAQUES Y DESECHABLES como insumo — Sergio 2026-07-31

**Estado hoy (verificado):** el empaque es SOLO UN PRECIO. Hay **51 pedidos con
`packaging_fee` cobrado** y **0 movimientos de inventario por empaque**. No
existe ningún insumo de desechables. O sea: se le cobra al cliente pero el
costo no está en ninguna parte → **el margen por producto está inflado**.

**Lo que pidió Sergio:** saber cuánto se gasta en empaques, cuánto queda en
inventario, y que se descuenten solos como los insumos. Él mismo identificó la
dificultad: *"lo más difícil son los vasos y las servilletas porque son
inciertos"*.

### Caso A — Empaques DETERMINISTAS: **no requiere código nuevo**
Bandeja, tenedor, bolsa del domicilio. Cada salchipapa lleva exactamente una
bandeja → **es una receta**. Se crean como insumos (categoría "Desechables") y
se agregan a `iv_recetas` como cualquier ingrediente.

Sale gratis, con lo ya construido:
- Descuento automático al vender (`fn_iv_consumir_item`)
- Stock, mínimos y alertas
- Gasto en empaques en el informe `inv-compras`
- **El margen por producto se vuelve real** (hoy la bandeja no está contada)

**Esto es tarea de Sergio, no de desarrollo:** crear 3-4 insumos y meterlos en
las recetas.

### Caso B — Empaques INCIERTOS: sí requiere construir
Servilletas y vasos. **El error sería meterlos en la receta del producto**: no se
gastan por plato sino **por PERSONA**. Quien pide dos platos no usa el doble de
servilletas.

**Propuesta — insumo de "consumo general"** con tasa estimada:
- `iv_insumos.consumo_general` (boolean) + `consumo_por` ('persona' | 'pedido')
  + `consumo_tasa` (numeric).
- Al cerrar el pedido se descuenta `tasa × guests` (o × 1 si es por pedido).
  `pos_orders.guests` YA se registra (167 personas este mes).
- Queda en `iv_movimientos` con motivo `consumo estimado`, distinguible del
  consumo por receta.
- **Se autocorrige con el cuadre de stock** (ya construido): la diferencia entre
  lo estimado y el conteo real dice si la tasa está mal. Si estimaste 2,5
  servilletas por persona y gastas 4, se ve en un mes.

**Antes de programarlo, Sergio debe MEDIR:** contar servilletas hoy y en dos
semanas, para tener la tasa real en vez de adivinarla.

### Conexión con lo demás
- Es el complemento natural del informe de **gastos** (sección de arriba): los
  desechables son un gasto recurrente importante.
- Mejora `inv-margen` e `inv-foodcost`, que hoy ignoran el costo del empaque.
- El `packaging_fee` que se le cobra al cliente pasa a tener su costo al lado:
  ahí se ve si el empaque se está cobrando bien o se está perdiendo plata.

---

## PENDIENTE — [Configuración] Tono y volumen de las notificaciones — Sergio 2026-07-31

**Lo que pidió:** una parte en Configuración para elegir el **tono** del mensaje
y el **volumen**.

### Estado hoy (verificado)
El sonido es un pitido generado por código (WebAudio: 880 Hz → 660 Hz, 0,28 s),
**con volumen fijo en 0.09** y **duplicado en dos archivos**:
- `pos-notify.js` línea 31 → `beep()`
- `chat-ia.js` línea 215 → `chatBeep()`  *(el mismo código, copiado)*

No hay forma de cambiarlo ni de bajarlo. En un restaurante con ruido puede que
no se oiga; en uno silencioso, que moleste.

### Qué hay que construir
1. **Unificar primero.** Un solo `posSonido()` (en `pos-notify.js`, que ya lo
   cargan casi todas las pantallas) y que `chat-ia.js` lo use. Hoy hay dos copias
   del mismo código: cambiar el tono en una no cambia la otra.
2. **Sección en Configuración → Operación** (o "Notificaciones"):
   - **Tono:** varias opciones (campana, pitido, marimba, ding, alerta corta) con
     botón **▶ Probar** al lado de cada una. Sin probar, nadie elige a ciegas.
   - **Volumen:** deslizador 0-100%. Que suene mientras se arrastra.
   - **Silencio:** interruptor para apagarlo del todo.
3. **Tonos distintos por evento** (esto es lo que de verdad sirve):
   | Evento | Por qué separarlo |
   |---|---|
   | Mensaje nuevo del cliente | El más frecuente |
   | Pedido nuevo | Hay que actuar ya |
   | Pago recibido / verificado | Buena noticia |
   | Alerta (stock, error) | Debe sonar distinto |
   Con el tiempo el equipo aprende a distinguirlos sin mirar la pantalla.
4. Guardar en `branches.operacion_config.sonidos` → sincroniza a todos los
   equipos como el resto de Operación.

### Ojo
- **Los navegadores bloquean el audio** hasta que el usuario interactúe con la
  página. Si el sonido no suena tras recargar, es eso — hay que avisarlo en la
  pantalla de configuración, no dejar que parezca un bug.
- Si se usan archivos de audio en vez de tonos generados, deben ir **empaquetados
  en el repo** (no CDN): el .exe debe sonar aunque el internet esté lento.
- Mantener el tono generado como respaldo si el archivo no carga.

---

## PENDIENTE — [Pagos] Botón "Verificar transferencia" en la pantalla de cobro — Sergio 2026-07-31

**Lo que pidió:** en la pantalla de cobro (`pagos.html`), cuando el cliente paga
por **Transferencia**, un botón para verificar el pago ahí mismo — *"así un
empleado lo puede hacer de manera sencilla"*.

Hoy el empleado tiene que creerle al cliente o irse a mirar el correo del banco
a mano. En una venta de mostrador eso no es práctico.

### Lo que YA existe (reusar, no rehacer)
- **`verificar-pago-manual` (v10)** — verificación bajo demanda. Lee las
  **notificaciones del banco en Gmail** de esa sucursal y busca una
  transferencia por el monto esperado.
- **`verify-transfer` (v19)** — la verificación automática del bot.
- En el chat ya hay UI: `verificarPagoModal()` en `chat-ia.js`, con su modal de
  resultado (verificado / no verificado) y el botón para registrar el pago.

### ⚠️ El obstáculo (esto define el trabajo)
`verificar-pago-manual` **exige `conversation_id`**:
```
const conversationId = String(b.conversation_id || "");
if (!conversationId) return { verified:false, razon:"input", ... }
```
Lo usa solo para sacar el `branch_id` y los datos de contacto. **Pero una venta
de mostrador NO tiene conversación de WhatsApp**, así que hoy no se puede llamar
desde `pagos.js`.

**Qué hay que hacer:** agregarle un modo sin conversación — que acepte
`branch_id` + `monto` (y opcionalmente una ventana de tiempo) y haga la misma
búsqueda en Gmail. Es un cambio pequeño en la Edge Function: la lógica de
verificación ya no depende de la conversación, solo la obtención del branch.

### Cómo debería verse
1. El empleado elige **Transferencia** en el cobro.
2. Aparece un botón **"Verificar transferencia"** (solo con ese método).
3. Al tocarlo: busca en las notificaciones del banco una transferencia por el
   monto que falta, en los últimos N minutos.
4. Resultado claro:
   - ✅ **Verificado** — muestra monto, hora y de quién viene; deja aplicar el
     pago con un toque.
   - ❌ **No encontrado** — dice qué se buscó (monto y ventana de tiempo) y deja
     reintentar o aplicar el pago a mano bajo responsabilidad del empleado.

### Reglas
- **Nunca aplicar el pago solo**: verificar y aplicar son dos pasos. Lo aprendido
  con "marcar pagado" del chat (entrada 57): un botón que promete y no cumple es
  peor que no tenerlo.
- **Si falla, decir por qué.** Nada de fallar en silencio.
- Debe funcionar en **venta rápida y en mesa**, no solo en domicilios.
- Requiere que la sucursal tenga **Gmail conectado** (`ia_config.gmail_*`). Si no
  lo tiene, el botón no debe aparecer — o debe explicar que hay que conectarlo.

---

## 🔴 URGENTE — [Chat IA] Productos en $0 al crear pedido — Sergio 2026-07-31

**Caso real** (Shirley Cantillo, 7:59 p.m.): el modal mostró
`Salchipapa · Personal · Pollo` **sin precio · $0** y el total del pedido en **$0**.

### Causa (identificada)
**No existe ningún producto llamado "Salchipapa"** — verificado:
`SELECT count(*) FROM pos_products WHERE name ILIKE '%salchipapa%'` → **0**.

"Salchipapa" es la CATEGORÍA (Salchipapas Tradicionales / Especiales). El
producto real es **"Pollo"**, y su presentación Personal **sí tiene precio: $17.000**.

Es decir: **GPT devolvió el nombre de la categoría como si fuera el producto**,
no encontró ese producto en el catálogo, y quedó sin precio. El modal lo mostró
igual con "sin precio" en vez de bloquear.

**Ya existe un guardarraíl parcial** en `delay-reply` (~línea 1292:
*"producto GPT inválido — descartado (no está en el catálogo)"*), pero
`extraer-pedido` / el modal **no lo aplican**: dejan pasar el producto sin precio.

### Qué hay que hacer
1. **En `extraer-pedido`:** si el producto no empareja con el catálogo, intentar
   resolverlo por categoría + variante antes de rendirse
   (`Salchipapa` + `Pollo` → producto "Pollo" de Salchipapas Tradicionales).
2. **Nunca dejar un ítem sin precio.** Si no se puede resolver, el modal debe
   marcarlo en rojo y **no dejar guardar** hasta que se elija el producto real.
   Un pedido en $0 que se guarda es plata perdida.
3. ~~"Premium" y "Maicitos Especial" tienen dato mal cargado~~ **← ESTO ESTABA MAL.**
   **Corrección de Sergio (2026-07-31):** *"cuando un producto tiene variantes,
   el precio lo tienen las variantes; cuando no tiene variantes, el precio va en
   la presentación. Todo está implementado en el sistema, solo necesitas que lo
   identifique el bot."*
   **Verificado y es exactamente así:** `Premium` tiene `variables` con
   `isPricing: true`, y cada opción trae `price` + `prices: [Familiar, Personal]`
   (ej. Pollo → `[60000, 28000]`). Las presentaciones en 0 **son correctas**: el
   precio no vive ahí.
   **Y `extraer-pedido` YA lo implementa** (líneas 238-261: `priceMode==='matrix'`,
   busca el grupo con `isPricing` y lee `prices[presIdx]`). O sea que el motor de
   precios NO es el problema.

### 🔴 SEGUNDO CASO (Jimmy, 8:06 p.m.) — el nombre SÍ era correcto y falló igual
```
Mixta · Familiar          sin precio   $0
Coca Cola · 1.5 Litros    sin precio   $0
```
**"Mixta" y "Coca Cola" son nombres EXACTOS del catálogo** (Mixta Familiar =
$49.000; Coca Cola 1.5 Litros existe en Bebidas). Aquí GPT **no** devolvió la
categoría — devolvió el producto bien — **y aun así `matched:false` y $0**.

**Esto invalida la teoría de que el problema es solo "GPT devuelve la categoría".**
El emparejamiento está fallando de forma general, y también en **Bebidas**, que
no tiene variantes ni ambigüedad. Sergio: *"sigue pasando con varias, en especial
las tradicionales, y la bebida tampoco"*.

**Empezar por aquí mañana:** reproducir con Coca Cola 1.5 Litros, que es el caso
más simple posible (producto único, sin variantes, precio en la presentación).
Si ESE falla, el problema está en la resolución de producto/presentación, no en
la lógica de categorías ni en la de variantes.

**Nota de método:** no se puede probar `extraer-pedido` mandándole un texto
suelto — lee los mensajes de la conversación, no el parámetro. Para reproducir
hay que usar una conversación real o de prueba con los mensajes dentro.

### El primer caso (Shirley) — era el caso FÁCIL
```
00:55  Shirley: "Una salchipapa pollo personal"
```
**Categoría, producto y presentación, los tres explícitos.** Como bien dijo
Sergio: *"nuestra preocupación era que la gente no dijera la palabra salchipapa,
pero en este caso sí la dijo, o sea que debió haber sido más fácil"*. Si falla el
caso ideal, el sistema de capas no se está aplicando donde debe.

**Y `catPalabras()` sí maneja el plural** (línea 104: por cada palabra mete
`salchipapas` y `salchipapa`), así que la CAPA 1 tenía que emparejar las dos
categorías de Salchipapas. El fallo está después: la CAPA 2 no resolvió el
producto "Pollo" dentro de esas categorías y devolvió `matched:false`.

**Sospecha a revisar primero:** "Pollo" existe DOS veces —
como **producto** (Salchipapas Tradicionales, Personal $17.000) y como **variante**
de Premium ($28.000). Puede que el desempate entre "producto" y "variante" esté
mandando a "Pollo" por el camino equivocado.

### ✅ FALSA ALARMA — el precio que cotizó el bot estaba BIEN (corregido 2026-08-01)
```
00:59  Bot: "serían $18.000 de tu pedido y $5.000 del domicilio, total $23.000"
```
Anoté esto como bug diciendo que Salchipapa Pollo Personal vale $17.000 y el bot
cobró $18.000. **Estaba equivocado: comparé contra el precio pelado y olvidé el
empaque.** Sergio lo corrigió: *"si son $18.000, ese mensaje le está dando los
$17.000 del pedido + $1.000 del empaque"*.

Verificado en `branches.operacion_config`: `empaqueTipo: fijo`,
`empaqueMonto: 1000`, `empaqueBase: unidad`. Entonces
**$17.000 + $1.000 = $18.000**. El cálculo del bot es correcto y **no hay que
unificar nada por este motivo**.

**Regla para no repetir el error:** antes de declarar mal un precio del bot, hay
que sumarle SIEMPRE el empaque (y la propina si estuviera activa). El precio de
`pos_products` NO es lo que paga el cliente.

### Bug 3 en la misma pantalla: el barrio no se autocompleta
El campo Barrio salió vacío y dijo *"No reconocí el barrio en tu tabla de zonas"*,
aunque:
- La clienta **tiene barrio guardado**: `pos_clientes.barrio = 'Monteluna'`, y su
  dirección guardada es `{"dir":"Monteluna casa 45","barrio":"Monteluna"}`.
- El desplegable de direcciones mostró correctamente *"Monteluna casa 45 · Monteluna"*.

**Dos cosas:**
- Al abrir el modal con una dirección guardada, el barrio debe llenarse SOLO
  (hoy solo se llena al elegir del desplegable a mano).
- **"Monteluna" NO está en la tabla de zonas** (verificado: 0 coincidencias).
  Por eso no calculó el domicilio. Sergio debe agregarlo en
  Configuración → Chat IA → Domicilios, o usar el aprendizaje de barrios que ya
  existe (`pos_domi_aprendidos`).

---

## PENDIENTE — [Ventas] El reloj de la tarjeta de domicilio engaña — Sergio 2026-07-31

**Sergio reportó:** *"los pedidos que están en camino llevan casi 1 hora en
camino y se tuvieron que haber puesto entregados automáticamente"*.

**NO era un bug del auto-entregado — ese funciona.** Verificado:
- `cron.job #1 auto-entregado-domi` corre cada 3 min, todas las ejecuciones
  recientes `succeeded`.
- `auto_entregar_domicilios()` marca entregado cuando
  `estado_at < now() - auto_entregado_min` (configurado en **30 min**).
- Al revisar: David llevaba **29 min** en camino y Valentina **25 min**. Les
  faltaba 1 y 5 minutos. Iban a marcarse solos.

**El problema real es el RELOJ de la tarjeta:** muestra `52:10`, que es el
tiempo **desde que se creó el pedido**, no el tiempo **en el estado actual**.
Por eso parecía que llevaban una hora en camino cuando llevaban 29 minutos.

**LO QUE HAY QUE HACER (definido por Sergio):** *"aplicar el mismo sistema de
reloj que en mesa: se debe reiniciar cada vez que cambie de estado y mostrar
cuánto se ha demorado en cada estado"*.

1. **El reloj se REINICIA en cada cambio de estado.** Cuenta desde `estado_at`,
   no desde `created_at`. Al pasar de "en preparación" a "en camino", vuelve a 0.
2. **Guardar el tiempo de CADA estado**, no solo el actual — para poder decir
   *"12 min en preparación · 8 min listo · 29 min en camino"*.
3. **Modal de desglose** al tocar el reloj, igual que en las mesas.
4. Aviso visual cuando se acerque al umbral de auto-entregado (30 min), para que
   el operador sepa que está por marcarse solo y no crea que el sistema se olvidó.

**Ya está resuelto igual en las MESAS** — reusar ese componente, no rehacerlo:
`VS_TS`, `vsEstadoDesde()`, `vsMarcarEstado()`, `vsAbrirTiempos()`, `vsFmtDur()`
en `modules/ventas-salon.js`, y la tabla `pos_mesa_tiempos`.
Para domicilios probablemente convenga una tabla equivalente (o reusar la misma
con el tipo de origen), porque `estado_at` solo guarda el ÚLTIMO cambio: con un
solo campo no se puede reconstruir cuánto duró cada etapa.

---

## PENDIENTE — [Chat IA] La tarjeta del pedido debe quedarse hasta ENTREGADO — Sergio 2026-07-31

**Lo que pidió:** *"En el chat quiero que la tarjeta del pedido no desaparezca
hasta que el pedido se haya entregado."*

**Hoy:** la tarjeta que se ve encima del campo de escribir (`cp-ohd`,
`chat-ia.js` ~2417) muestra el **borrador** ("Pedido sin enviar · Domicilio ·
$40.000 · Borrador") con sus botones Descartar / Editar / Enviar a cocina.
Al enviarlo a cocina, `pedido_borrador` se limpia y **la tarjeta desaparece**.
Desde ese momento el operador pierde de vista el pedido dentro del chat.

**Lo que debe pasar:** la tarjeta sigue ahí, cambiando de cara según el estado:

| Estado | Qué muestra la tarjeta |
|---|---|
| Borrador | Como hoy: Descartar · Editar · Enviar a cocina |
| En preparación | Total, hora, y botón para cambiar de estado |
| En camino | Igual + a quién se le asignó |
| **Entregado** | Ahí sí desaparece (o se colapsa a una línea) |

**Dónde está el dato:** el pedido ya queda enlazado en
`chat_conversations.order_id`, y su estado vive en `pos_orders.delivery_status`
/ `estado`. La tarjeta puede leer de ahí en vez de depender solo de
`pedido_borrador`.

**Ojo:**
- El selector de estado que ya existe arriba (En preparación / Listo / En camino
  / Entregado) debe quedar sincronizado con la tarjeta — que no haya dos formas
  distintas de ver lo mismo diciendo cosas diferentes.
- Debe actualizarse **en vivo** cuando el estado cambie desde Ventas o desde el
  propio chat, sin recargar.
- Para pedidos de mesa/venta rápida (sin entrega) el criterio es que desaparezca
  al quedar **pagado**.

---

## PENDIENTE — [Chat IA] El chat no toma el nombre del cliente recién creado — Sergio 2026-07-31

**Caso real** (Lau / 573204989138, pedido de las 6:58 p.m.):
Sergio le tomó el pedido a una clienta nueva. Los datos quedaron **bien
guardados**, pero el chat siguió mostrando el nombre de WhatsApp.

| | Valor |
|---|---|
| `pos_clientes.nombre` | **Laura Sofía** ✅ |
| `pos_clientes.barrio` | **Torres del Bosque** ✅ |
| `chat_conversations.contact_name` | **"Lau"** ← lo que se sigue viendo |

**Lo esperado (Sergio):** al guardar los datos de un cliente nuevo, el contacto
del chat debe pasar a mostrarse con **su nombre guardado + la etiqueta del
barrio**, automáticamente y sin recargar.

> **CONFIRMADO por Sergio (2026-07-31):** *"Recargué la ventana y ya salió todo
> perfecto, así que lo único que habría que hacer sería algo para que el cambio
> se vea reflejado en tiempo real."*
> **El alcance es solo el refresco.** El guardado, el cruce por teléfono y el
> pintado del nombre + barrio ya funcionan bien. No hay que tocar nada de eso.

### Causa (localizada)
`chat-ia.js` → `loadClientes()` (línea ~360) arma el mapa teléfono → {nombre,
barrio} en `S.clientesPorTel`, y `clienteDe()` lo usa para pintar el nombre y la
etiqueta de barrio.

**Se llama UNA SOLA VEZ**, en el arranque (línea 87, dentro del `Promise.all`
inicial). Al crear un pedido —que es cuando nace el cliente— **nadie vuelve a
cargar el mapa**, así que la conversación se queda con el nombre de WhatsApp
hasta que se recargue la página.

### Arreglo
1. Después de crear el pedido (`cpEnviarCocina` / `crear-pedido-chat` OK),
   llamar a `loadClientes()` y volver a pintar la lista y la cabecera del chat.
2. Hacer lo mismo al guardar datos desde la **ficha del contacto** (el drawer ya
   edita nombre, direcciones y barrio).
3. Idealmente refrescar solo esa conversación, no toda la lista, para no hacer
   parpadear la pantalla.

**Ojo:** NO tocar `chat_conversations.contact_name` en la base — ese campo es el
nombre del perfil de WhatsApp y lo actualiza Meta. El nombre del cliente debe
seguir saliendo del cruce por teléfono con `pos_clientes`, como está hoy.
Solo falta refrescar el mapa en el momento correcto.

---

## 🔴 URGENTE — [Chat IA] Prometió la carta y la mandó 44 MINUTOS DESPUÉS — Sergio 2026-07-31

**Caso real** (conversación con "Maykol", 573142379592, fuera del horario):

```
23:12:04  cliente : "Para ver la  carta"
23:12:19  bot     : "¡Claro! La carta la puedes ver aquí mismo. ¿Qué se te antoja? 🍟☺️"
                     ↑ texto de GPT, SIN imágenes
23:56:21  bot     : "¿Qué se te antoja? 🍟☺️"  + IMAGEN  ← 44 MINUTOS DESPUÉS
23:56:23  bot     : (sin texto)               + IMAGEN
```

**Sergio lo vio a las 6:55 p.m. y creyó que nunca se envió.** En realidad llegó,
pero 44 minutos tarde — para entonces el cliente ya se había ido.

### Lo YA descartado (no perder tiempo mañana)
- ✅ La carta **sí está configurada**: `ia_config.menu_imagenes` con 2 URLs.
- ✅ Las imágenes **son válidas y accesibles**: HTTP 200, `image/png`,
  1,58 MB y 1,09 MB en `raw.githubusercontent.com`. No es un problema de URL.
- ✅ Es **la misma sucursal** (66e5f12d) y la misma `ia_config`. No es un tema
  de multi-canal.
- ✅ La palabra clave **coincide**: `menuKw` incluye `"la carta"` y el mensaje
  fue "Para ver la carta". `wantsMenu` tenía que dar true.

### La hipótesis (por confirmar con logs)
En `delay-reply` (v195) pasaron **dos cosas que deberían ser una sola**:
1. A las 23:12 respondió **GPT** con texto inventado ("la puedes ver aquí mismo")
   sin enviar imágenes.
2. A las 23:56, **sin ningún mensaje entrante nuevo**, corrió el bloque de la
   carta (línea ~535) y mandó las imágenes con su frase configurada.

O sea: el bloque de la carta y el de GPT **no están coordinados**, y el de la
carta se ejecutó tardísimo. Sospechas a revisar:
- El mecanismo de **batching/delay** (`delay_segundos`) reprocesó el lote tarde.
- Algún **reintento** de la función que corrió el bloque 6 fuera de tiempo.
- El bloque 6 corre DESPUÉS del corte de modo automático (línea 533:
  `if (modoAsistente === "auto" && isOpen) return;`) — revisar si fuera de
  horario hay otro camino que llega antes a GPT.

### Y un defecto claro que hay que arreglar igual
El envío de imágenes **no revisa la respuesta de Meta** (línea ~545: `await fetch(...)`
sin mirar el resultado). Si Meta rechaza la imagen, nadie se entera y el bot
igual manda el texto prometiéndola. **Hay que verificar la respuesta y registrar
el error**, como se hizo con "marcar pagado".

### Regla de fondo
**El bot nunca debe prometer algo que no envió.** O manda la carta primero y
luego habla, o no dice que la está mandando. Un cliente que ve "aquí mismo" y no
recibe nada, se va.

---

## PENDIENTE — [Caja] Abrir caja: contar billete por billete (opcional) — Sergio 2026-07-31

**Lo que pidió:** que al abrir la caja se pueda elegir entre **escribir el monto
libremente** (como hoy) o **contar por denominaciones**, *"por si al cajero le
queda más fácil contar los billetes uno por uno"*.

### Estado hoy (verificado)
- El modal `#panel-abrir` (`caja.html:273`) solo tiene un campo de monto y
  botones rápidos ($100.000 / $200.000 / $300.000 / $500.000).
- **El conteo por denominaciones YA EXISTE, pero solo para el CIERRE**:
  `arqueo_denoms` / `arqueo_contado` / `arqueo_diff` en `pos_sessions`, con su
  planilla de paloteo e impresión (`caja.js:1114`, `1209`, `1248`).
- O sea: **la mitad del trabajo ya está hecha**, solo hay que reusar ese
  componente en la apertura.

### Qué hay que hacer
1. En el modal de abrir, un selector arriba: **"Escribir el monto"** (por
   defecto, como hoy) / **"Contar billetes"**.
2. Al elegir contar: mostrar la misma grilla de denominaciones del cierre. El
   total se calcula solo y llena `opening_cash`.
3. Guardar el detalle en una columna nueva `pos_sessions.apertura_denoms` (jsonb),
   igual que `arqueo_denoms`. Sirve para reimprimir la planilla de apertura y
   para auditar de qué se compuso la base.
4. Poder **imprimir la planilla de apertura**, igual que se imprime la de cierre.

### Ojo al hacerlo
- **No cambiar el flujo actual.** Escribir el monto a mano debe seguir siendo lo
  predeterminado: es más rápido y es lo que se usa a diario. Contar billetes es
  la opción, no la obligación.
- El componente de denominaciones distingue **billete vs moneda** para el
  $1.000 (existe en ambos). Al reusarlo hay que conservar esa distinción.
- Se conecta con el **cierre ciego** (pendiente aparte): si el cajero cuenta al
  abrir y al cerrar, el descuadre queda bien sustentado de punta a punta.

---

## PENDIENTE — [Contabilidad] GASTOS y GANANCIA NETA REAL — Sergio 2026-07-31

**Lo que pidió:** que el dueño sepa **cuánto está ganando de verdad**, mes a mes.
Hoy el sistema sabe lo que entra, pero no lo que sale de forma ordenada.

> *"Añadir algo con lo que el dueño pueda saber cuántos gastos tiene: servicios
> públicos, arriendo, nómina… que el sistema le ayude a hacer las cuentas, saber
> cuánto gastó en nómina, en servicios, en materia prima, y cuánto le quedó de
> ganancia neta, con comparativos, para que realmente sepa cuánto gana mes a mes."*

### Lo que YA existe (no rehacer)
- `pos_cash_moves` — egresos e ingresos de caja (tipo, monto, concepto, medio).
  **Le falta CATEGORÍA**: hoy todo es texto libre en `concept`, así que no se
  puede agrupar "cuánto va en servicios" vs "cuánto en nómina".
- `iv_movimientos` — las compras de materia prima, ya valorizadas.
- Informe `ger-ventascompras` — hace ventas − compras − egresos, pero con los
  egresos sin clasificar. Es la base sobre la que se construye esto.

### Lo que falta
**1. Categorías de gasto** (catálogo editable, con unas por defecto):
   materia prima · nómina · servicios públicos · arriendo · impuestos ·
   mantenimiento · transporte · publicidad · otros.
   Se agrega `categoria_id` a `pos_cash_moves`.

**2. Gastos FIJOS y RECURRENTES.** El arriendo y los servicios no se registran
   como un egreso de caja cualquiera: se repiten todos los meses y muchas veces
   se pagan por fuera de la caja (transferencia desde el banco).
   - Tabla `pos_gastos_fijos`: concepto, categoría, monto estimado, día del mes,
     activo.
   - El sistema **recuerda** cuando llega la fecha ("mañana vence el arriendo")
     y permite marcarlo como pagado con el monto real.
   - Distinguir **estimado vs real**: el recibo de luz varía cada mes.

**3. Nómina.** Es el gasto más grande y hoy no existe en el sistema.
   - Tabla `pos_nomina`: empleado, periodo, salario, extras, deducciones, pagado.
   - Se conecta con **asistencia** (pendiente aparte) para calcular horas.
   - Ojo: el consumo de empleados con **crédito** (ya implementado) debería poder
     descontarse de la nómina. Es la conexión natural entre las dos funciones.

**4. Informe de GANANCIA NETA (el que de verdad quiere).**
```
   Ventas del mes                      $ 3.791.000
   − Materia prima (compras)           $   ...
   − Nómina                            $   ...
   − Servicios públicos                $   ...
   − Arriendo                          $   ...
   − Otros gastos                      $   ...
   ─────────────────────────────────────────────
   = GANANCIA NETA                     $   ...     (margen %)
```
   Con **comparativo contra el mes anterior** (mismo tramo de días, como ya hace
   `ger-comparativo`) y la evolución de los últimos meses.

**5. Alertas útiles:** "este mes la nómina se llevó el 38% de las ventas",
   "los servicios subieron 22% frente al mes pasado".

### Advertencias
- **No mezclar la caja con la contabilidad.** Un gasto pagado por transferencia
  desde el banco NO puede afectar el arqueo de caja. Hay que separar
  *movimiento de caja* de *gasto del negocio*: todo gasto de caja es un gasto,
  pero no todo gasto pasa por la caja.
- **El domicilio sigue sin ser venta** (regla de oro): la ganancia neta se
  calcula sobre `total_final`, nunca sobre `total`.
- Esto **no es contabilidad formal** ni reemplaza al contador: es para que el
  dueño sepa cómo va su negocio. Decirlo claro en la pantalla.

### Por dónde empezar
Categorías de gasto (§1) — es lo más barato y ya mejora `ger-ventascompras`
inmediatamente. Después gastos fijos (§2), y nómina (§3) de último por su tamaño.

---

## PENDIENTE — [Puntos] Catálogo de canje + puntos como MÉTODO DE PAGO + 2 plantillas — Sergio 2026-07-31

### Lo que hay hoy
- **Se ganan:** `Math.floor(prod/1000)` → **1 punto por cada $1.000** del pedido
  (sin domicilio). En `chat-ia.js` ~2654, dentro de la respuesta rápida `puntos`.
- **Se guardan:** `pos_puntos` (telefono, puntos). **37 clientes** con puntos,
  15.562 en total; los reales tienen entre 60 y 84.
- **NO EXISTE regla de canje.** El sistema sabe DAR puntos pero no sabe qué se
  puede hacer con ellos. No hay configuración, ni catálogo, ni equivalencia.
- ⚠️ **Dato de prueba a borrar:** el teléfono `3000000001` tiene **14.098 puntos**.
  Limpiarlo ANTES de mandar cualquier plantilla que mencione el saldo.

### Lo que pidió Sergio para mañana
1. **Definir qué productos se pueden redimir** (él trae la lista).
2. **Catálogo de canje:** qué producto cuesta cuántos puntos.
3. **Puntos como MÉTODO DE PAGO** en la pantalla de cobro.
   ⚠️ **Regla que él dejó clara:** *"sólo servirán para redimir lo que se puede
   redimir en el catálogo de puntos"*. **NO es un método de pago general**: no se
   paga cualquier monto con puntos. Solo cubre los ítems que están en el catálogo
   de canje. El diseño debe impedir usar puntos para abonar a un pedido cualquiera.
4. **Elegir entre las dos plantillas** de abajo (él decide mañana).

### Las plantillas ya redactadas (falta que Sergio elija)

**PLANTILLA 1 — para quienes YA tienen puntos** (lleva variable)
```
¡Hola! 👋🔥 Te saluda El Parche Food 🍟

🎁 ¡Tienes {{1}} puntos acumulados! ⭐

😋 Ya puedes redimirlos por productos de nuestra carta. Solo escríbenos y te
contamos qué puedes llevar 🌭🍔

¡Te esperamos! 😊❤️
                                                    — El Parche Food
```
`{{1}}` = los puntos. Ejemplo para Meta: **73** (número real de un cliente).
**Falta:** completar con la regla de canje una vez Sergio la defina, para que no
quede vago y el cliente no tenga que preguntar cuánto vale.

**PLANTILLA 2 — invitación general (sin variables, aprueba más rápido)**

*Opción A — directa*
```
¡Hola! 👋🔥 Te saluda El Parche Food 🍟

⭐ ¿Sabías que acumulas puntos cada vez que pides? 🎉

🎁 Si ya tienes, escríbenos y los redimes por producto.
🛵 Y si aún no, con tu próximo pedido empiezas a sumar.

Solo recuerda dar tu número al pedir 📱

¡Te esperamos! 😊❤️
                                                    — El Parche Food
```

*Opción B — con gancho de pregunta* ← **recomendada**
```
¡Hola! 👋 Te saluda El Parche Food 🍟🔥

⭐ ¿Tienes puntos acumulados con nosotros?

🎁 Escríbenos y te decimos cuántos tienes para que los redimas.
🌭 Y si todavía no tienes, ¡tu próximo pedido ya suma!

¡Te esperamos! 😊❤️
                                                    — El Parche Food
```
**Por qué la B:** la pregunta invita a responder, y cada respuesta abre la
ventana de 24 h para conversar sin gastar plantilla.

**Nota de estilo (aprendida el 2026-07-31):** **NO usar variable de nombre.**
Sergio la rechazó en la plantilla anterior: *"hay muchas personas que tienen
nombres raros en su WhatsApp"*.

### Se conecta con
- El **nivel del cliente** (Estándar/Premium/VIP, entrada 55): los puntos y el
  nivel son dos cosas distintas y no hay que mezclarlas.
- La **tarjeta NFC** (idea pendiente): misma base de puntos por teléfono.
- Los **créditos** (entrada 65): son otro método de pago, pero con lógica
  distinta — el crédito es deuda, los puntos son premio.

---

## HECHO — [Fase 2] La tanda de WhatsApp la termina el servidor — 2026-08-09

El bucle que reintenta vivía en `wlEnviar()`: mandaba de a 250 y volvía a
llamar hasta 12 veces, **todo en la pantalla**. Cerrarla dejaba la tanda a
medias — por eso quedaron 110 contactos esperando.

**La cola ya estaba bien.** `pos_wa_envios` guarda el estado de CADA contacto,
así que nunca se le repite a nadie. Lo único que faltaba era alguien que
siguiera dándole al botón. Ese alguien es ahora un reloj en la base.

**Decisión de Sergio (le pregunté antes de construir):** sigue solo **la tanda
de HOY**. Al acabarse el cupo de 24 h o la lista, se desarma; mañana él vuelve
a darle. Es su regla de siempre — *nada automático sin que alguien apriete un
botón* — y aquí además cada mensaje cuesta plata.

**Piezas** (`sql/2026-08-09-envio-en-el-servidor.sql`):
- `pg_net` instalado (`pg_cron` ya estaba, lo usa `auto-entregado-domi`).
- `pos_wa_listas.envio_activo` + `envio_armado_at`.
- `pos_wa_continuar_tandas()` cada 2 min: por cada lista armada, si hay
  pendientes y cupo, una tanda más; si no, la **desarma**.
- `pos_wa_desarmar_viejas()` cada hora: corte de seguridad a las 24 h de
  armada, por si algo quedara colgado.

El botón **arma y suelta** (marca la lista + un primer empujón para que se vea
arrancar). La pantalla pasa de motor a **tablero**: dice *"ya puedes cerrar
esta pantalla"*, se refresca sola cada 20 s y ofrece **Detener**.

**Comprobado contra la base real:** con la lista desarmada el reloj no toca
nada; el corte de seguridad desarma una armada hace 30 h; **con el cupo lleno
(250/250) desarma en vez de mandar** — cero mensajes salieron en toda la
prueba; y la tubería base→función responde `200` con datos reales, probada con
`solo_contar` para no gastar ni un mensaje.

⏳ **Lo que NO se pudo probar:** el envío real, porque el cupo de 24 h estaba
lleno ese día. Se ve en la primera tanda de mañana.

---

## HECHO — [Fase 2] Auditoría de los `Promise.all` — 2026-08-09

`Promise.all` es **todo o nada**: si una promesa falla, la espera entera falla y
**lo que venía después no corre**. Cuando esas promesas cargan una pantalla, un
tropiezo de red la deja congelada — y sin error a la vista, porque el que
revienta es el `await`, no una función con su propio aviso.

**Revisados los 20 del sistema, uno por uno.** Solo **dos** eran peligrosos:

| Pantalla | Qué se perdía si una carga fallaba |
|---|---|
| **Historial** | `bindFilters()` y `loadAndRender()` — pantalla en blanco. Y las dos cargas (`loadUsers`, `loadTables`) solo traen **nombres para etiquetas**: el historial se caía por no poder traducir un nombre. |
| **Dashboard** | `loadPrintTimes()` y `setupRealtime()` — a medio pintar y **sin auto-refresco**. 5 de las 9 cargas no atrapan su error. |

**Los otros 18 se dejaron como estaban**, verificado en cada uno: o cada carga
tiene su propio `try/catch` (reservas ×5, impresoras ×4, caja ×3), o van dentro
de un `try` con reintento (los catálogos de venta ×3).

`allSettled` mantiene la velocidad —salen todas a la vez igual— pero la que
falla se queda en su rincón. **Lo que revienta se anota con su nombre**
(`[dashboard] carga "stock" falló:`), para no repetir el error del trigger de
puntos que estuvo cinco días callado.

Comprobado reproduciendo el patrón: con `all`, `pantalla_pintada:false` y
`auto_refresco:false`; con `allSettled`, ambos `true` y el fallo anotado.

---

## HECHO — [Fase 2] Un restaurante nuevo arranca solo — 2026-08-09

**Lo que le faltaba**, medido comparando un tenant de prueba contra El Parche:

| | El Parche | Nuevo |
|---|---|---|
| tenant · brand · branch · usuario | ✅ | ✅ (`provision` los crea) |
| **`pos_roles`** | 5 | **0** |
| **`ia_config`** | 1 | **0** |

**Lo grave era `ia_config`.** Las **siete** pantallas que guardan ahí hacen
`update ... eq('branch_id')`. Sobre una fila que no existe eso cambia **0 filas
y no da error** → la pantalla dice "Guardado ✓" y no guardó nada. Comprobado
sobre el tenant de prueba antes de tocar nada: `filas_cambiadas = 0`.
El dueño nuevo agrega Nequi, guarda, ve el visto bueno, y al otro día no está.

**Se arregló en la base, no en las pantallas.** Parchear siete sitios es
repartir la misma regla en siete lugares — el error que ya costó el menú
lateral, las respuestas rápidas y `payment_method`. En su lugar,
`sql/2026-08-09-restaurante-nuevo-arranca-solo.sql`:

- `trg_branch_ia_config` — **cada sucursal nace con su `ia_config`**, venga de
  `provision`, del panel o de multi-sucursal.
- `trg_tenant_roles` — **cada restaurante nace con sus 5 roles**
  (Administrador `system_role`, Cajero, Mesero, Cocinero, Domiciliario).
- Relleno de lo que ya existía: 3 sucursales sin `ia_config`, 2 tenants sin roles.

⚠️ `pos_roles.perms` es `text[]`, **no jsonb** — el primer intento falló ahí.
Falló a la vista y no se aplicó nada a medias.

**Comprobado creando un restaurante de verdad y borrándolo después:** nacieron
los 5 roles y la `ia_config`, y el guardado de métodos de pago pasó de
**0 filas a 1**, con el dato dentro. Los roles y la config de El Parche
quedaron intactos (verificado antes y después).

---

## HECHO — [Fase 2] Un pago se lee igual, se haya guardado como se haya guardado — 2026-08-09

**Lo que había de verdad** (pedidos de 60 días, contados en la base):

| Guardado | Veces | Quién lo escribe |
|---|---|---|
| `efectivo` / `transferencia` | 176 | `pagos.js` (nombre en minúsculas) y `domicilios.js` (botones fijos) |
| `Transferencia` / `Nequi` | 12 | el bot — texto libre de la conversación |
| `pm_q8ybbdpqb` | 2 | el id del método |
| `multiple` | 6 | marcador de pago mixto |

**Cuatro de las seis ya se traducían bien** — `pos-metodos.js` se construyó
justo para eso (`resolver` prueba por id, por nombre normalizado y por tipo).
Verificado corriendo el módulo real contra los valores reales antes de tocar
nada. **Fallaban dos:**

- `multiple` → "Otros". No es un método desconocido: es *pago con varios*, que
  es lo contrario de no saber. Ahora **"Varios métodos"**.
- `Nequi` → "Otros", aunque el pago sí se hizo por Nequi; lo que falta es que
  ese método esté configurado, no el dato. Ahora se muestra tal cual.

**Y la regla estaba repartida:** `historial.js` tenía su propia tabla con las
claves viejas en inglés (`cash`, `transfer`, `card`) que se iba quedando atrás.
Ahora todo vive en `pos-metodos.js` → `nombre()`, en este orden: método
configurado → marcador/clave vieja → **id interno = "Otros"** (garantía: un
`pm_...` no vuelve a salir en la pantalla de un cliente) → texto libre tal cual.

Comprobado: 6 valores reales + 9 casos límite = **15 de 15**.

---

## HECHO — [Fase 2] Fuera los rastros de El Parche + notas de venta rápida — 2026-08-09

**1. Notas frecuentes en venta rápida (bug que Sergio reportó el 7-ago).**
`posNotas.montar` se copió de domicilios, donde las categorías viven en
`S.cats`; en venta rápida se llaman `S.categories`. La función `categoria()`
buscaba en una lista inexistente, devolvía `''` y en el modo "por categoría"
eso deja la lista vacía — sin un solo error, por el `(S.cats||[])` que tapaba
el hueco. **Lección repetida:** copiar un bloque entre pantallas exige revisar
los nombres del estado de CADA pantalla.

**2. El Parche fuera del producto.** Lo que un restaurante nuevo se encontraba:
títulos "· El Parche Food" (Caja ×7, Inventario ×4, Catálogo ×2), "Reparte un
domiciliario de El Parche", el recibo del historial impreso con `<h2>El Parche
Food</h2>`, la vista previa de Impresoras, y — lo grave — **la semilla del chat**
(`DEFAULT_QUICK_REPLIES`, se usa con la base vacía): sembraba `/direccion` y
`/ubicacion` con la dirección y coordenadas de El Parche y `/QR2` con el número
de cuenta `0092726260`. Un cliente nuevo se los habría mandado a SUS clientes.

**El mecanismo:** `pos-brand.js` (que ya resuelve el nombre real y lo guarda en
`pos.brand.restaurante`) ahora rellena:
- `<span data-negocio>` → el nombre (o "Mi negocio")
- `<span data-negocio-suf>` → `" · " + nombre` (o vacío — el renglón queda
  "Caja", mejor corto que con el nombre de otro restaurante)

Banco de prueba: `tests/negocio.html`. Los informes de muestra
(`informes-data.js`) quedaron con nombres genéricos. Solo quedan menciones en
comentarios.

**3. Verificado, no arreglado:** el ítem "un comprobante puede pagar dos
pedidos" YA estaba cerrado (entrada 123, 7-ago) — la lista de Fase 2 lo tenía
como pendiente. Segunda vez que la lista dice pendiente algo hecho: **verificar
en el código antes de empezar cualquier ítem.**

---

## HECHO — [Velocidad] Los permisos del rol, guardados en el equipo — 2026-08-09

Cierra la tanda de `pos-cache`. `pos-perms.js` corre en 15 pantallas; a un
administrador no le cambia nada (su rol viene en la sesión, sin consulta) —
esto es para los **meseros**, que esperaban la consulta de `pos_roles` en cada
pantalla antes de ver sus botones.

⚠️ **La asimetría es AL REVÉS que la del plan.** `posGate()` ESCONDE botones,
así que el dato viejo peligroso es el que **niega**. Regla: lo guardado puede
**conceder al instante** (hoy, mientras carga, ya se concede todo — esa
dirección no empeora), pero para **negar** —esconder un botón, plantar el PIN,
frenar una página— se espera la confirmación de la base (`_confirmarSiNiega`).

- `posGate()` recuerda cada puerta (`_puertas`, con el display original) y la
  re-evalúa al confirmar, **en las dos direcciones**.
- La llave del caché lleva el rol (`perms.<rol>`): en un equipo se turnan un
  mesero y un cajero.
- El `'*'` de un fallo **no se guarda nunca**, y si el refresco de fondo falla
  habiendo permisos guardados, **se quedan los guardados** — esta fue una
  regresión que salió probando: el fallo pisaba lo guardado con `'*'` y un
  fallo de red le abría todo a un mesero.
- Al crear/editar/borrar un rol en Configuración, `_permsInvalidar()` borra los
  `perms.*` del equipo del dueño; el del mesero se corrige solo en su próxima
  confirmación.

Comprobado con el módulo real: permiso recién dado (el botón aparece solo y
`posGuard` no pide PIN), recién quitado (se esconde y el PIN vuelve), fallo sin
guardado (fail-open, no se guarda), fallo con guardado (se queda), y admin
(cero consultas).

---

## HECHO — [Velocidad] El plan y los métodos de pago, guardados en el equipo — 2026-08-09

Segunda tanda de `pos-cache`. Antes solo lo usaban catálogo, dashboard, salón y
pagos.

**`pos-plan.js` — 17 pantallas, 2 consultas SEGUIDAS** (`tenants.plan`, después
`pos_planes`) antes de poder decidir qué se puede usar. Los candados del menú
salían medio segundo tarde y quien entraba a una pantalla que no le tocaba
alcanzaba a verla.

⚠️ **Asimetría a propósito:** lo guardado **puede poner candados** en el menú
(es cosmético y se corrige solo) pero **NUNCA saca a nadie de una pantalla** —
`protegerPantalla()` arranca con `if (!ctx || !ctx.fresco) return;`. Echar a
alguien por un dato viejo es mucho peor que dejarlo entrar el segundo que tarda
la consulta.

**Tres fallos que salieron probando, todos invisibles sin banco de pruebas:**

1. **El refresco de fondo se llamaba a sí mismo.** `refrescarPorDetras()` pedía
   `cargar()`, que veía algo guardado, lo devolvía y programaba otro refresco.
   Nunca salía a internet y un candado viejo no se corregía jamás. Ahora
   `cargar(porRed)` puede saltarse lo guardado.
2. **Durante los dos viajes, `ctx` quedaba en `null`** y `puede()` respondía
   "sí" a todo (su modo "todavía no sé"). El candado dibujado, pero el clic
   pasando. No hace falta vaciarlo: `cargar(true)` ya ignora `ctx`.
3. **`marcarNav()` solo sabía PONER candados.** Si lo guardado decía "bloqueado"
   y la consulta decía que sí, el candado se quedaba. Ahora también los quita, y
   el aviso decide **en el clic** (`if (puede(k)) return;`) — un escuchador
   puesto una vez no se puede quitar después.

**`pos-metodos.js` — 7 pantallas.** Aquí no hace falta la asimetría: son nombres
para mostrar, no permisos. Al guardar en Configuración → Métodos de pago se
borra lo guardado (`posCache.borrar('metodos')`), así la pantalla siguiente trae
lo nuevo. Una lista **vacía no se guarda**: puede ser una consulta fallida y
dejaría la pantalla siguiente sin métodos.

**Falta:** `pos-perms.js` (15 pantallas). Solo consulta para roles que **no** son
administrador — o sea, beneficia a los meseros, no a Sergio. Ojo al hacerlo:
`posGate()` **esconde** elementos, así que un dato viejo puede ocultar un botón
que sí corresponde, y el refresco tendría que volver a mostrarlo.

---

## ARREGLADO — [Configuración] Los enganches que rompió la reorganización del Asistente IA — 2026-08-09

**Síntoma:** Sergio abría Configuración y no veía los barrios pendientes de
aprobar, aunque en `pos_domi_aprendidos` había 4 filas de su sucursal.
**Sin un solo error en la consola** — eso es lo que lo hizo invisible.

**Causa:** cada bloque se colgaba de SU pestaña buscándola por nombre:

| Bloque | Buscaba la pestaña | Existe hoy |
|---|---|---|
| Barrios por aprobar (`cargarAprendidos`) | `domicilios` | no — está en **Pedido** / fila `p-domi` |
| Contactos de WhatsApp (`wcCargar`) | `contactos` | no — está en **Difusión** / `d-contactos` |
| Plantillas de Meta (`wtpCargar`) | `plantillas` | no — está en **Difusión** / `d-plantillas` |
| Listas de envío (`wlCargar`, dentro de `activar()`) | `plantillas` | no |

Al reorganizar el Asistente IA en 6 pestañas, esas tres dejaron de existir.
`document.querySelector('.cia-tab[data-tab="domicilios"]')` devuelve `null`, el
`if (btn)` lo traga, y el bloque no se carga nunca. Callado.

**Arreglo:** un registro compartido en vez de cuatro copias de la misma idea.

```js
window.ciaAlAbrir(tab, acc, fn)   // se dispara con la pestaña O con la fila
```

`activar(tab)` y `ciaAcc(key)` disparan lo registrado. Cada `fn` va en su
`try/catch`: si un bloque revienta, los demás siguen cargando.

**Además:** los barrios por aprobar se cuentan en la fila plegada
(`ciasum-p-domi` → "3 por aprobar") y se cargan al abrir Configuración. Con la
fila cerrada, ese número es lo único que avisa que hay algo que mirar dentro —
si solo cargara al desplegarla, únicamente lo vería quien ya fue a buscarlo.

⚠️ **Lección:** al mover algo de sitio, buscar quién lo referenciaba **por
nombre**. Un selector que no encuentra nada no falla: devuelve `null` y el
código sigue como si nada.

---

## HECHO — [Reservas] "Crear con IA" — 2026-08-09

El botón y la ventana existían desde hacía meses y **no hacían nada**:
`ai-text`, `btn-ai-parse`, `ai-result` y `btn-ai-create` no tenían ni una línea
de código detrás. Se pegaba el mensaje, se tocaba "Analizar" y no pasaba nada.

**Motor:** Edge Function `extraer-reserva` (v4, `functions/extraer-reserva.ts`).
Recibe `{texto, hoy, abre, cierra}` y devuelve `{es_reserva, nombre, telefono,
personas, fecha, hora, notas, falta[], avisos[], entendido}`. `gpt-4o-mini`,
temperatura 0. No lee ni escribe en la base de datos.

**Regla de oro, la misma del bot de pedidos: no inventa.** Lo que el mensaje no
diga vuelve `null` y sale en `falta`, que la pantalla pinta como hueco amarillo.

**Cuatro decisiones que costaron una vuelta cada una:**

1. **El botón NO guarda la reserva.** Pasa al cajón de siempre con todo lleno,
   así la reserva pasa por las mismas comprobaciones que una escrita a mano
   (aviso de choque de mesa, mesa sugerida por capacidad) y una lectura
   equivocada se ve antes de guardar. Por eso el botón dice "Revisar y crear".
2. **La fecha de HOY la manda la pantalla**, no el servidor. El servidor vive en
   UTC y Colombia es UTC−5: a las 8 p.m. de un sábado ya cree que es domingo, y
   "mañana" saldría corrido un día.
3. **El teléfono lo saca una expresión regular, no el modelo** (10 dígitos
   empezando por 3). Para un número una regla no se equivoca; un modelo puede
   "corregir" un dígito y ahí se pierde el contacto.
4. **La frase de resumen la arma el SERVIDOR** (`fraseResumen()`), no el modelo.
   Cuando la escribía el modelo, con un mensaje sin hora los campos decían
   "falta la hora" y la frase decía "a las 12:00" — dos versiones de la misma
   reserva en la misma pantalla. Armada desde los campos ya validados, no puede
   contradecirlos.

**Y una que no se resolvió con el prompt:** "el 15" estando a 9 de agosto se iba
a septiembre. Explicarle la regla al modelo no bastó; el servidor hace la cuenta
y le entrega la fecha resuelta en el prompt (`ejemplo15`). Comprobado 5 veces
cada caso: 15/15.

**Comprobado de punta a punta** en un banco de pruebas con la pantalla real:
mensaje completo, faltan datos, no es reserva, hora fuera de horario, mensaje
vacío, y que al reabrir la ventana no queda el análisis del cliente anterior.

---

## HECHO — [Pagos] Los 7 arreglos de la pantalla de cobro — 2026-08-09

Lista que dio Sergio el 2026-08-08. Uno por uno:

**1. El aviso de "no le alcanza el saldo".** Eran tres `alert()` del navegador
en sitios distintos, y ninguno decía de quién hablaba. Ahora es
`posSaldo.modalInsuficiente({nombre, tiene, necesita, yaApuntado})` — mismo
patrón que `posCreditos.modalInsuficiente`, que ya existía. Muestra cuánto
tiene, cuánto falta y las dos salidas reales: cobrar la diferencia con otro
método, o recargar en la página. Lo llama `_sdAvisoSinSaldo()` en `pagos.js`
desde los tres puntos (al aplicar, al guardar abono, al finalizar).

**2 y 3. "Saldo El Parche" → "Billetera El Parche"**, con icono de tarjeta
prepago (chip + ondas) en vez del monedero.
⚠️ **El `tipo` interno sigue siendo `saldo`.** Eso NO se toca: es lo que llevan
los pagos ya registrados, y renombrarlo los dejaría sin método.
El nombre estaba GUARDADO en `ia_config.pagos`, así que se corrige en tres
puntas: `configuracion.js` (`_mpConFijos` renombra lo guardado si empieza por
"Saldo"), `pagos.js` (`_mpAplicarLista` lo corrige al pintar, para que se vea
ya sin esperar a que alguien vuelva a guardar) y `pos-metodos.js`, que **guarda
el nombre viejo como `_alias`** — sin eso, un cobro de la semana pasada
aparecería en "Otros" en la caja.

**4. Fuera "Vale de pago" y "Dejar a crédito"** del menú izquierdo. Eran
`case 'voucher': case 'credit': // Módulos futuros; break;` — un botón que se
toca y no pasa nada es peor que no tenerlo. El crédito SÍ funciona, pero como
**método de pago** en la fila de arriba, no como opción del menú.

**5. El botón de cobrar que quedaba fuera de alcance.** Causa: `.pg-cobro` era
`overflow: hidden` con todo dentro en `flex-shrink: 0`. Al verificar una
transferencia el resultado agrega hasta 4 líneas, la tarjeta crecía más que la
pantalla y el pie se recortaba — sin scroll, no había forma de llegar.
Arreglo: `overflow-y: auto` en la tarjeta + `position: sticky` en
`.pg-cobro-foot` + `flex-wrap: wrap` (en 1024 la fila del pie pedía 502px en
312 y el botón se salía **por el lado**, no por abajo).
Comprobado con `elementFromPoint`: antes `clicable:false`, ahora `true` —
arriba y abajo del scroll, en 1280×720 y en 1024×600.

**6. Quitar al cliente seleccionado.** Una X en la fila del cliente
(`data-action="cliente-quitar"`). Va como `<span role="button">` y **no** como
`<button>`: la fila entera ya es un botón, y un botón dentro de otro no es HTML
válido — el navegador lo desarma y deja de funcionar el de afuera.

⚠️ **La X DESHACE, no borra.** En el pedido hay dos cosas distintas: el nombre
escrito (`customer_name`, el que sale en la comanda y en la lista de
Domicilios) y el vínculo con el cliente registrado (`cliente_id`, el que trae
puntos y saldo). **Un domicilio del chat llega con el nombre ya escrito** antes
de que nadie seleccione a nadie. La primera versión de la X borraba los dos, así
que deshacer una selección equivocada dejaba el domicilio sin nombre.
Ahora `loadOrder` guarda `SP.nombreDeFuera` = el `customer_name` que llegó **sin**
`cliente_id`, y la X restaura eso. Si el pedido ya venía con cliente registrado,
ese nombre lo escribió la selección y no hay nada ajeno que preservar: se limpian
los dos. La X solo aparece cuando hay `cliente_id` — si no, no hay nada que
deshacer. Decidido por Sergio el 2026-08-09.

**7. El saldo junto al nombre del cliente.** `Ana María · 45 pts · $12.000 de
saldo`. Solo donde el saldo está encendido (`SP.saldoActivo`). Como el saldo
llega un instante después que el nombre, `loadPaymentMethods()` vuelve a llamar
a `pgPintarCliente()` al terminar.

---

## HECHO — [Configuración] Respuestas rápidas con variables — 2026-08-09

Se pidió el 2026-07-31 y quedó completo. Dónde vive cada pieza:

**El editor (uno solo):** Configuración → Asistente IA → **Mensajes** →
"Respuestas rápidas". Es un `contenteditable`, no un textarea: cada variable es
UNA ficha de color con su nombre en español, y al borrar se va entera. Los
corchetes viven adentro, al dueño nunca se le muestran.
- `pos-vars.js` — el registro de variables y el motor (`resolver`, `calcular`,
  `buscar`, `usadas`). Soporta listas y cálculos, no solo campos sueltos.
- `pos-vars-ui.js` — el editor de fichas: `montar / poner / leer / resumen`.
- En `configuracion.js`, todo pasa por `cfgQrLeerTexto` / `cfgQrPonerTexto`; nada
  vuelve a tocar `.value`. `cfgQrMontarVars()` lo monta al cargar la lista.

**Vista previa:** la burbuja de WhatsApp de siempre (con sus botones), pero con
las variables ya resueltas contra un cliente de muestra — `posVars.resolver(t,
posVarsUI.datosMuestra(0))`. Ver `{puntos}` crudo no dice cómo se va a leer.

**En el chat se USAN, no se administran.** Con `/` se insertan y ahí
`resolverRR()` (chat-ia.js) las resuelve contra el pedido REAL de esa
conversación. Si la plantilla pide plata del pedido y todavía no hay pedido, NO
manda "$0": avisa y no pega nada.

**Por qué hay un solo editor.** Hasta hoy había dos escribiendo la misma columna
`ia_config.respuestas_rapidas`: el bueno en Chat IA y un textarea pelado en
Configuración. Se fueron separando y Sergio no encontraba las variables porque
estaban en la pantalla equivocada. El botón "Administrar" del chat ahora lleva a
`configuracion.html?s=chatia&tab=mensajes&acc=m-rapidas` — `configuracion.js`
entiende `?tab=` y `?acc=` para aterrizar con la pestaña y la fila ya abiertas.

**Ojo al tocar esto:** si vuelve a aparecer un segundo editor en otra pantalla,
es el mismo error. Se administran en Configuración y punto.
---

## PENDIENTE — [Chat IA] Multi-línea de WhatsApp (varias líneas, flujo por línea) + precios por plan — Sergio 2026-07-24

**HECHO ya (2026-07-24, commit 67d49d0):** Instagram/Facebook/TikTok marcados como "Próximamente" en el Chat IA (Meta aún no aprobó permisos); al tocarlos avisa en vez de abrir el flujo de conexión roto. WhatsApp sigue activo. (`chat-ia.js`: `SOON_CHANNELS`.)

**PENDIENTE — Varias líneas de WhatsApp:**
- Hoy hay UNA línea de WhatsApp con UN flujo de respuesta (el canvas actual). Sergio quiere poder **conectar varias líneas** de WhatsApp.
- Al conectar una línea nueva, poder **decidir si usa el MISMO flujo** que otra línea o **un flujo NUEVO** (independiente).
- Implicación de datos: hoy el flujo/canvas y los tokens de WhatsApp son únicos por negocio; hay que modelar **N líneas** (cada una con su número/token de WhatsApp Business) y una relación línea → flujo (compartido o propio). Revisar cómo están guardados hoy los tokens/webhook de WhatsApp (ver memoria cobra_pos_whatsapp.md y el webhook actual) y la tabla del flujo/canvas.
- UI: en Conexiones, permitir "agregar otra línea de WhatsApp"; al agregarla, elegir flujo (existente o nuevo). Cada conversación entrante se enruta según la línea por la que llegó.

**PENDIENTE — Precios por plan (comercial):** más líneas de WhatsApp = más cobro. Definir **cuántas líneas incluye cada plan** y el costo por línea extra. Va junto con la gestión de planes/`tenants.plan` (ver sección multi-marca, que también valida plan). Actualizar la tabla de planes comerciales (04-PLANES-COMERCIALES.md del contexto).

---

## ✅ HECHO — [Chat IA] Pausar asistente + CREAR PEDIDO desde el chat — confirmado por Sergio 2026-07-31

**Contexto:** mientras Sergio afína el asistente (aún no contesta solo sin equivocarse), quiere (a) poder contestar manual, (b) crear el pedido en el mismo chat sin copiar de WhatsApp a Cobra.

**YA EXISTE y FUNCIONA — "tomar control" POR conversación:** `chat_conversations.human_takeover` (boolean). UI: `toggleHumanTakeover()`/`updateHumanToggleBtn()` en chat-ia.js; hay vista "Humano" (S.activeView==='human'). El backend lo respeta: la Edge Function `delay-reply` revisa `human_takeover` y NO contesta cuando está en humano. → Sergio ya puede responder manual por chat. (Solo faltaría hacerlo más visible/explicarlo.)

**HECHO 2026-07-24 (commit fdc3164) — Interruptor GLOBAL "Asistente IA ON/OFF":** botón en el sidebar del Chat IA que prende/apaga `ia_config.activo` (el bot ya lo respeta en delay-reply línea 431: si `activo=false` no responde NINGÚN mensaje). Verde=activado/responde solo, rojo=pausado/contestas tú. Sirve para tomar el control de noche mientras se afína. **[VER en tablet/exe.]**

**[Ex-PENDIENTE 1] Interruptor GLOBAL "Asistente IA ON/OFF"** (opcional, por confirmar): apagar el bot para TODAS las conversaciones de una vez mientras se afína, para que todo llegue al humano. Pequeño: una bandera global (ej. en `chat_channels` o `operacion_config`) que `delay-reply` revise antes de responder. Confirmar con Sergio si lo quiere global o si con el por-chat basta.

**PENDIENTE 2 — CREAR PEDIDO desde el chat (lo valioso):** botón "Crear pedido" dentro de la conversación que abra el armador de pedido (reusar el flujo de venta rápida / domicilio) **pre-vinculado al cliente del chat** (nombre + teléfono ya salen de la conversación / `contact_handle`). Así arma el pedido sin copiar de WhatsApp a Cobra.
  - Técnico: enlazar chat → pedido. Pasar el teléfono/nombre del contacto a la pantalla de pedido (query param o estado), pre-seleccionar/crear el cliente en `pos_clientes` (ojo: pendiente #21 — los clientes hoy viven en localStorage; idealmente hacerlo junto con eso). Decidir si el pedido queda como domicilio (con la dirección del chat) o venta rápida.
  - **HALLAZGO CLAVE 2026-07-24: el bot YA extrae el pedido estructurado** en `chat_conversations.pending_order_data` (jsonb con: `items, nombre, producto, tamano, cantidad, adiciones, pago, tipo, direccion`). O sea, la dirección + productos + método de pago YA están parseados por el asistente durante la conversación. → "Crear pedido con 1 clic" NO requiere construir un parser: solo mapear `pending_order_data` → un pos_order real (items, cliente, dirección, pago) y enviarlo a cocina. Cambia todo el enfoque: es muchísimo más factible de lo que parecía.
  - Al implementar: leer `pending_order_data` de la conversación activa, mapear items a `pos_products`/presentaciones/adiciones, crear el pedido (venta rápida o domicilio según `tipo`/`direccion`), pre-llenar pago. Botón "Crear pedido" en el chat → genera todo → solo falta "enviar a cocina".
  - **⚠️ MATIZ CRÍTICO (verificado 2026-07-24):** hoy, cuando el bot está PAUSADO deja de EXTRAER también. En `delay-reply`, tanto el freno global (`!cfg.activo`, línea 431) como el `human_takeover` (línea 568) hacen `return` ANTES del código que parsea/escribe `pending_order_data` (empieza en línea 723). → pausado = no responde Y no entiende.
  - **Para que "pausar pero seguir capturando" funcione (lo que Sergio quiere): SEPARAR "entender" de "responder" en delay-reply.** Que el parseo del pedido (→ `pending_order_data`) corra SIEMPRE, y que los frenos (activo/takeover) solo salten el ENVÍO de la respuesta, no la extracción. Así el humano contesta manual pero el bot sigue llenando `pending_order_data` en segundo plano, y el botón "Crear pedido" usa esos datos. Es cambio de arquitectura del Edge Function (reordenar), bien definido.

---

## ✅ HECHO — [Domicilios] Estados del pedido ajustados — confirmado por Sergio 2026-07-31

Estados actuales (ventas-salon.js:50, `DELIVERY_NEXT`): recibido → preparacion → listo → camino → entregado.

**1. Eliminar el estado "Recibido"** (es innecesario/ilógico): los pedidos al recibirse pasan automáticamente a **En preparación**. Quitar `recibido` del flujo (arrancar en `preparacion`). Revisar `DELIVERY_NEXT`, los chips/columnas de estado (la fila de tarjetas RECIBIDO/EN PREPARACIÓN/... del tablero de domicilios) y cualquier default a `recibido` al crear el pedido.

**2. Estado "Entregado" según tipo de domiciliario (interno vs externo):**
  - **Domiciliario INTERNO:** "Entregado" funciona MANUAL (nosotros sabemos cuándo entregó, se marca a mano).
  - **Domiciliario EXTERNO:** NO sabemos cuándo entrega, así que el pedido pasa a "Entregado" **automáticamente después de un tiempo** (configurable). El estado sigue existiendo, solo cambia cómo se llega a él.
  - Sergio trabaja con externo → sus domicilios se auto-pasarán a Entregado tras X minutos.

**Depende de:** saber por pedido si el domiciliario es INTERNO o EXTERNO (el mismo flag interno/externo que ya se necesita para: (a) el domicilio como ingreso propio vs pass-through en la estadística de domicilios, y (b) el egreso del pago al domiciliario). Unificar ese concepto: un campo/flag "domiciliario interno/externo" por pedido (o inferir de si el domiciliario es de la lista interna). Definir el tiempo de auto-entregado (config, junto con los otros tiempos de automatización en Operación).

**Nota:** revisar también si "En camino" tiene sentido para externo (tampoco lo sabemos con certeza) — por ahora Sergio solo pidió quitar Recibido y auto-Entregado para externo; confirmar si "listo/en camino" se simplifican también para externo.

---

## ✅ HECHO — [Chat IA] Paleta de color de la pantalla — confirmado por Sergio 2026-07-31

El azul actual del Chat IA le parece "raro" a Sergio y es la pantalla que MÁS va a usar (está todo el día ahí). Quiere una paleta más cómoda a la vista.
- Probar: **azul más oscuro**, o **negro/gris** (neutros), o un tema oscuro tipo bandeja de mensajería.
- Archivo: `chat-ia.css` (tokens/colores de la pantalla). Mantener la identidad de marca (acento #5B6BFF) pero suavizar el fondo/azul dominante.
- Sugerencia de Claude: preparar 2-3 opciones de tono (mockup o variantes CSS) para que Sergio elija antes de aplicar — es puramente visual, mejor verlo. Considerar modo claro y oscuro.
- Hacerlo junto con el resto del pulido del Chat IA (interruptor global ya hecho; crear pedido desde chat; multi-línea).

---

## ✅ HECHO 2026-07-31 — [Impresión] Recibo del domiciliario: TOTAL completo + selector de 1 o 2 copias (commits `3e0a9f8`, `682aaad`)

**1. El recibo del domiciliario debe mostrar el TOTAL A COBRAR completo (comida + domicilio), no el "restante".** Hoy en `pos-print.js` (~líneas 13-19, la caja "COBRAR") cuando hay abono/cobro adelantado imprime `COBRAR: total − paid` = solo el restante. En un domicilio (sobre todo con externo) el domiciliario le cobra al cliente el **total completo** (comida + domi); si el recibo muestra solo el restante, confunde al domiciliario Y al cliente. **Fix:** en el recibo de domicilio mostrar claro el **TOTAL que el cliente paga** (comida + domicilio), no el neto tras el cobro adelantado. Revisar la caja "COBRAR" (líneas 13-19) y los builds de recibo (RECIBO ~línea 113 y "RECIBO DEL CLIENTE" ~línea 148). Ojo: `order.total` ya incluye el domicilio; el problema es la lógica de "restante" del cobro adelantado.

**2. Opción para imprimir 1 o 2 COPIAS del recibo** (una para el cliente, otra para el domiciliario). Interruptor/selector en **Configuración → Operación** (guardar en `operacion_config`, ej. `recibosCopiasDomicilio: 1|2`). Al tocar "Imprimir recibo" en un domicilio, imprime N copias según lo configurado. Reusar `posPrintAction`/el flujo de impresión del recibo (pos-print.js / pos-print-listener.js).

**Relación:** va con el tema de domicilios interno/externo y con la decisión de "domicilio fuera de ventas" (el recibo muestra el total al cliente, pero contablemente el domi es aparte). Ojo NO confundir con la comanda de cocina (Sergio aclaró: es el RECIBO, no la comanda — la comanda no se toca).

---

## PENDIENTE — [Pedidos] "Pedido habitual" guardado POR CLIENTE ("el de siempre") — Sergio 2026-07-24

**Idea:** poder guardar un pedido completo como favorito **ligado a un cliente**; al seleccionar el nombre del cliente, aparecen sus pedidos guardados para re-seleccionarlos con un toque cuando vuelva a pedir (clásico "el de siempre" de las apps de domicilio). Aplica a las 3 pantallas de pedido (mesa, venta rápida, domicilio).

**DECISIÓN (Sergio 2026-07-24):** la pestaña **"Favoritos" se QUEDA** como está (favoritos GLOBALES de producto: `S.favs`, localStorage `pos_favs`; renderFavs tomar-pedido.js:346). Se **repurpona la pestaña "MENÚ"** para los **pedidos habituales del cliente**. Razón: el "Menú" es redundante con "Categorías" (donde SIEMPRE se hacen los pedidos) y su lista gigante de todos los productos confunde. Entonces la pestaña Menú (hoy `renderMenuTab` en tomar-pedido.js:319; `renderMenuPane` en venta-rapida.js y domicilios.js) pasa a mostrar: al seleccionar un cliente, sus pedidos guardados → tocar → carga al carrito. Aplicar en las 3 pantallas.

**Modelo:** guardar el pedido (items + presentaciones + adiciones + notas) ligado al `cliente_id`. Nueva tabla tipo `pos_cliente_pedidos_habituales` (cliente_id, nombre_del_favorito, items jsonb) o un campo en el cliente. Botones: "Guardar como habitual" al armar un pedido; y al elegir cliente, listar sus habituales → tocar → carga al carrito.

**DEPENDE de #21/#22:** los clientes hoy viven en localStorage (no en `pos_clientes`) — esto necesita clientes bien guardados en la base (con su historial). Hacerlo JUNTO con arreglar los clientes (#21) y el sistema de puntos (#22), que también usan el cliente como entidad real. También se conecta con "crear pedido desde el chat" (el bot ya trae el cliente/teléfono).

---

## 🔴 PRIORIDAD MÁXIMA — Gestión de MARCAS (multi-marca) — **PRÓXIMA SESIÓN** (Sergio 2026-07-31)

> **Sergio lo marcó como lo más importante para la próxima sesión**, incluyendo
> los tres puntos verificados el 2026-07-31:
>
> 1. **Validar el plan al crear una marca** — `tenants.plan` define el límite.
>    Es directamente el modelo de negocio de Cobra.
> 2. **`pos_roles` NO tiene `brand_id`** (verificado): hoy los roles son del
>    tenant y los comparten todas las marcas. Hay que agregarlo como nullable
>    (null = plantilla compartida, con valor = rol propio de esa marca).
> 3. **EL PUNTO DELICADO — el catálogo NO sabe a qué marca pertenece.**
>    `pos_products` y `pos_categories` tienen `branch_id` y `tenant_id` pero
>    **no `brand_id`** (verificado 2026-07-31). Con una sucursal por marca
>    funciona por accidente; en cuanto una marca tenga dos sucursales habría que
>    duplicar el menú. **Decisión de producto pendiente: ¿el menú es de la MARCA
>    o de la SUCURSAL?** Recomendación: de la marca, y que la sucursal pueda
>    desactivar productos.
>
> **Riesgo a no olvidar:** tocar el alcance de roles y catálogo puede romper el
> aislamiento entre marcas (que una vea datos de otra). Hacerlo junto con el
> blindaje de permisos (RLS). Es el tipo de error que no se nota hasta que un
> cliente ve los datos de otro.
>
> **Estado hoy:** 1 tenant → 1 marca (El Parche Food) → 1 sucursal.

### Detalle original — Gestión de MARCAS (multi-marca) — pedido por Sergio 2026-07-24, para DESPUÉS de los fáciles

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

## ✅ HECHO — Modo Gerente en el bot IA — confirmado por Sergio 2026-07-31

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


---

## 68. "Meseros en turno" mostraba 0 mesas (2026-07-31)

**Sintoma.** Monica Villareal atendio varias mesas desde la tablet y el panel
"Meseros en turno" del dashboard la mostraba con **0 MESAS**.

**Dos causas distintas, las dos reales:**

1. **Los ids nunca coincidian.** `pos_orders.waiter_id` guarda el id de la
   sesion (`auth.users.id`), mientras que `pos_users` tiene su **propio** id.
   Para Monica: `auth = 137b7051...` pero `pos_users.id = 4cc6fbdf...`.
   `qmLoadMeseros()` agrupaba por `waiter_id` y luego buscaba
   `tablesByWaiter[m.id]` -> **ningun mesero podia dar distinto de 0, nunca**.
   La columna que los une es `pos_users.auth_user_id`.

2. **Contaba solo mesas `status='open'`.** Al final de la noche todas estan
   cobradas, asi que aunque los ids hubieran coincidido igual habria dado 0.

**Arreglo (`f84f6da`).** El cruce ahora se hace contra
`[pos_users.id, pos_users.auth_user_id, nombre]` y se cuentan las **mesas
distintas atendidas desde la apertura de caja** (no desde medianoche: el
servicio se pasa de las 12 y partiria el turno en dos). Las que siguen abiertas
se muestran aparte en el subtitulo: `"1 en turno - 3 mesas atendidas hoy"`.

**Nota para el futuro.** Cualquier consulta que relacione un pedido con un
usuario tiene que pasar por `auth_user_id`. Si en algun sitio se compara
`pos_orders.waiter_id` con `pos_users.id` directamente, esta mal.


---

## 69. "WhatsApp no esta conectado" al enviar la lista (2026-07-31)

El boton "Enviar tanda de hoy" fallaba con *"WhatsApp no esta conectado en esta
sucursal"*. **Las credenciales estaban perfectas** (`chat_channels`, canal
whatsapp, con `phone_id` y `access_token`, en la sucursal correcta). El mensaje
era enganoso: cualquier fallo de lectura terminaba en esa misma frase.

**Tres errores encadenados, todos mios, en `wa-enviar-lista` (v3):**

1. **Ruta duplicada.** Los ayudantes `sbGet`/`sbPatch` anteponian `/rest/v1` y
   todas las llamadas ya lo traian -> la URL quedaba `/rest/v1/rest/v1/...` y
   **ninguna consulta devolvia nada**.
2. **Faltaba el permiso de `service_role`.** La migracion daba privilegios solo
   a `authenticated`, pero las Edge Functions entran con la llave de servicio.
   Resultado: `403 permission denied for table pos_wa_envios`. Ya corregido en
   la BD y anadido al .sql para que no se pierda.
3. **Tope de 1.000 filas otra vez.** Contaba pendientes con `.length` sobre la
   consulta; la API corta en 1.000 y `limit=2000` NO levanta ese tope, asi que
   decia 1.000 pendientes habiendo 1.381. Ahora hay un `sbCount()` que cuenta
   con `Prefer: count=exact` sin traer las filas.

**Verificado:** la funcion responde `{pendientes: 1381, disponible: 250}`.

**Leccion (ya van tres veces con el tope de 1.000).** Nunca contar con
`.length`. Y un `catch` no debe convertir un fallo de lectura en un diagnostico
inventado: si no se pudo consultar, el mensaje tiene que decir eso.


---

## 70. "Failed to fetch" a mitad del envio (2026-07-31)

Al enviar la primera tanda, la pantalla mostro *"No se pudo enviar: Failed to
fetch"*. **No fue un fallo de envio:** salieron **126 mensajes, todos
exitosos, cero fallidos**. La funcion excedio el tiempo maximo que el servidor
le permite correr (250 mensajes x 350 ms de pausa + latencia de Meta) y la
conexion se corto en el 126.

Que la cola guarde el estado de cada contacto salvo la situacion: nada se
perdio, nada se duplico, y los 1.255 restantes siguieron en `pendiente`.

**Arreglo (`a8a5b8f`, funcion v4):**
- La funcion se detiene sola a los **50 segundos** y devuelve
  `corto_por_tiempo: true` en vez de dejar que la maten.
- La pantalla la llama **en ciclo** (hasta 12 vueltas) hasta agotar el cupo del
  dia o vaciar la cola, mostrando el avance en vivo.
- Si aun asi se cae la conexion, el mensaje ya no miente: dice cuantos
  alcanzaron a salir y que se puede volver a dar al boton para seguir.

**Leccion.** Un proceso largo detras de un boton tiene que poder reanudarse.
El diseno de cola estaba bien; lo que faltaba era que la funcion admitiera
quedarse a medias en vez de morir.


---

## 71. Productos en $0 al armar el pedido desde el chat — RESUELTO (2026-08-01)

Sergio: *"acabo de hacer un pedido y todavia sigue colocando productos en 0
pesos"*, *"sigue pasando con varias, en especial las tradicionales"*, *"y la
bebida tampoco"*. Las dos observaciones suyas eran **dos bugs distintos** y las
dos apuntaban justo al sitio correcto.

Reproducido en vivo contra la conversacion real del 01/08 00:55
(`db2f9908`, "una salchipapa pollo personal"): `matched:false`, `$0`.

### Bug A — "tradicionales" contiene la palabra "adicion"
`esCatAdicion()` decidia si una categoria era de ADICIONES con
`nombre.includes("adicion")`. Y **"tradicionales" = tr + ADICION + ales**.
Resultado: *Salchipapas Tradicionales* se clasificaba como categoria de
adiciones y quedaba **excluida del universo de busqueda**. Por eso fallaban las
tradicionales y no las especiales — exactamente como lo describio Sergio.
Arreglo: comparar por PALABRA COMPLETA (`/(^|\s)adicion/`), no por subcadena.

### Bug B — un pedido de dos cosas se contaminaba a si mismo
La categoria se deducia mirando **todo** lo que escribio el cliente. En
*"una salchipapa familiar mixta y una coca cola"*, al procesar la BEBIDA el
texto todavia contenia "salchipapa", asi que la categoria se resolvia a
Salchipapas, la Coca Cola no estaba ahi y salia en **$0**.
Pasaba en las dos capas (1a y 1b). Arreglo: `pareceEste()` compara solo contra
el texto de ESE producto (`nl` / `nameBlob`), nunca contra `cliBlob`. Si la
categoria hallada no contiene ningun producto que se parezca, se descarta.

### Bug C — GPT pone la categoria en "nombre" y el producto en "tipo"
"una salchipapa pollo personal" -> `nombre:"Salchipapa"`, `tipo:"pollo"`, pero
el producto se llama **"Pollo"**. Como `nameBlob` excluye el tipo A PROPOSITO
(para que "premium mixta" no le infle el puntaje al producto "Mixta"), ningun
producto puntuaba. Arreglo: bloque de RESCATE que reintenta usando el tipo como
nombre, **solo si la via normal fallo** y **solo dentro de la categoria ya
resuelta**, para no tocar el caso que `nameBlob` protege.

### Verificacion (funcion v27)
Regresion sobre **10 conversaciones reales** de los ultimos 5 dias:
**0 productos sin resolver** (antes fallaban 3). Ejemplos:
- "salchipapa pollo personal" -> Pollo Personal **$17.000** (antes $0)
- "salchipapa familiar mixta + coca cola 1.5" -> $49.000 + **$8.000** (antes $0)
- "premium de pollo personal + HIT mora" -> $28.000 + **$5.000** (antes $0)
- Premium/Super Queso/Hamburguesa doble carne: sin cambios, siguen bien.

Una conversacion devuelve "(sin productos)" y **es correcto**: su pedido es de
hace 4 dias y el ultimo mensaje es un saludo suelto (corte por hueco de 4 h).

**Nota:** se reviso `delay-reply` y `crear-pedido-chat` por el mismo error de
subcadena — **no lo tienen**. Era exclusivo de `extraer-pedido`.


---

## 72. Los perros, hamburguesas y sandwiches NO descontaban inventario (2026-08-01)

Sergio: *"ayer en el inventario habian 3 panes de perro, durante el turno se
vendio un perro, y al terminar el turno seguia diciendo los mismos 3 panes"*.

**Confirmado, y era peor de lo que parecia:** `Pan perro`, `Salchicha Perro`,
`Jamon`, `Pan Hamburguesa`, `Pan Sandwich`, `Carne de hamburguesa`, `Tomate` y
`Pina Calada` **NUNCA** habian tenido un solo movimiento de inventario. Ni uno,
en toda la historia de la tabla.

### La causa
`fn_iv_consumir_item` resuelve la presentacion vendida por NOMBRE:

```sql
WHERE p.id = it.product_id AND elem->>'name' = v_pres_name
```

Pero **los perros, hamburguesas y sandwiches tienen UNA sola presentacion y su
nombre esta VACIO** (`{"id":"pr_kds0i9","name":"","price":13000}`). El pedido
guarda un nombre cualquiera (`"pres":"Perro"`), que nunca puede emparejar con
`""` -> `v_pres_id` quedaba **NULL**.

Y entonces el `COALESCE` de la receta caia hasta el ultimo caso:
`CASE WHEN r.cantidades IS NULL OR = '{}' THEN r.cantidad ELSE 0 END` -> como
`cantidades` SI existe (con la clave `pr_kds0i9`), daba **0**. El
`HAVING SUM(use_qty) > 0` borraba todas las lineas y **el producto no
descontaba absolutamente nada**. Las recetas siempre estuvieron bien.

### El arreglo (`sql/2026-08-01-fix-descuento-presentacion-sin-nombre.sql`)
1. La comparacion por nombre ahora ignora mayusculas y espacios.
2. **Red de seguridad:** si aun asi no se resuelve y el producto tiene **UNA
   sola presentacion**, se usa esa. No hay ambiguedad posible. Con dos o mas se
   deja en NULL A PROPOSITO: adivinar cual se vendio descontaria el insumo
   equivocado, que es peor que no descontar.

### Verificado con el perro real del turno (item `645b659b`)
| Insumo | Antes | Despues |
|---|---|---|
| Pan perro | 3,00 | **2,00** |
| Salchicha Perro | 6,00 | 5,00 |
| Jamon | 12,96 | 10,98 |
| Queso | 147,02 | 146,02 |
| Ripio | 4.580 | 4.550 |

**Las botellas de agua SI se descontaban** (verificado: `Paquete Agua Cristal`
-0,0417 = 1 de 24 en el turno de ayer). Esa sospecha no tenia fundamento.

### PENDIENTE de decidir con Sergio
Quedan **14 ventas historicas** sin descontar (21/07 a 28/07): 8 hamburguesas,
4 perros, 1 sandwich. Se pueden reprocesar con `fn_iv_consumir_item` una por
una, pero eso baja el stock actual y es decision suya.


---

## 73. Auditoria completa del descuento de inventario del turno (2026-08-01)

Sergio pidio no reprocesar nada, sino **auditar el turno entero** y dejar el
sistema bien: *"lo importante es que quede bien... no hay problema que el
inventario quede mal, yo vuelvo a actualizar"*.

### Resultado de la auditoria (turno 31/07 23:41 -> 01/08 04:06)
Se comparo, **item por item**, lo que la receta manda descontar contra lo que
de verdad se descontó. **32 items vendidos**:

- **30 correctos** — descontaron todos sus insumos.
- **2 fallaron**, los dos por la MISMA causa (presentacion sin nombre):
  - `Perro · SENCILLO` (7 insumos, 0 descontados)
  - `Adición · Papas` (500 g de Papa, 0 descontados)
- **1 item sin receta**: `Ajo · Salsa`. No es un fallo del motor — ese producto
  no tiene receta cargada. Es el unico del catalogo activo en esa situacion.

Las bebidas, las salchipapas (tradicionales y especiales) y las adiciones
dentro de un plato **descontaron bien**, con la cantidad exacta.

### Tres redes de seguridad en `fn_iv_consumir_item`
1. Comparacion del nombre de la presentacion **sin mayusculas ni espacios**.
2. Si no resuelve y el producto tiene **UNA sola presentacion**, es esa.
   (Arregla perros, hamburguesas, sandwiches y adiciones: su unica presentacion
   tiene el nombre vacio.)
3. Si sigue sin resolver, se **deduce del nombre del item** ("Personal · Premium
   · Mixta"). Cubre 8 ventas del 21 y 25 de julio guardadas SIN el campo `pres`.

Con dos o mas presentaciones y ninguna pista se deja en NULL **a proposito**:
descontar el insumo equivocado es peor que no descontar.

### Y lo mas importante: ya no falla en silencio
Nueva tabla **`iv_consumo_alertas`**. Si un producto TIENE receta y aun asi no
mueve un solo insumo, queda registrado con el pedido, el item y la presentacion
que venia guardada. En **Inventario** sale una franja roja arriba con los
productos afectados, agrupados, y un boton "Ya lo revisé".

Esto es lo que fallo de verdad durante semanas: no el calculo, sino que
**nadie se enteraba**. Un cero silencioso parecia normal.

### Probado de punta a punta
Venta de prueba de las 4 categorias que fallaban (perro, hamburguesa, sandwich,
adicion de papas): las 4 descontaron correcto — Pan perro -1, Pan Hamburguesa
-1 + Carne de hamburguesa -1 + Tomate -2, Pan Sandwich -1, Papa -500 g.
**Datos de prueba borrados y stock devuelto a su valor exacto anterior.**

### Aparte (no es de este bug)
- `Salsa rosada` en **-3,36** y `Salsa ajo casera` en **-1,02**: stock negativo.
  Falta registrar una compra o hay un consumo no contabilizado.
- `Salsa` (Adiciones) sigue **sin receta**.


---

## 74. La carta: el bot NUNCA la envio (2026-08-01) — y de quien es cada mensaje

### Correccion de un diagnostico mio
Yo habia anotado que el bot mando la carta **44 minutos tarde**. **Falso.**
Sergio lo corrigio: *"nunca la envio, yo fui quien envio la carta manualmente a
los 44 minutos"*. Las imagenes de las 23:56 las mando **el**, no Pako.
Yo no podia distinguirlo porque **`chat_messages` no guardaba quien enviaba**.

### La causa real: DOS ESPACIOS
El cliente escribio literalmente `"Para ver la  carta"` — con **dos espacios**
entre "la" y "carta". Las palabras clave son `"la carta"`, `"ver la carta"`…
con UN espacio, y se comparaba con `includes()` sobre el texto crudo. Con dos
espacios **ninguna coincide**. Y `"carta"` sola solo valia si el mensaje era
exactamente esa palabra. Asi que `wantsMenu` dio **false**, el bloque de la
carta nunca corrio, y contesto GPT inventando *"la puedes ver aqui mismo"*.

### Arreglos en `delay-reply` (v198)
1. **Se normaliza antes de comparar**: minusculas, sin tildes y espacios
   colapsados.
2. **Palabra suelta**: basta con que aparezca `carta`, `menu` o `precio` como
   palabra. En un restaurante no significan otra cosa. Verificado que
   *"cartagena"* y *"descartar"* **no** disparan la carta.
3. **Se revisa la respuesta de Meta en cada imagen**. Antes se enviaba a ciegas.
4. Si **no salio ninguna imagen**, el bot ya no promete la carta: dice que no
   puede enviarla y ofrece decir los precios.

### Y lo que pidio Sergio: saber quien envio cada mensaje
Nueva columna **`chat_messages.origen`**: `cliente` | `bot` | `humano` |
`sistema`. Marcado en el origen de cada envio: `delay-reply` y `meta-webhook`
-> `bot`; `cambiar-estado`, `confirm-domi`, `confirm-payment`,
`verify-transfer` -> `sistema`; los 8 envios de `chat-ia.js` -> `humano`.
En el chat sale una **etiqueta en la burbuja**: *Pako* / *Tú* / *Sistema*.
El historial viejo queda en NULL a proposito — no hay forma de saberlo y
marcarlo seria inventar el dato.

---

## 75. ⚠️ REGLA CRITICA — redesplegar una funcion con imports remotos LA ROMPE

Al marcar el `origen` redespliegue varias funciones y **cuatro quedaron
caidas** (`cambiar-estado`, `confirm-domi`, `confirm-payment`,
`verify-transfer`). Dos motivos, los dos importantes:

**(a) El endpoint `/functions/{slug}/body` DEVUELVE EL CODIGO TRUNCADO.**
Corta entre 4 y 8 caracteres del principio, y la cantidad **varia**. Bajar el
codigo, editarlo y volverlo a subir **destruye la primera linea**. Nunca
redesplegar a partir de lo que devuelve `/body` sin reconstruirla entera.

**(b) El entorno ya NO permite imports remotos.** `confirm-domi` importaba
`https://deno.land/std@0.168.0/http/server.ts` y `tiktok-webhook` importa
`https://esm.sh/@supabase/supabase-js@2`. El bundle viejo seguia funcionando,
pero **al redesplegar** falla con
`A remote specifier was requested… but --no-remote is specified`.
`confirm-domi` se paso a `Deno.serve`. **`tiktok-webhook` sigue caida** — ya lo
estaba antes de esta sesion, no se toco y TikTok no esta en uso.

**Como se diagnostico** (dejarlo escrito, ahorra horas): los logs de arranque se
leen con
`GET /v1/projects/{ref}/analytics/endpoints/logs.all?sql=select event_message from function_logs order by timestamp desc`.
Ahi salio el error exacto, incluida una linea de `verify-transfer` a la que le
faltaba un `;` por caracteres perdidos en un despliegue anterior.

**MEDIDA TOMADA:** el codigo de las funciones ya vive en el repo, en
`supabase/functions/<slug>/index.ts`. **Editar SIEMPRE desde ahi**, no desde lo
que devuelve `/body`.

**Verificado al cerrar:** las 24 funciones responden; la unica en 503 es
`tiktok-webhook`, que ya estaba asi.


---

## 76. El bot entiende INTENCIONES, no texto exacto (2026-08-01)

**Regla de Sergio, y tiene razon de fondo:** *"es absurdo que simplemente por un
espacio doble el bot no entienda. Absolutamente todos los mensajes el bot debe
detectar intenciones, no texto exacto. Las personas describen con errores, con
espacios o cosas diferentes; siempre se debe identificar la intencion"*.

El arreglo anterior (normalizar espacios + palabra suelta) tapaba ESE caso, no
el problema: comparar texto nunca va a cubrir como escribe la gente de verdad.

### Que se hizo (`delay-reply` v199)
Antes de los bloques que decidian por palabras, corre un **clasificador de
intenciones** (gpt-4o-mini, temperatura 0, respuesta JSON) sobre lo que escribio
el cliente. Devuelve: `carta`, `ubicacion`, `domicilio`, `horario`, `pedir`.

Los bloques ahora obedecen la INTENCION:
- carta: `intenciones.carta === true || <palabras, como respaldo>`
- ubicacion: `intenciones.ubicacion === true || <palabras, como respaldo>`

**Las listas de palabras se conservaron a proposito como respaldo:** si OpenAI
falla o se demora, el bot se comporta como antes y **nunca peor**. Es una
mejora aditiva, no un reemplazo con riesgo.

### Probado (18 de 18 correctos)
Se desplego una funcion temporal con el MISMO prompt, se probo y **se borro**
(no se envio ningun mensaje a ningun cliente real).

| Lo que escribe la gente | Intencion detectada |
|---|---|
| `Para ver la  carta` (dos espacios) | carta |
| `mandame el menucito` | carta |
| `q tienen pa comer` | carta |
| `q precios manejan` | carta |
| `dnd kedan?` | ubicacion |
| `me pasas la ubi` | ubicacion |
| `hacen domicilio` | domicilio |
| `a que hora abren` | horario |
| `kiero pedir algo` | pedir |
| `Monteluna casa 45` | **ninguna** (el cliente esta dando SU direccion) |
| `soy de cartagena` | **ninguna** |
| `hola` / `gracias` | ninguna |

Los dos ultimos casos son los que importan tanto como los aciertos: no basta con
detectar de mas. `Monteluna casa 45` con listas de palabras podia confundirse
con "donde quedan", y ahora no.

### Costo
Una llamada extra a gpt-4o-mini por tanda de mensajes (~120 tokens de salida).
Despreciable frente a la llamada de respuesta que ya se hacia.

### Pendiente de aplicar el mismo criterio
Quedan otros sitios decidiendo por texto: metodo de pago (`nequi/daviplata/
transfer`), deteccion de nombre del cliente, `para llevar / recoger`, y el
rechazo de direccion (`no / cambia / otra`). Conviene ampliar el mismo
clasificador en vez de seguir alargando listas.


---

## 77. Intenciones tambien para pago, entrega y rechazo de direccion (2026-08-01)

Continuacion de la entrada 76. Quedaban tres sitios decidiendo por texto exacto;
ya obedecen la intencion (`delay-reply` v200).

**El clasificador devuelve ademas:**
- `pago`: `"efectivo"` | `"transferencia"` | null
- `entrega`: `"domicilio"` | `"recoger"` | null
- `rechaza_direccion`: bool

**Donde se aplica** (siempre como RESPALDO, nunca reemplazando la lectura por
texto — si el modelo falla, el bot se comporta como antes):
- Los **5 puntos** donde se decidia el metodo de pago con
  `extractPago(clienteTexto, pagosCfg)` ahora caen a `pagoPorIntencion()` si el
  texto no reconocio nada. La intencion se traduce **al metodo que el
  restaurante tenga configurado** (busca el digital o el no-digital en
  `getMetodosPago`), no inventa uno nuevo.
- `runExtractors` recibe las intenciones como septimo parametro y las usa para
  el pago y para `rechazaDir`.

**Probado (18 de 18), con la escritura real de la gente:**

| Mensaje | Resultado |
|---|---|
| `nequii`, `davi plata`, `x nequi`, `transfe` | pago = transferencia |
| `te consigno`, `le mando el comprobante` | pago = transferencia |
| `en efectivo`, `con plata`, `pago contra entrega` | pago = efectivo |
| `yo paso por el`, `pa llevar`, `lo recojo yo` | entrega = recoger |
| `me lo llevan a la casa` | entrega = domicilio |
| `no, cambiala`, `no es en otro lado` | rechaza_direccion = true |
| `si esa misma` | rechaza_direccion = **false** |
| `Monteluna casa 45`, `hola buenas` | nada |

Ninguna de las cuatro primeras filas la reconocia el codigo viejo, que buscaba
literalmente `"nequi"`, `"daviplata"` o `"transfer"`.

**Como se probo sin molestar a nadie:** se desplego una funcion temporal con el
MISMO prompt, se corrieron los casos y **se borro**. No se envio ni un mensaje a
un cliente real. Verificado al cerrar: 24 funciones, ninguna temporal.

**Lo que se dejo a proposito sin tocar:** los usos de `extractPago` como filtro
negativo (`si esto es un pago, entonces no es un nombre`). Ahi meter el modelo
no aporta y si arriesga la deteccion de nombres y productos.


---

## 78. Reloj por estado en domicilios + la tarjeta del chat que no desaparece (2026-08-01)

### (a) El reloj del domicilio contaba lo que no era
Sergio: *"los pedidos que estan en camino llevan casi 1 hora en camino"*, y
luego la correccion importante: *"tenemos que aplicar el mismo sistema de reloj
que en mesa, se debe reiniciar cada vez que cambien de estado y mostrar cuanto
se ha demorado en cada estado"*.

**Causa:** `fetchDeliveries` calculaba los minutos desde `created_at`, o sea
**toda la vida del pedido**. Un domicilio entregado seguia sumando.

**Arreglo:** el reloj cuenta desde `estado_at` (que ya existia y no se estaba
usando) y la tarjeta dice **"18m aqui"**. Nueva tabla **`pos_domi_tiempos`**;
`cambiar-estado` (v6) guarda el tramo cerrado en cada cambio, igual que
`pos_mesa_tiempos` hace con las mesas. Tocando el reloj se abre el desglose.

**Probado de punta a punta** con un pedido de prueba SIN conversacion asociada
(la funcion solo escribe al cliente si existe conversacion, asi que no se envio
ningun mensaje — verificado: 0 mensajes):
`Recibido 7,1 min · En preparacion 12,1 min · En camino 9,0 min`. Datos borrados.

**Ojo:** `cambiar-estado` normaliza los nombres, asi que en `pos_domi_tiempos`
quedan `en_preparacion` / `en_camino`, mientras la tarjeta usa
`preparacion` / `camino`. El mapa de etiquetas contempla las dos formas.

**Limitacion honesta:** los pedidos anteriores a hoy no tienen tramos
guardados; el reloj les funciona, pero el desglose sale vacio hasta su primer
cambio de estado.

### (b) La tarjeta del pedido en el chat
Sergio: *"en el chat quiero que la tarjeta del pedido no desaparezca hasta que
el pedido se haya entregado"*.

Antes, al enviar a cocina se borraba `pedido_borrador` y la tarjeta se iba: el
operador perdia de vista el pedido dentro del chat. Ahora es **la misma tarjeta
con tres caras**:

| Situacion | Que muestra |
|---|---|
| Hay borrador | Descartar · Editar · Enviar a cocina (igual que antes) |
| Enviado, sin entregar | Estado, total, items, tiempo en el estado y boton del siguiente paso |
| Entregado o anulado | Desaparece |

El boton **reutiliza `cambiarEstado`**, que es el unico camino que escribe
`estado` + `delivery_status` y avisa al cliente. Asi la tarjeta, la pastilla de
arriba y la pantalla de Ventas no pueden decir cosas distintas; y al cambiar el
estado desde la pastilla, la tarjeta se repinta sola.

**Probado** con un banco de casos ejecutando el codigo real de render:
domicilio en preparacion -> siguiente "listo"; en camino -> siguiente
"entregado"; para llevar listo -> siguiente "entregado"; y **entregado y anulado
ocultan la tarjeta**, que es lo pedido.


---

## 79. Que el barrio no falle aunque lo escriban mal (2026-08-01)

Sergio aclaro dos cosas y en las dos tenia razon:
1. *"El barrio se llena solo esta bien. El problema solo pasa cuando el cliente
   escribe de una manera extraña en la direccion y el bot no logra detectar el
   barrio"*. Mi diagnostico de "no se autocompleta" estaba mal enfocado.
2. *"No creo que haya necesidad de corregir precios de barrios porque por lo
   mismo tu hiciste el sistema para que auto aprenda"*. Correcto: el sistema ya
   los aprende y el los autoriza desde Configuracion. No habia nada que arreglar
   ahi.

### El problema real: reconocer el barrio escrito de cualquier forma
Antes se comparaba por **subcadena exacta** contra `ia_config.domicilios.zonas`.
Con eso, `bellabista`, `kanterbury`, `la esperansa` o `por el uvo` no
coincidian con nada y el domicilio quedaba en $0.

### Cuatro mejoras (extraer-pedido v28)
1. **Al modelo se le da la LISTA de barrios conocidos** y se le pide que escoja
   de ahi, no que adivine un nombre suelto. Es lo que resuelve las referencias
   ("queda por el uvo detras del colegio").
2. **Emparejado por PARECIDO** (distancia de edicion) para erratas: 1 letra en
   nombres de 6+, 2 en nombres de 9+. Umbral corto a proposito, para no
   confundir barrios distintos que se parecen.
3. **Los barrios APRENDIDOS entran al reconocimiento.** Antes el sistema los
   guardaba pero **no los usaba**: aprendia y seguia fallando. Ahora los usa
   para reconocer y **sugiere** el precio ya cobrado (`domi_sugerido: true`),
   sin darlo por autorizado — autorizarlos sigue siendo decision del dueno.
4. **El barrio guardado del cliente** como ultimo respaldo: mismo cliente,
   misma casa, aunque hoy escriba la direccion de otra forma.

### Probado (8 de 8) con conversaciones de prueba, borradas al terminar
| Lo que escribe el cliente | Resultado |
|---|---|
| `bellabista` | Bella Vista · $5.000 |
| `kanterbury` | Canterbury · $5.000 |
| `la esperansa` | La Esperanza · $5.000 |
| `queda por el uvo detras del colegio` | El Uvo · $5.000 |
| `sta teresa` | Santa Teresa · $10.000 |
| `BELLAVISTA` (pegado) | Bella Vista · $5.000 |
| `torres del bosque` (aprendido) | Torres del Bosque · $5.000 *(sugerido)* |
| `barrio Los Manzanos` (no existe) | **$0, sin reconocer** |

El ultimo caso importa tanto como los otros: **no se inventa una tarifa**. Queda
para que el operador la escriba, y ahi el sistema lo aprende.

---

## 80. BARRIDO DE PERMISOS — 28 GRANTs faltantes (2026-08-01)

Buscando por que no se leian los barrios aprendidos apareció **otra vez** el
mismo error: `pos_domi_aprendidos` no tenia `SELECT` para `service_role`, asi
que la Edge Function no podia leerla. **Es la tercera vez** (antes:
`iv_porciones` y `pos_wa_envios`).

Se hizo el barrido completo que estaba pendiente desde el 2026-07-24. **Faltaban
28 permisos:**

- **Sin acceso para la APP (`authenticated`), 6 tablas:** `iv_movimientos`,
  `pos_blacklist`, `pos_blacklist_direcciones`, `pos_registrations`,
  `pos_reservations`, `pos_gerente_procesados`.
- **Sin acceso para las FUNCIONES (`service_role`), 22 tablas:** las anteriores
  mas `iv_conteos`, `iv_conteo_lineas`, `iv_merma`, `iv_params`, `pos_bases`,
  `pos_cash_moves`, `pos_creditos`, `pos_credito_movimientos`,
  `pos_domi_aprendidos`, `pos_mesa_tiempos`, `pos_print_config`, `pos_printers`,
  `pos_puntos`, `pos_roles`, `pos_shifts`, `pos_wa_contactos`,
  `pos_blacklist_telefonos`.

Aplicados y verificados: **no queda ninguna tabla sin permisos**.

**REGLA, para no repetirlo una cuarta vez:** al crear una tabla nueva, el
`GRANT` va **a los dos roles**:
`GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabla> TO authenticated, service_role;`
La RLS sigue protegiendo por tenant; el GRANT solo abre la puerta.
Consulta de chequeo en `sql/2026-08-01-barrido-grants.sql`.


---

## 81. Puntos en TODOS los pedidos: mesa, venta rapida y domicilio (2026-08-01)

Pedido de Sergio: *"al seleccionar el cliente, si el cliente esta guardado se le
sumaran los puntos a ese cliente tambien en los pedidos de mesa y venta rapida,
y domicilio. Y si no se ha guardado el cliente, guardarlo, que quedaran guardados
los puntos en ese numero de telefono"*.

### El motor YA existia; el hueco era otro
Los puntos los da la base sola: el trigger `award_loyalty_points` sobre
`pos_orders` los suma cuando el pedido pasa a `paid`/`completed`, tomando el
telefono de `notes [tel:...]` o de `cliente_id`. Funciona para cualquier canal.
**El problema era que las mesas nunca traian a quien asignarselos:**

| Canal | Pedidos pagados | Con cliente | Puntos |
|---|---|---|---|
| Domicilio | 39 | 39 | siempre |
| Venta rapida | 26 | 10 | a veces |
| **Mesa** | 50 | **0** | **nunca** |

### Lo que se hizo
En la pantalla de **Pagos** ya existia el boton "Consumidor final"
(`data-action="cliente"`), pero no hacia nada: su `case` decia *"Modulos
futuros"*. Ahora abre un modal que:

1. Busca por **telefono** en `pos_clientes`.
2. Si existe: muestra nombre, barrio y **cuantos puntos lleva** (util para
   decirselo al cliente en el momento).
3. Si no existe: pide el nombre y **lo crea** con ese telefono.
4. Deja el `cliente_id` en el pedido **al instante, no al finalizar**: si el
   cajero se sale a mitad de camino, el cliente ya quedo asociado.
5. La fila del ticket pasa a mostrar `Nombre - N pts`.

Tambien hay boton **"Sin cliente"** para quitarlo.

Sirve igual en mesa, venta rapida y domicilio, porque la pantalla de Pagos es la
misma para los tres.

### Probado
Pedido de **mesa** por $35.000 (comida + empaque) con cliente asociado:
`0 puntos -> se marca pagado -> 35 puntos`. Cliente y pedido de prueba borrados.

### Pendiente de esta funcion (lo que sigue)
- **Puntos como metodo de pago** en la misma pantalla, solo para redimir lo que
  este en el catalogo de canje.
- **Catalogo de canje** (que se puede pedir con puntos y cuanto cuesta).
- Sergio debe escoger **cual de las dos plantillas** de puntos se usa.


---

## 82. Puntos ANUNCIADOS antes de cobrar (2026-08-01)

Sergio: *"en la pantalla de pagos, antes de pagar, ya aparecera cuantos puntos
va a ganar el cliente... esto se hace por si algun cliente al momento de pagar
pregunta cuantos puntos va a ganar, podemos informarle de inmediato"*.

Debajo del **Total a pagar** aparece ahora una franja verde:
`Andrea ganara 35 puntos con este pedido`. Se recalcula en cada
`renderTotals()`, asi que sigue en vivo al empaque, al domicilio y al cambiar de
cliente.

**Es solo un anuncio: no suma nada.** Los puntos los carga la base cuando el
pedido queda pagado. Si el cobro se cancela, nunca se sumo nada — no hay que
deshacer nada, que es justo lo que pidio Sergio.

**Sin cliente identificado** se muestra en gris: *"Este pedido vale 35 puntos.
Toca Consumidor final arriba para asignarselos a un cliente"*. Se dice la
verdad (no se van a acumular) y de paso se recuerda como hacerlo.

### Un desalineamiento que se detecto a tiempo
La primera version restaba el **descuento** al calcular los puntos. **El trigger
de la base NO lo resta**, porque `subtotal` se guarda sin descuento y al
finalizar el cobro no se reescribe. Con un descuento, la pantalla habria
anunciado menos puntos de los que la base iba a cargar.
Se alineo la pantalla con la base y quedo el comentario en las dos partes.

**PENDIENTE (decision de Sergio):** hoy un pedido con descuento acumula puntos
sobre el precio SIN descuento. Si se quiere que el descuento baje los puntos hay
que cambiar `award_loyalty_points` **y** `pgPuntosPreview` a la vez.

### Verificado: lo anunciado == lo cargado
| Escenario | Anuncio | Cargado |
|---|---|---|
| Mesa $34.000 + empaque $1.000 | 35 | **35** |
| Domicilio $17.000 + empaque, con envio $5.000 | 18 | **18** |
| Venta rapida $20.000 + empaque, descuento $5.000 | 21 | **21** |

El domicilio no da puntos (no es venta) y la propina tampoco. Datos de prueba
borrados.


---

## 83. Catalogo de canje por puntos — Configuracion -> Puntos (2026-08-01)

### La regla, en palabras de Sergio
*"Ante el sistema nada fue gratis, simplemente se usaron puntos para hacer el
pago... los puntos son un metodo de pago mas. Y solo aplica para productos que
esten dentro del catalogo; si se quiere pagar con puntos un producto que no
esta, debe aparecer la alerta"*.

Yo habia propuesto "producto gratis" y **estaba equivocado**: el pedido se cobra
igual, solo cambia con que se paga. La caja cuadra, la venta existe, el
inventario descuenta. Es el mismo criterio que ya se uso con los creditos.

### Donde quedo y por que
**Configuracion -> Puntos**, seccion nueva junto a Creditos. Se descarto ponerlo
dentro de la ficha de cada producto (Catalogo): habria obligado a entrar
producto por producto y **nunca se veria la lista completa de lo canjeable**.
Ademas el dia que se quiera premiar con algo que no esta en el menu, el Catalogo
no sirve.

### Como se arma (requisito textual de Sergio)
*"El catalogo de puntos me debe dar la opcion de poder incluir productos que ya
esten previamente creados con sus presentaciones y sus variantes, tambien poder
colocar el precio en puntos para todas las presentaciones y para todas las
variables o bloquear algunas presentaciones y algunas variables"*.

Se elige un producto existente y aparecen **sus presentaciones**, cada una con
casilla y su propio precio en puntos: se puede ofrecer la Personal a 900 puntos
y **no ofrecer la Familiar**. Debajo salen **sus variantes**, marcadas todas por
defecto; desmarcar deja el canje limitado a las marcadas.

### Modelo de datos
- `pos_puntos_catalogo`: **una fila por presentacion** (no por producto), con
  `puntos`, `activo` y `variantes` (jsonb `{grupo: [opciones]}`).
  **Si todas las variantes quedan marcadas se guarda `null`**, no la lista
  completa: asi, si manana se agrega una variante nueva al producto, entra sola
  en vez de quedar bloqueada sin que nadie se entere.
- `pos_puntos_movimientos`: para poder auditar de donde salen los puntos de un
  cliente. **Hoy solo existia el saldo** en `pos_puntos` y no habia forma de
  reconstruirlo.
- Los dos GRANTs desde el primer dia (leccion de las 4 veces anteriores).

### Verificacion
No se pudo revisar con sesion iniciada (la pantalla exige login y no se manejan
contrasenas). Se probo **ejecutando el codigo real de la pantalla** contra un
DOM simulado, 5 escenarios: lista con variantes limitadas y una presentacion
desactivada, lista vacia, modal de producto con variantes (respetando cuales
estaban permitidas), modal de producto sin variantes, y el texto resumen.
**Todo correcto.** Falta la revision visual de Sergio.

### PENDIENTE
- **Puntos como metodo de pago** en la pantalla de cobro, con la alerta cuando
  el producto no este en el catalogo.
- La tasa de acumulacion sigue fija en $1.000 = 1 punto **dentro del trigger**.
  Si se quiere configurable hay que cambiar el trigger, no solo la pantalla.


---

## 84. Puntos como METODO DE PAGO en la pantalla de cobro (2026-08-01)

Cierra lo de la entrada 83. Regla de Sergio: *"nada fue gratis, simplemente se
usaron puntos para hacer el pago... solo aplica para productos que esten dentro
del catalogo; si se quiere pagar con puntos un producto que no esta, debe
aparecer la alerta"*.

### Como quedo
**No se descuenta un valor suelto.** Al elegir el metodo *Puntos* se abre un
modal con **los productos del pedido**:
- Los que estan en el catalogo: casilla + lo que cuestan en puntos.
- Los que NO: se muestran **apagados y con el motivo** ("no esta en el catalogo
  de puntos", "ese tamano no se puede pagar con puntos", "esa variante no entra
  en el canje"). Esconderlos haria que el cajero no entienda por que faltan.

El pago que se registra vale **exactamente los pesos de esos productos**, con
metodo *Puntos*. La venta existe, la caja cuadra y el inventario descuenta
igual: solo cambia con que se pago.

### Decisiones
- **El metodo solo aparece cuando de verdad sirve**: hay cliente identificado,
  tiene saldo y existe catalogo. Un boton que siempre falla es peor que uno que
  no esta. Y se recarga al identificar o quitar al cliente, sin refrescar.
- **Los puntos se descuentan AL FINALIZAR**, no al aplicar el pago — mismo
  criterio del credito: si el cobro se cancela a medias, al cliente no se le
  quito nada.
- **Un solo pago con puntos por pedido**, para no enredar el arqueo.
- El monto nunca se pasa de lo que falta por cobrar.

### Base de datos
- `fn_puntos_consumir` con **`SELECT … FOR UPDATE`**: dos cajas cobrandole al
  mismo cliente a la vez no pueden gastar los mismos puntos. Lanza
  `PUNTOS_INSUFICIENTES|saldo|pedidos` para que el modal muestre cifras.
- `fn_puntos_devolver(order, motivo)`: si se anula el pedido, los puntos
  vuelven y **queda el movimiento**, no se borra el rastro.
- El emparejamiento producto->catalogo reutiliza las **tres redes** del
  descuento de inventario (nombre exacto, presentacion unica, deducir del
  nombre del item), porque es el mismo problema de las presentaciones sin nombre.

### Probado contra la base real
| Prueba | Resultado |
|---|---|
| Canjear 300 de 1.000 puntos | saldo 700 + movimiento con detalle |
| Intentar gastar 5.000 teniendo 700 | **bloqueado**, saldo intacto |
| Canjear 200 y anular el pedido | vuelve a 700, con movimiento de ajuste |
| Catalogo con solo la 1.5 Litros | la Personal queda fuera del canje |

Datos de prueba borrados. **El catalogo quedo vacio** (estaba vacio antes:
Sergio todavia no ha cargado sus productos).

### PENDIENTE
- Conectar `fn_puntos_devolver` a la anulacion de pedidos desde Ventas (hoy la
  funcion existe pero nadie la llama).
- La tasa de acumulacion sigue fija en $1.000 = 1 punto dentro del trigger.


---

## 85. Pago MIXTO: unos productos con puntos y otros con dinero (2026-08-01)

Sergio pregunto si el cajero puede escoger **cual** producto se redime cuando el
cliente lleva dos del catalogo y solo quiere canjear uno. **Si**, es exactamente
como quedo: el modal marca por producto y lo no marcado queda pendiente de
cobrar con otro metodo.

### Un fallo encontrado ANTES de que Sergio lo viviera
El boton **"Agregar pago" exigia `SP.entry > 0`** (un valor digitado en el
teclado). Con Puntos no se digita nada — el monto sale de los productos que se
elijan — asi que el boton habria quedado **bloqueado para siempre** y el metodo
no se habria podido usar. Corregido: con Puntos el boton se habilita solo y dice
**"Elegir productos a canjear"**.

### Verificado ejecutando la `calc()` real de la pantalla
Pedido: Coca Cola 1.5 ($8.000) + Salchipapa Pollo Personal ($17.000) + empaque
$1.000 = **$26.000**.

| Paso | Resultado |
|---|---|
| Se marca SOLO la Coca Cola (300 pts) | pago de $8.000 con puntos |
| Queda pendiente | **$18.000** — y *no* deja finalizar todavia |
| Se cobra el resto en efectivo ($20.000) | falta $0, vuelto $2.000, deja finalizar |
| Queda registrado | Puntos $8.000 + Efectivo $18.000 = **$26.000** |

La venta suma completa: **nada salio gratis**, que es la regla. El desglose deja
ver cuanto entro en dinero y cuanto se pago con puntos, con el detalle de que
producto se canjeo.


---

## 86. CORRECCION IMPORTANTE — lo canjeado con puntos NO es venta (2026-08-01)

**Sergio corrigio un error de fondo mio.** Yo habia registrado el canje como un
**pago de $8.000 con metodo "Puntos"**. Sus palabras:

> *"300 puntos no equivalen a 8.000 pesos... la gaseosa costo 300 puntos, no
> 8.000 pesos. En las ventas solo debe entrar el dinero real, no debe entrar
> dinero ficticio. Si dimos una Coca Cola a cambio de puntos, esa Coca Cola no
> puede entrar en la suma de las ventas, debe aparecer como si no se hubiera
> vendido, pero si se descuenta de los insumos, asi las cuentas no se van a
> inflar."*

Tiene razon: con mi version, un dia con 10 canjes habria mostrado ~$80.000 de
ventas que **nunca entraron a la caja**, y el arqueo no habria cuadrado.

### Como quedo
El canje **ya no es un pago**: es una **salida de la venta**.
- `calc()` **resta del subtotal** los productos canjeados. El total a cobrar es
  solo lo que el cliente paga en dinero.
- El ticket muestra una fila morada: *"Canjeado con puntos · 300 pts ·
  −$8.000 no es venta"*, con una X para quitarlo.
- Al finalizar se guardan en el pedido `puntos_redimidos` (300) y
  `puntos_valor` ($8.000). **`puntos_valor` NO es venta**: es solo para saber
  cuanto se regalo en producto.
- El producto **sigue en el pedido**, asi que el inventario descuenta igual.

### Y el trigger tambien estaba mal
`award_loyalty_points` daba puntos sobre el total **incluyendo lo canjeado**:
canjear generaba puntos nuevos y la bola de nieve no paraba. Ahora resta
`puntos_valor` antes de calcular. Ademas escribe el movimiento de acumulacion
en `pos_puntos_movimientos`, que antes no quedaba registrado.

### En el cierre de caja
Tarjeta nueva **"Puntos redimidos"** con los puntos del turno y, debajo,
cuantos canjes y **cuanto se entrego en producto**. Va aparte de las ventas a
proposito, para que el total de ventas siga siendo dinero real.

### Verificado con la `calc()` real
Pedido: Coca Cola $8.000 + Salchipapa $17.000 + empaque $1.000.
Se canjea la Coca Cola por 300 puntos:

| | |
|---|---|
| Subtotal que SI es venta | **$17.000** (la Coca Cola salio) |
| Valor canjeado | $8.000 — *no entra a ventas* |
| Total a cobrar | **$18.000** |
| Dinero que entro | **$18.000** |
| Venta registrada | **$18.000** |

Caso extremo (todo el pedido canjeado): la venta queda en **$1.000**, solo el
empaque, que si se cobra.

### PENDIENTE (lo pidio Sergio para despues)
Informe de puntos: cuantos se redimen, cuanto se regala en producto al mes,
cuantos hay en circulacion. Los datos ya quedan guardados
(`pos_puntos_movimientos`, `puntos_redimidos`, `puntos_valor`) para poder
armarlo sin tocar nada mas.


---

## 87. Los cinco pendientes cortos (2026-08-01)

### 1. Anular un pedido devuelve los puntos
**Hay SEIS sitios que anulan pedidos** (caja, domicilios, ventas x3,
tomar-pedido). Parchear los seis dejaba la puerta abierta al septimo, asi que se
resolvio **en la base**: trigger `trg_puntos_anular` sobre `pos_orders`.

Revierte **las dos direcciones**: devuelve los puntos que se canjearon Y quita
los que se ganaron (un pedido anulado no puede dejar puntos ganados). Columna
`revertido` en `pos_puntos_movimientos` para que anular dos veces no duplique.
El trigger traga sus propios errores: **anular nunca puede fallar por los
puntos**.

**Probado:** 1.000 -> canjea 300 (700) -> paga y gana 20 (720) -> **anula ->
1.000**. Anulando dos veces sigue en 1.000.

### 2. El nombre del cliente ya se refresca solo en el chat
El nombre sale del cruce por telefono con `pos_clientes`, y ese mapa solo se
cargaba al abrir la pantalla: si el pedido acababa de crear al cliente, la
conversacion seguia mostrando el numero pelado hasta recargar. Ahora, al crear
el pedido, se vuelve a bajar el mapa y se repintan lista y cabecera.
**No se toca `chat_conversations.contact_name`** — ese es el nombre del perfil
de WhatsApp y lo maneja Meta.

### 3. Letra mas grande en los totales del recibo de cierre
`.big` 12 -> **14 px** (TOTAL CONTADO, EFECT. ESPERADO) y `.xl` 13 -> **15,5 px**
(CUADRE / SOBRANTE / FALTANTE). **Falta la prueba en papel**: el recibo esta
fijado a 72 mm y si una cifra larga se parte hay que bajarlo.

### 4. Verificar transferencia desde la pantalla de cobro
Boton que usa la MISMA funcion del chat (`verify-transfer`): lee el comprobante
que mando el cliente y lo contrasta con el correo del banco. Si confirma,
recarga para mostrar el pago ya aplicado.

**Solo aparece cuando sirve**: metodo digital **y** pedido que viene del chat.
Sin comprobante no hay nada que verificar, y un boton que siempre falla estorba
mas de lo que ayuda.

### 5. Tono y volumen de las notificaciones
En **Configuracion -> Operacion -> Notificaciones**: interruptor, cuatro tonos
(Suave, Clasico, Campana, Alerta), volumen 0-100% y boton **Probar**. El tono
suena al elegirlo, que es como se escoge un sonido.

Vive dentro de la config de Operacion, que **se sincroniza a la base**: la
tablet y el computador suenan igual sin configurarlos por separado.

**Probado con el codigo real**, incluidos los casos feos: sin configurar,
apagado, volumen 0, tono inexistente, volumen fuera de rango y **config
corrupta** — en todos cae al valor seguro. El defecto (0,09 de ganancia) es
**exactamente el volumen actual**, asi que a quien no lo toque no le cambia nada.


---

## 88. El boton "Selecciona un cliente" de la mesa NO existia (2026-08-01)

Sergio: *"el boton de seleccionar cliente cuando se va a hacer un pedido de mesa
no sirve"*. **Cierto, y de la peor forma: era decorativo.** La fila
`#cliente-row` estaba en `tomar-pedido.html` con su icono y su flechita, pero
**ningun JavaScript la escuchaba**. Nunca hizo nada.

Eso explica el dato de la entrada 81: **0 de 50 pedidos de salon tenian
cliente**. No era que los meseros no lo usaran — es que no se podia usar.

### Lo que se hizo
- La fila abre un modal igual al de Pagos: busca por telefono, muestra el
  nombre, el barrio y **cuantos puntos lleva**; si no existe, lo crea con ese
  numero. Tambien tiene "Sin cliente".
- El pedido nuevo se crea con `cliente_id` y `customer_name`.
- Si la mesa **ya tiene pedido**, se guarda al instante; si la comanda todavia
  esta vacia, queda en memoria y se escribe al crear la orden.
- Al reabrir una mesa que ya tiene cliente, la fila lo muestra con sus puntos.
- Verificado que `posSync.writeOrderBatch` **no descarta** el campo (hace
  `{...orderData}`) y que el `select('*')` de la mesa lo trae de vuelta.

### Probado de punta a punta contra la base
| Paso | Puntos |
|---|---|
| Cliente nuevo | 0 |
| Mesa abierta con cliente ($46.000) | 0 — todavia no se cobra |
| **Mesa cobrada** | **46** + movimiento `acumulacion` registrado |

Datos de prueba borrados.

---

## 89. Las respuestas a BOTONES se guardaban como "[interactive]" (2026-08-01)

**Durante el servicio.** Sergio mando un mensaje con botones (*Familiar /
Personal*), el cliente toco uno, y en el chat solo aparecio `[interactive]`.

**El dato se perdio.** `meta-webhook` recibia la respuesta completa de Meta
—con el titulo del boton adentro— y guardaba solo `[${msgType}]`, botando el
contenido. No estaba en la base, ni en `pending_order_data` (el bot no
intervino: contestaba Sergio a mano), ni en los logs. **Meta no permite volver
a pedir el contenido de un mensaje ya recibido**, asi que ese pedido hubo que
preguntarselo al cliente.

### Arreglo (meta-webhook v54)
Se agregaron los tipos que faltaban:
- `interactive` -> `button_reply.title` o `list_reply.title` (con su
  descripcion si la trae). Si no viniera el titulo, al menos el id del boton.
- `button` -> `button.text` (botones de plantilla / quick reply).

### Probado enviandole al webhook payloads reales de Meta
| Lo que toca el cliente | Lo que queda guardado |
|---|---|
| Boton "Personal" | `Personal` |
| Lista "Familiar" + descripcion | `Familiar — Para 2 personas` |
| Boton de plantilla | `Sí, quiero` |

Antes los tres decian `[interactive]`. Conversacion de prueba borrada.

**Ojo:** el canal se identifica por el `waba_id` que viene en `entry[].id`, no
por el `phone_number_id`. Una prueba con waba_id falso se descarta en silencio
(el webhook responde 200 igual) — util saberlo para no perder tiempo.

**Lo viejo no se puede reconstruir:** los mensajes que ya estan guardados como
`[interactive]` se quedan asi.


---

## 90. El bot ya NO inventa productos + el audio entra al analisis (2026-08-02)

Los dos pendientes rojos de anoche, que resultaron ser el mismo problema visto
por dos lados.

### La regla que lo ordena todo (Sergio)
> *"No puede inventarse productos, solo debe colocar productos que esten
> guardados... si el cliente indica su pedido de manera muy rara, es mejor que
> diga que no se reconocio el producto, pero que no invente. Caemos en el mismo
> error: detectar intenciones, no palabras exactas, porque si trabaja con
> palabras exactas en un chat siempre se va a equivocar."*

### 1. El modelo ESCOGE de la lista, ya no escribe nombres
El menu va **numerado** (`#12 [Bebidas] COCA COLA | tamaños: …`) y el modelo
devuelve **el numero**, no el nombre. Con un numero **no hay nada que
emparejar**: o eligio un producto que existe, o no eligio.

**Por que era necesario:** al modelo YA se le mandaba el menu completo y YA
tenia la instruccion *"usa EXACTAMENTE los nombres del MENU"*. **La desobedecio
igual** y escribio `Coca-Cola` (con guion) contra `COCA COLA` del catalogo, y el
producto quedo en $0. Pedirselo mejor no funcionaba.

Si no encuentra el producto en la lista devuelve `n: null` y el producto sale
**sin reconocer**, nunca inventado.

### 2. El audio transcrito entra al analisis
El filtro preguntaba *"¿es de tipo texto?"* y botaba los audios **con
transcripcion y todo**. Ahora pregunta *"¿tiene texto?"*. Se excluyen solo los
mensajes que traen un marcador de archivo (`[imagen]`, nombres de archivo).
Ademas se limpia el emoji de microfono del principio, que ensuciaba el analisis.

### 3. Respaldo: guiones y puntos cuentan como espacio
`norm()` ahora trata `- _ . / ,` como espacio. Es **solo respaldo** — lo que de
verdad resuelve es el numero.

### Un error propio, detectado y corregido en la prueba
Al elegir por numero se **saltaba la regla de las adiciones**: *"una personal de
pollo"* eligio el Pollo de **Adiciones ($9.000)** en vez de la Salchipapa Pollo
Personal (**$17.000**). Se agrego un guard: si el modelo elige algo de Adiciones
y el cliente no pidio ninguna adicion, esa eleccion se descarta y se reconoce
por nombre. **Elegir por numero es correcto, pero no puede saltarse las reglas
del negocio.**

### Verificado
| Lo que escribe el cliente | Resultado |
|---|---|
| `Coca-Cola` (con guion) | COCA COLA Personal **$5.000** *(antes $0)* |
| `cocacola` (pegado) | COCA COLA Personal $5.000 |
| `coquita` (diminutivo) | COCA COLA Personal $5.000 |
| 🎙️ `premiumista` (de un audio) | Premium **$34.000** *(antes 0 productos)* |
| `una personal de pollo` | Salchipapa Pollo **$17.000**, no la adicion de $9.000 |
| `con adicion de pollo` | Premium Mixta + adicion Pollo |
| `una pizza hawaiana` (no existe) | **sin productos — no inventa** |

**Regresion:** 12 conversaciones reales, **18 productos, 0 sin resolver**.
Conversaciones de prueba borradas.

### Nota de proceso
Durante el arreglo la funcion quedo unos minutos rota (`Assignment to constant
variable`: agregue el guard sin cambiar `const` por `let`). Se detecto en la
prueba y se corrigio. **Probar despues de cada despliegue no es opcional.**


---

## 91. El comprobante se lee por SIGNIFICADO, no por etiquetas (2026-08-02)

Cierra el pendiente de Bre-B. **Regla de Sergio:** *"las personas me van a enviar
comprobantes de varios bancos, y en cada banco los datos pueden estar en lugares
diferentes; el sistema debe extraerlos sin importar en que parte estan."*

### La evidencia: tres bancos, tres formas de nombrar lo mismo
Sergio mando comprobantes reales:

| Banco | Como etiqueta la cuenta destino |
|---|---|
| Davivienda | *"a la llave Bancolombia **0089912015** de El Parche Food"* — suelta en una frase, **sin etiqueta** |
| Nequi | *"Llave: **0092726260**"* |
| Bre-B | *"Codigo de negocio: **0092726260**"* |

Ir agregando etiquetas a una lista era una carrera perdida.

### Lo que se hizo
1. **El prompt describe el ROL, no la etiqueta.** Se le dice al modelo que la
   llave destino es *"el numero que identifica a QUIEN RECIBIO la plata, no te
   guies por la etiqueta"*, con las tres formas como ejemplo, y que **nunca** use
   los numeros de las secciones de origen (*"¿De donde salio?"*, *"¿Desde donde
   se hizo el envio?"*).
2. **Devuelve TODOS los numeros** que ve, cada uno marcado como
   `destino | origen | referencia | otro`. Asi, **aunque el modelo se equivoque
   clasificando, el numero llego** y se puede comparar.
3. **La comparacion la hace nuestro codigo**, no el modelo: busca la cuenta
   configurada entre todos los numeros que no sean del remitente.

### Un riesgo propio, encontrado en la prueba
La primera version comparaba con `includes`, asi que **un numero de 6 digitos
que fuera subcadena daba por buena una transferencia a OTRA cuenta**. Se
endurecio: iguales, o una termina en la otra **con minimo 8 digitos**.

### Verificado
**Con los tres comprobantes reales que ya estan en el sistema:** los tres pasan
ahora `monto ✓ cuenta ✓` (el correo falla porque son pagos de hace dias y la
ventana de Gmail es de 5 h — comportamiento correcto). El de Bre-B que ayer
decia *"El pago fue enviado a otra cuenta (EL PARCHE FOOD SERGIO ABADIA)"* ahora
lee **0092726260 (destino)** y valida.

**Y rechaza lo que debe rechazar:**

| Numero | Resultado |
|---|---|
| `0092726260` (la cuenta) | coincide |
| `92726260` (sin los ceros) | coincide |
| `0089912015` (cuenta VIEJA de Davivienda) | **rechaza** |
| `272626` (subcadena corta) | **rechaza** |
| `3112317166` (celular del remitente) | **rechaza** |

### PENDIENTE menor (decision de Sergio)
Hoy solo se compara contra UNA cuenta (`pagos.llave`). Si algun dia recibe en
mas de una, hay que permitir **varias cuentas** en la configuracion; si no, los
pagos a las otras se rechazan. La cuenta de Davivienda `0089912015` es vieja y
ya no se usa, asi que por ahora no hace falta.


### Complemento — la verificacion lee TODAS las cuentas del restaurante (v13)

**Sergio:** *"hay una parte de metodos de pago en configuraciones, de ahi puede
coger la cuenta, y si un dueno de restaurante pone mas cuentas el sistema
deberia poder ver todas las que estan ahi."*

**Como estaba:** se comparaba contra **una sola** cuenta (`pagos.llave`).

**Como quedo:** se arma la lista con **todas** las cuentas del negocio:
- `pagos.llave` (la principal)
- `pagos.nequi` y `pagos.daviplata` si tienen numero
- **la `cuenta` de cada metodo de pago ACTIVO** de
  *Configuracion → Metodos de pago*

El comprobante vale si fue a **cualquiera** de ellas. Si el dueno agrega otro
banco en Configuracion, **el sistema lo reconoce solo, sin tocar codigo** — que
es justo la regla de que nada quede quemado.

**Probado en vivo:** se agrego temporalmente un segundo metodo con la cuenta
`0089912015`; el sistema paso a ver `['0092726260', '0089912015']` al instante.
**La configuracion se restauro identica** (verificado comparando el JSON).

El mensaje de rechazo tambien mejoro: antes decia *"no a la tuya (0092726260)"*;
ahora lista todas — *"Las tuyas son: 0092726260, 0089912015"*.

---

## 92. Inventario por WhatsApp: la lista larga de bebidas

**Lo que pasó.** El gerente mandó las 14 bebidas de una sola vez ("6 Quatro
1.5 litros en bodega, 3 en servicio" y así 14 líneas) y el bot contestó
**"No te entendí"** sin haber tocado nada.

**No era una causa, eran cuatro encadenadas:**

1. **Cupo de respuesta del modelo.** 14 líneas × (bodega + servicio) = 28
   operaciones. El `max_tokens: 900` no daba ni para 12: el JSON llegaba
   partido, `JSON.parse` reventaba y el `catch` devolvía cero operaciones.
   Desde fuera eso se veía exactamente igual que "no entendí nada".
2. **Números mezclados entre líneas.** Con varias líneas juntas el modelo
   confundía productos de nombre parecido: *Hit Litro Naranja Piña … 4 en
   servicio* quedó en **5**, que era el número del *Hit Litro Lulo* de la
   línea siguiente.
3. **Número sin unidad leído como paquete.** *"1 Hit Litro Mango en bodega"*
   quedó en **12** — el modelo entendió 1 paquete en vez de 1 botella.
4. **Cupo por minuto de OpenAI.** Al pasar a una llamada por línea, cada una
   mandaba el inventario entero (~3.500 tokens): 15 líneas = 52.000 tokens
   contra un límite de 30.000/min. OpenAI rechazaba 13 de 15 llamadas **y las
   líneas se perdían en silencio**.

**Cómo quedó (`gerente-inventario` v16):**

- Los mensajes de más de 3 líneas se parten y **cada línea se interpreta por
  separado**, en tandas de 8. Sin líneas vecinas no hay números que mezclar.
- A cada línea se le mandan **solo los insumos que se le parecen** (máximo 15,
  por coincidencia de palabras) en vez del inventario completo.
- Esas llamadas de línea suelta usan **gpt-4o-mini**: la tarea es mínima y su
  cupo por minuto aguanta la ráfaga. Los mensajes normales, de una sola frase,
  siguen con gpt-4o.
- Si aun así rebota por cupo, **espera 8 segundos y reintenta** una vez.
- Regla nueva: un número sin unidad son **unidades sueltas**, nunca paquetes,
  salvo que se diga "paquete/paca/caja/bulto". Excepción: lo que se compra por
  peso o volumen (kg, litro) sigue en su unidad de compra.
- Regla nueva: una línea puede llevar **los dos destinos** ("6 en bodega, 3 en
  servicio" = dos operaciones del mismo insumo).
- **Respuesta compacta** cuando hay más de 6 cambios: una línea por insumo. El
  formato detallado de siempre ocupaba ~5.600 caracteres con 28 cambios y
  WhatsApp corta en 4.096 — el mensaje no habría llegado nunca.
- **Las líneas que no se entienden se dicen**, una por una ("Estas no las
  entendí, no las toqué"). Antes se perdían sin que nadie se enterara.
- Si el procesamiento se atasca, ya no dice "No te entendí" (que echa la culpa
  al gerente) sino *"se me enredó, mándamelo en dos partes"*.

**Probado en vivo** con las 14 bebidas reales: **28 valores, todos exactos**,
17,5 segundos, respuesta de 1.485 caracteres. La prueba se hizo con los valores
que ya tenía el inventario, así que no se alteró ningún dato; los dos que sí
movió una prueba anterior (*Hit Litro Mango* y *Hit Litro Naranja Piña*) se
devolvieron a su valor original, y los registros de prueba se borraron de
`pos_gerente_ops`.

**Ojo para el futuro:** el cupo de gpt-4o es de 30.000 tokens por minuto **para
todo el sistema**. Una ráfaga larga de una función puede dejar sin cupo al bot
que atiende clientes. Por eso lo que se pueda resolver con `gpt-4o-mini` debe ir
en mini.

**Trampa de herramientas (para no repetirla):** `GET /functions/{slug}/body`
devuelve la primera línea truncada (aquí se comió `// g`), y escribir el archivo
con `io.open(p,'w')` lo deja en **0 bytes** si falla la codificación. Desde
ahora: reconstruir la línea 1 y escribir siempre a un `.tmp` y luego `os.replace`.

---

## 93. Segundo número de contacto del cliente

**De dónde salió.** Vilma Ortiz escribió desde un celular distinto al que tenía
guardado. En el chat aparecía como si nunca hubiera pedido, aunque el pedido ya
estaba en camino. Sergio pidió dos cosas: corregir esa ficha (hecho en la ronda
anterior) y **poder anotar un segundo número** "por si acaso el cliente lo
indica".

**La regla, que es lo importante:** el **teléfono principal es la identidad** del
cliente y el único que acumula puntos. El segundo **solo sirve para contactarlo
y para encontrarlo al buscar**. Nunca crea una ficha aparte ni recibe puntos.

**Qué se hizo:**

- `pos-clientes.js` — el campo viaja en las dos direcciones (`tel2` en la app,
  `telefono2` en la tabla). Como todas las pantallas leen por aquí, con esto
  solo el dato ya llega a todas.
- **Domicilios** — campo *"Otro teléfono (opcional)"* junto al principal, con la
  aclaración en letra pequeña de que los puntos van al principal. La búsqueda de
  clientes ya encuentra por cualquiera de los dos.
- **Selector de cliente compartido** (el que usan Pagos, Tomar pedido y
  Domicilios) — busca por los dos números y el alta rápida permite anotarlo.
- **Chat** — si no encuentra ficha con el número que escribe, **la busca por el
  segundo**. Cuando la encuentra así, muestra un aviso: *"Escribe desde su
  segundo número. Su número principal es …, y ahí van sus puntos"*. Sin ese
  aviso la ficha parecería no corresponder con el número de arriba.
- Los **puntos y el nivel** se leen siempre del teléfono principal. Si no, al
  escribir desde el segundo saldrían en cero y parecería que perdió sus puntos.

**Probado contra la base:** se creó una ficha con los dos números, se comprobó
que se encuentra por el principal **y** por el segundo, y se borró.

**Lo que queda suelto:** cuando un cliente escribe desde un número que no es el
suyo, el sistema todavía no ofrece *"¿lo guardo como su segundo número?"* — hay
que escribirlo a mano en la ficha. Se puede añadir más adelante si estorba.

---

## 94. Recibo del cliente: segundo teléfono, puntos, adiciones y notas

Aprobado por Sergio sobre maqueta, generando el recibo **real** (ejecutando
`_buildReceiptDomicilio` en node) en vez de dibujarlo — la primera maqueta que
hice a mano se saltó las cajas de `TOTAL DEL PEDIDO` y `PAGADO`, y no servía
para decidir.

**Cambios en `pos-print.js`:**

1. **Fuera la caja "TOTAL DEL PEDIDO".** Repetía el `TOTAL` de dos líneas más
   arriba. Se había puesto para el domiciliario, pero el número ya estaba ahí.
2. **La caja de pago sin asteriscos y con esquinas redondeadas** (`border-radius:9px`).
   Los tres estados siguen igual: `PAGADO` / `COBRAR: $X` / `Ya abonó $X ·
   COBRAR: $Y`.
3. **Segundo teléfono** del cliente (`Otro: …`) debajo del principal, solo si lo
   tiene guardado.
4. **Bloque de puntos** entre el estado de pago y el pie: lo que ganó con esa
   compra y su total acumulado.
5. **Adiciones con cantidad y precio**: `+ 2x Papas ($16.000)`. El precio va
   **entre paréntesis a propósito** — ya está dentro del valor de la línea; con
   un `+ $8.000` parecería que hay que sumarlo aparte y el cliente creería que
   la cuenta está mal. Si el producto va por dos, la adición se multiplica sola,
   así lo impreso siempre cuadra con el total de la línea.
6. **Nota de cada producto** en negrilla (`Nota: SIN AJO`). Es lo que más
   reclama el cliente si sale mal, así que tiene que saltar a la vista.

**El fallo que salió de paso:** el recibo pedía `it.note` y la columna de
`pos_order_items` se llama **`notes`**. Con el nombre equivocado la nota llegaba
siempre vacía, así que **nunca se ha impreso una sola nota de producto**. Además
las adiciones se aplanaban a solo el nombre (`m.name`), perdiendo `qty` y
`price`, que es justo lo que hacía falta para imprimirlas completas.

**De dónde salen los datos.** Ni el segundo teléfono ni los puntos viven en el
pedido, así que hay que ir a buscarlos antes de armar el recibo
(`_datosClienteRecibo`):

- Ficha del cliente por `cliente_id`; si no hay, por el teléfono del pedido
  contra `telefono` y luego contra `telefono2`.
- Saldo desde `pos_puntos`, **siempre por el teléfono principal** — si el pedido
  entró por el segundo número, los puntos igual están en el principal.
- Lo ganado con ese pedido desde `pos_puntos_movimientos` filtrando por
  `order_id`, `tipo = 'acumulacion'` y `revertido = false`.

**Reglas de fallo:** si la consulta falla (sin internet), el recibo sale como
siempre en vez de no salir. Si no hay cliente guardado (venta al paso), no se
imprime nada de puntos ni de segundo teléfono — nada de "0 puntos". Y si los
puntos de ese pedido aún no están acreditados (recibo impreso antes de cobrar),
esa línea no se imprime: **no se inventa el número**, solo se muestra el
acumulado real.

**Probado:** el recibo generado con el archivo ya modificado sale idéntico a la
maqueta aprobada; y la cadena de consultas se validó contra un pedido real
(pedido → ficha → `pos_puntos` = 49 → movimiento de ese pedido = 49).

**Lo que NO se tocó:** los recibos de mesa (`_buildReceiptDesc`,
`_buildReceiptFinal`) **no imprimen adiciones ni notas en absoluto** — no es el
mismo fallo del nombre de columna, es que nunca las mostraron. Queda pendiente
si Sergio lo quiere ahí también. La comanda de cocina sigue igual: ahí no van ni
puntos ni teléfonos.

---

## 95. Un solo recibo para los tres canales

Mesa tenía su propio recibo (`_buildReceiptFinal`) y se había quedado muy atrás:
letra monoespaciada, 80 mm en vez de 72, **sin el nombre del negocio**, sin
cliente, sin adiciones, sin notas y sin puntos. Lo único que tenía de más era la
propina y el desglose de cómo pagó.

Lo más grave no eran las adiciones: **el recibo que recibía un cliente sentado
en la mesa no decía en ningún lado El Parche Food** — ni nombre, ni dirección,
ni teléfono. Y salía a 80 mm en una impresora de 72, así que podía estar
recortando el borde derecho.

**En vez de mantener dos recibos, ahora hay uno.** `_buildReceiptDomicilio`
sirve a domicilio, venta rápida y mesa; cada canal solo cambia lo suyo:

| | Domicilio | Venta rápida | Mesa |
|---|---|---|---|
| Título | RECIBO DE DOMICILIO | RECIBO · PARA LLEVAR | RECIBO DE MESA |
| Bloque de arriba | Cliente + barrio + dirección | Cliente + "Recoge en el local" | Mesa + salón + personas + mesero, y el cliente solo si lo seleccionaron |

Todo lo demás es idéntico: encabezado del negocio, adiciones con precio, notas,
totales, estado de pago, puntos y pie.

**En mesa la mesa va primero y el cliente después** — al revés que en domicilio.
El mesero reparte cuentas buscando la mesa, no el nombre.

**Lo que tenía mesa no se perdió, y ahora lo tienen los tres:**

- **Propina**, si el pedido la lleva.
- **Desglose de forma de pago**, pero **solo si pagó con más de un método**. Con
  un solo método se queda la línea de siempre; un "Forma de pago" de un solo
  renglón es gastar papel.

**Efectivo y cambio** (pedido de Sergio). Los datos ya existían en
`pos_payments` (`received` y `vuelto`), solo faltaba imprimirlos. Reglas:

- Solo en pagos **en efectivo** y **solo si hubo cambio**. Si pagó justo no se
  imprime nada: el TOTAL ya lo dice y un "Cambio: $0" es ruido.
- **Si el efectivo fue el único pago**, las filas son `Efectivo $150.000` /
  `Cambio $13.600`, como en cualquier recibo de caja — y se quita la línea
  "Pago: Efectivo" de encima, que diría lo mismo.
- **Si hubo varios métodos**, va **solo** `Cambio`, sangrado bajo la línea de
  efectivo. No se repite el monto recibido: arriba ya está lo que se abonó en
  efectivo, y sumándole el cambio se sabe con cuánto pagó. (Se probó una fila
  "Recibido" y Sergio la quitó: sobraba.)
- El cambio va en **negrilla** y el resto no. Es el número que el cliente
  revisa.

También se quitó el emoji de "Recoge en el local".

**Código muerto borrado:** `_buildReceiptDesc` (ya no lo llamaba nadie desde
hacía tiempo) y `_buildReceiptFinal`. Dejar dos constructores de recibo sin uso
es una invitación a reconectarlos por error.

**Un tropiezo que vale anotar:** al borrar ese bloque se fue por delante también
`_money`, que vivía entre medias. `node --check` pasó igual — era un error de
ejecución, no de sintaxis. Lo cazó la prueba de render de los tres canales.
**Moraleja: después de borrar código, renderizar, no solo chequear sintaxis.**

**Probado** generando los tres recibos con el archivo ya instalado: domicilio
(cliente, segundo teléfono, puntos), venta rápida (Efectivo/Cambio con un solo
pago) y mesa (propina, desglose con cambio sangrado, puntos).

**Falta probar en papel.** Nadie ha impreso todavía el de mesa con el diseño
nuevo a 72 mm.
---

## 96. Impuestos en los tres recibos

Sergio pidió que los impuestos salgan en los recibos de mesa, venta rápida y
domicilio, solo si el restaurante los tiene activados.

**La mitad ya estaba resuelta** por la unificación de la ronda anterior: el
único recibo que quedó ya traía el desglose. Pero probándolo apareció el motivo
real de que no se vieran.

**El fallo: la config de impuestos solo la cargaba la pantalla de Pagos.**
`posImpuestos` arranca con `CFG = null` y `activo()` devuelve `false` hasta que
alguien llama a `setConfig(...)`. En todo el sistema solo lo hacían
`configuracion.js` y `pagos.js`. Resultado: el desglose de impuestos se imprimía
**únicamente si el cobro salía desde la pantalla de Pagos**. El mismo pedido
impreso desde Ventas, Domicilios, Historial, Caja o el Chat salía sin una sola
línea de impuesto, en silencio y sin error.

Y no era un caso raro: los tres recibos se imprimen casi siempre desde otras
pantallas.

**Arreglo:** la config se carga en `pos-print.js`, no en la pantalla. Se pide
`operacion_config` en la **misma** consulta a `branches` que ya se hacía para el
encabezado, así que no hay viaje extra a la base:

```js
var br = await sb2.from('branches').select('name,address,phone,brand_id,operacion_config')...
if (window.posImpuestos && branch.operacion_config && branch.operacion_config.impuestos) {
  posImpuestos.setConfig(branch.operacion_config.impuestos);
}
```

Solo se pisa la config si de verdad llegó una: si la consulta no la trae, se
respeta la que la pantalla hubiera cargado.

**Cómo sale:** `Base gravable` y `Impoconsumo 8%` (o IVA, según el tipo
configurado) entre el Subtotal y el Empaque. Si el restaurante no cobra
impuesto, no se imprime nada — ni una línea en cero.

**Probado** con el archivo ya instalado, los tres canales, activado y
desactivado. Con impuestos apagados el recibo sale exactamente igual que antes.

**Ojo — El Parche hoy tiene `activo: false`,** así que Sergio no verá ningún
cambio hasta que los active en Configuración. No hay ningún pedido con
`tax_total > 0` en la base todavía. Esto es para cuando los active, o para otro
restaurante que sí sea responsable.

**Queda suelto:** existe `posImpuestos.leyendaNoResponsable()` —
*"No responsable de impuesto al consumo"*— y **no la usa nadie**. En Colombia
esa leyenda debe ir en el documento del que no cobra impuesto. Está sin decidir
si se imprime.
---

## 97. Agregar ítems: mesa (comanda completa) y domicilio

### El problema que reportó Sergio

Al agregar un ítem a una mesa ya pagada, el panel de Ventas se quedaba
mostrando **solo lo último agregado**. Las salchipapas de la primera ronda
desaparecían de la pantalla y el mesero no podía ver qué llevaba la mesa.

**La causa:** `tomar-pedido.js` → `loadOpenOrder()` solo busca órdenes
`open`/`in_progress`. Una orden **pagada no se carga**, así que arranca con el
carrito vacío y crea una orden NUEVA. El panel sigue `current_order_id`, que
pasa a apuntar a la nueva.

Eso **no es un error**: es justamente lo que hace que al cobrar aparezca solo lo
nuevo, que es lo que Sergio quiere. Así que no se deshizo. Lo que cambió es que
el panel junta los pedidos de la misma visita.

### La marca de visita (`pos_tables.sesion_at`)

Para juntarlos hacía falta saber cuándo empezó la visita, y no había forma:

- Los pedidos se quedan en `paid` **para siempre** — la mesa 1 tiene 17 de días
  distintos. Agrupar por estado juntaría la cena de hoy con la del martes.
- Existe `pos_orders.session_id`, pero es **el turno de caja**: 17 pedidos
  comparten uno.

Columna nueva: se pone al ocupar la mesa **estando libre** (con `.is('sesion_at',
null)`, para que una segunda ronda no reinicie la visita) y se borra al
liberarla, en los dos sitios donde eso pasa (`tomar-pedido.js:releaseTable` y
`ventas-salon.js`).

### En pantalla

- La comanda muestra **todos** los ítems de la visita; las rondas ya cobradas
  llevan marca `pagado`.
- Los totales se separan en **Ya pagado / Por cobrar / Total de la mesa**. Sin
  separarlos, el "Total" diría solo lo que falta por cobrar y parecería que la
  mesa consumió menos de lo que consumió.

**Caso real que lo comprueba:** la mesa `tmry2e6a4but` pidió $77.000 y 39
minutos después agregó $4.000. Antes el panel mostraba $4.000 solo.

### Domicilio: agregar al mismo pedido

Regla de Sergio: *"se suma automáticamente al pedido que ya está… solo cuando
todavía se está preparando, para que alcancemos a enviarlo junto. Si ya salió,
simplemente hacen un nuevo domicilio."*

- El botón **solo aparece en preparación**. En camino o entregado no sale.
- `domicilios.html?agregar=<orderId>` entra en **modo agregar**: se salta el
  modal de registro, no se elige canal, ni cliente, ni dirección, ni
  domiciliario — todo eso ya es del pedido. Solo se escogen productos.
- Banner azul recordando a quién se le está agregando, y el botón pasa a
  *"Agregar al pedido"*.
- **El envío no se vuelve a cobrar** (`S.fee = 0`): ya se cobró en ese pedido.
- Al guardar: los ítems se insertan con el `order_id` existente y el pedido
  crece en `subtotal`, `packaging_fee` y `total`. No se crea orden nueva.
- Guardas: si el pedido está cancelado o ya salió, avisa y devuelve a Ventas.
- El modo se activa **al final del arranque**, con la pantalla ya pintada: si
  entra antes, el repintado normal deshace el banner y el botón.
- La comanda de cocina imprime **solo lo nuevo** (lo ya impreso queda marcado
  con `kitchen_printed_at`), que es lo correcto: nadie vuelve a preparar lo de
  antes.

### Lo que falta

- **Venta rápida no tiene "Agregar ítem".** Falta decidir qué debe hacer:
  ¿sumar al mismo pedido como domicilio, o crear uno nuevo como mesa?
- **Nada de esto se ha probado en el navegador.** La sesión de mesa se validó
  con la consulta contra datos reales, y el flujo de domicilio solo por
  sintaxis: hay que probarlo con un pedido de verdad antes de confiar en él.
### Venta rápida: igual que domicilio

Sergio: *"en venta rápida funciona igual, no veo la diferencia: se agrega el
ítem, se cobra solo lo que quedó pendiente."*

Se hizo con el mismo modelo que domicilio — sumar al mismo pedido — y no con el
de mesa. Sumando al mismo pedido, el total crece y lo ya cobrado no se toca, así
que **lo que queda pendiente es exactamente lo nuevo**, que es lo que pidió, y
la comanda muestra todo sin necesitar marca de sesión.

**No se reutilizó `upsertOrder`**, que es la función normal de guardado de venta
rápida: esa **borra todos los ítems y los vuelve a insertar**, y con ello se
perdería `kitchen_printed_at` — la cocina reimprimiría el pedido entero y
volvería a preparar lo ya servido. Se insertan solo los nuevos.

El botón no sale en pedidos ya entregados.

**Un error que cazó el barrido, no el chequeo de sintaxis:** el `case` nuevo
usaba `btn.dataset.quickId`, pero dentro de `handleAction` la variable se llama
`el`. `node --check` pasa igual porque es un nombre válido; habría reventado al
primer clic. Se revisó todo el cuerpo de la función: 5 usos de `el.dataset`, 0
de `btn.dataset`.
---

## 98. La tarjeta de venta rápida, unificada de verdad

Sergio: *"todavía se ve muy diferente a las otras. No se ve la persona que
atendió, la distribución de algunas cosas está muy diferente."*

**Lo que seguía distinto:**

| | Antes | Ahora |
|---|---|---|
| Quién atendió | No aparecía | Fila con avatar, "Atendió" y el nombre, igual que la del domiciliario |
| Estado | Dos veces: pastilla arriba **y** pastilla verde grande debajo | Una sola vez, en el título |
| Estructura | `vs-rail-body` suelto | Cabecera fija + comanda con scroll + pie, como domicilio |
| Estado de pago | Fila suelta "✔ Pagado" entre los totales | Chip en la fila de arriba, como domicilio |
| Totales | "Total" | "Total a cobrar" |
| Método de pago | No salía | Junto a la comanda |
| Imprimir | No tenía | Sí |

El botón de **avanzar estado** ("Marcar entregado") no se perdió: se movió a la
fila de botones, que es donde domicilio tiene el suyo. La pastilla verde grande
que lo acompañaba sí se borró — repetía el estado que ya dice el título, y era
buena parte de lo que hacía que la tarjeta se viera de otra familia.

**Comprobado comparando el esqueleto de las dos tarjetas en orden:**

```
rail-head > eyebrow > rail-title-row > rail-fixed-top > info-row >
mesero-row > rail-scroll > order-head > order-list > rail-footer > totals
```

Idéntico en las dos.

Hizo falta traer `payment_method` en la consulta de pedidos rápidos, que no se
pedía.

**Diferencia que queda a propósito:** domicilio tiene el menú "⋮" con Cancelar
en la cabecera; venta rápida lleva Cancelar entre los botones. No se tocó.
---

## 99. Cajero y domiciliario son dos personas distintas

Sergio: *"no debe ir el título domiciliario, debe decir cajero. El domicilio no
recibe pedidos jajaja. Y justo debajo puede aparecer el domiciliario pero
solamente cuando tengamos domiciliario interno."*

Tenía razón, y era un error de raíz, no de etiqueta: la tarjeta pintaba
`waiter_name` bajo el título **Domiciliario**, pero `waiter_name` es **quien
TOMÓ el pedido** — el cajero, o `Chat IA` cuando entra por el bot. De ahí salían
cosas como *"Domiciliario: Chat IA"*.

**Y el domiciliario asignado no se guardaba en ningún lado.** `domicilios.js` lo
hacía elegir (`S.asignado`) y se perdía al enviar: no existía columna para él.
Columna nueva `pos_orders.domiciliario`, que **solo se llena cuando el
repartidor es interno** — del externo no sabemos ni el nombre.

**La fila en blanco de venta rápida** era otro fallo distinto: `upsertOrder`
nunca guardaba `waiter_name`. 19 de 31 pedidos rápidos lo tienen vacío, por eso
la fila salía sin nada. Ya se guarda.

**Ayudante compartido `vsQuienRow(cajero, domiciliario, chip)`**, que usan las
dos tarjetas. Probado con los casos reales:

| Caso | Sale |
|---|---|
| Cajero y domiciliario interno | `Cajero: Sergio Abadia` + `Domiciliario: Camilo` |
| Domicilio externo | Solo `Cajero: Sergio Abadia` |
| Pedido del bot | `Cajero: Chat IA` |
| Sin nombres | Solo el chip de pago, sin fila vacía |
| Un correo en vez de nombre | Solo el chip |

El chip de pago va siempre con la primera fila, que es la que nunca falta.

**Lo que no se puede arreglar hacia atrás:** los domicilios ya cerrados no
tienen domiciliario guardado, así que solo mostrarán el cajero. Y los 19 pedidos
rápidos viejos seguirán sin nombre. Desde ahora se guardan.

**Sin decidir:** en un pedido que entra por el chat, la fila dice *"Cajero: Chat
IA"*. Es cierto — es quien lo tomó — pero suena raro. Habría que ver si merece
otra etiqueta.
---

## 100. La fila del cajero seguía en blanco: el nombre estaba en otro campo

Tras la ronda anterior Sergio reportó que en venta rápida la fila seguía vacía.
Yo había dado por hecho que esos pedidos no tenían el dato y que solo se
arreglaría de ahí en adelante. **Estaba equivocado.**

Mirando los datos: los **19 pedidos rápidos sin `waiter_name` sí tienen
`waiter_id`**, y `pos_users` mapea `auth_user_id → name`. El pedido de la
captura (Jenifer Jimenez) tenía el id de Sergio. El nombre siempre estuvo, solo
que en otro campo.

**Arreglo:** `vsUsuarios()` trae `pos_users` una sola vez por carga y traduce
id → nombre. Se aplica en los dos sitios:

- `fetchQuickOrders`: si falta `waiter_name` pero hay `waiter_id`, se rellena.
- `fetchDeliveries`: igual para el `cajero`.

Comprobado contra las filas reales de la base:

| Pedido | Antes | Ahora |
|---|---|---|
| Andrés | (vacío) | Sergio Abadia |
| Natlia Guachaves | (vacío) | Monica Villareal |
| Jenifer Jimenez | (vacío) | Sergio Abadia |
| Andrés (del bot) | Chat IA | Chat IA |

**Y la banda vacía:** cuando de verdad no hay ningún nombre (ni id), antes se
pintaba igual el recuadro gris con el chip de pago flotando dentro. Ahora en ese
caso no se pinta la banda: solo el chip alineado a la derecha.

**Lección:** antes de decir "esto no se puede arreglar hacia atrás", mirar si el
dato está en otra columna. Aquí lo estaba.

`pos_users` tiene GRANT de SELECT para `authenticated` y una política por
tenant, así que la consulta funciona desde la pantalla.
---

## 101. Nombre del mesero en la tarjeta de mesa, y estadística útil en Meseros en turno

### La tarjeta de mesa decía "SA" en vez de "Sergio Abadia"

El nombre completo **sí llegaba** en el pedido, pero el código lo reducía a
iniciales al cargar las mesas y luego intentaba reconstruirlo con
`MESERO_NAMES`, una lista fija de ejemplo:

```js
const MESERO_NAMES = { SA: 'Sergio Andrés', JM: 'Juan Manuel', AC: 'Andrea Castro', LM: 'Laura Mejía' };
```

Ninguno de esos es personal real, así que la búsqueda fallaba siempre y caía al
fallback: mostrar las iniciales. Y si hubiera acertado habría sido peor —
"Sergio Abadia" habría salido como "Sergio Andrés".

Ahora la mesa lleva el **nombre completo** (`mesero`), con respaldo por
`waiter_id` contra `pos_users` como en las otras tarjetas. `MESERO_NAMES` y
`getMeseroName` se borraron: eran datos de maqueta quemados en el código.

### "Meseros en turno" mostraba ids internos de mesa

Salían fichas como `Mtmry2e6v7wjt`: el código pegaba una `M` delante del id
interno de la mesa (`'M' + tid`). Con ids cortos (`t01`) pasaba disimulado —
`Mt01` parecía "Mesa 01"— pero con los ids largos quedaba a la vista.

Sergio: *"creo que ni siquiera es necesario mostrar el número ni nombre de las
mesas que atendió, no tiene lógica. En lugar de eso podría recomendarme alguna
estadística."*

Tiene razón: saber **cuáles** mesas atendió no ayuda a decidir nada. Se
reemplazó por **cuánto vendió** y **ticket promedio por mesa**.

El ticket promedio es la medida directa de si el mesero ofrece de más — justo lo
que se quiere entrenar con Paco (ver `PLAN-ENTRENAR-PACO.md`, el upsell es la
mayor oportunidad). Y separa de verdad: con los datos reales de estos dos días,
Monica $133.333 por mesa contra $26.400 de Sergio.

Hizo falta traer `total` en la consulta y excluir los cancelados, que antes se
contaban.
---

## 102. Métodos de pago en un solo formato, y limpieza de puntos de prueba

### Corrección: los informes NO estaban partidos

Le dije a Sergio que tener `Efectivo` (61) y `efectivo` (6) conviviendo le
partía los informes en cuatro filas. **Lo comprobé y no era cierto:** `caja.js`
y `dashboard.js` ya hacían `.toLowerCase()` antes de agrupar, y el dashboard usa
`normPM()`. Las cuentas siempre estuvieron bien.

El daño real era menor: dos sitios que mostraban el valor crudo como etiqueta
(a veces "efectivo" en minúscula), y el riesgo latente de que cualquier código
futuro agrupara sin normalizar y partiera los números sin que nadie lo notara.

### Lo que se hizo igual

- **Datos normalizados a minúsculas** en `pos_orders.payment_method` y
  `pos_payments.method`. Se compararon los totales antes y después: efectivo
  $2.958.800 y transferencia $3.000.500 en los dos casos. No se movió un peso.
- **El origen arreglado:** `pagos.js` guardaba el nombre tal como salía del
  botón (`Efectivo`). Ahora guarda siempre minúsculas. La mayúscula la pone
  quien lo muestra.
- Los dos sitios que pintaban el valor crudo (`caja.js`, `dashboard.js`) ahora
  capitalizan la primera letra.

Regla: **el método de pago se guarda en minúsculas; el nombre bonito es cosa de
quien lo muestra.**

### Puntos de prueba borrados

`3000000001` tenía **14.098 puntos** de mis pruebas. Verificado antes de borrar:
sin ficha de cliente, sin pedidos y sin movimientos — un fantasma. Si ese número
llegaba algún día como cliente real, se llevaba medio menú gratis.

Los saldos reales más altos que quedan son de 140 y 124 puntos, así que aquello
desentonaba por dos órdenes de magnitud.

### Productos sin receta

Se revisó **todo** el catálogo cruzado con lo vendido: solo **"Salsa"** (3
ventas) no tiene receta, así que es lo único que se vende sin descontar
inventario. **Falta que Sergio diga de qué insumo sale y cuánto**, que eso no se
puede adivinar.
---

## 103. Multi-marca — Fase 1: la base

Decisión de Sergio (2026-08-02), tomada sobre tres opciones con maqueta: **la
carta es de la MARCA, con ajustes por local.** La más flexible y la más cara,
pero es la que usan las cadenas y la que permite vender a food courts.

### La regla de precedencia, escrita para que no se discuta después

> **El ajuste del local manda cuando existe.** Si el local no tiene fila de
> ajuste, o la tiene con el precio en NULL, se aplica el precio base de la
> marca. Cambiar el precio base **no pisa** a los locales que ya tienen ajuste
> propio.

Esto era lo que había que decidir: con el precio viviendo en dos sitios, sin una
regla escrita cada pantalla habría resuelto el empate a su manera y dos
pantallas habrían cobrado distinto.

### Lo que se construyó

| Pieza | Para qué |
|---|---|
| `pos_marca_sucursal` | Qué marcas operan en cada local, **N a N**. `branches.brand_id` amarraba un local a UNA marca; un food court tiene varias con una sola caja |
| `pos_products.brand_id` | La carta pertenece a la marca. Los 53 productos quedaron asignados |
| `pos_categories.brand_id` | Igual para las categorías |
| `pos_producto_sucursal` | El ajuste del local: precio y/o activo. **Solo hay fila cuando el local se aparta** — no hay que duplicar 53 productos por local para cambiarle el precio a uno |
| `pos_orders.brand_id` | Sin esto no se puede separar la venta por marca en el cierre. Los 137 pedidos quedaron asignados |
| `pos_printers.brand_id` | Cada marca tiene su cocina: la comanda sale por la impresora de su marca. NULL = sirve a todas |
| `v_carta_sucursal` | **Un solo sitio** que resuelve la precedencia, para que ninguna pantalla la reimplemente |

**Todo aditivo.** No se borró ninguna columna y `pos_products.branch_id` sigue
donde estaba: lo usan 48 tablas y media aplicación. El sistema funciona hoy
exactamente igual que ayer.

### Probado simulando un food court

Se creó una segunda marca temporal en el mismo local y se comprobó:

| Prueba | Resultado |
|---|---|
| Dos marcas en un local | 53 productos de El Parche + 1 de la marca nueva |
| Ajuste de precio del local | SÚPER QUESO a $99.000, con `precio_base` intacto en $35.000 y `precio_ajustado = true` |
| Solo se ajusta el producto tocado | Los otros dos SÚPER QUESO (otras presentaciones) siguieron en su precio |
| Desactivar solo en ese local | MEXICANA quedó inactiva ahí, sin tocar la carta de la marca |

Todo se deshizo después y se verificó que la base volvió a su estado exacto: 53
productos, 0 ajustes, una sola marca.

Los GRANTs para `authenticated` y `service_role` van en la propia migración —
olvidarlos ya reventó dos veces en pleno servicio.

### Lo que falta (fases 2 a 4)

2. **Lectura:** que las pantallas de carta lean `v_carta_sucursal` en vez de
   `pos_products` directo. Hasta que esto no pase, los ajustes por local existen
   en la base pero no se ven.
3. **Escritura:** que el pedido guarde su `brand_id`, que el cierre de caja
   separe por marca y que la comanda salga por la impresora de la marca.
4. **Pantallas:** crear y editar marcas, asignarlas a locales, y editar los
   ajustes de precio por local.

**Decisión que queda para la fase 3:** cuando en un local operan varias marcas,
¿cómo elige el cajero la marca al tomar un pedido — un selector arriba, o se
deduce del producto que toca primero? Y qué pasa si un pedido mezcla productos
de dos marcas: ¿se parte en dos pedidos, o se permite mezclar?
---

## 104. Multi-marca — Fase 1b: corregido el modelo, y los planes en la base

### Un error mío, corregido

En la fase 1 creé `pos_marca_sucursal` (marca ↔ sucursal, N a N) porque venía
pensando en un food court: varias marcas compartiendo local y caja. **El modelo
de Sergio es otro**, y lo explicó claro:

> Una **sucursal pertenece a una marca**. A una persona se le asignan una o
> varias sucursales **dentro** de su marca. Entre marcas no se comparte nada,
> ni siquiera los informes.

Eso ya lo resolvía `branches.brand_id` desde el principio. Dejar la tabla N a N
habría creado **dos fuentes de verdad** sobre qué marca opera dónde. Se eliminó
y la vista `v_carta_sucursal` ahora cuelga de `branches.brand_id`. Verificado:
la carta sigue devolviendo los 53 productos.

*(Un food court con dos marcas en la misma dirección se modela como dos
sucursales con la misma dirección, cada una con su caja. Más simple y encaja
con el aislamiento total entre marcas.)*

### Lo que se agregó

- **`pos_roles.brand_id`** — los roles son por marca y no se mezclan jamás. Los
  5 roles existentes quedaron asignados a El Parche Food.
- **`brands.email_domain`** — para los logins automáticos. El gerente escribe el
  usuario (`sergioabadia`) y el sistema completa el resto.

  **Por qué lleva `cobrapos.app` y no solo `elparchefood.com`:** el correo es
  único en TODO el sistema de acceso, no por restaurante. Dos clientes distintos
  con un restaurante llamado igual —y "El Parche", "Donde Pepe", "La Esquina" se
  repiten muchísimo— generarían el mismo dominio, y **el segundo cliente no
  podría crear a sus empleados** sin entender por qué. Con el sufijo propio no
  puede pasar. El empleado nunca lo ve: en el login solo escribe su usuario.

  Generado: `elparchefood.cobrapos.app`. Editable, con índice único.

- **`pos_planes`** — los límites de cada plan viven en la base, no en el código,
  para poder ajustarlos sin tocar nada:

| plan | marcas | sucursales | usuarios | mensajes IA | DIAN | chat IA | puntos |
|---|---|---|---|---|---|---|---|
| starter | 1 | 1 | 5 | 0 | 0 | ❌ | ❌ |
| pro | 2 | ∞ | 15 | 5.000 | 1.000 | ✅ | ❌ |
| premium | ∞ | ∞ | ∞ | 20.000 | 3.000 | ✅ | ✅ |

El Parche quedó en **premium** a pedido de Sergio, para poder probar todas las
funciones antes de definir el reparto final entre planes.

### De dónde salen esos números — auditoría del plan comercial

Se auditó `04-PLANES-COMERCIALES.md` contra datos reales. Cinco hallazgos:

1. **El tope de mensajes no aguantaba ni al cliente de referencia.** El Parche
   hizo 651 mensajes entrantes en julio y va a ~3.000/mes en agosto; Pro traía
   2.000. Subido a 5.000 (Pro) y 20.000 (Premium), con el criterio de Sergio:
   *"que un restaurante con atención normal nunca tenga que pagar recargas"*.
2. **La recarga del modelo avanzado perdía plata:** $40.000 por 1.000 mensajes
   que cuestan ~$36.000. Ahora hay **una sola recarga** ($120.000 el millar) y
   el cliente no ve nada de modelos.
3. **DIAN ilimitada en Starter era una bomba:** ~$150 COP por documento contra
   un plan de $99.000. Sale de Starter; Pro trae 1.000 y Premium 3.000.
4. **El plan vendía funciones sin construir** (modo offline, kardex, costeo,
   anuncios). Marcadas 🔨 en la tabla comparativa.
5. **Marcas:** sin cobro extra —se cobra por sucursal, y una segunda marca ya
   exige otra sucursal— pero **con límite por plan**, como pidió Sergio.

### Política de modelos de IA (decisión de Sergio, 2026-08-02)

> **El modelo es decisión de desarrollo, el cliente nunca sabe que hay dos.**

- **El avanzado** para todo lo que toque el pedido, la plata o la conversación:
  entender qué pidió, leer comprobantes, sacar la dirección.
- **El barato** solo donde se pueda **demostrar** que da el mismo resultado. El
  caso probado: partir una lista larga de inventario línea por línea, donde el
  avanzado se quedaba sin cupo y el barato acertó 28 de 28.
- **Los precios se costean como si todo fuera avanzado.** Así el ahorro es
  margen, nunca riesgo, y mover algo al modelo caro no obliga a resubir precios.

**Acción pendiente para Sergio:** pedirle a OpenAI que suba el tope de tokens
por minuto (hoy en el mínimo, 30.000, compartido por todo el sistema). Es
gratis. Mientras no lo suban, una ráfaga larga puede dejar al bot mudo en hora
pico — ya pasó esta mañana con la lista de bebidas.
---

## 105. Aislamiento entre clientes — el arreglo más importante antes de vender

### El problema, medido

**22 tablas tenían una política `qual = true` que dejaba pasar todo.** En ocho
de ellas convivía con la política correcta que filtra por cliente — pero
**PostgreSQL suma las políticas permisivas con un OR**, así que la abierta ganaba
siempre y la que aislaba no servía de nada.

Tablas afectadas: `pos_orders`, `pos_products`, `pos_order_items`, `pos_tables`,
`pos_sessions`, `pos_cash_moves`, `pos_categories`, `pos_bases`,
`chat_messages`, `chat_conversations`, `chat_channels`, `ia_config`,
`pos_shifts`, `pos_reservations`, `pos_wa_listas`, `pos_niveles_config`,
`pos_mesa_tiempos`, `pos_domi_aprendidos`, `pos_gerente_ops`,
`iv_facturas_pendientes`, `iv_insumo_alias`.

**Esto no se rompía con 100 clientes: se rompía con el cliente número 2.** Hoy no
se notaba porque solo hay uno.

### El arreglo

Una política `aislar_<tabla>` por tabla, `for all to authenticated`, usando
`current_tenant_id()` (que lee `user_metadata.tenant_id` del token). Se crean
**primero** las nuevas y solo después se borran las abiertas: al revés habría
un instante en que nadie puede leer.

`pos_gerente_ops` no tiene `tenant_id`, así que se aísla por su sucursal
(`branch_id in (select id from branches where tenant_id = current_tenant_id())`).

**Lo que NO se tocó, y por qué:**

- **`pos_registrations`** → *"publico puede registrarse"* es INSERT y es
  intencional: sin ella nadie podría crear su cuenta.
- **`pos_bases.bases_insert`** → INSERT que ya valida el tenant en su WITH CHECK.
- **`mypass_vault`** → ⚠️ **no es del POS.** Es una bóveda de contraseñas
  (datos cifrados, secreto TOTP, blob de recuperación) de otro proyecto que
  comparte este Supabase; ningún archivo del POS la menciona. Tocarla podría
  romper esa app. **Queda abierta y hay que revisarla aparte.**

### Un hallazgo que salió de la verificación

Al comprobar los accesos, El Parche veía **118 de sus 137 pedidos**. Los 19
faltantes eran de **venta rápida y no tenían `tenant_id`**: esa pantalla nunca
lo guardaba. Con el aislamiento activo **se habrían vuelto invisibles esta misma
noche**.

Se rellenaron los 19 y se corrigió `venta-rapida.js` para que siempre lo guarde.
Sin la verificación, el error habría aparecido en pleno servicio.

### Probado

| Prueba | Resultado |
|---|---|
| El Parche lee lo suyo (12 tablas) | ✅ Todo, 137 pedidos incluidos |
| Mónica (mesera) lee lo suyo | ✅ Igual que el gerente |
| **Intruso de otro tenant** | ✅ **0 filas en las 12 tablas** |
| Crear pedido, ítem, mesa, movimiento de caja, mensaje | ✅ Pasan |
| Actualizar pedido | ✅ Pasa |
| Crear pedido a nombre de OTRO tenant | ✅ Bloqueado |
| Edge Functions (bot de WhatsApp) | ✅ Usan `service_role`, se saltan RLS por diseño |

**Nota de método:** dos escrituras aparecieron "bloqueadas" en la primera
pasada. Antes de tocar ninguna política se miró el error real: eran columnas
obligatorias que faltaban en **mi consulta de prueba** (`number`,
`product_price`), no el aislamiento. **Leer el error antes de arreglar lo que no
está roto.**

### Lo que sigue

Quedan dos frenos de escala, ya diagnosticados:

1. **El tiempo real no filtra por cliente** — seis suscripciones escuchan tablas
   completas. Con 100 clientes, un pedido en cualquier restaurante dispara 300
   recargas simultáneas.
2. **El cupo de OpenAI es uno solo para todos** — 30.000 tokens/minuto
   compartidos, que ya fallaron con un cliente.
---

## 106. Corrección de un costeo equivocado por 12 veces

Se auditó el plan comercial y se concluyó que **Premium perdía 40%** y que había
que optimizar urgente la lectura de pedidos. **Las dos conclusiones eran falsas.**

### El error

1. **Se asumió que el chat con clientes usa el modelo avanzado.** Verificado en
   el código desplegado: `delay-reply`, `extraer-pedido` y `meta-webhook` usan
   **gpt-4o-mini**. El avanzado solo aparece en `verificar-pago-manual` (leer un
   comprobante) y `analyze-menu` (montar la carta una vez).
2. **Se usó el tamaño de petición equivocado.** El dato real de 3.510 tokens
   venía del error 429 de `gerente-inventario`, que manda la lista completa de
   insumos. El prompt de `extraer-pedido` es de ~1.428 tokens: 476 de reglas,
   802 de carta y ~150 de conversación.

Un modelo 17 veces más barato y un prompt 2,5 veces más chico: de ahí el factor
de 12.

### Lo real

| | Dicho | Real |
|---|---|---|
| Costo por mensaje | $35 | **$2,9** |
| Margen Pro (5.000 msj) | 30% | **91%** |
| Margen Premium (20.000 msj) | **−40%** | **+82%** |
| El Parche, julio (651 msj) | $22.778 | **$3.410** |

### Lo que cambia

- **Premium se puede vender.** No hay que bajarle el tope ni subirle el precio.
- **La optimización de prompts no hace falta.** Se evitó un día de trabajo
  riesgoso sobre la función que toma los pedidos, que es la más delicada del
  sistema.
- **La recarga había quedado abusiva:** $120.000 por mil mensajes que cuestan
  $2.900 es 97% de margen. Bajada a **$35.000** (92%), que sigue siendo
  excelente y es defendible.
- **Con 100 clientes en Pro:** ingresos $24.900.000/mes contra ~$2.800.000 de
  costos → margen bruto ~89%.

### La lección

**Verificar qué modelo usa cada función antes de costear**, y no reutilizar una
medición tomada en otro contexto. El número de 3.510 tokens era real, pero de
otra función; darlo por bueno para todo el sistema produjo una alarma falsa que
casi cambia el producto y los precios.
---

## 107. Marcas, sucursales y plan en el menú de usuario

Sergio preguntó por qué no aparecía el switch de marca, dónde se crean las
sucursales y por qué no se veía su plan. La respuesta descubrió algo peor de lo
esperado:

**Nunca ha existido forma de crear una marca ni una sucursal.** El sistema sabe
leerlas (`caja.js`, `configuracion.js`, `impresoras.js`) y renombrar la marca
(`configuracion.js:939`), pero **no hay un solo `insert` sobre `brands` ni sobre
`branches` en todo el código**. El Parche existe porque se creó a mano.

### Lo que se construyó (`pos-marcas.js`)

Se inyecta en el desplegable del usuario del Escritorio:

- **El plan contratado**, leído de `tenants.plan`.
- **Marca y sucursal actuales**, con el conteo de cuántas hay.
- **Crear nueva marca** — pide nombre y el de su primera sucursal, porque una
  marca sin sucursal no puede vender. Muestra en vivo cómo quedarán los logins
  (`usuario@pollosdonarosa.cobrapos.app`) y crea las dos cosas juntas.
- **Crear nueva sucursal** — dentro de la marca actual.
- **Validación contra el plan**: los topes salen de `pos_planes`, no del código.
  Si el plan no da, el botón dice *"(mejora tu plan)"* y abre un aviso que
  explica cuántas incluye su plan, en vez de un error.

### El switch NO se construyó, a propósito

Cambiar de marca exige que **las 12 pantallas que hoy leen la sucursal del
login** obedezcan un contexto central. Mientras eso no exista, un switch
mostraría los datos de la sucursal equivocada — peor que no tenerlo. Por eso el
menú **muestra** el contexto pero no deja cambiarlo, y al crear una marca avisa
que todavía no se puede trabajar en ella.

Ese re-enrutamiento es el siguiente paso y es el 90% del trabajo de multi-marca.

### Probado

- **Permisos:** con la sesión de un usuario real (JWT simulado) se comprobó que
  puede leer `tenants`, `pos_planes`, `brands` y `branches`, y **crear** marcas
  y sucursales. Importante, porque el aislamiento se acababa de endurecer.
- **Render:** como no se puede entrar al sistema sin login, se simuló la
  pantalla en node con los datos reales de El Parche. Resultado:

  > Tu plan · Plan contratado · **PREMIUM** · Estás trabajando en · **El Parche
  > Food** · Principal · 1 marca · 1 sucursal · Crear nueva marca · Crear nueva
  > sucursal

- **Los cuatro botones** se pintan y se conectan a su función.

**Falta la prueba real:** nadie ha abierto el menú en el navegador.

---

## 108. Barrido posterior: cuatro tablas que negaban todo

Tras cerrar las 22 políticas abiertas se compararon **todas** las tablas: lo que
hay contra lo que ve un usuario real. Aparecieron cuatro con la seguridad activa
y **ninguna política**, que en PostgreSQL significa negar todo.

| Tabla | Filas | Quién la usa |
|---|---:|---|
| `iv_movimientos` | 540 | **Inventario e Informes** |
| `chat_ai_queue` | 88 | Solo el servidor |
| `pos_gerente_procesados` | 154 | Solo el servidor |
| `pos_planes` | 3 | El menú de marcas (creada hoy) |

**`iv_movimientos` no era culpa del aislamiento de hoy: ya venía así.** El kardex
llevaba tiempo invisible para Inventario e Informes, y nadie lo había notado. Se
corrigió de paso.

`pos_gerente_procesados` se deja negando todo a propósito: ninguna pantalla la
lee, solo las funciones del servidor. `mypass_vault` y `user_profiles` no son
del POS (otro proyecto en el mismo Supabase) y no se tocan.

**Barrido final: no queda ninguna tabla del POS donde el dueño vea menos de lo
suyo.**

**Método que vale la pena repetir:** después de tocar seguridad, no basta con
probar las tablas que uno cambió. Comparar *todas* contra lo que ve un usuario
real fue lo que destapó que el kardex estaba caído desde antes.
---

## 109. Entrenar a Paco (1): las preferencias de preparación

Primer trabajo real de entrenamiento, hecho **con datos, no con intuición**.

### Lo que se revisó primero

Se sacaron los **164 mensajes de apertura reales** de clientes y se
clasificaron:

| Cómo abren | % |
|---|---:|
| Solo saludan | 23% |
| Piden producto directo | 18% |
| Dicen cantidad | 17% |
| Piden la carta | 9% |
| Preguntan por el domicilio | 7% |
| Dan la dirección de una | 2% |

**Lo que YA estaba bien:** `findNextStep` solo devuelve un paso si el dato está
vacío, así que Paco **no pregunta lo que el cliente ya dijo** — la queja de
Sergio del 1 de agosto ya estaba resuelta de fondo. Y el flujo del canvas manda
de verdad: orden, frases y modo salen de `ia_config.flujo_pasos`.

### El hueco encontrado

De los 29 mensajes que son pedido directo, **9 llevan una indicación de
preparación** — casi un tercio:

> *"un perro **sin salsa de ajo**"* · *"**solo ajo y bbq**"* · *"**SOLO CON
> SALSAS DE AJO Y BBQ**"* · *"**sin queso**"* · *"**sin salsa de piña**"* ·
> *"con **poca salsa**"* · *"una **sin salsa** y otra normal"*

**`PacoState` no tenía dónde guardarlo.** Tenía producto, tamaño, tipo,
adiciones, dirección, pago y nombre — nada de preferencias. La extracción final
sí las recoge, pero durante la conversación Paco nunca las confirmaba, y si el
cliente las decía suelto en otro mensaje no había ranura que las sostuviera.

Es el error que más reclama un cliente: **pidió sin ajo y le llegó con ajo.**

### Lo que se construyó (`delay-reply` v201)

- **Ranura nueva `preferencias`** en la memoria de la conversación.
- **`extractPreferencias()`** — lee la preferencia de **cualquier** mensaje, no
  solo del primero, y **suma** en vez de reemplazar: el cliente puede agregar
  condiciones de a poco ("ah, y sin cebolla").
- **Aparece en el resumen**, debajo del producto, para que el cliente la
  confirme o la corrija antes de que se prepare mal.
- **Paso opcional** `campo: "preferencias"` para el restaurante que quiera
  preguntarlas siempre. El Parche no lo necesita —sus clientes lo dicen solos—
  pero otro puede activarlo desde su canvas.
- **Variable `{{preferencias}}`** disponible para las frases del canvas.

### Nada quemado

Los disparadores son del **español**, no de El Parche: "sin", "solo", "poca",
"mucha", "extra", "aparte", "nada de". Cualquier restaurante los dice. Y cada
uno puede sumar los suyos desde el canvas en `ia_config.preferencias_palabras`
— probado con "bien" → *"bien tostada"*.

### Probado con los mensajes reales, sin tocar WhatsApp

Se extrajo la función del archivo que se iba a desplegar y se corrió contra 13
casos reales: **13/13**.

| Mensaje real | Paco guarda |
|---|---|
| "un perro sin salsa de ajo" | `sin salsa de ajo` |
| "solo ajo y bbq y una adicion de salsa de ajo" | `solo ajo y bbq` |
| "SOLO CON SALSAS DE AJO Y BBQ" | `SOLO CON SALSAS DE AJO Y BBQ` |
| "con poca salsa por favor" | `poca salsa` |
| "Sinceramente me encantó" | *(nada)* |
| "Una salchipapa premium mixta personal" | *(nada)* |

**Dos afinaciones que salieron de esa prueba:**

1. Cortar en `" y "` perdía el bbq de *"solo ajo y bbq"*. Ahora el `" y "` solo
   corta cuando **empieza otra idea** (*"y una adición"*, *"y me regalas"*).
2. *"poca salsa por favor"* se llevaba la cortesía. Ahora llega a la cocina como
   *"poca salsa"*.

Sin la prueba contra mensajes reales, las dos se habrían ido a producción.

### Lo que sigue

Tres patrones más que aparecieron y todavía no están cubiertos:

1. **Preguntan antes de pedir** (*"¿a qué precio sale el domicilio si pido…?"*,
   *"¿cuánto demoraría?"*) — Paco no debe arrancar el flujo como si fuera pedido
   cerrado.
2. **Piden por precio, no por nombre** (*"la de 59"*, *"premium mixta de 35
   mil"*).
3. **Varias unidades con notas distintas** (*"una sin salsa y otra normal"*).

---

## 110. Entrenar a Paco (2): cuando no sabe, llama al humano

Pedido de Sergio: *"si un cliente pregunta algo que Paco no sabe —el precio del
domicilio de un barrio que no está guardado— no debe improvisar. Deja de
contestar, guarda la conversación en la pestaña de humano y se desactiva. Cuando
el humano lo vuelva a activar, Paco debe tener el contexto de lo que el humano
respondió."*

### Lo que ya existía

`human_takeover`, la pestaña de humano y el interruptor. Y el historial que lee
Paco **ya incluía** lo que escribió el humano.

### Lo que se agregó (`delay-reply` v204)

- **`pasarAHumano()`** — deja la conversación en la pestaña de humano, apaga a
  Paco para ese chat y **no contesta nada**. Guarda `handoff_motivo` y
  `handoff_at` en la conversación, para que el operador vea al abrirla *por qué*
  se la pasaron y qué le falta configurar.
- **Silencio por defecto.** Inventar o decir "a confirmar" es peor que los 30
  segundos que tarda una persona. El restaurante puede poner una frase de espera
  desde el canvas (`ia_config.handoff.frase`); si no la pone, silencio.
- **Se dispara** cuando va a cerrar el pedido y el barrio no tiene precio.
- **Al volver, Paco sabe qué dijo el humano.** Los mensajes con `origen`
  distinto de `bot` le llegan marcados como *"Respondido por el restaurante, no
  por ti — esto manda"*. Antes los leía como suyos y podía contradecir un precio
  que la persona ya le había prometido al cliente.

### Corrección: los barrios aprendidos NO eran un olvido

Se detectó que `pos_domi_aprendidos` tenía barrios con precio y que `delay-reply`
nunca los consultaba, y **se dio por bug**. Se conectaron automáticamente a las
zonas y se desplegó (v202).

**Sergio corrigió:** *"no es que no los consulte, es que yo no he aprobado que se
ingresen"*. Existe una pantalla de aprobación donde él decide el precio de cada
barrio nuevo. El cambio **se saltaba ese control** y Paco estuvo unos minutos
cobrando precios no autorizados. **Revertido en v203.**

Lección: antes de llamar bug a algo que "no se usa", buscar si hay un control
humano deliberado detrás.

### 🔴 Dos fallos graves encontrados al probar

**1. La comparación de barrios inventaba precios.**

| Dirección | Cobraba | Por qué |
|---|---|---|
| "Calle 5 #10-20 barrio **Villa Fantasía**" | **$5.000** | *calle*≈*bella*, *villa*≈*vista* → "Bella Vista" |
| "**Monteluna** casa 45" | **$8.000** | *casa*≈*catay* → "Catay" |

`fuzzyBarrioMatch` aceptaba **2 letras de diferencia en palabras de 5** (40% de
la palabra), y permitía que las palabras de relleno de una dirección —*calle*,
*casa*, *torre*— fueran las que hicieran coincidir el barrio.

Es peor que no saber: Paco cobraba con seguridad el precio de otro barrio, y
además **tapaba el caso "no lo conozco"** que ahora debe ir al humano.

**Arreglo (genérico, sirve a cualquier restaurante):**
1. Las palabras de relleno de una dirección no pueden ser las que hagan
   coincidir un barrio.
2. Tolerancia estricta: 1 letra en palabras cortas, 2 solo en las de 8+.
3. Un barrio de una sola palabra corta ("Catay", "Toez") exige coincidencia
   exacta.
4. Dos palabras del barrio no pueden apoyarse en la misma palabra de la
   dirección.

**2. La pantalla de aprobación borraba los barrios.**

"Agregar a la tabla" añadía el barrio a la zona **solo en pantalla** y
**borraba la fila de pendientes en la base de inmediato**. Si el usuario no
pulsaba "Guardar cambios", el barrio **desaparecía de los dos lados**.

Le pasó a Sergio con los 6 que aprobó: salieron de pendientes y nunca entraron
a la tabla. **Se recuperaron** (Torres del Bosque $5.000, Estancia $8.000,
Monteluna $5.000, Villa Hermosa $5.000, Ciudad Verde $10.000, Mirador del Sol
$6.000) y se corrigió: ahora se ocultan al aprobar y **solo se borran cuando el
guardado sale bien**.

### Probado con las 46 direcciones reales

| | |
|---|---|
| Cobra el domicilio solo | **39 (85%)** |
| Llama al humano | **7 (15%)** |
| Barrio inventado ("Villa Fantasía") | **No sabe → humano** ✅ |
| "Monteluna casa 45" | **$5.000** (el precio que aprobó Sergio) ✅ |

Los 7 que van al humano son barrios que **nunca se han cobrado**: Torres del
Campestre, Asturias, Mallorca, Aida Lucía, Hojarazca y uno sin barrio anotado.
Paco los irá pasando y Sergio les pone precio una vez.

---

## 111. Replay: 20 conversaciones reales pasadas por Paco

Se replicaron **20 conversaciones que terminaron en pedido**, pasando cada
mensaje del cliente por los extractores del asistente y comparando el resultado
contra el pedido que de verdad se creó. Sin llamar a OpenAI y sin mandar nada
por WhatsApp.

### Direcciones: 17 de 17

Todas las direcciones registradas resuelven precio de domicilio. **Ninguna
llamaría al humano.**

*(Una primera medición dio 12 de 16 al humano y era falsa: la prueba le quitaba
el marcador `[barrio:X]` a la dirección antes de compararla, justo el dato que
Paco usa. Corregido antes de reportarlo.)*

### Preferencias: se están perdiendo hoy

En **3 de las 20 conversaciones** el cliente dijo cómo quería su comida y **el
pedido quedó sin ninguna nota**:

| Cliente | Lo que escribió | Nota en el pedido real |
|---|---|---|
| Yury Ordoñez | *"Por favor **sin salsa rosada y d tomate**"* · *"**Solo ajo y bbq**"* | **(ninguna)** |
| Fabián Sánchez | *"Personal y **extra de salsa** por favor"* · *"**Salsa de ajo** por favor"* | **(ninguna)** |
| William | *"Un perro especial **sin salsa de ajo**"* | "SOLO BBQ" *(escrita a mano)* |

El pedido de Yury salió de cocina **con salsa rosada y de tomate**, que era
exactamente lo que pidió que no le pusieran. Eso ya pasó, con un humano
atendiendo.

Con el cambio de la ronda anterior, Paco captura las tres y las muestra en el
resumen para que el cliente las confirme.

### Lo que este replay NO prueba

**Que Paco identifique bien el producto.** Esa parte la decide el modelo de
lenguaje y no se puede replicar sin gastar llamadas a OpenAI. Lo único honesto
es probarlo en vivo: como el asistente solo contesta fuera del horario de
atención, ahí se puede comparar lo que arma Paco contra lo que habría armado
Sergio, sin riesgo para el servicio.

### Método que vale repetir

Replicar conversaciones reales contra el resultado real es lo que ha destapado
todo lo de hoy: las preferencias perdidas, los precios de barrio inventados y
el borrado de la pantalla de aprobación. Ninguno se habría visto leyendo código.
---

## 112. Prueba real con OpenAI: 20 conversaciones contra su pedido

Sergio: *"no importa que gastes tokens, necesito que quede perfecto... tiene que
reconocer a la perfección los productos, categorías, presentaciones, variantes,
notas, bebidas, dirección, barrio."*

`extraer-pedido` es de **solo lectura** (recibe un `conversation_id`, lee los
mensajes, pregunta al modelo y devuelve JSON; no crea pedidos ni manda
mensajes), así que se puede correr contra conversaciones reales sin tocar nada.

### Resultado final

| | |
|---|---|
| Pedidos exactos | **19/20 (95%)** |
| Productos con nombre y cantidad correctos | **29/30 (97%)** |
| Precio de domicilio | 20/20 |
| Barrio | 17/20 |
| Método de pago | 17/20 |

### El camino, que no fue recto

| Versión | Cambio | Exactos |
|---|---|---|
| v31 | punto de partida | 18/20 |
| v32 | 4 reglas nuevas al prompt | 18/20 — arregla la adición suelta y la línea repetida, rompe el tamaño de bebidas |
| v33 | regla del tamaño más fuerte | **17/20** — peor: elige la adición equivocada y sube un plato a su versión "premium" |
| v34 | tamaño resuelto en CÓDIGO, no en el prompt | **19/20** |
| v35 | genérico + configurable | 19/20 |
| v36 | buscar el tamaño también en el texto del cliente | **18/20** — revertido |
| v37 | mapa de la carta en el prompt | **0/20 — la función no arrancó**, revertido |
| v38 | vuelta al estado bueno | **19/20** |

**Lección cara: cada regla que se le agrega al prompt puede desestabilizar
decisiones que ya funcionaban.** La regla del tamaño arreglaba las bebidas y a
la vez hacía que eligiera mal la adición de otro cliente. Lo que funcionó fue
sacarla del prompt y resolverla en código, donde no compite con nada.

### Dos correcciones de Sergio durante la prueba

**1. Las presentaciones NO son tamaños.** Yo asumí que "grande" es la
presentación más cara. *"Los tamaños son parte de una presentación que creé en
mi restaurante; otros pueden tener términos de carne u otras cosas."* Corregido:
la traducción solo se intenta **si las presentaciones de ese producto parecen
tamaños**, y las palabras salen del canvas (`ia_config.tamano_palabras`). En un
asadero con "Bien asada / Término medio / Cruda" no se intenta nada.

**2. Su idea de fondo, que es mejor que mis heurísticas:** conectar el canvas
con las presentaciones, categorías y variables REALES de la carta, para que el
asistente sepa que las bebidas tienen "Personal / 1.5 Litros" y las salchipapas
"Personal / Familiar", y no las cruce.

Se intentó (v37) metiendo ese mapa en el prompt y **la función dejó de
arrancar**; se revirtió en minutos. Queda pendiente hacerlo bien —
probablemente no metiendo más texto al prompt, sino **validando en código** que
la presentación elegida pertenezca a la categoría del producto.

### El único caso que falla

*"Y un jugo hit tropical **de caja**"* → sale como Personal en vez de Litro. El
cliente dijo el tamaño con una palabra suya y en el mismo mensaje había otro
producto "personal", así que la pista se cruza. Es exactamente lo que resolvería
la idea de Sergio.

### Método

Comparar contra el pedido que de verdad se creó es lo que hace la prueba fiable.
Y hay que correrla **después de cada cambio**: tres de los siete intentos
empeoraron el resultado, y sin medir se habrían quedado.

---

## 113. El tiempo real se cayó con el aislamiento

**Sergio:** *"los mensajes en Cobra no están llegando en tiempo real… llega el
mensaje pero no se ve, tengo que actualizar la página."* Tenía razón en la
sospecha: fue por el aislamiento de esta misma tarde.

**La causa NO eran los datos ni la condición.** Se verificó: los 498 mensajes de
los últimos días tienen su `tenant_id`, la política existe y la función
`current_tenant_id()` es `STABLE`. El fallo estaba en una palabra: las políticas
se crearon `for all TO AUTHENTICATED`, y **el motor de tiempo real de Supabase
evalúa los permisos con otro rol**. Para él la tabla no tenía ninguna política
aplicable, así que no entregaba nada. Las viejas (`allow_all`) eran para todos
los roles — por eso el tiempo real funcionaba antes.

**El arreglo:** recrear las 23 políticas sin restringir el rol. El aislamiento
no se debilita:

- La condición sigue siendo `current_tenant_id() = tenant_id`.
- Para un usuario de otro restaurante da falso → 0 filas.
- Para `anon` (sin sesión) no resuelve → 0 filas.
- Para `service_role` la seguridad de filas ni se aplica, así que las Edge
  Functions siguen igual.

**Verificado después del cambio:** El Parche ve todo lo suyo (1.725 mensajes,
137 pedidos, 540 movimientos de inventario) y un usuario de otro tenant ve
**0 en las 8 tablas probadas**.

**Dos reglas para la próxima vez:**

1. No restringir por rol en políticas de tablas publicadas en tiempo real.
2. **Probar el tiempo real después de tocar seguridad.** Esto se escapó porque
   las pruebas midieron lectura y escritura, pero nunca la entrega en vivo — y
   lo detectó Sergio usando el sistema, no yo.
---

## 114. Estructura del canvas y preferencias por producto

### Corrección a una afirmación mía

Le dije a Sergio que *"el motor guarda una sola presentación para todo el
pedido"*. **Es falso.** Al detectar un producto nuevo, el motor **archiva el
anterior en `items[]` con su propia presentación, variante, cantidad y
adiciones**. La estructura por producto ya existía. Lo comprobé leyendo el
archivado antes de tocar nada, después de haberlo afirmado.

### Lo que sí faltaba

Las **preferencias** que se agregaron esta tarde quedaron a nivel de PEDIDO, no
de producto. Con un caso real de los datos: *"dos salchipapas de pollo
personales, **una sin salsa y otra normal**"* — las dos habrían salido iguales.

**Corregido:** `preferencias` pasa a `SlotItem`, se archiva con su producto, se
limpia al cambiar de producto, aparece en el resumen debajo de la línea que le
toca, y **viaja al pedido como nota del PRODUCTO** (`crear-pedido-chat` ya
aceptaba `p.notas` por producto). Así la comanda la muestra pegada a su plato y
el cocinero sabe a cuál aplica.

### Datos que orientaron el diseño del canvas

| | |
|---|---|
| Líneas de UNA unidad | **97%** (216 de 222) |
| Pedidos con más de un producto | **51%** (70 de 137) |

**Por eso la cantidad NO lleva caja propia:** una caja es un paso que pregunta, y
preguntaría de más en 97 de cada 100 pedidos. Se captura en silencio dentro de la
caja del producto, con una casilla opcional *"confirmar cuando sea más de una"*
que se dispara justo en el 3% donde importa.

### La estructura acordada con Sergio

Cajas **con misión** (tipo ManyChat), arrastrables, cada una con su propia
configuración — no cajas libres, que producirían errores. Las cajas libres solo
envían mensajes, **nunca capturan datos**.

| Caja | Qué guarda |
|---|---|
| Saludo | — |
| Pedido | producto + cantidad |
| Presentaciones | por producto, solo si tiene |
| Variantes | por producto, solo si tiene |
| Preferencias | sin ajo, poca salsa |
| Upsell | productos que el dueño conectó |
| Dirección | + barrio → precio, reglas por país |
| Cliente | nombre |
| Resumen | plantilla con placeholders |
| Pago | métodos + comprobante + verificación |
| Confirmación | — |
| Envío | conectado (o no) a los disparadores de estado |

Aparte: **preguntas frecuentes**, con lo que distingue una pregunta suelta de una
pregunta dentro del pedido.

**Decisiones de Sergio en esta ronda:**
- El envío SÍ es una caja configurable, como complemento del disparador de
  estado que ya existe — para que el dueño pueda conectarlo o no.
- Las preguntas frecuentes son un mecanismo aparte del flujo del pedido.

**Principio que hay que respetar:** el canvas define el orden de las PREGUNTAS,
no el orden de la CONVERSACIÓN. El motor ya rellena huecos y salta lo que el
cliente ya dijo; las cajas dicen qué hace falta y en qué orden preguntarlo
cuando toque.

### Un hallazgo de paso

**Hoy el pago se pregunta ANTES del resumen**, al revés de como Sergio toma los
pedidos (*"si el cliente no sabe cuánto es, no sabe con qué pagar"*). Su propio
flujo está configurado en contra de su experiencia. Se arregla moviendo la caja
— justo lo que el canvas debe permitir.

---

## 115. El pago va después del resumen (y la caja que lo permite)

Sergio, describiendo cómo toma pedidos: *"en mi restaurante el método de pago va
después del resumen, porque si le preguntamos al cliente con qué paga y no sabe
cuánto es, no va a saber con qué pagar. Sin embargo cada restaurante lo puede
colocar en el orden que quiera."*

**Su propio flujo estaba configurado al revés**: el pago era el paso 6 de 6, y el
resumen solo salía cuando todos los pasos estaban llenos. O sea, Paco preguntaba
el pago antes de decir cuánto era.

### Lo que se construyó

Una casilla en la caja del canvas: **`despues_resumen`**.

- `findNextStep` **ignora** las cajas marcadas al decidir si el pedido está
  completo. Si contaran, el resumen nunca saldría.
- El resumen sale sin ese dato.
- Al confirmar el cliente, **antes de crear el pedido** se revisa si queda alguna
  caja post-resumen sin responder. Si la hay, se pregunta y el pedido espera.

No es una regla de El Parche: es una casilla que cada restaurante marca en las
cajas que quiera.

### Lo que ya existía y ayudó

El motor **ya sabía** recibir el pago junto con la confirmación (*"bueno,
entonces por nequi"*) y disparar el QR si el método es digital. Solo faltaba
**preguntarlo** cuando el cliente confirma sin decirlo.

### Un efecto secundario que había que atender

La plantilla del resumen trae una línea `💳 {{pago}}`. Sin pago todavía, esa
línea salía con el icono solo y nada al lado.

Se resolvió **en general, no para el pago**: después de reemplazar las
variables, se borran las líneas que quedaron con adorno pero sin texto. Sirve
para cualquier variable vacía. Las líneas en blanco a propósito (separadoras) se
conservan.

Probado con la plantilla real: quita la del pago y deja intactas las de
producto, dirección, pedido, domicilio, total y la separación antes de la
confirmación.

### Estado

`delay-reply` v208, verificada que arranca. El flujo de El Parche quedó:
presentación → variante → adiciones → dirección → nombre → **resumen** → pago.

---

## 116. Las cajas del canvas, cada una con su misión

Decisión de Sergio: **cajas tipadas, no cajas libres.** *"Si colocamos box
totalmente libres va a haber muchos errores. En lugar de eso, box con
exactamente cada misión, para que el dueño los arrastre según lo que necesita."*
Las cajas libres se quedan solo para mandar mensajes — **nunca capturan datos**.

### Nombres de verdad

El selector mostraba los nombres internos: `tamano`, `tipo`. Eso viene de la
carta de El Parche. Ahora muestra **Presentación** y **Variante**, con su
explicación — *"la que tú creaste: tamaño, término, envase…"*. Los nombres
internos se mantienen para no romper los flujos ya guardados; solo se traducen
en pantalla.

### Cajas disponibles

| Caja | Misión |
|---|---|
| Qué va a pedir | Descubre el producto y cuántos |
| Presentación | La presentación de cada producto |
| Variante | La variante de cada producto |
| **Preferencias** | Sin ajo, poca salsa — **el motor ya la usaba y la pantalla no la ofrecía** |
| **Ofrecer algo más** | Upsell con **sus propios productos**, separado de las adiciones |
| Adiciones | Ingredientes extra sobre el producto |
| Dirección | Dirección y barrio → precio del domicilio |
| A nombre de quién | El nombre con el que se recibe |
| Método de pago | Cómo paga, y el comprobante si es digital |

**El upsell es caja aparte de las adiciones a propósito:** una adición va SOBRE
el plato (*"con tocineta"*), el upsell es otro producto (*"¿te provoca una
gaseosa?"*). El dueño elige qué ofrecer; si no elige nada, el asistente propone
de la carta.

### Opciones que tiene CUALQUIER caja

- **Obligatoria** — si se apaga y el cliente no lo dice, el pedido sigue sin ese
  dato. El nombre lo es; las preferencias no.
- **Cuándo aplica** — siempre · solo a domicilio · solo si recoge · solo si es
  cliente nuevo. Esto es lo que evita preguntarle la dirección a quien va a
  recoger, que hasta hoy estaba resuelto a punta de código.
- **Si el cliente no responde** — volver a preguntar · seguir sin el dato ·
  **pasar la conversación a una persona**.

En el motor se aplican **en un solo sitio** (`comunes()`), recorriendo lo que
cada caja agregó. Así, el día que se agregue un tipo de caja nuevo, hereda las
tres opciones sin tocar nada más.

*(Primero se llamó `comunes()` solo en dos ramas — pago y upsell — y las otras
siete se habrían quedado sin las opciones. Se corrigió antes de desplegar.)*

### Opciones propias de dos cajas

- **Qué va a pedir:** *"confirmar la cantidad cuando sea más de una"*. Apagado
  por defecto porque **el 97% de las líneas son de una unidad**; encendido,
  confirma justo en el 3% donde un error cuesta plata.
- **Método de pago:** *"preguntarlo DESPUÉS del resumen"*, con su explicación —
  si el cliente no sabe cuánto es, no sabe con qué pagar.

### Lo que esto cierra

Dos cosas construidas hoy —la caja de preferencias y la casilla del pago— **no
se podían usar desde la pantalla**. Estaban activas porque se pusieron a mano en
la base, y **se habrían borrado la próxima vez que Sergio guardara el flujo**,
porque el editor no sabía que existían. Ya no.

### Lo que falta de la lista acordada

- Caja de **envío**, conectada (o no) a los disparadores de estado.
- **Preguntas frecuentes**, como mecanismo aparte del flujo.
- Caja de **confirmación** como caja (hoy es comportamiento).
- **Resumen** como caja con misión (hoy es una plantilla en frases).
- En la de dirección: reglas por país y dónde no se reparte.
- En la de cliente: las opciones del nombre configurables.
- Variantes: leer **todos** los grupos, no solo el primero.
---

## 117. Variantes de varios grupos, y la caja de envío

### Las variantes solo leían el primer grupo

Un producto puede tener varios grupos de variante. El **SÚPER QUESO** tiene dos
(dos ingredientes), y otro restaurante puede tener "salsa" + "punto de cocción"
+ "acompañamiento".

El motor **construía un paso por grupo** —eso estaba bien— pero:

- el extractor solo miraba `productData.variables[0]`;
- `findNextStep` daba por respondidos **todos** los grupos en cuanto había algo
  en `state.tipo`, que es uno solo para todo el producto.

Resultado: en un producto de dos grupos, **el segundo nunca se preguntaba ni se
capturaba**. En el pedido real *"SÚPER QUESO · Carne · Tocineta"* la tocineta se
habría perdido.

**Arreglo:** `state.tipos` guarda una respuesta **por grupo**; el extractor los
recorre todos (*"de pollo y tocineta"* responde dos grupos en un mensaje);
`findNextStep` mira el grupo de SU paso; y `state.tipo` sigue existiendo como el
texto junto, que es lo que usan el resumen y el pedido. Al cambiar de producto
las variantes se limpian, porque son de cada producto.

### La caja de envío

Sergio: *"que el envío sea una caja para poder conectarlo con los disparadores
de estado o desconectarlos, porque si no, automáticamente siempre se
dispararía."*

Los disparadores ya existían en `ia_config.estados_config` y los ejecuta
`cambiar-estado`. **La caja no los reemplaza: los gobierna.**

| Caja | Qué pasa |
|---|---|
| Apagada | El estado cambia igual, pero al cliente no se le avisa |
| Conectada | Sale el mensaje de la pantalla de Estados (como hoy) |
| Con frase propia | Sale la de la caja, y la de Estados queda quieta |

Se elige además **en qué estado** avisa: en preparación, listo, en camino o
entregado.

Se guarda en `ia_config.flujo_envio`, aparte de `flujo_pasos`, porque **no es un
paso del pedido**: el pedido ya existe y esto avisa después. Sin caja
configurada, todo se comporta exactamente como antes.

`delay-reply` v211 · `cambiar-estado` v7 · las dos verificadas que arrancan.

### Lo que queda de la lista

- **Preguntas frecuentes**, como mecanismo aparte del flujo.
- Confirmación y resumen como cajas con misión (hoy son comportamiento y
  plantilla).
- En la de dirección: reglas por país y dónde no se reparte.
- En la de cliente: las opciones del nombre configurables.
---

## 118. Conexiones: el dueño decide qué información ve el asistente

Idea de Sergio: mucha información ya está configurada en otras pantallas y **el
asistente la usa siempre, sin que nadie se lo haya autorizado**.

> *"Lo más importante es que cada dueño de restaurante pueda elegir conectar o
> no conectar lo que desee."*

### Inventario: lo que ya estaba configurado

Se revisaron las 40 columnas de `ia_config`. **34 tienen contenido**, y estas son
las que el asistente consume:

| Fuente | Tamaño | ¿La leía? |
|---|---:|---|
| Preguntas frecuentes | 1.849 car. | Sí, siempre |
| Sobre el negocio | 591 car. | Sí, siempre |
| Situaciones especiales | 1.045 car. | Sí, siempre |
| Vocabulario | 304 car. | Sí, siempre |
| Zonas y domicilios | 3.017 car. | Sí, siempre |
| Métodos de pago | 1.000 car. | Sí, siempre |
| Horarios | 454 car. | Sí, siempre |
| La carta | — | Sí, siempre |

**Las preguntas frecuentes ya existían y el bot ya las leía** — no había que
construir el mecanismo, había que darle el interruptor.

### Lo que se construyó

Una tarjeta en la pestaña **Asistente** (configuración global del canvas, fuera
del flujo, como pidió Sergio) con un interruptor por fuente. Y en el motor, cada
bloque del contexto se arma solo si su fuente está conectada.

**Desconectar no borra nada:** el dato sigue ahí para el resto del sistema, el
asistente deja de verlo. Un restaurante puede querer que el precio del domicilio
lo diga siempre una persona, y ahora puede.

**Solo se guarda lo DESCONECTADO.** Así, el día que se agregue una fuente nueva,
arranca conectada sin migrar nada y sin que nadie se encuentre el asistente
cambiado de un día para otro.

`delay-reply` v212, verificada que arranca.

### Lo que queda de la lista del canvas

- Confirmación y resumen como cajas con misión (hoy son comportamiento y
  plantilla).
- En la de dirección: reglas por país y dónde no se reparte.
- En la de cliente: las opciones del nombre configurables.

## 119. Cambiar el plan de un cliente, y el hueco que había debajo

Sergio pidió poder cambiarle el plan a un cliente desde la consola de plataforma. Al ir a
escribirlo apareció algo más grave: **el cliente podía cambiárselo él mismo.**

La política `owner_tenant` de la tabla `tenants` daba permiso `ALL` al dueño sobre su propia
fila. El plan vive en esa fila y es lo que `pos-plan.js` lee para decidir qué puede usar cada
restaurante. Con la consola del navegador abierta, un `update` de una línea pasaba a cualquiera
de Starter a Premium sin pagar nada. Ahora esa política es solo `SELECT`: el restaurante ve su
fila y no la toca. La única escritura es la del administrador de plataforma.

**El cambio va por función, no por UPDATE suelto.** `admin_cambiar_plan(tenant, plan, motivo)`
comprueba `es_admin_plataforma()`, valida que el plan exista en el catálogo, cambia
`tenants.plan` y anota la fila en `pos_plan_historial` — todo junto: o pasan las dos cosas o no
pasa ninguna. Un cambio de plan sin rastro no sirve para cobrar.

**El modal avisa lo que se pierde, no solo lo que se gana.** Subir de plan es inofensivo; bajar
apaga funciones que el restaurante está usando en este momento. Antes de confirmar se listan
las dos cosas, comparando `pos_planes.funciones` del plan viejo contra el nuevo.

De paso:

- **El precio de cada plan pasó a la base** (`pos_planes.precio`). Estaba escrito a mano en el
  código de la consola, así que cambiar un precio obligaba a volver a desplegar. Premium existía
  en la base con sus 13 funciones y **no aparecía en ninguna pantalla**; ahora sale, con el
  precio en NULL y mostrado como "por definir" en vez de inventarse uno — un 0 se habría leído
  como "no paga nada" en la columna de facturación.
- **La lista de clientes mostraba el plan que pidieron al registrarse**, no el que tienen.
  Después de un cambio de plan son cosas distintas, y lo que se factura es lo que tienen. Ahora
  la tabla, el total facturado y el resumen usan `plan_actual` (de `tenants`).

Probado en un banco de pruebas con base simulada, sin tocar producción. Ahí salió un fallo
real: bajando de Premium a Starter la lista de 13 funciones perdidas estiraba el modal a 770 px
en una pantalla de 720, y **el botón de confirmar quedaba por fuera**. El cuerpo del modal
quedó con scroll propio y tope de 88vh; las listas largas van a dos columnas.

SQL: `sql/2026-08-03-cambiar-plan.sql`.

## 120. La carta llegaba sin las fotos

Sergio: "Paco contesta fuera del horario, la gente pregunta la carta, manda la
frase pero no está enviando las imágenes a veces."

Un cliente escribió "Hola tienes carta ?" y Paco contestó "¿Qué se te antoja?
🍟☺️" — que es exactamente `menu_frase.texto`, la frase que ACOMPAÑA a la carta.
Así que la rama de la carta sí corrió, y aun así no llegó ninguna foto.

**La causa.** Las imágenes se mandaban con `image: { link: url }` apuntando a
`raw.githubusercontent.com`. Meta contesta 200 al instante y descarga la imagen
**después**, por su cuenta. Esas dos fotos pesan 1,5 MB y 1,1 MB, y GitHub tarda
entre 2 y 4 segundos en entregarlas (medido). Cuando se demora de más o GitHub
limita el tráfico —no es un CDN, y castiga el hotlinking— Meta desiste y el
cliente no recibe nada. Pero aquí `rImg.ok` ya había contado el envío como
bueno, así que se mandaba la frase igual. De ahí el "a veces".

**Lo que lo hacía invisible.** Las imágenes **nunca se anotaban en
`chat_messages`**. Comprobado en los datos: de todos los mensajes salientes con
`origen='bot'`, **cero** tienen media, mientras que los humanos tienen 12
imágenes y 9 stickers. En el panel, Paco siempre pareció mandar solo la frase.
Sergio no tenía forma de saber si el cliente había recibido la carta — y cuando
la carta la mandaba un humano desde las respuestas rápidas, esa sí se veía,
porque va desde el storage de Supabase. Ese contraste es el "a veces" que veía.

**El arreglo.** La carta se sube a Meta **una sola vez** (`POST /media`) y se
guarda el id en `ia_config.menu_media`. Los envíos siguientes van con
`image: { id }`: no hay descarga en el momento del envío, la imagen ya vive en
los servidores de Meta. El id se renueva a los 25 días porque Meta los guarda
30. Si la subida falla se manda por link como antes —peor, pero mejor que nada—
y queda anotado en el registro.

Y cada imagen enviada se anota ahora en el hilo con su `external_id`, así que
aparece en el panel y, si Meta avisa después que falló, el estado se actualiza
solo.

Probado con Meta y la base simulados, 13 comprobaciones: sube una vez, la
segunda vez no vuelve a bajar de GitHub, renueva a los 26 días, cae al link si
la subida falla, y un envío rechazado no se cuenta como enviado ni ensucia el
hilo. Desplegado: delay-reply v213.

## 121. Las etiquetas del pedido: exigirlas, y que existan en el chat

Dos cosas que estaban anotadas desde hace días.

**1. Se pueden exigir.** Hasta ahora la etiqueta (Espera / Avisar / Programado /
A carro) siempre se podía saltar: el cajero guardaba y no pasaba nada. Pero la
etiqueta es lo que le dice a la cocina qué hacer con el pedido — si se puede
saltar, tarde o temprano alguien la salta y el plato sale sin que nadie sepa si
es para esperar o para avisar.

Nuevo ajuste en Configuración → Operación → Sección 4b, con tres estados:
`etiquetasVRExigir` = `'no'` (opcional, es el que viene puesto) · `'recoger'`
(obligatoria solo si el pedido es para recoger) · `'siempre'`.

Se decidió dejar las dos formas de exigir en vez de escoger una, porque en venta
rápida son lo mismo —todo es para llevar— pero en el chat no: ahí un pedido
puede ser domicilio, y quien quiera etiquetar también los domicilios necesita
`'siempre'`.

**Un candado que no se puede abrir es peor que no tenerlo:** si el dueño exige
etiqueta pero no ha creado ninguna, NO se exige nada. Si no, la caja quedaría
trancada sin forma de resolverlo desde la pantalla donde se está.

En venta rápida se comprueba en los tres caminos de guardado —guardar, enviar a
cocina y opciones de pago—, no solo en uno. El aviso no es un `alert` (obliga a
soltar la pantalla táctil en plena atención): sale arriba y la fila de etiquetas
se resalta y se desplaza a la vista, porque decir "falta la etiqueta" sin mostrar
dónde está obliga a buscarla con el cliente en frente.

**2. Ya existen en el chat.** Verificado antes de empezar: `etiquetasVR` aparecía
**cero veces** en `chat-ia.js`. Solo las pintaba venta rápida, así que creando el
pedido desde el chat no había dónde escogerla — justo en los pedidos para
recoger, que es donde más sirven. Ahora salen en el modal de Crear pedido
(no en los de mesa: por WhatsApp no se toma mesa), viajan en el envío y
`crear-pedido-chat` v16 las escribe como `[etq:X]` junto a `[barrio:X]` y
`[tel:X]`, que es el formato que `pos-print.js` ya sabe leer y limpiar. No se
mete dentro del texto libre de notas.

La comprobación de obligatoriedad al enviar está en `cpEnviarCocina` y no solo en
el formulario, porque el borrador se puede mandar desde la tarjeta del chat sin
volver a abrir el modal.

Probado con 16 casos sobre la tabla de decisión, incluidos los dos que pueden
trancar la caja: sin etiquetas creadas no se exige nada, y con la configuración
corrupta tampoco se bloquea.

## 122. El sonido de caja registradora, y el mesero que no tiene por qué enterarse

**Sintetizar tiene un techo.** Se intentaron dos rondas de sonidos fabricados —la
segunda ya con golpe de ataque, decaimiento distinto por armónico, modos
desafinados entre sí y relaciones inarmónicas de campana— y Sergio los descartó
las dos veces: "suenan como pitos". Tenía razón. Una registradora real es madera,
resortes, un cajón que golpea y una campana dentro de un cuerpo metálico. Eso se
aproxima, no se clava. Trajo una grabación y esa fue la salida.

**Lo que se le hizo al archivo.** Venía como video de 7,3 s con el sonido
repetido tres veces. Se comparó las tres tomas (idénticas), se recortó una a
**1,34 s** quitando el silencio de los bordes, se le puso desvanecido de 60 ms
para que no quede un clic, y se comprimió y niveló.

**El nivel fue el trabajo de verdad.** Recortada y normalizada al pico, la
grabación medía **7 dB por debajo** de los tonos fabricados: cambiar a ella se
habría sentido como si bajaran el volumen. Se corrigió en dos sitios —compresión
en el archivo y ganancia propia al reproducir— hasta dejarla en **-14,0 dB, el
mismo nivel que Campana**, con pico 0,91 y sin recorte.

**Una grabación NO puede pasar por la cadena de los tonos fabricados.** A los
fabricados se les mete una curva de saturación para que suenen fuertes, porque
son ondas puras y vienen "vacíos"; una grabación ya trae su energía adentro y con
ese mismo empuje se frita. Por eso tiene camino propio: ganancia con la misma
curva al cuadrado (para que la barra de volumen se comporte igual) y un limitador,
sin saturación.

Va **incrustada en `pos-notify.js`** (17 KB) y no como archivo aparte: así suena
igual en el .exe y en el navegador y no depende de poder descargar nada en el
momento — que es exactamente el error que dejó la carta sin fotos (ver 120). Se
descodifica una sola vez y queda en memoria.

**Al mesero no le llegan los avisos del chat.** Ni el sonido ni el aviso de
pantalla. No se pregunta por el nombre del rol ("mesero") sino por el PERMISO
`chat.usar`: Cobra se vende a otros restaurantes y cada uno bautiza sus roles
como quiera, pero el permiso es el mismo en todos. Quien no puede abrir el chat
tampoco necesita que le avisen de él.

Falla ABIERTO a propósito: si el módulo de permisos no carga o se demora más de
6 s, sí avisa. Que a un mesero le suene de más es una molestia; que el dueño se
pierda un pedido porque los permisos no cargaron es plata.

## 123. Un abono, un solo pedido — se cerró el candado que quedó a medias

El 2 de agosto se le enseñó a `verificar-transferencia` a leer el número de
referencia del banco, y quedó escrito en el commit: *"hoy solo se muestra; es la
base para que mañana un mismo abono no pueda dar por bueno dos pedidos"*. Ese
mañana no había llegado. Sergio creía que sí, y con razón: la referencia salía en
pantalla, así que parecía estar controlando algo.

**Lo que de verdad estaba y lo que no.** El anti-replay SÍ existía, pero en
`verify-transfer` (la del chat): lee la referencia del comprobante, la guarda en
las notas del pedido como `Ref:XXXX` y, si vuelve a llegar, rechaza y pasa a
humano. La pantalla de pagos usa otra función —`verificar-transferencia`— que
leía la referencia pero nunca la guardaba ni la comparaba. Ahí no había candado.

**Ahora hay uno solo para todo.** El control vive dentro de
`verificar-transferencia`, que es lo que llaman la pantalla de pagos y —cuando
exista— la página de clientes. Recibe `order_id`, y si el banco devuelve una
referencia:

- busca si otro pedido de esa sucursal ya la tiene → responde `ya_usada` con cuál
  fue, y la pantalla lo muestra en rojo: *"Ese abono ya se usó"*;
- si está libre, la deja reclamada por ese pedido.

Se marca al VERIFICAR y no al cobrar: el cajero le dio a Verificar sobre ESE
pedido y el banco muestra ese abono, así que ya quedó reclamado. Si no termina de
cobrar, la reserva se queda donde debe. El mismo pedido puede re-verificar las
veces que quiera.

**Un hueco que apareció al mirarlo.** El chat guardaba la referencia tal cual la
devolvía el banco y la búsqueda la limpia de guiones y espacios: una referencia
con guion no se habría reconocido a sí misma y el candado se habría abierto solo.
Las dos partes guardan ahora la versión limpia. No había pasado todavía porque
**no existe ni un solo pedido con referencia guardada** — o sea que el anti-replay
del chat nunca ha llegado a actuar.

No hay tabla nueva: la referencia vive dentro del pedido, en el mismo formato que
`pos-print.js` ya sabe limpiar del recibo. Un solo formato para todo el sistema.

Probado con 8 casos sobre base simulada: referencia libre, ya usada por otro, el
mismo pedido re-verificando, referencias demasiado cortas, guiones y espacios, y
que marcarla no pise la dirección ni el barrio ni se duplique.
Desplegado: `verificar-transferencia` v6, `verify-transfer` v24.

## 124. La puerta de la página de clientes (`web-acceso` v1)

Un solo camino, no dos. El código de WhatsApp **no registra ni inicia sesión**:
lo único que hace es probar que el teléfono es de quien lo escribe. Después se
mira si ya existe un cliente con ese número: si existe se enlaza, si no se crea.
Por eso aquí nunca puede salir "este número ya está registrado" — el error que
rompió la aprobación de clientes en agosto.

El teléfono ES la cuenta: es donde ya viven los puntos y el nivel, y es el único
dato que tienen los 72 clientes (ninguno tiene correo).

**El día a día no lleva código.** El código se manda una sola vez, para crear la
cuenta; de ahí en adelante se entra con teléfono y contraseña, con la casilla
"mantener mi sesión" que escoge el cliente (12 horas si no la marca, 90 días si
sí). El código vuelve solo si olvida la contraseña. Mandar un código cada vez
sería un estorbo — decisión de Sergio.

**Nada delicado se guarda tal cual.** La contraseña va derivada con PBKDF2 y
120.000 vueltas, con sal distinta para cada cliente: dos personas con la misma
contraseña tienen huellas distintas, y aunque alguien se llevara la tabla,
probar contraseñas le costaría carísimo. Del código y del token de sesión solo
se guarda su huella. Se usa lo que trae el propio motor (Web Crypto), sin
librerías de terceros en algo tan delicado.

**Detalles que importan:**
- Las comparaciones son en tiempo constante. Un `===` corriente se sale en cuanto
  encuentra la primera letra distinta, y esa diferencia de milésimas alcanza para
  ir adivinando una credencial letra por letra.
- El código va atado al teléfono (entra en la huella): el mismo código no sirve
  en otro número.
- Tope de 3 códigos por hora y 8 por día por número. Sin eso, la página sería una
  forma de llenarle el WhatsApp a cualquiera.
- El código vence a los 10 minutos, admite 3 intentos y se quema al usarse.
- Al entrar con contraseña, el mensaje es el MISMO si el número no existe o si la
  contraseña está mal: decir "ese número no está registrado" le confirmaría a un
  desconocido quién es cliente del restaurante. Cuando el número no existe se
  deriva igual una clave falsa, para que tampoco delate por el tiempo de
  respuesta.
- El nivel y la barra los calcula `fn_nivel_cliente`, la misma que usa el chat.
  Aquí no se recalcula nada. El gasto acumulado NUNCA sale al cliente.

Probado: 17 comprobaciones sobre el cifrado y la normalización del teléfono, y
los candados de la puerta contra la función ya desplegada (dirección que no
existe, página apagada, token inventado, acción desconocida).

**Falta para poder entrar de verdad:** encender la página (`tenants.web_activa`)
y la plantilla de autenticación de Meta para mandar el código fuera de la ventana
de 24 h.

## 125. El aviso de puntos por WhatsApp (`aviso-puntos` v1) — 14-ago-2026

Cada vez que un cliente gana puntos —cuando se hacen efectivos, es decir al
pagar— le llega la plantilla **`puntos_ganados`** (aprobada por Meta, idioma
`es`): "¡Ganaste {{1}} puntos con tu compra en {{2}}! Ya tienes {{3}}
acumulados…". Funciona en TODOS los canales (mesa, domicilio, venta rápida),
que era el requisito: por eso es plantilla y no texto libre — el cliente de
mesa no tiene ventana de 24 h abierta.

**Cómo fluye:** el trigger `award_loyalty_points` (que ya existía) abona al
pagar y deja el movimiento en `pos_puntos_movimientos`. La función nueva
`aviso-puntos` barre cada 2 minutos (cron job 6) los movimientos de
`acumulacion` sin avisar, y a cada uno le manda la plantilla con sus tres
variables reales: puntos ganados, **nombre de la MARCA** (brands.name — nunca
branches.name, que es "Principal" y es interno), y saldo después.

**Detalles que importan:**
- **El teléfono se guarda sin indicativo** (así lo escribe Sergio y así lo
  normaliza el trigger: 10 dígitos). Meta lo exige internacional: la función
  le antepone `57` al enviar. No hay problema con la costumbre de Sergio.
- **Los 108 movimientos anteriores quedaron marcados `previo`**: encender el
  aviso no le escribe a nadie por puntos viejos.
- Reclamo atómico (`aviso='enviando'` antes de enviar): dos barridos que
  coincidan no duplican mensajes. Estados: `enviado / fallido / apagado /
  vencido (>48 h) / previo`. El error de Meta se guarda tal cual.
- **Por restaurante**, en `ia_config.estados_config.puntos`:
  `{activo, plantilla, idioma}`. Sin config → `apagado`, no se envía nada.
  Encendido hoy SOLO para El Parche. Falta la fila visual en Mensajes →
  Estados de pedido y avisos (desplegable de plantillas aprobadas) para que
  cualquier restaurante lo configure solo.
- Si el cliente tiene conversación en el chat, se guarda copia del texto con
  `origen: 'sistema'` para que el Front muestre lo que le llegó.

**Probado de punta a punta:** movimiento de prueba con el número del gerente →
la función respondió `enviados: 1` y la plantilla llegó al teléfono. La fila
de prueba se borró.

## 126. Paco aprende a conversar (motor v273) — la madrugada del 15-ago-2026

Se ejecutó el plan completo de `AUDITORIA-PACO.md` (fases A, B y C), probado
con 6 casos en el banco (4 corridas) antes de tocar producción.

**FASE A — entender.** El clasificador ganó las casillas humanas que no
tenía: `pregunta`, `despedida`, `queja`, `quiere_humano`, `fuera_tema` — y
ahora recibe los últimos 4 mensajes ("las gracias" tras "está caro" es
despedida; tras otra cosa, no). El enrutador corre ARRIBA de la rama de la
carta (5-bis): "no quiero hablar con un robot" contiene "quiero" y la carta
se lo llevaba. Despedida → se despide (frases.despedida, cae a frases.cierre)
salvo pedido en curso. Queja/quiere humano → aviso + `human_takeover` con
motivo. La regex `PREGUNTA_DEL_CLIENTE` quedó solo de respaldo si el
clasificador falla. "No manejamos ese producto" exige intención de PEDIR
("información" ya no la dispara). La regla de "ignora lo fuera de tema" se
cambió por reconocer y redirigir.

**FASE B — nunca en bucle.** Contador de intentos por paso en el estado
(generalización del que tenía producto_ambiguo). 2.º y 3.er intento anteponen
frase distinta (frases.reintento_2 / reintento_3, configurables); al 4.º pasa
a humano con motivo escrito ("Paco no logró obtener 'direccion' tras 4
intentos"). Probado con basura tres veces: no repite, escala.

**FASE C — misión y saludo.** MISIÓN arriba del prompt (entender qué pasa y
atenderlo ANTES de continuar el flujo). El saludo fijo también sale cuando el
PRIMER mensaje trae ganas de pedir sin producto concreto ("hola buenas para
un servicio de domicilio" — el caso real que se quedó sin presentación: la
regex solo aceptaba saludos puros). Nunca por encima de una pregunta, la
carta o un producto nombrado.

**Trampas de la noche:** (1) `pend` era de OTRA función — el enrutador quedó
mudo y solo los logs lo dijeron (ReferenceError en 1067); la despedida ahora
consulta el estado solo cuando ya es despedida. (2) "está caro" disparaba
`queja` → humano; se precisó: queja es problema de SERVICIO, no objeción de
precio. (3) "no gracias así está bien" en el upsell disparaba despedida y
cortaba el pedido; guarda de pedido en curso.

**Verificación (banco v128):** saludo nuevo ✓ · "cuanto vale" sin insulto ✓ ·
despedida real ✓ · quiere humano ✓ (motivo escrito) · bucle escala al 4.º ✓ ·
pedido completo de regresión intacto ($28.000, resumen, cierre) ✓.

**Frases nuevas configurables (aún sin fila en Mensajes):** `despedida`,
`pasar_humano`, `reintento_2`, `reintento_3`.

## 127. Agregar un plato después del resumen (motor v274) — 15-ago-2026

La trampa que Paco no resolvió en la prueba exigente de Sergio: tras el
resumen, "puedo agregar porfavor una salchi super queso" se ignoraba y el bot
repetía el mismo resumen — dos veces. Hasta hoy, después del resumen solo
existían tres ramas: quitar, cambiar el pago y confirmar. Agregar no tenía.

**El arreglo NO duplica maquinaria.** El bloque post-resumen ahora lleva
etiqueta (`resumen:`) y, si el lector ve un producto y el mensaje habla de
agregar, hace `break resumen`: el mensaje sigue derecho al flujo normal, donde
el 14b ya sabe archivar el plato en curso, arrancar el nuevo con sus propias
preguntas y conservar dirección, pago, nombre y upsell. El resumen se rearma
al final con todo.

**La segunda capa del bug:** el lector y el clasificador, al ver el verbo
"agregar", marcaban "super queso" como TOPPING y el flujo se lo pegaba al
plato anterior ("Premium Mixta **+ Super Queso**", +$12.000 fantasma). Regla
v255 aplicada: nombrado UNA vez con artículo ("una salchi super queso") es el
PLATO. En la rama de agregar se apagan las señales de topping del mensaje
(`intenciones.agregados = []`) y deciden las reglas deterministas del 14a.
También se le enseñó al clasificador: "agregar UNA salchi X" = plato aparte;
"agregaLE X" = topping — la señal es el "le", no el verbo.

**Probado en el banco (v131):** flujo completo — resumen → agregar → "Sobre la
*SÚPER QUESO* ¿personal o familiar?" → sus DOS grupos de variantes (carne/pollo
y chorizo/tocineta) → resumen con ambos platos → efectivo → cierre. La
regresión de quitar tras el resumen sigue bien (coca eliminada, total $33.000).

**Menores anotados, sin arreglar hoy:**
- Al quitar tras el resumen puede colarse una línea de preferencia fantasma
  ("· sin la coca cola") — el mismo texto se procesa dos veces (quitar +
  preferencias). No toca la plata; confunde la comanda.
- El contador anti-bucle cuenta por CAMPO: con dos grupos de variantes, la
  segunda pregunta sale con el prefijo del 2.º intento ("Solo me falta este
  dato"). Se lee natural, pero técnicamente no es un reintento.

## 128. La trampa del conjunto inexistente (motor v275) — 15-ago-2026

Sergio probó "Maria Monica Casa 32" (conjunto que no existe). Lo acordado: Paco
se pausa, sube la barra del domicilio, el dueño confirma el precio y Paco
retoma. Lo que pasó: el bot se enredó en reintentos y terminó pasando a humano
por "queja". La pausa (14f-bis) estaba INTACTA — nunca la dejaron llegar. Dos
piezas nuevas de la madrugada la secuestraban:

1. **El contador anti-bucle contaba sin mirar el progreso.** El cliente dio la
   dirección (avance real) y la PRIMERA pregunta del barrio salió con el
   "perdón si no me hice entender" del 3.er intento. Ahora se toma una foto de
   los datos antes de procesar cada mensaje y, si algo cambió, el contador
   arranca de cero: solo cuenta el estancamiento, nunca la cooperación.
2. **"ya te lo dijeeee" clasificaba como queja → humano.** El propio prompt
   traía "ya te lo dije tres veces" como ejemplo de queja. Se precisó: queja es
   un problema del servicio YA OCURRIDO; la frustración con la conversación es
   impaciencia de alguien que está cooperando y la maneja el flujo. Y
   quiere_humano solo cuando lo PIDE explícitamente.

**Probado en el banco (v133)** con la conversación exacta de la trampa:
dirección → barrio limpio y sin prefijos → "Déjame confirmarte el valor del
domicilio hasta allá, es un momento 😊" + `domi_precio_pendiente: true` (la
barra sube). La conversación real de Sergio quedó liberada del handoff.

## 129. La barra del domicilio no subía con conjuntos nuevos (v276) — 15-ago

La pausa funcionaba (Paco se calló y pasó a humano con "CONJUNTO NUEVO por
aprobar") pero la barra para confirmar el precio nunca apareció. Causa: el
Front pinta la barra cuando ve `domi_precio_pendiente`, y las DOS ramas de
conjunto nuevo (14e-bis y la del final del flujo) pasaban a humano SIN
encender esa bandera — solo la rama de barrio desconocido (14f-bis) la ponía.
Dos ramas hermanas, una con bandera y otra sin: el patrón de siempre.

Ahora ambas ramas encienden `domi_precio_pendiente` y guardan el estado antes
de pasar a humano; `confirm-domi` ya la apagaba al confirmar (verificado,
línea 361) y retoma a Paco con relectura.

De paso: si el pedido y la dirección venían en el MISMO mensaje ("me das una
premium... para Villa Ernesto Torre 3 Apto 108"), el nombre propuesto del
conjunto era el mensaje ENTERO. Ahora se corta en el último "para": se
propone "Villa Ernesto".

**Pendiente anotado:** la dirección capturada también se traga el mensaje
completo en ese caso (state.direccion = todo el texto). La barra y la comanda
muestran el texto largo. Es del extractor de dirección; no bloquea.

## 130. "ara " hacía match dentro de "para" (v281) — 15-ago-2026

El resumen fijo desaparecía tras retomar de la barra del domicilio. La cadena
del bug, rastreada con reproducción completa en el banco (pausa + confirm-domi
+ relectura simulados):

`LUGARES_PUBLICOS` incluye `"ara "` (la tienda Ara). La comparación era
`dir.includes(kw)`, y "p**ara ** Villa Ernesto" contiene "ara ". Toda dirección
con la palabra "para" — o sea, casi cualquier pedido dictado en una sola frase
— quedaba clasificada como LUGAR PÚBLICO → exigía pago adelantado → borraba el
pago en efectivo → y esa rama entrega el turno al modelo con paso nulo, que se
inventaba su propia pregunta de pago (y antes, en v273, su propio mini-resumen).

**Arreglo:** las palabras sueltas de `LUGARES_PUBLICOS` y `LUGARES_RECHAZADOS`
se comparan como PALABRAS completas (con relleno de espacios y puntuación
normalizada); las frases ("centro comercial") siguen como estaban.

**Verificado en el banco, ciclo entero:** conjunto desconocido → pausa + barra
→ confirm-domi aprende a $6.000 → relectura → upsell → nombre → **resumen fijo
con totales y domicilio** → efectivo → cierre.

Sigue pendiente (anotado): la dirección capturada arrastra el mensaje completo
cuando pedido y dirección vienen en una sola frase — se ve fea en el resumen
(📍 con todo el texto) y en la comanda, pero ya no descarrila nada.

## 131. Categorías que se responden en texto (motor v283) — 15-ago-2026

Pedido de Sergio: "¿qué tienes de tomar?" no debe mandar la carta completa —
debe responder la lista de bebidas en texto. Y no global: cada restaurante
decide por categoría.

**Cómo quedó:**
- Casilla nueva `categoria` en el clasificador ("que tienes de tomar" →
  "bebidas"; el menú COMPLETO sigue siendo carta; un producto concreto → null).
- Rama determinista 5-ter: si la categoría está en `ia_config.categorias_texto`,
  la respuesta sale de una consulta FRESCA del catálogo de la sucursal (los
  mapas DYN se reconstruyen después y en frío podrían arrastrar el catálogo de
  otro restaurante — trampa multi-tenant evitada). Solo NOMBRES, nunca precios.
- Guardia determinista: si la pregunta NOMBRA un producto ("qué sabores de
  postobón", "qué tamaños la coca cola"), NO es categoría — sigue el flujo
  normal, que responde presentaciones y variantes de ese producto.
- Config en Configuración → Asistente → "Qué información ve el asistente":
  fichas por categoría real del catálogo. Sin marcar = carta (nadie cambia sin
  decidirlo). El Parche: solo Bebidas.

**Probado en el banco:** "que tienes de tomar" → "De bebidas tenemos: Hit,
Quatro 1.5 litros, Premio 1.5 litros, Agua botella, Coca cola o Postobón 1.5
litros 😋 ¿Cuál se te antoja?" · "qué sabores de postobón" → "Postobón de uva,
1.5 litros" · "qué tamaño la coca cola" → "1.5 litros o personal" · "quiero
una salchipapa" → carta como siempre · pedido completo → flujo intacto.

**Verificación de no-daño (bisección con git contra el banco):** el caso
"una ranchera personal y una coca cola personal" pierde la coca HOY — y
también la pierde en v280, v274 y v272 (motor de ANTES de todo lo del 15-ago).
No es regresión de hoy: es el bug ya anotado del segundo plato en una sola
frase, que a veces acierta por varianza del modelo. Sigue en pendientes, ahora
con evidencia de bisección y el arnés listo (bisect_banco.py).

**Pendiente menor nuevo:** el clasificador devolvió 400 intermitente (9 veces
en 6 h; el respaldo de palabras clave amortigua). Instrumentar el cuerpo del
error cuando se retome.

## 131-bis. Categoría en texto, versión final (v286) — 15-ago-2026

La v283 competía con el modelo: mandaba SU lista y el modelo mandaba la suya
(con presentaciones, más bonita — la que Sergio prefirió) = dos mensajes. Y el
guardia de producto apagaba la respuesta en el mensaje mixto.

**Diseño final:** la rama determinista 6-pre NO redacta nada. Hace dos cosas:
CALLA la carta (cartaSuprimida) y le deja al modelo la instrucción exacta
(cfg._catTexto → línea en el prompt): listar la categoría con presentaciones
en viñetas, sin precios salvo que los pidan, y si preguntan por UN producto,
responder solo ese con sus opciones. El modelo redacta; el catálogo del prompt
(MENÚ) es la única fuente.

**Batería en el banco (4/4):** pura → lista con presentaciones en un solo
mensaje · mixta ("Super queso porfa, ¿y qué tienes de tomar?") → UNA respuesta
con la lista Y el súper queso capturado (verificado en el estado) · "sabores
de postobón" → "Postobón en sabor Uva" · "sabores de hit" → sus opciones.

## 132. Precio puntual desde el catálogo (v288) — cierra el D2 — 15-ago-2026

"¿Cuánto cuesta la coca cola 1.5?" respondía LA CUENTA del pedido (la rama del
"¿cuánto es?" atrapaba todo lo que sonara a precio). Ahora existe
`precioPuntual()`: si la pregunta NOMBRA un producto o una adición, responde SU
precio, leído del catálogo en el momento — nunca de una FAQ ni de la memoria
del modelo. Probado en el banco:
- "coca cola 1.5" → el precio de ESA presentación ($8.000)
- "adición de ranchera" → $14.000 en personales y $28.000 en familiares (la
  palabra "adición" salta el plato Ranchera y va directo a los modificadores)
- "salsa cheddar" → $4.000 (la presentación exacta)
- "¿cuánto es?" sin nombrar nada → la cuenta, como siempre
Si hay pedido en curso, responde el precio Y repregunta el paso donde iba.
El punto ("1.5") sobrevive a la normalización — limpiarlo rompía el acierto
de presentación.

## 133. Direcciones de conjunto en un solo mensaje + "1bis" (v291) — 15-ago

Trampa de Sergio: "dame una premium mixta, para asturias casa 3b" — el bot
preguntaba "¿para dónde va?" y luego "¿en qué casa?" en bucle, a quien ya
había dicho todo. Tres capas, cazadas con instrumentación en el banco:

1. La puerta de la dirección exigía calle+número y botaba los conjuntos.
   Ahora acepta conjunto conocido, o algo que suene a conjunto con su unidad.
2. El lector a veces SEPARA (barrio="Asturias", direccion="casa 3b") y la
   unidad sola no pasaba ninguna puerta. Si el barrio es un conjunto conocido
   y la dirección es su unidad, se guarda la UNIÓN ("Asturias casa 3b").
3. VIA_RE aceptaba máximo 2 letras pegadas al número: "calle 1bis" no casaba
   y la dirección real de un cliente se botaba. Ahora hasta 3 ("bis").

**Verificado como pidió Sergio: con 10 direcciones REALES de clientes** —
Claros del Bosque bloque 7 casa 10 · Llanos de Calibio bloque A1 apto 1006 ·
Calle 1bis #4-18 (Vasquez Cobo) · Calle 53n #11-58 casa 13 (Villa del
Viento) · Monteluna casa 45 · carrera 6 #38N-160 apto 306 (Rincón de la
Ximena) · Calle 71N #8D-9 Torre 2B (San Eduardo) · Asturias casa 3b · y la
regresión "Bellavista" suelto (correctamente re-pregunta). **10 de 10 con la
dirección completa guardada al primer mensaje.**

## 134. Papas fantasma: el lector inventaba adiciones desde palabras compuestas (15-ago, URGENTE en turno)
- **Caso real**: cliente pidio "Una salchipapa mixta / Familiar". El lector (gpt-4o-mini, no determinista) a veces descompone "salchipapa" y devuelve adiciones:["papas"]. Como "Papas" existe en el catalogo a $8.000, la compuerta de catalogo la dejaba pasar: resumen "Mixta Familiar + Papas", pedido $58.000 + domi $8.000 = $66.000. El cliente pago $66.000 por transferencia (verificada). Cobro real correcto: $58.000.
- **No reproducible en banco** (3/3 corrio bien, incluso sembrando la historia previa del cliente): es varianza del modelo. Por eso el arreglo es una compuerta determinista, no un parche de prompt solamente.
- **Arreglo (v292)**: en la compuerta de adiciones del mergeSlots (junto a la regla del plato-mismo), : si ninguna palabra de la adicion aparece SUELTA en el texto del cliente (tolerando singular/plural) pero SI aparece pegada al final de una palabra mas larga ("salchipapa" termina en "papa"), la adicion nacio de ese pedazo y se bota. Si no hay rastro en ninguna forma se respeta al lector (sinonimos tipo "papitas" -> Papas). Ademas se blindo el prompt del lector: "de salchipapa NO sale la adicion papas ni salchicha".
- **Regresion en banco v156**: papas fantasma limpio; "con papas" conserva la adicion; "salsa cheddar" conserva; "familiar ranchera con adicion de ranchera" conserva. Produccion v292 ACTIVE con smoke test.
- **Pendiente comercial**: el pedido real quedo cobrado en $66.000 (paid $66.000) — Sergio decide si devolver los $8.000 o abonarlos; la fila del pedido y los puntos (58 en vez de 50) se corrigen si el lo pide.

## 135. Turno en vivo del 15-ago (parte 2): para llevar, barrio-como-nombre, factura y estados de los pedidos de Paco
Cuatro fallas reales de turno, cazadas y corregidas en caliente (delay-reply v293, verify-transfer v31, cambiar-estado v8):
- **"Para llevar" y el prompt (caso JP)**: el cliente dijo "Para llevar / Yo la recojo" y Paco le pidio la direccion. Las ramas deterministas conocen LLEVAR_REGEX pero la linea de estado del prompt no: cualquier direccion sin via que no fuera conjunto se marcaba "Direccion INCOMPLETA — FALTA la calle" y el modelo obedecia. Ahora esa linea dice "PARA LLEVAR: recoge en el local, JAMAS pidas direccion". Verificado en banco (v158): sigue el flujo del producto sin pedir direccion.
- **Un lugar no es un nombre (factura de Isabella)**: "Carrera 9# 21-N 46" + "Ciudad jardin" en el mismo lote -> extractNombre (via "linea suelta con forma de nombre") tomo el barrio como nombre y la factura salio a nombre de "Ciudad jardin". Compuerta nueva en extractNombre (ambas vias, marcador y linea): si es zona con precio o conjunto conocido, no es nombre. OJO: la primera compuerta se puso en validarLeido (lector) y NO basto — el capturador real era extractNombre; quedaron las dos. Verificado en banco: ahora pregunta el nombre.
- **Las notas son la factura (verify-transfer)**: las marcas anti-replay (Ref/Mail) iban en notes y salian impresas donde va el barrio. Ahora notes = direccion + barrio; las marcas van en pos_orders.audit_pago (columna nueva). El anti-replay consulta con or=(notes.ilike...,audit_pago.ilike...) para seguir cazando comprobantes viejos.
- **Paridad de estados con el camino manual**: crear-pedido-chat engancha chat_conversations.order_id y llama cambiar-estado; los pedidos de Paco (delay-reply y verify-transfer) NO lo hacian. Consecuencias: la tarjeta del chat mostraba el pedido VIEJO de la conversacion (a Isabella le salio el del 1-AGO con coca cola y $64.000), la pastilla/etiqueta de estado no aparecia, y el "En camino" que Sergio marco le cayo al pedido viejo. Ahora ambos crean con estado en_preparacion, enganchan order_id y llaman cambiar-estado (delay-reply con sin_mensaje:true porque ya manda su frase de cierre; verify-transfer con aviso normal, igual que el camino manual). cambiar-estado v8 acepta sin_mensaje (estado+etiqueta cambian, no se avisa).
- **Datos corregidos a mano**: pedido de Isabella (5e316cfc) -> $58.000/venta $50.000, nombre Isabella Arias, notes con barrio, audit_pago aparte, estado en_camino con etiqueta; pedido del 1-ago (641f7fd9) -> entregado con delivered_at de ese dia; conversacion apunta al pedido de hoy.

## 136. Factura del bot sin telefono ni puntos (15-ago, parte 3) — verify-transfer v32
- **Sintoma**: el pedido creado al verificar la transferencia salia en la factura sin el numero del cliente y sin puntos.
- **Dos raices en verify-transfer**: (1) las notas no llevaban la marca [tel:] — y el recibo (pos-print.js), la comanda Y el disparador de puntos (award_loyalty_points) leen el telefono de ahi; (2) la busqueda del cliente usaba el telefono CON el 57 pegado y pos_clientes guarda sin indicativo -> nunca encontraba a nadie y cliente_id quedaba vacio (el fallback del trigger tampoco tenia de donde agarrar).
- **Arreglo**: notas en el formato canonico de TODO el sistema — direccion [barrio:X] [tel:Y] — y helper telLocalVT (573113918394 -> 3113918394) para la busqueda/creacion del cliente y la marca. El barrio va en [barrio:] (ya no en texto suelto como quedo en la v31 de esta manana).
- **Regla para el futuro**: cualquier funcion que cree pedidos DEBE escribir notes con direccion [barrio:X] [tel:Y] — recibo, comanda y puntos dependen de ese formato.
- **Dato corregido**: pedido de Isabella (5e316cfc) con notes canonicas y cliente_id enlazado; los puntos saldran solos al cerrar el pedido (el trigger corre al pasar a paid/completed), sobre la venta corregida: 50.

## 137. Historial de puntos reconstruido (15-ago, parte 4)
- **Sintoma (Isabella y 38 clientes mas)**: el saldo de puntos estaba bien, pero el historial mostraba solo los movimientos recientes — los puntos ganados ANTES de que existiera pos_puntos_movimientos solo vivian en el saldo (pos_puntos) y la pantalla los hacia ver como "solo los de hoy".
- **Arreglo (solo datos, sin codigo)**: por cada cliente cuyo saldo superaba la suma de sus movimientos se inserto UN movimiento de acumulacion por la diferencia — detalle "Compras anteriores (historial reconstruido)", quien=sistema, fechado ANTES de su primer movimiento real (o en el updated_at del saldo si no tenia ninguno) y con aviso='previo' para que el cron de avisos JAMAS les escriba por esto. 39 insertados; verificacion: 0 clientes descuadrados.
- **Nota**: los puntos de hoy de cada pedido siguen saliendo solos al cerrarlo (trigger en paid/completed); esto solo repone el pasado en el historial.

## 138. Los puntos salen cuando la plata entra (15-ago, parte 5) — trigger nuevo + verify-transfer v34
- **Sintoma**: pedido por transferencia VERIFICADA, "Pagado" en pantalla... y sin puntos del dia. El trigger award_loyalty_points solo disparaba al pasar status a paid/completed, y los pedidos del bot viven en open hasta el cierre de caja.
- **Callejon evitado**: se intento crear el pedido en paid (v33) y DESAPARECIA de la pantalla de domicilios en pleno reparto — esa pantalla solo muestra status open (domicilios.js:262). Revertido en v34: el pedido del bot nace open A PROPOSITO (comentario en el codigo lo advierte).
- **Arreglo real (migracion sql/2026-08-16-puntos-al-pagar.sql)**: el trigger ahora dispara cuando el pedido queda pagado DE VERDAD — por status (paid/completed, camino de caja) O por plata completa (paid_amount >= total, camino del bot). Doble candado anti-repeticion: transicion (si ya calificaba antes no vuelve a dar) + historial (un pedido con acumulacion registrada jamas da otra). Probado con el pedido real de Isabella: re-marcarlo paid NO duplico (2 movimientos, saldo 108).
- **Isabella**: 58 (1-ago, historial reconstruido) + 50 (hoy, al quedar cubierto el pago) = 108. El aviso de los 50 sale solo por el cron.

## 139. Paco apagado seguia contestando cortesias (15-ago, parte 6) — delay-reply v294
- **Sintoma**: Sergio desactivo a Paco en la conversacion de Isabella (human_takeover=true) y aun asi, a cada "gracias" de la clienta, Paco respondia la despedida.
- **Raiz**: la compuerta de human_takeover vivia donde se carga convRow (linea ~1418) y las ramas nuevas del 15-ago —5-bis entender (despedida/queja/quiere humano), 5-ter/6-pre categoria en texto y la rama de la carta— responden ANTES de llegar alla. El "Muchas gracias" entraba por la rama de despedida y salia la frase configurada, con Paco apagado.
- **Arreglo**: compuerta 5-pre al INICIO de las ramas que responden — consulta liviana de human_takeover y silencio total si esta al mando un humano. La compuerta de abajo queda como respaldo. Si el flag no se puede leer, se atiende (mejor eso que un restaurante mudo).
- **Probado en banco (v159)**: misma frase "Muchas gracias" — con takeover CALLADO, sin takeover contesta la despedida.

## 140. Precio equivocado con nombres repetidos entre categorias (caso Emily, 15-ago) — delay-reply v295
- **Caso real**: "una salchipapa de pollo personal" -> resumen "1x Pollo Personal, Pedido $9.000". Ese "Pollo" era el de la categoria ADICIONES ($9.000); la salchipapa de pollo vale $17.000. De remate, el "me regalas de queso" (Super Queso) se rechazaba — "no se puede agregar a lo que pediste" — porque el producto casado era una adicion sin modificadores. Sergio tuvo que tomar la conversacion y corregir a mano ($30.000 + $7.000 domi).
- **Raiz (matchCatalogo)**: con nombres repetidos entre categorias (Pollo existe en Adiciones, Hamburguesas, Perros, Sandwich y Salchipapas), la categoria solo se comparaba por IGUALDAD EXACTA — el lector dice "salchipapa" y la categoria se llama "Salchipapas Tradicionales": no casaba nunca — y el desempate caia al PRIMERO de la lista, que era el de Adiciones.
- **Arreglo — tres desempates en orden**: (a) categoria del lector TOLERANTE (categoriaMencionada con sinonimos: salchipapa/salchi casan con "Salchipapas Tradicionales"); (b) el tipo de comida dicho DENTRO del nombre decide ("salchipapa de pollo" es de salchipapas); (c) un producto de categoria de adiciones/salsas JAMAS le gana al plato salvo que el cliente diga "adicion".
- **Verificado en banco (v160)** con la conversacion real de Emily: producto Pollo/Salchipapas Tradicionales, resumen $30.000 + domi — identico a la correccion manual de Sergio; el Super Queso entra como adicion. "una de pollo" a secas: pregunta de que categoria (rama de ambiguedad que ya existia). Ranchera y demas regresion sin cambios.
- **Por que las pruebas de Sergio no lo pescaron**: en sus pruebas el nombraba los platos sin ambiguedad ("ranchera", "mixta familiar") — nombres que existen UNA vez. Los clientes reales dicen "salchipapa de pollo", "la de 13mil", "de queso": nombres que chocan entre categorias. No es que el motor se degradara — es que los clientes reales hacen preguntas que las pruebas no hacian.
- **Pendiente vigilado**: resolverPedido de verify-transfer tiene su PROPIO matching de items (linea ~672) sin estos desempates — los totales salen de total_mostrado (correctos), pero un item de la comanda podria salir con nombre/precio de la categoria equivocada. Revisar en la proxima sesion.

## 141. Carta + pedido en el mismo lote: el pedido se ignoraba (15-ago) — delay-reply v296
- **Caso real (573113538271)**: "Hola / me regalas la carta / regalame un perro pollo con adicion de pina / y una salchi maicitos especial pollo" -> saludo + carta... y el PEDIDO entero ignorado. La rama de la carta terminaba el turno con un return incondicional (extraRespondido).
- **Arreglo**: si el clasificador dice que el lote tambien PIDE (intenciones.pedir), la carta se envia SIN la frase "?Que deseas ordenar?" y el turno NO termina: el flujo sigue y captura el pedido (mismo espiritu que la categoria en texto). Verificado en banco (v162): carta + producto POLLO de PERROS CALIENTES + adicion Pina Calada capturados en el mismo turno. (El segundo plato de la misma frase sigue siendo el pendiente conocido de <=v272.)
- **Tropiezo intermedio**: la primera version del candado del saludo (entrada 142) uso clienteTexto antes de su declaracion (TDZ) y tumbo TODO el motor en banco v161 — ni "Muchas gracias" contestaba. Corregido con batchMsgs. Leccion: un const usado 500 lineas antes de nacer no avisa al construir, solo al correr.

## 142. Un saludo no es una despedida (15-ago) — delay-reply v296
- **Caso real (573044868407)**: cliente volvio a los 12 DIAS con "Buenas noches" + sticker. El clasificador, leyendo la historia vieja (que termino en "gracias"), lo marco como despedida: Paco lo "despidio" al llegar ("estamos para servirte"). Sergio tuvo que apagarlo y contestar.
- **Arreglo doble**: (1) candado determinista en 5-bis — si el lote es SOLO un saludo (SALUDO_REGEX, quitando stickers), la rama de despedida no corre; (2) regla en el prompt del clasificador: un saludo JAMAS es despedida aunque la conversacion anterior haya quedado cerrada hace dias.
- **Regresion en banco**: "Muchas gracias" solo -> despedida normal; "Buenas noches" despues -> saludo de llegada.

## 143. El trigger de puntos estuvo roto ~90 min por la migracion 138 (15-ago, corregido)
- **Como se descubrio**: Sergio pregunto si a todos los que ganaron puntos hoy les llego la plantilla. Los 4 avisos del dia estaban enviados... pero el cruce pedidos-vs-puntos mostro DOS pedidos pagados con telefono y SIN puntos (Emily y Ana Maria) — los dos cerrados DESPUES de la migracion 138.
- **Raiz**: la migracion 138 reescribio award_loyalty_points copiando el ON CONFLICT de la version VIEJA del repo (2026-08-01): ON CONFLICT (tenant_id, telefono). Pero el indice unico real de pos_puntos es POR EXPRESION — (tenant_id, pos_tel10(telefono)), de la fase de seguridad de puntos — asi que la clausula reventaba SIEMPRE... y el EXCEPTION WHEN OTHERS THEN NULL se tragaba el error. La version viva tambien escribia saldo_despues; la copia vieja no.
- **Por que la prueba del candado no lo pesco**: la prueba re-marco paid un pedido que YA calificaba antes -> solo ejercito el camino de NO premiar. El camino de premiar quedo sin probar (los 4 premios del dia habian salido con el trigger anterior). Leccion: probar la transicion COMPLETA open->paid de un pedido que deba premiar.
- **Arreglo (misma migracion, reescrita)**: ON CONFLICT (tenant_id, (pos_tel10(telefono))), saldo_despues en el movimiento (RETURNING puntos), y el error ya NUNCA se traga: queda en la tabla trg_debug (la venta jamas se bloquea). Verificado con transiciones reales: Ana Maria +45 (saldo 45) y Emily +30 (saldo 66), cero errores; avisos por el cron.
- **Regla para el futuro**: antes de reescribir una funcion de la base, leer la VERSION VIVA (pg_get_functiondef), no la copia del repo — ya habia pasado con /body de las Edge Functions y hoy paso con SQL.

## 144. Transferencia rechazada por un digito doblado del OCR + boton Confirmar pago muerto por CORS (15-ago) — verify-transfer v35
- **Caso real (573206656129, Isabela)**: comprobante perfecto y rechazado. La vision leyo la llave destino "00927626260" (11 digitos) y la nuestra es "0092726260" (10): un 6 DOBLADO en la mitad — error clasico de OCR sobre digitos repetidos. La comparacion aceptaba igualdad o contencion, pero no un digito insertado en la mitad.
- **Arreglo 1**:  — si quitando UN digito del numero mas largo queda EXACTO el otro (solo digitos, diferencia de longitud 1), es tropiezo de lectura y el pago coincide. La SUSTITUCION de un digito (misma longitud, un numero distinto) se sigue rechazando: eso si puede ser otra cuenta.
- **Arreglo 2 (el boton manual)**: "Confirmar pago" en el panel daba "Error al confirmar: Failed to fetch". El preflight CORS de verify-transfer solo devolvia Allow-Origin, sin Allow-Headers (authorization/content-type) ni Allow-Methods: el navegador bloqueaba la llamada antes de salir. CORS completo en OPTIONS y en TODAS las respuestas (CORS_VT). Verificado con un preflight real: los tres encabezados presentes.
- **La venta de Isabela**: Sergio la salvo a mano (pedido $18.500 creado manual, cliente atendido). pago_pendiente limpiado para sacarla de la bandeja. El pedido queda open — al cobrarlo en caja como transferencia le saldran sus puntos solos.

## 145. El aviso de puntos siempre visible en el chat (pedido de Sergio, 15-ago) — aviso-puntos v5
- **Pedido**: poder abrir el chat y VER que la plantilla de puntos salio. Antes la copia al chat solo se guardaba si el cliente YA tenia conversacion (los de mesa/venta rapida no tienen) y, aunque existiera, no se actualizaba last_message: la bandeja ni se enteraba.
- **Arreglo**: (1) si el cliente no tiene conversacion, se CREA (contact_handle 57+tel, contact_name de pos_clientes o el numero) y ahi queda el aviso; (2) tras guardar la copia se actualiza last_message/last_message_at/last_read para que el chat suba en la bandeja con el aviso como ultimo mensaje. origen sigue siendo sistema (sin etiqueta de Paco).
- **Las difusiones masivas siguen igual** (no ensucian la bandeja): esto aplica SOLO al aviso de puntos, que es uno por compra.

## 146. El domicilio se botaba al crear el pedido en efectivo (caso Brayan, 15-ago) — delay-reply v297 + confirm-domi v13 + front
- **Caso real**: Paco cotizo bien ($26.000 + $5.000 domi = $31.000) y el pedido se creo SIN el domicilio: comanda y recibo mostraban solo $26.000 y el domiciliario habria cobrado de menos.
- **Raiz 1 (delay-reply, camino efectivo)**: createWhatsappOrder recibia domi_precio en buildOrderArgs y lo DESCARTABA — un comentario habia malinterpretado la regla "el domi nunca suma a ventas" como "el domi no se guarda". La regla real: no suma a total_final (LA VENTA), pero va en delivery_fee y en total (lo que paga el cliente). Ahora: total = comida+empaque+domi · total_final = comida+empaque · delivery_fee aparte — identico a verify-transfer.
- **Raiz 2 (confirm-domi, camino del top bar)**: peor — sumaba el domi a total_final (el domi ENTRANDO a ventas, contra la regla de oro) y tampoco escribia delivery_fee. Misma correccion.
- **Front (chat-ia.js clienteDe)**: los clientes que Paco crea con sus pedidos no se veian en la pantalla del chat hasta recargar (el mapa de clientes se carga al abrir). Ahora, si un telefono no esta en el mapa, se consulta UNA vez su ficha y se repinta la lista y el encabezado. (Brayan y Andres Hurtado SIEMPRE estuvieron guardados en pos_clientes — era solo el refresco.)
- **Dato corregido**: pedido de Brayan (d6fe0464) -> delivery_fee 5000, total 31000, venta 26000. El de Altos de Morinda estaba bien (entro por verify-transfer v34+).
- **Patron del dia (4a vez)**: tres creadores de pedidos hermanos (delay-reply, verify-transfer, confirm-domi, crear-pedido-chat) y cada uno con SU version del desglose. Pendiente de fondo ya anotado: unificar la creacion de pedidos en una sola ruta.

## 147. La etiqueta del barrio faltaba en los clientes del bot (15-ago) — delay-reply v298 + verify-transfer v36
- **Sintoma**: los clientes creados por Paco (Brayan, Andres Hurtado) salian en el chat con nombre pero SIN la etiqueta del barrio.
- **Raiz**: los dos creadores de clientes del bot (delay-reply efectivo y verify-transfer) insertaban en pos_clientes solo nombre + telefono + direccion — sin la casilla , que es de donde el chat pinta la etiqueta. (La copia de createWhatsappOrder en confirm-domi resulto CODIGO MUERTO: ya no crea pedidos, reencola a delay-reply — anotado para la limpieza.)
- **Arreglo**: ambos guardan  al crear el cliente. Backfill: 2 clientes con barrio vacio rellenados desde la marca [barrio:X] de sus pedidos (Brayan -> San Ignacio, Andres -> Altos de Morinda).
