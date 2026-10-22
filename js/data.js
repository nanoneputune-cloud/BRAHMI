/* =========================================================================
   Brahmi character database
   Brahmi codepoints verified against the Unicode character database
   (block U+11000–U+1107F). Every entry carries its Kannada, Devanagari and
   IAST equivalent so one glyph can be read in three languages.
   ========================================================================= */

const GROUP_INFO = {
  velar:     { en:'Velar',     kn:'ಕಂಠ್ಯ',    hi:'कंठ्य'     },
  palatal:   { en:'Palatal',   kn:'ತಾಲವ್ಯ',   hi:'तालव्य'    },
  retroflex: { en:'Retroflex', kn:'ಮೂರ್ಧನ್ಯ', hi:'मूर्धन्य'  },
  dental:    { en:'Dental',    kn:'ದಂತ್ಯ',    hi:'दन्त्य'    },
  labial:    { en:'Labial',    kn:'ಓಷ್ಠ್ಯ',   hi:'ओष्ठ्य'    },
  semivowel: { en:'Semivowel', kn:'ಅಂತಸ್ಥ',   hi:'अन्तःस्थ'  },
  sibilant:  { en:'Sibilant',  kn:'ಊಷ್ಮ',     hi:'ऊष्म'      },
  vowel:     { en:'Vowel',     kn:'ಸ್ವರ',     hi:'स्वर'      },
  sign:      { en:'Sign',      kn:'ಸಂಕೇತ',    hi:'संकेत'     }
};

const VOICE_INFO = {
  vu:  { en:'voiceless unaspirated', kn:'ಅಘೋಷ',              hi:'अघोष'            },
  va:  { en:'voiceless aspirated',   kn:'ಅಘೋಷ ಮಹಾಪ್ರಾಣ',      hi:'अघोष महाप्राण'   },
  gu:  { en:'voiced unaspirated',    kn:'ಘೋಷ',                hi:'घोष'             },
  ga:  { en:'voiced aspirated',      kn:'ಘೋಷ ಮಹಾಪ್ರಾಣ',       hi:'घोष महाप्राण'    },
  nas: { en:'nasal',                 kn:'ಅನುನಾಸಿಕ',           hi:'अनुनासिक'        },
  vow: { en:'vowel',                 kn:'ಸ್ವರ',               hi:'स्वर'            },
  sym: { en:'vowel sign',            kn:'ಸ್ವರ ಚಿಹ್ನೆ',         hi:'स्वर चिह्न'      },
  pun: { en:'punctuation',           kn:'ವಿರಾಮ ಚಿಹ್ನೆ',        hi:'विराम चिह्न'     }
};

/* English pronunciation hint per stop (group × voice) */
const SOUND_MATRIX = {
  velar:     { vu:'k in "skip"',  va:'kh in "blockhead"', gu:'g in "go"',   ga:'gh in "doghouse"', nas:'ng in "sing"' },
  palatal:   { vu:'c in "chair"', va:'ch in "catch him"', gu:'j in "jump"', ga:'jh in "hedgehog"', nas:'ny in "canyon"' },
  retroflex: { vu:'t in "top" (tongue curled back)', va:'th in "hit hard"', gu:'d in "done"', ga:'dh in "red hut"', nas:'n in "burn"' },
  dental:    { vu:'t in "stop" (tongue at the teeth)', va:'th in "thin"', gu:'d in "day" (tongue at teeth)', ga:'dh in "adhere"', nas:'n in "name"' },
  labial:    { vu:'p in "spin"', va:'ph in "up hill"', gu:'b in "bat"',    ga:'bh in "abhor"',    nas:'m in "man"' }
};

