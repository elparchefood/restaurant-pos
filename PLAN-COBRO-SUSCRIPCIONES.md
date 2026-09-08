# Cómo cobra Cobra — plan de la pasarela de pagos

> **Decidido el 7-sep-2026 con Sergio. Sin escribir una línea de código
> todavía: se implementa el día que él lo diga.**
> Este archivo es la fuente de verdad de esa decisión. Si algo aquí no cuadra
> con lo que se vaya a programar, gana lo que está escrito aquí — o se cambia
> aquí primero.

---

## 1. La decisión

**Todo por Wompi. La transferencia NO es una opción del cliente.**

| Periodo | Cómo paga |
|---|---|
| Mensual | Débito automático (Nequi, cuenta Bancolombia o tarjeta) |
| Trimestral | Débito automático |
| Anual | Pago único (no necesita recurrencia) |

### Por qué, que importa más que el qué

La primera propuesta fue ofrecer las dos cosas —débito automático o
transferencia— y dejar que el cliente escogiera. Sergio la tumbó dos veces, y
las dos tenía razón:

1. *"Si les das a escoger, la mayoría va a escoger transferencia normal, luego
   se olvidan y se salen."* — El que escoge transferencia es exactamente el
   que se va a olvidar. Dar a escoger no es neutral: es empujar al cliente
   hacia la puerta de salida.
2. *"Sea mensual o trimestral debería ser con débito automático, y el anual,
   una persona que tenga el dinero para pagar el año lo más seguro es que
   pague con tarjeta."* — El anual no necesita recurrencia: es un pago y ya.

### La transferencia sigue existiendo — como extintor

El sistema de comprobantes que YA está hecho (`verificar-pago-plataforma`, que
lee el comprobante con visión y además cruza el correo del banco en el Gmail de
Cobra) **no se toca**. Cambia dónde vive:

- En la pantalla de registro: **no aparece**. Nadie la ve, nadie la escoge.
- En el panel de Sergio: un botón *"cobrar por transferencia esta vez"*, que
  manda los datos y enciende el lector de comprobantes de siempre.

Sergio: *"El sistema que ya tenemos puede ser para emergencias."*
Es la diferencia entre una puerta de la tienda y un extintor.

---

## 2. Los avisos y los reintentos

**Se avisa ANTES, no solo después.** Es la corrección que hizo Sergio a la
primera propuesta, que solo miraba el cobro ya fallido: avisar a tiempo evita
el fallo, y evitarlo sale mucho más barato que perseguirlo.

### Antes del cobro — 1 semana, 3 días y 1 día antes

> *El 18 de agosto se cobrará tu plan. Recuerda tener el dinero en tu tarjeta
> \*\*\*0565 / en tu cuenta Nequi \*\*\*3265 / en tu cuenta Bancolombia
> \*\*\*6525.*

### Si el cobro no pasa — reintentos a 1 día, 3 días y 1 semana

Máximo una semana de reintentos. **Siempre con avisos amables.**
Sergio: *"Para que el cliente no se quede sin sistema."*

Pasada esa semana entra el modal de bloqueo que ya existe (la cuenta NO
desaparece: se bloquea y lleva al pago). Y Sergio puede cobrar por
transferencia desde su panel en cualquier momento.

### Lo que esto le exige a la integración

Tres cosas que hay que resolver AL INSCRIBIR, no después:

1. **Guardar con qué medio quedó inscrito y sus últimos 4 dígitos** — tarjeta,
   Nequi o cuenta. El aviso los dice, y un *"se te cobra el 18"* sin decir de
   dónde no le sirve a nadie. Wompi los devuelve al tokenizar; si no se
   guardan en ese momento, después no hay de dónde sacarlos.
2. **Saber la fecha exacta del próximo cobro desde el primer día**, porque los
   tres avisos se cuentan hacia atrás desde ella.
3. **El plan anual no tiene cobro automático.** Sus avisos no pueden decir
   "ten el dinero listo" sino *"se te vence, renueva aquí"*, con su botón. Es
   el mismo calendario (7, 3 y 1 día antes) pero otro texto y otra acción. Si
   no se separan, el cliente anual recibe un aviso que no le corresponde.

---

## 3. Las cuentas

Medido el 7-sep-2026 en `wompi.com/es/co/planes-tarifas`:
**2,65% + $700 + IVA por transacción exitosa.**

