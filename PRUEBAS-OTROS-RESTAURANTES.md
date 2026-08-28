# Lo que El Parche no usa — y hay que probar igual

> Pedido por Sergio el 28-ago-2026, a pocas semanas de lanzar.
>
> **Para qué es esta lista.** El Parche es el banco de pruebas, no el
> destinatario. Todo lo de aquí abajo está construido y El Parche **no lo usa**,
> así que nunca se ha visto funcionando de verdad — y es justo lo que un
> restaurante distinto va a encender el primer día.
>
> **Dónde se prueba:** Restaurante de Prueba (`prueba-registro@ejemplo.com`).
> Nunca en El Parche. Ver la memoria `feedback_nunca_probar_en_produccion`.
>
> **Cómo usar la lista:** cada punto dice qué encender, qué mirar y por qué
> importa. Marcar `[x]` al comprobarlo. Si algo falla, anotar la fecha y el
> síntoma debajo del punto — no borrar la marca.

---

## 🚫 Lo que NO va en esta lista

Tres cosas son **solo de El Parche** y no se le venden a nadie, así que no se
prueban como producto: la **página/app de clientes**, el **saldo y la
billetera**, y la **tarjeta NFC**. Existen por restaurante por si algún día
cambia de opinión, pero hoy son suyas. Ver `feedback_cobra_no_es_el_parche`.

Los **puntos** sí son para todos, y sí se prueban.

---

## 1. Cómo cobra el restaurante

El Parche cobra **por adelantado**. La mitad de los restaurantes cobran al
final, y eso cambia el comportamiento de tres pantallas.

- [ ] **Cobro al final.** Apagar «Cobro adelantado» en el Restaurante de Prueba.
  - Abrir mesa, mandar a cocina **sin cobrar**: la comanda tiene que entrar en
    verde. **Ninguna tarjeta puede verse roja** — el rojo dice «no se puede
    preparar porque no han pagado» y en este modo eso es falso siempre.
  - La leyenda de colores de cocina no debe mencionar «Pendiente de pago».
  - Cobrar al final y comprobar que la mesa se libera bien.

- [ ] **Propina.** El Parche la tiene apagada (`propinaActiva`).
  - Encenderla con porcentaje sugerido, cobrar una mesa y ver que el monto
    aparece en el recibo y en el arqueo — no solo en la pantalla de cobro.
  - Probar también la **propina obligatoria**, que es otra opción distinta.

- [ ] **Impuestos (IVA / impoconsumo).** El Parche es no responsable y los tiene
      apagados. Un restaurante formal los necesita desde el primer día.
  - Poner impoconsumo 8% a una categoría, vender, y revisar el **desglose
    impreso**: base gravable e impuesto tienen que quedar congelados en la
    venta, no recalcularse después.

- [ ] **Créditos.** Nadie los ha usado todavía.
  - Asignar cupo a un cliente, cobrar con crédito, y comprobar la regla dura:
    **la caja debe cerrar igual**, porque el pedido queda pagado *con crédito*
    y la deuda vive en el cliente.

---

## 2. Cómo se prepara la comida

El Parche tiene **una sola área** y una impresora. Es la diferencia más grande
con un restaurante mediano.

- [ ] **Dos áreas (Cocina y Barra).** Crearlas en Configuración → Operación y
      mandar la categoría de Bebidas a Barra.
  - **Pantalla de cocina:** cada pantalla debe ver solo lo suyo. Las bebidas no
    aparecen en Cocina; los platos no aparecen en Barra.
  - **Papel:** deben salir **dos comandas**, cada una con sus ítems y su
    encabezado de área. Recién hecho el 28-ago y **sin probar con dos
    impresoras físicas**.
  - Asignar una impresora a cada área en Impresoras.

- [ ] **Tamaño por categoría** (`normal` / `pequeño` / `no mostrar`).
  - Marcar Bebidas como «pequeño» y ver que en la pantalla de **su propia
    área** sale normal — ahí es el trabajo, no un añadido.

- [ ] **Impresión automática por área.** Nuevo del 28-ago.
  - Apagarla solo en Cocina y dejarla en Barra: debe salir la comanda de barra
    y **no** la de cocina.
  - Comprobar que el botón **Imprimir** de cada pedido sigue funcionando en las
    dos, con el automático apagado.
  - Y que los ítems del área apagada **no quedan marcados como enviados** (si
    después se enciende, tienen que salir).

- [ ] **Varias impresoras.** Hoy solo hay una registrada en todo el sistema.
  - Registrar dos con nombres distintos y ver que cada comanda sale por la suya.
  - Probar también «Usar la misma impresora para todo», que es el atajo del
    restaurante pequeño.

---

## 3. Qué vende y cómo lo cobra

- [ ] **Empaque cobrado.** El Parche lo tiene configurado; conviene probar los
      modos que no usa: por porcentaje, por producto y por presentación, y el
      monto distinto para domicilio.

- [ ] **Combos.** Comprobar que en la comanda salen **los productos de adentro**
      y no solo el nombre del combo — al cocinero «Combo El Parche» no le dice
      qué preparar.

- [ ] **Etiquetas de venta rápida** (`etiquetasVR`), incluida la opción de
      **exigirlas** antes de cobrar.

- [ ] **Notas frecuentes** — las notas de un clic al tomar el pedido.

---

## 4. Cómo entrega

- [ ] **Restaurante SOLO de domicilios.** El botón «Solo vendo domicilios» de la
      puesta en marcha guarda `sin_salon`.
  - Comprobar que **la caja abre sin configurar salón**. Sin eso, un negocio de
    solo domicilios no podría trabajar nunca.
  - Y que la pantalla de ventas no se ve rota sin mesas.

