import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import "./broadsheet.css";
import { AppProviders } from "./providers";
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
  title: "NutriAgent AI",
  description: "Photograph a meal. Get the nutrition. Ask anything.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = languageFromCookieValue(cookieStore.get(PREFERRED_LANGUAGE_COOKIE)?.value);
  const dir = htmlDirection(lang);

  return (
    <html lang={lang} dir={dir} className={sourceSerif.variable}>
      <body className="na-app">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
