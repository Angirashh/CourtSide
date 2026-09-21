import os
from celery import Celery

# Redis connection URI (Default for local development via Docker)
REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "tournament_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.worker.tasks_scheduling"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Worker optimizations for heavy CPU bound tasks (CP-SAT)
    worker_prefetch_multiplier=1,
    task_acks_late=True
)

celery = celery_app
app = celery_app