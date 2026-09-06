# ══════════════════════════════════════════════════════════════════════════
#  PROGRAMAR UNA TARJETA NTAG424 DNA DE EL PARCHE
# ══════════════════════════════════════════════════════════════════════════
#
#  Deja la tarjeta lista para entregarle a un cliente:
#    1. le escribe la direccion de El Parche con tres huecos,
#    2. enciende el codigo rotativo (SUN/SDM) para que los rellene sola,
#    3. le cambia la clave de fabrica por la del restaurante,
#    4. y comprueba, leyendola, que quedo bien.
#
#  COMO SE USA
#     .\programar-tarjeta.ps1 -ArchivoClave C:\ruta\clave.txt
#
#  Se apoya una tarjeta en el lector y se corre. Para la siguiente: se cambia
#  la tarjeta y se vuelve a correr. Nada mas.
#
#  ⚠️ LA CLAVE
#  Vive en el Vault de Supabase con el nombre `nfc_clave_<tenant>`, y NO en
#  este repositorio, que es publico. Se saca de ahi una vez, se deja en un
#  archivo de texto fuera del repo, y se le pasa a este programa.
#
#  Si esa clave se pierde, las tarjetas ya programadas NO se recuperan: no se
#  pueden reprogramar ni validar. Se tiran.
#
#  ⚠️ NO HAY VUELTA ATRAS con el paso 3. Antes de eso, la tarjeta se puede
#  reprogramar cuantas veces se quiera.
# ══════════════════════════════════════════════════════════════════════════

param(
  [Parameter(Mandatory=$true)][string]$ArchivoClave,
  [string]$Direccion = 'cobrapos.app/elparchefood/'
)

$ErrorActionPreference = 'Stop'

$src = @'
using System;
using System.Runtime.InteropServices;
public class TARJ {
  [DllImport("winscard.dll")] public static extern int SCardEstablishContext(uint s, IntPtr a, IntPtr b, out IntPtr c);
  [DllImport("winscard.dll", CharSet=CharSet.Ansi)] public static extern int SCardListReadersA(IntPtr c, byte[] g, byte[] r, ref int l);
  [DllImport("winscard.dll", CharSet=CharSet.Ansi)] public static extern int SCardConnectA(IntPtr c, string r, uint sh, uint pr, out IntPtr card, out uint act);
  [DllImport("winscard.dll")] public static extern int SCardTransmit(IntPtr card, ref IO io, byte[] sb, int sl, IntPtr rp, byte[] rb, ref int rl);
  [DllImport("winscard.dll")] public static extern int SCardDisconnect(IntPtr card, uint d);
  [StructLayout(LayoutKind.Sequential)] public struct IO { public uint proto; public int len; }
}
'@
Add-Type -TypeDefinition $src

# ── utilidades de cifrado ────────────────────────────────────────────────
function AesEnc([byte[]]$k,[byte[]]$iv,[byte[]]$d){
  $a=[System.Security.Cryptography.Aes]::Create(); $a.Mode='CBC'; $a.Padding='None'
  $a.KeySize=128; $a.Key=$k; $a.IV=$iv
  $o=$a.CreateEncryptor().TransformFinalBlock($d,0,$d.Length); $a.Dispose(); return $o }
function AesDec([byte[]]$k,[byte[]]$iv,[byte[]]$d){
  $a=[System.Security.Cryptography.Aes]::Create(); $a.Mode='CBC'; $a.Padding='None'
  $a.KeySize=128; $a.Key=$k; $a.IV=$iv
  $o=$a.CreateDecryptor().TransformFinalBlock($d,0,$d.Length); $a.Dispose(); return $o }
function Shl1([byte[]]$b){ $o=New-Object byte[] $b.Length; $c=0
  for($i=$b.Length-1;$i -ge 0;$i--){ $o[$i]=(($b[$i] -shl 1) -band 0xFF) -bor $c; $c=($b[$i] -shr 7) -band 1 }
  return ,$o }
function Cmac([byte[]]$key,[byte[]]$msg){
  $z=New-Object byte[] 16; $L=AesEnc $key $z $z
  $K1=Shl1 $L; if(($L[0] -band 0x80) -ne 0){ $K1[15]=$K1[15] -bxor 0x87 }
  $K2=Shl1 $K1; if(($K1[0] -band 0x80) -ne 0){ $K2[15]=$K2[15] -bxor 0x87 }
  $n=[Math]::Ceiling($msg.Length/16.0); if($n -eq 0){$n=1}
  $comp=($msg.Length -gt 0) -and ($msg.Length % 16 -eq 0)
  $b=New-Object byte[] ($n*16); [Array]::Copy($msg,$b,$msg.Length)
  if(-not $comp){ $b[$msg.Length]=0x80 }
  $ini=($n-1)*16; $k=if($comp){$K1}else{$K2}
  for($i=0;$i -lt 16;$i++){ $b[$ini+$i]=$b[$ini+$i] -bxor $k[$i] }
  $o=AesEnc $key $z $b; return ,$o[($o.Length-16)..($o.Length-1)] }
