# El cuadro de Fire TV

El cuadro de la fila de inicio de un Fire Stick es **ancho** (16:9). El que
llevaba la APK de cocina medía 320×180 —el tamaño correcto— pero dentro solo
había el escudo, centrado y pequeño: ocupaba menos de un tercio del alto. Al
lado de Kick o Win, que llenan su cuadro, se veía como un error.

El tamaño nunca fue el problema. Era la composición.

Estos llevan el logotipo horizontal (escudo + palabra) al 78% del ancho, en
blanco pleno sobre el azul del ejecutable (`#303680`). Blanco pleno y no el
degradado azul del logo original: una TV se mira a tres metros y ese degradado
se pierde contra el fondo.

| Archivo | Va en | Para |
|---|---|---|
| `tv_banner_<app>_xhdpi.png` (320×180) | `res/drawable-xhdpi/tv_banner.png` | el tamaño que pide Amazon |
| `tv_banner_<app>_xxhdpi.png` (640×360) | `res/drawable-xxhdpi/tv_banner.png` | que no se vea borroso en 4K |

El manifiesto ya apunta a `@drawable/tv_banner`, en `android:banner` **y** en
`android:icon`, los dos **sobre la actividad** — no basta ponerlos sobre
`<application>`, y eso ya costó una tarde.

`generar-banners.py` los vuelve a crear si cambia el logo. No editar los PNG a
mano: se regeneran.
