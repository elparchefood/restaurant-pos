# Errores de Paco con clientes REALES — registro único

> **Qué es esto.** Cada error que Paco cometió atendiendo a un cliente de verdad
> (no en pruebas), con su causa y cómo quedó resuelto. El detalle técnico
> completo vive en la entrada de `ESTADO-SISTEMA.md` que se cita en cada caso —
> aquí está el resumen para leerlo de corrido.
>
> **Para qué sirve.** (1) Ver de un vistazo qué ha fallado y qué está blindado.
> (2) Alimentar el entrenamiento final de Paco: cada error es un caso de prueba
> del banco. (3) Historial de confiabilidad de cara a la venta.
>
> **Regla de mantenimiento:** cada vez que se arregle un error nuevo de Paco con
> un cliente real, se agrega AQUÍ su fila además de la entrada en
> ESTADO-SISTEMA.md. Si esta lista se desactualiza, deja de servir.

Última actualización: **17-ago-2026 (noche)** · Errores resueltos: **25** · Abiertos: **3**

---

## Qué significa "atender sin errores" (definido por Sergio, 17-ago-2026)

Este es el contrato. Paco atiende sin errores cuando cumple ESTO — ni más ni menos:

**Lo que tiene que hacer PERFECTO (el flujo acotado):**
- Recibir el pedido: producto, presentación, variable y cantidad correctos.
- Precios correctos, siempre desde la carta. Jamás un precio inventado o interno ($0).
- Método de pago bien capturado.
- Si es a domicilio o para recoger, bien entendido.
- Dar información básica: precios, carta, horarios, ubicación — todo lo que ya
  tiene conectado.

**Lo que hace cuando algo se sale de eso:**
- Cliente que dice algo extraño, ambiguo o fuera del flujo → **pasar a humano.**
  Eso NO es un error: es la válvula. El error sería inventar.

**La única categoría que cuenta como fallo: CERRAR MAL** — cobrar mal, prometer
mal, crear un pedido incorrecto, o afirmar algo falso. Pasar a humano de más es
mejorable; cerrar mal es inaceptable.

**Cómo se sabrá que se llegó:** la medición semanal (pendiente ya anotado) de
cierra bien / pasa a humano / cierra mal. Meta: **cierra mal = 0** sostenido
con volumen real durante 2-3 semanas.

---

## Los patrones que más se repiten (leer antes de tocar a Paco)

1. **Caminos hermanos donde solo uno está completo.** Paco crea pedidos y
   clientes por VARIAS rutas (delay-reply efectivo, verify-transfer, la caja).
   Casi la mitad de estos errores fue arreglar una ruta y descubrir que la otra
   tenía su propia copia incompleta. *Pendiente de fondo: unificar la creación
   de pedidos en una sola ruta.*
2. **Los clientes reales no hablan como las pruebas.** "Salchipapa de pollo",
   "puedo pasar por ella", "una de 35" — nombres ambiguos, infinitivos, precios
   como identificador. Las pruebas de Sergio usaban nombres exactos y por eso
   no lo pescaban.
3. **El dato interno dicho tal cual.** Precios en $0, códigos de barrio, marcas
   anti-replay impresas en la factura: lo que es interno no se le muestra al
   cliente jamás.
4. **Errores que fallan en silencio.** El `EXCEPTION WHEN OTHERS THEN NULL` del
   trigger, la adición descartada sin avisar, el INSERT que PostgREST no
   conocía. Regla: todo error debe dejar rastro (trg_debug, logs).

---

## Resueltos

