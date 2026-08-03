# Funciones pendientes — Cobra POS

> ⚠️ **ESTE DOCUMENTO YA NO SE USA PARA ANOTAR TAREAS** (2026-08-02).
> Todo lo que seguia pendiente se paso a la lista unica de la memoria:
> `cobra_pos_tareas.md`. Aqui quedan el detalle y la justificacion de cada
> funcion, que sirven al construirlas — pero **las tareas nuevas NO van aqui**,
> porque estaban repartidas en 7 documentos y se estaban perdiendo.

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

# 1. Sistema de créditos ✅ HECHO (2026-07-31, commits `d9e7f4d` + `36d90d0`)

**Sergio pidió no usar la palabra "fiado" en ninguna parte** (2026-07-31). Su definición:

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

**Desbloquea:** `caj-creditos` — ✅ ya funciona. Ver entradas 64 y 65 de `ESTADO-SISTEMA.md`.
**Nota:** los 13 pedidos que parecían "a medio pagar" NO eran deuda — ver §13.

---

# 2. Impuestos: IVA e impoconsumo ✅ HECHO (2026-07-31, commit `3683f45`)

Hoy **no existe ningún campo de impuesto** en `pos_products` ni en `pos_orders`.
Un restaurante formal en Colombia no puede operar así.

**Qué hay que construir**
- Impuesto por producto o por categoría (impoconsumo 8% es lo normal en restaurantes; IVA 19% para algunos ítems).
- Definir si el precio mostrado **incluye** o **excluye** el impuesto (en Colombia lo normal es incluido).
- Guardar la base gravable y el impuesto en cada línea del pedido, congelados al momento de la venta (si cambia la tarifa, las ventas viejas no se pueden alterar).
- Mostrar el desglose en la factura impresa.

**Desbloquea:** `sal-impuesto` — ✅ ya funciona. Viene APAGADO por defecto (El Parche es no
responsable). Ver entrada 62 de `ESTADO-SISTEMA.md`.
**Ya no bloquea** la facturación DIAN (§3): el prerrequisito está cumplido.

---

# 3. Facturación electrónica DIAN 🔴

> **Corrección (2026-07-31).** Aquí se había recomendado *esperar al primer
> cliente que la pida*. **Mal.** Sergio lo refutó con dos argumentos correctos:
> (1) *"el cliente no me debe decir qué necesita, solo dice necesito facturación
> electrónica y ya; la mayoría ni siquiera sabe cómo funciona"* — es una casilla
> que se marca, no un descubrimiento; y (2) **si el proveedor cobra por uso,
> tenerla construida y sin usar cuesta $0 al mes**, así que no hay razón
> económica para esperar. Además ya estaba decidido en `03-REQUERIMIENTOS.md`
> (*"vía Factus API pay-per-use"*). Mientras no exista, **cada restaurante
> formal es una venta perdida en la primera reunión**.

**Quién paga qué** — Cobra no paga nada por tenerla lista:
| Costo | Lo paga | Cuándo |
|---|---|---|
| La integración (una vez, sirve para todos) | Cobra | Ahora |
| Habilitación DIAN + resolución de numeración | Cada restaurante | Al contratar |
| Certificado digital (~$150.000/año) | Cada restaurante | Al contratar |
| Costo por factura emitida | Cada restaurante, o dentro del plan | Al usar |

**Oportunidad comercial:** incluir N facturas en el plan mensual y cobrar el
excedente.

**Por confirmar con la documentación de Factus antes de arrancar**
1. Que sea multi-tenant real: una integración emitiendo a nombre de muchos
   restaurantes, cada uno con sus credenciales. Si exige una cuenta por
   restaurante, cambia el diseño.
2. Que tengan ambiente de pruebas, para construirlo completo sin cliente real.
3. Precio actual por factura, para armar los planes.

**Va junto con las notas de crédito (§4), no separado:** una factura electrónica
emitida no se borra, se anula con una nota de crédito. Hoy anular un pedido solo
lo marca `cancelled`. Facturar sin eso deja un problema legal en la primera
anulación.

