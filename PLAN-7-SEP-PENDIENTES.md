# Lo que queda — lista de Sergio del 7-sep-2026

> La dictó él antes de irse a trabajar. **Este archivo es la lista viva**: lo
> que se haga se marca aquí, no en la memoria de una sesión.

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

**Dos cosas distintas, y la segunda es la de fondo.**

**a) Hay roles que llegan a donde no deben.** Caso suyo: entra con la cuenta de
cajero y **puede abrir Productos**. Un cajero no tiene por qué entrar ahí.
Sergio va a revisar esta noche qué más hay que esconder por rol.

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

## 2. La verificación de marca de Google
Para que la pantalla de entrar diga **Cobra POS** con su logo, en vez de
`tblujfduscslxjmrjbdr.supabase.co`. Necesita:
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
- El botón de **"cobrar por transferencia"** para Sergio — el extintor de la §1
  de ese plan.
- Que Sergio pruebe el registro completo de punta a punta.
- Al pasar a producción: cambiar las llaves de sandbox por las de verdad.

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

## 7. El botón de contacto en el Escritorio

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
