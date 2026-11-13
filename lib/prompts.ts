// v17 layer4 프롬프트를 전과목용으로 일반화. 원칙은 그대로:
// 근거 범위 안에서만, 문제와 해설은 따로(먼저 풀게), 채점은 '제안'.
import type { Grounding } from "./retrieve";

const grounds = (g: Grounding[]) => g.map((x) => `[${x.id}] (${x.source})\n${x.text}`).join("\n\n");

export function conceptPrompt(subject: string, marked: string, context: string, existing: string[]) {
  return (
    `너는 초등 임용 ${subject} 수험생이 교재에서 '모르겠다'고 표시한 부분의 개념 이름을 붙인다.\n` +
    `개념 이름은 15자 이내 명사구. 아래 기존 목록에 같은 개념이 있으면 그 이름을 글자 그대로 쓴다.\n` +
    `표시한 부분에 없는 말을 지어내지 말 것.\n\n` +
    `[기존 개념 목록]\n${existing.length ? existing.join("\n") : "(없음)"}\n\n` +
    `[표시한 부분]\n${marked}\n\n[같은 쪽 앞뒤]\n${context}\n\n` +
    `출력(JSON): {"concept": "개념 이름"}`
  );
}

export function stemPrompt(subject: string, concept: string, marked: string[], g: Grounding[]) {
  return (
    `너는 초등 임용 ${subject} 개념 문제 출제 보조자다.\n` +
    `수험생이 약하다고 표시한 개념 '${concept}'을(를) 확인하는 서술형 개념 문제 1개를 낸다.\n` +
    `반드시 아래 '근거 자료' 범위 안에서만 낸다. 근거에 없는 내용을 지어내지 말 것.\n` +
    `해설·정답은 절대 쓰지 말고 문제(발문)만 쓴다.\n` +
    `cites에는 문제가 기대는 근거의 [id]만 넣는다.\n\n` +
    `[수험생이 표시한 부분]\n${marked.map((m) => `- ${m}`).join("\n")}\n\n` +
    `[근거 자료]\n${grounds(g)}\n\n` +
    `출력(JSON): {"stem": "문제", "cites": ["p12"]}`
  );
}

export function answerPrompt(subject: string, stem: string, g: Grounding[]) {
  return (
    `너는 초등 임용 ${subject} 해설 보조자다.\n` +
    `아래 근거 자료에만 기대어 이 문제의 모범답안과 해설을 쓴다.\n` +
    `근거에 나오지 않는 예시·용어·분류를 덧붙이지 말 것(일반 상식으로 채우지 말 것). 근거의 표현을 되도록 그대로 쓴다.\n` +
    `근거만으로 답할 수 없으면 model_answer에 "근거 부족"이라고만 쓴다.\n` +
    `해설 문장마다 기댄 근거를 [p12]처럼 표시하고, cites에 쓴 id를 모두 넣는다.\n\n` +
    `[문제]\n${stem}\n\n[근거 자료]\n${grounds(g)}\n\n` +
    `출력(JSON): {"model_answer": "모범답안", "explanation": "해설", "cites": ["p12"]}`
  );
}

export function gradePrompt(subject: string, stem: string, myAnswer: string, modelAnswer: string, g: Grounding[]) {
  return (
    `너는 초등 임용 ${subject} 서술형 채점 보조자다.\n` +
    `근거 자료와 모범답안을 기준으로 수험생 답안을 채점 '제안'한다(최종 판정은 수험생이 한다).\n` +
    `논리·핵심개념 포함 여부를 보고, 개념어만 겹친다고 정답 처리하지 말 것.\n\n` +
    `[문제]\n${stem}\n\n[모범답안]\n${modelAnswer}\n\n[근거 자료]\n${grounds(g)}\n\n[수험생 답안]\n${myAnswer}\n\n` +
    `출력(JSON): {"suggest": "correct|partial|wrong", "feedback": "무엇이 맞고 무엇이 빠졌는지 2~3줄"}`
  );
}

export const normName = (s: string) => s.replace(/\s+/g, "").trim();

/**
 * 임용형 서답형 문항. 초등 임용 1차처럼 '발문 + <자료>(㉠·㉡) + 소문항'으로 낸다.
 * 정답·해설은 문제를 만들 때 함께 만들고, 수험생이 답을 내기 전에는 내려보내지 않는다.
 */
export function imyongPrompt(subject: string, concept: string, marked: string[], g: Grounding[]) {
  return (
    `너는 초등 임용시험(초등교사 임용 1차, 교육과정·교과교육 서답형) ${subject} 문항 출제자다.\n` +
    `수험생이 약하다고 표시한 개념 '${concept}'을(를) 확인하는 임용형 서답형 문항 1세트를 만든다.\n\n` +
    `[임용형 문항 형식]\n` +
    `- 맨 앞 발문: "다음은 …이다. 물음에 답하시오." 형태.\n` +
    `- 제시문(<자료>) 안에 ㉠, ㉡ 같은 기호를 넣고, 소문항은 그 기호를 가리켜 묻는다.\n` +
    `- 소문항은 2~3개. 각 소문항은 '~쓰시오.'로 끝나고, 답은 용어 하나 또는 1~2문장으로 짧다.\n` +
    `- 유형은 근거에 맞는 하나를 고른다.\n` +
    `  (빈칸형) 근거 원문의 문장을 거의 그대로 옮긴 제시문에서 핵심어를 ㉠, ㉡으로 비운다. 정답은 원문에 적힌 말 그대로.\n` +
    `  (사례형) 교사 대화나 수업 장면을 제시문으로 만들고, 장면 속 ㉠이 어떤 개념에 해당하는지, 또는 원문 기준으로 무엇이 빠졌는지 묻는다.\n` +
    `- 정답과 해설은 반드시 아래 근거 자료 안에서만. 근거에 없는 용어·분류·예시를 정답으로 쓰지 말 것.\n` +
    `- 사례형의 수업 장면은 지어내도 되지만, 정답이 되는 개념과 용어는 근거 원문에 있어야 한다.\n` +
    `- 수험생이 표시한 부분이 문항의 중심이 되게 한다.\n\n` +
    `[수험생이 표시한 부분]\n${marked.map((m) => `- ${m}`).join("\n")}\n\n` +
    `[근거 자료]\n${grounds(g)}\n\n` +
    `출력(JSON):\n` +
    `{"type": "빈칸형|사례형", "lead": "다음은 …이다. 물음에 답하시오.", "passage": "제시문(㉠ 등 포함)", ` +
    `"items": [{"no": 1, "ask": "㉠에 들어갈 말을 쓰시오.", "answer": "정답", "cites": ["p14"]}], ` +
    `"explanation": "근거 원문을 들어 2~4문장 해설. 문장마다 [p14]처럼 근거 표시", "cites": ["p14"]}`
  );
}
