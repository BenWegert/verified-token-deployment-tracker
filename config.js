const abi = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    type: "function",
  },
];

const chatID = process.env.CHAT_ID;
const tgKey = process.env.TG_KEY;
const rpc = process.env.RPC;
const esKey = process.env.ES_KEY;
const debug = true;

module.exports = {
  abi,
  chatID,
  tgKey,
  rpc,
  esKey,
  debug,
};
