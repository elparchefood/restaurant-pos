const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const STORAGE_BUCKET = "chat-media";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── GET: Meta webhook verification or diagnostics ────────────────────────────
  if (req.method === "GET") {
    const url   = new URL(req.url);
    const mode  = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    // (endpoint de diagnóstico ?debug=1 ELIMINADO — exponía config sin autenticación)
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response("OK", { status: 200 }); }

  try {
    const object = body.object as string;

    /* INSTAGRAM Y MESSENGER (22-ago-2026). Meta aprobo los 6 permisos que
       faltaban, asi que ya se puede con las cuentas de cualquier restaurante
       —no solo las de Sergio—. Enviar YA se sabia (meta-send); lo que faltaba
       era RECIBIR: los mensajes llegaban a esta puerta y se caian al piso,
       porque aqui solo se atendia "whatsapp_business_account".
       Los dos canales mandan la misma forma (entry[].messaging[]), solo
       cambia como se encuentra el canal, asi que se atienden juntos. */
    if (object === "instagram" || object === "page") {
      await recibirMeta(object === "instagram" ? "instagram" : "facebook",
                        (body.entry as Array<Record<string, unknown>>) || []);
      return new Response("OK", { status: 200 });
    }

    if (object === "whatsapp_business_account") {
      const entries = (body.entry as Array<Record<string, unknown>>) || [];

      for (const entry of entries) {
        const wabaId  = entry.id as string;
        const changes = (entry.changes as Array<Record<string, unknown>>) || [];

        for (const change of changes) {
          if (change.field !== "messages") continue;
          const value    = change.value as Record<string, unknown>;
          const messages = (value.messages as Array<Record<string, unknown>>) || [];
          const contacts = (value.contacts as Array<Record<string, unknown>>) || [];

          // phone_number_id viene en el payload de Meta (no hay que buscarlo en DB)
          const phoneMeta  = (value.metadata as Record<string, string>) || {};
          const phoneId    = phoneMeta.phone_number_id || "";

          if (!messages.length) continue;

          // Buscar canal por waba_id
          const chRes = await sbGet(`/rest/v1/chat_channels?channel=eq.whatsapp&select=id,tenant_id,branch_id,meta&limit=100`);
          const channels: Array<Record<string, unknown>> = chRes || [];
          const channel = channels.find((c) => {
            let m = c.meta as Record<string, unknown> | string || {};
            if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = {}; } }
            return (m as Record<string, unknown>).waba_id === wabaId;
          });
          if (!channel) continue;

          let channelMeta: Record<string, string> = {};
          const rawMeta = channel.meta;
          if (typeof rawMeta === "string") { try { channelMeta = JSON.parse(rawMeta); } catch { /* */ } }
          else if (rawMeta && typeof rawMeta === "object") { channelMeta = rawMeta as Record<string, string>; }
          const accessToken = channelMeta.access_token || "";

          const { tenant_id, branch_id, id: channel_id } = channel;

          // Números de gerente (rama admin de inventario por WhatsApp).
          let gerentes: string[] = [];
          try {
            const cfgG = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branch_id}&select=numeros_gerentes&limit=1`);
            const arr = cfgG?.[0]?.numeros_gerentes;
            if (Array.isArray(arr)) gerentes = (arr as unknown[]).map((x) => String(x).replace(/\D/g, "")).filter(Boolean);
          } catch { /* sin config, sin gerentes */ }

          for (const msg of messages) {
            const fromPhone  = msg.from as string;
            const externalId = msg.id as string;
            /*  `let` y no `const`: una nota de voz del gerente se transcribe
                y pasa a comportarse como texto desde ese momento. */
            /*  LO QUE CUENTA COMO QUE EL GERENTE DIJO ALGO.

                Escribir es "text". Pero TOCAR UN BOTON de una plantilla es
                "button", y tocarlo dentro de un mensaje interactivo es
                "interactive" — y los dos son igual de deliberados que
                escribir. Antes las puertas del inventario solo aceptaban
                "text", asi que el sistema mandaba una plantilla con botones y
                despues no sabia recibir la respuesta a sus propios botones:
                caia el aviso de "solo entiendo texto", que estaba pensado para
                un audio o un sticker. Le pasaba a Sergio cada noche al cerrar
                caja (1-sep-2026).                                          */
            const MSG_HABLA = ["text", "interactive", "button"];

            let msgType      = msg.type as string;

            let bodyText = "";
            let mediaUrl: string | null = null;
            let mediaType: string | null = null;
            /*  EL ID DEL BOTON QUE SE TOCO.

                Hasta ahora solo se guardaba el TEXTO del boton, y para el chat
                con clientes basta. Para el inventario no: el texto de un boton
                cabe en 20 caracteres, asi que dos lineas de una factura pueden
                terminar con botones que dicen casi lo mismo. El id no se
                confunde nunca — lo escribimos nosotros y viaja de ida y de
                vuelta sin que nadie lo escriba a mano.

                Va aparte de `bodyText` a proposito: el flujo de clientes
                depende de ese texto y no se toca.                          */
            let accionId = "";

            if (msgType === "text") {
              bodyText = ((msg.text as Record<string, unknown>)?.body as string) || "";

            } else if (msgType === "interactive") {
              /* Respuesta a un mensaje con BOTONES o LISTA.
                 Antes se guardaba solo "[interactive]" y se perdia QUE eligio el
                 cliente: paso el 01/08 con un "Familiar / Personal" y no hubo
                 forma de recuperarlo (Meta no deja volver a pedir el contenido
                 de un mensaje ya recibido). Ahora se guarda el texto del boton
                 y, si no viniera, al menos su id. */
              const inter = (msg.interactive as Record<string, unknown>) || {};
              const br = (inter.button_reply as Record<string, unknown>) || {};
              const lr = (inter.list_reply as Record<string, unknown>) || {};
              const titulo = String(br.title || lr.title || "").trim();
              const idBtn  = String(br.id || lr.id || "").trim();
              accionId = idBtn;
              const desc   = String(lr.description || "").trim();
              bodyText = titulo || idBtn || "[interactive]";
              if (titulo && desc) bodyText = titulo + " — " + desc;

            } else if (msgType === "button") {
              // Botones de plantilla (quick reply): el texto viene en button.text
              const btn = (msg.button as Record<string, unknown>) || {};
              bodyText = String(btn.text || btn.payload || "").trim() || "[button]";
              /*  Y su id, igual que en los interactivos. Faltaba aqui: el
                  texto de un boton cabe en 20 caracteres y dos lineas de una
                  factura pueden quedar casi iguales; el `payload` lo
                  escribimos nosotros y no se confunde nunca.               */
              accionId = String(btn.payload || "").trim();

            } else if (msgType === "location") {
              /* LA UBICACION DEL CLIENTE SE PERDIA (21-ago-2026). Este tipo
                 caia en el "else" del final y se guardaba como el texto
                 "[location]": las coordenadas —que son el dato mas valioso
                 que manda un cliente, con la precision del GPS de su
                 celular— se botaban. Con ellas, el domiciliario llega a la
                 puerta en vez de al barrio.
                 Se guardan en el cuerpo con la misma forma que ya usan las
                 ubicaciones que el restaurante ENVIA, para que el chat las
                 pinte igual. */
              const loc = (msg.location as Record<string, unknown>) || {};
              const lat = Number(loc.latitude), lng = Number(loc.longitude);
              mediaType = "location";
              if (isFinite(lat) && isFinite(lng)) {
                bodyText = JSON.stringify({
                  lat, lng,
                  name: String(loc.name || "").trim() || undefined,
                  addr: String(loc.address || "").trim() || undefined,
                });
              } else {
                /* Sin coordenadas no hay nada que guardar, pero el mensaje
                   SI existio: se deja constancia en vez de perderlo. */
                bodyText = "[ubicación sin coordenadas]";
              }

            } else if (["sticker", "image", "video", "audio", "document"].includes(msgType)) {
              const mediaObj = (msg[msgType] as Record<string, unknown>) || {};
              const mediaId  = mediaObj.id as string;
              const caption  = (mediaObj.caption as string) || "";
              const filename = (mediaObj.filename as string) || "";
              bodyText = caption || (filename ? `[${filename}]` : `[${msgType}]`);
              mediaType = msgType;
              if (mediaId && accessToken) {
                mediaUrl = await downloadAndStoreMedia(mediaId, accessToken, externalId, msgType);
              }
            } else {
              bodyText = `[${msgType}]`;
            }

            // ── REACCIONES ──────────────────────────────────────────────
            // Una reacción NO es un mensaje: es un emoji que se pega al mensaje
            // al que reaccionaron. Antes caía en el else de arriba y se guardaba
            // como "[reaction]" (se perdía el emoji y a qué mensaje apuntaba).
            // Ahora se escribe en la columna 'reaction' del mensaje objetivo.
            // Quitar la reacción en WhatsApp llega con emoji vacío → null.
            if (msgType === "reaction") {
              const rx       = (msg.reaction as Record<string, unknown>) || {};
              const targetId = String(rx.message_id || "");
              const emoji    = String(rx.emoji || "");
              if (targetId) {
                await sbPatch(
                  `/rest/v1/chat_messages?external_id=eq.${encodeURIComponent(targetId)}`,
                  { reaction: emoji || null },
                );
              }
              continue;  // no crea mensaje, no marca no-leído y no dispara el bot
            }

            // ── RAMA DE GERENTE: inventario por WhatsApp (NO es cliente) ──
            const fromDigits = String(fromPhone).replace(/\D/g, "");
            const esGerente = gerentes.some((g) => g && fromDigits && (g === fromDigits || g.slice(-10) === fromDigits.slice(-10)));
            if (esGerente) {
              // Dedup ANTES de procesar (evita doble suma si Meta reenvía el webhook)
              const dupG = await sbGet(`/rest/v1/pos_gerente_procesados?external_id=eq.${encodeURIComponent(externalId)}&limit=1`);
              if (dupG?.length) continue;
              await sbPost(`/rest/v1/pos_gerente_procesados`, { external_id: externalId });

              /*  ══ LAS NOTAS DE VOZ ═════════════════════════════════

                  Sergio, 28-ago-2026. Hasta ahora el bot contestaba «solo
                  entiendo texto y fotos», y eso obliga a soltar lo que se este
                  cargando para escribir. Poder decirle «llegaron dos galones de
                  salsa de tomate y una paca de coca cola» mientras se descarga
                  el carro es la diferencia entre actualizar el inventario o
                  dejarlo para despues — y «despues» es como el inventario se
                  desactualiza.

                  No hay motor nuevo: se transcribe con Whisper, igual que ya
                  hace Paco con los audios de los clientes, y lo transcrito
                  entra por el MISMO camino que un texto escrito. Asi todo lo
                  que ya se entiende por escrito se entiende hablado, sin
                  ensenarle nada aparte.

                  Si la transcripcion falla, se dice lo de siempre — pero
                  nunca se queda callado.                                    */
              if (msgType === "audio" && mediaUrl && OPENAI_KEY) {
                try {
                  const ar = await fetch(mediaUrl);
                  if (ar.ok) {
                    const buf = await ar.arrayBuffer();
                    //  Menos de 100 bytes no es audio; mas de 20 MB no lo toma
                    //  Whisper y ademas nadie dicta 20 MB de inventario.
                    if (buf.byteLength > 100 && buf.byteLength < 20 * 1024 * 1024) {
                      const ext = (mediaUrl.split("?")[0].split(".").pop() || "ogg").toLowerCase();
                      const fd = new FormData();
                      fd.append("file", new Blob([buf]), `audio.${ext}`);
                      fd.append("model", "whisper-1");
                      fd.append("language", "es");
                      const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                        method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: fd,
                      });
                      if (tr.ok) {
                        const tj = await tr.json();
                        const dicho = String(tj.text || "").trim();
                        if (dicho) {
                          bodyText = dicho;
                          msgType = "text";
                          console.log("[gerente] audio transcrito:", dicho.slice(0, 90));
                        }
                      } else { console.error("whisper gerente:", (await tr.text()).slice(0, 200)); }
                    }
                  }
                } catch (e) { console.error("audio gerente:", e); }
              }

              let reply = "";
              /*  Los botones o la lista que acompanan la respuesta, con la
                  misma forma que ya usa `meta-send` para los clientes. Aqui se
                  arma el envio a mano y no llamando a `meta-send` porque esa
                  funcion parte de una CONVERSACION de cliente, y un gerente no
                  tiene conversacion: su rama es otra desde el principio.   */
              let botones: Record<string, unknown> | null = null;
              /*  QUIEN CONTESTO. Sin esto, cuando el bot se atasca no hay como
                  saber si fue la factura, el inventario por texto o el saludo
                  de "solo entiendo texto": los tres devuelven 200 y desde
                  afuera se ven identicos. */
              let ruta = "";
              // ── FOTO DE FACTURA: la lee y propone reponer el inventario ──
              if (msgType === "image" && mediaUrl) {
                try {
                  const fr = await fetch(`${SUPABASE_URL}/functions/v1/factura-inventario`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ branch_id, phone: fromPhone, media_url: mediaUrl }),
                  });
                  const fd = await fr.json();
                  reply = fd.reply || "No pude leer esa factura 🤔.";
                  botones = fd.botones || null;
                  ruta = "factura-foto";
                } catch (e) { console.error("factura-inventario:", e); reply = "Hubo un error leyendo la factura."; }
              } else if (MSG_HABLA.includes(msgType) && bodyText) {
                // Si hay una factura esperando confirmación, el texto es para ella
                // (un "sí" o un "la manguera es salchicha"), no para el inventario
                // por texto. La función avisa con sin_factura si no hay ninguna.
                try {
                  const fr = await fetch(`${SUPABASE_URL}/functions/v1/factura-inventario`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ branch_id, phone: fromPhone, message: bodyText, accion: accionId }),
                  });
                  const fd = await fr.json();
                  /* SOLO si de verdad hay una factura esperando. Antes bastaba
                     con que la funcion contestara CUALQUIER cosa: cuando se
                     rompio por la mudanza del stock, devolvia "No encuentro
                     insumos" a todo, y eso bloqueaba el inventario por texto. */
                  if (fd.reply && fd.sin_factura !== true) {
                    reply = fd.reply; botones = fd.botones || null; ruta = "factura-texto";
                  }
                } catch (_e) { /* si falla, sigue el flujo normal de texto */ }
              }
              if (!reply && MSG_HABLA.includes(msgType) && bodyText) {
                try {
                  const gr = await fetch(`${SUPABASE_URL}/functions/v1/gerente-inventario`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ branch_id, message: bodyText, phone: fromPhone, accion: accionId }),
                  });
                  const gd = await gr.json();
                  /*  Si la funcion contesta 200 pero sin `reply`, eso NO es
                      "no pude procesar": es un fallo que hay que poder ver.
                      Se deja dicho en el rastro para no volver a quedarnos sin
                      pista como el 28-ago. */
                  reply = gd.reply || "No pude procesar eso 🤔.";
                  botones = gd.botones || null;
                  ruta = gd.reply ? "gerente" : "gerente-sin-respuesta";
                } catch (e) { console.error("gerente-inventario:", e); reply = "Hubo un error procesando el inventario."; }
              }
              /* ESTE AVISO ES SOLO PARA LO QUE NO ES TEXTO NI FOTO (un audio,
                 un sticker, una ubicacion). Estaba colgado de un `else` que
                 pisaba CUALQUIER respuesta ya escrita: la foto de una factura
                 se contestaba bien y acto seguido se sobrescribia con este
                 mensaje — o sea que mandar una factura SIEMPRE respondia "solo
                 entiendo texto". Y con el inventario por texto pasaba igual en
                 cuanto la otra funcion contestaba algo. */
              if (!reply) {
                reply = "👋 Hola. Por ahora solo entiendo *texto* y *fotos de facturas* para el inventario. Ej: “hay 3 kilos de carne” o “compré 2 pacas de gaseosa a 30 mil”.";
                ruta = "saludo";
              }

              /*  El rastro. Best-effort: si esto falla, el gerente igual
                  recibe su respuesta — no se le rompe el inventario por no
                  poder anotar. */
              try {
                await fetch(`${SUPABASE_URL}/rest/v1/pos_gerente_procesados?external_id=eq.${encodeURIComponent(externalId)}`, {
                  method: "PATCH",
                  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
                             "Content-Type": "application/json", Prefer: "return=minimal" },
                  body: JSON.stringify({ branch_id, telefono: fromDigits, tipo: msgType,
                    mensaje: String(bodyText || "").slice(0, 2000),
                    respuesta: String(reply || "").slice(0, 4000), ruta }),
                });
              } catch (e) { console.error("rastro gerente:", e); }
              if (phoneId && accessToken) {
                /*  LOS LIMITES SON DE WHATSAPP, NO NUESTROS: hasta 3 botones de
                    20 caracteres, o una lista de hasta 10 filas con titulo de
                    24. Pasarse no da error — Meta RECHAZA el mensaje entero, y
                    el gerente se queda sin respuesta sin saber por que. Por eso
                    se corta aqui, que es el ultimo sitio antes de salir.   */
                const payload: Record<string, unknown> = botones && botones.tipo
                  ? (function () {
                      const ops = (botones!.opciones as Array<Record<string, unknown>>) || [];
                      const cuerpo = { text: String(reply).slice(0, 1024) };
                      const pie = botones!.pie ? { footer: { text: String(botones!.pie).slice(0, 60) } } : {};
                      if (String(botones!.tipo) === "lista") {
                        return { messaging_product: "whatsapp", to: fromPhone, type: "interactive",
                          interactive: { type: "list", body: cuerpo, ...pie, action: {
                            button: String(botones!.texto_boton || "Ver").slice(0, 20),
                            sections: [{ title: String(botones!.titulo_seccion || "Opciones").slice(0, 24),
                              rows: ops.slice(0, 10).map((o, i) => ({
                                id: String(o.id || ("op_" + i)).slice(0, 200),
                                title: String(o.titulo || "").slice(0, 24),
                                ...(o.desc ? { description: String(o.desc).slice(0, 72) } : {}),
                              })).filter((r) => r.title) } ] } } };
                      }
                      return { messaging_product: "whatsapp", to: fromPhone, type: "interactive",
                        interactive: { type: "button", body: cuerpo, ...pie, action: {
                          buttons: ops.slice(0, 3).map((o, i) => ({ type: "reply", reply: {
                            id: String(o.id || ("btn_" + i)).slice(0, 256),
                            title: String(o.titulo || "").slice(0, 20) } }))
                            .filter((b) => b.reply.title) } } };
                    })()
                  : { messaging_product: "whatsapp", to: fromPhone, type: "text", text: { body: reply } };
                try {
                  const rw = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  /*  SI META RECHAZA EL INTERACTIVO, SE MANDA EL TEXTO IGUAL.
                      Un boton mal formado no puede costarle al gerente la
                      respuesta entera: la informacion es lo que importa, los
                      botones son la comodidad.                             */
                  if (!rw.ok && botones) {
                    console.error("WA interactivo rechazado:", (await rw.text()).slice(0, 300));
                    await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, type: "text", text: { body: reply } }),
                    });
                  }
                } catch (e) { console.error("WA send gerente:", e); }
              }
              continue; // no crear conversación de cliente ni disparar el bot
            }

            const contact    = contacts.find((c) => c.wa_id === fromPhone);
            const senderName = ((contact?.profile as Record<string,unknown>)?.name as string) || ("+" + fromPhone);

            // Upsert conversación
            const convRes = await sbGet(
              `/rest/v1/chat_conversations?branch_id=eq.${branch_id}&contact_handle=eq.${encodeURIComponent(fromPhone)}&channel=eq.whatsapp&select=id,unread_count&limit=1`
            );
            let convId: string;
            let unread = 0;

            if (convRes?.length) {
              convId = convRes[0].id as string;
              unread = (convRes[0].unread_count as number) || 0;
            } else {
              const avatarTint = Math.floor(Math.random() * 8) + 1;
              const newConvRes = await sbPost(`/rest/v1/chat_conversations`, {
                tenant_id, branch_id, channel: "whatsapp", channel_id,
                contact_name: senderName, contact_handle: fromPhone,
                contact_avatar_tint: avatarTint, status: "open", unread_count: 0,
                last_message: bodyText, last_message_at: new Date().toISOString(),
                last_sender: "contact", last_read: false,
              }, "return=representation");
              convId = newConvRes?.[0]?.id as string;
            }
            if (!convId) continue;

            // Dedup
            const dupCheck = await sbGet(`/rest/v1/chat_messages?external_id=eq.${encodeURIComponent(externalId)}&limit=1`);
            if (dupCheck?.length) continue;

            // Guardar mensaje entrante
            await sbPost(`/rest/v1/chat_messages`, {
              conversation_id: convId, tenant_id,
              direction: "in", origen: "cliente", body: bodyText,
              media_url: mediaUrl, media_type: mediaType,
              delivery_status: "delivered", external_id: externalId,
              sent_at: new Date(parseInt(msg.timestamp as string) * 1000).toISOString(),
            });

            await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
              last_message: bodyText, last_message_at: new Date().toISOString(),
              last_sender: "contact", last_read: false,
              unread_count: unread + 1, contact_name: senderName,
            });

            // ── Encolar respuesta IA (texto o AUDIO — el bot transcribe las notas
            // de voz con Whisper en delay-reply) o verificar transferencia (imagen) ──
            if (((msgType === "text" && bodyText) || msgType === "audio") && phoneId && accessToken) {
              const msgSentAt = new Date(parseInt(msg.timestamp as string) * 1000).toISOString();
              await queueAiReply({
                branchId: branch_id as string,
                tenantId: tenant_id as string,
                convId,
                fromPhone,
                phoneId,
                accessToken,
                msgSentAt,
              });
            } else if (msgType === "image" && mediaUrl) {
              /* ⚠️ AQUI PACO SE QUEDABA MUDO (17-ago). Si llegaba una imagen y NO
                 habia pago pendiente, este bloque no hacia NADA: ni encolaba
                 respuesta ni pasaba a humano. Una clienta mando la foto de la
                 carta seNalando la salchipapa que queria y no le contesto nadie
                 — el peor silencio posible, porque ella ya habia dicho lo que
                 queria y creia estar pidiendo.
                 Ahora la imagen que no es comprobante entra a la cola como
                 cualquier mensaje, y es el cerebro (delay-reply) el que decide
                 que hacer. Aqui no se duplica esa decision. */
              const convDetail = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=pago_pendiente&limit=1`);
              const pagoPendiente = convDetail?.[0]?.pago_pendiente as boolean | undefined;
              if (!pagoPendiente && phoneId && accessToken) {
                const msgSentAt = new Date(parseInt(msg.timestamp as string) * 1000).toISOString();
                await queueAiReply({
                  branchId: branch_id as string, tenantId: tenant_id as string,
                  convId, fromPhone, phoneId, accessToken, msgSentAt,
                });
              }
              if (pagoPendiente) {
                const VERIFY_URL = `${SUPABASE_URL}/functions/v1/verify-transfer`;
                fetch(VERIFY_URL, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ conversation_id: convId }),
                }).catch((e) => console.error("verify-transfer launch error:", e));
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("meta-webhook error:", err);
  }

  return new Response("OK", { status: 200 });
});

