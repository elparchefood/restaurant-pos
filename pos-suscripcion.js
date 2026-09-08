/* ═══════════════════════════════════════════════════════════════════════════
   AUTORIZAR EL COBRO AUTOMÁTICO
   ---------------------------------------------------------------------------
   Una sola pieza para los tres sitios donde hace falta: al registrarse, en el
   panel para cambiar de medio, y en la pantalla de cuenta suspendida. Se abre
   así:

       posSuscripcion.abrir({ alTerminar: function (r) { … } });

   ⚠️ LOS DATOS DE LA TARJETA NO PASAN POR NUESTRO SERVIDOR. Van del navegador
   a Wompi directamente, con la llave PÚBLICA, y lo que vuelve es un token de
   un solo uso. Nosotros solo vemos ese token y los últimos cuatro dígitos.
   Hacerlo al revés —recibir el número aquí y reenviarlo— nos metería en el
   negocio de custodiar tarjetas, que es un negocio que no queremos.

   POR QUÉ NEQUI VA PRIMERO
   ---------------------------------------------------------------------------
   Los clientes de Cobra son restaurantes pequeños. Muchos no tienen tarjeta de
   crédito, y casi todos tienen Nequi. Poner la tarjeta primero sería copiar el
   formulario de una tienda gringa.
   ═══════════════════════════════════════════════════════════════════════════ */

