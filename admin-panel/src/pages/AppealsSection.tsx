import { useEffect, useMemo, useState } from 'react';
import { fetchAppeals, handleAppeal } from '../api/admin';
import { AppealChatModal } from './appeals/AppealChatModal';
import { AppealsFiltersCard } from './appeals/AppealsFiltersCard';
import { AppealsList } from './appeals/AppealsList';
import { AppealsToolbar } from './appeals/AppealsToolbar';
import { getAppealComplainant, getPartyNickname } from './appeals/appealHelpers';
import type { Appeal, AppealAction, AppealFilters, AppealMessage } from './appeals/appealTypes';

function AppealsSection() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChats, setShowChats] = useState<Appeal | null>(null);
  const [chatMessages, setChatMessages] = useState<AppealMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [filters, setFilters] = useState<AppealFilters>({
    status: '',
    search: '',
    showFilters: false,
  });

  const loadAppeals = async () => {
    setLoading(true);
    try {
      const data = await fetchAppeals();
      setAppeals(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppeals();
  }, []);

  const filteredAppeals = useMemo(() => {
    return appeals.filter(a => {
      if (filters.status && a.status !== filters.status) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const complainant = getAppealComplainant(a);
        if (!getPartyNickname(complainant)?.toLowerCase().includes(s) && !a.reason?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [appeals, filters]);

  const handleAction = async (id: string, action: AppealAction) => {
    try {
      await handleAppeal(id, action);
      loadAppeals();
    } catch (e) {
      alert('Ошибка');
    }
  };

  const handleViewChat = (appeal: Appeal) => {
    setShowChats(appeal);
    if (appeal.messagesSnapshot && appeal.messagesSnapshot.length > 0) {
      setChatMessages(appeal.messagesSnapshot);
    } else {
      setChatMessages([]);
    }
    setChatLoading(false);
  };

  const exportCSV = () => {
    const headers = ['ID', 'Пользователь', 'Статус', 'Причина', 'Дата'];
    const rows = filteredAppeals.map(a => {
      const complainant = getAppealComplainant(a);
      return [a._id, getPartyNickname(complainant), a.status, a.reason?.replace(/,/g, ';'), new Date(a.createdAt || '').toLocaleDateString()];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'appeals_export.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      <AppealsToolbar
        filters={filters}
        onFiltersChange={setFilters}
        onExportCsv={exportCSV}
        onReload={loadAppeals}
      />

      {filters.showFilters && (
        <AppealsFiltersCard filters={filters} onFiltersChange={setFilters} />
      )}

      <AppealsList
        appeals={filteredAppeals}
        loading={loading}
        onViewChat={handleViewChat}
        onAction={handleAction}
      />

      <AppealChatModal
        appeal={showChats}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        onClose={() => setShowChats(null)}
      />
    </div>
  );
}

export default AppealsSection;
