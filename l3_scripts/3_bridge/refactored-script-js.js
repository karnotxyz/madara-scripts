async function deployBots() {
  console.log(`Deploying ${CONFIG.BOT_CONFIG.N_BOTS} bots...`);
  
  if (!CONFIG.CONTRACTS.ERC20_STARKNET_L2) {
    console.error("ERROR: ERC20 L2 contract address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.L3_REGISTRY) {
    console.error("ERROR: L3 Registry address not found in CONFIG. Update CONFIG.CONTRACTS.L3_REGISTRY first.");
    return;
  }
  
  try {
    const acc_l2 = await getAccount(Layer.L2);
    const gridTokenAddress = CONFIG.CONTRACTS.ERC20_STARKNET_L2;
    const tokenBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET;
    const l3Registry = CONFIG.CONTRACTS.L3_REGISTRY;
    
    // Get token and bridge contracts
    const gridCls = await acc_l2.getClassAt(gridTokenAddress);
    const gridToken = new Contract(gridCls.abi, gridTokenAddress, acc_l2);
    
    const bridgeCls = await acc_l2.getClassAt(tokenBridge);
    const tokenBridgeContract = new Contract(bridgeCls.abi, tokenBridge, acc_l2);
    
    // Approve token spending for all bots at once
    const totalAmount = CONFIG.BOT_CONFIG.TOKENS_PER_BOT * BigInt(CONFIG.BOT_CONFIG.N_BOTS);
    console.log(`Approving ${totalAmount} tokens for bot deployment...`);
    
    const approveCall = gridToken.populate('approve', {
      spender: tokenBridge,
      amount: totalAmount
    });
    
    let approveResult = await acc_l2.execute([approveCall]);
    console.log("Approval success!!", approveResult);
    await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    
    // Deploy each bot
    for (let i = 0; i < CONFIG.BOT_CONFIG.N_BOTS; i++) {
      console.log(`Deploying bot ${i+1} of ${CONFIG.BOT_CONFIG.N_BOTS}...`);
      
      // Select a random initial location from the provided options
      const randomLocationIndex = Math.floor(Math.random() * CONFIG.BOT_CONFIG.INITIAL_LOCATIONS.length);
      const initialLocation = CONFIG.BOT_CONFIG.INITIAL_LOCATIONS[randomLocationIndex];
      
      // Create a unique bot ID based on timestamp and index
      const botId = `0x${(Date.now() + i).toString(16)}`;
      
      const depositCall = tokenBridgeContract.populate('deposit_with_message', {
        token: gridTokenAddress,
        amount: CONFIG.BOT_CONFIG.TOKENS_PER_BOT,
        appchain_recipient: l3Registry,
        message: [
          botId, // Bot ID
          BigInt(initialLocation) // Initial location to mine
        ]
      });
      
      let depositResult = await acc_l2.execute([depositCall]);
      console.log(`Bot ${i+1} deployed successfully with ID ${botId} at location ${initialLocation}!!`, depositResult);
      
      // Wait between bot deployments to avoid transaction collisions
      if (i < CONFIG.BOT_CONFIG.N_BOTS - 1) {
        console.log(`Waiting before deploying next bot...`);
        await sleep(CONFIG.SLEEP_TIMES.VERY_LONG);
      }
    }
    
    console.log(`All ${CONFIG.BOT_CONFIG.N_BOTS} bots deployed successfully!`);
  } catch (error) {
    console.error("Error deploying bots:", error);
  }
}



async function activateTokenL2() {
  console.log("Activating token on L2...");
  const acc_l2 = await getAccount(Layer.L2);
  
  if (!CONFIG.CONTRACTS.ERC20_STARKNET_L2) {
    console.error("ERROR: ERC20 L2 contract address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }
  
  try {
    const gridTokenAddress = CONFIG.CONTRACTS.ERC20_STARKNET_L2;
    const tokenBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET;
    
    const cls = await acc_l2.getClassAt(tokenBridge);
    const tokenBridgeContract = new Contract(cls.abi, tokenBridge, acc_l2);

    const call = tokenBridgeContract.populate('activate_token', {
      token: gridTokenAddress
    });

    let result = await acc_l2.execute([call]);
    console.log("Token activated successfully!!", result);
    await sleep(CONFIG.SLEEP_TIMES.SHORT);
  } catch (error) {
    console.error("Error activating token:", error);
  }
}require('dotenv').config();

const { Account, byteArray, Contract, num, RpcProvider } = require('starknet');
const fs = require('fs');
const path = require('path');

// ContractLoader class to load contract artifacts
class ContractLoader {
  static loadContract(contractName) {
    const basePath = path.join(CONFIG.ASSETS_BASE_PATH, `gridy_${contractName}`);
    return {
      sierra: JSON.parse(fs.readFileSync(`${basePath}.contract_class.json`).toString("ascii")),
      casm: JSON.parse(fs.readFileSync(`${basePath}.compiled_contract_class.json`).toString("ascii"))
    };
  }
}

// Layer enum
const Layer = {
  L1: "L1",
  L2: "L2",
  L3: "L3"
};

// Load all contract artifacts
let contractArtifacts = {};
try {
  contractArtifacts = {
    appchain_bridge: ContractLoader.loadContract('appchain_bridge'),
    token_bridge_l3: ContractLoader.loadContract('token_bridge_l3'),
    token_bridge_l2: ContractLoader.loadContract('token_bridge_l2'),
    erc20_l3: ContractLoader.loadContract('erc20_l3'),
    erc20_l2: ContractLoader.loadContract('erc20_l2')
  };
  console.log("Loaded contract artifacts successfully");
} catch (error) {
  console.warn("Could not preload contract artifacts. They will be loaded on demand:", error.message);
}

// Configuration object for all hardcoded values and contract addresses
const CONFIG = {
  // Replace with your own values after each deployment
  CONTRACTS: {
    // Contract addresses
    APPCHAIN_STARKNET_BRIDGE: "", // Update this after deployment
    TOKEN_BRIDGE_STARKGATE: "",   // Update this after deployment
    TOKEN_BRIDGE_STARKNET: "",    // Update this after deployment
    ERC20_STARKNET_L2: "",        // Update this after deployment
    ERC20_STARKNET_L3: "",        // Update this after deployment
    L3_REGISTRY: "",              // Update this after deployment
    
    // Class hashes
    CLASS_HASHES: {
      APPCHAIN_STARKNET_BRIDGE: "", // Update this after declaration
      TOKEN_BRIDGE_STARKGATE: "",    // Update this after declaration
      TOKEN_BRIDGE_STARKNET: "",     // Update this after declaration
      ERC20_STARKNET_L2: "",         // Update this after declaration
      ERC20_STARKNET_L3: "",         // Update this after declaration
    }
  },
  SLEEP_TIMES: {
    SHORT: 1000,
    MEDIUM: 2000,
    LONG: 3000,
    VERY_LONG: 4000,
    EXTRA_LONG: 5000,
    WAIT_FOR_TRANSACTION: 10000
  },
  TOKEN: {
    NAME: "Gridy Token",
    SYMBOL: "GRD",
    DECIMALS: 18,
    INITIAL_SUPPLY: BigInt(10000) * BigInt(10) ** BigInt(18),
    DEPOSIT_AMOUNT: BigInt(10) * BigInt(10) ** BigInt(18)
  },
  ASSETS_BASE_PATH: "./target/dev/",
  BOT_CONFIG: {
    N_BOTS: 5,                     // Number of bots to deploy
    TOKENS_PER_BOT: BigInt(11) * BigInt(10) ** BigInt(18),  // Amount of tokens to send per bot
    INITIAL_LOCATIONS: [1, 2, 3, 4, 5, 6, 7, 8]  // Possible initial locations
  }
};

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper functions to interact with StarkNet
async function getAccount(layer) {
  if (layer === Layer.L2) {
    const privateKey = process.env.PRIVATE_KEY_L2;
    const accountAddress = process.env.ACCOUNT_L2_ADDRESS;
    
    if (!privateKey || !accountAddress) {
      throw new Error("Missing L2 account configuration in .env file");
    }
    
    const provider = getProvider(layer);
    return new Account(provider, accountAddress, privateKey);
  } else if (layer === Layer.L3) {
    const privateKey = process.env.PRIVATE_KEY_L3;
    const accountAddress = process.env.ACCOUNT_L3_ADDRESS;
    
    if (!privateKey || !accountAddress) {
      throw new Error("Missing L3 account configuration in .env file");
    }
    
    const provider = getProvider(layer);
    return new Account(provider, accountAddress, privateKey);
  }
  throw new Error(`Unsupported layer: ${layer}`);
}

async function getProvider(layer) {
  if (layer === Layer.L2) {
    // Use mainnet or testnet based on configuration
    const network = process.env.STARKNET_NETWORK || 'mainnet';
    return new RpcProvider({
      nodeUrl: process.env.STARKNET_RPC_URL || `https://${network}.starknet.io`
    });
  } else if (layer === Layer.L3) {
    // L3 provider configuration (appchain)
    return new RpcProvider({
      nodeUrl: process.env.APPCHAIN_RPC_URL || 'http://localhost:9545'
    });
  }
  throw new Error(`Unsupported layer: ${layer}`);
}

async function declareContract(contractKey, layer) {
  console.log(`Declaring ${contractKey} on ${layer}...`);
  
  try {
    const account = await getAccount(layer);
    
    // Get contract artifact
    let contractArtifact;
    try {
      contractArtifact = contractArtifacts[contractKey] || 
        ContractLoader.loadContract(contractKey);
    } catch (error) {
      console.error(`Error loading contract artifact for ${contractKey}:`, error);
      throw error;
    }
    
    // Declare the contract
    const { class_hash } = await account.declare({
      contract: contractArtifact.sierra,
      casm: contractArtifact.casm
    });
    
    console.log(`Contract ${contractKey} declared successfully on ${layer}`);
    return class_hash;
  } catch (error) {
    console.error(`Error declaring contract ${contractKey}:`, error);
    throw error;
  }
}

async function deployContract(contractKey, classHash, constructorCalldata, layer) {
  console.log(`Deploying ${contractKey} on ${layer} with class hash ${classHash}...`);
  
  try {
    const account = await getAccount(layer);
    
    // Deploy the contract
    const deploymentResult = await account.deploy({
      classHash: classHash,
      constructorCalldata: constructorCalldata,
      salt: randomSalt() // Generate a random salt for unique address
    });
    
    // Wait for transaction to be accepted
    await account.waitForTransaction(deploymentResult.transaction_hash);
    
    console.log(`Contract ${contractKey} deployed successfully on ${layer}`);
    return { 
      address: deploymentResult.contract_address,
      transaction_hash: deploymentResult.transaction_hash 
    };
  } catch (error) {
    console.error(`Error deploying contract ${contractKey}:`, error);
    throw error;
  }
}

// Helper function to generate a random salt for contract deployment
function randomSalt() {
  return '0x' + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

// Function implementations
async function declareAppchainBridge() {
  console.log("Declaring Appchain Bridge...");
  const classHash = await declareContract("appchain_bridge", Layer.L3);
  console.log("Appchain core contract declared successfully with class hash:", classHash);
  
  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CONTRACTS.CLASS_HASHES.APPCHAIN_STARKNET_BRIDGE = "${classHash}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.MEDIUM);
}

async function deployAppchainBridge() {
  console.log("Deploying Appchain Bridge...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CONTRACTS.CLASS_HASHES.APPCHAIN_STARKNET_BRIDGE) {
    console.error("ERROR: Class hash for APPCHAIN_STARKNET_BRIDGE not found in CONFIG. Run declareAppchainBridge first.");
    return;
  }
  
  const contract = await deployContract(
    "appchain_starknet_bridge",
    CONFIG.CONTRACTS.CLASS_HASHES.APPCHAIN_STARKNET_BRIDGE,
    [
      acc_l3.address, // owner
      1, // state_root,
      1, // block_number,
      1, // block_hash
    ], 
    Layer.L3
  );

  console.log("Appchain core contract deployed successfully at:", contract.address);
  
  // Update the CONFIG with the new contract address
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CONTRACT ADDRESS:
CONFIG.CONTRACTS.APPCHAIN_STARKNET_BRIDGE = "${contract.address}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.MEDIUM);
}

async function declareL3Bridge() {
  console.log("Declaring L3 TokenBridge...");
  const classHash = await declareContract("token_bridge_l3", Layer.L3);
  
  console.log("TokenBridge declared successfully with class hash:", classHash);
  
  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CONTRACTS.CLASS_HASHES.TOKEN_BRIDGE_STARKGATE = "${classHash}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.MEDIUM);
}

async function deployL3Bridge() {
  console.log("Deploying L3 TokenBridge...");
  
  if (!CONFIG.CONTRACTS.CLASS_HASHES.TOKEN_BRIDGE_STARKGATE) {
    console.error("ERROR: Class hash for TOKEN_BRIDGE_STARKGATE not found in CONFIG. Run declareL3Bridge first.");
    return;
  }
  
  const contract = await deployContract(
    "TokenBridge_starkgate_contracts",
    CONFIG.CONTRACTS.CLASS_HASHES.TOKEN_BRIDGE_STARKGATE,
    [process.env.ACCOUNT_L3_ADDRESS, "10"],
    Layer.L3
  );
  
  console.log("L3 TokenBridge deployed successfully at:", contract.address);
  
  // Update the CONFIG with the new contract address
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CONTRACT ADDRESS:
CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE = "${contract.address}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.MEDIUM);
}

async function declareL2Bridge() {
  console.log("Declaring L2 TokenBridge...");
  const classHash = await declareContract("token_bridge_l2", Layer.L2);
  
  console.log("L2 TokenBridge declared successfully with class hash:", classHash);
  
  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CONTRACTS.CLASS_HASHES.TOKEN_BRIDGE_STARKNET = "${classHash}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.SHORT);
}

async function deployL2Bridge() {
  console.log("Deploying L2 TokenBridge...");
  
  if (!CONFIG.CONTRACTS.CLASS_HASHES.TOKEN_BRIDGE_STARKNET) {
    console.error("ERROR: Class hash for TOKEN_BRIDGE_STARKNET not found in CONFIG. Run declareL2Bridge first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE) {
    console.error("ERROR: L3 TokenBridge address not found in CONFIG. Run deployL3Bridge first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.APPCHAIN_STARKNET_BRIDGE) {
    console.error("ERROR: Appchain Bridge address not found in CONFIG. Run deployAppchainBridge first.");
    return;
  }
  
  const contract = await deployContract(
    "TokenBridge_starknet_bridge",
    CONFIG.CONTRACTS.CLASS_HASHES.TOKEN_BRIDGE_STARKNET,
    [
      CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE,
      CONFIG.CONTRACTS.APPCHAIN_STARKNET_BRIDGE,
      process.env.ACCOUNT_L2_ADDRESS
    ],
    Layer.L2
  );
  
  console.log("L2 TokenBridge deployed successfully at:", contract.address);
  
  // Update the CONFIG with the new contract address
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CONTRACT ADDRESS:
CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET = "${contract.address}";
-----------------------------------------------
  `);
}

async function configureAppchainBridge() {
  console.log("Configuring Appchain Bridge...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE) {
    console.error("ERROR: L3 TokenBridge address not found in CONFIG. Run deployL3Bridge first.");
    return;
  }
  
  try {
    const appchainBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE;
    const cls = await acc_l3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(cls.abi, appchainBridge, acc_l3);

    // Set app role admin
    {
      const call = appchainBridgeContract.populate('register_app_role_admin', {
        account: acc_l3.address
      });
      await acc_l3.execute([call], { maxFee: 0 });
      console.log("App role admin set successfully!!");
      await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    }

    // Set app governor
    {
      const call = appchainBridgeContract.populate('register_app_governor', {
        account: acc_l3.address
      });
      await acc_l3.execute([call], { maxFee: 0 });
      console.log("App governor set successfully!!");
      await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    }

    // Set L2 token governance
    {
      const call = appchainBridgeContract.populate('set_l2_token_governance', {
        l2_token_governance: acc_l3.address
      });
      await acc_l3.execute([call], { maxFee: 0 });
      console.log("L2 Governance set successfully!!");
      await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    }
    
    console.log("Appchain Bridge configured successfully!");
  } catch (error) {
    console.error("Error configuring Appchain Bridge:", error);
  }
}

async function setL2Bridge() {
  console.log("Setting L2 Bridge on L3 contract...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE) {
    console.error("ERROR: L3 TokenBridge address not found in CONFIG. Run deployL3Bridge first.");
    return;
  }
  
  try {
    const tokenBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET;
    const appchainBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE;
    const cls = await acc_l3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(cls.abi, appchainBridge, acc_l3);

    const call = appchainBridgeContract.populate('set_l1_bridge', {
      l1_bridge_address: tokenBridge
    });
    await acc_l3.execute([call], { maxFee: 0 });
    console.log("L2 bridge set successfully!!");
    await sleep(CONFIG.SLEEP_TIMES.SHORT);
  } catch (error) {
    console.error("Error setting L2 Bridge:", error);
  }
}

async function declareERC20L3() {
  console.log("Declaring ERC20 on L3...");
  const classHash = await declareContract("erc20_l3", Layer.L3);
  
  console.log("ERC20 L3 declared successfully with class hash:", classHash);
  
  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CONTRACTS.CLASS_HASHES.ERC20_STARKNET_L3 = "${classHash}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.LONG);
}

async function setERC20L3() {
  console.log("Setting ERC20 class hash on L3...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CONTRACTS.CLASS_HASHES.ERC20_STARKNET_L3) {
    console.error("ERROR: ERC20 L3 class hash not found in CONFIG. Run declareERC20L3 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE) {
    console.error("ERROR: L3 TokenBridge address not found in CONFIG. Run deployL3Bridge first.");
    return;
  }
  
  try {
    const appchainBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE;
    const cls = await acc_l3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(cls.abi, appchainBridge, acc_l3);

    const class_hash = CONFIG.CONTRACTS.CLASS_HASHES.ERC20_STARKNET_L3;
    const call = appchainBridgeContract.populate('set_erc20_class_hash', {
      erc20_class_hash: class_hash
    });
    let result = await acc_l3.execute([call], { maxFee: 0 });
    console.log("ERC20 class_hash set successfully!!", result);
    await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
  } catch (error) {
    console.error("Error setting ERC20 class hash:", error);
  }
}

async function declareERC20L2() {
  console.log("Declaring ERC20 on L2...");
  const classHash = await declareContract("erc20_l2", Layer.L2);
  
  console.log("ERC20 L2 declared successfully with class hash:", classHash);
  
  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CONTRACTS.CLASS_HASHES.ERC20_STARKNET_L2 = "${classHash}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.LONG);
}

async function deployERC20L2() {
  console.log("Deploying ERC20 on L2...");
  const acc_l2 = await getAccount(Layer.L2);
  
  if (!CONFIG.CONTRACTS.CLASS_HASHES.ERC20_STARKNET_L2) {
    console.error("ERROR: ERC20 L2 class hash not found in CONFIG. Run declareERC20L2 first.");
    return;
  }
  
  const contract = await deployContract(
    "ERC20_starknet_bridge",
    CONFIG.CONTRACTS.CLASS_HASHES.ERC20_STARKNET_L2,
    [
      byteArray.byteArrayFromString(CONFIG.TOKEN.NAME), // name
      byteArray.byteArrayFromString(CONFIG.TOKEN.SYMBOL), // symbol
      CONFIG.TOKEN.DECIMALS, // decimals
      CONFIG.TOKEN.INITIAL_SUPPLY, // initial_supply
      0, // reserved
      process.env.ACCOUNT_L2_ADDRESS, // initial_recipient
      process.env.ACCOUNT_L2_ADDRESS, // l2_token_governance 
      process.env.ACCOUNT_L2_ADDRESS, // permitted_minter 
      0, // upgrade delay
    ],
    Layer.L2
  );
  
  console.log("ERC20 L2 deployed successfully at:", contract.address);
  
  // Update the CONFIG with the new contract address
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CONTRACT ADDRESS:
CONFIG.CONTRACTS.ERC20_STARKNET_L2 = "${contract.address}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
}

async function enrollTokenL2() {
  console.log("Enrolling token on L2...");
  const acc_l2 = await getAccount(Layer.L2);
  
  if (!CONFIG.CONTRACTS.ERC20_STARKNET_L2) {
    console.error("ERROR: ERC20 L2 contract address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }
  
  try {
    const gridTokenAddress = CONFIG.CONTRACTS.ERC20_STARKNET_L2;
    const tokenBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKNET;

    const cls = await acc_l2.getClassAt(tokenBridge);
    const tokenBridgeContract = new Contract(cls.abi, tokenBridge, acc_l2);

    const call = tokenBridgeContract.populate('enroll_token', {
      token: gridTokenAddress,
    });
    let result = await acc_l2.execute([call]);
    console.log("Token enrolled successfully!!", result);
    await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
  } catch (error) {
    console.error("Error enrolling token:", error);
  }
}

async function getL3Balance(address, tokenKey = "erc20_l2") {
  console.log(`Getting L3 balance for address ${address} of tokenKey ${tokenKey}`);
  
  if (!CONFIG.CONTRACTS.ERC20_STARKNET_L2) {
    console.error("ERROR: L2 token address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE) {
    console.error("ERROR: L3 TokenBridge address not found in CONFIG. Run deployL3Bridge first.");
    return;
  }
  
  try {
    const gameTokenAddress = CONFIG.CONTRACTS.ERC20_STARKNET_L2;
    const appchainBridge = CONFIG.CONTRACTS.TOKEN_BRIDGE_STARKGATE;
    const providerL3 = await getProvider(Layer.L3);

    const appchainBridgeCls = await providerL3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(appchainBridgeCls.abi, appchainBridge, providerL3);

    const correspondingToken = await appchainBridgeContract.call('get_l2_token', [gameTokenAddress]);
    
    if (correspondingToken != 0n) {
      const correspondingTokenAddress = num.toHex(correspondingToken);
      console.log("Corresponding appchain token address:", correspondingTokenAddress);
      
      const appchainTokenCls = await providerL3.getClassAt(correspondingTokenAddress);
      const appchainToken = new Contract(appchainTokenCls.abi, correspondingTokenAddress, providerL3);
      
      const balance = await appchainToken.call('balanceOf', [address]);
      console.log("Balance:", balance.toString());
      return balance;
    } else {
      console.log("No corresponding L3 token found for this L2 token");
      return 0n;
    }
  } catch (error) {
    console.error("Error getting L3 balance:", error);
    throw error;
  }
}

// Main function to handle CLI command
async function main() {
  const commandIndex = parseInt(process.argv[2] || '');
  
  if (isNaN(commandIndex)) {
    console.log(`
Bridge Deployment CLI
Usage: node bridge_deploy.js <command_number>

Available commands:
0 - Declare Appchain Bridge
1 - Deploy Appchain Bridge
2 - Declare L3 Bridge
3 - Deploy L3 Bridge
4 - Declare L2 Bridge
5 - Deploy L2 Bridge
6 - Configure Appchain Bridge
7 - Set L2 Bridge
8 - Declare ERC20 L3
9 - Set ERC20 L3
10 - Declare ERC20 L2
11 - Deploy ERC20 L2
12 - Enroll Token L2
13 - Activate Token L2
14 - Get L3 Balance
15 - Deploy Bots
    `);
    return;
  }
  
  try {
    switch (commandIndex) {
      case 0:
        await declareAppchainBridge();
        break;
      case 1:
        await deployAppchainBridge();
        break;
      case 2:
        await declareL3Bridge();
        break;
      case 3:
        await deployL3Bridge();
        break;
      case 4:
        await declareL2Bridge();
        break;
      case 5:
        await deployL2Bridge();
        break;
      case 6:
        await configureAppchainBridge();
        break;
      case 7:
        await setL2Bridge();
        break;
      case 8:
        await declareERC20L3();
        break;
      case 9:
        await setERC20L3();
        break;
      case 10:
        await declareERC20L2();
        break;
      case 11:
        await deployERC20L2();
        break;
      case 12:
        await enrollTokenL2();
        break;
      case 13:
        await activateTokenL2();
        break;
      case 14:
        const address = process.argv[3];
        if (!address) {
          console.error("Missing address parameter. Usage: node bridge_deploy.js 14 <address>");
          return;
        }
        await getL3Balance(address);
        break;
      case 15:
        await deployBots();
        break;
      default:
        console.error("Invalid command number. Run without arguments to see usage.");
    }
  } catch (error) {
    console.error("Error executing command:", error);
  }
}

// Run the main function
main();
