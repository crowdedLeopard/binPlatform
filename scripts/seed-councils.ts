// Script to seed initial council data
// Run with: npm run db:seed

import { getDatabase, initDatabase } from '../src/storage/db/client.js';

const councils = [
  { id: 'basingstoke', name: 'Basingstoke and Deane Borough Council', website: 'https://www.basingstoke.gov.uk/' },
  { id: 'east-hampshire', name: 'East Hampshire District Council', website: 'https://www.easthants.gov.uk/' },
  { id: 'eastleigh', name: 'Eastleigh Borough Council', website: 'https://www.eastleigh.gov.uk/' },
  { id: 'fareham', name: 'Fareham Borough Council', website: 'https://www.fareham.gov.uk/' },
  { id: 'gosport', name: 'Gosport Borough Council', website: 'https://www.gosport.gov.uk/' },
  { id: 'hart', name: 'Hart District Council', website: 'https://www.hart.gov.uk/' },
  { id: 'havant', name: 'Havant Borough Council', website: 'https://www.havant.gov.uk/' },
  { id: 'new-forest', name: 'New Forest District Council', website: 'https://www.newforest.gov.uk/' },
  { id: 'portsmouth', name: 'Portsmouth City Council', website: 'https://www.portsmouth.gov.uk/' },
  { id: 'rushmoor', name: 'Rushmoor Borough Council', website: 'https://www.rushmoor.gov.uk/' },
  { id: 'southampton', name: 'Southampton City Council', website: 'https://www.southampton.gov.uk/' },
  { id: 'test-valley', name: 'Test Valley Borough Council', website: 'https://www.testvalley.gov.uk/' },
  { id: 'winchester', name: 'Winchester City Council', website: 'https://www.winchester.gov.uk/' }
];

async function seed() {
  console.log('🌱 Seeding council data...');

  initDatabase({
    connectionString: process.env.DATABASE_URL || 'postgresql://binday:binday_dev_password@localhost:5432/binday',
    ssl: process.env.DATABASE_SSL === 'true'
  });

  const db = getDatabase();

  for (const council of councils) {
    try {
      await db.query(
        `INSERT INTO councils (id, name, region, website, adapter_status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           website = EXCLUDED.website`,
        [council.id, council.name, 'Hampshire', council.website, 'development']
      );
      console.log(`  ✅ ${council.name}`);
    } catch (err) {
      console.error(`  ❌ Failed to seed ${council.name}:`, err);
    }
  }

  await db.end();
  console.log('✅ Seeding complete!');
}

seed().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
