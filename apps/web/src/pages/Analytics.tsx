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
  if (!data) return <Empty description="暂无数据看板数据" />;

  const option = {
    color: ['#4f6bed', '#a9d923', '#50537a'],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number) => `${(value * 100).toFixed(1)}%`,
    },
    legend: {
      data: ['点击率 CTR', '转化率 CVR', '完播率'],
      bottom: 0,
    },
    grid: {
      left: 56,
      right: 28,
      top: 40,
      bottom: 112,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: data.metrics.map((item) => item.factor),
      axisLabel: {
        interval: 0,
        rotate: 0,
        margin: 16,
        lineHeight: 18,
        formatter: (value: string) => value.replace(/(.{4})/g, '$1\n').trim(),
      },
    },
    yAxis: {
      type: 'value',
      max: 0.7,
      axisLabel: {
        formatter: (value: number) => `${Math.round(value * 100)}%`,
      },
    },
    series: [
      {
        name: '点击率 CTR',
        type: 'bar',
        barMaxWidth: 28,
        data: data.metrics.map((item) => item.ctr),
      },
      {
        name: '转化率 CVR',
        type: 'bar',
        barMaxWidth: 28,
        data: data.metrics.map((item) => item.cvr),
      },
      {
        name: '完播率',
        type: 'bar',
        barMaxWidth: 28,
        data: data.metrics.map((item) => item.completion_rate),
      },
    ],
  };

  const bestCompletion = [...data.metrics].sort(
    (a, b) => b.completion_rate - a.completion_rate,
  )[0];
  const avgCtr =
    data.metrics.reduce((sum, item) => sum + item.ctr, 0) / Math.max(data.metrics.length, 1);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          数据看板
        </Title>
        <Text type="secondary">
          用 Mock 数据展示“生成因子 × 转化效果”，帮助判断哪种创作元素更值得复用。
        </Text>
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
            <Statistic title="平均点击率 CTR" value={avgCtr} precision={3} />
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
        <ReactECharts option={option} style={{ height: 460 }} />
      </Card>

      <Card title="Agent 优化建议">
        <List
          dataSource={data.insights}
          renderItem={(item, index) => (
            <List.Item>
              <Space align="start">
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
