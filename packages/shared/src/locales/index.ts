import type { ResponseLanguage } from "../language";
import { enTranslations } from "./en";
import { heTranslations } from "./he";
import { ruTranslations } from "./ru";

export type UiLocale = ResponseLanguage;

/** i18next resource bundle shape for static UI copy */
export function getUiLocaleResources() {
  return {
    en: { translation: enTranslations },
    he: { translation: heTranslations },
    ru: { translation: ruTranslations },
  } as const;
}

export { enTranslations, heTranslations, ruTranslations };
