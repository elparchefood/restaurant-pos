// pos-print.js — Sistema compartido de impresion (C5, C6, C8)
// Modal de impresion con 3 opciones + comanda auto al enviar a cocina
// RF4: un solo lugar, reutilizable desde tomar-pedido y pagos
(function() {
  'use strict';

  var MODELS_KEY = 'pos.config.recibos.v1';

  // Estado de pago para impresos: PAGADO / ABONADO+COBRAR / COBRAR.
  // Usa order.paid (pos_orders.paid_amount) — las transferencias verificadas por
  // el bot y los abonos de caja llegan aquí. Sin datos → no imprime nada.
  function _pagoEstadoHtml(order) {
    if (!order || order.paid === undefined || order.total === undefined) return '';
    var total = Number(order.total || 0), paid = Number(order.paid || 0);
    if (total <= 0) return '';
    var f = function(n){ return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
    // Sin repetir el TOTAL DEL PEDIDO: ya sale en la tabla de totales, dos
    // lineas mas arriba. Y sin asteriscos, que solo hacian ruido.
    var caja = 'text-align:center;font-weight:900;border:2px solid #000;border-radius:9px;padding:6px;margin:6px 0;';
    if (paid >= total) return '<div style="' + caja + 'font-size:15px">PAGADO<br><span style="font-size:11px;font-weight:700">No cobrar nada</span></div>';
    if (paid > 0)      return '<div style="' + caja + 'font-size:13px">Ya abonó ' + f(paid) + '<br>COBRAR: ' + f(total - paid) + '</div>';
    return '<div style="' + caja + 'font-size:14px">COBRAR: ' + f(total) + '</div>';
  }

  function _buildComanda(order, items) {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    var dateStr = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate())
      + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

    var mesa = (order.table || '-').toUpperCase();
    var mesaMatch = mesa.match(/^T(\d+)$/);
    if (mesaMatch) mesa = String(parseInt(mesaMatch[1], 10));
    var pax    = order.guests  || 0;
    var waiter = (order.waiter || '').toUpperCase();
    var sala   = (order.sala   || '').toUpperCase();
    var channel = (order.channel || '').toUpperCase();
    var isParaLlevar = channel.indexOf('LLEVAR') >= 0;
    var isDomicilio  = channel === 'DOMICILIO';
    var isRapido     = channel === 'RAPIDO';
    var _notes = order.notes || '';
    /*  EL CONJUNTO MANDA SOBRE EL BARRIO (Sergio, 28-ago-2026).

        Un barrio agrupa cientos de casas; un conjunto es UN sitio con
        porteria. Cuando el pedido va a uno, el nombre del conjunto dice mucho
        mas — y en un barrio grande, cuatro comandas seguidas salian todas
        con el mismo titulo.

        Va igual que en la PANTALLA de cocina, a proposito: el papel y la
        pantalla tienen que decir lo mismo, o el que mira una y el que mira la
        otra estan hablando de comandas distintas.                         */
    var _conjMatch = _notes.match(/\[conjunto:([^\]]+)\]/i);
    var _barrioMatch = _notes.match(/\[barrio:([^\]]+)\]/i);
    var _barrio = (_conjMatch && _conjMatch[1].trim())
      || (_barrioMatch ? _barrioMatch[1] : '');
    // Etiqueta de venta rápida (Espera / Avisar / …) — se guarda en notes
    var _etqMatch = _notes.match(/\[etq:([^\]]+)\]/i);
    var _etq = _etqMatch ? _etqMatch[1] : '';

    var _customerName = (order.customer_name || '').toUpperCase();

    var rows = (items || []).map(function(it) {
      var qty  = it.qty || 1;
      var name = (it.name || 'Item').toUpperCase();
      var line = '(' + qty + ') ' + name;
      var modsHtml = (it.mods && it.mods.length)
        ? it.mods.map(function(m) {
            /* La adicion llega de DOS formas segun quien imprime: como texto
               (la comanda automatica) o como objeto {name, qty, price} (la
               reimpresion, que arma los items pensando en el recibo). Con
               String(m) a secas, el objeto salia "+ [OBJECT OBJECT]" en la
               cocina — paso el 20-ago con el Super Queso de Fernanda. */
            var txt = (m && typeof m === 'object')
              ? (((Number(m.qty) || 1) > 1 ? (Number(m.qty)) + 'x ' : '') + (m.name || ''))
              : String(m);
            return '<div style="font-style:italic;font-size:12px;font-weight:700;margin-left:10px;margin-top:1px;margin-bottom:3px;">+ ' + txt.toUpperCase() + '</div>';
          }).join('')
        : '';
      var noteText = it.notes || it.note || '';
      var note = noteText
        ? '<div style="font-style:italic;font-size:12px;font-weight:700;margin-left:10px;margin-top:1px;margin-bottom:5px;">NOTA - ' + noteText.toUpperCase() + '</div>'
        : '';
      return '<div style="font-size:15px;font-weight:700;margin:5px 0 2px;line-height:1.3;">' + line + '</div>' + modsHtml + note;
    }).join('');

    function sep(text) {
      return '<div style="position:relative;margin:8px 0 5px;">'
        + '<div style="border-top:1px dashed #000;"></div>'
        + '<div style="position:absolute;top:-9px;left:0;right:0;text-align:center;">'
        + '<span style="background:#fff;padding:0 5px;font-size:10px;font-weight:400;letter-spacing:0.5px;">' + text + '</span>'
        + '</div></div><div style="height:5px;"></div>';
    }

    var paraLlevar = isParaLlevar
      ? '<div style="text-align:center;font-size:13px;font-weight:900;margin:2px 0 5px;">==== PARA LLEVAR ====</div>'
      : '';

    return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;width:' + _anchoMM + 'mm;max-width:' + _anchoMM + 'mm;margin:0;padding:6px 8px;color:#000;line-height:1.35;}</style>'
      + '</head><body>'
      // VENTA RÁPIDA: título + etiqueta. El barrio NO se imprime (solo sirve al
      // repartidor) y el cliente baja al bloque de datos, alineado a la izquierda.
      + (isRapido
          ? '<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:2px;">VENTA RAPIDA</div>'
            + (_etq ? '<div style="font-size:14px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:2px;">' + _etq + '</div>' : '')
          : isDomicilio
            ? (_barrio
                ? '<div style="font-size:13px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:1px;">DOMICILIO</div>'
                  + '<div style="font-size:24px;font-weight:900;text-align:center;margin-bottom:2px;">' + _barrio + '</div>'
                  + (_customerName ? '<div style="font-size:14px;font-weight:700;text-align:center;margin-bottom:2px;">' + _customerName + '</div>' : '')
                : '<div style="font-size:20px;font-weight:900;text-align:center;margin-bottom:2px;">DOMICILIO</div>'
                  + (_customerName ? '<div style="font-size:14px;font-weight:700;text-align:center;margin-bottom:2px;">' + _customerName + '</div>' : ''))
            : '<div style="font-size:20px;font-weight:900;text-align:center;margin-bottom:2px;">MESA ' + mesa + '</div>')
      + (!isDomicilio && !isRapido && pax ? '<div style="font-size:13px;font-weight:700;padding-left:55%;">( ' + pax + ' PAX)</div>' : '')
      + '<div style="height:5px;"></div>'
      /*  El area de la hoja. Con un solo sitio de preparacion dice COCINA
          como siempre; con varios dice cual, que es lo que hace que dos
          hojas del mismo pedido no se confundan sobre el mesón. */
      + '<div>AREA - ' + String(order.area || 'COCINA').toUpperCase() + '</div>'
      + '<div>FECHA: ' + dateStr + '</div>'
      + (isRapido && _customerName ? '<div>CLIENTE - ' + _customerName + '</div>' : '')
      + (waiter ? '<div>' + (isDomicilio || isRapido ? 'CAJERO' : 'MESERO') + ' - ' + waiter + '</div>' : '')
      + (sala   ? '<div>SALA - '   + sala   + '</div>' : '')
      + sep('INICIO PEDIDO')
      + paraLlevar
      + rows
      + sep('FIN PEDIDO')
      + '</body></html>';
  }

  // Aqui vivian _buildReceiptDesc y _buildReceiptFinal, los recibos viejos de
  // mesa. Se borraron al unificar: a _buildReceiptDesc no lo llamaba nadie
  // desde hacia tiempo, y _buildReceiptFinal quedo reemplazado por el recibo
  // comun, que ademas lleva encabezado del negocio, adiciones, notas y puntos.
  // La propina y el desglose de pago que solo tenia mesa se conservaron alli.

  // ── RECIBO DEL CLIENTE (domicilio / venta rapida / mesa) ──
  function _money(n){ return '$' + Number(Math.round(n||0)).toLocaleString('es-CO'); }

  // `solo` = fue el unico pago: entonces la fila se llama "Efectivo", como en
  // cualquier recibo de caja. Si hubo varios metodos NO puede llamarse igual:
  // arriba ya hay una linea "Efectivo" con lo que se aplico a la cuenta, y dos
  // lineas "Efectivo" con numeros distintos se contradicen. Ahi va "Recibido".
  function _vueltoFilas(p, solo) {
    var met = String((p && p.method) || '').toLowerCase();
    if (met.indexOf('efect') < 0) return '';
    var recibido = Number(p.received || 0), cambio = Number(p.vuelto || 0);
    if (!(cambio > 0) || !(recibido > 0)) return '';
    // Con varios metodos solo va el cambio: arriba ya esta lo que se abono en
    // efectivo, y sumandole el cambio se sabe con cuanto pago. Una fila mas
    // seria decir lo mismo con otro numero.
    var sangria = solo ? '' : 'padding-left:14px;';
    var fila1 = solo
      ? '<tr><td style="font-size:12px;color:#333">Efectivo</td><td class="pcol" style="font-size:12px">'+_money(recibido)+'</td></tr>'
      : '';
    return fila1
         + '<tr><td style="font-size:12.5px;'+sangria+'font-weight:800">Cambio</td><td class="pcol" style="font-size:12.5px;font-weight:800">'+_money(cambio)+'</td></tr>';
  }

  function _buildReceiptDomicilio(order, items, branch, payments) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    var dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    branch = branch || {};
    var negocio = (branch.brand_name || branch.name || 'Recibo').toUpperCase();
    var dirLocal = branch.address || '';
    var telLocal = branch.phone || '';
    // Datos del cliente desde notes: dirección + [barrio:X] + [tel:Y] (· Ref:… se ignora)
    var notes = String(order.notes || '');
    var mB = notes.match(/\[barrio:([^\]]+)\]/i); var barrio = mB ? mB[1] : '';
    /*  El conjunto y la casa SON la direccion cuando no hay calle. Antes se
        quitaban solo `[barrio:]`, `[tel:]` y `[etq:]`, asi que en un pedido a
        un conjunto la direccion del recibo salia con los corchetes crudos
        — «[conjunto:Llanos De Calibio][unidad:32]»— o vacia. Ahora se leen y
        se escriben como lo que son.                                       */
    var mCj = notes.match(/\[conjunto:([^\]]+)\]/i); var conjunto = mCj ? mCj[1].trim() : '';
    var mUn = notes.match(/\[unidad:([^\]]+)\]/i);   var unidad   = mUn ? mUn[1].trim() : '';
    var mT = notes.match(/\[tel:([^\]]+)\]/i);    var telCli = mT ? mT[1] : (order.customer_phone || '');
    var dirCli = notes.replace(/\[conjunto:[^\]]+\]/ig,'').replace(/\[unidad:[^\]]+\]/ig,'').replace(/\[barrio:[^\]]+\]/ig,'').replace(/\[tel:[^\]]+\]/ig,'').replace(/\[etq:[^\]]+\]/ig,'').replace(/·\s*Ref:\S+/ig,'').trim();
    //  El conjunto va DELANTE de la calle: es lo que ubica, y la calle (si la
    //  hay) es la referencia de como llegar.
    dirCli = [conjunto, unidad, dirCli].filter(Boolean).join(' · ');
    var esLlevar = String(order.channel||'').toLowerCase().indexOf('rapid')>=0 || /para\s+llevar|recog/i.test(dirCli);
    /* OJO con el guion: cuando el pedido no tiene mesa, `_tableDisplay`
       devuelve "-", que NO esta vacio. Con `!!order.table` todos los
       domicilios se tomaban por pedidos de mesa: salian titulados "RECIBO DE
       MESA", con "Mesa: -", y sin direccion ni barrio, porque la rama de mesa
       no los imprime. El domiciliario salia con un recibo sin direccion. */
    var mesaTxt = String(order.table == null ? '' : order.table).trim();
    if (mesaTxt === '-' || mesaTxt === '—') mesaTxt = '';
    var esMesa = String(order.channel||'').toLowerCase() === 'mesa' || (!!mesaTxt && !esLlevar);
    var num = '#' + String(order.id||'').slice(-5).toUpperCase();

    var itemRows = (items||[]).map(function(it){
      var qty = it.qty || 1;
      var line = _money(it.total || 0);
      // Las adiciones con su cantidad y su precio. Antes salia solo "+ Papas",
      // sin decir cuanto costo, y el cliente no entendia de donde salia el
      // total. El precio va ENTRE PARENTESIS porque ya esta dentro del valor
      // de la linea: con un "+ $8.000" pareceria que hay que sumarlo aparte.
      var mods = (it.mods && it.mods.length)
        ? it.mods.map(function(m){
            var nom = (m && m.name) ? m.name : String(m);
            var cuantos = ((m && m.qty) || 1) * qty;
            var vale = (m && m.price) ? m.price * cuantos : 0;
            return '<div style="font-size:11px;color:#333;padding-left:14px">+ '
                 + (cuantos > 1 ? cuantos + 'x ' : '') + nom
                 + (vale > 0 ? ' (' + _money(vale) + ')' : '')
                 + '</div>';
          }).join('')
        : '';
      // La nota del producto ("SIN AJO", "poca salsa"), en negrilla: es lo que
      // mas reclama el cliente si sale mal. Nunca se imprimia porque el recibo
      // pedia it.note y en la base la columna se llama notes.
      var nota = it.notes ? '<div style="font-size:11px;font-weight:700;padding-left:14px">Nota: '+it.notes+'</div>' : '';
      return '<tr><td style="padding:3px 0;vertical-align:top">'+qty+'x '+(it.name||'Item')+mods+nota+'</td>'
           + '<td class="pcol" style="padding:3px 0">'+line+'</td></tr>';
    }).join('');

    var subtotal = Number(order.subtotal || 0) || (items||[]).reduce(function(a,it){return a+(it.total||0);},0);
    var empaque  = Number(order.packaging_fee || 0);
    var domi     = Number(order.delivery_fee || 0);
    var descuento= Number(order.discount || 0);
    var total    = Number(order.total || 0) || (subtotal+empaque+domi-descuento+Number(order.tip||0));
    var footer = '';
    try { footer = localStorage.getItem('pos.config.recibo.footer') || ''; } catch(e){}
    if (!footer) footer = '¡Gracias por tu pedido!';   // sin emoji: lo pone cada restaurante en su pie

    var sep = '<div style="border-top:1px dashed #000;margin:7px 0"></div>';
    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:12.5px;width:' + _anchoMM + 'mm;max-width:' + _anchoMM + 'mm;margin:0;padding:8px 6px;color:#000;line-height:1.35}table{width:100%;border-collapse:collapse}td{word-break:break-word}.pcol{width:26%;white-space:nowrap;text-align:right;vertical-align:top}</style></head><body>';
    // Encabezado del negocio
    h += '<div style="text-align:center;margin-bottom:2px"><div style="font-size:17px;font-weight:900;letter-spacing:.5px">'+negocio+'</div>';
    if (dirLocal) h += '<div style="font-size:10.5px;color:#333">'+dirLocal+'</div>';
    if (telLocal) h += '<div style="font-size:10.5px;color:#333">Tel: '+telLocal+'</div>';
    h += '</div>'+sep;
    // Título + pedido
    var titulo = esMesa ? 'RECIBO DE MESA' : (esLlevar ? 'RECIBO · PARA LLEVAR' : 'RECIBO DE DOMICILIO');
    h += '<div style="text-align:center"><div style="font-size:13px;font-weight:800">'+titulo+'</div>'
       + '<div style="font-size:11px;color:#333">Pedido '+num+' · '+dateStr+' '+timeStr+'</div></div>'+sep;
    if (esMesa) {
      // En mesa lo primero es DONDE, que es lo que busca el mesero al repartir
      // las cuentas. El cliente va despues y solo si lo seleccionaron.
      h += '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase">'
         + ((Number(order.table_n) || 1) > 1 ? 'Mesas' : 'Mesa') + '</div>';
      h += '<div style="font-size:13px;font-weight:700">'+(mesaTxt||'—')+'</div>';
      var linea2 = [];
      if (order.sala)   linea2.push(order.sala);
      if (order.guests) linea2.push(order.guests + (order.guests === 1 ? ' persona' : ' personas'));
      if (order.waiter) linea2.push('Atendió ' + order.waiter);
      if (linea2.length) h += '<div style="font-size:12px">'+linea2.join(' · ')+'</div>';
      if (order.customer_name) {
        h += '<div style="font-size:12px;margin-top:3px">Cliente: <b>'+order.customer_name+'</b></div>';
        if (telCli) h += '<div style="font-size:12px">Tel: '+telCli+'</div>';
        if (order.customer_phone2) h += '<div style="font-size:12px">Otro: '+order.customer_phone2+'</div>';
      }
    } else {
      // Cliente
      h += '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase">Cliente</div>';
      h += '<div style="font-size:13px;font-weight:700">'+(order.customer_name||'—')+'</div>';
      if (telCli) h += '<div style="font-size:12px">Tel: '+telCli+'</div>';
      // Segundo numero del cliente, solo si lo tiene guardado.
      if (order.customer_phone2) h += '<div style="font-size:12px">Otro: '+order.customer_phone2+'</div>';
      if (!esLlevar) {
        if (barrio) h += '<div style="font-size:12.5px;font-weight:700;margin-top:2px">'+barrio+'</div>';
        if (dirCli) h += '<div style="font-size:12px">'+dirCli+'</div>';
      } else {
        h += '<div style="font-size:12px;font-weight:700;margin-top:2px">Recoge en el local</div>';
      }
    }
    h += sep;
    // Items
    h += '<table><tbody>'+itemRows+'</tbody></table>'+sep;
    // Totales
    h += '<table>';
    h += '<tr><td style="font-size:12px;color:#333">Subtotal</td><td class="pcol" style="font-size:12px">'+_money(subtotal)+'</td></tr>';
    // Desglose del impuesto. Solo sale si el restaurante lo cobra; si no, ni
    // se imprime (un restaurante no responsable no debe mostrar nada).
    if (window.posImpuestos && posImpuestos.activo()) {
      var _lin = posImpuestos.lineasRecibo(order.tax_detail, order.tax_base);
      (_lin || []).forEach(function (l) {
        h += '<tr><td style="font-size:12px;color:#333">'+l.label+'</td><td class="pcol" style="font-size:12px">'+_money(l.valor)+'</td></tr>';
      });
    }
    if (empaque>0)  h += '<tr><td style="font-size:12px;color:#333">Empaque</td><td class="pcol" style="font-size:12px">'+_money(empaque)+'</td></tr>';
    if (!esLlevar && domi>0) h += '<tr><td style="font-size:12px;color:#333">Domicilio</td><td class="pcol" style="font-size:12px">'+_money(domi)+'</td></tr>';
    if (descuento>0) h += '<tr><td style="font-size:12px;color:#333">Descuento</td><td class="pcol" style="font-size:12px">-'+_money(descuento)+'</td></tr>';
    // La propina venia solo en el recibo viejo de mesa; ahora la lleva
    // cualquiera que la tenga.
    var propina = Number(order.tip || 0);
    if (propina>0) h += '<tr><td style="font-size:12px;color:#333">Propina</td><td class="pcol" style="font-size:12px">'+_money(propina)+'</td></tr>';
    h += '<tr><td colspan="2" style="border-top:1px solid #000;padding-top:3px"></td></tr>';
    h += '<tr><td style="font-size:15px;font-weight:900">TOTAL</td><td class="pcol" style="font-size:15px;font-weight:900">'+_money(total)+'</td></tr>';
    h += '</table>';
    // Estado de pago (grande, para el domiciliario)
    // Si pago con varios metodos se desglosa; si fue uno solo basta la linea.
    // El desglose solo lo tenia el recibo de mesa y le sirve a todos.
    /* El metodo puede venir como ID (pm_...). En un RECIBO no puede salir eso:
       se traduce con la configuracion si esta cargada; si no, un id se
       disfraza de 'Pago' — mejor generico que basura tecnica. */
    function _metVisible(v) {
      v = String(v || '');
      try {
        if (window.posMetodos && posMetodos.lista().length) {
          var m = posMetodos.resolver(v);
          if (m) return m.nombre;
        }
      } catch (e) {}
      if (/^pm_[a-z0-9]+$/i.test(v) || /^__/.test(v)) return 'Pago';
      return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    }
    var pgs = (payments || []).filter(function(p){ return Number(p.amount) > 0; });
    var pm = order.payment_method ? String(order.payment_method) : '';
    if (pgs.length > 1) {
      h += '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;margin-top:6px">Forma de pago</div>';
      h += '<table>';
      pgs.forEach(function(p){
        var met = _metVisible(p.method) || 'Pago';
        h += '<tr><td style="font-size:12px">'+met+'</td><td class="pcol" style="font-size:12px">'+_money(p.amount)+'</td></tr>';
        h += _vueltoFilas(p, false);
      });
      h += '</table>';
    } else if (pgs.length === 1) {
      var m1 = String(pgs[0].method || '');
      var fv = _vueltoFilas(pgs[0], true);
      // Con cambio, la fila ya dice "Efectivo": repetir "Pago: Efectivo" arriba
      // seria decir lo mismo dos veces.
      if (fv) h += '<table>'+fv+'</table>';
      else h += '<div style="text-align:center;font-size:11.5px;margin-top:6px">Pago: '+_metVisible(m1)+'</div>';
    } else if (pm && pm!=='multiple') {
      h += '<div style="text-align:center;font-size:11.5px;margin-top:6px">Pago: '+_metVisible(pm)+'</div>';
    }
    h += _pagoEstadoHtml(order);
    var mRef = notes.match(/Ref:(\S+)/i); if (mRef) h += '<div style="text-align:center;font-size:10.5px;color:#555">Ref: '+mRef[1]+'</div>';
    // Puntos del cliente. Solo si es un cliente guardado; en una venta al paso
    // el recibo queda igual que siempre, sin un "0 puntos" que no dice nada.
    /* La base sigue sumando los puntos (el trigger no sabe de planes), pero un
       restaurante que no tiene el programa no puede entregar un recibo que le
       promete puntos al cliente. */
    if (order.puntos_total != null && (!window.posPlan || posPlan.puede('puntos'))) {
      h += sep;
      h += '<div style="text-align:center;font-size:10px;font-weight:700;color:#555;text-transform:uppercase">Tus puntos</div>';
      h += '<table>';
      // Lo que gano con ESTA compra solo se imprime si ya esta acreditado. Si
      // el recibo sale antes de cobrar, todavia no existe y no se inventa.
      if (order.puntos_ganados > 0) {
        // Antes de cobrar se habla en futuro: todavia no estan acreditados.
        h += '<tr><td style="font-size:12px">'+(order.puntos_estimados ? 'Ganar&aacute;s con esta compra' : 'Ganaste con esta compra')+'</td><td class="pcol" style="font-size:12px">+'+Number(order.puntos_ganados).toLocaleString('es-CO')+'</td></tr>';
      }
      h += '<tr><td style="font-size:13px;font-weight:800">'+(order.puntos_estimados ? 'Tu total quedar&aacute; en' : 'Tu total acumulado')+'</td><td class="pcol" style="font-size:13px;font-weight:800">'+Number(order.puntos_total).toLocaleString('es-CO')+'</td></tr>';
      h += '</table>';
    }
    // Pie
    h += sep+'<div style="text-align:center;font-size:11px;color:#333;margin-top:2px">'+footer+'</div>';
    h += '</body></html>';
    return h;
  }

  // Trae de la ficha del cliente lo que el pedido no guarda: su segundo
  // numero y sus puntos. El telefono PRINCIPAL manda: los puntos viven ahi,
  // aunque el pedido haya entrado por el otro numero.
  async function _datosClienteRecibo(order, orderData) {
    var sb = window._pos && window._pos.sb;
    if (!sb) return;
    var tenant = order.tenant_id || (window._pos.state && window._pos.state.tenantId);
    var mT = String(order.notes || '').match(/\[tel:([^\]]+)\]/i);
    var tel10 = String((mT && mT[1]) || order.customer_phone || '').replace(/[^0-9]/g, '').slice(-10);

    var cli = null;
    if (order.cliente_id) {
      var r0 = await sb.from('pos_clientes').select('telefono,telefono2').eq('id', order.cliente_id).maybeSingle();
      cli = (r0 && r0.data) || null;
    }
    if (!cli && tel10.length >= 7 && tenant) {
      var r1 = await sb.from('pos_clientes').select('telefono,telefono2').eq('tenant_id', tenant).ilike('telefono', '%' + tel10).limit(1);
      cli = (r1 && r1.data && r1.data[0]) || null;
      if (!cli) {
        var r2 = await sb.from('pos_clientes').select('telefono,telefono2').eq('tenant_id', tenant).ilike('telefono2', '%' + tel10).limit(1);
        cli = (r2 && r2.data && r2.data[0]) || null;
      }
    }
    if (!cli) return;   // venta al paso: el recibo queda como siempre

    if (cli.telefono2) orderData.customer_phone2 = cli.telefono2;

    var principal = String(cli.telefono || '').replace(/[^0-9]/g, '').slice(-10);
    if (!principal) return;
    var rp = await sb.from('pos_puntos').select('puntos').ilike('telefono', '%' + principal).maybeSingle();
    // Sin fila de puntos todavia (primera compra) el saldo es 0, no "no hay
    // puntos": igual hay que decirle cuantos va a ganar.
    orderData.puntos_total = Number(rp && rp.data && rp.data.puntos) || 0;

    // Lo ganado con ESTE pedido, tal como quedo registrado. Si todavia no se
    // acredito (recibo impreso antes de cobrar), no se imprime esa linea.
    var rm = await sb.from('pos_puntos_movimientos').select('puntos,tipo,revertido').eq('order_id', order.id);
    var gano = ((rm && rm.data) || []).reduce(function(a, m) {
      return a + ((m.tipo === 'acumulacion' && !m.revertido) ? (Number(m.puntos) || 0) : 0);
    }, 0);
    if (gano > 0) {
      orderData.puntos_ganados = gano;
      return;
    }

    /* Todavia no se acreditaron porque los puntos entran al COBRAR, y la
       mayoria de recibos se imprimen antes. Se calculan con la MISMA regla que
       usa la respuesta rapida del chat (/puntos): productos + empaque, SIN el
       domicilio, un punto por cada mil. Se marcan como estimados para que el
       recibo hable en futuro y no prometa un saldo que aun no existe. */
    var basePuntos = (Number(order.subtotal) || 0) + (Number(order.packaging_fee) || 0);
    var estimado = window.posPuntosDe ? posPuntosDe(basePuntos) : Math.floor(basePuntos / PUNTOS_POR_MIL);
    if (estimado > 0) {
      orderData.puntos_ganados   = estimado;
      orderData.puntos_estimados = true;
      orderData.puntos_total     = orderData.puntos_total + estimado;
    }
  }

  /* YA ES CONFIGURABLE (21-ago-2026): la regla sale de `posPuntosRegla()`
     —branches.operacion_config— y este numero solo queda de respaldo por si
     pos-core todavia no cargo. El aviso que estaba aqui («el dia que se haga
     configurable, los dos sitios tienen que leer de la configuracion») ya
     se cumplio: el chat y el recibo leen del mismo ayudante. */
  var PUNTOS_POR_MIL = 1000;   // respaldo si pos-core aun no cargo

