from agent_app.agents.retry_agent import decide_retry
from agent_app.schemas import RetryDecisionRequest


def test_retry_decision_clamps_duration_error():
    decision = decide_retry(
        RetryDecisionRequest(
            task_id="t1",
            shot_id="s1",
            error_message="duration not supported",
            retry_count=0,
            prompt="make a long complex video",
            duration_sec=20,
        )
    )

    assert decision.should_retry is True
    assert decision.patch.duration_sec == 5


def test_retry_decision_stops_after_two_retries():
    decision = decide_retry(
        RetryDecisionRequest(
            task_id="t1",
            shot_id="s1",
            error_message="timeout",
            retry_count=2,
            prompt="x",
            duration_sec=5,
        )
    )

    assert decision.should_retry is False
