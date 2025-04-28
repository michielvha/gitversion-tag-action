# Tag a Git Version Action

## Overview

The "Tag a git version" action is designed to tag a repository with a version determined by GitVersion. GitVersion is a tool that uses your git repository's history to determine the next semantic version tag. This action automates the process of tagging your repository based on the GitVersion configuration.

## Inputs

Below are the inputs required for this action:

- **configFilePath**: Path to the GitVersion configuration file.
  - Description: Path to the GitVersion configuration file.
  - Required: True
  - Default: 'gitversion.yml'

## Execution

The action uses a composite run type and follows these steps:

1. **Install GitVersion**: Installs the specified version of GitVersion.
2. **Determine Version**: Uses GitVersion to determine the semantic version based on the repository's history and the provided configuration file.
3. **Tag the Repo**: If the current branch is `master`, the repository is tagged with the determined version and the tag is pushed to the origin.

## Example Workflow

To use the "Tag a git version" action in a GitHub workflow, follow the example below:

```yaml
name: GitVersion Tag

permissions:
  id-token: write
  contents: write

on:
  push:
    branches: [ "master" ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout Step
      uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - name: Tag the repo
      uses: MKTHEPLUGG/gitversion-tag-action@v1
      with:
        configFilePath: gitversion.yml
```

In this workflow:

- The action is triggered on pushes to the `master` branch and can also be manually triggered using the `workflow_dispatch` event.
- The repository is checked out with a fetch depth of 0, ensuring all tags and branches are fetched.
- The "Tag a git version" action is used to determine the version and tag the repository accordingly.

Ensure that you have the `gitversion.yml` configuration file in your repository or provide the correct path to your configuration file in the `configFilePath` input.


### reference
- [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions)
