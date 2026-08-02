// ══════════════════════════════════════════════════════════════════
// SELECTOR DE CLIENTE — el MISMO de Domicilios, reutilizable
//
// Sergio: "el modal para seleccionar cliente debe ser el mismo que el de
// domicilios, y debe buscar en la misma base de datos".
//
// La base ya era la misma: las dos pantallas leen `pos_clientes` a traves de
// `window.posClientes`. Lo que faltaba era la ventana. Aqui esta el mismo
// diseno (lista con avatar, telefono y direccion, buscador que filtra al
// escribir, y crear cliente nuevo) empaquetado para que cualquier pantalla lo
// pueda abrir sin depender del CSS de Domicilios.
//
//   posClientePicker.abrir({ onPick: function (cliente) { ... } })
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var CSS = [
    '.pcp-ov{position:fixed;inset:0;background:rgba(15,23,42,.42);backdrop-filter:blur(2px);',
    '  display:flex;align-items:center;justify-content:center;z-index:100000;padding:24px;',
    "  font-family:'DM Sans',system-ui,sans-serif}",
    '.pcp-modal{background:#fff;border-radius:20px;box-shadow:0 24px 60px -12px rgba(15,23,42,.4);',
    '  display:flex;flex-direction:column;width:720px;max-width:100%;height:min(640px,calc(100vh - 48px));overflow:hidden}',
    '.pcp-head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #ECEEF2;flex-shrink:0}',
    '.pcp-title{font-size:20px;font-weight:800;color:#0F172A;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}',
    '.pcp-x{width:34px;height:34px;border-radius:9px;border:none;background:transparent;color:#64748B;display:flex;align-items:center;justify-content:center;cursor:pointer}',
    '.pcp-x:hover{background:#F1F5F9}',
    '.pcp-body{padding:22px 24px;overflow:hidden;display:flex;flex-direction:column;flex:1;min-height:0}',
    '.pcp-search{display:flex;gap:12px;margin-bottom:16px;flex-shrink:0}',
    '.pcp-searchbox{flex:1;display:flex;align-items:center;gap:9px;padding:0 14px;background:#F8FAFC;border:1px solid #ECEEF2;border-radius:14px;color:#94A3B8}',
    '.pcp-searchbox input{flex:1;border:none;background:transparent;outline:none;padding:12px 0;font-family:inherit;font-size:14px;color:#0F172A}',
    '.pcp-searchbox input::placeholder{color:#94A3B8}',
    '.pcp-new{padding:0 18px;border:none;border-radius:14px;background:#5B6BFF;color:#fff;font-family:inherit;',
    '  font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}',
    '.pcp-new:hover{background:#4F5BE3}',
    '.pcp-list{display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;min-height:0}',
    '.pcp-row{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid #ECEEF2;',
    '  border-radius:14px;cursor:pointer;text-align:left;width:100%;font-family:inherit;transition:border-color .12s,background .12s}',
    '.pcp-row:hover{border-color:#C7CDFF;background:#F8FAFF}',
    '.pcp-av{width:36px;height:36px;border-radius:10px;background:#EEF2FF;color:#5B6BFF;display:flex;align-items:center;',
    '  justify-content:center;font-weight:800;font-size:13px;flex-shrink:0}',
    '.pcp-main{flex:1;min-width:0}',
    '.pcp-name{font-size:14px;font-weight:700;color:#0F172A}',
    '.pcp-sub{font-size:12px;color:#64748B;margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.pcp-pts{font-size:11.5px;font-weight:800;color:#7C3AED;background:#F5F3FF;border:1px solid #DDD6FE;',
    '  padding:3px 8px;border-radius:7px;flex-shrink:0}',
    '.pcp-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;color:#94A3B8;font-size:13px}',
    '.pcp-foot{flex-shrink:0;border-top:1px solid #ECEEF2}',
    '.pcp-cancel{display:flex;align-items:center;justify-content:center;gap:8px;padding:18px;width:100%;background:#fff;',
    '  border:none;color:#64748B;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}',
    '.pcp-cancel:hover{background:#F8FAFC}',
    '.pcp-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.pcp-f{display:flex;flex-direction:column;gap:5px}',
    '.pcp-f.wide{grid-column:1 / -1}',
    '.pcp-lbl{font-size:11.5px;font-weight:700;color:#64748B}',
    '.pcp-in{border:1px solid #ECEEF2;border-radius:11px;padding:11px 12px;font-family:inherit;font-size:14px;color:#0F172A;outline:none;background:#fff}',
    '.pcp-in:focus{border-color:#5B6BFF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}',
    '.pcp-err{grid-column:1 / -1;color:#DC2626;font-size:12.5px;min-height:16px}'
  ].join('');

  function inyectarCSS() {
    if (document.getElementById('pcp-css')) return;
    var s = document.createElement('style');
    s.id = 'pcp-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function iniciales(n) {
    var p = String(n || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }
  function tel10(s) {
    var d = String(s == null ? '' : s).replace(/[^0-9]/g, '');
    return d.length > 10 ? d.slice(-10) : d;
  }
  var SVG = {
    user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    lupa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    tel: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    pin: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    mas: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>'
  };

  function sb() { return (window._pos && window._pos.sb) || (typeof window.sb !== 'undefined' ? window.sb : null); }

  // Puntos de cada cliente, en UNA sola consulta (no una por fila).
  async function mapaPuntos(tenantId) {
    var m = {};
    try {
      var r = await sb().from('pos_puntos').select('telefono,puntos').eq('tenant_id', tenantId);
      (r.data || []).forEach(function (x) {
        var t = tel10(x.telefono);
        if (t) m[t] = Number(x.puntos) || 0;
      });
    } catch (e) { /* sin puntos, la lista igual sirve */ }
    return m;
  }

  async function abrir(opts) {
    opts = opts || {};
    inyectarCSS();
    var tenantId = opts.tenantId || (window._pos && window._pos.state && window._pos.state.tenantId);
    var branchId = opts.branchId || (window._pos && window._pos.state && window._pos.state.branchId);

    var ov = document.createElement('div');
    ov.className = 'pcp-ov';
    ov.innerHTML =
      '<div class="pcp-modal">'
    +   '<div class="pcp-head">'
    +     '<div class="pcp-title">' + SVG.user + ' Selecciona un cliente</div>'
    +     '<button class="pcp-x" data-pcp-close>' + SVG.x + '</button>'
    +   '</div>'
    +   '<div class="pcp-body">'
    +     '<div class="pcp-search">'
    +       '<div class="pcp-searchbox">' + SVG.lupa
    +         '<input type="text" id="pcp-q" placeholder="Buscar por nombre, teléfono (cualquiera de los dos) o dirección..." autocomplete="off">'
    +       '</div>'
    +       '<button class="pcp-new" id="pcp-nuevo">' + SVG.mas + ' Crear nuevo cliente</button>'
    +     '</div>'
    +     '<div class="pcp-list" id="pcp-list"><div class="pcp-empty">Cargando…</div></div>'
    +   '</div>'
    +   '<div class="pcp-foot"><button class="pcp-cancel" data-pcp-close>' + SVG.x + ' Cancelar</button></div>'
    + '</div>';
    document.body.appendChild(ov);

    function cerrar() { ov.remove(); }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-pcp-close]'))) cerrar();
    });

    // ── Datos: la MISMA fuente que Domicilios ──
    var lista = [], puntos = {};
    try {
      if (window.posClientes) {
        window.posClientes.setCtx(tenantId, branchId);
        lista = await window.posClientes.cargar();
      }
    } catch (e) { console.warn('[picker] clientes:', e && e.message); }
    puntos = await mapaPuntos(tenantId);

    var listaEl = document.getElementById('pcp-list');
    var inp = document.getElementById('pcp-q');

    function dirDe(c) {
      if (c.dir) return c.dir;
      var d = (c.direcciones || [])[0];
      return (d && (d.dir || d.direccion)) || '';
    }

    function pintar(q) {
      var lq = String(q || '').trim().toLowerCase();
      // Al escribir un número filtra por teléfono; también por nombre y dirección.
      var l = lq
        ? lista.filter(function (c) {
            // Busca tambien por el segundo numero: si el cliente escribe
            // desde el otro celular, hay que poder encontrarlo igual.
            return (String(c.nombre || '') + ' ' + String(c.tel || '') + ' ' + String(c.tel2 || '') + ' ' + dirDe(c))
              .toLowerCase().indexOf(lq) >= 0;
          })
        : lista;
      if (!l.length) {
        listaEl.innerHTML = '<div class="pcp-empty">'
          + (lq ? 'Sin coincidencias con “' + esc(q) + '”' : 'Todavía no hay clientes guardados')
          + '</div>';
        return;
      }
      listaEl.innerHTML = l.slice(0, 300).map(function (c, i) {
        var pts = puntos[tel10(c.tel)] || 0;
        return '<button type="button" class="pcp-row" data-i="' + i + '">'
          + '<span class="pcp-av">' + esc(iniciales(c.nombre)) + '</span>'
          + '<span class="pcp-main">'
          +   '<span class="pcp-name">' + esc(c.nombre || 'Cliente') + '</span>'
          +   '<span class="pcp-sub">' + SVG.tel + ' ' + esc(c.tel || '—')
          +     ' · ' + SVG.pin + ' ' + esc(dirDe(c) || 'Sin dirección') + '</span>'
          + '</span>'
          + (pts > 0 ? '<span class="pcp-pts">' + pts.toLocaleString('es-CO') + ' pts</span>' : '')
          + '</button>';
      }).join('');
      listaEl._vista = l;
    }

    pintar('');
    setTimeout(function () { inp.focus(); }, 40);
    inp.addEventListener('input', function () { pintar(inp.value); });

    listaEl.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.pcp-row');
      if (!row) return;
      var c = (listaEl._vista || [])[Number(row.dataset.i)];
      if (!c) return;
      cerrar();
      if (opts.onPick) opts.onPick(c);
    });

    document.getElementById('pcp-nuevo').addEventListener('click', function () {
      formNuevo(ov, tenantId, branchId, inp.value, function (c) {
        cerrar();
        if (opts.onPick) opts.onPick(c);
      });
    });
  }

  // Alta rápida. Guarda por `posClientes` — la MISMA tabla que usa Domicilios,
  // así el cliente creado aquí aparece allá y al revés.
  function formNuevo(ov, tenantId, branchId, prefill, onOk) {
    var body = ov.querySelector('.pcp-body');
    var title = ov.querySelector('.pcp-title');
    title.innerHTML = SVG.user + ' Nuevo cliente';
    var telPre = /^[0-9\s+()-]+$/.test(String(prefill || '')) ? tel10(prefill) : '';
    var nomPre = telPre ? '' : String(prefill || '');
    body.innerHTML =
        '<div class="pcp-form">'
      +   '<div class="pcp-f"><span class="pcp-lbl">Nombre</span><input class="pcp-in" id="pcp-n" placeholder="Nombre del cliente" value="' + esc(nomPre) + '"></div>'
      +   '<div class="pcp-f"><span class="pcp-lbl">Teléfono</span><input class="pcp-in" id="pcp-t" type="tel" inputmode="numeric" placeholder="Número de celular" value="' + esc(telPre) + '"></div>'
      +   '<div class="pcp-f"><span class="pcp-lbl">Otro teléfono</span><input class="pcp-in" id="pcp-t2" type="tel" inputmode="numeric" placeholder="Opcional, solo contacto"></div>'
      +   '<div class="pcp-f"><span class="pcp-lbl">Barrio</span><input class="pcp-in" id="pcp-b" placeholder="Barrio (opcional)"></div>'
      +   '<div class="pcp-f"><span class="pcp-lbl">Dirección</span><input class="pcp-in" id="pcp-d" placeholder="Dirección (opcional)"></div>'
      +   '<div class="pcp-err" id="pcp-e"></div>'
      +   '<div class="pcp-f wide"><button class="pcp-new" id="pcp-save" style="padding:13px;justify-content:center">Guardar cliente</button></div>'
      + '</div>';
    var err = document.getElementById('pcp-e');
    setTimeout(function () { (telPre ? document.getElementById('pcp-n') : document.getElementById('pcp-t')).focus(); }, 40);

    document.getElementById('pcp-save').addEventListener('click', async function () {
      var nombre = String(document.getElementById('pcp-n').value || '').trim();
      var tel = tel10(document.getElementById('pcp-t').value);
      var barrio = String(document.getElementById('pcp-b').value || '').trim();
      var dir = String(document.getElementById('pcp-d').value || '').trim();
      if (tel.length < 7) { err.textContent = 'Escribe un número de celular válido.'; return; }
      this.disabled = true; this.textContent = 'Guardando…';
      try {
        var c = {
          nombre: nombre || ('Cliente ' + tel.slice(-4)),
          tel: tel, tel2: tel10(document.getElementById('pcp-t2').value), barrio: barrio,
          direcciones: dir ? [{ id: 'd' + Date.now(), dir: dir, barrio: barrio }] : [],
        };
        var guardado = await window.posClientes.guardar(c);
        onOk(guardado || c);
      } catch (e) {
        this.disabled = false; this.textContent = 'Guardar cliente';
        err.textContent = 'No se pudo guardar: ' + (e.message || e);
      }
    });
  }

  window.posClientePicker = { abrir: abrir };
})();
