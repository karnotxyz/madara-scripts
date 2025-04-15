// MongoDB Job Verification Script
const { MongoClient } = require('mongodb');
// Using native fetch API instead of axios

// MongoDB connection string - replace with your actual connection string
const uri = 'mongodb+srv://heemank:GVyh8eWjV6GvyyPU@cluster0.fnbwa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const dbName = 'mainnet_test_v1';
const collectionName = 'jobs'; // Assuming the collection name is 'jobs'

// Function to fetch jobs and trigger verification
async function verifyPendingJobs() {
  // Connect to MongoDB
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    // Query to find all jobs with specified job_type and status
    const query = {
      job_type: 'ProofRegistration',
      status: 'Failed'
    };

    // Find matching jobs
    const jobs = await collection.find(query).toArray();
    console.log(`Found ${jobs.length} jobs to retry`);

    // Process each job
    for (const job of jobs) {
      // Extract the job ID from the Binary GUID
      // If the ID is in different format in your actual data, adjust this extraction
      const jobId = job.id.$binary ? job.id.$binary.base64 : job.id;

      try {
        // Call the verification endpoint using fetch
        const verificationUrl = `http://localhost:3003/jobs/${jobId}/retry`;
        console.log(`Retrying job ${jobId} at ${verificationUrl}`);

        const response = await fetch(verificationUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        console.log("sdnvsdnjkvskjd",response);

        console.log(`Verification response for job ${jobId}: ${response.status} ${response.statusText}`);
      } catch (error) {
        console.error(`Error verifying job ${jobId}:`, error.message);
      }
    }

  } catch (error) {
    console.error('Error connecting to MongoDB or processing jobs:', error);
  } finally {
    // Close the connection
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Execute the function
verifyPendingJobs()
  .then(() => console.log('Job verification process completed'))
  .catch(error => console.error('Failed to complete job verification process:', error));