/* Per-character sound overrides (vowels, semivowels, sibilants, signs) */
const SOUND_OVERRIDE = {
  a:'u in "about"', ā:'a in "father"', i:'i in "sit"', ī:'ee in "see"',
  u:'u in "put"', ū:'oo in "moon"', ṛ:'vocalic r — "rhythm"', ṝ:'long vocalic r',
  ḷ:'vocalic l — "bottle"', ḹ:'long vocalic l', e:'e in "bet"',
  ai:'ai in "aisle"', o:'o in "go"', au:'ou in "loud"',
  ya:'y in "yes"', ra:'r in "run" (tap)', la:'l in "lip"', va:'v in "van"',
  śa:'sh in "ship"', ṣa:'sh in "shun" (retroflex)', sa:'s in "sun"',
  ha:'h in "hat"', ḷa:'l in "felt" (retroflex)',
  virama:'silences the inherent "a"', anusvara:'nasal hum after the vowel',
  visarga:'soft breath after the vowel', candrabindu:'nasalised vowel'
};

/* Short/long pairs used by the "similar phonetics" panel */
const PAIRS = { 'ā':'a','a':'ā','ī':'i','i':'ī','ū':'u','u':'ū','ṝ':'ṛ','ṛ':'ṝ','ḹ':'ḷ','ḷ':'ḹ' };

const C = (id, br, kn, hi, t, g, v, extra) => Object.assign({ id, br, kn, hi, t, g, v }, extra || {});

