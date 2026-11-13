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
 * 임용형 문항 틀 — 초등 임용 1차 '교육과정' 서답형 형식.
 * 모양(발문·<자료>·기호·소문항·배점)은 코드가 짜고, AI는 빈칸 고르기·사례 쓰기만 한다.
 */

// 빈칸형: 제시문은 수험생이 드래그한 원문 그대로. AI는 코드가 추린 개념어 후보 중에서만 고른다.
export function blankPrompt(subject: string, concept: string, passage: string, candidates: string[], g: Grounding[]) {
  return (
    `너는 초등 임용시험 1차 '교육과정' ${subject} 문항 출제자다.\n` +
    `아래 [제시문]은 교육과정·교재 원문 그대로다. 실제 임용 교육과정 문항처럼 빈칸 ㉠, ㉡을 뚫을 말을 고른다.\n\n` +
    `[임용 빈칸의 기준]\n` +
    `- 수험생이 외워 두어야 할 교육과정 핵심 용어·개념어를 비운다. (좋은 예: 범주화, 정당화, 상황 맥락, 쓰기 전략, 의사소통 목적)\n` +
    `- 문맥만 보고 쉽게 짐작되는 말, 일반 낱말, 과목 이름 자체는 비우지 않는다. (나쁜 예: 도형, 쓰기, 여러 가지, 필자, 학생)\n` +
    `- 한 문장에 빈칸은 하나만. 전체 2개(문장이 셋 이상이면 최대 3개).\n` +
    `- 반드시 아래 [후보] 중에서 글자 그대로 고른다. 후보에 없는 말은 쓰지 않는다.\n` +
    `- 개념 '${concept}'과 직접 관련된 말을 우선한다.\n\n` +
    `[후보]\n${candidates.map((c) => `- ${c}`).join("\n")}\n\n` +
    `[제시문]\n${passage}\n\n[근거 자료]\n${grounds(g)}\n\n` +
    `- source_desc: 이 제시문이 어떤 자료인지 한 구절(예: '${subject}과 교육과정 '도형과 측정' 영역의 핵심 아이디어'). 근거에 드러난 범위에서만.\n` +
    `- explanation: 각 빈칸의 정답을 근거 원문을 들어 2~3문장으로. 문장 끝에 [p11]처럼 근거 표시.\n\n` +
    `출력(JSON): {"source_desc": "", "blanks": [{"answer": "후보 중 하나"}], "explanation": "", "cites": ["p11"]}`
  );
}

// 사례형: 수업 장면·교사 대화. 기호는 제시문 안에, 정답 개념은 근거 원문 안에.
export function casePrompt(subject: string, concept: string, marked: string[], g: Grounding[]) {
  return (
    `너는 초등 임용시험 1차 '교육과정' ${subject} 문항 출제자다.\n` +
    `수험생이 약하다고 표시한 개념 '${concept}'을(를) 확인하는 수업 사례형 문항을 만든다.\n` +
    `규칙:\n` +
    `- lead: '다음은 ○ 교사의 ${subject} 수업 장면이다. 물음에 답하시오.' 형태 한 문장. (○에는 김, 박 같은 성 하나)\n` +
    `- passage: '교사: …', '학생: …', '(활동) …' 같은 줄 4~8줄. 문항이 가리킬 말이나 행동 바로 앞에 ㉠, ㉡ 기호를 붙인다.\n` +
    `  예) 교사: ㉠ 삼각형을 여러 방향으로 돌려 놓고 같은 점을 찾게 한다.\n` +
    `- passage에는 질문이나 '쓰시오'를 넣지 않는다.\n` +
    `- items 2~3개. 각 ask는 passage에 있는 기호를 가리키고 '쓰시오.'로 끝난다.\n` +
    `  예) '㉠에 해당하는 교수·학습 방법을 쓰시오.', '㉡이 적절하지 않은 이유를 1가지 쓰시오.'\n` +
    `- answer는 근거 자료에 있는 용어나 문장으로 짧게. 근거에 없는 개념·용어를 정답으로 쓰지 말 것. 수업 장면은 지어내도 되지만 정답은 근거에서.\n` +
    `- explanation: 정답을 근거 원문을 들어 2~3문장으로. 문장 끝에 [p11]처럼 근거 표시.\n\n` +
    `[수험생이 표시한 부분]\n${marked.map((m) => `- ${m}`).join("\n")}\n\n[근거 자료]\n${grounds(g)}\n\n` +
    `출력(JSON): {"lead": "", "passage": "", "items": [{"ask": "㉠…쓰시오.", "answer": ""}], "explanation": "", "cites": ["p11"]}`
  );
}

// v17 방식 서술형: 개념 단위로 모은 깨끗한 근거 + 자유로운 출제. 해설은 답을 낸 뒤 따로 만든다.
export function essayPrompt(subject: string, concept: string, marked: string[], g: Grounding[]) {
  return (
    `너는 초등 임용시험 ${subject} 문제 출제 보조자다.\n` +
    `수험생이 약하다고 표시한 개념 '${concept}'에 대해, 아래 '근거 자료'의 개념 범위 안에서만 기출과 유사한 서술형 연습문제 1개를 낸다.\n` +
    `- 임용 서술형처럼 짧은 상황이나 제시문을 주고, 요구 사항 1~2가지를 '~쓰시오.'로 묻는다.\n` +
    `- 근거에 없는 내용을 지어내지 말 것. 답이 근거 자료 안에서 나와야 한다.\n` +
    `- 해설·정답은 절대 쓰지 말고 문제(발문)만 출력한다.\n\n` +
    `[수험생이 표시한 부분]\n${marked.map((m) => `- ${m}`).join("\n")}\n\n` +
    `[근거 자료]\n${grounds(g)}\n\n` +
    `출력(JSON): {"stem": "문제"}`
  );
}
