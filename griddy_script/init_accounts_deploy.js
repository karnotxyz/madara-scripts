// deploy-account.js
const { Account, ec, json, stark, Provider, hash, CallData, constants } = require("starknet");
const fs = require("fs");

async function deployAccount() {
  try {
    // Configure provider with your RPC URL
    const provider = new Provider({
      nodeUrl: "http://localhost:9944", 
    });


    console.log("Generating new private key...");
    // Generate a new private key (or you can use an existing one)
    const privateKey = stark.randomAddress();
    console.log("Private key (save this safely!):", privateKey);

    // Derive public key from private key
    const publicKey = ec.starkCurve.getStarkKey(privateKey);
    console.log("Public key:", publicKey);

    // The class hash of the OZ account contract you mentioned
    const contractClassHash = "0x1484c93b9d6cf61614d698ed069b3c6992c32549194fc3465258c2194734189";

    // Verify that the class hash is deployed before continuing
    console.log("Verifying class hash is deployed...");
    try {
      const contractClass = await provider.getClassByHash(contractClassHash);
      console.log("Class hash verified! Contract class is available on the network.");
    } catch (error) {
      console.error("Error: Contract class not found or not deployed with this hash.");
      console.error("Make sure the class hash is correct and deployed to the network you're using.");
      throw new Error("Contract class not available on the network");
    }
    // Prepare constructor calldata (for OpenZeppelin account)
    // For OZ accounts, this is typically just the public key
    const constructorCallData = CallData.compile({
      publicKey: publicKey,
    });

    // Calculate the contract address
    const contractAddress = hash.calculateContractAddressFromHash(
      publicKey,              // salt - typically the public key for uniqueness
      contractClassHash,      // class hash
      constructorCallData,    // constructor calldata
      0                       // deployer address is 0 for DEPLOY_ACCOUNT
    );

    console.log("Calculated contract address:", contractAddress);

    // Create a new Account object for the deployment transaction
    // This is a unique case where we create an Account instance for a contract that doesn't exist yet
    const accountToBeDeployed = new Account(
      provider,
      contractAddress,
      privateKey
    );

    // Determine the max fee (adjust as needed)
    const maxFee = "100000000000000"; // 0.0001 ETH in wei

    console.log("Deploying account contract...");
    // Execute the DEPLOY_ACCOUNT transaction
    const deployResponse = await accountToBeDeployed.deployAccount({
      classHash: contractClassHash,
      constructorCalldata: constructorCallData,
      addressSalt: publicKey,
      maxFee: maxFee,
    });

    console.log("Deploy account transaction hash:", deployResponse.transaction_hash);
    
    // Wait for the transaction to be mined
    console.log("Waiting for transaction to be mined...");
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    console.log("Account successfully deployed!");
    console.log("Account address:", contractAddress);

    // Save account info to a file
    const accountInfo = {
      address: contractAddress,
      publicKey: publicKey,
      privateKey: privateKey, // Consider removing this for production use
    };

    fs.writeFileSync("account-info.json", JSON.stringify(accountInfo, null, 2));
    console.log("Account information saved to account-info.json");

    return {
      address: contractAddress,
      txHash: deployResponse.transaction_hash,
    };
  } catch (error) {
    console.error("Error deploying account:", error);
    throw error;
  }
}

// Execute the deployment
deployAccount()
  .then((result) => {
    console.log("Deployment completed successfully.");
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
  });