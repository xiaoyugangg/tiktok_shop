from agent_app.schemas import AnalyticsMetric, AnalyticsRequest, AnalyticsResponse, TraceItem


def build_mock_analytics(req: AnalyticsRequest) -> AnalyticsResponse:
    factors = ["痛点开场", "场景演示", "卖点字幕", "商品特写"]
    metrics = [
        AnalyticsMetric(factor=factors[0], ctr=0.061, cvr=0.027, completion_rate=0.44),
        AnalyticsMetric(factor=factors[1], ctr=0.054, cvr=0.031, completion_rate=0.51),
        AnalyticsMetric(factor=factors[2], ctr=0.049, cvr=0.035, completion_rate=0.57),
        AnalyticsMetric(factor=factors[3], ctr=0.057, cvr=0.029, completion_rate=0.53),
    ]

    return AnalyticsResponse(
        metrics=metrics,
        insights=[
            "卖点字幕的转化提升最明显，建议在关键分镜中保留简短有力的利益点表达。",
            "场景演示能提升完播率，建议放在第 2 个分镜承接开场兴趣。",
            f"下一条 {req.product_title or '该商品'} 视频建议在前 3 秒保留商品特写，强化真实感和识别度。",
        ],
        trace=[
            TraceItem(
                stage="agent.analytics.mock",
                message="Generated deterministic mock metrics for competition demo",
                payload={"task_count": req.task_count},
            )
        ],
    )
