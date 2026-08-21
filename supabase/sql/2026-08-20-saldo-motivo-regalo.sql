-- "Dar saldo" (motivo 'regalo') fallaba EN SILENCIO desde siempre: el candado
-- de motivos de pos_saldo_mov no incluia 'regalo', aunque los informes ya lo
-- leian. Se agrega. (20-ago-2026; lo destapo la prueba del aviso de saldo.)
alter table pos_saldo_mov drop constraint pos_saldo_mov_motivo_check;
alter table pos_saldo_mov add constraint pos_saldo_mov_motivo_check
  check (motivo in ('recarga','bono_recarga','consumo','ajuste','anulacion','regalo'));
