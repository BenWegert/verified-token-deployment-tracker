require("dotenv").config();

const { abi, chatID, tgKey, rpc, esKey, debug } = require("./config");
const RLP = require("rlp");
const axios = require("axios").default;
const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(tgKey);
const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.WebsocketProvider(rpc));
const Contract = web3.eth.Contract;

const NodeCache = require("node-cache");
const pendingContracts = new NodeCache({
  stdTTL: 60 * 60,
  checkperiod: 30,
  maxKeys: 200,
});
const deployedContracts = new NodeCache({
  stdTTL: 60 * 300,
  checkperiod: 60,
  maxKeys: 1000,
});
const timer60 = new NodeCache({
  stdTTL: 60,
  checkperiod: 1,
  maxKeys: 300,
});
const retries = new NodeCache({
  stdTTL: 1,
  checkperiod: 1,
  maxKeys: 2000,
});
const timer = new NodeCache({
  stdTTL: 10,
  checkperiod: 5,
  maxKeys: 5,
});

timer60.on("expired", (key, value) => {
  checkStatus(deployedContracts.keys());
  timer60.set("checkStatus", true);
});

timer.on("expired", (key, value) => {
  checkContracts(pendingContracts.keys());
  timer.set("checkContracts", true);
});

retries.on("expired", (key, value) => {
  scanTx(key);
});

const main = async () => {
  timer.set("checkContracts", true);
  timer60.set("checkStatus", true);

  web3.eth
    .subscribe("pendingTransactions")
    .on("connected", async () => {
      log(`[INFO]: Listening for contract verifications:`);
    })
    .on("data", async (hash) => {
      scanTx(hash);
    })
    .on("error", async (error) => {
      log("[ERROR]: " + error);
    });
};

const scanTx = async (hash) => {
  tx = await web3.eth.getTransaction(hash);

  if (tx) {
    if (tx.to == null) {
      var contractAddress =
        "0x" +
        web3.utils
          .sha3(RLP.encode([tx.from, tx.nonce]))
          .slice(12)
          .substring(14);
      pendingContracts.set(hash, contractAddress);
    }
  } else {
    var hashRetries = retries.get(hash);
    if (hashRetries == undefined) {
      try {
        retries.set(hash, 1, 1);
      } catch (error) {}
    } else if (hashRetries < 4) {
      try {
        retries.set(
          hash,
          hashRetries + 1,
          hashRetries * Math.floor(Math.random() * 4)
        );
      } catch (error) {}
    }
  }
};

const checkContracts = async (hashes) => {
  hashes.forEach(async (hash) => {
    var contractAddress = pendingContracts.get(hash);
    try {
      var code = await web3.eth.getCode(contractAddress);
    } catch (error) {
      var code = "0x";
    }

    if (code !== "0x") {
      var newContract = new Contract(abi, contractAddress);

      try {
        const [name, symbol] = await Promise.all([
          newContract.methods.name().call(),
          newContract.methods.symbol().call(),
        ]);

        if (name && symbol) {
          deployedContracts.set(contractAddress, {
            name,
            symbol,
            contractAddress,
          });
        }

        pendingContracts.del(hash);
      } catch (error) {
        pendingContracts.del(hash);
      }
    }
  });
};

const sendMessage = async (chatID, contract) => {
  var message = `<b>${contract.name} (${contract.symbol})</b> has been verified\r\n<a href="https://etherscan.io/address/${contract.contractAddress}">details</a>`;
  try {
    bot.sendMessage(chatID, message, { parse_mode: "html" });
  } catch (e) {
    console.log(e);
  }
};

const log = (message) => {
  if (debug) {
    bot.sendMessage(chatID, message, {
      parse_mode: "html",
    });
    console.log(message);
  } else console.log(message);
};

const sleep = (delay) => {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
};

axios.interceptors.response.use(
  async function (response) {
    await sleep(200);
    return response;
  },
  function (error) {
    console.error(error);
    return Promise.reject(error);
  }
);

const checkStatus = async (addresses) => {
  for (let i = 0; i < addresses.length; i++) {
    await axios
      .get(
        "https://api.etherscan.io/api?module=contract&action=getsourcecode&address=" +
          addresses[i] +
          "&apikey=" +
          esKey
      )
      .then((res) => {
        if (res.data.result[0].ABI == "Contract source code not verified") {
          //Not verified
        } else if (res.data.result[0].ABI == undefined) {
          console.log("ERROR: Too many requests");
        } else if (res.data.result[0].ABI.length > 50) {
          contract = deployedContracts.get(addresses[i]);
          console.log(contract);
          sendMessage(chatID, contract);
          deployedContracts.del(addresses[i]);
        }
      })
      .catch((er) => {
        console.log(er);
      });
  }
};

main();
