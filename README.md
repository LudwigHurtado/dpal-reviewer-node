# DPAL Validator / Review-Node System

Premium enterprise **product concept** for DPAL: a **Validator / Review-Node Command Center** — trust, review, and accountability infrastructure for credentialed reviewers, legal and sector panels, regional truth-check teams, nonprofit partners, and senior QC.

This is **not** a social moderation or generic voting UI. It communicates structured validation, auditable histories, wallet-linked credentials, chain-anchored proofs (conceptual), and operational intelligence for administrators, analysts, legal teams, and validators.

## What’s in this repo

- React + Vite + TypeScript single-page dashboard
- Deep blue / graphite / silver palette with muted gold accents
- Sections: ecosystem roles, network map, report queues, escalations, reviewer performance, quality analytics, credentials, consensus tracker, conflict-of-interest alerts, regional coverage, category expertise, audit logs / chain proof samples, AI-assisted summary (advisory)

Illustrative metrics and IDs are **mock data** for demonstration.

## Run locally

```bash
cd "C:\DPAL Reviewer Node"
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Build for static hosting

```bash
npm run build
npm run preview
```

Output is in `dist/`.

## Create a GitHub repository

From this folder, after [GitHub CLI](https://cli.github.com/) login (`gh auth login`):

```bash
git init
git add .
git commit -m "Initial commit: Validator Review-Node command center concept"
gh repo create dpal-reviewer-node --private --source=. --remote=origin --push
```

Or create an empty repo in the GitHub UI, then:

```bash
git remote add origin https://github.com/<your-org>/dpal-reviewer-node.git
git branch -M main
git push -u origin main
```

## Relationship to DPAL

This package is a **standalone** front-end concept for the DPAL ecosystem. Integrate with your API and auth layers when you promote it from concept to production.
