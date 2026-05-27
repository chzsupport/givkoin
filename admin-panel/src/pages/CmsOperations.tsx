import { useState } from 'react';
import AuthTab from './cms/AuthTab';
import FiltersTab from './cms/FiltersTab';
import MailTab from './cms/MailTab';
import SecurityTab from './cms/SecurityTab';
import SystemTab from './cms/SystemTab';

type TabKey = 'security' | 'filters' | 'system' | 'mail';

export default function CmsOperations() {
  const [tab, setTab] = useState<TabKey>('security');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button className={`btn-secondary ${tab === 'security' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('security')}>Безопасность</button>
        <button className={`btn-secondary ${tab === 'filters' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('filters')}>Фильтры</button>
        <button className={`btn-secondary ${tab === 'system' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('system')}>Система</button>
        <button className={`btn-secondary ${tab === 'mail' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('mail')}>Рассылки</button>
      </div>

      {tab === 'security' && <SecurityTab />}
      {tab === 'filters' && <FiltersTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'mail' && <MailTab />}
    </div>
  );
}
