# -*- coding: utf-8 -*-
"""Reconstruye el cuadro de emojis COMPLETO desde la lista oficial de Unicode.

   Genera DOS cosas que tienen que ir siempre juntas:
     · pos-emoji-nombres.js   (como se llama cada emoji, para buscarlo)
     · _emoji_data.js         (la lista EMOJI_DATA que se pega en chat-ia.js)

   Antes de correrlo hay que bajar tres archivos AL LADO de este script:
     curl -O https://unicode.org/Public/emoji/latest/emoji-test.txt
     curl -o cldr_es.json     https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/es/annotations.json
     curl -o cldr_es_der.json https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/es/annotations.json

   Se corre cuando salga una version nueva de Unicode. No editar los dos
   archivos generados a mano: se desincronizan y el buscador deja de
   encontrar emojis que si estan en el cuadro."""
import io, re, json, unicodedata

R = 'C:/Users/USUARIO/AppData/Local/Temp/restaurant-pos/'

SECCIONES = [
    ('smileys',  'Caras y gestos',    '\U0001F600',       ['Smileys & Emotion', 'People & Body']),
    ('animales', 'Animales y plantas','\U0001F436',       ['Animals & Nature']),
    ('comida',   'Comida y bebida',   '\U0001F354',       ['Food & Drink']),
    ('viajes',   'Viajes y lugares',  '\U0001F697',       ['Travel & Places']),
    ('deporte',  'Actividades',       '\u26BD',           ['Activities']),
    ('objetos',  'Objetos',           '\U0001F4A1',       ['Objects']),
    ('simbolos', 'Símbolos',          '\u2764\uFE0F',     ['Symbols']),
    ('banderas', 'Banderas',          '\U0001F3F3\uFE0F', ['Flags']),
]

TONOS = set(range(0x1F3FB, 0x1F400))      # los 5 tonos de piel
PELO  = {0x1F9B0, 0x1F9B1, 0x1F9B2, 0x1F9B3}

# ── 1. Leer la lista oficial ──────────────────────────────────────────
grupo, porGrupo = '', {}
for linea in io.open('emoji-test.txt', encoding='utf-8'):
    if linea.startswith('# group:'):
        grupo = linea.split(':', 1)[1].strip(); continue
    if linea.startswith('#') or ';' not in linea:
        continue
    codigos, resto = linea.split(';', 1)
    if not resto.strip().startswith('fully-qualified'):
        continue
    puntos = [int(x, 16) for x in codigos.split()]
    # Sin variantes de tono de piel ni de pelo: multiplican por seis el cuadro
    # y para escribirle a un cliente no aportan nada. Queda la version base.
    if any(p in TONOS or p in PELO for p in puntos):
        continue
    porGrupo.setdefault(grupo, []).append(''.join(chr(p) for p in puntos))

print('grupos leidos:', {k: len(v) for k, v in porGrupo.items()})

# ── 2. Nombres en espanol (Unicode CLDR) ──────────────────────────────
ann = json.load(io.open('cldr_es.json', encoding='utf-8'))['annotations']['annotations']
der = json.load(io.open('cldr_es_der.json', encoding='utf-8'))['annotationsDerived']['annotations']
for k, v in der.items():
    ann.setdefault(k, v)

