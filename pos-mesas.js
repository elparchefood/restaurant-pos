/* pos-mesas.js — Mesas unidas. UN solo sitio donde se decide qué es un grupo.
 *
 * Sergio, 29-ago-2026: «hay personas que unen las mesas para comer todos
 * juntos. Al unirse las dos mesas quedan con el mismo estado y los mismos
 * productos, es decir las mesas serían parte de una sola. Y en la comanda
 * saldrían las mesas juntas, por ejemplo mesas 5 y 6».
 *
 * ── CÓMO ESTÁ REPRESENTADO ────────────────────────────────────────────────
 * El pedido NO se parte. Sigue teniendo UNA mesa (`pos_orders.table_id`): la
 * principal, la que se tocó primero. Las acompañantes se marcan con el mismo
 * `pos_tables.grupo_id` y se les copia el estado, el pedido y los relojes.
 *
 * Se eligió así, y no "un pedido por mesa que se suman al cobrar", porque esa
 * otra forma obliga a tocar TODO lo que hoy cuenta dinero — el cobro, la caja,
 * los informes, los puntos, la cocina — para un caso que es de sala, no de
 * contabilidad. Aquí, para el dinero, un grupo de mesas es exactamente lo que
 * siempre fue: un pedido en una mesa. Lo único que cambia es cómo se ve.
 *
 * El `grupo_id` lleva dentro cuál es la principal (`g:<idDeLaPrincipal>`), así
 * no hace falta otra columna ni una segunda consulta para saberlo.
 *
 * ⚠️ Este módulo va dentro de pos-nucleo.js. Si lo tocas, corre
 *    `python herramientas/armar-nucleo.py` y sube el bundle.
 */
