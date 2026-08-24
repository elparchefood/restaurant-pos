/* Banco de pruebas de pos-stock.js, con los datos REALES de El Parche
   (44 insumos, 374 recetas, 44 existencias) sacados de la base.

   Comprueba dos cosas, que son las dos que importan:
     1. Que el camino NUEVO (con lo guardado) y el VIEJO (preguntandolo todo)
        marcan agotado EXACTAMENTE los mismos productos. Si no, un cajero
        vende algo que no hay.
     2. Cuantos viajes a internet hace cada uno. */
const fs = require('fs');
const D = JSON.parse(fs.readFileSync('reales.json', 'utf8'));
const MARCA = '80d707b9-939f-4117-82d8-6e8271f98e6b';
const SEDE  = '66e5f12d-fd16-455a-a6c0-9694aa6fb01b';
const REST  = D.insumos[0].tenant_id;

// ── Una base de mentiras que cuenta cuantas veces le preguntan ────────────
function hacerSb(registro) {
  function tabla(nombre) {
    const q = { _t: nombre, _f: {} };
    q.select = () => q;
    q.eq = (c, v) => { q._f[c] = v; return q; };
    q.maybeSingle = () => { registro.push(nombre); return Promise.resolve({ data: resolver(q) }); };
    q.then = (ok, err) => { registro.push(nombre); return Promise.resolve({ data: resolver(q) }).then(ok, err); };
    return q;
  }
  function resolver(q) {
    const f = q._f;
    if (q._t === 'branches') return { brand_id: MARCA };
    if (q._t === 'brands')   return { inventario_modo: 'global' };
    if (q._t === 'iv_insumos') return D.insumos.filter(x =>
      (!f.brand_id || x.brand_id === f.brand_id) && (!f.branch_id || x.branch_id === f.branch_id)
      && (!f.tenant_id || x.tenant_id === f.tenant_id));
    if (q._t === 'iv_recetas') return D.recetas.filter(x =>
      (!f.brand_id || x.brand_id === f.brand_id) && (!f.branch_id || x.branch_id === f.branch_id));
    if (q._t === 'iv_existencias') return D.existencias;
    return [];
  }
  return { from: tabla,
    auth: { getUser: async () => ({ data: { user: { user_metadata: { tenant_id: REST, branch_id: SEDE } } } }) } };
}

global.window = {}; global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild(){} } };
eval(fs.readFileSync('C:/Users/USUARIO/AppData/Local/Temp/restaurant-pos/pos-stock.js', 'utf8'));
const posStock = global.window.posStock;

async function correr(conGuardado) {
  const reg = [];
  global.window.posDatos = conGuardado ? {
    cargar: async () => ({ insumos: D.insumos, recetas: D.recetas,
                           negocio: { brandId: MARCA, inventarioModo: 'global' } }),
  } : null;
  // En el navegador `window.posDatos` y `posDatos` son lo mismo; en node no.
  global.posDatos = global.window.posDatos;
  await posStock.load(hacerSb(reg));
  const prods = [...new Set(D.recetas.filter(r => r.product_id).map(r => r.product_id))];
  const agotados = prods.filter(p => posStock.agotado(p)).sort();
  return { viajes: reg, agotados };
}

(async () => {
  const viejo = await correr(false);
  const nuevo = await correr(true);
  console.log('CAMINO VIEJO  ->', viejo.viajes.length, 'viajes:', viejo.viajes.join(', '));
  console.log('CAMINO NUEVO  ->', nuevo.viajes.length, 'viaje(s):', nuevo.viajes.join(', '));
  console.log('');
  console.log('productos revisados      :', new Set(D.recetas.filter(r=>r.product_id).map(r=>r.product_id)).size);
  console.log('agotados segun el VIEJO  :', viejo.agotados.length);
  console.log('agotados segun el NUEVO  :', nuevo.agotados.length);
  const igual = JSON.stringify(viejo.agotados) === JSON.stringify(nuevo.agotados);
  console.log('');
  console.log(igual ? '>>> IDENTICOS. El cajero ve exactamente lo mismo.'
                    : '>>> DISTINTOS — NO SUBIR');
  process.exit(igual ? 0 : 1);
})();
