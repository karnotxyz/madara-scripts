import { Account, json, RpcProvider, CallData, hash, cairo, Contract } from "starknet";
import fs from "fs";
import path from "path";

// Configuration object with all hardcoded values
const CONFIG = {
  // Provider configs
  provider: {
    nodeUrl: "",
  },
  
  // Account configs
  account: {
    address: "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA",
    privateKey: "",
  },
  
  // Contract paths
  contractPaths: {
    sierra: "/Users/dexterhv/Work/gridy/chain/scripts/assets/piltover_appchain.contract_class.json",
    casm: "/Users/dexterhv/Work/gridy/chain/scripts/assets/piltover_appchain.compiled_contract_class.json",
  },
  
  // Constructor arguments
  constructorArgs: [
    "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA", // owner
    "0x31d38a4b09ff7f66d4aa61e7aaee7512666b72117ad29dfade7eec3e47f0370", // previous state_root
    "0x01c5", // block_number
    "0x350afb99db0c05f5df09d4fbec3de0024671bd681dead31a1c1153312462fa7" // block_hash
  ],
  
  // Program info arguments
  programInfo: {
    // https://sepolia.voyager.online/contract/0x00d3ca353aebc53c3907ed6c1882af7064657cdeef0c3f57581ffbb001779d24#readContract
    bootloader_program_hash : "0x5ab580b04e3532b6b18f81cfa654a05e29dd8e2352d88df1e765a84072db07", // bootloader_program_hash
    // snos_output
    snos_config_hash: "0x3ebcaa0cab0f8640a41ef3296b83af23086a4d215ea7bf26652181fb0ad24c3", // snos_config_hash
    // herman
    snos_program_hash: "0x01e324682835e60c4779a683b32713504aed894fd73842f7d05b18e7bd29cd70", // snos_program_hash
    // https://docs.herodotus.cloud/atlantic/dynamic#double-verification-for-integrity-compatibility
    layout_bridge_program_hash: "0x193641eb151b0f41674641089952e60bc3aded26e3cf42793655c562b8c3aa0" // layout_bridge_program_hash
  },
  

  // Facts registry arguments
  factsRegistry: [
    "0x04ce7851f00b6c3289674841fd7a1b96b6fd41ed1edc248faccd672c26371b8c"
  ],
  
  // Default contract address if not declared/deployed yet
  defaultContractAddress: "0x07f3e6Cc108184631e2D9bDB7f3c2de1363531A398304Dcf5BFaE490EE2a3cdc",
  
  // Wait time between operations in milliseconds
  waitTime: 10000
};

// Initialize provider
const initProvider = () => {
  return new RpcProvider({
    nodeUrl: CONFIG.provider.nodeUrl,
  });
};

// Initialize account
const initAccount = (provider) => {
  return new Account(
    provider,
    CONFIG.account.address,
    CONFIG.account.privateKey
  );
};

// Load contract files
const loadContracts = () => {
  try {
    
    const sierra = json.parse(fs.readFileSync(CONFIG.contractPaths.sierra).toString("ascii"));
    const casm = json.parse(fs.readFileSync(CONFIG.contractPaths.casm).toString("ascii"));
    return { sierra, casm };
  } catch (error) {
    console.error("Error loading contract files:", error);
    throw error;
  }
};

// Declare contract
const declareContract = async (account, sierra, casm) => {
  console.log("Declaring contract...");
  try {
    const declareResponse = await account.declare({
      contract: sierra,
      casm: casm,
    });
    console.log('Contract declared with classHash =', declareResponse.class_hash);
    await account.provider.waitForTransaction(declareResponse.transaction_hash);
    return declareResponse.class_hash;
  } catch (err) {
    console.error("Contract declaration failed or already declared:", err.message);
    if (err.message.includes("already declared")) {
      console.log("Contract is already declared.");
      return hash.computeContractClassHash(sierra);
    }
    throw err;
  }
};

// Deploy contract
const deployContract = async (account, sierra, classHash = null) => {
  console.log("Deploying contract...");
  try {
    if (!sierra.abi) {
      throw new Error("ABI is not defined in the sierra object");
    }
    
    // Use provided classHash or compute it
    const contractClassHash = classHash || hash.computeContractClassHash(sierra);
    console.log("Using class hash:", contractClassHash);
    
    console.log("Constructor args:", CONFIG.constructorArgs);
    
    const deployResult = await account.deploy({
      classHash: contractClassHash,
      constructorCalldata: CONFIG.constructorArgs,
    });

    await account.provider.waitForTransaction(deployResult.transaction_hash);
    console.log("Contract deployed at address:", deployResult.contract_address);
    return deployResult.contract_address;
  } catch (err) {
    console.error("Error in deployment:", err.message);
    throw err;
  }
};

