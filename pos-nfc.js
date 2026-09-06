/* pos-nfc.js — el lector de tarjetas del POS.
 *
 * COMO FUNCIONA UN LECTOR USB BARATO (NFC o RFID): se hace pasar por un
 * TECLADO. Al acercar la tarjeta "escribe" su numero y un Enter, todo en
 * milesimas — mucho mas rapido de lo que teclea un humano. Eso es lo que se
 * caza aqui: una rafaga de digitos/letras hex con menos de 80 ms entre
 * teclas, terminada en Enter. No hay drivers, y funciona igual en el .exe y
 * en el navegador (paridad Electron/web).
 *
 * La tarjeta esta atada al TELEFONO del cliente, igual que los puntos: la
 * ficha puede duplicarse, el numero no.
 */
(function (w) {
  'use strict';

  function sb() { return w._pos && w._pos.sb; }
  var CTX = { tenantId: null };

  /* ── La caza de la rafaga ──────────────────────────────────────────── */
  var buf = '', ultimo = 0, robado = 0;
  var MIN = 6;         // ningun uid real tiene menos
  var HUECO = 80;      // ms entre teclas: un humano casi nunca baja de 100
  var oyentes = [];

  document.addEventListener('keydown', function (ev) {
    if (!oyentes.length) return;              // nadie esperando: ni tocar el teclado
    var ahora = Date.now();
    if (ahora - ultimo > HUECO) { buf = ''; robado = 0; }
    ultimo = ahora;

    if (ev.key === 'Enter') {
      if (buf.length >= MIN) {
        var uid = buf.toUpperCase();
        buf = ''; ultimo = 0;
        /* El lector escribe donde este el foco: si el cajero tenia el cursor
           en un campo, el numero se le metio ahi. Se le saca. */
        var el = document.activeElement;
        if (robado && el && ('value' in el) && typeof el.value === 'string' &&
            el.value.toUpperCase().endsWith(uid.slice(-robado))) {
          el.value = el.value.slice(0, el.value.length - robado);
        }
        robado = 0;
        ev.preventDefault(); ev.stopPropagation();
        oyentes.slice().forEach(function (fn) { try { fn(uid); } catch (e) { console.error('[nfc]', e); } });
      }
      return;
    }
    if (/^[0-9a-zA-Z]$/.test(ev.key)) {
      buf += ev.key;
      var el2 = document.activeElement;
      if (el2 && ('value' in el2)) robado++;   // va cayendo en un campo
    } else if (ev.key.length === 1) {
      buf = ''; robado = 0;                    // un simbolo raro: no es tarjeta
    }
  }, true);

  /*  ══ EL LECTOR DEL EJECUTABLE ════════════════════════════
      El lector de El Parche NO se hace pasar por un teclado: es de tarjeta
      inteligente (PC/SC), y a esos el navegador no les puede hablar. Solo el
      ejecutable, igual que con la impresora.

      Asi que hay DOS caminos por los que puede llegar una tarjeta:
        · la rafaga de teclas de un lector barato — lo de arriba;
        · el ejecutable, que lee el suyo y lo manda por aqui.

      Los dos terminan en los mismos oyentes. Una pantalla que ya sabia
      escuchar tarjetas no tiene que cambiar nada.

      ⚠️ Lo que llega del ejecutable NO viene con el numero pelado sino con
      el TOQUE entero: numero, contador y firma. Ahi esta la seguridad, y
      por eso se pasa completo a quien escuche — el que valida es el
      servidor.                                                          */
  var ultimoToque = null;

  function conectarEjecutable() {
    try {
      var e = window.electronPOS;
      if (!e || typeof e.onTarjeta !== 'function') return;   // navegador o .exe viejo
      e.onTarjeta(function (d) {
        if (!d || !d.uid) return;
        ultimoToque = d;
        oyentes.slice().forEach(function (fn) {
          try { fn(String(d.uid).toUpperCase(), d); } catch (x) { console.error('[nfc]', x); }
        });
      });
      if (typeof e.onLector === 'function') {
        e.onLector(function (d) {
          /*  Se deja dicho en la consola y disponible para quien lo quiera
              pintar: "no hay lector" y "no pasaste la tarjeta" son cosas
              distintas, y sin esto se confunden.                        */
          w.posNfcHayLector = !!(d && d.hay);
          console.log('[nfc] lector', (d && d.hay) ? 'conectado' : 'desconectado');
        });
      }
    } catch (x) { console.error('[nfc] no se pudo conectar con el lector:', x); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', conectarEjecutable);
  } else { conectarEjecutable(); }

  /* Escuchar tarjetas. Devuelve la funcion para dejar de escuchar — cada
     pantalla escucha SOLO mientras su modal o su vista lo necesita.

     El oyente recibe DOS cosas: el numero de la tarjeta (como siempre) y,
     si vino del lector del ejecutable, el toque completo con su firma. */
  function escuchar(fn) {
    oyentes.push(fn);
    return function () {
      var i = oyentes.indexOf(fn);
      if (i >= 0) oyentes.splice(i, 1);
    };
  }

  /* ── La base ───────────────────────────────────────────────────────── */
  function setCtx(t) { CTX.tenantId = t || null; }

  // La tarjeta y, si existe, la ficha del cliente al que apunta.
  async function buscar(uid) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var r = await s.from('pos_tarjetas').select('id,uid,telefono,activa')
      .eq('tenant_id', CTX.tenantId).eq('uid', uid).limit(1);
    if (r.error) throw r.error;
    var t = r.data && r.data[0];
    if (!t) return null;
    var c = await s.from('pos_clientes').select('id,nombre,telefono')
      .eq('tenant_id', CTX.tenantId).like('telefono', '%' + t.telefono).limit(5);
    var tel10 = String(t.telefono).replace(/[^0-9]/g, '').slice(-10);
    var ficha = (c.data || []).find(function (x) {
      return String(x.telefono || '').replace(/[^0-9]/g, '').slice(-10) === tel10;
    }) || null;
    return { id: t.id, uid: t.uid, telefono: t.telefono, activa: t.activa, cliente: ficha };
  }

  async function tarjetasDe(telefono) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var tel = String(telefono || '').replace(/[^0-9]/g, '').slice(-10);
    var r = await s.from('pos_tarjetas').select('id,uid,activa,created_at')
      .eq('tenant_id', CTX.tenantId).eq('telefono', tel).order('created_at');
    if (r.error) throw r.error;
    return r.data || [];
  }

  /* `forzar: true` PASA la tarjeta al nuevo dueNo (pedido de Sergio,
     20-ago): nunca en silencio — la pantalla primero avisa de quien es y
     pregunta; solo con ese si explicito se llama con forzar. */
  async function vincular(telefono, uid, quien, opciones) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var tel = String(telefono || '').replace(/[^0-9]/g, '').slice(-10);
    if (tel.length !== 10) throw new Error('El cliente necesita un celular a 10 dígitos.');
    var forzar = !!(opciones && opciones.forzar);
    var ya = await buscar(uid);
    if (ya && ya.telefono !== tel && !forzar) {
      /* Una tarjeta = un dueNo; se dice de quien es en vez de pisarlo. */
      var e = new Error('Esa tarjeta ya es de ' + ((ya.cliente && ya.cliente.nombre) || ('••• ' + ya.telefono.slice(-4))) + '.');
      e.codigo = 'OCUPADA'; e.duena = ya;
      throw e;
    }
    if (ya && ya.telefono !== tel) {
      var ru = await s.from('pos_tarjetas')
        .update({ telefono: tel, quien: quien || null })
        .eq('id', ya.id).eq('tenant_id', CTX.tenantId).select('id');
      if (ru.error) throw ru.error;
      if (!ru.data || !ru.data.length) throw new Error('No se pudo pasar la tarjeta.');
      return { id: ya.id, uid: uid, telefono: tel, activa: true, pasada: true };
    }
    if (ya) return ya;   // ya estaba vinculada a este mismo cliente
    var r = await s.from('pos_tarjetas').insert({
      tenant_id: CTX.tenantId, uid: uid, telefono: tel, quien: quien || null,
    }).select('id');
    if (r.error) throw r.error;
    return { id: r.data[0].id, uid: uid, telefono: tel, activa: true };
  }

  async function desvincular(id) {
    var s = sb(); if (!s) throw new Error('Sin conexión');
    var r = await s.from('pos_tarjetas').delete().eq('id', id).eq('tenant_id', CTX.tenantId).select('id');
    if (r.error) throw r.error;
    return !!(r.data && r.data.length);
  }

  //  `ultimoToque` guarda el ultimo toque completo: lo necesita quien vaya a
  //  validarlo contra el servidor, que es lo unico que da seguridad.
  w.posNfc = { setCtx: setCtx, escuchar: escuchar, buscar: buscar,
               tarjetasDe: tarjetasDe, vincular: vincular, desvincular: desvincular,
               ultimoToque: function () { return ultimoToque; },
               hayLector: function () { return w.posNfcHayLector === true; } };
})(window);
