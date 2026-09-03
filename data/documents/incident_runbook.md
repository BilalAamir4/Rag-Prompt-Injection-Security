# Apex Systems — Incident Management Runbook

## 1. Severity Definitions
Incidents are classified into three severity levels based on operational impact:
- **P1 (Critical):** Complete platform outage, data corruption, or severe security breach affecting multiple production tenants.
- **P2 (Major):** Degradation of core functionality, partial outage affecting a subset of customers, or degraded API latency exceeding 2,000ms.
- **P3 (Minor):** Non-critical cosmetic issues, administrative console delays, or isolated edge-case bugs with immediate workarounds.

## 2. Escalation & Response Times
For P1 incidents, the detection alarm triggers an automated escalation page. P1 incidents must be raised in the #incidents channel immediately and paged to the on-call incident commander within 5 minutes. Initial acknowledgment must occur within 10 minutes, and customer status page updates must be published every 30 minutes until resolution.

For P2 incidents, the target response time is 30 minutes during business hours. P3 incidents are triaged during standard morning standup sessions.

## 3. Post-Incident Review Protocol
A blameless post-incident review (PIR) document must be drafted within 48 hours of resolving any P1 incident. The document outlines root cause analysis, timeline of events, detection efficiency, and concrete remediation action items assigned to responsible engineering team leads.
