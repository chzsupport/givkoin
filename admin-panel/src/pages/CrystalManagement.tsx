import React, { useEffect, useState } from 'react';
import { RefreshCw, MapPin, Users, Gem, Sparkles } from 'lucide-react';
import { fetchCrystalStats, fetchCrystalLocations, generateCrystals } from '../api/admin';

const Card = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 overflow-hidden">
        <div className="mb-6">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
        {children}
    </div>
);

export default function CrystalManagement() {
    const [stats, setStats] = useState<any[]>([]);
    const [suspicious, setSuspicious] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            console.log('[Admin] Fetching crystal data...');
            const statsData = await fetchCrystalStats();
            const locationsData = await fetchCrystalLocations();
            
            console.log('[Admin] Stats received:', statsData);
            console.log('[Admin] Locations received:', locationsData);
            
            // 1. Обработка статистики (участников)
            if (Array.isArray(statsData)) {
                setStats(statsData);
                setSuspicious([]);
            } else if (statsData && typeof statsData === 'object') {
                setStats(Array.isArray(statsData.users) ? statsData.users : []);
                setSuspicious(Array.isArray(statsData.suspicious) ? statsData.suspicious : []);
            } else {
                console.warn('[Admin] Stats is not an array:', statsData);
                setStats([]);
                setSuspicious([]);
            }
            
            // 2. Обработка локаций
            let locs: any[] = [];
            if (locationsData && typeof locationsData === 'object') {
                if (Array.isArray(locationsData.locations)) {
                    locs = locationsData.locations;
                } else if (Array.isArray(locationsData)) {
                    locs = locationsData;
                }
            }
            
            console.log('[Admin] Final locations state:', locs);
            setLocations(locs);
        } catch (error) {
            console.error('[Admin] Failed to load crystal data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleGenerate = async () => {
        if (!window.confirm('Это пересоздаст все локации осколков на сегодня. Прогресс пользователей НЕ сбросится. Продолжить?')) return;
        setGenerating(true);
        try {
            const result = await generateCrystals();
            console.log('Generate result:', result);
            alert(result?.message || 'Кристаллы пересозданы');
            
            // После успешной генерации обновляем локации и статы
            if (result?.locations) {
                setLocations(result.locations);
            }
            
            // Также вызываем общую загрузку для верности
            await loadData();
        } catch (error: any) {
            console.error('Generation error:', error);
            alert(error?.response?.data?.message || 'Ошибка генерации');
        } finally {
            setGenerating(false);
        }
    };

    if (loading) return <div className="text-center py-20 text-slate-500">Загрузка данных...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Управление Кристаллами</h2>
                    <p className="text-slate-400">Активность "Хрустальное сердце"</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 border border-blue-500/30 rounded-xl transition-all text-sm font-medium text-white disabled:opacity-50"
                    >
                        <Sparkles size={16} className={generating ? 'animate-spin' : ''} />
                        {generating ? 'Генерация...' : 'Сгенерировать заново'}
                    </button>
                    <button
                        onClick={loadData}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm font-medium"
                    >
                        <RefreshCw size={16} />
                        Обновить
                    </button>
                </div>
            </div>

            {locations.length === 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm">
                    ⚠️ Локации кристаллов ещё не сгенерированы на сегодня. Нажмите «Сгенерировать заново», чтобы запустить активность.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Левый список: Пользователи */}
                <Card
                    title="Прогресс пользователей"
                    subtitle="Пользователи, начавшие сбор осколков сегодня"
                >
                    <div className="space-y-3">
                        {stats.length > 0 ? stats.map((user) => (
                            <div key={user.userId} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">{user.nickname || 'Аноним'}</div>
                                        <div className="text-xs text-slate-500">ID: {user.userId?.slice?.(-6) || '—'}</div>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${user.isComplete ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-blue-500/20 border-blue-500/30'}`}>
                                    <Gem size={14} className={user.isComplete ? 'text-emerald-400' : 'text-blue-400'} />
                                    <span className={`text-sm font-bold ${user.isComplete ? 'text-emerald-200' : 'text-blue-200'}`}>{user.collectedCount}/12</span>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-10 text-slate-600 italic">Сбор ещё никто не начал</div>
                        )}
                    </div>
                </Card>

                {/* Правый список: Локации */}
                <Card
                    title="Места размещения"
                    subtitle="Где система разбросала осколки сегодня"
                >
                    <div className="space-y-3">
                        {locations.length > 0 ? locations.map((loc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                        <MapPin size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">{loc.pageName}</div>
                                        <div className="text-xs text-slate-500 font-mono">{loc.url}</div>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded text-caption font-bold uppercase ${idx < 6 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                    Осколок #{loc.shardIndex + 1}
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-10 text-slate-600 italic">Локации не сгенерированы</div>
                        )}
                    </div>
                </Card>
            </div>

            <Card
                title="Подозрительный сбор"
                subtitle="Любые расхождения между дневной картой и тем, что прислал клиент"
            >
                <div className="space-y-3">
                    {suspicious.length > 0 ? suspicious.map((row) => (
                        <div key={row.userId} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-sm font-bold text-white">{row.nickname || 'Аноним'}</div>
                                    <div className="text-xs text-slate-400">
                                        Собрано: {row.collectedCount || 0}/12 • Расхождений: {row.mismatchCount || 0}
                                    </div>
                                </div>
                                <div className="text-caption font-bold uppercase text-amber-300">
                                    На проверку
                                </div>
                            </div>
                            {Array.isArray(row.mismatchDetails) && row.mismatchDetails.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {row.mismatchDetails.slice(0, 12).map((item: any, idx: number) => (
                                        <div key={`${row.userId}_${idx}`} className="rounded-lg bg-black/20 px-3 py-2 text-xs text-slate-200">
                                            Осколок #{Number.isFinite(Number(item?.shardIndex)) ? Number(item.shardIndex) + 1 : '?'}:
                                            ожидалась {item?.expectedPagePath || '—'}, пришла {item?.reportedPagePath || '—'}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )) : (
                        <div className="text-center py-10 text-slate-600 italic">Подозрительных сборов пока нет</div>
                    )}
                </div>
            </Card>
        </div>
    );
}
