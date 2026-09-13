import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitch } from "./locale-switch";

/**
 * Header for the document pages — the full city profile, the comparison, the
 * sources page. The map has no header at all: it fills the viewport and its
 * chrome floats on top.
 */
export async function SiteHeader() {
  const t = await getTranslations("nav");

  return (
    <header className="sticky top-0 z-20 border-b border-glass-line bg-abyss/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1100px] items-center gap-6 px-5 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-bright"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          {t("explore")}
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/compare" className="text-muted transition-colors hover:text-bright">
            {t("compare")}
          </Link>
          <Link href="/about" className="text-muted transition-colors hover:text-bright">
            {t("about")}
          </Link>
        </nav>

        <div className="ms-auto">
          <LocaleSwitch />
        </div>
      </div>
    </header>
  );
}
