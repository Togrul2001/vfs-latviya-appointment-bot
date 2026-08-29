import { useEffect, useRef, useState } from "react";

// Server tarixçəni göndərib qurtarandan sonra bu sentinel-i göndərir (bax index.js).
// Bununla köhnə (artıq baş vermiş) log sətirlərini canlı yeni sətirlərdən ayırırıq —
// əks halda səhifə açılanda köhnə "yer tapıldı" sətri təzədən xəbərdarlıq doğurardı.
const HISTORY_END = "__HISTORY_END__";

export function useLogSocket(onLine) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(1000);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  useEffect(() => {
    let stopped = false;

    function scheduleReconnect() {
      setConnected(false);
      if (stopped) return;
      setTimeout(connect, retryRef.current);
      retryRef.current = Math.min(retryRef.current * 2, 15000);
    }

    function connect() {
      if (stopped) return;
      let historyDone = false;
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          retryRef.current = 1000;
        };
        ws.onmessage = (event) => {
          if (event.data === HISTORY_END) {
            historyDone = true;
            return;
          }
          onLineRef.current?.(event.data, historyDone);
        };
        ws.onclose = scheduleReconnect;
        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            // qəsdən boş
          }
        };
      } catch {
        scheduleReconnect();
      }
    }

    connect();
    return () => {
      stopped = true;
      wsRef.current?.close();
    };
  }, []);

  return connected;
}
