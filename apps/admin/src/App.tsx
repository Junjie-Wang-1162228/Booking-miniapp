import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { CalendarPlus, Dumbbell, LogOut, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelClass,
  createClass,
  deductBooking,
  getAdminBranches,
  getAdminBookings,
  getAdminClasses,
  getAdminDeductions,
  loginAdmin,
  updateClass
} from './api';
import { AdminBooking, AdminBranch, AdminClass, AuthUser, CreateClassInput, Deduction } from './types';

type ClassFormValues = Omit<CreateClassInput, 'startsAt'> & {
  startsAtLocal: string;
};

const storedToken = localStorage.getItem('admin_token');
const storedUser = localStorage.getItem('admin_user');
const storedBranchId = localStorage.getItem('admin_branch_id') ?? '';

function statusTag(status: string) {
  if (status === 'BOOKED' || status === 'SCHEDULED') return <Tag color="green">{status}</Tag>;
  if (status === 'ATTENDED') return <Tag color="red">{status}</Tag>;
  if (status === 'CANCELED') return <Tag color="default">{status}</Tag>;
  return <Tag color="gold">{status}</Tag>;
}

function toIsoFromLocal(value: string) {
  return new Date(value).toISOString();
}

function toLocalInputValue(value: string) {
  return dayjs(value).format('YYYY-MM-DDTHH:mm');
}

function canSelectAllBranches(branches: AdminBranch[]) {
  return branches.some((branch) => branch.staffRole === 'OWNER');
}

