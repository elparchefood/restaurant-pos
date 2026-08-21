# PLAN — App del domiciliario (APK) y lo que Cobra necesita para alimentarla

> Definido por Sergio el 21-ago-2026. Diseño en el ZIP "App Domiciliario"
> (HTML/CSS/JS puro, 4 archivos). Este plan cubre **lo que hay que agregar en
> Cobra** para que la app tenga de dónde leer, y después la APK.

---

## Las 5 reglas que puso Sergio

1. **La cuenta del domiciliario NO se autoregistra.** Se crea desde Cobra, en
   Usuarios y roles, igual que la cajera o el mesero. Obligatorio: **nombre y
   credenciales**. Documento, vehículo y placa son **opcionales** — se dejan
   disponibles por si un restaurante los quiere llenar, vacíos si no.

2. **El dinero: interruptor EN EL ROL.** *"El domiciliario trae el dinero al
   terminar todo"* vs *"lo entrega en cada pedido"*.
   - **En cada pedido** → el dinero entra como una venta normal, tal como hoy.
   - **Todo al final** → **igual suma en ventas**, pero la caja debe **informar
     cuánto dinero tiene cada domiciliario y debe entregar**.

3. **NADA de "Rapid" escrito a fuego.** Es la empresa que usa El Parche hoy;
   mañana puede ser otra, y otro restaurante usará la suya. Hace falta una
   pantalla donde cada restaurante **guarde sus empresas de domicilio externo**.
   Al escribir el móvil en la tarjeta del domicilio, un desplegable deja
   escoger a qué empresa pertenece. **Es solo informativo**: no influye en
   nada más.

4. **A quién se le asigna, y CUÁNDO.**
   - Al **recibir** el pedido se toma como siempre (dirección, etc.) y se
     escoge *interno* o *externo*. Ahí **NO es obligatorio** decir quién lo
     lleva.
   - **Al marcar el pedido "En camino", Cobra abre un modal preguntando quién
     lo va a llevar. AHÍ SÍ es obligatorio** — hay que poder rastrear con quién
     salió.
   - Si el pedido es **interno** → desplegable con los domiciliarios guardados.
     Al asignarlo, **el pedido le aparece en su app**.
   - Si es **externo** → el móvil y la empresa (lo de hoy, con el desplegable
     de empresas del punto 3).

5. **Interno/externo es POR PEDIDO, nunca global.** Un domicilio puede ir con
   uno interno y el siguiente con uno externo. La decisión vive dentro de cada
   pedido y se toma al escoger el domicilio. *(Esto YA funciona así en
   `domicilios.js` → `toggleCourier()`.)*

---

## Lo que Cobra tiene hoy (verificado 21-ago)

| Pieza | Estado |
|---|---|
| Rol **Domiciliario** con permisos `pedidos.crear`, `pedidos.cobrar` | ✅ existe |
| Elegir interno/externo por pedido | ✅ existe (`toggleCourier`) |
| Estados `preparacion → listo → camino → entregado` | ✅ existen |
| `pos_orders.domi_movil` (el móvil de la empresa externa) | ✅ existe (20-ago) |
| Dirección y barrio para el mapa | ✅ en `notes`, con la ciudad en `branches.city` |
| Pago: `payment_method`, `paid_amount`, `total`, `delivery_fee` | ✅ existen |

**El hueco grande:** `pos_orders.domiciliario` guarda el **nombre en texto**, no
un identificador. Con eso la app no puede responder "¿cuáles pedidos son
míos?" sin equivocarse (dos Juanes, un nombre mal escrito, un cambio de
nombre). **Hace falta `domiciliario_id`.**

**Lo que no existe:** documento/vehículo/placa del usuario · empresas de
domicilio externo · el interruptor del dinero · el turno del domiciliario ·
el registro del efectivo que lleva encima · dónde guardar su ubicación GPS.

---

## Orden de construcción

### A. Base de datos
- `pos_users` + `documento`, `vehiculo`, `placa` (todos opcionales).
- `pos_roles` + `domi_dinero`: `'por_pedido'` | `'al_final'` (por defecto
  `'por_pedido'`, que es como funciona hoy).
- `pos_orders` + `domiciliario_id` (uuid → pos_users) y `domi_empresa_id`.
- `pos_domi_empresas` (id, tenant_id, nombre, activa) — las empresas externas.
- `pos_domi_ubicaciones` (domiciliario_id, order_id, lat, lng, ts).
- Vista/función para la caja: cuánto efectivo tiene cada domiciliario sin
  entregar.

### B. Pantallas de Cobra
1. **Usuarios y roles**: los 3 campos opcionales + el interruptor del dinero
   en la ficha del rol.
2. **Configuración → Domicilios**: las empresas externas (agregar/quitar).
3. **Al marcar "En camino"**: el modal de asignación (interno → desplegable de
   personas; externo → móvil + empresa).
4. **Caja**: el bloque "efectivo en poder de los domiciliarios".

### C. La APK
El diseño del ZIP, conectado a lo anterior. Entra con las credenciales que le
creó el restaurante; ve solo SUS pedidos asignados.

---

## Detalle que hay que respetar en la app

El diseño llama **"Asignado"** al pedido que aún no ha recogido. En Cobra eso
es `listo` (ya está preparado y esperando). `preparacion` significa que la
cocina todavía lo está haciendo: **el domiciliario no debería verlo como suyo
para recoger**. Mapeo:

| Cobra | La app muestra |
|---|---|
| `listo` (asignado a él) | **Asignado** |
| `camino` | **En camino** |
| `entregado` | **Entregado** |
