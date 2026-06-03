import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Collapse,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';

import {
  analyzeReferenceVideo,
  createReferenceVideo,
  listReferenceVideos,
  uploadReferenceVideo,
} from '../api/reference';

import type { CreateReferenceVideoReq, ReferenceVideoDto } from '@tiktop/shared';

const { Title, Text, Paragraph } = Typography;

interface UploadFormValues {
  title?: string;
  category?: string;
  keywords?: string[];
  file?: { fileList?: Array<{ originFileObj?: File }> };
}

export function ReferenceVideosPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [uploadForm] = Form.useForm<UploadFormValues>();
  const [urlForm] = Form.useForm<CreateReferenceVideoReq>();

  const query = useQuery({
    queryKey: ['reference-videos'],
    queryFn: () => listReferenceVideos(),
  });

  const uploadMutation = useMutation({
    mutationFn: async (values: UploadFormValues) => {
      const file = values.file?.fileList?.[0]?.originFileObj;
      if (!file) throw new Error('请先选择参考视频文件');
      const formData = new FormData();
      formData.append('file', file);
      if (values.title) formData.append('title', values.title);
      if (values.category) formData.append('category', values.category);
      if (values.keywords?.length) formData.append('keywords', values.keywords.join(','));
      return uploadReferenceVideo(formData);
    },
    onSuccess: () => {
      message.success('参考视频已上传');
      uploadForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['reference-videos'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateReferenceVideoReq) => createReferenceVideo(values),
    onSuccess: () => {
      message.success('参考视频记录已创建');
      urlForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['reference-videos'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const analyzeMutation = useMutation({
    mutationFn: (id: string) => analyzeReferenceVideo(id),
    onSuccess: () => {
      message.success('参考视频拆解完成');
      queryClient.invalidateQueries({ queryKey: ['reference-videos'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const references = query.data ?? [];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          参考视频库
        </Title>
        <Text type="secondary">
          上传自有参考视频或录入站外爆款链接，由 Agent 拆解 Hook、卖点、分镜、风格和 CTA 方法论。
        </Text>
      </div>

      <Card title="上传参考视频">
        <Form form={uploadForm} layout="vertical" onFinish={(values) => uploadMutation.mutate(values)}>
          <Form.Item name="title" label="视频标题">
            <Input placeholder="例如：地铁通勤耳机爆款参考" />
          </Form.Item>
          <Form.Item name="category" label="类目">
            <Input placeholder="例如：数码耳机" />
          </Form.Item>
          <Form.Item name="keywords" label="关键词">
            <Select mode="tags" placeholder="输入关键词后回车，例如：降噪、通勤、痛点开场" />
          </Form.Item>
          <Form.Item name="file" label="视频文件" rules={[{ required: true }]}>
            <Upload beforeUpload={() => false} maxCount={1} accept="video/*">
              <Button>选择视频</Button>
            </Upload>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={uploadMutation.isPending}>
            上传到参考视频库
          </Button>
        </Form>
      </Card>

      <Card title="录入站外参考链接">
        <Form
          form={urlForm}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values)}
        >
          <Form.Item name="title" label="视频标题" rules={[{ required: true }]}>
            <Input placeholder="例如：FB 爆款降噪耳机短视频" />
          </Form.Item>
          <Form.Item name="sourceUrl" label="站外链接" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="category" label="类目">
            <Input placeholder="例如：数码耳机" />
          </Form.Item>
          <Form.Item name="keywords" label="关键词">
            <Select mode="tags" placeholder="输入关键词后回车" />
          </Form.Item>
          <Button htmlType="submit" loading={createMutation.isPending}>
            保存链接
          </Button>
        </Form>
      </Card>

      <Card title={`参考视频列表 (${references.length})`} loading={query.isLoading}>
        {!references.length ? (
          <Empty description="暂无参考视频" />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {references.map((item) => (
              <ReferenceCard
                key={item.id}
                item={item}
                analyzing={analyzeMutation.isPending && analyzeMutation.variables === item.id}
                onAnalyze={() => analyzeMutation.mutate(item.id)}
              />
            ))}
          </Space>
        )}
      </Card>
    </Space>
  );
}

function ReferenceCard({
  item,
  analyzing,
  onAnalyze,
}: {
  item: ReferenceVideoDto;
  analyzing: boolean;
  onAnalyze: () => void;
}) {
  const analysis = item.latestAnalysis;
  return (
    <Card
      size="small"
      title={
        <Space size={6} wrap>
          <span>{item.title}</span>
          <Tag color="blue">{item.sourceType}</Tag>
          {item.category && <Tag>{item.category}</Tag>}
        </Space>
      }
      extra={
        <Button size="small" type="primary" loading={analyzing} onClick={onAnalyze}>
          {analysis ? '重新拆解' : '生成拆解报告'}
        </Button>
      }
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space size={4} wrap>
          {item.keywords.map((keyword) => (
            <Tag key={keyword}>{keyword}</Tag>
          ))}
          {item.sourceUrl && <a href={item.sourceUrl}>站外链接</a>}
          {item.url && <a href={item.url}>本地视频</a>}
        </Space>

        {!analysis ? (
          <Text type="secondary">还没有拆解报告。</Text>
        ) : (
          <Collapse
            size="small"
            defaultActiveKey={['summary']}
            items={[
              {
                key: 'summary',
                label: '结构化拆解报告',
                children: (
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Paragraph>{analysis.summary}</Paragraph>
                    <Space size={4} wrap>
                      <Tag color="magenta">Hook: {analysis.hookType}</Tag>
                      <Tag color="orange">CTA: {analysis.ctaPattern}</Tag>
                    </Space>
                    <Paragraph>
                      <Text strong>痛点：</Text>
                      {analysis.painPoint}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>卖点：</Text>
                      {analysis.sellingPoints.join(' / ')}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>分镜结构：</Text>
                      {analysis.shotStructure.join(' -> ')}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>画面风格：</Text>
                      {analysis.visualStyle}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>字幕风格：</Text>
                      {analysis.subtitleStyle}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>BGM 节奏：</Text>
                      {analysis.bgmRhythm}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>可复用模板：</Text>
                      {analysis.reusableTemplate}
                    </Paragraph>
                  </Space>
                ),
              },
              {
                key: 'frames',
                label: `关键帧理解 (${analysis.keyframeCaptions.length})`,
                children: analysis.keyframeCaptions.length ? (
                  <Space direction="vertical">
                    {analysis.keyframeCaptions.map((caption, index) => (
                      <Text key={`${caption}-${index}`}>{index + 1}. {caption}</Text>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">没有关键帧 caption。</Text>
                ),
              },
            ]}
          />
        )}
      </Space>
    </Card>
  );
}
