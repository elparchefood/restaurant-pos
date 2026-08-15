# POL-01 — Política de Seguridad de la Información

| | |
|---|---|
| **Organización** | Cobra POS — ABADIA CUAJI SERGIO ANDRES (persona natural, Colombia) |
| **Documento** | POL-01 |
| **Versión** | 1.0 |
| **Fecha de emisión** | 14 de agosto de 2026 |
| **Aprobada por** | Sergio Andrés Abadía Cuají — Titular y Responsable de Seguridad de la Información |
| **Próxima revisión** | 14 de agosto de 2027 (o antes, ante un cambio relevante de infraestructura o un incidente grave) |
| **Alcance** | Toda la información tratada por la plataforma Cobra POS: infraestructura, código, datos de los restaurantes clientes y datos de sus comensales |

---

## 1. Propósito

Esta política define cómo Cobra POS protege la información propia y la de sus
clientes. No es un documento aspiracional: describe los controles **que están
vigentes hoy** y, donde un control aún no existe, lo declara abiertamente como
compromiso con fecha. Un documento que oculta un hueco es peor que uno que lo
señala.

## 2. Estructura y responsabilidad

Cobra POS es operado por una sola persona natural. En consecuencia:

- **Sergio Andrés Abadía Cuají** concentra los roles de titular, responsable de
  seguridad de la información y responsable de privacidad. Es quien aprueba
  esta política, quien la ejecuta y quien responde por su incumplimiento.
- No hay empleados ni contratistas con acceso a los sistemas de producción. Si
  en el futuro los hubiera, el acceso se otorga según [POL-02](POL-02-control-de-acceso.md)
  y esta sección se actualiza antes de conceder el primer acceso.
- El personal de los restaurantes clientes **no es personal de Cobra POS**:
  accede únicamente a los datos de su propio restaurante, mediante los roles
  descritos en POL-02.

## 3. Clasificación de la información

| Nivel | Qué incluye | Trato |
|---|---|---|
| **Crítico** | Credenciales, claves de API, tokens de WhatsApp/Meta, `service_role` de Supabase, token de GitHub | Solo en el gestor de secretos de Supabase o en el equipo del titular. **Nunca** en el repositorio, en documentos ni en chats. |
| **Confidencial** | Datos personales de comensales (nombre, teléfono, dirección), datos de cuenta de los clientes, ventas y facturación | Cifrado en tránsito y en reposo. Aislado por inquilino. Acceso solo por necesidad. |
| **Interno** | Código fuente, documentación técnica, configuración de flujos | Repositorio de GitHub. Público por requisito de GitHub Pages; por eso **no puede contener nada de nivel crítico**. |
| **Público** | Sitio web, aviso de privacidad, términos, clave `anon` de Supabase | Publicable sin restricción. La clave `anon` es pública por diseño y su seguridad descansa en Row Level Security, no en el secreto. |

## 4. Controles técnicos vigentes

### 4.1 Cifrado

- **En tránsito:** todo el tráfico va por HTTPS con **TLS 1.2 o superior**. No
  existe ningún punto final en texto plano: el frontend se sirve por GitHub
  Pages con TLS, y la base de datos, la autenticación, el almacenamiento y las
  Edge Functions se consumen por HTTPS contra Supabase.
- **En reposo:** la base de datos y el almacenamiento residen en Supabase sobre
  AWS, con cifrado **AES-256** administrado por el proveedor.
- **Contraseñas:** gestionadas por Supabase Auth con hash de un solo sentido.
  Cobra POS nunca almacena ni puede leer una contraseña en claro.

### 4.2 Aislamiento entre clientes

Cobra POS es multi-inquilino: varios restaurantes comparten la misma base de
datos. El aislamiento **no depende del código de la aplicación**, sino de
*Row Level Security* de PostgreSQL, que se aplica en el motor de base de datos
aunque la petición llegue con una clave pública.

Estado verificado el 14 de agosto de 2026:

- **82 de 82** tablas del esquema `public` tienen RLS habilitado.
- **98** políticas RLS activas.
- Cada política filtra por el inquilino (`tenant`) y, donde corresponde, por
  sucursal (`branch`).

Esta verificación se repite en cada revisión anual y después de cualquier
migración que cree tablas nuevas. **Una tabla nueva sin RLS se considera un
incidente de seguridad**, no un pendiente.

### 4.3 Gestión de secretos

- Las claves de API y tokens viven en el gestor de secretos de Supabase, fuera
  del repositorio y fuera del código del cliente.
- El repositorio es público (requisito de GitHub Pages en el plan actual). Por
  eso rige una regla dura: **ningún secreto entra al repositorio, nunca**.
- Barrido realizado el 14 de agosto de 2026 sobre todo el árbol del
  repositorio buscando JWT de `service_role`, tokens personales de Supabase,
  tokens de GitHub, claves de OpenAI y tokens de Meta. **Resultado: ningún
  secreto expuesto.** Los únicos JWT presentes son claves `anon`, públicas por
  diseño y protegidas por RLS.
- Este barrido se repite en cada revisión anual y antes de cualquier auditoría
  externa.

### 4.4 Puestos de trabajo

