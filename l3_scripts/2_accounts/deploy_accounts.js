import { Account, RpcProvider, Contract, ec, json, CallData, hash, uint256 } from "starknet";
import fs from "fs";

/// This script uses UDC to deploy address on Appchain without any fees, given madara is running with 0 fees configs.

// Configuration object for all settings
const CONFIG = {
  // Network URL of the appchain
  nodeUrl: "https://madara-l2-l3.karnot.xyz",
  // Deployer account settings (the account that will pay for deployments)
  // devnet.json
  deployerPrivateKey: "0xabcd",
  // addresses.json
  deployerAddress: "0x4fe5eea46caa0a1f344fafce82b39d66b552f00d3cd12e89073ef4b4ab37860",
  // UDC settings
  udcAddress: "0x41a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf",
  udcAbiPath: "./assets/udc.json",
  // OZ Account class settings (Extracted from Bootstrapper Output)
  accountClassHash: "0x1484c93b9d6cf61614d698ed069b3c6992c32549194fc3465258c2194734189",
  // Deployment settings
  maxFee: 0n,
  // Number of accounts to deploy
  numAccounts: 7,
  // File to save account information
  outputFilePath: "./deployed_accounts_3.json",
  // Whether to append to existing file or create a new one
  appendToFile: false
};

/**
 * Deploy a single StarkNet account
 * @param {RpcProvider} provider - StarkNet provider
 * @param {Account} deployerAccount - Account that will pay for deployment
 * @param {Contract} udcContract - UDC contract instance
 * @param {number} index - Index of this account in the deployment batch
 * @returns {Promise<Object>} Deployed account information
 */
async function deploySingleAccount(provider, deployerAccount, udcContract, index) {
  try {
    // Generate a new key pair for the account being deployed
    const newPrivateKey = ec.starkCurve.utils.randomPrivateKey();
    const newPublicKey = ec.starkCurve.getStarkKey(newPrivateKey);
    
    // Use CallData.compile for starknet.js v7.0.0
    const constructorCallData = CallData.compile({ publicKey: newPublicKey });
    
    // Create salt for account address (use a unique value)
    const salt = "0x" + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
    
    // In starknet.js v7.0.0, let's try the standard approach but with different 
    // parameter ordering to calculate the UDC deployment address
    const contractAddress = hash.calculateContractAddressFromHash(
      salt,
      CONFIG.accountClassHash,
      constructorCallData,
      CONFIG.udcAddress // UDC address as deployer
    );
    
    console.log("Calculated contract address:", contractAddress);
    
    // Log the parameters to allow verification
    console.log("Parameters used for address calculation:");
    console.log("- Salt:", salt);
    console.log("- Class Hash:", CONFIG.accountClassHash);
    console.log("- Constructor calldata:", constructorCallData);
    console.log("- UDC address:", CONFIG.udcAddress);
    
    // Call the UDC to deploy the account
    const { transaction_hash } = await udcContract.invoke(
      "deployContract",
      [
        CONFIG.accountClassHash,
        salt,
        "1", // unique: bool (1 for true, 0 for false)
        constructorCallData // Pass calldata as a single argument
      ],
      { maxFee: CONFIG.maxFee }
    );
    
    console.log("Deployment transaction hash:", transaction_hash);
    
    // Wait for transaction to be accepted on StarkNet
    const txReceipt = await provider.waitForTransaction(transaction_hash);
    
    // Get the actual deployed address from the transaction receipt if possible
    let deployedAddress = null;
    try {
      // Check if we can find the deployed address in the transaction receipt
      if (txReceipt && txReceipt.events) {
        // Try to find the contract deployed event
        const deployEvent = txReceipt.events.find(event => 
          event.keys && event.keys.some(key => key.includes("0x26b160f10156dea0639bec90696772c640b9706a47f5b8c52ea1abe5858b34d"))
        );
        
        if (deployEvent && deployEvent.data && deployEvent.data.length > 0) {
          // The deployed address is typically in the event data
          deployedAddress = deployEvent.data[0];
        }
      }
    } catch (error) {
      console.warn("Could not extract deployed address from receipt:", error.message);
    }
    
    const privateKeyHex = "0x" + Buffer.from(newPrivateKey).toString('hex');
    
    // Track both the predicted address and the actual deployed address
    console.log("\n=== NEW ACCOUNT DEPLOYED ===");
    console.log("Deployed address:", deployedAddress ? deployedAddress : "Not available");
    console.log("Private key:", privateKeyHex);
    console.log("============================\n");
    
    return {
      privateKey: privateKeyHex,
      actualAddress: deployedAddress,
      transactionHash: transaction_hash,
      accountIndex: index
    };
  } catch (error) {
    console.error("Error deploying single account:", error);
    throw error;
  }
}

