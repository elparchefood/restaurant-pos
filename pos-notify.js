/* pos-notify.js — Aviso GLOBAL de nuevos mensajes de chat (WhatsApp/IG/FB).
   Muestra un toast arriba a la derecha + un sonido corto; al tocarlo va al chat.
   Se carga en las pantallas de operación (después de pos-core.js). No corre en el chat. */
(function () {
  if (location.pathname.indexOf('chat-ia') >= 0) return;   // en el chat ya se ven los mensajes

  var started = false, lastTs = 0;

  function start() {
    if (started) return;
    if (typeof sb === 'undefined' || !sb || !sb.auth) { setTimeout(start, 600); return; }
    started = true;
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session; if (!s) return;
      var tenant = (s.user && s.user.user_metadata) ? s.user.user_metadata.tenant_id : null;
      if (!tenant) return;
      sb.channel('notify-msgs-' + tenant)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'tenant_id=eq.' + tenant }, function (payload) {
          var m = payload && payload.new; if (!m || m.direction !== 'in') return;
          var now = Date.now(); if (now - lastTs < 400) { lastTs = now; return; } lastTs = now;   // anti-ráfaga
          notif(m);
        })
        .subscribe();
    }).catch(function () {});
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      var ctx = new Ctx(); var o = ctx.createOscillator(); var g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.09, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.start(); setTimeout(function () { try { o.stop(); ctx.close(); } catch (e) {} }, 280);
    } catch (e) {}
  }

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
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
