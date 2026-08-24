-- ═══════════════════════════════════════════════════════════════════════════
--  NADIE PODÍA REGISTRARSE  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio pidió probar el flujo de registro de punta a punta. No funciona.
--
--  `register.js` hace tres cosas, EN ESTE ORDEN:
--     1. sube el comprobante de pago a Storage
--     2. inserta la solicitud en `pos_registrations`
--     3. muestra la confirmación
--
--  El paso 2 funciona (comprobado con la clave pública: 201). **El paso 1 no.**
--  Y como es el primero, revienta antes de llegar al segundo: el dueño llena
--  todo, le da a enviar, y recibe "Error al enviar la solicitud".
--
--  La causa: el bucket `comprobantes` NO TIENE NINGUNA POLÍTICA. Ni una. Están
--  las de `chat-media` y las de `marca`, y esa es toda la lista. Sin política
--  de INSERT, Storage responde "new row violates row-level security policy" a
--  cualquiera — incluso a un usuario con sesión.
--
--  Se confirmó por el otro lado: de las tres solicitudes que existen en la
--  base, **las tres tienen `comprobante_url` vacío**. O sea que ninguna se
--  creó por esta pantalla. Nunca ha entrado un registro real con su
--  comprobante.
--
--  ⚠️ Esto se probó llamando por HTTP con la CLAVE PÚBLICA, la que usa el
--  navegador. Desde la consola de la base todo funciona siempre: corre como
--  superusuario y se salta las políticas. Es la misma lección del 15-ago y del
--  incidente de `fn_cliente_por_tel` de esta misma mañana.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Que se pueda subir el comprobante ───────────────────────────────────
--  `anon` y no solo `authenticated`: quien se registra TODAVÍA NO TIENE CUENTA.
--  Ese es el punto del registro. Pedirle sesión sería pedirle que ya sea
--  cliente para poder volverse cliente.
--
--  Lo que evita que esto sea una puerta abierta a llenar el disco no es una
--  política, son los límites que el bucket YA tiene puestos: 5 MB por archivo
--  y solo PNG, JPG o PDF. Un intento de subir otra cosa lo rechaza Storage
--  antes de mirar esta política.
drop policy if exists "comprobantes: cualquiera sube el suyo" on storage.objects;
create policy "comprobantes: cualquiera sube el suyo"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'comprobantes');

-- ── 2) Leerlos, SOLO el administrador de la plataforma ─────────────────────
--  Un comprobante de pago lleva datos bancarios de quien se registra. Hasta
--  hoy el bucket era PÚBLICO: cualquiera con la dirección podía abrirlo, y la
--  dirección se armaba con la fecha y el CORREO de la persona, o sea que
--  además el correo viajaba en la URL.
--
--  Se cierra (paso 3) y se deja leer solo a quien aprueba las solicitudes,
--  usando la misma comprobación que ya usa la consola: `es_admin_plataforma()`.
--  No `is_authorized_admin`, que significa otra cosa —"es el administrador de
--  SU restaurante"— y se lo lleva cada cliente aprobado. Esa confusión ya
--  costó un fallo el 23-ago.
drop policy if exists "comprobantes: los ve el admin de la plataforma" on storage.objects;
create policy "comprobantes: los ve el admin de la plataforma"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'comprobantes' and public.es_admin_plataforma() = true);

-- ── 3) El bucket deja de ser público ───────────────────────────────────────
--  Con esto `getPublicUrl` deja de servir, a propósito. La consola de
--  solicitudes pasa a pedir una dirección firmada, que caduca.
update storage.buckets set public = false where name = 'comprobantes';

--  Los límites ya estaban bien puestos; se dejan escritos para que se vea que
--  se comprobaron y no se toquen por descuido.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','application/pdf']
 where name = 'comprobantes';
