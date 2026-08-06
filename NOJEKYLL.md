# Por qué existe `.nojekyll`

GitHub Pages, por defecto, procesa el sitio con Jekyll antes de publicarlo.
Jekyll interpreta `{{ ... }}` y `{% ... %}` como plantillas suyas, y si no
entiende lo que encuentra, **la publicación entera falla**.

Eso paso el 6-ago-2026: dos publicaciones seguidas quedaron en "Page build
failed" y el servidor siguio entregando la version anterior. Desde fuera se veia
como si los cambios no se hubieran subido — pero estaban en GitHub; lo que no
corria era la publicacion.

En este repo hay `{{` de verdad en el codigo (las plantillas de variables del
chat, por ejemplo), asi que el choque estaba garantizado.

Con este archivo vacio, Pages se salta Jekyll y sirve los archivos tal cual, que
es justo lo que hace falta: aqui no hay nada que Jekyll deba construir.

**No borrar.** Sin el, cualquier `{{` que alguien escriba en un comentario puede
tumbar la publicacion de todo el sistema.
