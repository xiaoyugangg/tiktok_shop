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
  queued: { label: 'Queued', color: 'default' },
  script_generating: { label: 'Script generating', color: 'processing' },
  script_ready: { label: 'Script ready', color: 'cyan' },
  shots_running: { label: 'Shots running', color: 'processing' },
  stitching: { label: 'Stitching', color: 'processing' },
  succeeded: { label: 'Succeeded', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};

const SHOT_ICON: Record<ShotStatus, React.ReactNode> = {
  pending: <ClockCircleOutlined style={{ color: '#bfbfbf' }} />,
  img_ok: <LoadingOutlined style={{ color: '#1677ff' }} />,
  video_ok: <CheckCircleFilled style={{ color: '#52c41a' }} />,
  failed: <CloseCircleFilled style={{ color: '#ff4d4f' }} />,
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
      if (!id || !editingShot) throw new Error('Missing shot');
      return updateShot(id, editingShot.id, values);
    },
    onSuccess: () => {
      message.success('Shot updated');
      setEditingShot(null);
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (shotId: string) => {
      if (!id) throw new Error('Missing task');
      return regenerateShot(id, shotId);
    },
    onSuccess: () => {
      message.success('Shot regeneration started');
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

  if (!id) return <Empty description="Task id missing" />;
  if (taskQuery.isLoading) return <Card loading />;
  if (taskQuery.error) return <Alert type="error" message={(taskQuery.error as Error).message} />;
  const task = taskQuery.data;
  if (!task) return <Empty description="Task not found" />;

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
          Task Detail
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
          Completed shots {task.shots.filter((s) => s.status === 'video_ok').length} /{' '}
          {task.shots.length}
        </Text>
      </Card>

      {task.status === 'failed' && (
        <Alert type="error" showIcon message="Task failed" description={task.errorMsg ?? 'Unknown error'} />
      )}

      {task.status === 'succeeded' && (
        <Alert
          type="success"
          showIcon
          message="Video generated"
          description={
            <Space>
              <Link to={`/tasks/${task.id}/preview`}>
                <Button type="primary" icon={<PlayCircleOutlined />}>
                  Preview
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
                  <span>Shot {shot.idx + 1}</span>
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
                    {shot.status === 'failed' ? 'Failed' : 'Waiting'}
                  </div>
                )
              }
              actions={[
                <Button key="edit" type="text" onClick={() => setEditingShot(shot)}>
                  Edit
                </Button>,
                <Button
                  key="regen"
                  type="text"
                  loading={regenerateMutation.isPending && regenerateMutation.variables === shot.id}
                  disabled={regenerateMutation.isPending}
                  onClick={() => regenerateMutation.mutate(shot.id)}
                >
                  Regenerate
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
                <Tag color="geekblue">{shot.cameraMotion || 'default camera'}</Tag>
                {shot.subtitle && <Tag color="green">Subtitle</Tag>}
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
            label: `Agent Trace (${traceQuery.data?.length ?? 0})`,
            children: traceQuery.isLoading ? (
              <Card loading />
            ) : !traceQuery.data?.length ? (
              <Empty description="No trace yet" />
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
        title={editingShot ? `Edit Shot ${editingShot.idx + 1}` : 'Edit Shot'}
        open={!!editingShot}
        onCancel={() => setEditingShot(null)}
        onOk={() => form.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
          <Form.Item name="description" label="Description" rules={[{ required: true, min: 2, max: 400 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="cameraMotion" label="Camera motion">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="prompt" label="Prompt">
            <Input.TextArea rows={4} maxLength={800} />
          </Form.Item>
          <Form.Item name="subtitle" label="Subtitle">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="bgmHint" label="BGM hint">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="durationSec" label="Duration">
            <InputNumber min={2} max={12} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sourceMaterialId" label="Source material id">
            <Input allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
