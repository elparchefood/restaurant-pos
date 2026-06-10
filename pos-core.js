/* pos-core.js — Helpers compartidos por todas las páginas del POS */
/* Incluye: Supabase client, $(), COPF(), COP(), todayRange(), daysAgoISO() */

// dashboard.js — Panel principal Comanda POS
// REGLA: Nada hardcodeado. Todo dato viene de Supabase.
// =====================================================

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──────────────────────────────────────────
const $ = id => document.getElementById(id);
const COP = n => {
  if (n == null) return '—';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(n%1e6===0?0:1) + 'M';
  if (n >= 1e3)  return '$' + Math.round(n/1e3) + 'k';
  return '$' + Math.round(n).toLocaleString('es-CO');
};
const COPF = n => '$' + Math.round(n||0).toLocaleString('es-CO');
const pct  = (a,b) => b ? Math.min(100, Math.round((a/b)*100)) : 0;

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function todayRange() {
  const t = todayISO();
  return { start: t + 'T00:00:00.000Z', end: t + 'T23:59:59.999Z' };
}
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0,10);
}

