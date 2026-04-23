"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[Ambo] Service worker registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("[Ambo] Service worker registration failed:", err);
        });
    }
  }, []);

  return null;
}
