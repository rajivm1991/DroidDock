/**
 * Light, dark, or match the Mac. In match mode it follows the system
 * appearance and sets data-theme on the document. The color values live in CSS.
 */
import { useEffect, useState } from "react";

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('themeMode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    const legacy = localStorage.getItem('darkMode');
    if (legacy !== null) return JSON.parse(legacy) ? 'dark' : 'light';
    return 'system';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const darkMode = themeMode === 'system' ? systemPrefersDark : themeMode === 'dark';

  // Apply dark mode theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('themeMode', themeMode);
  }, [darkMode, themeMode]);

  // Track OS theme changes while in "Sync with System" mode
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return {
    themeMode,
    setThemeMode,
  };
}