/* ══ INSTAGRAM Y MESSENGER ═══════════════════════════════════════════════
   Un mensaje directo de Instagram o de Messenger. Recorre el mismo camino
   que uno de WhatsApp —conversacion, mensaje guardado, cola de Paco— para
   que todo lo que Paco ya sabe hacer sirva igual aqui. Lo que cambia es
   solo la puerta de entrada.                                              */
async function recibirMeta(canal: string, entries: Array<Record<string, unknown>>): Promise<void> {
  for (const entry of entries) {
    const cuentaId = String(entry.id || "");
    const msgs = (entry.messaging as Array<Record<string, unknown>>) || [];
    if (!msgs.length) continue;

    /* De que restaurante es esta cuenta. Para Instagram la cuenta puede
       identificarse por su propio id o por el de la pagina sobre la que va
       montada: Meta manda uno u otro segun el tipo de aviso, asi que se
       aceptan los dos en vez de apostar por uno. */
    const chRes = await sbGet(`/rest/v1/chat_channels?channel=eq.${canal}&connected=eq.true&select=id,tenant_id,branch_id,meta&limit=100`);
    const canalRow = (chRes || []).find((c) => {
      let m = c.meta as Record<string, unknown> | string || {};
      if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = {}; } }
      const mm = m as Record<string, unknown>;
      return String(mm.page_id || "") === cuentaId || String(mm.ig_id || "") === cuentaId;
    });
    if (!canalRow) { console.error(`[${canal}] llego un mensaje de la cuenta ${cuentaId} y ningun restaurante la tiene conectada`); continue; }

    let cMeta: Record<string, string> = {};
    const raw = canalRow.meta;
    if (typeof raw === "string") { try { cMeta = JSON.parse(raw); } catch { /* */ } }
    else if (raw && typeof raw === "object") { cMeta = raw as Record<string, string>; }
    const pageToken = String(cMeta.page_token || cMeta.access_token || "");
    const pageId    = String(cMeta.page_id || "");
    const { tenant_id, branch_id, id: channel_id } = canalRow;

    for (const m of msgs) {
      const mensaje = (m.message as Record<string, unknown>) || {};
      /* EL ECO ES NUESTRO PROPIO MENSAJE. Meta reenvia lo que la pagina
         acaba de mandar; sin este filtro Paco se leeria a si mismo y se
         contestaria en un bucle infinito. */
      if (mensaje.is_echo === true) continue;
      const de = String((m.sender as Record<string, unknown>)?.id || "");
      if (!de || de === pageId || de === String(cMeta.ig_id || "")) continue;

      const externalId = String(mensaje.mid || "");
      let texto = String(mensaje.text || "").trim();
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      /* Fotos, audios y demas vienen como adjuntos. Se guarda el enlace tal
         cual lo da Meta: aqui no se descarga nada. */
      const adjuntos = (mensaje.attachments as Array<Record<string, unknown>>) || [];
      if (!texto && adjuntos.length) {
        const a0 = adjuntos[0];
        const tipo = String(a0.type || "");
        const url = String(((a0.payload as Record<string, unknown>) || {}).url || "");
        if (url) { mediaUrl = url; mediaType = tipo === "image" ? "image" : tipo; }
        /* Una historia respondida o compartida llega como adjunto sin texto:
           decir "[image]" a secas dejaria al operador sin saber que paso. */
        texto = tipo === "image" ? "[imagen]"
              : tipo === "audio" ? "[audio]"
              : tipo === "video" ? "[video]"
              : tipo === "story_mention" ? "[te mencionó en una historia]"
              : tipo === "share" ? "[compartió una publicación]"
              : "[" + (tipo || "adjunto") + "]";
      }
      if (!texto && !mediaUrl) continue;

      /* El nombre de quien escribe. Meta no lo manda en el aviso: hay que
         preguntarlo. Si no se puede, se sigue con un nombre generico — no
         tener el nombre no puede costar el mensaje. */
      /* ══ EL NOMBRE Y LA FOTO DE QUIEN ESCRIBE ═══════════════════════════
         CADA RED PIDE CAMPOS DISTINTOS, y pedirle a una los de la otra hace
         fallar la consulta ENTERA — no ignora el campo raro, devuelve error y
         no llega nada. Probado contra Meta el 22-ago:

           Messenger  first_name,last_name,profile_pic
                      pedirle `username` -> "(#12) username field is
                      deprecated" y el nombre se perdia. Por eso a Sergio le
                      salio "Cliente de Messenger" escribiendo desde su
                      propio Facebook.
           Instagram  name,username,profile_pic
                      pedirle `first_name` -> "(#100) nonexisting field".

         La FOTO solo la dan estas dos redes; WhatsApp no la entrega nunca.
         Su enlace CADUCA (lleva fecha de expiracion), asi que se refresca en
         cada mensaje: guardarlo una vez y confiarse deja fotos rotas.        */
      const esIG = canal === "instagram";
      let nombre = esIG ? "Cliente de Instagram" : "Cliente de Messenger";
      let usuario = "";
      let fotoUrl = "";
      try {
        const campos = esIG ? "name,username,profile_pic" : "first_name,last_name,profile_pic";
        const pr = await fetch(`https://graph.facebook.com/v22.0/${de}?fields=${campos}&access_token=${encodeURIComponent(pageToken)}`);
        const pd = await pr.json().catch(() => ({})) as Record<string, unknown>;
        if (!pr.ok || pd.error) {
          console.error(`[${canal}] no se pudo leer el perfil de ${de}:`, JSON.stringify(pd).slice(0, 300));
        } else {
          fotoUrl = String(pd.profile_pic || "");
          if (esIG) {
            usuario = String(pd.username || "");
            nombre = String(pd.name || "") || (usuario ? "@" + usuario : nombre);
          } else {
            const nom = [pd.first_name, pd.last_name].map(x => String(x || "").trim()).filter(Boolean).join(" ");
            if (nom) nombre = nom;
          }
        }
      } catch (e) { console.error(`[${canal}] no se pudo leer el perfil:`, String(e).slice(0, 200)); }

      // ── Conversacion (una por persona y canal) ──
      const convRes = await sbGet(
        `/rest/v1/chat_conversations?branch_id=eq.${branch_id}&contact_handle=eq.${encodeURIComponent(de)}&channel=eq.${canal}&select=id,unread_count&limit=1`
      );
      let convId = "";
      let unread = 0;
      if (convRes?.length) {
        convId = String(convRes[0].id);
        unread = Number(convRes[0].unread_count) || 0;
      } else {
        const nueva = await sbPost(`/rest/v1/chat_conversations`, {
          tenant_id, branch_id, channel: canal, channel_id,
          contact_name: nombre, contact_handle: de,
          contact_avatar_url: fotoUrl || null,
          contact_avatar_tint: Math.floor(Math.random() * 8) + 1,
          status: "open", unread_count: 0,
          last_message: texto, last_message_at: new Date().toISOString(),
          last_sender: "contact", last_read: false,
        }, "return=representation");
        convId = String(nueva?.[0]?.id || "");
      }
      if (!convId) continue;

      // El mismo mensaje puede llegar dos veces: Meta reintenta.
      if (externalId) {
        const dup = await sbGet(`/rest/v1/chat_messages?external_id=eq.${encodeURIComponent(externalId)}&limit=1`);
        if (dup?.length) continue;
      }

      const cuando = m.timestamp ? new Date(Number(m.timestamp)).toISOString() : new Date().toISOString();
      await sbPost(`/rest/v1/chat_messages`, {
        conversation_id: convId, tenant_id,
        direction: "in", origen: "cliente", body: texto,
        media_url: mediaUrl, media_type: mediaType,
        delivery_status: "delivered", external_id: externalId || null,
        sent_at: cuando,
      });
      const patchConv: Record<string, unknown> = {
        last_message: texto, last_message_at: new Date().toISOString(),
        last_sender: "contact", last_read: false,
        unread_count: unread + 1, contact_name: nombre,
      };
      /* La foto se refresca en cada mensaje porque su enlace caduca. Si esta
         vez no se pudo leer el perfil, se deja la que hubiera: mejor una foto
         vieja que ninguna. */
      if (fotoUrl) patchConv.contact_avatar_url = fotoUrl;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, patchConv);

      /* A la cola de Paco, igual que WhatsApp. En `from_phone` va el id de la
         persona en esa red (no es un telefono: por eso el pedido pedira el
         numero mas adelante) y en las credenciales va la PAGINA, que es la
         que habla. Quien decide por donde contestar es el canal de la
         conversacion, no estas credenciales. */
      if (texto && !mediaUrl) {
        await queueAiReply({
          branchId: String(branch_id), tenantId: String(tenant_id), convId,
          fromPhone: de, phoneId: pageId, accessToken: pageToken,
          msgSentAt: cuando,
        });
      }
    }
  }
}

