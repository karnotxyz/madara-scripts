import { Account, json, RpcProvider, CallData, hash, cairo, Contract } from "starknet";
import fs from "fs";
import path from "path";
import readline from 'readline';

// Sleep helper function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuration constants
const CONFIG = {
  RPC: {
    NODE_L3_URL: "https://madara-l2-l3.karnot.xyz",
    NODE_L2_URL: "https://starknet-sepolia.g.alchemy.com/v2/yUgd-DT4wZ1xtr46xo5yj4FpJEa47r9T"
  },
  DEPLOYMENT_PER_SPAWNER: 1,
  MULTICALL_SIZE: 500,
  // MADARA DEVNET ACCOUNT #1 (SEQUENCER)
  SEQUENCER: {
    ADDRESS: "0x12e8bd1bf5576d183c4ecf6428ef4743414c0f9df55e419ce9f7c503fda5d36",
    PRIVATE_KEY: "0x0163b9968dbd7a17769cc085834efe2554d4d2bd053bf3a28d64adf33122e686"
  },
  L2_ACCOUNT: {
    ADDRESS: "0x0467C4Dc308a65C3247B0907a9A0ceE780704863Bbe38938EeBE3Ab3be783FbA",
    PRIVATE_KEY: "0x02d7c1cdf03eaf767dd920b478b90067320c52bcd450f6c77a1057740486f4db",
  },
  // MADARA DEVNET ACCOUNT #2 (EXECUTOR / OWNER)
  EXECUTOR: {
    ADDRESS: "0x12e8bd1bf5576d183c4ecf6428ef4743414c0f9df55e419ce9f7c503fda5d36",
    PRIVATE_KEY: "0x0163b9968dbd7a17769cc085834efe2554d4d2bd053bf3a28d64adf33122e686"
  },
  GAME: {
    WIDTH: 10,
    HEIGHT: 10,
    // NUM_DIAMONDS: 10,
    NUM_DIAMONDS: 1,
    // NUM_BOMBS: 20,
    NUM_BOMBS: 0,
    MINING_POINTS: 0,
    DIAMOND_VALUE: 200,
    // DIAMOND_VALUE: 1,
    BOMB_VALUE: 666,
    BOOT_AMOUNT: 10n ** 15n,
    // my game token l3 address
    CURRENCY: "0x5127cd69701df1736ccd883e9216b54e4ade825f28c8943d2fc9244ddf4175",
  },
  ASSETS_PATH: "./assets/",
  CONTRACT_ADDRESSES: {
    L2_BRIDGE: "0x422dd5fe05931e677c0dcbb74ea057874ba4035c5d5784ea626200b7cfc702",
    GAME: "0x64f1161aa2e77141f04824ce1b2b2dea1a24aac19678d065a043f3e50b31928",
    L3_REGISTRY: "0x522e05107498977d25355b696157b8a91ff32f782f40512bded82f9140d4565",
    APPCHAIN_BRIDGE: "0x8ff0d8c01af0b9e5ab904f0299e6ae3a94b28c680b821ab02b978447d2da67",
    SPAWNERS: [
      "0x61bcf2cfcbf3893eb4d82c51b26881377d24a24e2ef16dada6979f227955701",
      "0x2aaa7d3608724da993ee4876628c88286efdc82a6066feaf3ffb39a2fb5460c",
      "0x2a9043db66a4ad10997b04ab1432bb2880b79b571239dbe35761737684663a1",
      "0x43062518806f9f67e66765619fcee6d7fbca41e3a8cf0ebc23e4adb9eed19e2",
    ],
    BOTS: [
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
    // const x = getRandomInt(0, width - 1);
    // const y = getRandomInt(0, height - 1);

    // Magic Diamonds: [ 569, 7433 ],  [ 700, 7554 ],  [ 222, 1723 ]
    const x = 4;
    const y = 4;
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
    this.provider = new RpcProvider({
      nodeUrl: CONFIG.RPC.NODE_L3_URL,
      // feeMarginPercentage : {
      // l1BoundMaxAmount: 0 ,
      // l1BoundMaxPricePerUnit: 0 ,
      // maxFee: 0
      // },
    });
    this.l3_account = new Account(
      this.provider,
      CONFIG.SEQUENCER.ADDRESS,
      CONFIG.SEQUENCER.PRIVATE_KEY,
      undefined,
      "0x3"
    );

    this.l2_account = new Account(
      new RpcProvider({ nodeUrl: CONFIG.RPC.NODE_L2_URL }),
      CONFIG.L2_ACCOUNT.ADDRESS,
      CONFIG.L2_ACCOUNT.PRIVATE_KEY,
      undefined,
      "0x3"
    );

    // Load contracts
    this.contracts = {
      game: ContractLoader.loadContract('GameContract'),
      bot: ContractLoader.loadContract('BotContract'),
      l3Registry: ContractLoader.loadContract('l3_registry'),
      l2Registry: ContractLoader.loadContract('l2_registry'),
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
    const declareResponse = await this.l3_account.declare({
      contract: contract.sierra,
      casm: contract.casm,
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
    console.log("Contract declared with classHash =", declareResponse.class_hash);
    return declareResponse;
  }

  // #[constructor]
  // fn constructor(
  //     ref self: ContractState,
  //     executor: ContractAddress,
  //     bot_contract_class_hash: ClassHash,
  //     bomb_value: u128,
  //     diamond_points: u128,
  //     mining_points: u128,
  //     grid_width: u128,
  //     grid_height: u128,
  //     total_diamonds_and_bombs: u128,
  //     sequencer: ContractAddress,
  //     boot_amount: felt252,
  // ) {
  async prepareGameConstructorCalldata() {
    const botClassHash = await this.getBotClassHash();
    const gameClassHash = await this.getGameClassHash();

    console.log("Game Class Hash: ", gameClassHash);

    const callData = new CallData(this.contracts.game.sierra.abi);
    return callData.compile("constructor", {
      executor: CONFIG.SEQUENCER.ADDRESS,
      bot_contract_class_hash: botClassHash,
      bomb_value: CONFIG.GAME.BOMB_VALUE,
      diamond_points: CONFIG.GAME.DIAMOND_VALUE,
      mining_points: CONFIG.GAME.MINING_POINTS,
      grid_width: CONFIG.GAME.WIDTH,
      grid_height: CONFIG.GAME.HEIGHT,
      total_diamonds_and_bombs: (CONFIG.GAME.NUM_DIAMONDS + CONFIG.GAME.NUM_BOMBS),
      sequencer: CONFIG.SEQUENCER.ADDRESS,
      boot_amount: CONFIG.GAME.BOOT_AMOUNT,
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
      const estimatedFee = await this.l3_account.estimateInvokeFee(diamondCalls);

      const { transaction_hash } = await this.l3_account.execute(
        diamondCalls,
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

      const receipt = await this.l3_account.waitForTransaction(transaction_hash);
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
      const estimatedFee = await this.l3_account.estimateInvokeFee(bombCalls);

      const { transaction_hash } = await this.l3_account.execute(
        bombCalls,
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

      const receipt = await this.l3_account.waitForTransaction(transaction_hash);
      console.log("Bomb slice ", i * CONFIG.MULTICALL_SIZE, "to ", (i + 1) * CONFIG.MULTICALL_SIZE, " updated! with transaction hash: ", receipt.transaction_hash);

    }
  }

  async declareAndDeployGameContract() {
    const gameCalldata = await this.prepareGameConstructorCalldata();
    const gameClassHash = await this.getGameClassHash();
    console.log("Game Class Hash in declareAndDeployGameContract: ", gameClassHash);
    const declareAndDeployResponse = await this.l3_account.declareAndDeploy(
      {
        classHash: gameClassHash,
        constructorCalldata: gameCalldata,
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
    const receipt = await this.l3_account.waitForTransaction(declareAndDeployResponse.transaction_hash);
    console.log('Contract Address:', declareAndDeployResponse.contract_address);
    console.log('Transaction Hash:', declareAndDeployResponse.transaction_hash);
    return receipt;
  }

  async declareAndDeployL3RegistryContract() {
    const declareAndDeployResponse = await this.l3_account.declareAndDeploy({
      contract: this.contracts.l3Registry.sierra,
      casm: this.contracts.l3Registry.casm,
      constructorCalldata: [CONFIG.CONTRACT_ADDRESSES.GAME, CONFIG.SEQUENCER.ADDRESS],
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
    const receipt = await this.l3_account.waitForTransaction(declareAndDeployResponse.deploy.transaction_hash);
    console.log('Transaction Hash:', declareAndDeployResponse.deploy.transaction_hash);
    console.log('Contract Address:', declareAndDeployResponse.deploy.contract_address);

    return receipt;
  }

  async declareAndDeployL2RegistryContract() {
    const declareAndDeployResponse = await this.l2_account.declareAndDeploy({
      contract: this.contracts.l2Registry.sierra,
      casm: this.contracts.l2Registry.casm,
      constructorCalldata: [CONFIG.CONTRACT_ADDRESSES.L2_BRIDGE, CONFIG.CONTRACT_ADDRESSES.L3_REGISTRY, CONFIG.L2_ACCOUNT.ADDRESS],
    });
    const receipt = await this.l2_account.waitForTransaction(declareAndDeployResponse.deploy.transaction_hash);
    console.log('Transaction Hash:', declareAndDeployResponse.deploy.transaction_hash);
    console.log('Contract Address:', declareAndDeployResponse.deploy.contract_address);
    return receipt;
  }

  async declareGameContract() {
    const declareResponse = await this.declareContract(this.contracts.game);
    return declareResponse;
  }

  async deployGameContract() {
    const gameCalldata = await this.prepareGameConstructorCalldata();
    const deployResponse = await this.l3_account.deploy({
      classHash: await this.getGameClassHash(),
      constructorCalldata: gameCalldata,
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
    const receipt = await this.l3_account.waitForTransaction(deployResponse.transaction_hash);
    console.log('Game Contract Address:', deployResponse.contract_address[0]);
    return deployResponse;
  }

  async upgradeGameContract() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );
    const upgradeCall = gameContract.populate("upgrade", {
      new_class_hash: await this.getGameClassHash()
    });
    const estimatedFee = await this.l3_account.estimateInvokeFee(upgradeCall);
    const { transaction_hash } = await this.l3_account.execute(
      upgradeCall,
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
    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };

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
      const estimatedFee = await this.l3_account.estimateInvokeFee(callsChunk);
      const { transaction_hash } = await this.l3_account.execute(
        callsChunk,
        undefined,
        {
          maxFee: 0n
        }
      );
      const receipt = await this.l3_account.waitForTransaction(transaction_hash);
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

    const estimatedFee = await this.l3_account.estimateInvokeFee(deployCall);
    con

    const { transaction_hash } = await this.l3_account.execute(
      deployCall,
      undefined,
      {
        maxFee: 0n
      }
    );

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async batchMine() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    // Get the starting nonce as string
    const startNonce = await this.l3_account.getNonce();
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
      const _ = this.l3_account.execute(
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

    // const estimatedFee = await this.l3_account.estimateInvokeFee(deployCall);

    const { transaction_hash } = await this.l3_account.execute(
      invokeCall,
      undefined,
      // {
      //   maxFee: estimatedFee.suggestedMaxFee
      // }
    );

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async disableGameContract() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const disableCall = gameContract.populate("disable_contract");
    const estimatedFee = await this.l3_account.estimateInvokeFee(disableCall);

    const { transaction_hash } = await this.l3_account.execute(
      disableCall,
      undefined,
      {
        maxFee: 0n,
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

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async updateGameAddressOnL3Registry() {
    const l3_registry = new Contract(
      this.contracts.l3Registry.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.L3_REGISTRY,
      this.provider
    );
    const updateCall = l3_registry.populate("set_gridy_address", [CONFIG.CONTRACT_ADDRESSES.GAME]);

    const { transaction_hash } = await this.l3_account.execute(
      updateCall,
      undefined,
      {
        maxFee: 0n,
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

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async upgradeL3Registry() {
    const l3_registry = new Contract(
      this.contracts.l3Registry.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.L3_REGISTRY,
      this.l3_account
    );
    const upgradeCall = l3_registry.populate("upgrade", ["0x3a3ecd5711ec18803b6bf8297feb5b9320dafd10a78f7451b40dba841fb86ce"]);

    const { transaction_hash } = await this.l3_account.execute(
      upgradeCall,
      undefined,
      {
        maxFee: 0n
      }
    );

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }


  async enableGameContract() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const enableCall = gameContract.populate("enable_contract");
    const estimatedFee = await this.l3_account.estimateInvokeFee(enableCall);

    const { transaction_hash } = await this.l3_account.execute(
      enableCall,
      undefined,
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

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }

  async setGameCurrency(game_currency) {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const setCurrencyCall = gameContract.populate("set_game_currency", [
      game_currency
    ]);

    const { transaction_hash } = await this.l3_account.execute(
      setCurrencyCall,
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

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }

  async setAppchainBridge() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const setBridgeCall = gameContract.populate("set_appchain_bridge", [
      CONFIG.CONTRACT_ADDRESSES.APPCHAIN_BRIDGE
    ]);

    const { transaction_hash } = await this.l3_account.execute(
      setBridgeCall,
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

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }

  async withdrawGameCurrency(recipientAddress, amount) {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const withdrawCall = gameContract.populate("withdraw_game_currency", [
      amount,
      recipientAddress
    ]);

    const { transaction_hash } = await this.l3_account.execute(
      withdrawCall,
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

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
    return { transaction_hash, receipt };
  }

  async updateBootAmount() {
    const gameContract = new Contract(
      this.contracts.game.sierra.abi,
      CONFIG.CONTRACT_ADDRESSES.GAME,
      this.provider
    );

    const updateBootAmountCall = gameContract.populate("update_boot_amount", [
      10n ** 15n
    ]);

    const { transaction_hash } = await this.l3_account.execute(
      updateBootAmountCall,
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

    const receipt = await this.l3_account.waitForTransaction(transaction_hash);
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
    console.log('-2. Declare Game Contract');
    console.log('-1. Deploy Game Contract');
    console.log('1. Declare and Deploy Game Contract');
    console.log('2. Declare and Deploy L3 Registry Contract');
    console.log('3. Declare and Deploy L2 Registry Contract');
    console.log('4. Update Block Points');
    console.log('5. Set Game Currency');
    console.log('6. Enable Game');
    console.log('7. Update Game Address on L3 Registry');
    console.log('8. Upgrade L3 Registry');
    console.log('9. Declare Bot');
    console.log('10. Upgrade Game Contract');
    console.log('11. Set Appchain Bridge');
    console.log('12. Withdraw Game Currency');
    console.log('13. Deploy Multiple Bots');
    console.log('14. Call Mine');
    console.log('15. Get Class Hash');
    console.log('16. Disable Game');
    console.log('17. Call Is Bot Alive');
    console.log('18. Exit');

  }

  async handleUserInput(input) {
    try {
      switch (input) {
        case '-2':
          await this.declareGame();
          break;
        case '-1':
          await this.deployGame();
          break;
        case '1':
          await this.declareAndDeployGameContract();
          break;
        case '2':
          await this.declareAndDeployL3RegistryContract();
          break;
        case '3':
          await this.declareAndDeployL2RegistryContract();
          break;
        case '4':
          await this.updateBlockPoints();
          break;
        case '5':
          await this.setGameCurrency();
          break;
        case '6':
          await this.enableGame();
          break;
        case '7':
          await this.updateGameAddressOnL3Registry();
          break;
        case '8':
          await this.upgradeL3Registry();
          break;
        case '9':
          await this.declareBot();
          break;
        case '10':
          await this.upgradeGameContract();
          break;
        case '11':
          await this.setAppchainBridge();
          break;
        case '12':
          await this.withdrawGameCurrency();
          break;
        case '13':
          await this.deployMultipleBots();
          break;
        case '14':
          await this.callMine();
          break;
        case '15':
          await this.getClassHash();
          break;
        case '16':
          await this.disableGame();
          break;
        case '17':
          await this.callIsBotAlive();
          break;
        case '18':
          console.log('\nExiting...');
          this.rl.close();
          process.exit(0);
          break;
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

  async declareAndDeployL3RegistryContract() {
    console.log('\n📦 Declaring and Deploying L3 Registry Contract...');
    const result = await this.deployer.declareAndDeployL3RegistryContract();
    console.log('✅ L3 Registry Contract declared and deployed successfully!');
  }

  async declareAndDeployL2RegistryContract() {
    console.log('\n📦 Declaring and Deploying L2 Registry Contract...');
    const result = await this.deployer.declareAndDeployL2RegistryContract();
    console.log('✅ L2 Registry Contract declared and deployed successfully!');
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

  async updateGameAddressOnL3Registry() {
    console.log('\n📝 Updating Game Address on L3 Registry...');
    const result = await this.deployer.updateGameAddressOnL3Registry();
    console.log('✅ Game Address updated successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async upgradeL3Registry() {
    console.log('\n📝 Upgrading L3 Registry...');
    const result = await this.deployer.upgradeL3Registry();
    console.log('✅ L3 Registry upgraded successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async updateBootAmount() {
    console.log('\n🔓 Updating Boot Amount...');
    const result = await this.deployer.updateBootAmount();
    console.log('✅ Boot Amount updated successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async setGameCurrency() {
    console.log('\n🔓 Setting Game Currency...');
    const result = await this.deployer.setGameCurrency(CONFIG.GAME.CURRENCY);
    console.log('✅ Game Currency set successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async setAppchainBridge() {
    console.log('\n🔓 Setting Appchain Bridge...');
    const result = await this.deployer.setAppchainBridge();
    console.log('✅ Appchain Bridge set successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async withdrawGameCurrency() {
    console.log('\n💰 Withdrawing Game Currency...');

    // Prompt for recipient address
    const recipientAddress = await new Promise((resolve) => {
      this.rl.question('Enter recipient address (or press Enter for default L2 account): ', (answer) => {
        resolve(answer.trim() || CONFIG.L2_ACCOUNT.ADDRESS);
      });
    });

    // Prompt for amount to withdraw
    const amount = await new Promise((resolve) => {
      this.rl.question('Enter amount to withdraw (or press Enter for default 10_000_000_000_000_000_000): ', (answer) => {
        resolve(BigInt(answer.trim()) || BigInt("1000000000000000000"));
      });
    });

    console.log(`Withdrawing to address: ${recipientAddress}`);
    const result = await this.deployer.withdrawGameCurrency(recipientAddress, amount);
    console.log('✅ Game Currency withdrawal initiated successfully!');
    console.log('Transaction Hash:', result.transaction_hash);
  }

  async upgradeGameContract() {
    console.log('\n🔓 Upgrading Game Contract...');
    const result = await this.deployer.upgradeGameContract();
    console.log('✅ Game Contract upgraded successfully!');
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



// [ 1096, 6498 ], [ 933, 4972 ],  [ 755, 6993 ]
