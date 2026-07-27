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

/**
 * The first page a user should land on after login. Dashboard/Analytics are
 * admin-only, so non-admins go to a page they can actually use.
 */
export function homePathForRole(role?: string | null): string {
  if (role === "admin") return "/dashboard";
  if (["purchaser", "staff", "sales_rep"].includes(role || "")) return "/inventory";
  return "/leads"; // subadmin (and any other non-admin) \u2014 first CRM page
}
