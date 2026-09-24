import { useEffect, useState } from "react";
import {
  getLocale,
  setLocale,
  subscribeLocale,
  t,
  type Locale,
  type MessageKey,
} from "@/lib/i18n/locale";

export function useLocale(): {
  locale: Locale | null;
  set: (l: Locale) => void;
  t: (key: MessageKey) => string;
} {
  const [locale, setLoc] = useState<Locale | null>(() => getLocale());
  useEffect(() => subscribeLocale(() => setLoc(getLocale())), []);
  return {
    locale,
    set: (l) => setLoc(setLocale(l)),
    t: (key) => t(key, locale),
  };
}
