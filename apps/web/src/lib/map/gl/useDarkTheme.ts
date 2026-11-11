import { useEffect, useState } from "react";

/** Whether the page is in the dark theme (next-themes' class on <html>):
 *  the chart's and the route's paint follow it. */
export function useDarkTheme(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => setDark(html.classList.contains("dark")));
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
