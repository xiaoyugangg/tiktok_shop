import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';

import { getMockAnalytics } from '../api/analytics';

const { Title, Text } = Typography;

export function AnalyticsPage() {
  const query = useQuery({
    queryKey: ['analytics', 'mock'],
    queryFn: getMockAnalytics,
  });

  if (query.isLoading) return <Card loading />;
  if (query.error) return <Alert type="error" message={(query.error as Error).message} />;
  const data = query.data;
  if (!data) return <Empty description="No analytics data" />;

  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['CTR', 'CVR', 'Completion'] },
    grid: { left: 40, right: 24, top: 48, bottom: 72 },
    xAxis: {
      type: 'category',
      data: data.metrics.map((item) => item.factor),
      axisLabel: { interval: 0, rotate: 20 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => `${Math.round(value * 100)}%`,
      },
    },
    series: [
      {
        name: 'CTR',
        type: 'bar',
        data: data.metrics.map((item) => item.ctr),
      },
      {
        name: 'CVR',
        type: 'bar',
        data: data.metrics.map((item) => item.cvr),
      },
      {
        name: 'Completion',
        type: 'bar',
        data: data.metrics.map((item) => item.completion_rate),
      },
    ],
  };

  const bestCompletion = [...data.metrics].sort(
    (a, b) => b.completion_rate - a.completion_rate,
  )[0];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          数据看板
        </Title>
        <Text type="secondary">由 Python Agent 生成的 Mock 因子归因数据，用于展示“生成因子 × 转化效果”。</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="最高完播因子"
              value={bestCompletion?.factor ?? '-'}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="平均 CTR"
              value={
                data.metrics.reduce((sum, item) => sum + item.ctr, 0) / Math.max(data.metrics.length, 1)
              }
              precision={3}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Agent Trace"
              value={data.trace?.[0]?.stage ?? 'agent.analytics.mock'}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="生成因子 × 转化效果">
        <ReactECharts option={option} style={{ height: 420 }} />
      </Card>

      <Card title="Agent 优化建议">
        <List
          dataSource={data.insights}
          renderItem={(item, index) => (
            <List.Item>
              <Space>
                <Tag color="blue">建议 {index + 1}</Tag>
                <Text>{item}</Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
