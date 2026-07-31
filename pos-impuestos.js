/* ══════════════ pos-impuestos.js — IMPUESTOS (INC / IVA) ══════════════
   Un solo lugar donde se calcula el impuesto, para que el cobro, el recibo y
   los informes NUNCA den números distintos.

   VIENE APAGADO. Un restaurante pequeño en Colombia suele ser "no responsable"
   de impoconsumo y no cobra nada (es el caso de El Parche). Si está apagado,
   todas las funciones devuelven cero y el sistema se comporta exactamente como
   si esto no existiera.

   TRES REGLAS QUE NO SE NEGOCIAN
   1. El precio de la carta manda. Con "precio incluye impuesto" (lo normal en
      Colombia), subir la tarifa NO cambia lo que paga el cliente: cambia cuánto
      de ese precio es impuesto.
   2. Se calcula POR LÍNEA y después se suma. Sobre el total, con varias tarifas
      mezcladas, el resultado queda mal y el redondeo se desvía.
   3. La tarifa se CONGELA al vender. Los informes leen lo guardado, no
      recalculan. Si mañana sube el impuesto, las ventas ya declaradas no pueden
      cambiar.

   Cascada de la tarifa:  producto → categoría → restaurante                  */
(function () {
  'use strict';

  var CFG = null;        // {activo, tipo, pct, incluido, nit, razon_social, resolucion}
  var PCT_CAT = {};      // categoría → tarifa (o undefined si hereda)
  var PCT_PROD = {};     // producto  → tarifa (o undefined si hereda)

  var NOMBRES = { inc: 'Impoconsumo', iva: 'IVA', otro: 'Impuesto' };

  function defaults() {
    return { activo: false, tipo: 'inc', pct: 8, incluido: true,
             nit: '', razon_social: '', resolucion: '' };
  }

  /* Config del restaurante. Sale de branches.operacion_config.impuestos. */
  function setConfig(imp) {
    CFG = Object.assign(defaults(), imp || {});
    return CFG;
  }
  function config() { return CFG || defaults(); }
  function activo() { return !!config().activo; }
  function nombre() { var c = config(); return NOMBRES[c.tipo] || NOMBRES.otro; }

  /* Excepciones por categoría y por producto (NULL = hereda). */
  function setTarifas(cats, prods) {
    PCT_CAT = {}; PCT_PROD = {};
    (cats || []).forEach(function (c) {
      if (c && c.id != null && c.impuesto_pct != null) PCT_CAT[c.id] = Number(c.impuesto_pct);
    });
    (prods || []).forEach(function (p) {
      if (!p || p.id == null) return;
      if (p.impuesto_pct != null) PCT_PROD[p.id] = Number(p.impuesto_pct);
      if (p.category_id != null) PCT_PROD['_cat_' + p.id] = p.category_id;
    });
  }

  /* Tarifa que le toca a un producto, siguiendo la cascada. */
  function tarifaDe(productId, categoryId) {
    if (!activo()) return 0;
    if (productId != null && PCT_PROD[productId] != null) return PCT_PROD[productId];
    var cat = categoryId != null ? categoryId : PCT_PROD['_cat_' + productId];
    if (cat != null && PCT_CAT[cat] != null) return PCT_CAT[cat];
    return Number(config().pct) || 0;
  }

  /* El corazón: de un valor cobrado a base + impuesto.
     · incluido = true  → el precio YA trae el impuesto adentro (Colombia).
     · incluido = false → el impuesto se suma encima. */
  function desglosar(valor, pct) {
    var v = Number(valor) || 0, p = Number(pct) || 0;
    if (!activo() || p <= 0) return { base: v, impuesto: 0, total: v, pct: 0 };
    if (config().incluido) {
      var base = v / (1 + p / 100);
      return { base: round(base), impuesto: round(v - base), total: v, pct: p };
    }
    var imp = v * p / 100;
    return { base: v, impuesto: round(imp), total: round(v + imp), pct: p };
  }
  // Al peso: en Colombia no se factura con centavos.
  function round(n) { return Math.round((Number(n) || 0)); }

  /* Impuesto de un pedido completo, línea por línea.
     items: [{product_id, category_id, total}]  (total = lo cobrado por la línea)
     Devuelve los totales y el desglose POR TARIFA, que es lo que pide el
     contador y lo que se congela en la venta. */
  function calcularPedido(items, extras) {
    var out = { activo: activo(), base: 0, impuesto: 0, total: 0, porTarifa: [], lineas: [] };
    var acum = {};
    (items || []).forEach(function (it) {
      var pct = tarifaDe(it.product_id, it.category_id);
      var d = desglosar(it.total, pct);
      out.lineas.push({ product_id: it.product_id, tax_pct: d.pct, tax_base: d.base, tax_amount: d.impuesto });
      out.base += d.base; out.impuesto += d.impuesto; out.total += d.total;
      if (d.pct > 0) {
        if (!acum[d.pct]) acum[d.pct] = { pct: d.pct, base: 0, monto: 0 };
        acum[d.pct].base += d.base; acum[d.pct].monto += d.impuesto;
      }
    });
    // Empaque y domicilio: si el restaurante los cobra, van a la tarifa general.
    // (Qué tratamiento llevan de verdad lo confirma el contador de cada quien.)
    (extras || []).forEach(function (x) {
      var pct = Number(x.pct != null ? x.pct : config().pct) || 0;
      var d = desglosar(x.valor, pct);
      out.base += d.base; out.impuesto += d.impuesto; out.total += d.total;
      if (d.pct > 0) {
        if (!acum[d.pct]) acum[d.pct] = { pct: d.pct, base: 0, monto: 0 };
        acum[d.pct].base += d.base; acum[d.pct].monto += d.impuesto;
      }
    });
    out.porTarifa = Object.keys(acum).map(function (k) { return acum[k]; })
      .sort(function (a, b) { return b.pct - a.pct; });
    out.base = round(out.base); out.impuesto = round(out.impuesto); out.total = round(out.total);
    return out;
  }

  /* Texto para el recibo. Si está apagado devuelve null y no se imprime nada. */
  function lineasRecibo(taxDetail, taxBase) {
    if (!activo()) return null;
    var det = taxDetail || [];
    if (!det.length) return null;
    var out = [{ label: 'Base gravable', valor: taxBase }];
    det.forEach(function (t) {
      out.push({ label: nombre() + ' ' + fmtPct(t.pct) + '%', valor: t.monto });
    });
    return out;
  }
  function fmtPct(p) { return String(Math.round((Number(p) || 0) * 100) / 100).replace('.', ','); }

  /* Leyenda legal para el que NO cobra impuesto. */
  function leyendaNoResponsable() {
    return activo() ? null : 'No responsable de impuesto al consumo.';
  }

  window.posImpuestos = {
    defaults: defaults, setConfig: setConfig, config: config, activo: activo,
    nombre: nombre, setTarifas: setTarifas, tarifaDe: tarifaDe,
    desglosar: desglosar, calcularPedido: calcularPedido,
    lineasRecibo: lineasRecibo, leyendaNoResponsable: leyendaNoResponsable,
    fmtPct: fmtPct,
  };
})();