function Impares([byte[]]$m){ $o=New-Object byte[] 8; for($i=0;$i -lt 8;$i++){ $o[$i]=$m[$i*2+1] }; return ,$o }
function Pad([byte[]]$d){ $n=[Math]::Ceiling(($d.Length+1)/16.0)*16
  $o=New-Object byte[] $n; [Array]::Copy($d,$o,$d.Length); $o[$d.Length]=0x80; return ,$o }
function DeHex($s){ $o=New-Object byte[] ($s.Length/2)
  for($i=0;$i -lt $o.Length;$i++){ $o[$i]=[Convert]::ToByte($s.Substring($i*2,2),16) }; return ,$o }
function Hex($x){ ($x | ForEach-Object { '{0:X2}' -f $_ }) -join '' }
# El CRC que pide NXP para cambiar una clave: el CRC32 de siempre pero SIN la
# vuelta final. Con el normal, la tarjeta rechaza el cambio.
function Crc32Nxp([byte[]]$d){
  $crc=[uint32]::MaxValue
  foreach($b in $d){ $crc=$crc -bxor $b
    for($i=0;$i -lt 8;$i++){ if(($crc -band 1) -ne 0){ $crc=(($crc -shr 1) -bxor 0xEDB88320) } else { $crc=$crc -shr 1 } } }
  return ,[byte[]]@(($crc -band 0xFF),(($crc -shr 8) -band 0xFF),(($crc -shr 16) -band 0xFF),(($crc -shr 24) -band 0xFF)) }

$claveParche = DeHex ((Get-Content $ArchivoClave -Raw).Trim())
if ($claveParche.Length -ne 16) { throw 'La clave debe ser de 16 bytes (32 caracteres hex).' }
$claveFabrica = New-Object byte[] 16

# ── el lector ────────────────────────────────────────────────────────────
$ctx=[IntPtr]::Zero
[void][TARJ]::SCardEstablishContext(2,[IntPtr]::Zero,[IntPtr]::Zero,[ref]$ctx)
$len=0; [void][TARJ]::SCardListReadersA($ctx,$null,$null,[ref]$len)
$bb=New-Object byte[] $len; [void][TARJ]::SCardListReadersA($ctx,$null,$bb,[ref]$len)
$lector=([System.Text.Encoding]::ASCII.GetString($bb)).Split([char]0)|Where-Object{$_}|Select-Object -First 1
if (-not $lector) { throw 'No hay ningun lector conectado.' }
$card=[IntPtr]::Zero; $act=0
$rc=[TARJ]::SCardConnectA($ctx,$lector,2,3,[ref]$card,[ref]$act)
if($rc -ne 0){ throw 'No hay tarjeta en el lector. Apoyala encima y vuelve a correr esto.' }
$io=New-Object TARJ+IO; $io.proto=$act; $io.len=8
function Env([byte[]]$cmd){
  $r=New-Object byte[] 300; $rl=300
  $x=[TARJ]::SCardTransmit($card,[ref]$io,$cmd,$cmd.Length,[IntPtr]::Zero,$r,[ref]$rl)
  if($x -ne 0){ return @{ sw='----'; datos=@() } }
  $sw='{0:X2}{1:X2}' -f $r[$rl-2],$r[$rl-1]
  $d=if($rl -gt 2){ ,$r[0..($rl-3)] }else{ ,@() }
  return @{ sw=$sw; datos=$d } }

Write-Host "Lector: $lector"
[void](Env ([byte[]](0x00,0xA4,0x04,0x00,0x07,0xD2,0x76,0x00,0x00,0x85,0x01,0x01,0x00)))

# ── lo que se le escribe ─────────────────────────────────────────────────
# Los ceros son huecos: el chip los rellena SOLO en cada toque con el numero
# de la tarjeta, el contador de usos y la firma.
$url = "$Direccion`?u=00000000000000&c=000000&m=0000000000000000"
$payload = @(0x04) + [System.Text.Encoding]::ASCII.GetBytes($url)   # 04 = https://
$ndef = @(0xD1,0x01,$payload.Length,0x55) + $payload
$fichero = @(0x00, $ndef.Length) + $ndef
$txt = [System.Text.Encoding]::ASCII.GetString([byte[]]$fichero)
# Los offsets se cuentan desde el PRIMER byte del fichero, contando los dos
# bytes de longitud que van delante del mensaje.
$offUid = $txt.IndexOf('u=') + 2
$offCtr = $txt.IndexOf('c=') + 2
$offMac = $txt.IndexOf('m=') + 2

