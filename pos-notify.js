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

  /* Tonos disponibles. Se eligen en Configuración → Operación → Notificaciones.
     Cada uno son dos notas: la primera llama la atención y la segunda cierra,
     para que se distinga de cualquier otro pitido del local. */
  var TONOS = {
    suave:   { tipo: 'sine',     f1: 660, f2: 880, dur: 0.30 },
    clasico: { tipo: 'sine',     f1: 880, f2: 660, dur: 0.25 },
    campana: { tipo: 'triangle', f1: 1320, f2: 990, dur: 0.45 },
    alerta:  { tipo: 'square',   f1: 740, f2: 988, dur: 0.22 },
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
      var t = TONOS[cfg.tono] || TONOS.clasico;
      // 0.15 al 100% es el techo: más alto satura en las tablets.
      var vol = (cfg.vol / 100) * 0.15;
      var ctx = new Ctx(); var o = ctx.createOscillator(); var g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = t.tipo;
      o.frequency.setValueAtTime(t.f1, ctx.currentTime);
      o.frequency.setValueAtTime(t.f2, ctx.currentTime + t.dur * 0.4);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t.dur);
      o.start();
      setTimeout(function () { try { o.stop(); ctx.close(); } catch (e) {} }, t.dur * 1000 + 30);
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
