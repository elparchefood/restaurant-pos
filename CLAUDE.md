# CLAUDE.md — Reglas de desarrollo · Cobra POS

> Este archivo es leído automáticamente por Claude en cada sesión.
> Las reglas aquí son obligatorias y tienen prioridad sobre cualquier otra instrucción.

---

## 0. Regla de documentación continua (OBLIGATORIA)

Después de cada cambio importante, corrección compleja o decisión de diseño, **actualizar `ESTADO-SISTEMA.md`** antes de terminar la sesión. Esto garantiza que cuando la conversación se compacte, toda la información esté en los documentos y no se pierda.
- `ERRORES-PACO-CLIENTES-REALES.md` — registro unico de los errores de Paco con clientes reales. **Cada error nuevo que se arregle se agrega ALLI ademas de en ESTADO-SISTEMA.md.**

**Qué registrar:**
- Cambios en Supabase (filas nuevas, eliminadas, sort_order modificado)
- Archivos modificados y por qué
- Bugs encontrados y cómo se corrigieron
- Reglas nuevas que surgieron de errores cometidos
- Estado actualizado de las mesas/zonas si cambió

**Cuándo hacerlo:** al final de cada bloque de trabajo, antes del último deploy de la sesión.

---

## 1. Regla crítica — Paridad Electron / Web (OBLIGATORIA)

**Todo cambio debe funcionar IGUAL en el ejecutable Electron que en el navegador web.**

El ejecutable carga `https://cobrapos.app/` — es la misma web, pero tiene su propio almacenamiento de localStorage separado del Chrome del sistema.

### Regla de storageKey (causa raíz del logout en Electron)

`pos-core.js` crea el cliente Supabase con `storageKey: 'cobra-pos-session'`. **Cualquier módulo que cree su propio cliente Supabase DEBE usar la misma clave**, o no encontrará la sesión en Electron y redirigirá a login.

```javascript
// CORRECTO — igual que pos-core.js
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: 'cobra-pos-session' }
});

// INCORRECTO — usa clave por defecto 'sb-tblujfduscslxjmrjbdr-auth-token'
// Solo funciona en Chrome si hay una sesión residual de un login anterior
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

**Páginas que ya tienen storageKey correcto:** `pos-core.js`, `mesero-login.js`, `mesero-turno.js`, `catalogo-productos.js`, `chat-ia.js`, `inventario.js`

### Regla de session.user vs getUser()

```javascript
// CORRECTO — sin llamada al servidor, más resiliente
const user = session.user;

// INCORRECTO — hace una llamada HTTP que puede fallar; si user llega null,
// el acceso a user.user_metadata lanza TypeError
const { data: { user } } = await sb.auth.getUser();
```

### Checklist antes de cada entrega en Electron

- [ ] ¿La página carga y muestra datos en el ejecutable?
- [ ] ¿La sesión persiste al navegar entre páginas en el ejecutable?
- [ ] ¿El ejecutable y el browser muestran exactamente lo mismo?

---

## 2. Reglas de seguridad (NUNCA violar)

- **NUNCA usar la skill `github-deploy`** — esa es de Aura Languages. Para este proyecto siempre usar `pos-github-deploy`.
- **NUNCA hardcodear datos de negocio** (nombres de zonas, mesas, precios). Todo dato visible sale de Supabase en tiempo real.
- **NUNCA tomar control del equipo de Sergio sin permiso explícito** (RF14-B).
- **NUNCA escribir en Supabase sin explicar primero y recibir confirmación** — aunque sea una sola fila.
- **NUNCA navegar con el MCP de Chrome a páginas de cobrapos.app** — el localStorage del MCP comparte perfil con el Chrome de Sergio y puede contaminar su configuración real.

---

## 2. Reglas de código

### Python (obligatorio en todos los scripts)
```python
# SIEMPRE especificar encoding al abrir o guardar archivos
content = open(f, encoding='utf-8').read()
open(f, 'w', encoding='utf-8').write(content)
```
No especificar `encoding=` en Windows usa cp1252 por defecto y corrompe los caracteres españoles (tildes, ñ, puntuación especial).

### JavaScript — fuentes de verdad
| Dato | Fuente de verdad |
|------|-----------------|
| Zonas del salón | Supabase `pos_tables.zone_id / zone_name` |
| Mesas (nombre, orden) | Supabase `pos_tables` — `sort_order` define el orden visual |
| Estado de mesa (libre/comiendo/etc.) | Supabase `pos_tables.status` — **no inferir desde órdenes** |
| Config operativa (T1/T2/T3, empaques) | `localStorage` clave `pos.config.salon.v1` |
| Órdenes activas | Supabase `pos_orders` donde status NOT IN ('completed','cancelled','paid') |
| Tamaños y variables de un producto | Supabase `pos_products.presentations` / `.variables` — el inventario NO los define, los lee |
| Receta de un producto | Supabase `iv_recetas` — llaveada por `(product_id, insumo_id, variant_option_id)`, cantidades por tamaño en `cantidades` jsonb |
| Porciones (medidas con nombre) | Supabase `iv_porciones` por insumo; la unidad se hereda de `iv_insumos.use_unit` |
| Nombre del restaurante y logo en el sidebar | `pos-brand.js` — ninguna página debe escribir su propio bloque de marca |

### Filtro de órdenes activas (ventas-salon.js)
```javascript
.not('status', 'eq', 'completed')
.not('status', 'eq', 'cancelled')
.not('status', 'eq', 'paid')   // ← DEBE estar siempre. Sin esto, órdenes pagadas aparecen como activas.
```

### Sort de mesas (ventas-salon.js)
```javascript
// CORRECTO — sort_order=0 es falsy, no usar || 9999
enriched.sort((a,b) => (a.sort_order != null ? a.sort_order : 9999) - (b.sort_order != null ? b.sort_order : 9999));

