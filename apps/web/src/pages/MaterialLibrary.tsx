import { DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Popconfirm,
  Row,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { useState } from 'react';

import { analyzeMaterial, deleteMaterial, listMaterials, uploadMaterial } from '../api/material';

import type { UploadProps } from 'antd';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

export function MaterialLibraryPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => listMaterials(),
  });

  const removeMutation = useMutation({
    mutationFn: deleteMaterial,
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeMaterial,
    onSuccess: () => {
      message.success('Agent 素材分析完成');
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: true,
    accept: 'image/*,video/*',
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        setUploading(true);
        await uploadMaterial(file as File);
        message.success(`上传成功：${file.name}`);
        queryClient.invalidateQueries({ queryKey: ['materials'] });
      } catch (err) {
        message.error((err as Error).message);
      } finally {
        setUploading(false);
      }
      return false;
    },
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          素材库
        </Title>
        <Text type="secondary">上传商品主图、参考视频；P0 阶段不做向量检索，后续 P1 接入。</Text>
      </div>

      <Dragger {...uploadProps} disabled={uploading}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
        <p className="ant-upload-hint">支持图片与视频，单文件最大 100MB</p>
      </Dragger>

      {isLoading ? (
        <Card loading />
      ) : materials.length === 0 ? (
        <Empty description="还没有素材，先上传一些吧" />
      ) : (
        <Row gutter={[16, 16]}>
          {materials.map((m) => (
            <Col xs={24} sm={12} md={8} lg={6} key={m.id}>
              <Card
                hoverable
                cover={
                  m.kind === 'image' ? (
                    <img
                      src={m.url}
                      alt={m.filename}
                      style={{ height: 180, objectFit: 'cover', background: '#fafafa' }}
                    />
                  ) : (
                    <video
                      src={m.url}
                      style={{ height: 180, width: '100%', objectFit: 'cover', background: '#000' }}
                      controls
                      muted
                    />
                  )
                }
                actions={[
                  <Button
                    key="analyze"
                    type="text"
                    loading={analyzeMutation.isPending && analyzeMutation.variables === m.id}
                    disabled={analyzeMutation.isPending}
                    onClick={() => analyzeMutation.mutate(m.id)}
                  >
                    分析素材
                  </Button>,
                  <Popconfirm
                    key="del"
                    title="删除该素材？"
                    onConfirm={() => removeMutation.mutate(m.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <Card.Meta
                  title={
                    <Text ellipsis style={{ maxWidth: '100%' }}>
                      {m.filename}
                    </Text>
                  }
                  description={
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space size={4} wrap>
                        <Tag color={m.kind === 'image' ? 'blue' : 'purple'}>{m.kind}</Tag>
                        {m.analyzedAt && <Tag color="green">Agent</Tag>}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {(m.size / 1024).toFixed(1)} KB
                        </Text>
                      </Space>
                      {m.summary && (
                        <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0, fontSize: 12 }}>
                          {m.summary}
                        </Paragraph>
                      )}
                      {!!m.tags?.length && (
                        <Space size={[4, 4]} wrap>
                          {m.tags.slice(0, 8).map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </Space>
                      )}
                    </Space>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Space>
  );
}
