const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  reporter: 'list',
  use: {
    headless: true,
    viewport: { width: 1440, height: 1080 },
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ['--no-sandbox']
    }
  },
  outputDir: 'test-results'
});
