/**
 * Error and success text at the top of the window. Each one clears itself
 * after about four and a half seconds; the close button still dismisses it
 * sooner. The transfer panel is separate and stays up on its own rules.
 */
import { useEffect, useState } from "react";

export function useBannerMessages() {
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  /** A “preset added” note used to sit until the close button. Clear it on a timer so it does not stay over the panes. */
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 4500);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(""), 4500);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  return {
    error,
    setError,
    successMessage,
    setSuccessMessage,
  };
}
