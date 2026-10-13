## ![GitVersion Tag Action](img/header.png)

## Overview

The **gitversion-tag-action** automates tagging your repository with a semantic version determined by [GitVersion](https://gitversion.net/), which analyzes your git history to calculate the next version based on your configuration.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `configFilePath` | Empty | Custom GitVersion config path, relative to the caller's checkout or absolute. Empty uses the bundled config. |
| `useDefaultConfig` | `false` | Force the bundled config even if a custom path is supplied. |
| `prefix` | Empty | Tag prefix, for example `v`. Existing unprefixed tagging remains the default. |
| `dry-run` | `false` | Compute version outputs without creating or pushing tags. |
| `tagMessage` | Empty | Custom tag annotation. Empty uses the latest commit subject. |

## Outputs

`semVer` remains available for existing callers. The action also forwards every
version output declared by the pinned `gittools/actions/gitversion/execute`,
including `FullSemVer`, `InformationalVersion`, `Major`, `Minor`, `Patch`,
`MajorMinorPatch`, `PreReleaseTag`, `Sha`, `ShortSha`, and `VersionSourceDistance`.
See [action.yml](action.yml) for the complete list.

| Output | Description |
| --- | --- |
| `tagged` | `true` if this run pushed tags; otherwise `false`. |
| `pushed-tag` | Exact tag pushed, or empty if skipped. Includes the chosen prefix and prerelease label. |
| `pushed-tags` | All pushed tags, separated by spaces. |
| `skip-reason` | `dry-run`, `tag-exists`, or empty after a successful push. |

## Execution

The action follows these steps:

1. Select the config bundled with this action, or the explicitly supplied custom config. The action never copies a config into the caller's checkout.
2. Install the pinned GitVersion tool using `gittools/actions` and compute the version and all version outputs. The runner needs the .NET SDK required by the pinned tool; GitHub-hosted Ubuntu runners include it.
3. Unless `dry-run` is enabled, create an annotated exact tag and push only that ref. An exact tag already on the remote is a successful no-op. Existing exact tags are never force-updated.

## Shared Configuration

[gitversion.yml](gitversion.yml) is the central config shipped with the action.
Consumers need no config file unless they want different versioning rules. Pin
the action version to pin both its behavior and its config. The default recognizes
both prefixed (`v1.2.3`) and unprefixed (`1.2.3`) version tags.

| Commit | Increment |
| --- | --- |
| `feat!: ...`, `feat(scope)!: ...`, or an uppercase `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer | Major |
| `feat: ...` or `feat(scope): ...` | Minor |
| `fix`, `perf`, `refactor`, or `revert`, optionally scoped | Patch |
| `chore`, `docs`, `style`, `test`, `ci`, and other non-breaking types | None |

All commits since the version source are evaluated. A documentation commit does
not suppress a preceding feature or breaking change. The main branch uses no
automatic increment; maintenance branches use `release/MAJOR.MINOR.PATCH`.

## Example Workflow

To use the **Tag a git version** action in a GitHub workflow, refer to the example below:

> [!WARNING]
> For production environments make sure to replace `@main` by a pinned version.

```yaml
name: GitVersion Tag

permissions:
  contents: write

on:
  push:
    branches: [ "main" ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout Step
      uses: actions/checkout@v6
      with:
        fetch-depth: 0
        fetch-tags: true
    - name: Tag the repo
      id: gitversion
      uses: michielvha/gitversion-tag-action@main
```

To keep an existing custom config, pass `configFilePath: gitversion.yml` (or its
actual path). Explicit paths remain supported and missing files fail clearly.
Remove that input, or add `useDefaultConfig: 'true'`, to adopt the bundled rules.
For pull-request builds, use `dry-run: 'true'` and `contents: read` permissions.

In this workflow:

- The action is triggered on pushes to the `main` branch and can also be manually triggered using the `workflow_dispatch` event.
- The repository is checked out with a fetch depth of 0, ensuring all tags and branches are fetched.
- The `semVer` is calculated using the bundled configuration and tagged together with the latest commit message.

It's possible to pass the version to other actions via the output.

```yaml
...
      - name: Build and Push Docker Image
        id: docker-build
        uses: michielvha/docker-release-action@v1
        with:
          version: ${{ steps.gitversion.outputs.semVer }}
...
```

## Development

Use Node 24 or newer. Run `npm ci` and `npm test` for config-selection and Git-remote regression tests.
Set `GITVERSION_BINARY` to a GitVersion executable to also run the real-history
version tests. CI downloads the exact version pinned in [action.yml](action.yml)
and exercises the composite action in dry-run mode.

## Releasing This Action

[.github/workflows/release.yml](.github/workflows/release.yml) calls the public
`vhco-pro/.github` reusable release workflow at an immutable commit. On a push to
`main`, it publishes an exact version tag and a GitHub Release with Conventional
Commit notes. It does not create or update major/minor alias tags.

Pull requests run the same workflow as a dry-run preview, producing notes in the
job summary without publishing anything. Manual runs also default to dry-run.
The caller grants `contents: write`; its own `GITHUB_TOKEN` writes the release
in this repository, not in `vhco-pro`. No cross-account token or inherited secrets
are required because the reusable workflow and its dependencies are public.

### Reference
- [GitVersion Config File Specification](https://gitversion.net/docs/reference/configuration) - Complete reference for the configuration file. The bundled config is [here](gitversion.yml).
- [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions)
