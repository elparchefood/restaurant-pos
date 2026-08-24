-- ═══════════════════════════════════════════════════════════════════════════
--  EL QR PARA PAGAR COBRA POS  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio: *"también podemos poner un botón que diga QR, por si el cliente (el
--  que compra Cobra) quiere pagar escaneando, y esa imagen también la subo yo
--  en consola plataforma"*.
--
--  Copiar un número de cuenta a mano es donde la gente se equivoca: un dígito
--  de más y la plata se va a otro lado, o el banco dice "cuenta no encontrada"
--  y el cliente abandona el registro. Escanear no tiene ese error posible.
--
--  ── DÓNDE VIVE LA IMAGEN ─────────────────────────────────────────────────
--  En su propio depósito, `plataforma`. No en `marca`, que es el de los logos
--  de cada restaurante y cuyas reglas exigen que la carpeta se llame como el
--  restaurante: el QR de Cobra no es de ningún restaurante. Y no en
--  `comprobantes`, que acaba de cerrarse porque lleva datos bancarios de quien
--  se registra — este es justo al revés, tiene que verlo todo el mundo.
--
--  LEER: cualquiera, incluso sin cuenta. Es lo que se le muestra a quien
--  todavía se está registrando; si no pudiera verlo, el botón no serviría.
--  ESCRIBIR: solo el administrador de la plataforma.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Dónde se guarda el QR ───────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plataforma', 'plataforma', true, 2097152,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png','image/jpeg','image/webp'];

--  Dos megas y solo imágenes. El límite no es tacañería: un QR es una imagen
--  pequeña, y sin tope alguien podría subir un archivo enorme que la pantalla
--  de registro tendría que bajar entero antes de mostrar nada.

drop policy if exists "plataforma: la ve cualquiera" on storage.objects;
create policy "plataforma: la ve cualquiera"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'plataforma');

drop policy if exists "plataforma: solo la sube el admin" on storage.objects;
create policy "plataforma: solo la sube el admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'plataforma' and public.es_admin_plataforma() = true);

--  UPDATE y DELETE aparte: sin ellos, cambiar el QR fallaría en silencio
--  la segunda vez (el archivo ya existe y no se puede reemplazar), y ese es el
--  tipo de fallo que nadie relaciona con la causa.
drop policy if exists "plataforma: solo la cambia el admin" on storage.objects;
create policy "plataforma: solo la cambia el admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'plataforma' and public.es_admin_plataforma() = true)
  with check (bucket_id = 'plataforma' and public.es_admin_plataforma() = true);

drop policy if exists "plataforma: solo la borra el admin" on storage.objects;
create policy "plataforma: solo la borra el admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'plataforma' and public.es_admin_plataforma() = true);

-- ── 2) La dirección del QR, junto al resto de la cuenta ────────────────────
alter table public.plataforma_cobro add column if not exists qr_url text;

comment on column public.plataforma_cobro.qr_url is
  'La imagen del QR para pagar Cobra POS. Vacia = la pantalla de registro no muestra el boton, en vez de mostrar uno que abre un recuadro en blanco.';
