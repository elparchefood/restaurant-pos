# Plan — Facturación electrónica DIAN

> Investigado y escrito: 2026-07-31
> **Cuándo se hace:** es lo **ÚLTIMO** antes de lanzar Cobra. Decisión de Sergio:
> primero se corrige y completa todo lo demás; esta función es la que permite
> *empaquetar Cobra y venderlo* a restaurantes formales.
>
> **Prerrequisito ya cumplido:** impuestos (entrada 62 de `ESTADO-SISTEMA.md`).
> El impuesto ya se calcula, se congela en cada venta y se guarda por tarifa.

---

## 1. Por qué se hace aunque El Parche no la necesite

El Parche es **no responsable de impoconsumo** y nunca va a emitir una factura
electrónica. Pero:

- El restaurante formal **está obligado** y no te va a comprar sin esto.
- El dueño no pregunta cómo funciona: dice *"necesito facturación electrónica"*.
  Es una casilla que se marca o se pierde la venta.
- Con un proveedor de **pago por uso, tenerla construida y sin usar cuesta $0/mes**.

Por eso no se espera a que un cliente la pida: se llega con ella lista.

---

## 2. Cómo funciona, en una frase

Hoy imprimes un recibo. Una factura electrónica es un documento que **la DIAN
valida antes de que el cliente lo reciba**.

```
1. Se cobra el pedido
2. Cobra arma la factura y la manda al proveedor
3. El proveedor la firma y la envía a la DIAN
4. La DIAN responde: aceptada → devuelve el CUFE
5. Se imprime el recibo CON el CUFE y su QR
```

El **CUFE** es el código único que prueba que esa factura existe ante la DIAN.
Sin CUFE, el papel no es una factura legal.

---

## 3. Lo que aporta cada quien

**Cobra construye el puente UNA sola vez.** Cada restaurante llega con sus
propias llaves. Cobra no paga nada por tener la función lista y sin usar.

| Concepto | Lo paga | Cuándo |
|---|---|---|
| La integración (una vez, sirve para todos) | Cobra | Al construirla |
| Habilitación ante la DIAN | Cada restaurante | Al contratar |
| Resolución de numeración | Cada restaurante | Al contratar |
| Certificado digital (~$150.000/año) | Cada restaurante | Al contratar |
| Costo por documento emitido | Cada restaurante, o dentro de su plan | Al usar |

**Oportunidad comercial:** incluir N facturas en el plan mensual de Cobra y
cobrar el excedente. Le simplifica la vida al restaurante y deja margen.

---

## 4. Proveedor — investigación (2026-07-31)

Nadie se conecta directo a la DIAN: el protocolo es complejo y el servicio se
cae seguido. Se usa un proveedor tecnológico que arma el XML, lo firma, lo envía
y devuelve el CUFE.

### Los dos candidatos

| | **Alanube** | **Factus** |
|---|---|---|
| Países | Colombia, Rep. Dominicana, Costa Rica, Panamá — **misma API** | Solo Colombia |
| Enfoque | **API-first, pensado para ISV** (software que factura para muchos) | POS/ERP, modelo de parámetros simplificado |
| Sandbox | Sí, **gratis** | Sí |
| Precio | No publicado en su sitio ("paga solo por lo que emites"). Un comparador de terceros menciona **desde ~$150 COP/doc a alto volumen** | No publicado |
| Webhooks | Sí, con firma HMAC e idempotencia | Por confirmar |
| SDKs | Node, Python, Go | Comunidad (SDK no oficial en GitHub) |
| Autenticación | Token por ambiente | `client_id` + `client_secret` + usuario/contraseña |

### Recomendación: **Alanube**, y no por poco

1. **Está diseñado para lo que es Cobra**: un software que factura a nombre de
   muchas empresas. Factus está más pensado para *una* empresa que factura lo suyo.
2. **Sandbox gratis** → se construye y se prueba completo sin cliente real.
3. **Modelo por documento**, no por licencia → el costo escala con lo que cada
   restaurante factura, que es como debe ser en un SaaS.
