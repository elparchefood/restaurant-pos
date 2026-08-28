-- Quien revisa los pagos es el administrador de la plataforma, desde la consola.
-- Sin esta política el UPDATE se va en "permission denied" y el botón de aprobar
-- no hace nada sin decir por qué.
grant update on public.pos_pagos_suscripcion to authenticated;

drop policy if exists pagos_susc_admin_revisa on public.pos_pagos_suscripcion;
create policy pagos_susc_admin_revisa on public.pos_pagos_suscripcion
  for update to authenticated
  using (public.es_admin_plataforma())
  with check (public.es_admin_plataforma());

notify pgrst, 'reload schema';
