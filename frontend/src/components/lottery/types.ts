export interface LotteryTicket {
    _id: string;
    ticketNumber: string;
    numbers: number[];
    drawDate: string;
    createdAt: string;
}

export type LotteryStatusSnapshot = {
    tickets: LotteryTicket[];
    ticketsToday: number;
    drawTimeLabel: string;
    nextDrawCountdownMs: number;
    maxTicketsPerDay: number;
    ticketCost: number;
    freeTickets: number;
    prize: number;
    status: string;
};

export type LotteryTranslate = (key: string) => string;
