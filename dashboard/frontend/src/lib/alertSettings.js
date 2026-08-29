const SOUND_KEY = "tezebot_sound_enabled";
const VIBRATION_KEY = "tezebot_vibration_enabled";

// Default olaraq hər ikisi açıqdır (istifadəçi Ayarlar-dan özü söndürməlidir)
export const isSoundEnabled = () => localStorage.getItem(SOUND_KEY) !== "false";
export const isVibrationEnabled = () => localStorage.getItem(VIBRATION_KEY) !== "false";

export const setSoundEnabled = (value) => localStorage.setItem(SOUND_KEY, value ? "true" : "false");
export const setVibrationEnabled = (value) => localStorage.setItem(VIBRATION_KEY, value ? "true" : "false");