def limpiar(t):
    t = unicodedata.normalize('NFD', t.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', t).strip()

# Como se dicen aca. Unicode dice "patatas fritas"; en Popayan nadie escribe eso.
COLOMBIA = {
    '\U0001F35F': 'papas fritas francesa papitas',
    '\U0001F954': 'papa',
    '\U0001F32D': 'perro caliente perrocaliente',
    '\U0001F354': 'hamburguesa',
    '\U0001F964': 'gaseosa refresco jugo',
    '\U0001F37A': 'pola cerveza',
    '\U0001F91F': 'chevere bacano',
    '\U0001F44D': 'listo dale de una bien',
    '\U0001F64F': 'gracias porfa por favor',
    '\U0001F4B0': 'plata',
    '\U0001F4B5': 'plata billete',
    '\U0001F6F5': 'domicilio domiciliario moto',
    '\U0001F3CD\uFE0F': 'domicilio domiciliario moto',
    '\U0001F357': 'pollo presa',
    '\U0001F33D': 'maiz maicitos mazorca',
    '\U0001F9C0': 'queso',
    '\U0001F951': 'aguacate',
    '\U0001F336\uFE0F': 'aji picante',
    '\U0001F969': 'carne',
    '\U0001F37D\uFE0F': 'plato comida',
    '\U0001F4CD': 'ubicacion direccion donde queda',
    '\u23F0': 'hora reloj demora',
    '\u2705': 'listo hecho confirmado',
    '\u274C': 'no cancelar',
    '\U0001F525': 'candela fuego',
    '\U0001F602': 'jaja risa',
    '\u2764\uFE0F': 'corazon amor',
    '\U0001F6F5': 'domicilio moto scooter',
    '\U0001F4F1': 'celular telefono',
    '\U0001F6D2': 'pedido mercado carrito',
}

def nombresDe(e):
    claves = []
    for cand in (e, e.replace('\ufe0f', '')):
        a = ann.get(cand)
        if a:
            claves = list(a.get('tts', [])) + list(a.get('default', []))
            break
    extra = COLOMBIA.get(e) or COLOMBIA.get(e + '\ufe0f') or COLOMBIA.get(e.replace('\ufe0f', ''))
    if extra:
        claves.append(extra)
    if not claves:
        return ''
    vistas, palabras = set(), []
    for w in limpiar(' '.join(claves)).split(' '):
        if len(w) > 1 and w not in vistas:
            vistas.add(w); palabras.append(w)
    return ' '.join(palabras)

# ── 3. Armar el cuadro ────────────────────────────────────────────────
cats, nombres, sinNombre = [], {}, 0
for cid, titulo, icono, grupos in SECCIONES:
    lista = []
    for g in grupos:
        lista.extend(porGrupo.get(g, []))
    lista = list(dict.fromkeys(lista))
    for e in lista:
        n = nombresDe(e)
        if n: nombres[e] = n
        else: sinNombre += 1
    cats.append({'id': cid, 'name': titulo, 'icon': icono, 'emojis': lista})
    print('%-9s %-20s %4d' % (cid, titulo, len(lista)))

total = sum(len(c['emojis']) for c in cats)
print('TOTAL en el cuadro:', total, '| sin nombre:', sinNombre)

# ── 4. Escribir los dos archivos ──────────────────────────────────────
cab_n = '''/* ══ CÓMO SE LLAMA CADA EMOJI, EN ESPAÑOL ══════════════════════════════
   Generado el 22-ago-2026 desde las anotaciones oficiales de Unicode (CLDR,
   locale "es") más un puñado de palabras como se dicen en Colombia: Unicode
   dice "patatas fritas" y aquí la gente escribe "papas".

   Para qué: el buscador del cuadro de emojis IGNORABA lo que uno escribía y
   mostraba todos igual, así que buscar no servía de nada. Sergio: "quiero
   buscar un emoji y no lo encuentro".

   Va junto con la lista del cuadro (EMOJI_DATA en chat-ia.js): las dos salen
   del mismo generador, del mismo día y de la misma versión de Unicode. Si se
   regenera una, se regenera la otra.

   Palabras en minúscula y SIN tildes: el buscador limpia igual lo tecleado,
   así "cafe" encuentra "café".                                            */
window.EMOJI_NOMBRES = '''
io.open(R + 'pos-emoji-nombres.js', 'w', encoding='utf-8', newline='\n').write(
    cab_n + json.dumps(nombres, ensure_ascii=False, separators=(',', ':')) + ';\n')

# EMOJI_DATA para chat-ia.js
lineas = ['const EMOJI_DATA = [']
for c in cats:
    lineas.append('  { id:%s, name:%s, icon:%s,' % (
        json.dumps(c['id']), json.dumps(c['name'], ensure_ascii=False), json.dumps(c['icon'], ensure_ascii=False)))
    lineas.append('    emojis:%s },' % json.dumps(c['emojis'], ensure_ascii=False, separators=(',', ':')))
lineas.append('];')
io.open('_emoji_data.js', 'w', encoding='utf-8', newline='\n').write('\n'.join(lineas) + '\n')
print('escritos pos-emoji-nombres.js y _emoji_data.js')
