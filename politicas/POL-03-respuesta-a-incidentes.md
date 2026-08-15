# POL-03 — Política de Respuesta a Incidentes de Seguridad

| | |
|---|---|
| **Organización** | Cobra POS — ABADIA CUAJI SERGIO ANDRES (persona natural, Colombia) |
| **Documento** | POL-03 |
| **Versión** | 1.0 |
| **Fecha de emisión** | 14 de agosto de 2026 |
| **Aprobada por** | Sergio Andrés Abadía Cuají — Titular y Responsable de Seguridad de la Información |
| **Próxima revisión** | 14 de agosto de 2027 |
| **Alcance** | Cualquier evento que comprometa la confidencialidad, integridad o disponibilidad de los datos tratados por Cobra POS |

---

## 1. Qué cuenta como incidente

Un incidente es cualquier evento que comprometa —o pueda comprometer— datos o
servicio. En concreto:

- Acceso no autorizado a la base de datos o a un panel administrativo.
- **Una tabla en producción sin Row Level Security.** Aunque nadie haya visto
  nada, el aislamiento entre restaurantes estuvo caído: es incidente, no
  pendiente.
- Filtración de una credencial: token de Meta, clave de OpenAI, token de
  GitHub, `service_role` de Supabase, o cualquier secreto en el repositorio
  público.
- Envío de datos personales al destinatario equivocado (por ejemplo, un mensaje
  de WhatsApp con el pedido de un cliente enviado a otro número).
- Pérdida o alteración no autorizada de datos.
- Caída total del servicio que impida operar a los restaurantes.
- Cualquier aviso de un proveedor (Supabase, Meta, Google, Wompi, GitHub,
  TikTok) informando de una brecha que nos afecte.

Ante la duda de si algo es incidente, **se trata como incidente**. El costo de
abrir uno de más es una hora de trabajo; el de cerrar los ojos ante uno real es
la confianza de los clientes.

## 2. Severidad

| Nivel | Criterio | Ejemplo |
|---|---|---|
| **Crítico** | Datos personales expuestos a terceros, o un restaurante pudo ver datos de otro | Fallo de RLS, credencial filtrada y usada |
| **Alto** | Credencial expuesta sin evidencia de uso, o servicio caído por completo | Token en el repositorio público |
| **Medio** | Fallo acotado, sin exposición de datos personales | Una Edge Function caída, sin pérdida de datos |
| **Bajo** | Anomalía sin impacto en datos ni en servicio | Intento de acceso fallido y bloqueado |

## 3. Quién responde

Al ser una organización unipersonal, **Sergio Andrés Abadía Cuají** es a la vez
quien detecta, coordina, contiene, comunica y documenta.

- **Contacto único:** `sergio@cobrapos.app`
- **Respaldo:** `contacto@cobrapos.app`

Esta concentración de roles se declara abiertamente. Si la organización crece,
la coordinación y la ejecución técnica se separarán, y esta sección se
actualizará antes de la primera contratación.

## 4. El procedimiento

### Paso 1 — Detectar y registrar (inmediato)

Se abre una entrada en el registro de incidentes con: fecha y hora, quién lo
detectó, qué se observó, y severidad preliminar. **El registro se abre antes de
empezar a arreglar**, porque durante la reparación se pierde la memoria de lo
que se vio.

### Paso 2 — Contener (primeras 4 horas para crítico o alto)

Detener el daño antes de investigar la causa:

- Credencial filtrada → **rotarla de inmediato**, aunque no haya evidencia de
  uso, y revisar los registros de acceso del período afectado.
- Fallo de RLS → habilitar RLS en la tabla y revisar qué peticiones pasaron por
  ella mientras estuvo abierta.
- Acceso no autorizado → cerrar la sesión, cambiar la credencial, revisar los
  registros.
- Función o servicio caído → revertir a la última versión que funcionaba.

### Paso 3 — Evaluar el alcance (primeras 24 horas)

Responder por escrito, con evidencia de los registros:

- ¿Qué datos exactamente? ¿De cuántas personas? ¿De cuántos restaurantes?
- ¿Se leyeron, se copiaron, se alteraron?
- ¿Qué ventana de tiempo estuvo expuesta?

Si no se puede descartar la exposición, se asume que hubo exposición.

### Paso 4 — Notificar

| A quién | Cuándo | Cómo |
|---|---|---|
| **Restaurantes afectados** | Máximo **72 horas** desde la detección | Correo directo: qué pasó, qué datos, qué se hizo, qué deben hacer |
| **Superintendencia de Industria y Comercio** (Colombia) | Según lo exigido por la Ley 1581 de 2012 y el Decreto 1074 de 2015 | Canal oficial de la SIC |
| **Comensales afectados** | Cuando el dato expuesto sea suyo y el riesgo lo justifique | A través del restaurante, o directamente si es necesario |
| **Proveedor implicado** (Supabase, Meta, Google, Wompi, TikTok) | Si el origen o el impacto lo involucra | Su canal de soporte o seguridad |

La notificación dice lo que se sabe y lo que aún no se sabe. **No se minimiza y
no se espera a tener el diagnóstico completo** para avisar.

### Paso 5 — Erradicar y restaurar

Corregir la causa raíz, no solo el síntoma. Verificar con una prueba real que
el servicio quedó bien: el estado que reporta la API de un proveedor **no se
acepta como prueba** de que algo funciona.

### Paso 6 — Cerrar y aprender (dentro de los 7 días siguientes)

Se completa el registro con:

- Línea de tiempo desde la detección hasta el cierre.
- Causa raíz.
- Qué falló en los controles que debían haberlo impedido.
- Qué se cambió para que no vuelva a pasar.

Si la causa raíz revela un hueco en cualquiera de estas políticas, la política
se corrige en ese mismo momento — no en la revisión anual.

## 5. Registro de incidentes

Se mantiene en `politicas/registro-incidentes.md`, con una entrada por
incidente. Se conserva **mínimo 3 años**. Está disponible para auditorías y
para cualquier cliente que lo solicite respecto de un incidente que le afectó.

## 6. Simulacros

**Anualmente** se ejecuta un simulacro documentado, sobre un escenario
realista, para comprobar que el procedimiento funciona en la práctica y no solo
en el papel.

- **Primer simulacro:** 30 de septiembre de 2026.
- **Escenario previsto:** credencial de la API de WhatsApp filtrada en el
  repositorio público. Se cronometra cuánto se tarda en detectarla, rotarla y
  confirmar que el servicio sigue en pie.

Los resultados, incluidos los pasos que no salieron bien, se registran junto a
los incidentes reales.

## 7. Documentos relacionados

- [POL-01 — Seguridad de la información](POL-01-seguridad-de-la-informacion.md)
- [POL-02 — Control de acceso](POL-02-control-de-acceso.md)
- [POL-04 — Retención y borrado de datos](POL-04-retencion-y-borrado.md)

---

## Registro de revisiones

| Versión | Fecha | Cambio | Aprobada por |
|---|---|---|---|
| 1.0 | 14-ago-2026 | Emisión inicial | Sergio Andrés Abadía Cuají |