**→ El plan completo está en [`PLAN-FACTURACION-ELECTRONICA.md`](PLAN-FACTURACION-ELECTRONICA.md)**: investigación de proveedores, arquitectura, fases y reglas duras.
**Cuándo:** es lo ÚLTIMO antes de lanzar, después de corregir todo lo demás (decisión de Sergio, 2026-07-31).

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

# 5. Merma (desperdicio real) ✅ HECHO (2026-07-31, commit `4b89924`)

Ojo con la confusión, ya la tuvimos antes:
- La **merma de receta** (el % que ya existe en `iv_recetas.merma`) es un estimado de recortes y cáscaras. **Ya está.**
- La **merma real** es un evento: se dañó, se venció, se cayó al piso, se quemó. **Esto es lo que falta.**

**Qué hay que construir**
- Botón "Registrar merma" en Inventario: insumo, cantidad, motivo (daño/vencimiento/error/robo), quién lo registró.
- Que descuente stock y quede en `iv_movimientos` con motivo `merma`.
  *(Hoy `iv_movimientos` solo tiene movimientos con motivo `venta`.)*
- Valorizarla al costo del insumo.

**Desbloquea:** `inv-merma` — ✅ ya funciona. **Es opcional POR INSUMO** (`iv_insumos.merma_activa`):
las bebidas embotelladas no mermana y no ensucian la pantalla. Ver entrada 61.
**Mejoró también** `inv-paloteo`: ahora se separa lo que se botó de lo que no se explica.

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

# 7. Vencimientos y lotes — ❌ DESCARTADO (2026-07-31)

**Decisión de Sergio, tras analizar sus datos reales.** No se va a construir.

**Por qué no aplica a El Parche:** sus insumos son papa, carne desmechada,
salchicha, maicitos, tocineta — cosas de **rotación rápida**, que se compran y
se gastan en días. No hay un problema de vencimientos que resolver.

Los lotes sirven a una charcutería con quesos madurados, un bar con licores o un
supermercado. Aquí sería llevar una contabilidad de fechas que nadie va a usar, y
encima complica el descuento de inventario: en vez de restar de un número habría
que ir restando lote por lote.

**Qué implicaría si algún día se retoma** (para no volver a analizarlo desde cero):
- Tabla `iv_lotes`: insumo, cantidad, vencimiento, proveedor, costo.
- Capturar el vencimiento al surtir y al cargar una factura por WhatsApp.
- Consumo FIFO: el descuento deja de tocar un número y pasa a recorrer lotes.
- Alertas: crítico ≤7 días, pronto ≤30 días, avisando por WhatsApp.

**Cuándo reconsiderarlo:** solo si un cliente con producto de larga vida lo pide.

**Informe `inv-vencer`:** queda en el catálogo mostrando "Aún sin conectar".
Es correcto — el dato no existe porque la función no se hizo a propósito.

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

### 13.1 El domicilio "pendiente de pago" ✅ CORREGIDO (commit `a8306ef`)
13 pedidos aparecían pagados a medias y en **los 13** lo que faltaba era
exactamente el valor del domicilio. Regla nueva en `pos-core.js`:
`posCobrable(o) = total − delivery_fee` y `posEstaPagado(o)` compara contra eso.
Aplicada en Ventas, Domicilios, Historial y Caja.

**Queda 1 deuda real**, antigua: 14-jun, salón, faltan $2.700 de $29.700, método
'multiple' con 0 pagos registrados — anterior a que el registro de pagos
funcionara. No es plata que deban hoy.

### 13.2 Propinas desactivadas — NO es un bug ✅
**0 de 91 ventas pagadas tienen propina**, pero no hay nada que arreglar:
Sergio tiene la propina **desactivada a propósito** en Configuración → Operación
(`op-sw-propina`). El informe `caj-propinas` seguirá vacío mientras siga así, y
eso es correcto. El día que la active, el informe funciona solo.

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

~~1. Créditos (§1)~~ ✅ · ~~2. Impuestos (§2)~~ ✅ · ~~3. Merma (§5)~~ ✅

