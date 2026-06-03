import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  LoadingOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getTask, getTaskTrace, regenerateShot, updateShot } from '../api/task';
import { useTaskSSE } from '../hooks/useTaskSSE';

import type { ShotDto, ShotStatus, TaskStatus, UpdateShotReq } from '@tiktop/shared';

const { Title, Text, Paragraph } = Typography;

const TASK_STATUS_LABEL: Record<TaskStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'default' },
  script_generating: { label: '剧本生成中', color: 'processing' },
  script_ready: { label: '剧本就绪', color: 'cyan' },
  shots_running: { label: '分镜生成中', color: 'processing' },
  stitching: { label: '视频拼接中', color: 'processing' },
  succeeded: { label: '生成完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
};

const SHOT_ICON: Record<ShotStatus, React.ReactNode> = {
  pending: <ClockCircleOutlined style={{ color: '#bfbfbf' }} />,
  img_ok: <LoadingOutlined style={{ color: '#1677ff' }} />,
  video_ok: <CheckCircleFilled style={{ color: '#52c41a' }} />,
  failed: <CloseCircleFilled style={{ color: '#ff4d4f' }} />,
};

const SHOT_STATUS_LABEL: Record<ShotStatus, string> = {
  pending: '等待生成',
  img_ok: '图片就绪',
  video_ok: '视频就绪',
  failed: '失败',
};

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sseEvent = useTaskSSE(id);
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<UpdateShotReq>();
  const [editingShot, setEditingShot] = useState<ShotDto | null>(null);

  const taskQuery = useQuery({
    queryKey: ['task', id],
    queryFn: () => getTask(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status) return 3000;
      if (status === 'succeeded' || status === 'failed') return false;
      return 3000;
    },
  });

  const traceQuery = useQuery({
    queryKey: ['task-trace', id],
    queryFn: () => getTaskTrace(id!),
    enabled: !!id,
    refetchInterval: taskQuery.data?.status === 'succeeded' ? false : 3000,
  });

  const updateMutation = useMutation({
    mutationFn: async (values: UpdateShotReq) => {
      if (!id || !editingShot) throw new Error('缺少分镜信息');
      return updateShot(id, editingShot.id, values);
    },
    onSuccess: () => {
      message.success('分镜已更新');
      setEditingShot(null);
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (shotId: string) => {
      if (!id) throw new Error('缺少任务信息');
      return regenerateShot(id, shotId);
    },
    onSuccess: () => {
      message.success('分镜重生成已启动');
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['task-trace', id] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  useEffect(() => {
    if (sseEvent?.taskId === id) {
      taskQuery.refetch();
      traceQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sseEvent?.updatedAt, sseEvent?.status, id]);

  useEffect(() => {
    if (editingShot) {
      form.setFieldsValue({
        description: editingShot.description,
        cameraMotion: editingShot.cameraMotion,
        prompt: editingShot.prompt ?? undefined,
        subtitle: editingShot.subtitle ?? undefined,
        bgmHint: editingShot.bgmHint ?? undefined,
        durationSec: editingShot.durationSec,
        sourceMaterialId: editingShot.sourceMaterialId ?? undefined,
      });
    }
  }, [editingShot, form]);

  if (!id) return <Empty description="缺少任务 ID" />;
  if (taskQuery.isLoading) return <Card loading />;
  if (taskQuery.error) return <Alert type="error" message={(taskQuery.error as Error).message} />;
  const task = taskQuery.data;
  if (!task) return <Empty description="任务不存在" />;

  const editingPlan = task.editingPlan;
  const statusInfo = TASK_STATUS_LABEL[task.status];
  const progress = task.shots.length
    ? Math.round(
        (task.shots.filter((s) => s.status === 'video_ok').length / task.shots.length) * 100,
      )
    : 0;
  const finalProgress =
    task.status === 'succeeded'
      ? 100
      : Math.max(progress, task.status === 'stitching' ? 90 : progress);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          任务详情
        </Title>
        <Space size={8} wrap>
          <Tag>task:{task.id.slice(0, 12)}</Tag>
          <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
          <Tag>{task.ratio}</Tag>
          {sseEvent?.currentStage && <Tag color="blue">{sseEvent.currentStage}</Tag>}
        </Space>
      </div>

      <Card>
        <Progress
          percent={finalProgress}
          status={
            task.status === 'failed'
              ? 'exception'
              : task.status === 'succeeded'
                ? 'success'
                : 'active'
          }
        />
        <Text type="secondary">
          已完成分镜 {task.shots.filter((s) => s.status === 'video_ok').length} /{' '}
          {task.shots.length}
        </Text>
      </Card>

      {editingPlan ? (
        <Card
          title={
            <Space size={8} wrap>
              <span>本任务使用的智能分镜方案</span>
              <Tag color="blue">{editingPlan.id}</Tag>
              <Tag>{editingPlan.shots.length} 个计划分镜</Tag>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="绑定任务">
                <Space size={6} wrap>
                  <Tag>task:{task.id.slice(0, 12)}</Tag>
                  <Tag>editingPlan:{task.editingPlanId}</Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="生成时间">
                {new Date(editingPlan.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Agent/RAG 策略">{editingPlan.strategy}</Descriptions.Item>
              <Descriptions.Item label="追溯说明">
                该区域展示的是创建视频任务时绑定并落库的 EditingPlan。下面每个分镜的素材 ID、
                生成 Prompt 和 Agent 原因，都是视频生成前的 RAG 检索与 LLM 规划结果。
              </Descriptions.Item>
            </Descriptions>

            <Row gutter={[12, 12]}>
              {editingPlan.shots.map((planned) => {
                const shot = task.shots.find((item) => item.idx === planned.idx);
                return (
                  <Col xs={24} lg={8} key={planned.idx}>
                    <Card
                      size="small"
                      title={
                        <Space size={6} wrap>
                          <Tag color="magenta">分镜 {planned.idx + 1}</Tag>
                          <Tag>{planned.durationSec}s</Tag>
                          {shot && <Tag color="cyan">当前: {SHOT_STATUS_LABEL[shot.status]}</Tag>}
                        </Space>
                      }
                    >
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>
                          Prompt: {planned.prompt}
                        </Paragraph>
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                          字幕: {planned.subtitle || '无'}
                        </Paragraph>
                        <Space size={4} wrap>
                          <Tag color="purple">BGM: {planned.bgmHint || '无'}</Tag>
                          {planned.sourceMaterialId ? (
                            <Tag color="geekblue">素材: {planned.sourceMaterialId}</Tag>
                          ) : (
                            <Tag>未绑定素材</Tag>
                          )}
                        </Space>
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                          Agent/RAG 原因: {planned.reason}
                        </Paragraph>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            <Collapse
              size="small"
              items={[
                {
                  key: 'editing-plan-trace',
                  label: `EditingPlan / RAG Trace (${editingPlan.trace.length})`,
                  children: editingPlan.trace.length ? (
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      {editingPlan.trace.map((item, index) => (
                        <Card key={`${item.stage}-${index}`} size="small">
                          <Space size={6} wrap>
                            <Tag color="blue">{item.stage}</Tag>
                            <Text type="secondary">{item.message}</Text>
                          </Space>
                          {item.payload && (
                            <pre
                              style={{
                                background: '#fafafa',
                                margin: '8px 0 0',
                                padding: 8,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {JSON.stringify(item.payload, null, 2)}
                            </pre>
                          )}
                        </Card>
                      ))}
                    </Space>
                  ) : (
                    <Empty description="暂无 EditingPlan trace" />
                  ),
                },
              ]}
            />
          </Space>
        </Card>
      ) : (
        <Alert
          type="warning"
          showIcon
          message="该任务没有绑定智能分镜方案"
          description="这通常是旧任务，或者创建任务时没有保存 editingPlanId，因此只能看到 Shot 复制字段，无法完整回看当时的 Agent/RAG 决策。"
        />
      )}

      {task.status === 'failed' && (
        <Alert type="error" showIcon message="任务失败" description={task.errorMsg ?? '未知错误'} />
      )}

      {task.status === 'succeeded' && (
        <Alert
          type="success"
          showIcon
          message="视频生成完成"
          description={
            <Space>
              <Link to={`/tasks/${task.id}/preview`}>
                <Button type="primary" icon={<PlayCircleOutlined />}>
                  前往预览
                </Button>
              </Link>
            </Space>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        {task.shots.map((shot) => (
          <Col xs={24} md={12} lg={8} key={shot.id}>
            <Card
              size="small"
              title={
                <Space size={6} wrap>
                  {SHOT_ICON[shot.status]}
                  <span>分镜 {shot.idx + 1}</span>
                  <Tag>{shot.durationSec}s</Tag>
                  {shot.retryCount ? <Tag color="orange">retry {shot.retryCount}</Tag> : null}
                </Space>
              }
              cover={
                shot.clipUrl ? (
                  <video
                    src={shot.clipUrl}
                    controls
                    muted
                    style={{ width: '100%', height: 200, objectFit: 'cover', background: '#000' }}
                  />
                ) : (
                  <div
                    style={{
                      height: 200,
                      background: '#fafafa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#bfbfbf',
                    }}
                  >
                    {shot.status === 'failed' ? '失败' : '等待生成'}
                  </div>
                )
              }
              actions={[
                <Button key="edit" type="text" onClick={() => setEditingShot(shot)}>
                  编辑
                </Button>,
                <Button
                  key="regen"
                  type="text"
                  loading={regenerateMutation.isPending && regenerateMutation.variables === shot.id}
                  disabled={regenerateMutation.isPending}
                  onClick={() => regenerateMutation.mutate(shot.id)}
                >
                  重生成
                </Button>,
              ]}
            >
              <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 6, fontSize: 13 }}>
                {shot.description}
              </Paragraph>
              {shot.prompt && (
                <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ fontSize: 12 }}>
                  Prompt: {shot.prompt}
                </Paragraph>
              )}
              <Space size={4} wrap>
                <Tag color="geekblue">{shot.cameraMotion || '默认镜头'}</Tag>
                {shot.subtitle && <Tag color="green">字幕</Tag>}
                {shot.bgmHint && <Tag color="purple">BGM</Tag>}
              </Space>
              {shot.errorMsg && (
                <Paragraph type="danger" style={{ fontSize: 12, marginTop: 4 }}>
                  {shot.errorMsg}
                </Paragraph>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Collapse
        items={[
          {
            key: 'trace',
            label: `Agent 生成过程 Trace (${traceQuery.data?.length ?? 0})`,
            children: traceQuery.isLoading ? (
              <Card loading />
            ) : !traceQuery.data?.length ? (
              <Empty description="暂无 trace" />
            ) : (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {traceQuery.data.map((item) => (
                  <Card key={item.id} size="small">
                    <Space size={6} wrap>
                      <Tag color={item.level === 'error' ? 'red' : item.level === 'warn' ? 'orange' : 'blue'}>
                        {item.level}
                      </Tag>
                      <Tag>{item.stage}</Tag>
                      {item.shotId && <Tag>shot:{item.shotId.slice(-4)}</Tag>}
                      <Text type="secondary">{new Date(item.createdAt).toLocaleString()}</Text>
                    </Space>
                    <Paragraph style={{ margin: '8px 0 0' }}>{item.message}</Paragraph>
                  </Card>
                ))}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingShot ? `编辑分镜 ${editingShot.idx + 1}` : '编辑分镜'}
        open={!!editingShot}
        onCancel={() => setEditingShot(null)}
        onOk={() => form.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
          <Form.Item name="description" label="画面描述" rules={[{ required: true, min: 2, max: 400 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="cameraMotion" label="镜头运动">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="prompt" label="Prompt">
            <Input.TextArea rows={4} maxLength={800} />
          </Form.Item>
          <Form.Item name="subtitle" label="字幕">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="bgmHint" label="BGM 提示">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="durationSec" label="时长">
            <InputNumber min={4} max={12} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sourceMaterialId" label="素材 ID">
            <Input allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
