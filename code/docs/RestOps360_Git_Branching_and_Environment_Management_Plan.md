# RestOps 360 - Git Branching & Environment Management Plan

## Objective

Create a secure Git workflow with four long-lived branches, isolated environments, controlled database migrations, and approval-based deployments.

---

## Repository Structure

```text
Git Repository
|
|-- master-copy
|
|-- rnd
|
|-- qa
|
`-- prod
```

## Branch Purposes

| Branch | Purpose | Deploys | Connected Database |
| --- | --- | --- | --- |
| `master-copy` | Golden source and backup of production releases | No | None |
| `rnd` | Active feature development and experimentation | Yes | Supabase Development |
| `qa` | Quality assurance and user acceptance testing | Yes | Supabase QA |
| `prod` | Live production environment | Yes | Supabase Production |

---

## Environment Architecture

### R&D

- Domain: `dev.restops360.com`
- Supabase Project: `restops-dev`
- Development database
- Test authentication
- Test storage
- Sandbox integrations

### QA

- Domain: `qa.restops360.com`
- Supabase Project: `restops-qa`
- QA database
- QA authentication
- QA storage
- Sandbox integrations

### Production

- Domain: `app.restops360.com`
- Supabase Project: `restops-prod`
- Production database
- Live authentication
- Production storage
- Live integrations

---

## Code Promotion Flow

```text
Feature Branch
  |
  v
R&D
  |
  v
Developer Testing
  |
  v
Admin Approval
  |
  v
QA
  |
  v
QA Testing / UAT
  |
  v
Admin Approval
  |
  v
Production
  |
  v
Tag Release
  |
  v
Merge into Master Copy
```

---

## Database Strategy

Each environment has its own independent Supabase project.

| Environment | Database |
| --- | --- |
| R&D | Development Database |
| QA | QA Database |
| Production | Production Database |

Only database schema moves between environments.

Business data never moves.

---

## Database Migrations

Every schema change must be created as a migration.

Example:

```text
001_create_users.sql
002_create_restaurants.sql
003_create_invoices.sql
004_add_due_date.sql
```

Promotion:

1. Apply migration in R&D.
2. Test.
3. Merge into QA.
4. Apply pending migrations automatically.
5. Test.
6. Merge into Production.
7. Apply pending migrations automatically.

Migration tools automatically skip migrations already applied.

Never modify an existing migration after it has been committed.

Always create a new migration.

---

## Seed Data

Shared reference data:

- Roles
- Permissions
- Countries
- States
- Invoice Statuses
- Currency
- Tax Types

Seed data is deployed to every environment.

Customer and transactional data is never promoted.

---

## Branch Protection Rules

### Master Copy

- No direct pushes
- Pull Requests required
- Admin approval required
- Force push disabled
- Branch deletion disabled

### Production

- No direct pushes
- Pull Request required
- Minimum 2 approvals
- Admin approval required
- CI checks required
- Deployment checks required

### QA

- No direct pushes
- Pull Request required
- Minimum 1 approval
- CI checks required

### R&D

- Feature branches merge through Pull Requests
- CI checks required

---

## Approval Workflow

```text
Developer
  |
  v
Pull Request
  |
  v
Automated Tests
  |
  v
Code Review
  |
  v
Admin Approval
  |
  v
Merge
```

Only administrators can approve merges into QA, Production, and Master Copy.

---

## CI/CD Pipeline

### R&D

- Build
- Lint
- Unit Tests
- Deploy Development

### QA

- Build
- Tests
- Apply pending migrations
- Deploy QA
- Notify QA team

### Production

- Build
- Tests
- Security Scan
- Database Backup
- Apply pending migrations
- Deploy Production
- Health Check
- Notify Team

---

## GitHub Repository Configuration

Enable branch protection for:

- `master-copy`
- `rnd`
- `qa`
- `prod`

Require:

- Pull Requests
- Passing CI
- Up-to-date branches
- Signed commits, recommended
- Restricted force pushes
- Restricted branch deletion

---

## Environment Secrets

### R&D

- Supabase Dev URL
- Supabase Dev Keys
- Azure OpenAI Dev
- Stripe Test
- Resend Sandbox

### QA

- Supabase QA URL
- Supabase QA Keys
- Azure OpenAI QA
- Stripe Test
- Resend Sandbox

### Production

- Supabase Production URL
- Supabase Production Keys
- Azure OpenAI Production
- Stripe Live
- Resend Production

---

## Team Roles

| Role | R&D | QA | Prod | Master Copy |
| --- | --- | --- | --- | --- |
| Developer | Create PRs | Read | Read | Read |
| QA Engineer | Review | Approve | Read | Read |
| Project Manager | Review | Approve | Approve | Read |
| Administrator | Full Access | Full Access | Full Access | Full Access |

---

## Future Enhancements

- Feature branch workflow: `feature/*`
- GitHub CODEOWNERS
- Automated GitHub Actions
- Semantic version tags
- Automated rollback strategy
- Infrastructure monitoring
- Release notes generation

---

## Summary

This workflow provides:

- Four protected Git branches
- Three isolated Supabase environments
- Controlled schema migrations
- Independent data per environment
- Admin-controlled promotion pipeline
- Automated CI/CD deployments
- Production safety and rollback readiness