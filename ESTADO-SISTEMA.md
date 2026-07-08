# ESTADO DEL SISTEMA — Cobra POS
> Última actualización: 2026-07-08

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
| `pos-print.js` | Modal de opciones, impresión silenciosa | ✅ OK (Ronda 2) |

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

---

## Ideas pendientes para fases futuras

### Caché local en Electron (pendiente — implementar cuando no haya más cambios activos)
Cachear en disco del exe:
- **Catálogo de productos** (nombres, precios, categorías, presentaciones) → IndexedDB o archivo JSON en `app.getPath('userData')`
- **Fotos de productos** → archivos PNG/JPG locales en userData; descargar una sola vez al subirse
- Usar hash de versión para saber si Supabase tiene algo nuevo; si hash coincide, usar caché; si no, descargar
- Estado de mesas y órdenes activas NO se cachean — siempre en vivo

---

## Bugs conocidos / cosas a vigilar

1. **`configuracion.js` — auto-sync al abrir**: La función `syncToSupabase()` se llama en `DOMContentLoaded`. Si el localStorage tiene datos viejos cuando se abre Configuraciones, puede escribir basura a Supabase. No abrir Configuraciones con localStorage desactualizado.

2. **sort_order=0**: La mesa con `sort_order=0` (actualmente t01) requiere la comparación `!= null` en el sort, no `|| 9999`. Si se añaden mesas nuevas con sort_order=0, pueden quedar al final visualmente.

3. **Órdenes sin cerrar**: Si el flujo de pago no marca una orden como `completed`, reaparecerá como activa la próxima vez que se limpie el filtro. Vigilar que el cierre de orden siempre escriba `status='completed'`.