// ── Cola de respuesta IA ──────────────────────────────────────────────────────

const DELAY_REPLY_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/delay-reply`;

interface QueueOpts {
  branchId: string; tenantId: string; convId: string;
  fromPhone: string; phoneId: string; accessToken: string;
  msgSentAt: string;
}

async function queueAiReply(opts: QueueOpts): Promise<void> {
  const { branchId, tenantId, convId, fromPhone, phoneId, accessToken, msgSentAt } = opts;
  try {
    // Leer delay configurado (default 5 seg)
    const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&select=activo,delay_segundos&limit=1`);
    const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
    if (!cfg || !cfg.activo) return;
    const delaySec = Math.max(1, Math.min(30, Number(cfg.delay_segundos) || 5));
    const fireAt = new Date(Date.now() + delaySec * 1000).toISOString();

    // Upsert en la cola — si ya existe, solo actualiza fire_at (extiende el timer)
    const existRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
    const isNew = !existRes?.length;

    if (isNew) {
      // Eliminar filas ya procesadas (la restricción UNIQUE bloquea nuevas inserciones)
      await sbDelete(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.true`);
      await sbPost(`/rest/v1/chat_ai_queue`, {
        conversation_id: convId, branch_id: branchId, tenant_id: tenantId,
        from_phone: fromPhone, phone_id: phoneId, access_token: accessToken,
        batch_start: msgSentAt, fire_at: fireAt, processed: false,
      }, "return=minimal");
    } else {
      // Extender fire_at para incluir este nuevo mensaje en el batch
      await sbPatch(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false`, { fire_at: fireAt });
    }

    // Mostrar indicador de escritura en Cobra
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: true });

    // Lanzar delay-reply en segundo plano solo si es el primer mensaje del batch
    if (isNew) {
      fetch(DELAY_REPLY_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ convId }),
      }).catch((e) => console.error("delay-reply launch error:", e));
    }
  } catch (err) {
    console.error("queueAiReply error:", err);
  }
}

