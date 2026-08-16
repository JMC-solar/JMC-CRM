import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as Philippine Pesos (₱) with commas and 2 decimal places.
 * Returns "₱0.00" for falsy/zero values, or "-" if showDash is true and value is 0/null.
 */
export function formatPHP(value: string | number | null | undefined, showDash = false): string {
  const num = Number(value || 0);
  if (showDash && (value === null || value === undefined || num === 0)) return "-";
  return `\u20B1${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Supported PO currencies and their display symbols. */
export const CURRENCY_SYMBOLS: Record<string, string> = { PHP: "₱", USD: "$", CNY: "¥" };
export const CURRENCY_OPTIONS = [
  { code: "PHP", label: "₱ Philippine Peso (PHP)" },
  { code: "USD", label: "$ US Dollar (USD)" },
  { code: "CNY", label: "¥ Chinese Yuan (CNY)" },
];
export function currencySymbol(code?: string | null): string {
  return CURRENCY_SYMBOLS[code || "PHP"] || `${code} `;
}

/**
 * Format a number in a given currency (defaults to PHP) with its symbol,
 * commas and 2 decimals. e.g. formatMoney(1500, "USD") -> "$1,500.00".
 */
export function formatMoney(value: string | number | null | undefined, currency?: string | null, showDash = false): string {
  const num = Number(value || 0);
  if (showDash && (value === null || value === undefined || num === 0)) return "-";
  return `${currencySymbol(currency)}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The first page a user should land on after login. Dashboard/Analytics are
 * admin-only, so non-admins go to a page they can actually use.
 */
export function homePathForRole(role?: string | null): string {
  if (role === "admin") return "/dashboard";
  if (["purchaser", "staff", "sales_rep"].includes(role || "")) return "/inventory";
  return "/projects"; // subadmin (and any other non-admin) \u2014 Project Monitoring
}
