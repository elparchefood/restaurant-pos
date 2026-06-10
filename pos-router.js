// =================================================
// pos-router.js — Carga el módulo según ?rol=
// =================================================

window._pos.on('core:ready', ({ role }) => {

  const moduleMap = {
    waiter:  ['modules/tables.js', 'modules/orders.js', 'modules/menu.js'],
    kitchen: ['modules/kitchen.js'],
    cashier: ['modules/cashier.js', 'modules/orders.js'],
    admin:   ['modules/menu.js', 'modules/tables.js'],
  };

  const modules = moduleMap[role] || moduleMap['waiter'];

  // Cargar módulos en orden
  modules.forEach(src => {
    const script = document.createElement('script');
    script.src = src;
    document.body.appendChild(script);
  });

  console.log('[POS Router] Módulos cargados para rol:', role, modules);
});
