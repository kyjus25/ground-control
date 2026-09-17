import { EventType, resumeServerSentEventsResponse, type StreamDurability } from '@tanstack/ai'

export function durableChatResponse(adapter: StreamDurability, signal?: AbortSignal, heartbeatMs = 5000): Response {
  const response = resumeServerSentEventsResponse({ adapter })
  const reader = response.body!.getReader()
  const heartbeat = new TextEncoder().encode(': heartbeat\n\n')
  let stopped = false
  let timer: ReturnType<typeof setInterval>
  let stop: () => void
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        stopped = true
        clearInterval(timer)
        signal?.removeEventListener('abort', stop)
      }
      stop = () => {
        if (stopped) return
        cleanup()
        controller.close()
        void reader.cancel().catch(() => {})
      }
      timer = setInterval(() => {
        if (!stopped) controller.enqueue(heartbeat)
      }, heartbeatMs)
      signal?.addEventListener('abort', stop, { once: true })
      if (signal?.aborted) stop()
      void (async () => {
        try {
          while (!stopped) {
            const { done, value } = await reader.read()
            if (stopped) break
            if (done) {
              stop()
              break
            }
            controller.enqueue(value)
          }
        } catch {
          if (!stopped) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: EventType.RUN_ERROR, message: 'Stream interrupted. Reconnect to resume.', code: 'stream_failed' })}\n\n`))
            stop()
          }
        }
      })()
    },
    cancel() {
      stopped = true
      clearInterval(timer)
      signal?.removeEventListener('abort', stop)
      return reader.cancel().catch(() => {})
    },
  })
  return new Response(body, { status: response.status, headers: response.headers })
}

export async function produceChatRun(options: {
  adapter: StreamDurability
  runId: string
  threadId: string
  produce: () => Promise<unknown>
  report: (phase: string, error: unknown) => void
}) {
  try {
    await options.adapter.append([{ type: EventType.RUN_STARTED, runId: options.runId, threadId: options.threadId }])
    await options.produce()
    await options.adapter.append([{ type: EventType.RUN_FINISHED, runId: options.runId, threadId: options.threadId }])
  } catch (error) {
    options.report('generation', error)
    try {
      await options.adapter.append([{ type: EventType.RUN_ERROR, message: 'Reply failed. Please try again.', code: 'run_failed' }])
    } catch (error) {
      options.report('terminal', error)
    }
  } finally {
    try {
      await options.adapter.close()
    } catch (error) {
      options.report('close', error)
    }
  }
}
