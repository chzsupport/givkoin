import type { LocalizedText } from '@/i18n/localizedContent';
import { normalizeSiteLanguage, type SiteLanguage } from '@/i18n/siteLanguage';

export type AchievementGroup = 'general' | 'spiritual';

export type AchievementCatalogItem = {
  id: number;
  title: string;
  description: string;
  imageSrc: string;
  group: AchievementGroup;
};

type LocalizedAchievementCatalogItem = {
  id: number;
  title: LocalizedText;
  description: LocalizedText;
  imageSrc: string;
  group: AchievementGroup;
};

type ParsedAchievementLine = {
  id: number;
  title: string;
  description: string;
};

const RAW_GENERAL_ACHIEVEMENTS_RU = `1→Первая Искра — Нанести свой первый урон Мраку.
2→Защитник Ветви — Нанести более 100,000 урона за один бой.
3→Гроза Тени — Нанести более 500,000 урона за один бой.
4→Светоносный Титан — Нанести более 1,000,000 урона за один бой.
5→Ритм Света — Провести весь бой, используя только «Базовое оружие».
6→Точечный Удар — Нанести урон только по «Слабым зонам» Мрака (минимум 10 раз).
7→Прилив Сил — Использовать «Усиленный удар» 10 раз за бой.
8→Гнев Мироздания — Использовать «Мощнейший удар» (Ульту) 5 раз за бой.
9→Стабильность — Не прекращать клики более чем на 3 секунды в течение всего боя.
10→Мастер Перегрузки — Потратить все Люмены на «Ульту» в первые 2 минуты боя.
11→Последний Вздох — Нанести решающие 10,000 урона на последней минуте боя.
12→Экономный Боец — Занять место в топ-100, используя только базовую атаку.
13→Разрушитель Оков — Использовать все три вида оружия минимум по 10 попаданий за бой.
14→Ярость Листочка — Нанести урон, превышающий средний урон по вашей ветви в 2 раза.
15→Хирургическая точность — Ни одного клика мимо Мрака за весь бой.
16→Стена Света — Нанести 10,000+ урона только «Усиленным ударом».
17→Тяжелая Артиллерия — Использовать только «Мощнейшие удары» (когда есть Lm).
18→Несгибаемый — Нанести более 200,000 урона, когда Люмены уже закончились (штрафной урон).
19→Полный Бак — Войти в бой с максимальным запасом Люменов (72,000 Lm).
20→До последней капли — Закончить бой с 0 Lm в запасе.
21→Ловец Искр — Собрать 10 энергетических сфер (Искр) за один бой.
22→Энергофил — Собрать Искру, когда запас Lm почти полон.
23→Рисковый маневр — Собрать Искру, имея активное комбо x2.0.
24→Батарейка Древа — Потратить более 10,000 Lm за один бой.
25→Энергетический Магнат — Потратить более 50,000 Lm за один бой.
26→Второе дыхание — Выйти из боя, зарядиться «Солнечным зарядом» и вернуться в тот же бой.
27→Альтруист боя — Получить подарок Люменов от другого игрока прямо во время сражения.
28→Сияющий донор — Раздать Люмены 5 раз сразу после окончания боя.
29→Начало Потока — Достичь комбо x1.2.
30→В Потоке — Достичь комбо x1.5.
31→Абсолютный Резонанс — Достичь и удержать комбо x2.0 в течение 2 минут.
32→Неудержимый — Совершить 500 кликов без потери комбо.
33→Мастер Комбо — Совершить 1000 кликов без потери комбо.
34→Феникс — Потерять комбо x2.0 и снова разогнать его до x2.0 за один бой.
35→Быстрая рука — Достичь комбо x1.5 в первые 30 секунд боя.
36→Стальные Нервы — Ни разу не ошибиться в командах «Голоса Мрака» за бой.
37→Тишина в ответ — Успешно замереть по команде «СТРЕЛЯЙ!» 5 раз.
38→Вопреки Тьме — Продолжить атаку по команде «СТОЙ!» 5 раз.
39→Иммунитет к Хаосу — Выполнить 10 команд Мрака подряд без ошибок.
40→Слышащий Истину — Распознать ловушку Мрака на последней секунде команды.
41→Душа Диалога — Провести 100+ часов общения суммарно.
42→Открытая Ладонь — Получить 20 заявок в друзья.
43→Помощник Мечтателя — Поддержать 50 желаний.
44→Ловец Света — Собрать 50 искр за один бой.
45→Дружеская Ветвь — Добавить в друзья 10 собеседников после долгого общения.
46→Плечом к плечу — Находиться в бою одновременно с 1,000+ другими игроками.
47→Братство Листьев — Находиться в бою одновременно с 10,000+ другими игроками.
48→Целитель Коры — Сразу после боя потратить Люмены на «Активное лечение» Древа.
49→Великий Лекарь — Отдать 1,000+ Lm на лечение травмы после поражения.
50→Командир Звена — Участвовать в бою вместе с 5 своими рефералами.
51→Душа Компании — Иметь 5.0 звезд душевности на момент окончания боя.
52→Ветеран Первой Волны — Участвовать в 5 боях.
53→Страж Мироздания — Участвовать в 25 боях.
54→Вечный Защитник — Участвовать в 100 боях.
55→Ночная Смена — Участвовать в бою, начавшемся между 00:00 и 05:00 по серверу.
56→Воскресный Воитель — Участвовать в бою в выходной день.
57→Марафонец — Пробыть в бою от первой до последней секунды (60 минут).
58→Молниеносная реакция — Войти в бой в первую минуту после получения Email-уведомления.
59→Наемник Света — Заработать первые 100 K за урон.
60→Богатый Улов — Заработать максимум (1,200 K) за один бой.
61→Меценат — Отправить заработанные в бою K на «Желание» другого игрока.
62→Пацифист (случайный) — Войти в бой, но не сделать ни одного клика (только базовая награда).
63→Любимчик Фортуны — Выиграть в рулетку доп. вращение сразу после победного боя.
64→Чистый Лист — Победить в бою, не имея ни одной жалобы в истории за последние 30 дней.
65→Голос Разума — Написать в «Корень Зла» сразу после тяжелого поражения Древа.
66→Строитель Будущего — Заложить камень в Мост между странами сразу после победы.
67→Вне Времени — Участвовать в бою, который был сокращен до 15 минут из-за огромной явки.
68→Финальный камень — Положить последний камень в мост и завершить его строительство.
69→Главный строитель — Стать №1 по количеству вложенных камней на одном мосту.
70→Тройка мастеров — Попасть в топ-3 строителей на одном мосту.
71→Абсолютный Созидатель — Положить финальный камень в 3 разных моста, завершив их строительство.
72→Неудержимая Серия — Победить в 5 боях подряд.
73→Постоянство Света — Делиться Люменами с другими игроками каждый день в течение 7 дней подряд.
74→Неутомимый Строитель — Участвовать в строительстве 50 завершённых мостов.
75→Мостовой Рекордсмен — Стать №1 строителем одновременно на 3 разных активных мостах.
76→Голос Сообщества — Получить 50 ответов «Да» на вопрос «Понравилось общение?» от собеседников.
77→Исполнитель Мечты — Исполнить чужое желание в «Галактике Желаний» и получить подтверждение от автора.
78→Душевный Марафон — Провести в общении с одним собеседником более 10 часов суммарно.
79→Удар Судьбы — Выиграть 100 K в рулетке 3 раза за всё время.
80→Триумф Удачи — Получить сектор «Доп. вращение» и сразу после него выиграть 50+ K.
81→Марафонец Рулетки — Использовать все 3 вращения в день на протяжении 30 дней подряд.
82→Благословение Фортуны — Получить 0.5 звезды душевности в рулетке.
83→Джекпот Пророка — Угадать 6 из 7 цифр в лотерее.
84→Властелин Лотереи — Угадать все 7 цифр в лотерее (Джекпот).
85→Двойное Попадание — Угадать 5+ цифр в лотерее дважды за всё время.
86→Исцелитель Мироздания — Отдать суммарно 10,000 Люменов на лечение травм Древа.
87→Щедрая Душа — Раздать суммарно 5,000 Люменов другим игрокам.
88→Спаситель Ветви — Исцелить травму Древа, внеся более 30% необходимого Сияния.
89→Элитный Защитник — Занять место в топ-10 по урону в бою с участием 500+ игроков.
90→Светоносец Дня — Собрать все 24 возможных заряда «Солнечного кристалла» за сутки (каждый час без пропусков).
91→Воин Света — Провести суммарно 10+ часов в боях с Мраком.
92→Мастер трех путей — Участвовать минимум в двух боях, провести 10 часов общения и заложить 20 камней.
93→Хранитель Гармонии — Получить 100 положительных оценок от собеседников.
94→Созидатель сообщества — Получить суммарно 1000 ЦП от всех активностей в ленте новостей.
95→Никогда Не Сдаваться — Вернуть звёзды душевности с 2.0 до 4.0 через позитивные действия.
96→Ритуал Перерождения — Сменить облик Сущности, пожертвовав всеми накоплениями (K, Звёзды, Люмены).
97→Создатель Легиона — Привлечь 50 активных рефералов за всё время.
98→Сеятель Света — Рефералы привлекли своих рефералов (цепочка 3+ поколений).
99→Душа Мироздания — Получить 95+ ачивок из 100.
100→Легенда Древа — Получить все 99 других ачивок и стать истинной Легендой Мироздания.`;

