// Required packages
const { MongoClient } = require('mongodb');

// Replace with your actual MongoDB connection string
const uri = "mongodb+srv://heemank:GVyh8eWjV6GvyyPU@cluster0.fnbwa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// API base URL
const API_BASE_URL = 'https://staging.atlantic.api.herodotus.cloud/atlantic-query';

async function main() {
  const client = new MongoClient(uri);
  
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Select database and collection
    const database = client.db('new_gridy_v7');
    const collection = database.collection('jobs');
    
    // Find all completed proof creation jobs
    const query = { job_type: "ProofRegistration", status: "Completed" };
    const jobs = await collection.find(query).toArray();
    
    // Extract external_ids
    const jobData = jobs.map(job => ({
      internal_id: job.internal_id,
      external_id: job.external_id
    }));
    
    console.log(`Found ${jobData.length} completed ProofCreation jobs`);
    
    // Process each job
    const results = [];
    
    for (const job of jobData) {
      try {
        // Call API for each external_id
        const apiUrl = `${API_BASE_URL}/${job.external_id}`;
        console.log(`Fetching data for external_id: ${job.external_id}`);
        
        const response = await fetch(apiUrl, {
          headers: {
            'accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract timestamps
        const { createdAt, completedAt } = data.atlanticQuery;
        
        // Calculate time difference in seconds
        const created = new Date(createdAt);
        const completed = new Date(completedAt);
        const timeDiffMs = completed - created;
        const timeDiffSeconds = timeDiffMs / 1000;
        
        // Store result
        results.push({
          internal_id: job.internal_id,
          external_id: job.external_id,
          timeTaken: timeDiffSeconds,
          createdAt: createdAt,
          completedAt: completedAt
        });
        
        console.log(`${job.internal_id} - ${job.external_id} - ${timeDiffSeconds} seconds`);
      } catch (err) {
        console.error(`Error processing job ${job.external_id}:`, err.message);
      }
    }
    
    // Calculate average time
    const totalTime = results.reduce((sum, job) => sum + job.timeTaken, 0);
    const averageTime = totalTime / results.length;
    
    // Sort results by completedAt timestamp to find first and last jobs
    results.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
    
    const firstJob = results[0];
    const lastJob = results[results.length - 1];
    
    console.log('\n--- FINAL REPORT ---');
    console.log(`Total jobs processed: ${results.length}`);
    console.log(`Average processing time: ${averageTime.toFixed(2)} seconds`);
    
    console.log('\nFirst job completed:');
    console.log(`  Internal ID: ${firstJob.internal_id}`);
    console.log(`  External ID: ${firstJob.external_id}`);
    console.log(`  Submitted at: ${firstJob.createdAt}`);
    console.log(`  Completed at: ${firstJob.completedAt}`);
    console.log(`  Processing time: ${firstJob.timeTaken.toFixed(2)} seconds`);
    
    console.log('\nLast job completed:');
    console.log(`  Internal ID: ${lastJob.internal_id}`);
    console.log(`  External ID: ${lastJob.external_id}`);
    console.log(`  Submitted at: ${lastJob.createdAt}`);
    console.log(`  Completed at: ${lastJob.completedAt}`);
    console.log(`  Processing time: ${lastJob.timeTaken.toFixed(2)} seconds`);
    
    console.log('\nDetailed report:');
    
    // Print detailed report
    results.forEach(job => {
      console.log(`${job.internal_id} - ${job.external_id} - ${job.timeTaken.toFixed(2)} seconds`);
    });
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    // Close the MongoDB connection
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run the script
main().catch(console.error);