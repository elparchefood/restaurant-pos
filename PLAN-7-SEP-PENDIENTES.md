# Lo que queda — lista de Sergio del 7-sep-2026

> La dictó él antes de irse a trabajar. **Este archivo es la lista viva**: lo
> que se haga se marca aquí, no en la memoria de una sesión.

---

## ✅ HECHO 9-sep: la carta, probada todo el día con Sergio

Probada de punta a punta y ampliada: dirección dentro de la carta, puntos que
reclaman productos, prepago para recoger, y **pago y recarga con la Billetera
sin salir de la página** (Bre-B, código por SMS, pase de recarga). Detalle en
`ESTADO-SISTEMA.md`, sección "LA CARTA WEB — PAGO Y RECARGA CON BILLETERA".

Los pedidos, la caja y el inventario de la prueba se borraron el 9-sep por la
noche con `herramientas/borrar-pruebas.py`; copia en Descargas.

---

## 🗳️ DECISIONES DE SERGIO QUE QUEDARON DEL 9-sep

1. **Su saldo quedó en $636.000, no en $581.000.** Tenía $581.000 antes de las
   pruebas e hizo una recarga REAL de $50.000 (+$5.000 de bono) que el sistema
   cruzó contra el banco; esa no se borró. Si prefiere $581.000, se ajusta.
2. **Dos fichas de clientes con la dirección dañada** por el bug de "para
   recoger" (ya corregido): *Anyi Benavides* → "Apenas este lista / La recojo
   vivo en bella vista", y *José Manuel* → "Yo paso por ella". No se tocan sin
   que él lo diga: son clientes reales.
3. **La frase "Pedido listo para recoger"** está configurada en Mensajes y nada
   la envía (la auditoría del 20-jul ya la tenía fichada). `aviso_despacho`
   estaba igual y ya se envía desde el 9-sep.

---

## 8. Que la gente sepa que existen las recargas

De El Parche, no de Cobra. **0 recargas de clientes reales**, y nadie ha
preguntado nunca cómo funciona — o sea que no es que la rechacen, es que no
existe para ellos. Sergio: *"primero la estrategia de comunicación; si después
escucho quejas de que el porcentaje es poco, ahí ya es la señal para subirlo"*.

**⏰ RECORDARLE A SERGIO:** dedicarle un rato a armar la estrategia de marketing
completa. Él tiene cuatro canales —el chat, las plantillas de WhatsApp, los SMS
de Twilio y las notificaciones de la app— y quiere hacerla bien, no a medias.
No se hace hasta que él diga.

Lo que ya está pensado, con los datos medidos, los momentos y qué NO hacer:
**`PLAN-COMUNICAR-RECARGAS.md`**. No toca ningún número.

Y lo primero de esa sesión: preguntarle **qué dijo y cómo** en la campaña que
logró las 63 instalaciones de la app. Esa forma ya funcionó.

---

## 0. La demo de Cobra - EN PARALELO, no bloquea nada

Decidido el 8-sep: Cobra **se lanza con el registro que ya esta probado**, y
la demo ("entra y miralo por dentro", con pago desde dentro) se construye
mientras Sergio hace contenido y trae trafico. Cuando este, se implementa; no
se espera a tenerla para lanzar.

Todo el diseno -los limites, los costos y la prueba A/B de la landing- esta en
**`PLAN-SANDBOX-DEMO.md`**.

---

## 0-bis. Pedir tocando el menu, no escribiendolo - IDEA ANOTADA

Idea de Sergio del 8-sep: Paco contesta con un boton "Ver el menu" que abre
una pagina pequena, sin registro, colgada de la conversacion. El cliente
escoge productos y como paga, y Paco recibe el pedido exacto en vez de
deducirlo de una frase. **No mejora la lectura: la elimina.**

Tampoco bloquea nada. El diseno, lo que hay que decidir y las trampas estan
en **`PLAN-PEDIR-DESDE-EL-MENU.md`**.

---

## 1. Permisos y PIN 🔴 EL MÁS IMPORTANTE

> **A ✅ HECHO el 9-sep** (commit `9a1c535`): el PIN se pide ANTES de navegar,
> y la lista de qué pide cada pantalla vive en un solo sitio. **B sigue
> pendiente** — y es el candado de verdad.
>
> **B: PLAN ESCRITO el 10-sep, esperando que Sergio lo apruebe** →
> **`PLAN-CANDADO-SERVIDOR.md`**. Lo medido cambió el diseño: la función que
> parecía lista (`permisos_en_sucursal`) solo reconoce a 1 cuenta, y varias
> pantallas del cajero escriben en tablas "de administrador". Va por fases, con
> una semana en modo vigilancia antes de negar nada.

**Dos cosas distintas, y la segunda es la de fondo.**

