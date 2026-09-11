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

  /* LA COCINA USA ESTE ARCHIVO SOLO POR EL SONIDO.
     El banco de tonos y el reproductor viven aquí y están afinados a mano
     (los pulsos del tono «alerta» duran más de lo que parece necesario porque
     medían 4 dB menos que el resto). Duplicarlos en la pantalla de cocina
     habría sido garantizar que un día suenen distinto. Así que la cocina carga
     este archivo y usa `posTocarTono`, pero NO se suscribe al chat: un
     cocinero no tiene por qué recibir avisos de WhatsApp en la pared. */
  var enCocina = location.pathname.indexOf('cocina') >= 0;

  /* ¿ESTÁ ABIERTA LA VENTANA DEL CHAT?

     Sergio casi siempre trabaja con dos ventanas: el chat y otra pantalla.
     Cuando entraba un mensaje sonaban LAS DOS —el aviso del chat y el de la
     otra— casi al tiempo. Se oía como un solo ruido raro, y por eso parecía que
     el tono no cambiaba nunca: eran dos tonos encimados.

     Regla: si la ventana del chat está abierta, solo suena el chat. Las otras
     pantallas solo suenan cuando el chat NO está abierto.

     La ventana del chat deja una marca de tiempo cada 3 segundos. Las demás
     miran si esa marca es reciente. Se usa el almacenamiento del navegador
     porque es lo único que comparten dos ventanas distintas del mismo equipo.
     Si el chat se cierra de golpe y no alcanza a borrar su marca, a los 9
     segundos vence sola y las otras pantallas vuelven a sonar. */
  var LATIDO = 'pos.chat.abierto';

  function chatAbierto() {
    try {
      var t = Number(localStorage.getItem(LATIDO) || 0);
      return t > 0 && (Date.now() - t) < 9000;
    } catch (e) { return false; }   // sin acceso al almacenamiento: mejor que suene
  }

  if (enChat) {
    var latir = function () { try { localStorage.setItem(LATIDO, String(Date.now())); } catch (e) {} };
    latir();
    setInterval(latir, 3000);
    var apagar = function () { try { localStorage.removeItem(LATIDO); } catch (e) {} };
    window.addEventListener('beforeunload', apagar);
    window.addEventListener('pagehide', apagar);
  }

  var started = false, lastTs = 0, tries = 0;

  function getSB() {
    try { if (typeof sb !== 'undefined' && sb && sb.channel) return sb; } catch (e) {}
    if (window._pos && window._pos.sb && window._pos.sb.channel) return window._pos.sb;
    if (window.sb && window.sb.channel) return window.sb;
    return null;
  }

  /* ¿A esta persona le corresponde enterarse de los mensajes del chat?

     Regla de Sergio: al MESERO no le llegan. El chat no es su trabajo, y un
     aviso cada vez que escribe un cliente lo distrae en plena mesa.

     No se pregunta por el nombre del rol ("mesero") sino por el PERMISO de usar
     el chat. Cobra se vende a otros restaurantes y cada uno le pone el nombre
     que quiera a sus roles; el permiso, en cambio, es el mismo en todos. Quien
     no puede abrir el chat tampoco necesita que le avisen de él.

     Si el módulo de permisos no está o falla, SÍ avisa. Que a un mesero le
     suene de más es una molestia; que el dueño se pierda un pedido porque los
     permisos no cargaron es plata. */
  function leCorresponde(cb) {
    if (typeof window.posPermsReady !== 'function' || typeof window.posHasPerm !== 'function') { cb(true); return; }
    var listo = false;
    var responder = function (v) { if (!listo) { listo = true; cb(v); } };
    // Red de seguridad: si los permisos no resuelven en 6 s, se avisa igual.
    setTimeout(function () { responder(true); }, 6000);
    try {
      Promise.resolve(window.posPermsReady()).then(function () {
        responder(window.posHasPerm('chat.usar') !== false);
      }).catch(function () { responder(true); });
    } catch (e) { responder(true); }
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

    // Al mesero no se le avisa: ni el sonido ni el aviso de pantalla.
    leCorresponde(function (si) { if (si) suscribir(SB); });
  }

  function suscribir(SB) {
    /* Filtrado por RESTAURANTE: `chat_messages` no tiene `branch_id`, solo
       `tenant_id`. Igual pasa de "todos los mensajes del sistema" a "los míos",
       que es casi toda la mejora. RLS sigue siendo quien aísla. */
    var _tn = window._pos && window._pos.state && window._pos.state.tenantId;
    var _ft = _tn ? 'tenant_id=eq.' + _tn : undefined;
    /*  ══ EL TIMBRE POR BROADCAST (29-ago-2026) ═══════════════════════════
        El mismo cambio que el chat: el disparador de la base manda cada
        mensaje por el canal privado del restaurante y el timbre lo escucha
        por ahi — llega antes y no obliga al servidor a comprobar permisos
        fila por fila POR CADA PANTALLA ABIERTA, que con este modulo cargado
        en once pantallas era la suscripcion mas repetida del sistema.

        El postgres_changes se queda de RESPALDO. Como los dos caminos traen
        el mismo mensaje, se recuerda el ultimo id sonado: el segundo aviso
        del mismo mensaje no suena. */
    var yaSono = {};
    function alLlegar(m) {
      if (!m || m.direction !== 'in') return;
      /* El simulador de Paco escribe mensajes de verdad para probar el motor,
         pero NO es un cliente: ni suena ni avisa. */
      if (m.origen === 'preview') return;
      if (m.id && yaSono[m.id]) return;              // ya llego por el otro camino
      if (m.id) {
        yaSono[m.id] = true;
        setTimeout(function () { delete yaSono[m.id]; }, 60000);
      }
      var now = Date.now(); if (now - lastTs < 400) { lastTs = now; return; } lastTs = now;   // anti-ráfaga
      notif(m);
    }

    SB.channel('pos-notify-msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: _ft }, function (payload) {
        alLlegar(payload && payload.new);
      })
      .subscribe();

    if (_tn) {
      try {
        SB.channel('chat-b:' + _tn, { config: { private: true } })
          .on('broadcast', { event: 'msg' }, function (b) {
            var m = b && (b.payload && b.payload.payload ? b.payload.payload : b.payload);
            alLlegar(m);
          })
          .subscribe();
      } catch (e) { console.warn('[notify] broadcast:', e && e.message); }
    }
  }

  /* EL BANCO DE TONOS Y EL REPRODUCTOR SE MUDARON A pos-tonos.js (10-sep-2026):
     el timbre de "listo" tiene que sonar en TODAS las pantallas y este archivo
     solo se carga en once. Siguen siendo UNA sola copia, ahora alla. */
  function beep(forzar, cfgDado) { try { if (window.posBeep) window.posBeep(forzar, cfgDado); } catch (e) {} }

  function notif(m) {
    /* El aviso visual se queda: ver que entro un mensaje sin cambiar de ventana
       sigue sirviendo. Lo que no se repite es el SONIDO. */
    if (!chatAbierto()) beep();
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
    el.onclick = function () { (window.posIr || function (h) { window.location.href = h; })('chat-ia.html'); };   // PIN antes (10-sep)
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
  // Solo para el banco de pruebas: permite disparar el aviso sin base de datos.
  window.__notifPrueba = notif;

  if (enChat || enCocina) return;   // ahi solo el sonido; el aviso flotante no
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
