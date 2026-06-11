import { Text, View } from '@tarojs/components';

type BrandLogoProps = {
  label?: string;
  subLabel?: string;
};

export function BrandLogo({ label = 'BOXING CLUB', subLabel = 'CLASS BOOKING' }: BrandLogoProps) {
  return (
    <View className="brand-logo">
      <View className="brand-logo__mark">
        <Text className="brand-logo__mark-text">拳</Text>
      </View>
      <View className="brand-logo__copy">
        <Text className="brand-logo__label">{label}</Text>
        <Text className="brand-logo__sub-label">{subLabel}</Text>
      </View>
    </View>
  );
}
