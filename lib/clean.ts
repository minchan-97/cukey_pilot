// PDF에서 뽑은 글자 정리.
// 1) 한글 PDF(한글→PDF 변환본 등) 중에는 글자 대응표가 깨져서
//    한글이 엉뚱한 한자·기호로, 띄어쓰기가 'G', 마침표가 'U'로 나오는 파일이 있다.
//    글자가 일정한 간격만큼 밀려 있어서 되돌릴 수 있다.
// 2) DB가 못 받는 문자(널 문자, 짝 없는 서로게이트, 제어 문자)를 걷어낸다.

const SHIFT = 0x8DAA;               // 깨진 한글 = 원래 한글 - SHIFT
const LO = 0xAC00 - SHIFT;          // '가'가 밀려난 자리
const HI = 0xD7A3 - SHIFT;          // '힣'이 밀려난 자리
const ASCII_SHIFT = 0x27;           // 'G'(0x47) → 띄어쓰기(0x20)

export function looksShifted(s: string): boolean {
  let shifted = 0, hangul = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= LO && c <= HI) shifted++;
    else if (c >= 0xAC00 && c <= 0xD7A3) hangul++;
  }
  return shifted >= 3 && shifted > hangul * 3;
}

export function repairShifted(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= LO && c <= HI) out += String.fromCodePoint(c + SHIFT);
    else if (c >= 0x47 && c <= 0xA5) out += String.fromCodePoint(c - ASCII_SHIFT);
    else if (ch === "½") out += "·";
    else out += ch;
  }
  return out;
}

export function cleanText(s: unknown): string {
  let t = String(s ?? "");
  if (looksShifted(t)) t = repairShifted(t);
  return t
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\uFFFE|\uFFFF/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}
