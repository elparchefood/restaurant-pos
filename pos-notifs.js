/* pos-notifs.js — la campana de notificaciones del escritorio.
 *
 * El buzón de las cosas que PIDEN UNA DECISIÓN del dueño. Esa es la regla, y
 * costó aprenderla: al principio traía también las recargas y todo lo que el
 * asistente aprendía atendiendo, y con eso llegó a tener un aviso por cada
 * pedido. Un buzón que avisa de todo no lo lee nadie, y entonces tampoco sirve
 * para lo que sí importaba.
 *
 *  · BARRIOS SIN PRECIO que escribió un cliente al registrarse en la página.
 *    Ese cliente está esperando a que le digan cuánto cuesta llegarle, y
 *    mientras tanto su domicilio se cobra en CERO. Solo los de la página: lo
 *    que aprende el asistente entra a la misma lista para aprobar, pero sin
 *    interrumpir.
 *  · PRIMEROS PASOS — para una cuenta que arranca: qué falta configurar antes
 *    de vender (productos, mesas, métodos de pago), cada uno llevando a su
 *    pantalla. En cuanto todo está, el grupo desaparece solo.
 *
 * Lo leído se recuerda en el equipo (por negocio): el punto rojo cuenta solo
 * lo que no se ha abierto. Abrir el buzón lo marca todo como visto.
 */
