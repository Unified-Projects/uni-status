"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TRANSLATIONS } from "@/locales/translations";

type TranslationValue = string | TranslationTree;
type TranslationTree = { [key: string]: TranslationValue };

interface I18nContextValue {
  locale: string;
  direction: "ltr" | "rtl";
  supportedLocales: string[];
  t: (key: string, fallback?: string) => string;
  setLocale: (locale: string) => void;
}

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: string;
  supportedLocales?: string[];
  rtlLocales?: string[];
  translations?: Record<string, TranslationTree>;
}

const STORAGE_KEY = "uni-status-language";
const DEFAULT_RTL = ["ar", "fa", "he"];

const I18nContext = createContext<I18nContextValue | null>(null);

function getFromTree(tree: TranslationValue | undefined, path: string[]): string | undefined {
  if (!tree) return undefined;
  if (typeof tree === "string") return tree;
  const [head, ...rest] = path;
  const next = tree[head];
  if (rest.length === 0 && typeof next === "string") return next;
  return getFromTree(next as TranslationTree, rest);
}

export function I18nProvider({
  children,
  initialLocale,
  supportedLocales,
  rtlLocales,
  translations,
}: I18nProviderProps) {
  const mergedTranslations = useMemo(
    () => ({
      ...TRANSLATIONS,
      ...(translations || {}),
    }),
    [translations]
  );

  const availableLocales = supportedLocales || Object.keys(mergedTranslations);

  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window === "undefined") return initialLocale || "en";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && availableLocales.includes(stored)) return stored;
    const browserLocale = navigator.language?.split("-")[0];
    if (browserLocale && availableLocales.includes(browserLocale)) return browserLocale;
    return initialLocale && availableLocales.includes(initialLocale) ? initialLocale : "en";
  });

  const setLocale = useCallback(
    (next: string) => {
      setLocaleState(next);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, next);
      }
    },
    [setLocaleState]
  );

  const direction: "ltr" | "rtl" = useMemo(() => {
    const rtlList = rtlLocales || DEFAULT_RTL;
    return rtlList.some((rtl) => locale.startsWith(rtl)) ? "rtl" : "ltr";
  }, [locale, rtlLocales]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = direction;
    }
  }, [direction, locale]);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const path = key.split(".");
      const active = mergedTranslations[locale] || mergedTranslations.en;
      const value = getFromTree(active as TranslationTree, path);
      return (value as string) || fallback || key;
    },
    [locale, mergedTranslations]
  );

  const value: I18nContextValue = {
    locale,
    direction,
    supportedLocales: availableLocales,
    t,
    setLocale,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