// INCORRECTO — 0 || 9999 = 9999, pone la primera mesa al final
enriched.sort((a,b) => (a.sort_order || 9999) - (b.sort_order || 9999));
```

### Recetas — modelo por presentación y variable
```javascript
// Una línea de receta aplica a una combinación si es Base o si es de esa opción.
!l.varOpt || l.varOpt === varOptId

// La cantidad depende del tamaño; '_' es el pseudo-id de un producto sin presentaciones.
l.qty[presId]  // NO l.qty  ← el modelo plano viejo
```
Nunca sumar todas las variables en un solo costo: un plato preparado lleva UNA.
El semáforo de la tarjeta se pinta con el **peor caso**, no con el promedio.

### Datos en atributos HTML — nunca con JSON.stringify
```javascript
// INCORRECTO — las comillas dobles cierran el atributo y el botón queda muerto
`<button onclick="setCat(${JSON.stringify(nombre)})">`   // → onclick="setCat("Bebidas")"

// CORRECTO — data-* + delegación de eventos en document
`<button data-cat="${escHtml(nombre)}">`
```
Aguanta además nombres con apóstrofo (`Papas' Especiales`), que rompen incluso las comillas simples.

### Filtros de lista — estado, no `style.display`
Ocultar tarjetas en el DOM se pierde en el siguiente re-render (p.ej. al refrescar el costeo).
El filtro va en una variable de estado y se aplica al **construir** la lista.

### Verificación de UI — `.click()` real
Llamar la función desde consola salta justo la parte que suele estar rota (el HTML que la invoca).
Siempre disparar el evento sobre el control ya renderizado.

### Tablas creadas por la API de Supabase — faltan los GRANT
Crear una tabla vía `database/query` **no** aplica los grants por defecto del panel.
Sin ellos, Postgres rechaza antes de evaluar la RLS y el error es `permission denied`, no un fallo de política.
```sql
grant select, insert, update, delete on public.mi_tabla to anon, authenticated, service_role;
```

### El estado de la pantalla NO vive en el DOM (app de clientes)

`cuerpoPedido()` y compañía **arman un string** y lo insertan después. Cualquier
`$('pd-barrio')` leído mientras se arma devuelve **la pantalla anterior**. De
ahí salieron los tres fallos del domicilio del 20-ago.

- Lo que el usuario eligió va en una variable (`dirSel`, `barrioTecleado`), y el
  HTML se pinta **desde** ella — nunca al revés.
- Un campo que el usuario llena se repinta con su valor (`value="' + esc(x) + '"`),
  nunca con `value=""`: si no, lo escrito se borra solo en el siguiente repintado.

### Un candado se suelta antes de repintar, no después

`pedirCuenta()` llamaba a `pantallaDentro()` dentro del `try`, con el candado
`pidiendoCuenta` aún en `true`. Ese repintado suele necesitar otra petición, y
se cancelaba sola contra el candado. Si una función se bloquea a sí misma,
libera **antes** de disparar cualquier cosa que pueda volver a llamarla.

### El menú lateral vive en `pos-nav.js` — nunca copiarlo a mano

Estuvo escrito a mano en tres páginas y se desincronizó: a Reservas y a
Tutoriales les faltaba **Clientes**. Ahora se declara una sola vez en la lista
`MENU` de `pos-nav.js` y cada página pone solo el hueco:

```html
<aside id="sidebar"></aside>
<script src="pos-nav.js?v=..."></script>
```

Dos reglas al usarlo:

- **`pos-nav.js` va antes que el JS de la página.** Se pinta de una, no en
  `DOMContentLoaded`, porque `dashboard.js` busca `sb-status` apenas arranca.
- **Un módulo nuevo es una línea en `MENU`**, nunca un `<a>` suelto en un HTML.

Una pantalla del POS **no se sale del sistema para volver**: no se le pone
botón "Regresar", se le pone el menú. Si el módulo es solo para la plataforma,
se marca `soloPlataforma: true` y `pos-nav.js` lo destapa con
`es_admin_plataforma()`.

### Qué va en Clientes y qué va en "Mi página web" (20-ago-2026)

La línea no es de diseño, es de **a quién se le vende**:

