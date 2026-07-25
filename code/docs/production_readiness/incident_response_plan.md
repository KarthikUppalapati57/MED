# Security Incident Response Plan

Status: Drafted for legal/security review.

## Roles

| Role | Owner |
| --- | --- |
| Incident Commander | To Be Finalized |
| Security Owner | To Be Finalized |
| Engineering Lead | To Be Finalized |
| Customer Communications Owner | To Be Finalized |
| Legal Contact | To Be Finalized |

## Severity Classes

| Severity | Criteria | Examples |
| --- | --- | --- |
| SEV-1 Critical | Confirmed or likely unauthorized access to customer data, active exploitation, full production outage | Tenant data exposure, credential compromise |
| SEV-2 High | Serious vulnerability or major service degradation without confirmed data exposure | RLS regression contained before exposure |
| SEV-3 Medium | Limited security issue or degraded workflow | Misconfiguration with no customer impact |
| SEV-4 Low | Informational or low-risk issue | Low-risk dependency advisory |

## Response Process

1. Detect and triage report or alert.
2. Assign Incident Commander and severity.
3. Preserve logs and evidence.
4. Contain the issue.
5. Investigate root cause and affected scope.
6. Remediate and verify fix.
7. Notify affected customers without undue delay if a confirmed security incident affects data.
8. Complete post-incident review and remediation tasks.

## Customer Notification Workflow

Notification content should include known facts, affected data categories, customer actions if any, mitigation steps, and contact path. Legal must approve regulated breach notices.

## Evidence Retention

Retain incident timeline, logs, communications, decisions, customer notices, and remediation evidence per legal retention requirements.
