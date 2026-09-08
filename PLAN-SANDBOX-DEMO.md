# La demo de Cobra — entrar y mirarlo por dentro antes de pagar

> **Estado: DECIDIDO, sin fecha.** Se construye EN PARALELO al lanzamiento.
> Sergio, 8-sep-2026: *"Detallamos los detalles mínimos que quedan y lanzamos de
> una. Empiezo a hacer el contenido orgánico y a crear comunidad, y mientras eso
> sucede vamos construyendo el sandbox. En el momento que lo tengamos lo
> implementamos también, pero no vamos a esperar a tenerlo para lanzar."*
>
> Es decir: **esto NO bloquea el lanzamiento.** Cobra sale con el registro que
> ya está probado, y la demo entra después, sin tocarlo.

---

## 1. La idea, y por qué es buena

Idea de Sergio: un entorno donde cualquiera entra, ve Cobra por dentro y usa sus
funciones —limitado, sin vender de verdad— y **desde ahí mismo oficializa su
cuenta y paga**.

Y lo más fuerte de la idea no es que prueben. Es esto:

> **La persona no pierde lo que hizo.** Carga su carta, pone sus precios, arma
> sus mesas… y cuando paga, su cuenta simplemente **deja de ser demo**. No
> vuelve a escribir nada.

Ahí está el negocio. Un dueño que ya cargó 60 productos no se va a otro lado: el
trabajo hecho es el costo de irse. Una demo de mentira —un restaurante de
ejemplo compartido, de solo mirar— no tiene eso, porque al pagar hay que
empezar de cero.

**Por eso la demo es una cuenta DE VERDAD marcada como demo**, no una simulación.

---

## 2. Lo que hay que hacer bien, o no sirve

### 2.1 Los límites viven en la base, NUNCA en la pantalla

Una cuenta demo tiene sesión de verdad, así que puede llamar al servidor
directamente saltándose los botones. Un límite puesto en el navegador no es un
límite: es una sugerencia.

Es la misma lección que ya costó un bug en el cobro —*"el monto no puede venir
del navegador"*—. Los topes van en la base: reglas de fila, disparadores y
comprobaciones dentro de las funciones. La pantalla solo los **explica**.

### 2.2 Hay funciones que cuestan plata real cada vez que alguien las toca

Con la demo abierta al público, esto lo paga Sergio:

| Función | Por qué cuesta | Qué se hace en la demo |
|---|---|---|
| Importar carta con IA | GPT-4o mirando fotos, por carta | Tope duro (1–2), o apagada con video |
| Paco / Chat IA | Cada mensaje es una llamada al modelo | Apagada. Se enseña, no se conecta |
| WhatsApp | Número real de Meta, plantillas | Apagada |
| SMS | Saldo comprado | Apagada |
| Mapas | Llave de Cobra, tope de 40/día ya existe | Apagada o con el mismo tope |

**"Apagada" no es una pérdida de venta.** Se enseña con un video en la misma
pantalla —el módulo de tutoriales ya existe para eso— y con el aviso de que se
enciende al activar la cuenta. Enseñar la función vende igual; regalarla cuesta.

### 2.3 La facturación DIAN no puede estar ni de adorno

Son documentos legales con el NIT de El Parche. En la demo va apagada, sin
excepción y sin "modo de prueba" que alguien pueda confundir.

### 2.4 La demo NO puede ensuciar lo real

Los restaurantes demo tienen que quedar fuera de:

- la consola de plataforma (mezclados con clientes reales sería un desastre),
- las estadísticas y el conteo de clientes,
- **el reloj del cobro** (`v_suscripciones_por_vencer`) — si no, intentaría
  cobrarles.

Lo más limpio: una marca `es_demo` en el restaurante, y **sin `periodo_fin`**
hasta que pague. El reloj ya ignora a quien no tiene periodo, así que eso solo
funciona. Y al pagar, `approve` le pone el periodo — que es exactamente lo que
se arregló el 7-sep.

### 2.5 Un POS vacío no vende

Si abre el panel y ve ceros, se va. La cuenta demo nace con un restaurante de
ejemplo ya cargado: carta con fotos, ventas de la última semana, clientes con
puntos, algún domicilio. Que las pantallas se vean **vivas**.

