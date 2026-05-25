import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Empty, Space, Tag, Typography } from 'antd';
import { Link, useParams } from 'react-router-dom';

import { getTask } from '../api/task';

const { Title } = Typography;

export function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['task', id, 'preview'],
    queryFn: () => getTask(id!),
    enabled: !!id,
  });

  if (!id) return <Empty description="任务 ID 缺失" />;
  if (query.isLoading) return <Card loading />;
  if (query.error) return <Alert type="error" message={(query.error as Error).message} />;
  const task = query.data;
  if (!task) return <Empty description="任务不存在" />;

  if (task.status !== 'succeeded' || !task.outputUrl) {
    return (
      <Alert
        type="warning"
        showIcon
        message="视频尚未生成完成"
        description={
          <Link to={`/tasks/${task.id}`}>
            <Button type="primary">回到任务详情</Button>
          </Link>
        }
      />
    );
  }

  const totalDuration = task.shots.reduce((s, x) => s + x.durationSec, 0);
  const downloadUrl = `/api/tasks/${task.id}/output`;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          预览与导出
        </Title>
        <Space size={8}>
          <Tag color="success">已完成</Tag>
          <Tag>{task.ratio}</Tag>
          <Tag>{totalDuration.toFixed(1)}s</Tag>
          <Tag>{task.shots.length} 个分镜</Tag>
        </Space>
      </div>

      <Card>
        <video
          src={task.outputUrl}
          controls
          autoPlay
          style={{
            width: '100%',
            maxHeight: task.ratio === '9:16' ? 720 : 540,
            background: '#000',
            objectFit: 'contain',
          }}
        />
      </Card>

      <Space>
        <Button type="primary" icon={<DownloadOutlined />} href={downloadUrl}>
          下载 MP4
        </Button>
        <Link to={`/tasks/${task.id}`}>
          <Button>返回任务详情</Button>
        </Link>
        <Link to="/new">
          <Button>新建另一个视频</Button>
        </Link>
      </Space>

      <Card title="任务信息" size="small">
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="任务 ID">{task.id}</Descriptions.Item>
          <Descriptions.Item label="剧本 ID">{task.scriptId}</Descriptions.Item>
          <Descriptions.Item label="商品 ID">{task.productId}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(task.createdAt).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {new Date(task.updatedAt).toLocaleString('zh-CN')}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
