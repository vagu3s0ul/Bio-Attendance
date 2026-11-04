module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        // Strip console.log from the shipped JS bundle (Hermes bytecode) —
        // less readable strings, smaller APK. Errors/warnings stay.
        plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
      },
    },
  };
};
