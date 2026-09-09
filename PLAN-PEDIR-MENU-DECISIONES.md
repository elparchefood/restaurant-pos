# Pedir desde el menú — las decisiones de la maqueta

> Complemento de `PLAN-PEDIR-DESDE-EL-MENU.md`. Todo esto salió de enseñarle la
> maqueta a Sergio el 8-sep-2026 y de medir la carta y la configuración reales
> de El Parche. **Nada de aquí es una suposición: cada número está comprobado
> contra la base.**
>
> La maqueta viva: artefacto *«Carta interactiva de Cobra»*.

---

## 1. Cómo se navega

**Rejilla de categorías, y se entra a una.** No pastillas que se deslizan de
lado. Sergio: *"muchas personas no van a entender que hay que hacer slide y no
van a ver que están ocultas"*. Una categoría que hay que descubrir deslizando es
una categoría escondida. Es el mismo patrón de la tablet de tomar pedidos
(`tp-catgrid`).

Dentro, los productos con foto; arriba el nombre de la categoría y la flecha
para salir. **El pedido no se pierde** al entrar y salir.

---

## 2. Una pregunta por pantalla

Sergio: *"las personas se agotan mirando toda la información junta; es mejor
paso a paso"*.

Premium son cuatro pasos: **tamaño → tipo → adiciones → cantidad**. SÚPER QUESO
son cinco, porque tiene dos ingredientes que escoger. Una hamburguesa, uno solo.

**Los pasos no están escritos a mano: salen de lo que el dueño configuró.**
Ningún restaurante tiene que decirnos cómo es su carta.

Dos reglas que se ganaron probando:

- **Tocar la respuesta ya es continuar.** En las preguntas de una sola respuesta
  no hay botón: pedir que toque la opción *y* luego "continuar" es hacerle
  trabajar dos veces. Solo hay botón donde caben varias (adiciones) y al final.
- **Arriba se ve lo ya contestado** («Premium · Personal · Mixta») y el paso en
  el que va. Al volver atrás, lo que había escogido aparece marcado.

### Las adiciones no se enseñan hasta que las piden

El Parche tiene **once**. De golpe, quien solo quería una salchipapa se
encuentra una lista larga que tiene que leer para poder pasar de ella. Ahora se
pregunta *"¿Le agregas algo?"* con **Sí / No**, y la lista solo se abre si dice
que sí. Si ya había escogido alguna, se enseña abierta.

---

## 3. El precio que se ve es el que se paga

Sergio: *"luego dicen 'no costaba 52.000 la familiar súper queso' y toca
explicarle que es por el empaque"*.

**El empaque va sumado desde el primer precio.** La regla la pone el restaurante
en Operación (`branches.operacion_config`) y se resuelve con la misma cascada
que la caja: general → categoría → producto → presentación.

En El Parche: **$1.000** general, un paquete "Pequeño" de **$500**, y varias
categorías apagadas (las bebidas entre ellas). Comprobado contra los dos
ejemplos que dio Sergio:

| | |
|---|---|
| SÚPER QUESO Familiar | 52.000 + 1.000 = **$53.000** |
| MAICITOS Personal | 13.000 + 500 = **$13.500** |

Se suma **en un solo sitio** —donde se calcula el precio— para que no haya una
pantalla que lo sume y otra que no. Y en el pago va una línea: *"Los precios ya
incluyen el empaque. Lo que ves es lo que pagas."*

### Y si hay que escoger, NO va precio

Regla ya sentada, y aquí importa el doble: ninguna salchipapa muestra precio en
la lista, porque todas vienen Familiar o Personal. Dice **«Familiar o
Personal»**, que es lo que sí ayuda. Lo mismo con las bebidas: la Coca Cola
viene en 1.5 Litros ($8.000) y Personal ($5.000) — enseñar "$8.000" ahí sería
enseñar el precio de una y cobrar la que a nosotros nos parezca.

---

## 4. El upsell y el cierre

Sergio: *"hay personas que no imaginan que tienen que tocar ahí para terminar su
pedido"*. La franja de abajo es un atajo para quien ya sabe, no un camino para
quien no.

Al agregar algo, el modal **no se cierra**:

1. **Ofrece** — *"¿Le agregas algo más?"*
2. **Pregunta si está listo** — *"¿Es esto lo que quieres?"*, con **Sí, terminar
   mi pedido** o **Seguir pidiendo** (que devuelve a la carta, ya con la franja
   diciendo lo que lleva). Si escoge otra cosa, se repite el ciclo.

**Lo que se ofrece ya estaba configurado.** El paso `upsell` del flujo de Paco
(`ia_config.flujo_pasos`) tiene Ranchera, Súper Queso y la categoría Bebidas, y
está en `activo: false`. **Decisión de Sergio (8-sep): Paco deja de ofrecerlo y
lo ofrece esta pantalla** — pero la lista se sigue configurando en un solo
sitio, o acabarían ofreciendo cosas distintas.

