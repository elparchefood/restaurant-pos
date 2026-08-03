-- Los planes, como quedaron decididos con Sergio el 2026-08-02.
--
-- Se agrega `funciones`: la lista de lo que incluye cada plan. Se usa una LISTA
-- y no una columna por funcion a proposito — Sergio va a seguir agregando
-- funciones, y asi cada una nueva es un renglon en el arreglo, no una migracion.
alter table public.pos_planes add column if not exists funciones text[] default '{}';

-- STARTER — el POS completo, sin los modulos que se venden aparte.
update public.pos_planes set
  max_marcas = 1, max_sucursales = 1, max_usuarios = 5,
  mensajes_ia = 0, dian_incluidos = 0,
  chat_ia = false, puntos = false, admin_whatsapp = false,
  funciones = '{}'
where plan = 'starter';

-- PRO — inventario (subio de Starter), chat, puntos (bajaron de Premium).
update public.pos_planes set
  max_marcas = 2, max_sucursales = null, max_usuarios = 15,
  mensajes_ia = 5000, dian_incluidos = 1000,
  chat_ia = true, puntos = true, admin_whatsapp = false,
  funciones = array[
    'inventario',           -- insumos, recetas, disponibilidad, costeo, bodega
    'chat_ia',              -- atencion automatizada por WhatsApp
    'comprobantes_ia',      -- leer el comprobante que manda el cliente
    'avisos_estado',        -- avisarle al cliente cuando cambia el estado
    'puntos',               -- fidelizacion y catalogo de canje
    'multimarca',           -- varias marcas y sucursales
    'informes_avanzados',   -- mas vendidos, horas pico, meseros, rentabilidad
    'dian'                  -- facturacion electronica (por construir)
  ]
where plan = 'pro';

-- PREMIUM — todo lo de Pro + lo que se gana por escala.
update public.pos_planes set
  max_marcas = null, max_sucursales = null, max_usuarios = null,
  mensajes_ia = 20000, dian_incluidos = 3000,
  chat_ia = true, puntos = true, admin_whatsapp = true,
  funciones = array[
    'inventario','chat_ia','comprobantes_ia','avisos_estado','puntos',
    'multimarca','informes_avanzados','dian',
    'admin_whatsapp',       -- manejar inventario y reportes por WhatsApp
    'nfc',                  -- tarjeta fisica y recargas (por construir)
    'consolidado',          -- todas las sucursales en un informe (por construir)
    'kardex',               -- kardex valorado (por construir)
    'marketing'             -- anuncios de Meta (por construir)
  ]
where plan = 'premium';
