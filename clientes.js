/* clientes.js — la gente que le compra al restaurante.
 *
 * POR QUÉ NO VIVE EN CAJA (decidido con Sergio el 8-ago-2026):
 * Caja es de un turno — abre, cuadra y cierra. Esto es lo contrario: datos que
 * se acumulan para siempre. Cuánto ha gastado alguien desde que existe, cuántas
 * veces ha vuelto, cuánto ha recargado. Mezclar los dos relojes en una misma
 * sección obliga a decidir, en cada dato nuevo, a cuál de los dos pertenece.
 *
 * QUÉ VE CADA RESTAURANTE:
 *   · Todos y la ficha  → cualquiera. Son sus clientes.
 *   · Recargas y Solicitudes → solo quien tenga página de clientes (web_activa).
 *     Sin página no hay recargas, así que esas pestañas ni aparecen.
 */
(function () {
  'use strict';

  var sb = null, tenantId = null, branchId = null;
  var S = { vista: 'todos', clientes: [], filtro: '', sel: null,
            recargas: [], rango: 'mes', solicitudes: [], conPagina: false };

  var $ = function (id) { return document.getElementById(id); };
  var COP = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  function fecha(v) {
    if (!v) return '—';
    var d = new Date(v);
    return d.toLocaleDateString('es-CO') + ' ' +
           d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
  function haceCuanto(v) {
    if (!v) return 'nunca';
    var dias = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    if (dias < 30) return 'hace ' + dias + ' días';
    var m = Math.floor(dias / 30);
    return 'hace ' + m + (m === 1 ? ' mes' : ' meses');
  }

  // ── Datos ─────────────────────────────────────────────────────────
  async function cargarClientes() {
    try {
      var r = await sb.rpc('fn_clientes_resumen', { p_tenant: tenantId });
      S.clientes = r.data || [];
    } catch (e) { console.error('[clientes]', e); S.clientes = []; }
  }

  function limites(rango) {
    var h = new Date(), d = new Date(h.getFullYear(), h.getMonth(), h.getDate());
    if (rango === 'hoy')    return [d, null];
    if (rango === 'ayer')   return [new Date(d - 86400000), d];
    if (rango === 'semana') return [new Date(d - 6 * 86400000), null];
    if (rango === 'mes')    return [new Date(h.getFullYear(), h.getMonth(), 1), null];
    return [null, null];   // "todo"
  }

  async function cargarRecargas() {
    try {
      var lim = limites(S.rango);
      var q = sb.from('pos_saldo_mov')
        .select('id, created_at, monto, motivo, referencia, detalle, cliente_id, pos_clientes(nombre, telefono)')
        .eq('tenant_id', tenantId)
        .in('motivo', ['recarga', 'bono_recarga'])
        .order('created_at', { ascending: false }).limit(500);
      if (lim[0]) q = q.gte('created_at', lim[0].toISOString());
      if (lim[1]) q = q.lt('created_at', lim[1].toISOString());
      var r = await q;
      S.recargas = r.data || [];
    } catch (e) { console.error('[recargas]', e); S.recargas = []; }
  }

  async function cargarSolicitudes() {
    try {
      var r = await sb.from('pos_recargas_solicitudes')
        .select('id, creado, monto_dicho, monto_leido, referencia, comprobante_url, estado, cliente_id, pos_clientes(nombre, telefono)')
        /* Solo las que siguen abiertas. Con `neq('aplicada')` las descartadas
           volvían a la lista y no había forma de sacarlas de la pantalla. */
        .eq('tenant_id', tenantId).not('estado', 'in', '("aplicada","descartada")')
        .order('creado', { ascending: false }).limit(200);
      S.solicitudes = r.data || [];
    } catch (e) { console.error('[solicitudes]', e); S.solicitudes = []; }
  }

  // ── Pantallas ─────────────────────────────────────────────────────
  function pintarTodos() {
    var f = S.filtro.toLowerCase().trim();
    var lista = !f ? S.clientes : S.clientes.filter(function (c) {
      return String(c.nombre || '').toLowerCase().indexOf(f) >= 0 ||
             String(c.telefono || '').indexOf(f) >= 0;
    });

    var tot = S.clientes.length;
    var conPedido = S.clientes.filter(function (c) { return c.pedidos > 0; }).length;
    var gastoTotal = S.clientes.reduce(function (s, c) { return s + (Number(c.gastado) || 0); }, 0);

    $('cl-kpis').innerHTML =
      tarjeta('Clientes registrados', String(tot)) +
      tarjeta('Han pedido al menos una vez', String(conPedido)) +
      tarjeta('Han gastado en total', COP(gastoTotal)) +
      tarjeta('Gasto promedio por cliente', COP(conPedido ? gastoTotal / conPedido : 0));

    if (!lista.length) {
      $('cl-lista').innerHTML = '<div class="cl-vacio">' +
        (f ? 'Ningún cliente coincide con esa búsqueda.' : 'Todavía no hay clientes registrados.') + '</div>';
      return;
    }
    $('cl-lista').innerHTML =
      '<div class="cl-fila cl-head">' +
        '<div>Cliente</div><div>Pedidos</div><div>Gastado</div>' +
        '<div>Promedio</div><div>Puntos</div><div>Último</div>' +
      '</div>' +
      lista.map(function (c) {
        return '<div class="cl-fila" data-cli="' + esc(c.id) + '">' +
          '<div><b>' + esc(c.nombre || 'Sin nombre') + '</b>' +
            '<small>' + esc(c.telefono || '') + '</small></div>' +
          '<div>' + (c.pedidos || 0) + '</div>' +
          '<div>' + COP(c.gastado) + '</div>' +
          '<div>' + COP(c.promedio) + '</div>' +
          '<div>' + (c.puntos || 0) + '</div>' +
          '<div><small>' + haceCuanto(c.ultimo) + '</small></div>' +
        '</div>';
      }).join('');

    document.querySelectorAll('[data-cli]').forEach(function (el) {
      el.addEventListener('click', function () { abrirFicha(el.dataset.cli); });
    });
  }

  function tarjeta(rotulo, valor) {
    return '<div class="cl-kpi"><div class="cl-kpi-l">' + esc(rotulo) + '</div>' +
           '<div class="cl-kpi-v">' + esc(valor) + '</div></div>';
  }

  function abrirFicha(id) {
    var c = S.clientes.find(function (x) { return String(x.id) === String(id); });
    if (!c) return;
    S.sel = c;
    /* Todo lo del cliente en UNA pantalla. Es donde va a caer cada dato nuevo
       que se pida más adelante, sin tener que rediseñar nada. */
    $('cl-ficha').innerHTML =
      '<button class="cl-volver" id="cl-cerrar-ficha">← Volver a la lista</button>' +
      '<div class="cl-ficha-cab">' +
        '<div class="cl-ficha-n">' + esc(c.nombre || 'Sin nombre') + '</div>' +
        '<div class="cl-ficha-t">' + esc(c.telefono || '') +
          (c.barrio ? ' · ' + esc(c.barrio) : '') + '</div>' +
      '</div>' +
      '<div class="cl-kpis">' +
        tarjeta('Ha gastado', COP(c.gastado)) +
        tarjeta('Pedidos', String(c.pedidos || 0)) +
        tarjeta('Promedio por pedido', COP(c.promedio)) +
        tarjeta('Último pedido', haceCuanto(c.ultimo)) +
      '</div>' +
      '<div class="cl-kpis">' +
        tarjeta('Puntos disponibles', String(c.puntos || 0)) +
        tarjeta('Puntos redimidos', String(c.redimido || 0)) +
        (S.conPagina ? tarjeta('Saldo', COP(c.saldo)) : '') +
        (S.conPagina ? tarjeta('Ha recargado', COP(c.recargado) + ' · ' + (c.recargas || 0)) : '') +
      '</div>';
    $('cl-cerrar-ficha').addEventListener('click', function () { ir('todos'); });
    ir('ficha');
  }

  function pintarRecargas() {
    var real = 0, bono = 0, n = 0;
    S.recargas.forEach(function (f) {
      var v = Number(f.monto) || 0;
      if (f.motivo === 'bono_recarga') bono += v; else { real += v; n++; }
    });
    /* El bono va SEPARADO del total: la plata que entró de verdad son las
       recargas. Sumarlos daría un total que no existe en el banco. */
    $('cl-rc-kpis').innerHTML =
      tarjeta('Total recargado', COP(real)) +
      tarjeta('Recargas', String(n)) +
      tarjeta('Promedio', COP(n ? real / n : 0)) +
      tarjeta('Saldo extra regalado', COP(bono));

    var bonos = {};
    S.recargas.filter(function (f) { return f.motivo === 'bono_recarga'; }).forEach(function (f) {
      var ref = String(f.referencia || '').replace(/:bono$/, '');
      if (ref) bonos[ref] = (bonos[ref] || 0) + (Number(f.monto) || 0);
    });
    var recargas = S.recargas.filter(function (f) { return f.motivo === 'recarga'; });
    if (!recargas.length) {
      $('cl-rc-lista').innerHTML = '<div class="cl-vacio">No hay recargas en este periodo.</div>';
      return;
    }
    $('cl-rc-lista').innerHTML = recargas.map(function (f) {
      var cli = f.pos_clientes || {}, ref = String(f.referencia || '');
      var extra = bonos[ref] || 0;
      var como = /automatico/.test(String(f.detalle || '')) ? 'Verificada sola' : 'A mano';
      return '<div class="cl-fila">' +
        '<div><b>' + esc(cli.nombre || 'Cliente') + '</b><small>' + esc(cli.telefono || '') + '</small></div>' +
        '<div><small>' + fecha(f.created_at) + '</small></div>' +
        '<div><small>' + (ref ? 'Ref ' + esc(ref) : '—') + '</small></div>' +
        '<div><small>' + como + '</small></div>' +
        '<div><b>' + COP(f.monto) + '</b></div>' +
        '<div>' + (extra > 0 ? '<small class="cl-bono">+' + COP(extra) + '</small>' : '') + '</div>' +
      '</div>';
    }).join('');
  }

  function pintarSolicitudes() {
    var ps = S.solicitudes;
    if (!ps.length) {
      $('cl-sol-lista').innerHTML = '<div class="cl-vacio">No hay recargas pendientes 🎉</div>';
      return;
    }
    /* Cada una trae su comprobante: si el sistema no lo reconoció pero se ve
       correcto, Sergio lo aprueba aquí mismo. */
    $('cl-sol-lista').innerHTML = ps.map(function (p) {
      var cli = p.pos_clientes || {};
      return '<div class="cl-sol">' +
        '<div class="cl-sol-izq">' +
          '<b>' + esc(cli.nombre || 'Cliente') + '</b>' +
          '<small>' + esc(cli.telefono || '') + ' · ' + fecha(p.creado) + '</small>' +
          '<small>Dijo ' + COP(p.monto_dicho) + ' · el comprobante decía ' + COP(p.monto_leido) +
            (p.referencia ? ' · Ref ' + esc(p.referencia) : '') + '</small>' +
        '</div>' +
        (p.comprobante_url
          ? '<a class="cl-sol-img" href="' + esc(p.comprobante_url) + '" target="_blank" rel="noopener">' +
            '<img src="' + esc(p.comprobante_url) + '" alt="Comprobante"></a>' : '') +
        '<div class="cl-sol-der">' +
          '<button class="cl-btn ok" data-aprobar="' + esc(p.id) + '">Aprobar</button>' +
          '<button class="cl-btn no" data-rechazar="' + esc(p.id) + '">Descartar</button>' +
        '</div>' +
      '</div>';
    }).join('');

    document.querySelectorAll('[data-aprobar]').forEach(function (b) {
      b.addEventListener('click', function () { aprobar(b.dataset.aprobar); });
    });
    document.querySelectorAll('[data-rechazar]').forEach(function (b) {
      b.addEventListener('click', function () { rechazar(b.dataset.rechazar); });
    });
  }

  async function aprobar(id) {
    var p = S.solicitudes.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    var monto = Number(p.monto_leido) || Number(p.monto_dicho) || 0;
    if (!confirm('¿Acreditar ' + COP(monto) + ' a ' + ((p.pos_clientes || {}).nombre || 'este cliente') + '?')) return;
    try {
      /* Se acredita por la MISMA función que usa la verificación automática:
         así el bono y el libro salen idénticos, venga de donde venga. */
      var r = await sb.rpc('fn_recarga_aplicar', {
        p_tenant: tenantId, p_cliente: p.cliente_id, p_monto: monto,
        p_ref: p.referencia || ('manual:' + p.id), p_branch: branchId, p_como: 'a mano',
      });
      var f = (r.data || [])[0];
      if (!f || f.ok !== true) { alert((f && f.motivo) || 'No se pudo acreditar.'); return; }
      await sb.from('pos_recargas_solicitudes').update({ estado: 'aplicada' }).eq('id', p.id);
      /* EL AVISO AL CELULAR DEL CLIENTE (19-ago). Acreditar a mano tiene que
         sentirse igual que la verificacion automatica: si por un lado le llega
         el aviso y por el otro no, el cliente cree que su recarga no entro.
         Es best-effort: la plata ya quedo acreditada arriba. */
      try {
        fetch(SUPABASE_URL + '/functions/v1/avisar-cliente', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'recarga', cliente_id: p.cliente_id,
            monto: Number(f.acreditado) || monto, bono: Number(f.bono) || 0, saldo: Number(f.saldo) || 0,
          }),
        }).catch(function () {});
      } catch (e) { /* nunca estorba a la acreditacion */ }
      alert('Acreditado: ' + COP(f.acreditado) + (f.bono > 0 ? ' + ' + COP(f.bono) + ' de bono' : ''));
      await cargarSolicitudes(); pintarSolicitudes();
    } catch (e) { console.error(e); alert('No se pudo acreditar: ' + (e.message || e)); }
  }

  async function rechazar(id) {
    if (!confirm('¿Descartar esta solicitud? No se le acredita nada al cliente.')) return;
    try {
      await sb.from('pos_recargas_solicitudes').update({ estado: 'descartada' }).eq('id', id);
      await cargarSolicitudes(); pintarSolicitudes();
    } catch (e) { alert('No se pudo descartar.'); }
  }

  // ── Navegación ────────────────────────────────────────────────────
  async function ir(vista) {
    S.vista = vista;
    ['todos', 'ficha', 'recargas', 'solicitudes'].forEach(function (v) {
      var el = $('scr-' + v); if (el) el.hidden = (v !== vista);
      var nav = document.querySelector('[data-vista="' + v + '"]');
      if (nav) nav.classList.toggle('on', v === vista);
    });
    if (vista === 'todos')       pintarTodos();
    if (vista === 'recargas')    { await cargarRecargas(); pintarRecargas(); }
    if (vista === 'solicitudes') { await cargarSolicitudes(); pintarSolicitudes(); }
  }

  /* Se arranca con core:ready, NO con DOMContentLoaded: el tenant llega de la
     sesión de Supabase, que se resuelve después de que el HTML está listo. */
  window._pos.on('core:ready', async function () {
    sb       = window._pos.sb;
    tenantId = window._pos.state.tenantId;
    branchId = window._pos.state.branchId;
    if (!sb || !tenantId) { console.error('[clientes] sin sesión'); return; }

    /* Las pestañas de plata solo existen si el restaurante tiene página de
       clientes: sin página no hay recargas que ver. */
    try {
      var t = await sb.from('tenants').select('web_activa').eq('id', tenantId).maybeSingle();
      S.conPagina = !!(t.data && t.data.web_activa);
    } catch (e) { S.conPagina = false; }
    document.querySelectorAll('[data-solo-pagina]').forEach(function (el) { el.hidden = !S.conPagina; });

    document.querySelectorAll('[data-vista]').forEach(function (b) {
      b.addEventListener('click', function () { ir(b.dataset.vista); });
    });
    var buscar = $('cl-buscar');
    if (buscar) buscar.addEventListener('input', function () { S.filtro = this.value; pintarTodos(); });
    document.querySelectorAll('[data-rango]').forEach(function (b) {
      b.addEventListener('click', async function () {
        S.rango = b.dataset.rango;
        document.querySelectorAll('[data-rango]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        await cargarRecargas(); pintarRecargas();
      });
    });

    await cargarClientes();
    ir('todos');
  });
})();
