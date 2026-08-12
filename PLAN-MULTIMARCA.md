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
| 8. Que la pantalla de Inventario lea `iv_existencias` y el interruptor se pueda tocar | ⬜ falta |
| 9. Alertas según el modo | ⬜ falta |
| 10. Quitar las columnas viejas (`iv_insumos.stock`) y el espejo | ⬜ falta |

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

**Puente temporal:** mientras la pantalla de Inventario siga leyendo
`iv_insumos.stock`, `fn_iv_mover_existencia` escribe también ahí — solo en
modo global, que es donde ese número significa algo. Se quita en el paso 10.

Probado el 12-ago con una venta real copiada, dentro de una transacción
deshecha: los 9 insumos descontaron y existencia y espejo se movieron igual.

**C. Separar la venta por marca**
10. Cierre de caja e informes que no mezclen marcas
11. Comanda por la impresora de su marca

Se eligió A antes que B para probar el modelo de herencia con algo pequeño y de
bajo riesgo antes de mover el inventario.
