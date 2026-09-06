# Programar las tarjetas NFC de El Parche

> Escrito el 5-sep-2026, después de programar la primera de verdad.
> Aquí está TODO el proceso: si alguien —o yo mismo— vuelve a esto en seis
> meses, con este archivo y el programa de al lado basta.

## Lo corto: cómo se programa una tarjeta

1. Se apoya la tarjeta en el lector (queda pegada, no se agita: lee a 1–3 cm).
2. Se corre:

```powershell
.\programar-tarjeta.ps1 -ArchivoClave C:\ruta\a\la\clave.txt
```

3. Termina diciendo **TARJETA LISTA** y el número de esa tarjeta.
4. Se cambia la tarjeta y se repite. Nada más.

Si algo falla, el programa **para y lo dice**; no deja una tarjeta a medias sin
avisar. Si se corre dos veces sobre la misma tarjeta, se da cuenta y no
intenta cambiarle la clave otra vez.

## La clave — lo único que no se puede perder

La clave AES-128 del restaurante vive en el **Vault de Supabase**, con el
nombre `nfc_clave_<tenant_id>`. Para El Parche:
`nfc_clave_0c78c799-bebb-4fe7-9bf6-c10062eaea7e`.

**No está en este repositorio, que es público, y no debe estarlo nunca.**

Para programar tarjetas se saca del Vault una vez, se deja en un archivo de
texto **fuera del repo**, y se le pasa al programa con `-ArchivoClave`.

> ⚠️ Si esa clave se pierde, las tarjetas ya programadas **no se recuperan**:
> no se pueden reprogramar ni validar. Se tiran. Es el único paso sin vuelta
> atrás de todo esto.

## Lo largo: qué le hace el programa a la tarjeta

### 1. Le escribe la dirección con tres huecos

```
https://cobrapos.app/elparchefood/?u=00000000000000&c=000000&m=0000000000000000
```

Los ceros son huecos que **el chip rellena solo** en cada toque:

| Hueco | Qué pone | Tamaño |
|---|---|---|
| `u=` | el número de la tarjeta | 14 caracteres |
| `c=` | cuántas veces se ha usado | 6 caracteres |
| `m=` | la firma de ese toque | 16 caracteres |

Se escribe **en claro**: ese fichero es de lectura libre, así lo trae de
fábrica y así tiene que ser para que un celular lo lea sin permisos.

Los offsets se cuentan **desde el primer byte del fichero**, contando los dos
bytes de longitud que van delante del mensaje NDEF. Es fácil equivocarse ahí.

### 2. Le enciende el código rotativo (SUN/SDM)

Con `ChangeFileSettings` sobre el fichero 02, y **cifrado** — los permisos del
fichero traen «Change = clave 0», y esa clave exige canal seguro. En claro
contesta `917E`.

La configuración que funciona:

| Campo | Valor | Qué dice |
|---|---|---|
| `FileOption` | `40` | código rotativo encendido |
| `AccessRights` | `E0 EE` | los mismos que traía |
| `SDMOptions` | `C1` | pone número + contador, en texto legible |
| `SDMAccessRights` | `FF E1` | ver la trampa de abajo |
| offsets | 4 × 3 bytes | número, contador, inicio de lo firmado, firma |

> ⚠️ **`SDMAccessRights` va `FF E1`, no `E1 FF`.** Al revés, la tarjeta
> entiende que la firma no se usa, no espera los dos últimos offsets y
> contesta `917E` (longitud incorrecta) — que no dice nada de lo que pasa de
> verdad. Me costó dos intentos.
>
> Leídos de izquierda a derecha: `F` reservado · `F` no devuelve el contador ·
> `E` número y contador a la vista · `1` la firma se hace con la clave 1.

### 3. Le cambia la clave que firma

`ChangeKey` sobre la clave 1, estando autenticado con la clave 0.

Como se cambia una clave **distinta** de la que abrió la sesión, van: el XOR
de la nueva con la vieja, la versión, y el CRC de la nueva.

> ⚠️ El CRC que pide NXP es el **CRC32 de siempre pero sin la vuelta final**.
> Con el CRC32 normal, la tarjeta rechaza el cambio.

**La clave 0 (la maestra) se deja como viene de fábrica a propósito.** Solo se
cambia la que firma, que es la que da la seguridad. Por eso, para saber si una
tarjeta ya está programada hay que preguntarle a la **clave 1**: la 0 abre con
la de fábrica aunque la tarjeta ya esté lista.

### 4. La lee y comprueba la firma

Se lee la tarjeta como lo haría un celular, se calcula la firma por nuestra
cuenta y se compara con la que trae. Si no cuadran, el programa avisa de que
**esa tarjeta no se entregue**.

## Cómo se valida una tarjeta (lo que hace el servidor)

Cuando alguien acerca la tarjeta, llega el número, el contador y la firma. Se
comprueba así:

1. Se deriva la clave de ese toque:
   `CMAC(clave_del_restaurante, 3C C3 00 01 00 80 || número || contador_al_revés)`
   — el contador va con los bytes en orden inverso.
2. Se calcula la firma:
   `CMAC(clave_del_toque, "<número>&c=<contador>&m=")`
   y de los 16 bytes que salen se toman **los impares** (8 bytes).
3. Tiene que coincidir con lo que trae la tarjeta.
4. Y el contador tiene que ser **mayor que el último visto** para esa tarjeta.

El punto 4 es el que impide que alguien repita un código que vio antes. Sin
él, la firma sola no basta.

## Cómo se comprobó que todo esto funciona

Con la primera tarjeta, leída tres veces seguidas:

```
Toque 1 : ...?u=04218D7A421890&c=000001&m=C771498FA27B41BF
Toque 2 : ...?u=04218D7A421890&c=000002&m=C0CAD93DB2A6A5C0
Toque 3 : ...?u=04218D7A421890&c=000003&m=4A75305B6600B39A
```

El número no cambia — identifica la tarjeta. El contador sube solo. La firma
cambia entera.

Y después de ponerle la clave del restaurante, la misma comprobación:

```
firma que trae      : 1B0FE657FFD41BEC
con la de fábrica   : 700E93951862DE5C   ← ya no cuadra
con la de El Parche : 1B0FE657FFD41BEC   ← cuadra
```

## Antes de mandar a imprimir las 100

Está en `PLAN-TARJETAS-NFC.md`: la tarjeta es una llave que mueve plata, y se
imprime la advertencia de que es única e intransferible.
