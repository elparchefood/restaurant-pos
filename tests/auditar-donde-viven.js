/*  ¿EN QUE PROMPT vive cada mencion a la carta de El Parche?

    Importa para decidir el orden del trabajo: si la mayoria estan en el prompt
    que el lector nuevo reemplazaria entero, limpiarlos ahora seria tirar el
    trabajo.                                                                 */
const fs = require('fs');
const SP = 'C:/Users/USUARIO/AppData/Local/Temp/claude/C--Prueba-Claude-Code/ee17ab88-e9a2-4726-b5f2-2ce8a49c2962/scratchpad/paco/';
const F = 'C:/Users/USUARIO/AppData/Local/Temp/restaurant-pos/supabase/functions/delay-reply/index.ts';
const src = fs.readFileSync(F, 'utf8');
const lineas = src.split('\n');

// ── en que funcion cae cada linea ─────────────────────────────────────────
const funcs = [];
lineas.forEach((l, i) => {
  const m = l.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  if (m) funcs.push({ n: i, nombre: m[1] });
});
const funcDe = (i) => {
  let ult = '(fuera de funcion)';
  for (const f of funcs) { if (f.n <= i) ult = f.nombre; else break; }
  return ult;
};

// ── zonas de comentario ───────────────────────────────────────────────────
const esComentario = new Array(lineas.length).fill(false);
{
  let dentro = false;
  lineas.forEach((l, i) => {
    const t = l.trim();
    if (dentro) { esComentario[i] = true; if (l.includes('*/')) dentro = false; return; }
    if (t.startsWith('//')) { esComentario[i] = true; return; }
    if (t.startsWith('/*')) { esComentario[i] = true; if (!l.includes('*/')) dentro = true; return; }
  });
}

const datos = JSON.parse(fs.readFileSync(SP + 'huella.json', 'utf8'));
const GENERICO = /^(personal|familiar|bebidas|adiciones|combos?|salsas?|papas?|queso|carne|pollo|mixta|especial|sencilla|tomate|jamon|jamón)$/i;
const terminos = [];
for (const lista of [datos.productos.map(p => p.name), datos.categorias.map(c => c.name), datos.insumos.map(i => i.nombre)])
  for (const t of lista) {
    const s = String(t || '').trim();
    if (s.length < 6 || GENERICO.test(s)) continue;
    terminos.push(new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
  }

const porFuncion = {};
lineas.forEach((l, i) => {
  if (esComentario[i]) return;
  if (!terminos.some(re => re.test(l))) return;
  const f = funcDe(i);
  porFuncion[f] = (porFuncion[f] || 0) + 1;
});

const orden = Object.entries(porFuncion).sort((a, b) => b[1] - a[1]);
const total = orden.reduce((s, x) => s + x[1], 0);
console.log('%d lineas con nombres de El Parche FUERA de comentarios\n', total);
console.log('  ' + 'en que funcion'.padEnd(34) + 'lineas');
console.log('-'.repeat(46));
for (const [f, n] of orden) console.log('  ' + f.padEnd(34) + n);

//  ¿Cuantas viven en el lector de pedidos, que el nuevo reemplazaria?
const delLector = (porFuncion['leerPedido'] || 0) + (porFuncion['clasificarIntenciones'] || 0);
console.log('\nEn `leerPedido` + el clasificador: %d de %d  (%d%%)',
  delLector, total, Math.round(delLector * 100 / total));
