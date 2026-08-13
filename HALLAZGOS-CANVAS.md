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

## 3. Lo que esto sugiere, en general

El canvas **descarta cajas en silencio**. Uno las dibuja, las configura, guarda
— y no pasa nada. No hay ningún aviso.

Antes de seguir puliendo frases una por una, conviene que al guardar el canvas
diga qué cajas **no se van a usar y por qué**. Si no, cada frase que Sergio
configure en una caja suelta se va a perder igual, y lo va a descubrir de a una.