- El único equipo con acceso administrativo es el portátil del titular, con
  Windows 11 Pro, **Microsoft Defender activo** con actualizaciones automáticas
  y bloqueo de pantalla con contraseña.
- No se accede a los sistemas de producción desde equipos compartidos, ajenos o
  públicos.

### 4.5 Red

No existe red corporativa ni servidores propios: la infraestructura es
enteramente gestionada (Supabase sobre AWS, GitHub Pages). La segregación de
red y la detección de intrusiones son responsabilidad contractual de esos
proveedores. Por parte de Cobra POS:

- No se administra producción desde redes Wi-Fi públicas abiertas.
- Los paneles administrativos (Supabase, GitHub, Porkbun, Meta, TikTok) solo se
  abren desde el equipo del titular.

## 5. Terceros con acceso a datos

Los siguientes proveedores procesan datos por cuenta de Cobra POS. Cada uno
está sujeto a sus propios compromisos de seguridad y privacidad:

| Proveedor | Para qué | Qué datos ve |
|---|---|---|
| **Supabase** (AWS) | Base de datos, autenticación, almacenamiento, Edge Functions | Todos los datos de la plataforma |
| **OpenAI** | Lectura de cartas, asistente de pedidos por WhatsApp | Texto de las conversaciones e imágenes de carta que se procesan |
| **Meta** (WhatsApp Cloud API) | Envío y recepción de mensajes | Teléfono y contenido de los mensajes |
| **Wompi** | Pagos en línea | Datos de la transacción |
| **Google** (API de Gmail, **solo lectura**) | Verificación automática de comprobantes de transferencia contra el correo del banco | Correos del banco en la cuenta que el restaurante autorice |
| **GitHub** | Alojamiento del frontend estático y del código | Código; ningún dato de clientes |
| **Porkbun** | DNS y reenvío de correo del dominio | Metadatos de correo |
| **TikTok** | Mensajería de negocio | *Pendiente de aprobación a 14-ago-2026; aún no procesa datos* |

⚠️ **Discrepancia detectada y pendiente de corregir:** el aviso de privacidad
publicado en `cobrapos.app/privacy-policy` (v1.0, 15-jun-2026) menciona a
**Stripe**, que no se usa, y **omite a Wompi, Google y GitHub**. Debe alinearse
con esta tabla antes de responder cualquier cuestionario externo. Ver la
sección 8.

## 6. Desarrollo seguro

- Todo cambio queda registrado en Git, con autor y fecha, y es trazable a un
  commit.
- Las funciones desplegadas se comprueban con una llamada real después de cada
  despliegue: la API de Supabase reporta `ACTIVE` incluso cuando la función
  arrancó con error, así que el estado de la API **no se acepta como prueba**.
- Las claves de servicio nunca se incrustan en el código que se entrega al
  navegador o a la aplicación de escritorio.
- Antes de publicar una tabla nueva se verifica que tenga RLS.

## 7. Formación

Al ser una organización unipersonal, la formación consiste en la revisión anual
de estas cuatro políticas por parte del titular, dejando constancia de la fecha
en el registro de revisiones de cada documento. Si se incorpora personal, la
formación previa al primer acceso será obligatoria y quedará registrada.

## 8. Compromisos con fecha (controles aún no implantados)

Se declaran abiertamente porque no están vigentes hoy:

| # | Compromiso | Fecha límite | Estado |
|---|---|---|---|
| 1 | **MFA activo** en todas las cuentas administrativas (Supabase, GitHub, Porkbun, Meta, TikTok, Google) con captura de pantalla como constancia | 31-ago-2026 | Pendiente |
| 2 | **Escaneo de vulnerabilidades** de `cobrapos.app` y de los endpoints públicos, con informe archivado | 31-ago-2026 | Pendiente |
| 3 | **Alinear el aviso de privacidad** con la tabla de la sección 5 (quitar Stripe; añadir Wompi, Google y GitHub) | 31-ago-2026 | Pendiente |
| 4 | **Primer simulacro de incidente** según [POL-03](POL-03-respuesta-a-incidentes.md), documentado | 30-sep-2026 | Pendiente |
| 5 | **Rotación de credenciales** de todos los paneles administrativos y registro de la fecha | 30-sep-2026 | Pendiente |

## 9. Incumplimiento

Cualquier desviación de esta política detectada por el titular se trata como un
hallazgo: se registra, se corrige y se anota la fecha de corrección en el
registro de revisiones. Las desviaciones que expongan datos personales activan
además [POL-03](POL-03-respuesta-a-incidentes.md).

## 10. Documentos relacionados

- [POL-02 — Control de acceso](POL-02-control-de-acceso.md)
- [POL-03 — Respuesta a incidentes](POL-03-respuesta-a-incidentes.md)
- [POL-04 — Retención y borrado de datos](POL-04-retencion-y-borrado.md)
- Aviso de privacidad — `cobrapos.app/privacy-policy`
- Eliminación de datos — `cobrapos.app/data-deletion`
- Términos de servicio — `cobrapos.app/terms`

---

## Registro de revisiones

| Versión | Fecha | Cambio | Aprobada por |
|---|---|---|---|
| 1.0 | 14-ago-2026 | Emisión inicial | Sergio Andrés Abadía Cuají |
