// v17 core/korean_tokenizer.py 이식 — 조사·어미를 떼어 낱말 겹침을 잴 수 있게 한다.
const JOSA = ["으로부터","에서부터","한테서","로부터","에게서","이라고","라고","으로서","로서","에서","에게","한테","에서도","에게도","으로도","로도","까지도","부터도","이라도","라도","이라면","라면","으로는","로는","에서는","에게는","이지만","지만","이어서","여서","이어도","여도","이어야","여야","으로","로","와","과","이랑","랑","부터","까지","마다","밖에","처럼","만큼","보다","이나","나","이든","든","이며","며","에도","에만","에는","에서만","이라","라","이고","고","이가","가","이","을","를","은","는","의","도","만","에"];
const EOMI = ["했습니다","합니다","됩니다","있습니다","없습니다","입니다","십니다","겠습니다","했어요","해요","돼요","있어요","없어요","하는","하고","해서","하면","하지","하여","되는","되고","돼서","되면","되지","되어","있는","있고","있어서","있으면","없는","없고","없어서","없으면","한다","된다","있다","없다","하였다","되었다","였다","이었다","하며","되며","이며","했다","됐다","할","될","있을","없을","하기","되기","있기","없기","함","됨","있음","없음","해야","돼야","있어야","없어야","하도록","되도록","하여도","되어도","이다","이고","이어서","이어도","이어야","이지만","이라도","이었고","이었으며"];
const JOSA_SORTED = [...new Set(JOSA)].sort((a, b) => b.length - a.length);
const EOMI_SORTED = [...new Set(EOMI)].sort((a, b) => b.length - a.length);
const HANGUL = /[가-힣]/;
const PUNCT = /[^\p{L}\p{N}_]/gu;

function stripSuffix(word: string, list: string[]): string {
  for (const s of list) {
    if (word.endsWith(s) && word.length > s.length + 1) return word.slice(0, -s.length);
  }
  return word;
}

export function normalizeToken(raw: string): string {
  const t = raw.replace(PUNCT, "");
  if (!t) return "";
  if (/^\d+([.,]\d+)?$/.test(t)) return "NUM";
  if (!HANGUL.test(t)) return t.toLowerCase();
  const stem = stripSuffix(stripSuffix(t, JOSA_SORTED), EOMI_SORTED);
  return stem || t;
}

export function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).map(normalizeToken).filter(Boolean);
}
