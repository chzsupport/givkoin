import {cookies, headers} from 'next/headers';
import { Exo_2, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const brandFont = Exo_2({
  subsets: ['latin', 'cyrillic'],
  weight: ['700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-brand',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = headers();
  const headerLocale =
    headerStore.get('x-next-intl-locale') ||
    headerStore.get('X-NEXT-INTL-LOCALE') ||
    cookies().get('NEXT_LOCALE')?.value ||
    '';
  const lang = headerLocale === 'en' ? 'en' : 'ru';

  return (
    <html lang={lang} suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${brandFont.variable} bg-neutral-900 text-white antialiased`}>
      <body className="bg-neutral-900 font-sans text-white selection:bg-primary-light/30">
        {children}
      </body>
    </html>
  );
}
