# Lo que falta para que Cobra le sirva a CUALQUIER restaurante

> Auditoría del 18-ago-2026 sobre el código real (92 archivos del front, 19
> funciones del servidor y la base). Sergio va a lanzar pronto y la regla es:
> nada hardcodeado, salvo lo que sirve en cualquier restaurante (reconocer
> direcciones, si es para llevar o a domicilio, etc.).

## Ya es global (verificado, no volver a revisarlo)

Productos, adiciones y categorías salen del catálogo de cada restaurante ·
coordenadas del local, saludo, nombre del asistente, niveles de cliente,
recargas y bonos son configurables · la página de clientes es multi-restaurante
por `slug` (la app es una sola y mejora para todos a la vez) · "salchipapa" ya
salió de `INTENCION_PEDIDO_RE` y `NUEVA_ORDEN_RE` · las adiciones ya se derivan
del catálogo (`DYN_ADICION_KEYWORDS`).

## 1. Lo ve el primer día — ANTES DE LANZAR

### 1.1 Las frases sembradas hablan de la carta de El Parche
`chat-ia.js` → `DEFAULT_QUICK_REPLIES` (~línea 2094). Un restaurante nuevo
estrena su chat con: *"¿deseas adicionar alguna bebida, salchicha ranchera,
súper queso o alguna de nuestras salsas especiales (maíz o chédar)?"*, *"¿La
deseas con pollo, carne o mixta?"*, *"¿La deseas con chorizo o tocineta?"*.
Las direcciones y la cuenta ya se limpiaron; quedó el lenguaje del menú.
**Arreglo:** dejar solo frases neutras, y las de menú generarlas del catálogo
(o no sembrarlas).

### 1.2 El emoji 🍟 está en el código, no en la configuración
17 mensajes por defecto de `delay-reply`, **cada línea del resumen del pedido**
(`index.ts` ~6891: `productoLines.push("🍟 " + ...)`) y el pie del recibo
(`pos-print.js:194`). Un asadero manda papas fritas en cada pedido.
**Arreglo:** emoji por categoría del producto (o uno que el dueño elige en
Configuración), con un neutro por defecto.

### 1.3 La regla de puntos está quemada en 4 sitios
"1 punto por cada $1.000" vive en:
- `award_loyalty_points` (disparador de la base): `pts := floor(food / 1000.0)`
- `pos-print.js:383` `PUNTOS_POR_MIL = 1000`
- `chat-ia.js:3349` `Math.floor(prod / 1000)`
- `pagos.js:1912` `Math.floor(base / 1000)`
Los niveles (`pos_niveles_config`) y las recargas (`pos_recarga_config`) SÍ son
configurables; los puntos no. **Arreglo:** una sola configuración por tenant
(pesos por punto) que lean los cuatro. Cuidado: cambiarla a mano en 4 sitios se
desincroniza — es el mismo error de forma de siempre.

### 1.4 El lector de comprobantes lleva la cuenta vieja como ejemplo
`supabase/functions/verificar-pago-manual/index.ts:220`: *"a la llave
Bancolombia 0089912015 de El Parche Food"* dentro de la instrucción del modelo.
**Arreglo:** ejemplo genérico, o la llave configurada del propio restaurante.

### ✅ HECHO 19-ago — el fondo del mensaje ya no es el vino tinto de El Parche
Entrada 216. `tenants.web_banner`: color, degradado o imagen propia con velo,
configurable desde "Mi página web". **No volver a listarlo.**

## 2. Limita a qué restaurantes les sirve bien

### 2.1 El motor solo conoce 7 tipos de comida
`CAT_SINONIMOS` (delay-reply ~219): hamburguesa, perro, sándwich, salchipapa,
bebida, pizza, taco. Y `CAT_PEGADA_RE` (~2692) repite una lista parecida.
Con eso desambigua ("la *hamburguesa* especial" vs "el *perro* especial"). Un
asadero, un sushi, comida china o una panadería no tienen esa ayuda.
**Arreglo:** derivar del catálogo + una lista de sinónimos por restaurante
("bandeja", "corrientazo", "rollo", "porción").

### 2.2 Los ejemplos del prompt del clasificador son de la carta de El Parche
delay-reply ~1193-1205: "una ranchera CON super queso", "la premium con
maicitos". El modelo generaliza, pero armar los ejemplos con 2-3 productos del
catálogo propio quita el sesgo y es barato.

## 3. Decisiones, no errores

- **Colombia quemado**: indicativo `57` en 6 normalizaciones de teléfono,
  formato `es-CO`/COP en 32 archivos, hora fija UTC-5 en `aviso-puntos`. Si solo
  se vende en Colombia, no se toca.
- **Alta de un restaurante = un paso manual**: su página necesita una carpeta
  con `index.html` + `sw.js` que llevan el `slug` adentro (ver `elparchefood/`).
  Debería crearla el alta (`provision`) sola. Duele con el segundo cliente.
- **La cuenta de cobro de Cobra (`0092571225`)** escrita en `login.html:216` y
  `register.js:204`. Es de la plataforma, pero debería ser configuración.
- **"Paco"** como nombre por defecto del asistente (`delay-reply:6356`). Es solo
  el respaldo cuando el dueño no lo nombró; convendría un neutro.

## Orden recomendado (aprobado como plan, 18-ago)

1. 1.1, 1.2, 1.3 → antes de lanzar.
2. 1.4 y 2.2 → de una vez, son minutos.
3. 2.1 → con el primer cliente que no venda salchipapas: ahí se sabe qué
   palabras necesita de verdad.
4. Alta automática de la carpeta → con el segundo cliente.

## Aviso del saldo de SMS — va a TODOS los que tengan la pagina encendida

`revisar-saldo-sms` le pone el aviso de saldo bajo a **todos** los tenants con
`web_activa = true`. La cuenta de Twilio es **una sola para toda la plataforma**
(las credenciales son secretos del proyecto, no de cada restaurante), asi que
ese saldo es de Sergio, no del restaurante que lo lea.

Hoy no molesta: solo El Parche tiene la pagina encendida. **El dia que se le
encienda a otro restaurante, le saldria un aviso sobre un saldo que no es suyo.**

Arreglo: un secreto `TENANT_PLATAFORMA` con el id del dueNo de la plataforma y
avisar solo a ese. No se hardcodea el id en el repo — es publico. Si el secreto
no esta puesto, no se escribe ningun aviso (que falle callado es mejor que
avisarle al que no es).

Decidido asi con Sergio el 19-ago: por ahora no piensa vender la pagina de
clientes, y prefiere dejarlo simple.
