export const BEHAVIORAL_QUEUE_NAME = 'behavioral-aggregation';
export const BEHAVIORAL_QUEUE = Symbol('BEHAVIORAL_QUEUE');
export const BEHAVIORAL_QUEUE_CONNECTION = Symbol(
  'BEHAVIORAL_QUEUE_CONNECTION',
);

export type AggregateJobData = { eventId: string };