**a) Hay roles que llegan a donde no deben.** Caso suyo: entra con la cuenta de
cajero y **puede abrir Productos**. Un cajero no tiene por qué entrar ahí.
Sergio va a revisar esta noche qué más hay que esconder por rol.

> **La revisión rol por rol, pantalla por pantalla (empezó el 10-sep):**
> - ✅ **Clientes** — el cajero ve los puntos, el saldo y lo que pidió cada
>   cliente, **con la plata tapada por un ojito** (corregido el mismo día: al
>   principio se quitaron bloques enteros y Sergio pidió que la pantalla quede
>   igual; con el PIN de administrador se ven los valores). Permiso nuevo `clientes.gasto` (el Administrador
>   lo trae marcado; se le puede quitar). Lo decide el servidor. De paso se
>   cerró el hueco de que cualquiera pedía el resumen de otro restaurante.
>   Detalle en `ESTADO-SISTEMA.md`.
> - ✅ **Productos** — el Cajero ya no entra por defecto (se le quitó
>   `catalogo.ver`, que solo abre esa pestaña; para vender no hace falta). Se
>   le puede activar con la casilla "Entrar a Productos". El mismo día
>   también se les quitó al Mesero, Cocinero y Domiciliario: hoy solo lo tiene
>   el Administrador.
> - ✅ **Informes** — permiso propio `informes.ver`, estricto: **nadie** lo
>   trae de fábrica, ni el Administrador; el dueño siempre. Antes se abría con
>   "Ver ventas", el mismo de Historial y Clientes.
> - ✅ **El PIN antes de entrar, desde cualquier botón** — el desplegable de
>   arriba a la derecha (y los demás caminos a Configuración) navegaban directo
>   y el PIN salía adentro. Ahora pasan por `posIr`, y al acertarlo la pantalla
>   ya no lo pide dos veces. Y los 9 botones del flujo de venta (Caja,
>   Domicilios, Historial, Reservas, Chat) también: ya no queda ninguno directo.
> - ✅ **El Escritorio por bloques** — "Entrar al Escritorio" solo abre la
>   pantalla; lo que se ve va por 5 casillas (ventas, desglose de pagos,
>   actividad, inventario, clientes). El Administrador las trae; los demás
>   ninguna. Aparte quedaron anotados dos permisos sueltos (precio del
>   domicilio desde la campana, y "Solo vendo domicilios").
> - ✅ **Historial** — la pantalla queda igual; cada valor en dinero con un
>   ojito (permiso "Ver cuánto vende el negocio"); con el PIN se ven. Quedan
>   sin tocar, a pedido de Sergio: el descuento que sale "Sin descuento", el
>   rango de 7 días y anular facturas electrónicas sin permiso.

**b) El PIN llega TARDE.** Hoy: se toca Inventario → la pantalla se abre → y
*encima* aparece el PIN. Sergio: *"debería pedirle el PIN antes de navegar a la
pantalla para que ni siquiera el sistema la abra sin PIN"*.

Y tiene razón de fondo, no solo de forma: si la pantalla llega a abrirse, ya
cargó sus datos. El PIN encima es una cortina, no un candado — se quita con la
consola del navegador y los datos ya están dentro. Preguntarlo ANTES es la
diferencia entre esconder y no dejar entrar.

---

### 🔴 MEDIDO el 8-sep: es más grande de lo que decía esta nota

Se fue a mirar la base antes de mover el PIN, y el resultado cambia el tamaño
del trabajo:

> **De las 143 políticas de seguridad de la base, UNA sola mira el rol** — y es
> de `pos_diag`, una tabla de diagnóstico. Todas las demás aíslan por
> **restaurante**: comprueban que seas de ese restaurante, no QUÉ eres dentro
> de él.

O sea que un cajero, con su sesión normal y sin ningún truco, puede leer y
escribir `pos_products`, `iv_insumos`, `pos_orders` y `pos_customers` igual que
el dueño. Esconder el botón y poner el PIN encima cambia lo que **ve**, no lo
que **puede**. El problema no está en la consola del navegador: está en que el
servidor nunca dice que no.

**Así que esto son dos trabajos de tamaño muy distinto:**

**A. Pedir el PIN ANTES de navegar** (lo que pidió Sergio). Seguro, se nota de
inmediato: el cajero deja de entrar por accidente y la pantalla ya no carga
datos que no debería enseñar. Hace falta que la barra sepa qué permiso pide cada
pantalla — y esa lista hoy está repartida en **11 archivos HTML**
(`posRequirePin(...)` al final de cada uno). Hay que juntarla en **un solo
sitio** que usen la barra y la página, o se desincronizan como ya pasó con los
precios.

