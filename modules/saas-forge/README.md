<div align="center">

# saas-forge

**SaaS project scaffolder for Claude Code**

*Go from idea to full-stack SaaS app without leaving your terminal.*

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Install with skills.sh](https://img.shields.io/badge/skills.sh-install-ff6600)](https://skills.sh)
[![Claude Code Plugin](https://img.shields.io/badge/claude--code-plugin-blueviolet)](https://code.claude.com/docs/en/plugins)

</div>

---

## The Problem

You want to build a SaaS. So you:

1. Search "best Next.js SaaS boilerplate"
2. Clone a template
3. Spend 2 hours reading docs
4. Figure out which features to keep
5. Delete code you don't need
6. Realize something broke
7. Manually wire up your business logic
8. ...

**What if you could just type one command?**

```
/saas-forge:saas A project management tool for freelancers
```

saas-forge brainstorms the idea with you, scaffolds the project, removes what you don't need, generates your data models, features, and pages. Ready to `npm run dev`.

---

## Features

### `/saas-forge:saas` — Idea to codebase in one command

```
/saas-forge:saas A project management tool for freelancers
/saas-forge:saas An invoicing app for small agencies --yes
```

**Phase 1: Brainstorming** — Refines your idea interactively:
- Clarifies the concept, target users, value proposition
- Designs the data model (Drizzle schemas)
- Maps user flows and pages
- Presents the boilerplate features with keep/remove recommendations

**Phase 2: Scaffolding** — Dispatches the builder agent to:
- Clone and initialize from `nmarijane/saas-boilerplate`
- Remove unused features cleanly (billing, onboarding, i18n, etc.)
- Generate business models, queries, actions, components
- Wire up routes, navigation, and seed data
- Verify TypeScript and lint pass

**Phase 3: Summary** — Hands you the keys:
- What was created, kept, and removed
- How to start (`npm install && npm run dev`)
- Environment variables to configure
- Recommended next steps

---

## What's in the Boilerplate

The scaffolder builds on [`nmarijane/saas-boilerplate`](https://github.com/nmarijane/saas-boilerplate), which includes:

| Always included | Optional (keep or remove) |
|----------------|--------------------------|
| Auth (Better Auth — self-hosted, organizations, RBAC) | Billing (Stripe) |
| Email (React Email + Nodemailer) | Onboarding wizard |
| Dashboard (base layout + navigation) | Notifications in-app |
| | Feedback widget |
| | File upload (S3) |
| | Admin panel |
| | i18n (next-intl) |

You don't need to know which features exist — the brainstorming phase presents each one with a recommendation tailored to your project.

---

## Quick Start

### Option A: Install via skills.sh (recommended)

```bash
npx skills add nmarijane/saas-forge
```

### Option B: Install as Claude Code plugin

```bash
git clone https://github.com/nmarijane/saas-forge.git
claude --plugin-dir ./saas-forge
```

### Start using it

```
/saas-forge:saas Your SaaS idea here
```

---

## Architecture

saas-forge is a **pure-skills plugin** — every file is Markdown.

```
saas-forge/
  .claude-plugin/plugin.json       # Plugin manifest
  skills/
    saas/SKILL.md                  # Brainstorm + scaffold workflow
  agents/
    saas-builder.md                # Subagent: project scaffolding
```

No TypeScript. No build step. No `node_modules`. Just Markdown files that tell Claude what to do.

**Want to add a feature?** Edit a `.md` file and submit a PR.

---

## Tech Stack (generated projects)

- **Framework:** Next.js 15 (App Router, Server Components)
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** Better Auth (self-hosted, organizations, RBAC)
- **UI:** shadcn/ui + Tailwind CSS
- **Email:** React Email + Nodemailer
- **Payments:** Stripe (optional)
- **Validation:** Zod
- **Forms:** react-hook-form

---

## Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Edit** the relevant `SKILL.md` or agent file
4. **Test** with `claude --plugin-dir ./saas-forge`
5. **Submit** a pull request

### Ideas for contributions

- Add more boilerplate features (analytics, changelog, docs site)
- Support alternative stacks (Prisma, Lucia Auth, etc.)
- Add a `/saas-forge:feature` command to add features to existing projects
- Post-scaffold health checks

---

## License

[MIT](LICENSE) — do whatever you want with it.
