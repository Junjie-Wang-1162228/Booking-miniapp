import { View } from '@tarojs/components';

export type AppIconName =
  | 'account'
  | 'bell'
  | 'booking'
  | 'branch'
  | 'calendar'
  | 'cancel'
  | 'check'
  | 'lesson'
  | 'member';

type AppIconProps = {
  name: AppIconName;
};

export function AppIcon({ name }: AppIconProps) {
  return (
    <View className={`app-icon app-icon--${name}`}>
      <View className="app-icon__shape app-icon__shape-a" />
      <View className="app-icon__shape app-icon__shape-b" />
      <View className="app-icon__shape app-icon__shape-c" />
    </View>
  );
}