Lo que sigue:
1. **Cuadre de stock** (§6) — motor y registro de ajustes HECHOS (commit `7415fe8`); falta la pantalla de conteo.
2. **Notas de crédito** (§4) — va junto con DIAN.
5. **DIAN + notas de crédito** (§3, §4) — juntas, y **no hay que esperar cliente**:
   con el proveedor por uso, tenerla lista no cuesta nada y desbloquea vender a
   restaurantes formales.
6. El resto, según lo pida el mercado.

Los arreglos del §13 son pequeños y se pueden ir haciendo en cualquier momento;
el 13.1, el 13.2 y el 13.5 afectan números que ya se están mirando.


---

## Puntos al cliente en TODOS los pedidos (pedido por Sergio 2026-07-31)

Hoy los puntos solo se acumulan por algunos caminos. Deben acumularse **siempre
que haya un cliente identificado**, sin importar de donde venga el pedido:

- Mesa
- Venta rapida
- Domicilio

**Como debe funcionar:**

1. En la pantalla de pagos (o donde se elija el cliente) debe poder
   **seleccionarse un cliente** antes de cobrar.
2. Si el cliente **ya esta guardado** -> los puntos de esa venta se le suman a el.
3. Si **no esta guardado** -> se guarda en ese momento con el telefono que se
   escriba, y los puntos quedan asociados a ese numero. El telefono es la
   llave del cliente (`pos_clientes`), asi que aunque solo se tenga el numero
   los puntos ya quedan en su cuenta y aparecen cuando despues se le complete
   el nombre.
4. Si no se identifica a nadie, la venta sigue igual que hoy: sin puntos.

**Ojo:** el mismo cliente tiene que sumar en su unica cuenta aunque un dia pida
a domicilio y otro dia venga a la mesa. Es el mismo telefono, es el mismo
cliente, es el mismo saldo de puntos.

**Relacionado:** ese mismo dia hay que dejar los **puntos como metodo de pago**
en la pantalla de pagos (solo para redimir lo que este en el catalogo de
canje), y Sergio va a escoger cual de las dos plantillas de puntos se usa.


## Letra mas grande en los totales del recibo de cierre de caja (pedido 2026-07-31)

Sergio quiere que los **totales** del recibo impreso del cierre de caja se lean
mas facil. Solo los totales, no todo el recibo.

**Donde:** `pos-cierre-print.js`, el bloque de estilos de impresion.
Las clases que llevan las cifras grandes son:
- `.xl` -> 13 px (lo mas destacado)
- `.big` -> 12 px
- `td` -> 10.5 px (las filas normales)

**Que hacer:** subir `.xl` y `.big` (algo como 15 px y 14 px) y verificar en una
impresion real. **Ojo con el ancho:** el recibo esta fijado a 72 mm; si la letra
crece de mas, las cifras largas pueden partirse a dos lineas o cortarse. Hay que
imprimir un cierre de prueba y mirarlo en papel antes de darlo por bueno.


---

## PARA MAÑANA — La verificación de pago rechaza transferencias Bre-B legítimas

**Diagnosticado el 2026-08-01, con el comprobante real a la vista. NO se toco
nada: Sergio pidio analizarlo y arreglarlo mañana.**

### El sintoma
`verificar-pago-manual` (el boton **"Verificar pago"** del chat) respondio:

> *"El pago fue enviado a otra cuenta (EL PARCHE FOOD SERGIO ABADIA), no a la
> tuya (0092726260)"*

**El pago SI era de Sergio.** El se dio cuenta: *"el comprobante si decia la
cuenta... no se por que la verificacion al mirar el comprobante se distrajo e
hizo como si no la hubiera visto"*.

### La causa (verificada mirando la imagen)
El comprobante de **Bre-B** dice, textual:

```
¿A quién le llegó la plata?
   Enviado a           EL PARCHE FOOD SERGIO ABADIA
   Código de negocio   0092726260        <-- la cuenta, exacta
```

El prompt de Vision en `extractComprobante` (`verificar-pago-manual`, ~linea 166)
le dice al modelo que busque el destino en estas etiquetas:

> `Busca 'Para', 'Destinatario', 'A', 'Llave destino', 'Enviado a'.`

**"Código de negocio" NO esta en la lista.** Y remata con:

> `Si el destino solo aparece como un nombre y no un número, deja esto vacío.`

