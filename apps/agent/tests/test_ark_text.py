from agent_app.providers import ark_text
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


def test_generate_script_live_normalizes_extra_shots(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": ark_text.json.dumps(
                                {
                                    "narrative": "show product",
                                    "visual_style": "clean",
                                    "ratio": "9:16",
                                    "shots": [
                                        {
                                            "idx": idx + 10,
                                            "description": f"shot {idx}",
                                            "camera_motion": "push in",
                                            "subtitle": f"s{idx}",
                                            "bgm_hint": "upbeat",
                                            "duration_sec": 3 if idx == 0 else 4,
                                        }
                                        for idx in range(6)
                                    ],
                                    "constraints": [],
                                }
                            )
                        }
                    }
                ]
            }

    def fake_post(url, headers, json, timeout):
        return Response()

    monkeypatch.setattr(ark_text.settings, "model_mode", "live")
    monkeypatch.setattr(ark_text.settings, "ark_api_key", "ark-key")
    monkeypatch.setattr(ark_text.settings, "ark_text_model", "text-model")
    monkeypatch.setattr(ark_text.httpx, "post", fake_post)

    result = generate_script(
        ScriptGenerateRequest(
            product=ProductInput(title="无线耳机", selling_points=["降噪"]),
            ratio="9:16",
        )
    )

    assert len(result.shots) == 3
    assert [shot.idx for shot in result.shots] == [0, 1, 2]
    assert result.shots[0].duration_sec == 4
