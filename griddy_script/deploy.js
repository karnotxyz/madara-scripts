import { Account, json, RpcProvider, CallData, hash, cairo, Contract } from "starknet";
import fs from "fs";
import path from "path";
import readline from 'readline';

// Sleep helper function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuration constants
const CONFIG = {
  RPC: {
    NODE_URL: "http://localhost:9944"
  },
  DEPLOYMENT_PER_SPAWNER: 2,
  MULTICALL_SIZE: 500,
  // MADARA DEVNET ACCOUNT #1 (SEQUENCER)
  SEQUENCER: {
    ADDRESS: "0x6a80e88f7b1b6f5881ca195cf086ee0c4d04d7f4f08132a2f928727c10b9835",
    PRIVATE_KEY: "0x600fb50c28326eb96ca8919caca0ec23fc3672081c22873a3431f2314144315"
  },
  // MADARA DEVNET ACCOUNT #2 (EXECUTOR / OWNER)
  EXECUTOR: {
    ADDRESS: "0x6a80e88f7b1b6f5881ca195cf086ee0c4d04d7f4f08132a2f928727c10b9835",
    PRIVATE_KEY: "0x600fb50c28326eb96ca8919caca0ec23fc3672081c22873a3431f2314144315"
  },
  GAME: {
    WIDTH: 1000,
    HEIGHT: 2000,
    NUM_DIAMONDS: 1000,
    NUM_BOMBS: 0,
    MINING_POINTS: 0,
    DIAMOND_VALUE: 5000,
    BOMB_VALUE: 666
  },
  ASSETS_PATH: "./assets",
  CONTRACT_ADDRESSES: {
    GAME: "0x115139eaecaef315be1016192fb8bb90a0858c40fec31ed16ee359613f1437f",
    SPAWNERS: [
      "0x34012e3d77be3edfefa5e63e240a00c9b9f76b2d8503bf18fcf65ceeec68301",
      "0x100f7f17b659d998efd3e20e65c0312393a41384110bda74e9019572083da51",
      "0x77ea8c1b92d97961e30aa86b10c609b24b56f9595c6053e0aa1420b9dd0c67",
      "0x2205fb59dd919d37dbb266f242f31caad704130c6e5c770277bd2dcfd314157",
      "0x3d9ea30790c4689c67cafc2965ea7725f68f1e4cf06047319bd0ffdf673af12",
    ],
    BOTS: [
      "0x274aace8eb5e9bae0fccb855a05963dcc01cb58114e1aa7b2f2587c24d7d4cd",
      "0x665979c4927b957b6d9599621b813071919cfb9f277a7fb122b16940c0d93bf",
      "0x28bc1227a785763d749c61424d240267267449a217f460ec6c61e6917399cdf",
      "0x21478ab3313614d4e11fff3a68cc38f6661a4ae7b4ac8849982df83818e87c",
      "0x98a2e8a32dc8a2e55cba9d18967a06b3bff28fe90fbc14854b8cf97706bc4d",
      "0x1839a167076b711235f30c2391fcb7c3b7a71845171c87d428e2af9cf268e9f",
      "0x2e309a09f60e4388bba8121615372858e0f506b09151f5d7230d9330806b40b",
      "0x370ac7f510b7b1d64fd7322f788802ce8fb4e6254c55487e6ed2aa9c4bdf482",
      "0x7eccaa54e9190db4db1f1ed546b57f679c0639ff0af74abe91399b7bcb31484",
      "0x7257c9f40f0fa8b1c31bd8818f0a3fa60433fb695dac8cf59d46601b212783b",
    ],
  },
};


