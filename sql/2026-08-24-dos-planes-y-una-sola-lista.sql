-- ═══════════════════════════════════════════════════════════════════════════
--  DOS PLANES, Y UNA SOLA LISTA PARA TODOS LOS SITIOS  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio pidió revisar qué incluye cada plan antes de aprobarlo. Al ir a
--  mirarlo, los precios NO COINCIDÍAN entre sitios:
--
--      Starter:  la base decía $149.000  ·  la pantalla de registro $99.000
--      Premium:  existía en la base con 13 funciones y NO SE PODÍA COMPRAR
--      Mensajes: la pantalla prometía 2.000  ·  la base dice 5.000
--
--  La causa no son los números: es que el mismo dato está escrito en CUATRO
--  sitios (`pos_planes`, `register.html`, `admin-reg.js` y el correo de
--  bienvenida). Cuatro copias de un dato se desincronizan solas; es cuestión de
--  tiempo. Aquí se deja UNA sola fuente y las pantallas la leen.
--
--  ── LO QUE DECIDIÓ SERGIO ───────────────────────────────────────────────
--  · Starter $149.000 y Pro $249.000. **Premium ya no se vende**: se decidió
--    dejar dos planes.
--  · El descuento del 30% empieza en **8 sucursales**, no en 10 (ver abajo).
--
--  ⚠️ PREMIUM NO SE BORRA, SE SACA DE LA VENTA. El Parche Food está en ese
--  plan: borrar la fila le quitaría a Sergio sus propias funciones. Se marca
--  como no vendible y las pantallas dejan de ofrecerlo. Ese es también el
--  sitio donde vive la tarjeta NFC, que —reclamado tres veces— **no es de
--  Cobra**: es exclusiva de El Parche. Sacando Premium de la venta, la NFC
--  deja de aparecer en cualquier lista que vea un cliente.
--
--  ── EL CRUCE DEL DESCUENTO ──────────────────────────────────────────────
--  Con los escalones viejos, NUEVE sucursales costaban MÁS que diez:
--      Pro con  9 sedes → $1.792.800
--      Pro con 10 sedes → $1.743.000   ← $49.800 menos por tener una más
--  Al cliente le convenía declarar una sucursal que no tiene. Pasaba porque el
--  salto de 20% a 30% al llegar a 10 pesaba más que la sucursal extra.
--  Bajando el escalón a 8, el cruce desaparece y **ningún precio publicado
--  sube**: solo baja lo que pagan quienes tienen 8 o 9.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Qué se puede comprar ────────────────────────────────────────────────
alter table public.pos_planes add column if not exists a_la_venta boolean not null default true;

comment on column public.pos_planes.a_la_venta is
  'Si un restaurante nuevo puede comprarlo. Premium esta en false: no se vende, pero la fila sigue viva porque El Parche Food esta en ese plan y borrarla le quitaria sus funciones.';

update public.pos_planes set a_la_venta = (plan <> 'premium');

-- ── 2) La lista que ve el cliente, en su idioma ────────────────────────────
--  `funciones` son las llaves internas con las que el sistema decide qué
--  bloquear. Esto es otra cosa: lo que se le MUESTRA a quien está comprando.
--  Van separadas a propósito — "informes_avanzados" no le dice nada a nadie.
alter table public.pos_planes add column if not exists beneficios text[];
alter table public.pos_planes add column if not exists resumen text;

comment on column public.pos_planes.beneficios is
  'Lo que se le muestra a quien compra, en su idioma. Distinto de `funciones`, que son las llaves internas del candado. UNA sola fuente: la pantalla de registro, la consola y el correo de bienvenida leen de aqui.';

update public.pos_planes
   set resumen = 'Todo el punto de venta: vender, cobrar e imprimir.',
       beneficios = array[
         'Ventas en salón, para llevar y domicilio',
         'Caja, arqueo y cierre de turno',
         'Mesas y zonas de tu salón',
         'Carta con precios, tamaños y adiciones',
         'Cárgala con una foto y la lee la IA',
         'Comandas de cocina e impresoras',
         'Clientes y reservas',
         'Usuarios, roles y PIN de administrador',
         'Informes de ventas y ticket promedio'
       ]
 where plan = 'starter';

update public.pos_planes
   set resumen = 'Todo lo de Starter, y el asistente que atiende por ti.',
       beneficios = array[
         'Un asistente contesta tu WhatsApp y toma pedidos solo',
         'También fuera de horario',
         'Lee los comprobantes de pago y verifica contra tu banco',
         'Le avisa al cliente cuando su pedido va en camino',
         'Inventario: insumos, recetas y cuánto cuesta cada plato',
         'Puntos y premios para tus clientes',
         'Varias marcas y todas las sucursales que quieras',
         'Informes de horas pico, meseros y rentabilidad',
         'Facturación electrónica DIAN',
         'Maneja el inventario escribiéndole por WhatsApp'
       ]
 where plan = 'pro';

--  Premium se deja descrito por si algún día vuelve, pero SIN la tarjeta NFC
--  en la lista: aunque no se venda, nadie debería leer que Cobra la ofrece.
update public.pos_planes
   set resumen = 'No se vende. Es el plan interno de El Parche Food.',
       beneficios = array[
         'Todo lo de Pro',
         'Informes consolidados de todas las sucursales',
         'Kardex valorado'
       ]
 where plan = 'premium';

-- ── 3) Los escalones de descuento, también en la base ──────────────────────
--  Estaban escritos SOLO en el código, y en dos archivos distintos
--  (`register.js` y `admin-reg.js`). Dos copias del mismo número es como
--  empezó todo este lío.
create table if not exists public.pos_planes_descuento (
  min_sucursales int primary key,
  descuento      numeric not null,
  etiqueta       text not null
);

alter table public.pos_planes_descuento enable row level security;
drop policy if exists "descuentos: los lee cualquiera" on public.pos_planes_descuento;
create policy "descuentos: los lee cualquiera"
  on public.pos_planes_descuento for select to anon, authenticated using (true);
revoke all on public.pos_planes_descuento from public, anon, authenticated;
grant select on public.pos_planes_descuento to anon, authenticated;
grant all on public.pos_planes_descuento to service_role;

delete from public.pos_planes_descuento;
insert into public.pos_planes_descuento (min_sucursales, descuento, etiqueta) values
  (8, 0.30, '8 o más sucursales'),
  (4, 0.20, '4 a 7 sucursales'),
  (2, 0.10, '2 a 3 sucursales'),
  (1, 0.00, '1 sucursal');

comment on table public.pos_planes_descuento is
  'El descuento por volumen. El 30% empieza en 8 y no en 10: con el escalon en 10, nueve sucursales costaban MAS que diez y al cliente le convenia declarar una que no tiene.';

-- ── 4) Que la lista de planes se pueda leer sin cuenta ─────────────────────
--  La pantalla de registro la muestra a quien todavia no tiene sesion.
alter table public.pos_planes enable row level security;
drop policy if exists "planes: los lee cualquiera" on public.pos_planes;
create policy "planes: los lee cualquiera"
  on public.pos_planes for select to anon, authenticated using (true);
grant select on public.pos_planes to anon, authenticated;
