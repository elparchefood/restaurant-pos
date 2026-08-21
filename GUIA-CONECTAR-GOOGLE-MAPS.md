# Conectar Google Maps — paso a paso

> **⚠️ ESTO YA NO HACE FALTA para el restaurante normal.**
> Desde el 21-ago-2026 Cobra trae **su propia cuenta de Google** y los mapas
> funcionan solos, sin que el dueño haga ningún trámite. El costo va dentro del
> plan.
>
> Esta guía queda para el caso opcional: el restaurante que maneje mucho volumen
> y prefiera que ese gasto vaya a **su** cuenta y no al plan. En el producto sale
> como *"Prefiero usar mi propia cuenta de Google"*, en Configuración › Domicilios.

> Esto lo hace **cada restaurante con su propia cuenta y su propia tarjeta**.
> Cobra no cobra nada por el mapa y tampoco paga el de nadie.
> El mismo paso a paso está dentro del producto, en **Configuración › Domicilios**.

---

## Antes de empezar: ¿esto me va a costar plata?

**Casi con seguridad, no.** Google regala **10.000 consultas de cada tipo al
mes**, y Cobra está hecho para gastar lo mínimo posible:

- A una dirección se le pregunta **una sola vez en la vida**. La respuesta queda
  guardada. Un restaurante reparte a las mismas casas todos los días.
- La imagen del mapa se pide **una vez y se guarda un día** en cada equipo.
- Cuando el domiciliario se mueve, **no se le pide nada a Google**: Cobra dibuja
  el punto encima de la imagen que ya tiene. Puede moverse mil veces y no cuesta
  ni una consulta.
- Y Cobra **se frena solo** en 9.000 (lo puedes cambiar), antes de llegar a las
  10.000 gratis.

Para que un restaurante llegue al tope tendría que recibir unos **300 pedidos
diarios a direcciones nuevas**, todos los días del mes.

⚠️ **Los precios de Google cambian.** En marzo de 2025 quitaron el crédito de
200 USD/mes que llevaba años, y ahora cada API tiene su propio cupo que **no se
comparte con las otras**. Verificado el 21-ago-2026:

| Lo que Cobra usa | Gratis al mes | Después |
|---|---|---|
| Geocoding API (dirección → punto) | 10.000 | 5 USD por 1.000 |
| Maps Static API (la imagen) | 10.000 | 2 USD por 1.000 |

---

## Los 7 pasos

### 1. Crea el proyecto
Entra a **[console.cloud.google.com](https://console.cloud.google.com/)** con tu
cuenta de Gmail. Arriba a la izquierda, donde dice el nombre del proyecto, pulsa
y luego **Proyecto nuevo**. Ponle el nombre de tu restaurante.

### 2. Activa la facturación
En el menú busca **Facturación** y agrega tu tarjeta.

Google la pide aunque no vayas a pagar nada — es su forma de verificar que eres
real. Sin esto, todas las consultas salen rechazadas.

### 3. Activa las dos APIs
Ve a **APIs y servicios › Biblioteca** y activa estas dos, una por una:

- **Geocoding API**
- **Maps Static API**

*(Solo esas dos. Cobra no usa ninguna más, y cada API activada de más es una
puerta abierta.)*

### 4. Crea la clave
En **APIs y servicios › Credenciales**, pulsa **Crear credenciales › Clave de
API**. Te muestra un texto largo que empieza por `AIza`. Cópialo.

### 5. Protégela — lo más importante
Entra a la clave recién creada:

- En **Restricciones de API**: escoge **Restringir clave** y marca **solo**
  Geocoding API y Maps Static API.
- En **Restricciones de aplicación**: deja **Ninguna**.

> ⚠️ **Ojo con la segunda.** Cobra le pregunta a Google **desde su servidor**, no
> desde tu navegador. Si le pones restricción por sitio web o por IP, Google va a
> rechazar todo y el mapa no va a cargar nunca. La protección real es la
> restricción por API del punto anterior, más el tope del punto 6.

### 6. Ponle un tope también del lado de Google
En **APIs y servicios › Cuotas** puedes limitar cuántas consultas permite al día.

Cobra ya se frena solo, pero cuando hay una tarjeta de por medio, un segundo
cerrojo no sobra. Con 300 al día vas sobrado.

### 7. Pégala en Cobra
**Configuración › Domicilios › Mapas y seguimiento**, pega la clave y pulsa
**Conectar**.

Cobra la **prueba en el momento**. Si algo quedó mal, te lo dice enseguida y no
tres días después cuando un mapa no cargue.

---

## Qué pasa con tu clave

- **Nunca baja a tu navegador.** Se guarda **cifrada** en el servidor y solo la
  usa el intermediario de Cobra. Ni siquiera con la sesión abierta se puede leer
  desde el navegador: está comprobado.
- En pantalla solo ves **los últimos 4 caracteres**, para que reconozcas cuál
  pusiste.
- Puedes **desconectarla** cuando quieras, desde la misma pantalla.

Esto no es exageración: si la clave se filtra, **el consumo te lo cobran a ti**,
no a Cobra. Por eso no se hace de la forma fácil (ponerla en la página) sino de
la forma correcta.

---

## Si algo sale mal

| Lo que dice | Qué pasó |
|---|---|
| *"Google rechazó la clave"* | Falta activar alguna de las dos APIs, o le pusiste restricción por sitio web (paso 5). |
| *"Esa clave ya se pasó del cupo, o la cuenta no tiene facturación activa"* | Falta el paso 2. |
| *"La clave se copió incompleta"* | Se cortó al copiar. Cópiala otra vez completa. |
| *"Esa no parece una clave de Google"* | Son unas 39 letras y números seguidos, sin espacios, empezando por `AIza`. |

---

## De dónde salen los puntos del mapa

Google **no** es la única fuente, ni la principal:

1. **El domiciliario al entregar.** Su celular está parado en la puerta del
   cliente. Es gratis, es el más exacto de todos, y se acumula solo con el uso.
2. **La ubicación que manda el cliente por WhatsApp.** También gratis.
3. **Google**, solo para las direcciones que nadie ha visitado todavía.

Cobra respeta ese orden: **un punto calculado por Google nunca pisa uno que puso
una persona que estaba parada ahí.**

Por eso el mapa **mejora solo** con el uso, y el gasto en Google **baja** con el
tiempo en vez de subir.
