import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Spliit for BECU Money Manager',
    description:
      'Add BECU Money Manager transactions to your Spliit groups. Unofficial; not affiliated with BECU, MX or Spliit.',
    homepage_url: 'https://github.com/zaquestion/becu-money-manager-spliit',
    permissions: ['storage'],
    host_permissions: ['https://spliit.app/*'],
    // Self-hosted Spliit: asked for per origin from the settings page.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
});
