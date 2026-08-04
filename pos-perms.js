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
      /* De la sesion guardada en el equipo, no del servidor: getUser sale a
         internet y esto corre en 14 pantallas. */
      var ur = await sb.auth.getSession();
      var user = ur && ur.data && ur.data.session && ur.data.session.user;
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

  /* ── PIN de administrador (override de gerente) ─────────────────────────
     Nada se oculta. Cuando alguien SIN permiso toca una acción, aparece el
     PIN: si es correcto, la acción procede. Así el gerente puede resolver
     algo rápido desde la cuenta de cualquier rol con solo poner el PIN.
     Valida contra pos_users.pin (mismo PIN de Configuración → Operación). */
  window.posPinPrompt = function (motivo, onOk, onCancel) {
    var prev = document.getElementById('pos-pin-modal');
    if (prev) prev.remove();
    var ov = document.createElement('div');
    ov.id = 'pos-pin-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:inherit';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;width:340px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.25)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      + '<div style="font-weight:700;font-size:15px;color:#0F172A">PIN de administrador</div>'
      + '<button id="pos-pin-x" style="border:none;background:#F1F5F9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px;color:#64748B">&#x2715;</button>'
      + '</div>'
      + '<p style="font-size:12.5px;color:#64748B;margin:0 0 12px;line-height:1.5">' + (motivo || 'Esta acción requiere permiso. Ingresa el PIN para continuar.') + '</p>'
      + '<input id="pos-pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="••••"'
      + ' style="width:100%;border:1.5px solid #ECEEF2;border-radius:10px;padding:11px 14px;font-size:20px;letter-spacing:6px;text-align:center;outline:none;box-sizing:border-box;color:#0F172A">'
      + '<p id="pos-pin-err" style="color:#EF4444;font-size:12px;margin:6px 0 0;display:none"></p>'
      + '<button id="pos-pin-ok" style="margin-top:14px;width:100%;padding:11px;border:none;border-radius:10px;background:#5B6BFF;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Confirmar</button>'
      + '</div>';
    document.body.appendChild(ov);
    var inp = document.getElementById('pos-pin-input');
    var err = document.getElementById('pos-pin-err');
    setTimeout(function () { if (inp) inp.focus(); }, 50);
    function cerrar() { ov.remove(); }
    function cancelar() { cerrar(); if (typeof onCancel === 'function') onCancel(); }
    document.getElementById('pos-pin-x').addEventListener('click', cancelar);
    ov.addEventListener('click', function (e) { if (e.target === ov) cancelar(); });
    async function validar() {
      var sb = cliente();
      var entered = (inp.value || '').trim();
      if (!entered) { err.textContent = 'Ingresa el PIN'; err.style.display = 'block'; return; }
      if (!sb) { err.textContent = 'Error de conexión'; err.style.display = 'block'; return; }
      try {
        var ur = await sb.auth.getSession();
        var _u = ur && ur.data && ur.data.session && ur.data.session.user;
        var tenantId = _u && _u.user_metadata && _u.user_metadata.tenant_id;
        var branchId = _u && _u.user_metadata && _u.user_metadata.branch_id;
        var q = sb.from('pos_users').select('pin').eq('is_authorized_admin', true).limit(1);
        if (branchId) q = q.eq('branch_id', branchId);
        else if (tenantId) q = q.eq('tenant_id', tenantId);
        var res = await q.maybeSingle();
        var row = res.data;
        if (!row || row.pin === null || row.pin === undefined || row.pin === '') {
          err.textContent = 'No hay PIN configurado. Ve a Configuración → Operación.'; err.style.display = 'block'; return;
        }
        if (String(row.pin).trim() !== entered) {
          err.textContent = 'PIN incorrecto'; err.style.display = 'block'; inp.value = ''; inp.focus(); return;
        }
        cerrar();
        if (typeof onOk === 'function') onOk();
      } catch (e) {
        err.textContent = 'Error al verificar el PIN'; err.style.display = 'block';
      }
    }
    document.getElementById('pos-pin-ok').addEventListener('click', validar);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') validar(); });
  };

  /* Candado de una ACCIÓN por permiso. Si el usuario tiene el permiso, corre
     onOk() de una; si no, aparece el PIN y corre onOk() solo si es correcto.
        posGuard('pedidos.cobrar', function(){ irACobrar(); }); */
  window.posGuard = async function (idOrIds, onOk, motivo) {
    try { await _ready; } catch (e) {}
    var ok = Array.isArray(idOrIds) ? window.posHasAny(idOrIds) : window.posHasPerm(idOrIds);
    if (ok) { if (typeof onOk === 'function') onOk(); return; }
    window.posPinPrompt(motivo || 'Esta acción requiere permiso de administrador.', onOk);
  };

  /* Candado de ENTRADA a una página. Nada se oculta: si no tiene el permiso,
     aparece el PIN encima de la página. PIN correcto → se queda; cancelar →
     sale a un lugar seguro (por defecto Ventas).
        posRequirePin('ventas.ver');
        posRequirePin(['config.general','config.salon','config.usuarios']); */
  window.posRequirePin = async function (idOrIds, backTo) {
    try { await _ready; } catch (e) {}
    var ok = Array.isArray(idOrIds) ? window.posHasAny(idOrIds) : window.posHasPerm(idOrIds);
    if (ok) return true;
    window.posPinPrompt(
      'Esta sección requiere permiso. Ingresa el PIN de administrador para entrar.',
      function () { /* desbloqueado: se queda en la página */ },
      function () { window.location.replace(backTo || 'ventas.html'); }
    );
    return false;
  };
})();
