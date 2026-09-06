# Lee la tarjeta EXACTAMENTE como lo hace un celular: abre la aplicacion
# NDEF, abre el fichero y lee. Ni mas ni menos. Si esto sale bien, un
# telefono tiene que poder leerla.
$src = @'
using System;
using System.Runtime.InteropServices;
public class REV {
  [DllImport("winscard.dll")] public static extern int SCardEstablishContext(uint s, IntPtr a, IntPtr b, out IntPtr c);
  [DllImport("winscard.dll", CharSet=CharSet.Ansi)] public static extern int SCardListReadersA(IntPtr c, byte[] g, byte[] r, ref int l);
  [DllImport("winscard.dll", CharSet=CharSet.Ansi)] public static extern int SCardConnectA(IntPtr c, string r, uint sh, uint pr, out IntPtr card, out uint act);
  [DllImport("winscard.dll")] public static extern int SCardTransmit(IntPtr card, ref IO io, byte[] sb, int sl, IntPtr rp, byte[] rb, ref int rl);
  [DllImport("winscard.dll")] public static extern int SCardDisconnect(IntPtr card, uint d);
  [StructLayout(LayoutKind.Sequential)] public struct IO { public uint proto; public int len; }
}
'@
Add-Type -TypeDefinition $src

$ctx = [IntPtr]::Zero
if ([REV]::SCardEstablishContext(2,[IntPtr]::Zero,[IntPtr]::Zero,[ref]$ctx) -ne 0) { 'SIN SERVICIO DE TARJETAS'; exit 1 }
$len = 0; [void][REV]::SCardListReadersA($ctx,$null,$null,[ref]$len)
if ($len -le 1) { 'NO HAY LECTOR CONECTADO'; exit 1 }
$b = New-Object byte[] $len
[void][REV]::SCardListReadersA($ctx,$null,$b,[ref]$len)
$lector = ([System.Text.Encoding]::ASCII.GetString($b)).Split([char]0) | Where-Object { $_ } | Select-Object -First 1
"Lector: $lector"

# El ayudante del ejecutable tiene el lector medio segundo si y medio no.
# Se reintenta unos segundos en vez de pelearselo.
$card = [IntPtr]::Zero; $act = 0; $rc = -1
for ($i = 0; $i -lt 40; $i++) {
  $rc = [REV]::SCardConnectA($ctx,$lector,2,3,[ref]$card,[ref]$act)
  if ($rc -eq 0) { break }
  Start-Sleep -Milliseconds 250
}
if ($rc -ne 0) { 'NO HAY TARJETA ENCIMA DEL LECTOR (o el ejecutable no la suelta)'; exit 2 }

$io = New-Object REV+IO; $io.proto = $act; $io.len = 8
function Env([byte[]]$cmd) {
  $resp = New-Object byte[] 300; $rl = 300
  $x = [REV]::SCardTransmit($card,[ref]$io,$cmd,$cmd.Length,[IntPtr]::Zero,$resp,[ref]$rl)
  if ($x -ne 0 -or $rl -lt 2) { return $null }
  # Sin @() la respuesta de un solo byte no llega como arreglo; con la coma
  # delante quedaba un arreglo DENTRO de otro y las cuentas fallaban.
  [PSCustomObject]@{ datos = [byte[]]@($resp[0..($rl-3)]); sw = ('{0:X2}{1:X2}' -f $resp[$rl-2],$resp[$rl-1]) }
}

$a = Env ([byte[]](0x00,0xA4,0x04,0x00,0x07,0xD2,0x76,0x00,0x00,0x85,0x01,0x01,0x00))
"1) abrir la aplicacion NDEF : $(if($a){$a.sw}else{'SIN RESPUESTA'})"
$f = Env ([byte[]](0x00,0xA4,0x00,0x0C,0x02,0xE1,0x04))
"2) abrir el fichero E104    : $(if($f){$f.sw}else{'SIN RESPUESTA'})"
$d = Env ([byte[]](0x00,0xB0,0x00,0x00,0x60))
"3) leer                     : $(if($d){$d.sw}else{'SIN RESPUESTA'})"
if (-not $d -or -not $d.datos) { [void][REV]::SCardDisconnect($card,0); 'NO SE PUDO LEER EL FICHERO'; exit 3 }

$by = $d.datos
"`n--- LOS BYTES ---"
($by | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
$nlen = ($by[0] -shl 8) -bor $by[1]
"`nNLEN declarado : $nlen"
"cabecera NDEF  : $('{0:X2} {1:X2} {2:X2} {3:X2}' -f $by[2],$by[3],$by[4],$by[5])  (debe ser D1 01 xx 55)"
"prefijo        : $('{0:X2}' -f $by[6])  (04 = https://)"
$largoUrl = $by[4] - 1
$dir = 'https://' + [System.Text.Encoding]::ASCII.GetString($by[7..(7+$largoUrl-1)])
"`nDIRECCION QUE VE EL CELULAR:"
"  $dir"
$t = [System.Text.Encoding]::ASCII.GetString($by)
$u = ([regex]::Match($t,'u=([0-9A-Fa-f]{14})')).Groups[1].Value
$c = ([regex]::Match($t,'c=([0-9A-Fa-f]{6})')).Groups[1].Value
$m = ([regex]::Match($t,'m=([0-9A-Fa-f]{16})')).Groups[1].Value
"`nnumero   u = $u"
"contador c = $c  ->  $([Convert]::ToInt32($c,16)) en decimal"
"firma    m = $m"
if ($u -eq '00000000000000') { "`n*** EL CHIP NO ESTA RELLENANDO LOS HUECOS: el codigo rotativo se apago ***" }
[void][REV]::SCardDisconnect($card,0)
