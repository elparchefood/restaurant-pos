# CLAUDE.md — Reglas de desarrollo · Cobra POS

> Este archivo es leído automáticamente por Claude en cada sesión.
> Las reglas aquí son obligatorias y tienen prioridad sobre cualquier otra instrucción.

---

## 1. Reglas de seguridad (NUNCA violar)

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
