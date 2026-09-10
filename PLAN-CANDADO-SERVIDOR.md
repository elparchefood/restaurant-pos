# El candado de permisos en el servidor (punto 1-B)

> Medido el 10-sep-2026. **No se toca nada sin que Sergio apruebe este plan**:
> aquí el riesgo no es que no funcione, es que funcione de más y el cajero no
> pueda cobrar un sábado por la noche.

---

## 1. Lo que pasa hoy

- La base tiene **123 reglas de seguridad**. 87 aíslan por restaurante. **Ninguna
  mira qué rol tiene la persona dentro del restaurante** — las 13 que mencionan
  "admin" son del administrador de la *plataforma*, no del dueño ni del cajero.
- Los permisos los decide **la pantalla**, en `pos-nucleo.js` (~línea 3285-3600).
- Resultado: un cajero, con su sesión normal y sin ningún truco, puede
  **escribir** productos, insumos, usuarios y roles. El menú y el PIN cambian lo
  que *ve*, no lo que *puede*.

**El caso de Sergio, explicado:** la pantalla de Productos pide `catalogo.ver`
para entrar, y el Cajero lo tiene — por eso entra. Adentro puede editar, porque
el servidor nunca revisa `catalogo.editar`.

## 2. Cómo decide hoy la pantalla (y cómo tendrá que decidir el servidor)

En este orden:

1. **¿Es el dueño?** → se le pregunta a la base con `es_dueno()` → todo.
2. **¿Tiene fila de sede** en `pos_usuario_sucursal`? → los permisos de esa fila.
3. **Si no, por el texto del rol**, con una tabla de alias: `gerente`,
   `administrador`, `dueño`… → clave `admin` → todo. `cajero`, `cajera`, `caja`
   → `cajero`, etc. Y con la clave se buscan los permisos en `pos_roles`.
4. **Rol no reconocido → se abre TODO** (a propósito, para no encerrar a nadie),
   dejando rastro en `pos_diag`.

## 3. Lo que se midió para no encerrar a nadie

| # | Hallazgo | Consecuencia |
|---|---|---|
| 1 | `permisos_en_sucursal()` parecía la pieza lista, pero **solo 1 cuenta activa tiene fila de sede** (Monica). El dueño no la tiene, ni las cuentas de prueba de cada rol. Asignar el rol por sede desde la pantalla **nunca se construyó** (`DICCIONARIO-ACCESOS.md`). | Un candado sobre esa función sola dejaría afuera a todos menos a una persona. **El servidor tiene que resolver igual que la pantalla**, con los 4 pasos. |
| 2 | **Todos los disparadores que corren al vender** (descontar inventario, dar y devolver puntos) son `SECURITY DEFINER`: saltan las reglas. | Un candado en inventario **no bloquea las ventas**. El riesgo más grave, descartado. |
| 3 | Las funciones que reenvían la sesión del usuario (`cambiar-plan`, `facturar`, `tiktok-videos`) **solo leen** con ella, para comprobar que es de ese restaurante. | El candado de escritura no las toca. |
| 4 | Varias pantallas **del cajero** escriben en tablas "de administrador": el núcleo (en TODAS las pantallas) guarda `branches.operacion_config`; el salón, `branches.cobro_adelantado`; el chat, `ia_config` (respuestas rápidas, etiquetas, encender o apagar a Paco) y clientes; los avisos, `ia_config.domicilios`; el cobro crea y edita clientes. | Esas tablas **no entran en la fase 1**. Candarlas hoy trabaría al cajero en todas las pantallas a la vez. |
| 5 | Las reglas de hoy se suman con "O", y hay repetidas (productos ×3, bases ×5). | Agregar una regla normal **no restringe nada**. Se usan reglas **RESTRICTIVAS**, que se suman con "Y" — y se agregan **sin tocar las de hoy**. Marcha atrás: `DROP POLICY`. |

## 4. La pieza: UNA función que decide

`fn_puedo(permiso text, sede uuid) → boolean`, `SECURITY DEFINER`, que hace
**exactamente** los 4 pasos de la sección 2, con la misma tabla de alias.

⚠️ **Y la pantalla pasa a preguntarle a esta función** en vez de resolver por su
cuenta. Si cada lado decide por su lado, se separan — exactamente como ya pasó
con los precios. Una sola fuente.

## 5. Fase 1 — solo lo que tocan ÚNICAMENTE las pantallas de administración

| Tablas | Para ESCRIBIR hace falta |
|---|---|
| `pos_products`, `pos_categories`, `pos_combos`, `pos_modifier_groups`, `pos_bases` | `catalogo.editar` |
| `iv_insumos`, `iv_movimientos`, `iv_params`, `iv_porciones`, `iv_recetas` | `catalogo.editar` (lo mismo que pide hoy Inventario) |
| `pos_roles`, `pos_users`, `pos_usuario_sucursal` | `config.usuarios` |

**Solo escribir.** Leer sigue igual, por restaurante: el cajero **necesita** leer
los productos para vender.

## 6. Fase 2 — las compartidas, después

`branches`, `ia_config`, `pos_clientes`. Primero hay que **mover** las
escrituras del cajero (sección 3, fila 4) a funciones del servidor, o permitir
por columna. Recién ahí se les pone candado.

Aparte, y sin medir todavía: **qué datos sensibles se pueden LEER** (por ejemplo,
qué columnas de `pos_users` ve cualquiera del restaurante).

## 7. Cómo se sube sin encerrar a nadie

1. **Una semana en modo vigilancia.** Antes de negar nada, un disparador en esas
   tablas anota en `pos_diag` cada vez que el candado *habría* negado —quién,
   qué tabla, qué permiso le faltó— **y deja pasar**. Si en una semana de servicio
   no aparece nadie que no debiera, se activa.
2. **Probar con una cuenta de CADA rol** —dueño, administrador, cajero, mesero,
   cocina, domiciliario— primero en el Restaurante de Prueba.
3. **Fuera del horario de servicio.** Cada cambio en la base hace que el servidor
   recargue su catálogo, y mientras tanto las peticiones esperan.
4. **Marcha atrás en una línea** por tabla (`DROP POLICY`).

## 8. Lo que decide Sergio

1. **El rol no reconocido:** hoy abre todo. ¿Se deja así durante el despliegue y
   se cierra después? (Recomendado: sí, con la vigilancia de por medio.)
2. **¿El cajero debe poder ENTRAR a Productos?** Con el candado podrá *ver* pero
   no *editar*. Si no debe ni entrar, es una línea en el mapa de pantallas:
   `catalogo-productos.html` pasa de `catalogo.ver` a `catalogo.editar`.
3. **Tres permisos fantasma:** el mapa de pantallas usa `inventario.ver`,
   `inventario.compras` y `pagos.anular`, y **ningún rol los tiene**. ¿Se crean o
   se quitan del mapa?
4. **Aprobar la fase 1.**
