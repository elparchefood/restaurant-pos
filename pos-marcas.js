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

   EL SWITCH YA ESTA (hoy son los tres desplegables). Este comentario decia que
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
    '.pm-tope{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:12px;padding:13px 15px;font-size:13px;line-height:1.55}',
    /*  Los tres desplegables del menu. Antes esto era una lista de todas las
        sucursales, una debajo de otra, mas dos botones sueltos de "crear". */
    '.pm-sel-w{padding:4px 14px 10px}',
    '.pm-sel-l{font-size:11px;font-weight:600;color:#64748B;margin-bottom:4px}',
    '.pm-sel{width:100%;appearance:none;-webkit-appearance:none;border:1px solid #ECEEF2;',
    '  border-radius:10px;padding:9px 30px 9px 11px;font-family:inherit;font-size:13px;',
    '  font-weight:600;color:#0F172A;background:#fff;cursor:pointer;outline:none;',
    "  background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\");",
    '  background-repeat:no-repeat;background-position:right 9px center}',
    '.pm-sel:hover{border-color:#DCE0E8}',
    '.pm-sel:focus{border-color:#5B6BFF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}',
    '.pm-sel:disabled{background-color:#F8FAFC;color:#64748B;cursor:default}',
    '.pm-nota{font-size:11px;color:#94A3B8;padding:0 14px 10px;line-height:1.45}'
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

    /*  LAS CUATRO CONSULTAS VAN A LA VEZ (30-ago-2026).

        Estaban una detras de otra con `await`, y como el plan hacia falta para
        pedir sus limites parecian encadenadas de verdad. No lo estaban: se
        piden TODOS los planes de una (son tres filas) y el del restaurante se
        escoge aqui mismo. Cuatro viajes de ~250 ms pasan a uno.

        Y de paso hacen falta todos para el desplegable de plan.            */
    var _r = await Promise.all([
      /*  Las fechas van en esta lista a proposito: un `select` sin la columna
          NO da error, devuelve la fila sin el dato — y el prorrateo saldria
          en cero sin que nadie sepa por que.                              */
      s.from('tenants').select('plan,status,periodo_inicio,periodo_fin,saldo_favor,pagado_periodo')
        .eq('id', tenantId).maybeSingle(),
      s.from('pos_planes').select('*').order('orden', { nullsFirst: false }),
      s.from('brands').select('id,name,email_domain').eq('tenant_id', tenantId).order('name'),
      s.from('branches').select('id,name,brand_id').eq('tenant_id', tenantId).order('name')
    ]);
    var t = _r[0], planes = _r[1], marcas = _r[2], sucs = _r[3];
    var plan = (t.data && t.data.plan) || 'starter';
    var todosPlanes = planes.data || [];
    var lim = { data: todosPlanes.filter(function (x) { return x.plan === plan; })[0] || null };

    var suc = (sucs.data || []).filter(function (x) { return x.id === branchId; })[0] || (sucs.data || [])[0] || null;
    var marca = (marcas.data || []).filter(function (x) { return suc && x.id === suc.brand_id; })[0] || (marcas.data || [])[0] || null;

    ctx = {
      tenantId: tenantId, plan: plan,
      limites: lim.data || { max_marcas: 1, max_sucursales: 1 },
      /*  Solo los que se VENDEN salen en el desplegable. El plan interno de
          Sergio (`premium`, `a_la_venta = false`) no se le ofrece a nadie —
          pero si es el suyo, se muestra como el que tiene puesto.          */
      planes: todosPlanes.filter(function (x) { return x.a_la_venta; }),
      planActual: lim.data || null,
      periodoFin: (t.data && t.data.periodo_fin) || null,
      saldoFavor: Number((t.data && t.data.saldo_favor) || 0),
      pagadoPeriodo: (t.data && t.data.pagado_periodo != null) ? Number(t.data.pagado_periodo) : null,
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

  /*  Aqui vivian `_cambiarHTML` y `_engancharCambiar`, que pintaban la lista
      larga de sucursales con su palomita verde. Las reemplazaron los tres
      desplegables de abajo (30-ago-2026).                                   */

  // ── Lo que se inyecta en el desplegable ────────────────────────────────
  /*  TRES DESPLEGABLES, NI UN BOTON SUELTO (30-ago-2026, pedido por Sergio).

      Antes esto pintaba: la fila del plan, una LISTA con todas las sucursales
      del restaurante una debajo de otra, y dos botones sueltos de "Crear nueva
      marca" y "Crear nueva sucursal". Sergio: *"no me gustan todos esos
      botones... me gustaría que simplemente hayan dos desplegables"*. Y tiene
      razon: con dos marcas y cinco sucursales ese menu era una escalera.

      Ahora son tres listas y nada mas:
        · el plan     — solo los que se VENDEN (Starter y Pro)
        · la marca    — al cambiarla, la de abajo se rellena con SUS sucursales
        · la sucursal — esta es la que cambia de verdad el contexto

      "Crear nueva" deja de ser un boton y pasa a ser la ultima opcion de cada
      lista. Asi, un restaurante con una marca y una sucursal abre y ve su
      nombre y "crear nueva". Nada mas.

      Ojo con el orden: cambiar la MARCA no cambia de contexto — solo rellena
      la lista de abajo. Si cambiara de una, el usuario no alcanzaria a escoger
      sucursal porque la pantalla se recarga.                                */
  function _opt(valor, texto, sel) {
    return '<option value="' + esc(valor) + '"' + (sel ? ' selected' : '') + '>' + esc(texto) + '</option>';
  }

  function _sucsHTML(marcaId) {
    var lista = sucursalesDeMarca(marcaId);
    var actual = ctx.sucursal ? ctx.sucursal.id : null;
    var h = lista.map(function (x) { return _opt(x.id, x.name, x.id === actual); }).join('');
    if (!lista.length) h = _opt('', 'Esta marca no tiene sucursales', true);
    var topeS = ctx.limites.max_sucursales;
    var puedeSuc = (topeS == null) || lista.length < topeS;
    h += _opt('__nueva', puedeSuc ? '+  Crear nueva sucursal' : '\u2191  Mejora tu plan para más sucursales', false);
    return h;
  }

  function pintar() {
    var dd = document.getElementById('user-dropdown');
    if (!dd || !ctx) return;
    var viejo = document.getElementById('pm-bloque');
    if (viejo) viejo.remove();

    var nMarcas = ctx.marcas.length;
    var marcaId = ctx.marca ? ctx.marca.id : null;
    var topeM = ctx.limites.max_marcas;
    var puedeMarca = (topeM == null) || nMarcas < topeM;

    //  El plan: los que se venden, mas el suyo si no esta a la venta (el
    //  interno de Sergio). Ese se ve pero no se puede escoger desde aqui.
    var planes = ctx.planes || [];
    var suyoEstaEnLista = planes.some(function (x) { return x.plan === ctx.plan; });
    var planHTML = planes.map(function (x) {
      return _opt(x.plan, x.nombre + '  ·  $' + Number(x.precio || 0).toLocaleString('es-CO'), x.plan === ctx.plan);
    }).join('');
    if (!suyoEstaEnLista) {
      var nom = (ctx.planActual && ctx.planActual.nombre) || ctx.plan;
      planHTML = _opt(ctx.plan, nom, true) + planHTML;
    }

    var marcaHTML = ctx.marcas.map(function (x) { return _opt(x.id, x.name, x.id === marcaId); }).join('')
      + _opt('__nueva', puedeMarca ? '+  Crear nueva marca' : '\u2191  Mejora tu plan para más marcas', false);

    var div = document.createElement('div');
    div.id = 'pm-bloque';
    div.innerHTML =
        '<div class="user-dropdown-divider"></div>'
      + '<div class="pm-sec">Tu plan</div>'
      + '<div class="pm-sel-w"><select class="pm-sel" id="pm-plan">' + planHTML + '</select></div>'
      + '<div class="user-dropdown-divider"></div>'
      + '<div class="pm-sec">Estás trabajando en</div>'
      + '<div class="pm-sel-w"><div class="pm-sel-l">Marca</div>'
      +   '<select class="pm-sel" id="pm-marca">' + marcaHTML + '</select></div>'
      + '<div class="pm-sel-w"><div class="pm-sel-l">Sucursal</div>'
      +   '<select class="pm-sel" id="pm-suc">' + _sucsHTML(marcaId) + '</select></div>'
      + '<div class="pm-nota" id="pm-nota"></div>';

    var ref = dd.querySelector('.user-dropdown-divider');
    if (ref) dd.insertBefore(div, ref); else dd.appendChild(div);

    var selPlan = document.getElementById('pm-plan');
    var selMarca = document.getElementById('pm-marca');
    var selSuc = document.getElementById('pm-suc');

    //  Que un clic dentro del menu no lo cierre.
    [selPlan, selMarca, selSuc].forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    /*  LA MARCA SOLO FILTRA. Cambiarla rellena la lista de abajo con SUS
        sucursales y deja al usuario escoger; no cambia de contexto todavia. */
    selMarca.addEventListener('change', function (e) {
      e.stopPropagation();
      if (selMarca.value === '__nueva') {
        selMarca.value = marcaId || '';
        puedeMarca ? modalMarca() : modalTope('marca', nMarcas, topeM);
        return;
      }
      selSuc.innerHTML = _sucsHTML(selMarca.value);
      var n = sucursalesDeMarca(selMarca.value).length;
      document.getElementById('pm-nota').textContent = n
        ? 'Elige una sucursal para trabajar en esa marca.'
        : 'Esta marca todavía no tiene sucursales.';
    });

    //  LA SUCURSAL SI CAMBIA EL CONTEXTO: valida y recarga la pantalla.
    selSuc.addEventListener('change', function (e) {
      e.stopPropagation();
      var v = selSuc.value;
      if (v === '__nueva') {
        selSuc.innerHTML = _sucsHTML(selMarca.value);
        var lista = sucursalesDeMarca(selMarca.value);
        var topeS = ctx.limites.max_sucursales;
        ((topeS == null) || lista.length < topeS)
          ? modalSucursal() : modalTope('sucursal', lista.length, topeS);
        return;
      }
      if (!v || (ctx.sucursal && v === ctx.sucursal.id)) return;
      document.getElementById('pm-nota').textContent = 'Cambiando…';
      window.posContexto.cambiar(v);
    });

    /*  EL PLAN. Por ahora avisa y no cobra: el cambio con prorrateo necesita
        las fechas de la suscripcion, que HOY NO EXISTEN en la base (`tenants`
        solo guarda `plan`). Se hace en el siguiente paso; mientras tanto es
        preferible no ofrecer un boton que mueva plata sin saber las fechas. */
    selPlan.addEventListener('change', function (e) {
      e.stopPropagation();
      var nuevo = selPlan.value;
      selPlan.value = ctx.plan;
      if (nuevo === ctx.plan) return;
      var destino = (ctx.planes || []).filter(function (x) { return x.plan === nuevo; })[0];
      modalPlan(destino);
    });
  }

  /*  ══ CAMBIO DE PLAN ═══════════════════════════════════════════════════

      Las reglas son de Sergio y cada una cierra un hueco real:

      · **El saldo a favor es LA DIFERENCIA entre planes** por los dias que
        sobran, jamas el precio completo. Si fuera el completo, alguien podria
        subir a Pro pagando solo la diferencia por unos dias, bajarse al dia
        siguiente y recibir MAS saldo del que pago — repitiendo el ciclo, el
        sistema le sale gratis.
      · **El saldo nunca pasa de lo que de verdad se pago** en el periodo. Sin
        ese tope, un mes de promocion se convertiria en saldo real.
      · **Cambiar de plan NO mueve el vencimiento.** Si lo moviera, se podria
        estirar la fecha a base de cambios.
      · **Al SUBIR, el plan nuevo no se activa hasta que el pago se verifique.**
        Decision expresa de Sergio: si se activara antes, cualquiera sube y no
        paga. Por eso subir deja un cobro pendiente y NO toca `plan`.
      · **Al BAJAR, el cambio es inmediato** y se pierden las funciones de una:
        si solo cambiara la etiqueta, se bajaria, cobraria el saldo y seguiria
        usando lo de arriba gratis.                                          */

  /*  Dias ENTEROS de hoy al vencimiento. Con `ceil` sobre la hora exacta, un
      vencimiento a 5 dias decia "6 dias" — porque contaba tambien lo que
      queda de hoy. Sergio lo planteo como "faltando 5 dias", y en una factura
      un dia de mas o de menos es plata: se cuenta por fecha, no por reloj.  */
  function _diasQueSobran() {
    if (!ctx.periodoFin) return null;          // sin fecha no se puede prorratear
    var f = String(ctx.periodoFin).slice(0, 10).split('-');
    var fin = Date.UTC(+f[0], +f[1] - 1, +f[2]);
    var h = new Date();
    var hoy = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    var d = Math.round((fin - hoy) / 86400000);
    return d > 0 ? d : 0;
  }

  function _cop(n) { return '$' + Math.round(n).toLocaleString('es-CO'); }

  /*  Lo que se gana o se pierde. Solo se nombran las llaves que de verdad
      frenan algo hoy: comprobado en el codigo, de las 13 que existen solo
      `puntos` y `nfc` se preguntan en algun sitio. Prometer que se pierde
      "kardex" cuando nada lo comprueba seria mentirle al que paga.          */
  var NOMBRES = { puntos: 'los puntos de fidelidad', nfc: 'el saldo del cliente' };

  function _difFunciones(desde, hasta) {
    var a = (desde && desde.funciones) || [], b = (hasta && hasta.funciones) || [];
    return a.filter(function (k) { return b.indexOf(k) < 0 && NOMBRES[k]; })
            .map(function (k) { return NOMBRES[k]; });
  }

  function modalPlan(destino) {
    if (!destino) return;
    var actual = ctx.planActual || { precio: 0, nombre: ctx.plan, funciones: [] };
    var pAct = Number(actual.precio) || 0;
    var pNue = Number(destino.precio) || 0;
    var baja = pNue < pAct;
    var dias = _diasQueSobran();
    var DIAS_MES = 30;

    //  Siempre sobre la DIFERENCIA, nunca sobre el precio completo.
    var monto = (dias == null) ? null
      : Math.abs(pAct - pNue) * Math.min(dias, DIAS_MES) / DIAS_MES;
    //  Y el saldo nunca puede pasar de lo que de verdad entro por el periodo.
    if (baja && monto != null && ctx.pagadoPeriodo != null) monto = Math.min(monto, ctx.pagadoPeriodo);

    var pierde = baja ? _difFunciones(actual, destino) : [];
    var gana = baja ? [] : _difFunciones(destino, actual);

    var topeM = destino.max_marcas;
    var apretado = (topeM != null) && ctx.marcas.length > topeM;

    var cuerpo = '';
    if (baja) {
      cuerpo += '<div class="pm-tope"><b>Vas a bajar a ' + esc(destino.nombre) + '.</b><br>'
        + (pierde.length ? 'Dejas de tener ' + esc(pierde.join(' y ')) + '. ' : '')
        + 'El cambio es inmediato.'
        + (apretado ? '<br><br>Tienes ' + ctx.marcas.length + ' marcas y ' + esc(destino.nombre)
            + ' permite ' + topeM + '. No se borra ninguna, pero no podrás crear más.' : '')
        + '</div>';
      cuerpo += monto == null
        ? '<div class="pm-nota" style="padding:0">No tenemos la fecha de tu período, así que este cambio no genera saldo a favor.</div>'
        : '<div class="pm-row" style="padding:0"><span>Te quedan <b>' + dias + ' días</b> pagados de '
          + esc(actual.nombre) + '. Se te descuentan <b>' + _cop(monto)
          + '</b> de tu próxima factura.</span></div>';
    } else {
      cuerpo += '<div class="pm-tope" style="background:#EEF2FF;border-color:#C7D2FE;color:#3730A3">'
        + '<b>Vas a subir a ' + esc(destino.nombre) + '.</b>'
        + (gana.length ? '<br>Vas a tener ' + esc(gana.join(' y ')) + '.' : '') + '</div>';
      cuerpo += monto == null
        ? '<div class="pm-nota" style="padding:0">No tenemos la fecha de tu período: se te cobrará el mes completo de '
          + esc(destino.nombre) + '.</div>'
        : '<div class="pm-row" style="padding:0"><span>Para terminar el mes en ' + esc(destino.nombre)
          + ' pagas <b>' + _cop(monto) + '</b> por los <b>' + dias + ' días</b> que faltan. '
          + 'Del próximo mes en adelante, ' + _cop(pNue) + '.</span></div>';
      cuerpo += '<div class="pm-nota" style="padding:0">' + esc(destino.nombre)
        + ' se activa cuando confirmemos tu pago.</div>';
    }

    var ov = document.createElement('div');
    ov.className = 'pm-ov';
    ov.innerHTML = '<div class="pm-modal">'
      + '<div class="pm-head"><div class="pm-title">Cambiar a ' + esc(destino.nombre) + '</div></div>'
      + '<div class="pm-body">' + cuerpo + '<div class="pm-err" id="pm-plan-err"></div></div>'
      + '<div class="pm-foot"><button class="pm-btn ghost" id="pm-plan-no">Cancelar</button>'
      + '<button class="pm-btn main" id="pm-plan-si">'
      + (baja ? 'Sí, bajar a ' + esc(destino.nombre) : 'Continuar al pago') + '</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.getElementById('pm-plan-no').addEventListener('click', function () { ov.remove(); });

    document.getElementById('pm-plan-si').addEventListener('click', async function () {
      var btn = this; btn.disabled = true; btn.textContent = 'Un momento…';
      var err = document.getElementById('pm-plan-err');
      try {
        var s2 = sb();
        if (baja) {
          /*  ⚠️ EL CAMBIO LO HACE EL SERVIDOR, NO ESTA PANTALLA.

              El primer intento hacia un `update` directo a `tenants` desde
              aqui. No funciono — y menos mal: esa tabla solo deja LEER. Si
              dejara escribir, cualquiera se pondria en el plan mas alto gratis
              desde la consola del navegador.

              Y por lo mismo el monto NO se manda: lo calcula el servidor. Un
              saldo a favor que llega desde el navegador es un saldo que el
              navegador escoge. El numero que se ve arriba es solo para que la
              persona sepa a que atenerse.                                  */
          var ses = await s2.auth.getSession();
          var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
          var resp = await fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/cambiar-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ plan: destino.plan })
          });
          var out = await resp.json().catch(function () { return {}; });
          if (!resp.ok || !out.ok) throw new Error(out.error || 'no se pudo cambiar');
          location.reload();
        } else {
          /*  Sube: NO se toca `plan`. Queda el cobro pendiente y el plan nuevo
              entra cuando el pago se verifique.                            */
          var r2 = await s2.from('pos_pagos_suscripcion').insert({
            tenant_id: ctx.tenantId,
            plan: destino.plan,
            periodo: 'prorrateo',
            monto: (monto == null ? pNue : monto),
            status: 'pendiente',
            nota: (monto == null
              ? 'Cambio a ' + destino.nombre + ' (mes completo: sin fecha de período)'
              : 'Diferencia por ' + dias + ' días para subir a ' + destino.nombre)
          }).select('id');
          if (r2.error || !(r2.data && r2.data.length)) throw (r2.error || new Error('no se pudo registrar'));
          ov.remove();
          aviso('Listo, falta el pago',
            'Registramos tu cambio a ' + destino.nombre + '. Se activa apenas confirmemos el pago de '
            + _cop(monto == null ? pNue : monto) + '.');
        }
      } catch (e) {
        console.error('[plan] cambio:', e);
        err.textContent = 'No se pudo: ' + ((e && e.message) || e);
        btn.disabled = false;
        btn.textContent = baja ? 'Sí, bajar a ' + destino.nombre : 'Continuar al pago';
      }
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
