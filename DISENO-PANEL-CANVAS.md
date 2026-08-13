# Panel de configuración del canvas — diseño aprobado (13-ago-2026)

Aprobado por Sergio, **pendiente de implementar**. Se guarda aquí para no
perderlo mientras se arreglan cosas del flujo.

## El problema

El panel tiene 803 líneas y para la caja de Método de pago muestra **13
secciones seguidas**. Hay que hacer scroll para todo, y para saber algo tan
simple como si el pago se exige antes de crear el pedido hay que bajar hasta el
interruptor y mirarlo.

## La forma

Las secciones de las 21 cajas se agrupan solas en tres tipos:

| Tipo | Qué es | Ejemplo |
|---|---|---|
| Lo que dice | nombre, frase fija o IA | "¿Cómo vas a pagar?" |
| Lo que hace | lo propio de esa misión | cuentas, QR, comprobante |
| Cómo encaja | igual en todas las cajas | obligatoria, cuándo aplica, si falla |

Por eso el mismo esqueleto sirve para todas: no es un diseño para la caja de
pago, es uno solo que el dueño aprende una vez.

## Lo aprobado

**Una columna, grupos plegados, con el estado resumido en el título.**
Se descartaron las pestañas: lo que está en otra pestaña no existe hasta que la
abres — y ya pasó que Sergio no encontró una sección que sí estaba publicada.

```
  Nombre del paso        [Metodo de pago            ]
  ┌─────────────────────────────────────────────────┐
  │ Mensaje exacto                                  │
  │ ¿Cómo vas a pagar?   {{metodos_pago}}           │
  └─────────────────────────────────────────────────┘

  ▸ Cuentas y QR              1 cuenta · QR activo
  ▸ El comprobante            se exige · automática
  ▸ Si no llega               a los 30 min
  ▸ Cuándo aplica             siempre · obligatoria
```

### Reglas

1. **El nombre y la frase quedan siempre afuera, abiertos.** Es lo único que se
   edita seguido; el resto se configura una vez.
2. **El resumen a la derecha del título es lo que más rinde.** Responde cómo
   está configurado sin abrir nada.
3. **Un solo grupo abierto a la vez.** Al abrir uno se cierra el anterior, así
   el panel nunca vuelve a crecer.
4. **"Cuándo aplica" es el mismo grupo en las 21 cajas**, siempre de último y
   siempre igual.
5. **El nombre de la caja fijo arriba** al hacer scroll.
6. **Recordar el grupo que se dejó abierto** por tipo de caja.

### Lo que NO se hace

- Desplegables `<select>` para agrupar: esconden más que un plegado y no dejan
  ver el estado.
- Mezclar pestañas con plegados: dos formas de esconder cosas en la misma
  pantalla es más difícil de entender que cualquiera de las dos sola.
