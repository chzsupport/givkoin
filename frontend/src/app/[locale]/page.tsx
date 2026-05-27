'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { LandingActivityCard } from '@/components/home/LandingActivityCard';
import { LandingAgeBranchCard } from '@/components/home/LandingAgeBranchCard';
import { LandingBackground } from '@/components/home/LandingBackground';
import { ParallaxSection } from '@/components/home/ParallaxSection';
import { useSmoothWheelScroll } from '@/components/home/useSmoothWheelScroll';

export default function LandingPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const { t, localePath } = useI18n();
    useSmoothWheelScroll();

    const ageBranches = [
        { age: '18–25', title: t('tree.young_branch'), description: t('tree.find_age_rhythm') },
        { age: '26–35', title: t('tree.adult_branch'), description: t('tree.conversations_support') },
        { age: '36–51', title: t('tree.experienced_branch'), description: t('tree.conversations_support') },
        { age: '52+', title: t('tree.wise_branch'), description: t('tree.warm_conversations') },
    ];

    const activityCards = [
        { icon: '⚔️', title: t('cabinet.battles'), description: t('tree.defend_darkness') },
        { icon: '💬', title: t('tree.communication'), description: t('tree.find_people_talk') },
        { icon: '🌉', title: t('bridges.title'), description: t('tree.build_connections') },
        { icon: '🌌', title: t('galaxy.title'), description: t('tree.support_dreams') },
        { icon: '🎲', title: t('fortune.title'), description: t('tree.try_luck') },
    ];

    return (
        <div className="relative min-h-screen bg-neutral-900 text-white selection:bg-primary-light/30">
            <Header />

            <LandingBackground />

            {/* Content Layer */}
            <div className="relative z-10">

                {/* HERO */}
                <ParallaxSection id="hero" className="pt-20">
                    <motion.div
                        style={{ willChange: 'transform' }}
                        className="mx-auto max-w-4xl text-center"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <h1 className="text-h1 text-white">
                            {t('tree.protect_tree')}<br />{t('tree.become_universe')}
                        </h1>
                        <p className="mt-6 text-body text-neutral-200">
                            {t('tree.every_leaf')}
                        </p>

                        {isAuthenticated ? (
                            <div className="mt-12 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => router.push(localePath('/tree'))}
                                    className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-8 text-body font-medium text-primary-dark shadow-[0_0_20px_rgba(110,231,183,0.4)] transition-transform hover:-translate-y-1 active:scale-95"
                                >
                                    {t('nav.to_tree')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="mt-12 flex justify-center">
                                    <motion.div
                                        animate={{ scale: [1, 1.06, 1] }}
                                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                                    >
                                        <Link
                                            href={localePath('/register')}
                                            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-8 text-body font-medium text-primary-dark shadow-[0_0_20px_rgba(110,231,183,0.4)] transition-transform hover:-translate-y-1 active:scale-95"
                                        >
                                            {t('nav.join')}
                                        </Link>
                                    </motion.div>
                                </div>
                                <div className="mt-4 flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => router.push(localePath('/login'))}
                                        className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 text-secondary font-medium text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 active:scale-95"
                                    >
                                        {t('nav.login')}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </ParallaxSection>

                {/* О ПРОЕКТЕ (About) */}
                <section id="leaves" className="relative py-24">
                    <div className="container mx-auto px-6">
                        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-neutral-900/60 p-8 backdrop-blur-md md:p-12">
                            <div className="grid gap-10 md:grid-cols-2 md:items-center">
                                <div>
                                    <h2 className="text-h2 text-white">{t('tree.leaves_are_people')}</h2>
                                    <p className="mt-4 text-body text-neutral-300">
                                        {t('tree.every_leaf_user')}
                                    </p>
                                    <div className="mt-8">
                                        {isAuthenticated ? (
                                            <button
                                                type="button"
                                                onClick={() => router.push(localePath('/tree'))}
                                                className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-8 text-body font-medium text-primary-dark shadow-[0_0_20px_rgba(110,231,183,0.35)] transition-transform hover:-translate-y-1 active:scale-95"
                                            >
                                                {t('nav.to_tree')}
                                            </button>
                                        ) : (
                                            <Link
                                                href={localePath('/register')}
                                                className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-8 text-body font-medium text-primary-dark shadow-[0_0_20px_rgba(110,231,183,0.35)] transition-transform hover:-translate-y-1 active:scale-95"
                                            >
                                                {t('tree.become_universe_btn')}
                                            </Link>
                                        )}
                                    </div>
                                </div>

                                <div className="relative mx-auto w-full max-w-md">
                                    <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-transparent">
                                        <motion.div
                                            animate={{ opacity: [0.35, 0.7, 0.35] }}
                                            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                                            className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(110,231,183,0.22),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(circle_at_60%_80%,rgba(168,85,247,0.16),transparent_55%)]"
                                        />

                                        <div className="absolute inset-0">
                                            {Array.from({ length: 14 }).map((_, idx) => (
                                                <motion.div
                                                    key={idx}
                                                    animate={{
                                                        y: [0, -8, 0],
                                                        rotate: [0, idx % 2 === 0 ? 6 : -6, 0],
                                                        opacity: [0.55, 0.95, 0.55],
                                                    }}
                                                    transition={{
                                                        duration: 2.8 + (idx % 5) * 0.35,
                                                        repeat: Infinity,
                                                        ease: 'easeInOut',
                                                        delay: (idx % 7) * 0.15,
                                                    }}
                                                    className="absolute h-3 w-3 rounded-full bg-primary-light/70 shadow-[0_0_18px_rgba(110,231,183,0.35)]"
                                                    style={{
                                                        top: `${10 + (idx * 6) % 80}%`,
                                                        left: `${12 + (idx * 9) % 76}%`,
                                                    }}
                                                />
                                            ))}
                                        </div>

                                        <div className="absolute inset-x-0 bottom-0 p-6">
                                            <div className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-md">
                                                <div className="text-tiny uppercase tracking-[0.2em] text-neutral-400">{t('tree.community')}</div>
                                                <div className="mt-2 text-body text-white">{t('tree.leaves_breathe')}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* КАК ЭТО РАБОТАЕТ */}
                <section id="branches" className="relative py-24">
                    <div className="container mx-auto px-6">
                        <div className="mx-auto max-w-6xl">
                            <h2 className="mb-12 text-center text-h2 text-white">{t('tree.branches_by_age')}</h2>
                            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                                {ageBranches.map((branch) => (
                                    <LandingAgeBranchCard
                                        key={branch.age}
                                        age={branch.age}
                                        description={branch.description}
                                        title={branch.title}
                                    />
                                ))}
                            </div>

                            <div className="mt-10 text-center">
                                {isAuthenticated ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push(localePath('/tree'))}
                                        className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-8 text-body font-medium text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 active:scale-95"
                                    >
                                        {t('tree.find_branch')}
                                    </button>
                                ) : (
                                    <Link
                                        href={localePath('/register')}
                                        className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-8 text-body font-medium text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 active:scale-95"
                                    >
                                        {t('tree.find_branch')}
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section id="roots" className="relative py-24">
                    <div className="container mx-auto px-6">
                        <div className="mx-auto grid max-w-5xl gap-10 rounded-3xl border border-white/10 bg-neutral-900/60 p-8 backdrop-blur-md md:grid-cols-2 md:items-center md:p-12">
                            <div>
                                <h2 className="text-h2 text-white">{t('tree.roots_other_worlds')}</h2>
                                <p className="mt-4 text-body text-neutral-300">
                                    {t('tree.roots_connect')}
                                </p>
                                <div className="mt-8">
                                    {isAuthenticated ? (
                                        <button
                                            type="button"
                                            onClick={() => router.push(localePath('/tree'))}
                                            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-8 text-body font-medium text-primary-dark shadow-[0_0_18px_rgba(110,231,183,0.35)] transition-transform hover:-translate-y-1 active:scale-95"
                                        >
                                            {t('nav.join')}
                                        </button>
                                    ) : (
                                        <Link
                                            href={localePath('/register')}
                                            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-8 text-body font-medium text-primary-dark shadow-[0_0_18px_rgba(110,231,183,0.35)] transition-transform hover:-translate-y-1 active:scale-95"
                                        >
                                            {t('nav.join')}
                                        </Link>
                                    )}
                                </div>
                            </div>

                            <div className="relative mx-auto w-full max-w-md">
                                <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                                    <motion.div
                                        animate={{ y: [0, -14, 0] }}
                                        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                                        className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.16),transparent_60%),radial-gradient(circle_at_30%_70%,rgba(110,231,183,0.18),transparent_55%),radial-gradient(circle_at_70%_30%,rgba(168,85,247,0.14),transparent_55%)]"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center backdrop-blur-md">
                                            <div className="text-tiny uppercase tracking-[0.2em] text-neutral-400">{t('tree.unity')}</div>
                                            <div className="mt-2 text-body text-white">{t('tree.roots_intertwine')}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="activities" className="relative py-24">
                    <div className="container mx-auto px-6">
                        <div className="mx-auto max-w-6xl">
                            <h2 className="mb-12 text-center text-h2 text-white">{t('activity.title')}</h2>
                            <div className="grid gap-6 md:grid-cols-5">
                                {activityCards.map((card) => (
                                    <LandingActivityCard
                                        key={card.title}
                                        description={card.description}
                                        icon={card.icon}
                                        title={card.title}
                                    />
                                ))}
                            </div>

                            <div className="mt-10 text-center">
                                {isAuthenticated ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push(localePath('/tree'))}
                                        className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-8 text-body font-medium text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 active:scale-95"
                                    >
                                        {t('tree.start_adventure')}
                                    </button>
                                ) : (
                                    <Link
                                        href={localePath('/register')}
                                        className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-8 text-body font-medium text-white transition-all hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 active:scale-95"
                                    >
                                        {t('tree.start_adventure')}
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-24">
                    <div className="container mx-auto px-6 text-center">
                        <motion.div
                            whileInView={{ scale: [0.95, 1], opacity: [0, 1] }}
                            transition={{ duration: 0.8 }}
                            className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-b from-primary-dark to-neutral-900 p-12 shadow-2xl ring-1 ring-white/10"
                        >
                            <h2 className="mb-6 text-h2 text-white">
                                {t('tree.protect_tree_btn')}
                            </h2>
                            <p className="mb-8 text-body text-neutral-300">
                                {t('tree.take_part')}
                            </p>
                            <motion.div
                                animate={{ scale: [1, 1.06, 1] }}
                                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                                className="inline-block"
                            >
                                {isAuthenticated ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push(localePath('/tree'))}
                                        className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-10 text-body font-medium text-primary-dark shadow-[0_0_20px_rgba(110,231,183,0.4)] transition-transform hover:-translate-y-1 active:scale-95"
                                    >
                                        {t('nav.to_tree')}
                                    </button>
                                ) : (
                                    <Link
                                        href={localePath('/register')}
                                        className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-light px-10 text-body font-medium text-primary-dark shadow-[0_0_20px_rgba(110,231,183,0.4)] transition-transform hover:-translate-y-1 active:scale-95"
                                    >
                                        {t('tree.protect_tree_btn')}
                                    </Link>
                                )}
                            </motion.div>
                        </motion.div>
                    </div>
                </section>
                <Footer />
            </div>
        </div>
    );
}
