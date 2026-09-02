/* marketing-guardia.js — quien puede abrir esta pantalla.
 *
 * Marketing todavia no esta aprobada por Meta, asi que HOY no la ve ningun
 * restaurante: solo el administrador de la plataforma. El menu ya la esconde
 * (pos-nav.js), pero el menu es una sugerencia: quien escriba la direccion a
 * mano entraria igual. Este es el candado de la puerta.
 *
 * Se pregunta por `es_admin_plataforma()` y NO leyendo la tabla:
 * `user_profiles` no le da permiso de lectura a nadie a proposito, asi que una
 * consulta directa falla y dejaria fuera al propio Sergio. La funcion corre
 * con permisos de su dueno y es la MISMA que usan las politicas de la base:
 * una sola fuente de verdad.
 *
 * El dia que Meta apruebe, esto se cambia por `posPlan.exigir('marketing')` y
 * la pantalla pasa a depender del plan como todas las demas.
 */
(function () {
  'use strict';

  /*  Se tapa la pantalla hasta saber. Si naciera visible, alguien que no debe
      verla alcanzaria a leerla el instante que tarda la consulta.        */
  var velo = document.createElement('div');
  velo.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#08080A';
  document.documentElement.appendChild(velo);

  function fuera() { window.location.replace('dashboard.html'); }

  function comprobar(sb) {
    if (!sb) { fuera(); return; }
    sb.auth.getUser().then(function (r) {
      if (!r || !r.data || !r.data.user) { window.location.replace('login.html'); return; }
      return sb.rpc('es_admin_plataforma').then(function (a) {
        if (a.error || a.data !== true) { fuera(); return; }
        velo.remove();
      });
    }).catch(fuera);
  }

  /*  `pos-nucleo` avisa cuando el cliente esta listo; si ya lo estaba, se
      comprueba de una.                                                   */
  if (window._pos && window._pos.sb) { comprobar(window._pos.sb); }
  else if (window._pos && window._pos.on) { window._pos.on('core:ready', function () { comprobar(window._pos.sb); }); }
  else { window.addEventListener('load', function () { comprobar(window._pos && window._pos.sb); }); }
})();
