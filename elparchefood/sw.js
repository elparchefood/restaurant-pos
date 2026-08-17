/* sw.js — el ayudante que recibe las notificaciones.
 *
 * SOLO NOTIFICACIONES. NO CACHEA NADA, y eso es a proposito.
 *
 * Un service worker normal se queda con copias de la pagina para que funcione
 * sin internet. Aqui NO: si guardara copias, un cliente podria estar viendo la
 * carta y los PRECIOS de hace tres dias sin enterarse — y ese error no se ve,
 * se descubre cuando alguien reclama en la caja.
 *
 * Por eso este archivo no tiene un `fetch`: todo lo que pide la pagina sigue
 * yendo a la red como siempre. Lo unico que hace es estar despierto para
 * recibir un aviso y mostrarlo.
 *
 * El dia que se quiera que funcione sin internet, eso es OTRA decision y se
 * agrega aqui con cuidado — no se cuela por la puerta de atras.
 */

self.addEventListener('install', function () {
  // Que el nuevo reemplace al viejo de una, sin esperar a que cierren la app.
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { cuerpo: e.data && e.data.text() }; }

  var titulo = d.titulo || 'El Parche Food';
  var opciones = {
    body: d.cuerpo || '',
    icon: 'icono-192.png',
    badge: 'icono-192.png',
    /* La etiqueta hace que un aviso del mismo tipo REEMPLACE al anterior en vez
       de amontonarse. Sin esto, tres cambios de estado del mismo pedido dejan
       tres notificaciones y el cliente no sabe cual es la buena. */
    tag: d.tag || 'ep-general',
    renotify: true,
    data: { ir: d.ir || '/elparchefood/' },
  };
  e.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var destino = (e.notification.data && e.notification.data.ir) || '/elparchefood/';
  e.waitUntil(
    /* Si la aplicacion ya esta abierta se trae al frente, no se abre otra:
       dos copias de la misma pagina confunden y pierden lo que se estaba
       haciendo (un carrito a medio armar, por ejemplo). */
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].url.indexOf('/elparchefood/') >= 0 && 'focus' in lista[i]) {
          return lista[i].focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
