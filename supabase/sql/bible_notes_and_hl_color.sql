-- 1) 형광펜 색 열 추가
alter table public.bible_highlights add column if not exists color text;

-- 2) 절 메모(본인만 읽기·쓰기)
create table if not exists public.bible_notes (
  user_id    uuid not null default auth.uid(),
  book       text not null,
  chapter    int  not null,
  verse      int  not null,
  note       text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book, chapter, verse)
);
alter table public.bible_notes enable row level security;
drop policy if exists "own notes" on public.bible_notes;
create policy "own notes" on public.bible_notes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
