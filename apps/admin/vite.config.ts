import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react-vendor';
          if (id.includes('/antd/') || id.includes('/@ant-design/')) return 'antd-vendor';
          if (id.includes('/dayjs/') || id.includes('/lucide-react/')) return 'ui-vendor';
          return 'vendor';
        }
      }
    }
  }
});