Bajo "Enviado a" solo hay un nombre, asi que el modelo **obedecio** y dejo
`llave` vacio, ignorando el numero de la linea siguiente. Despues `cuentaOk`
comparo vacio contra `0092726260` y dio false.

**No fue un fallo del modelo: fue una instruccion mia incompleta.**

### El arreglo — POR SEMANTICA, no por lista de etiquetas
**Instruccion de Sergio (2026-08-01):** *"las personas me van a enviar
comprobantes de varios bancos, y en cada banco puede que los datos esten en
lugares diferentes, asi que el sistema debe extraer absolutamente todos los
datos del comprobante sin importar en que parte estan ubicados"*.

Tiene razon, y **eso descarta la solucion facil**. Agregar "Codigo de negocio"
a la lista tapa a Bre-B y manana aparece otro banco con otra palabra. Es el
MISMO error de fondo que ya se corrigio hoy con las intenciones del chat
(entrada 76): buscar texto exacto en vez de entender.

**Como debe quedar:**

1. **Que el modelo entienda el rol, no la etiqueta.** En vez de darle una lista
   de palabras, se le describe QUE es cada dato:
   *"la llave destino es el numero (celular, cuenta, NIT o codigo) que
   identifica a QUIEN RECIBIO la plata, este bajo la etiqueta que este:
   'Codigo de negocio', 'Llave', 'Para', 'Convenio', o ninguna."*
2. **Que devuelva TODO lo que ve.** Un campo nuevo `campos: [{etiqueta, valor}]`
   con cada par etiqueta-valor del comprobante, mas `numeros: [...]` con todos
   los numeros largos. Asi, aunque el modelo se equivoque clasificando, el dato
   igual llego y se puede comparar.
3. **La comparacion se hace del lado nuestro, no del modelo.** `cuentaOk` = la
   cuenta configurada aparece en CUALQUIER parte del comprobante **y no esta
   bajo una etiqueta de origen** ("De donde salio", "Cuenta origen", "Desde").
   Esto es robusto contra cualquier disposicion de cualquier banco.
4. Y **quitar** la frase *"si el destino solo aparece como un nombre... deja
   esto vacio"*, que es la que hizo que ignorara el numero de la linea de abajo.
5. Como ultima red, aceptar el **nombre del negocio** como destino valido
   (configurable), para comprobantes que de verdad no muestran ningun numero.

**Como probarlo:** guardar comprobantes reales de varios bancos (Bre-B, Nequi,
Bancolombia, Daviplata, Davivienda) y pasarlos todos por la extraccion. No se
da por bueno hasta que los saque bien **todos**, sin una lista por banco.

### Caso real capturado el 2026-08-01 a las 7:10 pm (WILLIAM AMOR AL)
Pedido de $55.000. El modal mostro:

```
✓ Monto: $55.000 (pedido $55.000)
✗ Cuenta
✓ Correo del banco        <-- Bancolombia · 2026-08-01 19:09 · Ref TRPzcx32juEC
```

**El correo del banco CONFIRMO el abono y el monto cuadraba exacto.** El unico
chequeo que fallo fue el de la cuenta, por el bug de las etiquetas. O sea que
se esta rechazando un pago que el banco ya confirmo — el peor tipo de falso
negativo, porque el dato bueno estaba ahi.

**Mientras se arregla:** si Monto y Correo del banco salen en ✓, el pago esta
confirmado por el banco y se puede registrar con tranquilidad. El chequeo que
de verdad protege contra un comprobante falso es el del CORREO, y ese esta
funcionando.

### Por que urge
**Bre-B es lo que mas se esta usando ahora.** Mientras esto siga asi, la
mayoria de las verificaciones de transferencia se rechazan y a Sergio le toca
aprobarlas a mano, perdiendo la verificacion real.

### Lo que SI quedo confirmado y funciona bien (revisado el 2026-08-01)
- El boton del chat usa `verificar-pago-manual`, **una funcion distinta** a las
  que se tocaron hoy. No se modifico.
- Es **de solo lectura**: sus unicos envios salen a OpenAI (leer la imagen) y a
  Google (refrescar el token). No marca pagos, no crea pedidos, no escribe al
  cliente.
