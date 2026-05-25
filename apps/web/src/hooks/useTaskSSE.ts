import { useEffect, useState } from 'react';

import type { TaskEvent } from '@tiktop/shared';

export function useTaskSSE(taskId: string | undefined): TaskEvent | null {
  const [event, setEvent] = useState<TaskEvent | null>(null);

  useEffect(() => {
    if (!taskId) return;
    const url = `/api/tasks/${taskId}/events`;
    const es = new EventSource(url);
    const onTask = (e: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(e.data) as TaskEvent;
        setEvent(parsed);
      } catch {
        // ignore parse error
      }
    };
    es.addEventListener('task', onTask);
    es.onerror = () => {
      // browser auto-reconnects on EventSource
    };
    return () => {
      es.removeEventListener('task', onTask);
      es.close();
    };
  }, [taskId]);

  return event;
}
