/* Cada pantalla pide elementos por id. Si el HTML deja de tener uno, el JS
   revienta AL ARRANCAR y se lleva por delante todo lo que venía después.

   Paso de verdad el 5-ago-2026: al cambiar las pestañas Menú y Búsqueda por
   Combos y Puntos quedó `renderMenuTab()` pintando en un panel borrado. Reventó
   en el arranque, los botones de pestaña se enganchan más abajo, y quedaron
   muertos TODOS — hasta Favoritos, que ni se tocó. Desde fuera parecía que las
   pestañas nuevas estaban mal.

   Se corre a mano:  node tests/ids.test.js
   Los ids que ya faltaban desde antes van en CONOCIDOS: la prueba avisa de los
   NUEVOS, que son los que uno acaba de romper. */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

const PANTALLAS = [
  ['tomar-pedido.html', 'tomar-pedido.js'],
  ['venta-rapida.html', 'venta-rapida.js'],
  ['domicilios.html',   'domicilios.js'],
  ['caja.html',         'caja.js'],
  ['pagos.html',        'pagos.js'],
  ['chat-ia.html',      'chat-ia.js'],
  ['tutoriales.html',   'tutoriales.js'],
];

/* Faltaban desde antes de que existiera esta prueba. No son de hoy y no rompen
   nada porque el resultado se guarda en una variable que nadie usa sin mirar.
   Si alguno se arregla, quítalo de aquí. */
const CONOCIDOS = {
  'venta-rapida.js': ['vr-meta-cliente'],
  'domicilios.js':   ['cart-count-lbl', 'monitor-badge'],
  // Este si esta protegido con un if: no revienta, solo no pinta nada.
  'chat-ia.js':      ['totalUnread'],
};

const leer = (f) => {
  try { return fs.readFileSync(path.join(raiz, f), 'utf8'); } catch (e) { return null; }
};

let malos = 0;
for (const [html, js] of PANTALLAS) {
  const h = leer(html), j = leer(js);
  if (!h || !j) { console.log(`(salto ${html}: no existe)`); continue; }

  const hay = new Set();
  for (const m of h.matchAll(/id="([^"]+)"/g)) hay.add(m[1]);
  // Los que el propio JS crea al vuelo también cuentan.
  for (const m of j.matchAll(/id\s*=\s*["'`]([a-zA-Z0-9_-]+)["'`]/g)) hay.add(m[1]);

  const pide = new Set();
  for (const m of j.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)) pide.add(m[1]);
  for (const m of j.matchAll(/getElementById\('([a-zA-Z0-9_-]+)'\)/g)) pide.add(m[1]);

  const conocidos = new Set(CONOCIDOS[js] || []);
  const faltan = [...pide].filter((id) => !hay.has(id) && !conocidos.has(id)).sort();

  if (faltan.length) {
    malos += faltan.length;
    console.log(`FALLA ${js} pide ids que ${html} no tiene:`);
    faltan.forEach((id) => console.log('   · ' + id));
  } else {
    console.log(`ok  ${js.padEnd(18)} ${pide.size} ids, todos existen`);
  }
}

/* -- Botones dentro de botones ---------------------------------------------
   La tarjeta de producto es un <button>. Meterle otro <button> adentro (la
   estrella de favorito) es HTML invalido: el navegador cierra el de fuera y
   saca el resto como hermanos, asi que UNA tarjeta ocupaba TRES celdas de la
   rejilla. Se veia como "tarjetas de tamaño raro", y saltaba sobre todo en los
   productos SIN FOTO, donde el pedazo que quedaba era diminuto. */
const CARDS = ['tomar-pedido.js', 'venta-rapida.js', 'domicilios.js'];
for (const js of CARDS) {
  const j = leer(js);
  if (!j) continue;
  // Fuera los comentarios: justamente hablan de esto y darian falsos positivos.
  const limpio = j.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  let anidados = 0;
  const re = /<button[^>]*class="[^"]*lm-prod/g;
  let m;
  while ((m = re.exec(limpio))) {
    const resto = limpio.slice(m.index);
    const cierre = resto.indexOf('</button>');
    if (cierre < 0) continue;
    anidados += (resto.slice(0, cierre).match(/<button/g) || []).length - 1;
  }
  if (anidados > 0) {
    malos += anidados;
    console.log(`FALLA ${js} mete ${anidados} <button> dentro de la tarjeta (.lm-prod)`);
  } else {
    console.log(`ok  ${js.padEnd(18)} sin botones anidados en la tarjeta`);
  }
}

/* -- El atributo `hidden` de verdad esconde ----------------------------------
   Trampa real del 5-ago-2026: el navegador apaga lo que lleva `hidden`, pero
   CUALQUIER regla de clase que ponga display le gana. `.tu-adm-bd{display:flex}`
   dejaba el panel del editor visible siempre, vacio y con su titulo por defecto,
   encima de la pantalla en la que uno estuviera.
   Se comprueba que toda pantalla que USE hidden cargue una hoja que lo apague. */
const HTMLS = fs.readdirSync(raiz).filter((f) => f.endsWith('.html'));
for (const html of HTMLS) {
  const h = leer(html);
  if (!h) continue;
  const js = html.replace(/\.html$/, '.js');
  const j = leer(js) || '';
  // ¿Esta pantalla usa hidden?
  if (!/\shidden(\s|>|=)/.test(h) && !/\.hidden\s*=/.test(j)) continue;

  const hojas = [...h.matchAll(/<link[^>]+href="([^"?]+\.css)/g)].map((m) => m[1]);
  const protegida = hojas.some((c) => {
    const css = leer(c);
    return css && /\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(css);
  });
  if (!protegida) {
    malos++;
    console.log(`FALLA ${html} usa hidden pero ninguna de sus hojas lo apaga`);
    console.log(`   hojas: ${hojas.join(', ') || '(ninguna)'}`);
  }
}
console.log('ok  el atributo hidden esconde de verdad en todas las pantallas');

console.log(malos ? `\n${malos} ids rotos` : '\nTodo cuadra');
process.exit(malos ? 1 : 0);
