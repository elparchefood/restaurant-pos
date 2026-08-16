/* pos-qr.js — el generador de codigos QR de Cobra.
 *
 * Escrito a mano y sin librerias a proposito: Cobra corre dentro de un .exe que
 * tiene que funcionar SIN INTERNET, y una libreria traida de un CDN dejaria la
 * pantalla en blanco justo en el restaurante que no tiene wifi. Son 200 lineas
 * y no cambian nunca.
 *
 * Alcance deliberado: modo BYTE, correccion nivel M, versiones 1 a 6.
 * La direccion mas larga posible ("https://cobrapos.app/" + 40 letras) son 61
 * caracteres y la version 6 aguanta 106. Pasar de la version 6 obligaria a
 * escribir tambien el bloque de "informacion de version", que solo existe de la
 * 7 en adelante — codigo que nunca se usaria.
 *
 * Nivel M = aguanta que se ensucie o se raye ~15% del codigo y sigue leyendose.
 * Es el nivel correcto para un QR pegado en una mesa de restaurante.
 *
 * Comprobado modulo por modulo contra `segno` (implementacion independiente de
 * referencia) en las 6 versiones y las 8 mascaras.
 */
(function (global) {
  'use strict';

  /* Por version: [codewords de correccion por bloque, cuantos bloques,
     codewords de datos por bloque]. Todas las versiones hasta la 6 en nivel M
     tienen bloques del MISMO tamaño, lo que ahorra el caso de "dos grupos". */
  var SPEC = {
    1: [10, 1, 16], 2: [16, 1, 28], 3: [26, 1, 44],
    4: [18, 2, 32], 5: [24, 2, 43], 6: [16, 4, 27],
  };
  /* Donde van los cuadritos de alineacion. La version 1 no lleva. */
  var ALIN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

  // ── Aritmetica del campo de Galois GF(256), para la correccion de errores ──
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;          // el polinomio que define el campo
    }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  /* El polinomio generador para n codewords de correccion. */
  function generador(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g;
  }

  /* Reed-Solomon: la division polinomica cuyo residuo son los codewords de
     correccion. Es lo que permite leer el codigo aunque este sucio. */
  function correccion(datos, n) {
    var g = generador(n), res = new Array(datos.length + n).fill(0);
    for (var i = 0; i < datos.length; i++) res[i] = datos[i];
    for (i = 0; i < datos.length; i++) {
      var c = res[i];
      if (!c) continue;
      for (var j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], c);
    }
    return res.slice(datos.length);
  }

  // ── 1. El texto se vuelve bits ─────────────────────────────────────
  function aBytes(texto) {
    var s = unescape(encodeURIComponent(String(texto)));   // UTF-8
    var b = [];
    for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i));
    return b;
  }

  function version(largo) {
    for (var v = 1; v <= 6; v++) {
      var total = SPEC[v][1] * SPEC[v][2];
      // 4 bits de "modo byte" + 8 bits de longitud + los datos
      if (total * 8 >= 4 + 8 + largo * 8) return v;
    }
    return 0;   // no cabe: quien llama decide que hacer
  }

  function codewords(bytes, v) {
    var ecN = SPEC[v][0], nB = SPEC[v][1], dB = SPEC[v][2];
    var total = nB * dB;

    var bits = [];
    function push(valor, cuantos) {
      for (var i = cuantos - 1; i >= 0; i--) bits.push((valor >> i) & 1);
    }
    push(4, 4);                    // modo byte
    push(bytes.length, 8);         // cuantos bytes (8 bits basta hasta la v9)
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    // Terminador: hasta 4 ceros, y solo si hay espacio.
    for (i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    var datos = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      datos.push(b);
    }
    // Relleno alternado hasta llenar: son los bytes que manda la norma.
    var relleno = [0xEC, 0x11], k = 0;
    while (datos.length < total) datos.push(relleno[k++ % 2]);

    /* Los datos se parten en bloques, cada bloque lleva SU correccion, y luego
       todo se entrelaza: asi una mancha grande daña un poco de cada bloque en
       vez de destruir uno entero. */
    var bloquesD = [], bloquesE = [];
    for (i = 0; i < nB; i++) {
      var d = datos.slice(i * dB, (i + 1) * dB);
      bloquesD.push(d);
      bloquesE.push(correccion(d, ecN));
    }
    var salida = [];
    for (i = 0; i < dB; i++) for (j = 0; j < nB; j++) salida.push(bloquesD[j][i]);
    for (i = 0; i < ecN; i++) for (j = 0; j < nB; j++) salida.push(bloquesE[j][i]);
    return salida;
  }

  // ── 2. Los bits se acomodan en la cuadricula ───────────────────────
  function armar(v) {
    var n = 17 + 4 * v;
    var m = [], reservado = [];
    for (var i = 0; i < n; i++) {
      m.push(new Array(n).fill(0));
      reservado.push(new Array(n).fill(false));
    }
    function poner(x, y, val) { if (x >= 0 && y >= 0 && x < n && y < n) { m[y][x] = val; reservado[y][x] = true; } }

    // Los tres cuadros de las esquinas, con su marco blanco.
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (p) {
      for (var y = -1; y <= 7; y++) for (var x = -1; x <= 7; x++) {
        var dentro = (x >= 0 && x <= 6 && y >= 0 && y <= 6);
        var negro = dentro && (x === 0 || x === 6 || y === 0 || y === 6 ||
                               (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        poner(p[0] + x, p[1] + y, negro ? 1 : 0);
      }
    });

    // Los cuadritos de alineacion, menos donde chocarian con las esquinas.
    var a = ALIN[v];
    a.forEach(function (cy) {
      a.forEach(function (cx) {
        if ((cx === 6 && cy === 6) || (cx === 6 && cy === a[a.length - 1]) ||
            (cx === a[a.length - 1] && cy === 6)) return;
        for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) {
          var borde = Math.max(Math.abs(x), Math.abs(y));
          poner(cx + x, cy + y, (borde === 1) ? 0 : 1);
        }
      });
    });

    // Las dos lineas punteadas que dan la escala.
    for (i = 8; i < n - 8; i++) {
      poner(i, 6, i % 2 === 0 ? 1 : 0);
      poner(6, i, i % 2 === 0 ? 1 : 0);
    }
    poner(8, n - 8, 1);                    // el modulo negro obligatorio

    // Se aparta el sitio de la informacion de formato (se escribe al final).
    for (i = 0; i <= 8; i++) { if (i !== 6) { reservado[8][i] = true; reservado[i][8] = true; } }
    for (i = 0; i < 8; i++) { reservado[8][n - 1 - i] = true; reservado[n - 1 - i][8] = true; }

    return { n: n, m: m, res: reservado };
  }

  function llenar(q, cw) {
    var n = q.n, bits = [];
    for (var i = 0; i < cw.length; i++)
      for (var j = 7; j >= 0; j--) bits.push((cw[i] >> j) & 1);

    var k = 0, subiendo = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;                // la columna punteada no cuenta
      for (var t = 0; t < n; t++) {
        var y = subiendo ? (n - 1 - t) : t;
        for (var d = 0; d < 2; d++) {
          var x = col - d;
          if (q.res[y][x]) continue;
          q.m[y][x] = k < bits.length ? bits[k] : 0;
          k++;
        }
      }
      subiendo = !subiendo;
    }
  }

  // ── 3. La mascara: se prueban las 8 y gana la que menos penaliza ───
  function mascara(x, y, k) {
    switch (k) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2 + (x * y) % 3) === 0;
      case 6: return (((x * y) % 2 + (x * y) % 3) % 2) === 0;
      default: return (((x + y) % 2 + (x * y) % 3) % 2) === 0;
    }
  }

  /* Las cuatro reglas de castigo de la norma. Buscan lo que confunde a un
     lector: rachas largas, cuadros de 2x2, algo que parezca una esquina, y
     demasiado negro o demasiado blanco. */
  function castigo(m, n) {
    var p = 0, i, j;

    /* Regla 1 · rachas de 5 o mas del mismo color: 3 puntos, y uno mas por
       cada modulo de sobra. */
    function rachas(s) {
      var c = 0, run = 1;
      for (var z = 1; z < s.length; z++) {
        if (s[z] === s[z - 1]) { run++; }
        else { if (run >= 5) c += run - 2; run = 1; }
      }
      return c + (run >= 5 ? run - 2 : 0);
    }

    /* Regla 3 · lo que un lector confunde con una esquina: 1011101 con cuatro
       modulos claros pegados por delante o por detras.

       El detalle que se me habia escapado: cuando el patron toca el BORDE del
       codigo, esos cuatro modulos claros son el margen blanco de alrededor, asi
       que tambien cuenta. Sin eso, la mascara de rayas verticales salia limpia
       en el puntaje y ganaba — y el codigo que producia no lo leia nadie. */
    var PAT = '1011101';
    function esquinas(s) {
      var c = 0, k = s.indexOf(PAT);
      while (k !== -1) {
        var fin = k + 7;
        var antes = s.slice(Math.max(k - 4, 0), k);
        var luego = s.slice(fin, fin + 4);
        if (antes.indexOf('1') < 0 || luego.indexOf('1') < 0) {
          c += 40; k = s.indexOf(PAT, fin);
        } else {
          /* Sin claros a ninguno de los dos lados no cuenta; se sigue buscando
             desde dentro del propio patron, que puede empezar ahi mismo. */
          k = s.indexOf(PAT, k + 4);
        }
      }
      return c;
    }

    var oscuros = 0;
    for (i = 0; i < n; i++) {
      var fila = '', col = '';
      for (j = 0; j < n; j++) { fila += m[i][j]; col += m[j][i]; oscuros += m[i][j]; }
      p += rachas(fila) + rachas(col) + esquinas(fila) + esquinas(col);
    }

    for (i = 0; i < n - 1; i++)                     // 2 · bloques de 2x2
      for (j = 0; j < n - 1; j++)
        if (m[i][j] === m[i][j + 1] && m[i][j] === m[i + 1][j] && m[i][j] === m[i + 1][j + 1]) p += 3;

    var pct = oscuros * 100 / (n * n);              // 4 · equilibrio de color
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  /* Los 15 bits de formato: nivel de correccion + mascara, protegidos con su
     propio codigo BCH y revueltos con un patron fijo de la norma para que
     nunca queden todos en cero. */
  function formato(k) {
    var d = (0 << 3) | k;            // 0 = nivel M
    var v = d << 10;
    for (var i = 4; i >= 0; i--) if (v & (1 << (i + 10))) v ^= 0x537 << i;
    return ((d << 10) | v) ^ 0x5412;
  }

  /* Los 15 bits van DOS veces, para que el codigo se lea aunque una esquina
     este dañada. Y cada copia los escribe en un orden distinto — no es un
     capricho de la norma, es lo que permite reconstruirlos desde cualquiera de
     las dos. El bit 14 es el mas significativo. */
  function escribirFormato(q, k) {
    var n = q.n, f = formato(k), i;

    // Copia 1, alrededor de la esquina de arriba a la izquierda.
    for (i = 0; i <= 5; i++) {
      q.m[8][i] = (f >> (14 - i)) & 1;      // fila 8, columnas 0..5  -> bits 14..9
      q.m[i][8] = (f >> i) & 1;             // columna 8, filas 0..5  -> bits 0..5
    }
    q.m[8][7] = (f >> 8) & 1;
    q.m[8][8] = (f >> 7) & 1;
    q.m[7][8] = (f >> 6) & 1;               // la fila 6 se salta: es la punteada

    // Copia 2, repartida entre la esquina de arriba a la derecha y la de abajo.
    for (i = 0; i <= 7; i++) q.m[8][n - 1 - i] = (f >> i) & 1;
    for (i = 8; i <= 14; i++) q.m[n - 15 + i][8] = (f >> i) & 1;
  }

  // ── Lo que se usa desde afuera ─────────────────────────────────────
  /* Devuelve { n, m } con la cuadricula en 1 (negro) y 0 (blanco), SIN el
     margen blanco: quien pinta decide cuanto margen deja. */
  function matriz(texto) {
    var bytes = aBytes(texto), v = version(bytes.length);
    if (!v) throw new Error('El texto es muy largo para este codigo QR');
    var cw = codewords(bytes, v);
    var q = armar(v);
    llenar(q, cw);

    var mejor = null, mejorP = Infinity;
    for (var k = 0; k < 8; k++) {
      var copia = q.m.map(function (f) { return f.slice(); });
      for (var y = 0; y < q.n; y++) for (var x = 0; x < q.n; x++)
        if (!q.res[y][x] && mascara(x, y, k)) copia[y][x] ^= 1;
      var prueba = { n: q.n, m: copia };
      escribirFormato(prueba, k);
      var p = castigo(copia, q.n);
      if (p < mejorP) { mejorP = p; mejor = prueba; }
    }
    return { n: mejor.n, m: mejor.m, version: v };
  }

  /* Pinta el codigo en un canvas. El margen de 4 modulos NO es decoracion: sin
     el, muchos lectores no encuentran el codigo. */
  function aCanvas(canvas, texto, opts) {
    opts = opts || {};
    var q = matriz(texto);
    var margen = opts.margen == null ? 4 : opts.margen;
    var lado = q.n + margen * 2;
    var lienzo = opts.px || canvas.width || 180;
    /* Se redondea el tamaño del modulo hacia abajo a un entero: con decimales,
       el navegador difumina los bordes y el codigo se vuelve dificil de leer. */
    var mod = Math.max(1, Math.floor(lienzo / lado));
    var real = mod * lado;
    canvas.width = real; canvas.height = real;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.fondo || '#FFFFFF';
    ctx.fillRect(0, 0, real, real);
    ctx.fillStyle = opts.tinta || '#0F172A';
    for (var y = 0; y < q.n; y++) for (var x = 0; x < q.n; x++)
      if (q.m[y][x]) ctx.fillRect((x + margen) * mod, (y + margen) * mod, mod, mod);
    return canvas;
  }

  global.posQR = { matriz: matriz, aCanvas: aCanvas };
})(typeof window !== 'undefined' ? window : globalThis);
