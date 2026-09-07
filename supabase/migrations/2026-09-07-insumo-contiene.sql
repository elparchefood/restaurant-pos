/*  ══ DE QUE ESTA HECHO CADA INSUMO ═══════════════════════════════════════

    Sergio, 7-sep-2026:

      "Para que Paco sepa que ingredientes e insumos especificos trae un
       producto el debe mirar LA RECETA... porque por ejemplo puede que la
       salsa agridulce de arandanos en su preparacion traiga cebolla. Y si el
       cliente dice que no traiga nada de cebolla, ahi Paco puede detectar que
       si trae cebolla y puede informarlo."

    La receta llega hasta el INSUMO y ahi se para: sabe que el plato lleva
    "Salsa ajo casera", pero no de que esta hecha esa salsa. Ese es justo el
    sitio donde se esconde la cebolla — nadie escribe "salsa agridulce (que
    lleva cebolla)" en la carta.

    Se guarda como TEXTO LIBRE y a proposito (decision de Sergio): llenar
    "ajo, mayonesa, aceite" es rapido, y para contestar "¿esto lleva cebolla?"
    no hacen falta cantidades ni una tabla aparte. Si algun dia hace falta
    endurecerlo, se endurece con datos ya escritos.

    VACIO NO SIGNIFICA "NO LLEVA NADA": significa QUE NO SE SABE. Esa
    diferencia es la que hace que Paco pueda ser prudente — ante un insumo sin
    llenar no dira "tranquilo, no trae cebolla", dira que lo confirma. Decirle
    a alguien que un plato no lleva algo cuando si lo lleva puede ser una
    alergia, y eso no se arregla despues.                                    */

alter table iv_insumos
  add column if not exists contiene text;

comment on column iv_insumos.contiene is
  'De que esta hecho este insumo, en palabras del restaurante y separado por comas '
  '("ajo, mayonesa, aceite"). Lo llena el dueNo. Sirve para responder si un plato '
  'lleva o no cierto ingrediente cuando esta escondido dentro de otro. '
  'VACIO = no se sabe (no es lo mismo que "no lleva nada"): con un solo insumo '
  'vacio, el asistente NO afirma que un plato no contiene algo, lo pasa a una persona.';