- [ ] **Domiciliario externo** (una moto que rota, sin cuenta en el sistema).
  - Regla de oro: **el domicilio nunca se suma a ventas**. El externo no queda
    en ningún lado; el interno va en estadística aparte.

- [ ] **App del domiciliario, sin mapas.** El Restaurante de Prueba está a
      propósito **sin el servicio de mapas**.
  - Entrar con `andres@ricuras` y comprobar que la app funciona **completa**
    —ver pedidos, cobrar, marcar entregado— y que al tocar «Ruta» sale el
    letrero de que el servicio no está activado, no un error.

- [ ] **Tanda de varios pedidos.** Poner 2 o 3 pedidos «en camino» al mismo
      domiciliario y ver el recorrido único, numerado por orden de entrega.
      *(Necesita el servicio de mapas encendido: probarlo con El Parche o
      activarlo un rato en el de prueba.)*

---

## 5. Más de una sede, más de una marca

El Parche tiene **una sola sede**. Hay un tenant de pruebas con dos:
`Dos Sucursales SAS`.

- [ ] **Cambiar de sede** desde el selector y comprobar que **todo** cambia con
      ella: mesas, pedidos, inventario, informes y caja.
- [ ] **Inventario por sucursal** (`inventario_modo = 'sucursal'`). Hoy las
      cuatro marcas están en `global` y ese modo **nunca se ha usado**.
  - Cambiarlo y comprobar que cada sede descuenta de su propia bolsa.
  - ⚠️ Ojo aquí: en modo global la fila de existencias lleva la sede **vacía**.
    Es donde ya hubo un fallo que dejó todo marcado «Agotado».
- [ ] **Multimarca:** dos marcas en el mismo restaurante, cada una con su carta.

---

## 6. Inventario

- [ ] **Sub-inventario (Bodega / En servicio).** El Parche lo usa en bebidas;
      falta probar «vender de bodega» apagado — ahí el producto debe quedar
      agotado aunque haya en bodega.
- [ ] **Control manual** (el cocinero avisa). Un insumo así **no se agota por
      cantidad**: solo cuando alguien lo marca.
- [ ] **Merma.** Registrar una y ver que solo aparecen los insumos marcados como
      «puede tener merma».
- [ ] **Turnos de inventario** (abrir turno con cantidades, cerrar y ver el
      consumo real contra la receta).
- [ ] **Vender sin inventario apagado.** El Parche lo tiene **encendido**
      (`ventaSinInventario: true`), así que nunca se ha visto el bloqueo real.
  - Apagarlo y comprobar que un producto con insumo agotado **no se puede
    seleccionar**.
- [ ] **Insumos que no agotan el producto** (las salsas). Nuevo del 28-ago:
      comprobar que el producto se sigue vendiendo y que el insumo **sí** sale
      en el aviso de compras.

---

## 7. Planes y servicios que se venden aparte

- [ ] **Plan Starter.** El Parche está en el plan más alto. Con Starter hay que
      comprobar que lo que no incluye **no se ve** (o se ve con su aviso), y que
      nada se rompe por no tenerlo.
- [ ] **Sin el servicio de mapas.** Ya está así el Restaurante de Prueba.
- [ ] **Con llave propia de Google** (el restaurante pone su cuenta en vez de la
      de Cobra). Está construido y **nunca se ha usado**.
- [ ] **Sin WhatsApp conectado.** Un restaurante nuevo no lo tiene el primer día:
      comprobar que las pantallas no se rompen y que lo dicen con claridad.

---

## 8. Personas y permisos

- [ ] **Los cuatro roles sembrados** (cajera, mesero, cocinero, domiciliario) en
      un restaurante **recién creado**: cada uno tiene que poder abrir lo suyo
      sin que nadie le active permisos a mano.
- [ ] **PIN de administrador.** Comprobar que frena lo que debe frenar
      (descuentos, anulaciones) y que **nadie puede verlo**, ni desde el código.
- [ ] **Las tres decisiones pendientes** de la auditoría del 23-ago: los dos
      interruptores que no comprueba ninguna pantalla, las cuatro pantallas sin
      candado de entrada, y si el cocinero debe ver Inventario.

---

## 9. Un restaurante nuevo, desde cero

Esta es la prueba más importante de todas, porque es la que va a hacer el
cliente: **crear un restaurante desde el registro y llegar a vender**.

- [ ] Registro → aprobación → cuenta creada.
- [ ] La **puesta en marcha guiada** (11 pasos, 4 obligatorios).
- [ ] Importar la carta con foto, corregir lo que la IA lea mal.
- [ ] Abrir caja y hacer la primera venta.
- [ ] ⚠️ **La carpeta de su página web se crea A MANO hoy.** Es un pendiente
      conocido: duele con el segundo cliente.
- [ ] ⚠️ **Sus plantillas de WhatsApp también.** `pedido_confirmado` y
      `por_comprar_cierre_caja` viven en la cuenta de **cada restaurante**: un
      cliente nuevo no las tiene y se queda sin esos avisos hasta que se creen.

---

## 10. Facturación electrónica (DIAN)

- [ ] Sandbox de Alanube (pedido el 21-ago).
- [ ] Emitir, guardar el CUFE, y **anular con nota de crédito** — una factura
      emitida no se borra.
- [ ] Reintento de los envíos fallidos: la DIAN se cae seguido, y sin reintento
      se pierden facturas.

---

## 11. Reservas

- [ ] `aceptaReservas` encendido: tomar una, sentarla y ver que la mesa queda
      bien enlazada.

---

## Cómo dejar esto anotado

Cuando algo falle, escribir debajo del punto: **fecha, qué se hizo, qué pasó**.
Eso es lo que permite arreglarlo sin volver a provocar el problema — y es la
diferencia entre «no funciona» y un fallo que se puede buscar.
