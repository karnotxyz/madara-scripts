require('dotenv').config();

const { Account, byteArray, Contract, num, RpcProvider } = require('starknet');
const fs = require('fs');
const path = require('path');

// ContractLoader class to load contract artifacts
class ContractLoader {
  static loadContract(contractName) {
    const basePath = path.join(CONFIG.ASSETS_BASE_PATH, `${contractName}`);
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

// Configuration object for all hardcoded values and contract addresses
const CONFIG = {
  N_BOTS: 10,
  // Replace with your own values after each deployment
  CONTRACTS: {
    APPCHAIN_CORE_CONTRACT: "",
    L3_REGISTRY: "",
    // Contract addresses
    APPCHAIN_BRIDGE: "", // Update this after deployment
    L2_BRIDGE: "",    // Update this after deployment
    L2_ERC20: "",        // Update this after deployment
    APPCHAIN_ERC20: "",        // Update this after deployment
  },

  // Class hashes
  CLASS_HASHES: {
    APPCHAIN_BRIDGE: "", // Update this after declaration
    L2_BRIDGE: "",     // Update this after declaration
    L2_ERC20: "",         // Update this after declaration
    APPCHAIN_ERC20: "",         // Update this after declaration
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
    INITIAL_SUPPLY: BigInt(100000) * BigInt(10) ** BigInt(18),
    DEPOSIT_AMOUNT: BigInt(10) * BigInt(10) ** BigInt(18)
  },
  ASSETS_BASE_PATH: "./assets",

  BOT_CONFIG : {
    N_BOTS: 23,
    TOKENS_PER_BOT: 100,
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
    return new Account(
      new RpcProvider({ nodeUrl: process.env.NODE_L2_URL })
      , accountAddress, privateKey, undefined,
      "0x3");

  } else if (layer === Layer.L3) {
    const privateKey = process.env.PRIVATE_KEY_L3;
    const accountAddress = process.env.ACCOUNT_L3_ADDRESS;

    if (!privateKey || !accountAddress) {
      throw new Error("Missing L3 account configuration in .env file");
    }
    
    return new Account(
      new RpcProvider({ nodeUrl: process.env.APPCHAIN_RPC_URL })
      , accountAddress, privateKey,  undefined,
      "0x3");
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
      nodeUrl: process.env.APPCHAIN_RPC_URL || 'http://localhost:9944'
    });
  }
  throw new Error(`Unsupported layer: ${layer}`);
}

async function declareL2Contract(contractKey) {
  console.log(`Declaring ${contractKey} on ${Layer.L2}...`);
  
  try {
    const account = await getAccount(Layer.L2);
    // Get contract artifact
    let contractArtifact;
    try {
      contractArtifact = ContractLoader.loadContract(contractKey);
    } catch (error) {
      console.error(`Error loading contract artifact for ${contractKey}:`, error);
      throw error;
    }
    // Declare the contract
    const { class_hash } = await account.declare({
      contract: contractArtifact.sierra,
      casm: contractArtifact.casm
    }
  );
    
    console.log(`Contract ${contractKey} declared successfully on ${Layer.L2}`);
    return class_hash;
  } catch (error) {
    console.error(`Error declaring contract ${contractKey}:`, error);
    throw error;
  }
}


async function declareL3Contract(contractKey) {
  console.log(`Declaring ${contractKey} on ${Layer.L3}...`);
  
  try {
    const account = await getAccount(Layer.L3);
    // Get contract artifact
    let contractArtifact;
    try {
      contractArtifact = ContractLoader.loadContract(contractKey);
    } catch (error) {
      console.error(`Error loading contract artifact for ${contractKey}:`, error);
      throw error;
    }
    // Declare the contract
    const { class_hash } = await account.declare({
      contract: contractArtifact.sierra,
      casm: contractArtifact.casm
    },
    { 
      maxFee: 0,
      resourceBounds : {
        l1_gas : {
          max_amount: "0x0",
          max_price_per_unit: "0x0"
        },
        l2_gas: {
          max_amount: "0x0",
          max_price_per_unit: "0x0"
        }
      }
    }
  
  );
    
    console.log(`Contract ${contractKey} declared successfully on ${Layer.L3}`);
    return class_hash;
  } catch (error) {
    console.error(`Error declaring contract ${contractKey}:`, error);
    throw error;
  }
}

