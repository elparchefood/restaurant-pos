// soporte-llamadas/index.ts — las videollamadas de soporte con Cobra
/* ══════════════════════════════════════════════════════════════════════
   EL AGENDADOR PROPIO DE COBRA (10-sep-2026)

   Punto 7 de la lista: un restaurante con un problema agenda una
   videollamada con Sergio desde su Escritorio, sin salir de Cobra y sin
   Calendly. Decidido con Sergio: Google Meet (una sala fija suya, que pone
   en la consola), 30 minutos, aviso por correo y lista en la consola.

   Acciones:
     · del restaurante:  huecos · mia · agendar · cancelar
     · de la plataforma: lista · marcar · config · guardar_config

   El restaurante sale del TOKEN, nunca del cuerpo. La hora se valida AQUI
   contra el horario y las citas tomadas; y la base tiene un indice unico
   por hora, asi que ni dos pantallas en el mismo segundo la duplican.
   Colombia no cambia de hora: todo se calcula en UTC-5.
   ══════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY") || "";
const DE           = Deno.env.get("CORREO_REMITENTE") || "Cobra POS <ingreso@cobrapos.app>";
const OFF_H = 5;   // Colombia: UTC-5 todo el año

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Fila = Record<string, any>;
const ok = (d: unknown) => new Response(JSON.stringify(d), { headers: { ...CORS, "content-type": "application/json" } });
const SRV = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { ...SRV, "content-type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { /* no era JSON */ }
  return { ok: r.ok, status: r.status, data: d };
}
const esc = (t: unknown) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ── Quien llama ─────────────────────────────────────────────────────── */
async function quien(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  //  La llave de servicio (pruebas desde el servidor) cuenta como plataforma.
  if (token === SERVICE_KEY) return { admin: true, servicio: true, tenant: "", sub: "", email: "", nombre: "Cobra" };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const sub = String(u.id || "");
  let tenant = String(u?.user_metadata?.tenant_id || "");
  if (!tenant && sub) {
    const f = await db(`pos_users?select=tenant_id&or=(auth_user_id.eq.${sub},id.eq.${sub})&limit=1`);
    tenant = String(f.data?.[0]?.tenant_id || "");
  }
  const a = await fetch(`${SUPABASE_URL}/rest/v1/rpc/es_admin_plataforma`, {
    method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}",
  });
  const admin = a.ok ? (await a.json().catch(() => false)) === true : false;
  const md = u.user_metadata || {};
  return { admin, servicio: false, tenant, sub, email: String(u.email || ""), nombre: String(md.nombre || md.full_name || md.name || "") };
}

/* ── El horario y los huecos ─────────────────────────────────────────── */
async function agenda(): Promise<Fila> {
  const r = await db("plataforma_agenda?id=eq.1&select=*");
  return r.data?.[0] || {};
}
function hoyBogota(): Date {
  const d = new Date(Date.now() - OFF_H * 3600000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function instante(dia: Date, hhmm: string): number {
  const [h, m] = String(hhmm).split(":").map(Number);
  return Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), (h || 0) + OFF_H, m || 0);
}
async function huecos(cfg: Fila) {
  const dur = Math.max(10, Number(cfg.duracion_min) || 30);
  const ant = Math.max(0, Number(cfg.anticipacion_min) || 0);
  const dias = Math.min(60, Math.max(1, Number(cfg.dias_adelante) || 14));
  const bloq = new Set((Array.isArray(cfg.bloqueos) ? cfg.bloqueos : []).map(String));
  const tom = await db(`plataforma_llamadas?estado=eq.agendada&fin=gt.${new Date().toISOString()}&select=inicio`);
  const ocupado = new Set((tom.data || []).map((x: Fila) => new Date(x.inicio).toISOString()));
  const desde = Date.now() + ant * 60000;
  const base = hoyBogota();
  const out: Array<{ fecha: string; slots: string[] }> = [];
  for (let i = 0; i < dias; i++) {
    const dia = new Date(base.getTime() + i * 86400000);
    const fecha = dia.toISOString().slice(0, 10);
    if (bloq.has(fecha)) continue;
    const rangos = ((cfg.horario || {})[String(dia.getUTCDay())] || []) as string[][];
    const slots: string[] = [];
    for (const [a, b] of rangos) {
      let t = instante(dia, a);
      const fin = instante(dia, b);
      while (t + dur * 60000 <= fin) {
        const iso = new Date(t).toISOString();
        if (t >= desde && !ocupado.has(iso)) slots.push(iso);
        t += dur * 60000;
      }
    }
    if (slots.length) out.push({ fecha, slots });
  }
  return { duracion: dur, dias: out };
}