/**
 * Deploy multiple StarkNet accounts
 */
async function deployMultipleAccounts() {
  try {
    // Initialize provider - connect to StarkNet network
    const provider = new RpcProvider({
      nodeUrl: CONFIG.nodeUrl,
    });
    
    if (!CONFIG.deployerPrivateKey || !CONFIG.deployerAddress) {
      throw new Error("Please set deployerPrivateKey and deployerAddress in CONFIG");
    }
    
    // Create account instance to interact with existing funded account
    const deployerAccount = new Account(provider, CONFIG.deployerAddress, CONFIG.deployerPrivateKey);
    
    // Get the UDC contract
    const Bridgecls = await provider.getClassAt(CONFIG.udcAddress);
    
    // Create UDC contract instance
    const udcContract = new Contract(Bridgecls.abi, CONFIG.udcAddress, provider);
    console.log("UDC contract address:", udcContract.address);
    
    // Connect the existing account to the UDC contract
    udcContract.connect(deployerAccount);
    
    console.log(`\nDeploying ${CONFIG.numAccounts} accounts...\n`);
    
    // Deploy the requested number of accounts
    const deployedAccounts = [];
    for (let i = 0; i < CONFIG.numAccounts; i++) {
      console.log(`\nDeploying account ${i + 1} of ${CONFIG.numAccounts}`);
      
      const accountInfo = await deploySingleAccount(provider, deployerAccount, udcContract, i + 1);
      deployedAccounts.push(accountInfo);
    }
    
    // Save all account information to a file
    let existingAccounts = [];
    
    // If append mode is on and the file exists, read existing accounts
    if (CONFIG.appendToFile && fs.existsSync(CONFIG.outputFilePath)) {
      try {
        const fileContent = fs.readFileSync(CONFIG.outputFilePath, 'utf8');
        existingAccounts = JSON.parse(fileContent);
        console.log(`Read ${existingAccounts.length} existing accounts from file.`);
      } catch (error) {
        console.warn(`Error reading existing accounts file: ${error.message}`);
        console.warn(`Creating a new file instead.`);
      }
    }
    
    // Combine existing and new accounts if in append mode
    const accountsToSave = CONFIG.appendToFile 
      ? [...existingAccounts, ...deployedAccounts]
      : deployedAccounts;
    
    // Add timestamp to each account
    const accountsWithTimestamp = accountsToSave.map(account => {
      // Only add timestamp to new accounts that don't have one
      if (!account.deployedAt) {
        return {
          ...account,
          deployedAt: new Date().toISOString()
        };
      }
      return account;
    });
    
    // Write the accounts to file
    fs.writeFileSync(
      CONFIG.outputFilePath,
      JSON.stringify(accountsWithTimestamp, null, 2)
    );
    
    console.log(`\nAll ${CONFIG.numAccounts} accounts deployed successfully!`);
    console.log(`Account information saved to ${CONFIG.outputFilePath}`);
    console.log(`Total accounts in file: ${accountsWithTimestamp.length}`);
    
    return deployedAccounts;
  } catch (error) {
    console.error("Error deploying accounts:", error);
    throw error;
  }
}

// Execute the deployment
deployMultipleAccounts()
  .then((result) => {
    console.log(`Deployment of ${CONFIG.numAccounts} accounts complete.`);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });