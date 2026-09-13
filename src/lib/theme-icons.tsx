import { Banknote, Briefcase, Home, Leaf, ShieldCheck, Sun } from "lucide-react";
import type { ComponentType } from "react";
import type { Theme } from "@/lib/scoring/score";

/**
 * One icon per theme.
 *
 * The map's left panel lists 23 measures; grouping them under six headings only
 * helps if the headings are distinguishable at a glance, and a shape does that
 * faster than a word in a language the reader may be learning.
 */
export const THEME_ICONS: Record<Theme, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  EARNINGS: Banknote,
  HOUSING: Home,
  LABOUR: Briefcase,
  SAFETY: ShieldCheck,
  ENVIRONMENT: Leaf,
  LIVING: Sun,
};
