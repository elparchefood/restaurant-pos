/* ═══════════════════════════════════════════════════════════════════════════
   LA PANTALLA DE CUENTA SUSPENDIDA
   ---------------------------------------------------------------------------
   Sergio, 28-ago-2026:
     "la cuenta sigue existiendo y todos sus datos siguen existiendo. Lo único
      es que cuando inicia sesión le aparece un modal que no lo deja hacer
      absolutamente nada hasta que no pague. El modal lo lleva al pago, y el
      pagar ya vuelve a recuperar todo su acceso. La cuenta no puede dejar de
      existir ni desaparecer."

   TRES COSAS QUE ESTA PANTALLA HACE A PROPÓSITO
   ---------------------------------------------------------------------------
   1. NO CIERRA LA SESIÓN. La versión anterior sacaba al usuario al login, y
      eso es lo contrario de lo que se quiere: quien no ha pagado tiene que
      poder entrar, ver su negocio detrás del vidrio y pagar ahí mismo.
      Sacarlo lo obliga a llamar a alguien, y quien tiene que llamar muchas
      veces no vuelve.

   2. NO SE PUEDE CERRAR. No hay botón de "entendido", ni se cierra con Escape,
      ni tocando por fuera, ni saltando con el tabulador. Bloquear de verdad no
      le quita trabajo a nadie: debajo no hay un formulario a medio llenar,
      está el negocio entero esperando.

   3. SE REACTIVA SOLA. Cada minuto vuelve a preguntar cómo está la cuenta. En
      cuanto se aprueba el pago, la pantalla se recarga y el restaurante sigue
      vendiendo — sin cerrar sesión, sin llamar a preguntar si ya quedó.

   POR QUÉ EL PAGO NO ES INSTANTÁNEO (todavía)
   ---------------------------------------------------------------------------
   Hoy se paga por transferencia y se sube el comprobante, igual que al
   registrarse. Reactivar apenas se sube la imagen sería regalar el sistema a
   quien suba cualquier foto. Por eso queda "en revisión" y se aprueba desde la
   consola — normalmente el mismo día. El día que haya pasarela (Wompi, Bold),
   la confirmación llega firmada por el banco y la reactivación sí es
   instantánea: cambia de dónde sale el "sí pagó", no esta pantalla.
   ═══════════════════════════════════════════════════════════════════════════ */

