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
    fotos: {},         // product_id -> foto, para reconocer el pedido de un vistazo
    heroIdx: null      // cual pedido muestra la tarjeta azul; null = todavia no lo elige el dedo
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
  function compartirUbicacion() {
    if (!navigator.geolocation) { toast('Este equipo no permite ubicación'); return; }
    toast('Obteniendo tu ubicación…');
    navigator.geolocation.getCurrentPosition(async function (pos) {
      try {
        await sb.from('pos_domi_ubicaciones').insert({
          tenant_id: S.yo.tenant_id,
          domiciliario_id: S.yo.id,
          order_id: S.abierto ? S.abierto.id : null,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
        toast('Ubicación enviada al negocio');
      } catch (e) { toast('No se pudo enviar la ubicación'); }
    }, function () {
      toast('Activa el GPS para compartir ubicación');
    }, { timeout: 6000, enableHighAccuracy: true });
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
    andando: false, vigia: null, latido: null, despierto: null };

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

  function verRuta() {
    var p = S.abierto || activos()[0];
    if (!p) { toast('No hay ningún pedido activo'); return; }
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
    mapaAviso('Abriendo el mapa…', '', true);
    armarMapa(p);
  }

  function cerrarMapa() {
    /* Apagar el seguimiento al salir NO es limpieza de adorno: `watchPosition`
       deja el GPS prendido, y el GPS es lo que más batería gasta en un
       celular que va a estar toda la tarde en la calle. */
    detenerRuta();
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

  function pintarRuta(casa) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async function (pos) {
      var yo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (!MAPA.mapa) return;
      MAPA.marcaYo = new google.maps.Marker({
        map: MAPA.mapa, position: yo, title: 'Tú',
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 7,
          fillColor: '#5B6BFF', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3
        }
      });
      var r;
      try {
        r = await llamarMapa({ accion: 'ruta', desde: yo.lat + ',' + yo.lng, hasta: casa.lat + ',' + casa.lng });
      } catch (e) { return; }
      if (!r.ok || !r.linea) return;

      MAPA.linea = new google.maps.Polyline({
        map: MAPA.mapa, path: abrirLinea(r.linea),
        strokeColor: '#5B6BFF', strokeOpacity: .9, strokeWeight: 5
      });
      var caja = new google.maps.LatLngBounds();
      caja.extend(yo); caja.extend(casa);
      MAPA.mapa.fitBounds(caja, 60);
      if ($('mapa-dist')) $('mapa-dist').textContent = r.texto || '';
    }, function () {
      /* Sin GPS no hay línea, pero el mapa con la casa marcada ya sirve para
         orientarse. No se muestra error: no faltó nada importante. */
    }, { timeout: 8000, enableHighAccuracy: true });
  }

  function centrarEnMi() {
    if (!MAPA.mapa || !navigator.geolocation) { toast('El mapa aún no está listo'); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var yo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      MAPA.mapa.setCenter(yo); MAPA.mapa.setZoom(17);
      if (MAPA.marcaYo) MAPA.marcaYo.setPosition(yo);
    }, function () { toast('Activa el GPS'); }, { timeout: 8000, enableHighAccuracy: true });
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
    if (!navigator.geolocation) { toast('Este equipo no tiene ubicación'); return; }

    MAPA.andando = true;
    var b = $('btn-mapa-iniciar');
    if (b) b.classList.add('andando');
    if ($('mapa-iniciar-tx')) $('mapa-iniciar-tx').textContent = 'Detener';

    //  1) La cámara va detrás del domiciliario.
    MAPA.mapa.setZoom(17);
    MAPA.vigia = navigator.geolocation.watchPosition(function (pos) {
      var yo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (MAPA.marcaYo) MAPA.marcaYo.setPosition(yo);
      if (MAPA.mapa) MAPA.mapa.panTo(yo);
    }, function () {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });

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
    if (MAPA.vigia !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(MAPA.vigia); MAPA.vigia = null;
    }
    if (MAPA.latido) { clearInterval(MAPA.latido); MAPA.latido = null; }
    if (MAPA.linea) MAPA.linea.setOptions({ strokeOpacity: .9, icons: [] });
    if (MAPA.despierto) { try { MAPA.despierto.release(); } catch (e) {} MAPA.despierto = null; }
    MAPA.andando = false;
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
    var body = document.querySelector('#v-' + tab + ' .body');
    if (body) body.scrollTop = 0;
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
        .select('city,operacion_config').eq('id', S.yo.branch_id).maybeSingle();
      var b = r && r.data;
      S.ciudad = (b && b.city) || '';
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