async function deployL2Contract(contractKey, classHash, constructorCalldata) {
  console.log(`Deploying ${contractKey} on ${Layer.L2} with class hash ${classHash} `);
  
  try {
    const account = await getAccount(Layer.L2);
    
    // Deploy the contract
    const deploymentResult = await account.deploy({
      classHash: classHash,
      constructorCalldata: constructorCalldata,
    }
  );
    
    // Wait for transaction to be accepted
    await account.waitForTransaction(deploymentResult.transaction_hash);
    
    console.log(`Contract ${contractKey} deployed successfully on ${Layer.L2}`);
    return { 
      address: deploymentResult.contract_address,
      transaction_hash: deploymentResult.transaction_hash 
    };
  } catch (error) {
    console.error(`Error deploying contract ${contractKey}:`, error);
    throw error;
  }
}


async function deployL3Contract(contractKey, classHash, constructorCalldata) {
  console.log(`Deploying ${contractKey} on ${Layer.L3} with class hash ${classHash} `);
  
  try {
    const account = await getAccount(Layer.L3);
    
    // Deploy the contract
    const deploymentResult = await account.deploy({
      classHash: classHash,
      constructorCalldata: constructorCalldata,
    },
    { 
      maxFee: 0,
      resourceBounds : {
        l1_gas : {
          max_amount: "0x0",
          max_price_per_unit: "0x0"
        },
        l2_gas: {
          max_amount: "0x0",
          max_price_per_unit: "0x0"
        }
      }
    }
  );
    
    // Wait for transaction to be accepted
    await account.waitForTransaction(deploymentResult.transaction_hash);
    
    console.log(`Contract ${contractKey} deployed successfully on ${Layer.L3}`);
    return { 
      address: deploymentResult.contract_address,
      transaction_hash: deploymentResult.transaction_hash
    };
  } catch (error) {
    console.error(`Error deploying contract ${contractKey}:`, error);
    throw error;
  }
}


async function deployL3Contract(contractKey, classHash, constructorCalldata) {
  console.log(`Deploying ${contractKey} on ${Layer.L3} with class hash ${classHash} `);

  try {
    const account = await getAccount(Layer.L3);

    // Deploy the contract
    const deploymentResult = await account.deploy({
      classHash: classHash,
      constructorCalldata: constructorCalldata,
    },
      {
        maxFee: 0,
        resourceBounds: {
          l1_gas: {
            max_amount: "0x0",
            max_price_per_unit: "0x0"
          },
          l2_gas: {
            max_amount: "0x0",
            max_price_per_unit: "0x0"
          }
        }
      }
    );

    // Wait for transaction to be accepted
    await account.waitForTransaction(deploymentResult.transaction_hash);

    console.log(`Contract ${contractKey} deployed successfully on ${Layer.L3}`);
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
  const classHash = await declareL3Contract("starkgate_contracts_TokenBridge");
  console.log("Appchain core contract declared successfully with class hash:", classHash);

  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH: "${classHash}";
-----------------------------------------------
  `);

  await sleep(CONFIG.SLEEP_TIMES.MEDIUM);
}

async function deployAppchainBridge() {
  console.log("Deploying Appchain Bridge...");
  if (!CONFIG.CLASS_HASHES.APPCHAIN_BRIDGE) {
    console.error("ERROR: Class hash for APPCHAIN_BRIDGE not found in CONFIG. Run declareAppchainBridge first.");
    return;
  }
  
  const contract = await deployL3Contract(
    "starkgate_contracts_TokenBridge",
    CONFIG.CLASS_HASHES.APPCHAIN_BRIDGE,
    [
      process.env.ACCOUNT_L3_ADDRESS, // owner
      "10"
    ], 
  );

  console.log("Appchain bridge deployed successfully at:", contract.address);
  
  // Update the CONFIG with the new contract address
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CONTRACT ADDRESS:
CONFIG.CONTRACTS.APPCHAIN_BRIDGE = "${contract.address}";
-----------------------------------------------
  `);
  
  await sleep(CONFIG.SLEEP_TIMES.MEDIUM);
}

