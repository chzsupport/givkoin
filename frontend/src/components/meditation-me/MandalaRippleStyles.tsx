export function MandalaRippleStyles() {
    return (
        <style jsx>{`
            @keyframes mandala-ripple {
                0% {
                    transform: scale(1);
                    opacity: 0.35;
                }
                70% {
                    opacity: 0.15;
                }
                100% {
                    transform: scale(1.35);
                    opacity: 0;
                }
            }

            .mandala-ripple {
                position: absolute;
                inset: 0;
                border-radius: 9999px;
                border: 1px solid rgba(56, 189, 248, 0.35);
                box-shadow: 0 0 35px rgba(56, 189, 248, 0.25);
                animation: mandala-ripple 2.4s ease-out infinite;
                pointer-events: none;
                will-change: transform, opacity;
            }

            .mandala-ripple--two {
                animation-delay: 1.2s;
            }
        `}</style>
    );
}
