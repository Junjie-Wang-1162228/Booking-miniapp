import { PropsWithChildren } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import './app.scss';

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    if (typeof __CLOUDBASE_ENV_ID__ === 'string' && __CLOUDBASE_ENV_ID__) {
      Taro.cloud.init({ env: __CLOUDBASE_ENV_ID__ });
    }
  });

  return children;
}
