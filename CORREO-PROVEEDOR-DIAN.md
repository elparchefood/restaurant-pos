# Correo para el proveedor de facturación electrónica

**Para:** Alanube (comercial / soporte técnico)
**Copia sugerida:** Factus, con el mismo texto, para comparar precios.

> **Cómo usarlo:** copia de la línea de "Asunto" hacia abajo y mándalo tal cual.
> Está escrito para que la respuesta sirva de una — cada pregunta define algo
> que hay que construir distinto según lo que contesten.
>
> **Lo que NO hay que hacer:** firmar nada ni entregar certificados digitales
> antes de tener las 5 respuestas por escrito.

---

**Asunto:** Integración API para software POS multi-restaurante — preguntas previas

Buen día,

Soy Sergio Abadía, de **Cobra POS**, un sistema de punto de venta para
restaurantes que estamos por lanzar en Colombia. Vamos a integrar facturación
electrónica DIAN y estamos evaluando su plataforma.

El caso de uso es este: **Cobra es el software; quienes facturan son los
restaurantes que lo usan**, cada uno con su propio NIT, su resolución y su
certificado. Esperamos empezar con unos pocos y crecer desde ahí.

Antes de escribir la integración necesitamos confirmar cinco puntos:

**1. Multi-empresa.** ¿Una sola cuenta nuestra puede emitir a nombre de varios
restaurantes, cada uno con su NIT y su resolución? ¿O cada restaurante necesita
su propia cuenta con ustedes? Si es lo segundo, ¿cómo funciona el alta de cada
uno y quién la gestiona?

**2. Precio real.** ¿Cuál es el costo por documento emitido y hay algún costo
fijo mensual, por empresa o por nuestra parte? Nos sirve el escalonado por
volumen si lo manejan.

**3. El certificado digital.** ¿Lo sube el restaurante directamente en el portal
de ustedes, o tiene que pasar por nosotros? **Preferimos que no pase por
nosotros:** es material sensible y no queremos custodiarlo.

**4. Tiempo de habilitación.** ¿Cuánto toma, de punta a punta, dejar habilitado
para facturar a un restaurante nuevo que ya tiene su resolución de la DIAN?
¿Qué parte depende de ustedes y qué parte del cliente?

**5. Si la DIAN se cae.** ¿Su plataforma encola y reintenta automáticamente
hasta que la DIAN responda, o esa lógica de reintento nos toca implementarla a
nosotros? ¿Qué nos devuelven mientras tanto?

Dos cosas más, si es posible:

- **Acceso al ambiente de pruebas (sandbox)** para empezar a construir mientras
  cerramos lo comercial.
- **La documentación técnica** de emisión y de notas de crédito.

Quedo atento. Gracias,

**Sergio Abadía**
Cobra POS

---

## Cómo cambia lo que construyo, según respondan

| Respuesta | Qué implica |
|---|---|
| **1** — una cuenta para todos | El alta de un restaurante es una pantalla en Cobra. Es lo que esperamos. |
| **1** — cuenta por restaurante | Hay que construir un asistente que lo guíe a abrir la suya. Más trabajo de onboarding. |
| **2** — hay costo fijo mensual | Cambia el precio de los planes de Cobra: hay que cubrirlo. |
| **3** — el certificado pasa por Cobra | Toca custodiar material sensible: cifrado, permisos y responsabilidad legal. **Se evita si se puede.** |
| **5** — reintentan ellos | Nos ahorra toda la cola de reintento. |
| **5** — reintentamos nosotros | Hay que construir cola, idempotencia y recibo provisional. Ya está en el plan por si acaso. |