# ── autenticar ───────────────────────────────────────────────────────────
function Autenticar([byte[]]$clave, [byte]$keyNo = 0) {
  $iv0 = New-Object byte[] 16
  $a1 = Env ([byte[]](0x90,0x71,0x00,0x00,0x02,$keyNo,0x00,0x00))
  if($a1.sw -ne '91AF'){ return $null }
  $rndB = AesDec $clave $iv0 $a1.datos
  $rndBr = New-Object byte[] 16; [Array]::Copy($rndB,1,$rndBr,0,15); $rndBr[15]=$rndB[0]
  $rndA = New-Object byte[] 16
  ([System.Security.Cryptography.RandomNumberGenerator]::Create()).GetBytes($rndA)
  $j = New-Object byte[] 32; [Array]::Copy($rndA,0,$j,0,16); [Array]::Copy($rndBr,0,$j,16,16)
  $a2 = Env ([byte[]](0x90,0xAF,0x00,0x00,0x20)+(AesEnc $clave $iv0 $j)+[byte[]](0x00))
  if($a2.sw -ne '9100'){ return $null }
  $claro = AesDec $clave $iv0 $a2.datos
  $xor = New-Object byte[] 6
  for($i=0;$i -lt 6;$i++){ $xor[$i]=$rndA[2+$i] -bxor $rndB[$i] }
  $sv1=@(0xA5,0x5A,0x00,0x01,0x00,0x80)+$rndA[0..1]+$xor+$rndB[6..15]+$rndA[8..15]
  $sv2=@(0x5A,0xA5,0x00,0x01,0x00,0x80)+$rndA[0..1]+$xor+$rndB[6..15]+$rndA[8..15]
  return @{ TI=$claro[0..3]; KENC=(Cmac $clave ([byte[]]$sv1)); KMAC=(Cmac $clave ([byte[]]$sv2)) }
}

# ¿Esta tarjeta ya se programo? Se le pregunta a la clave 1, que es LA QUE
# FIRMA y la unica que se cambia. Mirar la clave 0 no sirve: esa se deja como
# viene, asi que abre con la de fabrica aunque la tarjeta ya este lista — y
# entonces se intentaba cambiar una clave que ya estaba puesta (error 911E).
$yaTenia = [bool](Autenticar $claveParche 1)
if ($yaTenia) { Write-Host 'Esta tarjeta YA tenia la clave de El Parche: se reescribe lo demas.' }

# Y ahora la sesion de trabajo, con la clave maestra (la 0).
$ses = Autenticar $claveFabrica 0
if (-not $ses) { throw 'La tarjeta no abre con la clave maestra de fabrica. No se puede programar.' }
$ctr = 0
function IVcmd { AesEnc $ses.KENC (New-Object byte[] 16) ([byte[]](@(0xA5,0x5A)+$ses.TI+@(($script:ctr -band 0xFF),(($script:ctr -shr 8) -band 0xFF))+(New-Object byte[] 8))) }

# ── 1) la direccion ──────────────────────────────────────────────────────
$lon = $fichero.Length
$cab = @(0x02,0x00,0x00,0x00,($lon -band 0xFF),(($lon -shr 8) -band 0xFF),0x00)
$w = Env ([byte[]](0x90,0x8D,0x00,0x00,($cab.Length+$fichero.Length))+[byte[]]($cab+$fichero)+[byte[]](0x00))
if($w.sw -notin @('9100','9000')){ throw "No se pudo escribir la direccion ($($w.sw))" }
Write-Host '  1/4  direccion escrita'
$ctr++

# ── 2) el codigo rotativo ────────────────────────────────────────────────
# SDMAccessRights va FF E1, NO E1 FF. Al reves la tarjeta entiende que la
# firma no se usa, no espera los dos ultimos offsets y contesta 917E.
#   F reservado · F no devuelve el contador
#   E numero y contador a la vista · 1 la firma se hace con la clave 1
$o3 = { param($n) @(($n -band 0xFF),(($n -shr 8) -band 0xFF),(($n -shr 16) -band 0xFF)) }
$cfg = @(0x40, 0xE0,0xEE, 0xC1, 0xFF,0xE1) +
       (& $o3 $offUid) + (& $o3 $offCtr) + (& $o3 $offUid) + (& $o3 $offMac)
