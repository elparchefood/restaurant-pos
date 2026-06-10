// =================================================
// pos-core.js — Núcleo del sistema POS
// Crea window._pos y conecta Supabase
// NUNCA modificar el orden de inicialización
// =================================================

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

// Crear cliente Supabase
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Bus de eventos interno
const _listeners = {};

// Estado global del sistema
const _state = {
  tables:       [],   // mesas del local
  activeOrders: {},   // pedidos activos { [tableId]: order }
  session:      null, // sesión de caja activa
  role:         null, // rol del dispositivo: waiter | kitchen | cashier | admin
};

// =================================================
// window._pos — API global accesible por todos los módulos
// =================================================
window._pos = {

  sb: _sb,
  state: _state,

  // Emitir un evento interno
  emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  },

  // Escuchar un evento interno
  on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  },

  // Obtener el rol del dispositivo desde la URL (?rol=waiter)
  getRole() {
    const params = new URLSearchParams(window.location.search);
    return params.get('rol') || 'waiter'; // por defecto: mesero
  },

  // Ocultar loader y mostrar la app
  showApp() {
    document.getElementById('pos-loader').style.display = 'none';
    document.getElementById('pos-app').style.display = 'block';
  }

};

// =================================================
// Inicialización al cargar el DOM
// =================================================
document.addEventListener('DOMContentLoaded', () => {
  const role = window._pos.getRole();
  _state.role = role;
  document.body.dataset.role = role; // permite CSS por rol: body[data-role="kitchen"]

  console.log('[POS Core] Iniciado. Rol:', role);
  window._pos.emit('core:ready', { role });
});
