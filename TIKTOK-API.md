# TikTok API — auditoría y qué hacer

Auditoría del 10-ago-2026, leída de la **documentación oficial** de la
Business Messaging API (`business-api.tiktok.com/portal/docs/business-messaging-api/v1.3`
y las páginas de acceso y revisión).

> ⚠️ **Corrección.** Una primera versión de este documento decía que la
> mensajería de TikTok solo se conseguía siendo *Messaging Partner*. **Es
> falso.** Esa lista de socios (Blip, Gupshup, Infobip…) es para negocios que
> quieren usar la mensajería a través de una herramienta ya hecha; **no es el
> único camino para un desarrollador.** Cobra puede pedir el acceso directo.

---

## Conclusión corta

**Sí se puede, y Colombia está en la región permitida.** No hay que ser socio
de nadie. Lo que hay es **una revisión de seguridad y privacidad de la empresa**
(no del producto, no un video) que dura entre **10 días hábiles + 2 a 4 semanas**
y exige políticas escritas que Cobra hoy no tiene.

---

## Dónde se entra

Portal de desarrolladores: `business-api.tiktok.com/portal/apps`

⚠️ **No confundir con TikTok for Business (anuncios).** Son dos cuentas:

| | Cuenta |
|---|---|
| **TikTok for Business** (anuncios, correos de `ads-service.tiktok.com`) | `elparche.foodpopayan@gmail.com` |
| **Portal de desarrolladores** (la API) | correo corporativo — *pendiente de anotar* |

El correo del portal es un **alias de un dominio propio en Porkbun** que
reenvía a un Gmail. Se ven en Porkbun → Domain Management → icono del sobre.
Cuenta de Porkbun: `sergiosaac`.

---

## La app que ya existe

| | |
|---|---|
| Nombre | **Restaurant Pos** |
| App ID | `7650415130718502929` |
| Verification Status | **Approved** ✅ |
| Logo | ✅ Cobra POS (corregido 10-ago) |
| Advertiser redirect URL | ✅ `https://cobrapos.app` (corregido 10-ago) |
| Redirect del titular | ✅ solo la de Supabase (corregido 10-ago) |

La app se había creado para otro proyecto (Orderflow / Aura Languages) y se
reutilizó. **Ya está limpia** — ver PASO 1 más abajo.

### Permisos actuales: TODOS de publicidad

Ad Account Management · Ads Management · Audience Management · Reporting ·
Measurement · Creative Management · App Management · Pixel Management ·
DPA Catalog · Reach & Frequency · Lead Management · Creator Marketplace ·
TikTok Creator · Ad Comments · Business Plugin · Automated Rules ·
TikTok Accounts · Onsite Commerce Store · Offline Events · Ad Diagnosis ·
Mentions · CRM Event Management · Business Recommendation · CTX Events ·
Brand Safety · Partner Insights · Payment Portfolio · Custom Conversion ·
Minis Management · Business Verification

**Ninguno de mensajería** — y el de mensajería NO se marca en esta lista: se
concede al pasar la revisión (ver abajo).

---

## Disponibilidad por región (lo que dice el documento)

La Business Messaging API está en **Open Beta en APAC, LATAM, METAP y
Norteamérica**.

| Región de la cuenta de negocio | Qué exige |
|---|---|
| Espacio Económico Europeo, Suiza, Reino Unido | ❌ **No disponible** |
| Estados Unidos | DSPR **+ US data security review + USDS Addendum** |
| **Resto del mundo (Colombia)** | ✅ **Solo la DSPR** |

Y una FAQ del propio documento aconseja exactamente el caso de Cobra:

> *"Si las cuentas que planea gestionar están registradas en regiones no
> estadounidenses, recomendamos excluir a EE. UU. de esta solicitud para
> acelerar la aprobación. Siempre puede solicitar el acceso a EE. UU. después."*

**Traducción:** pedirlo solo para LATAM evita la revisión gringa, que es la
lenta y la que puede rechazar.

---

## El proceso real, paso a paso

**Requisitos previos:**

1. Tener una app de desarrollador aprobada con App ID válido → **ya lo tienes**.
   (Si se hiciera una app nueva, el documento pide incluir los scopes
   *Ad Account Management*, *CTX Events Management* y *Measurement*.)
2. Haber leído la página de **Data security & privacy review**.

**La solicitud:**

3. Se llena **un formulario de admisión** (formulario Lark de ByteDance):
   `https://bytedance.sg.larkoffice.com/share/base/form/shrlg7vFArGhg9V20neYCEwIKrb`
4. TikTok procesa e inicia la revisión **en 10 días hábiles**.
5. Llega un correo con asunto **"TikTok/ByteDance Third-Party Due Diligence
   Questionnaire" (DSPR DDQ)** al correo de contacto que se ponga.
6. La evaluación tarda normalmente **2 a 4 semanas**.
7. Si se aprueba, llega un correo y **ahí sí se concede el scope de mensajería**.

⚠️ El documento cierra sin ambigüedad:

> *"No podrá obtener el scope de Business Messaging para su app sin completar
> el proceso de revisión de seguridad y privacidad. **No hay excepciones.**"*

⚠️ El avance **no se puede consultar** en el portal: la revisión es manual y
los tickets de soporte no sirven para preguntar por el estado.

---

## Lo que de verdad exige la revisión (esta es la parte dura)

No es un formulario de dos preguntas. Es una auditoría de la empresa.

### Privacidad
- Responsable de privacidad nombrado dentro de la organización (y DPO donde la
  ley lo exija)
- **Aviso de privacidad** que explique qué se recoge, para qué, dónde se
  transfiere, cómo se protege y cuánto se guarda