**B. Que el SERVIDOR diga que no.** El candado de verdad, y es trabajo aparte:
tocar políticas con el restaurante funcionando es exactamente cómo se deja al
personal encerrado fuera del sistema en mitad de un servicio. Se planea, se
prueba con una cuenta de CADA rol, y se sube por partes. **Se le enseña el plan
a Sergio antes de tocar nada:** ahí el riesgo no es que no funcione, es que
funcione de más y el cajero no pueda cobrar un sábado por la noche.

---

## 2. La verificación de marca de Google — ✅ HECHA el 10-sep-2026
Verificada y PUBLICADA ("se muestra a los usuarios"), aprobada al instante.
Lo que hizo falta: (1) la politica de privacidad no hablaba de "Entrar con
Google" — se agrego la seccion (datos basicos, uso limitado, como revocar);
(2) el login enlazaba terminos y privacidad a "#"; (3) Search Console con
creatorspremium (propiedad **Dominio** `cobrapos.app`) + TXT
`google-site-verification=ViipTE2k…RBYxw` en Porkbun. ⚠️ **Ese TXT no se
borra nunca**: sin el se pierde la verificacion. El correo de asistencia
quedo en creatorspremium.co@gmail.com (Google solo deja la cuenta propia o
un grupo); contacto del desarrollador: sergio@cobrapos.app.

Lo que se pedia originalmente:
- Search Console con la MISMA cuenta (`creatorspremium.co@gmail.com`)
- un registro TXT en Porkbun
- y mandar la marca a revisión

⚠️ Antes conviene cambiar el correo de asistencia por uno del dominio de Cobra,
o habrá que pasar revisión dos veces.

---

## 3. Terminar la landing
1. **El número de WhatsApp de ventas** — 4 botones con `href="#"`, incluido el
   flotante. Es el botón principal y hoy no hace nada. **Media hora, y es lo
   que bloquea el contenido orgánico**: generar interés sin puerta de entrada
   es perderlo.
2. La sección de **Puntos y premios** (las fotos y el CSS ya están en el repo).
3. El **video**.
4. **El móvil**, al final, como decidió él.

---

## 4. Un Chat IA para Cobra, dentro de la consola de plataforma
Una réplica pequeña del Chat IA, **solo para Sergio**, donde conectar Facebook,
Instagram y WhatsApp **de Cobra** (no de El Parche) y contestarle a los
interesados. Con su propio asistente virtual, **distinto de Paco**: este vende
el sistema, no comida.

*(Sin empezar: hay que decidir qué cuentas se conectan y qué dice el asistente.)*

---

## 5. Wompi — ✅ HECHO el 7-sep, salvo el botón de emergencia

Ya está todo el ciclo: la pantalla de autorización (Nequi con su logo oficial,
tarjeta, Bancolombia, DaviPlata), enganchada al registro; el cobro; y **el
reloj**, que corre solo a las 9 de la mañana de Colombia — avisa a 7, 3 y 1
día, cobra el día que toca, reintenta a 1, 3 y 7 días avisando cada vez, y
pasada esa semana pausa la cuenta sin borrarla. 19 comprobaciones.

Todo el detalle, y los tres fallos que solo aparecieron al probarlo, en
`PLAN-COBRO-SUSCRIPCIONES.md` §8 y §9.

**Lo que queda:**
- ~~El botón de **"cobrar por transferencia"** para Sergio — el extintor de la §1
  de ese plan.~~ ✅ **Hecho el 11-sep-2026** para los tres casos (suspendida,
  al día y cliente nuevo). Detalle en ESTADO-SISTEMA.md, "El extintor".
- Que Sergio pruebe el registro completo de punta a punta.
- ~~Al pasar a producción: cambiar las llaves de sandbox por las de verdad.~~
  ✅ **Hecho el 11-sep-2026**: llaves `_PROD` puestas por Sergio y
  `WOMPI_MODO = produccion`. Las de prueba quedan apartadas (`_TEST`), no se
  borraron. Detalle y la advertencia de volver a pruebas en ESTADO-SISTEMA.md.

**Anotado de paso, no es del reloj** (§9 de ese plan): la pantalla de
onboarding crea cuentas gratis sin periodo —decisión de negocio, no se tocó— y
**un restaurante hoy no se puede borrar**, porque el guardián del rol
"Administrador" bloquea la cascada. Eso último importará el día del borrado a
los 6 meses sin pagar.

---

## 5-bis. 🔴 BUG: el aviso de lo que falta por comprar no le llega al gerente

Reportado por Sergio el 8-sep, para mirarlo mañana: **el mensaje del cierre de
caja con lo que falta por comprar no está llegando a los números de los
gerentes.**

No se ha diagnosticado todavía. Lo que hay que comprobar, en este orden —y
midiendo, no deduciendo—:

1. **¿Se está intentando enviar siquiera?** Buscar el rastro en los registros:
   si no hay ni intento, el problema está antes (no se dispara, o la lista de
   destinatarios sale vacía).
