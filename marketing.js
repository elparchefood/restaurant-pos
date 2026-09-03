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
  /*  Lo último leído, para no volver a pedirlo al cambiar de filtro: el
      filtro no cambia los datos, cambia qué parte de ellos se ensena.   */
  var ESTADIS = null;
  var filtroRed = null;        // null = todas las cuentas

  /*  Cuando NINGUNA red da números, el pie de la primera cifra explica por
      qué. Sin eso, tres ceros se leen como "esto no funciona".          */
  /*  "tus ultimas 6 publicaciones, desde el 27 de ene". Se dice DESDE
      CUANDO porque un numero sin periodo no significa nada.             */
  function rotuloTikTok(e) {
    var n = e.porRed.tiktok && e.porRed.tiktok.videos;
    if (!n) return null;
    var txt = 'tus últimas ' + n + (n === 1 ? ' publicación' : ' publicaciones');
    if (e.desdeTikTok) {
      var d = new Date(e.desdeTikTok * 1000);
      txt += ', desde el ' + d.getDate() + ' de '
           + ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()];
    }
    return txt;
  }

  function motivoGeneral(e) {
    var motivos = Object.keys(e.falta).map(function (k) { return e.falta[k]; });
    if (!Object.keys(e.porRed).length) return 'conecta una cuenta para ver sus números';
    if (e.total.videos || e.total.vistas) return 'todas las cuentas';
    return motivos.length ? motivos[0] : 'todavía no hay publicaciones';
  }

  async function pintarResumen() {
    /*  El Resumen mide RENDIMIENTO EN REDES: publicaciones, visualizaciones
        y me gusta. No cuántos mensajes contestamos — eso vive en
        Automatizaciones, que es su sitio.

        Aquí hubo un error que conviene no repetir: como la métrica pedida no
        tenía datos, se puso otra que sí los tenía. Eso no es rellenar un
        hueco, es cambiarle la pantalla a quien la diseñó. Si el dato no está,
        **la métrica correcta va en cero** y se dice por qué.             */
    ESTADIS = await D.estadisticasRedes(dias);

    /*  El filtro de arriba manda: con una red elegida se enseñan SOLO sus
        números; con "Todas", la suma.                                   */
    var n = (filtroRed && ESTADIS.porRed[filtroRed]) ? ESTADIS.porRed[filtroRed] : ESTADIS.total;
    /*  El pie de la primera cifra: si a esa red le falta un permiso, se dice;
        si no, el periodo. Poner "en TikTok" seria repetir el filtro de al
        lado.                                                            */
    /*  El rotulo dice QUE se esta contando. Para TikTok no es "los ultimos
        30 dias": son las ultimas publicaciones que da la API, vengan de
        cuando vengan. Decir el rango seria mentir sobre el numero de al
        lado.                                                            */
    var pie;
    if (filtroRed) pie = ESTADIS.falta[filtroRed] || rotuloTikTok(ESTADIS) || ('últimos ' + dias + ' días');
    else pie = (ESTADIS.total.videos ? rotuloTikTok(ESTADIS) : null) || motivoGeneral(ESTADIS);
    var periodo = rotuloTikTok(ESTADIS) || ('últimos ' + dias + ' días');

    var caja = $('mk-kpis');
    if (caja) {
      caja.innerHTML =
          kpi('Publicaciones', miles(n.videos), pie)
        /*  El mismo pie que arriba: si lo que se cuenta son las ultimas
            publicaciones de TikTok, poner "ultimos 30 dias" seria mentir
            sobre el numero que tiene encima.                            */
        + kpi('Visualizaciones', miles(n.vistas), periodo)
        + kpi('Me gusta', miles(n.likes),
              n.comentarios || n.compartidos
                ? miles(n.comentarios) + ' comentarios · ' + miles(n.compartidos) + ' compartidos'
                : periodo);
    }

    /*  Las barritas pasan a ser visualizaciones por mes, no ventas: esto es
        la tarjeta de estadísticas de redes.                             */
    pintarMeses();

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
        r.falta || 'Todavía no hay publicaciones', queHacer(r.falta)) + '</div>';
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

  /*  Qué hacer con cada motivo.

      El motivo lo decide el SERVIDOR y cambia; antes debajo había un párrafo
      fijo escrito aquí, que se quedó diciendo "falta desplegar la función"
      cuando la función ya llevaba rato desplegada. Un cartel con el
      diagnóstico bueno arriba y uno viejo debajo confunde más que ayudar.

      Y cada caso dice QUÉ HACER: explicar un problema sin la salida deja al
      que lo lee igual de atascado.                                       */
  function queHacer(motivo) {
    if (!motivo) return 'Cuando publiques en TikTok aparecerán aquí.';
    var m = String(motivo).toLowerCase();

    if (m.indexOf('token') >= 0 || m.indexOf('venci') >= 0) {
      return 'La cuenta figura conectada pero la llave de acceso no está o ya venció '
           + '(las de TikTok duran poco). Entra a Chat IA, abre TikTok y vuelve a '
           + 'conectarla: con eso se renueva y los números aparecen aquí.';
    }
    if (m.indexOf('no está conectado') >= 0 || m.indexOf('no esta conectado') >= 0) {
      return 'Conecta la cuenta de TikTok desde Chat IA y sus números aparecerán aquí.';
    }
    if (m.indexOf('desplegar') >= 0) {
      return 'El permiso video.list ya lo tenemos; falta la función de servidor que trae '
           + 'los videos, porque la llave no puede bajar al navegador.';
    }
    /*  Cualquier otro fallo del servidor: se enseña tal cual y se dice que no
        es culpa de los permisos, para no mandar a nadie a pedir uno que ya
        tiene.                                                            */
    return 'TikTok no respondió bien. No es un permiso que falte: vuelve a intentarlo en '
         + 'un rato y, si sigue igual, reconecta la cuenta desde Chat IA.';
  }

  /*  El detalle: TODO lo que da `video.list`. Fecha, duracion, vistas, me
      gusta, comentarios, compartidos y la interaccion sobre las vistas, que
      es la cifra que de verdad dice si un video funciono — 40 mil vistas con
      20 me gusta y 40 mil con 6.000 no son lo mismo.                     */
  function pintarDetalle() {
    var caja = $('post-detail');
    if (!caja || !VIDEOS.length) return;
    var v = VIDEOS[sel] || VIDEOS[0];

    var inter = v.vistas
      ? (((v.likes || 0) + (v.comentarios || 0) + (v.compartidos || 0)) * 100 / v.vistas)
      : null;

    caja.innerHTML =
        '<div class="mkd-det-top"><span class="mkd-det-lbl">Publicaci\u00f3n</span>'
      +   '<span class="mkd-chip">TikTok</span></div>'
      /*  El pie completo, con saltos: aqui SI cabe, y es lo que se public\u00f3. */
      + '<div class="mkd-det-id"><span style="font-size:13.5px;font-weight:600;line-height:1.45;'
      +   'white-space:pre-wrap;word-break:break-word">' + esc(v.titulo || 'Sin t\u00edtulo') + '</span></div>'
      + '<div class="mkd-det-cols" style="margin-top:14px">'
      +   '<div><div class="mkd-det-col-lbl">Publicado</div>'
      +     '<div class="mkd-det-col-v"><div><div class="mkd-det-col-t">'
      +       esc(v.fecha || '\u2014') + '</div>'
      +     '<div class="mkd-det-col-s">' + (v.duracion ? 'Duraci\u00f3n ' + esc(v.duracion) : '') + '</div></div></div></div>'
      +   '<div><div class="mkd-det-col-lbl">Interacci\u00f3n</div>'
      +     '<div class="mkd-det-col-v"><div><div class="mkd-det-col-t">'
      +       (inter == null ? '\u2014' : inter.toFixed(1).replace('.', ',') + '%') + '</div>'
      +     '<div class="mkd-det-col-s">me gusta, comentarios y compartidos sobre las vistas</div>'
      +     '</div></div></div>'
      + '</div>'
      + '<div class="mkd-det-tiles" style="grid-template-columns:repeat(2,1fr)">'
      +   dtile(miles(v.vistas), 'Visualizaciones')
      +   dtile(miles(v.likes), 'Me gusta')
      +   dtile(miles(v.comentarios), 'Comentarios')
      +   dtile(miles(v.compartidos), 'Compartidos')
      + '</div>'
      + '<div class="mkd-det-foot">'
      +   '<div class="mkd-tot" style="font-size:11px;color:var(--muted);font-weight:500;'
      +     'line-height:1.5">Estos son todos los datos que TikTok entrega por publicaci\u00f3n. '
      +     'Seguidores y alcance necesitan un permiso que no tenemos.</div>'
      +   '<div class="mkd-foot-actions">'
      +     (v.enlace && v.enlace !== '#'
          ? '<a class="lm-btn-ghost sm" href="' + esc(v.enlace) + '" target="_blank" rel="noopener">Abrir en TikTok</a>'
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
    /*  Visualizaciones de los videos publicados en cada mes. Es lo que se
        puede saber: `video.list` da un total por video, no un desglose por
        día. Sin datos salen cuatro barras en cero, que es información.  */
    var lista = D.vistasPorMes((ESTADIS && ESTADIS.mesesTikTok) || [], 4);
    var tope = Math.max.apply(null, lista.map(function (m) { return m.valor; }));
    caja.innerHTML = lista.map(function (m, i) {
      /*  Si todavia no hay ventas todas van a cero: NO se reparte un 100%
          entre ceros, que dibujaria un mes ganador salido de la nada.    */
      var ancho = tope > 0 ? Math.round(m.valor * 100 / tope) : 0;
      var suave = (i === lista.length - 1) ? ' soft' : '';   // el mes en curso va a medias
      return '<div class="mkd-month" title="' + esc(miles(m.valor) + ' visualizaciones') + '">'
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
      /*  Solo las redes que TIENEN estadísticas. WhatsApp no entra: no tiene
          publicaciones ni visualizaciones, y ofrecerlo en el filtro sería
          prometer una vista que siempre estaría vacía.                  */
      var lista = (await D.cuentas()).lista.filter(function (c) {
        return c.connected && c.channel !== 'whatsapp';
      });
      sel.innerHTML = '<option value="">Todas las cuentas</option>'
        + lista.map(function (c) {
            return '<option value="' + esc(c.channel) + '">' + esc(red(c.channel).n) + '</option>';
          }).join('');
      sel.value = filtroRed || '';
      /*  Se engancha una sola vez: pintarFiltros corre en cada cambio de
          rango y si no, se apilarian oyentes.                           */
      if (!sel.dataset.enganchado) {
        sel.dataset.enganchado = '1';
        sel.addEventListener('change', function () {
          filtroRed = sel.value || null;
          pintarResumen();
        });
      }
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
  //  CALENDARIO — la función entera está pendiente de permiso
  // ══════════════════════════════════════════════════════════════════════
  function pintarCalendario() {
    var cal = $('mk-calendario');
    if (!cal) return;
    cal.innerHTML = '<div style="padding:26px">' + hueco(
      'Programar contenido: en cuanto Meta apruebe',
      'Falta el permiso para publicar: instagram_content_publish en Instagram y '
      + 'pages_manage_posts en Facebook. Son de los que se van a solicitar. El video '
      + 'se guarda aquí y Cobra lo publica a la hora que elijas.') + '</div>';
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
        +   filas(k, on, c)
        + '</div>'
        /*  TikTok se conecta AQUI. En el chat no tiene mensajes, asi que
            mandar alli a quien quiere ver sus videos es pasearlo por una
            pantalla que no le sirve. Las demas si van al chat: ahi es donde
            se leen y contestan sus mensajes.                            */
        /*  `.lm-btn-ghost` y `.lm-link`, que SI existen en marketing.css.
            Antes ponia `.cc-btn-ghost`, que no existe: el boton salia crudo
            del sistema y los enlaces, como texto azul suelto.            */
        + '<div class="mk-auto-foot">'
        +   (k === 'tiktok'
                ? '<button class="lm-btn-ghost sm js-tiktok">'
                  + (on ? 'Reconectar TikTok' : 'Conectar TikTok') + '</button>'
                : '<a class="lm-link" href="chat-ia.html">'
                  + (on ? 'Ver conversaciones' : 'Conectar desde Chat IA') + '</a>')
        + '</div>'
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
  function filas(k, on, c) {
    if (k === 'tiktok') {
      /*  `sinLlave` = la fila dice conectado pero no hay llave de acceso.
          Viene de los datos de ejemplo de la migración del chat. Decir solo
          "Conecta la cuenta" dejaría a alguien mirando una cuenta que ya
          figura conectada sin entender qué le falta.                    */
      if (c && c.sinLlave) {
        return kv('Videos y sus números', 'Vuelve a conectarla en Chat IA');
      }
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

  /*  ══ CONECTAR TIKTOK ═══════════════════════════════════════════════
      Se pide permiso a TikTok y se vuelve AQUI.

      Los mismos permisos que pide el chat, ni uno mas: solo leer la cuenta y
      la lista de videos. `biz.spark.auth` va porque ya estaba concedido en la
      app; no publica nada, solo deja promocionar un video ya publicado.

      La funcion del servidor que recoge la respuesta termina mandando siempre
      al chat, y esta en produccion. En vez de tocarla, se deja una nota antes
      de salir y al volver el chat reenvia aqui. Si la nota se perdiera, se
      acaba en el chat — que es lo que pasaba antes, no un error nuevo.   */
  var TIKTOK_KEY      = '7650415130718502929';
  var TIKTOK_CALLBACK = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/tiktok-oauth-callback';
  var TIKTOK_PERMISOS = 'user.info.basic,user.info.username,user.info.profile,'
                      + 'user.account.type,video.list,biz.spark.auth';

  async function conectarTikTok() {
    var b = await D.sede();
    if (!b) { aviso('No se pudo saber en qué sede estás'); return; }

    var url = 'https://www.tiktok.com/v2/auth/authorize'
      + '?client_key=' + TIKTOK_KEY
      + '&scope=' + TIKTOK_PERMISOS
      + '&response_type=code'
      + '&redirect_uri=' + encodeURIComponent(TIKTOK_CALLBACK)
      + '&state=' + encodeURIComponent(b);

    /*  NUNCA se lleva la ventana de la aplicación a tiktok.com. En el
        ejecutable eso deja de mostrar Cobra, TikTok intenta abrir su app con
        un enlace `bytedance://` —Windows saca un cartel— y al terminar el
        permiso vuelve a la versión WEB, o sea fuera de la sesión.

        No hace falta volver: el permiso lo recoge una función de servidor que
        deja la conexión guardada en la base. Termine donde termine el
        navegador, la conexión ya quedó hecha; aquí basta con releerla.  */
    var enExe = !!window.electronPOS;
    abrirVentana(url, enExe);
  }

  /*  La ventana de conectar. Propia, con el diseño del producto: ni alert ni
      prompt del navegador.                                              */
  function abrirVentana(url, enExe) {
    var v = document.createElement('div');
    v.className = 'cc-overlay center';
    v.innerHTML =
      '<div class="cc-modal" style="width:520px">'
      + '<div style="padding:20px 20px 4px">'
      +   '<div class="mk-dw-title">Conectar TikTok</div>'
      +   '<div class="mk-dw-sub">TikTok pide el permiso en su propia página</div>'
      + '</div>'
      + '<div style="padding:14px 20px 4px;font-size:13px;color:var(--ink-2);line-height:1.55">'
      +   (enExe
            ? 'Esto se hace en tu navegador: dentro del programa, TikTok intenta abrir '
              + 'su aplicación y se pierde la sesión.<br><br>Copia el enlace, pégalo en el '
              + 'navegador y acepta. Cuando termines, vuelve aquí y toca <b>Ya la conecté</b>.'
            : 'Se abre en otra pestaña. Acepta los permisos y vuelve aquí.')
      + '</div>'
      + (enExe
          ? '<div style="padding:12px 20px 0"><input class="cc-input" id="tk-url" readonly '
            + 'value="' + esc(url) + '" style="font-size:11px"></div>'
          : '')
      + '<div class="mk-dw-foot" style="margin-top:14px">'
      +   '<button class="lm-btn-ghost sm js-cerrar-tk">Cancelar</button>'
      +   '<span style="display:flex;gap:8px">'
      +     '<button class="lm-btn-ghost sm js-ya-tk">Ya la conecté</button>'
      +     '<button class="lm-btn-primary js-ir-tk">'
      +       (enExe ? 'Copiar enlace' : 'Abrir TikTok') + '</button>'
      +   '</span>'
      + '</div></div>';
    document.body.appendChild(v);

    function cerrar() { v.remove(); }
    v.addEventListener('mousedown', function (e) { if (e.target === v) cerrar(); });
    v.querySelector('.js-cerrar-tk').addEventListener('click', cerrar);

    v.querySelector('.js-ir-tk').addEventListener('click', function () {
      if (!enExe) {
        /*  Otra pestaña, nunca la misma: si el bloqueador la impide se dice,
            en vez de dejar a alguien esperando una pestaña que no llegó. */
        var w = window.open(url, '_blank', 'noopener');
        if (!w) aviso('Tu navegador bloqueó la ventana. Permítela y vuelve a intentarlo.');
        return;
      }
      var caja = v.querySelector('#tk-url');
      caja.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { aviso('Enlace copiado'); },
          function () { if (!ok) aviso('Selecciona el enlace y cópialo con Ctrl+C'); });
      } else {
        aviso(ok ? 'Enlace copiado' : 'Selecciona el enlace y cópialo con Ctrl+C');
      }
    });

    /*  "Ya la conecté" relee la base. Es lo único que hace falta: la conexión
        la guardó la función de servidor, no esta pantalla.               */
    v.querySelector('.js-ya-tk').addEventListener('click', async function () {
      var b = this;
      b.disabled = true; b.textContent = 'Comprobando…';
      var r = await D.cuentas();
      var tk = r.lista.filter(function (c) { return c.channel === 'tiktok'; })[0];
      if (tk && tk.connected) {
        cerrar();
        aviso('TikTok conectado');
        pintarCuentas();
        pintarResumen();
      } else {
        b.disabled = false; b.textContent = 'Ya la conecté';
        aviso('Todavía no aparece conectada. Termina el permiso en TikTok y vuelve a probar.');
      }
    });
  }

  /*  Al volver de TikTok se dice como fue. El aviso sale una sola vez: se
      limpia la direccion para que al recargar no reaparezca.            */
  function avisarVuelta() {
    var u = new URL(window.location.href);
    if (u.searchParams.get('channel') !== 'tiktok') return;
    if (u.searchParams.get('connected') === '1') aviso('TikTok conectado');
    else if (u.searchParams.get('error')) aviso('No se pudo conectar TikTok. Inténtalo otra vez.');
    u.searchParams.delete('channel');
    u.searchParams.delete('connected');
    u.searchParams.delete('error');
    history.replaceState(null, '', u.pathname + (u.search === '?' ? '' : u.search));
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
    pintarCalendario();
    avisarVuelta();
    pintarFiltros();
    pintarResumen();   // pinta tambien las barritas, que dependen de sus datos
    pintarAutos();
    pintarCuentas();

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target : null;
      if (!t) return;

      var toast = t.closest('.js-toast');
      if (toast) { aviso(toast.getAttribute('data-msg') || 'Listo'); return; }

      if (t.closest('.js-tiktok')) { conectarTikTok(); return; }

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

      /*  Programar y las reglas están apagados hasta que Meta apruebe. Se
          avisa en vez de abrir un formulario que no guardaría nada.
          El aviso habla SOLO de Meta: de TikTok no se promete programar,
          porque esa solicitud lleva más de un mes sin respuesta.        */
      if (t.closest('.js-open-drawer, .cc-add-tile, .mk-qcard')) {
        aviso('Programar contenido necesita un permiso de Meta que aún no tenemos');
        return;
      }
      if (t.closest('.js-open-rule')) {
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
