"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeEvent } from "./types";

// Igual que en api.ts: se calcula del origen actual del navegador (localhost
// en dev, dominio real en producción) en vez de quedar fijo a localhost.
function defaultWsUrl(): string {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/ws`;
}

export function useRealtime(token: string | null, onEvent: (event: RealtimeEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    let socket: WebSocket;
    let closedByUs = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? defaultWsUrl();
      socket = new WebSocket(`${wsUrl}?token=${token}`);
      socket.onopen = () => setConnected(true);
      socket.onmessage = (e) => {
        try {
          onEventRef.current(JSON.parse(e.data));
        } catch {
          // payload malformado, se ignora
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closedByUs) retryTimer = setTimeout(connect, 2000);
      };
    }
    connect();

    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [token]);

  return connected;
}
