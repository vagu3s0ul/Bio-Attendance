/**
 * Expo config plugin: add the WhatsApp <queries> declaration to the Android
 * manifest. Android 11+ returns `false` from Linking.canOpenURL for custom
 * schemes unless the target package is declared in <queries>, so the
 * "Notify parents" screen can't detect WhatsApp without this.
 *
 * NOTE: expo's AndroidManifest model uses the xml2js convention — element
 * attributes live under a `$` key (e.g. action: [{ $: { 'android:name': … } }]).
 * Without `$`, keys are serialized as child ELEMENTS, which the manifest
 * merger rejects.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withWhatsApp(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const q = (manifest.manifest.queries = manifest.manifest.queries || []);
    // Only add the intents once.
    const already = q.some(
      (entry) =>
        entry.intent &&
        entry.intent.some(
          (intent) =>
            intent.data &&
            intent.data.some((d) => d.$ && d.$['android:scheme'] === 'whatsapp')
        )
    );
    if (!already) {
      q.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'whatsapp' } }],
            category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
          },
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'https', 'android:host': 'wa.me' } }],
            category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
          },
        ],
      });
    }
    return config;
  });
};
