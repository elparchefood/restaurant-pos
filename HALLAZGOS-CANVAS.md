# Hallazgos del canvas — puliendo con Sergio

Cosas verificadas mientras Sergio revisa el canvas de El Parche. **Anotadas, no
corregidas todavía.**

---

## 1. La frase del nodo "Ver menu" nunca se usa `2026-08-12`

**Lo que Sergio vio:** configuró una frase para el envío del menú
(*"Aquí te mando nuestra carta 😋 {{menu_imagen}}"*) y Paco nunca la dice.
Siempre usa la que está configurada donde viven las imágenes de la carta.

**Verificado:** el nodo se llama `Ver menu`, es de tipo **Frase fija** y **no
captura ningún dato** (`campo` vacío).

Al guardar el canvas, un nodo de mensaje solo llega al motor si cae en uno de
estos cuatro sitios:

| Destino | Condición |
|---|---|
| `flujo_saludo` | ser el **primer** mensaje después de Inicio |
| `flujo_extras.cierre` | colgar de la salida 1 del Resumen |
| `flujo_extras.comprobante` | colgar de la salida 2 del Resumen |
| `flujo_envio` | tener el rol de aviso de envío |

**"Ver menu" no es ninguno de los cuatro, así que se descarta al guardar.**

**De dónde sale la frase que sí dice.** El motor busca en este orden:

1. `flujo_extras.carta` — el nodo **"Evento: Pide la carta"** → **no existe en
   su canvas** (verificado: no hay ningún nodo de ese tipo)
2. `menu_frase` — la que está junto a las imágenes de la carta → **es la que
   está usando** (22 caracteres, tipo fija)
3. `frases.apertura`
4. Un texto por defecto

**Arreglo posible (a decidir):** que el nodo "Evento: Pide la carta" sea el que
lleve esa frase — es el que el motor sí lee. O que un nodo Frase fija suelto
avise al guardar de que no se va a usar, en vez de descartarse en silencio.

---

## 2. De 13 cajas en el canvas, solo 6 llegan al motor `2026-08-12`

| Caja | Tipo | ¿Llega? |
|---|---|---|
| Preguntar tamaño | Pregunta | ✅ `tamano` |
| Preguntar tipo | Pregunta | ✅ `tipo` |
| Upsell / adiciones | IA | ✅ `adiciones` |
| Pedir dirección | Pregunta | ✅ `direccion` |
| Pedir nombre | Pregunta | ✅ `nombre` |
| Método de pago | Pregunta | ✅ `pago` |
| Saludo | IA | ✅ como bienvenida |
| Resumen del pedido | Resumen | ✅ como frase de resumen |
| Inicio | Inicio | marca por dónde empieza |
| **Ver menu** | Frase fija | ❌ **se descarta** |
| **¿Otro producto?** | IA | ❌ **se descarta** |
| **Producto detectado** | IA | ❌ **se descarta** |
| **Esperar comprobante** | Frase fija | ⚠️ solo si cuelga de la salida 2 del Resumen |

**Lo más llamativo: NO existe el paso "Qué va a pedir".** El nodo *"Producto
detectado"* es IA conversacional sin variable, así que no se convierte en paso.
Que el producto se capture igual es mérito de la mecánica del motor, no de una
caja configurada — y eso significa que **sus opciones (mostrar la carta en ese
paso, confirmar la cantidad) no se están aplicando**, porque el paso no existe.

---

## 3. La caja de la variante pregunta opciones que no existen `2026-08-12`

**Lo que Sergio vio:** la caja *Preguntar tipo* está en **Frase fija** con el
texto *"¿La prefieres mixta, de carne o de pollo? 🍟"*. ¿Y si piden un Súper
Queso?

**Verificado — las variantes reales de cada producto:**