Con dos condiciones:

- **Aviso permanente de que es una demostración.** Nunca puede creer que vendió
  de verdad.
- Los datos de ejemplo son de un restaurante inventado, **no de El Parche**.

### 2.6 La cuenta demo caduca

A los 14 días se pausa. No se borra: se pausa. El modal de suspensión que ya
existe la lleva al pago — la máquina ya está hecha, se reutiliza tal cual.

---

## 3. Cómo se convierte en cliente

El paso de "demo" a "cliente" es **solo un pago**. Nada de mudanzas de datos:

1. Botón visible siempre: **"Activar mi cuenta"**.
2. Abre el modal de cobro que ya existe y ya está probado
   (`posSuscripcion.abrir`) — Nequi, tarjeta.
3. Al aprobarse: se le quita la marca de demo, se le pone el periodo, se
   encienden las funciones apagadas y se le pregunta si quiere **borrar los
   datos de ejemplo** o quedarse con los suyos.

Ese último paso importa: hay que poder limpiar el restaurante de mentira sin
tocar lo que la persona cargó.

---

## 4. Cómo se le llama al cliente

**"Sandbox" no se le dice al cliente.** Un dueño de restaurante no sabe qué es.

Se llama **"Prueba Cobra gratis"** / **"Entra y míralo por dentro"**. Palabra de
la casa, no de programador.

---

## 5. La prueba A/B de la página de ventas

Idea de Sergio: la mitad de quien entra va a la demo, la otra mitad al registro
de hoy, y se mira cuál funciona mejor.

**La idea es correcta. Lo que hay que cuidar es cuándo se lee.**

### 5.1 La advertencia honesta

Para distinguir de verdad si un camino convierte mejor que el otro hacen falta
del orden de **cientos de visitas en cada mitad**. Con el tráfico de los
primeros meses, lo que se va a ver es *"3 de 40 contra 5 de 38"* — y eso **no
significa nada**.

Ya nos pasó midiendo a Paco: se corrió lo mismo dos veces sin cambiar nada y dio
**46 y 44**. Una sola corrida no distingue una mejora de la suerte. Aquí es
igual, con personas en vez de conversaciones.

### 5.2 Cómo se hace entonces

- **El aleatorizador se monta desde el principio.** Es barato, y sin él después
  no se puede comparar nada.
- **A cada visitante le toca SIEMPRE lo mismo** (se guarda en su navegador). Si
  un día ve una cosa y al otro otra, no entiende qué se le vende.
- **Al principio no se mira "cuántos pagaron"**, que se mueve demasiado lento.
  Se miran señales rápidas: cuántos llegan a cargar su primer producto, cuántos
  vuelven al día siguiente, cuántos piden que los llamen.
- **Se decide ANTES cuánto tiempo va a correr.** Si no, siempre se para justo
  cuando el resultado gusta.
- Y no se toca la página mientras corre, o se está comparando otra cosa.

---

## 6. En qué orden se construye

1. **La marca `es_demo` y los límites en la base.** Es la pieza grande y la que
   sostiene todo lo demás. Sin esto, lo otro es decorado.
2. **El sembrador**: crea la cuenta demo con el restaurante de ejemplo.
3. **Los candados de las funciones que cuestan** (IA, WhatsApp, SMS, DIAN).
4. **El aviso permanente de demostración** y el botón de activar.
5. **La conversión**: quitar la marca, poner el periodo, limpiar el ejemplo.
6. **El aleatorizador** de la landing y el conteo de las señales.

---

## 7. Y una cosa que ya existe y encaja aquí

Hoy `onboarding.html` **ya crea cuentas gratis sin periodo**: quien entre con
sesión y sin restaurante llega ahí y se crea un `starter` activo sin pagar
(anotado el 7-sep en `PLAN-COBRO-SUSCRIPCIONES.md` §9).

Es decir, media puerta gratis ya está abierta por accidente. La demo le da
**propósito y borde**: deja de ser un agujero y pasa a ser el producto de
entrada, con sus límites y su caducidad.
