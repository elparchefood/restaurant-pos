/* ═══════════════════════════════════════════════════════════════════════════
   pos-arranque.js — La puesta en marcha de un restaurante nuevo
   ───────────────────────────────────────────────────────────────────────────
   Diseño de Sergio, 24-ago-2026:

     "No se bloquea nada. Lo único que se va a bloquear es la apertura de caja.
      Con eso ya tenemos todo, porque si no puede abrir caja tampoco va a poder
      vender... La información no puede ir toda de golpe: el modal solo le va a
      decir paso a paso. Pero sí le va a mostrar un conteo, paso 1 de 10."

   UN SOLO CANDADO, NO DIEZ. Tapar pantalla por pantalla era el camino de
   siempre —y el que deja al dueño trancado sin salida, porque justo las
   pantallas que necesita para resolverlo son las que se le taparían—. Abrir
   caja es el único sitio de todo el sistema por donde pasa una venta, así que
   con frenar ahí basta. Y encima es UNA sola función: `handleOpenSession`.

   ── LA TRAMPA DE LAS MESAS, Y CÓMO SE RESUELVE ──────────────────────────
   Un restaurante de solo domicilios no tiene salón y no crearía una mesa
   jamás. Si las mesas fueran obligatorias a secas, ese negocio no podría abrir
   caja NUNCA. Solución de Sergio: el paso se exige, pero trae un botón de
   "Solo vendo domicilios" que lo da por resuelto.

   Ese botón NO es una casilla de "ya lo hice": guarda un dato real del negocio
   (`operacion_config.sin_salon`), se puede cambiar de opinión, y el día que
   creen una mesa el paso se da por hecho igual.

   ── EL ESTADO SALE DE LOS DATOS, SIEMPRE ────────────────────────────────
   Ningún paso se marca "hecho" porque alguien le dio a un botón. Se comprueba
   contra la base cada vez. Si mañana borran todos los productos, el paso
   vuelve solo — que es lo correcto: el sistema volvió a estar sin carta.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  function sb() { return (w._pos && w._pos.sb) || w.sb || null; }
  function st() { return (w._pos && w._pos.state) || {}; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── LOS PASOS ──────────────────────────────────────────────────────────
     El orden es el del primer día, no el del menú: lo que hace falta para
     cobrar va antes que lo que hace falta para atender bien.

     `obligatorio` = sin esto no se abre caja.

     Los textos dicen QUÉ PASA si falta, no el nombre técnico de la pantalla:
     "sin productos no hay nada que vender" se entiende; "configurar catálogo"
     no dice por qué importa. */
  var PASOS = [
    { id: 'carta', obligatorio: true,
      titulo: 'Carga tu carta',
      sub: 'Sin productos no hay nada que vender.',
      ir: 'catalogo-productos.html',
      hecho: function (d) { return d.productos > 0; } },

    { id: 'pagos', obligatorio: true,
      titulo: 'Di cómo te pagan',
      sub: 'Efectivo, transferencia… sin esto no se puede cerrar una cuenta.',
      ir: 'configuracion.html?s=pagos',
      hecho: function (d) { return d.metodos > 0; } },

    { id: 'local', obligatorio: true,
      titulo: 'Pon la dirección y el teléfono',
      sub: 'Salen en el recibo, en la comanda y en lo que el asistente le responde a quien pregunte dónde quedas.',
      ir: 'configuracion.html?s=general',
      hecho: function (d) { return d.direccion && d.telefono; } },

    { id: 'mesas', obligatorio: true,
      titulo: 'Dibuja tu salón',
      sub: 'Las mesas y las zonas donde vas a atender.',
      ir: 'configuracion.html?s=mesas',
      /* La salida para quien no tiene salón. Ver la nota de arriba. */
      salida: { texto: 'Solo vendo domicilios' },
      hecho: function (d) { return d.mesas > 0 || d.sinSalon === true; } },

    { id: 'pin', obligatorio: false,
      titulo: 'Ponle un PIN al administrador',
      sub: 'Es el que autoriza descuentos y anulaciones. Sin él, un empleado sin permiso se queda trancado y no hay cómo dejarlo pasar.',
      ir: 'configuracion.html?s=usuarios',
      hecho: function (d) { return d.pin; } },

    { id: 'equipo', obligatorio: false,
      titulo: 'Crea las cuentas de tu equipo',
      sub: 'Cada cajero, mesero o domiciliario con la suya y su rol. De ahí salen los permisos.',
      ir: 'configuracion.html?s=usuarios',
      hecho: function (d) { return d.usuarios > 1; } },

    { id: 'horarios', obligatorio: false,
      titulo: 'Pon tus horarios',
      sub: 'Sin ellos el asistente no sabe si estás abierto, y esa es la primera pregunta que hace medio mundo.',
      ir: 'configuracion.html?s=horario',
      hecho: function (d) { return d.horarios; } },

    { id: 'domicilios', obligatorio: false,
      titulo: 'Define tus zonas de domicilio',
      sub: 'Cuánto vale llevar a cada barrio. Es lo que decide si el cliente pide o no.',
      ir: 'configuracion.html?s=domicilios',
      hecho: function (d) { return d.zonas > 0; } },

    { id: 'fotos', obligatorio: false,
      titulo: 'Súbele fotos a tu carta',
      sub: 'Son las imágenes que el asistente manda cuando le piden la carta. Sin ellas contesta que no puede enviarla.',
      ir: 'catalogo-productos.html',
      hecho: function (d) { return d.fotos > 0; } },

    { id: 'adiciones', obligatorio: false,
      titulo: 'Carga tus adiciones',
      sub: 'Una salchicha extra, una salsa. Si las vendes y no están cargadas, no se cobran.',
      ir: 'catalogo-productos.html',
      hecho: function (d) { return d.adiciones > 0; } },

    { id: 'impresoras', obligatorio: false,
      titulo: 'Conecta tus impresoras',
      sub: 'Para que la comanda salga en cocina y el recibo en caja.',
      ir: 'impresoras.html',
      hecho: function (d) { return d.impresoras > 0; } },
  ];

  var _real = null;        // la última foto real, para no consultar en cada clic
  var _cargando = null;

  /* Una sola tanda de preguntas, todas a la vez. Con `head:true` y `count` no
     viajan las filas: solo cuántas hay. Preguntar "¿hay algún producto?" no
     tiene por qué traerse los 54. */
  async function datos() {
    var s = sb(), t = st().tenantId, b = st().branchId;
    if (!s || !t) return null;
    var r = await Promise.allSettled([
      s.from('pos_products').select('id', { count: 'exact', head: true }).eq('tenant_id', t),
      s.from('pos_tables').select('id', { count: 'exact', head: true }).eq('branch_id', b),
      s.from('ia_config').select('pagos,horarios,domicilios').eq('branch_id', b).maybeSingle(),
      s.from('branches').select('address,phone,operacion_config').eq('id', b).maybeSingle(),
      s.from('pos_users').select('id,pin,is_authorized_admin').eq('tenant_id', t),
      s.from('pos_products').select('id', { count: 'exact', head: true }).eq('tenant_id', t).not('photo_url', 'is', null),
      s.from('pos_modifier_groups').select('id', { count: 'exact', head: true }).eq('tenant_id', t),
      s.from('pos_printers').select('id', { count: 'exact', head: true }).eq('branch_id', b),
    ]);
    function ok(i) { return r[i].status === 'fulfilled' ? r[i].value : null; }
    function cuenta(i) { var x = ok(i); return x ? (x.count || 0) : 0; }

    var cfg  = (ok(2) && ok(2).data) || {};
    var sede = (ok(3) && ok(3).data) || {};
    var users = (ok(4) && ok(4).data) || [];
    var pg  = cfg.pagos || {};
    var dom = cfg.domicilios || {};
    var opc = sede.operacion_config || {};

    return {
      productos: cuenta(0),
      mesas: cuenta(1),
      /* Un método sin nombre o apagado no cuenta: no se puede cobrar con él.
         Los que empiezan por `__` son internos, no los eligió el dueño. */
      metodos: (Array.isArray(pg.metodos) ? pg.metodos : []).filter(function (m) {
        return m && m.activo !== false && String(m.nombre || '').trim() && !/^__/.test(String(m.id || ''));
      }).length,
      direccion: !!String(sede.address || '').trim(),
      telefono: !!String(sede.phone || '').trim(),
      sinSalon: opc.sin_salon === true,
      /* El PIN es el del ADMINISTRADOR, no el de cualquiera: es el que
         autoriza. Un mesero con PIN no resuelve este paso. */
      pin: users.some(function (u) { return u.is_authorized_admin && String(u.pin || '').trim(); }),
      usuarios: users.length,
      horarios: !!(cfg.horarios && Object.keys(cfg.horarios).length),
      zonas: (Array.isArray(dom.zonas) ? dom.zonas : []).length,
      fotos: cuenta(5),
      adiciones: cuenta(6),
      impresoras: cuenta(7),
    };
  }

  /* Revisa TODO y devuelve la foto completa. `forzar` salta lo ya consultado:
     se usa al volver de configurar algo, para que el paso recién resuelto
     desaparezca sin recargar la página. */
  async function revisar(forzar) {
    if (_real && !forzar) return _real;
    if (_cargando && !forzar) return _cargando;
    _cargando = (async function () {
      var d = await datos();
      _cargando = null;
      if (!d) return _real;                 // sin sesión: se deja lo que hubiera
      var pasos = PASOS.map(function (p) {
        var hecho = false;
        try { hecho = !!p.hecho(d); } catch (e) { hecho = true; }   // ante la duda, no estorbar
        return { id: p.id, titulo: p.titulo, sub: p.sub, ir: p.ir,
                 obligatorio: p.obligatorio, salida: p.salida || null, hecho: hecho };
      });
      var faltan = pasos.filter(function (p) { return !p.hecho; });
      _real = {
        pasos: pasos,
        faltan: faltan,
        faltanObligatorios: faltan.filter(function (p) { return p.obligatorio; }),
        siguiente: faltan[0] || null,
        hechos: pasos.length - faltan.length,
        total: pasos.length,
        datos: d,
      };
      return _real;
    })();
    return _cargando;
  }

  /* ¿Se puede abrir caja? Solo con el dato ya consultado. Si no se ha
     revisado, se DEJA PASAR: frenarle la caja a alguien por una consulta que
     no ha vuelto es mucho peor que dejar abrir la caja de un restaurante a
     medio configurar. */
  function puedeAbrirCaja() {
    if (!_real) return true;
    return _real.faltanObligatorios.length === 0;
  }

  /* "Solo vendo domicilios". Guarda el dato del negocio, no una marca de
     "ya lo vi": se puede revertir desde Configuración y el resto del sistema
     lo respeta. */
  async function marcarSinSalon() {
    var s = sb(), b = st().branchId;
    if (!s || !b) return false;
    try {
      var r = await s.from('branches').select('operacion_config').eq('id', b).maybeSingle();
      var opc = (r.data && r.data.operacion_config) || {};
      opc.sin_salon = true;
      var u = await s.from('branches').update({ operacion_config: opc }).eq('id', b);
      if (u.error) return false;
      await revisar(true);
      return true;
    } catch (e) { return false; }
  }

  // ── EL MODAL, DE A UN PASO ────────────────────────────────────────────
  function cerrar() {
    var m = document.getElementById('arranque-modal');
    if (m) m.remove();
  }

  /* Muestra UN paso. Nunca la lista entera: pedido expreso de Sergio.
     `bloqueante` cambia el tono, no el contenido: es el mismo paso, pero
     explicando que por eso no se puede abrir caja. */
  function mostrar(opts) {
    opts = opts || {};
    /* `opts.foto` es la puerta del banco de pruebas (tests/ver-arranque.html):
       deja ver el modal con un restaurante inventado sin tocar la base. En el
       uso normal no se pasa y se usa lo ultimo consultado. */
    var _ultimo = opts.foto || _real;
    if (!_ultimo || !_ultimo.siguiente) return false;

    /* Cuando frena la caja se muestra el primer OBLIGATORIO que falte, no el
       primero de la lista: si ya solo le faltan sugerencias, la caja abre y
       este modal no tendría por qué salir. */
    var p = opts.bloqueante
      ? (_ultimo.faltanObligatorios[0] || _ultimo.siguiente)
      : _ultimo.siguiente;
    if (!p) return false;

    /* El conteo cuenta TODO, hecho y por hacer: "paso 3 de 11" le dice dónde
       va. Un "faltan 8" no dice si empezó ayer o si va por la mitad. */
    var nEste = 0;
    for (var i = 0; i < _ultimo.pasos.length; i++) {
      if (_ultimo.pasos[i].id === p.id) { nEste = i + 1; break; }
    }
    var pct = Math.round((_ultimo.hechos / _ultimo.total) * 100);

    cerrar();
    var ov = document.createElement('div');
    ov.id = 'arranque-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);'
      + 'z-index:99500;display:flex;align-items:center;justify-content:center;padding:20px;'
      + 'font-family:DM Sans,system-ui,sans-serif';

    var partes = [];
    partes.push('<div style="background:#fff;border-radius:18px;width:440px;max-width:100%;overflow:hidden;'
      + 'box-shadow:0 30px 70px -20px rgba(15,23,42,.4)">');
    partes.push('<div style="padding:24px 26px 0">');
    partes.push('<div style="font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:'
      + (opts.bloqueante ? '#DC2626' : '#94A3B8') + ';margin-bottom:10px">'
      + (opts.bloqueante ? 'Para poder abrir caja' : 'Puesta en marcha') + '</div>');

    /* La barra y el "paso N de M": lo que convierte una lista larga en algo
       que se ve avanzar. */
    partes.push('<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
      + '<div style="flex:1;height:6px;background:#F1F5F9;border-radius:999px;overflow:hidden">'
      + '<i style="display:block;height:100%;width:' + pct + '%;background:#5B6BFF;border-radius:999px"></i>'
      + '</div>'
      + '<div style="font-size:11.5px;font-weight:700;color:#64748B;white-space:nowrap;'
      + 'font-variant-numeric:tabular-nums">Paso ' + nEste + ' de ' + _ultimo.total + '</div>'
      + '</div>');

    partes.push('<div style="font-size:19px;font-weight:800;letter-spacing:-.02em;color:#0F172A;'
      + 'margin-bottom:8px;text-wrap:balance">' + esc(p.titulo) + '</div>');
    partes.push('<div style="font-size:13.5px;color:#475569;line-height:1.6">' + esc(p.sub) + '</div>');

    if (opts.bloqueante) {
      partes.push('<div style="margin-top:14px;padding:11px 13px;background:#FEF2F2;border:1px solid #FECACA;'
        + 'border-radius:11px;font-size:12.5px;color:#B91C1C;line-height:1.5">'
        + 'La caja no se abre hasta que esto esté listo. Es lo mínimo para poder cobrar.</div>');
    }
    partes.push('</div>');

    partes.push('<div style="display:flex;gap:9px;padding:20px 26px 22px;margin-top:20px">');
    if (p.salida) {
      partes.push('<button id="arr-salida" style="flex:1;padding:11px;border:1.5px solid #E2E8F0;background:#fff;'
        + 'border-radius:11px;font-size:13px;font-weight:600;color:#475569;cursor:pointer;font-family:inherit">'
        + esc(p.salida.texto) + '</button>');
    } else if (!opts.bloqueante) {
      partes.push('<button id="arr-luego" style="flex:1;padding:11px;border:1.5px solid #E2E8F0;background:#fff;'
        + 'border-radius:11px;font-size:13px;font-weight:600;color:#64748B;cursor:pointer;font-family:inherit">'
        + 'Ahora no</button>');
    }
    partes.push('<button id="arr-ir" style="flex:1.5;padding:11px;border:none;background:#5B6BFF;color:#fff;'
      + 'border-radius:11px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;'
      + 'box-shadow:0 2px 8px -2px rgba(91,107,255,.45)">Configurarlo ahora</button>');
    partes.push('</div></div>');

    ov.innerHTML = partes.join('');
    document.body.appendChild(ov);

    ov.onclick = function (e) { if (e.target === ov) cerrar(); };
    var l = ov.querySelector('#arr-luego');
    if (l) l.onclick = cerrar;

    ov.querySelector('#arr-ir').onclick = function () {
      cerrar();
      w.location.href = p.ir;
    };

    var sal = ov.querySelector('#arr-salida');
    if (sal) {
      sal.onclick = async function () {
        sal.disabled = true;
        sal.textContent = 'Guardando…';
        var listo = await marcarSinSalon();
        if (!listo) { sal.disabled = false; sal.textContent = p.salida.texto; return; }
        cerrar();
        /* Encadena con el SIGUIENTE paso en vez de dejar la pantalla muda: es
           lo que hace que se sienta un recorrido y no diez avisos sueltos. */
        if (_ultimo && _ultimo.siguiente) mostrar(opts);
      };
    }
    return true;
  }

  /* Frena la apertura de caja. Devuelve true si se puede seguir.
     Se llama con `await` desde caja.js, justo antes de guardar el turno. */
  async function exigirParaCaja() {
    await revisar(true);          // siempre fresco: es la decisión que frena una venta
    if (puedeAbrirCaja()) return true;
    mostrar({ bloqueante: true });
    return false;
  }

  w.posArranque = {
    revisar: revisar,
    puedeAbrirCaja: puedeAbrirCaja,
    exigirParaCaja: exigirParaCaja,
    mostrar: mostrar,
    cerrar: cerrar,
    marcarSinSalon: marcarSinSalon,
    ultimo: function () { return _real; },
  };
})(window);