| # | Fecha | Cliente | Qué vio el cliente | Causa raíz | Arreglo | Entrada |
|---|-------|---------|--------------------|-----------|---------|---------|
| 1 | 15-ago | Isabella | Cobro de más: adición "Papas" ($8.000) que nadie pidió | El lector inventaba adiciones desde palabras compuestas ("salchipapa" → "papas") | Compuerta `nacioDeCompuesta()` + regla en el prompt | 134 |
| 2 | 15-ago | JP | Dijo "para llevar / yo la recojo" y le pidieron la dirección | Las ramas deterministas conocían LLEVAR_REGEX pero la línea de estado del prompt no | El prompt dice "PARA LLEVAR: JAMÁS pidas dirección" | 135 |
| 3 | 15-ago | Isabella | Factura a nombre de "Ciudad jardín" (su barrio) | `extractNombre` tomó el barrio como nombre | Compuerta: una zona con precio o conjunto conocido no es un nombre | 135 |
| 4 | 15-ago | Isabella | En el chat aparecía su pedido VIEJO (1-ago) con otro total | Los pedidos de Paco no enganchaban `order_id` ni llamaban cambiar-estado | Paridad con el camino manual en delay-reply y verify-transfer | 135 |
| 5 | 15-ago | Isabella | Factura sin su teléfono y sin puntos | Las notas no llevaban `[tel:]` y el cliente se buscaba con el 57 pegado | Formato canónico `direccion [barrio:X] [tel:Y]` + `telLocalVT` | 136 |
| 6 | 15-ago | Isabella y 38 más | "Solo me aparecen los puntos de hoy" | Los puntos ganados antes de existir el historial solo vivían en el saldo | Historial reconstruido: 39 movimientos "Compras anteriores" | 137 |
| 7 | 15-ago | Isabella | Pagó verificado y sin puntos del día | El trigger solo disparaba al cambiar status, y los pedidos del bot viven en `open` | El trigger también dispara cuando la plata cubre el total | 138 |
| 8 | 15-ago | Isabella | Sergio apagó a Paco y Paco seguía contestando "estamos para servirte" | Ramas nuevas respondían ANTES de la compuerta de human_takeover | Compuerta 5-pre al inicio de todas las ramas que responden | 139 |
| 9 | 15-ago | Emily | "Salchipapa de pollo" cotizada a $9.000 (era $17.000): casó con el "Pollo" de ADICIONES | Con nombres repetidos entre categorías, el desempate caía al primero de la lista | Tres desempates en matchCatalogo (categoría tolerante, tipo en el nombre, adiciones nunca ganan) | 140 |
| 10 | 15-ago | 573113538271 | Pidió la carta Y un pedido en el mismo mensaje: el pedido se ignoró | La rama de la carta terminaba el turno con un return incondicional | Si el lote también pide, la carta sale y el flujo sigue | 141 |
| 11 | 15-ago | 573044868407 | Volvió a los 12 días con "Buenas noches" y Paco lo DESPIDIÓ | El clasificador leyó la historia vieja (terminada en "gracias") como despedida | Un lote que es SOLO un saludo jamás entra a la rama de despedida | 142 |
| 12 | 15-ago | Emily y Ana María | Pagaron y no salieron puntos (~90 min) | La migración copió el ON CONFLICT de la versión VIEJA del repo; el error se tragaba en silencio | ON CONFLICT por expresión `pos_tel10` + errores a `trg_debug` | 143 |
| 13 | 15-ago | Isabela (3206656129) | Comprobante perfecto rechazado | El OCR leyó un 6 doblado en la llave (11 dígitos vs 10) | `unDigitoDoblado()`: un dígito insertado es tropiezo de lectura; una sustitución se sigue rechazando | 144 |
| 14 | 15-ago | Brayan | Paco cotizó $31.000 con domi y el pedido se creó por $26.000 sin domi | createWhatsappOrder descartaba el domi por malinterpretar la regla "el domi nunca suma a ventas" | total = comida+empaque+domi · total_final = la venta · delivery_fee aparte (en los DOS caminos) | 146 |
| 15 | 15-ago | Brayan, Andrés | Sus fichas sin la etiqueta del barrio en el chat | Los dos creadores de clientes del bot no guardaban `barrio` | Ambos lo guardan + backfill de los 2 | 147 |
| 16 | 15-ago | (la caja de Sergio) | El cierre de caja bloqueado por pedidos del bot "abiertos" ya entregados | Los pedidos del bot nacen open a propósito y nadie los cerraba | Al pasar a ENTREGADO con pago completo, se cierra solo | 148 |
| 17 | 16-ago | Katerine, Adriana | Dijeron "puedo pasar por ella" / "para pasar a recogerlo" y Paco insistió con la dirección | LLEVAR_REGEX solo conocía verbos conjugados ("paso", "recojo"), no infinitivos | Reconocedor reescrito como lista con 50 casos de banco (27 sí / 23 no, incluidas las frases de PUNTOS que no deben confundirse) | 171 |
| 18 | 16-ago | (la cocina) | Comandas de Paco con otro formato ("Salchipapa Premium · Familiar" vs "Familiar · Premium") | Paco anteponía el tipo de comida; la caja pone la presentación primero | `nombreComanda` con la fórmula exacta de la caja, en los DOS caminos; verificado en las 111 combinaciones del catálogo | 172 |
| 19 | 17-ago | David | "Premium cuesta: familiar $0 y personal $0" | El precio de la Premium vive en la VARIANTE y `precioPuntual` solo leía la presentación (0 interno) | Lee el precio de donde vive + candado: $0 no se dice JAMÁS (si no se sabe, se pregunta lo que falta) | 173 |
| 21 | 17-ago | Mónica | Mandó la FOTO de la carta señalando la salchipapa que quería y **nadie le contestó** | El webhook, ante una imagen sin pago pendiente, no hacía NADA: ni encolaba respuesta ni pasaba a humano. Paco se quedaba mudo | La imagen entra a la cola como cualquier mensaje; el cerebro avisa que no ve fotos y pasa a un humano | 193 |
| 20 | 17-ago | Kevin | Prometió "en un momento te envío el resumen" y jamás llegó; sin pedido creado | Cuatro encadenadas: "AHÍ está bien" no cerraba el upsell · "Teléfono" (etiqueta de plantilla) quedó como nombre · entrega a un local = prepago, y ese mensaje lo redactaba el MODELO, que prometió en vez de explicar | Rechazos genéricos del upsell + etiquetas de plantilla nunca son nombre + frase FIJA del prepago (`frases.publico_efectivo`) + prohibido al modelo prometer acciones | 176 |

