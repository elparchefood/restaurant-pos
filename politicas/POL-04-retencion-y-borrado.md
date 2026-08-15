# POL-04 — Política de Retención y Borrado de Datos

| | |
|---|---|
| **Organización** | Cobra POS — ABADIA CUAJI SERGIO ANDRES (persona natural, Colombia) |
| **Documento** | POL-04 |
| **Versión** | 1.0 |
| **Fecha de emisión** | 14 de agosto de 2026 |
| **Aprobada por** | Sergio Andrés Abadía Cuají — Titular y Responsable de Privacidad |
| **Próxima revisión** | 14 de agosto de 2027 |
| **Marco legal** | Ley 1581 de 2012 y Decreto 1074 de 2015 (Colombia) |

---

## 1. Minimización: la regla de entrada

Antes de guardar un dato hay que poder responder para qué sirve. Si la
respuesta es "por si acaso", no se guarda.

Cobra POS recoge únicamente:

| Dato | Para qué se necesita |
|---|---|
| **Teléfono del comensal** | Identificar la conversación de WhatsApp, avisar del estado del pedido y acumular sus puntos de lealtad |
| **Nombre del comensal** | Que el pedido salga a nombre de alguien |
| **Dirección y barrio** | Entregar el domicilio y calcular su costo |
| **Pedidos y consumo** | Operar el restaurante y liquidar los puntos de lealtad |
| **Datos de cuenta del cliente** (nombre, correo, contraseña con hash) | Dar acceso a la plataforma |
| **Datos del negocio** (nombre, dirección, NIT) | Facturación y configuración |
| **Comprobantes de pago** | Verificar que la transferencia entró |

**No se recoge** documento de identidad del comensal, fecha de nacimiento,
ubicación GPS continua, contactos del teléfono ni ningún dato de categoría
especial. Tampoco se venden, alquilan ni ceden datos personales a terceros con
fines comerciales.

## 2. Plazos de retención

| Tipo de dato | Plazo | Por qué |
|---|---|---|
| **Datos operativos** (pedidos, productos, mesas, turnos) | Mientras la cuenta esté activa. Tras la baja o la solicitud de borrado: **máximo 30 días** | Ya no hay finalidad que los sostenga |
| **Datos de comensales** (teléfono, nombre, dirección, puntos) | Mientras el restaurante mantenga la relación. Tras la baja: **máximo 30 días** | Íd. |
| **Conversaciones de WhatsApp** | **12 meses** desde el último mensaje | Sirven para resolver reclamos y para depurar el asistente. Pasado ese plazo pierden utilidad |
| **Comprobantes de pago e imágenes** | **12 meses** | Ventana razonable de disputa |
| **Datos de facturación y contables** | **Hasta 5 años** | Obligación legal colombiana. Sobrevive a la solicitud de borrado, según el artículo 9 de esta política |
| **Registros técnicos** (logs de acceso y de funciones) | **90 días** | Investigación de incidentes |
| **Registro de incidentes de seguridad** | **Mínimo 3 años** | Trazabilidad y auditoría — ver POL-03 |
| **Copias de seguridad** | Según la retención de Supabase | El borrado alcanza las copias en el ciclo siguiente de rotación |

## 3. Derechos de las personas

Toda persona cuyos datos estén en Cobra POS puede:

- **Acceder** a los datos que tenemos sobre ella.
- **Corregir** lo que esté inexacto o incompleto.
- **Descargar** sus datos en formato legible (portabilidad).
- **Eliminar** su cuenta y sus datos personales.
- **Oponerse** al tratamiento en los casos que la ley contempla.
- **Revocar el consentimiento** en cualquier momento.

**Cómo se ejerce:** escribiendo a `contacto@cobrapos.app` o usando el
formulario de `cobrapos.app/data-deletion`.

**Plazo de respuesta: 15 días hábiles**, según el aviso de privacidad
publicado. Si el caso requiere más tiempo, se comunica el motivo dentro de ese
mismo plazo.

## 4. Cuando el restaurante retira la autorización

Si un restaurante cliente cancela el servicio o retira su autorización:

1. Se cierra su acceso a la plataforma.
2. Se le ofrece la **exportación completa** de sus datos antes del borrado.
3. Sus datos operativos y los de sus comensales se eliminan en **máximo 30
   días**.
4. Solo sobrevive lo que la ley obliga a conservar (facturación, hasta 5 años),
   aislado y sin uso operativo.
5. Se confirma el borrado por escrito al cliente.

## 5. Procedimiento de borrado

1. **Verificar la identidad** de quien solicita. No se borra por una petición
   anónima: sería la vía perfecta para que un tercero destruya los datos de
   otro.
2. **Localizar** todo lo asociado: cuenta, pedidos, conversaciones,
   comprobantes, puntos de lealtad.
3. **Eliminar** de la base de datos y del almacenamiento de archivos.
4. **Registrar** qué se borró, cuándo y a solicitud de quién.
5. **Confirmar** al solicitante.

Las copias de seguridad se sobrescriben en su ciclo normal de rotación; ningún
dato borrado se restaura desde una copia salvo por orden judicial.

## 6. Datos en poder de terceros

Cuando se borran datos, se propaga la solicitud a los proveedores que puedan
tener una copia:

- **Supabase** — el borrado en la base de datos y el almacenamiento es directo.
- **Meta (WhatsApp)** — conserva el historial de mensajes según su propia
  política; Cobra POS elimina su copia local.
- **OpenAI** — el contenido enviado para procesar pedidos se rige por la
  política de retención de OpenAI para uso por API.
- **Wompi** — los registros de transacción se conservan por obligación legal
  del procesador de pagos.
- **Google (Gmail, solo lectura)** — Cobra POS no almacena los correos, solo
  lee el correo del banco para verificar una transferencia y guarda el
  identificador del mensaje ya usado.

## 7. Datos usados por el asistente de inteligencia artificial

El asistente de WhatsApp procesa el texto de las conversaciones para armar
pedidos. Sobre eso:

- El contenido se envía a OpenAI **solo para atender la conversación en curso**.
- No se usan las conversaciones de los clientes para entrenar modelos propios
  ni de terceros.
- La copia local de la conversación se elimina a los **12 meses**, o antes si
  la persona lo solicita.

## 8. Puntos de lealtad

Los puntos van atados al teléfono del comensal. Si esa persona pide el borrado
de sus datos, **pierde el saldo de puntos**: no hay forma de conservarlos sin
conservar el identificador que los sostiene. Esto se le advierte antes de
ejecutar el borrado, para que la decisión sea informada.

## 9. Límites del borrado

No se elimina lo que la ley obliga a conservar:

- Facturación y registros contables, hasta 5 años.
- Información bajo requerimiento judicial o administrativo vigente.
- El registro de incidentes de seguridad, que se conserva **sin datos
  personales identificables**.

Cuando parte de una solicitud no puede atenderse por este motivo, se le explica
al solicitante qué se borró, qué no, y bajo qué norma.

## 10. Documentos relacionados

- [POL-01 — Seguridad de la información](POL-01-seguridad-de-la-informacion.md)
- [POL-02 — Control de acceso](POL-02-control-de-acceso.md)
- [POL-03 — Respuesta a incidentes](POL-03-respuesta-a-incidentes.md)
- Aviso de privacidad — `cobrapos.app/privacy-policy`
- Eliminación de datos — `cobrapos.app/data-deletion`

---

## Registro de revisiones

| Versión | Fecha | Cambio | Aprobada por |
|---|---|---|---|
| 1.0 | 14-ago-2026 | Emisión inicial | Sergio Andrés Abadía Cuají |
