-- SkyCoach — schema iniziale (Fase 2)

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  default_lang text not null default 'it',
  created_at timestamptz not null default now()
);

create table public.flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  -- percorso oggetto nello storage: {user_id}/{flight_id}.igc
  igc_path text not null,
  flight_date date,
  site_name text,
  duration_s int,
  distance_km numeric,
  -- FlightSummaryForAI + serie barogramma + meteo
  stats jsonb,
  -- nullable: condivisione pubblica (Fase 3)
  share_token text unique,
  created_at timestamptz not null default now()
);

create table public.debriefs (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references public.flights on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  lang text not null default 'it',
  content_md text not null,
  -- [{id, t, lat, lon}]
  anchors jsonb,
  model text,
  usage jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.flights  enable row level security;
alter table public.debriefs enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own flights" on public.flights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "shared flights readable" on public.flights
  for select using (share_token is not null);

create policy "own debriefs" on public.debriefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bucket privato per i file IGC, una cartella per utente
insert into storage.buckets (id, name, public) values ('igc', 'igc', false);

create policy "igc upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'igc' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "igc read own folder" on storage.objects
  for select using (
    bucket_id = 'igc' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "igc delete own folder" on storage.objects
  for delete using (
    bucket_id = 'igc' and (storage.foldername(name))[1] = auth.uid()::text
  );
