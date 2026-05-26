from agent_app.media.postprocess import build_ass_text
from agent_app.schemas import SubtitleCue


def test_build_ass_text_contains_subtitle():
    text = build_ass_text([SubtitleCue(start_sec=0, end_sec=2.5, text="Buy now")])

    assert "Dialogue:" in text
    assert "Buy now" in text
