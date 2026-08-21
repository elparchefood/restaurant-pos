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

## 148. La caja no cerraba por pedidos del bot entregados pero "abiertos" (15-ago) — cambiar-estado v9
- **Sintoma**: el cierre de caja se bloqueo con Isabella Arias y Andres Hurtado "abiertos" — estaban entregados y pagados completos, pero status seguia en open (los pedidos del bot nacen open a proposito, entrada 138, y nadie los cerraba nunca).
- **Arreglo de raiz**: cambiar-estado, al pasar un pedido a ENTREGADO, revisa el pago: si paid_amount cubre el total y sigue open, lo cierra solo (status paid + closed_at). Si falta plata (efectivo contraentrega sin registrar), queda open para cobrarlo en caja — el cierre de caja lo reclama, como debe ser.
- **Datos**: los dos pedidos cerrados a mano (paid + closed_at); cero puntos dobles (el candado de la 143 verificado en vivo: 1 movimiento por pedido).

## 149. Pagina de clientes: recuperar la contraseña mandaba a registrarse de cero (15-ago) — web-acceso v7 + app-cliente
- **Caso real (Sergio)**: pidio recuperar contraseña, el codigo llego bien por WhatsApp, y al escribirlo salio el formulario de alta VACIO con "Solo falta esto y quedas registrado" — teniendo nombre, direccion, puntos e historial.
- **Raiz 1 (backend)**: web-acceso buscaba al cliente con  EXACTO. La fila de Sergio estaba guardada como 573244756271 (el unico de 147 asi, sembrado por una prueba vieja): no casaba -> ya_registrado=false -> alta desde cero. Peor aun, crear-cuenta habria creado un cliente DUPLICADO. Arreglo: helper  que compara por los ULTIMOS 10 DIGITOS (misma regla que pos_tel10), usado en verificar-codigo, crear-cuenta y entrar; y al enlazar se normaliza la fila a 10 digitos.
- **Raiz 2 (experiencia, lo que pidio Sergio)**: aunque reconociera al cliente, le mostraba el formulario completo. Ahora, si ya es cliente, la pantalla pide SOLO la contraseña nueva y saluda por su nombre ("¡Hola de nuevo, Sergio! Escribe tu contraseña nueva y entras"), con la nota "Tus puntos y tu historial siguen intactos" y un enlace "Actualizar mis datos" para quien SI quiera corregir direccion/barrio (ahi sale el formulario prellenado). El backend dejo de exigir el nombre a quien ya lo tiene.
- **Datos**: 1 telefono normalizado (Sergio 573244756271 -> 3244756271); los otros 146 ya estaban bien.
- **Verificado contra la funcion real** con un cliente de PRUEBA guardado a proposito con indicativo: reconoce (ya_registrado + datos), crea-cuenta sin reenviar nombre, entra con la clave nueva y normaliza el telefono. Filas de prueba borradas.

## 150. La plata de un cliente NO se borra en silencio (16-ago) — web-acceso v8 + migracion RESTRICT
- **Caso real**: Sergio recargo $50.000 el 7-ago y quedo con $55.000 (bono Estandar $5.000). Hoy entro a la pagina y vio $0. Las tres tablas del sistema de saldo estaban COMPLETAMENTE vacias.
- **Raiz 1 — el borrado en cascada**: su ficha de cliente fue borrada y recreada el 14-ago. pos_saldo, pos_saldo_mov y pos_recargas_solicitudes tenian ON DELETE CASCADE sobre cliente_id: al irse la ficha se fueron el saldo, sus movimientos y TODO el rastro de la recarga. Nadie se entero. El unico rastro sobreviviente fue pos_diag (web-recarga/lectura, 7-ago, monto=50000), porque no cuelga de cliente_id.
- **Raiz 2 — el saldo escrito a mano en cero**: fichaCliente de web-acceso devolvia  fijo, de cuando las recargas no existian. Aunque el saldo hubiera sobrevivido, la pagina habria mostrado $0 igual. Ahora lee pos_saldo.
- **Arreglos**: (1) migracion sql/2026-08-16-la-plata-no-se-borra.sql — CASCADE -> RESTRICT en las tres tablas: la base IMPIDE borrar un cliente con saldo o movimientos (pos_web_credenciales se queda en CASCADE: una clave sin dueño no es plata); (2) web-acceso lee el saldo real; (3) comentario obsoleto corregido en app-cliente.js.
- **Restitucion**: $55.000 devueltos a Sergio con su movimiento de ajuste y el motivo escrito. Solo el estaba afectado (pos_saldo tenia 0 filas en total: era la unica recarga del sistema).
- **Verificado**: borrar un cliente CON saldo -> bloqueado por la base; SIN saldo -> se borra normal; la pagina muestra $55.000 al crear cuenta y al volver a entrar con la sesion. Filas de prueba borradas.
- **Pendiente sugerido**: en la pantalla de Clientes, cuando el borrado falle por saldo, mostrar "este cliente tiene $X de saldo" en vez del error crudo de la base.

## 151. Confirmar la contraseña + el cache congelado que escondia TODOS los cambios (16-ago)
- **Pedido de Sergio**: dos campos de contraseña en el registro. Hecho en app-cliente.js: campo "Repite tu contraseña" y comprobacion ANTES de enviar (largo minimo y que coincidan), sin borrar lo que ya escribio. Va tambien en la pantalla de recuperacion, que es donde mas se equivoca uno tecleando a ciegas.
- **HALLAZGO GRAVE de paso**: elparchefood/index.html cargaba la aplicacion con  escrito A MANO. El diseño era correcto (el index no se cachea y el ?v= renueva la app), pero nadie subia ese numero al cambiar app-cliente.js: llevaba dias congelado. Comprobado desde el navegador — pidiendo el MISMO archivo con  llegaban 88.926 bytes (version vieja, sin los arreglos) y con una marca nueva 89.964 bytes. O sea: los arreglos de la pagina de clientes (recuperar contraseña, saldo real) estaban publicados pero NO le llegaban a nadie.
- **Arreglo**: la marca se calcula sola con la fecha y hora (AAAAMMDDHH) desde el propio index, que no se cachea. Un cambio publicado llega a todos en menos de una hora sin tocar nada, y dentro de la misma hora el archivo se sigue cacheando (no gasta datos del cliente en cada pantalla). document.write mantiene el orden supabase -> app.
- **Verificado en vivo**: la app que sirve cobrapos.app con la marca de la hora en curso trae el campo nuevo, el aviso de contraseñas distintas, el modo recuperacion y el saldo real.
- **Ojo para el futuro**: revisar si las pantallas internas del POS (chat-ia, configuracion, ventas) tienen el mismo ?v= a mano — mismo riesgo de servir codigo viejo.

## 152. Carta web: las adiciones eran las del OTRO tamaño (16-ago) — fn_web_carta + app-cliente
- **Caso real**: Premium FAMILIAR, y en el paso de adiciones aparecia "Adiciones Personales" — el grupo del otro tamaño, con otros precios.
- **Raiz**: el producto guarda en mod_group_pres que grupo va con que presentacion ({grupo:[pres_id]}), pero fn_web_carta devolvia TODOS los grupos de mod_group_ids sin ese mapa y sin el id de las presentaciones: la pagina no tenia con que filtrar y los mostraba todos, en el orden en que llegaran.
- **Arreglo (base)**: fn_web_carta agrega uid=197609(USUARIO) gid=197121 groups=197121 a cada presentacion y  a cada grupo de modificadores (a que tamaños aplica; vacio = a todos, para grupos comunes y productos de un solo tamaño).
- **Arreglo (pagina)**:  filtra los grupos por el tamaño elegido;  conserva los INDICES del producto completo (sheet.mods y todo lo demas siguen leyendo por ese indice); al cambiar de tamaño se sueltan las adiciones del anterior (), y / reciben la talla para no cobrar ni mandar a cocina un extra de otro tamaño aunque esa limpieza no hubiera corrido.
- **Verificado con los datos reales de la carta** (ejecutando las funciones del archivo, no una copia): Premium Familiar -> solo "Adiciones Familiares"; Personal -> solo "Adiciones Personales"; los 33 productos con adiciones siguen mostrando sus grupos (23 tienen grupos sin mapeo, que aplican siempre); al cambiar de tamaño se suelta el grupo que ya no aplica.

## 153. El total del pedido web: empaque invisible, variante sin cobrar y la funcion caida (16-ago) — web-pedido v7
- **Lo que reporto Sergio**: el carrito no sumaba el empaque. El servidor SI lo cobraba al crear el pedido: el cliente veia un total y le cobraban otro.
- **Arreglo 1 — la cuenta la hace el servidor**:  en web-pedido devuelve el desglose (productos, empaque, domicilio, total) SIN crear nada, usando la MISMA linea de codigo que despues cobra (no una copia de la formula: por eso no se pueden desincronizar). La pagina la pide cuando cambia el carrito, el tipo de entrega o el barrio, con una firma del pedido para no tener que acordarse de invalidar la cache en cada boton. Se calcula tambien con el restaurante cerrado, que es cuando el cliente arma su pedido.
- **Arreglo 2 — DOS bugs de plata que aparecieron al probar**: el select del catalogo en web-pedido no traia  ni , y el codigo SI los leia. Sin  no se aplicaba el precio de la variante: una Premium Mixta Personal se cobraba $28.000 en vez de $34.000 (el negocio perdiendo $6.000 por pedido). Sin  el empaque no reconocia las categorias exentas y le cobraba empaque a las bebidas.
- **Arreglo 3 — la funcion no arrancaba**:  (dos const con el mismo nombre). BOOT_ERROR: la pagina no podia tomar NINGUN pedido. No hay registro de llamadas anteriores, asi que no se sabe desde cuando. Renombrada a .
- **Trampa del /body confirmada otra vez**: cada descarga trunca el inicio del archivo (primero "// w", luego mas). Hay que reconstruir la linea 1 antes de subir — y el repo tenia una version VIEJA (114 lineas menos) que se sincronizo con la viva.
- **Verificado con el pedido real de la captura** (Premium Mixta Personal + Postobon): recoger -> productos $42.000 + empaque $1.000 = $43.000; domicilio a Bella Vista -> + $5.000 = $48.000. El empaque cobra solo la salchipapa (las bebidas estan exentas). Filas de prueba borradas.

## 154. Varias direcciones por cliente (pedido de Sergio, 16-ago) — web-acceso v10 + app-cliente
- **Pedido**: boton "Agregar direccion" en el perfil, y en el checkout un desplegable para escoger entre las suyas o agregar una nueva ahi mismo.
- **Datos**: se usa pos_clientes.direcciones, que YA existia con la forma {dir, barrio} (67 clientes la tienen poblada). No se migro la tabla: un helper  les pone un id estable derivado del contenido a las que no lo tienen, y de ahi en adelante las nuevas nacen con id propio. pos_clientes.direccion/barrio sigue siendo "la que esta en uso" — es lo que leen el POS, Paco y los pedidos.
- **Backend (web-acceso)**: acciones  y . Quien es lo dice la SESION, nunca el navegador (probado con un token falso: rechazado). Tope de 10 por cliente. No se duplican: "Calle 5 #10-20" y "calle 5 # 10 - 20" son la misma casa (comparacion normalizada) y ademas manda la forma YA GUARDADA, no la que acaba de teclear — si no, una version descuidada quedaba como su direccion y era la que veia el domiciliario. Al quitar la que estaba en uso, pasa a usarse la primera que le quede (nunca queda una direccion fantasma).
- **Front**: en Perfil, lista de "Tus direcciones" con la marca de cual esta en uso, boton Quitar por fila y "+ Agregar direccion". En el checkout, desplegable "Donde te lo dejamos" con sus direcciones y la opcion "+ Agregar otra direccion..."; el campo Barrio solo se pide si la direccion elegida no lo trae. Al cambiar de direccion se invalida la cuenta para recalcular el domicilio.
- **Compatibilidad**: quien no tenga lista pero si una direccion suelta (los que se registraron antes) la ve como su primera direccion — nadie tiene que reescribir lo que ya dio.
- **Verificado contra la funcion real**: entrar y ver la vieja con id; agregar una segunda; reescribir una existente no duplica y conserva el formato bueno; quitar la que estaba en uso reasigna; token invalido rechazado. Filas de prueba borradas.

## 155. PRIMER ENSAYO DE PUNTA A PUNTA DE LA PAGINA (16-ago) — web-pedido v8 + web-pagar v4
Sergio pregunto si ya se pueden hacer pedidos por la pagina. Nunca se habia hecho uno (0 pedidos con marca [web]), asi que se monto un ensayo COMPLETO en el tenant "Restaurante de Prueba" (catalogo minimo, web activa temporal) para no tocar la operacion de El Parche. Aparecieron dos fallas que lo habrian roto el primer dia:
- **El pedido nacia SIN PRODUCTOS**: pos_order_items exige product_name y product_price (NOT NULL) y web-pedido no los mandaba; el insert fallaba en silencio (sbPost solo hace console.error). El pedido se creaba con el total correcto y la comanda llegaba EN BLANCO. Arreglado: la linea lleva product_name, product_price, total y selections. Ademas, si una linea no entra, el pedido se ANULA y se le dice al cliente — un pedido a medias no sirve.
- **Al pagar, el pedido no llegaba a la cocina**: los pedidos web nacen con visible_cocina=false (primero paga, despues se prepara) y web-pagar solo marcaba status=paid. Quedaban invisibles en TODAS las pantallas mientras el cliente leia "ya estamos preparando tu pedido". Arreglado con : visible_cocina=true y estado por  (la misma puerta del POS y de Paco, para que quede tambien el delivery_status de la pantalla de domicilios). Va en los DOS caminos de pago: saldo y transferencia.
- **Verificado en el ensayo final**: registro con codigo -> cuenta creada -> carrito -> cuenta previa -> pedido enviado (con sus items y notas) -> pago con saldo (descuenta y deja movimiento) -> pedido paid, visible_cocina true, estado en_preparacion, delivery_status preparacion -> puntos acreditados (40 por $40.000).
- **Ensayo borrado por completo** (pedidos, items, cliente, saldo, puntos, sesiones, catalogo) y el tenant de prueba devuelto a web_activa=false / programar=false. El Parche no se toco: sigue con sus 21 pedidos del dia.
- **Estado real para El Parche**: la pagina esta activa, pero AHORA responde "no podemos recibir pedidos" porque esta cerrado y  esta en false — decision del dueño, no una falla. Al abrir a las 6:30 p.m. el camino ya esta probado.
- **Falta probar en vivo**: el pago por TRANSFERENCIA de la pagina (lee el comprobante y lo cruza con el correo del banco, igual que Paco). El ensayo probo el camino del saldo.

## 156. El pedido web llega COMPLETO a la cocina (16-ago) — web-pedido v10
Sergio pregunto si el pedido se crea con las notas de cada producto. Las notas si, pero al revisarlo aparecieron dos huecos mas grandes:
- **La pagina no mandaba variantes ni adiciones al crear el pedido** (solo producto, presentacion, cantidad y nota) aunque SI las mandaba en la cuenta previa. Resultado: el cliente veia $37.000 y se cobraban $28.000, y a la cocina le llegaba "Premium" sin decir si era mixta ni con que adiciones.
- **web-pedido no sabia cobrar adiciones**: no habia ninguna logica de modificadores. Ahora se traen los grupos del catalogo (una sola consulta para todo el pedido), se cobra el precio REAL de cada adicion y solo valen las del grupo que corresponde al tamaño elegido (mod_group_pres) — una adicion familiar no se cobra en una personal.
- **Trampa que me comi y que costo dos ensayos**: guarde  como LISTA. Un trigger de inventario hace jsonb_each sobre ellos y con una lista revienta ("cannot call jsonb_each on a non-object"): el pago descontaba el saldo y el pedido se quedaba en pendiente_pago, sin error visible — solo aparecio leyendo los logs de la funcion. Ahora se guardan como OBJETO por grupo, el mismo formato que usan el POS y Paco.
- **Ensayo final verificado** (Premium Mixta Personal + salsa cheddar + nota "sin ajo, solo bbq", con nota general del pedido): cuenta previa $37.000 = pedido cobrado $37.000; la comanda dice "Premium - Personal - Mixta + Salsa cheddar"; la nota del producto y la del pedido quedan guardadas; selections con pres, vars y mods en el formato del sistema; tras pagar: paid, paid_amount correcto, visible en cocina y en preparacion. Ensayo borrado y tenant de prueba devuelto a apagado.

## 157. Banner del inicio, version definitiva (16-ago) — app-cliente
Sergio eligio, de 16 maquetas, la del mosaico de fotos al centro. Como quedo:
- **Centro (el espacio grande)**: las FOTOS DE PUBLICIDAD que el propio restaurante sube desde Promociones (fn_web_promos). Son suyas y el banner no trae ninguna imagen propia. Hasta 3 en fila; si el restaurante no ha subido ninguna, en vez de un hueco sale un recuadro punteado que dice donde van.
- **Derecha (tarjetas 01, 02, 03)**: PRODUCTOS DE LA CARTA de verdad — foto del producto de fondo, nombre y precio "Desde", y al tocarlas llevan a la carta. Un velo en degradado sobre la foto para que el texto se lea sobre platos claros.
- **Como se eligen mientras Sergio no los seleccione**: el plato FUERTE de cada categoria (el de mayor precio con foto), excluyendo bebidas, adiciones y salsas. El primer criterio (el primero de cada categoria) sacaba "Agua botella" de primera — lo ultimo que uno quiere anunciar. Ahora salen Super queso, Premium y Especial.
- **El inicio ahora carga carta + promos** (antes la carta solo se cargaba al entrar a esa pestaña).
- **Verificado con datos reales**: banner de 183 px de alto, zona de fotos de 620 px, tres tarjetas con foto y precio, sin desbordes, en escritorio y en 375 px.
- **PENDIENTE (lo pidio Sergio)**: poder elegir a mano que productos o combos van en las tres tarjetas, desde el panel. Hoy es automatico.

## 158. El banner se reparte en la pagina (16-ago, diseño de Sergio)
El banner funcionaba pero se sentia PUESTO ENCIMA, no parte del sistema: metia tres cosas distintas (mensaje, publicidad y productos) en una franja con un lenguaje visual propio. Sergio decidio repartir sus piezas dentro de las tarjetas que ya existian:
- **El rango sube a la cabecera**: barra larga al lado del nombre (chip + barra de progreso + "3% para Premium"), tocable, que lleva a Puntos. Deja de ocupar una tarjeta entera del resumen.
- **La publicidad ocupa ese cuadro libre**: UNA foto grande que rota sola entre las que el restaurante sube en Promociones (6 s, con puntos para cambiarla a mano; se detiene si la pestaña no se ve o si el cliente toca un punto). Se ve mucho mejor que el mosaico de miniaturas y no gasta mas espacio de pagina.
- **Fila "Para hoy", de cuatro**: el primer rectangulo lleva el MENSAJE del banner con sus dos botones (Ver la carta / Mis puntos) y es el unico con color, para anclar la fila; los otros tres son platos de la carta con foto grande (16/10), nombre y precio "Desde".
- **Mi billetera y Tu actividad NO se tocaron** (peticion expresa de Sergio), igual que las muescas y las formas de las tarjetas, que son diseño suyo y quedan como estan.
- **Retirado**: el bloque .ep-hero completo y el carrusel viejo (bannerPromos/ep-banner), que ya no se usaban en ninguna pantalla.
- El subtitulo de la tarjeta de puntos pasa a "Redimelos por lo que mas te gusta" para no repetir lo que ahora dice el mensaje de la fila.
- **Verificado con datos reales**: resumen en tres columnas a la misma altura (411/329/329 px) y fila de cuatro pareja (267 px cada una), fotos rotando y platos con su precio.

## 159. Inicio: nuevo orden y el historial con lo que pidio y sus puntos (16-ago) — web-acceso v12
- **Orden nuevo (diseño de Sergio)**: los destacados pasan de fila a CUADRO 2x2 y Mi billetera sube a su lado; abajo, Tu actividad y el HISTORIAL uno junto al otro, del mismo tamaño. Mi billetera conserva su tamaño de siempre.
- **ESPEJO, y quien manda es la billetera**: al principio el cuadro estiraba la billetera (201 px de contenido inflados a 393). Ahora el cuadro va absoluto dentro de su columna, asi no impone su alto: los dos bloques quedan identicos (medido: 544x300 cada uno) y las fotos de los platos se reparten el alto que sobra.
- **La barra de nivel ocupa todo el ancho libre** de la cabecera, con "Tu nivel" escrito (un title del navegador no sirve: tarda y en el celular no existe) y, al pasar el mouse, "Ver mis puntos".
- **El historial dice QUE pidio y CUANTOS PUNTOS gano**, no "Pedido" y el precio. web-acceso trae los productos y los puntos de TODOS los pedidos en dos consultas en bloque (no una por pedido).
- **Trampa del nombre**: el orden de "plato · presentacion" cambia segun quien creo el pedido ("Mixta · Familiar" desde el chat, "Familiar · Mixta" desde la caja). Cortar por el separador dejaba "Familiar" o "1.5 Litros" como si fuera el plato; ahora se muestra el nombre completo (sin las adiciones) y el diseño lo recorta si no cabe.
- Si un pedido no tiene puntos ligados (los reconstruidos de la entrada 137 no tienen order_id), se muestra un guion — no se inventa un numero.
- **Verificado con un cliente real** (Isabella): "Mixta · Familiar +50 pts" y el pedido viejo con sus dos productos. Sesion de prueba borrada.

## 160. La foto de perfil del cliente (16-ago) — web-acceso v13
- **Sintoma**: Sergio subia su foto de perfil y no pasaba nada; y quien ya tenia una guardada entraba y veia sus iniciales.
- **Causa**: la pagina estaba completa por los dos lados (manda `accion:'foto'` con la imagen ya achicada a 256 px, y pinta `c.foto`), pero el servidor no tenia NI la accion NI el campo: subir respondia "accion desconocida" y la ficha nunca devolvia `foto_url`. El historial de git confirma que nunca estuvo — no se perdio en un despliegue.
- **Arreglo (web-acceso v13)**: `fichaCliente` devuelve `foto: c.foto_url`, y la nueva accion `foto` valida el formato, sube la imagen a `chat-media/clientes/<tenant>/<cliente>-<fecha>.jpg` y guarda la URL publica en `pos_clientes.foto_url`.
- **La foto va al almacen, no a la tabla**: una imagen dentro de la fila del cliente viajaria en TODAS las respuestas de la ficha, y la ficha se pide en cada visita.
- **Quien es lo dice la sesion**, no el cuerpo del mensaje: nadie puede cambiarle la foto a otro cliente. Tope de 900 KB por si llega algo que no vino de la pagina.
- **Verificado de punta a punta** con un cliente de PRUEBA: sube, vuelve en la ficha, la URL publica responde 200 y una imagen invalida se rechaza. Cliente de prueba borrado.
- **Ojo**: la foto que Sergio tenia antes se perdio el 14-ago junto con su saldo, cuando su ficha de cliente se borro y se volvio a crear (misma causa de la entrada 148). Hay que volverla a subir; de ahora en adelante queda guardada.

## 161. Medallas y boton "Pedir" en los destacados (16-ago) — fn_web_carta + pos_products.medalla
- **Cuatro medallas** sobre la foto, arriba a la izquierda, UNA por tarjeta (dos encima de una foto pequeña se pelean y no se lee ninguna): **Mas pedido** (dorada), **Nuevo** (vino), **Para 2** (blanca), **2x1** (verde).
- **"Mas pedido" NO se pone a mano**: sale de las ventas reales de los ultimos 60 dias, con un minimo de 10 unidades — con tres ventas la medalla no significa nada y solo gasta la credibilidad. Si el dueño puso una medalla a mano, manda la suya; la dorada solo llena el hueco que el dejo.
- **Se calcula una vez por restaurante** dentro de fn_web_carta, no una consulta de ventas por cada plato de la carta.
- **Las otras tres las marca el dueño** en el editor del producto (catalogo-productos): botones con el COLOR de verdad que va a tener la medalla, no una lista de palabras — elegir "vino" de un desplegable sin verlo no le dice nada a nadie. Columna nueva `pos_products.medalla`.
- **Los colores estan repetidos** en app-cliente.css y en catalogo-productos.js a proposito: son dos programas distintos que no comparten hoja de estilos. Si se cambia uno, se cambian los dos.
- **"Nuevo" no puede ser automatico** en este restaurante: los 53 productos se crearon el mismo dia (la carta se importo), asi que `created_at` no distingue nada.
- **El destacado ahora abre ESE plato**, no la carta: antes llevaba a la carta y el cliente tenia que volver a buscar lo que acababa de ver. La tarjeta entera es el boton — en el celular no hay "pasar el mouse" y obligar a apuntarle a un boton pequeño encima de una foto es peor que tocar donde sea.
- **El velo con "Pedir"** solo sale al pasar el mouse (la foto es lo que hace pedir; taparla siempre seria trabajar en contra) y se esconde entero en pantallas tactiles, donde se quedaria pegado despues de tocar.
- **Medido con datos reales**: tarjetas 283x143 iguales, medallas dentro de la foto, el velo la tapa exacta, y el espejo con Mi billetera intacto (580x300 los dos).
- **PENDIENTE (lo pidio Sergio)**: elegir a mano cuales tres productos van en los destacados. Hoy se escogen solos.

## 162. El catalogo de puntos dice la verdad (16-ago) — fn_web_puntos_catalogo
Sergio: "hay dos productos pero creo que faltan mas, y aparte dice que ya los puede reclamar". Eran DOS errores distintos, los dos en la misma funcion.

- **LOS COMBOS NO SALIAN.** Un premio puede apuntar a un producto O a un combo, pero la funcion solo unia con `pos_products`. De los 4 premios de El Parche, 2 son combos: se caian en silencio. Ahora la funcion une las dos tablas (union all) y salen los 4.
- **EL COSTO LLEGABA CON OTRO NOMBRE.** La funcion devolvia la columna como `costo` y la pagina leia `k.puntos`. Como no existia, TODO premio valia 0 puntos — y con 0 puntos a todo el mundo le alcanza. Por eso decia "Ya lo puedes pedir" siempre. Nadie podia: el cliente con mas puntos lleva 175 y el premio mas barato vale 400.
- **`dinero` tampoco se devolvia**, aunque la pagina ya sabia pintarlo: el combo de 1000 pts + $20.000 se veia gratis. Ahora dice "Lo puedes pedir poniendo $20.000".
- **Se cambiaron los nombres de la funcion a los que la pagina ya leia** (`puntos`, `dinero`), no al reves: son los mismos nombres de la tabla `pos_puntos_catalogo`. La RPC solo la usa app-cliente.js (comprobado), asi que cambiar la firma no rompe nada mas.
- **Un premio que apunta a un producto agotado o a un combo apagado ya no se muestra**: no se puede entregar.
- **"Te falta poco" ahora es PROPORCIONAL**, no un corte fijo de 20 puntos. Con el corte viejo, quien llevaba 1.450 de un premio de 1.500 veia lo mismo que quien iba en cero. Ahora entra desde el 60%.
- **Barra de progreso en cada premio que todavia no alcanza**: "te faltan 225 pts" no dice si eso es mucho o poco; la barra si. En los que ya alcanzan no va — una barra llena no informa nada.
- **Verificado con los 4 premios reales** en tres casos: 175 pts (todos en "Para ir juntando"), 1.100 (dos listos, el combo con plata listo, el de 1.500 en "te falta poco" al 73%) y 1.600 (los cuatro listos).
- **Lo de arriba NO se toca**: cuantos puntos cuesta cada premio, cuanta plata se pone encima y a que ritmo se ganan los puntos lo decide Sergio, y ya esta decidido. Los dos premios del mismo combo son A PROPOSITO: uno se reclama solo con puntos (1.500) y el otro es mixto (1.000 + $20.000). No es un duplicado.

## 163. "El local": donde queda, con mapa (16-ago) — fn_web_publica
- La pantalla YA sabia pintar el bloque "Donde estamos" con la direccion y el enlace al mapa. Salia vacio porque `fn_web_publica` nunca mandaba la direccion. Otro caso del patron de siempre: un lado completo y el otro no.
- **La direccion NO vive en `tenants`** — esa tabla ni siquiera tiene columna de direccion. Vive en la SUCURSAL (`branches.address` / `city` / `country`), que es lo correcto: un restaurante con dos sedes tiene dos direcciones. Se toma la sucursal activa mas antigua, la misma regla con la que ya se elige la marca y el logo.
- **Va el mapa de verdad, no solo un enlace**: una direccion escrita en una ciudad que uno no conoce no dice nada, y un enlace obliga a salirse de la pagina para saber si queda cerca. Se usa el mapa incrustado de Google, que no necesita llave ni cuenta.
- **Se busca direccion + ciudad + pais**: "Carrera 9 b # 63 n 58" a secas existe en media Colombia.
- **El mapa tiene tope de alto** (300 px, minimo 190 en celular). Con la proporcion 16/9 suelta, en un computador la tarjeta mide mas de 1.400 px de ancho y el mapa se iba a 800 px de alto: ocupaba la pantalla entera y empujaba los horarios fuera de vista. Medido: 318x190 en celular, 718x300 en tableta, 1408x300 en computador.
- El boton dice **"Como llegar"**, no "Ver en el mapa": el mapa ya esta a la vista; lo que falta es la ruta.
- **Verificado**: la direccion de El Parche resuelve a 2.4820212, -76.5739667 — Popayan. (El panel de vista previa no abre paginas con mapas incrustados, asi que se comprobo pidiendo el mapa y mirando las coordenadas.)
- **De paso, arreglado "6:30 a.m. p.m."**: el servidor manda la frase ya en 12 horas ("Abre hoy a las 6:30 p.m.") y la pagina la volvia a convertir — el "6:30" se traducia solo y el "p.m." original quedaba pegado atras. Si la frase ya trae a.m. o p.m., se deja como viene.

## 164. "Mi pagina web" rehecha con el handoff (16-ago) — pagina-web + pos-qr
La pantalla vieja tenia 4 tarjetas. La nueva sigue el handoff que trajo Sergio: 10 secciones, vista previa en vivo, QR, modales y cierres programados.

**Lo que hay detras de cada seccion** (todo con datos de verdad; donde el dato no existe se muestra un guion, nunca un numero inventado):
- **Direccion y QR** — `tenants.slug`. Cambiarla avisa que los QR impresos dejan de servir.
- **Publicar** — `web_activa`.
- **Estado ahora mismo** — NO se calcula aqui: se llama a `fn_web_estado`, la MISMA que usa la pagina del cliente. Asi lo que ve el dueño y lo que ve el cliente no se pueden desincronizar.
- **Cerrar a mano** — `web_cerrado_manual` + `web_cerrado_hasta`. "Solo por hoy" se guarda como FECHA de vencimiento, no como una marca que alguien tenga que acordarse de quitar: mañana el servidor ve que ya paso y abre solo.
- **Cierres programados** — `web_cierres` (jsonb). Se valida que no se crucen: dos cierres encima del mismo dia no rompen nada, pero el dueño creeria que borro uno y sigue cerrado por el otro.
- **Pedidos con el negocio cerrado** — `web_programar_pedidos`.
- **Que ve el cliente** — columna NUEVA `tenants.web_visible` (jsonb). Una columna y no cinco booleanas porque la lista va a crecer (faltan los destacados y la publicidad). **Lo que falta MANDA encendido**: al reves, cada seccion nueva apareceria apagada para todos los restaurantes que ya existen.
- **Probar el acceso** — igual que antes, manda un WhatsApp de verdad.
- **Como va** — sesiones distintas en `pos_web_sesiones` (no filas de `pos_clientes`: casi todos llegaron por el chat y contarlos seria inflar el numero) y pedidos con `origen='web'`.

**COLUMNA NUEVA `pos_orders.origen`**: `channel` dice COMO se entrega (salon/domicilio/rapido) y web-pedido guardaba lo mismo que la caja, asi que no habia forma de saber que pedido vino de la pagina. `origen` dice POR DONDE entro. Son dos preguntas distintas: mezclarlas obligaria a inventar un canal falso que romperia los informes de domicilios. Los pedidos viejos quedan sin marcar a proposito — rellenarlo a ojo seria inventar, y por eso la tarjeta dice "desde que publicaste". (web-pedido v11)

**EL GENERADOR DE QR (`pos-qr.js`), escrito a mano**: Cobra corre dentro de un .exe que tiene que funcionar SIN INTERNET, y una libreria traida de un CDN dejaria la pantalla en blanco justo en el restaurante que no tiene wifi. Modo byte, correccion nivel M, versiones 1 a 6 (la direccion mas larga posible son 61 caracteres y la version 6 aguanta 106; pasar de la 6 obligaria a escribir el bloque de "informacion de version" que nunca se usaria).
- **Comprobado leyendolo de verdad** con OpenCV, no comparando dibujos: 149 de 150 direcciones al azar se leen. El unico fallo lo reproduce igual `segno` (libreria de referencia) con el mismo texto, asi que es una rareza del lector, no del codigo.
- **Dos errores encontrados asi, que un vistazo no habria pillado**: (1) la copia de la informacion de formato de la esquina de arriba a la izquierda iba con los bits AL REVES; (2) la regla 3 de castigo no contaba el patron cuando tocaba el BORDE del codigo — ahi los cuatro modulos claros son el margen blanco. Por eso la mascara de rayas verticales salia "limpia", ganaba, y producia un codigo que no leia nadie.
- **Ojo si se compara contra segno**: segno mete un byte de relleno de mas cuando el flujo ya viene alineado (`8 - (192 % 8)` da 8 en vez de 0), asi que sus cuadriculas y las nuestras NO coinciden aunque las dos sean validas. Comparar dibujos no sirve; hay que LEER el codigo.
- La hoja para la mesa se imprime desde una ventana propia, no con `window.print()` de la pantalla: si no, saldria impresa la pantalla entera de Cobra. El QR va en grande (900 px) porque uno de 180 se ve bien en pantalla pero impreso queda borroso.

**Sigue con el candado de administrador de plataforma** (`es_admin_plataforma`), como estaba: el modulo todavia se esta afinando.
- **Verificado sin iniciar sesion**: se ejecutaron las funciones de dibujo con los datos reales de El Parche y se midio el resultado — 10 tarjetas, dos columnas (821+384), estado "Cerrado por horario · Abre hoy a las 6:30 p.m.", 7 interruptores en su posicion correcta, y el escenario apagado/cerrado a mano con sus avisos. Sin desbordes.
- **PENDIENTE (lo pidio Sergio)**: desde aqui van a salir tambien los productos destacados y las imagenes de la publicidad.

## 165. Mi pagina web: pestañas y vista previa DE VERDAD (16-ago)
Dos ajustes que pidio Sergio despues de ver la pantalla.

**1 · PESTAÑAS.** Diez tarjetas seguidas eran un rollo de dos metros, y la mitad son cosas que se tocan una vez al año. Agrupadas por lo que uno viene a HACER, no por parecido:
- **Tu pagina** — direccion, QR y publicar (se toca una vez y no se vuelve a mirar).
- **Cuando abres** — estado, cerrar a mano, cierres programados y pedidos con el negocio cerrado. Cuatro tarjetas que siempre se miran juntas y antes estaban sueltas.
- **Que ve el cliente** — los interruptores. Aqui van a entrar despues los destacados y la publicidad.
- **Probar y medir** — probar el acceso y las cifras.
- **Esconder no puede ser TAPAR**: si la pagina esta apagada, el negocio cerrado a mano, falta el horario o hay secciones ocultas, la pestaña lo dice con un punto aunque no se este mirando.
- La pantalla paso de 2.617 px de alto a 1.702.

**2 · LA VISTA PREVIA ES LA PAGINA, NO UN DIBUJO.** Antes era una maqueta pintada dentro de la propia pantalla. Una maqueta siempre se termina despegando de la pagina real, y entonces miente justo cuando mas se confia en ella. Ahora se carga cobrapos.app/{slug} dentro de un marco.
- **Se carga al tamaño REAL** (390x800 celular, 1280x820 computador) y se encoge con zoom. Apretar la pagina a 268 px daria el diseño de celular en los dos casos y la vista de computador no serviria para nada.
- **Al guardar cualquier cosa la vista previa se recarga** (contador en la direccion). Si no, seguiria mostrando lo de antes y el dueño creeria que su cambio no se guardo.
- El pie aclara que **asi la ve un cliente que entra por primera vez** — el interior necesita la sesion del cliente. Y hay boton para recargar y para abrirla aparte.
- Se comprobo que GitHub Pages **no manda X-Frame-Options**, asi que la pagina si se puede incrustar.
- Se retiro la maqueta entera (previa/pantallaCliente/tarjeta/barra/renglon).
- **Medido**: marco 268x550 en celular y 300x226 en computador, los dos caben en la columna sin recortes ni desbordes; las 4 pestañas pintan sus tarjetas.

**Trampa que me mordio al editar** (para la proxima): `str.find` devuelve -1 cuando no encuentra, y Python lee ese -1 como "empieza por el final". Un corte `s[:i] + s[j:]` con la j mal calculada se llevo TODO el resto del archivo sin quejarse. Los cortes por marcador van entre dos marcadores firmes y con `assert 0 < i < j`.

## 166. Elegir los destacados y subir la publicidad (16-ago) — pestaña "Que ve el cliente"
Lo que estaba pendiente desde las entradas 157 y 158: hasta hoy los tres destacados se escogian solos y la publicidad se metia a mano en la base.

**LOS TRES DESTACADOS** — columna nueva `tenants.web_destacados` (jsonb, lista de ids EN ORDEN, maximo 3).
- **Una lista de ids y no una marca en `pos_products`** porque el ORDEN importa (son tres puestos y el primero es el que mas se mira) y una columna booleana no guarda orden. Ademas asi el limite de tres vive en un solo sitio.
- **VACIO SIGUE SIENDO AUTOMATICO**: un restaurante que nunca entre aqui sigue viendo su pagina llena igual que hoy. Y si elige uno solo, los otros dos puestos se llenan solos — asi la pagina nunca queda a medias por dejar un puesto sin escoger.
- **La lista se guarda con los huecos incluidos**: si se guardaran solo los llenos, quitar el primero correria los otros dos de puesto sin que nadie lo hubiera pedido.
- **El mismo plato no puede estar dos veces**: al ponerlo en un puesto se quita del otro. Repetido se ve como un error del sistema.
- **En el buscador van primero los que TIENEN foto**: un destacado sin foto se ve como un hueco gris en la pagina, que es peor que no destacar nada.
- **Si eligio algo que despues borro o agoto, se avisa AQUI**: en la pagina del cliente ese puesto se rellena solo y el dueño no se enteraria nunca.
- `fn_web_publica` devuelve `destacados` y `app-cliente.js` los respeta.
- **Comprobado con la funcion de verdad de la pagina**: con tres elegidos salen exactamente esos tres en ese orden (incluidas bebidas, que el automatico excluye a proposito — prueba de que manda la eleccion); con uno elegido sale ese y dos rellenados; con ninguno, todo automatico como siempre. La base quedo como estaba.

**LA PUBLICIDAD** — sobre `pos_promos`, que ya existia pero no la manejaba ninguna pantalla.
- Subir, encender/apagar, reordenar y quitar. La imagen se ve ANCHA en la lista, como se va a ver en la pagina: una miniatura cuadrada engaña sobre como queda de verdad.
- **La imagen se encoge a 1.400 px ANTES de subirla y va al almacen** (`chat-media/promos/<tenant>/`), nunca a la base: una foto de 2 MB dentro de una fila tumba las consultas de la pagina. Mismo criterio que las fotos de producto.
- **Al quitar una promo la imagen se queda en el almacen** a proposito: borrarla es lo unico que no tiene vuelta atras y ocupa muy poco. La fila si se va.
- RLS de `pos_promos` ya permitia todo al dueño (`current_tenant_id() = tenant_id`), no hubo que tocar permisos.
- **La vista previa se recarga** despues de cada cambio, asi que se ve el efecto de una vez.
- **PENDIENTE**: las dos promos que hay ("Imagen de prueba 1 y 2") son marcadores de posicion que puse yo; Sergio ya las puede quitar desde la pantalla.

## 167. Apertura de caja: tres fuentes que SE SUMAN (16-ago) — caja + pos_sessions.apertura_detalle
El modal de apertura pedia un solo numero. Ahora la base se arma de tres sitios y **se suman, no se excluyen**:
- **Poner el valor** — la plata que mete el cajero.
- **Hacer arqueo** — cuenta billete por billete lo que hay.
- **Base que quedo** — lo que se conto en el ULTIMO CIERRE, marcando por denominacion que deja y que saca.

**El caso que pidio Sergio**: dejo $100.000 de mi bolsillo, me quedo con las monedas de ayer y saco todos los billetes → base $121.700.

- **Primero lo hice excluyente y estaba mal.** Sergio dijo "interruptores" y yo entendi tres opciones donde solo una manda; lo que queria era que se sumaran. Se rehizo.
- **El total va FIJO entre el cuerpo y los botones**, con el desglose en chips ("Pusiste $100.000 · Ya estaba $21.700"). Con tres fuentes nadie las suma de cabeza, y abrir con la base equivocada descuadra el cierre de todo el dia. Sergio: "lo bueno es que ahi esta el total, ahi me avisa".
- **Cada pestaña muestra su aporte con un `+`** en la propia pestaña: se ve cuales estan sumando sin entrar a ninguna.
- **Todo viene marcado de entrada** en la base que quedo: lo normal es dejarla como estaba y quitar lo que uno saco. Al reves obligaria a marcar diez casillas cada mañana.
- **"Lo que no marcaste sale del cajon"** vive dentro de esa pestaña, porque solo aplica a esa parte: lo que se pone a mano o se cuenta no "sale" de ningun lado.
- **NO se avisa del doble conteo** (contar un billete en el arqueo Y dejarlo marcado en la base). Decision de Sergio: el total es el aviso.
- **Si el ultimo cierre no se conto** no hay desglose. La pestaña queda visible pero vacia, con "El ultimo cierre no se conto": esconderla haria pensar que se daño. En ese caso arranca en la primera pestaña.
- **COLUMNA NUEVA `pos_sessions.apertura_detalle`** (jsonb): de donde salio cada peso. `opening_cash` guarda el total, que es lo que necesita el cuadre, pero al ver "$121.700" mañana nadie sabria si el cajero puso plata suya o si venia del cajon — y esa es justo la pregunta cuando algo no cuadra.
- **Probado ejecutando la pantalla de verdad** (caja.html + caja.css + caja.js) con el ultimo cierre real: solo monedas $21.700; +$100.000 a mano = $121.700; +2 billetes de $50.000 contados = $221.700; al cambiar de pestaña no se borra nada; "sale del cajon $553.000". Y el caso sin arqueo previo. La caja no se toco.

## 168. La pagina de clientes se instala con el logo del restaurante (16-ago)
- **Correccion mia**: dije que la pagina "no se podia instalar" y no es cierto — cualquier pagina se agrega a la pantalla de inicio, y Sergio ya lo habia hecho. Lo que faltaba (y es lo que agrega el manifest) es que quede con SU logo y SU nombre, y que abra SIN la barra del navegador en vez de como una pestaña.
- **El manifest y los iconos van en la carpeta del restaurante**, no en la raiz: la pagina es la misma para todos pero el icono no. A El Parche le queda el logo de El Parche; el dia que entre otro, pone el suyo en su carpeta y no se toca nada compartido.
- **NO comparte NADA con el .exe ni con el APK**: el icono del ejecutable va incrustado en el binario al compilar y el del APK en los recursos de Android. Son tres mecanismos que no comparten un solo archivo, cambiar uno no puede afectar a los otros.
- **Cuatro iconos, no uno**: 192 (Android), 512 (pantalla de bienvenida), 180 (**iPhone IGNORA el manifest** para el icono de inicio y necesita `apple-touch-icon` aparte) y uno "con mascara".
- **El de mascara importa mas de lo que parece**: Android recorta el icono en circulo o en cuadrado redondeado segun el celular. Va con el logo al 75% para que el recorte no le muerda el borde. **Ese 75% se midio, no se eligio a ojo**: se calculo el radio real de los pixeles que no son fondo. Primero lo medi sobre el archivo ORIGINAL y me dio 538 de 767 — falso, porque el original tiene un degradado en las esquinas que el umbral leia como contenido. Medido sobre el archivo YA GENERADO da 178 px contra el limite de 205 de Android: cabe con holgura.
- El logo salio del que ya estaba guardado en el almacen (757x767, la version buena; la que usa la pagina hoy es de 256). El fondo del margen se toma de la propia imagen para que no se vea el pegue.
- **Service worker (que funcione sin internet): APLAZADO a proposito** (decision de Sergio). Es lo que mas se puede dañar y cachear mal deja a los clientes viendo precios viejos. Instalable primero.

## 169. Instalar la pagina y las notificaciones (16-ago) — sw.js + web-acceso v15
**EL PASO A PASO PARA INSTALAR.** Android y iPhone NO se instalan igual, y por eso es una pantalla y no un boton:
- **Android** avisa al navegador que la pagina se puede instalar (`beforeinstallprompt`). Se FRENA el aviso propio del navegador (una barrita fea abajo) para mostrar el nuestro, que explica PARA QUE sirve, con un boton que instala de una.
- **iPhone** no tiene esa señal ni ese boton: hay que decirle a la persona "toca Compartir → Agregar a inicio". Un boton que no hace nada seria peor que no ponerlo.
- **Chrome en iPhone NO puede instalar** (solo Safari). Ahi no se ofrece nada: dejarlo intentando seria peor.
- **Se ofrece cuando la persona YA ESTA ADENTRO**, a los 2,5 s, no al abrir: al abrir todavia no sabe que es esto y lo cierra sin leer.
- **Un "ahora no" se respeta 7 dias.** Nunca mas seria perder a quien lo cerro sin leer; cada visita es acoso. Si dice que no al cuadro del propio navegador, se respeta igual.

**LAS NOTIFICACIONES.** Sergio las pidio al abrir por primera vez la app instalada.
- **NO se puede pedir el permiso sin poder mandar nada**: el navegador da UNA sola oportunidad de verdad, y si el cliente dice que no, no hay forma de volver a preguntar desde la pagina. Pedirlo "para despues" seria quemarlo.
- Para mandar notificaciones hace falta un service worker — que es justo lo que habiamos aplazado. **La salida: un service worker SOLO de notificaciones, SIN cache.** El riesgo que Sergio queria evitar era el cache (un cliente viendo precios de hace tres dias sin enterarse). `sw.js` **no tiene un `fetch`**, asi que no guarda nada: todo sigue yendo a la red. El dia que se quiera funcionar sin internet, esa es OTRA decision y se agrega con cuidado — no se cuela por la puerta de atras.
- **Se pide despues de explicar para que son**, con una pantalla propia. Un cuadro del sistema que salta de la nada casi siempre se cierra con "Bloquear".
- **Solo con la app YA INSTALADA**: en iPhone las notificaciones web solo existen instalada. Y un "ahora no" NO le pregunta al navegador, asi el permiso queda intacto y se puede volver a ofrecer a los 14 dias.
- **El ayudante se registra siempre que se pueda**, aunque no haya permiso: registrarlo tarda, y hacerlo justo cuando el cliente dice "sí" dejaria el permiso concedido y la suscripcion a medias.
- **Tabla nueva `pos_web_push`** con la "direccion de entrega" de cada celular. La llave es el `endpoint`: el mismo celular no queda dos veces. Llaves VAPID generadas y guardadas como secretos (`VAPID_PUBLIC/PRIVATE/SUBJECT`); la publica va en la pagina y no sirve para enviar.
- Nueva accion `push-suscribir` en web-acceso (v15). `sbPost` acepta ahora un `Prefer` extra, que es lo que necesita PostgREST para un upsert.
- **FALTA EL QUE ENVIA**: hoy se guarda a quien avisarle, pero nada manda todavia. Los suscriptores se van acumulando desde ya, asi que cuando se construya el envio ya hay a quien mandarle.
- **Probado pintando los tres modales con el codigo de verdad**: variante Android (boton Instalar), variante iPhone (3 pasos, sin boton falso) y la de notificaciones.

## 170. La pantalla de entrar no se mueve (16-ago)
Pedido de Sergio al empezar a pulir la app instalada: en la pantalla de entrar, que la pagina quede quieta. Que rebote al arrastrarla es lo que mas delata que una app instalada es en realidad una pagina web.

- **El bloqueo se pone y se quita en `pinta()`**, no en cada pantalla: hay CINCO pantallas de entrada (telefono, codigo, clave, registro, recuperar) y la que se olvide se queda rebotando. Se reconoce por la clase `ep-login` del propio HTML que se esta pintando — una bandera aparte se puede desincronizar de lo que se pinta; la clase ES lo que se pinta.
- `overscroll-behavior: none` mata el rebote elastico, y `touch-action: pan-x` mata el "arrastrar para recargar" de Android, que en una pantalla de entrar no tiene sentido y borra lo que la persona iba escribiendo.
- **`100dvh` y no `100vh`/`100%`**: `dvh` es el alto REAL de la pantalla del celular. Con los otros, la barra del navegador queda contada de mas y sobra un pedazo que se puede arrastrar — justo lo que se queria quitar.

**EL ERROR QUE COMETI Y NO SE VE MIRANDO.** Primero puse a `.ep-login` como el que se desplaza. No sirve: `.ep-login` CRECE con su contenido, asi que nunca le sobra nada que desplazar. El que recortaba a la altura de la pantalla era `#app`, con `overflow:hidden` — o sea que **con el teclado abierto, la contraseña y el boton de Entrar quedaban debajo del corte y no habia forma de llegar a ellos.** Un cliente en un celular pequeño no habria podido entrar.
- Lo encontre midiendo el caso a proposito: pantalla de 360x420, que es lo que queda cuando se abre el teclado. Salio `botonAlcanzable: false`.
- **Arreglado**: el que se desplaza es `#app`. Mientras todo quepa —lo normal— no hay nada que desplazar y la pantalla queda quieta; solo si el teclado la aprieta, `#app` cede.
- **Verificado en los tres casos**: celular normal (375x812) la pagina no se mueve y arrastrar la deja en 0; con teclado (360x420) el boton y la contraseña SI se alcanzan y el telefono no queda cortado por arriba; y al entrar se quita la clase y todo vuelve a desplazarse normal.

## 171. Paco entiende "puedo pasar por ella" (16-ago) — delay-reply v300
Dos clientes reales (573203254914 y 573137734417) dijeron que iban a recoger y Paco les siguio pidiendo la direccion. Sergio tuvo que entrar a atender las dos conversaciones a mano.

**La causa NO era el mecanismo, era el reconocedor.** `LLEVAR_REGEX` solo contemplaba el verbo CONJUGADO —"paso", "recojo", "vamos"— y la gente usa el INFINITIVO:
- *"Cuanto seria y a que horas puedo **pasar** por ella"* → no lo reconocia
- *"para **pasar a recogerlo**"* → tampoco
- *"Sin domicilio"* → tampoco

El resto del camino estaba bien: cuando el reconocedor acierta, la 14e-PRE guarda el mensaje como direccion y el clasificador lo lee como "para_llevar". Solo habia que ver mas formas.

- **La lista dejo de ser una linea de 900 caracteres** y paso a ser un arreglo con un ejemplo real por renglon. Con una sola linea nadie ve lo que falta — por eso llevaba meses cojo.
- **Se agregaron**: infinitivos con modal ("puedo/quiero pasar, ir, recoger"), "pasar a recogerlo", "recogerlo/buscarla" con el pronombre pegado, "sin domicilio", "no es/seria domicilio", "no necesito domicilio".

**EL FALSO POSITIVO QUE CASI METO.** Puse `reclamar` suelto y el banco lo cazo: marcaba como "recoger" las frases de PUNTOS — *"quiero reclamar mi premio"*, *"¿que puedo reclamar con mis puntos?"*. O sea que a un cliente que pedia A DOMICILIO se le habria caido el domicilio por preguntar por sus premios, y se quedaba esperando una comida que nadie iba a llevar. **Ahora `reclamar` solo cuenta pegado a un verbo de moverse ("paso a reclamarlo") o nombrando el pedido ("reclamar mi pedido").** Se pierde "¿a que horas lo puedo reclamar?", que es ambiguo de verdad — preferible perder ese que convertir un domicilio en recoger.

- **Banco de casos nuevo**: 27 frases que DEBEN dar recoger y 23 que NO (direcciones reales, pedidos a domicilio explicitos, y las de puntos). **50/50.** La lista de las que NO importa mas: que falte una forma se ve y se corrige; que sobre se descubre cuando el cliente reclama que nunca le llego.
- **Verificado en el banco repitiendo las DOS conversaciones reales** + una de control con domicilio de verdad. Katerine: antes volvia a pedir la direccion, ahora dice "Domicilio: Para llevar · Total: $35.000" y sigue al nombre, con la adicion de maicitos capturada. Adriana: pasa al nombre. Control: la direccion real se extrae bien y NO se toma como recoger. Conversaciones de prueba borradas.
- **Trampa repetida (tercera vez)**: editar estas expresiones desde un script de Python entre comillas se rompe por las capas de escape. Se hizo con edicion directa del archivo.

## 172. La comanda de Paco sale igual que la de la caja (16-ago) — delay-reply v301 · verify-transfer v38
Sergio: los pedidos de Paco imprimian "una palabra salchipapa" y los de siempre no.

**Lo que pasaba, visto en los datos reales de estos 4 dias:**

| Origen | Como salia |
|---|---|
| Caja (salon / rapido) | `Personal · Premium · Mixta` |
| Paco (domicilio) | `Salchipapa Premium · Familiar · Mixta` |

Dos formatos en la misma pila de comandas. Paco anteponia el TIPO DE COMIDA y ponia la presentacion despues; la caja pone la PRESENTACION primero.

- **No es que Paco estuviera mal en todo**: "Salchipapa Premium" esta bien para el MENSAJE al cliente por WhatsApp, porque el cliente no se sabe el menu de memoria. Estorba en la comanda, donde la cocina lee de un vistazo y lo primero que necesita es el TAMAÑO. Por eso el cambio es SOLO en el nombre del item del pedido; el resumen del chat se queda como estaba.
- **Funcion nueva `nombreComanda`**, con la formula copiada a proposito de `domicilios.js` y `chat-ia.js`: presentacion primero; si el producto no tiene presentacion con nombre, el alias de comanda de la categoria (o su nombre); despues el producto y las variantes.
- **Los DOS caminos de Paco crean items** (delay-reply cuando toma el pedido y verify-transfer cuando verifica la transferencia). Se toco en los dos: arreglar solo uno habria dejado la mitad de las comandas distintas — el patron de siempre, caminos hermanos donde solo uno esta completo.
- **Hubo que ampliar el select**: ninguno de los dos traia `comanda_alias` de la categoria, que es lo que usa la caja cuando la presentacion no tiene nombre.
- **Retirado `nombreConCategoriaVT`**, que quedo sin uso. Dejar codigo muerto invita a volver a llamarlo y revivir el formato viejo.

**Verificado sobre el catalogo REAL entero, no con dos ejemplos**: se recorrieron las 111 combinaciones de producto x presentacion x variante y se exigio que la formula de Paco y la de la caja dieran la MISMA cadena. **111 de 111 iguales.**

## 173. Paco ya no dice "$0" (17-ago) — delay-reply v302
Cliente real (David, 573206960995): pregunto por la Premium y Paco contesto **"Premium cuesta: familiar $0 y personal $0"**. Sergio tuvo que tomar la conversacion.

- **Causa**: `precioPuntual` solo leia el precio de la PRESENTACION. En productos como la Premium el precio no vive ahi sino en la VARIANTE (carne / pollo / mixta, con un precio por tamaño en `prices[]`). Las presentaciones estan en 0 a proposito — es un dato interno de como esta armada la carta — y Paco lo dijo tal cual.
- **Arreglo 1 — leer el precio de donde vive**: si la presentacion viene en 0, se busca en las variantes. Si el cliente NOMBRO la variante ("premium carne"), se usa la suya y el precio es exacto; si no la nombro y todas valen igual, tambien se dice; si valen distinto, no hay un precio que decir.
- **Arreglo 2 — candado de nunca-$0**: un precio en cero no se dice JAMAS. Se devuelve null y el flujo normal sigue (pregunta el tamaño o la variante, que es justo lo que falta para poder decirlo). Y si en la lista de tamaños alguno queda sin precio, no se dice ninguna: decir dos de tres se lee como que el tercero no existe.
- **Regla de Sergio que esto implementa**: el precio solo se dice cuando se conocen variante Y presentacion (o cuando de verdad es unico).
- **Verificado en el banco** con el catalogo real: "premium carne personal" → $29.000 exacto; "la premium" a secas → ya no hay $0 (pasa al flujo que pregunta tamaño); coca cola 1.5 → $8.000 (lo viejo sigue); "super queso" → pregunta la categoria (habia tres). Conversaciones de prueba borradas.
- **Limite conocido, anotado**: al preguntar "cuanto vale la premium" sin variante, la rama de la CUENTA (otra distinta) responde "Pedido: $28.000" usando un precio por defecto. No es $0 y no es la rama de este bug, pero tampoco cumple la regla al 100%%. Va con el trabajo del extractor multi-producto.

## PENDIENTE PARA MAÑANA (17-ago, decidido con Sergio): extractor multi-producto
El caso de Emily (entrada del chat 573104031460): pidio 3 salchipapas Y una gaseosa EN EL MISMO MENSAJE. El extractor solo devuelve UN producto por mensaje: la gaseosa cayo en "adiciones", ninguna salchipapa la admite, se descarto en silencio y el total salio $8.000 corto. Sergio corrigio a mano.
- **Ya hecho hoy** (v302, dos redes de seguridad): si algo cae en "adiciones" pero es un producto de la carta, se agrega como linea aparte; y el aviso de "no se pudo" ya no afirma "no va en el pedido" sino que pregunta cual quiere y avisa que NO esta en el total.
- **Lo de fondo**: que el prompt de extraccion devuelva una LISTA de productos. Es la pieza mas delicada de Paco — hacerlo con el banco de 54 pedidos al lado, con calma, no en horario de atencion.

## 174. Pantalla de entrar: "registrarme" y "olvide mi contraseña" separados (17-ago)
Pedido de Sergio: el boton unico "Es mi primera vez · Olvide mi contraseña" confundia — el cliente nuevo no se siente aludido por "contraseña" y el que la olvido no esta "empezando". Cada quien debe encontrar SU boton.
- **Por dentro siguen siendo el mismo camino** (mandar codigo por WhatsApp; el servidor ya distingue solo si el numero es cliente): separar NO duplico logica, solo la entrada. Un `porCodigo(mensaje)` comun y dos botones que solo cambian el mensaje que acompaña al codigo — "¡Bienvenido! ... para crear tu cuenta" vs "Tranquilo... para crear una contraseña nueva".
- Verificado en la vista con el codigo real: dos botones en columna con aire entre ellos.

## 175. PROPUESTA en revision: el inicio de la pagina en CELULAR (17-ago, esperando el visto bueno de Sergio)
Maqueta mostrada y en revision. **Nada implementado todavia.** Solo para pantalla pequeña — el computador no se toca:
1. **Una sola billetera**: hoy el saldo y los puntos salen DOS veces apilados (resumen + Mi billetera). Se unen en una tarjeta con saldo|puntos lado a lado y los botones Pedir ahora / Recargar.
2. **El nivel en una linea delgada** bajo el nombre (mas compacto, mismo contenido).
3. **La publicidad en franja** baja de tamaño (el cuadro grande se comia media pantalla).
4. **"Para hoy" deslizando de lado** (carrusel) en vez del cuadro 2x2, que deja tarjetas diminutas en 360px. El mensaje se resume en "Ver la carta →".
5. Historial compacto igual al actual.
6. **"Tu actividad" reducida a tarjetita** con mini-grafica.
Decisiones pendientes de Sergio: (a) ¿carrusel o columna vertical en Para hoy? (b) ¿Tu actividad resumida o fuera del celular?

## 176. Paco prometio un resumen que nunca llego (caso Kevin, 17-ago) — delay-reply v303
Cliente real (573114015448): mando el pedido en formato de plantilla (PEDIDO / Direccion / Telefono), respondio "Ahi esta bien" al upsell, y Paco contesto "Con mucho gusto, en un momento te envio el resumen de tu pedido" — y ese resumen NUNCA salio. Sin resumen, sin pedido creado; Sergio tomo la conversacion.

**CUATRO causas encadenadas, encontradas con el chivato en el banco** (marcar cada punto de envio con un numero «S39», «S44»... porque el panel de registros estaba caido):
1. **"AHI esta bien" no cerraba el upsell.** La lista de rechazo conocia "asi esta" pero el cliente escribio AHI — error de dedo comunisimo. El upsell quedaba sin contestar y el turno caia al modelo. Se agregaron las formas genericas ("ahi esta bien", "esta bien", "todo bien", "ya con eso"...), seguras porque esa lista SOLO se consulta cuando el paso actual es el upsell.
2. **"Telefono" quedo guardado como el NOMBRE del cliente.** La plantilla trae renglones-etiqueta ("Direccion", "Telefono") y el extractor tomo uno como nombre — Paco nunca pregunto el nombre. Regla nueva `ETIQUETA_PLANTILLA_RE` en las dos vias de extractNombre.
3. **La entrega era a un LOCAL comercial ("local Crazy Ice")** → lugar publico → prepago → el efectivo se anula (regla de Sergio, correcta). Pero el mensaje que lo explica se le pedia AL MODELO... y el modelo prometio el resumen en vez de explicar el prepago. **Ahora es frase fija** (configurable `frases.publico_efectivo`), la misma leccion del 14i-bis y de llevar_efectivo: un mensaje critico del flujo no se le encarga a una moneda al aire.
4. **Regla nueva en el prompt**: el modelo tiene PROHIBIDO prometer acciones ("en un momento te envio el resumen", "ya creo tu pedido") — el resumen y el pedido los manda el sistema, no el.

- **Verificado en el banco** con la conversacion real: plantilla completa → "Ahi esta bien" avanza → pregunta el nombre (ya no "Telefono") → frase fija del prepago → "por transferencia entonces" → RESUMEN de verdad con total. Regresion: casa normal en efectivo sigue igual (resumen con $36.000, efectivo permitido).
- **Metodo nuevo para el banco**: cuando no se sabe que rama contesto, se numeran los 45 puntos de envio («S1»...«S45») en la copia del banco y cada mensaje sale firmado. Dos intentos previos con un envoltorio de funcion tumbaron el banco con BOOT_ERROR — la concatenacion simple no puede romper nada.

## 177. La version celular de la pagina, segun el handoff (17-ago)
Sergio trajo el handoff "VERSION CELULAR" (El Parche Food (8).zip). Al compararlo contra lo construido, **casi todo ya coincidia**: barra inferior de 5 pestañas con safe-area, lateral oculto, carta a 2 columnas, barra de carrito pegajosa, muescas en 150x54 y 64x64, aura en el body, tema claro. Las diferencias reales eran CUATRO y se implementaron:
1. **Badge dorado del carrito** (17px) sobre la pestaña Carta — solo aparece con algo adentro; un "0" permanente es ruido.
2. **Flecha de atras en las pantallas internas** (38px circular), con el encabezado interno pegajoso y degradado hacia transparente, y titulo compacto (16px). SOLO en el celular: en el computador ya esta el menu lateral y una flecha seria un segundo camino para lo mismo. Atras: del carrito se vuelve a la CARTA (para seguir agregando); de lo demas, al inicio.
3. **La pildora del nivel pierde la etiqueta "Tu nivel"** en el celular (handoff): en 360px cada palabra compite con la barra.
4. **Los destacados vuelven a ser 2x2 de verdad** en el celular, con el mensaje como PRIMERA CELDA. Antes el mensaje ocupaba la fila entera: mas scroll y el mensaje gigante.
- **NOTA**: la propuesta de la entrada 175 (carrusel, billetera unificada) queda SUPERSEDIDA por este handoff — el diseño de Sergio mantiene el 2x2 y las dos tarjetas. No implementar la 175.
- **Medido en 390px**: 2 columnas con el mensaje a media fila, flecha visible, etiqueta oculta, badge 17x17, encabezado pegado al hacer scroll, sin desborde. Y en 1280px todo lo nuevo desaparece: flecha oculta, etiqueta visible, pestañas ocultas, encabezado normal.
- Pendientes del handoff que NO dependen de codigo: fotos reales de platos/promos y confirmar horarios.

## 178. La barra de abajo salia BLANCA en modo oscuro + la app se arrastraba de lado (17-ago)
Dos fallas del celular reportadas por Sergio.

**1. LA BARRA BLANCA SOBRE LA APP OSCURA — el error de fondo.** Quince reglas del tema claro estaban escritas asi:
`html.tema-claro .ep-tabs, html:not(.tema-oscuro) .ep-tabs { background: rgba(255,255,255,.9) }`
...y **SUELTAS, sin media query**. `html:not(.tema-oscuro)` es cierto cuando el cliente NO ha elegido tema (modo automatico, que es el de casi todos), asi que esas reglas se aplicaban SIEMPRE — incluso con el celular en oscuro. Los TOKENS si estaban bien puestos dentro de `@media (prefers-color-scheme: light)`; las reglas de color no. Resultado: fondo oscuro (token correcto) con barra blanca (regla suelta).
- **Arreglo**: cada regla se partio en dos — la variante `.tema-claro` (eleccion explicita) se queda donde estaba, y la variante `:not(.tema-oscuro)` (automatica) se movio DENTRO del mismo media query que los tokens. 15 reglas (12 de una linea + 3 bloques). **Cero sueltas al terminar** (comprobado).
- Afectaba tambien a los platos, el boton principal, las acciones, la barra del carrito, los chips y los mensajes: todos se veian en version clara sobre la app oscura.

**2. LA APP SE ARRASTRABA DE LADO.** Se desfasaba unos pixeles y se podia correr en horizontal — lo que delata a una pagina web disfrazada de app.
- `overflow-x: clip` en html y body, **no `hidden`**: `hidden` en el `<html>` convierte al body en contenedor de desplazamiento y **rompe el `position: sticky`** del encabezado interno y de la barra de abajo. `clip` recorta sin crear ese contenedor. (Comprobado: los dos siguen sticky despues del cambio.)
- `overscroll-behavior-x: none` (sin rebote lateral) y `touch-action: pan-y` (solo gesto vertical). A los chips de categoria se les devuelve `pan-x`, que si necesitan el suyo.
- `max-width: 100%` + `min-width: 0` en app/cuerpo/scroll: ningun hijo puede empujar el ancho.
- **Sin zoom**: `maximum-scale=1, user-scalable=no` en el viewport.
- **Medido en 390px**: desborde 0 en html y body, e intentar arrastrar 300px deja la pagina en 0. Los chips que sobresalen son los de su propio carrusel, correcto.

**Verificado en los CUATRO escenarios**: oscuro forzado (barra oscura), automatico+sistema oscuro (barra OSCURA — era el bug), automatico+sistema claro (barra clara), y claro forzado. Y el encabezado y la barra siguen pegajosos.

## 179. La cabecera del celular: logo · saludo · foto, y el menu de la cuenta (17-ago)
Pedido de Sergio. En el celular la cabecera queda: **logo del restaurante a la izquierda · saludo al lado · foto del cliente a la derecha**, y **tocar la foto abre un menu** con Mi perfil, cambiar de tema y cerrar sesion.

- **El logo solo en el celular**: en el computador ya vive arriba del menu lateral y repetirlo seria ruido.
- **El boton del tema SALE de la cabecera en el celular** y pasa a ser una opcion del menu. Dos formas de hacer lo mismo, una al lado de la otra, solo gastaban el ancho que en 390px hace falta para el saludo. En el computador se queda como estaba.
- **La foto ya no lleva directo al perfil, abre el menu** — pero "Mi perfil" es la PRIMERA opcion, asi que no se pierde el camino de antes. Lo que se gana es que el tema y cerrar sesion por fin tienen donde vivir en el celular: el menu lateral, que es donde estaban, no existe ahi.
- El menu muestra arriba la foto y el nombre del cliente: se abre desde SU foto, y verse confirma que las opciones son de su cuenta. "Cerrar sesion" va en rojo y separada — es la unica sin vuelta atras.
- Se pinta al vuelo y se quita al elegir o al tocar fuera; un segundo toque en la foto tambien lo cierra.

**REFACTOR NECESARIO — `irA(k)`**: la navegacion vivia EN LINEA dentro del enganche de `[data-ir]`, y el menu se pinta al vuelo (no pasa por `enganchar`). Copiar esas lineas en el menu habria sido exactamente el patron que mas caro nos ha costado — dos caminos que se desincronizan. Se extrajo a `irA(k)` y ahora la usan las pestañas Y el menu.

- **Medido en 390px**: logo 40x40 pegado al borde (18px), saludo despues (70px), foto a la derecha (termina en 372 de 390), boton de tema oculto, menu de 232px pegado a la derecha con las tres opciones y el nombre. Sin desborde. **En 1280px**: logo oculto y boton de tema visible — el computador quedo identico.

## 180. La barra de nivel se cortaba a la derecha (17-ago) — la regla que nunca pudo cumplirse
Sergio: la barra de experiencia quedo a la derecha y cortada; debe ir en el medio, y la foto de ultima.

**LA CAUSA, y llevaba ahi desde siempre**: existia una regla para bajar la barra a su propia fila en el celular —`.ep-rangob { order: 3; flex-basis: 100% }`— pero `.ep-saludo` **NO tenia `flex-wrap`**. Sin envolver, `flex-basis: 100%` no baja nada: la barra se apretaba entre el saludo y la foto y se partia. **Cero `flex-wrap` en todo el archivo** (comprobado). La regla estaba escrita y no podia cumplirse; el logo nuevo solo la dejo en evidencia.

- **Arreglo 1**: `flex-wrap: wrap` en `.ep-saludo`.
- **Arreglo 2**: el corte estaba en **560px**, pero con el logo a la izquierda ya no cabe en NINGUN celular. Se subio a **899px**, igual que el resto de las reglas de celular.
- **Arreglo 3 (peticion de Sergio)**: orden explicito — logo (0), saludo (1), botones/foto (2) con `margin-left:auto`, barra (3) en su fila. La foto queda de ultima en su fila pase lo que pase.

**Medido en los tres tamaños**: en 390px la barra baja a su propia fila y ocupa los 354px completos, la foto termina en el borde derecho, cero piezas cortadas; en 360px igual (324 de 324); y en 1280px la barra **sigue en el medio**, entre el saludo y la foto, con su etiqueta "Tu nivel" — el computador quedo identico.

## 181. El saludo del celular en UNA linea: "Hola, Sergio" (opcion B de Sergio, 17-ago)
Sergio: el saludo quedaba raro, no cabia todo. Se le mostraron tres propuestas y eligio la **B**.
- **El problema medido**: en 390px, entre el logo (38) y la foto (40), al saludo le quedan ~270px. Dos lineas ahi dejaban el nombre en 19px y la cabecera alta.
- **La B**: una sola linea, "Hola, " + primer nombre, a 20px. El "Buenas noches/tardes" desaparece SOLO en el inicio (en las pantallas internas esa misma casilla lleva el nombre del restaurante, que ahi si sirve). En el COMPUTADOR se conserva el saludo por hora encima del nombre (26px): alli sobra ancho.
- El "Hola," va en su propio span y **el nombre se escribe UNA sola vez**: dos versiones del mismo texto se desincronizan el dia que alguien cambie una.

**DOS TROPIEZOS DE FLEXBOX, encontrados midiendo (no mirando):**
1. `.ep-saludo-tx` sin `flex` crecia con el contenido: un nombre largo medía 269px y **la FOTO se caia a una segunda fila** (medido con "Maria Fernanda Restrepo" en 360px: tops 25 vs 72).
2. Poner `flex: 1 1 auto` **no basto**: con `flex-wrap` activo el navegador decide partir la fila mirando el tamaño NATURAL del contenido, ANTES de intentar encogerlo. Hizo falta `flex: 1 1 0` (base cero) para que la casilla nunca fuerce el salto.
- El logo y la foto llevan `flex-shrink: 0`: son de tamaño fijo y no ceden.
- **Verificado**: en 390px "Hola, Sergio" en una linea de 20px, cabecera de 143px, foto en el borde (372/372); con nombre largo en 360px se recorta con puntos, no pisa la foto y la foto sigue en su fila; en 1280px el saludo por hora vuelve, el nombre a 26px y la barra en el medio — el computador identico.

## 182. "El local" en el menu de la cuenta (17-ago)
Sergio no la encontraba en el celular. **SI existia** —esta en los cuatro botones del final del Inicio (Pedir · Recargar · Redimir · El local)— pero ahi hay que bajar hasta abajo para verla, y en el celular no hay menu lateral. Se agrego al menu de la foto, que es donde uno la busca.
- Orden del menu: **Mi perfil · El local · Modo claro/oscuro · Cerrar sesion**. Sigue tambien en los botones del inicio: es un atajo mas, no un reemplazo.
- **Trampa evitada**: el enganche usaba `cap.querySelector('[data-mir]')` —singular—, que solo agarra el PRIMERO. Con dos opciones de navegacion, "El local" habria quedado muerta (se ve pero no hace nada). Cambiado a `querySelectorAll` con el destino leido de cada boton.
- **Probado ejecutando el menu de verdad** con un DOM de mentira: las 4 opciones enganchadas, cada una lleva a su sitio (perfil, local, tema, salir) y el menu se cierra las 4 veces.

---

## 177 — PWA clientes: la barra de abajo y el boton del pedido, fijos de verdad (17-ago-2026)

**Lo que Sergio vio (tres cosas, la misma causa):**
1. El boton "Ver mi pedido" aparecia "muy abajo": habia que bajar hasta el final
   de la carta para verlo, cuando su gracia es estar siempre a la vista.
2. La barra de pestanas se dejaba arrastrar al llegar al maximo de scroll.
3. Arriba pasaba lo mismo: la pantalla se estiraba mas alla de su limite.

**Causa raiz.** Los dos elementos eran `position: sticky`, y sticky solo pega un
elemento MIENTRAS su sitio natural esta a la vista — no lo saca del flujo:
- `.ep-cartbar` se genera al FINAL de `cuerpoCarta()`, asi que su sitio natural
  esta despues del ultimo plato: hasta no llegar ahi, no hay nada que pegar.
- `.ep-tabs` llegaba a su sitio natural justo al final del documento, y ese
  ultimo tramo se movia con el scroll.
- El punto 3 era otro asunto: `overscroll-behavior` estaba puesto solo en el eje
  X (`overscroll-behavior-x: none`), asi que el rebote elastico vertical seguia
  vivo.

**Arreglo (solo en celular, `@media (max-width: 899px)`; en escritorio la barra
de pestanas no existe y el boton se queda sticky como estaba):**
- `.ep-tabs` → `position: fixed; left/right: 0; bottom: 0`.
- `.ep-cartbar` → `position: fixed`, anclado 12px por encima de la barra.
- Variable `--barra-alto: calc(56px + env(safe-area-inset-bottom))`, usada por
  los dos, para que no haya numeros sueltos que se desincronicen.
- Al volverse fijos dejan de ocupar lugar: `.ep-scroll` compensa con
  `padding-bottom`, y con `:has(.ep-cartbar)` reserva mas cuando el boton
  flotante esta presente, para que el ultimo plato nunca quede debajo.
- `overscroll-behavior: none` (los dos ejes) — de paso quita el "arrastrar para
  recargar" de Android, que en una app instalada se siente a pagina web.

**Verificado midiendo** (no a ojo) sobre el CSS real en 390x760, 360x640 y
1280x820: el boton se ve sin hacer scroll; queda 13px arriba de la barra sin
taparla; en el maximo de scroll la barra no se mueve ni un pixel y el ultimo
plato termina 20px antes del boton; cero desborde horizontal; escritorio
identico a antes (pestanas ocultas, boton sticky).

---

## 178 — El orden de las categorias se arrastra (17-ago-2026)

**Lo que pidio Sergio.** Poder arrastrar las categorias en Cobra para decidir en
que orden aparecen, porque en la pagina del cliente lo primero que salia era
*Adiciones* y ahi no se quiere empezar.

**Lo que ya estaba y nadie usaba.** `pos_categories.sort_order` existe hace
tiempo y `fn_web_carta` YA ordena por `coalesce(c.sort_order, 999), c.name`. El
problema no era que faltara el orden: era que las 7 categorias tenian
`sort_order = 0`, asi que el desempate caia al nombre y *Adiciones* ganaba por
la A. Es decir, la pagina del cliente no necesito ni una linea de cambio.

**Lo que se hizo:**
- **Sembrado** `sort_order = 1..n` con el orden alfabetico de HOY, para que al
  soltar el cambio nada se moviera solo. El orden que Sergio quiera lo pone el.
  (La migracion solo toca tenants donde TODOS los sort_order estan en cero: es
  idempotente y no pisa a un tenant que ya haya ordenado.)
- **Arrastre** en la pantalla de Categorias, con un agarre (los puntitos) y el
  numero de puesto en cada tarjeta.
- Una categoria **nueva nace al final** (`max+1`), no en el puesto 0 — si
  naciera en 0 se colaria de primera en la carta del cliente sola.
- El **mismo orden en la caja** (`tomar-pedido`, `venta-rapida`) y en el
  selector de `configuracion`. Iban por nombre; con el arrastre habria quedado
  un orden en la pagina y otro distinto en la caja.

**Dos decisiones tecnicas que valen la pena recordar:**
1. **Eventos de puntero, no el drag-and-drop de HTML5.** El de HTML5 no existe
   en pantallas tactiles y Cobra tambien corre en tablet.
2. **Solo el agarre lleva `touch-action:none`.** Si se pudiera arrastrar la
   tarjeta entera, en tablet cada intento de hacer scroll moveria una
   categoria.

**Un error propio que vale anotar.** El desplazamiento automatico (que la lista
se corra sola cuando el dedo llega al borde, para alcanzar una categoria que
esta fuera de pantalla) lo escribi primero como `scrollBy(0, dy)` sobre la
ventana. En esta pantalla la ventana NO hace scroll: `.cp-root` es
`height:100vh; overflow:hidden` y el que se desplaza es `.cp-body`. Habria sido
codigo muerto. Ahora `catScrollerDe()` busca el contenedor que de verdad se
desplaza y lo empuja a el.

**Verificado** sobre el codigo real, con la estructura real (`cp-root > cp-main
> cp-content > cp-body`) y 14 categorias para que la ultima quedara fuera de
vista: arrastre hacia adelante y hacia atras; renumeracion; solo se guardan las
filas que cambiaron de puesto (3 de 14 en el caso probado); un clic en "Editar"
no arrastra; agarrar y soltar sin mover no guarda nada; el desplazamiento
automatico baja hasta el tope exacto y sube de vuelta a 0, se queda quieto en
el medio, y el bucle se detiene al soltar. El agarre no se monta sobre el
cuadro de color de la categoria (la primera version, flotante, si lo hacia).

---

## 179 — PWA clientes: aire bajo el aviso de cerrado y la tira de categorias (17-ago-2026)

**1. El aviso de "estamos cerrados" montado en los platos.** `.ep-aviso` tenia
`margin-top: 12px` y ningun margen abajo, asi que la parrilla de platos
arrancaba pegada a el. Ahora `margin: 12px 0 20px`: abajo va mas aire que
arriba, que es lo que separa un aviso de lo que viene despues.

**2. La tira de categorias no decia que se desliza.** Si la ultima categoria
quedaba justo por fuera, la tira parecia completa y no habia motivo para
deslizar. Ahora el borde por donde HAY mas se desvanece, y el que ya no tiene
nada mas queda limpio: al principio se desvanece solo la derecha, en el medio
los dos lados, al final solo la izquierda, y si todas caben (escritorio) no se
desvanece nada.

Va con `mask-image` y no con un degradado pintado encima, porque encima habria
que pintarlo del color del fondo — y el fondo cambia con el tema claro/oscuro.
La mascara se aplica a la caja del elemento, asi que no se arrastra con el
scroll.

**3. Escoger una categoria de la derecha devolvia la tira al principio.** Tocar
una categoria vuelve a pintar la pantalla entera, y la tira nace de nuevo en el
arranque: el cliente deslizaba hasta SANDWICH, la tocaba, y la perdia de vista.
Ahora se guarda donde iba antes de repintar y se restituye; ademas, si la
escogida queda cortada contra un borde, se acomoda para verla entera. Lo de
volver a su sitio es instantaneo y solo el acomodo va suave — con
`scroll-behavior: smooth` puesto en el elemento se veia el salto al arranque y
luego el deslizamiento de vuelta.

**Verificado midiendo** en 390x760 y 1280x820 con las 7 categorias reales: el
hueco aviso→platos pasa a 20px; los cuatro estados del desvanecido; y el ciclo
completo (deslizar → tocar → repintar → restituir) en cuatro posiciones — al
final tocando la ultima, a la mitad, sin deslizar, y tocando una que queda
cortada contra el borde: en las cuatro la categoria escogida queda entera a la
vista.

---

## 180 — Por que las bebidas se veian mal (17-ago-2026)

Sergio: "las imagenes de los platos se ven excelentes, pero las de las bebidas
se ven horribles". Sospechaba de los PNG sin fondo. Tenia razon en la pista,
pero eran TRES fallas distintas superpuestas.

### 1. El recorte (la que mas se notaba)

El marco del plato es apaisado (1.55) y la foto lo llena con `object-fit:
cover`, que recorta lo que sobra. Con comida esta bien: son fotos apaisadas.
Pero las bebidas son recortes de producto altos o cuadrados. Medido:

| | proporcion | se veia con `cover` |
|---|---|---|
| Hamburguesas (600x287) | 2.09 | 74% |
| Bebidas cuadradas (300x300, 600x600) | 1.00 | 64% |
| AGUA BOTELLA (140x500) | 0.28 | **18%** |

De la botella de agua se veia menos de la quinta parte: un trozo de etiqueta,
sin botella. Arreglo: `acomodarFoto()` mide la foto REAL
(naturalWidth/naturalHeight) contra el marco y solo las MAS ALTAS que el marco
pasan a `contain` (enteras, con aire). Una foto apaisada se sigue recortando,
que es lo que se quiere. Se mide la foto y no la categoria a proposito: sirve
para cualquier restaurante, no solo para las bebidas de este.

### 2. El fondo negro (la causa que Sergio intuia)

`_compressImage()` exportaba TODO a JPEG. El JPEG no tiene canal alfa, asi que
un PNG recortado se aplanaba y el navegador pintaba de NEGRO lo transparente.
Medido en el borde de las imagenes: HIT y PREMIO **100% negro**, AGUA 95%,
QUATRO 73%.

Arreglo: se mira si la imagen trae transparencia (`getImageData`, alfa < 250) y
si la trae se guarda en **WebP**, que si la conserva y pesa menos que PNG. Si no
la trae, sigue en JPEG como siempre. La extension y el `contentType` ahora
SIGUEN al blob — estaban clavados en `.jpg`, que era parte del problema.

### 3. Las 6 imagenes ya daNadas

El JPEG guardado ya perdio la transparencia para siempre. Se recuperaron
quitando el fondo por **inundacion desde los bordes** (no un reemplazo global de
color: asi el negro de una tapa o de una etiqueta INTERIOR se conserva) y
guardando en WebP con alfa.

Quedaron bien 4: AGUA BOTELLA, COCA COLA, HIT, PREMIO. Se subieron a
`products/<tenant>/<uuid>.webp` — **archivo nuevo, el .jpg original no se
borro**, y hay copia local en el scratchpad.

**Dos NO se tocaron porque el problema es la imagen de origen**, no el
procesamiento:
- **POSTOBON**: el archivo que se subio ya venia daNado (manchas negras y
  fantasmas rosados alrededor de la botella, visibles en el original).
- **QUATRO**: no es un recorte — la foto trae su propio bloque de fondo lila
  con barras negras arriba y abajo.
Con el arreglo del recorte ya no se ven destrozadas, pero para que queden como
las otras hay que volver a subirlas desde una imagen limpia.

**Verificado** con las fotos reales servidas por `fn_web_carta`: las 6 bebidas
pasan a `contain` (100% visible) y las 3 hamburguesas siguen en `cover` (74%,
igual que antes). Comparacion visual en
`C:/Users/USUARIO/Downloads/bebidas-resultado.png`.

**Pendiente relacionado:** las pantallas de Cobra (catalogo, tomar-pedido,
venta-rapida) tienen su propio `cover` y no se revisaron en esta entrada.

---

## 181 — Las fotos, tambien en las pantallas de Cobra + QUATRO rescatada (17-ago-2026)

Sergio mando pantallazo del **catalogo de Cobra**: alli las bebidas seguian
recortadas, porque la entrada 180 solo toco la pagina del cliente.

**1. Mismo arreglo en el catalogo de Cobra** (`.cp-thumb-img`), llamado despues
de pintar la parrilla de productos y la de combos.

**2. La regla cambio, y por un error propio que valia la pena.** En 180 la regla
comparaba la foto contra el MARCO (`rFoto < rMarco/1.2`). En la pagina del
cliente el marco es fijo (1.55) y funcionaba. En Cobra NO: el ancho de la
tarjeta depende del tamaNo de la ventana, asi que la misma hamburguesa salia
recortada con la ventana angosta y con bordes vacios con la ventana ancha. Se
vio en el arnes de prueba, no en produccion.

Ahora la regla mira solo la forma de la FOTO, que no cambia nunca:
`ancho/alto <= 1.15` = recorte de producto -> entera; mas apaisada = foto de
comida -> se recorta. Verificado con las 16 fotos reales a 700px y a 1800px de
ancho: resultado identico en las dos, 10 hamburguesas en `cover` y 6 bebidas en
`contain`.

**3. QUATRO rescatada.** Su foto no era un recorte: era un banner con la botella
sobre un bloque lila y barras negras. Se recorto la botella con `grabCut`
(OpenCV) + la mancha conexa mayor, y quedo limpia (108x245, 4 KB). Ya esta en
vivo.

**4. POSTOBON NO tiene arreglo automatico — necesita foto nueva.** No es "un
poco de basura alrededor": el archivo trae un **fantasma de otra botella
superpuesto** — una mancha gris ENCIMA del cuello y una franja rosada pegada al
costado. Se intentaron dos caminos y los dos fallaron, con razon:
- Quedarse con la mancha conexa mas grande: los jirones estan pegados a la
  botella, no sueltos (solo cayo el 1.7%).
- Adelgazar la silueta para romper uniones finas (erode k=5,7,9,11): la union es
  ancha, no un hilo. Solo cayo el 5%, y las manchas siguen ahi.
Con el arreglo del recorte ya no sale destrozada, pero para que quede como las
otras cinco hay que volver a subirla desde una imagen limpia.

---

## 182 — El resplandor de la categoria activa se cortaba en seco (17-ago-2026)

Sergio: "hay como un resplandor en cada categoria de la carta, pero abajo no se
ve difuminado sino que se ve una linea".

**Causa raiz, medida.** El resplandor (`box-shadow: 0 10px 24px`) baja **34px**
por debajo del chip. La tira `.ep-cats` solo tenia **14px** de relleno abajo. Y
la tira se desliza: al pedir `overflow-x: auto` el navegador pone tambien
`overflow-y: auto` (verificado: el calculado daba `auto` en los dos ejes), asi
que recorta TAMBIEN en vertical. Los 20px que sobraban se cortaban de golpe: eso
era la linea. No era el degradado mal hecho — era el degradado partido.

**Arreglo.** Darle sitio DENTRO de la tira y quitarselo por fuera, para que
quepa entero sin mover nada de lo que hay alrededor:
- `padding: 2px 18px 14px` -> `14px 18px 38px`
- `margin: 0 -18px` -> `-12px -18px -24px`
- Las cuentas: arriba `14-12 = 2`, abajo `38-24 = 14`. Identico a antes.
- Escritorio igual: `margin: 0 0 16px` -> `-12px 0 -8px` (abajo `38-8 = 30`,
  que es lo que habia: `14+16`).
- `position: relative; z-index: 1` en la tira, para que pinte por ENCIMA de lo
  que sigue: sin esto las tarjetas de los platos taparian la cola del
  resplandor y volveria el borde duro, solo que 24px mas abajo.
- La sombra pasa a dos capas (`0 8px 20px` + `0 2px 6px`): una sola sombra
  grande se ve como una mancha, dos se ven como luz. De paso baja el alcance de
  34 a 28px, con 10px de sobra dentro del relleno.

**Verificado midiendo** en 390x760 y 1280x820: el resplandor cabe entero por
arriba y por abajo en los dos tamaNos; los espacios que ve el usuario quedan
identicos (saludo->chips 2px, chips->platos 14px en movil y 30px en escritorio,
chips->aviso 26px); la tira sigue deslizandose en horizontal y no aparece
barra vertical; sin desborde horizontal.

**Un detalle sin consecuencia:** a los lados el resplandor alcanza 20px y hay
18px de relleno, asi que se corta 2px — pero la tira sangra hasta el borde de
la pantalla (`margin -18px`), de modo que esos 2px caen fuera de la pantalla y
no se ven.

---

## 183 — Texto invisible en modo oscuro: variables de color que no existian (17-ago-2026)

Sergio: "en modo oscuro, al tomar un pedido, la parte que ofrece las adiciones
no se ve bien la letra".

**Causa raiz.** La hoja arrastraba nombres de variables de OTRA paleta que nunca
se definieron aqui: `--txt`, `--card`, `--card2`, `--marca`, `--fondo`, `--r`.
Cuando una variable no existe, CSS usa el valor de respaldo — y esos respaldos
eran de tema CLARO (`#14141a`, `#fff`). En modo oscuro quedaba texto casi negro
sobre fondo casi negro. **No fallaba nada, simplemente se veia mal, y solo en
uno de los dos temas**, que es justo lo que hace que estos errores duren meses.

En vez de parchar la linea del pantallazo se buscaron TODAS: se listaron las
variables definidas y las usadas, y se cruzaron. Salieron 8, no 1.

| Variable fantasma | Donde | Que se veia | Ahora |
|---|---|---|---|
| `--txt` (x5) | paso, "Atras", invitacion a adicionar, aviso, fila de direccion | texto casi negro en oscuro | `--ink` |
| `--card` | fondo del cuadro de aviso | blanco en modo oscuro | `--surf` |
| `--card2` | fondo de la invitacion a adicionar | gris fijo, sin tema | `--surf2` |
| `--marca` | circulito de la camara sobre la foto | **morado** #7C5CFF, que no es de esta marca | `--wine` |
| `--fondo` | borde de ese circulito | blanco fijo | `--surf` |
| `--r` | radio de `.ep-card` (tarjeta de Recargar) | **esquinas cuadradas** entre puras redondeadas | `18px` |
| `--oro` (en el .js) | "· en uso" de la direccion | sin color, heredaba | `--accent` |

**Verificado midiendo el contraste real** (relacion WCAG entre el color del
texto y el fondo opaco que tiene detras) en los dos temas. Todo por encima de
4.5:1, que es el minimo para texto normal:

| | oscuro | claro |
|---|---|---|
| "Paso 3 de 3" | 6.52 | 6.38 |
| titulo del paso | 17.02 | 18.01 |
| "Adiciones Familiares" | 15.91 | 15.71 |
| "Toca si quieres agregar algo" | 6.09 | 5.57 |
| "Atras" | 6.52 | 6.38 |

Antes, el titulo de la invitacion daba practicamente 1:1 — invisible.

**Queda una fantasma a proposito:** `--hero-foto`, en la regla
`.ep-hero.con-foto::before`. La clase `con-foto` no se aNade en ningun sitio del
proyecto, asi que esa regla no puede dispararse nunca. Se deja como esta: es
codigo muerto, no un error visible.

**Regla para no repetirlo:** hay un aviso escrito en `app-cliente.css`, junto a
la paleta. Los nombres buenos son `--ink --sub --dim --surf --surf2 --line
--accent --wine`. Antes de escribir `var(--algo)`, comprobar que exista.

---

## 184 — Recargas: el cliente ve lo que va a ganar ANTES de recargar (17-ago-2026)

Sergio: que la gente sepa, incluso antes de recargar, cuanto va a recibir de
mas, y que al tocar cada monto se lo diga. Se le mostraron 15 propuestas en
tres rondas; escogio la franja de promesa + el camino con paradas.

### El hallazgo: el aviso NUNCA mostraba una cifra

`bonoTexto()` leia `S.cliente.bono_por_bloque`, pero **`web-acceso` jamas
enviaba ese campo**: no existia en la respuesta. Asi que el aviso caia siempre
en el texto generico "Desde $50.000 ganas saldo extra" y ningun cliente vio
nunca cuanto ganaba. Estaba escrito el consumidor y no el productor.

### Lo que se hizo

**Servidor** (`web-acceso` v16): `fichaCliente` devuelve `recarga: {minimo,
bloque, bono_por_bloque}` leido de `pos_recarga_config`. Va junto al nivel
porque el bono DEPENDE del nivel (Estandar $5.000 · Premium $10.000 · VIP
$15.000 por bloque de $50.000). El minimo y el bloque tambien viajan: estaban
escritos a mano en la pagina y Cobra es multi-restaurante.

**Pantalla**, tres piezas en orden:
1. Franja: "Cada vez que recargas, te regalamos saldo". Se ve ANTES de tocar
   nada — era el pedido de fondo.
2. Cada monto dice lo que le QUEDA ("te quedan $110.000"), no solo lo que pone.
3. El camino con paradas: un riel de $0 al monto mas alto, con una parada por
   bloque; las alcanzadas se prenden. Arriba "ya te ganaste $X" y abajo
   "sumale $Y y te ganas $Z mas".

**El monto libre, en vivo (pedido de Sergio).** Antes solo se repintaba al SALIR
del campo. Ahora refresca tecla a tecla — pero solo el bloque del bono, no la
pantalla entera: repintarla le quitaria el foco y no podria seguir escribiendo.

**Aviso del minimo (pedido de Sergio).** Debajo de $40.000 el boton se
deshabilitaba y ya: un control muerto sin explicacion. Ahora, pegado al boton:
"Sube a $40.000 para poder recargar · te faltan $20.000".

### Tres errores propios que encontro la verificacion

1. **Las etiquetas del camino se montaban.** Con 5+ paradas se solapaban
   (medido: 7 choques con 8 paradas en 360px). Ahora los circulos se quedan
   todos y se rotula uno de cada tantos, siempre el ultimo.
2. **El camino contradecia al texto.** Cortar en las primeras 8 paradas hacia
   que con $500.000 la ultima dijera "+$40.000" mientras el titulo decia
   "$50.000". Ahora las paradas se AGRUPAN (cada una vale varios bloques) en
   vez de cortarse, asi que la ultima siempre coincide con lo que gana.
3. **El dorado era ilegible en tema claro.** `--accent` (#b8842a) daba 2.88 de
   contraste sobre las tarjetas claras. Se aNadio `--oro-tx`: el mismo dorado
   en oscuro, y #8a5f14 en claro (medido, 4.92-5.63). Todos los textos dorados
   —y el relleno de la barra— pasan a ese token.

**Verificado midiendo**, en 360px y en los dos temas: montos de $20.000 a
$1.000.000; cero solapes de etiquetas y cero desborde horizontal; la ultima
parada siempre coincide con el titulo; el foco se queda en el campo mientras se
escribe; el boton se apaga exactamente bajo el minimo y el aviso aparece con el
faltante correcto; todos los textos por encima de 4.5:1 en claro y oscuro.
Y el dato real se comprobo EN VIVO contra la funcion desplegada, con una sesion
temporal que se borro al terminar: devuelve
`{"minimo":40000,"bloque":50000,"bono_por_bloque":5000}`.

**Nota:** la API de Supabase reporto ACTIVE; se hizo smoke test aparte porque
tambien reporta ACTIVE con BOOT_ERROR.

---

## 185 — El paso a paso de la recarga, en una hoja (17-ago-2026)

Sergio: que el bloque de datos de pago sea tocable y abra un paso a paso muy
explicito, "pero en un modal, para que esa informacion no estorbe en la
pantalla". Se le mostraron tres opciones; escogio la que lleva la llave con
boton de copiar, conservando los subtitulos de la version en lista.

**Lo que se hizo:**
- `.ep-pay` pasa de `<div>` a `<button>`: asi tambien se abre con el teclado y
  el lector de pantalla lo anuncia como algo que se toca. Lleva la seNal
  "¿Cómo recargo?" en el encabezado — sin ella el bloque parece un recuadro
  muerto y nadie descubre el instructivo.
- La hoja reutiliza `.ep-scrim` + `.ep-sheet`, la misma que ya usa la carta:
  ni un patron nuevo que mantener.
- Cuatro pasos numerados unidos por una linea. El paso 2 trae la llave grande
  con boton **Copiar**: transcribir diez digitos a mano es donde de verdad se
  pierde una transferencia, y esa la termina resolviendo Sergio.
- Los datos salen de `S.pago`, nunca escritos aqui: cada restaurante tiene su
  cuenta. Si no hay llave ni numero, el paso 2 sale sin la tarjeta.
- Copiar SIN cuadros del navegador (regla de Sergio): el propio boton dice
  "Copiado". Con respaldo por `execCommand`, porque el portapapeles moderno no
  existe fuera de https ni en navegadores viejos.
- Cierra tocando fuera, con "Entendido" o con Escape, y no se duplica si se
  toca dos veces seguidas.

**Un arreglo que salio de medir:** en una pantalla de 560px la hoja se desplaza
y el boton "Entendido" quedaba por debajo del borde. El pie ahora va pegado
abajo (`sticky`), con fondo opaco para tapar los pasos que pasan por detras.
Verificado: el boton se queda en el mismo sitio con la hoja arriba, a la mitad
y al final.

⚠️ **Trampa al verificar, para la proxima:** la primera medicion dijo que el pie
no se pegaba. Era falso — la hoja todavia estaba corriendo su animacion de
entrada (`subir .26s`) cuando se midio. **Al medir una hoja o un modal, esperar
a que termine la animacion**, si no las coordenadas son las del camino, no las
del destino.

**Verificado midiendo** en 390x800 y 360x560, en los dos temas: contenido y
subtitulos correctos, la llave y el titular reales, copiar funciona, los tres
modos de cierre funcionan, no se duplica, cero desborde horizontal, y todos los
textos por encima de 4.5:1 (lo mas bajo: la seNal "¿Cómo recargo?" en tema
claro, 4.92).

---

## 186 — El paso a paso en escritorio, y un choque de nombres de clase (17-ago-2026)

Sergio mando pantallazo del escritorio: "un modal muy feo y con scroll, debe ser
fijo". Y aclaro: en la PWA quedo bien, no tocarlo.

### La causa raiz NO era el escritorio: era un nombre repetido

`.ep-paso` **ya existia** desde antes (linea 293), para la escalera de la
tarjeta de nivel: `display:flex; flex-direction:column; align-items:center;
flex:1`. Mi regla nueva, mas abajo, declaraba `display:flex; gap:13px` — y en
CSS gana la ultima SOLO en las propiedades que declara. `flex-direction:column`
y `align-items:center` seguian vivas.

Resultado: el numero salia CENTRADO ENCIMA del texto en vez de a la izquierda, y
la lista quedaba el doble de alta — de ahi la barra de desplazamiento del
pantallazo. No era un problema de escritorio: estaba en las dos versiones. En el
celular pasaba mas desapercibido porque la columna estrecha lo disimula.

**Arreglo:** renombrar, no parchar encima. Todo el bloque paso a
`.ep-ins*` (`ep-ins`, `ep-ins-n`, `ep-ins-b`, `ep-ins-tt`, `ep-ins-d`,
`ep-ins-lista`, `ep-ins-t`, `ep-ins-pie`). Anadir un `flex-direction:row` de
mas habria tapado el sintoma dejando la bomba armada para la proxima clase que
se llame igual.

**Efecto en la PWA:** el celular CAMBIA — el numero pasa de ir centrado encima
a ir a la izquierda con la linea que une los pasos. Es volver a la maqueta que
Sergio aprobo, no alejarse de ella.

### El escritorio

Reglas acotadas a `.ep-scrim.pasos` para no tocar la hoja de la carta, que
comparte las mismas clases. A partir de 900px: cuadro centrado de 420px, radio
completo, sin barra de desplazamiento, sin el tirador (dice "arrastrame", y en
un cuadro centrado no significa nada) y con el pie estatico en vez de pegado,
que ya no hace falta.

**Verificado midiendo:**
- Escritorio 1133x830 y 1280x830: cuadro de 420px, centrado, `seDesplaza:false`,
  numero a la izquierda del texto, tirador oculto, pie estatico y visible.
- Ventana baja 1280x620: cabe entero (alto 463 en 620), sin desplazamiento y el
  boton alcanzable.
- Celular 390x800: sigue siendo hoja de abajo, ancho completo, esquinas
  redondeadas solo arriba, tirador visible, pie pegado, sin desplazamiento y sin
  desborde horizontal.
- Contraste en tema claro, todo por encima de 4.5 (lo mas bajo: llave y copiar,
  5.63; el numero sobre el vinotinto, 8.48).

**Leccion, para la lista de trampas:** medir contenido y contraste NO es medir
la geometria. Las mediciones de la entrada 185 leyeron los textos correctos y
los contrastes correctos de una lista que estaba mal armada. Cuando se aNade una
clase nueva, comprobar antes que ese nombre no exista ya en la hoja.

---

## 187 — Los combos, como una categoria mas en la pagina del cliente (17-ago-2026)

Sergio: que los combos salgan en la pagina del cliente como una categoria mas,
de primeras por ahora, y poder cambiarles el orden mas adelante.

### El riesgo que habia que resolver primero

Sacar los combos en la carta y ya habria roto los pedidos: `web-pedido` busca
cada item en `pos_products`, y un combo NO esta ahi. El pedido ENTERO se habria
rechazado con "uno de los productos ya no esta disponible" — el cliente sin
poder pedir y sin entender por que.

### La convencion ya existia: se siguio, no se invento otra

`pos-combos.js` (las tres pantallas de venta) ya define como se vende un combo:
id con prefijo `combo:<uuid>`, `product_id` VACIO en la linea del pedido, y el
contenido en `selections` (`combo_id`, `combo_nombre`, `combo_items`) para que
la comanda y el inventario lo lean aunque maNana cambie el combo.

La pagina usa exactamente ese formato. **Verificado ejecutando las propias
funciones de `pos-combos.js` contra la linea que guardo la pagina**:
`comandaTxt` devolvio "Combo PRUEBA · Brownie · Cheesecake" y `insumosDe`
devolvio los dos productos de adentro con cantidad 2. Es decir: la comanda y el
descuento de inventario funcionan sin tocar una linea de codigo.

### Lo que se hizo

- **`fn_web_carta`**: una categoria virtual "Combos" con los combos activos en
  forma de producto (sin presentaciones, variables ni adiciones — todo eso ya
  quedo decidido al armarlo). Solo salen los que apuntan a productos de verdad,
  la misma regla de `pos-combos.js`: los del formato viejo no se pueden
  preparar ni descontar.
- **La descripcion, si el dueNo no escribio una, es lo que trae el combo**
  ("Brownie + Cheesecake"). "Combo Sandwich" no le dice nada a un cliente que
  esta decidiendo.
- **`tenants.web_combos_orden`** (int, default 0): el puesto de esa categoria.
  Cero la deja primera, porque las categorias de verdad arrancan en 1.
- **`web-pedido` v13**: rama propia para los combos. El precio sale del
  CATALOGO, nunca del navegador.
- **El empaque, por lo de adentro**: un combo de tres cosas son tres empaques,
  igual que el inventario. Y el precio de cada linea de empaque NO va en cero:
  cuando el empaque se cobra por porcentaje ese precio es la base del calculo, y
  un pedido de puro combo habria pagado cero. Se reparte el precio del combo
  entre sus productos en proporcion a lo que vale cada uno suelto, asi la suma
  da exactamente el precio del combo.

### Verificado SIN tocar El Parche

Se monto el banco en el tenant "Demo Restaurant", que no tiene cocina detras:
se le dio slug, se creo un combo de prueba, se pidio y se comprobo. Un pedido de
prueba en El Parche le habria salido a la cocina.
- Carta del demo: Combos de primera (orden 0), luego sus categorias.
- Combo x2: total 40.000 = precio del combo x2, **no** la suma suelta (21.000
  x2 habria sido el error clasico).
- Linea guardada: `product_id` vacio, nombre del combo, y `selections` con las
  tres llaves exactas.
- Pedido MIXTO (combo + 2 productos): 60.000, dos lineas, cada una por su
  camino.
- **Todo borrado al terminar**: 2 pedidos, 2 sesiones, 1 cliente y el combo; el
  tenant demo quedo como estaba (`slug` nulo, `web_activa` false). Comprobado
  que no queda ni una linea y que El Parche no recibio ningun pedido.

### Como cambiar el orden mas adelante (lo que Sergio pidio dejar planteado)

El numero ya existe y ya manda: `tenants.web_combos_orden`. Hoy esta en 0. Con
ponerlo en 4, por ejemplo, Combos aparece entre la cuarta y la quinta categoria.
Falta solo la parte visible: que la pantalla de Categorias muestre una tarjeta
"Combos" que se pueda arrastrar como las demas y, al soltar, escriba ese numero
en vez de en `pos_categories.sort_order`. Es media hora de trabajo sobre el
arrastre que ya quedo hecho en la entrada 178.

**SQL de la migracion:** `supabase/sql/2026-08-17-combos-en-la-carta.sql`.

---

## 188 — Medallas ampliadas, tarjeta grande y agotado a la vista (17-ago-2026)

Se le mostraron a Sergio 9 medallas y 9 adornos en dos rondas. Escogio:
medallas **picante, para 2, ahorras, recomendado, dulce y solo hoy** (quito 2x1,
no maneja esa promocion), y los adornos **G** (tarjeta grande) y **H** (agotado
a la vista, "para cuando lo conectemos con el inventario").

### Una decision de modelo: agotado NO es lo mismo que no venderlo

Existia solo `available=false`, que ESCONDE el producto. Si se hubiera usado ese
campo para pintar la tarjeta gris, el dia que Sergio descontinue algo quedaria
en la carta para siempre. Se separo:
- `available=false` → fuera de la carta (ya no lo vendo).
- `agotado=true` → sigue en la carta, en gris y sin poder pedirse (hoy no hay).
Es el campo que el inventario podra encender solo mas adelante; hoy se marca a
mano con un interruptor.

### Lo que se hizo

- **Base**: `pos_products.agotado`, `.carta_grande`, `.medalla_valor`.
  El monto de "ahorras" va en su propia columna y NO pegado al nombre
  (`'ahorras:6000'`): un numero se compara y se valida; un texto con dos puntos
  hay que partirlo cada vez que se lee.
- **`fn_web_carta`**: manda `medalla_valor`, `grande` y `agotado`, y deja de
  esconder los agotados.
- **Pagina del cliente**: 8 medallas (5 colores, no 8 — el color dice de que se
  trata antes de leer), tarjeta ancha que ocupa la fila, y tarjeta gris con
  sello para lo agotado. "Ahorras" sin monto NO se muestra: prometer un ahorro
  sin cifra es peor que no prometer nada.
- **Cobra**: selector de medallas ampliado, campo de monto que aparece solo con
  "ahorras", e interruptores de "Tarjeta grande" y "Agotado hoy".
  **"Mas pedido" no esta en el selector a proposito**: la decide la venta, y
  poder ponerla a mano seria poder mentir.

### Tres cosas que salieron de medir, no de mirar

1. **`display:flex` faltaba** en `.ep-plato--ancho`. La tarjeta normal es un
   boton de bloque, asi que `flex-direction:row` no hacia nada — el MISMO
   descuido de la entrada 186. Se puso explicito.
2. **Verde y naranja no eran legibles**: 4.38 y 4.43 con texto blanco, bajo el
   minimo de 4.5. Bajados un tono a `#1b7d44` y `#b25018` (5.17 y 5.18). Se
   cambiaron en los DOS programas: la caja y la pagina no comparten hoja de
   estilos, y el archivo ya avisaba de eso.
3. **El sello de agotado era ilegible en tema claro**: velo oscuro translucido
   con texto `--ink`, que en claro es casi negro — 4.1. Ahora es un chip opaco
   con el color de superficie: 18.01 en los dos temas.

**Verificado midiendo** con las 10 hamburguesas reales marcadas de prueba: las
6 medallas con su color correcto, "Ahorras $6.000" con el monto, la tarjeta
ancha ocupando la fila entera (326px contra 157), la agotada en gris y sin
poder tocarse, cero desborde horizontal, y todas las medallas por encima de
4.5:1 en los dos temas. **Las marcas de prueba se quitaron al terminar**: los 7
productos volvieron a como estaban.

**Nota para Sergio, ya dicha:** si TODOS los productos llevan medalla, ninguna
se ve. Lo recomendado es marcar entre un cuarto y un tercio de la carta. La
decision es suya.

**SQL:** `supabase/sql/2026-08-17-medallas-tarjeta-grande-agotado.sql` y
`2026-08-17-fn-web-carta.sql`.

---

## 189 — Cuando se ven los cambios de la carta, y el agujero del agotado (17-ago-2026)

Sergio pregunto "¿los adornos cuando aparecen?". Al ir a responderlo con
precision aparecieron dos fallas de fondo — la pregunta era buena.

### 1. La carta se pedia UNA sola vez por sesion

`cargarCarta()` empezaba con `if (S.carta) return`. Un cliente con la app
abierta NO veia nada de lo que el dueNo cambiara: ni una medalla, ni un precio,
ni un agotado. Con las medallas es cosmetico; con "Agotado hoy" no: pediria algo
que ya no hay y alguien tiene que llamarlo a decirle que no.

Ahora se vuelve a pedir si han pasado mas de **3 minutos**, y solo al entrar a
la carta. No es tiempo real a proposito — eso seria una consulta constante por
cada cliente con la app abierta — pero cierra la ventana a unos minutos.
Ademas, si la consulta falla se conserva la carta anterior: mas vale una carta
de hace un rato que una pantalla vacia.

### 2. El servidor no comprobaba el agotado

`web-pedido` solo miraba `available === false`. Un producto agotado tiene
`available = true`, asi que **el pedido entraba igual**. La pantalla lo pintaba
en gris y no dejaba tocarlo, pero eso no basta: el cliente pudo dejarlo en el
carrito ANTES de que se acabara, o tener la pagina abierta de hace rato.
Frenarlo solo en la pantalla habria hecho que "agotado" fuera decorativo.

Ahora `web-pedido` v14 lo rechaza con el nombre del producto:
"Se acabó Chicken Burger por hoy. Quítalo de tu pedido para continuar."

**Verificado en el tenant de demostracion**, no en El Parche: mismo producto
pedido dos veces, la primera pasa (total 20.000) y la segunda —ya marcado
agotado— se rechaza con la razon y el mensaje correctos, mientras el producto
SIGUE saliendo en la carta con `agotado: true` para pintarse en gris. Todo
borrado al terminar y el tenant demo devuelto a como estaba.

### Resumen de cuando aparece cada cosa

| | Quien la pone | Cuando se ve |
|---|---|---|
| Medalla, tarjeta grande, agotado | Sergio, en el editor | Al abrir la carta, o a los 3 min si ya estaba abierta |
| Mas pedido | El sistema, con las ventas | Se recalcula en cada carga de la carta (60 dias, min. 10 unidades) |

---

## 190 — La tarjeta grande: alto igualado, sin huecos, y las medallas que no se veian (17-ago-2026)

Sergio reporto dos cosas de la tarjeta grande: que quedaba mas BAJA que las
normales, y que dejaba un HUECO en la fila de arriba. Las dos en celular y en
escritorio.

### Un arreglo resolvio las dos

La causa comun era `grid-column: 1 / -1`: la tarjeta se llevaba la fila entera y
quedaba SOLA. De ahi salian los dos sintomas:
- **el hueco**, porque lo que venia antes se quedaba solo en su fila (en
  escritorio con tres columnas vacias al lado);
- **el alto**, porque sin hermanas en su fila la cuadricula no tenia con que
  igualarla, y quedaba a merced de un `min-height: 118px` inventado.

Ahora ocupa **dos columnas** (`grid-column: span 2`). En celular la cuadricula
tiene dos, asi que se ve igual de ancha que antes; en escritorio comparte fila
con tarjetas normales **y la cuadricula le da el mismo alto que a ellas, sola**.
Se quito el `min-height` de la foto, que era lo que la achataba.

Y las anchas se pintan **primero** dentro de su categoria, con lo que la
cuadricula se llena entera: lo unico que puede sobrar es el final de la carta.
Se conserva el indice ORIGINAL para `data-plato` — reordenar sin eso haria que
tocar una tarjeta abriera otro plato. Verificado uno por uno.

En celular la ancha sigue sin hermanas, asi que ahi si lleva alto propio, pero
calculado con la MISMA cuenta que usa la cuadricula:
`calc((100vw - 48px) / 2 / 1.55 + 86px)`. Medido: 196 contra 196 de una tarjeta
normal.

### Un hallazgo aparte: la carta NUNCA pinto medallas

Al mover el codigo de la tarjeta a su propia funcion se vio que `medalla()` solo
se llamaba desde el banner de inicio (`filaDeHoy`). **La cuadricula de la carta
no la llamaba nunca**: se marcaba un producto y la medalla no aparecia por
ningun lado. Ya se pinta, y va DENTRO de `.ep-plato-img`, que es lo unico
posicionado: fuera de ahi el CSS absoluto la habria mandado a la esquina de la
pantalla.

**Verificado midiendo**, celular y cuatro anchos de escritorio:

| | columnas | ancha | fila de la ancha | huecos |
|---|---|---|---|---|
| 390 | 2 | 196 | sola (fila propia) | 0 |
| 900 | 3 | 253 | 253, 253 | 0 |
| 1024 | 3 | 280 | 280, 280 | 0 |
| 1280 | 4 | 270 | 270, 270, 270 | 0 |
| 1600 | 4 | 276 | 276, 276, 276 | 0 |

Mismo alto que sus vecinas en las cuatro anchuras de escritorio, cero huecos
intermedios, cero desborde horizontal, y la medalla en la esquina de la foto.

---

## 191 — ¿Esta funcional la pagina de clientes? Verificacion de punta a punta (17-ago-2026)

Sergio pregunto si la app de clientes ya sirve para recargar y pedir. Se
verifico **ejecutando los caminos completos** en el tenant de demostracion, no
leyendo codigo.

### Lo que SI quedo probado hoy

| Paso | Resultado |
|---|---|
| Crear pedido desde la pagina | `ok`, total correcto, nace `pendiente_pago` con `origen: web` |
| ¿Lo ve la caja y la cocina? | Si — `pendiente_pago` esta en `ESTADO_ABIERTO` de caja.js y en `ACTIVE_STATUSES` de kitchen.js |
| Pagar con saldo | `paid` + `en_preparacion`, por la misma puerta (`cambiar-estado`) que usan el POS y Paco |
| ¿Se descuenta el saldo? | Si: 100.000 → 80.000 por un pedido de 20.000 |
| ¿Se dan puntos? | Si: 20 puntos por 20.000 |
| Combos | Pedido, cobrado al precio del combo, comanda e inventario correctos (entrada 187) |
| Agotado | El servidor lo rechaza (entrada 189) |
| Recarga | Crea la solicitud y el **OCR leyo bien el monto**: dicho 50.000 / leido 50.000 |

### Lo que NO esta probado (y hay que decirlo)

- **Nadie ha usado la pagina en produccion todavia**: cero pedidos con
  `origen='web'` y cero solicitudes de recarga en toda la base. Hay 8 sesiones
  web de 2 clientes — alguien entro, nadie completo.
- **El pago por transferencia de un PEDIDO** no se probo; solo el pago con
  saldo.
- **La acreditacion final de una recarga** no se probo: exige que el correo del
  banco confirme que la plata entro, y probarlo de verdad requeriria una
  transferencia real. El demo no tiene correo conectado (fallo con
  `sin_gmail`); **El Parche SI lo tiene**, desde el 28-jul.
- **Domicilio** no se probo; solo "recoger".
- **La impresion de la comanda** no se probo.

### Un riesgo cerrado de paso

`web-recarga` estaba **desplegada (v11) pero su codigo NO estaba en el repo**:
si se perdia o habia que tocarla, no habia fuente. Se recupero del servidor con
`GET /functions/web-recarga/body` y quedo en
`supabase/functions/web-recarga/index.ts`.
⚠️ Con la trampa de siempre: `/body` devuelve la linea 1 CORTADA — llego como
`eb-recarga — el cliente...`, sin el `// w`. Se reconstruyo antes de guardar.
**Nunca volver a subir un cuerpo bajado de `/body` sin reparar la primera
linea.**

**Todo lo de prueba se borro**: pedido, items, solicitud, saldo, movimientos,
puntos, sesiones y cliente; el tenant demo quedo con `slug` nulo y
`web_activa` en false. Comprobado que El Parche no recibio nada.

---

## 192 — El domicilio se resuelve al guardar la direccion, no al pedir (17-ago-2026)

Pedido de Sergio: que la pagina calcule el domicilio, que el barrio se compare
al REGISTRARSE o al agregar una direccion (no al crear el pedido), y que le
llegue un aviso cuando el barrio no se reconozca para ponerle precio.

### Casi todo ya existia — se conecto, no se construyo

Antes de escribir se reviso, y aparecio que:
- Hay **8 zonas con mas de 120 barrios** cargados ($4.000 a $12.000).
- `web-pedido` YA calculaba el domicilio, pero **al crear el pedido** y con
  comparacion EXACTA: barrio que no estuviera identico → domicilio en $0.
- `pos_domi_aprendidos` YA es el buzon de barrios desconocidos, y
  **Configuracion → Domicilios YA tiene la pantalla de aprobacion de un clic**.
- La campana del dashboard esta escrita para recibir fuentes nuevas.

Asi que el trabajo real fue conectar las piezas, no inventarlas.

### Lo que se hizo

1. **`web-acceso` v18**: al guardar una direccion (y al crear la cuenta) se
   resuelve el barrio y se devuelve `domicilio: {conocido, precio}`. Si no se
   reconoce, se anota en `pos_domi_aprendidos` con `tipo:'nuevo'`, contando
   cuantas veces lo han escrito.
2. **La pagina** dice el precio al guardar: "El domicilio a Villa Melisa cuesta
   $5.000", o "Te confirmamos el valor antes de cobrarte" si no se reconoce —
   nunca dejarlo creer que es gratis porque salio en cero.
3. **La campana** tiene una fuente nueva: "Barrio sin precio de domicilio ·
   2 clientes lo han escrito · hoy se cobra en $0", que lleva a Configuracion →
   Domicilios. Marcado urgente: mientras no tenga precio, es plata que se
   pierde en cada pedido a ese barrio.

### La comparacion es COPIA, no una reescritura

`fuzzyBarrioMatch` y `normalizarTexto` se copiaron TAL CUAL de delay-reply. Dos
comparadores distintos darian dos precios distintos para la misma direccion —
uno en la pagina y otro en la comanda. Las funciones del servidor no comparten
archivos (cada una se despliega sola), asi que la copia es el unico camino;
queda anotado en ambos lados que si se toca alla, se toca aqui.

⚠️ **El copiar-pegar se llevo la funcion que llama, no la llamada.**
`fuzzyBarrioMatch` usa `levenshtein`, que no vino. La funcion devolvia **HTTP
500** en cada intento de guardar una direccion. El smoke test de arranque NO lo
detecto porque esa ruta responde antes de llegar al codigo nuevo.
**Leccion: al copiar una funcion entre Edge Functions, listar sus llamadas y
comprobar que todas existan en destino.** Se hizo con un barrido de
identificadores despues del arreglo.

**Verificado con los barrios REALES de El Parche**, 6 de 6:

| Escribio | Direccion | Resultado |
|---|---|---|
| Villa Melisa | Villa Melisa casa 12 | $5.000 |
| villa melissa | (mal escrito, minusculas) | $5.000 |
| CAMPOBELLO | Cra 9 # 17-34 | $7.000 |
| *(vacio)* | Calle 5 # 10-20, barrio Modelo | $8.000 — lo saco de la direccion |
| el centro | Calle 4 # 6-20 | $9.000 — con articulo |
| Reserva del Oeste | Reserva del oeste apto 207 | no conocido → anotado |

**Limpieza**: el cliente y las 12 sesiones de prueba se borraron, y a "Reserva
del Oeste" se le devolvio su `veces` original (la prueba lo habia subido a 2).

### Pendiente relacionado

`web-pedido` sigue comparando EXACTO al crear el pedido. Hoy no molesta porque
el barrio ya viene resuelto desde que se guardo la direccion, pero deberia usar
el mismo comparador para no dar dos respuestas distintas. **Anotado.**

---

## 193 — Una foto dejaba a Paco MUDO (17-ago-2026)

Mónica Hurtado (573136337891) mando la foto de la carta recortada, seNalando la
salchipapa que queria, con el pie de foto "Me regalas porfa una de estas
personal". **Paco no contesto nada** y tampoco paso la conversacion a humano.
Sergio la tomo a mano tres minutos despues.

### Causa raiz: un `else if` sin salida

En `meta-webhook`, ante una imagen:
```
} else if (msgType === "image" && mediaUrl) {
  if (pagoPendiente) { ...verify-transfer... }
  // y si NO hay pago pendiente... NADA
}
```
Ni se encolaba respuesta ni se pasaba a humano. El peor silencio posible: la
clienta ya habia dicho lo que queria y creia estar pidiendo.

**Y habia una segunda falla debajo.** `delay-reply` SI tenia una respuesta para
mensajes solo-media ("por el momento solo puedo atenderte por texto"), pero:
1. no se alcanzaba nunca, porque el webhook no encolaba;
2. detectaba la imagen mirando si el body empezaba por `[imagen]` — con un pie
   de foto escrito, no la reconocia como imagen.

### El arreglo

- **`meta-webhook` v64**: la imagen que NO es comprobante entra a la cola como
  cualquier mensaje. La decision de que hacer no se duplica aqui: la toma el
  cerebro.
- **`delay-reply` v305**: la imagen se reconoce por su `media_type`, no por el
  texto. Y una foto que no es comprobante **pasa a un humano** con motivo
  "Mandó una foto (Paco no ve imágenes)".

**Por que humano y no "solo puedo atenderte por texto":** es el contrato que
definio Sergio — lo que se sale del flujo va a una persona, y eso NO es un
error, es la valvula. Ella ya dijo lo que queria; mandarla a repetirlo por
escrito la deja peor que el silencio. El error seria adivinar cual pidio.

**La frase:** `cfg.handoff.frase` no existe en la configuracion de El Parche,
asi que `pasarAHumano` habria cambiado la conversacion **sin decirle nada a la
clienta** — el mismo silencio, solo que visible para Sergio. Se manda una frase
propia: *"Uy, no alcanzo a ver las fotos 😅 Ya le paso tu mensaje a una persona
del equipo 🍟"*. Dice lo que PASO, no lo que va a pasar: prometer "en un momento
te atienden" ya costo un caso (entrada 176) y aqui dependeria de si hay alguien
despierto. Si algun dia Sergio llena `handoff.frase`, manda la suya.

**Verificado en el banco** (nada salio a ningun numero real):

| | |
|---|---|
| Control: la misma pregunta SIN foto | Contesta el horario normal, NO pasa a humano |
| Caso real: "Hola" → "¿tienen servicio?" → FOTO | Contesta las dos primeras, y con la foto avisa y pasa a humano |
| `human_takeover` / motivo | `true` / "Mandó una foto (Paco no ve imágenes)" |

Las 3 conversaciones de prueba se borraron. Smoke test de las dos funciones tras
desplegar: `delay-reply` 200, `meta-webhook` 200 en POST y 403 en el GET con
token falso — que es lo correcto.

### Anotado para despues (no se hizo hoy)

1. **`web-pedido` compara barrios EXACTO** al crear el pedido, mientras que
   `web-acceso` ya usa el comparador tolerante. Hoy no molesta porque el barrio
   viene resuelto desde que se guardo la direccion, pero deberian ser el mismo.
2. **Leer la foto de la carta con vision.** Paco ya tiene infraestructura de
   Vision (`analyze-menu` usa GPT-4o para importar cartas). Se podria intentar
   reconocer que plato seNala el cliente. **No se hizo a proposito**: equivocarse
   leyendo una foto es exactamente "cerrar mal", que es lo unico inaceptable
   segun el contrato. Pasar a humano es la respuesta correcta hasta que se pueda
   probar con muchas fotos reales.

---

## 194 — El precio malo de Mariam: reproducido y localizado (18-ago-2026)

Mariam (573226509718) pidio en UN mensaje: *"1 salchipapa personal mixta, 1
coca cola personal porfa y una adición de salsa de ajo"*. Paco cobro **$28.000**
cuando eran **$33.000**: la coca cola no llego al resumen. Sergio corrigio a
mano.

### Lo importante: el extractor NO tiene la culpa

Se llamo a `extraer-pedido` con el texto EXACTO de ella. Devolvio los tres
productos, cada uno con su precio, y subtotal **$32.000** (+$1.000 de empaque =
los $33.000 correctos). El diagnostico que estaba anotado en A1 —"el extractor
devuelve un solo producto"— **es falso**: su esquema es una lista y tiene la
regla "CADA MENCIÓN ES UNA LÍNEA".

### Donde se pierde de verdad

El resumen NO se arma con el extractor. Se arma con el ESTADO de la
conversacion, que guarda **un producto en curso** (`state.producto`) mas una
lista de anteriores (`state.items`). El extractor solo se usa al CREAR el
pedido, al final.

De ese mensaje con tres productos, el estado se quedo solo con la Mixta. La
salsa aparecio en el resumen por un camino de REPARACION (el verificador ve que
"salsa de ajo" no es una adicion de ese plato y la agrega como linea). La coca
cola no encajaba en ningun camino de reparacion, y desaparecio sin dejar rastro.

### Reproducido a voluntad

En el banco, con el mismo pedido y una direccion de barrio conocido, sale
**exactamente el mismo resumen**: `1x Mixta Personal`, `1x Salsa`, Pedido
$28.000. Ya no hay que esperar a que le pase a un cliente para trabajarlo.

⚠️ **Cuidado al reproducir en el banco:** el flujo cambia segun el estado de la
base. Con la direccion original ("Edificio Torino") pasa a humano por CONJUNTO
NUEVO y nunca llega al resumen. Hay que usar un barrio conocido para llegar al
punto del fallo.

### Lo que NO se hizo, y por que

No se toco la maquina de estado. Es la pieza mas delicada de Paco —lo dijo
Sergio— y el restaurante estaba EN SERVICIO cuando se investigo. Un arreglo mal
puesto ahi rompe la toma de pedidos entera. Se deja localizado y reproducible
para hacerlo con calma.

**Tambien se intento instrumentar y se descarto:** los logs de la plataforma
llegan incompletos, y el chivato quedo puesto en un `allItems` que NO es el del
resumen (hay cinco listas con ese nombre en el archivo). Se revirtio en vez de
dejar instrumentacion a medias: el repo y produccion quedan identicos en
`delay-reply` v305.

### El siguiente paso concreto

Encontrar por que un mensaje con varios productos deja solo uno en el estado, y
que el resto entren como `state.items`. El banco ya lo reproduce, asi que el
ciclo de prueba es de minutos.

---

## 195 — A un conjunto se le pedía una calle que no existe (18-ago-2026)

Sneider (573147454225) escribio: *"Para el : conjunto portal de pomona / Nombre :
sneider Sánchez / Casa 13"* — la palabra "conjunto" y la casa, todo lo que hace
falta. Paco respondio: *"Anotado el barrio 📍 ¿Y cuál es la dirección exacta?
(calle o carrera y número)"*. Sergio tuvo que tomarla.

### Causa raiz

Todo el manejo de conjuntos se decidia con `esConjunto()`, que solo dice que si
cuando el conjunto YA esta **registrado** en las zonas del restaurante. Hay 50
registrados; "Portal de Pomona" no es uno.

Existia `sueneAConjunto()` —la funcion que detecta las PALABRAS conjunto, torre,
edificio, apto…— y su propio comentario decia para que era: *"no sirven para
decidir un precio, pero si para saber que hay que preguntarle a un humano en vez
de exigirle una calle que no existe"*. **No se estaba usando en el control que
importaba.**

Y hubo un segundo enredo: el precio SI se resolvio ($8.000, porque "Pomona" es
un barrio registrado de esa zona — el mismo valor que cobro Sergio). Al haber
precio, el flujo cayo en la rama de "solo dio el barrio, pidele calle y numero".

### El arreglo

Donde se decide si pedir la calle, ahora vale tanto la lista como la palabra:
si el cliente DICE conjunto (o torre, edificio, apto…), se trata como conjunto
aunque no este registrado — se le pide la unidad, no la calle. La lista sigue
sirviendo para saludarlo por su nombre ("¡Listo, Torres del Bosque!").

⚠️ **Estaba en DOS ramas hermanas.** Se corrigio primero la de la linea 2776 y
la prueba salio igual de mal: la que de verdad contesta en este caso es la
hermana de la 3111, con las mismas cuatro lineas copiadas. **Al corregir un
control de direccion en delay-reply, buscar siempre su gemelo.**

Ademas la compuerta que propone un CONJUNTO NUEVO para aprobar solo miraba
`state.direccion`; el nombre del conjunto llega muchas veces en `barrio`. Ahora
mira la ubicacion completa.

**Verificado en el banco**, tres casos:

| | Antes | Ahora |
|---|---|---|
| Conjunto con precio conocido (caso Sneider) | "dame calle y carrera" | Resumen directo: dirección tal cual, domicilio $8.000 |
| Conjunto sin precio conocido | — | Sigue el flujo (encontro precio por cercania; revisar aparte) |
| Barrio normal sin calle (control) | pide la calle | igual, sin cambios |

Las 5 conversaciones de prueba se borraron. `delay-reply` v306, smoke test 200.

**Nota:** en la prueba A se ve que el jugo HIT no entro al resumen — es el otro
error, el de varios productos en un mensaje (entrada 194), que sigue pendiente.

---

## 196 — "Pra pasar recogiendo": el gerundio que faltaba (18-ago-2026)

Sandra (573155928664) dijo **"Pra pasar recogiendo"** y Paco le siguio pidiendo
"el barrio y la direccion completa". Sergio tuvo que tomarla.

**Es la tercera vez que cae el mismo reconocedor** (entradas 135 y 171), y cada
vez por una forma distinta de decir lo mismo. Esta vez el gerundio:
- no es "para recoger" — dice "pasar";
- no es "pasar A recoger" — le falta el "a";
- el verbo va en gerundio, que no estaba en ninguna de las 25 formas.

**Arreglo:** dos formas nuevas, atadas a un verbo de MOVERSE
(`pasar|paso|pasamos|voy|vamos|ir` + `recogiendo`), con la misma cautela que se
uso con "reclamar": "recogiendo" suelto tambien aparece en frases de puntos, y
marcar eso como recoger le tumbaria el domicilio a alguien que si lo espera.
El typo de "para" ("pra", "pa") queda cubierto solo, porque el patron empieza
en el verbo y no en la preposicion.

**Probado el patron aparte, 13 casos**: 7 que deben marcar recoger ("Pra pasar
recogiendo", "paso recogiendo", "vamos recogiendo el pedido"…) y 6 que NO
("quiero reclamar mi premio", "estoy recogiendo la ropa", "recogiendo a mi
hijo"…). 13 de 13.

**Y en el banco**, con la conversacion de Sandra: tras "Pra pasar recogiendo"
Paco ya no pide direccion, sigue al nombre. Control con un pedido a domicilio:
igual que antes.

`delay-reply` v307, smoke test 200. Conversaciones de prueba borradas.

**Se reviso tambien la carta:** en el chat se ven cuatro mensajes que dicen solo
"Carta". NO es un error — son imagenes (`media_type: image`) y "Carta" es el pie
de foto. La regla de que la carta va solo en imagenes se esta cumpliendo.

⚠️ **Para la proxima:** este reconocedor ya cayo tres veces. Cuando vuelva a
fallar, no agregar una forma mas sin antes correr la lista completa de formas
contra un banco de frases reales — el problema no es la forma que falta, es que
se descubre de una en una y siempre con un cliente adelante.

---

## 197 — "premiun": una letra de error cambiaba el plato (18-ago-2026)

Shirley (573104409415) escribio de entrada TODO lo necesario: *"Para pedir una
premiun mixta personal / Para Monteluna casa 45 / Pago en efectivo / Shirley"*.
Paco cotizo la salchipapa **Mixta** ($26.000) en vez de la **Premium mixta**
($34.000). Los intentos de correccion de ella ("Es la premium mixta", "Corrijo
solo la...") enredaron mas el pedido — sumo un segundo item, pego la correccion
como nota, y al final volvio a pedir la direccion. Sergio tuvo que tomarla:
"el sistema se volvio un poco loco".

### Causa raiz

`matchProductosEnTexto` compara EXACTO contra el indice de nombres. "premiun"
(errata de premium) no casaba con nada; "mixta" si — y "mixta" es a la vez una
salchipapa tradicional y una variante de la Premium (la COLISION documentada).
Sin la palabra "premium" reconocida, la regla de colision nunca aplico y el
producto quedo siendo la Mixta. Todo lo demas fue consecuencia.

### El arreglo

Tolerancia de UNA letra (cambiada, sobrante o faltante) en el buscador de
productos, con tres cautelas:
- solo nombres de **6+ letras** — con menos, una letra es media palabra
  ("polo"/"pollo" queda fuera a proposito);
- **nunca** sobre una palabra que ya es otro producto exacto ("mixta" jamas se
  convierte en otra cosa);
- el hallazgo exacto manda: la tolerancia solo AGREGA lo que el exacto no vio.

Reutiliza el `levenshtein` que ya existia en el archivo.

**Verificado en el banco:**

| | Resultado |
|---|---|
| "premiun mixta personal" (caso Shirley) | Salchipapa **Premium Mixta** Personal · $35.000 + $5.000 — identico a lo que cobro Sergio |
| Control "salchipapa mixta personal" | sigue siendo la Mixta |
| Control "premium mixta personal" bien escrito | igual que siempre |

`delay-reply` v308, smoke 200, conversaciones de prueba borradas.

### Lo que este caso deja pendiente (ya en la cola)

Los tumbos posteriores de la conversacion —"Es la premium mixta" que SUMO un
item en vez de corregir, y el "No" final que hizo perder la direccion— son la
maquina de estado de la entrada 194. Este arreglo evita que esa conversacion
entre en el enredo (el producto sale bien desde el primer mensaje), pero la
correccion de pedidos sigue fragil y se ataca cuando Sergio cierre.

---

## 198 — Auditoria del servicio del 17-ago: lo que nadie reporto (18-ago-2026)

Sergio pidio revisar TODAS las conversaciones de la noche buscando errores no
reportados. Se leyeron las 20 conversaciones y se cruzaron con los 21 pedidos
creados. Hallazgos, del mas grave al menor:

### 1. Paula quedo esperando (operativo, urgente al momento de la auditoria)
Paula (3205197188) escribio a las 02:40: pago una Coca-Cola que SI esta en su
pedido ($5.000) y el domiciliario no se la entrego. Nadie le respondio. Su
conversacion esta en pestaña humano, asi que Paco no va a contestar nunca.
**Se le aviso a Sergio de inmediato.**

### 2. Ivan: el bucle del "lugar publico" (Paco repitio lo MISMO 3 veces)
Ivan dio su direccion: "Conjunto Okavango Casa A6 **en frente del colegio San
Francisco**". La REFERENCIA (el colegio) hizo que se clasificara como entrega
en lugar publico → frase fija de prepago. El cliente pregunto DOS veces si
podia pagar en efectivo y Paco repitio la MISMA frase identica tres veces, sin
escape ni pase a humano. Sergio lo tomo: "el sistema se volvio un poquito loco".
**Dos bugs:** (a) una referencia despues de un conjunto no es el lugar de
entrega; (b) una frase fija sin limite de repeticiones es un bucle — a la
segunda vez que el cliente responda distinto de "si", debe pasar a humano.

### 3. Monica Ramirez: "pollo" cobrado DOBLE (variante y adicion)
Pidio "Maicitos especial pollo". El resumen dijo "Maicitos especial Pollo
Personal **+ Pollo**": la misma palabra entro como sabor Y como adicion de
pollo ($9.000 de mas). Sergio corrigio a mano. Familia de la colision
variante/adicion (entradas 134/140), caso nuevo: la palabra que YA se uso como
variante no puede entrar ademas como adicion.

### 4. Shirley: el enredo llego a CREAR un pedido fantasma de $66.000
A las 02:11:16 se creo un pedido con los DOS items del estado enredado (Mixta
$25.000 + Premium Mixta $34.000). Sergio lo cancelo a tiempo. Confirma que el
problema de la maquina de estado (entrada 194) no se queda en la conversacion:
llega hasta pedidos reales.

### 5. Juan Sebastian: "por nequi o llave" → el resumen dijo "billetera el parche food"
Mapeo de pago equivocado en el primer resumen (se corrigio solo tras la
pregunta del cliente). Revisar el mapeo de "llave"/"nequi": nunca debe caer en
billetera.

### 6. Las notas del cliente NO llegan a la comanda
- Juana: "Efectivo. **Con 100**" (billete de 100 para el cambio) — no quedo en
  ninguna nota del pedido. El domiciliario no tenia como saberlo.
- Ivan: "te pago con un billete de 100" **dos veces** — tampoco quedo.
- Jose David: "**con pocas salsas**" dos veces — no quedo, y al final llego
  "llena de salsa": la unica QUEJA real de la noche, y era prevenible.
Patron: el dato de "pago con billete de X" y las notas de cocina dichas fuera
del momento exacto se pierden.

### 7. Las llaves de Nequi fallaron para DOS clientes (operativo)
Paula (01:51) y Juan Sebastian (02:06) reportaron por separado que la llave
0092726260 no funcionaba. Sergio improviso dando 3246855568. No es bug de
Paco, pero dos clientes en 15 minutos es patron: verificar la llave con Nequi.

### Lo que SI funciono (para el registro de confiabilidad)
- Juana: pedido completo de punta a punta SIN humano, con conjunto
  ("mayorca" → zona Mallorca por el comparador tolerante).
- Los arreglos de HOY ya operaron en vivo: "Conjunto Okavango" y "torres de
  Milano" aceptados sin pedir calle (entrada 195), y la carta salio siempre en
  imagenes.
- Eider y otros: preguntas de ubicacion/horario respondidas bien.

### A la cola de maNana (ya anotado)
Bucle del lugar publico (2a) · referencia tras conjunto (2b) · variante cobrada
como adicion (3) · mapeo llave→billetera (5) · notas y "billete de X" a la
comanda (6). El 4 refuerza la prioridad de la tarea 0b/1 (maquina de estado).

---

## 199 — Francisco: la pregunta que quedo de nombre y el comprobante en efectivo (18-ago-2026)

Francisco (573114054680) pregunto "Cuanto se demora" justo cuando el flujo
esperaba el nombre → el pedido quedo a nombre de **"Cuanto se demora"**. Y al
decir "Pago con un billete de 100" (ya habia dicho efectivo), Paco le pidio
**el comprobante de pago**.

**Datos corregidos al momento:** el cliente se renombro a Francisco, y a su
pedido (aun abierto) se le agrego la nota "Paga con billete de $100 (necesita
cambio)" — la nota que el flujo habia perdido, la misma clase del hallazgo 6 de
la auditoria.

### Arreglos

1. **Una pregunta no es un nombre** (`PREGUNTA_NO_NOMBRE_RE`): cuanto/cuando/
   donde/demora/tarda/llega/vale/cuesta o un signo de interrogacion. Puesta en
   los **CUATRO caminos** que capturan nombres — los dos de `extractNombre`,
   el paso binario, y el lector GPT (`leido.nombre`), que fue por donde entro
   este caso. Cuatro caminos, una sola regla.
2. **"billete" es señal de EFECTIVO** en el clasificador ("pago con un billete
   de 100" → efectivo).
3. **Regla dura al redactor**: si el pago es en efectivo, JAMAS pedir
   comprobante — el comprobante existe solo para transferencias.

**Verificado en el banco** (conversacion completa de Francisco): a "Cuanto se
demora" ahora **responde la pregunta** ("Unos 30 minutos") y re-pregunta el
nombre; "Francisco" queda de nombre; el resumen sale con 👤 Francisco; y
"billete de 100" ya no dispara comprobante. Control con nombre normal (Camila):
igual que siempre. `delay-reply` v309, smoke 200, pruebas borradas.

### ⚠️ La trampa que ya van TRES veces: regex desde Python

La primera version de la compuerta NO FUNCIONABA y las pruebas salian mal sin
razon aparente. Causa: al escribir la regex al archivo desde un string de
Python, cada `` se convirtio en un **backspace invisible** (0x08) — la regex
compilaba y nunca casaba con nada. Se encontro mirando los BYTES de la linea.
Regla reforzada: una regex JAMAS se escribe a un archivo via string normal de
Python — o Edit tool, o `chr(92)`, y despues verificar los bytes. Y el
desplegador ahora aborta si el archivo contiene 0x08.

---

## 200 — LA COLA: varios productos en un mensaje, y la entrega por intencion (18-ago-2026)

El trabajo grande de la manana (tareas 0a y 1 de la cola, aprobadas por
Sergio). Cierra los abiertos A1 (Emily) y A3 (Mariam/Shirley) del registro.

### 1. La entrega se decide por INTENCION, la lista queda de respaldo

En la rama 14e-PRE ("recoger manda sobre lo guardado"), que era de las que
decidian solo por `LLEVAR_REGEX` (caida 3 veces): ahora mira primero
`intenciones.entrega === "recoger"` — la lectura del clasificador que corre en
cada mensaje. Si vino por la lista se guarda el texto del cliente (como
siempre); si vino SOLO por la intencion se guarda la marca canonica "Para
recoger", porque los 23 controles de rio abajo re-reconocen el texto con la
lista y un "yo caigo por el" no lo pasarian. Cautela: si el mensaje trae una
CALLE de verdad, la intencion no manda.

Probado: "yo caigo por el pedido mas tarde" — forma que NINGUNA lista conocia —
salta la direccion y sigue al nombre. Y "que puedo reclamar con mis puntos?" en
mitad del pedido NO lo vuelve recoger.

### 2. LA COLA: los demas platos del mismo mensaje

`state.cola`: del mensaje con varios platos, el primero sigue el camino de
siempre y los demas esperan con el TEXTO ORIGINAL guardado. Cuando el producto
en curso completa lo suyo (tamano y variantes — el upsell es del pedido, no
del producto), se archiva en items y el siguiente se promueve, resolviendo su
tamano y variante desde ese texto ("coca cola personal" ya trae el tamano
escrito). Lo que no se resuelva, lo pregunta el flujo como siempre.

Reglas que salieron de las pruebas:
- **La variante del primero no es otro plato**: "premium de carne y un hit"
  encolaba un "1x Carne" fantasma ($56.000 en vez de $37.000). Las opciones del
  producto recien detectado no entran a la cola, salvo con su propia palabra de
  categoria pegada ("...y una SALCHIPAPA carne").
- **La palabra de categoria de una bebida no es una adicion**: "un JUGO hit de
  litro" dejaba un "⚠️ Sobre jugo: no esta incluido" en el resumen con el HIT
  ya cobrado. Se descartan en silencio (jugo, gaseosa, bebida...).
- La cola sobrevive al archivado del 14b y se resetea con el estado.
- Lo ambiguo NO se encola: mejor que el flujo lo pregunte.

### Bateria (banco, 8 corridas)

| Prueba | Resultado |
|---|---|
| Mariam: 3 productos en un mensaje (x2 corridas) | Resumen con las 3 lineas · **$33.000 + $5.000 = lo que cobro Sergio** |
| Premium carne + HIT litro en un mensaje | 2 lineas, $37.000; el sabor del HIT se pregunta solo |
| "yo caigo por el pedido" (forma nunca vista) | recoger por intencion |
| Pregunta de puntos en mitad del pedido | NO cambia la entrega |
| Un solo producto (control) | identico a antes |
| "y tambien me das una super queso" (control) | archiva y pregunta variante, como antes |

`delay-reply` v310, smoke 200, 8 conversaciones de prueba borradas.

### Hueco pre-existente anotado (no de este cambio)

En el control del "tambien": a la pregunta de variante ("¿carne o pollo?") el
cliente contesto "No" y Paco se quedo CALLADO (retomo al mensaje siguiente).
Es anterior a la cola (la cola estaba vacia ahi). A la lista de la maquina de
estado.

### Que queda de la tarea 0
- 0c (intencion de CORRECCION: "corrijo" suma en vez de reemplazar) y
  0d (banco de frases) siguen pendientes.
- 0b queda cubierto en la practica por la cola para el caso real (varios
  productos por mensaje); pasar TODO el estado al extractor sigue siendo la
  meta de fondo, pero ya sin un caso que lo urja.

---

## 201 — Corregir REEMPLAZA (0c), y dos minas halladas por el camino (18-ago-2026)

Continuacion de la 200. Tarea 0c del plan de intenciones: "corrijo", "es la X",
"mejor solo la X" hoy SUMABAN un plato en vez de reemplazar — el enredo que
convirtio el pedido de Shirley en un fantasma de $66.000.

### La correccion, modelo primero

- El clasificador aprende **"corrige"** (con el contexto de los ultimos
  mensajes: "si acabas de resumir una cosa y el cliente nombra OTRA parecida
  sin decir 'tambien', esta corrigiendo").
- Respaldo determinista: `CORRIGE_RE` (corrijo, me equivoque, quise decir,
  mejor solo...) y `CORRIGE_ES_LA_RE` ("Es la premium...") — esta ultima solo
  si NO es pregunta.
- En el 14b: corregir **reemplaza** el producto en curso (no lo archiva); con
  "solo/solamente" ademas **vacia** items y cola: el pedido queda unicamente en
  lo corregido.
- La compuerta post-resumen (que solo dejaba pasar "agregar") ahora tambien
  deja pasar la correccion al flujo normal.

### Mina 1: preguntar un precio SECUESTRABA el pedido (pre-existente)

"¿es la premium mas cara?" en mitad de un pedido respondia bien el precio pero
ADEMAS archivaba lo que iba y arrancaba una Premium. Candado: si la intencion
es PRECIO y no PEDIR, y es una pregunta, los nombres del mensaje son tema de
conversacion. "¿me regalas una premium?" (pregunta que SI es pedido) sigue
funcionando — lo decide el clasificador, no el signo de interrogacion.

### Mina 2: el VOLCADO del lector (pre-existente, intermitente)

En la regresion, 1 de 3 corridas de un pedido simple salio con **las diez
adiciones del catalogo** ($26.000 → $1xx.000): ante un mensaje sin contenido
("Camila"), el lector a veces devuelve LA LISTA ENTERA de opciones que se le
mostro — y como todas existen, pasaban la validacion. Compuerta: nadie pide 3+
adiciones sin nombrar NINGUNA; con tres o mas solo entran las que dejaron
rastro en el texto. Con 1-2 se conserva la tolerancia de sinonimos
("papitas" → Papas). Verificado: 0 volcados en 3 corridas y la adicion
legitima ("con tocineta") sigue entrando.

### Bateria (banco)

| Prueba | Resultado |
|---|---|
| "Es la premium mixta" tras resumen equivocado | REEMPLAZA (antes sumaba); pregunta el tamano |
| "Corrijo solo la premium..." con 2 platos | queda SOLO la premium |
| "y tambien una coca cola" (control) | sigue SUMANDO |
| "¿es la premium mas cara?" (control) | responde el precio, el pedido intacto |
| "¿me regalas una premium?" (control) | arranca el pedido |
| Mariam (regresion) | 3 lineas, $33.000 |
| Pedido simple x3 + "con tocineta" | sin volcado; Tocineta entra |

`delay-reply` v311, smoke 200, 13 conversaciones de prueba borradas.

⚠️ **Trampa de entorno confirmada**: los `` escritos via heredoc de Python
llegan partidos (el transporte reduce las barras) y se vuelven backspaces
invisibles. Regla: anclas SIN barras invertidas, regex nuevas sin `` via
heredoc (usar chr(92) o el Edit tool), y el desplegador ya aborta si hay 0x08.

---

## 202 — Los hallazgos de la auditoria del 17-ago, y tres minas mas (18-ago-2026)

Segunda tanda del dia. Se cerraron los puntos 1b del plan (lo que la auditoria
de las 20 conversaciones dejo anotado) y, persiguiendolos, aparecieron tres
cobros equivocados que nadie habia reportado.

### Lo que se venia arrastrando

- **"Por nequi" quedaba cobrado del SALDO del cliente.** El lector recibe la
  lista de metodos con sus nombres pelados; el saldo se llama *"Billetera El
  Parche Food"*, y por llamarse billetera se llevaba cualquier "pago por
  nequi". Ahora cada metodo va con lo que de verdad es (`Transferencia
  (cualquier billetera digital: Nequi, Daviplata, llave, QR...)`, `Billetera
  (SALDO PREPAGADO...)`), hay una regla explicita, y un candado deterministico
  corrige al lector si el texto del cliente nombra una billetera digital.
  Verificado 5 de 5: nequi · llave · QR · saldo · efectivo.
- **Las notas se perdian.** "con POCAS salsas" no entraba porque el disparador
  exigia "poca" y la ese del plural lo tapaba. Y el cambio del domiciliario
  ("con un billete de 100", "no tengo sencillo") no se capturaba en ningun
  lado — la unica queja real de esa noche. Ahora los dos llegan a la comanda.
- **La variante ya no se cobra dos veces** (Monica R.): "maicitos especial de
  pollo" no suma una adicion Pollo.

### Las tres minas nuevas (todas cobraban de mas)

1. **"Con pocas salsas" salia con una adicion Salsa de $2.000** — le cobraban
   al cliente justo lo que pedia que le pusieran MENOS. Si delante del nombre
   hay una palabra que resta (sin, poca, nada de, menos), es preferencia de
   cocina, no adicion.
2. **La variante explicada como adiciones**: "mixta personal" salio con
   adiciones *Carne, Pollo* — $19.000 de mas. El lector explica que una mixta
   ES carne y pollo, y esa explicacion entraba cobrada. Una opcion de variante
   solo entra como adicion si el cliente la nombro.
3. **El lector inventaba la variante y el tamano.** "salchipapa premium
   personal" (sin decir sabor) salia como *Premium MIXTA* — y el sabor decide
   el precio. Ahora, igual que las adiciones, un tamano o una variante que no
   dejo rastro en el texto se descarta y Paco PREGUNTA.

### Y dos del flujo

- **"...con adicion de pollo PARA RECOGER" pedia la direccion.** El limpiador
  de direcciones recorta en "para " y dejaba la palabra suelta *"recoger"*, que
  ya no coincide con ninguna frase de recoger. Ahora cualquier forma suelta se
  guarda como el canonico "Para recoger".
- **Se perdia una linea del pedido**: en "premium de carne y UNA MIXTA
  personal", la mixta se descartaba como si fuera el sabor de la primera. Un
  articulo delante ("una", "otra", "dos") la vuelve plato propio; sin el
  ("premium DE carne y un hit") sigue sin encolarse el fantasma. Ambos casos
  verificados.

### 0e — ya no existe

El hueco anotado ("No" a la pregunta de variante deja a Paco callado) no se
reprodujo: contesta *"Solo me falta este dato 😊"* y repite la pregunta, y a un
"no se" recomienda. Se cierra sin tocar codigo.

`delay-reply` v312, smoke 200, 45 conversaciones de prueba borradas.
Bateria completa: cola de 3 platos ($61.000, 3 lineas), fantasma controlado,
correccion, pregunta de precio, volcado x2, pagos 5/5, notas, adiciones.

---

## 203 — El recibo del cierre imprimia el sencillo y los billetes grandes en CERO (18-ago-2026)

Reportado por Sergio la noche del 17: *"el cierre me da totalmente perfecto,
pero al IMPRIMIR el recibo me sale en cero el sencillo y los billetes de 50 y
100. Antes salia bien; ayer y hoy no"*.

**La causa, y por que aparecio justo esos dias.** El conteo del arqueo decidia
que era billete y que era moneda **por el ORDEN de los bloques en la pagina**:
el bloque 0 eran los billetes. El 16-ago el modal de APERTURA estreno sus
propios bloques de denominaciones, y como estan antes en el HTML, el bloque 0
paso a ser el de la apertura: **todos los billetes del arqueo se contaron como
monedas**. De ahi que el sencillo y los de 50/100 salieran en cero — y que el
TOTAL siguiera perfecto, porque el total no depende del grupo. La pantalla no
delataba nada por lo mismo.

**El arreglo.** Cada bloque del arqueo dice lo que es (`data-grupo="billete"` /
`"moneda"`) y la busqueda se hace DENTRO del panel del arqueo, nunca en toda la
pagina. Tres funciones auxiliares (`cjBloquesArqueo`, `cjGrupoDe`,
`cjInputsArqueo`) y los siete puntos que contaban por orden pasaron a usarlas:
llenar el arqueo guardado, los subtotales en vivo, el total contado, el detalle
que se guarda e imprime, el borrado y los escuchas de teclado.

**Verificado** con una simulacion del mismo DOM (los bloques de la apertura
delante): con el codigo viejo daba `grandes 0 · sencillo 0 · monedas 106.000`
—el sintoma exacto— y con el nuevo `grandes 100.000 · sencillo 5.000 · monedas
1.000`, total igual en los dos. Falta que Sergio lo confirme con un cierre real.

⚠️ **La leccion, que ya cobro dos veces**: identificar algo por su POSICION
(el bloque 0, el primer resultado) se rompe el dia que alguien agrega otro
igual mas arriba, y se rompe en silencio. Se identifica por etiqueta y se busca
dentro de su contenedor.

---

## 204 — La pagina cobraba el domicilio con otra vara que el chat (18-ago-2026)

`web-pedido` comparaba el barrio **letra por letra** contra la tabla de zonas,
mientras Paco usa desde hace semanas el comparador tolerante. Dos verdades para
lo mismo, y la que cobra mal es la de la pagina: cuando no encontraba el
barrio, el pedido entraba con **domicilio en CERO** y alguien tenia que
arreglarlo a mano.

**Lo que se perdia** (medido contra la tabla real, 120 barrios + 51 conjuntos):

- **Los 51 CONJUNTOS no se miraban siquiera** — el codigo leia `z.barrios` y
  nunca `z.conjuntos`. Quien vive en Guayacanes del Rio, Luna Blanca u
  Okavango pedia siempre con domicilio en cero.
- **Los errores de dedo**: "bolibar" no era Bolivar.
- **El barrio escrito DENTRO de la direccion**: "Calle 5 # 3-20 barrio
  Bellavista" con la casilla del barrio vacia no resolvia nada. Ahora se busca
  primero en la casilla y, si de ahi no sale, en la direccion completa.

**El arreglo** es el mismo bloque de `web-acceso` —que a su vez viene de
`delay-reply`— copiado tal cual: `normalizarTexto`, `levenshtein`,
`fuzzyBarrioMatch` y `zonaDeTexto`, con la regla de quedarse con el nombre mas
largo ("Bella Vista" antes que "Bella") para no cobrar la zona equivocada.

`web-pedido` v15, smoke OK. Verificado corriendo el comparador ya desplegado
contra los 171 lugares reales: Bellavista, "bella vista", "bolibar", el barrio
dentro de la direccion y los conjuntos resuelven; un barrio inventado sigue sin
resolver (entra marcado para que el dueño le ponga precio).

⚠️ Queda una copia del mismo bloque en TRES funciones. Es a proposito (las Edge
Functions no comparten modulos), pero **si cambia la regla hay que cambiarla en
delay-reply, web-acceso y web-pedido a la vez**.

---

## 205 — "No es un barrio": lo rechazado deja de volver (18-ago-2026)

En la lista de barrios por aprobar se colaban **pedidos enteros**: "Me das una
personal premium mixta, con adicion de salchicha" quedo guardado como un barrio
porque el cliente escribio el pedido donde iba la direccion. El unico boton que
habia, *Descartar*, **borra la fila** — y la frase volvia a la lista en cuanto
otro cliente escribiera algo parecido. Una lista que se llena de basura se deja
de mirar, y con ella se pierden los barrios de verdad.

**Ahora hay dos botones distintos**, y la diferencia importa:

| Boton | Que hace |
|---|---|
| Descartar | Borra esa propuesta. Si vuelve a pasar, vuelve a proponerse |
| **No es un barrio** | La marca para siempre. Nunca vuelve |

La marca es una columna `descartado` en `pos_domi_aprendidos`
(`sql/2026-08-18-no-es-un-barrio.sql`, con indice parcial sobre los
pendientes, que son los unicos que se consultan). La miran **las cuatro
puertas**: la pantalla de aprobacion, la campana de avisos, y los dos sitios
que aprenden barrios — `delay-reply` (conjuntos que Paco no conocia) y
`web-acceso` (registro desde la pagina). Sin las cuatro, la frase entraria otra
vez por el hueco que quedara.

`delay-reply` v313 · `web-acceso` v19, ambas con smoke. La frase real que
estaba colada ya quedo marcada: de 14 pendientes a 13.

---

## 206 — La categoria Combos ya se arrastra como las demas (18-ago-2026)

Lo que quedo planteado en la entrada 179: el numero mandaba
(`tenants.web_combos_orden`) pero no habia forma de cambiarlo sin entrar a la
base. Ahora la pantalla de Categorias muestra una tarjeta **Combos** (morada,
con la cuenta de combos activos) intercalada en su puesto, que se arrastra con
el mismo gesto que las otras. Solo aparece si hay combos activos, que es cuando
de verdad sale en la pagina del cliente. No lleva numero: no es una categoria
de la tabla, y numerarla correria la cuenta de las demas.

**Dos cosas que no eran obvias y habrian salido rotas:**

1. **El dueño no puede escribir en `tenants`.** Desde el 3-ago su politica es
   solo SELECT, porque el PLAN vive en esa tabla y con permiso de escritura
   cualquiera se subia a Premium desde la consola del navegador. Un
   `update` desde el navegador habria fallado siempre. Se creo
   `fn_set_combos_orden(int)` (SECURITY DEFINER) que cambia **ese campo y nada
   mas**, y solo del propio negocio.
2. **El puesto empataba con una categoria.** El numero se lee como "cuantas
   categorias van antes", asi que un 2 significa "despues de la segunda" — pero
   la carta ordenaba por ese numero y desempataba **por nombre**: el mismo 2
   ponia Combos antes o despues segun como se llamara la categoria. Y el
   desempate no se podia poner en el ORDER BY porque **un UNION solo acepta
   nombres de columna**, no expresiones (lo aprendi rompiendo la carta un par
   de minutos: la funcion se creo bien y reventaba al ejecutarse). Va en el
   numero: las categorias ocupan los pares (1→2, 2→4) y Combos el impar
   siguiente a su puesto (2→5). Ese `orden` solo sirve para ordenar; la pagina
   del cliente no lo lee.

**Verificado contra la carta real de El Parche** (8 categorias), moviendo el
puesto y volviendolo a dejar en 0: con 0 va primera, con 2 entra tercera, con 3
cuarta, y un numero grande la manda al final. Y la logica del guardado probada
aparte: mover Combos escribe solo su puesto, mover una categoria escribe solo
los `sort_order`, y volver a dejar todo igual no escribe nada.

SQL: `sql/2026-08-18-combos-orden.sql`.

---

## 207 — Paco ya no repite la misma frase tres veces, y la tercera vez del volcado (18-ago-2026)

### El bucle del prepago (Ivan, 17-ago)

A quien pregunto *"¿y no se puede en efectivo?"* se le contesto la misma frase
de prepago **tres veces seguidas, palabra por palabra**. Una frase fija que no
responde y se repite es lo que hace que el cliente se vaya. Ahora, a la
**segunda** vez que haria falta decir lo mismo, la conversacion pasa a una
persona (`human_takeover`): si la explicacion no basto a la primera, no va a
bastar a la tercera. Cubre las **tres** ramas que mandan esa frase (el pedido
en espera de comprobante, el resumen y la confirmacion) — con una sola habria
quedado el mismo bucle por otro camino.

⚠️ **Donde vive la cuenta importo mas que la cuenta.** El primer intento la
guardaba dentro de `pending_order_data`, y ahi se perdia: ese campo se
reescribe entero varias veces por mensaje con el estado del pedido. La frase
se repetia igual con el contador puesto. Vive en su propia columna,
`chat_conversations.bucles` (`sql/2026-08-18-frenar-bucles.sql`). **Una cuenta
que no es del pedido no puede vivir dentro del pedido.**

### El volcado del lector, tercera aparicion — ahora si de raiz

El 18 por la manana se le puso compuerta con 3 o mas adiciones; por la tarde el
caso caro aparecio **de a dos**: un simple "salchipapa mixta personal" salio con
adiciones *Carne* y *Pollo* —lo que SIGNIFICA una mixta, explicado por el
lector— y **$19.000 de mas**. Ahora **toda** adicion tiene que haber dejado
rastro en lo que escribio el cliente, sin excepcion por cantidad. Los sinonimos
y los errores de dedo siguen entrando por una tolerancia de dos letras
(`levenshtein <= 2` en palabras de 5 o mas); lo que ya no entra es lo que nadie
nombro.

Y la nota dejo de llevarse la entrega: "pocas salsas **para recoger**" llegaba
asi a la comanda; el corte de la frase ahora tambien para en "para
recoger/llevar/domicilio".

`delay-reply` v314, smoke 200, 13 conversaciones de prueba borradas.
Verificado: escala a persona a la segunda insistencia · no escala en un pedido
normal · el caso caro queda en $34.000 en vez de $53.000 · "con tocineta" y
"con tocineta y maicitos" siguen entrando · Mariam 3 lineas $61.000 ·
correccion · notas.

**Hueco pequeño conocido, anotado a proposito**: "papitas" ya no entra como
adicion Papas — lo bota la compuerta vieja de "nacio de una palabra compuesta"
(de "salchipapa" salia "papa" y costo $8.000 a un cliente real). Se pierde un
cobro raro para no repetir un cobro de mas; si aparece de verdad, se afina.

---

## 208 — El camino hermano del pedido (A2), y "Salchipapas TrADICIONales" (18-ago-2026)

### A2, que llevaba vigilado desde el 15-ago

`resolverPedido` de `verify-transfer` —el que crea el pedido cuando se verifica
la transferencia— tiene su PROPIO emparejado de items y se habia quedado con la
comparacion de categoria por **igualdad exacta**: el lector dice "salchipapa" y
la categoria se llama "Salchipapas Tradicionales", asi que no casaba nunca y el
desempate caia al primero de la lista, que suele ser el de Adiciones. Los
totales salian bien (vienen de `total_mostrado`), pero **la comanda podia salir
con el nombre y el precio de la categoria equivocada**, y eso es lo que se
cocina. Ahora tiene los mismos tres desempates de la entrada 140: categoria
tolerante, el tipo de comida dicho dentro del nombre, y que una adicion nunca le
gana a un plato. Verificado 7 de 7 en las combinaciones de categoria.

### Y el pedazo que se escondia dentro de una palabra

Probando lo anterior salio algo peor, y estaba en produccion: la regex que
decide si una categoria es de adiciones no exigia que la palabra EMPEZARA, y
**"Salchipapas Tr-ADICION-ales" contiene "adicion"**. La categoria mas vendida
del restaurante estaba clasificada como si fuera de adiciones — eso alimenta
`dondeVive`, que es quien decide si un nombre es un plato o algo que se le pone
encima. Corregido en los dos sitios (`CAT_ES_ADICION` de delay-reply y el nuevo
de verify-transfer).

`delay-reply` v315 · `verify-transfer` v39, ambas con smoke.
Regresion en banco 5 de 5: pedido simple $26.000 · con tocineta $36.000 ·
"salchipapa de pollo" (Emily) $18.000 y no los $9.000 de la adicion · Mariam 3
lineas $61.000 · "ranchera con super queso" cobra la adicion $40.000.

⚠️ **Dos lecciones del mismo dia, y son la misma**: identificar algo por su
POSICION (el bloque 0 del arqueo) o por un PEDAZO de su nombre ("adicion"
dentro de "Tradicionales") funciona hasta que alguien agrega algo parecido —
y falla en silencio.

---

## 209 — El banco de frases reales (0d) (18-ago-2026)

Ultimo punto del plan de intenciones. En vez de inventar frases de prueba, se
sacaron **1.200 mensajes reales de clientes** de la base y se corrieron los
reconocedores contra todos de una vez, fuera de linea (sin gastar un solo
mensaje ni tocar una conversacion).

### Lo que dijo la medida

**Entrega (recoger).** De 16 frases reales que hablan de recoger, la lista
deterministica falla en **2**: *"ya recojo la otra"* (la lista espera "la
recojo", no "recojo la") y *"ya pasan por el, lo recoge Fabian"* (en tercera
persona). **Las dos las resuelve bien el camino de INTENCION** — probadas en el
banco, las tres guardan "Para recoger". Es la prueba de que el trabajo del 0a
sirvio: la lista de frases dejo de ser lo que decide.

**Pago.** De 61 frases reales que hablan de pago, tres salian raras y una era
un cobro equivocado de verdad:

- *"¿Que es billetera el parche food?"* dejaba el pedido cobrado **a la
  billetera del cliente**. Preguntar por un metodo no es elegirlo. Candado: si
  el mensaje es una pregunta y el clasificador no ve intencion de pago, los
  nombres que aparecen son tema de conversacion — el mismo candado que ya tenia
  preguntar un precio. Verificado que *"¿te transfiero?"* (una pregunta que SI
  elige) sigue funcionando.
- *"Me regalas el total para transferir"* no lo resuelve el texto; lo agarra el
  clasificador por intencion. Sin cambio.
- *"Billetera"* a secas se lee como transferencia. Es lo correcto en Colombia
  (Nequi, Daviplata), y el saldo se nombra con "saldo" o "monedero". Queda
  anotado por si algun dia molesta.

`delay-reply` v316, smoke 200. Sin conversaciones de prueba en la base.

**El metodo queda montado y vale para cualquier reconocedor**: sacar las frases
de `chat_messages`, extraer la funcion del codigo desplegado y correrla contra
todas. Encontrar un fallo cuesta segundos en vez de una conversacion entera.

---

## 210 — Corregir a mitad del pedido: cambiar, agregar y quitar (18-ago-2026)

La caja que Sergio tenia enunciada desde hace semanas —*cambiar reemplaza,
agregar suma, quitar elimina*— estaba a un tercio: el 18 por la maNana quedo
lista la de CAMBIAR de producto. Probando las otras dos aparecieron **tres
fallos, y los tres le cobran mal al cliente o le mienten**.

### 1. Quitar solo funcionaba despues del resumen

"quitame la tocineta" dicho **mientras se arma el pedido** —que es cuando mas
se dice— no hacia nada: la adicion seguia puesta y se cobraba. El motor de
quitar vivia dentro del bloque del resumen. Ahora corre en cualquier momento,
antes de que los extractores puedan volver a meter lo que se acaba de sacar, y
ademas saca de **la cola** los platos que todavia no han entrado.

### 2. Cambiar la direccion: Paco decia que si y no cambiaba nada

"mejor mandalo a la calle 15 # 8-30, barrio Bella Vista" despues del resumen:
Paco contestaba *"¡Claro! Entonces cambiamos la direccion..."* y el pedido
conservaba **la direccion vieja, el barrio viejo y el domicilio viejo**. El
domiciliario salia para la otra punta y el cliente se quedaba tranquilo porque
el bot le dijo que si. Ahora se reemplaza y **se limpia lo que depende**: el
barrio y el precio del domicilio se recalculan (probado: de Bolivar $8.000 a
Bella Vista $5.000, total de $34.000 a $31.000).

⚠️ Y un candado que no existia: **si el pedido YA salio a cocina** (la
conversacion tiene `order_id`), cambiar el estado del chat no cambia la comanda
impresa. Ahi la correccion va a **una persona**, con un mensaje que no promete
nada que el bot no pueda cumplir.

### 3. Agregar tras el resumen: el resumen decia una cosa y el pedido otra

"agregame una coca cola personal" caia al camino conversacional, donde el
modelo **redactaba** un resumen con la gaseosa incluida... que no estaba en el
pedido. El total decia $31.000 y la comanda llevaba solo la salchipapa. Dos
causas encadenadas:

- La puerta de "agregar" solo abria si el lector devolvia `producto`, y despues
  del resumen casi nunca lo devuelve (ya hay un plato en curso y lo lee como un
  aNadido). Ahora tambien abre cuando **el catalogo** reconoce un plato nuevo en
  el mensaje.
- Y una vez abierta, "agregame UNA coca cola" entraba como **adicion**: los
  verbos de agregar viven en los dos mundos. Lo que los separa es el ARTICULO —
  "agregale queso" le pone algo al plato, "agregame UNA coca cola" pide otra
  cosa. Sin eso se cobraban los $5.000 pero la gaseosa salia impresa como
  topping de la salchipapa.

### El cuarto fallo, que solo salio al probar el arreglo

Con la puerta ya abierta, "agregame UNA coca cola" seguia entrando como
adicion: la regla del articulo estaba escrita **despues** de que el modelo ya
habia decidido (`intenciones.agregados`), asi que nunca corria. Subida junto a
`PIDE_OTRO_PLATO` —las reglas que el dueNo enuncio van ANTES que el modelo—
quedo en 4 de 4, con los controles de que "con super queso" y "agregale super
queso" siguen siendo adicion.

### Verificado

Bateria final de 9 en el banco: quitar adicion · quitar producto · cambiar direccion
· cambiar producto · agregar producto · cola de 3 ($61.000) · sin volcado ·
notas y pago, y adicion de verdad. `delay-reply` v317, smoke 200, 37
conversaciones de prueba borradas.

⚠️ **Tercera vez en dos dias con la misma trampa del entorno**: un `` escrito
por el camino de siempre llego partido y dejo un backspace invisible en el
codigo. Se reconstruyo la expresion con `new RegExp` y cadenas explicitas. La
comprobacion de `chr(8)` antes de desplegar es lo unico que lo caza.

---

## 211 — El inventario por WhatsApp llevaba dias MUERTO (18-ago-2026)

Sergio: *"algo se daNo en el numero gerente, le digo que necesito modificar
algo y no me entiende"*. No era el entendimiento: **la funcion nunca llegaba a
ver el inventario**.

### Dos fallos encadenados

1. **El stock se mudo de tabla y nadie actualizo esta funcion.** Cuando el
   inventario paso a existencias por sede, `iv_insumos.stock`,
   `.stock_servicio` y `.agotado_manual` se renombraron a `*_migrado_no_usar` y
   el dato real quedo en `iv_existencias`. `gerente-inventario` seguia pidiendo
   las columnas viejas: **HTTP 400** en el SELECT y PATCH que no escribian
   nada. Ahora lee como la pantalla (insumos de la MARCA + existencias de la
   SEDE) y escribe por `fn_iv_fijar_existencia`, que crea la fila si no existe.

2. **`iv_existencias` nacio SIN permisos para `service_role`** — la unica tabla
   `iv_*` en ese estado. Con las columnas ya corregidas, el SELECT devolvia
   **403** y el gerente recibia "No encuentro insumos". Es la misma trampa de
   las recargas: una tabla creada por la API de gestion no le da permiso a
   nadie sola. `GRANT` + `notify pgrst, 'reload schema'`.

### Y ya que estaba, tres mejoras

- **Modo simulacion** (`simular: true`): entiende la lista y dice que HARIA sin
  tocar nada. Es lo que faltaba para poder cargar un conteo entero con
  confianza: se revisa y despues se aplica.
- **Los alias entran al reconocimiento.** `iv_insumo_alias` existia (la llenan
  las facturas del proveedor) y esta funcion la ignoraba: "maiz", "salchicha
  manguera" o "carne espaldilla" se perdian en silencio. Ahora puntuan igual
  que el nombre y se le muestran al modelo. Cargados 17 alias con las palabras
  que Sergio usa de verdad.
- **Cuatro reglas nuevas** en el prompt, todas sacadas de fallos reales de su
  conteo: "2 paquetes + 11 unidades" es UN total (antes la segunda op PISABA a
  la primera y quedaba lo poquito) · nunca cantidades negativas · una linea con
  varios productos ("Pan (perro 10, sandwich 6, hamburguesa 3)") son tres
  insumos · errores de dedo en la unidad ("50kh" = 50 kg).

### Medido con el conteo real de Sergio (38 lineas)

| | Antes | Despues |
|---|---|---|
| Lineas entendidas | 0 (la funcion ni arrancaba) | 55 operaciones |
| Papa "50kh" | 5 kg | **50 kg** |
| Maiz, carne espaldilla, salsa roja | se perdian | entran por alias |
| "2 paquetes + 11 unidades" | quedaba en 11 unidades | **2,39 paquetes** |
| Pan hamburguesa | **-3** unidades | 3 unidades |

Siguen mal 4 de 38 y quedan anotadas: "1 paquete (10) + 1 unidad" (la suma
entre parentesis), "media unidad" leido como 0,1, "1 paquete" de una salsa que
se compra por galon (unidad que no existe en el sistema), y una bodega que
salio en 0. Con el modo simulacion se ven antes de aplicar.

### La cuenta la hace el CODIGO, no el modelo (lo que faltaba)

Con el texto ya ordenado seguian saliendo mal tres lineas, y las tres eran de
ARITMETICA: la papa (bulto de 43.000 g) daba 0,12 bultos en vez de 1,16; el
jamon (paquete de 90) daba 1,43 paquetes en vez de 0,14; "0.5 unidades" de
tomate salia 0,1. El modelo entiende perfecto QUE dijo el gerente y se equivoca
CONVIRTIENDO — y eso no se arregla con mas instrucciones.

El prompt ya pedia `unidad_dicha` y `cantidad_dicha` (lo dicho tal cual, sin
convertir), pero solo se usaba para RESPONDER. Ahora `recalcular()` rehace la
cuenta antes de aplicar: si lo dijo en la unidad de compra se usa tal cual; si
lo dijo en la de uso se divide por la conversion; y si es peso o volumen se
pasa por gramos o mililitros. Unidades que cada negocio define a su manera
(libra, arroba, paca) NO se adivinan: ahi se respeta lo que calculo el modelo,
asi que nunca queda peor que antes. Cada correccion queda en el log.

**Resultado con el conteo real de Sergio, ya ordenado: 57 operaciones, 40 de 40
lineas correctas.** El modelo pone el entendimiento, el codigo pone la cuenta.

⚠️ **Cuarta vez con la trampa del entorno**: `join("
")` escrito por el camino
de siempre llego con un salto de linea DENTRO de la cadena → BOOT_ERROR, y la
API reportando ACTIVE como siempre. Se resolvio con `String.fromCharCode(10)`.

---

## 212 — "Por ahora solo entiendo texto": tres fallos en fila (18-ago-2026)

Sergio mando el conteo ya ordenado y el bot contesto *"Por ahora solo entiendo
*texto* para el inventario"* — a un mensaje de texto. Rastreado, eran tres
cosas encadenadas, y ninguna era la que decia el mensaje.

1. **`factura-inventario` estaba rota por la misma mudanza** que
   `gerente-inventario` (entrada 211): pedia `iv_insumos.stock`, recibia 400 y
   contestaba "No encuentro insumos en el inventario de esta sede" a CUALQUIER
   texto, en vez de su `sin_factura`.
2. **El webhook tomaba esa respuesta como buena.** El texto del gerente pasa
   primero por la funcion de facturas (por si esta confirmando una), y bastaba
   con que contestara *cualquier cosa* para que el inventario por texto no
   corriera. Ahora solo se le hace caso si de verdad hay una factura esperando
   (`sin_factura !== true`).
3. **El aviso colgaba de un `else` mal puesto**, y ese `else` PISABA lo que ya
   estuviera escrito. Efecto secundario que nadie habia reportado: **mandar la
   foto de una factura SIEMPRE respondia "solo entiendo texto"**, aunque la
   factura se hubiera leido bien. Ahora el aviso solo sale si no hay respuesta,
   y menciona las fotos, que si se entienden.

### Y una bomba vieja encontrada de paso

La version DESPLEGADA de `factura-inventario` tenia **cuatro backspaces** donde
debia decir ``: la regla de "aplica todos los precios" no podia coincidir
nunca. Es la misma trampa del entorno de las entradas 201/210/211, pero esta
llevaba semanas viva en produccion. Reparada al mismo tiempo.

⚠️ La funcion **no estaba en el repositorio** — solo desplegada. Ya quedo
guardada en `supabase/functions/factura-inventario/`. Al bajarla con `/body` hay
que reconstruir la primera linea, que llega mordida.

---

## 213 — TURNO DE CONSUMO: la porcion real, no la del papel (19-ago-2026)

Idea de Sergio: hay insumos que la receta no controla porque manda la mano de
quien sirve — el maiz, el ripio, las salsas. Se abre turno diciendo con cuanto
se empieza y se cierra diciendo con cuanto se termina; el sistema despeja lo que
DE VERDAD se gasto y **recomienda la porcion real de cada producto y cada
presentacion** (una familiar no es una personal, y una hamburguesa con maicitos
no es una salchipapa).

### Como funciona

- `abro turno con maiz 5 kg, ripio 3 kg` → guarda con cuanto se empieza.
- `cierro turno con maiz 2.3 kg` → calcula **real = inicio + repuesto − fin**,
  lo compara con el teorico (que el inventario ya calcula en cada venta) y
  devuelve la recomendacion por receta.
- `aplica` / `aplica familiar` / `no` → cambia **solo la porcion**.

Lo entiende el MISMO lector del inventario y la conversion la sigue haciendo el
codigo (entrada 211): "maiz 3.5 kg" se entiende igual en un turno que en una
actualizacion. Lo unico que cambia es donde se guarda el numero.

### La honestidad del metodo, que es lo importante

Al cerrar hay **un solo numero** (se gastaron 2.700 g) y **siete incognitas**
(las siete recetas que llevan maiz). Una ecuacion con siete incognitas no se
resuelve, asi que la etapa 1 reparte la diferencia pareja —con el supuesto
declarado en el mensaje— y muestra el numero de cada receta en sus propios
gramos. La etapa 2 (pendiente) usara varios turnos: como la mezcla de lo vendido
cambia cada dia, con 10-15 turnos se puede despejar cada porcion por separado.

Tres candados para no dar consejos malos: no opina con menos de 10 platos (seria
la bascula), ni con diferencias bajo el 10% (ruido de medicion), y si el gasto
se dispara sin mas ventas lo llama por su nombre — eso es merma, no porcion.

### Lo que toca al aplicar

Regla literal de Sergio: *"sin cambiar absolutamente nada mas, ni precios, ni
unidad ni nada, solo cambiaria la porcion"*. `fn_turno_aplicar` escribe UNA
llave dentro de `cantidades` con `jsonb_set` y nada mas; el resto de la receta
(merma, insumo, las OTRAS presentaciones) queda intacto. Cada cambio deja
rastro en `iv_receta_ajustes` (de cuanto a cuanto, que turno, quien aprobo).

El cierre ademas **deja el inventario al dia**: es un conteo, y pedirlo dos
veces seria absurdo.

### Verificado contra ventas reales

Turno sobre las ventas del 17-ago (17 platos, 2,0 kg teoricos), cerrado
simulando 35% de mas:

```
Maicitos — gastaste 2700 g, las recetas decian 2000 g
   Se sirvio 1.35x la receta (35% de mas), en 17 platos.
   • Premium Familiar: 200 → 270 g   (2 vendidas)
   • Premium Personal: 100 → 135 g   (8 vendidas)
   • MAICITOS Personal: 100 → 135 g  (1 vendida)
   • Maicitos Especial Personal: 100 → 135 g (5 vendidas)
```

`aplica familiar` cambio exactamente dos recetas y dejo las personales en 100.
Recetas, existencias y turnos de prueba devueltos a como estaban.

SQL en `sql/2026-08-19-turnos.sql`, `-turno-analisis.sql` y `-turno-aplicar.sql`.
Marcados para turno: maiz, papa, queso, ripio y las cuatro salsas.

---

## 214 — Auditoria: cada canal descuenta igual (19-ago-2026)

Sergio pidio comprobar que un plato descuente sus insumos venga de donde venga.
**Ningun canal descuenta por su cuenta**: todos escriben el pedido en la base y
ahi dos disparadores hacen el trabajo — `trg_iv_item_cocina` (al salir a cocina)
y `trg_iv_orden_pagada` (al quedar pagado). `fn_iv_consumir_item` es idempotente,
asi que pasar por los dos caminos descuenta una sola vez.

Medido sobre **251 items reales de 14 dias** (solo productos con receta):

| Origen | Items | Descontaron |
|---|---:|---:|
| Salon (chat) | 111 | 111 |
| Domicilio (chat) | 72 | **70** |
| Salon (manual) | 36 | 36 |
| Venta rapida (manual) | 22 | 22 |
| Venta rapida (chat) | 10 | 10 |

Los dos fallos son el mismo caso: **dos HIT sin sabor capturado**. Las recetas
del HIT son por variante, y con `vars: {}` no habia de donde descontar. No es
del canal: es la captura de la variante, arreglada hoy.

⚠️ De la **pagina de clientes no hay ni un pedido real todavia**, asi que ese
camino esta verificado solo por codigo (nace `pendiente_pago` → `web-pagar` lo
pasa a `paid` → dispara). Los combos si estan cubiertos: guardan `combo_items`
y `fn_iv_consumir_item` los recorre uno por uno.

**Pendiente que salio de aqui:** hoy, si un item con receta no descuenta, nadie
se entera. Falta un aviso que lo cace solo.

---

## 215 — Precios: por factura y por mensaje suelto (19-ago-2026)

### 1. Por foto de factura — ya existia, comprobado que sigue vivo

Sergio pidio verificarlo porque llevaba dias sin usarse. Se volvio a pasar **la
foto real de su ultima factura** (QUESERA Y SALSAMENTARIA PORKIS, $163.500,
guardada en `iv_facturas_pendientes`) y respondio bien: reconocio las 6 lineas,
las emparejo con sus insumos y **detecto el cambio de precio**:

```
✅ Maicitos +2 kg
    ⚠️ subió de $7.900 a $8.900
Los precios con ⚠️ NO los cambio solo.
Si alguno ya es el precio de siempre, dime: SÍ, actualiza el precio de Maicitos.
```

El criterio ya estaba bien pensado y se respeta: una subida fuerte **no se
aplica sola**, hay que nombrarla (o decir "todos los precios").

⚠️ **Pero la confirmacion estaba rota, y era culpa del arreglo de la entrada
212**: `sedeF` se calculaba dentro de `cargarInsumos` y se usaba tambien al
aplicar → `ReferenceError: sedeF is not defined`. Salio en la prueba de punta a
punta, no leyendo. Ahora vive en `sedeExistencia(branch_id)`, que usan los dos
momentos. Verificado con una factura de prueba de 0,001 kg: sumo la cantidad y
cambio el precio, y se devolvio todo.

⚠️ Y se confirmo que el `` reparado hoy importaba: la frase "todos los
precios" es la que aplica todos de una.

### 2. Por mensaje suelto — nuevo

`actualiza el precio del galon de salsa rosada en 45000` · `el kilo de maiz
ahora cuesta 8900` · `la papa subio a 380 mil el bulto`. Accion nueva `precio`:
**solo toca el precio**, nunca la cantidad — y la respuesta lo dice
expresamente ("no toque la cantidad: sigue en 3.500 g").

Si el precio viene en otra unidad se convierte con el mismo motor determinista
del inventario: "el kilo de papa a 8.900" con la papa en bultos de 43 kg son
$382.700 el bulto. Cobrarlo como $8.900 por bulto dejaria el costo de los
platos por el piso.

### El fallo que solo aparecio probando

`actualiza el precio...` empieza por "actualiza", y el comando del turno
(`aplica|actualiza|cambia`) se lo tragaba: contestaba *"no tengo
recomendaciones pendientes"*. Tres candados:
- La respuesta al turno tiene que **parecer** una: corta (≤40 caracteres), sin
  cifras y sin las palabras precio/inventario/stock/compre.
- El "no" solo cuenta si el mensaje **es** eso. Antes "no hay salsa de ajo"
  habria contestado "dejo las porciones como estan".
- Y si no hay recomendaciones pendientes, el mensaje **sigue de largo** al
  camino normal en vez de quedarse ahi.

Los tres controles verificados. Precios de prueba devueltos a los de Sergio
(los numeros los decide el).

---

## 216 — El fondo del mensaje, a gusto del restaurante (19-ago-2026)

El bloque de bienvenida del inicio ("Pide hoy y suma puntos") era un degradado
vino tinto **escrito en el CSS**: el mismo para todos los restaurantes. Uno de
los residuos de la auditoria multi-restaurante, y Sergio pidio poder cambiarlo.

### Tres formas, elegidas en "Mi pagina web" → Que ve el cliente

- **Un color** · **Un degradado** (dos colores + inclinacion) · **Su propia
  imagen**.
- Seis combinaciones listas (Vino, Noche, Cafe, Bosque, Oceano, Ciruela) para
  quien no quiera pelear con un selector de color.
- Con imagen va **siempre un velo oscuro encima, graduable pero no apagable**:
  el texto es blanco y sobre una foto clara desaparece. El velo no es un
  adorno, es lo que deja leer — por eso el control dice "que tan oscura va la
  capa de encima" y avisa que bajarla mucho pierde las letras.

**La muestra es el bloque de verdad**, con su titulo, su subtitulo y sus dos
botones. Un cuadro de color suelto no dice si el texto se lee; este si. Los
colores y la inclinacion se mueven EN VIVO y solo se guardan al soltar: guardar
en cada movimiento del dedo serian docenas de escrituras.

### Como se guarda

`tenants.web_banner` (jsonb) y `fn_web_publica` lo devuelve como una columna
mas — la pagina del cliente ya recibia esa fila entera, asi que el dato llega
solo. Nulo = el vino tinto de siempre, que sigue viviendo en el CSS.

Al cambiar de tipo se limpia lo que no pertenece (una imagen guardada bajo
tipo "color" es una configuracion a medias que despues nadie entiende).

### Verificado

Los tres tipos guardados de verdad y leidos por `fn_web_publica`. Y la funcion
que traduce la configuracion a estilo, probada en un navegador con ocho casos,
aplicando el estilo a un elemento real para ver si el navegador lo acepta:

| Caso | Resultado |
|---|---|
| color · degradado · imagen | CSS valido y aplicado |
| imagen sin velo | velo por defecto 0,55 |
| velo absurdo (9) | vuelve a 0,55 |
| imagen sin URL | sin estilo → queda el fondo de siempre |
| intento de inyeccion en el color | escapado; el navegador lo ignora |

⚠️ No se probo en la pagina en vivo: entra con sesion de cliente y no se usan
las credenciales de Sergio. Falta que el lo abra y confirme.

---

## 217 — El ahorro del combo, en la cuenta (19-ago-2026)

Pedido de Sergio: en el resumen del pedido, donde el cliente ve el total y los
puntos, decirle **cuanto se esta ahorrando** por llevarlo en combo. Es el
argumento mas fuerte que tiene ese pedido y estaba invisible.

### De donde sale el numero

`fn_web_carta` ya arma cada combo con forma de producto; ahora ademas calcula
`valor_normal` (lo que valdria cada cosa por separado) y `ahorro`. Dos
decisiones que importan:

- **Con el precio de HOY**, no con el que quedo copiado dentro del combo el dia
  que se armo. Si el dueNo sube el precio de la Coca Cola y aqui siguiera el
  viejo, le estariamos prometiendo al cliente un ahorro que no es. El precio
  copiado solo se usa si el producto ya no existe.
- **Nunca negativo**: si un combo quedo mas caro que sus partes, eso no es un
  ahorro y no se dice nada. Callar es mejor que mentir, y mejor que gritarle al
  dueNo que su combo esta mal armado delante del cliente.

Con los combos reales: el Familiar de Hamburguesa vale $80.000 y por separado
$110.000 → **ahorra $30.000**. El de Sandwich, $35.000 contra $39.000 →
**$4.000**.

### Donde se ve

Debajo del Total y antes de los puntos, en verde y con su propio fondo: es
plata que el cliente NO paga y no puede confundirse con un cargo mas. Suma
todas las lineas de combo del carrito y multiplica por la cantidad. Si no hay
combos no aparece nada — anunciar "ahorras $0" es peor que callar.

### Verificado

La logica corrida en un navegador con ocho casos y los datos reales:

| Carrito | Dice |
|---|---|
| Un plato suelto | (nada) |
| Combo Sandwich | Te ahorras $4.000 |
| Combo Familiar | Te ahorras $30.000 |
| Los dos combos | Te ahorras $34.000 |
| Combo + plato suelto | Te ahorras $4.000 |
| Tres Combos Sandwich | Te ahorras $12.000 |
| Ahorro negativo | (nada) |
| Linea vieja sin el dato | (nada) |

SQL en `sql/2026-08-19-combo-ahorro.sql`.

---

## 218 — La pantalla de "pedido recibido", pulida (19-ago-2026)

Sergio hizo un pedido de prueba de punta a punta —**funciono completo**, es la
primera vez que la pagina cobra de verdad— y de ahi salieron cuatro detalles.

1. **El logo del restaurante en vez de la estrella.** Es el momento en que el
   cliente acaba de confiar su plata; ver la marca vale mas que un adorno
   generico. Sin logo queda la estrella.

2. **Los datos de pago ahora se pueden USAR.** Eran una lista muda: la llave
   estaba ahi pero tocaba copiarla a mano mirando la pantalla, y nadie
   explicaba el procedimiento. Ahora el bloque entero abre un instructivo paso
   a paso (el mismo formato del de recargas, que el cliente ya conoce), lo
   anuncia con una pastilla *"¿Cómo transfiero?"*, y **la llave tiene su boton
   de copiar en la pantalla**, sin necesidad de abrir nada. La funcion de
   copiar salio del modal a un solo sitio: la usan los dos.

3. **"Ya transferí" era un recuadro punteado gris** que parecia deshabilitado,
   cuando es LA accion de quien no paga con saldo. Ahora es un boton con borde
   dorado y su clip.

4. **"Pago confirmado" no se leia.** El verde era `#7fe6ab`, pensado para fondo
   oscuro: sobre el fondo claro da **1,21 de contraste** (medido). Se creo el
   token `--ok-tx`, igual que se hizo con `--oro-tx`: **#86EFAC en oscuro
   (11,1)** y **#166534 en claro (5,67)**, los dos por encima del minimo de
   4,5. Ademas el aviso cambio de forma: circulo con el visto, titulo y
   explicacion.

   Y en esa misma pantalla ahora se dice **lo que gano**: cuanto se ahorro si
   pidio combo y cuantos puntos sumo. Se calculan antes de vaciar el carrito,
   porque despues no hay de donde sacarlos.

⚠️ El contraste se midio con el algoritmo de WCAG en un navegador, mezclando el
color del aviso con el fondo real de cada tema. La primera opcion (#15803D) se
descarto ahi mismo: daba 3,99 en claro y 3,11 en oscuro.

---

## 219 — Seguimiento del pedido y el primer aviso al celular (19-ago-2026)

Maqueta aprobada por Sergio y construida. Tres piezas.

### 1. Donde vive

**Un boton en la cabecera del inicio, a la izquierda de la foto del cliente**
(sitio elegido por el), con un punto dorado que late — y que se queda quieto si
el celular pide menos movimiento. Solo existe mientras hay pedido: un boton que
lleva a una pantalla vacia es peor que no tenerlo. Ademas una **tarjeta en el
inicio** que ya dice en que va, para no obligar a entrar.

### 2. La pantalla

Cuatro pasos que se adaptan solos: a domicilio termina en *En camino →
Entregado*; para recoger, en *Listo para recoger → Entregado*. **La hora es solo
de lo que ya paso** — nunca una hora futura prometida (decision de Sergio).

Los estados **no se inventan**: son los que el POS ya escribe
(`en_preparacion`, `listo`, `en_camino`, `entregado`), asi que funciona con la
operacion tal como es hoy, sin pedirle un paso extra a nadie. Si llega un
estado que no encaja (un `listo` en un domicilio), la pantalla se queda en
preparacion en vez de romperse.

El dato lo sirve `web-acceso` con la accion nueva `pedido-activo`, que devuelve
lo justo (en que va, a que hora, y que lleva) porque se pide cada 20 segundos.
Activo = de las ultimas 24 horas y sin entregar; el corte por fecha evita que
un pedido que nadie cerro se quede colgado para siempre en la cabecera.

Y el boton de **escribirle al restaurante** abre WhatsApp con el numero de la
sucursal (`branches.phone`, ahora servido por `fn_web_publica`) y el pedido
citado. Sin numero configurado, el boton no aparece.

### 3. El primer aviso al celular

La infraestructura llevaba desde el 16-ago construida y sin estrenar. Sergio
decidio que lo primero son los estados del pedido. Funcion nueva
`avisar-pedido` (usa `npm:web-push` para la parte de criptografia, que a mano
son 150 lineas de ECDH y AES-GCM), colgada de **`cambiar-estado`** — por ahi
pasan TODOS los cambios (POS, chat y cron), asi que no hay tres sitios avisando
y uno quedandose atras. Es best-effort: si el aviso falla, el cambio de estado
ya quedo guardado.

Detalles que importan: el aviso lleva **etiqueta por pedido**, asi el nuevo
reemplaza al anterior en vez de amontonar tres; **no manda a donde ir**, porque
cada restaurante tiene su carpeta y el service worker ya sabe cual es la suya; y
una suscripcion que responde 404/410 **se borra** (ese celular desinstalo la
app; guardarlo es acumular basura).

Se corrigio tambien la letra del permiso: prometia "cuando ganas puntos", que
nadie manda. Ahora dice exactamente los tres avisos que existen.

### Verificado

- La accion `pedido-activo` contra un **pedido real** (uno de hoy, en
  preparacion): devuelve estado, hora, direccion, barrio y lineas.
- `avisar-pedido` arranca, encuentra el pedido y su cliente, y responde
  `sin_celulares` — correcto, porque todavia **nadie ha aceptado el permiso**.
- Las funciones de la pantalla probadas en un navegador con 14 casos: en que
  paso va con cada estado (incluido uno imposible y uno basura), el telefono en
  cuatro formatos, y las fechas. Ahi salio un fallo: una fecha invalida imprimia
  **"invalid date"** en la pantalla del cliente — `toLocaleTimeString` no lanza
  error, devuelve ese texto. Blindado.

⚠️ **Lo que NO se pudo probar**: que el aviso llegue de verdad a un celular.
Hacen falta cero pasos de codigo — solo que Sergio abra la app instalada y
acepte el permiso. Hasta que alguien se suscriba, `pos_web_push` esta vacia.

---

## 220 — El seguimiento no aparecia: dos huecos (19-ago-2026)

Sergio hizo un pedido y no vio nada: ni el estado ni el aviso. El servidor
estaba bien —el pedido existe, `pedido-activo` lo devuelve completo con su
estado, su hora, su direccion y sus lineas— asi que el problema estaba en los
dos extremos.

### 1. El pedido en curso solo se pedia al NAVEGAR

`cargarPedidoVivo()` colgaba de `irA()`. Pero quien entra con la sesion abierta
cae directo en `pantallaDentro()` **sin pasar por `irA`**, asi que el boton y la
tarjeta no aparecian hasta irse a otra pestaNa y volver. Es EXACTAMENTE el mismo
hueco que ya habia mordido con las promos y la carta — y que estaba anotado dos
parrafos mas arriba en el mismo archivo, en `asegurarDatosInicio`. Ahora hay un
`asegurarPedidoVivo()` hermano, llamado desde `pantallaDentro`.

Con dos candados, porque `pantallaDentro` corre en CADA toque: uno mientras la
consulta va en camino y otro de 15 segundos. Probado en un navegador: al
arrancar hace **1 sola consulta** y con 10 toques seguidos sigue en 1.

### 2. Los avisos no se podian encender

El permiso se ofrecia UNA vez, al principio, y solo con la app instalada. Quien
tocara "ahora no" —o quien entrara desde el navegador— **no tenia ninguna forma
de activarlos despues**. Con los avisos del pedido recien estrenados eso pasa de
detalle a estorbo: es la funcion nueva y no habia como encenderla.

Bloque nuevo en **Perfil → Notificaciones**, que dice la verdad de cada caso:
- *Encendidos* — con la lista de lo que se avisa.
- *Apagados* — con el boton que pide el permiso y suscribe el celular.
- *Bloqueados* — no se ofrece boton: el navegador no deja volver a preguntar, y
  mandarlo a uno que no hace nada es peor. Se explica donde se desbloquea.
- *Falta instalar la app* — en iPhone los avisos web solo existen instalada.

⚠️ Sigue sin comprobarse que el aviso LLEGUE: `pos_web_push` esta vacia porque
nadie ha aceptado todavia. Ahora al menos hay por donde aceptar.

⚠️ Y una nota para el futuro: la pagina se cachea por hora (`?v=AAAAMMDDHH`), asi
que un cambio recien publicado puede tardar hasta 60 minutos en llegarle a quien
ya tenia la app abierta. Al probar algo recien subido, recargar.

---

## 221 — Avisos de recarga, y una sola casa para todos (19-ago-2026)

Sergio pidio el segundo tipo de aviso antes de estrenar el primero: **recarga
acreditada**, con el monto, el bono y una frase que invite a pedir.

### Se unificaron en `avisar-cliente`

`avisar-pedido` nacio hace dos horas y ya hacia falta otro. Con dos funciones, el
dia que cambie el formato del envio o se agregue una regla (no molestar de
madrugada, apagar avisos por cliente) habria que acordarse de tocar las dos —
y una se queda atras, que es el error de forma que mas caro sale aqui. Ahora hay
UNA que recibe `tipo` y es dueña de todos los textos; quien la llama solo dice
QUE paso. `avisar-pedido` se borro.

### El texto de la recarga

```
🔔 ¡Recarga lista! 🎉
   Recargaste $50.000 y te regalamos $5.000.
   Tienes $55.000 listos: pide sin sacar la tarjeta 🍟
```

La frase del final la escogio Sergio de una lista de diez. Se descarto la
primera que escribi ("pide sin sacar la tarjeta"): las frases del producto son
decision suya, no mia.

El bono se menciona **solo si existe**: un "+$0 de regalo" es peor que no decir
nada. Y la etiqueta es fija (`recarga`), asi que dos recargas seguidas no dejan
dos avisos — vale el ultimo, que trae el saldo bueno.

### Dos disparadores, porque hay dos caminos

- `web-recarga` — cuando el cliente recarga y el sistema verifica solo.
- `clientes.js` — cuando **Sergio acredita a mano** desde el POS.

No hay un punto unico donde converjan (la funcion de la base acredita en dos
movimientos, plata y bono, y avisar desde un disparador dispararia dos veces o
antes del bono). Los dos llamadores son una linea que entra a la MISMA funcion,
que es donde vive el texto. Lo importante: **acreditar a mano se siente igual
que la verificacion automatica** — si por un lado llega el aviso y por el otro
no, el cliente cree que su recarga no entro.

### Modo vista previa

`previsualizar: true` devuelve el texto tal como le llegaria al cliente, sin
mandar nada. Con eso se revisaron los ocho mensajes (tres recargas con y sin
bono, y los cuatro estados en sus dos variantes) sin provocar una recarga real.
Las cifras salen con formato colombiano: `$115.000`.

⚠️ Sigue sin comprobarse el envio REAL: `pos_web_push` esta vacia hasta que
alguien acepte el permiso. Todo lo demas del camino esta verificado.

---

## 222 — Por que no llegaba ningun aviso: el permiso no es el registro (19-ago-2026)

Sergio: *"yo ya habia aceptado las notificaciones desde antes, ¿eso no cuenta?
¿debo desinstalar la app?"*. No y no. Son **dos cosas distintas**: dar el
permiso (el cuadro del celular) y quedar REGISTRADO en el servidor (guardar el
endpoint del navegador en `pos_web_push`). Lo segundo nunca ocurrio: **cero
celulares guardados**, con el permiso concedido desde hacia dias.

### La causa: permiso denegado sobre la SECUENCIA

`push-suscribir` devolvia `{ok:true}` **sin mirar el resultado del INSERT**, y
el INSERT fallaba. Rastreado hasta el mensaje exacto de PostgREST:

```
42501 · permission denied for sequence pos_web_push_id_seq
```

No era la tabla: era la **secuencia** que genera su `id`. Es la tercera cara de
la misma trampa (las recargas, `iv_existencias`, y ahora esto): lo creado por la
API de gestion no le da permiso a nadie solo. Barrido de todo el esquema:
`pos_web_push_id_seq` era la unica secuencia sin permiso, y de paso aparecieron
6 tablas sin `SELECT` para el servidor (`meta_messages`, `pos_plan_historial`,
`tuto_*`) que habrian dado el mismo fallo mudo el dia que alguna funcion las
tocara. Todas corregidas.

### Tres arreglos para que no vuelva a pasar mudo

1. **`push-suscribir` comprueba que se guardo** y devuelve `no_se_guardo` si no.
   Un `ok` que no mira el resultado es peor que un error.
2. **El registro se repara solo**: con el permiso ya concedido, cada arranque
   comprueba que el celular este registrado. Es barato (el navegador devuelve la
   suscripcion que ya tiene) y arregla a todo el que estuviera en ese limbo
   **sin pedirle que reinstale nada**.
3. **El Perfil dice la verdad**: antes mostraba "Encendidos" solo por tener el
   permiso — justo el caso de Sergio, verde en pantalla y nada llegando. Ahora
   distingue *permiso concedido pero sin registrar* y ofrece terminarlo de un
   toque.

### Verificado

- El registro guarda de verdad (antes: `ok` y cero filas; ahora: `ok` y la fila
  ahi).
- La cadena entera con un celular de mentira: `avisar-cliente` lo encuentra e
  intenta enviar. Falla el envio porque las llaves son falsas, que es lo
  esperado; y si un celular responde 404/410 se borra solo.

⚠️ Falta lo unico que no se puede simular: un celular DE VERDAD suscrito.

---

## 223 — Los avisos LLEGAN (19-ago-2026)

Confirmado con el celular de Sergio: quedo registrado (`web.push.apple.com`,
iPhone) y salio el primer envio real. La cadena completa —permiso, registro,
disparo por cambio de estado, envio— funciona de punta a punta.

### Y de paso, quien mas quedaba por fuera

Al revisar si "le va a funcionar a cualquiera", aparecio una restriccion que nos
habiamos impuesto solos: la app exigia estar **instalada** para poder activar
los avisos. En iPhone eso es una regla de Apple y no hay vuelta. **En Android y
en el computador no**: ahi los avisos funcionan igual desde el navegador, y les
estabamos cerrando la puerta a clientes que podian tenerlos perfectamente.

Ahora la exigencia solo aplica donde de verdad existe (`puedeAvisos()` mira si
es iOS). Comprobado contra seis aparatos:

| Aparato | Antes | Ahora |
|---|---|---|
| iPhone con la app instalada | puede | puede |
| iPhone solo en Safari | no puede | no puede (regla de Apple) |
| Android con la app instalada | puede | puede |
| **Android solo en Chrome** | **bloqueado** | **✅ puede** |
| **Computador con Chrome** | **bloqueado** | **✅ puede** |
| iPad solo en Safari | no puede | no puede |

### Lo que sigue sin cubrir, y hay que saberlo

- **Quien haya dicho que NO** al permiso no se recupera desde la pagina: el
  navegador no deja volver a preguntar. El Perfil lo dice y explica donde
  desbloquearlo.
- **Cada restaurante necesita su propio `sw.js`** en su carpeta (el de El Parche
  tiene su ruta escrita adentro). Va con el alta automatica de la carpeta, ya
  anotada en `MULTITENANT-PENDIENTE.md`.

---

## 224 — Los avisos, con las palabras del restaurante (19-ago-2026)

Los siete textos vivian escritos dentro de `avisar-cliente`: los mismos para
todos y sin forma de cambiar una coma. Ahora se editan en **Mi página web → Qué
ve el cliente → Avisos al celular**, y quedan en `tenants.web_avisos`.

- **Lo que no se toque usa el de fabrica.** Nadie tiene que escribir siete
  mensajes para empezar; y si un dueño borra los dos campos, esa clave se
  elimina y vuelve sola al texto por defecto.
- **Las variables se insertan con un boton** y se llaman en cristiano: "lo que
  recargó", "el regalo", "su saldo", "nombre del negocio". Se meten donde esta
  el cursor, no al final: quien esta corrigiendo la mitad de una frase no
  quiere el nombre pegado al final.
- **La muestra es una notificacion, no un cuadro de texto.** El limite real no
  son los caracteres: son las dos lineas que el celular deja ver, y eso solo se
  entiende viendolo. Se mueve mientras escribe.
- **La recarga tiene DOS textos**, con bono y sin bono, en vez de uno con una
  frase que aparece y desaparece: asi el dueño ve exactamente lo que llega en
  cada caso.
- Una variable mal escrita **se borra al enviar** en vez de salir en crudo en el
  celular del cliente — aunque en la vista previa si se ve, para que la corrija.

Verificado en los cuatro caminos: sin tocar nada, con texto propio, mezclando
propios y de fabrica, y con una variable inventada.

---

## 225 — La campana dejo de gritar (19-ago-2026)

Sergio: *"me llegan notificaciones de absolutamente todos los pedidos... ahi
solo deben salir las personas que se registraron en la pagina y que el sistema
no conoce su direccion"*.

La campana traia las recargas, las solicitudes por confirmar Y todos los barrios
de `pos_domi_aprendidos` — que se alimenta de TRES sitios: la pagina, Paco y el
boton de crear pedido. O sea un aviso por cada pedido que tomaba el asistente.

**Se comprobo antes de tocar**: los 5 barrios pendientes se cruzaron con los
clientes que tienen sesion en la pagina y **ninguno** venia de ahi — todos de
Paco. El diagnostico de Sergio era exacto.

- Columna `origen` en `pos_domi_aprendidos` (`web` | `chat`). Los 14 que ya
  estaban quedaron como `chat`, que es lo que el cruce mostro.
- La campana **solo muestra los de `origen = 'web'`**: un cliente que guardo su
  direccion y espera a que le digan cuanto cuesta llegarle. Lo que aprende Paco
  sigue entrando a la lista para aprobar en Configuracion → Domicilios, pero sin
  interrumpir.
- **Las recargas salieron de la campana.** Las que hay que atender siguen en su
  pantalla, Clientes, que es donde se aprueban. `fuenteRecargas` queda escrita
  por si se quiere volver a colgar.

La regla que quedo escrita en la cabecera del archivo: **la campana es para lo
que pide una DECISION del dueño**. Un buzon que avisa de todo no lo lee nadie, y
entonces tampoco sirve para lo que si importaba.

---

## 226 — El codigo de registro por plantilla (19-ago-2026)

El codigo de verificacion se mandaba como texto plano, y eso **solo llega si esa
persona le escribio al negocio en las ultimas 24 horas** (regla de Meta). Quien
se registra por primera vez normalmente NO ha escrito nunca: se quedaba
esperando un codigo que jamas iba a llegar. Era el caso mas comun, y era justo
el que fallaba.

### Lo que quedo hecho

`mandarCodigo` intenta primero la **plantilla** `codigo_acceso` y deja el texto
plano de respaldo. Mientras Meta no la apruebe —o si un restaurante todavia no
la tiene— el sistema sigue funcionando como hasta hoy en vez de dejar de mandar
codigos. El formato del envio ya esta verificado contra Meta: responde
`132001 · Template name does not exist`, o sea que lo unico que falta es la
plantilla, no el codigo.

El codigo viaja DOS veces (cuerpo y boton), que es como Meta pide las de
autenticacion para que el boton de copiar sepa que copiar.

### Lo que bloquea la creacion (y NO es el codigo)

Primer diagnostico equivocado: crei que faltaba el permiso
`whatsapp_business_management` porque un intento directo con la v22 devolvio
"Application does not have permission". Falso: el modulo `wa-plantillas` que ya
existia **si crea plantillas** con ese mismo token — se comprobo creando una de
utilidad y borrandola enseguida.

Lo que de verdad bloquea es el estado de la cuenta:

```
business_verification_status: pending_need_more_info
```

**El negocio no esta verificado en Meta** — le pidieron mas informacion y quedo
a medias. Sin esa verificacion, Meta no deja crear plantillas de categoria
AUTENTICACION (marketing y utilidad si, por eso las tres que hay funcionan).
Eso solo lo puede resolver Sergio, subiendo los documentos en el Centro de
seguridad de Meta Business.

`wa-plantillas` quedo listo para el dia que se desbloquee: entiende la categoria
AUTENTICACION, que no es una plantilla normal con otro nombre — Meta escribe el
texto y solo se elige la advertencia de seguridad, los minutos de vencimiento y
el boton de copiar.

### ⚠️ El texto NO puede ser identico al nuestro

En las plantillas de categoria **AUTENTICACION** el texto lo escribe Meta y no
se puede cambiar — es su politica para los codigos. Solo se elige si lleva la
advertencia de no compartirlo, el aviso de vencimiento y el boton de copiar.
Meterlo en una plantilla de otra categoria para conservar nuestras palabras
seria peor: Meta rechaza (o sanciona) los codigos fuera de esa categoria.

Configuracion pedida: nombre `codigo_acceso` · idioma es · autenticacion ·
recomendacion de seguridad SI · vencimiento 10 minutos (igual que
`CODIGO_VIVE_MIN`) · boton copiar codigo.

---

## 227 — El barrio nuevo: ponerle precio, y que el cliente no espere (19-ago-2026)

Sergio hizo un pedido desde la pagina con una direccion que el sistema no
conoce. **El aviso llego bien** (la campana ya solo trae los de la pagina), pero
al tocarlo aterrizaba en Configuracion sin nada a la vista.

### 1. El enlace no llevaba a ninguna parte

Apuntaba a `configuracion.html#domicilios` y **el hash no lo lee nadie**: la
pantalla abria en la pestaña que estuviera guardada. Ya existia el mecanismo
bueno (`?s=&tab=&acc=`), solo que sin usar. Ahora el aviso lleva a
`?s=chatia&tab=pedido&acc=p-domi&ver=domiAprendidos`: abre la pantalla, despliega
la fila, deja el bloque a la vista y lo resalta un momento. Se le agrego el
parametro `ver`, que faltaba.

### 2. No habia donde escribir el precio

La fila mostraba **"$0"** y un boton "Agregar a la tabla" que lo habria guardado
asi — regalando el domicilio de ese barrio en cada pedido, sin que nadie se
entere. Los que vienen de la pagina y del asistente entran en cero porque nadie
les ha puesto valor: eso es justo lo que hay que decidir.

Ahora esas filas traen **el precio escribible ahi mismo** (con la direccion del
cliente debajo, que ayuda a ubicar barrios cuyo nombre solo no dice nada),
Enter guarda, y guardar en cero no se deja. Las que vienen de un cobro a mano
conservan su precio y no cambian.

### 3. El cliente NO espera a que le confirmen (regla de Sergio)

Si la direccion nueva la agrega al momento de pedir, **paga su comida ahora y el
domicilio se lo cobra el domiciliario al entregar**. El servidor ya lo hacia
bien —`total` es comida + empaque y `delivery_fee` queda en 0, asi que cobra
solo el pedido— lo que faltaba era DECIRLO:

- En la cuenta previa: *"Domicilio · lo pagas al recibir"* y un aviso explicando
  que paga solo su pedido. Antes decia "se calcula al enviar", que no dice quien
  paga ni cuando.
- En "pedido recibido" y en el seguimiento, lo mismo.
- Y en la **comanda**: `[DOMICILIO POR COBRAR]`. Ese papel es el que lleva quien
  entrega — es el unico sitio donde el aviso llega a quien tiene que cobrar.

### Verificado con su pedido real

`Lomas de San Benito` entro con `origen = web` (la marca nueva funciona), precio
0 y su direccion; el pedido quedo con `total 16.000` y `delivery_fee 0`, o sea
cobrandole solo la comida.

---

## 228 — La verificacion de Meta, y el rodeo que no habia que dar (19-ago-2026)

Para que el codigo de registro le llegue a quien NUNCA le ha escrito al negocio
hace falta una plantilla de categoria AUTENTICACION, y esa categoria estaba
bloqueada. Meta lo dijo con todas las letras al preguntarle por el estado de la
cuenta (`health_status`):

```
WABA ..... AVAILABLE      APP ...... AVAILABLE
BUSINESS . LIMITED   ->   141010: "The Business has not passed business verification"
```

### Lo que se probo antes de entenderlo

Once caminos, todos con el mismo resultado: la plantilla de autenticacion en 8
versiones de la API, con y sin boton, dejando que Meta recategorizara, desde la
biblioteca de plantillas. Y el codigo metido en una plantilla de UTILIDAD —
esa se creo y **Meta la rechazo sola** con motivo `INCORRECT_CATEGORY`, que es
Meta diciendo que un codigo solo puede ir en autenticacion. De control, una
plantilla de utilidad normal se creo sin problema en el mismo minuto: crear
plantillas siempre funciono, lo bloqueado era esa categoria.

### El rodeo (para no repetirlo)

Se buscó un documento que uniera el nombre del negocio con el telefono, porque
el primer rechazo decia eso. Se reviso el RUT (persona natural, con el telefono
correcto pero no es un tipo aceptado), la factura de Claro Hogar (sin ningun
telefono del cliente), la nota credito de Tigo/UNE (sin el numero, factura por
contrato) y el extracto de Nequi (el numero SI aparece, pero como numero de
cuenta). **Nada de eso hacia falta.**

El camino corto era el que Meta ofrece de entrada: en la verificacion, elegir el
**registro publico** del negocio. Ahi ya estaban el nombre, la direccion y la
identificacion fiscal validados contra la fuente oficial, y lo unico pendiente
era confirmar que Sergio es esa persona — se resolvio con un codigo al correo,
sin subir un solo documento.

Leccion, y es de metodo: cuando un formulario ofrece varios caminos, **mirar los
que ofrece ANTES de resolver el que fallo**. Se gastaron dos horas persiguiendo
un documento para un requisito que el camino corto ni siquiera pide.

### Estado

`pending_need_more_info` → **`pending`** (en revision). Al aprobar cae el error
141010 y se puede crear la plantilla.

`wa-plantillas` ya entiende la categoria AUTENTICACION (que no es una plantilla
normal: Meta escribe el texto y solo se elige la advertencia de seguridad, los
minutos de vencimiento y el boton de copiar), y `web-acceso` ya intenta la
plantilla `acceso_codigo` antes de caer al texto plano. Falta solo que Meta
apruebe.

⚠️ El nombre `codigo_acceso` quedo quemado: Meta bloquea un tiempo el nombre de
una plantilla borrada, y en las pruebas se borro una con ese nombre. Por eso el
sistema espera **`acceso_codigo`**.

---

## 229 — El barrio se resuelve en el aviso (19-ago-2026)

Sergio: *"al tocar la notificacion me lleva a la configuracion de barrios a
llenarlo directamente en la lista y eso no debe suceder... deberia aparecerme un
modal ya"*. Tenia razon: para poner UN numero eran cinco pasos — abrir
Configuracion, buscar la fila, desplegarla, decidir a que zona pertenece y
escribir el barrio a mano dentro de un cuadro de texto de otra zona.

Ahora el aviso abre un modal ahi mismo: se ve el barrio, **la direccion que
escribio el cliente** (hay nombres de conjunto que solos no dicen donde quedan),
se pone el precio y queda guardado. Con los precios que ya usa a un toque —casi
siempre el barrio nuevo cuesta lo mismo que alguno que ya tiene— y con el boton
de "No es un barrio" para lo que se colo donde iba la direccion.

### Lo que hace al guardar

Escribe sobre los DATOS (`ia_config.domicilios.zonas`), no sobre los cuadros de
texto de la pantalla de Configuracion, que era lo que hacia la version vieja:

- Si el precio ya existe, entra a esa zona; si no, **se crea la zona**.
- Un **conjunto** va a `conjuntos` y no a `barrios`: el asistente los trata
  distinto (a un conjunto no le pide calle, le pide la casa).
- Si el barrio ya estaba en otra zona, **se saca de la anterior** — dos precios
  para el mismo barrio es cobrar distinto segun quien mire.
- Se guarda el objeto `domicilios` ENTERO: es una sola columna jsonb, y escribir
  solo las zonas se llevaria por delante el tiempo estimado, las copias del
  recibo y si esta activo.
- Y el pendiente se borra, asi que el aviso desaparece solo.

### Verificado

La logica corrida en un navegador contra las zonas reales de El Parche:

| Caso | Resultado |
|---|---|
| Precio que ya existe (6.000) | entra a esa zona, junto a San Nicolas y La Paz |
| Precio que no existe (15.000) | crea la zona y queda ordenada al final |
| Un conjunto | va a `conjuntos`, no se mezcla con los barrios |
| Barrio que ya estaba en otra zona | sale de la vieja, queda solo en la nueva |
| El resto de la configuracion | intacta (activo, tiempo, copias) |

---

## 230 — El pedido inconcluso ya se puede pagar (19-ago-2026)

Sergio dejo un pedido sin pagar y volvio a la pantalla de seguimiento: decia
**"Falta que pagues"** y no ofrecia ninguna forma de pagar.

No fue un olvido. El boton estaba escrito y **lo quite antes de subirlo**: la
pantalla de pago se arma con el pedido que se acaba de crear (`pedidoHecho`),
y quien vuelve mas tarde ya no lo tiene en memoria — el boton habria llevado a
una pantalla vacia. Quitarlo dejo el problema peor de lo que estaba.

**Ahora** el pedido se reconstruye desde `S.pedidoVivo` (lo que devuelve
`web-acceso/pedido-activo`) mas `S.negocio.pago`, y se abre **la misma**
pantalla de pago de siempre — saldo, "Ya transferi", el paso a paso y el boton
de copiar la llave. No se escribio una segunda pantalla de pago: dos se
desincronizan el dia que se cambie una.

Trampa: `web-pagar` pide `order_id`, no `id`. Con el nombre equivocado el boton
habria dicho "No encontramos tu pedido".

`irA('pedido')` conserva `pedidoHecho` (`if (vista !== 'pedido') pedidoHecho = null`),
asi que la navegacion no lo borra.

### Y el aire entre los bloques
`.ep-tile` no tiene margen: "Falta que pagues" y los estados se leian como uno
solo. La separacion va **acotada a `.ep-seguir`** — `.ep-tile + .ep-tile` suelto
habria movido Perfil, Billetera y El local, que estan bien.

---

## 231 — El plato tenia dos nombres segun por donde entrara (19-ago-2026)

En la comanda de un pedido **manual**: `Hamburguesa · SENCILLA`.
En la comanda del mismo plato pedido por **la pagina**: `SENCILLA`.

### Por que
El producto se llama de verdad **"SENCILLA"** y vive en la categoria
**"HAMBURGUESAS"**. La palabra "Hamburguesa" sale del **nombre en comanda** de la
categoria (`pos_categories.comanda_alias`). El POS manual lo antepone siempre:

```js
// tomar-pedido.js:1149
const presLabel = pres.name || cat.comanda_alias || cat.name;
const displayName = [presLabel, p.name, varLabels].filter(Boolean).join(' · ');
```

`web-pedido` no traia las categorias siquiera, y ademas armaba el nombre **al
reves** (`producto · presentacion`).

No es cosmetico: en esta carta hay un producto llamado **"CARNE" en tres
categorias distintas** — sandwich, hamburguesa y perro. Sin la etiqueta, la
cocina y el cliente ven "CARNE" y no hay forma de saber cual es.

### Corregido en tres sitios, con una sola regla
1. **`fn_web_carta`** — cada producto trae `etiqueta` =
   `coalesce(nullif(c.comanda_alias,''), c.name)`. Los combos la traen vacia: su
   nombre ya se explica solo. (`sql/2026-08-19-carta-etiqueta.sql`)
2. **`web-pedido` v17** — trae `pos_categories` una vez por pedido y arma
   `[etiqueta, producto, variantes]`, igual que el POS. `selections.pres` guarda
   la etiqueta, no lo que mando el navegador.
3. **`app-cliente.js`** — `nombrePlato()` y `nombreLinea()`: carrito, resumen,
   hoja del plato y tarjetas del inicio. **En la cuadricula de la carta NO**: ahi
   cada plato va bajo el titulo de su categoria y repetirlo sobra.

Historial y seguimiento leen el nombre guardado, asi que quedan bien solos —
para los pedidos NUEVOS. Los 4 items web de las pruebas conservan el nombre
viejo: no se reescriben pedidos ya hechos.

### El punto que titila estaba en la esquina de la pantalla
Dos errores encima del otro:
1. Se llamaba `.ep-punto`, **nombre que ya existia** para el puntico de
   abierto/cerrado del local. Mi regla, por ir despues, se lo comio.
2. `position: absolute` sin padre posicionado — `.ep-redondo` no tenia
   `position: relative`, asi que se colgo del borde de la **pantalla**.

Ahora es `.ep-punto-vivo`, el boton es su ancla, y late con un **halo que se
abre hacia afuera** (`ep-onda`) mas un respiro del boton (`ep-llama`): un
puntico quieto no dice "tocame", una onda si. Los dos se apagan con
`prefers-reduced-motion`.

### 231b — El cuarto camino, y los pedidos ya hechos (19-ago-2026)

Sergio dijo "sigue mal" mirando la pantalla de ventas: eran los pedidos de
ANTES del arreglo — el nombre se guarda al crear el pedido, no se recalcula.

**Se barrio toda la historia** (`sql/2026-08-19-renombrar-items-viejos.py`):
de 514 items, 484 ya estaban bien y **16 quedaron renombrados**. El script no
inventa: parte el nombre viejo por `·`, saca el producto (que siempre iba
primero), y si el pedazo siguiente es de verdad una presentacion de ESE
producto, ese es el prefijo; si no, el prefijo es el nombre en comanda de la
categoria. Solo toca `name` y `product_name` — ni precios, ni cantidades, ni
el pedido.

```
SENCILLA                    ->  Hamburguesa · SENCILLA
MAICITOS · Personal         ->  Personal · MAICITOS
Premium · Personal · Mixta  ->  Personal · Premium · Mixta
SÚPER QUESO · Único         ->  Hamburguesa · SÚPER QUESO · Único
```

**Y aparecio un cuarto camino mal**: 12 de los 16 no venian de la pagina sino
del chat. Hay CUATRO sitios que crean items — `delay-reply`, `extraer-pedido`,
`verify-transfer` y `confirm-domi`. Los tres primeros ya armaban el nombre
bien; **`confirm-domi` se habia quedado atras** (`[producto, tamaNo, tipo]`,
al reves y sin categoria). Corregido y desplegado (v15), con la misma consulta
que ya usa `verify-transfer`.

**Trampa de la herramienta, no del sistema**: el script de diagnostico decia
"0 filas por corregir" porque leia la respuesta de Supabase con la codificacion
de Windows: el `·` llegaba partido en dos y ninguna comparacion casaba. Al leer
en UTF-8 aparecieron las 16. Si un barrido da cero, sospechar del lector antes
que de los datos.

---

## 232 — La direccion, en la misma comanda (19-ago-2026)

Sergio, trabajando de verdad con la pantalla: al tocar un domicilio necesita
saber **para donde va**, y le tocaba irse hasta el chat a buscarlo.

Ahora el panel del domicilio muestra **direccion y barrio**, debajo del nombre
y los puntos — donde el mismo pidio, "una parte donde no estorbe". Es lo
primero que se necesita al tocar un domicilio, pero no es lo que se cobra: por
eso va tranquilo y no compite con la comanda ni con el total.

### De donde sale
No hay columna de direccion: nunca se guardo aparte. Los cuatro caminos que
crean pedidos (la pagina y los tres de Paco) la escriben en `notes`, siempre
con el mismo formato:

```
Carrera 55 # 2 c 11 [barrio:LOMAS DE SAN BENITO] [tel:324...] [web] — sin cebolla
```

`vsDireccionDe()` toma todo lo anterior al primer marcador como direccion y el
barrio de su propio marcador. Lo que va tras el guion es la nota del cliente,
que ya se muestra en la comanda y aqui no se repite. Sin marcadores devuelve
`null` y no se pinta nada: una nota suelta no es una direccion.

`fetchDeliveries` no traia `notes`; ahora si.

### Detalles de la pantalla
- La direccion **no se corta con puntos suspensivos**: cortarla justo aqui
  seria devolverle el problema al domiciliario. Envuelve en varias lineas.
- `.vs-rail-head > div:first-child { min-width: 0 }` — sin eso una direccion
  larga estiraba la columna y empujaba el boton de los tres puntos fuera de la
  tarjeta.

Probado con las direcciones reales de los ultimos pedidos, incluida una de dos
lineas y una sin direccion.

---

## 233 — Borrado de los datos de prueba (19-ago-2026)

Sergio: todo lo del 19-ago fue de pruebas, y las cajas con apertura de
**$200.000** son de prueba en cualquier fecha (las reales tienen otros valores).

Respaldo completo antes de tocar nada, en `Documents/Cobra-respaldos/` —
**nunca en el repo**, que es publico y aqui hay telefonos y direcciones.

Borrado: **5 pedidos** con sus 5 items, **8 cajas** (7 de $200.000 + la del
dia). Quedan 308 pedidos y 21 cajas. Borrar una caja NO borra los pedidos de
ese dia: no cuelgan de ella, asi que las ventas de julio siguen intactas.

Y se deshizo lo que esos pedidos dejaron por el camino, que es lo que de
verdad importa — si se borra el pedido pero le quedan los puntos, el saldo
descontado y el inventario consumido, el sistema queda mintiendo en tres
sitios a la vez:

| | |
|---|---|
| Saldo | devuelto: $267.500 → **$345.000** (los $77.500 que "gasto" probando) |
| Puntos | **61 → 0** |
| Inventario | 13 insumos repuestos (3 carnes de hamburguesa, 0,6 de tomate…) |

**El "ok" que era mentira**: el primer intento de reponer el inventario
reporto exito y no cambio ni una fila. Las existencias de este restaurante
viven con `branch_id` NULL (modo global) y los movimientos SI traen la sede,
asi que el cruce por sede no encontro nada — y un UPDATE de cero filas no
falla. **Contar las filas afectadas, no confiar en que la consulta no dio
error.**

---

## 234 — Entrenamiento de Paco: 9 fallas reales corregidas (19-ago-2026)

Se repitieron en el banco las conversaciones de los dias 15 al 19 en las que
Sergio tuvo que meterse a mano (`human_takeover`), mas baterias propias de
recoger/domicilio, productos, precios y cambios a mitad del pedido. **Ningun
cliente real recibio un mensaje**: el banco no puede crear pedidos.

### Lo que ya estaba bien
Los dos errores de precio que Sergio corrigio a mano el 17 y el 18 (Monica,
$36.000 → $27.000; Mariam, $28.000 → $33.000) **ya no se repiten**: los arreglos
del 18 los cubrieron. Se comprobo con sus mensajes tal cual.

### Lo que estaba mal y se corrigio

**1. La cantidad de un plato se la llevaba otro** — *el mas caro*
"una premium mixta personal y **2** coca colas personales" salia con **DOS
salchipapas**: $85.000 en vez de $50.000. El lector devuelve UNA cantidad para
todo el mensaje y el 2 de las gaseosas se lo quedaba el plato activo. Ahora se
mira que producto de la carta aparece primero DESPUES del numero; si es otro,
ese numero no es suyo.

**2. El sabor no se podia cambiar**
"una premium mixta personal … **cambiala a carne mejor**" seguia cobrando
Mixta: $35.000 en vez de $30.000. El tamaNo si se dejaba cambiar y el sabor no.
Ahora se reemplaza cuando el mensaje DICE que es un cambio (cambiala, mejor, en
vez de, prefiero, que sea). Sin esas palabras no se toca — si no, "una premium
mixta y una **adicion de carne**" se comeria el sabor elegido.

**3. Un plato fantasma de $13.000**
"salchipapa **maicitos especial** mixta personal" encolaba ademas la
**MAICITOS** a secas — las dos existen en la carta. Si el nombre de uno esta
contenido en el del otro son el mismo plato leido con distinto alcance: gana el
largo, salvo que el cliente lo nombre dos veces.

**4. La cantidad del segundo plato SIEMPRE era 1**
`new RegExp("(\d+)\s+…")` — dentro de una cadena `\d` no es un digito, es la
letra d. La expresion decia `(d+)s+` y no casaba nunca. Estaba asi desde antes.
Ahora va con barras dobles. (Es la trampa de siempre: **las barras escritas a
mano llegan a la mitad**; en este archivo se construyen con `chr(92)`.)

**5. El punto de referencia convertia la casa en un local**
"Conjunto Okavango Casa A6 **en frente del colegio** San Francisco": la palabra
"colegio" hacia que la casa se clasificara como lugar publico, se le anulaba el
efectivo y se le exigia transferencia. Ahora se le quita a la direccion lo que
va despues de una frase de referencia (frente a, al lado de, cerca de, diagonal
a…) antes de clasificar. Y un conjunto de la lista del dueNo es residencial
aunque nombre un lugar publico.

**6. La misma frase, tres veces**
A Ivan se le mando la frase de prepago tres veces palabra por palabra mientras
preguntaba "¿no se puede en efectivo?". El freno de bucle existia desde el
17-ago pero **solo estaba conectado a su hermana** ("para llevar + efectivo").
Ahora tambien a esta: a la segunda va a una persona.

**7. La direccion se tragaba el mensaje entero**
Sneider escribio en tres renglones "Para el : conjunto portal de pomona /
Nombre : sneider Sanchez / Casa 13" y la comanda salia con **"Nombre : sneider
Sanchez" metido dentro de la direccion**. Ahora se botan los renglones que son
otro dato y se les quita la etiqueta de adelante: queda "conjunto portal de
pomona, Casa 13".

**8. El tamaNo que el cliente ya habia dicho**
"un jugo hit **de litro**" y Paco preguntaba "¿litro o personal?". El mensaje
traia los dos tamaNos de la HIT ("personal" era de la salchipapa) y no se
elegia ninguno. Ahora manda el que esta pegado al nombre del producto.

**9. "Catalana*" quedaba como nombre del cliente**
El asterisco es como la gente se corrige en el chat. Se quita antes de mirar si
es un barrio, y el barrio ahora **se puede corregir** — antes, puesto una vez,
no se movia, y el domicilio se cobraba por el barrio equivocado.

### Y dos cosas mas
- **Cambiar platos con el pedido ya en cocina** ahora pasa a una persona, igual
  que ya hacia el cambio de direccion. Antes Paco rearmaba el resumen y volvia
  a preguntar el pago con la comanda ya impresa.
- **"Adicione", "Salchipapa tradicionale"**: quitarle la "s" a todo dejaba eso
  en un mensaje que lee el cliente. Ahora sigue la regla del idioma.

### Como se probo
`blindar_banco.py` + `runner.py` sobre `delay-reply-banco`. Se aNadio un paso
de **compilacion (esbuild) antes de cada despliegue** y `cuadrar.py`, que lee
el resumen de cada prueba y **vuelve a calcular el precio contra la carta** —
mirarlo a ojo no sirve: un plato mal cobrado se ve igual que uno bien cobrado.
El empaque son $1.000 por pedido y no lo pagan Hamburguesas, Perros, Sandwich,
Bebidas ni Adiciones.

### 234b — Lo que aparecio despues, probando (19-ago-2026)

**10. Un plato entero desaparecia del pedido** — *el peor de todos*
"dos salchipapas mixtas FAMILIARES y una hit personal de lulo" salia con **la
HIT sola, $15.000**: las dos salchipapas de $49.000 se perdian sin que nadie
se enterara. `"mixtas"` no casa con `"mixta"`, asi que el buscador exacto no
vio la salchipapa — pero SI vio la "hit", y como algo encontro, el respaldo que
si entiende plurales (el modelo) ya no corria. Pedirla sola funcionaba
justamente porque no encontraba nada y entraba el respaldo. El arreglo de una
letra tampoco alcanzaba: pide nombres de 6 letras y "mixta" tiene 5. Ahora el
buscador prueba tambien la forma plural, que es exacta y no adivina.

**11. Paco negaba los combos**
A "¿tienen combos?" contestaba **"no manejamos combos"** — y hay dos activos,
que se venden por la pagina y por el POS. `delay-reply` no leia `pos_combos`
**ni una sola vez**. Ahora van en la carta que Paco lee (nombre y precio) y,
cuando alguien pide uno o pregunta cuales hay, lo atiende una persona: armar un
combo (varios platos en una linea, con su precio y su descuento de inventario)
sigue **pendiente**.

**12. Preguntar cuatro veces lo mismo y nunca escalar**
El tope de 4 intentos que pasa a una persona existia, pero **se reiniciaba
entero** cuando cualquier otro dato cambiaba. Con "3 coca colas personales",
cada respuesta llenaba otra cosa (direccion, nombre) y el contador volvia a
cero: Paco pregunto el tamaNo cuatro veces sin parar. Ahora el campo que sigue
vacio conserva su cuenta; los demas si se perdonan.

**13. "Con adicion de tocineta" quedaba como nombre del cliente**
La rama de varios renglones ya miraba las adiciones; la del mensaje de una sola
linea no. **Cuatro caminos capturan nombres y cada regla hay que ponerla en
los cuatro.**

### Dos lecciones de metodo (que costaron el rato)

**El arranque no es una prueba.** Mover el bloque de los combos dejo una llave
suelta y una variable usada antes de existir: la funcion **compilaba**, la API
decia **ACTIVE** y la llamada de humo devolvia **HTTP 200** — porque con un id
que no existe sale por la puerta de atras antes de tocar el codigo. Paco quedo
**mudo** y tres pruebas seguidas "pasaron". Ahora `humo.py` manda un mensaje de
verdad y **exige respuesta**; sin ella no se sube nada.

**Las barras invertidas llegan a la mitad.** Tres veces en esta sesion:
`\d` quedo como la letra d, `\n` se volvio un salto de linea real dentro de una
cadena, y un `\b` quedo como retroceso. En este archivo **las barras se
construyen con `chr(92)` y los saltos con `String.fromCharCode(10)`** — nunca
escritas a mano.

### Estado final
`delay-reply` **v319** en produccion, byte por byte igual a lo que se probo
(comprobado descargando el cuerpo desplegado). Banco v233. **63 conversaciones
de prueba borradas** y **cero pedidos creados** — el blindaje del banco aguanto.

---

## 235 — El código de acceso, por SMS mientras Meta desbloquea (19-ago-2026)

### El diagnostico, con pruebas
Meta niega crear plantillas de categoria **AUTHENTICATION** en esta cuenta.
Se aislo creando una plantilla de cada categoria con el MISMO token, el mismo
dia: **MARKETING entro, UTILITY entro, AUTHENTICATION no** (error code 10,
subcode 2388185). Las dos de prueba se borraron enseguida.

Eso descarta: permisos de la app, token, salud de la cuenta (verificada,
aprobada, calidad verde), metodo de pago (esta puesto y con historial de
cobros) y el nombre quemado (con nombres nuevos falla igual). Sergio confirmo
que **desde la interfaz de Meta da el mismo error**, asi que tampoco es el
formato de la llamada.

Trampa que costo tiempo: mandando el boton OTP **con texto propio**, Meta
responde "los botones no pueden contener variables ni emojis" — un error de
formato que TAPA el de permiso. Solo con el formato correcto sale el error de
verdad. En las plantillas de autenticacion **el texto del boton lo escribe
Meta**.

Sin plantilla, el codigo por WhatsApp solo llega a quien escribio en las
ultimas 24 h. Evidencia real: **Sandra Villareal lo intento 3 veces en 2 dias
distintos y nunca entro** (ultimo mensaje suyo: 29-jul). Linda Fernandez si
entro — habia escrito 2 horas antes. De 8 codigos pedidos, 4 usados.

### La decision de Sergio
No se quita el codigo del registro: *"esa cuenta va a manejar dinero y puntos,
cualquiera puede poner el numero de otro y no tendriamos como verificarlo"*.
El codigo se queda y mientras tanto sale por **SMS**.

### Lo hecho
`mandarPorSms()` en `web-acceso` (v25), como TERCER eslabon de la cadena que ya
existia: plantilla → texto de WhatsApp → **SMS**. Va de ultimo a proposito: si
WhatsApp funciona se usa WhatsApp, que es gratis y es donde el cliente ya esta.
El dia que Meta abra la categoria, el SMS deja de usarse **solo** — no hay nada
que deshacer.

**Sin las credenciales configuradas devuelve false y no estorba**: hoy la
funcion se comporta exactamente como antes. Faltan tres secretos:
`TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`.

El texto del SMS va **sin tildes**: con acentos el mensaje cambia de
codificacion, pasa de 160 a 70 caracteres, se parte en dos y se cobra doble.

### Lo que NO era (correccion)
El `name_status: AVAILABLE_WITHOUT_REVIEW` del numero **no es una tarea
pendiente**: significa "aprobado sin necesidad de revision". Se reporto como
si hubiera que mandarlo a revisar y era falso. El icono amarillo del Centro de
seguridad es por el **nivel de mensajeria** (TIER_250, el de entrada), que sube
solo con volumen y calidad — no con un formulario.

### 235b — El SMS funcionando, y el fallo que casi se cuela (19-ago-2026)

**Cuenta Twilio lista.** Numero `+1 858 727 5874` (local de EE.UU., US$1,15/mes).
Colombia ya venia habilitada en *Geo permissions*, no hubo que tocarla. Los
tres secretos puestos: `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`.

Colombia **no vende numeros con SMS** (los suyos son solo de voz): se comprueba
buscando con destino Colombia y no sale ninguno. Se usa un long code de EE.UU.
— y segun las reglas de Twilio para Colombia, **el operador local reemplaza el
remitente por un short code**, asi que al cliente le llega de un numero corto
como los del banco, no de un +1. Los toll-free se descartaron: son para trafico
dentro de EE.UU. El registro A2P 10DLC que Twilio pide en pantalla es para
mandarle a numeros **estadounidenses**; a Colombia entrega sin registrar nada
(comprobado: entregado).

**Trampa que costo el diseNo inicial.** El respaldo se escribio como "si
WhatsApp falla, manda SMS" — y esa premisa era falsa: **Meta responde 200 y
despues no entrega**. En la primera prueba real el codigo "salio" por WhatsApp,
la funcion lo dio por bueno y el SMS nunca se mando. Es exactamente lo que le
paso a Sandra Villareal tres veces: sus tres codigos figuran como enviados.

No se le puede preguntar a Meta si llego —el aviso de entrega es asincrono y el
cliente espera AHORA— pero **el dato lo tenemos en casa**: `ventanaAbierta()`
mira si esa persona escribio en las ultimas 24 h. Si no escribio, ni se intenta
WhatsApp: va derecho por SMS.

**Dos cosas mas que vio Sergio:**
- El mensaje decia *"para entrar a elparche.foodpopayan"* — el nombre de la
  CUENTA, que quedo registrada con el correo del dueNo. La pagina ya resolvia
  esto (`fn_web_publica` saca el nombre de `brands`); `web-acceso` no, y era la
  unica que le hablaba directo al cliente. Corregido: ahora dice *El Parche Food*.
- **El codigo se autocompleta solo.** En iPhone ya lo hacia el
  `autocomplete="one-time-code"` del campo. En Android hace falta la API WebOTP
  y que el SMS termine con `@cobrapos.app #codigo` — formato exacto, dominio
  exacto. Si no cuadra, el navegador lo ignora y no se rompe nada. Ademas, con
  los 6 digitos puestos el formulario se envia solo.

Probado por el camino real (`pedir-codigo` de produccion): ventana cerrada →
SMS → **entregado**, con el nombre bueno y la linea del autocompletado.

### 235c — El renglon del autocompletado, solo donde sirve (19-ago-2026)

El renglon `@cobrapos.app #codigo` es lo que deja al celular escribir el codigo
solo, pero **se ve en el mensaje y afea**. Sergio pregunto si podia llegar
limpio al iPhone y con el renglon al Android. Si.

No se pregunta "¿eres Android?" (eso seria olfatear el navegador y se equivoca),
sino **"¿este navegador sabe autocompletar?"** — `'OTPCredential' in window`,
que es la condicion exacta que vuelve util ese renglon. La pagina lo manda en
`pedir-codigo` y el servidor solo agrega la linea cuando viene en true.

En iPhone el autocompletado sigue funcionando igual: ahi lo resuelve el
`autocomplete="one-time-code"` del campo, no el texto del SMS.

Comprobado con las dos formas: con `otp:true` llega con el renglon, con
`otp:false` llega limpio. Las dos entregadas.

---

## 236 — Aviso en la campanita cuando se acabe el saldo de los SMS (19-ago-2026)

Sergio: *"¿puedes avisarme cuando esté por agotarse el saldo de Twilio y mandar
una notificación a la campanita?"*. Hace falta: los codigos de acceso salen por
SMS mientras Meta no habilite la plantilla, y **si el saldo llega a cero dejan
de salir sin avisar** — ningun cliente nuevo se podria registrar. Es el agujero
que acabamos de tapar, entrando por otra puerta.

### Como quedo
- **`pos_avisos_sistema`** — tabla generica a proposito (`clave`), no
  "avisos_de_twilio": el proximo aviso del sistema entra sin tocar la campana.
  RLS por `current_tenant_id()`, y los `GRANT` puestos **a mano** (una tabla
  creada por la API de administracion no otorga nada y la funcion se queda con
  403 en silencio — leccion del mismo dia).
- **`revisar-saldo-sms` v1** — lee el saldo de Twilio con las credenciales del
  servidor (no pueden vivir en el navegador) y pone o quita el aviso. **Si el
  saldo se repone, el aviso se va solo**: nadie tiene que cerrarlo.
- **Cron `vigilar-saldo-sms`** — todos los dias a las 9 a.m. de Colombia.
- **`fuenteSistema()`** en `pos-notifs.js`, colgada junto a las otras dos.

### Decisiones
- **Se avisa en CODIGOS, no en dolares.** "Quedan unos 40 códigos" se entiende
  de una; "quedan 2 dólares" hay que traducirlo mentalmente. Umbrales de
  arranque: aviso bajo US$5 (~75 codigos), urgente bajo US$2.
- **Solo a quien usa la pagina de clientes** (`web_activa`). La cuenta de
  Twilio es una sola para todo Cobra; a quien no manda SMS este aviso no le
  dice nada.
- **El enlace externo abre en otra pestaNa.** Mandar al dueNo a la consola de
  Twilio dentro de la misma ventana le hace perder lo que estuviera haciendo.

Probado en los dos sentidos: se metio un aviso a mano y aparecio; se corrio la
funcion con el saldo sano ($18,85 = ~377 codigos) y lo borro sola.

---

## 237 — Canjear premios desde la página del cliente (19-ago-2026)

Hasta hoy el catalogo de puntos era **solo una vitrina**: mostraba los premios
y cuanto faltaba, pero el canje lo aplicaba el restaurante a mano al cobrar.
Ahora el cliente lo pide solo.

### Como funciona
El premio **NO abre un camino aparte**: se traduce a un item normal y lo arma
**el mismo codigo** que arma cualquier pedido — precios, presentacion,
variantes, combos, empaque, domicilio. Un segundo camino habria que arreglarlo
dos veces cada vez que cambie algo.

Lo unico distinto viene despues, en la plata.

### La plata (regla de Sergio, la misma de `pagos.js`)
> "300 puntos no es igual a 8.000 pesos; en las ventas no se suma lo que no entro."

El plato se entrega y **descuenta inventario**, pero su precio sale del total.
Si el premio es mixto —1.000 pts + $20.000— esos $20.000 SI entraron a la caja
y SI son venta; solo sale la diferencia.

| Caso | Total a pagar | Estado |
|---|---|---|
| Premio simple, recoger | **$0** | `paid`, entra a cocina de una |
| Premio simple, domicilio | **solo el domicilio** | `pendiente_pago` |
| Premio mixto (pts + dinero), recoger | **la parte en dinero** | `pendiente_pago` |

Comprobado con los tres: $0, $5.000 y $20.000.

### En Cobra se ve como cualquier pedido
`channel` normal (recoger → Rapidas, domicilio → Domicilios), `origen: web`,
con **`payment_method: "puntos"`** y los campos `puntos_redimidos` /
`puntos_valor`, exactamente como cuando se canjea en el local.

**Y no deja de ser un canje porque pague el domicilio**: al cobrar, `web-pagar`
pisaba el metodo con "Transferencia" y en Cobra desaparecia que el plato se
habia canjeado. Ahora guarda **"Puntos + Transferencia"**. Los campos de puntos
siguen intactos: de ahi salen los informes; esto es solo lo que se LEE.

### Detalles
- Los puntos se descuentan con **`fn_puntos_consumir`**, que bloquea la fila y
  vuelve a comprobar el saldo: dos canjes a la vez no pueden gastar los mismos
  puntos. Si falla, **el pedido se borra** — mejor que no exista a que exista
  sin haberse cobrado.
- **Sin nada que pagar, el pedido nace pagado y visible.** Dejarlo en
  `pendiente_pago` lo escondia de todas las pantallas y el cliente esperaba
  algo que ya habia pagado con puntos.
- El canje vive **aparte del carrito**: es UNA cosa, no una lista. Mezclarlos
  obligaria a decidir que pasa si alguien le suma una gaseosa a su premio —
  hoy no se puede, y eso es mas facil de explicar que de programar.
- Salirse de la pantalla del pedido **abandona el canje**, para que al volver no
  aparezca un premio que el cliente ya habia soltado.
- El boton "Pedirlo" **solo sale en los premios que ya alcanza**. A quien le
  falta se le sigue mostrando todo el catalogo (regla de Sergio), pero un boton
  que no se puede tocar solo frustra.

Probado de punta a punta creando pedidos de verdad y **borrando todo despues**:
pedidos, items, movimientos de puntos e inventario devuelto. Quedaron 0 pedidos
del dia y los puntos del cliente de prueba en 0.

---

## 238 — El hueco entre cajas: pedidos que no contaba nadie (19-ago-2026)

Sergio pregunto: *"¿que pasa si Paco crea un pedido, o alguien pide en la
pagina, dentro del horario pero con la caja todavia sin abrir?"*

### Lo que pasaba
El pedido **se crea sin problema** — ninguna funcion mira la caja. Entra a
cocina, el cliente paga, no se pierde nada. Pero **quedaba fuera de la caja**:

- Con la caja cerrada el pedido SI se veia (el filtro caia a "desde las 00:00").
- **Al abrir la caja desaparecia** de Domicilios y de Rapidas.
- Y el cierre solo contaba desde `opened_at`: **su plata nunca entraba al
  arqueo**. Ese dia la caja daba sobrante sin explicacion.

### Ya habia pasado — con datos
Cuatro pedidos reales, **$246.000**, de los cuales **$205.000 en efectivo**:

| Pedido | Se abrio la caja | Canal | Total |
|---|---|---|---|
| 15-ago 4:05 p.m. | 6:25 p.m. | domicilio | $41.000 |
| 27-jul 3:23 p.m. | 6:40 p.m. | domicilio | $70.000 |
| 23-jul 4:43 p.m. | 6:44 p.m. | salon | $47.000 |
| 23-jul 3:44 p.m. | 6:44 p.m. | salon | $88.000 |

### La regla nueva (decision de Sergio)
> *"Que un pedido que entre a las 6:30 entre en la caja aunque yo la abra a las
> 6:40; al abrirla se tienen que vincular los que se crearon con la caja
> cerrada."*

Un turno cuenta **desde que se cerro el anterior**, no desde que se abrio el.
Los turnos quedan pegados uno detras de otro y no hay hueco posible. La primera
caja de todas se queda con su propia apertura: no hay de donde arrancar.

`inicioDelTurno()` en `caja.js` (turno en curso **y** historial — si contaran
distinto, un turno viejo mostraria unos pedidos y su cierre otros) y la misma
regla en `getCajaSessionStart()` de `ventas-salon.js`.

### Comprobado antes de subirlo
- **Ningun pedido cae en dos cajas** (verificado sobre los 305 del historico).
- **Casi todos los turnos quedan identicos**; el unico que cambia es el 15-ago,
  que pasa de 22 a 23 pedidos y recupera sus $41.000.
- Los 4 que siguen sin caja son del 13 y 14 de junio, anteriores a la primera
  caja que sobrevive — historia vieja, no un problema vivo.

### Pendiente
El pedido del **15-ago de $41.000** esta raro: figura `open` y sin metodo de
pago, pero con $41.000 en `paid_amount`. Puede haberse quedado colgado.

---

## 239 — La app se veia mal en el iPhone 16 Pro (19-ago-2026)

Sergio la instalo en el celular de su mama (iPhone 16 Pro) y **la foto de perfil
quedaba casi debajo del icono de la bateria**. En su 13 Pro Max se veia bien.

### Por que
La pagina se pide con `viewport-fit=cover` y la barra de estado en
`black-translucent`. Las dos cosas juntas significan que **el contenido empieza
en el borde fisico de la pantalla**, por debajo de la hora, la señal y la
bateria.

Abajo eso ya se respetaba —`env(safe-area-inset-bottom)` en la barra de
pestañas y en `--barra-alto`— pero **arriba no se respetaba en ninguna parte**.
Lo unico que separaba el saludo del borde eran los `20px` fijos de `.ep-saludo`.

Por eso dependia del telefono: cada modelo reserva un alto distinto arriba y el
del 16 Pro es mas alto que el del 13 Pro Max. Los mismos 20px alcanzaban en uno
y en el otro no.

### El arreglo
`padding-top: env(safe-area-inset-top)` en `.ep-scroll` (cubre TODAS las
pantallas, no solo el inicio) y en `.ep-login`. De paso, `padding-left/right`
en `.ep-app`: en horizontal la muesca se come un borde u otro segun hacia donde
se gire.

`env()` vale **0** donde no hay muesca —computador, Android sin notch, Safari
con su propia barra— asi que no mueve nada donde ya estaba bien.

Va **al final del archivo** a proposito: tiene que ganarle al `padding` corto
que reescribe la regla de escritorio.

### Lo que NO se pudo probar
No hay forma de probarlo sin los telefonos. Se simulo reemplazando `env()` por
los valores que reserva cada modelo (47px y 62px) y se comparo antes/despues:
con el arreglo, el saludo y la foto quedan por debajo de la barra en los dos.
**Falta que Sergio lo confirme en el 16 Pro.**

---

## 240 — Un solo modal para abrir la caja (19-ago-2026)

Sergio: *"el modal de apertura aparece perfecto dentro de Caja, pero el boton
del panel abre otro modal viejo; deberia abrir el mismo"*.

Habia **dos**, y el del panel era el pobre:

| | Panel (el viejo) | Caja (el bueno) |
|---|---|---|
| Entrada | un campo: "monto de apertura" | **tres pestañas que se SUMAN**: lo que mete el cajero + el arqueo de lo que hay en el cajon + la base que quedo de ayer |
| Guarda | `opening_cash` | `opening_cash` **y `apertura_detalle`** con el desglose |

O sea que abrir desde el panel arrancaba el turno **sin el desglose**, y el
cierre de esa noche se quedaba sin con que comparar.

### Como quedo
**No se copio el bueno al panel**: seria mantener dos, y los dos se separan
solos con el tiempo — que es justo como nacio este problema. El boton del panel
lleva a `caja.html?abrir=1` y la pantalla de Caja abre su propio modal al
cargar. Es literalmente "el mismo modal", no una copia.

- El permiso `caja.abrir` se sigue pidiendo **en el panel, antes de salir**: si
  se pidiera al llegar, cualquiera entraria a `caja.html` directo y se lo
  saltaria.
- Solo se abre si de verdad **no hay caja abierta**: con el enlace guardado y
  la caja ya abierta, ese modal no tiene sentido.
- El `?abrir=1` se borra de la barra de direcciones al abrirlo, para que
  recargar no lo vuelva a lanzar.

Se borraron `showAperturaModal()` y `confirmarApertura()` del panel (64 lineas).
No quedan referencias: dejarlas seria dejar el camino viejo listo para que
alguien lo vuelva a conectar.

---

## 241 — El banner: un solo tamaño, y cada imagen con su destino (19-ago-2026)

### 1. El banner ya no cambia de tamaño
Se habia hecho al reves esta misma tarde: el cuadro tomaba la forma de CADA
foto al pasar, para no recortar el arte. En la practica **el banner crecia y
encogia solo mientras rotaba** y la pagina entera brincaba con el. Sergio:
*"eso no puede pasar; todas las imagenes deben ajustarse al tamaño de la
imagen actual"*.

Ahora manda la **primera** foto: se mide una vez al cargar y no se vuelve a
tocar. Las demas se acomodan a ese cuadro. Se quito la transicion de
`aspect-ratio` — animar un alto que ya no se mueve no hace falta, y si algun
dia se moviera esa animacion seria justamente el brinco que se quito.

Se conserva `object-fit: contain`: una foto de otra forma entra **completa**,
con franjas a los lados, en vez de recortarse. Perder franja es feo; perder el
precio que el dueNo dibujo en el arte es peor.

### 2. Cada imagen puede llevar a un sitio
**Sin boton visible**: se toca la imagen y ya. El dueNo pone el arte que quiera
—con su propio "Pedir ahora" dibujado— y en Configuracion solo dice a donde va
ese toque.

La columna `pos_promos.ir_a` **ya existia** y `fn_web_promos` ya la devolvia;
lo que faltaba era pantalla para llenarla y que la app entendiera mas de una
clase de destino. Ahora son tres, y se distinguen por la **forma del texto**,
no por un campo aparte — asi el dia que haya un cuarto tipo no hay que migrar
la tabla:

| Se guarda | Hace |
|---|---|
| `carta`, `puntos`, `billetera`, `local` | abre esa pantalla |
| `producto:<id>` | abre la hoja de ese plato |
| `https://…` | sale a la web, **en otra pestaña** |

Detalles que costaron pensar:
- **Se ESPERA a que la carta este pintada** antes de abrir la hoja del plato.
  Con un temporizador a ojo, en un celular lento la hoja se abria sobre una
  pantalla que todavia no existia.
- Si el producto **ya no esta en la carta**, lleva a la carta en vez de no
  hacer nada: un toque que no responde parece que la pagina esta rota.
- El enlace externo va en otra pestaña: sacar al cliente a mitad de un pedido
  seria perderle el carrito.
- En Configuracion, el boton "¿A donde lleva?" va **debajo del nombre**, no en
  la fila de iconos de la derecha: esos tres son acciones sobre la imagen
  (subir, apagar, quitar) y este es un dato de la imagen.
- La lista de productos del modal **es la misma** de los destacados
  (`data-elegir`): dos listas de lo mismo se separan solas con el tiempo.
- `guardarDestino` comprueba las filas afectadas: un update de cero filas no
  falla y dejaria la pantalla diciendo que guardo sin haber guardado.

### 241b — La lista de productos, por categorias y con combos (19-ago-2026)

Sergio, al usar el destino del banner: *"que el modal se organice por
categorias y que tambien aparezcan los combos"*.

Antes era **una sola tira** ordenada por "tiene foto". Con 50 platos, encontrar
uno era bajar leyendo. Ahora va agrupada como la carta —que es como el dueNo
los tiene en la cabeza— con el titulo de cada categoria **pegajoso**: al bajar,
uno perdia de vista en que grupo iba.

**Los combos van de primeros.** Son lo que el dueNo quiere empujar, y por eso
justamente le manda una imagen.

### Los combos NO se metieron en los destacados
La lista es la misma para el destino del banner y para los destacados, asi que
se agrego un parametro (`conCombos`) que **solo pide el destino**.

Tecnicamente los combos SI funcionarian como destacados —en la carta del
cliente llevan el id `combo:<uuid>` y el buscador de destacados compara por id—
pero ese camino no esta probado, y meterlos "de paso" seria arriesgar una
pantalla que hoy funciona por una comodidad. Queda como algo que se puede
hacer el dia que se pruebe.

La agrupacion si se dejo en las dos: no cambia que se guarda, solo como se ve,
y buscar entre 53 productos es igual de incomodo en los dos sitios.

### 241c — Las categorias se despliegan (19-ago-2026)

Sergio: *"que las categorias sean desplegables para que no ocupen tanto
espacio"*. Con 53 productos, agrupar no bastaba: seguia siendo una tira
larguisima.

Ahora se ven **los 8 titulos de un golpe**, con la cuenta de cada uno al lado
para saber donde tocar sin abrir a ciegas. **Una a la vez**: abrir una cierra
la otra, que es lo que de verdad ahorra espacio.

**Buscando se abren todas.** Si quien escribe "coca" tuviera ademas que
adivinar en que grupo cayo, el buscador no serviria de nada.

El acordeon se abre y cierra **en la pantalla, sin volver a armar la lista**:
rearmarla obligaria a saber si se pidio con combos o sin ellos, y ese es justo
el dato que se olvida de pasar. `S.grupoAbierto` guarda cual quedo abierta para
que sobreviva a la busqueda.

Probado con los datos reales en los tres estados: cerrada, con una abierta, y
buscando.

### 242 — Clientes y "Mi pagina web" quedan separados (20-ago-2026)

Sergio: *"Las funciones deben estar perfectamente separadas. Una cosa son los
clientes y todos los datos de los clientes porque eso lo van a poder ver todos
los restaurantes. Y no puede estar combinado, debe estar aislado e
independiente la parte donde pueda ver todo lo que tenga que ver con la pagina
web porque eso no lo van a ver los duenos de restaurantes, solo lo voy a ver
yo."*

**El problema no era el diseno, era la mezcla.** La pantalla de Clientes tenia
adentro Recargas, Solicitudes, y en la ficha las tarjetas de Saldo y "Ha
recargado". Todo eso solo existe si el restaurante tiene pagina de clientes,
asi que la pantalla vivia escondiendo media interfaz con `data-solo-pagina` y
la ficha cambiaba de forma segun el restaurante. Se hicieron dos propuestas de
rediseno antes de entender que ninguna cantidad de graficas arreglaba eso.

**Que ve cada quien ahora**

| Modulo | Quien lo ve | Que tiene |
|---|---|---|
| Clientes | cualquier restaurante | quien compra, cuanto gasta, cuantas veces vuelve, puntos, sus pedidos |
| Mi pagina web -> "Clientes de la app" | solo `es_admin_plataforma()` | registrados en la app, saldos, recargas, regalos a mano, recargas por revisar |

**Clientes** (`clientes.html/css/js`, reescritos)

La pregunta de la pantalla no es *cuantos clientes tengo* sino **cuantos
vuelven**. Por eso la barra de repeticion va arriba, antes de la lista: de los
167 que han comprado, **139 vinieron una sola vez**. Ese es el numero que los
puntos existen para mover, y en la version vieja no se veia por ningun lado.

Tres cifras (te han comprado / han gastado / puntos sin usar), la barra, y
abajo **un solo camino**: lista a la izquierda, la persona a la derecha. Se
acabaron las dos pantallas separadas con boton de "volver".

Los pedidos de cada persona se piden **solo al abrir su ficha**: traerlos todos
de entrada eran cientos de filas que casi nadie mira.

Se fue el sidebar propio y quedo el encabezado con "Regresar", igual que Mi
pagina web. Con una sola vista, un menu lateral de un solo item se veia roto.

**Mi pagina web -> "Clientes de la app"** (pestana nueva, `pagina-web.js`)

Cuatro tarjetas, cuatro trabajos distintos, ninguno mezclado con otro:

1. **Quien entra** — el embudo: pidieron codigo (4) -> se registraron (3) ->
   activaron avisos (2) -> pidieron por la app (0). Sin esto no habia forma de
   saber si el problema es que no llegan o que llegan y no terminan; a Sandra
   le paso lo segundo tres veces antes del SMS.
2. **Registrados en la app** — cada persona con su alta, ultima entrada,
   cuantas veces entro, avisos y saldo. Ahi mismo los botones de dar.
3. **Saldos y recargas** — recargado, bonos, saldo sin gastar y cada
   movimiento. El bono **nunca se suma** al total recargado: la plata que entro
   de verdad son las recargas.
4. **Lo que yo he dado** — los regalos a mano, en su propia lista. Una recarga
   es plata que entro al banco; un regalo es plata que sale del bolsillo. Verlos
   juntos fue justo lo que hacia ilegible la pantalla vieja.

Y **Recargas por revisar**, que se mudo de Clientes. La tarjeta **no aparece si
no hay ninguna pendiente**: una tarjeta vacia permanente entrena a no mirarla.

Es la unica pestana **ancha** (`ancha: true`): son tablas, y la vista previa del
celular al lado las dejaba en una columna ilegible.

**Dar saldo y dar puntos**

Vive **solo aqui**, en ningun lugar de Clientes. Pide monto y **motivo
obligatorio**, y queda anotado con el usuario y la hora. Se cambio el
`confirm()` del navegador por modales del producto, tambien en aprobar y
descartar recargas: la ventana del sistema operativo no deja escribir el motivo
y no es la del producto.

- Saldo -> `fn_saldo_mover(..., 'regalo', ...)`, que ya existia.
- Puntos -> **`fn_puntos_regalar`**, nueva. Espejo exacto de
  `fn_puntos_consumir`: misma normalizacion del telefono (que es la llave real
  de los puntos, no el `cliente_id`). Tipo `'regalo'`, que es lo que despues
  permite separarlos de los que la persona gano comprando.

**Base de datos** (`2026-08-20-clientes-y-pagina-web.sql`)

`fn_puntos_regalar`, `fn_web_usuarios` (toda la actividad de un registrado en
una sola consulta en vez de cuatro por usuario) y `fn_web_embudo`. Con sus
`grant execute`: sin eso PostgREST responde 404 aunque la funcion exista.

`pos_puntos` **no tiene indice unico** por (tenant, telefono), asi que
`fn_puntos_regalar` no puede usar `on conflict`: busca con bloqueo y crea la
fila si no existia.

**Lo que se comprobo**

Banco de pruebas con la sesion y la base fingidas, para no entrar con la cuenta
de nadie. Se verifico el render de las dos pantallas, los cuatro filtros, el
buscador por nombre y por telefono, el cambio de ficha, las cinco tarjetas de
la pestana nueva, el modal de dar (persona preseleccionada, montos rapidos,
cambio saldo/puntos conservando la persona, motivo obligatorio), los modales de
aprobar y descartar, y que en celular ninguna de las dos desborde: las tablas
scrollean dentro de si mismas.

**Un dato que aparecio por el camino.** El saldo de Sergio ($345.000) no cuadra
con la suma de sus movimientos ($267.500). Se descarto que fuera un agujero del
sistema: todo pasa por `fn_saldo_mover`, la llave del pedido es
`ON DELETE SET NULL` (borrar un pedido no borra su movimiento) y ninguna Edge
Function escribe `pos_saldo` por fuera. Es residuo de las pruebas del 19-ago
hechas contra la API. Se cuadra cuando Sergio de la orden de borrar los datos
de prueba.

### 243 — El menu del sistema deja de desaparecer (20-ago-2026)

Sergio: *"quiero que el bloque de menu de opciones izquierdo del dashboard no
desaparezca, debe seguir ahi, solo se navega, no debe desaparecer al entrar en
'clientes'"*.

Clientes y Mi pagina web tenian cada una su propio encabezado con un boton
"Regresar", asi que entrar a ellas era **salirse** del sistema y volver. Ahora
las dos viven dentro del mismo armazon que el Dashboard: el menu se queda a la
izquierda y solo cambia lo de la derecha. Se quito el boton "Regresar" de las
dos: con el menu siempre a la vista ya no hace falta.

**El menu era tres copias y ya se habian desincronizado.** Estaba escrito a
mano en `dashboard.html`, `reservas.html` y `tutoriales.html`. A las dos
ultimas **les faltaba "Clientes"**, asi que desde Reservas o Tutoriales no
habia forma de llegar. Y el candado de "Mi pagina web" solo existia en el
Dashboard: el mismo enlace estaba escondido en una pagina y ni existia en las
otras dos.

Ahora hay **`pos-nav.js`**: el menu se declara una sola vez y cada pagina pone
nada mas el hueco.

```html
<aside id="sidebar"></aside>
<script src="pos-nav.js"></script>
```

Agregar un modulo es agregar una linea a `MENU` y aparece en las cinco
pantallas. El candado de plataforma tambien vive ahi, en un solo sitio.

**Se pinta de una, no en `DOMContentLoaded`.** `dashboard.js` busca
`sb-status` apenas arranca; si el menu llegara despues, ese `getElementById`
seria null. Por eso `pos-nav.js` va siempre **antes** que el JS de la pagina.

El CSS no se toco: el sidebar ya estaba en `pos-core.css`, que es compartido.
La duplicacion era solo del HTML.

**Cual esta abierta** se decide por el nombre del archivo, no por la direccion
completa: "Cocina" apunta a `index.html?rol=kitchen` y con la query nunca
coincidiria.

**Ademas, un atajo desde Clientes.** Sergio pregunto donde habia quedado el
boton del modulo de la pagina web. Estaba en el menu del Dashboard, pero desde
Clientes no habia camino. Se agrego un boton violeta —el color de lo que solo
ve el dueno de la plataforma— que entra **directo** a la pestana "Clientes de
la app" con `pagina-web.html?tab=clientes`. Sin ese `?tab`, el atajo dejaba a
Sergio en "Tu pagina" y tocaba buscar la pestana. Nace oculto y lo destapa
`es_admin_plataforma()`, igual que el del menu.

**Lo que se comprobo.** Con la sesion y la base fingidas, a 1440x900: el menu
mide sus 224 px, el contenido 1216, "Clientes" y "Mi pagina web" quedan
marcadas como activas cada una en su pantalla, `?tab=clientes` abre la pestana
correcta, y ninguna de las dos desborda la ventana — en Clientes scrollean la
lista y la ficha por separado, no la pagina.

### 243b — Dos fallos del cambio anterior (20-ago-2026)

Sergio, el mismo dia: *"1. esta pantalla no me deja hacer scroll entonces la
informacion se corta. 2. En la parte inferior izquierda dice cargando y se
queda ahi para siempre."*

**1 · La ficha larga se cortaba sin barra para bajar.**

`.cl-ficha` tenia `overflow-y:auto`, pero es un hijo de un **grid**, y un item
de grid nace con `min-height:auto`: en vez de encogerse dentro de su celda,
crece con su contenido. Asi que el `overflow-y` nunca se activaba y la ficha se
cortaba contra el `overflow:hidden` del contenedor de arriba. Se arregla con
`.cl-cuerpo > * { min-height: 0 }`.

**Por que no se vio al probar.** El banco devolvia `[]` en los pedidos, asi que
todas las fichas eran cortas y ninguna llegaba a necesitar scroll. La prueba
confirmaba el caso facil. Se rehizo con 25 clientes y 18 pedidos por ficha, que
es donde el fallo aparece, y ahi se verifico que baja hasta el ultimo pedido a
1440x900 y a 1280x700.

**2 · "cargando..." para siempre abajo a la izquierda.**

El bloque `.sys-status` lo pinta ahora `pos-nav.js` en todas las pantallas,
pero el unico que lo actualizaba era `dashboard.js`. Fuera del Escritorio nadie
lo tocaba y se quedaba en "cargando..." eternamente.

Lo resuelve `pos-nav.js`, que es quien lo pinta: la consulta de
`es_admin_plataforma` que ya se hacia sirve de senal de vida —que la base
conteste, aunque sea que NO es administrador, prueba que hay conexion— y pone
"● en linea". Si el cliente de Supabase no aparece a los ~8 segundos, dice "●
sin conexion" en vez de girar para siempre.

**Regla que deja esto:** el que pinta un letrero es el que tiene que
resolverlo. Repartir el pintado en un archivo y la actualizacion en otro es
como se llega a un "cargando" eterno.

**Pendiente que aparecio auditando.** `informes.html` e `historial.html` tienen
**su propio menu, distinto y mas corto** que el de las demas, y les pasa el
mismo "cargando" eterno. No se migraron: `historial.js` busca `sb-user-name`,
`sb-role` y `sb-brand-name`, ids que solo existen en su menu propio, y
cambiarselo sin mas lo romperia. Ademas **nueve pantallas no tienen menu
lateral** —Ventas, Caja, Inventario, Domicilios, Configuracion, Pagos,
Productos, Venta rapida y Chat IA—: al entrar a ellas el menu si desaparece.
Queda para decidir con Sergio.

### 243c — La ficha se queda quieta y solo baja el historial (20-ago-2026)

Sergio: *"este panel no deberia tener scroll, deberia ser fijo, y tener solo un
scroll interno para navegar en el historial de pedidos (y si es posible hacer
todo lo que hay arriba un poco mas pequeño para que haga mas espacio y se
alcance a ver la mayor cantidad de historial sin dar scroll)"*.

Tenia razon: con la ficha entera scrolleando, para mirar el pedido de hace un
mes tocaba perder de vista cuanto ha gastado esa persona, que es justo la
comparacion que uno viene a hacer aqui.

La ficha se partio en tres: **cabecera** y **cifras** quietas, y **el historial**
como unica parte con barra propia (`.cl-f-cab` / `.cl-f-fijo` / `.cl-f-peds`).

**Y se apreto todo lo de arriba**, porque cada pixel ahorrado es un pedido mas
visible sin bajar: la cabecera (avatar 46→38, nombre 18→16), las tarjetas de
cifras (valor 17→15), el bloque de puntos (22→18, barra 9→7) y tambien la
franja y la barra de repeticion de la pantalla, que son alto que se le quita al
historial.

**El cambio que mas rindio no fue achicar letras.** Cada pedido gastaba un
renglon entero solo para el metodo de pago. Se movio debajo del precio, en la
columna derecha que estaba vacia: el pedido paso de 89 px a **53 px** de alto.

Resultado medido a 1440x900: de **4 pedidos visibles sin bajar a 7**. A
1280x700 son 4. Verificado ademas que la ficha ya no scrollea nunca, que el
historial llega hasta el ultimo pedido, y que sigue igual al cambiar de cliente
y al filtrar.

### 244 — El domicilio deja de decir "no conocemos el precio" (20-ago-2026)

Sergio: *"cuando hago un pedido desde la app me aparece el letrero de 'no
conocemos el valor del domicilio entonces pagas solo el pedido' pero tengo
seleccionada mi direccion de bellavista y esa ya esta en el sistema... deberia
realmente saber el valor del domi y solo mostrar ese letrero si realmente no
conoce el barrio"*.

**Lo primero fue descartar lo obvio, no arreglarlo.** El emparejador de barrios
y la Edge Function estaban BIEN: se extrajeron `fuzzyBarrioMatch` y
`zonaDeTexto` del codigo desplegado, se corrieron contra la tabla de zonas real
y "Bellavista" contra "Bella Vista" devuelve $5.000. Despues se llamo a
`web-pedido` de verdad con `previo:true` (que no crea nada) y tambien devolvio
$5.000. El unico caso que da cero es barrio y direccion vacios.

Asi que el problema era **lo que la app enviaba**. Se abrio la aplicacion real
con una sesion de diagnostico y un espia sobre `fetch`, y el rastro lo mostro
entero: al escoger la direccion de Bellavista, la unica peticion que salia
llevaba `barrio: "Casa 21"` — la direccion ANTERIOR.

**Dos causas encadenadas.**

1. **El candado se soltaba tarde.** `pedirCuenta()` llamaba a `pantallaDentro()`
   DENTRO del `try`, con `pidiendoCuenta` todavia en `true`. Ese repintado
   necesita otra cuenta —es justo lo que pasa al cambiar de direccion— y esa
   segunda peticion se cancelaba sola contra el candado. La pantalla se quedaba
   para siempre con la cuenta del barrio viejo. Ahora se suelta antes.

2. **Se leia el DOM que todavia no existe.** `firmaCuenta` y `pedirCuenta`
   sacaban el barrio de `$('pd-barrio')`, pero las dos corren dentro de
   `cuerpoPedido()`, que aun no ha insertado su HTML: leian la pantalla
   anterior. Ahora el destino sale del estado (`destinoActual()` sobre
   `dirElegida`), y la direccion tambien entra en la firma.

**Y un tercero que solo aparecio al verificar.** Con el barrio escrito a mano,
el servidor devolvia $5.000 y la pantalla seguia mostrando el letrero: el campo
se repintaba con `value=""` en cada pasada, se perdia lo escrito y la app
volvia a preguntar sin barrio. Lo tecleado vive ahora en el estado
(`barrioTecleado`), el campo se pinta con ello, y se limpia al cambiar de
direccion porque era de la anterior.

**Comprobado en produccion, con la app de verdad:**

| Caso | Antes | Ahora |
|---|---|---|
| Direccion guardada "Bellavista" | letrero | **$5.000** |
| Direccion guardada "Casa 21" (Balmoral) | letrero | **$6.000** |
| Tecleado "Bella Vista" | letrero | **$5.000** |
| Tecleado "Ciudad Verde" | letrero | **$10.000** |
| Tecleado "Barrio Que No Existe" | letrero | letrero (correcto) |

La sesion de diagnostico se borro al terminar y se confirmo que no quedo ningun
pedido creado: `previo:true` calcula pero no escribe.

**La regla que deja esto:** el estado de la pantalla no se guarda en el DOM. Un
`$('...')` leido durante el armado del HTML devuelve la pantalla ANTERIOR, y de
ahi salieron los tres fallos.

### 245 — Los premios, por escalones de puntos (20-ago-2026)

Sergio: *"proponme como organizar mejor la lista de premios, entre mas premios
meto se convierte en una lista infinita dificil de visualizar"*. Y despues,
sobre la maqueta: *"que cada salsa se vea aparte"* y *"me encantaria que cada
desplegable tenga una imagen"*.

**Cada premio sigue siendo su propia tarjeta.** No se junto ni se escondio
ninguno: se propuso colapsar las cinco salsas en una sola y Sergio lo rechazo.
Lo unico que cambia es como se agrupan.

**Por lo que cuestan, no por categoria de comida.** La pregunta que trae el
cliente es "que me alcanza", no "que bebidas hay": el titulo del grupo se la
contesta antes de leer una sola tarjeta. Con los 11 premios de hoy, la pantalla
pasa de **11 tarjetas seguidas a 6 renglones**:

    Con 100 pts · 5 premios      Con 400 pts   · 1 premio
    Con 200 pts · 2 premios      Con 1.000 pts · 1 premio
    Con 300 pts · 1 premio       Con 1.500 pts · 1 premio

Y deja de crecer: con cuarenta premios siguen siendo seis o siete renglones.

**Cual nace abierto.** En "Ya puedes pedir", el escalon MAS CARO que alcanza —su
mejor premio disponible—; en los otros dos bloques, el mas barato, que es el que
va a lograr primero. Tocar el que ya esta abierto lo cierra.

**Un escalon solo no se pliega.** Un desplegable para una sola cosa es un clic
de mas y esconde justo lo que hay que ver.

**La imagen del escalon: la del premio mas caro del grupo que tenga foto.** No
"una cualquiera" como se planteo al principio, y sobre todo no al azar: una
imagen que cambie sola hace sentir la pantalla rota. Es el premio mas apetecible
y es siempre la misma. Sin fotos en el grupo, queda el icono de regalo de hoy.

**Lo que se comprobo con los 11 premios reales**, en el banco:

| Puntos | Que se ve |
|---|---|
| 0 | un bloque, 6 escalones, abierto el de 100 |
| 450 | "Ya puedes pedir" con 4 escalones (abierto el de 400) y "Para ir juntando" con 2 (abierto el de 1.000), 9 botones de Pedirlo |
| 1.200 | 5 escalones arriba (abierto el de 1.000) y "Te falta poco" **plano**, con un solo premio |

Tambien que abrir y cerrar deja siempre uno solo abierto, y que las fotos
cargan.

**Lo unico que queda gris son las salsas**, porque el producto "Salsa" no tiene
foto cargada. Son 5 de los 11 premios y es el escalon mas barato — el que mas
gente va a ver. **Se arregla subiendo una foto al producto, no con codigo**, y
de paso arregla las cinco tarjetas individuales. Queda avisado a Sergio.

Se verifico de paso que `fn_web_puntos_catalogo` **ya devolvia la foto tambien
para los combos** (`co.photo_url`): no habia nada roto ahi.

### 246 — El Perfil: foto, nombre, contrasena y niveles que se entienden (20-ago-2026)

Cuatro cosas que pidio Sergio mirando su propio perfil.

**1 · El icono de la foto ya no parece una alerta.** El boton de cambiar la
foto usaba `--wine` (#8f2242): un circulo rojo dentro de la cara del cliente,
que hacia preguntarse que estaba mal. Pasa al dorado de la marca y baja de 28 a
26 px, pegado a la esquina.

**2 · Se puede cambiar el nombre y la contrasena.** El nombre solo se ponia al
registrarse: un error de dedo se quedaba para siempre, y ese nombre es el que
sale en la comanda que se imprime en la cocina.

Dos acciones nuevas en `web-acceso` (v30), las dos con la misma regla que ya
usaban las demas: **quien es lo dice la SESION, nunca el navegador** — sin eso
cualquiera podria renombrar a otro mandando su id.

La contrasena pide la **actual** aunque la sesion este abierta. Un celular
prestado o desbloqueado no puede convertirse en "cambio la clave y se quedo con
la cuenta", que ademas tiene saldo adentro. Y la sesion **no** se cierra al
cambiarla: quien la cambio es el que esta ahi.

`preguntar()` aprendio campos de tipo `password`, que antes no existian.

**3 · Los niveles, contados para que se entiendan y motiven.** Sergio: *"con
las solas palabras no se entiende, deberia saber el cliente que eso significa
que es un cliente de esa categoria"*.

- El chip dice **"Eres cliente Estandar"**, no "Estandar" a secas.
- La frase cambia con lo cerca que este, en vez del "0% del camino a Premium"
  que ademas arrancaba desanimando:

| Avance | Que dice |
|---|---|
| 0% | Con tus pedidos vas subiendo a cliente Premium |
| 1–49% | Vas 25% del camino a cliente Premium |
| 50–79% | Ya pasaste la mitad del camino a cliente Premium |
| 80–99% | ¡Ya casi eres cliente Premium! |
| tope | Estas en el nivel mas alto. No hay uno mejor. |

- Y debajo, **que gana con el nivel**, que era lo que faltaba para que la
  palabra significara algo: *"Por ser cliente Estandar, cada $50.000 que
  recargas te damos $5.000 de regalo. Al subir de nivel ese regalo crece."* La
  cifra sale de `S.cliente.recarga.bono_por_bloque`, que el servidor manda
  segun el rango; si no viene, no se promete nada.

**NUNCA se menciona el dinero gastado.** Los niveles tienen dos escalas a
proposito y el cliente solo ve la de experiencia — decision de Sergio, ver la
nota de niveles. Por eso el beneficio se cuenta por el lado de la recarga y no
por el de "te faltan $X".

**4 · Los avisos ya se podian reactivar** desde el Perfil (bloque del 19-ago).
Lo unico que ningun boton puede resolver es cuando el celular quedo en
**"bloqueado"**: ahi el navegador no vuelve a preguntar nunca, y la pantalla lo
dice en vez de ofrecer un boton que no haria nada.

**Lo que se comprobo.** Las dos acciones nuevas, contra produccion y con una
credencial de prueba creada y borrada: nombre valido, nombre de una letra, sin
sesion, contrasena actual mala, nueva corta, nueva igual a la vieja, cambio
correcto, la vieja deja de servir, la nueva sirve, y **entrar** con la nueva.
Nueve casos de error y exito, todos como debian. Los datos de prueba quedaron
restaurados.

En el banco se verificaron ademas los cinco tramos del nivel, el color del
boton de la foto y los dos modales.

### 246b — "No la recuerdo", desde adentro (20-ago-2026)

Sergio: *"quiero que aqui si la persona no recuerda la contraseña actual pueda
cambiarla de igual manera con un boton olvide mi contraseña"*.

**El camino ya existia entero — pero solo desde AFUERA.** Pedir codigo,
verificarlo y escribir una clave nueva es exactamente lo que hace el "olvide mi
contraseña" de la pantalla de entrar, y esa accion **actualiza el `pass_hash`
si el cliente ya tenia credencial**: o sea ya era un cambio de contraseña.

Lo que faltaba era el acceso. Quien ya tiene la sesion abierta no llega nunca a
la pantalla de entrar: tendria que **cerrar sesion a proposito** para poder
recuperar su clave, que es justo lo que a nadie se le ocurre. Se quedaba
encerrado en un modal que le pedia el dato que no tiene.

Ahora el modal lleva un enlace **"No la recuerdo"** que arranca el mismo camino
de siempre con su telefono ya puesto. No se invento nada: se reusa codigo que
lleva dias en produccion, con su autocompletado de SMS incluido.

`preguntar()` aprendio a llevar un enlace de escape (`o.link`), debajo de los
campos y arriba de los botones — es una salida, no la accion principal.

**Comprobado el ida y vuelta completo** en el banco: el enlace manda
`pedir-codigo` con el celular del cliente y `otp:true`, sale la pantalla del
codigo, al escribirlo aparece *"¡Hola de nuevo, Sergio! Escribe tu contraseña
nueva y entras"* con **solo dos campos de clave — nunca se le pide la
anterior**, y al guardar vuelve al Perfil con la sesion abierta.

### 247 — El apellido del cliente (20-ago-2026)

Sergio: *"la app no pide apellido, debe pedir apellido en el registro inicial y
tambien se puede cambiar en el perfil"*.

**La decision que habia que tomar primero: donde vive el apellido.**

Veinte archivos del sistema leen `pos_clientes.nombre` — la comanda que se
imprime en cocina, Paco, los informes, el buscador del POS, los avisos. Si
`nombre` pasara a ser solo el nombre de pila, el apellido dejaria de verse en
todos esos sitios salvo que se toquen los veinte, y bastaria olvidar uno para
que el mismo cliente saliera con apellido en una pantalla y sin el en otra.

Asi que:

- **`nombre` guarda el nombre COMPLETO** ("Sergio Abadia"). Todo el sistema gana
  el apellido sin tocar una sola linea.
- **`apellido` se guarda aparte**, solo para poder volver a separarlos al
  editar.

Es un dato derivado a proposito, y esta documentado en la columna para que nadie
lo "corrija". Si alguien edita el nombre desde el POS, `apellido` puede quedar
viejo; se recompone la proxima vez que el cliente lo edite desde su perfil.

**Por que no se parte por el primer espacio.** "Jose Antonio Muñoz" quedaria como
"Jose" + "Antonio Muñoz". Al mostrar el nombre sin apellido se RESTA el apellido
guardado del final del nombre completo (`soloNombre`), que es exacto. Probado
justo con ese caso.

**Donde se ve:** el registro pide *Tu nombre* y *Tu apellido* por separado, y el
perfil los muestra como dos renglones distintos en "Tu cuenta", cada uno
editable.

`web-acceso` v32: `nombreCompleto()` compone en un solo sitio, `crear-cuenta` y
la accion `nombre` aceptan los dos campos, y `fichaCliente` devuelve `apellido`
aparte. El apellido se manda siempre, aunque venga vacio: si el cliente lo borro
a proposito, dejar el viejo seria devolverselo sin que lo pida.

**Comprobado.** Contra produccion: nombre + apellido, nombres y apellidos
compuestos, borrar el apellido, y espacios de sobra — los cuatro componen bien
el nombre completo y devuelven el apellido aparte. En el banco: la ficha separa
"Jose Antonio" / "Muñoz Perez" sin equivocarse, la edicion guarda y repinta, y
el registro desde cero manda los dos campos. Los datos de prueba quedaron
restaurados.

### 248 — La tarjeta de saldo tiene personalidad (20-ago-2026)

Sergio: *"quiero que la tarjeta de saldo tenga mas personalidad (no cambia la
forma) solo cambie el diseño interior, el color, podemos poner patrones, poner
un chip simulando el chip de tarjeta"*. Y de referencia, una Visa roja.

Escogio: **la roja en tema oscuro y la negra con dorado en tema claro**. Sobre
fondo claro el rojo encendido pesa demasiado y se come la pantalla; el carbon
descansa y ademas hace juego con la tarjeta de puntos, que ya es dorada.

**LA FORMA NO SE TOCO.** La muesca es una mascara CSS de seis capas con una
advertencia escrita al lado —"no pongas box-shadow ni filter, la sombra se
proyecta dentro de la muesca"—. No se cambio ni el radio, ni el padding, ni la
mascara, ni el boton. **Solo el `background`.** Se comprobo despues: la mascara
sigue teniendo sus 42 partes y el boton esta en el mismo pixel.

**El primer intento del patron estaba mal y hubo que rehacerlo.** Se dibujaron
ondas horizontales paralelas, y eso se lee como un rayado. Mirando la referencia
de cerca, las lineas son curvas **anidadas** —una dentro de otra, apretandose
hacia un lado—, el dibujo de un mapa de curvas de nivel. Se hicieron tres
versiones (anillos, curvas de nivel, y las dos superpuestas) y Sergio escogio la
tercera: en la foto se ven los dos dibujos a la vez.

**Va dibujado, no es una imagen.** El patron es un SVG de texto dentro del
propio `background`: unos kilobytes, nitido en cualquier pantalla y sin una
peticion mas. Una foto se veria borrosa en un celular bueno.

**El chip** es UN solo elemento vacio; todo el dibujo son tres degradados
superpuestos en el CSS — los dos primeros hacen los contactos. Sin hijos que
estorben ni imagen que cargar. El rotulo del saldo baja 54 px para dejarle su
sitio.

Se cubren las **dos maneras de estar en claro**: el interruptor de la app
(`html.tema-claro`) y el del propio celular (`prefers-color-scheme`). Con solo
la primera, a quien tuviera el celular en claro y no hubiera tocado el
interruptor le habria salido la roja.

**Comprobado** en las dos tarjetas —la del inicio y la de la Billetera— y en los
dos temas: en oscuro el fondo rojo con sus 26 anillos y 30 curvas, en claro el
negro con sus 50 rayas doradas, el chip dibujado en ambos, sin montarse con el
texto y sin desbordar.

### 249 — La escalera de niveles: era un choque de nombres (20-ago-2026)

Sergio: *"los iconos de estandar, premium y vip estan como desorganizados, con
unas lineas raras, no tiene sentido ni se entiende el flujo"*.

**No era el diseño: eran dos componentes peleando por el mismo nombre.** La
escalera de rangos se llamaba `.ep-paso` (linea 299 de la hoja) y los pasos de
la **linea de tiempo del pedido** tambien (linea 2226). Como la del pedido esta
escrita despues, ganaba, y le metia a la escalera:

- `display:grid` de dos columnas → el icono a la izquierda y el nombre a la
  derecha, descuadrados;
- un `::before` que dibuja **una linea vertical de 2 px** → las "lineas raras"
  que colgaban de cada icono. Es el hilo que une los pasos de un domicilio,
  puesto donde no va.

Se renombro a **`ep-rango*`**, que no choca con nada. Sin eso, cualquier arreglo
se volvia a romper el dia que alguien tocara el seguimiento del pedido.

**El dibujo nuevo — el riel** (escogido por Sergio entre tres propuestas): una
via horizontal con una parada por nivel, lo recorrido en color y lo que falta en
gris. El nivel actual lleva halo y la etiqueta "Estas aqui".

Dos detalles que se calculan en el JS porque dependen de cuantos niveles tenga
cada restaurante:

- **La via une los CENTROS** de la primera y la ultima parada, no los bordes de
  la tarjeta: de borde a borde sobraria media parada a cada lado y la linea se
  saldria por debajo de los iconos.
- **El relleno suma el nivel alcanzado MAS el avance dentro del suyo**, asi que
  la via crece con cada pedido y no solo al cambiar de rango. Entre n paradas
  hay n−1 tramos, no n.

**Comprobado** en los tres estados con la escalera de El Parche: Estandar al 40%
llena el 20% de la via, Premium al 70% llena el 85%, y VIP —el maximo— llena el
100% sin pasarse. La via empieza y termina en el centro exacto de las bolitas de
los extremos (69 px y 347 px, contra centros en 69 y 347), y ya no queda ni un
solo elemento `.ep-paso` dentro de la escalera.

### 250 — El inventario descontado por pedidos de julio (20-ago-2026)

Sergio: *"si le pregunto al bot cuantos panes de hamburguesa tenemos me dice que
1... deberia haber 3"*. Su sospecha era que los pedidos de prueba borrados se
habian llevado el inventario.

**No fue eso.** Los pedidos de prueba nunca existieron como movimientos: los 7
movimientos del pan apuntan a pedidos que siguen todos en la base.

**Fue un lote del 19-ago a las 16:13**: 102 movimientos creados EN EL MISMO
SEGUNDO, descontando por **9 pedidos del 20 y 25 de julio**. Esos pedidos son
anteriores a que el inventario funcionara —las recetas se cargaron el 23 de
julio y el primer movimiento real es del 30— asi que nunca debieron tocar las
existencias. Muy probablemente lo disparo algo que ejecute yo esa tarde
reponiendo el inventario de las pruebas; no se puede probar desde los datos, lo
unico que queda es que los 102 nacieron a la vez.

**La prueba de que estaba mal no es la fecha, es el resultado:** dejo dos
insumos en stock **negativo** (Salsa de ajo −0,144 y Salsa de tomate −0,048).
Un stock negativo no existe.

Se llevo, entre 18 insumos: 28 quesos, 525 g de carne desmechada, 14 tocinetas,
500 g de maicitos, 700 g de pollo, 4,5 kg de papa, 38 porciones de salsas y
**2 panes de hamburguesa** — que es justo lo que Sergio vio.

**La reversion** (`2026-08-20-revertir-descuento-julio.sql`) devolvio los 18
insumos y marco los 102 movimientos como revertidos, para que no se puedan
volver a aplicar ni contar dos veces. Los tres contadores dieron 18 / 102 / 18.

**LA TRAMPA, otra vez:** `iv_existencias` tiene `branch_id` en NULL y los
movimientos SI traen la sede. Cruzarlos por sede no casa ni una fila y el UPDATE
"funciona" sin cambiar nada — ya paso una vez. Se agrupa solo por insumo y se
cuentan las filas afectadas.

**Verificado contra la lista que dio Sergio: los 40 renglones cuadran** — 23 de
comida y 17 bebidas con su bodega y su nevera por separado. Dos ajustes hicieron
falta ademas de reponer: la salsa de ajo quedo en −0,003 (se dejo en cero) y una
Coca Cola Personal estaba contada en bodega cuando va en la nevera (el total, 8,
si estaba bien).

**PENDIENTE, no se toco.** El **Pollo** tiene `buy_unit` = kg con
`conversion` = 2500: dice que un kilo trae 2.500 gramos. Si eso esta mal, cada
receta esta descontando 2,5 veces menos pollo del que de verdad se usa. El stock
(1 kg) coincide con lo que dijo Sergio, asi que el numero esta bien; lo dudoso
es la conversion. Es dato suyo y hay que preguntarle si compra por kilo o por
bolsa de 2,5 kg.

### 251 — Los combos también llevan etiqueta (20-ago-2026)

Sergio: *"quiero que en las configuraciones de producto yo pueda colocarle
también etiquetas a los combos, es decir etiqueta más vendido, picante, etc.,
las etiquetas que tenemos"*.

Los productos ya tenían `medalla` y `medalla_valor`; los combos no. Se usan los
**mismos nombres de columna** a propósito: la página del cliente ya sabe pintar
esos dos campos, así que con que el combo los traiga se dibuja igual. Inventar
un `etiqueta_combo` habría sido una segunda manera de decir lo mismo.

**Había un cabo suelto de antes.** `fn_web_carta` mandaba los combos con
`'medalla', null` escrito a mano: la página sabía pintar la etiqueta desde
siempre, pero al combo nunca se la mandaban. Ahora manda la real.

**El selector es EL MISMO** para productos y combos: `_medallaPickerHTML(p, quien)`
cambia a quién le avisa —`setProdMedalla` o `setComboMedalla`— y nada más. Dos
copias del selector eran la garantía de que un día se agregara una etiqueta
nueva en una y no en la otra.

**"Más pedido" sigue sin poderse poner a mano**, ni en productos ni en combos.
La pone el sistema con las ventas de verdad; poder ponerla sería poder mentirle
al cliente. Y **"Ahorras…"** es la única que pide monto: el campo aparece solo
cuando se escoge, y el monto solo se guarda con ella.

**Comprobado.** En la base: se le puso `picante` a un combo y `fn_web_carta` lo
devolvió con su etiqueta, mientras los otros dos siguieron en `null` (se dejó
todo en limpio después). Y la lógica del selector, corrida aparte: para producto
llama a `setProdMedalla` y para combo a `setComboMedalla`, con las mismas 8
etiquetas en los dos, el campo del monto solo con "Ahorras" y precargado.

No se pudo probar la pantalla en el navegador: el catálogo exige sesión y PIN, y
el banco no logró pasar las dos guardas. Queda para que Sergio abra el editor de
un combo y lo vea.

### 252 — Plantillas de WhatsApp con botones (20-ago-2026)

Sergio: *"iba a crear una plantilla de whatsapp desde Cobra y mire que no tiene
la opcion de crear la plantilla con botones, necesito que se pueda crear
plantilla con botones, para que ese boton los mande a la app de clientes"*.

Hasta hoy la plantilla era solo **cuerpo y pie**: una campana terminaba en un
mensaje que el cliente tenia que leer y luego ir a buscar la pagina por su
cuenta. El unico boton que existia era el de copiar el codigo, y solo en las de
AUTENTICACION.

**Dos tipos, no mas:**

- **Enlace** — abre una direccion. Es el que pidio Sergio.
- **Respuesta rapida** — mete una respuesta que el cliente toca.

No se acepta el de **llamar**: el numero tendria que salir de la ficha del
restaurante y no de lo que mande el navegador, y hoy nadie lo pide. Meterlo
"por si acaso" seria una via para publicar un telefono equivocado.

**El atajo "Botón a mi app de clientes"** arma el boton solo, con la direccion
sacada del `slug` del restaurante y **no escrita a mano**: si manana cambia el
nombre de la pagina, los botones nuevos siguen llevando al sitio correcto.

**Los limites son de Meta y se respetan ANTES de mandar:** maximo 3 botones y 25
caracteres de texto. Con tres, el boton de agregar se apaga — mejor eso que
dejar que Meta rechace la plantilla despues de radicarla. Y un boton a medias
(sin texto, o un enlace sin direccion) no viaja: haria rechazar la plantilla
entera.

**Los botones viven en `WTP.botones`, no en el DOM.** El formulario se repinta
al agregar y al quitar; si se leyeran de los campos, cada repintado borraria lo
escrito. Es la misma leccion del barrio de la app de clientes esta misma manana.

La vista previa los dibuja **debajo** de la burbuja, en gris y separados, que es
como los pinta WhatsApp — no dentro del texto verde.

**Comprobado.** La funcion desplegada (v6) sigue respondiendo con una llamada
real: lista las 3 plantillas aprobadas. Y la logica que arma los botones,
corrida aparte con ocho casos: el boton a la app sale como `URL` con su
direccion, una direccion sin `https://` se completa sola, la respuesta rapida
sale como `QUICK_REPLY`, un enlace sin direccion y un boton sin texto se
descartan, un texto largo se corta a 25, de cuatro botones solo entran 3, y sin
botones no se agrega el componente.

### 253 — Listas de envío: crearlas de verdad (20-ago-2026)

Sergio: *"para enviar plantillas necesito listas de envío pero sólo tenemos una
y la creaste tú... necesito poderlas crear yo"*, con filtros por todos los
contactos, los que han chateado, los registrados, los que tienen puntos y los
que se recomienden.

**Tres cosas estaban rotas o faltaban, y las tres se descubrieron por partes.**

**1 · Guardar una lista fallaba SIEMPRE.** `pos_wa_listas` tiene una regla de
seguridad que exige `tenant_id` en cada fila —es lo que impide que un
restaurante vea las listas de otro— y el `insert` no lo mandaba: *"new row
violates row-level security policy"*. La única lista que existía la había creado
yo **desde el servidor**, donde esa regla no aplica, así que el fallo estuvo
tapado hasta que Sergio intentó crear la suya.

**2 · Nadie llenaba la cola de destinatarios.** Se podían crear listas y se
podía enviar, pero `pos_wa_envios` **solo se leía y se actualizaba**: no había
una sola línea en todo el sistema que insertara ahí. Los 1.381 de la única
campaña los metí yo a mano. Crear una lista y darle enviar no habría mandado
nada.

Lo resuelve **`fn_wa_armar_lista(lista)`**: lee los filtros guardados y mete en
la cola a los que cumplen. Se puede llamar cuantas veces se quiera —no vuelve a
meter a quien ya está—, así que armar otra vez solo agrega los contactos nuevos.
Y manda **una sola vez por número**: el mismo teléfono puede estar dos veces en
los contactos (con indicativo y sin él), y recibir la misma promoción dos veces
es la forma más rápida de que alguien bloquee el número.

**3 · La lista vieja se veía mal.** La había guardado con `{tipo:
'sin_conversacion'}` y la pantalla lee `filtro`, así que salía como "Todos ·
1415" en vez de los que nunca han escrito. Se migró al formato que la pantalla
entiende.

**Los filtros nuevos.** Los dos primeros que pidió ya existían; faltaban los que
cruzan con la app. Se ampliaron la vista `v_wa_contactos` (con `registrado_app`,
`puntos` y `saldo`) y la pantalla. Con sus 1.417 contactos de hoy:

| Filtro | Cuántos |
|---|---|
| Todos | 1.417 |
| Nunca han escrito a Cobra | 1.309 |
| Ya escribieron | 108 |
| Con pedidos | 71 |
| **Con puntos** | 93 |
| **Registrados en la app** | 2 |
| **Con saldo** | 0 |
| **Compraron una sola vez** | 55 |
| **Nunca han pedido** | 1.346 |
| **Hace más de 60 días que no piden** | 0 |

Los tres últimos los recomendé yo: son los que sirven para una campaña de
verdad — traer al que compró una vez, estrenar al que nunca ha pedido, y
recuperar al que se fue. "Perdidos" da 0 hoy, y eso es una buena noticia.

**Comprobado contra la base**, con una lista de prueba creada y borrada: armó 93
con el filtro de puntos —los mismos 93 que cuenta la vista—, al armar otra vez
agregó 0 y reportó los 93 ya existentes, y no dejó ningún teléfono repetido.
Luego los otros cuatro filtros, todos exactos: 106, 2, 1.344 y 55.

### 253b — Escoger la plantilla de una lista (20-ago-2026)

Sergio, viendo su lista nueva: *"ni siquiera me da la opcion de colocar una
plantilla en la lista, eso lo hiciste tu internamente la primera vez pero no
existe esa opcion"*. Tenia razon en las dos cosas.

**No habia donde escogerla.** `wcFiltrosActuales()` guardaba el filtro, la
busqueda y si se excluye la lista negra — pero **no la plantilla**. La unica
lista que la tenia era la que arme yo desde el servidor, escribiendo el nombre
a mano en el JSON. Cualquier lista creada desde la pantalla nacia con
"plantilla —" y sin manera de arreglarlo.

Ahora **cada lista lleva su propio selector** con las plantillas **aprobadas**
del restaurante. Solo las aprobadas: Meta rechaza el envio con una en revision,
y ofrecerla seria ofrecer un error seguro. Se guarda al escogerla, asi que la
proxima vez ya viene puesta.

**Y el boton mentia.** Se apagaba con "Lista completada" cuando no habia
pendientes — pero una lista **recien creada** tiene cero pendientes porque
TODAVIA NO SE HA ARMADO, no porque este terminada. Era imposible estrenar una
lista nueva. Ahora el boton dice lo que de verdad toca:

| Situacion | Que dice |
|---|---|
| Sin plantilla escogida | Escoge una plantilla (apagado) |
| Lista nueva, sin armar | **Armar y enviar** |
| Con pendientes | Enviar tanda de hoy |
| Ya se mandaron todos | **Buscar nuevos y enviar** |

El ultimo importa: desde el ultimo envio pueden haber entrado contactos que
cumplen los filtros, y `fn_wa_armar_lista` solo agrega a los que faltan.

### 254 — Seguimiento de pedidos hechos en Cobra: ya funcionaba (20-ago-2026)

Sergio pidió conectar los pedidos que **no** salen de la app —los que hace el
mesero o los de mesa— para que el cliente registrado los vea en su app con el
mismo seguimiento. *"No hay que hacer nada nuevo, lo único que tenemos que hacer
es conectar los pedidos que se hacen directamente desde Cobra."*

**No hubo nada que conectar: ya estaba.** Y se comprobó, en vez de suponerlo.

`pedido-activo` busca **por `cliente_id`**, no por el origen del pedido. Da
igual quién lo haya creado: si el pedido está a nombre de la ficha del cliente,
aparece. Lo mismo el historial.

**La prueba, de punta a punta.** Se creó un pedido como lo crearía un mesero
—sin `origen: web`, con mesero y todo— a nombre de una clienta registrada:

| Paso | Lo que vio la app |
|---|---|
| Pedido creado, en preparación | Lo muestra, con su corto, canal, total y qué pidió |
| El mesero lo marca **listo** en Cobra | Cambia a "listo" |
| Se marca **entregado** | Desaparece del seguimiento, como debe |

El pedido de prueba se borró; quedaron 0. Antes de eso se verificó también con
un pedido **real y viejo** de Linda isabela —hecho en Cobra el 14-ago—: sale en
su historial dentro de la app.

**El aviso al celular también sale solo.** Lo dispara `cambiar-estado`, por
donde pasan TODOS los cambios: el POS, el chat y el cron. No hay que colgarlo de
ninguna pantalla.

**La única condición, y es la que Sergio ya puso:** el pedido tiene que estar a
nombre de la ficha del cliente. Hoy, de 307 pedidos, **214 tienen cliente**. De
los 91 que no, **73 son de mesa** —gente que llega, se sienta y come, sin nadie
a quien vincular— y **ninguno es domicilio**: todos los domicilios tienen su
cliente. Solo 2 tienen un nombre escrito a mano sin ficha.

**Y un riesgo que se descartó midiendo:** si un mismo teléfono tuviera varias
fichas, el mesero podría elegir la equivocada y el pedido no aparecería. Se
buscó: **cero teléfonos con fichas duplicadas**. Los tres "Sergio" tienen
números distintos, así que no aplica. Por eso NO se cambió la búsqueda a
teléfono: habría sido más código para resolver un problema que no existe.

### 255 — El historial anterior al registro: también ya funcionaba (20-ago-2026)

Sergio: *"en el momento que el cliente se registre y entre en la app por primera
vez ya deben aparecer sus puntos... pero también debe aparecer su historial
incluso si ese historial sucedió antes de que el cliente se registrara"*.

**Ya funciona, y se comprobó con una clienta de verdad.** La consulta del
historial es `pos_orders?cliente_id=eq.X&status=neq.cancelled&order=created_at.desc`:
**no tiene filtro de fecha**, así que trae lo de antes y lo de después del
registro por igual.

La razón de fondo es cómo se registra alguien: `crear-cuenta` **enlaza con la
ficha que ya existe** para ese teléfono en vez de crear una nueva ("enlazar o
crear — la misma operación"). Al enlazarse hereda todo: puntos, nivel, historial
y direcciones.

**La prueba.** Se abrió una sesión de diagnóstico para **Vilma Ortiz**, que
tiene 3 pedidos desde el 26 de julio y **no está registrada** — justo el caso
que describe Sergio. Si se registrara hoy, su app le mostraría:

- **286 puntos** y su nivel;
- sus **3 pedidos**, del 16-ago, 2-ago y 26-jul, con qué pidió, cuánto y los
  puntos que ganó en cada uno.

La sesión se borró al terminar.

**Un número, una ficha — está garantizado por la base**, no por buena voluntad:
`ux_clientes_tel` es un índice ÚNICO sobre (restaurante, últimos 10 dígitos del
teléfono). No se pueden crear dos fichas con el mismo número aunque uno venga
con indicativo y el otro sin él. Y las direcciones se acumulan dentro de la
ficha: Isabel tiene 4, Cameron 3.

**Lo único que conviene saber: el historial trae los últimos 8 pedidos.** Hoy el
cliente con más tiene 5, así que nadie lo nota. Cuando alguien pase de 8 verá
solo los últimos ocho. Se deja anotado para subirlo cuando Sergio quiera; no se
cambió porque no lo pidió y afecta cuánto se descarga en cada visita.

### 256 — Auditoría de seguridad antes de lanzar (20-ago-2026)

Sergio: *"dime si la app de clientes es totalmente segura tanto para ellos como
para mí... que nadie pueda ponerse puntos, que nadie pueda hackear y ponerse
saldo, y tampoco que ellos pierdan sus puntos o su saldo. Revisa si está
totalmente segura para hoy poderla lanzar."*

**Se encontró un agujero grave, y era explotable de verdad.**

La llave `anon` va escrita en el JavaScript de la página — es pública por
diseño, cualquiera la lee abriendo la consola. Y **58 funciones tenían permiso
de ejecución para el público**, casi todas `SECURITY DEFINER`, o sea que se
saltan la seguridad por fila a propósito.

No se dedujo: **se probó**. Llamando desde fuera, sin ninguna sesión,
`fn_puntos_regalar` **devolvió 1 y el punto quedó guardado** (se revirtió de
inmediato). `fn_saldo_mover` llegó a insertar y solo la frenó una restricción
del motivo. Entre las expuestas estaban también `pos_marcar_dueno`,
`fn_credito_abonar`, `fn_recarga_aplicar` y todas las de inventario.

**Por qué pasó.** El patrón `grant execute ... to anon, authenticated,
service_role` se fue copiando de una migración a la siguiente sin preguntarse si
`anon` hacía falta. Yo mismo lo repetí hoy con `fn_puntos_regalar`.

**LA TRAMPA AL CERRARLO.** El primer intento revocó de `anon` y **no cambió ni
un permiso**: el privilegio no venía de `anon`, venía de **PUBLIC** —PostgreSQL
se lo da a toda función nueva— y `anon` heredaba de ahí. Hay que revocar de
PUBLIC y devolverle el permiso explícito a `authenticated` (el POS) y
`service_role` (las Edge Functions).

Quedaron **5 funciones públicas** de 70: la carta, las promos, los datos del
restaurante, el catálogo de premios y si está abierto. Lo que un visitante sin
cuenta necesita ver, y nada más.

**Lo que ya estaba bien** (verificado, no supuesto):

| | |
|---|---|
| Tablas | **Todas cerradas.** Clientes, saldo, puntos, credenciales, sesiones, pedidos, chats: un desconocido no lee ninguna |
| Precios | Los calcula el servidor con la carta; lo que mande el navegador no se usa |
| Canje | Los puntos del premio salen de `pos_puntos_catalogo` por id, no del navegador |
| Saldo y puntos | No pueden quedar negativos; se mueven con bloqueo `for update` y dejan libro |
| Contraseñas | PBKDF2 de 120.000 vueltas, sal aleatoria, comparación en tiempo constante |
| Código SMS | 3 intentos y se quema; 3 por hora y 8 por día por número |
| Sesiones | Token largo, guardado en la base solo como hash, con vencimiento |

**El segundo hallazgo, también cerrado.** La contraseña **no tenía límite de
intentos**. Se agregó: ocho fallos seguidos y a esperar 15 minutos. Se cuenta
por TELÉFONO y no por IP —la IP cambia sola en los datos del celular y bloquear
por IP dejaría fuera a media ciudad si comparten salida—, y **un acierto borra
el contador**, para que quien se equivocó tres veces y luego entró bien no
quede cargado para la próxima.

Probado: se frenó en el intento 9, el dueño legítimo con su clave correcta
también quedó frenado mientras duraba el bloqueo (que es lo que debe pasar), y
al pasar la ventana entró normal. Todos los datos de prueba se borraron.

### 257 — Aviso en la app cada vez que entran puntos (20-ago-2026)

Sergio: *"quiero que llegue una notificación a las personas cada vez que ganen
puntos. Ya sea por una venta o porque se los dé yo manualmente. Cualquier punto
que ingrese."*

**Ya existía el aviso por WhatsApp, no el de la app.** `aviso-puntos` barre los
abonos y manda la plantilla de Meta; `avisar-cliente` manda el push pero solo
sabía de recargas y de estados de pedido.

Se agregó el tipo **`puntos`** a `avisar-cliente`, con textos distintos según
cómo entraron — un regalo no se puede leer como una compra:

| Cómo entraron | Lo que le llega |
|---|---|
| Comprando | **+146 puntos 🎁** · Ya tienes 286 puntos en El Parche Food |
| Regalados por el dueño | **Te regalamos 200 puntos 🎁** · Un detalle de parte nuestra |

El cuerpo dice los ganados **y el total**: el número suelto no motiva, lo que
motiva es ver el acumulado crecer. Los textos son editables por el dueño, como
los de pedido y recarga.

**Solo cuando SUMAN.** Un canje también deja movimiento, y avisar "usaste 200
puntos" con la misma alegría sería burlarse del cliente. Se comprueba y se
devuelve `no_suma`.

**Se cubren los dos caminos con un solo enganche.** El barrido de `aviso-puntos`
ahora incluye también los movimientos de tipo `regalo`, no solo `acumulacion`,
y dispara el push antes de mirar la configuración de WhatsApp: son dos canales
distintos, y si el dueño tiene apagado el aviso por WhatsApp el cliente igual ve
el suyo en la app. Es best-effort: si el push falla, el abono ya quedó guardado.

**Los puntos viven por TELÉFONO, no por cliente**, así que `avisar-cliente`
resuelve el cliente desde el teléfono. Quien llama casi siempre tiene el número
a mano y no el id.

**Probado de punta a punta contra producción:** se regaló 1 punto al número de
Sergio, el barrido lo tomó (`enviados: 1`), el movimiento quedó marcado
`enviado`, y el push salió a sus **2 dispositivos**. El punto de prueba se
revirtió: quedó en los 1.000 que tenía.

### 258 — "Calculando" no es lo mismo que "no lo conozco" (20-ago-2026)

Sergio: *"mientras la aplicación analiza cuánto cuesta el domicilio está
saliendo el letrero de siempre... ese letrero debería salir exclusivamente para
un cliente que de verdad no conozcamos el barrio. De resto se debería quedar
cargando y luego aparecer."*

**Es el mismo error de esta mañana, visto desde el otro lado.** Entonces el
letrero salía porque la app mandaba mal el barrio; ahora salía porque la
pantalla **solo distinguía dos estados** donde hay tres:

| | Antes | Ahora |
|---|---|---|
| La cuenta no ha llegado | "no sabemos cuánto vale" | **calculando…** |
| Llegó y el barrio no está | "no sabemos cuánto vale" | "lo pagas al recibir" + el letrero |
| Llegó con su precio | $5.000 | $5.000 |

La condición era `domicilio <= 0`, y mientras el servidor responde el domicilio
vale cero — así que durante ese segundo el cliente leía que no conocemos su
barrio aunque estuviera en la tabla desde siempre.

**El dato ya venía; nadie lo miraba.** `web-pedido` devuelve `barrio_conocido`
en la cuenta previa desde que se hizo. Ahora la pantalla pregunta por él en vez
de deducirlo de un cero, que puede significar dos cosas distintas.

**Comprobado con el servidor tardando 2,5 segundos a propósito**, en los dos
casos: con barrio conocido pasa de "calculando…" a "$5.000" y el letrero no
aparece nunca; con barrio desconocido pasa de "calculando…" a "lo pagas al
recibir" y ahí sí sale el letrero.


---

## 20-ago-2026 (noche) — El modal de instalar dentro de Instagram

Sergio va a poner el enlace de la app en la biografia de Instagram, y ahi hay
una trampa: Instagram abre los enlaces en **su propio navegador interno**, no
en Safari ni en Chrome — y en ese navegador **no se puede instalar** la app
(no tiene el boton Compartir de Safari ni el menu de Chrome). Peor: el modal
de instalar le daba los pasos de Safari a alguien que no los tenia delante.

Lo que se hizo en `app-cliente.js` (+ un estilo en `app-cliente.css`):

- `enAppAjena()` — reconoce el navegador interno de Instagram, Facebook,
  TikTok, Snapchat y Line por el `user agent` (es lo unico que dejan ver).
- El modal ahora avisa primero **donde esta la persona** ("estas viendo esto
  dentro de otra aplicacion y desde aqui no se puede instalar") y cambia los
  pasos:
  - **iPhone**: tres puntos → "Abrir en el navegador" → ya en Safari, tocar
    Instalar. No hay forma tecnica de forzar Safari desde ahi (Apple no la da);
    lo unico honesto es ensenar donde tocar.
  - **Android**: boton **"Abrir en Chrome"** que SI funciona — un enlace
    `intent://…#Intent;scheme=https;package=com.android.chrome;end` saca al
    Chrome de verdad, donde el modal ya ofrece instalar de un toque. Se arma
    sin el `#hash` de la URL para no romper el `;end` del intent.
- `tocaOfrecer()` ajustado: antes en iPhone-sin-Safari no ofrecia nada, lo que
  tambien silenciaba el caso Instagram-iPhone, que es justo donde mas se
  necesita el aviso.

**Comprobado en banco local con el user agent disfrazado** (Instagram-iPhone,
Instagram-Android y navegador normal): cada caso muestra sus pasos y el caso
normal quedo identico a como estaba. Los 6 user agents reales tambien pasaron
por un banco en Node.

**Segunda vuelta (misma noche):** Sergio probo desde Instagram y no salia nada,
ni en el login ni despues de entrar. Dos causas: (1) el aviso solo se ofrecia
DESPUES de entrar a la cuenta, y quien llega desde la biografia llega sin
sesion — ahora, si esta dentro de otra app, el aviso sale tambien en la
pantalla de entrada (en navegadores normales sigue saliendo solo despues de
entrar, como lo decidio Sergio); y (2) el `?v=` de cache es por HORA: su Safari
pidio el archivo con esa marca minutos antes de publicar, el CDN guardo la
version vieja bajo esa direccion (~10 min) y a Instagram le llego la misma
copia vieja — por eso tampoco salia tras entrar. Eso se resuelve solo al
vencer el cache o cambiar la hora.

**Tercera vuelta (decision de Sergio):** el modal de instalar ahora sale
SIEMPRE al llegar, antes de iniciar sesion ("asi es mas efectivo"), en todos
los navegadores — ya no solo dentro de Instagram. Si la persona lo cierra, los
7 dias de espera evitan repetirselo al entrar. Sello de cache: `0820l`.

**Cuarta vuelta (rastrear, no adivinar):** desde Instagram seguia sin salir
nada. Dos medidas: (1) deteccion reforzada — ademas del nombre en el user
agent, ahora se reconoce el navegador interno por lo que le FALTA (Android:
"; wv)"; iPhone: no dice Safari ni CriOS/FxiOS/EdgiOS/OPT); y (2) una HUELLA
DE DEPURACION temporal bajo el login (`.ep-huella`, `huellaDepuracion()` en
`app-cliente.js`): "0820m · nav interno: si/no · aviso: si/no (motivo)".
QUITARLA cuando Sergio confirme que el modal sale en su Instagram. Sello:
`0820m`. Ojo: el index.html se cachea 10 min en el celular (max-age=600 del
CDN), asi que dos intentos seguidos pueden ver la version vieja.


---

## 20-ago-2026 (noche) — Chat: boton + funcionando y plantillas desde el chat arregladas

**1. El error al enviar plantillas desde el chat** (lo reporto Sergio): la
funcion `wa-plantillas` (v7) buscaba la llave `phone_number_id` en
`chat_channels.meta`, pero la conexion con Meta la guardo como `phone_id` —
por eso podia LISTAR plantillas (no necesita el numero) pero el envio decia
"la sede no tiene numero de WhatsApp". Ahora acepta las dos llaves. Comprobado
enviando la plantilla `domis` real al WhatsApp de Sergio: `{ok:true}` y le llego.

**2. El boton + del chat** (`newConvBtn` en `chat-ia.html`) estaba muerto: sin
manejador. Ahora abre el modal "Nuevo chat" (`abrirNuevoChat` /
`crearNuevoChat` en `chat-ia.js`): nombre + celular a 10 digitos + direccion
opcional. Al crear:
- Si el numero YA tiene chat (en cualquier bandeja/estado), se abre ese — un
  numero = una conversacion; solo se le pone el nombre si no tenia.
- Si no, se crea la conversacion (`human_takeover: true` → cae en la pestaña
  "Tu" y Paco no se mete) y la vista salta a esa pestaña con el chat abierto.
- La ficha de `pos_clientes` se crea solo si el telefono no tenia (un numero =
  una ficha); si existia, solo se completa la direccion vacia.
- Como el contacto nunca ha escrito, `waWindowInfo()` da ventana cerrada y el
  propio chat ofrece "Enviar plantilla" — el unico primer paso que WhatsApp
  permite. Ese envio es el del punto 1, ya arreglado.

Verificado: forma exacta del INSERT probada con una fila PRUEBA (borrada), el
modal probado aparte en banco (filtro de digitos y errores en linea). Lo que
NO se pudo probar en banco: el flujo completo con sesion del POS (los guards
de login lo impiden); la primera prueba real la hace Sergio desde el chat.

**Retoques (mismos minutos, los vio Sergio):** (1) el modal era ilegible — la
caja de `.ci-tpl-ov` es oscura fija pero cuelga de `<body>`, donde las
variables de texto valen las del tema claro: titulo tinta-oscura sobre caja
oscura. Se fijaron los valores oscuros EN el overlay, lo que de paso curaba lo
mismo en el modal de plantillas. (2) el boton + se cortaba: la fila de arriba
suma mas que la columna (366px); ahora el que cede es el texto "Asistente"
(puntos suspensivos) y los botones no se encogen nunca. Verificado en banco al
ancho minimo (300px).

**Quinta vuelta — beacon:** en el Instagram de Sergio sigue sin salir nada (ya
sin sesion) y no hay consola que mirar. Se puso un BEACON temporal: la app, a
los 4 s de abrir, manda a `web-acceso` (v34, accion `diagnostico`) la version
cargada, el user agent, que decidio `enAppAjena`/`tocaOfrecer` y si el modal
esta en pantalla; cae en la tabla `web_diag` (solo service_role — OJO: el
`revoke all from public` le quito el INSERT tambien a service_role y hubo que
devolverselo). QUITAR beacon + accion + tabla al resolver. Sello `0820n`.

**RESUELTO (beacon, fila id=3):** la version nueva SI llegaba y la deteccion
SI funcionaba; lo que callaba el aviso era la espera de 7 dias — en una prueba
del dia el modal se cerro dentro de Instagram y quedo mudo. Arreglo: dentro de
un navegador ajeno la espera de 7 dias NO aplica; el aviso sale en cada visita
y solo se calla (sessionStorage `ep-instalar-no-visita`) si se cierra en esa
misma visita. En navegadores normales los 7 dias siguen. Verificado en banco:
con el no-molestar puesto sale igual; cerrado → callado en la visita; visita
nueva → sale. Sello `0820o`. El beacon sigue puesto hasta que Sergio confirme.

**CERRADO (confirmado por Sergio: "ya sale el modal"):** se retiraron los
andamios — el beacon y la huella de `app-cliente.js`, el estilo `.ep-huella`,
la accion `diagnostico` de `web-acceso` (v35) y la tabla `web_diag` (drop).
Sello final `0820p`. Queda en produccion: deteccion de navegador ajeno (por
nombre y por lo que falta), aviso de instalar SIEMPRE al llegar (decision de
Sergio), pasos de salida para iPhone y boton "Abrir en Chrome" en Android, y
la espera de 7 dias solo en navegadores normales.


---

## 20-ago-2026 (noche) — Codigo al celular para pagar con Billetera en caja

Decision de Sergio: dar el numero NO basta para gastar el saldo de una cuenta.
Al tocar "Agregar pago" con el metodo Billetera, se le manda un codigo de 6
digitos al celular del dueNo y el pago solo se apunta con ese codigo.

**Servidor (`web-acceso` v38):** dos acciones nuevas, `pago-codigo` y
`pago-verificar`, EXCLUSIVAS del POS: exigen `pos_token` (la sesion de un
usuario del sistema, validada contra /auth/v1/user) y el tenant sale de esa
sesion — nadie de afuera puede pedir codigos ni validar. Reusan la tabla
`pos_web_codigos` con motivo `pago` y todos los topes del registro (3/hora,
10/dia, vence a los 10 min, 3 intentos y se quema). Aislamiento en los dos
sentidos: `pago-verificar` solo mira motivo `pago`, y `verificar-codigo` (el
del registro) ahora EXCLUYE motivo `pago` — un codigo de caja no puede
registrar cuentas ni cambiar claves, ni al reves. El envio reusa la cascada
del registro con una FRASE propia: "para pagar $ 25.500 en El Parche" (pedido
de Sergio: que diga que es para pagar y cuanto). Con frase propia NO se
intenta la plantilla de Meta (su texto diria "entrar"); va por WhatsApp texto
si la ventana de 24 h esta abierta, y si no, por SMS.

**Caja (`pagos.js`):** en el metodo saldo, tras validar que alcanza, ya no se
apunta directo: `_sdCobrarConCodigo` manda el codigo de una (con el monto) y
abre el modal — celular oculto (••• 1234), campo de 6 digitos, "Reenviar
codigo" (dormido 20 s), y "Confirmar $X" que llama `pago-verificar`; solo con
`ok` se apunta el pago. Modal propio estilo Lumen, nada de alert().

**Verificado:** envio real con monto al celular de Sergio (WhatsApp texto, la
ventana estaba abierta); codigo equivocado rechazado contando intentos; token
invalido rechazado; codigo de pago rechazado en el registro; tope de 3/hora
salto durante la prueba (funciona). Usuario de prueba de auth creado y
BORRADO; codigos de prueba quemados. Trampa que costo una vuelta: un parche
con `assert` fallido no escribe NADA — quedaron dos lineas usando `frase` sin
firma que la recibiera y la funcion entera daba "Algo fallo" (se vio con
ReferenceError en function_logs, via analytics/endpoints/logs.all).

**Pendiente de la primera prueba real de Sergio en caja** (no se pudo probar
con sesion del POS de verdad por los guards de login).


---

## 20-ago-2026 (noche) — Canje con parte en dinero: total $0 y domicilio eterno

Sergio canjeo un premio de 400 pts + $20.000 y la pantalla decia Total $0 /
"no pagas nada", con el domicilio en "calculando..." infinito. UNA sola causa
para los dos sintomas: en un canje el carrito va vacio a proposito, y
`pedirCuenta()` tenia el guard `!carro.length` → la cuenta jamas se pedia →
el domicilio nunca llegaba y el total caia al respaldo del carrito ($0).
Arreglo en `app-cliente.js`: el guard deja pasar el canje
(`!canje && !carro.length`), y el respaldo mientras llega la cuenta es
`canje.dinero`, no el carrito. El servidor (`web-pedido`) siempre sumo bien:
subtotal=dinero del canje, total=+empaque, aPagar=+domicilio. Sello `0820q`.

**Limpiezas del mismo rato:** cliente de prueba 3001000000 BORRADO (0 puntos,
0 pedidos, 0 chats; decision de Sergio: los otros dos Sergios son numeros
distintos y NO se unifican). El borrado del 19-ago + cajas de $200.000 quedo
VACIO: ya no existia nada con esas marcas — se limpio en su momento con la
reversion del inventario. Memorias de esos pendientes retiradas.


---

## 20-ago-2026 (noche) — Tarjetas fisicas NFC/RFID

Pedido de Sergio: lector NFC en el local — vincular tarjetas a clientes, pagar
con la tarjeta y recargar con la tarjeta.

**Como funciona el lector:** los lectores USB baratos (NFC 13,56 MHz y RFID
125 kHz) se hacen pasar por TECLADO: al acercar la tarjeta "escriben" su
numero y un Enter en milesimas. `pos-nfc.js` (nuevo) caza esa rafaga
(digitos/hex, huecos < 80 ms, Enter al final, minimo 6): sin drivers, igual en
el .exe y el navegador. Si el cursor estaba en un campo, el numero derramado
se retira del campo. Solo escucha cuando alguna pantalla lo pide
(`posNfc.escuchar` devuelve el des-escuchar).

**La tarjeta apunta al TELEFONO** (como los puntos): tabla `pos_tarjetas`
(tenant_id, uid UNIQUE por tenant, telefono, activa) con RLS por tenant,
authenticated con CRUD y anon sin nada. SQL en
`supabase/sql/2026-08-20-tarjetas-nfc.sql`.

**Donde vive:**
- **Clientes** (todas las marcas): boton "Tarjeta" en la ficha → modal que
  lista sus tarjetas (····4F2A, Quitar) y vincula acercando la tarjeta al
  lector. Si ya es de otro, dice de quien es en vez de pisarla.
- **Caja/pagos**: acercar la tarjeta IDENTIFICA al cliente (igual que dar su
  numero) y ademas AUTORIZA su billetera — la tarjeta fisica es la prueba de
  que el dueNo esta presente, asi que NO se pide el codigo por SMS
  (`SP.tarjetaTel`; cambiar de cliente mata la autorizacion). Tarjeta sin
  vincular → modal que manda a Clientes.
- **Pagina web → Clientes de la app**: con esa pestana abierta, la tarjeta
  abre "Dar saldo" parado en esa persona (para recargas en persona).

**Verificado en banco:** la rafaga sincrona se lee, la lenta (humano) no, y el
texto derramado en un campo se limpia (OJO del banco: los setTimeout de una
pestana en segundo plano se estiran a 1 s — la primera prueba "fallo" por
eso, no por el codigo). En base: insert, UNIQUE del uid y delete probados con
fila PRUEBA (borrada). **Falta la prueba con lector fisico real de Sergio.**

**Ajuste (pedido de Sergio, misma noche):** tarjeta que ya es de otro cliente
→ ADVERTENCIA con el nombre del dueNo actual y dos botones: "Si, pasarla a
[nuevo]" (llama `vincular(..., {forzar:true})`, que actualiza el telefono de
la fila) o "Dejarla como esta". Nunca se sobreescribe en silencio. Verificado
en banco con posNfc simulado. Y NOTA: antes de comprar el lector fisico,
Sergio va a consultar cual — esperar esa consulta.

**Consulta y recarga por tarjeta (mismos minutos):**
- **Clientes**: acercar la tarjeta con la pantalla abierta ABRE LA FICHA de su
  dueNo (nombre, gastado, pedidos, puntos), y la ficha ahora muestra tambien
  el **saldo de su billetera** (pos_saldo por cliente_id; solo si > 0). Si el
  modal de vincular esta abierto, ese manda.
- **Pagina web → Dar saldo** ahora tiene TRES modos: **Recargar** (nuevo:
  plata que el cliente pago en el local — va por `fn_recarga_aplicar`, el
  MISMO camino de las recargas de la app: minimo, bono por rangos y libro
  identicos; ref `local:<cliente>:<ts>` contra dobles clics), Dar saldo
  (regalo) y Dar puntos. La tarjeta ahora abre el modal en modo Recargar.

**Aviso al regalar saldo (pedido de Sergio):** `avisar-cliente` v8 con tipo
`saldo_regalo` (texto de fabrica: "Te regalamos $X — ya tienes $Y en tu
billetera de {negocio}"; personalizable por tenant en `web_avisos` con la
clave `saldo_regalo`). `pagina-web.js` lo dispara al Dar saldo (best-effort,
con el saldo que devuelve `fn_saldo_mover`), y el modo Recargar nuevo ahora
dispara el aviso de recarga igual que la acreditacion de solicitudes.
Vista previa del texto verificada contra la funcion viva.

**BUG DESTAPADO POR LA PRUEBA DEL AVISO (20-ago, noche): "Dar saldo" estuvo
roto EN SILENCIO desde siempre.** Sergio se regalo $1.000 y no paso nada. El
rastro: cero movimientos de saldo en el dia. Reproducido con un usuario
authenticated de prueba: `pos_saldo_mov_motivo_check` NO incluia 'regalo'
(solo recarga/bono_recarga/consumo/ajuste/anulacion), asi que
`fn_saldo_mover(motivo:'regalo')` reventaba — y la pantalla vieja no miraba
`r.error`, decia "Le diste..." tan campante (la version nueva del mismo dia ya
lo mira). Arreglo: constraint recreado CON 'regalo'
(`2026-08-20-saldo-motivo-regalo.sql`) y el regalo de $1.000 aplicado de
verdad (saldo 346.000) + push `saldo_regalo` disparado (enviados: 2).
Usuario de prueba de auth borrado. NOTA: los regalos que se creyeron dados
antes de hoy con "Dar saldo" NUNCA entraron — si algun cliente reclama, esa
es la razon.


---

## 20-ago-2026 (noche) — Pedido de Paco sin la adicion (URGENTE, pedido real de Fernanda)

Paco tomo perfecto "personal ranchera + super queso": el resumen dijo $40.000
+ $5.000 de domi y el cliente confirmo. El pedido se creo en $27.000, SIN la
adicion, y la comanda salio sin el queso.

**El pedido real se corrigio a mano al instante** (item con Super Queso
$12.000, subtotal $39.000, total $45.000, total_final $40.000) y se le aviso
a Sergio que la comanda ya impresa no llevaba el queso.

**Causa raiz (delay-reply v322):** `buildOrderArgs` — el traductor entre el
borrador confirmado y la creacion — copiaba nombre/tamano/tipo/cantidad/
categoria/notas y NO copiaba `adiciones`. El resumen las cobraba (usa el
estado directo) y la creacion las perdia. El dato ya estaba; nadie lo pasaba.
Arreglo de una linea: `adiciones: i.adiciones || null` en el map.

**Verificado en el banco de Paco** (conversacion PRUEBA 573000000098, estado
sembrado + cola fabricada a mano + "si claro"): el pedido nace con
`selections.mods` = Super Queso $12.000 y subtotal $39.000. Se necesito
instrumentacion temporal (v323, logs [pedido/diag], retirada en v325) porque
la primera corrida del banco resembro un estado ya consumido y confundio.
OJO del banco: `chat_ai_queue` es UNIQUE por conversacion (se resetea
processed/fire_at, no se inserta otra) y sin fila en esa cola el motor no
procesa nada. Todo lo PRUEBA borrado (conversacion, mensajes, cola, pedidos,
cliente).

**Bug hermano destapado al reimprimir:** la comanda decia "+ [OBJECT OBJECT]".
La reimpresion (`pos-print.js` posPrintOrder) arma las adiciones como objetos
{name, qty, price} (para el recibo) y la plantilla de la comanda las pintaba
con String(m). Ahora la plantilla acepta las dos formas. Sello pos-print
v1791500000.

**Nota:** los items del bot guardan `unit_price` = precio base y `total` con
adiciones (el POS manual guarda unit_price CON adiciones). Preexistente, no
se toco hoy; anotado por si algun informe compara unit_price.


---

## 20-ago-2026 (noche) — El movil de Rapid queda en el pedido + "Vivento"

**1. Movil del domiciliario externo (pedido de Sergio, aprobado "si dale"):**
columna `pos_orders.domi_movil` (SQL `2026-08-20-domi-movil.sql`). En la
tarjeta del monitor de Domicilios (solo externos) hay un chip "+ Movil": un
toque lo vuelve campo, Enter/salir guarda (optimista, con deshacer si falla).
Se ve: chip verde "Movil 27" en la tarjeta, "Lo llevo el Movil 27 (Rapid)" en
el panel del domicilio en Ventas, y "· Movil 27" en el detalle del historial.
Buscar "27" o "movil 27" en el historial trae los pedidos de ese movil.

**2. "Vivento" (pedido real de Fernanda, mismo dia):** el pedido salio con
direccion "Vivento Calle57n..." que la clienta jamas dijo. Cadena: la
direccion "Calle57n" (pegada) no parecio tener via → el motor intento
completarla con el conjunto del barrio → `esConjunto("Villa del viento")`
caso con el conjunto REAL "Vivento" (fuzzyBarrioMatch tolera 1 letra:
viento≈vivento) → le antepuso el nombre canonico. Datos corregidos a mano
(pedido y ficha de la clienta). Arreglos (delay-reply v326):
- `cerca()` en fuzzyBarrioMatch: un nombre de UNA palabra solo tolera la
  errata si ADEMAS arranca con las mismas 3 letras ("balmorral"→Balmoral si;
  "viento"→Vivento no). Costo asumido: errata en la 1.a letra ya no pasa.
- La fusion conjunto+unidad solo corre si el barrio NO tiene precio propio
  como barrio: un barrio conocido jamas se convierte en conjunto parecido.
Verificado en banco Node (6 casos, incluidas las regresiones Catay/Asturias).


---

## 20-ago-2026 (noche) — "1 agua personal" que Paco ignoro (pedido real de Cristian)

Al upsell el cliente contesto "1 agua personal" y Paco siguio de largo: total
sin el agua, Sergio tuvo que apagar a Paco en ese chat y corregir a mano.

**Causa:** el mapa de productos (`DYN_PROD_MAP`) solo indexa el nombre
COMPLETO: "agua" no casa con "AGUA BOTELLA", y sin conector ("y tambien...")
`NUEVO_PROD_REGEX` tampoco disparaba la busqueda de producto nuevo. El boton
manual usa GPT con el menu completo, por eso si la vio.

**Arreglo (delay-reply v327): ALIAS POR PALABRA PROPIA.** Al armar el mapa,
si una palabra (>=4 letras) de un nombre compuesto es UNICA de ese producto —
no la usa otro producto, ni una categoria, ni ninguna presentacion/variante —
se indexa como alias: "agua"→AGUA BOTELLA, "coca"/"cola"→COCA COLA, etc.
Con lista de RESERVADAS de la conversacion (premio, pedido, carta, menu,
cuenta, combo, puntos...) para que "quiero mi premio" jamas meta la gaseosa
PREMIO 1.5 al pedido — ese falso positivo se cazo ANTES de desplegar, en el
banco Node con el catalogo real (61 productos, 15 alias generados).

**Verificado en el banco de Paco** (conversacion PRUEBA con historia y
cliente reconocido — OJO: sin fila en pos_clientes el motor saluda de cero y
resetea el estado): a "1 agua personal" respondio "ya tengo tu pedido: 1x
Premium Mixta (Personal) y 1x Agua" con el AGUA BOTELLA como producto en
curso y la Premium guardada en items. Todo lo PRUEBA borrado.

**Ajuste (regla de Sergio, misma noche): identificar flexible, NOMBRAR con el
catalogo.** En el banco Paco dijo "1x Agua Personal" — un producto que no
existe (mezclo las palabras del cliente). delay-reply v328: instruccion en el
prompt conversacional — al mencionar productos del pedido se usan EXACTAMENTE
los nombres de la lista PEDIDO EN CURSO (los del catalogo), jamas como los
dijo el cliente. El resumen formal ya usaba `matchedProd.name` y no se toco.
Verificado en banco: resumen "1x AGUA BOTELLA", total $39.000 + $5.000 domi.

**El movil tambien se ANOTA desde Ventas (pedido de Sergio: "necesito que
vaya en esa tarjeta"):** el panel del domicilio en ventas-salon ya no solo
muestra el movil — el boton "+ Movil del domiciliario" abre el campo ahi
mismo (window.vsMovilEditar), guarda en pos_orders.domi_movil y queda
"Lo llevo el Movil 27 (Rapid)". Mismo dato que el chip del monitor de
Domicilios. Verificado en banco aislado.

**Mas aire para la ficha (pedido de Sergio, 20-ago noche):** en Ventas se
quitaron los bloques de metricas de la fila de arriba ("Domicilios activos /
Total en curso", "Ventas en curso / Tiempo promedio") EN LAS TRES VISTAS
(mesas, domicilios, venta rapida), y la fila de chips de estados bajo a vivir
DENTRO de la columna izquierda — asi el riel derecho (la ficha del pedido)
ocupa toda la altura desde la barra superior. CSS: .vs-summary-row sin
padding propio (tambien en la media query tablet); .vs-body con padding-top.
Los estilos .vs-metric-* quedaron sin uso (no se borraron).


---

## 20-ago-2026 (madrugada del 21) — Paco cobra con la Billetera y responde por los puntos

Pedido de Sergio, encima del plan PLAN-PUNTOS-EN-CHAT.md pero SIMPLIFICADO por
el mismo: redimir NO se explica por chat — se manda a la app con un BOTON.
Motor delay-reply v329→v332.

**1. Pago con Billetera El Parche por WhatsApp — tres escenarios:**
- Sin cuenta en la app (sin pos_web_credenciales) → "instala, registrate con
  este numero y recarga" + BOTON a la app; el pago se suelta para que escoja
  otro metodo.
- Con cuenta pero sin saldo suficiente → cifras exactas ("tienes $X, el
  pedido es $Y, te faltan $Z") + boton para recargar.
- Con saldo → codigo de 6 digitos por SMS (misma tabla pos_web_codigos motivo
  'pago', mismos topes de la caja), Paco lo pide en el chat, y al recibirlo:
  PRIMERO descuenta (fn_saldo_mover consumo, ref wa:<conv>:<ts>), LUEGO crea
  el pedido; si el pedido falla, la plata VUELVE (anulacion). El pedido nace
  status paid / payment_method __saldo / paid_amount, y el movimiento se
  amarra al order_id. 3 intentos de codigo; "reenviar" manda otro (tope
  3/hora); si en la espera dice otro metodo, se suelta la billetera y sigue.
- "billetera + palabra de la marca" (billetera EL PARCHE) ya cuenta como el
  saldo en extractPago; "billetera" a secas sigue siendo transferencia.
- El total cobrado es state.total_mostrado (el del resumen que el cliente
  confirmo, comida+empaque+domi); sin total cerrado no se ofrece.

**2. Puntos en el chat:** "¿cuantos puntos tengo?" → saldo de pos_puntos por
tel10 + boton a la app. "¿como redimo / premios / catalogo?" → mensaje que
manda a la app (registrarse, ver puntos, catalogo y redimir) + BOTON
(interactive cta_url; si Meta lo rechaza cae a texto con enlace). El verbo de
redimir manda sobre "mis puntos". Si el mensaje ademas pide comida, responde
lo de puntos Y el flujo sigue — quitando antes las palabras de puntos
(premio tambien es la gaseosa PREMIO) para no soltar un "¿que se te antoja?"
de mas.

**Verificado en banco completo** (PRUEBA 3000000095, todo borrado al final):
esc1 y esc2 con sus textos y boton; esc3 punta a punta con codigo malo
(cuenta intentos) y bueno (saldo 50.000→17.000, pedido pagado __saldo, mov
amarrado); pregunta de saldo (respondio los 28 pts que el propio banco gano
al pagar — regalo de la prueba: pagar con billetera TAMBIEN acumula puntos);
pregunta de redimir con boton. TRAMPAS del banco: (1) el 20-ago-2026 es
JUEVES — media hora se perdio por poner el horario de prueba en "miercoles";
(2) $$ dentro de comillas dobles de bash es el PID: el ultimo select de la
limpieza reventaba la transaccion entera; (3) el horario de ia_config estaba
NULL (usa el default 18:30-22:30 del codigo) — se abrio temporalmente para
el banco y quedo RESTAURADO a null (verificado).


---

## 21-ago-2026 — Factura del gerente: la caja de 10 y el "menos el maiz"

Sergio mando la factura de la compra. Dos fallas, y la segunda es de las
graves (obedecer lo contrario de lo que se le dijo).

**FALLA 1 — 10 kilos de maiz entraron como 1, Y el precio se multiplico x10.**
La linea decia `MAIZ CONGELAD CAJAx10pqt`, 1 caja, $79.000. Entro como 1 kg y
el precio del kilo paso de $7.900 a $79.000 (dañaba stock Y costeo).
*Causa raiz:* el camino del SINONIMO se saltaba el control de precio. Existia
un alias viejo "maiz" (factor 1) y el buscador lo acepta si la descripcion lo
CONTIENE (`d.includes(an)`) — "maiz congelad cajax10pqt" contiene "maiz". Con
eso aplicaba factor 1 a ciegas. La busqueda por NOMBRE si tenia el control de
precio (`razon` 0.4–2.5) y habria dudado: $79.000/$7.900 = 10.
*Arreglo (factura-inventario v17):* `multiploDelEmpaque()` lee el "x10" de la
descripcion (tope 500, para que "BOLx4000g" —gramos— no cuente), y
`razonPrecio()`+`precioCuadra()` ahora se aplican TAMBIEN en el camino del
alias: se prueba el factor del alias, luego el del empaque, y si ninguno
cuadra NO se adivina — se pregunta ("se que es Maicitos, pero no me cuadra
cuanto trae... ¿cuantos kg trae ese empaque?", duda_cantidad). La busqueda por
nombre tambien prueba el multiplo antes de dudar.
*Datos corregidos a mano:* Maicitos 3,8 → **12,8 kg** y precio $79.000 →
**$7.900/kg**; el alias `MAIZ CONGELAD CAJAx10pqt` quedo con factor 10.
Auditados los demas alias con multiplicador: solo BBQ "x4000g" (gramos, bien).

**FALLA 2 — "aplica todo menos el maiz" aplico TODO, incluido el maiz.**
El regex de confirmacion `^(si|dale|aplica|...)` hacia juego con "aplica" y el
resto de la frase solo se miraba para los PRECIOS; las exclusiones no existian.
*Arreglo:* se leen menos/excepto/salvo/sin y esas lineas quedan fuera (no se
aplican y tampoco se aprenden como sinonimo). Si pide excluir algo que no esta
en la factura, PREGUNTA en vez de aplicar todo callado. Si al excluir no queda
nada, descarta sin tocar el inventario. El cierre dice "🚫 No toqué: X" y ya
no se contradice con el "no supe a que insumo van".

**Mas conversacional (lo pidio Sergio):** el resumen ahora muestra el multiplo
cuando lo hay ("1 × 10 por empaque") para poder desmentirlo de un vistazo, la
duda de CANTIDAD se pregunta distinto de la duda de IDENTIDAD, y el cierre
ofrece la salida que antes no existia: "*aplica todo menos <insumo>*".
Lo mismo en el flujo de TURNOS de gerente-inventario (v30): "aplica todo menos
la personal" ahora excluye; antes respondia "no encontre recomendaciones que
digan menos la personal".

**Verificado:** los 4 renglones reales de la factura de hoy resueltos en banco
Node (maiz→10, ripio/salchicha/tomate→1, y el x4000g sin falso positivo); 7
frases de exclusion; y punta a punta contra la funcion viva — factura de 2
lineas con "aplica todo menos el maíz": aplico Ripio, dejo Maicitos intacto.
Datos de prueba REVERTIDOS (Ripio volvio a 3,79 kg / $11.200) y facturas
PRUEBA borradas. TRAMPA del banco: mandar tildes por curl desde Git Bash las
rompe ("el ma z") — el JSON hay que escribirlo en UTF-8 con Python; el codigo
estaba bien y la falla era del propio banco.


---

## 21-ago-2026 — Borre los horarios de Sergio (mi error) + dos arreglos

**LO QUE PASO, sin adornos:** anoche, para probar a Paco, consulte el horario
con `select horarios from ia_config limit 1` **SIN filtrar por sede**. Hay 5
restaurantes; la base devolvio el de otro, que estaba vacio. Con esa lectura
equivocada di por hecho que el de El Parche tambien lo estaba, puse uno
temporal, y al terminar lo "restaure" a NULL: **borre los horarios reales de
Sergio**. No habia copia en ningun lado (ni en branches.operacion_config, ni
en la FAQ, ni en instrucciones) — le toco reescribirlos a mano. Encima lo
documente como hecho verificado. Regla escrita en memoria:
[[feedback-config-filtrar-por-sede]].
Reconstruccion que si sirvio: los pedidos de 60 dias mostraban el patron real
(dom/lun/jue/vie/sab, 18:30-22:30) y coincidio exacto con lo que Sergio
reconfiguro.

**ARREGLO 1 — el motor ya no inventa horarios ajenos (delay-reply v334).**
Cuando `ia_config.horarios` es NULL, el codigo tenia escritos A FUEGO los
horarios de El Parche (18:30-22:30): un restaurante nuevo que no llenara esa
pantalla heredaba los de otro negocio y su bot abria/cerraba a la hora
equivocada sin que nadie se enterara — veneno para la venta multi-tenant.
Ahora sin horario se atiende con normalidad (no se le frena el negocio a
nadie) pero `horaAperturaHoy`/`horaCierreHoy` quedan vacios, asi que ni el
prompt ni las frases de cerrado mencionan una hora que no sabemos.

**ARREGLO 2 — un `` que se volvio RETROCESO invisible (chr 8).** Al revisar
el archivo aparecio `chr(8)` dentro del regex de las palabras de puntos:
`/<retroceso>(premios?|puntos?|...)<retroceso>/gi` — la trampa del transporte
de barras, otra vez, metida anoche en el parche de "quitar las palabras de
puntos antes de mirar si ademas pide comida". El regex no casaba NUNCA, asi
que ese arreglo llevaba desde anoche sin funcionar en produccion (volvia a
salir el "¿que se te antoja?" de mas tras preguntar por premios). Corregido y
verificado en el codigo VIVO (0 retrocesos).
**Leccion de metodo:** el `assert chr(8) not in src` hay que correrlo sobre el
ARCHIVO YA ESCRITO, no solo sobre la variable del parche — anoche paso porque
el retroceso lo introdujo una edicion posterior por heredoc.


---

## 21-ago-2026 — Nada del restaurante queda escrito por dentro (frases de Paco)

Regla de Sergio: *"esos textos deben ser personalizables y nada debe quedar
interno en el codigo; todo lo que tenga que ver con el restaurante se debe ver
en el frontend, en las configuraciones del asistente o en el flujo, asi cada
restaurante lo personaliza"*.

**Auditoria:** el motor usaba 33 claves de `frases`; solo 19 tenian fila en
Configuracion → Mensajes. **14 hablaban con el cliente usando texto escrito por
mi, sin forma de cambiarlo.**

**Se agregaron 11 filas** (`configuracion.html`, cada una con su explicacion de
cuando se usa): despedida · pasar_humano · reintento_2 · reintento_3 ·
comprobante_recibido · consultando_domi · lugar_rechazado · publico_efectivo ·
preguntar_barrio · preguntar_calle_numero · preguntar_complemento_dir. No hizo
falta tocar JS: `applyFrases`/`readFrases` recorren `[data-frase]` solos.

**BUG SILENCIOSO ENCONTRADO DE PASO:** la casilla "Preguntar tamaño"
(`preguntar_tamano`) **no la leia nadie** — el motor buscaba solo
`preguntar_presentacion`. Sergio tenia escrito ahi *"¿La deseas personal o
familiar? 😋"* y el bot usaba el texto de fabrica. Arreglado en el motor
(v335): acepta las dos llaves. Se le agrego la pista de `{opciones}` y una fila
nueva para `preguntar_variable` (la pregunta del sabor/tipo).

**Verificado:** el HTML entero pasado por un analizador — 0 errores de
estructura, 43 campos `data-frase`, todos a la misma profundidad (leccion de
[[feedback_html_estructura]]: un `</div>` de mas dejo una pantalla en blanco).

**Queda 1 clave sin pantalla:** `bienvenidas` (banco de saludos que rotan). Es
un ARREGLO (lista), no un texto, asi que necesita otra forma de guardarlo —
`readFrases` guarda cadenas. El saludo normal ya es configurable por
`apertura`/`apertura_conocido`, asi que no urge.


---

## 21-ago-2026 — Facturacion electronica DIAN: arrancamos (etapa 1, cimientos)

Sergio: *"facturacion electronica hagamoslo ya entonces"*.

**Etapa 0 (proveedor):** correo redactado y listo para enviar en
`CORREO-PROVEEDOR-DIAN.md` — las 5 preguntas que definen la arquitectura
(multi-empresa, precio real, quien custodia el certificado, tiempo de
habilitacion, quien reintenta si la DIAN se cae), con una tabla de "que cambia
segun lo que respondan". Recomendado Alanube; Factus como plan B.

**Etapa 1 (lo que NO depende del proveedor): HECHA.**
`supabase/sql/2026-08-21-facturacion-dian-base.sql`:
- `pos_facturacion_rangos` — la resolucion DIAN de cada restaurante (prefijo,
  desde, hasta, actual, vencimiento). Indice unico: UNA sola activa por
  prefijo y sede, o el consecutivo se partiria en dos series.
- `pos_facturas` — las emitidas, con estado, CUFE y la respuesta cruda del
  proveedor. **Dos indices unicos que son la proteccion legal:** el numero no
  se repite jamas, y un pedido no puede tener dos facturas vivas.
- `fn_factura_numero()` — el consecutivo CON BLOQUEO DE FILA (`for update`).
  Nunca se calcula en el navegador. Si el pedido ya tiene factura devuelve esa
  (`ya_existia`) en vez de emitir otra: reintentar no duplica. Si el rango se
  agoto NO emite (`rango_agotado`) — inventar un numero fuera de la resolucion
  es ilegal.
- `fn_factura_rango_estado()` — % consumido, para avisar antes de quedarse sin
  numeros (pedir otra resolucion a la DIAN toma dias).
- RLS por tenant en las dos tablas, y las funciones con el REVOKE a PUBLIC
  hecho a proposito (PostgreSQL le da EXECUTE a PUBLIC por defecto y `anon` lo
  hereda — quitarselo solo a anon no sirve de nada).

**Verificado en banco:** 6 cajas pidiendo numero A LA VEZ → 500,501,502,503,
504,505 sin repetir ni saltar; la 7a con el rango lleno → `rango_agotado` sin
emitir; el mismo pedido dos veces → devuelve el 506 las dos veces
(`ya_existia`); la alerta de rango calculo 63.6%. Datos de prueba borrados.

**Lo que sigue** (sin depender del proveedor): la PANTALLA de configuracion
(cargar resolucion y rangos) y el asistente de habilitacion del §5.1-bis.

**Pantalla de la resolucion DIAN (misma tarde):** Configuracion → Ventas →
**Facturación DIAN** (`screen-dian`, entrada nueva en `pos-cfg-nav.js`).
Tres tarjetas: (1) ESTADO arriba y en grande — cuantas facturas quedan, barra
que cambia de color (azul <75%, ambar >=75%, rojo >=90%) y alerta que dice QUE
HACER, no solo que algo pasa; avisa tambien si la resolucion vence en <=45
dias o ya vencio. (2) Los DATOS de la resolucion. (3) El proveedor, todavia
sin conectar. El consecutivo se MUESTRA pero no se puede editar a proposito.
**Validacion delicada:** si ya se emitieron facturas, el rango nuevo tiene que
seguir cubriendo el ultimo numero usado — mover el piso debajo de una factura
emitida la dejaria fuera de la resolucion; se rechaza con el numero exacto.
**Verificado en banco aislado:** 4 estados (sin configurar / nueva / 92% /
agotada) con sus textos, colores y porcentajes; 5 casos de guardado; medidas
del DOM con 0 elementos con texto cortado. TRAMPA encontrada y corregida antes
de subir: el bloque quedo con sangria dentro de otro bloque y `dianTocar()` no
habria sido alcanzable desde el `oninput` del HTML — las funciones de pantalla
en configuracion.js van a NIVEL GLOBAL (columna 0), como `propInit`/`opInit`.


---

## 21-ago-2026 — La regla de puntos deja de ser la de El Parche

Sergio (punto 9 de su lista): *"limpiar las cosas hardcodeadas de El Parche
sin que afecte el funcionamiento que hemos logrado; el sistema Cobra no puede
tener datos hardcodeados de mi restaurante"*.

**"1 punto por cada $1.000" estaba escrito a fuego en 4 sitios** — el
disparador de la base, el recibo impreso, el chat y la ficha del cliente. Un
restaurante que comprara Cobra heredaba la economia de El Parche y ni siquiera
podia APAGAR los puntos si no tiene programa de fidelidad.

**Ahora vive en `branches.operacion_config.puntos`**
(`{pesos_por_punto, activo}`), el mismo bloque del empaque y la propina.
- `award_loyalty_points` (SQL `2026-08-21-puntos-configurables.sql`) lo lee de
  la sede del pedido. Si `activo:false` no abona nada. Un valor raro (cero,
  negativo, texto) cae al respaldo de 1.000 sin romper la venta.
- `fn_puntos_regla(branch)` para las pantallas.
- **Ayudante compartido en `pos-core.js`**: `posPuntosRegla()`,
  `posPuntosDe(pesos)` y `posPuntosFrase()`. Lee del `localStorage` que
  pos-core ya sincroniza, asi que no cuesta una consulta. Lo usan el recibo
  (`pos-print.js` — el comentario que decia "el dia que se haga configurable,
  los dos sitios tienen que leer de la configuracion" YA se cumplio), el chat
  (`chat-ia.js`) y la ficha del cliente (`clientes.js`, que ademas dice "este
  restaurante no tiene programa de puntos" cuando esta apagado).

**RED DE SEGURIDAD:** sin configuracion se comporta EXACTAMENTE como hoy. El
Parche no se entera del cambio.

**Verificado:** en la base, pedido de $25.000 → 25 pts con la regla de siempre;
en OTRA sede (Restaurante de Prueba, para no tocar la de El Parche) con 1 por
cada $5.000 → 5 pts; con el programa apagado → ningun punto. En banco Node, 7
casos del ayudante incluidos los valores daNados. Todo lo PRUEBA borrado y la
sede de prueba restaurada.

**Nota suelta:** quedo una fila vieja en `pos_puntos` (tel 3000000009, 30 pts,
del backfill del 31-jul, sin ficha de cliente). NO se toco — no la cree yo.
Preguntarle a Sergio si se borra.

**Y su PANTALLA (misma tarde, pedido de Sergio):** Configuracion → Equipo →
**Puntos** ahora abre con la tarjeta "Cómo se ganan los puntos": interruptor
de encendido/apagado y el campo "1 punto por cada $___". Guarda con `opSave`,
o sea que hereda la sincronizacion entre equipos, los reintentos y el aviso si
falla — nada de un guardado paralelo.
**Lo que hace entendible la pantalla:** un EJEMPLO EN VIVO ("Un pedido de
$30.000 le da 6 puntos al cliente") que se actualiza mientras se teclea; un
numero suelto no dice nada. Y la nota de abajo dejo de tener la regla escrita
a mano: ahora dice la del restaurante, o "los puntos estan apagados".
**Topes que evitan un desastre:** minimo $100 (con 1 peso por punto, un pedido
de $30.000 regalaria 30.000 puntos y el programa se rompe en una noche) y
maximo $1.000.000. Apagar NO borra los puntos que ya tienen los clientes, y se
lo dice.
**Verificado en banco:** estado inicial, cambio a $5.000, guardado, apagado y
su guardado; 6 casos de topes; medidas del DOM con 0 textos cortados; HTML
entero por el analizador sin errores.
**Tambien:** borrada la fila huerfana de `pos_puntos` (tel 3000000009, 30 pts
del backfill de julio) — Sergio dio la orden.


---

## 21-ago-2026 — Fuera el emoji y las frases de El Parche del codigo

Sigue el punto 9 de Sergio. **41 apariciones** de las papas fritas de El
Parche en codigo vivo (23 en el motor, 17 en el chat, 1 en el recibo): una
pizzeria que comprara Cobra saludaba a sus clientes con papas fritas.

**EL ORDEN IMPORTO:** primero se le guardo a El Parche su identidad actual en
`ia_config.frases` (`etiqueta_ia` = "🍟 `Paco:`" y `emoji` = "🍟") y SOLO
DESPUES se neutralizo el codigo — asi no hubo ni un segundo con su bot sin
emoji. (Ojo: escribir el emoji por curl desde Git Bash lo convierte en "??";
hay que mandar el JSON en UTF-8 desde Python.)

**Motor (delay-reply v336):** `EMOJI_NEG` sale de `frases.emoji` y `emo()` lo
devuelve CON su espacio delante, o vacio — asi un mensaje sin emoji no queda
con doble espacio. Los 23 mensajes usan `${emo()}`. `ETIQUETA_IA` ya no nace
con "🍟 `Paco:`" sino vacia. El resumen del pedido antepone el emoji del
restaurante solo si lo tiene.

**Chat (`chat-ia.js`):** la semilla `DEFAULT_QUICK_REPLIES` era la carta de El
Parche — "¿la deseas con pollo o carne?", "super queso", "salsas de maiz o
chedar", papas fritas en cada frase, y "buenas noches" en todo (asume que el
negocio solo abre de noche). Reescrita: **24 frases genericas** agrupadas por
momento (saludo, carta, pedido, domicilio, pago, tiempos, situaciones y las
dos con variables), sin duplicados. **A El Parche no le cambia nada:** sus 41
frases ya estan en su base y la semilla solo corre con base vacia.

**Recibo (`pos-print.js`):** el pie por defecto ya no lleva emoji.

**Verificado:** 0 apariciones en los tres archivos; la semilla nueva evaluada
(24 frases, sin claves repetidas, sin rastros de la carta, con sus imagenes y
variables intactas); y una conversacion PRUEBA contra el motor vivo confirmo
que Paco SIGUE saliendo con "🍟 `Paco:`" y su emoji — ahora desde su config.
Conversacion de prueba borrada.