const RAW_GENERAL_ACHIEVEMENTS_EN = `1→First Spark — Deal your first damage to Darkness.
2→Branch Defender — Deal more than 100,000 damage in a single battle.
3→Shadowstorm — Deal more than 500,000 damage in a single battle.
4→Luminous Titan — Deal more than 1,000,000 damage in a single battle.
5→Rhythm of Light — Complete the entire battle using only the Basic Weapon.
6→Surgical Strike — Deal damage only to Darkness's weak zones at least 10 times.
7→Surge of Power — Use the Enhanced Strike 10 times in one battle.
8→Wrath of Creation — Use the Strongest Strike (Ultimate) 5 times in one battle.
9→Steadiness — Keep clicking without stopping for more than 3 seconds during the whole battle.
10→Overload Master — Spend all Lumens on the Ultimate in the first 2 minutes of the battle.
11→Last Breath — Deal the decisive 10,000 damage in the final minute of the battle.
12→Frugal Fighter — Reach the top 100 using only the basic attack.
13→Chainbreaker — Use all three weapon types for at least 10 hits each in one battle.
14→Leaf's Fury — Deal damage that is twice the average damage of your branch.
15→Surgical Precision — Do not miss Darkness a single time in the entire battle.
16→Wall of Light — Deal 10,000+ damage using only the Enhanced Strike.
17→Heavy Artillery — Use only the strongest strikes when Lumens are available.
18→Unbreakable — Deal more than 200,000 damage after your Lumens have already run out.
19→Full Tank — Enter battle with the maximum reserve of Lumens (72,000 Lm).
20→To the Last Drop — Finish the battle with 0 Lm left in reserve.
21→Spark Catcher — Collect 10 energy orbs (Sparks) in one battle.
22→Energy Glutton — Collect a Spark when your Lm reserve is almost full.
23→Risky Maneuver — Collect a Spark while an x2.0 combo is active.
24→Tree Battery — Spend more than 10,000 Lm in one battle.
25→Energy Magnate — Spend more than 50,000 Lm in one battle.
26→Second Wind — Leave a battle, recharge with Solar Charge, and return to the same battle.
27→Battle Altruist — Receive a Lumen gift from another player during battle.
28→Radiant Donor — Share Lumens 5 times right after a battle ends.
29→Beginning of the Flow — Reach an x1.2 combo.
30→In the Flow — Reach an x1.5 combo.
31→Absolute Resonance — Reach and hold an x2.0 combo for 2 minutes.
32→Unstoppable — Make 500 clicks without losing your combo.
33→Combo Master — Make 1,000 clicks without losing your combo.
34→Phoenix — Lose an x2.0 combo and build it back up to x2.0 in the same battle.
35→Quick Hand — Reach an x1.5 combo within the first 30 seconds.
36→Nerves of Steel — Make no mistakes on Darkness Voice commands during the whole battle.
37→Silent Answer — Successfully freeze on the "SHOOT!" command 5 times.
38→Against the Dark — Keep attacking on the "STOP!" command 5 times.
39→Chaos Immunity — Complete 10 Darkness commands in a row without mistakes.
40→Hearer of Truth — Recognize Darkness's trap in the final second of the command.
41→Soul of Dialogue — Spend 100+ total hours in chats.
42→Open Hand — Receive 20 friend requests.
43→Dream Helper — Support 50 wishes.
44→Light Catcher — Collect 50 Sparks in one battle.
45→Friendly Branch — Add 10 partners as friends after long conversations.
46→Shoulder to Shoulder — Be in battle together with 1,000+ other players.
47→Brotherhood of Leaves — Be in battle together with 10,000+ other players.
48→Bark Healer — Spend Lumens on active Tree healing immediately after a battle.
49→Great Healer — Donate 1,000+ Lm to heal an injury after defeat.
50→Squad Commander — Fight alongside 5 of your referrals in one battle.
51→Life of the Party — Have 5.0 soul stars at the moment the battle ends.
52→First Wave Veteran — Take part in 5 battles.
53→Guardian of Creation — Take part in 25 battles.
54→Eternal Defender — Take part in 100 battles.
55→Night Shift — Take part in a battle that starts between 00:00 and 05:00 server time.
56→Sunday Warrior — Take part in a battle on a weekend.
57→Marathoner — Stay in battle from the first second to the last for 60 minutes.
58→Lightning Reflexes — Enter a battle in the first minute after receiving an email notification.
59→Mercenary of Light — Earn your first 100 K for damage.
60→Rich Haul — Earn the maximum reward of 1,200 K in a single battle.
61→Patron — Send K earned in battle to another player's Wish.
62→Pacifist (Random) — Enter a battle but make no clicks at all, receiving only the base reward.
63→Fortune's Favorite — Win a bonus roulette spin right after a victorious battle.
64→Clean Slate — Win a battle with no complaints in your history for the last 30 days.
65→Voice of Reason — Write in the Evil Root right after a hard defeat of the Tree.
66→Builder of the Future — Place a stone in a bridge between countries right after a victory.
67→Beyond Time — Take part in a battle shortened to 15 minutes because of huge attendance.
68→Final Stone — Place the last stone in a bridge and complete its construction.
69→Chief Builder — Become the No. 1 builder by stones placed on a single bridge.
70→Master Trio — Make it into the top 3 builders on a single bridge.
71→Absolute Creator — Place the final stone in 3 different bridges and complete all of them.
72→Unstoppable Streak — Win 5 battles in a row.
73→Constancy of Light — Share Lumens with other players every day for 7 days in a row.
74→Tireless Builder — Take part in the construction of 50 completed bridges.
75→Bridge Record Holder — Be the No. 1 builder on 3 different active bridges at the same time.
76→Voice of the Community — Receive 50 "Yes" answers to "Did you enjoy the conversation?" from chat partners.
77→Dream Fulfiller — Fulfill another player's wish in the Galaxy of Wishes and receive confirmation from the author.
78→Soul Marathon — Spend more than 10 total hours talking with one chat partner.
79→Stroke of Fate — Win 100 K in roulette 3 times overall.
80→Triumph of Luck — Hit the Bonus Spin sector and then immediately win 50+ K.
81→Roulette Marathoner — Use all 3 daily spins for 30 days in a row.
82→Fortune's Blessing — Receive 0.5 soul star in roulette.
83→Prophet's Jackpot — Guess 6 out of 7 numbers in the lottery.
84→Lord of the Lottery — Guess all 7 numbers in the lottery (Jackpot).
85→Double Hit — Guess 5+ lottery numbers twice overall.
86→Healer of Creation — Donate a total of 10,000 Lumens to heal Tree injuries.
87→Generous Soul — Give away a total of 5,000 Lumens to other players.
88→Branch Savior — Heal a Tree injury by contributing more than 30% of the required Radiance.
89→Elite Defender — Reach the top 10 by damage in a battle with 500+ players.
90→Daylight Bearer — Collect all 24 possible Solar Crystal charges in one day, one every hour without missing any.
91→Warrior of Light — Spend a total of 10+ hours in battles against Darkness.
92→Master of Three Paths — Take part in at least two battles, spend 10 hours chatting, and place 20 stones.
93→Keeper of Harmony — Receive 100 positive ratings from chat partners.
94→Community Builder — Receive a total of 1000 CP from all activities in the news feed.
95→Never Surrender — Raise your soul stars back from 2.0 to 4.0 through positive actions.
96→Rite of Rebirth — Change your Entity's appearance by sacrificing all accumulated resources such as K, Stars, and Lumens.
97→Legion Founder — Attract 50 active referrals overall.
98→Sower of Light — Have your referrals attract their own referrals in a chain of 3+ generations.
99→Soul of Creation — Earn 95+ achievements out of 100.
100→Legend of the Tree — Earn all 99 other achievements and become the true Legend of Creation.`;

