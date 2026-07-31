# Informes — Referencia de Restaurant.pe para Cobra POS

> Documento generado el 2026-07-22 analizando la plataforma anterior de El Parche Food
> (elparchefood.restaurant.pe, versión 7.0.1). Cataloga TODOS los informes que ofrece esa
> plataforma y propone cuáles implementar en Cobra POS, con prioridades y mapeo a nuestros datos.

---

## 1. Cómo organiza los informes Restaurant.pe

Un solo menú **Informes** con 8 categorías. Todos los informes comparten el mismo patrón de UI:

- **Filtros arriba:** rango de fechas (Del/Hasta), local/sucursal, caja, turno, tipo de comprobante, canal de venta, estado (activa/anulada).
- **Botón "Generar informe"** + botón **"Descargar"** (exporta a Excel).
- **Tarjetas de totales** arriba (subtotal, impuestos, total, notas de crédito) y **tabla detallada** abajo con paginación.
- Cada fila de venta tiene acciones: Ver / Imprimir / PDF.

Además del menú Informes hay dos pantallas analíticas separadas:
- **Dashboard (Resumen):** métricas del día/rango en vivo.
- **Indicadores:** gráficos diarios/mensuales/anuales con fórmula de utilidades.

---

## 2. Dashboard (Resumen) — lo que muestra