Y solo se ofrece **lo que de verdad se le puede agregar a ese plato**. Ofrecer
algo que después no se puede poner es peor que no ofrecer nada.

---

## 5. La pantalla del pago

**No cobra nada**: pregunta con qué va a pagar y Paco sigue desde ahí.

**Los medios salen de la configuración del restaurante** (`ia_config.pagos`), no
de una lista escrita a mano. El Parche tiene cuatro activos: Efectivo,
Transferencia (Nequi 0092726260), Puntos y Billetera. La transferencia lleva
**el logo oficial de Nequi**: en una pantalla de pago, la marca que la persona
reconoce es lo que le dice que va bien.

⚠️ **La billetera es SOLO de El Parche** (no se vende, como las NFC y la app de
clientes). **Los puntos sí se venden.**

---

## 6. Saldo y puntos: lo que se puede saber sin que la persona se registre

La página sabe el teléfono, porque el enlace va atado a la conversación. Con eso
alcanza:

- **Puntos** viven por teléfono (`pos_puntos`) — directo.
- **Saldo** vive por cliente (`pos_saldo` → `pos_clientes`) — se llega por el
  teléfono igual.

### La billetera

Puede decir *"Tu saldo: $32.000 — te alcanza"* o *"te faltan $8.500"*.

**Confirmar es un botón en el chat, no un código que haya que copiar.** Idea de
Sergio, mejorada: Paco manda un mensaje con botón *"Confirmar pago con mi
saldo"*; al tocarlo, el mensaje entra **desde el número de esa persona**, que es
justo la prueba que hace falta. Sin digitar nada, y reenviar el enlace no sirve
de nada: quien no tenga ese WhatsApp no puede confirmar.

**Dos reglas o esto se rompe con dinero de verdad:**

1. **El saldo se vuelve a mirar AL CONFIRMAR, no al enseñarlo.** Entre que ve
   los $32.000 y toca el botón pueden pasar minutos, y pudo haber gastado en el
   local. Se comprueba y se descuenta en el mismo instante.
2. **Un descuento por confirmación, aunque toque dos veces.** Se amarra en la
   base, no en la memoria del programa — la misma lección que costó el cobro de
   Wompi.

### Pago partido: ya existe, no hay que construirlo

Sergio: *"si tiene saldo pero no le alcanza para todo, que pague la parte que
alcanza y el resto se lo cobre Paco"*.

**Se puede, y la caja ya lo hace.** `pos_payments` guarda un renglón por pago:
de los pedidos de El Parche, **19 ya se pagaron con dos métodos**, y `__saldo`
ya aparece entre ellos. Así que "$20.000 de saldo + $7.000 en efectivo" cabe tal
cual.

Lo único que hay que cuidar: **Paco tiene que cobrar el excedente, no el
total.** Si el mensaje dice el total, el cliente paga dos veces.

### Los puntos NO pagan el pedido: canjean premios

Corrección importante, medida en la base. `pos_puntos_catalogo` son productos
concretos con su costo:

| Premio | |
|---|---|
| Adición de salsa | 100 pts |
| Coca Cola personal · HIT | 200 pts |
| Súper Queso Personal | 400 pts |
| Premium Familiar | 1.500 pts |

**Y el dato que decide el diseño:** de **271** clientes con puntos, solo **46**
llegan a 100 (el premio más barato) y **solo 1** llega a 400 (comida). El
promedio son **72** puntos.

> Si "Puntos" aparece como método de pago para todos, **8 de cada 10 lo tocan y
> se llevan un "no te alcanza"** — en el momento de pagar, que es el peor momento
> para una decepción.

**Recomendación: que los puntos no sean un método de pago, sino un paso aparte
antes de pagar, y que solo aparezca cuando de verdad le alcance para algo.**
*"Tienes 340 puntos — puedes reclamar una Coca Cola personal."* A quien no le
alcanza, no se le menciona. El premio se suma al pedido como producto en $0 y el
resto se paga normal.

### La regla de privacidad

**Mostrar** el saldo o los puntos no necesita confirmación. **Gastarlos**, sí. El
enlace va atado a la conversación de ese número, pero si alguien lo reenvía,
otro podría ver el saldo — y peor, gastarlo.

---

## 7. Lo que falta decidir

- **¿La página pide dirección y nombre, o eso queda con Paco?** Recomendación:
  con Paco. La página no sabe quién es esa persona —a propósito, no hay
  registro—, así que pediría la dirección desde cero cada vez; Paco sí la
  reconoce por su número y puede preguntar *"¿te lo llevo a la misma dirección
  de la última vez?"*.
- Si el saldo no alcanza: ¿pago partido desde el principio, o todo-o-nada
  primero? (La caja ya soporta el partido.)
- ¿Después de escoger una bebida en el upsell se vuelve a ofrecer, o se va
  directo al cierre? Hoy va directo.
