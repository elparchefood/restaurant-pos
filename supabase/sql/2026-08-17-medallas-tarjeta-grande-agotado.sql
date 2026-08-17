/* ── MEDALLAS, TARJETA GRANDE Y AGOTADO (17-ago-2026) ────────────────────
   Aprobado con Sergio: medallas en mas productos, la tarjeta doble (G) y el
   agotado a la vista (H). */

/* AGOTADO NO ES LO MISMO QUE NO VENDERLO. `available=false` esconde el
   producto de la carta y asi debe seguir: es lo que se usa cuando algo se
   descontinua. `agotado` es "hoy no hay": el producto SIGUE en la carta, en
   gris, para que el cliente sepa que existe y vuelva por el.
   Manana el inventario encendera este campo solo; hoy se marca a mano. */
alter table pos_products add column if not exists agotado boolean default false;
comment on column pos_products.agotado is
  'Hoy no hay. Se muestra en la carta del cliente en gris y no se puede pedir. Distinto de available=false, que lo esconde del todo.';

/* La tarjeta ancha de la carta del cliente: un plato por categoria que ocupa
   toda la fila y rompe la cuadricula. */
alter table pos_products add column if not exists carta_grande boolean default false;
comment on column pos_products.carta_grande is
  'Se muestra como tarjeta ancha en la carta del cliente. Pensada para UNO por categoria: si se marcan varios pierde el efecto de romper la cuadricula.';

/* "Ahorras $6.000" necesita el monto. Va en su propia columna y no pegado al
   nombre de la medalla ('ahorras:6000'): un numero se compara, se suma y se
   valida; un texto con dos puntos hay que partirlo cada vez que se lee. */
alter table pos_products add column if not exists medalla_valor integer;
comment on column pos_products.medalla_valor is
  'El monto de la medalla "ahorras". Se ignora en las demas medallas.';
