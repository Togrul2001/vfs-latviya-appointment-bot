import { playAlertSound } from "../lib/alertSound";
import { isSoundEnabled, isVibrationEnabled } from "../lib/alertSettings";
import { useLogSocket } from "../lib/useLogSocket";

const SLOT_FOUND_PATTERN = /YER TAPDI/;

// Botun tapdığı hər canlı "yer tapıldı" sətrində (Ayarlar-da açılıbsa) səs və/və ya telefon
// vibrasiyası tetiklənir. Bu komponent Layout-da qurulur ki, hansı səhifədə olursan-ol xəbərdarlığı qaçırmayasan.
export default function SlotAlert() {
  useLogSocket((line, historyDone) => {
    if (!historyDone) return;
    if (!SLOT_FOUND_PATTERN.test(line)) return;

    if (isVibrationEnabled() && navigator.vibrate) {
      try {
        navigator.vibrate([300, 100, 300, 100, 300]);
      } catch {
        // vibrasiya dəstəklənmirsə (məs. iPhone) səssiz keç
      }
    }
    if (isSoundEnabled()) playAlertSound();
  });

  return null;
}
