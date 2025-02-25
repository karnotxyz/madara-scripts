import * as ethers from "ethers";
import * as starknet from "starknet";

// Configuration object replacing CLI arguments
const CONFIG = {
  eth_rpc_url: "http://localhost:8545",  // Replace with your Ethereum RPC URL
  starknet_rpc_url: "http://localhost:9944", // Replace with your StarkNet RPC URL
  l1_bridge_address: "0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6",  // Replace with your bridge contract address
  eth_token_address: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",  // Replace with your ETH token address
  num_accounts: 20,  // Number of accounts to create
  eth_private_key : "", // Replace with your Ethereum private key
  oz_account_cairo_1_class_hash : "0x1484c93b9d6cf61614d698ed069b3c6992c32549194fc3465258c2194734189", // Replace with your OZ account class hash
};

class AccountManager {
  constructor(eth_rpc_url, starknet_rpc_url) {
    // Initialize providers
    this.eth_provider = new ethers.JsonRpcProvider(eth_rpc_url);
    this.wallet = new ethers.Wallet(
      CONFIG.eth_private_key,
      this.eth_provider
    );
    this.starknet_provider = new starknet.RpcProvider({
      nodeUrl: starknet_rpc_url,
    });
  }

  async getAppChainBalance(address, eth_token_address) {
    const abi = [
      {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "account", type: "felt" }],
        outputs: [{ name: "balance", type: "Uint256" }],
        stateMutability: "view",
      },
    ];
    const ethContract = new starknet.Contract(
      abi,
      eth_token_address,
      this.starknet_provider
    );

    const balance = await ethContract.balanceOf(address);
    return balance.balance;
  }

  async bridgeToChain(l1_bridge_address, starknet_account_address, eth_token_address) {
    console.log(`🌉 Bridging funds to ${starknet_account_address}...`);
    const contract = new ethers.Contract(
    l1_bridge_address,
      ["function deposit(uint256, uint256)"],
      this.wallet
    );

    const initial_balance = await this.getAppChainBalance(
      starknet_account_address,
      eth_token_address
    );

    const tx = await contract.deposit(
      ethers.parseEther("100"),
      starknet_account_address,
      { value: ethers.parseEther("100.01") }
    );
    await tx.wait();
    console.log("✅ Successfully sent 1 ETH on L1 bridge");

    // Wait for funds to arrive on Starknet
    let counter = 10;
    while (counter--) {
      const final_balance = await this.getAppChainBalance(
        starknet_account_address,
        eth_token_address
      );
      if (final_balance > initial_balance) {
        console.log(
          "💰 Account balance:",
          (final_balance / 10n ** 18n).toString(),
          "ETH"
        );
        return true;
      }
      console.log("🔄 Waiting for funds to arrive on Starknet...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error("Failed to bridge funds to Starknet");
  }

  generateAccountKeys() {
    const privateKey = starknet.stark.randomAddress();
    const publicKey = starknet.ec.starkCurve.getStarkKey(privateKey);

    // Calculate the account address
    const accountConstructorCallData = starknet.CallData.compile({
      publicKey: publicKey,
    });
    const accountAddress = starknet.hash.calculateContractAddressFromHash(
      publicKey,
      CONFIG.oz_account_cairo_1_class_hash,
      accountConstructorCallData,
      0
    );

    return {
      address: accountAddress,
      privateKey: privateKey,
      publicKey: publicKey,
    };
  }

  async deployAccount(accountKeys) {
    console.log(`⚙️ Deploying account at ${accountKeys.address}...`);
    const account = new starknet.Account(
      this.starknet_provider,
      accountKeys.address,
      accountKeys.privateKey,
      "1"
    );

    const { transaction_hash } = await account.deployAccount({
      classHash: CONFIG.oz_account_cairo_1_class_hash,
      constructorCalldata: [accountKeys.publicKey],
      addressSalt: accountKeys.publicKey,
    });

    // Wait for deployment
    const receipt = await this.starknet_provider.waitForTransaction(transaction_hash);
    if (!receipt.isSuccess()) {
      throw new Error(`Failed to deploy account - ${transaction_hash}`);
    }
    console.log(`✅ Account deployed successfully - ${transaction_hash}`);
    return receipt;
  }
}

async function main() {
  // Validate configuration
  if (!CONFIG.eth_rpc_url || !CONFIG.starknet_rpc_url || !CONFIG.l1_bridge_address ||
      !CONFIG.eth_token_address || !CONFIG.num_accounts) {
    console.log("Error: Missing required configuration parameters");
    process.exit(1);
  }

  if (isNaN(CONFIG.num_accounts) || CONFIG.num_accounts <= 0) {
    console.log("Error: Number of accounts must be a positive integer");
    process.exit(1);
  }

  const manager = new AccountManager(CONFIG.eth_rpc_url, CONFIG.starknet_rpc_url);
  const accounts = [];

  console.log(`🚀 Creating and funding ${CONFIG.num_accounts} accounts...\n`);

  for (let i = 0; i < CONFIG.num_accounts; i++) {
    console.log(`\n📝 Processing account ${i + 1}/${CONFIG.num_accounts}`);

    try {
      // Generate account keys
      const accountKeys = manager.generateAccountKeys();

      // Bridge funds to the account
      await manager.bridgeToChain(CONFIG.l1_bridge_address, accountKeys.address, CONFIG.eth_token_address);

      // Deploy the account
      await manager.deployAccount(accountKeys);

      // Get final balance
      const balance = await manager.getAppChainBalance(accountKeys.address, CONFIG.eth_token_address);

      accounts.push({
        ...accountKeys,
        balance: balance.toString(),
      });

      console.log("\n✨ Account creation successful!");
      console.log("Address:", accountKeys.address);
      console.log("Private Key:", accountKeys.privateKey);
      console.log("Balance:", (BigInt(balance) / 10n ** 18n).toString(), "ETH");
      console.log("-".repeat(50));
    } catch (error) {
      console.error(`❌ Error processing account ${i + 1}:`, error.message);
    }
  }

  console.log("\n📊 Summary of created accounts:");
  accounts.forEach((account, index) => {
    console.log(`\nAccount ${index + 1}:`);
    console.log("Address:", account.address);
    console.log("Private Key:", account.privateKey);
    console.log("Balance:", (BigInt(account.balance) / 10n ** 18n).toString(), "ETH");
  });
}

main().catch(console.error);
