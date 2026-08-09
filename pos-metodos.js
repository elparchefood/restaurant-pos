/* pos-metodos.js — LA ÚNICA fuente de métodos de pago.
 *
 * Regla de Sergio: los métodos que él configura en Configuración → Métodos de
 * pago son los únicos que existen. Ninguna pantalla debe inventarse uno.
 *
 * Antes cada pantalla hacía lo suyo:
 *   · la caja comparaba por nombre → lo guardado con id caía en "Otros"
 *     ($437.000 de $550.500 la noche del 7-ago, con el efectivo en $0);
 *   · el tablero adivinaba con una lista de palabras y, lo que no reconocía,
 *     LO CONTABA COMO EFECTIVO — una transferencia guardada con id entraba
 *     como efectivo y descuadraba el arqueo en silencio;
 *   · los informes pintaban una columna llamada "Pm_x719c1pqb".
 *
 * Aquí se traduce cualquier cosa —id, nombre, con mayúsculas o con tildes— al
 * método configurado al que pertenece. Lo que no se reconoce se devuelve como
 * desconocido: es mejor un "Otros" visible que un número mal sumado.
 */
(function (w) {
  'use strict';

  var _mets = null;      // los métodos configurados, ya cargados
  var _porId = {};       // id           -> método
  var _porNom = {};      // nombre normalizado -> método
  var _porTipo = {};     // tipo         -> método (último recurso)

  function norm(v) {
    return String(v == null ? '' : v).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  function indexar(lista) {
    _mets = lista || [];
    _porId = {}; _porNom = {}; _porTipo = {};
    _mets.forEach(function (m) {
      if (m.id) _porId[String(m.id)] = m;
      if (m.nombre) _porNom[norm(m.nombre)] = m;
      /* El nombre con el que se guardaron los pagos viejos. Sin esto, un cobro
         de la semana pasada aparecería en "Otros" al cambiarle el nombre. */
      if (m._alias) _porNom[norm(m._alias)] = m;
      /* El tipo se indexa DESPUÉS del nombre y sin pisarlo: si dos métodos son
         de tipo "transferencia" (Nequi y Daviplata), el tipo solo desempata
         cuando no hay nada mejor. */
      if (m.tipo && !_porTipo[norm(m.tipo)]) _porTipo[norm(m.tipo)] = m;
    });
    return _mets;
  }

  /* Carga los métodos del restaurante. Se pide una sola vez por pantalla. */
  /* "Saldo <negocio>" pasó a llamarse "Billetera <negocio>". El tipo interno
     sigue siendo `saldo` —eso NO se toca, es lo que llevan los pagos ya
     registrados—. Se guarda el nombre viejo como alias para que un pago hecho
     antes del cambio se siga reconociendo. */
  function _renombrarSaldo(m) {
    if (!m || String(m.tipo || '') !== 'saldo') return m;
    var n = String(m.nombre || '');
    if (!/^Saldo\b/i.test(n)) return m;
    var c = {}; for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) c[k] = m[k];
    c.nombre = n.replace(/^Saldo\b/i, 'Billetera');
    c._alias = n;
    return c;
  }

  function _ordenar(lista) {
    return indexar((lista || []).map(_renombrarSaldo)
      .filter(function (m) { return m && String(m.nombre || '').trim(); })
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); }));
  }

  async function _traer(sb, branchId) {
    var r = await sb.from('ia_config').select('pagos').eq('branch_id', branchId).maybeSingle();
    var p = (r && r.data && r.data.pagos) || {};
    return Array.isArray(p.metodos) ? p.metodos : [];
  }

  async function cargar(sb, branchId) {
    if (_mets) return _mets;
    if (!sb || !branchId) return indexar([]);

    /* Lo guardado en el equipo sirve YA: son cuatro nombres que cambian dos
       veces al ano, y siete pantallas estaban esperando esta consulta antes de
       pintar nada. La consulta sale igual, por detras. */
    var g = null;
    try { g = window.posCache && posCache.leer('metodos'); } catch (e) {}
    if (g && Array.isArray(g.datos) && g.datos.length) {
      var listo = _ordenar(g.datos);
      setTimeout(function () {
        _traer(sb, branchId).then(function (arr) {
          if (!arr.length) return;
          if (JSON.stringify(arr) === JSON.stringify(g.datos)) return;   // nada cambio
          _ordenar(arr);
          try { posCache.guardar('metodos', arr); } catch (e) {}
          console.info('[metodos] la lista cambio; ya esta al dia');
        }).catch(function () {});
      }, 0);
      return listo;
    }

    try {
      var arr2 = await _traer(sb, branchId);
      /* Solo se guarda una lista con algo. Una lista vacia puede ser una
         consulta que fallo a medias, y guardarla dejaria la pantalla siguiente
         sin metodos de pago. */
      try { if (window.posCache && arr2.length) posCache.guardar('metodos', arr2); } catch (e) {}
      return _ordenar(arr2);
    } catch (e) { console.warn('[metodos] no se pudieron cargar:', e); return indexar([]); }
  }

  /* Devuelve el método configurado al que corresponde lo guardado, o null. */
  function resolver(valor) {
    var v = String(valor == null ? '' : valor).trim();
    if (!v) return null;
    return _porId[v] || _porNom[norm(v)] || _porTipo[norm(v)] || null;
  }

  /* El nombre para mostrar. Lo que no se reconoce NO se disfraza de nada: se
     devuelve "Otros" para que se vea que hay algo por revisar. */
  function nombre(valor) {
    var m = resolver(valor);
    return m ? m.nombre : 'Otros';
  }

  /* Agrupa una lista de pagos por método configurado.
     Devuelve [{ id, nombre, tipo, monto }] en el orden de la configuración,
     con los no reconocidos al final bajo "Otros". */
  function agrupar(pagos, campoMetodo, campoMonto) {
    var km = campoMetodo || 'method', ka = campoMonto || 'amount';
    var acc = {}, otros = 0;
    (_mets || []).forEach(function (m) { acc[m.id || m.nombre] = 0; });
    (pagos || []).forEach(function (p) {
      var m = resolver(p[km]);
      var v = parseFloat(p[ka]) || 0;
      if (m) acc[m.id || m.nombre] = (acc[m.id || m.nombre] || 0) + v;
      else otros += v;
    });
    var filas = (_mets || []).map(function (m) {
      return { id: m.id || m.nombre, nombre: m.nombre, tipo: m.tipo || 'otro',
               monto: acc[m.id || m.nombre] || 0 };
    });
    if (otros > 0) filas.push({ id: '__otros', nombre: 'Otros', tipo: 'otro', monto: otros });
    return filas;
  }

  function lista() { return _mets || []; }

  w.posMetodos = { cargar: cargar, resolver: resolver, nombre: nombre,
                   agrupar: agrupar, lista: lista, norm: norm };
})(window);
