# Funciones pendientes — Cobra POS

> Actualizado: 2026-07-31
> Este documento lista **todo lo que falta construir**, con qué informe desbloquea
> cada cosa y qué se necesita exactamente. Nace de la pregunta de Sergio:
> *"haz una lista de todas las funciones que nos hacen falta para completar todos
> los demás informes, y todo lo que falte."*

**Estado de los informes:** 27 de 41 con datos reales.
Los 14 restantes esperan alguna de las funciones de abajo.

---

## Cómo leer este documento

| Marca | Significado |
|---|---|
| 🔴 **Bloquea MVP** | Sin esto no se le puede vender a otro restaurante |
| 🟠 **Operación diaria** | El Parche lo necesita para trabajar mejor |
| 🟡 **Crecimiento** | Hace falta cuando el negocio o el producto crezca |

---

# 1. Sistema de créditos 🔴

**Reemplaza a lo que llamábamos "fiados".** Definición de Sergio (2026-07-31):

> *"El sistema igual no dejará cerrar la caja si no está pago, pero se pagará
> con créditos. Y esos créditos son los que cada dueño de restaurante les podrá
> dar a clientes o empleados."*

O sea: el crédito **es una forma de pago**, no un pedido a medio pagar. La caja
siempre cuadra porque el pedido queda pagado *con crédito*, y la deuda vive en
el cliente/empleado, no en el pedido.

**Qué hay que construir**
- Tabla `pos_creditos`: titular (cliente **o** empleado), cupo asignado, saldo, estado.
- Tabla `pos_credito_movimientos`: consumos y abonos, cada uno con su pedido.
- "Crédito" como método de pago en el cobro, validando cupo disponible.
- Pantalla de gestión: asignar cupo, ver saldo, registrar abonos.
- Regla dura: **el cierre de caja sigue exigiendo que todo esté pagado**.

**Desbloquea:** `caj-fiados` (Fiados / créditos de clientes)
**Nota:** los 13 pedidos que parecían "a medio pagar" NO eran deuda — ver §13.

---

# 2. Impuestos: IVA e impoconsumo 🔴

Hoy **no existe ningún campo de impuesto** en `pos_products` ni en `pos_orders`.
Un restaurante formal en Colombia no puede operar así.

**Qué hay que construir**
- Impuesto por producto o por categoría (impoconsumo 8% es lo normal en restaurantes; IVA 19% para algunos ítems).
- Definir si el precio mostrado **incluye** o **excluye** el impuesto (en Colombia lo normal es incluido).
- Guardar la base gravable y el impuesto en cada línea del pedido, congelados al momento de la venta (si cambia la tarifa, las ventas viejas no se pueden alterar).
- Mostrar el desglose en la factura impresa.

**Desbloquea:** `sal-impuesto`
**Depende de esto:** la facturación DIAN (§3) no se puede hacer sin impuestos.

---

# 3. Facturación electrónica DIAN 🔴

**Qué hay que construir**
- Integración con un proveedor autorizado (en el contexto quedó **Factus API**, pay-per-use).
- Resolución de numeración y consecutivo de facturación.
- Envío de la factura y guardado del CUFE.
- Reintento de los envíos fallidos (la DIAN se cae seguido; sin reintento se pierden facturas).
- Notas de crédito y débito (§4).

**Desbloquea:** `ger-dian`
**Requiere primero:** impuestos (§2).

---

# 4. Notas de crédito y débito 🔴

Documentos de ajuste: anular una factura ya emitida, corregir un valor, devolver
dinero. Hoy anular un pedido solo lo marca `cancelled`; no genera documento.

**Qué hay que construir**
- Tabla `pos_notas` con tipo (crédito/débito), pedido de origen, motivo y valor.
- Flujo de emisión desde el pedido ya cobrado.
- Envío a la DIAN cuando §3 exista.

**Desbloquea:** `caj-notas`

---

# 5. Merma (desperdicio real) 🟠

Ojo con la confusión, ya la tuvimos antes:
- La **merma de receta** (el % que ya existe en `iv_recetas.merma`) es un estimado de recortes y cáscaras. **Ya está.**
- La **merma real** es un evento: se dañó, se venció, se cayó al piso, se quemó. **Esto es lo que falta.**

**Qué hay que construir**
- Botón "Registrar merma" en Inventario: insumo, cantidad, motivo (daño/vencimiento/error/robo), quién lo registró.
- Que descuente stock y quede en `iv_movimientos` con motivo `merma`.
  *(Hoy `iv_movimientos` solo tiene movimientos con motivo `venta`.)*
- Valorizarla al costo del insumo.

**Desbloquea:** `inv-merma`
**Mejora también:** `inv-paloteo` — hoy toda la desviación se ve como fuga; con
la merma registrada se separa lo que se botó de lo que no se explica.

---

# 6. Cuadre de stock (conteo físico) 🟠

Contar lo que hay de verdad y compararlo contra lo que el sistema cree.

**Qué hay que construir**
- Tabla `iv_conteos` (sesión de conteo) e `iv_conteo_lineas` (insumo, contado, sistema, diferencia).
- Pantalla de conteo, idealmente usable desde el celular en la bodega.
- Ajuste automático del stock al cerrar el conteo, dejando el rastro en `iv_movimientos`.
- Exportar e importar en Excel (lo pide el diseño de Sergio).

**Desbloquea:** `inv-cuadre`

