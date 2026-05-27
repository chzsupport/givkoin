import React, { Suspense, lazy, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageSquare,
  Settings,
  BarChart3,
  LogOut,
  Shield,
  Heart,
  Star,
  Coins,
  Zap,
  RefreshCw,
  Swords,
  Globe,
  DollarSign,
  Dices,
  Sparkles,
  Gem,
  MonitorSmartphone
} from 'lucide-react';
import api from './api/client';
import {
  fetchStats,
} from './api/admin';
import AboutPageSection from './pages/AboutPageSection';
import AdsSection from './pages/AdsSection';
import AdminsSection from './pages/AdminsSection';
import AppealsSection from './pages/AppealsSection';
import BattlesSection from './pages/BattlesSection';
import BridgesSection from './pages/BridgesSection';
import ControlCenterSection from './pages/ControlCenterSection';
import ContentSection from './pages/ContentSection';
import DashboardSection from './pages/DashboardSection';
import EntitiesSection from './pages/EntitiesSection';
import FeedbackSection from './pages/FeedbackSection';
import LogsSection from './pages/LogsSection';
import PracticeSection from './pages/PracticeSection';
import ReferralsSection from './pages/ReferralsSection';
import RoadmapPageSection from './pages/RoadmapPageSection';
import RulesPagesSection from './pages/RulesPagesSection';
import SettingsSection from './pages/SettingsSection';
import TndSection from './pages/TndSection';
import UsersSection from './pages/UsersSection';
import WishesSection from './pages/WishesSection';
import { ADMIN_EMAIL_DOMAIN, isAdminEmail } from './utils/adminEmail';

// --- Types ---

type SectionKey = 'dashboard' | 'control' | 'cms' | 'users' | 'admins' | 'content' | 'rules' | 'about' | 'roadmap' | 'appeals' | 'wishes' | 'bridges' | 'battles' | 'tnd' | 'referrals' | 'entities' | 'ads' | 'fortune' | 'night_guardians' | 'crystal' | 'practice' | 'feedback' | 'settings' | 'logs';

interface Section {
  key: SectionKey;
  label: string;
  icon: React.ElementType;
}

const NightGuardiansPage = lazy(() => import('./pages/NightGuardians'));
const CmsOperations = lazy(() => import('./pages/CmsOperations'));
const FortuneControl = lazy(() => import('./pages/FortuneControl'));

function requestApprovalPayload(options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) {
  const reason = prompt(`Причина операции: ${options.title}`);
  if (!reason || !reason.trim()) {
    alert('Причина обязательна');
    return null;
  }

  const impactPreview = prompt(
    'Что изменится после выполнения?',
    options.impactPreviewDefault
  );
  if (!impactPreview || !impactPreview.trim()) {
    alert('Описание последствий обязательно');
    return null;
  }

  const typedPhrase = prompt(
    `Для подтверждения введите фразу:\n${options.confirmationPhrase}`
  );
  if (String(typedPhrase || '').trim() !== options.confirmationPhrase) {
    alert('Фраза подтверждения неверна');
    return null;
  }

  return {
    reason: reason.trim(),
    impactPreview: impactPreview.trim(),
    confirmationPhrase: options.confirmationPhrase,
  };
}

const CrystalManagement = lazy(() => import('./pages/CrystalManagement'));

function SectionFallback() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
      Загрузка раздела...
    </div>
  );
}