function resolveAdminBranchId(branches: AdminBranch[], preferredBranchId: string) {
  const canSelectAll = canSelectAllBranches(branches);
  if (canSelectAll && preferredBranchId === '') return '';
  if (preferredBranchId && branches.some((branch) => branch.id === preferredBranchId)) return preferredBranchId;
  return canSelectAll ? '' : branches[0]?.id ?? '';
}

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [token, setToken] = useState<string | null>(storedToken);
  const [user, setUser] = useState<AuthUser | null>(storedUser ? (JSON.parse(storedUser) as AuthUser) : null);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(storedBranchId);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingFilters, setBookingFilters] = useState({ date: '', q: '', status: '' });
  const [editingClass, setEditingClass] = useState<AdminClass | null>(null);
  const [deductingBooking, setDeductingBooking] = useState<AdminBooking | null>(null);
  const [deductNote, setDeductNote] = useState('');
  const [classForm] = Form.useForm<ClassFormValues>();

  const isLoggedIn = Boolean(token && user);
  const selectedBranchName =
    selectedBranchId === ''
      ? '全部门店'
      : branches.find((branch) => branch.id === selectedBranchId)?.name ?? '当前门店';
  const branchOptions = useMemo(
    () => [
      ...(canSelectAllBranches(branches) ? [{ value: '', label: '全部门店' }] : []),
      ...branches.map((branch) => ({ value: branch.id, label: `${branch.name} · ${branch.staffRole}` }))
    ],
    [branches]
  );
  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  async function loadBookings(currentToken = token, branchId = selectedBranchId) {
    if (!currentToken) return;
    const data = await getAdminBookings(currentToken, { ...bookingFilters, branchId });
    setBookings(data);
  }

  async function loadClasses(currentToken = token, branchId = selectedBranchId) {
    if (!currentToken) return;
    const data = await getAdminClasses(currentToken, branchId || undefined);
    setClasses(data);
  }

  async function loadDeductions(currentToken = token, branchId = selectedBranchId) {
    if (!currentToken) return;
    const data = await getAdminDeductions(currentToken, branchId || undefined);
    setDeductions(data);
  }

  async function refreshAll(currentToken = token, preferredBranchId = selectedBranchId) {
    if (!currentToken) return;
    setLoading(true);
    try {
      const nextBranches = await getAdminBranches(currentToken);
      const nextBranchId = resolveAdminBranchId(nextBranches, preferredBranchId);
      localStorage.setItem('admin_branch_id', nextBranchId);
      setBranches(nextBranches);
      setSelectedBranchId(nextBranchId);
      await Promise.all([
        loadBookings(currentToken, nextBranchId),
        loadClasses(currentToken, nextBranchId),
        loadDeductions(currentToken, nextBranchId)
      ]);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoggedIn) {
      void refreshAll();
    }
  }, [isLoggedIn]);

  async function handleLogin(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const response = await loginAdmin(values.username, values.password);
      localStorage.setItem('admin_token', response.accessToken);
      localStorage.setItem('admin_user', JSON.stringify(response.user));
      setToken(response.accessToken);
      setUser(response.user);
      messageApi.success('已登录后台');
      await refreshAll(response.accessToken);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('admin_branch_id');
    setToken(null);
    setUser(null);
    setBranches([]);
    setSelectedBranchId('');
    setBookings([]);
    setClasses([]);
    setDeductions([]);
  }

  async function handleBranchChange(branchId: string) {
    localStorage.setItem('admin_branch_id', branchId);
    setSelectedBranchId(branchId);
    await refreshAll(token, branchId);
  }

  function startCreateClass() {
    setEditingClass(null);
    classForm.resetFields();
    classForm.setFieldsValue({
      branchId: selectedBranchId || branches[0]?.id,
      durationMin: 60,
      capacity: 8,
      startsAtLocal: dayjs().add(1, 'day').hour(19).minute(30).format('YYYY-MM-DDTHH:mm')
    });
  }

  function startEditClass(record: AdminClass) {
    setEditingClass(record);
    classForm.setFieldsValue({
      branchId: record.branchId,
      title: record.title,
      coach: record.coach,
      startsAtLocal: toLocalInputValue(record.startsAt),
      durationMin: record.durationMin,
      capacity: record.capacity,
      description: record.description
    });
  }

  async function submitClass(values: ClassFormValues) {
    if (!token) return;
    const classDetails = {
      title: values.title,
      coach: values.coach,
      startsAt: toIsoFromLocal(values.startsAtLocal),
      durationMin: values.durationMin,
      capacity: values.capacity,
      description: values.description
    };

    setLoading(true);
    try {
      if (editingClass) {
        await updateClass(token, editingClass.id, classDetails);
        messageApi.success('课程已更新');
      } else {
        const payload: CreateClassInput = {
          ...classDetails,
          branchId: values.branchId
        };
        await createClass(token, payload);
        messageApi.success('课程已创建');
      }
      setEditingClass(null);
      classForm.resetFields();
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '课程保存失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelClass(record: AdminClass) {
    if (!token) return;
    Modal.confirm({
      title: '取消这节课？',
      content: `${record.title} / ${dayjs(record.startsAt).format('MM月DD日 HH:mm')}`,
      okText: '确认取消',
      okButtonProps: { danger: true },
      cancelText: '保留',
      onOk: async () => {
        await cancelClass(token, record.id);
        messageApi.success('课程已取消');
        await refreshAll();
      }
    });
  }

  async function confirmDeduct() {
    if (!token || !deductingBooking) return;
    setLoading(true);
    try {
      await deductBooking(token, deductingBooking.id, deductNote || undefined);
      messageApi.success('消课完成');
      setDeductingBooking(null);
      setDeductNote('');
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '消课失败');
    } finally {
      setLoading(false);
    }
  }

  const bookingColumns: ColumnsType<AdminBooking> = useMemo(
    () => [
      {
        title: '课程',
        dataIndex: ['boxingClass', 'title'],
        render: (_value, record) => (
          <div>
            <strong>{record.boxingClass.title}</strong>
            <div className="subtle">{record.boxingClass.coach}</div>
          </div>
        )
      },
      {
        title: '时间',
        dataIndex: ['boxingClass', 'startsAt'],
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{branchNameById.get(record.branchId) ?? '-'}</Tag>
      },
      {
        title: '会员',
        dataIndex: ['member', 'displayName'],
        render: (_value, record) => (
          <div>
            <strong>{record.member.displayName}</strong>
            <div className="subtle">{record.member.phone || '未填手机号'}</div>
          </div>
        )
      },
      {
        title: '状态',
        render: (_value, record) => (
          <Space size={4}>
            {statusTag(record.status)}
            {statusTag(record.attendanceStatus)}
          </Space>
        )
      },
      {
        title: '操作',
        render: (_value, record) => (
          <Button
            danger
            disabled={record.status !== 'BOOKED' || record.attendanceStatus === 'ATTENDED' || Boolean(record.deductionId)}
            onClick={() => setDeductingBooking(record)}
          >
            消课
          </Button>
        )
      }
    ],
    [branchNameById]
  );

  const classColumns: ColumnsType<AdminClass> = useMemo(
    () => [
      {
        title: '课程',
        render: (_value, record) => (
          <div>
            <strong>{record.title}</strong>
            <div className="subtle">{record.description}</div>
          </div>
        )
      },
      { title: '教练', dataIndex: 'coach' },
      {
        title: '门店',
        render: (_value, record) => <Tag>{record.branchName ?? branchNameById.get(record.branchId) ?? '-'}</Tag>
      },
      {
        title: '时间',
        dataIndex: 'startsAt',
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      {
        title: '名额',
        render: (_value, record) => `${record.remainingSpots}/${record.capacity}`
      },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: string) => statusTag(value)
      },
      {
        title: '操作',
        render: (_value, record) => (
          <Space>
            <Button onClick={() => startEditClass(record)}>编辑</Button>
            <Button danger disabled={record.status === 'CANCELED'} onClick={() => void handleCancelClass(record)}>
              取消
            </Button>
          </Space>
        )
      }
    ],
    [branchNameById]
  );

  const deductionColumns: ColumnsType<Deduction> = useMemo(
    () => [
      {
        title: '会员',
        render: (_value, record) => (
          <div>
            <strong>{record.member.displayName}</strong>
            <div className="subtle">{record.member.phone || '未填手机号'}</div>
          </div>
        )
      },
      {
        title: '课程',
        render: (_value, record) => (
          <div>
            <strong>{record.boxingClass.title}</strong>
            <div className="subtle">{record.boxingClass.coach}</div>
          </div>
        )
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{branchNameById.get(record.branchId) ?? '-'}</Tag>
      },
      {
        title: '消课时间',
        dataIndex: 'createdAt',
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      { title: '数量', dataIndex: 'amount' },
      { title: '备注', dataIndex: 'note', render: (value: string | null) => value || '-' }
    ],
    [branchNameById]
  );

  const tabItems = [
    {
      key: 'bookings',
      label: '预约消课',
      children: (
        <section className="panel">
          <div className="toolbar">
            <Input
              className="search-input"
              prefix={<Search size={16} />}
              placeholder="会员、手机号或课程"
              value={bookingFilters.q}
              onChange={(event) => setBookingFilters((current) => ({ ...current, q: event.target.value }))}
            />
            <input
              className="native-input"
              type="date"
              value={bookingFilters.date}
              onChange={(event) => setBookingFilters((current) => ({ ...current, date: event.target.value }))}
            />
            <Select
              className="status-select"
              value={bookingFilters.status}
              onChange={(value) => setBookingFilters((current) => ({ ...current, status: value }))}
              options={[
                { value: '', label: '全部状态' },
                { value: 'BOOKED', label: '已预约' },
                { value: 'CANCELED', label: '已取消' }
              ]}
            />
            <Button icon={<RefreshCw size={16} />} onClick={() => void refreshAll()} loading={loading}>
              刷新
            </Button>
          </div>
          <Table rowKey="id" columns={bookingColumns} dataSource={bookings} loading={loading} pagination={{ pageSize: 8 }} />
        </section>
      )
    },
    {
      key: 'classes',
      label: '课程管理',
      children: (
        <section className="class-grid">
          <div className="panel">
            <div className="panel-title">
              <CalendarPlus size={18} />
              {editingClass ? '编辑课程' : '新建课程'}
            </div>
            <Form form={classForm} layout="vertical" onFinish={(values) => void submitClass(values)}>
              <Form.Item name="title" label="课程名" rules={[{ required: true, message: '请输入课程名' }]}>
                <Input placeholder="基础拳击燃脂" />
              </Form.Item>
              <Form.Item name="coach" label="教练" rules={[{ required: true, message: '请输入教练' }]}>
                <Input placeholder="Coach Leo" />
              </Form.Item>
              <Form.Item name="branchId" label="门店" rules={[{ required: true, message: '请选择门店' }]}>
                <Select
                  disabled={Boolean(editingClass)}
                  options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                />
              </Form.Item>
              <Form.Item name="startsAtLocal" label="上课时间" rules={[{ required: true, message: '请选择上课时间' }]}>
                <input className="native-input full" type="datetime-local" />
              </Form.Item>
              <div className="two-columns">
                <Form.Item name="durationMin" label="时长" rules={[{ required: true }]}>
                  <InputNumber min={30} max={240} addonAfter="分钟" />
                </Form.Item>
                <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
                  <InputNumber min={1} max={100} addonAfter="人" />
                </Form.Item>
              </div>
              <Form.Item name="description" label="说明" rules={[{ required: true, message: '请输入说明' }]}>
                <Input.TextArea rows={4} placeholder="训练重点、适合人群、强度说明" />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  {editingClass ? '保存课程' : '创建课程'}
                </Button>
                <Button onClick={startCreateClass}>清空</Button>
              </Space>
            </Form>
          </div>
          <div className="panel">
            <Table rowKey="id" columns={classColumns} dataSource={classes} loading={loading} pagination={{ pageSize: 8 }} />
          </div>
        </section>
      )
    },
    {
      key: 'deductions',
      label: '消课记录',
      children: (
        <section className="panel">
          <Table rowKey="id" columns={deductionColumns} dataSource={deductions} loading={loading} pagination={{ pageSize: 10 }} />
        </section>
      )
    }
  ];

  if (!isLoggedIn) {
    return (
      <main className="login-page">
        {contextHolder}
        <section className="login-panel">
          <div className="brand-mark">
            <Dumbbell size={28} />
          </div>
          <h1>拳馆约课后台</h1>
          <p>管理员工作台</p>
          <Form layout="vertical" onFinish={(values) => void handleLogin(values)} initialValues={{ username: 'admin' }}>
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      {contextHolder}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Dumbbell size={22} />
          </div>
          <div>
            <h1>拳馆约课后台</h1>
            <p>Booking Ops</p>
          </div>
        </div>
        <Space>
          <Tag icon={<ShieldCheck size={14} />} color="red">
            {user?.displayName}
          </Tag>
          <Button icon={<LogOut size={16} />} onClick={handleLogout}>
            退出
          </Button>
        </Space>
      </header>
      <section className="branch-bar">
        <div>
          <div className="branch-bar-label">门店范围</div>
          <div className="branch-bar-value">{selectedBranchName}</div>
        </div>
        <Select
          className="branch-select"
          value={selectedBranchId}
          options={branchOptions}
          disabled={loading || branchOptions.length <= 1}
          onChange={(value) => void handleBranchChange(value)}
        />
      </section>
      <Tabs className="work-tabs" items={tabItems} />
      <Modal
        title="确认消课"
        open={Boolean(deductingBooking)}
        okText="确认消课"
        cancelText="取消"
        okButtonProps={{ danger: true, loading }}
        onOk={() => void confirmDeduct()}
        onCancel={() => {
          setDeductingBooking(null);
          setDeductNote('');
        }}
      >
        <p>
          {deductingBooking?.member.displayName} / {deductingBooking?.boxingClass.title}
        </p>
        <Input.TextArea
          rows={3}
          placeholder="备注，例如：到店上课"
          value={deductNote}
          onChange={(event) => setDeductNote(event.target.value)}
        />
      </Modal>
    </main>
  );
}
