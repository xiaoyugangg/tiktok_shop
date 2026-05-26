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

  if (!id) return <Empty description="Task id missing" />;
  if (query.isLoading) return <Card loading />;
  if (query.error) return <Alert type="error" message={(query.error as Error).message} />;
  const task = query.data;
  if (!task) return <Empty description="Task not found" />;

  if (task.status !== 'succeeded' || !task.outputUrl) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Video is not ready"
        description={
          <Link to={`/tasks/${task.id}`}>
            <Button type="primary">Back to task</Button>
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
          Preview and Export
        </Title>
        <Space size={8} wrap>
          <Tag color="success">Completed</Tag>
          <Tag color="blue">Agent enhanced</Tag>
          <Tag color="purple">P1 postprocess video</Tag>
          <Tag color="green">Subtitle ready</Tag>
          <Tag>{task.ratio}</Tag>
          <Tag>{totalDuration.toFixed(1)}s</Tag>
          <Tag>{task.shots.length} shots</Tag>
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
          Download MP4
        </Button>
        <Link to={`/tasks/${task.id}`}>
          <Button>Back to task</Button>
        </Link>
        <Link to="/new">
          <Button>Create another</Button>
        </Link>
      </Space>

      <Card title="Task Info" size="small">
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Task ID">{task.id}</Descriptions.Item>
          <Descriptions.Item label="Script ID">{task.scriptId}</Descriptions.Item>
          <Descriptions.Item label="Product ID">{task.productId}</Descriptions.Item>
          <Descriptions.Item label="Created At">
            {new Date(task.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Updated At">
            {new Date(task.updatedAt).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
