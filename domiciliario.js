/* ══════════════════════════════════════════════════════════════════════
   COBRA — APP DEL DOMICILIARIO
   Diseño: app-domiciliario del 21-ago-2026 · Reglas: PLAN-APP-DOMICILIARIO.md

   Lo que hay que tener claro de esta pantalla:

   · El domiciliario NO se registra. Su cuenta la crea el restaurante en
     Configuración › Usuarios y roles, con el rol de domiciliario.

   · Ve SOLO los pedidos que le asignaron. La asignación la hace el
     restaurante al marcar el pedido "En camino".

   · El rol se reconoce por su CLAVE INTERNA (`pos_roles.clave`), no por
     su nombre: el dueño pudo haberlo renombrado a "Repartidor" o a
     "Mensajero" y esto tiene que seguir funcionando.

   · Los cambios de estado NO se escriben directo: pasan por la función
     `cambiar-estado`, que además sincroniza la pastilla del chat y le
     avisa al cliente. Escribiéndolo directo, el cliente nunca se entera
     de que su pedido salió.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

  /* `storageKey` obligatorio y siempre el mismo: sin él, el ejecutable y el
     navegador guardan la sesión en cajones distintos y la app pide entrar
     de nuevo cada vez. */
  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'cobra-pos-session'
    }
  });

  var S = {
    canal: null, repaso: null, reintento: null,
    yo: null,          // fila de pos_users del domiciliario
    negocio: '',       // nombre del restaurante
    cuenta: null,      // cuenta para transferencias
    pedidos: [],
    filtro: 'activos',
    abierto: null,     // pedido abierto en el detalle
    cobroTipo: 'efectivo',
    recibido: null,
    logo: '',          // la foto del restaurante, para el circulo de arriba
    fotos: {},         // product_id -> foto, para reconocer el pedido de un vistazo
    heroIdx: null,     // cual pedido muestra la tarjeta azul; null = todavia no lo elige el dedo
    mapaIdx: 0,        // cual pedido muestra el mapa
    vistos: null,      // ids ya conocidos; null = todavia no ha cargado ni una vez
    avisos: [],        // lo que ha pasado en el turno
    sonTono: 'aero2', sonVol: 80
  };

  /* ── Utilidades ──────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function cop(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hora(d) {
    return new Date(d).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  var _toastT = null;
  function toast(msg) {
    var el = $('toast'), m = $('toast-msg');
    if (!el || !m) return;
    m.textContent = msg;
    el.hidden = false;
    if (_toastT) clearTimeout(_toastT);
    _toastT = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* La dirección vive dentro de las notas del pedido, con marcadores.
     Es el mismo formato que leen las demás pantallas. */
  function direccionDe(notas) {
    var t = String(notas == null ? '' : notas);
    if (!t.trim()) return { direccion: '', barrio: '', tel: '' };
    var mB = t.match(/\[barrio:([^\]]*)\]/i);
    var mT = t.match(/\[tel:([^\]]*)\]/i);
    var mC = t.match(/\[conjunto:([^\]]*)\]/i);
    var mU = t.match(/\[unidad:([^\]]*)\]/i);
    var corte = t.indexOf('[');
    var dir = corte >= 0 ? t.slice(0, corte).trim() : t.trim();
    dir = dir.replace(/[—\-·,\s]+$/, '').trim();
    return {
      direccion: dir,
      barrio: mB ? mB[1].trim() : '',
      conjunto: mC ? mC[1].trim() : '',
      unidad: mU ? mU[1].trim() : '',
      tel: mT ? mT[1].trim() : ''
    };
  }

  /* Cobra guarda `listo` para el pedido que ya está preparado y esperando.
     La app le dice "Asignado" porque desde el lado del domiciliario eso es
     lo que significa: es suyo y falta recogerlo. `preparacion` NO se le
     muestra: la cocina todavía lo está haciendo. */
  /* Los estados del sistema, traducidos a los tres que le importan a quien
     lleva la moto. Lo que no este en esta tabla cae en 'asignado', que es lo
     prudente: si no sabemos en que va, al menos aparece. */
  var ESTADO_APP = {
    recibido:    'asignado',
    preparacion: 'asignado',
    listo:       'asignado',
    camino:      'camino',
    en_camino:   'camino',
    entregado:   'entregado',
  };
  var ETIQUETA = { asignado: 'Asignado', camino: 'En camino', entregado: 'Entregado' };
  var CLASE = { asignado: 'b-warn', camino: 'b-brand', entregado: 'b-ok' };

  /* ══════════════════════════════════════════════════════════════════
     ENTRAR
     ══════════════════════════════════════════════════════════════════ */
  function errorLogin(msg) {
    var e = $('lg-error');
    if (e) { e.textContent = msg; e.hidden = false; }
  }

  async function entrar() {
    var btn = $('lg-entrar');
    var email = (($('lg-email') || {}).value || '').trim().toLowerCase();
    var pass = (($('lg-pass') || {}).value || '');
    var e = $('lg-error'); if (e) e.hidden = true;

    if (!email || !pass) { errorLogin('Escribe tu usuario y tu contraseña.'); return; }
    if (email.indexOf('@') < 0) {
      /* El restaurante le entrega el correo completo. Sin la parte de
         después del @ no hay forma de saber a qué negocio pertenece. */
      errorLogin('Escribe el correo completo, con la parte de después del @.');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) {
        errorLogin(/Invalid login/i.test(r.error.message)
          ? 'El usuario o la contraseña no coinciden.'
          : r.error.message);
        return;
      }
      var ok = await cargarPerfil();
      if (!ok) { await sb.auth.signOut(); return; }
      $('ov-login').hidden = true;
      await arrancar();
    } catch (err) {
      errorLogin('No se pudo conectar. Revisa tu señal e intenta otra vez.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
  }

  /* Trae la ficha del domiciliario y comprueba que de verdad lo sea. */
  async function cargarPerfil() {
    var ur = await sb.auth.getUser();
    var au = ur && ur.data && ur.data.user;
    if (!au) { errorLogin('La sesión no quedó abierta. Intenta otra vez.'); return false; }

    var r = await sb.from('pos_users')
      .select('id,name,email,phone,documento,vehiculo,placa,active,tenant_id,branch_id,role_id')
      .eq('auth_user_id', au.id).maybeSingle();
    var u = r && r.data;
    if (!u) {
      errorLogin('Tu cuenta existe pero no está vinculada a ningún restaurante. Pide que la revisen.');
      return false;
    }
    if (u.active === false) {
      errorLogin('Tu cuenta está inactiva. Pide en el restaurante que la activen.');
      return false;
    }

    /* ¿Es el rol de domiciliario? Se pregunta por la CLAVE INTERNA. */
    var rr = await sb.from('pos_roles')
      .select('id,name,clave,perms,domi_dinero').eq('id', u.role_id).maybeSingle();
    var rol = rr && rr.data;
    if (!rol || rol.clave !== 'domiciliario') {
      errorLogin('Esta app es solo para domiciliarios. Con tu rol se entra por el sistema del restaurante.');
      return false;
    }

    S.yo = u; S.rol = rol;

    var br = await sb.from('branches').select('name,tenant_id').eq('id', u.branch_id).maybeSingle();
    S.sede = (br && br.data && br.data.name) || '';
    var tr = await sb.from('tenants').select('name').eq('id', u.tenant_id).maybeSingle();
    S.negocio = (tr && tr.data && tr.data.name) || '';
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════
     MIS PEDIDOS
     ══════════════════════════════════════════════════════════════════ */
  async function cargarPedidos() {
    if (!S.yo) return;
    /* Desde la medianoche de hoy: un domiciliario no necesita ver lo de
       ayer, y sin este corte la lista crece para siempre. */
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var r = await sb.from('pos_orders')
      .select('id,customer_name,notes,total,delivery_fee,payment_method,paid_amount,'
            + 'delivery_status,delivered_at,opened_at,estado_at,status')
      .eq('domiciliario_id', S.yo.id)
      /* NO se filtra por estado. Antes pedia `listo`, `camino` o `entregado`,
         y medido en la base esos dos primeros NO EXISTEN: en 140 domicilios
         los unicos valores que aparecen son `recibido`, `preparacion` y
         `entregado`. O sea que la app solo podia mostrar pedidos YA
         ENTREGADOS — justo los que no sirven.
         Y filtrar por un vocabulario de estados es fragil: cada restaurante
         puede usar los suyos. Lo que de verdad define el trabajo de un
         domiciliario es «me lo asignaron y todavia no lo he entregado», y eso
         no depende de como se llamen los estados. */
      .neq('status', 'cancelled')
      .gte('opened_at', hoy.toISOString())
      .order('opened_at', { ascending: true });

    if (r.error) { console.error('[domi] pedidos:', r.error.message); return; }

    var ids = (r.data || []).map(function (o) { return o.id; });
    var items = {};
    if (ids.length) {
      var ri = await sb.from('pos_order_items')
        /* Los nombres reales de las columnas: `quantity` y `total`, no
           `qty` ni `price`. `name` y `product_name` conviven porque hay
           renglones de dos epocas distintas del sistema. */
        .select('order_id,product_id,name,product_name,quantity,unit_price,product_price,total')
        .in('order_id', ids);
      (ri.data || []).forEach(function (it) {
        (items[it.order_id] = items[it.order_id] || []).push(it);
      });
    }

    /*  LAS FOTOS DE LOS PRODUCTOS.
        El domiciliario reconoce un pedido por lo que lleva, no por un codigo.
        Van aparte porque `pos_order_items` guarda el nombre y el precio del
        momento de la venta, pero no la foto — esa vive en la carta.
        Si esta consulta falla no se cae nada: se pinta el icono de siempre. */
    var pids = [];
    Object.keys(items).forEach(function (k) {
      items[k].forEach(function (it) {
        if (it.product_id && pids.indexOf(it.product_id) < 0) pids.push(it.product_id);
      });
    });
    if (pids.length) {
      try {
        var rf = await sb.from('pos_products').select('id,photo_url').in('id', pids);
        (rf.data || []).forEach(function (p) { if (p.photo_url) S.fotos[p.id] = p.photo_url; });
      } catch (e) { console.warn('[domi] fotos:', e && e.message); }
    }

    var antes = S.vistos;
    S.pedidos = (r.data || []).map(function (o) {
      var d = direccionDe(o.notes);
      var pagado = (Number(o.paid_amount) || 0) > 0;
      return {
        id: o.id,
        no: String(o.id).slice(0, 4).toUpperCase(),
        cliente: o.customer_name || 'Sin nombre',
        direccion: d.direccion, barrio: d.barrio, tel: d.tel,
        conjunto: d.conjunto, unidad: d.unidad,
        total: (Number(o.total) || 0) + (Number(o.delivery_fee) || 0),
        estado: ESTADO_APP[o.delivery_status] || 'asignado',
        pago: pagado ? 'pagado' : 'contra',
        metodo: o.payment_method || '',
        entregadoAt: o.delivered_at || null,
        recibidoAt: o.opened_at || null,
        items: items[o.id] || []
      };
    });

    /*  ¿LLEGO ALGO NUEVO?

        Se compara contra los ids que ya se conocian. La PRIMERA carga no
        cuenta: al abrir la app sonarian de golpe los tres pedidos del dia,
        que es exactamente el ruido que nadie quiere.                      */
    var ahora = {};
    S.pedidos.forEach(function (p) { ahora[p.id] = true; });
    if (antes) {
      var nuevos = S.pedidos.filter(function (p) { return !antes[p.id]; });
      if (nuevos.length) {
        sonar(); vibrar();
        nuevos.forEach(function (p) {
          apuntarAviso('nuevo', 'Te asignaron un pedido', aDonde(p) + ' \u00b7 ' + cop(p.total));
        });
        toast(nuevos.length === 1
          ? 'Nuevo pedido \u00b7 ' + aDonde(nuevos[0])
          : nuevos.length + ' pedidos nuevos');
      }
    }
    S.vistos = ahora;
  }

  /* ══════════════════════════════════════════════════════════════════
     PINTAR
     ══════════════════════════════════════════════════════════════════ */
  /* QUE LLEVA ESTE PEDIDO, en una linea. Dos productos y el resto contado:
     el domiciliario necesita reconocerlo de un vistazo, no leer la factura. */
  function queLleva(p) {
    var its = p.items || [];
    if (!its.length) return '';
    var partes = its.slice(0, 2).map(function (it) {
      var q = Number(it.quantity) || 1;
      var n = it.name || it.product_name || 'Producto';
      return (q > 1 ? q + '× ' : '') + n;
    });
    var resto = its.length - 2;
    return partes.join(', ') + (resto > 0 ? ' y ' + resto + ' más' : '');
  }

  /* A DONDE VA, dicho como lo dice una persona. El conjunto primero: es lo
     que de verdad ubica. Nunca el codigo del pedido — "#7B4E" no le dice
     nada a nadie, y era justo lo que salia antes en la tarjeta azul. */
  function aDonde(p) {
    return p.conjunto || p.barrio || p.direccion || 'Sin dirección';
  }

  function fotoDe(p) {
    var its = p.items || [];
    for (var i = 0; i < its.length; i++) {
      var f = its[i].product_id && S.fotos[its[i].product_id];
      if (f) return f;
    }
    return '';
  }

  /* ══════════════════════════════════════════════════════════════
     EL SONIDO
     ══════════════════════════════════════════════════════════════
     El domiciliario lleva el celular en el bolsillo con la pantalla apagada.
     Un pedido que aparece en silencio es un pedido que se queda esperando.

     Encenderlo o apagarlo es DE ESTE CELULAR (aqui, en la campanita); el tono
     lo escoge el dueno una vez para todo el restaurante, igual que en cocina.
     Nace ENCENDIDO: quien no quiere oirlo lo apaga en dos toques, pero quien
     no sabe que existe se queda sin enterarse de que le llego trabajo.      */
  var SON_KEY = 'cobra.domi.sonido';
  function sonidoEncendido() {
    try { return localStorage.getItem(SON_KEY) !== '0'; } catch (e) { return true; }
  }

  /* El navegador no deja sonar nada hasta que alguien toca la pantalla. Con el
     primer toque, sea el que sea, se abre el audio y se deja abierto. */
  var _audioAbierto = false;
  function abrirAudio() {
    if (_audioAbierto) return;
    _audioAbierto = true;
    try { if (typeof window.posTocarTono === 'function') window.posTocarTono(S.sonTono, 0); } catch (e) {}
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    addEventListener(ev, abrirAudio, { passive: true });
  });

  function sonar() {
    if (!sonidoEncendido()) return;
    try {
      if (typeof window.posTocarTono === 'function') { window.posTocarTono(S.sonTono, S.sonVol); return; }
    } catch (e) {}
    /* Respaldo por si el archivo de tonos no cargo: mejor un pitido feo que un
       domiciliario que no se entera de que le asignaron un pedido. */
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      var a = new C();
      var o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(.3, a.currentTime + .02);
      g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .45);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + .5);
    } catch (e) {}
  }

  /* Y que el celular vibre. Con el ruido de la calle y el casco puesto, el
     sonido solo no siempre llega. */
  function vibrar() {
    try { if (navigator.vibrate) navigator.vibrate([120, 70, 120]); } catch (e) {}
  }

  function activos() {
    return S.pedidos.filter(function (p) { return p.estado !== 'entregado'; });
  }
  function entregados() {
    return S.pedidos.filter(function (p) { return p.estado === 'entregado'; });
  }

  function badgePago(p) {
    if (p.pago === 'pagado') {
      return '<span class="badge b-ok">Pagado' + (p.metodo ? ' · ' + esc(p.metodo) : '') + '</span>';
    }
    return p.estado === 'entregado'
      ? '<span class="badge b-neutral">Cobrado</span>'
      : '<span class="badge b-neutral">Cobrar ' + cop(p.total) + '</span>';
  }

  /*  LA TARJETA DE UN PEDIDO.

      Antes el renglon grande era un NOMBRE. Sergio: "es obvio que es para el,
      en lugar de eso deberia decir un resumen de lo que pidio el cliente y la
      foto del producto". Tiene razon: el domiciliario lleva tres pedidos en el
      bolso y lo que necesita distinguir es cual es cual.

      El nombre del cliente se queda, pero chiquito y debajo: sirve en la
      puerta, no para escoger la bolsa.                                     */
  function tarjeta(p) {
    var foto = fotoDe(p);
    var lleva = queLleva(p);
    var donde = [p.conjunto, p.unidad, p.direccion, p.barrio].filter(Boolean).join(' · ')
      || 'Sin dirección';
    return '<button class="card" data-pedido="' + esc(p.id) + '">'
      + '<div class="row">'
      + '<span class="badge ' + CLASE[p.estado] + '">' + ETIQUETA[p.estado] + '</span>'
      + '<span class="money tnum" style="margin-left:auto">' + cop(p.total) + '</span></div>'
      + '<div class="card-top">'
      + '<div class="card-foto">'
      + (foto
          ? '<img src="' + esc(foto) + '" alt="" loading="lazy" onerror="this.remove()">'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12l2 6H4z"></path><path d="M4 8v12h16V8"></path></svg>')
      + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div class="card-que">' + esc(lleva || 'Pedido') + '</div>'
      + '<div class="addr" style="margin-top:5px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>'
      + '<span>' + esc(donde) + '</span></div>'
      + (p.cliente ? '<div class="card-quien">' + esc(p.cliente) + '</div>' : '')
      + '</div></div>'
      + '<div class="feat-foot">' + badgePago(p) + '</div>'
      + '</button>';
  }

  function vacio(txt) {
    return '<div class="empty"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12l2 6H4z"></path><path d="M4 8v12h16V8"></path></svg><span>' + esc(txt) + '</span></div>';
  }

  function pintarInicio() {
    var act = activos(), ent = entregados();
    var t = totales();

    var h = $('hero-inicio');
    if (h) {
      var nombre = (S.yo && S.yo.name || '').split(' ')[0] || '';
      var hh = new Date().getHours();
      var saludo = hh < 12 ? 'Buenos días' : (hh < 19 ? 'Buenas tardes' : 'Buenas noches');
      var hi = h.querySelector('.hero-hi');
      if (hi) hi.textContent = saludo + (nombre ? ', ' + nombre : '');
      var ht = h.querySelector('.hero-t');
      if (ht) {
        ht.innerHTML = act.length
          ? 'Tienes <b>' + act.length + (act.length === 1 ? ' pedido</b><br>por entregar' : ' pedidos</b><br>por entregar')
          : 'No tienes pedidos<br><b>por entregar</b>';
      }
      pintarHero(act);
    }
    if ($('hs-porcobrar')) $('hs-porcobrar').textContent = cop(t.porCobrar);
    if ($('hs-enmano')) $('hs-enmano').textContent = cop(t.efectivo);
    if ($('hs-entregados')) $('hs-entregados').textContent = String(ent.length);
    if ($('li-efectivo')) $('li-efectivo').textContent = cop(t.efectivo);

    var n = $('tile-pedidos-n');
    if (n) { n.textContent = String(act.length); n.hidden = !act.length; }
    var tn = $('tab-n');
    if (tn) { tn.textContent = String(act.length); tn.hidden = !act.length; }

    /* Las tarjetas de ejemplo del diseño se van SIEMPRE, aunque no haya
       pedidos: si algo falla, es preferible una lista vacía a que el
       domiciliario salga a entregarle a un cliente que no existe. */
    var body = $('inicio-body');
    if (body) {
      var feat = body.querySelector('.feat');
      var viejas = body.querySelectorAll('.card, .feat, .empty');
      Array.prototype.forEach.call(viejas, function (c) { c.remove(); });
      var sec = body.querySelector('.sec');
      if (sec) {
        var html = act.length ? act.map(tarjeta).join('') : vacio('No tienes pedidos asignados.');
        sec.insertAdjacentHTML('afterend', html);
      }
    }
  }

  /*  LA TARJETA AZUL, UN PEDIDO A LA VEZ.

      Antes mostraba solo el ultimo y decia "Continuar entrega · #7B4E". Ese
      codigo son los cuatro primeros caracteres del identificador interno: no
      significa nada para nadie. Ahora dice A DONDE VA, y con varios pedidos se
      desliza de uno a otro sin salir de la pantalla.                        */
  function pintarHero(act) {
    var swipe = $('hero-swipe'), cta = $('cta-entrega-actual'), dots = $('hero-dots');
    if (!cta) return;
    if (!act.length) {
      if (swipe) swipe.hidden = true;
      return;
    }
    if (swipe) swipe.hidden = false;

    //  Al arrancar se para en el que ya va en camino; despues manda el dedo.
    if (S.heroIdx === null) {
      var i = act.findIndex(function (p) { return p.estado === 'camino'; });
      S.heroIdx = i < 0 ? 0 : i;
    }
    if (S.heroIdx >= act.length) S.heroIdx = act.length - 1;
    if (S.heroIdx < 0) S.heroIdx = 0;

    var p = act[S.heroIdx];
    cta.dataset.pedido = p.id;
    if ($('cta-donde')) $('cta-donde').textContent = aDonde(p);
    if ($('cta-sub')) {
      var lleva = queLleva(p);
      $('cta-sub').textContent = [ETIQUETA[p.estado], lleva].filter(Boolean).join(' · ');
    }

    if (dots) {
      dots.hidden = act.length < 2;
      if (act.length > 1) {
        dots.innerHTML = act.map(function (_, i) {
          return '<span class="' + (i === S.heroIdx ? 'on' : '') + '"></span>';
        }).join('');
      }
    }
  }

  function moverHero(paso) {
    var act = activos();
    if (act.length < 2) return;
    var i = (S.heroIdx === null ? 0 : S.heroIdx) + paso;
    if (i < 0) i = act.length - 1;
    if (i >= act.length) i = 0;
    S.heroIdx = i;
    var sw = $('hero-swipe');
    if (sw) {
      sw.classList.add('pasando');
      setTimeout(function () { sw.classList.remove('pasando'); }, 180);
    }
    pintarHero(act);
  }

  /*  Deslizar. Se exige que el gesto sea MAS horizontal que vertical: si no,
      cualquier intento de bajar por la pantalla cambiaria de pedido sin
      querer, que es de las cosas que mas molestan en un celular. */
  function deslizar(el, alPasar) {
    if (!el) return;
    var x0 = 0, y0 = 0, vivo = false;
    el.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; vivo = true;
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!vivo) return;
      vivo = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      alPasar(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /*  En el mapa el gesto NO puede ir sobre el mapa mismo: arrastrar el mapa es
      moverlo, y robarle ese gesto seria quitarle lo unico que hace. Va sobre
      la barra de arriba, que es donde esta escrito a donde se va. */
  function conectarSwipeMapa() {
    deslizar($('mapa-pasar'), moverMapa);
    deslizar(document.querySelector('#ov-mapa .mp-top'), moverMapa);
  }

  function conectarSwipe() {
    var sw = $('hero-swipe');
    if (!sw) return;
    var x0 = 0, y0 = 0, vivo = false;
    sw.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; vivo = true;
    }, { passive: true });
    sw.addEventListener('touchend', function (e) {
      if (!vivo) return;
      vivo = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      moverHero(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function pintarLista() {
    var lista = $('lista');
    if (!lista) return;
    var f = S.filtro;
    var ps = f === 'activos' ? activos()
           : f === 'camino' ? S.pedidos.filter(function (p) { return p.estado === 'camino'; })
           : entregados();
    lista.innerHTML = ps.length ? ps.map(tarjeta).join('') : vacio('No hay pedidos en este filtro.');

    var chips = $('chips');
    if (chips) {
      var cuentas = {
        activos: activos().length,
        camino: S.pedidos.filter(function (p) { return p.estado === 'camino'; }).length,
        entregado: entregados().length
      };
      chips.querySelectorAll('.fchip').forEach(function (c) {
        c.classList.toggle('on', c.dataset.filtro === f);
        var sp = c.querySelector('span');
        if (sp) sp.textContent = String(cuentas[c.dataset.filtro] || 0);
      });
    }
    var fecha = $('fecha');
    if (fecha) {
      fecha.textContent = new Date().toLocaleDateString('es-CO',
        { weekday: 'long', day: 'numeric', month: 'long' });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     TOTALES DEL TURNO
     ══════════════════════════════════════════════════════════════════ */
  function totales() {
    var efectivo = 0, digital = 0, porCobrar = 0;
    S.pedidos.forEach(function (p) {
      if (p.estado === 'entregado') {
        if (/efectivo/i.test(p.metodo)) efectivo += p.total;
        else digital += p.total;
      } else if (p.pago === 'contra') {
        porCobrar += p.total;
      }
    });
    return { efectivo: efectivo, digital: digital, porCobrar: porCobrar };
  }

  function pintarTurno() {
    var t = totales(), ent = entregados();
    if ($('t-efectivo')) $('t-efectivo').textContent = cop(t.efectivo);
    if ($('t-digital')) $('t-digital').textContent = cop(t.digital);
    if ($('t-nped')) $('t-nped').textContent = String(ent.length);
    if ($('t-pend')) $('t-pend').textContent = String(activos().length);

    var l = $('t-lista');
    if (!l) return;
    if (!ent.length) {
      l.innerHTML = '<div class="li"><div><div class="li-t">Aún no has entregado pedidos en este turno.</div></div></div>';
      return;
    }
    var icoBillete = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle></svg>';
    var icoBanco = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 10l9-6 9 6"></path><path d="M5 10v9h14v-9"></path><path d="M3 19h18"></path></svg>';
    l.innerHTML = ent.map(function (p) {
      var efe = /efectivo/i.test(p.metodo);
      var cuando = p.entregadoAt ? hora(p.entregadoAt) : '';
      var texto = efe ? 'Efectivo recibido' : (p.metodo ? esc(p.metodo) : 'Transferencia');
      return '<div class="li"><div class="li-ic">' + (efe ? icoBillete : icoBanco) + '</div>'
        + '<div><div class="li-t">' + esc(aDonde(p)) + ' · ' + esc(p.cliente) + '</div>'
        + '<div class="li-s">' + texto + (cuando ? ' · ' + esc(cuando) : '') + '</div></div>'
        + '<div class="li-v tnum" style="color:' + (efe ? 'var(--success)' : 'var(--ink-3)') + '">'
        + cop(p.total) + '</div></div>';
    }).join('');
  }

  function pintarPerfil() {
    if (!S.yo) return;
    var u = S.yo;
    var av = document.querySelector('#v-perfil .avatar');
    if (av) {
      av.textContent = (u.name || '').split(' ').slice(0, 2)
        .map(function (w) { return w[0] || ''; }).join('').toUpperCase();
    }
    var nm = document.querySelector('#v-perfil .prof > div > div');
    if (nm) nm.textContent = u.name || '';
    var sub = document.querySelector('#v-perfil .prof > div > div:nth-child(2)');
    if (sub) {
      sub.textContent = ((S.rol && S.rol.name) || 'Domiciliario')
        + (S.sede ? ' · ' + S.sede : '');
    }
    var box = document.querySelector('#v-perfil .box');
    if (box) {
      var filas = [
        ['Documento', u.documento || '—'],
        ['Celular', u.phone || '—'],
        ['Vehículo', u.vehiculo || '—'],
        ['Placa', u.placa || '—'],
        ['Rol', (S.rol && S.rol.name) || 'Domiciliario']
      ];
      box.innerHTML = filas.map(function (f, i) {
        var color = i === 4 ? ' style="color:var(--brand)"' : '';
        return '<div class="kv"><span>' + f[0] + '</span><span' + color + '>' + esc(f[1]) + '</span></div>';
      }).join('');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     LA CAMPANITA
     ══════════════════════════════════════════════════════════════
     Estaba dibujada y no hacia nada. Ahora guarda lo que paso en el turno —que
     hasta hoy solo existia en un aviso que duraba tres segundos— y es el sitio
     donde este celular decide si suena o no.

     La lista vive SOLO en el celular y solo por el turno: no hace falta una
     tabla en la base para recordar algo que se olvida al terminar el dia.   */
  function apuntarAviso(tipo, t, sub) {
    S.avisos.unshift({ tipo: tipo, t: t, sub: sub, cuando: Date.now() });
    if (S.avisos.length > 40) S.avisos.length = 40;
    S.avisosSinVer = (S.avisosSinVer || 0) + 1;
    pintarPunto();
  }

  function pintarPunto() {
    var d = document.querySelector('#btn-avisos .dot-n');
    if (d) d.hidden = !S.avisosSinVer;
  }

  function hora(ms) {
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    var am = h < 12 ? 'a.\u00a0m.' : 'p.\u00a0m.';
    var h12 = h % 12; if (!h12) h12 = 12;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + am;
  }

  function pintarAvisos() {
    var b = $('av-son');
    if (b) {
      var on = sonidoEncendido();
      b.classList.toggle('on', on);
      if ($('av-son-s')) $('av-son-s').textContent = on
        ? 'Suena y vibra cuando te asignan un pedido'
        : 'Apagado \u2014 los pedidos llegan en silencio';
      if ($('av-son-ic')) {
        $('av-son-ic').innerHTML = on
          ? '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>'
          : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></svg>';
      }
    }
    var l = $('av-lista');
    if (!l) return;
    if (!S.avisos.length) {
      l.innerHTML = '<div class="empty" style="padding:26px 0">'
        + '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>'
        + '<span>Todav\u00eda no ha pasado nada en tu turno.</span></div>';
      return;
    }
    l.innerHTML = S.avisos.map(function (a) {
      return '<div class="av-it"><span class="av-pt ' + esc(a.tipo) + '"></span>'
        + '<div class="av-tx"><b>' + esc(a.t) + '</b>'
        + '<small>' + esc(a.sub || '') + (a.sub ? ' \u00b7 ' : '') + hora(a.cuando) + '</small>'
        + '</div></div>';
    }).join('');
  }

  function abrirAvisos() {
    S.avisosSinVer = 0;
    pintarPunto();
    pintarAvisos();
    if ($('ov-avisos')) $('ov-avisos').hidden = false;
  }

  /* El circulo de arriba a la izquierda tenia un monigote generico. Ahora
     lleva la foto del restaurante: es lo primero que se ve al abrir, y le dice
     al domiciliario para quien esta trabajando hoy. Si la imagen no carga se
     queda el monigote — nunca un hueco blanco. */
  function pintarLogo() {
    var b = $('btn-perfil-top');
    if (!b || !S.logo) return;
    if (b.querySelector('img')) return;
    var img = document.createElement('img');
    img.alt = '';
    img.onerror = function () { b.classList.remove('con-foto'); img.remove(); };
    img.onload = function () { b.classList.add('con-foto'); };
    img.src = S.logo;
    b.appendChild(img);
  }

  function pintarTodo() {
    pintarInicio(); pintarLista(); pintarTurno(); pintarPerfil();
  }

  /* ══════════════════════════════════════════════════════════════════
     DETALLE DEL PEDIDO
     ══════════════════════════════════════════════════════════════════ */
  function abrirDetalle(id) {
    var p = S.pedidos.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    S.abierto = p;

    /* El mismo problema que en la tarjeta azul: "#7B4E" no le dice nada a
       nadie. Aqui manda el sitio; el codigo se queda solo para nombrar el
       pedido en los avisos, que es donde si hace falta un identificador. */
    if ($('detalle-no')) $('detalle-no').textContent = aDonde(p);
    var est = $('detalle-estado');
    if (est) { est.className = 'badge ' + CLASE[p.estado]; est.textContent = ETIQUETA[p.estado]; }
    if ($('detalle-cliente')) $('detalle-cliente').textContent = p.cliente;
    if ($('detalle-dir')) {
      $('detalle-dir').innerHTML = esc(p.direccion || 'Sin dirección')
        + (p.barrio ? '<br>' + esc(p.barrio) : '');
    }
    if ($('detalle-tel')) $('detalle-tel').textContent = p.tel || '—';
    if ($('detalle-hora')) $('detalle-hora').textContent = p.recibidoAt ? hora(p.recibidoAt) : '—';
    if ($('detalle-total')) $('detalle-total').textContent = cop(p.total);

    var items = $('detalle-items');
    if (items) {
      items.innerHTML = (p.items || []).map(function (it) {
        var q = Number(it.quantity) || 1;
        var nombre = it.name || it.product_name || 'Producto';
        /* `total` ya viene multiplicado. Si falta, se calcula con el
           precio unitario: nunca se deja el renglon sin valor. */
        var vale = it.total != null ? Number(it.total)
                 : (Number(it.unit_price != null ? it.unit_price : it.product_price) || 0) * q;
        return '<div class="item"><span class="item-q tnum">' + q + '×</span>'
          + '<span>' + esc(nombre) + '</span>'
          + '<span class="item-p tnum">' + cop(vale) + '</span></div>';
      }).join('') || '<div class="item"><span></span><span style="color:var(--muted)">Sin detalle de productos</span><span></span></div>';
    }

    var pago = $('detalle-pago');
    if (pago) {
      pago.className = 'badge ' + (p.pago === 'pagado' ? 'b-ok' : 'b-neutral');
      pago.style.alignSelf = 'flex-start';
      pago.textContent = p.pago === 'pagado'
        ? 'Ya está pago' + (p.metodo ? ' · ' + p.metodo : '')
        : 'Pago contra entrega';
    }

    var nota = $('detalle-nota');
    if (nota) nota.hidden = true;   // las notas útiles van en la dirección

    /* El botón cambia según dónde va el pedido. */
    var btn = $('btn-accion-principal');
    var aviso = $('detalle-aviso-pago');
    var fin = $('detalle-entregado');
    if (aviso) aviso.hidden = true;
    if (fin) fin.hidden = true;
    if (btn) {
      btn.hidden = false;
      btn.disabled = false;
      if (p.estado === 'asignado') {
        btn.lastChild.nodeValue = ' Recogí el pedido';
      } else if (p.estado === 'camino') {
        btn.lastChild.nodeValue = p.pago === 'contra' ? ' Cobrar y entregar' : ' Marcar como entregado';
        if (p.pago === 'pagado' && aviso) aviso.hidden = false;
      } else {
        btn.hidden = true;
        if (fin) {
          fin.hidden = false;
          fin.innerHTML = '<span>Entregado' + (p.entregadoAt ? ' a las ' + esc(hora(p.entregadoAt)) : '')
            + '</span><b class="tnum">' + cop(p.total) + '</b>';
        }
      }
    }
    $('ov-detalle').hidden = false;
  }

  /* ══════════════════════════════════════════════════════════════════
     CAMBIAR EL ESTADO
     Siempre por `cambiar-estado`: esa función escribe el estado, sincroniza
     la pastilla del chat y le avisa al cliente. Escribiéndolo directo, el
     cliente nunca se entera de que su pedido salió.
     ══════════════════════════════════════════════════════════════════ */
  async function cambiarEstado(id, estado) {
    var r = await fetch(SUPABASE_URL + '/functions/v1/cambiar-estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: id, estado: estado })
    });
    var j = await r.json().catch(function () { return null; });
    if (!r.ok || (j && j.error)) {
      throw new Error((j && j.error) || 'No se pudo cambiar el estado');
    }
  }

  async function accionPrincipal() {
    var p = S.abierto;
    if (!p) return;
    var btn = $('btn-accion-principal');

    if (p.estado === 'asignado') {
      if (btn) btn.disabled = true;
      try {
        await cambiarEstado(p.id, 'camino');
        p.estado = 'camino';
        toast('Pedido #' + p.no + ' en camino');
        abrirDetalle(p.id);
        pintarTodo();
      } catch (e) {
        toast('No se pudo marcar en camino. Revisa tu señal.');
      } finally { if (btn) btn.disabled = false; }
      return;
    }

    if (p.estado === 'camino') {
      if (p.pago === 'contra') { abrirCobro(p); return; }
      /* Ya está pago: se entrega sin cobrar nada. */
      if (btn) btn.disabled = true;
      try {
        await cambiarEstado(p.id, 'entregado');
        p.estado = 'entregado';
        p.entregadoAt = new Date().toISOString();
        toast('Pedido #' + p.no + ' entregado');
        cerrarTodo();
        pintarTodo();
      } catch (e) {
        toast('No se pudo marcar como entregado. Revisa tu señal.');
      } finally { if (btn) btn.disabled = false; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     COBRO CONTRA ENTREGA
     ══════════════════════════════════════════════════════════════════ */
  function abrirCobro(p) {
    S.cobroTipo = 'efectivo';
    S.recibido = null;
    if ($('cobro-no')) $('cobro-no').textContent = 'Pedido #' + p.no;
    if ($('cobro-total')) $('cobro-total').textContent = cop(p.total);

    /* El primer botón es el monto exacto de ESTE pedido. */
    var grid = document.querySelector('#cobro-efectivo .cash-grid');
    if (grid) {
      var exacto = grid.querySelector('[data-monto]');
      if (exacto) {
        exacto.dataset.monto = String(p.total);
        exacto.innerHTML = '<span class="tnum">Exacto · ' + cop(p.total) + '</span>';
      }
      grid.querySelectorAll('.cash').forEach(function (c) { c.classList.remove('on'); });
    }
    if ($('cobro-otro')) { $('cobro-otro').value = ''; $('cobro-otro').hidden = true; }
    if ($('cobro-cuenta')) $('cobro-cuenta').textContent = (S.cuenta && S.cuenta.numero) || 'Consulta en el restaurante';
    if ($('cobro-titular')) $('cobro-titular').textContent = (S.cuenta && S.cuenta.titular) || S.negocio || '—';
    pintarCobro();
    $('ov-cobro').hidden = false;
  }

  function pintarCobro() {
    var p = S.abierto;
    if (!p) return;
    document.querySelectorAll('#cobro-seg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tipo === (S.cobroTipo === 'efectivo' ? 'efectivo' : 'transfer'));
    });
    var esEfe = S.cobroTipo === 'efectivo';
    if ($('cobro-efectivo')) $('cobro-efectivo').hidden = !esEfe;
    if ($('cambio-slot')) $('cambio-slot').hidden = !esEfe;
    if ($('cobro-transfer')) $('cobro-transfer').hidden = esEfe;
    if (!esEfe && $('cobro-otro')) $('cobro-otro').hidden = true;

    var btn = $('btn-cobrar');
    if (!esEfe) {
      if ($('cobro-cambio')) $('cobro-cambio').hidden = true;
      if ($('cobro-insuficiente')) $('cobro-insuficiente').hidden = true;
      if (btn) btn.disabled = false;
      return;
    }

    var cambio = S.recibido == null ? null : S.recibido - p.total;
    if ($('cobro-cambio')) {
      $('cobro-cambio').hidden = !(cambio != null && cambio >= 0);
      if (cambio != null && cambio >= 0 && $('cobro-cambio-valor')) {
        $('cobro-cambio-valor').textContent = cop(cambio);
      }
    }
    if ($('cobro-insuficiente')) $('cobro-insuficiente').hidden = !(cambio != null && cambio < 0);
    if (btn) btn.disabled = !(S.recibido != null && S.recibido >= p.total);
  }

  async function confirmarCobro() {
    var p = S.abierto;
    if (!p) return;
    var btn = $('btn-cobrar');
    if (btn) btn.disabled = true;
    var metodo = S.cobroTipo === 'efectivo' ? 'efectivo' : 'transferencia';

    try {
      /* Primero queda registrado el DINERO y después el estado. Al revés,
         una caída de señal en el medio dejaría el pedido entregado y sin
         constancia de que se cobró: la plata la llevaría encima el
         domiciliario y el sistema no lo sabría. */
      var up = await sb.from('pos_orders').update({
        paid_amount: p.total,
        payment_method: metodo
      }).eq('id', p.id);
      if (up.error) throw new Error(up.error.message);

      await cambiarEstado(p.id, 'entregado');

      p.estado = 'entregado';
      p.pago = 'pagado';
      p.metodo = metodo;
      p.entregadoAt = new Date().toISOString();

      cerrarTodo();
      pintarTodo();
      toast(metodo === 'efectivo'
        ? 'Cobrado ' + cop(p.total) + ' en efectivo'
        : 'Transferencia registrada · ' + cop(p.total));
    } catch (e) {
      toast('No se pudo registrar el cobro. Revisa tu señal.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function cerrarTodo() {
    if ($('ov-cobro')) $('ov-cobro').hidden = true;
    if ($('ov-detalle')) $('ov-detalle').hidden = true;
    S.abierto = null;
  }

  /* ══════════════════════════════════════════════════════════════════
     UBICACIÓN
     ══════════════════════════════════════════════════════════════════ */
  /* Se manda LA BUENA, no la primera. Antes salia la posicion por antenas —a
     una cuadra o dos— y en el negocio quedaba escrita como si fuera exacta.
     Se espera a que el GPS se cuadre y se manda una sola vez. */
  function compartirUbicacion() {
    if (!navigator.geolocation && !geoNativo()) { toast('Este equipo no permite ubicación'); return; }
    toast('Buscando tu ubicación…');
    var mandado = false, ultimo = null, plazo = null;
    function mandar(p) {
      if (mandado || !p) return;
      mandado = true;
      if (plazo) { clearTimeout(plazo); plazo = null; }
      sb.from('pos_domi_ubicaciones').insert({
        tenant_id: S.yo.tenant_id,
        domiciliario_id: S.yo.id,
        order_id: S.abierto ? S.abierto.id : null,
        lat: p.lat, lng: p.lng
      }).then(function () { toast('Ubicación enviada al negocio'); },
              function () { toast('No se pudo enviar la ubicación'); });
    }
    ubicarme(function (p, bueno) {
      ultimo = p;
      if (bueno) mandar(p);
    }, function () {
      toast('Activa el GPS para compartir ubicación');
    });
    /*  Y si el GPS nunca baja de 20 metros —bajo techo pasa— se manda la mejor
        que hubo. Antes de este plazo, el boton se quedaba callado para siempre
        y en el negocio no llegaba nada: peor que una ubicacion aproximada. */
    plazo = setTimeout(function () { mandar(ultimo); }, 21000);
  }

  /* ══════════════════════════════════════════════════════════════
     EL MAPA
     ══════════════════════════════════════════════════════════════
     Antes este botón sacaba al domiciliario de la app y lo mandaba al mapa
     del celular. Ahora el mapa es de Cobra y se queda adentro.

     La llave de Google NO está escrita en este archivo. Se pide al servidor
     cada vez, y el servidor solo la entrega si hay sesión, el plan es Pro,
     la caja está abierta y queda cupo. La ruta ni siquiera se calcula aquí:
     la dibuja el servidor con la otra llave, la que nunca sale.            */

  var MAPA = { cargando: null, api: false, mapa: null, marcaCasa: null, marcaYo: null,
    linea: null, pedido: null, casa: null, aprox: false,
    andando: false, vigia: null, latido: null, despierto: null,
    yo: null, halo: null, siguiendo: false, buscando: null,
    margen: 0, avisoGps: false };

  function mapaAviso(tx, sub, girando) {
    var av = $('mapa-aviso'); if (!av) return;
    if (tx === null) { av.hidden = true; return; }
    av.hidden = false;
    var sp = av.querySelector('.dm-spin');
    if (sp) sp.style.display = girando ? '' : 'none';
    if ($('mapa-aviso-tx')) $('mapa-aviso-tx').textContent = tx;
    if ($('mapa-aviso-sub')) $('mapa-aviso-sub').textContent = sub || '';
  }

  /* La librería de Google se baja UNA sola vez por sesión. Si se pide dos
     veces, Google escupe un aviso feo encima del mapa y lo deja en blanco. */
  function cargarGoogle(clave) {
    if (MAPA.api) return Promise.resolve();
    if (MAPA.cargando) return MAPA.cargando;
    MAPA.cargando = new Promise(function (listo, falla) {
      var t = setTimeout(function () { falla(new Error('lento')); }, 12000);
      window.__cobraMapaListo = function () { clearTimeout(t); MAPA.api = true; listo(); };
      var sc = document.createElement('script');
      sc.async = true;
      sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(clave)
        + '&language=es&region=CO&callback=__cobraMapaListo';
      sc.onerror = function () { clearTimeout(t); falla(new Error('sin red')); };
      document.head.appendChild(sc);
    });
    return MAPA.cargando;
  }

  /* Google manda la ruta comprimida en un texto. Esto la vuelve puntos. Es el
     algoritmo de siempre; no hay nada que inventar aquí. */
  function abrirLinea(txt) {
    var pts = [], i = 0, lat = 0, lng = 0;
    while (i < txt.length) {
      var b, sh = 0, r = 0;
      do { b = txt.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lat += ((r & 1) ? ~(r >> 1) : (r >> 1));
      sh = 0; r = 0;
      do { b = txt.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lng += ((r & 1) ? ~(r >> 1) : (r >> 1));
      pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return pts;
  }

  async function llamarMapa(cuerpo) {
    var r = await sb.functions.invoke('mapa', { body: cuerpo });
    if (r.error) throw new Error('No se pudo hablar con el servidor');
    return r.data || {};
  }

  /*  Con varios pedidos, ¿cual mapa se abre? El que se este mirando: si el
      detalle esta abierto, ese; si no, el que muestra la tarjeta azul. Y una
      vez dentro se pasa de uno a otro sin salir. */
  /* ══════════════════════════════════════════════════════════════
     DÓNDE ESTOY — y por qué daba un punto cercano pero equivocado
     ══════════════════════════════════════════════════════════════
     `getCurrentPosition` entrega LA PRIMERA respuesta que consigue, y la
     primera casi nunca es el GPS: es la posición por antenas y wifi, que en
     una ciudad cae a una cuadra o dos. El GPS de verdad tarda unos segundos
     en cuadrarse. Por eso el destino salia perfecto y el origen "cerca".

     Esto se queda escuchando y va quedandose con la MEJOR lectura, hasta que
     el margen de error baje de 20 metros o pasen 20 segundos. Cada vez que
     mejora avisa, asi el mapa se corrige solo en vez de esperar quieto.

     `maximumAge: 0` para que no reciclen una lectura vieja del bolsillo.   */
  /*  ═══════════════════════════════════════════════════════════════
      EL GPS DEL TELEFONO, NO EL DEL NAVEGADOR
      ═══════════════════════════════════════════════════════════════
      `navigator.geolocation` es el GPS del NAVEGADOR, y dentro de la app eso
      no es lo mismo que el GPS del telefono: la pagina va dentro de un
      navegador incrustado que resuelve la posicion a su manera —wifi, antenas,
      y si no hay nada, la direccion de internet—. Por eso podia marcar un
      barrio entero de distancia con el permiso preciso concedido, y por eso no
      mejoraba por esperar: no estaba esperando al satelite, estaba esperando a
      nada.

      Cuando la app trae el modulo de ubicacion de Capacitor, se le pregunta al
      TELEFONO por la via nativa —la misma que usa Google Maps— y ahi si hay
      satelite. En el navegador de escritorio no existe ese modulo y se sigue
      por la via de siempre, que ahi es la correcta.                       */
  function geoNativo() {
    try {
      var C = window.Capacitor;
      var g = C && C.Plugins && C.Plugins.Geolocation;
      return (g && typeof g.watchPosition === 'function') ? g : null;
    } catch (e) { return null; }
  }

  function ubicarme(alPunto, alFallar) {
    var nat = geoNativo();
    if (nat) return ubicarmeNativo(nat, alPunto, alFallar);
    if (!navigator.geolocation) { if (alFallar) alFallar(); return null; }
    var mejor = null, id = null, fin = null, n = 0;

    function cerrar() {
      if (id !== null) { try { navigator.geolocation.clearWatch(id); } catch (e) {} id = null; }
      if (fin) { clearTimeout(fin); fin = null; }
    }

    id = navigator.geolocation.watchPosition(function (pos) {
      n++;
      var p = {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        error: pos.coords.accuracy == null ? 9999 : pos.coords.accuracy,
        rumbo: pos.coords.heading, n: n,
      };
      //  Solo se acepta lo que MEJORA: un rebote del wifi devuelve el punto
      //  malo despues de que el GPS ya habia acertado.
      if (mejor && p.error > mejor.error) return;
      mejor = p;
      alPunto(p, false);
    }, function (err) {
      cerrar();
      /* Codigo 1 = el usuario o el sistema lo tiene NEGADO. Los otros son
         "no lo consegui ahora", que es otra cosa y no merece una ventana. */
      if (err && err.code === 1) { abrirGps('negado'); return; }
      if (!mejor && alFallar) alFallar();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: VENTANA + 2000 });

    /*  NO SE CORTA APENAS LLEGA UNA LECTURA "BUENA", Y ESTO ERA UN FALLO MIO.

        Antes se paraba en cuanto el margen bajaba de 20 metros. Suena
        razonable y esta mal: la posicion por antenas y wifi TAMBIEN reporta
        margenes de 15 o 20 metros en una ciudad —se cree exacta— y estando a
        una cuadra. Al cortar ahi, el GPS de verdad, que llega despues, no
        alcanzaba a hablar nunca.

        Ahora se escucha la ventana completa y se avisa al final cual quedo.
        Son unos segundos mas de espera; el mapa mientras tanto ya muestra
        algo y se va corrigiendo solo.                                     */
    fin = setTimeout(function () {
      cerrar();
      if (mejor) alPunto(mejor, true);
      else if (alFallar) alFallar();
    }, VENTANA);
    return { parar: cerrar };
  }

  /*  La misma escucha, por la via del telefono. El modulo devuelve el id de
      la vigilancia en una promesa, asi que hay que guardarlo cuando llegue —y
      soltarla igual si el mapa se cerro antes de que llegara. */
  function ubicarmeNativo(g, alPunto, alFallar) {
    var mejor = null, id = null, muerto = false, fin = null;

    function cerrar() {
      muerto = true;
      if (fin) { clearTimeout(fin); fin = null; }
      if (id) { try { g.clearWatch({ id: id }); } catch (e) {} id = null; }
    }

    g.watchPosition({ enableHighAccuracy: true, timeout: VENTANA + 2000, maximumAge: 0 },
      function (pos, err) {
        if (muerto) return;
        if (err) {
          var t = String((err && (err.message || err.errorMessage)) || '').toLowerCase();
          if (t.indexOf('denied') >= 0 || t.indexOf('permis') >= 0) { cerrar(); abrirGps('negado'); return; }
          return;
        }
        if (!pos || !pos.coords) return;
        var p = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          error: pos.coords.accuracy == null ? 9999 : pos.coords.accuracy,
          rumbo: pos.coords.heading,
        };
        if (mejor && p.error > mejor.error) return;
        mejor = p;
        alPunto(p, false);
      }
    ).then(function (w) {
      if (muerto) { try { g.clearWatch({ id: w }); } catch (e) {} return; }
      id = w;
    }).catch(function () {
      cerrar();
      if (alFallar) alFallar();
    });

    fin = setTimeout(function () {
      var m = mejor;
      cerrar();
      if (m) alPunto(m, true);
      else if (alFallar) alFallar();
    }, VENTANA);

    return { parar: cerrar };
  }

  /*  VIGILANCIA CONTINUA, para el viaje. Aqui no se busca la mejor lectura y
      se para: se acompana al domiciliario todo el camino, asi que cada lectura
      nueva manda aunque sea peor — se esta moviendo, y quedarse con la mejor de
      hace un minuto seria dejarlo clavado en una esquina por la que ya paso. */
  function vigilar(alPunto) {
    var nat = geoNativo();
    var opciones = { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 };

    function suyo(pos) {
      if (!pos || !pos.coords) return;
      alPunto({
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        error: pos.coords.accuracy == null ? 9999 : pos.coords.accuracy,
        rumbo: pos.coords.heading,
      });
    }

    if (nat) {
      var id = null, muerto = false;
      nat.watchPosition(opciones, function (pos, err) {
        if (muerto || err) return;
        suyo(pos);
      }).then(function (w) {
        if (muerto) { try { nat.clearWatch({ id: w }); } catch (e) {} return; }
        id = w;
      }).catch(function () {});
      return { parar: function () {
        muerto = true;
        if (id) { try { nat.clearWatch({ id: id }); } catch (e) {} id = null; }
      } };
    }

    if (!navigator.geolocation) return { parar: function () {} };
    var wid = navigator.geolocation.watchPosition(suyo, function () {}, opciones);
    return { parar: function () {
      try { navigator.geolocation.clearWatch(wid); } catch (e) {}
    } };
  }

  /*  Cuanto se espera al GPS. Doce segundos es lo que tarda un telefono en
      pasar de la posicion por antenas a la del satelite estando a la
      intemperie; bajo techo no llega nunca y por eso hay tope.            */
  var VENTANA = 12000;

  /*  QUE TAN BUENA ES LA LECTURA, DICHO EN PANTALLA.

      Sin esto, "el punto esta cerca pero no donde estoy" es una queja que no
      se puede perseguir: no hay forma de saber si el telefono esta dando 15
      metros o 1.200. Ahora el numero esta a la vista.

      Y por encima de 100 metros no es un GPS lento: es que Android tiene la
      ubicacion en modo APROXIMADA para esta app. Ese permiso devuelve el punto
      corrido a proposito, siempre, y no mejora por esperar. Se dice como se
      arregla, porque nadie lo va a adivinar.                              */
  /*  Mientras BUSCA no se dice nada: el mapa ya se ve, el punto ya esta ahi y
      se va corrigiendo solo. Avisar cada segundo de que se esta buscando es
      ruido, y taparlo con un cartel es peor.

      Solo se habla cuando la busqueda TERMINO y el resultado sirve poco. */
  function pintarPrecision(p, definitivo) {
    var el = $('mapa-precision');
    if (!el) return;
    if (!p || !definitivo) { el.hidden = true; return; }
    var m = Math.round(p.error);
    if (m <= 40) { el.hidden = true; return; }   // normal: no se molesta a nadie
    el.hidden = false;
    el.className = m > 100 ? 'mp-prec mala' : 'mp-prec media';
    el.textContent = '\u00b1' + m + ' m \u00b7 tocar';
    MAPA.margen = m;
  }

  /* ══════════════════════════════════════════════════════════════
     EL PERMISO DE UBICACION
     ══════════════════════════════════════════════════════════════
     La app nunca comprobaba si el telefono le estaba dando la ubicacion. Si el
     permiso estaba negado, el mapa simplemente se quedaba sin punto azul y sin
     decir por que — y quien lo mirara pensaria que el programa esta malo.

     Son DOS cosas distintas y la gente las confunde:

       · PERMISO NEGADO: la app no puede pedir la ubicacion. Se arregla en los
         ajustes del telefono.
       · PERMISO "APROXIMADO": Android 12 dejo que se conceda la ubicacion a
         proposito corrida un kilometro. La app SI recibe una posicion, y por
         eso no falla nada visible: simplemente esta mal, siempre, y no mejora
         por esperar ni por salir a campo abierto.

     El segundo es el que nadie adivina, y es el que explica un punto de inicio
     "cerca pero no donde estoy".                                          */
  function abrirGps(motivo) {
    var t = $('gps-t'), s = $('gps-s'), pasos = $('gps-pasos');
    var aprox = motivo === 'aproximada';
    if (t) t.textContent = aprox ? 'Tu ubicaci\u00f3n est\u00e1 en modo aproximado' : 'Falta tu ubicaci\u00f3n';
    if (s) {
      s.textContent = aprox
        ? 'El tel\u00e9fono la est\u00e1 dando corrida a prop\u00f3sito' + (MAPA.margen ? ' (\u00b1' + MAPA.margen + ' m)' : '')
          + '. No mejora esperando: hay que cambiarla en los ajustes.'
        : 'Sin ella el mapa no sabe desde d\u00f3nde arrancar.';
    }
    if (pasos) {
      pasos.innerHTML = aprox
        ? ['Ajustes del tel\u00e9fono', 'Aplicaciones \u2192 <b>Cobra Domicilios</b>',
           'Permisos \u2192 Ubicaci\u00f3n', 'Activar <b>Usar ubicaci\u00f3n precisa</b>']
            .map(function (x) { return '<li>' + x + '</li>'; }).join('')
        : ['Ajustes del tel\u00e9fono', 'Aplicaciones \u2192 <b>Cobra Domicilios</b>',
           'Permisos \u2192 Ubicaci\u00f3n', 'Elegir <b>Permitir mientras se usa</b>',
           'Y activar <b>Usar ubicaci\u00f3n precisa</b>']
            .map(function (x) { return '<li>' + x + '</li>'; }).join('');
    }
    if ($('ov-gps')) $('ov-gps').hidden = false;
  }

  /*  Se comprueba ANTES de abrir el mapa. Si el navegador sabe decir que esta
      negado, se dice de una en vez de dejar el mapa mudo. Y si no sabe
      decirlo —muchos no implementan esto— no pasa nada: el fallo al pedir la
      posicion lo atrapa igual mas adelante. */
  function revisarPermiso() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return;
      navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
        if (r && r.state === 'denied') abrirGps('negado');
      }).catch(function () {});
    } catch (e) {}
  }

  function verRuta() {
    var act = activos();
    if (S.abierto) {
      var iA = act.findIndex(function (x) { return x.id === S.abierto.id; });
      S.mapaIdx = iA < 0 ? 0 : iA;
    } else {
      S.mapaIdx = S.heroIdx === null ? 0 : S.heroIdx;
    }
    if (S.mapaIdx >= act.length) S.mapaIdx = 0;
    abrirMapaDe(act[S.mapaIdx] || S.abierto);
  }

  function moverMapa(paso) {
    var act = activos();
    if (act.length < 2) return;
    var i = S.mapaIdx + paso;
    if (i < 0) i = act.length - 1;
    if (i >= act.length) i = 0;
    S.mapaIdx = i;
    detenerRuta();
    abrirMapaDe(act[i]);
  }

  function pintarMapaPasar() {
    var act = activos(), caja = $('mapa-pasar'), dots = $('mapa-dots');
    if (!caja) return;
    caja.hidden = act.length < 2;
    if (dots && act.length > 1) {
      dots.innerHTML = act.map(function (_, i) {
        return '<span class="' + (i === S.mapaIdx ? 'on' : '') + '"></span>';
      }).join('');
    }
  }

  function abrirMapaDe(p) {
    if (!p) { toast('No hay ningún pedido activo'); return; }
    pintarMapaPasar();
    if (!p.direccion && !p.conjunto) { toast('Este pedido no tiene dirección'); return; }
    MAPA.pedido = p;
    if ($('mapa-cliente')) $('mapa-cliente').textContent = aDonde(p);
    /* Arriba va el sitio; aqui lo que falta para llegar a la puerta. El
       conjunto no se repite: ya esta en el titulo. */
    if ($('mapa-dir')) $('mapa-dir').textContent =
      [p.unidad, p.direccion, (p.conjunto ? '' : p.barrio), p.cliente].filter(Boolean).join(' · ');
    if ($('mapa-dist')) $('mapa-dist').textContent = '';
    if ($('ov-mapa')) $('ov-mapa').hidden = false;
    if ($('mapa-alerta')) $('mapa-alerta').hidden = true;
    if ($('btn-mapa-iniciar')) $('btn-mapa-iniciar').disabled = false;
    MAPA.aprox = false; MAPA.casa = null;
    if (MAPA.buscando) { MAPA.buscando.parar(); MAPA.buscando = null; }
    MAPA.avisoGps = false;
    if (MAPA.marcaYo) { MAPA.marcaYo.setMap(null); MAPA.marcaYo = null; }
    if (MAPA.halo) { MAPA.halo.setMap(null); MAPA.halo = null; }
    if (MAPA.linea) { MAPA.linea.setMap(null); MAPA.linea = null; }
    MAPA.yo = null;
    seguir(false);
    if ($('mapa-centrar')) $('mapa-centrar').hidden = true;
    if ($('mapa-precision')) $('mapa-precision').hidden = true;
    mapaAviso('Abriendo el mapa…', '', true);
    revisarPermiso();
    armarMapa(p);
  }

  function cerrarMapa() {
    /* Apagar el seguimiento al salir NO es limpieza de adorno: `watchPosition`
       deja el GPS prendido, y el GPS es lo que más batería gasta en un
       celular que va a estar toda la tarde en la calle. */
    detenerRuta();
    if (MAPA.buscando) { MAPA.buscando.parar(); MAPA.buscando = null; }
    if ($('ov-mapa')) $('ov-mapa').hidden = true;
  }

  async function armarMapa(p) {
    //  1) La llave. Si no la dan, el servidor dice POR QUÉ y eso se muestra
    //     tal cual: un mapa en blanco sin explicación es una tarde perdida
    //     buscando un fallo que no existe.
    var acc;
    try { acc = await llamarMapa({ accion: 'navegador' }); }
    catch (e) { mapaAviso('No hay señal', 'Vuelve a intentarlo cuando tengas internet.', false); return; }
    if (!acc.ok) {
      mapaAviso(acc.mensaje || 'El mapa no está disponible',
        acc.motivo === 'sin_turno' ? 'Pide que abran la caja del restaurante.' : '', false);
      return;
    }

    try { await cargarGoogle(acc.clave); }
    catch (e) { mapaAviso('El mapa no cargó', 'Revisa la conexión y vuelve a entrar.', false); return; }

    //  2) Dónde queda la casa. Lo resuelve el servidor y lo deja guardado,
    //     así que la segunda vez que se abre el mismo pedido es instantáneo.
    var g;
    try {
      g = await llamarMapa({ accion: 'geocodificar', direccion: p.direccion, barrio: p.barrio || '',
        ciudad: S.ciudad || '', conjunto: p.conjunto || '' });
    } catch (e) { mapaAviso('No hay señal', '', false); return; }

    if (g.no_encontrada) { mapaAviso('No se encontró esa dirección', 'Llámala al cliente para que te oriente.', false); return; }
    if (g.tope_alcanzado) { mapaAviso('Se acabó el cupo de mapas del mes', '', false); return; }
    if (g.sin_conectar || !g.lat || !g.lng) { mapaAviso('El mapa no está configurado', '', false); return; }

    var casa = { lat: Number(g.lat), lng: Number(g.lng) };
    MAPA.casa = casa;
    mapaAviso(null);

    MAPA.mapa = new google.maps.Map($('mapa-lienzo'), {
      center: casa, zoom: 16,
      /* Se puede acercar, alejar y mirar alrededor — es un mapa de verdad,
         no una foto. Lo que se quita es lo que estorba en un celular. Los
         negocios de la cuadra se dejan encendidos a propósito: un domiciliario
         se orienta por la panadería de la esquina, no por el número. */
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      zoomControl: false, clickableIcons: true, gestureHandling: 'greedy'
    });
    MAPA.marcaCasa = new google.maps.Marker({
      map: MAPA.mapa, position: casa, title: p.cliente || 'Destino'
    });
    /* `dragstart` y no `center_changed`: el segundo salta tambien cuando el
       mapa se mueve solo siguiendo al domiciliario, y con eso el modo viaje se
       apagaba a si mismo en el primer paso. */
    MAPA.mapa.addListener('dragstart', function () { if (MAPA.andando) seguir(false); });
    /*  CUANDO GOOGLE NO ENCONTRÓ LA CASA.

        Google no responde "no sé": responde el centro del barrio o del pueblo,
        y ese punto se ve igual de normal que una dirección exacta. Cobra ya lo
        detectaba — pero lo decía con un "aprox." minúsculo en la esquina, y
        así un pedido para Llanos de Calibío mostró el centro de Cali sin que
        nada chillara.

        Ahora se dice con una banda roja y, sobre todo, NO SE DIBUJA LA RUTA:
        una línea bonita hasta un punto inventado es peor que no tener mapa,
        porque el domiciliario la sigue creyendo que va bien.              */
    MAPA.aprox = !!g.aproximada;
    if (MAPA.aprox) {
      if ($('mapa-alerta')) $('mapa-alerta').hidden = false;
      if ($('mapa-alerta-tx')) {
        $('mapa-alerta-tx').textContent = 'Google no encontró esta dirección exacta. '
          + 'Este punto es aproximado — llámala al cliente antes de arrancar.';
      }
      if ($('btn-mapa-iniciar')) $('btn-mapa-iniciar').disabled = true;
      return;
    }

    //  3) Y la línea, si el GPS quiere colaborar. Si no, el mapa igual sirve.
    pintarRuta(casa);
  }

  /* El punto azul: un círculo, y alrededor la mancha de lo que el GPS no sabe.
     La mancha no es adorno — si el margen es de 300 metros, el domiciliario
     tiene que VERLO en vez de creerse que esta donde dice el punto. */
  function pintarYo(p) {
    if (!MAPA.mapa) return;
    var pos = { lat: p.lat, lng: p.lng };
    if (!MAPA.marcaYo) {
      MAPA.marcaYo = new google.maps.Marker({
        map: MAPA.mapa, position: pos, title: 'T\u00fa', zIndex: 99,
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 7,
          fillColor: '#5B6BFF', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3
        }
      });
      MAPA.halo = new google.maps.Circle({
        map: MAPA.mapa, center: pos, radius: p.error || 0,
        strokeColor: '#5B6BFF', strokeOpacity: .25, strokeWeight: 1,
        fillColor: '#5B6BFF', fillOpacity: .10, clickable: false, zIndex: 1
      });
    } else {
      MAPA.marcaYo.setPosition(pos);
      if (MAPA.halo) { MAPA.halo.setCenter(pos); MAPA.halo.setRadius(p.error || 0); }
    }
    /* Cuando va andando, el punto se vuelve flecha y apunta a donde va: es lo
       que dice de un vistazo si tomo bien la calle o se paso. */
    if (MAPA.andando && p.rumbo != null && !isNaN(p.rumbo)) {
      MAPA.marcaYo.setIcon({
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 5.5,
        fillColor: '#5B6BFF', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
        rotation: p.rumbo
      });
    }
    MAPA.yo = pos;
    MAPA.error = p.error;
  }

  async function trazar(casa, yo) {
    var r;
    try {
      r = await llamarMapa({ accion: 'ruta', desde: yo.lat + ',' + yo.lng, hasta: casa.lat + ',' + casa.lng });
    } catch (e) { return; }
    if (!r.ok || !r.linea) return;
    var puntos = abrirLinea(r.linea);
    if (MAPA.linea) MAPA.linea.setPath(puntos);
    else MAPA.linea = new google.maps.Polyline({
      map: MAPA.mapa, path: puntos,
      strokeColor: '#5B6BFF', strokeOpacity: .9, strokeWeight: 5
    });
    if ($('mapa-dist')) $('mapa-dist').textContent = r.texto || '';
    //  Encuadre solo mientras NO va andando: en pleno viaje el mapa lo sigue a
    //  el, y reencuadrar seria quitarselo de las manos cada pocos segundos.
    if (!MAPA.andando) {
      var caja = new google.maps.LatLngBounds();
      caja.extend(yo); caja.extend(casa);
      MAPA.mapa.fitBounds(caja, 60);
    }
  }

  function pintarRuta(casa) {
    /*  La linea se traza DOS VECES como mucho: una con la lectura tosca, para
        que se vea algo ya, y otra cuando llega la buena. El punto azul si se
        corrige en cada mejora —eso es gratis—, pero cada trazo es una llamada
        a Google que se paga, y el GPS mejora cuatro o cinco veces seguidas. */
    var trazos = 0;
    MAPA.buscando = ubicarme(function (p, definitivo) {
      pintarYo(p);
      pintarPrecision(p, definitivo);
      if (trazos === 0 || definitivo) {
        trazos++;
        trazar(casa, { lat: p.lat, lng: p.lng });
      }
      if (definitivo) {
        MAPA.buscando = null;
        /* Mas de 200 metros con el GPS a tope no es un satelite lento: es el
           permiso aproximado. Se ofrece la explicacion UNA vez por pedido, sin
           taparle el mapa — la pastilla se queda ahi por si la quiere luego. */
        if (p.error > 200 && !MAPA.avisoGps) { MAPA.avisoGps = true; abrirGps('aproximada'); }
      }
    });
    /* Sin GPS no hay l\u00ednea, pero el mapa con la casa marcada ya sirve para
       orientarse. No se avisa nada: no falt\u00f3 nada importante. */
  }

  function centrarEnMi() {
    if (!MAPA.mapa) { toast('El mapa a\u00fan no est\u00e1 listo'); return; }
    seguir(true);
    if (MAPA.yo) { MAPA.mapa.panTo(MAPA.yo); MAPA.mapa.setZoom(MAPA.andando ? 18 : 17); }
    ubicarme(function (p) {
      pintarYo(p);
      if (MAPA.siguiendo) MAPA.mapa.panTo({ lat: p.lat, lng: p.lng });
    }, function () { toast('Activa el GPS'); });
  }

  /* SEGUIR O NO SEGUIR, que es lo que hace Google al arrastrar el mapa.
     Mientras lo sigue, el boton de centrar estorba y no se ve; en cuanto el
     domiciliario mueve el mapa con el dedo, deja de seguirlo —si no, el mapa
     le pelearia el dedo— y aparece el boton para volver. */
  function seguir(si) {
    MAPA.siguiendo = !!si;
    var b = $('mapa-centrar');
    if (b) b.hidden = !!si;
  }

  /* ══════════════════════════════════════════════════════════════
     "INICIAR" — la ruta andando, dentro de Cobra
     ══════════════════════════════════════════════════════════════
     Tres cosas, que son las que hacen que se sienta como Google Maps:

       1. El mapa SIGUE al domiciliario. Cada posición nueva del GPS mueve la
          cámara con él.
       2. Los puntos CORREN sobre la línea, hacia el destino. Eso es lo que la
          hace ver encendida y no un dibujo quieto.
       3. La pantalla NO SE APAGA mientras dure. Un domiciliario no puede ir
          desbloqueando el teléfono en cada esquina.                       */

  function iniciarRuta() {
    if (MAPA.andando) { detenerRuta(); return; }
    if (!MAPA.mapa || !MAPA.casa) { toast('El mapa aún no está listo'); return; }
    if (MAPA.aprox) { toast('Esta dirección no está confirmada'); return; }
    if (!navigator.geolocation && !geoNativo()) { toast('Este equipo no tiene ubicación'); return; }

    /*  La busqueda de arranque puede seguir viva y reencuadrando el mapa. Si
        se deja, se pelea con el viaje: uno centra en el domiciliario y la otra
        vuelve a encuadrar el recorrido entero. */
    if (MAPA.buscando) { MAPA.buscando.parar(); MAPA.buscando = null; }

    MAPA.andando = true;
    var b = $('btn-mapa-iniciar');
    if (b) b.classList.add('andando');
    if ($('mapa-iniciar-tx')) $('mapa-iniciar-tx').textContent = 'Detener';

    //  1) La cámara va detrás del domiciliario, y el punto se vuelve flecha.
    seguir(true);
    MAPA.mapa.setZoom(18);
    if (MAPA.yo) MAPA.mapa.panTo(MAPA.yo);
    MAPA.vigia = vigilar(function (p) {
      pintarYo(p);
      pintarPrecision(p, true);
      if (MAPA.siguiendo && MAPA.mapa) MAPA.mapa.panTo({ lat: p.lat, lng: p.lng });
    });

    //  2) Los puntos corriendo. El truco es mover el `offset` del símbolo: la
    //     línea no se toca, solo se desplazan los puntos por encima.
    if (MAPA.linea) {
      MAPA.linea.setOptions({
        strokeOpacity: .45,
        icons: [{
          icon: {
            path: google.maps.SymbolPath.CIRCLE, scale: 3.2,
            fillColor: '#5B6BFF', fillOpacity: 1, strokeColor: '#5B6BFF', strokeWeight: 1
          },
          offset: '0%', repeat: '42px'
        }]
      });
      var d = 0;
      MAPA.latido = setInterval(function () {
        d = (d + 1) % 200;
        var ic = MAPA.linea.get('icons');
        if (!ic) return;
        ic[0].offset = (d / 2) + '%';
        MAPA.linea.set('icons', ic);
      }, 55);
    }

    //  3) Que no se apague la pantalla. Si el navegador no lo permite, se sigue
    //     sin eso: no es motivo para no arrancar.
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request('screen')
          .then(function (w) { MAPA.despierto = w; })
          .catch(function () {});
      }
    } catch (e) {}

    toast('Ruta iniciada');
  }

  function detenerRuta() {
    if (MAPA.vigia) { MAPA.vigia.parar(); MAPA.vigia = null; }
    if (MAPA.latido) { clearInterval(MAPA.latido); MAPA.latido = null; }
    if (MAPA.linea) MAPA.linea.setOptions({ strokeOpacity: .9, icons: [] });
    if (MAPA.despierto) { try { MAPA.despierto.release(); } catch (e) {} MAPA.despierto = null; }
    MAPA.andando = false;
    seguir(false);
    if ($('mapa-centrar')) $('mapa-centrar').hidden = true;
    if ($('mapa-precision')) $('mapa-precision').hidden = true;
    var b = $('btn-mapa-iniciar');
    if (b) b.classList.remove('andando');
    if ($('mapa-iniciar-tx')) $('mapa-iniciar-tx').textContent = 'Iniciar';
  }

  /* ══════════════════════════════════════════════════════════════════
     NAVEGACIÓN Y CLICS
     ══════════════════════════════════════════════════════════════════ */
  function irA(tab) {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('on', v.id === 'v-' + tab);
    });
    /* Sube el UNICO sitio que rueda. Antes se subia `.body`, que ya no rueda:
       al cambiar de pestana la barra de arriba se quedaba escondida. */
    var sc = $('dm-scroll');
    if (sc) sc.scrollTop = 0;
    if (tab === 'turno') pintarTurno();
  }

  function conectarEventos() {
    document.addEventListener('click', function (e) {
      var t = e.target;

      if (t.closest('#lg-entrar')) { entrar(); return; }

      var tab = t.closest('.tab[data-tab]');
      if (tab) { irA(tab.dataset.tab); return; }

      if (t.closest('#link-ver-todos')) { irA('pedidos'); return; }
      if (t.closest('#link-turno')) { irA('turno'); return; }
      if (t.closest('#btn-perfil-top')) { irA('perfil'); return; }
      if (t.closest('#btn-ruta')) { verRuta(); return; }

      /*  El boton del medio abre EL MAPA. Es el que parece un mapa, asi que es
          lo que la gente espera que haga — Sergio mismo lo llamo "el icono de
          mapa". Compartir la ubicacion sigue estando en el detalle del pedido
          y en el perfil, que es donde se busca a proposito.                */
      if (t.closest('#fab-ubicacion')) { verRuta(); return; }
      if (t.closest('#btn-ubicacion-detalle')
        || t.closest('#btn-ubicacion-perfil')) { compartirUbicacion(); return; }

      var chip = t.closest('.fchip[data-filtro]');
      if (chip) { S.filtro = chip.dataset.filtro; pintarLista(); return; }

      var card = t.closest('[data-pedido]');
      if (card) { abrirDetalle(card.dataset.pedido); return; }

      if (t.closest('#btn-avisos')) { abrirAvisos(); return; }
      if (t.closest('#btn-cerrar-avisos')) { if ($('ov-avisos')) $('ov-avisos').hidden = true; return; }
      if (t.closest('#av-son')) {
        var on = !sonidoEncendido();
        try { localStorage.setItem(SON_KEY, on ? '1' : '0'); } catch (e) {}
        pintarAvisos();
        /* Al encenderlo suena una vez: asi se sabe que de verdad se oye, y de
           paso el toque deja el audio abierto para el resto del turno. */
        if (on) { abrirAudio(); sonar(); }
        return;
      }

      if (t.closest('#mapa-precision')) { abrirGps('aproximada'); return; }
      if (t.closest('#gps-cerrar')) { if ($('ov-gps')) $('ov-gps').hidden = true; return; }
      if (t.closest('#gps-reintentar')) {
        if ($('ov-gps')) $('ov-gps').hidden = true;
        MAPA.avisoGps = false;
        if (MAPA.casa) pintarRuta(MAPA.casa); else centrarEnMi();
        return;
      }
      if (t.closest('#mapa-centrar')) { centrarEnMi(); return; }
      if (t.closest('#mapa-antes')) { moverMapa(-1); return; }
      if (t.closest('#mapa-siguiente')) { moverMapa(1); return; }
      if (t.closest('#btn-mapa-volver')) { cerrarMapa(); return; }
      if (t.closest('#btn-mapa-yo')) { centrarEnMi(); return; }
      if (t.closest('#btn-mapa-iniciar')) { iniciarRuta(); return; }

      if (t.closest('#btn-cerrar-detalle')) { cerrarTodo(); return; }
      if (t.closest('#btn-volver-detalle')) { $('ov-cobro').hidden = true; return; }
      if (t.closest('#btn-accion-principal')) { accionPrincipal(); return; }
      if (t.closest('#btn-cobrar')) { confirmarCobro(); return; }

      var seg = t.closest('#cobro-seg button[data-tipo]');
      if (seg) {
        S.cobroTipo = seg.dataset.tipo === 'transfer' ? 'transfer' : 'efectivo';
        S.recibido = null;
        document.querySelectorAll('#cobro-efectivo .cash').forEach(function (c) { c.classList.remove('on'); });
        pintarCobro();
        return;
      }

      var cash = t.closest('.cash[data-monto]');
      if (cash) {
        document.querySelectorAll('.cash').forEach(function (c) { c.classList.remove('on'); });
        cash.classList.add('on');
        var otro = $('cobro-otro');
        if (cash.dataset.monto === 'otro') {
          if (otro) { otro.hidden = false; otro.focus(); }
          S.recibido = otro && otro.value ? Number(otro.value.replace(/\D/g, '')) : null;
        } else {
          if (otro) otro.hidden = true;
          S.recibido = Number(cash.dataset.monto) || null;
        }
        pintarCobro();
        return;
      }

      if (t.closest('#btn-llamar')) {
        var p = S.abierto;
        if (p && p.tel) window.location.href = 'tel:' + p.tel.replace(/\s/g, '');
        else toast('Este pedido no tiene teléfono');
        return;
      }

      if (t.closest('#btn-logout')) { salir(); return; }
      if (t.closest('#btn-resumen-caja')) { toast('La caja ya ve tu efectivo pendiente'); return; }
      if (t.closest('#btn-cerrar-turno')) { toast('Entrega el efectivo en caja'); return; }

      /* Cerrar tocando el fondo, no el contenido. */
      if (t.classList && t.classList.contains('ov')) {
        if (t.id === 'ov-cobro') t.hidden = true;
        else if (t.id === 'ov-detalle') cerrarTodo();
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'cobro-otro') {
        var v = e.target.value.replace(/\D/g, '');
        e.target.value = v;
        S.recibido = v ? Number(v) : null;
        pintarCobro();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.target.id === 'lg-pass' || e.target.id === 'lg-email')) {
        e.preventDefault(); entrar();
      }
    });
  }

  async function salir() {
    await sb.auth.signOut();
    window.location.reload();
  }

  /* ══════════════════════════════════════════════════════════════════
     ARRANQUE
     ══════════════════════════════════════════════════════════════════ */
  async function cargarCuenta() {
    /* La cuenta para transferencias sale de la configuración del negocio.
       Si no hay ninguna, se dice; no se inventa un número. */
    try {
      var r = await sb.from('branches')
        .select('city,operacion_config,brand_id').eq('id', S.yo.branch_id).maybeSingle();
      var b = r && r.data;
      S.ciudad = (b && b.city) || '';
      /* La foto del restaurante. Vive en la MARCA, no en la sede: dos sedes
         del mismo negocio comparten logo, y el domiciliario trabaja para el
         negocio, no para el local. */
      if (b && b.brand_id) {
        try {
          var rb = await sb.from('brands').select('name,logo_url').eq('id', b.brand_id).maybeSingle();
          if (rb && rb.data) {
            S.logo = rb.data.logo_url || '';
            S.negocio = S.negocio || rb.data.name || '';
          }
        } catch (e) { console.warn('[domi] marca:', e && e.message); }
      }
      pintarLogo();
      /*  El TONO lo escoge el dueno una vez para todo el restaurante, igual
          que en la pantalla de cocina; encenderlo o no es de cada celular.
          Si todavia no hay uno propio para la app, se usa el de cocina: es
          mejor que suene algo escogido a que suene un pitido cualquiera. */
      var _op = (b && b.operacion_config) || {};
      var _dn = _op.domiNotif || _op.cocinaNotif || {};
      S.sonTono = _dn.tono || 'aero2';
      S.sonVol  = (typeof _dn.vol === 'number') ? _dn.vol : 80;
      var cfg = (b && b.operacion_config) || {};
      var pagos = cfg.pagos || cfg.metodos_pago || null;
      if (pagos && (pagos.numero || pagos.cuenta)) {
        S.cuenta = {
          numero: pagos.numero || pagos.cuenta,
          titular: pagos.titular || S.negocio
        };
      }
    } catch (e) { /* sin cuenta configurada: se muestra el aviso */ }
  }

  async function arrancar() {
    await cargarCuenta();
    await cargarPedidos();
    pintarTodo();

    /* ── QUE EL PEDIDO APAREZCA SOLO, Y QUE NO SE PIERDA ────────────────
       Un domiciliario lleva el celular en el bolsillo, con la pantalla
       apagada, moviendose entre antenas. El tiempo real por si solo NO basta:
       el socket se cae al apagar la pantalla y, tal como estaba, nadie se
       enteraba y no volvia — habia que matar la app. Por eso hay cuatro
       redes, no una:

         1. tiempo real, para que llegue al instante
         2. reintento cuando el socket se cae
         3. un repaso cada 25 s, por si se perdio un aviso
         4. al volver a la pantalla, se recarga de una

       Y se escuchan INSERT ademas de UPDATE: un pedido creado ya asignado
       nunca dispara un UPDATE, y sin esto no aparecia nunca. */
    escuchar();
    clearInterval(S.repaso);
    S.repaso = setInterval(function () {
      if (document.hidden) return;      // dormido no se gasta bateria ni datos
      refrescar();
    }, 25000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refrescar(); escuchar(); }
    });
    window.addEventListener('online',  function () { marcarRed(true);  refrescar(); escuchar(); });
    window.addEventListener('offline', function () { marcarRed(false); });
  }

  async function refrescar() {
    try {
      await cargarPedidos();
      pintarTodo();
      marcarRed(true);
    } catch (e) { marcarRed(false); }
  }

  /* Se (re)suscribe. Si el canal se cae o se cierra, se vuelve a intentar a
     los pocos segundos en vez de quedarse mudo para siempre. */
  function escuchar() {
    try {
      if (S.canal) { try { sb.removeChannel(S.canal); } catch (e) {} S.canal = null; }
      S.canal = sb.channel('domi-' + S.yo.id + '-' + Date.now())
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'pos_orders',
          filter: 'domiciliario_id=eq.' + S.yo.id
        }, function () { refrescar(); })
        .subscribe(function (estado) {
          if (estado === 'SUBSCRIBED') { marcarRed(true); return; }
          if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
            marcarRed(false);
            clearTimeout(S.reintento);
            S.reintento = setTimeout(escuchar, 4000);
          }
        });
    } catch (e) { console.warn('[domi] tiempo real:', e); }
  }

  /* EL AVISO DE SIN CONEXION. Una app de reparto que deja de actualizarse en
     silencio es peor que no tener app: el domiciliario le cree y se queda
     esperando un pedido que ya le asignaron. */
  function marcarRed(ok) {
    var b = $('sinred');
    if (!b) return;
    var hay = ok && (navigator.onLine !== false);
    b.hidden = !!hay;
  }

  /* El velo solo se quita cuando de verdad hay algo que mostrar. Si algo
     falla, se dice QUE fallo y se ofrece reintentar — nunca se destapa la
     maqueta. */
  function quitarVelo() {
    var v = $('velo');
    if (v) v.hidden = true;
  }
  function veloDice(txt, malo) {
    var v = $('velo'), t = $('velo-txt');
    if (!v || !t) return;
    v.hidden = false;
    t.textContent = txt;
    if (!malo) return;
    var sp = v.querySelector('.dm-spin');
    if (sp) sp.remove();
    if (!v.querySelector('.dm-reintentar')) {
      var b = document.createElement('button');
      b.className = 'dm-reintentar';
      b.textContent = 'Reintentar';
      b.onclick = function () { location.reload(); };
      v.appendChild(b);
    }
  }

  async function init() {
    try {
      conectarEventos();
      conectarSwipe();
      conectarSwipeMapa();
      pintarPunto();
      veloDice('Comprobando tu sesión…');
      var s = await sb.auth.getSession();
      if (s && s.data && s.data.session) {
        veloDice('Cargando tu turno…');
        var ok = await cargarPerfil();
        if (ok) { await arrancar(); quitarVelo(); return; }
        await sb.auth.signOut();
      }
      var lg = $('ov-login');
      if (lg) lg.hidden = false;
      quitarVelo();
    } catch (e) {
      console.error('[domi] no pudo abrir:', e);
      veloDice('No se pudo abrir la app. Revisa tu conexión.', true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  /* Si algo revienta despues de arrancar, que no quede la app a medias en
     silencio: se ve el aviso y se puede reintentar. */
  window.addEventListener('error', function (ev) {
    var v = document.getElementById('velo');
    if (v && !v.hidden) veloDice('No se pudo abrir la app: ' + (ev.message || ''), true);
  });
})();
