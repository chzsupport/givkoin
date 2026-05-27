export function LandingBackground() {
    return (
        <div className="fixed inset-0 z-0 h-full w-full overflow-hidden bg-neutral-900">
            <div className="absolute inset-x-0 top-0 h-[150vh] w-full">
                <div className="h-full w-full bg-[url('/ttrree.jpg')] bg-cover bg-top bg-fixed opacity-60 mix-blend-overlay" />
                <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/30 via-transparent to-neutral-900" />
            </div>
        </div>
    );
}
