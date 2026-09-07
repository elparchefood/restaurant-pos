# Lo que queda — lista de Sergio del 7-sep-2026

> La dictó él antes de irse a trabajar. **Este archivo es la lista viva**: lo
> que se haga se marca aquí, no en la memoria de una sesión.

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

## 5. Wompi
Bloqueado en Sergio: abrir la cuenta de comercio y pasar las llaves de prueba.
El diseño entero está en `PLAN-COBRO-SUSCRIPCIONES.md`.

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