4. **Multi-país con la misma API.** Los requerimientos dicen *"para otros países:
   exportación CSV/JSON + webhook"*. Con Alanube, expandir a Panamá o Costa Rica
   no es reescribir: es otro endpoint.
5. **Webhooks con idempotencia** — clave para la cola de reintento (§7).

Factus queda como plan B: está muy ajustado al Anexo Técnico de la DIAN y es
100% colombiano, lo cual es una virtud si Cobra nunca sale de Colombia.

### Lo que hay que confirmar ANTES de escribir código

Escribirle a Alanube (y a Factus para comparar) y preguntar exactamente esto:

1. **Multi-tenant real:** ¿una sola cuenta de Cobra puede emitir a nombre de N
   restaurantes, cada uno con su NIT, su resolución y su certificado? ¿O cada
   restaurante necesita su propia cuenta? *(Esto define todo el onboarding.)*
2. **Precio real** para el volumen esperado, y si hay costo fijo mensual.
3. **Quién carga el certificado digital**: ¿lo sube el restaurante en el portal
   del proveedor, o tiene que pasar por Cobra? *(Preferible que NO pase por
   Cobra: es material sensible.)*
4. **Tiempo de habilitación** de un restaurante nuevo, de punta a punta.
5. **Qué pasa si la DIAN está caída**: ¿el proveedor encola y reintenta, o eso
   le toca a Cobra?

> Nota: la documentación de `developers.factus.com.co` y `factus.com.co`
> bloquea la lectura automática (HTTP 403), así que lo de Factus viene de su SDK
> público y de comparativas de terceros. Antes de decidir, hay que leerla a mano
> o pedirle acceso al proveedor.

---

## 4-bis. Multi-empresa: CONFIRMADO en la documentación

La pregunta que decidía todo era: *¿una sola cuenta de Cobra puede facturar a
nombre de muchos restaurantes, cada uno con su NIT?*

**Sí.** La documentación de Alanube expone endpoints de **gestión de empresas**:

- `Dar de alta a una empresa` — registrar una empresa **por API**
- `Obtener información de la empresa` (por token o por id)
- `Actualizar información de la empresa`
- `Empresas asociadas` — listado paginado de las empresas vinculadas a la cuenta

Es decir: **Cobra registra a cada restaurante por API bajo su propia cuenta**, y
cada factura sale con el NIT, la razón social y la resolución de ESE restaurante.
Exactamente el modelo que se necesita.

*(Pendiente de confirmar por escrito con su equipo comercial: los términos y el
precio de ese modelo para un ISV.)*

## 4-ter. Cómo debe vivirlo el dueño del restaurante

**El objetivo (Sergio):** *"lo ideal sería que mediante Cobra, las personas no
deben registrarse en nada, pero cada facturación saldría con los datos de cada
restaurante."*

Se puede casi todo, pero hay una parte que **no se puede delegar por ley**:

| Paso | ¿Lo puede hacer Cobra por él? |
|---|---|
| Cuenta con el proveedor tecnológico | **Sí** — se crea por API, invisible |
| Configurar su NIT y razón social | **Sí** — lo escribe una vez en Cobra |
| Cargar el certificado digital | **Sí**, si el proveedor lo permite por API |
| **Habilitación ante la DIAN** | **No.** Es un acto legal del restaurante |
| **Resolución de numeración** | **No.** La DIAN se la da a él, con su NIT |

O sea: **el restaurante nunca se registra en un proveedor externo ni ve otra
plataforma**, pero sí tiene que hacer su trámite ante la DIAN. Nadie puede
hacerlo por él.

**Recomendación — onboarding asistido.** Convertir ese trámite en un asistente
dentro de Cobra: una pantalla que le diga paso a paso qué pedir, dónde, y le
reciba los datos. Que sienta que Cobra se lo resolvió, aunque el trámite sea suyo.
Eso es una ventaja de venta real: la mayoría de los competidores lo deja solo.

