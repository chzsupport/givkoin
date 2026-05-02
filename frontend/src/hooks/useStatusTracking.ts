'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSocket } from './useSocket';
import { pathStartsWith, normalizeSitePath } from '@/utils/sitePath';

export const useStatusTracking = (userId?: string, forceBusy: boolean = false) => {
    const socket = useSocket(userId);
    const pathname = usePathname();
    const cleanPathname = normalizeSitePath(pathname || '/');

    useEffect(() => {
        if (!socket || !userId) return;

        const checkStatus = () => {
            // Принудительная занятость (например, открыта панель Энергия)
            if (forceBusy) return 'busy';

            // ЛК и его подвкладки
            if (pathStartsWith(cleanPathname, '/cabinet')) return 'busy';

            // Активный бой
            if (pathStartsWith(cleanPathname, '/battle')) return 'busy';

            // Страница чата
            if (pathStartsWith(cleanPathname, '/chat')) return 'busy';

            // В остальных случаях доступен
            return 'available';
        };

        const status = checkStatus();
        socket.emit('update_status', { status });

        // Мы не возвращаем статус в available в return cleanup, 
        // потому что переход на другую страницу вызовет новый useEffect 
        // и отправит актуальный статус.
    }, [socket, userId, cleanPathname, forceBusy]);
};
