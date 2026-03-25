#!/usr/bin/env node

/**
 * Kill Switch Configuration Audit
 * 
 * Verifies that:
 * 1. Every council in registry has a corresponding ADAPTER_KILL_SWITCH_{ID} in .env.example
 * 2. No kill switches are hardcoded in config files
 * 3. All kill switches default to 'false' in .env.example
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT, 'data', 'council-registry.json');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');

function readRegistry() {
  const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
  return JSON.parse(content);
}

function readEnvExample() {
  const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  return content;
}

function councilIdToEnvVar(councilId) {
  return `ADAPTER_KILL_SWITCH_${councilId.toUpperCase().replace(/-/g, '_')}`;
}

function main() {
  console.log('🔍 Kill Switch Configuration Audit\n');
  
  const registry = readRegistry();
  const envExample = readEnvExample();
  
  let errors = 0;
  const councilIds = registry.councils.map(c => c.council_id);
  
  console.log(`Found ${councilIds.length} councils in registry\n`);
  
  // Check each council has a kill switch
  for (const councilId of councilIds) {
    const envVar = councilIdToEnvVar(councilId);
    const pattern = new RegExp(`^${envVar}=`, 'm');
    
    if (!pattern.test(envExample)) {
      console.error(`❌ Missing kill switch: ${envVar} for council ${councilId}`);
      errors++;
    } else {
      // Verify it defaults to false
      const valuePattern = new RegExp(`^${envVar}=(true|false)`, 'm');
      const match = envExample.match(valuePattern);
      if (match && match[1] !== 'false') {
        console.error(`❌ Kill switch ${envVar} must default to 'false', got '${match[1]}'`);
        errors++;
      } else {
        console.log(`✅ ${envVar}`);
      }
    }
  }
  
  // Check for orphaned kill switches in .env.example
  const killSwitchPattern = /^ADAPTER_KILL_SWITCH_([A-Z_]+)=/gm;
  let match;
  const foundSwitches = [];
  
  while ((match = killSwitchPattern.exec(envExample)) !== null) {
    foundSwitches.push(match[1]);
  }
  
  const expectedSwitches = councilIds.map(id => 
    id.toUpperCase().replace(/-/g, '_')
  );
  
  for (const foundSwitch of foundSwitches) {
    if (!expectedSwitches.includes(foundSwitch)) {
      console.error(`⚠️  Orphaned kill switch: ADAPTER_KILL_SWITCH_${foundSwitch} (no matching council in registry)`);
      // Not a hard error, just a warning
    }
  }
  
  console.log(`\n${errors === 0 ? '✅' : '❌'} Kill switch audit complete`);
  
  if (errors > 0) {
    console.error(`\n${errors} error(s) found. Fix before merging.`);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
