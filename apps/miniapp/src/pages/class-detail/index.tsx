import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh, useRouter } from '@tarojs/taro';
import { useState } from 'react';
import {
  createBooking,
  formatApiError,
  getClasses,
  getStoredMember,
  getStoredToken,
  requestBookingSubscriptions
} from '../../api';
import { loadMemberSession } from '../../member-session';
import { BoxingClass, MemberBranch } from '../../types';
import { formatTime } from '../../utils';
import { AppIcon, type AppIconName } from '../../components/AppIcon';
import { LoadingCards, PageState } from '../../components/PageState';
import { isBookableClass } from '../../class-availability';
import { useActionLock } from '../../use-action-lock';
import './index.scss';

function getClassAction(boxingClass: BoxingClass): { disabled: boolean; icon: AppIconName; label: string; variant: string } {
  if (boxingClass.isBookedByMe) {
    return { disabled: true, icon: 'check', label: '已预约', variant: 'is-booked' };
  }

  if (boxingClass.remainingSpots <= 0) {
    return { disabled: true, icon: 'cancel', label: '已满员', variant: 'is-full' };
  }

  return { disabled: false, icon: 'calendar', label: '立即预约', variant: 'is-open' };
}

function getClassTrainingTag(boxingClass: BoxingClass) {
  const text = `${boxingClass.title} ${boxingClass.description}`;
  if (/新手|基础|入门/.test(text)) return '新手友好';
  if (/体能|燃脂|核心|力量/.test(text)) return '燃脂体能';
  if (/实战|对抗|拳靶/.test(text)) return '实战进阶';
  return '综合训练';
}

function getEquipmentRequirement(boxingClass: BoxingClass) {
  const text = `${boxingClass.title} ${boxingClass.description}`;
  if (/拳套|绷带|护具|牙套/.test(text)) {
    return '请按课程说明准备拳套、缠手绷带或对应护具；首次体验可到店咨询工作人员。';
  }

  return '建议穿运动服、拳鞋或干净运动鞋，准备水杯和毛巾；首次体验可到店咨询装备。';
}

function getCoachInitials(coachName: string) {
  const cleaned = coachName.trim();
  if (!cleaned) return '教';

  const latinLetters = cleaned.match(/[A-Za-z]/g);
  if (latinLetters?.length) return latinLetters.slice(0, 2).join('').toUpperCase();

  return cleaned.slice(0, 2);
}

function getCoachIntro(boxingClass: BoxingClass) {
  const trainingTag = getClassTrainingTag(boxingClass);
  if (trainingTag === '新手友好') {
    return '擅长基础动作拆解和节奏带练，适合首次体验或正在打磨基本功的会员。';
  }

  if (trainingTag === '燃脂体能') {
    return '侧重体能推进、核心稳定和拳击组合训练，帮助会员在安全强度内提升出汗效率。';
  }

  if (trainingTag === '实战进阶') {
    return '侧重拳靶、步伐和攻防节奏，适合希望提高对抗意识和组合质量的会员。';
  }

  return '会根据现场人数和学员状态调整训练节奏，兼顾动作质量、体能消耗和安全提醒。';
}

