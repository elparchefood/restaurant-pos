# La dirección, dentro de la carta

> **PLAN — sin ejecutar.** 9-sep-2026. Idea de Sergio:
> *"En lugar de que Paco pida la dirección, ahí mismo en el flujo de la página
> le colocamos un modal para dirección. Es muy rápido y nos evitamos que Paco
> se confunda con direcciones."*

---

## 1. Por qué, con los números sobre la mesa

| | |
|---|---|
| Conversaciones que pasaron a una persona **por la dirección**, en toda la historia | **2** |
| Clientes con dirección ya guardada | **147 de 303** (49%) |
| De los que pidieron en los últimos 30 días | **90 de 212** (42%) |
| Barrios con precio configurado | **128** |
| Conjuntos con precio configurado | **68** |

**La dirección casi nunca rompe el flujo.** Lo que hace es costar mensajes y
meter errores silenciosos. El 9-sep, en dos horas de pruebas, aparecieron dos
del mismo sitio:

- *"bellavista"* no encontró su zona → Paco pasó la conversación a una persona.
- El barrio *"Casa 21"* de la ficha se quedó pegado a una dirección nueva → se
  habría cobrado la zona equivocada.

Los dos nacen de lo mismo: **Paco interpretando texto libre** para sacar barrio
+ dirección + conjunto + unidad.

Esto no mejora esa interpretación: **la elimina.** Es el mismo argumento con el
que se hizo la carta.

---

## 2. ⛔ Lo que este plan NO hace

> Sergio, tajante: *"no podemos mostrarle una lista de precios de domicilios al
> cliente. Eso va totalmente en contra del concepto que quiero: rapidez,
> agilidad y facilidad."*

**El cliente nunca ve una lista de barrios ni un precio de domicilio mientras
escoge.** Propuse eso y quedó descartado. El precio aparece **ya sumado**, en la
pantalla de pago, junto al total — que es donde tiene sentido verlo.

Y la lista de zonas **no baja al navegador**: la busca el servidor. Además de
ser lo correcto con la plata, evita que los precios de domicilio de El Parche
queden a la vista de cualquiera que abra la página.

---

## 3. Las pantallas

Van **entre** el resumen del pedido y la pantalla de pago. Ahí y no después,
porque el domicilio cambia el total.

### 3.1 Cómo lo quiere

```
   ¿Cómo lo quieres?

   ┌──────────────────┐  ┌──────────────────┐
   │    Domicilio     │  │   Yo lo recojo   │
   └──────────────────┘  └──────────────────┘
```

*Yo lo recojo* salta todo lo demás y va derecho al pago, sin domicilio.

### 3.2 Si ya tiene dirección guardada — el 42% de hoy

```
   ¿Va para tu dirección de siempre?

   📍 Carrera 9b # 63-58, Bella Vista

   ┌──────────────────┐  ┌──────────────────┐
   │  Sí, para allá   │  │  Otra dirección  │
   └──────────────────┘  └──────────────────┘
```

Un toque y sigue. **Sin precio a la vista.**

### 3.3 Dirección nueva

```
   ┌──────────────────┐  ┌──────────────────┐
   │   Casa normal    │  │    Conjunto      │
   └──────────────────┘  └──────────────────┘
```

**Casa normal — 2 campos, los dos obligatorios**

| Campo | |
|---|---|
| Barrio | obligatorio |
| Dirección | obligatorio |

**Conjunto — 4 campos**

| Campo | |
|---|---|
| Nombre del conjunto | **obligatorio** |
| Casa o apartamento | **obligatorio** |
| Barrio | opcional |
| Dirección | opcional |

**La regla, dicha una sola vez: es obligatorio el campo que encuentra la
zona.** Con 68 conjuntos configurados, el nombre del conjunto ya da el precio —
por eso ahí el barrio sobra. En una casa normal el barrio es lo único que la
encuentra.

### 3.4 El pago, con el domicilio ya sumado

```
   Productos              $35.000
   Domicilio               $5.000
   ─────────────────────────────
   Total                  $40.000
```

Si la zona no se reconoció:

```
   Productos              $35.000
   Domicilio      te lo confirmamos por el chat
```

---

## 4. Cuando el barrio no está en la lista

> Sergio: *"en el peor de los casos funcionaría igual que ya funciona: me
> aparecerá el modal donde yo le voy a colocar a Paco el precio y él continuará
> la conversación."*

**No se inventa nada nuevo.** El pedido entra, la conversación queda con
`domi_precio_pendiente`, a Sergio le sale el modal de siempre y Paco sigue con
el resumen. Es el camino que ya existe desde el 6-sep.

---

## 5. Lo que hay que construir

### 5.1 En la página (`carta.js` / `carta.css`)

- Tres pantallas nuevas entre el cierre y el pago: entrega, dirección conocida,
  dirección nueva.
- El pie del pago muestra productos + domicilio + total.

### 5.2 En la función `carta` (servidor)

- **`abrir`** manda además la dirección principal del cliente. Ya existe
  `fn_cliente_direccion_principal` (la de más pedidos, con empate por la más
  reciente); si no devuelve nada, la de la ficha.
- **Acción nueva `cotizar`**: recibe la dirección y devuelve el precio del
  domicilio. **El navegador nunca recibe la tabla de zonas.**
- **`guardar`** vuelve a calcular el domicilio desde cero, igual que ya hace con
  los precios de los productos. Lo que enseñó el navegador no se cree.

### 5.3 En el borrador

Gana: `entrega` (domicilio | recoger), `barrio`, `direccion`, `conjunto`,
`unidad`, `domi_precio`.

### 5.4 En `delay-reply` — ⚠️ un cambio de regla

Hoy, tras el arreglo del 9-sep, **el chat manda en la dirección** y la página en
los productos. Con esto la regla cambia:

> Si el borrador trae dirección, **manda la página** (es más nueva y explícita).
> Si no la trae, se conserva la del chat, como hoy.

Y con la dirección ya puesta, Paco **no la pregunta**: acusa recibo y va derecho
al resumen — el camino que ya se construyó esta tarde para las correcciones.

*Yo lo recojo* se guarda en `direccion` con una frase que el motor ya reconoce
(`LLEVAR_REGEX`: *"para recoger"*, *"yo paso"*, *"sin domicilio"*…), para no
inventar un segundo mecanismo de "para llevar".

---

## 6. Lo que NO se toca

- **Paco sigue pidiendo la dirección** a quien pida por el chat. Regla de
  Sergio: *"Paco también tiene la capacidad de preguntarla si el cliente no
  tocó el botón"*.
- El modal del precio del domicilio, tal cual está.
- Los precios de las zonas. Ni uno.

---

## 7. Para los demás restaurantes

Cobra se vende, El Parche es el banco de pruebas.

- **Sin zonas configuradas**: se piden los campos igual y no se enseña precio;
  lo pone una persona. Es el camino del §4, que ya existe.
- **Restaurante que solo recoge**: si no hay domicilios activos, la pantalla de
  entrega no aparece y se va derecho al pago.

---

## 8. Una limpieza pendiente en los datos de El Parche

Mirando las zonas aparecieron tres entradas que no son barrios:

| Guardado como barrio | Precio |
|---|---|
| **Casa 21** | $4.000 |
| **Manzana 14#14-14** | $14.000 |
| **Manzana 6 #6-17** | $10.000 |

Son direcciones, no barrios — seguramente para cobrarle un precio especial a
alguien. *"Casa 21"* es justo el que se le pegó a la dirección de Sergio el
9-sep.

**No se tocan sin que él lo diga.** No bloquean este plan; conviene mirarlas.