---

# 7. Vencimientos y lotes 🟠

`iv_insumos` **no tiene ninguna columna de fecha de vencimiento ni de lote.**

**Qué hay que construir**
- Tabla `iv_lotes`: insumo, cantidad, fecha de vencimiento, proveedor, costo.
- Capturar el vencimiento al surtir y al cargar una factura.
- Alertas: crítico ≤7 días, pronto ≤30 días.
- Decidir si se consume por FIFO (lo que vence primero sale primero).

**Desbloquea:** `inv-vencer`

---

# 8. Reservas 🟡

**Qué hay que construir**
- Tabla `pos_reservas`: cliente, fecha y hora, personas, mesa, estado (confirmada/cumplida/no llegó).
- Pantalla de agenda.
- Enlazar la reserva con el pedido que generó, para medir cuánto vendió.
- Recordatorio automático por WhatsApp (la infraestructura ya existe).

**Desbloquea:** `can-reservas`

---

# 9. Autoservicio / QR 🟡

**Qué hay que construir**
- Carta pública por sucursal con URL propia.
- QR por mesa que abra la carta con la mesa ya identificada.
- Pedido del cliente que entra a cocina sin pasar por un mesero.
- Pago en línea o al final, según lo configure el restaurante.

**Desbloquea:** `can-autoservicio`

---

# 10. Asistencia de empleados 🟡

**Qué hay que construir**
- Entrada y salida por PIN (ya existe `posRequirePin`, se puede reusar).
- Tabla `pos_asistencia` con turnos y horas trabajadas.
- Enlazar con las ventas de cada persona.

**Desbloquea:** `can-asistencia`
**Se conecta con:** el informe de propinas — repartir por horas trabajadas, no solo por ventas.

---

# 11. Multimarca / food-court 🟡

Varias marcas operando en el mismo local, con una sola caja.

**Qué hay que construir**
- Marca en cada producto y en cada pedido.
- Separar las ventas por marca en el cierre de caja.
- Impresión a la cocina que corresponda.

**Desbloquea:** `can-multimarca`

---

# 12. Multi-sucursal (consolidado) 🟡

La base ya es multi-sucursal (`branch_id` está en todo). Lo que falta es la
**vista consolidada**.

**Qué hay que construir**
- Selector de sucursal / "todas" en el topbar.
- Que cada pantalla obedezca ese contexto en vez del `branch_id` del login.
- Comparativo entre locales.

**Desbloquea:** `ger-sucursal`
**Nota:** El Parche tiene una sola sucursal, así que esto solo importa para vender.

---

# 13. Cosas que NO son informes, pero están pendientes

### 13.1 El domicilio "pendiente de pago" que no existe 🟠
13 pedidos aparecen como pagados a medias. En **los 13** lo que falta es
exactamente el valor del domicilio: el cliente pagó la comida y el domicilio se
pagó aparte. No es deuda.

**Qué corregir:** un domicilio debe considerarse pagado cuando
`paid_amount >= total − delivery_fee`, o bien el domicilio debe registrarse
también como pago. Hoy queda como una deuda fantasma.

### 13.2 Propinas que nunca se cobran 🟠
**0 de 91 ventas pagadas tienen propina.** El campo existe y siempre está en $0.
Hay que revisar si la pantalla de cobro la ofrece. Sin esto, el informe de
propinas siempre saldrá vacío.

### 13.3 Métodos de pago duplicados por mayúscula 🟠
`pos_payments.method` tiene `'Efectivo'` y `'efectivo'`, `'Transferencia'` y
`'transferencia'`. El informe los unifica al pintar, pero hay que normalizarlos
en el origen antes de que ensucien otros cálculos.

### 13.4 Pedidos viejos en estado `completed` 🟡
27 pedidos de junio y julio quedaron en `completed` en vez de `paid`. No estorban,
pero conviene decidir si ese estado se usa o se elimina.

### 13.5 Un producto sin receta 🟠
**Salsa Ajo** (y su adición) es el único producto vendido sin receta. Mientras no
la tenga, cuenta como costo $0 e **infla el margen**.

### 13.6 Los 202 pedidos anulados 🟠
$7,9 millones anulados en el mes, todos con productos cargados, concentrados el
9 de julio con valores repetidos. Falta que Sergio confirme si fueron pruebas.

### 13.7 Resumen diario automático 🟡
Estaba en los requerimientos como correo. **Mejor por WhatsApp**: la
infraestructura ya está montada, es más barato y se lee de verdad.

### 13.8 Rendimiento de anuncios (Meta) 🟡
Único informe de la lista investigada que quedó fuera del catálogo a propósito:
el módulo de anuncios no existe todavía.

---

# Orden sugerido

1. **Créditos** (§1) — es el que Sergio ya definió y ordena las cuentas por cobrar.
2. **Impuestos** (§2) — sin esto no se le vende a un restaurante formal.
3. **Merma** (§5) — barato de hacer y mejora el paloteo, que es el informe que más plata recupera.
4. **Cuadre de stock** (§6) — cierra el ciclo de inventario.
5. **DIAN + notas** (§3, §4) — el paso grande para vender el producto.
6. El resto, según lo pida el mercado.

Los arreglos del §13 son pequeños y se pueden ir haciendo en cualquier momento;
el 13.1, el 13.2 y el 13.5 afectan números que ya se están mirando.
