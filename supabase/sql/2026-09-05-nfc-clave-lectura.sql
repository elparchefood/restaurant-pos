/*  QUIEN PUEDE LEER LA CLAVE DE LAS TARJETAS
    ──────────────────────────────────────────────────────────────────────
    La clave AES con la que firman las tarjetas vive en el Vault. El
    esquema `vault` NO está expuesto por la API, así que hace falta una
    función que la saque — y esa función es la puerta.

    Por eso es `SECURITY DEFINER` con el EXECUTE quitado a todo el mundo
    menos al rol de servicio: la única que la puede llamar es la función
    `tarjeta`, que corre en el servidor. Si `authenticated` pudiera
    llamarla, cualquier cliente con sesión se llevaría la clave con la que
    se firman TODAS las tarjetas del restaurante — y con ella podría
    fabricar toques válidos.                                              */

create or replace function public.fn_nfc_clave(p_tenant uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v text;
begin
  select decrypted_secret into v
    from vault.decrypted_secrets
   where name = 'nfc_clave_' || p_tenant::text
   limit 1;
  return v;
end;
$fn$;

revoke all on function public.fn_nfc_clave(uuid) from public;
revoke all on function public.fn_nfc_clave(uuid) from anon;
revoke all on function public.fn_nfc_clave(uuid) from authenticated;
grant execute on function public.fn_nfc_clave(uuid) to service_role;

do $guarda$
declare n int;
begin
  select count(*) into n
    from information_schema.role_routine_grants
   where routine_schema = 'public' and routine_name = 'fn_nfc_clave'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n > 0 then
    raise exception 'la clave de las tarjetas quedo legible por % roles de fuera', n;
  end if;
end
$guarda$;
