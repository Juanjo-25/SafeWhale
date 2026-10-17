import type { Metadata } from 'next';
import { SafeWhaleApp } from '@/components/app/SafeWhaleApp';

export const metadata: Metadata = { title: 'SafeWhale' };

export default async function AppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { demo } = await searchParams;
  return <SafeWhaleApp demoInicial={demo === '1'} />;
}
