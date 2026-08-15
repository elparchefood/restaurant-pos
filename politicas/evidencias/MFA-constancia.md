# Constancia de MFA en cuentas administrativas

Evidencia exigida por [POL-01 §8](../POL-01-seguridad-de-la-informacion.md) y
[POL-02 §3.2](../POL-02-control-de-acceso.md). **Fecha límite: 31-ago-2026.**

Se llena a medida que se activa cada cuenta. La captura de pantalla se guarda
en esta misma carpeta con el nombre indicado.

| # | Cuenta | Estado | Fecha | Captura |
|---|---|---|---|---|
| 1 | Supabase | ⬜ Pendiente | | `mfa-supabase.png` |
| 2 | GitHub | ⬜ Pendiente | | `mfa-github.png` |
| 3 | Google (`sergio@` / cuenta del Gmail) | ⬜ Pendiente | | `mfa-google.png` |
| 4 | Meta (Facebook / Business Manager) | ⬜ Pendiente | | `mfa-meta.png` |
| 5 | Porkbun | ⬜ Pendiente | | `mfa-porkbun.png` |
| 6 | TikTok for Business | ⬜ Pendiente | | `mfa-tiktok.png` |

---

## Antes de empezar: una sola app de autenticación

Usa **una** app para las seis cuentas — Google Authenticator, Microsoft
Authenticator o Authy. Todas hablan el mismo estándar, así que sirve cualquiera.

**Prefiere la app al SMS.** El SMS se intercepta clonando la línea, que en
Colombia es un fraude común y documentado. Si un panel solo ofrece SMS,
actívalo igual: SMS es mucho mejor que nada.

⚠️ **Los códigos de respaldo son lo más importante de todo este trámite.** Cada
panel te muestra una lista de códigos de un solo uso al activar el MFA.
Guárdalos **fuera del computador y fuera del teléfono** — impresos en papel, en
un cajón. Si pierdes el teléfono y no tienes esos códigos, pierdes la cuenta, y
perder Supabase significa perder el sistema entero.

---

## El orden importa

Hazlas en este orden, y **no de un tirón**: si algo sale mal, quieres que sea
en la cuenta menos crítica, no en la que sostiene la base de datos.

### 1. Google — primero, porque es la llave de las demás

`myaccount.google.com/signinoptions/twosv`

Es la primera porque el correo de Google es donde llegan los enlaces de
recuperación de casi todo lo demás. Si alguien entra ahí, el MFA de los otros
paneles no lo detiene.

### 2. GitHub

`github.com/settings/security`

Ojo: GitHub te da los códigos de respaldo **una sola vez**. Descárgalos en ese
momento.

### 3. Porkbun

`porkbun.com/account/settings` → sección de seguridad / 2FA

Aquí vive el dominio y el reenvío de `sergio@cobrapos.app`. Quien controle
Porkbun puede redirigir tu correo y, desde ahí, recuperar cualquier otra cuenta.

### 4. Meta

Ajustes de seguridad de la cuenta de Facebook con la que administras el
Business Manager (**Configuración y privacidad → Configuración → Contraseña y
seguridad**). Desde Business Manager también puedes exigir 2FA a todos los
administradores del negocio.

### 5. TikTok for Business

Ajustes de seguridad de la cuenta con la que se radicó la solicitud de la API.

### 6. Supabase — la última, y con calma

`supabase.com/dashboard/account/security`

Va de última a propósito: es la cuenta que sostiene la base de datos, la
autenticación y las Edge Functions de todos los restaurantes. Antes de cerrar
la sesión, **comprueba desde otro navegador que puedes volver a entrar** con el
segundo factor.

---

## Al terminar

1. Cambia ⬜ por ✅ y anota la fecha en la tabla de arriba.
2. Guarda las capturas en esta carpeta con los nombres indicados.
3. Confirma que los códigos de respaldo de las seis cuentas están impresos y
   guardados en un solo lugar físico.
