---
name: saas
description: Use when creating a new SaaS project from the boilerplate. Clones nmarijane/saas-boilerplate, runs brainstorming to refine the idea, removes unused features, and generates business-specific code (models, routes, components) end-to-end.
---

# Create SaaS Project

You are creating a new SaaS application from the boilerplate `nmarijane/saas-boilerplate`. You will brainstorm the idea with the user, then dispatch the saas-builder agent to scaffold and generate the project.

## Input

Arguments: `$ARGUMENTS`

Parse the arguments:
- **Description:** everything that is not a flag (the natural language description of the SaaS project).
- **Auto-confirm flag:** `--yes` to skip confirmation prompts. Optional.

---

## Phase 1: Brainstorming

Invoke the `superpowers:brainstorming` skill to refine the project idea. The brainstorming MUST cover:

1. **Project understanding** — clarify the SaaS concept, target users, core value proposition
2. **Data model** — identify the key entities, relationships, and Drizzle schemas needed
3. **User flows** — main pages, navigation, dashboards, forms
4. **Feature checklist** — Based on your understanding of the project from steps 1-3, present the boilerplate's built-in features with a **recommendation** for each (keep or remove, and why). The user may not know all available features — always present this checklist explicitly, don't rely solely on their description.

```
Le boilerplate inclut ces features. Voici ma recommandation basée sur ton projet :

Toujours inclus :
  - Auth (Better Auth — self-hosted, organizations, RBAC)
  - Email (React Email + Nodemailer)
  - Dashboard (base layout + navigation)

Pour chaque feature, je recommande :
  ✅ Billing (Stripe) — <raison>
  ❌ Onboarding wizard — <raison>
  ✅ Notifications in-app — <raison>
  ❌ Feedback widget — <raison>
  ...etc.

On garde : Billing, Notifications, ...
On supprime : Onboarding, Feedback, ...

Tu valides cette sélection ou tu veux changer quelque chose ?
```

Each recommendation must include a short justification tied to the project's specific use case. End with a clear summary of what's kept and what's removed so the user can just say "oui" to confirm the whole selection, or request specific changes. The user can override any recommendation.

5. **Design validation** — get user approval on the complete design (data model + features + pages)

Follow the full brainstorming process including writing and committing a design spec.

---

## Phase 2: Dispatch Agent

After the brainstorming design is approved, dispatch the `saas-builder` agent with this context:

- **Project name** (derived from brainstorming — kebab-case, e.g., `task-flow`)
- **Full design spec** from brainstorming (data model, user flows, pages)
- **Features to keep** — the explicit list from the checklist
- **Features to remove** — everything not selected
- **Target directory** — current working directory (the project will be created as `./<project-name>/`)

---

## Phase 3: Summary

After the agent completes, present:

- **Project created** at `./<project-name>/`
- **Features kept** and **features removed**
- **Files generated** — list key business-specific files (models, routes, components)
- **How to start:**
  ```bash
  cd <project-name>
  npm install
  npm run dev
  ```
- **Environment setup** — which `.env` variables to configure
- **Next steps** — what to build next, recommended order
