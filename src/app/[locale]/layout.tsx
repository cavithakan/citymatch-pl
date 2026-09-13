import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Brygada_1918, IBM_Plex_Sans } from "next/font/google";
import { routing } from "@/i18n/routing";
import "../globals.css";

/**
 * Brygada 1918 was commissioned for the centenary of Poland regaining
 * independence — a Polish typeface for a site about Polish cities, and one that
 * covers every diacritic the city names need.
 */
const brygada = Brygada_1918({
  subsets: ["latin-ext"],
  weight: ["400", "700"],
  variable: "--font-brygada",
  display: "swap",
});

/** Chosen for its tabular figures, which every table on the site depends on. */
const plex = IBM_Plex_Sans({
  subsets: ["latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    title: { default: `${t("name")} — ${t("tagline")}`, template: `%s — ${t("name")}` },
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${brygada.variable} ${plex.variable}`}>
      <body className="min-h-dvh bg-abyss text-bright">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