## 4-quater. Precios — CUIDADO: son dos modelos distintos

> Aquí hubo una confusión en una versión anterior de este documento: se
> mezclaron en una sola tabla el costo del **proveedor de API** y los precios de
> la **competencia**. No son lo mismo.

### A) Lo que Cobra le paga al proveedor de API — POR USO

Alanube: **"paga solo por lo que emites"**. No publica tarifas.
Un comparador de terceros menciona **desde ~$150 COP/documento a alto volumen**
(sí: ciento cincuenta pesos, unos 4 centavos de dólar — el proveedor solo
transporta el documento, no vende software).

**LO QUE NO SE SABE Y HAY QUE PREGUNTAR:** si además del pago por documento hay
**mínimo mensual o costo de plataforma**. Muchos proveedores de API lo tienen.
Sin esa respuesta no se puede calcular el margen. *(Ver §4, pregunta 2.)*

### B) Lo que cobra la COMPETENCIA al restaurante — MENSUALIDAD

Esto **no es un costo de Cobra**: es el precio contra el que Cobra va a competir.

| Sistema | Precio | Qué incluye |
|---|---|---|
| Alegra | desde ~$39.000 COP/mes | POS + facturación + contabilidad + inventario |
| Siigo POS Gastrobar | $87.494 COP/mes | POS para restaurante/bar |

Referencia de lo que cobran otros proveedores tecnológicos al restaurante
directo: $30.000–$80.000/mes (básico), $80.000–$200.000/mes (intermedio), y
algunos regalan de 20 a 50 documentos al mes.

### C) La cuenta que hay que hacer antes de poner precio

A $150 COP/documento, un restaurante que emite **500 facturas/mes** le cuesta a
Cobra **~$75.000**. Si Cobra se vende al precio de Siigo (~$87.000), la
facturación **se come el plan casi completo**.

Salidas posibles:
- Incluir un **cupo de facturas** en cada plan y cobrar el excedente.
- Cobrar la facturación electrónica como **módulo aparte**.
- Subir el precio del plan para los que facturan.

**Esta es una decisión de negocio de Sergio, no técnica**, y es la razón por la
que esta función se hace **de última**: para poder fijar los planes con el costo
real ya conocido, no con estimaciones.

### D) Lo que paga el restaurante aparte, en cualquier caso

| Concepto | Costo |
|---|---|
| Certificado digital | ~$150.000 COP/año |
| Habilitación DIAN y resolución | Gratis, pero es trámite suyo |

---

## 5. Qué hay que construir en Cobra

### 5.1 Configuración (por restaurante)
La sección **Configuración → Impuestos y propina** ya tiene NIT, razón social y
resolución. Falta agregar:

- Credenciales del proveedor (por sucursal o por tenant).
- Ambiente: pruebas / producción.
- Prefijo y rango de numeración autorizado, con su vigencia.
- Interruptor maestro **"Facturar electrónicamente"**, apagado por defecto —
  igual que impuestos: quien no lo usa no lo ve.

### 5.1-bis Asistente de habilitación 🟢 *(aprobado por Sergio)*

El trámite ante la DIAN no se puede delegar, pero **la experiencia sí**. En vez
de mandarle un PDF al dueño, Cobra lo lleva de la mano.

**Pantalla:** Configuración → Facturación electrónica → *Activar*.
Un asistente con pasos, que guarda el avance y se puede retomar.

| Paso | Qué hace el dueño | Qué hace Cobra |
|---|---|---|
| 1. Tus datos | Escribe NIT, razón social, dirección, régimen | Valida el formato del NIT y lo guarda |
| 2. ¿Ya estás habilitado? | Responde sí / no | Si dice que no, muestra el paso 3; si sí, salta al 4 |
| 3. Habilitación DIAN | Sigue las instrucciones y avisa cuando termine | Muestra **qué pedir, dónde y con qué datos**, con enlace directo al portal de la DIAN |
| 4. Resolución de numeración | Escribe prefijo, desde, hasta y vigencia | Valida el rango y calcula cuántas facturas le alcanzan |
| 5. Certificado digital | Lo sube, o indica que ya lo cargó | Lo envía al proveedor (nunca se guarda en Cobra) |
| 6. Prueba | Toca "Emitir factura de prueba" | Emite en **sandbox**, muestra el CUFE y el resultado |
| 7. Listo | Confirma | Pasa a producción y enciende el interruptor |

