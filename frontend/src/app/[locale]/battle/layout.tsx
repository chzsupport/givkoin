import type { Metadata } from 'next';
import { buildNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = buildNoIndexMetadata();

export default function BattleLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-black">
            {children}
        </div>
    );
}
