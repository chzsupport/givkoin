create table if not exists public.auth_signal_history (
  id bigserial primary key,
  user_id text not null references public.users(id) on delete cascade,
  event_type text not null,
  ip text not null default '',
  device_id text not null default '',
  fingerprint text not null default '',
  weak_fingerprint text not null default '',
  user_agent text not null default '',
  ip_intel jsonb,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_signal_history_user_created_at_idx on public.auth_signal_history(user_id, created_at desc);
create index if not exists auth_signal_history_fingerprint_idx on public.auth_signal_history(fingerprint, created_at desc);
create index if not exists auth_signal_history_weak_fingerprint_idx on public.auth_signal_history(weak_fingerprint, created_at desc);
create index if not exists auth_signal_history_device_idx on public.auth_signal_history(device_id, created_at desc);
create index if not exists auth_signal_history_ip_idx on public.auth_signal_history(ip, created_at desc);