**Reglas del asistente**
- Cada paso se puede dejar a medias y retomar después: el trámite de la DIAN
  toma días, no se hace de una sentada.
- Ningún paso puede saltarse en falso: sin resolución válida no se factura.
- El paso 6 (prueba en sandbox) es **obligatorio** antes de producción. Nadie
  debería emitir su primera factura real a un cliente de verdad.
- Si algo falla, el mensaje dice **qué hacer**, no un código de error.
- Cobra **no guarda** el certificado digital: lo pasa al proveedor y lo olvida.

**Por qué vale la pena:** es el momento más frágil de la venta. Un dueño que se
traba en la habilitación cancela el servicio. La mayoría de los competidores lo
deja solo aquí — hacerlo bien es una ventaja comercial real, no un adorno.

### 5.2 Consecutivo seguro 🔴
**El punto que más duele si se hace mal.** Si dos cajas facturan al mismo tiempo
y ambas toman el número 501, es un problema legal.

- Tabla `pos_facturacion_rangos`: prefijo, desde, hasta, vigencia, actual.
- El número se pide a la **base de datos con bloqueo** (`SELECT … FOR UPDATE` o
  una secuencia por resolución). **Nunca calculado en el navegador.**
- Alerta cuando quede poco rango (ej. 90% consumido) — pedir una resolución
  nueva a la DIAN toma días.

### 5.3 Emisión
- Tabla `pos_facturas`: pedido, número, prefijo, estado, CUFE, XML/PDF, respuesta
  del proveedor, intentos, timestamps.
- Edge Function `emitir-factura`: arma el JSON, lo manda al proveedor, guarda el
  CUFE. Los datos de impuesto salen de lo ya **congelado** en la venta — no se
  recalculan.

### 5.4 Cola y reintento 🔴
**Tiene que funcionar sin internet.** Si se cae la conexión, el cliente no puede
quedarse esperando.

- La venta se cierra y se imprime un **recibo provisional**.
- La factura queda `pendiente` y se envía sola cuando vuelva la conexión.
- Reintento con espera creciente; después de N intentos, alerta visible.
- Idempotencia: reintentar **nunca** puede emitir dos facturas del mismo pedido.

### 5.5 Notas de crédito 🔴 — va junto, no aparte
Una factura electrónica emitida **no se borra**: se anula con una nota de
crédito. Hoy anular un pedido solo lo marca `cancelled`.

- Tabla `pos_notas` (tipo, factura de origen, motivo DIAN, valor).
- Flujo de emisión desde el pedido ya facturado.
- Su propio consecutivo, distinto al de facturas.

**Facturar sin esto deja un problema legal en la primera anulación.**

### 5.6 Recibo
- CUFE + código QR.
- Prefijo y número de la factura.
- Resolución DIAN y su vigencia.
- Datos del adquiriente cuando el cliente los pide (hoy el chat ya captura
  nombre y teléfono; faltaría NIT/cédula opcional).

### 5.7 Informe `ger-dian`
No es un listado: es un **panel de control**. Documentos con su estado, los
rechazados destacados, y botón de reenvío. Una factura rechazada y no atendida
es una multa esperando.

---

## 6. Fases

