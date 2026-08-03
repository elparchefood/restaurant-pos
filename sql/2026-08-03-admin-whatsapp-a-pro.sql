-- Administrar por WhatsApp pasa de Premium a Pro.
--
-- Un plan se separa por tamaño o por costo real, no por comodidad. Esta función
-- la necesita MÁS el dueño de un solo local —el que está en la cocina con el
-- celular— que la cadena que tiene a alguien frente a un computador. Y no le
-- cuesta nada a Cobra: los mensajes al gerente los factura Meta a la cuenta del
-- propio restaurante, y las llamadas de IA van por el mismo camino barato de
-- siempre. Cobrarla en el plan de arriba era cobrársela justo a quien menos la
-- necesita.
--
-- A Premium le quedan los candados honestos, los que sí dependen del tamaño:
-- consolidado entre sucursales, kardex valorado, marcas y usuarios sin tope,
-- NFC y marketing.
update pos_planes
   set funciones = array_append(funciones, 'admin_whatsapp'),
       admin_whatsapp = true
 where plan = 'pro'
   and not ('admin_whatsapp' = any(funciones));