const RAW = [
  /* ---- independent vowels ---- */
  C('a','𑀅','ಅ','अ','vowel','vowel','vow'),
  C('ā','𑀆','ಆ','आ','vowel','vowel','vow'),
  C('i','𑀇','ಇ','इ','vowel','vowel','vow'),
  C('ī','𑀈','ಈ','ई','vowel','vowel','vow'),
  C('u','𑀉','ಉ','उ','vowel','vowel','vow'),
  C('ū','𑀊','ಊ','ऊ','vowel','vowel','vow'),
  C('ṛ','𑀋','ಋ','ऋ','vowel','vowel','vow'),
  C('ṝ','𑀌','ೠ','ॠ','vowel','vowel','vow'),
  C('ḷ','𑀍','ಌ','ऌ','vowel','vowel','vow'),
  C('ḹ','𑀎','ೡ','ॡ','vowel','vowel','vow'),
  C('e','𑀏','ಎ','ए','vowel','vowel','vow'),
  C('ai','𑀐','ಐ','ऐ','vowel','vowel','vow'),
  C('o','𑀑','ಒ','ओ','vowel','vowel','vow'),
  C('au','𑀒','ಔ','औ','vowel','vowel','vow'),

  /* ---- consonants ---- */
  C('ka','𑀓','ಕ','क','consonant','velar','vu'),
  C('kha','𑀔','ಖ','ख','consonant','velar','va'),
  C('ga','𑀕','ಗ','ग','consonant','velar','gu'),
  C('gha','𑀖','ಘ','घ','consonant','velar','ga'),
  C('ṅa','𑀗','ಙ','ङ','consonant','velar','nas'),
  C('ca','𑀘','ಚ','च','consonant','palatal','vu'),
  C('cha','𑀙','ಛ','छ','consonant','palatal','va'),
  C('ja','𑀚','ಜ','ज','consonant','palatal','gu'),
  C('jha','𑀛','ಝ','झ','consonant','palatal','ga'),
  C('ña','𑀜','ಞ','ञ','consonant','palatal','nas'),
  C('ṭa','𑀝','ಟ','ट','consonant','retroflex','vu'),
  C('ṭha','𑀞','ಠ','ठ','consonant','retroflex','va'),
  C('ḍa','𑀟','ಡ','ड','consonant','retroflex','gu'),
  C('ḍha','𑀠','ಢ','ढ','consonant','retroflex','ga'),
  C('ṇa','𑀡','ಣ','ण','consonant','retroflex','nas'),
  C('ta','𑀢','ತ','त','consonant','dental','vu'),
  C('tha','𑀣','ಥ','थ','consonant','dental','va'),
  C('da','𑀤','ದ','द','consonant','dental','gu'),
  C('dha','𑀥','ಧ','ध','consonant','dental','ga'),
  C('na','𑀦','ನ','न','consonant','dental','nas'),
  C('pa','𑀧','ಪ','प','consonant','labial','vu'),
  C('pha','𑀨','ಫ','फ','consonant','labial','va'),
  C('ba','𑀩','ಬ','ब','consonant','labial','gu'),
  C('bha','𑀪','ಭ','भ','consonant','labial','ga'),
  C('ma','𑀫','ಮ','म','consonant','labial','nas'),
  C('ya','𑀬','ಯ','य','consonant','semivowel','gu'),
  C('ra','𑀭','ರ','र','consonant','semivowel','gu'),
  C('la','𑀮','ಲ','ल','consonant','semivowel','gu'),
  C('va','𑀯','ವ','व','consonant','semivowel','gu'),
  C('śa','𑀰','ಶ','श','consonant','sibilant','vu'),
  C('ṣa','𑀱','ಷ','ष','consonant','sibilant','vu'),
  C('sa','𑀲','ಸ','स','consonant','sibilant','vu'),
  C('ha','𑀳','ಹ','ह','consonant','sibilant','gu'),
  C('ḷa','𑀴','ಳ','ळ','consonant','retroflex','gu'),

  /* ---- accents: vowel signs (mātrās) ---- */
  C('sign-ā','𑀸','◌ಾ','◌ा','matra','sign','sym',{ base:'ā' }),
  C('sign-i','𑀺','◌ಿ','◌ि','matra','sign','sym',{ base:'i' }),
  C('sign-ī','𑀻','◌ೀ','◌ी','matra','sign','sym',{ base:'ī' }),
  C('sign-u','𑀼','◌ು','◌ु','matra','sign','sym',{ base:'u' }),
  C('sign-ū','𑀽','◌ೂ','◌ू','matra','sign','sym',{ base:'ū' }),
  C('sign-ṛ','𑀾','◌ೃ','◌ृ','matra','sign','sym',{ base:'ṛ' }),
  C('sign-ṝ','𑀿','◌ೄ','◌ॄ','matra','sign','sym',{ base:'ṝ' }),
  C('sign-ḷ','𑁀','◌ೢ','◌ॢ','matra','sign','sym',{ base:'ḷ' }),
  C('sign-ḹ','𑁁','◌ೣ','◌ॣ','matra','sign','sym',{ base:'ḹ' }),
  C('sign-e','𑁂','◌ೆ','◌े','matra','sign','sym',{ base:'e' }),
  C('sign-ai','𑁃','◌ೈ','◌ै','matra','sign','sym',{ base:'ai' }),
  C('sign-o','𑁄','◌ೊ','◌ो','matra','sign','sym',{ base:'o' }),
  C('sign-au','𑁅','◌ೌ','◌ौ','matra','sign','sym',{ base:'au' }),

  /* ---- other marks ---- */
  C('candrabindu','𑀀','◌ಁ','◌ँ','sign','sign','sym',{ comb:true }),
  C('anusvara','𑀁','◌ಂ','◌ं','sign','sign','sym',{ comb:true }),
  C('visarga','𑀂','◌ಃ','◌ः','sign','sign','sym',{ comb:true }),
  C('virama','𑁆','◌್','◌्','sign','sign','sym',{ comb:true }),
  C('danda','𑁇','।','।','sign','sign','pun'),
  C('ddanda','𑁈','॥','॥','sign','sign','pun')
];

