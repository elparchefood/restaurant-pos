# Qué está pasando en la página de clientes — plan

**Estado: anotado, sin implementar.** Pedido por Sergio el 28-ago-2026, en
servicio, después de ver que un pedido tomado por WhatsApp se pagó desde la
página.

> *"Me gustaría tener control de eso: desde configuraciones, o donde veo la
> información de la página web, poder ver cuántas personas y qué personas
> hicieron pedidos por ahí, cuántas no hicieron pedidos por ahí pero pagaron
> pedidos por ahí. Y con el tiempo nos vamos a ir imaginando otras cosas que
> pueden ir ahí."*

## Lo que hay que separar, y es lo que le da valor

Hoy "pedido de la página" y "pago en la página" se confunden, y son **tres
cosas distintas** que cuentan historias distintas:

| | Qué significa |
|---|---|
| **Pidió y pagó en la página** | El cliente se atendió solo, de punta a punta. Nadie del restaurante tocó ese pedido. |
| **Pidió por WhatsApp, pagó en la página** | Lo atendió una persona (o Paco), pero **se cobró solo**. Es el caso de Isabela. |
| **Pidió por WhatsApp, pagó por fuera** | El camino de siempre: hay que pedirle el comprobante y revisarlo a mano. |

El segundo es el que más dice: mide cuánta plata entra **sin que nadie persiga
un comprobante**. Es trabajo que la página le quita de encima al restaurante, y
hoy no se ve por ningún lado.

## De dónde salen los datos — ya existen, no hay que guardar nada nuevo

- `pos_orders.origen = 'web'` → **el pedido nació en la página**.
- `pos_orders.payment_method` + `paid_amount` + `closed_at`, escritos por
  `web-pagar` → **el pago entró por la página**.
- `pos_web_sesiones` → quién entró y cuándo, aunque no comprara.
- `pos_clientes` → nombre y teléfono para poder decir **quiénes**, no solo
  cuántos.

⚠️ Falta una marca: hoy no se distingue en el pedido si el pago vino de la
página o del chat, se deduce de qué función lo escribió. **Lo primero al
implementar es dejar esa marca al cobrar** (`pago_origen`), en vez de deducirla
después — deducir es como se llega a números que nadie sabe explicar.

## Dónde vive

Donde Sergio ya mira lo de la página, no en un informe aparte. Un informe que
hay que ir a buscar no lo mira nadie.

## Lo que iría, para empezar

- Las tres cifras de arriba, del día y del mes.
- **Quiénes**: la lista con nombre, no solo el número. "23 personas" no sirve
  para llamar a nadie.
- Cuántos entraron a la página y **no** compraron — es el hueco por donde se
  pierde plata y hoy es invisible.

## Y lo que NO hay que hacer

No llenarlo de gráficas. Sergio dijo que las ideas irán saliendo con el uso:
empezar con lo que se sabe que sirve, y dejar sitio para lo que pida después.