window.posSuscripcion = (function (w, d) {
  'use strict';

  var SB = (w.SUPABASE_URL || 'https://tblujfduscslxjmrjbdr.supabase.co');
  var ANON = w.SUPABASE_KEY || '';

  var S = {};   // estado de la ventana abierta

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cop(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }

  /*  El día del cobro dicho como lo diría una persona: "el 18 de octubre". */
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];
  function fechaLarga(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return 'el ' + Number(p[2]) + ' de ' + MESES[Number(p[1]) - 1];
  }

  async function llamar(cuerpo, conSesion) {
    var cab = { 'Content-Type': 'application/json', 'apikey': ANON };
    if (conSesion) {
      var s = w.sb && (await w.sb.auth.getSession()).data.session;
      if (!s) throw new Error('Se cerró tu sesión. Vuelve a entrar.');
      cab.Authorization = 'Bearer ' + s.access_token;
    }
    var r = await fetch(SB + '/functions/v1/wompi', {
      method: 'POST', headers: cab, body: JSON.stringify(cuerpo)
    });
    var d2 = await r.json().catch(function () { return {}; });
    /*  Un 4xx NO lanza excepción por su cuenta: hay que mirarlo. Este proyecto
        ya perdió semanas por un 403 que nadie miraba.                      */
    if (!r.ok) throw new Error(d2.error || ('No se pudo (' + r.status + ')'));
    return d2;
  }

  // ── Estilos, una sola vez ──────────────────────────────────────────────
  function estilos() {
    if (d.getElementById('sus-css')) return;
    var e = d.createElement('style'); e.id = 'sus-css';
    e.textContent = [
      '.sus-ov{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.5);backdrop-filter:blur(2px);',
        'display:flex;align-items:center;justify-content:center;padding:20px;font-family:"DM Sans",system-ui,sans-serif}',
      '.sus-c{background:#fff;border-radius:18px;width:460px;max-width:96vw;max-height:92vh;overflow:auto;',
        'box-shadow:0 30px 70px -20px rgba(15,23,42,.4);animation:susPop .22s cubic-bezier(.2,.8,.2,1)}',
      '@keyframes susPop{from{transform:scale(.96) translateY(8px);opacity:0}to{transform:none;opacity:1}}',
      '.sus-h{padding:22px 24px 0}',
      '.sus-t{font-size:19px;font-weight:800;color:#0F172A;letter-spacing:-.02em}',
      '.sus-s{font-size:13px;color:#64748B;line-height:1.55;margin-top:6px}',
      '.sus-b{padding:18px 24px 22px}',
      '.sus-med{display:flex;align-items:center;gap:12px;width:100%;padding:14px;margin-bottom:9px;',
        'border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;text-align:left;font-family:inherit}',
      '.sus-med:hover{border-color:#5B6BFF;background:#F8FAFF}',
      '.sus-med b{display:block;font-size:14px;color:#0F172A;font-weight:700}',
      '.sus-med span{font-size:12px;color:#64748B}',
      '.sus-ic{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;',
        'flex-shrink:0;font-weight:800;font-size:13px;color:#fff}',
      '.sus-lab{display:block;font-size:12px;font-weight:600;color:#475569;margin:12px 0 5px}',
      '.sus-in{width:100%;padding:11px 12px;border:1px solid #ECEEF2;border-radius:10px;font-size:14px;',
        'font-family:inherit;color:#0F172A;outline:none;box-sizing:border-box}',
      '.sus-in:focus{border-color:#5B6BFF;box-shadow:0 0 0 3px rgba(91,107,255,.12)}',
      '.sus-fila{display:flex;gap:10px}.sus-fila>div{flex:1}',
      '.sus-btn{width:100%;margin-top:16px;padding:13px;border:none;border-radius:11px;background:#5B6BFF;color:#fff;',
        'font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.sus-btn:disabled{opacity:.55;cursor:default}',
      '.sus-btn2{background:none;border:none;color:#64748B;font-size:13px;font-weight:600;cursor:pointer;',
        'font-family:inherit;margin-top:12px;width:100%;padding:8px}',
      '.sus-nota{font-size:12px;color:#64748B;line-height:1.6;margin-top:14px;padding:11px 13px;',
        'background:#F8FAFC;border-radius:10px}',
      '.sus-err{font-size:13px;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;',
        'padding:10px 12px;margin-top:12px;line-height:1.5}',
      '.sus-esp{display:flex;flex-direction:column;align-items:center;text-align:center;padding:16px 0 4px}',
      '.sus-onda{width:66px;height:66px;border-radius:50%;background:#fff;border:1px solid #ECEEF2;',
        'position:relative;display:flex;align-items:center;justify-content:center;margin-bottom:16px;',
        'animation:susLat 1.6s ease-in-out infinite}',
      '@keyframes susLat{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:.75}}',
      '@media (prefers-reduced-motion:reduce){.sus-onda{animation:none}.sus-c{animation:none}}',
      '.sus-ok{width:66px;height:66px;border-radius:50%;background:#DCFCE7;color:#16A34A;display:flex;',
        'align-items:center;justify-content:center;margin:0 auto 16px}'
    ].join('');
    d.head.appendChild(e);
  }

  // ── Las pantallas ──────────────────────────────────────────────────────
  function pintar(html) { S.cuerpo.innerHTML = html; }

  /*  ══ LO QUE PASA CON LA PLATA, DICHO EN UN SOLO SITIO ══════════════════
      Este texto decia siempre "no se te cobra nada ahora" — escrito cuando el
      cobro era para despues. Sergio decidio que se cobra de una al registrarse,
      y el texto se quedo mintiendo justo donde mas duele: la pantalla donde
      alguien entrega su medio de pago.

      Ahora lo dice segun lo que de verdad va a pasar. Y va en una sola
      funcion: dos copias es como se llega otra vez a que una diga lo viejo. */
  function fraseDelCobro() {
    if (S.opts.cobrarYa) {
      return S.opts.monto
        ? 'Al aprobar se cobran <b>' + cop(S.opts.monto) + '</b>.'
        : 'Al aprobar se cobra tu plan.';
    }
    return 'No se te cobra nada ahora.';
  }

  function verMedios() {
    S.error = '';
    pintar(
      '<button class="sus-med" data-m="NEQUI">' +
        /*  ══ EL LOGO OFICIAL DE NEQUI ══════════════════════════════════════
            Sergio, 7-sep: *"si no utilizamos el logo oficial parecería
            pirata"*. Y tiene razón — yo había puesto un teléfono dibujado por
            no usar marca ajena, y en una pantalla de PAGO eso es al revés:
            el cliente busca el logo que conoce, y una imitación mía se vería
            más pirata todavía. Los medios de pago quieren que su marca salga
            justo en este momento.

            El archivo va en `assets/brand/nequi.svg` y es el OFICIAL, bajado
            de Nequi. Si algún día falta, el dibujo de abajo lo reemplaza solo
            — un icono roto en la pantalla del pago sería peor que uno
            genérico.                                                       */
        /*  ⚠️ SOBRE BLANCO, NO SOBRE MORADO. La marca de Nequi es morado
            oscuro (#200020) con el cuadro magenta: puesta sobre el fondo
            morado que yo tenía, habría quedado invisible. El borde suave
            evita que el cuadro blanco flote sobre la ventana, que también
            es blanca.                                                     */
        '<span class="sus-ic" style="background:#fff;border:1px solid #ECEEF2;position:relative">' +
          /*  El dibujo va DEBAJO y el logo encima. Si el archivo falta, la
              imagen se quita sola y queda el dibujo — un icono roto en la
              pantalla del pago se ve peor que uno genérico.               */
          /*  El respaldo también cambia de color: sobre blanco, un dibujo
              blanco no se vería.                                          */
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#200020" stroke-width="1.7" ' +
            'stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/>' +
            '<path d="M10.6 18.4h2.8" stroke-width="1.9"/>' +
            '<path d="M9.6 9.6a3.4 3.4 0 0 1 4.8 0"/><path d="M11.1 12a1.3 1.3 0 0 1 1.8 0"/>' +
          '</svg>' +
          /*  Y el respaldo se QUITA en cuanto el logo carga. Sin esto se veia
              asomando por detras — que fue justo lo que Sergio vio: una
              esquina rara junto a la N.                                    */
          '<img src="assets/brand/nequi.png" alt="Nequi" '
            + 'onload=this.previousElementSibling.remove() onerror=this.remove() ' +
            'style="position:absolute;inset:0;width:100%;height:100%;padding:7px;' +
            'object-fit:contain;box-sizing:border-box">' +
        '</span><span><b>Nequi</b><span>Apruebas desde tu app, sin tarjeta</span></span></button>' +
      '<button class="sus-med" data-m="CARD">' +
        /*  El CHIP es lo que hace que un rectángulo se lea como una tarjeta
            a este tamaño. Sin él parece un sobre.                        */
        '<span class="sus-ic" style="background:linear-gradient(140deg,#5B6BFF,#3F4BD6)">' +
          '<svg width="21" height="21" viewBox="0 0 24 24" fill="none">' +
            '<rect x="2.2" y="5.2" width="19.6" height="13.6" rx="2.6" stroke="#fff" stroke-width="1.6"/>' +
            '<path d="M2.2 9.4h19.6" stroke="#fff" stroke-width="1.6"/>' +
            '<rect x="5" y="12.4" width="4.2" height="3.1" rx="0.8" fill="#fff" opacity=".92"/>' +
            '<path d="M13.4 15.1h5.2" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>' +
          '</svg>' +
        '</span><span><b>Tarjeta</b><span>Débito o crédito</span></span></button>' +
      /*  El hueco del error. Sin el, cualquier fallo que devuelva a esta
          pantalla se quedaba mudo.                                       */
      '<div id="sus-e"></div>' +
      '<div class="sus-nota">' + fraseDelCobro() + ' Autorizas <b>una sola vez</b> y después el cobro ' +
        'sale solo el día que toca, avisándote <b>una semana antes</b>. ' +
        'Puedes cambiar el medio o cancelar cuando quieras.</div>'
    );
    S.cuerpo.querySelectorAll('[data-m]').forEach(function (b) {
      b.onclick = function () { b.dataset.m === 'NEQUI' ? verNequi() : verTarjeta(); };
    });
  }

  function verNequi() {
    pintar(
      '<label class="sus-lab" for="sus-tel">Tu número de Nequi</label>' +
      '<input class="sus-in" id="sus-tel" type="tel" inputmode="numeric" maxlength="10" placeholder="3001234567">' +
      '<div id="sus-e"></div>' +
      '<button class="sus-btn" id="sus-go">Continuar</button>' +
      '<button class="sus-btn2" id="sus-atras">← Escoger otro medio</button>' +
      '<div class="sus-nota">Te va a llegar una <b>notificación a tu app de Nequi</b> para que apruebes. ' +
        fraseDelCobro() + '</div>'
    );
    var inp = d.getElementById('sus-tel');
    inp.oninput = function () { inp.value = inp.value.replace(/[^0-9]/g, ''); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') d.getElementById('sus-go').click(); };
    d.getElementById('sus-atras').onclick = verMedios;
    d.getElementById('sus-go').onclick = function () { pedirNequi(inp.value.trim()); };
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 60);
  }

  /*  ══ UN ERROR NUNCA SE PUEDE PERDER ════════════════════════════════════

      Esto decia `if (c) ...` — o sea: si la pantalla de turno no traia el
      hueco donde escribir, el mensaje se tiraba a la basura y no pasaba nada.

      Y eso es exactamente lo que vio Sergio el 8-sep: al fallar el guardado,
      `inscribir` llamaba a `verMedios()` —que NO tiene ese hueco— y despues a
      `fallo()`. El selector de medios reaparecia limpio, sin una palabra de
      lo que habia salido mal. "Luego me aparecia otra vez este modal."

      Es el mismo error de siempre en este proyecto, con otra ropa: el fallo
      callado. Ahora, si no hay hueco, se crea; y ademas queda en la consola
      del navegador para poder mirarlo despues.                            */
  function fallo(msg) {
    try { console.error('[suscripcion]', msg); } catch (e) {}
    var c = d.getElementById('sus-e');
    if (!c && S.cuerpo) {
      c = d.createElement('div');
      c.id = 'sus-e';
      S.cuerpo.insertBefore(c, S.cuerpo.firstChild);
    }
    if (c) c.innerHTML = '<div class="sus-err">' + esc(msg) + '</div>';
  }

  async function pedirNequi(tel) {
    if (!/^3\d{9}$/.test(tel)) return fallo('Escribe tu celular a 10 dígitos, empezando por 3.');
    var btn = d.getElementById('sus-go'); btn.disabled = true; btn.textContent = 'Un momento…';
    try {
      var cfg = await llamar({ action: 'arranque' });
      var r = await fetch(cfg.api + '/tokens/nequi', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.llave_publica, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: tel })
      });
      var dd = await r.json().catch(function () { return {}; });
      if (!r.ok || !dd.data || !dd.data.id) throw new Error('Nequi no aceptó ese número.');
      esperarNequi(cfg, dd.data.id, tel);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Continuar';
      fallo(e.message || String(e));
    }
  }

  /*  ══ LA ESPERA ═══════════════════════════════════════════════════════════
      Aquí la persona tiene que salir de nuestra pantalla, abrir Nequi y
      aprobar. Es el momento más frágil de todo esto: si la pantalla no dice
      exactamente qué hacer, se queda mirando y se rinde.

      Por eso la espera NO es una rueda girando: dice qué buscar, en qué app,
      y cuánto tiempo hay. Y se comprueba sola cada 3 segundos para que no
      tenga que volver a tocar nada.                                        */
  function esperarNequi(cfg, token, tel) {
    var hasta = Date.now() + 5 * 60 * 1000;
    pintar(
      '<div class="sus-esp">' +
        '<div class="sus-onda">' +
          /*  Aquí también el logo de verdad: la persona está a punto de irse a
              la app de Nequi, y ver su marca es lo que confirma que va al
              sitio correcto. El teléfono queda de respaldo.               */
          '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#200020" stroke-width="1.7" ' +
            'stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/>' +
            '<path d="M10.6 18.4h2.8" stroke-width="1.9"/>' +
            '<path d="M9.6 9.6a3.4 3.4 0 0 1 4.8 0"/><path d="M11.1 12a1.3 1.3 0 0 1 1.8 0"/>' +
          '</svg>' +
          /*  Y el respaldo se QUITA en cuanto el logo carga. Sin esto se veia
              asomando por detras — que fue justo lo que Sergio vio: una
              esquina rara junto a la N.                                    */
          '<img src="assets/brand/nequi.png" alt="Nequi" '
            + 'onload=this.previousElementSibling.remove() onerror=this.remove() ' +
            'style="position:absolute;inset:0;width:100%;height:100%;padding:17px;' +
            'object-fit:contain;box-sizing:border-box">' +
          '</div>' +
        '<div style="font-size:16px;font-weight:700;color:#0F172A">Abre tu app de Nequi</div>' +
        '<div style="font-size:13.5px;color:#475569;line-height:1.6;margin-top:8px;max-width:330px">' +
          'Te llegó una notificación al <b>' + esc(tel) + '</b> para autorizar el cobro automático de Cobra. ' +
          'Acéptala y esta pantalla sigue sola.</div>' +
        '<div style="font-size:12px;color:#94A3B8;margin-top:14px" id="sus-reloj"></div>' +
      '</div>' +
      '<div id="sus-e"></div>' +
      '<button class="sus-btn2" id="sus-atras">Cancelar</button>'
    );
    d.getElementById('sus-atras').onclick = function () { clearInterval(S.reloj); verMedios(); };

    /*  EL RELOJ CORRE CADA SEGUNDO; SE PREGUNTA CADA TRES. Antes ambas cosas
        iban juntas cada 3 s, asi que los primeros tres segundos la pantalla
        no mostraba NADA debajo del texto — y una pantalla de pago sin señales
        de vida se lee como colgada. Fue lo primero que se vio en la captura
        de Sergio: el hueco de la cuenta atras, vacio.                     */
    function pintarReloj() {
      var quedan = Math.max(0, Math.round((hasta - Date.now()) / 1000));
      var r = d.getElementById('sus-reloj');
      if (r) r.textContent = 'Esperando tu aprobación · '
        + Math.floor(quedan / 60) + ':' + ('0' + (quedan % 60)).slice(-2);
      return quedan;
    }
    pintarReloj();
    var tic = 0;

    clearInterval(S.reloj);
    S.reloj = setInterval(async function () {
      var quedan = pintarReloj();
      if (quedan <= 0) {
        clearInterval(S.reloj);
        nequiSinExito('No llegó tu aprobación',
          'Pasaron 5 minutos y Nequi no confirmó la autorización del <b>' + esc(tel) + '</b>. '
          + '<b>No se te cobró nada.</b> Puede que la notificación no llegara, o que se cerrara sin querer.');
        return;
      }
      if ((++tic) % 3) return;
      try {
        var q = await fetch(cfg.api + '/tokens/nequi/' + token, {
          headers: { 'Authorization': 'Bearer ' + cfg.llave_publica }
        });
        var dd = await q.json().catch(function () { return {}; });
        var est = dd && dd.data && dd.data.status;
        if (est === 'APPROVED') { clearInterval(S.reloj); inscribir(token, 'NEQUI'); }
        else if (est && est !== 'PENDING') {
          /*  Antes esto solo escribia el error DEBAJO, dejando arriba el
              "Abre tu app de Nequi · esta pantalla sigue sola" — que ya era
              mentira. La pantalla tiene que decir una sola cosa.         */
          clearInterval(S.reloj);
          nequiSinExito(
            est === 'DECLINED' ? 'Rechazaste la autorización' : 'Nequi no pudo autorizar',
            est === 'DECLINED'
              ? 'Se rechazó la autorización en la app de Nequi. <b>No se te cobró nada.</b>'
              : 'Nequi respondió <b>' + esc(est) + '</b>. <b>No se te cobró nada.</b>');
        }
      } catch (e) { /* un tropiezo de red no cancela la espera */ }
    }, 3000);
  }

  /*  Un callejon sin salida es peor que un error. Aqui se dice que no se
      cobro nada —lo primero que uno teme— y se ofrecen las dos salidas
      posibles: repetir con Nequi, o pagar con otra cosa.                  */
  function nequiSinExito(titulo, texto) {
    pintar(
      '<div class="sus-esp">' +
        '<div class="sus-onda" style="background:#FFFBEB;border-color:#FDE68A">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="1.9" ' +
            'stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l2.8 2"/></svg>' +
        '</div>' +
        '<div style="font-size:16px;font-weight:700;color:#0F172A">' + esc(titulo) + '</div>' +
        '<div style="font-size:13.5px;color:#475569;line-height:1.6;margin-top:8px;max-width:330px">' +
          texto + '</div>' +
      '</div>' +
      '<div id="sus-e"></div>' +
      '<button class="sus-btn" id="sus-otra">Intentar otra vez</button>' +
      '<button class="sus-btn2" id="sus-atras">← Escoger otro medio</button>'
    );
    d.getElementById('sus-otra').onclick = verNequi;
    d.getElementById('sus-atras').onclick = verMedios;
  }

  function verTarjeta() {
    pintar(
      '<label class="sus-lab" for="sus-num">Número de la tarjeta</label>' +
      '<input class="sus-in" id="sus-num" inputmode="numeric" maxlength="23" placeholder="4242 4242 4242 4242" autocomplete="cc-number">' +
      '<div class="sus-fila">' +
        '<div><label class="sus-lab" for="sus-exp">Vence</label>' +
          '<input class="sus-in" id="sus-exp" maxlength="5" placeholder="MM/AA" autocomplete="cc-exp"></div>' +
        '<div><label class="sus-lab" for="sus-cvc">CVC</label>' +
          '<input class="sus-in" id="sus-cvc" inputmode="numeric" maxlength="4" placeholder="123" autocomplete="cc-csc"></div>' +
      '</div>' +
      '<label class="sus-lab" for="sus-nom">Nombre como aparece en la tarjeta</label>' +
      '<input class="sus-in" id="sus-nom" placeholder="SERGIO ABADIA" autocomplete="cc-name">' +
      '<div id="sus-e"></div>' +
      '<button class="sus-btn" id="sus-go">Autorizar el cobro</button>' +
      '<button class="sus-btn2" id="sus-atras">← Escoger otro medio</button>' +
      '<div class="sus-nota">' + fraseDelCobro() + ' Los datos de tu tarjeta viajan ' +
        '<b>directamente a la pasarela</b>: Cobra nunca los ve ni los guarda, ' +
        'solo los últimos cuatro dígitos.</div>'
    );
    var num = d.getElementById('sus-num'), exp = d.getElementById('sus-exp');
    num.oninput = function () {
      var v = num.value.replace(/[^0-9]/g, '').slice(0, 19);
      num.value = v.replace(/(.{4})/g, '$1 ').trim();
    };
    exp.oninput = function () {
      var v = exp.value.replace(/[^0-9]/g, '').slice(0, 4);
      exp.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v;
    };
    d.getElementById('sus-cvc').oninput = function () { this.value = this.value.replace(/[^0-9]/g, ''); };
    d.getElementById('sus-atras').onclick = verMedios;
    d.getElementById('sus-go').onclick = pedirTarjeta;
    setTimeout(function () { try { num.focus(); } catch (e) {} }, 60);
  }

  async function pedirTarjeta() {
    var num = d.getElementById('sus-num').value.replace(/\s/g, '');
    var exp = d.getElementById('sus-exp').value.split('/');
    var cvc = d.getElementById('sus-cvc').value;
    var nom = d.getElementById('sus-nom').value.trim();
    if (num.length < 13) return fallo('Revisa el número de la tarjeta.');
    if (exp.length !== 2 || exp[0].length !== 2 || exp[1].length !== 2) return fallo('La fecha va como MM/AA.');
    if (Number(exp[0]) < 1 || Number(exp[0]) > 12) return fallo('El mes de vencimiento no existe.');
    if (cvc.length < 3) return fallo('Falta el código de seguridad (CVC).');
    if (!nom) return fallo('Escribe el nombre que aparece en la tarjeta.');

    var btn = d.getElementById('sus-go'); btn.disabled = true; btn.textContent = 'Autorizando…';
    try {
      var cfg = await llamar({ action: 'arranque' });
      /*  DERECHO A WOMPI, con la llave pública. El número de la tarjeta no
          toca nuestro servidor ni una vez.                                */
      var r = await fetch(cfg.api + '/tokens/cards', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.llave_publica, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: num, cvc: cvc, exp_month: exp[0], exp_year: exp[1], card_holder: nom })
      });
      var dd = await r.json().catch(function () { return {}; });
      if (!r.ok || !dd.data || !dd.data.id) {
        throw new Error((dd.error && dd.error.messages && JSON.stringify(dd.error.messages).slice(0, 120))
          || 'La pasarela no aceptó esa tarjeta.');
      }
      inscribir(dd.data.id, 'CARD');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Autorizar el cobro';
      fallo(e.message || String(e));
    }
  }

  async function inscribir(token, tipo) {
    pintar('<div class="sus-esp"><div class="sus-onda"></div>' +
           '<div style="font-size:15px;color:#475569">Guardando tu autorización…</div></div>');
    try {
      /*  `cobrarYa` viaja hasta aqui desde quien abrio la ventana. En el
          registro va en true: se autoriza y se cobra el primer periodo de
          una, porque si no el restaurante se lleva un mes gratis.       */
      var r = await llamar({
        action: 'inscribir', token: token, tipo: tipo,
        cobrar_ya: S.opts.cobrarYa === true,
        periodo: S.opts.periodo || 'mensual'
      }, true);
      listo(r);
    } catch (e) {
      verMedios();
      fallo(e.message || String(e));
    }
  }

  function listo(r) {
    var medio = (r.marca || 'tu medio de pago') + (r.ultimos4 ? ' ····' + r.ultimos4 : '');
    S.titulo.textContent = 'Listo';
    S.sub.textContent = '';
    pintar(
      '<div class="sus-esp">' +
        '<div class="sus-ok"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' +
        '<div style="font-size:16px;font-weight:700;color:#0F172A">Quedó ' + esc(medio) + '</div>' +
        '<div style="font-size:13.5px;color:#475569;line-height:1.6;margin-top:8px;max-width:330px">' +
          /*  Lo que se dice cambia segun lo que acaba de pasar: si ya se
              cobro, decir "se te cobrara" seria confundir a quien acaba de
              ver salir la plata.                                        */
          (r && r.cobro && r.cobro.ok && !r.cobro.sin_cobro
            ? 'Se cobraron <b>' + cop(r.cobro.monto || S.opts.monto) + '</b>. '
            : (S.opts.monto && S.opts.proximo
                ? 'Se te cobrarán <b>' + cop(S.opts.monto) + '</b> ' + esc(fechaLarga(S.opts.proximo)) + '. '
                : '')) +
          'Te avisamos <b>una semana antes</b> de cada cobro.</div>' +
      '</div>' +
      '<button class="sus-btn" id="sus-fin">Entendido</button>'
    );
    d.getElementById('sus-fin').onclick = function () {
      cerrar();
      if (typeof S.opts.alTerminar === 'function') S.opts.alTerminar(r);
    };
  }

  function cerrar() {
    clearInterval(S.reloj);
    if (S.ov && S.ov.parentNode) S.ov.parentNode.removeChild(S.ov);
    d.removeEventListener('keydown', S.tecla);
  }

  function abrir(opts) {
    estilos();
    S = { opts: opts || {} };
    var ov = d.createElement('div');
    ov.className = 'sus-ov';
    ov.innerHTML =
      '<div class="sus-c" role="dialog" aria-modal="true">' +
        '<div class="sus-h">' +
          '<div class="sus-t" id="sus-tit">Activa el cobro automático</div>' +
          '<div class="sus-s" id="sus-sub">Autorizas una vez y tu plan se renueva solo. ' +
            'Sin volver a hacer transferencias ni mandar comprobantes.</div>' +
        '</div>' +
        '<div class="sus-b" id="sus-body"></div>' +
      '</div>';
    d.body.appendChild(ov);
    S.ov = ov;
    S.cuerpo = d.getElementById('sus-body');
    S.titulo = d.getElementById('sus-tit');
    S.sub    = d.getElementById('sus-sub');

    /*  Se puede cerrar con Escape y tocando fuera — al revés que la pantalla
        de cuenta suspendida, que NO se puede cerrar a propósito. Aquí sí:
        quien entra a cambiar su tarjeta puede arrepentirse.               */
    S.tecla = function (e) { if (e.key === 'Escape') cerrar(); };
    d.addEventListener('keydown', S.tecla);
    ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });

    verMedios();
  }

  return { abrir: abrir, cerrar: cerrar };
})(window, document);
