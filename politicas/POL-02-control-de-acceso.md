# POL-02 — Política de Control de Acceso

| | |
|---|---|
| **Organización** | Cobra POS — ABADIA CUAJI SERGIO ANDRES (persona natural, Colombia) |
| **Documento** | POL-02 |
| **Versión** | 1.0 |
| **Fecha de emisión** | 14 de agosto de 2026 |
| **Aprobada por** | Sergio Andrés Abadía Cuají — Titular y Responsable de Seguridad de la Información |
| **Próxima revisión** | 14 de agosto de 2027 |
| **Alcance** | Todo acceso a datos y sistemas de Cobra POS, tanto del titular como del personal de los restaurantes clientes |

---

## 1. Los dos principios que mandan

Toda decisión de acceso en Cobra POS se resuelve con dos preguntas:

1. **Necesidad de conocer** (*need-to-know*) — ¿esta persona necesita este dato
   para hacer su trabajo? Si no, no lo ve.
2. **Mínimo privilegio** (*least-privilege*) — de los permisos que sí necesita,
   ¿cuál es el conjunto más pequeño que le permite trabajar? Ese, y ni uno más.

Cuando haya duda entre dos niveles de permiso, se concede el menor. Ampliarlo
después cuesta un minuto; un dato visto no se puede des-ver.

## 2. Los dos planos de acceso

Conviene no mezclarlos, porque se gobiernan distinto:

- **Plano administrativo** — el titular sobre la infraestructura (Supabase,
  GitHub, Porkbun, Meta, Google, TikTok).
- **Plano de aplicación** — el personal de cada restaurante dentro de Cobra POS.
  Estas personas **no son personal de Cobra POS**; su acceso lo administra el
  propio restaurante, dentro de los límites que la plataforma impone.

## 3. Plano administrativo

### 3.1 Quién

Únicamente **Sergio Andrés Abadía Cuají**. No existe ninguna otra cuenta con
privilegios sobre la infraestructura de producción.

### 3.2 Reglas

- Cada panel se accede con cuenta nominal e individual. **No se comparten
  credenciales** con nadie, bajo ninguna circunstancia.
- Las credenciales no se envían por WhatsApp, correo ni chat.
- **MFA obligatorio** en todas las cuentas administrativas. *(Compromiso con
  fecha límite 31-ago-2026 — ver POL-01 §8; hasta esa fecha rige contraseña
  única y larga por panel.)*
- Bloqueo de pantalla con contraseña en el equipo de administración.
- Los secretos de servicio viven en el gestor de secretos de Supabase, nunca en
  el repositorio ni en documentos.

### 3.3 Si se incorpora personal

Antes de conceder el primer acceso a cualquier persona nueva:

1. Se define por escrito qué necesita ver y por qué.
2. Se crea una cuenta nominal — nunca se le presta la del titular.
3. Se le da el rol de menor privilegio que le permita trabajar.
4. Se registra la fecha de alta en el registro de accesos.
5. Al terminar el vínculo, **el acceso se revoca el mismo día**, y se anota.

## 4. Plano de aplicación: roles dentro de Cobra POS

La plataforma define cinco roles. Cada uno ve lo que su trabajo exige:

| Rol | Para qué | Qué alcanza |
|---|---|---|
| **Administrador** | Dueño o gerente del restaurante | Configuración, informes, ventas, inventario, usuarios de su restaurante |
| **Cajero** | Cobro y cierre de caja | Pedidos, pagos, apertura y cierre de caja, arqueos |
| **Mesero** | Atención en mesa | Toma de pedidos y estado de sus mesas |
| **Cocinero** | Producción | Comandas y estados de preparación |
| **Domiciliario** | Entrega | Pedidos asignados y datos de entrega |

Un cajero no ve los informes de utilidad; un cocinero no ve los datos de pago.
Esa separación es la aplicación directa del principio de necesidad de conocer.

## 5. Aislamiento entre restaurantes

Este es el control más importante de toda la plataforma, porque es el que
impide que un restaurante vea los datos de otro.

- El aislamiento se aplica en el **motor de base de datos** mediante *Row Level
  Security* de PostgreSQL, no en el código de la aplicación. Aunque una
  petición llegue con la clave pública `anon`, PostgreSQL filtra por inquilino
  antes de devolver una sola fila.
- Verificado el 14 de agosto de 2026: **RLS habilitado en 82 de 82 tablas** del
  esquema `public`, con **98 políticas activas**.
- Toda tabla nueva nace con RLS. Una tabla sin RLS en producción se trata como
  incidente de seguridad, no como pendiente.
- La clave `anon` de Supabase es pública por diseño y aparece en el código del
  navegador: **su seguridad descansa enteramente en RLS**. Por eso RLS no es un
  refuerzo, es el control primario.

## 6. Registros de acceso

- **Base de datos y autenticación:** Supabase registra los inicios de sesión y
  las llamadas a la API, con marca de tiempo.
- **Edge Functions:** cada invocación queda registrada y es consultable por
  rango de fechas.
- **Código:** cada cambio queda en el historial de Git con autor y fecha.
- **Dentro de la aplicación:** los turnos de caja, los pedidos y los
  movimientos de inventario quedan asociados al usuario que los ejecutó.

Los registros se revisan ante cualquier sospecha y, de forma rutinaria, en la
revisión anual.

## 7. Revisión de privilegios

**Anualmente**, y además ante cualquier cambio de personal:

1. Se listan todas las cuentas con acceso administrativo y se confirma que cada
   una sigue siendo necesaria.
2. Se comprueba que MFA sigue activo en todas ellas.
3. Se verifica la cobertura de RLS sobre el total de tablas.
4. Se anota el resultado en el registro de revisiones de este documento.

Primera revisión programada: **14 de agosto de 2027**.

## 8. Baja de accesos

- **Personal de Cobra POS:** revocación el mismo día en que termina el vínculo.
- **Usuarios de un restaurante:** los da de baja el Administrador de ese
  restaurante desde la configuración; el efecto es inmediato.
- **Cliente que cancela el servicio:** el acceso se cierra y sus datos siguen el
  procedimiento de [POL-04](POL-04-retencion-y-borrado.md).

## 9. Documentos relacionados

- [POL-01 — Seguridad de la información](POL-01-seguridad-de-la-informacion.md)
- [POL-03 — Respuesta a incidentes](POL-03-respuesta-a-incidentes.md)
- [POL-04 — Retención y borrado de datos](POL-04-retencion-y-borrado.md)

---

## Registro de revisiones

| Versión | Fecha | Cambio | Aprobada por |
|---|---|---|---|
| 1.0 | 14-ago-2026 | Emisión inicial | Sergio Andrés Abadía Cuají |
