import { defineConfig, devices } from '@playwright/test'

const servers = [
  {
    command: 'npm start',
    url: 'http://localhost:3000/api/health',
    timeout: 30_000,
    reuseExistingServer: true,
  },
]

// E2E_RUST=1 時才會啟動 Rust 後端，並執行切換後端的 e2e 測試
if (process.env.E2E_RUST) {
  servers.push({
    command: 'cargo run --manifest-path server-rust/Cargo.toml',
    url: 'http://localhost:8000/api/health',
    timeout: 120_000,
    reuseExistingServer: true,
  })
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: servers,
})
