-- El administrador de la plataforma necesita ver y administrar las cuentas de
-- TODOS los restaurantes: es lo que hace la consola (listar clientes,
-- suspender, reactivar, cambiar de plan).
--
-- La politica que habia, `owner_tenant`, deja a cada dueño con la suya y nada
-- mas — correcto para ellos, pero dejaba a Sergio sin poder tocar la cuenta de
-- nadie. El boton de Suspender habria seguido fallando aun con el codigo
-- arreglado.
--
-- Se agrega una politica APARTE en vez de aflojar la existente: asi el
-- aislamiento entre restaurantes queda intacto y el acceso del administrador es
-- explicito y facil de revisar.
drop policy if exists "admin plataforma ve tenants" on public.tenants;
create policy "admin plataforma ve tenants" on public.tenants
  for all using (public.es_admin_plataforma())
  with check (public.es_admin_plataforma());
