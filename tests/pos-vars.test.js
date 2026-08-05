/* Pruebas del motor de variables. Se corren a mano:  node tests/pos-vars.test.js
   No hay framework en este repo a proposito — el sistema es HTML/JS puro y no
   quiero meterle un arbol de dependencias por un archivo de pruebas. */
require('../pos-vars.js');
const V = globalThis.posVars;
let ok=0, mal=0;
const es=(n,a,b)=>{ const A=JSON.stringify(a), B=JSON.stringify(b);
  if(A===B){ok++;} else {mal++; console.log('FALLA  '+n+'\n   esperaba '+B+'\n   dio      '+A);} };

// ── formatos ──
es('dinero', V.resolver('Total {total}',{total:45000}).texto, 'Total $45.000');
es('entero', V.resolver('{puntos} pts',{puntos:45}).texto, '45 pts');
es('miles cortos', V.miles(999), '999');
es('negativo', V.miles(-1500), '-1.500');

// ── calculos ──
es('precedencia', V.calcular('2 + 3 * 4',{}), 14);
es('parentesis', V.calcular('(2 + 3) * 4',{}), 20);
es('vars', V.calcular('(puntos_necesarios - puntos) * 1000',{puntos_necesarios:60,puntos:45}), 15000);
es('unario', V.calcular('-5 + 10',{}), 5);
es('calculo en plantilla',
   V.resolver('= un pedido de {= (puntos_necesarios - puntos) * 1000 | dinero}',
              {}).texto === '= un pedido de ' ? 'sin datos->vacio' : 'MAL', 'sin datos->vacio');

// ── seguridad: el texto lo escribe el dueño ──
const peligro = [ 'process.exit(1)', 'a["b"]', '1;alert(1)', 'constructor', '__proto__+1', '1**2' ];
peligro.forEach(p=>{ let tiro=false; try{ V.calcular(p,{}); }catch(e){ tiro=true; }
  if(!tiro){ mal++; console.log('FALLA  no rechazo: '+p); } else ok++; });
es('division por cero', (()=>{ try{ V.calcular('10/0',{}); return 'NO TIRO'; }catch(e){ return 'tiro'; } })(), 'tiro');
es('calculo roto no rompe el mensaje',
   V.resolver('Hola {= 10/0 } fin',{}).texto, 'Hola  fin');

// ── faltantes ──
const r1 = V.resolver('Hola {nombre}, tienes {puntos}',{nombre:'Ana'});
es('variable sin dato -> vacia', r1.texto, 'Hola Ana, tienes ');
es('variable sin dato -> avisada', r1.faltantes, ['puntos']);
es('variable inventada se deja ver', V.resolver('{no_existe}',{}).texto, '{no_existe}');

// ── listas ──
const P = '{#lista:alcanza}\u2705 Ya puedes pedir:\n{#fila}\u00b7 {producto} \u2014 {puntos_necesarios} pts{/fila}\n{/lista}'
        + '{#lista:falta}\ud83d\udd1c Te falta poco:\n{#fila}\u00b7 {producto} \u2014 te faltan {faltan} (un pedido de {= faltan * 1000 | dinero}){/fila}\n{/lista}';
const datos = { puntos:45, listas:{
  alcanza:[{producto:'Gaseosa',puntos_necesarios:30},{producto:'Papas',puntos_necesarios:40}],
  falta:[{producto:'Hamburguesa',puntos_necesarios:60,faltan:15}] }};
es('lista completa', V.resolver(P,datos).texto,
  '\u2705 Ya puedes pedir:\n\u00b7 Gaseosa \u2014 30 pts\n\u00b7 Papas \u2014 40 pts\n'
+ '\ud83d\udd1c Te falta poco:\n\u00b7 Hamburguesa \u2014 te faltan 15 (un pedido de $15.000)\n');
es('lista vacia se lleva su titulo',
   V.resolver(P,{puntos:0,listas:{alcanza:[],falta:[]}}).texto, '');
es('solo una vacia',
   V.resolver(P,{puntos:200,listas:{alcanza:[{producto:'Gaseosa',puntos_necesarios:30}],falta:[]}}).texto,
   '\u2705 Ya puedes pedir:\n\u00b7 Gaseosa \u2014 30 pts\n');
es('encabezado con espacios queda entero',
   V.resolver('{#lista:alcanza}Mira lo que puedes pedir hoy:\n{#fila}- {producto}{/fila}\n{/lista}',
     {listas:{alcanza:[{producto:'Gaseosa'}]}}).texto,
   'Mira lo que puedes pedir hoy:\n- Gaseosa\n');

// ── buscar por significado ──
const b1 = V.buscar('saldo','cliente');
es('buscar "saldo" encuentra Puntos', b1.length && b1[0].def.clave, 'puntos');
const b2 = V.buscar('total','cliente');
es('sin pedido -> atenuada', b2.filter(x=>x.def.clave==='total')[0].aplica, false);
es('sin pedido -> con motivo', b2.filter(x=>x.def.clave==='total')[0].motivo, 'aquí todavía no hay pedido');
es('con pedido -> aplica', V.buscar('total','pedido').filter(x=>x.def.clave==='total')[0].aplica, true);
es('mas usadas arriba',
   V.buscar('','pedido',{horario_hoy:99})[0].def.clave, 'horario_hoy');

// ── usadas ──
es('usadas incluye las del calculo',
   V.usadas('{nombre} {= (puntos_necesarios - puntos)*2 } {producto}').sort(),
   ['nombre','producto','puntos','puntos_necesarios']);

// -- nada heredado se cuela al mensaje del cliente --
es('constructor no se resuelve', V.resolver('Hola {constructor} y {toString}',{}).texto,
   'Hola {constructor} y {toString}');
es('__proto__ tampoco', V.resolver('{__proto__}',{}).texto, '{__proto__}');
es('ni en un calculo',
   (()=>{ try{ V.calcular('constructor+1',{}); return 'NO TIRO'; }catch(e){ return 'tiro'; } })(), 'tiro');

console.log('\n'+ok+' bien, '+mal+' mal');
process.exit(mal?1:0);
