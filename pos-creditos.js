/* ══════════════ pos-creditos.js — CRÉDITOS ══════════════
   El crédito es un MÉTODO DE PAGO, no un pedido a medio pagar. El pedido queda
   pagado, la caja cuadra, y la deuda vive en la PERSONA (cliente o empleado).
   Por eso en ninguna parte se usa la palabra "fiado".

   Quién hace qué:
     · Configuración → Créditos : el administrador asigna los cupos
     · Caja → Créditos          : se ven saldos y se registran abonos
     · Cobro                    : "Crédito" como método, valida el cupo

   Las reglas duras (cupo, concurrencia, saldo nunca negativo) viven en la BASE
   —`fn_credito_consumir` y `fn_credito_abonar`—, no aquí. Este archivo solo
   habla con ellas.                                                          */
(function () {
  'use strict';

  function sb() { return window._pos && window._pos.sb; }
  var CTX = { tenantId: null, branchId: null };
  function setCtx(t, b) { CTX.tenantId = t || null; CTX.branchId = b || null; }

  var COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  function money(n) { return COP.format(Math.round(Number(n) || 0)); }

  /* Lista de créditos. tipo: 'cliente' | 'empleado' | null (todos). */
  async function listar(tipo) {
    var s = sb(); if (!s) return [];
    var q = s.from('v_creditos').select('*').order('nombre', { ascending: true });
    if (CTX.branchId) q = q.eq('branch_id', CTX.branchId);
    if (tipo) q = q.eq('tipo', tipo);
    var r = await q;
    if (r.error) throw r.error;
    return r.data || [];
  }

  /* Solo los que pueden pagar con crédito ahora mismo. */
  async function disponibles() {
    return (await listar()).filter(function (c) { return c.activo && Number(c.disponible) > 0; });
  }

  async function guardar(c) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var fila = {
      tenant_id: CTX.tenantId, branch_id: CTX.branchId,
      tipo: c.tipo || 'cliente',
      cliente_id: c.cliente_id || null,
      nombre: (c.nombre || '').trim(),
      telefono: (c.telefono || '').trim() || null,
      documento: (c.documento || '').trim() || null,
      cupo: Number(c.cupo) || 0,
      activo: c.activo !== false,
      notas: (c.notas || '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!fila.nombre) throw new Error('El nombre es obligatorio');
    var r = c.id
      ? await s.from('pos_creditos').update(fila).eq('id', c.id).select().maybeSingle()
      : await s.from('pos_creditos').insert(fila).select().maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }

  /* Se desactiva, NO se borra: sus movimientos son historia contable. */
  async function desactivar(id) {
    var s = sb();
    var r = await s.from('pos_creditos').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', id);
    if (r.error) throw r.error;
  }

  async function movimientos(creditoId, limite) {
    var s = sb();
    var r = await s.from('pos_credito_movimientos').select('*')
      .eq('credito_id', creditoId).order('created_at', { ascending: false }).limit(limite || 50);
    if (r.error) throw r.error;
    return r.data || [];
  }

  /* Pagar un pedido con crédito. Si no alcanza el cupo, la base lanza
     CREDITO_INSUFICIENTE|disponible|cupo|saldo y aquí se traduce a algo que el
     cajero entienda. */
  async function consumir(creditoId, monto, orderId, quien, nota) {
    var s = sb();
    var r = await s.rpc('fn_credito_consumir', {
      p_credito: creditoId, p_monto: monto, p_order: orderId || null,
      p_quien: quien || null, p_nota: nota || null,
    });
    if (r.error) throw traducir(r.error);
    return (r.data && r.data[0]) || {};
  }

  async function abonar(creditoId, monto, metodo, sessionId, quien, nota) {
    var s = sb();
    var r = await s.rpc('fn_credito_abonar', {
      p_credito: creditoId, p_monto: monto, p_metodo: metodo || 'efectivo',
      p_session: sessionId || null, p_quien: quien || null, p_nota: nota || null,
    });
    if (r.error) throw traducir(r.error);
    return (r.data && r.data[0]) || {};
  }

  /* El error de la base trae los números; aquí se vuelve un mensaje humano. */
  function traducir(err) {
    var msg = (err && (err.message || err.hint || '')) || '';
    var m = /CREDITO_INSUFICIENTE\|([\d.]+)\|([\d.]+)\|([\d.]+)/.exec(msg);
    if (m) {
      var e = new Error('Crédito insuficiente');
      e.codigo = 'CREDITO_INSUFICIENTE';
      e.disponible = Number(m[1]); e.cupo = Number(m[2]); e.saldo = Number(m[3]);
      e.detalle = 'Tiene ' + money(e.disponible) + ' disponibles de un cupo de ' + money(e.cupo)
                + '. Debe ' + money(e.saldo) + '.';
      return e;
    }
    return err instanceof Error ? err : new Error(msg || 'No se pudo completar');
  }

  /* Modal de "crédito insuficiente". Solo informa: ampliar el cupo es un acto
     del administrador desde Configuración, no algo que se salte en el cobro. */
  function modalInsuficiente(err, nombre) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:22px 24px;width:380px;max-width:94vw;font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35)">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
      +   '<span style="width:36px;height:36px;border-radius:10px;background:#FEF2F2;color:#DC2626;display:flex;align-items:center;justify-content:center">'
      +     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg></span>'
      +   '<div style="font-size:16px;font-weight:800;color:#0F172A">Crédito insuficiente</div>'
      + '</div>'
      + '<div style="font-size:13px;color:#475569;line-height:1.6">'
      +   (nombre ? '<b>' + esc(nombre) + '</b> no tiene cupo para este pedido.<br>' : '')
      +   esc(err.detalle || '') + '</div>'
      + '<div style="font-size:12.5px;color:#64748B;line-height:1.55;margin-top:12px;background:#F8FAFC;border-radius:10px;padding:10px 12px">'
      +   'Para ampliarle el cupo, un administrador debe hacerlo en <b>Configuración → Créditos</b>. '
      +   'También puede abonar a su deuda desde <b>Caja → Créditos</b>.</div>'
      + '<button style="width:100%;margin-top:16px;padding:11px;border:none;border-radius:10px;background:#0F172A;color:#fff;font-weight:700;font-size:13.5px;cursor:pointer">Entendido</button>'
      + '</div>';
    ov.querySelector('button').onclick = function () { ov.remove(); };
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.posCreditos = {
    setCtx: setCtx, listar: listar, disponibles: disponibles,
    guardar: guardar, desactivar: desactivar, movimientos: movimientos,
    consumir: consumir, abonar: abonar,
    modalInsuficiente: modalInsuficiente, money: money, esc: esc,
  };
})();
