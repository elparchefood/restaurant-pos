/* app-cliente.js — la página que ve el cliente del restaurante.
 *
 * Es UNA sola aplicación compartida. Cada restaurante tiene una carpeta con un
 * index.html de quince líneas que solo dice cuál es (`window.COBRA_SLUG`) y
 * carga esto. Mejorar la página los mejora a todos a la vez.
 *
 * Por ahora solo comprueba que el restaurante existe, que su página está
 * publicada, y si está abierto o cerrado. El resto de pantallas del handoff
 * (entrar, inicio, carta, billetera, puntos, perfil) entran encima de esto.
 */
(function () {
  'use strict';
  var URL_SB = 'https://tblujfduscslxjmrjbdr.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNDk2NzUsImV4cCI6MjA2ODcyNTY3NX0.CjLcMOJHDCgTPnE3ZhOlgGZgEZLM1SXCK6-fzq6rz9Q';

  function pinta(html) { document.getElementById('app').innerHTML = html; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var sb = window.supabase.createClient(URL_SB, ANON, {
    auth: { persistSession: false },
    // Misma llave de sesión que el resto del sistema, para no pisar la del POS.
    global: { headers: {} },
  });

  (async function () {
    var slug = window.COBRA_SLUG || '';
    var r = await sb.from('tenants').select('id,name,web_activa').eq('slug', slug).maybeSingle();
    var t = r.data;
    if (!t) { pinta('<div class="c-marca">No encontramos este restaurante</div>'); return; }
    if (!t.web_activa) {
      pinta('<div class="c-marca">' + esc(t.name) + '</div>' +
            '<div class="c-sub">Su página todavía no está abierta al público.</div>');
      return;
    }
    var e = await sb.rpc('fn_web_estado', { p_tenant: t.id });
    var st = (e.data && e.data[0]) || null;
    pinta(
      '<div class="c-marca">' + esc(t.name) + '</div>' +
      '<div class="c-sub">Aquí vas a ver tus puntos, tu saldo y vas a poder pedir. Estamos armándola.</div>' +
      (st ? '<div class="c-estado' + (st.abierto ? ' abierto' : '') + '">' +
              (st.abierto ? '● Abierto ahora' : '○ ') + esc(st.detalle || '') + '</div>' : '')
    );
  })();
})();
