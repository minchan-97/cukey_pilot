// PDF에서 뽑은 글자에는 DB가 못 받는 문자가 섞여 있다
// (널 문자, 짝 없는 서로게이트, 제어 문자) → 저장 전에 걷어낸다.
export function cleanText(s: unknown): string {
  return String(s ?? "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\uFFFE|\uFFFF/g, "");
}
