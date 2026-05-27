'use client';

import { Eye } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';

type CabinetHistoryHeaderProps = {
  t: (key: string) => string;
};

export function CabinetHistoryHeader({ t }: CabinetHistoryHeaderProps) {
  return (
    <div className="text-center">
      <PageTitle
        title={t('history.title')}
        Icon={Eye}
        gradientClassName="from-white via-slate-200 to-amber-200"
        iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-amber-200"
        size="h3"
        className="w-fit mx-auto"
      />
    </div>
  );
}