const sections: Section[] = [
  { key: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { key: 'control', label: 'Центр контроля', icon: MonitorSmartphone },
  { key: 'cms', label: 'Системные операции', icon: BarChart3 },
  { key: 'users', label: 'Пользователи', icon: Users },
  { key: 'admins', label: 'Админы', icon: Shield },
  { key: 'content', label: 'Контент', icon: FileText },
  { key: 'rules', label: 'Правила', icon: FileText },
  { key: 'about', label: 'О нас', icon: Heart },
  { key: 'roadmap', label: 'Дорожная карта', icon: BarChart3 },
  { key: 'appeals', label: 'Апелляции', icon: MessageSquare },
  { key: 'wishes', label: 'Желания', icon: Star },
  { key: 'bridges', label: 'Мосты', icon: Globe },
  { key: 'battles', label: 'Бои', icon: Swords },
  { key: 'tnd', label: 'ТНД', icon: Shield },
  { key: 'referrals', label: 'Рефералы', icon: Users },
  { key: 'entities', label: 'Сущности', icon: Coins },
  { key: 'ads', label: 'Реклама', icon: DollarSign },
  { key: 'night_guardians', label: 'Ночные Стражи', icon: Shield },
  { key: 'crystal', label: 'Кристалл', icon: Gem },
  { key: 'fortune', label: 'Фортуна', icon: Dices },
  { key: 'practice', label: 'Практика', icon: Sparkles },
  { key: 'feedback', label: 'Обратная связь', icon: MessageSquare },
  { key: 'settings', label: 'Настройки', icon: Settings },
  { key: 'logs', label: 'Логи', icon: Shield },
];

// --- Components ---

// --- Main App ---

export default function App() {
  const [active, setActive] = useState<SectionKey>('dashboard');
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const loadStats = async () => {
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      try {
        const res = await api.get('/auth/me');
        if (cancelled) return;
        if (res.data?.user?.role === 'admin') {
          setIsAuthenticated(true);
          await loadStats();
          return;
        }
        setIsAuthenticated(false);
      } catch (_e) {
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    };

    bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminEmail(email)) {
      setError(`Для админки нужен email вида local@${ADMIN_EMAIL_DOMAIN} без точек/символов до @`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, seedPhrase });
      if (res.data.user.role !== 'admin') {
        throw new Error('У вас нет прав администратора');
      }
      setIsAuthenticated(true);
      await loadStats();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.post('/auth/logout', {}).catch(() => {});
    setIsAuthenticated(false);
    setStats(null);
  };

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-slate-400">
        Проверка сессии...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass-panel p-8"
        >
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]">
              <Shield size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">GIVKOIN Админка</h1>
            <p className="text-slate-400">Панель управления мирозданием</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-rose-500/20 border border-rose-500/30 p-3 text-sm text-rose-400">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                required
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`admin@${ADMIN_EMAIL_DOMAIN}`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Сид-фраза</label>
              <textarea
                required
                className="input-field"
                value={seedPhrase}
                onChange={(e) => setSeedPhrase(e.target.value)}
                placeholder="Введите 24 слова через пробел"
                rows={3}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-4"
            >
              {loading ? <RefreshCw className="animate-spin" /> : 'Войти в систему'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-72 border-r border-white/10 bg-slate-950/50 backdrop-blur-2xl">
        <div className="flex h-full flex-col p-6">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Zap size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">GIVKOIN</span>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
            {sections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActive(section.key)}
                className={`nav-item w-full ${active === section.key ? 'nav-item-active' : ''}`}
              >
                <section.icon size={20} />
                {section.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6">
            <button
              onClick={handleLogout}
              className="nav-item w-full text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut size={20} />
              Выйти
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-72 flex-1 p-10 overflow-y-auto h-full">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white">
              {sections.find(s => s.key === active)?.label}
            </h2>
            <p className="text-slate-400">Управление параметрами и данными проекта</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <span className="text-xs font-medium text-slate-300">Система активна</span>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Suspense fallback={<SectionFallback />}>
              {active === 'dashboard' && <DashboardSection stats={stats} />}
              {active === 'control' && <ControlCenterSection requestApprovalPayload={requestApprovalPayload} />}
              {active === 'cms' && <CmsOperations />}
              {active === 'users' && <UsersSection requestApprovalPayload={requestApprovalPayload} />}
              {active === 'admins' && <AdminsSection />}
              {active === 'content' && <ContentSection />}
              {active === 'rules' && <RulesPagesSection />}
              {active === 'about' && <AboutPageSection />}
              {active === 'roadmap' && <RoadmapPageSection />}
              {active === 'appeals' && <AppealsSection />}
              {active === 'wishes' && <WishesSection />}
              {active === 'bridges' && <BridgesSection />}
              {active === 'battles' && <BattlesSection requestApprovalPayload={requestApprovalPayload} />}
              {active === 'tnd' && <TndSection />}
              {active === 'referrals' && <ReferralsSection />}
              {active === 'entities' && <EntitiesSection />}
              {active === 'ads' && <AdsSection />}
              {active === 'night_guardians' && <NightGuardiansPage />}
              {active === 'crystal' && <CrystalManagement />}
              {active === 'fortune' && <FortuneControl />}
              {active === 'practice' && <PracticeSection />}
              {active === 'feedback' && <FeedbackSection />}
              {active === 'settings' && <SettingsSection requestApprovalPayload={requestApprovalPayload} />}
              {active === 'logs' && <LogsSection />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
