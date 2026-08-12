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
| Productos, precios, categorías | **Marca** | `pos_producto_sucursal` (precio y activo) |
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

**A. Cartas y precios por local** ← EN CURSO
1. Que las pantallas lean `v_carta_sucursal` en vez de `pos_products` directo
   (hoy los ajustes existen en la base pero **no se ven**)
2. Editar el precio de un producto solo en esta sucursal, con aviso de ajustado
   (la vista ya devuelve `precio_ajustado`)
3. Botón **Restablecer**, por producto y uno general por sucursal
4. Apagar un producto solo en una sede (el campo `activo` ya existe)

**B. Inventario** (la pieza más grande)
5. Sacar las existencias de `iv_insumos` a su propia tabla
6. Definición, precio y recetas al nivel de la marca
7. El interruptor global/por sucursal, en las funciones de consumo
8. Alertas según el modo
9. Migrar los 44 insumos y 374 recetas actuales

**C. Separar la venta por marca**
10. Cierre de caja e informes que no mezclen marcas
11. Comanda por la impresora de su marca

Se eligió A antes que B para probar el modelo de herencia con algo pequeño y de
bajo riesgo antes de mover el inventario.
