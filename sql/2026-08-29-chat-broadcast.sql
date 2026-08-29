-- ═══════════════════════════════════════════════════════════════════════════
--  EL CHAT POR BROADCAST (29-ago-2026, aprobado por Sergio)
--
--  `postgres_changes` obliga al servidor a comprobar permisos FILA POR FILA y
--  suscriptor por suscriptor en cada mensaje: es el modo caro, y el que se
--  atraganta con muchos clientes conectados. `broadcast` es un aviso suelto:
--  no pasa por esa maquinaria y llega antes.
--
--  El canal es PRIVADO ('chat-b:<tenant>') y la politica de abajo decide
--  quien puede escucharlo: solo alguien autenticado DE ESE restaurante. Sin
--  la politica, nadie recibe nada (privado = cerrado por defecto).
--
--  El disparador esta envuelto en EXCEPTION: si el broadcast fallara por lo
--  que sea, EL MENSAJE SE GUARDA IGUAL. Un aviso perdido se recupera solo
--  (el postgres_changes actual sigue puesto como respaldo); un mensaje de un
--  cliente perdido no se recupera nunca.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_chat_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(
      to_jsonb(new),
      'msg',
      'chat-b:' || new.tenant_id::text,
      true                                   -- privado
    );
  exception when others then
    null;                                    -- el aviso nunca tumba el mensaje
  end;
  return new;
end;
$$;

drop trigger if exists trg_chat_broadcast on public.chat_messages;
create trigger trg_chat_broadcast
  after insert on public.chat_messages
  for each row execute function public.trg_chat_broadcast();

--  Quien puede ESCUCHAR el canal privado de su restaurante.
drop policy if exists chat_broadcast_escucha on realtime.messages;
create policy chat_broadcast_escucha on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() = 'chat-b:' || public.current_tenant_id()::text
  );

notify pgrst, 'reload schema';