- Hora punta y hora más libre del día.
- Gráfico por hora: cantidad de ventas / dinero por ventas.
- Tarjetas: ventas en efectivo, con tarjeta, en línea + vales, a crédito, total ventas e ingresos (con propinas), egresos de caja, descuentos, ingresos extra, ingreso débito.
- Promedio de consumo por venta y por persona; afluencia (personas atendidas).
- Distribución por tipo de pago (% efectivo / tarjeta / en línea / depósito / vale).
- Ranking del día: mesero del día (% de ventas, # pedidos), mesas atendidas, tiempo de despacho min–máx, ventas anuladas (# y %), tiempo promedio de atención en mesa, ticket promedio por hora.
- Ventas por canal: salones / venta rápida / delivery / reservación, y por canal de delivery.
- Top 10: más vendidos, mejor facturación, más ventas por cliente, más vendidos por área de producción (cocina/barra).
- Distribución de clientes: empresas vs personas y su consumo.

## 3. Indicadores (gráficos)

Fórmula visible: **Utilidades = Ventas facturadas − Compras − Cuentas por pagar**, y
**Ventas = Efectivo + Tarjetas + Crédito + Otros + Cuentas por cobrar**. Gráficos: ventas generadas, ventas por turno, compras realizadas, ventas vs compras (barras y pie), utilidades, top 10 consumidos por área, ranking de meseros. Vista diaria/mensual/anual.

---

## 4. Catálogo completo de informes (99)

### 4.1 Informes de Ventas (44)
| Informe | Qué muestra |
|---|---|
| Todas las ventas | Listado completo: fecha/hora/turno, mesa, caja, cliente, documento, formas de pago (múltiples por venta), total, tipo (contado/crédito), estado. Totales con NC. |
| Ventas anuladas | Igual que el anterior pero solo anuladas, con motivo. |
| Ventas por área | Por área de producción (cocina, barra…). |
| Ventas por productos o categorías | Por producto: cantidad, precio, descuento, desglose de cantidad POR CANAL (salón/rápida/delivery/reserva), total y % del total. Opciones: ver costos promedios, agrupar por categoría, incluir combos/cortesías/insumos. |
| Ventas productos por mes | Matriz producto × mes. |
| Ventas por combo | Ventas de combos/ofertas. |
| Kardex de productos vendidos | Salidas de stock generadas por ventas. |
| Ventas por mesero y cajero | Total vendido por empleado. |
| Pedidos por mesero y cajero | Cantidad de pedidos por empleado. |
| Comisión por mesero y cajero | Cálculo de comisiones sobre ventas. |
| Ventas por cliente | Historial y total por cliente. |
| Estado de créditos de cliente | Cuentas por cobrar. |
| Ventas registradas y pendientes | Ventas sin cerrar/cobrar. |
| Pedidos modificados | Auditoría: qué pedidos se editaron después de enviados. |
| Pedidos anulados | Auditoría de ítems/pedidos anulados antes de cobrar. |
| Ventas por impuesto | Desglose por tipo de impuesto. |
| Retenciones por tarjeta | Comisiones retenidas por datáfono. |
| Descuentos | Todos los descuentos aplicados: quién, cuándo, cuánto. |
| Deducibles | Documentos deducibles. |
| Por forma de pago | Totales por efectivo/transferencia/tarjeta/etc. |
| Por días del mes | Total vendido cada día del mes (comparable). |
| Ventas en sucursales por periodo | Comparativo entre locales. |
| Por horas (ventas detalladas) | Cada venta con su hora, para análisis fino. |
| Propina por mesero/domiciliario | Propinas por empleado. |
| Resumen de ventas por cajero | Totales por cajero (arqueo por usuario). |
| Productos por horas y/o días | Qué se vende a qué hora / qué día. |
| Menús por día | Ventas del menú del día. |
| Domicilios vendidos | Listado de deliveries. |
| Afluencia de personas por mesa y salón | Cuántas personas se atendieron por mesa/salón. |
| Ventas por reservas | Ventas originadas en reservaciones. |
| Ventas por hora consolidado | Totales agregados por franja horaria. |
| Ventas por modificador (+2 variantes) | Cuántas veces se vendió cada modificador, agrupado por cantidad o por producto. |
| Ventas por día y periodo del día | Desayuno/almuerzo/cena por día. |
| Ventas por oferta | Rendimiento de cada promoción. |
| Reimpresión de documentos | Auditoría: quién reimprimió qué. |
| Reservación de mesas | Historial de reservas. |
| Domicilios por pedidos / por productos | Delivery agrupado por pedido o por producto. |
| Margen de ganancia por productos vendidos | Precio venta vs costo → utilidad por producto. |
| Operación sospechosa por producto | Anti-fraude: patrones anómalos (anular/modificar tras cobrar). |
| Ventas por autoservicio | Ventas del canal self-service. |
| Tiempo de despacho | Minutos entre pedido y entrega. |

### 4.2 Informes de Compras (10)
| Informe | Qué muestra |
|---|---|
| Todas las compras | Facturas de compra registradas. |
| Compras por productos / insumos | Qué insumo se compró, cuánto y a qué precio. |
| Compras del mes | Total mensual. |
| Estado de compras | Compras a crédito y sus pagos (cuentas por pagar). |
| Servicios adquiridos | Gastos en servicios (no inventariables). |
| Proveedor vs artículos | Qué le compras a cada proveedor y a qué precio (comparador). |
| Detalle / Consolidado de compras por insumos | Historial de precios de compra por insumo. |
| Por forma de pago créditos | Cómo se pagaron las compras. |
| Notas de crédito de compras | Devoluciones a proveedores. |

### 4.3 Informes de Finanzas (9)
| Informe | Qué muestra |
|---|---|
| Cierres de caja | Cada cierre: fechas de apertura/cierre, usuario, turno, monto apertura y cierre, descargable. |
| Resumen comparativo de cierres de caja | Comparación entre cierres (detección de descuadres). |
| Ingresos extras | Entradas de dinero fuera de ventas. |
| Egresos extras | Salidas de dinero (gastos de caja). |
| Notas de crédito / débito por venta | Devoluciones y cargos posteriores. |
| Histórico de operaciones | Log de operaciones de caja. |
| Documentos por integración WSAHI | (Integración local Perú — no aplica.) |
| Complementos financieros de la venta | Datos financieros adicionales por venta. |

### 4.4 Informes de Inventario (27)
| Informe | Qué muestra |
|---|---|
| Consulta de precios | Buscador rápido de precios de venta. |
| Porcentaje de consumo de stock | % consumido del stock en el periodo. |
| Catálogo de productos, insumos, recetas o porcionables | Maestro exportable. |
| Cuadre de stock manual | Conteo físico vs sistema, con ajuste. |
| Stock valorizado | Inventario actual × costo = valor del inventario. |
| Kardex SUNAT | (Formato fiscal Perú — no aplica.) |
| Movimientos entre almacén (+valorizado) | Traslados entre bodegas. |
| Productos por vencer | Alertas de vencimiento por lote. |
| Paloteo de insumos / de productos | Consumo teórico según recetas vs ventas. |
| Stock por fechas | Foto del stock en una fecha pasada. |
| Merma | Pérdidas registradas y su valor. |
| Stock valorizado comparativo | Valor de inventario entre dos fechas. |
| Kardex consolidado por fechas | Entradas/salidas consolidadas. |
| Resumen consolidado de la producción | Producción interna (recetas preparadas). |
| Stock menú del día | Disponibilidad del menú. |
| Arqueo de inventario diario | Cierre diario de inventario. |
| Tiempo de despacho | Tiempos de cocina. |
| Exportar catálogo e importar cuadre manual | Excel de ida y vuelta para conteo físico. |
| **Food Cost** | Food cost real vs óptimo: (Inv. inicial + Compras − Inv. final) / Venta neta. Muestra diferencia y valorizados. |
| Historial de preparación de recetas | Quién preparó qué y cuándo. |
| Auditoría de control de inventario | Log de cambios de stock. |
| Consolidado salidas de productos/insumos | Todas las salidas agrupadas. |
| Consolidado de stock por local | Stock multi-sucursal. |
| Paralela de precios por local | Precios comparados entre locales. |
| Planificador producción/compras | Sugerencia de qué comprar/producir. |

### 4.5 Reportes Consolidados / Gerenciales (6)
Ventas totales (por tipo de documento y local) · Ventas totales por área · Consolidado por usuario · Consolidado por producto (V1 y V2) · **Comparativo de ventas por mes**. Diseñados para dueños con varias sucursales: todo agregado, sin detalle transaccional.

### 4.6 Facturación Electrónica (2)
Documentos DIAN · Panel de reenvío de documentos. *(Aplica solo cuando tengamos facturación electrónica DIAN.)*

### 4.7 Otros (2) y Mercado (1)
Reporte de asistencia (empleados) · Webhook por integración · "Todas las ventas" para modelo mercado/food-court.

---

## 5. Propuesta para Cobra POS

### Lo que NO vamos a copiar
- SOLO los formatos fiscales de Perú (Kardex SUNAT, WSAHI, ICBPER) — no aplican en Colombia.
- Facturación electrónica queda pendiente hasta integrar DIAN (los informes DIAN se diseñan desde ya).

> IMPORTANTE (feedback de Sergio 2026-07-22): Cobra POS es un SaaS para muchos restaurantes.
> Reservas de mesas, autoservicio, multimarca, food-court y multi-sucursal SÍ se incluyen en el
> diseño aunque El Parche no los use — otros restaurantes los van a necesitar. Estos informes
> aparecen/desaparecen según los módulos que cada restaurante tenga activos.

### Ventaja nuestra
Todos los datos ya existen en Supabase (`pos_orders`, `pos_order_items` con `selections.mods`, `pos_tables`, `iv_insumos`, `iv_compras`, `iv_recetas`, `iv_params` con food cost objetivo, cierres de caja, egresos, clientes unificados en `pos.clientes`). Cada informe es esencialmente una consulta + una pantalla con el patrón estándar: filtros → totales → tabla → exportar.

### Patrón de UI estándar (igual que Restaurant.pe, estilo Lumen)
1. Barra de filtros: rango de fechas con presets (hoy/ayer/semana/mes), sucursal, caja, turno, canal.
2. Tarjetas de totales arriba.
3. Tabla con paginación y orden por columna.
4. Botón exportar (CSV/Excel) en todos los informes.

### Fase 1 — Esenciales (operación diaria)
1. **Todas las ventas** — con formas de pago múltiples por venta, estado y reimpresión/PDF.
2. **Ventas por producto/categoría** — con desglose por canal (salón/rápida/domicilio) y % del total.
3. **Por forma de pago** — efectivo/Nequi/transferencia/tarjeta.
4. **Cierres de caja (histórico)** — apertura/cierre, usuario, montos, descuadre.
5. **Egresos e ingresos extras** — ya existen los datos de egresos de caja.
6. **Por días del mes** — comparación día a día.
7. **Por horas** — hora punta / hora libre (ya tenemos timestamps).
8. **Domicilios vendidos** — por pedido y por producto.

### Fase 2 — Control y rentabilidad
9. **Margen de ganancia por producto** — precio venta vs costo de receta (iv_recetas ya calcula costo).
10. **Food Cost** — real vs óptimo usando iv_params, compras e inventario inicial/final.
11. **Ventas por mesero/cajero** + pedidos por empleado + propinas.
12. **Descuentos** — quién aplicó cada descuento (auditoría anti-fraude).
13. **Ventas anuladas + pedidos modificados** — auditoría con motivo y usuario.
14. **Ventas por cliente** + estado de créditos — base para lealtad/NFC.
15. **Compras por insumo** + historial de precios por proveedor.
16. **Stock valorizado** + kardex de movimientos (ya hay iv_kardex implícito en inventario).
17. **Merma** — registrar y valorizar pérdidas.

### Fase 3 — Gerenciales y avanzados
18. **Dashboard estilo Resumen** — ampliar el dashboard actual con: hora punta, ticket promedio por venta y por persona, ranking de mesero, % por forma de pago, top clientes.
19. **Indicadores** — utilidades = ventas − compras − gastos, gráficos mensuales/anuales, ventas vs compras.
20. **Comparativo de ventas por mes** y **por sucursal** (cuando haya multi-sucursal activa).
21. **Ventas por modificador** — qué adiciones se venden más (datos ya en selections.mods).
22. **Productos por horas/días** — para decidir promociones por franja.
23. **Operación sospechosa** — patrones de anulación/modificación por usuario.
24. **Tiempo de despacho** — ya se registran tiempos de pedido; falta reporte.
25. **Cuadre de stock manual** con exportar/importar Excel.
26. **Planificador de compras** — sugerido según consumo teórico (paloteo) y stock mínimo.

### Decisión de arquitectura sugerida
Una sola página `informes.html` con menú de categorías (Ventas / Caja / Inventario / Clientes / Gerencial) y cada informe como vista dentro de ella, compartiendo el componente de filtros y el exportador CSV. Así agregar un informe nuevo = 1 query + 1 definición de columnas.
