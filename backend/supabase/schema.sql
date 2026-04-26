create table if not exists public.users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'user',
  nickname text not null unique,
  status text not null default 'pending',
  email_confirmed boolean not null default false,
  email_confirmed_at timestamptz,
  access_restricted_until timestamptz,
  access_restriction_reason text not null default '',
  language text not null default 'ru',
  data jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  last_online_at timestamptz,
  last_ip text,
  last_device_id text,
  last_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users(role);
create index if not exists users_status_idx on public.users(status);
create index if not exists users_access_restricted_until_idx on public.users(access_restricted_until);

create table if not exists public.user_sessions (
  session_id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  ip text not null default '',
  device_id text not null default '',
  fingerprint text not null default '',
  user_agent text not null default '',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  is_active boolean not null default true,
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_sessions_user_active_idx on public.user_sessions(user_id, is_active, started_at desc);
create index if not exists user_sessions_ip_started_idx on public.user_sessions(ip, started_at desc);

create table if not exists public.auth_events (
  id bigserial primary key,
  user_id text references public.users(id) on delete set null,
  email text not null default '',
  event_type text not null,
  result text not null default 'success',
  reason text,
  ip text not null default '',
  user_agent text not null default '',
  device_id text not null default '',
  fingerprint text not null default '',
  session_id text not null default '',
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_events_created_at_idx on public.auth_events(created_at desc);
create index if not exists auth_events_event_type_created_at_idx on public.auth_events(event_type, created_at desc);
create index if not exists auth_events_email_created_at_idx on public.auth_events(email, created_at desc);
create index if not exists auth_events_user_created_at_idx on public.auth_events(user_id, created_at desc);

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

create table if not exists public.referrals (
  id bigserial primary key,
  inviter_id text not null references public.users(id) on delete cascade,
  invitee_id text not null references public.users(id) on delete cascade,
  code text not null,
  invitee_ip text,
  invitee_fingerprint text,
  bonus_granted boolean not null default false,
  confirmed_at timestamptz,
  status text not null default 'pending',
  checked_at timestamptz,
  check_reason text,
  active_since timestamptz,
  activity_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitee_id)
);

create index if not exists referrals_code_inviter_idx on public.referrals(code, inviter_id);
create index if not exists referrals_status_confirmed_idx on public.referrals(status, confirmed_at);
create index if not exists referrals_inviter_created_idx on public.referrals(inviter_id, created_at desc);

create table if not exists public.transactions (
  id bigserial primary key,
  user_id text not null references public.users(id) on delete cascade,
  type text not null,
  direction text not null,
  amount numeric not null,
  currency text not null default 'K',
  description text,
  related_entity text,
  status text not null default 'completed',
  occurred_at timestamptz not null default now(),
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_occurred_idx on public.transactions(user_id, occurred_at desc);
create index if not exists transactions_type_occurred_idx on public.transactions(type, occurred_at desc);

create table if not exists public.activity_logs (
  id bigserial primary key,
  user_id text not null references public.users(id) on delete cascade,
  type text not null,
  minutes numeric not null default 0,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activity_logs_user_created_at_idx on public.activity_logs(user_id, created_at desc);
create index if not exists activity_logs_user_type_created_at_idx on public.activity_logs(user_id, type, created_at desc);

create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);
create index if not exists activity_logs_type_created_at_idx on public.activity_logs(type, created_at desc);
create index if not exists activity_logs_solar_share_recipient_idx on public.activity_logs((meta->>'recipientId')) where type = 'solar_share';

create table if not exists public.entities (
  id bigserial primary key,
  user_id text not null references public.users(id) on delete cascade,
  name text,
  stage int not null default 1,
  mood text not null default 'neutral',
  avatar_url text,
  satiety_until timestamptz,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists entities_user_id_idx on public.entities(user_id);

create table if not exists public.wishes (
  id text primary key,
  author_id text not null references public.users(id) on delete cascade,
  text text not null,
  status text not null default 'open',
  support_count int not null default 0,
  support_sc numeric not null default 0,
  language text,
  cost_sc numeric not null default 100,
  executor_id text references public.users(id) on delete set null,
  executor_contact text,
  taken_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wishes_author_created_idx on public.wishes(author_id, created_at desc);
create index if not exists wishes_executor_taken_idx on public.wishes(executor_id, taken_at desc);
create index if not exists wishes_status_created_idx on public.wishes(status, created_at desc);

create table if not exists public.solar_charges (
  id bigserial primary key,
  user_id text not null references public.users(id) on delete cascade,
  current_lm numeric not null default 0,
  capacity_lm numeric not null default 100,
  last_collected_at timestamptz,
  next_available_at timestamptz,
  total_collected_lm numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists solar_charges_user_id_idx on public.solar_charges(user_id);
create index if not exists solar_charges_next_available_at_idx on public.solar_charges(next_available_at);

create table if not exists public.chats (
  id text primary key,
  participants text[] not null default array[]::text[],
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration int not null default 0,
  messages_count jsonb not null default '{}'::jsonb,
  ratings jsonb not null default '[]'::jsonb,
  hidden_for text[] not null default array[]::text[],
  complaint jsonb,
  sc_awarded boolean not null default false,
  waiting_state jsonb,
  disconnection_count jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_status_idx on public.chats(status);
create index if not exists chats_participants_gin_idx on public.chats using gin(participants);
create index if not exists chats_created_at_idx on public.chats(created_at desc);

create table if not exists public.chat_messages (
  id text primary key,
  chat_id text not null references public.chats(id) on delete cascade,
  sender_id text not null references public.users(id) on delete cascade,
  original_text text not null,
  translated_text text,
  original_lang text,
  target_lang text,
  status text not null default 'sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_messages_chat_created_idx on public.chat_messages(chat_id, created_at asc);
create index if not exists chat_messages_sender_created_idx on public.chat_messages(sender_id, created_at desc);

create table if not exists public.battle_runtime_entries (
  model text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (model, id)
);

create index if not exists battle_runtime_entries_model_updated_idx on public.battle_runtime_entries(model, updated_at asc);
create index if not exists battle_runtime_entries_expires_at_idx on public.battle_runtime_entries(expires_at);

create table if not exists public.personal_luck_claims (
  claim_id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  date_key text not null,
  claimed_at timestamptz not null default now(),
  amount numeric not null default 0,
  reward_label text not null default '',
  currency text not null default 'K',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date_key)
);

create index if not exists personal_luck_claims_user_date_idx on public.personal_luck_claims(user_id, date_key);