- **`clientes.*`** lo ve **cualquier restaurante** que use Cobra. Solo datos de
  clientes: pedidos, gasto, repetición, puntos. **Nada** de saldo, recargas,
  registrados en la app ni botones de regalar.
- **`pagina-web.js` → pestaña "Clientes de la app"** lo ve **solo**
  `es_admin_plataforma()`. Ahí vive todo lo de la página de clientes, incluidas
  las funciones de dar saldo y dar puntos a mano.

Antes estaba mezclado y la pantalla de Clientes tenía que esconder media
interfaz con `data-solo-pagina`. Si aparece un dato nuevo, la pregunta es
siempre la misma: **¿lo puede ver un restaurante que no tiene página web?** Si
la respuesta es no, no va en Clientes.

### Regalar plata o puntos — siempre con motivo y siempre en su libro

Un regalo **no es** una recarga: la recarga entró al banco, el regalo sale del
bolsillo. Se registran con motivo distinto para que nunca se sumen juntos.

- Saldo → `fn_saldo_mover(..., 'regalo', ...)`. **Nunca** un `update` a
  `pos_saldo`: es la única función que deja rastro en `pos_saldo_mov`.
- Puntos → `fn_puntos_regalar(...)`, tipo `'regalo'`. La llave de los puntos es
  el **teléfono normalizado**, no el `cliente_id`.

El motivo es obligatorio en la pantalla. Sin él, tres meses después nadie sabe
por qué esa persona tiene saldo que no pagó.

### Índices únicos con columnas anulables
En Postgres dos NULL no chocan, así que un `UNIQUE (a, b, c)` con `c` nulo permite duplicados.
Usar `coalesce(c, '')` en un índice único cuando el nulo tiene significado (ej. "pestaña Base").

### Mensajes de error — mostrar el motivo real
Un toast genérico ("Error al guardar") obliga a reproducir el fallo contra la base para diagnosticar.
Siempre `showToast('No se pudo …: ' + (error.message || error.code))`.

---

## 3. Archivos protegidos — no modificar sin instrucción explícita

Estos archivos ya están en producción y funcionando. Cualquier cambio debe ser pedido explícitamente por Sergio.

| Archivo | Qué hace | Estado |
|---------|---------|--------|
| `pos-core.js` | Boot del sistema, autenticación, Supabase client | ✅ No tocar |
| `pos-events.js` | Bus de eventos interno | ✅ No tocar |
| `pos-realtime.js` | Suscripciones Realtime de Supabase | ✅ No tocar |
| `pos-sync.js` | Sincronización offline | ✅ No tocar |
| `pos-router.js` | Navegación SPA | ✅ No tocar |
| `dashboard.html/js/css` | Página principal post-login | ✅ No tocar |
| `login.html/js/css` | Autenticación | ✅ No tocar |
| `index.html` | Splash / redirección | ✅ No tocar |
| `tomar-pedido.html/js/css` | Flujo de pedido | ✅ No tocar sin instrucción |
| `pagos.html/js/css` | Pantalla de cobro | ✅ No tocar sin instrucción |
| `pos-print.js` | Sistema de impresión | ✅ No tocar sin instrucción |
| `CNAME` | Dominio cobrapos.app | ✅ NUNCA modificar |

---

## 4. Proceso de deploy

1. Editar archivos en `C:\Users\USUARIO\AppData\Local\Temp\restaurant-pos\`
2. Usar Python con `encoding='utf-8'` para todos los reemplazos
3. Actualizar el `?v=<timestamp>` del script en el HTML correspondiente para limpiar caché
4. `git add <archivos específicos>` — nunca `git add -A` sin revisar qué incluye
5. `git commit -m "descripción"` + `git push origin main`
6. GitHub Pages tarda ~1 minuto en publicar
7. Verificar en el browser que el cambio se ve correcto

---

## 5. Checklist de auditoría antes de cada entrega

Antes de reportar una corrección como lista, verificar:

- [ ] ¿Las zonas que muestra la app coinciden con lo que tiene Sergio en Configuraciones?
- [ ] ¿Las mesas aparecen en el orden correcto (01→02→03→04)?
- [ ] ¿Las mesas libres aparecen como libres (sin pedidos fantasma)?
- [ ] ¿El ejecutable Electron muestra lo mismo que el browser web?
- [ ] ¿Los caracteres especiales (tildes, ñ, —, →) se ven bien en el HTML?
- [ ] ¿Se verificó con el browser real (no solo con el código)?

---

## 6. Infraestructura

| Componente | Valor |
|-----------|-------|
| Repo | `elparchefood/restaurant-pos` (rama `main`) |
| Deploy | GitHub Pages → `https://cobrapos.app` |
| Supabase URL | `https://tblujfduscslxjmrjbdr.supabase.co` |
| Branch ID | `66e5f12d-fd16-455a-a6c0-9694aa6fb01b` |
| Electron app | `C:\Prueba Claude Code\cobra-pos-electron\` |
| Repo local | `C:\Users\USUARIO\AppData\Local\Temp\restaurant-pos\` |
