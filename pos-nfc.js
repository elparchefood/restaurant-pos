/* pos-nfc.js — el lector de tarjetas del POS.
 *
 * COMO FUNCIONA UN LECTOR USB BARATO (NFC o RFID): se hace pasar por un
 * TECLADO. Al acercar la tarjeta "escribe" su numero y un Enter, todo en
 * milesimas — mucho mas rapido de lo que teclea un humano. Eso es lo que se
 * caza aqui: una rafaga de digitos/letras hex con menos de 80 ms entre
 * teclas, terminada en Enter. No hay drivers, y funciona igual en el .exe y
 * en el navegador (paridad Electron/web).
 *
 * La tarjeta esta atada al TELEFONO del cliente, igual que los puntos: la
 * ficha puede duplicarse, el numero no.
 *
 * Y aqui vive tambien EL SONIDO que se oye al reconocer una tarjeta
 * (`posNfc.sonar()`, 5-sep-2026). Vive aqui y no en un archivo aparte porque
 * las tres pantallas que leen tarjetas ya cargan este; un archivo mas seria
 * una descarga mas por pantalla para 80 lineas.
 */
(function (w) {
  'use strict';

  function sb() { return w._pos && w._pos.sb; }
  var CTX = { tenantId: null };

  /* ── La caza de la rafaga ──────────────────────────────────────────── */
  var buf = '', ultimo = 0, robado = 0;
  var MIN = 6;         // ningun uid real tiene menos
  var HUECO = 80;      // ms entre teclas: un humano casi nunca baja de 100
  var oyentes = [];

  document.addEventListener('keydown', function (ev) {
    if (!oyentes.length) return;              // nadie esperando: ni tocar el teclado
    var ahora = Date.now();
    if (ahora - ultimo > HUECO) { buf = ''; robado = 0; }
    ultimo = ahora;

    if (ev.key === 'Enter') {
      if (buf.length >= MIN) {
        var uid = buf.toUpperCase();
        buf = ''; ultimo = 0;
        /* El lector escribe donde este el foco: si el cajero tenia el cursor
           en un campo, el numero se le metio ahi. Se le saca. */
        var el = document.activeElement;
        if (robado && el && ('value' in el) && typeof el.value === 'string' &&
            el.value.toUpperCase().endsWith(uid.slice(-robado))) {
          el.value = el.value.slice(0, el.value.length - robado);
        }
        robado = 0;
        ev.preventDefault(); ev.stopPropagation();
        oyentes.slice().forEach(function (fn) { try { fn(uid); } catch (e) { console.error('[nfc]', e); } });
      }
      return;
    }
    if (/^[0-9a-zA-Z]$/.test(ev.key)) {
      buf += ev.key;
      var el2 = document.activeElement;
      if (el2 && ('value' in el2)) robado++;   // va cayendo en un campo
    } else if (ev.key.length === 1) {
      buf = ''; robado = 0;                    // un simbolo raro: no es tarjeta
    }
  }, true);

  /*  ══ EL LECTOR DEL EJECUTABLE ════════════════════════════
      El lector de El Parche NO se hace pasar por un teclado: es de tarjeta
      inteligente (PC/SC), y a esos el navegador no les puede hablar. Solo el
      ejecutable, igual que con la impresora.

      Asi que hay DOS caminos por los que puede llegar una tarjeta:
        · la rafaga de teclas de un lector barato — lo de arriba;
        · el ejecutable, que lee el suyo y lo manda por aqui.

      Los dos terminan en los mismos oyentes. Una pantalla que ya sabia
      escuchar tarjetas no tiene que cambiar nada.

      ⚠️ Lo que llega del ejecutable NO viene con el numero pelado sino con
      el TOQUE entero: numero, contador y firma. Ahi esta la seguridad, y
      por eso se pasa completo a quien escuche — el que valida es el
      servidor.                                                          */
  var ultimoToque = null;

  function conectarEjecutable() {
    try {
      var e = window.electronPOS;
      if (!e || typeof e.onTarjeta !== 'function') return;   // navegador o .exe viejo
      e.onTarjeta(function (d) {
        if (!d || !d.uid) return;
        ultimoToque = d;
        oyentes.slice().forEach(function (fn) {
          try { fn(String(d.uid).toUpperCase(), d); } catch (x) { console.error('[nfc]', x); }
        });
      });
      if (typeof e.onLector === 'function') {
        e.onLector(function (d) {
          /*  Se deja dicho en la consola y disponible para quien lo quiera
              pintar: "no hay lector" y "no pasaste la tarjeta" son cosas
              distintas, y sin esto se confunden.                        */
          w.posNfcHayLector = !!(d && d.hay);
          console.log('[nfc] lector', (d && d.hay) ? 'conectado' : 'desconectado');
        });
      }
    } catch (x) { console.error('[nfc] no se pudo conectar con el lector:', x); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', conectarEjecutable);
  } else { conectarEjecutable(); }

  /* Escuchar tarjetas. Devuelve la funcion para dejar de escuchar — cada
     pantalla escucha SOLO mientras su modal o su vista lo necesita.

     El oyente recibe DOS cosas: el numero de la tarjeta (como siempre) y,
     si vino del lector del ejecutable, el toque completo con su firma. */
  function escuchar(fn) {
    oyentes.push(fn);
    return function () {
      var i = oyentes.indexOf(fn);
      if (i >= 0) oyentes.splice(i, 1);
    };
  }

  /* ── La base ───────────────────────────────────────────────────────── */
  function setCtx(t) { CTX.tenantId = t || null; }

  // La tarjeta y, si existe, la ficha del cliente al que apunta.
  async function buscar(uid) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var r = await s.from('pos_tarjetas').select('id,uid,telefono,activa')
      .eq('tenant_id', CTX.tenantId).eq('uid', uid).limit(1);
    if (r.error) throw r.error;
    var t = r.data && r.data[0];
    if (!t) return null;
    /*  Si la tarjeta no tiene dueNo no hay a quien buscar. Sin esto se
        preguntaba por el telefono "%null" — una consulta que no falla pero
        tampoco significa nada.                                          */
    if (!t.telefono) {
      return { id: t.id, uid: t.uid, telefono: null, activa: t.activa, cliente: null };
    }
    var c = await s.from('pos_clientes').select('id,nombre,telefono')
      .eq('tenant_id', CTX.tenantId).like('telefono', '%' + t.telefono).limit(5);
    var tel10 = String(t.telefono).replace(/[^0-9]/g, '').slice(-10);
    var ficha = (c.data || []).find(function (x) {
      return String(x.telefono || '').replace(/[^0-9]/g, '').slice(-10) === tel10;
    }) || null;
    return { id: t.id, uid: t.uid, telefono: t.telefono, activa: t.activa, cliente: ficha };
  }

  async function tarjetasDe(telefono) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var tel = String(telefono || '').replace(/[^0-9]/g, '').slice(-10);
    var r = await s.from('pos_tarjetas').select('id,uid,activa,created_at')
      .eq('tenant_id', CTX.tenantId).eq('telefono', tel).order('created_at');
    if (r.error) throw r.error;
    return r.data || [];
  }

  /* `forzar: true` PASA la tarjeta al nuevo dueNo (pedido de Sergio,
     20-ago): nunca en silencio — la pantalla primero avisa de quien es y
     pregunta; solo con ese si explicito se llama con forzar. */
  async function vincular(telefono, uid, quien, opciones) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var tel = String(telefono || '').replace(/[^0-9]/g, '').slice(-10);
    if (tel.length !== 10) throw new Error('El cliente necesita un celular a 10 dígitos.');
    var forzar = !!(opciones && opciones.forzar);
    var ya = await buscar(uid);
    /*  ⚠️ OJO CON LA TARJETA SIN DUEÑO (5-sep-2026).
        Una tarjeta puede estar en la base y no ser de nadie todavia: el
        servidor le crea la ficha en el primer toque autentico, para poder
        vigilarle el contador. `telefono` viene NULL.

        Aqui se trataba como "ya es de otra persona" y ademas se reventaba
        al leerle los ultimos digitos a un telefono que no existe:
        *Cannot read properties of null (reading 'slice')*. Le paso a
        Sergio al vincular su propia tarjeta.

        Sin dueNo NO es un conflicto: es justo la que hay que asignar.  */
    if (ya && ya.telefono && ya.telefono !== tel && !forzar) {
      /* Una tarjeta = un dueNo; se dice de quien es en vez de pisarlo. */
      var e = new Error('Esa tarjeta ya es de ' + ((ya.cliente && ya.cliente.nombre) || ('••• ' + String(ya.telefono).slice(-4))) + '.');
      e.codigo = 'OCUPADA'; e.duena = ya;
      throw e;
    }
    /*  Se le pone dueNo: puede ser una tarjeta sin asignar (lo normal al
        prepararla) o una que se esta pasando a otro cliente con permiso. */
    if (ya && ya.telefono !== tel) {
      var ru = await s.from('pos_tarjetas')
        .update({ telefono: tel, quien: quien || null })
        .eq('id', ya.id).eq('tenant_id', CTX.tenantId).select('id');
      if (ru.error) throw ru.error;
      if (!ru.data || !ru.data.length) throw new Error('No se pudo pasar la tarjeta.');
      return { id: ya.id, uid: uid, telefono: tel, activa: true, pasada: true };
    }
    if (ya) return ya;   // ya estaba vinculada a este mismo cliente
    var r = await s.from('pos_tarjetas').insert({
      tenant_id: CTX.tenantId, uid: uid, telefono: tel, quien: quien || null,
    }).select('id');
    if (r.error) throw r.error;
    return { id: r.data[0].id, uid: uid, telefono: tel, activa: true };
  }

  async function desvincular(id) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var r = await s.from('pos_tarjetas').delete().eq('id', id).eq('tenant_id', CTX.tenantId).select('id');
    if (r.error) throw r.error;
    return !!(r.data && r.data.length);
  }


  /* ══ EL SONIDO DE LA TARJETA ══════════════════════════════════════════
     Sergio escogio "Marea larga", mas largo y mas fuerte (5-sep-2026),
     despues de oir las opciones en una pagina de prueba.

     NO ES UN ARCHIVO DE AUDIO. Se fabrica aqui con unos numeros. Un .mp3
     habria que descargarlo —y el primero llegaria tarde, justo el que
     importa—, empacarlo en el ejecutable y mantenerlo igual en los dos
     lados. Esto son 80 lineas y suena identico en el .exe y en la web.

     Por que suena a "arranque de consola" y no a pitido —que fue lo que
     pidio— son tres cosas:

       1. UN BARRIDO QUE SUBE ANTES de que llegue la nota. El oido lo lee
          como "algo se acerca", y entonces lo que entra despues no es un
          aviso: es una LLEGADA.
       2. UN GRAVE POR DEBAJO (La1, 55 Hz). Tan bajo que casi no se
          identifica, pero da cuerpo. Sin el suena delgado.
       3. COLA DE SALA. La reverberacion se fabrica con ruido que se apaga
          solo: eso es, literalmente, la forma del eco de un cuarto. Un
          sonido que corta en seco suena a aparato; con cola suena a sitio.

     Y la regla de siempre: NADA entra de golpe. El volumen tarda entre
     260 y 620 ms en llegar arriba. Eso es lo que separa una ola de una
     campana.                                                             */

  var LARGO = 1.28;      // "Mas" — lo escogio Sergio en la pagina de prueba
  var FUERTE = 1.0;      // "Fuerte"
  var ac = null, bufSala = null, vivo = null;

  /*  ⚠️ EL NAVEGADOR NO DEJA SONAR SIN QUE ALGUIEN HAYA TOCADO ALGO ANTES.
      Y un toque de tarjeta NO cuenta como "tocar algo": entra por el
      ejecutable, no por el mouse. Asi que el audio se despierta con el
      primer clic o tecla del cajero —que siempre pasa mucho antes— y
      queda listo. Sin esto, el primer sonido del dia no saldria.        */
  function despertar() {
    try {
      if (!ac) ac = new (w.AudioContext || w.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (ac.state === 'running') {
        document.removeEventListener('pointerdown', despertar, true);
        document.removeEventListener('keydown', despertar, true);
      }
    } catch (e) { /* equipo sin audio: todo lo demas sigue igual */ }
  }
  if (w.AudioContext || w.webkitAudioContext) {
    document.addEventListener('pointerdown', despertar, true);
    document.addEventListener('keydown', despertar, true);
  }

  /*  La sala. Se calcula UNA vez: son 130.000 numeros y hacerlo en cada
      toque se notaria. Lo que se guarda es el eco, no el nodo — un nodo
      compartido se iria conectando a cada sonido nuevo, y a los diez
      toques el eco sonaria diez veces.                                  */
  function eco() {
    if (!bufSala) {
      var seg = 2.6, n = Math.floor(ac.sampleRate * seg);
      bufSala = ac.createBuffer(2, n, ac.sampleRate);
      for (var c = 0; c < 2; c++) {
        var d = bufSala.getChannelData(c);
        for (var i = 0; i < n; i++) {
          //  El ^2.4 hace que decaiga como un cuarto y no como una lata.
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.4);
        }
      }
    }
    var cv = ac.createConvolver();
    cv.buffer = bufSala;
    return cv;
  }

  /*  Una voz en forma de ola. Rampas exponenciales, no lineales: el oido
      percibe el volumen en proporcion, no en suma — con rampa lineal la
      subida se siente rapida al principio y estancada al final.         */
  function _ola(bus, o) {
    var t = o.t0, sube = o.sube * LARGO, arriba = o.arriba * LARGO, baja = o.baja * LARGO;
    var osc = ac.createOscillator(), g = ac.createGain();
    osc.frequency.setValueAtTime(o.hz, t);
    if (o.cima) osc.frequency.linearRampToValueAtTime(o.cima, t + sube);
    if (o.fin) osc.frequency.linearRampToValueAtTime(o.fin, t + sube + arriba + baja);
    var pico = Math.max(0.0002, o.vol * FUERTE);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + sube);
    g.gain.setValueAtTime(pico, t + sube + arriba);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sube + arriba + baja);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + sube + arriba + baja + 0.06);
  }

  /*  El barrido: ruido pasando por una rendija que se va abriendo hacia lo
      agudo. El efecto lo hace el filtro, no el ruido.                    */
  function _barrido(bus, t) {
    var dur = 0.72 * LARGO;
    var n = Math.floor(ac.sampleRate * (dur + 0.1));
    var b = ac.createBuffer(1, n, ac.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = ac.createBufferSource(); s.buffer = b;
    var f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(200, t);
    //  Exponencial tambien aqui: en frecuencia el oido va por proporciones.
    f.frequency.exponentialRampToValueAtTime(2900, t + dur);
    var g = ac.createGain(), pico = 0.10 * FUERTE;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.10 * LARGO);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.15);
  }

  /*  Suena. NUNCA lanza y NUNCA hace esperar a nadie: un equipo sin tarjeta
      de sonido no puede impedir que se cobre, y el nombre y el saldo salen
      en pantalla mientras suena, no despues.

      El interruptor de apagado ya existe (`pos.sonido.tarjeta` = '0'), pero
      todavia no tiene boton en Configuracion.                            */
  function sonar() {
    try {
      if (localStorage.getItem('pos.sonido.tarjeta') === '0') return;
    } catch (e) { /* modo privado: se deja sonar */ }
    try {
      despertar();
      if (!ac || ac.state !== 'running') return;

      //  Dos tarjetas seguidas no se montan una encima de otra.
      if (vivo) {
        try {
          var g0 = vivo.gain, t0 = ac.currentTime;
          g0.cancelScheduledValues(t0);
          g0.setValueAtTime(g0.value || 0.0001, t0);
          g0.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        } catch (e) {}
      }

      var raiz = ac.createGain(); raiz.connect(ac.destination);
      var seco = ac.createGain(); seco.gain.value = 0.82; seco.connect(raiz);
      var humedo = ac.createGain(); humedo.gain.value = 0.34;
      var cv = eco(); humedo.connect(cv); cv.connect(raiz);
      var bus = ac.createGain(); bus.connect(seco); bus.connect(humedo);

      var t = ac.currentTime + 0.02, L = 0.72 * LARGO;   // L = cuando LLEGA
      _barrido(bus, t);
      //  El grave arranca antes que la nota y se queda debajo: es el peso.
      _ola(bus, { t0: t + 0.10 * LARGO, sube: 0.62, arriba: 0.24, baja: 1.15, hz: 55, vol: 0.34 });
      //  El acorde de La, abriendose escalonado en vez de aparecer hecho.
      _ola(bus, { t0: t + L,                sube: 0.26, arriba: 0.30, baja: 1.30, hz: 440,    cima: 444, fin: 438, vol: 0.28 });
      _ola(bus, { t0: t + L + 0.12 * LARGO, sube: 0.24, arriba: 0.28, baja: 1.20, hz: 659.25, cima: 665, fin: 657, vol: 0.155 });
      _ola(bus, { t0: t + L + 0.24 * LARGO, sube: 0.22, arriba: 0.24, baja: 1.05, hz: 880,    cima: 887, fin: 877, vol: 0.085 });

      /*  El temblor: cinco veces por segundo, muy poquito. No se oye como
          desafinacion — se oye como que el sonido esta vivo.            */
      var lfo = ac.createOscillator(), prof = ac.createGain();
      lfo.frequency.value = 4.9; prof.gain.value = 0.012;
      lfo.connect(prof); prof.connect(bus.gain);
      lfo.start(t); lfo.stop(t + 2.8 * LARGO);

      vivo = raiz;
      /*  Se suelta cuando la cola ya se apago. Sin esto cada toque deja su
          cadena colgada del altavoz: no suenan, pero se amontonan.      */
      setTimeout(function () {
        try { raiz.disconnect(); } catch (e) {}
        if (vivo === raiz) vivo = null;
      }, 4600 * LARGO);
    } catch (e) { console.warn('[nfc] sin sonido:', e); }
  }

  //  `ultimoToque` guarda el ultimo toque completo: lo necesita quien vaya a
  //  validarlo contra el servidor, que es lo unico que da seguridad.
  w.posNfc = { setCtx: setCtx, escuchar: escuchar, buscar: buscar,
               tarjetasDe: tarjetasDe, vincular: vincular, desvincular: desvincular,
               ultimoToque: function () { return ultimoToque; },
               hayLector: function () { return w.posNfcHayLector === true; },
               sonar: sonar };
})(window);
