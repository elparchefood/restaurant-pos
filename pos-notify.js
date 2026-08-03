/* pos-notify.js — Aviso GLOBAL de nuevos mensajes de chat (WhatsApp/IG/FB).
   Muestra un toast arriba a la derecha + un sonido corto; al tocarlo va al chat.
   Se carga en las pantallas de operación (después de pos-core.js). No corre en el chat. */
(function () {
  /* En el chat NO se muestra el aviso flotante —los mensajes ya se ven ahí—,
     pero el SONIDO sí tiene que sonar, y con el tono y el volumen que el dueño
     escogió. Antes este archivo se salía completo en el chat y chat-ia.js
     tocaba un pitido suyo, fijo: subir el volumen en Configuración no hacía
     nada mientras se estaba en la pantalla del chat. */
  var enChat = location.pathname.indexOf('chat-ia') >= 0;

  var started = false, lastTs = 0, tries = 0;

  function getSB() {
    try { if (typeof sb !== 'undefined' && sb && sb.channel) return sb; } catch (e) {}
    if (window._pos && window._pos.sb && window._pos.sb.channel) return window._pos.sb;
    if (window.sb && window.sb.channel) return window.sb;
    return null;
  }

  function start() {
    if (started) return;
    var SB = getSB();
    /* Se espera al cliente de Supabase Y al tenant. Si se suscribe antes de que
       pos-core llene el estado, el filtro sale vacio y esta pantalla vuelve a
       escuchar los mensajes de TODO el sistema. Si tras los reintentos sigue sin
       tenant, arranca igual (sin filtro): mejor sin filtrar que sin avisar. */
    var _tn0 = window._pos && window._pos.state && window._pos.state.tenantId;
    if (!SB || !_tn0) { if (tries++ < 40) { setTimeout(start, 700); return; } }
    if (!SB) return;
    started = true;
    /* Filtrado por RESTAURANTE: `chat_messages` no tiene `branch_id`, solo
       `tenant_id`. Igual pasa de "todos los mensajes del sistema" a "los míos",
       que es casi toda la mejora. RLS sigue siendo quien aísla. */
    var _tn = window._pos && window._pos.state && window._pos.state.tenantId;
    var _ft = _tn ? 'tenant_id=eq.' + _tn : undefined;
    SB.channel('pos-notify-msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: _ft }, function (payload) {
        var m = payload && payload.new; if (!m || m.direction !== 'in') return;
        var now = Date.now(); if (now - lastTs < 400) { lastTs = now; return; } lastTs = now;   // anti-ráfaga
        notif(m);
      })
      .subscribe();
  }

  /* Los cuatro tonos. Se eligen en Configuración → Operación → Notificaciones.

     Antes cada uno era un oscilador pelado haciendo dos notas seguidas: sonaba
     a pitido de microondas y los cuatro se parecían entre sí. Lo que hace que
     un sonido se oiga "bien" no es la nota, son los ARMÓNICOS y cómo se apaga.
     Así que cada nota aquí se arma con varios osciladores a la vez —el
     fundamental y sus parciales, cada uno con su peso— y se apaga con una
     curva, no de golpe.

     La campana lleva parciales INARMÓNICOS (0,5 · 1 · 1,2 · 1,5 · 2 · 2,66).
     Ese desajuste es literalmente lo que hace que un metal suene a metal; con
     armónicos exactos suena a órgano.

     Las notas son intervalos musicales de verdad (quintas y terceras), por eso
     las dos que suenan juntas no chocan. */
  var TONOS = {
    // Marimba: ataque redondo, dos notas bajando una cuarta. Para local tranquilo.
    suave: {
      notas: [
        { t: 0,    f: 783.99, dur: 0.45, ataque: 0.012, parciales: [[1, 1], [2, 0.16], [3, 0.05]] },
        { t: 0.12, f: 587.33, dur: 0.60, ataque: 0.012, parciales: [[1, 1], [2, 0.14], [3, 0.04]] },
      ],
    },
    // Timbre de puerta: tercera mayor descendente, el aviso que todo el mundo reconoce.
    clasico: {
      notas: [
        { t: 0,    f: 987.77, dur: 0.30, ataque: 0.004, parciales: [[1, 1], [2, 0.30], [3, 0.11], [4, 0.04]] },
        { t: 0.14, f: 659.25, dur: 0.55, ataque: 0.004, parciales: [[1, 1], [2, 0.26], [3, 0.09], [4, 0.03]] },
      ],
    },
    // Campana de verdad: una sola nota, parciales inarmónicos, cola larga.
    campana: {
      notas: [
        { t: 0, f: 659.25, dur: 1.6, ataque: 0.002,
          parciales: [[0.5, 0.22], [1, 1], [1.2, 0.45], [1.5, 0.30], [2, 0.20], [2.66, 0.12], [3.01, 0.07]] },
      ],
    },
    // Tres pulsos y sube: para cocina ruidosa, sin llegar a chillido.
    alerta: {
      notas: [
        { t: 0,    f: 880.00, dur: 0.09, ataque: 0.002, parciales: [[1, 1], [2, 0.45], [3, 0.20]] },
        { t: 0.13, f: 880.00, dur: 0.09, ataque: 0.002, parciales: [[1, 1], [2, 0.45], [3, 0.20]] },
        { t: 0.26, f: 1174.66, dur: 0.26, ataque: 0.002, parciales: [[1, 1], [2, 0.40], [3, 0.16]] },
      ],
    },
  };

  function cfgNotif() {
    try {
      var op = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
      var n = op.notif || {};
      return {
        activo: n.activo !== false,
        vol: (typeof n.vol === 'number') ? Math.max(0, Math.min(100, n.vol)) : 60,
        tono: TONOS[n.tono] ? n.tono : 'clasico',
      };
    } catch (e) { return { activo: true, vol: 60, tono: 'clasico' }; }
  }

  function beep(forzar) {
    try {
      var cfg = cfgNotif();
      if (!cfg.activo && !forzar) return;
      if (cfg.vol <= 0 && !forzar) return;
      var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;

      var ctx = new Ctx();
      /* Un filtro suave arriba: los parciales agudos son los que raspan en el
         parlante pequeño de una tablet. Quitarlos no cambia el carácter del
         sonido y sí quita el chirrido. */
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 7000; lp.Q.value = 0.7;
      var master = ctx.createGain();
      // 0,20 al 100% es el techo: más alto satura en las tablets.
      master.gain.value = (cfg.vol / 100) * 0.20;
      master.connect(lp); lp.connect(ctx.destination);

      var t = TONOS[cfg.tono] || TONOS.clasico;
      var ahora = ctx.currentTime + 0.02, fin = 0;

      t.notas.forEach(function (n) {
        var ps = n.parciales || [[1, 1]];
        // Se reparte el volumen entre los parciales de la nota; si no, una nota
        // con siete parciales sonaría al doble y recortaría.
        var suma = ps.reduce(function (s, x) { return s + x[1]; }, 0) || 1;
        var t0 = ahora + n.t;
        ps.forEach(function (pp) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(n.f * pp[0], t0);
          var pico = Math.max(0.0002, pp[1] / suma);
          var atk = n.ataque || 0.005;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(pico, t0 + atk);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
          o.connect(g); g.connect(master);
          o.start(t0); o.stop(t0 + n.dur + 0.03);
        });
        fin = Math.max(fin, n.t + n.dur);
      });

      setTimeout(function () { try { ctx.close(); } catch (e) {} }, (fin + 0.35) * 1000);
    } catch (e) {}
  }
  // Para poder oírlo al configurarlo, aunque las notificaciones estén apagadas.
  window.posNotifProbar = function (tono, vol) {
    var prev = localStorage.getItem('pos.config.operacion.v1');
    try {
      var op = JSON.parse(prev || '{}');
      op.notif = { activo: true, tono: tono, vol: vol };
      localStorage.setItem('pos.config.operacion.v1', JSON.stringify(op));
      beep(true);
    } catch (e) {}
    setTimeout(function () { if (prev !== null) localStorage.setItem('pos.config.operacion.v1', prev); }, 50);
  };

  function notif(m) {
    beep();
    var host = document.getElementById('pos-notify-host');
    if (!host) {
      host = document.createElement('div'); host.id = 'pos-notify-host';
      host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(host);
    }
    var body = String(m.body || '').replace(/\[[^\]]*\]/g, '').trim().slice(0, 64) || 'Toca para ver';
    var el = document.createElement('div');
    el.style.cssText = 'pointer-events:auto;min-width:240px;max-width:320px;background:#111827;color:#fff;border:1px solid rgba(139,92,246,.55);border-left:4px solid #8B5CF6;border-radius:12px;padding:11px 14px;box-shadow:0 12px 34px rgba(0,0,0,.4);cursor:pointer;font-family:system-ui,Arial,sans-serif;animation:posNotifIn .25s ease;';
    el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;margin-bottom:3px"><span style="font-size:15px">💬</span> Nuevo mensaje <span style="margin-left:auto;font-size:16px;opacity:.6">›</span></div>'
      + '<div style="font-size:12.5px;color:rgba(255,255,255,.78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + body.replace(/</g, '&lt;') + '</div>';
    el.onclick = function () { window.location.href = 'chat-ia.html'; };
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .35s, transform .35s'; el.style.opacity = '0'; el.style.transform = 'translateX(18px)';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 360);
    }, 7000);
  }

  if (!document.getElementById('pos-notify-style')) {
    var st = document.createElement('style'); st.id = 'pos-notify-style';
    st.textContent = '@keyframes posNotifIn{from{transform:translateX(22px);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(st);
  }
  /* El sonido, disponible para quien lo necesite con la configuración del
     dueño ya aplicada. Es la única copia: el tono y el volumen se definen en un
     solo sitio. */
  window.posNotifSonar = function () { beep(); };

  if (enChat) return;   // en el chat, solo el sonido; el aviso flotante no
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
