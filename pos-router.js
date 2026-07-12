// =================================================
// pos-router.js — Redirige a dashboard.html
// =================================================
// index.html es el shell del SPA legacy y ya no se usa como punto de entrada.
// Si alguien llega aqui (por cualquier navegacion), los mandamos al dashboard.
window._pos.on('core:ready', function() {
  window.location.replace('dashboard.html');
});
