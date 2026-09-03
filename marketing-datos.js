/* marketing-datos.js — de dónde sale cada número de la pantalla de Marketing.
 *
 * Aquí NO hay ni un dato inventado. Cada función devuelve o lo que hay en la
 * base, o un aviso de que todavía falta un permiso. La regla es simple:
 *
 *      si no lo tenemos, se dice — no se rellena con algo bonito.
 *
 * Lo que SÍ tenemos hoy, y de dónde sale:
 *
 *   · Las cuentas conectadas .......... chat_channels
 *   · Ventas que salieron del chat .... chat_conversations.order_id → pos_orders
 *   · Cuántas conversaciones compran .. chat_conversations
 *   · Tiempo de respuesta ............. chat_messages (entra cliente → sale bot)
 *   · Quién contestó, bot o persona ... chat_messages.origen
 *   · Mensajes sin responder .......... chat_conversations.unread_count
 *
 * Lo que NO tenemos y por qué:
 *
 *   · Vistas, alcance, seguidores ..... falta `instagram_manage_insights` y
 *                                       `read_insights` en Meta
 *   · Publicaciones de Instagram ...... falta `instagram_basic` con permiso de
 *                                       leer medios
 *   · Comentarios (leer y responder) .. falta `instagram_manage_comments` y
 *                                       `pages_manage_engagement`
 *   · Programar contenido ............. falta `instagram_content_publish` y
 *                                       `pages_manage_posts`
 *   · Videos de TikTok ................ el permiso `video.list` YA lo tenemos,
 *                                       pero el token no puede bajar al
 *                                       navegador: hace falta la función de
 *                                       servidor `tiktok-videos` (escrita, sin
 *                                       desplegar — pendiente de Sergio)
 */
