/* ═══════════════════════════════════════════════════════════════════════════
   pos-notas.js — Notas frecuentes, para TODAS las pantallas de venta
   ───────────────────────────────────────────────────────────────────────────
   El motor existia solo en `tomar-pedido.js`, asi que las notas frecuentes se
   podian usar en mesa pero no en domicilios ni en venta rapida. Aqui sale a un
   modulo compartido — NO se copia tres veces, que es lo que paso con los
   recibos de mesa y termino con tres versiones distintas.

   Cada pantalla guarda su nota en su propia variable (TP_WIP.note, WIP.note,
   VR_WIP.note), asi que el modulo no la toca directamente: la pantalla le pasa
   como leerla y como escribirla.

   Uso:
     posNotas.montar({
       wrap:      'pm-nf-wrap',            // el div donde se dibuja
       leer:      () => WIP.note,          // devuelve el texto de la nota
       escribir:  (t) => { WIP.note = t; }, // lo guarda
       inputNota: 'pm-note-input',         // (opcional) el textarea, para reflejarlo
       categoria: () => nombreDeLaCategoria // (opcional) para el modo por categoria
     });
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ESC = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  function fuente(cfgCategoria) {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}'); } catch (e) {}
    var nf = cfg.notasFrecuentes;
    if (!nf || typeof nf !== 'object') return [];
    if (nf.modo === 'cat') {
      var nombre = (typeof cfgCategoria === 'function' ? cfgCategoria() : '') || '';
      return (nf.cats && nf.cats[nombre]) || [];
    }
    return nf.global || [];
  }

  /* Cuantas veces se ha usado cada nota, para poner arriba las de siempre.
     Vive en el equipo: es una comodidad del mesero, no un dato del negocio. */
  function uso() {
    try { return JSON.parse(localStorage.getItem('pos.notas.uso') || '{}'); } catch (e) { return {}; }
  }
  function usoInc(n) {
    var u = uso(); u[n] = (u[n] || 0) + 1;
    try { localStorage.setItem('pos.notas.uso', JSON.stringify(u)); } catch (e) {}
  }

  function montar(op) {
    var wrap = document.getElementById(op.wrap);
    if (!wrap) return;
    var src = fuente(op.categoria);
    if (!src.length) { wrap.innerHTML = ''; return; }   // sin notas configuradas: no ocupar espacio

    var abierto = false, busca = '';

    var tokens = function () {
      return String(op.leer() || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    };
    var poner = function (t) {
      var txt = t.join(', ');
      op.escribir(txt);
      if (op.inputNota) { var el = document.getElementById(op.inputNota); if (el) el.value = txt; }
    };

    function htmlSeleccion() {
      var tk = tokens();
      var puestas = src.filter(function (n) { return tk.indexOf(n) >= 0; });
      var h = '';
      puestas.forEach(function (n) {
        h += '<span class="pm-nf-chip" data-nf-tok="' + ESC(n) + '">' + ESC(n) +
             '<button type="button" data-nf-rm="' + ESC(n) + '" title="Quitar">&times;</button></span>';
      });
      h += '<button type="button" class="pm-nf-add">+ ' + (puestas.length ? 'Otra nota' : 'Nota frecuente') + '</button>';
      return h;
    }

    function chip(n, tk) {
      return '<button type="button" class="pm-nf-pchip' + (tk.indexOf(n) >= 0 ? ' on' : '') +
             '" data-nf-pick="' + ESC(n) + '">' + ESC(n) + '</button>';
    }

    function pintarLista() {
      var list = wrap.querySelector('.pm-nf-list'); if (!list) return;
      var tk = tokens(), q = (busca || '').trim().toLowerCase(), h = '';
      if (!q) {
        var u = uso();
        var top = src.filter(function (n) { return u[n]; })
                     .sort(function (a, b) { return u[b] - u[a]; }).slice(0, 4);
        if (top.length) {
          h += '<div class="pm-nf-grp">Más usadas</div><div class="pm-nf-chips">' +
               top.map(function (n) { return chip(n, tk); }).join('') + '</div>';
        }
      }
      var filt = src.filter(function (n) { return n.toLowerCase().indexOf(q) >= 0; });
      h += '<div class="pm-nf-grp">Todas</div>';
      h += filt.length
        ? '<div class="pm-nf-chips">' + filt.map(function (n) { return chip(n, tk); }).join('') + '</div>'
        : '<div class="pm-nf-empty">Nada coincide.</div>';
      list.innerHTML = h;
    }

    function pintar() {
      wrap.innerHTML =
        '<div class="pm-nf-sel">' + htmlSeleccion() + '</div>' +
        '<div class="pm-nf-picker"' + (abierto ? '' : ' hidden') + '>' +
        '<input class="pm-nf-search" placeholder="Buscar nota...">' +
        '<div class="pm-nf-list"></div></div>';
      if (abierto) {
        var s = wrap.querySelector('.pm-nf-search');
        if (s) s.value = busca;
        pintarLista();
      }
    }

    if (!wrap._notasBound) {
      wrap._notasBound = true;
      wrap.addEventListener('click', function (e) {
        var add = e.target.closest('.pm-nf-add');
        if (add) {
          abierto = !abierto; pintar();
          if (abierto) {
            var s = wrap.querySelector('.pm-nf-search');
            /* En la tablet, enfocar el buscador ABRE el teclado y tapa justo la
               lista que se acaba de abrir. Solo se enfoca donde hay raton. */
            if (s && window.matchMedia && window.matchMedia('(pointer: fine)').matches) s.focus();
          }
          return;
        }
        var rm = e.target.closest('[data-nf-rm]');
        if (rm) {
          poner(tokens().filter(function (x) { return x !== rm.dataset.nfRm; }));
          pintar(); return;
        }
        var pick = e.target.closest('[data-nf-pick]');
        if (pick) {
          var n = pick.dataset.nfPick, tk = tokens(), i = tk.indexOf(n);
          if (i >= 0) tk.splice(i, 1); else { tk.push(n); usoInc(n); }
          poner(tk); pintar(); return;
        }
      });
      wrap.addEventListener('input', function (e) {
        if (e.target && e.target.classList.contains('pm-nf-search')) { busca = e.target.value; pintarLista(); }
      });
    }

    pintar();
  }

  window.posNotas = { montar: montar, hay: function (cat) { return fuente(cat).length > 0; } };
})();
