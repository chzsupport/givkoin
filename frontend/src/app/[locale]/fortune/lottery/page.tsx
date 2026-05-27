'use client';

import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';
import { LotteryBackground } from '@/components/lottery/LotteryBackground';
import { LotteryHeader } from '@/components/lottery/LotteryHeader';
import { LotteryStatusCards } from '@/components/lottery/LotteryStatusCards';
import { LotteryTicketHistory } from '@/components/lottery/LotteryTicketHistory';
import { LotteryTicketPicker } from '@/components/lottery/LotteryTicketPicker';
import { useLotteryLayout } from '@/components/lottery/useLotteryLayout';
import { useLotteryStatus } from '@/components/lottery/useLotteryStatus';
import { useLotteryTicketPurchase } from '@/components/lottery/useLotteryTicketPurchase';
import { useLotteryTicketSelection } from '@/components/lottery/useLotteryTicketSelection';

export default function LotteryPage() {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const { localePath, t } = useI18n();
    const { isDesktop, sideAdSlot } = useLotteryLayout();
    const {
        drawTimeLabel,
        fetchTickets,
        freeTickets,
        loading,
        lotteryStatus,
        maxTicketsPerDay,
        nextDrawCountdownMs,
        prize,
        ticketCost,
        tickets,
        ticketsToday,
    } = useLotteryStatus({ refreshUser });
    const {
        clearTicketSlots,
        handleNumberToggle,
        handleRandomSelect,
        handleSlotChange,
        ticketSlots,
    } = useLotteryTicketSelection();
    const { handleBuyTicket, isBuying } = useLotteryTicketPurchase({
        clearTicketSlots,
        fetchTickets,
        freeTickets,
        maxTicketsPerDay,
        refreshUser,
        t,
        ticketCost,
        ticketSlots,
        ticketsToday,
        toast,
        user,
    });

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#050510] text-slate-200 font-sans selection:bg-blue-500/30">
            <LotteryBackground />

            {/* Основной контейнер */}
            <div className="relative z-10 flex flex-1 min-h-0">
                {/* Левый рекламный блок */}
                <StickySideAdRail
                    adSlot={sideAdSlot}
                    page="fortune/lottery"
                    placement="sidebar"
                    panelClassName="from-blue-500/5 to-transparent border-blue-500/10"
                    dividerClassName="border-blue-500/5"
                />

                {/* Центральный контент */}
                <div className="flex-1 flex flex-col min-w-0 px-2 xl:px-3 py-2 min-h-0">
                    {/* MOBILE AD BLOCK - mobile banner */}
                    <div className={`${isDesktop ? 'hidden' : 'flex'} w-full mb-4 shrink-0 mx-auto justify-center`}>
                        <AdaptiveAdWrapper page="fortune/lottery" placement="inline" strategy="mobile_tablet_adaptive" />
                    </div>

                    {/* Хедер */}
                    <LotteryHeader
                        fortuneHref={localePath('/fortune')}
                        userK={user?.k ?? 0}
                        userStars={user?.stars}
                        t={t}
                    />

                    {/* Контент */}
                    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-1.5 xl:gap-2">

                        <LotteryTicketPicker
                            freeTickets={freeTickets}
                            isBuying={isBuying}
                            lotteryStatus={lotteryStatus}
                            maxTicketsPerDay={maxTicketsPerDay}
                            onBuyTicket={handleBuyTicket}
                            onNumberToggle={handleNumberToggle}
                            onRandomSelect={handleRandomSelect}
                            onSlotChange={handleSlotChange}
                            prize={prize}
                            t={t}
                            ticketCost={ticketCost}
                            ticketSlots={ticketSlots}
                            ticketsToday={ticketsToday}
                            userK={user?.k || 0}
                        />

                        {/* Правая часть */}
                        <div className="xl:col-span-5 flex flex-col gap-2 xl:min-h-0">
                            <LotteryStatusCards
                                drawTimeLabel={drawTimeLabel}
                                lotteryStatus={lotteryStatus}
                                nextDrawCountdownMs={nextDrawCountdownMs}
                                t={t}
                            />
                            <LotteryTicketHistory loading={loading} tickets={tickets} t={t} />
                        </div>
                    </div>
                </div>

                {/* Правый рекламный блок */}
                <StickySideAdRail
                    adSlot={sideAdSlot}
                    page="fortune/lottery"
                    placement="sidebar"
                    panelClassName="from-blue-500/5 to-transparent border-blue-500/10"
                    dividerClassName="border-blue-500/5"
                />
            </div>


            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}