2. **¿De dónde salen los números del gerente?** Es candidato de primera: un
   `select` sin la columna no da error, devuelve la fila sin el dato — ya pasó
   en cinco sitios el mismo día. Y si se filtra sin sede, puede traer los de
   otra.
3. **¿Se envía y se pierde?** Entonces es saldo de SMS, plantilla de WhatsApp
   no aprobada, o número mal formateado (indicativo).
4. **¿Y falla callado?** Si el envío devuelve un 4xx que nadie mira, no salta
   ningún error. Es el fallo de la casa: `res.ok` sin comprobar.

⚠️ Y una vez arreglado, **comprobarlo por el camino de Sergio** —cerrando una
caja de verdad y mirando si llega el mensaje—, no por el panel.

### ✅ DIAGNOSTICADO Y CORREGIDO el 10-sep (commit `808dbe6`)

Todo lo de DENTRO estaba bien (medido): sede y números en la configuración,
41 insumos encontrados, WhatsApp de la sede encontrado, plantilla APROBADA,
función publicada igual al repo. Lo roto era que **nadie podía saber qué pasó**:

1. **El cierre tapaba su propio aviso**: el motivo lo reemplazaba al instante
   "Caja cerrada correctamente". Ahora va dentro de la ventana del cierre y,
   si no salió, se queda hasta que el cajero toque "Entendido".
2. **La función no dejaba rastro.** Ahora cada intento queda en `pos_diag`
   (`donde = 'aviso-insumos'`), con lo que contestó Meta número por número.
3. **El webhook botaba TODOS los "no se entregó"** de Meta
   (`if (!messages.length) continue;`). Ahora quedan en `pos_diag`
   (`donde = 'meta/no-entregado'`) y el chat los marca como fallidos.

**Falta:** el primer cierre de caja real. La ventana va a decir qué pasó, y si
algo falla, `pos_diag` dirá exactamente por qué.

---

## 6. Un solo programita de instalación

Hoy el cliente tendría que bajar cuatro cosas por separado. Sergio lo quiere
así: **un programa pequeñito con el logo de Cobra**. Doble clic y **crea una
carpeta** con todo dentro:

- el instalador de Cobra para computador
- la APK de cocina
- la APK de toma de pedidos
- la APK del domiciliario
- un PDF con las instrucciones

**Y la razón de fondo, que es la buena:** el programita **no lleva los archivos
dentro, los baja de la nube**. Así, cuando se actualice una APK, se cambia en
un solo sitio y todos los que descarguen después reciben la nueva — sin
reenviarle nada a nadie ni volver a publicar el programita.

---

## 7. El botón de contacto en el Escritorio — ✅ HECHO el 10-sep-2026

Agendador PROPIO, sin Calendly (Sergio lo prefirio; se le explico que lo
unico que Calendly haria de mas es leer su Google Calendar). Decidido con el:
**videollamada de Google Meet** (una sala fija suya), **30 min**, aviso por
**correo** a sergio@cobrapos.app + seccion **Videollamadas** en la consola, y
**"Escribir ahora" quitado** hasta la bandeja de Cobra (punto 4). Pidio el
**calendario del mes** en vez de pestañas de fechas.

- Escritorio: `soporte-llamada.js` (bloque "¿Necesitas ayuda?" + ventana con
  calendario y horas). Consola: `admin-llamadas.js` (proximas, anteriores,
  "Tu agenda": sala de Meet, correo, duracion, anticipacion, dias adelante,
  horario por dia, dias sin atencion).
- Servidor: Edge Function `soporte-llamadas` (huecos · mia · agendar ·
  cancelar · lista · marcar · config · guardar_config). Tablas
  `plataforma_agenda` (1 fila) y `plataforma_llamadas` (indice unico por hora
  agendada). Colombia UTC-5. Un restaurante = una cita activa a la vez.
- ⏳ Falta que Sergio cree su sala fija de Meet y la pegue en la consola.

Lo que se habia anotado:

Un botón en el tablero para que **un cliente con un problema pueda hablar con
Sergio**. Desde ahí se agenda una llamada.

- **Primera versión:** Calendly.
- **Como lo quiere de verdad:** *"mucho mejor si el agendamiento se hace dentro
  de cobra"* — o sea, su propio agendador, sin mandar al cliente a otra página.

**Por qué importa más de lo que parece:** hoy un restaurante que se queda
atascado no tiene por dónde escribir. Y el momento en que un cliente tiene un
problema es exactamente el momento en que decide si sigue pagando o no.

*(Ojo al diseñarlo: el soporte de verdad no es solo una llamada agendada. Un
cajero atascado a las 9 p.m. no agenda nada para el martes. Esto se conecta con
el punto 4 — la bandeja de WhatsApp de Cobra — y conviene pensarlos juntos.)*