const SPIRITUAL_MEDITATION_LEVELS = [
  { id: 101, titleRu: 'Искатель', titleEn: 'Seeker', requiredMeditations: 10, imageIndex: 1 },
  { id: 102, titleRu: 'Наблюдатель', titleEn: 'Observer', requiredMeditations: 20, imageIndex: 2 },
  { id: 103, titleRu: 'Ученик', titleEn: 'Disciple', requiredMeditations: 30, imageIndex: 3 },
  { id: 104, titleRu: 'Адепт', titleEn: 'Adept', requiredMeditations: 40, imageIndex: 4 },
  { id: 105, titleRu: 'Воин Духа', titleEn: 'Spirit Warrior', requiredMeditations: 50, imageIndex: 5 },
  { id: 106, titleRu: 'Хранитель Равновесия', titleEn: 'Keeper of Balance', requiredMeditations: 60, imageIndex: 6 },
  { id: 107, titleRu: 'Пылающее Сердце', titleEn: 'Burning Heart', requiredMeditations: 70, imageIndex: 7 },
  { id: 108, titleRu: 'Мастер Дзен', titleEn: 'Zen Master', requiredMeditations: 80, imageIndex: 8 },
  { id: 109, titleRu: 'Властелин Воздуха', titleEn: 'Master of Air', requiredMeditations: 90, imageIndex: 9 },
  { id: 110, titleRu: 'Эфирный Путник', titleEn: 'Ether Wanderer', requiredMeditations: 100, imageIndex: 10 },
  { id: 111, titleRu: 'Ментор', titleEn: 'Mentor', requiredMeditations: 110, imageIndex: 11 },
  { id: 112, titleRu: 'Ясный Ум', titleEn: 'Clear Mind', requiredMeditations: 120, imageIndex: 12 },
  { id: 113, titleRu: 'Мудрец', titleEn: 'Sage', requiredMeditations: 130, imageIndex: 13 },
  { id: 114, titleRu: 'Третий Глаз', titleEn: 'Third Eye', requiredMeditations: 140, imageIndex: 14 },
  { id: 115, titleRu: 'Мистик', titleEn: 'Mystic', requiredMeditations: 150, imageIndex: 15 },
  { id: 116, titleRu: 'Оракул', titleEn: 'Oracle', requiredMeditations: 160, imageIndex: 16 },
  { id: 117, titleRu: 'Звездный Странник', titleEn: 'Star Wanderer', requiredMeditations: 170, imageIndex: 17 },
  { id: 118, titleRu: 'Солнечный Аватар', titleEn: 'Solar Avatar', requiredMeditations: 180, imageIndex: 18 },
  { id: 119, titleRu: 'Призрачный Дух', titleEn: 'Phantom Spirit', requiredMeditations: 190, imageIndex: 19 },
  { id: 120, titleRu: 'Хранитель Времени', titleEn: 'Keeper of Time', requiredMeditations: 200, imageIndex: 20 },
  { id: 121, titleRu: 'Абсолют', titleEn: 'Absolute', requiredMeditations: 210, imageIndex: 21 },
  { id: 122, titleRu: 'Асура', titleEn: 'Asura', requiredMeditations: 220, imageIndex: 22 },
  { id: 123, titleRu: 'Гуру', titleEn: 'Guru', requiredMeditations: 230, imageIndex: 23 },
  { id: 124, titleRu: 'Просветленный', titleEn: 'Enlightened', requiredMeditations: 240, imageIndex: 24 },
  { id: 125, titleRu: 'Бодхисаттва', titleEn: 'Bodhisattva', requiredMeditations: 250, imageIndex: 25 },
] as const;

