import { useState } from 'react';
import { AttendanceAudit, GratitudeAudit } from './practice/PracticeAudits';
import { MeditationSettings } from './practice/PracticeMeditation';
import { QuotesManagement } from './practice/PracticeQuotes';

type PracticeTab = 'meditation' | 'quotes' | 'gratitude' | 'attendance';

function PracticeSection() {
  const [activeTab, setActiveTab] = useState<PracticeTab>('meditation');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('meditation')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'meditation'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          🧘 Медитация
        </button>
        <button
          onClick={() => setActiveTab('quotes')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'quotes'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          📜 Цитаты дня
        </button>
        <button
          onClick={() => setActiveTab('gratitude')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'gratitude'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          💙 Благодарность
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'attendance'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          📅 Посещаемость
        </button>
      </div>

      {activeTab === 'meditation' && <MeditationSettings />}
      {activeTab === 'quotes' && <QuotesManagement />}
      {activeTab === 'gratitude' && <GratitudeAudit />}
      {activeTab === 'attendance' && <AttendanceAudit />}
    </div>
  );
}

export default PracticeSection;
