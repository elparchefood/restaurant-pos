/* marketing.js — la pantalla de Marketing.
 *
 * NO HAY NI UN DATO INVENTADO. Cada cifra sale de `marketing-datos.js`, que
 * lee la base; y lo que hoy no se puede saber sale como un hueco que dice qué
 * permiso falta y para qué sirve.
 *
 * Esa es la regla: un número falso en una pantalla de marketing es peor que un
 * hueco, porque el hueco se pregunta y el número se cree.
 *
 * Hoy está conectado:
 *   · Cuentas ......... real y completo (chat_channels)
 *   · Ventas por red .. real (conversaciones que acabaron en pedido)
 *   · Conversión ...... real (conversaciones que compran / total)
 *   · Respuestas ...... real (quién contestó y en cuánto)
 *   · TikTok .......... el permiso está; falta desplegar `tiktok-videos`
 *
 * Falta permiso de Meta para: vistas y alcance, publicaciones de Instagram,
 * comentarios y programar contenido. Ver la cabecera de marketing-datos.js.
 */
(function () {
  'use strict';

  var $  = function (id) { return document.getElementById(id); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var D  = window.mkDatos;

  var NUM = new Intl.NumberFormat('es-CO');
  function miles(n) { return NUM.format(n); }
  function pesos(n) { return '$ ' + NUM.format(Math.round(n || 0)); }
  function corto(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + 'K';
    return miles(n || 0);
  }
  function pct(a, b) { return b ? (a * 100 / b).toFixed(1).replace('.', ',') + '%' : '—'; }
  function duracion(seg) {
    if (seg == null) return '—';
    if (seg < 60) return Math.round(seg) + ' s';
    if (seg < 3600) return Math.round(seg / 60) + ' min';
    return (seg / 3600).toFixed(1).replace('.', ',') + ' h';
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /*  Los colores de cada red son los que ya usa el POS en `CANAL_META`
      (ventas-salon.js), para que una red se vea igual en toda la aplicación. */
  var RED = {
    instagram: { n: 'Instagram', c: '#E1306C', b: 'ig' },
    facebook:  { n: 'Facebook',  c: '#1877F2', b: 'fb' },
    whatsapp:  { n: 'WhatsApp',  c: '#22C55E', b: 'wa' },
    tiktok:    { n: 'TikTok',    c: '#0F172A', b: 'tk' }
  };
  function red(k) { return RED[k] || { n: k || 'Otro', c: '#64748B', b: '' }; }

  var dias = 30;              // el rango del segmentado de arriba

  // ══════════════════════════════════════════════════════════════════════
  //  EL HUECO HONESTO
  //  Se usa en todas partes donde falta un permiso. Dice QUÉ falta y PARA QUÉ
  //  sirve, para que al leerlo se entienda qué se está pidiendo y por qué.
  // ══════════════════════════════════════════════════════════════════════
  function hueco(titulo, porque) {
    return '<div class="mkd-card" style="padding:22px;text-align:center">'
      + '<div style="width:38px;height:38px;border-radius:12px;margin:0 auto 10px;'
      +   'background:var(--warn-tint);color:var(--warn);display:flex;align-items:center;'
      +   'justify-content:center">'
      +   '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      +   'stroke-width="2" stroke-linecap="round"><rect x="4" y="10" width="16" height="10" rx="2"/>'
      +   '<path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>'
      + '<div style="font-size:13.5px;font-weight:700;color:var(--ink)">' + esc(titulo) + '</div>'
      + '<div style="font-size:12px;color:var(--ink-3);margin-top:5px;line-height:1.5;'
      +   'max-width:340px;margin-left:auto;margin-right:auto">' + esc(porque) + '</div>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  RESUMEN
  // ══════════════════════════════════════════════════════════════════════
  async function pintarResumen() {
    var caja = $('mk-kpis');
    var conv = await D.conversaciones(dias);
    var resp = await D.respuestas(dias);

    if (caja) {
      caja.innerHTML =
          kpi('Conversaciones atendidas', miles(conv.total), 'últimos ' + dias + ' días')
        + kpi('Acabaron en pedido', miles(conv.conPedido),
              pct(conv.conPedido, conv.total) + ' de las conversaciones')
        + kpi('Tiempo de respuesta', duracion(resp.medianaSeg),
              resp.medianaSeg == null ? 'sin datos en el periodo' : 'mediana, no promedio');
    }

    var v = await D.ventasPorRed(dias);
    var val = $('mk-ventas');
    if (val) val.textContent = pesos(v.total);

    var redes = $('mk-ventas-redes');
    if (redes) {
      var claves = Object.keys(v.redes).sort(function (a, b) { return v.redes[b] - v.redes[a]; });
      redes.innerHTML = claves.length
        ? claves.map(function (k) {
            return '<div class="mkd-tile"><div class="mkd-tile-n">' + pesos(v.redes[k]) + '</div>'
              + '<div class="mkd-tile-s">' + esc(red(k).n) + '</div></div>';
          }).join('')
        : '<div class="mkd-tile-s" style="padding:8px 2px">Todavía no hay pedidos que hayan '
          + 'salido de una conversación en este periodo.</div>';
    }

    /*  Se dice de dónde sale el número: es atribución por CANAL, no por
        publicación. Para saber qué post trajo la venta hacen falta las
        estadísticas de Meta, y prometerlo sin tenerlas seria mentir.     */
    var nota = $('mk-ventas-nota');
    if (nota) {
      nota.textContent = v.pedidos
        ? miles(v.pedidos) + ' pedidos que salieron de una conversación. Por red, no por publicación.'
        : '';
    }

    pintarPublicaciones();
  }
  function kpi(lbl, val, pie) {
    return '<div class="mkd-kpi"><div class="mkd-lbl">' + esc(lbl) + '</div>'
      + '<div class="mkd-val">' + esc(val) + '</div>'
      + (pie ? '<div class="mkd-lbl" style="margin-top:4px">' + esc(pie) + '</div>' : '')
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LAS PUBLICACIONES
  //  Hoy solo TikTok, y solo cuando esté desplegada la función que las lee.
  //  Instagram y Facebook necesitan permiso para leer medios.
  // ══════════════════════════════════════════════════════════════════════
  var VIDEOS = [], sel = 0;

  async function pintarPublicaciones() {
    var lista = $('post-list'), det = $('post-detail');
    if (!lista) return;

    var r = await D.videosTikTok();
    VIDEOS = r.videos || [];

    /*  El contador de la cabecera. Sin videos no se pinta: al lado de un
        cartel que ya explica que falta la funcion, un "Publicadas 0" solo
        repite la mala noticia.                                          */
    var pills = $('mk-pub-pills');
    if (pills) {
      pills.innerHTML = VIDEOS.length
        ? '<button class="mkd-pill on">Publicadas <span>' + VIDEOS.length + '</span></button>'
        : '';
    }

    if (!VIDEOS.length) {
      lista.innerHTML = '<div style="padding:14px 16px">' + hueco(
        r.falta || 'Todavía no hay publicaciones',
        r.falta
          ? 'TikTok ya nos dejó leer los videos publicados (permiso video.list). Falta '
            + 'desplegar la función de servidor que los trae: el token no puede bajar al '
            + 'navegador. Instagram y Facebook necesitan además el permiso para leer medios.'
          : 'Cuando publiques en TikTok aparecerán aquí.') + '</div>';
      if (det) det.innerHTML = '';
      return;
    }

    lista.innerHTML = VIDEOS.map(function (v, i) {
      return '<div class="mkd-lrow' + (i === sel ? ' on' : '') + '" data-i="' + i + '">'
        + (v.cover
            ? '<img class="mkd-lthumb" src="' + esc(v.cover) + '" alt="" loading="lazy">'
            : '<span class="mkd-lthumb"></span>')
        + '<span class="mkd-lmain">'
        +   '<span class="mkd-lid" style="display:block">' + esc(v.titulo || 'Sin título') + '</span>'
        +   '<span class="mkd-lsub" style="display:block">' + esc(v.fecha || '') + ' · TikTok</span>'
        + '</span>'
        + '<span class="mkd-lamount">' + corto(v.vistas) + '</span>'
        + '</div>';
    }).join('');
    pintarDetalle();
  }

  function pintarDetalle() {
    var caja = $('post-detail');
    if (!caja || !VIDEOS.length) return;
    var v = VIDEOS[sel];
    caja.innerHTML =
        '<div class="mkd-det-top"><span class="mkd-det-lbl">Publicación</span>'
      +   '<span class="mkd-chip">TikTok</span></div>'
      + '<div class="mkd-det-id"><span class="mkd-det-num" style="font-size:17px">'
      +   esc(v.titulo || 'Sin título') + '</span></div>'
      + '<div class="mkd-det-cols">'
      +   '<div><div class="mkd-det-col-lbl">Publicado</div>'
      +     '<div class="mkd-det-col-v"><div><div class="mkd-det-col-t">'
      +       esc(v.fecha || '—') + '</div>'
      +     '<div class="mkd-det-col-s">' + (v.duracion ? esc(v.duracion) : '') + '</div></div></div></div>'
      +   '<div><div class="mkd-det-col-lbl">Producto vinculado</div>'
      +     '<div class="mkd-det-col-v"><div><div class="mkd-det-col-t" '
      +       'style="color:var(--muted);font-weight:600">Sin vincular</div>'
      +     '<div class="mkd-det-col-s">Vincular pide el permiso de estadísticas</div></div></div></div>'
      + '</div>'
      + '<div class="mkd-det-tiles" style="grid-template-columns:repeat(3,1fr)">'
      +   dtile(corto(v.vistas), 'Vistas')
      +   dtile(corto(v.likes), 'Likes')
      +   dtile(corto(v.comentarios), 'Comentarios')
      + '</div>'
      + '<div class="mkd-det-foot">'
      +   '<div class="mkd-tot"><span>Compartidos</span><b>' + corto(v.compartidos) + '</b></div>'
      +   '<div class="mkd-foot-actions">'
      +     (v.enlace
        ? '<a class="cc-btn-ghost" href="' + esc(v.enlace) + '" target="_blank" rel="noopener">Abrir en TikTok</a>'
        : '')
      +   '</div>'
      + '</div>';
  }
  function dtile(n, s2) {
    return '<div class="mkd-dtile"><div class="mkd-dtile-n">' + esc(n) + '</div>'
      + '<div class="mkd-dtile-s">' + esc(s2) + '</div></div>';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LA BARRA DE ARRIBA — sede y usuario de la sesion
  //  Traia "Valentina M. / Administrador / Sede Centro", que no existe.
  // ══════════════════════════════════════════════════════════════════════
  async function pintarBarra() {
    var yo = await D.quienSoy();
    var n = $('mk-user-name'), r = $('mk-user-role'), a = $('mk-user-av'), sd = $('mk-sede-top');
    if (n) n.textContent = yo.nombre;
    if (r) r.textContent = yo.rol;
    if (a) a.textContent = yo.iniciales;
    /*  Sin sede el rotulo se esconde entero: un "Sede" a secas no dice nada
        y deja el hueco raro.                                             */
    if (sd) {
      sd.innerHTML = 'Sede <strong>' + esc(yo.sede) + '</strong>';
      sd.hidden = !yo.sede;
    }
    var sub = $('mk-sede');
    if (sub && yo.sede) sub.textContent = yo.sede;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LAS CUATRO BARRITAS POR MES
  //  Es venta atribuida al chat, no alcance: el alcance necesita permisos que
  //  no tenemos. La barra mas alta manda y las demas se miden contra ella.
  // ══════════════════════════════════════════════════════════════════════
  async function pintarMeses() {
    var caja = $('mk-meses');
    if (!caja) return;
    var lista = await D.ventasPorMes(4);
    var tope = Math.max.apply(null, lista.map(function (m) { return m.valor; }));
    caja.innerHTML = lista.map(function (m, i) {
      /*  Si todavia no hay ventas todas van a cero: NO se reparte un 100%
          entre ceros, que dibujaria un mes ganador salido de la nada.    */
      var ancho = tope > 0 ? Math.round(m.valor * 100 / tope) : 0;
      var suave = (i === lista.length - 1) ? ' soft' : '';   // el mes en curso va a medias
      return '<div class="mkd-month" title="' + esc(pesos(m.valor)) + '">'
        + '<span>' + esc(m.mes) + '</span><div class="mkd-track">'
        + '<div class="mkd-fill' + suave + '" style="width:' + ancho + '%"></div></div></div>';
    }).join('');
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LOS FILTROS — solo los que filtran de verdad
  //  El de formato (Reel / Carrusel / Historia) y el buscador se quitaron del
  //  HTML: filtraban por datos que no tenemos, y un filtro que no filtra
  //  desespera mas que no tenerlo.
  // ══════════════════════════════════════════════════════════════════════
  async function pintarFiltros() {
    var sel = $('mk-filtro-cuenta');
    if (sel) {
      var lista = (await D.cuentas()).lista.filter(function (c) { return c.connected; });
      sel.innerHTML = '<option>Todas las cuentas</option>'
        + lista.map(function (c) { return '<option>' + esc(red(c.channel).n) + '</option>'; }).join('');
    }
    var rango = $('mk-rango');
    if (rango) {
      /*  A mano y no con toLocaleDateString: el es-CO devuelve
          "4 de ago de 2026", que aqui ocupa el doble y se lee peor.   */
      var M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      var fmt = function (d) {
        return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear();
      };
      rango.textContent = fmt(new Date(Date.now() - dias * 864e5)) + ' — ' + fmt(new Date());
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  AUTOMATIZACIONES
  //  Las cifras de mensajes son reales. Las reglas de comentarios son la
  //  función que falta, así que se dice.
  // ══════════════════════════════════════════════════════════════════════
  async function pintarAutos() {
    var caja = $('mk-auto-kpis');
    if (caja) {
      var r = await D.respuestas(dias);
      var c = await D.conversaciones(dias);
      caja.innerHTML =
          akpi('Mensajes respondidos', miles(r.atendidas), 'últimos ' + dias + ' días')
        + akpi('Contestó el asistente', miles(r.porBot), pct(r.porBot, r.atendidas) + ' del total')
        + akpi('Contestó una persona', miles(r.porPersona), pct(r.porPersona, r.atendidas) + ' del total')
        + akpi('Tiempo de respuesta', duracion(r.medianaSeg), 'mediana')
        + akpi('Sin responder ahora', miles(c.sinResponder), 'esperan contestación');
    }
    var reglas = $('mk-reglas');
    if (reglas) {
      reglas.innerHTML = hueco(
        'Responder comentarios: falta el permiso',
        'Las cifras de arriba son de MENSAJES, que es lo que hoy podemos leer y contestar. '
        + 'Para hacer lo mismo con los comentarios hacen falta instagram_manage_comments y '
        + 'pages_manage_engagement, y suscribir los avisos de comentarios. TikTok no ofrece '
        + 'responder comentarios por API, así que esto será solo de Meta.');
    }
  }
  function akpi(lbl, val, pie) {
    return '<div class="mk-kpi"><div class="mk-kpi-lbl">' + esc(lbl) + '</div>'
      + '<div class="mk-kpi-val">' + esc(val) + '</div>'
      + '<div class="mk-kpi-foot">' + esc(pie) + '</div></div>';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CUENTAS — real y completo
  // ══════════════════════════════════════════════════════════════════════
  async function pintarCuentas() {
    var caja = $('mk-cuentas');
    if (!caja) return;
    var res   = await D.cuentas();
    var lista = res.lista;
    var conv  = await D.conversaciones(dias);
    var orden = ['instagram', 'facebook', 'whatsapp', 'tiktok'];

    /*  Si no se pudo leer NO se pinta ninguna tarjeta. Una tarjeta que dice
        "Sin conectar" cuando lo que pasó es que la consulta falló es una
        mentira, y aquí ya pasó: Sergio vio Instagram, Facebook y WhatsApp
        como desconectados estando conectados.                           */
    if (res.error) {
      caja.innerHTML = '<div style="grid-column:1/-1">' + hueco(
        'No se pudieron leer las cuentas',
        'La pantalla no puede decirte si están conectadas porque la consulta no '
        + 'respondió: ' + esc(res.error) + '. Para verlas y conectarlas, entra a Chat IA.')
        + '</div>';
      var b0 = $('mk-conectadas');
      if (b0) b0.textContent = 'No se pudo comprobar';
      var t0 = $('mk-tab-cuentas');
      if (t0) t0.hidden = true;
      return;
    }

    caja.innerHTML = orden.map(function (k) {
      var c = lista.filter(function (x) { return x.channel === k; })[0];
      var r = red(k), on = c && c.connected;
      var meta = (c && c.meta) || {};
      var nombre = (c && (c.display_name || c.handle)) || '';
      return '<div class="mk-auto">'
        + '<div class="mk-auto-top"><div class="mk-net">'
        +   '<div class="mk-net-badge" style="background:' + r.c + '1f;color:' + r.c + '">'
        +     esc(r.n.slice(0, 2).toUpperCase()) + '</div>'
        +   '<div><div class="mk-auto-title">' + esc(r.n) + '</div>'
        +   '<div class="mk-auto-sub">' + (nombre ? esc(nombre) : 'Sin conectar') + '</div></div>'
        + '</div>'
        + (on ? '<span class="lm-pill-success">● Conectada</span>'
              : '<span class="mkd-chip">Sin conectar</span>')
        + '</div>'
        + '<div>'
        /*  Cada red dice lo SUYO. Antes las cuatro enseñaban las mismas tres
            líneas y salían tonterías: WhatsApp con "Publicaciones: falta el
            permiso" cuando WhatsApp no tiene muro, y por tanto no hay ningún
            permiso que pedir. Y faltaba lo único que hoy funciona de verdad,
            que son los mensajes.                                          */
        +   filas(k, on)
        + '</div>'
        + '<div class="mk-auto-foot"><a class="cc-btn-ghost" href="chat-ia.html">'
        +   (on ? 'Ver conversaciones' : 'Conectar desde Chat IA') + '</a></div>'
        + '</div>';
    }).join('')
    + '<div style="grid-column:1/-1">' + hueco(
        'Seguidores, alcance e interacción: falta el permiso',
        'Los números de una cuenta —seguidores, alcance, interacción, salud— vienen de las '
        + 'estadísticas de Meta: instagram_manage_insights y read_insights. En TikTok, '
        + 'user.info.stats. Ninguno está aprobado.') + '</div>';

    /*  El numero de la pestana: cuantas cuentas hay conectadas de verdad.
        Nace escondido y solo aparece si hay alguna — un "0" colgado de la
        pestana no informa, solo estorba.                                */
    var tab = $('mk-tab-cuentas');
    if (tab) {
      var cn = lista.filter(function (x) { return x.connected; }).length;
      tab.textContent = cn;
      tab.hidden = !cn;
    }

    var badge = $('mk-conectadas');
    if (badge) {
      var n = lista.filter(function (x) { return x.connected; }).length;
      badge.textContent = n + (n === 1 ? ' cuenta conectada' : ' cuentas conectadas');
    }
  }
  /*  Qué enseña la tarjeta de cada red.

      TikTok va aparte a propósito: lo suyo NO es que falte un permiso que
      vaya a llegar. No ofrece responder comentarios por API, y de publicar se
      decidió no depender (la solicitud lleva más de un mes sin respuesta).
      Escribir "falta el permiso" en su tarjeta sería prometer.           */
  function filas(k, on) {
    if (k === 'tiktok') {
      return kv('Videos y sus números', on ? 'Disponible' : 'Conecta la cuenta');
    }
    var msg = kv('Mensajes', on ? 'Funcionando' : 'Conecta la cuenta');
    /*  WhatsApp no tiene muro: ni publicaciones, ni comentarios, ni alcance.
        No es que falten permisos — es que no existe eso que pedir.        */
    if (k === 'whatsapp') return msg;
    return msg
      + kv('Estadísticas',  'Falta el permiso de Meta')
      + kv('Publicaciones', 'Falta el permiso de lectura')
      + kv('Comentarios',   'Falta el permiso');
  }

  function kv(k, v) {
    return '<div class="mk-kv"><span class="mk-kv-k">' + esc(k) + '</span>'
      + '<span class="mk-kv-v" style="font-size:11.5px;color:var(--ink-3);font-weight:600">'
      + esc(v) + '</span></div>';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  AVISOS, PESTAÑAS Y VENTANAS
  // ══════════════════════════════════════════════════════════════════════
  var avisoActual = null;
  function aviso(msg) {
    if (avisoActual) avisoActual.remove();
    var d = document.createElement('div');
    d.className = 'cc-toast';
    d.textContent = msg;
    document.body.appendChild(d);
    avisoActual = d;
    setTimeout(function () { if (d.parentNode) d.remove(); if (avisoActual === d) avisoActual = null; }, 2600);
  }

  function pestana(nombre) {
    $$('.cc-tab').forEach(function (t) {
      var suya = t.getAttribute('data-screen') === nombre;
      t.classList.toggle('on', suya);
      if (suya) { var c = $('crumb'); if (c) c.textContent = t.getAttribute('data-crumb') || t.textContent.trim(); }
    });
    $$('.screen').forEach(function (s) { s.classList.toggle('on', s.id === 'screen-' + nombre); });
  }

  function cerrarTodo() { $$('.cc-overlay').forEach(function (o) { o.hidden = true; }); }

  function arrancar() {
    if (!D) return;
    pintarBarra();
    pintarResumen();
    pintarMeses();
    pintarFiltros();
    pintarAutos();
    pintarCuentas();

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target : null;
      if (!t) return;

      var toast = t.closest('.js-toast');
      if (toast) { aviso(toast.getAttribute('data-msg') || 'Listo'); return; }

      var tab = t.closest('.cc-tab');
      if (tab) { pestana(tab.getAttribute('data-screen')); return; }

      var fila = t.closest('.mkd-lrow');
      if (fila) {
        sel = +fila.getAttribute('data-i');
        $$('.mkd-lrow').forEach(function (f, i) { f.classList.toggle('on', i === sel); });
        pintarDetalle();
        return;
      }

      /*  El rango de arriba sí cambia los datos: no es decoración. */
      var seg = t.closest('#range-seg button');
      if (seg) {
        Array.prototype.forEach.call(seg.parentElement.children, function (b) { b.classList.remove('on'); });
        seg.classList.add('on');
        dias = parseInt(seg.textContent, 10) || 30;
        pintarResumen();
        pintarFiltros();
        pintarAutos();
        pintarCuentas();
        return;
      }

      var otro = t.closest('.cc-seg button, .mkd-pills button, .cc-fchip');
      if (otro) {
        Array.prototype.forEach.call(otro.parentElement.children, function (b) { b.classList.remove('on'); });
        otro.classList.add('on');
        return;
      }
      var net = t.closest('.mk-netopt');
      if (net) { net.classList.toggle('on'); return; }

      /*  Crear reglas de comentarios necesita un permiso de Meta que aún no
          tenemos. Se avisa en vez de abrir un formulario que no guardaría.
          (Lo de programar contenido se quitó entero el 3-sep: dependía de una
          aprobación de TikTok que lleva más de un mes sin respuesta, y no se
          promete lo que no se controla.)                                  */
      if (t.closest('.js-open-rule, .cc-add-tile, .mk-qcard')) {
        aviso('Responder comentarios necesita un permiso de Meta que aún no tenemos');
        return;
      }
      if (t.closest('.js-close'))   { cerrarTodo(); return; }
    });

    $$('.cc-overlay').forEach(function (o) {
      o.addEventListener('mousedown', function (e) { if (e.target === o) o.hidden = true; });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarTodo(); });

    pestana('resumen');
  }

  /*  Se espera al núcleo: sin cliente de Supabase no hay nada que leer. */
  if (window._pos && window._pos.sb) arrancar();
  else if (window._pos && window._pos.on) window._pos.on('core:ready', arrancar);
  else window.addEventListener('load', arrancar);
})();