function parseRawAchievements(rawValue: string): ParsedAchievementLine[] {
  return rawValue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)→(.+?)\s+—\s+(.+)$/);
      if (!match) return null;
      const id = Number(match[1]);
      if (!Number.isFinite(id)) return null;
      return {
        id,
        title: match[2].trim(),
        description: match[3].trim(),
      };
    })
    .filter((value): value is ParsedAchievementLine => Boolean(value));
}

function localizeItem(item: LocalizedAchievementCatalogItem, language: SiteLanguage): AchievementCatalogItem {
  return {
    id: item.id,
    title: language === 'en' ? item.title.en : item.title.ru,
    description: language === 'en' ? item.description.en : item.description.ru,
    imageSrc: item.imageSrc,
    group: item.group,
  };
}

const generalRu = parseRawAchievements(RAW_GENERAL_ACHIEVEMENTS_RU);
const generalEn = parseRawAchievements(RAW_GENERAL_ACHIEVEMENTS_EN);
const generalEnById = new Map(generalEn.map((item) => [item.id, item]));

const LOCALIZED_GENERAL_ACHIEVEMENTS: LocalizedAchievementCatalogItem[] = generalRu.map((item) => {
  const translated = generalEnById.get(item.id);
  return {
    id: item.id,
    title: {
      ru: item.title,
      en: translated?.title || item.title,
    },
    description: {
      ru: item.description,
      en: translated?.description || item.description,
    },
    imageSrc: `/achievements/${item.id}.jpeg`,
    group: 'general',
  };
});

