import {cookies, headers} from 'next/headers';
import {redirect} from 'next/navigation';

function resolveLocale() {
    const cookieLocale = cookies().get('NEXT_LOCALE')?.value || cookies().get('givkoin_site_language')?.value;
    if (cookieLocale === 'en') return 'en';
    if (cookieLocale === 'ru') return 'ru';

    const accepted = String(headers().get('accept-language') || '').toLowerCase();
    return accepted.includes('en') ? 'en' : 'ru';
}

export default function RootRedirectPage() {
    redirect(`/${resolveLocale()}`);
}
