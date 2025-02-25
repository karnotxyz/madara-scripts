from pymongo import MongoClient
from datetime import datetime

def update_failed_jobs(connection_string):
    try:
        # Connect to MongoDB
        client = MongoClient(connection_string)
        db = client['orchestrator']
        jobs_collection = db['jobs']  # Assuming collection name is 'jobs'

        # Find all failed jobs
        failed_jobs = jobs_collection.find({"status": "Failed"})
        # failed_jobs is a cursor, so we can count the number of failed jobs
        # Counter for tracking updates
        update_count = 0


        # Process each failed job
        for job in failed_jobs:
            print(f"Processing job {job['_id']}")
            # Create update operation
            update = {
                "$set": {
                    "status": "Created",
                    "version": 0,
                    "updated_at": job["created_at"],
                    "metadata": {
                        "block_number_to_run": job["metadata"]["block_number_to_run"]
                    }
                }
            }

            # Perform update
            result = jobs_collection.update_one(
                {"_id": job["_id"]},
                update
            )

            if result.modified_count > 0:
                update_count += 1

        print(f"Successfully updated {update_count} failed jobs")

    except Exception as e:
        print(f"An error occurred: {str(e)}")
    finally:
        client.close()

if __name__ == "__main__":
    # Replace with your MongoDB connection string
    connection_string = ""
    update_failed_jobs(connection_string)