const LOCALIZED_SPIRITUAL_ACHIEVEMENTS: LocalizedAchievementCatalogItem[] = SPIRITUAL_MEDITATION_LEVELS.map((level) => ({
  id: level.id,
  title: {
    ru: level.titleRu,
    en: level.titleEn,
  },
  description: {
    ru: `Пройти ${level.requiredMeditations} коллективных медитаций`,
    en: `Complete ${level.requiredMeditations} collective meditations`,
  },
  imageSrc: `/achivmeditation/${level.imageIndex}.jpeg`,
  group: 'spiritual',
}));

const LOCALIZED_ACHIEVEMENT_CATALOG: LocalizedAchievementCatalogItem[] = [
  ...LOCALIZED_GENERAL_ACHIEVEMENTS,
  ...LOCALIZED_SPIRITUAL_ACHIEVEMENTS,
].sort((a, b) => a.id - b.id);

const LOCALIZED_ACHIEVEMENT_CATALOG_BY_ID = new Map(
  LOCALIZED_ACHIEVEMENT_CATALOG.map((item) => [item.id, item]),
);

export function getAchievementCatalog(language: SiteLanguage | string = 'ru'): AchievementCatalogItem[] {
  const normalizedLanguage = normalizeSiteLanguage(language);
  return LOCALIZED_ACHIEVEMENT_CATALOG.map((item) => localizeItem(item, normalizedLanguage));
}

