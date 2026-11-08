// Sa web (Expo Snack web), walang ginagawa ang Alert.alert ng react-native.
// Kaya walang lumalabas na error. Ang file na ito ang nag-aayos nun
// gamit ang window.alert / window.confirm. Native (Expo Go) ay hindi apektado.
import { Alert, Platform } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    console.log('[Alert]', text);
    if (Array.isArray(buttons) && buttons.length > 1) {
      const ok = window.confirm(text);
      const btn = ok
        ? buttons.find((b) => b.style !== 'cancel')
        : buttons.find((b) => b.style === 'cancel');
      if (btn && btn.onPress) btn.onPress();
    } else {
      window.alert(text);
      if (Array.isArray(buttons) && buttons[0] && buttons[0].onPress) buttons[0].onPress();
    }
  };
}
