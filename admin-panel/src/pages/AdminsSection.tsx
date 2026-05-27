import { useEffect, useState } from 'react';

import {
  createAdminAccount,
  fetchAdmins,
  updateAdminEmail,
} from '../api/admin';
import { Card } from '../components/ui';
import { ADMIN_EMAIL_DOMAIN, isAdminEmail } from '../utils/adminEmail';

type AdminRow = {
  _id: string;
  email?: string;
  nickname?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  const e = error as { response?: { data?: { message?: string } }; message?: string };
  return e.response?.data?.message || e.message || fallback;
}

export default function AdminsSection() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createEmail, setCreateEmail] = useState('');
  const [createSeedPhrase, setCreateSeedPhrase] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const validateSeedPhrase = (value: string) => {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return words.length === 24;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdmins();
      setAdmins(Array.isArray(data?.admins) ? data.admins : []);
    } catch (e) {
      setError(getErrorMessage(e, 'Ошибка загрузки'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (admin: AdminRow) => {
    setEditingId(admin?._id || null);
    setEditingEmail(admin?.email || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingEmail('');
  };

  const saveEmail = async () => {
    if (!editingId) return;
    if (!isAdminEmail(editingEmail)) {
      setError(`Используйте email вида local@${ADMIN_EMAIL_DOMAIN} без точек/символов до @`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateAdminEmail(editingId, { email: editingEmail });
      cancelEdit();
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  const createAdmin = async () => {
    setError(null);
    const email = String(createEmail || '').trim();
    const seedPhrase = String(createSeedPhrase || '').trim();

    if (!email) {
      setError('Email обязателен');
      return;
    }
    if (!seedPhrase) {
      setError('Введите сид-фразу');
      return;
    }
    if (!isAdminEmail(email)) {
      setError(`Используйте email вида local@${ADMIN_EMAIL_DOMAIN} без точек/символов до @`);
      return;
    }
    if (!validateSeedPhrase(seedPhrase)) {
      setError('Сид-фраза должна содержать 24 слова');
      return;
    }

    setCreating(true);
    try {
      await createAdminAccount({ email, seedPhrase });
      setCreateEmail('');
      setCreateSeedPhrase('');
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Ошибка создания'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Админы" subtitle={`Создание админов и изменение их почты. Разрешены только @${ADMIN_EMAIL_DOMAIN}.`}>
        {error && (
          <div className="rounded-xl bg-rose-500/20 border border-rose-500/30 p-3 text-sm text-rose-400 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-slate-500">Загрузка...</div>
        ) : (
          <div className="space-y-3">
            {admins.map((a) => (
              <div key={a._id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">{a.email}</div>
                    <div className="text-xs text-slate-400">Ник: {a.nickname}</div>
                  </div>

                  {editingId === a._id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        className="input-field"
                        value={editingEmail}
                        onChange={(e) => setEditingEmail(e.target.value)}
                        placeholder="Новый email"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEmail}
                          disabled={saving}
                          className="btn-primary px-4"
                        >
                          {saving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                        <button onClick={cancelEdit} className="btn-secondary px-4">Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(a)} className="btn-secondary px-4">
                      Изменить почту
                    </button>
                  )}
                </div>
              </div>
            ))}

            {admins.length === 0 && (
              <div className="text-center py-8 text-slate-500">Админы не найдены</div>
            )}
          </div>
        )}
      </Card>

      <Card title="Создать админа" subtitle={`Укажи почту @${ADMIN_EMAIL_DOMAIN} и сид-фразу (24 слова). Ник будет равен части почты до @.`}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300">Email</label>
            <input
              className="input-field mt-1"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder={`admin@${ADMIN_EMAIL_DOMAIN}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300">Сид-фраза</label>
            <textarea
              className="input-field mt-1 min-h-[90px]"
              value={createSeedPhrase}
              onChange={(e) => setCreateSeedPhrase(e.target.value)}
              placeholder="Введите 24 слова через пробел"
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={createAdmin}
              disabled={creating}
              className="btn-primary px-6"
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
