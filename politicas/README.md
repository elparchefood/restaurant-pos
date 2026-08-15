# Políticas — Cobra POS

Los cuatro documentos que pide la revisión de seguridad y privacidad de TikTok
(DSPR), y que sirven igual para cualquier cliente mediano o corporativo que
pregunte cómo se protegen sus datos.

**Emitidos el 14 de agosto de 2026. Versión 1.0.**

| Documento | De qué trata |
|---|---|
| [POL-01 — Seguridad de la información](POL-01-seguridad-de-la-informacion.md) | Cómo se protege la información: cifrado, aislamiento entre restaurantes, secretos, terceros |
| [POL-02 — Control de acceso](POL-02-control-de-acceso.md) | Quién ve qué y por qué: necesidad de conocer, mínimo privilegio, los 5 roles, RLS |
| [POL-03 — Respuesta a incidentes](POL-03-respuesta-a-incidentes.md) | Qué se hace cuando algo sale mal: contener, evaluar, notificar en 72 h, aprender |
| [POL-04 — Retención y borrado](POL-04-retencion-y-borrado.md) | Cuánto se guarda cada dato y cómo se borra |

Registro vivo: [registro-incidentes.md](registro-incidentes.md)

---

## Cómo se usan

**Idioma.** La versión autorizada es la española: es la lengua en que opera la
empresa y en la que el titular las aprueba. El evaluador de TikTok lee en
inglés — cuando llegue el cuestionario se produce la traducción, señalando que
la española es la que rige.

**Formato de entrega.** Al evaluador se le entregan en PDF, con la fecha y la
firma del titular. No se publican en el sitio web: son documentos internos, y
publicar el detalle de los controles de seguridad da mapa a quien no debe
tenerlo. Lo que sí es público es el aviso de privacidad, que ya está en
`cobrapos.app/privacy-policy`.

**Honestidad por encima de la apariencia.** Estas políticas describen lo que
está vigente hoy y declaran abiertamente lo que todavía no. Un auditor detecta
una política inflada en la primera pregunta de seguimiento, y ahí se cae toda
la credibilidad del resto. Un hueco declarado con fecha de cierre, en cambio,
se lee como control de la propia operación.

---

## Lo que hay que hacer antes de responder el cuestionario

Estos cinco puntos están escritos como compromisos dentro de POL-01 §8. Si
llegan sin cumplirse, hay que cambiar la fecha o cambiar el texto — lo que no
se puede es dejar escrita una fecha vencida.

| # | Qué | Para cuándo |
|---|---|---|
| 1 | Activar **MFA** en Supabase, GitHub, Porkbun, Meta, TikTok y Google, y guardar captura de cada una | 31-ago-2026 |
| 2 | Correr un **escaneo de vulnerabilidades** sobre `cobrapos.app` y guardar el informe | 31-ago-2026 |
| 3 | **Corregir el aviso de privacidad**: quitar Stripe (no se usa), añadir Wompi, Google y GitHub | 31-ago-2026 |
| 4 | Primer **simulacro de incidente** documentado | 30-sep-2026 |
| 5 | **Rotar credenciales** de todos los paneles y anotar la fecha | 30-sep-2026 |

Los puntos 1 y 2 son los que más pesan: el propio documento de TikTok dice que
adjuntar un informe de escaneo **acelera la aprobación**.

---

## Lo que estas políticas afirman, y se puede comprobar

Todo dato técnico que aparece en los documentos se verificó el 14 de agosto de
2026 contra el sistema real, no se supuso:

- **RLS habilitado en 82 de 82 tablas** del esquema `public`, con **98
  políticas activas**. Este es el control que impide que un restaurante vea los
  datos de otro.
- **Ningún secreto en el repositorio público.** Se barrió todo el árbol
  buscando JWT de `service_role`, tokens de Supabase, de GitHub, de OpenAI y de
  Meta. Los únicos JWT presentes son claves `anon`, públicas por diseño.
- **5 roles reales** en la plataforma: Administrador, Cajero, Cocinero,
  Domiciliario, Mesero.
- **Proveedores realmente conectados:** Supabase, OpenAI, Meta, Wompi, Google
  (Gmail solo lectura), GitHub, Porkbun. TikTok queda pendiente de aprobación.