export default function ClassDetailPage() {
  const router = useRouter();
  const classId = `${router.params?.id ?? ''}`;
  const routeBranchId = `${router.params?.branchId ?? ''}`;
  const [token, setToken] = useState(getStoredToken());
  const [boxingClass, setBoxingClass] = useState<BoxingClass | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<MemberBranch | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { runLocked, isActionLocked } = useActionLock();

  async function load(currentToken = token) {
    setLoading(true);
    setLoadError('');
    try {
      const session = await loadMemberSession({
        token: currentToken,
        member: getStoredMember(),
        preferredBranchId: routeBranchId
      });
      const branchId = routeBranchId || session.selectedBranchId;
      const classList = branchId ? await getClasses(session.token, branchId) : [];
      const nextClass = classList.find((item) => item.id === classId && isBookableClass(item)) ?? null;
      const nextBranch =
        session.branches.find((branch) => branch.id === (nextClass?.branchId || branchId)) ??
        session.selectedBranch ??
        null;

      setToken(session.token);
      setBoxingClass(nextClass);
      setSelectedBranch(nextBranch);
    } catch (error) {
      setLoadError(formatApiError(error, '课程详情加载失败'));
    } finally {
      setLoading(false);
    }
  }

  async function showBookingSuccessModal(reminderEnabled: boolean, remindBeforeMinutes?: number) {
    const result = await Taro.showModal({
      title: '预约成功',
      content:
        reminderEnabled && !remindBeforeMinutes
          ? '已完成预约。本次未开启课前提醒，可在“我的预约”查看记录。'
          : '已完成预约，可在“我的预约”查看记录。',
      confirmText: '查看预约',
      cancelText: '继续查看',
      confirmColor: '#e31b23'
    });

    if (result.confirm) {
      await Taro.switchTab({
        url: '/pages/bookings/index'
      });
    }
  }

  async function bookClass() {
    if (!token || !boxingClass || boxingClass.remainingSpots <= 0 || boxingClass.isBookedByMe) return;
    setLoading(true);
    try {
      const subscription = await requestBookingSubscriptions(true);
      const remindBeforeMinutes = subscription.classReminderAccepted ? 120 : undefined;
      await createBooking(token, boxingClass.id, boxingClass.branchId, {
        remindBeforeMinutes,
        bookingConfirmationSubscribed: subscription.bookingConfirmationAccepted
      });
      await load(token);
      await showBookingSuccessModal(true, remindBeforeMinutes);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '预约失败'), icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function backToClasses() {
    try {
      await Taro.navigateBack({ delta: 1 });
    } catch {
      await Taro.switchTab({
        url: '/pages/classes/index'
      });
    }
  }

  async function copyBranchAddress() {
    if (!selectedBranch?.address) return;
    await Taro.setClipboardData({
      data: selectedBranch.address
    });
    Taro.showToast({ title: '地址已复制', icon: 'success' });
  }

  async function callBranchPhone() {
    if (!selectedBranch?.phone) return;
    await Taro.makePhoneCall({
      phoneNumber: selectedBranch.phone
    });
  }

  async function refreshPage() {
    try {
      await load(getStoredToken());
    } finally {
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => {
    void load(getStoredToken());
  });

  usePullDownRefresh(() => {
    void refreshPage();
  });

  if (loading && !boxingClass) {
    return (
      <View className="page class-detail-page">
        <LoadingCards />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="page class-detail-page">
        <PageState
          variant="error"
          title="课程详情加载失败"
          description={loadError}
          actionText="重新加载"
          onAction={() => load(token)}
        />
      </View>
    );
  }

  if (!classId || !boxingClass) {
    return (
      <View className="page class-detail-page">
        <PageState
          variant="empty"
          title="课程不存在或暂不可预约"
          description="这节课可能已经下架、取消或不属于当前门店。"
          actionText="返回约课"
          onAction={() => backToClasses()}
        />
      </View>
    );
  }

  const action = getClassAction(boxingClass);
  const branchName = boxingClass.branchName ?? selectedBranch?.name ?? '当前门店';
  const coachInitials = getCoachInitials(boxingClass.coach);
  const coachIntro = getCoachIntro(boxingClass);

  return (
    <View className="page class-detail-page">
      <View className="detail-hero">
        <Text className="detail-kicker">{branchName}</Text>
        <Text className="detail-title">{boxingClass.title}</Text>
        <Text className="detail-meta">
          {formatTime(boxingClass.startsAt)} · {boxingClass.durationMin} 分钟 · 教练 {boxingClass.coach}
        </Text>
        <Text className={`detail-pill ${boxingClass.isBookedByMe ? 'is-booked' : boxingClass.remainingSpots > 0 ? 'is-open' : ''}`}>
          {boxingClass.isBookedByMe ? '已预约' : `剩 ${boxingClass.remainingSpots} 位 / 共 ${boxingClass.capacity} 位`}
        </Text>
      </View>

      <View className="detail-section">
        <Text className="detail-section-title">训练内容</Text>
        <Text className="detail-section-copy">{boxingClass.description || '以拳击基础、体能和实战动作组合为主，按当日课程安排调整。'}</Text>
      </View>

      <View className="detail-section">
        <Text className="detail-section-title">适合人群</Text>
        <Text className="detail-section-copy">
          {getClassTrainingTag(boxingClass)}。如有旧伤或身体不适，请开课前主动告知教练。
        </Text>
      </View>

      <View className="detail-section">
        <Text className="detail-section-title">装备要求</Text>
        <Text className="detail-section-copy">{getEquipmentRequirement(boxingClass)}</Text>
      </View>

      <View className="detail-section">
        <Text className="detail-section-title">取消规则</Text>
        <Text className="detail-section-copy">开课前 2 小时以外可在“预约”页取消；截止后请联系拳馆工作人员处理。</Text>
      </View>

      <View className="detail-section">
        <Text className="detail-section-title">门店信息</Text>
        <Text className="detail-section-copy">{branchName}</Text>
        <Text className="detail-section-copy">{selectedBranch?.address ?? '门店地址请咨询拳馆工作人员。'}</Text>
        <Text className="detail-section-copy">{selectedBranch?.phone ? `电话 ${selectedBranch.phone}` : '联系电话请查看拳馆公告或咨询工作人员。'}</Text>
        {(selectedBranch?.address || selectedBranch?.phone) && (
          <View className="branch-action-row">
            {selectedBranch?.address && (
              <Button
                className="branch-action-button"
                disabled={isActionLocked('copy-branch-address')}
                onClick={() => void runLocked('copy-branch-address', copyBranchAddress)}
              >
                <AppIcon name="branch" />
                复制地址
              </Button>
            )}
            {selectedBranch?.phone && (
              <Button
                className="branch-action-button"
                disabled={isActionLocked('call-branch-phone')}
                onClick={() => void runLocked('call-branch-phone', callBranchPhone)}
              >
                <AppIcon name="account" />
                拨打电话
              </Button>
            )}
          </View>
        )}
      </View>

      <View className="detail-section">
        <Text className="detail-section-title">教练简介</Text>
        <View className="coach-profile">
          <View className="coach-avatar">
            <Text className="coach-avatar__text">{coachInitials}</Text>
          </View>
          <View className="coach-copy">
            <Text className="coach-name">{boxingClass.coach}</Text>
            <Text className="coach-bio">{coachIntro}</Text>
            <Text className="coach-note">训练中如有旧伤、体能不适或动作疑问，请提前告知教练。</Text>
          </View>
        </View>
      </View>

      <View className="detail-action-row">
        <Button
          className="detail-secondary-action"
          disabled={isActionLocked('back-to-classes')}
          onClick={() => void runLocked('back-to-classes', backToClasses)}
        >
          返回约课
        </Button>
        <Button
          className={`detail-primary-action ${action.variant}`}
          disabled={loading || action.disabled || isActionLocked('book:' + boxingClass.id)}
          onClick={() => void runLocked('book:' + boxingClass.id, bookClass)}
        >
          <AppIcon name={action.icon} />
          {action.label}
        </Button>
      </View>
    </View>
  );
}
