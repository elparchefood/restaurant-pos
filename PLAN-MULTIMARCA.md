# Multi-marca — decisiones y plan

Decisiones de Sergio del 12-ago-2026, ya cerradas. **No volver a preguntarlas.**

---

## Los cimientos ✅ (12-ago)

| | |
|---|---|
| Identidad desde la base, no del token | `current_tenant_id()` + 12 políticas reescritas |
| Dueño explícito | `tenants.owner_user_id` + `es_dueno()` |
| Contexto de marca/sucursal | `window.posContexto` en pos-core |
| Switch marca → sucursal | Dos niveles, nunca revueltas |
| Rol por sucursal | `pos_usuario_sucursal` + su pantalla |

---

## La regla de la herencia

**Nada se copia. Lo que es de la marca se hereda solo, y el local solo guarda
sus excepciones.** Restablecer = borrar la excepción.

Se eligió sobre copiar porque copiar desincroniza: subir un precio obligaría a
tocarlo en cada sede, y en un mes nadie sabe cuál carta es la buena.

| Qué | De quién es | Excepción por local |
|---|---|---|
| Productos, precios, categorías | **Marca** | `pos_producto_sucursal` (`precio`, `activo`, `precios_pres`) |
| Insumos: definición y precio | **Marca** | pendiente de construir |
| Recetas | **Marca** | pendiente de construir |
| **Existencias (stock)** | depende del interruptor | — |

---

## El interruptor de inventario

Va **por marca** (decisión de Sergio). Una marca puede tener bodega central y
otra no; las marcas no comparten nada entre sí.

| Modo | Cómo funciona | Quién ve las alertas |
|---|---|---|
| **Global** | Una sola bolsa. Un bulto de papa sirve a las 3 sedes; cada venta descuenta del total | **TODAS las sucursales** — el insumo es de todas, la escasez también |
| **Por sucursal** | Cada sede tiene lo suyo. Un bulto pertenece a una sede | **Solo esa sucursal** |

**El mínimo se define una vez**, junto al insumo, y se interpreta según el modo.

**Al cambiar de modo:** se suma lo existente a la bolsa común, pidiendo
confirmación y mostrando un resumen de qué va a pasar. De global a por sucursal
es peor —hay que repartir y el sistema no sabe cómo—, así que solo se permite
con el inventario cuadrado.

---

## Por qué el inventario es viable

El descuento **ya vive en la base**: `fn_iv_consumir_item`,
`trg_iv_orden_pagada`, `trg_iv_orden_anulada`, `fn_iv_registrar_merma`.

Dos consecuencias:
1. El interruptor se implementa en **un solo sitio**, no persiguiendo pantallas.
2. El descuento ya es atómico: dos sedes vendiendo el último kilo a la vez no
   se pisan. Eso es lo que hace posible el inventario global.

⚠️ Hoy `iv_insumos` guarda **definición y stock en la misma fila**. Ese es el
nudo: hay que sacar las existencias a su propia tabla para que la definición se
herede y el stock siga el interruptor.

---

## Orden de trabajo

**A. Cartas y precios por local** ✅ (12-ago)

| Qué | Dónde |
|---|---|
| Resuelve la herencia (un solo sitio) | `pos-carta.js` |
| La pantalla para usarlo | `catalogo-sede.js` — botón *Esta sede* en cada producto |
| Lo aplican al cobrar | domicilios, venta rápida, mesas |
| Restablecer | por producto y uno general por sucursal |
| Apagar un producto solo en una sede | sí, el interruptor del panel |

Probado de punta a punta el 12-ago: precio propio $15.000 con la marca en
$18.000 → el cuadro, el selector de tamaño y **el total cobrado** dijeron
$15.000; restablecer devolvió los tres a $18.000.

**Tres cosas que casi lo dejan a medias, y por qué están así:**

1. **El cobro sale de la PRESENTACIÓN, no de `price`** — 22 de los 53
   productos de El Parche tienen tamaños. Ajustar solo `price` no habría
   hecho nada en el 41% de la carta, y sin dar error. Por eso existe
   `precios_pres`.
2. **El cuadro mostraba el precio de la marca** aunque cobrara el del local.
   En la carta actual el precio base **es** la presentación más barata (20 de
   22), así que `aplicar()` mueve también el base cuando la sede ajusta
   tamaños.
