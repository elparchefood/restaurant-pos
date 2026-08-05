/* ═══════════════════════════════════════════════════════════════════════════
   pos-vars.js — Variables de las plantillas (respuestas rápidas y mensajes)
   ───────────────────────────────────────────────────────────────────────────
   Hasta hoy /total y /puntos PARECÍAN dinámicas y no lo eran: el texto que el
   dueño guardaba se ignoraba y se devolvía una frase escrita en el código. Por
   eso solo existían dos, y solo las podía tocar un programador.

   Aquí vive lo que faltaba:
     · un REGISTRO de variables (una línea por variable, con nombre en español,
       palabras alternas, grupo y dónde existe),
     · un RESOLUTOR que reemplaza, calcula y arma listas,
     · una CALCULADORA propia — no `eval`. El texto de una plantilla lo escribe
       el dueño, y `eval` sobre texto de un usuario es una puerta abierta.

   REGLA DE ORO DEL PROYECTO: las llaves viven adentro. Al dueño se le muestran
   fichas de colores con el nombre en español; nunca `{puntos}`. Este archivo es
   la parte de adentro; la pantalla que dibuja las fichas va aparte.

   Sintaxis (interna, el dueño no la escribe):
     {puntos}                          una variable
     {= (puntos_necesarios - puntos) * 1000 | dinero}   un cálculo
     {#lista:alcanza} … {#fila} … {/fila} … {/lista}    una lista

   La lista ENTERA desaparece si no tiene elementos — con su título adentro, que
   es justo el caso que Sergio pidió: que no quede un encabezado solo.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── Formatos ────────────────────────────────────────────────────────────
     El dinero en Colombia se escribe $45.000 (punto de miles, sin decimales).
     Se arma a mano y no con toLocaleString porque el .exe y el navegador no
     siempre traen la misma configuración regional, y el precio no puede
     cambiar de forma según dónde se abra. */
  function miles(n) {
    var s = String(Math.abs(Math.round(Number(n) || 0)));
    var out = '', c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s[i] + out;
      if (++c % 3 === 0 && i > 0) out = '.' + out;
    }
    return (Number(n) < 0 ? '-' : '') + out;
  }
  /* Propiedad PROPIA, nunca heredada. Todas las llaves de aqui salen del texto
     del dueño, asi que `x in obj` no sirve: dice que si a constructor y compañia. */
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  var FMT = {
    dinero: function (v) { return '$' + miles(v); },
    entero: function (v) { return miles(v); },
    texto:  function (v) { return v == null ? '' : String(v); },
  };

  /* ── EL REGISTRO ─────────────────────────────────────────────────────────
     Una línea por variable. Decidido antes de crear la primera: si esto se
     deja para cuando haya 60 variables, toca devolverse a ponerle nombre y
     grupo a cada una.

       clave  · como se escribe adentro
       nombre · como se le muestra al dueño (en español, sin llaves)
       desc   · una línea que explica qué trae
       alt    · palabras alternas: escribir "saldo" debe encontrar "Puntos".
                Sin esto, buscar solo sirve si ya te sabes el nombre.
       grupo  · para agrupar la lista: Cliente · Pedido · Puntos · Negocio · Domicilio
       ctx    · dónde EXISTE. Fuera de ahí sale atenuada con el motivo, no
                escondida: esconderla hace pensar que no existe.
       fmt    · cómo se pinta
       fila   · true si solo vive dentro de un renglón de lista */
  var REGISTRO = [
    // ── Cliente ──
    { clave:'nombre', nombre:'Nombre del cliente', grupo:'Cliente', fmt:'texto',
      desc:'Como quedó guardado el cliente, o su nombre de WhatsApp.',
      alt:['cliente','quien','persona','nombre'], ctx:['cliente'] },
    { clave:'puntos', nombre:'Puntos del cliente', grupo:'Puntos', fmt:'entero',
      desc:'Los puntos que tiene acumulados ahora mismo.',
      alt:['saldo','acumulados','tiene','disponibles'], ctx:['cliente'] },
    { clave:'puntos_ganados', nombre:'Puntos de esta compra', grupo:'Puntos', fmt:'entero',
      desc:'Los que acaba de ganar con este pedido (1 por cada $1.000).',
      alt:['gano','nuevos','de esta compra','suma'], ctx:['pedido'] },

    // ── Pedido ──
    { clave:'total', nombre:'Total a pagar', grupo:'Pedido', fmt:'dinero',
      desc:'Todo junto: productos, empaque y domicilio.',
      alt:['todo','a pagar','cuanto','valor','suma'], ctx:['pedido'] },
    { clave:'total_productos', nombre:'Valor de los productos', grupo:'Pedido', fmt:'dinero',
      desc:'Productos, adiciones y empaque. SIN el domicilio.',
      alt:['comida','sin domicilio','pedido','subtotal'], ctx:['pedido'] },
    { clave:'domicilio', nombre:'Valor del domicilio', grupo:'Domicilio', fmt:'dinero',
      desc:'Lo que cuesta el envío a ese barrio. Cero si es para recoger.',
      alt:['envio','domi','flete','transporte'], ctx:['pedido'] },
    { clave:'tiempo_entrega', nombre:'Tiempo de entrega', grupo:'Pedido', fmt:'texto',
      desc:'Lo que se demora, como está configurado.',
      alt:['demora','cuanto tarda','minutos','espera'], ctx:['siempre'] },

    // ── Negocio ──
    { clave:'negocio', nombre:'Nombre del negocio', grupo:'Negocio', fmt:'texto',
      desc:'Como se llama el restaurante.',
      alt:['restaurante','local','marca','nosotros'], ctx:['siempre'] },
    { clave:'direccion', nombre:'Dirección del negocio', grupo:'Negocio', fmt:'texto',
      desc:'Dónde queda el local.',
      alt:['donde','ubicacion','local','queda'], ctx:['siempre'] },
    { clave:'horario_hoy', nombre:'Horario de hoy', grupo:'Negocio', fmt:'texto',
      desc:'A qué horas se atiende hoy.',
      alt:['hora','abren','cierran','atienden','jornada'], ctx:['siempre'] },

    // ── Solo dentro del renglón de una lista de puntos ──
    { clave:'producto', nombre:'Producto', grupo:'Puntos', fmt:'texto', fila:true,
      desc:'El producto de ese renglón del catálogo de puntos.',
      alt:['premio','articulo','canje'], ctx:['fila'] },
    { clave:'puntos_necesarios', nombre:'Puntos que cuesta', grupo:'Puntos', fmt:'entero', fila:true,
      desc:'Cuántos puntos vale ese producto.',
      alt:['precio en puntos','vale','cuesta','requiere'], ctx:['fila'] },
    { clave:'faltan', nombre:'Puntos que le faltan', grupo:'Puntos', fmt:'entero', fila:true,
      desc:'Cuántos le faltan para alcanzarlo. Nunca es negativo.',
      alt:['falta','restan','le queda','para llegar'], ctx:['fila'] },
  ];

  /* Object.create(null) y no {}: un objeto normal HEREDA constructor, toString,
     __proto__... y aqui la llave de busqueda sale del texto que escribe el dueño.
     Con {} la plantilla "Hola {constructor}" le mandaba al cliente
     "Hola function Object() { [native code] }". */
  var POR_CLAVE = Object.create(null);
  REGISTRO.forEach(function (v) { POR_CLAVE[v.clave] = v; });

  /* ── Las LISTAS que se pueden expandir ──────────────────────────────────
     Decidido con Sergio: DOS listas separadas en vez de una con condiciones.
     En la de "ya puedes" no se usa el cálculo de lo que falta, así que nunca
     puede salir "te faltan -15". Meter condiciones en el texto sería pedirle
     al dueño que programe. */
  var LISTAS = [
    { clave:'alcanza', nombre:'Productos que ya puede pedir',
      desc:'Los del catálogo de puntos que alcanza con lo que tiene.' },
    { clave:'falta', nombre:'Productos que todavía no alcanza',
      desc:'Los que le quedan por encima, con cuánto le falta a cada uno.' },
  ];

  /* ══ LA CALCULADORA ══════════════════════════════════════════════════════
     Idea de Sergio, y es la buena: en vez de inventar una variable por cada
     dato derivado, que el dueño arme la cuenta. Con
     `(puntos_necesarios - puntos) * 1000` construye solo el "= un pedido de $X".

     Se escribe a mano en vez de usar `eval` porque el texto lo escribe el
     dueño y `eval` sobre texto ajeno ejecuta lo que sea. Esto solo entiende
     números, nombres de variable, + - * / y paréntesis: cualquier otra cosa
     es un error, no una instrucción.

     Descenso recursivo, con la precedencia de siempre:
       expr   := term (('+' | '-') term)*
       term   := factor (('*' | '/') factor)*
       factor := '-'? ( numero | nombre | '(' expr ')' ) */
  function calcular(txt, valores) {
    var s = String(txt || ''), i = 0;

    function espacios() { while (i < s.length && /\s/.test(s[i])) i++; }
    function ver(c) { espacios(); return s[i] === c; }
    function tomar(c) { if (ver(c)) { i++; return true; } return false; }

    function factor() {
      espacios();
      if (tomar('-')) return -factor();
      if (tomar('+')) return factor();
      if (tomar('(')) {
        var v = expr();
        if (!tomar(')')) throw new Error('Falta cerrar un paréntesis');
        return v;
      }
      var m = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
      if (m) { i += m[0].length; return parseFloat(m[0].replace(',', '.')); }
      m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(i));
      if (m) {
        i += m[0].length;
        if (!has(valores, m[0])) throw new Error('No conozco "' + m[0] + '"');
        var n = Number(valores[m[0]]);
        if (!isFinite(n)) throw new Error('"' + m[0] + '" no es un número');
        return n;
      }
      throw new Error('No entiendo la cuenta desde "' + s.slice(i, i + 12) + '"');
    }
    function term() {
      var v = factor();
      for (;;) {
        espacios();
        if (tomar('*')) v *= factor();
        else if (tomar('/')) {
          var d = factor();
          /* Dividir por cero da Infinity en JavaScript y eso llegaría al
             cliente como "$Infinity". Mejor que la plantilla avise. */
          if (!d) throw new Error('No se puede dividir por cero');
          v /= d;
        } else return v;
      }
    }
    function expr() {
      var v = term();
      for (;;) {
        espacios();
        if (tomar('+')) v += term();
        else if (tomar('-')) v -= term();
        else return v;
      }
    }

    var r = expr();
    espacios();
    if (i < s.length) throw new Error('Sobra "' + s.slice(i) + '" al final');
    if (!isFinite(r)) throw new Error('La cuenta no da un número');
    return r;
  }

  /* ══ EL RESOLUTOR ════════════════════════════════════════════════════════
     Cambia el texto de la plantilla por el mensaje que le llega al cliente.

     `datos` trae los valores planos (nombre, puntos, total…) y, si la
     plantilla usa listas, `datos.listas = { alcanza:[…], falta:[…] }` donde
     cada elemento es {producto, puntos_necesarios, faltan}.

     Devuelve { texto, faltantes[] }. `faltantes` son las variables que la
     plantilla pedía y no había: sirve para avisar en la pantalla de edición,
     nunca para tapar el mensaje. */
  function resolver(plantilla, datos) {
    datos = datos || {};
    var valores = Object.create(null), faltantes = [];   // ver la nota de POR_CLAVE
    REGISTRO.forEach(function (v) {
      if (!v.fila && datos[v.clave] !== undefined && datos[v.clave] !== null) valores[v.clave] = datos[v.clave];
    });

    var txt = String(plantilla == null ? '' : plantilla);

    /* 1) Las listas primero: adentro llevan variables de renglón que solo
          existen ahí, y hay que resolverlas con los datos de CADA elemento. */
    txt = txt.replace(/\{#lista:([a-z_]+)\}([\s\S]*?)\{\/lista\}/g, function (_todo, clave, cuerpo) {
      var items = (datos.listas && datos.listas[clave]) || [];
      /* Si la lista quedó vacía, se va COMPLETA — con su título adentro. Era
         justo lo que pedía Sergio: que no quede un encabezado huérfano. Y se
         resuelve callado: al dueño no se le avisa nada al guardar. */
      if (!items.length) return '';
      var mf = /\{#fila\}([\s\S]*?)\{\/fila\}/.exec(cuerpo);
      if (!mf) return trozo(cuerpo, valores, faltantes);
      var renglones = items.map(function (it) {
        var v2 = Object.create(null);
        Object.keys(valores).forEach(function (k) { v2[k] = valores[k]; });
        Object.keys(it).forEach(function (k) { v2[k] = it[k]; });
        return trozo(mf[1], v2, faltantes);
      }).join('\n');
      /* El encabezado y el cierre se parten por POSICION, no buscando un hueco:
         el titulo casi siempre lleva espacios, y .replace(' ',...) habria
         cambiado el PRIMER espacio del encabezado: los renglones salian en
         mitad del titulo. */
      return trozo(cuerpo.slice(0, mf.index), valores, faltantes)
           + renglones
           + trozo(cuerpo.slice(mf.index + mf[0].length), valores, faltantes);
    });

    /* 2) Lo que quede: variables sueltas y cálculos. */
    txt = trozo(txt, valores, faltantes);
    return { texto: txt, faltantes: faltantes };
  }

  function trozo(txt, valores, faltantes) {
    return String(txt).replace(/\{([^{}]+)\}/g, function (todo, dentro) {
      dentro = dentro.trim();

      // Un cálculo: {= expresión | formato}
      if (dentro[0] === '=') {
        var partes = dentro.slice(1).split('|');
        var fmt = (partes[1] || 'entero').trim();
        try {
          return (has(FMT, fmt) ? FMT[fmt] : FMT.entero)(calcular(partes[0], valores));
        } catch (e) {
          /* Una cuenta rota NO puede mandarle basura al cliente ni romper el
             mensaje entero. Se deja el hueco vacío y se anota para la pantalla. */
          faltantes.push('cálculo: ' + e.message);
          return '';
        }
      }

      // Una variable
      var def = has(POR_CLAVE, dentro) ? POR_CLAVE[dentro] : null;
      if (!def) { faltantes.push(dentro); return todo; }   // no existe: se deja tal cual, para que se note
      if (!has(valores, dentro)) { faltantes.push(dentro); return ''; }
      return (has(FMT, def.fmt) ? FMT[def.fmt] : FMT.texto)(valores[dentro]);
    });
  }

  /* ── Buscar, para la pantalla ────────────────────────────────────────────
     De 100 variables se ven ~20. No es hacer una lista mejor: es mostrar
     menos. Busca por nombre Y por palabras alternas, y devuelve también las
     que no aplican en ese contexto — atenuadas, con el motivo — porque
     esconderlas hace pensar que no existen. */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function buscar(q, contexto, usos) {
    q = norm(q).trim();
    usos = usos || {};
    var ctx = contexto || 'siempre';
    return REGISTRO
      .filter(function (v) {
        if (!q) return true;
        return norm(v.nombre).indexOf(q) >= 0 || norm(v.desc).indexOf(q) >= 0 ||
               v.clave.indexOf(q) >= 0 || (v.alt || []).some(function (a) { return norm(a).indexOf(q) >= 0; });
      })
      .map(function (v) {
        var aplica = v.ctx.indexOf('siempre') >= 0 || v.ctx.indexOf(ctx) >= 0;
        return {
          def: v, aplica: aplica, usos: usos[v.clave] || 0,
          motivo: aplica ? '' : motivoNoAplica(v, ctx),
        };
      })
      .sort(function (a, b) {
        if (a.aplica !== b.aplica) return a.aplica ? -1 : 1;   // las que sirven, primero
        if (a.usos !== b.usos) return b.usos - a.usos;         // las más usadas arriba
        return a.def.nombre.localeCompare(b.def.nombre, 'es');
      });
  }
  function motivoNoAplica(v, ctx) {
    if (v.ctx.indexOf('fila') >= 0) return 'solo sirve dentro de una lista';
    if (v.ctx.indexOf('pedido') >= 0 && ctx !== 'pedido') return 'aquí todavía no hay pedido';
    if (v.ctx.indexOf('cliente') >= 0 && ctx !== 'cliente' && ctx !== 'pedido') return 'aquí no se sabe quién es el cliente';
    return 'no aplica aquí';
  }

  /* ── Qué variables usa una plantilla (para la lista y para avisar) ─────── */
  function usadas(plantilla) {
    var out = [], txt = String(plantilla || '');
    txt.replace(/\{([^{}]+)\}/g, function (_t, dentro) {
      dentro = dentro.trim();
      if (dentro[0] === '=') {
        (dentro.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []).forEach(function (n) {
          if (has(POR_CLAVE, n) && out.indexOf(n) < 0) out.push(n);
        });
      } else if (has(POR_CLAVE, dentro) && out.indexOf(dentro) < 0) out.push(dentro);
      return _t;
    });
    return out;
  }

  global.posVars = {
    REGISTRO: REGISTRO, LISTAS: LISTAS, POR_CLAVE: POR_CLAVE,
    resolver: resolver, calcular: calcular, buscar: buscar, usadas: usadas,
    formato: FMT, miles: miles,
  };
})(typeof window !== 'undefined' ? window : globalThis);
