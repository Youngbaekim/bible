-- 원어 분석 AI 직역 결과 저장(한 번 만든 절은 다시 만들지 않음)
create table if not exists public.bible_ai_cache (
  key        text primary key,          -- 예: grc:john:1:1 / heb:genesis:1:1
  data       jsonb not null,            -- {ko, en, words:[...], note}
  model      text,
  created_at timestamptz not null default now()
);
alter table public.bible_ai_cache enable row level security;
-- 읽기: 로그인한 사용자. 쓰기: Edge Function(service role)만
drop policy if exists "read ai cache" on public.bible_ai_cache;
create policy "read ai cache" on public.bible_ai_cache for select to authenticated using (true);
