'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';

export default function SolarPage() {
  const router = useRouter();
  const { localePath } = useI18n();
  useEffect(() => {
    router.replace(localePath('/tree'));
  }, [router, localePath]);

  return null;
}