- El veredicto es **estricto**: solo dice "verificado" si coinciden **cuenta +
  monto + correo del banco**. Si el correo no aparece, NO lo da por bueno. Un
  comprobante falso no pasa.
- **Gmail esta conectado y respondiendo** (verificado: contesta "Sin correos
  bancarios con monto X en las ultimas 5h", o sea que la consulta corre).
- La ventana de busqueda del correo es de **5 horas** (`pagos.ventana_comprobante_horas`).
  Por eso un comprobante de hace 12 h no se confirma: es correcto.


---

## 🔴 MAÑANA CON URGENCIA — la bebida vuelve a salir en $0 (2026-08-01, 7:40 pm)

**Caso real.** Sergio creo un pedido desde el chat y en el modal aparecio:

```
1x  Personal · SÚPER QUESO · Pollo · Tocineta      $27.000
1x  Coca-Cola · Personal   sin precio                   $0
```

(El toco borrarla y volver a elegirla bien, asi que en la base el pedido quedo
correcto. El bug esta en el modal, no en el dato guardado.)

### La causa, ya verificada
El modelo devolvio el nombre **`Coca-Cola`, con guion**. En el catalogo esta
guardado **`COCA COLA `, con espacio** (y con un espacio al final).

`norm()` en `extraer-pedido` baja a minusculas y quita tildes, **pero no toca
los guiones**:

```
catalogo -> "coca cola"
modelo   -> "coca-cola"
¿iguales? NO   ¿uno contiene al otro? NO
```

Sin coincidencia, el producto no se empareja y queda en $0.
**Quitando el guion coinciden exactamente.**

### Es el MISMO error de fondo de la carta
Igual que el doble espacio de *"Para ver la  carta"*: se esta **comparando
texto** en vez de entender. La regla que dio Sergio para el chat aplica aqui
tambien.

### El arreglo de verdad — que NO pueda inventar productos

**Regla de Sergio (2026-08-01), y es la que manda:**

> *"No puede inventarse productos, solo debe colocar productos que esten
> guardados. En un caso muy extremo donde el cliente indique su pedido de manera
> muy rara, es mejor que diga que no se reconocio el producto, pero que no
> invente productos que no existen... el cliente lo dijo de una manera muy
> sencilla, es superfacil reconocer que quiere una Coca Cola personal. Caemos en
> el mismo error: detectar intenciones, no palabras exactas, porque si trabaja
> con palabras exactas en un chat siempre se va a equivocar."*

**Dato clave verificado:** al modelo **YA se le manda el menu completo**
(`MENÚ DISPONIBLE:` en el prompt) y **ya hay una instruccion** que dice
*"Usa EXACTAMENTE los nombres del MENÚ"*. **La desobedecio igual** y escribio
"Coca-Cola". O sea: **pedirle por favor que use el nombre exacto no sirve.**

**Lo que hay que hacer:**

1. **Que devuelva un ID, no un nombre.** Se le pasa el menu numerado y se le
   pide `product_id` (o el numero de la lista), no texto libre. Asi
   **no hay nada que emparejar**: o eligio un producto que existe, o no eligio.
   Es el mismo salto que se hizo con los barrios (entrada 79) y con las
   intenciones del chat (entrada 76).
2. **Si no reconoce, lo dice.** Cuando el modelo no encuentre el producto en la
   lista, devuelve `null` y la pantalla muestra **"no se reconocio el producto"**
   en rojo, sin permitir guardarlo. **Nunca una linea en $0**, que es lo que
   parece un producto valido y no lo es.
3. **La pantalla no deja guardar un producto sin precio.** Hoy dejo pasar
   `Coca-Cola · Personal — sin precio — $0`. Eso es un candado que falta.
4. Como respaldo (no como solucion), `norm()` deberia tratar **guiones, puntos,
   comas y barras como espacios**. Ayuda, pero **no es el arreglo**: si se deja
   solo eso, manana falla con otra forma de escribirlo.
5. **Limpiar el catalogo**: `COCA COLA ` tiene un espacio al final; poner
   `trim()` al guardar el producto.

### Como probarlo
Pasar por el emparejador variantes escritas como las escribe la gente y el
modelo: `Coca-Cola`, `coca cola`, `COCA-COLA`, `cocacola`, `Coca Cola 1.5`,
`gaseosa coca cola`. **Ninguna puede quedar en $0.**


### Segundo caso el mismo dia — nota de voz: "premiumista" (7:50 pm)

Vilma Ortiz mando una **nota de voz** y la transcripcion quedo:

> *"¿sera que tu me puedes mandar una salchipapa **premiumista**...?"*

Dijo **"Premium mixta"** y el transcriptor lo pego en una sola palabra. El
emparejador compara texto, no encontro nada, y el modal salio con **0
productos**.

**Refuerza el mismo arreglo:** que el modelo **escoja de la lista de productos**
en vez de que se compare texto. Un humano entiende "premiumista" al instante;
comparar cadenas no. Y aqui el cliente hablo bien — el ruido lo metio la
transcripcion, o sea que el problema no se resuelve pidiendole al cliente que
escriba mejor.

**Nota positiva:** en esa misma conversacion la respuesta al boton quedo
guardada como **"Familiar"** (no `[interactive]`), o sea que el arreglo de
`meta-webhook` v54 ya esta funcionando en vivo.


---

## 🔴 MAÑANA — el pedido por AUDIO no llega al analisis (2026-08-01)

**Pedido de Sergio:** *"Vilma Ortiz me envio audio y tenemos una tarjeta que
transcribe ese audio, y eso esta perfecto porque con eso pude entender el
pedido. Pero necesitamos que ese texto de transcripcion tambien sea accesible
para el sistema, para que se pueda crear el pedido desde el boton Crear pedido
incluso cuando hayan mandado audios."*

### Verificado: la transcripcion SI se guarda, pero se descarta al analizar

En la base el mensaje quedo asi:

```
media_type = audio
body       = 🎙️ ¡Hola! Oye, ¿será que tú me puedes mandar una salchipapa
             premiumista a la parcelación Ciudad Verde...
```

O sea **el texto esta ahi**. Pero `extraer-pedido` filtra los mensajes que no
son de texto, **en dos sitios** (lineas ~398 y ~509):

```js
.filter(m => m.media_type == null || m.media_type === "text")
```

El audio se bota **con transcripcion y todo**. Por eso Sergio si entendio el
pedido (leyo la tarjeta en pantalla) y el sistema no: **nunca lo vio**.

### El arreglo
Cambiar el filtro para que **acepte cualquier mensaje que tenga texto**, sin
importar el `media_type`. Lo que hay que excluir no es el audio: son las
imagenes y los stickers **sin texto util**.

```js
// en vez de filtrar por media_type, filtrar por si HAY texto
.filter(m => String(m.body || "").trim().length > 0)
```

Ojo con dos cosas:
1. El cuerpo del audio trae el prefijo **🎙️**; conviene quitarlo antes de
   mandarlo al analisis para que no ensucie.
2. Las imagenes guardan `[imagen]` o el nombre del archivo como body — eso si
   hay que seguir excluyendolo (no es texto del cliente).

### Este caso fueron DOS fallas encadenadas
1. El audio se descarto -> el analisis vio 0 mensajes utiles.
2. Aunque no se hubiera descartado, **"premiumista"** no habria emparejado con
   "Premium mixta" (ver el pendiente de arriba: que el modelo escoja de la
   lista de productos en vez de comparar texto).

**Hay que arreglar las dos.** Con una sola, el pedido por audio sigue fallando.


---

## 🟠 MAÑANA — unificar el panel de VENTA RAPIDA con el de domicilio y mesa

**Sergio:** *"el panel de la comanda de informacion de venta rapida es muy
diferente a los de domicilio y los de mesa, hay que unificarlo, se ve raro como
esta."*

Comparado `renderQuickRailDetail()` contra `renderDomiRailDetail()`. **Cinco
diferencias**, y una no es cosmetica:

### 🔴 1. NO muestra la comanda
El panel de domicilio pinta los productos con `vs-order-head` + `vs-order-list`
+ `vsComandaHTML(...)`. **El de venta rapida no los muestra: solo el total.**
Es lo mas importante de la tarjeta y es justo lo que falta — no se puede ver
que pidio el cliente sin abrir otra pantalla.

### 🟠 2. Los datos van en lista vertical, no en la rejilla de 3
- Domicilio: `vs-info-row` con **tres `vs-info-cell`** (Canal · Tiempo · Ítems),
  en horizontal.
- Venta rapida: usa `vs-info-row` como **filas de etiqueta/valor** (Canal,
  Hora, Notas) una debajo de otra. Por eso se ve alto y desordenado.

### 🟠 3. El nombre y la pastilla de estado se parten en dos lineas
El de venta rapida usa `vs-rail-title` **sin** el `vs-rail-title-main` que se
agrego hoy al de domicilio. Por eso se ve *"Jenifer Jime…"* partido y la
pastilla "Pendiente de pago" en dos renglones.

### 🟠 4. Muestra una marca interna al operador
En NOTAS sale **`[etq:ESPERAN]`**. Ese `[etq:...]` es un marcador interno que
`venta-rapida.js` mete en `notes` para guardar la etiqueta, y que `pos-print.js`
**ya sabe limpiar** antes de imprimir (`.replace(/\[etq:[^\]]+\]/ig,'')`).
El panel no lo limpia. Deberia mostrar la etiqueta bonita (*Esperan*) o nada.

### 🟡 5. No tiene el chip de puntos
El de domicilio ya muestra `⭐ N pts` junto al nombre. El de venta rapida no,
aunque la venta rapida tambien acumula puntos.

### El arreglo
Que los dos paneles usen **la misma estructura**: cabecera con nombre en una
linea + chip de puntos + pastilla de estado, rejilla de tres celdas, comanda con
los productos, totales y acciones. Lo unico que cambia entre uno y otro deberia
ser **el contenido de las celdas** (domiciliario vs turno) y los botones.

Conviene sacar la parte comun a una funcion compartida en vez de mantener dos
copias que se van separando — que es exactamente como se llego a esto.


---

## 🟠 MAÑANA — la tarjeta del pedido en el chat no se sincroniza

**Sergio (01/08, 11:11 pm):** *"La tarjeta del pedido del chat dice en
preparacion, pero el pedido ya esta en estado en camino. La pastilla de la
tarjeta de pedido tambien debe estar sincronizada siempre."*

### La causa, ya localizada
`chat-ia.js` **ya tiene** una suscripcion en vivo a `pos_orders` (linea ~214)
que actualiza el estado cuando cambia desde otra pantalla. Pero **solo repinta
la pastilla de arriba**:

```js
if (S.estadoOrder && o && o.id === S.estadoOrder.id && o.estado) {
  S.estadoOrder.estado = o.estado;
  renderEstadoPill();          // <-- solo la pastilla; a la tarjeta nadie le avisa
}
```

La tarjeta (`renderPedidoEnviado`) solo se dibuja:
- al abrir la conversacion (`loadDraftBar` en `openConversation`),
- al enviar el pedido a cocina,
- y al cambiar el estado **desde el chat**.

**Si el estado cambia desde Ventas, la tarjeta se queda vieja.** Es justo lo que
paso: la pastilla decia "En camino" y la tarjeta "En preparacion".

### El arreglo
Agregar el repintado de la tarjeta dentro de esa misma suscripcion:

```js
if (S.estadoOrder && o && o.id === S.estadoOrder.id && o.estado) {
  S.estadoOrder.estado = o.estado;
  renderEstadoPill();
  if (S.activeConvId) loadDraftBar(S.activeConvId);   // <-- la tarjeta tambien
}
```

Ojo: `loadDraftBar` vuelve a leer el pedido, asi que tambien refresca el total y
los productos si cambiaron. Y si el pedido quedo **entregado**, la tarjeta
desaparece sola, que es el comportamiento acordado.

**Regla de fondo:** la pastilla de arriba y la tarjeta de abajo muestran el
MISMO dato. Cada vez que se actualice una, hay que actualizar la otra — o mejor,
que las dos salgan de la misma funcion para que no puedan separarse.
