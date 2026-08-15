# Registro de Incidentes de Seguridad — Cobra POS

Registro exigido por [POL-03 §5](POL-03-respuesta-a-incidentes.md). Se conserva
**mínimo 3 años**. Una entrada por incidente, aunque resulte ser falsa alarma:
las falsas alarmas cerradas también son evidencia de que el procedimiento
funciona.

**Abierto el 14 de agosto de 2026.**

---

## Incidentes registrados

*Ninguno a la fecha.*

---

## Simulacros

| Fecha | Escenario | Resultado |
|---|---|---|
| *Programado 30-sep-2026* | Credencial de la API de WhatsApp filtrada en el repositorio público | Pendiente |

---

## Plantilla para una entrada nueva

Copiar debajo de "Incidentes registrados" y numerar de forma correlativa.

```markdown
### INC-001 — <título corto>

| | |
|---|---|
| **Detectado** | <fecha y hora> |
| **Detectado por** | <quién o qué mecanismo> |
| **Severidad** | Crítico / Alto / Medio / Bajo |
| **Estado** | Abierto / Contenido / Cerrado |
| **Cerrado** | <fecha> |

**Qué se observó**
<lo que se vio, antes de saber la causa>

**Contención** — <qué se hizo primero para detener el daño, y a qué hora>

**Alcance** — qué datos, de cuántas personas, de cuántos restaurantes, y en qué
ventana de tiempo. Si no se pudo descartar la exposición, se asumió que la hubo.

**Notificaciones**

| A quién | Cuándo | Cómo |
|---|---|---|
| | | |

**Causa raíz** — por qué pasó de verdad, no cuál fue el síntoma.

**Qué control falló** — qué debía haberlo impedido y no lo hizo.

**Qué se cambió** — la corrección, y si obligó a modificar alguna política.
```
