import { History, Ticket } from 'lucide-react';
import type { LotteryTicket, LotteryTranslate } from './types';
import { formatTicketNumbers } from './lotteryUtils';

type LotteryTicketHistoryProps = {
    loading: boolean;
    tickets: LotteryTicket[];
    t: LotteryTranslate;
};

export function LotteryTicketHistory({ loading, tickets, t }: LotteryTicketHistoryProps) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-1.5 xl:p-2 flex flex-col xl:flex-1 xl:min-h-0">
            <h4 className="text-white font-bold text-tiny flex items-center gap-1 mb-1 flex-shrink-0">
                <History className="w-3 h-3 text-gray-400" />
                {t('fortune.tickets')} ({tickets.length})
            </h4>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                </div>
            ) : tickets.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-tiny text-center">
                    <Ticket className="w-5 h-5 mb-1 opacity-20" />
                    {t('fortune.no_tickets')}
                </div>
            ) : (
                <div className="max-h-[320px] xl:max-h-[360px] overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                    {tickets.map((ticket) => (
                        <div key={ticket._id} className="bg-black/40 border border-white/5 rounded-lg p-1.5">
                            <div className="flex justify-between text-tiny text-gray-500 mb-0.5">
                                <span>#{formatTicketNumbers(ticket.numbers) || ticket.ticketNumber}</span>
                                <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex gap-0.5 flex-wrap">
                                {ticket.numbers.map((number) => (
                                    <span
                                        key={number}
                                        className="min-w-[1.6rem] h-5 xl:h-6 rounded text-tiny flex items-center justify-center font-mono bg-blue-900/50 text-blue-200 px-1"
                                    >
                                        {number.toString().padStart(2, '0')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
