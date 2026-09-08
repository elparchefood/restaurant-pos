# Pedir tocando el menú, no escribiéndolo

> **Estado: IDEA ANOTADA, sin construir.** Sergio, 8-sep-2026, antes de
> arrancar con la lista de pendientes.

---

## 1. La idea

Cuando alguien escribe "hola" para pedir, o pide la carta, Paco no contesta con
la imagen: contesta con un mensaje que lleva **un botón** ("Ver el menú").

El botón abre una página pequeña con la carta del restaurante. La persona
navega, escoge productos, tamaños y presentaciones —igual que en la app de El
Parche—, toca **Finalizar pedido**, elige **cómo paga** (efectivo,
transferencia, o billetera si es El Parche), y la página se cierra sola.

Paco recibe **exactamente** lo que escogió y con qué va a pagar. Y de ahí en
adelante **el flujo que ya existe no cambia**: manda el resumen para confirmar
(ahora con botones "Sí" / "Corregir"), si eligió transferencia manda su QR, y al
confirmar el pedido pasa a preparación.

## 2. Por qué es buena, dicho con precisión

Sergio lo dijo así, y es la clave:

> *"Muchas veces no son errores de Paco sino errores de los clientes al momento
> de hablar."*

Es cierto, y se puede comprobar en el banco de pruebas: los pedidos que Paco
falla no son casi nunca "Paco entendió mal una frase clara" — son frases
ambiguas. *"Una premium de 69"*, *"maicitos especial de 29"*, gente que llama a
un plato por un ingrediente, o por un precio.

**Esta idea no mejora la lectura: elimina la lectura.** Quien toca el menú no
puede equivocarse de nombre, ni de tamaño, ni pedir algo agotado. El pedido llega
con los identificadores exactos, no con palabras que hay que interpretar.

Es el mismo principio que ya rige a Paco —*"toda corrección se hace con el lector
del pedido, nunca comparando texto"*— llevado un paso más atrás: **quitar el
texto de en medio**.

Y hay un beneficio que Sergio no mencionó y que vale igual: **la página conoce
lo agotado**. Hoy alguien puede pedir algo que no hay, y eso se resuelve
conversando. Ahí, sencillamente, no aparece.

---

## 3. Lo que hay que decidir bien

### 3.1 ¿Esto se vende, o es solo de El Parche?

**Se vende.** Y es la diferencia con la página de clientes.

La página de clientes (`PLAN-panel-pagina.md`, handoff del 3-ago) es
**exclusiva de Sergio** — ningún restaurante cliente la tiene, igual que la
billetera y las tarjetas NFC. Pero Paco **sí** se vende, va en el plan Pro, y
esta pantalla es una pieza de Paco: sirve para que el pedido llegue limpio.

Consecuencias de eso:

- Se construye **por restaurante**, leyendo su carta, sus precios y sus
  agotados. Nada de El Parche escrito en el código.
- **La billetera NO va** para los demás: solo efectivo y transferencia. La
  billetera aparece únicamente en El Parche.
- Los medios de pago que se ofrecen salen de la configuración de cada
  restaurante, no de una lista fija.

### 3.2 Reutiliza pantallas que ya están diseñadas, pero no es la misma página

La carta y "Tu pedido" **ya están diseñadas** en el handoff de la página de
clientes. Se aprovecha el diseño, pero cambian las dos puntas:

| | Página de clientes | Esta |
|---|---|---|
| **Cómo entra** | Con login | **Sin registro**, por un enlace de la conversación |
| **Cómo sale** | Crea el pedido | **Se lo entrega a Paco**, que sigue su flujo |

Que no cree el pedido es a propósito: así el resumen, la confirmación, el QR y
el paso a preparación siguen siendo **un solo camino**, el que ya funciona y ya
está probado. Esto cambia **la entrada**, no el flujo.

### 3.3 Sin registro NO significa sin candado

El enlace tiene que ir **firmado, atado a esa conversación y caducar** (minutos,
no días). Si fuera adivinable, cualquiera podría dejar un pedido a nombre de
otro número — y ese pedido entra a la cocina.

Nada de poner el teléfono en el enlace a la vista.

### 3.4 Los botones de WhatsApp: cuándo se pueden mandar

Esto llega **siempre después de que el cliente escribió** ("hola", "me manda la
carta"), o sea **dentro de la ventana de 24 horas**. Ahí sí se pueden mandar
mensajes con botones sin plantilla aprobada.

Fuera de esa ventana haría falta una plantilla aprobada por Meta — y ahí manda
la regla de la casa: **nada se manda a Meta sin que Sergio lo vea primero.**

### 3.5 ¿Y quien no toca el botón?

**Paco NO deja de leer pedidos escritos.** Habrá quien no toque un enlace —por
desconfianza, por teléfono viejo, o porque prefiere escribir. Esto reduce los
errores de quien lo use; no elimina el lector.

Decisión pendiente de Sergio: cuando alguien pide la carta, ¿se manda **solo**
el botón, o el botón **y** la imagen? La regla vigente es que la carta va
**siempre en imágenes, jamás en texto** — una página con las fotos de verdad la
respeta, pero mandar solo un enlace deja fuera a quien no lo abre.
*Recomendación: botón primero; si no lo toca y vuelve a pedir la carta, la
imagen.*

### 3.6 Detalles que hunden esto si se pasan por alto

- **El precio va en la presentación.** Si hay que escoger tamaño o variante, en
  la reja NO va precio: ni el menor, ni un rango, ni un guion. Regla ya sentada.
- **Si cierra la página a medias**, no puede quedar medio pedido. O llega
  entero, o no llega.
- **Si pide dos veces**, Paco no puede acabar con dos pedidos del mismo cliente
  sin darse cuenta.
- **Agotados y horarios** los manda el restaurante, no la página.
- **Tiene que ser rapidísima en móvil**, con datos de celular y en la calle. Si
  tarda, la persona vuelve a WhatsApp y escribe — y volvimos al principio.

---

## 4. Lo que NO cambia

El resumen de confirmación, el QR de la transferencia, la verificación del
comprobante, el paso a preparación y el aviso a cocina: **todo igual**. Paco
sigue siendo quien confirma y quien manda.

Lo único que cambia es de dónde saca lo que el cliente quiere: en vez de
deducirlo de una frase, lo recibe ya escogido.
