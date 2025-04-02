const { MongoClient } = require('mongodb');

// Replace with your actual MongoDB connection string
const uri = "mongodb+srv://heemank:GVyh8eWjV6GvyyPU@cluster0.fnbwa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Define internal_id filter range (set to null to disable filtering)
const MIN_INTERNAL_ID = null;  // Set minimum internal_id to filter
const MAX_INTERNAL_ID = null;  // Set maximum internal_id to filter

// Calculate processing time for completed SnosRun jobs
async function calculateProcessingTimes() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    
    const database = client.db("new_gridy_v3_local");
    const collection = database.collection("jobs");
    
    // Base query for completed SnosRun jobs
    const query = {
      job_type: "ProofCreation",
      status: "Completed"
    };
    
    // Add internal_id filtering if specified
    if (MIN_INTERNAL_ID !== null || MAX_INTERNAL_ID !== null) {
      query.internal_id = {};
      
      if (MIN_INTERNAL_ID !== null) {
        // Using $gte to find IDs greater than or equal to MIN_INTERNAL_ID
        query.internal_id.$gte = MIN_INTERNAL_ID.toString();
      }
      
      if (MAX_INTERNAL_ID !== null) {
        // Using $lte to find IDs less than or equal to MAX_INTERNAL_ID
        query.internal_id.$lte = MAX_INTERNAL_ID.toString();
      }
    }
    
    const jobs = await collection.find(query).toArray();
    console.log(`Found ${jobs.length} completed SnosRun jobs within specified ID range`);
    
    // Calculate processing time for each job
    const processingTimes = jobs.map(job => {
      const internalId = job.internal_id;
      const startTime = parseInt(job.metadata.processing_started_at);
      const endTime = parseInt(job.metadata.processing_finished_at);
      const processingTime = endTime - startTime;
      
      // Convert to seconds for readability
      const processingTimeSeconds = processingTime / 1000;
      
      return {
        internal_id: internalId,
        processing_time_ms: processingTime,
        processing_time_seconds: processingTimeSeconds,
        processing_time_minutes: processingTimeSeconds / 60
      };
    });
    
    // Sort by internal_id for easier reading
    processingTimes.sort((a, b) => parseInt(a.internal_id) - parseInt(b.internal_id));
    
    // Print the results
    console.log("\nProcessing times for completed SnosRun jobs:");
    console.log("----------------------------------------");
    processingTimes.forEach(item => {
      console.log(`Internal ID: ${item.internal_id}`);
      console.log(`Processing Time: ${item.processing_time_ms} ms (${item.processing_time_seconds.toFixed(2)} seconds / ${item.processing_time_minutes.toFixed(2)} minutes)`);
      console.log("----------------------------------------");
    });
    
    // Calculate statistics
    if (processingTimes.length > 0) {
      const totalJobs = processingTimes.length;
      const totalProcessingTime = processingTimes.reduce((acc, job) => acc + job.processing_time_ms, 0);
      const averageProcessingTime = totalProcessingTime / totalJobs;
      
      // Find min and max
      const minJob = processingTimes.reduce((min, job) => job.processing_time_ms < min.processing_time_ms ? job : min, processingTimes[0]);
      const maxJob = processingTimes.reduce((max, job) => job.processing_time_ms > max.processing_time_ms ? job : max, processingTimes[0]);
      
      console.log("\nSummary Statistics:");
      console.log(`Total Jobs: ${totalJobs}`);
      console.log(`Average Processing Time: ${(averageProcessingTime / 1000).toFixed(2)} seconds`);
      console.log(`Fastest Job: Internal ID ${minJob.internal_id} (${(minJob.processing_time_seconds).toFixed(2)} seconds)`);
      console.log(`Slowest Job: Internal ID ${maxJob.internal_id} (${(maxJob.processing_time_seconds).toFixed(2)} seconds)`);
    } else {
      console.log("\nNo jobs found matching the criteria. Cannot calculate statistics.");
    }
    
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the function
calculateProcessingTimes()
  .catch(console.error);