3. **La copia local del catálogo guarda los precios de la MARCA.** La
   herencia se aplica al LEERLA, nunca antes de guardarla: si se guardara ya
   ajustada, al cambiar de sucursal se cobrarían los precios de la anterior.

**Límite conocido:** las pantallas piden `.eq('available', true)`, así que una
sede puede **apagar** un producto pero no **encender** uno que la marca tiene
apagado.

`posCarta.diag()` en la consola dice si una pantalla aplicó la carta de su
sede, sin tener que abrir un pedido y mirar el total.

**B. Inventario** ← EN CURSO

| Paso | Estado |
|---|---|
| 5. Existencias fuera de `iv_insumos` → `iv_existencias` | ✅ 12-ago |
| 6. Definición, precio y recetas al nivel de la marca | ✅ 12-ago (`brand_id` en insumos, recetas, porciones y alias) |
| 7. El interruptor en el motor de consumo | ✅ 12-ago (`brands.inventario_modo`) |
| 8. Que la pantalla de Inventario lea `iv_existencias` y el interruptor se pueda tocar | ✅ 12-ago |
| 9. Alertas y agotados según el modo | ✅ 12-ago (`v_iv_insumos_sede`) |
| 10. Quitar el puente y las columnas viejas | ✅ 12-ago |

**El error que esto tapó, y que no era de multi-marca:**
`fn_iv_consumir_item` unía las recetas **solo por producto** — no miraba la
sucursal en ningún sitio. Con una sede funcionaba. Con dos, cada venta habría
encontrado la receta de las dos, las habría sumado y habría **descontado el
doble**, sin quejarse. Ahora filtra por marca, y el índice que impedía
duplicar una receta también pasó a ser por marca (antes era por sede, así que
con dos sedes se podía meter la misma receta dos veces).

**Cómo quedó el reparto:**

| | Dónde vive |
|---|---|
| Qué ES el insumo (nombre, unidades, conversión, precio, mínimo) | `iv_insumos` — de la **marca** |
| CUÁNTO HAY | `iv_existencias` — `branch_id NULL` = bolsa común; lleno = esa sede |
| Recetas | `iv_recetas` — de la **marca** |

Los dos modos **conviven en la misma tabla**: al cambiar el interruptor no se
migra nada, se lee la otra fila.

**El puente ya no existe** (12-ago). `iv_existencias` es la única verdad.

Al quitarlo aparecieron **cuatro funciones que nunca se migraron** y que
seguían con la columna vieja:

| Función | Qué hacía mal |
|---|---|
| `fn_iv_registrar_merma` | escribía solo la columna vieja → **la merma se registraba y la pantalla seguía mostrando el número de antes**. Además usaba la sede del *insumo*, no en la que se está botando |
| `fn_iv_devolver_item` | igual, en cada anulación |
| `fn_iv_cerrar_conteo` | igual, al cuadrar un conteo físico |
| `fn_iv_abrir_conteo` | *leía* la columna vieja **y** filtraba por sede: en una sucursal nueva el conteo salía vacío, y un conteo vacío se cierra sin ajustar nada |

Ninguna daba error. Daban números viejos, que es peor.

**Las columnas viejas se renombraron, no se borraron**
(`stock_migrado_no_usar`). Si quedó algún lector suelto, ahora **falla a
gritos** —`column iv_insumos.stock does not exist`— en vez de mostrar un
número congelado para siempre. Un error se ve; un número viejo no. Los datos
siguen ahí por si hay que mirar atrás.

Probado el 12-ago sin el puente, en una transacción deshecha: la venta
descontó 9 insumos, la anulación **devolvió todo exacto** y la merma bajó de 7
a 5.

Probado el 12-ago con una venta real copiada, dentro de una transacción
deshecha: los 9 insumos descontaron y existencia y espejo se movieron igual.

**Dos cosas que la pantalla hacía mal y no eran del inventario:**

1. Filtraba los insumos, las recetas y las porciones **por sucursal**. Una
   sede nueva habría visto **cero** de todo y habría tocado crearlo dos veces.
   Ahora filtra por marca.
2. Tomaba la sucursal del **login**, no la del switch: con dos locales habrías
   estado viendo el inventario del otro sin enterarte.

⚠️ **Una tabla nueva no hereda los permisos.** `iv_existencias` nació con RLS y
su política, pero sin `GRANT`: RLS decide qué filas ve cada quien, el GRANT
decide si puede tocar la tabla siquiera. La consulta moría con *permission
denied* y la pantalla mostraba **cero insumos** con los 44 intactos en la base.
Se detectó porque la prueba se hizo con un insumo de verdad: sin él, una
pantalla vacía se veía igual que una pantalla rota.

