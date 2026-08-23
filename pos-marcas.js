/* ══════════════════════════════════════════════════════════════════════
   MARCAS, SUCURSALES Y PLAN — en el menú de arriba a la derecha

   Hasta hoy el sistema sabía LEER marcas y sucursales, y renombrarlas, pero
   **no había forma de crear una**. Tampoco se veía en ninguna parte qué plan
   tenía contratado el dueño.

   Esto agrega al desplegable del usuario:
     · El plan contratado.
     · La marca y la sucursal en las que se está trabajando.
     · Crear marca / crear sucursal, validando contra los límites del plan.

   Los límites viven en la tabla `pos_planes`, no aquí: así se ajustan sin
   tocar código.

   EL SWITCH YA ESTÁ (ver _cambiarHTML más abajo). Este comentario decía que
   no, y siguió diciéndolo mucho después de que se construyó: se apoya en
   window.posContexto, que es justo el contexto central que aquí se echaba de
   menos. Se corrige el 23-ago-2026, junto con el aviso que le repetía lo
   mismo al dueño en la cara al crear una marca.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CSS = [
    '.pm-sec{padding:10px 14px 4px;font-size:10.5px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.04em}',
    '.pm-row{display:flex;align-items:center;gap:10px;padding:7px 14px;font-size:12.5px;color:#0F172A}',
    '.pm-row b{font-weight:700}',
    '.pm-ic{width:26px;height:26px;border-radius:8px;background:#EEF2FF;color:#5B6BFF;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.pm-plan{margin-left:auto;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:20px;background:#F5F3FF;color:#6D28D9;border:1px solid #DDD6FE}',
    '.pm-sub{font-size:11px;color:#94A3B8}',
    '.pm-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:100000;padding:24px}',
    '.pm-modal{background:#fff;border-radius:18px;width:440px;max-width:100%;overflow:hidden;box-shadow:0 24px 60px -12px rgba(15,23,42,.4)}',
    '.pm-head{padding:18px 22px;border-bottom:1px solid #ECEEF2}',
    '.pm-title{font-size:17px;font-weight:800;color:#0F172A}',
    '.pm-body{padding:20px 22px;display:flex;flex-direction:column;gap:13px}',
    '.pm-f{display:flex;flex-direction:column;gap:5px}',
    '.pm-lbl{font-size:11.5px;font-weight:700;color:#64748B}',
    '.pm-in{border:1px solid #ECEEF2;border-radius:11px;padding:11px 12px;font-family:inherit;font-size:14px;color:#0F172A;outline:none}',
    '.pm-in:focus{border-color:#5B6BFF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}',
    '.pm-err{color:#DC2626;font-size:12.5px;min-height:16px}',
    '.pm-foot{display:flex;gap:10px;padding:16px 22px;border-top:1px solid #ECEEF2}',
    '.pm-btn{flex:1;padding:12px;border-radius:12px;border:none;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer}',
    '.pm-btn.ghost{background:#fff;border:1px solid #ECEEF2;color:#64748B}',
    '.pm-btn.main{background:#5B6BFF;color:#fff}',
    '.pm-btn.main:disabled{opacity:.6;cursor:default}',
    '.pm-tope{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:12px;padding:13px 15px;font-size:13px;line-height:1.55}'
  ].join('');

  function css() {
    if (document.getElementById('pm-css')) return;
    var s = document.createElement('style'); s.id = 'pm-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function sb() { return (window._pos && window._pos.sb) || window.sb || null; }

  /* El dominio de los logins de la marca. Lleva `.cobrapos.app` a propósito:
     el correo es único en TODO el sistema de acceso, no por restaurante, así
     que dos clientes con un restaurante llamado igual chocarían. */
  function dominioDe(nombre) {
    var s = String(nombre || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
    return (s || 'marca') + '.cobrapos.app';
  }

  var ctx = null;   // { tenant, plan, limites, marca, marcas, sucursal, sucursales }

  async function cargar() {
    var s = sb(); if (!s) return null;
    var u = (window._pos && window._pos.state && window._pos.state.user) || null;
    if (!u) { try { u = (await s.auth.getUser()).data.user; } catch (e) {} }
    if (!u) return null;
    var tenantId = (u.user_metadata && u.user_metadata.tenant_id) || u.id;
    var branchId = (u.user_metadata && u.user_metadata.branch_id) || window._branchId || null;

    var t = await s.from('tenants').select('plan,status').eq('id', tenantId).maybeSingle();
    var plan = (t.data && t.data.plan) || 'starter';
    var lim = await s.from('pos_planes').select('*').eq('plan', plan).maybeSingle();
    var marcas = await s.from('brands').select('id,name,email_domain').eq('tenant_id', tenantId).order('name');
    var sucs = await s.from('branches').select('id,name,brand_id').eq('tenant_id', tenantId).order('name');

    var suc = (sucs.data || []).filter(function (x) { return x.id === branchId; })[0] || (sucs.data || [])[0] || null;
    var marca = (marcas.data || []).filter(function (x) { return suc && x.id === suc.brand_id; })[0] || (marcas.data || [])[0] || null;

    ctx = {
      tenantId: tenantId, plan: plan,
      limites: lim.data || { max_marcas: 1, max_sucursales: 1 },
      marcas: marcas.data || [], sucursales: sucs.data || [],
      marca: marca, sucursal: suc
    };
    return ctx;
  }

  function sucursalesDeMarca(brandId) {
    return (ctx.sucursales || []).filter(function (x) { return x.brand_id === brandId; });
  }

  /* AVISO CON LA CARA DEL PRODUCTO, NO LA DEL NAVEGADOR (23-ago-2026).
     Aquí había tres cuadros de dialogo del navegador. Además de romper la
     regla de Sergio —nada de cuadros del navegador— salen con el nombre del
     sitio encima, que es justo lo que un restaurante que paga por Cobra no
     tiene por qué ver. */
  function aviso(titulo, texto) {
    css();
    var ov = document.createElement("div");
    ov.className = "pm-ov";
    ov.innerHTML =
        '<div class="pm-modal"><div class="pm-head"><div class="pm-title">' + esc(titulo) + '</div></div>'
      + '<div class="pm-body"><div style="font-size:13.5px;line-height:1.6;color:#475569">'
      +   esc(texto).split("\n").join("<br>") + '</div></div>'
      + '<div class="pm-foot"><button class="pm-btn main" data-x>Entendido</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.closest("[data-x]")) ov.remove();
    });
  }

  /* ══ EL SWITCH: cambiar de marca y de sucursal ══
     Regla de Sergio: "en el desplegable no pueden aparecer todas las
     sucursales revueltas: se debe escoger la marca y luego la sucursal".
     Por eso van en dos niveles — marca, y debajo SOLO sus sucursales.

     Se apoya en window.posContexto (pos-core), que es quien sabe cuales tiene
     PERMITIDAS este usuario. Si solo hay una marca no se pinta el nivel de
     marcas: seria una fila que no decide nada. Y si solo hay una sucursal, no
     se pinta nada: no hay nada entre lo que elegir. */
  function _cambiarHTML() {
    var C = window.posContexto;
    if (!C) return '';
    var sucs = C.sucursales(), marcas = C.marcas();
    if (sucs.length < 2) return '';

    var actual = C.sucursalId(), marcaAct = C.marcaId();
    var h = '<div class="user-dropdown-divider"></div>'
          + '<div class="pm-sec">Cambiar de ' + (marcas.length > 1 ? 'marca o sucursal' : 'sucursal') + '</div>';

    marcas.forEach(function (m) {
      var suyas = C.sucursalesDe(m.id);
      if (!suyas.length) return;
      if (marcas.length > 1) {
        h += '<div class="pm-row" style="padding-bottom:2px">'
           + '<b style="font-size:11.5px">' + esc(m.name) + '</b>'
           + (m.id === marcaAct ? '<span class="pm-plan" style="margin-left:auto">ACTUAL</span>' : '')
           + '</div>';
      }
      suyas.forEach(function (s) {
        var esta = s.id === actual;
        h += '<button class="user-dropdown-item pm-ir" data-suc="' + esc(s.id) + '"'
           + (esta ? ' disabled style="opacity:.55;cursor:default"' : '') + '>'
           + '<span style="width:15px;display:inline-flex;justify-content:center">'
           + (esta
              ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
              : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>')
           + '</span>'
           + (marcas.length > 1 ? '<span style="padding-left:4px">' : '<span>') + esc(s.name) + '</span>'
           + '</button>';
      });
    });
    return h;
  }

  function _engancharCambiar(div) {
    div.querySelectorAll('.pm-ir').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (b.disabled) return;
        b.textContent = 'Cambiando…';
        window.posContexto.cambiar(b.dataset.suc);   // valida y recarga
      });
    });
  }

  // ── Lo que se inyecta en el desplegable ────────────────────────────────
  function pintar() {
    var dd = document.getElementById('user-dropdown');
    if (!dd || !ctx) return;
    var viejo = document.getElementById('pm-bloque');
    if (viejo) viejo.remove();

    var nMarcas = ctx.marcas.length;
    var nSucs = sucursalesDeMarca(ctx.marca && ctx.marca.id).length;
    var topeM = ctx.limites.max_marcas;      // null = sin límite
    var topeS = ctx.limites.max_sucursales;
    var puedeMarca = (topeM == null) || nMarcas < topeM;
    var puedeSuc = (topeS == null) || nSucs < topeS;

    var div = document.createElement('div');
    div.id = 'pm-bloque';
    div.innerHTML =
        '<div class="user-dropdown-divider"></div>'
      + '<div class="pm-sec">Tu plan</div>'
      + '<div class="pm-row"><span class="pm-ic">'
      +   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      +   '</span><span>Plan contratado</span>'
      +   '<span class="pm-plan">' + esc((ctx.limites.nombre || ctx.plan).toUpperCase()) + '</span></div>'
      + '<div class="user-dropdown-divider"></div>'
      + '<div class="pm-sec">Estás trabajando en</div>'
      + '<div class="pm-row"><span class="pm-ic">'
      +   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
      +   '</span><span><b>' + esc(ctx.marca ? ctx.marca.name : '—') + '</b>'
      +   '<div class="pm-sub">' + esc(ctx.sucursal ? ctx.sucursal.name : '—') + ' · '
      +     nMarcas + ' marca' + (nMarcas === 1 ? '' : 's') + ' · ' + nSucs + ' sucursal' + (nSucs === 1 ? '' : 'es')
      +   '</div></span></div>'
      + _cambiarHTML()
      + '<button class="user-dropdown-item" id="pm-nueva-marca">'
      +   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      +   (puedeMarca ? 'Crear nueva marca' : 'Crear marca (mejora tu plan)') + '</button>'
      + '<button class="user-dropdown-item" id="pm-nueva-suc">'
      +   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      +   (puedeSuc ? 'Crear nueva sucursal' : 'Crear sucursal (mejora tu plan)') + '</button>';

    _engancharCambiar(div);

    var ref = dd.querySelector('.user-dropdown-divider');
    if (ref) dd.insertBefore(div, ref); else dd.appendChild(div);

    document.getElementById('pm-nueva-marca').addEventListener('click', function (e) {
      e.stopPropagation();
      puedeMarca ? modalMarca() : modalTope('marca', nMarcas, topeM);
    });
    document.getElementById('pm-nueva-suc').addEventListener('click', function (e) {
      e.stopPropagation();
      puedeSuc ? modalSucursal() : modalTope('sucursal', nSucs, topeS);
    });
  }

  // ── Cuando el plan no da para más ─────────────────────────────────────
  function modalTope(que, tiene, tope) {
    css();
    var ov = document.createElement('div');
    ov.className = 'pm-ov';
    ov.innerHTML =
        '<div class="pm-modal"><div class="pm-head"><div class="pm-title">Tu plan no alcanza</div></div>'
      + '<div class="pm-body"><div class="pm-tope">'
      +   'Tu plan <b>' + esc((ctx.limites.nombre || ctx.plan)) + '</b> incluye '
      +   '<b>' + tope + ' ' + que + (tope === 1 ? '' : 's') + '</b> y ya ' + (tope === 1 ? 'tienes una' : 'las tienes todas') + '.'
      +   '<br><br>Para crear otra ' + que + ' necesitas mejorar el plan.'
      + '</div></div>'
      + '<div class="pm-foot"><button class="pm-btn ghost" data-x>Entendido</button>'
      + '<button class="pm-btn main" data-planes>Ver planes</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) ov.remove();
      if (e.target.closest('[data-planes]')) { ov.remove(); aviso('Planes y pagos', 'Esta pantalla todavía no está construida.'); }
    });
  }

  // ── Crear marca ───────────────────────────────────────────────────────
  function modalMarca() {
    css();
    var ov = document.createElement('div');
    ov.className = 'pm-ov';
    ov.innerHTML =
        '<div class="pm-modal"><div class="pm-head"><div class="pm-title">Nueva marca</div></div>'
      + '<div class="pm-body">'
      +   '<div class="pm-f"><span class="pm-lbl">Nombre de la marca</span>'
      +     '<input class="pm-in" id="pm-m-nombre" placeholder="Ej. Pollos Doña Rosa" autocomplete="off"></div>'
      +   '<div class="pm-f"><span class="pm-lbl">Primera sucursal</span>'
      +     '<input class="pm-in" id="pm-m-suc" placeholder="Ej. Sede Centro" autocomplete="off">'
      +     '<span class="pm-sub">Toda marca necesita al menos una sucursal para poder vender.</span></div>'
      +   '<div class="pm-f"><span class="pm-lbl">Los usuarios de esta marca entrarán así</span>'
      +     '<div class="pm-in" id="pm-m-dom" style="background:#F8FAFC;color:#64748B">usuario@…</div></div>'
      +   '<div class="pm-err" id="pm-m-err"></div>'
      + '</div>'
      + '<div class="pm-foot"><button class="pm-btn ghost" data-x>Cancelar</button>'
      + '<button class="pm-btn main" id="pm-m-ok">Crear marca</button></div></div>';
    document.body.appendChild(ov);

    var inp = document.getElementById('pm-m-nombre');
    var dom = document.getElementById('pm-m-dom');
    inp.addEventListener('input', function () {
      dom.textContent = 'usuario@' + dominioDe(inp.value);
    });
    setTimeout(function () { inp.focus(); }, 40);

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) ov.remove();
    });

    document.getElementById('pm-m-ok').addEventListener('click', async function () {
      var err = document.getElementById('pm-m-err');
      var nombre = String(inp.value || '').trim();
      var suc = String(document.getElementById('pm-m-suc').value || '').trim();
      if (nombre.length < 2) { err.textContent = 'Escribe el nombre de la marca.'; return; }
      if (suc.length < 2) { err.textContent = 'Escribe el nombre de su primera sucursal.'; return; }
      var dominio = dominioDe(nombre);
      if (ctx.marcas.some(function (m) { return m.email_domain === dominio; })) {
        err.textContent = 'Ya tienes una marca con un nombre casi igual. Usa otro.'; return;
      }
      this.disabled = true; this.textContent = 'Creando…';
      try {
        var s = sb();
        var rm = await s.from('brands').insert({
          tenant_id: ctx.tenantId, name: nombre, email_domain: dominio
        }).select().single();
        if (rm.error) throw rm.error;
        // La marca sin sucursal no sirve para nada: se crea junta.
        var rs = await s.from('branches').insert({
          tenant_id: ctx.tenantId, brand_id: rm.data.id, name: suc
        }).select().single();
        if (rs.error) throw rs.error;
        ov.remove();
        await cargar(); pintar();
        /* Antes esto remataba con "el cambio de marca todavía se está
           construyendo". Ya no: el switch está arriba, en este mismo menú. */
        aviso("Marca creada",
              'Ya tienes la marca "' + nombre + '" con su sucursal "' + suc + '".\n'
            + 'Para empezar a trabajar en ella, cámbiate desde este mismo menú, en "Cambiar de marca o sucursal".');
      } catch (e) {
        this.disabled = false; this.textContent = 'Crear marca';
        err.textContent = 'No se pudo crear: ' + (e.message || e);
      }
    });
  }

  // ── Crear sucursal (dentro de la marca actual) ────────────────────────
  function modalSucursal() {
    css();
    var ov = document.createElement('div');
    ov.className = 'pm-ov';
    ov.innerHTML =
        '<div class="pm-modal"><div class="pm-head"><div class="pm-title">Nueva sucursal</div>'
      +   '<div class="pm-sub" style="margin-top:3px">de ' + esc(ctx.marca ? ctx.marca.name : '—') + '</div></div>'
      + '<div class="pm-body">'
      +   '<div class="pm-f"><span class="pm-lbl">Nombre</span>'
      +     '<input class="pm-in" id="pm-s-nombre" placeholder="Ej. Sede Norte" autocomplete="off"></div>'
      +   '<div class="pm-f"><span class="pm-lbl">Dirección</span>'
      +     '<input class="pm-in" id="pm-s-dir" placeholder="Opcional" autocomplete="off"></div>'
      +   '<div class="pm-f"><span class="pm-lbl">Teléfono</span>'
      +     '<input class="pm-in" id="pm-s-tel" placeholder="Opcional" autocomplete="off"></div>'
      +   '<div class="pm-err" id="pm-s-err"></div>'
      + '</div>'
      + '<div class="pm-foot"><button class="pm-btn ghost" data-x>Cancelar</button>'
      + '<button class="pm-btn main" id="pm-s-ok">Crear sucursal</button></div></div>';
    document.body.appendChild(ov);
    setTimeout(function () { document.getElementById('pm-s-nombre').focus(); }, 40);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) ov.remove();
    });

    document.getElementById('pm-s-ok').addEventListener('click', async function () {
      var err = document.getElementById('pm-s-err');
      var nombre = String(document.getElementById('pm-s-nombre').value || '').trim();
      if (nombre.length < 2) { err.textContent = 'Escribe el nombre de la sucursal.'; return; }
      this.disabled = true; this.textContent = 'Creando…';
      try {
        var s = sb();
        var r = await s.from('branches').insert({
          tenant_id: ctx.tenantId,
          brand_id: ctx.marca ? ctx.marca.id : null,
          name: nombre,
          address: String(document.getElementById('pm-s-dir').value || '').trim() || null,
          phone: String(document.getElementById('pm-s-tel').value || '').trim() || null
        }).select().single();
        if (r.error) throw r.error;
        ov.remove();
        await cargar(); pintar();
        aviso("Sucursal creada",
              'Ya tienes la sucursal "' + nombre + '" en ' + (ctx.marca ? ctx.marca.name : '') + '.');
      } catch (e) {
        this.disabled = false; this.textContent = 'Crear sucursal';
        err.textContent = 'No se pudo crear: ' + (e.message || e);
      }
    });
  }

  async function iniciar() {
    css();
    try { if (await cargar()) pintar(); }
    catch (e) { console.warn('[pos-marcas]', e && e.message); }
  }

  if (window._pos && window._pos.on) window._pos.on('core:ready', function () { setTimeout(iniciar, 400); });
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(iniciar, 1200); });

  window.posMarcas = { recargar: iniciar, ctx: function () { return ctx; } };
})();
