# PLAN NIVEL 2 — Dejar la aplicación LOCAL dentro del .exe

> **Estado:** APLAZADO A PROPÓSITO. Decisión de Sergio, 4 de agosto de 2026.
> Se implementa **cuando la plataforma esté consolidada**, es decir cuando ya no
> se hagan cambios de pantallas casi a diario. Mientras haya cambios frecuentes,
> el actualizador es más riesgo que beneficio.
>
> **Este documento existe para que no se olvide.** No borrar. Al retomar, leer
> completo antes de escribir una línea de código.

---

## 1. El problema que resuelve

Hoy el `.exe` **no contiene la aplicación**. `cobra-pos-electron\main.js` hace
`loadURL('https://cobrapos.app/dashboard.html')`, así que el programa instalado
es un navegador que baja el sitio de internet **cada vez que se cambia de
pantalla**.

Medido el 4 de agosto de 2026 desde el equipo de Sergio (Popayán):

| Pantalla | Archivos que baja | Peso | Solo la descarga |
|---|---|---|---|
| Dashboard | 13 | 326 KB | 12.5 s |
| Ventas | 15 | 369 KB | 5.3 s |
| Caja | 13 | 379 KB | 4.3 s |
| Inventario | 5 | 292 KB | 2.5 s |
| Catálogo | 5 | 176 KB | 1.8 s |

Y GitHub Pages responde `Cache-Control: max-age=600`: pasados **10 minutos** el
navegador vuelve a preguntar por los 13–15 archivos uno por uno, aunque no hayan
cambiado. Por eso el sistema se siente lento después de un rato quieto — que es
exactamente lo que pasa en un restaurante entre pico y pico.

El archivo más pesado es `modules/ventas-salon.js` (186 KB), y además se baja la
librería de Supabase desde `cdn.jsdelivr.net`, que es un servidor de terceros.

## 2. Lo que se quiere lograr

Palabras de Sergio:

> "Cada vez que se abra el programa por primera vez se carguen todos esos
> archivos, entonces ahí sí tardaría un poco en abrir el programa, pero una vez
> abierto el programa todo tiene que ser instantáneo."

Traducido a requisitos:

1. Navegar entre pantallas = **0 descargas**. Los archivos salen del disco duro.
2. Al **abrir** el programa se comprueba si hay versión nueva; si la hay se baja
   (ahí sí puede tardar unos segundos) y desde ese momento todo es local.
3. Si Sergio publica un cambio, el usuario lo recibe **la próxima vez que abra**
   el programa. No a mitad de turno.
4. Sin internet, el programa **abre igual** con la última versión que tenga.

## 3. Arquitectura propuesta

### 3.1 Qué se empaqueta y qué no

**Va dentro del .exe (semilla inicial):** todos los `.html`, `.css`, `.js`, la
carpeta `assets/`, y la librería de Supabase **descargada** (dejar de depender de
`cdn.jsdelivr.net`).

**NO va dentro:** nada que dependa del restaurante (catálogo, precios, fotos de
productos, configuración). Eso es del Nivel 1 y vive en el equipo pero como
datos, no como archivos del programa.

### 3.2 Dónde viven los archivos actualizados

No se escribe encima de la carpeta de instalación (en Windows suele estar en
`Program Files` y requiere permisos de administrador). Se usa:

```
%APPDATA%\Cobra POS\app\        <- versión descargada, la que se usa
<carpeta de instalación>\app\   <- semilla que vino con el .exe, solo lectura
```

Al arrancar, `main.js` decide cuál de las dos usar: la de `%APPDATA%` si existe y
su versión es mayor o igual; si no, la semilla.

### 3.3 El manifiesto de versión

En el repositorio se publica `version.json`:

```json
{
  "version": "2026.08.04.1",
  "archivos": {
    "dashboard.html": { "sha": "a1b2c3…", "bytes": 41900 },
    "modules/ventas-salon.js": { "sha": "d4e5f6…", "bytes": 190464 }
  }
}
```

- La generación de este archivo debe ser **automática** (un script que recorre el
  repositorio y calcula SHA-256 de cada archivo). Si se hace a mano se va a
  desincronizar el primer día.
- El actualizador compara SHA por archivo y **baja solo los que cambiaron**. Un
  cambio en un CSS no puede costar 3 MB de descarga.

### 3.4 El flujo al abrir el programa

```
1. main.js lee la versión local instalada.
2. Pide https://cobrapos.app/version.json  (con timeout de 5 s).
   · Sin internet o timeout  -> sigue con lo local. NO bloquea. NO muestra error.
3. Si la versión remota es igual -> abre de una. Cero descargas.
4. Si es distinta:
   · Muestra una pantalla de "Actualizando Cobra POS…" con barra de progreso.
   · Baja SOLO los archivos con SHA distinto, a una carpeta TEMPORAL.
   · Verifica el SHA de cada archivo bajado. Si uno no coincide, ABORTA
     completo y sigue con la versión anterior.
   · Solo cuando TODOS están bajados y verificados, se mueve la carpeta temporal
     encima de la buena (operación atómica, con la anterior guardada como
     respaldo).
5. Carga file:// desde la carpeta buena.
```

**La regla de oro: nunca dejar la aplicación a medio actualizar.** O se actualiza
entera o no se actualiza. Un restaurante con la mitad de los archivos nuevos y la
mitad viejos es un desastre imposible de diagnosticar por teléfono.

### 3.5 Rutas relativas

