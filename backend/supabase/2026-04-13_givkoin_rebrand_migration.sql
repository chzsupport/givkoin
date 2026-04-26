create or replace function public.replace_givkoin_text(input_text text)
returns text
language plpgsql
immutable
as $$
declare
  result_text text := coalesce(input_text, '');
  old_brand_upper constant text := chr(83) || chr(86) || chr(65) || chr(76) || chr(85) || chr(66) || chr(73) || chr(65);
  old_brand_title constant text := chr(83) || chr(118) || chr(97) || chr(108) || chr(117) || chr(98) || chr(105) || chr(97);
  old_brand_lower constant text := lower(old_brand_title);
  old_currency constant text := chr(83) || chr(67);
  old_domain constant text := old_brand_lower || '.com';
  site_rule_keys constant text[] := array[
    'PAGE_ABOUT',
    'PAGE_ROADMAP_HTML',
    'RULES_BATTLE',
    'RULES_SITE',
    'RULES_COMMUNICATION'
  ];
begin
  result_text := replace(result_text, old_brand_upper || ' COIN', 'GIVKOIN KOIN');
  result_text := replace(result_text, old_brand_title || ' Coins', 'Givkoin koins');
  result_text := replace(result_text, old_brand_title || ' Coin', 'Givkoin koin');
  result_text := replace(result_text, old_brand_lower, 'givkoin');
  result_text := replace(result_text, old_brand_upper, 'GIVKOIN');
  result_text := replace(result_text, old_brand_title, 'Givkoin');
  result_text := replace(result_text, old_currency || ' (Coin)', 'K (koin)');
  result_text := regexp_replace(result_text, '(^|[^A-Za-z_])' || old_currency || '([^A-Za-z_]|$)', '\1K\2', 'g');
  return result_text;
end;
$$;

do $$
declare
  old_brand_lower constant text := lower(chr(83) || chr(118) || chr(97) || chr(108) || chr(117) || chr(98) || chr(105) || chr(97));
  old_domain_pattern constant text := '@' || old_brand_lower || '\.com$';
  page_keys constant text[] := array[
    'PAGE_ABOUT',
    'PAGE_ROADMAP_HTML',
    'RULES_BATTLE',
    'RULES_SITE',
    'RULES_COMMUNICATION'
  ];
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'transactions'
  ) then
    update public.transactions
    set currency = 'K'
    where currency = chr(83) || chr(67);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'personal_luck_claims'
  ) then
    update public.personal_luck_claims
    set currency = 'K'
    where currency = chr(83) || chr(67);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'users'
  ) then
    update public.users
    set email = regexp_replace(email, old_domain_pattern, '@givkoin.com', 'i'),
        updated_at = now()
    where role = 'admin'
      and email ~* old_domain_pattern;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'app_documents'
  ) then
    update public.app_documents
    set data = jsonb_set(
          data,
          '{email}',
          to_jsonb(regexp_replace(coalesce(data->>'email', ''), old_domain_pattern, '@givkoin.com', 'i'))
        ),
        updated_at = now()
    where model = 'User'
      and lower(coalesce(data->>'role', '')) = 'admin'
      and coalesce(data->>'email', '') ~* old_domain_pattern;

    update public.app_documents
    set data = jsonb_set(
          data,
          '{content}',
          to_jsonb(public.replace_givkoin_text(data->>'content'))
        ),
        updated_at = now()
    where model = 'ContentPage';

    update public.app_documents
    set data = jsonb_set(
          jsonb_set(
            data,
            '{value}',
            to_jsonb(public.replace_givkoin_text(data->>'value'))
          ),
          '{description}',
          to_jsonb(public.replace_givkoin_text(data->>'description'))
        ),
        updated_at = now()
    where model = 'Settings'
      and coalesce(data->>'key', '') = any(page_keys);
  end if;
end;
$$;