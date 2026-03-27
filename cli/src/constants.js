// aegis-flow CLI constants

export const SECURITY_LEVELS = {
  standard: {
    label: 'standard',
    description: 'Block secrets, protect lockfiles, auto-format',
    hooks: ['block-secrets', 'protect-lockfiles', 'auto-format']
  },
  strict: {
    label: 'strict (recommended)',
    description: '+ Command validation, test verification, audit log',
    hooks: ['block-secrets', 'protect-lockfiles', 'auto-format', 'validate-commands', 'verify-tests', 'audit-log']
  },
  paranoid: {
    label: 'paranoid',
    description: '+ Network blocking, approval required, branch protection',
    hooks: ['block-secrets', 'protect-lockfiles', 'auto-format', 'validate-commands', 'verify-tests', 'audit-log', 'block-network', 'branch-protection']
  }
};

export const HOOK_DEFINITIONS = {
  'block-secrets': { event: 'PreToolUse', matcher: 'Edit|Write', script: 'block-secrets.sh' },
  'protect-lockfiles': { event: 'PreToolUse', matcher: 'Edit|Write', script: 'protect-lockfiles.sh' },
  'auto-format': { event: 'PostToolUse', matcher: 'Edit|Write', script: 'auto-format.sh' },
  'validate-commands': { event: 'PreToolUse', matcher: 'Bash', script: 'validate-commands.sh' },
  'verify-tests': { event: 'Stop', matcher: '', script: 'verify-tests.sh' },
  'audit-log': { event: 'PostToolUse', matcher: '', script: 'audit-log.sh' },
  'block-network': { event: 'PreToolUse', matcher: 'Bash', script: 'block-network.sh' },
  'branch-protection': { event: 'PreToolUse', matcher: 'Bash', script: 'branch-protection.sh' }
};

export const MODULES = {
  'crypto-forge': {
    description: 'Crypto/blockchain development — bots, DApps, smart contracts',
    agents: ['bot-builder', 'contract-builder', 'dapp-builder', 'auditor'],
    skills: './modules/crypto-forge/skills/'
  },
  'saas-forge': {
    description: 'SaaS project scaffolder — brainstorm and generate full-stack apps',
    agents: ['saas-builder'],
    skills: './modules/saas-forge/skills/'
  },
  'ticket-pilot': {
    description: 'Issue tracker integration — resolve, triage, and manage tickets',
    agents: ['resolver', 'triager', 'moderator'],
    skills: './modules/ticket-pilot/skills/'
  }
};

export const FORMATTERS = {
  prettier: { detect: ['prettier'], command: 'npx prettier --write' },
  biome: { detect: ['@biomejs/biome'], command: 'npx biome format --write' },
  black: { detect: ['black'], command: 'black' },
  rustfmt: { detect: ['rustfmt'], command: 'rustfmt' }
};

export const TEST_RUNNERS = {
  vitest: { detect: ['vitest'], command: 'npx vitest run' },
  jest: { detect: ['jest'], command: 'npx jest' },
  pytest: { detect: ['pytest'], command: 'pytest' },
  mocha: { detect: ['mocha'], command: 'npx mocha' },
  rspec: { detect: ['rspec'], command: 'bundle exec rspec' }
};

export const PACKAGE_MANAGERS = ['pnpm', 'yarn', 'npm', 'bun'];

export const MODULE_AUTH = {
  'ticket-pilot': [
    {
      service: 'GitHub',
      type: 'cli',
      detectCommand: 'gh auth status',
      setupHint: 'Run: gh auth login'
    },
    {
      service: 'Linear',
      type: 'token',
      envVar: 'LINEAR_API_KEY',
      authUrl: 'https://linear.app/settings/api',
      validateUrl: 'https://api.linear.app/graphql',
      validateMethod: 'POST',
      validateBody: '{"query":"{ viewer { name } }"}',
      validateHeader: 'Authorization: Bearer {token}',
      nameExtractor: 'data.viewer.name'
    },
    {
      service: 'Jira',
      type: 'multi',
      fields: [
        { envVar: 'JIRA_BASE_URL', prompt: 'Jira instance URL (e.g. https://mycompany.atlassian.net)' },
        { envVar: 'JIRA_EMAIL', prompt: 'Jira account email' },
        { envVar: 'JIRA_API_TOKEN', prompt: 'Jira API token', authUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens' }
      ],
      validateFn: 'jira'
    }
  ],
  'crypto-forge': [
    {
      service: 'RPC Provider',
      type: 'token',
      envVar: 'RPC_URL',
      authUrl: 'https://dashboard.alchemy.com/apps',
      prompt: 'RPC URL (Alchemy, Infura, or public)',
      validateUrl: '{token}',
      validateMethod: 'POST',
      validateBody: '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}',
      nameExtractor: 'result'
    },
    {
      service: 'Etherscan',
      type: 'token',
      envVar: 'ETHERSCAN_API_KEY',
      authUrl: 'https://etherscan.io/myapikey',
      validateUrl: 'https://api.etherscan.io/api?module=stats&action=ethprice&apikey={token}',
      validateMethod: 'GET',
      nameExtractor: 'result.ethusd'
    }
  ],
  'saas-forge': []
};
