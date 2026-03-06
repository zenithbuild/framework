# Branch Protection Checklist

Protect each of these branches in GitHub Settings:

- `master`
- `train`
- `beta`

Required settings:

- Require a pull request before merging.
- Require the `ci` status check to pass.
- Require branches to be up to date before merging.
- Disallow force pushes.
- Disallow direct pushes by anyone who should follow the PR flow.