| Plan | Precio | Comisión aprox. |
|---|---|---|
| Starter | $149.000 | ~$5.500 |
| Pro | $249.000 | ~$8.700 |

Alrededor del **3,5% de lo facturado**. Se paga solo: un cliente Pro que dura
un año son ~$3.000.000, y la comisión de ese año ~$104.000. Evitar UNA baja
por olvido lo paga treinta veces.

---

## 4. Antes de programar nada — le toca a Sergio

1. **Abrir la cuenta de comercio** en wompi.com y pasar la validación de
   Bancolombia. Preguntar ahí: *¿hay costo de afiliación o mensualidad? ¿qué
   papeles piden?* — no se pudo confirmar, su página de tarifas no lo dice.
2. **Pedir expresamente cobro recurrente con Nequi y cuenta Bancolombia**, no
   solo con tarjeta. Ese es el punto que hace que sirva para los clientes de
   Cobra, que son restaurantes pequeños y muchos no tienen tarjeta de crédito.
3. **Pasar las cuatro llaves, las de PRUEBA primero** (`pub_test_`,
   `prv_test_`): llave pública, llave privada, secreto de eventos y secreto de
   integridad.

Con las llaves de prueba se monta y se prueba el flujo entero sin mover un peso.

> ⚠️ **Las llaves NO van en este repositorio, que es público.** Van en los
> secretos de Supabase y solo las lee la Edge Function, igual que las de
> Factus y las de Meta.

---

## 5. ✅ CONFIRMADO el 7-sep-2026 — el diseño se sostiene

**Sergio abrió la cuenta de comercio y llegó hasta el final del registro.** De
las tres cosas que estaban en el aire, dos quedaron resueltas:

**1. No hay costo de afiliación ni mensualidad.** Comprobado haciéndolo: pasó
el registro completo sin pagar nada. Solo la comisión por transacción.

**2. El cobro recurrente SÍ funciona con Nequi y con Bancolombia.** Verificado
en su documentación (`docs.wompi.co/docs/colombia/fuentes-de-pago`), no de
oídas. Es la pieza de la que dependía todo el plan: un restaurante pequeño
puede autorizar el débito sin tener tarjeta de crédito.

Las **fuentes de pago** (*payment sources*) son el mecanismo: se guarda el medio
de pago una vez y después se cobra desde el servidor sin que el cliente esté
presente. Admiten **tarjeta, Nequi, DaviPlata y Bancolombia**.

### Los endpoints, para no buscarlos después

| Para qué | Método | Camino |
|---|---|---|
| Tokenizar tarjeta | POST | `/v1/tokens` |
| Tokenizar Nequi | POST | `/v1/tokens/nequi` |
| Tokenizar DaviPlata | POST | `/v1/tokens/daviplata` |
| Crear la fuente de pago | POST | `/v1/payment_sources` |
| Cobrar | POST | `/v1/transactions` |
| Cancelar la suscripción | PUT | `/v1/payment_sources/{id}/void` |

Para crear la fuente de pago hacen falta: el token del medio de pago, el
`acceptance_token` (política de privacidad), `accept_personal_auth`
(autorización de datos personales), el correo del pagador y **la llave privada
— desde el servidor, nunca desde el navegador**.

### Lo que ya se puede hacer HOY, sin integrar nada

La cuenta trae un **enlace de cobro** que acepta tarjeta, Nequi y PSE. O sea que
al primer cliente se le puede cobrar por WhatsApp con ese enlace mientras se
construye lo demás. Es mejor camino que el sistema de comprobantes.

⚠️ El dinero recibido **queda retenido hasta que Wompi apruebe el comercio**
(dicen máximo 3 días hábiles).

## 6. ✅ PROBADO MEDIO POR MEDIO contra el sandbox (7-sep-2026)

Sergio preguntó lo correcto: yo había probado con **tarjeta**, y todo el plan
se apoya en que funcione con **Nequi y Bancolombia** — porque sus clientes son
restaurantes pequeños que muchas veces no tienen tarjeta de crédito.

| Medio | Cobro recurrente | Cómo se inscribe el cliente |
|---|---|---|
| **Tarjeta** | ✅ **Probado, APROBADO** | Formulario en nuestra pantalla |
| **Nequi** | ✅ **Probado, APROBADO** | Escribe su celular → le llega una **notificación a su app de Nequi** → aprueba |
| **DaviPlata** | ⚠️ Tokeniza | Documento + celular → le llega un **código por SMS** que hay que validar |
| **Cuenta Bancolombia** | ⚠️ Sin terminar | Wompi lo acepta como fuente de pago, pero la inscripción va por **redirección a la página del banco** — no se puede completar desde un script |