export function getGeneralAchievementCatalog(language: SiteLanguage | string = 'ru'): AchievementCatalogItem[] {
  const normalizedLanguage = normalizeSiteLanguage(language);
  return LOCALIZED_GENERAL_ACHIEVEMENTS.map((item) => localizeItem(item, normalizedLanguage));
}

export function getSpiritualAchievementCatalog(language: SiteLanguage | string = 'ru'): AchievementCatalogItem[] {
  const normalizedLanguage = normalizeSiteLanguage(language);
  return LOCALIZED_SPIRITUAL_ACHIEVEMENTS.map((item) => localizeItem(item, normalizedLanguage));
}

export const ACHIEVEMENT_CATALOG = getAchievementCatalog('ru');
export const GENERAL_ACHIEVEMENT_CATALOG = getGeneralAchievementCatalog('ru');
export const SPIRITUAL_ACHIEVEMENT_CATALOG = getSpiritualAchievementCatalog('ru');
export const ACHIEVEMENT_CATALOG_BY_ID = new Map(
  ACHIEVEMENT_CATALOG.map((item) => [item.id, item]),
);

export function getAchievementCatalogItem(achievementId: number, language: SiteLanguage | string = 'ru') {
  const safeId = Math.floor(Number(achievementId) || 0);
  const item = LOCALIZED_ACHIEVEMENT_CATALOG_BY_ID.get(safeId) || null;
  if (!item) return null;
  return localizeItem(item, normalizeSiteLanguage(language));
}
