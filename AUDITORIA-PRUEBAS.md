# Auditoría — lo que hay que probar con una cuenta nueva

Para el día que Sergio cree una cuenta desde cero, con **dos marcas** y
**varias sucursales**, y compruebe función por función.

**Cómo usarlo:** cada prueba dice *qué hacer*, *qué debe pasar* y *qué
significa si falla*. Marca ✅ o ❌ al lado. Lo que falle se anota tal cual se
vio — sin interpretarlo — y se revisa después.

**Regla de oro:** probar por el **camino del usuario** (entrando y tocando la
pantalla), nunca mirando el panel de la base. Un dato correcto en la base que
la pantalla no muestra sigue siendo un error.

---

## Cómo montar el escenario

Antes de nada, dejar la cuenta así:

| | |
|---|---|
| **Marca 1** | con **2 sucursales** (ej. Centro y Norte) |
| **Marca 2** | con **1 sucursal** |
| Empleados | 1 administrador, 1 cajero, 1 mesero |

La Marca 2 con una sola sucursal **no sobra**: sirve para comprobar que lo de
"por sede" desaparece cuando no tiene sentido.

---

## 1. La cuenta nueva nace bien

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 1.1 | Registrar el restaurante nuevo | Entra directo, sin pedir nada raro |
| 1.2 | Ir a Configuración → Roles | Están los **5 roles** de siempre (administrador, cajero, mesero, domiciliario, cocina) |
| 1.3 | Ir al Catálogo | Está **vacío**. No debe aparecer ni un producto de otro restaurante |
| 1.4 | Ir a Ventas, Clientes, Puntos | Todo en **cero** |

> **Si en 1.3 aparecen productos ajenos: PARAR TODO.** Es el error más grave
> que puede tener el sistema. No seguir probando y avisar.

---

## 2. El gerente y los roles (las 3 cosas que no se pueden confundir)

Esto se documentó en `DICCIONARIO-ACCESOS.md`. Aquí se comprueba en pantalla.

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 2.1 | Entrar con la cuenta con la que registraste | Ve **todo**, sin tener ningún rol asignado |
| 2.2 | Buscar al gerente en la lista de empleados | **No aparece como un rol.** El gerente es el dueño, no un cargo |
| 2.3 | Crear un administrador y entrar con él | Ve solo lo que el gerente le habilitó |
| 2.4 | Con el administrador, intentar entrar a *Consola Plataforma* | **No debe poder.** Esa es solo tuya, de Cobra, no del restaurante |
| 2.5 | Entrar con el cajero | No debe ver Configuración ni el Catálogo completo |

> **Lo que se está probando:** que "gerente" (el dueño), "administrador" (un
> rol del restaurante) y "admin de Cobra" (tú) sean tres cosas distintas.

---

## 3. Crear marcas y sucursales

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 3.1 | Crear la Marca 2 desde el desplegable de arriba | Se crea y aparece en la lista |
| 3.2 | Crear una sucursal dentro de la Marca 1 | Se crea colgando de esa marca |
| 3.3 | Abrir el desplegable de sucursales | **Solo salen las de la marca en la que estás.** Nunca revueltas con las de la otra marca |
| 3.4 | Cambiar de marca | El desplegable de sucursales cambia con ella |
| 3.5 | Cambiar de sucursal | La pantalla se recarga y todo (ventas, caja, carta) es el de esa sede |

---

## 4. Los empleados y sus sedes

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 4.1 | Dar a un empleado acceso a **dos sucursales de la misma marca** | Se puede |
| 4.2 | Ponerlo **cajero en una y mesero en la otra** | Se puede: el rol es por sede |
| 4.3 | Entrar con ese empleado y cambiar de sede | Sus permisos **cambian** con la sede |
| 4.4 | Intentar darle acceso a **dos marcas** | **No se puede.** Para eso el gerente le crea otra cuenta |
| 4.5 | Entrar con un empleado de la Marca 1 | No ve absolutamente nada de la Marca 2 |

---

## 5. La carta por sede ← lo nuevo del 12-ago

**Solo aparece con 2 o más sucursales de la misma marca.** Con una sola, el
Catálogo se ve igual que siempre — eso es correcto, no es un error.

### 5.1 Que el botón aparezca (y desaparezca)

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 5.1.1 | Ir al Catálogo estando en la **Marca 1** (2 sedes) | Cada producto tiene un botón **"Esta sede"** abajo, junto al interruptor de Activo |
| 5.1.2 | Cambiar a la **Marca 2** (1 sede) e ir al Catálogo | **El botón NO está.** Con una sola sede no significa nada |
| 5.1.3 | Crear una segunda sucursal en la Marca 2 y volver | El botón **aparece solo**, sin tener que pasar por otra pantalla |

> 5.1.3 es importante: antes el Catálogo se enteraba de las sedes por lo que
> dejaba otra pantalla, y recién creada una sucursal seguía creyendo que había
> una sola.

