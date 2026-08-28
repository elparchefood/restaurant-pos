/* ══════════════════════════════════════════════════════════════════════════
   IMPRIMIR UNA NOTA
   ══════════════════════════════════════════════════════════════════════════
   Hay clientes que piden que les impriman un mensaje. Como el restaurante ya
   tiene la térmica, sale gratis — y con un marco alrededor deja de parecer un
   recibo y pasa a parecer un detalle.

   ⚠️ LA REGLA QUE MANDA SOBRE TODO LO DEMÁS (Sergio, 28-ago-2026):

       «La nota no debe llevar nada más que no haya dicho el cliente.»

   Ni una palabra puesta por nosotros dentro del mensaje. Nada de encabezados
   inventados, ni etiquetas, ni "cuenta regresiva", ni adornos que hablen del
   tema de ESA nota. El marco pone la línea y el asterisco; el texto lo pone el
   cliente, tal cual lo escribió.

   Y por eso mismo el marco tiene que servir para CUALQUIER nota: dibujar un
   calendario porque hoy alguien cuenta días es diseñar para un caso y estorbar
   en los otros noventa y nueve.

   La firma del negocio es lo único ajeno al mensaje, va aparte —abajo, chica—
   y se puede quitar.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* En térmica NO hay grises: todo sale negro o no sale. Los adornos van en
     línea gruesa y letra grande; una sombra o un degradado salen como un
     moteado sucio. Por eso aquí no hay un solo color que no sea #000. */
  var BASE =
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:Georgia,"Times New Roman",serif;width:80mm;max-width:80mm;' +
    'margin:0;padding:7mm 6mm;color:#000;background:#fff}' +
    '.t{font-size:19px;line-height:1.35;text-align:center;white-space:pre-wrap;' +
    'word-wrap:break-word;font-weight:700}' +
    '.f{font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:700;' +
    'letter-spacing:.18em;text-transform:uppercase;text-align:center;margin-top:5mm}' +
    '.r{border-top:1px solid #000}';

  /*  Las siete. Cada una recibe el texto YA escapado y devuelve el cuerpo.
      El orden es el que Sergio vio en la muestra, para que "la 7" siga siendo
      la 7 cuando hablemos de ellas. */
  var MARCOS = [
    { id: 'asteriscos', nombre: 'Asteriscos',
      pinta: function (t) {
        var a = '<div style="text-align:center;font-size:12px;letter-spacing:.3em;' +
                'line-height:1;overflow:hidden;white-space:nowrap">' +
                '&#10035; &#10035; &#10035; &#10035; &#10035; &#10035; &#10035; &#10035; &#10035; &#10035;</div>';
        return a + '<div class="t" style="margin:4mm 0">' + t + '</div>' + a;
      } },

    { id: 'marco', nombre: 'Marco doble',
      pinta: function (t) {
        return '<div style="border:1px solid #000;padding:1.6mm">' +
               '<div style="border:3px solid #000;padding:6mm 4mm">' +
               '<div class="t">' + t + '</div></div></div>';
      } },

    { id: 'banderines', nombre: 'Banderines',
      pinta: function (t) {
        var b = '';
        for (var i = 0; i < 7; i++) {
          b += '<i style="display:block;width:0;height:0;border-left:3.2mm solid transparent;' +
               'border-right:3.2mm solid transparent;border-top:6mm solid #000"></i>';
        }
        return '<div style="display:flex;justify-content:center;gap:3mm;margin-bottom:5mm">' + b + '</div>' +
               '<div class="t">' + t + '</div>' +
               '<div class="r" style="margin-top:5mm"></div>';
      } },

    { id: 'suelto', nombre: 'Sin adornos',
      pinta: function (t) {
        /* Alineada a la izquierda a propósito: es lo que la hace ver de
           revista y no de recibo. */
        return '<div class="t" style="font-size:26px;line-height:1.18;text-align:left;' +
               'letter-spacing:-.02em">' + t + '</div>' +
               '<div class="r" style="margin-top:6mm"></div>';
      } },

    { id: 'filigrana', nombre: 'Filigrana',
      pinta: function (t) {
        var o = '<div style="text-align:center;font-size:19px;line-height:1;' +
                'letter-spacing:.5em;text-indent:.5em">&#10086; &#10086; &#10086;</div>';
        return o + '<div class="t" style="margin:5mm 0">' + t + '</div>' + o;
      } },

    { id: 'maquina', nombre: 'Máquina de escribir',
      pinta: function (t) {
        return '<div class="r"></div>' +
               '<div class="t" style="font-family:\'Courier New\',Courier,monospace;' +
               'font-size:13.5px;line-height:1.85;text-align:left;margin:5mm 0">' + t + '</div>' +
               '<div class="r"></div>';
      } },

    { id: 'esquinas', nombre: 'Esquinas',
      pinta: function (t) {
        /* Enmarca sin encerrar, y se estira sola con lo larga que sea la nota:
           de las siete, la que mejor aguanta un texto de diez renglones. */
        var e = 'position:absolute;width:7mm;height:7mm;display:block';
        return '<div style="position:relative;padding:7mm 5mm">' +
          '<span style="' + e + ';top:0;left:0;border-top:2px solid #000;border-left:2px solid #000"></span>' +
          '<span style="' + e + ';top:0;right:0;border-top:2px solid #000;border-right:2px solid #000"></span>' +
          '<span style="' + e + ';bottom:0;left:0;border-bottom:2px solid #000;border-left:2px solid #000"></span>' +
          '<span style="' + e + ';bottom:0;right:0;border-bottom:2px solid #000;border-right:2px solid #000"></span>' +
          '<div class="t">' + t + '</div></div>';
      } },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /*  El papel completo, listo para la impresora o para la vista previa. */
  function armar(texto, marcoId, conFirma, negocio) {
    var m = null;
    for (var i = 0; i < MARCOS.length; i++) if (MARCOS[i].id === marcoId) m = MARCOS[i];
    if (!m) m = MARCOS[MARCOS.length - 1];
    var firma = (conFirma && negocio)
      ? '<div class="f">' + esc(negocio) + '</div>' : '';
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + BASE +
           '</style></head><body>' + m.pinta(esc(texto)) + firma + '</body></html>';
  }

  /*  El nombre del negocio para la firma. Se pregunta una vez y se recuerda:
      no vale la pena una consulta cada vez que alguien abre el cuadro. */
  var _negocio = null;
  async function negocioDe() {
    if (_negocio !== null) return _negocio;
    _negocio = '';
    try {
      var sbx = window.sb || (window._pos && window._pos.sb);
      if (!sbx) return _negocio;
      var tid = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
      var q = sbx.from('brands').select('name').order('created_at').limit(1);
      if (tid) q = q.eq('tenant_id', tid);
      var r = await q.maybeSingle();
      _negocio = (r && r.data && r.data.name) || '';
    } catch (e) {}
    return _negocio;
  }

  var _sel = 'esquinas', _firma = true;

  function vistaPrevia() {
    var caja = document.getElementById('nota-prev');
    var txt = document.getElementById('nota-txt');
    if (!caja || !txt) return;
    /* Se dibuja en un marco aislado y no dentro de la página: así la vista
       previa usa EXACTAMENTE el mismo HTML que va a la impresora, y no lo que
       los estilos de la pantalla de al lado le hagan por encima. */
    caja.srcdoc = armar(txt.value, _sel, _firma, _negocio || '');
  }

  function pintarMarcos() {
    var fila = document.getElementById('nota-marcos');
    if (!fila) return;
    fila.innerHTML = MARCOS.map(function (m) {
      return '<button type="button" data-marco="' + m.id + '" class="nota-chip' +
             (m.id === _sel ? ' on' : '') + '">' + esc(m.nombre) + '</button>';
    }).join('');
    Array.prototype.forEach.call(fila.querySelectorAll('[data-marco]'), function (b) {
      b.onclick = function () { _sel = b.dataset.marco; pintarMarcos(); vistaPrevia(); };
    });
  }

  window.posNotaAbrir = async function (textoInicial) {
    if (document.getElementById('nota-ov')) return;
    await negocioDe();

    var ov = document.createElement('div');
    ov.id = 'nota-ov';
    ov.innerHTML =
      '<style>' +
      '#nota-ov{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.42);' +
      'backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:"DM Sans",system-ui,sans-serif}' +
      '#nota-caja{background:#fff;border-radius:18px;width:720px;max-width:96vw;max-height:92vh;' +
      'overflow:auto;box-shadow:0 30px 70px -20px rgba(15,23,42,.4);padding:22px}' +
      '#nota-caja h3{margin:0 0 4px;font-size:17px;font-weight:800;color:#0F172A;letter-spacing:-.02em}' +
      '#nota-caja .sub{font-size:12.5px;color:#64748B;margin:0 0 16px;line-height:1.5}' +
      '#nota-txt{width:100%;min-height:92px;border:1px solid #ECEEF2;border-radius:11px;' +
      'padding:11px 13px;font-family:inherit;font-size:14.5px;line-height:1.5;color:#0F172A;' +
      'resize:vertical;outline:none}' +
      '#nota-txt:focus{border-color:#5B6BFF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}' +
      '.nota-lbl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
      'color:#94A3B8;margin:16px 0 7px;display:block}' +
      '#nota-marcos{display:flex;gap:7px;flex-wrap:wrap}' +
      '.nota-chip{border:1px solid #ECEEF2;background:#fff;border-radius:999px;padding:6px 13px;' +
      'font-family:inherit;font-size:12.5px;font-weight:600;color:#475569;cursor:pointer}' +
      '.nota-chip.on{background:#EEF2FF;border-color:#5B6BFF;color:#5B6BFF;font-weight:700}' +
      '#nota-prev{width:80mm;max-width:100%;height:300px;border:1px solid #ECEEF2;' +
      'border-radius:10px;background:#fff;display:block;margin:0 auto}' +
      '.nota-fila{display:flex;gap:9px;justify-content:space-between;align-items:center;margin-top:18px;flex-wrap:wrap}' +
      '.nota-btn{border:1px solid #ECEEF2;background:#fff;border-radius:11px;padding:10px 16px;' +
      'font-family:inherit;font-size:13.5px;font-weight:700;color:#475569;cursor:pointer}' +
      '.nota-btn.pri{background:#5B6BFF;border-color:#5B6BFF;color:#fff}' +
      '.nota-btn:disabled{opacity:.5;cursor:default}' +
      '</style>' +
      '<div id="nota-caja">' +
        '<h3>Imprimir una nota</h3>' +
        '<p class="sub">Se imprime tal cual lo escribas: el marco pone el adorno y ' +
        'nada más.</p>' +
        '<textarea id="nota-txt" placeholder="Escribe aqu&iacute; la nota del cliente&hellip;"></textarea>' +
        '<span class="nota-lbl">Marco</span>' +
        '<div id="nota-marcos"></div>' +
        '<span class="nota-lbl">As&iacute; va a salir</span>' +
        '<iframe id="nota-prev" title="Vista previa de la nota"></iframe>' +
        '<div class="nota-fila">' +
          '<button type="button" class="nota-btn" id="nota-firma"></button>' +
          '<span style="display:flex;gap:9px">' +
            '<button type="button" class="nota-btn" id="nota-cerrar">Cancelar</button>' +
            '<button type="button" class="nota-btn pri" id="nota-imprimir">Imprimir</button>' +
          '</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var txt = document.getElementById('nota-txt');
    txt.value = textoInicial || '';
    txt.oninput = vistaPrevia;

    function pintarFirma() {
      var b = document.getElementById('nota-firma');
      if (b) b.textContent = _firma ? 'Quitar la firma del negocio' : 'Poner la firma del negocio';
    }
    document.getElementById('nota-firma').onclick = function () {
      _firma = !_firma; pintarFirma(); vistaPrevia();
    };
    function cerrar() { var x = document.getElementById('nota-ov'); if (x) x.remove(); }
    document.getElementById('nota-cerrar').onclick = cerrar;
    ov.onmousedown = function (e) { if (e.target === ov) cerrar(); };

    document.getElementById('nota-imprimir').onclick = async function () {
      var t = (txt.value || '').trim();
      if (!t) { txt.focus(); return; }
      var b = this;
      b.disabled = true; b.textContent = 'Imprimiendo…';
      try {
        /* Va por la impresora de CAJA (`recibo`), no por la de cocina: una nota
           para el cliente no tiene nada que hacer saliendo entre las comandas. */
        await window.posPrintTicket(armar(t, _sel, _firma, _negocio || ''), 'recibo');
      } catch (e) { console.error('[nota] no se pudo imprimir:', e); }
      b.disabled = false; b.textContent = 'Imprimir';
      cerrar();
    };

    pintarMarcos();
    pintarFirma();
    vistaPrevia();
    txt.focus();
  };

  window.posNotaMarcos = function () {
    return MARCOS.map(function (m) { return { id: m.id, nombre: m.nombre }; });
  };
})();
