/* ═══════════════ INFORMES · registro de datos ═══════════════
   OJO: los kpis/blocks que trae cada informe aquí son DATOS DE EJEMPLO del
   diseño. La app NO los pinta: solo se muestran informes con datos reales
   (ver informes-datos.js). Sirven como referencia de la forma que debe
   devolver cada cargador. Nunca mostrarlos como si fueran del negocio.
   Declarativo: categorías, módulos y especificaciones de cada informe.
   Los bloques (kpis/table/hbars/vbars/donut/line/gbars/grid) los pinta app.js. */

const IC = {
  search:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  chev:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  arrow:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  back:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  export:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  eye:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  print:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  pdf:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  cal:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  x:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  vizmini:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  empty:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="14" width="3" height="4"/></svg>',
  ventas:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  caja:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  inv:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  clientes:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  canales:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  gerencial:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>',
};

/* colores para categorías de producto (data-driven) */
const CATC = { burgers:'#5B6BFF', bebidas:'#0EA5E9', perros:'#F43F5E', salchi:'#10B981', sandwich:'#8B5CF6', adiciones:'#F59E0B' };

const MODULES = [
  {k:'delivery',   name:'Domicilios / Delivery'},
  {k:'reservas',   name:'Reservas'},
  {k:'qr',         name:'Autoservicio / QR'},
  {k:'afluencia',  name:'Afluencia de mesas'},
  {k:'multimarca', name:'Multimarca / Food-court'},
  {k:'multisucursal', name:'Multi-sucursal'},
  {k:'dian',       name:'Facturación electrónica DIAN'},
];

const CATEGORIES = [
  {k:'ventas',     name:'Ventas',              icon:IC.ventas,     color:'#5B6BFF', tint:'#EEF2FF', desc:'Qué se vendió, cuándo y cómo se pagó.'},
  {k:'caja',       name:'Caja y Dinero',       icon:IC.caja,       color:'#16A34A', tint:'#DCFCE7', desc:'Cierres, egresos, empleados y cartera.'},
  {k:'inventario', name:'Inventario y Costos', icon:IC.inv,        color:'#B45309', tint:'#FFF7ED', desc:'Food cost, márgenes, stock y compras.'},
  {k:'clientes',   name:'Clientes',            icon:IC.clientes,   color:'#0EA5E9', tint:'#F0F9FF', desc:'Frecuencia, ticket y fidelidad.'},
  {k:'canales',    name:'Canales y Módulos',   icon:IC.canales,    color:'#8B5CF6', tint:'#F5F3FF', desc:'Domicilios, reservas, QR y marcas.'},
  {k:'gerencial',  name:'Gerencial',           icon:IC.gerencial,  color:'#E11D48', tint:'#FFF1F2', desc:'Visión de negocio y comparativos.'},
];

/* helpers de payload */
const pay = (...a)=>({ _pay:a });   // lista de formas de pago -> pills