// ── Auto-respuesta con OpenAI ──────────────────────────────────────────────────

interface AiReplyOpts {
  branchId: string;
  tenantId: string;
  convId: string;
  fromPhone: string;
  userText: string;
  senderName: string;
  phoneId: string;
  accessToken: string;
}

async function tryAiReply(opts: AiReplyOpts): Promise<void> {
  const { branchId, tenantId, convId, fromPhone, userText, senderName, phoneId, accessToken } = opts;

  try {
    // 1. Leer config del bot para este branch
    const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&limit=1`);
    const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
    if (!cfg || !cfg.activo) return;   // bot apagado globalmente → no responder

    // 2. Últimos 10 mensajes de la conversación (contexto)
    const histRes = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${convId}&order=sent_at.desc&limit=10&select=direction,body`
    );
    const history = (histRes || []).reverse() as Array<{ direction: string; body: string }>;

    // 3. Cargar menu del restaurante, horarios y construir system prompt
    const menuText     = await buildMenuText(branchId);
    const horariosText = buildHorariosText(cfg.horarios as Record<string, unknown> | null | undefined);
    const systemPrompt = buildSystemPrompt(cfg, senderName, menuText, horariosText);

    // 4. Armar mensajes para OpenAI
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    for (const h of history.slice(0, -1)) {  // excluir el mensaje actual (ya está en userText)
      if (h.body) {
        messages.push({ role: h.direction === "in" ? "user" : "assistant", content: h.body });
      }
    }
    messages.push({ role: "user", content: userText });

    // 5. Llamar a OpenAI
    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 350,
        temperature: 0.7,
      }),
    });
    if (!oaiRes.ok) {
      console.error("OpenAI error:", await oaiRes.text());
      return;
    }
    const oaiData = await oaiRes.json() as Record<string, unknown>;
    const reply = (((oaiData.choices as Array<Record<string,unknown>>)?.[0]
      ?.message as Record<string,unknown>)?.content as string || "").trim();

    if (!reply) return;

    // 6. Enviar respuesta por WhatsApp
    const waRes2 = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: fromPhone,
        recipient_type: "individual",
        type: "text",
        text: { body: reply },
      }),
    });
    if (!waRes2.ok) { console.error("WhatsApp send error:", await waRes2.text()); return; }
    const waSent = await waRes2.json() as Record<string, unknown>;
    const sentId = ((waSent.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";

    // 7. Guardar mensaje saliente en DB
    await sbPost(`/rest/v1/chat_messages`, {
      conversation_id: convId,
      tenant_id: tenantId,
      direction: "out", origen: "bot",
      body: reply,
      delivery_status: "sent",
      external_id: sentId || null,
      sent_at: new Date().toISOString(),
    });

    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
      last_message: reply,
      last_message_at: new Date().toISOString(),
      last_sender: "agent",
      last_read: false,
    });

  } catch (err) {
    console.error("tryAiReply error:", err);
  }
}

