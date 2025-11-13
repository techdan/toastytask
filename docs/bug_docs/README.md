# Bug Documentation

This directory contains detailed documentation of significant bugs encountered during development, their investigation process, attempted solutions, and final fixes.

## Purpose

These documents serve as:
- **Reference material** for similar bugs in the future
- **Learning resources** for understanding complex client-server sync patterns
- **Historical record** of technical decisions and debugging approaches
- **Onboarding material** for new developers

## Documents

### [task-disappearing-race-condition.md](task-disappearing-race-condition.md)

**Category:** Client-Server Sync, Race Conditions

**Summary:** Tasks would disappear or end up in the wrong completion state when rapidly checking/unchecking due to out-of-order server responses.

**Key Learnings:**
- Server response order ≠ request order
- Intent tracking with timestamps solves stale response problems
- Eventual consistency with auto-correction provides both UX and correctness
- Query invalidation scope matters for preventing duplicate fetches

**Solution Pattern:** Intent tracking + stale detection + automatic correction

---

## Contributing

When documenting a bug, include:

1. **Summary** - One sentence description
2. **Symptoms** - What the user experiences
3. **Root Cause** - Technical explanation of what's actually happening
4. **Attempted Fixes** - What was tried and why it didn't work
5. **Final Solution** - What ultimately fixed it
6. **Key Learnings** - Generalizable insights
7. **Prevention** - How to avoid similar bugs
8. **Files Modified** - List of changed files with brief descriptions

## Template

```markdown
# Bug: [Short Title]

**Date:** YYYY-MM-DD
**Severity:** Low | Medium | High | Critical
**Status:** Fixed ✅ | In Progress 🔄 | Deferred ⏸️

## Summary
[One paragraph summary]

## Symptoms
[What the user experiences]

## Root Cause
[Technical explanation]

## Attempted Fixes
### Attempt 1: [Name]
**What we tried:** ...
**Why it didn't work:** ...

## The Solution
[Final fix with code examples]

## Key Learnings
[Generalizable insights]

## Prevention
[How to avoid similar bugs]

## References
[Links to related docs, issues, or patterns]
```

## Categories

- **Client-Server Sync** - Race conditions, optimistic updates, cache invalidation
- **Performance** - Rendering issues, memory leaks, slow queries
- **UI/UX** - Layout bugs, interaction problems, accessibility
- **Data Integrity** - Calculation errors, state corruption, database issues
- **Security** - XSS, injection, authentication/authorization bugs

## Related Documentation

- [Debug Heat Jumping Issue](../debug-heat-jumping-issue.md) - Related race condition patterns
- [Current Heat Algorithm](../current-heat-algorithm.md) - Calculation logic
- [Requirements](../requirements.md) - Feature specifications
- [AGENTS.md](../../AGENTS.md) - Architecture and tech stack
