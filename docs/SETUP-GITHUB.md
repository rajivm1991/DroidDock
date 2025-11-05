# GitHub Repository Setup Guide

This guide walks through the necessary GitHub repository configuration for DroidDock's automated release system.

## 1. Enable GitHub Pages

The DroidDock landing page is hosted via GitHub Pages.

### Steps:

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under **Source**, select:
   - Source: **Deploy from a branch**
   - Branch: **main** (or your default branch)
   - Folder: **/docs**
4. Click **Save**
5. Wait a few minutes for deployment
6. Your site will be available at: `https://rajivm1991.github.io/DroidDock/`

## 2. Add Tauri Signing Key Secret

The updater system requires a signing key to verify updates.

### Steps:

1. **Get your private key**:
   ```bash
   cat ~/.tauri/droiddock.key
   ```

2. **Copy the entire key content** (including the header and footer)

3. Go to your repository on GitHub

4. Click **Settings** → **Secrets and variables** → **Actions**

5. Click **New repository secret**

6. Create the secret:
   - **Name**: `TAURI_SIGNING_PRIVATE_KEY`
   - **Secret**: Paste the entire private key content
   - Click **Add secret**

### Security Notes:

- ⚠️ **Never commit the private key to your repository**
- ⚠️ The private key is stored in `~/.tauri/droiddock.key` - keep this file secure
- ✅ The public key is already in `tauri.conf.json` - this is safe to commit
- ✅ GitHub Secrets are encrypted and only accessible to GitHub Actions

### What the Signing Key Does:

- **Signs** the update manifest and DMG checksums
- **Verifies** that updates come from you (the developer)
- **Prevents** malicious update injection
- **Works** even without Apple code signing

## 3. Configure Repository Permissions

GitHub Actions needs permission to create releases.

### Steps:

1. Go to **Settings** → **Actions** → **General**

2. Scroll to **Workflow permissions**

3. Select **Read and write permissions**

4. Check **Allow GitHub Actions to create and approve pull requests**

5. Click **Save**

## 4. Test the Workflow

Before creating your first real release, test the workflow:

### Option 1: Manual Test (Recommended)

1. Create a test tag locally:
   ```bash
   git tag -a v0.1.1-test -m "Test release"
   git push origin v0.1.1-test
   ```

2. Go to **Actions** tab on GitHub

3. Watch the **Release** workflow run

4. Check the **Releases** page for the draft release

5. If successful, delete the test release and tag:
   ```bash
   git tag -d v0.1.1-test
   git push origin :refs/tags/v0.1.1-test
   ```

### Option 2: Workflow Dispatch (Optional)

You can also add a `workflow_dispatch` trigger to `.github/workflows/release.yml` for manual testing.

## 5. Verify GitHub Pages Deployment

After enabling GitHub Pages:

1. Visit your site: `https://rajivm1991.github.io/DroidDock/`

2. Check that:
   - Page loads correctly
   - Icon displays properly
   - Screenshots load
   - Download button works
   - GitHub API fetches latest release

## 6. Branch Protection (Optional)

To protect your main branch:

1. Go to **Settings** → **Branches**

2. Click **Add rule** under "Branch protection rules"

3. Configure:
   - Branch name pattern: `main`
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging

4. Click **Create**

## 7. Release Checklist

Before creating your first production release:

- [ ] GitHub Pages is enabled and working
- [ ] `TAURI_SIGNING_PRIVATE_KEY` secret is set
- [ ] Workflow permissions are configured
- [ ] Test release workflow has run successfully
- [ ] CHANGELOG.md is up to date
- [ ] README.md points to the correct URLs
- [ ] All features are tested

## Troubleshooting

### Workflow Fails with "Permission Denied"

- **Solution**: Enable "Read and write permissions" in Actions settings

### "Secret not found" Error

- **Solution**: Ensure `TAURI_SIGNING_PRIVATE_KEY` is set in repository secrets
- **Check**: Secret name is exactly `TAURI_SIGNING_PRIVATE_KEY` (case-sensitive)

### GitHub Pages Shows 404

- **Solution**: Wait 5-10 minutes for initial deployment
- **Check**: Correct branch and `/docs` folder are selected
- **Verify**: `docs/index.html` exists in your repository

### Release DMG Not Created

- **Solution**: Check GitHub Actions logs for build errors
- **Verify**: All dependencies are correctly specified
- **Check**: Cargo.toml and tauri.conf.json are valid

### Auto-Update Not Working

- **Solution**: Verify `latest.json` is created in the release
- **Check**: Public key in `tauri.conf.json` matches your key
- **Verify**: Updater endpoint URL is correct

## Additional Resources

- [Tauri Updater Documentation](https://tauri.app/v1/guides/distribution/updater/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Semantic Versioning](https://semver.org/)

## Support

If you encounter issues:

1. Check the [Actions](https://github.com/rajivm1991/DroidDock/actions) tab for workflow logs
2. Review the [Releases](https://github.com/rajivm1991/DroidDock/releases) page
3. Open an [Issue](https://github.com/rajivm1991/DroidDock/issues) with workflow logs attached
