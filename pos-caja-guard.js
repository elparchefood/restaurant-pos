(function() {
  var _cache = null;
  var _cacheAt = 0;

  function _showModal() {
    if (document.getElementById('caja-guard-overlay')) return;
    var o = document.createElement('div');
    o.id = 'caja-guard-overlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.50);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:DM Sans,system-ui,sans-serif';
    o.innerHTML = [
      '<div style="background:#fff;border-radius:16px;padding:32px 28px 24px;max-width:340px;width:92%;box-shadow:0 8px 40px rgba(15,23,42,.22)">',
        '<div style="text-align:center;margin-bottom:22px">',
          '<div style="background:#FEF3C7;border-radius:12px;width:52px;height:52px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px">',
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
          '</div>',
          '<div style="font-size:16px;font-weight:700;color:#0F172A;margin-bottom:6px">Caja cerrada</div>',
          '<div style="font-size:13px;color:#64748B;line-height:1.55">Debes aperturar la caja antes de registrar ventas. Todas las ventas quedan guardadas en el cuadre de caja.</div>',
        '</div>',
        '<div style="display:flex;flex-direction:column;gap:10px">',
          '<button id="caja-guard-btn-open" style="background:#5B6BFF;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;width:100%">Abrir caja</button>',
          '<button id="caja-guard-btn-cancel" style="background:#F1F5F9;color:#64748B;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;width:100%">Cancelar</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(o);
    document.getElementById('caja-guard-btn-open').onclick = function() { window.location.href = 'caja.html'; };
    document.getElementById('caja-guard-btn-cancel').onclick = function() { o.remove(); };
    o.addEventListener('click', function(e) { if (e.target === o) o.remove(); });
  }

  window.cajaGuard = async function(branchId) {
    var now = Date.now();
    if (_cache !== null && (now - _cacheAt) < 60000) {
      if (!_cache) _showModal();
      return _cache;
    }

    /*  ══ ABRIR MESA NO ESPERA AL SERVIDOR (29-ago-2026) ═══════════════════

        Sergio: *"al tocar Abrir mesa debe abrir de inmediato"*. Lo que lo
        frenaba era este guardian: comprueba que la caja este abierta y tenia
        cache SOLO en memoria, que se borra en cada cambio de pantalla. Al
        recargar ventas volvia a preguntarle a la base ANTES de dejar pasar.

        La caja se abre UNA vez al dia y se cierra UNA vez. Guardar esa
        respuesta en el equipo por 10 minutos deja pasar al instante, y la
        comprobacion fresca corre por detras: si la caja se hubiera cerrado
        —cosa que hace la misma persona, en el mismo equipo— el aviso sale un
        momento despues y el guardian vuelve a su sitio. */
    var LL = 'pos.caja.abierta.v1';
    try {
      var g = JSON.parse(localStorage.getItem(LL) || 'null');
      if (g && g.branch === branchId && (now - g.en) < 600000) {
        _cache = !!g.abierta; _cacheAt = now;
        if (!g.abierta) _showModal();
        //  Se confirma por detras sin hacer esperar a nadie.
        setTimeout(function () { _preguntar(branchId, true); }, 0);
        return _cache;
      }
    } catch (e) {}

    return _preguntar(branchId, false);
  };

  async function _preguntar(branchId, porDetras) {
    var now = Date.now();
    var LL = 'pos.caja.abierta.v1';
    var sb = window._pos && window._pos.sb;
    if (!sb || !branchId) return true;

    try {
      var result = await sb.from('pos_sessions')
        .select('id')
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .limit(1);
      var open = !result.error && result.data && result.data.length > 0;
      _cache = open;
      _cacheAt = now;
      try { localStorage.setItem(LL, JSON.stringify({ branch: branchId, abierta: open, en: now })); } catch (e) {}
      //  Si venia de la copia y resulta que la caja se cerro, se avisa ahora.
      if (!open) _showModal();
      return open;
    } catch(e) {
      console.warn('[cajaGuard] error:', e);
      return true;
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') _cache = null;
  });
})();