| # | Fase | Qué incluye |
|---|---|---|
| 0 | **Confirmar proveedor** | Las 5 preguntas del §4. Sin esto no se escribe código. 🟡 **Correo redactado y listo para enviar: `CORREO-PROVEEDOR-DIAN.md`** (21-ago) |
| 1 | **Configuración + consecutivo** | Credenciales, rangos, bloqueo del número, alertas. ✅ **BASE HECHA (21-ago)**: `pos_facturacion_rangos`, `pos_facturas`, `fn_factura_numero` (bloqueo de fila, un pedido = una factura, rango agotado no emite) y `fn_factura_rango_estado` (alerta de %). SQL: `supabase/sql/2026-08-21-facturacion-dian-base.sql`. Falta la PANTALLA de configuración. |
| 1b | **Asistente de habilitación** | Los 7 pasos del §5.1-bis, con prueba en sandbox |
| 2 | **Emisión en sandbox** | Edge Function, tabla `pos_facturas`, CUFE de prueba |
| 3 | **Cola y reintento** | Recibo provisional, reenvío automático, idempotencia |
| 4 | **Notas de crédito** | Anulación real de una factura emitida |
| 5 | **Recibo + panel `ger-dian`** | CUFE, QR, estados, reenvío manual |
| 6 | **Habilitación real** | Con un restaurante piloto, en producción |

Las fases 1 a 5 se hacen **completas en sandbox**, sin cliente y sin costo.
La 6 necesita un restaurante real con su NIT.

---

## 7. Reglas duras (no negociables)

1. **El consecutivo sale de la base con bloqueo.** Nunca del navegador.
2. **Reintentar no puede duplicar.** Idempotencia por pedido.
3. **Sin internet se sigue vendiendo.** Recibo provisional + cola.
4. **Los impuestos se leen congelados de la venta.** Nunca se recalculan: una
   factura ya emitida no puede cambiar.
5. **El certificado digital no pasa por Cobra** si se puede evitar. Es material
   sensible del restaurante.
6. **Apagado por defecto.** El restaurante que no factura no ve nada de esto.
7. **Un rechazo de la DIAN siempre se ve.** Nunca falla en silencio.

---

## 8. Antes de empezar — checklist

- [x] ~~Confirmar multi-empresa~~ → **confirmado en la documentación** (§4-bis)
- [ ] Contactar Alanube: precio real para ISV, y las preguntas 3-5 del §4
- [ ] Contactar Factus para comparar (su documentación pública está bloqueada)
- [ ] Decidir proveedor con las respuestas en la mano
- [ ] Abrir cuenta de sandbox
- [ ] Definir el plan comercial: cuántas facturas incluye cada plan de Cobra
- [ ] Confirmar que el resto de Cobra ya está corregido (es lo último antes de lanzar)

---

## 9. Fuentes

