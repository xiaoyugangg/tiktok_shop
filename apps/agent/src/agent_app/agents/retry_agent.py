from agent_app.schemas import RetryDecisionRequest, RetryDecisionResponse, RetryPatch, TraceItem


def decide_retry(req: RetryDecisionRequest) -> RetryDecisionResponse:
    trace = [
        TraceItem(
            stage="agent.retry.inspect",
            message="Classified generation error",
            payload={"error": req.error_message, "retry_count": req.retry_count},
        )
    ]

    if req.retry_count >= 2:
        return RetryDecisionResponse(
            should_retry=False,
            reason="Retry limit reached",
            trace=trace,
        )

    lower = req.error_message.lower()
    if "duration" in lower:
        return RetryDecisionResponse(
            should_retry=True,
            reason="Duration error can be fixed by clamping to 5 seconds",
            patch=RetryPatch(duration_sec=5),
            trace=trace,
        )

    if "timeout" in lower or "invalidparameter" in lower or "failed" in lower:
        prompt = (req.prompt or "")[:260] + " Keep the scene simple, product-centered, no human face."
        return RetryDecisionResponse(
            should_retry=True,
            reason="Prompt can be simplified for another generation attempt",
            patch=RetryPatch(prompt=prompt, duration_sec=max(2, min(8, req.duration_sec))),
            trace=trace,
        )

    return RetryDecisionResponse(
        should_retry=False,
        reason="Error type is not safe to auto retry",
        trace=trace,
    )
