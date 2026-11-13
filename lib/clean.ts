// PDF에서 뽑은 글자 정리.
// 1) 한글→PDF 변환본 중에는 글꼴 대응표가 깨져 한글이 엉뚱한 한자·기호로,
//    띄어쓰기가 'G', 마침표가 'U', 쉼표가 'S'로 나오는 파일이 있다.
//    글자가 일정한 간격만큼 밀려 있어 되돌릴 수 있다.
//    한 쪽 안에 정상 글자(표 등)와 밀린 글자(본문)가 섞이기 때문에
//    쪽 전체가 아니라 '어절 단위'로 판정해서 밀린 어절만 되돌린다.
//    (①, ㉠ 같은 정상 기호가 같은 영역에 있어 무작정 바꾸면 안 된다)
// 2) DB가 못 받는 문자(널 문자, 짝 없는 서로게이트, 제어 문자)를 걷어낸다.

const SHIFT = 0x8DAA;               // 밀린 한글 = 원래 한글 - SHIFT
const LO = 0xAC00 - SHIFT;          // '가'가 밀려난 자리
const HI = 0xD7A3 - SHIFT;          // '힣'이 밀려난 자리
const ASCII_SHIFT = 0x27;           // 'G'(0x47) → 띄어쓰기(0x20)

const inRange = (c: number) => c >= LO && c <= HI;
const isHangul = (c: number) => c >= 0xAC00 && c <= 0xD7A3;
const isShiftedAscii = (c: number) => c >= 0x47 && c <= 0xA5;

function shiftedToken(tok: string) {
  let range = 0, hangul = 0;
  for (const ch of tok) {
    const c = ch.codePointAt(0)!;
    if (inRange(c)) range++;
    else if (isHangul(c)) hangul++;
  }
  if (!range || hangul) return false;
  // 밀린 어절은 보통 'G'(띄어쓰기)·'U'(마침표)·'S'(쉼표)로 끝나거나 두 글자 이상
  return /[GUS]$/.test(tok) || range >= 2;
}
const asciiToken = (tok: string) =>
  tok.length > 0 && [...tok].every((ch) => isShiftedAscii(ch.codePointAt(0)!));

function repairToken(tok: string) {
  let out = "";
  for (const ch of tok) {
    const c = ch.codePointAt(0)!;
    if (inRange(c)) out += String.fromCodePoint(c + SHIFT);
    else if (isShiftedAscii(c)) out += String.fromCodePoint(c - ASCII_SHIFT);
    else if (ch === "½") out += "·";
    else out += ch;
  }
  return out;
}

export function repairShifted(s: string): string {
  const parts = s.split(/(\s+)/);                 // 짝수 칸 = 어절, 홀수 칸 = 공백
  const idx = parts.map((_, i) => i).filter((i) => i % 2 === 0 && parts[i]);
  const hit = new Set(idx.filter((i) => shiftedToken(parts[i])));
  if (!hit.size) return s;
  // 숫자·괄호만 있는 어절('YWYYG'=2022, 'OZP'=(3))은 이웃 어절이 밀렸을 때만 되돌린다
  idx.forEach((i, k) => {
    if (hit.has(i) || !asciiToken(parts[i])) return;
    const prev = idx[k - 1], next = idx[k + 1];
    if ((prev !== undefined && hit.has(prev)) || (next !== undefined && hit.has(next))) hit.add(i);
  });
  return parts.map((p, i) => (hit.has(i) ? repairToken(p) : p)).join("");
}

export function cleanText(s: unknown): string {
  return repairShifted(String(s ?? ""))
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\uFFFE|\uFFFF/g, "")
    .replace(/[\uE000-\uF8FF]/g, "")            // 글꼴 전용 영역 문자(□로 보이는 글머리표 등)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

// ── 되돌릴 수 없게 깨진 글자 알아보기 ─────────────────────────
// 글꼴마다 깨지는 방식이 달라서(수학 교재처럼 멀쩡한 한글 음절로 뒤섞이는 경우)
// 규칙으로 되돌릴 수 없는 것도 있다. 그런 글은 이미지로 다시 읽어야 한다.
// 판정: 정상 한국어 글에는 '이·다·는·의·을…' 같은 흔한 음절이 절반 가까이 섞이는데,
// 뒤섞인 글에는 거의 없고 엉뚱한 한자가 끼어 있다.
const COMMON = new Set("이다는의을를에하고가서한적수와로은지기인과리사도들게것있해대으장시상자정부어나일라전여면그되요화성할국문학습생활동교육용".split(""));
const NORMAL_SYMBOL = (c: number) =>
  (c >= 0x2460 && c <= 0x24FF) || (c >= 0x3000 && c <= 0x303F) || (c >= 0x3130 && c <= 0x318F) ||
  (c >= 0x3200 && c <= 0x32FF) || (c >= 0x2010 && c <= 0x2027) || (c >= 0xFF00 && c <= 0xFFEF);

export function looksBroken(text: string): boolean {
  const chars = [...text.replace(/\s/g, "")];
  if (chars.length < 8) return false;
  const hangul = chars.filter((ch) => isHangul(ch.codePointAt(0)!));
  if (hangul.length >= 8) {
    const common = hangul.filter((ch) => COMMON.has(ch)).length / hangul.length;
    const han = chars.filter((ch) => /[\u4E00-\u9FFF]/.test(ch)).length / hangul.length;
    if (common < 0.25 || han > 0.1) return true;
  }
  const odd = chars.filter((ch) => {
    const c = ch.codePointAt(0)!;
    return c > 0x2000 && !isHangul(c) && !NORMAL_SYMBOL(c);
  }).length;
  return odd / chars.length > 0.3;
}
