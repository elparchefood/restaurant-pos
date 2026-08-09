/* ═══════════════════════════════════════════════════════════════════════════
   pos-vars-ui.js — El editor de plantillas que ve el dueño
   ───────────────────────────────────────────────────────────────────────────
   REGLA DE ORO: los corchetes viven adentro, nunca se le muestran al dueño.
   Aquí una variable es una FICHA de color con su nombre en español. Que hoy
   `flow-editor.html` inserte el texto literal `{{nombre}}` con un botón no
   basta: el dueño sigue viendo la sintaxis y sigue pudiendo romperla.

   Por qué `contenteditable` y no un `<textarea>`:
   un textarea solo guarda texto, así que una ficha sería el texto `{puntos}` y
   al borrar quedarían restos como `{punto`. Con las fichas marcadas
   `contenteditable="false"` el navegador las trata como UNA sola cosa: una
   tecla de borrar se lleva la ficha entera. Es exactamente lo que se pidió, y
   sale gratis en vez de tener que perseguir los pedazos.

   Uso:
     posVarsUI.montar({
       editor: 'qmEditor',      // el div contenteditable
       barra: 'qmBarra',        // donde van los botones de insertar
       previa: 'qmPrevia',      // donde se pinta "Así le llega"
       contexto: 'pedido',      // para atenuar las que no aplican aquí
       onCambio: function(){}   // se llama en cada cambio
     });
     posVarsUI.poner(texto);    // cargar una plantilla
     posVarsUI.leer();          // devolverla como texto
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var V = global.posVars;
  var S = { ed: null, barra: null, previa: null, ctx: 'siempre', onCambio: null, muestra: 0, picker: null };

  var ESC = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  /* ── Cuántas veces se ha usado cada variable ─────────────────────────────
     Para poner arriba las de siempre. Vive en el equipo: es una comodidad de
     quien escribe las plantillas, no un dato del negocio. */
  function usos() {
    try { return JSON.parse(localStorage.getItem('pos.vars.uso') || '{}'); } catch (e) { return {}; }
  }
  function usoInc(k) {
    var u = usos(); u[k] = (u[k] || 0) + 1;
    try { localStorage.setItem('pos.vars.uso', JSON.stringify(u)); } catch (e) {}
  }

  /* ══ CLIENTES DE MUESTRA para la vista previa ════════════════════════════
     Números REALES de la base (52 clientes con puntos, promedio 45, máximo
     140, solo 3 pasan de 100). Son los tres casos que de verdad existen, y
     por eso son los que hay que poder ver antes de guardar: si la plantilla
     se lee mal con 0 puntos, se lee mal para casi todos los clientes nuevos. */
  var MUESTRAS = [
    { etiqueta: 'Cliente promedio · 45 pts', datos: {
      nombre: 'Ana María', puntos: 45, puntos_ganados: 27,
      total: 54500, total_productos: 27000, domicilio: 4500,
      tiempo_entrega: '30 minutos', negocio: 'Tu restaurante',
      direccion: 'Cra 9B # 63 n58, Bellavista', horario_hoy: '5:00 p. m. a 11:00 p. m.',
    } },
    { etiqueta: 'El que más tiene · 140 pts', datos: {
      nombre: 'Carlos', puntos: 140, puntos_ganados: 38,
      total: 42000, total_productos: 38000, domicilio: 4000,
      tiempo_entrega: '30 minutos', negocio: 'Tu restaurante',
      direccion: 'Cra 9B # 63 n58, Bellavista', horario_hoy: '5:00 p. m. a 11:00 p. m.',
    } },
    { etiqueta: 'Cliente nuevo · 0 pts', datos: {
      nombre: 'Juliana', puntos: 0, puntos_ganados: 13,
      total: 17000, total_productos: 13000, domicilio: 4000,
      tiempo_entrega: '30 minutos', negocio: 'Tu restaurante',
      direccion: 'Cra 9B # 63 n58, Bellavista', horario_hoy: '5:00 p. m. a 11:00 p. m.',
    } },
  ];

  /* El catálogo de puntos de muestra. Se parte en las dos listas según lo que
     tenga el cliente, que es exactamente lo que hará el sistema de verdad. */
  var CATALOGO_MUESTRA = [
    { producto: 'Gaseosa personal', puntos_necesarios: 25 },
    { producto: 'Porción de papas', puntos_necesarios: 40 },
    { producto: 'Salchipapa personal', puntos_necesarios: 60 },
    { producto: 'Hamburguesa', puntos_necesarios: 100 },
  ];
  function datosMuestra(i) {
    var m = MUESTRAS[i] || MUESTRAS[0];
    var d = {}, pts = m.datos.puntos || 0;
    Object.keys(m.datos).forEach(function (k) { d[k] = m.datos[k]; });
    /* El nombre del negocio de verdad, si ya se conoce: la vista previa dice
       "redimirlos en productos de X" y ese X debe ser EL restaurante del
       dueno que esta mirando, no uno de muestra. */
    try { d.negocio = localStorage.getItem('pos.brand.restaurante') || d.negocio; } catch (e) {}
    d.listas = {
      alcanza: CATALOGO_MUESTRA.filter(function (x) { return x.puntos_necesarios <= pts; })
        .map(function (x) { return { producto: x.producto, puntos_necesarios: x.puntos_necesarios, faltan: 0 }; }),
      /* `faltan` nunca es negativo: se calcula aquí, no en la plantilla. Por
         eso son dos listas y no una — en la de "ya puedes" el dueño ni
         siquiera tiene cómo escribir "te faltan -15". */
      falta: CATALOGO_MUESTRA.filter(function (x) { return x.puntos_necesarios > pts; })
        .map(function (x) { return { producto: x.producto, puntos_necesarios: x.puntos_necesarios,
                                     faltan: x.puntos_necesarios - pts }; }),
    };
    return d;
  }

  /* ══ FICHAS ══════════════════════════════════════════════════════════════ */
  var COLOR_GRUPO = {
    Cliente: 'cli', Pedido: 'ped', Puntos: 'pts', Negocio: 'neg', Domicilio: 'domi',
  };

  function fichaVar(clave) {
    var def = V.POR_CLAVE[clave];
    if (!def) return document.createTextNode('{' + clave + '}');
    var el = document.createElement('span');
    el.className = 'pv-chip pv-g-' + (COLOR_GRUPO[def.grupo] || 'neg');
    el.setAttribute('contenteditable', 'false');
    el.dataset.v = clave;
    el.textContent = def.nombre;
    el.title = def.desc;
    return el;
  }
  function fichaCalc(expr, fmt) {
    var el = document.createElement('span');
    el.className = 'pv-chip pv-g-calc';
    el.setAttribute('contenteditable', 'false');
    el.dataset.calc = expr;
    el.dataset.fmt = fmt || 'entero';
    el.textContent = '∑ ' + etiquetaCalc(expr, fmt);
    el.title = 'Cálculo: ' + expr;
    return el;
  }
  /* La cuenta se le muestra al dueño con los NOMBRES en español, no con las
     claves internas: "Puntos que cuesta − Puntos del cliente × 1.000". */
  function etiquetaCalc(expr, fmt) {
    var t = String(expr).replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, function (n) {
      return V.POR_CLAVE[n] ? V.POR_CLAVE[n].nombre : n;
    }).replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').trim();
    return t + (fmt === 'dinero' ? ' en $' : '');
  }

  /* ══ Texto ⇄ fichas ══════════════════════════════════════════════════════ */
  function poner(txt) {
    if (!S.ed) return;
    S.ed.innerHTML = '';
    var s = String(txt == null ? '' : txt);
    var re = /\{([^{}]+)\}/g, pos = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > pos) agregarTexto(S.ed, s.slice(pos, m.index));
      var dentro = m[1].trim();
      if (dentro[0] === '=') {
        var p = dentro.slice(1).split('|');
        S.ed.appendChild(fichaCalc(p[0].trim(), (p[1] || 'entero').trim()));
      } else if (V.POR_CLAVE[dentro]) {
        S.ed.appendChild(fichaVar(dentro));
      } else {
        agregarTexto(S.ed, m[0]);   // no la conocemos: se deja ver, para que se note
      }
      pos = m.index + m[0].length;
    }
    if (pos < s.length) agregarTexto(S.ed, s.slice(pos));
    pintarPrevia();
  }
  function agregarTexto(cont, txt) {
    var partes = String(txt).split('\n');
    partes.forEach(function (p, i) {
      if (i) cont.appendChild(document.createElement('br'));
      if (p) cont.appendChild(document.createTextNode(p));
    });
  }

  function leer() {
    if (!S.ed) return '';
    return serializar(S.ed).replace(/ /g, ' ');   // el navegador mete espacios duros al escribir
  }
  function serializar(nodo) {
    var out = '';
    for (var i = 0; i < nodo.childNodes.length; i++) {
      var n = nodo.childNodes[i];
      if (n.nodeType === 3) { out += n.data; continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName;
      if (tag === 'BR') { out += '\n'; continue; }
      if (n.dataset && n.dataset.v) { out += '{' + n.dataset.v + '}'; continue; }
      if (n.dataset && n.dataset.calc) {
        out += '{= ' + n.dataset.calc + ' | ' + (n.dataset.fmt || 'entero') + '}';
        continue;
      }
      /* Al pegar texto o al dar Enter el navegador crea DIV o P. Cada bloque
         nuevo es un renglón: si no se traduce, la plantilla sale toda pegada. */
      if (tag === 'DIV' || tag === 'P') { if (out && out.slice(-1) !== '\n') out += '\n'; out += serializar(n); continue; }
      out += serializar(n);
    }
    return out;
  }

  /* ══ Insertar en el cursor ═══════════════════════════════════════════════ */
  function insertar(nodo) {
    S.ed.focus();
    var sel = global.getSelection();
    var r;
    /* Si el cursor no está dentro del editor (p. ej. se acaba de tocar un
       botón), se inserta AL FINAL en vez de no hacer nada: quedarse quieto se
       lee como que el botón está roto. */
    if (sel && sel.rangeCount && S.ed.contains(sel.anchorNode)) {
      r = sel.getRangeAt(0);
      r.deleteContents();
    } else {
      r = document.createRange();
      r.selectNodeContents(S.ed);
      r.collapse(false);
    }
    r.insertNode(nodo);
    /* Un espacio detrás para poder seguir escribiendo: sin él, el cursor
       queda pegado a la ficha y lo que se teclee parece parte de ella. */
    var esp = document.createTextNode(' ');
    if (nodo.parentNode) nodo.parentNode.insertBefore(esp, nodo.nextSibling);
    r.setStartAfter(esp); r.collapse(true);
    if (sel) { sel.removeAllRanges(); sel.addRange(r); }
    cambio();
  }
  function insertarVar(clave) { usoInc(clave); insertar(fichaVar(clave)); cerrarPicker(); }

  function cambio() { pintarPrevia(); if (S.onCambio) S.onCambio(); }

  /* ══ VISTA PREVIA — "Así le llega" ═══════════════════════════════════════
     Es la pieza que permite que Sergio arme la plantilla solo: sin ver el
     mensaje con un cliente de verdad, escribir con variables es escribir a
     ciegas. Por eso no es un extra, es parte del editor. */
  function pintarPrevia() {
    if (!S.previa) return;
    var plantilla = leer();
    var r = V.resolver(plantilla, datosMuestra(S.muestra));
    var pestanas = MUESTRAS.map(function (m, i) {
      return '<button type="button" class="pv-mtab' + (i === S.muestra ? ' on' : '') +
             '" data-pv-muestra="' + i + '">' + ESC(m.etiqueta) + '</button>';
    }).join('');

    /* Las variables que la plantilla pide y no existen en este contexto se
       AVISAN, no se tapan: el mensaje sale igual pero con el hueco a la vista.
       (Una lista vacía sí se resuelve callada — eso se decidió así.) */
    var rotas = r.faltantes.filter(function (f) { return String(f).indexOf('cálculo:') === 0; });
    var aviso = rotas.length
      ? '<div class="pv-aviso">⚠ ' + ESC(rotas[0].replace('cálculo: ', 'La cuenta no cuadra: ')) + '</div>' : '';

    S.previa.innerHTML =
      '<div class="pv-prev-head"><span>Así le llega</span><div class="pv-mtabs">' + pestanas + '</div></div>'
      + aviso
      + '<div class="pv-burbuja">' + (r.texto.trim() ? ESC(r.texto).replace(/\n/g, '<br>') :
          '<span class="pv-vacio">El mensaje queda vacío para este cliente.</span>') + '</div>';
  }

  /* ══ EL BUSCADOR DE VARIABLES ════════════════════════════════════════════
     De 100 variables se ven ~20. No es hacer una lista mejor: es mostrar
     menos. Busca por significado (palabras alternas), agrupa por origen, pone
     arriba las más usadas, y las que no aplican salen ATENUADAS con el motivo
     — esconderlas hace creer que no existen. */
  function abrirPicker(ancla, q) {
    cerrarPicker();
    var pk = document.createElement('div');
    pk.className = 'pv-picker';
    pk.innerHTML = '<input class="pv-busca" placeholder="Buscar: puntos, saldo, total…">'
      + '<div class="pv-lista"></div>';
    document.body.appendChild(pk);
    S.picker = pk;

    var r = (ancla || S.ed).getBoundingClientRect();
    pk.style.left = Math.min(r.left, global.innerWidth - pk.offsetWidth - 12) + 'px';
    pk.style.top = (r.bottom + 6) + 'px';
    /* Si no cabe abajo (tablet apaisada, teclado arriba), se abre hacia
       arriba en vez de quedar cortada contra el borde. */
    if (r.bottom + pk.offsetHeight + 12 > global.innerHeight) {
      pk.style.top = Math.max(8, r.top - pk.offsetHeight - 6) + 'px';
    }

    var inp = pk.querySelector('.pv-busca');
    inp.value = q || '';
    pintarLista(q || '');
    inp.addEventListener('input', function () { pintarLista(inp.value); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cerrarPicker(); S.ed.focus(); } });
    /* En la tablet, enfocar el buscador ABRE el teclado y tapa justo la lista
       que se acaba de abrir. Solo se enfoca donde hay ratón — mismo caso que
       las notas frecuentes. */
    if (global.matchMedia && global.matchMedia('(pointer: fine)').matches) inp.focus();

    pk.addEventListener('mousedown', function (e) { e.preventDefault(); });
    pk.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pv-pick]');
      if (b) { insertarVar(b.dataset.pvPick); return; }
      if (e.target.closest('[data-pv-calc]')) { cerrarPicker(); abrirCalc(); }
    });
    setTimeout(function () { document.addEventListener('mousedown', fueraPicker); }, 0);
  }
  function fueraPicker(e) { if (S.picker && !S.picker.contains(e.target)) cerrarPicker(); }
  function cerrarPicker() {
    if (!S.picker) return;
    document.removeEventListener('mousedown', fueraPicker);
    S.picker.remove(); S.picker = null;
  }
  function pintarLista(q) {
    if (!S.picker) return;
    var cont = S.picker.querySelector('.pv-lista');
    var res = V.buscar(q, S.ctx, usos());
    if (!res.length) { cont.innerHTML = '<div class="pv-nada">Nada coincide con eso.</div>'; return; }
    var grupos = {}, orden = [];
    res.forEach(function (x) {
      var g = x.def.grupo;
      if (!grupos[g]) { grupos[g] = []; orden.push(g); }
      grupos[g].push(x);
    });
    cont.innerHTML = orden.map(function (g) {
      return '<div class="pv-grp">' + ESC(g) + '</div>' + grupos[g].map(function (x) {
        return '<button type="button" class="pv-op' + (x.aplica ? '' : ' off') + '" data-pv-pick="' + x.def.clave + '">'
          + '<span class="pv-op-n">' + ESC(x.def.nombre) + '</span>'
          + '<span class="pv-op-d">' + ESC(x.aplica ? x.def.desc : x.motivo) + '</span></button>';
      }).join('');
    }).join('') + '<button type="button" class="pv-op pv-op-calc" data-pv-calc="1">'
      + '<span class="pv-op-n">∑ Hacer una cuenta</span>'
      + '<span class="pv-op-d">Restar, sumar o multiplicar variables entre sí.</span></button>';
  }

  /* ══ EL ARMADOR DE CUENTAS ═══════════════════════════════════════════════
     Con listas desplegables (dato · operación · dato) y el resultado EN VIVO
     con un cliente de ejemplo antes de guardar. Escribir la fórmula a mano
     sería pedirle al dueño que programe; ver el resultado antes de guardar es
     lo que hace que se atreva a usarla. */
  function abrirCalc() {
    var numericas = V.REGISTRO.filter(function (v) { return v.fmt !== 'texto'; });
    var opts = function (sel) {
      return numericas.map(function (v) {
        return '<option value="' + v.clave + '"' + (v.clave === sel ? ' selected' : '') + '>' + ESC(v.nombre) + '</option>';
      }).join('') + '<option value="__num">un número fijo…</option>';
    };
    var ov = document.createElement('div');
    ov.className = 'pv-modal-ov';
    ov.innerHTML =
      '<div class="pv-modal">'
      + '<div class="pv-modal-h">∑ Hacer una cuenta<button type="button" class="pv-x" data-pv-cerrar>✕</button></div>'
      + '<div class="pv-calc-fila">'
        + '<select class="pv-c-a">' + opts('puntos_necesarios') + '</select>'
        + '<input class="pv-c-an" type="number" placeholder="0" style="display:none">'
        + '<select class="pv-c-op"><option value="-">menos −</option><option value="+">más +</option>'
          + '<option value="*">por ×</option><option value="/">dividido ÷</option></select>'
        + '<select class="pv-c-b">' + opts('puntos') + '</select>'
        + '<input class="pv-c-bn" type="number" placeholder="0" style="display:none">'
      + '</div>'
      + '<label class="pv-calc-luego"><input type="checkbox" class="pv-c-mas"> y el resultado, multiplicarlo por '
        + '<input class="pv-c-mult" type="number" value="1000" disabled></label>'
      + '<div class="pv-calc-fmt">Mostrarlo como '
        + '<select class="pv-c-fmt"><option value="entero">un número (15)</option>'
        + '<option value="dinero">plata ($15.000)</option></select></div>'
      + '<div class="pv-calc-res" aria-live="polite"></div>'
      + '<div class="pv-modal-acc"><button type="button" class="pv-btn-sec" data-pv-cerrar>Cancelar</button>'
        + '<button type="button" class="pv-btn-pri pv-c-ok">Poner la cuenta</button></div>'
      + '</div>';
    document.body.appendChild(ov);

    var q = function (c) { return ov.querySelector(c); };
    function expresion() {
      var a = q('.pv-c-a').value === '__num' ? (q('.pv-c-an').value || '0') : q('.pv-c-a').value;
      var b = q('.pv-c-b').value === '__num' ? (q('.pv-c-bn').value || '0') : q('.pv-c-b').value;
      var e = a + ' ' + q('.pv-c-op').value + ' ' + b;
      if (q('.pv-c-mas').checked) e = '(' + e + ') * ' + (q('.pv-c-mult').value || '1');
      return e;
    }
    function refrescar() {
      q('.pv-c-an').style.display = q('.pv-c-a').value === '__num' ? '' : 'none';
      q('.pv-c-bn').style.display = q('.pv-c-b').value === '__num' ? '' : 'none';
      q('.pv-c-mult').disabled = !q('.pv-c-mas').checked;
      var e = expresion(), fmt = q('.pv-c-fmt').value;
      /* El resultado en vivo se calcula con el cliente de muestra que esté
         seleccionado en la vista previa, y con un producto del catálogo, para
         que el número que se ve sea uno que de verdad puede salir. */
      var d = datosMuestra(S.muestra);
      var fila = (d.listas.falta[0] || d.listas.alcanza[0] || { puntos_necesarios: 60, faltan: 15, producto: '' });
      var vals = {};
      Object.keys(d).forEach(function (k) { if (k !== 'listas') vals[k] = d[k]; });
      Object.keys(fila).forEach(function (k) { vals[k] = fila[k]; });
      try {
        var n = V.calcular(e, vals);
        q('.pv-calc-res').innerHTML = '<span class="pv-ok">Con ' + ESC(MUESTRAS[S.muestra].etiqueta.split(' · ')[0])
          + ' daría <b>' + ESC(V.formato[fmt] ? V.formato[fmt](n) : String(n)) + '</b></span>';
        q('.pv-c-ok').disabled = false;
      } catch (err) {
        q('.pv-calc-res').innerHTML = '<span class="pv-mal">⚠ ' + ESC(err.message) + '</span>';
        q('.pv-c-ok').disabled = true;
      }
    }
    ov.addEventListener('change', refrescar);
    ov.addEventListener('input', refrescar);
    ov.addEventListener('click', function (e) {
      if (e.target.closest('[data-pv-cerrar]') || e.target === ov) { ov.remove(); return; }
      if (e.target.closest('.pv-c-ok')) {
        insertar(fichaCalc(expresion(), q('.pv-c-fmt').value));
        ov.remove();
      }
    });
    refrescar();
  }

  /* ══ MONTAJE ═════════════════════════════════════════════════════════════ */
  function montar(op) {
    S.ed = document.getElementById(op.editor);
    S.barra = op.barra ? document.getElementById(op.barra) : null;
    S.previa = op.previa ? document.getElementById(op.previa) : null;
    S.ctx = op.contexto || 'siempre';
    S.onCambio = op.onCambio || null;
    S.muestra = 0;
    if (!S.ed) return;

    S.ed.setAttribute('contenteditable', 'true');
    S.ed.classList.add('pv-editor');

    if (!S.ed._pvBound) {
      S.ed._pvBound = true;
      S.ed.addEventListener('input', function () {
        /* Quien ya se sabe el sistema, que escriba: al teclear "{" se abre la
           lista igual que con el botón. Se quita la llave para que no quede
           suelta en el texto si al final no se elige nada. */
        var sel = global.getSelection();
        if (sel && sel.rangeCount) {
          var n = sel.anchorNode;
          if (n && n.nodeType === 3 && n.data.slice(sel.anchorOffset - 1, sel.anchorOffset) === '{') {
            n.deleteData(sel.anchorOffset - 1, 1);
            abrirPicker(S.ed, '');
          }
        }
        cambio();
      });
      /* Pegar SIEMPRE como texto plano. Si no, se cuelan colores, tipografías
         y etiquetas de Word que después salen en el mensaje del cliente. */
      S.ed.addEventListener('paste', function (e) {
        e.preventDefault();
        var t = (e.clipboardData || global.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, t);
      });
      S.ed.addEventListener('blur', cambio);
    }

    if (S.barra) pintarBarra();
    if (S.previa && !S.previa._pvBound) {
      S.previa._pvBound = true;
      S.previa.addEventListener('click', function (e) {
        var t = e.target.closest('[data-pv-muestra]');
        if (t) { S.muestra = +t.dataset.pvMuestra; pintarPrevia(); }
      });
    }
    pintarPrevia();
  }

  /* La barra: las 4 más usadas + "Ver todas" + "Cálculo". No se muestran las
     100 de una — se muestran las que se usan siempre y una puerta al resto. */
  function pintarBarra() {
    var u = usos();
    var top = V.buscar('', S.ctx, u).filter(function (x) { return x.aplica; }).slice(0, 4);
    S.barra.innerHTML = '<span class="pv-barra-lbl">Insertar:</span>'
      + top.map(function (x) {
          return '<button type="button" class="pv-ins pv-g-' + (COLOR_GRUPO[x.def.grupo] || 'neg') + '"'
            + ' data-pv-ins="' + x.def.clave + '" title="' + ESC(x.def.desc) + '">'
            + ESC(x.def.nombre) + '</button>';
        }).join('')
      + '<button type="button" class="pv-ins pv-ins-mas" data-pv-todas>Ver todas ▾</button>'
      + '<button type="button" class="pv-ins pv-g-calc" data-pv-abrircalc>∑ Cálculo</button>';
    if (!S.barra._pvBound) {
      S.barra._pvBound = true;
      S.barra.addEventListener('mousedown', function (e) { e.preventDefault(); });
      S.barra.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pv-ins]');
        if (b) { insertarVar(b.dataset.pvIns); pintarBarra(); return; }
        if (e.target.closest('[data-pv-todas]')) { abrirPicker(S.barra, ''); return; }
        if (e.target.closest('[data-pv-abrircalc]')) abrirCalc();
      });
    }
  }

  global.posVarsUI = {
    montar: montar, poner: poner, leer: leer,
    MUESTRAS: MUESTRAS, datosMuestra: datosMuestra,
    /* Para pintar un pedacito de la plantilla en la lista, con los nombres en
       español en vez de las llaves. */
    resumen: function (txt, largo) {
      var t = String(txt || '')
        .replace(/\{#lista:[a-z_]+\}|\{\/lista\}|\{#fila\}|\{\/fila\}/g, ' ')
        .replace(/\{=\s*([^|}]+)(\|[^}]*)?\}/g, function (_a, e) { return '∑' + etiquetaCalc(e.trim(), ''); })
        .replace(/\{([^{}]+)\}/g, function (a, k) {
          k = k.trim();
          return V.POR_CLAVE[k] ? '«' + V.POR_CLAVE[k].nombre + '»' : a;
        })
        .replace(/\s+/g, ' ').trim();
      largo = largo || 90;
      return t.length > largo ? t.slice(0, largo - 1) + '…' : t;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
