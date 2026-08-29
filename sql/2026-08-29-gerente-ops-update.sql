-- El boton de Deshacer marca la fila como ya deshecha (`deshecho_at`) para que
-- un segundo toque no vuelva a aplicarla. Ese UPDATE fallaba en silencio:
-- pos_gerente_ops se creo por la API de administracion y esas tablas nacen SIN
-- permisos. Tenia INSERT y SELECT (por eso el rastro se escribia y se leia),
-- pero no UPDATE. Misma trampa de siempre.
grant update on public.pos_gerente_ops to service_role;
notify pgrst, 'reload schema';
