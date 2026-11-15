create table public.notes (id bigint primary key generated always as identity, title text not null);
insert into public.notes(title) values ('Today I created a Supabase project.'), ('I added some data and queried it from Next.js.'), ('It was awesome!');
alter table public.notes enable row level security;
