-- ═══════════════════════════════════════════════════════════════════════════
--  EL CORREO DE COBRA POS — separado del del restaurante  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio: *"también debo poder conectar el correo con el que se van a
--  comprobar los comprobantes de pago. Porque como te digo es muy diferente al
--  del restaurante. Así que si yo quiero conecto el mismo, pero si yo quiero
--  conecto otro"*.
--
--  Mismo caso que la cuenta bancaria, y por la misma razón: hoy el sistema solo
--  sabe conectar el Gmail **de una sucursal** (`ia_config.gmail_refresh_token`,
--  y quien verifica un pago siempre busca por `branch_id`). Cobra POS no es una
--  sucursal de nadie.
--
--  ── POR QUÉ EN SU PROPIA TABLA Y NO EN `plataforma_cobro` ────────────────
--  Porque `plataforma_cobro` **la lee cualquiera**: la pantalla de registro
--  muestra la cuenta a quien todavía no tiene sesión. Meter ahí el permiso de
--  Google sería publicar la llave del correo de Sergio en internet. Un número
--  de cuenta es público por naturaleza; un token de acceso es lo contrario.
--
--  ── EL PERMISO NO SE PUEDE LEER DESDE NINGUNA PANTALLA ───────────────────
--  Ni siquiera Sergio. La consola necesita saber **qué correo está conectado**,
--  no el permiso — así que eso lo responde una función que devuelve el correo y
--  la fecha, y nada más. Es la misma idea del PIN de esta mañana: se responde
--  la pregunta sin entregar el secreto.
--
--  ── DOS PERMISOS, NO UNO ─────────────────────────────────────────────────
--  Hasta hoy se le pedía a Google solo `gmail.readonly`, porque el único uso
--  era leer los correos del banco. Aquí se pide también `gmail.send`, para que
--  el mismo correo pueda mandarle la bienvenida al restaurante que se registra.
--  Sergio preguntó cómo mandar ese correo: esta es la respuesta más barata —
--  ninguna cuenta nueva, ningún dominio que verificar, y ya se estaba
--  conectando de todos modos.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.plataforma_correo (
  id             smallint primary key default 1,
  gmail_email    text,
  gmail_refresh_token text,
  connected_at   timestamptz,
  updated_by     uuid,
  constraint plataforma_correo_una_sola check (id = 1)
);

insert into public.plataforma_correo (id) values (1) on conflict (id) do nothing;

--  CERRADA A TODO EL MUNDO, igual que la tabla de los PIN. Sin `grant`, ninguna
--  sesión de navegador la toca — ni para mirar. El permiso de Google solo lo
--  usan las funciones del servidor.
alter table public.plataforma_correo enable row level security;
revoke all on public.plataforma_correo from public, anon, authenticated;
grant all on public.plataforma_correo to service_role;

comment on table public.plataforma_correo is
  'El Gmail de COBRA POS: para comprobar los comprobantes de quien se registra y para mandarle la bienvenida. NO tiene relacion con ia_config.gmail_*, que es el correo de cada restaurante. Cerrada a las sesiones de navegador: el permiso de Google no puede bajar a ninguna pantalla.';

-- ── Qué correo está conectado (sin entregar el permiso) ────────────────────
create or replace function public.fn_correo_plataforma()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when public.es_admin_plataforma() = true
    then (select jsonb_build_object(
            'email', gmail_email,
            'conectado', (gmail_refresh_token is not null and gmail_refresh_token <> ''),
            'desde', connected_at)
          from plataforma_correo where id = 1)
    else jsonb_build_object('conectado', false)
  end
$function$;

revoke all on function public.fn_correo_plataforma() from public, anon;
grant execute on function public.fn_correo_plataforma() to authenticated;

-- ── Desconectarlo ──────────────────────────────────────────────────────────
--  Se borra el permiso de Google, no la fila: la fila es una y tiene que
--  existir siempre para que el resto no tenga que preguntarse si está.
create or replace function public.fn_correo_plataforma_desconectar()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.es_admin_plataforma() is distinct from true then return false; end if;
  update plataforma_correo
     set gmail_refresh_token = null, gmail_email = null,
         connected_at = null, updated_by = auth.uid()
   where id = 1;
  return true;
end;
$function$;

revoke all on function public.fn_correo_plataforma_desconectar() from public, anon;
grant execute on function public.fn_correo_plataforma_desconectar() to authenticated;
