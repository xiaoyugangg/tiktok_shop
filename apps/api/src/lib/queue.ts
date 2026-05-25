import PQueue from 'p-queue';

export const videoQueue = new PQueue({ concurrency: 5 });
