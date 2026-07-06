# Security Policy

## Supported versions

Security fixes are applied to the latest published release. Please always use the most recent version.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

**Please do not report security issues in public GitHub issues.**

Report privately using GitHub's **"Report a vulnerability"** button under the repository's **[Security](https://github.com/Shreyas1015/create-rigel/security)** tab (Private Vulnerability Reporting). This opens a private advisory only the maintainer can see.

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a minimal example if possible)
- The affected version(s) and your environment (OS, Node version)

### What to expect

- **Acknowledgement:** within a few days.
- **Assessment & fix:** we'll investigate, agree on a severity, and work on a fix.
- **Disclosure:** once a fix is released, the advisory is published with credit to the reporter (unless you prefer to remain anonymous).

## Scope

`create-rigel` is a scaffolding CLI that copies template files into a new directory. The relevant surface area is:

- the scaffolder itself (`cli.js`), and
- the contents of the shipped templates under `templates/`.

Vulnerabilities in tools a *generated* project later installs (e.g. a template's dependencies) should be reported to those upstream projects, though we welcome reports about insecure defaults we ship.

Thank you for helping keep the project and its users safe.
