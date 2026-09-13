import type { ReactNode } from "react";

/**
 * The root layout only forwards to the locale layout, which owns <html> so it
 * can set the correct `lang`.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
