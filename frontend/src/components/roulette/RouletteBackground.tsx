export function RouletteBackground() {
    return (
        <>
            <div className="fixed inset-0 z-0 pointer-events-none opacity-10">
                <div className="absolute inset-0 bg-[linear-gradient(30deg,transparent_24%,rgba(250,204,21,0.15)_25%,rgba(250,204,21,0.15)_26%,transparent_27%,transparent_74%,rgba(250,204,21,0.15)_75%,rgba(250,204,21,0.15)_76%,transparent_77%),linear-gradient(-30deg,transparent_24%,rgba(250,204,21,0.15)_25%,rgba(250,204,21,0.15)_26%,transparent_27%,transparent_74%,rgba(250,204,21,0.15)_75%,rgba(250,204,21,0.15)_76%,transparent_77%)] bg-[length:60px_60px]" />
            </div>
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-900/20 via-[#050510] to-[#050510]" />
            </div>
        </>
    );
}
