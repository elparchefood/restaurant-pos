# Los 6 textos para el formulario de Meta

**Van en inglés.** No porque Meta lo exija —acepta español— sino porque quien
revisa trabaja en inglés y ya nos rechazaron una vez por una desconexión entre
lo que dijimos y lo que se veía. Cuanto menos haya que traducir, menos margen
de malentendido.

Debajo de cada texto está en español lo que dice, para que sepas qué estás
pegando.

**Regla al llenar el formulario:** a cada permiso se le adjunta **SU** video, no
el mismo para todos. Ese fue el motivo exacto del rechazo del 11-jul-2026.

| Permiso | Video que se adjunta |
|---|---|
| `instagram_basic` | 01 |
| `pages_show_list` | 01 |
| `pages_manage_metadata` | 01 |
| `pages_messaging` | 02 |
| `instagram_manage_messages` | 02 |
| `pages_read_engagement` | 01 |

---

## 1. `instagram_basic` → video 01

```
Cobra POS is a restaurant management platform. Restaurant owners connect their
own Instagram professional account so they can read and answer customer
messages from the same inbox where they manage their orders.

We use instagram_basic to identify the Instagram professional account linked to
the Facebook Page the owner selects, and to display its username and profile in
our Connections screen, so the owner can confirm that the correct account is
connected.

In the screencast: the owner opens Chat IA > Connections > Instagram, logs in
with Facebook, selects a Page, and the connected Instagram account is then
displayed with its @username.
```

*En español:* Cobra es una plataforma para restaurantes. El dueño conecta su
cuenta de Instagram para atender a sus clientes desde la misma bandeja donde
maneja sus pedidos. Este permiso sirve para identificar esa cuenta y mostrarle
cuál quedó conectada.

---

## 2. `instagram_manage_messages` → video 02

```
Restaurant customers send inquiries through Instagram direct messages: menu
questions, delivery requests, and order status. We use
instagram_manage_messages to receive those messages through the webhook and to
send the owner's replies back to the customer, so they can be answered from the
same inbox the restaurant uses for its other channels.

The screencast shows the complete round trip: a customer sends a direct message
from Instagram; it appears unread in the Cobra POS inbox; the owner replies from
Cobra POS; and the reply is shown arriving in the customer's Instagram.
```

*En español:* Los clientes escriben por mensaje directo de Instagram. Este
permiso es para recibir esos mensajes y mandar tu respuesta. El video muestra el
viaje completo, de ida y de vuelta.

---

## 3. `pages_show_list` → video 01

```
A restaurant owner may administer several Facebook Pages. We use
pages_show_list to retrieve the list of Pages that person administers and
present it, so they can choose which Page belongs to their restaurant.

Without it we would have to assume one: our earlier implementation defaulted to
the first Page returned, which connected the wrong account for owners who manage
more than one.

The screencast shows the list of Pages appearing right after login, and the
owner selecting the restaurant's Page — for the Instagram connection and again
for the Facebook connection.
```

*En español:* Tú administras varias páginas. Este permiso es para mostrarte la
lista y que elijas cuál es la del restaurante. Antes el sistema agarraba la
primera y conectaba la equivocada — eso es cierto y por eso está escrito.

---

## 4. `pages_manage_metadata` → video 01

```
We use pages_manage_metadata to subscribe the selected Page to our app's
messages webhook at the moment the owner connects it
(POST /{page-id}/subscribed_apps with subscribed_fields=messages,
messaging_postbacks).

Without this subscription the app would never receive the customer messages that
pages_messaging and instagram_manage_messages allow it to answer.

Please note: this call is made server-side and produces no visible interface, so
it cannot be demonstrated on screen. It happens automatically at the end of the
connection flow shown in the screencast.
```

*En español:* Este es el que suscribe tu página a los avisos de Meta — sin él no
llega ni un mensaje. **Pasa en el servidor, no se ve en pantalla**, y el texto
lo dice explícitamente para que el reviewer no lo busque en el video y no lo
encuentre.

---

## 5. `pages_messaging` → video 02

```
Restaurant customers also write to the business through Messenger. We use
pages_messaging to receive those messages through the webhook and to send the
owner's replies, so Messenger conversations are handled in the same inbox as the
restaurant's other channels.

The screencast shows the complete round trip: a customer sends a message from
Facebook; it arrives in the Cobra POS inbox; and the owner replies from
Cobra POS.
```

*En español:* Lo mismo que el de Instagram, pero para Messenger.

---

## 6. `pages_read_engagement` → video 01

```
We use pages_read_engagement to read the basic information of the Pages the
owner administers during the connection flow: the Page name shown in our
selection list, and the Instagram professional account linked to each Page
(GET /me/accounts?fields=id,name,instagram_business_account).

This is what allows us to tell the owner, before they choose, which of their
Pages have an Instagram account available and which do not.

We do not read posts, insights, or comments.
```

*En español:* Sirve para leer el nombre de cada página y saber cuál tiene
Instagram vinculado — que es lo que te avisa antes de elegir. La última frase
aclara que no leemos publicaciones ni estadísticas: acotar lo que NO se hace
ayuda a que aprueben.

---

## Dos cosas más al llenar el formulario

**El caso de uso general** (si el formulario lo pide aparte) describe lo que se
ve en los videos y nada más:

```
Cobra POS is a management platform for restaurants. It brings the orders, the
inventory, the cash register and the customer conversations of a restaurant into
one place. Owners connect their own WhatsApp, Instagram and Facebook business
accounts so that all customer messages arrive in a single inbox, where staff can
read and reply to them next to the order they belong to.
```

⚠️ **No prometer lo que el video no muestra.** No mencionar menciones en
historias, publicación de contenido, campañas ni estadísticas: esas funciones se
piden en una ampliación futura, con su propio video. Prometer de más es
exactamente lo que nos costó el rechazo de julio.
