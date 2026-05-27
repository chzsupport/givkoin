type LandingActivityCardProps = {
    description: string;
    icon: string;
    title: string;
};

export function LandingActivityCard({ description, icon, title }: LandingActivityCardProps) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
            <div className="text-3xl">{icon}</div>
            <div className="mt-3 text-secondary font-semibold text-white">{title}</div>
            <div className="mt-2 text-tiny text-white/60">{description}</div>
        </div>
    );
}
