'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/utils/api';
import { useSocketContext } from '@/context/SocketContext';

type BattleState = {
  active?: {
    id?: string;
    status?: string;
    startsAt?: string;
    endsAt?: string;
    durationSeconds?: number;
    darknessDamage?: number;
    lightDamage?: number;
    attendanceCount?: number;
  };
  upcoming?: {
    id?: string;
    status?: string;
    startsAt?: string;
    endsAt?: string;
    durationSeconds?: number;
  };
  ts?: number;
};

export function useBattleSocket() {
  const sharedSocket = useSocketContext();
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const lastBattleSignatureRef = useRef<string>('');

  const fallbackSocket: Socket | null = useMemo(() => {
    if (sharedSocket || typeof window === 'undefined') return null;
    return io(API_URL, { transports: ['websocket'], withCredentials: true });
  }, [sharedSocket]);

  const socket = sharedSocket ?? fallbackSocket;

  useEffect(() => {
    if (!socket) {
      setConnected(false);
      setSocketId(null);
      return;
    }

    const joinBattle = () => {
      socket.emit('battle:join');
    };

    const leaveBattle = () => {
      socket.emit('battle:leave');
    };

    const onConnect = () => {
      setConnected(true);
      setSocketId(socket.id ?? null);
      joinBattle();
    };

    const onDisconnect = () => {
      setConnected(false);
      setSocketId(null);
    };

    const onState = (payload: BattleState) => {
      // Server may emit battle state very often. To keep the UI smooth, only update React state
      // when the "meaningful" battle identity changes (active/upcoming id/status/timestamps).
      const active = payload?.active ?? {};
      const upcoming = payload?.upcoming ?? {};
      const signature = [
        active.id ?? '',
        active.status ?? '',
        active.startsAt ?? '',
        active.endsAt ?? '',
        upcoming.id ?? '',
        upcoming.status ?? '',
        upcoming.startsAt ?? '',
        upcoming.endsAt ?? '',
      ].join('|');

      if (signature === lastBattleSignatureRef.current) return;
      lastBattleSignatureRef.current = signature;
      setBattleState(payload);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('battle:state', onState);

    if (socket.connected) {
      setConnected(true);
      setSocketId(socket.id ?? null);
      joinBattle();
    } else {
      setConnected(false);
      setSocketId(null);
    }

    return () => {
      leaveBattle();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('battle:state', onState);

      if (socket === fallbackSocket) {
        socket.disconnect();
      }
    };
  }, [socket, fallbackSocket]);

  return { socket, socketId, connected, battleState };
}
