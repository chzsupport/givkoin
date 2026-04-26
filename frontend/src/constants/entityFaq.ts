import type { LocalizedText } from '@/i18n/localizedContent';

export type EntityFaqItem = {
  q: LocalizedText;
  a: LocalizedText;
};

export const ENTITY_FAQ: EntityFaqItem[] = [
  {
    q: {
      ru: 'Что такое GIVKOIN?',
      en: 'What is GIVKOIN?',
    },
    a: {
      ru: 'GIVKOIN — это социальная сеть с игровыми механиками. Игроки общаются, развивают профиль, участвуют в активностях и вместе защищают Древо Мироздания от Мрака. Здесь ценятся не только результаты, но и вклад в сообщество.',
      en: 'GIVKOIN is a social network with game mechanics. Players chat, develop their profile, take part in activities, and together protect the Tree of Creation from Darkness. Here, not only results matter, but also your contribution to the community.',
    },
  },
  {
    q: {
      ru: 'Что такое Отражение Души (Сущность)?',
      en: 'What is Soul Reflection (Entity)?',
    },
    a: {
      ru: 'Сущность — ваш персональный спутник в GIVKOIN. Она отражает вашу активность и состояние, влияет на часть бонусов и является частью вашего прогресса в проекте.',
      en: 'The Entity is your personal companion in GIVKOIN. It reflects your activity and state, influences some bonuses, and is part of your progress in the project.',
    },
  },
  {
    q: {
      ru: 'Как создать или сменить Сущность?',
      en: 'How do I create or change my Entity?',
    },
    a: {
      ru: 'Создание доступно в правой верхней боковой панели на главной странице с Древом (вкладка Отражения Души). Смена Сущности доступна раз в 7 дней и подтверждается отдельно. Важно: при смене происходит полное обнуление ключевых ресурсов (жизни, K, звезды, фишки, люмены).',
      en: 'Creation is available from the upper-right side panel on the main Tree page (the Soul Reflection tab). You can change your Entity once every 7 days, with separate confirmation. Important: changing it fully resets key resources such as lives, K, stars, chips, and lumens.',
    },
  },
  {
    q: {
      ru: 'Почему у Сущности разное настроение?',
      en: 'Why does the Entity have different moods?',
    },
    a: {
      ru: 'Настроение рассчитывается по вашей активности за последние 7 дней: базовые действия (солнечный заряд, поиск собеседника, полноценные чаты, новости), дополнительные активности (бои, лечение Древа, мосты и др.), а также с учетом нарушений и дебаффов.',
      en: 'Its mood is calculated from your activity over the last 7 days: basic actions like solar charge, partner search, full chats, and news, extra activities like battles, Tree healing, bridges, and more, plus violations and debuffs.',
    },
  },
  {
    q: {
      ru: 'Что дает сытость Сущности?',
      en: 'What does Entity satiety do?',
    },
    a: {
      ru: 'Сытая Сущность дает +10% к Сиянию и позволяет удерживать радостное состояние. Если Сущность голодная, радость недоступна: настроение ограничивается до спокойного или ниже.',
      en: 'A fed Entity gives +10% Radiance and lets it stay joyful. If the Entity is hungry, joy is unavailable, and its mood is capped at calm or lower.',
    },
  },
  {
    q: {
      ru: 'Как кормить Сущность?',
      en: 'How do I feed the Entity?',
    },
    a: {
      ru: 'Корм покупается в магазине и применяется из склада. Доступны варианты сытости на 24, 72 и 168 часов. Пока действует текущая сытость, повторное кормление заблокировано.',
      en: 'Food is bought in the shop and used from the warehouse. Satiety options for 24, 72, and 168 hours are available. While the current satiety is active, feeding again is blocked.',
    },
  },
  {
    q: {
      ru: 'Что такое K (Givkoin koins)?',
      en: 'What is K (Givkoin koins)?',
    },
    a: {
      ru: 'K — основная игровая валюта GIVKOIN. Она начисляется за активность в проекте и тратится на разные внутриигровые действия: от участия в активностях до отдельных механик прогресса.',
      en: 'K is the main in-game currency of GIVKOIN. It is earned through activity in the project and spent on many in-game actions, from joining activities to separate progression mechanics.',
    },
  },
  {
    q: {
      ru: 'Что такое Люмены (Lm)?',
      en: 'What are Lumens (Lm)?',
    },
    a: {
      ru: 'Люмены — энергетический ресурс. Их собирают через Солнечный Заряд, тратят в боевой системе, передают другим игрокам для помощи и используют для лечения Древа в случае травмы. Это один из ключевых ресурсов командного вклада.',
      en: 'Lumens are an energy resource. They are collected through Solar Charge, spent in battle, transferred to other players for help, and used to heal the Tree after an injury. This is one of the key resources of team contribution.',
    },
  },
  {
    q: {
      ru: 'Что такое Звезды Душевности?',
      en: 'What are Soul Stars?',
    },
    a: {
      ru: 'Звезды — репутационный показатель игрока (от 0.001 до 5.0). Растут за здоровое общение и полезные действия, а низкие значения сигнализируют о проблемах в поведении и могут ограничивать возможности.',
      en: 'Stars are a player reputation score from 0.001 to 5.0. They grow through healthy communication and useful actions, while low values signal behavior problems and can limit your opportunities.',
    },
  },
  {
    q: {
      ru: 'Что такое Сияние?',
      en: 'What is Radiance?',
    },
    a: {
      ru: 'Сияние начисляется за многие действия, но не хранится на личном балансе. Оно автоматически уходит в общий фонд Древа и используется для восстановления после урона в боях.',
      en: 'Radiance is granted for many actions, but it is not stored in your personal balance. It automatically goes into the shared Tree fund and is used to restore damage after battles.',
    },
  },
  {
    q: {
      ru: 'Как работает боевая система?',
      en: 'How does the battle system work?',
    },
    a: {
      ru: 'Мрак появляется внезапно, без заранее объявленного расписания. Когда возникает угроза, игроки объединяются для защиты Древа: тратят люмены на атаки, поддерживают друг друга и получают награды за вклад. Исход боя напрямую влияет на состояние Древа.',
      en: 'Darkness appears suddenly, without a pre-announced schedule. When a threat arises, players unite to defend the Tree: they spend Lumens on attacks, support one another, and receive rewards for their contribution. The outcome of each battle directly affects the state of the Tree.',
    },
  },
  {
    q: {
      ru: 'Как устроено общение в GIVKOIN?',
      en: 'How does communication work in GIVKOIN?',
    },
    a: {
      ru: 'Вы запускаете поиск собеседника, система подбирает пару, после чата можно поставить оценку, отправить жалобу при нарушениях и добавить человека в друзья. Минимальное время общения с новым человеком — 5 минут. Перед началом диалога отображаются правила, которые желательно соблюдать для взаимного уважения.',
      en: 'You start a partner search, the system picks a match, and after the chat you can leave a rating, send a complaint if there was a violation, and add the person as a friend. The minimum chat time with a new person is 5 minutes. Before the dialogue starts, rules are shown and are meant to be followed for mutual respect.',
    },
  },
  {
    q: {
      ru: 'Что такое Жизни и Фишки жалоб?',
      en: 'What are Lives and Complaint Chips?',
    },
    a: {
      ru: 'Жизни определяют доступ к чатам: при досрочном выходе они теряются. Фишки жалоб — лимит на подачу репортов о нарушениях. Эти ресурсы нужны для баланса между свободой общения и ответственностью.',
      en: 'Lives determine access to chats: if you leave early, you lose them. Complaint Chips are the limit for sending reports about violations. These resources keep a balance between freedom of communication and responsibility.',
    },
  },
  {
    q: {
      ru: 'Что дают достижения?',
      en: 'What do achievements give?',
    },
    a: {
      ru: 'Достижения фиксируют ваш реальный прогресс в разных стилях игры: социальном, боевом, исследовательском и других. За открытие достижений даются награды, а некоторые из них завязаны на редкие сценарии поведения.',
      en: 'Achievements record your real progress across different play styles: social, combat, exploratory, and others. Rewards are granted for unlocking them, and some are tied to rare behavior scenarios.',
    },
  },
  {
    q: {
      ru: 'Зачем развивать профиль в GIVKOIN?',
      en: 'Why develop your profile in GIVKOIN?',
    },
    a: {
      ru: 'Чтобы открывать больше возможностей, влиять на командный результат и усиливать личную экономику аккаунта. Чем стабильнее вклад в активность, тем сильнее ваш долгосрочный прогресс.',
      en: 'To unlock more possibilities, influence team results, and strengthen your personal account economy. The more stable your contribution to activities is, the stronger your long-term progress becomes.',
    },
  },
];
