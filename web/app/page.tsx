import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { Hero } from '@/components/landing/Hero';
import { Problema } from '@/components/landing/Problema';
import { ComoFunciona } from '@/components/landing/ComoFunciona';
import { QueCubre } from '@/components/landing/QueCubre';
import { Blockchain } from '@/components/landing/Blockchain';
import { DemoSeccion } from '@/components/landing/DemoSeccion';
import { Comparacion } from '@/components/landing/Comparacion';
import { Cierre } from '@/components/landing/Cierre';

export const metadata: Metadata = { title: 'SafeWhale · El SOAT por horas para tu negocio digital' };

export default function LandingPage() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-[clamp(64px,10vw,140px)] p-[clamp(14px,3vw,36px)]">
      <LandingHeader />
      <Hero />
      <Problema />
      <ComoFunciona />
      <QueCubre />
      <Blockchain />
      <DemoSeccion />
      <Comparacion />
      <Cierre />
    </div>
  );
}
