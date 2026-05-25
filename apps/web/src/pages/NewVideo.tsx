import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Radio, Select, Space, Steps, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listMaterials } from '../api/material';
import { createProduct, listProducts } from '../api/product';
import { generateScript } from '../api/script';
import { ScriptBoard } from '../components/ScriptBoard';

import type { Ratio, ScriptDto } from '@tiktop/shared';

const { Title, Text } = Typography;

interface FormValues {
  title: string;
  sellingPoints: string[];
  targetAudience?: string;
  scene?: string;
  mainMaterialId?: string;
  ratio: Ratio;
}

export function NewVideoPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [script, setScript] = useState<ScriptDto | null>(null);

  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: () => listMaterials(),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  const generateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const product = await createProduct({
        title: values.title,
        sellingPoints: values.sellingPoints,
        targetAudience: values.targetAudience,
        scene: values.scene,
        mainMaterialId: values.mainMaterialId,
        ratio: values.ratio,
      });
      return generateScript({ productId: product.id, ratio: values.ratio });
    },
    onSuccess: (dto) => {
      setScript(dto);
      setStep(1);
      message.success('剧本生成成功');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const startTaskMutation = useMutation({
    mutationFn: async () => {
      if (!script) throw new Error('请先生成剧本');
      const ratio = form.getFieldValue('ratio') as Ratio;
      const { startVideoTask } = await import('../api/task');
      const task = await startVideoTask({ scriptId: script.id, ratio });
      return task;
    },
    onSuccess: (task) => {
      message.success('已启动一键成片');
      setStep(2);
      navigate(`/tasks/${task.id}`);
    },
    onError: (err: Error) => message.error(err.message),
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          新建视频
        </Title>
        <Text type="secondary">填商品信息 → 生成剧本 → 一键成片(≤15 秒)</Text>
      </div>

      <Steps
        current={step}
        items={[{ title: '商品信息' }, { title: '剧本预览' }, { title: '生成视频' }]}
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ ratio: '9:16', sellingPoints: [] }}
          onFinish={(v) => generateMutation.mutate(v)}
          disabled={step !== 0}
        >
          <Form.Item name="title" label="商品标题" rules={[{ required: true, max: 80 }]}>
            <Input placeholder="例:轻薄无线降噪耳机" />
          </Form.Item>
          <Form.Item
            name="sellingPoints"
            label="核心卖点 (回车确认,3-5 条最佳)"
            rules={[{ required: true, type: 'array', min: 1, max: 8 }]}
          >
            <Select
              mode="tags"
              placeholder="输入卖点后按回车,如:主动降噪、续航 30h、人体工学"
              tokenSeparators={[',', '，']}
            />
          </Form.Item>
          <Form.Item name="targetAudience" label="目标人群">
            <Input placeholder="例:18-30 岁通勤白领" />
          </Form.Item>
          <Form.Item name="scene" label="使用场景">
            <Input placeholder="例:地铁通勤 / 居家办公" />
          </Form.Item>
          <Form.Item name="mainMaterialId" label="商品主图 (可选)">
            <Select
              allowClear
              placeholder="从素材库选择,留空则模型自动构图"
              options={materials
                .filter((m) => m.kind === 'image')
                .map((m) => ({ value: m.id, label: m.filename }))}
            />
          </Form.Item>
          <Form.Item name="ratio" label="画幅">
            <Radio.Group>
              <Radio.Button value="9:16">9:16 竖版</Radio.Button>
              <Radio.Button value="16:9">16:9 横版</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={generateMutation.isPending}
                disabled={step !== 0}
              >
                生成剧本
              </Button>
              {products.length > 0 && <Text type="secondary">已创建商品 {products.length} 个</Text>}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {script && (
        <Card
          title={
            <Space>
              <span>剧本预览</span>
              <Tag color="magenta">script:{script.id.slice(0, 8)}</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button
                onClick={() => {
                  setScript(null);
                  setStep(0);
                  form.resetFields();
                }}
              >
                重新填写
              </Button>
              <Button
                type="primary"
                loading={startTaskMutation.isPending}
                onClick={() => startTaskMutation.mutate()}
                disabled={step === 2}
              >
                一键成片
              </Button>
            </Space>
          }
        >
          <ScriptBoard script={script.payload} />
        </Card>
      )}
    </Space>
  );
}