/* ── Los correos ─────────────────────────────────────────────────────── */
function cuando(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
}
async function correo(para: string, asunto: string, html: string, texto: string) {
  if (!RESEND_KEY || !para) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: DE, to: [para], subject: asunto, html, text: texto, reply_to: "sergio@cobrapos.app" }),
    });
    if (!r.ok) console.error("[llamadas] correo:", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) { console.error("[llamadas] correo:", String(e).slice(0, 200)); return false; }
}
function caja(titulo: string, filas: Array<[string, string]>, boton?: [string, string], pie = "") {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F5F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">
  <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5B6BFF;margin-bottom:14px">Cobra POS</div>
  <h1 style="font-size:20px;font-weight:800;color:#0F172A;margin:0 0 16px">${esc(titulo)}</h1>
  <div style="background:#F8FAFC;border:1px solid #E8EAEF;border-radius:12px;padding:16px;margin-bottom:18px">
    ${filas.filter((f) => f[1]).map((f) => `<div style="font-size:12px;color:#94A3B8;margin-bottom:2px">${esc(f[0])}</div>
    <div style="font-size:15px;font-weight:600;color:#0F172A;margin-bottom:12px;white-space:pre-wrap">${esc(f[1])}</div>`).join("")}
  </div>
  ${boton ? `<a href="${esc(boton[1])}" style="display:block;background:#5B6BFF;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:11px;font-size:15px;font-weight:700;margin-bottom:16px">${esc(boton[0])}</a>` : ""}
  ${pie ? `<p style="font-size:13px;color:#64748B;line-height:1.6;margin:0">${pie}</p>` : ""}
</div></body></html>`;
}

async function nombreRestaurante(tenant: string): Promise<string> {
  const b = await db(`brands?tenant_id=eq.${tenant}&select=name&order=created_at.asc&limit=1`);
  if (b.data?.[0]?.name) return String(b.data[0].name);
  const t = await db(`tenants?id=eq.${tenant}&select=name&limit=1`);
  return String(t.data?.[0]?.name || "Restaurante");
}

/* ── El puerto ───────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const q = await quien(req);
  if (!q) return ok({ ok: false, error: "Tu sesión venció. Vuelve a entrar." });
  const b = await req.json().catch(() => ({})) as Fila;
  const accion = String(b.accion || "");
  const ahora = new Date().toISOString();

  /* ── Del restaurante ── */
  if (accion === "huecos") {
    return ok({ ok: true, ...(await huecos(await agenda())) });
  }

  if (accion === "mia") {
    if (!q.tenant) return ok({ ok: true, llamada: null });
    const r = await db(`plataforma_llamadas?tenant_id=eq.${q.tenant}&estado=eq.agendada&fin=gt.${ahora}&order=inicio.asc&limit=1&select=id,inicio,fin,motivo`);
    const l = r.data?.[0] || null;
    const cfg = l ? await agenda() : {};
    return ok({ ok: true, llamada: l ? { ...l, meet_url: cfg.meet_url || "" } : null });
  }

  if (accion === "agendar") {
    if (!q.tenant) return ok({ ok: false, error: "Tu usuario no tiene un restaurante asignado." });
    const inicio = new Date(String(b.inicio || ""));
    if (isNaN(inicio.getTime())) return ok({ ok: false, error: "Escoge el día y la hora." });
    const cfg = await agenda();
    const libres = await huecos(cfg);
    const iso = inicio.toISOString();
    if (!libres.dias.some((d) => d.slots.includes(iso))) {
      return ok({ ok: false, error: "Esa hora ya no está disponible. Escoge otra." });
    }
    const ya = await db(`plataforma_llamadas?tenant_id=eq.${q.tenant}&estado=eq.agendada&fin=gt.${ahora}&select=id&limit=1`);
    if (ya.data?.length) {
      return ok({ ok: false, error: "Ya tienes una videollamada agendada. Cancélala si quieres escoger otra hora." });
    }
    const restaurante = await nombreRestaurante(q.tenant);
    const fin = new Date(inicio.getTime() + libres.duracion * 60000).toISOString();
    const fila = {
      tenant_id: q.tenant, branch_id: b.branch_id ? String(b.branch_id) : null, user_id: q.sub || null,
      restaurante, contacto: String(b.contacto || q.nombre || "").trim().slice(0, 80),
      correo: q.email || null, telefono: String(b.telefono || "").replace(/[^0-9+ ]/g, "").slice(0, 20) || null,
      motivo: String(b.motivo || "").trim().slice(0, 500) || null, inicio: iso, fin,
    };
    const ins = await db("plataforma_llamadas", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(fila) });
    if (!ins.ok) {
      return ok({ ok: false, error: ins.status === 409 ? "Esa hora la acaban de tomar. Escoge otra." : "No se pudo agendar. Intenta de nuevo." });
    }
    const l = ins.data?.[0] || fila;
    const hora = cuando(iso);
    const meet = String(cfg.meet_url || "");
    await correo(String(cfg.correo_aviso || "sergio@cobrapos.app"),
      `Nueva videollamada: ${restaurante} · ${hora}`,
      caja("Nueva videollamada de soporte", [
        ["Restaurante", restaurante], ["Cuándo", hora], ["Quién", fila.contacto || ""],
        ["Correo", fila.correo || ""], ["Celular", fila.telefono || ""], ["Sobre qué es", fila.motivo || ""],
      ], meet ? ["Abrir la sala de Meet", meet] : undefined, "La ves también en la consola de plataforma, en Videollamadas."),
      `Nueva videollamada\n${restaurante}\n${hora}\n${fila.contacto || ""} ${fila.correo || ""} ${fila.telefono || ""}\n${fila.motivo || ""}\n${meet}`);
    //  Las cuentas de prueba (@ejemplo / @example) no reciben correo: no se le
    //  escribe a un dominio ajeno ni se ensucia el remitente de Cobra.
    if (q.email && !/@(ejemplo|example)\./i.test(q.email)) {
      await correo(q.email, `Tu videollamada con Cobra POS: ${hora}`,
        caja("Tu videollamada quedó agendada", [
          ["Cuándo", hora + " (hora de Colombia)"], ["Duración", libres.duracion + " minutos por Google Meet"],
          ["Sobre qué es", fila.motivo || ""],
        ], meet ? ["Entrar a la videollamada", meet] : undefined,
        "A la hora de la cita entra con este botón o desde el Escritorio de Cobra. Si necesitas cambiarla, cancélala en el Escritorio y escoge otra hora."),
        `Tu videollamada con Cobra POS quedo agendada\n${hora} (hora de Colombia), ${libres.duracion} minutos por Google Meet.\n${meet}`);
    }
    return ok({ ok: true, llamada: { id: l.id, inicio: iso, fin, motivo: fila.motivo, meet_url: meet } });
  }

  if (accion === "cancelar") {
    const r = await db(`plataforma_llamadas?id=eq.${encodeURIComponent(String(b.id || ""))}&select=*&limit=1`);
    const l = r.data?.[0];
    if (!l || !(q.admin || l.tenant_id === q.tenant)) return ok({ ok: false, error: "No se encontró esa videollamada." });
    if (l.estado !== "agendada") return ok({ ok: true });
    const por = q.admin && l.tenant_id !== q.tenant ? "cobra" : "restaurante";
    await db(`plataforma_llamadas?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify({ estado: "cancelada", cancelada_por: por }) });
    const hora = cuando(l.inicio);
    if (por === "restaurante") {
      const cfg = await agenda();
      await correo(String(cfg.correo_aviso || "sergio@cobrapos.app"), `Cancelada: ${l.restaurante} · ${hora}`,
        caja("Cancelaron una videollamada", [["Restaurante", l.restaurante], ["Era", hora], ["Sobre qué era", l.motivo || ""]]),
        `Cancelaron la videollamada de ${l.restaurante} (${hora}).`);
    } else if (l.correo && !/@(ejemplo|example)\./i.test(String(l.correo))) {
      await correo(String(l.correo), "Tu videollamada con Cobra POS se canceló",
        caja("Tuvimos que cancelar tu videollamada", [["Era", hora]], ["Agendar otra hora", "https://cobrapos.app/dashboard.html"],
          "Perdona el cambio. Escoge otra hora desde el Escritorio de Cobra."),
        `Tuvimos que cancelar tu videollamada del ${hora}. Escoge otra hora desde el Escritorio de Cobra.`);
    }
    return ok({ ok: true });
  }

  /* ── El INTERESADO que agenda por el chat de Cobra (11-sep-2026) ──────
     Todavia no tiene cuenta, asi que no hay token de restaurante: lo agenda
     el asistente de Cobra (`chat-cobra`) con la llave de servicio. La cita
     queda a nombre del restaurante interno de Cobra, con `origen='interesado'`
     y la conversacion enlazada, y sale en la misma lista de Videollamadas de
     la consola. Misma validacion de la hora que un restaurante.          */
  if (accion === "agendar_interesado") {
    if (!q.servicio) return ok({ ok: false, error: "Solo el asistente de Cobra." });
    const inicio = new Date(String(b.inicio || ""));
    if (isNaN(inicio.getTime())) return ok({ ok: false, error: "Falta el día y la hora." });
    const cfg = await agenda();
    const libres = await huecos(cfg);
    const iso = inicio.toISOString();
    if (!libres.dias.some((d) => d.slots.includes(iso))) {
      return ok({ ok: false, error: "Esa hora ya no está disponible." });
    }
    const plat = await db("tenants?es_plataforma=is.true&select=id&limit=1");
    const tenantPlat = String(plat.data?.[0]?.id || "");
    if (!tenantPlat) return ok({ ok: false, error: "Falta el restaurante interno de Cobra." });
    //  Una cita viva por conversacion: si ya tiene una, no se le crea otra.
    const conv = String(b.conversation_id || "");
    if (conv) {
      const ya = await db(`plataforma_llamadas?conversation_id=eq.${conv}&estado=eq.agendada&fin=gt.${ahora}&select=id,inicio&limit=1`);
      if (ya.data?.length) return ok({ ok: false, error: "Ya tiene una demo agendada: " + cuando(ya.data[0].inicio) });
    }
    const fin = new Date(inicio.getTime() + libres.duracion * 60000).toISOString();
    const correoI = String(b.correo || "").trim().toLowerCase();
    const fila = {
      tenant_id: tenantPlat, origen: "interesado", conversation_id: conv || null,
      restaurante: String(b.restaurante || "").trim().slice(0, 80) || "Interesado",
      contacto: String(b.contacto || "").trim().slice(0, 80) || null,
      correo: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoI) ? correoI : null,
      telefono: String(b.telefono || "").replace(/[^0-9+ ]/g, "").slice(0, 20) || null,
      motivo: String(b.motivo || "Demostración de Cobra POS").trim().slice(0, 500), inicio: iso, fin,
    };
    const ins = await db("plataforma_llamadas", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(fila) });
    if (!ins.ok) return ok({ ok: false, error: ins.status === 409 ? "Esa hora la acaban de tomar." : "No se pudo agendar." });
    const hora = cuando(iso);
    const meet = String(cfg.meet_url || "");
    //  `silencio`: las pruebas del asistente no le mandan correo a nadie.
    if (b.silencio !== true) await correo(String(cfg.correo_aviso || "sergio@cobrapos.app"),
      `Demo agendada por el chat: ${fila.restaurante} · ${hora}`,
      caja("Un interesado agendó una demostración", [
        ["Negocio", fila.restaurante], ["Cuándo", hora], ["Quién", fila.contacto || ""],
        ["Correo", fila.correo || ""], ["Celular", fila.telefono || ""], ["Sobre qué es", fila.motivo],
      ], meet ? ["Abrir la sala de Meet", meet] : undefined, "La agendó el asistente de Cobra. La conversación está en la consola, en Chat de Cobra."),
      `Demo agendada por el chat\n${fila.restaurante}\n${hora}\n${fila.contacto || ""} ${fila.correo || ""} ${fila.telefono || ""}\n${meet}`);
    if (b.silencio !== true && fila.correo && !/@(ejemplo|example)\./i.test(fila.correo)) {
      await correo(fila.correo, `Tu demostración de Cobra POS: ${hora}`,
        caja("Tu demostración quedó agendada", [
          ["Cuándo", hora + " (hora de Colombia)"], ["Duración", libres.duracion + " minutos por Google Meet"],
        ], meet ? ["Entrar a la videollamada", meet] : undefined,
        "A la hora de la cita entra con este botón. Si necesitas cambiarla, escríbenos por el mismo chat."),
        `Tu demostracion de Cobra POS quedo agendada\n${hora} (hora de Colombia), ${libres.duracion} minutos por Google Meet.\n${meet}`);
    }
    return ok({ ok: true, llamada: { id: ins.data?.[0]?.id, inicio: iso, fin, cuando: hora, meet_url: meet, duracion: libres.duracion } });
  }

  /* ── De la plataforma ── */
  if (!q.admin) return ok({ ok: false, error: "Solo la plataforma." });

  if (accion === "lista") {
    const hace = new Date(Date.now() - 60 * 60000).toISOString();
    const [prox, pas] = await Promise.all([
      db(`plataforma_llamadas?estado=eq.agendada&fin=gt.${hace}&order=inicio.asc&select=*`),
      db(`plataforma_llamadas?or=(estado.neq.agendada,fin.lte.${hace})&order=inicio.desc&limit=25&select=*`),
    ]);
    const cfg = await agenda();
    return ok({ ok: true, proximas: prox.data || [], pasadas: pas.data || [], meet_url: cfg.meet_url || "" });
  }

  if (accion === "marcar") {
    const estado = String(b.estado || "");
    if (estado !== "hecha") return ok({ ok: false, error: "Estado no válido." });
    await db(`plataforma_llamadas?id=eq.${encodeURIComponent(String(b.id || ""))}`, { method: "PATCH", body: JSON.stringify({ estado }) });
    return ok({ ok: true });
  }

  if (accion === "config") return ok({ ok: true, config: await agenda() });

  if (accion === "guardar_config") {
    const c = (b.config || {}) as Fila;
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    const horario: Fila = {};
    for (const k of ["0", "1", "2", "3", "4", "5", "6"]) {
      const rs = Array.isArray(c.horario?.[k]) ? c.horario[k] : [];
      horario[k] = rs.filter((r: any) => Array.isArray(r) && hhmm.test(r[0]) && hhmm.test(r[1]) && r[0] < r[1]).slice(0, 3);
    }
    const meet = String(c.meet_url || "").trim();
    if (meet && !/^https:\/\/meet\.google\.com\/[a-z0-9-]+/i.test(meet)) {
      return ok({ ok: false, error: "El enlace de Meet debe empezar por https://meet.google.com/" });
    }
    const patch = {
      meet_url: meet || null,
      correo_aviso: String(c.correo_aviso || "sergio@cobrapos.app").trim(),
      duracion_min: [15, 30, 45, 60].includes(Number(c.duracion_min)) ? Number(c.duracion_min) : 30,
      anticipacion_min: Math.min(2880, Math.max(0, Number(c.anticipacion_min) || 0)),
      dias_adelante: Math.min(60, Math.max(1, Number(c.dias_adelante) || 14)),
      horario,
      bloqueos: (Array.isArray(c.bloqueos) ? c.bloqueos : []).map(String).filter((x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 100),
      updated_at: new Date().toISOString(),
    };
    const r = await db("plataforma_agenda?id=eq.1", { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
    return ok(r.ok ? { ok: true, config: r.data?.[0] } : { ok: false, error: "No se pudo guardar." });
  }

  return ok({ ok: false, error: "Acción desconocida." });
});
