/* ══════════════════════════════════════════════════════════════════════════
   carta.js — la carta que abre el cliente desde WhatsApp.

   Lo abre gente SIN CUENTA y sin sesión, desde el navegador de WhatsApp, con
   datos de celular y muchas veces por primera vez. Todo lo de aquí está
   pensado para eso:

     · una pregunta por pantalla, y tocar la respuesta ya es continuar;
     · el precio que se ve es el que se paga (el empaque viene sumado del
       servidor, no se calcula aquí);
     · nunca una pantalla en blanco: si algo falla, se dice qué y qué hacer.

   ⚠️ ESTA PÁGINA NO SABE DE PRECIOS. Manda QUÉ escogió —ids y cantidades— y
   el servidor recalcula. Si mandara el precio, cualquiera se pediría una
   familiar por mil pesos. Lo que se ve aquí es para la persona, no para
   cobrar.

   ⚠️ Y NO GASTA NADA. Ni saldo ni puntos. Solo dice qué quiere hacer; el
   dinero lo mueve Paco en el chat. Regla de Sergio: *"si ya se va al chat, ya
   se queda en el chat"*.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SB = 'https://tblujfduscslxjmrjbdr.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

  var $ = function (id) { return document.getElementById(id); };
  var cop = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var TOKEN = new URLSearchParams(location.search).get('t') || '';
  var D = null;                 // lo que devolvió el servidor
  var pedido = [];
  var abierto = null, elegido = {}, ultima = null, pagoElegido = null;
  /*  A donde va el pedido. `domi` es lo que contesto el servidor: aqui no
      se calcula ni un peso de domicilio.                                */
  var entrega = { modo: '', barrio: '', direccion: '', conjunto: '', unidad: '', domi: 0, conocida: false };
  var trasBebida = false;

  /* ── hablar con el servidor ─────────────────────────────────────────── */
  async function llamar(cuerpo) {
    var r = await fetch(SB + '/functions/v1/carta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON },
      body: JSON.stringify(Object.assign({ token: TOKEN }, cuerpo))
    });
    var d = await r.json().catch(function () { return {}; });
    /* Un 4xx no lanza excepción por su cuenta: hay que mirarlo. Este proyecto
       ya perdió semanas por un 403 que nadie miraba. */
    if (!r.ok) throw new Error(d.error || ('No se pudo (' + r.status + ')'));
    return d;
  }

  function morir(tit, txt) {
    $('cargando').hidden = true;
    $('app').hidden = true;
    $('errorTit').textContent = tit;
    $('errorTxt').textContent = txt;
    $('pantallaError').hidden = false;
  }

  /* ── arranque ───────────────────────────────────────────────────────── */
  (async function () {
    if (!TOKEN) return morir('Falta el enlace', 'Abre la carta desde el botón que te mandamos en el chat.');
    try {
      D = await llamar({ action: 'abrir' });
    } catch (e) {
      return morir('No pudimos abrir la carta', (e && e.message) || 'Vuelve al chat y pídela otra vez.');
    }
    /*  ══ SI ESTA CERRADO, NO SE PIDE ═══════════════════════════════════
        Sergio: alguien con el enlace podria pedir un dia que esta cerrado. La
        carta se puede MIRAR —es bueno que la vea y vuelva— pero el pedido no
        sale. Y el servidor lo vuelve a comprobar al mandar, porque entre
        abrir y terminar pueden pasar veinte minutos.                      */
    /*  ══ CERRADO: SE MIRA, PERO NO SE PIDE ═════════════════════════════
        La primera versión cerraba la página entera, y eso era un retroceso:
        antes, con las imágenes, quien preguntaba de noche al menos VEÍA la
        carta. Que la mire es bueno — se antoja y vuelve mañana.

        Lo que no sale es el pedido: sin botón de agregar y sin barra. Y el
        servidor lo rechaza igual, por si alguien lo intenta por su cuenta. */
    if (D.abierto === false) {
      document.body.classList.add('ct-cerrado');
      $('avisoCerrado').hidden = false;
      $('cerradoTxt').textContent = D.horario_txt
        || 'Escríbenos por el chat y te contamos cuándo abrimos.';
    }
    pintarCabecera();
    if (D.motivo === 'correccion') {
      $('avisoCorregir').hidden = false;
      cargarBorrador();
    }
    pintarCategorias();
    pintarBarra();
    $('cargando').hidden = true;
    $('app').hidden = false;

    /*  ══ AL CORREGIR, EL PEDIDO SE ABRE SOLO ═══════════════════════════
        Sergio: *"toca tocar ahi para poder verlo; es mejor que aparezca
        abierto desde el principio... de una vez ve su pedido y se va directo
        a hacer los cambios"*.

        Quien entra por el botón de corregir viene a una cosa concreta: lo
        primero que ve tiene que ser esa. Se puede cerrar como siempre.

        Solo al corregir — quien entra a pedir por primera vez tiene que ver
        la CARTA, no un pedido vacío.                                     */
    if (D.motivo === 'correccion' && pedido.length) {
      pintarCierre();
      $('velo').classList.add('on');
      $('hoja').classList.add('on');
    }
  })();

  function pintarCabecera() {
    document.title = (D.restaurante.nombre || 'Carta') + ' — Carta';
    $('restNombre').textContent = D.restaurante.nombre || '';
    /*  La sede solo si dice algo distinto del restaurante. En El Parche las
        dos se llaman igual y salia "El Parche Food / El Parche Food".   */
    /*  Debajo del nombre va el estado —"Abierto · cierra a las 10 p.m."—
        antes que la sede: al cliente le importa mas si puede pedir ahora que
        como se llama la sucursal.                                        */
    var sede = D.restaurante.sede || '';
    var abajo = D.horario_txt || ((sede && sede !== D.restaurante.nombre) ? sede : '');
    $('restSede').textContent = abajo;
    if (D.restaurante.logo) { $('logo').src = D.restaurante.logo; $('logo').hidden = false; }
    var tel = String(D.telefono || '');
    $('vinculoTxt').innerHTML = 'Tu pedido va a la conversación de <b>····'
      + esc(tel.slice(-4)) + '</b>. No tienes que registrarte.';
  }

  /*  Si vuelve a corregir, entra con lo que ya había pedido: eso es lo que
      hace que corregir sea corregir y no volver a empezar.               */
  function cargarBorrador() {
    var b = D.borrador;
    if (!b || !Array.isArray(b.productos)) return;
    b.productos.forEach(function (it) {
      var p = (D.prods || []).find(function (x) { return String(x.id) === String(it.product_id); });
      /*  ══ UN PREMIO NO SE DESCARTA POR NO ESTAR EN LA CARTA ══════════════
          Las adiciones —cinco de los catorce premios— viven en una categoría
          escondida, así que no están en `prods`. Sin esto, al corregir el
          pedido el premio DESAPARECÍA en silencio: peor que cobrarlo, porque
          cobrado al menos se ve.

          Se arma con lo que el borrador ya trae. Para enseñarlo y para volver
          a mandarlo bastan los dos identificadores y el nombre.          */
      if (!p && it.premio === true) {
        p = { id: it.product_id, n: String(it.nombre || it.product_name || 'Premio'),
              cat: String(it.categoria || ''),
              pres: [{ id: it.pres_id, n: String(it.tamano || '') }], vg: [], adic: {} };
      }
      if (!p) return;                                   // ya no está en la carta
      var vars = {};
      Object.keys(it.variantes || {}).forEach(function (gid) {
        var v = it.variantes[gid];
        if (v && v.id) vars[gid] = v.id;
      });
      var l = {
        prod: p, n: p.n, presId: it.pres_id, cant: Number(it.cantidad) || 1,
        adic: (it.adiciones || []).map(function (a) { return a.name; }),
        vars: vars, nota: it.notas || ''
      };
      /*  Un premio vale 0: no se le pregunta el precio al catálogo, que
          además puede no tenerlo si el producto está escondido.          */
      l.base = it.premio === true ? 0 : precioDe(p, l.presId, l.vars);
      if (l.base == null) return;
      l.det = (p.vg && p.vg.length) || (p.pres && p.pres.length > 1) ? detalleDe(l) : '';
      /*  ══ LO QUE SE RECLAMO CON PUNTOS SIGUE SIENDO CON PUNTOS ═══════════
          El borrador guarda cuáles líneas eran premio; sin leerlo aquí, al
          corregir se armaban todas como normales y se les volvía a poner su
          precio. El cliente gastó sus puntos y por tocar "corregir algo" se
          los cobraban en dinero.

          Los puntos se vuelven a mirar en el catálogo en vez de guardarlos:
          un número guardado se queda viejo el día que el restaurante cambia
          lo que cuesta un premio.                                        */
      if (it.premio === true) {
        var pmC = premioDeLinea(l);
        if (pmC) { l.premio = true; l.pts = pmC.pts; }
      }
      l.total = l.premio ? 0 : lineaTotal(l);
      pedido.push(l);
    });
  }

  /* ── precios: SOLO para enseñar. El servidor recalcula al guardar ───── */
  function empDe(p, presId) { return (p.emp && p.emp[presId]) || 0; }

  function precioDe(p, presId, vars) {
    var i = p.pres.findIndex(function (x) { return x.id === presId; });
    if (i < 0) return null;
    var precia = (p.vg || []).find(function (g) { return g.precia; });
    var base;
    if (precia) {
      var o = precia.ops.find(function (x) { return x.id === vars[precia.id]; });
      if (!o) return null;
      base = (o.prs && o.prs[i] != null) ? o.prs[i] : (o.prs && o.prs[0] != null ? o.prs[0] : o.p);
    } else {
      base = p.pres[i].p;
    }
    for (var k = 0; k < (p.vg || []).length; k++) {
      var g = p.vg[k];
      if (!vars[g.id]) return null;                     // falta escoger
      if (g === precia) continue;
      var op = g.ops.find(function (x) { return x.id === vars[g.id]; });
      if (op) base += op.p;
    }
    return base + empDe(p, presId);
  }

  function adicionesDe(p, presId) {
    if (presId && p.adic[presId]) return p.adic[presId];
    var k = Object.keys(p.adic || {});
    return k.length === 1 ? p.adic[k[0]] : null;
  }

  function lineaTotal(l) {
    var g = adicionesDe(l.prod, l.presId);
    var extra = !g ? 0 : l.adic.reduce(function (s, n) {
      var a = g.ops.find(function (x) { return x.n === n; });
      return s + (a ? a.p : 0);
    }, 0);
    return (l.base + extra) * l.cant;
  }

  /*  El nombre completo: CATEGORIA + producto. Los nombres de esta carta son
      adjetivos —"Sencilla", "Especial", "Premium"— y solos no dicen nada:
      "1x Sencilla" no es un pedido, es una adivinanza.

      Vive aqui y no dentro de cada pantalla porque lo enseñan tres (el
      resumen, la pantalla de puntos y el editor), y tres copias del mismo
      texto se desincronizan a la primera.                                */
  function nombreCompleto(l) {
    var cat = String((l.prod && l.prod.cat) || '').trim();
    var n = String(l.n || '').trim();
    if (!cat) return n;
    /*  Sin repetir: si el producto ya se llama como su categoría —"Bebidas ·
        QUATRO"— ponerla otra vez sobra.                                  */
    /*  Sin tildes y sin la 's' del plural: la categoría es "Adiciones" y el
        producto "Adición Salsa" — se repiten, aunque no se escriban igual. */
    var pelar = function (s) {
      return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/es\b|s\b/g, '');
    };
    if (pelar(n).indexOf(pelar(cat)) >= 0) return n;
    return cat + ' ' + n;
  }

  function detalleDe(l) {
    var d = [], i = l.prod.pres.findIndex(function (x) { return x.id === l.presId; });
    if (i >= 0 && l.prod.pres[i].n) d.push(l.prod.pres[i].n);
    (l.prod.vg || []).forEach(function (g) {
      var o = g.ops.find(function (x) { return x.id === l.vars[g.id]; });
      if (o) d.push(o.n);
    });
    if (l.adic.length) d.push('con ' + l.adic.join(', '));
    if (l.nota) d.push('«' + l.nota + '»');
    return d.join(' · ');
  }

  function hayQueEscoger(p) {
    return (p.pres.length > 1) || (p.pres.length === 1 && !!p.pres[0].n) || (p.vg && p.vg.length > 0);
  }
  function queEscoger(p) {
    if (p.pres.length > 1) return p.pres.map(function (x) { return x.n; }).join(' o ');
    if (p.vg && p.vg.length) return 'Escoge ' + String(p.vg[0].n).toLowerCase();
    return 'Escoge';
  }

  /* ── nivel 1: las categorías, todas a la vista ───────────────────────── */
  function fotoDeCat(c) {
    var p = D.prods.find(function (x) { return x.cat === c && x.f; });
    return p ? p.f : '';
  }
  function pintarCategorias() {
    var h = '<div class="ct-catgrid">';
    D.cats.forEach(function (c) {
      var n = D.prods.filter(function (p) { return p.cat === c; }).length;
      if (!n) return;
      var f = fotoDeCat(c);
      h += '<button class="ct-cat" data-cat="' + esc(c) + '">'
         + (f ? '<img src="' + esc(f) + '" alt="" loading="lazy">' : '<div style="height:92px;background:var(--panel-2)"></div>')
         + '<span class="ct-cat-pie"><span class="ct-cat-nom">' + esc(c) + '</span>'
         + '<span class="ct-cat-n">' + n + (n === 1 ? ' plato' : ' platos') + '</span></span></button>';
    });
    $('lista').innerHTML = h + '</div>';
    $('lista').scrollTop = 0;
    $('lista').querySelectorAll('[data-cat]').forEach(function (b) {
      b.onclick = function () { pintarProductos(b.dataset.cat); };
    });
  }

  /* ── nivel 2: los productos de esa categoría ─────────────────────────── */
  function pintarProductos(c) {
    var ps = D.prods.filter(function (p) { return p.cat === c; });
    var h = '<div class="ct-cab"><button class="ct-atras" id="salirCat">'
          + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
          + '</button><h3>' + esc(c) + '</h3><span class="ct-pill">' + ps.length + '</span></div>';
    ps.forEach(function (p) {
      var i = D.prods.indexOf(p);
      var pie = hayQueEscoger(p)
        ? '<span class="ct-elige">' + esc(queEscoger(p)) + '</span>'
        : '<span class="ct-precio">' + cop(p.pres[0].p + empDe(p, p.pres[0].id)) + '</span>';
      h += '<button class="ct-prod" data-i="' + i + '">'
         + (p.f ? '<img class="ct-foto" src="' + esc(p.f) + '" alt="" loading="lazy">' : '<div class="ct-foto"></div>')
         + '<div class="ct-txt"><div class="ct-pnom">' + esc(p.n) + '</div>'
         + (p.d ? '<div class="ct-pdesc">' + esc(p.d) + '</div>'
                 + '<span class="ct-lleva" data-lleva="' + i + '">'
                 + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M5 6h.01M5 12h.01M5 18h.01"/></svg>'
                 + '¿Qué lleva?</span>' : '')
         + '<div class="ct-ppie">' + pie + '</div></div><span class="ct-mas">+</span></button>';
    });
    $('lista').innerHTML = h;
    $('lista').scrollTop = 0;
    $('salirCat').onclick = pintarCategorias;
    $('lista').querySelectorAll('.ct-prod').forEach(function (b) {
      b.onclick = function () { abrirHoja(Number(b.dataset.i)); };
    });
    /*  El toque en "¿Qué lleva?" se detiene aquí: la fila entera abre el
        producto, y sin frenarlo se abrirían las dos cosas a la vez.      */
    $('lista').querySelectorAll('[data-lleva]').forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        /*  `D.prods` y no `ps`: el indice que se guarda es el de la lista
            COMPLETA, el mismo que usa `abrirHoja`. Leerlo contra la filtrada
            abria otro producto — la Doble carne enseNaba la Sencilla.    */
        verQueLleva(D.prods[Number(b.dataset.lleva)]);
      };
    });
  }

  /* ── la hoja: una pregunta por pantalla ──────────────────────────────── */
  function pasosDe(p) {
    var ps = [];
    if (p.pres.length > 1 || (p.pres.length === 1 && p.pres[0].n)) ps.push({ t: 'pres' });
    (p.vg || []).forEach(function (g, i) { ps.push({ t: 'var', i: i }); });
    if (Object.keys(p.adic || {}).length) ps.push({ t: 'adic' });
    ps.push({ t: 'fin' });
    return ps;
  }

  function abrirHoja(i) {
    if (D.abierto === false) return;    // cerrado: se mira, no se pide
    abierto = D.prods[i];
    var unaSola = abierto.pres.length === 1 && !abierto.pres[0].n;
    elegido = { cant: 1, adic: [], nota: '', vars: {}, verAdic: false,
                presId: unaSola ? abierto.pres[0].id : null, paso: 0 };
    pintarHoja();
    $('velo').classList.add('on');
    $('hoja').classList.add('on');
  }
  function cerrarHoja() {
    $('velo').classList.remove('on');
    $('hoja').classList.remove('on');
    abierto = null;
    var o = $('otra'); if (o) o.hidden = true;
  }
  $('velo').onclick = cerrarHoja;

  function avanzar() {
    var ps = pasosDe(abierto);
    elegido.paso = Math.min(elegido.paso + 1, ps.length - 1);
    if (ps[elegido.paso].t === 'adic' && !adicionesDe(abierto, elegido.presId)) elegido.paso++;
    pintarHoja();
  }
  function retroceder() {
    var ps = pasosDe(abierto);
    if (elegido.paso === 0) return cerrarHoja();
    elegido.paso--;
    if (ps[elegido.paso].t === 'adic' && !adicionesDe(abierto, elegido.presId)) elegido.paso--;
    pintarHoja();
  }

  function resumenElegido() {
    var p = abierto, d = [];
    var i = p.pres.findIndex(function (x) { return x.id === elegido.presId; });
    if (i >= 0 && p.pres[i].n) d.push(p.pres[i].n);
    (p.vg || []).forEach(function (g) {
      var o = g.ops.find(function (x) { return x.id === elegido.vars[g.id]; });
      if (o) d.push(o.n);
    });
    return d;
  }

  function pintarHoja() {
    var p = abierto, ps = pasosDe(p), paso = ps[elegido.paso], h = '';
    var ad = adicionesDe(p, elegido.presId);
    var res = resumenElegido();

    h += '<div class="ct-paso"><button class="ct-atras" id="pasoAtras">'
       + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
       + '</button><div class="ct-paso-tit"><b>' + esc(p.n) + '</b>'
       + (res.length ? '<span>' + esc(res.join(' · ')) + '</span>' : '') + '</div>'
       + (ps.length > 1 ? '<span class="ct-paso-n">' + (elegido.paso + 1) + '/' + ps.length + '</span>' : '')
       + '</div>';

    if (paso.t === 'pres') {
      if (p.f) h += '<img class="ct-hfoto" src="' + esc(p.f) + '" alt="">';
      h += '<div class="ct-preg">¿De qué tamaño?</div>';
      /*  Se toca para ver qué lleva. Con la flecha y el subrayado, porque un
          texto que hace algo al tocarlo tiene que parecer que hace algo.  */
      if (p.d) {
        h += '<div class="ct-desc"><span>' + esc(p.d) + '</span>'
           + '<button class="ct-lleva" id="verQueLleva">'
           + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M5 6h.01M5 12h.01M5 18h.01"/></svg>'
           + '¿Qué lleva?</button></div>';
      }
      var precia = (p.vg || []).some(function (g) { return g.precia; });
      p.pres.forEach(function (x) {
        h += '<button class="ct-op" data-pres="' + esc(x.id) + '" aria-pressed="'
           + (elegido.presId === x.id) + '"><span>' + esc(x.n) + '</span>'
           + '<i>' + (!precia && x.p ? cop(x.p + empDe(p, x.id)) : '') + '</i></button>';
      });

    } else if (paso.t === 'var') {
      var g = p.vg[paso.i];
      h += '<div class="ct-preg">¿Qué ' + esc(String(g.n).toLowerCase()) + '?</div>'
         + '<div class="ct-sub">Toca una opción para seguir.</div>';
      var iP = p.pres.findIndex(function (x) { return x.id === elegido.presId; });
      g.ops.forEach(function (o) {
        var extra = '';
        if (g.precia && iP >= 0 && o.prs && o.prs[iP] != null) extra = cop(o.prs[iP] + empDe(p, elegido.presId));
        else if (!g.precia && o.p) extra = '+' + cop(o.p);
        h += '<button class="ct-op" data-g="' + paso.i + '" data-op="' + esc(o.id) + '" aria-pressed="'
           + (elegido.vars[g.id] === o.id) + '"><span>' + esc(o.n) + '</span><i>' + extra + '</i></button>';
      });

    } else if (paso.t === 'adic') {
      /*  La lista no se enseña hasta que la piden: El Parche tiene once, y de
          golpe quien solo quería una salchipapa tiene que leerlas para poder
          pasar de ellas.                                                   */
      var abiertaLista = elegido.verAdic || elegido.adic.length > 0;
      h += '<div class="ct-preg">¿Le agregas algo?</div>';
      if (!abiertaLista) {
        h += '<div class="ct-sub">Es opcional.</div>'
           + '<button class="ct-op" id="verAdic"><span>Sí, quiero agregarle algo</span><i>' + ad.ops.length + '</i></button>'
           + '<button class="ct-op" id="noAdic"><span>No, así está bien</span><i>›</i></button>';
      } else {
        h += '<div class="ct-sub">Toca las que quieras.</div>';
        ad.ops.forEach(function (a) {
          h += '<button class="ct-adic" data-adic="' + esc(a.n) + '" aria-pressed="'
             + (elegido.adic.indexOf(a.n) >= 0) + '"><span>' + esc(a.n) + '</span>'
             + '<i>+' + cop(a.p) + '</i></button>';
        });
      }

    } else {
      h += '<div class="ct-preg">¿Cuántos?</div>'
         + '<div class="ct-cant" style="margin-top:12px">'
         + '<button data-cant="-1">−</button><span>' + elegido.cant + '</span><button data-cant="1">+</button></div>'
         + '<div class="ct-campo"><div class="ct-campo-tit">Nota para la cocina</div>'
         + '<textarea class="ct-nota" rows="2" placeholder="Sin cebolla, bien caliente…">' + esc(elegido.nota) + '</textarea></div>';
      if (elegido.adic.length) {
        h += '<div class="ct-campo"><div class="ct-campo-tit">Le agregaste</div>'
           + '<div style="font-size:13.5px;color:var(--tinta-2);line-height:1.5">' + esc(elegido.adic.join(', ')) + '</div></div>';
      }
    }

    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('pasoAtras').onclick = retroceder;

    /*  Tocar la respuesta YA es continuar: pedir que toque la opción y luego
        "continuar" es hacerle trabajar dos veces.                          */
    $('hojaCuerpo').querySelectorAll('[data-pres]').forEach(function (b) {
      b.onclick = function () {
        elegido.presId = b.dataset.pres;
        var ad2 = adicionesDe(abierto, elegido.presId);
        if (ad2) elegido.adic = elegido.adic.filter(function (n) {
          return ad2.ops.some(function (o) { return o.n === n; });
        });
        avanzar();
      };
    });
    $('hojaCuerpo').querySelectorAll('[data-op]').forEach(function (b) {
      b.onclick = function () {
        elegido.vars[abierto.vg[Number(b.dataset.g)].id] = b.dataset.op;
        avanzar();
      };
    });
    if ($('verQueLleva')) $('verQueLleva').onclick = function () { verQueLleva(abierto); };
    if ($('verAdic')) $('verAdic').onclick = function () { elegido.verAdic = true; pintarHoja(); };
    if ($('noAdic')) $('noAdic').onclick = avanzar;
    $('hojaCuerpo').querySelectorAll('[data-adic]').forEach(function (b) {
      b.onclick = function () {
        var n = b.dataset.adic, k = elegido.adic.indexOf(n);
        if (k >= 0) elegido.adic.splice(k, 1); else elegido.adic.push(n);
        pintarHoja();
      };
    });
    $('hojaCuerpo').querySelectorAll('[data-cant]').forEach(function (b) {
      b.onclick = function () {
        elegido.cant = Math.max(1, Math.min(20, elegido.cant + Number(b.dataset.cant)));
        pintarHoja();
      };
    });
    var ta = $('hojaCuerpo').querySelector('.ct-nota');
    if (ta) ta.oninput = function () { elegido.nota = ta.value.slice(0, 200); };

    pieDeHoja();
  }

  /*  ══ QUE LLEVA ═══════════════════════════════════════════════════════════

      Sus descripciones dicen "Base + Carne o Pollo desmechado, chorizo...".
      Ese "Base" no lo entiende nadie que no trabaje ahí.

      Aquí se parte en dos: LA BASE (lo que llevan todos los platos de esa
      categoría) y LO SUYO. Y si nadie ha escrito qué lleva la base, no se
      menciona: se enseña lo que sí sabemos. Inventar ingredientes es lo peor
      que se puede hacer en una carta — más con alergias de por medio.

      Va encima de la hoja del producto y no dentro: el cliente estaba
      escogiendo el tamaño y vuelve a lo mismo al cerrarlo.                */
  /*  Lo que el plato lleva ADEMAS de su base viene como una frase —"chorizo,
      tocineta, maicitos y ripio"— y no como lista. Se parte por las comas y
      por la "y" final para poder enseñarlo en pastillas, igual que la base.

      Es formato, no interpretación: si no se puede partir queda una sola
      pastilla, que también se lee bien.                                   */
  function enPedazos(txt) {
    return String(txt || '')
      .replace(/\.\s*$/, '')
      .split(/\s*,\s*|\s+y\s+/i)
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 1; });
  }

  function pastillas(lista, marcadas) {
    return lista.map(function (x) {
      return '<span class="ct-ing' + (marcadas ? ' ct-ing-mc' : '') + '">' + esc(x) + '</span>';
    }).join('');
  }

  /*  ══ QUÉ LLEVA ═══════════════════════════════════════════════════════════

      Diseño aprobado por Sergio: foto arriba, rótulos en versalitas,
      ingredientes en pastillas y un botón "Entendido".

      · SIN FOTO NO SE DEJA UN HUECO GRIS: el título sube a ocupar su sitio y
        la X se va al lado. Un rectángulo vacío arriba se ve peor que nada.
      · LA X SE QUEDA ADEMÁS DEL BOTÓN: sin ella hay que bajar hasta el fondo
        para salir, y con ocho ingredientes de base eso ya es un scroll.

      Va encima de la hoja del producto y no dentro: el cliente estaba
      escogiendo el tamaño y vuelve a lo mismo al cerrarlo.                */
  function verQueLleva(p) {
    var bs = (p && p.base) || null;
    /*  Se aceptan las dos formas: la de ahora —{n, ing}— y una cadena suelta.
        Una página abierta desde WhatsApp se queda guardada en el teléfono, y
        el servidor no espera a nadie.                                     */
    var ing = [], baseNom = '';
    if (typeof bs === 'string') { ing = enPedazos(bs); }
    else if (bs) { ing = (bs.ing || []).slice(); baseNom = bs.n ? String(bs.n) : ''; }

    var suyo = enPedazos(String((p && p.d) || '').replace(/^\s*base\s*\+?\s*/i, ''));
    var cuantos = ing.length + suyo.length;
    var foto = (p && p.f) || '';

    var cerrarSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var sub = [p.cat || '', cuantos ? cuantos + ' ingredientes' : ''].filter(Boolean).join(' · ');

    var h = '<div class="ct-modal-caja" role="dialog" aria-modal="true">';
    if (foto) {
      h += '<div class="ct-modal-foto" style="background-image:url(' + esc(foto) + ')">'
         + '<button class="ct-modal-x ct-sobre-foto" data-cerrar="1" aria-label="Cerrar">' + cerrarSvg + '</button>'
         + '<div class="ct-modal-titulo"><b>' + esc(p.n) + '</b>'
         + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div></div>';
    } else {
      h += '<div class="ct-modal-cab"><div class="ct-modal-titulo ct-sin-foto"><b>' + esc(p.n) + '</b>'
         + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>'
         + '<button class="ct-modal-x" data-cerrar="1" aria-label="Cerrar">' + cerrarSvg + '</button></div>';
    }

    h += '<div class="ct-modal-cuerpo">';
    if (ing.length) {
      h += '<div class="ct-rotulo">' + esc(baseNom || 'La base') + '</div>'
         + '<div class="ct-ings">' + pastillas(ing, false) + '</div>';
    }
    if (suyo.length) {
      h += '<div class="ct-rotulo ct-rotulo-mc">' + (ing.length ? 'Además lleva' : 'Lleva') + '</div>'
         + '<div class="ct-ings">' + pastillas(suyo, true) + '</div>';
    }
    if (!ing.length && !suyo.length) {
      h += '<div class="ct-modal-txt">Pregúntanos por el chat y te contamos 😊</div>';
    }
    h += '<button class="ct-btn ct-entendido" data-cerrar="1">Entendido</button></div></div>';

    var v = document.createElement('div');
    v.className = 'ct-modal';
    v.innerHTML = h;
    document.body.appendChild(v);
    var cerrar = function () { if (v.parentNode) v.parentNode.removeChild(v); };
    v.onclick = function (ev) { if (ev.target === v) cerrar(); };
    v.querySelectorAll('[data-cerrar]').forEach(function (x) { x.onclick = cerrar; });
  }

  /*  Digital = se paga antes de que el pedido salga de aquí. La billetera lo
      es tanto como la transferencia: el dinero ya está.                  */
  function esDigital(m) {
    return m.tipo === 'transferencia' || m.tipo === 'saldo' || m.tipo === 'puntos'
      || /billetera/i.test(m.n || '');
  }

  /*  ══ "ESO NO SE PUEDE, Y ESTE ES EL PORQUÉ" ═════════════════════════════

      Sergio: *"al tocar efectivo le aparezca un modal explicándole que cuando
      son pedidos para recoger se debe pagar primero por transferencia"*.

      El texto sale de la MISMA frase configurable que dice Paco en el chat
      (`frases.llevar_efectivo`). Si el restaurante la cambia, cambia en los
      dos sitios; si la escribiera aquí aparte, un día dirían cosas distintas
      y el cliente pensaría que le están cambiando las reglas.            */
  /*  Los metodos que SI sirven para recoger, dichos por su nombre. Se leen
      de los que esta pagina tiene activos —nunca escritos a mano— porque la
      Billetera es solo de El Parche y Cobra se vende a otros restaurantes.
      Los puntos no entran: no son plata, reclaman productos.             */
  function metodosQueSirven() {
    return metodos.filter(function (m) { return m.tipo !== 'puntos' && esDigital(m); })
                  .map(function (m) { return m.n; });
  }

  /*  ══ "ESO NO SE PUEDE, Y ESTE ES EL PORQUE" ═════════════════════════════

      Sergio: *"en un modal debe ir informativo"*. El chat conversa —pide
      perdon, porque hay alguien al otro lado—; un cartel no pide perdon, dice
      que hacer. Por eso este texto NO es el de Paco.

      Tres renglones, las tres preguntas de quien acaba de tocar Efectivo:
      por que no puedo, entonces con que, y que hago si quiero efectivo.  */
  function verSoloPrepago() {
    var sirven = metodosQueSirven();
    var conQue = sirven.length === 0 ? 'por transferencia'
      : sirven.length === 1 ? ('con ' + sirven[0])
      : ('con ' + sirven.slice(0, -1).join(', ') + ' o ' + sirven[sirven.length - 1]);
    var h = '<div class="ct-modal-caja" role="dialog" aria-modal="true">'
      + '<div class="ct-modal-cab"><div class="ct-modal-titulo ct-sin-foto">'
      + '<b>Para recoger, el pago va antes</b></div>'
      + '<button class="ct-modal-x" data-cerrar="1" aria-label="Cerrar">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
      + '</button></div>'
      + '<div class="ct-modal-cuerpo">'
      + '<div class="ct-modal-txt">Tu pedido se prepara ya pagado, para que lo tengas listo apenas llegues.</div>'
      + '<div class="ct-modal-txt ct-destacado">Págalo ' + esc(conQue) + '.</div>'
      + '<div class="ct-modal-txt ct-nota">¿Prefieres efectivo? Acércate al local y te lo preparamos ahí mismo.</div>'
      + '<button class="ct-btn ct-entendido" data-cerrar="1">Entendido</button></div></div>';
    var v = document.createElement('div');
    v.className = 'ct-modal';
    v.innerHTML = h;
    document.body.appendChild(v);
    var cerrar = function () { if (v.parentNode) v.parentNode.removeChild(v); };
    v.onclick = function (ev) { if (ev.target === v) cerrar(); };
    v.querySelectorAll('[data-cerrar]').forEach(function (x) { x.onclick = cerrar; });
  }

  function totalHoja() {
    var base = precioDe(abierto, elegido.presId, elegido.vars);
    if (base == null) return null;
    var ad = adicionesDe(abierto, elegido.presId);
    var extra = !ad ? 0 : elegido.adic.reduce(function (s, n) {
      var a = ad.ops.find(function (x) { return x.n === n; });
      return s + (a ? a.p : 0);
    }, 0);
    return (base + extra) * elegido.cant;
  }

  function pieDeHoja() {
    var ps = pasosDe(abierto), paso = ps[elegido.paso];
    var b = $('btnPrincipal'), pie = $('hojaPie');
    otroBoton(false);
    if (paso.t === 'pres' || paso.t === 'var') { pie.hidden = true; return; }
    pie.hidden = false;
    if (paso.t === 'adic') {
      if (!(elegido.verAdic || elegido.adic.length)) { pie.hidden = true; return; }
      b.disabled = false;
      b.innerHTML = elegido.adic.length ? 'Continuar' : 'Seguir sin adiciones';
      b.onclick = avanzar;
      return;
    }
    var t = totalHoja();
    b.disabled = (t == null);
    b.innerHTML = t == null ? 'Escoge una opción' : 'Agregar <i>' + cop(t) + '</i>';
    b.onclick = agregarAlPedido;
  }

  /*  El segundo botón del pie: se crea una vez y se enseña o se esconde. */
  function otroBoton(visible, texto, alTocar) {
    var o = $('otra');
    if (!o) {
      o = document.createElement('button');
      o.id = 'otra'; o.className = 'ct-btn2';
      $('hojaPie').appendChild(o);
    }
    o.hidden = !visible;
    if (visible) { o.textContent = texto; o.onclick = alTocar; }
  }

  function agregarAlPedido() {
    var t = totalHoja();
    if (t == null) return;
    var l = {
      prod: abierto, n: abierto.n, presId: elegido.presId,
      base: precioDe(abierto, elegido.presId, elegido.vars),
      cant: elegido.cant, adic: elegido.adic.slice(),
      vars: Object.assign({}, elegido.vars), nota: elegido.nota
    };
    l.det = detalleDe(l); l.total = lineaTotal(l);
    pedido.push(l);
    ultima = l;
    pintarBarra();
    if (trasBebida) { trasBebida = false; return pintarCierre(); }
    pintarUpsell();
  }

  /* ── el upsell: lo que el dueño configuró ────────────────────────────── */
  function ofertasPara(l) {
    var r = [];
    (D.upsell || []).forEach(function (it) {
      if (it.tipo === 'modificador') {
        if (l.adic.indexOf(it.nombre) >= 0) return;
        var g = adicionesDe(l.prod, l.presId);
        var o = g && g.ops.find(function (x) { return x.n.toLowerCase() === String(it.nombre).toLowerCase(); });
        if (o) r.push({ tipo: 'mod', n: o.n, p: o.p });
      } else if (it.tipo === 'categoria' && it.cat) {
        if (D.prods.some(function (p) { return p.cat === it.cat; })) r.push({ tipo: 'cat', n: it.cat });
      }
    });
    return r;
  }

  function pintarUpsell() {
    var of = ofertasPara(ultima);
    if (!of.length) return pintarCierre();
    var h = '<div class="ct-paso"><div class="ct-paso-tit"><b>Agregaste ' + esc(ultima.n) + '</b>'
          + '<span>' + cop(ultima.total) + '</span></div></div>'
          + '<div class="ct-preg">¿Le agregas algo más?</div><div class="ct-sub">Es opcional.</div>';
    of.forEach(function (o) {
      h += '<button class="ct-op" data-of="' + esc(o.n) + '" data-t="' + o.tipo + '">'
         + '<span>' + esc(o.n) + '</span><i>' + (o.tipo === 'mod' ? '+' + cop(o.p) : '›') + '</i></button>';
    });
    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('hojaCuerpo').querySelectorAll('[data-of]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.t === 'mod') {
          ultima.adic.push(b.dataset.of);
          ultima.total = lineaTotal(ultima);
          ultima.det = detalleDe(ultima);
          pintarBarra();
          pintarCierre();
        } else { pintarCategoriaOfrecida(b.dataset.of); }
      };
    });
    $('hojaPie').hidden = false;
    $('btnPrincipal').disabled = false;
    $('btnPrincipal').innerHTML = 'No, gracias';
    $('btnPrincipal').onclick = pintarCierre;
    otroBoton(false);
  }

  function pintarCategoriaOfrecida(cat) {
    var ps = D.prods.filter(function (p) { return p.cat === cat; });
    var h = '<div class="ct-paso"><button class="ct-atras" id="volverUps">'
          + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
          + '</button><div class="ct-paso-tit"><b>' + esc(cat) + '</b></div></div>'
          + '<div class="ct-preg">¿Cuál te provoca?</div><div class="ct-sub">Toca una para agregarla.</div>';
    ps.forEach(function (p) {
      var i = D.prods.indexOf(p);
      var pie = hayQueEscoger(p) ? esc(queEscoger(p)) : cop(p.pres[0].p + empDe(p, p.pres[0].id));
      h += '<button class="ct-op" data-beb="' + i + '"><span>' + esc(p.n) + '</span><i>' + pie + '</i></button>';
    });
    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('volverUps').onclick = pintarUpsell;
    $('hojaCuerpo').querySelectorAll('[data-beb]').forEach(function (b) {
      b.onclick = function () {
        var i = Number(b.dataset.beb), p = D.prods[i];
        /*  Si hay tamaño que escoger, se pregunta: la Coca Cola viene en 1.5
            litros y personal, y meterle la de 8.000 a quien quería la de
            5.000 es cobrarle de más.                                       */
        if (hayQueEscoger(p)) { trasBebida = true; abrirHoja(i); return; }
        var l = { prod: p, n: p.n, presId: p.pres[0].id, base: p.pres[0].p + empDe(p, p.pres[0].id),
                  cant: 1, adic: [], vars: {}, nota: '' };
        l.total = lineaTotal(l); l.det = detalleDe(l);
        pedido.push(l);
        pintarBarra();
        pintarCierre();
      };
    });
    $('hojaPie').hidden = true;
  }

  /* ── el cierre: aquí se termina, sin buscar ningún botón ─────────────── */
  function pintarCierre() {
    if (!pedido.length) return cerrarHoja();
    var h = '<div class="ct-paso"><div class="ct-paso-tit"><b>Tu pedido</b></div></div>'
          + '<div class="ct-preg">¿Es esto lo que quieres?</div>'
          + '<div class="ct-sub">Si está bien, con esto terminamos y vuelves al chat.</div>';
    pedido.forEach(function (l, i) {
      /*  La foto antes que el nombre. Los nombres de esta carta son adjetivos
          —Sencilla, Premium, Porqueso— y una foto se reconoce sin leer: es la
          misma razón por la que la carta se manda en imágenes.

          Sin foto se deja el contador de siempre; un hueco gris quedaría peor
          que el número.                                                   */
      var foto = (l.prod && l.prod.f) || '';
      h += '<div class="ct-item">'
         + (foto
             ? '<img class="ct-item-foto" src="' + esc(foto) + '" alt="" loading="lazy">'
             : '<span class="ct-item-n">' + l.cant + '</span>')
         + '<div class="ct-item-t"><div class="ct-item-nom">'
         + (foto && l.cant > 1 ? l.cant + 'x ' : '') + esc(nombreCompleto(l)) + '</div>'
         + (l.det ? '<div class="ct-item-det">' + esc(l.det) + '</div>' : '')
         /*  Editar primero: es lo que casi siempre se quiere. Quitar va
             despues y en gris, para que no sea la salida facil.          */
         + '<div class="ct-lineabtn"><button class="ct-editar" data-e="' + i + '">Editar</button>'
         + '<button class="ct-quitar" data-q="' + i + '">Quitar</button></div></div>'
         + '<div class="ct-item-p">' + (l.premio ? '<span class="ct-conpuntos">' + (l.pts || 0) + ' pts</span>' : cop(l.total)) + '</div></div>';
    });
    h += '<div class="ct-total"><span>Total</span><i>' + cop(totalPedido()) + '</i></div>';
    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('hojaCuerpo').querySelectorAll('[data-e]').forEach(function (b) {
      b.onclick = function () { abrirEditar(Number(b.dataset.e)); };
    });
    $('hojaCuerpo').querySelectorAll('[data-q]').forEach(function (b) {
      b.onclick = function () {
        pedido.splice(Number(b.dataset.q), 1);
        pintarBarra();
        if (!pedido.length) return cerrarHoja();
        pintarCierre();
      };
    });
    $('hojaPie').hidden = false;
    $('btnPrincipal').disabled = false;
    $('btnPrincipal').innerHTML = 'Sí, terminar mi pedido';
    $('btnPrincipal').onclick = function () { cerrarHoja(); irAEntrega(); };
    otroBoton(true, 'Seguir pidiendo', cerrarHoja);
  }

  /*  == EDITAR UNA LINEA DEL PEDIDO ========================================

      Sergio, probando la correccion: *"me da la opcion de quitar la
      salchipapa entera pero solo quiero quitar la adicion... un cliente asi se
      enredaria demasiado"*.

      Aqui se ve TODO lo de ese producto de una vez -tamano, tipo, adiciones,
      cantidad y nota- y se toca solo lo que se quiere cambiar.

      Va todo junto y no por pasos, al reves que al agregar: no es una
      incoherencia, son dos tareas distintas. Quien agrega va decidiendo y se
      le guia de a una; quien corrige YA SABE a que vino, y pasarlo por cuatro
      pantallas para cambiar una salsa es justo lo que Sergio senala.

      Usa el MISMO estado que el paso a paso (`abierto` + `elegido`), asi que
      el precio, el empaque y las adiciones por tamano salen de las mismas
      funciones. Dos juegos de cuentas serian dos sitios donde equivocarse. */
  function abrirEditar(idx) {
    var l = pedido[idx];
    if (!l) return;
    abierto = l.prod;
    elegido = {
      cant: l.cant, adic: (l.adic || []).slice(), nota: l.nota || '',
      vars: Object.assign({}, l.vars), presId: l.presId,
      verAdic: true, paso: 0, editIdx: idx
    };
    pintarEditar();
    $('velo').classList.add('on');
    $('hoja').classList.add('on');
  }

  function pintarEditar() {
    var p = abierto, h = '';
    var ad = adicionesDe(p, elegido.presId);
    var res = resumenElegido();

    h += '<div class="ct-paso"><button class="ct-atras" id="pasoAtras">'
       + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
       + '</button><div class="ct-paso-tit"><b>' + esc(p.n) + '</b>'
       + (res.length ? '<span>' + esc(res.join(' \u00b7 ')) + '</span>' : '') + '</div></div>'
       + '<div class="ct-preg">Cambia lo que quieras</div>'
       + '<div class="ct-sub">Toca solo lo que quieres cambiar. Lo dem\u00e1s se queda igual.</div>';

    /*  Tamano. Si el producto viene de una sola forma no hay nada que
        escoger y la seccion sobra.                                       */
    if (p.pres.length > 1) {
      var precia = (p.vg || []).some(function (g) { return g.precia; });
      h += '<div class="ct-campo"><div class="ct-campo-tit">Tama\u00f1o</div></div>';
      p.pres.forEach(function (x) {
        h += '<button class="ct-op" data-epres="' + esc(x.id) + '" aria-pressed="'
           + (elegido.presId === x.id) + '"><span>' + esc(x.n) + '</span>'
           + '<i>' + (!precia && x.p ? cop(x.p + empDe(p, x.id)) : '') + '</i></button>';
      });
    }

    /*  Un bloque por grupo de variantes: la SUPER QUESO tiene dos, y los dos
        se tienen que poder cambiar.                                      */
    var iP = p.pres.findIndex(function (x) { return x.id === elegido.presId; });
    (p.vg || []).forEach(function (g, gi) {
      h += '<div class="ct-campo"><div class="ct-campo-tit">' + esc(g.n) + '</div></div>';
      g.ops.forEach(function (o) {
        var extra = '';
        if (g.precia && iP >= 0 && o.prs && o.prs[iP] != null) extra = cop(o.prs[iP] + empDe(p, elegido.presId));
        else if (!g.precia && o.p) extra = '+' + cop(o.p);
        h += '<button class="ct-op" data-eg="' + gi + '" data-eop="' + esc(o.id) + '" aria-pressed="'
           + (elegido.vars[g.id] === o.id) + '"><span>' + esc(o.n) + '</span><i>' + extra + '</i></button>';
      });
    });

    /*  Las adiciones SIEMPRE abiertas aqui: quitar la que tiene, o cambiarla
        por otra, es de las cosas que mas se vienen a hacer. Esconderlas
        detras de "quieres agregar algo?" seria el mismo enredo de antes.  */
    if (ad) {
      h += '<div class="ct-campo"><div class="ct-campo-tit">Adiciones</div></div>';
      ad.ops.forEach(function (a) {
        h += '<button class="ct-adic" data-adic="' + esc(a.n) + '" aria-pressed="'
           + (elegido.adic.indexOf(a.n) >= 0) + '"><span>' + esc(a.n) + '</span>'
           + '<i>+' + cop(a.p) + '</i></button>';
      });
    }

    h += '<div class="ct-campo"><div class="ct-campo-tit">Cantidad</div>'
       + '<div class="ct-cant"><button data-cant="-1">\u2212</button><span>' + elegido.cant
       + '</span><button data-cant="1">+</button></div></div>'
       + '<div class="ct-campo"><div class="ct-campo-tit">Nota para la cocina</div>'
       + '<textarea class="ct-nota" rows="2" placeholder="Sin cebolla, bien caliente\u2026">'
       + esc(elegido.nota) + '</textarea></div>';

    $('hojaCuerpo').innerHTML = h;
    $('pasoAtras').onclick = pintarCierre;

    $('hojaCuerpo').querySelectorAll('[data-epres]').forEach(function (btn) {
      btn.onclick = function () {
        elegido.presId = btn.dataset.epres;
        /*  Cambiar de tamano puede dejar sin sentido una adicion que solo
            existe en el otro: se quita en vez de cobrarla igual.        */
        var ad2 = adicionesDe(abierto, elegido.presId);
        elegido.adic = !ad2 ? [] : elegido.adic.filter(function (n) {
          return ad2.ops.some(function (o) { return o.n === n; });
        });
        pintarEditar();
      };
    });
    $('hojaCuerpo').querySelectorAll('[data-eop]').forEach(function (btn) {
      btn.onclick = function () {
        elegido.vars[abierto.vg[Number(btn.dataset.eg)].id] = btn.dataset.eop;
        pintarEditar();
      };
    });
    $('hojaCuerpo').querySelectorAll('[data-adic]').forEach(function (btn) {
      btn.onclick = function () {
        var n = btn.dataset.adic, k = elegido.adic.indexOf(n);
        if (k >= 0) elegido.adic.splice(k, 1); else elegido.adic.push(n);
        pintarEditar();
      };
    });
    $('hojaCuerpo').querySelectorAll('[data-cant]').forEach(function (btn) {
      btn.onclick = function () {
        elegido.cant = Math.max(1, Math.min(20, elegido.cant + Number(btn.dataset.cant)));
        pintarEditar();
      };
    });
    var ta = $('hojaCuerpo').querySelector('.ct-nota');
    if (ta) ta.oninput = function () { elegido.nota = ta.value.slice(0, 200); };

    var t = totalHoja();
    $('hojaPie').hidden = false;
    $('btnPrincipal').disabled = (t == null);
    $('btnPrincipal').innerHTML = t == null ? 'Escoge una opci\u00f3n' : 'Guardar <i>' + cop(t) + '</i>';
    $('btnPrincipal').onclick = guardarEdicion;
    otroBoton(true, 'Quitar del pedido', function () {
      pedido.splice(elegido.editIdx, 1);
      pintarBarra();
      if (!pedido.length) return cerrarHoja();
      pintarCierre();
    });
  }

  function guardarEdicion() {
    var t = totalHoja();
    if (t == null) return;
    var l = pedido[elegido.editIdx];
    if (!l) return pintarCierre();
    l.presId = elegido.presId;
    l.vars   = Object.assign({}, elegido.vars);
    l.adic   = elegido.adic.slice();
    l.cant   = elegido.cant;
    l.nota   = elegido.nota;
    /*  El precio se rehace desde los identificadores, nunca se ajusta el
        anterior: es la misma regla que usa el servidor al guardar.      */
    l.base   = precioDe(abierto, elegido.presId, elegido.vars);
    l.det    = detalleDe(l);
    l.total  = lineaTotal(l);
    pintarBarra();
    pintarCierre();
  }

  /* ── la barra ────────────────────────────────────────────────────────── */
  function totalPedido() { return pedido.reduce(function (s, x) { return s + x.total; }, 0); }
  function pintarBarra() {
    $('barra').hidden = !pedido.length;
    $('barraN').textContent = pedido.reduce(function (s, x) { return s + x.cant; }, 0);
    $('barraTot').textContent = cop(totalPedido());
  }
  $('barra').onclick = function () {
    pintarCierre();
    $('velo').classList.add('on');
    $('hoja').classList.add('on');
  };

  /*  Los iconos de la entrega. De trazo, como los del pago, para que la
      pantalla no cambie de idioma a mitad del pedido.                     */
  var ICONO_ENT = {
    moto: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M8.5 17.5h7M14 6h3l2.5 6M5.5 14.5 9 8h5"/></svg>',
    bolsa: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    pin: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    mapa: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z"/><path d="M9 3v15M15 6v15"/></svg>',
    lapiz: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };
  var FONDO_ENT = {
    moto:  'linear-gradient(140deg,#D8452F,#A8301F)',
    bolsa: 'linear-gradient(140deg,#1F8F5F,#116B44)',
    pin:   'linear-gradient(140deg,#5B6BFF,#3F4BD6)',
    mapa:  'linear-gradient(140deg,#3A3F5C,#22263B)',
    lapiz: 'linear-gradient(140deg,#E0A32B,#B87A12)'
  };
  /*  Un boton de entrega con la cara de los de pago: icono, titulo y la
      linea que explica. `id` o `data` segun quien lo necesite.            */
  function botonEnt(icono, titulo, sub, attr) {
    return '<button class="ct-pago" ' + attr + '>'
      + '<span class="ct-pago-ic" style="background:' + FONDO_ENT[icono] + '">'
      + ICONO_ENT[icono] + '</span>'
      + '<span><b>' + esc(titulo) + '</b>'
      + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span></button>';
  }

  /* ── a dónde va el pedido ────────────────────────────────────────────── */

  /*  La cabecera de estas pantallas: el mismo hueso que la hoja del producto,
      para que no parezca otra aplicación a mitad del pedido.              */
  function cabEntrega(titulo, atras) {
    return '<div class="ct-paso">'
      + (atras ? '<button class="ct-atras" id="entAtras">'
          + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
          + '</button>' : '')
      + '<div class="ct-paso-tit"><b>' + esc(titulo) + '</b></div></div>';
  }

  function abrirEntrega(html, alAtras) {
    $('hojaCuerpo').innerHTML = html;
    $('hojaCuerpo').scrollTop = 0;
    if ($('entAtras')) $('entAtras').onclick = alAtras;
    $('velo').classList.add('on');
    $('hoja').classList.add('on');
  }

  /*  1. ¿Domicilio o lo recoge?
      Un restaurante que no hace domicilios no ve esta pantalla: se va derecho
      al pago. Cobra se vende a otros, y esto no puede dar por hecho que todos
      llevan a domicilio.                                                   */
  function irAEntrega() {
    if (D.domicilios === false) { entrega.modo = 'recoger'; return irAlPago(); }
    var h = cabEntrega('Tu pedido', function () { pintarCierre(); })
      + '<div class="ct-preg">¿Cómo lo quieres?</div>'
      + '<div class="ct-sub">Toca una opción para seguir.</div>'
      + botonEnt('moto', 'Domicilio', 'Te lo llevamos a donde estés', 'data-ent="domicilio"')
      + botonEnt('bolsa', 'Yo lo recojo', 'Pasas por él cuando esté listo', 'data-ent="recoger"');
    abrirEntrega(h, function () { pintarCierre(); });
    $('hojaPie').hidden = true;
    otroBoton(false);
    $('hojaCuerpo').querySelectorAll('[data-ent]').forEach(function (btn) {
      btn.onclick = function () {
        entrega.modo = btn.dataset.ent;
        if (entrega.modo === 'recoger') {
          entrega.barrio = entrega.direccion = entrega.conjunto = entrega.unidad = '';
          entrega.domi = 0; entrega.conocida = true;
          cerrarHoja(); return irAlPago();
        }
        var g = D.cliente && D.cliente.direccion;
        if (g && g.direccion) return irADireccionGuardada(g);
        irADireccionNueva();
      };
    });
  }

  /*  2. La de siempre, de un toque.
      Hoy la tienen 147 de 303 clientes, y cada pedido por aquí suma uno más.
      SIN precio a la vista: el domicilio se ve una sola vez, ya sumado, en el
      pago. Regla de Sergio.                                               */
  function irADireccionGuardada(g) {
    var linea = [g.direccion, g.barrio].filter(Boolean).join(', ');
    var h = cabEntrega('Tu pedido', irAEntrega)
      + '<div class="ct-preg">¿Va para tu dirección de siempre?</div>'
      + '<div class="ct-dir-guardada">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>'
      + '<span>' + esc(linea) + '</span></div>'
      + botonEnt('pin', 'Sí, para allá', 'La de siempre', 'id="dirSi"')
      + botonEnt('mapa', 'Otra dirección', 'Escoge otra o escribe una nueva', 'id="dirOtra"');
    abrirEntrega(h, irAEntrega);
    $('hojaPie').hidden = true;
    otroBoton(false);
    $('dirSi').onclick = function () {
      /*  Se manda LA LINEA COMPLETA, la misma que acaba de leer y aprobar.
          Su ficha puede tener la casa guardada en el campo del barrio —la de
          Sergio la tiene—, y mandando solo el campo "dirección" el motor ve un
          conjunto sin unidad y vuelve a preguntar algo que el cliente ya
          contestó. Lo que confirmó es la línea, no una de sus mitades.    */
      entrega.direccion = linea;
      entrega.barrio = g.barrio || '';
      entrega.conjunto = ''; entrega.unidad = '';
      cotizarYSeguir();
    };
    $('dirOtra').onclick = irAOtrasDirecciones;
  }

  /*  2-bis. Sus OTRAS direcciones.
      Sergio: *"si dice otra dirección, le aparecerá la lista de direcciones
      que tiene y podrá escoger cualquiera"*.

      Quien no tenga ninguna guardada no ve esta pantalla: se va derecho a
      escribirla. Una pantalla con una sola opción es un toque de más.     */
  function irAOtrasDirecciones() {
    var otras = (D.cliente && D.cliente.direcciones) || [];
    if (!otras.length) return irADireccionNueva();
    var h = cabEntrega('Tu pedido', irAEntrega)
      + '<div class="ct-preg">¿A cuál de tus direcciones?</div>'
      + '<div class="ct-sub">O escribe una nueva.</div>';
    otras.forEach(function (d, i) {
      var linea = [d.direccion, d.barrio].filter(Boolean).join(', ');
      h += botonEnt('pin', linea, d.barrio ? '' : 'Guardada', 'data-otra="' + i + '"');
    });
    h += '<div style="height:6px"></div>'
       + botonEnt('lapiz', 'Escribir una nueva', 'Casa, apartamento o conjunto', 'id="dirNueva"');
    abrirEntrega(h, irAEntrega);
    $('hojaPie').hidden = true;
    otroBoton(false);
    $('hojaCuerpo').querySelectorAll('[data-otra]').forEach(function (btn) {
      btn.onclick = function () {
        var d = otras[Number(btn.dataset.otra)];
        /*  Se manda la línea completa, igual que con la de siempre: es lo que
            el cliente acaba de leer y aprobar, y su ficha puede tener la casa
            guardada en el campo del barrio.                              */
        entrega.direccion = [d.direccion, d.barrio].filter(Boolean).join(', ');
        entrega.barrio = d.barrio || '';
        entrega.conjunto = ''; entrega.unidad = '';
        cotizarYSeguir();
      };
    });
    $('dirNueva').onclick = irADireccionNueva;
  }

  /*  3. Una dirección nueva.
      Casa normal: barrio y dirección, los dos obligatorios.
      Conjunto: nombre y casa/apto obligatorios; barrio y dirección opcionales.

      La regla, dicha una sola vez: es obligatorio el campo QUE ENCUENTRA LA
      ZONA. Con 68 conjuntos configurados, el nombre del conjunto ya da el
      precio y por eso ahí el barrio sobra; en una casa normal el barrio es lo
      único que la encuentra.                                              */
  var tipoDir = 'casa';
  function irADireccionNueva() {
    var esConj = tipoDir === 'conjunto';
    /*  Atrás vuelve a la lista si tiene otras, y si no, a la entrega. Volver
        siempre al principio obliga a rehacer el camino.                  */
    var atras = ((D.cliente && D.cliente.direcciones) || []).length
      ? irAOtrasDirecciones : irAEntrega;
    var h = cabEntrega('Tu pedido', atras)
      + '<div class="ct-preg">¿Para dónde va?</div>'
      + '<div class="ct-seg">'
      + '<button data-tipo="casa" aria-pressed="' + (!esConj) + '">Casa normal</button>'
      + '<button data-tipo="conjunto" aria-pressed="' + esConj + '">Conjunto</button>'
      + '</div>';

    if (esConj) {
      h += campo('Nombre del conjunto', 'conjunto', entrega.conjunto, 'Balmoral', true)
         + campo('Casa o apartamento', 'unidad', entrega.unidad, 'Casa 21', true)
         + campo('Barrio', 'barrio', entrega.barrio, '', false)
         + campo('Dirección', 'direccion', entrega.direccion, '', false);
    } else {
      h += campo('Barrio', 'barrio', entrega.barrio, 'Bella Vista', true)
         + campo('Dirección', 'direccion', entrega.direccion, 'Carrera 9b # 63-58', true);
    }
    abrirEntrega(h, atras);

    $('hojaCuerpo').querySelectorAll('[data-tipo]').forEach(function (btn) {
      btn.onclick = function () { tipoDir = btn.dataset.tipo; irADireccionNueva(); };
    });
    $('hojaCuerpo').querySelectorAll('[data-campo]').forEach(function (inp) {
      inp.oninput = function () {
        entrega[inp.dataset.campo] = inp.value.slice(0, 120);
        revisarDir();
      };
    });
    $('hojaPie').hidden = false;
    otroBoton(false);
    $('btnPrincipal').innerHTML = 'Continuar';
    $('btnPrincipal').onclick = cotizarYSeguir;
    revisarDir();
  }

  function campo(rotulo, id, valor, ejemplo, obligatorio) {
    return '<div class="ct-campo"><div class="ct-campo-tit">' + esc(rotulo)
      + (obligatorio ? '' : ' <span class="ct-opcional">(opcional)</span>') + '</div>'
      + '<input class="ct-input" data-campo="' + id + '" value="' + esc(valor) + '"'
      + ' placeholder="' + esc(ejemplo) + '" autocomplete="off"></div>';
  }

  /*  Solo se deja seguir con lo que hace falta para saber a dónde va. Nada
      más: cada campo obligatorio de sobra es una persona que se va.       */
  function dirCompleta() {
    if (tipoDir === 'conjunto') {
      return !!(String(entrega.conjunto).trim() && String(entrega.unidad).trim());
    }
    return !!(String(entrega.barrio).trim() && String(entrega.direccion).trim());
  }
  function revisarDir() { $('btnPrincipal').disabled = !dirCompleta(); }

  /*  El precio lo dice el SERVIDOR. Aquí no se calcula ni se guarda la tabla de
      zonas: además de que la plata la decide el servidor, los precios de
      domicilio de un restaurante no tienen por qué quedar a la vista de
      cualquiera que abra la página.

      Si la consulta falla no se frena el pedido: se sigue sin precio, que es
      exactamente lo que pasa hoy con un barrio que no conocemos.          */
  async function cotizarYSeguir() {
    var b = $('btnPrincipal');
    if (!$('hojaPie').hidden) { b.disabled = true; b.textContent = 'Un momento…'; }
    try {
      var r = await llamar({
        action: 'cotizar', barrio: entrega.barrio, direccion: entrega.direccion,
        conjunto: entrega.conjunto, unidad: entrega.unidad
      });
      entrega.domi = Number(r.domicilio) || 0;
      entrega.conocida = r.conocida === true;
    } catch (e) {
      entrega.domi = 0; entrega.conocida = false;
    }
    cerrarHoja();
    irAlPago();
  }

  /* ── el pago: los medios del restaurante ─────────────────────────────── */
  var ICONO = {
    efectivo: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M5.5 9.5h.01M18.5 14.5h.01"/></svg>',
    transferencia: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><path d="M14 14h3v3h-3zM20 20h1M17 20v1M20 14h1v3"/></svg>',
    puntos: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8z"/></svg>',
    saldo: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>'
  };
  var FONDO = {
    efectivo: 'linear-gradient(140deg,#1F8F5F,#116B44)',
    transferencia: 'linear-gradient(140deg,#3A3F5C,#22263B)',
    puntos: 'linear-gradient(140deg,#E0A32B,#B87A12)',
    saldo: 'linear-gradient(140deg,#5B6BFF,#3F4BD6)'
  };
  var PIE = {
    efectivo: 'Pagas al recibir',
    transferencia: 'Te mandamos los datos por el chat',
    puntos: 'Reclama con tus puntos',
    saldo: 'Con el saldo de tu cuenta'
  };

  /*  Los puntos que ya comprometió en este pedido. Se calculan sumando las
      líneas marcadas como premio: así no hay un contador aparte que se pueda
      desincronizar con lo que de verdad hay en el carrito.               */
  function puntosUsados() {
    return pedido.reduce(function (s, l) { return s + (l.premio ? (l.pts || 0) * l.cant : 0); }, 0);
  }
  function puntosLibres() {
    return ((D.cliente && D.cliente.puntos) || 0) - puntosUsados();
  }
  function premiosQueAlcanzan() {
    var p = puntosLibres();
    return (D.premios || []).filter(function (x) { return x.pts <= p; });
  }

  var metodos = [];
  function irAlPago() {
    /*  Solo se ofrece lo que de verdad sirve. Ofrecer puntos a quien no le
        alcanza es una decepción justo al pagar.                           */
    metodos = (D.pagos || []).filter(function (m) {
      var esSaldo = m.tipo === 'saldo' || /billetera/i.test(m.n || '');
      /*  Se enseNa si alcanza para algo O si ya reclamó: sin lo segundo, quien
          gasta casi todos sus puntos se queda sin cómo deshacerlo.       */
      if (m.tipo === 'puntos') return premiosQueAlcanzan().length > 0 || puntosUsados() > 0;
      if (esSaldo) return ((D.cliente && D.cliente.saldo) || 0) > 0;
      return true;
    });
    var h = '';
    metodos.forEach(function (m, i) {
      var t = (m.tipo === 'saldo' || /billetera/i.test(m.n || '')) ? 'saldo' : m.tipo;
      var ic = '<span class="ct-pago-ic" style="background:' + (FONDO[t] || FONDO.efectivo) + '">'
             + (ICONO[t] || ICONO.efectivo) + '</span>';
      var sub = PIE[t] || '';
      /*  Se dice ANTES de tocarlo. Que lo descubra al tocar es correcto; que
          lo sepa sin tocar es mejor.                                     */
      if (entrega.modo === 'recoger' && D.llevar_prepago !== false && !esDigital(m)) {
        sub = 'Para recoger, el pago va antes';
      }
      if (m.tipo === 'puntos') {
        var uso = puntosUsados();
        sub = uso > 0 ? ('Vas a usar ' + uso + ' puntos · toca para cambiar')
                      : ('Tienes ' + ((D.cliente && D.cliente.puntos) || 0) + ' puntos');
      }
      if (t === 'transferencia' && m.banco) sub = 'Te mandamos los datos de ' + esc(m.banco) + ' por el chat';
      h += '<button class="ct-pago" data-i="' + i + '">' + ic
         + '<span><b>' + esc(m.n) + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</span></button>';
    });
    if (D.empaque_activo) {
      h += '<div class="ct-pago-nota"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;margin-top:2px"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>'
         + '<span>Los precios ya incluyen el empaque. Lo que ves es lo que pagas.</span></div>';
    }
    $('pagoLista').innerHTML = h;
    $('pagoLista').querySelectorAll('[data-i]').forEach(function (b) {
      b.onclick = function () {
        var m = metodos[Number(b.dataset.i)];
        /*  ══ PARA RECOGER SE PAGA ANTES ═══════════════════════════════════
            Regla del restaurante, la misma que Paco aplica en el chat. No se
            esconde el efectivo: se explica. Esconderlo dejaría al cliente
            buscando algo que no está y sin saber por qué.               */
        if (entrega.modo === 'recoger' && D.llevar_prepago !== false && !esDigital(m)) {
          verSoloPrepago();
          return;
        }
        if (m.tipo === 'saldo' || /billetera/i.test(m.n || '')) { $('vPago').hidden = true; abrirPanel(verSaldo); return; }
        /*  Puntos NO es un método de pago: es un paso. Se abre su pantalla y
            al volver hay que escoger con qué se paga el resto.           */
        if (m.tipo === 'puntos') { $('vPago').hidden = true; abrirPanel(verPuntos); return; }
        $('pagoLista').querySelectorAll('[data-i]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        pagoElegido = { n: m.n, id: m.id, tipo: m.tipo };
        $('btnEnviar').disabled = false;
      };
    });
    /*  ══ EL DESGLOSE, LA UNICA VEZ QUE SE VE EL DOMICILIO ═════════════
        Aquí sí, porque aquí es donde el cliente decide con cuánto paga. Y si
        no conocemos su zona no se inventa un número: se le dice que se lo
        confirmamos por el chat, que es justo lo que va a pasar.          */
    var cuerpoTot = '';
    var ptsUsados = puntosUsados();
    if (ptsUsados > 0) {
      cuerpoTot += '<div class="ct-linea"><span>Con tus puntos</span><i>' + ptsUsados + ' pts</i></div>';
    }
    if (entrega.modo === 'domicilio') {
      cuerpoTot = '<div class="ct-linea"><span>Productos</span><i>' + cop(totalPedido()) + '</i></div>'
        + '<div class="ct-linea"><span>Domicilio</span><i>'
        + (entrega.conocida ? cop(entrega.domi) : '<em>te lo confirmamos por el chat</em>')
        + '</i></div>';
    }
    $('pagoDesglose').innerHTML = cuerpoTot;
    $('totPago').textContent = cop(totalPedido() + (entrega.conocida ? entrega.domi : 0));
    $('btnEnviar').disabled = true;
    $('vPago').hidden = false;
  }
  $('pagoAtras').onclick = function () { $('vPago').hidden = true; irAEntrega(); };

  function abrirPanel(pinta) {
    abierto = null;
    pinta();
    $('velo').classList.add('on');
    $('hoja').classList.add('on');
  }

  /*  El saldo: se INFORMA, no se gasta. Y no se promete un total, porque el
      domicilio todavía no existe — la dirección la pregunta Paco después.  */
  function verSaldo() {
    var saldo = (D.cliente && D.cliente.saldo) || 0;
    var total = totalPedido();
    var cubre = Math.min(saldo, total);
    var falta = Math.max(0, total - saldo);
    var h = '<div class="ct-paso"><button class="ct-atras" id="volverPago">'
          + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
          + '</button><div class="ct-paso-tit"><b>Tu saldo</b></div></div>'
          + '<div class="ct-preg">Tienes ' + cop(saldo) + '</div>'
          + '<div class="ct-sub">' + (falta === 0 ? 'Cubre <b>todos tus productos</b>.' : 'Cubre una parte de tu pedido.') + '</div>'
          + '<div class="ct-cuenta">'
          + '<div class="ct-fila"><span>Tu pedido</span><i>' + cop(total) + '</i></div>'
          + '<div class="ct-fila"><span>Pagas con tu saldo</span><i class="ok">− ' + cop(cubre) + '</i></div>'
          + '<div class="ct-fila fuerte"><span>Queda por pagar</span><i>' + cop(falta) + '</i></div>'
          + '<div class="ct-nota-chica">Más el domicilio, si lo pides. Te confirmamos el total en el chat.</div>'
          + '</div>';
    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('volverPago').onclick = function () { cerrarHoja(); irAlPago(); };
    $('hojaPie').hidden = false;
    $('btnPrincipal').disabled = false;
    $('btnPrincipal').innerHTML = 'Usar mi saldo · ' + cop(cubre);
    $('btnPrincipal').onclick = function () {
      var m = (D.pagos || []).find(function (x) { return x.tipo === 'saldo' || /billetera/i.test(x.n || ''); });
      pagoElegido = { n: m ? m.n : 'Saldo', id: m ? m.id : '', tipo: 'saldo', cubre: cubre, falta: falta };
      cerrarHoja();
      enviar();
    };
    otroBoton(true, 'Mejor pago de otra forma', function () { cerrarHoja(); irAlPago(); });
  }

  /*  Los puntos canjean premios, no pagan el pedido. */
  /*  ══ TUS PUNTOS ═══════════════════════════════════════════════════════

      Los puntos NO pagan la cuenta: reclaman productos. Casi nunca alcanzan
      para el pedido entero, y tratarlos como si lo pagaran era el error de
      fondo — se mandaba el pedido sin saber con qué se paga el resto.

      Dos caminos, los que pidió Sergio:
        · lo que YA pediste y se puede reclamar  -> esa línea pasa a $0
        · si no hay nada, el catálogo             -> se añade al pedido gratis

      Y al salir, el método de pago sigue siendo obligatorio.             */

  /*  ¿Esta línea del carrito es uno de los premios? Se cruza por PRODUCTO y
      PRESENTACIÓN, nunca por el nombre: el nombre del premio se compone para
      que se lea bonito ("Adición Salsa · Ajo") y compararlo sería comparar
      texto, que es justo lo que aquí no se hace.                         */
  function premioDeLinea(l) {
    return (D.premios || []).find(function (x) {
      if (String(x.pid || '') !== String(l.prod.id)) return false;
      var pres = (l.prod.pres.find(function (y) { return y.id === l.presId; }) || {}).n || '';
      return String(x.pres || '').trim().toLowerCase() === String(pres).trim().toLowerCase();
    });
  }

  function verPuntos() {
    var pts = (D.cliente && D.cliente.puntos) || 0;
    var libres = puntosLibres();

    /*  De lo que ya pidió, lo que se puede reclamar y todavía no reclamó. */
    var enElPedido = [];
    pedido.forEach(function (l, i) {
      if (l.premio) return;
      var pm = premioDeLinea(l);
      if (pm && pm.pts <= libres) enElPedido.push({ i: i, l: l, pm: pm });
    });

    var h = '<div class="ct-paso"><button class="ct-atras" id="volverPago2">'
          + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
          + '</button><div class="ct-paso-tit"><b>Tus puntos</b>'
          + '<span>' + libres + ' de ' + pts + ' disponibles</span></div></div>';

    /*  Lo que ya reclamó, para que vea en qué se le fueron los puntos. */
    var yaHay = pedido.some(function (l) { return l.premio; });
    if (yaHay) {
      h += '<div class="ct-campo"><div class="ct-campo-tit">Ya vas a reclamar</div></div>';
      pedido.forEach(function (l, i) {
        if (!l.premio) return;
        h += '<button class="ct-adic" data-quitarpremio="' + i + '" aria-pressed="true">'
           + '<span>' + esc(nombreCompleto(l)) + (l.det ? ' · ' + esc(l.det) : '') + '</span>'
           + '<i>' + ((l.pts || 0) * l.cant) + ' pts</i></button>';
      });
    }

    if (enElPedido.length) {
      h += '<div class="ct-campo"><div class="ct-campo-tit">De lo que pediste</div></div>';
      enElPedido.forEach(function (x) {
        h += '<button class="ct-op" data-cobrar="' + x.i + '">'
           + '<span>' + esc(nombreCompleto(x.l)) + (x.l.det ? ' · ' + esc(x.l.det) : '') + '</span>'
           + '<i>' + x.pm.pts + ' pts</i></button>';
      });
    } else if (!yaHay) {
      h += '<div class="ct-sub" style="margin-top:14px">Ninguno de los productos que pediste se puede reclamar con puntos.</div>';
    }

    /*  El catálogo, siempre a un toque. Aunque algo de su pedido califique,
        puede preferir otra cosa — no somos quién para decidírselo.       */
    var puede = premiosQueAlcanzan();
    if (puede.length) {
      h += '<button class="ct-op" id="verCatalogo" style="margin-top:14px">'
         + '<span>Ver lo que puedo reclamar</span><i>' + puede.length + '</i></button>';
    } else {
      var sigue = (D.premios || []).filter(function (x) { return x.pts > libres; })
                    .sort(function (a, c) { return a.pts - c.pts; })[0];
      if (sigue) {
        h += '<div class="ct-nota-chica" style="margin-top:14px">Con ' + (sigue.pts - libres)
           + ' puntos más puedes reclamar ' + esc(sigue.n) + '.</div>';
      }
    }

    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('volverPago2').onclick = function () { cerrarHoja(); irAlPago(); };

    /*  Reclamar algo que ya está en el pedido: esa línea pasa a $0. No se
        añade otra igual — el cliente pidió una, no dos.                  */
    $('hojaCuerpo').querySelectorAll('[data-cobrar]').forEach(function (btn) {
      btn.onclick = function () {
        var l = pedido[Number(btn.dataset.cobrar)];
        var pm = premioDeLinea(l);
        if (!pm || pm.pts > puntosLibres()) return;
        l.premio = true; l.pts = pm.pts; l.total = 0;
        pintarBarra(); verPuntos();
      };
    });

    /*  Y quitarlo: los puntos vuelven y la línea recupera su precio. */
    $('hojaCuerpo').querySelectorAll('[data-quitarpremio]').forEach(function (btn) {
      btn.onclick = function () {
        var i = Number(btn.dataset.quitarpremio), l = pedido[i];
        if (l.anadido) { pedido.splice(i, 1); }        // el que se añadió, se va
        else { l.premio = false; l.pts = 0; l.total = lineaTotal(l); }
        pintarBarra(); verPuntos();
      };
    });

    if ($('verCatalogo')) $('verCatalogo').onclick = verCatalogoPremios;

    $('hojaPie').hidden = !yaHay;
    if (yaHay) {
      otroBoton(false);
      $('btnPrincipal').disabled = false;
      $('btnPrincipal').innerHTML = 'Continuar';
      $('btnPrincipal').onclick = function () { cerrarHoja(); irAlPago(); };
    }
  }

  /*  El catálogo de lo que puede reclamar. Lo que escoja se AÑADE al pedido,
      gratis en dinero: es un producto más, no un descuento.              */
  function verCatalogoPremios() {
    var libres = puntosLibres();
    var puede = premiosQueAlcanzan();
    var h = '<div class="ct-paso"><button class="ct-atras" id="volverPuntos">'
          + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
          + '</button><div class="ct-paso-tit"><b>Lo que puedes reclamar</b>'
          + '<span>' + libres + ' puntos disponibles</span></div></div>'
          + '<div class="ct-sub">Lo que escojas se agrega a tu pedido sin costo.</div>';
    puede.forEach(function (x, i) {
      h += '<button class="ct-op" data-premio="' + i + '"><span>' + esc(x.n)
         + '</span><i>' + x.pts + ' pts</i></button>';
    });
    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('volverPuntos').onclick = verPuntos;
    $('hojaPie').hidden = true;
    $('hojaCuerpo').querySelectorAll('[data-premio]').forEach(function (btn) {
      btn.onclick = function () {
        var pm = puede[Number(btn.dataset.premio)];
        if (!pm || pm.pts > puntosLibres()) return;
        /*  Se busca el producto de verdad en la carta: el pedido viaja con
            identificadores, no con nombres. Si ese premio no está en la carta
            visible —las adiciones suelen estar ocultas— no se puede añadir
            como línea, y se dice en vez de fallar en silencio.           */
        /*  El premio ya trae el producto y la presentación. Si además está en
            la carta visible se usa ese —así el detalle sale con sus nombres
            de siempre—; si no (las adiciones suelen estar escondidas), se
            arma uno mínimo: para mandarlo solo hacen falta los dos ids.  */
        var prod = (D.prods || []).find(function (p) { return String(p.id) === String(pm.pid); });
        var presId = pm.pres_id || '';
        if (prod) {
          var pr = prod.pres.find(function (y) {
            return String(y.id) === String(pm.pres_id)
              || String(y.n || '').trim().toLowerCase() === String(pm.pres || '').trim().toLowerCase();
          }) || (prod.pres.length === 1 ? prod.pres[0] : null);
          if (pr) presId = pr.id;
        }
        if (!presId) {
          $('hojaCuerpo').insertAdjacentHTML('beforeend',
            '<div class="ct-nota-chica" style="margin-top:12px">Ese premio te lo confirmamos por el chat 🙏</div>');
          return;
        }
        var l = {
          prod: prod || { id: pm.pid, n: pm.n, pres: [{ id: presId, n: pm.pres || '' }], vg: [], adic: {} },
          n: prod ? prod.n : pm.n, presId: presId, base: 0, cant: 1,
          adic: [], vars: {}, nota: '', premio: true, pts: pm.pts, anadido: true
        };
        /*  Sin detalle cuando el nombre del premio ya lo trae dentro: si no,
            sale "Adición Salsa · Rosada · Rosada".                       */
        l.det = prod ? detalleDe(l) : '';
        l.total = 0;
        pedido.push(l);
        pintarBarra();
        verPuntos();
      };
    });
  }

  /* ── mandarlo ────────────────────────────────────────────────────────── */
  $('btnEnviar').onclick = enviar;

  async function enviar() {
    if (!pedido.length || !pagoElegido) return;
    var b = $('btnEnviar');
    b.disabled = true; b.textContent = 'Mandando tu pedido…';
    try {
      var r = await llamar({
        action: 'guardar',
        /*  A dónde va. El servidor vuelve a cotizarlo: lo que se enseñó aquí
            no se cree, igual que con los precios de los productos.       */
        entrega: entrega.modo,
        barrio: entrega.barrio, direccion: entrega.direccion,
        conjunto: entrega.conjunto, unidad: entrega.unidad,
        pago: pagoElegido.id || pagoElegido.n,
        saldo_usar: pagoElegido.tipo === 'saldo' ? pagoElegido.cubre : 0,
        productos: pedido.map(function (l) {
          /*  Solo QUÉ escogió. El precio lo pone el servidor. */
          return {
            product_id: l.prod.id, pres_id: l.presId, cantidad: l.cant,
            variantes: l.vars,
            adiciones: l.adic.map(function (n) { return { name: n }; }),
            notas: l.nota,
            /*  Que va con puntos. El servidor lo comprueba contra el catálogo
                y contra los puntos que de verdad tiene: aquí solo se dice
                qué escogió.                                              */
            premio: l.premio === true
          };
        })
      });
      terminar(r);
    } catch (e) {
      b.disabled = false; b.textContent = 'Hacer mi pedido';
      /*  Si cerraron mientras escogia, no se le deja intentando: se le dice
          y se cierra la carta. Insistir no va a abrir la cocina.         */
      if (/cerramos/i.test((e && e.message) || '')) {
        return morir('Justo cerramos', (e.message || '').replace(/^Justo cerramos\s*😔\s*/, ''));
      }
      /*  Nunca callado: si algo falló, se dice. */
      var n = document.createElement('div');
      n.className = 'ct-pago-nota';
      n.style.color = 'var(--marca)';
      n.textContent = (e && e.message) || 'No se pudo mandar tu pedido. Inténtalo otra vez.';
      $('pagoLista').appendChild(n);
    }
  }

  function terminar(r) {
    var corr = D.motivo === 'correccion';
    $('finTit').textContent = corr ? 'Listo, guardamos los cambios' : 'Listo, ya tenemos tu pedido';
    var txt;
    /*  Ya no se promete pedir la dirección si el cliente acaba de darla aquí.
        Prometer un paso que no va a pasar deja al cliente esperándolo.    */
    var yaHayDir = entrega.modo === 'recoger'
      || !!(String(entrega.direccion || '').trim() || String(entrega.conjunto || '').trim());
    /*  Si se llevó algo con puntos se dice, porque es lo que más va a querer
        ver confirmado: nadie regala 1.000 puntos sin mirar.              */
    var ptsFin = puntosUsados();
    var conPuntos = ptsFin > 0 ? 'Usas ' + ptsFin + ' puntos en este pedido. ' : '';
    var cierre = yaHayDir
      ? 'Vuelve al chat: allí te confirmamos todo antes de mandarlo a la cocina.'
      : 'Vuelve al chat: allí te pedimos la dirección y te confirmamos todo antes de mandarlo a la cocina.';
    if (pagoElegido.tipo === 'saldo') {
      txt = 'Pagas ' + cop(pagoElegido.cubre) + ' con tu saldo'
          + (pagoElegido.falta ? ' y quedan ' + cop(pagoElegido.falta) : '') + '. ' + cierre;
    } else {
      txt = conPuntos + cierre;
    }
    $('finTxt').textContent = txt;
    /*  Devolverlo a SU conversación, que puede ser WhatsApp, Instagram o
        Facebook. Si por lo que sea no sabemos a dónde, se le dice que ya
        puede cerrar — pero nunca se le deja mirando una pantalla sin salida. */
    if (D.volver) {
      $('btnVolver').href = D.volver;
      $('btnVolver').hidden = false;
    } else {
      $('finPie').hidden = false;
    }
    $('vPago').hidden = true;
    $('vFin').hidden = false;
  }
})();