(function (w) {
  'use strict';

  var PRE = 'g:';

  function idGrupo(principalId) { return PRE + String(principalId); }

  /*  Quién manda en el grupo. Va dentro del propio `grupo_id` a propósito: una
      pantalla que solo tiene la fila de UNA mesa puede saber si ella es la
      principal sin pedir nada más a la base.  */
  function principalDe(grupoId) {
    var g = String(grupoId || '');
    return g.indexOf(PRE) === 0 ? g.slice(PRE.length) : null;
  }

  function unida(mesa) { return !!(mesa && mesa.grupo_id); }

  function esPrincipal(mesa) {
    if (!unida(mesa)) return true;          //  una mesa suelta manda en sí misma
    return principalDe(mesa.grupo_id) === String(mesa.id);
  }

  /*  Todas las mesas del grupo, la principal primero y el resto por número.
      Si la mesa está suelta devuelve solo a ella: quien llame no tiene que
      preguntarse si hay grupo o no.  */
  function grupoDe(mesas, tableId) {
    var lista = mesas || [];
    var yo = null, i;
    for (i = 0; i < lista.length; i++) {
      if (String(lista[i].id) === String(tableId)) { yo = lista[i]; break; }
    }
    if (!yo) return [];
    if (!unida(yo)) return [yo];
    var g = String(yo.grupo_id), pid = principalDe(g), del = [];
    for (i = 0; i < lista.length; i++) {
      if (String(lista[i].grupo_id || '') === g) del.push(lista[i]);
    }
    del.sort(function (a, b) {
      if (String(a.id) === pid) return -1;
      if (String(b.id) === pid) return 1;
      return (Number(a.number) || 0) - (Number(b.number) || 0);
    });
    return del;
  }

  function nombreCorto(mesa) {
    if (!mesa) return '';
    var n = mesa.name != null && mesa.name !== '' ? String(mesa.name) : String(mesa.number || '');
    return n;
  }

  /*  «Mesa 5» · «Mesas 5 y 6» · «Mesas 5, 6 y 7».
      Con "y" antes del último, como se dice en voz alta — es lo que el mesero
      va a leer en la comanda y lo que va a cantar en la cocina.  */
  function etiqueta(mesas, tableId) {
    var del = grupoDe(mesas, tableId);
    if (!del.length) return 'Mesa';
    var nombres = del.map(nombreCorto).filter(function (x) { return x !== ''; });
    if (nombres.length <= 1) return 'Mesa ' + (nombres[0] || '');
    var ult = nombres.pop();
    return 'Mesas ' + nombres.join(', ') + ' y ' + ult;
  }

  /*  Los campos que dejan una mesa libre del todo. Existe aquí para que las
      cinco pantallas borren lo MISMO: media limpieza deja una mesa que se ve
      libre pero sigue apuntando a un pedido cerrado.  */
  function camposLibre() {
    return {
      status: 'libre', current_order_id: null, grupo_id: null,
      sesion_at: null, esperando_at: null, comiendo_at: null,
      pendiente_pago_at: null, comiendo_method: null,
    };
  }

  //  Lo que una acompañante copia de la principal: es lo que las hace "una".
  function camposEspejo(principal) {
    return {
      //  'esperando', no 'ocupada': ese estado no existe, la base lo rechaza.
      status:            principal.status || 'esperando',
      current_order_id:  principal.current_order_id || null,
      sesion_at:         principal.sesion_at || null,
      esperando_at:      principal.esperando_at || null,
      comiendo_at:       principal.comiendo_at || null,
      pendiente_pago_at: principal.pendiente_pago_at || null,
      comiendo_method:   principal.comiendo_method || null,
    };
  }

  function sb() { return w._pos && w._pos.sb; }

  /*  UNIR. `principal` es la mesa donde ya está el pedido; `otra` tiene que
      estar libre (quien llama ya lo comprobó, pero se vuelve a mirar aquí:
      unir una mesa ocupada perdería el otro pedido).  */
  async function unir(principal, otra) {
    var s = sb();
    if (!s) throw new Error('sin conexión');
    if (!principal || !otra) throw new Error('faltan mesas');
    if (String(principal.id) === String(otra.id)) throw new Error('es la misma mesa');
    if (otra.status && otra.status !== 'libre') throw new Error('esa mesa está ocupada');

    var g = idGrupo(principal.grupo_id ? principalDe(principal.grupo_id) : principal.id);

    //  Primero la acompañante. Si algo falla, la principal queda intacta y el
    //  pedido no se mueve de sitio: el peor caso es que no se unió.
    var espejo = camposEspejo(principal);
    espejo.grupo_id = g;
    var r1 = await s.from('pos_tables').update(espejo).eq('id', otra.id);
    if (r1.error) throw r1.error;

    if (!principal.grupo_id) {
      var r2 = await s.from('pos_tables').update({ grupo_id: g }).eq('id', principal.id);
      if (r2.error) throw r2.error;
    }

    Object.assign(otra, espejo);
    principal.grupo_id = g;
    return g;
  }

  /*  SEPARAR. La principal se queda con el pedido; las demás quedan libres.
      No se pregunta "¿de quién era cada plato?" — no hay forma de saberlo y
      partir la cuenta a ojo es peor que no separarlas.  */
  async function separar(mesas, tableId) {
    var s = sb();
    if (!s) throw new Error('sin conexión');
    var del = grupoDe(mesas, tableId);
    if (del.length < 2) return 0;
    var principal = del[0], sueltas = del.slice(1);

    var libre = camposLibre();
    var r1 = await s.from('pos_tables').update(libre)
      .in('id', sueltas.map(function (m) { return m.id; }));
    if (r1.error) throw r1.error;

    var r2 = await s.from('pos_tables').update({ grupo_id: null }).eq('id', principal.id);
    if (r2.error) throw r2.error;

    sueltas.forEach(function (m) { Object.assign(m, libre); });
    principal.grupo_id = null;
    return sueltas.length;
  }

  /*  Aqui vivian `liberarGrupo` y `estadoGrupo`. Se quitaron el mismo dia que
      nacieron: NADIE las llamaba. Pagos libera el grupo con un `update` por
      `grupo_id` (no tiene cargadas las mesas, solo el id de la suya) y el
      salon hace lo mismo dentro de `liberarMesa` y `vsMarcarEstado`, donde
      ya estaba el codigo que habia que tocar.

      Codigo compartido que nadie usa no es codigo compartido: es codigo sin
      probar con aspecto de estarlo.  */

  w.posMesas = {
    idGrupo: idGrupo, principalDe: principalDe,
    unida: unida, esPrincipal: esPrincipal,
    grupoDe: grupoDe, etiqueta: etiqueta, nombreCorto: nombreCorto,
    camposLibre: camposLibre, camposEspejo: camposEspejo,
    unir: unir, separar: separar,
  };
})(window);