### 5.2 Poner un precio propio

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 5.2.1 | Tocar **"Esta sede"** en un producto | Se abre un panel que dice arriba **"Solo en \<nombre de la sede\>"** |
| 5.2.2 | Mirar las casillas | Cada tamaño tiene la suya, y al lado dice **"Marca: $X"** |
| 5.2.3 | Poner un precio y Guardar | El botón se pone azul y cambia a **"Precio propio"** |
| 5.2.4 | Ir a **Editar** ese producto (el editor normal) | El precio de la **marca sigue igual**. El panel de sede no lo tocó |
| 5.2.5 | Cambiar a la otra sucursal y mirar el mismo producto | Cobra el **precio de la marca**. El ajuste era de la otra sede |

### 5.3 Que sea lo que COBRA (lo más importante)

Probar en **las tres** pantallas, no en una:

| # | Dónde | Qué debe pasar |
|---|---|---|
| 5.3.1 | **Venta rápida** | El cuadro del producto muestra el precio de la sede |
| 5.3.2 | **Venta rápida** | Al agregarlo, el selector de tamaño muestra el precio de la sede |
| 5.3.3 | **Venta rápida** | El **total a pagar** es el precio de la sede |
| 5.3.4 | **Domicilios** | Lo mismo: cuadro, selector y total |
| 5.3.5 | **Mesas (por salón)** | Lo mismo: cuadro, selector y total |
| 5.3.6 | Cobrar el pedido de verdad y mirar el cierre de caja | La venta quedó por el precio de la sede |

> **Si el cuadro dice un precio y el total cobra otro: ❌.** Ese fue un error
> real que se corrigió; si vuelve, es que algo se rompió.

### 5.4 Apagar un plato solo en una sede

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 5.4.1 | En el panel, poner **"¿Se vende aquí?" en No** y guardar | El producto deja de aparecer al vender **en esa sede** |
| 5.4.2 | Cambiar a la otra sucursal | Ahí **sigue vendiéndose** normal |
| 5.4.3 | Apagar el producto desde el editor de la marca | Desaparece en **todas** las sedes |

> **Límite conocido, no es error:** una sede puede **apagar** un producto, pero
> **no puede encender** uno que la marca tiene apagado.

### 5.5 Restablecer

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 5.5.1 | En el panel, tocar **Restablecer** | Vuelve al precio de la marca y el botón deja de estar azul |
| 5.5.2 | Ajustar 3 productos y mirar arriba | Aparece **"Restablecer carta de \<sede\> (3)"** |
| 5.5.3 | Tocarlo | Avisa cuántos va a devolver y aclara que **las otras sedes no se tocan** |
| 5.5.4 | Aceptar | Los 3 vuelven a la carta de la marca |
| 5.5.5 | Comprobar en la otra sucursal | Sus ajustes **siguen intactos** |

### 5.6 Que subir un precio no pise a los locales

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 5.6.1 | Poner precio propio en la sede Norte | Guardado |
| 5.6.2 | Cambiar el precio de ese producto en el **editor de la marca** | Se cambia |
| 5.6.3 | Volver a la sede Norte | **Sigue con su precio propio.** No se lo pisó |
| 5.6.4 | Ir a la sede Centro (sin ajuste) | Tiene el **precio nuevo** de la marca |

> Esta es la regla entera del sistema en cuatro pasos. Si falla, falla el
> modelo, no un botón.

---

## 6. Lo que se arregló antes y conviene volver a mirar

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 6.1 | Entrar con un cajero recién creado | **No** debe tener permisos de administrador |
| 6.2 | Entrar como cajero y buscar *Consola Plataforma* | No aparece |
| 6.3 | Abrir el Dashboard | Carga completo, sin pantallas en blanco |
| 6.4 | En la bandeja de chat: etiquetar varios a la vez | Funciona |
| 6.5 | En la bandeja: archivar un chat | Se archiva |
| 6.6 | En la bandeja: editar el nombre de un cliente | Se guarda |
| 6.7 | Cobrar un domicilio | El domicilio **no** se suma a las ventas |
| 6.8 | Cobrar con un método de pago y mirar el cierre | El método quedó bien registrado |

---

## 7. Aislamiento entre restaurantes (la prueba de seguridad)

Esto se probó a fondo el 12-ago; se repite para confirmar que sigue así.

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 7.1 | Con la cuenta nueva, mirar el Catálogo | Solo sus productos |
| 7.2 | Mirar Ventas, Clientes, Puntos, Inventario | Solo lo suyo, todo en cero al empezar |
| 7.3 | Con un empleado, cambiar a una sucursal a la que **no** le dieron acceso | No debe poder |

---

## Dónde anotar lo que falle

Anotar tal cual: **en qué pantalla**, **qué se hizo**, **qué salió** y **qué se
esperaba**. Con eso se rastrea; con "no funciona" no.

Si algo del apartado 5 falla, en la consola del navegador se puede escribir:

```
posCarta.diag()
```

Dice en qué sucursal cree estar la pantalla, si aplicó la carta de la sede, a
cuántos productos y cuántos precios propios encontró. Eso responde en un
segundo lo que si no toca averiguar abriendo pedidos.
