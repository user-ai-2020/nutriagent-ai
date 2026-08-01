export type ResponseLanguage = "he" | "en" | "ru";

export function rtlRequired(lang: ResponseLanguage): boolean {
  return lang === "he";
}