async function declareL2Bridge() {
  console.log("Declaring L2 TokenBridge...");
  const classHash = await declareL2Contract("L2_BRIDGE_TokenBridge");
  
  console.log("L2 TokenBridge declared successfully with class hash:", classHash);

  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CLASS_HASHES.L2_BRIDGE = "${classHash}";
-----------------------------------------------
  `);

  await sleep(CONFIG.SLEEP_TIMES.SHORT);
}

async function deployL2Bridge() {
  console.log("Deploying L2 TokenBridge...");
  
  if (!CONFIG.CLASS_HASHES.L2_BRIDGE) {
    console.error("ERROR: Class hash for L2_BRIDGE not found in CONFIG. Run declareL2Bridge first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.APPCHAIN_BRIDGE) {
    console.error("ERROR: Appchain Bridge address not found in CONFIG. Run deployAppchainBridge first.");
    return;
  }
  
  const contract = await deployL2Contract(
    "L2_BRIDGE_TokenBridge",
    CONFIG.CLASS_HASHES.L2_BRIDGE,
    [
      CONFIG.CONTRACTS.APPCHAIN_BRIDGE,
      CONFIG.CONTRACTS.APPCHAIN_CORE_CONTRACT,
      process.env.ACCOUNT_L2_ADDRESS
    ],
  );

  console.log("L2 TokenBridge deployed successfully at:", contract.address);

  // Update the CONFIG with the new contract address
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CONTRACT ADDRESS:
CONFIG.CONTRACTS.L2_BRIDGE = "${contract.address}";
-----------------------------------------------
  `);
}

async function configureAppchainBridge() {
  console.log("Configuring Appchain Bridge...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CONTRACTS.APPCHAIN_BRIDGE) {
    console.error("ERROR: APPCHAIN_BRIDGE address not found in CONFIG. Run deployAppchainBridge first.");
    return;
  }

  try {
    const appchainBridge = CONFIG.CONTRACTS.APPCHAIN_BRIDGE;
    const cls = await acc_l3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(cls.abi, appchainBridge, acc_l3);

    // Set app role admin
    {
      const call = appchainBridgeContract.populate('register_app_role_admin', {
        account: acc_l3.address
      });
      await acc_l3.execute([call], 
        { 
          maxFee: 0,
          resourceBounds : {
            l1_gas : {
              max_amount: "0x0",
              max_price_per_unit: "0x0"
            },
            l2_gas: {
              max_amount: "0x0",
              max_price_per_unit: "0x0"
            }
          }
        }
      );
      console.log("App role admin set successfully!!");
      await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    }

    // Set app governor
    {
      const call = appchainBridgeContract.populate('register_app_governor', {
        account: acc_l3.address
      });
      await acc_l3.execute([call], 
        { 
          maxFee: 0,
          resourceBounds : {
            l1_gas : {
              max_amount: "0x0",
              max_price_per_unit: "0x0"
            },
            l2_gas: {
              max_amount: "0x0",
              max_price_per_unit: "0x0"
            }
          }
        }
      );
      console.log("App governor set successfully!!");
      await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    }

    // Set L2 token governance
    {
      const call = appchainBridgeContract.populate('set_l2_token_governance', {
        l2_token_governance: acc_l3.address
      });
      await acc_l3.execute([call],
        { 
          maxFee: 0,
          resourceBounds : {
            l1_gas : {
              max_amount: "0x0",
              max_price_per_unit: "0x0"
            },
            l2_gas: {
              max_amount: "0x0",
              max_price_per_unit: "0x0"
            }
          }
        }
      );
      console.log("L2 Governance set successfully!!");
      await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    }

    console.log("Appchain Bridge configured successfully!");
  } catch (error) {
    console.error("Error configuring Appchain Bridge:", error);
  }
}

async function setL2Bridge() {
  console.log("Setting L2 Bridge on Appchain contract...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CONTRACTS.L2_BRIDGE) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.APPCHAIN_BRIDGE) {
    console.error("ERROR: Appchain TokenBridge address not found in CONFIG. Run deployAppchainBridge first.");
    return;
  }

  try {
    const starknetBridge = CONFIG.CONTRACTS.L2_BRIDGE;
    const appchainBridge = CONFIG.CONTRACTS.APPCHAIN_BRIDGE;
    const cls = await acc_l3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(cls.abi, appchainBridge, acc_l3);

    const call = appchainBridgeContract.populate('set_l1_bridge', {
      l1_bridge_address: starknetBridge
    });
    await acc_l3.execute([call], 
      { 
        maxFee: 0,
        resourceBounds : {
          l1_gas : {
            max_amount: "0x0",
            max_price_per_unit: "0x0"
          },
          l2_gas: {
            max_amount: "0x0",
            max_price_per_unit: "0x0"
          }
        }
      }
    );
    console.log("L2 bridge set successfully!!");
    await sleep(CONFIG.SLEEP_TIMES.SHORT);
  } catch (error) {
    console.error("Error setting L2 Bridge:", error);
  }
}

