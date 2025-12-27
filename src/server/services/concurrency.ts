/**
 * Concurrency utilities for parallel task execution
 */

/**
 * Run async tasks with limited concurrency
 * Returns results in same order as input tasks
 */
export function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  signal?: AbortSignal
): Promise<PromiseSettledResult<T>[]> {
  return new Promise((resolve) => {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length)
    let running = 0
    let completed = 0
    let nextIndex = 0

    const runNext = () => {
      // Check abort signal
      if (signal?.aborted) {
        // Mark remaining as rejected
        while (nextIndex < tasks.length) {
          results[nextIndex] = { status: 'rejected', reason: new Error('Aborted') }
          nextIndex++
          completed++
        }
        if (completed === tasks.length) resolve(results)
        return
      }

      while (running < concurrency && nextIndex < tasks.length) {
        const index = nextIndex++
        running++

        tasks[index]()
          .then(value => {
            results[index] = { status: 'fulfilled', value }
          })
          .catch(reason => {
            results[index] = { status: 'rejected', reason }
          })
          .finally(() => {
            running--
            completed++
            if (completed === tasks.length) {
              resolve(results)
            } else {
              runNext()
            }
          })
      }
    }

    if (tasks.length === 0) {
      resolve([])
    } else {
      runNext()
    }
  })
}
