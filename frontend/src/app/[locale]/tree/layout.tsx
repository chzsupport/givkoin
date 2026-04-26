import type { Metadata } from 'next';
import { PageBackground } from '@/components/PageBackground';
import { buildNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = buildNoIndexMetadata();

export default function TreeLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <PageBackground />
            <div className="min-h-screen pb-12 px-4 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1920px]">
                    {children}
                </div>
            </div>
        </>
    );
}
