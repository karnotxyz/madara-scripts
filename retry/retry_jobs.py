import pymongo
import requests
import base64
from typing import List
import time
from bson.binary import Binary
import uuid
# Configuration
CONFIG = {
    "mongo_uri": "",
    "database_name": "orchestrator_v2",
    "collection_name": "jobs",  # Update this if your collection name is different
    "base_url": "http://localhost:3000",  # e.g., "https://api.example.com/jobs"
    "retry_delay": 2,  # seconds between retries
    "batch_size": 1,  # number of documents to process in each batch
}


def binary_to_uuid_str(binary_data: Binary) -> str:
    """Convert MongoDB Binary to UUID string"""
    binary_bytes = bytes(binary_data)
    uuid_obj = uuid.UUID(bytes=binary_bytes)
    return str(uuid_obj)

def get_failed_jobs(client: pymongo.MongoClient) -> List[str]:
    """Fetch all failed jobs from MongoDB and return UUID strings"""
    db = client[CONFIG["database_name"]]
    collection = db[CONFIG["collection_name"]]
    
    failed_jobs = []
    cursor = collection.find(
        {"status": "Failed"},
        {"id": 1}
    ).batch_size(CONFIG["batch_size"])
    
    print("\nDEBUG: Starting to process failed jobs from MongoDB...")
    
    for doc in cursor:
        print(f"\nDEBUG: Processing document: {doc}")
        
        if "id" in doc and isinstance(doc["id"], Binary):
            print(f"DEBUG: Found Binary id in document")
            
            try:
                uuid_str = binary_to_uuid_str(doc["id"])
                print(f"DEBUG: Converted Binary to UUID: {uuid_str}")
                failed_jobs.append(uuid_str)
            except Exception as e:
                print(f"DEBUG: Error converting to UUID: {str(e)}")
                continue
        else:
            print("DEBUG: Document missing 'id' field or not Binary type")
    
    print(f"\nDEBUG: Total failed jobs found: {len(failed_jobs)}")
    return failed_jobs

def retry_job(uuid_str: str) -> bool:
    """Retry a single job using its UUID string"""
    try:
        print(f"\nDEBUG: Starting retry for UUID: {uuid_str}")
        
        retry_url = f"{CONFIG['base_url']}/jobs/{uuid_str}/retry"
        print(f"DEBUG: Retry URL: {retry_url}")
        
        response = requests.get(retry_url)
        print(f"DEBUG: Response status code: {response.status_code}")
        print(f"DEBUG: Response content: {response.text[:200]}...")  # First 200 chars of response
        
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException as e:
        print(f"DEBUG: Request failed with error: {str(e)}")
        return False
    except Exception as e:
        print(f"DEBUG: Unexpected error in retry_job: {str(e)}")
        return False

def main():
    # Initialize MongoDB client
    client = pymongo.MongoClient(CONFIG["mongo_uri"])
    
    try:
        print("\nDEBUG: Starting main execution...")
        print(f"DEBUG: Using database: {CONFIG['database_name']}")
        print(f"DEBUG: Using collection: {CONFIG['collection_name']}")
        
        # Get all failed jobs
        print("Fetching failed jobs...")
        failed_jobs = get_failed_jobs(client)
        total_jobs = len(failed_jobs)
        print(f"\nDEBUG: Retrieved {total_jobs} failed jobs")
        
        # Process each job
        successful_retries = 0
        failed_retries = 0
        
        for index, uuid_str in enumerate(failed_jobs, 1):
            print(f"\nDEBUG: Processing job {index}/{total_jobs}")
            print(f"DEBUG: UUID: {uuid_str}")
            
            if retry_job(uuid_str):
                successful_retries += 1
                print(f"Successfully retried job (UUID: {uuid_str})")
            else:
                failed_retries += 1
                print(f"Failed to retry job (UUID: {uuid_str})")
            
            # Add delay between retries
            if index < total_jobs:
                print(f"DEBUG: Waiting {CONFIG['retry_delay']} seconds before next retry...")
                time.sleep(CONFIG["retry_delay"])
        
        # Print summary
        print("\nRetry Summary:")
        print(f"Total jobs processed: {total_jobs}")
        print(f"Successful retries: {successful_retries}")
        print(f"Failed retries: {failed_retries}")
        
    except Exception as e:
        print(f"\nDEBUG: Critical error in main: {str(e)}")
        import traceback
        print(f"DEBUG: Full traceback:\n{traceback.format_exc()}")
    finally:
        print("\nDEBUG: Closing MongoDB connection")
        client.close()

if __name__ == "__main__":
    main()