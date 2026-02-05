// DTEF Configuration Repository
// Default to collect-intel/dtef-configs for DTEF, can be overridden via environment variable
export const BLUEPRINT_CONFIG_REPO_SLUG = process.env.NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG || 'collect-intel/dtef-configs';
export const BLUEPRINT_CONFIG_REPO_URL = `https://github.com/${BLUEPRINT_CONFIG_REPO_SLUG}`;

// Derived constants for GitHub API operations
// These are parsed from the BLUEPRINT_CONFIG_REPO_SLUG for use in workspace setup
const [configOwner, configRepo] = BLUEPRINT_CONFIG_REPO_SLUG.split('/');
export const BLUEPRINT_CONFIG_UPSTREAM_OWNER = configOwner;
export const BLUEPRINT_CONFIG_UPSTREAM_REPO = configRepo;

// Expected fork name for user workspaces
// Users fork the upstream repo and this is the expected name in their account
export const EXPECTED_FORK_REPO_NAME = configRepo;

// DTEF Application Repository
export const APP_REPO_SLUG = process.env.NEXT_PUBLIC_APP_REPO_SLUG || 'collect-intel/dtef-app';
export const APP_REPO_URL = `https://github.com/${APP_REPO_SLUG}`; 