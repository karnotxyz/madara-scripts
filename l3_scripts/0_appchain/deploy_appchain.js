import { Account, json, RpcProvider, CallData, hash, cairo, Contract } from "starknet";
import fs from "fs";

/// This script is used to deploy a Piltover Appchain contract on Starknet Sepolia.
/// IMP! Make sure to update the contract address and class hash in the CONFIG object if already declared/deployed.

// Configuration object with all hardcoded values
const CONFIG = {
  // Default contract address if already declared/deployed
  defaultContractAddress: "0x60ee7746b6ae0aea09b0924482f1740c192d66b9952519b36eca21e99b3dcf1",
  defaultClassHash: "0x1716dc001bc7342d9159862ab29df0b0f6870e5b5fc92e19aac05e02f9f5430",

  // Provider configs
  provider: {
    nodeUrl: "https://starknet-sepolia.g.alchemy.com/v2/yUgd-DT4wZ1xtr46xo5yj4FpJEa47r9T",
  },

  // Account configs
  account: {
    address: "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA",
    privateKey: "0x02d7c1cdf03eaf767dd920b478b90067320c52bcd450f6c77a1057740486f4db",
  },

  // Contract paths
  contractPaths: {
    sierra: "./assets/piltover_appchain.contract_class.json",
    casm: "./assets/piltover_appchain.compiled_contract_class.json",
  },

  // Constructor arguments for 0th block
  constructorArgs: [
    "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA", // owner
    "0x0", // previous state_root
    "0x0", // block_number
    "0x7c6e710af5322fb47809cd955ef4834c37884da2a05cea00b68efd0ade0fa5d" // block_hash
  ],

  // State update parameters
   stateUpdate: {
     state_root: "0x232abcde1c388d59c16263f611fda743ecdf138ba65d3506ca5c59d3b3cd3a8",
     block_number: "0x0977",
     block_hash: "0x63f5721e22e54b1f77b8a312790cb51d49340327d0eea18e5403a79bd35f0ac"
   },

  // constructorArgs: [
  //   "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA", // owner
  //   "0x5a5438ef85edfc378cd8b972de012955b56608e64be6a7feb88078c6af7f304", // previous state_root
  //   "0x01c2", // block_number
  //   "0x5a534e22c45c4fe34c1ea26533aa62177a906f531978e51bf191ce83a7869d0" // block_hash
  // ],

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
    console.log('Declare Response', declareResponse);
    await account.waitForTransaction(declareResponse.transaction_hash);
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

    // use estimated fee
    const deployResult = await account.deploy({
      classHash: contractClassHash,
      constructorCalldata: CONFIG.constructorArgs,
      // max possible fee
      maxFee: "0x3f4c3b2e1d8",
    });
    console.log("Deploying contract...");

    await account.waitForTransaction(deployResult.transaction_hash);
    console.log("Contract deployed at address:", deployResult.contract_address);
    return deployResult.contract_address;
  } catch (err) {
    console.error("Error in deployment:", err.message);
    throw err;
  }
};

// Add this function after the other similar functions
const setState = async (account, contractAddress) => {
  console.log("Setting new state for contract:", contractAddress);
  try {
    const { sierra, _ } = loadContracts();
    const contract = new Contract(sierra.abi, contractAddress, account.provider);
    contract.connect(account);

    console.log("State update parameters:", CONFIG.stateUpdate);

    const res = await contract.set_state(
      CONFIG.stateUpdate.state_root,
      CONFIG.stateUpdate.block_number,
      CONFIG.stateUpdate.block_hash
    );

    console.log("State updated successfully. Transaction hash:", res.transaction_hash);
    await account.waitForTransaction(res.transaction_hash);
    return res.transaction_hash;
  } catch (err) {
    console.error("Error setting state:", err.message);
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

    await account.waitForTransaction(res.transaction_hash);
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

    await account.waitForTransaction(res.transaction_hash);
    return res.transaction_hash;
  } catch (err) {
    console.error("Error setting facts registry:", err.message);
    throw err;
  }
};


// Display usage information
const displayUsage = () => {
  console.log("\nUsage: node script.js <option> [contractAddress]");
  console.log("\nOptions:");
  console.log("  0: Declare Contract");
  console.log("  1: Deploy Contract");
  console.log("  2: Set Program Info");
  console.log("  3: Set Facts Registry");
  console.log("  4: Set State"); // Add this line
};

// Main function
async function main() {
  try {
    // Get command line arguments
    const option = parseInt(process.argv[2]);
    const contractAddress = process.argv[3] || CONFIG.defaultContractAddress;

    // Check if option is valid
    if (isNaN(option) || option < 0 || option > 4) {
      displayUsage();
      return;
    }

    console.log("Inside main");

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
        console.log("Appchain Piltover declared at: ", classHash);
        break;

      case 1:
        // Deploy contract
        deployedAddress = await deployContract(account, sierra, CONFIG.defaultClassHash);
        console.log("Appchain Piltover deployed at: ", deployedAddress);
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
        // Set state
        await setState(account, contractAddress);
        break;
    }
  } catch (error) {
    console.error("Error in main function:", error);
    process.exit(1);
  }
}

// Execute main function
main();
