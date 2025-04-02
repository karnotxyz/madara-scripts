/**
 * Block Time Calculator for Madara L2-L3
 * 
 * This script fetches blocks from a start_block to an end_block,
 * and calculates the time difference between consecutive blocks.
 */

const START_BLOCK = 1726;
const END_BLOCK = 1806;
const API_URL = 'https://pathfinder-l2-l3.karnot.xyz/';

async function fetchBlock(blockNumber) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'starknet_getBlockWithTxs',
                params: {
                    block_id: {
                        block_number: blockNumber
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(`API error: ${JSON.stringify(data.error)}`);
        }
        
        return data.result;
    } catch (error) {
        console.error(`Error fetching block ${blockNumber}:`, error);
        return null;
    }
}

async function calculateBlockTimes() {
    console.log('Starting block time calculation...');
    console.log(`Fetching blocks from ${START_BLOCK} to ${END_BLOCK}`);
    
    let previousTimestamp = null;
    let blockTimes = [];
    
    // Fetch all blocks
    for (let blockNumber = START_BLOCK; blockNumber <= END_BLOCK; blockNumber++) {
        console.log(`Fetching block ${blockNumber}...`);
        
        const block = await fetchBlock(blockNumber);
        
        if (!block) {
            console.log(`Could not fetch block ${blockNumber}, skipping...`);
            continue;
        }
        
        // Convert timestamp from hex to decimal and then to seconds
        const timestamp = block.timestamp;
        
        if (previousTimestamp !== null) {
            const blockTime = timestamp - previousTimestamp;
            blockTimes.push({
                blockNumber,
                timestamp,
                blockTime
            });
        }
        
        previousTimestamp = timestamp;
    }
    
    // Display results
    console.log('\nBlock Time Results:');
    console.log('-------------------');
    console.log('Block Number | Timestamp (Unix) | Block Time (seconds)');
    console.log('-------------------');
    
    blockTimes.forEach(({ blockNumber, timestamp, blockTime }) => {
        console.log(`${blockNumber.toString().padEnd(12)} | ${timestamp.toString().padEnd(16)} | ${blockTime}`);
    });
    
    // Calculate statistics
    if (blockTimes.length > 0) {
        const totalBlockTime = blockTimes.reduce((sum, { blockTime }) => sum + blockTime, 0);
        const averageBlockTime = totalBlockTime / blockTimes.length;
        const minBlockTime = Math.min(...blockTimes.map(({ blockTime }) => blockTime));
        const maxBlockTime = Math.max(...blockTimes.map(({ blockTime }) => blockTime));
        
        console.log('\nStatistics:');
        console.log('-------------------');
        console.log(`Total blocks analyzed: ${blockTimes.length}`);
        console.log(`Average block time: ${averageBlockTime.toFixed(2)} seconds`);
        console.log(`Minimum block time: ${minBlockTime} seconds`);
        console.log(`Maximum block time: ${maxBlockTime} seconds`);
    } else {
        console.log('\nNo block time data available.');
    }
}

// Execute the function
calculateBlockTimes().catch(error => {
    console.error('An error occurred during execution:', error);
});