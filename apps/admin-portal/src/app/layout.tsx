import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import "./broadsheet.css";
import { Providers } from "./providers";
import { LanguageProvider } from "@/lib/language";
import { I18nProvider } from "@/lib/I18nProvider";
import {
  htmlDirection,
  languageFromCookieValue,
  PREFERRED_LANGUAGE_COOKIE,
} from "@/lib/languageCookie";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: "NutriAgent AI — Admin Portal",
  description: "System administration for NutriAgent AI",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = languageFromCookieValue(cookieStore.get(PREFERRED_LANGUAGE_COOKIE)?.value);
  const dir = htmlDirection(lang);

  return (
    <html lang={lang} dir={dir} className={sourceSerif.variable}>
      <body className="na-app">
        <LanguageProvider>
          <I18nProvider>
            <Providers>{children}</Providers>
          </I18nProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
