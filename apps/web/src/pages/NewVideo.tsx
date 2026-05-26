import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Alert, Button, Card, Form, Input, Radio, Select, Space, Steps, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listMaterials } from '../api/material';
import { createProduct, listProducts } from '../api/product';
import { createEditingPlan, generateScript } from '../api/script';
import { startVideoTask } from '../api/task';
import { ScriptBoard } from '../components/ScriptBoard';

import type { EditingPlanDto, Ratio, ScriptDto } from '@tiktop/shared';

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
  const [editingPlan, setEditingPlan] = useState<EditingPlanDto | null>(null);

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
      setEditingPlan(null);
      setStep(1);
      message.success('Script generated');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const editingPlanMutation = useMutation({
    mutationFn: async () => {
      if (!script) throw new Error('Please generate script first');
      return createEditingPlan(script.id);
    },
    onSuccess: (plan) => {
      setEditingPlan(plan);
      message.success('Agent editing plan ready');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const startTaskMutation = useMutation({
    mutationFn: async () => {
      if (!script) throw new Error('Please generate script first');
      const ratio = form.getFieldValue('ratio') as Ratio;
      return startVideoTask({ scriptId: script.id, ratio });
    },
    onSuccess: (task) => {
      message.success('Video task started');
      setStep(2);
      navigate(`/tasks/${task.id}`);
    },
    onError: (err: Error) => message.error(err.message),
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          New Video
        </Title>
        <Text type="secondary">Fill product info, generate a script, then start the video task.</Text>
      </div>

      <Steps
        current={step}
        items={[{ title: 'Product' }, { title: 'Script' }, { title: 'Video' }]}
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ ratio: '9:16', sellingPoints: [] }}
          onFinish={(v) => generateMutation.mutate(v)}
          disabled={step !== 0}
        >
          <Form.Item name="title" label="Product title" rules={[{ required: true, max: 80 }]}>
            <Input placeholder="Wireless noise cancelling earbuds" />
          </Form.Item>
          <Form.Item
            name="sellingPoints"
            label="Selling points"
            rules={[{ required: true, type: 'array', min: 1, max: 8 }]}
          >
            <Select
              mode="tags"
              placeholder="Press Enter after each selling point"
              tokenSeparators={[',', ';']}
            />
          </Form.Item>
          <Form.Item name="targetAudience" label="Target audience">
            <Input placeholder="Commuters, office workers, students" />
          </Form.Item>
          <Form.Item name="scene" label="Use scene">
            <Input placeholder="Commute, home office, gym" />
          </Form.Item>
          <Form.Item name="mainMaterialId" label="Main product image">
            <Select
              allowClear
              placeholder="Choose an image material"
              options={materials
                .filter((m) => m.kind === 'image')
                .map((m) => ({ value: m.id, label: m.filename }))}
            />
          </Form.Item>
          <Form.Item name="ratio" label="Ratio">
            <Radio.Group>
              <Radio.Button value="9:16">9:16 vertical</Radio.Button>
              <Radio.Button value="16:9">16:9 horizontal</Radio.Button>
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
                Generate Script
              </Button>
              {products.length > 0 && <Text type="secondary">{products.length} products saved</Text>}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {script && (
        <Card
          title={
            <Space>
              <span>Script Preview</span>
              <Tag color="magenta">script:{script.id.slice(0, 8)}</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button
                onClick={() => {
                  setScript(null);
                  setEditingPlan(null);
                  setStep(0);
                  form.resetFields();
                }}
              >
                Start Over
              </Button>
              <Button
                loading={editingPlanMutation.isPending}
                onClick={() => editingPlanMutation.mutate()}
                disabled={step === 2}
              >
                Agent Match
              </Button>
              <Button
                type="primary"
                loading={startTaskMutation.isPending}
                onClick={() => startTaskMutation.mutate()}
                disabled={step === 2}
              >
                Start Video
              </Button>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {editingPlan && (
              <Alert
                type="info"
                showIcon
                message="Agent editing strategy"
                description={editingPlan.strategy}
              />
            )}
            <ScriptBoard script={script.payload} editingPlan={editingPlan} />
          </Space>
        </Card>
      )}
    </Space>
  );
}
