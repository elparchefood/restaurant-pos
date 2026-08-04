/* ═══════════════════════════════════════════════════════════════════════════
   pos-cache.js — Guardar en el equipo lo que casi nunca cambia
   ───────────────────────────────────────────────────────────────────────────
   La idea, en una frase: la pantalla se pinta PRIMERO con lo que ya está
   guardado en el computador —eso es instantáneo, no toca internet— y solo
   después se le pregunta a la base si algo cambió, sin que el usuario espere.

   Por qué hace falta: el catálogo de un restaurante cambia dos o tres veces al
   mes, pero hoy se vuelve a pedir entero cada vez que se abre la pantalla. Es
   como volver a preguntar el nombre de un empleado cada vez que uno lo saluda.

   Reglas que este archivo respeta:
   · Todo lo guardado lleva el id del restaurante en la llave. Un equipo donde
     entren dos cuentas de negocios distintos NUNCA puede mezclar datos.
   · Nada se guarda para siempre: cada cosa tiene una edad máxima. Pasada esa
     edad se sigue mostrando (mejor eso que una pantalla en blanco) pero se
     marca como vieja.
   · Si el navegador no tiene espacio, no se rompe nada: se sigue trabajando
     contra la base, como antes.
   · Al cerrar sesión se borra todo (posCache.limpiar).

   Lo que NO va aquí: nada que cambie a cada minuto. Pedidos, caja, turnos y
   stock se piden siempre frescos. Esto es para catálogo, categorías,
   modificadores, configuración y marca.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PREFIJO = 'pos.cache.';
  var TOPE_BYTES = 1500000;   // ~1,5 MB por entrada: más que eso no vale la pena

  function tenantActual() {
    /* Se lee de la sesión que ya está en el equipo, sin salir a internet. La
       sesión de Cobra POS siempre vive bajo la llave 'cobra-pos-session'. */
    try {
      var crudo = localStorage.getItem('cobra-pos-session');
      if (!crudo) return '';
      var s = JSON.parse(crudo);
      var u = (s && (s.user || (s.currentSession && s.currentSession.user))) || null;
      return (u && u.user_metadata && u.user_metadata.tenant_id) || '';
    } catch (e) { return ''; }
  }

  function llave(nombre) {
    return PREFIJO + (tenantActual() || 'sin-negocio') + '.' + nombre;
  }

  /* Devuelve { datos, edadSeg, viejo } o null si no hay nada guardado.
     Ojo: devuelve los datos AUNQUE estén viejos. Quien llama decide si los
     pinta mientras espera lo fresco — que es justamente lo que queremos. */
  function leer(nombre, maxEdadSeg) {
    try {
      var crudo = localStorage.getItem(llave(nombre));
      if (!crudo) return null;
      var g = JSON.parse(crudo);
      if (!g || typeof g.t !== 'number') return null;
      var edad = Math.round((Date.now() - g.t) / 1000);
      return { datos: g.d, edadSeg: edad, viejo: maxEdadSeg ? edad > maxEdadSeg : false };
    } catch (e) { return null; }
  }

  function guardar(nombre, datos) {
    try {
      var texto = JSON.stringify({ t: Date.now(), d: datos });
      if (texto.length > TOPE_BYTES) return false;
      localStorage.setItem(llave(nombre), texto);
      return true;
    } catch (e) {
      /* Sin espacio. Se hace sitio botando lo más viejo de este mismo módulo
         antes de rendirse: vale más guardar el catálogo que un resto de ayer. */
      try {
        var viejas = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIJO) === 0) {
            var g = JSON.parse(localStorage.getItem(k) || '{}');
            viejas.push({ k: k, t: g.t || 0 });
          }
        }
        viejas.sort(function (a, b) { return a.t - b.t; });
        for (var j = 0; j < Math.ceil(viejas.length / 2); j++) localStorage.removeItem(viejas[j].k);
        localStorage.setItem(llave(nombre), JSON.stringify({ t: Date.now(), d: datos }));
        return true;
      } catch (e2) { return false; }
    }
  }

  function borrar(nombre) {
    try { localStorage.removeItem(llave(nombre)); } catch (e) {}
  }

  /* Se llama al cerrar sesión: en un computador compartido no puede quedar el
     catálogo del restaurante anterior. */
  function limpiar() {
    try {
      var fuera = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIJO) === 0) fuera.push(k);
      }
      for (var j = 0; j < fuera.length; j++) localStorage.removeItem(fuera[j]);
    } catch (e) {}
  }

  /* Guardar es barato pero no gratis (hay que convertir a texto). Las pantallas
     redibujan muchas veces seguidas, así que se agrupa: se guarda una vez
     cuando la mano se queda quieta. */
  var pendientes = {};
  function guardarPronto(nombre, obtenerDatos, esperaMs) {
    if (pendientes[nombre]) clearTimeout(pendientes[nombre]);
    pendientes[nombre] = setTimeout(function () {
      pendientes[nombre] = null;
      try { guardar(nombre, obtenerDatos()); } catch (e) {}
    }, esperaMs || 800);
  }

  window.posCache = {
    leer: leer,
    guardar: guardar,
    guardarPronto: guardarPronto,
    borrar: borrar,
    limpiar: limpiar,
    tenant: tenantActual
  };
})();
