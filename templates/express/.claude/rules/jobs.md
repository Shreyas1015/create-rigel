---
paths:
  - "src/runtime/workers/**/*.ts"
---

# Job Rules — Auto-injected on worker file edits

## Worker Checklist (every worker file)

### 1. Validate payload with Zod before touching it
```typescript
const worker = new Worker(QUEUES.REMINDER_EMAIL, async (job) => {
  // ✅ REQUIRED — validate before processing
  const payload = ReminderEmailJobSchema.parse(job.data)

  // ❌ FORBIDDEN
  const { reminderId } = job.data   // trusting unvalidated external data
}, { connection: redis })
```

### 2. Structured logging — start, complete, failed
```typescript
const worker = new Worker(QUEUES.REMINDER_EMAIL, async (job) => {
  const payload = ReminderEmailJobSchema.parse(job.data)
  const start = Date.now()

  logger.info({ event: 'job.start', jobId: job.id, queue: QUEUES.REMINDER_EMAIL })

  try {
    await reminderService.sendReminderEmail(payload)
    logger.info({ event: 'job.complete', jobId: job.id, queue: QUEUES.REMINDER_EMAIL, durationMs: Date.now() - start })
  } catch (err) {
    logger.error({ event: 'job.failed', jobId: job.id, queue: QUEUES.REMINDER_EMAIL, err: (err as Error).message })
    throw err  // re-throw so BullMQ handles retry
  }
}, { connection: redis, concurrency: 5 })
```

### 3. Retry config on queue definition
```typescript
// ✅ Define retry on the queue
export const reminderQueue = new Queue(QUEUES.REMINDER_EMAIL, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
  },
})
```

### 4. Metrics
```typescript
worker.on('completed', (job) => {
  metrics.increment('jobs.completed', { queue: QUEUES.REMINDER_EMAIL })
})
worker.on('failed', (job, err) => {
  metrics.increment('jobs.failed', { queue: QUEUES.REMINDER_EMAIL })
  logger.error({ event: 'job.failed', jobId: job?.id, err: err.message })
})
```

### 5. Circuit breaker on external calls inside workers
```typescript
// Workers call external APIs (email, SMS, webhooks)
// Always wrap with circuit breaker + retry
const result = await withRetry(
  () => emailBreaker.call(() => emailProvider.send(payload)),
  { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, jitter: true }
)
```

### 6. Graceful shutdown hook
```typescript
// Register in src/runtime/server.ts shutdown sequence
async function shutdown() {
  await reminderWorker.close()   // drain in-flight jobs
  await reminderQueue.close()
}
```
