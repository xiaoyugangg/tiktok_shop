import { EventEmitter } from 'node:events';

import type { TaskEvent } from '@tiktop/shared';

class TaskEventBus extends EventEmitter {
  emitTaskEvent(event: TaskEvent) {
    this.emit(event.taskId, event);
    this.emit('*', event);
  }
}

export const taskEvents = new TaskEventBus();
taskEvents.setMaxListeners(200);
