import { useSocketContext } from '@/context/SocketContext';

export const useSocket = (userId?: string) => {
    void userId;
    return useSocketContext();
};
