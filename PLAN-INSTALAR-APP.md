# Plan — Campaña para que instalen la app

> Idea de Sergio, 21-ago-2026. Para hacer **mañana**, no hoy.

## De dónde sale

El 21-ago salió la campaña `puntos_app` a 95 personas: **95 entregados, 0
fallidos**, y en media hora se registraron **18 personas nuevas** en la app
(de 4 que había, a 22).

Pero de esas 22, **solo 4 tienen avisos activos**. Los otros 18 no pueden
recibir notificaciones.

## Por qué no los tienen

Dos motivos, y ninguno es un error del sistema:

1. **En iPhone los avisos EXIGEN instalar la app en la pantalla de inicio.**
   Es regla de Apple. Si se quedan en el navegador, iOS ni siquiera permite
   pedirles permiso — por eso a ellos la app no les pregunta nada.
2. **Quien abre el enlace desde WhatsApp está en una ventana prestada**, dentro
   de WhatsApp. Ahí no se pueden activar, y se perderían al salir.

Sandra Cuaspud se registró el mismo día desde la campaña **y sí tiene avisos**:
el camino funciona, los demás no llegaron a darle permiso.

## Lo que hay que construir

### 1. La lista
Un filtro nuevo en las listas de WhatsApp: **registrado en la app Y sin avisos**.
Los filtros viven en `fn_wa_armar_lista` (`v_filtro`), junto a `puntos` y
`saldo`. El dato está en `pos_web_push`: si no tiene fila, no tiene avisos.

### 2. La plantilla
La crea Sergio en Meta y espera aprobación. Ojo con una cosa:

⚠️ **Las instrucciones son distintas en iPhone y en Android, y desde el número
de teléfono no sabemos qué tiene la persona.** Una plantilla de WhatsApp no
puede ramificar. Así que el mensaje NO debe explicar los pasos: debe llevar a
una página que detecte el teléfono y muestre los suyos.

Ya existe esa detección en `app-cliente.js` (`enAppAjena()`, `esIOS()`,
`yaInstalada()`), hecha el 20-ago para el modal de Instagram. Falta una pantalla
dedicada que lo use.

### 3. El hueco que hay que tapar primero
**Al que está en iPhone sin instalar, hoy la app no le dice nada.** Comprueba si
puede mandar avisos, ve que no, y se calla (`puedeAvisos()` devuelve false y
`ofrecerNotificar()` no hace nada).

Debería decirle *"instálame en tu pantalla de inicio y te aviso cuando tu pedido
esté listo"* — justo al registrarse, que es cuando más ganas tiene.

**Esto vale la pena hacerlo ANTES de la campaña**: si la campaña los manda a una
app que tampoco les explica nada, se gasta el envío en balde.

### 4. Medir si sirvió
Contar cuántos ganaron avisos después del envío. `pos_web_push.creado` contra la
fecha de la campaña. Sin esto no se sabe si la plantilla funcionó o solo gastó
cupo.

## Cuidados

- **No quemar el número.** Esas 95 personas acaban de recibir un mensaje hoy.
  Mandar otro mañana a un subconjunto está bien; mandar a todos otra vez, no.
- El límite de Meta es por ventana de 24 h, y el envío ya se frena solo.
- Los avisos **no reemplazan a WhatsApp**: son gratis y llegan solos, pero solo
  al que los activó. WhatsApp llega a todos y cuesta.
