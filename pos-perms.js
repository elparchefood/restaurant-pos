/* ==========================================================================
   pos-perms.js — Permisos de rol (candado del lado de la app)
   --------------------------------------------------------------------------
   Se carga en las páginas que necesitan controlar acceso, DESPUÉS de pos-core.

   Resuelve UNA vez el rol del usuario y sus permisos (pos_roles.perms) y los
   deja disponibles para todas las pantallas:

     await window.posPermsReady();       // espera a que carguen
     window.posHasPerm('pedidos.anular') // ¿tiene este permiso?
     window.posHasAny(['a','b'])         // ¿tiene alguno?
     window.posRole()                    // nombre del rol (minúsculas)

   Reglas:
     · admin / administrador / gerente / dueño  → todos los permisos.
     · rol del sistema (pos_roles.system_role)  → todos los permisos.
     · cualquier otro rol                       → su lista pos_roles.perms.
     · rol no reconocido                        → acceso completo (fail-open),
       para NO dejar al dueño encerrado durante el despliegue. El candado
       REAL (contra fraude por código) es el blindaje RLS pendiente aparte.

   OJO: esto bloquea la INTERFAZ, no la base de datos. Alguien técnico que
   llame la API directo podría saltárselo — ese endurecimiento es un pendiente
   documentado en ESTADO-SISTEMA.md.
   ========================================================================== */
(function () {
  'use strict';

  var ADMIN_ROLES = ['admin', 'administrador', 'gerente', 'owner', 'dueño', 'dueno', 'propietario'];

  var _perms = null;   // array de ids, o '*' = todos, o null = aún cargando
  var _role  = null;

  function cliente() {
    try { return (typeof sb !== 'undefined' && sb) ? sb : (window.sb || (window._pos && window._pos.sb)); }
    catch (e) { return window.sb || (window._pos && window._pos.sb); }
  }

  async function resolver() {
    var sb = cliente();
    if (!sb) { _perms = '*'; return; }
    try {
      var ur = await sb.auth.getUser();
      var user = ur && ur.data && ur.data.user;
      if (!user) { _perms = '*'; return; }
      var meta = user.user_metadata || {};
      var role = (meta.role || '').toString().toLowerCase().trim();
      _role = role;

      if (ADMIN_ROLES.indexOf(role) >= 0) { _perms = '*'; return; }

      var tenantId = meta.tenant_id;
      var q = sb.from('pos_roles').select('name,perms,system_role');
      if (tenantId) q = q.eq('tenant_id', tenantId);
      var rr = await q;
      var rows = (rr && rr.data) || [];
      var match = null;
      for (var i = 0; i < rows.length; i++) {
        if ((rows[i].name || '').toString().toLowerCase().trim() === role) { match = rows[i]; break; }
      }
      if (match) {
        if (match.system_role) { _perms = '*'; return; }
        _perms = Array.isArray(match.perms) ? match.perms.slice() : [];
        return;
      }
      // Rol no encontrado en pos_roles → no encerrar al usuario.
      console.warn('[pos-perms] rol no reconocido:', role, '→ acceso completo (fail-open)');
      _perms = '*';
    } catch (e) {
      console.warn('[pos-perms] error resolviendo permisos', e);
      _perms = '*';
    }
  }

  var _ready = resolver();

  window.posPermsReady = function () { return _ready; };
  window.posRole = function () { return _role; };
  window.posPerms = function () { return _perms; };

  window.posHasPerm = function (id) {
    if (_perms === '*') return true;
    if (_perms === null) return true;   // aún no carga → no bloquear de más
    return _perms.indexOf(id) >= 0;
  };

  window.posHasAny = function (ids) {
    if (_perms === '*' || _perms === null) return true;
    for (var i = 0; i < (ids || []).length; i++) if (_perms.indexOf(ids[i]) >= 0) return true;
    return false;
  };

  /* Oculta un elemento del DOM si el usuario no tiene el/los permiso(s).
     Uso: posGate(el, 'pedidos.anular')  ·  posGate(el, ['config.general','config.salon']) */
  window.posGate = function (el, idOrIds) {
    if (!el) return;
    var ok = Array.isArray(idOrIds) ? window.posHasAny(idOrIds) : window.posHasPerm(idOrIds);
    if (!ok) el.style.display = 'none';
    return ok;
  };

  /* Candado de ENTRADA a una página: si el usuario no tiene el permiso, lo
     saca a un lugar seguro (por defecto Ventas). Espera a que carguen los
     permisos antes de decidir. Uso en un <script> tras cargar pos-perms.js:
        posRequire('ventas.ver');
        posRequire(['config.general','config.salon','config.usuarios']); */
  window.posRequire = async function (idOrIds, redirectTo) {
    try { await _ready; } catch (e) {}
    var ok = Array.isArray(idOrIds) ? window.posHasAny(idOrIds) : window.posHasPerm(idOrIds);
    if (!ok) { window.location.replace(redirectTo || 'ventas.html'); return false; }
    return true;
  };
})();
