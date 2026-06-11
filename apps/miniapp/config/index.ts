import { defineConfig } from '@tarojs/cli';

const nodeProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
const apiBaseUrl = nodeProcess?.env?.TARO_APP_API_BASE_URL || 'http://localhost:4000';

export default defineConfig({
  projectName: 'boxing-booking-miniapp',
  date: '2026-06-09',
  designWidth: 750,
  deviceRatio: {
    640: 2.34,
    750: 1,
    828: 1.81
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  defineConstants: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl)
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true
      },
      cssModules: {
        enable: false
      }
    }
  }
});
