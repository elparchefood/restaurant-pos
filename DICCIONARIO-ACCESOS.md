# Diccionario de accesos — cómo se llama cada cosa por dentro

Escrito el 12-ago-2026 porque **estas cosas se confunden y ya costaron un
agujero de seguridad** (ver el caso al final). Cada nivel tiene su nombre, su
sitio en la base y su forma de comprobarse. **No mezclarlos nunca.**

---

## Los 4 niveles, y son cuatro (no dos)

| # | Nombre interno | Qué es en palabras | Dónde vive | Cómo se comprueba |
|---|---|---|---|---|
| 1 | **admin de plataforma** | Sergio y a quien él asigne. Cobra por dentro: aprueba restaurantes, ve pagos, entra a la Consola | `user_profiles.role = 'admin'` | `rpc('es_admin_plataforma')` |
| 2 | **dueño** (gerente) | El dueño del restaurante: la cuenta con la que se registró. **NO es un rol.** Tiene acceso total a lo suyo | 🔴 hoy `user_metadata.role='gerente'` — **hay que cambiarlo** | 🔴 falta |
| 3 | **rol** | Cajero, Mesero, Cocinero, Domiciliario, Administrador. Solo pueden lo que el dueño les conceda | `pos_roles` (por `tenant_id`) | `pos-perms.js` |
| 4 | **admin autorizado** | Quien tiene el **PIN** para autorizar descuentos y anulaciones | `pos_users.is_authorized_admin` | `posPinPrompt` |

---

## Reglas que no se rompen

**1. "Administrador" es un ROL, no el dueño.**
Es el nivel 3. Solo puede lo que el dueño le conceda. No confundir con el
nivel 1 (admin de plataforma) ni con el nivel 4 (el del PIN).

**2. El dueño no tiene rol.**
Tiene acceso total por ser el dueño, no por tener un rol asignado. Es ilógico
que el dueño se limite a sí mismo: puede cobrar, atender mesas, lo que quiera.

**3. Los ROLES son del sistema y existen en TODAS las marcas.**
Lo que pertenece a una marca es la **persona**, no el rol. Por eso
`pos_roles.brand_id` sobra y hay que quitarla (nadie la lee hoy).

**4. Una persona pertenece a UNA marca.**
Porque su correo lleva el dominio de la marca
(`usuario@elparchefood.cobrapos.app`). Si el dueño quiere que alguien trabaje
en dos marcas, **le crea dos cuentas**.

**5. Una persona puede tener VARIAS sucursales, con rol distinto en cada una.**
Puede ser cajero en una y mesero en otra. Hoy esto NO se puede: `pos_users`
guarda un solo `role_id` para toda la persona.

**6. La identidad nunca vive en un dato que el usuario pueda editar.**
Ver abajo.

---

## ⚠️ El agujero que ya pasó (para no repetirlo)

La Edge Function `provision` comprobaba `pos_users.is_authorized_admin` para
decidir quién podía aprobar restaurantes. Pero ese campo significa **el del
PIN de descuentos** (nivel 4), y la propia función se lo ponía en `true` a
CADA restaurante que aprobaba.

**Resultado: todo cliente aprobado quedaba pudiendo aprobar a otros y crear
cuentas en la plataforma.** Corregido: ahora exige `user_profiles.role='admin'`.

**La lección:** cuatro conceptos con nombres parecidos. Antes de usar un campo
para decidir un permiso, mirar en esta tabla qué significa de verdad.

---

## ⚠️ El agujero abierto (12-ago-2026)

**Un usuario puede reescribir su propia `user_metadata`.** Comprobado en la app
real: `sb.auth.updateUser({ data: {...} })` funciona sin error.

Y ahí viven hoy `role`, `tenant_id` y `branch_id`. Consecuencias:

- `current_tenant_id()` lee `auth.jwt() -> user_metadata -> tenant_id`, y de esa
  función cuelga **todo el aislamiento entre clientes** (entrada 105 del
  ESTADO-SISTEMA). El candado está guardado del lado del que quiere abrirlo.
- `pos-perms.js` busca el rol por nombre; si no lo encuentra, abre todo
  (*fail-open*). Ponerse un rol inexistente da acceso completo.

**Hoy no hay daño** (un solo cliente real, cuentas de Sergio). **Se rompe con
el cliente número 2.**

**El arreglo:** que la identidad salga de la BASE, no del token.
`pos_users.auth_user_id` ya existe; `current_tenant_id()` debe leer de ahí.

---

## Cosas que NO son lo que parecen

| Campo | NO significa | SÍ significa |
|---|---|---|
| `is_authorized_admin` | admin de plataforma, ni dueño | tiene el PIN de descuentos |
| `pos_roles.system_role` | (hoy) rol del sistema | da acceso TOTAL — por eso `Administrador` no debe tenerlo |
| `user_metadata.role` | fuente confiable | dato editable por el propio usuario |
| `pos_roles.brand_id` | nada | columna muerta, nadie la lee, contradice la regla 3 |

---

## Estado de cada candado

| Candado | Estado |
|---|---|
| Consola de plataforma: la página | ✅ `es_admin_plataforma()` + políticas de la base |
| Consola de plataforma: el botón | ✅ oculto para quien no es admin (12-ago) |
| Aislamiento entre clientes (RLS) | ✅ **cerrado 12-ago** — `current_tenant_id()` lee de `pos_users`, y las 12 políticas que leían el token se reescribieron |
| Dueño reconocido como dueño | ✅ **12-ago** — `tenants.owner_user_id` + `es_dueno()` |
| `Administrador` como rol normal | ✅ **12-ago** — dejó de ser `system_role` |
| `ADMIN_ROLES` en pos-perms | ✅ **vaciado** — bastaba escribirse "gerente" en la metadata |
| Contexto de marca/sucursal | ✅ **12-ago** — `window.posContexto` en pos-core |
| Rol por sucursal | 🔴 falta (una persona: un rol para todas sus sucursales) |


---

## Comprobado con un ataque real (12-ago-2026)

Desde la cuenta demo, cambiándose `tenant_id` y `role` en su propia metadata
para hacerse pasar por El Parche:

| | Antes | Después |
|---|---|---|
| Productos de El Parche | **61** 🔴 | **8** (solo los suyos) ✅ |
| Pedidos / clientes / puntos | 0 | 0 ✅ |
| Tenant que asigna la base | el del token | **el suyo** ✅ |

El usuario **puede** seguir reescribiendo su metadata. Ya no le sirve de nada.

**La distinción importante:** la pantalla puede equivocarse y mostrar de más,
pero la base ya no entrega datos ajenos pase lo que pase. Antes las dos capas
dependían del mismo dato manipulable.
