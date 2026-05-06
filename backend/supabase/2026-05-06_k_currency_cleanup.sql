do $$
declare
  old_lower constant text := chr(115) || chr(99);
  old_title constant text := chr(83) || chr(99);
  old_upper constant text := chr(83) || chr(67);
  old_support_col constant text := 'support_' || old_lower;
  old_cost_col constant text := 'cost_' || old_lower;
  old_awarded_col constant text := old_lower || '_awarded';
  old_chat_boost_key constant text := 'chat' || old_title;
  old_debt_key constant text := 'rewardRollbackDebt' || old_title;
  key_pair text[];
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'wishes') then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wishes' and column_name = old_support_col) then
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wishes' and column_name = 'support_k') then
        execute format('update public.wishes set support_k = coalesce(support_k, 0) + coalesce(%1$I, 0) where coalesce(support_k, 0) = 0 and coalesce(%1$I, 0) <> 0', old_support_col);
        execute format('alter table public.wishes drop column %I', old_support_col);
      else
        execute format('alter table public.wishes rename column %I to support_k', old_support_col);
      end if;
    elsif not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wishes' and column_name = 'support_k') then
      alter table public.wishes add column support_k numeric not null default 0;
    end if;

    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wishes' and column_name = old_cost_col) then
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wishes' and column_name = 'cost_k') then
        execute format('update public.wishes set cost_k = coalesce(cost_k, 0) + coalesce(%1$I, 0) where coalesce(cost_k, 0) = 0 and coalesce(%1$I, 0) <> 0', old_cost_col);
        execute format('alter table public.wishes drop column %I', old_cost_col);
      else
        execute format('alter table public.wishes rename column %I to cost_k', old_cost_col);
      end if;
    elsif not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wishes' and column_name = 'cost_k') then
      alter table public.wishes add column cost_k numeric not null default 100;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chats') then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chats' and column_name = old_awarded_col) then
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chats' and column_name = 'k_awarded') then
        execute format('update public.chats set k_awarded = coalesce(k_awarded, false) or coalesce(%1$I, false)', old_awarded_col);
        execute format('alter table public.chats drop column %I', old_awarded_col);
      else
        execute format('alter table public.chats rename column %I to k_awarded', old_awarded_col);
      end if;
    elsif not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chats' and column_name = 'k_awarded') then
      alter table public.chats add column k_awarded boolean not null default false;
    end if;
  end if;

  foreach key_pair slice 1 in array array[
    array[old_lower, 'k'],
    array[old_debt_key, 'rewardRollbackDebtK']
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
      execute format(
        'update public.users set data = case when data ? %2$L then data - %1$L else (data - %1$L) || jsonb_build_object(%2$L, data -> %1$L) end, updated_at = now() where data ? %1$L',
        key_pair[1],
        key_pair[2]
      );
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_documents') then
      execute format(
        'update public.app_documents set data = case when data ? %2$L then data - %1$L else (data - %1$L) || jsonb_build_object(%2$L, data -> %1$L) end, updated_at = now() where model = %3$L and data ? %1$L',
        key_pair[1],
        key_pair[2],
        'User'
      );
    end if;
  end loop;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
    execute format(
      'update public.users set data = jsonb_set(data, %2$L, case when coalesce(data->%3$L, %4$L::jsonb) ? %5$L then coalesce(data->%3$L, %4$L::jsonb) - %1$L else (coalesce(data->%3$L, %4$L::jsonb) - %1$L) || jsonb_build_object(%5$L, coalesce(data->%3$L, %4$L::jsonb) -> %1$L) end, true), updated_at = now() where coalesce(data->%3$L, %4$L::jsonb) ? %1$L',
      old_chat_boost_key,
      '{shopBoosts}',
      'shopBoosts',
      '{}',
      'chatK'
    );

    execute format(
      'update public.users set data = jsonb_set(data, %2$L, case when coalesce(data #> %3$L, %4$L::jsonb) ? %5$L then coalesce(data #> %3$L, %4$L::jsonb) - %1$L else (coalesce(data #> %3$L, %4$L::jsonb) - %1$L) || jsonb_build_object(%5$L, coalesce(data #> %3$L, %4$L::jsonb) -> %1$L) end, true), updated_at = now() where coalesce(data #> %3$L, %4$L::jsonb) ? %1$L',
      old_lower,
      '{nightShift,stats,totalEarnings}',
      '{nightShift,stats,totalEarnings}',
      '{}',
      'k'
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_documents') then
    execute format(
      'update public.app_documents set data = jsonb_set(data, %2$L, case when coalesce(data->%3$L, %4$L::jsonb) ? %5$L then coalesce(data->%3$L, %4$L::jsonb) - %1$L else (coalesce(data->%3$L, %4$L::jsonb) - %1$L) || jsonb_build_object(%5$L, coalesce(data->%3$L, %4$L::jsonb) -> %1$L) end, true), updated_at = now() where model = %6$L and coalesce(data->%3$L, %4$L::jsonb) ? %1$L',
      old_chat_boost_key,
      '{shopBoosts}',
      'shopBoosts',
      '{}',
      'chatK',
      'User'
    );

    execute format(
      'update public.app_documents set data = jsonb_set(data, %2$L, case when coalesce(data #> %3$L, %4$L::jsonb) ? %5$L then coalesce(data #> %3$L, %4$L::jsonb) - %1$L else (coalesce(data #> %3$L, %4$L::jsonb) - %1$L) || jsonb_build_object(%5$L, coalesce(data #> %3$L, %4$L::jsonb) -> %1$L) end, true), updated_at = now() where model = %6$L and coalesce(data #> %3$L, %4$L::jsonb) ? %1$L',
      old_lower,
      '{nightShift,stats,totalEarnings}',
      '{nightShift,stats,totalEarnings}',
      '{}',
      'k',
      'User'
    );

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
      foreach key_pair slice 1 in array array[
        array['totalNews' || old_title || 'Earned', 'totalNewsKEarned'],
        array['totalRoulette100' || old_title || 'Wins', 'totalRoulette100KWins'],
        array['lastBattle' || old_title || 'Earned', 'lastBattleKEarned']
      ]
      loop
        execute format(
          'update public.users set data = jsonb_set(data, %3$L, case when coalesce(data #> %3$L, %4$L::jsonb) ? %2$L then coalesce(data #> %3$L, %4$L::jsonb) - %1$L else (coalesce(data #> %3$L, %4$L::jsonb) - %1$L) || jsonb_build_object(%2$L, coalesce(data #> %3$L, %4$L::jsonb) -> %1$L) end, true), updated_at = now() where coalesce(data #> %3$L, %4$L::jsonb) ? %1$L',
          key_pair[1],
          key_pair[2],
          '{achievementStats}',
          '{}'
        );
      end loop;
    end if;

    foreach key_pair slice 1 in array array[
      array['totalNews' || old_title || 'Earned', 'totalNewsKEarned'],
      array['totalRoulette100' || old_title || 'Wins', 'totalRoulette100KWins'],
      array['lastBattle' || old_title || 'Earned', 'lastBattleKEarned']
    ]
    loop
      execute format(
        'update public.app_documents set data = jsonb_set(data, %3$L, case when coalesce(data #> %3$L, %4$L::jsonb) ? %2$L then coalesce(data #> %3$L, %4$L::jsonb) - %1$L else (coalesce(data #> %3$L, %4$L::jsonb) - %1$L) || jsonb_build_object(%2$L, coalesce(data #> %3$L, %4$L::jsonb) -> %1$L) end, true), updated_at = now() where model = %5$L and coalesce(data #> %3$L, %4$L::jsonb) ? %1$L',
        key_pair[1],
        key_pair[2],
        '{achievementStats}',
        '{}',
        'User'
      );
    end loop;

    foreach key_pair slice 1 in array array[
      array['CHAT_' || old_upper || '_PER_HOUR', 'CHAT_K_PER_HOUR'],
      array[old_upper || '_PER_HOUR_CHAT', 'K_PER_HOUR_CHAT'],
      array[old_upper || '_APPEAL_COMPENSATION', 'K_APPEAL_COMPENSATION']
    ]
    loop
      execute format(
        'update public.app_documents set data = jsonb_set(data, %3$L, to_jsonb(%2$L::text), true), updated_at = now() where model = %4$L and data->>%5$L = %1$L',
        key_pair[1],
        key_pair[2],
        '{key}',
        'Settings',
        'key'
      );
    end loop;

    execute format(
      'update public.app_documents set data = jsonb_set(data, %2$L, to_jsonb(%3$L::text), true), updated_at = now() where model = %4$L and data->>%5$L = %1$L',
      old_lower,
      '{rewardType}',
      'k',
      'FortuneWinLog',
      'rewardType'
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_logs') then
    foreach key_pair slice 1 in array array[
      array['earned' || old_title, 'earnedK'],
      array['reward' || old_title, 'rewardK'],
      array[old_lower || 'Award', 'kAward'],
      array['amount' || old_title, 'amountK']
    ]
    loop
      execute format(
        'update public.activity_logs set meta = case when meta ? %2$L then meta - %1$L else (meta - %1$L) || jsonb_build_object(%2$L, meta -> %1$L) end where meta ? %1$L',
        key_pair[1],
        key_pair[2]
      );
    end loop;

    execute format(
      'update public.activity_logs set meta = jsonb_set(meta, %2$L, to_jsonb(%3$L::text), true) where meta->>%4$L = %1$L',
      old_lower,
      '{rewardType}',
      'k',
      'rewardType'
    );
  end if;
end;
$$;
