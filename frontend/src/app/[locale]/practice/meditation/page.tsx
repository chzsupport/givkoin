import { redirect } from 'next/navigation';

export default function MeditationPage({
  params,
}: {
  params: { locale: string };
}) {
  redirect(`/${params.locale}/practice/meditation/me`);
}
