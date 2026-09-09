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
    pintarCabecera();
    if (D.motivo === 'correccion') {
      $('avisoCorregir').hidden = false;
      cargarBorrador();
    }
    pintarCategorias();
    pintarBarra();
    $('cargando').hidden = true;
    $('app').hidden = false;
  })();

  function pintarCabecera() {
    document.title = (D.restaurante.nombre || 'Carta') + ' — Carta';
    $('restNombre').textContent = D.restaurante.nombre || '';
    /*  La sede solo si dice algo distinto del restaurante. En El Parche las
        dos se llaman igual y salia "El Parche Food / El Parche Food".   */
    var sede = D.restaurante.sede || '';
    $('restSede').textContent = (sede && sede !== D.restaurante.nombre) ? sede : '';
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
      l.base = precioDe(p, l.presId, l.vars);
      if (l.base == null) return;
      l.total = lineaTotal(l); l.det = detalleDe(l);
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
         + (p.d ? '<div class="ct-pdesc">' + esc(p.d) + '</div>' : '')
         + '<div class="ct-ppie">' + pie + '</div></div><span class="ct-mas">+</span></button>';
    });
    $('lista').innerHTML = h;
    $('lista').scrollTop = 0;
    $('salirCat').onclick = pintarCategorias;
    $('lista').querySelectorAll('.ct-prod').forEach(function (b) {
      b.onclick = function () { abrirHoja(Number(b.dataset.i)); };
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
      if (p.d) h += '<div class="ct-sub">' + esc(p.d) + '</div>';
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
      h += '<div class="ct-item"><span class="ct-item-n">' + l.cant + '</span>'
         + '<div class="ct-item-t"><div class="ct-item-nom">' + esc(l.n) + '</div>'
         + (l.det ? '<div class="ct-item-det">' + esc(l.det) + '</div>' : '')
         + '<button class="ct-quitar" data-q="' + i + '">Quitar</button></div>'
         + '<div class="ct-item-p">' + cop(l.total) + '</div></div>';
    });
    h += '<div class="ct-total"><span>Total</span><i>' + cop(totalPedido()) + '</i></div>';
    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
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
    $('btnPrincipal').onclick = function () { cerrarHoja(); irAlPago(); };
    otroBoton(true, 'Seguir pidiendo', cerrarHoja);
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

  function premiosQueAlcanzan() {
    var p = (D.cliente && D.cliente.puntos) || 0;
    return (D.premios || []).filter(function (x) { return x.pts <= p; });
  }

  var metodos = [];
  function irAlPago() {
    /*  Solo se ofrece lo que de verdad sirve. Ofrecer puntos a quien no le
        alcanza es una decepción justo al pagar.                           */
    metodos = (D.pagos || []).filter(function (m) {
      var esSaldo = m.tipo === 'saldo' || /billetera/i.test(m.n || '');
      if (m.tipo === 'puntos') return premiosQueAlcanzan().length > 0;
      if (esSaldo) return ((D.cliente && D.cliente.saldo) || 0) > 0;
      return true;
    });
    var h = '';
    metodos.forEach(function (m, i) {
      var t = (m.tipo === 'saldo' || /billetera/i.test(m.n || '')) ? 'saldo' : m.tipo;
      var ic = '<span class="ct-pago-ic" style="background:' + (FONDO[t] || FONDO.efectivo) + '">'
             + (ICONO[t] || ICONO.efectivo) + '</span>';
      var sub = PIE[t] || '';
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
        if (m.tipo === 'saldo' || /billetera/i.test(m.n || '')) { $('vPago').hidden = true; abrirPanel(verSaldo); return; }
        if (m.tipo === 'puntos') { $('vPago').hidden = true; abrirPanel(verPuntos); return; }
        $('pagoLista').querySelectorAll('[data-i]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        pagoElegido = { n: m.n, id: m.id, tipo: m.tipo };
        $('btnEnviar').disabled = false;
      };
    });
    $('totPago').textContent = cop(totalPedido());
    $('btnEnviar').disabled = true;
    $('vPago').hidden = false;
  }
  $('pagoAtras').onclick = function () { $('vPago').hidden = true; };

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
  function verPuntos() {
    var pts = (D.cliente && D.cliente.puntos) || 0;
    var puede = premiosQueAlcanzan();
    var h = '<div class="ct-paso"><button class="ct-atras" id="volverPago2">'
          + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>'
          + '</button><div class="ct-paso-tit"><b>Tus puntos</b></div></div>'
          + '<div class="ct-preg">Tienes ' + pts + ' puntos</div>'
          + '<div class="ct-sub">Puedes reclamar una de estas. Te lo confirmamos en el chat.</div>';
    puede.forEach(function (x, i) {
      h += '<button class="ct-op" data-premio="' + i + '"><span>' + esc(x.n) + '</span><i>' + x.pts + ' pts</i></button>';
    });
    var sigue = (D.premios || []).find(function (x) { return x.pts > pts; });
    if (sigue) {
      h += '<div class="ct-nota-chica" style="margin-top:14px">Con ' + (sigue.pts - pts)
         + ' puntos más puedes reclamar ' + esc(sigue.n) + '.</div>';
    }
    $('hojaCuerpo').innerHTML = h;
    $('hojaCuerpo').scrollTop = 0;
    $('volverPago2').onclick = function () { cerrarHoja(); irAlPago(); };
    $('hojaCuerpo').querySelectorAll('[data-premio]').forEach(function (b) {
      b.onclick = function () {
        var m = (D.pagos || []).find(function (x) { return x.tipo === 'puntos'; });
        pagoElegido = { n: m ? m.n : 'Puntos', id: m ? m.id : '', tipo: 'puntos',
                        premio: puede[Number(b.dataset.premio)] };
        cerrarHoja();
        enviar();
      };
    });
    $('hojaPie').hidden = true;
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
        pago: pagoElegido.id || pagoElegido.n,
        saldo_usar: pagoElegido.tipo === 'saldo' ? pagoElegido.cubre : 0,
        premio: pagoElegido.premio ? pagoElegido.premio.n : '',
        productos: pedido.map(function (l) {
          /*  Solo QUÉ escogió. El precio lo pone el servidor. */
          return {
            product_id: l.prod.id, pres_id: l.presId, cantidad: l.cant,
            variantes: l.vars,
            adiciones: l.adic.map(function (n) { return { name: n }; }),
            notas: l.nota
          };
        })
      });
      terminar(r);
    } catch (e) {
      b.disabled = false; b.textContent = 'Hacer mi pedido';
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
    if (pagoElegido.tipo === 'saldo') {
      txt = 'Pagas ' + cop(pagoElegido.cubre) + ' con tu saldo'
          + (pagoElegido.falta ? ' y quedan ' + cop(pagoElegido.falta) : '')
          + '. Vuelve al chat: allí te pedimos la dirección y te confirmamos el total.';
    } else if (pagoElegido.tipo === 'puntos' && pagoElegido.premio) {
      txt = 'Vuelve al chat: allí te confirmamos tu pedido y el canje de ' + pagoElegido.premio.n + '.';
    } else {
      txt = 'Vuelve al chat: allí te pedimos la dirección y te confirmamos todo antes de mandarlo a la cocina.';
    }
    $('finTxt').textContent = txt;
    $('vPago').hidden = true;
    $('vFin').hidden = false;
  }
})();
