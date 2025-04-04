// Script to delete MongoDB databases except those in a safelist
const { MongoClient } = require('mongodb');

// MongoDB connection string - update with your connection details
const uri = 'mongodb+srv://heemank:GVyh8eWjV6GvyyPU@cluster0.fnbwa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// List of databases to keep (safelist)
const databasesToKeep = [
  'stress_test',      // System database
  'config',     // System database
  'admin',      // System database
];

async function deleteUnwantedDatabases() {
  const client = new MongoClient(uri);

  try {
    // Connect to the MongoDB server
    await client.connect();
    console.log('Connected to MongoDB server');

    // Get a list of all databases
    const adminDb = client.db('admin');
    const dbList = await adminDb.admin().listDatabases();

    console.log('All databases:');
    dbList.databases.forEach(db => console.log(` - ${db.name}`));

    // Identify databases to delete
    const databasesToDelete = dbList.databases
      .map(db => db.name)
      .filter(dbName => !databasesToKeep.includes(dbName));

    console.log('\nDatabases to keep:');
    databasesToKeep.forEach(db => console.log(` - ${db}`));

    console.log('\nDatabases to delete:');
    databasesToDelete.forEach(db => console.log(` - ${db}`));

    // Confirm deletion
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Ask for confirmation before deleting
    readline.question('\nAre you sure you want to delete these databases? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes') {
        console.log('\nDeleting databases...');

        // Delete each database not in the safelist
        for (const dbName of databasesToDelete) {
          try {
            await client.db(dbName).dropDatabase();
            console.log(`Deleted database: ${dbName}`);
          } catch (err) {
            console.error(`Error deleting database ${dbName}:`, err);
          }
        }

        console.log('\nDeletion complete.');
      } else {
        console.log('Deletion cancelled.');
      }

      // Close connections
      readline.close();
      await client.close();
      console.log('Disconnected from MongoDB server');
    });

  } catch (err) {
    console.error('Error:', err);
    await client.close();
  }
}

// Run the function
deleteUnwantedDatabases();
