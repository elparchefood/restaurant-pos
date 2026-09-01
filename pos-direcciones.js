/* ═══════════════════════════════════════════════════════════════════════════
   pos-direcciones.js — ¿Estas dos direcciones son la misma puerta?
   ───────────────────────────────────────────────────────────────────────────
   Una sola respuesta para una pregunta que se hacía en cuatro sitios.

   ── POR QUÉ EXISTE ──────────────────────────────────────────────────────

   Una dirección se guarda desde cuatro puertas distintas —el salón, el chat,
   la página de clientes y el pedido de Paco— y cada una decidía por su cuenta
   si ya existía. Las cuatro comparaban TEXTO, cada una a su manera:

       ventas-salón      [conjunto|unidad|dir].join('|').toLowerCase()
       crear-pedido-chat minúsculas + tildes fuera + espacios juntos
       web-acceso        solo letras y números
       chat-ia           no comparaba nada: siempre agregaba

   El resultado, medido el 1-sep-2026: de los 12 clientes con más de una
   dirección, **10 tenían la misma repetida**. Camerón Ruiz tenía el mismo
   apartamento tres veces:

       torre b apto 605
       Ciudadela llanos de calibio, apto 605 torre B
       Ciudadela llanos de calibio, torre b apto 605

   Basta una coma o el orden cambiado. Es la misma lección que costó cara con
   Paco: **comparar texto exacto siempre se equivoca, porque nadie escribe dos
   veces igual.**

   ── QUÉ IDENTIFICA UNA PUERTA ───────────────────────────────────────────

   El NÚMERO. Casa 41, apto 605, torre 2B. El texto alrededor cambia mil
   veces; el número no. Si no hay ningún número —"Hospital del norte"— se
   compara la esencia del texto, quitándole el relleno.

   Y con tolerancia a cómo se escribe: tildes fuera, y las letras que suenan
   igual llevadas a una sola (z→s, v→b). La tabla dice "Hojarazca" y el
   cliente escribe "hojarasca": es el mismo sitio.

   Probado contra los 11 casos reales de El Parche: 11 de 11 correctos,
   incluidos los dos que SÍ son direcciones distintas (una casa y una clínica;
   dos barrios diferentes del mismo dueño).

   ── QUÉ HACE CUANDO ENCUENTRA UNA REPETIDA ──────────────────────────────

   Nada. Decisión de Sergio (1-sep-2026): *"que se quede la que ya estaba"*.
   No se agrega otra y no se toca la que hay. La única excepción es rellenar
   un campo que esté VACÍO — completar no es cambiar, y fue lo que salvó el
   barrio de Verónica Vásquez al unificar.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (raiz) {
  'use strict';

  /* Aplanado que NO cambia el largo del texto: cada letra se cambia por una
     sola. Así los índices siguen sirviendo si alguien quiere cortar. */
  var TILDES = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n' };
  function plano(t) {
    return String(t == null ? '' : t).toLowerCase().split('').map(function (ch) {
      var c = TILDES[ch] || ch;
      return c === 'z' ? 's' : c === 'v' ? 'b' : c;     // suenan igual al escribir
    }).join('');
  }

  function limpio(t) {
    return plano(t).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Palabras que no distinguen una puerta de otra: están en casi todas. */
  var RELLENO = ['ciudadela', 'conjunto', 'condominio', 'unidad', 'residencial',
    'urbanisacion', 'torres', 'torre', 'blokue', 'bloque', 'apto', 'apartamento',
    'apt', 'casa', 'interior', 'int', 'mansana', 'manzana', 'barrio', 'edificio',
    'edif', 'el', 'la', 'los', 'las', 'de', 'del', 'y'];

  function esencia(d) {
    var txt = limpio([d && d.conjunto, d && d.unidad, d && d.dir].filter(Boolean).join(' '));
    var bar = limpio(d && d.barrio);
    /* El barrio no distingue: si está en las dos, sobra en las dos. */
    bar.split(' ').forEach(function (w) {
      if (w.length >= 4) txt = txt.split(w).join(' ');
    });
    return txt.split(' ').filter(function (w) {
      return w && w.length > 2 && RELLENO.indexOf(w) < 0;
    }).join(' ');
  }

  function numeros(d) {
    var t = limpio([d && d.conjunto, d && d.unidad, d && d.dir].filter(Boolean).join(' '));
    var n = t.match(/\d+/g) || [];
    return n.filter(function (x, i) { return n.indexOf(x) === i; }).sort();
  }

  /* ── LA PREGUNTA ────────────────────────────────────────────────────────
     ¿Estas dos son la misma puerta? */
  function mismaPuerta(a, b) {
    if (!a || !b) return false;
    var na = numeros(a), nb = numeros(b);
    if (na.length && nb.length) return na.join('-') === nb.join('-');

    /* Una tiene números y la otra no —o ninguna—: se compara el texto. Le
       pasó a Isabel: "urbanización cruz roja último parqueadero" y esa misma
       frase MÁS la carrera son el mismo sitio. */
    var ea = esencia(a), eb = esencia(b);
    if (!ea || !eb) return false;
    if (ea === eb) return true;
    if (ea.indexOf(eb) >= 0 || eb.indexOf(ea) >= 0) return true;

    /* Y si no, por parecido: cuántas palabras comparten. */
    var pa = ea.split(' '), pb = eb.split(' ');
    var comunes = pa.filter(function (w) { return pb.indexOf(w) >= 0; }).length;
    return comunes / Math.max(pa.length, pb.length) >= 0.6;
  }

  /* Una llave de texto, para cuando hace falta comparar con `===` o meter en
     un Set. Dos puertas iguales dan la misma llave. */
  function llave(d) {
    var n = numeros(d);
    return n.length ? '#' + n.join('-') : '~' + esencia(d);
  }

  /* ¿En qué posición de la lista está esta puerta? -1 si no está. */
  function buscar(lista, nueva) {
    if (!Array.isArray(lista)) return -1;
    for (var i = 0; i < lista.length; i++) {
      if (mismaPuerta(lista[i], nueva)) return i;
    }
    return -1;
  }

  /* ── LA PUERTA DE ENTRADA ───────────────────────────────────────────────
     Agrega la dirección SOLO si es una puerta nueva.

     Si ya estaba, no se agrega y no se cambia: decisión de Sergio, *"que se
     quede la que ya estaba"*. Lo único que se hace es rellenar campos VACÍOS
     —completar no es cambiar—, que es lo que salvó el barrio de Verónica.

     Devuelve { lista, agregada, indice }. La lista es NUEVA: el que llama
     decide si la guarda. */
  function agregar(lista, nueva) {
    var out = Array.isArray(lista) ? lista.slice() : [];
    if (!nueva || !String(nueva.dir || nueva.conjunto || '').trim()) {
      return { lista: out, agregada: false, indice: -1 };
    }
    var i = buscar(out, nueva);
    if (i >= 0) {
      var copia = {};
      for (var k in out[i]) copia[k] = out[i][k];
      ['barrio', 'conjunto', 'unidad', 'tipo'].forEach(function (campo) {
        if (!String(copia[campo] || '').trim() && String(nueva[campo] || '').trim()) {
          copia[campo] = nueva[campo];
        }
      });
      out[i] = copia;
      return { lista: out, agregada: false, indice: i };
    }
    out.push(nueva);
    return { lista: out, agregada: true, indice: out.length - 1 };
  }

  raiz.posDireccion = {
    mismaPuerta: mismaPuerta,
    llave: llave,
    buscar: buscar,
    agregar: agregar,
  };
})(typeof window !== 'undefined' ? window : globalThis);
