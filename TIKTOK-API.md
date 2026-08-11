# TikTok API — qué hay y dónde vive

Escrito el 10-ago-2026, después de perder un rato buscando con qué cuenta se
había registrado. **Este archivo existe para no volver a buscarlo.**

---

## Dónde se entra

Portal de desarrolladores: `business-api.tiktok.com/portal/apps`

⚠️ **No confundir con TikTok for Business (anuncios).** Son dos cuentas
distintas:

| | Cuenta |
|---|---|
| **TikTok for Business** (anuncios, `ads-service.tiktok.com`) | `elparche.foodpopayan@gmail.com` |
| **Portal de desarrolladores** (la API) | correo corporativo — *pendiente de anotar* |

El correo del portal es un **alias de un dominio propio en Porkbun** que
reenvía a un buzón de Gmail. Por eso los correos llegan pero el usuario no es
ese Gmail. Los alias se ven en Porkbun → Domain Management → icono del sobre
del dominio.

Datos de Porkbun útiles: cuenta `sergiosaac`; el contacto del registrante de
`auralanguage.app` es `creatorspremium.co@gmail.com`.

---

## La app

| | |
|---|---|
| Nombre | **Restaurant Pos** |
| App ID | `7650415130718502929` |
| Verification Status | **Approved** ✅ |
| Secret | empieza `1a1…` y termina `…908` (se ve completo en el portal) |

---

## Qué hay construido en Cobra

Ya existen, de un intento anterior:

- La fila `tiktok` en `chat_channels` (con `meta` vacío)
- Las funciones `tiktok-webhook`, `tiktok-oauth-callback`, `tiktok-check-webhook`
- ⚠️ **`tiktok-webhook` está caída** y ya lo estaba antes; no se tocó porque
  TikTok no está en uso
- TikTok sigue en `SOON_CHANNELS` de `chat-ia.js` → sale como "Próximamente"

---

## Lo que falta por averiguar

- [ ] **Anotar el correo corporativo** con el que se entra al portal
- [ ] **Ver qué API products tiene concedidos la app.** Que la app esté
      "Approved" no significa que tenga la mensajería: hay que abrir
      *Restaurant Pos* en el portal y mirar la lista de productos.
- [ ] Confirmar si la **Business Messaging API** (mensajes directos) está
      disponible directamente o sigue exigiendo ser *Messaging Partner*
      (socio autorizado). Lo anotado el 31-jul decía que solo por socio.
      Doc: `business-api.tiktok.com/portal/docs/direct-messages/v1.3`
- [ ] Si la mensajería está disponible: levantar `tiktok-webhook`, llenar la
      fila de `chat_channels` y sacar TikTok de `SOON_CHANNELS`.

**Prioridad: baja.** WhatsApp es la enorme mayoría de los pedidos y los
permisos de Meta ya están en revisión. TikTok va después.
