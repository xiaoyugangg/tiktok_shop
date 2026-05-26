import httpx


class CallbackClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _post(self, path: str, body: dict) -> None:
        resp = httpx.post(
            f"{self.base_url}{path}",
            headers={"x-internal-token": self.token},
            json=body,
            timeout=10,
        )
        resp.raise_for_status()

    def trace(
        self,
        task_id: str,
        stage: str,
        message: str,
        *,
        shot_id: str | None = None,
        level: str = "info",
        payload: dict | None = None,
    ) -> None:
        self._post(
            "/api/internal/trace",
            {
                "task_id": task_id,
                "shot_id": shot_id,
                "stage": stage,
                "level": level,
                "message": message,
                "payload": payload or {},
            },
        )

    def shot_status(
        self,
        *,
        shot_id: str,
        status: str,
        clip_path: str | None = None,
        error_msg: str | None = None,
        prompt: str | None = None,
        duration_sec: float | None = None,
        retry_count_increment: int = 0,
    ) -> None:
        self._post(
            "/api/internal/shots/status",
            {
                "shot_id": shot_id,
                "status": status,
                "clip_path": clip_path,
                "error_msg": error_msg,
                "prompt": prompt,
                "duration_sec": duration_sec,
                "retry_count_increment": retry_count_increment,
            },
        )

    def task_status(
        self,
        *,
        task_id: str,
        status: str,
        error_msg: str | None = None,
        output_path: str | None = None,
        stage: str | None = None,
    ) -> None:
        self._post(
            "/api/internal/tasks/status",
            {
                "task_id": task_id,
                "status": status,
                "error_msg": error_msg,
                "output_path": output_path,
                "stage": stage,
            },
        )
