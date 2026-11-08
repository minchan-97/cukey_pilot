# 임용 D (development) — 약한 개념 강화 파일럿

강사의 A(기출·분석) → B(기본이론) → C(각론 완성)는 그대로 두고,
그 위에 **수험생 개인 보강 루프 D**를 얹는다.

```
교재 PDF에서 모르는 곳 드래그 → 약한 개념으로 쌓임 → 그 개념 문제(교재 근거 안에서만)
→ 내 답 먼저 → 해설·근거 쪽 공개 → 내가 맞음/틀림 확정 → 복습 간격 갱신 → 아침 알림
                                          └ 강사용: 개념별 '몇 명이 어려워했나' 집계
```

## v17(임용 국어 4레이어)에서 가져온 것

| v17 | 여기서 | 바뀐 점 |
|---|---|---|
| `core/schema.py` 출처 강제 | `pages` 테이블, `lib/retrieve.ts` | 근거는 항상 `교재명 p.쪽`. 쪽에 묶이지 않은 근거는 만들 수 없음 |
| `core/korean_tokenizer.py` | `lib/tokenizer.ts` | 그대로 이식 |
| `core/self_exam.py` keyword 전략 | `lib/retrieve.ts` | SOM 노드 대신 **표시한 쪽**을 닻으로, 같은 교재 안에서만 검색 |
| `layer4.py` 근거 묶음·문제 먼저/해설 나중 | `api/problems`, `api/problems/[id]/reveal` | 내 답을 내야 해설이 열림(서버에서 강제) |
| `layer4.py` 채점 제안 | `lib/prompts.ts` gradePrompt | 그대로. 제안일 뿐 |
| `study_state.py` 약점지도, 사람 확정만 반영 | `concept_stats`, `api/attempts/[id]/confirm` | 개념 단위로 |
| `daily_digest.py` 점수·복습 간격(1·3·7·14·30·60일) | `lib/weakness.ts`, `api/cron/digest` | 고르기는 결정적(LLM 안 씀), 결과는 웹 푸시 |
| `concept_dict.py` 표기 일관성 | `concepts.norm` + 개념명 프롬프트 | 기존 이름 재사용 우선, 이름은 내가 고칠 수 있음 |

새로 넣은 것: **근거 검증**(`lib/guard.ts`) — 문제·해설이 인용한 쪽이 실제로 준 근거 안에 있는지 확인하고,
밖이면 다시 만들고, 두 번 실패하면 내지 않는다.

## 뺀 것 (파일럿 범위 밖)
SOM·고정 임베딩(pkl), L1 기출 패턴, L3 트렌드·Brave, 경향 랩, 드라이브 가져오기, 과목 재판정·정비,
지문 군집, 수능형 연습. 쪽 단위 근거 + 키워드 검색으로 충분히 도는지 파일럿에서 먼저 확인한다.

## 설치
1. Supabase 새 프로젝트 → SQL Editor에서 `supabase/schema.sql` 실행
2. `.env.example`을 Vercel 환경변수로 옮겨 채우기
   - VAPID 키: `npx web-push generate-vapid-keys`
   - `PILOT_PASSWORD`는 꼭 설정 (강사 교재 보호)
3. GitHub에 올리고 Vercel 연결 → 자동 배포
4. Extensions에서 pg_cron, pg_net 켜고 `supabase/cron.sql`의 주소·비밀값 채워 실행 (매일 07:00 KST)
5. 폰에서 열기 → 홈 화면에 추가 → 그 앱에서 '아침 알림 켜기' (아이폰은 홈 화면 앱에서만 푸시 가능)

## 알아둘 한계
- **스캔본 PDF**는 글자층이 없어 드래그해도 글자를 못 읽는다. 그때는 표시 내용을 직접 적게 되어 있다.
  v17 `page_scan.py`(비전 판독)를 워커로 옮기면 해결되지만 파일럿에선 뺐다.
- 사용자는 `DEMO_USER_ID` 한 명. 수강생 다수로 가려면 Supabase Auth를 붙여 `lib/db.ts`의 `userId()`만 바꾸면 된다.
  테이블은 이미 `user_id` 기준으로 나뉘어 있다.
- 강사용 집계는 개념 이름이 같아야 묶인다(사람마다 이름이 갈리면 따로 잡힘). 다수 사용자 단계에서 교재별 공통 개념 사전이 필요하다.
- 시연용. 배포 링크는 비공개로 두고, 받은 교재는 시연 후 Storage에서 지운다.
