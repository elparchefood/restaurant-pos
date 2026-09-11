/* ═══════════════════════════════════════════════════════════════════════════
   LA PANTALLA DE CUENTA SUSPENDIDA (y el aviso de pago por transferencia)
   ---------------------------------------------------------------------------
   Sergio, 28-ago-2026:
     "la cuenta sigue existiendo y todos sus datos siguen existiendo. Lo único
      es que cuando inicia sesión le aparece un modal que no lo deja hacer
      absolutamente nada hasta que no pague. El modal lo lleva al pago, y el
      pagar ya vuelve a recuperar todo su acceso. La cuenta no puede dejar de
      existir ni desaparecer."

   TRES COSAS QUE ESTA PANTALLA HACE A PROPÓSITO
   ---------------------------------------------------------------------------
   1. NO CIERRA LA SESIÓN. Quien no ha pagado tiene que poder entrar, ver su
      negocio detrás del vidrio y pagar ahí mismo.
   2. NO SE PUEDE CERRAR. Ni con Escape, ni tocando por fuera, ni saltando con
      el tabulador. (La ventana de Wompi sí puede recibir el teclado: va por
      encima y es parte del pago.)
   3. SE REACTIVA SOLA. Cada minuto vuelve a preguntar cómo está la cuenta; en
      cuanto se aprueba el pago, la pantalla se recarga.

   CÓMO SE PAGA (11-sep-2026)
   ---------------------------------------------------------------------------
   POR WOMPI, siempre: Nequi, tarjeta o cuenta Bancolombia, y queda el cobro
   automático. Esta pantalla se escribió el 28-ago, ANTES de Wompi, y le
   ofrecía transferencia a todo el mundo — justo lo que Sergio decidió no
   ofrecer ("se olvidan y se salen").

   LA TRANSFERENCIA es el extintor: solo aparece si Sergio la encendió para
   este cliente desde su panel (`tenants.transferencia_ok_at`). Se transfiere,
   se sube el comprobante y el lector de siempre lo verifica solo contra el
   correo del banco. Si no puede, queda en revisión para Sergio.

   `posAvisoTransferencia()` es la otra cara: el cliente AL DÍA al que Sergio
   le encendió la transferencia ve una tarjetica en el Escritorio que abre
   esta misma ventana — pero esa sí se puede cerrar.

   ⚠️ Las clases van con `sp-` y no con `sus-`: `pos-suscripcion.js` (la
   ventana de Wompi) usa `sus-` y las dos conviven en la misma página. Con el
   mismo prefijo, la que cargara primero se quedaba con los estilos de las dos.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  var YA = false, AVISO = false;

  function cop(n) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString('es-CO');
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var PERIODOS = [
    { id: 'mensual',    tit: 'Mensual',    pie: '1 mes',    nota: '' },
    { id: 'trimestral', tit: 'Trimestral', pie: '3 meses',  nota: 'Ahorras 10%' },
    { id: 'anual',      tit: 'Anual',      pie: '12 meses', nota: 'Ahorras 20% + mapas' }
  ];

  var RELOJ = '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  var CHULO = '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>';

  function estilos() {
    if (document.getElementById('sp-css')) return;
    var st = document.createElement('style');
    st.id = 'sp-css';
    st.textContent = [
      '#sp-cap{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.62);backdrop-filter:blur(3px);',
        'display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;',
        "font-family:'DM Sans',system-ui,sans-serif;color:#0F172A}",
      '#sp-cap.suave{background:rgba(15,23,42,.32);backdrop-filter:blur(2px)}',
      '#sp-box{width:520px;max-width:100%;background:#fff;border-radius:18px;overflow:hidden;',
        'box-shadow:0 30px 70px -20px rgba(15,23,42,.45);animation:spPop .22s cubic-bezier(.2,.8,.2,1)}',
      '@keyframes spPop{from{transform:scale(.96) translateY(8px);opacity:0}to{transform:none;opacity:1}}',
      '@media (prefers-reduced-motion:reduce){#sp-box,#sp-aviso{animation:none}}',
      '.sp-head{padding:22px 24px 18px;border-bottom:1px solid #ECEEF2}',
      '.sp-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#DC2626;margin-bottom:6px}',
      '.sp-eyebrow.azul{color:#5B6BFF}',
      '.sp-tit{font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}',
      '.sp-sub{font-size:13px;color:#475569;line-height:1.6;margin:0}',
      '.sp-body{padding:20px 24px;display:flex;flex-direction:column;gap:16px}',
      '.sp-lbl{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#94A3B8;margin-bottom:8px}',
      '.sp-per{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
      '.sp-p{border:1px solid #ECEEF2;border-radius:11px;background:#fff;padding:11px 10px;text-align:left;cursor:pointer;transition:all .13s;font-family:inherit;color:inherit}',
      '.sp-p:hover{background:#F8FAFC}',
      '.sp-p.on{border-color:#5B6BFF;background:#EEF2FF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}',
      '.sp-p b{display:block;font-size:12.5px;font-weight:700;margin-bottom:3px}',
      '.sp-p i{display:block;font-style:normal;font-size:15px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
      '.sp-p s{display:block;text-decoration:none;font-size:10.5px;color:#64748B;margin-top:3px;line-height:1.35}',
      '.sp-p.on s{color:#5B6BFF;font-weight:700}',
      '.sp-cta{background:#F8FAFC;border:1px solid #ECEEF2;border-radius:12px;padding:14px 16px}',
      '.sp-medios{font-size:12.5px;color:#475569;line-height:1.6}',
      '.sp-medios b{color:#0F172A}',
      '.sp-row{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:4px 0}',
      '.sp-row span{color:#64748B}',
      '.sp-row b{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}',
      '.sp-copy{margin-top:10px;width:100%;padding:9px;border:1px solid #ECEEF2;border-radius:9px;background:#fff;',
        'font-family:inherit;font-size:12px;font-weight:700;color:#5B6BFF;cursor:pointer}',
      '.sp-copy:hover{background:#EEF2FF}',
      '.sp-drop{border:1.5px dashed #DCE0E8;border-radius:12px;background:#FBFBFD;padding:18px;text-align:center;cursor:pointer;transition:all .14s}',
      '.sp-drop:hover{border-color:#5B6BFF;background:#F8FAFF}',
      '.sp-drop.ok{border-style:solid;border-color:#16A34A;background:#F0FDF4}',
      '.sp-drop b{display:block;font-size:13px;font-weight:700;margin-bottom:3px;word-break:break-all}',
      '.sp-drop span{font-size:11.5px;color:#64748B}',
      '.sp-foot{padding:16px 24px 20px;border-top:1px solid #ECEEF2;display:flex;flex-direction:column;gap:12px}',
      '.sp-btn{width:100%;padding:12px;border:none;border-radius:10px;background:#5B6BFF;color:#fff;',
        'font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px -2px rgba(91,107,255,.45)}',
      '.sp-btn:hover:not(:disabled){background:#4F5BE3}',
      '.sp-btn:disabled{opacity:.5;cursor:default;box-shadow:none}',
      '.sp-exit{background:none;border:none;font-family:inherit;font-size:12px;color:#94A3B8;cursor:pointer;text-align:center}',
      '.sp-exit:hover{color:#475569;text-decoration:underline}',
      '.sp-err{font-size:12.5px;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;border-radius:9px;padding:9px 11px;line-height:1.5}',
      '.sp-ok{text-align:center;padding:8px 0 4px}',
      '.sp-ok svg{margin:0 auto 12px;color:#16A34A;display:block}',
      '.sp-ok.espera svg{color:#5B6BFF}',
      '.sp-ok-t{font-size:15px;font-weight:800;margin-bottom:6px}',
      '.sp-ok-s{font-size:13px;color:#475569;line-height:1.6}',
      '.sp-nota{font-size:11.5px;color:#94A3B8;line-height:1.6;text-align:center}',
      '.sp-tag{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#3730A3;background:#EEF2FF;border-radius:10px;padding:9px 11px;line-height:1.5}',
      //  La tarjetica del Escritorio: no tapa nada, se cierra con la X.
      '#sp-aviso{position:fixed;right:20px;bottom:20px;z-index:9000;width:330px;max-width:calc(100vw - 40px);',
        'background:#fff;border:1px solid #ECEEF2;border-radius:14px;padding:14px 16px;',
        'box-shadow:0 14px 30px -14px rgba(15,23,42,.35);animation:spPop .22s cubic-bezier(.2,.8,.2,1);',
        "font-family:'DM Sans',system-ui,sans-serif;color:#0F172A}",
      '.sp-av-t{font-size:13.5px;font-weight:800;margin-bottom:3px;padding-right:22px;letter-spacing:-.01em}',
      '.sp-av-s{font-size:12px;color:#64748B;line-height:1.5}',
      '.sp-av-b{margin-top:11px;width:100%;padding:9px;border:none;border-radius:9px;background:#5B6BFF;color:#fff;',
        'font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer}',
      '.sp-av-b:hover{background:#4F5BE3}',
      '.sp-av-x{position:absolute;top:8px;right:10px;border:none;background:none;font-size:18px;line-height:1;color:#94A3B8;cursor:pointer;padding:4px}',
      '.sp-av-x:hover{color:#0F172A}',
      //  La ventana de Wompi va POR ENCIMA de la cuenta suspendida.
      '.sus-ov{z-index:2147483600 !important}'
    ].join('');
    document.head.appendChild(st);
  }

  function enWompi(el) { return !!(el && el.closest && el.closest('.sus-ov')); }

  /*  Nada de lo que hay debajo puede recibir el teclado ni el ratón. El
      overlay tapa los clics; esto tapa el tabulador, que es por donde se
      escapa cualquier bloqueo hecho sólo con un div encima. La ventana de
      Wompi es la excepción: va encima y es donde se paga. */
  function encerrar(caja) {
    document.addEventListener('keydown', function (e) {
      if (document.querySelector('.sus-ov')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'Tab' && !caja.contains(document.activeElement)) {
        e.preventDefault();
        var f = caja.querySelector('button,input,a');
        if (f) f.focus();
      }
    }, true);
    document.addEventListener('focusin', function (e) {
      if (!caja.contains(e.target) && !enWompi(e.target)) {
        var f = caja.querySelector('button,input,a');
        if (f) f.focus();
      }
    }, true);
  }

  async function sesion() {
    var s = await sb.auth.getSession();
    return s && s.data && s.data.session ? s.data.session.access_token : '';
  }

  async function provision(cuerpo) {
    var r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (await sesion()) },
      body: JSON.stringify(cuerpo)
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ('no se pudo (' + r.status + ')'));
    return d;
  }

  async function consultar() {
    try { return await provision({ action: 'cuenta_estado' }); }
    catch (e) { return { error: (e && e.message) || 'sin conexión' }; }
  }

  /*  El lector de comprobantes, con tope: leer la imagen y buscar el aviso del
      banco puede tardar, pero nadie se queda mirando una rueda sin final. Si
      tarda, sigue de su lado (lo repasa una tarea cada 5 minutos). */
  function verificar(pagoId) {
    return Promise.race([
      fetch(SUPABASE_URL + '/functions/v1/verificar-pago-plataforma', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ pago_id: pagoId })
      }).then(function (x) { return x.json(); }).catch(function () { return {}; }),
      new Promise(function (res) { setTimeout(function () { res({ lento: true }); }, 45000); })
    ]);
  }

  function cargarWompi(listo) {
    if (window.posSuscripcion) return listo();
    var sc = document.createElement('script');
    sc.src = 'pos-suscripcion.js?v=1800130000';
    sc.onload = function () { listo(); };
    sc.onerror = function () { listo(new Error('no cargó')); };
    document.head.appendChild(sc);
  }

  function aLaCuentaNueva() {
    try { localStorage.removeItem('pos.cuenta.estado'); } catch (e) {}
    location.reload();
  }

  /*  Despues de pagar con Wompi el aviso firmado llega en segundos: se mira
      seguido un rato, en vez de esperar al minuto. */
  function vigilarRapido() {
    var n = 0;
    var t = setInterval(async function () {
      if (++n > 45) { clearInterval(t); return; }
      try {
        var r = await sb.from('tenants').select('status').eq('id', window._pos.state.tenantId).maybeSingle();
        if (r && r.data && r.data.status === 'active') { clearInterval(t); aLaCuentaNueva(); }
      } catch (e) {}
    }, 4000);
  }

  /* ── LA CUENTA SUSPENDIDA ──────────────────────────────────────────────── */
  window.posPantallaSuspendida = async function abrir(estado) {
    if (YA) return;
    YA = true;
    estilos();
    var av = document.getElementById('sp-aviso'); if (av) av.remove();
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}

    var cap = document.createElement('div');
    cap.id = 'sp-cap';
    cap.innerHTML = '<div id="sp-box"><div class="sp-body"><div class="sp-nota">Un momento…</div></div></div>';
    document.body.appendChild(cap);
    var box = cap.querySelector('#sp-box');
    encerrar(box);

    /*  Vigila la cuenta hasta que vuelva a estar al día. Quien acaba de pagar
        no tiene por qué saber que hay que refrescar. */
    setInterval(async function () {
      try {
        var r = await sb.from('tenants').select('status').eq('id', window._pos.state.tenantId).maybeSingle();
        if (r && r.data && r.data.status === 'active') aLaCuentaNueva();
      } catch (e) {}
    }, 60000);

    pintar(box, estado, await consultar(), 'bloqueo');
  };

  /* ── EL AVISO DEL ESCRITORIO (cliente al día con transferencia) ───────── */
  window.posAvisoTransferencia = async function () {
    if (AVISO || YA) return;
    AVISO = true;
    estilos();
    var info = await consultar();
    if (!info || info.error || !info.transferencia || YA) return;
    var pend = !!info.pendiente;
    var t = document.createElement('div');
    t.id = 'sp-aviso';
    t.setAttribute('role', 'status');
    t.innerHTML = '<button class="sp-av-x" aria-label="Cerrar">×</button>' +
      '<div class="sp-av-t">' + (pend ? 'Estamos revisando tu comprobante' : 'Puedes pagar tu plan por transferencia') + '</div>' +
      '<div class="sp-av-s">' + (pend
        ? 'Te avisamos por correo en cuanto se confirme. No tienes que hacer nada más.'
        : 'Cobra lo habilitó para este pago. Transfiere y sube el comprobante: lo verificamos solos.') + '</div>' +
      (pend ? '' : '<button class="sp-av-b">Pagar y subir el comprobante</button>');
    document.body.appendChild(t);
    t.querySelector('.sp-av-x').onclick = function () { t.remove(); };
    var b = t.querySelector('.sp-av-b');
    if (b) b.onclick = function () { abrirVentana(info); };
  };

  function abrirVentana(info) {
    if (document.getElementById('sp-cap')) return;
    var cap = document.createElement('div');
    cap.id = 'sp-cap';
    cap.className = 'suave';
    cap.innerHTML = '<div id="sp-box"></div>';
    document.body.appendChild(cap);
    cap.addEventListener('click', function (e) { if (e.target === cap) cerrarVentana(); });
    document.addEventListener('keydown', function tecla(e) {
      if (e.key !== 'Escape') return;
      cerrarVentana();
      document.removeEventListener('keydown', tecla);
    });
    pintar(cap.querySelector('#sp-box'), 'active', info, 'aviso');
  }
  function cerrarVentana() {
    var c = document.getElementById('sp-cap');
    if (c) c.remove();
  }

  /* ── LO QUE SE VE ────────────────────────────────────────────────────── */
  function pintar(box, estado, info, modo) {
    var aviso = modo === 'aviso';
    var cancelada = estado === 'cancelled';
    var negocio = (info && info.negocio) || '';
    var sel = 'mensual';
    var archivo = null;

    function cabeza() {
      if (aviso) {
        return '<div class="sp-head">' +
          '<div class="sp-eyebrow azul">Pago por transferencia</div>' +
          '<h2 class="sp-tit">Paga tu plan por transferencia</h2>' +
          '<p class="sp-sub">Cobra habilitó el pago por transferencia' +
            (negocio ? ' para <b>' + esc(negocio) + '</b>' : '') +
            ', solo para este pago. Transfiere, sube el comprobante y lo verificamos solos.</p></div>';
      }
      return '<div class="sp-head">' +
        '<div class="sp-eyebrow">' + (cancelada ? 'Servicio terminado' : 'Cuenta suspendida') + '</div>' +
        '<h2 class="sp-tit">' + (cancelada ? 'Reactiva tu servicio' : 'Falta ponerte al día') + '</h2>' +
        '<p class="sp-sub">' +
          (negocio
            ? '<b>' + esc(negocio) + '</b> sigue completo: tus productos, tus ventas, tus clientes y sus puntos están guardados. '
            : 'Tu información sigue completa y guardada. ') +
          'Para volver a usar Cobra sólo falta el pago.' +
        '</p></div>';
    }

    function pie(botonHtml) {
      return '<div class="sp-foot">' + botonHtml +
        '<button class="sp-exit" id="sp-salir">' + (aviso ? 'Ahora no' : 'Cerrar sesión') + '</button></div>';
    }

    function salir() {
      var b = document.getElementById('sp-salir');
      if (!b) return;
      b.onclick = aviso ? cerrarVentana : async function () {
        try { localStorage.removeItem('pos.cuenta.estado'); } catch (e) {}
        try { await sb.auth.signOut(); } catch (e) {}
        location.href = 'login.html';
      };
    }

    function precios() {
      return PERIODOS.map(function (p) {
        var v = info.precios ? info.precios[p.id] : null;
        return '<button class="sp-p' + (p.id === sel ? ' on' : '') + '" data-per="' + p.id + '">' +
          '<b>' + p.tit + '</b><i>' + cop(v) + '</i>' +
          '<s>' + (p.nota || p.pie) + '</s></button>';
      }).join('');
    }
    function nota() {
      return '<div class="sp-nota">Tu plan: <b>' + esc(info.plan_nombre || info.plan) + '</b> · ' +
        info.sucursales + (info.sucursales === 1 ? ' sucursal' : ' sucursales') + '</div>';
    }
    function engancharPeriodos(repintar) {
      box.querySelectorAll('[data-per]').forEach(function (b) {
        b.onclick = function () { sel = b.dataset.per; repintar(); };
      });
    }

    // ── Si no se pudo consultar, no se inventa un precio ──────────────────
    if (!info || info.error) {
      box.innerHTML = cabeza() +
        '<div class="sp-body"><div class="sp-err">No pudimos cargar los datos del pago (' +
        esc((info && info.error) || 'sin conexión') + '). Escríbenos a <b>sergio@cobrapos.app</b> y lo resolvemos.</div></div>' +
        pie('<button class="sp-btn" id="sp-retry">Reintentar</button>');
      salir();
      var rt = document.getElementById('sp-retry');
      if (rt) rt.onclick = function () { location.reload(); };
      return;
    }

    // ── Ya mandó el comprobante: sólo falta que lo confirmen ──────────────
    if (info.pendiente) {
      box.innerHTML = cabeza() +
        '<div class="sp-body"><div class="sp-ok espera">' + RELOJ +
          '<div class="sp-ok-t">Recibimos tu comprobante</div>' +
          '<div class="sp-ok-s">Lo estamos verificando con el aviso del banco. Normalmente queda listo en minutos, y ' +
          (aviso ? 'tu plan queda al día solo' : 'tu cuenta se reactiva sola') +
          ': no tienes que hacer nada más ni volver a entrar.</div>' +
        '</div>' +
        '<div class="sp-cta"><div class="sp-row"><span>Pago enviado</span><b>' + cop(info.pendiente.monto) + '</b></div>' +
        '<div class="sp-row"><span>Período</span><b>' + esc(info.pendiente.periodo || '—') + '</b></div></div></div>' +
        pie('');
      salir();
      return;
    }

    // ── POR WOMPI: el camino de siempre para la cuenta suspendida ─────────
    if (!aviso && !info.transferencia) {
      var precio = function () { return info.precios ? info.precios[sel] : null; };
      var pintarWompi = function (msgHtml) {
        box.innerHTML = cabeza() +
          '<div class="sp-body">' +
            '<div><div class="sp-lbl">Cómo quieres pagar</div><div class="sp-per">' + precios() + '</div></div>' +
            '<div class="sp-cta sp-medios"><b>Pagas con Nequi, tarjeta o tu cuenta Bancolombia.</b> ' +
              'Queda activo el cobro automático, para que no se te vuelva a pasar la fecha. ' +
              'Puedes cancelarlo cuando quieras.</div>' +
            '<div id="sp-msg">' + (msgHtml || '') + '</div>' +
            nota() +
          '</div>' +
          pie('<button class="sp-btn" id="sp-pagar"' + (precio() == null ? ' disabled' : '') + '>Pagar ' + cop(precio()) + '</button>');
        salir();
        engancharPeriodos(function () { pintarWompi(); });
        var pb = document.getElementById('sp-pagar');
        if (pb) pb.onclick = pagarWompi;
      };
      var pagarWompi = function () {
        var pb = document.getElementById('sp-pagar');
        pb.disabled = true; pb.textContent = 'Abriendo…';
        cargarWompi(function (err) {
          if (err || !window.posSuscripcion) {
            pintarWompi('<div class="sp-err">No se pudo abrir el pago. Revisa tu conexión e inténtalo otra vez.</div>');
            return;
          }
          pintarWompi();
          window.posSuscripcion.abrir({
            monto: precio(), cobrarYa: true, periodo: sel,
            alTerminar: function (r) {
              var c = (r && r.cobro) || {};
              if (c.error) {
                pintarWompi('<div class="sp-err">Tu medio de pago quedó guardado, pero el cobro no pasó: ' +
                  esc(c.error) + ' Puedes intentarlo otra vez.</div>');
                return;
              }
              box.innerHTML = cabeza() +
                '<div class="sp-body"><div class="sp-ok espera">' + RELOJ +
                  '<div class="sp-ok-t">Estamos confirmando tu pago</div>' +
                  '<div class="sp-ok-s">Tu cuenta se reactiva sola en unos segundos. No cierres esta ventana.</div>' +
                '</div></div>' + pie('');
              salir();
              vigilarRapido();
            }
          });
        });
      };
      pintarWompi();
      return;
    }

    // ── POR TRANSFERENCIA: solo con el permiso de Cobra ───────────────────
    var cta = info.cuenta || {};
    var numero = String(cta.numero || '').replace(/\D/g, '');

    function cuerpo() {
      return '<div class="sp-body">' +
        (aviso ? '' : '<div class="sp-tag"><span>✓</span><span>Cobra habilitó el pago por transferencia para ponerte al día esta vez.</span></div>') +
        '<div><div class="sp-lbl">Cómo quieres pagar</div><div class="sp-per">' + precios() + '</div></div>' +
        '<div class="sp-cta">' +
          '<div class="sp-lbl" style="margin-bottom:6px">Transfiere a</div>' +
          (numero
            ? '<div class="sp-row"><span>' + esc(cta.banco || 'Transferencia') + '</span><b>' + esc(cta.tipo || '') + '</b></div>' +
              '<div class="sp-row"><span>' + esc(cta.titular || '') + '</span><b>' + (function (s) {
                //  De a tres, pero sin dejar un digito solo al final: "009 272
                //  6260", no "009 272 626 0" (misma regla que el registro).
                var g = s.replace(/(\d{3})(?=\d)/g, '$1 ').split(' ');
                if (g.length > 1 && g[g.length - 1].length === 1) g[g.length - 2] += g.pop();
                return g.join(' ');
              })(numero) + '</b></div>' +
              (cta.nota ? '<div class="sp-row"><span>' + esc(cta.nota) + '</span><b></b></div>' : '') +
              '<button class="sp-copy" id="sp-cp">Copiar el número</button>'
            : '<div style="font-size:12.5px;color:#DC2626">No pudimos cargar la cuenta de cobro. Escríbenos a sergio@cobrapos.app.</div>') +
        '</div>' +
        '<div><div class="sp-lbl">Y sube el comprobante</div>' +
          '<div class="sp-drop" id="sp-drop"><b id="sp-drop-t">Toca para elegir el archivo</b>' +
          '<span>Foto o PDF del pago</span></div>' +
          '<input type="file" id="sp-file" accept="image/*,application/pdf" hidden></div>' +
        '<div id="sp-msg"></div>' +
        nota() +
      '</div>';
    }

    function render() {
      box.innerHTML = cabeza() + cuerpo() +
        pie('<button class="sp-btn" id="sp-enviar"' + (archivo ? '' : ' disabled') + '>Ya pagué, enviar comprobante</button>');
      salir();
      engancharPeriodos(render);

      var cp = document.getElementById('sp-cp');
      if (cp) cp.onclick = function () {
        try { navigator.clipboard.writeText(numero); cp.textContent = 'Copiado'; } catch (e) {}
        setTimeout(function () { cp.textContent = 'Copiar el número'; }, 1800);
      };

      var drop = document.getElementById('sp-drop');
      var file = document.getElementById('sp-file');
      if (drop && file) {
        drop.onclick = function () { file.click(); };
        file.onchange = function () {
          archivo = file.files && file.files[0] ? file.files[0] : null;
          render();
        };
        if (archivo) {
          drop.classList.add('ok');
          document.getElementById('sp-drop-t').textContent = archivo.name;
        }
      }

      var env = document.getElementById('sp-enviar');
      if (env) env.onclick = enviar;
    }

    async function enviar() {
      var env = document.getElementById('sp-enviar');
      var msg = document.getElementById('sp-msg');
      if (!archivo) return;
      env.disabled = true;
      env.textContent = 'Enviando…';
      msg.innerHTML = '';
      try {
        /*  El nombre del archivo no lleva nada que identifique al restaurante:
            un comprobante tiene datos bancarios y su dirección no puede delatar
            de quién es. Misma regla que en el registro. */
        var ext = String(archivo.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        var nom = ((crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.floor(Math.random() * 1e9)) + '.' + ext;
        var up = await sb.storage.from('comprobantes').upload(nom, archivo, { contentType: archivo.type, upsert: false });
        if (up.error) throw up.error;

        var d = await provision({ action: 'renovar', periodo: sel, comprobante_url: nom });
        if (!d.ok) throw new Error(d.error || 'no se pudo registrar el pago');

        //  El lector de siempre, aquí mismo. Si confirma, se entra de una.
        box.innerHTML = cabeza() +
          '<div class="sp-body"><div class="sp-ok espera">' + RELOJ +
            '<div class="sp-ok-t">Verificando tu pago…</div>' +
            '<div class="sp-ok-s">Leemos tu comprobante y buscamos el aviso del banco. Toma unos segundos.</div>' +
          '</div></div>';
        var v = d.pago_id ? await verificar(d.pago_id) : {};
        if (v && v.verificado && v.creado) {
          box.innerHTML = cabeza() +
            '<div class="sp-body"><div class="sp-ok">' + CHULO +
              '<div class="sp-ok-t">¡Listo! Confirmamos tu pago</div>' +
              '<div class="sp-ok-s">' + (aviso ? 'Tu plan quedó al día.' : 'Tu cuenta quedó activa otra vez.') + '</div>' +
            '</div></div>';
          setTimeout(aLaCuentaNueva, 2500);
          return;
        }
        info.pendiente = { monto: d.monto, periodo: d.periodo };
        pintar(box, estado, info, modo);
      } catch (e) {
        msg.innerHTML = '<div class="sp-err">' + esc((e && e.message) || 'No se pudo enviar.') +
          ' Si vuelve a pasar, escríbenos a <b>sergio@cobrapos.app</b>.</div>';
        env.disabled = false;
        env.textContent = 'Ya pagué, enviar comprobante';
      }
    }

    render();
  }
})();
