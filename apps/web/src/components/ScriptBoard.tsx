import { Card, Col, Descriptions, Row, Space, Tag, Typography } from 'antd';

import type { EditingPlanDto, Script } from '@tiktop/shared';

const { Title, Paragraph } = Typography;

export function ScriptBoard({
  script,
  editingPlan,
}: {
  script: Script;
  editingPlan?: EditingPlanDto | null;
}) {
  const totalDuration = script.shots.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Descriptions size="small" column={1} title={<span>剧本概览</span>}>
          <Descriptions.Item label="叙事策略">{script.narrative}</Descriptions.Item>
          <Descriptions.Item label="视觉风格">{script.visualStyle}</Descriptions.Item>
          <Descriptions.Item label="画幅 / 时长">
            {script.ratio} / {totalDuration.toFixed(1)}s
          </Descriptions.Item>
          <Descriptions.Item label="约束">
            <Space size={4} wrap>
              {(script.constraints ?? []).map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Title level={5} style={{ marginBottom: 0 }}>
        分镜 ({script.shots.length})
      </Title>
      <Row gutter={[16, 16]}>
        {script.shots.map((shot) => {
          const planned = editingPlan?.shots.find((item) => item.idx === shot.idx);
          return (
            <Col xs={24} md={12} lg={8} key={shot.idx}>
              <Card
                size="small"
                title={
                  <Space size={6}>
                    <Tag color="magenta">分镜 {shot.idx + 1}</Tag>
                    <Tag>{shot.durationSec}s</Tag>
                  </Space>
                }
              >
                <Paragraph style={{ marginBottom: 8 }}>{shot.description}</Paragraph>
                <Space size={6} wrap style={{ marginBottom: 8 }}>
                  <Tag color="geekblue">镜头: {shot.cameraMotion || '默认'}</Tag>
                  {shot.bgmHint && <Tag color="green">BGM: {shot.bgmHint}</Tag>}
                </Space>
                {shot.subtitle && (
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    字幕: {shot.subtitle}
                  </Paragraph>
                )}

                {planned && (
                  <Card size="small" style={{ marginTop: 12, background: '#fafafa' }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space size={4} wrap>
                        <Tag color="blue">Agent 剪辑计划</Tag>
                        {planned.sourceMaterialId && <Tag>推荐素材: {planned.sourceMaterialId}</Tag>}
                        <Tag>{planned.durationSec}s</Tag>
                      </Space>
                      <Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0, fontSize: 12 }}>
                        改写 Prompt: {planned.prompt}
                      </Paragraph>
                      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                        字幕: {planned.subtitle}
                      </Paragraph>
                      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                        BGM: {planned.bgmHint}
                      </Paragraph>
                      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                        原因: {planned.reason}
                      </Paragraph>
                    </Space>
                  </Card>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
    </Space>
  );
}
