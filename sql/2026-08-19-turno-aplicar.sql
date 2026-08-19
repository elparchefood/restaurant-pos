-- fn_turno_aplicar — acepta las porciones recomendadas.
-- REGLA DE SERGIO, literal: "sin cambiar absolutamente nada mas, ni precios,
-- ni unidad ni nada, solo cambiaria la porcion". Por eso esto toca UNA sola
-- llave dentro de `cantidades` y nada mas, y deja el rastro en
-- iv_receta_ajustes para poder devolverse.
create or replace function fn_turno_aplicar(p_turno uuid, p_ajustes jsonb, p_por text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t        iv_turnos%rowtype;
  a        jsonb;
  r        iv_recetas%rowtype;
  antes    numeric;
  nueva    numeric;
  pres     text;
  hechos   jsonb := '[]'::jsonb;
begin
  select * into t from iv_turnos where id = p_turno;
  if not found then return jsonb_build_object('error','turno no encontrado'); end if;

  for a in select * from jsonb_array_elements(coalesce(p_ajustes,'[]'::jsonb))
  loop
    select * into r from iv_recetas where id = (a->>'receta_id')::uuid;
    continue when not found;
    pres  := a->>'pres_key';
    nueva := (a->>'porcion')::numeric;
    if pres is null or nueva is null or nueva <= 0 then continue; end if;

    antes := (r.cantidades->pres->>'q')::numeric;

    /* jsonb_set con la ruta exacta: lo demas de la receta (merma, el insumo,
       las otras presentaciones) queda intacto. */
    update iv_recetas
       set cantidades = jsonb_set(coalesce(cantidades,'{}'::jsonb),
                                  array[pres,'q'], to_jsonb(nueva), true),
           updated_at = now()
     where id = r.id;

    insert into iv_receta_ajustes (tenant_id, branch_id, turno_id, receta_id, insumo_id,
                                   product_id, presentacion, cantidad_antes, cantidad_nueva,
                                   motivo, aprobado_por)
    values (t.tenant_id, t.branch_id, p_turno, r.id, r.insumo_id,
            r.product_id, pres, antes, nueva, 'turno', p_por);

    hechos := hechos || jsonb_build_object('receta_id', r.id, 'antes', antes, 'ahora', nueva);
  end loop;

  return jsonb_build_object('aplicados', jsonb_array_length(hechos), 'detalle', hechos);
end;
$function$;

grant execute on function fn_turno_aplicar(uuid, jsonb, text) to service_role, authenticated;
notify pgrst, 'reload schema';
