-- 임용 D (development) · Supabase 초기 설정
-- SQL Editor에 통째로 붙여넣고 Run 한 번.
-- v17 원칙 그대로: 출처 없는 자료는 못 들어온다(페이지는 반드시 책+쪽에 묶임),
-- 약점지도에는 사람이 '확정'한 채점만 반영된다.

create extension if not exists pgcrypto;

-- 1) 교재 (PDF 원본은 Storage 'books' 버킷)
create table if not exists public.books (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subject       text not null,
  storage_path  text not null,
  page_count    int,
  created_at    timestamptz default now()
);

-- 2) 쪽 단위 본문 = 근거의 최소 단위. 출처 = books.title + ' p.' + page_no
create table if not exists public.pages (
  id       uuid primary key default gen_random_uuid(),
  book_id  uuid not null references public.books(id) on delete cascade,
  page_no  int  not null,
  text     text not null default '',
  unique (book_id, page_no)
);

-- 3) 약한 개념 (사용자 × 교재별). norm = 공백 뺀 이름 → '사건의 흐름'/'사건의흐름' 갈라짐 방지
create table if not exists public.concepts (
  id       uuid primary key default gen_random_uuid(),
  user_id  text not null,
  book_id  uuid not null references public.books(id) on delete cascade,
  name     text not null,
  norm     text not null,
  created_at timestamptz default now(),
  unique (user_id, book_id, norm)
);

-- 4) 드래그 표시 (모르는 부분). rects는 쪽 크기 대비 0~1 좌표
create table if not exists public.marks (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  book_id     uuid not null references public.books(id) on delete cascade,
  page_no     int  not null,
  rects       jsonb not null,
  text        text not null check (length(btrim(text)) > 0),
  concept_id  uuid references public.concepts(id) on delete set null,
  created_at  timestamptz default now()
);
create index if not exists marks_page on public.marks (user_id, book_id, page_no);

-- 5) 개념별 성적 + 복습 간격 (study_state + daily_digest 합친 것)
create table if not exists public.concept_stats (
  concept_id      uuid primary key references public.concepts(id) on delete cascade,
  user_id         text not null,
  correct         int not null default 0,
  total           int not null default 0,
  streak          int not null default 0,
  due_at          timestamptz not null default now(),
  last_practiced  timestamptz
);

-- 6) 문제. answer는 reveal 전엔 비어 있음(먼저 풀게)
create table if not exists public.problems (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  concept_id   uuid not null references public.concepts(id) on delete cascade,
  stem         text not null,
  grounding    jsonb not null,     -- [{id:'p12', source:'책 p.12', text:'...'}]
  stem_cites   jsonb not null default '[]',
  answer       jsonb,              -- {model_answer, explanation, cites}
  revealed_at  timestamptz,
  created_at   timestamptz default now()
);

-- 7) 풀이. auto_suggest는 참고, final_verdict만 성적에 반영
create table if not exists public.attempts (
  id             uuid primary key default gen_random_uuid(),
  problem_id     uuid not null references public.problems(id) on delete cascade,
  user_id        text not null,
  my_answer      text not null,
  auto_suggest   jsonb,
  final_verdict  text check (final_verdict in ('correct','wrong')),
  created_at     timestamptz default now()
);

-- 8) 웹 푸시 구독
create table if not exists public.push_subs (
  id        uuid primary key default gen_random_uuid(),
  user_id   text not null,
  endpoint  text not null unique,
  sub       jsonb not null,
  created_at timestamptz default now()
);

-- 보안: v17과 같이 RLS 켜고 정책 없음 → 서버(service_role)만 접근
alter table public.books         enable row level security;
alter table public.pages         enable row level security;
alter table public.concepts      enable row level security;
alter table public.marks         enable row level security;
alter table public.concept_stats enable row level security;
alter table public.problems      enable row level security;
alter table public.attempts      enable row level security;
alter table public.push_subs     enable row level security;

-- 비공개 버킷
insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;
