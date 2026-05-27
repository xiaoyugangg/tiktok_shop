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
      message.success('脚本生成成功');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const editingPlanMutation = useMutation({
    mutationFn: async () => {
      if (!script) throw new Error('请先生成脚本');
      return createEditingPlan(script.id);
    },
    onSuccess: (plan) => {
      setEditingPlan(plan);
      message.success('智能分镜方案已生成');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const startTaskMutation = useMutation({
    mutationFn: async () => {
      if (!script) throw new Error('请先生成脚本');
      if (!editingPlan) throw new Error('请先生成智能分镜方案');
      const ratio = form.getFieldValue('ratio') as Ratio;
      return startVideoTask({ scriptId: script.id, ratio, editingPlanId: editingPlan.id });
    },
    onSuccess: (task) => {
      message.success('视频任务已启动');
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
        <Text type="secondary">
          填写商品信息，生成脚本，再由 Agent 生成智能分镜方案，最后启动带货视频生成任务。
        </Text>
      </div>

      <Steps
        current={step}
        items={[{ title: '商品信息' }, { title: '脚本与智能分镜' }, { title: '生成视频' }]}
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
            <Input placeholder="例如：无线降噪耳机" />
          </Form.Item>
          <Form.Item
            name="sellingPoints"
            label="核心卖点"
            rules={[{ required: true, type: 'array', min: 1, max: 8 }]}
          >
            <Select
              mode="tags"
              placeholder="输入卖点后按回车，例如：主动降噪、续航30h"
              tokenSeparators={[',', ';']}
            />
          </Form.Item>
          <Form.Item name="targetAudience" label="目标人群">
            <Input placeholder="例如：通勤白领、学生、运动人群" />
          </Form.Item>
          <Form.Item name="scene" label="使用场景">
            <Input placeholder="例如：地铁通勤、居家办公、健身" />
          </Form.Item>
          <Form.Item name="mainMaterialId" label="商品主图">
            <Select
              allowClear
              placeholder="从素材库选择图片素材"
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
                生成脚本
              </Button>
              {products.length > 0 && <Text type="secondary">已创建 {products.length} 个商品</Text>}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {script && (
        <Card
          title={
            <Space>
              <span>脚本预览</span>
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
                重新填写
              </Button>
              <Button
                loading={editingPlanMutation.isPending}
                onClick={() => editingPlanMutation.mutate()}
                disabled={step === 2}
              >
                生成智能分镜方案
              </Button>
              <Button
                type="primary"
                loading={startTaskMutation.isPending}
                onClick={() => startTaskMutation.mutate()}
                disabled={step === 2 || !editingPlan}
              >
                {editingPlan ? '一键成片' : '先生成智能分镜方案'}
              </Button>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {editingPlan && (
              <Alert
                type="info"
                showIcon
                message={`Agent 智能分镜方案：${editingPlan.id}`}
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
