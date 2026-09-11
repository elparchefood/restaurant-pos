/* pos-timbre.js — EL TIMBRE DE "LISTO", EN TODAS LAS PANTALLAS (10-sep-2026)

   Sergio, en pleno turno: *"que el timbre de listo suene en todas las
   pantallas, no importa donde yo este en el programa... que a quien
   corresponda le suene repetidamente sin parar hasta que se toque un boton
   discreto... y un poco mas fuerte"*.

   · A QUIEN: lo que diga Configuracion → Operacion → a quien le avisa la
     cocina (`operacion_config.cocinaAvisa`): un rol por tipo de pedido
     (mesa / para llevar / domicilio). Sin configurar, el mismo valor por
     defecto que muestra esa pantalla. Lo del cajero tambien le suena a
     gerente / admin / dueño: son los que cubren la caja (esa noche era
     Sergio, como gerente, el que estaba en el computador de la caja).
   · DONDE: en cualquier pantalla del programa (va en el nucleo). No en la
     cocina, que es la que marca; ni al entrar, registrarse o en la carta.
   · COMO: suena, mas fuerte que el 100% normal, y se repite cada pocos
     segundos hasta que la persona toque "Ya lo escuché". Si cambia de
     pantalla sin tocarlo, el aviso y el sonido siguen en la nueva (queda
     guardado en el equipo). Tocarlo en una ventana lo apaga en todas, y con
     dos ventanas abiertas suena una sola a la vez.
   · CUANDO: el salto a `estado = 'listo'`. La base NO manda el estado
     anterior en el aviso en vivo (replica identity por defecto), asi que
     aqui se recuerda cada pedido ya avisado: un pago o una nota sobre un
     pedido que ya estaba listo no vuelve a sonar. Y al abrir cada pantalla
     se revisa lo que se puso listo en los ultimos 3 minutos, por si paso
     justo mientras se cambiaba de pantalla.

   El timbre de modules/ventas-salon.js queda apagado: era este mismo, pero
   solo en Ventas y sin repetirse. */
