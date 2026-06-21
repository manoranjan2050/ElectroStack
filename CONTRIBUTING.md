# Contributing

Thanks for helping build ElectroStack.

## Local Setup

1. Install Node.js 20+, Rust stable, and Visual Studio Build Tools.
2. Run `npm install`.
3. Run `npm run tauri:dev`.
4. Run `npm run lint` and `npm run typecheck` before opening a pull request.

## Pull Requests

- Keep changes modular and documented.
- Include tests or verification notes for service orchestration changes.
- Avoid committing downloaded runtime packages from `C:\ElectroStack\packages`.
- Use conventional commit messages where practical.

## Security Issues

Please do not open public issues for credential, privilege escalation, or update-channel vulnerabilities. Report them privately to the maintainers listed in `SECURITY.md`.
