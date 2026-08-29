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
  /* LAS GRABACIONES VIVEN EN `assets/son/`, no aqui dentro.
     Metidas como texto engordaban este archivo un 35% mas de lo que
     pesan, y este archivo lo carga CADA pantalla. Con diez sonidos
     serian medio mega que todo el mundo descarga aunque nunca oiga
     uno. Asi solo se baja el que de verdad suena, y una sola vez. */
  var GRABADOS = {
    caja: { nombre: 'Caja registradora', url: 'assets/son/caja.mp3' },
    xilofono: { nombre: 'Xilófono', url: 'assets/son/xilofono.mp3' },
    bici: { nombre: 'Timbre de bicicleta', url: 'assets/son/bici.mp3' },
    golpes: { nombre: 'Dos golpes', url: 'assets/son/golpes.mp3' },
    aero2: { nombre: 'Bing-bong', url: 'assets/son/aero2.mp3' },
    aerocorto: { nombre: 'Bing-bong corto', url: 'assets/son/aerocorto.mp3' },
    aerosube: { nombre: 'Aeropuerto · subiendo', url: 'assets/son/aerosube.mp3' },
    aerobaja: { nombre: 'Aeropuerto · bajando', url: 'assets/son/aerobaja.mp3' },
    aero4: { nombre: 'Aeropuerto · cuatro notas', url: 'assets/son/aero4.mp3' },
    tren: { nombre: 'Estación de tren', url: 'assets/son/tren.mp3' },
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
    /* Se trae una vez y se queda en memoria: la primera comanda de la noche
       tarda unas decimas en sonar, las demas son instantaneas. */
    try {
      fetch(GRABADOS[clave].url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) {
          c.decodeAudioData(ab,
            function (b) { bufGrab[clave] = b; bajando[clave] = false; lanzar(); },
            function ()  { bajando[clave] = false; console.warn('[aviso] no se pudo leer el sonido', clave); });
        })
        .catch(function () {
          bajando[clave] = false;
          console.warn('[aviso] no se pudo bajar el sonido', clave);
        });
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

  /* LA COCINA TIENE SU PROPIA LISTA, y es a proposito.
     Sergio los oyo todos y solo le sirvieron las GRABACIONES: los cuatro
     sintetizados de arriba suenan a pitido de aparato, y en una cocina eso se
     confunde con el microondas o con el telefono de alguien. Los sintetizados
     no se borran —hay restaurantes que ya eligieron uno para el aviso de
     chat— pero aqui no se ofrecen. */
  window.posTonosCocina = function () {
    return [
      { id:'caja', nombre:'Caja registradora' },
      { id:'xilofono', nombre:'Xilófono' },
      { id:'bici', nombre:'Timbre de bicicleta' },
      { id:'golpes', nombre:'Dos golpes' },
      { id:'aero2', nombre:'Bing-bong' },
      { id:'aerocorto', nombre:'Bing-bong corto' },
      { id:'aerosube', nombre:'Aeropuerto · subiendo' },
      { id:'aerobaja', nombre:'Aeropuerto · bajando' },
      { id:'aero4', nombre:'Aeropuerto · cuatro notas' },
      { id:'tren', nombre:'Estación de tren' },
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