**Lo importante está probado:** Nequi funciona de punta a punta, y es el medio
que de verdad va a usar un restaurante pequeño. Se tokeniza, queda PENDIENTE
esperando que la persona apruebe en su app, y una vez aprobado se le cobra sin
que esté delante. Se cobraron $249.000 de prueba: APROBADO en 3 segundos.

**Bancolombia queda por confirmar** al montar la pantalla, porque necesita que
una persona apruebe en el banco. Que Wompi lo liste como tipo válido de fuente
de pago es buena señal, pero no es una prueba.

### Un hallazgo que solo aparece probando

**Cada medio deja su identificador en un sitio distinto.** La tarjeta devuelve
`last_four`; **Nequi no devuelve ninguno — devuelve el teléfono**. La primera
versión del código guardaba solo `last_four`, así que a quien pagara con Nequi
el aviso le habría dicho *"ten saldo en tu Nequi ***"*, con el hueco vacío. Y
eso es justo el aviso del que depende que no falle el cobro.

## 7. Lo único que queda por ver

- Cómo se ve **exactamente** la notificación de Nequi para el cliente. Sabemos
  que llega a su app y que hay que aprobarla; falta verla con ojos.
- Cerrar el flujo de **cuenta Bancolombia** con la redirección real.

Ninguna de las dos bloquea: se ven al montar la pantalla.

---

## 8. ✅ EL RELOJ, CONSTRUIDO Y PROBADO (7-sep-2026)

El calendario de la §2 ya corre solo. Es la función `wompi-reloj`, y el cron
`wompi-reloj` la despierta **una vez al día a las 14:00 UTC = 9 a.m. en
Colombia**. La hora no es un detalle: un aviso que dice *"mañana se cobra tu
plan, ten saldo en tu Nequi ····3265"* sirve si llega por la mañana y no sirve
si llega de madrugada.

Hace, en este orden: **avisa** a 7, 3 y 1 día · **cobra** el día que toca ·
**reintenta** a 1, 3 y 7 días avisando cada vez · **pausa** pasada esa semana.
La cuenta nunca se borra.

**Correrlo de más no hace daño.** Los avisos chocan contra la llave primaria de
`pos_wompi_avisos (tenant, periodo, clase)` y los cobros contra la referencia
única de `pos_wompi_cobros`. Está comprobado corriéndolo dos veces seguidas en
cada paso: la segunda vez no manda nada. Un reloj nervioso no puede convertir
un recordatorio amable en acoso.

### Lo que se probó — 19 comprobaciones, todas pasan

`scratchpad/paco/probar-reloj.py` mueve la fecha de vencimiento del Restaurante
de Prueba a 7, 3, 1 y 0 días, finge cobros fallidos con la antigüedad que haga
falta, y al terminar le devuelve su fecha de verdad. No se espera una semana:
se mueve el calendario.

Cubre que sin medio de pago inscrito no molesta a nadie; los tres avisos de
antes y que no se repiten; el cobro del día y que queda como intento 1; el
reintento a los 2 días y que sube a intento 2, con su aviso; que al día
siguiente **todavía no** reintenta; y la pausa, con el restaurante intacto.

### Dos fallos que solo aparecieron al probarlo

**1. El servidor y Colombia no viven en el mismo día.** La vista contaba los
días contra `CURRENT_DATE`, que es UTC. Colombia va cinco horas atrás, así que
todas las noches —de 7 p.m. en adelante— la base ya está en el día siguiente.
Se vio en la primera prueba: con el vencimiento a "dentro de 1 día" el reloj
**cobró** en vez de avisar. En producción eso serían dos cosas que el cliente
sí nota: el aviso llegando el día equivocado, y el cobro cayendo a las 9 de la
noche del día anterior. El día del cobro es ahora el día de Colombia, y se
arregló **en la vista** —el único sitio donde se cuentan esos días— porque
copiar el cálculo al código nos dejaría con dos relojes que se desincronizan.

