/*  EL CANDADO CONTRA REPETIR UN CÓDIGO
    ──────────────────────────────────────────────────────────────────────
    La tarjeta firma cada toque con una firma distinta, así que copiar una
    no sirve. Pero hay un ataque que la firma sola NO tapa: **repetir**.

    Si alguien ve una dirección completa —una foto de la pantalla, un
    historial del navegador, un mensaje reenviado— esa dirección lleva una
    firma que ES válida. Puede volver a usarla cuantas veces quiera.

    Lo que lo impide es el contador: la tarjeta lo sube sola en cada toque
    y nunca lo baja. Si llega un contador que ya se vio, es una repetición
    y se rechaza.

    Por eso se guarda el último de cada tarjeta. Sin esta columna, la
    verificación de la firma da una falsa sensación de seguridad.          */

alter table public.pos_tarjetas
  add column if not exists ultimo_ctr integer not null default 0,
  add column if not exists ultimo_uso timestamptz;

comment on column public.pos_tarjetas.ultimo_ctr is
  'El contador mas alto que ha mandado esta tarjeta. Un toque con un contador igual o menor es una repeticion y se rechaza.';

do $guarda$
begin
  if not exists (
      select 1 from information_schema.columns
       where table_name = 'pos_tarjetas' and column_name = 'ultimo_ctr') then
    raise exception 'no quedo la columna del contador';
  end if;
end
$guarda$;
