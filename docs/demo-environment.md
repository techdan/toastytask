# Public Demo Environment

The hosted Toasty Task application is available at
[homeandmatter.com](https://www.homeandmatter.com/).

## Shared Demo User

Use this intentionally public account to review the application without
creating a personal account:

```text
Email: demo@toastytask.com
Password: demotoastytask
```

The demo account is not a privileged account. It must contain synthetic data
only. Anyone may sign in, change its task data, or delete its task data, so its
contents should not be treated as durable.

## Maintainer Checklist

- Keep the demo user isolated from private user data through the same
  multi-tenant authorization rules used for every account.
- Seed the account with synthetic tasks and notes only.
- Reset the synthetic dataset when needed.
- Do not grant administrative privileges to the demo user.
- Prevent password or recovery-setting changes through the demo flow, or
  restore the published credentials when they change.
- Treat the published password as public information.
