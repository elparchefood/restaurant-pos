# Puesta en marcha de un restaurante nuevo en Cobra POS

> Qué tiene que configurar el dueño de un restaurante, desde que se registra y
> paga hasta que puede trabajar con normalidad.
>
> **Esta lista no está escrita de memoria.** Sale de comparar, dato por dato, lo
> que tiene configurado El Parche Food contra los tres restaurantes que existen
> hoy en la base sin configurar (`Restaurante de Prueba`, `Dos Sucursales SAS`,
> `Demo Restaurant`). Verificado el 23-ago-2026.

---

## 🚫 Lo que NO entra en esta lista

Tres módulos son **exclusivos de Sergio** y ningún restaurante cliente los tiene,
los configura ni los ve:

1. **La página / app de los clientes** — su dirección web, su logo, activarla, el
   banner, los destacados.
2. **El saldo / la billetera** del cliente y sus recargas.
3. **La tarjeta NFC.**

Están construidos por restaurante por si algún día se decide abrirlos, pero que
el dato viva separado por restaurante **no significa que el cliente lo
configure**. Los **puntos** sí son para todos y sí aparecen abajo.

---

## ✅ Lo que ya viene puesto solo

Nada de esto hay que tocarlo: se crea al registrarse.

| | qué es |
|---|---|
| La cuenta, la marca y la primera sucursal | las crea el registro |
| **Los 5 roles** con sus permisos | Administrador, Cajero, Mesero, Cocinero, Domiciliario |
| La fila de configuración de la sede | para que lo que se guarde después no se pierda |
| La regla de puntos | 1 punto por cada $1.000 de comida, si no se cambia |
| Los niveles de cliente | hay unos por defecto si no se configuran |

---

## 🔴 Sección 1 — Sin esto NO se puede vender

Es el mínimo para abrir la caja y cobrar un pedido. Sin cualquiera de estos
cuatro, el sistema no sirve todavía.

### 1.1 La carta: categorías, productos y precios
Un restaurante nuevo arranca con **cero categorías y cero productos**. No hay
nada que vender hasta que estén cargados, con sus presentaciones (personal /
familiar) y sus precios.

> Se puede cargar a mano o con la importación por foto de la carta.

### 1.2 Métodos de pago
Arranca **vacío**. Hay que decir con qué se cobra —efectivo, transferencia— y,
si hay pago digital, la llave o el número de la cuenta y a nombre de quién.
Sin esto no se puede cerrar una cuenta.

### 1.3 Dirección y teléfono del local
Arrancan **vacíos**. Salen en la comanda, en el recibo y en lo que el asistente
le responde a un cliente que pregunta dónde quedan.

### 1.4 Mesas y zonas del salón
Arranca con **cero mesas**. Si el restaurante atiende en el local, hay que
dibujar el salón antes de poder abrir una mesa. *(Un negocio que solo hace
domicilios y para llevar puede saltarse este paso.)*

---

## 🟠 Sección 2 — Sin esto el asistente no puede atender

El asistente de WhatsApp funciona, pero solo sabe lo que le hayan configurado.
Sin estos datos contesta mal o no contesta.

### 2.1 Conectar WhatsApp
Un restaurante nuevo tiene **cero canales conectados**. Hasta que no se conecte,
no le llega ni un mensaje.

> ⚠️ **Ojo con el orden.** El asistente nace **encendido**. Mientras WhatsApp no
> esté conectado da igual, pero en el momento en que se conecte empieza a
> atender clientes de verdad — con la carta que tenga cargada, los horarios que
> tenga puestos y los precios que tenga. **Conectar WhatsApp debe ser lo último
> de esta sección, no lo primero.**

### 2.2 Horarios
Arrancan **vacíos**. Sin ellos el asistente no sabe si el restaurante está
abierto, y esa es la primera pregunta que hace medio mundo.

### 2.3 Zonas de domicilio y sus precios
Arrancan **vacías**. Sin ellas no puede decir cuánto vale el domicilio a un
barrio, que es lo que decide si el cliente pide o no.

### 2.4 Las fotos de la carta
Arrancan **vacías**. Son las imágenes que el asistente manda cuando le piden la
carta. Sin ellas contesta que no puede enviarla.

### 2.5 Adiciones
Arrancan en **cero grupos**. Si el restaurante vende adiciones (una salchicha
extra, una salsa), hay que cargarlas con su precio por tamaño o no se cobran.

---

## 🟡 Sección 3 — Se puede vender sin esto, pero la operación queda coja

Nada de esto frena una venta. Todo esto hace que el negocio se maneje bien.

### 3.1 Cuentas del equipo y sus roles
El registro crea **una sola cuenta**, la del dueño. Cada cajero, mesero,
cocinero o domiciliario necesita la suya, con su rol asignado — de eso dependen
los permisos.

### 3.2 El PIN de administrador
Es el que autoriza descuentos, anulaciones y la entrada a las pantallas con
candado. Sin PIN configurado, un empleado sin permiso se queda trancado y no hay
manera de dejarlo pasar.

### 3.3 Configuración de operación
Empaque (si se cobra y cuánto), propina, cobro adelantado, cuántos pesos vale un
punto. Todo tiene valores por defecto razonables, pero **el empaque afecta a
todos los precios que ve el cliente** y conviene decidirlo temprano.

### 3.4 Impresoras
Para que la comanda salga en cocina y el recibo en caja.

### 3.5 Respuestas rápidas y frases del asistente
El Parche tiene 41 respuestas rápidas. No son obligatorias, pero son la
diferencia entre contestar en un toque y escribir lo mismo cincuenta veces al
día.

---

## 🟢 Sección 4 — Para más adelante

Vale la pena, pero ningún restaurante necesita esto la primera semana.

### 4.1 Inventario: insumos y recetas
**Es lo más largo de todo el sistema.** El Parche tiene 44 insumos y **374
recetas**. El sistema vende perfectamente sin inventario; lo que se pierde es
saber cuánto queda y cuánto cuesta cada plato.

> Recomendación: abrir el restaurante primero y cargar el inventario después,
> con calma. Intentar hacerlo antes de vender retrasa la apertura semanas.

### 4.2 Catálogo de premios de los puntos
Los puntos se acumulan solos desde el primer pedido. Lo que hay que decidir es
qué se puede reclamar con ellos y cuántos cuesta cada cosa.

### 4.3 Los niveles de cliente
Vienen unos por defecto. Se ajustan si el restaurante quiere sus propios rangos.

---

## Orden recomendado para el primer día

1. Carta (categorías, productos, precios) y adiciones
2. Métodos de pago
3. Dirección y teléfono
4. Mesas y zonas *(si atiende en el local)*
5. PIN de administrador y cuentas del equipo
6. Impresoras
7. Horarios, zonas de domicilio y fotos de la carta
8. **Conectar WhatsApp** — al final, cuando lo de arriba ya esté

Del 1 al 6 se puede abrir y vender. Del 7 al 8 se enciende el asistente.
El inventario y los premios, después.
