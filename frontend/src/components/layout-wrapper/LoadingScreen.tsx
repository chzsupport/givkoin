import { LanguageSwitcher } from '@/components/LanguageSwitcher';

type LoadingScreenProps = {
    label: string;
};

export function LoadingScreen({ label }: LoadingScreenProps) {
    return (
        <>
            <LanguageSwitcher floating />
            <div className="min-h-screen flex items-center justify-center bg-neutral-900">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-white/60 text-sm">{label}</span>
                </div>
            </div>
        </>
    );
}
