/* ═══════════════════════════════════════════════════════════════════════════
   admin-tutoriales.js — Los tutoriales, desde la consola de plataforma
   ───────────────────────────────────────────────────────────────────────────
   Aquí Cobra arma los módulos y pega los enlaces de YouTube. Lo que se guarda
   aquí lo ven TODOS los restaurantes: no es material de un cliente.

   Va en archivo aparte y no dentro de admin-reg.js, que ya tiene el resumen,
   las solicitudes, los clientes, el equipo y los planes. Un archivo que crece
   con cada sección es como se llega a los archivos que nadie quiere tocar.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var A = { modulos: [], videos: [], edit: null, tipo: null };

  var $ = function (id) { return document.getElementById(id); };
  var ESC = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  function sb() { return window.sb || (window._pos && window._pos.sb) || null; }
  function aviso(m, t) { if (window.showToast) showToast(m, t); }
  function fmt(s) {
    s = Math.max(0, Math.round(Number(s) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ── El enlace de YouTube ────────────────────────────────────────────────
     Sergio pega la direccion como le quede a mano, y vienen de mil formas:
     youtu.be/ID, /watch?v=ID, /embed/ID, /shorts/ID, con lista o con minuto de
     inicio pegados. Se guarda solo el ID, que es lo unico que necesita el
     reproductor. Si ya pego un ID suelto, tambien vale. */
  function idDeYouTube(txt) {
    var t = String(txt || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
    var m = t.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  /* Las pantallas a las que puede llevar el boton del video. Lista cerrada y no
     un campo de texto: escribir el nombre del archivo a mano es pedir que un dia
     quede un boton que no lleva a ningun lado. */
  var PANTALLAS = [
    ['', 'Sin botón'],
    ['ventas.html', 'Ventas · salón'],
    ['tomar-pedido.html', 'Tomar pedido en mesa'],
    ['venta-rapida.html', 'Venta rápida'],
    ['domicilios.html', 'Domicilios'],
    ['pagos.html', 'Cobrar'],
    ['caja.html', 'Caja'],
    ['catalogo-productos.html', 'Catálogo de productos'],
    ['inventario.html', 'Inventario'],
    ['informes.html', 'Informes'],
    ['reservas.html', 'Reservas'],
    ['chat-ia.html', 'Chat con IA'],
    ['configuracion.html', 'Configuración'],
    ['impresoras.html', 'Impresoras'],
    ['dashboard.html', 'Inicio'],
  ];

  /* ══ CARGA ══════════════════════════════════════════════════════════════ */
  async function cargar() {
    var s = sb(); if (!s) return;
    var r = await Promise.all([
      s.from('tuto_modulos').select('*').order('orden'),
      s.from('tuto_videos').select('*').order('orden'),
    ]);
    A.modulos = r[0].data || [];
    A.videos = r[1].data || [];
    pintar();
  }

  function videosDe(id) { return A.videos.filter(function (v) { return v.modulo_id === id; }); }

  function pintar() {
    var host = $('tu-admin-list'); if (!host) return;
    if (!A.modulos.length) {
      host.innerHTML = '<div class="a-empty">Todavía no hay módulos. Crea el primero '
        + 'con el botón de arriba: un módulo es un tema (Ventas, Inventario…) y adentro van sus videos.</div>';
      return;
    }
    host.innerHTML = A.modulos.map(function (m) {
      var vs = videosDe(m.id);
      return '<div class="a-card tu-mod">'
        + '<div class="tu-mod-head">'
        +   '<div><div class="tu-mod-t">' + ESC(m.titulo)
        +     (m.activo ? '' : ' <span class="tu-off">oculto</span>') + '</div>'
        +     '<div class="tu-mod-s">' + vs.length + (vs.length === 1 ? ' video' : ' videos')
        +     (m.descripcion ? ' · ' + ESC(m.descripcion) : '') + '</div></div>'
        +   '<div class="tu-mod-acts">'
        +     '<button class="a-btn" data-mod-edit="' + m.id + '">Editar</button>'
        +     '<button class="a-btn" data-mod-del="' + m.id + '">Eliminar</button>'
        +     '<button class="a-btn a-btn--primary" data-vid-new="' + m.id + '">+ Video</button>'
        +   '</div></div>'
        + (vs.length
            ? '<table class="a-table tu-vids"><thead><tr><th>#</th><th>Video</th><th>YouTube</th>'
              + '<th>Duración</th><th>Lleva a</th><th class="th-right">Acciones</th></tr></thead><tbody>'
              + vs.map(function (v, i) {
                  var destino = PANTALLAS.filter(function (x) { return x[0] === v.ruta_destino; })[0];
                  return '<tr' + (v.activo ? '' : ' class="tu-off-row"') + '>'
                    + '<td>' + (i + 1) + '</td>'
                    + '<td><b>' + ESC(v.titulo) + '</b>' + (v.activo ? '' : ' <span class="tu-off">oculto</span>') + '</td>'
                    + '<td><a href="https://youtu.be/' + ESC(v.youtube_id) + '" target="_blank" rel="noopener">'
                    +   ESC(v.youtube_id) + '</a></td>'
                    + '<td>' + (v.duracion_seg ? fmt(v.duracion_seg)
                        : '<span class="tu-mod-s">la calcula sola</span>') + '</td>'
                    + '<td>' + (destino && destino[0] ? ESC(destino[1]) : '—') + '</td>'
                    + '<td class="th-right">'
                    +   '<button class="a-btn" data-vid-edit="' + v.id + '">Editar</button> '
                    +   '<button class="a-btn" data-vid-del="' + v.id + '">Eliminar</button></td></tr>';
                }).join('')
              + '</tbody></table>'
            : '<div class="a-empty" style="padding:14px">Este módulo todavía no tiene videos.</div>')
        + '</div>';
    }).join('');
  }

  /* ══ EL EDITOR ══════════════════════════════════════════════════════════ */
  function abrir(tipo, dato) {
    A.tipo = tipo;
    A.edit = dato || {};
    $('tu-adm-titulo').textContent =
      (dato && dato.id ? 'Editar ' : 'Nuevo ') + (tipo === 'modulo' ? 'módulo' : 'video');
    $('tu-adm-body').innerHTML = tipo === 'modulo' ? formModulo(A.edit) : formVideo(A.edit);
    $('tu-adm-bd').hidden = false;
  }
  function cerrar() { $('tu-adm-bd').hidden = true; A.edit = null; A.tipo = null; }

  function campo(etq, html, pista) {
    return '<label class="tu-f"><span class="tu-f-l">' + etq + '</span>' + html
      + (pista ? '<span class="tu-f-h">' + pista + '</span>' : '') + '</label>';
  }

  function formModulo(m) {
    return campo('Nombre del módulo',
        '<input id="f-titulo" value="' + ESC(m.titulo || '') + '" placeholder="Ej. Ventas y pedidos">')
      + campo('Descripción <i>· opcional</i>',
        '<input id="f-desc" value="' + ESC(m.descripcion || '') + '">')
      + campo('Orden',
        '<input id="f-orden" type="number" value="' + (m.orden || 0) + '">',
        'Los módulos se muestran de menor a mayor.')
      + '<label class="tu-chk"><input type="checkbox" id="f-activo"' + (m.activo === false ? '' : ' checked')
      + '> Visible para los restaurantes</label>';
  }

  function formVideo(v) {
    var pasos = Array.isArray(v.pasos) ? v.pasos : [];
    return campo('Módulo',
        '<select id="f-modulo">' + A.modulos.map(function (m) {
          return '<option value="' + m.id + '"' + (m.id === v.modulo_id ? ' selected' : '') + '>'
            + ESC(m.titulo) + '</option>';
        }).join('') + '</select>')
      + campo('Título del video',
        '<input id="f-titulo" value="' + ESC(v.titulo || '') + '" placeholder="Ej. Tomar pedido en mesa">')
      + campo('Enlace de YouTube',
        '<input id="f-yt" value="' + (v.youtube_id ? 'https://youtu.be/' + ESC(v.youtube_id) : '')
        + '" placeholder="Pega aquí el enlace del video">',
        'Pega el enlace como te quede a mano: youtu.be, /watch?v= o /shorts. Se queda con lo que hace falta.')
      + campo('Resumen <i>· lo que se lee debajo del video</i>',
        '<textarea id="f-resumen" rows="3">' + ESC(v.resumen || '') + '</textarea>')
      + '<div class="tu-f2">'
      +   campo('Nivel', '<select id="f-nivel">'
          + ['basico', 'intermedio', 'avanzado'].map(function (n) {
              return '<option value="' + n + '"' + (v.nivel === n ? ' selected' : '') + '>'
                + ({ basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' }[n]) + '</option>';
            }).join('') + '</select>')
      +   campo('Orden', '<input id="f-orden" type="number" value="' + (v.orden || 0) + '">')
      + '</div>'
      /* El boton que lleva a la pantalla que enseña el video: lo pidio Sergio y
         es lo que convierte el tutorial en algo que se puede usar de una. */
      + '<div class="tu-sep">El botón que lleva a la pantalla</div>'
      + '<div class="tu-f2">'
      +   campo('Pantalla', '<select id="f-ruta">' + PANTALLAS.map(function (x) {
            return '<option value="' + x[0] + '"' + (x[0] === (v.ruta_destino || '') ? ' selected' : '') + '>'
              + ESC(x[1]) + '</option>';
          }).join('') + '</select>')
      +   campo('Texto del botón',
            '<input id="f-ruta-txt" value="' + ESC(v.ruta_texto || '') + '" placeholder="Ir a la pantalla">')
      + '</div>'
      + '<div class="tu-sep">Pasos clave <i>· opcional</i></div>'
      + '<div class="tu-f-h" style="margin:-4px 0 8px">Cada paso lleva a su minuto exacto del video. '
      + 'El minuto se escribe como 2:30.</div>'
      + '<div id="f-pasos">' + pasos.map(pasoHTML).join('') + '</div>'
      + '<button class="a-btn" id="f-paso-add" type="button">+ Paso</button>'
      + '<label class="tu-chk"><input type="checkbox" id="f-activo"' + (v.activo === false ? '' : ' checked')
      + '> Visible para los restaurantes</label>';
  }

  function pasoHTML(c) {
    return '<div class="tu-paso">'
      + '<input class="p-min" value="' + ESC(fmt(c && c.t)) + '" placeholder="0:00">'
      + '<input class="p-txt" value="' + ESC((c && c.texto) || '') + '" placeholder="Qué se hace en este paso">'
      + '<button class="a-btn p-del" type="button">✕</button></div>';
  }

  /* "2:30" → 150. Se acepta tambien un numero suelto de segundos. */
  function segDe(txt) {
    var t = String(txt || '').trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    var m = t.match(/^(\d+):(\d{1,2})$/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
  }

  /* ══ GUARDAR ════════════════════════════════════════════════════════════ */
  async function guardar() {
    var s = sb(); if (!s) return;
    var btn = $('tu-adm-save');
    btn.disabled = true;

    try {
      if (A.tipo === 'modulo') {
        var titulo = ($('f-titulo').value || '').trim();
        if (!titulo) { aviso('Ponle un nombre al módulo', 'red'); btn.disabled = false; return; }
        var fila = {
          titulo: titulo,
          descripcion: ($('f-desc').value || '').trim() || null,
          orden: parseInt($('f-orden').value, 10) || 0,
          activo: $('f-activo').checked,
          updated_at: new Date().toISOString(),
        };
        if (A.edit.id) await s.from('tuto_modulos').update(fila).eq('id', A.edit.id);
        else await s.from('tuto_modulos').insert(fila);
        aviso('Módulo guardado');
      } else {
        var t2 = ($('f-titulo').value || '').trim();
        var yt = idDeYouTube($('f-yt').value);
        if (!t2) { aviso('Ponle un título al video', 'red'); btn.disabled = false; return; }
        /* Sin id de YouTube no se guarda: un video sin enlace se veria en la
           lista y al abrirlo no reproduciria nada. */
        if (!yt) { aviso('Ese enlace de YouTube no se entiende. Pega la dirección del video.', 'red'); btn.disabled = false; return; }

        var pasos = [].slice.call(document.querySelectorAll('#f-pasos .tu-paso')).map(function (el) {
          return { t: segDe(el.querySelector('.p-min').value), texto: (el.querySelector('.p-txt').value || '').trim() };
        }).filter(function (c) { return c.texto; })
          .sort(function (a, b) { return a.t - b.t; });   // en el orden del video, no en el que se escribieron

        var fila2 = {
          modulo_id: $('f-modulo').value,
          titulo: t2,
          youtube_id: yt,
          resumen: ($('f-resumen').value || '').trim() || null,
          nivel: $('f-nivel').value,
          orden: parseInt($('f-orden').value, 10) || 0,
          pasos: pasos,
          ruta_destino: $('f-ruta').value || null,
          ruta_texto: ($('f-ruta-txt').value || '').trim() || null,
          activo: $('f-activo').checked,
          updated_at: new Date().toISOString(),
        };
        /* Si cambio el video de YouTube, la duracion guardada ya no vale: se
           borra para que el reproductor la vuelva a averiguar. */
        if (A.edit.id && A.edit.youtube_id !== yt) fila2.duracion_seg = 0;

        if (A.edit.id) await s.from('tuto_videos').update(fila2).eq('id', A.edit.id);
        else await s.from('tuto_videos').insert(fila2);
        aviso('Video guardado');
      }
      cerrar();
      await cargar();
    } catch (e) {
      aviso('No se pudo guardar: ' + (e.message || e), 'red');
    }
    btn.disabled = false;
  }

  async function borrar(tipo, id) {
    var s = sb(); if (!s) return;
    try {
      await s.from(tipo === 'modulo' ? 'tuto_modulos' : 'tuto_videos').delete().eq('id', id);
      aviso(tipo === 'modulo' ? 'Módulo eliminado' : 'Video eliminado');
      await cargar();
    } catch (e) { aviso('No se pudo eliminar: ' + (e.message || e), 'red'); }
  }

  /* ══ EVENTOS ════════════════════════════════════════════════════════════ */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;

    if (t.closest('#tu-nuevo-modulo')) { abrir('modulo', { orden: A.modulos.length + 1, activo: true }); return; }
    if (t.closest('#tu-adm-x') || t.closest('#tu-adm-cancel')) { cerrar(); return; }
    if (t.closest('#tu-adm-save')) { guardar(); return; }
    if (t === $('tu-adm-bd')) { cerrar(); return; }

    var b = t.closest('[data-mod-edit]');
    if (b) { abrir('modulo', A.modulos.filter(function (m) { return m.id === b.dataset.modEdit; })[0]); return; }

    b = t.closest('[data-vid-new]');
    if (b) {
      abrir('video', { modulo_id: b.dataset.vidNew, activo: true, nivel: 'basico',
                       orden: videosDe(b.dataset.vidNew).length + 1, pasos: [] });
      return;
    }
    b = t.closest('[data-vid-edit]');
    if (b) { abrir('video', A.videos.filter(function (v) { return v.id === b.dataset.vidEdit; })[0]); return; }

    b = t.closest('[data-mod-del]');
    if (b) {
      var m = A.modulos.filter(function (x) { return x.id === b.dataset.modDel; })[0] || {};
      var n = videosDe(b.dataset.modDel).length;
      /* Se avisa cuantos videos se van con el modulo: borrar un tema entero sin
         saber que arrastra sus 6 videos es de las cosas que no se deshacen. */
      showConfirm('Eliminar módulo',
        'Se eliminará "' + (m.titulo || '') + '"' + (n ? ' y sus ' + n + ' videos' : '') + '. No se puede deshacer.',
        function () { borrar('modulo', b.dataset.modDel); });
      return;
    }
    b = t.closest('[data-vid-del]');
    if (b) {
      var v = A.videos.filter(function (x) { return x.id === b.dataset.vidDel; })[0] || {};
      showConfirm('Eliminar video', 'Se eliminará "' + (v.titulo || '') + '". No se puede deshacer.',
        function () { borrar('video', b.dataset.vidDel); });
      return;
    }

    if (t.closest('#f-paso-add')) {
      $('f-pasos').insertAdjacentHTML('beforeend', pasoHTML({ t: 0, texto: '' }));
      return;
    }
    b = t.closest('.p-del');
    if (b) { b.parentNode.remove(); return; }
  });

  /* Se carga al entrar a la seccion, no al abrir la consola: quien viene a ver
     los clientes no tiene por que esperar a que bajen los tutoriales. */
  var _ya = false;
  var original = window.setView;
  window.setView = function (id) {
    if (original) original.apply(this, arguments);
    if (id === 'tutoriales' && !_ya) { _ya = true; cargar(); }
  };

  window.tutoAdminRecargar = cargar;
})();
