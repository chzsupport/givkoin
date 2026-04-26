create table if not exists public.app_documents (
  model text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (model, id)
);

create index if not exists app_documents_model_idx on public.app_documents (model);

-- Commonly used access patterns in this codebase:
-- 1) latest N docs by createdAt/updatedAt within a model
-- 2) pagination over a model ordered by createdAt/updatedAt
create index if not exists app_documents_model_created_at_idx on public.app_documents (model, created_at desc);
create index if not exists app_documents_model_updated_at_idx on public.app_documents (model, updated_at desc);

-- High-impact per-user/per-chat lookups (optional but recommended at scale).
-- Users: login/signup and unique checks.
create index if not exists app_documents_user_email_idx
  on public.app_documents ((data->>'email'))
  where model = 'User';

create index if not exists app_documents_user_nickname_idx
  on public.app_documents ((data->>'nickname'))
  where model = 'User';

-- Sessions: checked on almost every authenticated request.
create index if not exists app_documents_usersession_sessionid_idx
  on public.app_documents ((data->>'sessionId'))
  where model = 'UserSession';

-- Notifications: latest notifications for a given user.
create index if not exists app_documents_notification_user_created_at_idx
  on public.app_documents ((data->>'userId'), created_at desc)
  where model = 'Notification';

-- Messages: latest messages in a given chat.
create index if not exists app_documents_message_chat_created_at_idx
  on public.app_documents ((data->>'chatId'), created_at desc)
  where model = 'Message';

-- ActivityLog: recent activity by user (used in anti-fraud and analytics).
create index if not exists app_documents_activitylog_user_created_at_idx
  on public.app_documents ((data->>'user'), created_at desc)
  where model = 'ActivityLog';

-- RadianceEarning: daily limit checks and history per user.
create index if not exists app_documents_radianceearning_user_created_at_idx
  on public.app_documents ((data->>'user'), created_at desc)
  where model = 'RadianceEarning';

-- News: fast lookups for interactions, views, comments, and scheduling.
create index if not exists app_documents_newsinteraction_user_post_type_idx
  on public.app_documents ((data->>'user'), (data->>'post'), (data->>'type'))
  where model = 'NewsInteraction';

create index if not exists app_documents_newsinteraction_post_created_at_idx
  on public.app_documents ((data->>'post'), created_at desc)
  where model = 'NewsInteraction' and data->>'type' = 'comment';

create index if not exists app_documents_newsinteraction_user_date_idx
  on public.app_documents ((data->>'user'), (data->>'dateKey'))
  where model = 'NewsInteraction' and data->>'type' = 'view';

create index if not exists app_documents_newscommentwindow_user_post_idx
  on public.app_documents ((data->>'user'), (data->>'post'))
  where model = 'NewsCommentWindow';

create index if not exists app_documents_newspost_status_published_at_idx
  on public.app_documents ((data->>'status'), (data->>'publishedAt'))
  where model = 'NewsPost';

create index if not exists app_documents_newspost_status_scheduled_at_idx
  on public.app_documents ((data->>'status'), (data->>'scheduledAt'))
  where model = 'NewsPost';
