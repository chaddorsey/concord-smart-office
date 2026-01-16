# Running Claude Code with --dangerously-skip-permissions

This document covers safe usage of Claude Code in DSP (Dangerously Skip Permissions) mode within the sandboxed devpod environment.

## Prerequisites

1. **DevPod environment running**
   ```bash
   devpod up . --ide cursor
   ```

2. **Claude Code authenticated**
   ```bash
   # Inside the devpod
   claude login
   ```

3. **Project directory trusted**
   ```bash
   claude config set trustedDirectories /workspaces/concord-smart-office
   ```

## Starting Claude in DSP Mode

```bash
# Inside the devpod container
claude --dangerously-skip-permissions
```

Or with a specific task:
```bash
claude --dangerously-skip-permissions "Set up the PWA scaffold with Vite and React"
```

## What DSP Mode Enables

With `--dangerously-skip-permissions`, Claude can autonomously:
- Create, edit, and delete files
- Run shell commands (npm, docker, git, etc.)
- Install packages
- Make API calls
- Execute tests

**No confirmation prompts** - Claude acts immediately on decisions.

## Safety: Why DevPod Makes This Safe

Your devpod container provides blast radius containment:

| Risk | Mitigation |
|------|------------|
| File system damage | Container filesystem is isolated and ephemeral |
| Credential exposure | Secrets injected via env vars, not in filesystem |
| Network attacks | Container network is isolated from host |
| Resource exhaustion | Memory/CPU caps enforced (8GB/2 cores) |
| Persistent damage | Container can be destroyed and recreated |

## Best Practices

### DO:
- Run DSP mode only inside the devpod container
- Keep tasks focused and specific
- Review generated code before committing
- Use git to track all changes
- Commit frequently so you can revert

### DON'T:
- Run DSP mode on your host machine
- Give Claude access to production credentials
- Let Claude push directly to main branch
- Run DSP mode with mounted sensitive directories

## Monitoring Claude's Actions

Watch what Claude is doing:
```bash
# In another terminal
tail -f ~/.claude/logs/*.log
```

Review changes before committing:
```bash
git status
git diff
```

## Recovery

If something goes wrong:

1. **Revert uncommitted changes**
   ```bash
   git checkout -- .
   git clean -fd
   ```

2. **Rebuild the container**
   ```bash
   devpod delete concord-smart-office --force
   devpod up . --ide cursor
   ```

3. **Start fresh from last commit**
   ```bash
   git reset --hard HEAD
   ```

## Example Session

```bash
# Start devpod
devpod up . --ide cursor

# Inside Cursor terminal
claude login

# Trust the project
claude config set trustedDirectories /workspaces/concord-smart-office

# Start working
claude --dangerously-skip-permissions

# Claude prompt:
> Create a basic PWA scaffold in the pwa/ directory using Vite, React, and TypeScript.
> Include PWA manifest, service worker, and basic routing structure.
```

## Recommended Workflow

1. **Plan** - Describe what you want Claude to build
2. **Execute** - Let Claude work in DSP mode
3. **Review** - Check the generated code
4. **Test** - Run tests and verify functionality
5. **Commit** - Save working state to git
6. **Iterate** - Repeat with next task
