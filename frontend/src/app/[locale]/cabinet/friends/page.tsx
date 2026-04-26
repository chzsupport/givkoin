'use client';

import { motion } from 'framer-motion';
import { FriendsList } from '@/components/cabinet/FriendsList';
import { PageTitle } from '@/components/PageTitle';
import { Users } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

export default function FriendsPage() {
    const { t } = useI18n();
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="container mx-auto px-4 py-8"
        >
            <div className="mb-8 text-center">
                <PageTitle
                    title={t('friends.my_friends')}
                    Icon={Users}
                    gradientClassName="from-white via-slate-200 to-cyan-200"
                    iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
                    size="h3"
                    className="w-fit mx-auto mb-2"
                />
                <p className="text-body text-white/60">
                    {t('friends.manage_desc')}
                </p>
            </div>

            <FriendsList />
        </motion.div>
    );
}
