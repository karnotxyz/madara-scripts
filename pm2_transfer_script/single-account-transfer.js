// single-account-transfer.js
const starknet = require('starknet');
const fs = require('fs');
const { BASE_CONFIG, ACCOUNT_CONFIGS, ERC20 } = require('./config');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAccountTransfers(accountConfig) {
    console.log(`Starting transfers for ${accountConfig.name}`);
    
    const provider = new starknet.RpcProvider({
        nodeUrl: BASE_CONFIG.NODE_URL
    });

    const account = new starknet.Account(
        provider,
        accountConfig.ACCOUNT_ADDRESS,
        accountConfig.PRIVATE_KEY,
        BASE_CONFIG.CHAIN_ID
    );

    const hashes = [];
    let nonce = await provider.getNonceForAddress(account.address);
    nonce = Number(nonce);

    // Create log file for this account
    const logStream = fs.createWriteStream(`logs/${accountConfig.name}.log`, {flags: 'a'});
    const log = (message) => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        logStream.write(logMessage);
        console.log(logMessage.trim());
    };

    const contract = new starknet.Contract(
        ERC20.abi,
        BASE_CONFIG.ETH_ADDRESS,
        account.provider
    );

    for (let i = 0; i < BASE_CONFIG.TRANSFER_COUNT; i++) {
        // log the current time 
        let start = new Date().toISOString();  
        log(`${accountConfig.name}: Starting transfer ${i}/${BASE_CONFIG.TRANSFER_COUNT} (nonce: ${nonce})`);

        let result = contract.populate('transfer', {
            recipient: accountConfig.TO_ADDRESS,
            amount: {
                low: i,
                high: 0,
            },
        });
      
        let hash = await account.execute(result, {
            nonce,
            maxFee: BASE_CONFIG.MAX_FEE,
        });
        
      
      hashes.push({ index: i, hash : "hash", nonce });
      log(`${accountConfig.name}: Transfer ${i+1} completed. Hash: ${hash}`);
      
      // Save progress after each successful transfer
      fs.writeFileSync(
          `progress/${accountConfig.name}_hashes.json`,
          JSON.stringify(hashes, null, 2)
      );
      
      nonce += 1;

    //   await sleep(50); 

      let end = new Date().toISOString();
      time_taken = new Date(end) - new Date(start);

      log(`${accountConfig.name}: Time taken for transfer ${i+1} is ${time_taken} ms`);
      
      // Optional: Add small delay between transactions if needed
      // await new Promise(resolve => setTimeout(resolve, 100));
    }

    log(`${accountConfig.name}: All transfers completed`);
    return hashes;
}

// Get account index from PM2's env variables
const accountIndex = process.env.ACCOUNT_INDEX;
if (accountIndex === undefined) {
    console.error('No ACCOUNT_INDEX provided');
    process.exit(1);
}

// Create necessary directories
['logs', 'progress', 'errors'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

// Run transfers for this account
runAccountTransfers(ACCOUNT_CONFIGS[accountIndex])
    .then(() => {
        console.log(`Process for account ${accountIndex} completed successfully`);
        process.exit(0);
    })
    .catch(error => {
        console.error(`Process for account ${accountIndex} failed:`, error);
        process.exit(1);
    });