window.posPantallaSuspendida = (function () {
  var YA = false;

  function cop(n) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString('es-CO');
  }

  var PERIODOS = [
    { id: 'mensual',    tit: 'Mensual',    pie: '1 mes',    nota: '' },
    { id: 'trimestral', tit: 'Trimestral', pie: '3 meses',  nota: 'Ahorras 10%' },
    { id: 'anual',      tit: 'Anual',      pie: '12 meses', nota: 'Ahorras 20% + mapas' }
  ];

  function estilos() {
    if (document.getElementById('sus-css')) return;
    var st = document.createElement('style');
    st.id = 'sus-css';
    st.textContent = [
      '#sus-cap{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.62);backdrop-filter:blur(3px);',
        'display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;',
        "font-family:'DM Sans',system-ui,sans-serif;color:#0F172A}",
      '#sus-box{width:520px;max-width:100%;background:#fff;border-radius:18px;overflow:hidden;',
        'box-shadow:0 30px 70px -20px rgba(15,23,42,.45);animation:susPop .22s cubic-bezier(.2,.8,.2,1)}',
      '@keyframes susPop{from{transform:scale(.96) translateY(8px);opacity:0}to{transform:none;opacity:1}}',
      '@media (prefers-reduced-motion:reduce){#sus-box{animation:none}}',
      '.sus-head{padding:22px 24px 18px;border-bottom:1px solid #ECEEF2}',
      '.sus-eyebrow{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#DC2626;margin-bottom:6px}',
      '.sus-tit{font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}',
      '.sus-sub{font-size:13px;color:#475569;line-height:1.6;margin:0}',
      '.sus-body{padding:20px 24px;display:flex;flex-direction:column;gap:16px}',
      '.sus-lbl{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#94A3B8;margin-bottom:8px}',
      '.sus-per{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
      '.sus-p{border:1px solid #ECEEF2;border-radius:11px;background:#fff;padding:11px 10px;text-align:left;cursor:pointer;transition:all .13s;font-family:inherit;color:inherit}',
      '.sus-p:hover{background:#F8FAFC}',
      '.sus-p.on{border-color:#5B6BFF;background:#EEF2FF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}',
      '.sus-p b{display:block;font-size:12.5px;font-weight:700;margin-bottom:3px}',
      '.sus-p i{display:block;font-style:normal;font-size:15px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
      '.sus-p s{display:block;text-decoration:none;font-size:10.5px;color:#64748B;margin-top:3px;line-height:1.35}',
      '.sus-p.on s{color:#5B6BFF;font-weight:700}',
      '.sus-cta{background:#F8FAFC;border:1px solid #ECEEF2;border-radius:12px;padding:14px 16px}',
      '.sus-row{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:4px 0}',
      '.sus-row span{color:#64748B}',
      '.sus-row b{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}',
      '.sus-copy{margin-top:10px;width:100%;padding:9px;border:1px solid #ECEEF2;border-radius:9px;background:#fff;',
        'font-family:inherit;font-size:12px;font-weight:700;color:#5B6BFF;cursor:pointer}',
      '.sus-copy:hover{background:#EEF2FF}',
      '.sus-drop{border:1.5px dashed #DCE0E8;border-radius:12px;background:#FBFBFD;padding:18px;text-align:center;cursor:pointer;transition:all .14s}',
      '.sus-drop:hover{border-color:#5B6BFF;background:#F8FAFF}',
      '.sus-drop.ok{border-style:solid;border-color:#16A34A;background:#F0FDF4}',
      '.sus-drop b{display:block;font-size:13px;font-weight:700;margin-bottom:3px;word-break:break-all}',
      '.sus-drop span{font-size:11.5px;color:#64748B}',
      '.sus-foot{padding:16px 24px 20px;border-top:1px solid #ECEEF2;display:flex;flex-direction:column;gap:12px}',
      '.sus-btn{width:100%;padding:12px;border:none;border-radius:10px;background:#5B6BFF;color:#fff;',
        'font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px -2px rgba(91,107,255,.45)}',
      '.sus-btn:hover:not(:disabled){background:#4F5BE3}',
      '.sus-btn:disabled{opacity:.5;cursor:default;box-shadow:none}',
      '.sus-exit{background:none;border:none;font-family:inherit;font-size:12px;color:#94A3B8;cursor:pointer;text-align:center}',
      '.sus-exit:hover{color:#475569;text-decoration:underline}',
      '.sus-err{font-size:12.5px;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;border-radius:9px;padding:9px 11px;line-height:1.5}',
      '.sus-ok{text-align:center;padding:8px 0 4px}',
      '.sus-ok svg{margin:0 auto 12px;color:#16A34A}',
      '.sus-nota{font-size:11.5px;color:#94A3B8;line-height:1.6;text-align:center}'
    ].join('');
    document.head.appendChild(st);
  }

  /*  Nada de lo que hay debajo puede recibir el teclado ni el ratón. El
      overlay tapa los clics; esto tapa el tabulador, que es por donde se
      escapa cualquier bloqueo hecho sólo con un div encima. */
  function encerrar(caja) {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'Tab' && !caja.contains(document.activeElement)) {
        e.preventDefault();
        var f = caja.querySelector('button,input,a');
        if (f) f.focus();
      }
    }, true);
    document.addEventListener('focusin', function (e) {
      if (!caja.contains(e.target)) {
        var f = caja.querySelector('button,input,a');
        if (f) f.focus();
      }
    }, true);
  }

  return async function abrir(estado) {
    if (YA) return;
    YA = true;
    estilos();
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}

    var cap = document.createElement('div');
    cap.id = 'sus-cap';
    cap.innerHTML = '<div id="sus-box"><div class="sus-body"><div class="sus-nota">Un momento…</div></div></div>';
    document.body.appendChild(cap);
    var box = cap.querySelector('#sus-box');
    encerrar(box);

    /*  Vigila la cuenta hasta que vuelva a estar al día. No se le pide al
        usuario que recargue: quien acaba de pagar no tiene por qué saber que
        hay que refrescar, y quedarse mirando una pantalla que no cambia se
        siente como que el pago no llegó. */
    setInterval(async function () {
      try {
        var r = await sb.from('tenants').select('status').eq('id', window._pos.state.tenantId).maybeSingle();
        if (r && r.data && r.data.status === 'active') {
          try { localStorage.removeItem('pos.cuenta.estado'); } catch (e) {}
          location.reload();
        }
      } catch (e) {}
    }, 60000);

    var info = null;
    try {
      var s = await sb.auth.getSession();
      var tok = s && s.data && s.data.session ? s.data.session.access_token : '';
      var res = await fetch(SUPABASE_URL + '/functions/v1/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ action: 'cuenta_estado' })
      });
      info = await res.json();
      if (!res.ok) throw new Error(info.error || 'no se pudo consultar');
    } catch (e) {
      info = { error: (e && e.message) || 'sin conexión' };
    }

    pintar(box, estado, info);
  };

  /* ── LO QUE SE VE ────────────────────────────────────────────────────── */
  function pintar(box, estado, info) {
    var cancelada = estado === 'cancelled';
    var negocio = (info && info.negocio) || '';
    var sel = 'mensual';
    var archivo = null;

    function cabeza() {
      return '<div class="sus-head">' +
        '<div class="sus-eyebrow">' + (cancelada ? 'Servicio terminado' : 'Cuenta suspendida') + '</div>' +
        '<h2 class="sus-tit">' + (cancelada ? 'Reactiva tu servicio' : 'Falta ponerte al día') + '</h2>' +
        '<p class="sus-sub">' +
          (negocio
            ? '<b>' + negocio + '</b> sigue completo: tus productos, tus ventas, tus clientes y sus puntos están guardados. '
            : 'Tu información sigue completa y guardada. ') +
          'Para volver a usar Cobra sólo falta el pago.' +
        '</p></div>';
    }

    function pie(botonHtml) {
      return '<div class="sus-foot">' + botonHtml +
        '<button class="sus-exit" id="sus-salir">Cerrar sesión</button></div>';
    }

    function salir() {
      var b = document.getElementById('sus-salir');
      if (b) b.onclick = async function () {
        try { localStorage.removeItem('pos.cuenta.estado'); } catch (e) {}
        try { await sb.auth.signOut(); } catch (e) {}
        location.href = 'login.html';
      };
    }

    // ── Si no se pudo consultar, no se inventa un precio ──────────────────
    if (!info || info.error) {
      box.innerHTML = cabeza() +
        '<div class="sus-body"><div class="sus-err">No pudimos cargar los datos del pago (' +
        ((info && info.error) || 'sin conexión') + '). Escríbenos a <b>sergio@cobrapos.app</b> y lo resolvemos.</div></div>' +
        pie('<button class="sus-btn" id="sus-retry">Reintentar</button>');
      salir();
      var rt = document.getElementById('sus-retry');
      if (rt) rt.onclick = function () { location.reload(); };
      return;
    }

    // ── Ya mandó el comprobante: sólo falta que lo revisen ────────────────
    if (info.pendiente) {
      box.innerHTML = cabeza() +
        '<div class="sus-body"><div class="sus-ok">' +
          '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
          '<div style="font-size:15px;font-weight:800;margin-bottom:6px">Recibimos tu comprobante</div>' +
          '<div style="font-size:13px;color:#475569;line-height:1.6">Lo estamos revisando. Normalmente queda listo el mismo día, y ' +
          'tu cuenta se reactiva sola: no tienes que hacer nada más ni volver a entrar.</div>' +
        '</div>' +
        '<div class="sus-cta"><div class="sus-row"><span>Pago enviado</span><b>' + cop(info.pendiente.monto) + '</b></div>' +
        '<div class="sus-row"><span>Período</span><b>' + (info.pendiente.periodo || '—') + '</b></div></div></div>' +
        pie('');
      salir();
      return;
    }

    // ── El cobro ─────────────────────────────────────────────────────────
    var cta = info.cuenta || {};
    var numero = String(cta.numero || '').replace(/\D/g, '');

    function precios() {
      return PERIODOS.map(function (p) {
        var v = info.precios ? info.precios[p.id] : null;
        return '<button class="sus-p' + (p.id === sel ? ' on' : '') + '" data-per="' + p.id + '">' +
          '<b>' + p.tit + '</b><i>' + cop(v) + '</i>' +
          '<s>' + (p.nota || p.pie) + '</s></button>';
      }).join('');
    }

    function cuerpo() {
      return '<div class="sus-body">' +
        '<div><div class="sus-lbl">Cómo quieres pagar</div><div class="sus-per">' + precios() + '</div></div>' +
        '<div class="sus-cta">' +
          '<div class="sus-lbl" style="margin-bottom:6px">Transfiere a</div>' +
          (numero
            ? '<div class="sus-row"><span>' + (cta.banco || 'Transferencia') + '</span><b>' + (cta.tipo || '') + '</b></div>' +
              '<div class="sus-row"><span>' + (cta.titular || '') + '</span><b>' + numero.replace(/(\d{3})(?=\d)/g, '$1 ') + '</b></div>' +
              (cta.nota ? '<div class="sus-row"><span>' + cta.nota + '</span><b></b></div>' : '') +
              '<button class="sus-copy" id="sus-cp">Copiar el número</button>'
            : '<div style="font-size:12.5px;color:#DC2626">No pudimos cargar la cuenta de cobro. Escríbenos a sergio@cobrapos.app.</div>') +
        '</div>' +
        '<div><div class="sus-lbl">Y sube el comprobante</div>' +
          '<div class="sus-drop" id="sus-drop"><b id="sus-drop-t">Toca para elegir el archivo</b>' +
          '<span>Foto o PDF del pago</span></div>' +
          '<input type="file" id="sus-file" accept="image/*,application/pdf" hidden></div>' +
        '<div id="sus-msg"></div>' +
        '<div class="sus-nota">Tu plan: <b>' + (info.plan_nombre || info.plan) + '</b> · ' +
          info.sucursales + (info.sucursales === 1 ? ' sucursal' : ' sucursales') + '</div>' +
      '</div>';
    }

    function render() {
      box.innerHTML = cabeza() + cuerpo() +
        pie('<button class="sus-btn" id="sus-enviar"' + (archivo ? '' : ' disabled') + '>Ya pagué, enviar comprobante</button>');
      salir();

      box.querySelectorAll('[data-per]').forEach(function (b) {
        b.onclick = function () { sel = b.dataset.per; render(); };
      });

      var cp = document.getElementById('sus-cp');
      if (cp) cp.onclick = function () {
        try { navigator.clipboard.writeText(numero); cp.textContent = 'Copiado'; } catch (e) {}
        setTimeout(function () { cp.textContent = 'Copiar el número'; }, 1800);
      };

      var drop = document.getElementById('sus-drop');
      var file = document.getElementById('sus-file');
      if (drop && file) {
        drop.onclick = function () { file.click(); };
        file.onchange = function () {
          archivo = file.files && file.files[0] ? file.files[0] : null;
          render();
        };
        if (archivo) {
          drop.classList.add('ok');
          document.getElementById('sus-drop-t').textContent = archivo.name;
        }
      }

      var env = document.getElementById('sus-enviar');
      if (env) env.onclick = enviar;
    }

    async function enviar() {
      var env = document.getElementById('sus-enviar');
      var msg = document.getElementById('sus-msg');
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

        var s = await sb.auth.getSession();
        var tok = s && s.data && s.data.session ? s.data.session.access_token : '';
        var r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify({ action: 'renovar', periodo: sel, comprobante_url: nom })
        });
        var d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'no se pudo registrar el pago');

        info.pendiente = { monto: d.monto, periodo: d.periodo };
        pintar(box, estado, info);
      } catch (e) {
        msg.innerHTML = '<div class="sus-err">' + ((e && e.message) || 'No se pudo enviar.') +
          ' Si vuelve a pasar, escríbenos a <b>sergio@cobrapos.app</b>.</div>';
        env.disabled = false;
        env.textContent = 'Ya pagué, enviar comprobante';
      }
    }

    render();
  }
})();