/*  DE DONDE SALEN LA CONEXION Y LA SEDE.

    Este modulo daba por hecho `window._pos`, que lo crea `pos-core.js`. Pero
    el Chat NO carga pos-core: tiene su propia conexion. Resultado: al imprimir
    desde el chat, `window._pos.state` reventaba, el try/catch se lo tragaba y
    la respuesta era "sin impresora configurada" — con la impresora conectada y
    andando.

    Un modulo compartido no puede exigir que otro modulo haya cargado antes. Se
    busca por varios lados y se usa el primero que aparezca.               */
/*  ══ EL ANCHO DE LO QUE SE IMPRIME ═══════════════════════════════════════

    Tres sitios de este archivo escribían su propio ancho, y no coincidían: la
    comanda a 80 mm, el recibo a 72, el marco que los lleva a la impresora a
    80. El ancho del ROLLO es 80, pero la cabeza imprime unos 10 menos — ese
    margen es del papel y lo que se sale no se recorta limpio: empuja el resto
    y se lleva el borde derecho.

    O sea que la comanda lleva meses saliendo cortada por la derecha, solo que
    no se notaba porque su contenido es texto suelto y sobra sitio. La nota
    lleva marco, y ahí sí se vio — Sergio la tuvo que mandar con las esquinas
    comidas porque el domicilio no daba espera.

    Ahora hay UN ancho, sale de `pos_print_config.paper_width` (lo que el
    restaurante escogió en Impresoras) y lo usan los tres. Un negocio con rollo
    de 58 recibe 48 sin que nadie toque nada.

    Los 10 mm de margen los midió Sergio en su impresora: "en 80 mm siempre se
    corta". Dos milímetros de más no le quitan nada a un recibo; una esquina
    cortada arruina una nota entera.                                        */
  var MARGEN_MM = 10;
  var _anchoMM = 70;          // hasta que la impresora diga lo suyo

  function _anchoUtil(rollo) {
    var w = parseInt(rollo, 10);
    if (!w || w < 40 || w > 120) return 70;
    return Math.max(38, w - MARGEN_MM);
  }

  window.posAnchoPapel = function () { return _anchoMM; };

  function _sbRef() {
    return (window._pos && window._pos.sb) || window.sb || null;
  }

  function _branchRef() {
    try {
      if (window._pos && window._pos.state && window._pos.state.branchId) return window._pos.state.branchId;
      if (window.S && window.S.branchId) return window.S.branchId;
      return localStorage.getItem('pos.branchId') || '';
    } catch (e) { return ''; }
  }

  var _printerCache = null;
  var _printerCacheTs = 0;

  async function _getTargetPrinter(docType, areaPedida) {
    try {
      var sb = _sbRef();
      var branchId = _branchRef();
      if (!sb || !branchId) return '';
      var now = Date.now();
      if (!_printerCache || now - _printerCacheTs > 30000) {
        var cfg = await sb.from('pos_print_config').select('same_printer_for_all, default_system_printer, paper_width').eq('branch_id', branchId).maybeSingle();
        /*  Se aprovecha la misma consulta: el ancho viaja al lado de la
            impresora y no cuesta una llamada aparte. */
        if (cfg && cfg.data && cfg.data.paper_width) _anchoMM = _anchoUtil(cfg.data.paper_width);
        var prs = await sb.from('pos_printers').select('system_name, area, is_default').eq('branch_id', branchId);
        _printerCache = { cfg: (cfg && cfg.data) || {}, printers: (prs && prs.data) || [] };
        _printerCacheTs = now;
      }
      if (_printerCache.cfg.same_printer_for_all) return _printerCache.cfg.default_system_printer || '';
      /*  El area puede venir dicha (una comanda de barra) o deducirse del tipo
          de documento, como siempre. */
      var area = areaPedida || ((docType === 'comanda') ? 'cocina' : 'caja');
      var match = _printerCache.printers.find(function(p) { return p.area === area && p.is_default; });
      if (!match) match = _printerCache.printers.find(function(p) { return p.area === area; });
      /*  SI NO HAY UNA PARA ESA AREA, SE USA LA QUE HAYA (28-ago-2026).

          El Parche tiene UNA sola impresora, registrada como de cocina. Todo lo
          que fuera "recibo" buscaba una de caja, no encontraba ninguna, y salia
          con el nombre VACIO — y con el nombre vacio no falla: imprime en la
          impresora que Windows tenga por defecto, que puede ser una que ni
          existe. Desde afuera eso es "no imprimio nada", sin un solo error.

          Un restaurante con una impresora quiere que todo salga por ella. No
          hay que hacerle configurar dos areas para algo que solo tiene una
          respuesta posible.                                                */
      if (!match) {
        match = _printerCache.printers.find(function(p) { return p.is_default; })
             || _printerCache.printers[0];
        if (match) console.warn('[print] sin impresora de ' + area + ', se usa ' + match.system_name);
      }
      return (match && match.system_name) ? match.system_name : '';
    } catch(e) { return ''; }
  }

  async function _printHtml(html, docType, area) {
    if (window.electronPOS && window.electronPOS.printHtmlSilent) {
      try {
        var printerName = await _getTargetPrinter(docType || 'comanda', area);
        var result = await window.electronPOS.printHtmlSilent(html, printerName);
        if (result && result.ok) return;
        console.warn('[posprint] silent print falló, fallback web:', result && result.error);
      } catch(e) { console.warn('[posprint] silent print excepción:', e); }
    }
    // Fallback: impresión web normal (abre diálogo)
    var existing = document.getElementById('pos-print-frame');
    if (existing) existing.remove();
    var iframe = document.createElement('iframe');
    iframe.id = 'pos-print-frame';
    /*  El marco donde se arma la pagina antes de mandarla: si mide mas que el
        papel, el navegador maqueta con un ancho que la impresora no tiene. */
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:' + _anchoMM + 'mm;height:600px;border:none;visibility:hidden';
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    iframe.onload = function() {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch(e) { var win = window.open('', '_blank', 'width=400,height=600'); if (win) { win.document.write(html); win.document.close(); win.print(); } }
    };
  }

  // Imprimir un ticket ya armado (cierre de caja / paloteo). Usa la impresora
  // configurada; docType 'recibo' → impresora de caja.
  /* ¿Cuántas copias imprimir de este documento?
     El recibo del domicilio suele necesitar dos: una para el cliente y otra
     que el domiciliario devuelve firmada. Se configura en Operación
     (`domiCopias`); si no hay config, una sola. */
  function _copias(docType) {
    try {
      var cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
      if (docType === 'domiciliario' || docType === 'recibo-domi') {
        return Math.max(1, Math.min(3, parseInt(cfg.domiCopias, 10) || 1));
      }
    } catch (e) {}
    return 1;
  }

  window.posPrintTicket = async function (html, docType) {
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return false; }
    var n = _copias(docType);
    try {
      for (var i = 0; i < n; i++) {
        await _printHtml(html, docType || 'recibo');
        // Un respiro entre copias: algunas térmicas se atropellan si les llegan
        // dos trabajos pegados y sacan una sola.
        if (i < n - 1) await new Promise(function (r) { setTimeout(r, 400); });
      }
      return true;
    }
    catch (e) { _diagToast('❌ Error al imprimir: ' + (e && e.message || e), '#dc2626'); return false; }
  };

  function _noprinterToast() {
    var ex = document.getElementById('pos-noprinter-toast');
    if (ex) { clearTimeout(ex._t); ex.remove(); }
    var el = document.createElement('div');
    el.id = 'pos-noprinter-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#334155;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:8px;box-shadow:0 4px 16px rgba(15,23,42,.22);white-space:nowrap';
    el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Sin impresora configurada';
    document.body.appendChild(el);
    el._t = setTimeout(function() { if (el.parentNode) el.remove(); }, 3500);
  }

  async function _hasPrinter() {
    try {
      var sb = _sbRef();
      if (!sb) return false;
      var branchId = _branchRef();
      if (!branchId) return false;
      var r = await sb.from('pos_print_config').select('id').eq('branch_id', branchId).maybeSingle();
      return !!(r && r.data && r.data.id);
    } catch(e) { return false; }
  }

  /*  ══ DONDE SE PREPARA CADA COSA ═════════════════════════════

      Sergio, 28-ago-2026, pensando en vender el sistema: «va a haber otro
      restaurante que tenga areas y tengan varias impresoras por area».

      Las areas YA existian: se configuran en Operacion y la PANTALLA de cocina
      ya filtra por ellas. Lo que no existia es que el PAPEL las respetara —
      la comanda entera salia siempre por la impresora de «cocina», aunque las
      bebidas fueran de barra.

      La regla de a que area va un producto es EXACTAMENTE la de la pantalla
      de cocina (`areaDeItem` en cocina.js): lo suyo manda sobre lo de su
      categoria, y si no dice nada, la primera area. Tiene que ser la misma o
      el papel y la pantalla mandarian el mismo plato a sitios distintos.  */
  var _areasCache = null, _areasCacheTs = 0;
  async function _cargarAreas() {
    var ahora = Date.now();
    if (_areasCache && ahora - _areasCacheTs < 30000) return _areasCache;
    var vacio = { areas: [], areaCat: {}, areaProd: {}, catDe: {} };
    try {
      var sb = _sbRef(); var branchId = _branchRef();
      if (!sb || !branchId) return vacio;
      var b = await sb.from('branches').select('operacion_config').eq('id', branchId).maybeSingle();
      var op = (b && b.data && b.data.operacion_config) || {};
      var areas = Array.isArray(op.areas) ? op.areas.filter(function (a) { return a && a.id; }) : [];
      var out = { areas: areas, areaCat: op.areaCatCfg || {}, areaProd: op.areaProdCfg || {}, catDe: {} };
      /*  La categoria de cada producto solo hace falta si hay DOS areas o mas.
          Con una sola, preguntarla seria una consulta para nada. */
      if (areas.length >= 2) {
        var pr = await sb.from('pos_products').select('id, category_id').eq('branch_id', branchId);
        ((pr && pr.data) || []).forEach(function (p) { out.catDe[p.id] = p.category_id; });
      }
      _areasCache = out; _areasCacheTs = ahora;
      return out;
    } catch (e) { return vacio; }
  }

  function _areaDeItem(it, mapa) {
    var pid = it.product_id;
    if (pid && mapa.areaProd[pid]) return mapa.areaProd[pid];
    var cid = pid ? mapa.catDe[pid] : null;
    if (cid && mapa.areaCat[cid]) return mapa.areaCat[cid];
    return mapa.areas.length ? mapa.areas[0].id : 'cocina';
  }

  /*  ══ ¿SALE LA COMANDA SOLA? ═════════════════════════════════

      Sergio, 28-ago-2026: va a poner pantallas en la cocina y entonces la
      comanda en papel deja de hacer falta — los recibos si.

      El interruptor YA EXISTIA en Impresoras («Imprimir automaticamente al
      enviar a cocina») y ya se guardaba en `pos_print_config.auto_print`.
      Lo que faltaba es que alguien lo obedeciera: se apagaba y la comanda
      salia igual. Un interruptor que no hace nada es peor que no tener
      interruptor, porque quien lo apaga cree que ya esta resuelto.

      Se comprueba AQUI y no en el receptor de impresion porque por aqui pasan
      TODOS los caminos automaticos: el aviso en vivo, el barrido de seguridad
      cada 45 segundos y los items que se agregan a una mesa. Ponerlo en uno
      solo dejaria los otros dos imprimiendo.

      ⚠️ Lo que se pide A MANO sale SIEMPRE (`force`): el boton Imprimir y
      Reimprimir comanda. Apagar el automatico es dejar de imprimir SOLO,
      no quedarse sin poder imprimir.                                       */
  async function _autoprintOn(areaId) {
    try {
      var sb = _sbRef(); if (!sb) return true;
      var branchId = _branchRef(); if (!branchId) return true;
      var r = await sb.from('pos_print_config').select('auto_print, auto_print_areas').eq('branch_id', branchId).maybeSingle();
      var d = (r && r.data) || {};
      /*  El interruptor de CADA AREA manda sobre el general. Un restaurante
          con pantalla en cocina y sin pantalla en barra apaga cocina y deja
          barra encendida — que es justo el caso que Sergio va a vender.

          Si un area no dice nada, vale lo general. Asi el interruptor de
          siempre sigue significando lo mismo para quien tiene una sola area,
          que son casi todos.                                              */
      var porArea = d.auto_print_areas || {};
      if (areaId && Object.prototype.hasOwnProperty.call(porArea, areaId)) return !!porArea[areaId];
      //  Sin dato, ENCENDIDO: es como se comporto siempre, y un restaurante
      //  sin pantallas en cocina que deje de recibir comandas se queda ciego.
      if (d.auto_print == null) return true;
      return !!d.auto_print;
    } catch (e) { return true; }
  }

  async function _fetchOrder(orderId) {
    try {
      var sb = window._pos && window._pos.sb;
      if (!sb || !orderId) return null;
      // pos_orders → pos_order_items tiene FK real; pos_tables NO tiene FK desde pos_orders
      // por eso hacemos dos queries separadas en vez de un join inválido
      var r = await sb.from('pos_orders').select('*, pos_order_items(*)').eq('id', orderId).maybeSingle();
      if (!r || !r.data) {
        if (r && r.error) { _diagToast('❌ fetchOrder: ' + (r.error.message || r.error.code), '#7c2d12'); }
        return null;
      }
      var order = r.data;
      // Obtener nombre de mesa por separado (sin FK no se puede hacer join inline)
      if (order.table_id) {
        var rt = await sb.from('pos_tables').select('name, number, grupo_id, id').eq('id', order.table_id).maybeSingle();
        order.pos_tables = (rt && rt.data) ? rt.data : null;
        /*  MESAS UNIDAS (29-ago-2026). Si esta cuenta ocupa varias mesas, el
            recibo tiene que decirlas todas: es lo que el mesero mira para
            saber a dónde lleva la cuenta. Una consulta más, y solo cuando de
            verdad hay grupo — el 99% de los recibos no paga nada por esto.  */
        if (order.pos_tables && order.pos_tables.grupo_id) {
          var rg = await sb.from('pos_tables')
            .select('id, name, number, grupo_id')
            .eq('grupo_id', order.pos_tables.grupo_id);
          order.pos_tables_grupo = (rg && rg.data && rg.data.length) ? rg.data : null;
        }
      }
      return order;
    } catch(e) { _diagToast('❌ fetchOrder excepción: ' + (e && e.message || e), '#7c2d12'); return null; }
  }

  function _tableDisplay(order) {
    //  Unidas: «5 y 6». El rótulo de arriba lo pone en plural quien imprime.
    var g = order.pos_tables_grupo;
    if (g && g.length > 1 && window.posMesas) {
      var et = posMesas.etiqueta(g, order.table_id);          //  «Mesas 5 y 6»
      return et.replace(/^Mesas?\s+/, '');                    //  → «5 y 6»
    }
    var t = order.pos_tables;
    if (t) return t.name || String(t.number || '') || order.table_id || '-';
    return order.table_name || order.table_id || '-';
  }

  //  Cuántas mesas ocupa: solo para decir «Mesa» o «Mesas» en el recibo.
  function _tableCount(order) {
    var g = order.pos_tables_grupo;
    return (g && g.length) ? g.length : 1;
  }

  function _diagToast(msg, color) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:' + (color||'#1d4ed8') + ';color:#fff;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:700;z-index:99999;white-space:nowrap;pointer-events:none';
    el.textContent = msg;
    document.body && document.body.appendChild(el);
    setTimeout(function() { el.parentNode && el.parentNode.removeChild(el); }, 5000);
  }

  // Candado anti-duplicado: un mismo pedido solo se auto-imprime UNA vez por
  // dispositivo. En la caja (ventas.html) hay dos listeners de realtime que
  // disparan con el INSERT y con el UPDATE a in_progress del mismo pedido; sin
  // este candado la comanda salía dos veces por los pedidos hechos en la tablet.
  function _sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  // Memoria PERSISTENTE de comandas ya impresas en este equipo (sobrevive
  // navegación entre pantallas — el candado en memoria no). Evita que el
  // receptor global re-imprima algo ya impreso tras cambiar de página.
  var _LS_PRINTED = 'pos.printed.v1';
  function _lsPrintedMap() {
    try { return JSON.parse(localStorage.getItem(_LS_PRINTED) || '{}') || {}; } catch(e) { return {}; }
  }
  function _lsWasPrinted(orderId) { return !!_lsPrintedMap()[orderId]; }
  function _lsMarkPrinted(orderId) {
    try {
      var m = _lsPrintedMap(), now = Date.now();
      for (var k in m) { if (now - m[k] > 21600000) delete m[k]; } // podar > 6 h
      m[orderId] = now;
      localStorage.setItem(_LS_PRINTED, JSON.stringify(m));
    } catch(e) {}
  }
  function _lsUnmarkPrinted(orderId) {
    try { var m = _lsPrintedMap(); delete m[orderId]; localStorage.setItem(_LS_PRINTED, JSON.stringify(m)); } catch(e) {}
  }

  var _autoPrinted = {};
  var _printing = {};   // candado de concurrencia por pedido
  var _lastPrintSig = {};   // {orderId:{sig,ts}} anti-duplicado por firma
  window.posAutoprint = async function(orderId, opts) {
    if (!orderId) return;
    var force = !!(opts && opts.force);   // reimpresión pedida explícitamente

    // Candado de CONCURRENCIA (no permanente): evita dos corridas simultáneas
    // para el mismo pedido en este equipo. Antes bloqueaba "para siempre", lo
    // que impedía imprimir los ítems NUEVOS al agregar a una mesa ocupada.
    if (_printing[orderId]) return;
    _printing[orderId] = true;
    try {
      _diagToast('🖨 Verificando impresora…', '#1d4ed8');

      // 1) Impresora (reintento por lectura transitoria de config en tablet)
      var hasPrinter = false;
      for (var hp = 0; hp < 3 && !hasPrinter; hp++) {
        hasPrinter = await _hasPrinter();
        if (!hasPrinter && hp < 2) await _sleep(500);
      }
      if (!hasPrinter) { _noprinterToast(); _diagToast('❌ Sin config de impresora en BD', '#dc2626'); return; }
      _diagToast('✓ Impresora OK — buscando pedido…', '#15803d');

      // 2) Pedido + ítems (reintento por lag escritura→lectura)
      var order = null, raw = [];
      for (var att = 0; att < 9; att++) {
        order = await _fetchOrder(orderId);
        if (order) { raw = order.pos_order_items || []; if (raw.length) break; }
        await _sleep(450);
      }
      if (!order || !raw.length) { _diagToast('❌ Pedido sin ítems tras reintentos', '#dc2626'); return; }

      // 3) ¿QUÉ imprimir?
      //   · Reimpresión (force): TODO el pedido. (Reimprimir comanda)
      //   · Si el pedido ya tiene ítems enviados a cocina → solo los NUEVOS
      //     (los que no tienen kitchen_printed_at).
      //   · Si NUNCA se ha enviado nada → TODO (primera comanda / comanda
      //     pendiente en prepago que se reimprime completa mientras no se cobra).
      var yaEnviados = raw.some(function (it) { return it.kitchen_printed_at; });
      var fuente = (force || !yaEnviados)
        ? raw
        : raw.filter(function (it) { return !it.kitchen_printed_at; });
      if (!fuente.length) { _diagToast('Sin ítems nuevos por imprimir', '#64748b'); return; }
      // Candado por FIRMA: si acabamos de imprimir exactamente estos mismos
      // ítems hace < 6 s (p. ej. el envío directo + el eco del listener), no
      // repetir. Ítems genuinamente nuevos tienen otra firma → sí se imprimen.
      var _sig = fuente.map(function (it) { return it.id || (it.name + 'x' + it.qty); }).sort().join('|');
      var _prev = _lastPrintSig[orderId];
      if (!force && _prev && _prev.sig === _sig && (Date.now() - _prev.ts) < 6000) {
        _diagToast('Comanda ya impresa (evitando duplicado)', '#64748b'); return;
      }
      _lastPrintSig[orderId] = { sig: _sig, ts: Date.now() };
      // Se marca "enviado a cocina" solo cuando el pedido de verdad está en
      // cocina (visible_cocina). En prepago sin pagar (no visible) NO se marca:
      // así la comanda pendiente reimprime completa hasta que se cobre.
      var marcar = !force && !!order.visible_cocina;

      var items = fuente.map(function (it) {
        var sel = it.selections || {};
        var modsArr = Object.values(sel.mods || {}).map(function (m) { return m.name || String(m); });
        /* Un COMBO se imprime con su contenido debajo. Al cocinero "Combo El
           Parche" no le dice que preparar; los productos si. Van como si fueran
           adiciones para no tocar el diseño de la comanda. */
        if (sel.combo_id) {
          modsArr = (sel.combo_items || []).map(function (ci) {
            return ((ci.cantidad || 1) > 1 ? ci.cantidad + 'x ' : '') + (ci.nombre || '?');
          }).concat(modsArr);
        }
        return { id: it.id, product_id: it.product_id, name: it.product_name || it.name || 'Item', qty: it.quantity || 1, note: it.note || '', notes: it.notes || '', mods: modsArr };
      });
      _diagToast('✓ Pedido OK — enviando a impresora…', '#15803d');

      // 3.5) Candado ATÓMICO entre ventanas/equipos para la PRIMERA comanda.
      // Antes el anti-duplicado era solo EN MEMORIA por ventana, así que si el
      // pedido salía por dos lados a la vez (p.ej. la ventana del CHAT que imprime
      // directo + el RECEPTOR de la caja que imprime al detectar el pedido nuevo),
      // la comanda salía DOBLE. Ahora se reclama en la BD: printed_at NULL→now en
      // un solo UPDATE atómico; el que gane imprime, el otro ve 0 filas y NO repite.
      // A prueba de fallos: si el claim da error o no se puede leer, se imprime igual
      // (mejor imprimir que dejar a la cocina sin comanda).
      /*  ⚠️ EL CANDADO SE REINTENTA (29-ago-2026, en pleno turno).

          Sergio: «todas las comandas de hoy están saliendo dobles».

          El candado estaba bien pensado — un UPDATE atómico, gana uno solo —
          pero se rendía a la PRIMERA: si la petición fallaba, se seguía e se
          imprimía igual. Con el servidor lento de estos días (y el tope de 15 s
          que corta las consultas) las dos ventanas fallaban el candado a la
          vez, las dos se iban por el camino de respaldo, y salían dos comandas.

          Ahora se intenta hasta TRES veces antes de rendirse. Y si aun así no
          se puede, se imprime: una cocina sin comanda es peor que una comanda
          repetida. Pero eso deja de ser lo normal y vuelve a ser la excepción
          que se penso que era.                                              */
      var claimed = false;
      if (marcar && !yaEnviados) {
        var sbClaim = window._pos && window._pos.sb;
        if (sbClaim) {
          var _claimOk = false;
          for (var _ci = 0; _ci < 3 && !_claimOk; _ci++) {
            try {
              var cl = await sbClaim.from('pos_orders')
                .update({ printed_at: new Date().toISOString() })
                .eq('id', orderId).is('printed_at', null).select('id');
              if (!cl.error) {
                _claimOk = true;
                if (cl.data && cl.data.length) claimed = true;
                else { _diagToast('Comanda ya enviada por otra ventana', '#64748b'); return; }
              }
            } catch (e) { /* se reintenta abajo */ }
            if (!_claimOk && _ci < 2) await _sleep(400);
          }
          if (!_claimOk) _diagToast('No se pudo asegurar el candado — imprimo igual', '#b45309');
        }
      }

      /*  ══ 4) UNA COMANDA POR AREA ═══════════════════════════

          Con un solo sitio de preparacion —que es casi todo el mundo— esto
          es exactamente lo de antes: un grupo, una comanda, una impresora.

          Con dos o mas, cada area recibe SOLO lo suyo y por SU impresora: a
          la barra no le sirve una hoja con seis platos y una gaseosa al
          final, y a la cocina no le sirve la gaseosa.

          Y cada area decide si sale sola. Un restaurante puede tener pantalla
          en cocina y seguir imprimiendo en barra — es el caso que Sergio va
          a vender.                                                        */
      var mapa = await _cargarAreas();
      var grupos = [];
      if (mapa.areas.length >= 2) {
        var porArea = {};
        items.forEach(function (it) {
          var a = _areaDeItem(it, mapa);
          (porArea[a] = porArea[a] || []).push(it);
        });
        mapa.areas.forEach(function (a) {
          if (porArea[a.id] && porArea[a.id].length) {
            grupos.push({ area: a.id, nombre: a.nombre || a.id, items: porArea[a.id] });
          }
        });
        //  Un area que ya no existe no deja su comida sin imprimir: cae en la
        //  primera, que es la cocina de toda la vida.
        Object.keys(porArea).forEach(function (k) {
          if (!grupos.some(function (g) { return g.area === k; })) {
            var pri = grupos[0];
            if (pri) pri.items = pri.items.concat(porArea[k]);
            else grupos.push({ area: mapa.areas[0].id, nombre: mapa.areas[0].nombre || '', items: porArea[k] });
          }
        });
      } else {
        grupos = [{ area: (mapa.areas[0] && mapa.areas[0].id) || 'cocina', nombre: '', items: items }];
      }

      var printed = false;
      var impresos = [];      // los items que de verdad salieron
      for (var gi = 0; gi < grupos.length; gi++) {
        var g = grupos[gi];
        //  Lo pedido a mano sale siempre; lo automatico pregunta, por area.
        if (!force && !(await _autoprintOn(g.area))) {
          _diagToast('Automático apagado en ' + (g.nombre || g.area), '#64748b');
          continue;
        }
        var cab = { table: _tableDisplay(order), table_n: _tableCount(order), channel: order.channel, total: order.total || 0,
          paid: order.paid_amount || 0, guests: order.guests || order.persons || 0,
          waiter: order.waiter_name || '', sala: order.floor_name || order.zone_name || '',
          notes: order.notes || '', customer_name: order.customer_name || '',
          //  El nombre del area va en la hoja SOLO cuando hay mas de una: con
          //  una sola, decir «COCINA» en cada comanda es ruido.
          area: (grupos.length > 1 || mapa.areas.length >= 2) ? (g.nombre || g.area) : '' };
        var okG = false;
        for (var pr = 0; pr < 2 && !okG; pr++) {
          try {
            await _printHtml(_buildComanda(cab, g.items), 'comanda', g.area);
            okG = true; printed = true;
            impresos = impresos.concat(g.items);
            _diagToast('✓ Comanda impresa' + (g.nombre ? ' · ' + g.nombre : '') + ' OK', '#15803d');
          } catch (e) {
            if (pr < 1) { await _sleep(600); }
            else { _diagToast('❌ Error al imprimir: ' + (e && e.message || e), '#dc2626'); }
          }
        }
      }
      if (!printed && !grupos.length) { _diagToast('Nada que imprimir', '#64748b'); }

      if (printed) {
        try {
          var sb2 = window._pos && window._pos.sb;
          if (sb2) {
            // Si ya se reclamó atómicamente arriba, printed_at ya quedó puesto; no re-marcar.
            if (!claimed) await sb2.from('pos_orders').update({ printed_at: new Date().toISOString() }).eq('id', orderId);
            // Marcar como "enviados a cocina" los ítems recién impresos, para que
            // el próximo agregado imprima únicamente lo nuevo.
            /*  Solo los que DE VERDAD salieron. Si la barra tiene el
                automatico apagado, sus items siguen sin marcar — y asi el
                dia que se encienda, o si alguien imprime a mano, no se los
                encuentra ya dados por enviados.                          */
            /*  ⚠️ ESTA MARCA TAMBIEN SE REINTENTA, y no es un detalle.

                Medido hoy: en los pedidos de las 19:15 y 19:19 los items
                quedaron marcados; en los de las 19:49 y 19:54, NO — con el
                servidor lento la escritura se perdio y nadie se entero, porque
                el catch de afuera se la traga.

                Un item sin marcar hace creer que la comanda nunca salio: al
                agregar algo a esa mesa se vuelve a imprimir el pedido ENTERO
                en vez de solo lo nuevo. Es la segunda mitad del problema de
                las comandas dobles.                                        */
            if (marcar) {
              var ids = impresos.map(function (it) { return it.id; }).filter(Boolean);
              if (ids.length) {
                var _mk = false;
                for (var _mi = 0; _mi < 3 && !_mk; _mi++) {
                  var rm = await sb2.from('pos_order_items')
                    .update({ kitchen_printed_at: new Date().toISOString() }).in('id', ids);
                  if (!rm.error) _mk = true;
                  else if (_mi < 2) await _sleep(400);
                }
                if (!_mk) console.warn('[posprint] los items no quedaron marcados como impresos');
              }
            }
          }
        } catch(e) { console.warn('[posprint] marcar impreso:', e); }
      } else if (claimed) {
        // Se reclamó pero la impresión FALLÓ → liberar (printed_at→null) para que
        // un reintento o el receptor de la caja pueda volver a imprimirla.
        try { var sb3 = window._pos && window._pos.sb; if (sb3) await sb3.from('pos_orders').update({ printed_at: null }).eq('id', orderId); } catch(e) {}
      }
    } finally {
      _printing[orderId] = false;
    }
  };

  window.posOpenPrintModal = function(orderId) {
    var ex = document.getElementById('pos-print-modal-wrap');
    if (ex) ex.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pos-print-modal-wrap';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:9900;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    var SVG_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:330px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.2)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px"><div style="font-weight:700;font-size:15px;color:#0F172A">Imprimir</div>'
      + '<button onclick="document.getElementById(\'pos-print-modal-wrap\').remove()" style="border:none;background:#F1F5F9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748B;display:flex;align-items:center;justify-content:center">' + SVG_X + '</button></div>'
      + '<div style="display:flex;flex-direction:column;gap:10px">'
      + '<button onclick="posPrintAction(\'comanda\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Reimprimir comanda</div><div style="font-size:11px;color:#64748B">Ticket de cocina</div></div></button>'
      + '<button onclick="posPrintAction(\'recibo\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#F0FDF4;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Recibo del cliente</div><div style="font-size:11px;color:#64748B">Con precios, dirección y datos</div></div></button>'
      + '</div></div>';
    document.body.appendChild(overlay);
  };

  window.posPrintAction = async function(type, orderId) {
    var overlay = document.getElementById('pos-print-modal-wrap');
    if (overlay) overlay.remove();
    // Sin impresora local (tablet/celular): mandar la SEÑAL de reimpresión al
    // equipo de la caja — su receptor global la recibe al instante y la imprime.
    if (!window.electronPOS && type === 'comanda' && orderId) {
      try {
        var sbT = window._pos && window._pos.sb;
        if (sbT) {
          await sbT.from('pos_orders').update({ reprint_at: new Date().toISOString() }).eq('id', orderId);
          _diagToast('🖨 Enviado a la caja para imprimir', '#1d4ed8');
          return;
        }
      } catch(e) { console.warn('[posprint] señal reimpresión:', e); }
    }
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return; }
    var order = await _fetchOrder(orderId);
    if (!order) { _noprinterToast(); return; }
    var items = (order.pos_order_items || []).map(function(it) {
      var sel = it.selections || {};
      // La adicion completa (nombre, cuantas y a cuanto), no solo el nombre:
      // el recibo necesita poder decir "+ 2x Papas ($16.000)".
      var modsArr = Object.values(sel.mods || {}).map(function(m){
        if (m && typeof m === 'object') return { name: m.name || '', qty: Number(m.qty) || 1, price: Number(m.price) || 0 };
        return { name: String(m), qty: 1, price: 0 };
      }).filter(function(m){ return m.name; });
      // En el recibo el combo tambien lista lo que lleva, a $0: el cliente paga
      // el precio del combo, no la suma, y asi lo ve.
      if (sel.combo_id) {
        modsArr = (sel.combo_items || []).map(function (ci) {
          return { name: ci.nombre || '?', qty: Number(ci.cantidad) || 1, price: 0 };
        }).concat(modsArr);
      }
      // `notes`, no `note`: asi se llama la columna. Con el nombre viejo la
      // nota llegaba siempre vacia y no se imprimia nunca.
      return { name: it.product_name || it.name || 'Item', qty: it.quantity || 1, notes: it.notes || '', mods: modsArr, total: (it.unit_price || 0) * (it.quantity || 1) };
    });
    var orderData = { table: _tableDisplay(order), table_n: _tableCount(order), channel: order.channel, id: order.id, total: order.total || 0, tax_total: order.tax_total || 0, tax_base: order.tax_base || 0, tax_detail: order.tax_detail || null, paid: order.paid_amount || 0, subtotal: order.subtotal || order.total || 0, packaging_fee: order.packaging_fee || 0, delivery_fee: order.delivery_fee || 0, discount: order.discount_amount || 0, tip: order.tip_amount || 0, guests: order.guests || order.persons || 0, waiter: order.waiter_name || '', sala: order.floor_name || order.zone_name || '', notes: order.notes || '', customer_name: order.customer_name || '', payment_method: order.payment_method || '' };
    var html;
    if (type === 'comanda') html = _buildComanda(orderData, items);
    else if (type === 'recibo') {
      var ch = String(order.channel||'').toLowerCase();
      {
        // El mismo recibo para domicilio, venta rapida y mesa. Antes mesa
        // tenia el suyo aparte y se habia quedado atras: sin el nombre del
        // negocio, sin adiciones, sin notas y sin puntos.
        var branch = {};
        try {
          var sb2 = window._pos && window._pos.sb;
          var bid = order.branch_id || (window._pos.state && window._pos.state.branchId);
          if (sb2 && bid) {
            var br = await sb2.from('branches').select('name,address,phone,brand_id,operacion_config').eq('id', bid).maybeSingle();
            if (br && br.data) {
              branch = br.data;
              // La config de impuestos se carga AQUI, no en la pantalla. Antes
              // solo la cargaba Pagos, asi que el desglose de impuestos salia
              // impreso unicamente si se cobraba desde alli: el mismo pedido
              // impreso desde Ventas, Domicilios o el Chat salia sin nada.
              if (window.posImpuestos && branch.operacion_config && branch.operacion_config.impuestos) {
                posImpuestos.setConfig(branch.operacion_config.impuestos);
              }
              if (branch.brand_id) { var bd = await sb2.from('brands').select('name').eq('id', branch.brand_id).maybeSingle(); if (bd && bd.data) branch.brand_name = bd.data.name; }
            }
          }
        } catch(e) {}
        // El segundo telefono y los puntos no viven en el pedido: hay que ir a
        // buscarlos a la ficha del cliente. Si falla (sin internet, por ejemplo)
        // el recibo sale como siempre en vez de no salir.
        try { await _datosClienteRecibo(order, orderData); } catch(e) { console.warn('[posprint] datos cliente:', e); }
        // Los pagos: para el desglose cuando pago con varios metodos y para
        // el cambio cuando pago en efectivo.
        var payments = [];
        try {
          var sbP = window._pos && window._pos.sb;
          if (sbP && orderId) { var pr = await sbP.from('pos_payments').select('*').eq('order_id', orderId); payments = (pr && pr.data) ? pr.data : []; }
        } catch(e) {}
        html = _buildReceiptDomicilio(orderData, items, branch, payments);
      }
    }
    if (html) _printHtml(html, type === 'comanda' ? 'comanda' : 'recibo');
  };

})();