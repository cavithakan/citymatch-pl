import { defineRouting } from "next-intl/routing";

/**
 * The site serves two audiences that need different languages: people moving to
 * Poland, who mostly read English, and Poles comparing their own cities. GUS
 * publishes indicator names only in Polish, so every label is carried in both
 * languages in the Indicator table rather than machine-translated at runtime.
 */
export const routing = defineRouting({
  locales: ["pl", "en"],
  defaultLocale: "pl",
});

export type Locale = (typeof routing.locales)[number];
