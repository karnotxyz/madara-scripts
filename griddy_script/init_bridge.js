import { Account, json, RpcProvider, CallData, hash, cairo, Contract, RPC } from "starknet";
import fs from "fs";
import path from "path";
import readline from 'readline';

// Sleep helper function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuration constants
const CONFIG = {
  L3 : {
  RPC_URL: "https://pathfinder-gridy.karnot.xyz",
  ACCOUNT: {
    ADDRESS: "0x6a7603fe7e7b3a4f7eb33ed6cea0e661c6057f0abff07afbd391488f4e05bcb",
    PRIVATE_KEY: ""
  },
  },
  L2 : {
    RPC_URL: "http://localhost:8545",
    ACCOUNT: {
      ADDRESS: "0x6a7603fe7e7b3a4f7eb33ed6cea0e661c6057f0abff07afbd391488f4e05bcb",
      PRIVATE_KEY: ""
    }
  },
};

function deploy_bridge_l2() {
   const gameContract = new Contract(
        this.contracts.game.sierra.abi,
        CONFIG.CONTRACT_ADDRESSES.GAME,
        this.provider
      );
}

function deploy_bridge_l3() {
   const gameContract = new Contract(
        this.contracts.game.sierra.abi,
        CONFIG.CONTRACT_ADDRESSES.GAME,
        this.provider
      );
}


async function main () {
  console.log("Deploying the bridge contracts...");

  console.log("Deploying the bridge contract on L2...");
  // Deploy the bridge contract on L2
  deploy_bridge_l2();

  console.log("Deployed the bridge contract on L2");
  await sleep(2);
  console.log("Deploying the bridge contract on L3...");

  // Deploy the bridge contract on L3
  deploy_bridge_l3();
  console.log("Deployed the bridge contract on L3");
}

// Execute the CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