(function () {
  if (window.posTimbre) return;
  window.posTimbre = true;

  var AQUI = (location.pathname.split('/').pop() || '').toLowerCase();
  var FUERA = ['login.html', 'mesero-login.html', 'onboarding.html', 'admin-reg.html',
               'registro.html', 'carta.html', 'cocina.html', 'app-cliente.html'];
  if (FUERA.indexOf(AQUI) >= 0) return;

  var POR_DEFECTO = { salon: 'mesero', llevar: 'cajero', domicilio: 'cajero', tono: 'campana', vol: 80 };
  var JEFES = ['gerente', 'admin', 'administrador', 'owner', 'dueno', 'dueño'];
  var LLAVE = 'pos.timbre.v1';           // { pend: {id: {txt, at}}, visto: {id: ts} }
  var ULTIMO = 'pos.timbre.ultimo';      // cuando sono por ultima vez (entre ventanas)
  var CADA_MS = 3500;                    // entre repeticion y repeticion
  var FUERZA = 1.35;                     // "un poco mas fuerte"
  var RECIENTE_MS = 3 * 60000;

  var avisa = null, miRol = '', sbC = null, sonando = null;

  function leer() {
    try {
      var d = JSON.parse(localStorage.getItem(LLAVE) || '{}');
      return { pend: d.pend || {}, visto: d.visto || {} };
    } catch (e) { return { pend: {}, visto: {} }; }
  }
  function guardar(d) {
    //  Lo avisado se olvida a las 12 h: ya no va a volver a ponerse listo.
    var lim = Date.now() - 12 * 3600000;
    Object.keys(d.visto).forEach(function (k) { if (d.visto[k] < lim) delete d.visto[k]; });
    Object.keys(d.pend).forEach(function (k) { if ((d.pend[k].at || 0) < lim) delete d.pend[k]; });
    try { localStorage.setItem(LLAVE, JSON.stringify(d)); } catch (e) {}
  }
  function hayPendientes() { return Object.keys(leer().pend).length > 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function zonaDe(o) {
    var c = String(o.channel || '').toLowerCase();
    return c === 'salon' ? 'salon' : (c === 'domicilio' || c === 'whatsapp') ? 'domicilio' : 'llevar';
  }
  function meToca(zona) {
    var rol = String((avisa || POR_DEFECTO)[zona] || '').trim().toLowerCase();
    if (!rol || !miRol) return false;
    return miRol === rol || (rol === 'cajero' && JEFES.indexOf(miRol) >= 0);
  }

  //  Lo que dice el aviso: el mismo nombre que ve la cocina en la comanda.
  async function textoDe(o) {
    var z = zonaDe(o), n = String(o.notes || '');
    if (z === 'domicilio') {
      var m = /\[conjunto:([^\]]+)\]/i.exec(n) || /\[barrio:([^\]]+)\]/i.exec(n);
      return 'Domicilio' + (m && m[1].trim() ? ' · ' + m[1].trim() : '');
    }
    if (z === 'llevar') {
      var nom = String(o.customer_name || '').trim();
      return 'Para llevar · ' + (nom || ('Turno #' + String(o.turno || '').padStart(3, '0')));
    }
    try {
      if (o.table_id) {
        var r = await sbC.from('pos_tables').select('name').eq('id', o.table_id).maybeSingle();
        var nm = r && r.data && String(r.data.name || '').trim();
        if (nm) return 'Mesa ' + nm.replace(/^mesa\s+/i, '');
      }
    } catch (e) {}
    return 'Pedido de mesa';
  }

  async function llegoListo(o) {
    if (!o || !o.id || o.estado !== 'listo') return;
    var d = leer();
    if (d.visto[o.id] || d.pend[o.id]) return;        // este pedido ya se aviso
    d.visto[o.id] = Date.now();
    guardar(d);
    if (!meToca(zonaDe(o))) return;
    var txt = await textoDe(o);
    d = leer();                                        // pudo cambiar mientras se buscaba la mesa
    d.pend[o.id] = { txt: txt, at: Date.now() };
    guardar(d);
    pintar();
    arrancarSonido();
  }

  //  La cocina lo deshizo: si se vuelve a poner listo, que avise otra vez.
  function volvioAtras(o) {
    if (!o || !o.id || o.estado === 'listo') return;
    var d = leer();
    if (!d.visto[o.id] && !d.pend[o.id]) return;
    delete d.visto[o.id]; delete d.pend[o.id];
    guardar(d);
    pintar();
    if (!hayPendientes()) pararSonido();
  }

  function sonar() {
    //  Con dos ventanas abiertas suena UNA: la primera que llegue se anota.
    try {
      var u = Number(localStorage.getItem(ULTIMO) || 0);
      if (Date.now() - u < CADA_MS * 0.7) return;
      localStorage.setItem(ULTIMO, String(Date.now()));
    } catch (e) {}
    var cfg = avisa || POR_DEFECTO;
    try { if (window.posTocarTono) window.posTocarTono(cfg.tono || 'campana', 100, FUERZA); } catch (e) {}
  }
  function arrancarSonido() {
    if (sonando) return;
    sonar();
    sonando = setInterval(function () {
      if (!hayPendientes()) { pararSonido(); return; }
      sonar();
    }, CADA_MS);
  }
  function pararSonido() { if (sonando) { clearInterval(sonando); sonando = null; } }

  function yaLoEscuche() {
    var d = leer(); d.pend = {}; guardar(d);
    pararSonido();
    pintar();
  }

  var CAMPANA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

  function pintar() {
    if (!document.body) return;
    var d = leer(), ids = Object.keys(d.pend);
    var el = document.getElementById('pos-timbre');
    if (!ids.length) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'pos-timbre';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100001;'
        + 'display:flex;align-items:center;gap:12px;background:#111827;color:#fff;'
        + 'border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 10px 10px 14px;'
        + 'box-shadow:0 14px 36px rgba(0,0,0,.35);font-family:\'DM Sans\',system-ui,sans-serif;max-width:min(560px,92vw)';
      document.body.appendChild(el);
    }
    ids.sort(function (a, b) { return (d.pend[a].at || 0) - (d.pend[b].at || 0); });
    var titulo = ids.length === 1 ? 'Listo en cocina' : ids.length + ' pedidos listos en cocina';
    el.innerHTML = '<span style="display:flex;color:#FBBF24;flex:none">' + CAMPANA + '</span>'
      + '<div style="min-width:0"><div style="font-weight:800;font-size:13.5px">' + titulo + '</div>'
      + '<div style="font-size:12.5px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + esc(ids.map(function (k) { return d.pend[k].txt; }).join('  /  ')) + '</div></div>'
      + '<button type="button" id="pos-timbre-ok" style="margin-left:6px;flex:none;border:none;border-radius:10px;'
      + 'padding:9px 14px;background:#fff;color:#111827;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer">'
      + 'Ya lo escuché</button>';
    el.querySelector('#pos-timbre-ok').onclick = yaLoEscuche;
  }

  //  Otra ventana toco "Ya lo escuché", o le llego un aviso: se ponen de acuerdo.
  window.addEventListener('storage', function (e) {
    if (e.key !== LLAVE) return;
    pintar();
    if (hayPendientes()) arrancarSonido(); else pararSonido();
  });

  var intentos = 0;
  async function arrancar() {
    var st = window._pos && window._pos.state;
    if (!window._pos || !window._pos.sb || !st || !st.branchId || !st.user) {
      if (intentos++ < 40) setTimeout(arrancar, 700);
      return;
    }
    sbC = window._pos.sb;
    var branchId = st.branchId;
    var md = st.user.user_metadata || {}, am = st.user.app_metadata || {};
    miRol = String(md.role || am.role || '').trim().toLowerCase();
    try {
      var suc = window.posSucursal ? await window.posSucursal(branchId)
              : (await sbC.from('branches').select('operacion_config').eq('id', branchId).maybeSingle()).data;
      avisa = (suc && suc.operacion_config && suc.operacion_config.cocinaAvisa) || POR_DEFECTO;
    } catch (e) { avisa = POR_DEFECTO; }

    //  Si en la pantalla anterior quedo sonando, sigue aqui.
    pintar();
    if (hayPendientes()) arrancarSonido();

    //  Lo que se puso listo mientras se cambiaba de pantalla.
    try {
      var r = await sbC.from('pos_orders')
        .select('id,estado,channel,notes,customer_name,turno,table_id')
        .eq('branch_id', branchId).eq('estado', 'listo')
        .gte('estado_at', new Date(Date.now() - RECIENTE_MS).toISOString());
      (r.data || []).forEach(function (o) { llegoListo(o); });
    } catch (e) {}

    sbC.channel('pos-timbre-' + branchId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_orders', filter: 'branch_id=eq.' + branchId },
        function (p) {
          var n = p && p.new; if (!n) return;
          if (n.estado === 'listo') llegoListo(n); else volvioAtras(n);
        })
      .subscribe();
  }

  if (document.readyState !== 'loading') arrancar();
  else document.addEventListener('DOMContentLoaded', arrancar);

  //  Solo para el banco de pruebas.
  window.__timbrePrueba = { llegoListo: llegoListo, volvioAtras: volvioAtras, yaLoEscuche: yaLoEscuche,
                            fijar: function (rol, cfg, sb) { miRol = rol; avisa = cfg; sbC = sb; } };
})();
