# TikTok API — auditoría y qué hacer

Auditoría hecha el 10-ago-2026 entrando al portal. **Conclusión corta: hoy no
se puede recibir ni enviar mensajes de TikTok, y no es cuestión de pedir un
permiso — hace falta pasar por un socio autorizado.**

---

## Dónde se entra

Portal de desarrolladores: `business-api.tiktok.com/portal/apps`

⚠️ **No confundir con TikTok for Business (anuncios).** Son dos cuentas:

| | Cuenta |
|---|---|
| **TikTok for Business** (anuncios, correos de `ads-service.tiktok.com`) | `elparche.foodpopayan@gmail.com` |
| **Portal de desarrolladores** (la API) | correo corporativo — *pendiente de anotar* |

El correo del portal es un **alias de un dominio propio en Porkbun** que
reenvía a un Gmail; por eso los correos llegan pero el usuario no es ese Gmail.
Los alias se ven en Porkbun → Domain Management → icono del sobre del dominio.
Cuenta de Porkbun: `sergiosaac`. El contacto del registrante de
`auralanguage.app` es `creatorspremium.co@gmail.com`.

---

## La app que existe

| | |
|---|---|
| Nombre | **Restaurant Pos** |
| App ID | `7650415130718502929` |
| Verification Status | **Approved** ✅ |
| Logo | dice **ORDERFLOW** (nombre viejo del proyecto) |
| Advertiser redirect URL | `https://auralanguage.app` ⚠️ |
| Redirect del titular de cuenta | `https://auralanguage.app/auth/tiktok/callback` ⚠️ |

⚠️ **Las URLs de redirección apuntan a `auralanguage.app`, que es el dominio de
Aura Languages, no de Cobra.** La app se creó para otra cosa y se reutilizó.

### Permisos que SÍ tiene (todos de publicidad)

Ad Account Management · Ads Management · Audience Management · Reporting ·
Measurement · Creative Management · App Management · Pixel Management ·
DPA Catalog · Reach & Frequency · Lead Management · Creator Marketplace ·
TikTok Creator · Ad Comments · Business Plugin · Automated Rules ·
TikTok Accounts · Onsite Commerce Store · Offline Events · Ad Diagnosis ·
Mentions · CRM Event Management · Business Recommendation · CTX Events ·
Brand Safety · Partner Insights · Payment Portfolio · Custom Conversion ·
Minis Management · Business Verification

**Ninguno de mensajería.** Es una app de *Marketing API*, no de mensajería.

---

## Por qué no se puede pedir la mensajería

En el portal, la **Business Messaging API** aparece listada como colección
aparte de la Marketing API — pero **no es un permiso que se marque en la app.**
El acceso va por el programa de **Messaging Partners**: plataformas terceras
autorizadas por TikTok.

**Socios autorizados hoy (9):** Blip.ai · Halosis · Haravan · Pancake ·
Qiscus · Respond.io · Zwiz · **Gupshup** · **Infobip**

El negocio conecta su cuenta de TikTok Ads Manager con uno de esos socios y le
autoriza "acceder y gestionar conversaciones" y "recibir webhooks".

✅ **Buena noticia de región:** la mensajería de TikTok está disponible para
cuentas registradas **fuera de EE. UU., el Espacio Económico Europeo, Suiza y
Reino Unido**. Colombia entra.

---

## Lo que hay construido en Cobra (y que no sirve todavía)

- `chat-ia.js` línea 13: `TIKTOK_CLIENT_KEY = '7650415130718502929'` — la app de
  arriba, la de anuncios.
- `chat-ia.js` línea 1299: arma la URL de OAuth de TikTok con esos scopes.
- Funciones `tiktok-webhook`, `tiktok-oauth-callback`, `tiktok-check-webhook`.
  ⚠️ **`tiktok-webhook` está caída** y ya lo estaba antes.
- Fila `tiktok` en `chat_channels` con `meta` vacío.
- TikTok sigue en `SOON_CHANNELS` → sale como "Próximamente". **Correcto: que
  se quede ahí.**

---

## Las tres salidas, y la recomendación

| | Qué implica |
|---|---|
| **A. Ser Messaging Partner** | Postularse al programa de TikTok. Es una alianza comercial, no un formulario: piden escala y soporte. No es realista para el MVP. |
| **B. Ir a través de un socio** | Cobra se integra con Gupshup, Infobip o Respond.io. Funciona ya, pero cuesta dinero por conversación y mete una dependencia de un tercero en el camino de los mensajes. |
| **C. No hacer TikTok ahora** ⭐ | Dejarlo en "Próximamente". WhatsApp es la enorme mayoría de los pedidos y Meta ya está en revisión. |

**Recomendación: C.** Y si algún día se hace, **B con Gupshup o Infobip**,
porque los dos son además BSP de Meta — resolverían WhatsApp, Instagram,
Messenger y TikTok con un solo proveedor. Eso ya estaba anotado el 31-jul y la
auditoría lo confirma.

---

## Pendientes menores (no urgentes)

- [ ] Anotar el correo corporativo del portal.
- [ ] Decidir qué hacer con la app `Restaurant Pos`: hoy tiene permisos de
      anuncios y redirecciones a `auralanguage.app`. O se arregla para Cobra,
      o se deja quieta para Aura. **No sirve para mensajería en ningún caso.**
- [ ] `tiktok-webhook` está caída. Mientras TikTok no se use, da igual; pero
      conviene saberlo antes de tocar nada.

**Fuentes:** [Messaging Partners de TikTok](https://ads.tiktok.com/help/article/about-message-management-tools) ·
[Especialidad de Messaging Partner](https://ads.tiktok.com/business/en/blog/introducing-messaging-partner-specialty) ·
[Portal de la API](https://business-api.tiktok.com/portal)