**2. Un 403 que no explotaba, sino que se disfrazaba.** La vista no tenía
permiso de lectura para el servidor; PostgREST devolvió un objeto de error, el
código lo trató como si fuera la lista de restaurantes y reventó con *"susc is
not iterable"* — un mensaje que no dice nada de lo que pasaba. Es el mismo
tropiezo que ya dejó muda la traza del gerente durante semanas. Ahora se mira
`ok` y, si falla, se dice cuál era el problema.

Y uno de la misma familia, encontrado leyendo: el correo pedía `owner_nombre` a
`tenants`, donde esa columna no existe. Un `select` de una columna que no existe
no da error — devuelve la fila sin el dato, y el aviso habría salido diciendo
*"Hola"* a secas. El nombre vive en la cuenta de acceso.

### La puerta

Dispara cobros de verdad, así que se entra por una de dos y **nunca sin
ninguna**: el cron manda un secreto propio y estrecho que vive en la bóveda
(así el cron no lleva encima la llave maestra, y el `.sql` puede estar en un
repositorio público, que lo está), o una persona con la llave de servicio, para
dispararlo a mano. Comprobado: sin llave 403, con la llave pública 403, con un
secreto inventado 403.

La otra función del proyecto que usa este patrón se queda **abierta** si su
variable de entorno falta (`if (SECRETO && ...)`). Aquí no: si falta la llave,
no entra nadie.

### Los correos

Un solo tipo (`aviso_cobro`) para las siete clases, porque lo que cambia entre
ellas es el texto, no la forma — siete plantillas acaban diciendo cosas
distintas. Tres reglas, que importan más que el diseño: **la cifra y la fecha
en la primera línea** (quien lo abre en la cocina no va a leer un párrafo),
**se dice con qué medio** (por eso se guardan los últimos cuatro al inscribir),
y **nunca se amenaza**. Ni el de la pausa: dice que no ha perdido nada.

---

## 9. ⚠️ EL FALLO QUE APARECIÓ AL MIRAR A QUIÉN LE TOCA MAÑANA

Con el reloj ya funcionando quedaba una pregunta boba: *¿a quién despertaría
mañana a las 9?* La respuesta fue **a nadie** — y ahí estaba el fallo más caro
de todo el sistema de cobro:

> El restaurante nacía **sin fecha de periodo**. La vista que alimenta el reloj
> solo mira a quien tiene periodo (`where periodo_fin is not null`). O sea: el
> cliente pagaba, se le creaba la cuenta… **y no se le volvía a cobrar nunca.**

Cobra habría cobrado **una sola vez a cada restaurante, para siempre**, sin que
saltara un solo error. Todo funcionaba; simplemente no volvía a pasar nada. Es
el tipo de fallo que no se encuentra probando la función que acabas de escribir,
sino preguntándose qué va a hacer el sistema mañana.

**Arreglado en `provision approve`**, que es donde nace la cuenta: el primer
pago ya se cobró al registrarse, así que el periodo va de **hoy** a dentro de
un mes, tres o doce, según lo que escogió. De ahí en adelante el webhook corre
`periodo_fin` desde el anterior —no desde hoy— para que la fecha no se desplace
un poquito cada mes.

Se comprueba `periodo_fin` en vez de hacerlo solo al crear: si la aprobación
falló a mitad y se reintenta, el restaurante ya existe pero puede seguir sin
periodo. Y si ya lo tiene, no se toca.

**Probado por el camino real** (`scratchpad/paco/probar-periodo-nuevo.py`): se
crea una solicitud, se aprueba, y se comprueba que el restaurante queda con el
periodo correcto y que **el reloj lo ve**. 18 comprobaciones para los tres
ciclos: mensual → 30 días, trimestral → 91, anual → 365. Todo lo creado se
borra al terminar.

### Dos cosas que quedan anotadas, que no son del reloj

**1. La pantalla de onboarding crea cuentas gratis.** Quien entre con sesión y
sin restaurante llega a `onboarding.html`, que crea un tenant `starter`
`active` sin periodo y sin pagar. Hoy es el camino de las cuentas internas,
pero cualquiera que se registre con Google podría llegar ahí. **Es una decisión
de negocio, no un error: no se tocó.**

**2. Un restaurante no se puede borrar.** El disparador
`trg_no_borrar_rol_sistema` impide eliminar el rol "Administrador", y al borrar
un tenant se arrastra en cascada — así que la eliminación falla entera. Se ve
al limpiar datos de prueba, pero importará de verdad el día del **borrado a los
6 meses sin pagar**, que hoy no podría ejecutarse.