/* ═══════════════ REPORTES ═══════════════ */
const REPORTS = [
/* ─────── VENTAS ─────── */
{id:'sal-todas', cat:'ventas', viz:'table', name:'Todas las ventas',
 desc:'Detalle de cada venta del periodo con sus formas de pago, tipo y estado.',
 filters:['fecha','sucursal','caja','turno','canal','empleado','estado'],
 kpis:[
   {lbl:'Subtotal',val:'$ 4.128.500'},
   {lbl:'Descuentos',val:'– $ 214.000',tone:'warn'},
   {lbl:'Total vendido',val:'$ 3.914.500',tone:'accent'},
   {lbl:'# Ventas',val:'186'}],
 blocks:[{t:'card',title:'Ventas del periodo',sub:'186 ventas · 5 anuladas',
   body:{t:'table',min:1020,
   cols:[{k:'f',label:'Fecha / hora'},{k:'t',label:'Turno'},{k:'m',label:'Mesa'},{k:'c',label:'Caja'},{k:'cl',label:'Cliente'},{k:'p',label:'Formas de pago'},{k:'tot',label:'Total',num:1},{k:'ti',label:'Tipo'},{k:'e',label:'Estado'},{k:'ac',label:''}],
   rows:[
     {f:'12 jul · 20:42',t:'Noche',m:'Mesa 7',c:'Caja 1',cl:'Carolina Restrepo',p:pay(['Efectivo','$30.000'],['Transf.','$12.000']),tot:'$ 42.000',ti:{_pill:['neu','Contado']},e:{_pill:['ok','Activa']},ac:'_act'},
     {f:'12 jul · 20:15',t:'Noche',m:'Mostrador',c:'Caja 1',cl:'—',p:pay(['Nequi','$28.000']),tot:'$ 28.000',ti:{_pill:['neu','Contado']},e:{_pill:['ok','Activa']},ac:'_act'},
     {f:'12 jul · 19:58',t:'Noche',m:'Mesa 3',c:'Caja 2',cl:'Felipe Ríos',p:pay(['Tarjeta','$64.000']),tot:'$ 64.000',ti:{_pill:['neu','Contado']},e:{_pill:['ok','Activa']},ac:'_act'},
     {f:'12 jul · 19:30',t:'Noche',m:'Mesa 9',c:'Caja 1',cl:'Adriana Eraso',p:pay(['Efectivo','$18.000']),tot:'$ 18.000',ti:{_pill:['brand','Crédito']},e:{_pill:['ok','Activa']},ac:'_act'},
     {f:'12 jul · 19:12',t:'Noche',m:'Mesa 2',c:'Caja 2',cl:'—',p:pay(['—','$52.000']),tot:'$ 52.000',ti:{_pill:['neu','Contado']},e:{_pill:['bad','Anulada']},ac:'_act',dim:1},
     {f:'12 jul · 18:44',t:'Tarde',m:'Domicilio',c:'Caja 1',cl:'Camilo Restrepo',p:pay(['Efectivo','$35.000'],['Nequi','$50.000']),tot:'$ 85.000',ti:{_pill:['neu','Contado']},e:{_pill:['ok','Activa']},ac:'_act'},
   ],
   total:{cl:'Total (186 ventas)',tot:'$ 3.914.500'}}}]},

{id:'sal-producto', cat:'ventas', viz:'chart', name:'Ventas por producto',
 desc:'Ranking de productos por facturación, con desglose por canal y participación.',
 filters:['fecha','categoria','canal'],
 options:['Incluir combos','Ver cortesías','Agrupar por categoría','Ver costos'],
 kpis:[
   {lbl:'Productos vendidos',val:'1.284 u'},
   {lbl:'Facturación',val:'$ 3.914.500',tone:'accent'},
   {lbl:'Ticket por ítem',val:'$ 3.048'},
   {lbl:'Producto estrella',val:'Premium Mixta'}],
 blocks:[
   {t:'card',title:'Top 10 por facturación',sub:'Barras horizontales · participación sobre el total',
    body:{t:'hbars',items:[
      {lbl:'Premium Mixta',w:100,val:'$ 812.000',color:CATC.burgers},
      {lbl:'El Parche Especial',w:78,val:'$ 630.000',color:CATC.burgers},
      {lbl:'Salchipapa Familiar',w:64,val:'$ 518.000',color:CATC.salchi},
      {lbl:'Doble Carne',w:55,val:'$ 445.000',color:CATC.burgers},
      {lbl:'Perro Especial',w:41,val:'$ 332.000',color:CATC.perros},
      {lbl:'Coca-Cola 350ml',w:33,val:'$ 268.000',color:CATC.bebidas},
      {lbl:'BBQ Crispy',w:28,val:'$ 224.000',color:CATC.burgers},
      {lbl:'Sandwich de Pollo',w:22,val:'$ 176.000',color:CATC.sandwich},
      {lbl:'Limonada natural',w:18,val:'$ 148.000',color:CATC.bebidas},
      {lbl:'Adición Tocineta',w:13,val:'$ 104.000',color:CATC.adiciones}]}},
   {t:'card',title:'Detalle por producto',
    body:{t:'table',min:820,
    cols:[{k:'p',label:'Producto'},{k:'c',label:'Categoría'},{k:'q',label:'Cant.',num:1},{k:'pr',label:'Precio',num:1},{k:'sal',label:'Salón',num:1},{k:'dom',label:'Domicilio',num:1},{k:'tot',label:'Total',num:1},{k:'pct',label:'% total',num:1}],
    rows:[
      {p:{_main:'Premium Mixta'},c:{_cat:['burgers','Hamburguesas']},q:'29',pr:'$ 28.000',sal:'18',dom:'11',tot:'$ 812.000',pct:'20,7%'},
      {p:{_main:'El Parche Especial'},c:{_cat:['burgers','Hamburguesas']},q:'18',pr:'$ 35.000',sal:'12',dom:'6',tot:'$ 630.000',pct:'16,1%'},
      {p:{_main:'Salchipapa Familiar'},c:{_cat:['salchi','Salchipapas']},q:'21',pr:'$ 24.667',sal:'14',dom:'7',tot:'$ 518.000',pct:'13,2%'},
      {p:{_main:'Doble Carne'},c:{_cat:['burgers','Hamburguesas']},q:'14',pr:'$ 31.786',sal:'9',dom:'5',tot:'$ 445.000',pct:'11,4%'},
      {p:{_main:'Perro Especial'},c:{_cat:['perros','Perros Calientes']},q:'19',pr:'$ 17.474',sal:'13',dom:'6',tot:'$ 332.000',pct:'8,5%'}],
    total:{p:'Total (48 productos)',tot:'$ 3.914.500',pct:'100%'}}}]},

{id:'sal-dia', cat:'ventas', viz:'chart', name:'Ventas por día del mes',
 desc:'Facturación diaria del periodo para detectar picos y días flojos.',
 filters:['fecha','sucursal','canal'],
 kpis:[{lbl:'Total del mes',val:'$ 42.680.000',tone:'accent'},{lbl:'Mejor día',val:'Sáb 12 · $ 3,9M',tone:'good'},{lbl:'Día más flojo',val:'Lun 7 · $ 640k'},{lbl:'Promedio diario',val:'$ 1.376.000'}],
 blocks:[
   {t:'card',title:'Ventas por día',sub:'Julio 2026',body:{t:'vbars',autopeak:1,items:[
     {x:'1',w:52,val:'$1,4M'},{x:'2',w:60,val:'$1,6M'},{x:'3',w:74,val:'$2,0M'},{x:'4',w:88,val:'$2,4M'},{x:'5',w:70,val:'$1,9M'},{x:'6',w:96,val:'$2,6M'},{x:'7',w:24,val:'$0,6M'},{x:'8',w:40,val:'$1,1M'},{x:'9',w:56,val:'$1,5M'},{x:'10',w:72,val:'$1,9M'},{x:'11',w:90,val:'$2,4M'},{x:'12',w:100,val:'$3,9M'},{x:'13',w:64,val:'$1,7M'},{x:'14',w:36,val:'$1,0M'}]}},
   {t:'card',title:'Detalle diario',body:{t:'table',min:520,cols:[{k:'d',label:'Día'},{k:'v',label:'# Ventas',num:1},{k:'t',label:'Total',num:1},{k:'tk',label:'Ticket prom.',num:1}],rows:[
     {d:'Sáb 12 jul',v:'132',t:'$ 3.914.500',tk:'$ 29.655'},{d:'Vie 11 jul',v:'98',t:'$ 2.410.000',tk:'$ 24.592'},{d:'Jue 10 jul',v:'76',t:'$ 1.902.000',tk:'$ 25.026'},{d:'Mié 9 jul',v:'61',t:'$ 1.520.000',tk:'$ 24.918'},{d:'Lun 7 jul',v:'28',t:'$ 640.000',tk:'$ 22.857'}],total:{d:'Total mes',v:'1.842',t:'$ 42.680.000'}}}]},

{id:'sal-hora', cat:'ventas', viz:'chart', name:'Ventas por hora',
 desc:'Distribución de ventas por franja horaria para planear personal y cocina.',
 filters:['fecha','sucursal','canal'],
 kpis:[{lbl:'Hora punta',val:'8:00 pm',tone:'good',sub:'42 ventas'},{lbl:'Hora valle',val:'3:00 pm',sub:'4 ventas'},{lbl:'Ticket prom. / hora',val:'$ 26.400'},{lbl:'Ventas totales',val:'186'}],
 blocks:[
   {t:'card',title:'Ventas por franja horaria',sub:'Hora punta resaltada en verde · hora valle atenuada',
    body:{t:'vbars',items:[
      {x:'11a',w:22,val:'8'},{x:'12m',w:46,val:'17'},{x:'1p',w:58,val:'22'},{x:'2p',w:30,val:'11'},{x:'3p',w:11,val:'4',cls:'low'},{x:'4p',w:18,val:'6'},{x:'5p',w:34,val:'13'},{x:'6p',w:62,val:'24'},{x:'7p',w:84,val:'33'},{x:'8p',w:100,val:'42',cls:'peak'},{x:'9p',w:74,val:'29'},{x:'10p',w:40,val:'15'}]}},
   {t:'card',title:'Detalle por hora',body:{t:'table',min:520,cols:[{k:'h',label:'Franja'},{k:'v',label:'# Ventas',num:1},{k:'t',label:'Total',num:1},{k:'tk',label:'Ticket prom.',num:1}],rows:[
     {h:'8:00 – 9:00 pm',v:'42',t:'$ 1.184.000',tk:'$ 28.190'},{h:'7:00 – 8:00 pm',v:'33',t:'$ 902.000',tk:'$ 27.333'},{h:'9:00 – 10:00 pm',v:'29',t:'$ 748.000',tk:'$ 25.793'},{h:'6:00 – 7:00 pm',v:'24',t:'$ 612.000',tk:'$ 25.500'},{h:'3:00 – 4:00 pm',v:'4',t:'$ 96.000',tk:'$ 24.000'}],total:{h:'Total',v:'186',t:'$ 3.914.500'}}}]},

{id:'sal-pago', cat:'ventas', viz:'chart', name:'Ventas por forma de pago',
 desc:'Cómo pagan tus clientes: participación de cada medio de pago.',
 filters:['fecha','sucursal','caja','turno'],
 kpis:[{lbl:'Efectivo',val:'$ 1.605.000',sub:'41%'},{lbl:'Nequi',val:'$ 1.096.000',sub:'28%'},{lbl:'Transferencia',val:'$ 743.000',sub:'19%'},{lbl:'Tarjeta',val:'$ 470.500',sub:'12%'}],
 blocks:[
   {t:'card',title:'Participación por medio de pago',
    body:{t:'donut',centerBig:'$3,9M',centerLbl:'Total',segs:[
      {name:'Efectivo',val:'$ 1.605.000',pct:41,color:'#16A34A'},
      {name:'Nequi',val:'$ 1.096.000',pct:28,color:'#8B5CF6'},
      {name:'Transferencia',val:'$ 743.000',pct:19,color:'#5B6BFF'},
      {name:'Tarjeta',val:'$ 470.500',pct:12,color:'#0EA5E9'}]}},
   {t:'card',title:'Detalle',body:{t:'table',min:460,cols:[{k:'m',label:'Medio'},{k:'v',label:'# Ventas',num:1},{k:'t',label:'Total',num:1},{k:'p',label:'%',num:1}],rows:[
     {m:'Efectivo',v:'86',t:'$ 1.605.000',p:'41,0%'},{m:'Nequi',v:'52',t:'$ 1.096.000',p:'28,0%'},{m:'Transferencia',v:'31',t:'$ 743.000',p:'19,0%'},{m:'Tarjeta',v:'17',t:'$ 470.500',p:'12,0%'}],total:{m:'Total',v:'186',t:'$ 3.914.500',p:'100%'}}}]},

{id:'sal-combo', cat:'ventas', viz:'chart', name:'Ventas por combo / oferta',
 desc:'Rendimiento de cada promoción activa en el periodo.',
 filters:['fecha','canal'],
 kpis:[{lbl:'Combos vendidos',val:'214 u'},{lbl:'Facturación combos',val:'$ 1.184.000',tone:'accent'},{lbl:'% sobre ventas',val:'30,2%'}],
 blocks:[
   {t:'card',title:'Top ofertas',body:{t:'hbars',items:[
     {lbl:'Combo Parche 2x',w:100,val:'$ 512.000',color:'#5B6BFF'},{lbl:'Martes de perros',w:62,val:'$ 318.000',color:'#F43F5E'},{lbl:'Salchi + Bebida',w:44,val:'$ 224.000',color:'#10B981'},{lbl:'Happy 5–7 pm',w:25,val:'$ 130.000',color:'#F59E0B'}]}},
   {t:'card',title:'Detalle de promociones',body:{t:'table',min:560,cols:[{k:'o',label:'Oferta'},{k:'v',label:'Vendidos',num:1},{k:'d',label:'Descuento',num:1},{k:'t',label:'Facturación',num:1}],rows:[
     {o:{_main:'Combo Parche 2x'},v:'92',d:'$ 84.000',t:'$ 512.000'},{o:{_main:'Martes de perros'},v:'61',d:'$ 61.000',t:'$ 318.000'},{o:{_main:'Salchi + Bebida'},v:'38',d:'$ 42.000',t:'$ 224.000'},{o:{_main:'Happy 5–7 pm'},v:'23',d:'$ 27.000',t:'$ 130.000'}],total:{o:'Total',v:'214',t:'$ 1.184.000'}}}]},

{id:'sal-modif', cat:'ventas', viz:'table', name:'Ventas por modificador / adición',
 desc:'Qué adiciones y modificadores se venden más. Sin gráfico.',
 filters:['fecha','categoria'],
 seg:['Por cantidad','Por producto'],
 kpis:[{lbl:'Adiciones vendidas',val:'438 u'},{lbl:'Ingreso por adiciones',val:'$ 612.000',tone:'accent'},{lbl:'Adición top',val:'Tocineta extra'}],
 blocks:[{t:'card',title:'Modificadores',body:{t:'table',min:520,cols:[{k:'m',label:'Modificador'},{k:'q',label:'Cantidad',num:1},{k:'pr',label:'Precio',num:1},{k:'t',label:'Total',num:1}],rows:[
   {m:{_main:'Tocineta extra'},q:'128',pr:'$ 3.000',t:'$ 384.000'},{m:{_main:'Queso doble'},q:'96',pr:'$ 2.500',t:'$ 240.000'},{m:{_main:'Salsa de la casa'},q:'112',pr:'$ 1.000',t:'$ 112.000'},{m:{_main:'Sin cebolla'},q:'74',pr:'$ 0',t:'$ 0'}],total:{m:'Total',t:'$ 736.000'}}}]},

{id:'sal-impuesto', cat:'ventas', viz:'table', name:'Ventas por impuesto',
 desc:'Desglose de IVA, impoconsumo y exentos para conciliación contable.',
 filters:['fecha','sucursal'],
 kpis:[{lbl:'Base gravable',val:'$ 3.286.975'},{lbl:'IVA 19%',val:'$ 428.000'},{lbl:'Impoconsumo 8%',val:'$ 199.525'},{lbl:'Exentos',val:'$ 342.000'}],
 blocks:[{t:'card',title:'Desglose de impuestos',body:{t:'table',min:560,cols:[{k:'i',label:'Impuesto'},{k:'b',label:'Base',num:1},{k:'tt',label:'Tarifa',num:1},{k:'v',label:'Valor',num:1}],rows:[
   {i:{_main:'IVA'},b:'$ 2.252.632',tt:'19%',v:'$ 428.000'},{i:{_main:'Impoconsumo'},b:'$ 2.494.063',tt:'8%',v:'$ 199.525'},{i:{_main:'Exentos'},b:'$ 342.000',tt:'0%',v:'$ 0'}],total:{i:'Total recaudado',v:'$ 627.525'}}}]},

{id:'sal-auditoria', cat:'ventas', viz:'table', name:'Auditoría de ventas',
 desc:'Anulaciones, modificaciones, reimpresiones y descuentos — con usuario, motivo y hora.',
 filters:['fecha','empleado','sucursal'],
 seg:['Anuladas','Pedidos modificados','Reimpresiones','Descuentos','Operación sospechosa'],
 kpis:[{lbl:'Ventas anuladas',val:'5',tone:'bad'},{lbl:'Modificaciones',val:'23',tone:'warn'},{lbl:'Reimpresiones',val:'14'},{lbl:'Desc. aplicados',val:'$ 214.000'}],
 blocks:[
   {t:'card',title:'Eventos de auditoría',body:{t:'table',min:760,cols:[{k:'h',label:'Fecha / hora'},{k:'ti',label:'Evento'},{k:'ref',label:'Venta'},{k:'u',label:'Usuario'},{k:'mo',label:'Motivo'},{k:'v',label:'Monto',num:1}],rows:[
     {h:'12 jul · 19:12',ti:{_pill:['bad','Anulación']},ref:'V-2041',u:'María Gómez',mo:'Cliente canceló pedido',v:'$ 52.000'},
     {h:'12 jul · 20:03',ti:{_pill:['warn','Modificación']},ref:'V-2050',u:'Luis Pardo',mo:'Cambio de producto',v:'$ 8.000'},
     {h:'12 jul · 20:18',ti:{_pill:['neu','Reimpresión']},ref:'V-2052',u:'María Gómez',mo:'Impresora sin papel',v:'—'},
     {h:'12 jul · 21:02',ti:{_pill:['violet','Descuento']},ref:'V-2061',u:'Admin',mo:'Cortesía gerencia',v:'$ 15.000'}]}},
   {t:'card',title:'Operación sospechosa · por usuario',sub:'Patrones de anulación y modificación',body:{t:'table',min:560,cols:[{k:'u',label:'Usuario'},{k:'an',label:'Anulaciones',num:1},{k:'mo',label:'Modif.',num:1},{k:'re',label:'Reimpr.',num:1},{k:'fl',label:'Alerta'}],rows:[
     {u:'María Gómez',an:'4',mo:'11',re:'9',fl:{_pill:['bad','Revisar']}},{u:'Luis Pardo',an:'1',mo:'8',re:'3',fl:{_pill:['warn','Vigilar']}},{u:'Admin',an:'0',mo:'4',re:'2',fl:{_pill:['ok','Normal']}}]}}]},

/* ─────── CAJA Y DINERO ─────── */
{id:'caj-propinas', cat:'caja', viz:'chart', name:'Propinas',
 desc:'Cuánta propina entró y cuánto le corresponde a cada persona.',
 filters:['fecha','sucursal','empleado']},
{id:'caj-cierres', cat:'caja', viz:'chart', name:'Histórico de cierres de caja',
 desc:'Aperturas y cierres por turno, con descuadres resaltados.',
 filters:['fecha','sucursal','caja','empleado'],
 kpis:[{lbl:'Cierres',val:'28'},{lbl:'Descuadre acumulado',val:'– $ 34.500',tone:'bad'},{lbl:'Cierres cuadrados',val:'24 / 28',tone:'good'}],
 blocks:[
   {t:'card',title:'Últimos cierres',sub:'Comparación de montos',body:{t:'vbars',autopeak:0,items:[
     {x:'07',w:38,val:'$0,6M'},{x:'08',w:52,val:'$1,1M'},{x:'09',w:60,val:'$1,5M'},{x:'10',w:74,val:'$1,9M'},{x:'11',w:90,val:'$2,4M'},{x:'12',w:100,val:'$3,9M'}]}},
   {t:'card',title:'Detalle de cierres',body:{t:'table',min:820,cols:[{k:'ap',label:'Apertura'},{k:'ci',label:'Cierre'},{k:'u',label:'Usuario'},{k:'tu',label:'Turno'},{k:'ma',label:'M. apertura',num:1},{k:'mc',label:'M. cierre',num:1},{k:'de',label:'Descuadre',num:1}],rows:[
     {ap:'12 jul 17:00',ci:'12 jul 23:40',u:'María Gómez',tu:'Noche',ma:'$ 200.000',mc:'$ 1.842.000',de:{_neg:'– $ 12.000'}},
     {ap:'12 jul 08:00',ci:'12 jul 17:00',u:'Luis Pardo',tu:'Día',ma:'$ 150.000',mc:'$ 1.204.000',de:'$ 0'},
     {ap:'11 jul 17:00',ci:'11 jul 23:30',u:'María Gómez',tu:'Noche',ma:'$ 200.000',mc:'$ 1.410.000',de:{_neg:'– $ 8.500'}}]}}]},

{id:'caj-egresos', cat:'caja', viz:'table', name:'Egresos e ingresos extra',
 desc:'Salidas y entradas de efectivo distintas a las ventas.',
 filters:['fecha','sucursal','caja','empleado'],
 kpis:[{lbl:'Egresos',val:'– $ 486.000',tone:'bad'},{lbl:'Ingresos extra',val:'+ $ 120.000',tone:'good'},{lbl:'Neto',val:'– $ 366.000'}],
 blocks:[{t:'card',title:'Movimientos',body:{t:'table',min:620,cols:[{k:'h',label:'Fecha'},{k:'ca',label:'Categoría'},{k:'co',label:'Concepto'},{k:'u',label:'Usuario'},{k:'v',label:'Monto',num:1}],rows:[
   {h:'12 jul',ca:{_pill:['bad','Egreso']},co:'Compra de gas',u:'María Gómez',v:{_neg:'– $ 180.000'}},{h:'12 jul',ca:{_pill:['bad','Egreso']},co:'Domiciliario externo',u:'Luis Pardo',v:{_neg:'– $ 60.000'}},{h:'11 jul',ca:{_pill:['ok','Ingreso']},co:'Abono cliente fiado',u:'María Gómez',v:'+ $ 120.000'}]}}]},

{id:'caj-empleado', cat:'caja', viz:'chart', name:'Ventas por empleado',
 desc:'Rendimiento por mesero, cajero y domiciliario.',
 filters:['fecha','sucursal','turno'],
 kpis:[{lbl:'Empleados activos',val:'6'},{lbl:'Mejor vendedor',val:'Luis Pardo',tone:'good'},{lbl:'Propinas',val:'$ 186.000'}],
 blocks:[
   {t:'card',title:'Comparativa de vendedores',body:{t:'hbars',items:[
     {lbl:'Luis Pardo',w:100,val:'$ 1.284.000',color:'#5B6BFF'},{lbl:'María Gómez',w:82,val:'$ 1.052.000',color:'#5B6BFF'},{lbl:'Andrés Ruiz',w:58,val:'$ 742.000',color:'#5B6BFF'},{lbl:'Felipe Ríos',w:34,val:'$ 436.000',color:'#5B6BFF'}]}},
   {t:'card',title:'Detalle',body:{t:'table',min:640,cols:[{k:'e',label:'Empleado'},{k:'r',label:'Rol'},{k:'p',label:'# Pedidos',num:1},{k:'t',label:'Total vendido',num:1},{k:'pr',label:'Propinas',num:1},{k:'co',label:'Comisión',num:1}],rows:[
     {e:{_main:'Luis Pardo'},r:{_pill:['brand','Cajero']},p:'86',t:'$ 1.284.000',pr:'$ 74.000',co:'$ 64.200'},{e:{_main:'María Gómez'},r:{_pill:['brand','Cajero']},p:'71',t:'$ 1.052.000',pr:'$ 58.000',co:'$ 52.600'},{e:{_main:'Andrés Ruiz'},r:{_pill:['neu','Mesero']},p:'52',t:'$ 742.000',pr:'$ 34.000',co:'$ 37.100'},{e:{_main:'Felipe Ríos'},r:{_pill:['violet','Domic.']},p:'38',t:'$ 436.000',pr:'$ 20.000',co:'$ 21.800'}]}}]},

{id:'caj-fiados', cat:'caja', viz:'table', name:'Fiados / créditos de clientes',
 desc:'Cuentas por cobrar con antigüedad de saldo. Sin gráfico.',
 filters:['fecha','cliente'],
 kpis:[{lbl:'Cartera total',val:'$ 842.000',tone:'warn'},{lbl:'Clientes con saldo',val:'9'},{lbl:'Vencido +30d',val:'$ 214.000',tone:'bad'}],
 blocks:[{t:'card',title:'Cuentas por cobrar',body:{t:'table',min:640,cols:[{k:'c',label:'Cliente'},{k:'sa',label:'Saldo',num:1},{k:'ult',label:'Última compra'},{k:'ag',label:'Antigüedad'},{k:'es',label:'Estado'}],rows:[
   {c:{_main:'Adriana Eraso'},sa:'$ 214.000',ult:'2 jun',ag:'40 días',es:{_pill:['bad','Vencido']}},{c:{_main:'Camilo Restrepo'},sa:'$ 180.000',ult:'28 jun',ag:'14 días',es:{_pill:['warn','Por vencer']}},{c:{_main:'Jesús Gómez'},sa:'$ 96.000',ult:'8 jul',ag:'4 días',es:{_pill:['ok','Al día']}}],total:{c:'Total cartera',sa:'$ 842.000'}}}]},

{id:'caj-retenciones', cat:'caja', viz:'table', name:'Retenciones por datáfono',
 desc:'Comisiones retenidas por tarjeta y datáfono. Sin gráfico.',
 filters:['fecha','sucursal'],
 kpis:[{lbl:'Ventas con tarjeta',val:'$ 470.500'},{lbl:'Retención total',val:'– $ 14.115',tone:'warn'},{lbl:'Neto recibido',val:'$ 456.385'}],
 blocks:[{t:'card',title:'Retenciones',body:{t:'table',min:520,cols:[{k:'da',label:'Datáfono'},{k:'v',label:'Ventas',num:1},{k:'tt',label:'Tarifa',num:1},{k:'re',label:'Retención',num:1}],rows:[
   {da:'Redeban',v:'$ 312.000',tt:'3,0%',re:{_neg:'– $ 9.360'}},{da:'Bold',v:'$ 158.500',tt:'3,0%',re:{_neg:'– $ 4.755'}}],total:{da:'Total',re:'– $ 14.115'}}}]},

{id:'caj-notas', cat:'caja', viz:'table', name:'Notas de crédito y débito',
 desc:'Documentos de ajuste emitidos en el periodo. Sin gráfico.',
 filters:['fecha','sucursal'],
 kpis:[{lbl:'Notas crédito',val:'6'},{lbl:'Notas débito',val:'2'},{lbl:'Valor ajustado',val:'– $ 128.000'}],
 blocks:[{t:'card',title:'Notas emitidas',body:{t:'table',min:560,cols:[{k:'n',label:'Documento'},{k:'ti',label:'Tipo'},{k:'ref',label:'Factura'},{k:'mo',label:'Motivo'},{k:'v',label:'Valor',num:1}],rows:[
   {n:'NC-018',ti:{_pill:['warn','Crédito']},ref:'FE-1042',mo:'Devolución producto',v:{_neg:'– $ 52.000'}},{n:'NC-019',ti:{_pill:['warn','Crédito']},ref:'FE-1051',mo:'Cobro duplicado',v:{_neg:'– $ 28.000'}},{n:'ND-004',ti:{_pill:['brand','Débito']},ref:'FE-1033',mo:'Ajuste de valor',v:'+ $ 12.000'}]}}]},

/* ─────── INVENTARIO Y COSTOS ─────── */
{id:'inv-foodcost', cat:'inventario', viz:'chart', name:'Food Cost',
 desc:'Costo de la comida sobre ventas: real vs objetivo, con evolución mensual.',
 filters:['fecha','sucursal','categoria'],
 kpis:[
   {lbl:'Food Cost real',val:'34,2%',tone:'warn',sub:'objetivo 30%'},
   {lbl:'Food Cost objetivo',val:'30,0%',tone:'accent'},
   {lbl:'Diferencia',val:'+4,2 pp',tone:'bad',sub:'por encima'},
   {lbl:'Sobrecosto estimado',val:'$ 164.000',tone:'bad'}],
 blocks:[
   {t:'grid3',children:[
     {t:'kpi',big:1,tone:'good',lbl:'Venta neta',val:'$ 3.914.500'},
     {t:'kpi',big:1,tone:'warn',lbl:'Compras del periodo',val:'$ 1.184.000'},
     {t:'kpi',big:1,lbl:'Inventario (ini → fin)',val:'$ 2,1M → $ 1,9M'}]},
   {t:'card',title:'Evolución mensual del Food Cost',sub:'Línea azul = real · línea punteada = objetivo 30%',
    body:{t:'line',target:30,points:[{x:'Feb',y:31},{x:'Mar',y:29},{x:'Abr',y:32},{x:'May',y:30},{x:'Jun',y:33},{x:'Jul',y:34.2}],ymax:40,ysuffix:'%'}},
   {t:'card',title:'Desglose del cálculo',body:{t:'table',min:520,cols:[{k:'c',label:'Concepto'},{k:'v',label:'Valor',num:1},{k:'p',label:'% s/ venta',num:1}],rows:[
     {c:'Inventario inicial',v:'$ 2.100.000',p:'—'},{c:'(+) Compras',v:'$ 1.184.000',p:'30,2%'},{c:'(–) Inventario final',v:'$ 1.900.000',p:'—'},{c:{_main:'Costo de la comida'},v:'$ 1.384.000',p:'35,4%'}],total:{c:'Food Cost real',p:'34,2%'}}}]},

{id:'inv-margen', cat:'inventario', viz:'table', name:'Margen por producto',
 desc:'Rentabilidad por producto: precio, costo de receta y margen. Márgenes negativos resaltados.',
 filters:['categoria'],
 kpis:[{lbl:'Margen promedio',val:'58,4%',tone:'good'},{lbl:'Productos en pérdida',val:'2',tone:'bad'},{lbl:'Mayor margen',val:'Limonada · 82%'}],
 blocks:[{t:'card',title:'Margen por producto',sub:'Ordenable · márgenes negativos en rojo',body:{t:'table',min:680,cols:[{k:'p',label:'Producto'},{k:'pv',label:'Precio venta',num:1},{k:'co',label:'Costo receta',num:1},{k:'m',label:'Margen $',num:1},{k:'mp',label:'Margen %',num:1}],rows:[
   {p:{_main:'Limonada natural'},pv:'$ 6.000',co:'$ 1.080',m:'$ 4.920',mp:'82,0%'},{p:{_main:'Premium Mixta'},pv:'$ 28.000',co:'$ 10.640',m:'$ 17.360',mp:'62,0%'},{p:{_main:'Salchipapa Familiar'},pv:'$ 26.000',co:'$ 13.000',m:'$ 13.000',mp:'50,0%'},{p:{_main:'Combo Parche 2x'},pv:'$ 48.000',co:'$ 49.200',m:{_neg:'– $ 1.200'},mp:{_neg:'– 2,5%'}}]}}]},

{id:'inv-stock', cat:'inventario', viz:'table', name:'Stock valorizado',
 desc:'Valor del inventario por categoría e insumo. Variante comparativa entre dos fechas.',
 filters:['fecha','sucursal','categoria'],
 seg:['Actual','Comparar 2 fechas'],
 kpis:[{lbl:'Valor total inventario',val:'$ 1.904.000',tone:'accent'},{lbl:'Insumos',val:'142'},{lbl:'Bajo mínimo',val:'8',tone:'warn'}],
 blocks:[{t:'card',title:'Stock por insumo',body:{t:'table',min:640,cols:[{k:'i',label:'Insumo'},{k:'ca',label:'Categoría'},{k:'ex',label:'Existencia',num:1},{k:'cu',label:'Costo unit.',num:1},{k:'v',label:'Valor',num:1}],rows:[
   {i:{_main:'Carne de res'},ca:'Proteínas',ex:'42 kg',cu:'$ 22.000',v:'$ 924.000'},{i:{_main:'Pan brioche'},ca:'Panadería',ex:'320 u',cu:'$ 900',v:'$ 288.000'},{i:{_main:'Papa a la francesa'},ca:'Congelados',ex:'58 kg',cu:'$ 4.200',v:'$ 243.600'}],total:{i:'Total valorizado',v:'$ 1.904.000'}}}]},

{id:'inv-kardex', cat:'inventario', viz:'table', name:'Kardex / movimientos de stock',
 desc:'Entradas, salidas, ajustes y traslados con usuario y fecha. Sin gráfico.',
 filters:['fecha','sucursal','empleado'],
 kpis:[{lbl:'Movimientos',val:'318'},{lbl:'Entradas',val:'+ 1.204 u',tone:'good'},{lbl:'Salidas',val:'– 986 u',tone:'bad'}],
 blocks:[{t:'card',title:'Movimientos de stock',body:{t:'table',min:740,cols:[{k:'h',label:'Fecha'},{k:'i',label:'Insumo'},{k:'ti',label:'Tipo'},{k:'q',label:'Cantidad',num:1},{k:'al',label:'Almacén'},{k:'u',label:'Usuario'}],rows:[
   {h:'12 jul 09:12',i:'Carne de res',ti:{_pill:['ok','Entrada']},q:'+ 30 kg',al:'Principal',u:'María Gómez'},{h:'12 jul 20:40',i:'Pan brioche',ti:{_pill:['bad','Salida']},q:'– 84 u',al:'Principal',u:'Sistema'},{h:'12 jul 21:00',i:'Papa francesa',ti:{_pill:['warn','Ajuste']},q:'– 3 kg',al:'Principal',u:'Admin'},{h:'11 jul 10:00',i:'Gaseosas',ti:{_pill:['neu','Traslado']},q:'40 u',al:'Bodega → Barra',u:'Luis Pardo'}]}}]},

{id:'inv-merma', cat:'inventario', viz:'table', name:'Merma',
 desc:'Producto perdido por daño, vencimiento o error, con su valor.',
 filters:['fecha','sucursal','categoria'],
 kpis:[{lbl:'Valor perdido',val:'$ 96.400',tone:'bad'},{lbl:'Eventos de merma',val:'18'},{lbl:'% sobre compras',val:'8,1%',tone:'warn'}],
 blocks:[{t:'card',title:'Registro de merma',body:{t:'table',min:600,cols:[{k:'h',label:'Fecha'},{k:'i',label:'Insumo'},{k:'q',label:'Cantidad',num:1},{k:'mo',label:'Motivo'},{k:'v',label:'Valor',num:1}],rows:[
   {h:'12 jul',i:'Lechuga',q:'2 kg',mo:'Vencimiento',v:{_neg:'– $ 12.000'}},{h:'11 jul',i:'Carne de res',q:'0,8 kg',mo:'Mal corte',v:{_neg:'– $ 17.600'}},{h:'10 jul',i:'Pan brioche',q:'22 u',mo:'Daño',v:{_neg:'– $ 19.800'}}],total:{i:'Total merma',v:'– $ 96.400'}}}]},

{id:'inv-compras', cat:'inventario', viz:'table', name:'Compras por insumo y proveedor',
 desc:'Historial de precios por proveedor para detectar subidas. Sin gráfico.',
 filters:['fecha','proveedor'],
 kpis:[{lbl:'Compras del mes',val:'$ 1.184.000'},{lbl:'Proveedores',val:'12'},{lbl:'Alzas detectadas',val:'3',tone:'warn'}],
 blocks:[{t:'card',title:'Precios por proveedor',body:{t:'table',min:680,cols:[{k:'i',label:'Insumo'},{k:'pr',label:'Proveedor'},{k:'ant',label:'Precio ant.',num:1},{k:'act',label:'Precio actual',num:1},{k:'va',label:'Variación'}],rows:[
   {i:'Carne de res',pr:'Cárnicos JR',ant:'$ 20.000',act:'$ 22.000',va:{_pill:['bad','+10%']}},{i:'Pan brioche',pr:'Panadería La 70',ant:'$ 900',act:'$ 900',va:{_pill:['ok','0%']}},{i:'Papa francesa',pr:'Distri Andes',ant:'$ 4.500',act:'$ 4.200',va:{_pill:['ok','–7%']}}]}}]},

{id:'inv-cuadre', cat:'inventario', viz:'table', name:'Cuadre de stock',
 desc:'Conteo físico vs sistema, con diferencia resaltada. Exporta/importa Excel.',
 filters:['fecha','sucursal','categoria'],
 kpis:[{lbl:'Insumos contados',val:'142'},{lbl:'Con diferencia',val:'11',tone:'warn'},{lbl:'Valor descuadre',val:'– $ 42.000',tone:'bad'}],
 blocks:[{t:'card',title:'Físico vs sistema',body:{t:'table',min:640,cols:[{k:'i',label:'Insumo'},{k:'si',label:'Sistema',num:1},{k:'fi',label:'Físico',num:1},{k:'di',label:'Diferencia',num:1},{k:'v',label:'Valor',num:1}],rows:[
   {i:'Carne de res',si:'42 kg',fi:'40,5 kg',di:{_neg:'– 1,5 kg'},v:{_neg:'– $ 33.000'}},{i:'Pan brioche',si:'320 u',fi:'320 u',di:'0',v:'$ 0'},{i:'Gaseosas',si:'96 u',fi:'92 u',di:{_neg:'– 4 u'},v:{_neg:'– $ 9.000'}}]}}]},

{id:'inv-vencer', cat:'inventario', viz:'table', name:'Productos por vencer',
 desc:'Insumos próximos a vencer con semáforo por días restantes.',
 filters:['sucursal','categoria'],
 kpis:[{lbl:'Por vencer (7d)',val:'6',tone:'bad'},{lbl:'Por vencer (30d)',val:'14',tone:'warn'},{lbl:'Valor en riesgo',val:'$ 128.000'}],
 blocks:[{t:'card',title:'Vencimientos',body:{t:'table',min:560,cols:[{k:'i',label:'Insumo'},{k:'lo',label:'Lote'},{k:'ve',label:'Vence'},{k:'di',label:'Días'},{k:'se',label:'Estado'}],rows:[
   {i:'Lechuga',lo:'L-0712',ve:'15 jul',di:'3',se:{_pill:['bad','Crítico']}},{i:'Queso',lo:'L-0705',ve:'22 jul',di:'10',se:{_pill:['warn','Pronto']}},{i:'Salsa BBQ',lo:'L-0620',ve:'12 ago',di:'31',se:{_pill:['ok','A tiempo']}}]}}]},

{id:'inv-paloteo', cat:'inventario', viz:'table', name:'Consumo teórico (paloteo)',
 desc:'Consumo esperado según recetas vs ventas reales. Sin gráfico.',
 filters:['fecha','categoria'],
 kpis:[{lbl:'Consumo teórico',val:'$ 1.142.000'},{lbl:'Consumo real',val:'$ 1.184.000'},{lbl:'Desviación',val:'+ $ 42.000',tone:'warn'}],
 blocks:[{t:'card',title:'Teórico vs real',body:{t:'table',min:600,cols:[{k:'i',label:'Insumo'},{k:'te',label:'Teórico',num:1},{k:'re',label:'Real',num:1},{k:'de',label:'Desviación',num:1}],rows:[
   {i:'Carne de res',te:'38 kg',re:'40,5 kg',de:{_neg:'+ 2,5 kg'}},{i:'Pan brioche',te:'318 u',re:'320 u',de:{_neg:'+ 2 u'}},{i:'Papa francesa',te:'56 kg',re:'55 kg',de:'– 1 kg'}]}}]},

{id:'inv-planificador', cat:'inventario', viz:'table', name:'Planificador de compras',
 desc:'Sugerido de compra según consumo y stock mínimo. Tabla accionable.',
 filters:['sucursal','proveedor'],
 kpis:[{lbl:'Insumos a reponer',val:'23',tone:'warn'},{lbl:'Compra sugerida',val:'$ 642.000',tone:'accent'},{lbl:'Rotura de stock',val:'4',tone:'bad'}],
 blocks:[{t:'card',title:'Sugerido de compra',body:{t:'table',min:700,cols:[{k:'i',label:'Insumo'},{k:'st',label:'Stock',num:1},{k:'mi',label:'Mínimo',num:1},{k:'su',label:'Sugerido',num:1},{k:'co',label:'Costo est.',num:1},{k:'ac',label:''}],rows:[
   {i:'Carne de res',st:'8 kg',mi:'20 kg',su:'30 kg',co:'$ 660.000',ac:{_btn:'Agregar'}},{i:'Pan brioche',st:'40 u',mi:'150 u',su:'200 u',co:'$ 180.000',ac:{_btn:'Agregar'}},{i:'Gaseosas',st:'12 u',mi:'60 u',su:'80 u',co:'$ 96.000',ac:{_btn:'Agregar'}}]}}]},

/* ─────── CLIENTES ─────── */
{id:'cli-ventas', cat:'clientes', viz:'chart', name:'Ventas por cliente',
 desc:'Frecuencia, ticket y última visita de cada cliente.',
 filters:['fecha'],
 kpis:[{lbl:'Clientes activos',val:'214'},{lbl:'Ticket promedio',val:'$ 26.400'},{lbl:'Cliente top',val:'Carolina R.'}],
 blocks:[
   {t:'card',title:'Top 10 clientes',body:{t:'hbars',items:[
     {lbl:'Carolina Restrepo',w:100,val:'$ 486.000',color:'#0EA5E9'},{lbl:'Camilo Restrepo',w:74,val:'$ 362.000',color:'#0EA5E9'},{lbl:'Jesús Gómez',w:55,val:'$ 268.000',color:'#0EA5E9'},{lbl:'Adriana Eraso',w:38,val:'$ 184.000',color:'#0EA5E9'}]}},
   {t:'card',title:'Detalle de clientes',body:{t:'table',min:640,cols:[{k:'c',label:'Cliente'},{k:'n',label:'# Compras',num:1},{k:'t',label:'Total',num:1},{k:'tk',label:'Ticket prom.',num:1},{k:'u',label:'Última visita'}],rows:[
     {c:{_main:'Carolina Restrepo'},n:'18',t:'$ 486.000',tk:'$ 27.000',u:'12 jul'},{c:{_main:'Camilo Restrepo'},n:'14',t:'$ 362.000',tk:'$ 25.857',u:'11 jul'},{c:{_main:'Jesús Gómez'},n:'9',t:'$ 268.000',tk:'$ 29.778',u:'8 jul'}]}}]},

{id:'cli-detalle', cat:'clientes', viz:'table', name:'Detalle de cliente',
 desc:'Historial completo de compras de un cliente. Sin gráfico.',
 filters:['fecha','cliente'],
 kpis:[{lbl:'Cliente',val:'Carolina R.'},{lbl:'Compras',val:'18'},{lbl:'Total histórico',val:'$ 486.000',tone:'accent'}],
 blocks:[{t:'card',title:'Historial · Carolina Restrepo',body:{t:'table',min:600,cols:[{k:'h',label:'Fecha'},{k:'r',label:'Venta'},{k:'it',label:'Ítems'},{k:'p',label:'Pago'},{k:'t',label:'Total',num:1}],rows:[
   {h:'12 jul',r:'V-2043',it:'3 ítems',p:pay(['Efectivo','']),t:'$ 42.000'},{h:'6 jul',r:'V-1988',it:'2 ítems',p:pay(['Nequi','']),t:'$ 36.000'},{h:'1 jul',r:'V-1902',it:'4 ítems',p:pay(['Tarjeta','']),t:'$ 58.000'}],total:{h:'Total',t:'$ 486.000'}}}]},

/* ─────── CANALES Y MÓDULOS ─────── */
{id:'can-chatia', cat:'canales', viz:'chart', name:'Conversión del chat IA',
 desc:'De cada 100 personas que escriben, cuántas terminan comprando.',
 filters:['fecha','sucursal']},
{id:'can-domicilios', cat:'canales', viz:'chart', module:'delivery', name:'Domicilios',
 desc:'Pedidos a domicilio por canal, con vista por producto y participación.',
 filters:['fecha','canal','empleado'],
 seg:['Por pedido','Por producto'],
 kpis:[{lbl:'Domicilios',val:'86'},{lbl:'Facturación',val:'$ 1.842.000',tone:'accent'},{lbl:'Ticket promedio',val:'$ 21.419'},{lbl:'Envíos cobrados',val:'$ 430.000'}],
 blocks:[
   {t:'card',title:'Participación por canal',body:{t:'donut',centerBig:'86',centerLbl:'Pedidos',segs:[
     {name:'WhatsApp',val:'38',pct:44,color:'#25D366'},{name:'Rappi',val:'22',pct:26,color:'#FF5A2D'},{name:'Telefónico',val:'16',pct:19,color:'#5B6BFF'},{name:'Instagram',val:'10',pct:11,color:'#E1306C'}]}},
   {t:'card',title:'Domicilios del periodo',body:{t:'table',min:760,cols:[{k:'id',label:'Pedido'},{k:'cl',label:'Cliente'},{k:'ch',label:'Canal'},{k:'do',label:'Domiciliario'},{k:'en',label:'Envío',num:1},{k:'t',label:'Total',num:1}],rows:[
     {id:'D-1042',cl:'Jesús Gómez',ch:{_pill:['ok','WhatsApp']},do:'Felipe Ríos',en:'$ 5.000',t:'$ 54.000'},{id:'D-1039',cl:'Karen J.',ch:{_pill:['warn','Rappi']},do:'Rappi',en:'$ 0',t:'$ 52.000'},{id:'D-1037',cl:'Mariana Ortiz',ch:{_pill:['brand','Telefónico']},do:'Felipe Ríos',en:'$ 6.000',t:'$ 101.000'}],total:{cl:'Total (86)',t:'$ 1.842.000'}}}]},

{id:'can-despacho', cat:'canales', viz:'chart', module:'delivery', name:'Tiempo de despacho',
 desc:'Cuánto tarda un domicilio desde el pedido hasta la entrega.',
 filters:['fecha','canal'],
 kpis:[{lbl:'Promedio',val:'32 min',tone:'accent'},{lbl:'Mínimo',val:'14 min',tone:'good'},{lbl:'Máximo',val:'58 min',tone:'bad'}],
 blocks:[{t:'card',title:'Tiempo por franja horaria',body:{t:'vbars',items:[
   {x:'12m',w:44,val:'26m'},{x:'1p',w:52,val:'30m'},{x:'6p',w:70,val:'38m'},{x:'7p',w:88,val:'46m'},{x:'8p',w:100,val:'58m',cls:'peak'},{x:'9p',w:62,val:'34m'}]}}]},

{id:'can-reservas', cat:'canales', viz:'chart', module:'reservas', name:'Reservas',
 desc:'Historial de reservaciones y ventas originadas en reservas.',
 filters:['fecha','sucursal'],
 kpis:[{lbl:'Reservas',val:'42'},{lbl:'Convertidas',val:'34',tone:'good'},{lbl:'Conversión → venta',val:'81%',tone:'accent'},{lbl:'Venta generada',val:'$ 1.284.000'}],
 blocks:[{t:'card',title:'Reservaciones',body:{t:'table',min:680,cols:[{k:'h',label:'Fecha / hora'},{k:'c',label:'Cliente'},{k:'pe',label:'Personas',num:1},{k:'me',label:'Mesa'},{k:'es',label:'Estado'},{k:'t',label:'Venta',num:1}],rows:[
   {h:'12 jul 20:00',c:'Carolina R.',pe:'4',me:'Mesa 7',es:{_pill:['ok','Cumplida']},t:'$ 142.000'},{h:'12 jul 21:00',c:'Andrés M.',pe:'2',me:'Mesa 3',es:{_pill:['ok','Cumplida']},t:'$ 68.000'},{h:'12 jul 19:30',c:'Laura P.',pe:'6',me:'Mesa 9',es:{_pill:['bad','No show']},t:'—'}]}}]},

{id:'can-autoservicio', cat:'canales', viz:'chart', module:'qr', name:'Autoservicio / QR',
 desc:'Ventas del canal self-service y pedidos por QR en mesa.',
 filters:['fecha','sucursal'],
 kpis:[{lbl:'Pedidos QR',val:'124'},{lbl:'Facturación QR',val:'$ 1.086.000',tone:'accent'},{lbl:'% del total',val:'28%'},{lbl:'Ticket QR',val:'$ 8.758'}],
 blocks:[{t:'card',title:'QR vs otros canales',body:{t:'hbars',items:[
   {lbl:'QR / Autoservicio',w:100,val:'$ 1.086.000',color:'#8B5CF6'},{lbl:'Caja / mostrador',w:78,val:'$ 848.000',color:'#5B6BFF'},{lbl:'Mesero',w:55,val:'$ 596.000',color:'#0EA5E9'}]}}]},

{id:'can-afluencia', cat:'canales', viz:'chart', module:'afluencia', name:'Afluencia',
 desc:'Personas atendidas por salón y tiempo promedio en mesa.',
 filters:['fecha','sucursal'],
 kpis:[{lbl:'Personas atendidas',val:'642'},{lbl:'Tiempo prom. en mesa',val:'48 min'},{lbl:'Rotación',val:'3,2 x'}],
 blocks:[{t:'card',title:'Personas por salón',body:{t:'hbars',items:[
   {lbl:'Salón principal',w:100,val:'312',color:'#5B6BFF'},{lbl:'Terraza',w:64,val:'198',color:'#10B981'},{lbl:'Segundo piso',w:42,val:'132',color:'#F59E0B'}]}}]},

{id:'can-multimarca', cat:'canales', viz:'chart', module:'multimarca', name:'Multimarca / food-court',
 desc:'Ventas por marca dentro del mismo local.',
 filters:['fecha','sucursal','marca'],
 kpis:[{lbl:'Marcas activas',val:'3'},{lbl:'Total food-court',val:'$ 3.914.500',tone:'accent'},{lbl:'Marca líder',val:'El Parche · 52%'}],
 blocks:[{t:'card',title:'Participación por marca',body:{t:'donut',centerBig:'$3,9M',centerLbl:'Total',segs:[
   {name:'El Parche Burgers',val:'$ 2.035.000',pct:52,color:'#5B6BFF'},{name:'Dogs & Fries',val:'$ 1.096.000',pct:28,color:'#F43F5E'},{name:'Green Bowl',val:'$ 783.500',pct:20,color:'#10B981'}]}}]},

{id:'can-asistencia', cat:'canales', viz:'table', name:'Asistencia de empleados',
 desc:'Entradas y salidas del personal. Sin gráfico.',
 filters:['fecha','empleado'],
 kpis:[{lbl:'Empleados',val:'6'},{lbl:'Horas trabajadas',val:'248 h'},{lbl:'Tardanzas',val:'3',tone:'warn'}],
 blocks:[{t:'card',title:'Registro de asistencia',body:{t:'table',min:600,cols:[{k:'e',label:'Empleado'},{k:'d',label:'Fecha'},{k:'en',label:'Entrada'},{k:'sa',label:'Salida'},{k:'ho',label:'Horas',num:1},{k:'es',label:'Estado'}],rows:[
   {e:'Luis Pardo',d:'12 jul',en:'07:58',sa:'17:04',ho:'9,1',es:{_pill:['ok','A tiempo']}},{e:'María Gómez',d:'12 jul',en:'17:12',sa:'23:40',ho:'6,5',es:{_pill:['warn','Tardanza']}},{e:'Andrés Ruiz',d:'12 jul',en:'11:55',sa:'20:00',ho:'8,1',es:{_pill:['ok','A tiempo']}}]}}]},

/* ─────── GERENCIAL ─────── */
{id:'ger-resumen', cat:'gerencial', viz:'chart', name:'Resumen del negocio',
 desc:'Visión global del periodo: ventas, ticket, egresos y utilidad estimada.',
 filters:['fecha','sucursal'],
 kpis:[
   {lbl:'Ventas',val:'$ 3.914.500',tone:'accent',big:1},
   {lbl:'# Ventas',val:'186',big:1},
   {lbl:'Ticket por venta',val:'$ 21.045',big:1},
   {lbl:'Ticket por persona',val:'$ 12.230',big:1},
   {lbl:'Descuentos',val:'– $ 214.000',tone:'warn'},
   {lbl:'Egresos',val:'– $ 486.000',tone:'warn'},
   {lbl:'Utilidad estimada',val:'$ 2.244.500',tone:'good',big:1,sub:'ventas − compras − egresos'}],
 blocks:[
   {t:'grid2',children:[
     {t:'card',title:'Ventas por día',sub:'Últimos 14 días',body:{t:'vbars',autopeak:1,items:[
       {x:'1',w:52,val:'$1,4M'},{x:'2',w:60,val:'$1,6M'},{x:'3',w:74,val:'$2,0M'},{x:'4',w:88,val:'$2,4M'},{x:'5',w:70,val:'$1,9M'},{x:'6',w:96,val:'$2,6M'},{x:'7',w:24,val:'$0,6M'},{x:'8',w:40,val:'$1,1M'},{x:'9',w:56,val:'$1,5M'},{x:'10',w:72,val:'$1,9M'},{x:'11',w:90,val:'$2,4M'},{x:'12',w:100,val:'$3,9M'},{x:'13',w:64,val:'$1,7M'},{x:'14',w:36,val:'$1,0M'}]}},
     {t:'card',title:'Formas de pago',body:{t:'donut',centerBig:'$3,9M',centerLbl:'Total',segs:[
       {name:'Efectivo',val:'41%',pct:41,color:'#16A34A'},{name:'Nequi',val:'28%',pct:28,color:'#8B5CF6'},{name:'Transferencia',val:'19%',pct:19,color:'#5B6BFF'},{name:'Tarjeta',val:'12%',pct:12,color:'#0EA5E9'}]}}]},
   {t:'grid2',children:[
     {t:'card',title:'Ventas por canal',body:{t:'hbars',items:[
       {lbl:'Salón',w:100,val:'$ 1.686.000',color:'#5B6BFF'},{lbl:'Domicilios',w:78,val:'$ 1.312.000',color:'#8B5CF6'},{lbl:'QR / mesa',w:44,val:'$ 638.000',color:'#0EA5E9'},{lbl:'Para llevar',w:16,val:'$ 278.500',color:'#10B981'}]}},
     {t:'card',title:'Top 5 productos',body:{t:'table',min:0,cols:[{k:'p',label:'Producto'},{k:'q',label:'Cant.',num:1},{k:'t',label:'Total',num:1}],rows:[
       {p:{_main:'Premium Mixta'},q:'29',t:'$ 812.000'},{p:{_main:'El Parche Especial'},q:'18',t:'$ 630.000'},{p:{_main:'Salchipapa Familiar'},q:'21',t:'$ 518.000'},{p:{_main:'Doble Carne'},q:'14',t:'$ 445.000'},{p:{_main:'Perro Especial'},q:'19',t:'$ 332.000'}]}}]}]},

{id:'ger-comparativo', cat:'gerencial', viz:'chart', name:'Comparativo mensual',
 desc:'Comparación de ventas entre meses con variación porcentual.',
 filters:['fecha'],
 kpis:[{lbl:'Mes actual',val:'$ 42,7M',tone:'accent'},{lbl:'Mes anterior',val:'$ 38,2M'},{lbl:'Variación',val:'+11,8%',tone:'good'}],
 blocks:[
   {t:'card',title:'Ventas por mes',body:{t:'gbars',legend:[{name:'2025',color:'#CBD5E1'},{name:'2026',color:'#5B6BFF'}],groups:[
     {x:'Abr',cols:[{h:60,color:'#CBD5E1'},{h:72,color:'#5B6BFF'}]},{x:'May',cols:[{h:66,color:'#CBD5E1'},{h:80,color:'#5B6BFF'}]},{x:'Jun',cols:[{h:70,color:'#CBD5E1'},{h:78,color:'#5B6BFF'}]},{x:'Jul',cols:[{h:74,color:'#CBD5E1'},{h:100,color:'#5B6BFF'}]}]}},
   {t:'card',title:'Detalle por mes',body:{t:'table',min:520,cols:[{k:'m',label:'Mes'},{k:'a',label:'Año anterior',num:1},{k:'ac',label:'Año actual',num:1},{k:'v',label:'Variación'}],rows:[
     {m:'Abril',a:'$ 32,1M',ac:'$ 36,4M',v:{_pill:['ok','+13%']}},{m:'Mayo',a:'$ 34,0M',ac:'$ 39,8M',v:{_pill:['ok','+17%']}},{m:'Junio',a:'$ 35,2M',ac:'$ 38,2M',v:{_pill:['ok','+9%']}},{m:'Julio',a:'$ 36,8M',ac:'$ 42,7M',v:{_pill:['ok','+16%']}}]}}]},

{id:'ger-ventascompras', cat:'gerencial', viz:'chart', name:'Ventas vs Compras',
 desc:'Relación mensual entre ventas y compras, con línea de utilidad.',
 filters:['fecha','sucursal'],
 kpis:[{lbl:'Ventas',val:'$ 42,7M',tone:'accent'},{lbl:'Compras',val:'$ 13,2M',tone:'warn'},{lbl:'Utilidad bruta',val:'$ 29,5M',tone:'good'}],
 blocks:[
   {t:'card',title:'Ventas vs compras por mes',body:{t:'gbars',legend:[{name:'Ventas',color:'#5B6BFF'},{name:'Compras',color:'#F59E0B'}],groups:[
     {x:'Abr',cols:[{h:72,color:'#5B6BFF'},{h:24,color:'#F59E0B'}]},{x:'May',cols:[{h:80,color:'#5B6BFF'},{h:28,color:'#F59E0B'}]},{x:'Jun',cols:[{h:78,color:'#5B6BFF'},{h:30,color:'#F59E0B'}]},{x:'Jul',cols:[{h:100,color:'#5B6BFF'},{h:32,color:'#F59E0B'}]}]}},
   {t:'card',title:'Evolución de la utilidad',body:{t:'line',points:[{x:'Abr',y:24},{x:'May',y:27},{x:'Jun',y:26},{x:'Jul',y:29.5}],ymax:35,ysuffix:'M'}}]},

{id:'ger-sucursal', cat:'gerencial', viz:'chart', module:'multisucursal', name:'Multi-sucursal',
 desc:'Comparativo de ventas, stock y precios entre locales.',
 filters:['fecha'],
 kpis:[{lbl:'Sucursales',val:'3'},{lbl:'Consolidado',val:'$ 9,8M',tone:'accent'},{lbl:'Líder',val:'Chapinero · 42%'}],
 blocks:[
   {t:'card',title:'Ventas por sucursal',body:{t:'hbars',items:[
     {lbl:'Chapinero',w:100,val:'$ 4.116.000',color:'#5B6BFF'},{lbl:'Zona T',w:74,val:'$ 3.038.000',color:'#5B6BFF'},{lbl:'Cedritos',w:64,val:'$ 2.646.000',color:'#5B6BFF'}]}},
   {t:'card',title:'Paralela por sucursal',body:{t:'table',min:640,cols:[{k:'s',label:'Sucursal'},{k:'v',label:'Ventas',num:1},{k:'st',label:'Stock valorizado',num:1},{k:'p',label:'Ticket prom.',num:1}],rows:[
     {s:{_main:'Chapinero'},v:'$ 4.116.000',st:'$ 1.904.000',p:'$ 27.000'},{s:{_main:'Zona T'},v:'$ 3.038.000',st:'$ 1.642.000',p:'$ 25.300'},{s:{_main:'Cedritos'},v:'$ 2.646.000',st:'$ 1.388.000',p:'$ 24.100'}]}}]},

{id:'ger-dian', cat:'gerencial', viz:'table', module:'dian', name:'Facturación electrónica DIAN',
 desc:'Documentos electrónicos con su estado de envío y panel de reenvío.',
 filters:['fecha','sucursal','estado'],
 kpis:[{lbl:'Documentos',val:'186'},{lbl:'Aceptados',val:'179',tone:'good'},{lbl:'Rechazados',val:'3',tone:'bad'},{lbl:'Pendientes',val:'4',tone:'warn'}],
 blocks:[{t:'card',title:'Documentos electrónicos',body:{t:'table',min:720,cols:[{k:'n',label:'Documento'},{k:'h',label:'Fecha'},{k:'cl',label:'Cliente'},{k:'t',label:'Total',num:1},{k:'es',label:'Estado DIAN'},{k:'ac',label:''}],rows:[
   {n:'FE-1042',h:'12 jul',cl:'Carolina R.',t:'$ 42.000',es:{_pill:['ok','Aceptado']},ac:''},{n:'FE-1051',h:'12 jul',cl:'—',t:'$ 28.000',es:{_pill:['warn','Pendiente']},ac:{_btn:'Reenviar'}},{n:'FE-1033',h:'12 jul',cl:'Felipe R.',t:'$ 64.000',es:{_pill:['bad','Rechazado']},ac:{_btn:'Reenviar'}}]}}]},
];

window.INFORMES = { IC, CATC, MODULES, CATEGORIES, REPORTS };
