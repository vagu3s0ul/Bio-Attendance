const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = 'expo-camera/android/maven';

/**
 * expo-camera 15 ships the discontinued `com.google.android:cameraview` AAR
 * inside its own `android/maven` folder, but declares it as an `api`
 * dependency. The app project resolves that dependency, so its repositories —
 * not expo-camera's — must include the folder. Without this, a fresh prebuild
 * fails with "Could not find com.google.android:cameraview:1.0.0".
 */
module.exports = function withExpoCameraMaven(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes(MARKER)) return cfg;

    const contents = cfg.modResults.contents;
    const anchor = /\n(\s*)google\(\)/;
    if (!anchor.test(contents)) return cfg;

    cfg.modResults.contents = contents.replace(
      anchor,
      `\n$1maven {\n$1    // expo-camera ships the discontinued cameraview AAR in the package.\n$1    url(new File(rootDir, '../node_modules/${MARKER}'))\n$1}\n\n$1google()`
    );
    return cfg;
  });
};