const NOTE3 = {
  virama:    { en:'Virama — removes the inherent "a" of a consonant', kn:'ವಿರಾಮ — ವ್ಯಂಜನದ ಸ್ವರ ತೆಗೆಯುತ್ತದೆ', hi:'विराम — व्यंजन का स्वर हटाता है' },
  anusvara:  { en:'Anusvāra — nasal resonance after the vowel', kn:'ಅನುಸ್ವಾರ — ಸ್ವರದ ನಂತರ ಅನುನಾಸಿಕ ಧ್ವನಿ', hi:'अनुस्वार — स्वर के बाद नासिक ध्वनि' },
  visarga:   { en:'Visarga — a short voiceless breath after the vowel', kn:'ವಿಸರ್ಗ — ಸ್ವರದ ನಂತರ ಉಸಿರಿನ ಧ್ವನಿ', hi:'विसर्ग — स्वर के बाद हल्की श्वास ध्वनि' },
  candrabindu:{ en:'Candrabindu — marks a nasalised vowel', kn:'ಚಂದ್ರಬಿಂದು — ಅನುನಾಸಿಕ ಸ್ವರ', hi:'चन्द्रबिन्दु — अनुनासिक स्वर' },
  danda:     { en:'Daṇḍa — sentence / half-verse divider', kn:'ದಂಡ — ವಾಕ್ಯ ವಿಭಾಜಕ', hi:'दंड — वाक्य विभाजक' },
  ddanda:    { en:'Double daṇḍa — end of a verse', kn:'ದ್ವಿದಂಡ — ಶ್ಲೋಕದ ಅಂತ್ಯ', hi:'द्विदंड — श्लोक का अंत' }
};

const IS_STOP_GROUP = { velar:1, palatal:1, retroflex:1, dental:1, labial:1 };

function charDesc(c) {
  if (NOTE3[c.id]) return NOTE3[c.id];
  if (c.t === 'matra') return {
    en: `Vowel sign (mātrā) for "${c.base}" — written with a consonant`,
    kn: `"${c.base}" ಸ್ವರ ಚಿಹ್ನೆ (ಮಾತ್ರೆ) — ವ್ಯಂಜನದೊಂದಿಗೆ`,
    hi: `"${c.base}" का स्वर चिह्न (मात्रा) — व्यंजन के साथ`
  };
  if (c.t === 'vowel') return {
    en: `Independent vowel · ${GROUP_INFO[c.g].en}`,
    kn: `ಸ್ವರಾಕ್ಷರ · ${GROUP_INFO[c.g].kn}`,
    hi: `स्वर वर्ण · ${GROUP_INFO[c.g].hi}`
  };
  if (c.t === 'consonant') {
    const g = GROUP_INFO[c.g], v = VOICE_INFO[c.v];
    if (c.g === 'semivowel') return { en:`Semivowel · ${g.en}`, kn:`ಅಂತಸ್ಥ ವ್ಯಂಜನ · ${g.kn}`, hi:`अन्तःस्थ व्यंजन · ${g.hi}` };
    if (c.g === 'sibilant')  return { en:`Sibilant / fricative · ${g.en}`, kn:`ಊಷ್ಮ ವ್ಯಂಜನ · ${g.kn}`, hi:`ऊष्म व्यंजन · ${g.hi}` };
    const kind = c.v === 'nas' ? 'nasal' : 'stop';
    return {
      en: `${g.en} ${v.en} ${kind}`,
      kn: `${g.kn} ${v.kn} ವ್ಯಂಜನ`,
      hi: `${g.hi} ${v.hi} व्यंजन`
    };
  }
  return { en: GROUP_INFO[c.g].en, kn: GROUP_INFO[c.g].kn, hi: GROUP_INFO[c.g].hi };
}

function charSound(c) {
  if (SOUND_OVERRIDE[c.id]) return SOUND_OVERRIDE[c.id];
  if (c.t === 'matra') return `adds "${c.base}" after the consonant`;
  const m = SOUND_MATRIX[c.g];
  return m ? m[c.v] : '';
}

const TYPE_LABEL = {
  all: 'All characters', vowel: 'Vowels', consonant: 'Consonants',
  matra: 'Accents (mātrās)', sign: 'Signs'
};
const TYPE_SHORT = { vowel:'vowel', consonant:'cons', matra:'accent', sign:'sign' };