# Va CIFRADO: los permisos del fichero traen "Change = clave 0", y esa clave
# exige canal seguro. En claro contesta 917E.
$enc = AesEnc $ses.KENC (IVcmd) (Pad ([byte[]]$cfg))
$macIn = @(0x5F,($ctr -band 0xFF),(($ctr -shr 8) -band 0xFF))+$ses.TI+@(0x02)+$enc
$cuerpo = [byte[]](@(0x02)+$enc+(Impares (Cmac $ses.KMAC ([byte[]]$macIn))))
$c = Env ([byte[]](0x90,0x5F,0x00,0x00,$cuerpo.Length)+$cuerpo+[byte[]](0x00))
if($c.sw -notin @('9100','9000')){ throw "No se pudo encender el codigo rotativo ($($c.sw))" }
Write-Host '  2/4  codigo rotativo encendido'
$ctr++

# ── 3) la clave ──────────────────────────────────────────────────────────
if ($yaTenia) {
  Write-Host '  3/4  la clave ya era la de El Parche'
} else {
  $x = New-Object byte[] 16
  for($i=0;$i -lt 16;$i++){ $x[$i] = $claveParche[$i] -bxor $claveFabrica[$i] }
  $datos = [byte[]]($x + @(0x01) + (Crc32Nxp $claveParche))
  $enc2 = AesEnc $ses.KENC (IVcmd) (Pad $datos)
  $macIn2 = @(0xC4,($ctr -band 0xFF),(($ctr -shr 8) -band 0xFF))+$ses.TI+@(0x01)+$enc2
  $cuerpo2 = [byte[]](@(0x01)+$enc2+(Impares (Cmac $ses.KMAC ([byte[]]$macIn2))))
  $k = Env ([byte[]](0x90,0xC4,0x00,0x00,$cuerpo2.Length)+$cuerpo2+[byte[]](0x00))
  if($k.sw -notin @('9100','9000')){ throw "No se pudo cambiar la clave ($($k.sw))" }
  Write-Host '  3/4  clave de El Parche puesta'
}
[void][TARJ]::SCardDisconnect($card,0)

# ── 4) comprobar leyendola ───────────────────────────────────────────────
Start-Sleep -Milliseconds 250
$card=[IntPtr]::Zero; $act=0
[void][TARJ]::SCardConnectA($ctx,$lector,2,3,[ref]$card,[ref]$act)
$io=New-Object TARJ+IO; $io.proto=$act; $io.len=8
[void](Env ([byte[]](0x00,0xA4,0x04,0x00,0x07,0xD2,0x76,0x00,0x00,0x85,0x01,0x01,0x00)))
[void](Env ([byte[]](0x00,0xA4,0x00,0x0C,0x02,0xE1,0x04)))
$rd = Env ([byte[]](0x00,0xB0,0x00,0x00,0x60))
[void][TARJ]::SCardDisconnect($card,0)
if($rd.sw -ne '9000'){ throw 'Quedo programada pero no se pudo leer para comprobar.' }
$leido = ($rd.datos | ForEach-Object { if($_ -ge 32 -and $_ -lt 127){[char]$_} else {''} }) -join ''
$leido = $leido.Substring($leido.IndexOf($Direccion.Split('/')[0]))
$uidHex = ([regex]::Match($leido,'u=([0-9A-Fa-f]{14})')).Groups[1].Value
$ctrHex = ([regex]::Match($leido,'c=([0-9A-Fa-f]{6})')).Groups[1].Value
$macTar = ([regex]::Match($leido,'m=([0-9A-Fa-f]{16})')).Groups[1].Value
$ctrB = DeHex $ctrHex
$sv = @(0x3C,0xC3,0x00,0x01,0x00,0x80) + (DeHex $uidHex) + @($ctrB[2],$ctrB[1],$ctrB[0])
$delToque = Cmac $claveParche ([byte[]]$sv)
$mio = Hex (Impares (Cmac $delToque ([System.Text.Encoding]::ASCII.GetBytes("$uidHex&c=$ctrHex&m="))))

Write-Host ''
if ($mio -eq $macTar) {
  Write-Host '  4/4  comprobado: firma con la clave de El Parche' -ForegroundColor Green
  Write-Host ''
  Write-Host "  TARJETA LISTA   numero $uidHex" -ForegroundColor Green
  Write-Host "  https://$leido"
} else {
  Write-Host '  4/4  LA FIRMA NO CUADRA. No entregar esta tarjeta.' -ForegroundColor Red
  Write-Host "     trae      : $macTar"
  Write-Host "     esperabamos: $mio"
  exit 1
}