function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function generateRandomNumbers(width, height, count) {
  // Validate input
  const maxPossible = width * height;
  if (count > maxPossible) {
    throw new Error(`Cannot generate ${count} unique numbers within range of ${maxPossible}`);
  }

  // Create array of all possible numbers
  const allNumbers = Array.from({ length: maxPossible }, (_, i) => i);

  // Shuffle array using Fisher-Yates algorithm
  for (let i = allNumbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
  }

  // Get our random numbers
  const result = allNumbers.slice(0, count);

  // Extra validation to guarantee uniqueness
  const uniqueSet = new Set(result);
  if (uniqueSet.size !== count) {
    throw new Error('Internal error: Generated numbers are not unique');
  }

  // Validate range
  const inRange = result.every(num => num >= 0 && num < maxPossible);
  if (!inRange) {
    throw new Error('Internal error: Generated numbers outside valid range');
  }

  console.log("Bots will start from points : ", result);

  return result;
}

function generateGamePoints(width, height, diamondsCount, bombCount) {
  // Validate input
  if (width <= 0 || height <= 0) {
    throw new Error('Width and height must be positive numbers');
  }

  if (diamondsCount + bombCount > width * height) {
    throw new Error('Total number of points requested exceeds available spaces');
  }

  // Function to generate a random integer between min (inclusive) and max (inclusive)
  const getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // Function to convert point to string for easy comparison
  const pointToString = (point) => `${point[0]},${point[1]}`;

  // Set to keep track of used points
  const usedPoints = new Set();

  // Generate diamond locations
  const diamondLocations = [];
  while (diamondLocations.length < diamondsCount) {
    // Generate random x and y coordinates (0-based)
    const x = getRandomInt(0, width - 1);
    const y = getRandomInt(0, height - 1);
    const pointStr = pointToString([x, y]);

    // Only add point if it hasn't been used yet
    if (!usedPoints.has(pointStr)) {
      diamondLocations.push([x, y]);
      usedPoints.add(pointStr);
    }
  }

  // Generate bomb locations
  const bombLocations = [];
  while (bombLocations.length < bombCount) {
    const x = getRandomInt(0, width - 1);
    const y = getRandomInt(0, height - 1);
    const pointStr = pointToString([x, y]);

    // Only add point if it hasn't been used yet
    if (!usedPoints.has(pointStr)) {
      bombLocations.push([x, y]);
      usedPoints.add(pointStr);
    }
  }

  console.log("Diamond Locations: ", diamondLocations);
  console.log("Bomb Locations: ", bombLocations);

  return {
    diamond_locations: diamondLocations,
    bomb_locations: bombLocations
  };
}


// Contract loading utility
class ContractLoader {
  static loadContract(contractName) {
    const basePath = path.join(CONFIG.ASSETS_PATH, `gridy_${contractName}`);
    return {
      sierra: json.parse(fs.readFileSync(`${basePath}.contract_class.json`).toString("ascii")),
      casm: json.parse(fs.readFileSync(`${basePath}.compiled_contract_class.json`).toString("ascii"))
    };
  }
}

// Grid utilities
class GridUtils {
  static coordinatesToBlockId([x, y]) {
    return y * CONFIG.GAME.WIDTH + x;
  }

  static generateLocations() {
    const result = generateGamePoints(CONFIG.GAME.WIDTH, CONFIG.GAME.HEIGHT, CONFIG.GAME.NUM_DIAMONDS, CONFIG.GAME.NUM_BOMBS);
    console.log("Lengths:  ", result.diamond_locations.length, result.bomb_locations.length);
    return {
      diamonds: result.diamond_locations.map(loc => ({
        id: this.coordinatesToBlockId(loc),
        points: CONFIG.GAME.DIAMOND_VALUE
      })),
      bombs: result.bomb_locations.map(loc => ({
        id: this.coordinatesToBlockId(loc),
        points: CONFIG.GAME.BOMB_VALUE
      }))
    };
  }
}

class StarknetDeployer {
  constructor() {
    this.provider = new RpcProvider({ nodeUrl: CONFIG.RPC.NODE_URL });
    this.account = new Account(
      this.provider,
      CONFIG.EXECUTOR.ADDRESS,
      CONFIG.EXECUTOR.PRIVATE_KEY
    );

    // Load contracts
    this.contracts = {
      game: ContractLoader.loadContract('GameContract'),
      bot: ContractLoader.loadContract('BotContract')
    };
  }

