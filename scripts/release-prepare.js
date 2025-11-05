#!/usr/bin/env node

/**
 * Release Preparation Script for DroidDock
 *
 * This script:
 * 1. Validates the version format
 * 2. Updates version in package.json, tauri.conf.json, and Cargo.toml
 * 3. Updates CHANGELOG.md with the new version
 * 4. Creates a git commit with the version changes
 * 5. Creates a git tag for the release
 *
 * Usage: npm run release:prepare <version>
 * Example: npm run release:prepare 0.2.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ Error: ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Validate version format (semantic versioning)
function validateVersion(version) {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
  return semverRegex.test(version);
}

// Update package.json
function updatePackageJson(version) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const oldVersion = packageJson.version;

  packageJson.version = version;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

  success(`Updated package.json: ${oldVersion} → ${version}`);
  return oldVersion;
}

// Update tauri.conf.json
function updateTauriConfig(version) {
  const configPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  config.version = version;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  success(`Updated tauri.conf.json: ${version}`);
}

// Update Cargo.toml
function updateCargoToml(version) {
  const cargoPath = path.join(__dirname, '..', 'src-tauri', 'Cargo.toml');
  let cargoContent = fs.readFileSync(cargoPath, 'utf8');

  // Replace version in [package] section
  cargoContent = cargoContent.replace(
    /^version = ".*"$/m,
    `version = "${version}"`
  );

  fs.writeFileSync(cargoPath, cargoContent);
  success(`Updated Cargo.toml: ${version}`);
}

// Update CHANGELOG.md
function updateChangelog(version) {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) {
    warning('CHANGELOG.md not found, skipping changelog update');
    return;
  }

  let changelog = fs.readFileSync(changelogPath, 'utf8');
  const date = new Date().toISOString().split('T')[0];
  const unreleasedSection = `## [Unreleased]`;
  const newVersionSection = `## [${version}] - ${date}`;

  if (changelog.includes(unreleasedSection)) {
    // Replace [Unreleased] with the new version
    changelog = changelog.replace(
      unreleasedSection,
      `${unreleasedSection}\n\n${newVersionSection}`
    );

    fs.writeFileSync(changelogPath, changelog);
    success(`Updated CHANGELOG.md with version ${version}`);
  } else {
    warning('No [Unreleased] section found in CHANGELOG.md, skipping');
  }
}

// Check git status
function checkGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      warning('Working directory has uncommitted changes:');
      console.log(status);

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // In CI environments, we'll skip the prompt
      if (process.env.CI) {
        warning('Running in CI, proceeding anyway...');
        return;
      }
    }
  } catch (err) {
    error('Failed to check git status: ' + err.message);
  }
}

// Create git commit and tag
function createGitCommitAndTag(version) {
  try {
    info('Creating git commit...');
    execSync('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md', { stdio: 'inherit' });
    execSync(`git commit -m "chore: bump version to ${version}"`, { stdio: 'inherit' });
    success(`Created commit for version ${version}`);

    info('Creating git tag...');
    execSync(`git tag -a v${version} -m "Release v${version}"`, { stdio: 'inherit' });
    success(`Created tag v${version}`);

    info('\nNext steps:');
    console.log(`  1. Review the changes: git log -1 --stat`);
    console.log(`  2. Push the commit: git push origin <branch-name>`);
    console.log(`  3. Push the tag: git push origin v${version}`);
    console.log(`  4. GitHub Actions will automatically build and create a release`);

  } catch (err) {
    error('Failed to create git commit/tag: ' + err.message);
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    error('Please provide a version number. Usage: npm run release:prepare <version>');
  }

  let version = args[0];

  // Remove 'v' prefix if present
  if (version.startsWith('v')) {
    version = version.substring(1);
  }

  // Validate version format
  if (!validateVersion(version)) {
    error(`Invalid version format: ${version}. Please use semantic versioning (e.g., 0.2.0)`);
  }

  log(`\n${'='.repeat(60)}`, 'bright');
  log(`  DroidDock Release Preparation`, 'bright');
  log(`${'='.repeat(60)}\n`, 'bright');

  info(`Preparing release for version: ${version}\n`);

  // Check git status
  checkGitStatus();

  // Update all version files
  const oldVersion = updatePackageJson(version);
  updateTauriConfig(version);
  updateCargoToml(version);
  updateChangelog(version);

  console.log('');

  // Create git commit and tag
  createGitCommitAndTag(version);

  log(`\n${'='.repeat(60)}`, 'bright');
  log(`  Release preparation complete! 🚀`, 'green');
  log(`${'='.repeat(60)}\n`, 'bright');
}

main();