- [Alanube — API de facturación electrónica DIAN Colombia](https://www.alanube.co/colombia/)
- [Alanube — documentación para desarrolladores](https://developer.alanube.co/docs/getting-started)
- [Comparativa Top 5 APIs de facturación electrónica en Colombia](https://www.apiparafacturar.com/posts/col-top5-apis-facturacion-electronica-colombia-2025)
- [Factus — sitio oficial](https://www.factus.com.co/)
- [Factus — documentación para desarrolladores](https://developers.factus.com.co/)
- [SDK comunitario de Factus (GitHub)](https://github.com/juacosoft/FactusDian-SDK)

---

# 10. FACTUS — precios, terminos y cuentas reales (3-sep-2026)

Datos que **ya tenemos en firme** (correo de Factus + su tarifario + los
terminos y condiciones 2026). Se escriben aqui porque en su momento no se
anotaron y se perdieron: no volver a dejarlos solo en un correo.

## 10.1 Lo que Factus SI hace, y lo que no

Su objeto, textual en los terminos (§f.1): facturas electronicas, **notas
credito y debito**, documentos soporte, notas de ajuste y **nomina
electronica**.

**NO hace documento equivalente POS electronico.** Lo confirman dos veces: en
el correo (*"Solo manejamos Factura electronica"*) y en los terminos, donde no
aparece. Su recomendacion para POS es emitir **factura electronica a consumidor
final**.

> **Decision de Sergio (3-sep):** se acepta. *"Si incluso hacer tickets consume
> parte de la factura electronica no importa, porque de aqui a manana no me van
> a entrar sin clientes. En el momento que ya tengamos volumen ya podemos
> pasarnos a Alanube."* Por eso el proveedor va detras de un adaptador.

## 10.2 Los dos modelos de compra

### A) Bolsa anual multifacturador — pensada para SaaS multitenant

Una sola bolsa que **el aliado reparte entre los NIT que quiera**.
**NO incluye certificado digital: $130.000/ano por cada NIT.**

| Documentos/ano | Valor bolsa | COP por documento |
|---:|---:|---:|
| 10.000 | $630.000 | 63,0 |
| 20.000 | $1.120.000 | 56,0 |
| 50.000 | $2.250.000 | 45,0 |
| 80.000 | $3.200.000 | 40,0 |
| 120.000 | $3.840.000 | 32,0 |
| 200.000 | $5.600.000 | 28,0 |
| 500.000 | $12.000.000 | 24,0 |
| 750.000 | $16.500.000 | 22,0 |
| 1.000.000 | $21.000.000 | 21,0 |

### B) Planes anuales por NIT — **el certificado VA INCLUIDO**

| Documentos/ano | Valor | COP por documento |
|---:|---:|---:|
| 150 | $169.000 | 1.126,7 |
| 400 | $190.000 | 475,0 |
| 1.600 | $220.000 | 137,5 |
| 2.500 | $260.000 | 104,0 |
| 5.000 | $290.000 | 58,0 |
| 10.000 | $390.000 | 39,0 |
| 15.000 | $440.000 | 29,3 |
| 20.000 | $490.000 | 24,5 |
| 35.000 | $820.000 | 23,4 |
| 50.000 | $1.100.000 | 22,0 |
| 80.000 | $1.700.000 | 21,3 |
| 120.000 | $2.160.000 | 18,0 |

Incluyen **rangos de numeracion ilimitados para sucursales, sin limitacion por
ventas**.

### ⚠️ El resultado del calculo, que es contraintuitivo

**Los planes por NIT salen MAS BARATOS por documento que la bolsa
multifacturador, y encima traen el certificado.** A 10.000 documentos: $390.000
el plan contra $630.000 la bolsa, y la bolsa ademas suma $130.000 de
certificado. La diferencia se mantiene en todos los tramos.

Lo unico que compra la bolsa es **flexibilidad**: es un solo bote del que se
sirve cualquier restaurante sin predecir cuanto va a gastar cada uno, y un
cliente nuevo arranca al instante sin comprarle nada. Con planes por NIT hay
que dimensionar cada uno por adelantado y comprar otro si se pasa.

**Recomendacion:** empezar con **planes por NIT** (mas barato y con
certificado), y pasarse a bolsa solo cuando haya tantos restaurantes que
dimensionar uno por uno sea el problema.

## 10.3 Lo que el restaurante consume — la cuenta que decide el precio

Si se emite **una factura por cada tiquete**:

| Ritmo | Docs/ano | Plan que toca | Costo/mes por restaurante |
|---|---:|---|---:|
| 50 tiquetes/dia | 18.250 | 20.000 · $490.000 | **$40.800** |
| 150 tiquetes/dia | 54.750 | 80.000 · $1.700.000 | **$141.700** |
| 300 tiquetes/dia | 109.500 | 120.000 · $2.160.000 | **$180.000** |

Contra un plan Pro de $249.000, eso es entre el 16 % y el 72 % del precio de
venta. **Facturacion ilimitada dentro del plan no se sostiene.**

Si en cambio se emite **solo cuando el cliente la pide** (lo normal en un
restaurante, del orden del 10 %):

| Ritmo | Docs/ano | Plan que toca | Costo/mes por restaurante |
|---|---:|---|---:|
| 150 tiquetes/dia, 10 % pide factura | 5.475 | 10.000 · $390.000 | **$32.500** |

Esa es la diferencia entre que quepa en el plan y que no.

## 10.4 ⚠️ Dos clausulas de los terminos que hay que tener presentes

**1. No hay devoluciones (§f.6).** Pasados 5 dias habiles, Factus *"no
realizara ninguna devolucion de dinero, tomandose el valor recibido como pago
de clausula penal"*. Y cada bolsa **dura 1 ano desde la compra**: lo que no se
gaste, se pierde. Comprar grande es una puerta de un solo sentido.

**2. Si no se renueva, se bloquea TODO (§f.9).** *"En caso de vencerse el plazo
de suscripcion y no realizar la renovacion, FACTUS bloqueara automaticamente la
cuenta impidiendo el uso de las herramientas y modulos."* Con una bolsa
compartida eso significa que **todos los restaurantes dejan de facturar el
mismo dia**. Hay que avisar del vencimiento con margen dentro de Cobra, igual
que se avisa del rango de numeracion por agotarse.

Otras dos que conviene saber:

- **§f.11 — el reloj corre igual.** Hay 8 dias calendario para mandar los
  papeles del certificado; si no, el plan empieza a contar desde el noveno
  aunque no este activo.
- **§f.10 — si se emite una factura por error, es problema nuestro.** Por eso
  la idempotencia (regla dura 2) no es opcional.

## 10.5 Papeles para ser aliado (§2.5 de los terminos)

Nombre de usuario · correo · **camara de comercio no mayor a 30 dias** ·
cedula del representante legal · **RUT** · **acuerdo de alianza y acuerdo de
confidencialidad**.

> Recordatorio: mandarle el RUT a Factus es papeleo para abrir cuenta. **NO es
> lo mismo que registrar en el RUT la responsabilidad de facturador
> electronico ante la DIAN**, que si obliga a facturar siempre y no se hace
> todavia.

## 10.6 Sandbox

Endpoint `https://api-sandbox.factus.com.co`, API **V2**, con coleccion de
Postman y documentacion oficial.

**Las credenciales NO se guardan en este repositorio, que es publico.** Van en
los secretos de Supabase (`FACTUS_*`) y solo las lee la Edge Function.

## 10.7 Jurisdiccion

Bucaramanga, Colombia (§i). Legislacion colombiana.

---

# 11. DECISION: **FACTUS**, y se empieza ya (3-sep-2026)

Sergio, tras revisar los tres:

> *"Matias API no me llamo mucho la atencion porque si en algun momento algo
> falla, ellos no contestan. Factus siempre ha contestado."*

**El criterio no fue el precio ni la API: fue quien contesta el correo.** Y es
el criterio correcto para esto. La facturacion electronica no es una funcion
que se pueda quedar rota un fin de semana: si un restaurante no puede facturar,
no puede vender tranquilo. De un proveedor de infraestructura, que conteste
importa mas que unos pesos por documento.

| | Contesta | Estado |
|---|---|---|
| **Factus** | **Siempre** | ✅ **ELEGIDO** |
| Alanube | Siempre | Para despues: **piden un minimo** que hoy no se alcanza |
| MATIAS API | Le escribimos y **nunca contesto** | ❌ Descartado |

De MATIAS solo hay lo que esta publicado en su web y su documentacion; las
preguntas que se le mandaron por correo siguen sin respuesta.

## El camino, que ya esta decidido

1. **Hoy — Factus.** Se empieza y se lanza con ellos.
2. **Con volumen — Alanube.** Se le pierde el miedo al minimo cuando haya
   suficientes restaurantes. Alanube esta pensado para ISV multi-empresa y su
   precio por documento a volumen es mejor.

**Por eso el proveedor va DETRAS DE UN ADAPTADOR** y no repartido por el
codigo. No es purismo: es que el cambio ya esta planeado, con fecha difusa pero
decidido. Lo que dependa de Factus vive en un solo archivo; lo demas —el
consecutivo, la cola, las notas de credito, el recibo, la pantalla— no se
entera de quien emite.