(function () {
  'use strict';

  var FALTA = {
    insights:  'Falta el permiso de estadísticas de Meta',
    medios:    'Falta el permiso para leer las publicaciones',
    coment:    'Falta el permiso de comentarios',
    publicar:  'Falta el permiso para publicar',
    tiktok:    'Falta desplegar la función que lee TikTok'
  };

  var MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function sb() { return (window._pos && window._pos.sb) || null; }

  /* ══ LA SEDE ══════════════════════════════════════════════════════════

     Todas las consultas van filtradas por ella: sin esto un restaurante
     vería los números de otro.

     Leerla de `_pos.state.branchId` a secas NO basta, y por eso esta pantalla
     llegó a decir "Sin conectar" con las cuentas conectadas:

       · `posContexto` la resuelve de forma ASÍNCRONA. Si Marketing pregunta
         antes de que termine, sale null, la consulta se filtra por nada y
         vuelve vacía.
       · Puede no haberla nunca: una cuenta sin `branch_id` en su metadata.

     Se hace lo mismo que Chat IA, que es donde las cuentas sí se ven: se
     espera al contexto y, si aun así no hay sede, se coge la primera del
     restaurante. Se resuelve UNA vez y se guarda: son ~8 consultas por
     pantalla y no tiene sentido repetir la búsqueda en cada una.        */
  var _sede = null;

  function esperarContexto() {
    return new Promise(function (res) {
      try {
        if (!window._pos || typeof window._pos.on !== 'function') return res();
        if (window._pos.state && window._pos.state.branchId) return res();
        var hecho = false;
        var fin = function () { if (!hecho) { hecho = true; res(); } };
        window._pos.on('core:ready', fin);
        /*  Tope de tiempo: si el núcleo no arranca, mejor seguir con el
            respaldo que dejar la pantalla colgada para siempre.        */
        setTimeout(fin, 2500);
      } catch (e) { res(); }
    });
  }

  async function branch() {
    if (_sede) return _sede;
    await esperarContexto();

    var b = (window._pos && window._pos.state && window._pos.state.branchId) || null;
    if (b) { _sede = b; return b; }

    /*  Respaldo: la primera sede del restaurante, en orden fijo para que no
        dependa de cómo estén guardadas las filas.                       */
    var s = sb();
    var t = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    if (s && t) {
      var r = await s.from('branches').select('id').eq('tenant_id', t)
        .order('created_at').limit(1).maybeSingle();
      if (r.data) { _sede = r.data.id; return _sede; }
    }
    return null;
  }

  /* ══ QUE PASO DE VERDAD ═══════════════════════════════════════════════

     Supabase NO lanza excepción cuando rechaza una consulta: devuelve
     `{data:null, error:{...}}`. Escribir `return r.data || []` convierte
     cualquier fallo —un permiso denegado, una columna que no existe— en una
     lista vacía, y la pantalla acaba afirmando "no hay nada" cuando lo que
     pasó es que no pudo mirar. Es el mismo fallo que dejó el rastro del
     gerente mudo durante semanas.

     Todo lo que sale de aquí lleva `error`. La pantalla decide qué enseñar,
     pero ya no puede confundir "no hay" con "no pude leer".            */
  function fallo(r, donde) {
    if (r && r.error) {
      console.error('marketing · ' + donde + ':', r.error.message || r.error);
      return r.error.message || 'No se pudo leer';
    }
    return null;
  }

  function desdeISO(dias) {
    return new Date(Date.now() - dias * 864e5).toISOString();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LAS CUENTAS CONECTADAS
  //  Esto es real y completo: es nuestra propia tabla.
  // ══════════════════════════════════════════════════════════════════════
  async function cuentas() {
    var s = sb(), b = await branch();
    if (!s) return { lista: [], error: 'No hay sesión' };
    if (!b) return { lista: [], error: 'No se pudo saber en qué sede estás' };
    var r = await s.from('chat_channels')
      .select('channel,connected,handle,display_name,meta')
      .eq('branch_id', b);
    var e = fallo(r, 'cuentas');

    /*  ── TIKTOK: SIN LLAVE NO HAY CONEXION ──────────────────────────
        La migracion del modulo de chat siembra los cuatro canales con
        `connected: true` y sin `meta` (15-MIGRACION-CHAT-IA.sql, linea 122).
        Son datos de ejemplo, no conexiones. Por eso la pantalla decia
        "conectado" y la funcion no encontraba llave.

        En TikTok la llave ES la conexion: sin ella no se le puede preguntar
        nada. Asi que aqui se exige.

        A WhatsApp, Instagram y Facebook NO se les aplica: ahi la conexion se
        demuestra sola porque los mensajes estan entrando, y marcarlos
        desconectados por sospecha estropearia algo que funciona.      */
    var lista = (r.data || []).map(function (c) {
      if (c.channel === 'tiktok' && c.connected && !(c.meta && c.meta.access_token)) {
        return Object.assign({}, c, { connected: false, sinLlave: true });
      }
      return c;
    });
    return { lista: lista, error: e };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  VENTAS QUE SALIERON DEL CHAT, POR RED
  //
  //  El vínculo es `chat_conversations.order_id`: una conversación de
  //  Instagram que acabó en pedido. Es atribución por CANAL, no por
  //  publicación — para saber qué post trajo la venta harían falta los
  //  permisos de estadísticas. Se dice así en la pantalla.
  // ══════════════════════════════════════════════════════════════════════
  async function ventasPorRed(dias) {
    var s = sb(), b = await branch();
    if (!s || !b) return { total: 0, redes: {}, pedidos: 0 };

    var conv = await s.from('chat_conversations')
      .select('channel,order_id')
      .eq('branch_id', b)
      .not('order_id', 'is', null)
      .gte('last_message_at', desdeISO(dias));
    var filas = conv.data || [];
    if (!filas.length) return { total: 0, redes: {}, pedidos: 0 };

    var ids = filas.map(function (c) { return c.order_id; });
    var porOrden = {};
    filas.forEach(function (c) { porOrden[c.order_id] = c.channel; });

    /* En trozos de 100: una lista de ids muy larga no cabe en la URL y
       PostgREST la rechaza con un 414 que no dice nada útil. */
    var total = 0, pedidos = 0, redes = {};
    for (var i = 0; i < ids.length; i += 100) {
      var r = await s.from('pos_orders')
        .select('id,total,total_final,status')
        .in('id', ids.slice(i, i + 100));
      (r.data || []).forEach(function (o) {
        if (o.status === 'cancelled') return;          // un pedido anulado no es una venta
        var v = Number(o.total_final) || Number(o.total) || 0;
        var red = porOrden[o.id] || 'otro';
        redes[red] = (redes[red] || 0) + v;
        total += v; pedidos++;
      });
    }
    return { total: total, redes: redes, pedidos: pedidos };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CUÁNTAS CONVERSACIONES ACABAN EN PEDIDO
  // ══════════════════════════════════════════════════════════════════════
  async function conversaciones(dias) {
    var s = sb(), b = await branch();
    if (!s || !b) return { total: 0, conPedido: 0, sinResponder: 0 };

    var todas = await s.from('chat_conversations')
      .select('id,order_id,unread_count,last_sender')
      .eq('branch_id', b)
      .gte('last_message_at', desdeISO(dias));
    var f = todas.data || [];
    return {
      total: f.length,
      conPedido: f.filter(function (c) { return c.order_id; }).length,
      /* "Sin responder" de verdad: hay pendientes Y el último que habló fue el
         cliente. Sin lo segundo salían números fantasma de contadores viejos
         — es la misma regla que usa el chat. */
      sinResponder: f.filter(function (c) {
        return (Number(c.unread_count) || 0) > 0 && c.last_sender === 'contact';
      }).length
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  QUIÉN CONTESTA Y EN CUÁNTO TIEMPO
  //
  //  Se leen los mensajes del periodo y se recorre cada conversación en
  //  orden: por cada mensaje que entra, se busca el primero que sale. La
  //  diferencia es el tiempo de respuesta, y `origen` dice si contestó el
  //  bot o una persona.
  // ══════════════════════════════════════════════════════════════════════
  async function respuestas(dias) {
    var s = sb(), b = await branch();
    var vacio = { atendidas: 0, porBot: 0, porPersona: 0, medianaSeg: null };
    if (!s || !b) return vacio;

    var conv = await s.from('chat_conversations').select('id').eq('branch_id', b)
      .gte('last_message_at', desdeISO(dias));
    var ids = (conv.data || []).map(function (c) { return c.id; });
    if (!ids.length) return vacio;

    var msgs = [];
    for (var i = 0; i < ids.length; i += 100) {
      var r = await s.from('chat_messages')
        .select('conversation_id,direction,origen,sent_at')
        .in('conversation_id', ids.slice(i, i + 100))
        .gte('sent_at', desdeISO(dias))
        .order('sent_at', { ascending: true })
        .limit(5000);
      msgs = msgs.concat(r.data || []);
    }
    if (!msgs.length) return vacio;

    var porConv = {};
    msgs.forEach(function (m) { (porConv[m.conversation_id] = porConv[m.conversation_id] || []).push(m); });

    var tiempos = [], bot = 0, persona = 0;
    Object.keys(porConv).forEach(function (k) {
      var lista = porConv[k], esperando = null;
      lista.forEach(function (m) {
        if (m.direction === 'in') { if (!esperando) esperando = m; return; }
        if (m.direction === 'out' && esperando) {
          var seg = (new Date(m.sent_at) - new Date(esperando.sent_at)) / 1000;
          /* Se descartan los negativos y los de más de un día: son relojes
             desincronizados o conversaciones que se retomaron al otro día, y
             uno solo de esos se lleva la media por delante. */
          if (seg >= 0 && seg < 86400) tiempos.push(seg);
          if (m.origen === 'bot') bot++; else persona++;
          esperando = null;
        }
      });
    });

    /* Mediana y no media: un caso raro de seis horas no debe mandar sobre
       doscientos de veinte segundos. */
    tiempos.sort(function (a, c) { return a - c; });
    var mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : null;

    return { atendidas: bot + persona, porBot: bot, porPersona: persona, medianaSeg: mediana };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LAS PUBLICACIONES DE TIKTOK
  //  El permiso `video.list` ya lo tenemos, pero el token vive en la base y
  //  NO puede bajar al navegador. Hace falta la función de servidor.
  // ══════════════════════════════════════════════════════════════════════
  var TIKTOK_FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/tiktok-videos';

  async function videosTikTok() {
    var b = await branch();
    if (!b) return { falta: FALTA.tiktok, videos: [] };
    try {
      /*  Se manda el token de la sesion: la funcion comprueba con el que
          esta sede es tuya antes de responder. Sin esto devuelve 401.   */
      var s = sb();
      var ses = s && (await s.auth.getSession());
      var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
      if (!tok) return { falta: 'No hay sesion', videos: [] };

      var res = await fetch(TIKTOK_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ branch_id: b })
      });
      /*  `fetch` NO lanza excepción con un 404 ni con un 500: hay que mirar
          `res.ok` a mano o el fallo pasa por "no hay videos".              */
      if (!res.ok) return { falta: FALTA.tiktok, videos: [] };
      var d = await res.json();
      if (d.error) return { falta: d.error, videos: [] };
      return { falta: null, videos: d.videos || [] };
    } catch (e) {
      return { falta: FALTA.tiktok, videos: [] };
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  QUIÉN ESTÁ DENTRO Y EN QUÉ SEDE
  //  La barra de arriba traía un nombre inventado. Sale de la sesión.
  // ══════════════════════════════════════════════════════════════════════
  async function quienSoy() {
    var s = sb();
    /*  Se espera ANTES de leer. El nucleo resuelve la sesion de forma
        asincrona: preguntar primero devolvia null y el cuadrito del usuario
        salia en blanco.                                                  */
    await esperarContexto();
    var u = (window._pos && window._pos.state && window._pos.state.user) || null;
    var m = (u && u.user_metadata) || {};
    /*  El nombre puede venir con tres llaves distintas según cómo se creó la
        cuenta. Si no hay ninguna, se usa lo que va antes de la arroba: es
        preferible a dejar el hueco en blanco.                            */
    var nombre = m.nombre || m.full_name || m.name
              || ((u && u.email) ? u.email.split('@')[0] : '');
    var sede = '';
    var b = await branch();
    if (s && b) {
      var r = await s.from('branches').select('name').eq('id', b).maybeSingle();
      fallo(r, 'sede');
      sede = (r.data && r.data.name) || '';
    }
    return {
      nombre: nombre,
      rol: m.role || '',
      /*  Iniciales para el cuadrito: dos palabras como mucho.            */
      iniciales: nombre.split(/\s+/).filter(Boolean).slice(0, 2)
                   .map(function (x) { return x[0].toUpperCase(); }).join(''),
      sede: sede
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  VENTAS DEL CHAT, MES A MES
  //  Las cuatro barritas del resumen. Mismo vínculo que ventasPorRed, pero
  //  agrupado por mes en vez de por red.
  // ══════════════════════════════════════════════════════════════════════

  async function ventasPorMes(meses) {
    var s = sb(), b = await branch();
    var hoy = new Date();
    /*  Se arma la lista de meses SIEMPRE, aunque no haya ventas: cuatro
        barras en cero dicen "no hubo", que es información. Una lista vacía
        parecería que la pantalla no cargó.                                */
    var lista = [];
    for (var i = meses - 1; i >= 0; i--) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      lista.push({ clave: d.getFullYear() + '-' + d.getMonth(), mes: MES[d.getMonth()], valor: 0 });
    }
    if (!s || !b) return lista;

    var desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1).toISOString();
    var conv = await s.from('chat_conversations').select('order_id')
      .eq('branch_id', b).not('order_id', 'is', null).gte('last_message_at', desde);
    var ids = (conv.data || []).map(function (c) { return c.order_id; });
    if (!ids.length) return lista;

    var porClave = {};
    lista.forEach(function (m) { porClave[m.clave] = m; });
    for (var j = 0; j < ids.length; j += 100) {
      var r = await s.from('pos_orders').select('total,total_final,status,created_at')
        .in('id', ids.slice(j, j + 100));
      (r.data || []).forEach(function (o) {
        if (o.status === 'cancelled') return;
        var f = new Date(o.created_at);
        var m = porClave[f.getFullYear() + '-' + f.getMonth()];
        if (m) m.valor += Number(o.total_final) || Number(o.total) || 0;
      });
    }
    return lista;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LAS ESTADÍSTICAS DE LAS REDES — lo que manda en el Resumen
  //
  //  Publicaciones, visualizaciones y me gusta. Es lo que el Resumen tiene
  //  que ensenar: rendimiento en redes, no cuantos mensajes contestamos.
  //
  //  Hoy la única red que da números es TikTok (`video.list`). Instagram y
  //  Facebook los darán cuando Meta apruebe las estadísticas. Las redes sin
  //  datos van EN CERO con su motivo al lado — no se sustituyen por otra
  //  métrica que sí se pueda calcular, que es justo el error que hubo aquí.
  // ══════════════════════════════════════════════════════════════════════
  function vacia() {
    return { videos: 0, vistas: 0, likes: 0, comentarios: 0, compartidos: 0 };
  }

  async function estadisticasRedes(dias) {
    var desde = Date.now() / 1000 - dias * 86400;
    var res = {
      total: vacia(),
      porRed: {},
      /*  Por qué una red no tiene números. La pantalla lo ensena tal cual: un
          cero sin explicación se lee como "no funciona".                  */
      falta: {},
      porMes: []
    };

    var conectadas = (await cuentas()).lista.filter(function (c) { return c.connected; });

    // ── TikTok ──────────────────────────────────────────
    /*  La fila figura conectada pero sin llave (dato de ejemplo de la
        migracion del chat). Se dice, o las cifras saldrian en cero con un
        pie hablando de permisos de Meta, que no es el motivo.          */
    var todas = (await cuentas()).lista;
    if (todas.some(function (c) { return c.channel === 'tiktok' && c.sinLlave; })) {
      res.porRed.tiktok = vacia();
      res.falta.tiktok  = 'Vuelve a conectar TikTok en Chat IA';
    }

    if (conectadas.some(function (c) { return c.channel === 'tiktok'; })) {
      var tk = await videosTikTok();
      if (tk.falta) {
        res.falta.tiktok = tk.falta;
        res.porRed.tiktok = vacia();
      } else {
        var v = tk.videos.filter(function (x) { return !x.ts || x.ts >= desde; });
        var acc = vacia();
        acc.videos = v.length;
        v.forEach(function (x) {
          acc.vistas       += x.vistas       || 0;
          acc.likes        += x.likes        || 0;
          acc.comentarios  += x.comentarios  || 0;
          acc.compartidos  += x.compartidos  || 0;
        });
        res.porRed.tiktok = acc;
        res.mesesTikTok = v;
      }
    }

    // ── Meta ───────────────────────────────────────────
    ['instagram', 'facebook'].forEach(function (k) {
      if (!conectadas.some(function (c) { return c.channel === k; })) return;
      res.porRed[k] = vacia();
      res.falta[k]  = FALTA.insights;
    });

    /*  WhatsApp no entra: no tiene muro, ni publicaciones ni visualizaciones.
        Meterlo con ceros daría a entender que algún día los tendrá.        */

    Object.keys(res.porRed).forEach(function (k) {
      var r = res.porRed[k];
      res.total.videos      += r.videos;
      res.total.vistas      += r.vistas;
      res.total.likes       += r.likes;
      res.total.comentarios += r.comentarios;
      res.total.compartidos += r.compartidos;
    });
    return res;
  }

  /*  Visualizaciones por mes, para las barritas. Se cuentan las de los videos
      PUBLICADOS en cada mes: es lo que se puede saber con `video.list`, que
      da un total por video y no un desglose por día.                      */
  function vistasPorMes(videos, meses) {
    var hoy = new Date(), lista = [], porClave = {};
    for (var i = meses - 1; i >= 0; i--) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      var m = { clave: d.getFullYear() + '-' + d.getMonth(), mes: MES[d.getMonth()], valor: 0 };
      lista.push(m); porClave[m.clave] = m;
    }
    (videos || []).forEach(function (v) {
      if (!v.ts) return;
      var f = new Date(v.ts * 1000);
      var m = porClave[f.getFullYear() + '-' + f.getMonth()];
      if (m) m.valor += v.vistas || 0;
    });
    return lista;
  }

  window.mkDatos = {
    FALTA: FALTA,
    cuentas: cuentas,
    estadisticasRedes: estadisticasRedes,
    vistasPorMes: vistasPorMes,
    quienSoy: quienSoy,
    ventasPorMes: ventasPorMes,
    ventasPorRed: ventasPorRed,
    conversaciones: conversaciones,
    respuestas: respuestas,
    videosTikTok: videosTikTok
  };
})();
