import { Ticket } from 'lucide-react';
import { LOTTERY_MAX_NUMBER, LOTTERY_MIN_NUMBER, TICKET_LENGTH } from './constants';
import type { LotteryTranslate } from './types';

type LotteryTicketPickerProps = {
    freeTickets: number;
    isBuying: boolean;
    lotteryStatus: string;
    maxTicketsPerDay: number;
    prize: number;
    ticketCost: number;
    ticketSlots: (number | null)[];
    ticketsToday: number;
    t: LotteryTranslate;
    userK: number;
    onBuyTicket: () => void;
    onNumberToggle: (value: number) => void;
    onRandomSelect: () => void;
    onSlotChange: (index: number, value: string) => void;
};

export function LotteryTicketPicker({
    freeTickets,
    isBuying,
    lotteryStatus,
    maxTicketsPerDay,
    prize,
    ticketCost,
    ticketSlots,
    ticketsToday,
    t,
    userK,
    onBuyTicket,
    onNumberToggle,
    onRandomSelect,
    onSlotChange,
}: LotteryTicketPickerProps) {
    const selectedCount = ticketSlots.filter((value) => value !== null).length;
    const canBuy = selectedCount === TICKET_LENGTH && ticketsToday < maxTicketsPerDay && (freeTickets > 0 || userK >= ticketCost) && lotteryStatus === 'open';

    return (
        <div className="xl:col-span-7 flex flex-col xl:min-h-0">
            <div className="bg-white/5 border border-white/10 rounded-xl p-2 flex flex-col xl:flex-1 xl:min-h-0">
                <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
                    <div>
                        <h3 className="text-secondary font-bold text-white flex items-center gap-1">
                            <Ticket className="w-3 h-3 xl:w-4 xl:h-4 text-blue-400" />
                            {t('fortune.ticket')}
                        </h3>
                        <p className="text-tiny text-gray-400">{t('fortune.lottery_choose_7_1_49')}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-tiny text-gray-400">{t('fortune.cost')}</div>
                        <div className="text-secondary font-bold text-yellow-400">{ticketCost} K</div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 mb-1 xl:flex-1 xl:min-h-0">
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: TICKET_LENGTH }).map((_, i) => (
                            <input
                                key={i}
                                type="text"
                                inputMode="numeric"
                                value={ticketSlots[i] ?? ''}
                                onChange={(e) => onSlotChange(i, e.target.value)}
                                placeholder="–"
                                className="h-8 rounded-md border border-white/10 bg-white/5 text-white text-center text-tiny font-bold font-mono outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                            />
                        ))}
                    </div>
                    <div className="grid grid-cols-7 grid-rows-7 gap-0.5 sm:gap-1 xl:gap-1.5 max-h-none overflow-visible custom-scrollbar flex-1 xl:min-h-0">
                        {Array.from({ length: LOTTERY_MAX_NUMBER }).map((_, index) => {
                            const value = index + LOTTERY_MIN_NUMBER;
                            const isSelected = ticketSlots.includes(value);
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onNumberToggle(value)}
                                    className={`w-full h-full aspect-square xl:aspect-auto rounded-md text-tiny font-bold border transition-all flex items-center justify-center
                                        ${isSelected
                                            ? 'border-blue-400 bg-blue-500/30 text-blue-200'
                                            : 'border-white/10 bg-black/20 text-gray-400 hover:border-blue-500/40 hover:text-blue-200'}
                                    `}
                                >
                                    {value}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-wrap justify-between items-center gap-1.5 border-t border-white/10 pt-1.5 flex-shrink-0">
                    <div className="text-tiny text-gray-500">
                        {t('fortune.selected')}: {selectedCount}/{TICKET_LENGTH}
                    </div>

                    <div className="flex gap-2 items-center">
                        <button
                            onClick={onRandomSelect}
                            className="px-3 xl:px-4 py-1.5 rounded-lg font-bold text-tiny bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/30 transition-all"
                        >
                            🎲 {t('fortune.random')}
                        </button>
                        <button
                            onClick={onBuyTicket}
                            disabled={!canBuy || isBuying}
                            className={`
                                px-3 xl:px-4 py-1.5 rounded-lg font-bold text-tiny transition-all
                                ${canBuy
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.25)]'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                            `}
                        >
                            {isBuying ? '...' : lotteryStatus !== 'open' ? t('fortune.closed') : ticketsToday >= maxTicketsPerDay ? t('fortune.limit_title') : freeTickets > 0 ? t('fortune.free_ticket') : t('fortune.buy_ticket')}
                        </button>
                    </div>
                </div>

                <div className="mt-1 flex justify-between text-tiny text-gray-500 flex-shrink-0">
                    <span>{t('fortune.tickets')}: {ticketsToday}/{maxTicketsPerDay}</span>
                    <span>{t('fortune.prize_today')}: {prize.toLocaleString()} K</span>
                </div>
            </div>
        </div>
    );
}
