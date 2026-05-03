import { redirect } from 'next/navigation';

export default function ReferralsRedirectPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/cabinet/referrals`);
}