  async getBotClassHash() {
    return hash.computeContractClassHash(
      this.contracts.bot.sierra,
      this.contracts.bot.casm
    );
  }

  async getGameClassHash() {
    return hash.computeContractClassHash(
      this.contracts.game.sierra,
      this.contracts.game.casm
    );
  }

  async declareContract(contract) {
    const declareResponse = await this.account.declare({
      contract: contract.sierra,
      casm: contract.casm,
    });
    console.log("Contract declared with classHash =", declareResponse.class_hash);
    return declareResponse;
  }

  async prepareGameConstructorCalldata() {
    const botClassHash = await this.getBotClassHash();
    const gameClassHash = await this.getGameClassHash();

    console.log("Game Class Hash: ", gameClassHash);

    const callData = new CallData(this.contracts.game.sierra.abi);
    return callData.compile("constructor", {
      executor: CONFIG.EXECUTOR.ADDRESS,
      bot_contract_class_hash: botClassHash,
      bomb_value: CONFIG.GAME.BOMB_VALUE,
      mining_points: CONFIG.GAME.MINING_POINTS,
      grid_width: CONFIG.GAME.WIDTH,
      grid_height: CONFIG.GAME.HEIGHT,
      total_diamonds_and_bombs: (CONFIG.GAME.NUM_DIAMONDS + CONFIG.GAME.NUM_BOMBS),
      sequencer: CONFIG.SEQUENCER.ADDRESS,
    });
  }

  async getBlockTxns() {
    let x = this.provider.getEvents({
      from_block: {
        block_number: 450
      },
      to_block: {
        block_number: 451
      },
      address: CONFIG.CONTRACT_ADDRESSES.GAME,
      keys: [["0xd5efc9cfb6a4f6bb9eae0ce39d32480473877bb3f7a4eaa3944c881a2c8d25"]],
      chunk_size: 1000,
    }).then((events) => {
      console.log("BlockTxn events: ", events);
    }).catch((error) => {
      console.log("Error: ", error);
    });
    return x;
  }


  async updateBlockPoints() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const { diamonds, bombs } = GridUtils.generateLocations();

    // call contract's update_block_points in a multicall set of  500 only diamonds

    let num_diamond_calls = (diamonds.length / CONFIG.MULTICALL_SIZE) >> 0;

    if (diamonds.length % CONFIG.MULTICALL_SIZE > 0) {
      num_diamond_calls++;
    }

    for (let i = 0; i < num_diamond_calls; i++) {
      const diamondsChunk = diamonds.slice(i * CONFIG.MULTICALL_SIZE, (i + 1) * CONFIG.MULTICALL_SIZE);
      const diamondCalls = diamondsChunk.map(diamond => {
        return gameContract.populate("update_block_points", [
          diamond.id,
          diamond.points
        ]);
      });
      const estimatedFee = await this.account.estimateInvokeFee(diamondCalls);

      const { transaction_hash } = await this.account.execute(
        diamondCalls,
        undefined,
        {
          maxFee: estimatedFee.suggestedMaxFee
        }
      );

      const receipt = await this.account.waitForTransaction(transaction_hash);
      console.log("Diamonds slice ", i * CONFIG.MULTICALL_SIZE, "to ", (i + 1) * CONFIG.MULTICALL_SIZE, " updated! with transaction hash: ", receipt.transaction_hash);
    }

    // call contract's update_block_points in a multicall set of  500 only bombs
    let num_bomb_calls = (bombs.length / CONFIG.MULTICALL_SIZE) >> 0;
    if (bombs.length % CONFIG.MULTICALL_SIZE > 0) {
      num_bomb_calls++;
    }