// Set program info
const setProgramInfo = async (account, contractAddress) => {
  console.log("Setting program info for contract:", contractAddress);
  try {
    const { sierra, _ } = loadContracts();
    const contract = new Contract(sierra.abi, contractAddress, account.provider);
    contract.connect(account);
    
    console.log("Program info calldata:");

    // const myCall = contract.populate('set_program_info', CONFIG.programInfo);

    // console.log("Program info calldata:", myCall.calldata);
    
    const res = await contract.set_program_info(CONFIG.programInfo);
    console.log("Program info set successfully. Transaction hash:", res.transaction_hash);
    
    await account.provider.waitForTransaction(res.transaction_hash);
    return res.transaction_hash;
  } catch (err) {
    console.error("Error setting program info:", err.message);
    throw err;
  }
};

// Set facts registry
const setFactsRegistry = async (account, contractAddress) => {
  console.log("Setting facts registry for contract:", contractAddress);
  try {
    const { sierra, _ } = loadContracts();
   
    const contract = new Contract(sierra.abi, contractAddress, account.provider);
    contract.connect(account);
    
    const myCall = contract.populate('set_facts_registry', CONFIG.factsRegistry);
    const res = await contract.set_facts_registry(myCall.calldata);
    console.log("Facts registry set successfully. Transaction hash:", res.transaction_hash);
    
    await account.provider.waitForTransaction(res.transaction_hash);
    return res.transaction_hash;
  } catch (err) {
    console.error("Error setting facts registry:", err.message);
    throw err;
  }
};


// Wait for specified time
const wait = async (ms = CONFIG.waitTime) => {
  console.log(`Waiting for ${ms / 1000} seconds...`);
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Display usage information
const displayUsage = () => {
  console.log("\nUsage: node script.js <option> [contractAddress]");
  console.log("\nOptions:");
  console.log("  0: Declare Contract");
  console.log("  1: Deploy Contract");
  console.log("  2: Set Program Info");
  console.log("  3: Set Facts Registry");
  console.log("\nExamples:");
  console.log("  node script.js 0                    # Declare contract");
  console.log("  node script.js 1                    # Deploy contract");
  console.log("  node script.js 2                    # Set program info using default contract address");
  console.log("  node script.js 2 0x123abc           # Set program info for specific contract address");
  console.log("  node script.js 3                    # Set facts registry using default contract address");
  console.log("  node script.js 3 0x123abc           # Set facts registry for specific contract address");
};

// Main function
async function main() {
  try {
    // Get command line arguments
    const option = parseInt(process.argv[2]);
    const contractAddress = process.argv[3] || CONFIG.defaultContractAddress;
    
    // Check if option is valid
    if (isNaN(option) || option < 0 || option > 3) {
      displayUsage();
      return;
    }
    
    // Initialize provider and account
    const provider = initProvider();
    const account = initAccount(provider);
    
    // Load contracts
    const { sierra, casm } = loadContracts();
    
    // Store results for use between operations
    let classHash = null;
    let deployedAddress = null;
    
    // Perform selected operation
    switch (option) {
      case 0:
        // Declare contract
        classHash = await declareContract(account, sierra, casm);
        console.log("Contract declared with class hash:", classHash);
        break;
        
      case 1:
        // Deploy contract
        classHash = "0x07e32e97ad7d1809358418ec553d61d0f537fba13d5b8ac3aa479ec9c632ef95";
        deployedAddress = await deployContract(account, sierra, classHash);
        console.log("Contract deployed at address:", deployedAddress);
        // Save the contract address to a file for future reference
        fs.writeFileSync("contract_address.txt", deployedAddress);
        break;
        
      case 2:
        // Set program info
        await setProgramInfo(account, contractAddress);
        break;
        
      case 3:
        // Set facts registry
        await setFactsRegistry(account, contractAddress);
        break;
      case 4: 
        // make update state call
        await updateState(account, contractAddress);
        break;
    }
  } catch (error) {
    console.error("Error in main function:", error);
    process.exit(1);
  }
}

// Execute main function
main();