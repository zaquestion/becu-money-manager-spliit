import { defineConfig } from 'wxt';

export default defineConfig({
  // WXT defaults Firefox to MV2.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Spliit for BECU Money Manager',
    description:
      'Add BECU Money Manager transactions to your Spliit groups. Unofficial; not affiliated with BECU, MX or Spliit.',
    homepage_url: 'https://github.com/zaquestion/becu-money-manager-spliit',
    permissions: ['storage'],
    host_permissions: ['https://spliit.app/*'],
    // Self-hosted Spliit: asked for per origin from the settings page.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'becu-money-manager-spliit@zaquestion.github.io',
          // data_collection_permissions needs 140 (MAIN-world content scripts need 128).
          strict_min_version: '140.0',
          // Transactions the user adds are sent to their Spliit server.
          data_collection_permissions: { required: ['financialAndPaymentInfo'] },
        },
      },
    }),
  }),
  zip: {
    // Firefox's sources zip; samples/ holds real captures with personal data.
    excludeSources: ['samples/**', 'store/**'],
  },
});
