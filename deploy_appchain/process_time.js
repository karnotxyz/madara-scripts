// script.js
const { MongoClient } = require('mongodb');

// Configuration
const config = {
  // Connection URI - Update with your MongoDB connection string
  uri: 'mongodb+srv://heemank:GVyh8eWjV6GvyyPU@cluster0.fnbwa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', 
  // Database name
  dbName: 'l2l3v2_support_v9',
  // Collection name
  collectionName: 'jobs' // Update with your collection name
};

async function calculateProcessingTimes() {
  // Create a new MongoClient
  const client = new MongoClient(config.uri);
  
  try {
    // Connect to the MongoDB server
    await client.connect();
    console.log('Connected to MongoDB server');
    
    // Get database and collection
    const db = client.db(config.dbName);
    const collection = db.collection(config.collectionName);
    
    // Find all documents with status "Completed"
    const query = { status: "Completed" };
    const completedJobs = await collection.find(query).toArray();
    
    console.log(`Found ${completedJobs.length} completed jobs`);
    
    // Calculate processing time for each job
    const jobsWithProcessingTime = completedJobs.map(job => {
      const startTime = job.metadata?.processing_started_at 
        ? parseInt(job.metadata.processing_started_at)
        : null;
      
      const endTime = job.metadata?.processing_finished_at 
        ? parseInt(job.metadata.processing_finished_at)
        : null;
      
      let processingTimeMs = null;
      let processingTimeFormatted = 'N/A';
      
      if (startTime && endTime) {
        processingTimeMs = endTime - startTime;
        
        // Format processing time
        if (processingTimeMs < 1000) {
          processingTimeFormatted = `${processingTimeMs}ms`;
        } else if (processingTimeMs < 60000) {
          processingTimeFormatted = `${(processingTimeMs / 1000).toFixed(2)}s`;
        } else {
          const minutes = Math.floor(processingTimeMs / 60000);
          const seconds = ((processingTimeMs % 60000) / 1000).toFixed(2);
          processingTimeFormatted = `${minutes}m ${seconds}s`;
        }
      }
      
      return {
        job_id: job.external_id || job.internal_id || job._id,
        created_at: job.created_at,
        processing_time_ms: processingTimeMs,
        processing_time: processingTimeFormatted
      };
    });
    
    // Sort jobs by processing time (ascending)
    const sortedJobs = [...jobsWithProcessingTime]
      .filter(job => job.processing_time_ms !== null) // Filter out jobs with null processing time
      .sort((a, b) => a.processing_time_ms - b.processing_time_ms);
    
    // Add jobs with null processing time at the end if any exist
    const nullTimeJobs = jobsWithProcessingTime.filter(job => job.processing_time_ms === null);
    if (nullTimeJobs.length > 0) {
      sortedJobs.push(...nullTimeJobs);
    }
    
    // Display results
    console.table(sortedJobs);
    
    // Calculate summary statistics
    const validTimes = jobsWithProcessingTime
      .filter(job => job.processing_time_ms !== null)
      .map(job => job.processing_time_ms);
    
    if (validTimes.length > 0) {
      const totalTime = validTimes.reduce((sum, time) => sum + time, 0);
      const avgTime = totalTime / validTimes.length;
      const minTime = Math.min(...validTimes);
      const maxTime = Math.max(...validTimes);
      
      console.log('\nSummary Statistics:');
      console.log(`Total Jobs with Processing Time: ${validTimes.length}`);
      console.log(`Average Processing Time: ${formatTime(avgTime)}`);
      console.log(`Minimum Processing Time: ${formatTime(minTime)}`);
      console.log(`Maximum Processing Time: ${formatTime(maxTime)}`);
    } else {
      console.log('\nNo valid processing times found.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the connection
    await client.close();
    console.log('Disconnected from MongoDB server');
  }
}

// Helper function to format time in a readable format
function formatTime(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
}

// Run the function
calculateProcessingTimes()
  .catch(console.error);