**Una sola regla, en la base.** `v_iv_insumos_sede` devuelve una fila por
insumo y sede con el *cuánto hay* ya resuelto según el modo de la marca. Se
hizo así porque ya iban **cuatro pantallas** calculándolo por su cuenta
(Inventario, pos-stock, Dashboard, Informes) — y ese es exactamente el camino
por el que dos pantallas acaban diciendo cosas distintas, como pasó con
`payment_method`. Ahora una pantalla solo pregunta: *dame los insumos de esta
sede*.

La vista lleva `security_invoker`: aplica el aislamiento de **quien pregunta**,
no el de quien la creó. Sin eso sería un agujero — cualquier restaurante
vería los insumos de todos. Comprobado el 12-ago: la cuenta demo ve **0**
filas, no las 44 de El Parche.

`pos-stock.js` tenía el mismo error que Inventario: filtraba recetas por sede,
así que en una sucursal nueva **no habría marcado nada agotado nunca** — se
habría vendido todo sin stock, en silencio.

**C. Separar la venta por marca** ✅ (12-ago)

**10. Cierre de caja e informes.** Nada mezclaba marcas *todavía* —todos los
usuarios y los 222 pedidos tienen su sede— pero el hueco era estructural: las
**42 consultas** de plata decían *«si sé la sucursal filtro; si no, traigo todo
el restaurante»*. Con dos marcas, ese «todo» son totales revueltos que **se ven
perfectamente normales**: la peor clase de error, porque nadie revisa un número
que no parece roto.

Ahora la sede es obligatoria. Sin ella, el filtro apunta a una sucursal que no
existe: el informe sale en cero. **Un cero raro se nota; un total inflado no.**

| Dónde | Consultas blindadas |
|---|---|
| `caja.js` (aperturas, ventas, ítems, pagos, cierres) | 15 |
| `informes-datos.js` (los 27 informes) | 27 |
| `dashboard.js` | ya filtraba bien |

**11. Comanda por la impresora de su marca.** Ya estaba resuelto: las
impresoras viven en `pos_printers` con su `branch_id`, y al imprimir se usa la
sede activa — de hecho `pos-print.js` prefiere la del **propio pedido**, que es
aún más correcto. Una sede pertenece a una sola marca, así que la comanda no
puede salir por la impresora de otra. No se tocó nada.

**De paso, otro arreglo de herencia:** el informe de costeo leía insumos y
recetas **por sede**. En una sucursal nueva se habría quedado sin recetas — y
un costeo sin recetas no da error: da **margen del 100%**.

**Los filtros de informes, arreglados** (12-ago). Eran de la maqueta:
mostraban valores inventados —«Chapinero», «Luis Pardo»— y no tocaban la
consulta. Ahora son desplegables de verdad.

| Filtro | De dónde salen las opciones |
|---|---|
| Sucursal | las sedes **de esta marca** (nunca de otra) |
| Turno | `pos_sessions.shift_type` |
| Canal | los canales que de verdad se usaron |
| Empleado | los meseros que de verdad vendieron |
| Estado | Cobradas / Anuladas |

**Se quitaron los que no tenían dato detrás** (Categoría, Cliente, Proveedor,
Marca) y **Caja**, cuyo único identificador es un código interno y que Turno
ya cubre en la práctica. Un filtro que dice «Todas» y no filtra es peor que no
tener filtro: el número se lee como si estuviera filtrado.

Dos decisiones de detalle:
1. **Las opciones salen de lo que pasó en el periodo**, no de una lista fija:
   una lista fija enseñaría canales que este negocio no usa y meseros que ya no
   trabajan ahí.
2. **Con una sola opción el filtro se esconde.** Con una sede, «Sucursal» no
   decide nada.

⚠️ **El turno no es el que parece.** `pos_orders.turno` es un NÚMERO —el
consecutivo de la venta del día, «Turno #001»—. El turno que entiende un
restaurante (Mañana/Tarde/Noche) vive en la sesión de caja. Filtrar por el
número habría sido otro control que dice una cosa y hace otra.

Se eligió A antes que B para probar el modelo de herencia con algo pequeño y de
bajo riesgo antes de mover el inventario.