    for (let i = 0; i < num_bomb_calls; i++) {
      const bombsChunk = bombs.slice(i * CONFIG.MULTICALL_SIZE, (i + 1) * CONFIG.MULTICALL_SIZE);
      const bombCalls = bombsChunk.map(bomb => {
        return gameContract.populate("update_block_points", [
          bomb.id,
          bomb.points
        ]);
      });
      const estimatedFee = await this.account.estimateInvokeFee(bombCalls);

      const { transaction_hash } = await this.account.execute(
        bombCalls,
        undefined,
        {
          maxFee: estimatedFee.suggestedMaxFee
        }
      );

      const receipt = await this.account.waitForTransaction(transaction_hash);
      console.log("Bomb slice ", i * CONFIG.MULTICALL_SIZE, "to ", (i + 1) * CONFIG.MULTICALL_SIZE, " updated! with transaction hash: ", receipt.transaction_hash);

    }
  }

  async declareAndDeployGameContract() {
    const gameCalldata = await this.prepareGameConstructorCalldata();
    // console.log("Game constructor calldata:", gameCalldata);
    // console.log("Game constructor calldata:", this.contracts.game.sierra, this.contracts.game.casm,  );
    const declareAndDeployResponse = await this.account.declareAndDeploy({
      contract: this.contracts.game.sierra,
      casm: this.contracts.game.casm,
      constructorCalldata: gameCalldata,
    });
    const receipt = await this.account.waitForTransaction(declareAndDeployResponse.deploy.transaction_hash);
    console.log('Contract Address:', declareAndDeployResponse.deploy.contract_address);
    console.log('Transaction Hash:', declareAndDeployResponse.deploy.transaction_hash);
    return receipt;
  }

  async declareGameContract() {
    const declareResponse = await this.declareContract(this.contracts.game);
    return declareResponse;
  }

  async deployGameContract() {
    const gameCalldata = await this.prepareGameConstructorCalldata();
    const deployResponse = await this.account.deploy({
      classHash: await this.getGameClassHash(),
      constructorCalldata: gameCalldata,
    });
    const receipt = await this.account.waitForTransaction(deployResponse.transaction_hash);
    console.log('Game Contract Address:', deployResponse.contract_address[0]);
    return deployResponse;
  }

  async declareBotContract() {
    const declareResponse = await this.declareContract(this.contracts.bot);
    return declareResponse;
  }

  async deployBotHelper(spawned_by, start_point, gameContract) {
    // Instead of executing, just return the call data
    return gameContract.populate("deploy_bot", [
      spawned_by,
      cairo.felt(start_point)
    ]);
  }

  async deployMultipleBots() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    // Generate random points for all bots
    const points = generateRandomNumbers(
      CONFIG.GAME.WIDTH,
      CONFIG.GAME.HEIGHT,
      (CONFIG.CONTRACT_ADDRESSES.SPAWNERS.length * CONFIG.DEPLOYMENT_PER_SPAWNER)
    );

    // Create array to hold all calls
    let calls = [];

    // Prepare all deployment calls
    for (let i = 0; i < CONFIG.CONTRACT_ADDRESSES.SPAWNERS.length; i++) {
      const spawner = CONFIG.CONTRACT_ADDRESSES.SPAWNERS[i];
      for (let j = 0; j < CONFIG.DEPLOYMENT_PER_SPAWNER; j++) {
        const deployCall = await this.deployBotHelper(spawner, points[i * CONFIG.DEPLOYMENT_PER_SPAWNER + j], gameContract);
        calls.push(deployCall);
      }
    }

    console.log(`\n🤖 Preparing to deploy ${calls.length} bots in a using multicall...`);

    // Randomly sort the calls array
    calls = shuffle(calls);

    // break calls into chunks of multicall size and execute
    let num_calls = (calls.length / CONFIG.MULTICALL_SIZE) >> 0;
    if (calls.length % CONFIG.MULTICALL_SIZE > 0) {
      num_calls++;
    }

    for (let i = 0; i < num_calls; i++) {
      const callsChunk = calls.slice(i * CONFIG.MULTICALL_SIZE, (i + 1) * CONFIG.MULTICALL_SIZE);
      const estimatedFee = await this.account.estimateInvokeFee(callsChunk);
      const { transaction_hash } = await this.account.execute(
        callsChunk,
        undefined,
        {
          maxFee: estimatedFee.suggestedMaxFee
        }
      );
      const receipt = await this.account.waitForTransaction(transaction_hash);
      console.log("Bot deployment chunk ", i * CONFIG.MULTICALL_SIZE, "to ", (i + 1) * CONFIG.MULTICALL_SIZE, " submitted! with transaction hash: ", transaction_hash);
    }
    return;
  }

  async callMine() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const deployCall = [
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[0],
        cairo.felt(1)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[1],
        cairo.felt(2)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[2],
        cairo.felt(3)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[3],
        cairo.felt(4)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[4],
        cairo.felt(5)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[0],
        cairo.felt(6)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[1],
        cairo.felt(7)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[2],
        cairo.felt(8)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[3],
        cairo.felt(9)
      ]),
      gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[4],
        cairo.felt(10)
      ])
    ];

    const estimatedFee = await this.account.estimateInvokeFee(deployCall);
    con

    const { transaction_hash } = await this.account.execute(
      deployCall,
      undefined,
      {
        maxFee: estimatedFee.suggestedMaxFee
      }
    );

    const receipt = await this.account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async batchMine() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    // Get the starting nonce as string
    const startNonce = await this.account.getNonce();
    const startNonceNumber = parseInt(startNonce);

    // Array to store all transaction promises
    const transactionPromises = [];

    const botsLength = CONFIG.CONTRACT_ADDRESSES.BOTS.length;
    let calls = [];
    // Use traditional for loop for better nonce control
    for (let i = 0; i < botsLength; i++) {

      // Cycle through bots 0-4
      const botIndex = i;

      const call = gameContract.populate("mine", [
        CONFIG.CONTRACT_ADDRESSES.BOTS[botIndex],
        cairo.felt(i * 7)
      ]);

      calls.push(call);
    }

    for (let i = 0; i < botsLength; i++) {
      await sleep(2);

      const nonce = (startNonceNumber + i).toString();

      // Create transaction promise
      const _ = this.account.execute(
        [calls[i]],
        undefined,
        {
          maxFee: 420n,
          nonce
        }
      );
    }

    return
  }

  async callIsBotAlive() {
    const botContract = new Contract(
      this.contracts.bot.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.BOTS[0],
      this.provider
    );

    const invokeCall = botContract.populate("get_owner", [
    ]);

    // const estimatedFee = await this.account.estimateInvokeFee(deployCall);

    const { transaction_hash } = await this.account.execute(
      invokeCall,
      undefined,
      // {
      //   maxFee: estimatedFee.suggestedMaxFee
      // }
    );

    const receipt = await this.account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async disableGameContract() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const disableCall = gameContract.populate("disable_contract");
    const estimatedFee = await this.account.estimateInvokeFee(disableCall);

    const { transaction_hash } = await this.account.execute(
      disableCall,
      undefined,
      {
        maxFee: estimatedFee.suggestedMaxFee
      }
    );

    const receipt = await this.account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async enableGameContract() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const enableCall = gameContract.populate("enable_contract");
    const estimatedFee = await this.account.estimateInvokeFee(enableCall);

    const { transaction_hash } = await this.account.execute(
      enableCall,
      undefined,
      {
        maxFee: estimatedFee.suggestedMaxFee
      }
    );

    const receipt = await this.account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }
}