(function (w) {
  'use strict';

  var K_VISTOS = null;      // llave localStorage, se arma con el tenant
  var abierta = false;

  function sb() { return w._pos && w._pos.sb; }
  function st() { return (w._pos && w._pos.state) || {}; }
  function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* "hace 5 min" se entiende; "01:30:27.088+00" no. */
  function hace(fecha) {
    var ms = Date.now() - new Date(fecha).getTime();
    var m = Math.floor(ms / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.floor(h / 24);
    return d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }

  function vistos() {
    try { return JSON.parse(localStorage.getItem(K_VISTOS) || '[]'); } catch (e) { return []; }
  }
  function marcarVistos(ids) {
    try {
      var s = vistos();
      ids.forEach(function (i) { if (s.indexOf(i) < 0) s.push(i); });
      localStorage.setItem(K_VISTOS, JSON.stringify(s.slice(-300)));
    } catch (e) {}
  }

  var ICO = {
    recarga: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="17" cy="15" r="1.4"/></svg>',
    solicitud: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    paso: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  };
  var TINTE = { recarga: ['#ECFEFF', '#0891B2'], solicitud: ['#FFFBEB', '#B45309'], paso: ['#EEF2FF', '#5B6BFF'] };

  /* ── Las fuentes. Cada una devuelve items {id, tipo, titulo, sub, cuando, ir} ── */

  async function fuenteRecargas() {
    var s = sb(); if (!s) return [];
    try {
      var t = await s.from('tenants').select('web_activa').eq('id', st().tenantId).maybeSingle();
      if (!t.data || !t.data.web_activa) return [];
    } catch (e) { return []; }
    var items = [];
    try {
      var r = await s.from('pos_saldo_mov')
        .select('id, monto, created_at, pos_clientes(nombre)')
        .eq('tenant_id', st().tenantId).eq('motivo', 'recarga')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(10);
      (r.data || []).forEach(function (f) {
        items.push({
          id: 'rec-' + f.id, tipo: 'recarga',
          titulo: ((f.pos_clientes && f.pos_clientes.nombre) || 'Un cliente') + ' recargó ' + money(f.monto),
          sub: 'El saldo ya quedó en su cuenta', cuando: f.created_at, ir: 'clientes.html',
        });
      });
    } catch (e) {}
    try {
      var p = await s.from('pos_recargas_solicitudes')
        .select('id, monto_leido, monto_dicho, creado, pos_clientes(nombre)')
        .eq('tenant_id', st().tenantId)
        .not('estado', 'in', '("aplicada","descartada")')
        .order('creado', { ascending: false }).limit(5);
      (p.data || []).forEach(function (f) {
        items.push({
          id: 'sol-' + f.id, tipo: 'solicitud',
          titulo: 'Recarga por confirmar: ' + money(f.monto_leido || f.monto_dicho),
          sub: ((f.pos_clientes && f.pos_clientes.nombre) || 'Un cliente') + ' espera que la revises',
          cuando: f.creado, ir: 'clientes.html', urgente: true,
        });
      });
    } catch (e) {}
    return items;
  }

  /* BARRIOS SIN PRECIO DE DOMICILIO (17-ago).
     Cuando un cliente guarda una direccion cuyo barrio no esta en la tabla de
     zonas, queda anotado en `pos_domi_aprendidos` esperando que el dueNo le
     ponga precio. La pantalla para aprobarlo YA existe (Configuracion →
     Domicilios); lo que faltaba era enterarse sin ir a buscarlo.

     Mientras nadie le ponga precio, ese domicilio se cobra en CERO: es plata
     que el negocio esta perdiendo en cada pedido a ese barrio. Por eso va
     como urgente. */
  async function fuenteBarrios() {
    var s = sb(); var items = [];
    if (!s || !st().tenantId) return items;
    try {
      var r = await s.from('pos_domi_aprendidos')
        .select('id, barrio, veces, direccion, updated_at, created_at, tipo')
        .eq('tenant_id', st().tenantId)
        .eq('tipo', 'nuevo')
        .eq('descartado', false)
        /* SOLO LOS DE LA PAGINA DE CLIENTES (19-ago, Sergio). Lo que aprende el
           asistente atendiendo pedidos tambien entra a la lista de barrios por
           aprobar, pero NO suena aqui: la campana se estaba llenando con un
           aviso por cada pedido que tomaba Paco.
           Un cliente que guarda SU direccion en la pagina si es otra cosa:
           esta esperando a que le digan cuanto cuesta llegarle. */
        .eq('origen', 'web')
        .order('veces', { ascending: false }).limit(5);
      (r.data || []).forEach(function (f) {
        var n = Number(f.veces) || 1;
        items.push({
          id: 'barrio-' + f.id, tipo: 'solicitud',
          titulo: 'Barrio sin precio de domicilio: ' + esc(f.barrio || ''),
          sub: (n > 1 ? n + ' clientes lo han escrito' : 'Un cliente lo escribio')
               + ' · hoy se cobra en $0',
          cuando: f.updated_at || f.created_at,
          /* SE RESUELVE AQUI MISMO (19-ago, Sergio). Antes esto llevaba a
             Configuracion → Domicilios a buscar la fila, decidir a que zona
             pertenecia y escribir el barrio a mano dentro de un cuadro de
             texto: cinco pasos y otra pantalla para poner UN numero. */
          barrio: f,
          urgente: true,
        });
      });
    } catch (e) {}
    return items;
  }

  /* Los primeros pasos de una cuenta nueva. Sin fecha: son estado, no evento.
     En cuanto el paso se cumple, desaparece de aquí solito. */
  /* AVISOS DEL SISTEMA (19-ago, pedido de Sergio). Hoy solo hay uno —el saldo
     de los SMS— pero la tabla es generica: el proximo entra sin tocar nada de
     aqui. Los escribe `revisar-saldo-sms` por cron, no el navegador: el saldo
     de Twilio se lee con credenciales que no pueden vivir en el front. */
  async function fuenteSistema() {
    var s = sb(); if (!s || !st().tenantId) return [];
    try {
      var r = await s.from('pos_avisos_sistema')
        .select('clave,titulo,sub,urgente,ir,updated_at')
        .eq('tenant_id', st().tenantId);
      return (r.data || []).map(function (a) {
        return {
          id: 'sys-' + a.clave, tipo: 'sistema',
          titulo: esc(a.titulo || ''), sub: esc(a.sub || ''),
          cuando: a.updated_at, ir: a.ir || '', urgente: a.urgente === true,
        };
      });
    } catch (e) { return []; }
  }

  async function fuentePrimerosPasos() {
    var s = sb(); if (!s) return [];
    var items = [];
    try {
      var checks = await Promise.allSettled([
        s.from('pos_products').select('id', { count: 'exact', head: true }).eq('tenant_id', st().tenantId),
        s.from('pos_tables').select('id', { count: 'exact', head: true }).eq('branch_id', st().branchId),
        s.from('ia_config').select('pagos').eq('branch_id', st().branchId).maybeSingle(),
      ]);
      var nProd = checks[0].status === 'fulfilled' ? (checks[0].value.count || 0) : 1;
      var nMesas = checks[1].status === 'fulfilled' ? (checks[1].value.count || 0) : 1;
      var mets = 0;
      if (checks[2].status === 'fulfilled') {
        var pg = (checks[2].value.data && checks[2].value.data.pagos) || {};
        mets = (Array.isArray(pg.metodos) ? pg.metodos : []).filter(function (m) {
          return m && m.activo !== false && String(m.nombre || '').trim() && !/^__/.test(String(m.id || ''));
        }).length;
      }
      if (!nProd) items.push({ id: 'paso-productos', tipo: 'paso', titulo: 'Carga tu carta',
        sub: 'Sin productos no hay nada que vender. Empieza por aquí.', ir: 'catalogo-productos.html' });
      if (!nMesas) items.push({ id: 'paso-mesas', tipo: 'paso', titulo: 'Crea tus mesas y zonas',
        sub: 'Para vender por salón. Si solo vendes para llevar, puedes saltarlo.', ir: 'configuracion.html?s=mesas' });
      if (!mets) items.push({ id: 'paso-pagos', tipo: 'paso', titulo: 'Configura cómo te pagan',
        sub: 'Efectivo, transferencia… lo que aceptes al cobrar.', ir: 'configuracion.html?s=pagos' });
    } catch (e) {}
    return items;
  }

  /* ── El panel ─────────────────────────────────────────────────────────── */

  function pintar(items) {
    var panel = document.getElementById('notif-panel');
    if (!panel) return;
    if (!items.length) {
      panel.innerHTML = '<div class="ntf-head">Notificaciones</div>'
        + '<div class="ntf-vacio">'
        + '<div class="ntf-vacio-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>'
        + '<div class="ntf-vacio-t">Estás al día</div>'
        + '<div class="ntf-vacio-s">Aquí van a llegar las recargas de tus clientes, los avisos del sistema y lo que pida tu atención.</div>'
        + '</div>';
      return;
    }
    var vist = vistos();
    var pasos = items.filter(function (i) { return i.tipo === 'paso'; });
    var resto = items.filter(function (i) { return i.tipo !== 'paso'; });

    function fila(i) {
      var tint = TINTE[i.tipo] || TINTE.paso;
      var nuevo = vist.indexOf(i.id) < 0;
      return '<button class="ntf-item' + (nuevo ? ' nuevo' : '') + (i.urgente ? ' urgente' : '') + '"'
        + ' data-id="' + esc(i.id) + '" data-ir="' + esc(i.ir || '') + '">'
        + '<span class="ntf-ico" style="background:' + tint[0] + ';color:' + tint[1] + '">' + (ICO[i.tipo] || ICO.paso) + '</span>'
        + '<span class="ntf-tx"><span class="ntf-t">' + esc(i.titulo) + '</span>'
        + '<span class="ntf-s">' + esc(i.sub || '') + (i.cuando ? ' · ' + hace(i.cuando) : '') + '</span></span>'
        + (nuevo ? '<span class="ntf-punto"></span>' : '')
        + '</button>';
    }

    var h = '<div class="ntf-head">Notificaciones</div>';
    if (pasos.length) {
      h += '<div class="ntf-grupo">Primeros pasos</div>' + pasos.map(fila).join('');
    }
    if (resto.length) {
      if (pasos.length) h += '<div class="ntf-grupo">Actividad</div>';
      h += resto.map(fila).join('');
    }
    panel.innerHTML = h;
    panel.querySelectorAll('.ntf-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = items.filter(function (x) { return x.id === b.dataset.id; })[0];
        /* El barrio se resuelve en un modal aqui mismo; los demas avisos siguen
           llevando a su pantalla. */
        if (it && it.barrio) { cerrarPanel(); modalBarrio(it.barrio); return; }
        if (!b.dataset.ir) return;
        /* Un enlace de AFUERA (la consola de Twilio) se abre aparte: sacar al
           dueNo del panel para volver a entrar es una molestia, y si estaba a
           mitad de algo lo pierde. */
        if (/^https?:/i.test(b.dataset.ir)) w.open(b.dataset.ir, '_blank', 'noopener');
        else w.location.href = b.dataset.ir;
      });
    });
  }

  /* ══ EL BARRIO SE RESUELVE EN EL AVISO ═══════════════════════════════════
     Pedido de Sergio (19-ago): tocar el aviso abría Configuración → Domicilios
     y tocaba buscar la fila, decidir a qué zona pertenecía y escribir el barrio
     a mano dentro de un cuadro de texto. Cinco pasos y otra pantalla para poner
     un número.

     Ahora se resuelve donde apareció: se confirma el lugar, se pone el precio,
     y el barrio queda guardado en su zona — la misma tabla que consulta el
     asistente y la página de clientes. Si el precio ya existe entra a esa zona;
     si no, se crea. Es exactamente lo que hacía la pantalla de Configuración,
     pero sobre los datos y no sobre los cuadros de texto. */
  function modalBarrio(f) {
    var viejo = document.getElementById('ntf-barrio-cap');
    if (viejo) viejo.remove();

    var cap = document.createElement('div');
    cap.id = 'ntf-barrio-cap';
    cap.className = 'ntf-cap';
    cap.innerHTML =
      '<div class="ntf-modal" role="dialog" aria-modal="true" aria-label="Precio del domicilio">' +
        '<div class="ntf-modal-hd">' +
          '<div>' +
            '<div class="ntf-modal-t">' + esc(f.barrio || '') + '</div>' +
            '<div class="ntf-modal-s">Un cliente guardó esta dirección en tu página' +
              (Number(f.veces) > 1 ? ' · ' + f.veces + ' veces' : '') + '</div>' +
          '</div>' +
          '<button class="ntf-x" type="button" data-cerrar aria-label="Cerrar">✕</button>' +
        '</div>' +

        (f.direccion
          ? '<div class="ntf-modal-dir"><span>Dirección que escribió</span><b>' + esc(f.direccion) + '</b></div>'
          : '') +

        '<label class="ntf-modal-lb" for="ntf-precio">¿Cuánto cobras el domicilio hasta ahí?</label>' +
        '<div class="ntf-modal-money">' +
          '<span>$</span>' +
          '<input type="number" id="ntf-precio" min="0" step="500" inputmode="numeric" placeholder="0" autocomplete="off">' +
        '</div>' +
        /* Los precios que ya usa, de un toque: casi siempre el barrio nuevo
           cuesta lo mismo que alguno que ya tiene. */
        '<div class="ntf-modal-sug" id="ntf-sug"></div>' +

        '<div class="ntf-modal-pie">' +
          '<button class="ntf-btn-no" type="button" data-no>No es un barrio</button>' +
          '<button class="ntf-btn-ok" type="button" data-ok>Guardar</button>' +
        '</div>' +
        '<div class="ntf-modal-nota">Queda guardado en tu tabla de zonas: lo van a usar la página y el asistente.</div>' +
      '</div>';
    document.body.appendChild(cap);

    var input = cap.querySelector('#ntf-precio');
    setTimeout(function () { if (input) input.focus(); }, 40);

    /* Los precios que ya tiene, para no hacerle escribir lo que ya existe. */
    zonasDe().then(function (zonas) {
      var sug = cap.querySelector('#ntf-sug');
      if (!sug || !zonas.length) return;
      sug.innerHTML = '<span>Los que ya usas:</span>' + zonas
        .map(function (z) { return Number(z.precio) || 0; })
        .filter(function (p, i, a) { return p > 0 && a.indexOf(p) === i; })
        .sort(function (a, b) { return a - b; })
        .map(function (p) { return '<button type="button" class="ntf-chip" data-p="' + p + '">' + money(p) + '</button>'; })
        .join('');
      sug.querySelectorAll('.ntf-chip').forEach(function (c) {
        c.onclick = function () { input.value = c.dataset.p; input.focus(); };
      });
    });

    function fuera() { cap.remove(); document.removeEventListener('keydown', tecla); }
    function tecla(ev) { if (ev.key === 'Escape') fuera(); }
    document.addEventListener('keydown', tecla);
    cap.addEventListener('click', function (ev) { if (ev.target === cap) fuera(); });
    cap.querySelector('[data-cerrar]').onclick = fuera;

    cap.querySelector('[data-no]').onclick = async function () {
      /* "No es un barrio" es para lo que el cliente escribió donde iba la
         dirección ("me das una personal mixta..."). Se marca descartado y no
         vuelve a proponerse nunca. */
      var s = sb(); if (!s) return;
      await s.from('pos_domi_aprendidos').update({ descartado: true }).eq('id', f.id);
      fuera(); cargar();
    };

    cap.querySelector('[data-ok]').onclick = async function () {
      var p = Number(input.value);
      if (!isFinite(p) || p <= 0) {
        input.classList.add('malo');
        input.focus();
        setTimeout(function () { input.classList.remove('malo'); }, 1200);
        return;
      }
      var btn = this;
      btn.disabled = true; btn.textContent = 'Guardando…';
      var ok = await guardarBarrio(f, p);
      if (!ok) { btn.disabled = false; btn.textContent = 'Guardar'; return; }
      fuera();
      cargar();
    };
  }

  /* Las zonas tal como están hoy. */
  async function zonasDe() {
    var s = sb(); if (!s || !st().branchId) return [];
    try {
      var r = await s.from('ia_config').select('domicilios').eq('branch_id', st().branchId).maybeSingle();
      var d = (r.data && r.data.domicilios) || {};
      return Array.isArray(d.zonas) ? d.zonas : [];
    } catch (e) { return []; }
  }

  /* Mete el barrio en la zona de ese precio (la crea si no existe) y borra el
     pendiente. Se guarda TODO el objeto `domicilios` de vuelta porque es una
     sola columna jsonb: escribir solo las zonas borraría el resto (el tiempo
     estimado, las copias del recibo, si está activo). */
  async function guardarBarrio(f, precio) {
    var s = sb(); if (!s || !st().branchId) return false;
    try {
      var r = await s.from('ia_config').select('domicilios').eq('branch_id', st().branchId).maybeSingle();
      var dom = (r.data && r.data.domicilios) || {};
      var zonas = Array.isArray(dom.zonas) ? dom.zonas.slice() : [];
      var nombre = String(f.barrio || '').trim();
      if (!nombre) return false;

      /* Un conjunto va en su lista, no entre los barrios: el asistente los
         trata distinto (a un conjunto no le pide calle, le pide la casa). */
      var campo = (f.tipo === 'conjunto') ? 'conjuntos' : 'barrios';

      /* Si ya estaba en otra zona con otro precio, se saca: dos precios para el
         mismo barrio es cobrar distinto según quién mire. */
      zonas = zonas.map(function (z) {
        var c = Object.assign({}, z);
        ['barrios', 'conjuntos'].forEach(function (k) {
          if (!Array.isArray(c[k])) return;
          c[k] = c[k].filter(function (b) {
            return String(b).trim().toLowerCase() !== nombre.toLowerCase();
          });
        });
        return c;
      });

      var zona = zonas.filter(function (z) { return Number(z.precio) === precio; })[0];
      if (!zona) { zona = { precio: precio, barrios: [], conjuntos: [] }; zonas.push(zona); }
      if (!Array.isArray(zona[campo])) zona[campo] = [];
      zona[campo].push(nombre);
      zonas.sort(function (a, b) { return (Number(a.precio) || 0) - (Number(b.precio) || 0); });

      dom.zonas = zonas;
      var up = await s.from('ia_config').update({ domicilios: dom }).eq('branch_id', st().branchId).select('id');
      if (up.error || !up.data || !up.data.length) {
        alert('No se pudo guardar: ' + ((up.error && up.error.message) || 'sin permisos'));
        return false;
      }
      /* Ya tiene precio: sale de la lista de pendientes. */
      await s.from('pos_domi_aprendidos').delete().eq('id', f.id);
      return true;
    } catch (e) {
      console.error('[notifs] guardar barrio:', e);
      alert('No se pudo guardar: ' + (e.message || e));
      return false;
    }
  }

  /* Cerrar el buzon sin duplicar la logica del interruptor: al abrir el modal
     del barrio, dejar el panel abierto detras es ruido encima de ruido. */
  function cerrarPanel() {
    if (abierta) alternar();
  }

  function badge(n) {
    var el = document.getElementById('notif-badge');
    if (!el) return;
    el.textContent = n > 9 ? '9+' : String(n);
    el.style.display = n > 0 ? '' : 'none';
  }

  var _items = [];
  async function cargar() {
    /* LAS RECARGAS SALIERON DE LA CAMPANA (19-ago, Sergio). Cada recarga y cada
       solicitud por confirmar generaba su aviso, y entre eso y lo que aprendia
       Paco el buzon dejaba de leerse. Las recargas por confirmar siguen —y son
       lo unico que de verdad hay que atender— en su propia pantalla, Clientes,
       que es donde se aprueban. `fuenteRecargas` se deja escrita por si algun
       dia se quiere volver a colgar. */
    var listas = await Promise.allSettled([fuenteSistema(), fuenteBarrios(), fuentePrimerosPasos()]);
    _items = [];
    listas.forEach(function (r) { if (r.status === 'fulfilled') _items = _items.concat(r.value); });
    /* Lo urgente arriba; lo demás por fecha; los pasos van en su propio grupo. */
    _items.sort(function (a, b) {
      if (!!b.urgente - !!a.urgente) return (!!b.urgente) - (!!a.urgente);
      return new Date(b.cuando || 0) - new Date(a.cuando || 0);
    });
    var vist = vistos();
    badge(_items.filter(function (i) { return vist.indexOf(i.id) < 0; }).length);
    if (abierta) pintar(_items);
  }

  function alternar() {
    var panel = document.getElementById('notif-panel');
    if (!panel) return;
    abierta = !abierta;
    panel.classList.toggle('on', abierta);
    if (abierta) {
      pintar(_items);
      /* Abrirlo es leerlo: el punto rojo se apaga, pero el punto de cada
         notificación nueva se queda hasta que se cierre el panel. */
      marcarVistos(_items.map(function (i) { return i.id; }));
      badge(0);
    }
  }

  function init() {
    var t = st().tenantId || 'sin';
    K_VISTOS = 'pos.notifs.vistos.' + t;
    var wrap = document.querySelector('.notif-wrap');
    var btn = document.getElementById('btn-notif');
    if (!wrap || !btn) return;
    if (!document.getElementById('notif-panel')) {
      var p = document.createElement('div');
      p.id = 'notif-panel';
      p.className = 'ntf-panel';
      wrap.appendChild(p);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); alternar(); });
    document.addEventListener('click', function (e) {
      if (abierta && !wrap.contains(e.target)) alternar();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && abierta) alternar(); });
    cargar();
    /* Cada 3 minutos se mira si llegó algo. Es un buzón, no un chat: no
       necesita tiempo real, necesita no mentir. */
    setInterval(cargar, 180000);
  }

  if (w._pos) w._pos.on('core:ready', init);
  w.posNotifs = { recargar: cargar };
})(window);