async function declareERC20AppChain() {
  console.log("Declaring ERC20 on AppChain...");
  const classHash = await declareL3Contract("L2_BRIDGE_ERC20");
  
  console.log("ERC20 L3 declared successfully with class hash:", classHash);

  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CLASS_HASHES.APPCHAIN_ERC20 = "${classHash}";
-----------------------------------------------
  `);

  await sleep(CONFIG.SLEEP_TIMES.LONG);
}

async function setERC20AppChain() {
  console.log("Setting ERC20 class hash on L3...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CLASS_HASHES.APPCHAIN_ERC20) {
    console.error("ERROR: ERC20 L3 class hash not found in CONFIG. Run declareERC20AppChain first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.APPCHAIN_BRIDGE) {
    console.error("ERROR: L3 TokenBridge address not found in CONFIG. Run deployL3Bridge first.");
    return;
  }

  try {
    const appchainBridge = CONFIG.CONTRACTS.APPCHAIN_BRIDGE;
    const cls = await acc_l3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(cls.abi, appchainBridge, acc_l3);

    const class_hash = CONFIG.CLASS_HASHES.APPCHAIN_ERC20;
    const call = appchainBridgeContract.populate('set_erc20_class_hash', {
      erc20_class_hash: class_hash
    });
    let result = await acc_l3.execute([call], 
      { 
        maxFee: 0,
        resourceBounds : {
          l1_gas : {
            max_amount: "0x0",
            max_price_per_unit: "0x0"
          },
          l2_gas: {
            max_amount: "0x0",
            max_price_per_unit: "0x0"
          }
        }
      }
    );
    console.log("ERC20 class_hash set successfully!!", result);
    await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
  } catch (error) {
    console.error("Error setting ERC20 class hash:", error);
  }
}

async function declareERC20L2() {
  console.log("Declaring ERC20 on L2...");
  const classHash = await declareL2Contract("L2_BRIDGE_ERC20");
  
  console.log("ERC20 L2 declared successfully with class hash:", classHash);

  // Update the CONFIG with the new class hash
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CLASS HASH:
CONFIG.CLASS_HASHES.L2_ERC20 = "${classHash}";
-----------------------------------------------
  `);

  await sleep(CONFIG.SLEEP_TIMES.LONG);
}

async function deployERC20L2() {
  console.log("Deploying ERC20 on L2...");
  
  if (!CONFIG.CLASS_HASHES.L2_ERC20) {
    console.error("ERROR: ERC20 L2 class hash not found in CONFIG. Run declareERC20L2 first.");
    return;
  }
  
  const contract = await deployL2Contract(
    "L2_BRIDGE_ERC20",
    CONFIG.CLASS_HASHES.L2_ERC20,
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
    ]
  );

  console.log("ERC20 L2 deployed successfully at:", contract.address);

  // Update the CONFIG with the new contract address
  console.log(`
-----------------------------------------------
UPDATE YOUR CONFIG FILE WITH THIS CONTRACT ADDRESS:
CONFIG.CONTRACTS.L2_ERC20 = "${contract.address}";
-----------------------------------------------
  `);

  await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
}

