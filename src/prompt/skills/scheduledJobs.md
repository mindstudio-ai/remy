---
name: Scheduled Jobs
what: Methods that run on a schedule, declared as cron expressions in an interface config and synced to the platform on deploy. Nothing to host and no scheduler to run — a job is a method plus a schedule line.
when: Before adding a `cron` interface or writing a method meant to run on a timer.
---

# Cron Interfaces

Scheduled method execution.

## Config (`interface.json`)

The top-level key must match the interface type (`cron`):

```json
{
  "cron": {
    "jobs": [
      {
        "schedule": "0 9 * * 5",
        "method": "process-weekly-payments",
        "description": "Process approved invoices every Friday at 9am"
      },
      {
        "schedule": "*/30 * * * *",
        "method": "sync-vendor-status",
        "description": "Sync vendor statuses every 30 minutes"
      }
    ]
  }
}
```

Standard cron expression format. `method` is the id of a method in `methods[]`. Jobs are synced to the platform on deploy.

Declare it in `mindstudio.json`:

```json
{ "type": "cron", "path": "dist/interfaces/cron/interface.json" }
```

## Auth

Methods invoked through this interface run with `auth.roles: ['system']` — the platform is calling, not a user session, so there's no user to impersonate. Use `auth.requireRole('system')` to gate methods that should only be reachable on a schedule. The auth reference in your system prompt covers the system role in full.

A scheduled job that needs to act on user data acts as the system, not as any user, so it reaches everything. Scope what it touches in the method itself rather than relying on role checks to narrow it.

## Operating jobs in production

The `remy-admin cron` group covers the live app's schedule without opening the dashboard:

```bash
remy-admin cron list              # every job: schedule, status (active|paused|blocked), next run, recent runs
remy-admin cron run <methodId>    # trigger a run now (202 { requestId }; doesn't affect the schedule)
```

A run's id is its request-log id — debug a failing job with `remy-admin requests get <runId>`. Jobs that fail repeatedly become `blocked` (see `statusReason`) and stay stopped until fixed and redeployed.
