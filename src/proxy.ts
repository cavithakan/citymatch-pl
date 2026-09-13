import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Locale negotiation. Next 16 renamed this convention from `middleware` to
 * `proxy`; next-intl still ships the handler under its old name.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except Next internals, API routes, static files and /admin.
  // The admin views are an operator's tools rather than part of the guide, so
  // they are not localised and must not be redirected into /pl or /en.
  matcher: "/((?!api|admin|_next|_vercel|.*\\..*).*)",
};
