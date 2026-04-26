export function PageBackground() {
    return (
        <div className="fixed inset-0 -z-10 h-full w-full overflow-hidden bg-[#030712]">
            {/* Base nebula gradients */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_30%_75%,rgba(56,189,248,0.16),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(236,72,153,0.14),transparent_32%)]" />

            {/* Subtle starfield and vignette */}
            <div className="absolute inset-0 opacity-50 mix-blend-screen">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_55%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(210deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:140px_140px]" />
            </div>

            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-[#050915]/30 to-black/70" />
        </div>
    );
}
