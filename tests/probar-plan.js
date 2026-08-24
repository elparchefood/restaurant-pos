// Banco de pruebas de pos-plan.js: se le finge un navegador y una base para
// comprobar tres cosas sin abrir el programa:
//   1. que el Starter NO puede usar puntos
//   2. que lo guardado en el equipo se usa desde el primer instante
//   3. que aun asi se sale a confirmar contra la base (el bug que casi meto)
const fs = require('fs');
let guardado = { plan: 'starter', nombrePlan: 'Starter', funciones: [] };
let consultas = 0;

global.window = {
  posCache: {
    leer: (k) => (k === 'plan' ? { datos: JSON.parse(JSON.stringify(guardado)) } : null),
    guardar: () => {}, borrar: () => {},
  },
  _pos: { state: { user: { id: 'u1', user_metadata: { tenant_id: 't1' } } },
          sb: { from: (tabla) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
              consultas++;
              return tabla === 'tenants'
                ? { data: { plan: 'starter' } }
                : { data: { nombre: 'Starter', funciones: [] } };
            } }) }) }) },
          on: (ev, fn) => { if (ev === 'core:ready') setTimeout(fn, 5); } },
};
global.document = {
  querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {},
  readyState: 'complete', createElement: () => ({ style: {}, querySelector: () => null }),
  body: { appendChild: () => {} },
};
global.location = { pathname: '/pagos.html', href: '' };
global.setTimeout = setTimeout;

// En el navegador `window.posCache` y `posCache` son lo mismo; en node hay que
// decirlo a mano, si no delEquipo() revienta y parece que el cache no sirve.
global.posCache = global.window.posCache;
eval(fs.readFileSync('C:/Users/USUARIO/AppData/Local/Temp/restaurant-pos/pos-plan.js', 'utf8'));
const P = global.window.posPlan;

console.log('AL INSTANTE (sin esperar nada):');
console.log('  puede puntos     ->', P.puede('puntos'), '  (debe ser false)');
console.log('  puede inventario ->', P.puede('inventario'), '  (debe ser false)');

setTimeout(() => {
  console.log('DESPUES DE CONFIRMAR:');
  console.log('  consultas a la base ->', consultas, ' (debe ser > 0: se confirmo)');
  console.log('  fresco              ->', P.ctx().fresco, ' (debe ser true)');
  console.log('  puede puntos        ->', P.puede('puntos'), ' (debe seguir false)');
}, 300);
