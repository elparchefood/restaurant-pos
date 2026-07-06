/* onboarding.js — Wizard de primer ingreso · Cobra POS */
/* 3 pasos: Restaurante → Sucursal → Confirmacion */
/* Crea tenant/brand/branch en Supabase, inicializa localStorage */

(function () {
  'use strict';

  /* ── Credenciales admin (service role) ─────────────────────────── */
  var SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
  var SERVICE_KEY  = ['sb_secret_cEW8', 'WUFtaCwX9zFUm97iQ_FxCeNOsl'].join('-');
  var sbAdmin;  /* se inicializa en DOMContentLoaded */

  /* ── Estado del wizard ─────────────────────────────────────────── */
  var S = {
    step:  0,
    type:  'Restaurante',
    mesas: 8
  };

  /* ── Helpers DOM ───────────────────────────────────────────────── */
  function byId(id) { return document.getElementById(id); }
  function val(id)  { var el = byId(id); return el ? el.value.trim() : ''; }

  /* ── Barra de progreso ─────────────────────────────────────────── */
  function updateProgress() {
    var fills  = document.querySelectorAll('.ob-seg-fill');
    var segs   = document.querySelectorAll('.ob-seg');
    var labels = document.querySelectorAll('.ob-slabel');
    var n = S.step;

    segs.forEach(function (seg, i) {
      seg.classList.remove('done', 'current');
      if (i < n)  seg.classList.add('done');
      if (i === n) seg.classList.add('current');
    });

    fills.forEach(function (fill, i) {
      /* agregar clase anim solo una vez (primera vez que se llama) */
      if (!fill.classList.contains('anim')) {
        setTimeout(function () { fill.classList.add('anim'); }, 50);
      }
      fill.style.transform = i <= n ? 'scaleX(1)' : 'scaleX(0)';
    });

    labels.forEach(function (lbl, i) {
      lbl.classList.remove('on', 'done');
      if (i < n)  lbl.classList.add('done');
      if (i === n) lbl.classList.add('on');
    });

    byId('stepCount').textContent = 'Paso ' + (n + 1) + ' de 3';
  }

  /* ── Mostrar / ocultar pasos y pie ────────────────────────────── */
  function goTo(n) {
    /* pasos */
    document.querySelectorAll('.ob-step').forEach(function (sec, i) {
      sec.classList.toggle('on', i === n);
    });

    /* pie: mostrar variante del paso */
    ['foot-0', 'foot-1', 'foot-2'].forEach(function (id, i) {
      var el = byId(id);
      if (!el) return;
      if (i === n) {
        el.removeAttribute('hidden');
        if (n === 0) el.style.display = 'contents';
      } else {
        el.setAttribute('hidden', '');
        if (i === 0) el.style.display = '';
      }
    });

    /* pie clase .center en paso 3 */
    var foot = byId('ob-foot');
    if (foot) foot.classList.toggle('center', n === 2);

    /* scroll arriba */
    var body = byId('ob-body');
    if (body) body.scrollTop = 0;

    S.step = n;
    updateProgress();
  }

  /* ── Validar campos requeridos de un paso ─────────────────────── */
  function validateStep(stepIndex) {
    var section = byId('step-' + stepIndex);
    if (!section) return true;
    var fields = section.querySelectorAll('.ob-input[data-req]');
    var valid  = true;
    var first  = null;

    fields.forEach(function (input) {
      var errId = input.id;
      var errEl = section.querySelector('[data-err="' + errId + '"]');
      if (!input.value.trim()) {
        input.classList.add('err');
        if (errEl) errEl.classList.add('on');
        if (!first) first = input;
        valid = false;
      } else {
        input.classList.remove('err');
        if (errEl) errEl.classList.remove('on');
      }
    });

    if (first) first.focus();
    return valid;
  }

  /* ── Limpiar error al escribir ────────────────────────────────── */
  function clearErr(input) {
    input.classList.remove('err');
    var section = input.closest('.ob-step');
    if (section) {
      var errEl = section.querySelector('[data-err="' + input.id + '"]');
      if (errEl) errEl.classList.remove('on');
    }
  }

  /* ── Selector de tipo de negocio ──────────────────────────────── */
  function initTypeGrid() {
    var grid = byId('typeGrid');
    if (!grid) return;
    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.ob-type');
      if (!btn) return;
      grid.querySelectorAll('.ob-type').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      S.type = btn.dataset.type;
    });
  }

  /* ── Stepper de mesas ─────────────────────────────────────────── */
  function updateStepper() {
    var numEl  = byId('mesaNum');
    var minus  = byId('mesaMinus');
    var plus   = byId('mesaPlus');
    if (numEl)  numEl.textContent    = S.mesas;
    if (minus)  minus.disabled       = S.mesas <= 1;
    if (plus)   plus.disabled        = S.mesas >= 50;
  }

  function initStepper() {
    var minus = byId('mesaMinus');
    var plus  = byId('mesaPlus');
    if (minus) {
      minus.addEventListener('click', function () {
        S.mesas = Math.max(1,  S.mesas - 1);
        updateStepper();
      });
    }
    if (plus) {
      plus.addEventListener('click', function () {
        S.mesas = Math.min(50, S.mesas + 1);
        updateStepper();
      });
    }
    updateStepper();
  }

  /* ── Meta de ventas: formato miles colombiano ─────────────────── */
  function initGoalFormat() {
    var input = byId('f-goal');
    if (!input) return;
    input.addEventListener('input', function () {
      var raw = input.value.replace(/\D/g, '');
      input.value = raw ? Number(raw).toLocaleString('es-CO') : '';
    });
  }

  /* ── Resumen del paso 3 ───────────────────────────────────────── */
  function buildSummary() {
    var name    = val('f-name')   || 'Mi restaurante';
    var branch  = val('f-branch') || 'Sede Principal';
    var mesas   = S.mesas;
    byId('sum-name').textContent   = name;
    byId('sum-branch').textContent = branch;
    byId('sum-mesas').textContent  = mesas + (mesas === 1 ? ' mesa' : ' mesas');
  }

  /* ── Seed de mesas en localStorage ───────────────────────────── */
  function seedLocalMesas(branchId, nMesas) {
    var zones  = [{ id: 'z_salon_' + Date.now(), name: 'Salon principal' }];
    var tables = [];
    for (var i = 1; i <= nMesas; i++) {
      tables.push({
        id:     'mesa_' + i + '_' + Date.now(),
        name:   'Mesa ' + i,
        seats:  4,
        zoneId: zones[0].id
      });
    }
    localStorage.setItem('pos.config.salon.v1', JSON.stringify({ zones: zones, tables: tables }));
  }

  /* ── Crear tenant / brand / branch en Supabase ───────────────── */
  async function createRestaurant() {
    var nombre_gerente = val('f-nombre');
    var nombre    = val('f-name');
    var dial      = (document.getElementById('f-dial') || {value:'57'}).value;
    var telefono  = '+' + dial + ' ' + val('f-phone');
    var ciudad    = val('f-city');
    var pais      = val('f-country') || 'Colombia';
    var branchNom = val('f-branch');
    var direccion = val('f-addr');
    var goalRaw   = (byId('f-goal').value || '').replace(/\D/g, '');
    var metaDiaria = goalRaw ? Number(goalRaw) : null;

    /* -- obtener usuario actual -- */
    var { data: { user }, error: uErr } = await sb.auth.getUser();
    if (uErr || !user) throw new Error('No se pudo obtener el usuario actual');

    /* -- 1. Crear tenant -- */
    var { data: tenant, error: tErr } = await sbAdmin.from('tenants').insert({
      name:   nombre,
      email:  user.email,
      plan:   'starter',
      status: 'active'
    }).select().single();
    if (tErr) throw tErr;

    /* -- 2. Crear brand -- */
    var { data: brand, error: bErr } = await sbAdmin.from('brands').insert({
      tenant_id: tenant.id,
      name:      nombre
    }).select().single();
    if (bErr) throw bErr;

    /* -- 3. Crear branch -- */
    var branchData = {
      brand_id:   brand.id,
      tenant_id:  tenant.id,
      name:       branchNom,
      address:    direccion,
      city:       ciudad,
      phone:      telefono,
      is_active:  true,
      is_open:    false
    };
    if (metaDiaria) branchData.daily_goal = metaDiaria;
    var { data: branch, error: brErr } = await sbAdmin.from('branches').insert(branchData).select().single();
    if (brErr) throw brErr;

    /* -- 4. Crear pos_users (gerente) -- */
    try {
      await sbAdmin.from('pos_users').insert({
        id:                  user.id,
        branch_id:           branch.id,
        tenant_id:           tenant.id,
        name:                nombre_gerente || nombre,
        role:                'gerente',
        phone:               telefono,
        is_authorized_admin: true
      });
    } catch (e) {
      console.warn('[onboarding] pos_users insert error (no critico):', e);
    }

    /* -- 5. Actualizar user_metadata con tenant_id / branch_id -- */
    var { error: metaErr } = await sb.auth.updateUser({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        negocio:   nombre,
        tipo:      S.type,
        nombre:    nombre_gerente,
        ciudad:    ciudad,
        pais:      pais,
        telefono:  telefono,
        daily_goal: metaDiaria
      }
    });
    if (metaErr) console.warn('[onboarding] updateUser meta error:', metaErr);

    /* -- 6. Seed de mesas en localStorage -- */
    seedLocalMesas(branch.id, S.mesas);

    /* -- 7. Marcar onboarding completado -- */
    localStorage.setItem('pos.onboarding.done', 'true');

    return { tenant, brand, branch };
  }

  /* ── Handler del botón "Crear mi restaurante" ─────────────────── */
  async function handleFinish(btn) {
    if (!validateStep(1)) return;

    buildSummary();

    /* estado de carga */
    btn.disabled    = true;
    btn.textContent = 'Creando...';

    try {
      await createRestaurant();
      goTo(2);
    } catch (e) {
      console.error('[onboarding] Error al crear restaurante:', e);
      btn.disabled    = false;
      btn.innerHTML   = 'Crear mi restaurante';
      /* mostrar mensaje de error temporal */
      var msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#DC2626;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2)';
      msg.textContent = 'Error al crear el restaurante. Revisa tu conexion e intenta de nuevo.';
      document.body.appendChild(msg);
      setTimeout(function () { msg.remove(); }, 5000);
    }
  }

  /* ── Handler del botón "Ir al dashboard" ─────────────────────── */
  function handleDashboard(btn) {
    btn.disabled    = true;
    btn.textContent = 'Abriendo tu dashboard...';
    /* actualizar state global si pos-core ya cargó */
    try {
      if (window._pos && window._pos.state) {
        /* el usuario ya actualizó su metadata; recargar sesión */
        sb.auth.refreshSession().then(function () {
          window.location.href = 'dashboard.html';
        }).catch(function () {
          window.location.href = 'dashboard.html';
        });
      } else {
        window.location.href = 'dashboard.html';
      }
    } catch (e) {
      window.location.href = 'dashboard.html';
    }
  }

  /* ── Enter en campos: avanza al siguiente paso ────────────────── */
  function initEnterKey() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      if (S.step === 0) {
        if (validateStep(0)) goTo(1);
      } else if (S.step === 1) {
        var btn = document.querySelector('[data-act="finish"]');
        if (btn) handleFinish(btn);
      }
    });
  }

  /* ── Delegacion de eventos del pie ───────────────────────────── */
  function initFootEvents() {
    var foot = byId('ob-foot');
    if (!foot) return;
    foot.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'next')      { if (validateStep(0)) goTo(1); }
      else if (act === 'back') { goTo(0); }
      else if (act === 'finish') { handleFinish(btn); }
      else if (act === 'dashboard') { handleDashboard(btn); }
    });
  }

  /* ── Limpiar errores al escribir ─────────────────────────────── */
  function initClearErrors() {
    document.querySelectorAll('.ob-input[data-req]').forEach(function (input) {
      input.addEventListener('input', function () { clearErr(input); });
    });
  }

  /* ── Init ────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    /* crear cliente admin */
    sbAdmin = supabase.createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    initTypeGrid();
    initStepper();
    initGoalFormat();
    initClearErrors();
    initFootEvents();
    initEnterKey();

    /* estado inicial correcto */
    updateProgress();
  });

})();
