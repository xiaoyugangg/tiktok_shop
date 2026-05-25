import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  LoadingOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, Progress, Row, Space, Tag, Typography } from 'antd';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getTask } from '../api/task';
import { useTaskSSE } from '../hooks/useTaskSSE';

import type { ShotStatus, TaskStatus } from '@tiktop/shared';

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

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sseEvent = useTaskSSE(id);

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

  useEffect(() => {
    if (sseEvent?.taskId === id) taskQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sseEvent?.updatedAt, sseEvent?.status, id]);

  if (!id) return <Empty description="任务 ID 缺失" />;
  if (taskQuery.isLoading) return <Card loading />;
  if (taskQuery.error) return <Alert type="error" message={(taskQuery.error as Error).message} />;
  const task = taskQuery.data;
  if (!task) return <Empty description="任务不存在" />;

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
        <Space size={8}>
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

      {task.status === 'failed' && (
        <Alert type="error" showIcon message="任务失败" description={task.errorMsg ?? '未知错误'} />
      )}

      {task.status === 'succeeded' && (
        <Alert
          type="success"
          showIcon
          message="生成完成"
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
                <Space size={6}>
                  {SHOT_ICON[shot.status]}
                  <span>Shot {shot.idx + 1}</span>
                  <Tag>{shot.durationSec}s</Tag>
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
            >
              <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 6, fontSize: 13 }}>
                {shot.description}
              </Paragraph>
              <Space size={4} wrap>
                <Tag color="geekblue">{shot.cameraMotion || '默认镜头'}</Tag>
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
    </Space>
  );
}
