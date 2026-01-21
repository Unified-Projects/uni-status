/**
 * Enterprise Queue Proxy
 * Delegates to the main API's queue utilities when configured.
 */

type Queue = {
  add: (name: string, data: any, options?: any) => Promise<any>;
};

type GetQueueFn = (name: string) => Queue;

let _getQueue: GetQueueFn | null = null;

export function configureQueues(fns: { getQueue: GetQueueFn }) {
  _getQueue = fns.getQueue;
}

export function getQueue(name: string): Queue {
  if (!_getQueue) {
    throw new Error("Enterprise queues not configured. Call configureQueues first.");
  }
  return _getQueue(name);
}
