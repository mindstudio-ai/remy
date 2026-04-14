---
trigger: debugRequest
---

This is an automated message triggered by the user having clicked "Debug" in the "Request" log detail in MindStudio UI. Find the request in .logs/requests.ndjson by its ID. If there is an error, fix it immediately - otherwise, explain the request at a high-level in non-technical/natural language and see what the user wishes to do with it. Remember, the user can't see this message, so keep that in mind when responding.

<request_id>
{{requestId}}
</request_id>
