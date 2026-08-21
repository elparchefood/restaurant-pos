/* ══════════════════════════════════════════════════════════════════════
   POS-MAPA — el mapa de Cobra, sin darle la llave al navegador
   (21-ago-2026)

   COMO FUNCIONA Y POR QUE ASI:

   La imagen del mapa la pide el servidor a Google y la devuelve ya hecha,
   asi que la llave del restaurante nunca baja aqui. Si bajara, cualquiera
   que abra esta pantalla podria sacarla y gastarle el cupo —y el cobro le
   llega a el, porque es SU tarjeta.

   Los puntos (el domiciliario moviendose, la casa del cliente) NO se los
   pedimos a Google: los dibuja Cobra encima de la imagen, calculando en
   que pixel cae cada coordenada. Es la misma cuenta que usa Google para
   armar la imagen, asi que caen exactamente donde deben.

   La ganancia es grande: el domiciliario puede moverse mil veces y la
   imagen de fondo sigue siendo la misma. Mover el punto NO le cuesta al
   restaurante ni una sola llamada. De la otra forma —pidiendole a Google
   una imagen nueva con el punto ya dibujado— cada cuadra que avanzara
   seria una llamada mas que pagar.
   ══════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  var SB_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
  var TAM = 256;   // el lado de un mosaico de mapa, en pixeles. Es el estandar.

  function cliente() {
    return (w._pos && w._pos.sb) || w.sb || null;
  }

  /* ── La cuenta de siempre: coordenadas → pixeles ─────────────────────
     Proyeccion de Mercator, la misma que usa Google. A una latitud dada
     le corresponde SIEMPRE el mismo pixel para un zoom dado; por eso se
     puede dibujar encima de la imagen sin volver a preguntarle a nadie. */
  function proyectar(lat, lng, zoom) {
    var escala = TAM * Math.pow(2, zoom);
    var x = (lng + 180) / 360 * escala;
    var senLat = Math.sin(lat * Math.PI / 180);
    //  Se recorta a ±85° porque en los polos la cuenta se va al infinito.
    senLat = Math.max(-0.9999, Math.min(0.9999, senLat));
    var y = (0.5 - Math.log((1 + senLat) / (1 - senLat)) / (4 * Math.PI)) * escala;
    return { x: x, y: y };
  }

  /* Que zoom hace falta para que TODOS los puntos quepan en la imagen. */
  function zoomQueQuepa(puntos, ancho, alto, margen) {
    if (puntos.length < 2) return 15;
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    puntos.forEach(function (p) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    });
    for (var z = 18; z >= 3; z--) {
      var a = proyectar(minLat, minLng, z), b = proyectar(maxLat, maxLng, z);
      if (Math.abs(b.x - a.x) < ancho - margen && Math.abs(b.y - a.y) < alto - margen) return z;
    }
    return 3;
  }

  function centroDe(puntos) {
    var sLat = 0, sLng = 0;
    puntos.forEach(function (p) { sLat += p.lat; sLng += p.lng; });
    return { lat: sLat / puntos.length, lng: sLng / puntos.length };
  }

  /* ── Los alfileres ───────────────────────────────────────────────────
     Se dibujan con SVG en linea, no con imagenes: asi no hay una segunda
     descarga y el color sale de los mismos tokens del producto. */
  var PIN = {
    destino: { color: '#DC2626', d: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z' },
    negocio: { color: '#0F172A', d: 'M3 9l1-5h16l1 5v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 12v8h14v-8' },
    domi:    { color: '#5B6BFF', d: 'M5.5 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm13 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM15 17.5H9l-2-8H4' }
  };

  function svgPin(tipo) {
    var p = PIN[tipo] || PIN.destino;
    return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" '
      + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" '
      + 'style="background:' + p.color + ';border-radius:999px;padding:5px;box-sizing:border-box;'
      + 'box-shadow:0 2px 8px -1px rgba(15,23,42,.45)">'
      + '<path d="' + p.d + '"/></svg>';
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ══════════════════════════════════════════════════════════════════
     DIBUJAR
     opciones = {
       puntos: [{lat, lng, tipo:'destino'|'negocio'|'domi', etiqueta}],
       alto:   pixeles (por defecto 320)
     }
     ══════════════════════════════════════════════════════════════════ */
  async function pintar(cont, opciones) {
    if (!cont) return;
    opciones = opciones || {};
    var puntos = (opciones.puntos || []).filter(function (p) {
      return p && isFinite(p.lat) && isFinite(p.lng);
    });

    if (!puntos.length) {
      cont.innerHTML = aviso('Todavía no sabemos dónde queda esta dirección.',
        'Cuando el domiciliario entregue, su celular deja el punto exacto guardado.');
      return;
    }

    var ancho = Math.min(640, Math.max(200, cont.clientWidth || 600));
    var alto = Math.min(640, opciones.alto || 320);
    var centro = puntos.length === 1 ? puntos[0] : centroDe(puntos);
    var zoom = puntos.length === 1 ? (opciones.zoom || 16)
             : zoomQueQuepa(puntos, ancho, alto, 90);

    var ses = await (cliente() ? cliente().auth.getSession() : Promise.resolve(null));
    var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
    if (!tok) { cont.innerHTML = aviso('Tu sesión se venció.', 'Vuelve a entrar para ver el mapa.'); return; }

    var url = SB_URL + '/functions/v1/mapa?accion=estatico'
      + '&lat=' + centro.lat + '&lng=' + centro.lng
      + '&zoom=' + zoom + '&w=' + Math.round(ancho) + '&h=' + Math.round(alto);

    /* La imagen se pide con fetch —y no con un <img src>— porque hay que
       mandar el token de la sesion. El servidor comprueba de que
       restaurante es antes de gastarle una llamada a nadie. */
    var blob = null, fallo = null;
    try {
      var r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
      if (r.status === 409) fallo = 'sin_conectar';
      else if (r.status === 429) fallo = 'tope';
      else if (!r.ok) fallo = 'error';
      else blob = await r.blob();
    } catch (e) { fallo = 'error'; }

    if (fallo === 'sin_conectar') {
      cont.innerHTML = aviso('El mapa necesita tu cuenta de Google.',
        'Conéctala en Configuración › Domicilios. Sin eso, todo lo demás sigue funcionando igual.');
      return;
    }
    if (fallo === 'tope') {
      cont.innerHTML = aviso('Llegaste al tope de consultas del mes.',
        'El mapa vuelve el mes entrante, o súbelo en Configuración › Domicilios.');
      return;
    }
    if (fallo || !blob) {
      cont.innerHTML = aviso('No se pudo cargar el mapa.', 'Revisa tu conexión e intenta otra vez.');
      return;
    }

    var src = URL.createObjectURL(blob);
    var c = proyectar(centro.lat, centro.lng, zoom);

    var marcas = puntos.map(function (p) {
      var q = proyectar(p.lat, p.lng, zoom);
      var x = ancho / 2 + (q.x - c.x);
      var y = alto / 2 + (q.y - c.y);
      //  Un punto que caiga fuera de la imagen no se dibuja: quedaria
      //  pegado al borde diciendo una mentira sobre donde esta.
      if (x < 0 || y < 0 || x > ancho || y > alto) return '';
      return '<div style="position:absolute;left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;'
        + 'transform:translate(-50%,-50%);transition:left .8s linear,top .8s linear"'
        + ' data-mapa-pin="' + esc(p.tipo || 'destino') + '">'
        + svgPin(p.tipo)
        + (p.etiqueta
            ? '<div style="position:absolute;left:50%;top:34px;transform:translateX(-50%);'
              + 'white-space:nowrap;background:#fff;border:1px solid #ECEEF2;border-radius:7px;'
              + 'padding:2px 7px;font-size:10.5px;font-weight:700;color:#0F172A;'
              + 'box-shadow:0 1px 4px rgba(15,23,42,.18)">' + esc(p.etiqueta) + '</div>'
            : '')
        + '</div>';
    }).join('');

    /* EL RECUADRO MIDE EXACTAMENTE LO QUE SE LE PIDIO A GOOGLE.
       Antes iba a 'width:100%' con 'object-fit:cover': si el contenedor
       resultaba mas ancho que la imagen (Google no la da de mas de 640
       pixeles), el navegador la estiraba y recortaba... pero los alfileres
       se siguen ubicando con la cuenta original. O sea que el punto del
       cliente quedaria dibujado a media cuadra de donde de verdad esta,
       y nadie se daria cuenta mirando la pantalla. */
    cont.innerHTML =
      '<div style="position:relative;width:' + Math.round(ancho) + 'px;max-width:100%;'
      + 'height:' + alto + 'px;margin:0 auto;border-radius:14px;'
      + 'overflow:hidden;border:1px solid #ECEEF2;background:#F1F5F9">'
      + '<img src="' + src + '" alt="Mapa" style="width:100%;height:100%;display:block">'
      + marcas
      + '</div>';

    //  El navegador ya tiene la imagen; se suelta la referencia para no
    //  dejar memoria colgada cada vez que se repinta.
    var img = cont.querySelector('img');
    if (img) img.onload = function () { URL.revokeObjectURL(src); };

    return { centro: centro, zoom: zoom, ancho: ancho, alto: alto };
  }

  function aviso(titulo, sub) {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'gap:7px;text-align:center;padding:34px 22px;border:1.5px dashed #DCE0E8;border-radius:14px;'
      + 'background:#FBFBFD;min-height:150px">'
      + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
      + '<div style="font-size:13px;font-weight:700;color:#475569">' + esc(titulo) + '</div>'
      + '<div style="font-size:12px;color:#94A3B8;line-height:1.6;max-width:280px">' + esc(sub) + '</div>'
      + '</div>';
  }

  /* ── Dónde queda una dirección ───────────────────────────────────────
     Pregunta al servidor, que mira PRIMERO lo que ya se sabe. A Google
     solo se le pregunta —y se le paga— por una direccion nueva. */
  async function ubicar(direccion, barrio, ciudad) {
    var sb = cliente();
    if (!sb) return null;
    var ses = await sb.auth.getSession();
    var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
    if (!tok) return null;
    try {
      var r = await fetch(SB_URL + '/functions/v1/mapa', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'geocodificar', direccion: direccion, barrio: barrio, ciudad: ciudad })
      });
      var j = await r.json();
      if (j && isFinite(j.lat) && isFinite(j.lng)) return j;
      return j || null;
    } catch (e) { return null; }
  }

  /* ── Por dónde va un domiciliario ─────────────────────────────────── */
  async function ultimaUbicacion(domiciliarioId) {
    var sb = cliente();
    if (!sb || !domiciliarioId) return null;
    var r = await sb.from('pos_domi_ubicaciones')
      .select('lat,lng,created_at')
      .eq('domiciliario_id', domiciliarioId)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    return (r && r.data) || null;
  }

  w.posMapa = {
    pintar: pintar,
    ubicar: ubicar,
    ultimaUbicacion: ultimaUbicacion,
    proyectar: proyectar
  };
})(window);
