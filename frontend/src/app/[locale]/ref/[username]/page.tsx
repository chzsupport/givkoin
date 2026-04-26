'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';

export default function ReferralHandler({ params }: { params: { username: string } }) {
    const router = useRouter();
    const { t, localePath } = useI18n();

    useEffect(() => {
        if (params.username) {
            localStorage.setItem('referrer', params.username);
        }
        router.push(localePath('/register'));
    }, [params.username, router, localePath]);

    return (
        <div className="flex h-screen w-full items-center justify-center bg-black text-white">
            <p>{t('common.redirecting')}</p>
        </div>
    );
}
