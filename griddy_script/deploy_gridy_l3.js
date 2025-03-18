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
  DEPLOYMENT_PER_SPAWNER: 88,
  MULTICALL_SIZE: 500,
  // MADARA DEVNET ACCOUNT #1 (SEQUENCER)
  SEQUENCER: {
    ADDRESS: "0x4482f92b9928cf03cb5b224292f470b00c2ac772a49422f9b51c507866d4708",
    PRIVATE_KEY: "0x02f7337975003c45650dcc585830e8c2f7439815e98fe520180cace15f28436e"
  },
  // MADARA DEVNET ACCOUNT #2 (EXECUTOR / OWNER)
  EXECUTOR: {
    ADDRESS: "0x70c15b0773c640b0956ded07386b0f7e787bc0254babb006f43a84765a64099",
    PRIVATE_KEY: "0x058ac3afb4ecbaff5bc29703f9f69ed779ac2c1879199e79ea6559d9fa9873ea"
  },
  GAME: {
    WIDTH: 1000,
    HEIGHT: 2000,
    NUM_DIAMONDS: 7300,
    NUM_BOMBS:70,
    MINING_POINTS: 10,
    DIAMOND_VALUE : 5000,
    BOMB_VALUE: 666
  },
  ASSETS_PATH: "./assets",
  CONTRACT_ADDRESSES: {
    GAME: "w",
    SPAWNERS: [
      "0x4b1858b51b856878890a229a5865daf98e4c1743a2c33de2f6b018f60ecc169",
      "0x228d6a466d4419d534b846852bcf11754dfc16f829b025ef42140bf111941e4",
      "0x67d51141a48d68b52fcdec65ea23311752242fa4946373f9b4e5a226a498313",
      "0xa9cc2ca22eb0c308ec5768b1685fa48bc58f568eecc2650360ced961776aed",
    ],
    BOTS : [
      "0x1fe1f1662662e42a50804dfeabed3c2dda9a1bd84fc7c7a2433d0f11fbb71c",
      "0x0599cc2f0a03ad3d44e8d10c745c8e4043a6ff861f726a0f8717ce7994afbed2",
      "0x03dfc4b55b90feee57b56af63405715be8f2ee2f5449a992dc7b67d3ae1ac9eb",
      "0x016943f8cc5b19cbd7640a8944ebeffa4f55fc5fd9bf95b50cfc339e326f6680",
      "0x0289aef1020c7327e2fc44041627164a03e0d79ac94f33ec36d7a9bd76fded20",
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
    console.log("Lengths:  " , result.diamond_locations.length, result.bomb_locations.length);
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
    },
    { maxFee: 0}

  );
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
      total_diamonds_and_bombs : (CONFIG.GAME.NUM_DIAMONDS + CONFIG.GAME.NUM_BOMBS),
      sequencer : CONFIG.SEQUENCER.ADDRESS,
    });
  }

  async getBlockTxns(){
    let x = this.provider.getEvents({
      from_block: {
        block_number : 450 
      },
      to_block:  {
        block_number : 451 
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

    // for (let i = 0; i < num_diamond_calls; i++) {
    //   const diamondsChunk = diamonds.slice(i * CONFIG.MULTICALL_SIZE, (i + 1) * CONFIG.MULTICALL_SIZE);
    //   const diamondCalls = diamondsChunk.map(diamond => {
    //     return gameContract.populate("update_block_points", [
    //       diamond.id,
    //       diamond.points
    //     ]);
    //   });
    //   const estimatedFee = await this.account.estimateInvokeFee(diamondCalls);

    //   const { transaction_hash } = await this.account.execute(
    //     diamondCalls,
    //     undefined,
    //     {
    //       maxFee: 0n
    //     }
    //   );

    //   const receipt = await this.account.waitForTransaction(transaction_hash);
    //   console.log("Diamonds slice ", i * CONFIG.MULTICALL_SIZE , "to ", (i + 1) * CONFIG.MULTICALL_SIZE, " updated! with transaction hash: ", receipt.transaction_hash);
    // }

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
          maxFee: 0n
        }
      );

      const receipt = await this.account.waitForTransaction(transaction_hash);
      console.log("Bomb slice ", i * CONFIG.MULTICALL_SIZE , "to ", (i + 1) * CONFIG.MULTICALL_SIZE, " updated! with transaction hash: ", receipt.transaction_hash);

    }
  }

  async declareAndDeployGameContract() {
      const gameCalldata = await this.prepareGameConstructorCalldata();
      const declareAndDeployResponse = await this.account.declareAndDeploy({
        contract: this.contracts.game.sierra,
        casm: this.contracts.game.casm,
        constructorCalldata: gameCalldata,
      },
      { maxFee: 0 }
    );
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
      classHash : await this.getGameClassHash(),
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
          maxFee: 0n
        }
      );
      const receipt = await this.account.waitForTransaction(transaction_hash);
      console.log("Bot deployment chunk ", i * CONFIG.MULTICALL_SIZE , "to ", (i + 1) * CONFIG.MULTICALL_SIZE, " submitted! with transaction hash: ", transaction_hash);
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
        maxFee: 0n
      }
    );

    const receipt = await this.account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }

 
  async  batchMine() {
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
              maxFee: 0n,
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
        maxFee: 0n
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
        maxFee: 0n
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
          await this.getBlockTxns();
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
    const botClassHash = await this.deployer.getGameClassHash();
    console.log("Bot Class Hash: ", botClassHash);
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