Al pasar de `https://` a `file://` se rompe todo lo que use rutas absolutas
(`/assets/...`). **Antes de empezar hay que auditar** todas las referencias del
proyecto y dejarlas relativas. Es trabajo mecánico pero hay que hacerlo primero:
si se descubre a mitad de camino, se pierde el día.

También hay que revisar:
- `window.location.href = 'login.html'` — funciona en `file://`, pero verificar.
- Cualquier `fetch()` a rutas del propio sitio.
- Las llamadas a Supabase siguen siendo por internet y no cambian.

## 4. Riesgos, y por qué se aplaza

| Riesgo | Qué pasa si sale mal | Cómo se controla |
|---|---|---|
| El actualizador falla en el equipo del cliente | Se queda con una versión vieja **para siempre** y no es arreglable a distancia | Verificar SHA, actualización atómica, y respaldo de la versión anterior |
| Se actualiza a mitad de turno | Pantalla recargando mientras hay pedidos abiertos | Solo al abrir el programa, nunca durante el uso |
| Archivos con rutas absolutas | Pantallas en blanco al pasar a `file://` | Auditoría de rutas ANTES de empezar |
| Falla la comprobación de versión | El programa no abre | Timeout de 5 s y seguir con lo local. Nunca bloquear el arranque por internet |

**Por eso se aplaza:** mientras se cambia el sistema todos los días, cada cambio
tendría que pasar por el actualizador, y un actualizador nuevo es justamente lo
que más falla. Hoy, si algo sale mal, Sergio recarga con Ctrl+F5 y listo.
Con Nivel 2 eso deja de existir.

## 5. Orden de trabajo cuando se retome

1. Auditar y arreglar todas las rutas absolutas → probar cada pantalla en `file://`.
2. Bajar la librería de Supabase al repositorio y quitar el CDN de terceros.
3. Escribir el generador de `version.json` y publicarlo en el repositorio.
4. Escribir el actualizador en `main.js` (descarga, verificación, cambio atómico).
5. Probar el camino feliz, y **sobre todo** los caminos malos:
   sin internet · internet lento · descarga cortada a la mitad · SHA que no cuadra
   · disco lleno · sin permisos de escritura.
6. Probar en un equipo que **no** sea el de Sergio antes de publicar.
7. Reconstruir el .exe (ver la memoria `cobra_pos_electron_build`: se usa
   `@electron/packager`, no `electron-builder`).

## 5.bis PENDIENTE OBLIGATORIO — El INSTALADOR

> Pedido expreso de Sergio, 4 de agosto de 2026:
> *"Al final vamos a encerrar todo en un instalador, para que todo lo que yo
> tengo instalado otra persona lo pueda instalar con el instalador paso a paso."*

**Hoy no existe instalador.** El programa se "instala" copiando a mano una
carpeta de 172 MB y creando accesos directos también a mano. Eso funciona en el
equipo de Sergio pero **no se le puede pedir a un cliente**.

Estado actual del equipo de Sergio (4 de agosto de 2026):
- App real: `C:\Prueba Claude Code\cobra-pos-electron\dist\Cobra POS-win32-x64\`
- Accesos directos: escritorio y menú Inicio, ambos apuntando ahí (el del menú
  Inicio apuntaba a una instalación vieja distinta; se enderezó ese mismo día).

Lo que el instalador tiene que hacer:

1. Un solo archivo `.exe` que el cliente baja y ejecuta.
2. Pantallas paso a paso: bienvenida, dónde instalar, instalar, terminar.
3. Instalar en `%LOCALAPPDATA%\Cobra POS` (no en `Program Files`: así no pide
   permisos de administrador, y el actualizador del Nivel 2 puede escribir).
4. Crear acceso directo en escritorio y en el menú Inicio, con el ícono oficial.
5. Registrar la aplicación en "Agregar o quitar programas", **con desinstalador**.
6. Detectar si ya está instalada y ofrecer actualizar en vez de duplicar.
   *(Justo el problema que Sergio reportó: se llenó de copias y no sabía cuál era
   la buena.)*
7. Idealmente **firmar el ejecutable**, o Windows SmartScreen le va a mostrar al
   cliente una advertencia de "aplicación desconocida" que asusta. Requiere
   comprar un certificado — decisión comercial, no técnica.

Herramienta: `electron-builder` con destino NSIS. Ya está en `package.json` y la
configuración `nsis` está escrita (oneClick false, elegir carpeta, accesos
directos). **Ojo:** `electron-builder` falla en este equipo por los symlinks de
winCodeSign, que piden privilegio de administrador — por eso hoy se empaqueta con
`@electron/packager`. Hay que resolver eso o construir el instalador en otra
máquina / con Windows en modo desarrollador.

**Orden recomendado: instalador ANTES que actualizador.** Sin instalador no hay
clientes; y el actualizador del Nivel 2 necesita saber dónde quedó instalada la
aplicación, cosa que hoy no está definida.

## 6. Qué YA se hizo (Nivel 1) y no hay que repetir

- La foto del restaurante se reduce a 256×256 al subirla y se guarda en el equipo
  (`localStorage`, clave `pos.brand.foto`). Antes pesaba 566 KB y se bajaba de
  internet. — commit `82f544c`
- Los dos vigilantes del DOM de `pos-brand.js` se agrupan por cuadro de pantalla
  y se apagan a los 20 segundos. Antes revisaban el documento entero en cada
  cambio y no paraban nunca. — commit `82f544c`
- El nombre del restaurante ya se pintaba desde el equipo y se refrescaba en
  segundo plano (`pos.brand.name`).

---

*Escrito el 4 de agosto de 2026, a petición expresa de Sergio, para que no se
pierda entre sesiones.*
