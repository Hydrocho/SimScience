create table if not exists public.debate_rooms (
  id uuid primary key default gen_random_uuid(),
  pin text not null unique check (pin ~ '^[0-9]{6}$'),
  topic text not null default '지구 온난화 대응을 위해 개발을 제한해야 하는가?',
  teacher_email text not null,
  is_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.debate_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.debate_rooms(id) on delete cascade,
  student_id text,
  nickname text not null,
  role text not null check (role in ('student', 'ai')),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists debate_rooms_pin_idx on public.debate_rooms(pin);
create index if not exists debate_messages_room_created_idx on public.debate_messages(room_id, created_at);

alter table public.debate_rooms enable row level security;
alter table public.debate_messages enable row level security;

drop policy if exists "debate rooms are readable by room participants" on public.debate_rooms;
create policy "debate rooms are readable by room participants"
on public.debate_rooms
for select
to anon, authenticated
using (true);

drop policy if exists "debate messages are readable by room participants" on public.debate_messages;
create policy "debate messages are readable by room participants"
on public.debate_messages
for select
to anon, authenticated
using (true);
