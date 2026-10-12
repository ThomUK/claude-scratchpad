// Native app glue for the Android build (Capacitor). On the web
// window.Capacitor does not exist, so nothing here loads or runs there: the
// Capacitor core module is imported only inside the app.
export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

/**
 * Route the hardware back button through `back`, which takes one step back
 * in the app and returns false when there is nowhere left to go; the app is
 * then sent to the background (like Android's own back at a root screen),
 * so a round in progress is still there when you return.
 */
export async function initNative({ back }) {
  if (!isNative()) return;
  const { registerPlugin } = await import('./vendor/capacitor/core.js?v=cdba8160');
  const App = registerPlugin('App');
  await App.addListener('backButton', () => { if (!back()) App.minimizeApp(); });
}