const BRAHMI_CHARS = RAW.map(c => {
  const combining = c.comb !== undefined ? c.comb : (c.t === 'matra');
  return {
    id: c.id,
    br: c.br,
    kn: c.kn,
    hi: c.hi,
    t: c.t,
    g: c.g,
    v: c.v,
    base: c.base || null,
    combining,
    name: c.t === 'matra'
      ? `${c.base.charAt(0).toUpperCase()}${c.base.slice(1)} mātrā`
      : (c.t === 'sign'
          ? c.id.charAt(0).toUpperCase() + c.id.slice(1)
          : c.id.charAt(0).toUpperCase() + c.id.slice(1)),
    desc: charDesc(c),
    sound: charSound(c)
  };
});

const CHAR_BY_ID = new Map(BRAHMI_CHARS.map(c => [c.id, c]));

/* characters that share a sound family (same place of articulation / same class) */
function phoneticFamily(id) {
  const c = CHAR_BY_ID.get(id);
  if (!c) return [];
  const out = [];
  const partnerId = PAIRS[c.base || c.id];
  const partner = partnerId ? CHAR_BY_ID.get(partnerId) : null;

  if (c.t === 'consonant') {
    /* the varga — same place of articulation, same class (stop / nasal / etc.) */
    for (const x of BRAHMI_CHARS) {
      if (x.t === 'consonant' && x.g === c.g && x.id !== c.id) out.push(x);
    }
    if (partner && !out.includes(partner)) out.unshift(partner);
  } else if (c.t === 'matra') {
    /* the vowel it stands for, then that vowel's length partner */
    const v = CHAR_BY_ID.get(c.base);
    if (v) out.push(v);
    if (partner && !out.includes(partner)) out.push(partner);
  } else if (c.t === 'vowel') {
    /* only the short/long partner — every vowel is not "similar" to every other */
    if (partner) out.push(partner);
  }
  return out.slice(0, 6);
}

/* -------------------------------------------------------------------------
   Word composition: a list of recognised character ids becomes a real string in
   all three scripts. The inherent "a" of a consonant is dropped when a virama
   follows, and vowel signs are appended as marks rather than letters — so
   ba + ra + ha + virama + ma + sign-ī really does produce ಬರಹ್ಮೀ.
   ------------------------------------------------------------------------- */
function compose(ids) {
  const list = ids.map(x => (typeof x === 'string' ? CHAR_BY_ID.get(x) : x)).filter(Boolean);
  let br = '', kn = '', hi = '', iast = '';
  const bare = s => s.replace(/◌/g, '');

  for (let i = 0; i < list.length; i++) {
    const c = list[i];

    if (c.id === 'virama') {            // standing alone, no consonant before it
      br += c.br; kn += '್'; hi += '्';
      continue;
    }

    if (c.t === 'consonant') {
      const hasV = list[i + 1] && list[i + 1].id === 'virama';
      br += c.br;
      kn += c.kn + (hasV ? '್' : '');
      hi += c.hi + (hasV ? '्' : '');
      iast += c.id.slice(0, -1) + (hasV ? '' : 'a');
      if (hasV) i++;                    // virama already spent
      continue;
    }

    if (c.t === 'matra') {
      br += c.br;
      kn += bare(c.kn);
      hi += bare(c.hi);
      iast += (c.base || '');
      continue;
    }

    br += c.br;
    kn += bare(c.kn);
    hi += bare(c.hi);
    if (c.id === 'anusvara') iast += 'ṃ';
    else if (c.id === 'visarga') iast += 'ḥ';
    else if (c.id === 'candrabindu') iast += 'm̐';
    else if (c.id === 'danda') iast += ' | ';
    else if (c.id === 'ddanda') iast += ' || ';
    else iast += c.id;
  }
  return { br, kn, hi, iast };
}

window.BrahmiData = {
  CHARS: BRAHMI_CHARS, BY_ID: CHAR_BY_ID, GROUPS: GROUP_INFO, VOICES: VOICE_INFO,
  TYPES: TYPE_LABEL, TYPE_SHORT, family: phoneticFamily, desc: charDesc, sound: charSound,
  compose
};
