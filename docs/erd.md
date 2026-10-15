# Persistent model

```mermaid
erDiagram
  users ||--o{ members : joins
  classrooms ||--o{ members : contains
  classrooms ||--o{ groups : contains
  groups ||--o{ members : assigns
  classrooms ||--o{ assignments : contains
  assignments ||--o{ pairs : schedules
  users ||--o{ pairs : evaluates
  pairs ||--o| answers : drafts_and_latest_submission
  pairs ||--o{ revisions : submission_history
  assignments ||--o{ submissions : idempotent_requests
  assignments ||--o{ scores : immutable_final_score
  assignments ||--o{ overrides : reasoned_adjustment
  assignments ||--o{ audit_events : audited_actions
```

Assignment criteria/configuration and immutable calculation snapshots are JSONB. Each persisted pair carries criterion ID, side, generation and displayed-left item. Answers keep draft and submitted choices separately. Final numeric scores use `numeric(14,8)`. All timestamps use UTC. Audit events reside in the `audit` schema and reject update/delete in the database.
