import { Button, Text, View } from '@tarojs/components';
import { useState } from 'react';

type PageStateVariant = 'empty' | 'error';

type PageStateProps = {
  variant: PageStateVariant;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void | Promise<void>;
};

type LoadingCardsProps = {
  count?: number;
  label?: string;
};

export function PageState({ variant, title, description, actionText, onAction }: PageStateProps) {
  const [actionLoading, setActionLoading] = useState(false);

  async function handleAction() {
    if (!onAction || actionLoading) return;

    setActionLoading(true);
    try {
      await onAction();
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <View className={`page-state page-state--${variant}`}>
      <View className="page-state__mark">
        <View className="page-state__mark-line page-state__mark-line-a" />
        <View className="page-state__mark-line page-state__mark-line-b" />
      </View>
      <Text className="page-state__title">{title}</Text>
      {description && <Text className="page-state__description">{description}</Text>}
      {actionText && onAction && (
        <Button className="page-state__action" disabled={actionLoading} onClick={() => void handleAction()}>
          {actionText}
        </Button>
      )}
    </View>
  );
}

export function LoadingCards({ count = 3, label = '加载中，请稍候' }: LoadingCardsProps) {
  return (
    <View className="loading-card-list">
      <Text className="loading-card-list__label">{label}</Text>
      {Array.from({ length: count }, (_, index) => (
        <View className="loading-card" key={index}>
          <View className="loading-card__line loading-card__line-title" />
          <View className="loading-card__line loading-card__line-meta" />
          <View className="loading-card__line loading-card__line-action" />
        </View>
      ))}
    </View>
  );
}
