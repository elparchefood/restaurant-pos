# PLAN — Paco responde por los puntos (acordado 15-ago, para el 16-ago)

## Lo que pidió Sergio (sus palabras, resumidas)
1. Si un cliente pregunta **cuántos puntos tiene**, Paco responde su saldo.
2. Que también le diga **qué le alcanza a redimir** con esos puntos — lista SOLO
   con los productos que sí puede pagar con su saldo.
3. Si pregunta **cuáles productos se pueden redimir**, la lista completa del
   catálogo de redención.

## Por qué es seguro
Los puntos están atados al teléfono, y quien escribe por WhatsApp ES el dueño
del número (`from_phone`). No hay que pedir identidad: el saldo que se responde
es siempre el del número que pregunta. Jamás responder por OTRO número.

## Los datos ya existen (verificado en la base, 15-ago)
- **Saldo**: `pos_puntos` (tenant, telefono 10 dígitos, puntos). El teléfono del
  chat llega como 57XXXXXXXXXX → usar `tel10` (últimos 10), igual que aviso-puntos.
- **Catálogo de redención**: `pos_puntos_catalogo` (branch_id, product_id/pres_id
  o combo, `pres_nombre`, `puntos`, `dinero` para canjes mixtos, `activo`).
  El Parche ya lo tiene poblado (combos incluidos).

## Diseño (mismo patrón que la categoría en texto — entrada 133/140)
Rama determinista **6-pre-puntos** en delay-reply, ANTES de la carta:
1. Detectar la intención: el clasificador ya devuelve `pregunta`; añadir campo
   `puntos: "saldo" | "alcanza" | "catalogo" | null` al clasificador
   (+ respaldo por regex: palabra "puntos" + forma de pregunta).
2. Consultar fresco y POR SUCURSAL (regla multi-tenant de los mapas DYN):
   saldo del tel10 + catálogo activo con nombres reales
   (join a pos_products cuando product_id, `pres_nombre` para combos).
3. Armar la FICHA autoritaria y pasarla al modelo como `_puntosFicha`
   (el modelo es el locutor, la ficha es la autoridad — igual que `_catFicha`):
   - saldo: "Tienes N puntos"
   - alcanza: solo filas con `puntos <= saldo` (si `dinero > 0`, decirlo:
     "Combo X — 300 puntos + $5.000")
   - catalogo: todas las filas activas
   - JAMÁS decir que no existe algo que esté en la ficha (regla anti-FAQ).
4. `cartaSuprimida`-style: si en el mismo lote también PIDE, el flujo sigue
   (lección de la entrada 141 — nada de returns incondicionales).

## Casos borde (con propuesta por defecto — Sergio ajusta mañana)
- **Sin registro / saldo 0**: "Aún no tienes puntos registrados 😊 En cada
  compra ganas 1 punto por cada $1.000; da tu número al pagar y empiezas a
  acumular." (nunca decir "no existes").
- **Saldo > 0 pero no le alcanza para nada**: decirle el saldo + cuántos puntos
  le faltan para el premio más cercano (motiva a volver — propuesta, decide Sergio).
- **Restaurante sin catálogo de redención** (multi-tenant): Paco responde solo
  el saldo y no inventa premios.
- **"Quiero redimir ya" por el chat**: FUERA de alcance de esta fase — el canje
  sigue siendo presencial/en pedido como hoy. Si lo pide, Paco explica cómo
  redimir (frase configurable). Fase de seguridad de canje remoto: aparte.

## Pruebas en banco (antes de producción, como siempre)
- "¿Cuántos puntos tengo?" con número con saldo (usar un tel de PRUEBA con fila
  sembrada en pos_puntos, luego borrarla) → saldo exacto.
- "¿Qué me alcanza?" con saldo intermedio → solo lo alcanzable.
- "¿Qué puedo redimir?" → lista completa.
- Mixto: "¿cuántos puntos tengo? y me das una mixta familiar" → responde puntos
  Y captura el pedido.
- Regresión: precio puntual, categoría en texto, carta, pedido normal.

## No olvidar
- Los números de PRUEBA no deben quedar en pos_puntos al terminar.
- Documentar en ESTADO-SISTEMA + commit al cerrar.
