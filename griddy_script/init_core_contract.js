const starknet = require("starknet");
const ethers = require("ethers");

const CONFIG = {
  start_block_number: 277,
  core_contract_address: "0x4e3b4a7a18ed67c4aaa13a6df00c731e925afd7a",
  l1Url: "",
  nodeUrl: "https://madara-apex-demo.karnot.xyz/",
  eth_private_key: "",
}

// Due to restrictions in SNOS at the moment (as it's designed for Sepolia right now),
// we need to skip the starting few blocks from running on SNOS.
// This function overrides the state on the core contract to the block after which we
// can run SNOS
async function overrideStateOnCoreContract(
  wallet,
  starknet_provider,
  block_number,
  core_contract_address
) {

  console.log("🔍 Fetching state update for block number", block_number);
  return;
  let state_update = await starknet_provider.getStateUpdate(block_number);
  let abi = [
    {
      type: "function",
      name: "updateStateOverride",
      inputs: [
        {
          name: "globalRoot",
          type: "uint256",
          internalType: "uint256",
        },
        {
          name: "blockNumber",
          type: "int256",
          internalType: "int256",
        },
        {
          name: "blockHash",
          type: "uint256",
          internalType: "uint256",
        },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ];

  const contract = new ethers.Contract(core_contract_address, abi, wallet);
  const tx = await contract.updateStateOverride(
    state_update.new_root,
    block_number,
    state_update.block_hash
  );
  const receipt = await tx.wait();
  if (!receipt.status) {
    console.log("❌ Failed to override state on core contract");
    process.exit(1);
  }
  console.log("✅ Successfully overridden state on core contract");
  return receipt;
}


async function main() {
  const eth_provider = new ethers.JsonRpcProvider(
    CONFIG.l1Url
  );
  const wallet = new ethers.Wallet(
    CONFIG.eth_private_key,
    eth_provider
  );

  const starknet_provider = new starknet.RpcProvider({
    nodeUrl: CONFIG.nodeUrl,
  });

  let result = await overrideStateOnCoreContract(
    wallet,
    starknet_provider,
    CONFIG.start_block_number - 1,
    CONFIG.core_contract_address);
}


main().catch((error) => { console.error(error); process.exit(1); });