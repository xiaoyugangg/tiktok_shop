# TikTop P1 Python Agent Service

This service hosts the Python-side P1 Agent capabilities for the AIGC e-commerce video system.

Task 1 only provides the service skeleton:

- FastAPI application
- environment settings
- shared Pydantic base schemas
- `/health` endpoint
- pytest health check

Use the dedicated conda environment:

```powershell
conda activate tiktop_agent_p1
python -m pip install -e ".[dev]"
python -m uvicorn agent_app.main:app --app-dir src --host 127.0.0.1 --port 8790
```
