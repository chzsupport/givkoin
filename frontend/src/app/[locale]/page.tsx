'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';



function ParallaxSection({ children, className = '', id = '' }: { children: React.ReactNode; className?: string; id?: string }) {
    return (
        <div id={id} className={`relative flex min-h-screen items-center justify-center p-6 ${className}`}>
            {children}
        </div>
    );
}

export default function LandingPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const { t, localePath } = useI18n();

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!window.matchMedia('(pointer: fine)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let current = window.scrollY;
        let target = current;
        let rafId = 0;

        const clampTarget = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            target = Math.max(0, Math.min(target, max));
        };

        const step = () => {
            current += (target - current) * 0.12;
            window.scrollTo(0, current);
            if (Math.abs(target - current) > 0.5) {
                rafId = requestAnimationFrame(step);
            } else {
                rafId = 0;
            }
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            target += e.deltaY;
            clampTarget();
            if (!rafId) {
                rafId = requestAnimationFrame(step);
            }
        };

        window.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            window.removeEventListener('wheel', onWheel);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, []);

    return (
        <div className="relative min-h-screen bg-neutral-900 text-white selection:bg-primary-light/30">
            <Header />

            {/* Background Layer - Parallax Tree */}
            <div className="fixed inset-0 z-0 h-full w-full overflow-hidden bg-neutral-900">
                <div className="absolute inset-x-0 top-0 h-[150vh] w-full">
                    <div className="h-full w-full bg-[url('/ttrree.jpg')] bg-cover bg-top bg-fixed opacity-60 mix-blend-overlay" />
                    <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/30 via-transparent to-neutral-900" />
                </div>
            </div>

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
                        <div className="mx-auto max-w-5xl">
                            <h2 className="mb-12 text-center text-h2 text-white">{t('tree.branches_by_age')}</h2>
                            <div className="grid gap-6 md:grid-cols-3">
                                <div className="group relative overflow-hidden rounded-2xl border border-glass-white bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
                                    <div className="mb-4 text-4xl font-bold text-primary-dark/40">14–25</div>
                                    <h3 className="mb-2 text-h3 text-white">{t('tree.young_at_top')}</h3>
                                    <p className="text-secondary text-neutral-400">
                                        {t('tree.find_age_rhythm')}
                                    </p>
                                </div>
                                <div className="group relative overflow-hidden rounded-2xl border border-glass-white bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
                                    <div className="mb-4 text-4xl font-bold text-primary-dark/40">26–50</div>
                                    <h3 className="mb-2 text-h3 text-white">{t('tree.central_branches')}</h3>
                                    <p className="text-secondary text-neutral-400">
                                        {t('tree.conversations_support')}
                                    </p>
                                </div>
                                <div className="group relative overflow-hidden rounded-2xl border border-glass-white bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
                                    <div className="mb-4 text-4xl font-bold text-primary-dark/40">51+</div>
                                    <h3 className="mb-2 text-h3 text-white">{t('tree.wisdom_below')}</h3>
                                    <p className="text-secondary text-neutral-400">
                                        {t('tree.warm_conversations')}
                                    </p>
                                </div>
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
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
                                    <div className="text-3xl">⚔️</div>
                                    <div className="mt-3 text-secondary font-semibold text-white">{t('cabinet.battles')}</div>
                                    <div className="mt-2 text-tiny text-white/60">{t('tree.defend_darkness')}</div>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
                                    <div className="text-3xl">💬</div>
                                    <div className="mt-3 text-secondary font-semibold text-white">{t('tree.communication')}</div>
                                    <div className="mt-2 text-tiny text-white/60">{t('tree.find_people_talk')}</div>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
                                    <div className="text-3xl">🌉</div>
                                    <div className="mt-3 text-secondary font-semibold text-white">{t('bridges.title')}</div>
                                    <div className="mt-2 text-tiny text-white/60">{t('tree.build_connections')}</div>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
                                    <div className="text-3xl">🌌</div>
                                    <div className="mt-3 text-secondary font-semibold text-white">{t('galaxy.title')}</div>
                                    <div className="mt-2 text-tiny text-white/60">{t('tree.support_dreams')}</div>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
                                    <div className="text-3xl">🎲</div>
                                    <div className="mt-3 text-secondary font-semibold text-white">{t('fortune.title')}</div>
                                    <div className="mt-2 text-tiny text-white/60">{t('tree.try_luck')}</div>
                                </div>
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
