/* pagina-web.js — la pantalla desde donde el dueño maneja SU página de clientes.
 *
 * Aquí no se CREA nada: la página ya existe desde el día en que se aprobó el
 * restaurante. Lo que se hace aquí es encenderla, ponerle su dirección y
 * comprobar que el acceso funciona.
 *
 * La página en sí NO se abre desde Cobra: el cliente la abre en su navegador.
 * Desde el .exe solo se configura.
 */
(function () {
  'use strict';

  var ACCESO = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/web-acceso';
  var DOMINIO = 'cobrapos.app/';

  var S = { tenant: null, pase: null, tel: '' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function aviso(msg, mal) {
    var t = $('pw-toast');
    t.textContent = msg;
    t.className = 'pw-toast ver' + (mal ? ' mal' : '');
    setTimeout(function () { t.className = 'pw-toast'; }, 3200);
  }
  function sb() { return (window._pos && window._pos.sb) || window.sb; }

  // ── Cargar ─────────────────────────────────────────────────────────
  async function cargar() {
    var s = sb();
    if (!s) { setTimeout(cargar, 400); return; }

    /* MODULO EN PRUEBAS, solo para el administrador de la plataforma.
       Esconder el boton no protege nada: cualquiera puede escribir la direccion
       de esta pantalla. El candado va aqui, y ademas la base no le devolveria
       datos a quien no sea dueño de ese restaurante.
       Se pregunta por es_admin_plataforma(), la misma funcion que abre la
       consola, para no inventar un criterio distinto que despues se desincronice. */
    try {
      var adm = await s.rpc('es_admin_plataforma');
      if (!adm || adm.data !== true) { window.location.href = 'dashboard.html'; return; }
    } catch (e) { window.location.href = 'dashboard.html'; return; }

    /* El restaurante sale de la SESIÓN, nunca "el primero que se pueda ver":
       un administrador de plataforma ve todos, y adivinar le abriría la página
       de otro negocio. */
    var tenantId = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    if (!tenantId) {
      try {
        var u = await s.auth.getUser();
        tenantId = u.data && u.data.user && u.data.user.user_metadata && u.data.user.user_metadata.tenant_id;
      } catch (e) {}
    }
    if (!tenantId) { $('pw-main').innerHTML = '<div class="pw-cargando">Tu cuenta no tiene un restaurante asignado. Vuelve a iniciar sesión.</div>'; return; }

    var r = await s.from('tenants').select('id,name,slug,web_activa,web_cerrado_manual').eq('id', tenantId).maybeSingle();
    if (r.error || !r.data) { $('pw-main').innerHTML = '<div class="pw-cargando">No se pudo cargar. Recarga la pantalla.</div>'; return; }
    S.tenant = r.data;
    pintar();
  }

  // ── Pintar ─────────────────────────────────────────────────────────
  function pintar() {
    var t = S.tenant;
    var viva = !!t.web_activa;
    var cerrado = !!t.web_cerrado_manual;

    $('pw-main').innerHTML =
      // ── La dirección ──
      '<div class="pw-card">' +
        '<div class="pw-card-hd"><div>' +
          '<div class="pw-h">La dirección de tu página</div>' +
          '<div class="pw-sub">Es la que le compartes a tus clientes y la que va en el código QR.</div>' +
        '</div></div>' +
        '<div class="pw-url-row">' +
          '<div class="pw-url"><span class="pw-url-fija">' + DOMINIO + '</span><b id="pw-slug-txt">' + esc(t.slug || '') + '</b></div>' +
          '<button class="pw-btn" id="pw-copiar">Copiar</button>' +
          '<button class="pw-btn" id="pw-editar">Cambiar</button>' +
        '</div>' +
        '<div id="pw-slug-edit" style="display:none">' +
          '<div class="pw-fila">' +
            '<input class="pw-input" id="pw-slug-in" maxlength="40" value="' + esc(t.slug || '') + '" placeholder="elparchefood">' +
            '<button class="pw-btn pw-btn--main" id="pw-slug-ok">Guardar</button>' +
            '<button class="pw-btn" id="pw-slug-no">Cancelar</button>' +
          '</div>' +
          /* Advertencia pedida por Sergio: cambiar la dirección rompe los QR ya
             impresos, y eso no tiene vuelta atrás si ya están pegados. */
          '<div class="pw-aviso">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
            '<span>Si ya imprimiste códigos QR con la dirección de ahora, <b>dejan de servir</b> y toca imprimirlos otra vez. La dirección vieja queda libre para cualquiera.</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Publicar ──
      '<div class="pw-card">' +
        '<div class="pw-card-hd">' +
          '<div><div class="pw-h">Publicar</div>' +
            '<div class="pw-sub">' + (viva
              ? 'Tus clientes ya pueden entrar.'
              : 'Apagada. Solo tú sabes que existe; a quien entre le dice que todavía no está abierta.') + '</div></div>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span class="pw-estado ' + (viva ? 'pw-estado--on' : 'pw-estado--off') + '">' + (viva ? 'Publicada' : 'Apagada') + '</span>' +
            '<button class="pw-sw' + (viva ? ' on' : '') + '" id="pw-sw-viva" role="switch" aria-checked="' + viva + '" aria-label="Publicar la página"></button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Abierto / cerrado ──
      '<div class="pw-card">' +
        '<div class="pw-card-hd">' +
          '<div><div class="pw-h">Cerrar el negocio a mano</div>' +
            '<div class="pw-sub">La página abre y cierra sola con tu horario. Esto es para cerrar por encima del horario: un festivo, un imprevisto.</div></div>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span class="pw-estado ' + (cerrado ? 'pw-estado--warn' : 'pw-estado--on') + '">' + (cerrado ? 'Cerrado' : 'Según el horario') + '</span>' +
            '<button class="pw-sw' + (cerrado ? ' on' : '') + '" id="pw-sw-cerrado" role="switch" aria-checked="' + cerrado + '" aria-label="Cerrar a mano"></button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Probar el acceso ──
      '<div class="pw-card">' +
        '<div class="pw-card-hd"><div>' +
          '<div class="pw-h">Probar el acceso</div>' +
          '<div class="pw-sub">Comprueba que el código llega y que el cliente entra. Es de verdad: le llega un WhatsApp al número que pongas.</div>' +
        '</div></div>' +

        '<div class="pw-paso"><div class="pw-paso-n">1</div><div class="pw-paso-b">' +
          '<b>Manda el código</b>' +
          '<div class="pw-fila">' +
            '<input class="pw-input" id="pw-tel" inputmode="numeric" maxlength="14" placeholder="Número de celular, 10 dígitos">' +
            '<button class="pw-btn pw-btn--main" id="pw-pedir">Enviar código</button>' +
          '</div>' +
        '</div></div>' +

        '<div class="pw-paso"><div class="pw-paso-n">2</div><div class="pw-paso-b">' +
          '<b>Escribe el código que llegó</b>' +
          '<div class="pw-fila">' +
            '<input class="pw-input" id="pw-cod" inputmode="numeric" maxlength="6" placeholder="6 dígitos">' +
            '<button class="pw-btn pw-btn--main" id="pw-verificar">Comprobar</button>' +
          '</div>' +
        '</div></div>' +

        '<div class="pw-res" id="pw-res"></div>' +
      '</div>';

    enganchar();
  }

  // ── Botones ────────────────────────────────────────────────────────
  function enganchar() {
    $('pw-copiar').onclick = function () {
      var url = DOMINIO + (S.tenant.slug || '');
      try {
        navigator.clipboard.writeText('https://' + url);
        aviso('Dirección copiada');
      } catch (e) { aviso('No se pudo copiar', true); }
    };

    $('pw-editar').onclick = function () {
      var d = $('pw-slug-edit');
      d.style.display = d.style.display === 'none' ? 'block' : 'none';
      if (d.style.display === 'block') $('pw-slug-in').focus();
    };
    $('pw-slug-no').onclick = function () { $('pw-slug-edit').style.display = 'none'; };
    $('pw-slug-ok').onclick = guardarSlug;

    $('pw-sw-viva').onclick = function () { cambiar('web_activa', !S.tenant.web_activa); };
    $('pw-sw-cerrado').onclick = function () { cambiar('web_cerrado_manual', !S.tenant.web_cerrado_manual); };

    $('pw-pedir').onclick = pedirCodigo;
    $('pw-verificar').onclick = verificarCodigo;
  }

  async function cambiar(campo, valor) {
    var upd = {}; upd[campo] = valor;
    var r = await sb().from('tenants').update(upd).eq('id', S.tenant.id).select('id');
    if (r.error || !r.data || !r.data.length) { aviso('No se pudo guardar: ' + ((r.error && r.error.message) || 'sin permisos'), true); return; }
    S.tenant[campo] = valor;
    pintar();
    aviso(campo === 'web_activa'
      ? (valor ? 'Tu página ya está publicada' : 'Tu página quedó apagada')
      : (valor ? 'Negocio cerrado a mano' : 'El negocio vuelve a seguir tu horario'));
  }

  async function guardarSlug() {
    /* Se limpia igual que en la base (`pos_slug`): solo letras y números, sin
       tildes ni espacios. Si aquí se dejara pasar otra cosa, la dirección
       guardada no coincidiría con la que se escribe en el navegador. */
    var v = ($('pw-slug-in').value || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (v.length < 3) { aviso('La dirección necesita al menos 3 letras', true); return; }
    if (v === S.tenant.slug) { $('pw-slug-edit').style.display = 'none'; return; }

    var r = await sb().from('tenants').update({ slug: v }).eq('id', S.tenant.id).select('id');
    if (r.error) {
      // El índice único de la base es quien decide de verdad si está libre.
      aviso(String(r.error.message || '').indexOf('duplicate') >= 0 || r.error.code === '23505'
        ? 'Esa dirección ya la tiene otro restaurante. Prueba con otra.'
        : 'No se pudo guardar: ' + r.error.message, true);
      return;
    }
    S.tenant.slug = v;
    pintar();
    aviso('Tu dirección ahora es ' + DOMINIO + v);
  }

  // ── Probar el acceso ───────────────────────────────────────────────
  function res(html, clase) {
    var e = $('pw-res');
    e.className = 'pw-res ver ' + (clase || '');
    e.innerHTML = html;
  }

  async function llamar(cuerpo) {
    cuerpo.slug = S.tenant.slug;
    var r = await fetch(ACCESO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    return await r.json().catch(function () { return { ok: false, mensaje: 'No se pudo conectar.' }; });
  }

  async function pedirCodigo() {
    var tel = ($('pw-tel').value || '').replace(/\D/g, '').slice(-10);
    if (tel.length !== 10) { aviso('Escribe un celular de 10 dígitos', true); return; }
    var b = $('pw-pedir'); b.disabled = true; b.textContent = 'Enviando…';
    var d = await llamar({ accion: 'pedir-codigo', telefono: tel });
    b.disabled = false; b.textContent = 'Enviar código';
    if (!d.ok) { res('<b>No se envió.</b><br>' + esc(d.mensaje || d.razon || ''), 'mal'); return; }
    S.tel = tel;
    res('<b>Código enviado por WhatsApp.</b><br>Vence en ' + (d.vence_en_min || 10) + ' minutos. Escríbelo aquí abajo.', 'ok');
    $('pw-cod').focus();
  }

  async function verificarCodigo() {
    var cod = ($('pw-cod').value || '').replace(/\D/g, '');
    if (!S.tel) { aviso('Primero manda el código', true); return; }
    if (cod.length !== 6) { aviso('El código son 6 dígitos', true); return; }
    var b = $('pw-verificar'); b.disabled = true; b.textContent = 'Comprobando…';
    var d = await llamar({ accion: 'verificar-codigo', telefono: S.tel, codigo: cod });
    b.disabled = false; b.textContent = 'Comprobar';
    if (!d.ok) { res('<b>No cuadró.</b><br>' + esc(d.mensaje || d.razon || ''), 'mal'); return; }

    S.pase = d.pase;
    var c = d.cliente || {};
    var html = '<b>✓ El código es correcto.</b><br>' +
      (d.ya_registrado
        ? 'Este número <b>ya es cliente tuyo</b>, así que al cliente le saldría el formulario ya lleno:'
        : 'Este número <b>es nuevo</b>. Al entrar se crearía su ficha en Cobra automáticamente.');
    if (d.ya_registrado) {
      html += '<div style="margin-top:8px">' +
        '<div class="pw-res-dato"><span>Nombre</span><span>' + (esc(c.nombre) || '—') + '</span></div>' +
        '<div class="pw-res-dato"><span>Dirección</span><span>' + (esc(c.direccion) || '—') + '</span></div>' +
        '<div class="pw-res-dato"><span>Barrio</span><span>' + (esc(c.barrio) || '—') + '</span></div>' +
        '<div class="pw-res-dato"><span>¿Ya tiene contraseña?</span><span>' + (d.tiene_clave ? 'Sí' : 'Todavía no') + '</span></div>' +
        '</div>';
    }
    html += '<div style="margin-top:9px;color:#475569">El acceso funciona de punta a punta.</div>';
    res(html, 'ok');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargar);
  else cargar();
})();
