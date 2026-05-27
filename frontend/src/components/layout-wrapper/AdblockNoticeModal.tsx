type AdblockNoticeModalProps = {
    title: string;
    body: string;
    closeLabel: string;
    onClose: () => void;
};

export function AdblockNoticeModal({ title, body, closeLabel, onClose }: AdblockNoticeModalProps) {
    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-[min(560px,92vw)] md:w-[min(30vw,560px)] md:min-w-[420px] md:h-[min(30vh,360px)] max-h-[80vh] overflow-auto rounded-2xl border border-amber-500/30 bg-black/85 shadow-2xl px-6 py-5">
                <div className="flex flex-col gap-4">
                    <div className="text-white font-extrabold text-2xl leading-tight text-center">
                        {title}
                    </div>
                    <div className="text-white/85 text-base leading-relaxed text-center">
                        {body}
                    </div>
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-base font-semibold text-white/95 hover:bg-white/10"
                        >
                            {closeLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
