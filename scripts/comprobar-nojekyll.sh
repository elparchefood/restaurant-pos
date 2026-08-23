#!/bin/sh
# ══════════════════════════════════════════════════════════════════════
#  EL CENTINELA DEL .nojekyll
#
#  Sin ese archivo, GitHub Pages pasa el sitio por Jekyll, que interpreta
#  las llaves {{ }} y {% %} de los .md y REVIENTA la publicacion. Paso el
#  22-ago-2026: se borro en un commit y hubo 8 publicaciones fallidas
#  seguidas — el frontend de ese dia nunca salio y nadie se entero hasta
#  que Sergio pregunto por los correos de error.
#
#  El porque completo esta en NOJEKYLL.md
# ══════════════════════════════════════════════════════════════════════
if [ ! -f .nojekyll ]; then
  echo ""
  echo "  ✗ FALTA EL ARCHIVO .nojekyll EN LA RAIZ"
  echo ""
  echo "  Sin el, GitHub Pages pasa el sitio por Jekyll y la publicacion"
  echo "  falla en silencio: el sitio se queda con la version vieja."
  echo ""
  echo "  Solucion:  touch .nojekyll  &&  git add .nojekyll"
  echo ""
  exit 1
fi
exit 0
