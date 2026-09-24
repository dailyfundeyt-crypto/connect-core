import { useEffect, useState } from "react";

/**
 * Read a value from `localStorage` and keep it in sync with changes from
 * other tabs or other components in the same tab.
 *
 * The subscribe function receives a callback that the caller fires whenever
 * the underlying source mutates. For most call-sites that is a thin wrapper
 * around `window.dispatchEvent(new Event('connect-xxx-changed'))`.
 *
 * Example:
 *
 *   const companyId = useStoredValue({
 *     read:    () => window.localStorage.getItem(KEY),
 *     write:   (next) => window.localStorage.setItem(KEY, next ?? ""),
 *     subscribe: (onChange) => {
 *       window.addEventListener("connect-active-company", onChange);
 *       window.addEventListener("storage", onChange);
 *       return () => {
 *         window.removeEventListener("connect-active-company", onChange);
 *         window.removeEventListener("storage", onChange);
 *       };
 *     },
 *   });
 *
 * `serverSnapshot` is what the hook returns during SSR — defaults to the
 * synchronous read result, which is fine for a client-only app.
 */
export function useStoredValue<T>(options: {
  read: () => T | null;
  write?: (next: T | null) => void;
  subscribe: (onChange: () => void) => () => void;
  initial?: T | null;
}): T | null {
  const [value, setValue] = useState<T | null>(
    () => options.initial ?? options.read(),
  );

  useEffect(() => options.subscribe(() => setValue(options.read())), []);

  return value;
}
