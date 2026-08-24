/* Banco de pruebas de posDatos.carta(), con la carta REAL de El Parche.
   La pregunta que responde: ¿la carta que sale de lo guardado en el equipo es
   la MISMA que devolvia la base a cada una de las tres pantallas de venta?
   Si el orden cambia, a Sergio se le mueven las categorias de sitio. */
const fs = require('fs');
const D = JSON.parse(fs.readFileSync('carta-real.json', 'utf8'));

global.window = {}; global.document = { addEventListener(){}, readyState:'complete' };
global.setTimeout = setTimeout;
eval(fs.readFileSync('C:/Users/USUARIO/AppData/Local/Temp/restaurant-pos/pos-datos.js','utf8'));
const posDatos = global.window.posDatos;

// Se le mete en la memoria lo que habria traido al abrir el programa.
// `productos` llega de la base ya pedido por nombre: eso se respeta.
/* Se recorta el producto a las columnas que posDatos pide de verdad (COLS_PROD).
   Comparar filas completas no probaria nada: el riesgo justamente es que ese
   recorte deje fuera una columna que la pantalla usa, porque dos de las tres
   piden select('*'). */
const COLS = fs.readFileSync('C:/Users/USUARIO/AppData/Local/Temp/restaurant-pos/pos-datos.js','utf8')
  .match(/var COLS_PROD =([\s\S]*?);/)[1].match(/'([^']+)'/g).join('').replace(/'/g,'').split(',');
const recorte = p => Object.fromEntries(COLS.map(k => [k, p[k]]));
const mem = { productos: D.prods.map(recorte), categorias: D.cats, adiciones: [], tenant:'t', sucursal:'b' };
// (posDatos guarda `memoria` adentro; se le entra por la puerta de siempre)
global.window.posCache = { leer: () => ({ datos: mem }), guardar(){}, borrar(){} };
global.posCache = global.window.posCache;
global.window._pos = { state: { tenantId:'t', branchId:'b' } };

(async () => {
  await posDatos.cargar();
  const casos = [
    ['Tomar pedido ', posDatos.carta({ orden:'sort' }),                 D.tp_cats],
    ['Domicilios   ', posDatos.carta({ orden:'nombre' }),               D.do_cats],
    ['Venta rapida ', posDatos.carta({ orden:'sort', activas:true }),   D.vr_cats],
  ];
  let todoBien = true;
  for (const [nombre, c, esperado] of casos) {
    const mio = c.categorias.map(x => x.name);
    const ok = JSON.stringify(mio) === JSON.stringify(esperado);
    todoBien = todoBien && ok;
    console.log(nombre, 'categorias ->', ok ? 'IGUAL' : 'DISTINTO');
    if (!ok) { console.log('   base:', esperado); console.log('   equipo:', mio); }
  }
  const prods = posDatos.carta({orden:'sort'}).productos.map(p => p.name);
  const okP = JSON.stringify(prods) === JSON.stringify(D.prods_disp);
  todoBien = todoBien && okP;
  console.log('Productos disponibles ->', okP ? 'IGUAL' : 'DISTINTO',
              '(' + prods.length + ' de ' + D.prods.length + ')');

  // Que no falte ninguna columna: las pantallas piden select('*')
  /* Que no se pierda ninguna columna que la pantalla pueda leer. Se admiten
     created_at y updated_at: se comprobo que ninguna pantalla de venta las
     lee de un producto (solo de pedidos). */
  const permitidas = ['created_at','updated_at'];
  const guardado = posDatos.carta({orden:'sort'}).productos[0];
  const faltan = Object.keys(D.prods[0]).filter(k => !(k in guardado) && !permitidas.includes(k));
  console.log('Columnas que se pierden ->', faltan.length ? faltan.join(', ') : 'ninguna');
  todoBien = todoBien && !faltan.length;
  console.log('');
  console.log(todoBien ? '>>> La carta guardada es identica a la de la base.' : '>>> HAY DIFERENCIAS — NO SUBIR');
  process.exit(todoBien ? 0 : 1);
})();
