/* ═══════════════════════════════════════════════════════════════════════════
   tutoriales.js — La ruta de aprendizaje, con videos de YouTube
   ───────────────────────────────────────────────────────────────────────────
   Los módulos y los videos los crea Cobra desde la consola de plataforma y son
   los mismos para todos los restaurantes. Lo único de cada persona es su
   progreso: en qué minuto va y qué ya terminó.

   El diseño traía un reproductor simulado (un setInterval que sumaba segundos).
   Aquí manda el reproductor de YouTube de verdad: el avance, la duración y el
   "reanudar en" salen de él, no de una cuenta paralela que se desincroniza en
   cuanto el video tarda en cargar o el usuario toca la barra de YouTube.

   Los controles del diseño (play, barra, velocidad) manejan al reproductor de
   YouTube por su API, con los controles nativos ocultos — así se ve como se
   aprobó y sigue siendo un video real.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var S = {
    modulos: [], videos: [], prog: {},   // prog[videoId] = {segundos, completado, feedback}
    actual: null, filtro: 'todos', busca: '',
    abiertos: {}, yt: null, listo: false, tick: null, vel: 1,
  };

  var $ = function (id) { return document.getElementById(id); };
  var ESC = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var norm = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  };
  function fmt(s) {
    s = Math.max(0, Math.round(Number(s) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function fmtLargo(s) {
    s = Math.round(Number(s) || 0);
    if (s >= 3600) {
      var h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
      return h + ' h' + (m ? ' ' + m + ' min' : '');
    }
    return Math.max(1, Math.round(s / 60)) + ' min';
  }

  function sb() { return (window._pos && window._pos.sb) || (typeof window.sb !== 'undefined' ? window.sb : null); }
  function usuario() { return (window._pos && window._pos.state && window._pos.state.user) || null; }

  /* ══ DATOS ══════════════════════════════════════════════════════════════ */
  async function cargar() {
    var s = sb(); if (!s) return;
    var u = usuario();
    /* Las tres a la vez: son independientes y en fila india cada una espera el
       viaje completo de la anterior. */
    var r = await Promise.all([
      s.from('tuto_modulos').select('*').eq('activo', true).order('orden'),
      s.from('tuto_videos').select('*').eq('activo', true).order('orden'),
      u ? s.from('tuto_progreso').select('*').eq('user_id', u.id) : Promise.resolve({ data: [] }),
    ]);
    S.modulos = r[0].data || [];
    S.videos = r[1].data || [];
    S.prog = {};
    (r[2].data || []).forEach(function (p) { S.prog[p.video_id] = p; });

    /* Los módulos vacíos no se muestran: un tema con cero videos solo estorba. */
    S.modulos = S.modulos.filter(function (m) {
      return S.videos.some(function (v) { return v.modulo_id === m.id; });
    });
    /* El primero abierto, para que la pantalla no arranque en blanco. */
    if (S.modulos.length && !Object.keys(S.abiertos).length) S.abiertos[S.modulos[0].id] = true;
  }

  function pr(id) { return S.prog[id] || { segundos: 0, completado: false, feedback: null }; }
  function estado(v) {
    var p = pr(v.id);
    if (p.completado) return 'done';
    return (Number(p.segundos) > 0) ? 'partial' : 'new';
  }
  function videosDe(m) { return S.videos.filter(function (v) { return v.modulo_id === m.id; }); }
  function ruta() {   // el orden global, módulo por módulo
    var out = [];
    S.modulos.forEach(function (m) { out = out.concat(videosDe(m)); });
    return out;
  }

  async function guardarProgreso(videoId, campos) {
    var u = usuario(), s = sb();
    if (!u || !s) return;
    var p = Object.assign({ segundos: 0, completado: false, feedback: null }, S.prog[videoId], campos);
    S.prog[videoId] = p;
    try {
      await s.from('tuto_progreso').upsert({
        user_id: u.id, video_id: videoId,
        segundos: Math.round(p.segundos) || 0,
        completado: !!p.completado, feedback: p.feedback || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,video_id' });
    } catch (e) { console.warn('[tutoriales] guardar progreso:', e && e.message); }
  }

  /* ══ EL RAIL ════════════════════════════════════════════════════════════ */
  function coincide(v, m) {
    if (S.busca) {
      var q = norm(S.busca);
      if (norm(v.titulo).indexOf(q) < 0 && norm(m.titulo).indexOf(q) < 0) return false;
    }
    if (S.filtro === 'pendientes') return estado(v) === 'new';
    if (S.filtro === 'curso')      return estado(v) === 'partial';
    if (S.filtro === 'completos')  return estado(v) === 'done';
    return true;
  }

  function itemHTML(v) {
    var p = pr(v.id), est = estado(v), dur = Number(v.duracion_seg) || 0;
    var avance = dur ? Math.min(100, p.segundos / dur * 100) : 0;
    var sub = dur ? fmt(dur) : '—';
    if (est === 'done') sub += ' · visto';
    else if (est === 'partial') sub += ' · <b>vas en ' + fmt(p.segundos) + '</b>';
    var marca = est === 'done'
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"><path d="m5 12 5 5L19 7"/></svg>' : '';
    var barra = (est === 'new') ? ''
      : '<span class="tu-thumbnail-bar"><i style="width:' + (est === 'done' ? 100 : avance).toFixed(1) + '%"></i></span>';
    /* La miniatura la sirve YouTube a partir del id del video: no hay que
       subirla ni guardarla. mqdefault es la de 320x180, que sobra para un
       recuadro de 68x39 y pesa poco. */
    var mini = v.youtube_id
      ? '<img class="tu-mini" src="https://i.ytimg.com/vi/' + ESC(v.youtube_id) + '/mqdefault.jpg" alt="" loading="lazy">'
      : '';
    return '<button class="tu-item is-' + est + (S.actual === v.id ? ' on' : '') + '" data-video="' + v.id + '">'
      + '<span class="tu-mark">' + marca + '</span>'
      + '<span class="tu-thumbnail">' + mini + '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 12 7-12 7V5Z"/></svg>'
      + '<span class="tu-thumbnail-d">' + (dur ? fmt(dur) : '') + '</span>' + barra + '</span>'
      + '<span class="tu-item-txt"><span class="tu-item-name">' + ESC(v.titulo) + '</span>'
      + '<span class="tu-item-sub">' + sub + '</span></span>'
      + (S.actual === v.id ? '<svg class="tu-nowplay" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 12 7-12 7V5Z"/></svg>' : '')
      + '</button>';
  }

  function moduloHTML(m) {
    var vs = videosDe(m).filter(function (v) { return coincide(v, m); });
    if (!vs.length) return '';
    var todos = videosDe(m);
    var hechos = todos.filter(function (v) { return pr(v.id).completado; }).length;
    var pct = todos.length ? Math.round(hechos / todos.length * 100) : 0;
    var dur = todos.reduce(function (a, v) { return a + (Number(v.duracion_seg) || 0); }, 0);
    var C = 62.83;   // circunferencia del anillo (r=10)
    /* Con búsqueda o con un filtro puesto, todo abierto: si no, el resultado
       queda escondido dentro de un tema cerrado y parece que no hay nada. */
    var abierto = S.busca || S.filtro !== 'todos' || S.abiertos[m.id];
    return '<div class="tu-topic' + (abierto ? ' open' : '') + (pct === 100 ? ' done' : '') + '" data-topic="' + m.id + '">'
      + '<button class="tu-topic-head">'
      + '<svg class="tu-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg>'
      + '<span class="tu-topic-txt"><span class="tu-topic-name">' + ESC(m.titulo) + '</span>'
      + '<span class="tu-topic-sub">' + hechos + ' de ' + todos.length + (dur ? ' · ' + fmtLargo(dur) : '') + '</span></span>'
      + '<span class="tu-ring"><svg width="26" height="26">'
      + '<circle cx="13" cy="13" r="10" fill="none" stroke="#F1F5F9" stroke-width="3"/>'
      + '<circle cx="13" cy="13" r="10" fill="none" stroke="' + (pct === 100 ? '#16A34A' : '#5B6BFF')
      + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="' + C
      + '" stroke-dashoffset="' + (C * (1 - pct / 100)).toFixed(2) + '"/></svg>'
      + '<span class="tu-ring-n">' + pct + '</span></span></button>'
      + '<div class="tu-topic-list">' + vs.map(itemHTML).join('') + '</div></div>';
  }

  function pintarRail() {
    var host = $('rail-list'); if (!host) return;
    var html = S.modulos.map(moduloHTML).join('');
    host.innerHTML = html || '<div class="tu-empty">No hay tutoriales con ese filtro.</div>';
    pintarCabecera();
  }

  function pintarCabecera() {
    var todos = ruta();
    var hechos = todos.filter(function (v) { return pr(v.id).completado; }).length;
    var pct = todos.length ? Math.round(hechos / todos.length * 100) : 0;
    var falta = todos.reduce(function (a, v) {
      var p = pr(v.id);
      return a + (p.completado ? 0 : Math.max(0, (Number(v.duracion_seg) || 0) - (p.segundos || 0)));
    }, 0);
    if ($('rail-pct'))   $('rail-pct').textContent = pct + '%';
    if ($('rail-bar'))   $('rail-bar').style.width = pct + '%';
    if ($('rail-count')) $('rail-count').textContent = hechos + ' de ' + todos.length + ' tutoriales';
    if ($('rail-left'))  $('rail-left').textContent = falta > 30 ? fmtLargo(falta) + ' restantes' : 'ruta completa';
    if ($('head-progress')) $('head-progress').textContent = hechos + ' de ' + todos.length + ' completados';

    var cuenta = { todos: todos.length, pendientes: 0, curso: 0, completos: 0 };
    todos.forEach(function (v) {
      var e = estado(v);
      cuenta[e === 'new' ? 'pendientes' : e === 'partial' ? 'curso' : 'completos']++;
    });
    ['todos', 'pendientes', 'curso', 'completos'].forEach(function (k) {
      if ($('f-' + k)) $('f-' + k).textContent = cuenta[k];
    });

    var faltan = todos.length - hechos;
    if ($('nudge-t')) {
      $('nudge-t').textContent = faltan === 0 ? 'Completaste los ' + todos.length + ' tutoriales'
        : faltan === 1 ? 'Te falta 1 tutorial para dominar Cobra'
        : 'Te faltan ' + faltan + ' tutoriales para dominar Cobra';
    }
    if ($('nudge-bar')) $('nudge-bar').style.width = pct + '%';
  }

  /* ══ ABRIR UN VIDEO ═════════════════════════════════════════════════════ */
  function videoDe(id) {
    for (var i = 0; i < S.videos.length; i++) if (S.videos[i].id === id) return S.videos[i];
    return null;
  }
  function moduloDe(v) {
    for (var i = 0; i < S.modulos.length; i++) if (S.modulos[i].id === v.modulo_id) return S.modulos[i];
    return null;
  }

  function abrir(id, reproducir) {
    var v = videoDe(id); if (!v) return;
    S.actual = id;
    var m = moduloDe(v) || { titulo: '' };
    S.abiertos[v.modulo_id] = true;

    var lista = ruta(), idx = lista.findIndex(function (x) { return x.id === id; });
    var p = pr(id), dur = Number(v.duracion_seg) || 0;

    if ($('crumb'))     $('crumb').textContent = 'Tutoriales · ' + m.titulo;
    if ($('v-topic'))   $('v-topic').textContent = m.titulo;
    if ($('v-title'))   $('v-title').textContent = v.titulo;
    if ($('ph-lbl'))    $('ph-lbl').textContent = '';
    if ($('panel-resumen')) $('panel-resumen').innerHTML = '<p class="tu-p">' + ESC(v.resumen || 'Sin resumen.') + '</p>';

    var est = estado(v);
    if ($('v-meta')) {
      $('v-meta').innerHTML =
        (dur ? '<span class="tu-badge">' + fmt(dur) + '</span>' : '')
        + '<span class="tu-badge">' + ({ basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' }[v.nivel] || 'Básico') + '</span>'
        + '<span class="tu-badge ' + (est === 'done' ? 'ok' : est === 'partial' ? 'brand' : '') + '">'
        + (est === 'done' ? 'Completado' : est === 'partial' ? 'En curso' : 'Sin ver') + '</span>'
        + '<span class="tu-badge">Lección ' + (idx + 1) + ' de ' + lista.length + '</span>';
    }

    /* El botón que lleva a la pantalla que enseña el video. Solo aparece si el
       video tiene destino: un botón que no lleva a ningún lado es peor que nada. */
    var ir = $('btn-ir');
    if (ir) {
      if (v.ruta_destino) {
        ir.hidden = false;
        ir.href = v.ruta_destino;
        ir.textContent = v.ruta_texto || 'Ir a la pantalla';
      } else { ir.hidden = true; }
    }

    pintarPasos(v, dur);
    pintarSiguiente(lista, idx);
    pintarFeedback(p);
    pintarBotonHecho(p);
    pintarRail();
    cargarYT(v, p, reproducir);
  }

  function pintarPasos(v, dur) {
    var pasos = Array.isArray(v.pasos) ? v.pasos : [];
    if ($('chap-n')) $('chap-n').textContent = pasos.length;
    if (!$('chap-list')) return;
    $('chap-list').innerHTML = pasos.length
      ? pasos.map(function (c, i) {
          return '<button class="tu-chap" data-seg="' + (Number(c.t) || 0) + '">'
            + '<span class="tu-chap-n">' + (i + 1) + '</span>'
            + '<span class="tu-chap-t">' + ESC(c.texto || '') + '</span>'
            + '<span class="tu-chap-m">' + fmt(c.t) + '</span></button>';
        }).join('')
      : '<div class="tu-empty">Este tutorial no tiene pasos marcados.</div>';
  }

  function pintarSiguiente(lista, idx) {
    var sig = lista[idx + 1];
    if ($('next-n')) $('next-n').textContent = sig ? sig.titulo : 'Fin de la ruta';
    if ($('next-s')) {
      var m = sig ? moduloDe(sig) : null;
      $('next-s').textContent = sig ? ((m ? m.titulo + ' · ' : '') + (sig.duracion_seg ? fmt(sig.duracion_seg) : '')) : '';
    }
    if ($('btn-gonext')) $('btn-gonext').disabled = !sig;
  }

  function pintarFeedback(p) {
    if ($('btn-yes')) $('btn-yes').classList.toggle('on', p.feedback === 'si');
    if ($('btn-no'))  $('btn-no').classList.toggle('on', p.feedback === 'no');
  }
  function pintarBotonHecho(p) {
    var b = $('btn-done'); if (!b) return;
    b.classList.toggle('is-done', !!p.completado);
    if ($('done-lbl')) $('done-lbl').textContent = p.completado ? 'Completado' : 'Marcar como completado';
  }

  /* ══ EL REPRODUCTOR DE YOUTUBE ══════════════════════════════════════════ */
  function cargarYT(v, p, reproducir) {
    if (!S.listo) { S._pendiente = [v, p, reproducir]; return; }
    var desde = (p.segundos > 5 && (!v.duracion_seg || p.segundos < v.duracion_seg - 5)) ? Math.floor(p.segundos) : 0;
    if (S.yt && S.yt.loadVideoById) {
      S.yt[reproducir ? 'loadVideoById' : 'cueVideoById']({ videoId: v.youtube_id, startSeconds: desde });
      return;
    }
    S.yt = new YT.Player('yt-player', {
      videoId: v.youtube_id,
      playerVars: {
        /* controls:0 — la barra que se ve es la del diseño, que maneja a este
           reproductor por su API. rel:0 y modestbranding:1 para que al terminar
           no aparezcan videos de otros canales dentro del sistema. */
        controls: 0, rel: 0, modestbranding: 1, playsinline: 1, start: desde,
      },
      events: {
        onReady: function () { if (reproducir) S.yt.playVideo(); sincronizar(); },
        onStateChange: alCambiarEstado,
      },
    });
  }

  function alCambiarEstado(e) {
    var jugando = e.data === YT.PlayerState.PLAYING;
    var pl = $('player'); if (pl) pl.classList.toggle('playing', jugando);
    if ($('ic-play')) {
      $('ic-play').innerHTML = jugando
        ? '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>' : '<path d="m7 5 12 7-12 7V5Z"/>';
    }
    if (jugando) arrancarTick(); else pararTick();
    if (jugando) guardarDuracion();
    if (e.data === YT.PlayerState.ENDED) marcarCompletado(true);
    if (!jugando) guardarProgreso(S.actual, { segundos: tiempo() });
  }

  /* La duración la sabe YouTube. Se guarda la primera vez que alguien abre el
     video, en vez de pedírsela a mano a quien lo sube — un dato que el sistema
     puede averiguar solo no debería depender de que alguien lo escriba bien. */
  async function guardarDuracion() {
    var v = videoDe(S.actual);
    if (!v || Number(v.duracion_seg) > 0 || !S.yt || !S.yt.getDuration) return;
    var d = Math.round(S.yt.getDuration());
    if (!d) return;
    v.duracion_seg = d;
    try { await sb().rpc('tuto_fijar_duracion', { p_video: v.id, p_seg: d }); } catch (e) {}
    pintarRail();
  }

  function tiempo() { return (S.yt && S.yt.getCurrentTime) ? S.yt.getCurrentTime() : 0; }
  function duracion() {
    var v = videoDe(S.actual);
    var d = (S.yt && S.yt.getDuration) ? S.yt.getDuration() : 0;
    return d || (v ? Number(v.duracion_seg) || 0 : 0);
  }

  function arrancarTick() {
    pararTick();
    S.tick = setInterval(sincronizar, 500);
  }
  function pararTick() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }

  var _guardadoUlt = 0;
  function sincronizar() {
    var b = $('scrub');
    if (b && b.classList.contains('dragging')) return;   // manda el dedo, no el reloj
    var t = tiempo(), d = duracion();
    if ($('time-cur')) $('time-cur').textContent = fmt(t);
    if ($('time-dur')) $('time-dur').textContent = d ? fmt(d) : '0:00';
    if ($('scrub-fill')) $('scrub-fill').style.width = (d ? Math.min(100, t / d * 100) : 0) + '%';

    var v = videoDe(S.actual);
    if (v) {
      var pasos = Array.isArray(v.pasos) ? v.pasos : [];
      var act = -1;
      pasos.forEach(function (c, i) { if (t >= (Number(c.t) || 0)) act = i; });
      if ($('chap-badge')) {
        $('chap-badge').hidden = act < 0;
        if (act >= 0) $('chap-badge').textContent = 'Cap. ' + (act + 1) + ' · ' + (pasos[act].texto || '');
      }
      document.querySelectorAll('#chap-list .tu-chap').forEach(function (el, i) {
        el.classList.toggle('on', i === act);
      });
    }

    /* Se guarda cada 5 s, no en cada tick: son 120 escrituras por minuto contra
       12, y la diferencia no se nota al reanudar. */
    if (Date.now() - _guardadoUlt > 5000) {
      _guardadoUlt = Date.now();
      if (S.actual) guardarProgreso(S.actual, { segundos: t });
    }
    if (d && t >= d * 0.97) marcarCompletado(true);
  }

  function marcarCompletado(auto) {
    var v = videoDe(S.actual); if (!v) return;
    var p = pr(v.id);
    if (auto && p.completado) return;
    var nuevo = auto ? true : !p.completado;
    guardarProgreso(v.id, { completado: nuevo, segundos: nuevo ? (duracion() || p.segundos) : p.segundos });
    pintarBotonHecho(pr(v.id));
    pintarRail();
    if (nuevo) toast('Tutorial completado · ' + v.titulo);
    else toast('Marcado como pendiente');
  }

  function toast(msg) {
    var d = document.createElement('div');
    d.className = 'cc-toast';
    d.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m4 12 5 5L20 6"/></svg><span>' + ESC(msg) + '</span>';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2600);
  }

  /* ══ EVENTOS ════════════════════════════════════════════════════════════ */
  function conectar() {
    document.addEventListener('click', function (e) {
      var it = e.target.closest && e.target.closest('.tu-item');
      if (it) { abrir(it.dataset.video, true); return; }

      var th = e.target.closest && e.target.closest('.tu-topic-head');
      if (th) {
        var id = th.parentNode.dataset.topic;
        S.abiertos[id] = !S.abiertos[id];
        pintarRail(); return;
      }

      var ch = e.target.closest && e.target.closest('.cc-fchip');
      if (ch) {
        S.filtro = ch.dataset.filter;
        document.querySelectorAll('.cc-fchip').forEach(function (x) { x.classList.toggle('on', x === ch); });
        pintarRail(); return;
      }

      var cap = e.target.closest && e.target.closest('.tu-chap');
      if (cap && S.yt) { S.yt.seekTo(Number(cap.dataset.seg) || 0, true); S.yt.playVideo(); return; }

      var tab = e.target.closest && e.target.closest('.cc-tab');
      if (tab) {
        document.querySelectorAll('.cc-tab').forEach(function (x) { x.classList.toggle('on', x === tab); });
        ['resumen', 'pasos', 'recursos'].forEach(function (k) {
          var el = $('panel-' + k); if (el) el.classList.toggle('on', k === tab.dataset.panel);
        });
        return;
      }

      var b = e.target.closest && e.target.closest('button');
      if (!b || !S.yt) return;
      var lista = ruta(), idx = lista.findIndex(function (x) { return x.id === S.actual; });
      switch (b.id) {
        case 'btn-play': case 'btn-bigplay': case 'btn-resume':
          if (S.yt.getPlayerState && S.yt.getPlayerState() === YT.PlayerState.PLAYING) S.yt.pauseVideo();
          else S.yt.playVideo();
          break;
        case 'btn-prev': if (lista[idx - 1]) abrir(lista[idx - 1].id, true); break;
        case 'btn-next': case 'btn-gonext': if (lista[idx + 1]) abrir(lista[idx + 1].id, true); break;
        case 'btn-restart': S.yt.seekTo(0, true); S.yt.playVideo(); break;
        case 'btn-done': marcarCompletado(false); break;
        case 'btn-speed': {
          var vels = [1, 1.25, 1.5, 2];
          S.vel = vels[(vels.indexOf(S.vel) + 1) % vels.length];
          S.yt.setPlaybackRate(S.vel);
          b.textContent = S.vel + 'x';
          break;
        }
        case 'btn-full': {
          var pl = $('player');
          if (document.fullscreenElement) document.exitFullscreen();
          else if (pl && pl.requestFullscreen) pl.requestFullscreen();
          break;
        }
        case 'btn-yes': case 'btn-no': {
          var val = b.id === 'btn-yes' ? 'si' : 'no';
          var p = pr(S.actual);
          guardarProgreso(S.actual, { feedback: p.feedback === val ? null : val });
          pintarFeedback(pr(S.actual));
          break;
        }
        case 'btn-continue': case 'btn-nudge': {
          var enCurso = lista.find(function (x) { return estado(x) === 'partial'; })
                     || lista.find(function (x) { return estado(x) === 'new'; });
          if (b.id === 'btn-nudge') {
            var chip = document.querySelector('.cc-fchip[data-filter="pendientes"]');
            if (chip) chip.click();
            if ($('search')) $('search').value = '';
            S.busca = '';
            pintarRail();
          } else if (enCurso) abrir(enCurso.id, true);
          break;
        }
      }
    });

    if ($('search')) {
      $('search').addEventListener('input', function () { S.busca = this.value; pintarRail(); });
    }
    /* La barra se DESLIZA, no solo se toca. La mayoria de la gente arrastra por
       sentido comun; con solo el toque hay que acertar al punto exacto a la
       primera. Mientras se arrastra solo se mueve lo que se ve; el salto de
       verdad se hace al soltar, para no pedirle a YouTube cien saltos seguidos. */
    var barra = $('scrub');
    if (barra) {
      var arrastrando = false;

      function posicion(e) {
        var r = barra.getBoundingClientRect();
        var x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
        return r.width ? x / r.width : 0;
      }
      function pintarArrastre(f) {
        var d = duracion();
        if ($('scrub-fill')) $('scrub-fill').style.width = (f * 100) + '%';
        if ($('time-cur')) $('time-cur').textContent = fmt(f * d);
      }
      function soltar(e) {
        if (!arrastrando) return;
        arrastrando = false;
        barra.classList.remove('dragging');
        document.removeEventListener('pointermove', mover);
        document.removeEventListener('pointerup', soltar);
        document.removeEventListener('pointercancel', soltar);
        var d = duracion();
        if (S.yt && d) { S.yt.seekTo(posicion(e) * d, true); sincronizar(); }
        /* Se vuelve a mandar el minuto: si se suelta y se cierra la pantalla de
           una, el guardado periodico todavia no habia pasado por aqui. */
        if (S.actual) guardarProgreso(S.actual, { segundos: tiempo() });
      }
      function mover(e) {
        if (!arrastrando) return;
        e.preventDefault();
        pintarArrastre(posicion(e));
      }

      barra.addEventListener('pointerdown', function (e) {
        if (!S.yt) return;
        arrastrando = true;
        barra.classList.add('dragging');
        pintarArrastre(posicion(e));
        /* Los eventos se escuchan en el DOCUMENTO y no en la barra: si se
           escucharan en la barra, sacar el dedo de ella mientras se arrastra
           dejaria el arrastre colgado. */
        document.addEventListener('pointermove', mover);
        document.addEventListener('pointerup', soltar);
        document.addEventListener('pointercancel', soltar);
      });
    }
    /* Al salir de la pantalla se guarda el minuto exacto: si no, se pierden los
       últimos segundos y al volver el video arranca antes de donde iba. */
    window.addEventListener('beforeunload', function () {
      if (S.actual && S.yt) guardarProgreso(S.actual, { segundos: tiempo() });
    });
  }

  /* ══ ARRANQUE ═══════════════════════════════════════════════════════════ */
  window.onYouTubeIframeAPIReady = function () {
    S.listo = true;
    if (S._pendiente) { cargarYT.apply(null, S._pendiente); S._pendiente = null; }
  };

  /* La cuenta de quien tiene la sesion abierta, arriba a la derecha. Con los
     MISMOS ids que el dashboard: asi pos-brand.js encuentra el circulo y le
     pone la foto del restaurante sin que haya que decirle nada. */
  function pintarCuenta() {
    var u = usuario(); if (!u) return;
    var meta = u.user_metadata || {};
    var nombre = meta.nombre || meta.full_name || u.email || '';
    if ($('tb-uname')) $('tb-uname').textContent = nombre || 'Mi cuenta';
    if ($('tb-urole')) {
      var r = meta.role || '';
      $('tb-urole').textContent = r ? r[0].toUpperCase() + r.slice(1) : 'Usuario';
    }
    var av = $('tb-avatar');
    if (av && !av.querySelector('img')) {
      av.textContent = (nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2)
        .map(function (w) { return w[0]; }).join('').toUpperCase() || '?';
    }
  }

  async function iniciar() {
    pintarCuenta();
    await cargar();
    conectar();
    pintarRail();
    if (!S.videos.length) {
      var st = document.querySelector('.tu-stage-in');
      if (st) st.innerHTML = '<div class="tu-empty" style="padding:60px 20px">'
        + 'Todavía no hay tutoriales publicados.</div>';
      return;
    }
    // La librería de YouTube se pide solo cuando de verdad hay videos que ver.
    var t = document.createElement('script');
    t.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(t);

    var lista = ruta();
    var seguir = lista.find(function (x) { return estado(x) === 'partial'; }) || lista[0];
    if (seguir) abrir(seguir.id, false);
  }

  if (window._pos && window._pos.on) window._pos.on('core:ready', iniciar);
  else document.addEventListener('DOMContentLoaded', iniciar);
})();