class DeploymentCLI {
  constructor() {
    this.deployer = new StarknetDeployer();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async showMenu() {
    console.log('\n🚀 Starknet Deployment Menu\n');
    console.log('-1. Declare and Deploy Game Contract');
    console.log('0. Declare Game Contract');
    console.log('1. Deploy Game Contract');
    console.log('2. Add Block Points to Game Contract');
    console.log('3. Enable Game Contract');
    console.log('4. Declare Bot Contract');
    console.log('5. Deploy Multiple Bots');
    console.log('6. Call Mine');
    console.log('7. Get Class Hash');
    console.log('8. Disable Game Contract');
    console.log("9. Check is bot alive")
    console.log('10. Exit');

    console.log('\nSelect an option (1-8):');
  }

  async handleUserInput(input) {
    try {
      switch (input) {
        case '-1':
          await this.declareAndDeployGameContract();
          break;
        case '0':
          await this.declareGame();
          break;
        case '1':
          await this.deployGame();
          break;
        case '2':
          await this.updateBlockPoints();
          break;
        case '3':
          await this.enableGame();
          break;
        case '4':
          await this.declareBot();
          break;
        case '5':
          await this.deployMultipleBots();
          break;
        case '6':
          await this.callMine();
          break;
        case '7':
          await this.getClassHash();
          break;
        case '8':
          await this.disableGame();
          break;
        case '9':
          await this.callIsBotAlive();
          break;
        case '10':
          console.log('\nExiting...');
          this.rl.close();
          process.exit(0);

        default:
          console.log('\n❌ Invalid option. Please try again.');
      }
    } catch (error) {
      console.error('\n❌ Operation failed:', error);
    }

    await this.continuePrompt();
  }


  async declareAndDeployGameContract() {
    console.log('\n📦 Declaring and Deploying Game Contract...');
    const result = await this.deployer.declareAndDeployGameContract();
    console.log('✅ Game Contract declared and deployed successfully!');
  }

  async declareGame() {
    console.log('\n📦 Declaring Game Contract...');
    const result = await this.deployer.declareGameContract();
    console.log('Class Hash:', result.class_hash);
    console.log('Transaction Hash:', result.transaction_hash);
    console.log('✅ Game Contract declared successfully!');
  }

  async deployGame() {
    console.log('\n📦 Deploying Game Contract...');
    const result = await this.deployer.deployGameContract();
    console.log('✅ Game Contract deployed successfully!');
  }


  async getBlockTxns() {
    console.log('\n📦 Getting Block Transactions...')
    let x = await this.deployer.getBlockTxns();
    console.log('✅ Block Transactions fetched successfully!');
  }




  async updateBlockPoints() {
    console.log('\n📦 Adding Block Points...');
    const result = await this.deployer.updateBlockPoints();
    console.log('✅ Added Block Points successfully!');
  }

  async declareBot() {
    console.log('\n📝 Declaring Bot Contract...');
    const result = await this.deployer.declareBotContract();
    console.log('Class Hash:', result.class_hash);
    console.log('Transaction Hash:', result.transaction_hash);
    console.log('✅ Bot Contract declared successfully!');

  }

  async enableGame() {
    console.log('\n🔓 Enabling Game Contract...');
    const result = await this.deployer.enableGameContract();
    console.log('✅ Game Contract enabled successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async disableGame() {
    console.log('\n🔓 Disabling Game Contract...');
    const result = await this.deployer.disableGameContract();
    console.log('✅ Game Contract disabled successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async callIsBotAlive() {
    console.log('\n🔓 Calling Is Bot Alive...');
    const result = await this.deployer.callIsBotAlive();
    console.log('✅ Called Is Bot Alive!');
    console.log('Transaction Hash:', result);
  }

  async deployMultipleBots() {
    console.log('\n🤖 Deploying Bot...');
    const result = await this.deployer.deployMultipleBots();
    console.log('✅ Bot deployed successfully!');
  }

  async callMine() {
    console.log('\n🤖 Calling Mine...');
    const result = await this.deployer.batchMine();
    console.log('✅ Mined successfully!');
    console.log('Transaction Hash:', result.transaction_hash);

  }

  async getClassHash() {
    const botClassHash = await this.deployer.getBotClassHash();
    const gameClassHash = await this.deployer.getGameClassHash();

    console.log("Bot Class Hash: ", botClassHash);
    console.log("Game Class Hash: ", gameClassHash);
  }

  async continuePrompt() {
    return new Promise((resolve) => {
      this.rl.question('\nPress Enter to continue...', () => {
        this.start();
        resolve();
      });
    });
  }

  async start() {
    await this.showMenu();
    this.rl.question('', async (input) => {
      await this.handleUserInput(input);
    });
  }
}

// Replace the original main function with this:
async function main() {
  const cli = new DeploymentCLI();
  console.log('\nWelcome to Starknet Deployment CLI');
  console.log('=================================\n');
  await cli.start();
}

// Execute the CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
