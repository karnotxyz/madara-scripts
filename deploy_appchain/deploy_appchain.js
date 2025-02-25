import { Account, json, RpcProvider, CallData, hash, cairo, Contract } from "starknet";
import fs from "fs";
import path from "path";

// Configuration constants
const CONFIG = {
  ASSETS_PATH: "./assets",
  RPC: {
    NODE_URL: ""
  },
  OWNER: {
    ADDRESS: "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA",
  },
  DEPLOYER: {
    ADDRESS: "0x0204cA38b6435B5D45c4A15BDA4A27C4BFE65A4E152FF6bc032bD50F49c905C5",
    PRIVATE_KEY: ""
  },
  FEE: {
    // Using STARK token for fee payment
    TOKEN_ADDRESS: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK token address on Sepolia
  }
};

async function main() {
    // Create a new RPC provider object
    const provider = new RpcProvider({ nodeUrl: CONFIG.RPC.NODE_URL });

    // Create a new account object with fee options
    const deployer = new Account(
      provider, 
      CONFIG.DEPLOYER.ADDRESS, 
      CONFIG.DEPLOYER.PRIVATE_KEY,
     
    );

    console.log("Using deployer account:", CONFIG.DEPLOYER.ADDRESS);
    console.log("Using STARK token for fees:", CONFIG.FEE.TOKEN_ADDRESS);

    const basePath = path.join(CONFIG.ASSETS_PATH, `piltover_appchain`);

    // Load the compiled contract class
    const sierra = json.parse(fs.readFileSync(`${basePath}.contract_class.json`).toString("ascii"));
    const casm = json.parse(fs.readFileSync(`${basePath}.compiled_contract_class.json`).toString("ascii"));


    let class_hash =  hash.computeContractClassHash(sierra, casm);

    console.log("Contract class hash:", class_hash);

    const callData = new CallData(sierra.abi);
    const appChainCallData = callData.compile("constructor", {
      owner: CONFIG.OWNER.ADDRESS,
      state_root: "0x0", // felt252 value for state_root
      block_number: "0x0", // felt252 value for block_number
      block_hash: "0x0", // felt252 value for block_hash
    });

    console.log("sdnvs", appChainCallData);

    console.log("Deploying contract...");


    const deployResponse = await deployer.deploy({
      classHash: class_hash,
      constructorCalldata: appChainCallData,
    });

    const receipt = await this.account.waitForTransaction(deployResponse.transaction_hash);
    console.log('Contract Address:', deployResponse.contract_address[0]);
}

  //   // Declare and deploy with explicit fee specification
  //   const declareAndDeployResponse = await deployer.declareAndDeploy({
  //     contract: sierra,
  //     casm: casm,
  //     constructorCalldata: appChainCallData,
  //   });

  //   console.log("Transaction hash:", declareAndDeployResponse.deploy.transaction_hash);
  //   console.log("Waiting for transaction confirmation...");
    
  //   // Wait for transaction confirmation
  //   const receipt = await provider.waitForTransaction(declareAndDeployResponse.deploy.transaction_hash, {
  //     retryInterval: 2000, // Retry every 2 seconds
  //     maxRetries: 30       // Maximum retries (60 seconds total wait time)
  //   });

  //   console.log("Transaction confirmed!");
  //   console.log("Contract address:", declareAndDeployResponse.deploy.contract_address);
  //   console.log("Actual fee paid:", receipt.actual_fee);
    
  //   // Display full transaction details for debugging
  //   console.log("\nTransaction receipt details:");
  //   console.log(JSON.stringify(receipt, null, 2));
  // } catch (error) {
  //   console.error("Error in deployment process:");
  //   console.error(error);
    
  //   // More detailed error information for debugging
  //   if (error.message) {
  //     console.error("Error message:", error.message);
  //   }
  //   if (error.response) {
  //     console.error("Response error:", error.response);
  //   }
  // }

main().catch((error) => {
  console.error("Unhandled error in main function:");
  console.error(error);
  process.exit(1);
});


//  let's call update state on the contract : 
// appchain.cairo
// fn update_state(
//   ref self: ContractState,
//   snos_output: Span<felt252>,
//   layout_bridge_output: Span<felt252>,
//   onchain_data_hash: felt252,
//   onchain_data_size: u256,
// ) {
