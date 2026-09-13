"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Switches language without moving the reader.
 *
 * The obvious implementation links to "/" in the other locale, which quietly
 * throws anyone reading a city profile back to the map and discards whatever
 * they had open. Keeping the current path and its query means changing language
 * changes only the language.
 *
 * Reading the query string opts a route out of static rendering unless the
 * component sits behind a Suspense boundary, so the export below supplies one.
 * The fallback holds the same footprint to keep the header from shifting.
 */
function LocaleLinks({ compact }: { compact: boolean }) {
  const current = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <div className="flex items-center gap-0.5">
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={href}
            locale={locale}
            aria-current={active ? "true" : undefined}
            lang={locale}
            className={
              (compact ? "px-2 py-1.5 text-[11.5px] " : "px-2.5 py-1 text-xs ") +
              "rounded-xl font-medium transition-colors " +
              (active ? "bg-glass-hover text-bright" : "text-faint hover:text-bright")
            }
          >
            {locale.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}

export function LocaleSwitch({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className={compact ? "h-[30px] w-[66px]" : "h-[26px] w-[62px]"}
        />
      }
    >
      <LocaleLinks compact={compact} />
    </Suspense>
  );
}