// -- Menu del restaurante -------------------------------------------------

function fmtPrice(n: number): string {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

async function buildMenuText(branchId: string): Promise<string> {
  const rows = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=name,price,description,price_mode,presentations,category_id(name)` +
    `&order=sort_order`
  ) as Array<Record<string, unknown>> | null;

  if (!rows || !rows.length) return "";

  // Group by category
  const byCategory: Record<string, Array<Record<string, unknown>>> = {};
  for (const p of rows) {
    const cat = ((p.category_id as Record<string,string>)?.name) || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }

  const lines: string[] = ["CARTA DEL RESTAURANTE (productos disponibles con precios actuales):"];
  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`
[${cat.toUpperCase()}]`);
    for (const item of items) {
      const pres = (item.presentations as Array<{name:string;price:number}>) || [];
      const validPres = pres.filter(p => p.price > 0);
      let priceStr: string;
      if (validPres.length > 1) {
        priceStr = validPres.map(p => `${p.name} ${fmtPrice(p.price)}`).join(" / ");
      } else if (validPres.length === 1) {
        priceStr = fmtPrice(validPres[0].price);
      } else {
        priceStr = fmtPrice(Number(item.price) || 0);
      }
      let line = `- ${item.name}: ${priceStr}`;
      if (item.description) line += ` — ${item.description}`;
      lines.push(line);
    }
  }
  return lines.join("\n");
}

// ── Construcción del system prompt ────────────────────────────────────────────

function buildHorariosText(horarios: Record<string, unknown> | null | undefined): string {
  if (!horarios) return "";

  const DAYS: Array<[string, string]> = [
    ["lunes","Lunes"], ["martes","Martes"], ["miercoles","Miércoles"],
    ["jueves","Jueves"], ["viernes","Viernes"], ["sabado","Sábado"], ["domingo","Domingo"],
  ];

  // Hora actual en Colombia (UTC-5)
  const nowCol = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const todayIdx = nowCol.getUTCDay(); // 0=Dom,1=Lun,...,6=Sab
  const colDayKey = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][todayIdx];
  const colHHMM = nowCol.getUTCHours().toString().padStart(2,"0") + ":" +
                  nowCol.getUTCMinutes().toString().padStart(2,"0");

  const lines: string[] = ["HORARIOS DE ATENCIÓN:"];
  let estaAbiertoAhora = false;

  for (const [key, label] of DAYS) {
    const d = horarios[key] as Record<string,unknown> | undefined;
    if (!d || !d.activo) {
      lines.push(`- ${label}: Cerrado`);
    } else {
      const abre   = (d.abre   as string) || "00:00";
      const cierra = (d.cierra as string) || "23:59";
      lines.push(`- ${label}: ${abre} – ${cierra}`);
      if (key === colDayKey && colHHMM >= abre && colHHMM <= cierra) {
        estaAbiertoAhora = true;
      }
    }
  }

  lines.push("");
  if (estaAbiertoAhora) {
    lines.push(`ESTADO ACTUAL: El restaurante está ABIERTO ahora mismo (${colHHMM} hora Colombia).`);
  } else {
    const todayData = horarios[colDayKey] as Record<string,unknown> | undefined;
    if (!todayData || !todayData.activo) {
      lines.push(`ESTADO ACTUAL: El restaurante está CERRADO hoy (${DAYS[todayIdx][1]}). No atiende este día.`);
    } else {
      const abre   = (todayData.abre   as string) || "";
      const cierra = (todayData.cierra as string) || "";
      if (colHHMM < abre) {
        lines.push(`ESTADO ACTUAL: El restaurante aún no ha abierto hoy. Abre a las ${abre}.`);
      } else {
        lines.push(`ESTADO ACTUAL: El restaurante ya cerró por hoy. Cerró a las ${cierra}.`);
      }
    }
  }

  return lines.join("\n");
}

function buildSystemPrompt(cfg: Record<string, unknown>, senderName: string, menuText = "", horariosText = ""): string {
  const perfil  = (cfg.perfil  as Record<string,string>) || {};
  const vocab   = (cfg.vocabulario as Record<string,unknown>) || {};
  const faqs    = (cfg.faq as Array<Record<string,string>>) || [];
  const tono    = (cfg.tono as string) || "cercano";

  const tonoDesc: Record<string, string> = {
    cercano: "Usa un tono amigable y cercano, como si hablaras con un amigo. Puedes usar emojis con moderación.",
    neutral: "Responde de forma clara y directa. Sin emojis.",
    formal:  "Mantén un tono formal y profesional en todo momento. Evita los emojis.",
  };

  const botName = perfil.nombre || "Asistente";
  const lines: string[] = [
    `Eres ${botName}, el asistente virtual de este restaurante. El cliente se llama ${senderName}.`,
    "",
    `TONO: ${tonoDesc[tono] || tonoDesc.cercano}`,
    "",
  ];

  if (cfg.instrucciones) {
    lines.push("INSTRUCCIONES ESPECÍFICAS:");
    lines.push(cfg.instrucciones as string);
    lines.push("");
  }

  if (cfg.negocio) {
    lines.push("INFORMACIÓN DEL NEGOCIO (fuente de verdad — úsala para responder):");
    lines.push(cfg.negocio as string);
    lines.push("");
  }

  if (Array.isArray(vocab.usar) && (vocab.usar as string[]).length) {
    lines.push(`VOCABULARIO PREFERIDO: ${(vocab.usar as string[]).join(", ")}`);
  }
  if (vocab.evitar) {
    lines.push(`PALABRAS A EVITAR: ${vocab.evitar}`);
  }

  if (faqs.length) {
    lines.push("");
    lines.push("PREGUNTAS FRECUENTES (responde así cuando aplique):");
    faqs.forEach((f) => {
      lines.push(`P: ${f.pregunta}`);
      lines.push(`R: ${f.respuesta}`);
    });
  }

  if (horariosText) {
    lines.push("");
    lines.push(horariosText);
    lines.push("IMPORTANTE: Usa esta información para responder cualquier pregunta sobre horarios o si el restaurante está abierto.");
  }

  if (menuText) {
    lines.push("");
    lines.push(menuText);
    lines.push("IMPORTANTE: Los productos y precios anteriores son los únicos disponibles. No inventes productos ni precios que no estén en esa lista.");
  }

  lines.push("");
  lines.push("REGLAS:");
  lines.push("- Responde SOLO en español.");
  lines.push("- Sé conciso: máximo 3-4 oraciones por respuesta.");
  lines.push("- Si no sabes algo con certeza, di que lo verificarás.");
  lines.push("- No inventes precios, horarios ni disponibilidad de productos.");
  lines.push("- No menciones que eres una IA a menos que te lo pregunten directamente.");

  return lines.join("\n");
}

// ── Media: descarga de Meta, sube a Supabase Storage ─────────────────────────

async function downloadAndStoreMedia(
  mediaId: string,
  accessToken: string,
  externalId: string,
  mediaType: string
): Promise<string | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) { console.error("meta media info error", await metaRes.text()); return null; }
    const metaData = await metaRes.json() as Record<string, string>;
    const downloadUrl = metaData.url;
    const mimeType    = metaData.mime_type || "application/octet-stream";

    const fileRes = await fetch(downloadUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!fileRes.ok) { console.error("meta media download error", await fileRes.text()); return null; }
    const fileBytes = await fileRes.arrayBuffer();

    const ext = extFromMime(mimeType) || extFromType(mediaType);
    const storagePath = `${mediaType}/${externalId}.${ext}`;

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey":        SUPABASE_KEY,
          "Content-Type":  mimeType,
          "x-upsert":      "true",
        },
        body: fileBytes,
      }
    );
    if (!uploadRes.ok) { console.error("storage upload error", await uploadRes.text()); return null; }

    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
  } catch (err) {
    console.error("downloadAndStoreMedia error:", err);
    return null;
  }
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "video/mp4": "mp4", "video/3gpp": "3gp",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac",
    "application/pdf": "pdf", "application/zip": "zip",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return map[mime] || "";
}

function extFromType(type: string): string {
  const map: Record<string, string> = {
    sticker: "webp", image: "jpg", video: "mp4", audio: "ogg", document: "pdf",
  };
  return map[type] || "bin";
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function sbPost(
  path: string, data: Record<string, unknown>, prefer = "return=minimal"
): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", "Prefer": prefer,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) { console.error("sbPost error", path, await res.text()); return null; }
  if (prefer === "return=representation") return res.json();
  return null;
}

async function sbDelete(path: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "DELETE",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) console.error("sbDelete error", path, await res.text());
}

async function sbPatch(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error("sbPatch error", path, await res.text());
}
