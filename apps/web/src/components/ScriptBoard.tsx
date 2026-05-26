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
        <Descriptions size="small" column={1} title={<span>Script Overview</span>}>
          <Descriptions.Item label="Narrative">{script.narrative}</Descriptions.Item>
          <Descriptions.Item label="Visual Style">{script.visualStyle}</Descriptions.Item>
          <Descriptions.Item label="Ratio / Duration">
            {script.ratio} / {totalDuration.toFixed(1)}s
          </Descriptions.Item>
          <Descriptions.Item label="Constraints">
            <Space size={4} wrap>
              {(script.constraints ?? []).map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Title level={5} style={{ marginBottom: 0 }}>
        Shots ({script.shots.length})
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
                    <Tag color="magenta">Shot {shot.idx + 1}</Tag>
                    <Tag>{shot.durationSec}s</Tag>
                  </Space>
                }
              >
                <Paragraph style={{ marginBottom: 8 }}>{shot.description}</Paragraph>
                <Space size={6} wrap style={{ marginBottom: 8 }}>
                  <Tag color="geekblue">Camera: {shot.cameraMotion || 'default'}</Tag>
                  {shot.bgmHint && <Tag color="green">BGM: {shot.bgmHint}</Tag>}
                </Space>
                {shot.subtitle && (
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    Subtitle: {shot.subtitle}
                  </Paragraph>
                )}

                {planned && (
                  <Card size="small" style={{ marginTop: 12, background: '#fafafa' }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space size={4} wrap>
                        <Tag color="blue">Agent Plan</Tag>
                        {planned.sourceMaterialId && <Tag>material: {planned.sourceMaterialId}</Tag>}
                        <Tag>{planned.durationSec}s</Tag>
                      </Space>
                      <Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0, fontSize: 12 }}>
                        Prompt: {planned.prompt}
                      </Paragraph>
                      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                        Subtitle: {planned.subtitle}
                      </Paragraph>
                      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                        BGM: {planned.bgmHint}
                      </Paragraph>
                      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                        Reason: {planned.reason}
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
