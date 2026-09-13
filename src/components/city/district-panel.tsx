import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { DistrictPanel as PanelData } from "@/lib/queries";
import { formatBare } from "@/lib/format";

/**
 * Warsaw's districts, and an honest account of what is missing.
 *
 * Ten of the indicators on this page exist per dzielnica; nine stop at the city
 * boundary. Those nine are named underneath the table rather than quietly
 * omitted — a reader who has just seen a salary figure for Warsaw will look for
 * it per district, and "not published" is a more useful answer than an absence
 * they have to notice for themselves.
 */
export async function DistrictPanel({
  panel,
  cityName,
  locale,
}: {
  panel: PanelData;
  cityName: string;
  locale: Locale;
}) {
  const t = await getTranslations("city");

  // Columns are limited to the indicators that actually carry values, so the
  // table never shows a column of dashes.
  const columns = panel.available.filter((indicator) =>
    panel.districts.some((d) => d.values[indicator.code]),
  );

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl text-bright">{t("districts", { city: cityName })}</h2>
      <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-muted">
        {t("districtsIntro", {
          available: columns.length,
          total: columns.length + panel.missing.length,
        })}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="border-y border-glass-line">
              <th scope="col" className="py-2 pe-4 text-start font-medium text-bright">
                {t("districts", { city: "" }).replace(/\s*[—-]\s*$/, "")}
              </th>
              {columns.map((indicator) => (
                <th
                  key={indicator.code}
                  scope="col"
                  className="py-2 ps-4 text-end align-bottom font-medium text-bright"
                >
                  <span className="block min-w-[9ch] max-w-[13ch] leading-tight">
                    {indicator.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-normal text-muted">
                    {indicator.unit}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {panel.districts.map((district) => (
              <tr key={district.slug} className="border-b border-glass-line">
                <th scope="row" className="py-2 pe-4 text-start font-normal text-bright">
                  {district.name}
                </th>
                {columns.map((indicator) => {
                  const cell = district.values[indicator.code];
                  return (
                    <td
                      key={indicator.code}
                      className="whitespace-nowrap py-2 ps-4 text-end text-muted"
                    >
                      {cell ? formatBare(cell.value, indicator.unit, locale) : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {panel.missing.length > 0 && (
        <div className="mt-4 border-s-2 border-glass-line ps-4">
          <p className="text-[13px] text-muted">{t("notPublished")}</p>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-bright">
            {panel.missing.map((i) => i.label).join(" · ")}
          </p>
        </div>
      )}
    </section>
  );
}
