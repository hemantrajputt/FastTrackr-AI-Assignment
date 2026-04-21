require('dotenv').config();
const { Client } = require('pg');

async function resetDB() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  
  console.log('Clearing all data...');
  
  // Delete in order (respecting foreign keys)
  const tables = [
    'ChangelogEntry',
    'Beneficiary', 
    'BankDetail',
    'FinancialAccount',
    'GoalOrPreference',
    'CustomEntity',
    'Member',
    'Household',
  ];
  
  for (const table of tables) {
    const result = await client.query(`DELETE FROM "${table}"`);
    console.log(`  ${table}: ${result.rowCount} rows deleted`);
  }
  
  console.log('✅ Database cleared!');
  await client.end();
}

resetDB().catch(console.error);
