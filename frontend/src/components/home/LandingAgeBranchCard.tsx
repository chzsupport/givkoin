type LandingAgeBranchCardProps = {
    age: string;
    description: string;
    title: string;
};

export function LandingAgeBranchCard({ age, description, title }: LandingAgeBranchCardProps) {
    return (
        <div className="group relative overflow-hidden rounded-2xl border border-glass-white bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
            <div className="mb-4 text-4xl font-bold text-primary-dark/40">{age}</div>
            <h3 className="mb-2 text-h3 text-white">{title}</h3>
            <p className="text-secondary text-neutral-400">
                {description}
            </p>
        </div>
    );
}
