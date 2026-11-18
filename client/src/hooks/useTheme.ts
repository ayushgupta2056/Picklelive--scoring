import { useCallback, useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("pl-theme", dark ? "dark" : "light");
    } catch {
      /* private mode */
    }
  }, [dark]);
  return { dark, toggle: useCallback(() => setDark((d) => !d), []) };
}
