from agent_app.schemas import AnalyticsMetric, AnalyticsRequest, AnalyticsResponse, TraceItem


def build_mock_analytics(req: AnalyticsRequest) -> AnalyticsResponse:
    factors = ["pain-point hook", "scene demo", "benefit subtitles", "clean product close-up"]
    metrics = [
        AnalyticsMetric(factor=factors[0], ctr=0.061, cvr=0.027, completion_rate=0.44),
        AnalyticsMetric(factor=factors[1], ctr=0.054, cvr=0.031, completion_rate=0.51),
        AnalyticsMetric(factor=factors[2], ctr=0.049, cvr=0.035, completion_rate=0.57),
        AnalyticsMetric(factor=factors[3], ctr=0.057, cvr=0.029, completion_rate=0.53),
    ]

    return AnalyticsResponse(
        metrics=metrics,
        insights=[
            "Benefit subtitles show the strongest conversion lift.",
            "Scene demo improves completion rate and should be used in shot 2.",
            (
                f"Next video for {req.product_title or 'this product'} should keep product "
                "close-up in the first 3 seconds."
            ),
        ],
        trace=[
            TraceItem(
                stage="agent.analytics.mock",
                message="Generated deterministic mock metrics for competition demo",
                payload={"task_count": req.task_count},
            )
        ],
    )
