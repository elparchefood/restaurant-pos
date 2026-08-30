# La entrega del efectivo del domiciliario — plan

**Estado: HECHO el 30-ago-2026** (commit `4be8cff`). Decidido con Sergio el
27-ago-2026 y construido tres dias despues, cuando el pendiente volvio a salir
porque Paco empezo a poner esa misma marca solo.

> ⚠️ **SOLO APLICA AL DOMICILIARIO INTERNO, como decia este plan.** Yo me sali
> de eso al construirlo — medi que El Parche opera 157 de 157 con externos y
> agrupe tambien a los externos por su movil para que la pantalla no le saliera
> vacia. Sergio lo reclamo el mismo dia: con externos **no debe cambiar nada**,
> porque esa plata no es del restaurante ni la custodia nadie del restaurante.
> Corregido: con externos no se muestra absolutamente nada. Que a Sergio le
> salga vacia NO era un problema a resolver — era la respuesta correcta.
>
> Lo demas del plan se cumplio tal cual, incluida la regla de Sergio.
> Probado de punta a punta en el Restaurante de Prueba: entrega parcial
> (se recibieron $32.000 de $77.000 y el resto quedo pendiente con su nota),
> la fila de la entrega con quien recibio y a que hora, y el aviso del cierre.

## El problema

Hoy la app suma **"Efectivo en mano"** con lo que el domiciliario va cobrando, y
no existe forma de decir que lo entregó. Eso deja dos huecos:

1. El restaurante que recibe la plata **después de cada viaje** —que es lo
   común— ve un número que nunca baja. Al final del turno no significa nada.
2. **El dinero pasa de mano en mano sin dejar rastro.** Si mañana faltan
   $40.000, no hay dónde mirar ni a quién preguntar.

Y los botones que hay en la pantalla del turno —*"Enviar resumen a caja"* y
*"Cerrar turno y entregar efectivo"*— no hacen nada: muestran un aviso y ya.

## La regla, que es de Sergio y ordena todo lo demás

> El domiciliario puede tocar ese botón y quedarse con el dinero. El control
> debe estar en la persona que realmente recibe el dinero: la cajera.

De ahí sale todo:

- **El domiciliario NO puede poner su cuenta en ceros.** Solo mira lo que debe.
- **La cajera confirma que recibió**, y en ese momento la cuenta del
  domiciliario baja.
- El domiciliario puede acumular varios pedidos y entregar cuando quiera. El
  ritmo lo pone él; la constancia la pone la caja.

Esto no configura nada: el que entrega por viaje toca tres veces en la tarde y
el que entrega al final, una. Es el mismo botón a distinto ritmo.

## Qué se registra

La unidad **no es un monto suelto: es el efectivo de cada pedido.** Cada pedido
entregado y cobrado en efectivo está en uno de dos estados: *pendiente de
entregar* o *entregado a caja*.

Se guarda por qué así: un monto suelto obliga a hacer cuentas para saber qué
quedó cubierto, y con pedidos la respuesta es exacta y auditable — se sabe
**cuál** plata llegó y cuál no. Y la entrega parcial sale sola, sin aritmética:
la cajera recibe los pedidos que le entregaron y deja los demás pendientes.

Tabla nueva, `pos_domi_entregas`:

| campo | para qué |
|---|---|
| `tenant_id`, `branch_id`, `session_id` | de qué negocio, sede y turno de caja |
| `domiciliario_id` | quién entregó |
| `recibido_por` | **quién recibió** — el `pos_users.id` de la cajera con sesión abierta, no un texto escrito a mano |
| `monto` | cuánto |
| `orders` | los pedidos que cubre |
| `recibido_at`, `nota` | cuándo, y una nota si hubo un faltante |

## ⚠️ Lo primero que hay que comprobar al implementar

**Esta entrega NO es un ingreso: es un cambio de custodia.** La venta ya se
registró cuando el domiciliario cobró.

Antes de escribir una línea hay que mirar **cómo cuenta hoy la caja el efectivo
de los domicilios**. Si ya lo suma al cobrar, y la entrega lo vuelve a sumar,
el arqueo queda al doble y nadie se da cuenta hasta el cierre. Es el riesgo más
grande de todo esto y no se puede deducir: se mira en `caja.js` y en el arqueo.

## Las pantallas

### La cajera — donde vive el dinero

En **Caja**, una sección *"Efectivo de domiciliarios"*: la lista de quienes
tienen plata pendiente, con su total. Al tocar uno, los pedidos que trae y un
botón **"Recibí el dinero"**. Vienen todos marcados; se desmarca lo que no
entregó.

Permiso: `caja.movimientos`, que ya lo tienen Cajero y Administrador por
defecto. No hace falta uno nuevo.

### El domiciliario — solo mira

- **"Efectivo en mano"** baja solo cuando la cajera confirma. Con aviso y
  sonido, como un pedido nuevo: es su descargo y tiene que enterarse.
- **"Entregas de hoy"**: hora, monto y quién lo recibió. Esa es su prueba.
- Se quita **"Enviar resumen a caja"** — no hace nada y no hace falta.
- **"Cerrar turno y entregar efectivo"** deja de ser botón y pasa a ser una
  línea: *"Tienes $X para entregar en caja"*.

## Lo que resuelve, dicho en corto

Que el dinero deje de pasar de mano en mano sin rastro. Después de esto, cada
peso que sale de la calle tiene **hora, monto, y el nombre de quien lo recibió**.
