/*  ¿PACO SIRVE PARA CUALQUIER RESTAURANTE, O TIENE COSAS DE EL PARCHE METIDAS?

    No se juzga a ojo: se sacan de la BASE los nombres reales de la carta de El
    Parche, sus categorias, sus barrios y sus insumos, y se buscan en el
    codigo.

    Y se separa donde aparece, porque no es lo mismo:
      · COMENTARIO  -> documentacion. El caso real que motivo un arreglo es
                       util para quien lea el codigo. No es un problema.
      · PROMPT      -> viaja al modelo de OTRO restaurante. Es un problema.
      · CODIGO      -> una decision tomada con datos de El Parche. Es el peor.
*/
const fs = require('fs');
const SP = 'C:/Users/USUARIO/AppData/Local/Temp/claude/C--Prueba-Claude-Code/ee17ab88-e9a2-4726-b5f2-2ce8a49c2962/scratchpad/paco/';
const F = 'C:/Users/USUARIO/AppData/Local/Temp/restaurant-pos/supabase/functions/delay-reply/index.ts';
const src = fs.readFileSync(F, 'utf8');
const lineas = src.split('\n');

// ── que zonas del archivo son comentario ──────────────────────────────────
const esComentario = new Array(lineas.length).fill(false);
{
  let dentro = false;
  lineas.forEach((l, i) => {
    const t = l.trim();
    if (dentro) { esComentario[i] = true; if (l.includes('*/')) dentro = false; return; }
    if (t.startsWith('//')) { esComentario[i] = true; return; }
    if (t.startsWith('/*')) { esComentario[i] = true; if (!l.includes('*/')) dentro = true; return; }
    // comentario al final de una linea de codigo: no cuenta como zona
  });
}

// ── datos reales de El Parche ─────────────────────────────────────────────
const datos = JSON.parse(fs.readFileSync(SP + 'huella.json', 'utf8'));
const terminos = [];
const add = (txt, tipo) => {
  const t = String(txt || '').trim();
  //  Se ignoran las palabras cortas o genericas: "Papa", "Queso", "Carne",
  //  "Mixta" salen en cualquier carta del pais y darian falsos positivos.
  if (t.length < 6) return;
  const GENERICO = /^(personal|familiar|bebidas|adiciones|combos?|salsas?|papas?|queso|carne|pollo|mixta|especial|sencilla|tomate|jamon|jamón)$/i;
  if (GENERICO.test(t)) return;
  terminos.push({ t, tipo, re: new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') });
};
for (const p of datos.productos) add(p.name, 'plato');
for (const c of datos.categorias) add(c.name, 'categoria');
for (const b of datos.barrios) add(b, 'barrio');
for (const i of datos.insumos) add(i.nombre, 'insumo');
add('El Parche', 'marca'); add('elparche', 'marca'); add('cobrapos', 'marca');

// ── buscar ────────────────────────────────────────────────────────────────
const hallazgos = { comentario: [], prompt: [], codigo: [] };
lineas.forEach((l, i) => {
  for (const { t, tipo, re } of terminos) {
    if (!re.test(l)) continue;
    let donde;
    if (esComentario[i]) donde = 'comentario';
    else if (/^\s*"-\s|texto:|guia:|`|prompt/.test(l)) donde = 'prompt';
    else donde = 'codigo';
    hallazgos[donde].push({ n: i + 1, t, tipo, txt: l.trim().slice(0, 110) });
    break;
  }
});

console.log('BUSCADOS: %d nombres reales de El Parche (platos, categorias, barrios, insumos)\n', terminos.length);
console.log('  en COMENTARIOS : %d   (documentacion, no es problema)', hallazgos.comentario.length);
console.log('  en PROMPTS     : %d   (viaja al modelo de otro restaurante)', hallazgos.prompt.length);
console.log('  en CODIGO      : %d   (decisiones con datos de El Parche)', hallazgos.codigo.length);

for (const zona of ['prompt', 'codigo']) {
  if (!hallazgos[zona].length) continue;
  console.log('\n───── %s ─────', zona.toUpperCase());
  for (const h of hallazgos[zona].slice(0, 30))
    console.log('  L%-6s [%s: %s]  %s', h.n, h.tipo, h.t, h.txt);
  if (hallazgos[zona].length > 30) console.log('  … y %d mas', hallazgos[zona].length - 30);
}

// ── y lo que NUNCA puede estar: ids, telefonos, precios ───────────────────
console.log('\n───── identificadores metidos a mano ─────');
const patrones = [
  ['UUID', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['telefono colombiano', /\b57\d{10}\b/],
  ['precio en pesos', /\$\s?\d{1,3}\.\d{3}\b/],
];
for (const [nombre, re] of patrones) {
  const hits = [];
  lineas.forEach((l, i) => { if (re.test(l) && !esComentario[i]) hits.push(i + 1); });
  console.log('  %-22s %s', nombre, hits.length ? hits.length + ' fuera de comentarios: lineas ' + hits.slice(0, 6).join(', ') : 'ninguno');
}
