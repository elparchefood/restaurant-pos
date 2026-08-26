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
    SB.channel('pos-notify-msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: _ft }, function (payload) {
        var m = payload && payload.new; if (!m || m.direction !== 'in') return;
        /* El simulador de Paco escribe mensajes de verdad para probar el motor,
           pero NO es un cliente: ni suena ni avisa. */
        if (m.origen === 'preview') return;
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
  /* Curva de saturación suave (tanh). Cerca de cero es casi una recta, así que
     los volúmenes bajos pasan limpios; arriba se dobla y nunca se sale de 1.
     Se calcula una vez: son 1.024 valores y no cambian nunca. */
  var CURVA_SUAVE = (function () {
    var n = 1024, c = new Float32Array(n), k = 2.5, tk = Math.tanh(k);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / (n - 1) - 1;
      c[i] = Math.tanh(k * x) / tk;
    }
    return c;
  })();

  /* ══════════════════════════════════════════════════════════════════
     LA GRABACIÓN DE CAJA REGISTRADORA

     Los cuatro tonos de abajo son FABRICADOS: ondas puras armadas aquí mismo.
     Este no: es una grabación real que trajo Sergio, ya recortada a 1,34 s,
     comprimida y nivelada para que quede al mismo volumen que los otros
     (medido: -14,0 dB, igual que Campana).

     Va incrustada dentro del código y no como archivo aparte, para que suene
     igual en el .exe y en el navegador y no dependa de poder descargar nada en
     el momento — que es exactamente el error que dejó la carta sin fotos.
     Son 17 KB.

     OJO: una grabación NO puede pasar por la misma cadena que los tonos
     fabricados. A los fabricados se les mete una curva de saturación para que
     suenen fuertes, porque vienen "vacíos"; una grabación ya trae toda su
     energía adentro y con ese mismo empuje se frita. Por eso tiene su propio
     camino, más abajo.
     ══════════════════════════════════════════════════════════════════ */
  var GRABADOS = {
    caja: { nombre: 'Caja registradora', datos: "data:audio/mpeg;base64,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" },
  };

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
    /* Tres pulsos y sube: para cocina ruidosa.
       Los pulsos duran mas de lo que parece necesario a proposito. Con notas de
       9 centesimas medía 4 dB MENOS de energia que los demas tonos — o sea que
       el tono "para cuando hay ruido" era el mas flojo de los cuatro. Alargarlos
       no cambia el caracter y sí lo hace oirse. */
    alerta: {
      notas: [
        { t: 0,    f: 880.00, dur: 0.16, ataque: 0.002, parciales: [[1, 1], [2, 0.45], [3, 0.20]] },
        { t: 0.15, f: 880.00, dur: 0.16, ataque: 0.002, parciales: [[1, 1], [2, 0.45], [3, 0.20]] },
        { t: 0.30, f: 1174.66, dur: 0.42, ataque: 0.002, parciales: [[1, 1], [2, 0.40], [3, 0.16]] },
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
        tono: (TONOS[n.tono] || GRABADOS[n.tono]) ? n.tono : 'clasico',
      };
    } catch (e) { return { activo: true, vol: 60, tono: 'clasico' }; }
  }

  /* Un contexto propio y duradero para las grabaciones: así se descodifica el
     audio UNA sola vez y las veces siguientes suena al instante. */
  var ctxGrab = null, bufGrab = {}, bajando = {};

  function ctxGrabado() {
    if (!ctxGrab) ctxGrab = new (window.AudioContext || window.webkitAudioContext)();
    if (ctxGrab.state === 'suspended') { try { ctxGrab.resume(); } catch (e) {} }
    return ctxGrab;
  }

  function bytesDeBase64(d) {
    var bin = atob(String(d).split(',')[1] || ''), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  function tocarGrabado(clave, cfg) {
    var c = ctxGrabado();
    function lanzar() {
      var buf = bufGrab[clave]; if (!buf) return;
      var s = c.createBufferSource(); s.buffer = buf;
      /* La misma curva al cuadrado que los tonos, para que la barra de volumen
         se comporte igual, pero con ganancia propia: medido, con la ganancia de
         los tonos la grabación quedaba 4,5 dB por debajo y cambiar de sonido se
         habría sentido como si bajaran el volumen. */
      var nivel = Math.pow(Math.max(0, Math.min(100, cfg.vol)) / 100, 2);
      var g = c.createGain(); g.gain.value = 0.05 + 1.55 * nivel;
      var lim = c.createDynamicsCompressor();
      lim.threshold.value = -8; lim.knee.value = 4; lim.ratio.value = 10;
      lim.attack.value = 0.001; lim.release.value = 0.10;
      s.connect(g); g.connect(lim); lim.connect(c.destination);
      s.start();
    }
    if (bufGrab[clave]) return lanzar();
    if (bajando[clave]) return;               // ya se está descodificando
    bajando[clave] = true;
    try {
      c.decodeAudioData(bytesDeBase64(GRABADOS[clave].datos),
        function (b) { bufGrab[clave] = b; bajando[clave] = false; lanzar(); },
        function ()  { bajando[clave] = false; console.warn('[aviso] no se pudo leer el sonido', clave); });
    } catch (e) { bajando[clave] = false; }
  }

  function beep(forzar, cfgDado) {
    try {
      var cfg = cfgDado || cfgNotif();
      /* `forzar` es para el botón Probar: deja oír el tono aunque el aviso esté
         apagado. Pero NO se salta el volumen en cero — barra en cero significa
         silencio, y un botón que suena con el volumen abajo confunde más de lo
         que ayuda. */
      if (!cfg.activo && !forzar) return;
      if (cfg.vol <= 0) return;
      // Las grabaciones van por su propio camino; lo de abajo es para los tonos.
      if (GRABADOS[cfg.tono]) { tocarGrabado(cfg.tono, cfg); return; }
      var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;

      var ctx = new Ctx();
      /* Un filtro suave arriba: los parciales agudos son los que raspan en el
         parlante pequeño de una tablet. Quitarlos no cambia el carácter del
         sonido y sí quita el chirrido. */
      /* LA CADENA DE SONIDO — por qué no basta con subir el número.

         Sergio tenía el volumen al 100% y aun así sonaba flojo. Subir la
         ganancia no lo arregla: un pitido de ondas puras tiene mucho PICO y
         poca ENERGÍA, y el oído oye energía, no picos. Al llegar el pico a 1
         ya no se puede subir más sin que reviente, y sigue sonando suave.

         Lo que sí sube el volumen percibido, sin pasarse del tope:
           · una curva de saturación suave, que redondea los picos y llena el
             hueco con armónicos — el sonido queda "gordo" en vez de más alto;
           · un realce en 3 kHz, que es donde el oído humano es más sensible
             (por eso los pitos de los electrodomésticos viven ahí);
           · un compresor al final, que empareja y deja subir el conjunto.

         Con la barra abajo nada de esto actúa: la señal es tan pequeña que
         pasa derecho, limpia y suave. La saturación solo aparece arriba. */
      var nivel = Math.pow(Math.max(0, Math.min(100, cfg.vol)) / 100, 2);

      // Empuje: al 100% mete la señal DENTRO de la curva de saturación.
      var empuje = ctx.createGain();
      empuje.gain.value = 0.02 + 3.40 * nivel;

      var forma = ctx.createWaveShaper();
      forma.curve = CURVA_SUAVE;
      forma.oversample = '4x';        // sin esto la saturación suena a arena

      var presencia = ctx.createBiquadFilter();
      presencia.type = 'peaking';
      presencia.frequency.value = 3000; presencia.Q.value = 1.1; presencia.gain.value = 5;

      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 9000; lp.Q.value = 0.7;

      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8;
      comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;

      var salida = ctx.createGain();
      salida.gain.value = 1.00;

      var master = empuje;   // las notas se cuelgan aquí
      empuje.connect(forma); forma.connect(presencia); presencia.connect(lp);
      lp.connect(comp); comp.connect(salida); salida.connect(ctx.destination);

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
  /* Tocar un tono concreto, sin depender de lo que este guardado. Antes esto
     escribia en localStorage, sonaba, y restauraba el valor 50 ms despues —un
     truco que funcionaba para el boton Probar y que en la cocina, sonando
     cada dos minutos, habria sido una fuente de sustos. */
  window.posTocarTono = function (tono, vol) {
    beep(true, {
      activo: true,
      tono: (TONOS[tono] || GRABADOS[tono]) ? tono : 'clasico',
      vol: (typeof vol === 'number') ? Math.max(0, Math.min(100, vol)) : 60,
    });
  };
  window.posNotifProbar = function (tono, vol) { window.posTocarTono(tono, vol); };

  /* Los tonos que existen, para que las pantallas de configuracion los pinten
     sin tener que repetir la lista. */
  window.posTonosDisponibles = function () {
    return [
      { id:'suave',   nombre:'Suave' },
      { id:'clasico', nombre:'Clasico' },
      { id:'campana', nombre:'Campana' },
      { id:'alerta',  nombre:'Alerta' },
      { id:'caja',    nombre:'Caja registradora' },
    ];
  };

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
  // Solo para el banco de pruebas: permite disparar el aviso sin base de datos.
  window.__notifPrueba = notif;

  if (enChat || enCocina) return;   // ahi solo el sonido; el aviso flotante no
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
