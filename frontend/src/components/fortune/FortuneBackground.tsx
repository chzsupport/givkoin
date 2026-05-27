export function FortuneBackground() {
    return (
        <div className="fixed inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#050510] to-[#050510]" />
            <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/3 left-1/3 w-48 h-48 bg-yellow-600/5 rounded-full blur-3xl" />
        </div>
    );
}
