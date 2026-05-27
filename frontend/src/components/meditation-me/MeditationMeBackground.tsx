export function MeditationMeBackground() {
    return (
        <div className="fixed inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-[#050510] to-[#050510]" />
            <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>
    );
}
