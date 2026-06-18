import { Image, Text, View } from '@tarojs/components';
import zhenzhiLogo from '../assets/brand/zhenzhi-logo.jpg';

type BrandLogoProps = {
  label?: string;
  subLabel?: string;
};

export function BrandLogo({ label = '真知格斗', subLabel = 'ZHENZHIGEDOU' }: BrandLogoProps) {
  return (
    <View className="brand-logo">
      <View className="brand-logo__mark">
        <Image className="brand-logo__image" src={zhenzhiLogo} mode="aspectFit" />
      </View>
      <View className="brand-logo__copy">
        <Text className="brand-logo__label">{label}</Text>
        <Text className="brand-logo__sub-label">{subLabel}</Text>
      </View>
    </View>
  );
}
