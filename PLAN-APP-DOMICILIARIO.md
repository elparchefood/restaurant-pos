# PLAN — App del domiciliario (APK) y lo que Cobra necesita para alimentarla

> Definido por Sergio el 21-ago-2026. Diseño en el ZIP "App Domiciliario"
> (HTML/CSS/JS puro, 4 archivos). Este plan cubre **lo que hay que agregar en
> Cobra** para que la app tenga de dónde leer, y después la APK.


## ESTADO AL 21-ago-2026 (tarde) — todo lo de Cobra hecho; falta el mapa

| Pieza | Estado |
|---|---|
| Ubicación que manda el cliente por WhatsApp | ✅ `meta-webhook` v68 |
| Rol con nombre interno vs. nombre visible | ✅ `pos_roles.clave` |
| Documento / vehículo / placa del domiciliario | ✅ salen solos con el rol |
| Interruptor del dinero (en cada pedido / al final) | ✅ en la ficha del rol |
| Empresas de domicilio externo | ✅ Configuración › Domicilios |
| "Rapid" escrito a fuego | ✅ fuera del código |
| Modal "¿Quién lo lleva?" al marcar En camino | ✅ obligatorio |
| Caja: efectivo en poder de los domiciliarios | ✅ en el arqueo |
| La app (web) | ✅ `domiciliario.html` |
| La APK | ✅ `Cobra-Domicilios.apk` |
| **El mapa** | ⬜ falta — es lo siguiente |

### Probado de punta a punta (21-ago, en "Restaurante de Prueba")

Con un domiciliario y dos pedidos de prueba, desde el celular:
entrar → ver sus 2 pedidos con dirección y barrio → abrir el detalle (productos,
cantidades, teléfono) → "Recogí el pedido" → **la base pasa a `camino`** →
"Cobrar y entregar" con $50.000 sobre $46.000 → **cambio $4.000** →
confirmar → **la base queda `entregado`, `efectivo`, `paid_amount 46.000`** →
el turno muestra $46.000 en mano → **y el arqueo de la caja del restaurante
muestra "PRUEBA Domiciliario · 1 pedido · $46.000"**. Todo borrado al terminar.

También se comprobó que un monto menor al total **bloquea** el botón de cobrar.

## Cómo se compila la APK

Es una **capa delgada** sobre la web: apunta a la dirección en vivo, así que
cada mejora de la app llega sola al celular **sin volver a compilar ni
reinstalar**. Solo hay que recompilar si cambia el nombre, el icono, los
permisos o la dirección.

```
appId    com.elparchefood.cobradomi      (distinto al del POS: son dos apps)
apunta a https://elparchefood.github.io/restaurant-pos/domiciliario.html
```

Receta (Capacitor 8 + Android SDK ya instalados):

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
# android/local.properties -> sdk.dir con BARRAS NORMALES:
#   sdk.dir=C:/Users/USUARIO/AppData/Local/Android/Sdk
cd android
JAVA_HOME="C:/Program Files/Android Studio/jbr" ./gradlew assembleDebug
```

⚠️ **Dos trampas que ya costaron tiempo:**
1. **Capacitor 8 exige Java 21.** El Java 17 del sistema falla con
   `invalid source release: 21`. El 21 viene dentro de Android Studio
   (`jbr`): hay que apuntarle `JAVA_HOME` ahí.
2. **`local.properties` con barras normales.** Con barras invertidas
   escapadas, Gradle responde *"El nombre de archivo... no son correctos"*,
   que no dice nada de lo que pasa en realidad.

Permisos que lleva: internet, ubicación (fina y aproximada), estado de red y
poder abrir el marcador del teléfono. La ubicación **la pide Android en el
momento**, no al instalar. La pantalla **no gira**: se usa manejando.

### Lo que la app NO muestra, a propósito

El diseño traía **kilómetros y minutos** en cada tarjeta. Sin mapa no hay forma
de calcularlos, y **un número inventado en la pantalla de alguien que está
manejando es peor que no poner nada**. Vuelven cuando se conecte Google.


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


---

## El mapa — decidido por Sergio el 21-ago-2026

**Google Maps, no el gratuito.** Cada restaurante conecta **su propia** cuenta
de Google con su tarjeta, asi que el consumo va contra su cupo y **Cobra no
carga con el costo de nadie**. En los primeros pasos (onboarding) se le indica
que debe conectarla, **con la advertencia de que sin eso no tendra la funcion
de mapas**.

Se le explico la alternativa (dibujar con OpenStreetMap gratis y usar Google
solo para BUSCAR direcciones, con lo que todos tendrian mapa sin tarjeta) y
Sergio prefirio Google para todo. Consecuencia aceptada: **sin tarjeta
conectada no hay mapa**, ni siquiera para probar.

Reglas que igual se respetan:
1. **La clave NUNCA en el navegador** — se guarda cifrada del lado del
   servidor y las llamadas pasan por ahi. Si queda expuesta, se la roban y el
   consumo se lo cobran al restaurante.
2. **Con contador y tope**: Cobra lleva la cuenta del mes y se frena antes del
   limite. Un dueNo de restaurante no puede descubrir un cobro de Google por
   algo que hizo el sistema.
3. **Cobra funciona sin mapa**: se pierde el seguimiento, nada mas. El punto
   exacto de cada direccion lo sigue poniendo el domiciliario al entregar.

⚠️ Los precios de Google Maps cambiaron en 2025 y pueden volver a cambiar:
**verificar la tabla vigente el dia que se conecte**, no planear con cifras
viejas.

## Por que NO se usa la busqueda automatica gratuita (probado, no supuesto)

Se probaron direcciones REALES de El Parche contra Nominatim (OpenStreetMap):
- "Carrera 9 B # 63 N 58" (el propio restaurante) → **no la encuentra**
- "Conjunto Arrayanes del Uvo" → no lo encuentra
- "Conjunto Residencial Balmoral" → no lo encuentra
- "Bellavista" → devuelve **la escuela** Bellavista, no el barrio
- "El Uvo" → devuelve **una cancha de futbol**
Y de control: encuentra el Parque Caldas y el Campanario, pero **NO la
Catedral de Popayan**. No es un fallo tecnico: es que Popayan esta mapeada a
medias en OSM y la nomenclatura colombiana ("63 N 58") no la sabe leer.

## De donde salen entonces los puntos exactos

1. **El domiciliario al entregar** — su celular esta en la puerta del cliente.
   Gratis, exacto, se acumula solo. Es el principal.
2. **La ubicacion que manda el cliente por WhatsApp** — ya se captura
   (meta-webhook v68, 21-ago; antes se guardaba como "[location]" y las
   coordenadas se botaban). Se guarda **por DIRECCION, no por cliente**: uno
   puede pedir a la casa y a la oficina.
3. **Pedirla en el flujo de Paco** — caja OPCIONAL que cada restaurante activa,
   enganchada al aviso de "en preparacion" que ya existe. El Parche NO la va a
   usar (trabaja con externos).
4. **Google**, para el que conecte su cuenta.

⚠️ **Ojo con El Parche:** usa domiciliarios EXTERNOS, asi que no tendra app ni
seguimiento. Todo esto es funcion para VENDER, no para su operacion diaria.
Lo que a el le sirve es el movil + la empresa externa (hecho el 20-ago).
