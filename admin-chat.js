/* admin-chat.js — EL CHAT DE COBRA, en la consola (11-sep-2026)

   Punto 4 de la lista: Sergio atiende a los interesados que escriben al
   WhatsApp, Instagram y Facebook DE COBRA. Los atiende un asistente que vende
   el sistema (Edge Function `chat-cobra`, no es Paco).

   Dos vistas del menú:
     · «Conversaciones» — la MISMA pantalla de Chat IA de los restaurantes
       (consola-chat.html la trae tal cual), dentro de un iframe. Sergio pidió
       el diseño exacto, y nada de los restaurantes se toca.
     · «Chat de Cobra» — Cuentas (conectar las 3 cuentas de Cobra) y
       Asistente (nombre, encendido y lo que sabe). Esto lo pinta este archivo.

   Todo lo que escribe pasa por `chat-cobra`, que comprueba el rol en el
   servidor. Las llaves de las cuentas nunca bajan a esta pantalla. */
(function () {
  var FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/chat-cobra';
  var OAUTH = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/meta-oauth-callback';
  var META_APP_ID = '1732760657903466';
  var META_CONFIG_ID = '1280428637212702';     // Facebook + Instagram
  var META_WA_CONFIG_ID = '926832250416998';   // WhatsApp
  var CONV_URL = 'consola-chat.html?v=1801140000';
  var CANAL = {
    whatsapp:  { nombre: 'WhatsApp',  color: '#16A34A', tint: '#DCFCE7' },
    instagram: { nombre: 'Instagram', color: '#C026D3', tint: '#FAE8FF' },
    facebook:  { nombre: 'Facebook',  color: '#2563EB', tint: '#DBEAFE' }
  };
  var S = { tab: 'cuentas', estado: null, canal: null };

  if (typeof PAGE_META !== 'undefined') {
    PAGE_META.chatcobra = { kicker: 'Plataforma', crumb: 'Chat de Cobra' };
    PAGE_META.conversaciones = { kicker: 'Plataforma', crumb: 'Conversaciones de Cobra' };
  }
  var _setView = window.setView;
  var ultimaVista = 'resumen';     // a donde vuelve «Regresar» del chat
  window.setView = function (id) {
    if (id !== 'conversaciones') ultimaVista = id;
    _setView(id);
    if (id === 'chatcobra') abrir();
    if (id === 'conversaciones') abrirConversaciones();
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(m, tono) { if (typeof showToast === 'function') showToast(m, tono); }
  async function sesion() { try { return (await sb.auth.getSession()).data.session.access_token; } catch (e) { return ''; } }
  async function llamar(c) {
    try {
      var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await sesion()) }, body: JSON.stringify(c) });
      var d = await r.json().catch(function () { return {}; });
      return (r.ok || d.error) ? d : { ok: false, error: 'Sin conexión con el servidor.' };
    } catch (e) { return { ok: false, error: 'Sin conexión con el servidor.' }; }
  }

  /* ── Conversaciones: la pantalla de Chat IA, en su iframe ─────────────── */
  /*  A PANTALLA COMPLETA, como el Chat IA (Sergio, 11-sep): tapa la consola
      entera. «Regresar», dentro del chat, avisa por mensaje y aqui se destapa
      en la pantalla donde se estaba. El chat NO se descarga al regresar:
      volver a entrar es instantaneo y sigue en la conversacion abierta.    */
  function abrirConversaciones() {
    var f = $('conv-frame');
    if (!f) return;
    f.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;margin:0;'
      + 'z-index:9000;background:#0B0B12;display:block';
    document.documentElement.style.overflow = 'hidden';
    if (!f.getAttribute('src')) f.setAttribute('src', CONV_URL);
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    var que = e.data.cobra;
    if (que !== 'cerrar-conversaciones' && que !== 'ir-a-cuentas') return;
    var f = $('conv-frame');
    if (f) f.style.display = 'none';
    document.documentElement.style.overflow = '';
    //  Los botones de canales del chat traen a conectar las cuentas aqui.
    if (que === 'ir-a-cuentas') { S.tab = 'cuentas'; window.setView('chatcobra'); return; }
    window.setView(ultimaVista || 'resumen');
  });

  /* ── Estilos, una sola vez ────────────────────────────────────────────── */
  function estilos() {
    if ($('ch-css')) return;
    var st = document.createElement('style');
    st.id = 'ch-css';
    st.textContent = [
      '.ch-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.ch-tabs{display:inline-flex;background:#F1F5F9;border-radius:10px;padding:3px;gap:2px}',
      '.ch-tabs button{border:none;background:transparent;font:inherit;font-size:12.5px;font-weight:600;color:#64748B;padding:7px 14px;border-radius:8px;cursor:pointer}',
      '.ch-tabs button.on{background:#fff;color:#0F172A;font-weight:700;box-shadow:0 1px 2px rgba(15,23,42,.1)}',
      '.ch-av{width:36px;height:36px;border-radius:999px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}',
      '.ch-btn{border-radius:9px;padding:8px 13px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;border:none;background:#5B6BFF;color:#fff;white-space:nowrap}',
      '.ch-btn:disabled{opacity:.5;cursor:default}',
      '.ch-btn.gho{background:#fff;color:#475569;border:1px solid #ECEEF2}',
      '.ch-btn.gho:hover{background:#F8FAFC;color:#0F172A}',
      '.ch-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}',
      '.ch-card{background:#fff;border:1px solid #ECEEF2;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}',
      '.ch-card-t{display:flex;align-items:center;gap:10px;font-size:14.5px;font-weight:800;color:#0F172A}',
      '.ch-est{font-size:12.5px;color:#64748B;line-height:1.5}',
      '.ch-est b{color:#16A34A}',
      '.ch-form{background:#fff;border:1px solid #ECEEF2;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px;max-width:760px}',
      '.ch-lbl{font-size:12px;font-weight:700;color:#475569;margin-bottom:5px;display:block}',
      '.ch-in{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ECEEF2;border-radius:9px;font:inherit;font-size:13px;outline:none}',
      '.ch-in:focus{border-color:#5B6BFF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}',
      '.ch-ayuda{font-size:12px;color:#94A3B8;margin-top:4px;line-height:1.5}',
      '.ch-sw{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;font-weight:600;color:#0F172A}',
      '.ch-sw i{width:34px;height:19px;border-radius:999px;background:#E2E8F0;position:relative;transition:background .18s;flex-shrink:0}',
      '.ch-sw i::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .18s}',
      '.ch-sw.on i{background:#16A34A}',
      '.ch-sw.on i::after{transform:translateX(15px)}',
      '.ch-sabe{font-size:12.5px;color:#475569;line-height:1.7;background:#F8FAFC;border-radius:10px;padding:11px 14px}',
      '.ch-ov{position:fixed;inset:0;background:rgba(15,23,42,.32);backdrop-filter:blur(2px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}',
      '.ch-modal{background:#fff;border-radius:16px;width:420px;max-width:96vw;padding:20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 30px 70px -20px rgba(15,23,42,.4)}',
      '.ch-pag{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #ECEEF2;border-radius:10px;padding:10px 12px;background:#fff;font:inherit;cursor:pointer;text-align:left}',
      '.ch-pag:hover:not(:disabled){border-color:#5B6BFF;background:#F8FAFF}',
      '.ch-pag:disabled{opacity:.5;cursor:default}'
    ].join('');
    document.head.appendChild(st);
  }

  /* ── Chat de Cobra: Cuentas y Asistente ───────────────────────────────── */
  async function abrir() {
    estilos();
    var box = $('ch-body');
    if (!box) return;
    if (!S.estado || !S.estado.ok) {
      box.innerHTML = '<div style="font-size:13px;color:#94A3B8">Cargando…</div>';
      S.estado = await llamar({ accion: 'estado' });
      if (!S.estado.ok) { box.innerHTML = '<div style="font-size:13px;color:#DC2626">' + esc(S.estado.error) + '</div>'; return; }
    }
    pintarTabs();
    pintar();
  }

  function pintarTabs() {
    var t = $('ch-tabs');
    if (!t) return;
    t.innerHTML = [['cuentas', 'Cuentas'], ['asistente', 'Asistente']].map(function (x) {
      return '<button data-tab="' + x[0] + '" class="' + (S.tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
    }).join('');
    t.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { S.tab = b.dataset.tab; pintarTabs(); pintar(); };
    });
  }

  function pintar() {
    if (S.tab === 'asistente') return pintarAsistente();
    return pintarCuentas();
  }

  /* ── Cuentas ──────────────────────────────────────────────────────────── */
  function pintarCuentas() {
    var box = $('ch-body');
    var canales = (S.estado && S.estado.canales) || [];
    box.innerHTML = '<div class="ch-sabe" style="margin-bottom:14px;max-width:760px">Conecta aquí las cuentas <b>de Cobra</b> — no las de El Parche. '
      + 'Te pide entrar con Facebook: escoge la página y el número de Cobra. Las llaves quedan guardadas en el servidor, nunca en esta pantalla.</div>'
      + '<div class="ch-cards">' + ['whatsapp', 'instagram', 'facebook'].map(function (k) {
        var c = canales.find(function (x) { return x.channel === k && x.connected; });
        var m = CANAL[k];
        return '<div class="ch-card"><div class="ch-card-t"><span class="ch-av" style="width:30px;height:30px;background:' + m.tint + ';color:' + m.color + '">' + m.nombre.charAt(0) + '</span>' + m.nombre + '</div>'
          + '<div class="ch-est">' + (c ? '<b>Conectado</b> · ' + esc(c.handle || c.display_name || '') : 'Sin conectar') + '</div>'
          + '<button class="ch-btn' + (c ? ' gho' : '') + '" data-con="' + k + '">' + (c ? 'Volver a conectar' : 'Conectar') + '</button></div>';
      }).join('') + '</div>';
    box.querySelectorAll('[data-con]').forEach(function (b) {
      //  SIN async: la ventana de Facebook necesita el mismo toque del usuario,
      //  si no el navegador la bloquea (misma regla que en Chat IA).
      b.onclick = function () { conectar(b.dataset.con, b); };
    });
  }

  function base() { return { branch_id: S.estado.branch_id, tenant_id: S.estado.tenant_id }; }

  async function postOAuth(cuerpo) {
    var r = await fetch(OAUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    var d = await r.json().catch(function () { return {}; });
    if (d.error) throw new Error(d.error);
    return d;
  }

  /*  ══ CONECTAR: EL MISMO CAMINO PARA LAS TRES CUENTAS (11-sep-2026) ══════
      La primera version conectaba Instagram y Facebook con el SDK de
      Facebook (FB.login), como el Chat IA. Sergio lo probo desde el programa
      de escritorio y Facebook contesto "Sorry, something went wrong": el SDK
      manda como direccion la PAGINA desde donde se llama, y la pagina nueva
      de la consola no es una que Facebook tenga registrada.

      Ahora las tres van por el camino de WhatsApp, que ya funciona en el
      navegador y en el programa: una ventana a Facebook que vuelve a la
      direccion de siempre (github.io, registrada en la app de Meta). En el
      navegador se lee el codigo en esa ventana; en el programa de escritorio
      main.js lo atrapa y lo avisa con el evento `meta-oauth-code`.         */
  var VUELTA = 'https://elparchefood.github.io/restaurant-pos/';

  function conectar(canal, boton) {
    boton.disabled = true; boton.textContent = 'Conectando…';
    var fin = function (err) {
      boton.disabled = false; boton.textContent = 'Conectar';
      if (err) toast(err.message || String(err), 'red');
    };
    var waba = null, phone = null, listo = false, poll = null, pop = null;
    var onMsg = function (ev) {
      if (ev.origin !== 'https://www.facebook.com') return;
      try { var d = JSON.parse(ev.data); if (d.type === 'WA_EMBEDDED_SIGNUP' && d.event === 'FINISH') { waba = d.data.waba_id; phone = d.data.phone_number_id; } } catch (e) {}
    };
    var soltar = function () {
      clearInterval(poll);
      window.removeEventListener('message', onMsg);
      window.removeEventListener('meta-oauth-code', onElectron);
    };
    var conCodigo = function (code) {
      if (listo || !code) return;
      listo = true; soltar();
      try { if (pop && !pop.closed) pop.close(); } catch (e) {}
      var cuerpo = Object.assign({ code: code, channel: canal, redirect_uri: VUELTA }, base());
      if (canal === 'whatsapp') {
        cuerpo.waba_id = waba; cuerpo.phone_number_id = phone;
        postOAuth(cuerpo)
          .then(function (d) { fin(); toast('WhatsApp de Cobra conectado: ' + (d.handle || ''), 'green'); recargarEstado(); })
          .catch(fin);
        return;
      }
      cuerpo.paso = 'listar';
      postOAuth(cuerpo)
        .then(function (d) {
          if (d.paginas) return elegirPagina(d, canal).then(function () { fin(); });
          fin(); toast(CANAL[canal].nombre + ' de Cobra conectado', 'green'); recargarEstado();
        })
        .catch(fin);
    };
    //  El programa de escritorio avisa el codigo con este evento (main.js).
    var onElectron = function (ev) { conCodigo(ev && ev.detail && ev.detail.code); };
    window.addEventListener('message', onMsg);
    window.addEventListener('meta-oauth-code', onElectron);

    var W = 600, H = 720;
    var qp = new URLSearchParams({
      client_id: META_APP_ID, config_id: canal === 'whatsapp' ? META_WA_CONFIG_ID : META_CONFIG_ID,
      response_type: 'code', override_default_response_type: 'true', redirect_uri: VUELTA
    });
    pop = window.open('https://www.facebook.com/v22.0/dialog/oauth?' + qp.toString(), 'Conectar_' + canal,
      'popup,width=' + W + ',height=' + H + ',left=' + Math.max(0, (screen.width - W) / 2) + ',top=' + Math.max(0, (screen.height - H) / 2));
    if (!pop) { soltar(); return fin(new Error('El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.')); }
    poll = setInterval(function () {
      if (listo) return;
      if (pop.closed) {
        //  En el programa de escritorio la ventana la cierra main.js DESPUES de
        //  avisar el codigo: se le da un momento antes de darla por cancelada.
        clearInterval(poll);
        setTimeout(function () { if (!listo) { soltar(); fin(new Error('Conexión cancelada')); } }, 1500);
        return;
      }
      try {
        var code = new URL(pop.location.href).searchParams.get('code');
        if (code) conCodigo(code);
      } catch (e) { /* todavia en facebook.com */ }
    }, 300);
  }

  /* El dueño puede administrar varias páginas (El Parche Y Cobra): aquí se
     escoge la de Cobra. Sin esto se conectaría la primera que llegue. */
  function elegirPagina(res, canal) {
    return new Promise(function (resolve) {
      var esIG = canal === 'instagram';
      var ov = document.createElement('div');
      ov.className = 'ch-ov';
      ov.innerHTML = '<div class="ch-modal"><div style="font-size:16px;font-weight:800;color:#0F172A">'
        + (esIG ? '¿Cuál es el Instagram de Cobra?' : '¿Cuál es la página de Cobra?') + '</div>'
        + '<div style="font-size:12.5px;color:#64748B">Escoge la de <b>Cobra POS</b>, no la de El Parche.</div>'
        + res.paginas.map(function (p) {
            var sirve = !esIG || !!p.instagram;
            return '<button class="ch-pag" data-id="' + esc(p.id) + '"' + (sirve ? '' : ' disabled') + '><span><b style="font-size:13px">' + esc(p.nombre || 'Sin nombre') + '</b><br>'
              + '<span style="font-size:11.5px;color:#64748B">' + (p.instagram ? '@' + esc(p.instagram) : (esIG ? 'Sin Instagram vinculado' : 'Página de Facebook')) + '</span></span>'
              + (sirve ? '<span style="font-size:12px;font-weight:700;color:#5B6BFF">Conectar</span>' : '') + '</button>';
          }).join('')
        + '<div id="ch-pag-err" style="font-size:12.5px;color:#DC2626" hidden></div>'
        + '<button class="ch-btn gho" id="ch-pag-no">Cancelar</button></div>';
      document.body.appendChild(ov);
      var cerrar = function () { ov.remove(); resolve(); };
      ov.querySelector('#ch-pag-no').onclick = cerrar;
      ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });
      ov.querySelectorAll('.ch-pag').forEach(function (b) {
        b.onclick = function () {
          ov.querySelectorAll('.ch-pag').forEach(function (x) { x.disabled = true; });
          postOAuth({ paso: 'guardar', sesion: res.sesion, page_id: b.dataset.id })
            .then(function (d) { ov.remove(); toast(CANAL[canal].nombre + ' de Cobra conectado: ' + (d.handle || ''), 'green'); recargarEstado(); resolve(); })
            .catch(function (e) {
              var er = ov.querySelector('#ch-pag-err'); er.textContent = e.message || e; er.hidden = false;
              ov.querySelectorAll('.ch-pag').forEach(function (x) { x.disabled = false; });
            });
        };
      });
    });
  }

  async function recargarEstado() {
    S.estado = await llamar({ accion: 'estado' });
    if (S.tab === 'cuentas') pintarCuentas();
  }

  /* ── Asistente ────────────────────────────────────────────────────────── */
  function pintarAsistente() {
    var a = (S.estado && S.estado.asistente) || {};
    var box = $('ch-body');
    box.innerHTML = '<div class="ch-form">'
      + '<label class="ch-sw' + (a.activo ? ' on' : '') + '" id="ch-sw"><i></i><span>El asistente contesta solo</span></label>'
      + '<div class="ch-ayuda" style="margin-top:-8px">Apagado, los mensajes llegan igual y los contestas tú. Es lo mismo que el botón Apagado / Encendido de Conversaciones.</div>'
      + '<div><span class="ch-lbl">Cómo se llama</span><input class="ch-in" id="ch-nom" maxlength="40" placeholder="Ej: Cobi" value="' + esc(a.nombre) + '">'
      + '<div class="ch-ayuda">Se presenta con este nombre y siempre aclara que es un asistente virtual.</div></div>'
      + '<div><span class="ch-lbl">Lo que ya sabe (sale del sistema)</span><div class="ch-sabe">'
      + '· Los planes Starter y Pro con sus precios de hoy, qué trae cada uno y los descuentos.<br>'
      + '· Cómo se paga, que no hay contrato, y el enlace para crear la cuenta.<br>'
      + '· Agendar la demostración en tu calendario de Videollamadas (te llega el correo).<br>'
      + '· Pasarte la conversación y avisarte por correo cuando alguien pide una persona o algo se le sale de las manos.<br>'
      + '· Nunca ofrece tarjetas NFC, billetera, app de clientes ni el plan Premium.</div></div>'
      + '<div><span class="ch-lbl">Lo que quieres que sepa o diga, además</span>'
      + '<textarea class="ch-in" id="ch-ins" rows="7" placeholder="Ej: si preguntan por promociones, este mes la instalación incluye capacitación al equipo.">' + esc(a.instrucciones) + '</textarea>'
      + '<div class="ch-ayuda">Lo que escribas aquí manda sobre lo anterior si chocan.</div></div>'
      + '<div><button class="ch-btn" id="ch-guardar">Guardar</button></div></div>';
    var sw = $('ch-sw');
    sw.onclick = function () { sw.classList.toggle('on'); };
    $('ch-guardar').onclick = async function () {
      var bt = $('ch-guardar'); bt.disabled = true;
      var nuevo = { nombre: $('ch-nom').value.trim(), activo: sw.classList.contains('on'), instrucciones: $('ch-ins').value };
      var r = await llamar(Object.assign({ accion: 'guardar_asistente' }, nuevo));
      bt.disabled = false;
      if (!r.ok) return toast(r.error || 'No se pudo guardar', 'red');
      S.estado.asistente = nuevo;
      toast('Asistente guardado', 'green');
    };
  }

  /* ── El numerito de «Conversaciones» ──────────────────────────────────────
     Cuenta a quienes el asistente le pasó a Sergio. Aparece aunque no se abra
     la pestaña: quien te necesita no puede esperar a que se te ocurra entrar. */
  var _t = null;
  async function contar() {
    if (!S.estado || !S.estado.tenant_id) return;
    var r = await sb.from('chat_conversations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', S.estado.tenant_id).eq('human_takeover', true).not('handoff_motivo', 'is', null);
    var n = r.count || 0;
    var b = $('conv-badge');
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  }
  function suscribir() {
    if (S.canal || !S.estado || !S.estado.tenant_id) return;
    S.canal = sb.channel('chat-cobra-consola')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations', filter: 'tenant_id=eq.' + S.estado.tenant_id }, function () {
        clearTimeout(_t); _t = setTimeout(contar, 800);
      })
      .subscribe();
  }
  setTimeout(async function () {
    try {
      S.estado = await llamar({ accion: 'estado' });
      if (!S.estado.ok) return;
      suscribir();
      contar();
    } catch (e) {}
  }, 2500);
})();
