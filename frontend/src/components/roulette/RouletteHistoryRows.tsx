import { Award } from 'lucide-react';
import type { RouletteHistoryItem } from './types';

export function RouletteHistoryRows({ history }: { history: RouletteHistoryItem[] }) {
    return (
        <>
            {[0, 1, 2].map((i) => {
                const item = history[i];
                if (!item) {
                    return (
                        <div key={i} className="flex items-center justify-between p-1 2xl:p-2 bg-white/5 border border-white/5 rounded opacity-30">
                            <div className="flex items-center gap-1">
                                <Award className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-gray-500" />
                                <span className="text-caption xl:text-xs 2xl:text-sm text-gray-600">-</span>
                            </div>
                            <span className="text-sm xl:text-base 2xl:text-lg text-gray-600 font-bold">-</span>
                        </div>
                    );
                }

                return (
                    <div key={i} className="flex items-center justify-between p-1 2xl:p-2 bg-white/5 border border-white/10 rounded">
                        <div className="flex items-center gap-1">
                            <Award className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-yellow-400" />
                            <span className="text-caption xl:text-xs 2xl:text-sm text-gray-400">#{item.id}</span>
                        </div>
                        <span className="text-sm xl:text-base 2xl:text-lg text-yellow-300 font-bold">{item.label}</span>
                    </div>
                );
            })}
        </>
    );
}