- **Derechos del titular**: poder acceder, descargar, actualizar y borrar
- **Retención**: borrar los datos cuando el negocio retire la autorización
- **Minimización**: pedir solo los datos necesarios

### Seguridad
- **Política de seguridad de la información** escrita, revisada y firmada por
  la dirección
- **Seguridad de red**: segregación de redes, herramientas tipo NIDS/HIPS
- **Endpoints**: antivirus o HIPS, escaneos periódicos
- **Líneas base**: contraseñas mínimas, **MFA en cuentas de administrador**,
  bloqueo de pantalla (ej. 15 min), formación periódica al personal
- **Cifrado**: en reposo **AES-256** o superior; en tránsito **TLS 1.2** o superior
- **Control de acceso**: política publicada, *need-to-know* y *least-privilege*,
  registros de acceso, revisión anual de privilegios
- **Vulnerabilidades**: escaneos o pentests con informes guardados
- **Incidentes**: política publicada, **simulacros anuales**, informes documentados

**Acelera la aprobación** adjuntar ISO 27001, informe SOC 2, o el último
escaneo de vulnerabilidades / pentest.

### Qué de eso ya tiene Cobra

| Requisito | Estado |
|---|---|
| Aviso de privacidad | ✅ `cobrapos.app/privacy-policy` |
| Borrado de datos a petición | ✅ `cobrapos.app/data-deletion` |
| Términos de servicio | ✅ `cobrapos.app/terms` (10-ago) |
| TLS en tránsito | ✅ todo va por HTTPS / Supabase |
| Cifrado en reposo | ✅ lo da Supabase |
| Aislamiento por cliente | ✅ RLS por tenant |
| Políticas ESCRITAS (seguridad, acceso, incidentes, retención) | 🔴 **no existen** |
| MFA en cuentas de administrador | 🔴 por verificar |
| Escaneo de vulnerabilidades / pentest | 🔴 no hay |
| Formación y simulacros | 🔴 no hay |

Buena parte de lo técnico ya está; **lo que falta es papel**: tres o cuatro
políticas escritas y una evidencia de escaneo.

---

## Lo que hay construido en Cobra

- `chat-ia.js:13` → `TIKTOK_CLIENT_KEY = '7650415130718502929'` (la app de arriba)
- `chat-ia.js:1299` → arma la URL de OAuth con scopes de contenido/insights
- Funciones `tiktok-webhook`, `tiktok-oauth-callback`, `tiktok-check-webhook`
  ⚠️ **`tiktok-webhook` está caída**, y ya lo estaba antes
- Fila `tiktok` en `chat_channels` con `meta` vacío
- TikTok en `SOON_CHANNELS` → sale como "Próximamente"

---

## PASO 1 — Arreglar los datos de la app  ✅ HECHO 10-ago-2026

Decidido el 10-ago: **sí se solicita el acceso a mensajería.** Mucha gente le
escribe a El Parche por TikTok; el juicio de "rinde poco" era mío y estaba mal.

Se limpió la app antes de solicitar, porque la DSPR revisa **a la empresa** y
apuntaba a otro producto (el mismo desalineamiento que costó el rechazo de Meta
en julio).

| Campo | Antes | Ahora |
|---|---|---|
| App logo | decía **ORDERFLOW** | ✅ logo de Cobra POS (512x512) |
| Advertiser redirect URLs | `https://auralanguage.app` | ✅ `https://cobrapos.app` |
| Account holder redirect URLs | dos, una a `auralanguage.app` | ✅ solo la de Supabase (`.../functions/v1/tiktok-oauth-callback`) |
| App Name | `Restaurant Pos` | sin cambiar (no es bloqueante) |

La *Advertiser authorization URL*, que TikTok arma sola, se actualizó sola y ya
termina en `cobrapos.app`.

ℹ️ **El rojo no es un error.** En este portal la URL en rojo marca la
**principal**; las demás salen en negro. (Yo lo interpreté como aviso de fallo:
era falso.)

### Confirmado en el portal

La lista de *Scope of permission* **no contiene la palabra "messaging"**. No es
una casilla que se marque: el scope se concede al pasar la revisión, tal como
dice el documento. El orden es arreglar -> solicitar -> esperar.

---

## Recomendación

**No ahora, pero no está bloqueado.** Es una decisión de tiempo, no un muro:

- **A favor:** Colombia entra, la app ya está aprobada, no hace falta socio ni
  video, y el proceso es una sola solicitud.
- **En contra:** son 4 a 6 semanas de reloj, buena parte del trabajo es
  redactar políticas de seguridad, y TikTok como canal de pedidos para un
  restaurante en Popayán rinde poco frente a WhatsApp.

**Cuándo sí vale la pena:** cuando Cobra se venda a restaurantes que pidan
TikTok, o cuando haya que redactar esas políticas de todos modos (que va a
pasar: son las mismas que pide cualquier cliente mediano). Ahí el costo extra
de pedir TikTok es casi cero.

**Mientras tanto:** dejarlo en "Próximamente", que es donde está.

---

## Pendientes concretos si se decide hacerlo

- [ ] Anotar el correo corporativo del portal
- [ ] Corregir las URLs de redirección de la app (hoy apuntan a `auralanguage.app`)
- [ ] Escribir las políticas: seguridad de la información, control de acceso,
      respuesta a incidentes, retención de datos
- [ ] Activar MFA en las cuentas de administrador y dejar constancia
- [ ] Correr un escaneo de vulnerabilidades y guardar el informe
- [ ] Llenar el formulario **excluyendo Estados Unidos**
- [ ] Levantar `tiktok-webhook` (está caída) antes de integrar nada
