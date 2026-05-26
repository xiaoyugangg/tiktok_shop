from agent_app.agents.analytics_agent import build_mock_analytics
from agent_app.schemas import AnalyticsRequest


def test_mock_analytics_returns_metrics_and_insights():
    result = build_mock_analytics(AnalyticsRequest(product_title="Earbuds"))

    assert len(result.metrics) >= 4
    assert result.insights
    assert result.trace[0].stage == "agent.analytics.mock"
