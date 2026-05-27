import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  createQuote,
  deleteQuote,
  fetchQuotes,
  updateQuote,
} from '../../api/admin';
import LanguageToggle from '../../components/LanguageToggle';
import { Card } from '../../components/ui';
import {
  getLocalizedTextValue,
  getTranslatedField,
  type ContentLanguage,
} from '../../utils/localizedContent';

type Quote = {
  _id: string;
  dayOfWeek: number;
  text?: unknown;
  author?: unknown;
  translations?: unknown;
};

type QuoteForm = {
  text: string;
  author: string;
  enText: string;
  enAuthor: string;
};

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

const weekDays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function getApiErrorMessage(error: unknown, fallback: string) {
  return (error as ApiError)?.response?.data?.message || fallback;
}

function getTodayIndex() {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export function QuotesManagement() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');
  const [form, setForm] = useState<QuoteForm>({ text: '', author: '', enText: '', enAuthor: '' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchQuotes();
      setQuotes(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getQuoteForDay = (dayIndex: number) => {
    return quotes.find(q => q.dayOfWeek === dayIndex);
  };

  const handleEdit = (dayIndex: number) => {
    const quote = getQuoteForDay(dayIndex);
    if (quote) {
      const text = getTranslatedField(quote.text, quote.translations, 'text');
      const author = getTranslatedField(quote.author || '', quote.translations, 'author');
      setForm({
        text: text.ru,
        author: author.ru,
        enText: text.en,
        enAuthor: author.en,
      });
    } else {
      setForm({ text: '', author: '', enText: '', enAuthor: '' });
    }
    setEditingDay(dayIndex);
  };

  const handleSave = async () => {
    if (!form.text.trim()) {
      alert('Введите текст цитаты');
      return;
    }

    if (editingDay === null) {
      return;
    }

    try {
      const existingQuote = getQuoteForDay(editingDay);
      const payload = {
        text: form.text,
        author: form.author || '',
        translations: {
          en: {
            text: form.enText || '',
            author: form.enAuthor || '',
          },
        },
      };

      if (existingQuote) {
        await updateQuote(existingQuote._id, payload);
      } else {
        await createQuote({ ...payload, dayOfWeek: editingDay });
      }

      setEditingDay(null);
      setForm({ text: '', author: '', enText: '', enAuthor: '' });
      load();
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка сохранения'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить цитату?')) return;
    try {
      await deleteQuote(id);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const todayIndex = getTodayIndex();

  return (
    <div className="space-y-6">
      <Card title="Цитаты дня" subtitle="Заполните цитаты на каждый день недели. Система автоматически покажет нужную.">
        <div className="mb-4 flex justify-end">
          <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
        </div>
        {loading ? (
          <div className="text-center py-10 text-slate-500">Загрузка...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {weekDays.map((dayName, index) => {
              const quote = getQuoteForDay(index);
              const isToday = index === todayIndex;
              const localizedText = quote ? getLocalizedTextValue(getTranslatedField(quote.text, quote.translations, 'text'), activeLanguage) : '';
              const localizedAuthor = quote ? getLocalizedTextValue(getTranslatedField(quote.author || '', quote.translations, 'author'), activeLanguage) : '';
              return (
                <div
                  key={index}
                  className={`p-4 rounded-xl border transition-all ${isToday
                    ? 'bg-cyan-500/10 border-cyan-500/30'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`font-medium ${isToday ? 'text-cyan-400' : 'text-white'}`}>
                      {dayName} {isToday && '🔥'}
                    </span>
                    <button
                      onClick={() => handleEdit(index)}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      {quote ? 'Изменить' : 'Добавить'}
                    </button>
                  </div>
                  {quote ? (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-200 line-clamp-3">{localizedText}</p>
                      {localizedAuthor && <p className="text-xs text-slate-500">— {localizedAuthor}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 italic">Цитата не добавлена</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AnimatePresence>
        {editingDay !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setEditingDay(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold text-white">
                {getQuoteForDay(editingDay) ? `Изменить цитату — ${weekDays[editingDay]}` : `Добавить цитату — ${weekDays[editingDay]}`}
              </h3>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Текст цитаты</label>
                  <textarea
                    className="input-field mt-1 min-h-[100px]"
                    value={activeLanguage === 'ru' ? form.text : form.enText}
                    onChange={(e) => setForm({
                      ...form,
                      ...(activeLanguage === 'ru' ? { text: e.target.value } : { enText: e.target.value }),
                    })}
                    placeholder="Введите цитату..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Автор (необязательно)</label>
                  <input
                    className="input-field mt-1"
                    value={activeLanguage === 'ru' ? form.author : form.enAuthor}
                    onChange={(e) => setForm({
                      ...form,
                      ...(activeLanguage === 'ru' ? { author: e.target.value } : { enAuthor: e.target.value }),
                    })}
                    placeholder="Автор цитаты"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setEditingDay(null)} className="btn-secondary flex-1">Отмена</button>
                  <button onClick={handleSave} className="btn-primary flex-1">Сохранить</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
