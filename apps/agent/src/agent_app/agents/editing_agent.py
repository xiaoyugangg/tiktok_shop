from agent_app.agents.editing_graph import run_editing_graph
from agent_app.schemas import EditingPlanRequest, EditingPlanResponse


def build_editing_plan(req: EditingPlanRequest) -> EditingPlanResponse:
    return run_editing_graph(req)
