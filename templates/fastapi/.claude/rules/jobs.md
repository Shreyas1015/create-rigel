---
paths:
  - "src/runtime/workers/**/*.py"
  - "src/workers/**/*.py"
---

# Job Rules — Auto-injected on worker file edits

## Every Celery Task Checklist

### 1. Validate payload with Pydantic before touching it
```python
@celery_app.task(
    name="reminder.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="reminder-email",
)
def send_reminder_email_task(self: Task, payload: dict) -> None:
    # ✅ REQUIRED — validate before processing
    data = ReminderEmailPayload.model_validate(payload)

    # ❌ FORBIDDEN — trusting raw task payload
    reminder_id = payload["reminder_id"]   # no validation
```

### 2. Structured logging — start, complete, failed
```python
def send_reminder_email_task(self: Task, payload: dict) -> None:
    data = ReminderEmailPayload.model_validate(payload)
    start = time.time()

    logger.info("job.start", task=self.name, task_id=self.request.id)

    try:
        reminder_service.send_email(data)
        logger.info(
            "job.complete",
            task=self.name,
            task_id=self.request.id,
            duration_ms=int((time.time() - start) * 1000),
        )
    except Exception as exc:
        logger.error("job.failed", task=self.name, err=str(exc))
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 30)
```

### 3. Retry with exponential backoff
```python
@celery_app.task(
    bind=True,
    max_retries=3,
    acks_late=True,              # ack after success, not on receipt
    reject_on_worker_lost=True,  # re-queue if worker dies mid-task
)
def my_task(self, payload: dict) -> None:
    ...
    except SomeTransientError as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 30)
```

### 4. External calls use tenacity retry + timeout
```python
from tenacity import retry, stop_after_attempt, wait_exponential
import httpx

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def call_email_provider(data: EmailPayload) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(EMAIL_API_URL, json=data.model_dump())
        response.raise_for_status()
```

### 5. Never create DB sessions inside a task directly
```python
# ✅ Use the service layer which manages its own session
def send_reminder_email_task(self, payload: dict) -> None:
    data = ReminderEmailPayload.model_validate(payload)
    # Service opens its own session internally
    asyncio.run(reminder_service.process(data))

# ❌ Never
async with AsyncSessionLocal() as session:   # not thread-safe in Celery workers
```