---

## Abiertos (anotados, con plan)

| # | Fecha | Cliente | Qué vio el cliente | Estado |
|---|-------|---------|--------------------|--------|
| A1 | 17-ago | Emily | Pidió 3 salchipapas Y una gaseosa EN EL MISMO MENSAJE: la gaseosa no se sumó ($61.000 en vez de $69.000) | **Para el 17-ago con calma.** Causa: el extractor devuelve UN solo producto por mensaje. Ya hay dos redes de seguridad (v302): si una "adición" es en realidad un producto de la carta se agrega como línea, y el aviso ya no afirma "no va en el pedido" sino que pregunta cuál quiere. Lo de fondo — extractor multi-producto — es la pieza más delicada de Paco: hacerlo con el banco de 54 pedidos al lado, fuera de horario. |
| 22 | 18-ago | Sneider | Dijo "conjunto portal de pomona ... Casa 13" y Paco le pidió calle y carrera — una calle que no existe | El control de conjunto se hacía contra la LISTA de conjuntos registrados (`esConjunto`), no contra lo que el cliente escribió. Portal de Pomona no estaba entre los 50 registrados | Si el mensaje dice conjunto/torre/edificio/apto, se trata como conjunto aunque no esté registrado: se le pide la unidad, no la calle. Corregido en las DOS ramas hermanas | 195 |
| 23 | 18-ago | Sandra | Dijo "Pra pasar recogiendo" y Paco le siguió pidiendo la dirección | El reconocedor de RECOGER no tenía el GERUNDIO. Cubre "para recoger", "paso a recoger", "recogerlo"… pero no "pasar recogiendo" | Dos formas nuevas, atadas a un verbo de moverse para no confundir con las frases de puntos. 13 casos de prueba (7 sí / 6 no) | 196 |
| 24 | 18-ago | Shirley | Escribió "premiun mixta personal" (errata) y Paco cotizó la salchipapa Mixta $26.000 en vez de la Premium mixta $34.000; los intentos de corregir la enredaron más | El buscador de productos comparaba EXACTO: "premiun" no casaba con nada y "mixta" sí | Se tolera UNA letra de error en nombres de 6+ letras, sin tocar palabras que ya son otro producto exacto. Reproducido: mismo resumen que cobró Sergio ($35.000+$5.000) | 197 |
| 25 | 18-ago | Francisco | (1) El pedido quedó a nombre de "Cuanto se demora" — su pregunta se capturó como nombre. (2) Dijo "pago con un billete de 100" y Paco le pidió el comprobante, pagando en efectivo | (1) Cuatro caminos capturan nombres y ninguno filtraba preguntas. (2) "billete" no era señal de efectivo para el clasificador y el redactor no tenía prohibido pedir comprobante en efectivo | Compuerta de preguntas en los CUATRO caminos + "billete" = efectivo + regla dura: en efectivo jamás se pide comprobante. Ahora responde la pregunta ("unos 30 min") y re-pregunta el nombre | 199 |
| A3 | 18-ago | Mariam | Pidió salchipapa + coca cola + salsa en UN mensaje: la coca cola no entró al resumen y cobró $28.000 en vez de $33.000 | **REPRODUCIDO y localizado.** El extractor está BIEN (con su texto exacto devuelve los 3 productos y $32.000). Se pierde después: el resumen se arma del ESTADO de la conversación, que solo guarda UN producto del mensaje. La salsa entró por un camino de reparación; la bebida no entró por ninguno. Falta el arreglo de fondo en la máquina de estado. |
| A2 | 15-ago | — | (riesgo latente, sin caso reportado) `resolverPedido` de verify-transfer tiene su PROPIO matching de items sin los tres desempates de la entrada 140 | Los totales salen bien (usan total_mostrado), pero un item de la comanda podría salir con nombre de la categoría equivocada. Revisar junto con A1. |

---

## Cómo se verifica un arreglo (el método que ha funcionado)

1. **Leer la conversación real completa** en la base, no el resumen del reporte.
2. **Reproducirla en el banco** (`delay-reply-banco`) mensaje por mensaje, con
   credenciales falsas — nada le llega a ningún cliente real.
3. Arreglar la **causa**, no el dato (el dato también, pero aparte).
4. **Repetir la conversación real en el banco** + un caso de control que
   ejercite lo contrario (que el arreglo no rompa lo que funcionaba).
5. **Borrar las conversaciones de prueba.**
6. Desplegar con smoke test (la API dice ACTIVE incluso con BOOT_ERROR).
7. Documentar en ESTADO-SISTEMA.md **y en este archivo**.

⚠️ El modelo da ±1 entre corridas idénticas: jamás concluir de una sola corrida.