async function enrollTokenL2() {
  console.log("Enrolling token on L2...");
  const acc_l2 = await getAccount(Layer.L2);
  
  if (!CONFIG.CONTRACTS.L2_ERC20) {
    console.error("ERROR: ERC20 L2 contract address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.L2_BRIDGE) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }

  try {
    const gridTokenAddress = CONFIG.CONTRACTS.L2_ERC20;
    const tokenBridge = CONFIG.CONTRACTS.L2_BRIDGE;

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

async function activateTokenL2() {
  console.log("Activating token on L2...");
  const acc_l2 = await getAccount(Layer.L2);
  
  if (!CONFIG.CONTRACTS.L2_ERC20) {
    console.error("ERROR: ERC20 L2 contract address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.L2_BRIDGE) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }

  try {
    const gridTokenAddress = CONFIG.CONTRACTS.L2_ERC20;
    const tokenBridge = CONFIG.CONTRACTS.L2_BRIDGE;
    
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
}

async function getAppchainToken() {
  console.log("Getting Token on Appchain...");
  const acc_l3 = await getAccount(Layer.L3);
  
  if (!CONFIG.CONTRACTS.L2_ERC20) {
    console.error("ERROR: ERC20 L2 contract address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.APPCHAIN_BRIDGE) {
    console.error("ERROR: Appchain Bridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }
  
  try {
    const gridyTokenAddress = CONFIG.CONTRACTS.L2_ERC20;
    const appchainBridge = CONFIG.CONTRACTS.APPCHAIN_BRIDGE;

    const appchainBridgeCls = await acc_l3.getClassAt(appchainBridge);
    const appchainBridgeContract = new Contract(appchainBridgeCls.abi, appchainBridge, acc_l3);

    const correspondingToken = await appchainBridgeContract.call('get_l2_token', [gridyTokenAddress]);

    if (correspondingToken != 0n) {
      const correspondingTokenAddress = num.toHex(correspondingToken);
      console.log("Corresponding appchain token address:", correspondingTokenAddress);
     
    } else {
      console.log("No corresponding L3 token found for this L2 token");
      return 0n;
    }
  } catch (error) {
    console.error("Error activating token:", error);
  }
}

async function deployBots() {
  console.log(`Deploying ${CONFIG.N_BOTS} bots...`);
  
  if (!CONFIG.CONTRACTS.L2_ERC20) {
    console.error("ERROR: ERC20 L2 contract address not found in CONFIG. Run deployERC20L2 first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.L2_BRIDGE) {
    console.error("ERROR: L2 TokenBridge address not found in CONFIG. Run deployL2Bridge first.");
    return;
  }
  
  if (!CONFIG.CONTRACTS.L3_REGISTRY) {
    console.error("ERROR: L3 Registry address not found in CONFIG. Update CONFIG.CONTRACTS.L3_REGISTRY first.");
    return;
  }
  
  try {
    const acc_l2 = await getAccount(Layer.L2);
    const gridyTokenAddress = CONFIG.CONTRACTS.L2_ERC20;
    const tokenBridge = CONFIG.CONTRACTS.L2_BRIDGE;
    const l3Registry = CONFIG.CONTRACTS.L3_REGISTRY;
    
    // Get token and bridge contracts
    const gridCls = await acc_l2.getClassAt(gridyTokenAddress);
    const gridyToken = new Contract(gridCls.abi, gridyTokenAddress, acc_l2);
    
    const bridgeCls = await acc_l2.getClassAt(tokenBridge);
    const tokenBridgeContract = new Contract(bridgeCls.abi, tokenBridge, acc_l2);
    
    // Approve token spending for all bots at once
    console.log(`Approving tokens for bot deployment...`);
    
    const approveCall = gridyToken.populate('approve', {
      spender: tokenBridge,
      amount:  12n * 10n ** 18n
    });
    
    let approveResult = await acc_l2.execute([approveCall]);
    console.log("Approval success!!", approveResult);
    await sleep(CONFIG.SLEEP_TIMES.EXTRA_LONG);
    
    // Deploy each bot
    for (let i = 0; i < CONFIG.BOT_CONFIG.N_BOTS; i++) {
      console.log(`Deploying bot ${i+1} of ${CONFIG.BOT_CONFIG.N_BOTS}...`);
      
      // Create a unique bot ID based on timestamp and index
      const botId = `0x${(Date.now() + i).toString(16)}`;
      
      const depositCall = tokenBridgeContract.populate('deposit_with_message', {
        token: gridyTokenAddress,
        amount:  11n ** 15n,
        appchain_recipient: l3Registry,
        message: [
          acc_l2.address, // Player L2 address
          i
        ]
      });
      
      let depositResult = await acc_l2.execute([depositCall]);
      console.log(`Bot ${i+1} deployed successfully with ID ${botId} at location`, depositResult);
      
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
2 - Declare L2 Bridge
3 - Deploy L2 Bridge
4 - Configure Appchain Bridge
5 - Set L2 Bridge
6 - Declare ERC20 L3
7 - Set ERC20 L3
8 - Declare ERC20 L2
9 - Deploy ERC20 L2
10 - Enroll Token L2
11 - Activate Token L2
12 - Get Appchain Token
13 - Deploy Bots
    `);
    return;
  }

  try {
    switch (commandIndex) {
      case 0:
        await declareAppchainBridge();x
        break;
      case 1:
        await deployAppchainBridge();
        break;
      case 2:
        await declareL2Bridge();
        break;
      case 3:
        await deployL2Bridge();
        break;
      case 4:
        await configureAppchainBridge();
        break;
      case 5:
        await setL2Bridge();
        break;
      case 6:
        await declareERC20AppChain();
        break;
      case 7:
        await setERC20AppChain();
        break;
      // break here
      case 8:
        await declareERC20L2();
        break;
      case 9:
        await deployERC20L2();
        break;
      // only enroll starknet mainnnet usdc
      case 10:
        await enrollTokenL2();
        break;
      case 11:
        await activateTokenL2();
        break;
      case 12:
        await getAppchainToken();
        break;
      case 13:
      // setup ends here
      // down below is a setup to get a working ERC20 token on L2 to test with Gridy
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