| Producto | Sus variantes | ¿La frase sirve? |
|---|---|---|
| Premium | Mixta, Carne, Pollo | ✅ |
| Maicitos Especial | Mixta, Pollo, Carne | ✅ |
| **SÚPER QUESO** | **Carne, Pollo, Chorizo, Tocineta** | ❌ le ofrece *Mixta* (no existe) y le esconde *Chorizo* y *Tocineta* |
| **HIT** | Mango, Mora, Frutos tropicales, Naranja piña, Lulo | ❌ le pregunta *"¿mixta, de carne o de pollo?"* a un jugo |
| **POSTOBÓN 1.5 L** | Uva, Manzana, Colombiana | ❌ igual |

**3 de 5 productos con variantes reciben una pregunta equivocada.** En el Súper
Queso es doble daño: ofrece algo que no se vende y oculta dos opciones que sí.

**La solución ya existe y está en el propio panel:** la variable
`{{variantes_producto}}`, que el motor reemplaza por **las opciones reales del
producto que el cliente está pidiendo** (verificado en el código: resuelve
contra el catálogo, con coincidencia flexible del nombre).

Bastaría con que la frase dijera *"¿La prefieres {{variantes_producto}}? 🍟"*.

**La caja de Presentación tiene el mismo problema** (verificado: ninguna de las
dos frases usa variable). Sus presentaciones reales:

| Presentaciones | Cuántos productos |
|---|---|
| Familiar / Personal | 19 |
| **Ajo, Bbq, Cheddar, Dulce Maíz, Rosada** | 1 |
| Litro / Personal | 1 |
| 1.5 Litros / Personal | 1 |

La frase fija sirve para los 19, y falla en los otros 3 — sobre todo en el de
las salsas, donde preguntarle *"¿personal o familiar?"* no tiene ningún
sentido.

**Nota de fondo:** esto no es un error del sistema, es una frase fija escrita
para un producto y aplicada a todos. Pero el panel **no avisa** de que una
frase fija con opciones escritas a mano se va a usar igual para productos que
tienen otras. Ese aviso valdría tanto como el arreglo.

---

## 4. Las misiones no están en la paleta: hay que adivinarlas `2026-08-12`

**Lo que Sergio vio:** los pasos con misión propia deberían estar en la lista
de la izquierda, listos para arrastrar. No están.

**Verificado.** La paleta ofrece **7 formas de caja**:

> Inicio · Frase fija · Conversacional IA · **Pregunta variable** · Temporizador
> · Resumen pedido · Evento: Pide la carta

Y las **12 misiones** viven *dentro* de un desplegable que solo aparece
**después** de arrastrar "Pregunta variable" y abrirla:

> Qué va a pedir · Presentación · Variante · Preferencias · Ofrecer algo más ·
> Adiciones · Dirección · A nombre de quién · Método de pago · Pedido
> programado · Reserva de mesa · Datos de factura

O sea: para poner el paso de **Reserva**, el dueño de un restaurante tiene que
arrastrar algo llamado *"Pregunta variable"* —que no sugiere nada— abrirlo, y
encontrar la misión en una lista de doce.

**Consecuencia directa:** los tres pasos que se construyeron hoy —Pedido
programado, Reserva de mesa y Datos de factura— **son invisibles en la
práctica**. Están hechos y funcionan, pero nadie los va a encontrar.

**Arreglo (a decidir):** que cada misión sea su propia caja arrastrable, con su
nombre y su explicación, como Sergio esperaba desde el principio. "Pregunta
variable" dejaría de existir como caja: sería el envase interno.

Nota: yo mismo me confundí con esto. Al auditar el canvas reporté "7 tipos de
paso" leyendo la paleta, cuando las misiones reales eran otra cosa. Si el
autor del sistema se confunde mirándolo, un dueño de restaurante también.

---

## 5. Lo que esto sugiere, en general

El canvas **descarta cajas en silencio**. Uno las dibuja, las configura, guarda
— y no pasa nada. No hay ningún aviso.

Antes de seguir puliendo frases una por una, conviene que al guardar el canvas
diga qué cajas **no se van a usar y por qué**. Si no, cada frase que Sergio
configure en una caja suelta se va a perder igual, y lo va a descubrir de a una.
