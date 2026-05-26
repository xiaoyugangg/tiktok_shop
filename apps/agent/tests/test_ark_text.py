from agent_app.providers.ark_text import generate_script
from agent_app.schemas import ProductInput, ScriptGenerateRequest


def test_generate_script_mock_returns_three_shots():
    result = generate_script(
        ScriptGenerateRequest(
            product=ProductInput(
                title="无线降噪耳机",
                selling_points=["主动降噪", "续航 30 小时", "佩戴舒适"],
            ),
            ratio="9:16",
        )
    )

    assert result.ratio == "9:16"
    assert len(result.shots) == 3
    assert result.trace[0].stage == "model.script.mock"
