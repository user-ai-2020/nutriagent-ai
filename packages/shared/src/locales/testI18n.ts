import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getUiLocaleResources } from "./index";

/** Fresh i18next instance for unit tests (avoids cross-test singleton state). */
export async function createTestI18nInstance() {
  const instance = i18n.createInstance();
  await instance.use(initReactI18next).init({
    resources: getUiLocaleResources(),
    lng: "he",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  });
  return instance;
}
