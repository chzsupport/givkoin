'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function EntityPage() {
  const router = useRouter();
  const { user, isAuthLoading } = useAuth();

  useEffect(() => {
    if (isAuthLoading) return;
    router.replace(user?.entity ? '/entity/profile' : '/entity/create');
  }, [isAuthLoading, router, user?.entity]);

  return null;
}
