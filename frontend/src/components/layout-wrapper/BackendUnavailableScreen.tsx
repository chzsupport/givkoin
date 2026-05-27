import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ToastProvider } from '@/context/ToastContext';

type BackendUnavailableScreenProps = {
    title: string;
    body: string;
    buttonLabel: string;
    onRefresh: () => void;
};

export function BackendUnavailableScreen({ title, body, buttonLabel, onRefresh }: BackendUnavailableScreenProps) {
    return (
        <ToastProvider>
            <LanguageSwitcher floating />
            <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-6">
                <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-3xl">
                        !
                    </div>
                    <h1 className="mb-3 text-2xl font-bold text-white">
                        {title}
                    </h1>
                    <p className="mb-6 text-sm leading-6 text-white/70">
                        {body}
                    </p>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                    >
                        {buttonLabel}
                    </button>
                </div>
            </div>
        </ToastProvider>
    );
}
